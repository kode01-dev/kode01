# Script de synchronisation automatique .env.production -> Vercel Production
$envFile = ".env.production"

if (-Not (Test-Path $envFile)) {
    Write-Host "Erreur : Fichier $envFile introuvable." -ForegroundColor Red
    exit
}

Write-Host "Début de la synchronisation vers Vercel Production..." -ForegroundColor Cyan

Get-Content $envFile | ForEach-Object {
    # Match lines that are not comments and contain an equal sign
    if ($_ -match "^(?<key>[^#\s][^=]+)=(?<value>.*)$") {
        $key = $Matches['key'].Trim()
        $value = $Matches['value'].Trim()
        
        # Ignorer les lignes vides ou malformées
        if (-not $key) { return }

        Write-Host "Synchronisation de : $key"
        # Utilisation de Pipe pour passer la valeur à vercel env add pour éviter le prompt interactif
        echo $value | vercel env add $key production
    }
}

Write-Host "`nSynchronisation terminée !" -ForegroundColor Green
Write-Host "Note : Si des erreurs 'No existing credentials found' apparaissent, lancez 'vercel login' puis relancez ce script." -ForegroundColor Yellow
