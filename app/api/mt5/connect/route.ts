import { exec } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

const execAsync = promisify(exec);

const AWS_RDP_CONFIG = {
  host: '16.170.243.138',
  username: process.env.AWS_RDP_USERNAME || 'Administrator',
  password: process.env.AWS_RDP_PASSWORD
};

export async function POST(request: Request) {
  try {
    const { server, login, password } = await request.json();

    // Connect to RDP server using PowerShell
    const rdpCommand = `powershell -Command "& { 
      try {
        $password = ConvertTo-SecureString '${AWS_RDP_CONFIG.password}' -AsPlainText -Force;
        $credential = New-Object System.Management.Automation.PSCredential('${AWS_RDP_CONFIG.username}', $password);
        Start-Process mstsc -ArgumentList '/v:${AWS_RDP_CONFIG.host} /f' -Credential $credential -ErrorAction Stop;
        Write-Host 'RDP connection initiated successfully';
      } catch {
        Write-Error 'Failed to initiate RDP connection: ' + $_.Exception.Message;
        exit 1;
      }
    }"`;
    
    await execAsync(rdpCommand);

    // Wait for RDP connection
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Run MT5 automation script
    const mt5Command = `powershell -File "C:\\mt5-automation\\mt5-automation.ps1" "${server}" "${login}" "${password}" "The Arm"`;
    const result = await execAsync(mt5Command);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('MT5 Automation Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Unknown error occurred' 
    }, { status: 500 });
  }
} 