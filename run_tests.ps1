$env:PATH = "C:\Users\mamdu\AppData\Roaming\nvm\v22.23.1;" + $env:PATH
Set-Location -Path $PSScriptRoot
npm test
exit $LASTEXITCODE
