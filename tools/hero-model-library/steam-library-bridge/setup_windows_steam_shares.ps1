[CmdletBinding()]
param(
    [string]$ReadAccount = "$env:COMPUTERNAME\$env:USERNAME",
    [string]$SharePrefix = "GGDSteam"
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run this script from PowerShell as Administrator."
}

function Add-UniquePath {
    param([System.Collections.Generic.List[string]]$List, [string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    $expanded = [Environment]::ExpandEnvironmentVariables($Path).TrimEnd('\', '/')
    if (-not (Test-Path -LiteralPath (Join-Path $expanded 'steamapps'))) { return }
    if (-not $List.Contains($expanded)) { $List.Add($expanded) }
}

$libraries = [System.Collections.Generic.List[string]]::new()
$registryCandidates = @(
    @{ Key = 'HKCU:\Software\Valve\Steam'; Value = 'SteamPath' },
    @{ Key = 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam'; Value = 'InstallPath' },
    @{ Key = 'HKLM:\SOFTWARE\Valve\Steam'; Value = 'InstallPath' }
)

foreach ($candidate in $registryCandidates) {
    try {
        $value = (Get-ItemProperty -LiteralPath $candidate.Key -Name $candidate.Value).($candidate.Value)
        Add-UniquePath -List $libraries -Path $value
    } catch { }
}

foreach ($root in @($libraries)) {
    $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
    if (-not (Test-Path -LiteralPath $vdf)) { continue }
    foreach ($line in Get-Content -LiteralPath $vdf) {
        if ($line -match '^\s*"path"\s+"([^"]+)"') {
            Add-UniquePath -List $libraries -Path $Matches[1].Replace('\\', '\')
        }
    }
}

if ($libraries.Count -eq 0) {
    throw "No Steam library containing steamapps was found."
}

Set-Service -Name LanmanServer -StartupType Automatic
Start-Service -Name LanmanServer

$firewallName = 'GGD-SMB-ReadOnly-In'
$firewall = Get-NetFirewallRule -Name $firewallName -ErrorAction SilentlyContinue
if ($null -eq $firewall) {
    New-NetFirewallRule -Name $firewallName -DisplayName 'GGD Steam read-only SMB' `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort 445 `
        -Profile Private -RemoteAddress LocalSubnet | Out-Null
} else {
    Set-NetFirewallRule -Name $firewallName -Enabled True -Profile Private -Direction Inbound -Action Allow | Out-Null
    Set-NetFirewallAddressFilter -AssociatedNetFirewallRule $firewall -RemoteAddress LocalSubnet | Out-Null
}

$rows = @()
$index = 0
foreach ($library in ($libraries | Sort-Object)) {
    $index += 1
    $shareName = '{0}{1:D2}' -f $SharePrefix, $index
    $sharePath = Join-Path $library 'steamapps'
    $existing = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
    if ($null -ne $existing -and $existing.Path -ne $sharePath) {
        throw "Share $shareName already points to $($existing.Path), expected $sharePath."
    }
    if ($null -eq $existing) {
        New-SmbShare -Name $shareName -Path $sharePath -ReadAccess $ReadAccount `
            -CachingMode None -FolderEnumerationMode AccessBased -EncryptData $true | Out-Null
    } else {
        Grant-SmbShareAccess -Name $shareName -AccountName $ReadAccount -AccessRight Read -Force | Out-Null
        Set-SmbShare -Name $shareName -CachingMode None -FolderEnumerationMode AccessBased -EncryptData $true -Force | Out-Null
    }
    $rows += [pscustomobject]@{
        shareName = $shareName
        steamLibrary = $library
        sharedPath = $sharePath
        uncPath = "\\$env:COMPUTERNAME\$shareName"
        access = 'read-only'
        account = $ReadAccount
    }
}

$activeProfiles = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' }
$publicProfiles = @($activeProfiles | Where-Object { $_.NetworkCategory -eq 'Public' })
$addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1'
} | Select-Object -ExpandProperty IPAddress)

$receipt = [ordered]@{
    schema = 'ggd-windows-steam-shares@1'
    createdAt = [DateTimeOffset]::UtcNow.ToString('o')
    computerName = $env:COMPUTERNAME
    ipv4 = $addresses
    firewall = [ordered]@{
        rule = $firewallName
        profile = 'Private'
        remoteAddress = 'LocalSubnet'
        tcpPort = 445
    }
    activeNetworkProfiles = @($activeProfiles | Select-Object Name, InterfaceAlias, NetworkCategory, IPv4Connectivity)
    shares = $rows
}

$receiptPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'GGD-Steam-Shares.json'
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
$receipt | ConvertTo-Json -Depth 8
Write-Host "`nReceipt: $receiptPath"
if ($publicProfiles.Count -gt 0) {
    Write-Warning 'An active network is Public. Change the home LAN to Private before SMB will accept the LocalSubnet firewall rule.'
}
