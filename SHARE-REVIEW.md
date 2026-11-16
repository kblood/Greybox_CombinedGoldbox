# Share draft review status

This is a fresh-history share snapshot copied from `2eede9b8df6906448af25c120dcb4a1154376737`. At the user's direction, it was published as the public repository [kblood/Greybox_CombinedGoldbox](https://github.com/kblood/Greybox_CombinedGoldbox) on 2026-11-16. Publication records the user's sharing decision; it is not a legal determination or a complete clearance review.

## Copy scope

- Source: tracked files at the source repository's current `HEAD`; untracked and ignored files were not copied.
- Initial copy: 2,880 project files, plus this review note, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. Excluded: 1,530 tracked paths. The DQK/FRUA capacity comparison was added later as a documentation-only follow-up.
- Excluded complete retail game directories: CoK, DoK, and DQK (1,321 tracked files).
- Excluded `rust/cok-recomp/` (204 files) because it contains original-derived lifted code; also excluded `.claude/` tool-specific instructions, common binary/game/media extensions, and `apps/web/public/restyle/`.
- Included these six research notes under the user's working assumption that they are safe enough to share: `decompilation-sources.md`, `cok-demo-decompile.md`, `decompile-dqk-ecl-dispatch.md`, `disasm-combat-cok.md`, `disasm-combat-dqk.md`, and `disasm-spells-krynn.md`. They contain a verbatim CoAB C# excerpt, game-derived byte sequences, or instruction-level disassembly. This records the user's risk decision; it is not a legal determination.
- Source history was not copied; the draft keeps its separate fresh initial commit.
- Follow-up added after publication: `docs/engine/research/krynn-frua-map-capacity-port-comparison-2026-11-16.md`, a technical comparison containing no game binaries, assets, or verbatim game text. The existing FRUA/Dungeon Craft note now links to it.

## License

- The root `LICENSE` applies 0BSD only to original project software authored by contributors who have the right to license their contributions.
- `THIRD_PARTY_NOTICES.md` explains that third-party works, quoted/decompiled material, and game-derived content are outside the root license and retain their own terms. This is a scope clarification, not a complete third-party inventory or legal clearance.

## Remaining review limitations

1. Review the remaining 279 files with machine-specific absolute paths in code, configuration, tests, and fenced command examples. Narrative Markdown prose was normalized in 102 files; avoid global replacement elsewhere because asset roots and provenance references need case-by-case handling.
2. Review reverse-engineering documents and source for embedded copyrighted code, data tables, long verbatim text, or derived assets. Further notes may require similar treatment. This copy filter is not a legal clearance.
3. Review remaining third-party code and dependency license obligations. The audit found study-only COAB/Dungeon Craft references and does not establish that all remaining source is distributable.
4. Complete a full secret scan and address any findings. An earlier pattern scan found no high-confidence common credentials, but is not proof of absence.
5. Recheck the published tree and Git history for disallowed assets; remove or revise anything that should not remain public.

The initial upload used one fresh-history `main` branch. The existing private demo, current local source holdings, and this public snapshot do not themselves grant permission to distribute copyrighted game material.
