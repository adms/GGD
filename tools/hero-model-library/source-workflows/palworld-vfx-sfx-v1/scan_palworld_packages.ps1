param(
    [string]$GameRoot = 'F:\SteamLibrary\steamapps\common\Palworld',
    [string]$OutputDirectory = "$env:USERPROFILE\Desktop\GGD-Palworld-AV-Inventory"
)

$ErrorActionPreference = 'Stop'
$containers = @('.pak', '.utoc', '.ucas', '.sig')
$rows = [System.Collections.Generic.List[object]]::new()

if (-not (Test-Path -LiteralPath $GameRoot -PathType Container)) {
    throw "Palworld game root not found: $GameRoot"
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

Get-ChildItem -LiteralPath $GameRoot -File -Recurse -ErrorAction Stop |
    Where-Object { $containers -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($GameRoot.Length).TrimStart('\\')
        $rows.Add([pscustomobject]@{
            RelativePath = $relative
            FullPath = $_.FullName
            Extension = $_.Extension.ToLowerInvariant()
            SizeBytes = $_.Length
            LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
            Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        })
    }

$rows | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'containers.csv') -NoTypeInformation -Encoding UTF8
$summary = [ordered]@{
    schema = 'ggd.palworld-container-probe@1'
    gameRoot = $GameRoot
    readOnly = $true
    containerCount = $rows.Count
    packageListingProduced = $false
    payloadBytesExtracted = 0
    note = 'This probe only hashes container files. It does not decrypt or extract them.'
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'summary.json') -Encoding UTF8

$tool = Get-Command UnrealPak.exe -ErrorAction SilentlyContinue
if ($tool) {
    $packageList = Join-Path $OutputDirectory 'package-list.txt'
    foreach ($pak in ($rows | Where-Object Extension -eq '.pak')) {
        "# $($pak.FullPath)" | Add-Content -LiteralPath $packageList -Encoding UTF8
        & $tool.Source $pak.FullPath -List 2>&1 | Add-Content -LiteralPath $packageList -Encoding UTF8
    }
    $summary.packageListingProduced = Test-Path -LiteralPath $packageList
    $summary.unrealPakPath = $tool.Source
    $summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'summary.json') -Encoding UTF8
}

Compress-Archive -Path (Join-Path $OutputDirectory '*') -DestinationPath "$OutputDirectory.zip" -Force
Write-Host "Created $OutputDirectory.zip"
