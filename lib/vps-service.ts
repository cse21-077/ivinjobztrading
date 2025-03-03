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
        
        try {
          await this.ec2Client.send(command);
          console.log('Start command sent successfully');
        } catch (startError: any) {
          console.error('Error sending start command:', {
            error: startError.message,
            code: startError.code,
            requestId: startError.$metadata?.requestId
          });
          throw new Error(`Failed to start VPS: ${startError.message}`);
        }
        
        // Wait for instance to be running
        let attempts = 0;
        while (attempts < 30) {
          console.log(`Checking status attempt ${attempts + 1}/30...`);
          const currentStatus = await this.checkInstanceStatus();
          console.log(`Current status: ${currentStatus}`);
          
          if (currentStatus === 'running') {
            console.log('VPS started successfully');
            return true;
          }
          if (currentStatus === 'error') {
            throw new Error('VPS failed to start: Instance entered error state');
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
        }
        throw new Error('VPS start timeout: Instance did not enter running state within 60 seconds');
      }

      throw new Error(`VPS is in an invalid state: ${status}`);
    } catch (error: any) {
      console.error('Failed to start VPS:', {
        error: error.message,
        code: error.code,
        metadata: error.$metadata,
        stack: error.stack
      });
      throw error; // Preserve the original error
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
      console.log('MT5 connection details:', {
        server: credentials.server,
        login: credentials.login,
        eaName: credentials.eaName,
        pairsCount: credentials.pairs.length
      });
      
      // First, ensure MT5 is not already running
      const stopCommand = new SendCommandCommand({
        InstanceIds: [this.instanceId],
        DocumentName: "AWS-RunPowerShellScript",
        Parameters: {
          commands: [
            `Write-Host "Stopping any existing MT5 instances..."`,
            `Get-Process -Name "terminal64" -ErrorAction SilentlyContinue | Stop-Process -Force`,
            `Get-Process -Name "mt5" -ErrorAction SilentlyContinue | Stop-Process -Force`,
            `Start-Sleep -Seconds 2`, // Wait for processes to stop
            `Write-Host "Cleanup complete."`
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
            `Write-Host "Checking for MT5 at: $mt5Path"`,
            `Write-Host "Checking for EA at: $eaPath"`,
            `if (!(Test-Path $eaPath)) { 
              Write-Host "EA not found at $eaPath" -ForegroundColor Red
              throw "EA file not found at $eaPath" 
            } else { 
              Write-Host "EA file found successfully" -ForegroundColor Green 
            }`,
            `if (!(Test-Path $mt5Path)) { 
              Write-Host "MT5 not found at $mt5Path" -ForegroundColor Red
              throw "MetaTrader 5 not found at $mt5Path" 
            } else { 
              Write-Host "MT5 found successfully" -ForegroundColor Green 
            }`
          ]
        }
      });
      await this.ssmClient.send(checkCommand);
      console.log('Verified MT5 and EA exist on VPS');

      // Prepare pairs string for MT5 command line
      const pairsString = credentials.pairs.join(',');
      console.log(`Configuring MT5 to trade ${credentials.pairs.length} pairs: ${pairsString}`);

      // Handle SVG server specifics
      let serverArgs = credentials.server;
      // Add special configurations for SVG servers if needed
      if (credentials.server.toLowerCase().includes('svg')) {
        console.log('Using SVG server configuration');
        // Some SVG servers may need specific settings
      }

      // Start MT5 with the EA
      const startCommand = new SendCommandCommand({
        InstanceIds: [this.instanceId],
        DocumentName: "AWS-RunPowerShellScript",
        Parameters: {
          commands: [
            `$mt5Path = "C:\\Program Files\\MetaTrader 5\\terminal64.exe"`,
            `Write-Host "Starting MetaTrader 5..."`,
            `Write-Host "Command: $mt5Path /login:${credentials.login} /password:****** /server:${serverArgs} /port:443 /ea:${credentials.eaName} /pairs:${pairsString}"`,
            `Start-Process -FilePath $mt5Path -ArgumentList "/login:${credentials.login} /password:${credentials.password} /server:${serverArgs} /port:443 /ea:${credentials.eaName} /pairs:${pairsString}"`,
            `Write-Host "Waiting for MT5 to initialize..."`,
            `Start-Sleep -Seconds 10`,
            `$process = Get-Process terminal64 -ErrorAction SilentlyContinue`,
            `if (!$process) { 
              Write-Host "MT5 failed to start" -ForegroundColor Red
              throw "MetaTrader 5 failed to start" 
            }`,
            `Write-Host "MetaTrader 5 started successfully with process ID: $($process.Id)" -ForegroundColor Green`,
            `# Create a monitoring file to track EA startup
            $monitorFile = "C:\\MT5_ea_monitor.txt"
            "EA Start Time: $(Get-Date)" | Out-File $monitorFile`,
            `# Verify the EA is loaded
            Start-Sleep -Seconds 5
            $chartProcess = Get-Process -Name "terminal64" -ErrorAction SilentlyContinue
            if ($chartProcess) {
              "EA Status: Process running with ID $($chartProcess.Id)" | Out-File $monitorFile -Append
              "Memory Usage: $([math]::Round($chartProcess.WorkingSet / 1MB, 2)) MB" | Out-File $monitorFile -Append
              Write-Host "MT5 is now running with $([math]::Round($chartProcess.WorkingSet / 1MB, 2)) MB memory usage"
            } else {
              "EA Status: Process not found after startup" | Out-File $monitorFile -Append
              Write-Host "Warning: MT5 process not found after initial startup" -ForegroundColor Yellow
            }`
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