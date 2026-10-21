$ErrorActionPreference = 'Stop'
$taskSiteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskDist = Join-Path $taskSiteRoot 'dist'
$taskRelease = Join-Path $taskSiteRoot '.release'
$taskZipPath = Join-Path $taskRelease 'social-command-center-pages.zip'

# Static packaging only. No account access, upload, deployment or application startup.
& node (Join-Path $PSScriptRoot 'build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Static build failed' }
& node (Join-Path $PSScriptRoot 'check.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Static artifact validation failed' }

$taskAllowed = @('.assetsignore', '404.html', '_headers', '_worker.js', 'favicon.svg', 'index.html', 'privacy.html', 'robots.txt', 'styles.css', 'support.html', 'terms.html')
$taskFiles = @(Get-ChildItem -LiteralPath $taskDist -Force)
if ($taskFiles.Count -ne $taskAllowed.Count) { throw 'Unexpected deployment directory entry count' }
foreach ($taskFile in $taskFiles) {
    if ($taskFile.PSIsContainer -or $taskFile.Name -notin $taskAllowed -or ($taskFile.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Deployment directory contains an unexpected file, directory or link'
    }
}
New-Item -ItemType Directory -Path $taskRelease -Force | Out-Null
Compress-Archive -LiteralPath @($taskAllowed | ForEach-Object { Join-Path $taskDist $_ }) -DestinationPath $taskZipPath -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchive = [IO.Compression.ZipFile]::OpenRead($taskZipPath)
$taskManifestFiles = @()
try {
    if ($taskArchive.Entries.Count -ne $taskAllowed.Count) { throw 'ZIP entry count mismatch' }
    if (@(Compare-Object @($taskArchive.Entries.FullName | Sort-Object) @($taskAllowed | Sort-Object)).Count -ne 0) {
        throw 'ZIP must contain exactly the approved files at its root'
    }
    foreach ($taskEntry in $taskArchive.Entries) {
        $taskStream = $taskEntry.Open()
        $taskSha = [Security.Cryptography.SHA256]::Create()
        try { $taskZipHash = ([BitConverter]::ToString($taskSha.ComputeHash($taskStream))).Replace('-', '').ToLowerInvariant() }
        finally { $taskStream.Dispose(); $taskSha.Dispose() }
        $taskSourceFile = Get-Item -LiteralPath (Join-Path $taskDist $taskEntry.FullName)
        $taskSourceHash = (Get-FileHash -LiteralPath $taskSourceFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($taskZipHash -ne $taskSourceHash -or $taskEntry.Length -ne $taskSourceFile.Length) { throw 'ZIP contents differ from the validated build' }
        $taskManifestFiles += [ordered]@{ name = $taskEntry.FullName; bytes = $taskEntry.Length; sha256 = $taskZipHash }
    }
}
finally { $taskArchive.Dispose() }

$taskManifest = [ordered]@{
    status = 'Social Command Center static release package with TikTok OAuth relay for Cloudflare Workers (billowing-leaf-7ccd)'
    deployed = $false
    effective_date = '2026-10-20'
    worker_target = 'billowing-leaf-7ccd.mamduh2542.workers.dev'
    archive = 'social-command-center-pages.zip'
    archive_sha256 = (Get-FileHash -LiteralPath $taskZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    files = $taskManifestFiles
}
$taskEncoding = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $taskRelease 'manifest.json'), ($taskManifest | ConvertTo-Json -Depth 5) + [Environment]::NewLine, $taskEncoding)
[IO.File]::WriteAllText((Join-Path $taskRelease 'DEPLOYMENT_NOTE.txt'), "Social Command Center public website static release with TikTok OAuth callback relay.`r`nTarget: billowing-leaf-7ccd.mamduh2542.workers.dev`r`nEffective Date: 20 October 2026.`r`nContains 11 entries (including _worker.js OAuth relay and .assetsignore).`r`nDeploy manually to the existing Cloudflare Worker billowing-leaf-7ccd.`r`n", $taskEncoding)
if (Test-Path (Join-Path $taskRelease 'REVIEW_REQUIRED.txt')) { Remove-Item (Join-Path $taskRelease 'REVIEW_REQUIRED.txt') -Force }
Write-Output "PASS: upload package verified ($($taskAllowed.Count) root entries). Ready for manual deployment."
Write-Output $taskZipPath
