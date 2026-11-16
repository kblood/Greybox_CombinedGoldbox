# Creation continuation after Pick Gender (2026-10-15)

Source-only Astra note. No application, build or test execution. The repaired journal binary is reported by Luna as `bbc659cd21759aa4c42f95aff2d02cdc31d2de8454231bf697a9b219cf46d014`, with 184 passing tests / one ignored. That is infrastructure evidence, not completed creation. The next GUI must establish its own paused screenshot and consumed-key receipts; the older Pick Gender/MALE observation does not authorize blind continuation in a new process.

## Next discriminating action

At a freshly captured, paused **Pick Gender / MALE** frame, confirm the initial four scheduled keys were accepted and consumed. Submit one screenshot-bound mailbox command for **Select**, then resume one bounded slice and pause/capture. The original command is ASCII `S` (`0x53`); BIOS word `0x1F53` (8019) supplies that character explicitly. Use it only if the current frame exposes Select. Do not send a string of Enter keys across unseen stages. Enter worked in the earlier route, but this note does not infer a universal Enter-to-Select mapping for every later prompt.

Original `GAME.OVR` descriptor A4 body starts at file offset 131593. Read-only decoding establishes:

- A4:0AA5 calls shared selector FD:0034 (body FD:1368). Return zero takes menu/candidate cleanup and exits via 2578. Only return `53h` advances at 0AC9; other commands redisplay.
- A4:0ACF..0AD6 stores selected one-based index minus one to **candidate+109h**. A displayed highlight is not yet the committed gender. The candidate pointer is the actual root frame's SS:[BP-4]/[BP-2]; do not use the current resident keyboard wrapper BP as the creation frame or guess a heap address.
- A4:0AE5..0AF8 reads race at candidate+5Ah and the class count at **DS:3A50 + race*15**. A4:0B63..0B8D builds displayed class names from each table entry and DS:0F5A + classID*27.
- At the resulting **Pick Class** frame, record every visible option and highlight. A4:0C31 accepts only command `53h`; A4:0C4F..0C6A stores the selected table value to **candidate+5Bh**, not selection index minus one. Do not choose a class from a generic D&D list or assume HUMAN/default race.

FD:1651..1677 treats Escape (`1Bh`) as cancellation, clears the returned pointer and returns zero. In this gender caller, cancellation frees the candidate and exits creation; it is not proven to go back one page. Use BIOS `0x011B` only in a separate deliberate cancellation control. FD:15E9/15F7 handles extended scan values 48h/50h as navigation; standard BIOS Up/Down words are `0x4800`/`0x5000`. Each navigation still needs a new observed highlight before Select. Keep the currently approved mailbox's single-key and bounded-slice rules.

## Continue the original workflow, one observed prompt at a time

After the class commit, source literals include **Pick God** and **Pick Alignment**. Their availability/order depends on original class branches; do not preload inputs for either. Capture offered choices and use only the original selector/rule paths. Preserve snapshots/receipts for attribute generation, any deity/alignment choices, and visible appearance stages rather than claiming all paths from one successful route.

The later source gives concrete acceptance checkpoints:

| Original location | Requirement |
| --- | --- |
| A4:244D..245B, literal `Reroll stats? ` at 06B4 | Command `N` proceeds; another result returns to the original 1614 calculation path. Choose from the observed question; demonstrate reroll separately rather than assuming acceptance. |
| A4:2463..249B, literal `Character name: ` at 06C3 | Original input helper 0521:0739 supplies the name, copied with count 0Fh into the candidate. A zero length repeats the prompt. Do not implement a host text buffer or infer the full accepted character set from that count. Use a short unique ASCII name through actual keyboard receipts when this prompt is visible. |
| A4:249E/24A2 | Original appearance/helper calls A4:3C61 and 408B occur after name entry. Their admission does not establish successful visible interaction; observe actual screens before choosing keys. |
| A4:250D..2531, literals `Save ` and `? ` | `N` frees the candidate and restores prior DS:6096/6098 before returning. This path must not be reported as a saved character. |
| A4:255D → 9E:0BED | Actual character persistence is required for the saving path; retain DOS receipts and disk output. |
| A4:2562..257B | Candidate cleanup, restoration of prior pointer from BP-8/BP-6 to DS:6096/6098, stack restoration and RETF. The restored pointer is not proof of party insertion. Follow the real caller. |

## Save and party evidence still missing

The existing character-persistence plan pins the original ABI: creation supplies an empty Pascal filename string to 9E:0BED, selecting the `.who` naming/prompt branch; a nonempty supplied filename selects `.sav`. It writes a 199h-byte main character record and conditionally `.stf` / `.sfx` linked records, using the original count, naming and error paths. Do not require nonexistent empty sidecars or reinterpret these as a new serialization format. Durable DOS transport is now tested, but a valid completed WHO and cold original character reopening are still unproved.

The first concrete unaccepted dependency beyond the visible selection flow is this **original persistence invocation and its result**, then the **actual caller's party/character-disk workflow after root RETF**. All root call targets are admitted; source inspection does not identify a new missing instruction specifically after gender. Do not invent one or add guest bytes preemptively. If the run stops, retain exact status, current catalog/body generation, CS:IP and caller evidence before proposing one bounded missing helper/host-service repair. AH06 diagnostic output is not established as a normal next dependency.

For acceptance, require the saved character to appear through the original disk-character workflow, cold reopen without synthetic pointers, and actual addition to the party. Separate creation saving from party insertion. A later world save/load (9E:22DE / 1B34) is M2 and cannot be claimed from a WHO file. Complete M1 still needs two materially different legal race/class flows, rule rejection, cancellation at multiple stages, reroll/backtracking, cleanup/no stale candidate, party management and original comparison. One 30M discovery run may expose a boundary without meeting these requirements.

## Execution and evidence constraints

Use the approved 30M/4096 config only after the ignored runner watchdog/owned-close/publication repairs are reviewed. No new production sources or guest bytes are authorized by this note. Stop on a genuine fault, unsupported boundary, work/evidence/wall limit or rejected input; preserve primary fault status and secondary evidence-cap state. Hash endpoint RAM/catalog, streamed journal and final manifest; do not present an intermediate screenshot as a final state report.

Original-comparison preflight: **no DOSBox process and no GameLink shared memory means a free lease**, not a broken emulator. The existing debugger helper is being built separately; missing helper availability is distinct from runtime failure. The pinned original-black diagnostic remains a separate run using focusless GameLink and its exact candidate executable. Its unresolved black transition means no original creation comparison has yet passed.

## Controlled follow-up after unexpected host input

The actual journal GUI published correctly and reached Pick Class, but received
five unscheduled host arrow enqueues after the authorized S. Its queue does not
distinguish keyboard messages from directed WM_APP messages. The S control
receipt proves the game HWND was foreground then, not who activated it or sent
the arrows. Preserve the original run and strict rejection of extra input.

Astra approved a reversible external test fixture for the next bounded route:
validate the exact owned PID/class/title/HWND, call `EnableWindow(FALSE)`, then
assert `IsWindowEnabled()==FALSE`. Its return value reports previous disabled
state, not success. Keep that window disabled through capture and controls;
check its state before each mailbox key. No production rebuild is needed.
Microsoft documents that disabled windows reject user keyboard/mouse input
but still receive system/application messages: [Window Features](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features),
[EnableWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enablewindow).
The current source independently handles directed WM_APP pause/key/observe/close
and WM_PRINTCLIENT without an enabled-state check. Luna must verify those
operations on the existing binary in the actual next route, not assume them.

Disable on first Locate under the existing helper deadline; validate ownership
and record observed enabled/foreground states before and after. Already queued
or directly posted keyboard messages are not excluded by this fixture, so
every host enqueue must still match the initial schedule or exactly one current
mailbox allowance, in order, with status0. Reject every extra/reordered row;
do not inspect only the first or last row in a polling interval. Keep the same
30M/4096 work bounds,30s slice and900s global deadline. Preserve the actual
previous config bytes separately before generating an unapproved new config.
Normal completion closes only the owned process. A live-process handback may
restore the original enabled state only after revalidating the same HWND and
must record that input isolation ended. No global keyboard/focus operation or
production input-filter change is part of this fixture.

The user subsequently confirmed they manually tried the window with the arrow
keys. Preserve that clarification alongside the historical trace. Keep the
fixture for the automated route; normal manual play remains a separate useful
test. No production input-generation fault follows from those five events.

The isolated follow-up had exactly six matched enqueue/AH00 records: the four
initial keys and two S selections. Its step1 main area was still blank; Luna's
claim of a visible class menu there was withdrawn after Root inspected pixels.
The terminal frame actually shows Pick God/PALADINE, not the gender screen
Luna reported. Root must inspect every subsequent fresh image before either a
key or a settling interval. The helper failed before producing a Pause receipt;
its primary stderr was not saved, so the cause remains unknown. Later wrapper
repair must preserve each helper's stdout/stderr/argv/PID/exit before throwing,
and validate stable PID/class/HWND/title prefix while permitting work counters
in the dynamic title to change. No guest-code fault is inferred from this run.

Astra approved a screenshot-bound `kind=settle` command: no word/key injection,
unchanged host enqueue count, the same250K target with measured overshoot,
30s slice/global bounds, followed by pause/Observe/fresh capture. An incomplete
draw is not permission to select an unseen menu. The next finite work budget
is60M to accommodate settling and later creation stages; quantum4096,900s
global bound,10s helper/300s close-drain bounds and32MiB journal guard remain.
This authorizes no new guest instruction bytes or production changes.

The subsequent60M run reached Root-reviewed gender, class, deity, alignment,
stats and name prompts. It accepted ten inputs with ten matching AH00 callbacks:
four scheduled words, four S selections, N to retain stats, and K at the name
prompt. Final pixels show `CHARACTER NAME: K`; no saved character is claimed.
K consumed at work22,782,792; the endpoint waited at22,783,421. The wrapper
incorrectly required250K additional work despite real native InputWait, then
closed normally on its30s deadline. Journal publication validated; no helper
failed in this run. This is an evidenced controller wait bug.

Astra's minimal fix is early slice completion at InputWait, with a stale-status
guard: for a key require the exact accepted row plus a fresh **unpaused**
InputWait observation at work greater than enqueue work, and ring head==tail
equal to that row's resulting tail. The frontend logs enqueue/prior status
before advancing, so an old InputWait title is insufficient. Pause/Observe/
capture and record `completion_reason=input-wait`, actual delta and waiting
state. A zero-key settle already at InputWait may finish with zero work and no
enqueue. No filler key, retry or relaxed input accounting is permitted.
