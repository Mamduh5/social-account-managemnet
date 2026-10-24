$ErrorActionPreference='Stop'
$env:PATH = "C:\Users\mamdu\AppData\Roaming\nvm\v22.23.1;" + $env:PATH
Set-Location -LiteralPath $PSScriptRoot
node --import tsx scripts/owner-runtime.ts start
exit $LASTEXITCODE
