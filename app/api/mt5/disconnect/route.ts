import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 });
    }

    // Execute PowerShell command to stop MT5 and EA
    const command = `
      $Server = "${process.env.AWS_RDP_HOST}"
      $Username = "${process.env.AWS_RDP_USERNAME}"
      $Password = "${process.env.AWS_RDP_PASSWORD}"
      $SecurePassword = ConvertTo-SecureString $Password -AsPlainText -Force
      $Credentials = New-Object System.Management.Automation.PSCredential($Username, $SecurePassword)
      
      Invoke-Command -ComputerName $Server -Credential $Credentials -ScriptBlock {
        # Kill MetaTrader 5 process
        Get-Process | Where-Object { $_.ProcessName -like "*terminal64*" } | Stop-Process -Force
      }
    `;

    await execAsync(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting from MT5:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to disconnect from MT5' },
      { status: 500 }
    );
  }
} 