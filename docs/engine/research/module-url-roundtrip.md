# `?module=1` reload/reproduce (R1, round 30, Phase A)

## The defect

`main.ts`'s `onLibrarySelect` writes `?module=1` into the address bar with `history.replaceState`
when a `kind: 'module'` Library entry is opened, but `params.get('module')` appears nowhere in
`boot()`'s dispatcher. Reloading or sharing that URL lands on the empty catalog. The twenty-ninth
handoff proposed "make `boot()` read the flag back," but that alone cannot work: the Library
(`library.ts:126`, `const LIBRARY: LibraryEntry[] = []`) is in-memory only, and
`startModuleExplore` (`moduleExplore.ts:656`) needs a whole `ModulePackage` object. A bare read arm
would have nothing to reload.

## The design

Persist the last imported module's **exact UTF-8 text**, not the deserialized `ModulePackage`
object, and on `?module=1` re-run the **real** import path (`importModuleText` →
`importModuleBytes` → `deserializeModulePackage` + `validateModulePackage`) over the stored text.
Two reasons this is a text store, not an object store:

- **Trust boundary.** Persisted bytes are untrusted input on the way back in — the same standard
  applied to any other stored artifact in this codebase. Re-running the real parse+validate path
  means a corrupted or hand-edited record can never silently become a Library entry; it is rejected
  exactly the way a bad file-drop is.
- **One import path, one place validation lives.** `importModuleBytes` is already the sole place
  that turns raw bytes into a validated `ModuleLibraryEntry` and pushes it onto `LIBRARY`. Storing
  text lets restore reuse that function verbatim instead of duplicating its validation logic for a
  second, object-shaped code path.

**Why IndexedDB, not `localStorage`.** `automapPanel.ts` and `journal.ts` already use
`localStorage` for this kind of per-viewer convenience, but a module package can carry embedded art
(`buildTestModuleWithArtGbmod`), which can push the serialized text well past a realistic
`localStorage` quota (~5 MB, shared with every other key on the origin). IndexedDB has no such
practical ceiling for this use case. One object store (`greybox.modules` → `modules`, key `'last'`)
holds a single record: `{ fileName, packageText, sha256?, importedAt }`.

## What was built (Phase A — `apps/web/src/ui/*`, not `main.ts`/`docs.ts`/`e2e.mjs`)

- **`apps/web/src/ui/modulePersist.ts`** (new). `saveLastModule`, `loadLastModule`,
  `clearLastModule` over one IndexedDB store. Every function is wrapped so a throwing or absent
  `indexedDB` resolves to `null`/no-op — the artifact/thumbnail sandboxes and private windows this
  project's storage rules already warn about.
- **`apps/web/src/ui/library.ts`**:
  - Import: `serializeModulePackage`, `saveLastModule`, `loadLastModule`.
  - **Two** call sites persist on import, not one — the brief's "single choke point" guess did not
    hold. `importModuleBytes` (the plain `.gbmod` path, used by `importModuleText` and thus by the
    real Import button, `window.__greybox.importModuleText`, and `restoreLastModuleEntry` itself)
    calls `saveLastModule` with the exact text it was handed. `importFruaFolder` (the FRUA `.DSN`
    conversion path, which has no original "text" — it converts straight from binary UA files) has
    a **separate** `LIBRARY.push(...pendingEntries)` and calls `saveLastModule` with
    `serializeModulePackage()` of the **last** pushed checkpoint entry (when a Heirs-style gate adds
    more than one Library row, "last imported" means most-recently-added).
  - Both calls are **fire-and-forget** (`void saveLastModule(...)`, not `await`) — see "What went
    wrong first" below for why.
  - New exported `restoreLastModuleEntry(): Promise<LibraryEntry | null>` — loads the stored
    record, re-runs it through `importModuleText` (the same path a user's file input takes), and
    returns the newly pushed/rendered entry, or `null` when nothing is stored or the stored text no
    longer imports cleanly.
  - Exposed on the existing e2e seam (`setupLibrary()`'s `window.__greybox`) as
    `restoreLastModule`, so Phase B (`main.ts`) and this Phase A proof can both drive it without
    touching `main.ts`.
- **`moduleExplore.ts`**: untouched, as the brief predicted — restoring only needs a
  `LibraryEntry`; opening it into a session is already `startModuleExplore(entry.pkg, ...)`, called
  from `main.ts` in Phase B exactly the way `onLibrarySelect` already calls it for a live click.

## What went wrong first, and the mutation that caught it

The first version `await`ed `saveLastModule(...)` inside `importModuleBytes`, immediately before
`return`. That is wrong: it gates `importModuleFile`'s caller-visible result (and the `setNote()`
UI text derived from it) behind a real IndexedDB round-trip, while the `.lib-entry` DOM row itself
is written synchronously by `renderLibrary()` **before** that await. `greyfen-reference-campaign`
(`apps/web/test/e2e.mjs`) polls for the `.lib-entry` row's `data-module-sha256` and then
immediately reads `#library-note`'s text — a race that the added latency turned red:

```
GB_E2E_ONLY='greyfen-reference-campaign' pnpm --filter @goldbox/web e2e
  [FAIL] ... errors: metadata=false victory=true persistence=... decline=true defeat=true flee=true quickTurns=15
```

Reproduced deterministically (2 runs) with `await`, absent on baseline (`806aaac`, 2 runs, no R1
changes), and absent again after switching both call sites to `void saveLastModule(...)` (3 runs).
This is exactly the "probe that can fail" standard the round's ground rules ask for, discovered by
running the acceptance suite rather than assumed — see the report for the fuller before/after log.

## Phase A proof

A throwaway Puppeteer script (kept in the session scratchpad only, briefly copied into `apps/web/`
to resolve `puppeteer-core` under Node's ESM resolver, then deleted — never committed) drove:

1. `page.goto` the bare root.
2. Import `packages/engine/test/fixtures/the-greyfen-beacon.gbmod` (1,503 bytes) through the real
   `#import-module-btn` file-chooser path (the same helper shape as `e2e.mjs`'s
   `importExactArtifact`).
3. Read `window.__greybox.getLibrary()` — confirms `moduleId: 'the-greyfen-beacon'`,
   `title: 'The Greyfen Beacon'`, `packageSha256` matching the fixture's own SHA-256.
4. `page.goto` the bare root again (a real navigation, not `location.reload()` semantics but
   equivalent for this purpose — it drops the JS heap and re-runs `boot()`), confirming
   `getLibrary().length === 0` immediately after (the in-memory Library really is gone).
5. Call `window.__greybox.restoreLastModule()` and re-read `getLibrary()`.

Result: `getLibrary()` after restore reports the same `moduleId`/`title`/`packageSha256` as before
the reload, with zero console/page errors. Stored record: `packageText` is exactly the fixture's
1,503 UTF-8 bytes (stored verbatim, never re-serialized, for the plain `.gbmod` path); the full
record (`fileName` + `packageText` + `sha256` + `importedAt`), JSON-stringified as a size proxy for
the IndexedDB structured-clone entry, is **1,911 bytes** — close to the brief's "≈1.5 KB" estimate,
with the gap being the 64-hex-char `sha256`, the file name, and JSON quoting/escaping overhead the
estimate didn't itemize.

## Mutations watched red, then reverted

- **(i) `loadLastModule()` forced to return `null`.** The proof's post-reload
  `restoreLastModule()` call returned `null` (`{}` once `JSON.stringify` drops the `undefined`s),
  and `getLibrary()` after restore stayed empty. Observed FAIL, reverted.
- **(ii) Stored `packageText` corrupted (`value.packageText + 'x'`).** `restoreLastModuleEntry()`
  re-ran the corrupted text through the real import path, which rejected it; the function returned
  `null` and `LIBRARY` was left with zero module entries — proving the stored bytes are
  re-validated, never trusted. Observed FAIL, reverted.

Both mutations were applied to the actual shipped source (`modulePersist.ts`), run through the
proof script, observed to fail, then reverted to the clean version verified by `git diff`.

## Left for Phase B (not built here — `main.ts`/`docs.ts`/`e2e.mjs` are out of scope for this item)

- `main.ts`'s `boot()` needs a `params.get('module')` arm that calls
  `window`-free `restoreLastModuleEntry()` (imported, not through the e2e seam) and, on a non-null
  result, calls `startModuleExplore(entry.pkg, entry.entryPointId ?? 0, {...})` the same way
  `onLibrarySelect` already does.
- `docs.ts` needs a `?module=1` entry, moving it out of `KNOWN_UNDOCUMENTED`.
- `e2e.mjs` needs a `module-url-reload` case exercising the real reload path end-to-end (not just
  the seam), registered in the three required places (`runners` Map, the awaited list, and
  `dataIndependent` if it needs no game data — it doesn't).
- Mutation (iii) from the brief (removing the `params.get('module')` arm should turn that new case
  red) is a Phase B mutation and was not run here, since the arm does not exist yet.
