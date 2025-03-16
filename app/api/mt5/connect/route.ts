import { NextRequest, NextResponse } from "next/server";
import { Client, ClientChannel } from "ssh2";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs"; // Force Node.js runtime instead of Edge

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

// Add logging helper
const logEvent = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logMessage = data ? 
    `[${timestamp}] ${message}: ${JSON.stringify(data)}` :
    `[${timestamp}] ${message}`;
  console.log(logMessage);
  return logMessage; // Return for response logging
};

/**
 * Establishes an SSH connection to the VPS
 */
const createSSHConnection = async (): Promise<Client> => {
  return new Promise((resolve, reject) => {
    logEvent("Creating SSH connection");
    const conn = new Client();

    conn.on("ready", () => {
      logEvent("SSH connection ready");
      resolve(conn);
    });

    conn.on("error", (err: Error & { code?: string }) => {
      logEvent("SSH connection error", {
        error: err.message,
        stack: err.stack,
        code: err.code || 'unknown'  // Add fallback for code
      });
      reject(err);
    });

    try {
      // Log environment variables (excluding private key)
      logEvent("Connection config", {
        host: process.env.VPS_HOST,
        username: process.env.VPS_USERNAME,
        port: process.env.VPS_PORT,
        hasPrivateKey: !!process.env.VPS_PRIVATE_KEY
      });

      if (!process.env.VPS_PRIVATE_KEY) {
        throw new Error('Missing private key');
      }

      const privateKey = Buffer.from(process.env.VPS_PRIVATE_KEY, 'base64').toString('utf-8');
      
      // Log key format check (safely)
      logEvent("Private key check", {
        hasBeginMarker: privateKey.includes('BEGIN RSA PRIVATE KEY'),
        hasEndMarker: privateKey.includes('END RSA PRIVATE KEY'),
        keyLength: privateKey.length,
        isBase64: /^[A-Za-z0-9+/=]+$/.test(process.env.VPS_PRIVATE_KEY)
      });

      conn.connect({
        host: process.env.VPS_HOST,
        username: process.env.VPS_USERNAME,
        port: parseInt(process.env.VPS_PORT || '22'),
        privateKey,
        debug: (msg) => logEvent("SSH Debug", { message: msg }),
        readyTimeout: 30000 // Increase timeout to 30 seconds
      });
    } catch (error) {
      const err = error as Error;
      logEvent("SSH connection setup error", {
        message: err.message,
        stack: err.stack,
        type: err.name
      });
      reject(error);
    }
  });
};

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
  const logs: string[] = [];
  try {
    logs.push(logEvent("Received POST request"));

    // Log request details
    const url = request.url;
    const headers = Object.fromEntries(request.headers);
    logs.push(logEvent("Request details", { url, headers }));

    const body = await request.json();
    logs.push(logEvent("Request body", {
      ...body,
      password: '[REDACTED]' // Don't log sensitive data
    }));

    const { accountId, password, server, userId, symbol, timeframe } = body;

    // Validation
    if (!accountId || !password || !server || !userId || !symbol) {
      logs.push(logEvent("Validation failed - Missing fields"));
      return NextResponse.json(
        { 
          success: false, 
          message: "Missing required fields",
          logs 
        },
        { status: 400 }
      );
    }

    // Test SSH connection
    logs.push(logEvent("Testing SSH connection"));
    const conn = await createSSHConnection();
    
    // Try a simple command
    const testResult = await new Promise<string>((resolve, reject) => {
      conn.exec('echo "test connection"', (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          logs.push(logEvent("SSH exec error", { error: err.message }));
          reject(err);
          return;
        }

        let data = '';
        stream.on('data', (chunk: Buffer) => data += chunk);
        stream.on('end', () => resolve(data.toString().trim()));
        stream.on('error', (err: Error) => {
          logs.push(logEvent("SSH stream error", { error: err.message }));
          reject(err);
        });
      });
    });

    logs.push(logEvent("SSH test result", { output: testResult }));

    return NextResponse.json({ 
      success: true, 
      message: "Connection successful",
      test: testResult,
      logs
    });

  } catch (error) {
    const err = error as Error;
    logs.push(logEvent("Error in POST handler", {
      message: err.message,
      stack: err.stack,
      type: err.name
    }));

    return NextResponse.json(
      { 
        success: false, 
        message: "Connection failed",
        error: err.message,
        logs
      },
      { status: 500 }
    );
  }
}
