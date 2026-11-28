# Gera o "Abrir LabFlow.exe": autoextraivel (SFX) do WinRAR com o programa do LabFlow Lite (a pasta instalacao\ do pacote).
# Dois cliques no .exe, na pasta de rede: extrai NO PC (%LOCALAPPDATA%\LabFlowLite\p-<hash da versao>), cria o atalho "LabFlow" na area de
# trabalho e abre o LabFlow. Nas proximas vezes o atalho abre direto; se o .exe da rede mudar, o atalho roda o .exe novo e atualiza sozinho.
# NAO pede administrador (o modulo Default.SFX do WinRAR roda como o usuario: manifesto asInvoker). A pasta dados\ nunca entra no .exe.
# Precisa do WinRAR instalado SO no PC que gera o .exe; quem abre o .exe nao precisa de nada.
# Spec: docs/specs/lims/12-versao-lite.md. Arquivo em ASCII de proposito (Windows PowerShell 5.1).
#
# Uso: powershell -ExecutionPolicy Bypass -File app\lite\montar-exe.ps1 -Pacote C:\temp\lite\LabFlow
#   -Pacote  a pasta LabFlow (com instalacao\): a do montar.ps1 ou a baixada em Artifacts, descompactada
#   -Saida   o .exe gerado (padrao: "Abrir LabFlow.exe" dentro da pasta do pacote, ao lado de dados\)
#   -Rar     caminho do Rar.exe (padrao: o da instalacao do WinRAR)
param(
  [Parameter(Mandatory = $true)][string]$Pacote,
  [string]$Saida = "",
  [string]$Rar = "",
  [switch]$Silencioso   # so para teste automatico: sem a janelinha de progresso (Silent=2); o .exe de entrega NAO usa
)
$ErrorActionPreference = "Stop"

$Pacote = (Resolve-Path $Pacote).Path.TrimEnd("\")
$inst = Join-Path $Pacote "instalacao"
foreach ($item in "VERSAO.txt", "lite\lite.py", "python\pythonw.exe") {
  if (-not (Test-Path -LiteralPath (Join-Path $inst $item))) { throw "Falta instalacao\$item em ${Pacote}: e o pacote do montar.ps1?" }
}
if (-not $Rar) {
  foreach ($c in (Join-Path $env:ProgramFiles "WinRAR\Rar.exe"), (Join-Path ${env:ProgramFiles(x86)} "WinRAR\Rar.exe")) {
    if ($c -and (Test-Path -LiteralPath $c)) { $Rar = $c; break }
  }
}
if (-not $Rar -or -not (Test-Path -LiteralPath $Rar)) { throw "Rar.exe nao encontrado: instale o WinRAR ou passe -Rar <caminho>" }
if (-not $Saida) { $Saida = Join-Path $Pacote "Abrir LabFlow.exe" }
if (Test-Path -LiteralPath $Saida) { Remove-Item -LiteralPath $Saida -Force }

$versao = (Get-Content -LiteralPath (Join-Path $inst "VERSAO.txt") -TotalCount 1).Trim()
if ($versao -notmatch '^[A-Za-z0-9._-]+$') { throw "Versao com caracteres invalidos: $versao" }
$hash = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::ASCII.GetBytes($versao))) -replace '-', '').Substring(0, 7).ToLower()
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("lite-exe-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $tmp | Out-Null

# Icone do LabFlow (o mesmo desenho do icone perto do relogio: circulo azul com um funil branco), gerado aqui: nada de binario no Git.
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"
$g.Clear([System.Drawing.Color]::Transparent)
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(31, 59, 179))), 8, 8, 240, 240)
$k = 4.0
$pts = @((26, 13), (38, 13), (38, 28), (50, 50), (14, 50), (26, 28)) | ForEach-Object { New-Object System.Drawing.PointF ([single]($_[0] * $k)), ([single]($_[1] * $k)) }
$g.FillPolygon([System.Drawing.Brushes]::White, [System.Drawing.PointF[]]$pts)
$g.Dispose()
$ms = New-Object IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$bmp.Dispose()
$ico = Join-Path $tmp "labflow.ico"
$fs = [IO.File]::Create($ico)
$bw = New-Object IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)          # cabecalho: 1 imagem
$bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0) # 256x256, sem paleta
$bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$png.Length); $bw.Write([uint32]22)
$bw.Write($png)
$bw.Close()
Copy-Item $ico (Join-Path $inst "lite\labflow.ico") -Force  # o atalho usa este icone (fica dentro do programa extraido)

# Comandos do SFX: sfx.txt com o hash curto da versao (7 caracteres) no lugar de {{HASH}}: caminho curto, o Windows limita ~260 (o caminho de extracao e fixo na montagem, nada vem do usuario)
$sfx = Join-Path $tmp "sfx.txt"
$texto = (Get-Content -Raw (Join-Path $PSScriptRoot "sfx.txt")) -replace '\{\{HASH\}\}', $hash
if ($Silencioso) { $texto = $texto -replace '(?m)^Silent=1', 'Silent=2' }
[IO.File]::WriteAllText($sfx, $texto, [Text.Encoding]::ASCII)

Write-Host "Gerando $Saida (versao $versao, pasta p-$hash)..."
# -sfx: modulo padrao (janela de progresso, 64 bits, sem administrador); -ep1: guarda a partir de instalacao\; nunca leva dados\, logs, pgdata, dumps nem .env
Push-Location $inst
try {
  & $Rar a -sfx -r -ep1 -m3 -idq -y "-z$sfx" "-iicon$ico" "-x*.log" "-x*.dump" "-x*\pgdata" "-x*\pgdata\*" "-x*\dados" "-x*\dados\*" "-x.env" $Saida "*"
  if ($LASTEXITCODE -ne 0) { throw "Falhou: rar (codigo $LASTEXITCODE)" }
} finally { Pop-Location }
Remove-Item -Recurse -Force $tmp
$mb = [math]::Round((Get-Item -LiteralPath $Saida).Length / 1MB, 0)
Write-Host "Pronto: $Saida ($mb MB). Copie para a pasta de rede do LabFlow (ao lado de dados\) e de dois cliques."
