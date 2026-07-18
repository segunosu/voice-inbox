' Runs the session runner with no console window (Task Scheduler friendly).
Set sh = CreateObject("Wscript.Shell")
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\Oem\Claude_CODE\voice-inbox\services\session-runner\runner.mjs""", 0, False
