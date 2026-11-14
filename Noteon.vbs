Option Explicit
Dim sh, fso, base, q, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = base
sh.Environment("PROCESS")("ELECTRON_RUN_AS_NODE") = ""
q = Chr(34)
cmd = "cmd /c " & q & base & "\Noteon.cmd" & q
sh.Run cmd, 0, False
