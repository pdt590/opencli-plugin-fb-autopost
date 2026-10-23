#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$GroupUrl,
    [string]$GroupAlias = 'main',
    [switch]$Help
)
$ErrorActionPreference = 'Stop'
if ($Help) {
    Write-Output 'Usage: .\install.ps1 [-GroupUrl URL] [-GroupAlias main]'
    Write-Output 'Install dependencies, test, package, install social-autopost and the Hermes social-autopost skill.'
    exit 0
}
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE). Installation stopped." }
}
Push-Location -LiteralPath $PSScriptRoot
try {
    foreach ($tool in @('node.exe', 'npm.cmd', 'npx.cmd', 'tar.exe')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing prerequisite: $tool" }
    }
    $nodeVersion = & node.exe -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or [version]$nodeVersion -lt [version]'22.20.0') { throw 'Node.js >=22.20 required.' }
    Invoke-Checked 'npm.cmd' @('ci', '--include=dev')
    Invoke-Checked 'npm.cmd' @('test')
    Invoke-Checked 'npm.cmd' @('run', 'package')
    $pluginUri = ([System.Uri]($PSScriptRoot + [IO.Path]::DirectorySeparatorChar)).AbsoluteUri
    Invoke-Checked 'npx.cmd' @('--no-install', 'opencli', 'plugin', 'install', $pluginUri)
    Invoke-Checked 'npx.cmd' @('--yes', 'skills', 'add', '.', '--skill', 'social-autopost', '-a', 'hermes-agent', '-g', '--copy', '-y')
    if ($GroupUrl) {
        Invoke-Checked 'npm.cmd' @('run', 'setup', '--', '--group-url', $GroupUrl, '--group-alias', $GroupAlias, '--skip-plugin-install')
    }
    Invoke-Checked 'npx.cmd' @('--no-install', 'opencli', 'plugin', 'list')
    Write-Output 'Installed plugin and Hermes skill. Package: dist/social-autopost-local.tar.gz'
    Write-Output 'Connect Browser Bridge in your existing Chrome. No browser was launched or post published.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    Pop-Location
}
