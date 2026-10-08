$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
$ModDir = Join-Path $Root 'mod'
$DesktopDir = Join-Path $Root 'desktop'
$SettingsPath = Join-Path $HOME '.claude\settings.json'
$CockpitUrl = 'http://127.0.0.1:48123/'
$EnvKey = 'CLAUDE_CODE_PLUGIN_DIRS'

function Register-Mod {
  $settings = [pscustomobject]@{}
  if (Test-Path $SettingsPath) {
    Copy-Item $SettingsPath "$SettingsPath.avant-cockpit" -Force
    $settings = Get-Content $SettingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
  }
  if (-not $settings.PSObject.Properties['env']) {
    $settings | Add-Member -NotePropertyName env -NotePropertyValue ([pscustomobject]@{})
  }
  $current = $settings.env.PSObject.Properties[$EnvKey]
  if ($current -and $current.Value -and $current.Value -ne $ModDir) {
    throw "$EnvKey vaut déjà « $($current.Value) » dans $SettingsPath. Ajoute le mod à la main : $ModDir"
  }
  $settings.env | Add-Member -NotePropertyName $EnvKey -NotePropertyValue $ModDir -Force
  $json = $settings | ConvertTo-Json -Depth 64
  [IO.File]::WriteAllText($SettingsPath, $json, [Text.UTF8Encoding]::new($false))
  Write-Host "Mod déclaré dans $SettingsPath (copie de l'ancien fichier : settings.json.avant-cockpit)"
}

function Install-Desktop {
  Push-Location $DesktopDir
  try {
    npm install --no-audit --no-fund
    node node_modules/electron/install.js
  } finally {
    Pop-Location
  }
  Write-Host 'Application des petites têtes installée'
}

function Find-Browser {
  $paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe'
  )
  foreach ($path in $paths) {
    if (Test-Path $path) { return (Get-ItemProperty $path).'(default)' }
  }
  throw 'Ni Chrome ni Edge trouvé'
}

function New-Shortcut([string]$Name, [string]$Target, [string]$Arguments, [string]$Icon) {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop "$Name.lnk"))
  $link.TargetPath = $Target
  $link.Arguments = $Arguments
  $link.IconLocation = $Icon
  $link.Save()
  Write-Host "Raccourci « $Name » posé sur le bureau"
}

Register-Mod
Install-Desktop
$browser = Find-Browser
$electron = Join-Path $DesktopDir 'node_modules\electron\dist\electron.exe'
New-Shortcut 'Conversations Claude' $browser "--app=$CockpitUrl --window-size=1180,900" "$browser,0"
New-Shortcut 'Mini équipe' $electron "`"$DesktopDir`"" "$browser,0"
Write-Host ''
Write-Host 'Terminé. Redémarre Claude Desktop pour que les conversations chargent le mod.'
