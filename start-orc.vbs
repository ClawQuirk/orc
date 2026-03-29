Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
WshShell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
' Start the backend first, hidden (windowStyle 0 = hidden)
WshShell.Run "cmd /c npx tsx server/index.ts > data\backend.log 2>&1", 0, False
' Wait for backend to be ready
WScript.Sleep 3000
' Start the frontend, hidden
WshShell.Run "cmd /c npx vite --port 5180 --strictPort > data\frontend.log 2>&1", 0, False
' Wait for frontend to be ready
WScript.Sleep 2000
' Open the browser
WshShell.Run "http://localhost:5180", 1, False
