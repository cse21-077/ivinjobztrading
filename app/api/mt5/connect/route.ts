import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";

// VPS Connection Details (Consider moving these to environment variables)
const VPS_HOST = process.env.VPS_HOST || "129.151.171.200";
const VPS_USERNAME = process.env.VPS_USERNAME || "ubuntu";
const VPS_PORT = parseInt(process.env.VPS_PORT || "22");
const MAX_INSTANCES = parseInt(process.env.MAX_INSTANCES || "15"); // Reduced to 15 instances

// Use absolute path to locate the SSH key
const VPS_PRIVATE_KEY_PATH = path.join(process.cwd(), "lib", "ssh-key-2025-03-02.key");

// In-memory store to track active instances and their users
interface InstanceInfo {
  userId: string;
  symbol: string;
  timeframe: string;
  lastActive: Date;
}

// Global state management
const instanceMap: Record<number, InstanceInfo | null> = {};
let totalActiveUsers = 0;

/**
 * Establishes an SSH connection to the VPS
 */
async function createSSHConnection(): Promise<Client> {
  return new Promise((resolve, reject) => {
    try {
      const conn = new Client();
      
      conn.on("ready", () => {
        resolve(conn);
      });

      conn.on("error", (err) => {
        console.error("SSH error:", err);
        reject(err);
      });

      const privateKey = Buffer.from(process.env.VPS_PRIVATE_KEY || '', 'base64').toString('utf-8');
      
      conn.connect({
        host: process.env.VPS_HOST,
        username: process.env.VPS_USERNAME,
        port: parseInt(process.env.VPS_PORT || '22'),
        privateKey,
        readyTimeout: 10000
      });

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Executes a command on the VPS via SSH
 */
async function executeCommand(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);

      let output = '';
      let errorOutput = '';

      stream.on('data', (data: Buffer) => {
        output += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      stream.on('close', () => {
        if (errorOutput) {
          console.warn('Command stderr:', errorOutput); // Log warnings but don't fail
        }
        resolve(output); // Always resolve if we get here
      });
    });
  });
}

/**
 * Get total count of active MT5 instances
 */
async function getActiveInstanceCount(): Promise<number> {
  let conn: Client | null = null;

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

/**
 * Find an available MT5 instance on the VPS
 */
async function findAvailableInstance(): Promise<number | null> {
  let conn: Client | null = null;

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

/**
 * Write file content to the VPS using base64 encoding
 */
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

/**
 * Start a specific MT5 instance with user configuration
 */
async function startMT5Instance(
  instanceId: number,
  userId: string,
  accountId: string,
  password: string,
  server: string,
  symbol: string,
  timeframe: string
): Promise<boolean> {
  let conn: Client | null = null;

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

    // Generate docker-compose.yml content
    const composeContent = `
    services:
      mt5-instance-${instanceId}:
        image: mt5-image:v1
        container_name: mt5-instance-${instanceId}
        volumes:
          - ${tempFilePath}:${containerIniPath}
        restart: unless-stopped
        command: /home/trader/start_mt5.sh  # Absolute path
    `.trim();

    // Write the docker-compose.yml file using our new method
    console.log(`[${Date.now()}] Creating docker-compose file for instance ${instanceId}`);
    const composeWriteSuccess = await writeFileToVPS(conn, composeContent, composeFilePath);
    if (!composeWriteSuccess) {
      throw new Error(`Failed to write compose file to ${composeFilePath}`);
    }

    // Start the instance using docker-compose
    console.log(`[${Date.now()}] Starting docker container for instance ${instanceId}`);
    await executeCommand(
      conn,
      `cd /home/ubuntu/phase1-compose && docker compose -f docker-compose-${instanceId}.yml up -d`
    );
    // Notice the space between "docker" and "compose" - this is intentional ✅

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

/**
 * API handler for connecting to MT5
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, password, server, userId, symbol, timeframe } = body;

    console.log("Received connection request for:", { userId, accountId, server, symbol, timeframe });

    // Validation
    if (!accountId || !password || !server || !userId || !symbol) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if this user already has an active instance
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

    // Find an available instance
    const availableInstanceId = await findAvailableInstance();

    if (availableInstanceId === null) {
      const activeCount = await getActiveInstanceCount();
      return NextResponse.json(
        {
          success: false,
          message: `The Arm Server is currently full, please try again later. Active users: ${activeCount}/${MAX_INSTANCES}`,
          isFull: true,
          activeUsers: activeCount
        },
        { status: 503 }
      );
    }

    // Start the MT5 instance
    const success = await startMT5Instance(
      availableInstanceId,
      userId,
      accountId,
      password,
      server,
      symbol,
      timeframe
    );

    if (success) {
      return NextResponse.json({
        success: true,
        message: "MT5 instance started successfully",
        instanceId: availableInstanceId,
        tradingSymbol: symbol,
        timeframe: timeframe || "M5"
      });
    } else {
      return NextResponse.json(
        { success: false, message: "Failed to start MT5 instance" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("MT5 connect error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
