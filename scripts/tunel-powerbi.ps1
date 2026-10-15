# Mantém o túnel SSH do Power BI sempre de pé: localhost:15432 -> banco do servidor (porta 5432).
# Se a conexão cair, ele reconecta sozinho em 10 segundos. Descobre o IP do banco a cada tentativa,
# então continua funcionando se o contêiner for recriado.
# Uso manual:  powershell -File scripts\tunel-powerbi.ps1
# Para iniciar com o Windows, ver docs/scripts.md (tarefa agendada "LabFlow túnel Power BI").
# Pré-requisito: o apelido "labflow" no ~/.ssh/config (chave SSH, sem senha).
$ErrorActionPreference = 'Continue'
$porta = 15432
while ($true) {
    $ip = (ssh -o BatchMode=yes -o ClearAllForwardings=yes labflow "docker inspect labflow-postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'" 2>$null | Select-Object -First 1)
    if ($ip -match '^\d{1,3}(\.\d{1,3}){3}$') {
        # ExitOnForwardFailure: se a porta já estiver em uso (outro túnel aberto), sai e tenta de novo depois
        ssh -N -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -L "${porta}:${ip}:5432" labflow
    }
    Start-Sleep -Seconds 10
}
