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

// Timeout values
const SSH_TIMEOUT = 45000;    // 45 seconds
const COMMAND_TIMEOUT = 30000; // 30 seconds
const REQUEST_TIMEOUT = 45000; // 45 seconds (match Netlify timeout)

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
    let timeoutId: NodeJS.Timeout;

    // Add connection timeout
    timeoutId = setTimeout(() => {
      conn.end();
      reject(new Error("SSH connection timeout after 20 seconds"));
    }, 20000);

    conn.on("ready", () => {
      clearTimeout(timeoutId);
      logEvent("SSH connection ready");
      resolve(conn);
    });

    conn.on("error", (err) => {
      clearTimeout(timeoutId);
      logEvent("SSH connection error:", err);
      reject(err);
    });

    try {
      const privateKey = process.env.VPS_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error("SSH private key not found");
      }

      // Fixed SSH connection config
      conn.connect({
        host: VPS_HOST,
        port: VPS_PORT,
        username: VPS_USERNAME,
        privateKey: Buffer.from(privateKey, 'base64').toString('utf-8'),
        readyTimeout: 20000,
        keepaliveInterval: 10000,
        debug: (debug) => console.log('SSH Debug:', debug),
        algorithms: {
          kex: [
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha1'
          ]
        }
      });
    } catch (error) {
      clearTimeout(timeoutId);
      logEvent("SSH connection setup error:", error);
      reject(error);
    }
  });
}

// Update the executeCommand function to ignore Docker orphan warnings
async function executeCommand(conn: Client, command: string): Promise<string> {
  console.log('Executing command:', command.slice(0, 100) + '...');
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Command timed out after ${COMMAND_TIMEOUT/1000} seconds`));
    }, COMMAND_TIMEOUT);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timeoutId);
        logEvent("Command execution error:", err);
        return reject(err);
      }

      let output = '';
      let errorOutput = '';

      stream.on('data', (data: Buffer) => output += data.toString());
      stream.stderr.on('data', (data: Buffer) => errorOutput += data.toString());
      
      stream.on('close', () => {
        clearTimeout(timeoutId);
        const isContainerOp = errorOutput.includes('Container') || 
                            errorOutput.includes('Starting') || 
                            errorOutput.includes('Created');
        
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

async function executeWithRetry<T>(
  operation: () => Promise<T>, 
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`Retry ${i + 1}/${retries}:`, error);
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Retry failed');
}

// Main POST handler
export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('=== MT5 Connection Process Started ===');
  const logs: string[] = [];
  let conn: Client | null = null as Client | null;

  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout after 45 seconds')), REQUEST_TIMEOUT)
    );

    const connectionPromise = (async () => {
      console.log('1. Parsing request body...');
      const body = await request.json();
      console.log('2. Full request details:', { 
        ...body,  // Show all details including password for debugging
        timestamp: new Date().toISOString(),
        headers: Object.fromEntries(request.headers.entries())
      });

      const { accountId, password, server, userId, symbol, timeframe } = body;

      // Add validation logging
      console.log('3. Validating input:', {
        hasAccountId: !!accountId,
        hasPassword: !!password,
        hasServer: !!server,
        hasUserId: !!userId,
        hasSymbol: !!symbol,
        hasTimeframe: !!timeframe
      });

      logEvent("Connection request received", { userId, accountId, server, symbol, timeframe });

      // Add before SSH connection
      console.log('4. SSH Connection details:', {
        host: VPS_HOST,
        port: VPS_PORT,
        username: VPS_USERNAME,
        hasPrivateKey: !!process.env.VPS_PRIVATE_KEY,
        readyTimeout: 30000
      });

      // Add before instance check
      console.log('3. Checking for existing instance...');
      const existingInstance = Object.entries(instanceMap).find(
        ([_, info]) => info && info.userId === userId
      );
      console.log('4. Existing instance check result:', existingInstance);

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

      // Add before findAvailableInstance
      console.log('5. Looking for available instance...');
      const instanceId = await findAvailableInstance();
      console.log('6. Available instance result:', instanceId);

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

      // Add to startMT5Instance
      console.log('5. Starting MT5 instance with config:', {
        instanceId,
        accountId,
        server,
        symbol,
        timeframe,
        tempFilePath: `/tmp/mt5-login-${instanceId}.ini`,
        composePath: `/home/ubuntu/phase1-compose/docker-compose-${instanceId}.yml`
      });

      // Add before startMT5Instance
      console.log('7. Attempting to start MT5 instance:', instanceId);
      const started = await startMT5Instance(
        instanceId,
        userId,
        accountId,
        password,
        server,
        symbol,
        timeframe || "M5"
      );
      console.log('8. MT5 start result:', started);

      if (!started) {
        return NextResponse.json(
          { 
            success: false, 
            message: "Failed to start MT5 instance",
            logs 
          },
          { status: 500 }
        );
      }

      // Add at the end of try block
      console.log('9. Connection process completed successfully');

      return NextResponse.json({
        success: true,
        message: "MT5 instance started successfully",
        instanceId,
        tradingSymbol: symbol,
        timeframe: timeframe || "M5",
        logs
      });
    })();

    // Important: Return the result of Promise.race
    return await Promise.race([connectionPromise, timeoutPromise]) as NextResponse;

  } catch (error) {
    const errorDetails = {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      requestId: request.headers.get('x-nf-request-id') || undefined
    };

    console.error('Connection Error Details:', errorDetails);

    return NextResponse.json(
      { 
        success: false, 
        message: errorDetails.message,
        error: errorDetails,
        logs
      },
      { status: error instanceof Error && error.message.includes('timeout') ? 504 : 500 }
    );
  } finally {
    if (conn) {
      try {
        await new Promise<void>((resolve) => {
          conn?.end();
          setTimeout(resolve, 1000); // Give connection time to close
        });
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
  console.log(`🔄 MT5 Instance ${instanceId} - Start Process`);
  console.log(`📝 Config Details:`, {
    instanceId,
    userId,
    server,
    symbol,
    timeframe
  });

  let conn: Client | null = null as Client | null;

  try {
    console.log(`[${Date.now()}] Starting MT5 instance ${instanceId} for user ${userId}`);
    console.log('1️⃣ Creating SSH connection...');
    conn = await createSSHConnection();
    
    if (!conn) {
      throw new Error("Failed to establish SSH connection");
    }

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
    console.log('2️⃣ Preparing config files...');

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
    console.log('3️⃣ Starting Docker container...');
    await executeWithRetry(() => executeCommand(conn as Client, `cd /home/ubuntu/phase1-compose && docker compose -f docker-compose-${instanceId}.yml up -d`));

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
    console.error('❌ MT5 Instance Start Error:', {
      instanceId,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return false;
  } finally {
    if (conn) conn.end();
  }
}

async function writeFileToVPS(conn: Client, content: string, filePath: string): Promise<boolean> {
  try {
    console.log(`[${Date.now()}] Writing file to ${filePath}`);

    // Split large files into smaller chunks
    const maxChunkSize = 4096;
    const base64Content = Buffer.from(content).toString('base64');
    
    if (base64Content.length > maxChunkSize) {
      // Write in chunks for large files
      const tempFile = `/tmp/temp_${Date.now()}.txt`;
      for (let i = 0; i < base64Content.length; i += maxChunkSize) {
        const chunk = base64Content.slice(i, i + maxChunkSize);
        await executeCommand(conn, `echo '${chunk}' >> ${tempFile}`);
      }
      await executeCommand(conn, `cat ${tempFile} | base64 -d > ${filePath} && rm ${tempFile}`);
    } else {
      // Direct write for small files
      await executeCommand(conn, `echo '${base64Content}' | base64 -d > ${filePath}`);
    }

    console.log(`[${Date.now()}] File written successfully to ${filePath}`);
    return true;
  } catch (error) {
    console.error(`[${Date.now()}] Error writing file to ${filePath}:`, error);
    return false;
  }
}
