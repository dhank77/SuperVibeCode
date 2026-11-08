param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Path
)

$ErrorActionPreference = "Stop"

if (-not $Path -or $Path.Count -eq 0) {
  throw "At least one path is required"
}

if ($env:GITHUB_ACTIONS -ne "true") {
  Write-Host "Skipping Windows signing because this is not running on GitHub Actions"
  exit 0
}

$files = @($Path | ForEach-Object { Resolve-Path $_ -ErrorAction SilentlyContinue } | Select-Object -ExpandProperty Path -Unique)

if (-not $files -or $files.Count -eq 0) {
  throw "No files matched the requested paths"
}

# SSL.com eSigner: a cloud code signing certificate that can sign unattended from CI, for publishers outside the
# countries Azure Artifact Signing serves.
$ssl = @{
  username = $env:SSLDOTCOM_USERNAME
  password = $env:SSLDOTCOM_PASSWORD
  credential = $env:SSLDOTCOM_CREDENTIAL_ID
  totp = $env:SSLDOTCOM_TOTP_SECRET
}

if (-not ($ssl.Values | Where-Object { -not $_ })) {
  $tools = Join-Path ($env:RUNNER_TEMP ?? [System.IO.Path]::GetTempPath()) "CodeSignTool"
  $tool = Get-ChildItem -Path $tools -Filter "CodeSignTool.bat" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1

  if (-not $tool) {
    $zip = "$tools.zip"
    Invoke-WebRequest -Uri "https://www.ssl.com/download/codesigntool-for-windows/" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $tools -Force
    $tool = Get-ChildItem -Path $tools -Filter "CodeSignTool.bat" -Recurse | Select-Object -First 1
  }

  foreach ($file in $files) {
    Write-Host "Signing $file with SSL.com eSigner"
    Push-Location $tool.DirectoryName
    try {
      # The arguments hold the credentials, so the tool's own output is all that is logged.
      $output = & cmd /c "CodeSignTool.bat" sign "-input_file_path=$file" "-username=$($ssl.username)" `
        "-password=$($ssl.password)" "-credential_id=$($ssl.credential)" "-totp_secret=$($ssl.totp)" "-override=true" 2>&1
      Write-Host ($output -join "`n")
      if ($LASTEXITCODE -ne 0 -or ($output -join "`n") -match "(?m)^Error") { throw "SSL.com eSigner could not sign $file" }
    }
    finally {
      Pop-Location
    }
  }

  exit 0
}

$vars = @{
  endpoint = $env:AZURE_TRUSTED_SIGNING_ENDPOINT
  account = $env:AZURE_TRUSTED_SIGNING_ACCOUNT_NAME
  profile = $env:AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE
}

if ($vars.Values | Where-Object { -not $_ }) {
  Write-Host "Skipping Windows signing because neither SSL.com eSigner nor Azure Artifact Signing is configured"
  exit 0
}

$moduleVersion = "0.5.8"
$module = Get-Module -ListAvailable -Name TrustedSigning | Where-Object { $_.Version -eq [version] $moduleVersion }

if (-not $module) {
  try {
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
  }
  catch {
    Write-Host "NuGet package provider install skipped: $($_.Exception.Message)"
  }

  Install-Module -Name TrustedSigning -RequiredVersion $moduleVersion -Force -Repository PSGallery -Scope CurrentUser
}

Import-Module TrustedSigning -RequiredVersion $moduleVersion -Force

$params = @{
  Endpoint                         = $vars.endpoint
  CodeSigningAccountName           = $vars.account
  CertificateProfileName           = $vars.profile
  Files                            = ($files -join ",")
  FileDigest                       = "SHA256"
  TimestampDigest                  = "SHA256"
  TimestampRfc3161                 = "http://timestamp.acs.microsoft.com"
  ExcludeEnvironmentCredential     = $true
  ExcludeWorkloadIdentityCredential = $true
  ExcludeManagedIdentityCredential = $true
  ExcludeSharedTokenCacheCredential = $true
  ExcludeVisualStudioCredential    = $true
  ExcludeVisualStudioCodeCredential = $true
  ExcludeAzureCliCredential        = $false
  ExcludeAzurePowerShellCredential = $true
  ExcludeAzureDeveloperCliCredential = $true
  ExcludeInteractiveBrowserCredential = $true
}

Invoke-TrustedSigning @params
