[CmdletBinding()]
param(
    [string]$GameRoot = 'F:\SteamLibrary\steamapps\common\Strash',
    [string]$OutputDirectory = '',
    [string]$UmodelPath = '',
    [bool]$RunUmodelListing = $true
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not (Test-Path -LiteralPath $GameRoot -PathType Container)) {
    throw "Infinity Strash directory was not found: $GameRoot"
}
$GameRoot = (Resolve-Path -LiteralPath $GameRoot).Path.TrimEnd('\')

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputDirectory = Join-Path ([Environment]::GetFolderPath('Desktop')) "GGD-Infinity-Strash-Probe-$stamp"
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$OutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path

function Get-RelativePath {
    param([string]$Root, [string]$FullPath)
    return $FullPath.Substring($Root.Length).TrimStart('\')
}

function Get-FilePin {
    param([IO.FileInfo]$File)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $hash = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $timer.Stop()
    $seconds = [Math]::Max($timer.Elapsed.TotalSeconds, 0.001)
    return [ordered]@{
        relativePath = Get-RelativePath -Root $GameRoot -FullPath $File.FullName
        fullPath = $File.FullName
        extension = $File.Extension.ToLowerInvariant()
        bytes = $File.Length
        sha256 = $hash
        lastWriteTimeUtc = $File.LastWriteTimeUtc.ToString('o')
        hashSeconds = [Math]::Round($seconds, 3)
        readMiBPerSecond = [Math]::Round(($File.Length / 1MB) / $seconds, 2)
    }
}

$containerExtensions = @('.pak', '.sig', '.utoc', '.ucas')
$containers = @(Get-ChildItem -LiteralPath $GameRoot -Recurse -File -Force | Where-Object {
    $containerExtensions -contains $_.Extension.ToLowerInvariant()
} | Sort-Object FullName)
if ($containers.Count -eq 0) {
    throw "No Unreal container files were found under $GameRoot"
}

$pins = New-Object 'System.Collections.Generic.List[object]'
foreach ($file in $containers) {
    Write-Host "Hashing read-only source: $($file.FullName)"
    $pins.Add([pscustomobject](Get-FilePin -File $file))
}

$executables = @(Get-ChildItem -LiteralPath $GameRoot -Recurse -Filter '*.exe' -File -Force | Sort-Object FullName | ForEach-Object {
    $version = $_.VersionInfo
    [pscustomobject]@{
        relativePath = Get-RelativePath -Root $GameRoot -FullPath $_.FullName
        fullPath = $_.FullName
        bytes = $_.Length
        lastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
        fileVersion = $version.FileVersion
        productVersion = $version.ProductVersion
        productName = $version.ProductName
    }
})

if ([string]::IsNullOrWhiteSpace($UmodelPath)) {
    $candidates = @(
        (Join-Path $PSScriptRoot 'umodel.exe'),
        (Join-Path ([Environment]::GetFolderPath('Desktop')) 'umodel.exe'),
        (Join-Path $env:USERPROFILE 'Downloads\umodel.exe')
    )
    $UmodelPath = @($candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)
    if ($UmodelPath.Count -gt 0) { $UmodelPath = $UmodelPath[0] } else { $UmodelPath = '' }
}

$umodel = [ordered]@{
    requested = $RunUmodelListing
    found = -not [string]::IsNullOrWhiteSpace($UmodelPath)
    path = if ([string]::IsNullOrWhiteSpace($UmodelPath)) { $null } else { (Resolve-Path -LiteralPath $UmodelPath).Path }
    sha256 = $null
    versionOutput = $null
    attempts = @()
    selectedAttempt = $null
    listingPath = $null
    keywordHitsPath = $null
}

if ($umodel.found) {
    $umodel.sha256 = (Get-FileHash -LiteralPath $umodel.path -Algorithm SHA256).Hash.ToLowerInvariant()
    try { $umodel.versionOutput = (& $($umodel.path) -version 2>&1 | Out-String).Trim() } catch { $umodel.versionOutput = $_.Exception.Message }
}

if ($RunUmodelListing -and $umodel.found) {
    $engineAttempts = @('auto', 'ue4.27', 'ue4.26', 'ue4.25')
    foreach ($engine in $engineAttempts) {
        $safeEngine = $engine.Replace('.', '-')
        $logPath = Join-Path $OutputDirectory "umodel-list-$safeEngine.log"
        $arguments = @("-path=$GameRoot", '-list')
        if ($engine -ne 'auto') { $arguments += "-game=$engine" }
        $arguments += '*.uasset'
        $timer = [Diagnostics.Stopwatch]::StartNew()
        Push-Location $OutputDirectory
        try {
            & $($umodel.path) @arguments 2>&1 | Out-File -LiteralPath $logPath -Encoding utf8
            $exitCode = $LASTEXITCODE
        } catch {
            $_ | Out-String | Out-File -LiteralPath $logPath -Encoding utf8
            $exitCode = -1
        } finally {
            Pop-Location
            $timer.Stop()
        }
        $logInfo = Get-Item -LiteralPath $logPath
        $text = [IO.File]::ReadAllText($logPath)
        $looksUseful = ($exitCode -eq 0) -and ($logInfo.Length -gt 1024) -and ($text -match '(?i)SkeletalMesh|AnimSequence|Texture2D|SoundWave|Game/')
        $attempt = [ordered]@{
            engine = $engine
            commandArguments = $arguments
            exitCode = $exitCode
            elapsedSeconds = [Math]::Round($timer.Elapsed.TotalSeconds, 3)
            log = $logInfo.Name
            logBytes = $logInfo.Length
            logSha256 = (Get-FileHash -LiteralPath $logPath -Algorithm SHA256).Hash.ToLowerInvariant()
            usefulListingDetected = $looksUseful
        }
        $umodel.attempts += @($attempt)
        if ($looksUseful) {
            $umodel.selectedAttempt = $engine
            $umodel.listingPath = $logInfo.Name
            $hitsPath = Join-Path $OutputDirectory 'priority-character-package-hits.txt'
            Select-String -LiteralPath $logPath -Pattern 'Dai|Vearn|Vern|Burn|Baran|Popp|Avan|Hyunckel|Hadlar|Killvearn|Mystvearn|DarkKing|TrueDark' -CaseSensitive:$false |
                ForEach-Object { $_.Line } | Sort-Object -Unique | Out-File -LiteralPath $hitsPath -Encoding utf8
            $umodel.keywordHitsPath = (Get-Item -LiteralPath $hitsPath).Name
            break
        }
    }
}

$changedSources = New-Object 'System.Collections.Generic.List[object]'
foreach ($pin in $pins) {
    $current = Get-Item -LiteralPath $pin.fullPath
    if (($current.Length -ne $pin.bytes) -or ($current.LastWriteTimeUtc.ToString('o') -ne $pin.lastWriteTimeUtc)) {
        $changedSources.Add([pscustomobject]@{
            fullPath = $pin.fullPath
            beforeBytes = $pin.bytes
            afterBytes = $current.Length
            beforeLastWriteTimeUtc = $pin.lastWriteTimeUtc
            afterLastWriteTimeUtc = $current.LastWriteTimeUtc.ToString('o')
        })
    }
}
if ($changedSources.Count -gt 0) {
    $changedSources | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'source-change-detected.json') -Encoding utf8
    throw 'One or more game container files changed during the probe. Rerun after Steam finishes updating the game.'
}

$totalBytes = ($pins | Measure-Object -Property bytes -Sum).Sum
$totalSeconds = ($pins | Measure-Object -Property hashSeconds -Sum).Sum
$receipt = [ordered]@{
    schema = 'ggd-infinity-strash-readonly-probe@1'
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    computerName = $env:COMPUTERNAME
    game = [ordered]@{
        steamAppId = '1895810'
        title = 'Infinity Strash: DRAGON QUEST The Adventure of Dai'
        buildIdFromExistingInventory = '12283352'
        root = $GameRoot
    }
    sourceAccess = [ordered]@{
        mode = 'read-only'
        sourceFilesChanged = ($changedSources.Count -gt 0)
        payloadFilesCopied = 0
        payloadBytesCopied = 0
    }
    containers = @($pins)
    executables = $executables
    hashRead = [ordered]@{
        bytes = $totalBytes
        elapsedSeconds = [Math]::Round($totalSeconds, 3)
        aggregateMiBPerSecond = if ($totalSeconds -gt 0) { [Math]::Round(($totalBytes / 1MB) / $totalSeconds, 2) } else { $null }
    }
    umodel = $umodel
    status = if ($umodel.selectedAttempt) { 'container-hashed-package-list-produced' } else { 'container-hashed-package-list-pending-tool' }
    targetCharacters = @(
        [ordered]@{ nameZh = '小呆／達伊'; names = @('Dai'); targetHeroIds = @('godie-nbbc', 'godie-n01c') },
        [ordered]@{ nameZh = '巴恩大魔王（老年／變身前）'; names = @('Vearn', 'Dark King Vearn'); targetHeroIds = @('godie-ubal') },
        [ordered]@{ nameZh = '巴恩大魔王（年輕真身／變身後）'; names = @('True Dark King Vearn'); targetHeroIds = @('godie-ubal') }
    )
    identityGuard = 'Vearn is distinct from Baran. Package-name matches remain candidates until mesh and texture review.'
    doesNotMean = @('assets-extracted', 'identity-verified', 'converted', 'accepted', 'registered', 'switchable', 'deployed')
}

$receiptPath = Join-Path $OutputDirectory 'probe-receipt.json'
$receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receiptPath -Encoding utf8
$pins | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'container-files.csv') -NoTypeInformation -Encoding utf8
$executables | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'executables.csv') -NoTypeInformation -Encoding utf8

$zipPath = "$OutputDirectory.zip"
Compress-Archive -Path (Join-Path $OutputDirectory '*') -DestinationPath $zipPath -Force
Write-Host "Probe archive: $zipPath"
Write-Host "PAK/container bytes read: $totalBytes"
Write-Host "Measured hash throughput MiB/s: $($receipt.hashRead.aggregateMiBPerSecond)"
if (-not $umodel.found) {
    Write-Warning 'umodel.exe was not found. The ZIP is still useful for exact PAK hashes; place the official umodel.exe beside this script and rerun to add a package listing.'
}
