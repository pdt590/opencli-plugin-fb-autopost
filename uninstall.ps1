#Requires -Version 5.1
[CmdletBinding()]
param([switch]$Help)
$ErrorActionPreference = 'Stop'
if ($Help) {
    Write-Output 'Usage: .\uninstall.ps1'
    Write-Output 'Remove social-autopost and the global social-autopost skill for Hermes only.'
    Write-Output 'Preserve source, configuration, artifacts, dependencies, Chrome and OpenCLI.'
    exit 0
}
$failed = $false
Push-Location -LiteralPath $PSScriptRoot
try {
    try {
        if ((Test-Path -LiteralPath 'node_modules/@jackwener/opencli/package.json') -and (Get-Command npx.cmd -ErrorAction SilentlyContinue)) {
            & npx.cmd --no-install opencli plugin uninstall social-autopost
        } elseif (Get-Command opencli.cmd -ErrorAction SilentlyContinue) {
            & opencli.cmd plugin uninstall social-autopost
        } else { throw 'OpenCLI not found; plugin removal could not be verified.' }
        if ($LASTEXITCODE -ne 0) { throw "Plugin removal failed (exit $LASTEXITCODE)." }
    } catch {
        $failed = $true
        Write-Error $_ -ErrorAction Continue
    }
    try {
        if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) { throw 'npx.cmd is required for skill removal.' }
        & npx.cmd --yes skills remove social-autopost -a hermes-agent -g -y
        if ($LASTEXITCODE -ne 0) { throw "Skill removal failed (exit $LASTEXITCODE)." }
    } catch {
        $failed = $true
        Write-Error $_ -ErrorAction Continue
    }
} finally {
    Pop-Location
}
if ($failed) {
    Write-Output 'Removal incomplete. Review errors above. Source and browser data were preserved.'
    exit 1
}
Write-Output 'Removed social-autopost and Hermes social-autopost. Source and browser data were preserved.'
