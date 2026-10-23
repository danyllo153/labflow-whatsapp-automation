# Gera o Excel do LabFlow (somente leitura) com a cara do painel do Power BI (tema claro "LabFlow claro"):
# cabecalho com botoes de navegacao entre as abas, cartoes arredondados, graficos no tema e tabelas leves.
# Painel + uma aba por analise (cartoes, graficos de tendencia e a tabela com o registro mais recente primeiro).
# Tudo ligado ao banco pelo ODBC (psqlODBC x64) e pelo Power Query.
# As abas, os SQL, os rotulos, os cartoes e os graficos ficam em scripts\excel-labflow.config.json (UTF-8, com acentos);
# este arquivo fica so em ASCII (o PowerShell 5.1 le script sem BOM como ANSI).
# Atualizar o arquivo depois de pronto: Dados > Atualizar Tudo.
# Na primeira vez o Excel nao tem a senha do labflow_leitura: o arquivo sai com as tabelas vazias e, ao abrir,
# Dados > Atualizar Tudo pede a senha uma vez (aba Banco de Dados); depois e so salvar (Ctrl+S).
# Pre-requisitos: driver psqlODBC x64, tunel do banco aberto em localhost:15432 (scripts\tunel-powerbi.ps1) e o Excel FECHADO.
# A senha do labflow_leitura NAO vai para o arquivo.
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\gerar-excel-labflow.ps1 [-Saida caminho.xlsx] [-Pdf caminho.pdf]
#       -ExcelAberto: gera mesmo com o Excel aberto (para testar em outro caminho; nunca no arquivo que esta aberto)
param(
    [string]$Saida = (Join-Path $env:USERPROFILE 'OneDrive\Valts\estudos-labflow\excel\LabFlow-Excel.xlsx'),
    [string]$Config = (Join-Path $PSScriptRoot 'excel-labflow.config.json'),
    [string]$Pdf = '',
    [switch]$ExcelAberto
)
$ErrorActionPreference = 'Stop'

$cfg = [System.IO.File]::ReadAllText($Config, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$cs = 'driver={PostgreSQL Unicode(x64)};Server=localhost;Port=15432;Database=labflow'

function Rgb([string]$hex) {
    return [int]([Convert]::ToInt32($hex.Substring(0, 2), 16) + 256 * [Convert]::ToInt32($hex.Substring(2, 2), 16) + 65536 * [Convert]::ToInt32($hex.Substring(4, 2), 16))
}
# cor clareada (f = 1 cor cheia, f = 0.15 bem clara), para os selos e as pilulas
function Tinte([string]$hex, [double]$f) {
    $r = [Convert]::ToInt32($hex.Substring(0, 2), 16); $g = [Convert]::ToInt32($hex.Substring(2, 2), 16); $b = [Convert]::ToInt32($hex.Substring(4, 2), 16)
    $r = [int](255 - (255 - $r) * $f); $g = [int](255 - (255 - $g) * $f); $b = [int](255 - (255 - $b) * $f)
    return [int]($r + 256 * $g + 65536 * $b)
}
$P = $cfg.paleta
$FONTE = 'Segoe UI'
$FONTE_FORTE = 'Segoe UI Semibold'
$ano = 'yyyy'
if ((Get-Culture).Name -like 'pt*') { $ano = 'aaaa' }
$fmtData = 'dd/mm/' + $ano
$fmtDataHora = $fmtData + ' hh:mm'
$script:pendente = $false

# cor de cada valor conhecido (Terra, Navio, Atrasado, Lido...): a mesma das pilulas das tabelas e do Power BI
$corDoValor = @{}
foreach ($grupo in $cfg.regras.PSObject.Properties) {
    foreach ($v in $grupo.Value.PSObject.Properties) { if (-not $corDoValor.ContainsKey($v.Name)) { $corDoValor[$v.Name] = $v.Value } }
}

# ---------------------------------------------------------------- tabelas (Power Query -> ODBC)
function Nova-Tabela($wb, $ws, [string]$nomeQuery, [string]$sql, $destino, [string]$nomeTabela, [string]$estilo) {
    $m = 'let' + "`r`n" + '  Fonte = Odbc.Query("' + $cs + '", "' + ($sql -replace '"', '""') + '")' + "`r`n" + 'in' + "`r`n" + '  Fonte'
    [void]$wb.Queries.Add($nomeQuery, $m)
    $conn = 'OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=' + $nomeQuery + ';Extended Properties=""'
    $lo = $ws.ListObjects.Add(0, $conn, $true, 1, $destino)
    $lo.Name = $nomeTabela
    $lo.TableStyle = $estilo
    $lo.ShowTableStyleRowStripes = $false
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

# Tabela leve, como a do Power BI: cabecalho claro com texto escuro, linhas finas so na horizontal, corpo branco,
# pilulas coloridas por valor (fabrica, situacao, resultado...).
function Estilizar-Tabela($ws, $lo, [int]$colIni) {
    $cab = $lo.HeaderRowRange
    $cab.Interior.Color = Rgb $P.cabecalho
    $cab.Font.Color = Rgb $P.texto
    $cab.Font.Bold = $true
    $cab.Font.Name = $FONTE_FORTE
    $cab.Font.Size = 10
    $cab.Borders.Item(9).LineStyle = 1; $cab.Borders.Item(9).Weight = 2; $cab.Borders.Item(9).Color = Rgb $P.azul
    if ($lo.ListRows.Count -gt 0) {
        $corpo = $lo.DataBodyRange
        $corpo.Interior.Color = Rgb 'FFFFFF'
        $corpo.Font.Color = Rgb $P.texto
        $corpo.HorizontalAlignment = -4108
        $corpo.VerticalAlignment = -4108
        $corpo.RowHeight = 21
        foreach ($b in 9, 12) { $corpo.Borders.Item($b).LineStyle = 1; $corpo.Borders.Item($b).Weight = 2; $corpo.Borders.Item($b).Color = Rgb $P.grade }
        foreach ($c in 1..$lo.ListColumns.Count) {
            $col = $lo.ListColumns.Item($c)
            if ($cfg.esquerda -contains $col.Name) { $col.DataBodyRange.HorizontalAlignment = -4131; $col.DataBodyRange.IndentLevel = 1 }
            $regra = $cfg.regras.PSObject.Properties[$col.Name]
            if ($regra) {
                foreach ($v in $regra.Value.PSObject.Properties) {
                    $fc = $col.DataBodyRange.FormatConditions.Add(1, 3, '="' + $v.Name + '"')
                    $fc.Interior.Color = Tinte $v.Value 0.14
                    $fc.Font.Color = Rgb $v.Value
                    $fc.Font.Bold = $true
                }
            }
        }
    }
    foreach ($c in 1..$lo.ListColumns.Count) {
        $coluna = $ws.Columns.Item($colIni + $c - 1)
        $w = [double]($coluna.ColumnWidth) + 3
        if ($w -lt 13) { $w = 13 }
        if ($w -gt 36) { $w = 36 }
        $coluna.ColumnWidth = [double]$w
    }
}

# ---------------------------------------------------------------- formas (cartoes, botoes, textos)
function Texto-Forma($shp, [string]$texto, [double]$tam, [string]$cor, [bool]$forte, [int]$alinhar) {
    $tf = $shp.TextFrame2
    $tf.MarginLeft = 0; $tf.MarginRight = 0; $tf.MarginTop = 0; $tf.MarginBottom = 0
    $tf.WordWrap = 0
    $tf.VerticalAnchor = 3
    $tf.TextRange.Text = $texto
    $tf.TextRange.Font.Name = $(if ($forte) { $FONTE_FORTE } else { $FONTE })
    $tf.TextRange.Font.Size = $tam
    $tf.TextRange.Font.Fill.ForeColor.RGB = Rgb $cor
    $tf.TextRange.ParagraphFormat.Alignment = $alinhar
}
# numero grande de uma forma ligada a uma celula (so a formatacao: escrever texto apagaria a ligacao)
function Fonte-Numero($shp, [double]$tam, [int]$alinhar) {
    $f = $shp.TextFrame2.TextRange.Font
    $f.Name = $FONTE_FORTE; $f.Size = $tam; $f.Bold = -1; $f.Fill.ForeColor.RGB = Rgb $P.texto
    $shp.TextFrame2.TextRange.ParagraphFormat.Alignment = $alinhar
}
function Caixa($ws, [double]$l, [double]$t, [double]$w, [double]$h, [string]$fundo, [string]$borda, [double]$raio) {
    $shp = $ws.Shapes.AddShape(5, $l, $t, $w, $h)
    try { $shp.Adjustments.Item(1) = $raio } catch { }
    if ($fundo) { $shp.Fill.ForeColor.RGB = Rgb $fundo; $shp.Fill.Solid() } else { $shp.Fill.Visible = 0 }
    if ($borda) { $shp.Line.ForeColor.RGB = Rgb $borda; $shp.Line.Weight = 0.75 } else { $shp.Line.Visible = 0 }
    $shp.Shadow.Visible = 0
    $shp.Placement = 3
    return $shp
}
function Rotulo($ws, [double]$l, [double]$t, [double]$w, [double]$h, [string]$texto, [double]$tam, [string]$cor, [bool]$forte) {
    $tb = $ws.Shapes.AddTextbox(1, $l, $t, $w, $h)
    $tb.Fill.Visible = 0; $tb.Line.Visible = 0
    Texto-Forma $tb $texto $tam $cor $forte 1
    $tb.Placement = 3
    return $tb
}

# Cabecalho de toda aba: icone, "LabFlow . Microbiologia", titulo, descricao e a fileira de botoes de navegacao.
function Cabecalho($ws, [string]$titulo, [string]$descricao, [string]$ativo, [string]$cor) {
    $ic = $ws.Shapes.AddShape(9, 14, 12, 36, 36)
    $ic.Fill.ForeColor.RGB = Rgb $cor; $ic.Line.ForeColor.RGB = Rgb (([string]$cor)); $ic.Line.Weight = 3
    $ic.Line.ForeColor.RGB = Tinte $cor 0.3
    $ic.Shadow.Visible = 0; $ic.Placement = 3
    Texto-Forma $ic 'LF' 10 'FFFFFF' $true 2
    [void](Rotulo $ws 58 9 400 12 $cfg.cabecalho.marca 8 $P.texto2 $true)
    [void](Rotulo $ws 58 20 600 22 $titulo 16 $P.texto $true)
    [void](Rotulo $ws 58 42 900 12 $descricao 8.5 $P.texto2 $false)
    $x = 14
    foreach ($nome in $script:navegacao) {
        $w = 22 + 5.6 * $nome.Length
        if ($w -lt 68) { $w = 68 }
        if ($nome -eq $ativo) { $b = Caixa $ws $x 64 $w 26 $P.azul '' 0.2; Texto-Forma $b $nome 9 'FFFFFF' $true 2 }
        else { $b = Caixa $ws $x 64 $w 26 'FFFFFF' $P.borda 0.2; Texto-Forma $b $nome 9 $P.texto $true 2 }
        [void]$ws.Hyperlinks.Add($b, '', "'" + $nome + "'!A1", 'Ir para ' + $nome)
        $x += $w + 6
    }
}

# Cartao: caixa branca arredondada, rotulo, icone num quadradinho colorido, numero grande e selo colorido embaixo.
# O numero vem de uma celula da aba Calculos (a forma fica ligada a ela e atualiza junto com o arquivo).
function Cartao($ws, [double]$l, [double]$t, [double]$w, $ct) {
    $h = 76
    [void](Caixa $ws $l $t $w $h 'FFFFFF' $P.borda 0.12)
    [void](Rotulo $ws ($l + 14) ($t + 10) ($w - 60) 14 $ct.rotulo 9 $P.texto2 $false)
    if ($ct.icone) {
        $q = Caixa $ws ($l + $w - 38) ($t + 9) 26 26 '' '' 0.25
        $q.Fill.Visible = -1; $q.Fill.ForeColor.RGB = Tinte $ct.cor 0.16; $q.Fill.Solid()
        Texto-Forma $q $ct.icone 11 $ct.cor $false 2
        $q.TextFrame2.TextRange.Font.Name = 'Segoe UI Emoji'
    }
    $script:linhaCalc++
    $cel = $script:calc.Cells.Item($script:linhaCalc, 1)
    $cel.Formula = $ct.formula
    $v = $ws.Shapes.AddTextbox(1, $l + 14, $t + 25, $w - 28, 30)
    $v.Fill.Visible = 0; $v.Line.Visible = 0; $v.Placement = 3
    Texto-Forma $v '0' 22 $P.texto $true 1
    # a ligacao com a celula vem por ultimo: escrever texto na forma depois apagaria a ligacao
    $v.DrawingObject.Formula = '=Calculos!$A$' + $script:linhaCalc
    Fonte-Numero $v 22 1
    if ($ct.dica) {
        $pw = 22 + 4.6 * $ct.dica.Length
        $s = Caixa $ws ($l + 12) ($t + $h - 21) $pw 15 '' '' 0.5
        $s.Fill.Visible = -1; $s.Fill.ForeColor.RGB = Tinte $ct.cor 0.14; $s.Fill.Solid()
        Texto-Forma $s ([string][char]0x25CF + ' ' + $ct.dica) 7.5 $ct.cor $true 2
    }
}

# ---------------------------------------------------------------- graficos no tema do Power BI
# rotulos: mostra o numero em cima das barras; corPorValor: pinta cada barra/fatia pela cor do valor (Atrasado = vermelho...)
function Estilo-Grafico($ch, [string]$titulo, [bool]$rotulos, [bool]$corPorPonto) {
    $ch.ChartArea.Font.Name = $FONTE
    $ch.ChartArea.Format.Fill.ForeColor.RGB = Rgb 'FFFFFF'
    $ch.ChartArea.Format.Line.ForeColor.RGB = Rgb $P.borda
    $ch.ChartArea.Format.Line.Weight = 0.75
    try { $ch.ChartArea.RoundedCorners = $true } catch { }
    $ch.PlotArea.Format.Fill.Visible = 0
    $ch.HasTitle = $true
    $ch.ChartTitle.Text = $titulo
    $ch.ChartTitle.Font.Name = $FONTE_FORTE; $ch.ChartTitle.Font.Size = 12; $ch.ChartTitle.Font.Bold = $true
    $ch.ChartTitle.Font.Color = Rgb $P.texto
    try { $ch.ChartTitle.Left = 8; $ch.ChartTitle.Top = 6 } catch { }
    $tipo = $ch.ChartType
    $rosca = ($tipo -eq -4120)
    $nserie = $ch.SeriesCollection().Count
    if ($ch.HasLegend -or $nserie -gt 1 -or $rosca) {
        $ch.HasLegend = $true
        $ch.Legend.Position = $(if ($rosca) { -4107 } else { -4160 })
        $ch.Legend.Font.Size = 9; $ch.Legend.Font.Color = Rgb $P.texto2
        try { $ch.Legend.Left = 8 } catch { }
    }
    for ($s = 1; $s -le $nserie; $s++) {
        $serie = $ch.SeriesCollection($s)
        $cor = $P.series[($s - 1) % $P.series.Count]
        if ($corDoValor.ContainsKey([string]$serie.Name)) { $cor = $corDoValor[[string]$serie.Name] }
        if ($tipo -eq 65 -or $tipo -eq 4) {
            $serie.Format.Line.ForeColor.RGB = Rgb $cor; $serie.Format.Line.Weight = 2.25
            $serie.MarkerStyle = 8; $serie.MarkerSize = 5
            $serie.MarkerBackgroundColor = Rgb $cor; $serie.MarkerForegroundColor = Rgb $cor
        } else {
            $serie.Format.Fill.ForeColor.RGB = Rgb $cor
            $serie.Format.Line.Visible = 0
        }
        if ($corPorPonto -or $rosca) {
            $nomes = @($serie.XValues)
            for ($i = 1; $i -le $nomes.Count; $i++) {
                $n = [string]$nomes[$i - 1]
                $c = $P.series[($i - 1) % $P.series.Count]
                if ($corDoValor.ContainsKey($n)) { $c = $corDoValor[$n] }
                $serie.Points($i).Format.Fill.ForeColor.RGB = Rgb $c
                if ($rosca) { $serie.Points($i).Format.Line.ForeColor.RGB = Rgb 'FFFFFF'; $serie.Points($i).Format.Line.Weight = 2 }
            }
        }
        if ($rotulos) {
            $serie.HasDataLabels = $true
            $dl = $serie.DataLabels()
            $dl.Font.Size = 9; $dl.Font.Color = Rgb $P.texto; $dl.Font.Name = $FONTE_FORTE
            $dl.NumberFormat = '0;-0;;@'
            try { $dl.Position = 2 } catch { }
        }
    }
    if ($rosca) { try { $ch.ChartGroups(1).DoughnutHoleSize = 72 } catch { }; return }
    try { $ch.ChartGroups(1).GapWidth = 55 } catch { }
    try {
        $cat = $ch.Axes(1)
        $cat.Format.Line.ForeColor.RGB = Rgb $P.borda
        $cat.MajorTickMark = -4142
        $cat.TickLabels.Font.Size = 8.5; $cat.TickLabels.Font.Color = Rgb $P.texto2
    } catch { }
    try {
        $val = $ch.Axes(2)
        $val.Format.Line.Visible = 0
        $val.MajorTickMark = -4142
        $val.TickLabels.Font.Size = 8.5; $val.TickLabels.Font.Color = Rgb $P.eixo
        $val.MajorGridlines.Format.Line.ForeColor.RGB = Rgb $P.grade
        $val.MajorGridlines.Format.Line.Weight = 0.75
        $val.MajorGridlines.Format.Line.DashStyle = 4
    } catch { }
}
function Novo-Grafico($ws, [int]$tipo, [double]$l, [double]$t, [double]$w, [double]$h, $origem) {
    $shape = $ws.Shapes.AddChart2(-1, $tipo, $l, $t, $w, $h)
    $shape.Placement = 3
    $ch = $shape.Chart
    $ch.ChartType = $tipo
    $ch.SetSourceData($origem, 2)
    return $ch
}
# linha cuja borda de cima fica a pelo menos $pontos do topo da aba
function Linha-Em($ws, [double]$pontos) {
    $r = 1
    while ($ws.Rows.Item($r).Top -lt $pontos) { $r++ }
    return $r
}
function Preparar-Aba($ws) {
    $ws.Activate()
    $xl.ActiveWindow.DisplayGridlines = $false
    $xl.ActiveWindow.DisplayHeadings = $false
    $xl.ActiveWindow.Zoom = 100
    $ws.Cells.Interior.Color = Rgb $P.fundo
    $ws.Columns.Item(1).ColumnWidth = 1.6
    $ws.Range('A1:A80').RowHeight = 15
}

if (-not $ExcelAberto -and (Get-Process EXCEL -ErrorAction SilentlyContinue)) { throw 'Feche o Excel por completo antes de rodar este script.' }
if (-not (Test-NetConnection 127.0.0.1 -Port 15432 -WarningAction SilentlyContinue).TcpTestSucceeded) {
    throw 'O tunel do banco (localhost:15432) nao esta aberto. Veja docs/scripts.md (tunel-powerbi.ps1).'
}
New-Item -ItemType Directory -Force -Path (Split-Path $Saida) | Out-Null

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
    $wb = $xl.Workbooks.Add()
    $wb.Styles.Item('Normal').Font.Name = $FONTE
    $wb.Styles.Item('Normal').Font.Size = 10
    while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }
    $painel = $wb.Worksheets.Item(1); $painel.Name = 'Painel'
    $paginas = @()
    foreach ($a in $cfg.abas) {
        $ws = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)); $ws.Name = $a.nome
        $paginas += , @($a, $ws)
    }
    $dadosWs = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)); $dadosWs.Name = 'Tendencias (dados)'
    $script:calc = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)); $script:calc.Name = 'Calculos'
    $ajudaWs = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)); $ajudaWs.Name = 'Ajuda'
    $script:linhaCalc = 0
    $script:navegacao = @('Painel') + @($cfg.abas | ForEach-Object { $_.nome }) + @('Ajuda')

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

    # ---- aba de cada analise: cabecalho, cartoes, graficos e a tabela
    foreach ($pg in $paginas) {
        $a = $pg[0]; $ws = $pg[1]
        Preparar-Aba $ws
        $ws.Tab.Color = Rgb $a.cor
        $linhaTabela = Linha-Em $ws 488
        $lo = Nova-Tabela $wb $ws ('t_' + $a.tabela) $a.sql $ws.Cells.Item($linhaTabela, 2) $a.tabela 'TableStyleLight1'
        if ($lo.ListRows.Count -gt 0) { Formatar-Colunas $ws $lo $a.colunas }
        $lo.HeaderRowRange.WrapText = $true
        $lo.HeaderRowRange.HorizontalAlignment = -4108
        $lo.HeaderRowRange.VerticalAlignment = -4108
        $ws.Rows.Item($linhaTabela).RowHeight = 30
        $lo.Range.Columns.AutoFit() | Out-Null
        Estilizar-Tabela $ws $lo 2
        $ws.Columns.Item(1).ColumnWidth = 1.6
        $tit = $ws.Cells.Item($linhaTabela - 1, 2)
        $tit.Value2 = $cfg.cabecalho.registros
        $tit.Font.Name = $FONTE_FORTE; $tit.Font.Size = 12; $tit.Font.Color = Rgb $P.texto
        $ws.Rows.Item($linhaTabela - 1).RowHeight = 24
        $ws.Rows.Item($linhaTabela - 1).VerticalAlignment = -4108

        Cabecalho $ws $a.titulo $a.descricao $a.nome $a.cor
        $n = 0
        foreach ($ct in $a.cartoes) { Cartao $ws (14 + $n * 238) 100 230 $ct; $n++ }
        $k = 0
        foreach ($g in $a.graficos) {
            $k++
            $src = $apoio[$a.tabela + '|' + $k]
            $tipo = 51
            if ($g.tipo -eq 'empilhadas') { $tipo = 52 }
            if ($g.tipo -eq 'linhas') { $tipo = 65 }
            $ch = Novo-Grafico $ws $tipo (14 + ($k - 1) * 476) 186 468 270 $src.Range
            $porDia = ($src.ListColumns.Item(1).Name -eq 'Dia')
            Estilo-Grafico $ch $g.titulo ((-not $porDia) -and $tipo -ne 65) ((-not $porDia) -and $ch.SeriesCollection().Count -eq 1)
            if ($porDia) {
                try { $eixo = $ch.Axes(1); $eixo.CategoryType = 3; $eixo.TickLabels.NumberFormat = 'dd/mm'; $eixo.MajorUnitScale = 0; $eixo.MajorUnit = 7; $eixo.TickLabels.Orientation = 0 } catch { }
            }
        }
        $ws.Range('A1').Select() | Out-Null
        "{0}: {1} linhas" -f $a.nome, $lo.ListRows.Count
    }

    # ---- painel (visao geral)
    Preparar-Aba $painel
    $painel.Tab.Color = Rgb $P.azul
    $pc = $cfg.painel
    Cabecalho $painel $pc.titulo $pc.descricao 'Painel' $P.azul
    $n = 0
    foreach ($ct in $pc.cartoes) { Cartao $painel (14 + ($n % 4) * 238) (100 + [Math]::Floor($n / 4) * 84) 230 $ct; $n++ }
    $topo = 100 + [Math]::Ceiling($pc.cartoes.Count / 4) * 84 + 4
    $C = $script:calc
    # andamento das leituras de NFC: por analise, quantas lidas, vencendo hoje, atrasadas e no prazo
    $C.Cells.Item(1, 3).Value2 = $pc.andamento.titulo
    for ($j = 0; $j -lt $pc.andamento.situacoes.Count; $j++) { $C.Cells.Item(2, 4 + $j).Value2 = $pc.andamento.situacoes[$j] }
    for ($i = 0; $i -lt $pc.andamento.analises.Count; $i++) {
        $an = $pc.andamento.analises[$i]
        $C.Cells.Item(3 + $i, 3).Value2 = $an
        for ($j = 0; $j -lt $pc.andamento.situacoes.Count; $j++) {
            $C.Cells.Item(3 + $i, 4 + $j).Formula = '=COUNTIFS(' + $pc.andamento.tabela + '[' + $pc.andamento.colunaAnalise + '],"' + $an + '",' + $pc.andamento.tabela + '[' + $pc.andamento.colunaSituacao + '],"' + $pc.andamento.situacoes[$j] + '")'
        }
    }
    $fimAnd = 2 + $pc.andamento.analises.Count
    $ch = Novo-Grafico $painel 59 14 $topo 340 240 $C.Range($C.Cells.Item(2, 3), $C.Cells.Item($fimAnd, 3 + $pc.andamento.situacoes.Count))
    Estilo-Grafico $ch $pc.andamento.titulo $false $false
    try { $ch.ChartGroups(1).GapWidth = 90; $ch.Axes(2).TickLabels.NumberFormat = '0%' } catch { }
    # atrasados por area
    $C.Cells.Item(1, 10).Value2 = $pc.areas.titulo
    $C.Cells.Item(2, 10).Value2 = $pc.areas.cabecalho[0]; $C.Cells.Item(2, 11).Value2 = $pc.areas.cabecalho[1]
    for ($i = 0; $i -lt $pc.areas.linhas.Count; $i++) {
        $C.Cells.Item(3 + $i, 10).Value2 = $pc.areas.linhas[$i].nome
        $C.Cells.Item(3 + $i, 11).Formula = $pc.areas.linhas[$i].formula
    }
    $fimAr = 2 + $pc.areas.linhas.Count
    $ch = Novo-Grafico $painel 57 362 $topo 300 240 $C.Range($C.Cells.Item(2, 10), $C.Cells.Item($fimAr, 11))
    Estilo-Grafico $ch $pc.areas.titulo $true $false
    $ch.HasLegend = $false
    try { $ch.Axes(1).ReversePlotOrder = $true; $ch.Axes(2).HasMajorGridlines = $false; $ch.Axes(2).TickLabels.Font.Color = Rgb 'FFFFFF'; $ch.ChartGroups(1).GapWidth = 70 } catch { }
    for ($i = 0; $i -lt $pc.areas.linhas.Count; $i++) { $ch.SeriesCollection(1).Points($i + 1).Format.Fill.ForeColor.RGB = Rgb $pc.areas.linhas[$i].cor }
    # situacao das leituras de NFC (rosca com o total no meio)
    $C.Cells.Item(1, 13).Value2 = $pc.situacao.titulo
    $C.Cells.Item(2, 13).Value2 = $pc.situacao.cabecalho[0]; $C.Cells.Item(2, 14).Value2 = $pc.situacao.cabecalho[1]
    for ($i = 0; $i -lt $pc.situacao.valores.Count; $i++) {
        $C.Cells.Item(3 + $i, 13).Value2 = $pc.situacao.valores[$i]
        $C.Cells.Item(3 + $i, 14).Formula = '=COUNTIFS(' + $pc.situacao.tabela + '[' + $pc.situacao.coluna + '],"' + $pc.situacao.valores[$i] + '")'
    }
    $fimSit = 2 + $pc.situacao.valores.Count
    $C.Cells.Item($fimSit + 1, 13).Value2 = 'Total'
    $C.Cells.Item($fimSit + 1, 14).Formula = '=SUM(N3:N' + $fimSit + ')'
    $lRosca = 670; $wRosca = 288
    $ch = Novo-Grafico $painel -4120 $lRosca $topo $wRosca 240 $C.Range($C.Cells.Item(2, 13), $C.Cells.Item($fimSit, 14))
    Estilo-Grafico $ch $pc.situacao.titulo $false $true
    try {
        $pa = $ch.PlotArea
        $cx = $lRosca + $pa.InsideLeft + $pa.InsideWidth / 2
        $cy = $topo + $pa.InsideTop + $pa.InsideHeight / 2
        $tot = $painel.Shapes.AddTextbox(1, $cx - 50, $cy - 16, 100, 32)
        $tot.Fill.Visible = 0; $tot.Line.Visible = 0; $tot.Placement = 3
        Texto-Forma $tot '0' 24 $P.texto $true 2
        $tot.DrawingObject.Formula = '=Calculos!$N$' + ($fimSit + 1)
        Fonte-Numero $tot 26 2
    } catch { }
    # coletas por dia (terra e navio): o mesmo dado do grafico da aba Coletas
    $topo2 = $topo + 250
    $src = $apoio[$pc.coletasPorDia.origem]
    if ($src) {
        $ch = Novo-Grafico $painel 52 14 $topo2 476 260 $src.Range
        Estilo-Grafico $ch $pc.coletasPorDia.titulo $false $false
        try { $eixo = $ch.Axes(1); $eixo.CategoryType = 3; $eixo.TickLabels.NumberFormat = 'dd/mm'; $eixo.MajorUnitScale = 0; $eixo.MajorUnit = 7; $eixo.TickLabels.Orientation = 0 } catch { }
    }
    # testes por mes (ultimos 6 meses)
    $C.Cells.Item(1, 16).Value2 = $pc.testesPorMes.titulo
    $C.Cells.Item(2, 16).Value2 = $pc.testesPorMes.cabecalho
    for ($j = 0; $j -lt $pc.testesPorMes.series.Count; $j++) { $C.Cells.Item(2, 17 + $j).Value2 = $pc.testesPorMes.series[$j].nome }
    for ($i = 0; $i -lt 6; $i++) {
        $r = 3 + $i
        $C.Cells.Item($r, 16).Formula = '=EOMONTH(TODAY(),' + ($i - 6) + ')+1'
        $C.Cells.Item($r, 16).NumberFormatLocal = 'mmm/' + $ano.Substring(0, 2)
        for ($j = 0; $j -lt $pc.testesPorMes.series.Count; $j++) {
            $s = $pc.testesPorMes.series[$j]
            $C.Cells.Item($r, 17 + $j).Formula = '=COUNTIFS(' + $s.coluna + ',">="&P' + $r + ',' + $s.coluna + ',"<"&EDATE(P' + $r + ',1))'
        }
    }
    $ch = Novo-Grafico $painel 51 496 $topo2 462 260 $C.Range($C.Cells.Item(2, 16), $C.Cells.Item(8, 16 + $pc.testesPorMes.series.Count))
    Estilo-Grafico $ch $pc.testesPorMes.titulo $true $false
    try { $ch.Axes(1).CategoryType = 2 } catch { }
    $painel.Range('A1').Select() | Out-Null

    # ---- ajuda
    Preparar-Aba $ajudaWs
    $ajudaWs.Tab.Color = Rgb $P.texto2
    Cabecalho $ajudaWs $cfg.cabecalho.ajudaTitulo $cfg.cabecalho.ajudaDescricao 'Ajuda' $P.texto2
    $ajudaWs.Columns.Item(2).ColumnWidth = 130
    $l0 = Linha-Em $ajudaWs 104
    for ($i = 0; $i -lt $cfg.ajuda.Count; $i++) {
        $c = $ajudaWs.Cells.Item($l0 + $i, 2)
        $c.Value2 = $cfg.ajuda[$i]; $c.Font.Color = Rgb $P.texto; $c.WrapText = $true
    }
    $ajudaWs.Cells.Item($l0, 2).Font.Name = $FONTE_FORTE; $ajudaWs.Cells.Item($l0, 2).Font.Size = 14

    # abas de apoio escondidas; o painel abre primeiro
    $dadosWs.Tab.Color = Rgb 'CBD5E1'
    foreach ($c in 1..$colunaDados) { $dadosWs.Columns.Item($c).ColumnWidth = 14 }
    $dadosWs.Visible = 0
    $script:calc.Visible = 0
    $painel.Activate()

    if ($Pdf) {
        foreach ($w in $wb.Worksheets) {
            if ($w.Visible -ne -1) { continue }
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
