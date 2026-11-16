# DQK copy-protection — diagnosis & journal-word solver (E6.2b-4)

When the rebuilt **CoK-on-DQK** build (lifted Amiga art + authored resume-area-16 save) reaches
"Begin Adventuring" under DOSBox, it lands on a manual-lookup gate, randomized per boot:

```
JOURNAL, PAGE (P)   WHAT IS WORD # N   AFTER THE HEADING   <HEADING>   ENTER _
```

This is the screen between the loaded roster and the overland map. This doc records what it is and
how the harness gets past it to capture the lifted-art map.

## It is DQK.EXE's own protection — not the ported CoK content

Two independent facts place the check in **`DQK.EXE`**, the rebuild's engine, not in the ported CoK
ECL:

1. **CoK's protection is bypassed structurally.** In CoK, the journal check is invoked by
   `PROGRAM StartGameMenu` (opcode `0x38 #0`) at the head of **ECL1 block 18** (raw byte 63,
   `38 00 00`, virtual `0x803D`), guarded one-shot by `word_208` — see `daxdump_extracted/ECL1_018.txt`
   and `docs/engine/research/cok-copy-protection.md`. But the E6.1 forward-stub enters the ported
   game at **block 16**, whose `ecl_initial_entry` (0x8014) never calls `PROGRAM #0`. So CoK's own
   protection event is not on our path.
2. **DQK.EXE carries the prompt strings.** `The Dark Queen of Krynn/DQK.EXE` (449 664 bytes) holds,
   at **file offset 0x6AC4A**: `" journal, page \0%s%s%s\0 (\0)\t\t\t\t \0 what is word # \0 after the heading \0Enter \0"`.
   DQK.EXE builds the prompt from these on its "Begin Adventuring" path. (Immediately before, at
   ~0x6AC00, is an obfuscated block — not a clean constant XOR; not needed for the chosen bypass.)

## The answer is a journal word — and GOG ships the key

The expected answer is **word #N of the journal paragraph that follows heading H**. GOG bundles a
clean answer key, `The Dark Queen of Krynn/Codes.pdf` — a `Page / Heading / Answer` table. Worked
examples (verified against `Journal.pdf`):

| Page | Heading           | Journal paragraph (start)                               | Answers (word #)            |
|------|-------------------|--------------------------------------------------------|-----------------------------|
| 11   | Running Away      | "A character **may**(3) **flee**(4) **from**(5) the battlefield…" | may/flee/from         |
| 10   | Saving Throws     | "Attacks **such**(2) as **poison**(4) or **spells**(6)…"          | such/poison/spells    |
| 4    | Character Classes | "**Classes**(1) are the characters' professions…"                 | classes/character/must|
| 11   | Combat Strategies | "To **succeed**(2) in combat a **skilled**(6) player **deploys**(8)…" | succeed/skilled/deploys |

The asked word numbers are **non-uniform per heading**, so counting word #N directly from the
journal paragraph is the deterministic solver; `Codes.pdf` is the validation set.

## Solver (engine `loaders/dqkProtection.ts`, pure & tested)

- `parseDqkProtectionPrompt(text)` — parses the vision-read prompt (lines joined by "; "; tolerant
  of OCR spacing, the `(P)` page form, and digit-bearing headings like **THAC0**) → `{page?, heading, wordNumber}`.
- `journalParagraphFor(journal, heading, answers?)` — finds the heading's body. A heading can appear
  twice (credits/contents **and** rules); disambiguation: the occurrence whose body contains a
  `Codes.pdf` answer word wins, else the **longest** body (rules prose beats a short credits line).
- `journalWords(p)` / `answerDqkProtection(journal, q, answers?)` — counts whitespace words (dropping
  the standalone `.` that pdftotext inserts) and returns word #N.
- `normalizeHeading` maps the digit `0`→`O` (journal renders "THAC0" as "THACO").
- `parseDqkCodesVocabulary(codes)` — the flat set of all answer words. **Validation:** a computed
  word not in this vocabulary is a mis-count from a fragmented journal section (e.g. THAC0, whose
  printed layout doesn't linearize cleanly) — the solver reports *low-confidence* instead of typing
  a wrong answer (a wrong answer triggers DQK's fake **"DISK READ ERROR"** punishment, unrecoverable
  within that boot).

Driver: `tools/dqk-protection-solve.mts` (journal+codes text → answer word, exit 2 unsolved / 3
low-confidence). Harness `tools/dosbot/capture-ingame.ps1` vision-reads the prompt, solves, and
types the word via the new full-A–Z scancode `Send-DosText`; on low-confidence it **declines and
re-boots** (the per-boot randomizer mostly picks clean single-paragraph headings, so retry
converges). The journal/codes PDFs are the player's own copyrighted files, extracted locally at
capture time with `pdftotext` — never bundled or committed.

## Alternative (not taken): patch DQK.EXE

A DQK.EXE byte-patch to force the check to pass (folded into `planDqkBuild`'s existing EXE-patch
step, the same one that retitles the title screen) would be a permanent, vision-free bypass. An
interrupted disasm pass reported a verified patch existed but did not record the offset; the
journal-word solver was chosen instead because it (a) needs no EXE disasm, (b) passes the *real*
check, and (c) is a clean, unit-tested engine capability. The EXE-patch remains a viable future
slice if a vision-free path is wanted.

---

## UPDATE 2026-07-02 — empirical DOSBox verification: the shipped EXE-patch does NOT work, and the protection is LIVE

This session boot-tested the bypass end-to-end under DOSBox (`build/cok-on-dqk-e62b4v` = lifted
Amiga art + resume-area-16 save + `--bypass-protection`) and established three facts that **correct
the record above and in memory**:

1. **The protection is genuinely LIVE — GOG did *not* remove it, and empty Enter does NOT pass.**
   Two diagnostic runs on `build/cok-on-dqk-e62b4v`:
   - `capture-ingame.ps1 -ForceWord "WRONG"` → prompt ("JOURNAL PAGE 10, WORD #9 AFTER HEADING RANGED
     COMBAT"), wrong word typed → fake **DISK READ ERROR** punishment.
   - `capture-ingame.ps1 -EmptyEnter` (press ENTER, no text) → prompt ("PAGE 11, WORD #8, HEADING
     COMBAT STRATEGIES") → **DISK READ ERROR** as well.
   So the answer is really verified and an empty answer is rejected. This retires **both** stale
   assumptions: the 2026-06-25 memory `goldbox-protection-bypass` ("GOG releases ship with the
   manual-lookup protection removed") **and** the `goldbox-content-port` #18 note ("empty Enter
   PASSES … GOG's DQK.EXE is already DRM-stripped") — neither reproduces on this build/path. The
   `DQK.EXE` journal check on the Begin-Adventuring-after-load path is live and requires the correct
   word.

2. **The current `--bypass-protection` patch (single byte-quad at file 0x212E3) does NOT stop the
   prompt.** With the patch confirmed present in the emitted EXE (`0x212E3 = B8 01 00 CB`,
   `MOV AX,1; RETF`), a normal capture run still hit the journal prompt on "Begin Adventuring". The
   patch is therefore **insufficient / misidentified**, not a solved bypass.

3. **Why it doesn't work — `1D99:1553` is not the journal-check.** `--thunk 0x212E3` resolves the
   `1D99:1553` dispatch stub to overlay 4 @ file **0x039150**, whose body is
   `xor ax,ax; push ax; mov ax,0xFC00; push ax; lcall D7:2873; cmp ax,0x21; …` — i.e. it reads one
   byte at far pointer **0xFC00:0000** via a resident peek-helper (file 0x59E3) and compares to
   `0x21`. That is some *other* gate (EGA/disk/hardware flag), not the journal-word prompt. The
   real prompt strings live in **overlay 12** (descriptor idx 12, file 0x62C30–0x6DC80; strings at
   0x6AC49+), and are addressed by that overlay's code through **relocated far pointers** (overlay 12
   has 3574 relocation entries), so they don't appear as code immediates. There is **no `1D99` stub
   for overlay 12** (`--stubs 12` → none), so the prompt routine has no flat MZ-image call-site to
   patch. Its entry is **UNLOCATED** by static flat-offset analysis.

### Where that leaves E6.2b-4 (rigorous documented negative + named next step)

The honest end-to-end lifted-art **map** capture is blocked on exactly one thing: locating the
overlay-12 journal-verify routine so its "answer correct?" branch (or the punishment branch) can be
patched to always-pass — a **vision-free bypass that does not type the word** (the user's stated
preference). Two named ways to unblock, in order of preference:

- **(a) Resolve overlay 12 statically via its relocation table.** Parse overlay 12's FBOV reloc
  entries, find the entries whose target is a prompt-string offset (0x6AC49 / 0x6AC6A / 0x6AC84);
  the code word each patches is *inside* the prompt routine. Disassemble around it to find the
  routine entry + the pass/fail branch, then add a `DQK_PROTECTION_PATCH_SPECS` entry patching that
  branch. (`disasm_dqk.py` already parses the descriptor table + reloc counts; it needs a
  `--reloc-xref <string>` mode to dump the entries.)
- **(b) DOSBox-X dynamic trace.** Breakpoint on the prompt draw (or the input-compare), read the
  live `CS:IP`, map back to the overlay's file offset. This is the same dynamic-trace capability the
  decompile-worklist flags as not currently feasible headlessly — it needs an interactive debugger
  session.

Until one of those lands, the build correctly **reaches** the Begin-Adventuring path with the roster
loaded (proven repeatedly), but the clean lifted-art map frame is one patch away. No screenshot is
faked; typing the looked-up word is deliberately not used (user preference: bypass, don't type).

The `0x212E3` patch is retained in `DQK_PROTECTION_PATCH_SPECS` (it is a valid neutralization of
*that* 0xFC00-flag gate and does no harm), but its comment and the build-log line are corrected to
stop claiming it defeats the journal-word check.

### Ruled out: a bad/altered local copy of DQK.EXE

The user asked whether the repo's `DQK.EXE` might have been altered at some point (independent of
our own build tooling, which only patches an in-memory copy for the emitted build — the source file
itself is never written). Checked two ways, both negative:

1. **Git history:** `git log --all -- "The Dark Queen of Krynn/DQK.EXE"` shows exactly **one** commit
   (`8aa1c48`, the initial commit) — the file has never been modified in this repo since it was
   checked in.
2. **Live GOG Galaxy repair (2026-07-02):** the user ran a GOG Galaxy "repair" on the installed copy
   at `C:\Program Files (x86)\GOG Galaxy\Games\The Dark Queen of Krynn\DQK.EXE`. Compared byte-for-
   byte against the repo copy afterward: **identical SHA256**
   (`6B0A9AC5C873997087F1F3F626334A71092FE7C8D1E92CE7F72869A59931F837`), and both files' `LastWriteTime`
   is **`2025-09-19 06:59:17`** — unchanged by the repair (only `LastAccessTime` moved, i.e. GOG's
   integrity check *read* the file and found nothing to replace).

**Conclusion:** the DQK.EXE tested in this doc is the genuine, currently-shipping GOG file, verified
against GOG's own repair/hashdb mechanism. The live journal-word check is not a local-copy artifact —
it is what GOG ships today for The Dark Queen of Krynn. (This is a different game/binary than CoK's
`GAME.OVR` protection, which — per the top of this doc — genuinely *is* bypassed by loading a
save with party data; the two games' protection implementations are unrelated and shouldn't be
conflated.)

### Overlay 12 static analysis — a stronger, more precise negative

Followed the "named next step" above (locate overlay-12's actual code so the pass/fail branch can be
patched) and got two more hard facts that upgrade the diagnosis:

1. **Overlay 12 has ZERO C-function prologues.** Scanned the entire blob (file `0x62C30`–`0x6DC80`,
   45,136 bytes) for the Borland small-model prologue (`55 89 E5` / `55 8B EC`, i.e. `PUSH BP; MOV
   BP,SP`) — **0 matches**. Every other overlay's `code_start` in `disasm_dqk.py`'s
   `OVERLAY_PREFIX_BYTES` table was pinned exactly this way (per its own comment: "measured by
   scanning for the first function prologue"); overlay 12 is the one entry the table admits is only
   **approximated** (`(3574//2)*4`, "first prologue not located") — now explained: there may be no
   prologue to find. Overlay 12 is very likely **data-only** — the prompt/heading/answer strings and
   lookup tables, not compiled verify logic.
2. **No static far-call anywhere targets its runtime segment.** Scanned the MZ image + all overlays
   up to overlay 12 for a literal `CALL FAR imm16:0x322E` (overlay 12's `runtime_seg`) — **0 hits**.
   So nothing reaches it via a fixed, on-disk far pointer either.

**Revised diagnosis:** overlay 12 is reached only through an **indirect far call/jump whose segment
operand is patched at overlay-LOAD time** by the FBOV loader, using the ~1787-entry fixup table at the
front of the blob (the mechanism `OVERLAY_PREFIX_BYTES` is trying to size). The actual verify
*routine* — the code with the compare + branch — therefore lives elsewhere (the resident image, or
another overlay with real C prologues) and reaches overlay 12's *data* via a pointer that reads as a
placeholder/zero on disk until the loader resolves it at runtime. **This is not resolvable by static
byte search** the way the earlier "reloc-xref" plan assumed; it needs either (a) emulating the FBOV
loader's fixup-application step offline (parse the ~1787 fixup entries, figure out their target-write
semantics, and follow where they point — a real but bounded reverse-engineering task, not yet attempted),
or (b) a **DOSBox-X runtime breakpoint** on the prompt draw / string compare, reading live `CS:IP`,
exactly the class of dynamic trace this project's `decompile-worklist.md` already documents as not
feasible headlessly for the RNG-seed and ECL-opcode-table unknowns. E6.2b-4 stays an honest, precisely
bounded open item — not a quick patch.

### Unicorn loaded-save route correction

`build\dqk-load1000-journal-gate.log` proves that the current Unicorn route reaches the live
Begin-Adventuring path after loading `SAVE\SavGamA.qsv`, and then executes the journal prompt draw
entry:

```text
party-menu-begin-adventuring-case-file-047eb2 canonical=25a4:3702 ... instr=13437101
journal-prompt-draw-entry-file-038edb canonical=26f8:008b ... instr=13897005
```

The same run deliberately did not type a journal answer. It also used the wrong queued-key release
gate (`1f4e:0be1`); that watch did not fire before `26f8:008b`, so the final queued key was never
released. The follow-up trace fixed that by dumping the live prompt state from the `26f8:*` context and
using the trace-only `journal-answer` token.

`tools/unicorn_dqk_trace.py` now has that live prompt dump and a trace-only `journal-answer` fake-key
token. The prompt table is `DGROUP:6dd2`, with 20-byte rows: heading pointer, page number, three word
number variants, and three expected-answer pointers. Raw table strings are not reliable directly; the
routine copies the selected expected answer to `DS:c6f9`, the typed answer to `DS:c723`, and the decoded
heading to `SS:BP-0x2a`.

The current deterministic loaded-save route selects heading `"RUNNING AWAY"`, word `5`, expected answer
`"FROM"`. `build\dqk-load1000-journal-autoanswer.log` shows `journal-answer` expanding from the live
`DS:c6f9` buffer and the compare seeing `typed:422e:c723 'FROM'` against `staged:422e:c6f9 'FROM'`.
This is a runtime exploration aid, not a production EXE patch or final bypass policy.

Later route-driving also uses the solved journal answer plus intermediate Return prompts and
`gate-b7f9` to select `PALACE` from the Palanthas menu. That route does not reach top-level ECL
`COMBAT`: the old `0x8439` reading was a `PRINTCLEAR` inline string length after DQK Gen2's
zero-operand `0x1d` framing correction; see
`docs/engine/research/dqk-palanthas-palace-combat-route.md`. The route still does not prove a
copy-protection bypass policy for production builds.
