import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";

// VPS Connection Details
const VPS_HOST = process.env.VPS_HOST || "129.151.171.200";
const VPS_USERNAME = process.env.VPS_USERNAME || "ubuntu";
const VPS_PORT = parseInt(process.env.VPS_PORT || "22");
const VPS_PRIVATE_KEY_PATH = path.join(process.cwd(), "lib", "ssh-key-2025-03-02.key");

interface InstanceInfo {
  userId: string;
  symbol: string;
  timeframe: string;
  lastActive: Date;
}

const instanceMap: Record<number, InstanceInfo | null> = {};

async function createSSHConnection(retries = 3): Promise<Client> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const conn = new Client();
        
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error('SSH connection timeout'));
        }, 10000); // 10 second timeout

        conn.on("ready", () => {
          clearTimeout(timeout);
          resolve(conn);
        })
        .on("error", (err) => {
          clearTimeout(timeout);
          console.error(`SSH attempt ${attempt}/${retries} failed:`, err);
          reject(err);
        })
        .connect({
          host: VPS_HOST,
          port: VPS_PORT,
          username: VPS_USERNAME,
          privateKey: fs.readFileSync(VPS_PRIVATE_KEY_PATH),
          readyTimeout: 10000,
          keepaliveInterval: 5000
        });
      });
    } catch (error) {
      if (attempt === retries) throw error;
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error('Failed to establish SSH connection after retries');
}

async function executeCommand(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);

      let output = '';
      let errorOutput = '';

      stream.on('data', (data: Buffer) => output += data.toString())
           .stderr.on('data', (data: Buffer) => errorOutput += data.toString())
           .on('close', () => {
             if (errorOutput) console.warn("Command stderr:", errorOutput);
             resolve(output); // Always resolve unless critical error
           });
    });
  });
}

async function stopMT5Instance(instanceId: number): Promise<boolean> {
  let conn: Client | null = null;

  try {
    conn = await createSSHConnection();
    console.log(`SSH connection established for instance ${instanceId}`);

    // Check if container exists first
    const containerExists = await executeCommand(
      conn,
      `docker ps -a -q -f name=mt5-instance-${instanceId}`
    );

    if (!containerExists) {
      console.log(`Container mt5-instance-${instanceId} not found, considering it stopped`);
      return true;
    }

    // Get network name to check dependencies
    const networkName = `phase1-compose_default`;
    
    // First check for any containers using the network
    const networkCheck = await executeCommand(
      conn,
      `docker network inspect ${networkName} -f '{{range .Containers}}{{.Name}} {{end}}'`
    );

    // Stop the specific MT5 instance first
    await executeCommand(
      conn,
      `docker stop mt5-instance-${instanceId} || true`
    );

    await executeCommand(
      conn,
      `docker rm -f mt5-instance-${instanceId} || true`
    );

    const composeFile = `/home/ubuntu/phase1-compose/docker-compose-${instanceId}.yml`;
    
    // Force remove containers but handle network separately
    await executeCommand(
      conn,
      `cd /home/ubuntu/phase1-compose && ` +
      `COMPOSE_PROJECT_NAME=mt5-${instanceId} docker compose -f ${composeFile} down --volumes --timeout 60`
    );

    // Cleanup compose file
    await executeCommand(conn, `rm -f ${composeFile}`);

    // Try to remove network if no other containers are using it
    if (!networkCheck.includes(`mt5-instance-`)) {
      await executeCommand(
        conn,
        `docker network rm ${networkName} || true`
      );
    }
    
    console.log(`Successfully stopped instance ${instanceId}`);
    return true;
  } catch (error) {
    if ((error as any).code === 'ECONNRESET') {
      console.error(`SSH connection reset for instance ${instanceId}, retrying...`);
      // Wait a bit and try one more time
      await new Promise(resolve => setTimeout(resolve, 5000));
      return stopMT5Instance(instanceId);
    }
    console.error(`Error stopping instance ${instanceId}:`, error);
    return false;
  } finally {
    if (conn) {
      try {
        conn.end();
      } catch (error) {
        console.error('Error closing SSH connection:', error);
      }
    }
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { instanceId, userId } = body;
    
    if (!instanceId || !userId) {
      return NextResponse.json(
        { success: false, message: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Force recreate instance info if it doesn't exist
    if (!instanceMap[instanceId]) {
      instanceMap[instanceId] = {
        userId,
        symbol: body.symbol || 'unknown',
        timeframe: body.timeframe || 'unknown',
        lastActive: new Date()
      };
    }

    const instance = instanceMap[instanceId];
    
    try {
      const success = await stopMT5Instance(instanceId);
      
      if (success) {
        // Clear instance from map
        instanceMap[instanceId] = null;
        
        return NextResponse.json({ 
          success: true, 
          message: "Instance stopped successfully" 
        });
      }
      
      throw new Error('Failed to stop instance');
    } catch (error) {
      console.error('Stop instance error:', error);
      return NextResponse.json(
        { success: false, message: (error as Error).message || "Failed to stop instance" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Disconnect error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}