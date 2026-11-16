# Shared staging helper for the native DOSBox smoke/flow scripts.
#
# WHY THIS EXISTS.  CLAUDE.md: "Game-data folders are large binary GOG releases
# -- don't reformat or bulk-rewrite them; treat them as read-only source."  Many
# of these scripts did the opposite: `mount D "<retail folder>"` followed by
# `D:` makes the retail release the DOS child's CURRENT DRIVE, so every stray
# file the child writes lands in the retail release.
#
# OBSERVED, not inferred (2026-09-05, on an unmodified native/src tree): one run
# of native\gbflow-test.ps1 created "Champions of Krynn/CCFP.MOV" AND rewrote
# six tracked "Champions of Krynn/SAVE/CHRDATA*.SAV" files.  The saves came back
# byte-identical, so `git status` stayed clean and only the mtimes moved -- which
# is exactly why this went unnoticed: a content-only oracle cannot see it.
#
# THE FIX.  Mirror the retail folder into a scratch directory under native\build
# and mount THAT.  The child still sees the same file tree, so behaviour is
# unchanged; its writes land in the mirror.  This is the same pattern
# gbscene-dos-flow-test.ps1 and gbcombat-icon-flow-test.ps1 use inline.
#
# SEMANTICS.  The mirror is SYNCED, not rebuilt: any file present in the source
# is refreshed when it differs (length or write time), and any extra file the
# DOS child created is LEFT ALONE.  That reproduces today's behaviour exactly --
# source bytes pristine at the start of every run, child writes persisting
# across runs -- minus the damage to the retail tree.  Pass -Fresh for a
# guaranteed-clean mirror.
#
# Bulk (PDF/icon/launcher/DOSBox/tooling) content is skipped: no DOS child opens
# it, and copying ~50 MB of manuals per run would make the mirror expensive
# enough that someone would be tempted to skip it.
#
# SHARED RESOURCE -- DISCLOSED HERE BECAUSE THE DIFF THAT INTRODUCED IT DID NOT.
# There is ONE mirror per title, keyed by the source folder's leaf name, and
# roughly eight scripts now mount the same one. That re-centralises, a level up,
# exactly the hazard round 37's correction C6 records: native\build was already
# shared by ~20 flow scripts, and a stray file from one script landed inside
# another agent's assertion window and corrupted its measurement. Mirroring the
# retail tree removes the damage to the RETAIL folder; it does not make the
# mirror private.
#   CONCURRENCY RULE. Do not run two scripts that stage the same title at the
#   same time, and never assert on the CONTENTS of a mirror -- by design the
#   sync leaves extra files alone, so a concurrent run's DOS child may have
#   written into the tree you are about to measure. A task that needs an
#   isolated tree must pass its own -Name (plus -Fresh), which is the same
#   remedy the slug-collision guard below points at. This project's standing
#   rule is to partition by RESOURCE, and a scratch directory is a resource.

$script:RetailStageExcludeDirs = @('DOSBOX', 'tools', 'docs', 'Documentation', '__pycache__', '.git')
$script:RetailStageExcludeExts = @('.pdf', '.ico', '.lnk')

function New-RetailStage {
  [CmdletBinding()]
  param(
    # The read-only source folder (a retail GOG release, a *_extracted tree...).
    [Parameter(Mandatory = $true)][string]$Source,
    # Mirror directory name; defaults to the source folder's leaf name.
    [string]$Name,
    # Where mirrors live; defaults to native\build\_retail.
    [string]$StageRoot,
    # Copy only these source-relative paths instead of mirroring the tree.
    # Every entry MUST exist under $Source; a missing one throws (see below).
    [string[]]$Files,
    # Source-relative paths under -Files that are allowed to be absent.
    # Opt in by name; there is no silent skip.
    [string[]]$Optional,
    # Delete the mirror before copying, discarding earlier child writes.
    [switch]$Fresh
  )

  if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "New-RetailStage: source folder not found: $Source"
  }
  $srcRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')

  if (-not $Name) { $Name = Split-Path -Leaf $srcRoot }
  $slug = ($Name -replace '[^A-Za-z0-9._-]+', '-').Trim('-')
  if (-not $slug) { $slug = 'stage' }

  if (-not $StageRoot) { $StageRoot = Join-Path (Join-Path $PSScriptRoot 'build') '_retail' }
  # Absolute from here on: the marker below is read/written through .NET file
  # APIs, whose working directory is the process's, not PowerShell's location.
  # The default StageRoot is already rooted; only a caller-supplied relative one
  # needs this, and no current caller passes -StageRoot at all.
  if (-not [System.IO.Path]::IsPathRooted($StageRoot)) {
    $StageRoot = Join-Path (Get-Location -PSProvider FileSystem).ProviderPath $StageRoot
  }
  $dest = Join-Path $StageRoot $slug

  # Refuse to stage onto the source itself; that would defeat the whole point.
  if ($dest.TrimEnd('\') -ieq $srcRoot) {
    throw "New-RetailStage: refusing to stage $srcRoot onto itself"
  }

  # SLUG COLLISION -- made loud, not fixed. The slug is the source folder's LEAF
  # NAME, so two different sources sharing a leaf map to one mirror: this repo's
  # own "Champions of Krynn" and a GOG Galaxy install of the same name, which
  # native/run-cok.ps1's -GamePath parameter can supply. The sync is not a purge,
  # so they would silently MERGE -- files unique to one source surviving into the
  # other's mount, which is a wrong-bytes bug that looks like nothing. Not
  # triggered today: no caller passes a second source with a colliding leaf.
  # The guard below only DETECTS it, deliberately: changing the slug scheme would
  # move every existing mirror's path, and round 37 R2 was forbidden to run
  # anything, so that change could not have been verified. A caller that
  # genuinely needs both sources passes an explicit -Name, the way
  # tools/dosbox_x_debugbox_probe.ps1 (Get-SafeMountDir) already does: leaf name
  # plus an MD5 prefix of the full lower-cased source path.
  # The provenance marker is a SIBLING of the mirror, never a file inside it, so
  # the tree the DOS child sees when the mirror is mounted is unchanged.
  $marker = $dest + '.source'
  if (Test-Path -LiteralPath $marker -PathType Leaf) {
    # .NET file APIs on both sides of this round-trip: Set-Content/Get-Content
    # -Encoding differ between Windows PowerShell 5.1 and PowerShell 7 (5.1's
    # UTF8 emits a BOM, which Trim() does not strip), and a BOM would make a
    # matching path compare UNEQUAL and throw a phantom collision.
    $prev = ([string][System.IO.File]::ReadAllText($marker)).Trim()
    if ($prev -and ($prev -ine $srcRoot)) {
      throw ("New-RetailStage: mirror '$dest' was staged from '$prev'; refusing " +
             "to merge '$srcRoot' into it. Pass an explicit -Name to disambiguate.")
    }
  }

  if ($Fresh -and (Test-Path -LiteralPath $dest)) {
    Remove-Item -LiteralPath $dest -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  [System.IO.File]::WriteAllText($marker, $srcRoot)

  $named = ($Files -and $Files.Count -gt 0)
  $relatives = @()
  if ($named) {
    $relatives = $Files
  } else {
    $prefixLen = $srcRoot.Length + 1
    foreach ($item in (Get-ChildItem -LiteralPath $srcRoot -Recurse -File -Force)) {
      $rel = $item.FullName.Substring($prefixLen)
      $skip = $false
      foreach ($seg in $rel.Split('\')) {
        if ($script:RetailStageExcludeDirs -contains $seg) { $skip = $true; break }
      }
      if ($skip) { continue }
      if ($script:RetailStageExcludeExts -contains $item.Extension.ToLowerInvariant()) { continue }
      $relatives += $rel
    }
  }

  foreach ($rel in $relatives) {
    $from = Join-Path $srcRoot $rel
    if (-not (Test-Path -LiteralPath $from -PathType Leaf)) {
      # A missing source FOLDER throws loudly above; a missing NAMED file used
      # to be skipped without a word. The failure that hid behind that silence:
      # a typo in -Files produces a mirror missing that file, the mirror is
      # mounted anyway, and the run fails inside DOS -- while the caller's own
      # data-presence guard, which tests the SOURCE path, passed. Nothing in the
      # error pointed back at the typo.
      # Checked before changing it (2026-09-05, `grep -rn New-RetailStage`): no
      # caller anywhere in the repo passes -Files at all. All 29 call sites pass
      # -Source; exactly four also pass -Name (gbboot-test.ps1 x3 and
      # tools/dosbox_x_debugbox_probe.ps1). So no current caller relies on the
      # old skip and none is broken by throwing. Genuinely optional inputs opt
      # in by name via -Optional.
      # The un-named (tree-walk) path keeps the skip on purpose: there $relatives
      # came from enumerating the source moments earlier, so a miss means the
      # file vanished mid-walk, which is a race and not a caller error.
      if (-not $named) { continue }
      if ($Optional -contains $rel) { continue }
      throw ("New-RetailStage: -Files entry not found under ${srcRoot}: $rel " +
             "(list it in -Optional if it is genuinely optional)")
    }
    $to = Join-Path $dest $rel
    $toDir = Split-Path -Parent $to
    if ($toDir -and -not (Test-Path -LiteralPath $toDir)) {
      New-Item -ItemType Directory -Force -Path $toDir | Out-Null
    }
    if (Test-Path -LiteralPath $to -PathType Leaf) {
      $a = Get-Item -LiteralPath $from -Force
      $b = Get-Item -LiteralPath $to -Force
      if ($a.Length -eq $b.Length -and $a.LastWriteTimeUtc -eq $b.LastWriteTimeUtc) { continue }
      if ($b.IsReadOnly) { $b.IsReadOnly = $false }
    }
    Copy-Item -LiteralPath $from -Destination $to -Force
    # A read-only source file would otherwise make the mirror unwritable too,
    # and an unwritable mirror is one a frustrated future run "fixes" by
    # pointing the mount back at the retail folder.
    $copied = Get-Item -LiteralPath $to -Force
    if ($copied.IsReadOnly) { $copied.IsReadOnly = $false }
  }

  return $dest
}

function New-PlayerSession {
  <#
    Create (once) or reopen a persistent player-owned snapshot of a retail
    game tree.  This deliberately does *not* use the sync semantics of
    New-RetailStage after the first invocation: a later source refresh must
    never replace a player's saves or Greybox checkpoint.

    Test runners continue to use New-RetailStage below native\build\_retail.
    Player sessions default to native\player-sessions and carry a source-path
    marker beside the mounted tree so two same-named installs cannot merge.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$SessionRoot
  )

  if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "New-PlayerSession: source folder not found: $Source"
  }
  $srcRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
  if (-not $SessionRoot) { $SessionRoot = Join-Path $PSScriptRoot 'player-sessions' }
  if (-not [IO.Path]::IsPathRooted($SessionRoot)) {
    $SessionRoot = Join-Path (Get-Location -PSProvider FileSystem).ProviderPath $SessionRoot
  }
  $SessionRoot = [IO.Path]::GetFullPath($SessionRoot).TrimEnd('\')

  # The source path, rather than its leaf name, is part of the session key.
  # This prevents a repository install and a GOG install named "Champions of
  # Krynn" from ever sharing player data.
  $slug = ((Split-Path -Leaf $srcRoot) -replace '[^A-Za-z0-9._-]+', '-').Trim('-')
  if (-not $slug) { $slug = 'game' }
  $pathBytes = [Text.Encoding]::UTF8.GetBytes($srcRoot.ToLowerInvariant())
  $hash = [Security.Cryptography.SHA256]::HashData($pathBytes)
  $suffix = ([Convert]::ToHexString($hash)).Substring(0, 12).ToLowerInvariant()
  $name = "$slug-$suffix"
  $dest = Join-Path $SessionRoot $name
  $marker = $dest + '.source'
  # The source marker proves ownership, not that the initial copy finished:
  # New-RetailStage writes it before enumerating/copying the tree.  Keep a
  # separate completion record so an interrupted first snapshot can never be
  # mistaken for a durable player session on a later launch.
  $complete = $dest + '.complete'

  if ($dest.TrimEnd('\') -ieq $srcRoot -or $dest.StartsWith($srcRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "New-PlayerSession: refusing to place a session inside its source: $dest"
  }
  if (Test-Path -LiteralPath $dest -PathType Container) {
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
      throw "New-PlayerSession: existing session lacks its source marker: $dest"
    }
    $previous = ([string][IO.File]::ReadAllText($marker)).Trim()
    if ($previous -ine $srcRoot) {
      throw "New-PlayerSession: session '$dest' belongs to '$previous', not '$srcRoot'"
    }
    if (-not (Test-Path -LiteralPath $complete -PathType Leaf)) {
      throw "New-PlayerSession: existing session initial snapshot is incomplete: $dest"
    }
    $completionSource = ([string][System.IO.File]::ReadAllText($complete)).Trim()
    if ($completionSource -ine $srcRoot) {
      throw "New-PlayerSession: session '$dest' completion marker belongs to '$completionSource', not '$srcRoot'"
    }
    return $dest
  }

  # New-RetailStage has the correct one-time copy rules: it excludes bulk
  # launcher/manual files and clears inherited read-only attributes.  Do not
  # call it again after this initial snapshot.
  $created = New-RetailStage -Source $srcRoot -Name $name -StageRoot $SessionRoot
  if ($created -ine $dest -or -not (Test-Path -LiteralPath $dest -PathType Container)) {
    throw "New-PlayerSession: initial snapshot did not create its expected path: $dest"
  }
  [System.IO.File]::WriteAllText($complete, $srcRoot)
  return $dest
}
