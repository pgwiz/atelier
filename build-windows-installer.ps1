<#
.SYNOPSIS
    Builds the complete Windows release for Atelier:
    1. Compiles optimized release binary with embedded icon & metadata
    2. Builds official Windows Setup Installer (.exe) via Inno Setup
    3. Builds zero-install Portable Release (.zip)
#>

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "   Building Atelier Windows Distribution Packages" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Ensure Icon Exists
if (-not (Test-Path "installer\atelier.ico")) {
    Write-Host "[1/6] Generating Windows multi-resolution icon..." -ForegroundColor Yellow
    python installer\generate_ico.py
} else {
    Write-Host "[1/6] Windows application icon ready." -ForegroundColor Green
}

# Stop any running instances that could lock release binaries
Get-Process atelier, atelier-launcher -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$ScriptDir*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

# 2. Compile Release Binary
Write-Host "[2/6] Compiling release binary with Cargo..." -ForegroundColor Yellow
cargo build --release
if ($LASTEXITCODE -ne 0) {
    Write-Error "Cargo release build failed with exit code $LASTEXITCODE"
}
Write-Host "Binary built: target\release\atelier.exe" -ForegroundColor Green

# 3. Compile Mini UI Launcher
Write-Host "[3/6] Compiling Atelier Mini UI Launcher with C# Compiler..." -ForegroundColor Yellow
$CscCandidates = @(
    "$env:windir\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:windir\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$CscPath = $null
foreach ($cand in $CscCandidates) {
    if (Test-Path $cand) {
        $CscPath = $cand
        break
    }
}
if (-not $CscPath) {
    $whereCsc = Get-Command "csc.exe" -ErrorAction SilentlyContinue
    if ($whereCsc) {
        $CscPath = $whereCsc.Source
    }
}
if (-not $CscPath) {
    Write-Error "Could not find csc.exe. Please ensure .NET Framework is installed."
}

& $CscPath /target:winexe /platform:anycpu /win32icon:installer\atelier.ico /out:target\release\atelier-launcher.exe /r:System.Windows.Forms.dll,System.Drawing.dll /optimize+ /nologo src\launcher.cs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Mini UI Launcher compilation failed with exit code $LASTEXITCODE"
}
Write-Host "Launcher built: target\release\atelier-launcher.exe" -ForegroundColor Green

# 4. Locate Inno Setup Compiler (ISCC.exe)
Write-Host "[4/6] Locating Inno Setup Compiler..." -ForegroundColor Yellow
$IsccCandidates = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
)

$IsccPath = $null
foreach ($cand in $IsccCandidates) {
    if (Test-Path $cand) {
        $IsccPath = $cand
        break
    }
}

if (-not $IsccPath) {
    $whereIscc = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
    if ($whereIscc) {
        $IsccPath = $whereIscc.Source
    }
}

if (-not $IsccPath) {
    Write-Error "Could not find ISCC.exe. Please install Inno Setup 6."
}
Write-Host "Found Inno Setup Compiler: $IsccPath" -ForegroundColor Green

# Ensure dist output directory exists
New-Item -ItemType Directory -Force -Path "dist" | Out-Null

# 5. Compile Windows Installer (.exe)
Write-Host "[5/6] Compiling Inno Setup Windows Installer..." -ForegroundColor Yellow
& $IsccPath /Qp "installer\atelier.iss"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Inno Setup compilation failed with exit code $LASTEXITCODE"
}
Write-Host "Installer built: dist\Atelier-Setup-v0.1.0-x64.exe" -ForegroundColor Green

# 6. Build Portable ZIP Package
Write-Host "[6/6] Packaging portable distribution (.zip)..." -ForegroundColor Yellow
$PortableStage = "dist\portable_staging\Atelier"
if (Test-Path $PortableStage) {
    Remove-Item -Recurse -Force $PortableStage
}
New-Item -ItemType Directory -Force -Path $PortableStage | Out-Null

Copy-Item "target\release\atelier.exe" -Destination $PortableStage -Force
Copy-Item "target\release\atelier-launcher.exe" -Destination $PortableStage -Force
Copy-Item "README.md" -Destination $PortableStage -Force
Copy-Item "installer\atelier.ico" -Destination $PortableStage -Force
Copy-Item "installer\run-atelier.bat" -Destination $PortableStage -Force
Copy-Item -Recurse "static" -Destination $PortableStage -Force

$ZipOutput = "dist\Atelier-v0.1.0-windows-x64-portable.zip"
if (Test-Path $ZipOutput) {
    Remove-Item -Force $ZipOutput
}

# Create zip using tar for high-performance compression
tar -a -c -f $ZipOutput -C "dist\portable_staging" "Atelier"
Remove-Item -Recurse -Force "dist\portable_staging"

Write-Host "Portable package built: $ZipOutput" -ForegroundColor Green

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "   Windows Build Artifacts Summary" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$Installer = Get-Item "dist\Atelier-Setup-v0.1.0-x64.exe"
$Zip = Get-Item "dist\Atelier-v0.1.0-windows-x64-portable.zip"

$InstallerHash = (Get-FileHash $Installer.FullName -Algorithm SHA256).Hash
$ZipHash = (Get-FileHash $Zip.FullName -Algorithm SHA256).Hash

Write-Host ""
Write-Host "1. Windows Installer:" -ForegroundColor Yellow
Write-Host "   Path:   $($Installer.FullName)"
Write-Host "   Size:   $([math]::Round($Installer.Length / 1MB, 2)) MB ($($Installer.Length) bytes)"
Write-Host "   SHA256: $InstallerHash"

Write-Host ""
Write-Host "2. Portable Package:" -ForegroundColor Yellow
Write-Host "   Path:   $($Zip.FullName)"
Write-Host "   Size:   $([math]::Round($Zip.Length / 1MB, 2)) MB ($($Zip.Length) bytes)"
Write-Host "   SHA256: $ZipHash"
Write-Host ""
Write-Host "Build completed successfully!" -ForegroundColor Green
