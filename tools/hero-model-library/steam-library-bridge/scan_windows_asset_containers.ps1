[CmdletBinding()]
param(
    [string[]]$SteamRoots = @(),
    [bool]$DiscoverSteamLibraries = $true,
    [string]$GameRoot = 'E:\Game\單機遊戲',
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputDirectory = Join-Path ([Environment]::GetFolderPath('Desktop')) "GGD-Asset-Container-Inventory-$stamp"
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$requestedSteamRoots = New-Object 'System.Collections.Generic.List[string]'
foreach ($root in $SteamRoots) {
    if (-not [string]::IsNullOrWhiteSpace($root)) { $requestedSteamRoots.Add($root) }
}
if ($DiscoverSteamLibraries) {
    $steamInstallPaths = New-Object 'System.Collections.Generic.List[string]'
    foreach ($registryPath in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam')) {
        try {
            $item = Get-ItemProperty -LiteralPath $registryPath -ErrorAction Stop
            foreach ($name in @('SteamPath', 'InstallPath')) {
                $value = $item.$name
                if ($value) { $steamInstallPaths.Add($value) }
            }
        } catch { }
    }
    foreach ($fallback in @("${env:ProgramFiles(x86)}\Steam", "$env:ProgramFiles\Steam")) {
        if (-not [string]::IsNullOrWhiteSpace($fallback)) { $steamInstallPaths.Add($fallback) }
    }
    foreach ($steamInstall in @($steamInstallPaths | Select-Object -Unique)) {
        $defaultCommon = Join-Path $steamInstall 'steamapps\common'
        if (Test-Path -LiteralPath $defaultCommon -PathType Container) { $requestedSteamRoots.Add($defaultCommon) }
        $libraryFile = Join-Path $steamInstall 'steamapps\libraryfolders.vdf'
        if (-not (Test-Path -LiteralPath $libraryFile -PathType Leaf)) { continue }
        try {
            $text = [IO.File]::ReadAllText($libraryFile, [Text.Encoding]::UTF8)
            foreach ($match in [Regex]::Matches($text, '(?m)^\s*"path"\s+"([^"]+)"')) {
                $library = $match.Groups[1].Value.Replace('\\', '\')
                $common = Join-Path $library 'steamapps\common'
                if (Test-Path -LiteralPath $common -PathType Container) { $requestedSteamRoots.Add($common) }
            }
        } catch { }
    }
}
$SteamRoots = @($requestedSteamRoots | ForEach-Object { $_.TrimEnd('\') } | Select-Object -Unique)
if ($SteamRoots.Count -eq 0) {
    throw 'No Steam library was found. Pass -SteamRoots with one or more steamapps\common paths.'
}

$assetExtensions = @(
    '.pak', '.utoc', '.ucas', '.uasset', '.uexp', '.ubulk',
    '.bnk', '.wem', '.bank', '.fsb', '.pck', '.awb', '.acb', '.cpk',
    '.assets', '.ress', '.resource', '.bundle', '.unity3d',
    '.glb', '.gltf', '.fbx', '.obj', '.dae', '.pmx', '.pmd',
    '.mdl', '.mesh', '.skel', '.anim', '.hkx'
)
$engineMarkerExtensions = @('.pak', '.utoc', '.ucas', '.uasset', '.assets', '.ress', '.resource', '.bundle', '.unity3d')

function Read-VdfValue {
    param([string]$Text, [string]$Key)
    $pattern = '(?m)^\s*"' + [Regex]::Escape($Key) + '"\s+"([^"]*)"'
    $match = [Regex]::Match($Text, $pattern)
    if ($match.Success) { return $match.Groups[1].Value }
    return $null
}

function Get-EngineHints {
    param([hashtable]$ExtensionCounts, [string[]]$RelativePaths)
    $hints = New-Object 'System.Collections.Generic.List[string]'
    if (($ExtensionCounts['.pak'] -gt 0) -or ($ExtensionCounts['.utoc'] -gt 0) -or ($ExtensionCounts['.ucas'] -gt 0) -or ($ExtensionCounts['.uasset'] -gt 0)) {
        $hints.Add('Unreal Engine')
    }
    if (($ExtensionCounts['.assets'] -gt 0) -or ($ExtensionCounts['.ress'] -gt 0) -or ($ExtensionCounts['.resource'] -gt 0) -or ($ExtensionCounts['.unity3d'] -gt 0) -or ($RelativePaths -match '(?i)(^|\\)[^\\]+_Data(\\|$)')) {
        $hints.Add('Unity')
    }
    if (($ExtensionCounts['.bnk'] -gt 0) -or ($ExtensionCounts['.wem'] -gt 0)) { $hints.Add('Wwise') }
    if (($ExtensionCounts['.bank'] -gt 0) -or ($ExtensionCounts['.fsb'] -gt 0)) { $hints.Add('FMOD') }
    if (($ExtensionCounts['.cpk'] -gt 0) -or ($ExtensionCounts['.awb'] -gt 0) -or ($ExtensionCounts['.acb'] -gt 0)) { $hints.Add('CRIWARE') }
    return @($hints | Select-Object -Unique)
}

$gameRows = New-Object 'System.Collections.Generic.List[object]'
$assetRows = New-Object 'System.Collections.Generic.List[object]'
$scanErrors = New-Object 'System.Collections.Generic.List[object]'
$rootsSeen = New-Object 'System.Collections.Generic.List[string]'
$totalFiles = 0L
$totalMetadataBytes = 0L
$timer = [Diagnostics.Stopwatch]::StartNew()

foreach ($steamRoot in $SteamRoots) {
    if (-not (Test-Path -LiteralPath $steamRoot -PathType Container)) {
        $scanErrors.Add([pscustomobject]@{ Scope = 'steam-root'; Path = $steamRoot; Error = 'path-not-found' })
        continue
    }
    $resolvedRoot = (Resolve-Path -LiteralPath $steamRoot).Path.TrimEnd('\')
    $rootsSeen.Add($resolvedRoot)
    $steamAppsRoot = Split-Path -Parent $resolvedRoot
    $manifestByDirectory = @{}
    Get-ChildItem -LiteralPath $steamAppsRoot -Filter 'appmanifest_*.acf' -File -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $text = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8)
            $installDir = Read-VdfValue -Text $text -Key 'installdir'
            if ($installDir) {
                $manifestByDirectory[$installDir.ToLowerInvariant()] = [pscustomobject]@{
                    AppId = Read-VdfValue -Text $text -Key 'appid'
                    Name = Read-VdfValue -Text $text -Key 'name'
                    InstallDir = $installDir
                    BuildId = Read-VdfValue -Text $text -Key 'buildid'
                    Manifest = $_.FullName
                }
            }
        } catch {
            $scanErrors.Add([pscustomobject]@{ Scope = 'manifest'; Path = $_.FullName; Error = $_.Exception.Message })
        }
    }

    foreach ($directory in (Get-ChildItem -LiteralPath $resolvedRoot -Directory -Force | Sort-Object Name)) {
        $manifest = $manifestByDirectory[$directory.Name.ToLowerInvariant()]
        $fileCount = 0L
        $byteCount = 0L
        $candidateCount = 0L
        $extensionCounts = @{}
        $relativeMarkers = New-Object 'System.Collections.Generic.List[string]'
        try {
            Get-ChildItem -LiteralPath $directory.FullName -Recurse -File -Force -ErrorAction Stop | ForEach-Object {
                $fileCount++
                $totalFiles++
                $byteCount += $_.Length
                $totalMetadataBytes += $_.Length
                $extension = $_.Extension.ToLowerInvariant()
                if (-not $extensionCounts.ContainsKey($extension)) { $extensionCounts[$extension] = 0L }
                $extensionCounts[$extension]++
                if ($assetExtensions -notcontains $extension) { return }
                $candidateCount++
                $relative = $_.FullName.Substring($directory.FullName.Length).TrimStart('\')
                if ($engineMarkerExtensions -contains $extension) { $relativeMarkers.Add($relative) }
                $assetRows.Add([pscustomobject]@{
                    SourceKind = 'steam-install'
                    SteamRoot = $resolvedRoot
                    AppId = if ($manifest) { $manifest.AppId } else { $null }
                    BuildId = if ($manifest) { $manifest.BuildId } else { $null }
                    GameTitle = if ($manifest -and $manifest.Name) { $manifest.Name } else { $directory.Name }
                    InstallDirectory = $directory.Name
                    AssetKind = switch ($extension) {
                        { $_ -in @('.pak', '.utoc', '.ucas', '.uasset', '.uexp', '.ubulk') } { 'unreal-container-or-asset'; break }
                        { $_ -in @('.bnk', '.wem') } { 'wwise-audio'; break }
                        { $_ -in @('.bank', '.fsb') } { 'fmod-audio'; break }
                        { $_ -in @('.cpk', '.awb', '.acb') } { 'criware-container-or-audio'; break }
                        { $_ -in @('.assets', '.ress', '.resource', '.bundle', '.unity3d') } { 'unity-container-or-resource'; break }
                        default { 'model-animation-candidate' }
                    }
                    Extension = $extension
                    SizeBytes = $_.Length
                    RelativePath = $relative
                    FullPath = $_.FullName
                    LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
                    Sha256 = $null
                    ContentRead = $false
                    Status = 'metadata-only-container-candidate'
                })
            }
            $engineHints = Get-EngineHints -ExtensionCounts $extensionCounts -RelativePaths @($relativeMarkers)
            $extensionSummary = @($extensionCounts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 25 | ForEach-Object {
                [ordered]@{ extension = $_.Key; count = $_.Value }
            }) | ConvertTo-Json -Compress
            $gameRows.Add([pscustomobject]@{
                SourceKind = 'steam-install'
                SteamRoot = $resolvedRoot
                AppId = if ($manifest) { $manifest.AppId } else { $null }
                BuildId = if ($manifest) { $manifest.BuildId } else { $null }
                Title = if ($manifest -and $manifest.Name) { $manifest.Name } else { $directory.Name }
                InstallDirectory = $directory.Name
                FullPath = $directory.FullName
                FileCount = $fileCount
                TotalBytes = $byteCount
                AssetContainerCandidateCount = $candidateCount
                EngineHints = ($engineHints -join '; ')
                TopExtensionsJson = $extensionSummary
                ManifestMatched = [bool]$manifest
                InventoryStatus = 'metadata-only-files-enumerated'
                ContentInspected = $false
                PayloadBytesRead = 0
            })
        } catch {
            $scanErrors.Add([pscustomobject]@{ Scope = 'steam-game'; Path = $directory.FullName; Error = $_.Exception.Message })
        }
    }
}

if (Test-Path -LiteralPath $GameRoot -PathType Container) {
    $resolvedGameRoot = (Resolve-Path -LiteralPath $GameRoot).Path.TrimEnd('\')
    $rootsSeen.Add($resolvedGameRoot)
    foreach ($directory in (Get-ChildItem -LiteralPath $resolvedGameRoot -Directory -Force | Sort-Object Name)) {
        $fileCount = 0L
        $byteCount = 0L
        $candidateCount = 0L
        $extensionCounts = @{}
        $relativeMarkers = New-Object 'System.Collections.Generic.List[string]'
        try {
            Get-ChildItem -LiteralPath $directory.FullName -Recurse -File -Force -ErrorAction Stop | ForEach-Object {
                $fileCount++
                $totalFiles++
                $byteCount += $_.Length
                $totalMetadataBytes += $_.Length
                $extension = $_.Extension.ToLowerInvariant()
                if (-not $extensionCounts.ContainsKey($extension)) { $extensionCounts[$extension] = 0L }
                $extensionCounts[$extension]++
                if ($assetExtensions -notcontains $extension) { return }
                $candidateCount++
                $relative = $_.FullName.Substring($directory.FullName.Length).TrimStart('\')
                if ($engineMarkerExtensions -contains $extension) { $relativeMarkers.Add($relative) }
                $assetRows.Add([pscustomobject]@{
                    SourceKind = 'windows-game-directory'
                    SteamRoot = $null
                    AppId = $null
                    BuildId = $null
                    GameTitle = $directory.Name
                    InstallDirectory = $directory.Name
                    AssetKind = 'container-model-or-audio-candidate'
                    Extension = $extension
                    SizeBytes = $_.Length
                    RelativePath = $relative
                    FullPath = $_.FullName
                    LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
                    Sha256 = $null
                    ContentRead = $false
                    Status = 'metadata-only-container-candidate'
                })
            }
            $engineHints = Get-EngineHints -ExtensionCounts $extensionCounts -RelativePaths @($relativeMarkers)
            $extensionSummary = @($extensionCounts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 25 | ForEach-Object {
                [ordered]@{ extension = $_.Key; count = $_.Value }
            }) | ConvertTo-Json -Compress
            $gameRows.Add([pscustomobject]@{
                SourceKind = 'windows-game-directory'
                SteamRoot = $null
                AppId = $null
                BuildId = $null
                Title = $directory.Name
                InstallDirectory = $directory.Name
                FullPath = $directory.FullName
                FileCount = $fileCount
                TotalBytes = $byteCount
                AssetContainerCandidateCount = $candidateCount
                EngineHints = ($engineHints -join '; ')
                TopExtensionsJson = $extensionSummary
                ManifestMatched = $null
                InventoryStatus = 'metadata-only-files-enumerated'
                ContentInspected = $false
                PayloadBytesRead = 0
            })
        } catch {
            $scanErrors.Add([pscustomobject]@{ Scope = 'game-directory'; Path = $directory.FullName; Error = $_.Exception.Message })
        }
    }
} else {
    $scanErrors.Add([pscustomobject]@{ Scope = 'game-root'; Path = $GameRoot; Error = 'path-not-found' })
}

$timer.Stop()
$gameRows | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'game-file-summaries.csv') -NoTypeInformation -Encoding UTF8
$assetRows | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'asset-container-files.csv') -NoTypeInformation -Encoding UTF8
$scanErrors | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'scan-errors.csv') -NoTypeInformation -Encoding UTF8

$receipt = [ordered]@{
    schema = 'ggd-windows-asset-container-inventory-receipt@1'
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    computerName = $env:COMPUTERNAME
    roots = @($rootsSeen)
    gameRecordCount = $gameRows.Count
    filesEnumerated = $totalFiles
    logicalFileBytes = $totalMetadataBytes
    assetContainerCandidateCount = $assetRows.Count
    elapsedSeconds = [Math]::Round($timer.Elapsed.TotalSeconds, 3)
    entriesPerSecond = if ($timer.Elapsed.TotalSeconds -gt 0) { [Math]::Round($totalFiles / $timer.Elapsed.TotalSeconds, 2) } else { $null }
    scanErrorCount = $scanErrors.Count
    payloadBytesRead = 0
    contentHashesComputed = 0
    currentStatus = 'metadata-only-container-inventory'
    doesNotMean = @('payload-extracted', 'asset-identity-verified', 'converted', 'accepted', 'registered', 'switchable', 'deployed')
}
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'scan-receipt.json') -Encoding UTF8

$zipPath = "$OutputDirectory.zip"
Compress-Archive -Path (Join-Path $OutputDirectory '*') -DestinationPath $zipPath -Force
Write-Host "Inventory: $OutputDirectory"
Write-Host "Archive: $zipPath"
Write-Host ($receipt | ConvertTo-Json -Depth 8)
