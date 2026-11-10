# Installs SuperVibeCode on Windows:  irm https://raw.githubusercontent.com/latjoromhi25d-dotcom/SuperVibeCode/main/landingpage/install.ps1 | iex
#
# A download made by PowerShell carries no mark of the web, so SmartScreen doesn't stop the installer the way it stops
# an unsigned one downloaded in a browser. Run it again to update.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repo = if ($env:SUPERVIBECODE_REPO) { $env:SUPERVIBECODE_REPO } else { "latjoromhi25d-dotcom/SuperVibeCode" }
$url = "https://github.com/$repo/releases/latest/download/supervibecode-desktop-win-x64.exe"
$installer = Join-Path ([System.IO.Path]::GetTempPath()) "SuperVibeCode-Setup.exe"

Write-Host "Downloading SuperVibeCode..."
try {
  Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
}
catch {
  # GitHub's download link sometimes answers 504 in some regions while its API still serves the same file.
  Write-Host "Trying another download route..."
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -UseBasicParsing
  $asset = $release.assets | Where-Object { $_.name -eq "supervibecode-desktop-win-x64.exe" } | Select-Object -First 1
  if (-not $asset) { throw "Download failed. Get the installer from https://github.com/$repo/releases/latest" }
  Invoke-WebRequest -Uri $asset.url -Headers @{ Accept = "application/octet-stream" } -OutFile $installer -UseBasicParsing
}

try {
  Write-Host "Installing. SuperVibeCode opens when it's done."
  Start-Process -FilePath $installer -Wait
}
finally {
  Remove-Item $installer -Force -ErrorAction SilentlyContinue
}
