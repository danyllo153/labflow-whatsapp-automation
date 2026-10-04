# Gera a versao PUBLICA do workflow (LabFlow.json) a partir do export do n8n com IDs reais
# (LabFlow_importar_n8n.json, que nunca vai para o Git).
#
#   powershell -ExecutionPolicy Bypass -File scripts\sanitize-workflow.ps1 `
#       -Entrada LabFlow_importar_n8n.json -Saida LabFlow.json
#
# O que faz:
#   1. troca o ID real de cada credencial por um placeholder (GEMINI_CREDENTIAL_ID,
#      EVOLUTION_CREDENTIAL_ID, POSTGRES_CREDENTIAL_ID) e remove meta.instanceId,
#      mexendo so no texto bruto do arquivo;
#   2. grava no mesmo formato do arquivo versionado (JSON indentado pelo PowerShell,
#      terminando em LF), para o diff do Git mostrar so o que mudou de verdade;
#   3. confere que nenhum ID real sobrou e que nao ha pinData.
# Depois, rode a auditoria: python scripts/audit-workflow.py LabFlow.json --public
#
# IMPORTANTE: este arquivo e ASCII de proposito. O Windows PowerShell 5.1 le script sem BOM
# como ANSI e estraga acentos; texto com acento deve vir de arquivos lidos como UTF-8.

param(
    [Parameter(Mandatory = $true)][string]$Entrada,
    [Parameter(Mandatory = $true)][string]$Saida
)
$ErrorActionPreference = 'Stop'

# tipo de credencial do n8n -> placeholder publico
$mapa = @{
    'googlePalmApi'  = 'GEMINI_CREDENTIAL_ID'
    'httpHeaderAuth' = 'EVOLUTION_CREDENTIAL_ID'
    'postgres'       = 'POSTGRES_CREDENTIAL_ID'
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$raw = [System.IO.File]::ReadAllText((Resolve-Path $Entrada), $utf8)
$wf = $raw | ConvertFrom-Json

$reais = @{}
foreach ($n in $wf.nodes) {
    if ($n.credentials) {
        foreach ($p in $n.credentials.PSObject.Properties) {
            if (-not $mapa.ContainsKey($p.Name)) { throw "Tipo de credencial sem placeholder definido: $($p.Name). Acrescente em `$mapa." }
            $id = [string]$p.Value.id
            if ($id -and $id -ne $mapa[$p.Name]) { $reais[$id] = $mapa[$p.Name] }
        }
    }
}
foreach ($id in $reais.Keys) { $raw = $raw.Replace($id, $reais[$id]) }
$raw = [regex]::Replace($raw, '"meta"\s*:\s*\{\s*"instanceId"\s*:\s*"[^"]*"\s*\}', '"meta": {}')

$obj = $raw | ConvertFrom-Json
if ($obj.pinData -and @($obj.pinData.PSObject.Properties).Count -gt 0) { throw 'pinData preenchido: apague os dados fixados no n8n antes de exportar.' }
$texto = (($obj | ConvertTo-Json -Depth 100) -replace "`r`n", "`n") + "`n"

foreach ($id in $reais.Keys) { if ($texto.Contains($id)) { throw 'Sobrou um ID real de credencial no resultado.' } }
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($Saida), $texto, $utf8)

"credenciais trocadas : $($reais.Count)"
"nodes                 : $(@($obj.nodes).Count)"
"gravado em            : $Saida"
