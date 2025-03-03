# Create MT5 automation directory
$mt5AutomationPath = "C:\mt5-automation"
if (-not (Test-Path $mt5AutomationPath)) {
    New-Item -ItemType Directory -Path $mt5AutomationPath
    Write-Host "Created MT5 automation directory at $mt5AutomationPath"
}

# Create the MT5 automation script
$mt5ScriptContent = @'
param(
    [string]$server,
    [string]$login,
    [string]$password,
    [string]$eaName
)

# Path to MetaTrader 5 executable
$mt5Path = "C:\Program Files\MetaTrader 5\terminal64.exe"

# Function to wait for window and send keys
function Wait-And-SendKeys {
    param(
        [string]$windowTitle,
        [string]$keys,
        [int]$timeout = 10
    )
    
    $startTime = Get-Date
    while ((Get-Date) - $startTime).TotalSeconds -lt $timeout) {
        $window = Get-Process | Where-Object { $_.MainWindowTitle -like "*$windowTitle*" }
        if ($window) {
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.SendKeys]::SendWait($keys)
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

# Start MetaTrader 5
Write-Host "Starting MetaTrader 5..."
Start-Process -FilePath $mt5Path

# Wait for MT5 to load
Start-Sleep -Seconds 10

# Login to trading account
Write-Host "Logging in to trading account..."
if (-not (Wait-And-SendKeys "MetaTrader 5" "$server{ENTER}")) {
    Write-Error "Failed to enter server"
    exit 1
}

Start-Sleep -Seconds 2
if (-not (Wait-And-SendKeys "MetaTrader 5" "$login{ENTER}")) {
    Write-Error "Failed to enter login"
    exit 1
}

Start-Sleep -Seconds 2
if (-not (Wait-And-SendKeys "MetaTrader 5" "$password{ENTER}")) {
    Write-Error "Failed to enter password"
    exit 1
}

# Wait for login to complete
Start-Sleep -Seconds 10

# Activate EA
Write-Host "Activating EA..."
# Navigate to EA settings
if (-not (Wait-And-SendKeys "MetaTrader 5" "^n")) {
    Write-Error "Failed to open Navigator"
    exit 1
}

Start-Sleep -Seconds 2
if (-not (Wait-And-SendKeys "MetaTrader 5" "Experts{ENTER}")) {
    Write-Error "Failed to navigate to Experts"
    exit 1
}

Start-Sleep -Seconds 2
if (-not (Wait-And-SendKeys "MetaTrader 5" "$eaName{ENTER}")) {
    Write-Error "Failed to select EA"
    exit 1
}

Start-Sleep -Seconds 2
if (-not (Wait-And-SendKeys "MetaTrader 5" "{ENTER}")) {
    Write-Error "Failed to activate EA"
    exit 1
}

Write-Host "MT5 automation completed successfully"
exit 0
'@

$mt5ScriptPath = Join-Path $mt5AutomationPath "mt5-automation.ps1"
$mt5ScriptContent | Out-File -FilePath $mt5ScriptPath -Encoding UTF8
Write-Host "Created MT5 automation script at $mt5ScriptPath"

# Create Experts directory if it doesn't exist
$expertsPath = "C:\Users\Administrator\AppData\Roaming\MetaQuotes\Terminal\Common\MQL5\Experts"
if (-not (Test-Path $expertsPath)) {
    New-Item -ItemType Directory -Path $expertsPath -Force
    Write-Host "Created Experts directory at $expertsPath"
}

# Set execution policy to allow running scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Write-Host "Set PowerShell execution policy to RemoteSigned"

Write-Host "Setup completed successfully!"
Write-Host "Please ensure that:"
Write-Host "1. MetaTrader 5 is installed at C:\Program Files\MetaTrader 5\terminal64.exe"
Write-Host "2. The Arm EA is placed in the Experts directory"
Write-Host "3. The EA is properly configured in MT5" 