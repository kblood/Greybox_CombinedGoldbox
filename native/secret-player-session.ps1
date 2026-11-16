# Explicit Secret Amiga data + DOS pregen composition. Native CCPARTY/CCNEXT
# create and validate party and continuation state; this helper copies inputs.
function Get-SecretSessionIdentity {
  param([string]$AmigaSource, [string]$DosSource, [string]$SessionRoot)
  if (-not $DosSource) { throw 'SecretAmiga requires -SecretDosPath for the supported DOS pregens. No player session was created.' }
  $roots = foreach ($path in @($AmigaSource, $DosSource)) {
    if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Container)) { throw "Secret source directory was not found: $path. No player session was created." }
    (Resolve-Path -LiteralPath $path).ProviderPath.TrimEnd('\')
  }
  if (-not $SessionRoot) { $SessionRoot = Join-Path $PSScriptRoot 'player-sessions' }
  if (-not [IO.Path]::IsPathRooted($SessionRoot)) {
    $SessionRoot = Join-Path (Get-Location -PSProvider FileSystem).ProviderPath $SessionRoot
  }
  $sessionBase = [IO.Path]::GetFullPath($SessionRoot)
  $key = "goldbox-secret-amiga/1`n$($roots[0].ToLowerInvariant())`n$($roots[1].ToLowerInvariant())"
  $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($key))).ToLowerInvariant()
  $mount = Join-Path $sessionBase "secret-amiga-$hash"
  foreach ($source in $roots) {
    if ($mount -ieq $source -or $mount.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase)) {
      throw "Secret player session cannot be placed inside either source: $mount"
    }
  }
  [pscustomobject]@{ AmigaSourceRoot=$roots[0]; DosSourceRoot=$roots[1]; GameMount=$mount
    GameMountPath=(Join-Path $mount 'DISK2'); RuntimeMount=(Join-Path $mount 'GREYBOX'); Marker=($mount + '.secret-complete.json') }
}

function Read-SecretSessionCompletion {
  param($Identity)
  if (-not (Test-Path -LiteralPath $Identity.GameMount -PathType Container) -or
      -not (Test-Path -LiteralPath $Identity.Marker -PathType Leaf)) {
    throw "Secret player session initial composition is absent or incomplete: $($Identity.GameMount)"
  }
  try { $record = [IO.File]::ReadAllText($Identity.Marker) | ConvertFrom-Json -ErrorAction Stop } catch {
    throw "Secret player session completion marker is malformed: $($Identity.Marker)"
  }
  $keys = @($record.PSObject.Properties.Name | Sort-Object)
  if ($record -isnot [pscustomobject] -or ($keys -join ',') -ne 'AmigaSourceRoot,DosSourceRoot,GameDirectory,RuntimeDirectory,Schema' -or
      $record.Schema -isnot [string] -or $record.AmigaSourceRoot -isnot [string] -or $record.DosSourceRoot -isnot [string] -or
      $record.GameDirectory -isnot [string] -or $record.RuntimeDirectory -isnot [string] -or
      $record.Schema -cne 'goldbox-secret-amiga/1' -or
      $record.AmigaSourceRoot -ine $Identity.AmigaSourceRoot -or $record.DosSourceRoot -ine $Identity.DosSourceRoot -or
      $record.GameDirectory -cne 'DISK2' -or $record.RuntimeDirectory -cne 'GREYBOX') {
    throw "Secret player session completion marker does not match both sources and its fixed layout: $($Identity.Marker)"
  }
  return $Identity
}

function Get-ExistingSecretPlayerSession {
  param([string]$AmigaSource, [string]$DosSource, [string]$SessionRoot, [switch]$RequireContinuation)
  $identity = Get-SecretSessionIdentity $AmigaSource $DosSource $SessionRoot
  $session = Read-SecretSessionCompletion $identity
  if ($RequireContinuation) {
    $candidates = @('GSK','GKB','GKT') | Where-Object {
      Test-Path -LiteralPath (Join-Path $session.RuntimeMount "_GBPARTY.$_") -PathType Leaf
    }
    if (-not $candidates) { throw "No native Secret continuation candidate exists in $($session.RuntimeMount). Resume created no session, party or seed." }
  }
  return $session
}

function Test-SecretInitialInputs {
  param($Identity)
  $files = @()
  foreach ($relative in @('DISK2\ECL.GLB','DISK2\GEO.GLB','DISK2\MONCHA.GLB','DISK2\MONITM.GLB','DISK2\MONSPC.GLB','DISK1\ITEMS.DAT')) {
    $path = Join-Path $Identity.AmigaSourceRoot $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Secret Amiga input is missing: $path. No player session was created." }
    $raw = [IO.File]::ReadAllBytes($path)
    if ($relative.EndsWith('.GLB')) {
      if ($raw.Length -lt 28 -or [Text.Encoding]::ASCII.GetString($raw,0,4) -cne 'GLIB') { throw "Secret Amiga input must be GLIB: $path" }
      $count = 1 + ($raw[8] * 256 + $raw[9])
      $declared=[long]$raw[4]*16777216 + [long]$raw[5]*65536 + [long]$raw[6]*256 + $raw[7]
      if ($declared -ne $raw.Length -or $raw[10] -ne 0 -or $raw[11] -ne 1 -or
          [Text.Encoding]::ASCII.GetString($raw,12,4) -cne 'DATA' -or
          $count -lt 3 -or $count -gt 257 -or 16 + 4 * $count -gt $raw.Length) { throw "Secret GLIB header or pointer table is unsupported: $path" }
      $previous = 16 + 4 * $count
      $pointers=@()
      for ($index=0; $index -lt $count; $index++) {
        $at=16+4*$index
        $pointer=[long]$raw[$at]*16777216 + [long]$raw[$at+1]*65536 + [long]$raw[$at+2]*256 + $raw[$at+3]
        if ($pointer -lt $previous -or $pointer -gt $raw.Length) { throw "Secret GLIB pointer bounds are invalid: $path" }
        $previous=$pointer
        $pointers += $pointer
      }
      if ($previous -notin @($raw.Length,($raw.Length-1))) { throw "Secret GLIB final extent is invalid: $path" }
      if ($relative -eq 'DISK2\ECL.GLB') {
        if ($count -gt 256 -or $pointers[1]-$pointers[0] -gt 512) { throw "Secret ECL pointer/member table exceeds native transport capacity: $path" }
        $at=$pointers[0];$entries=$raw[$at]*256+$raw[$at+1]
        if ($entries -lt 1 -or $pointers[1]-$at -ne 2+4*$entries -or $pointers[-1] -ne $raw.Length) { throw "Secret ECL member table extent is invalid: $path" }
        $ids=@{};$start=$null;$end=$null
        foreach ($index in 0..($entries-1)) {
          $row=$at+2+4*$index;$id=$raw[$row]*256+$raw[$row+1];$member=$raw[$row+2]*256+$raw[$row+3]
          if ($ids.ContainsKey($id) -or $member -lt 1 -or $member -ge $count-1) { throw "Secret ECL member identity is invalid: $path" }
          $ids[$id]=$true
          if ($id -eq 16) {$start=$pointers[$member];$end=$pointers[$member+1]}
        }
        if ($null -eq $start -or $end-$start -lt 20 -or $end-$start -gt 16000) { throw "Secret ECL area16 is missing or outside the native decoded extent: $path" }
      }
    } elseif ($raw.Length -ne 2048) { throw "Secret item catalogue must contain 2048 bytes: $path" }
    $files += [pscustomobject]@{ Source=$path; Relative=$relative }
  }
  $ownedLength = 16 + 6*440 + 16 + 2048 + 6*8
  foreach ($slot in 1..6) {
    $name="CHRDATA$slot.SAV"; $path=Join-Path $Identity.DosSourceRoot $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Secret DOS pregen is missing: $path. No player session was created." }
    $raw=[IO.File]::ReadAllBytes($path)
    if ($raw.Length -ne 439 -or $raw[0] -gt 15 -or $raw[437] -gt $raw[112] -or @($raw[273..286] | Where-Object { $_ -gt 18 }).Count) {
      throw "Secret DOS pregen is outside the supported 439-byte format: $path"
    }
    $files += [pscustomobject]@{ Source=$path; Relative="DISK2\$name" }
    foreach ($extension in @('STF','SFX')) {
      $name="CHRDATA$slot.$extension"; $path=Join-Path $Identity.DosSourceRoot $name
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
      $raw=[IO.File]::ReadAllBytes($path); $stride=if ($extension -eq 'STF') {67} else {9}
      if ($raw.Length % $stride) { throw "Secret $extension companion is truncated: $path" }
      if ($extension -eq 'STF') {
        for ($at=0; $at -lt $raw.Length; $at+=67) {
          if ($raw[$at+46] -eq 73) {
            $at += 67*$raw[$at+57]
            if ($at -ge $raw.Length) { throw "Secret STF container children are truncated: $path" }
          }
        }
      }
      $ownedLength += $raw.Length
      $files += [pscustomobject]@{ Source=$path; Relative="DISK2\$name" }
    }
  }
  if ($ownedLength -gt 32768) { throw 'Secret pregens and companions exceed the native owned-party extent.' }
  return $files
}

function New-SecretPlayerSession {
  param([string]$AmigaSource, [string]$DosSource, [string]$SessionRoot)
  $identity = Get-SecretSessionIdentity $AmigaSource $DosSource $SessionRoot
  # Completed snapshots are durable player input. Changed retail bytes never
  # cause revalidation, recopying or a replacement of a played party.
  if ((Test-Path -LiteralPath $identity.GameMount) -or (Test-Path -LiteralPath $identity.Marker)) {
    return Read-SecretSessionCompletion $identity
  }
  $files = @(Test-SecretInitialInputs $identity)
  New-Item -ItemType Directory -Path $identity.GameMount | Out-Null
  foreach ($file in $files) {
    $destination=Join-Path $identity.GameMount $file.Relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $file.Source -Destination $destination
    (Get-Item -LiteralPath $destination).IsReadOnly=$false
  }
  $record=[ordered]@{ Schema='goldbox-secret-amiga/1'; AmigaSourceRoot=$identity.AmigaSourceRoot; DosSourceRoot=$identity.DosSourceRoot
    GameDirectory='DISK2'; RuntimeDirectory='GREYBOX' }
  [IO.File]::WriteAllText($identity.Marker,($record | ConvertTo-Json))
  return $identity
}
