import { EC2Client, StartInstancesCommand, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";

export class VPSService {
  private ec2Client: EC2Client;
  private ssmClient: SSMClient;
  private instanceId: string;

  constructor() {
    this.ec2Client = new EC2Client({
      region: process.env.VPS_REGION,
      credentials: {
        accessKeyId: process.env.VPS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.VPS_SECRET_ACCESS_KEY!
      }
    });

    this.ssmClient = new SSMClient({
      region: process.env.VPS_REGION,
      credentials: {
        accessKeyId: process.env.VPS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.VPS_SECRET_ACCESS_KEY!
      }
    });

    this.instanceId = process.env.VPS_INSTANCE_ID!;
  }

  private async checkInstanceStatus(): Promise<'running' | 'stopped' | 'pending' | 'error'> {
    try {
      const command = new DescribeInstancesCommand({
        InstanceIds: [this.instanceId]
      });
      const response = await this.ec2Client.send(command);
      const state = response.Reservations?.[0]?.Instances?.[0]?.State?.Name;
      return state as 'running' | 'stopped' | 'pending' | 'error';
    } catch (error) {
      console.error('Failed to check instance status:', error);
      throw new Error('Failed to check instance status');
    }
  }

  async startVPS() {
    try {
      console.log('Checking VPS status...');
      const status = await this.checkInstanceStatus();
      
      if (status === 'running') {
        console.log('VPS is already running');
        return true;
      }

      if (status === 'stopped') {
        console.log('Starting VPS...');
        const command = new StartInstancesCommand({
          InstanceIds: [this.instanceId]
        });
        await this.ec2Client.send(command);
        
        // Wait for instance to be running
        let attempts = 0;
        while (attempts < 30) {
          const currentStatus = await this.checkInstanceStatus();
          if (currentStatus === 'running') {
            console.log('VPS started successfully');
            return true;
          }
          if (currentStatus === 'error') {
            throw new Error('VPS failed to start');
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
        }
        throw new Error('VPS start timeout');
      }

      throw new Error(`VPS is in an invalid state: ${status}`);
    } catch (error) {
      console.error('Failed to start VPS:', error);
      throw new Error('Failed to start VPS instance');
    }
  }

  async connectToMetaTrader(credentials: {
    server: string;
    login: string;
    password: string;
    eaName: string;
    pairs: string[];
  }) {
    try {
      console.log('Preparing MetaTrader connection...');
      
      // First, ensure MT5 is not already running
      const stopCommand = new SendCommandCommand({
        InstanceIds: [this.instanceId],
        DocumentName: "AWS-RunPowerShellScript",
        Parameters: {
          commands: [
            `Get-Process -Name "terminal64" -ErrorAction SilentlyContinue | Stop-Process -Force`,
            `Get-Process -Name "mt5" -ErrorAction SilentlyContinue | Stop-Process -Force`,
            `Start-Sleep -Seconds 2` // Wait for processes to stop
          ]
        }
      });
      await this.ssmClient.send(stopCommand);
      console.log('Stopped any existing MT5 processes');

      // Verify EA file exists
      const checkCommand = new SendCommandCommand({
        InstanceIds: [this.instanceId],
        DocumentName: "AWS-RunPowerShellScript",
        Parameters: {
          commands: [
            `$mt5Path = "C:\\Program Files\\MetaTrader 5\\terminal64.exe"`,
            `$eaPath = "C:\\Program Files\\MetaTrader 5\\MQL5\\Experts\\${credentials.eaName}.ex5"`,
            `if (!(Test-Path $eaPath)) { throw "EA file not found at $eaPath" }`,
            `if (!(Test-Path $mt5Path)) { throw "MetaTrader 5 not found at $mt5Path" }`
          ]
        }
      });
      await this.ssmClient.send(checkCommand);

      // Start MT5 with the EA
      const startCommand = new SendCommandCommand({
        InstanceIds: [this.instanceId],
        DocumentName: "AWS-RunPowerShellScript",
        Parameters: {
          commands: [
            `$mt5Path = "C:\\Program Files\\MetaTrader 5\\terminal64.exe"`,
            `Write-Host "Starting MetaTrader 5..."`,
            `Start-Process -FilePath $mt5Path -ArgumentList "/login:${credentials.login} /password:${credentials.password} /server:${credentials.server} /port:443 /ea:${credentials.eaName} /pairs:${credentials.pairs.join(',')}"`,
            `Start-Sleep -Seconds 10`,
            `$process = Get-Process terminal64 -ErrorAction SilentlyContinue`,
            `if (!$process) { throw "MetaTrader 5 failed to start" }`,
            `Write-Host "MetaTrader 5 started successfully with process ID: $($process.Id)"`
          ]
        }
      });

      console.log('Sending start command to VPS...');
      const response = await this.ssmClient.send(startCommand);
      console.log('Received response from VPS:', response);

      if (response.Command?.Status === 'Success') {
        return response;
      } else {
        throw new Error('Failed to start MetaTrader');
      }
    } catch (error) {
      console.error('Failed to connect to MetaTrader:', error);
      throw new Error('Failed to connect to MetaTrader');
    }
  }

  async stopTrading() {
    try {
      console.log('Stopping trading...');
      const command = new SendCommandCommand({
        InstanceIds: [this.instanceId],
        DocumentName: "AWS-RunPowerShellScript",
        Parameters: {
          commands: [
            `Write-Host "Stopping MetaTrader processes..."`,
            `Get-Process -Name "terminal64" -ErrorAction SilentlyContinue | Stop-Process -Force`,
            `Get-Process -Name "mt5" -ErrorAction SilentlyContinue | Stop-Process -Force`,
            `Write-Host "Trading stopped successfully"`
          ]
        }
      });

      const response = await this.ssmClient.send(command);
      console.log('Stop trading response:', response);
      return true;
    } catch (error) {
      console.error('Failed to stop trading:', error);
      throw new Error('Failed to stop trading');
    }
  }
} 