[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    exit
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$bridgeRoot = Join-Path $env:ProgramData 'GGD\SteamBridge'
$coordinationRoot = Join-Path $bridgeRoot 'coordination'
$historyPath = Join-Path $bridgeRoot 'events.jsonl'
$receiptPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'GGD-Steam-Shares.json'
New-Item -ItemType Directory -Force -Path $coordinationRoot | Out-Null

function Write-BridgeEvent {
    param([string]$Type, [string]$Message, [object]$Data = $null)
    $row = [ordered]@{
        at = [DateTimeOffset]::UtcNow.ToString('o')
        type = $Type
        message = $Message
        data = $Data
    }
    Add-Content -LiteralPath $historyPath -Value ($row | ConvertTo-Json -Compress -Depth 8) -Encoding UTF8
}

function Add-UniqueLibrary {
    param([System.Collections.Generic.List[string]]$List, [string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    $expanded = [Environment]::ExpandEnvironmentVariables($Path).TrimEnd('\', '/')
    $steamapps = if ((Split-Path -Leaf $expanded) -ieq 'steamapps') { $expanded } else { Join-Path $expanded 'steamapps' }
    if (-not (Test-Path -LiteralPath $steamapps)) { return }
    $libraryRoot = if ((Split-Path -Leaf $expanded) -ieq 'steamapps') { Split-Path -Parent $expanded } else { $expanded }
    if (-not ($List | Where-Object { $_ -ieq $libraryRoot })) { $List.Add($libraryRoot) }
}

function Find-SteamLibraries {
    $libraries = [System.Collections.Generic.List[string]]::new()
    $registryCandidates = @(
        @{ Key = 'HKCU:\Software\Valve\Steam'; Value = 'SteamPath' },
        @{ Key = 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam'; Value = 'InstallPath' },
        @{ Key = 'HKLM:\SOFTWARE\Valve\Steam'; Value = 'InstallPath' }
    )
    foreach ($candidate in $registryCandidates) {
        try {
            $value = (Get-ItemProperty -LiteralPath $candidate.Key -Name $candidate.Value).($candidate.Value)
            Add-UniqueLibrary -List $libraries -Path $value
        } catch { }
    }
    foreach ($root in @($libraries)) {
        $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
        if (-not (Test-Path -LiteralPath $vdf)) { continue }
        foreach ($line in Get-Content -LiteralPath $vdf) {
            if ($line -match '^\s*"path"\s+"([^"]+)"') {
                Add-UniqueLibrary -List $libraries -Path $Matches[1].Replace('\\', '\')
            }
        }
    }
    return @($libraries | Sort-Object)
}

function Ensure-PrivateSmbFirewall {
    Set-Service -Name LanmanServer -StartupType Automatic
    Start-Service -Name LanmanServer
    $name = 'GGD-SMB-ReadOnly-In'
    $rule = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
    if ($null -eq $rule) {
        New-NetFirewallRule -Name $name -DisplayName 'GGD Steam read-only SMB' -Direction Inbound `
            -Action Allow -Protocol TCP -LocalPort 445 -Profile Private -RemoteAddress LocalSubnet | Out-Null
    } else {
        Set-NetFirewallRule -Name $name -Enabled True -Profile Private -Direction Inbound -Action Allow | Out-Null
        Set-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule -RemoteAddress LocalSubnet | Out-Null
    }
}

function Ensure-SmbShareState {
    param([string]$Name, [string]$Path, [string]$Account, [ValidateSet('Read', 'Change')][string]$Access)
    $existing = Get-SmbShare -Name $Name -ErrorAction SilentlyContinue
    if ($null -ne $existing -and $existing.Path -ne $Path) {
        throw "Share $Name already points to $($existing.Path), expected $Path."
    }
    if ($null -eq $existing) {
        $parameters = @{ Name = $Name; Path = $Path; CachingMode = 'None';
            FolderEnumerationMode = 'AccessBased'; EncryptData = $true }
        if ($Access -eq 'Read') { $parameters.ReadAccess = $Account } else { $parameters.ChangeAccess = $Account }
        New-SmbShare @parameters | Out-Null
    } elseif ($Access -eq 'Read') {
        Grant-SmbShareAccess -Name $Name -AccountName $Account -AccessRight Read -Force | Out-Null
    } else {
        Grant-SmbShareAccess -Name $Name -AccountName $Account -AccessRight Change -Force | Out-Null
    }
    Set-SmbShare -Name $Name -CachingMode None -FolderEnumerationMode AccessBased -EncryptData $true -Force | Out-Null
}

function Count-Games([string]$Root) {
    return @(Get-ChildItem -LiteralPath (Join-Path $Root 'steamapps') -Filter 'appmanifest_*.acf' -File -ErrorAction SilentlyContinue).Count
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'GGD Steam 遠端素材庫'
$form.Size = New-Object System.Drawing.Size(1120, 780)
$form.MinimumSize = New-Object System.Drawing.Size(900, 650)
$form.StartPosition = 'CenterScreen'

$intro = New-Object System.Windows.Forms.Label
$intro.Text = '勾選要提供給 Mac 的 SteamLibrary，再按「套用唯讀分享」。遊戲檔只能讀取；GGDSteamStatus 只用來回寫小型處理狀態。'
$intro.AutoSize = $false
$intro.Location = New-Object System.Drawing.Point(18, 16)
$intro.Size = New-Object System.Drawing.Size(1060, 42)
$form.Controls.Add($intro)

$accountLabel = New-Object System.Windows.Forms.Label
$accountLabel.Text = 'Windows 讀取帳號：'
$accountLabel.Location = New-Object System.Drawing.Point(18, 62)
$accountLabel.AutoSize = $true
$form.Controls.Add($accountLabel)

$accountBox = New-Object System.Windows.Forms.TextBox
$accountBox.Text = "$env:COMPUTERNAME\$env:USERNAME"
$accountBox.Location = New-Object System.Drawing.Point(160, 59)
$accountBox.Size = New-Object System.Drawing.Size(300, 26)
$form.Controls.Add($accountBox)

$scanButton = New-Object System.Windows.Forms.Button
$scanButton.Text = '重新掃描 Steam'
$scanButton.Location = New-Object System.Drawing.Point(480, 56)
$scanButton.Size = New-Object System.Drawing.Size(130, 32)
$form.Controls.Add($scanButton)

$addButton = New-Object System.Windows.Forms.Button
$addButton.Text = '手動新增路徑'
$addButton.Location = New-Object System.Drawing.Point(620, 56)
$addButton.Size = New-Object System.Drawing.Size(130, 32)
$form.Controls.Add($addButton)

$applyButton = New-Object System.Windows.Forms.Button
$applyButton.Text = '套用唯讀分享'
$applyButton.Location = New-Object System.Drawing.Point(760, 56)
$applyButton.Size = New-Object System.Drawing.Size(150, 32)
$form.Controls.Add($applyButton)

$folderButton = New-Object System.Windows.Forms.Button
$folderButton.Text = '開啟記錄資料夾'
$folderButton.Location = New-Object System.Drawing.Point(920, 56)
$folderButton.Size = New-Object System.Drawing.Size(155, 32)
$form.Controls.Add($folderButton)

$grid = New-Object System.Windows.Forms.DataGridView
$grid.Location = New-Object System.Drawing.Point(18, 100)
$grid.Size = New-Object System.Drawing.Size(1060, 250)
$grid.Anchor = 'Top,Left,Right'
$grid.AllowUserToAddRows = $false
$grid.AllowUserToDeleteRows = $false
$grid.RowHeadersVisible = $false
$grid.AutoSizeColumnsMode = 'Fill'
$selectColumn = New-Object System.Windows.Forms.DataGridViewCheckBoxColumn
$selectColumn.HeaderText = '列入分享'; $selectColumn.FillWeight = 55
$shareColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$shareColumn.HeaderText = 'Share'; $shareColumn.ReadOnly = $true; $shareColumn.FillWeight = 65
$pathColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$pathColumn.HeaderText = 'SteamLibrary'; $pathColumn.ReadOnly = $true; $pathColumn.FillWeight = 260
$gamesColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$gamesColumn.HeaderText = '遊戲數'; $gamesColumn.ReadOnly = $true; $gamesColumn.FillWeight = 48
$stateColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$stateColumn.HeaderText = '分享狀態'; $stateColumn.ReadOnly = $true; $stateColumn.FillWeight = 90
[void]$grid.Columns.AddRange(@($selectColumn, $shareColumn, $pathColumn, $gamesColumn, $stateColumn))
$form.Controls.Add($grid)

$statusGroup = New-Object System.Windows.Forms.GroupBox
$statusGroup.Text = '即時使用狀態'
$statusGroup.Location = New-Object System.Drawing.Point(18, 362)
$statusGroup.Size = New-Object System.Drawing.Size(1060, 100)
$statusGroup.Anchor = 'Top,Left,Right'
$form.Controls.Add($statusGroup)

$liveLabel = New-Object System.Windows.Forms.Label
$liveLabel.Location = New-Object System.Drawing.Point(14, 25)
$liveLabel.Size = New-Object System.Drawing.Size(1025, 62)
$liveLabel.Text = '正在讀取狀態…'
$statusGroup.Controls.Add($liveLabel)

$historyLabel = New-Object System.Windows.Forms.Label
$historyLabel.Text = '歷史記錄'
$historyLabel.Location = New-Object System.Drawing.Point(18, 474)
$historyLabel.AutoSize = $true
$form.Controls.Add($historyLabel)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(18, 498)
$logBox.Size = New-Object System.Drawing.Size(1060, 220)
$logBox.Anchor = 'Top,Bottom,Left,Right'
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = 'Vertical'
$logBox.Font = New-Object System.Drawing.Font('Consolas', 9)
$form.Controls.Add($logBox)

$knownLibraries = [System.Collections.Generic.List[string]]::new()
function Refresh-LibraryGrid {
    param([string[]]$ExtraPaths = @())
    $selected = @{}
    foreach ($row in $grid.Rows) { $selected[[string]$row.Cells[2].Value] = [bool]$row.Cells[0].Value }
    foreach ($path in (Find-SteamLibraries) + $ExtraPaths) { Add-UniqueLibrary -List $knownLibraries -Path $path }
    $grid.Rows.Clear()
    $index = 0
    foreach ($library in @($knownLibraries | Sort-Object)) {
        $index += 1
        $shareName = 'GGDSteam{0:D2}' -f $index
        $share = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
        $enabled = if ($selected.ContainsKey($library)) { $selected[$library] } else { $true }
        $state = if ($null -eq $share) { '尚未分享' } elseif ($share.Path -eq (Join-Path $library 'steamapps')) { '唯讀分享已建立' } else { '同名 share 路徑衝突' }
        [void]$grid.Rows.Add($enabled, $shareName, $library, (Count-Games $library), $state)
    }
}

function Refresh-History {
    if (-not (Test-Path -LiteralPath $historyPath)) { $logBox.Text = '尚無歷史記錄。'; return }
    $display = foreach ($line in (Get-Content -LiteralPath $historyPath -Tail 250)) {
        try {
            $row = $line | ConvertFrom-Json
            '{0}  [{1}] {2}' -f $row.at, $row.type, $row.message
        } catch { $line }
    }
    $logBox.Lines = @($display)
    $logBox.SelectionStart = $logBox.TextLength
    $logBox.ScrollToCaret()
}

$lastNetworkBytes = $null
$lastNetworkAt = $null
$lastUsageSignature = $null
function Refresh-LiveStatus {
    $sessions = @(Get-SmbSession -ErrorAction SilentlyContinue | Where-Object { $_.NumOpens -gt 0 })
    $openFiles = @(Get-SmbOpenFile -ErrorAction SilentlyContinue | Where-Object { $_.ShareRelativePath -or $_.Path })
    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up')
    $total = 0.0
    foreach ($adapter in $adapters) {
        $stats = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction SilentlyContinue
        if ($null -ne $stats) { $total += [double]$stats.ReceivedBytes + [double]$stats.SentBytes }
    }
    $now = Get-Date
    $speed = 0.0
    if ($null -ne $lastNetworkBytes -and $total -ge $lastNetworkBytes) {
        $seconds = ($now - $lastNetworkAt).TotalSeconds
        if ($seconds -gt 0) { $speed = ($total - $lastNetworkBytes) / $seconds / 1MB }
    }
    $script:lastNetworkBytes = $total
    $script:lastNetworkAt = $now
    $usagePath = Join-Path $coordinationRoot 'usage.json'
    $registered = 0; $scanned = 0; $pulled = 0
    if (Test-Path -LiteralPath $usagePath) {
        try {
            $usage = Get-Content -LiteralPath $usagePath -Raw | ConvertFrom-Json
            $rows = @($usage.games)
            $registered = @($rows | Where-Object status -eq 'registered').Count
            $pulled = @($rows | Where-Object status -in @('pulled', 'registered')).Count
            $scanned = @($rows | Where-Object status -in @('scanned', 'pulled', 'registered')).Count
        } catch { }
    }
    $clients = @($sessions | Select-Object -ExpandProperty ClientComputerName -Unique)
    $liveLabel.Text = ('SMB 使用中連線：{0}    開啟檔案：{1}    用戶端：{2}`r`n' +
        '網卡即時總流量：{3:N2} MiB/s    中央狀態：已掃描 {4}／已擷取 {5}／已登記使用 {6}') -f `
        $sessions.Count, $openFiles.Count, (($clients -join ', ') -replace '^$', '無'), $speed, $scanned, $pulled, $registered
    $signature = "$($sessions.Count)|$($openFiles.Count)|$($clients -join ',')|$registered|$pulled|$scanned"
    if ($signature -ne $lastUsageSignature) {
        Write-BridgeEvent -Type 'usage' -Message $liveLabel.Text.Replace("`r`n", ' / ') -Data @{
            sessions = $sessions.Count; openFiles = $openFiles.Count; clients = $clients
            scanned = $scanned; pulled = $pulled; registered = $registered
        }
        $script:lastUsageSignature = $signature
        Refresh-History
    }
}

$scanButton.Add_Click({
    $knownLibraries.Clear()
    Refresh-LibraryGrid
    Write-BridgeEvent -Type 'scan' -Message ("偵測到 {0} 個 SteamLibrary。" -f $grid.Rows.Count)
    Refresh-History
})

$addButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = '選擇 SteamLibrary 根目錄或 steamapps 目錄'
    if ($dialog.ShowDialog() -eq 'OK') {
        $before = $knownLibraries.Count
        Add-UniqueLibrary -List $knownLibraries -Path $dialog.SelectedPath
        if ($knownLibraries.Count -eq $before) {
            [System.Windows.Forms.MessageBox]::Show('這個路徑下找不到 steamapps。', '無法新增') | Out-Null
        }
        Refresh-LibraryGrid
    }
})

$applyButton.Add_Click({
    try {
        Ensure-PrivateSmbFirewall
        $account = $accountBox.Text.Trim()
        if ([string]::IsNullOrWhiteSpace($account)) { throw '請填寫 Windows 讀取帳號。' }
        $shares = @()
        $removedShares = @()
        foreach ($row in $grid.Rows) {
            $name = [string]$row.Cells[1].Value
            $library = [string]$row.Cells[2].Value
            $path = Join-Path $library 'steamapps'
            if (-not [bool]$row.Cells[0].Value) {
                $existing = Get-SmbShare -Name $name -ErrorAction SilentlyContinue
                if ($null -ne $existing -and $existing.Path -eq $path) {
                    Remove-SmbShare -Name $name -Force
                    $removedShares += [ordered]@{ shareName = $name; steamLibrary = $library
                        sharedPath = $path; action = 'share-removed-files-preserved' }
                }
                continue
            }
            Ensure-SmbShareState -Name $name -Path $path -Account $account -Access Read
            $shares += [ordered]@{ shareName = $name; steamLibrary = $library; sharedPath = $path
                uncPath = "\\$env:COMPUTERNAME\$name"; access = 'read-only'; account = $account
                gameCount = Count-Games $library }
        }
        $acl = Get-Acl -LiteralPath $coordinationRoot
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $account, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.SetAccessRule($accessRule)
        Set-Acl -LiteralPath $coordinationRoot -AclObject $acl
        Ensure-SmbShareState -Name 'GGDSteamStatus' -Path $coordinationRoot -Account $account -Access Change
        $addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1'
        } | Select-Object -ExpandProperty IPAddress)
        $receipt = [ordered]@{
            schema = 'ggd-windows-steam-shares@2'; generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
            computerName = $env:COMPUTERNAME; ipv4 = $addresses
            firewall = @{ profile = 'Private'; remoteAddress = 'LocalSubnet'; tcpPort = 445 }
            sourceSharesReadOnly = $true; coordinationShare = "\\$env:COMPUTERNAME\GGDSteamStatus"
            shares = $shares; removedShares = $removedShares
        }
        $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
        Write-BridgeEvent -Type 'share-apply' -Message ("已套用 {0} 個唯讀 Steam share，停用 {1} 個 share；收據位於 {2}。" -f $shares.Count, $removedShares.Count, $receiptPath) -Data $receipt
        Refresh-LibraryGrid
        Refresh-History
        [System.Windows.Forms.MessageBox]::Show("已套用 $($shares.Count) 個唯讀分享，停用 $($removedShares.Count) 個分享。`n請把桌面的 GGD-Steam-Shares.json 交給素材整合工作流。", '完成') | Out-Null
    } catch {
        Write-BridgeEvent -Type 'error' -Message $_.Exception.Message
        Refresh-History
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '建立分享失敗') | Out-Null
    }
})

$folderButton.Add_Click({ Start-Process explorer.exe $bridgeRoot })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({ Refresh-LiveStatus })

Refresh-LibraryGrid
if (-not (Test-Path -LiteralPath $historyPath)) {
    Write-BridgeEvent -Type 'startup' -Message 'GGD Steam 遠端素材庫 GUI 首次啟動。'
} else {
    Write-BridgeEvent -Type 'startup' -Message 'GGD Steam 遠端素材庫 GUI 啟動。'
}
Refresh-History
Refresh-LiveStatus
$timer.Start()
[void]$form.ShowDialog()
$timer.Stop()
