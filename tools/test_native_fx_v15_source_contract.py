"""Check v15 GBEF acknowledgement wiring without launching DOSBox.

These are source-shape guards only. Assembly/build validation is separate;
test_native_ack_resume.py exercises two real DoK ACKs under DOSBox.
"""
from __future__ import annotations

from pathlib import Path
import re
import unittest
from test_native_dqk_source_contract import assert_ccflow_transport, block, code_lines


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "native" / "src"


def source(name: str) -> str:
    lines = (SRC / name).read_text(encoding="utf-8").lower().splitlines()
    code = " ".join(line.split(";", 1)[0] for line in lines)
    return re.sub(r"\s+", " ", code)


def require(test: unittest.TestCase, text: str, fragment: str) -> None:
    test.assertTrue(fragment in text, f"missing source contract fragment: {fragment}")


def require_ordered(test: unittest.TestCase, text: str, *fragments: str) -> None:
    positions = [text.find(fragment) for fragment in fragments]
    test.assertTrue(
        all(position >= 0 for position in positions),
        f"missing ordered source contract fragment: {fragments}",
    )
    test.assertEqual(positions, sorted(positions), f"source fragments out of order: {fragments}")


class NativeFxV15SourceContract(unittest.TestCase):
    def test_all_v15_readers_use_exact_append_only_extent(self):
        for name in ("ccecl.asm", "ccflow.asm", "ccfp.asm"):
            with self.subTest(name=name):
                text = source(name)
                if name == "ccecl.asm":
                    require(self, text, "menu_text_cap equ 128")
                    require(self, text, "fx_v14_len equ mt_data_off + menu_text_cap")
                else:
                    require(self, text, "fx_v14_len equ mt_data_off + 128")
                require(self, text, "gbrf_magic_off equ fx_v14_len")
                require(self, text, "gbrf_flags_off equ gbrf_magic_off + 4")
                require(self, text, "gbrf_reserved_off equ gbrf_flags_off + 6")
                require(self, text, "fx_v15_len equ gbrf_reserved_off + 2")

        host = source("cchost.asm")
        require(self, host, "gbef_v14_len equ 5920")
        require(self, host, "gbef_v15_len equ 5932")
        require(self, host, "gbef_v15_flags_off equ gbef_v14_len+4")
        require(self, host, "gbef_v15_reserved_off equ gbef_v15_flags_off+6")

    def test_ccecl_ack_is_identity_bound_and_restores_raw_flags(self):
        text = source("ccecl.asm")
        for fragment in (
            "read_resume_ack:",
            "cmp word [rbuf+8], 2",
            "cmp word [rbuf+mn_flags_off], 2",
            "cmp word [rbuf+mn_dest_off], 0ffffh",
            "cmp word [rbuf+mn_count_off], 1",
            "cmp word [rbuf+mn_opcode_off], 001dh",
            "mov ax, [rbuf+rs_pc_off] cmp ax, [rbuf+mn_id_pc_off] jne .err",
            "cmp word [outbuf+4], 2",
            "cmp word [outbuf+6], 1",
            "cmp word [outbuf+8], 1",
            "mov si, rbuf+gbrf_flags_off",
            "rep movsb",
            "cmp byte [resume_kind], 5",
            "call consume_menu_outcome",
        ):
            with self.subTest(fragment=fragment):
                require(self, text, fragment)
    def test_ccflow_preserves_v15_replay_and_final_sidecar_identity(self):
        text = source("ccflow.asm")
        for fragment in (
            "cmp word [fxbuf+4], 15",
            "cmp word [fxlen], fx_v15_len",
            "cmp ax, 4",
            "cmp ax, 2",
            "call validate_v15_capacity",
            "call validate_v15_ack",
            "call validate_v15_final_sidecar",
            "mov cx, fx_v15_len",
            "cmp word [fxbuf+bx], 001dh",
            "cmp word [fxbuf+bx+2], 0",
            "mov ax, [fxbuf+mn_event_off]",
            "cmp ax, [di]",
            "test word [fxbuf+6], fx_have_sidecar",
        ):
            with self.subTest(fragment=fragment):
                require(self, text, fragment)
        for fragment in (
            "test word [fxbuf+6], fx_have_sidecar",
            "cmp dword [fxbuf+ms_magic_off], 'gbms'",
            ".menu_zero:",
            ".text_zero:",
        ):
            with self.subTest(fragment=fragment):
                require(self, text, fragment)

    def test_ccfp_has_separate_validated_acknowledgement_ui(self):
        text = source("ccfp.asm")
        for fragment in (
            "gbmo_len equ 18",
            ".ack_start:",
            "call validate_ack_effect",
            "cmp word [loadbuf+8], 2",
            "cmp word [loadbuf+mn_opcode_off], 001dh",
            "mov ax, [loadbuf+rs_pc_off] cmp ax, [loadbuf+mn_id_pc_off] jne .bad",
            "cmp byte [sidecar_active], 1",
            "cmp dl, 'p'",
            "cmp al, 13",
            "call probe_ack_mouse",
            "probe_ack_mouse:",
            "cmp ax, 0ffffh",
            "mov ax, 0002h",
            "mov ax, 0001h",
            "int 33h",
            "call write_ack_outcome",
            "call cleanup_ack_row",
        ):
            with self.subTest(fragment=fragment):
                require(self, text, fragment)

    def test_ack_readers_bind_the_yielded_pc_instead_of_a_retail_fixture_offset(self):
        for name, start, end, buffer, failure in (
            ("ccecl.asm", "read_resume_ack:", "read_persistent_state:", "rbuf", ".err"),
            ("ccflow.asm", "validate_v15_ack:", "validate_v15_menu:", "fxbuf", ".bad"),
            ("ccfp.asm", "validate_ack_effect:", "validate_pending_menu:", "loadbuf", ".bad"),
        ):
            with self.subTest(name=name):
                text = source(name)
                validator = text[text.index(start):text.index(end)]
                require(self, validator,
                        f"mov ax, [{buffer}+rs_pc_off] "
                        f"cmp ax, [{buffer}+mn_id_pc_off] jne {failure}")
                self.assertNotIn("223", validator)

    def test_resume_bounds_precede_one_shot_ack_consumption(self):
        text = source("ccecl.asm")
        apply = text[text.index("apply_resume_state:"):text.index("restore_fx_prefix:")]
        require_ordered(
            self, apply,
            "mov ax, [rbuf+rs_pc_off]",
            "cmp ax, [hdrlen] jb .err",
            "cmp ax, [blklen] ja .err",
            "cmp byte [resume_kind], 5 jne .combat_flags call consume_menu_outcome",
        )

    def test_ccfp_presents_sidecar_party_and_numeric_pending_menus(self):
        text = source("ccfp.asm")
        for fragment in (
            "cmp byte [pending_menu], 0",
            "call validate_pending_menu",
            "cmp word [loadbuf+mn_opcode_off], 0022h",
            "cmp word [loadbuf+mn_opcode_off], 000fh",
            "cmp si, mt_data_off+menu_text_cap-8",
            "mov cx, sx_event_bytes/2",
            "loop .compare_event",
            "call show_pending_menu",
            "call write_pending_outcome",
            "call parse_menu_number",
            "cmp byte [pending_menu], 0",
            "cmp al, 'y'",
            "cmp al, 'n'",
            "mov ax, [loadbuf+mn_id_pc_off]",
            "mov ax, [loadbuf+mn_id_area_off]",
            "mov ax, [loadbuf+mn_id_dest_off]",
            "mov ax, [loadbuf+mn_id_opcode_off]",
        ):
            with self.subTest(fragment=fragment):
                require(self, text, fragment)

    def test_ccfp_numeric_destination_uses_operand_two(self):
        text = source("ccfp.asm")
        validator = text[
            text.index("validate_pending_menu:"):text.index("show_pending_menu:")
        ]
        require_ordered(
            self,
            validator,
            "cmp word [si+2], 2",
            "mov ax, [si+6]",
            "cmp ax, [loadbuf+mn_dest_off]",
        )
        self.assertNotIn(
            "mov ax, [si+4] cmp ax, [loadbuf+mn_dest_off]",
            validator,
            "operand 1 is prompt metadata, not the INPUT_NUMBER destination",
        )
        numeric = validator[validator.index("cmp word [loadbuf+mn_opcode_off], 000fh"):validator.index(".party:")]
        require(self, numeric, "cmp word [loadbuf+mn_count_off], 0 jne .bad")

    def test_ccmenu_numeric_uses_destination_operand_and_free_word_count(self):
        text = source("ccmenu.asm")
        numeric = text[text.index(".number:"):text.index(".string:")]
        require_ordered(
            self, numeric,
            "cmp word [si+2], 2 jne .bad",
            "cmp word [menu_count], 0 jne .bad",
            "mov ax, [si+6] cmp ax, [fxbuf+mn_dest_off] jne .bad",
            "call validate_menu_text jc .bad clc ret",
        )
        self.assertNotIn("[si+4]", numeric)
        self.assertNotIn("jmp .count", numeric)

    def test_menu_identity_matches_actual_resume_state_before_consumption(self):
        for name, label, buffer, failure, boundary in (
            ("ccecl.asm", "read_resume_menu:", "rbuf", ".err", "read_resume_ack:"),
            ("ccmenu.asm", "validate_effect:", "fxbuf", ".bad", "validate_menu_text:"),
            ("ccfp.asm", "validate_pending_menu:", "loadbuf", ".bad", "show_pending_menu:"),
        ):
            with self.subTest(name=name):
                text = source(name)
                validator = text[text.index(label):text.index(boundary)]
                for actual, identity in (
                    ("rs_pc_off", "mn_id_pc_off"),
                    ("rs_area_off", "mn_id_area_off"),
                    ("mn_dest_off", "mn_id_dest_off"),
                    ("mn_opcode_off", "mn_id_opcode_off"),
                ):
                    require(self, validator,
                            f"mov ax, [{buffer}+{actual}] cmp ax, [{buffer}+{identity}] jne {failure}")

    def test_numeric_keyboard_buffers_leave_room_for_carriage_return(self):
        # AH=0Ah needs five unsigned-word digits plus the terminating CR.
        # The DOS runtime boundary controls live in the complete menu harnesses.
        fp = source("ccfp.asm")
        reader = fp[fp.index("show_pending_menu:"):fp.index("save_pending_prompt:")]
        require(self, reader, "mov byte [menu_input], 6 mov byte [menu_input+1], 0 mov dx, menu_input mov ah, 0ah int 21h")
        self.assert_numeric_menu_input(source("ccmenu.asm"))
        require(self, source("ccfp.asm"), "menu_input db 6,0,6 dup(0)")

    def assert_numeric_menu_input(self, text):
        choice = text[text.index("read_player_choice:"):text.index("read_player_text:")]
        require(self, choice, "mov byte [inputbuf], 6 mov byte [inputbuf+1], 0 mov dx, inputbuf call read_input_line")
        reader = text[text.index("read_input_line:"):text.index("normalize_input:")]
        require(self, reader, "test dl, 80h jz .file mov dx, si mov ah, 0ah int 21h")
        require(self, reader, "movzx bp, byte [si] dec bp")
        require(self, reader, "cmp al, 13 je .eol cmp di, bp jae .overflow")
        require(self, reader, ".overflow: mov byte [input_overflow], 1 jmp .next")
        require(self, reader, "cmp byte [input_overflow], 0 je .count inc ax")

    def test_numeric_menu_input_rejects_capacity_cr_and_overflow_mutations(self):
        text = source("ccmenu.asm")
        self.assert_numeric_menu_input(text)
        for old, new in (("mov byte [inputbuf], 6", "mov byte [inputbuf], 5"),
                         ("cmp al, 13 je .eol", "cmp al, 10 je .eol"),
                         ("cmp di, bp jae .overflow", "cmp di, bp ja .overflow")):
            mutated = text.replace(old, new, 1)
            self.assertNotEqual(mutated, text)
            with self.assertRaises(AssertionError):
                self.assert_numeric_menu_input(mutated)

    def test_ccfp_preserves_and_redraws_pending_prompt_before_choices(self):
        text = source("ccfp.asm")
        require_ordered(
            self,
            text,
            "call save_pending_prompt",
            ".menu_start:",
            "mov ax, 0003h int 10h call show_pending_menu",
        )

        menu = text[
            text.index("show_pending_menu:"):text.index("save_pending_prompt:")
        ]
        require_ordered(
            self,
            menu,
            "show_pending_menu:",
            "call print_pending_prompt",
            "cmp word [loadbuf+mn_opcode_off], 0022h",
            "mov dx, s_number_input",
        )
        party = menu[menu.index(".party:"):]
        require_ordered(
            self,
            party,
            "mov dx, s_party_choice",
            "cmp byte [pending_prompt_len], 0",
            "call print_pending_label",
            ".party_prompt_shown:",
            "mov dx, s_yes_label",
        )

    def test_host_and_boot_admit_only_typed_v15_paths(self):
        host = source("cchost_damage.inc")
        journal = source("cchost_damage_journal.inc")
        boot = source("gbboot.asm")
        ef_dump = source("ccefx.asm")

        for fragment in (
            "validate_damage_v15_terminal:",
            "cmp ax,gbef_v15_len",
            "cmp ax,2",
            "test ax,0fefeh",
            "validate_damage_v15_capacity:",
            "cmp ax,4",
            "test ax,fx_have_sidecar",
        ):
            with self.subTest(fragment=fragment):
                require(self, host, fragment)
        for fragment in (
            "cmp word [damage_journal_payload+8],2",
            "cmp dword [damage_journal_payload],'gbrf'",
        ):
            with self.subTest(fragment=fragment):
                require(self, journal, fragment)

        require(self, ef_dump, "cmp ax, 15")
        require(self, boot, "cmp word [fxbuf+8], 2")
        require(self, boot, "cmp ax, 15")
        require(self, boot, "mov si, s_ccfp")
        require(self, boot, "mov si, s_ccflow")
        lines = code_lines(SRC / "gbboot.asm")
        resume_lines = block(lines, ".resume_combat_effect:", ".combat_effect_geo:")
        assert_ccflow_transport(self, resume_lines, "call build_ecl_resume_tail")


if __name__ == "__main__":
    unittest.main()
