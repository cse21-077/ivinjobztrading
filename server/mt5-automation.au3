#RequireAdmin

; Parameters from command line
Local $server = $CmdLine[1]
Local $login = $CmdLine[2]
Local $password = $CmdLine[3]
Local $eaName = $CmdLine[4]

; Launch MT5
Run("C:\Program Files\MetaTrader 5\terminal64.exe")

; Wait for MT5 window
WinWaitActive("MetaTrader 5")

; Enter server
Send($server)
Send("{ENTER}")
Sleep(1000)

; Enter login
Send($login)
Send("{ENTER}")
Sleep(1000)

; Enter password
Send($password)
Send("{ENTER}")
Sleep(5000)

; Activate EA
; This part will need to be customized based on your EA's activation process
; Example:
; MouseClick("left", x, y) ; Click on EA settings
; Send($eaName)
; Send("{ENTER}")

Exit(0)
