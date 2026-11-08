# Installs SuperVibeCode on Windows:  irm https://supervibecode.ai.id/install.ps1 | iex
#
# A download made by PowerShell carries no mark of the web, so SmartScreen doesn't stop the installer the way it stops
# an unsigned one downloaded in a browser. Run it again to update.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repo = if ($env:SUPERVIBECODE_REPO) { $env:SUPERVIBECODE_REPO } else { "latjoromhi25d-dotcom/SuperVibeCode" }
$url = "https://github.com/$repo/releases/latest/download/supervibecode-desktop-win-x64.exe"
$installer = Join-Path ([System.IO.Path]::GetTempPath()) "SuperVibeCode-Setup.exe"

Write-Host "Downloading SuperVibeCode..."
Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing

try {
  Write-Host "Installing. SuperVibeCode opens when it's done."
  Start-Process -FilePath $installer -Wait
}
finally {
  Remove-Item $installer -Force -ErrorAction SilentlyContinue
}
