param(
    [string]$server,
    [string]$login,
    [string]$password,
    [string]$eaName
)

# Path to MetaTrader 5 executable
$mt5Path = "C:\Program Files\MetaTrader 5\terminal64.exe"

# Start MetaTrader 5
Start-Process -FilePath $mt5Path

# Wait for MT5 to load
Start-Sleep -Seconds 10

# Login to trading account
# This part would require AutoIt or similar automation tool
# Here's a conceptual example:
# SendKeys("$server{ENTER}")
# SendKeys("$login{ENTER}")
# SendKeys("$password{ENTER}")

# Activate EA
# Again, using AutoIt or similar:
# Navigate to EA settings and activate

Write-Output "MT5 automation completed"
