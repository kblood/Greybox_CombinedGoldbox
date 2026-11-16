# Triage of the 23 pre-existing node test failures — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Task: task 63 (triage the 23 pre-existing failures; fix or update each group, decided by the owner).
Source: serial run `node --test --test-concurrency=1 test/*.test.mjs` at commit 050c77bf: 591 tests, 565 pass, 23 fail.

Corrected 2026-11-10 (same day): the first version mapped several tests to the wrong file. This version maps
each test name to its file by grep, and adds the group D review.

No code, test or pin was changed for this note.

## Groups (corrected mapping)

| Group | Tests (file:line) | What fails | Likely cause (not all confirmed) | Decision needed |
| --- | --- | --- | --- | --- |
| A. DoK composition and transfer (5) | `dok-graphics-catalog.test.mjs`: 59, 91, 116, 141, 164 | "Missing expected exception" in the checked-shard, DoK slice and transfer tests | DoK proof pin `PROOF_SHA256` (task 32) is stale, and the DoK shard is skipped with a warning (tasks 16, 23). Not confirmed per test. | Approve re-pinning the DoK proof (task 32), then update the DoK expectations. DoK-only: does not block CoK. |
| B. Registry, gallery and fixture metadata (5) | `graphics-coverage.test.mjs`: 24; `graphics-review-queue.test.mjs`: 95, 115; `hosted-restyle-metadata.test.mjs`: 51, 76 | Fixture `asset-0001-abcdef123456` rejected by `src/ui/cok-generated-inventory.mjs:38` ("invalid source/output or review metadata"); equality checks fail | Test fixtures or expected values are stale against the current inventory validator. | Approve updating the fixtures and expected values (test-only). |
| C. Hosted pack, link and Windows guards (9) | `hosted-restyle-metadata.test.mjs`: 87; `hosted-restyle-pack.test.mjs`: 165, 259, 277, 283, 294, 304, 323; `release-source-plan.test.mjs`: 197 (directory junction; `rmSync` on a directory at line 207) | Regex checks on error text (`/collision/`, `/exactly one/`, `/Candidate changed during audit/`, `/Symlink\|reparse/`) do not match actual messages; the junction test fails on Windows | Error texts changed; Windows symlink and junction behaviour differs from POSIX. The junction case is probably a test bug. | Decide per assertion whether the message or the test is the contract. A Windows-only skip would be a decision. |
| D. Runtime pin and viewer source guards (3) | `hosted-restyle-runtime-contract.test.mjs`: 132; `public-artwork-local-only.test.mjs`: 40, 48 | See the group D review below | See below | See below |
| E. Build step order (1) | `bundle-cok-title-restyle.test.mjs`: 129 | Ordering assertion "title lane before the public artifact audit" fails | Build script step order changed. `build:app` passes, so the expectation is probably stale. Not confirmed. | Approve updating the ordering expectation after checking the build script. |

Total: 5 + 5 + 9 + 3 + 1 = 23.

## Group D review (2026-11-10)

Question: can production `restyle.ts` or the standalone animation gallery request a remote image, which the local-only test is meant to prevent?

Answer from the code: no.

- `apps/web/src/ui/restyle.ts`, `setRestyleImage` (line 598): `img.src` is set only when `localAssetImageUrl` returns a URL (a file from a user-picked local folder) or under `IS_DEV`. In production the fallback is never assigned. The test's exact string `if (IS_DEV) { img.src = fallbackUrl; return; }` was replaced by an equivalent gate, so the test fails on code shape, not behaviour.
- The unguarded same-origin paths `./restyle/proposal/…` (lines 171, 221, 225, 266, 312, 425, 509, 525) are reached only from the proposal page. `startProposal` (line 392) returns `0` at line 404 when `!IS_DEV`, so those paths are not reached in production. The built `dist-app/restyle` has no `proposal` directory, which is consistent with that.
- `apps/web/public/restyle/animations.html`: `image.src` is set only to an object URL built from bytes whose SHA-256 has been verified (line 92). `hosted()` loads only a same-origin pinned module (`../assets/hosted-restyle-core-<sha>.js`), and `HOSTED_RESTYLE` is `null` in the public file (line 45), so `hosted()` returns `null`. No remote origin is reachable from either path.
- The built bundle contains no `http(s)://` literals (grep of `dist-app/assets/index-*.js`).

Conclusion: group D is a stale-test problem for the image guards. There is no remote fallback in production. Two items still need the owner's decision:

- The runtime-contract pin (`apps/web/scripts/hosted-restyle-runtime-contract.mjs:11`) expects `cokPlayerCanonicalBindings.json` = `9f3cec…`. Every registry re-pin changes that file, so the pin goes stale on every re-pin. Decide the rule: update the expected hash with each re-pin, or pin only the input-hash line.
- The viewer and gallery source-text assertions should be rewritten to test behaviour (for example, that the production branch never assigns a non-local `src`), not the exact code shape. The owner should approve that rewrite.

## What is not in these groups

- The DoK startup is not a failing test: `graphics-public-startup.test.mjs` passes and the DoK shard degrades with a warning.
- Task 69 (restyle-animations timing flake under parallel load) did not occur in the serial run.

## Follow-ups

- Task 32 (DoK pin) decides group A.
- Task 36 (stray server copy) is unchanged.
- Add a behaviour test for group D (production never assigns a non-local image source) once the owner approves the rewrite.
