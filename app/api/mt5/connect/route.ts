import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";

// VPS Connection Details (Consider moving these to environment variables)
const VPS_HOST = process.env.VPS_HOST || "129.151.171.200";
const VPS_USERNAME = process.env.VPS_USERNAME || "ubuntu";
const VPS_PORT = parseInt(process.env.VPS_PORT || "22");
const MAX_INSTANCES = parseInt(process.env.MAX_INSTANCES || "30");

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
        console.error("SSH connection error:", err);
        reject(err);
      });

      // Read private key and establish connection
      try {
        const privateKey = fs.readFileSync(VPS_PRIVATE_KEY_PATH);
        conn.connect({
          host: VPS_HOST,
          port: VPS_PORT,
          username: VPS_USERNAME,
          privateKey: privateKey,
        });
      } catch (err) {
        reject(new Error(`Failed to read private key at ${VPS_PRIVATE_KEY_PATH}: ${err}`));
      }
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
        if (errorOutput && !output) {
          reject(new Error(errorOutput));
        } else {
          resolve(output);
        }
      });
    });
  });
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
    conn = await createSSHConnection();

    // Path for instance-specific docker-compose file
    const composeFilePath = `/home/ubuntu/mt5-instances/docker-compose-${instanceId}.yml`;

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
    const containerIniPath = "/root/.wine/drive_c/Program Files/MetaTrader 5/MQL5/Files/MT5-login.ini";

    // Create a temporary file with the content on the VPS
    const tempFilePath = `/tmp/mt5-login-${instanceId}.ini`;
    await executeCommand(conn, `cat > ${tempFilePath} << 'EOL'
${iniContent}
EOL`);

    // Generate docker-compose.yml content
    const composeContent = `
version: '3'
services:
  mt5-instance-${instanceId}:
    image: local-mt5-image:latest
    container_name: mt5-instance-${instanceId}
    volumes:
      - ${tempFilePath}:${containerIniPath}
    restart: unless-stopped
`.trim();

    // Write the docker-compose.yml file to the VPS
    await executeCommand(conn, `cat > ${composeFilePath} << 'EOL'
${composeContent}
EOL`);

    // Start the instance using docker-compose
    await executeCommand(conn, `cd /home/ubuntu/mt5-instances && docker-compose -p mt5-instance-${instanceId} up -d`);

    // Store instance info in our map
    instanceMap[instanceId] = {
      userId,
      symbol,
      timeframe,
      lastActive: new Date()
    };

    totalActiveUsers = Object.values(instanceMap).filter(Boolean).length;

    return true;
  } catch (error) {
    console.error(`Error starting MT5 instance ${instanceId}:`, error);
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