[CmdletBinding()]
param(
    [string]$SteamRoot = 'F:\SteamLibrary\steamapps\common',
    [string]$GameRoot = 'E:\Game\單機遊戲',
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SteamRoot -PathType Container)) {
    throw "Steam root does not exist: $SteamRoot"
}
if (-not (Test-Path -LiteralPath $GameRoot -PathType Container)) {
    throw "Game root does not exist: $GameRoot"
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputDirectory = Join-Path ([Environment]::GetFolderPath('Desktop')) "GGD-Game-Inventory-$stamp"
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$steamAppsRoot = Split-Path -Parent $SteamRoot
$priorityPattern = '(?i)jump\s*force|king\s*of\s*fighters|\bkof|infinity\s*strash|無限神速斬|fate.?unlimited.?codes?|super\s*smash|smash\s*bros|全明星大亂鬥|palworld|幻獸帕魯'
$romExtensions = @(
    '.iso', '.cso', '.pbp', '.xci', '.nsp', '.nsz', '.xcz',
    '.wux', '.wud', '.rpx', '.rvz', '.wbfs', '.wia', '.gcz',
    '.gcm', '.wad', '.z64', '.n64', '.v64', '.nds', '.3ds',
    '.cci', '.cia', '.gba', '.gbc', '.gb', '.nes', '.fds',
    '.sfc', '.smc', '.md', '.gen', '.sms', '.gg', '.32x',
    '.vpk', '.gdi', '.cdi', '.chd', '.cue', '.pkg', '.zip',
    '.7z', '.rar'
)

function Read-VdfValue {
    param([string]$Text, [string]$Key)
    $pattern = '(?m)^\s*"' + [Regex]::Escape($Key) + '"\s+"([^"]*)"'
    $match = [Regex]::Match($Text, $pattern)
    if ($match.Success) { return $match.Groups[1].Value }
    return $null
}

$steamTimer = [Diagnostics.Stopwatch]::StartNew()
$steamGames = @(
    Get-ChildItem -LiteralPath $SteamRoot -Directory -Force | ForEach-Object {
        [pscustomobject]@{
            Name = $_.Name
            FullPath = $_.FullName
            LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
            PriorityMatch = [bool]($_.Name -match $priorityPattern)
            Status = 'inventory-only'
        }
    } | Sort-Object @{ Expression = 'PriorityMatch'; Descending = $true }, Name
)

$steamManifests = @(
    Get-ChildItem -LiteralPath $steamAppsRoot -Filter 'appmanifest_*.acf' -File | ForEach-Object {
        $text = Get-Content -LiteralPath $_.FullName -Raw
        [pscustomobject]@{
            AppId = Read-VdfValue -Text $text -Key 'appid'
            Name = Read-VdfValue -Text $text -Key 'name'
            InstallDir = Read-VdfValue -Text $text -Key 'installdir'
            BuildId = Read-VdfValue -Text $text -Key 'buildid'
            Manifest = $_.FullName
            SizeBytes = $_.Length
            PriorityMatch = [bool]($text -match $priorityPattern)
        }
    }
)
$steamTimer.Stop()

$gameTimer = [Diagnostics.Stopwatch]::StartNew()
$counts = [pscustomobject]@{ Entries = 0; Directories = 0; Files = 0; RomFiles = 0 }
$gameDirectories = New-Object 'System.Collections.Generic.List[object]'
$romFiles = New-Object 'System.Collections.Generic.List[object]'
$scanErrors = @()
$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'

Get-ChildItem -LiteralPath $GameRoot -Recurse -Force -ErrorVariable +scanErrors | ForEach-Object {
    $counts.Entries++
    if (($counts.Entries % 1000) -eq 0) {
        Write-Progress -Activity 'Scanning games and ROMs' -Status "entries=$($counts.Entries) romCandidates=$($counts.RomFiles)"
    }
    if ($_.PSIsContainer) {
        $counts.Directories++
        $gameDirectories.Add([pscustomobject]@{
            Name = $_.Name
            FullPath = $_.FullName
            RelativePath = $_.FullName.Substring($GameRoot.Length).TrimStart('\')
            LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
            PriorityMatch = [bool]($_.FullName -match $priorityPattern)
        })
        return
    }
    $counts.Files++
    $extension = $_.Extension.ToLowerInvariant()
    if ($romExtensions -notcontains $extension) { return }
    $counts.RomFiles++
    $romFiles.Add([pscustomobject]@{
        Name = $_.BaseName
        FileName = $_.Name
        Extension = $extension
        Platform = '待正規化'
        SizeBytes = $_.Length
        FullPath = $_.FullName
        RelativePath = $_.FullName.Substring($GameRoot.Length).TrimStart('\')
        LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
        PriorityMatch = [bool]($_.FullName -match $priorityPattern)
        ContentRead = $false
        Sha256 = $null
        Status = 'inventory-only'
    })
}

$ErrorActionPreference = $previousErrorAction
Write-Progress -Activity 'Scanning games and ROMs' -Completed
$gameTimer.Stop()

$steamGames | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'steam-games.csv') -NoTypeInformation -Encoding UTF8
$steamManifests | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'steam-manifests.csv') -NoTypeInformation -Encoding UTF8
$gameDirectories | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'game-directories.csv') -NoTypeInformation -Encoding UTF8
$romFiles | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'rom-files.csv') -NoTypeInformation -Encoding UTF8

$receipt = [ordered]@{
    schema = 'ggd-windows-game-inventory-receipt@1'
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    computerName = $env:COMPUTERNAME
    steamRoot = $SteamRoot
    gameRoot = $GameRoot
    steamGameCount = $steamGames.Count
    steamManifestCount = $steamManifests.Count
    steamElapsedSeconds = [Math]::Round($steamTimer.Elapsed.TotalSeconds, 3)
    gameEntriesVisited = $counts.Entries
    gameDirectoriesVisited = $counts.Directories
    gameFilesVisited = $counts.Files
    romCandidatesFound = $counts.RomFiles
    gameElapsedSeconds = [Math]::Round($gameTimer.Elapsed.TotalSeconds, 3)
    gameEntriesPerSecond = if ($gameTimer.Elapsed.TotalSeconds -gt 0) {
        [Math]::Round($counts.Entries / $gameTimer.Elapsed.TotalSeconds, 2)
    } else { $null }
    scanErrorCount = $scanErrors.Count
    romPayloadBytesRead = 0
    extraSpeedReadPerformed = $false
    currentStatus = 'inventory-only'
}
$receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'scan-receipt.json') -Encoding UTF8

$zipPath = "$OutputDirectory.zip"
Compress-Archive -Path (Join-Path $OutputDirectory '*') -DestinationPath $zipPath -Force
Write-Host "Inventory: $OutputDirectory"
Write-Host "Archive: $zipPath"
Write-Host ($receipt | ConvertTo-Json -Depth 6)
