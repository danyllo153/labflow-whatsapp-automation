# Monta o pacote do LabFlow Lite para Windows (pasta LabFlow com instalacao\ e os .bat).
# Roda no GitHub Actions (windows-latest) ou num PC Windows com internet, Python 3.12 e o build das telas pronto.
# Spec: docs/specs/lims/12-versao-lite.md. Arquivo em ASCII de proposito (Windows PowerShell 5.1).
#
# Uso: powershell -ExecutionPolicy Bypass -File app\lite\montar.ps1 -Saida C:\temp\lite
#   -PostgresDir  pasta de um PostgreSQL 15+ ja instalado (bin, lib, share); sem ela usa PGROOT ou baixa da EDB
param(
  [string]$Saida = "lite-pacote",
  [string]$PostgresDir = "",
  [string]$PostgresZipVersao = "16.6-1",
  [string]$PythonVersao = "3.12.8",
  [string]$Versao = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Checar($passo) { if ($LASTEXITCODE -ne 0) { throw "Falhou: $passo (codigo $LASTEXITCODE)" } }

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$raiz = Join-Path $Saida "LabFlow"
$inst = Join-Path $raiz "instalacao"
if (Test-Path $Saida) { Remove-Item -Recurse -Force $Saida }
New-Item -ItemType Directory -Force $inst | Out-Null
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("lite-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $tmp | Out-Null

# 1. Python embutido (nao precisa instalar nada no PC)
Write-Host "1/6 Python $PythonVersao"
$py = Join-Path $inst "python"
$zip = Join-Path $tmp "python.zip"
Invoke-WebRequest "https://www.python.org/ftp/python/$PythonVersao/python-$PythonVersao-embed-amd64.zip" -OutFile $zip
Expand-Archive $zip $py
$mm = ($PythonVersao.Split(".")[0..1] -join "")
Set-Content -Encoding ascii (Join-Path $py "python$mm._pth") @("python$mm.zip", ".", "Lib\site-packages", "..\app", "import site")
$pyver = ($PythonVersao.Split(".")[0..1] -join ".")
python -m pip install --disable-pip-version-check --no-compile --only-binary=:all: --platform win_amd64 `
  --python-version $pyver --implementation cp --target (Join-Path $py "Lib\site-packages") `
  -r (Join-Path $repo "app\api\requirements.txt") tzdata pystray==0.19.5
Checar "pip install"

# 2. API, telas, migrations e o lancador
Write-Host "2/6 App"
$web = Join-Path $repo "app\web\dist"
if (-not (Test-Path (Join-Path $web "index.html"))) { throw "Telas nao montadas: rode 'npm ci' e 'npm run build' em app\web antes." }
New-Item -ItemType Directory -Force (Join-Path $inst "app"), (Join-Path $inst "migrations"), (Join-Path $inst "lite") | Out-Null
Copy-Item -Recurse (Join-Path $repo "app\api\labflow_api") (Join-Path $inst "app\labflow_api")
Get-ChildItem -Recurse -Directory (Join-Path $inst "app") -Filter "__pycache__" | Remove-Item -Recurse -Force
Copy-Item -Recurse $web (Join-Path $inst "web")
Get-ChildItem (Join-Path $repo "db\migrations") -Filter "*.sql" | Where-Object { $_.Name -notlike "*_desfazer.sql" } |
  Copy-Item -Destination (Join-Path $inst "migrations")
Copy-Item (Join-Path $repo "app\lite\lite.py") (Join-Path $inst "lite\lite.py")

# 3. PostgreSQL portatil (15 ou mais novo: as migrations usam NULLS NOT DISTINCT)
Write-Host "3/6 PostgreSQL"
if (-not $PostgresDir -and $env:PGROOT) { $PostgresDir = $env:PGROOT }
if ($PostgresDir) {
  $major = [int](((& (Join-Path $PostgresDir "bin\pg_config.exe") --version) -replace "[^0-9.]", "").Split(".")[0])
  if ($major -lt 15) { Write-Host "PostgreSQL $major em $PostgresDir e antigo; baixando o $PostgresZipVersao"; $PostgresDir = "" }
}
if (-not $PostgresDir) {
  $pz = Join-Path $tmp "pg.zip"
  Invoke-WebRequest "https://get.enterprisedb.com/postgresql/postgresql-$PostgresZipVersao-windows-x64-binaries.zip" -OutFile $pz
  Expand-Archive $pz (Join-Path $tmp "pg")
  $PostgresDir = Join-Path $tmp "pg\pgsql"
}
$pg = Join-Path $inst "postgres"
foreach ($sub in "bin", "lib", "share") { Copy-Item -Recurse (Join-Path $PostgresDir $sub) (Join-Path $pg $sub) }
Get-ChildItem -Recurse $pg -Include "*.pdb", "*.lib", "*.a" | Remove-Item -Force
foreach ($sobra in "share\doc", "bin\pgAdmin4", "pgAdmin 4") { $p = Join-Path $pg $sobra; if (Test-Path $p) { Remove-Item -Recurse -Force $p } }
foreach ($dll in "vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll") {
  $orig = Join-Path $env:WINDIR "System32\$dll"
  if ((Test-Path $orig) -and -not (Test-Path (Join-Path $pg "bin\$dll"))) { Copy-Item $orig (Join-Path $pg "bin") }
}
Write-Host "PostgreSQL de: $PostgresDir"
(& (Join-Path $pg "bin\pg_config.exe") --version) | Set-Content -Encoding ascii (Join-Path $pg "VERSAO.txt")
Checar "pg_config"
# confere como num PC sem PostgreSQL instalado: PATH so com o Windows
$pathOriginal = $env:PATH
$env:PATH = "$env:WINDIR\System32;$env:WINDIR"
foreach ($exe in "initdb", "postgres", "pg_ctl", "psql", "pg_dump", "pg_restore") {
  & (Join-Path $pg "bin\$exe.exe") --version
  if ($LASTEXITCODE -ne 0) {
    $env:PATH = $pathOriginal
    $dlls = Get-ChildItem (Join-Path $PostgresDir "bin") -Filter "*.dll" | ForEach-Object { $_.Name }
    Write-Host "DLLs em $PostgresDir\bin: $($dlls -join ', ')"
    foreach ($d in ($pathOriginal -split ";")) { if ($d -and (Test-Path $d)) { Get-ChildItem $d -Filter "lib*.dll" -ErrorAction SilentlyContinue | Select-Object -First 3 | ForEach-Object { Write-Host "  no PATH: $($_.FullName)" } } }
    throw ("Falhou: $exe --version (codigo 0x{0:X}); falta DLL no pacote" -f $LASTEXITCODE)
  }
}
$env:PATH = $pathOriginal

# 4. Versao do pacote (o .bat recopia o programa para o PC quando ela muda)
Write-Host "4/6 Versao"
if (-not $Versao) {
  $sha = (git -C $repo rev-parse --short HEAD).Trim()
  $Versao = "lite-" + (Get-Date -Format "yyyyMMdd") + "-" + $sha
}
Set-Content -Encoding ascii (Join-Path $inst "VERSAO.txt") $Versao

# 5. Arquivos da raiz: .bat e .vbs em ASCII com CRLF; LEIA-ME em UTF-8 com BOM (Bloco de Notas)
Write-Host "5/6 Atalhos e LEIA-ME"
Get-ChildItem (Join-Path $repo "app\lite\pacote") | ForEach-Object {
  $texto = ([IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n") -replace "`n", "`r`n"
  $destino = Join-Path $raiz $_.Name
  if ($_.Extension -eq ".bat" -or $_.Extension -eq ".vbs") { [IO.File]::WriteAllText($destino, $texto, [Text.Encoding]::ASCII) }
  else { [IO.File]::WriteAllText($destino, $texto, (New-Object Text.UTF8Encoding($true))) }
}

# 6. Resumo
$mb = [math]::Round(((Get-ChildItem -Recurse $raiz | Measure-Object Length -Sum).Sum / 1MB), 0)
Write-Host "6/6 Pronto: $raiz ($mb MB), versao $Versao"
Remove-Item -Recurse -Force $tmp
