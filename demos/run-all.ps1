$ErrorActionPreference = "Stop"
$DemoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $DemoDir "demo.js") all
