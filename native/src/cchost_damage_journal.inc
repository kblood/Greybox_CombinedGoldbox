; Direct-DAMAGE journal helpers.  This is intentionally separate from the
; GBTX combat-finalization machinery: GBDJ restores full raw DoK records.
; recover_damage_journal itself never deletes the journal; the only deletes
; are the producer's .GDN -> .GDJ replacement and damage_journal_retire
; (plan §22.5 J.2), which recover_damage calls after a successful PREPARED
; restore under /R.

; Shared by /R (recover_damage), /D's kind-4 auto-recovery, the COMMITTED
; peek and the producer self-verify. COMMITTED is a structurally-checked
; success (G1): the journal is the producer's exactly-once receipt, so a
; completed /D can never be rolled back by a later /R. A valid PREPARED
; journal is preflighted and restored (plan steps 5-6).
recover_damage_journal:
        mov     byte [damage_journal_committed],0
        mov     byte [damage_journal_preflight_bad],0
        mov     byte [damage_journal_restore_bad],0
        ; plan §22.5 J.1: damage_journal_absent is deliberately NOT reset here.
        ; Only recover_damage reads it, and /R calls this reader once per
        ; process; every other caller reaches it only after its own open of
        ; the same path succeeded. A reset was shown equivalent (7c.2 JC8).
        call    build_damage_journal_path
        jc      .bad
        mov     ax,3D00h
        mov     dx,journalpath
        int     21h
        jnc     .open_ok
        ; plan §22.5 J.1: AX = 2 means the .GDJ simply does not exist -- not
        ; damage. Flag it and fall into the ordinary .bad path; the caller
        ; (recover_damage) reports and exits 0 instead of failing closed.
        ; Any other open error stays an ordinary (result)/exit-1 failure.
        cmp     ax,2
        jne     .bad
        mov     byte [damage_journal_absent],1
        jmp     .bad
.open_ok:
        mov     [journal_fh],ax
        mov     bx,ax
        mov     ah,3Fh
        mov     cx,GBDJ_HEADER_LEN
        mov     dx,damage_journal_header
        int     21h
        jc      .close_bad
        cmp     ax,GBDJ_HEADER_LEN
        jne     .close_bad
        cmp     dword [damage_journal_header],'GBDJ'
        jne     .close_bad
        cmp     word [damage_journal_header+4],GBDJ_VERSION
        jne     .close_bad
        ; G1: state 0 is PREPARED, state 1 is COMMITTED. Any other value is
        ; invalid. COMMITTED skips only the token/generation check below; it
        ; still runs every other "all states" structural check.
        mov     ax,[damage_journal_header+6]
        cmp     ax,GBDJ_PREPARED
        je      .state_ok
        cmp     ax,GBDJ_COMMITTED
        jne     .close_bad
        mov     byte [damage_journal_committed],1
.state_ok:
        mov     ax,[damage_journal_header+8]
        or      ax,[damage_journal_header+10]
        or      ax,[damage_journal_header+12]
        or      ax,[damage_journal_header+14]
        jz      .close_bad
        cmp     word [damage_journal_header+16],GBDJ_COMPACT_FLAG
        jne     .close_bad
        cmp     word [damage_journal_header+30],0
        jne     .close_bad
        ; G5: a mask of 0 describes a journal that restores only the GBPR,
        ; which no write ever produces. Reject it regardless of state.
        mov     ax,[damage_journal_header+18]
        or      ax,ax
        jz      .close_bad
        ; D3: +32 (effect) and +256 (token) must be canonical absolute
        ; identities, not merely zero-padded. +144/+368 are proven identical
        ; to the validated /R command-line arguments instead, since those are
        ; already known-absolute.
        mov     si,damage_journal_header+32
        mov     cx,PATH_MAX
        call    damage_journal_validate_padded_path
        jc      .close_bad
        mov     si,damage_journal_header+32
        call    validate_absolute_path
        jc      .close_bad
        mov     si,damage_journal_header+144
        mov     di,rosterpath
        call    damage_journal_match_path
        jc      .close_bad
        mov     si,damage_journal_header+256
        mov     cx,PATH_MAX
        call    damage_journal_validate_padded_path
        jc      .close_bad
        mov     si,damage_journal_header+256
        call    validate_absolute_path
        jc      .close_bad
        ; Amendment B: +256 must be the ".DOP" sibling of +32, in every
        ; state. A journal naming a token that could never have been the
        ; producer's own auto-derived sibling is not this roster's journal.
        call    damage_journal_check_dop_sibling
        jc      .close_bad
        mov     si,damage_journal_header+368
        mov     di,damage_source_dir
        call    damage_journal_match_path
        jc      .close_bad
        ; COMMITTED never consults the token or the current effect/GBSL:
        ; after commit these may legitimately have advanced or been deleted.
        cmp     byte [damage_journal_committed],0
        jne     .skip_token
        mov     si,damage_journal_header+256
        mov     di,damage_tokenpath
        mov     cx,PATH_MAX
        rep     movsb
        call    validate_damage_token
        jc      .close_bad
        mov     si,damage_journal_header+8
        mov     di,damage_token_header+8
        mov     cx,4
.generation:
        mov     ax,[si]
        cmp     ax,[di]
        jne     .close_bad
        add     si,2
        add     di,2
        loop    .generation
.skip_token:
        mov     cx,[damage_journal_header+28]
        cmp     cx,16
        jb      .close_bad
        cmp     cx,3296
        ja      .close_bad
        mov     bx,[journal_fh]
        mov     ah,3Fh
        mov     dx,damage_journal_roster
        int     21h
        jc      .close_bad
        cmp     ax,[damage_journal_header+28]
        jne     .close_bad
        call    damage_journal_validate_roster
        jc      .close_bad
        mov     bx,[journal_fh]
        mov     ah,3Fh
        mov     cx,GBDJ_SOURCE_TABLE_LEN
        mov     dx,damage_journal_sources
        int     21h
        jc      .close_bad
        cmp     ax,GBDJ_SOURCE_TABLE_LEN
        jne     .close_bad
        call    damage_journal_validate_sources
        jc      .close_bad
        ; The retained payload begins after the variable-size preimage, not at
        ; GBDJ_DATA_OFF alone.  Keep the arithmetic in u32 and prove EOF is
        ; exactly the declared total before later stream comparisons use it.
        mov     ax,[damage_journal_header+28]
        xor     dx,dx
        add     ax,GBDJ_DATA_OFF
        adc     dx,0
        jc      .close_bad
        add     ax,[damage_journal_header+20]
        adc     dx,[damage_journal_header+22]
        jc      .close_bad
        add     ax,[damage_journal_header+24]
        adc     dx,[damage_journal_header+26]
        jc      .close_bad
        mov     [damage_journal_len_lo],ax
        mov     [damage_journal_len_hi],dx
        mov     ax,[damage_journal_header+20]
        mov     dx,[damage_journal_header+22]
        or      dx,dx
        jnz     .close_bad
        cmp     ax,5750
        je      .extent_ok
        cmp     ax,GBEF_V15_LEN
        je      .expect_v15
        cmp     ax,5920
        jne     .close_bad
        ; v14 always carries a zero GBSL extent (no sidecar); G5 below proves
        ; the retained effect's own flag word agrees.
        mov     ax,[damage_journal_header+24]
        or      ax,[damage_journal_header+26]
        jnz     .close_bad
        jmp     .extent_ok
.expect_v15:
        mov     ax,[damage_journal_header+24]
        or      ax,[damage_journal_header+26]
        jz      .close_bad
        mov     bx,[journal_fh]
        mov     ax,4200h
        xor     cx,cx
        mov     dx,[damage_journal_header+28]
        add     dx,GBDJ_DATA_OFF
        jc      .close_bad
        int     21h
        jc      .close_bad
        mov     bx,[journal_fh]
        mov     ah,3Fh
        mov     cx,10
        mov     dx,damage_journal_payload
        int     21h
        jc      .close_bad
        cmp     ax,10
        jne     .close_bad
        cmp     dword [damage_journal_payload],'GBEF'
        jne     .close_bad
        cmp     word [damage_journal_payload+4],15
        jne     .close_bad
        cmp     word [damage_journal_payload+8],2
        jne     .close_bad
.extent_ok:
        mov     bx,[journal_fh]
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .close_bad
        cmp     ax,[damage_journal_len_lo]
        jne     .close_bad
        cmp     dx,[damage_journal_len_hi]
        jne     .close_bad
        call    damage_journal_validate_g5
        jc      .close_bad
        cmp     byte [damage_journal_committed],0
        je      .g6_prepared
        ; G1: COMMITTED ends here. Every "all states" check has passed; the
        ; journal is the receipt, so this is a genuine success.
        mov     bx,[journal_fh]
        mov     ah,3Eh
        int     21h
        clc
        ret
.g6_prepared:
        call    damage_journal_validate_g6
        jc      .close_bad
        ; Every reader check, including G6's current-file comparison, has
        ; passed. Check-order rule 3 requires the journal closed before
        ; destination preflight opens anything, and no exit path below this
        ; point may close it a second time.
        mov     bx,[journal_fh]
        mov     ah,3Eh
        int     21h
        ; Producer self-verify (plan step 7a) wants exactly the structural
        ; checks above, including this one's G6 stream compare, and nothing
        ; else -- neither a real destination preflight nor a restore.
        cmp     byte [damage_journal_validate_only],0
        je      .not_validate_only
        clc
        ret
.not_validate_only:
        call    damage_journal_preflight
        jc      .preflight_failed
%ifdef CCHOST_TEST_GBDJ_ACCEPT_MARK
        ; Contract-fixture only: every reader check plus a real destination
        ; preflight (plan step 5) have passed. Print a distinct marker so a
        ; rejection fixture can be seen failing. The marker build is a dry
        ; run (plan step 6): it never restores, regardless of what the
        ; production build below does -- release every retained handle and
        ; fall into fail-closed.
        mov     dx,s_damage_journal_accept_mark
        call    puts
        call    damage_journal_preflight_close_all
        jmp     .bad
%else
        ; Production: restore (plan step 6). damage_journal_restore returns
        ; CF clear with every retained handle closed and reset to 0FFFFh on
        ; success, or CF set with the same closed/reset guarantee on a
        ; restore-phase failure.
        call    damage_journal_restore
        jc      .restore_failed
        clc
        ret
%endif
.preflight_failed:
        ; damage_journal_preflight has already closed every handle it opened.
        mov     byte [damage_journal_preflight_bad],1
        jmp     .bad
%ifndef CCHOST_TEST_GBDJ_ACCEPT_MARK
.restore_failed:
        ; damage_journal_restore has already closed every handle.
        mov     byte [damage_journal_restore_bad],1
        jmp     .bad
%endif
.close_bad:
        mov     bx,[journal_fh]
        mov     ah,3Eh
        int     21h
.bad:   stc
        ret

; plan §22.5 J.2: delete the PREPARED .GDJ after a successful restore, then
; prove it gone by re-opening it (requiring AX = 2 -- not merely CF set, so
; a delete masked by some other open failure is not mistaken for success).
; Returns CF clear on a verified retirement, CF set otherwise. Called only
; from recover_damage's .not_committed, after a real restore has already
; succeeded -- never from the producer's own kind-4 auto-recovery, whose
; rename onto .GDJ already replaces the journal, and never from
; recover_damage_journal itself.
damage_journal_retire:
        mov     byte [damage_journal_ext_gdn],0
        call    build_damage_journal_path
        jc      .path_bad
        mov     ah,41h
        mov     dx,journalpath
        int     21h
        ; DOSBox maps every host unlink failure to AX = 2 (§16.3), so the
        ; delete's own result is not trustworthy -- only the re-open below
        ; decides whether retirement happened.
        mov     ax,3D00h
        mov     dx,journalpath
        int     21h
        jc      .reopen_failed
        ; The file still opens: the delete did not take. Close the handle
        ; just opened, then report failure.
        mov     bx,ax
        mov     ah,3Eh
        int     21h
        jmp     .path_bad
.reopen_failed:
        cmp     ax,2
        jne     .path_bad
        clc
        ret
.path_bad:
        stc
        ret

; Destination preflight for a PREPARED GBDJ recovery (plan step 5). Called
; only after every reader check (including G6) has passed, and only once the
; caller has already closed [journal_fh] -- this routine never touches it.
; Opens every present destination read/write, proves its exact size, and
; rewinds it to offset 0, leaving the handle open for step 6's restore.
; Prints nothing and never exits: only recover_damage turns CF into a
; diagnostic and an exit code (the plan's binding constraint on steps 5-6).
;
; On success (CF clear): damage_restore_fh[0] is the roster's read/write
; handle, rewound to 0. damage_restore_fh[1+k] is present source-table
; ordinal k's handle (k = 0..5), also rewound to 0; an absent ordinal's slot
; stays 0FFFFh. On failure (CF set): every handle this call opened has
; already been closed and the whole table reset to 0FFFFh.
damage_journal_preflight:
        mov     cx,7
        mov     di,damage_restore_fh
.reset: mov     word [di],0FFFFh
        add     di,2
        loop    .reset
        ; The roster destination is the /R roster argument itself. Its size
        ; must equal the journal's own declared GBPR extent exactly.
        mov     ax,3D02h
        mov     dx,rosterpath
        int     21h
        jc      .fail
        mov     [damage_restore_fh],ax
        mov     bx,ax
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .fail
        or      dx,dx
        jnz     .fail
        cmp     ax,[damage_journal_header+28]
        jne     .fail
        mov     bx,[damage_restore_fh]
        mov     ax,4200h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .fail
        ; Present source entries, in table order (ordinal 0..5). Each
        ; destination is <damage_source_dir>\CHRDATA<slot>.GAM, built only
        ; from the validated /R save-directory argument and the entry's own
        ; slot byte (never the ordinal -- PM5's failure mode). Absent entries
        ; name no destination and are never opened (PM6's failure mode).
        mov     word [damage_restore_index],0
.entry: mov     ax,[damage_restore_index]
        cmp     ax,GBDJ_SOURCE_COUNT
        jae     .ok
        mov     bx,GBDJ_SOURCE_LEN
        mul     bx
        mov     si,damage_journal_sources
        add     si,ax
        cmp     byte [si],1
        jne     .next
        mov     al,[si+1]
        call    build_damage_restore_source_path
        jc      .fail
        mov     ax,3D02h
        mov     dx,damage_restore_path
        int     21h
        jc      .fail
        mov     di,[damage_restore_index]
        add     di,di
        add     di,damage_restore_fh+2
        mov     [di],ax
        mov     bx,ax
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .fail
        or      dx,dx
        jnz     .fail
        cmp     ax,216
        jne     .fail
        mov     di,[damage_restore_index]
        add     di,di
        add     di,damage_restore_fh+2
        mov     bx,[di]
        mov     ax,4200h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .fail
.next:  inc     word [damage_restore_index]
        jmp     .entry
.ok:    clc
        ret
.fail:  call    damage_journal_preflight_close_all
        stc
        ret

; Close and reset every handle damage_journal_preflight may have opened.
; Safe whether preflight failed (some slots may still be open), the caller is
; releasing a successful preflight's handles for the test-only accept-marker
; dry run (plan step 6 never runs in that build), or damage_journal_restore
; failed partway through (every handle it has not yet closed is still
; recorded here, so this closes the rest).
damage_journal_preflight_close_all:
        push    ax
        push    bx
        push    cx
        push    di
        mov     cx,7
        mov     di,damage_restore_fh
.loop:  cmp     word [di],0FFFFh
        je      .skip
        mov     bx,[di]
        mov     ah,3Eh
        int     21h
        mov     word [di],0FFFFh
.skip:  add     di,2
        loop    .loop
        pop     di
        pop     cx
        pop     bx
        pop     ax
        ret

; Restore (plan step 6, normative in the spec's "Restore" section). Called
; only from recover_damage_journal, only after damage_journal_preflight
; returns CF clear, and only when CCHOST_TEST_GBDJ_ACCEPT_MARK is not
; defined -- the marker build is a dry run and never restores. Every byte
; comes from memory (damage_journal_roster, damage_journal_sources); this
; never reopens or reads the journal, which is already closed by the time
; preflight runs (spec "Correction to item 1"). Prints nothing and never
; exits, except inside the test-only crash hooks below and in
; damage_journal_restore_unit.
;
; Units are pinned in order for testability, not for safety: unit 0 is the
; roster (the whole embedded GBPR preimage, damage_restore_fh[0]); units
; 1..n are the present source-table entries in ordinal order 0..5, each its
; raw 216-byte preimage at entry offset +2, through
; damage_restore_fh[1+ordinal]. Absent entries have no unit. Every unit is
; an idempotent overwrite of known bytes, so any interruption converges to
; the same result on a rerun.
;
; On success (CF clear): every retained handle has been closed and reset to
; 0FFFFh. On failure (CF set): the same closed/reset guarantee holds for
; every handle that was still open when the failure occurred.
damage_journal_restore:
        mov     byte [damage_restore_units_done],0
        ; Unit 0: the roster, in full, from the embedded GBPR preimage.
        mov     bx,[damage_restore_fh]
        mov     dx,damage_journal_roster
        mov     cx,[damage_journal_header+28]
        call    damage_journal_restore_unit
        jc      .fail
        ; Units 1..n: present source-table entries, in ordinal order. Offset
        ; 0 of an entry is its presence byte, offset 1 its slot byte, so the
        ; raw 216-byte preimage starts at offset +2.
        mov     word [damage_restore_index],0
.entry: mov     ax,[damage_restore_index]
        cmp     ax,GBDJ_SOURCE_COUNT
        jae     .allunits
        mov     bx,GBDJ_SOURCE_LEN
        mul     bx
        mov     si,damage_journal_sources
        add     si,ax
        cmp     byte [si],1
        jne     .next
        mov     di,[damage_restore_index]
        add     di,di
        add     di,damage_restore_fh+2
        mov     bx,[di]
        mov     dx,si
        add     dx,2
        mov     cx,216
        call    damage_journal_restore_unit
        jc      .fail
.next:  inc     word [damage_restore_index]
        jmp     .entry
.allunits:
        ; Every present unit has been written. damage_journal_restore_unit's
        ; own entry check covers CRASH_AT = 0..(total units - 1); this is the
        ; one explicit check for CRASH_AT = the total unit count, evaluated
        ; once, after the last unit and before the first close.
%ifdef CCHOST_TEST_GBDJ_CRASH_AT
        cmp     byte [damage_restore_units_done],CCHOST_TEST_GBDJ_CRASH_AT
        jne     .no_crash_at_all_units
        mov     ax,4C07h
        int     21h
.no_crash_at_all_units:
%endif
        ; Close every retained handle, checking CF. A close failure is a
        ; restore-phase failure, but the remaining slots are still closed
        ; (with the same unconditional walk) rather than left open.
        mov     byte [damage_restore_close_bad],0
        mov     cx,7
        mov     di,damage_restore_fh
.closeloop:
        cmp     word [di],0FFFFh
        je      .closenext
        mov     bx,[di]
        mov     ah,3Eh
        int     21h
        jnc     .closeok
        mov     byte [damage_restore_close_bad],1
.closeok:
        mov     word [di],0FFFFh
.closenext:
        add     di,2
        loop    .closeloop
        cmp     byte [damage_restore_close_bad],0
        jne     .fail_closed
%ifdef CCHOST_TEST_GBDJ_CRASH_AT_END
        mov     ax,4C07h
        int     21h
%endif
        clc
        ret
.fail_closed:
        stc
        ret
.fail:
        ; A write failed before any close was attempted: every handle this
        ; call still holds is exactly what damage_journal_preflight opened,
        ; so its unconditional closer is reused to release the rest.
        call    damage_journal_preflight_close_all
        stc
        ret

; The one restore write. BX = destination handle, DX = source buffer,
; CX = length (never 0 -- a 0-byte 40h would truncate the destination).
; Seeks to 0 explicitly rather than relying on preflight's rewind (the M5
; lesson from plan step 5: a load-bearing seek side effect must not be
; invisible), then requires CF clear and AX == the requested length from the
; write itself. Every test-only fault hook lives here, plus the two
; CRASH_AT/CRASH_AT_END points in damage_journal_restore, keyed on
; damage_restore_units_done, which equals the index of the unit about to be
; attempted (0 = roster, 1..6 = the k-th present source in ordinal order)
; and is incremented only after a fully successful write.
damage_journal_restore_unit:
        or      cx,cx
        jz      .fail
        mov     [damage_restore_unit_handle],bx
        mov     [damage_restore_unit_buf],dx
        mov     [damage_restore_unit_len],cx
%ifdef CCHOST_TEST_GBDJ_CRASH_AT
        cmp     byte [damage_restore_units_done],CCHOST_TEST_GBDJ_CRASH_AT
        jne     .no_crash_at
        mov     ax,4C07h
        int     21h
.no_crash_at:
%endif
        mov     bx,[damage_restore_unit_handle]
        mov     ax,4200h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .fail
        mov     bx,[damage_restore_unit_handle]
        mov     dx,[damage_restore_unit_buf]
        mov     cx,[damage_restore_unit_len]
%ifdef CCHOST_TEST_GBDJ_TEAR_AT
        cmp     byte [damage_restore_units_done],CCHOST_TEST_GBDJ_TEAR_AT
        jne     .no_tear_at
        mov     ax,cx
        shr     ax,1
        mov     cx,ax
        mov     ah,40h
        int     21h
        mov     ax,4C07h
        int     21h
.no_tear_at:
%endif
%ifdef CCHOST_TEST_GBDJ_FAIL_AT
        cmp     byte [damage_restore_units_done],CCHOST_TEST_GBDJ_FAIL_AT
        jne     .no_fail_at
        ; RM6 fix: a FAIL hook must inject CF set WITH AX = the requested
        ; length -- a caller that checks CF is still stopped, and a caller
        ; that (wrongly) checks only AX==length is not fooled into treating
        ; this as a real completed write. The previous AX=5 was masked by
        ; this same routine's own cmp ax,[damage_restore_unit_len] check
        ; (5 never equals a real 216/410-byte unit length), so the hook
        ; never actually depended on CF at all.
        mov     ax,[damage_restore_unit_len]
        stc
        jmp     .checked
.no_fail_at:
%endif
%ifdef CCHOST_TEST_GBDJ_SHORT_AT
        cmp     byte [damage_restore_units_done],CCHOST_TEST_GBDJ_SHORT_AT
        jne     .no_short_at
        dec     cx
.no_short_at:
%endif
        mov     ah,40h
        int     21h
.checked:
        jc      .fail
        cmp     ax,[damage_restore_unit_len]
        jne     .fail
        inc     byte [damage_restore_units_done]
        clc
        ret
.fail:  stc
        ret

; Build "<damage_source_dir>\CHRDATA<slot>.GAM",0 into damage_restore_path.
; AL = the source entry's own slot byte (1..6) on entry -- never the table
; ordinal. The 98-character save-directory bound (G2/G3) already guarantees
; this fits PATH_MAX, but the length is bound-checked here too rather than
; trusted.
build_damage_restore_source_path:
        mov     [damage_restore_slot],al
        mov     si,damage_source_dir
        mov     di,damage_restore_path
        xor     cx,cx
.copydir:
        lodsb
        or      al,al
        jz      .dircopied
        cmp     cx,PATH_MAX-1
        jae     .bad
        stosb
        inc     cx
        jmp     .copydir
.dircopied:
        mov     ax,cx
        add     ax,14           ; "\CHRDATA" + digit + ".GAM" + NUL = 14
        cmp     ax,PATH_MAX
        ja      .bad
        mov     al,5Ch
        stosb
        mov     al,'C'
        stosb
        mov     al,'H'
        stosb
        mov     al,'R'
        stosb
        mov     al,'D'
        stosb
        mov     al,'A'
        stosb
        mov     al,'T'
        stosb
        mov     al,'A'
        stosb
        mov     al,[damage_restore_slot]
        add     al,'0'
        stosb
        mov     al,'.'
        stosb
        mov     al,'G'
        stosb
        mov     al,'A'
        stosb
        mov     al,'M'
        stosb
        xor     al,al
        stosb
        clc
        ret
.bad:   stc
        ret

; G5 cross-field checks on the retained effect and (if declared) GBSL, run
; for every state. Seeks the journal to the start of the retained payload and
; leaves it there on return, ready for damage_journal_validate_g6's stream
; compare (PREPARED only). All offsets touched here stay well under 64 KiB
; (max ~10 KiB even at the largest GBPR/effect combination); only the GBSL
; body that follows can cross 64 KiB, and this routine never seeks into it.
damage_journal_validate_g5:
        mov     ax,[damage_journal_header+28]
        add     ax,GBDJ_DATA_OFF
        jc      .bad
        mov     [damage_journal_effect_off],ax
        mov     bx,[journal_fh]
        mov     ax,4200h
        xor     cx,cx
        mov     dx,[damage_journal_effect_off]
        int     21h
        jc      .bad
        mov     bx,[journal_fh]
        mov     ah,3Fh
        mov     cx,12
        mov     dx,damage_journal_payload
        int     21h
        jc      .bad
        cmp     ax,12
        jne     .bad
        cmp     dword [damage_journal_payload],'GBEF'
        jne     .bad
        mov     ax,[damage_journal_payload+6]
        mov     [damage_journal_fxflags],ax
        mov     ax,[damage_journal_header+20]
        cmp     ax,5750
        je      .expect_v9
        cmp     ax,GBEF_V15_LEN
        je      .expect_v15
        mov     ax,[damage_journal_payload+4]
        cmp     ax,14
        jne     .bad
        jmp     .version_ok
.expect_v15:
        cmp     word [damage_journal_payload+4],15
        jne     .bad
        cmp     word [damage_journal_payload+8],2
        jne     .bad
        ; Check the entire fixed suffix from the retained effect, not just its
        ; header. Each flag is a canonical byte boolean and reserved is zero.
        mov     ax,[damage_journal_effect_off]
        add     ax,GBEF_V14_LEN
        jc      .bad
        mov     dx,ax
        mov     bx,[journal_fh]
        mov     ax,4200h
        xor     cx,cx
        int     21h
        jc      .bad
        mov     bx,[journal_fh]
        mov     ah,3Fh
        mov     cx,12
        mov     dx,damage_journal_payload
        int     21h
        jc      .bad
        cmp     ax,12
        jne     .bad
        cmp     dword [damage_journal_payload],'GBRF'
        jne     .bad
        mov     ax,[damage_journal_payload+4]
        test    ax,0FEFEh
        jnz     .bad
        mov     ax,[damage_journal_payload+6]
        test    ax,0FEFEh
        jnz     .bad
        mov     ax,[damage_journal_payload+8]
        test    ax,0FEFEh
        jnz     .bad
        cmp     word [damage_journal_payload+10],0
        jne     .bad
        jmp     .version_ok
.expect_v9:
        mov     ax,[damage_journal_payload+4]
        cmp     ax,9
        jne     .bad
.version_ok:
        mov     ax,[damage_journal_header+24]
        or      ax,[damage_journal_header+26]
        jnz     .side_present
        test    word [damage_journal_fxflags],FX_HAVE_SIDECAR
        jnz     .bad
        jmp     .ok
.side_present:
        test    word [damage_journal_fxflags],FX_HAVE_SIDECAR
        jz      .bad
        mov     ax,[damage_journal_effect_off]
        add     ax,[damage_journal_header+20]
        jc      .bad
        mov     dx,ax
        mov     bx,[journal_fh]
        mov     ax,4200h
        xor     cx,cx
        int     21h
        jc      .bad
        mov     bx,[journal_fh]
        mov     ah,3Fh
        mov     cx,8
        mov     dx,damage_journal_payload
        int     21h
        jc      .bad
        cmp     ax,8
        jne     .bad
        cmp     dword [damage_journal_payload],'GBSL'
        jne     .bad
        cmp     word [damage_journal_payload+4],1
        je      .v1_side
        cmp     word [damage_journal_payload+4],2
        jne     .bad
        cmp     word [damage_journal_header+26],0
        jne     .bad
        mov     ax,[damage_journal_effect_off]
        add     ax,[damage_journal_header+20]
        jc      .bad
        mov     [v2_base],ax
        mov     ax,[damage_journal_header+24]
        mov     [v2_extent],ax
        mov     ax,[journal_fh]
        mov     [v2_fh],ax
        call    validate_gbsl_v2
        jc      .bad
        jmp     .ok
.v1_side:
        mov     ax,[damage_journal_payload+6]
        or      ax,ax
        jz      .bad
        cmp     ax,1213
        ja      .bad
        mov     bx,54
        mul     bx
        add     ax,8
        adc     dx,0
        jc      .bad
        cmp     dx,0
        jne     .bad
        cmp     ax,[damage_journal_header+24]
        jne     .bad
        cmp     word [damage_journal_header+26],0
        jne     .bad
.ok:
        ; Rewind to the payload start: G6's stream compare (PREPARED only)
        ; must begin at the retained effect, and COMMITTED needs no further
        ; seek at all, so leaving the pointer here is correct either way.
        mov     bx,[journal_fh]
        mov     ax,4200h
        xor     cx,cx
        mov     dx,[damage_journal_effect_off]
        int     21h
        jc      .bad
        clc
        ret
.bad:   stc
        ret

; G6 (PREPARED only): the current effect, and current GBSL when declared,
; must exist with the exact retained size and equal the retained bytes
; exactly. Reads the journal side sequentially from the payload start
; (damage_journal_validate_g5 left the pointer there), so the transition from
; the effect into the GBSL past 64 KiB is ordinary sequential I/O rather than
; a computed u16/u32 offset.
damage_journal_validate_g6:
        mov     si,damage_journal_header+32
        mov     di,effectpath
        mov     cx,PATH_MAX
        rep     movsb
        mov     ax,3D00h
        mov     dx,effectpath
        int     21h
        jc      .bad
        mov     [efxfh],ax
        mov     bx,ax
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .close_efx_bad
        or      dx,dx
        jnz     .close_efx_bad
        cmp     ax,[damage_journal_header+20]
        jne     .close_efx_bad
        mov     bx,[efxfh]
        mov     ax,4200h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .close_efx_bad
        mov     ax,[damage_journal_header+20]
        mov     [damage_journal_compare_left],ax
        call    damage_journal_compare_stream
        jc      .close_efx_bad
        mov     bx,[efxfh]
        mov     ah,3Eh
        int     21h
        jc      .bad
        mov     ax,[damage_journal_header+24]
        or      ax,[damage_journal_header+26]
        jz      .ok
        call    make_damage_side_name
        jc      .bad
        mov     ax,3D00h
        mov     dx,sidepath
        int     21h
        jc      .bad
        mov     [efxfh],ax
        mov     bx,ax
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .close_efx_bad
        or      dx,dx
        jnz     .close_efx_bad
        cmp     ax,[damage_journal_header+24]
        jne     .close_efx_bad
        mov     bx,[efxfh]
        mov     ax,4200h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .close_efx_bad
        ; No seek on the journal side: the pointer already continues
        ; sequentially from the end of the effect (side_off), which is
        ; exactly where the GBSL begins.
        mov     ax,[damage_journal_header+24]
        mov     [damage_journal_compare_left],ax
        call    damage_journal_compare_stream
        jc      .close_efx_bad
        mov     bx,[efxfh]
        mov     ah,3Eh
        int     21h
        jc      .bad
.ok:    clc
        ret
.close_efx_bad:
        mov     bx,[efxfh]
        mov     ah,3Eh
        int     21h
.bad:   stc
        ret

; Compare damage_journal_compare_left bytes of the journal (BX must already
; be [journal_fh] positioned at the start of the region) against the current
; file whose handle is [efxfh], in chunks of at most 410 bytes.
damage_journal_compare_stream:
.loop:
        mov     ax,[damage_journal_compare_left]
        or      ax,ax
        jz      .done
        cmp     ax,410
        jbe     .chunk_ok
        mov     ax,410
.chunk_ok:
        mov     [damage_journal_chunk_len],ax
        mov     cx,ax
        mov     bx,[journal_fh]
        mov     ah,3Fh
        mov     dx,damage_journal_payload
        int     21h
        jc      .bad
        cmp     ax,[damage_journal_chunk_len]
        jne     .bad
        mov     cx,[damage_journal_chunk_len]
        mov     bx,[efxfh]
        mov     ah,3Fh
        mov     dx,damage_journal_current
        int     21h
        jc      .bad
        cmp     ax,[damage_journal_chunk_len]
        jne     .bad
        mov     cx,[damage_journal_chunk_len]
        mov     si,damage_journal_payload
        mov     di,damage_journal_current
        repe    cmpsb
        jne     .bad
        mov     ax,[damage_journal_chunk_len]
        sub     [damage_journal_compare_left],ax
        jmp     .loop
.done:  clc
        ret
.bad:   stc
        ret

; SI is the fixed stored field and DI is a NUL-terminated /R identity.  This
; compares the supplied spelling and proves the remaining stored field is zero.
damage_journal_match_path:
        mov     cx,PATH_MAX
.next:  jcxz    .ok
        mov     al,[si]
        cmp     al,[di]
        jne     .bad
        inc     si
        inc     di
        dec     cx
        or      al,al
        jnz     .next
.padding:
        jcxz    .ok
        mov     al,[si]
        or      al,al
        jnz     .bad
        inc     si
        dec     cx
        jmp     .padding
.ok:    clc
        ret
.bad:   stc
        ret

; The retained GBPR is embedded in the journal, so the file-oriented combat
; validator cannot be used here. Validate its exact locally-declared extent
; and every compact GBD1 marker before any writable target is opened.
damage_journal_validate_roster:
        cmp     dword [damage_journal_roster],'GBPR'
        jne     .bad
        mov     ax,[damage_journal_roster+4]
        cmp     ax,GBPR_VERSION_V1
        je      .legacy
        cmp     ax,GBPR_VERSION_V2
        jne     .bad
        cmp     word [damage_journal_roster+12],GBPR_ID_DOK
        jne     .bad
        cmp     word [damage_journal_roster+14],1
        jne     .bad
        jmp     short .layout
.legacy:
        ; Compatibility is limited to recovering a pre-v2 DoK damage journal.
        ; Its exact GBPR bytes remain the rollback image; this does not make a
        ; v1 compact roster eligible for a new mutation or a merge.
        cmp     dword [damage_journal_roster+12],0
        jne     .bad
.layout:
        cmp     word [damage_journal_roster+8],410
        jne     .bad
        cmp     word [damage_journal_roster+10],GBPR_COMPACT_FLAG
        jne     .bad
        mov     ax,[damage_journal_roster+6]
        cmp     ax,8
        ja      .bad
        mov     bx,410
        mul     bx
        add     ax,16
        cmp     ax,[damage_journal_header+28]
        jne     .bad
        mov     [damage_journal_members],0
.member:
        mov     ax,[damage_journal_members]
        cmp     ax,[damage_journal_roster+6]
        jae     .ok
        mov     bx,410
        mul     bx
        add     ax,16+1+216
        mov     si,damage_journal_roster
        add     si,ax
        cmp     dword [si],'GBD1'
        jne     .bad
        inc     word [damage_journal_members]
        jmp     .member
.ok:    clc
        ret
.bad:   stc
        ret

; Reject malformed presence tags and nonzero absent entries now, before later
; stages add the target-mask/slot relation and writable raw-record handles.
damage_journal_validate_sources:
        mov     ax,[damage_journal_roster+6]
        mov     cx,ax
        mov     bx,1
        shl     bx,cl
        dec     bx
        not     bx
        mov     ax,[damage_journal_header+18]
        test    ax,bx
        jnz     .bad
        mov     word [damage_journal_seen_slots],0
        mov     word [damage_journal_source_index],0
.entry:
        mov     ax,[damage_journal_source_index]
        cmp     ax,GBDJ_SOURCE_COUNT
        jae     .ok
        mov     bx,GBDJ_SOURCE_LEN
        mul     bx
        mov     si,damage_journal_sources
        add     si,ax
        push    si
        mov     bx,[damage_journal_source_index]
        mov     ax,410
        mul     bx
        add     ax,16
        mov     di,damage_journal_roster
        add     di,ax
        mov     al,[di]
        mov     [damage_journal_slot],al
        mov     ax,1
        mov     cl,bl
        shl     ax,cl
        test    ax,[damage_journal_header+18]
        jz      .must_absent
        mov     al,[damage_journal_slot]
        test    al,80h
        jnz     .must_absent
        cmp     al,1
        jb      .bad_pop
        cmp     al,6
        ja      .bad_pop
        pop     si
        jmp     .present
.must_absent:
        pop     si
        jmp     .absent
.present:
        mov     al,[si]
        cmp     al,1
        jne     .bad
        mov     al,[si+1]
        cmp     al,[damage_journal_slot]
        jne     .bad
        xor     ah,ah
        mov     cl,al
        dec     cl
        mov     bx,1
        shl     bx,cl
        test    bx,[damage_journal_seen_slots]
        jnz     .bad
        or      [damage_journal_seen_slots],bx
        jmp     .next
.absent:
        mov     cx,GBDJ_SOURCE_LEN
.zero:  lodsb
        or      al,al
        jnz     .bad
        loop    .zero
.next:  inc     word [damage_journal_source_index]
        jmp     .entry
.ok:    clc
        ret
.bad_pop:
        pop     si
.bad:   stc
        ret

; A GBDJ field is a fixed zero-padded DOS identity.  Reject a missing terminator
; and any nonzero byte after it; the recovery caller separately checks that the
; identity is an absolute canonical path before accepting it from a command
; tail. SI addresses the field and CX is its exact field length.
damage_journal_validate_padded_path:
        xor     bx, bx
.next:  jcxz    .done
        lodsb
        dec     cx
        or      al, al
        jz      .nul
        inc     bx
        jmp     .next
.nul:   jcxz    .have_nul
.padding:
        lodsb
        dec     cx
        or      al, al
        jnz     .bad
        jcxz    .have_nul
        jmp     .padding
.have_nul:
        or      bx, bx
        jz      .bad
        clc
        ret
.done:
.bad:   stc
        ret

; Amendment B (plan step 7a). Pure string derivation, no file I/O: rebuilds
; the ".DOP" sibling of the padded +32 field into a scratch buffer (the same
; separator-reset rule as make_damage_dop_name/make_damage_side_name) and
; compares it, in full including padding, against the padded +256 field.
; Both fields have already passed damage_journal_validate_padded_path and
; validate_absolute_path by the time this runs.
damage_journal_check_dop_sibling:
        push    di
        push    cx
        mov     di, damage_journal_dop_scratch
        mov     cx, PATH_MAX
        xor     al, al
        rep     stosb
        pop     cx
        pop     di
        mov     si, damage_journal_header+32
        mov     di, damage_journal_dop_scratch
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
        cmp     bx, damage_journal_dop_scratch + PATH_MAX - 5
        ja      .bad
        ; The full-width compare below needs scratch zero-padded exactly like
        ; the stored field, so wipe everything from the dot onward first --
        ; otherwise an original extension longer than "DOP" would leave its
        ; own tail bytes (past our new NUL) nonzero and falsely mismatch.
        push    bx
        mov     di, bx
        inc     di
        mov     cx, damage_journal_dop_scratch + PATH_MAX
        sub     cx, di
        xor     al, al
        rep     stosb
        pop     bx
        mov     byte [bx+1], 'D'
        mov     byte [bx+2], 'O'
        mov     byte [bx+3], 'P'
        mov     byte [bx+4], 0
        mov     si, damage_journal_dop_scratch
        mov     di, damage_journal_header+256
        mov     cx, PATH_MAX
        repe    cmpsb
        jne     .bad
        clc
        ret
.bad:
        stc
        ret

; SI/DI address two 8-byte little-endian u64 values. Returns ZF=1 (equal),
; or ZF=0 with CF set iff [SI] < [DI] (unsigned), by comparing from the most
; significant word down so the first differing word decides the order.
damage_journal_generation_cmp:
        push    si
        push    di
        add     si, 6
        add     di, 6
        mov     cx, 4
.loop:
        mov     ax, [si]
        cmp     ax, [di]
        jne     .done
        sub     si, 2
        sub     di, 2
        loop    .loop
        ; D7 (plan §17): every word matched. The flags here are the trailing
        ; `sub di,2`'s (ZF=0, CF=0 for any nonzero address), not the compare's,
        ; so the caller's `je .kind3` could never fire. Set the documented
        ; "equal" result explicitly: ZF=1, CF=0. AX is scratch to the caller.
        xor     ax, ax
.done:
        pop     di
        pop     si
        ret

; D.2/amendment C (plan step 7a, the 7a row): decide whether an existing
; ".GDJ" for this roster blocks a fresh /D /J. Never opens any destination
; and never mutates anything -- only [journal_fh] and damage_journal_header
; are touched. On CF clear, no existing journal blocks this run (the direct
; caller still owns deleting a stale ".GDN" before proceeding). On CF set,
; damage_journal_existing_kind classifies the refusal: 1 = recovery
; required (a PREPARED journal whose +32 does not name this exact
; <effect>, or a structurally-invalid ".GDJ" of either state); 2 = a
; generic invalid request (a structurally-valid COMMITTED journal for this
; exact effect and token whose retained generation is NEWER than the
; current token, i.e. the caller's own token is stale -- recovery cannot
; help); 3 = already committed (a structurally-valid COMMITTED journal for
; this exact effect and token whose retained generation already equals the
; current token's); 4 (plan §20.5 A1, 7b) = a PREPARED journal whose +32
; names this exact <effect> -- direct_damage's A2 dispatch runs the full
; /R reader/preflight/restore on it in production mode before deciding
; whether to proceed.
damage_journal_check_existing:
        mov     byte [damage_journal_ext_gdn],0
        call    build_damage_journal_path
        jc      .kind2
        mov     ax,3D00h
        mov     dx,journalpath
        int     21h
        jc      .none
        mov     [journal_fh],ax
        mov     bx,ax
        mov     ah,3Fh
        mov     cx,GBDJ_HEADER_LEN
        mov     dx,damage_journal_header
        int     21h
        jc      .close_kind1
        cmp     ax,GBDJ_HEADER_LEN
        jne     .close_kind1
        cmp     dword [damage_journal_header],'GBDJ'
        jne     .close_kind1
        cmp     word [damage_journal_header+4],GBDJ_VERSION
        jne     .close_kind1
        mov     ax,[damage_journal_header+6]
        cmp     ax,GBDJ_PREPARED
        je      .prepared
        cmp     ax,GBDJ_COMMITTED
        jne     .close_kind1
        ; COMMITTED: close this peek handle, then require the full "all
        ; states" structural check (G2-G5, amendment B) before trusting any
        ; field -- recover_damage_journal never restores or preflights
        ; anything while damage_journal_validate_only is set.
        mov     bx,[journal_fh]
        mov     ah,3Eh
        int     21h
        mov     byte [damage_journal_validate_only],1
        call    recover_damage_journal
        mov     byte [damage_journal_validate_only],0
        jc      .kind1
        mov     si,damage_journal_header+32
        mov     di,effectpath
        call    damage_journal_match_path
        jc      .replaceable
        mov     si,damage_journal_header+256
        mov     di,damage_tokenpath
        call    damage_journal_match_path
        jc      .replaceable
        mov     si,damage_journal_header+8
        mov     di,damage_token_generation
        call    damage_journal_generation_cmp
        je      .kind3
        jc      .replaceable
        jmp     .kind2
.replaceable:
        clc
        ret
.none:
        clc
        ret
.prepared:
        ; plan §20.5 A1: routing only. Close the peek handle (the same
        ; close .close_kind1 performs below), then compare header +32
        ; (the retained <effect>) against this request's own effectpath
        ; with the same bounded compare the COMMITTED branch uses for the
        ; same field. A match routes to kind 4 (direct_damage's A2 runs
        ; the full reader/preflight/restore on it); a mismatch is kind 1,
        ; exactly as before A1. A structurally invalid PREPARED journal
        ; whose +32 happens to match still becomes kind 4 -- that is a
        ; routing decision only, not a trust decision, and the full reader
        ; in A2 rejects it as "recovery required" the same as it always did.
        mov     bx,[journal_fh]
        mov     ah,3Eh
        int     21h
        mov     si,damage_journal_header+32
        mov     di,effectpath
        call    damage_journal_match_path
        jc      .kind1
        mov     byte [damage_journal_existing_kind],4
        stc
        ret
.close_kind1:
        mov     bx,[journal_fh]
        mov     ah,3Eh
        int     21h
.kind1:
        mov     byte [damage_journal_existing_kind],1
        stc
        ret
.kind2:
        mov     byte [damage_journal_existing_kind],2
        stc
        ret
.kind3:
        mov     byte [damage_journal_existing_kind],3
        stc
        ret

; Delete a stale ".GDN" left by an interrupted prior produce (a crash
; between the temp write and the rename, or before it). Only ever called
; from the proceed path in direct_damage, never from a refusal -- a stale
; ".GDN" beside a journal this call is about to refuse must survive
; untouched for /R (or a later /D /J) to reason about.
damage_journal_delete_stale_gdn:
        mov     byte [damage_journal_ext_gdn],1
        call    build_damage_journal_path
        mov     byte [damage_journal_ext_gdn],0
        jc      .done
        mov     ah,41h
        mov     dx,journalpath
%ifdef CCHOST_TEST_GBDJ_D_FAIL
%if CCHOST_TEST_GBDJ_D_FAIL = 3
        ; Test-only (plan §16, build CCHOST.PG): DOSBox's local drive maps
        ; every host unlink failure (read-only file included) to AX=2, so the
        ; D4 non-2 branch below is unreachable from any host fixture. Skip
        ; 41h and inject "access denied" instead: AX=5, CF set.
        mov     ax,5
        stc
%else
        int     21h
%endif
%else
        int     21h
%endif
        ; D4 (defect list plan §15.3, direct-damage-journal-v1.md amendment
        ; D.3): AX=2 ("file not found", i.e. no stale ".GDN") is not an
        ; error and must return CF clear; any other failure must return CF
        ; set so the caller can refuse with zero writes.
        jnc     .done
        cmp     ax,2
        jne     .fail
        clc
        jmp     .done
.fail:  stc
.done:  ret

; The one producer write, mirroring damage_journal_restore_unit's shape:
; BX = destination handle, DX = source buffer, CX = length (never 0).
; Requires CF clear and AX == the requested length from the write itself.
; The caller sets damage_journal_write_site (0 = a ".GDN" payload write,
; 1 = the commit write) before every call; damage_journal_write_first latches
; true after this routine's first call in the whole process, which the
; CCHOST_TEST_GBDJ_D_FAIL/_SHORT=2 hooks use to target only the very first
; ".GDN" write. FAIL hooks inject CF set WITH AX = the requested length
; (RM6's rule); SHORT hooks shorten CX so the real DOS write itself returns
; CF clear with AX < the requested length, which this routine's own
; AX==length check must then catch.
damage_journal_produce_write:
        or      cx,cx
        jz      .fail
        mov     [damage_journal_write_len],cx
%ifdef CCHOST_TEST_GBDJ_D_FAIL
%if CCHOST_TEST_GBDJ_D_FAIL = 1
        cmp     byte [damage_journal_write_site],1
        jne     .real
        mov     byte [damage_journal_write_first],1
        mov     ax,[damage_journal_write_len]
        stc
        ret
%elif CCHOST_TEST_GBDJ_D_FAIL = 2
        cmp     byte [damage_journal_write_site],0
        jne     .real
        cmp     byte [damage_journal_write_first],0
        jne     .real
        mov     byte [damage_journal_write_first],1
        mov     ax,[damage_journal_write_len]
        stc
        ret
%endif
%endif
%ifdef CCHOST_TEST_GBDJ_D_SHORT
%if CCHOST_TEST_GBDJ_D_SHORT = 1
        cmp     byte [damage_journal_write_site],1
        jne     .real
        mov     cx,1
%elif CCHOST_TEST_GBDJ_D_SHORT = 2
        cmp     byte [damage_journal_write_site],0
        jne     .real
        cmp     byte [damage_journal_write_first],0
        jne     .real
        dec     cx
%endif
%endif
.real:
        mov     byte [damage_journal_write_first],1
        mov     ah,40h
        int     21h
        jc      .fail
        cmp     ax,[damage_journal_write_len]
        jne     .fail
        clc
        ret
.fail:
        stc
        ret

; Stream damage_journal_compare_left bytes from the handle in
; damage_journal_produce_fh into the open damage_journal_gdn_fh, in chunks of
; at most 410 bytes through damage_journal_payload, u32-correctly (the
; largest single effect+GBSL combination stays well under 64 KiB, so a plain
; u16 running total is exact).
damage_journal_produce_stream:
.loop:
        mov     ax,[damage_journal_compare_left]
        or      ax,ax
        jz      .done
        cmp     ax,410
        jbe     .chunk_ok
        mov     ax,410
.chunk_ok:
        mov     [damage_journal_chunk_len],ax
        mov     cx,ax
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Fh
        mov     dx,damage_journal_payload
        int     21h
        jc      .bad
        cmp     ax,[damage_journal_chunk_len]
        jne     .bad
        mov     bx,[damage_journal_gdn_fh]
        mov     dx,damage_journal_payload
        mov     cx,[damage_journal_chunk_len]
        call    damage_journal_produce_write
        jc      .bad
        mov     ax,[damage_journal_chunk_len]
        sub     [damage_journal_compare_left],ax
        jmp     .loop
.done:  clc
        ret
.bad:   stc
        ret

; Commit (D.7): the produced-and-renamed ".GDJ" (still PREPARED on disk) is
; flipped to COMMITTED by the one 2-byte state-field write. Only ever called
; after apply_effect_damage_roster's write pass has returned CF clear and
; damage_journal_live is set.
damage_journal_commit:
        mov     byte [damage_journal_ext_gdn],0
        call    build_damage_journal_path
        jc      .fail
        mov     ax,3D02h
        mov     dx,journalpath
        int     21h
        jc      .fail
        mov     [journal_fh],ax
        mov     bx,ax
        mov     ax,4200h
        xor     cx,cx
        mov     dx,6
        int     21h
        jc      .close_fail
        mov     word [damage_journal_commit_state],GBDJ_COMMITTED
        mov     byte [damage_journal_write_site],1
        mov     bx,[journal_fh]
        mov     dx,damage_journal_commit_state
        mov     cx,2
        call    damage_journal_produce_write
        jc      .close_fail
        mov     bx,[journal_fh]
        mov     ah,3Eh
        int     21h
        jc      .fail
        mov     byte [damage_journal_committed],1
        clc
        ret
.close_fail:
        mov     bx,[journal_fh]
        mov     ah,3Eh
        int     21h
.fail:
        stc
        ret

; Produce (item 4, plan step 7a). Called from apply_effect_damage_roster's
; .scan_done, when damage_preflight=1 and damage_journal_mode is set, before
; damage_preflight is cleared for the write pass. [efxfh] is still open (the
; caller closes it on this routine's CF return, through .close_fail); this
; routine opens its own independent handles for everything it reads and
; leaves none of them open on return.
;
; The raw target mask (damage_journal_mask, accumulated one OR per DAMAGE
; event during the just-finished preflight pass) is filtered down to the
; roster's real member count -- known now from damage_roster_count, set by
; that same preflight pass's own apply_damage_value_to_roster calls -- before
; anything else happens. A filtered mask of 0 means no compact write this
; run will actually touch a member the roster has, so there is nothing to
; journal: CF clear, no ".GDN"/".GDJ" ever touched, and the caller's ordinary
; write pass proceeds (harmlessly a no-op for the same reason the mask is 0).
; Journaling is DoK-compact-only; a plain CoK roster requesting /J is
; refused outright (CF set) rather than silently applying without a journal.
damage_journal_produce:
        ; D2 (defect list plan §15.3, direct-damage-journal-v1.md amendment
        ; D.5): the non-compact rejection must run only once a nonzero
        ; filtered mask has been established. An effect with no qualifying
        ; DAMAGE event leaves rosterhdr's flag word at its static zero even
        ; for a compact roster, so testing it first turned every ordinary
        ; no-DAMAGE /D /J into a false (result). The count>6 check stays
        ; ahead of the shift, unchanged.
        mov     cx,[damage_roster_count]
        cmp     cx,8
        ja      .bad
        mov     bx,1
        shl     bx,cl
        dec     bx
        mov     ax,[damage_journal_mask]
        and     ax,bx
        or      ax,ax
        jz      .none
        test    word [rosterhdr+10],1
        jz      .bad
        mov     [damage_journal_header+18],ax
        mov     dword [damage_journal_header],'GBDJ'
        mov     word [damage_journal_header+4],GBDJ_VERSION
        mov     word [damage_journal_header+6],GBDJ_PREPARED
        mov     si,damage_token_generation
        mov     di,damage_journal_header+8
        mov     cx,4
        rep     movsw
        mov     word [damage_journal_header+16],GBDJ_COMPACT_FLAG
        mov     word [damage_journal_header+30],0
        mov     si,effectpath
        mov     di,damage_journal_header+32
        mov     cx,PATH_MAX
        rep     movsb
        mov     si,rosterpath
        mov     di,damage_journal_header+144
        mov     cx,PATH_MAX
        rep     movsb
        mov     si,damage_tokenpath
        mov     di,damage_journal_header+256
        mov     cx,PATH_MAX
        rep     movsb
        mov     si,damage_source_dir
        mov     di,damage_journal_header+368
        mov     cx,PATH_MAX
        rep     movsb
        ; Roster preimage: the whole current file, header and members alike,
        ; straight from disk -- ordinal k's slot lives at its own offset
        ; 16+410k once this is in memory, so no field is reconstructed by
        ; hand from anything computed during the scan.
        mov     ax,[damage_roster_count]
        mov     bx,410
        mul     bx
        add     ax,16
        mov     [damage_journal_header+28],ax
        mov     ax,3D00h
        mov     dx,rosterpath
        int     21h
        jc      .bad
        mov     [damage_journal_produce_fh],ax
        mov     bx,ax
        mov     ah,3Fh
        mov     cx,[damage_journal_header+28]
        mov     dx,damage_journal_roster
        int     21h
        jc      .close_produce_fh_bad
        cmp     ax,[damage_journal_header+28]
        jne     .close_produce_fh_bad
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .bad
        ; Effect/GBSL extents, re-derived fresh from disk (the scan that
        ; just ran may have left [efxfh] pointing at either the GBEF or, for
        ; a v9 sidecar, the GBSL sibling -- this reopens by name instead of
        ; trusting which one that currently is).
        mov     ax,3D00h
        mov     dx,effectpath
        int     21h
        jc      .bad
        mov     [damage_journal_produce_fh],ax
        mov     bx,ax
        mov     ah,3Fh
        mov     cx,8
        mov     dx,damage_journal_payload
        int     21h
        jc      .close_produce_fh_bad
        cmp     ax,8
        jne     .close_produce_fh_bad
        cmp     dword [damage_journal_payload],'GBEF'
        jne     .close_produce_fh_bad
        mov     ax,[damage_journal_payload+4]
        cmp     ax,9
        je      .v9
        cmp     ax,15
        je      .v15
        cmp     ax,14
        jne     .close_produce_fh_bad
        mov     word [damage_journal_header+20],5920
        mov     word [damage_journal_header+22],0
        mov     word [damage_journal_header+24],0
        mov     word [damage_journal_header+26],0
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .bad
        jmp     .extents_done
.v15:
        mov     word [damage_journal_header+20],GBEF_V15_LEN
        mov     word [damage_journal_header+22],0
        test    word [damage_journal_payload+6],FX_HAVE_SIDECAR
        jz      .close_produce_fh_bad
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .bad
        jmp     .v9_side
.v9:
        mov     word [damage_journal_header+20],GBEF_V9_LEN
        mov     word [damage_journal_header+22],0
        mov     ax,[damage_journal_payload+6]
        test    ax,FX_HAVE_SIDECAR
        jnz     .v9_side
        mov     word [damage_journal_header+24],0
        mov     word [damage_journal_header+26],0
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .bad
        jmp     .extents_done
.v9_side:
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .bad
        call    make_damage_side_name
        jc      .bad
        mov     ax,3D00h
        mov     dx,sidepath
        int     21h
        jc      .bad
        mov     [damage_journal_produce_fh],ax
        mov     bx,ax
        mov     ah,3Fh
        mov     cx,8
        mov     dx,damage_journal_payload
        int     21h
        jc      .close_produce_fh_bad
        cmp     ax,8
        jne     .close_produce_fh_bad
        cmp     dword [damage_journal_payload],'GBSL'
        jne     .close_produce_fh_bad
        cmp     word [damage_journal_payload+4],1
        je      .v9_side_v1
        cmp     word [damage_journal_payload+4],2
        jne     .close_produce_fh_bad
        mov     bx,[damage_journal_produce_fh]
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .close_produce_fh_bad
        or      dx,dx
        jnz     .close_produce_fh_bad
        mov     [v2_extent],ax
        mov     [damage_journal_header+24],ax
        mov     word [damage_journal_header+26],0
        mov     ax,[damage_journal_produce_fh]
        mov     [v2_fh],ax
        mov     word [v2_base],0
        call    validate_gbsl_v2
        jc      .close_produce_fh_bad
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .bad
        jmp     .extents_done
.v9_side_v1:
        mov     ax,[damage_journal_payload+6]
        or      ax,ax
        jz      .close_produce_fh_bad
        cmp     ax,1213
        ja      .close_produce_fh_bad
        mov     bx,54
        mul     bx
        add     ax,8
        mov     [damage_journal_header+24],ax
        mov     word [damage_journal_header+26],0
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .bad
.extents_done:
        ; Source table: ordinal k is present only when the filtered mask
        ; targets a real member (k < damage_roster_count) whose own slot
        ; byte, read from the roster preimage just captured, names a retail
        ; 1..6 record; a native (high-bit) slot stays absent even though its
        ; member is targeted, and every other ordinal is zero.
        mov     word [damage_journal_source_index],0
.psrc:
        mov     ax,[damage_journal_source_index]
        cmp     ax,GBDJ_SOURCE_COUNT
        jae     .psrc_done
        mov     bx,GBDJ_SOURCE_LEN
        mul     bx
        mov     di,damage_journal_sources
        add     di,ax
        push    di
        mov     cx,GBDJ_SOURCE_LEN
        xor     al,al
        rep     stosb
        pop     di
        mov     ax,[damage_journal_source_index]
        cmp     ax,[damage_roster_count]
        jae     .psrc_next
        mov     cx,ax
        mov     bx,1
        shl     bx,cl
        test    bx,[damage_journal_header+18]
        jz      .psrc_next
        mov     bx,410
        mul     bx
        add     ax,16
        mov     si,damage_journal_roster
        add     si,ax
        mov     al,[si]
        test    al,80h
        jnz     .psrc_next
        cmp     al,1
        jb      .psrc_next
        cmp     al,6
        ja      .psrc_next
        ; D1 (defect list plan §15.3, direct-damage-journal-v1.md item D1):
        ; build_damage_restore_source_path clobbers DI as its stosb
        ; destination; DI here is the caller's live source-entry pointer, so
        ; it must survive the call unmolested. pop does not touch flags, so
        ; both the success and CF-set paths pop correctly.
        push    di
        call    build_damage_restore_source_path
        pop     di
        jc      .bad
        mov     ax,3D00h
        mov     dx,damage_restore_path
        int     21h
        jc      .bad
        mov     [damage_journal_produce_fh],ax
        mov     bx,ax
        mov     ah,3Fh
        mov     cx,216
        mov     dx,di
        add     dx,2
        int     21h
        jc      .close_produce_fh_bad
        cmp     ax,216
        jne     .close_produce_fh_bad
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .bad
        mov     byte [di],1
        mov     al,[damage_restore_slot]
        mov     [di+1],al
.psrc_next:
        inc     word [damage_journal_source_index]
        jmp     .psrc
.psrc_done:
        call    damage_journal_validate_roster
        jc      .bad
        call    damage_journal_validate_sources
        jc      .bad
        ; Write the whole image to a temp ".GDN" first.
        mov     byte [damage_journal_ext_gdn],1
        call    build_damage_journal_path
        mov     byte [damage_journal_ext_gdn],0
        jc      .bad
        mov     si,journalpath
        mov     di,damage_journal_gdn_path
        mov     cx,PATH_MAX
        rep     movsb
        call    build_damage_journal_path
        jc      .bad
        mov     si,journalpath
        mov     di,damage_journal_gdj_path
        mov     cx,PATH_MAX
        rep     movsb
        mov     byte [damage_journal_write_first],0
        mov     byte [damage_journal_write_site],0
        mov     ax,3C00h
        xor     cx,cx
        mov     dx,damage_journal_gdn_path
        int     21h
        jc      .bad
        mov     [damage_journal_gdn_fh],ax
        mov     bx,ax
        mov     dx,damage_journal_header
        mov     cx,GBDJ_HEADER_LEN
        call    damage_journal_produce_write
        jc      .close_gdn_bad
        mov     bx,[damage_journal_gdn_fh]
        mov     dx,damage_journal_roster
        mov     cx,[damage_journal_header+28]
        call    damage_journal_produce_write
        jc      .close_gdn_bad
        mov     bx,[damage_journal_gdn_fh]
        mov     dx,damage_journal_sources
        mov     cx,GBDJ_SOURCE_TABLE_LEN
        call    damage_journal_produce_write
        jc      .close_gdn_bad
        mov     ax,3D00h
        mov     dx,effectpath
        int     21h
        jc      .close_gdn_bad
        mov     [damage_journal_produce_fh],ax
        mov     ax,[damage_journal_header+20]
        mov     [damage_journal_compare_left],ax
        call    damage_journal_produce_stream
        jc      .close_all_bad
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .close_gdn_bad
        mov     ax,[damage_journal_header+24]
        or      ax,[damage_journal_header+26]
        jz      .psend
        call    make_damage_side_name
        jc      .close_gdn_bad
        mov     ax,3D00h
        mov     dx,sidepath
        int     21h
        jc      .close_gdn_bad
        mov     [damage_journal_produce_fh],ax
        mov     ax,[damage_journal_header+24]
        mov     [damage_journal_compare_left],ax
        call    damage_journal_produce_stream
        jc      .close_all_bad
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
        jc      .close_gdn_bad
.psend:
%ifdef CCHOST_TEST_GBDJ_D_CORRUPT
        mov     bx,[damage_journal_gdn_fh]
        mov     ax,4200h
        xor     cx,cx
        mov     dx,16
        int     21h
        jc      .close_gdn_bad
        mov     word [damage_journal_corrupt_word],3
        mov     bx,[damage_journal_gdn_fh]
        mov     ah,40h
        mov     cx,2
        mov     dx,damage_journal_corrupt_word
        int     21h
%endif
        mov     bx,[damage_journal_gdn_fh]
        mov     ah,3Eh
        int     21h
        jc      .post_bad
        ; Self-verify: the ".GDN" must independently pass every reader
        ; structural check, including G6's stream compare against the very
        ; files it just streamed from, before it is ever allowed to become
        ; the roster's ".GDJ".
        ; D6 (plan §16, found by 7a.1's SM1 smoke): G6 reuses the shared
        ; [efxfh] global for its own effect/GBSL opens and closes it, but the
        ; caller (apply_effect_damage_roster) still holds its scan handle in
        ; [efxfh] and resumes its write pass through it after this returns.
        ; Save and restore the caller's value caller-side, so the step-6-green
        ; reader shared with /R stays byte-unchanged. pop does not touch
        ; flags, so the reader's CF survives to the jc below.
        push    word [efxfh]
        mov     byte [damage_journal_ext_gdn],1
        mov     byte [damage_journal_validate_only],1
        call    recover_damage_journal
        mov     byte [damage_journal_ext_gdn],0
        mov     byte [damage_journal_validate_only],0
        pop     word [efxfh]
        jc      .post_bad
%ifdef CCHOST_TEST_GBDJ_D_CRASH
%if CCHOST_TEST_GBDJ_D_CRASH = 1
        mov     ax,4C07h
        int     21h
%endif
%endif
        mov     ah,41h
        mov     dx,damage_journal_gdj_path
        int     21h
%ifdef CCHOST_TEST_GBDJ_D_CRASH
%if CCHOST_TEST_GBDJ_D_CRASH = 2
        mov     ax,4C07h
        int     21h
%endif
%endif
        mov     ah,56h
        mov     dx,damage_journal_gdn_path
        mov     di,damage_journal_gdj_path
        int     21h
        jc      .post_bad
%ifdef CCHOST_TEST_GBDJ_D_CRASH
%if CCHOST_TEST_GBDJ_D_CRASH = 3
        mov     ax,4C07h
        int     21h
%endif
%endif
        mov     byte [damage_journal_live],1
        clc
        ret
.none:
        clc
        ret
.close_all_bad:
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
.close_gdn_bad:
        ; D3 (defect list plan §15.3, direct-damage-journal-v1.md amendment
        ; D.5): every failure reached after the ".GDN" was created (3Ch
        ; succeeded) must delete it, ignoring the delete's own result, so no
        ; half-written ".GDN" survives a write/stream failure.
        mov     bx,[damage_journal_gdn_fh]
        mov     ah,3Eh
        int     21h
        mov     ah,41h
        mov     dx,damage_journal_gdn_path
        int     21h
        stc
        ret
.post_bad:
        ; D3: the ".GDN" is already closed by the time any of these three
        ; sites is reached (the close itself failing, a self-verify
        ; rejection, or a failed 56h rename), so only the delete is needed
        ; here, again ignoring its result.
        mov     ah,41h
        mov     dx,damage_journal_gdn_path
        int     21h
        jmp     .bad
.close_produce_fh_bad:
        ; Pre-".GDN"-creation failure path: nothing to delete here (D3 is
        ; scoped to failures after the ".GDN" exists), so this still falls
        ; straight into the plain .bad below.
        mov     bx,[damage_journal_produce_fh]
        mov     ah,3Eh
        int     21h
.bad:
        stc
        ret
