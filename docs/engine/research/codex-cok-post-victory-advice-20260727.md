# Memo: CoK caravan continuation

## Bottom line

**Inference:** The safest next experiment is a fresh, same-process, one-key-at-a-time trace from the already verified `CONTINUE BATTLE: YES / NO` boundary, stopping at the survivor question. Do not automate treasure dismissal with the current worker yet: its default pixel band cannot classify bordered post-combat screens deterministically.

A minimal prerequisite is to pass a screen-specific `y=384..399` band through the worker and add explicit treasure/yes-no profiles. Historical post-combat captures are suitable fixtures, but not proof of a continuous verified route.

## Verified facts

- The current route gates combat entry on a recognized `movement`, `primary`, or `primary_short` row and drives each actor through visibly selected `DONE → AUTO`; it handles active movement and `GUARDING` as bounded wait states. Exact logic: [`tools/cok_gamelink_saved_outpost_route.ps1`](../../../tools/cok_gamelink_saved_outpost_route.ps1#L267).

- AUTO selection is positional and fail-closed:

  - Full primary `DONE`: `x=370..432`; short primary: `290..352`.
  - Full Done-row `AUTO`: `272..336`; short row: `178..240`.
  - Every cursor move is reclassified before Enter.

- The current worktree’s newest run reached `CONTINUE BATTLE`, with `NO` uniquely white at index 4:  
  `build/cok-exit-route-guard-r3-20260727/verified-caravan-stateful-member-06-auto-observe-10-030s.png`.  
  At inspection time its manifest-owned DOSBox-X PID 59152 was still alive:  
  `build/cok-exit-route-guard-r3-20260727/probe-process.json`. No input was sent during this review.

- The deterministic continuation gate is exact geometry  
  `[(2,128),(146,240),(246,250),(258,304),(320,352)]`, decoded `CONTINUE / BATTLE / : / YES`, with selected index `[4]`: [`tools/analyze_goldbox_menu_pixels.py`](../../../tools/analyze_goldbox_menu_pixels.py#L149).

- A prior durable journal proves that pressing Enter only after that gate produces the victory page:  
  `build/cok-exit-route-continue-r1-worker-20260727/journal.jsonl`.  
  Its post-frame SHA-256 is `48d09b65…f558a` and visibly states: party victory, 108 XP per character, and an Enter continuation.

- [`tools/cok_caravan_trace.py`](../../../tools/cok_caravan_trace.py#L120) atomically records screenshots, RAM hashes, frame metadata, and an fsync’d journal before an optional single key. A mismatch records `stopped` and sends no key.

- The newer narration gate uses local Ollama substring recognition: [`tools/cok_caravan_trace.py`](../../../tools/cok_caravan_trace.py#L92). **No retained `run.json` or journal exercises `--expect-vision-text`; it remains unverified in a live trace.**

- The historical complete branch under `build/cok-caravan-auto-setup-r2-20260727/` contains useful treasure, aftermath, and survivor fixtures. It is **not** continuous-route proof: the later correction invalidates historical Escape/fixed-count routing, and the separate resilience memo explicitly limits these captures to classifier fixtures.

## Material failure modes

- [`docs/engine/research/cok-improvement-loop.md`](cok-improvement-loop.md#L14) contains stale claims that `E` is ineffective and Escape opens destinations. Its later correction at line 722 reverses this; current code correctly waits for the camp row and uses visible `EXIT`/`E`.

- Startup still depends on a 40-second delay and fixed party-menu inputs. Several intermediate destination/Outpost/map screenshots are captures, not semantic gates. Only the camp and tactical endpoints are strongly classified.

- Post-input captures are not validated: after a permitted key, the worker records whatever screen appears and still completes. The next invocation must therefore classify that result before another input.

- The analyzer defaults to `y=370..399`. Bordered treasure and narration screens collapse into one `x=0..640` run, so the current worker cannot apply label or selection gates there.

- With `y=384..399`, the historical treasure fixture becomes classifiable:

  - Commands at `0..64`, `82..144`, `162..224`, `242..320`, `338..400`.
  - `VIEW` is selected at index 0; remaining labels decode as `TAKE / POOL / SHARE / EXIT`.
  - Treasure-left confirmation has selected `YES` at `0..48` and `NO` at `66..96`.

- Combat is asynchronous. Retained failures show `movement_active`, `movement`, or `GUARDING` persisting after expected handoffs. The current worktree includes an uncommitted 20-second passive wait adjustment in `tools/cok_gamelink_saved_outpost_route.ps1`.

## Safest next experiment — inference

1. Start from a fresh isolated `-KeepOpen -TraceArea1` run, or validate ownership of the existing manifest session before attachment. Never launch while another GameLink DOSBox-X exists.

2. At `CONTINUE BATTLE`, require the exact profile, labels, and selected index 4; press Enter once. Preserve screenshot, full/bounded RAM, and journal.

3. At victory, take two input-free samples. Require stable frame/ROI hashes plus exact narration:
   `THE PARTY HAS WON`, `EACH CHARACTER RECEIVES 108 EXPERIENCE POINTS`, and `CONTINUE`. Exercise the vision gate first without input; press Enter only in a separate invocation after review.

4. Before live treasure input, expose `--top 384 --bottom 400` through the worker and add fixture-tested `treasure` and `treasure_left` profiles. Then move Right one item per verified frame until `EXIT` is uniquely white; Enter once.

5. At “treasure left,” verify selected `YES`, move once to uniquely selected `NO`, then Enter.

6. Capture and gate the narration beginning `THE CARAVAN LIES IN WASTE BEFORE YOU`; acknowledge only its verified continuation. Capture the following surviving-draconian narration and stop at the survivor `YES / NO` question—do not choose a campaign branch in this experiment.

This is the smallest experiment that verifies victory continuation, treasure handling, and post-combat narration without carrying an input across an unknown screen.

No files were modified, and no GameLink keypress was issued.

## Follow-up result

The parent agent subsequently verified the recommended native boundary in the
same retained DOSBox-X session. The passive movement-completion wait was
committed as `58b7fe1`; one-key, vision-gated workers then recorded the
complete `CONTINUE BATTLE: NO` → XP → treasure EXIT/decline → aftermath →
survivor-help → destination-menu chain. See the correction and precise worker
journals in `docs/engine/research/cok-improvement-loop.md`.
