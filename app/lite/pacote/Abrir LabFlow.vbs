' LabFlow Lite: abre sem nenhuma janela do cmd. Na primeira vez neste PC (ou depois de uma atualizacao), abre com a
' janela, para mostrar o preparo e a senha do primeiro acesso. Arquivo em ASCII de proposito (o Windows le .vbs assim).
Option Explicit
Dim sh, fs, raiz, pasta, ver, pronto, bat
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
raiz = fs.GetParentFolderName(WScript.ScriptFullName)
pasta = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\LabFlowLite"
ver = Trim(fs.OpenTextFile(raiz & "\instalacao\VERSAO.txt").ReadLine)
pronto = fs.FileExists(pasta & "\ja-abriu.txt") And fs.FileExists(pasta & "\programa\versao-" & ver & ".ok")
bat = """" & raiz & "\Abrir LabFlow com janela.bat" & """"
If pronto Then
  sh.Run bat, 0, False
Else
  sh.Run bat, 1, False
End If
