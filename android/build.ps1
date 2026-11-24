[CmdletBinding()]
param(
  [string] $SdkRoot = $env:ANDROID_HOME,
  [string] $JdkHome = $env:JAVA_HOME,
  [Parameter(Mandatory)] [string] $Keystore,
  [string] $Alias = 'balance',
  [string] $OutFile = 'Balance.apk'
)
$ErrorActionPreference = 'Stop'

function Invoke-Tool($Tool, $Arguments) {
  & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Build step failed: $Tool ($LASTEXITCODE)" }
}

if (!$SdkRoot -or !$JdkHome) { throw 'Specify -SdkRoot and -JdkHome or set ANDROID_HOME and JAVA_HOME.' }
$sdk = (Resolve-Path -LiteralPath $SdkRoot).Path
$jdk = (Resolve-Path -LiteralPath $JdkHome).Path
$key = (Resolve-Path -LiteralPath $Keystore).Path
$out = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile)
$outDir = (Resolve-Path -LiteralPath ([IO.Path]::GetDirectoryName($out))).Path
$tools = Join-Path $sdk 'build-tools/35.0.0'
$androidJar = Join-Path $sdk 'platforms/android-35/android.jar'
$javaFile = Join-Path $PSScriptRoot 'java/io/github/eduardgarifzyanov/balance/MainActivity.java'
$public = Join-Path (Split-Path $PSScriptRoot -Parent) 'public'
$temp = Join-Path $outDir ('balance-apk-' + [Guid]::NewGuid().ToString('N'))
$previousJava = $env:JAVA_HOME
$env:JAVA_HOME = $jdk
$entered = $false

try {
  New-Item -ItemType Directory -Path "$temp/assets","$temp/classes","$temp/dex","$temp/res/mipmap-xxxhdpi" | Out-Null
  Push-Location -LiteralPath $temp
  $entered = $true
  Copy-Item -LiteralPath "$public/app.js","$public/style.css","$public/icon.svg","$PSScriptRoot/offline.js" -Destination 'assets'
  Copy-Item -LiteralPath "$public/icon-192.png" -Destination 'res/mipmap-xxxhdpi/ic_launcher.png'
  Copy-Item -LiteralPath "$PSScriptRoot/res/values" -Destination 'res/values' -Recurse
  Copy-Item -LiteralPath "$PSScriptRoot/AndroidManifest.xml",$androidJar,$javaFile -Destination '.'
  $html = [IO.File]::ReadAllText("$public/index.html")
  $html = $html.Replace('<link rel="manifest" href="/manifest.json">', '')
  $entry = '<script src="/app.js" defer></script>'
  if (!$html.Contains($entry)) { throw 'Cannot find application entry script' }
  $html = $html.Replace($entry, '<script src="/offline.js" defer></script>' + $entry)
  [IO.File]::WriteAllText("$temp/assets/index.html", $html)

  Invoke-Tool "$tools/aapt2.exe" @('compile','--dir','res','-o','resources.zip')
  Invoke-Tool "$tools/aapt2.exe" @('link','-o','unsigned.apk','-I','android.jar','--manifest','AndroidManifest.xml','-A','assets','--auto-add-overlay','-R','resources.zip')
  Invoke-Tool "$jdk/bin/javac.exe" @('--release','8','-encoding','UTF-8','-cp','android.jar','-d','classes','MainActivity.java')
  Invoke-Tool "$jdk/bin/jar.exe" @('cMf','classes.jar','-C','classes','.')
  Invoke-Tool "$tools/d8.bat" @('--release','--min-api','26','--lib','android.jar','--output','dex','classes.jar')
  Invoke-Tool "$jdk/bin/jar.exe" @('uf','unsigned.apk','-C','dex','classes.dex')
  Invoke-Tool "$tools/zipalign.exe" @('-f','4','unsigned.apk','aligned.apk')
  $sign = @('sign','--ks',$key,'--ks-key-alias',$Alias,'--out','signed.apk')
  if ($env:BALANCE_ANDROID_KS_PASS) { $sign += @('--ks-pass','env:BALANCE_ANDROID_KS_PASS') }
  Invoke-Tool "$tools/apksigner.bat" ($sign + 'aligned.apk')
  Invoke-Tool "$tools/apksigner.bat" @('verify','--verbose','signed.apk')
  Copy-Item -LiteralPath 'signed.apk' -Destination $out
  Get-FileHash -LiteralPath $out -Algorithm SHA256
} finally {
  $env:JAVA_HOME = $previousJava
  if ($entered) { Pop-Location }
  if (Test-Path -LiteralPath $temp) {
    $resolved = (Resolve-Path -LiteralPath $temp).Path
    if ([IO.Path]::GetDirectoryName($resolved) -eq $outDir -and
        [IO.Path]::GetFileName($resolved) -match '^balance-apk-[a-f0-9]{32}$') {
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}

