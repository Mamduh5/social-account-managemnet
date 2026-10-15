$env:PATH = "C:\Users\mamdu\AppData\Roaming\nvm\v22.23.1;" + $env:PATH
Set-Location -Path "$PSScriptRoot\client"
npm install -D @tailwindcss/postcss
npm run build
