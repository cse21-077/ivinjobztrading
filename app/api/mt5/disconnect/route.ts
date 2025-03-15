// File: disconnect.ts
import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";

// VPS Connection Details (Consider moving these to environment variables)
const VPS_HOST = process.env.VPS_HOST || "129.151.171.200";
const VPS_USERNAME = process.env.VPS_USERNAME || "ubuntu";
const VPS_PORT = parseInt(process.env.VPS_PORT || "22");

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
 * Stop and release a specific MT5 instance
 */
async function stopMT5Instance(instanceId: number): Promise<boolean> {
  let conn: Client | null = null;

  try {
    conn = await createSSHConnection();
    await executeCommand(conn, `docker stop mt5-instance-${instanceId} && docker rm mt5-instance-${instanceId}`);

    // Clear from our instance map
    instanceMap[instanceId] = null;
    totalActiveUsers = Object.values(instanceMap).filter(Boolean).length;

    return true;
  } catch (error) {
    console.error(`Error stopping MT5 instance ${instanceId}:`, error);
    return false;
  } finally {
    if (conn) conn.end();
  }
}

/**
 * API handler for disconnecting from MT5
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { instanceId, userId } = body;

    if (!instanceId || !userId) {
      return NextResponse.json(
        { success: false, message: "Missing instanceId or userId" },
        { status: 400 }
      );
    }

    // Verify this instance belongs to the requesting user
    const instance = instanceMap[instanceId];
    if (!instance || instance.userId !== userId) {
      return NextResponse.json(
        { success: false, message: "Invalid instance or unauthorized" },
        { status: 403 }
      );
    }

    const success = await stopMT5Instance(instanceId);

    if (success) {
      return NextResponse.json({
        success: true,
        message: "MT5 instance stopped successfully"
      });
    } else {
      return NextResponse.json(
        { success: false, message: "Failed to stop MT5 instance" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("MT5 disconnect error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
