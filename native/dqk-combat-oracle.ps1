function Read-MonchaStats {
  param([string]$Path, [int[]]$Ids)
  $d = [IO.File]::ReadAllBytes($Path)
  if ([Text.Encoding]::ASCII.GetString($d, 0, 4) -ne 'HLIB') { throw "MONCHA: $Path is not an HLIB container" }
  $count = [int][BitConverter]::ToUInt16($d, 8) + 1
  $ptrs = @(0..($count - 1) | ForEach-Object { [BitConverter]::ToUInt32($d, 16 + 4 * $_) })
  $out = @{}
  foreach ($id in ($Ids | Sort-Object -Unique)) {
    if ($id -lt 1 -or $id -ge $count - 1) { throw "MONCHA: member $id out of range (count $count)" }
    $s = [int]$ptrs[$id]; $e = [int]$ptrs[$id + 1]
    $want = ([int]$d[$s] -shl 8) -bor [int]$d[$s + 1]
    $rec = New-Object 'System.Collections.Generic.List[byte]'
    $i = $s + 2
    while ($i -lt $e) {
      $c = [int]$d[$i]; $i++
      if ($c -eq 0x80) { continue }
      elseif ($c -lt 0x80) { $n = $c + 1; for ($k = 0; $k -lt $n -and $i -lt $e; $k++) { $rec.Add($d[$i]); $i++ } }
      else { $n = 257 - $c; if ($i -lt $e) { for ($k = 0; $k -lt $n; $k++) { $rec.Add($d[$i]) }; $i++ } }
    }
    if ($rec.Count -ne $want) { throw "MONCHA member ${id}: expanded to $($rec.Count) bytes, header declares $want" }
    $b = $rec.ToArray()
    $A = 0x78
    if ($b[0x66] -ne 1) { throw "MONCHA member ${id}: not a bestiary record" }
    $db = [int]$b[$A + 65]; if ($db -gt 127) { $db -= 256 }
    $db2 = [int]$b[$A + 66]; if ($db2 -gt 127) { $db2 -= 256 }
    $hd = [int]$b[$A + 25]
    $out[$id] = [pscustomobject]@{
      Id          = $id
      Name        = ([Text.Encoding]::ASCII.GetString($b, 0x68, 16) -split "`0")[0]
      MaxHp       = [Math]::Max($hd, [int](($hd * 9 + 1) -shr 1))
      Thac0       = 60 - [int]$b[$A + 15]
      Ac          = 60 - [int]$b[$A + 67]
      DCount      = [int]$b[$A + 61]
      DSides      = [int]$b[$A + 63]
      DBonus      = $db
      HalfAttacks = [int]$b[$A + 59]
      SecondaryHalfAttacks = [int]$b[$A + 60]
      SecondaryDCount = [int]$b[$A + 62]
      SecondaryDSides = [int]$b[$A + 64]
      SecondaryDBonus = $db2
      Xp          = [int][BitConverter]::ToUInt16($b, 0x54)
    }
  }
  return $out
}

function New-RngStream {
  param([int]$Seed, [int]$N)
  $s = [uint64]$Seed
  $o = New-Object 'System.Collections.Generic.List[uint32]'
  for ($i = 0; $i -lt $N; $i++) { $s = ($s * 1664525UL + 1013904223UL) -band 0xFFFFFFFFUL; $o.Add([uint32]$s) }
  return $o
}

function Get-DqkAttackProfiles {
  param($Monster, [int]$Round)
  if ($Round -lt 1) { throw 'DQK attack rounds are one-based' }
  $primary = [pscustomobject]@{ Kind = 1; Rate = $Monster.HalfAttacks; DCount = $Monster.DCount; DSides = $Monster.DSides; DBonus = $Monster.DBonus }
  $secondary = [pscustomobject]@{ Kind = 2; Rate = $Monster.SecondaryHalfAttacks; DCount = $Monster.SecondaryDCount; DSides = $Monster.SecondaryDSides; DBonus = $Monster.SecondaryDBonus }
  foreach ($profile in @($secondary, $primary)) {
    $count = ([int]$profile.Rate -shr 1)
    if (($Round % 2) -eq 0) { $count += ([int]$profile.Rate -band 1) }
    for ($i = 0; $i -lt $count; $i++) { $profile }
  }
}

function Get-DqkProfileDamage {
  param($Profile, $Stream, [ref]$Cursor)
  $sum = [int]$Profile.DBonus
  for ($i = 0; $i -lt $Profile.DCount; $i++) {
    if ($Profile.DSides -le 1) { $sum += [Math]::Max(0, [int]$Profile.DSides) }
    else {
      if ($Cursor.Value -ge $Stream.Count) { throw 'DQK oracle RNG stream exhausted' }
      $sum += [int]($Stream[$Cursor.Value] % $Profile.DSides) + 1
      $Cursor.Value++
    }
  }
  return [Math]::Max(1, $sum)
}

function Get-DqkInitialPositions {
  # Party rows default to CCCOMBAT's /P placement (col 3, row ncomb+2); a fixture that places its own
  # party (the built-in /E roster) passes -PartyPositions @{ p0 = @(col,row); ... }.
  param([string[]]$PartyIds, [string[]]$EnemyIds, [hashtable]$PartyPositions = $null)
  $enemySlotCols = @(5,5,5,6,6,6,7,7,7,8,8,8,5,6,7,8,5,6,7,8,5,6,7,8,5,6,7,8,5,6)
  $enemySlotRows = @(4,5,6,4,5,6,4,5,6,4,5,6,3,3,3,3,7,7,7,7,2,2,2,2,8,8,8,8,1,1)
  $positions = @{}
  for ($i = 0; $i -lt $PartyIds.Count; $i++) {
    $positions[$PartyIds[$i]] = if ($PartyPositions -and $PartyPositions.ContainsKey($PartyIds[$i])) { [int[]]$PartyPositions[$PartyIds[$i]] } else { [int[]]@(3, ($i + 2)) }
  }
  for ($i = 0; $i -lt $EnemyIds.Count; $i++) {
    $slot = $i % $enemySlotCols.Count
    $positions[$EnemyIds[$i]] = [int[]]@($enemySlotCols[$slot], $enemySlotRows[$slot])
  }
  return $positions
}

function Get-DqkLeavingReactionRows {
  param([string[][]]$Rows, [string[]]$PartyIds, [string[]]$EnemyIds, [hashtable]$PartyPositions = $null)
  $positions = Get-DqkInitialPositions -PartyIds $PartyIds -EnemyIds $EnemyIds -PartyPositions $PartyPositions
  $reactionRows = [Collections.Generic.HashSet[int]]::new()
  for ($rowIndex = 0; $rowIndex -lt $Rows.Count; $rowIndex++) {
    $f = $Rows[$rowIndex]
    if ($f[1] -eq 'attack' -and $rowIndex -gt 0 -and $rowIndex + 1 -lt $Rows.Count -and
        $Rows[$rowIndex - 1][1] -eq 'move' -and $Rows[$rowIndex + 1][1] -eq 'move' -and
        $Rows[$rowIndex - 1][2] -eq $f[3] -and $Rows[$rowIndex + 1][2] -eq $f[3] -and
        $f[2][0] -ne $f[3][0] -and
        $positions.ContainsKey($f[3]) -and $positions.ContainsKey($f[2])) {
      $from = $positions[$f[3]]; $foe = $positions[$f[2]]
      $to = [int[]]@([int]$Rows[$rowIndex + 1][10], [int]$Rows[$rowIndex + 1][11])
      $before = [Math]::Max([Math]::Abs($from[0] - $foe[0]), [Math]::Abs($from[1] - $foe[1]))
      $after = [Math]::Max([Math]::Abs($to[0] - $foe[0]), [Math]::Abs($to[1] - $foe[1]))
      if ($before -le 1 -and $after -gt 1) { [void]$reactionRows.Add($rowIndex) }
    }
    if ($f[1] -eq 'move' -and $positions.ContainsKey($f[2])) {
      $positions[$f[2]] = [int[]]@([int]$f[10], [int]$f[11])
    }
  }
  return ,$reactionRows
}

function Assert-DerivedCombat {
  param([string]$Label, [string]$DumpText, [string[]]$Trace, [string]$MonchaPath, [int]$Seed, [hashtable]$PartyPositions = $null)

  $rows = @(); foreach ($l in $Trace) { $rows += , ($l -split '\s+') }

  # --- roster: from the encounter's OWN monster records, never a literal ---
  if ($DumpText -notmatch 'GBEC groups=([0-9A-F]{4})') { throw "${Label}: no GBEC groups line" }
  $groups = [Convert]::ToInt32($Matches[1], 16)
  $recs = @()
  foreach ($m in [regex]::Matches($DumpText, '@([0-9A-F]{2}) MONSTER id=([0-9A-F]{4}) count=([0-9A-F]{4}) pic=([0-9A-F]{4})')) {
    $recs += [pscustomobject]@{
      Slot  = [Convert]::ToInt32($m.Groups[1].Value, 16)
      Id    = [Convert]::ToInt32($m.Groups[2].Value, 16)
      Count = [Convert]::ToInt32($m.Groups[3].Value, 16)
      Pic   = [Convert]::ToInt32($m.Groups[4].Value, 16)
    }
  }
  if ($recs.Count -ne $groups) { throw "${Label}: GBEC declares $groups groups but $($recs.Count) MONSTER records follow" }
  $expEnemies = ($recs | Measure-Object Count -Sum).Sum
  $mon = Read-MonchaStats -Path $MonchaPath -Ids ($recs.Id)

  $inits = @($rows | Where-Object { $_[1] -eq 'init' })
  $partyIds = @($inits | Where-Object { $_[2] -match '^p' } | ForEach-Object { $_[2] })
  $enemyIds = @($inits | Where-Object { $_[2] -match '^e' } | ForEach-Object { $_[2] })
  if ($enemyIds.Count -ne $expEnemies) {
    throw "${Label}: roster has $($enemyIds.Count) enemies but the MONSTER records sum to $expEnemies"
  }
  if ($inits.Count -ne $partyIds.Count + $enemyIds.Count) { throw "${Label}: init rows are not a clean party/enemy split" }

  # enemy ordinal -> monster group, in the order and counts the records declare
  $grp = @{}; $n = 0
  foreach ($r in $recs) { for ($k = 0; $k -lt $r.Count; $k++) { $grp["e$n"] = $mon[$r.Id]; $n++ } }

  $attackRows = @()
  for ($rowIndex = 0; $rowIndex -lt $rows.Count; $rowIndex++) {
    if ($rows[$rowIndex][1] -eq 'attack') {
      $attackRows += [pscustomobject]@{ Row = $rowIndex; Fields = $rows[$rowIndex] }
    }
  }
  $attacks = @($attackRows | ForEach-Object { $_.Fields })
  if ($attacks.Count -lt 1) { throw "${Label}: trace contains no attack rows" }

  # Leaving reactions are emitted after the move that enters adjacency and
  # immediately before the next move that leaves it. This reconstruction is
  # intentionally limited to the one-reactor, nonlethal case in the pinned
  # DQK area-5 fixture; multi-reactor and lethal-reaction ordering needs an
  # explicit source-order model before this oracle is used for those traces.
  # The combat trace omits an explicit reaction marker, so reconstruct it from
  # the current footprints, effect-derived enemy anchors, and the following
  # move. The reaction uses the primary profile and does not consume the
  # actor's scheduled per-round attack cursor.
  $reactionRows = Get-DqkLeavingReactionRows -Rows $rows -PartyIds $partyIds -EnemyIds $enemyIds -PartyPositions $PartyPositions

  # --- every d20 roll and every monster damage roll, from the LCG ---
  $maxDice = [int](($mon.Values | ForEach-Object { $_.DCount; $_.SecondaryDCount } | Measure-Object -Maximum).Maximum)
  # Target selection draws (retail DQK AI, docs/engine/research/dqk-npc-ai-body.md 4.2):
  # every pick is uniform over the in-reach hostile foes, one die(m) draw when m >= 2 and
  # none otherwise.  A turn picks once at its start (at the position it starts from, or --
  # when it had to close in -- after its move steps), and a swing re-picks when the stored
  # target is dead or its side is 0 (so every swing of a computer-controlled monster).
  # Leaving-reaction swings do not pick.  The model therefore needs, for every pick, the
  # candidate set; it is rebuilt from the trace's own move and hp rows, in combatant-array
  # order (party first, then enemies), with unit footprints (checked: every attack row's
  # victim must be a member of the set the model predicts).
  $order = @($partyIds) + @($enemyIds)
  $initPos = Get-DqkInitialPositions -PartyIds $partyIds -EnemyIds $enemyIds -PartyPositions $PartyPositions
  $st = New-RngStream -Seed $Seed -N (2 * $inits.Count + 9 + (3 + [Math]::Max(1, $maxDice)) * $attacks.Count)
  $align = {
    param($off)
    $k = $off
    $seen = @{}
    $pos = @{}; foreach ($id in $order) { $pos[$id] = [int[]]@($initPos[$id][0], $initPos[$id][1]) }
    $alive = [Collections.Generic.HashSet[string]]::new(); foreach ($id in $order) { [void]$alive.Add($id) }
    $turnKey = ''; $moved = $false; $first = $true; $stored = $null
    $reach = {
      param($a)
      $set = @()
      foreach ($id in $order) {
        if ($id[0] -eq $a[0] -or -not $alive.Contains($id)) { continue }
        $d = [Math]::Max([Math]::Abs($pos[$id][0] - $pos[$a][0]), [Math]::Abs($pos[$id][1] - $pos[$a][1]))
        if ($d -le 1) { $set += $id }
      }
      return $set
    }
    for ($ri = 0; $ri -lt $rows.Count; $ri++) {
      $f = $rows[$ri]
      if ($f[1] -eq 'move' -and $pos.ContainsKey($f[2])) {
        $key = "$($f[0]):$($f[2])"
        if ($key -ne $turnKey) {
          $turnKey = $key; $moved = $false; $first = $true; $stored = $null
          # a turn only closes in when nothing is in reach at its start
          if (@(& $reach $f[2]).Count -ne 0) { $script:oracleWhy = 'site1 row ' + $ri + ' ' + ($f -join ' ') + ' k=' + $k; return $false }
        }
        $moved = $true
        $pos[$f[2]] = [int[]]@([int]$f[10], [int]$f[11])
        continue
      }
      if ($f[1] -ne 'attack') { continue }
      $a = $f[2]; $t = $f[3]
      $isReaction = $reactionRows.Contains($ri)
      $profile = $null
      if ($grp.ContainsKey($a)) {
        if ($isReaction) {
          $monster = $grp[$a]
          $profile = [pscustomobject]@{ DCount = $monster.DCount; DSides = $monster.DSides; DBonus = $monster.DBonus }
        } else {
          $pk = "$($f[0]):$a"
          $index = if ($seen.ContainsKey($pk)) { $seen[$pk] } else { 0 }
          $profiles = @(Get-DqkAttackProfiles -Monster $grp[$a] -Round ([int]$f[0]))
          if ($index -ge $profiles.Count) { $script:oracleWhy = 'site2 row ' + $ri + ' ' + ($f -join ' ') + ' k=' + $k; return $false }
          $profile = $profiles[$index]
          $seen[$pk] = $index + 1
        }
      }
      if (-not $isReaction) {
        $key = "$($f[0]):$a"
        if ($key -ne $turnKey) { $turnKey = $key; $moved = $false; $first = $true; $stored = $null }
        $repick = $false
        if ($first) {
          $first = $false
          $repick = $true                                  # the turn's own pick (initial or after closing in)
          $set = @(& $reach $a)
          if ($set.Count -ge 2) { if ($k -ge $st.Count) { throw 'DQK oracle RNG stream exhausted' }; $stored = $set[[int]($st[$k] % $set.Count)]; $k++ }
          elseif ($set.Count -eq 1) { $stored = $set[0] }
          else { $script:oracleWhy = 'site3 row ' + $ri + ' ' + ($f -join ' ') + ' k=' + $k; return $false }
        }
        # swing: a dead stored target, or one on side 0 (a monster's party-member victim), is re-picked
        if (-not $alive.Contains($stored) -or $stored[0] -eq 'p') {
          $set = @(& $reach $a)
          if ($set.Count -ge 2) { if ($k -ge $st.Count) { throw 'DQK oracle RNG stream exhausted' }; $stored = $set[[int]($st[$k] % $set.Count)]; $k++ }
          elseif ($set.Count -eq 1) { $stored = $set[0] }
          else { $script:oracleWhy = 'site4 row ' + $ri + ' ' + ($f -join ' ') + ' k=' + $k; return $false }
        }
        if ($stored -ne $t) { $script:oracleWhy = 'site5 row ' + $ri + ' ' + ($f -join ' ') + ' k=' + $k; return $false }
      } else {
        if (-not $alive.Contains($t)) { $script:oracleWhy = 'site6 row ' + $ri + ' ' + ($f -join ' ') + ' k=' + $k; return $false }
      }
      if ($k -ge $st.Count) { throw 'DQK oracle RNG stream exhausted' }
      if ((([int]($st[$k] % 20)) + 1) -ne [int]$f[4]) { $script:oracleWhy = 'site7 row ' + $ri + ' ' + ($f -join ' ') + ' k=' + $k; return $false }
      $k++
      if ($f[6] -eq '1') {
        if ($grp.ContainsKey($a)) {
          $damage = Get-DqkProfileDamage -Profile $profile -Stream $st -Cursor ([ref]$k)
          if ($damage -ne [int]$f[7]) { $script:oracleWhy = 'site8 row ' + $ri + ' ' + ($f -join ' ') + ' k=' + $k; return $false }
        } else { $k++ }   # party attacker: one draw, value not modelled (see header)
        if ([int]$f[8] -eq 0) { [void]$alive.Remove($t) }
      }
    }
    return $true
  }
  $hits = @(); for ($o = 0; $o -le 2 * $inits.Count + 8; $o++) { if (& $align $o) { $hits += $o } }
  if ($hits.Count -eq 0) {
    $script:oracleWhy = ''; $null = & $align $inits.Count
    throw "${Label}: no LCG stream offset reproduces the trace -- some roll, monster damage figure or hit flag is not what seed $Seed draws (offset $($inits.Count) fails at: $script:oracleWhy)"
  }
  if ($hits.Count -ne 1) { throw "${Label}: LCG alignment is not unique -- offsets [$($hits -join ',')] all reproduce the trace" }
  if ($hits[0] -ne $inits.Count) {
    throw "${Label}: LCG stream aligns at offset $($hits[0]) but the roster is $($inits.Count) -- combat did not draw exactly one initiative die per combatant"
  }

  # --- needed = thac0(attacker) - ac(target), one AC per party member ---
  $acs = @{}
  foreach ($event in $attackRows) {
    $f = $event.Fields
    if (-not $grp.ContainsKey($f[2])) { continue }
    $ac = $grp[$f[2]].Thac0 - [int]$f[5]
    if ($reactionRows.Contains($event.Row)) { $ac -= 2 }
    if ($acs.ContainsKey($f[3]) -and $acs[$f[3]] -ne $ac) {
      throw "${Label}: needed column does not factorise -- $($f[2])>$($f[3]) implies AC $ac, an earlier row implied $($acs[$f[3]])"
    }
    $acs[$f[3]] = $ac
  }

  # --- hp arithmetic, and slain fires exactly when hp reaches 0 ---
  $hp = @{}; $mx = @{}
  for ($i = 0; $i -lt $rows.Count; $i++) {
    $f = $rows[$i]
    if ($f[1] -ne 'attack') { continue }
    $t = $f[3]; $dmg = if ($f[7] -eq '-') { 0 } else { [int]$f[7] }; $after = [int]$f[8]
    if (-not $hp.ContainsKey($t)) { $mx[$t] = $after + $dmg; $hp[$t] = $after + $dmg }
    $pred = $hp[$t] - $dmg
    if ([Math]::Max(0, $pred) -ne $after) {
      throw "${Label}: trace row $($i + 1): $t should report hp $([Math]::Max(0, $pred)) ($($hp[$t]) - $dmg) but reports $after"
    }
    $hp[$t] = $pred
    $dropped = ($after -eq 0 -and $f[6] -eq '1')
    $slainNext = ($i + 1 -lt $rows.Count) -and ($rows[$i + 1][1] -eq 'slain')
    if ($dropped -and -not $slainNext) { throw "${Label}: trace row $($i + 1): $t reached 0 hp with no slain line" }
    if (-not $dropped -and $slainNext) { throw "${Label}: trace row $($i + 1): slain line follows a row that did not drop its target" }
  }
  foreach ($e in $mx.Keys) {
    if (-not $grp.ContainsKey($e)) { continue }
    if ($mx[$e] -ne $grp[$e].MaxHp) {
      throw "${Label}: $e's trace maxHp $($mx[$e]) disagrees with retail MONCHA $($grp[$e].Name) hp $($grp[$e].MaxHp)"
    }
  }

  # --- outcome follows from the final hp state ---
  $alive = @($partyIds | Where-Object { -not $hp.ContainsKey($_) -or $hp[$_] -gt 0 })
  $endRow = @($rows | Where-Object { $_[1] -eq 'end' })
  if ($endRow.Count -ne 1) { throw "${Label}: expected exactly one end row, found $($endRow.Count)" }
  $declared = $endRow[0][3]
  $wanted = if ($alive.Count -eq 0) { 'enemy' } else { 'party' }
  if ($declared -ne $wanted) {
    throw "${Label}: end row declares '$declared' but $($alive.Count) of $($partyIds.Count) party members still have hp > 0"
  }

  # --- xp: only enemies the PARTY dropped are awarded ---
  $xp = 0
  for ($i = 0; $i -lt $rows.Count; $i++) {
    if ($rows[$i][1] -ne 'slain') { continue }
    $victim = $rows[$i][3]
    if ($grp.ContainsKey($victim) -and -not $grp.ContainsKey($rows[$i][2])) { $xp += $grp[$victim].Xp }
  }

  return [pscustomobject]@{
    Party = $partyIds; MaxHp = $mx; FinalHp = $hp; Outcome = $declared; Xp = $xp
    PartyAc = $acs; Groups = $recs; Monsters = $mon; RngOffset = $hits[0]
    RearReactionCount = @($reactionRows | Where-Object { $rows[$_][2] -match '^e' }).Count; PartyReactionCount = @($reactionRows | Where-Object { $rows[$_][2] -match '^p' }).Count
  }
}

function Assert-DerivedGbcr {
  param([string]$Label, [byte[]]$Gbcr, $Facts)
  $recLen = 6; $hdrLen = 16
  $want = $hdrLen + $recLen * $Facts.Party.Count
  if ($Gbcr.Length -ne $want) { throw "${Label}: GBCR is $($Gbcr.Length) bytes, the trace's $($Facts.Party.Count) party members need $want" }
  if ([Text.Encoding]::ASCII.GetString($Gbcr, 0, 4) -ne 'GBCR') { throw "${Label}: GBCR magic missing" }
  if ([BitConverter]::ToUInt16($Gbcr, 4) -ne 1) { throw "${Label}: GBCR version expected 1, got $([BitConverter]::ToUInt16($Gbcr, 4))" }
  $wantOutcome = if ($Facts.Outcome -eq 'enemy') { 1 } else { 0 }
  if ([BitConverter]::ToUInt16($Gbcr, 6) -ne $wantOutcome) { throw "${Label}: GBCR outcome expected $wantOutcome for a '$($Facts.Outcome)' end row, got $([BitConverter]::ToUInt16($Gbcr, 6))" }
  if ([BitConverter]::ToUInt16($Gbcr, 8) -ne $Facts.Xp) { throw "${Label}: GBCR xp expected $($Facts.Xp) (retail MONCHA award for the enemies the party dropped), got $([BitConverter]::ToUInt16($Gbcr, 8))" }
  if ([BitConverter]::ToUInt16($Gbcr, 10) -ne $Facts.Party.Count) { throw "${Label}: GBCR count expected $($Facts.Party.Count), got $([BitConverter]::ToUInt16($Gbcr, 10))" }
  for ($i = 0; $i -lt $Facts.Party.Count; $i++) {
    $p = "p$i"; $o = $hdrLen + $recLen * $i
    if ($Gbcr[$o] -ne $i) { throw "${Label}: GBCR record $i ordinal expected $i, got $($Gbcr[$o])" }
    # Gen2 has no lethal rule (cccombat.asm resolve_hit: Gen2 lethal = false),
    # so a downed party member is condition 1 = unconscious, never 2 = dead.
    $wantCond = if ($Facts.FinalHp[$p] -le 0) { 1 } else { 0 }
    if ($Gbcr[$o + 1] -ne $wantCond) { throw "${Label}: GBCR record $i condition expected $wantCond, got $($Gbcr[$o + 1])" }
    if ([BitConverter]::ToInt16($Gbcr, $o + 2) -ne $Facts.FinalHp[$p]) { throw "${Label}: GBCR record $i hp expected $($Facts.FinalHp[$p]), got $([BitConverter]::ToInt16($Gbcr, $o + 2))" }
    if ([BitConverter]::ToInt16($Gbcr, $o + 4) -ne $Facts.MaxHp[$p]) { throw "${Label}: GBCR record $i maxHp expected $($Facts.MaxHp[$p]), got $([BitConverter]::ToInt16($Gbcr, $o + 4))" }
  }
}
