' Launches the always-on runner watch daemon with no console window.
Set sh = CreateObject("Wscript.Shell")
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\Oem\Claude_CODE\voice-inbox\services\session-runner\runner-watch.mjs""", 0, False
