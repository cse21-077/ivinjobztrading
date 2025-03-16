import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs";

// VPS Connection Details
const VPS_HOST = process.env.VPS_HOST || "129.151.171.200";
const VPS_USERNAME = process.env.VPS_USERNAME || "ubuntu";
const VPS_PORT = parseInt(process.env.VPS_PORT || "22");
const MAX_INSTANCES = parseInt(process.env.MAX_INSTANCES || "15");

// Instance tracking
interface InstanceInfo {
  userId: string;
  symbol: string;
  timeframe: string;
  lastActive: Date;
}

const instanceMap: Record<number, InstanceInfo | null> = {};
let totalActiveUsers = 0;

// Logging helper
const logEvent = (message: string, data?: any) => {
  console.log(`[${new Date().toISOString()}] ${message}`, data ? data : '');
};

// SSH Connection with proper error handling
async function createSSHConnection(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      logEvent("SSH connection ready");
      resolve(conn);
    });

    conn.on("error", (err) => {
      logEvent("SSH connection error:", err);
      reject(err);
    });

    try {
      const privateKey = process.env.VPS_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error("SSH private key not found in environment variables");
      }

      conn.connect({
        host: VPS_HOST,
        port: VPS_PORT,
        username: VPS_USERNAME,
        privateKey: Buffer.from(privateKey, 'base64').toString('utf-8'),
        readyTimeout: 30000
      });
    } catch (error) {
      logEvent("SSH connection setup error:", error);
      reject(error);
    }
  });
}

// Update the executeCommand function to ignore Docker orphan warnings
async function executeCommand(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        logEvent("Command execution error:", err);
        return reject(err);
      }

      let output = '';
      let errorOutput = '';

      stream.on('data', (data: Buffer) => output += data.toString());
      stream.stderr.on('data', (data: Buffer) => errorOutput += data.toString());
      
      stream.on('close', () => {
        // Consider container operations successful if:
        // 1. We have regular output, or
        // 2. Error output contains expected Docker operations
        const isContainerOp = errorOutput.includes('Container') || 
                            errorOutput.includes('Starting') || 
                            errorOutput.includes('Created') ||
                            errorOutput.includes('Removing') ||
                            errorOutput.includes('Stopped');

        if (output || isContainerOp) {
          resolve(output || errorOutput);
        } else if (errorOutput) {
          logEvent("Command error output:", errorOutput);
          reject(new Error(errorOutput));
        } else {
          resolve('');
        }
      });
    });
  });
}

// Main POST handler
export async function POST(request: NextRequest) {
  const logs: string[] = [];
  let conn: Client | null = null as Client | null;

  try {
    const body = await request.json();
    const { accountId, password, server, userId, symbol, timeframe } = body;

    logEvent("Connection request received", { userId, accountId, server, symbol, timeframe });

    // Check existing connection
    const existingInstance = Object.entries(instanceMap).find(
      ([_, info]) => info && info.userId === userId
    );

    if (existingInstance) {
      const [instanceId, info] = existingInstance;
      return NextResponse.json({
        success: true,
        message: "Already connected",
        instanceId: parseInt(instanceId),
        tradingSymbol: info!.symbol,
        timeframe: info!.timeframe
      });
    }

    // Find available instance
    const instanceId = await findAvailableInstance();
    if (!instanceId) {
      const activeCount = await getActiveInstanceCount();
      return NextResponse.json(
        {
          success: false,
          message: `Server at capacity (${activeCount}/${MAX_INSTANCES} instances running)`,
          isFull: true,
          activeUsers: activeCount
        },
        { status: 503 }
      );
    }

    // Start MT5 instance
    const started = await startMT5Instance(
      instanceId,
      userId,
      accountId,
      password,
      server,
      symbol,
      timeframe || "M5"
    );

    if (!started) {
      throw new Error("Failed to start MT5 instance");
    }

    return NextResponse.json({
      success: true,
      message: "MT5 instance started successfully",
      instanceId,
      tradingSymbol: symbol,
      timeframe: timeframe || "M5"
    });

  } catch (error) {
    logEvent("Error in POST handler:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : "Internal server error"
      },
      { status: 500 }
    );
  } finally {
    if (conn) {
      try {
        conn.end();
        logEvent("SSH connection closed");
      } catch (e) {
        logEvent("Error closing SSH connection:", e);
      }
    }
  }
}

// Keep your existing helper functions (getActiveInstanceCount, findAvailableInstance, startMT5Instance)
async function getActiveInstanceCount(): Promise<number> {
  let conn: Client | null = null as Client | null;

  try {
    conn = await createSSHConnection();
    const result = await executeCommand(
      conn,
      `docker ps --filter "name=mt5-instance-" --format "{{.Names}}" | wc -l`
    );

    const count = parseInt(result.trim());
    return isNaN(count) ? 0 : count;
  } catch (error) {
    console.error("Error counting active instances:", error);
    return Object.values(instanceMap).filter(Boolean).length; // Fallback to in-memory count
  } finally {
    if (conn) conn.end();
  }
}

async function findAvailableInstance(): Promise<number | null> {
  let conn: Client | null = null as Client | null;

  try {
    conn = await createSSHConnection();

    // First check our in-memory map for available instances
    for (let i = 1; i <= MAX_INSTANCES; i++) {
      if (!instanceMap[i]) {
        // Verify with docker-compose that this instance isn't running
        const composeCheck = await executeCommand(
          conn,
          `docker ps --filter "name=mt5-instance-${i}" --format "{{.Names}}"`
        );

        if (!composeCheck.includes(`mt5-instance-${i}`)) {
          return i;
        }
      }
    }

    return null; // No available instances
  } catch (error) {
    console.error("Error finding available instance:", error);
    return null;
  } finally {
    if (conn) conn.end();
  }
}

// Update startMT5Instance to use a simpler docker-compose command
async function startMT5Instance(
  instanceId: number,
  userId: string,
  accountId: string,
  password: string,
  server: string,
  symbol: string,
  timeframe: string
): Promise<boolean> {
  let conn: Client | null = null as Client | null;

  try {
    console.log(`[${Date.now()}] Starting MT5 instance ${instanceId} for user ${userId}`);
    conn = await createSSHConnection();

    // Path for instance-specific docker-compose file
    const composeFilePath = `/home/ubuntu/phase1-compose/docker-compose-${instanceId}.yml`;

    // Create MT5-login.ini file content
    const iniContent = `
[Common]
Login=${accountId}
Password=${password}
Server=${server}

[Trading]
Symbol=${symbol}
TimeFrame=${timeframe || "M5"}
`.trim();

    // Path inside the container where the file will be placed
    const containerIniPath = "/root/.mt5/drive_c/Program Files/MetaTrader 5/MQL5/Files/MT5-login.ini";

    // Create a temporary file with the content on the VPS
    const tempFilePath = `/tmp/mt5-login-${instanceId}.ini`;
    console.log(`[${Date.now()}] Creating config file for instance ${instanceId}`);

    // Write the ini file using our new method
    const iniWriteSuccess = await writeFileToVPS(conn, iniContent, tempFilePath);
    if (!iniWriteSuccess) {
      throw new Error(`Failed to write INI file to ${tempFilePath}`);
    }

    // Generate docker-compose.yml content with version
    const composeContent = `
version: '3'
services:
  mt5-instance-${instanceId}:
    image: mt5-image:v1
    container_name: mt5-instance-${instanceId}
    volumes:
      - ${tempFilePath}:${containerIniPath}
    restart: unless-stopped
    command: ./start_mt5.sh
`.trim();

    // Write the docker-compose.yml file using our new method
    console.log(`[${Date.now()}] Creating docker-compose file for instance ${instanceId}`);
    const composeWriteSuccess = await writeFileToVPS(conn, composeContent, composeFilePath);
    if (!composeWriteSuccess) {
      throw new Error(`Failed to write compose file to ${composeFilePath}`);
    }

    // Use simpler docker compose command
    console.log(`[${Date.now()}] Starting docker container for instance ${instanceId}`);
    await executeCommand(
      conn,
      `cd /home/ubuntu/phase1-compose && docker compose -f docker-compose-${instanceId}.yml up -d`
    );

    // Store instance info in our map
    instanceMap[instanceId] = {
      userId,
      symbol,
      timeframe,
      lastActive: new Date()
    };

    totalActiveUsers = Object.values(instanceMap).filter(Boolean).length;
    console.log(`[${Date.now()}] MT5 instance ${instanceId} started successfully`);

    return true;
  } catch (error) {
    console.error(`[${Date.now()}] Error starting MT5 instance ${instanceId}:`, error);
    return false;
  } finally {
    if (conn) conn.end();
  }
}

async function writeFileToVPS(conn: Client, content: string, filePath: string): Promise<boolean> {
  try {
    console.log(`[${Date.now()}] Writing file to ${filePath}`);

    // Use echo with base64 encoding to avoid here-document issues
    const base64Content = Buffer.from(content).toString('base64');
    const command = `echo '${base64Content}' | base64 -d > ${filePath}`;

    await executeCommand(conn, command);
    console.log(`[${Date.now()}] File written successfully to ${filePath}`);
    return true;
  } catch (error) {
    console.error(`[${Date.now()}] Error writing file to ${filePath}:`, error);
    return false;
  }
}
