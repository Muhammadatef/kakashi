#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$MinNode = 18

function Write-Color($Message, $Color = "White") {
    Write-Host $Message -ForegroundColor $Color
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Color "Node.js is required (>= $MinNode). Install from https://nodejs.org/" Red
    exit 1
}

$nodeVersion = node -e "process.stdout.write(process.versions.node.split('.')[0])"
if ([int]$nodeVersion -lt $MinNode) {
    Write-Color "Node.js >= $MinNode required" Red
    exit 1
}

Write-Color "Kakashi Installer" Cyan
Write-Host ""

try {
    npm install -g @muhammadatef/kakashi 2>$null
    Write-Color "Installed @muhammadatef/kakashi globally via npm" Green
} catch {
    Write-Color "Falling back to local install..." Yellow
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallJs = Join-Path $ScriptDir "bin\install.js"

if (Test-Path $InstallJs) {
    $argsList = @("--all") + $args
    node $InstallJs @argsList
} else {
    Write-Color "Run from the kakashi repo root, or clone first." Yellow
    exit 1
}

Write-Color "Installation complete." Green
