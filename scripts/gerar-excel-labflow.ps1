# Gera o Excel do LabFlow (somente leitura): painel + uma aba por analise, com graficos de tendencia no topo e a tabela
# (registro mais recente na primeira linha) embaixo. Tudo ligado ao banco pelo ODBC (psqlODBC x64) e pelo Power Query.
# As abas, os SQL, os rotulos e os graficos ficam em scripts\excel-labflow.config.json (UTF-8, com acentos).
# Atualizar o arquivo depois de pronto: Dados > Atualizar Tudo.
# Na primeira vez o Excel nao tem a senha do labflow_leitura: o arquivo sai com as tabelas vazias e, ao abrir,
# Dados > Atualizar Tudo pede a senha uma vez (aba Banco de Dados); depois e so salvar (Ctrl+S).
# Pre-requisitos: driver psqlODBC x64, tunel do banco aberto em localhost:15432 (scripts\tunel-powerbi.ps1) e o Excel FECHADO.
# A senha do labflow_leitura NAO vai para o arquivo.
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\gerar-excel-labflow.ps1 [-Saida caminho.xlsx] [-Pdf caminho.pdf]
param(
    [string]$Saida = (Join-Path $env:USERPROFILE 'OneDrive\Valts\estudos-labflow\excel\LabFlow-Excel.xlsx'),
    [string]$Config = (Join-Path $PSScriptRoot 'excel-labflow.config.json'),
    [string]$Pdf = ''
)
$ErrorActionPreference = 'Stop'

$cfg = [System.IO.File]::ReadAllText($Config, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$cs = 'driver={PostgreSQL Unicode(x64)};Server=localhost;Port=15432;Database=labflow'

function Rgb([string]$hex) {
    return [int]([Convert]::ToInt32($hex.Substring(0, 2), 16) + 256 * [Convert]::ToInt32($hex.Substring(2, 2), 16) + 65536 * [Convert]::ToInt32($hex.Substring(4, 2), 16))
}
$P = $cfg.paleta
$ano = 'yyyy'
if ((Get-Culture).Name -like 'pt*') { $ano = 'aaaa' }
$fmtData = 'dd/mm/' + $ano
$fmtDataHora = $fmtData + ' hh:mm'
$script:pendente = $false

# Cria uma tabela do Excel (Power Query -> ODBC) a partir de um SQL, no canto $destino da aba $ws.
function Nova-Tabela($wb, $ws, [string]$nomeQuery, [string]$sql, $destino, [string]$nomeTabela, [string]$estilo) {
    $m = 'let' + "`r`n" + '  Fonte = Odbc.Query("' + $cs + '", "' + ($sql -replace '"', '""') + '")' + "`r`n" + 'in' + "`r`n" + '  Fonte'
    [void]$wb.Queries.Add($nomeQuery, $m)
    $conn = 'OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=' + $nomeQuery + ';Extended Properties=""'
    $lo = $ws.ListObjects.Add(0, $conn, $true, 1, $destino)
    $lo.Name = $nomeTabela
    $lo.TableStyle = $estilo
    if ($estilo -eq 'TableStyleMedium2') { $lo.ShowTableStyleRowStripes = $false }
    $qt = $lo.QueryTable
    $qt.CommandType = 2
    $qt.CommandText = 'SELECT * FROM [' + $nomeQuery + ']'
    $qt.BackgroundQuery = $false
    $qt.RefreshStyle = 1
    $qt.PreserveFormatting = $true
    try { [void]$qt.Refresh($false) } catch { $script:pendente = $true }
    return $lo
}

function Formatar-Colunas($ws, $lo, $tipos) {
    foreach ($c in 1..$lo.ListColumns.Count) {
        $col = $lo.ListColumns.Item($c)
        $t = $null
        if ($tipos) { $t = $tipos.PSObject.Properties[$col.Name] }
        if ($t) {
            if ($t.Value -eq 'data') { $col.DataBodyRange.NumberFormatLocal = $fmtData; $col.DataBodyRange.HorizontalAlignment = -4108 }
            if ($t.Value -eq 'datahora') { $col.DataBodyRange.NumberFormatLocal = $fmtDataHora; $col.DataBodyRange.HorizontalAlignment = -4108 }
        }
    }
}

# Alinhamento, linhas de separacao e cores por valor (fabrica, situacao, resultado...) nas tabelas de analise.
function Tinte([string]$hex, [double]$f) {
    $r = [Convert]::ToInt32($hex.Substring(0, 2), 16); $g = [Convert]::ToInt32($hex.Substring(2, 2), 16); $b = [Convert]::ToInt32($hex.Substring(4, 2), 16)
    $r = [int](255 - (255 - $r) * $f); $g = [int](255 - (255 - $g) * $f); $b = [int](255 - (255 - $b) * $f)
    return [int]($r + 256 * $g + 65536 * $b)
}
function Estilizar-Tabela($ws, $lo) {
    $corLinha = Rgb 'C3CFE3'
    $corte = Rgb 'FFFFFF'
    if ($lo.ListRows.Count -gt 0) {
        $corpo = $lo.DataBodyRange
        $corpo.HorizontalAlignment = -4108
        $corpo.VerticalAlignment = -4108
        $corpo.RowHeight = 21
        foreach ($b in 7..12) { $corpo.Borders.Item($b).LineStyle = 1; $corpo.Borders.Item($b).Weight = 2; $corpo.Borders.Item($b).Color = $corLinha }
        foreach ($c in 1..$lo.ListColumns.Count) {
            $col = $lo.ListColumns.Item($c)
            if ($cfg.esquerda -contains $col.Name) { $col.DataBodyRange.HorizontalAlignment = -4131; $col.DataBodyRange.IndentLevel = 1 }
            $regra = $cfg.regras.PSObject.Properties[$col.Name]
            if ($regra) {
                foreach ($v in $regra.Value.PSObject.Properties) {
                    $fc = $col.DataBodyRange.FormatConditions.Add(1, 3, '="' + $v.Name + '"')
                    $fc.Interior.Color = Tinte $v.Value 0.16
                    $fc.Font.Color = Rgb $v.Value
                    $fc.Font.Bold = $true
                }
            }
        }
    }
    $cab = $lo.HeaderRowRange
    foreach ($b in 7, 10, 11) { $cab.Borders.Item($b).LineStyle = 1; $cab.Borders.Item($b).Weight = 2; $cab.Borders.Item($b).Color = (Rgb '5B86C9') }
    foreach ($c in 1..$lo.ListColumns.Count) {
        $w = [double]($ws.Columns.Item($c).ColumnWidth) + 3
        if ($w -lt 14) { $w = 14 }
        if ($w -gt 38) { $w = 38 }
        $ws.Columns.Item($c).ColumnWidth = [double]$w
    }
}

if (Get-Process EXCEL -ErrorAction SilentlyContinue) { throw 'Feche o Excel por completo antes de rodar este script.' }
if (-not (Test-NetConnection 127.0.0.1 -Port 15432 -WarningAction SilentlyContinue).TcpTestSucceeded) {
    throw 'O tunel do banco (localhost:15432) nao esta aberto. Veja docs/scripts.md (tunel-powerbi.ps1).'
}
New-Item -ItemType Directory -Force -Path (Split-Path $Saida) | Out-Null

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
    $wb = $xl.Workbooks.Add()
    while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }
    $painel = $wb.Worksheets.Item(1); $painel.Name = 'Painel'
    $ultima = $painel
    $paginas = @()
    foreach ($a in $cfg.abas) {
        $ws = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)); $ws.Name = $a.nome
        $paginas += , @($a, $ws)
    }
    $dadosWs = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)); $dadosWs.Name = 'Tendencias (dados)'
    $ajudaWs = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)); $ajudaWs.Name = 'Ajuda'

    # ---- tabelas de apoio dos graficos (uma por grafico, lado a lado na aba de dados)
    $colunaDados = 1
    $apoio = @{}
    $dadosWs.Cells.Item(1, 1).Value2 = 'Dados dos graficos de tendencia (atualizam com Dados > Atualizar Tudo)'
    $dadosWs.Cells.Item(1, 1).Font.Bold = $true
    foreach ($pg in $paginas) {
        $a = $pg[0]
        $i = 0
        foreach ($g in $a.graficos) {
            $i++
            $nomeT = 'tbG_' + ($a.tabela -replace '^tb', '') + '_' + $i
            $lo = Nova-Tabela $wb $dadosWs ('g_' + $nomeT) $g.sql $dadosWs.Cells.Item(3, $colunaDados) $nomeT 'TableStyleLight1'
            if ($lo.ListColumns.Count -ge 1 -and $lo.ListRows.Count -gt 0) {
                $primeira = $lo.ListColumns.Item(1).Name
                if ($primeira -eq 'Dia') { $lo.ListColumns.Item(1).DataBodyRange.NumberFormatLocal = $fmtData }
            }
            $apoio[$a.tabela + '|' + $i] = $lo
            $colunaDados += $lo.ListColumns.Count + 1
        }
    }

    # ---- aba de cada analise
    foreach ($pg in $paginas) {
        $a = $pg[0]; $ws = $pg[1]
        $ws.Activate()
        $xl.ActiveWindow.DisplayGridlines = $false
        $xl.ActiveWindow.Zoom = 90
        $ws.Tab.Color = Rgb $a.cor
        $linhaTabela = 24
        $lo = Nova-Tabela $wb $ws ('t_' + $a.tabela) $a.sql $ws.Cells.Item($linhaTabela, 1) $a.tabela 'TableStyleMedium2'
        if ($lo.ListRows.Count -gt 0) { Formatar-Colunas $ws $lo $a.colunas }
        $ncol = [Math]::Max($lo.ListColumns.Count, 14)
        # cabecalho da tabela e larguras
        $lo.HeaderRowRange.WrapText = $true
        $lo.HeaderRowRange.HorizontalAlignment = -4108
        $lo.HeaderRowRange.VerticalAlignment = -4108
        $ws.Rows.Item($linhaTabela).RowHeight = 32
        $lo.Range.Columns.AutoFit() | Out-Null
        Estilizar-Tabela $ws $lo
        # faixa do topo (titulo, descricao e area dos graficos)
        $faixa = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($linhaTabela - 2, $ncol))
        $faixa.Interior.Color = Rgb $P.fundo
        $ws.Range($ws.Cells.Item(3, 1), $ws.Cells.Item(3, $ncol)).Interior.Color = Rgb $a.cor
        $ws.Rows.Item(3).RowHeight = 4
        $ws.Cells.Item(1, 1).Value2 = $a.titulo
        $ws.Cells.Item(1, 1).Font.Size = 22; $ws.Cells.Item(1, 1).Font.Bold = $true; $ws.Cells.Item(1, 1).Font.Color = Rgb $P.texto
        $ws.Rows.Item(1).RowHeight = 34
        $ws.Cells.Item(2, 1).Value2 = $a.descricao
        $ws.Cells.Item(2, 1).Font.Size = 11; $ws.Cells.Item(2, 1).Font.Color = Rgb $P.texto2
        $ws.Cells.Item($linhaTabela - 1, 1).Value2 = 'Registros (o mais recente primeiro):'
        $ws.Cells.Item($linhaTabela - 1, 1).Font.Bold = $true; $ws.Cells.Item($linhaTabela - 1, 1).Font.Color = Rgb $P.texto
        # graficos
        $k = 0
        $topo = $ws.Range('A5').Top + 4
        $altura = ($ws.Range('A' + ($linhaTabela - 2)).Top - $ws.Range('A5').Top) - 8
        foreach ($g in $a.graficos) {
            $k++
            $src = $apoio[$a.tabela + '|' + $k]
            $esq = $ws.Range('A1').Left + 10 + ($k - 1) * 505
            $shape = $ws.Shapes.AddChart2(-1, 51, $esq, $topo, 495, $altura)
            $shape.Name = 'grafico' + $k
            $ch = $shape.Chart
            $tipo = 51
            if ($g.tipo -eq 'empilhadas') { $tipo = 52 }
            if ($g.tipo -eq 'linhas') { $tipo = 65 }
            $ch.ChartType = $tipo
            $ch.SetSourceData($src.Range, 2)
            $ch.HasTitle = $true
            $ch.ChartTitle.Text = $g.titulo
            $ch.ChartTitle.Font.Size = 13; $ch.ChartTitle.Font.Bold = $true; $ch.ChartTitle.Font.Color = Rgb $P.texto
            $ch.ChartArea.Format.Fill.ForeColor.RGB = Rgb 'FFFFFF'
            $ch.ChartArea.Format.Line.ForeColor.RGB = Rgb $P.borda
            $ch.PlotArea.Format.Fill.Visible = 0
            $nserie = $ch.SeriesCollection().Count
            $ch.HasLegend = ($nserie -gt 1)
            if ($ch.HasLegend) { $ch.Legend.Position = -4107 }
            for ($s = 1; $s -le $nserie; $s++) {
                $cor = Rgb $P.series[($s - 1) % $P.series.Count]
                $serie = $ch.SeriesCollection($s)
                if ($tipo -eq 65) { $serie.Format.Line.ForeColor.RGB = $cor; $serie.Format.Line.Weight = 2.25; $serie.MarkerBackgroundColor = $cor; $serie.MarkerForegroundColor = $cor }
                else { $serie.Format.Fill.ForeColor.RGB = $cor }
            }
            try { $ch.ChartGroups(1).GapWidth = 60 } catch { }
            try {
                $eixo = $ch.Axes(1)
                if ($src.ListColumns.Item(1).Name -eq 'Dia') { $eixo.CategoryType = 3; $eixo.TickLabels.NumberFormat = 'dd/mm'; $eixo.MajorUnitScale = 0; $eixo.MajorUnit = 7; $eixo.TickLabels.Orientation = 0 }
                $eixo.TickLabels.Font.Color = Rgb $P.texto2
                $ch.Axes(2).TickLabels.Font.Color = Rgb $P.texto2
                $ch.Axes(2).MajorGridlines.Format.Line.ForeColor.RGB = Rgb $P.borda
            } catch { }
        }
        $ws.Range('A1').Select() | Out-Null
        "{0}: {1} linhas" -f $a.nome, $lo.ListRows.Count
    }

    # ---- painel
    $painel.Activate()
    $xl.ActiveWindow.DisplayGridlines = $false
    $xl.ActiveWindow.Zoom = 90
    $painel.Tab.Color = Rgb $P.texto
    $painel.Cells.Interior.Color = Rgb $P.fundo
    foreach ($c in 1..16) { $painel.Columns.Item($c).ColumnWidth = 13 }
    $painel.Cells.Item(2, 2).Value2 = $cfg.painel.titulo
    $painel.Cells.Item(2, 2).Font.Size = 24; $painel.Cells.Item(2, 2).Font.Bold = $true; $painel.Cells.Item(2, 2).Font.Color = Rgb $P.texto
    $painel.Rows.Item(2).RowHeight = 38
    $painel.Cells.Item(3, 2).Value2 = $cfg.painel.descricao
    $painel.Cells.Item(3, 2).Font.Size = 11; $painel.Cells.Item(3, 2).Font.Color = Rgb $P.texto2
    $linhaCartao = 5; $colCartao = 2; $n = 0
    $rotulosKpi = @(); $valoresKpi = @()
    foreach ($ct in $cfg.painel.cartoes) {
        $c1 = $colCartao + ($n % 4) * 3
        $l1 = $linhaCartao + [Math]::Floor($n / 4) * 5
        $bloco = $painel.Range($painel.Cells.Item($l1, $c1), $painel.Cells.Item($l1 + 3, $c1 + 1))
        $bloco.Interior.Color = Rgb 'FFFFFF'
        foreach ($b in 7..10) { $bloco.Borders.Item($b).LineStyle = 1; $bloco.Borders.Item($b).Color = (Rgb $P.borda); $bloco.Borders.Item($b).Weight = 2 }
        $painel.Range($painel.Cells.Item($l1, $c1), $painel.Cells.Item($l1 + 3, $c1)).Borders.Item(7).Color = Rgb $ct.cor
        $painel.Range($painel.Cells.Item($l1, $c1), $painel.Cells.Item($l1 + 3, $c1)).Borders.Item(7).Weight = 4
        $painel.Range($painel.Cells.Item($l1, $c1), $painel.Cells.Item($l1, $c1 + 1)).Merge()
        $rot = $painel.Cells.Item($l1, $c1)
        $rot.Value2 = $ct.rotulo
        $rot.Font.Size = 11; $rot.Font.Color = Rgb $P.texto2; $rot.WrapText = $false; $rot.VerticalAlignment = -4108; $rot.IndentLevel = 1
        $val = $painel.Range($painel.Cells.Item($l1 + 1, $c1), $painel.Cells.Item($l1 + 3, $c1 + 1))
        $val.Merge()
        $painel.Cells.Item($l1 + 1, $c1).Formula = $ct.formula
        $painel.Cells.Item($l1 + 1, $c1).Font.Size = 30; $painel.Cells.Item($l1 + 1, $c1).Font.Bold = $true
        $painel.Cells.Item($l1 + 1, $c1).Font.Color = Rgb $ct.cor
        $painel.Cells.Item($l1 + 1, $c1).HorizontalAlignment = -4131
        $painel.Cells.Item($l1 + 1, $c1).VerticalAlignment = -4108
        $n++
    }
    # grafico de pendencias atrasadas (a partir dos cartoes "atrasados")
    $baseTab = 16
    $painel.Cells.Item($baseTab, 2).Value2 = $cfg.painel.atrasados.cabecalho[0]
    $painel.Cells.Item($baseTab, 3).Value2 = $cfg.painel.atrasados.cabecalho[1]
    $r = $baseTab + 1
    foreach ($x in $cfg.painel.atrasados.linhas) { $painel.Cells.Item($r, 2).Value2 = $x[0]; $painel.Cells.Item($r, 3).Formula = $x[1]; $r++ }
    $painel.Range($painel.Cells.Item($baseTab, 2), $painel.Cells.Item($r - 1, 3)).Font.Color = Rgb $P.texto2
    $shape = $painel.Shapes.AddChart2(-1, 57, $painel.Cells.Item($baseTab, 5).Left, $painel.Cells.Item($baseTab, 5).Top, 520, 230)
    $ch = $shape.Chart
    $ch.SetSourceData($painel.Range($painel.Cells.Item($baseTab, 2), $painel.Cells.Item($r - 1, 3)), 2)
    $ch.HasTitle = $true; $ch.ChartTitle.Text = $cfg.painel.graficoTitulo
    $ch.ChartTitle.Font.Size = 13; $ch.ChartTitle.Font.Bold = $true; $ch.ChartTitle.Font.Color = Rgb $P.texto
    $ch.HasLegend = $false
    $ch.ChartArea.Format.Fill.ForeColor.RGB = Rgb 'FFFFFF'
    $ch.ChartArea.Format.Line.ForeColor.RGB = Rgb $P.borda
    $ch.SeriesCollection(1).Format.Fill.ForeColor.RGB = Rgb 'DC2626'
    $painel.Range('A1').Select() | Out-Null

    # ---- ajuda
    $ajudaWs.Activate()
    $xl.ActiveWindow.DisplayGridlines = $false
    $ajudaWs.Tab.Color = Rgb $P.texto2
    $ajudaWs.Columns.Item(2).ColumnWidth = 120
    for ($i = 0; $i -lt $cfg.ajuda.Count; $i++) { $ajudaWs.Cells.Item($i + 2, 2).Value2 = $cfg.ajuda[$i] }
    $ajudaWs.Cells.Item(2, 2).Font.Bold = $true; $ajudaWs.Cells.Item(2, 2).Font.Size = 16

    # abas de dados e ajuda no fim, a do painel primeiro
    $dadosWs.Tab.Color = Rgb 'CBD5E1'
    $dadosWs.Visible = 0
    foreach ($c in 1..$colunaDados) { $dadosWs.Columns.Item($c).ColumnWidth = 14 }
    $painel.Activate()

    if ($Pdf) {
        foreach ($w in $wb.Worksheets) {
            $w.PageSetup.Orientation = 2
            $w.PageSetup.Zoom = $false
            $w.PageSetup.FitToPagesWide = 1
            $w.PageSetup.FitToPagesTall = 1
        }
        $wb.ExportAsFixedFormat(0, $Pdf)
        "PDF: $Pdf"
    }
    # salva numa pasta temporaria e copia: o OneDrive as vezes segura o arquivo e o SaveAs direto falha
    $tmp = Join-Path $env:TEMP ('LabFlow-Excel-' + [guid]::NewGuid().ToString('N') + '.xlsx')
    $wb.SaveAs($tmp, 51)
    $wb.Close($false)
    Copy-Item $tmp $Saida -Force
    Remove-Item $tmp -Force
    "Salvo em: $Saida"
    if ($script:pendente) { "ATENCAO: o Excel ainda nao tem a senha do labflow_leitura. Abra o arquivo, Dados > Atualizar Tudo e digite a senha (aba Banco de Dados); depois salve (Ctrl+S)." }
}
finally {
    $xl.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
}
