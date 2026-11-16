# Treasures persistence promotion audit (2026-07-31)

> **Resolved later on 2026-07-31.** This memo is the historical failed-promotion record, not the
> current support verdict. Seed `0x1077` exposed a generic greedy-movement local minimum around a
> finite wall; the footprint-aware full-board path fix, sealed-wall negative control, two ordinary
> browser victories, retail `[0x022D]`/`[0x0232]` writes, legal consumed revisit, and exact
> save/restart/load proof now promote Treasures to `Persistent`. See
> `treasures-natural-route.md` §6-7 and BUILD-QUEUE item 9.

## Verdict

Treasures of the Savage Frontier remains at the `Route` / `exploration` evidence level. The retail
ECL contract is persistent, but the current browser route does not yet complete the second battle
and therefore cannot claim the resulting save/restart/load behavior.

## Proven boundary

- `ECL1.DAX#34` and `GEO1.DAX#34` drive the legal nine-step route to descriptor `0xFF` at `(7,7)`.
- The browser resolves wave one through the ordinary tactical API, then requires the authentic
  second overlay: YETI CHIEF x2 followed by four visible ICE HOUNDs after the six-enemy UI cap.
- The real-byte engine golden proves the untruncated wave-two request (YETI CHIEF x2, ICE HOUND x12,
  YETI x1), both victory continuations, `[0x0054]=0`, `[0x022D]=1`, `[0x0232]=1`, and silent revisit.
- Save-v2's persistent-route matrix now includes area `(7,7,south)`, address `0x022D`, mask `1`.

These are separate claims. The VM result does not substitute for a browser tactical victory, and a
save-model row does not prove that the live host reached the write.

## Failed promotion experiment

With the standard six-member level-20 melee acceptance party, wave one wins and wave two mounts. In
the captured deterministic wave-two run, auto combat reached the round cap after killing four
visible enemies, leaving two 12-HP Large Ice Hounds. The tactical seam reported a 50x25 map with no
blocked cells, so the evidence does not establish the earlier "wall lane" explanation or isolate
another cause. A second experiment equipped all six party members with legal Short Bows and arrows,
but that fixture also failed to complete the required route. During that investigation, a focused
unit case showed that an unacted ranged actor inside nominal range with a terrain-blocked line of
sight selected guard. The tactical AI now selects a reachable position that restores a legal missile
shot; the focused regression applies the move and proves the next AI action fires. It does not prove
that an end-to-end battle avoids the round cap. No combat outcome was forced and no
persistence declaration was added.

## Truth-contract corrections

The old support/corpus prose said the room deliberately re-fired because the script had no consumed
write. That was wrong: it had mistaken the asynchronously mounted second wave for a revisit. Public
support now says the browser proves the handoff while the engine proves the consumed outcome, and
it lists browser completion plus save/restart/load as missing. A corpus regression prevents the
false repeatability claim or premature `Persistent` promotion from returning.

## Next acceptance gate

Promote only when a normal browser battle completes wave two, produces `0x022D=1` and `0x0232=1`,
saves, restarts, reloads exact pose/party/clock/state, and revisits `(7,7)` without another combat.
Do not use a forced-victory or direct-memory-write test seam.
