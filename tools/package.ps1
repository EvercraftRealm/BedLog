$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot "dist"
$archivePath = Join-Path $distRoot "BedLog.zip"
$packPath = Join-Path $distRoot "BedLog.mcpack"

if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
if (Test-Path -LiteralPath $packPath) { Remove-Item -LiteralPath $packPath -Force }

Compress-Archive -Path (Join-Path $projectRoot "BedLog\*") -DestinationPath $archivePath -CompressionLevel Optimal
Move-Item -LiteralPath $archivePath -Destination $packPath
Write-Output "Created $packPath"

