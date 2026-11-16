; PRIVATE ordinary submission with exactly rederived pre-journal stages.
; Read actual GRA128/result0; no request pointer or caller ready grant.
; CF0 AX0 absent request; AX1 NEW GRJ installed, live GSK/P1/GRA unchanged.
; Existing complete P/T stages need full fresh derivation and exact proof.
; Missing request or foreign/partial scratch preserves/refuses all staging.
; Requires factored RC admission and RCOMMIT_HAS_RQ/SUBMIT composition.
%ifndef RCOMMIT_HAS_SUBMIT
%error "submit composition requires RCOMMIT_HAS_SUBMIT extent admission"
%endif
rcommit_submit4:
        call rc_invoke
        jc rc_bad
        mov word [rc_error], 20
        mov dx, rc_journal
        call rc_absent
        jc rs_bad
        mov dx, kn_authority
        call rr_index
        jc rc_bad
        cmp word [rr_header+6], 1
        jne rs_bad
        mov dx, [rc_extent]
        call rv_record_relation
        jc rs_bad
        call rc_bind_live
        jc rs_bad
        call rc_names_only
        jc rs_bad
        call rs_scratch_absent
        jc rs_bad
        call rs_probe_stages
        jc rs_bad
        call rj_match_live
        jc rs_bad
        mov word [rc_error], 21
        call rs_read_request
        jc rs_bad
        test ax, ax
        jnz .accepted
        cmp byte [rs_stage_mask], 0
        jne rs_bad
        jmp rs_finish
.accepted:
        mov word [rc_error], 22
        mov si, kn_tail
        mov dx, [rc_extent]
        call rj_derive
        jc rs_bad
        call rj_match_live     ; read-only, does not destroy RW framing
        jc rs_bad
        call rc_names_only    ; rebuild KV scratch after R, before writers
        jc rs_bad
        call rs_scratch_absent
        jc rs_bad
        call rs_probe_stages   ; checked current P/T names, not the old mask
        jc rs_bad
        call rs_fs_difference
        jc rs_bad
        cmp byte [rs_changed], 0
        je .equal_stage
        test byte [rs_stage_mask], 1
        jnz .compare_party
        test byte [rs_stage_mask], 2 ; T without required P is invalid order
        jnz rs_bad
        mov word [rc_error], 23
        mov dx, kn_alias_path
        call rq_write
        jc rs_bad
.compare_party:
        ; Closed GRP must match the exact native FS post, whole EOF included.
        push gs
        push fs
        pop gs
        mov byte [kn_bank_compare], 1
        mov byte [kn_normalize], 0
        mov byte [kn_peer_exact], 1
        xor eax, eax
        movzx ecx, word [rz_length]
        xor edx, edx
        mov di, kn_alias_path
        call kn_compare_range_file
        pop gs
        mov byte [kn_bank_compare], 0
        jc rs_bad
        jmp .journal
.equal_stage:
        test byte [rs_stage_mask], 1 ; equal P1 never owns a party stage
        jnz rs_bad
.journal:
        mov word [rc_error], 24
        test byte [rs_stage_mask], 2
        jnz .compare_journal
        call rj_stage_intent   ; one-shot exclusive write; preserves partial
        jc rs_bad
        jmp .closed_journal
.compare_journal:
        mov dx, rj_temp
        call ro_compare_framed ; freshly derived INTENT, never ro_frame/NONE
        jc rs_bad
.closed_journal:
        mov byte [rc_jclose_attempted], 1
        call kc_close
        jc rc_bad             ; never automatically retry failed source close
        mov byte [rc_jclose_attempted], 0
        ; Both preceding branches consumed RJ/live grants before returning:
        ; one-shot rj_stage_intent or already-framed ro_compare_framed.
        mov dx, rj_temp
        call rr_index
        jc rc_bad
        mov word [rc_error], 25
        cmp word [rr_header+6], 2
        jne rs_bad
        mov dx, [rc_extent]
        call rv_record_relation
        jc rs_bad
        call rc_bind_live
        jc rs_bad
        call rc_names_only
        jc rs_bad
        mov dx, rc_journal
        call rc_absent
        jc rs_bad
        call rs_scratch_absent
        jc rs_bad
        xor ax, ax
        mov dx, kn_authority
        call ro_match
        jc rs_bad
        mov di, kn_expected_roster
        mov bx, 6*4
        call rc_party_exact
        jc rs_bad
        cmp byte [rs_changed], 0
        je .equal
        mov di, kn_alias_path
        mov bx, 7*4
        call rc_party_exact
        jc rs_bad
        jmp .request
.equal:
        mov dx, kn_alias_path
        call rc_absent
        jc rs_bad
.request:
        ; Reread section14 after RO replaced rj_request with canonical NONE.
        call rc_request_exact
        jc rs_bad
        cmp byte [rc_request_present], 1
        jne rs_bad
        mov si, rj_request
        mov di, kn_tail
        mov cx, 64
        repe cmpsw
        jne rs_bad
        mov byte [rc_jclose_attempted], 1
        call kc_close
        jc rc_bad
        mov word [rc_error], 26
        mov dx, rj_temp
        mov di, rc_journal
        mov ah, 56h
        int 21h
        jc rc_bad
        mov ax, 1
        jmp rs_finish

rs_scratch_absent:
        mov word [rc_index], 0
.next:
        mov bx, [rc_index]
        mov dx, [rs_final_absent+bx]
        call rc_absent
        jc .bad
        add word [rc_index], 2
        cmp word [rc_index], 8
        jb .next
        clc
        ret
.bad:  stc
        ret

rs_probe_stages:
        mov byte [rs_stage_mask], 0
        mov dx, kn_alias_path
        call kc_probe
        jc .bad
        test ax, ax
        jz .journal
        or byte [rs_stage_mask], 1
.journal:
        mov dx, rj_temp
        call kc_probe
        jc .bad
        test ax, ax
        jz .done
        or byte [rs_stage_mask], 2
.done: clc
        ret
.bad:  stc
        ret

rs_read_request:
        mov dx, kn_work_output
        mov ax, 3d00h
        int 21h
        jnc .opened
        cmp ax, 2
        jne .bad
        xor ax, ax
        clc
        ret
.opened:
        mov [kn_peer_fh], ax
        mov bx, ax
        mov dx, kn_tail
        mov cx, 128
        mov ah, 3fh
        int 21h
        jc .close_bad
        cmp ax, 128
        jne .close_bad
        mov dx, kn_marker_actual ; independent one-byte EOF scratch
        mov cx, 1
        mov ah, 3fh
        int 21h
        jc .close_bad
        test ax, ax
        jnz .close_bad
        call kn_peer_close
        jc .bad
        cmp word [kn_tail+28], 0
        jne .bad
        mov ax, [kn_tail+18]
        cmp ax, 5
        jb .bad
        cmp ax, 16
        jbe .ok
        cmp ax, 20
        jb .bad
        cmp ax, 23
        ja .bad
.ok:   mov ax, 1
        clc
        ret
.close_bad:
        call kn_peer_close
.bad:  stc
        ret

; All source reads remain checked even after a byte mismatch. CF is I/O,
; rs_changed is full raw identity, never an interpretation of action/result.
rs_fs_difference:
        mov byte [rs_changed], 0
        movzx eax, word [rz_length]
        cmp eax, [rr_lengths+7*4]
        je .same_length
        mov byte [rs_changed], 1
        clc
        ret
.same_length:
        mov [kn_cmp_left], eax
        mov eax, [rr_offsets+7*4]
        mov [kn_cmp_off], eax
        mov dword [kn_peer_off], 0
.chunk:
        mov eax, [kn_cmp_left]
        test eax, eax
        jz .ok
        cmp eax, 512
        jbe .bounded
        mov ax, 512
.bounded:
        mov [kn_cmp_chunk], ax
        mov cx, ax
        mov eax, [kn_cmp_off]
        mov di, kc_buf
        call kc_read_at
        jc .bad
        mov si, [kn_peer_off]
        mov di, kc_buf
        mov cx, [kn_cmp_chunk]
        push ds
        push fs
        pop ds
        repe cmpsb
        pop ds
        je .next
        mov byte [rs_changed], 1
.next:
        movzx eax, word [kn_cmp_chunk]
        add [kn_cmp_off], eax
        add [kn_peer_off], eax
        sub [kn_cmp_left], eax
        jmp .chunk
.ok:   clc
        ret
.bad:  stc
        ret

rs_bad:
        cmp byte [rc_jclose_attempted], 0
        jne rc_bad
        cmp word [kc_fh], 0ffffh
        je rc_bad
        mov byte [rc_jclose_attempted], 1
        call kc_close
        jmp rc_bad

rs_finish:
        mov [rs_return], ax
        cmp word [kc_fh], 0ffffh
        je .closed
        mov byte [rc_jclose_attempted], 1
        call kc_close
        jc rc_bad
.closed:
        call rc_clear_transients
        mov ax, [rs_return]
        clc
        ret

rs_final_absent dw kn_backup,kw_stage,kv_scratch,kv_other_path
rs_stage_mask db 0
rs_changed db 0
rs_return dw 0
rs_end:
