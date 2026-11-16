apply_effect_damage_roster:
        mov     word [damage_ack], 0
        cmp     word [gamep], game_cok
        je      .run
        cmp     word [gamep], game_pool
        je      .run
        cmp     word [gamep], game_curse
        je      .run
        cmp     word [gamep], game_secret
        je      .run
        cmp     word [gamep], game_gateway
        je      .run
        cmp     word [gamep], game_treasures
        je      .run
        cmp     word [gamep], game_pod
        je      .run
        cmp     word [gamep], game_nwn
        je      .run
        cmp     word [gamep], game_buck
        je      .run
        cmp     word [gamep], game_matrix
        je      .run
        cmp     word [gamep], game_gen1
        je      .run
        cmp     word [gamep], game_dok
        je      .run
        cmp     word [gamep], game_dqk
        jne     .ok
.run:
        mov     ax, 3D00h
        mov     dx, [effectreadp]
        int     21h
        jc      .fail
        mov     [efxfh], ax
        mov     bx, [efxfh]
        xor     dx, dx
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'GB'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, 2
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'EF'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, 4
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 9
        je      .v9_terminal
        ; CCECL's resumable v14 record retains the stable v9 GBSX prefix and
        ; appends menu/checkpoint state. It is valid only as a fixed direct
        ; effect: sidecar provenance remains exclusive to exact v9 terminals.
        cmp     ax, 14
        je      .v14_terminal
        cmp     ax, 15
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, 8
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 4
        je      .v15_capacity
        cmp     ax, 2
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, GBEF_MN_OPCODE_OFF
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 001dh
        je      .v15_ack
        call    validate_damage_v15_menu
        jc      .close_fail
        mov     bx, [efxfh]
        mov     dx, 6
        call    read_effect_word_at
        jc      .close_fail
        test    ax, FX_HAVE_SIDECAR
        jnz     .sidecar
        jmp     .fixed
.v15_ack:
        call    validate_damage_v15_terminal
        jc      .close_fail
        jmp     .sidecar
.v15_capacity:
        mov     byte [damage_loop_record], 0
        call    validate_damage_v15_capacity
        jc      .close_fail
        cmp     byte [damage_loop_record], 0
        je      .fixed
        ; CCFLOW's loop record (status 4 + GBSL, GBHD reason 10) is a
        ; non-terminal source.  The journal producer only models DoK, so a
        ; loop record is never journalled.
        cmp     byte [damage_journal_mode], 0
        jne     .close_fail
        jmp     .sidecar
.v14_terminal:
        mov     bx, [efxfh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_fail
        or      dx, dx
        jne     .close_fail
        cmp     ax, 5920
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, 6
        call    read_effect_word_at
        jc      .close_fail
        test    ax, FX_HAVE_SIDECAR
        jnz     .close_fail
        jmp     .fixed
.v9_terminal:
        ; The sidecar flag is meaningful only on CCFLOW's fixed v9 terminal
        ; envelope.  Reject a short, trailing, or future-shaped effect before
        ; deriving/opening its sibling or touching a roster.
        mov     bx, [efxfh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_fail
        or      dx, dx
        jne     .close_fail
        cmp     ax, GBEF_V9_LEN
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, 6
        call    read_effect_word_at
        jc      .close_fail
        test    ax, FX_HAVE_SIDECAR
        jnz     .sidecar
.fixed:
        mov     bx, [efxfh]
        mov     dx, GBEF_SCRIPT_MAGIC_OFF
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'GB'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, GBEF_SCRIPT_MAGIC_OFF+2
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'SX'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, GBEF_SCRIPT_COUNT_OFF
        call    read_effect_word_at
        jc      .close_fail
        ; Accept up to GBEF_SCRIPT_CAP events -- the SAME constant the whole
        ; GBSX buffer layout above is derived from (GBEF_SCRIPT_BYTES,
        ; GBEF_SCRIPT_TEXT_OFF, GBEF_SETUP_OFF all scale by it). This was a
        ; separate GBEF_SCRIPT_EVENT_MAX equ 16 with exactly one use, this
        ; compare, so a GBSX declaring 17..64 events was rejected even though
        ; every buffer it feeds was already sized for 64 and the scan below
        ; streams straight out of the file with no fixed-size array of its
        ; own. Deleted rather than raised: a second constant can drift from
        ; the buffer that justifies it, and this one had. Zero byte cost --
        ; 16 and 64 both assemble to the 3-byte 83 F8 ib form.
        cmp     ax, GBEF_SCRIPT_CAP
        ja      .close_fail
        mov     [damage_event_count], ax
        mov     word [damage_event_base], GBEF_SCRIPT_EVENTS_OFF
        mov     word [damage_event_stride], GBEF_SCRIPT_EVENT_SIZE
        jmp     .scan_start
.sidecar:
        ; The GBEF terminal buffer is only a continuation bridge.  CCFLOW has
        ; already moved the complete ordered stream into the same-stem GBSL
        ; sibling, so validate that file before any roster record can be opened.
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        jc      .fail
        call    make_damage_side_name
        jc      .fail
        mov     ax, 3D00h
        mov     dx, sidepath
        int     21h
        jc      .fail
        mov     [efxfh], ax
        mov     bx, ax
        xor     dx, dx
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'GB'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, 2
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'SL'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, 4
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 1
        je      .side_version_ok
        cmp     ax, 2
        jne     .close_fail
.side_version_ok:
        mov     [damage_side_version], ax
        mov     bx, [efxfh]
        mov     dx, 6
        call    read_effect_word_at
        jc      .close_fail
        or      ax, ax
        jz      .close_fail
        ; Rows are addressed through the 32-bit damage_event_off (8+index*54
        ; via dx:ax), so a v1 sidecar may hold any u16 row count -- CCFLOW's
        ; side_count is a u16 and its v1 stream is "arbitrary u16 record
        ; count, including >64 KiB extents" (ccflow.asm finalize_sidecar).
        ; Max v1 extent = 8+65535*54 = 3,538,898 bytes, checked exactly below.
        ; A v2 sidecar keeps CCFLOW's SIDE_MAX_RECORDS = 1213 (u16 extents).
        mov     [damage_event_count], ax
        cmp     word [damage_side_version], 2
        je      .side_v2
        mov     bx, 54
        mul     bx
        add     ax, 8
        adc     dx, 0
        mov     [side_len_lo], ax
        mov     [side_len_hi], dx
        mov     bx, [efxfh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_fail
        cmp     dx, [side_len_hi]
        jne     .close_fail
        cmp     ax, [side_len_lo]
        jne     .close_fail
        jmp     .side_ready
.side_v2:
        cmp     word [damage_event_count], 1213
        ja      .close_fail
        mov     bx, [efxfh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_fail
        or      dx, dx
        jnz     .close_fail
        mov     [side_len_lo], ax
        mov     word [side_len_hi], 0
        mov     [v2_extent], ax
        mov     ax, [efxfh]
        mov     [v2_fh], ax
        mov     word [v2_base], 0
        call    validate_gbsl_v2
        jc      .close_fail
        mov     ax, [v2_count]
        cmp     ax, [damage_event_count]
        jne     .close_fail
.side_ready:
        mov     word [damage_event_base], 8
        mov     word [damage_event_stride], 54
.scan_start:
        ; Decode every supported DAMAGE once without writes.  A later event's
        ; missing source must fail before an earlier selected member changes.
        mov     word [damage_preflight], 1
        mov     word [damage_event_index], 0
        mov     word [damage_journal_mask], 0
.scan:
        mov     ax, [damage_event_index]
        cmp     ax, [damage_event_count]
        jae     .scan_done
        mov     bx, [damage_event_stride]
        mul     bx
        add     ax, [damage_event_base]
        adc     dx, 0
        mov     [damage_event_off], ax
        mov     [damage_event_off+2], dx
        mov     bx, [efxfh]
        xor     ax, ax
        call    read_event_word
        jc      .close_fail
        cmp     ax, 002Eh
        jne     .next
        mov     bx, [efxfh]
        mov     ax, 2
        call    read_event_word
        jc      .close_fail
        mov     [damage_argc], ax
        cmp     ax, 5
        jb      .next
        mov     bx, [efxfh]
        mov     ax, 4
        call    read_event_word
        jc      .close_fail
        mov     [damage_control], ax
        mov     word [damage_target_member], 0
        and     ax, 00E0h
        cmp     ax, 00E0h
        je      .policy_ok
        mov     ax, [damage_control]
        test    ax, 0080h
        jz      .next
        test    ax, 0040h
        jnz     .next
        cmp     word [damage_argc], 7
        jb      .next
        mov     bx, [efxfh]
        mov     ax, 12
        call    read_event_word
        jc      .close_fail
        test    ax, 0080h
        jz      .next
        test    ax, 0007h
        jnz     .next
        mov     bx, [efxfh]
        mov     ax, 14
        call    read_event_word
        jc      .close_fail
        or      ax, ax
        jz      .next
        mov     bx, [efxfh]
        mov     ax, 16
        call    read_event_word
        jc      .close_fail
        or      ax, ax
        jz      .next
        mov     [damage_target_member], ax
.policy_ok:
        mov     bx, [efxfh]
        mov     ax, 6
        call    read_event_word
        jc      .close_fail
        mov     [damage_count], ax
        mov     bx, [efxfh]
        mov     ax, 8
        call    read_event_word
        jc      .close_fail
        mov     [damage_sides], ax
        mov     bx, [efxfh]
        mov     ax, 10
        call    read_event_word
        jc      .close_fail
        mov     [damage_bonus], ax
        mov     ax, [damage_count]
        mul     word [damage_sides]
        or      dx, dx
        jz      .mul_ok
        mov     ax, 0FFFFh
.mul_ok:
        add     ax, [damage_bonus]
        jnc     .sum_ok
        mov     ax, 0FFFFh
.sum_ok:
        or      ax, ax
        jz      .next
        mov     [damage_value], ax
        ; GBDJ mask note (plan step 7a): accumulate which roster ordinals
        ; this run's DAMAGE events target, unconditionally and only once
        ; per event -- during the read-only preflight pass, before the real
        ; member count is necessarily known. damage_journal_produce filters
        ; this raw mask against damage_roster_count once that count is
        ; final, at .scan_done.
        cmp     word [damage_preflight], 0
        je      .mask_note_done
        mov     ax, [damage_target_member]
        or      ax, ax
        jnz     .mask_note_specific
        mov     ax, 003Fh
        jmp     .mask_note_apply
.mask_note_specific:
        ; D5 (defect list plan §15.3, direct-damage-journal-v1.md item D5):
        ; DOSBox's 386+ core masks the shift count to 5 bits, so a target
        ; above 6 (e.g. the ECL sentinel 33/34) could alias back onto a real
        ; low bit here. A target beyond the compact roster's 6 slots never
        ; contributes to the mask at all.
        cmp     ax, 8
        ja      .mask_note_done
        dec     ax
        mov     cl, al
        mov     ax, 1
        shl     ax, cl
.mask_note_apply:
        or      [damage_journal_mask], ax
.mask_note_done:
        call    apply_damage_value_to_roster
        jc      .close_fail
%ifdef CCHOST_TEST_GBDJ_D_CRASH
%if CCHOST_TEST_GBDJ_D_CRASH = 5
        cmp     byte [damage_journal_mode], 0
        je      .no_crash5
        cmp     word [damage_preflight], 0
        jne     .no_crash5
        cmp     byte [damage_journal_hook_fired], 0
        jne     .no_crash5
        mov     byte [damage_journal_hook_fired], 1
        mov     ax,4C07h
        int     21h
.no_crash5:
%endif
%endif
.next:
        inc     word [damage_event_index]
        jmp     .scan
.scan_done:
        cmp     word [damage_preflight], 0
        je      .publish
        cmp     byte [damage_journal_mode], 0
        je      .scan_reset
        call    damage_journal_produce
        jc      .close_fail
.scan_reset:
        mov     word [damage_preflight], 0
        mov     word [damage_event_index], 0
        jmp     .scan
.publish:
        push    ax
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        jc      .fail
        mov     [damage_ack], ax
.ok:
        clc
        ret
.close_fail:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret

; Replace only the final extension. A sidecar flag is an exact sibling contract,
; never permission to read a stale process-global filename.
make_damage_side_name:
        mov     si, effectpath
        mov     di, sidepath
        mov     cx, PATH_MAX
        xor     bx, bx
.copy:
        jcxz    .bad
        lodsb
        stosb
        dec     cx
        or      al, al
        jz      .end
        cmp     al, '.'
        jne     .separator
        mov     bx, di
        dec     bx
.separator:
        cmp     al, 5Ch
        je      .reset
        cmp     al, '/'
        je      .reset
        cmp     al, ':'
        jne     .copy
.reset:
        xor     bx, bx
        jmp     .copy
.end:
        or      bx, bx
        jz      .bad
        cmp     bx, sidepath + PATH_MAX - 5
        ja      .bad
        mov     byte [bx+1], 'G'
        mov     byte [bx+2], 'B'
        mov     byte [bx+3], 'S'
        mov     byte [bx+4], 0
        clc
        ret
.bad:
        stc
        ret

apply_damage_value_to_roster:
        cmp     word [damage_preflight], 0
        je      .open_write
        mov     ax, 3D00h
        jmp     .open
.open_write:
        mov     ax, 3D02h
.open:
        mov     dx, rosterpath
        int     21h
        jc      .fail
        mov     [gbcr_roster_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, rosterhdr
        int     21h
        jc      .close_fail
        cmp     ax, 16
        jne     .close_fail
        cmp     word [rosterhdr], 'GB'
        jne     .close_fail
        cmp     word [rosterhdr+2], 'PR'
        jne     .close_fail
        mov     ax,[rosterhdr+4]
        cmp     ax,GBPR_VERSION_V1
        je      .legacy
        cmp     ax,GBPR_VERSION_V2
        jne     .close_fail
        cmp     word [rosterhdr+14],1
        jne     .close_fail
        mov     ax,[rosterhdr+12]
        cmp     ax,GBPR_ID_COK
        je      .v2_cok
        cmp     ax,GBPR_ID_DOK
        je      .v2_compact
        cmp     ax,GBPR_ID_DQK
        jne     .close_fail
.v2_compact:
        cmp     word [rosterhdr+10],GBPR_COMPACT_FLAG
        jne     .close_fail
        jmp     short .identity_ok
.v2_cok:
        cmp     word [rosterhdr+10],0
        jne     .close_fail
        jmp     short .identity_ok
.legacy:
        ; V1 compact cannot authorize title-specific HP/condition mutation.
        cmp     word [rosterhdr+10],0
        jne     .close_fail
        cmp     dword [rosterhdr+12],0
        jne     .close_fail
.identity_ok:
        ; A loop-marked record (GBHD reason 10) may only update a DQK roster.
        cmp     byte [damage_loop_record], 0
        je      .not_loop
        cmp     word [rosterhdr+12], GBPR_ID_DQK
        jne     .close_fail
.not_loop:
        cmp     word [rosterhdr+8], 410
        jne     .close_fail
        mov     ax, [rosterhdr+6]
        cmp     ax, 8
        ja      .close_fail
        mov     [damage_roster_count], ax
        ; Validate the whole writable roster before preflighting sources or
        ; touching the first member.  A later truncated record, trailing data,
        ; or malformed DoK GBD1 marker must not leave earlier HP changed.
        call    validate_roster_body
        jc      .close_fail
        cmp     word [damage_preflight], 0
        je      .write
        ; A direct DoK DAMAGE has two authoritative stores: the compact GBPR
        ; cache and each low-numbered retail CHRDATA#.GAM source.  Prove every
        ; targeted source is complete before the first GBPR HP/flag write.  The
        ; later mutation path remains responsible for a recoverable journal,
        ; but a missing or truncated later slot must not leave earlier slots
        ; changed merely because it was encountered after them.
        cmp     word [rosterhdr+12],GBPR_ID_DOK
        jne     .close_ok
        call    preflight_dok_damage_sources
        jc      .close_fail
        jmp     .close_ok
.write:
.sources_ready:
        mov     word [gbcr_index], 0
.loop:
        mov     ax, [gbcr_index]
        cmp     ax, [damage_roster_count]
        jae     .close_ok
        mov     bx, 410
        mul     bx
        add     ax, 16
        mov     [gbcr_entry_off], ax
        mov     ax, [damage_target_member]
        or      ax, ax
        jz      .patch_current
        mov     bx, [gbcr_index]
        inc     bx
        cmp     ax, bx
        jne     .next
.patch_current:
        mov     dx, [gbcr_entry_off]
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, gbcr_slot
        int     21h
        jc      .close_fail
        cmp     ax, 1
        jne     .close_fail
        test    word [rosterhdr+10], 1
        jnz     .dok_patch
        mov     ax, [gbcr_entry_off]
        add     ax, 1+407              ; CoK current HP; preserve maximum at 98
        mov     [damage_hp_off], ax
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, gbcr_hp_byte
        int     21h
        jc      .close_fail
        cmp     ax, 1
        jne     .close_fail
        xor     ax, ax
        mov     al, [gbcr_hp_byte]
        cmp     ax, [damage_value]
        ja      .cok_sub
        xor     ax, ax
        jmp     .cok_store
.cok_sub:
        sub     ax, [damage_value]
.cok_store:
        mov     [gbcr_hp], ax
        mov     [gbcr_hp_byte], al
        mov     dx, [damage_hp_off]
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 1
        mov     dx, gbcr_hp_byte
        int     21h
        jc      .close_fail
        cmp     ax, 1
        jne     .close_fail
        mov     word [gbcr_xp_share], 0
        call    write_cok_save_result
        jc      .close_fail
        jmp     .next
.dok_patch:
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 4
        mov     dx, gbcr_magic
        int     21h
        jc      .close_fail
        cmp     ax, 4
        jne     .close_fail
        cmp     word [gbcr_magic], 'GB'
        jne     .close_fail
        cmp     word [gbcr_magic+2], 'D1'
        jne     .close_fail
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+6
        mov     [damage_hp_off], ax
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 2
        mov     dx, gbcr_hp
        int     21h
        jc      .close_fail
        cmp     ax, 2
        jne     .close_fail
        mov     ax, [gbcr_hp]
        cmp     ax, [damage_value]
        ja      .dok_sub
        xor     ax, ax
        jmp     .dok_store
.dok_sub:
        sub     ax, [damage_value]
.dok_store:
        mov     [gbcr_hp], ax
        mov     dx, [damage_hp_off]
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, gbcr_hp
        int     21h
        jc      .close_fail
        cmp     ax, 2
        jne     .close_fail
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+4
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 2
        mov     dx, gbcr_meta_flags
        int     21h
        jc      .close_fail
        cmp     ax, 2
        jne     .close_fail
        or      word [gbcr_meta_flags], 2
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+4
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, gbcr_meta_flags
        int     21h
        jc      .close_fail
        cmp     ax, 2
        jne     .close_fail
%ifdef CCHOST_DIRECT_DAMAGE
        ; DoK's retail CHRDATA#.GAM is DoK-only.  A DQK compact row's slot is a
        ; QSV ordinal, not a DoK save slot: its only store is this GBD1 cache.
        cmp     word [rosterhdr+12], GBPR_ID_DOK
        jne     .next
%ifdef CCHOST_TEST_GBDJ_D_CRASH
%if CCHOST_TEST_GBDJ_D_CRASH = 4
        cmp     byte [damage_journal_mode], 0
        je      .no_crash4
        cmp     word [damage_preflight], 0
        jne     .no_crash4
        cmp     byte [damage_journal_hook_fired], 0
        jne     .no_crash4
        mov     byte [damage_journal_hook_fired], 1
        mov     ax,4C07h
        int     21h
.no_crash4:
%endif
%endif
        call    write_dok_save_damage
        jc      .close_fail
%endif
.next:
        inc     word [gbcr_index]
        jmp     .loop
.close_ok:
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Eh
        int     21h
        jc      .fail
.ok:
        clc
        ret
.close_fail:
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret

; Validate every compact DoK source slot selected by the current DAMAGE before
; apply_damage_value_to_roster writes any compact HP/condition field.  A high
; bit source slot is explicitly native-only; every other slot must be 1..6 and
; name one exact retail 216-byte record.
preflight_dok_damage_sources:
        cmp     word [rosterhdr+12],GBPR_ID_DOK
        jne     .fail
        mov     word [damage_preflight_index], 0
.loop:
        mov     ax, [damage_preflight_index]
        cmp     ax, [damage_roster_count]
        jae     .ok
        mov     bx, [damage_target_member]
        or      bx, bx
        jz      .selected
        mov     dx, ax
        inc     dx
        cmp     bx, dx
        jne     .next
.selected:
        mov     bx, 410
        mul     bx
        add     ax, 16
        mov     [damage_preflight_off], ax
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, gbcr_slot
        int     21h
        jc      .fail
        cmp     ax, 1
        jne     .fail
        mov     al, [gbcr_slot]
        test    al, 80h
        jnz     .next
        cmp     al, 1
        jb      .fail
        cmp     al, 6
        ja      .fail
        add     al, '0'
        mov     [doksavepath+12], al
        ; A readable but unwritable source is not valid: the write pass must
        ; never discover that after compact HP has already changed.
        mov     ax, 3D02h
%ifdef CCHOST_TEST_FAIL_DOK_SOURCE_PREFLIGHT
        ; Mutation control for the host harness: fail only when this remains a
        ; write-access preflight. Reverting to 3D00h makes the fixture apply
        ; damage, so it cannot pass by injecting an unconditional failure.
        cmp     ax, 3D02h
        jne     .test_source_open
        stc
        jmp     .fail
.test_source_open:
%endif
        mov     dx, doksavepath
        int     21h
        jc      .fail
        mov     [gbcr_save_fh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_fail
        or      dx, dx
        jne     .close_fail
        cmp     ax, DOK_CHAR_SIZE
        jne     .close_fail
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
        jc      .fail
.next:
        inc     word [damage_preflight_index]
        jmp     .loop
.close_fail:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret
.ok:
        clc
        ret


; Admit only the DoK v15 acknowledgement envelope at the live DAMAGE
; boundary. Its exact suffix and sidecar publication bit are checked before
; any GBSL or roster file is opened.
validate_damage_v15_terminal:
        mov     bx,[efxfh]
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .bad
        or      dx,dx
        jnz     .bad
        cmp     ax,GBEF_V15_LEN
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,8
        call    read_effect_word_at
        jc      .bad
        cmp     ax,2
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,6
        call    read_effect_word_at
        jc      .bad
        test    ax,FX_HAVE_SIDECAR
        jz      .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_V14_LEN
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'GB'
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_V14_LEN+2
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'RF'
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_V15_FLAGS_OFF
        call    read_effect_word_at
        jc      .bad
        test    ax,0FEFEh
        jnz     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_V15_FLAGS_OFF+2
        call    read_effect_word_at
        jc      .bad
        test    ax,0FEFEh
        jnz     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_V15_FLAGS_OFF+4
        call    read_effect_word_at
        jc      .bad
        test    ax,0FEFEh
        jnz     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_V15_RESERVED_OFF
        call    read_effect_word_at
        jc      .bad
        or      ax,ax
        jnz     .bad
        clc
        ret
.bad:   stc
        ret

; Validate a Gen2 interactive-menu v15 tail before CCHOST touches host state.
; CCFLOW validates the last GBSL row when FX_HAVE_SIDECAR is set; this helper
; checks the terminal identity, bounded event index, sidecar flag shape and
; raw-state suffix for both direct and accumulated menu yields.
validate_damage_v15_menu:
        mov     bx,[efxfh]
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .bad
        or      dx,dx
        jnz     .bad
        cmp     ax,GBEF_V15_LEN
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,8
        call    read_effect_word_at
        jc      .bad
        cmp     ax,2
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_V9_LEN
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'GB'
        jne     .bad
        mov     dx,GBEF_V9_LEN+2
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'MN'
        jne     .bad
        mov     dx,GBEF_V9_LEN+4
        call    read_effect_word_at
        jc      .bad
        cmp     ax,1
        je      .flags_ok
        cmp     ax,3
        jne     .bad
.flags_ok:
        mov     [damage_menu_flags],ax
        mov     dx,GBEF_MN_OPCODE_OFF
        call    read_effect_word_at
        jc      .bad
        mov     [damage_menu_opcode],ax
        cmp     ax,0022h
        jne     .ordinary_flags
        cmp     word [damage_menu_flags],3
        jne     .bad
        mov     dx,GBEF_V9_LEN+14
        call    read_effect_word_at
        jc      .bad
        test    ax,0fffch
        jnz     .bad
        jmp     .menu_identity
.ordinary_flags:
        cmp     word [damage_menu_flags],1
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_V9_LEN+14
        call    read_effect_word_at
        jc      .bad
        or      ax,ax
        jnz     .bad
.menu_identity:
        mov     bx,[efxfh]
        mov     dx,GBEF_V9_LEN+12
        call    read_effect_word_at
        jc      .bad
        mov     [damage_event_index],ax
        mov     bx,[efxfh]
        mov     dx,GBEF_SCRIPT_COUNT_OFF
        call    read_effect_word_at
        jc     .bad
        cmp     ax,1
        jb      .bad
        cmp     ax,GBEF_SCRIPT_CAP
        ja      .bad
        cmp     [damage_event_index],ax
        jae     .bad
        mov     ax,[damage_event_index]
        mov     cx,GBEF_SCRIPT_EVENT_SIZE
        mul     cx
        add     ax,GBEF_SCRIPT_EVENTS_OFF
        mov     dx,ax
        mov     bx,[efxfh]
        call    read_effect_word_at
        jc      .bad
        cmp     ax,[damage_menu_opcode]
        jne     .bad
        ; CCECL layout (same as validate_damage_v15_capacity/_terminal):
        ; GBRF magic at V14_LEN, three raw flag words, then the reserved word.
        ; This block used to read the magic at FLAGS_OFF (= V14_LEN+4) and a
        ; third flag word at V15_LEN, past EOF, so no real record could pass.
        mov     bx,[efxfh]
        mov     dx,GBEF_V14_LEN
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'GB'
        jne     .bad
        mov     dx,GBEF_V14_LEN+2
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'RF'
        jne     .bad
        mov     dx,GBEF_V15_FLAGS_OFF
        call    read_effect_word_at
        jc      .bad
        test    ax,0fefeh
        jnz     .bad
        mov     dx,GBEF_V15_FLAGS_OFF+2
        call    read_effect_word_at
        jc      .bad
        test    ax,0fefeh
        jnz     .bad
        mov     dx,GBEF_V15_FLAGS_OFF+4
        call    read_effect_word_at
        jc      .bad
        test    ax,0fefeh
        jnz     .bad
        mov     dx,GBEF_V15_RESERVED_OFF
        call    read_effect_word_at
        jc      .bad
        or      ax,ax
        jnz     .bad
        clc
        ret
.bad:   stc
        ret

; A direct Gen2 caller may publish the v15 capacity checkpoint before HLIB is
; routed through CCFLOW. Keep the existing fixed-event host path compatible,
; but admit only CCECL's exact status-4 envelope with canonical empty menu/text
; extensions and valid raw flags. This checkpoint is not a GBSL publication.
validate_damage_v15_capacity:
        mov     bx,[efxfh]
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .bad
        or      dx,dx
        jnz     .bad
        cmp     ax,GBEF_V15_LEN
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,6
        call    read_effect_word_at
        jc      .bad
        ; Sidecar <=> loop marker: FX_HAVE_SIDECAR is accepted only with GBHD
        ; reason 10, and reason 10 only with FX_HAVE_SIDECAR.
        mov     byte [damage_loop_record],0
        test    ax,FX_HAVE_SIDECAR
        jz      .no_side
        mov     byte [damage_loop_record],1
        mov     bx,[efxfh]
        mov     dx,GBEF_HD_MAGIC_OFF
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'GB'
        jne     .bad
        mov     dx,GBEF_HD_MAGIC_OFF+2
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'HD'
        jne     .bad
.no_side:
        mov     bx,[efxfh]
        mov     dx,GBEF_HD_REASON_OFF
        call    read_effect_word_at
        jc      .bad
        cmp     ax,GBHD_LOOP_DETECTED
        jne     .not_ten
        cmp     byte [damage_loop_record],0
        je      .bad
        jmp     short .reason_ok
.not_ten:
        cmp     byte [damage_loop_record],0
        jne     .bad
.reason_ok:
        mov     bx,[efxfh]
        mov     dx,8
        call    read_effect_word_at
        jc      .bad
        cmp     ax,4
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_V9_LEN
        mov     cx,12
.menu_zero:
        call    read_effect_word_at
        jc      .bad
        or      ax,ax
        jnz     .bad
        add     dx,2
        loop    .menu_zero
        mov     bx,[efxfh]
        mov     dx,GBEF_V11_LEN
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'GB'
        jne     .bad
        mov     dx,GBEF_V11_LEN+2
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'MS'
        jne     .bad
        mov     dx,GBEF_V11_LEN+10
        call    read_effect_word_at
        jc      .bad
        test    ax,0fffch
        jnz     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_MT_OFF
        mov     cx,(GBEF_V14_LEN-GBEF_MT_OFF)/2
.text_zero:
        call    read_effect_word_at
        jc      .bad
        or      ax,ax
        jnz     .bad
        add     dx,2
        loop    .text_zero
        mov     bx,[efxfh]
        ; CCECL's layout: GBRF magic at FX_V14_LEN, three raw flag words,
        ; then the reserved word.  (This block used to read the magic at
        ; FLAGS_OFF and a third flag word at FLAGS_OFF+8 == V15_LEN, so no real
        ; v15 record could ever pass.)
        mov     dx,GBEF_V14_LEN
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'GB'
        jne     .bad
        mov     dx,GBEF_V14_LEN+2
        call    read_effect_word_at
        jc      .bad
        cmp     ax,'RF'
        jne     .bad
        mov     dx,GBEF_V15_FLAGS_OFF
        call    read_effect_word_at
        jc      .bad
        test    ax,0fefeh
        jnz     .bad
        mov     dx,GBEF_V15_FLAGS_OFF+2
        call    read_effect_word_at
        jc      .bad
        test    ax,0fefeh
        jnz     .bad
        mov     dx,GBEF_V15_FLAGS_OFF+4
        call    read_effect_word_at
        jc      .bad
        test    ax,0fefeh
        jnz     .bad
        mov     dx,GBEF_V15_RESERVED_OFF
        call    read_effect_word_at
        jc      .bad
        or      ax,ax
        jnz     .bad
        clc
        ret
.bad:   stc
        ret

; AX = byte delta from the 32-bit damage_event_off; BX = handle.  Returns the
; word there (CF on error).  Clobbers CX and DX.
read_event_word:
 mov dx,[damage_event_off]
 mov cx,[damage_event_off+2]
 add dx,ax
 adc cx,0
 jmp short read_effect_word_at32

read_effect_word_at:
 ; Preserves CX and DX: the capacity validator's menu/text zero scans keep
 ; their loop counter and running offset across this call.  (It used to leave
 ; CX=2/DX=&damageword, so no real v15 record could pass those scans.)
 push cx
 xor cx,cx
 call read_effect_word_at32
 pop cx
 ret

; CX:DX = 32-bit file offset.  Preserves CX and DX.
read_effect_word_at32:
 push cx
 push dx
 mov ax,4200h
 int 21h
 jc .err
 mov ah,3fh
 mov cx,2
 mov dx,damageword
 int 21h
 jc .err
 cmp ax,2
 jne .err
 mov ax,[damageword]
 pop dx
 pop cx
 clc
 ret
.err: pop dx
 pop cx
 stc
 ret
