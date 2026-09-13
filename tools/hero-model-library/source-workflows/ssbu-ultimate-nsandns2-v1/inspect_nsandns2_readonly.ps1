# Read-only, bounded inventory of existing Smash-named files. No extraction,
# decryption, credential access, ACL/share changes, or source-code execution.
[CmdletBinding()]
param(
    [string]$SourceRoot = 'E:\Game\單機遊戲\模擬器\NSandNS2',
    [string]$OutputDirectory = (Join-Path ([Environment]::GetFolderPath('Desktop')) ('GGD-Ultimate-Inventory-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))),
    [switch]$InspectContainers,
    [switch]$HashPayload
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) { throw "Source folder is not accessible: $SourceRoot" }
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Choose a new output directory; existing results are never overwritten.' }
$sourcePath = (Resolve-Path -LiteralPath $SourceRoot).Path.TrimEnd('\')
$outputFull = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\')
if ($outputFull.StartsWith($sourcePath + '\', [StringComparison]::OrdinalIgnoreCase) -or $outputFull.Equals($sourcePath,[StringComparison]::OrdinalIgnoreCase)) { throw 'Output must be outside the source folder.' }
$files = @(Get-ChildItem -LiteralPath $SourceRoot -File -Force | Where-Object { $_.Name -match '(?i)super[_ ]smash' } | Sort-Object Name)
$results = [Collections.Generic.List[object]]::new()
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($file in $files) {
    $record = [ordered]@{ Name=$file.Name; AbsolutePath=$file.FullName; Bytes=$file.Length; LastWriteTimeUtc=$file.LastWriteTimeUtc.ToString('o'); SHA256=$null; Status='inventory-only'; Container=$null; Error=$null; Extracted=$false; Converted=$false }
    try {
        if ($HashPayload) { $record.SHA256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
        if ($InspectContainers -and $file.Extension -ieq '.zip') {
            $zip = [IO.Compression.ZipFile]::OpenRead($file.FullName)
            try {
                if ($zip.Entries.Count -gt 100000) { throw 'ZIP entry-count inspection cap exceeded.' }
                $members = @($zip.Entries | ForEach-Object { [ordered]@{ Name=$_.FullName; Bytes=$_.Length; CompressedBytes=$_.CompressedLength; PayloadRead=$false; Executed=$false } })
                $record.Container = [ordered]@{ Format='ZIP'; MemberCount=$members.Count; Members=$members; Scope='central-directory-only' }
            } finally { $zip.Dispose() }
        } elseif ($InspectContainers -and $file.Extension -ieq '.nsp') {
            $stream = [IO.File]::Open($file.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
            $reader = [IO.BinaryReader]::new($stream)
            try {
                $magic = [Text.Encoding]::ASCII.GetString($reader.ReadBytes(4))
                if ($magic -ne 'PFS0') {
                    $record.Container = [ordered]@{ HeaderMagic=$magic; Format='unknown'; MembersRead=$false; Note='Stopped at header; no decryption attempted.' }
                } else {
                    [uint32]$count=$reader.ReadUInt32(); [uint32]$stringBytes=$reader.ReadUInt32(); $null=$reader.ReadUInt32()
                    if ($count -gt 100000 -or $stringBytes -gt 16777216) { throw 'PFS0 header inspection cap exceeded.' }
                    [uint64]$dataStart=16 + [uint64]$count*24 + [uint64]$stringBytes
                    if ($dataStart -gt [uint64]$file.Length) { throw 'PFS0 file table exceeds file length.' }
                    $table = [Collections.Generic.List[object]]::new()
                    for ($i=0; $i -lt $count; $i++) {
                        [uint64]$offset=$reader.ReadUInt64(); [uint64]$size=$reader.ReadUInt64(); [uint32]$nameOffset=$reader.ReadUInt32(); $null=$reader.ReadUInt32()
                        if ($nameOffset -ge $stringBytes -or $offset -gt ([uint64]$file.Length-$dataStart) -or $size -gt ([uint64]$file.Length-$dataStart-$offset)) { throw 'PFS0 member metadata is out of range.' }
                        $table.Add([ordered]@{ RelativeOffset=$offset; Bytes=$size; NameOffset=$nameOffset })
                    }
                    $strings=$reader.ReadBytes([int]$stringBytes)
                    if ($strings.Length -ne $stringBytes) { throw 'PFS0 string table is truncated.' }
                    $members = [Collections.Generic.List[object]]::new()
                    foreach ($entry in $table) {
                        $begin=[int]$entry.NameOffset; $end=$begin
                        while ($end -lt $strings.Length -and $strings[$end] -ne 0) { $end++ }
                        if ($end -eq $strings.Length) { throw 'PFS0 member name lacks a terminator.' }
                        $name=[Text.Encoding]::UTF8.GetString($strings,$begin,$end-$begin)
                        $members.Add([ordered]@{ Name=$name; Bytes=$entry.Bytes; DataOffset=($dataStart+$entry.RelativeOffset); PayloadRead=$false; Decrypted=$false })
                    }
                    $record.Container=[ordered]@{ Format='PFS0'; MemberCount=$count; DataStart=$dataStart; Members=$members.ToArray(); Scope='header-and-file-table-only; title/version remain unverified' }
                }
            } finally { $reader.Dispose(); $stream.Dispose() }
        }
    } catch { $record.Error=$_.Exception.Message }
    $results.Add($record)
}
$report = [ordered]@{ Schema='ggd-ultimate-nsandns2-local-inspection@1'; GeneratedAtUtc=[DateTime]::UtcNow.ToString('o'); ComputerName=$env:COMPUTERNAME; SourceRoot=$sourcePath; FileCount=$files.Count; FullPayloadHashRequested=[bool]$HashPayload; ContainerInspectionRequested=[bool]$InspectContainers; Files=$results.ToArray(); Scope='existing Smash-named top-level files only; no game assets extracted or converted' }
$null=New-Item -ItemType Directory -Path $outputFull
$target=Join-Path $outputFull 'nsandns2-smash-inventory.json'
$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $target -Encoding UTF8
Get-Item -LiteralPath $target | Select-Object FullName,Length
