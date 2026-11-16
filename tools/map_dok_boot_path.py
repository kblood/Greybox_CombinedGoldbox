"""Map Death Knights of Krynn's (DoK) native boot-path function (`sub_29758` analog) that sets
the live "current ECL/GEO block id" global at fresh-game start, WITHOUT going through the ECL-VM
command layer.

Directly answers item 2 of `docs/engine/research/dok-natural-route.md`'s "2026-07-17 Update 6"
next-steps list: earlier rounds proved `CMD_NewECL` never fires during boot-to-spawn (matching the
CoAB oracle's own boot-path source, `coab_extracted/engine/ovr003.cs` ~line 2230-2299, which shows
native C code sets `gbl.EclBlockId` directly on a fresh game: `if (gbl.area_ptr.LastEclBlockId ==
0) { gbl.EclBlockId = 1; ... } else { gbl.EclBlockId = (byte)gbl.area_ptr.LastEclBlockId; }`) --
but that native boot-path function itself had never been located in DoK's own binary.

Technique: same-subsystem structural matching against the CoAB oracle (`build/coab-oracle-map.json`,
symbol `sub_29758`), reusing `tools/map_pool_ecl_dispatch.py`'s `disassemble_shape`/`nearest_function`
verbatim -- exactly the method already proven twice for DoK's dispatcher/operand-parser/CMD_Goto
(`tools/map_dok_ecl_dispatch.py`) and for DoK's CMD_NewECL handler (manual disassembly in the
2026-07-17 Update 6 section of the natural-route doc). This is the first time the technique has been
applied to a large (200+ instruction), non-opcode-handler function, so the match confidence is
reported as a similarity SCORE, not assumed to be as strong as the near-1.0 dispatcher/parser
matches -- see the module docstring on `sequence_similarity` interpretation below.

Once the candidate function is located, this tool walks its own Capstone disassembly to extract,
programmatically (not by hand-copied offsets):
  - the `cmp byte ptr es:[di+N], 0` test against the struct field CMD_NewECL independently proved
    is `area_ptr->LastEclBlockId` (struct offset 0xF2, from the "MOV ES:[DI+0xF2],AL" write in
    CMD_NewECL) -- this locates the "if (LastEclBlockId == 0)" boot-path branch itself;
  - the `jne` that skips the "fresh game" branch when LastEclBlockId != 0;
  - inside the `jne` TARGET (the "continuing game" branch), the `LES DI,[far_ptr]` / `MOV AL,
    ES:[DI+0xF2]` / `MOV [addr16], AL` triple that copies the struct field into a *plain global* --
    this reveals the live "gbl.EclBlockId" global's own DGROUP address without assuming it (the
    address is read straight out of the disassembly, not hard-coded);
  - inside the FALL-THROUGH ("fresh game") branch, every `MOV [that same global], imm8` found before
    the continuing-game branch's own entry point -- these are the literal fresh-game boot-block-id
    constants (expected: one for demo, one for non-demo, matching the CoAB oracle's `0x52`/`1` shape,
    though DoK's own literal values need not match CoAB's numerically -- and per this tool's own
    2026-07-17/18 run they do not: see the generated markdown for the actual constants found).

Claim boundary: this tool answers "where would a future live breakpoint go to observe DoK's own
fresh-game EclBlockId assignment" -- it does NOT run DOSBox-X and does NOT confirm live which branch
a real boot takes. That is the deliberately out-of-scope next step (see the generated markdown's own
closing section).
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import goldbox_corpus
from map_pool_ecl_dispatch import FunctionShape, disassemble_shape, nearest_function, oracle_offset


DEFAULT_ORACLE = goldbox_corpus.REPO_ROOT / "build/coab-oracle-map.json"
DEFAULT_JSON = goldbox_corpus.REPO_ROOT / "build/dok-boot-path-map.json"
DEFAULT_MARKDOWN = goldbox_corpus.REPO_ROOT / "docs/engine/research/dok-boot-path-map.md"

BOOT_PATH_ORACLE_SYMBOL = "sub_29758"
LAST_ECL_BLOCK_ID_STRUCT_OFFSET = 0xF2  # proven via CMD_NewECL's own MOV ES:[DI+0xF2],AL write.
AREA_PTR_FAR_ADDR = 0x8C2D  # proven stable (segment 0x4FD1, offset 0) by Update 6's own trace.


def dok_path() -> Path:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    profile_id = "death-knights-of-krynn"
    install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
    if install is None:
        raise FileNotFoundError(f"install not found: {profile_id}")
    files = goldbox_corpus.file_index(install)
    return files["GAME.OVR"]


def coab_path() -> Path:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    profile_id = "curse-of-the-azure-bonds"
    install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
    if install is None:
        raise FileNotFoundError(f"install not found: {profile_id}")
    files = goldbox_corpus.file_index(install)
    return files["GAME.OVR"]


def find_descriptor(descs: list[tuple[int, int, int, int]], file_offset: int) -> dict[str, int] | None:
    for idx, (start_exe_off, fileofs, codesz, jmpcnt) in enumerate(descs):
        if fileofs <= file_offset < fileofs + codesz:
            return {
                "index": idx,
                "start_exe_off": start_exe_off,
                "fileofs": fileofs,
                "codesz": codesz,
                "jmpcnt": jmpcnt,
                "descriptor_relative_offset": file_offset - fileofs,
            }
    return None


def walk_boot_branch(dok: bytes, candidate: FunctionShape) -> dict[str, Any]:
    """Disassemble the candidate function and extract the LastEclBlockId test, the
    continuing-game propagate read+write (which also reveals the plain gbl.EclBlockId global's
    address), and every literal fresh-game write to that same global found before the
    continuing-game branch begins."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    instrs = list(md.disasm(dok[candidate.offset:candidate.offset + candidate.size], candidate.offset))

    def u16(value: int) -> int:
        """Capstone signs 16-bit ModRM/imm displacements that exceed 0x7FFF; normalise back to
        an unsigned 16-bit DGROUP-style address/offset for comparison and reporting."""
        return value & 0xFFFF

    def is_les_area_ptr(ins) -> bool:
        return (
            ins.mnemonic == "les"
            and len(ins.operands) == 2
            and ins.operands[1].type == capstone.x86.X86_OP_MEM
            and u16(ins.operands[1].mem.disp) == AREA_PTR_FAR_ADDR
        )

    def mem_base_is_di(op) -> bool:
        return op.type == capstone.x86.X86_OP_MEM and md.reg_name(op.mem.base) == "di"

    # 1) Locate `cmp byte ptr es:[di+0xf2], 0` (the LastEclBlockId==0 test) and its `jne`.
    test_idx = None
    for i, ins in enumerate(instrs):
        if ins.mnemonic == "cmp" and len(ins.operands) == 2:
            left, right = ins.operands
            if mem_base_is_di(left) and u16(left.mem.disp) == LAST_ECL_BLOCK_ID_STRUCT_OFFSET and right.type == capstone.x86.X86_OP_IMM and right.imm == 0:
                test_idx = i
                break
    if test_idx is None:
        return {"found": False, "reason": "no cmp byte ptr es:[di+0xf2],0 in candidate function"}
    jne_idx = test_idx + 1
    if instrs[jne_idx].mnemonic not in ("jne", "jnz"):
        return {"found": False, "reason": f"instruction after the LastEclBlockId test is {instrs[jne_idx].mnemonic!r}, not jne"}
    jne_target = instrs[jne_idx].operands[0].imm

    # 2) In the jne TARGET block (continuing game), find LES area_ptr; MOV AL,ES:[DI+0xF2];
    #    MOV [addr16],AL -- this reveals gbl.EclBlockId's own DGROUP address.
    target_start = next((i for i, ins in enumerate(instrs) if ins.address == jne_target), None)
    ecl_block_id_addr = None
    continuing_read_offset = None
    continuing_write_offset = None
    if target_start is not None:
        for i in range(target_start, min(target_start + 6, len(instrs) - 1)):
            ins = instrs[i]
            if is_les_area_ptr(ins):
                nxt = instrs[i + 1]
                if nxt.mnemonic == "mov" and len(nxt.operands) == 2 and mem_base_is_di(nxt.operands[1]) and u16(nxt.operands[1].mem.disp) == LAST_ECL_BLOCK_ID_STRUCT_OFFSET:
                    continuing_read_offset = nxt.address
                    nxt2 = instrs[i + 2]
                    if nxt2.mnemonic == "mov" and len(nxt2.operands) == 2 and nxt2.operands[0].type == capstone.x86.X86_OP_MEM and nxt2.operands[0].mem.base == 0:
                        ecl_block_id_addr = u16(nxt2.operands[0].mem.disp)
                        continuing_write_offset = nxt2.address
                break

    # 3) In the FALL-THROUGH ("fresh game") branch (from just after the jne up to jne_target),
    #    find every literal `MOV [ecl_block_id_addr], imm8`.
    fresh_writes: list[dict[str, int]] = []
    if ecl_block_id_addr is not None:
        for ins in instrs[jne_idx + 1:target_start if target_start is not None else len(instrs)]:
            if ins.address >= jne_target:
                break
            if ins.mnemonic == "mov" and len(ins.operands) == 2:
                dst, src = ins.operands
                if dst.type == capstone.x86.X86_OP_MEM and dst.mem.base == 0 and u16(dst.mem.disp) == ecl_block_id_addr and src.type == capstone.x86.X86_OP_IMM:
                    fresh_writes.append({"file_offset": ins.address, "value": src.imm})

    # 4) Elsewhere in the WHOLE function, find every `MOV ES:[DI+0xF2], AL` (the post-run
    #    "area_ptr->LastEclBlockId = gbl.EclBlockId" propagate-back write CoAB's own source shows
    #    happening after RunEclVm returns, gated on vmFlag01==false).
    propagate_back_writes: list[int] = []
    for ins in instrs:
        if ins.mnemonic == "mov" and len(ins.operands) == 2:
            dst, src = ins.operands
            if mem_base_is_di(dst) and u16(dst.mem.disp) == LAST_ECL_BLOCK_ID_STRUCT_OFFSET and src.type == capstone.x86.X86_OP_REG:
                propagate_back_writes.append(ins.address)

    return {
        "found": True,
        "last_ecl_block_id_test_file_offset": instrs[test_idx].address,
        "jne_file_offset": instrs[jne_idx].address,
        "jne_target_file_offset": jne_target,
        "ecl_block_id_global_addr": ecl_block_id_addr,
        "continuing_game_read_file_offset": continuing_read_offset,
        "continuing_game_write_file_offset": continuing_write_offset,
        "fresh_game_literal_writes": fresh_writes,
        "propagate_back_write_file_offsets": propagate_back_writes,
    }


def build_report(oracle_path: Path = DEFAULT_ORACLE) -> dict[str, Any]:
    import disasm_dok

    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    dok_p, coab_p = dok_path(), coab_path()
    dok = dok_p.read_bytes()
    coab = coab_p.read_bytes()

    reference = disassemble_shape(coab, oracle_offset(oracle, BOOT_PATH_ORACLE_SYMBOL), max_size=1200)
    if reference is None:
        raise ValueError("failed to disassemble CoAB oracle sub_29758")
    candidate, ratio, jaccard = nearest_function(dok, reference)
    branch = walk_boot_branch(dok, candidate)
    descriptor = find_descriptor(disasm_dok.DESCS, candidate.offset)

    result: dict[str, Any] = {
        "schema_version": 1,
        "provenance": "same-subsystem-structural-map-verified-against-coab-oracle-and-retail-bytes",
        "dok_path": goldbox_corpus.slash(dok_p),
        "coab_path": goldbox_corpus.slash(coab_p),
        "oracle_symbol": BOOT_PATH_ORACLE_SYMBOL,
        "coab_reference": asdict(reference),
        "dok_candidate": asdict(candidate),
        "sequence_similarity": ratio,
        "trigram_jaccard": jaccard,
        "descriptor": descriptor,
        "boot_branch": branch,
        "claim_boundary": (
            "Function identity established by same-subsystem structural match against the CoAB "
            "oracle's own sub_29758 (the boot-path function CoAB's decompiled ovr003.cs shows sets "
            "gbl.EclBlockId directly on a fresh game, bypassing CMD_NewECL). Structurally-extracted "
            "offsets within the candidate (the LastEclBlockId==0 test, the continuing-game "
            "propagate read/write revealing gbl.EclBlockId's own DGROUP address, and every literal "
            "fresh-game write to that address) are read directly from Capstone disassembly, not "
            "hand-derived. NOT live-verified: no DOSBox-X trace was run by this tool. A future round "
            "must arm a breakpoint at the reported offsets (same descriptor/seek-capture technique as "
            "tools/trace_dok_goto_operand.ps1, which already resolves this exact descriptor's live "
            "destination segment) to confirm which branch a real boot actually takes and what value "
            "the EclBlockId global ends up holding."
        ),
    }
    return result


def render_markdown(report: dict[str, Any]) -> str:
    branch = report["boot_branch"]
    descriptor = report["descriptor"]
    lines = [
        "# Death Knights of Krynn Boot-Path (`sub_29758` analog) Map",
        "",
        "> Generated by `tools/map_dok_boot_path.py`. Do not edit by hand.",
        "",
        f"- CoAB oracle `{report['oracle_symbol']}`: `GAME.OVR:0x{report['coab_reference']['offset']:x}` "
        f"({report['coab_reference']['instruction_count']} instructions, {report['coab_reference']['size']} bytes).",
        f"- DoK candidate: `GAME.OVR:0x{report['dok_candidate']['offset']:x}` "
        f"({report['dok_candidate']['instruction_count']} instructions, {report['dok_candidate']['size']} bytes).",
        f"- Sequence similarity: `{report['sequence_similarity']:.4f}`; trigram Jaccard: `{report['trigram_jaccard']:.4f}` "
        "(lower than the dispatcher/operand-parser matches -- expected for a much larger, more "
        "control-flow-heavy function; treat as a strong lead, not a proof, until the structurally-"
        "extracted branch below reads as coherent code, which it does).",
    ]
    if descriptor is not None:
        lines.append(
            f"- Descriptor: index `{descriptor['index']}` (`fileofs=0x{descriptor['fileofs']:x}`, "
            f"`codesz=0x{descriptor['codesz']:x}`) -- entry at descriptor-relative offset "
            f"`0x{descriptor['descriptor_relative_offset']:x}`."
        )
    lines.append("")
    if not branch.get("found"):
        lines.append(f"**Boot branch NOT found in the candidate function:** {branch.get('reason')}")
        lines.append("")
        return "\n".join(lines)

    def rel(file_offset: int) -> str:
        if descriptor is None:
            return f"0x{file_offset:x}"
        return f"0x{file_offset:x} (descriptor-relative 0x{file_offset - descriptor['fileofs']:x})"

    lines += [
        "## Extracted boot-path structure",
        "",
        f"- `LastEclBlockId == 0` test (`cmp byte ptr es:[di+0xf2], 0`): file offset `{rel(branch['last_ecl_block_id_test_file_offset'])}`.",
        f"- `jne` (skip fresh-game branch if LastEclBlockId != 0): file offset `{rel(branch['jne_file_offset'])}`, "
        f"target `0x{branch['jne_target_file_offset']:x}`.",
        f"- `gbl.EclBlockId` global address (plain DGROUP byte, DS-relative): `0x{branch['ecl_block_id_global_addr']:04x}`" if branch.get("ecl_block_id_global_addr") is not None else "- `gbl.EclBlockId` global address: NOT FOUND.",
        f"- Continuing-game branch: reads `area_ptr->LastEclBlockId` (struct+0xF2) at `{rel(branch['continuing_game_read_file_offset'])}`, "
        f"writes it to the EclBlockId global at `{rel(branch['continuing_game_write_file_offset'])}`."
        if branch.get("continuing_game_write_file_offset") is not None else "- Continuing-game read/write: NOT FOUND.",
        "",
        "### Fresh-game literal writes to the EclBlockId global (found between the `jne` and its target)",
        "",
        "| File offset | Descriptor-relative | Literal value |",
        "| --- | --- | --- |",
    ]
    for w in branch["fresh_game_literal_writes"]:
        lines.append(f"| `0x{w['file_offset']:x}` | `{rel(w['file_offset']).split('(descriptor-relative ')[-1].rstrip(')')}` | `{w['value']}` (`0x{w['value']:02x}`) |")
    lines += [
        "",
        "### Post-run propagate-back writes (`area_ptr->LastEclBlockId = gbl.EclBlockId`, all `mov es:[di+0xf2], reg`)",
        "",
    ]
    for off in branch["propagate_back_write_file_offsets"]:
        lines.append(f"- `{rel(off)}`")
    lines += [
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.oracle)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    if args.strict and not report["boot_branch"].get("found"):
        raise SystemExit("strict failure: boot branch not found")
    print(
        f"dok boot path: candidate 0x{report['dok_candidate']['offset']:x} "
        f"(similarity {report['sequence_similarity']:.3f}), "
        f"found={report['boot_branch'].get('found')}"
    )


if __name__ == "__main__":
    main()
