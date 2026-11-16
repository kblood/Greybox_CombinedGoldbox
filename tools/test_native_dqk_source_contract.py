"""Source-level safeguards for DQK ECL and binary-state contracts."""
from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


def code_lines(path: Path) -> list[str]:
    return [
        re.sub(r"\s+", " ", line.split(";", 1)[0].strip().lower())
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.split(";", 1)[0].strip()
    ]


def block(lines: list[str], start: str, end: str) -> list[str]:
    start = start.lower()
    end = end.lower()
    first = next(i for i, line in enumerate(lines) if line == start)
    last = next(i for i in range(first + 1, len(lines)) if lines[i] == end)
    return lines[first:last]


def assert_ccflow_transport(test: unittest.TestCase, lines: list[str], tail: str) -> None:
    index = lines.index(tail)
    test.assertEqual(lines[index + 1:index + 5], [
        "mov di, titlepath", "mov si, s_ccflow", "call compose_tool_path",
        "mov word [runpathp], titlepath",
    ])
    test.assertNotIn("mov si, s_ccecl", lines[index:])
    test.assertNotIn("cmp word [enginep], eng_dax_gen1", lines[index:])


class NativeDqkSourceContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.ccecl = code_lines(ROOT / "native/src/ccecl.asm")
        cls.ccmenu = code_lines(ROOT / "native/src/ccmenu.asm")
        cls.ccflow = code_lines(ROOT / "native/src/ccflow.asm")
        cls.cccombat = code_lines(ROOT / "native/src/cccombat.asm")
        cls.gbboot = code_lines(ROOT / "native/src/gbboot.asm")
        cls.cchost_damage = code_lines(ROOT / "native/src/cchost_damage.inc")
        cls.fixture = (ROOT / "native/ccecl-menu-resume-test.ps1").read_text(
            encoding="utf-8"
        ).lower()
        cls.ccmenu_fixture = (ROOT / "native/ccmenu-test.ps1").read_text(
            encoding="utf-8"
        ).lower()

    def test_party_prompt_behavior_is_scoped_to_gen2(self) -> None:
        handler = block(self.ccecl, "op_party_surprise:", "op_surprise:")
        opening = handler.index("cmp byte [is_gen2], 1")
        self.assertEqual(handler[opening + 1], "je .short")
        guard = handler.index("cmp byte [is_gen2], 1", handler.index(".short:"))
        self.assertEqual(handler[guard + 1], "jne .legacy_short")
        self.assertLess(guard, handler.index("call clear_party_prompt_flags"))
        self.assertIn("call yield_menu", handler)
        self.assertIn("call set_bool_flags", handler)

    def test_party_resume_preserves_retail_flags_and_menu_reserved_bits(self) -> None:
        handler = block(self.ccecl, "op_party_surprise:", "op_surprise:")
        clear = block(handler, "clear_party_prompt_flags:", "set_party_prompt_answer:")
        self.assertEqual(
            [line for line in clear if line.startswith("mov byte [flag_")],
            [
                "mov byte [flag_eq], 0",
                "mov byte [flag_ne], 0",
                "mov byte [flag_lt], 0",
                "mov byte [flag_gt], 0",
            ],
        )

        writer = block(self.ccecl, "write_effects:", ".capacity_v15:")
        menu_start = writer.index(".menu_v14:")
        menu = writer[menu_start:]
        party_bits = menu.index("mov ax, [menu_pending_reserved]")
        self.assertNotIn("mov word [fxhdr+mn_reserved_off], 0", menu[party_bits + 1 :])
        self.assertIn("mov word [fxhdr+mn_flags_off], 3", menu[:party_bits])

        resume = block(self.ccecl, "read_resume_menu:", "read_resume_ack:")
        self.assertIn("mov [resume_menu_flags], ax", resume)
        apply_state = self.ccecl[self.ccecl.index("apply_resume_state:") :]
        self.assertIn("call set_party_prompt_answer", apply_state)

    def test_other_menu_types_keep_their_gbmt_segment_count(self) -> None:
        resume = block(self.ccecl, "read_resume_menu:", "read_resume_ack:")
        index = resume.index(".check_party_text:")
        self.assertIn("cmp word [resume_menu_opcode], 0039h", resume[index:index + 5])
        self.assertIn("jne .text_count_final", resume[index:index + 5])
        helper = block(self.ccmenu, "validate_menu_text:", "show_menu:")
        index = helper.index(".text_prompt_count:")
        self.assertIn("cmp word [menu_opcode], 22h", helper[:index])
        self.assertIn("jne .count_ready", helper[:index])

    def test_gen2_who_uses_inline_prompt_and_selected_party_context(self) -> None:
        who = block(self.ccecl, "op_who:", "capture_who_text:")
        guard = who.index("cmp byte [is_gen2], 0")
        gen2 = who.index(".gen2_who:")
        self.assertLess(guard, gen2)
        self.assertIn("call record_operand_text", who[gen2:])
        self.assertIn("mov word [menu_pending_dest], 0ffffh", who[gen2:])
        self.assertIn("call capture_menu_text", who[gen2:])
        self.assertIn("call capture_who_text", who[gen2:])
        self.assertIn("call set_who_party_selection", who[gen2:])
        self.assertIn("mov [selected_party], ax", who)
        self.assertIn("inc ax", who)
        self.assertIn("cmp byte [is_gen2], 0", who[:gen2])
        self.assertIn("call mem_set", who[:gen2])  # preserve the legacy destination form

        resume = block(self.ccecl, "read_resume_menu:", "read_resume_ack:")
        self.assertIn("cmp word [resume_menu_dest], 0ffffh", resume)
        self.assertIn("cmp ax, [rbuf+sx_events_off+di+4]", resume)
        self.assertIn("call set_who_party_selection", self.ccecl)
        selection_guard = block(self.ccecl, "can_write_menu_selection:", "consume_menu_outcome:")
        self.assertIn("cmp word [resume_menu_opcode], 0039h", selection_guard)
        self.assertIn("cmp word [resume_menu_dest], 0ffffh", selection_guard)

        menu = block(self.ccmenu, "validate_menu_text:", "show_menu:")
        self.assertIn("cmp word [fxbuf+mn_dest_off], 0ffffh", menu)
        self.assertIn("movzx ax, byte [fxbuf+si]", menu)
        show = block(self.ccmenu, "show_menu:", "build_prior_narration:")
        self.assertIn("cmp word [fxbuf+mn_dest_off], 0ffffh", show)
        flow = block(self.ccflow, "validate_v15_menu:", "validate_v15_final_sidecar:")
        self.assertIn("cmp word [fxbuf+mn_opcode_off], 0039h", flow)
        self.assertIn("cmp word [fxbuf+mn_dest_off], 0ffffh", flow)
        self.assertIn("cmp word [fxbuf+bx+2], 1", flow)
        self.assertIn("assert-gen2whopending", self.fixture)
        self.assertIn("assert-gen2whocontinuation", self.fixture)

    def test_horizontal_menu_presents_prior_fixed_text_before_choices(self) -> None:
        show = block(self.ccmenu, "show_menu:", "build_prior_narration:")
        self.assertLess(show.index("call build_prior_narration"), show.index("mov dx, s_menu"))
        self.assertLess(show.index("call write_prior_narration"), show.index("mov dx, s_menu"))
        helper = block(self.ccmenu, "build_prior_narration:", "write_prior_narration:")
        self.assertIn("cmp word [menu_opcode], 002bh", helper)
        self.assertIn("cmp word [menu_opcode], 0031h", helper)
        self.assertIn("cmp ax, [menu_event]", helper)
        self.assertIn("cmp ax, 0011h", helper)
        self.assertIn("cmp ax, 0012h", helper)
        self.assertIn("cmp ax, 0033h", helper)
        self.assertIn("cmp ax, 003dh", helper)
        self.assertIn("cmp cx, script_text_bytes", helper)
        self.assertIn("cmp ax, prior_text_cap", helper)

    def test_ccmenu_fixture_pins_v14_v15_caption_and_malformed_text(self) -> None:
        self.assertIn("wall-v14.efx", self.ccmenu_fixture)
        self.assertIn("wall-v15.efx", self.ccmenu_fixture)
        self.assertIn("wclr15.efx", self.ccmenu_fixture)
        self.assertIn("wall-bad.efx", self.ccmenu_fixture)
        self.assertIn("select the combat wall type:", self.ccmenu_fixture)
        self.assertIn("current title", self.ccmenu_fixture)
        self.assertIn("cleartranscript.contains('old')", self.ccmenu_fixture)
        self.assertIn("captionat -ge $choiceat", self.ccmenu_fixture)
        self.assertIn("transcript.split($caption).length -ne 2", self.ccmenu_fixture)

    def test_savetable_keeps_full_address_and_truncates_only_byte_value(self) -> None:
        handler = block(self.ccecl, "op_savetable:", "op_clearmonsters:")
        add = handler.index("add ax, [t1]")
        self.assertEqual(handler[add + 1], "mov bx, ax")
        self.assertEqual(handler[add + 2], "mov ax, [t0]")
        mask = handler.index("and ax, 00ffh")
        self.assertGreater(mask, handler.index("mov ax, [t0]"))
        self.assertLess(mask, handler.index("call mem_set"))

    def test_dax_compressed_input_has_its_measured_independent_capacity(self) -> None:
        loader = block(self.ccecl, "load_dax_block:", "decode_dax_rle:")
        raw_check = loader.index("cmp ax, blkcap")
        comp_check = loader.index("cmp ax, daxcomp_cap")
        self.assertLess(raw_check, comp_check)
        self.assertIn("call decode_dax_stream", loader)
        self.assertLess(comp_check, loader.index("call decode_dax_stream"))
        stream = code_lines(ROOT / "native/src/daxstream.inc")
        self.assertIn("mov ax, [dax_comp]", stream)
        self.assertIn("cmp ax, daxcomp_cap", stream)
        self.assertIn("cmp cx, scratch_cap", stream)
        self.assertIn("mov cx, scratch_cap", stream)
        self.assertIn("blkcap equ 16000", self.ccecl)
        self.assertIn("daxcomp_cap equ 14500", self.ccecl)
        self.assertIn("blk resb blkcap", self.ccecl)
        self.assertIn("scratch_cap equ ir_len_v3", self.ccecl)
        self.assertIn("compbuf resb scratch_cap", self.ccecl)
        self.assertIn("cmp ax, blkcap", block(self.ccecl, "load_gen2_block:", "byteswap_gptrs:"))

    def test_gen2_menu_yield_round_trips_v15_raw_flags_via_ccmenu(self) -> None:
        writer = block(self.ccecl, "write_effects:", ".capacity_v15:")
        guard = writer.index("cmp byte [is_gen2], 0", writer.index(".not_status_two:") - 4)
        self.assertEqual(writer[guard + 1], "je .menu_v14")
        self.assertIn("mov word [fxhdr+4], 15", writer)
        self.assertIn("jmp .write_v15_state", writer)
        state_writer = block(self.ccecl, ".write_v15_state:", ".output_ready:")
        self.assertIn("mov si, flag_eq", state_writer)
        self.assertIn("mov di, fxhdr+gbrf_flags_off", state_writer)
        self.assertIn("rep movsb", state_writer)

        reader = block(self.ccecl, "read_resume_state:", "read_resume_menu:")
        self.assertIn("cmp word [rbuf+mn_opcode_off], 001dh", reader)
        self.assertIn("call read_resume_ack", reader)
        self.assertIn("call read_resume_menu", reader)
        self.assertIn("call validate_v15_state", reader)
        self.assertIn("mov byte [resume_kind], 2", reader)

        resume = block(self.ccecl, "apply_resume_state:", "restore_fx_prefix:")
        self.assertIn("cmp word [rbuf+4], 15", resume)
        self.assertIn("je .restore_raw_flags", resume)
        self.assertIn("call set_party_prompt_answer", resume)

        menu_reader = block(self.ccmenu, "read_effect:", "show_menu:")
        self.assertIn("cmp ax, fx_v15_len", menu_reader)
        self.assertIn("mov byte [effect_v15], 1", menu_reader)
        self.assertIn("call validate_v15_menu_state", menu_reader)
        menu_writer = block(self.ccmenu, "write_effect:", "puts:")
        self.assertIn("cmp byte [effect_v15], 1", menu_writer)
        self.assertIn("mov cx, fx_v15_len", menu_writer)
        self.assertIn("cmp ax, [output_len]", menu_writer)

        boot_menu = block(self.gbboot, ".menu:", ".menu_tool_ready:")
        self.assertIn("test word [fxbuf+6], 0100h", boot_menu)
        self.assertIn("jz .menu_tool_ready", boot_menu)
        self.assertIn("mov si, s_ccfp", boot_menu)

    def test_party_fixture_uses_a_gen2_hlib_block(self) -> None:
        self.assertRegex(self.fixture, r"function new-gen2program\s*\{\s*\$p =")
        self.assertIn("1..20 | foreach-object { add-byte $p 0 }", self.fixture)
        self.assertIn("function write-partyhlib", self.fixture)
        self.assertIn("write-partyhlib (join-path $run 'party.glb') $party", self.fixture)
        self.assertIn("$firstmember = 28 + $idtable.count", self.fixture)
        self.assertIn("$eof = $firstmember + $block.count", self.fixture)
        self.assertIn("add-u32le $container 28", self.fixture)
        self.assertIn("add-u32le $container $firstmember", self.fixture)
        self.assertIn("$container.count -ne $eof", self.fixture)
        self.assertIn("party.glb", self.fixture)
        self.assertIn("ccecl c:\\party.glb 1 /r", self.fixture)
        self.assertNotIn("ccecl c:\\party.bin", self.fixture)

    def test_hlib_capacity_start_and_resume_use_owned_ccflow_transport(self) -> None:
        route = block(self.gbboot, ".run_ecl:", ".execute_ecl:")
        assert_ccflow_transport(self, route, "call build_ecl_tail")

        resume = block(self.gbboot, ".resume_combat_effect:", ".combat_effect_geo:")
        transport = resume[resume.index("call build_ecl_resume_tail"):]
        assert_ccflow_transport(self, transport, "call build_ecl_resume_tail")

        loop = block(self.ccflow, ".run:", ".terminal:")
        self.assertIn("call is_script_full", loop)
        self.assertIn("jnc .terminal", loop)
        self.assertIn("call append_current_chunk", loop)
        self.assertIn("call write_replay", loop)
        self.assertIn("call use_resume_tail", loop)

        flow_menu = block(self.ccflow, "validate_v15_menu:", "validate_v15_final_sidecar:")
        self.assertIn("cmp word [fxbuf+8], 2", flow_menu)
        self.assertIn("cmp word [fxbuf+mn_opcode_off], 001dh", self.ccflow)
        self.assertIn("cmp ax, [fxbuf+mn_event_off]", flow_menu)
        self.assertIn("cmp word [fxbuf+bx], ax", flow_menu)

        final_sidecar = block(
            self.ccflow, "validate_v15_final_sidecar:", "is_script_full:"
        )
        self.assertIn("mov cx, script_event_bytes", final_sidecar)
        self.assertIn(".compare_event:", final_sidecar)
        self.assertIn("cmp ax, [di]", final_sidecar)
        self.assertIn("loop .compare_event", final_sidecar)
        capacity = block(self.ccflow, "is_script_full:", "append_current_chunk:")
        self.assertIn("test word [fxbuf+6], fx_have_sidecar", capacity)
        self.assertIn("jnz .no", capacity)

        terminal = block(self.ccflow, ".terminal:", "usage:")
        self.assertIn("cmp word [fxbuf+8], 2", terminal)
        self.assertIn("cmp word [fxbuf+mn_opcode_off], 001dh", terminal)
        self.assertIn("call chunk_has_reference", terminal)
        self.assertIn("jne .check_v14_terminal", terminal)
        self.assertIn("jne .v14_saturated", terminal)
        self.assertIn("jne .publish", terminal)
        self.assertIn("call mark_effect_sidecar", terminal)

        capacity_writer = block(self.ccecl, "write_effects:", ".capacity_v15:")
        status_two_end = capacity_writer.index(".not_status_two:")
        capacity_guard = capacity_writer.index("cmp byte [is_gen2], 0", status_two_end)
        self.assertEqual(capacity_writer[capacity_guard + 1], "je .output_ready")
        self.assertGreater(capacity_guard, status_two_end)
        resume_reader = block(self.ccecl, "read_resume_state:", "read_resume_menu:")
        self.assertIn("call validate_v15_capacity", resume_reader)
        guard = resume_reader.index("cmp byte [is_gen2], 0")
        self.assertEqual(resume_reader[guard + 1], "je .err")
        self.assertIn("or word [fx_resume_flags], 12", capacity_writer)
        self.assertIn("or word [fxbuf+rs_flags_off], 1", self.ccflow)
        self.assertNotIn("cmp byte [is_dok], 1", capacity_writer)
        self.assertNotIn("cmp byte [is_dok], 1", resume_reader)

        host = block(self.cchost_damage, "apply_effect_damage_roster:", ".v14_terminal:")
        self.assertIn("cmp ax, 4", host)
        self.assertIn("je .v15_capacity", host)
        self.assertIn("call validate_damage_v15_capacity", host)

        self.assertIn("jmp .fixed", host)
        validator = block(
            self.cchost_damage,
            "validate_damage_v15_capacity:",
            "read_effect_word_at:",
        )
        self.assertIn("cmp ax,gbef_v15_len", validator)
        self.assertIn("test ax,fx_have_sidecar", validator)
        self.assertIn("mov cx,12", validator)
        self.assertIn("cmp ax,4", validator)

        terminal_menu = block(
            self.cchost_damage,
            "validate_damage_v15_menu:",
            "validate_damage_v15_capacity:",
        )
        self.assertIn("cmp ax,gbef_v15_len", terminal_menu)
        self.assertIn("cmp ax,2", terminal_menu)
        self.assertIn("mov dx,gbef_v9_len+12", terminal_menu)
        self.assertIn("cmp [damage_event_index],ax", terminal_menu)
        self.assertIn("cmp ax,[damage_menu_opcode]", terminal_menu)

        host = block(self.cchost_damage, ".v14_terminal:", ".v9_terminal:")
        self.assertIn("cmp ax, 5920", host)
        self.assertIn("test ax, fx_have_sidecar", host)
        self.assertIn("jnz .close_fail", host)

        boot = block(self.gbboot, ".ecl_return:", ".not_combat:")
        self.assertLess(
            boot.index("call apply_sidecar_damage_roster"),
            boot.index("cmp word [fxstatus], 2"),
        )
        menu_status = boot.index("cmp word [fxstatus], 2")
        self.assertEqual(boot[menu_status + 1:menu_status + 4], [
            "je .menu", "cmp word [fxstatus], 3", "jne .not_combat",
        ])
        self.assertIn("mov si, s_ccfp", boot)

    def test_ccflow_transport_rejects_direct_vm_regression(self) -> None:
        for start, end, tail in (
            (".run_ecl:", ".execute_ecl:", "call build_ecl_tail"),
            (".resume_combat_effect:", ".combat_effect_geo:", "call build_ecl_resume_tail"),
        ):
            route = block(self.gbboot, start, end)
            assert_ccflow_transport(self, route, tail)
            mutated = [line.replace("mov si, s_ccflow", "mov si, s_ccecl") for line in route]
            self.assertNotEqual(mutated, route)
            with self.assertRaises(AssertionError):
                assert_ccflow_transport(self, mutated, tail)

    def test_dqk_ca03_is_separate_from_raw_loadfiles_and_resolves_both_groups(self) -> None:
        loadfiles = block(self.ccecl, "op_loadfiles:", "op_partystrength:")
        self.assertIn("mov [fx_files+2], ax", loadfiles)
        self.assertIn("cmp al, 0ffh", loadfiles)
        self.assertIn("je .context_done", loadfiles)
        self.assertIn("mov [fx_files+4], ax", loadfiles)

        # FF is a no-update sentinel: an earlier unconditional store would erase
        # a context restored from a prior block or a cold continuation.
        stores = [i for i, line in enumerate(loadfiles) if line == "mov [fx_files+4], ax"]
        self.assertEqual(len(stores), 1)
        sentinel = loadfiles.index("cmp al, 0ffh")
        self.assertEqual(loadfiles[sentinel + 1], "je .context_done")
        self.assertLess(sentinel, stores[0])
        self.assertLess(stores[0], loadfiles.index(".context_done:"))
        self.assertEqual(loadfiles[stores[0] - 1], ".store_context:")
        gen2 = loadfiles.index("cmp byte [is_gen2], 1")
        self.assertEqual(loadfiles[gen2 - 1], "mov ax, [t2]")
        self.assertEqual(loadfiles[gen2 + 1], "jne .store_context")
        dok = loadfiles.index("cmp byte [is_dok], 1")
        self.assertEqual(loadfiles[dok + 1], "je .store_context")

        restore = block(self.ccecl, "restore_fx_prefix:", "can_write_menu_selection:")
        self.assertIn("mov cx, fx_prefix_len/2", restore)
        self.assertIn("rep movsw", restore)

        self.assertIn("mov ah, 0d0h", loadfiles)
        resolver = block(self.cccombat, "build_effect_encounter:", "validate_effect_capacity:")
        self.assertIn("cmp ah, 0d0h", resolver)
        self.assertIn("and ax, 00ffh", resolver)
        self.assertIn("cmp ax, 6", resolver)
        self.assertIn("mov al, [dqk_combat_group_pairs+bx]", resolver)
        self.assertIn("mov [combat_hlib_groups], ax", resolver)

        table_line = next(
            line for line in self.cccombat if line.startswith("dqk_combat_group_pairs db ")
        )
        values = [
            int(value.removesuffix("h"), 16)
            for value in table_line.split(" db ", 1)[1].split(",")
        ]
        self.assertEqual(
            [(value & 15, value >> 4) for value in values[1:]],
            [(1, 1), (2, 2), (3, 0), (4, 3), (1, 4), (5, 0)],
        )


if __name__ == "__main__":
    unittest.main()
