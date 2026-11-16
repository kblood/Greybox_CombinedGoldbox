; CCNEXT lifecycle. Public handlers return AX=0 (absent/prepared) or AX=2
; (closed restored READY), CF on failure. Only admitted frozen records may
; authorize HP settlement, workspace reuse, phase replacement or restoration.
kn_prepare:
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 10
%endif
        mov dx, kn_descriptor
        call kc_open
        jc kn_bad
        cmp dword [kc_extent], KR_BODY
        jne kn_close_bad
        xor eax, eax
        mov cx, 64
        mov di, kn_new_header
        call kc_read_at
        jc kn_close_bad
        mov eax, 64
        mov cx, 1120
        mov di, kn_new_paths
        call kc_read_at
        jc kn_close_bad
        mov eax, 1184
        mov cx, KR_CONTEXT
        mov di, kn_new_context
        call kc_read_at
        jc kn_close_bad
        call kc_close
        jc kn_bad
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 11
%endif
        cmp dword [kn_new_header], 'GSK3'
        jne kn_bad
        cmp dword [kn_new_header+4], 3
        jne kn_bad
        cmp dword [kn_new_header+8], 00010004h
        jne kn_bad
        cmp word [kn_new_header+16], 64
        jne kn_bad
        cmp word [kn_new_header+18], 1
        ja kn_bad
        mov ax,[kn_new_header+20]
        cmp ax,3
        je .descriptor_kind
        test ax,ax
        jnz kn_bad
.descriptor_kind:
        mov si, kn_new_header+22
        mov cx, 42
.zero: lodsb
        test al, al
        jnz kn_bad
        loop .zero
        mov si, kn_new_paths
        mov di, kv_paths
        mov cx, 560
        rep movsw
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 12
%endif
        call kv_check_paths
        jc kn_bad
        mov si, kn_new_context
        mov di, kv_context
        mov cx, KR_CONTEXT/2
        rep movsw
        mov ax, [kn_new_header+18]
        mov [kr_header+18], ax
        call kv_check_context
        jc kn_bad
        mov si, kv_paths
        mov di, kn_new_paths
        mov cx, 560
        rep movsw
        mov si, kv_paths
        mov di, kn_expected_source
        call kn_copy_path
        mov si, kv_paths+112
        mov di, kn_expected_roster
        call kn_copy_path
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 13
%endif
        call kn_names
        jc kn_bad
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 14
%endif
%ifdef CCNEXT_PUBLIC_FINAL
        call kn_final_recover  ; a retained journal blocks /P before owner mutation
        jc kn_bad
%endif
        call kn_open_current
        jc kn_bad
        test ax, ax
        jz .new
        mov si, kv_context
        mov di, kn_new_context
        mov cx, KR_CONTEXT
        repe cmpsb
        jne kn_bad
        cmp word [kr_header+6], 0
        je .retry
        cmp word [kr_header+6], 2
        jne kn_bad
        ; A new encounter must be exactly the durable previous successor;
        ; current roster is the previous complete HP postimage.
        mov di, kn_new_paths+4*112
        mov eax, [kr_offsets+28]
        mov edx, [kr_header+52]
        call kn_match_file
        jc kn_bad
        mov dx, kn_expected_roster
        call kn_match_post
        jc kn_bad
        mov di, kn_new_paths+5*112
        mov eax, [kr_offsets+12]
        mov ecx, 150
        xor edx, edx
        call kn_compare_range_file
        jc kn_bad
        call kc_close
        jc kn_bad
.new:
        mov si, kn_new_header
        mov di, kr_header
        mov cx, 32
        rep movsw
        mov si, kn_new_paths
        mov di, kv_paths
        mov cx, 560
        rep movsw
        mov si, kn_new_context
        mov di, kv_context
        mov cx, KR_CONTEXT/2
        rep movsw
        mov byte [kn_work_create], 1
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 15
%endif
        call kn_workspace
        pushf
        mov byte [kn_work_create], 0
        popf
        jc kn_bad
        cmp word [kr_header+20],3
        jne .stage
        call kn_no_transaction
        jc kn_bad
        mov dx,kv_paths+6*112
        call kc_probe
        jc kn_bad
        test ax,ax
        jnz kn_bad
.stage:
        call kn_stage_absent
        jc kn_bad
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 16
%endif
        call kw_prepare
        jc kn_bad
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 17
%endif
        call kn_admit_stage
        jc kn_bad
        call kn_publish_stage
        jc kn_bad
        jmp .host
.retry:
        mov si, kr_header
        mov di, kn_new_header
        mov cx, 24
        repe cmpsb
        jne kn_bad
        mov si, kv_paths
        mov di, kn_new_paths
        mov cx, 1120
        repe cmpsb
        jne kn_bad
        call kn_match_prepared_live
        jc kn_bad
.host:
        cmp word [kr_header+20],3
        je .done
        call kn_validate_gsc_optional
        jc kn_bad
        test ax, ax
        jnz .done                     ; already prepared, never call /P twice
        call kn_host_prepare
        jc kn_bad
        call kn_validate_gsc_optional
        jc kn_bad
        cmp ax, 1
        jne kn_bad
.done: xor ax, ax
        clc
        ret

kn_resume:
        call kn_names
        jc kn_bad
%ifdef CCNEXT_PUBLIC_FINAL
        call kn_final_recover
        jc kn_bad
%endif
        call kn_open_current
        jc kn_bad
        test ax, ax
        jz kn_absent
.phase:
        cmp word [kr_header+20],3
        jne .ordinary_phase
        ; INITIAL has no party transaction. Bind live P1 before any answer
        ; probe or READY restoration, as for an already answered cursor.
        call kn_match_cursor_roster
        jc kn_bad
        cmp byte [kn_mode],'M'
        je kn_advance_menu
        cmp byte [kn_mode],'E'
        je kn_advance_empty
        cmp word [fs:KV_FX+8],2
        jne kn_ready_paused
        call kn_pending_answer
        jc kn_bad
        test ax,ax
        jnz kn_advance_menu
        jmp kn_ready_paused
.ordinary_phase:
        cmp word [kr_header+6], 2
        jne .not_active
        cmp byte [kn_mode], 'M'
        je kn_advance_menu
        cmp byte [kn_mode], 'E'
        je kn_advance_empty
        cmp word [fs:KV_FX+8], 2
        jne kn_ready_active
        call kn_pending_answer
        jc kn_bad
        test ax, ax
        jnz kn_advance_menu
        jmp kn_ready_active
.not_active:
        cmp word [kr_header+6], 1
        je .settle
        mov dx, kv_paths+3*112
        call kc_probe
        jc kn_bad
        test ax, ax
        jz .unstarted
        call kn_live_result_status
        jc kn_bad
        cmp ax, 1
        je .old_consumed
        test ax, ax
        jnz kn_bad
        call kn_workspace
        jc kn_bad
        call kn_stage_absent
        jc kn_bad
        call kw_completed
        jc kn_bad
        call kc_close
        jc kn_bad
        call kn_admit_stage
        jc kn_bad
        call kn_publish_stage
        jc kn_bad
.settle:
        cmp word [kr_header+20], 0
        jne .cursor
        call kn_settle
        jc kn_bad
        jmp .produce
.cursor:
        call kn_match_cursor_roster
        jc kn_bad
        call kn_retire_answer
        jc kn_bad
.produce:
        call kn_produce
        jc kn_bad
        jmp kn_ready_active
.old_consumed:
        ; Prepared publication precedes /P. An old consumed result is only
        ; permissible with its exact projected post-roster == new frozen P0,
        ; and no remaining transaction intent or journal.
        call kn_no_transaction
        jc kn_bad
        call kn_old_result_post
        jc kn_bad
        jmp kn_ready_paused
.unstarted:
        call kn_match_prepared_live
        jc kn_bad
        call kn_validate_gsc_optional
        jc kn_bad
        test ax, ax
        jz .no_intent
        call kn_host_complete
        jc kn_bad
.no_intent:
        call kn_no_transaction
        jc kn_bad
        jmp kn_ready_paused

kn_absent:
        xor ax, ax
        clc
        ret
kn_bad:
        call kn_restore_cwd
        mov word [kc_verified], 0
        mov word [kn_restore_authorized], 0
        stc
        ret
kn_close_bad:
        call kc_close
        jmp kn_bad

kn_copy_path:
        mov cx, 56
        rep movsw
        ret
kn_names:
        push ds
        pop es
        cld
        mov si, kn_expected_roster
        call kv_path
        jc kn_bad
        mov si, kn_expected_source
        call kv_path
        jc kn_bad
        mov si, kn_expected_roster
        mov di, kn_authority
        call kn_copy_path
        mov si, kn_authority
        call kn_extension
        jc kn_bad
        mov dword [di], 'GSK'
        mov si, kn_authority
        mov di, kn_backup
        call kn_copy_path
        mov si, kn_backup
        call kn_extension
        jc kn_bad
        mov dword [di], 'GKB'
        mov si, kn_authority
        mov di, kw_stage
        call kn_copy_path
        mov si, kw_stage
        call kn_extension
        jc kn_bad
        mov dword [di], 'GKT'
        clc
        ret
kn_extension:
        xor di, di
        mov cx, 112
.byte: lodsb
        test al, al
        jz .end
        cmp al, '.'
        jne .next
        mov di, si
.next: loop .byte
        jmp kn_bad
.end:  test di, di
        jz kn_bad
        clc
        ret

kn_admit:
        call kr_index
        jc kn_bad
kn_admit_loaded:
        call kv_validate
        jc kn_close_bad
        push ds
        pop es
        mov si, kv_paths
        mov di, kn_expected_source
        mov cx, 112
        repe cmpsb
        jne kn_close_bad
        call kn_response_aliases
        jc kn_close_bad
        mov si, kv_paths+112
        mov di, kn_expected_roster
        mov cx, 112
        repe cmpsb
        jne kn_close_bad
        ; Compare the complete live GLIB against frozen GBID's payload.
        mov di, kn_expected_source
        mov eax, [kr_offsets+16]
        add eax, 16
        mov ecx, [kr_header+40]
        sub ecx, 16
        xor edx, edx
        call kn_compare_range_file
        jc kn_close_bad
        clc
        ret
kn_admit_stage:
        mov dx, kw_stage
        jmp kn_admit

; Recover backup into absence. Existing pairs must prove the actual transition
; before the old backup can be retired; filenames alone prove nothing.
kn_open_current:
        mov dx, kn_authority
        call kc_probe
        jc kn_bad
        mov [kn_has_live], ax
        mov dx, kn_backup
        call kc_probe
        jc kn_bad
        test ax, ax
        jz .live
        mov dx, kn_backup
        call kn_admit
        jc kn_bad
        cmp word [kn_has_live], 0
        jne .pair
        call kc_close
        jc kn_bad
        mov word [kc_verified], 1
        mov si, kn_backup
        mov di, kn_authority
        call kc_recover
        jc kn_bad
        jmp .open
.pair:
        call kn_phase_pair
        jc kn_bad
        call kc_close
        jc kn_bad
        mov dx, kn_authority
        call kn_admit
        jc kn_bad
        mov dx, kn_backup
        call kn_delete_owned
        jc kn_bad
        call kn_recover_candidate
        jc kn_bad
        mov ax, 1
        ret
.live:
        cmp word [kn_has_live], 0
        jne .open
        mov dx, kw_stage
        call kc_probe
        jc kn_bad
        test ax, ax
        jz kn_absent
        call kn_admit_stage
        jc kn_bad
        cmp word [kr_header+6], 0
        jne kn_bad
        call kn_workspace
        jc kn_bad
        call kn_publish_stage
        jc kn_bad
        mov ax, 1
        clc
        ret
.open:
        mov dx, kn_authority
        call kn_admit
        jc kn_bad
        call kn_recover_candidate
        jc kn_bad
        mov ax, 1
        clc
        ret

kn_publish_stage:
        call kc_close
        jc kn_bad
        mov dx, kn_authority
        call kc_probe
        jc kn_bad
        mov [kn_has_live], ax
        mov word [kc_verified], 1
        mov si, kw_stage
        mov di, kn_authority
        test ax, ax
        jz .first
        mov bp, kn_backup
        call kc_replace
        jc kn_bad
        call kn_open_current         ; verify pair and complete new authority
        ret
.first:
        call kc_publish
        jc kn_bad
        mov dx, kn_authority
        jmp kn_admit

kn_match_prepared_live:
        mov word [kn_match_index], 0
.part:
        mov bx, [kn_match_index]
        mov eax, [kr_offsets+bx]
        mov ecx, [kr_header+24+bx]
        xor edx, edx
        mov bx, [kn_match_index]
        shr bx, 1
        mov di, [kn_prepared_paths+bx]
        call kn_compare_range_file
        jc kn_bad
        add word [kn_match_index], 4
        cmp word [kn_match_index], 16
        jb .part
        ; Identity's source bytes already matched by kn_admit.
        clc
        ret

; Exact file/range comparison, requiring complete peer EOF when peer offset=0.
; EAX snapshot offset, EDX peer offset, ECX length, DI canonical peer path.
kn_compare_range_file:
        push ds
        pop es
        mov [kn_cmp_off], eax
        mov [kn_peer_off], edx
        mov [kn_cmp_left], ecx
        mov [kn_cmp_total], ecx
        mov dx, di
        mov ax, 3D00h
        int 21h
        jc kn_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .bad
        movzx eax, ax
        movzx edx, dx
        shl edx, 16
        or eax, edx
        mov edx, [kn_peer_off]
        add edx, [kn_cmp_total]
        jc .bad
        cmp eax, edx
        jb .bad
        cmp byte [kn_peer_exact], 0
        je .chunk
        cmp eax, edx
        jne .bad
.chunk:
        mov eax, [kn_cmp_left]
        test eax, eax
        jz .done
        cmp eax, 512
        jbe .bounded
        mov ax, 512
.bounded:
        mov [kn_cmp_chunk], ax
        mov cx, ax
        cmp byte [kn_bank_compare], 0
        jne .bank
        mov eax, [kn_cmp_off]
        mov di, kc_buf
        call kc_read_at
        jc .bad
        jmp .peer
.bank:
        push ds
        push gs
        pop ds
        mov si, [cs:kn_cmp_off]
        mov di, kc_buf
        rep movsb
        pop ds
.peer:
        mov eax, [kn_peer_off]
        mov dx, ax
        shr eax, 16
        mov cx, ax
        mov bx, [kn_peer_fh]
        mov ax, 4200h
        int 21h
        jc .bad
        cmp ax, [kn_peer_off]
        jne .bad
        cmp dx, [kn_peer_off+2]
        jne .bad
        mov bx, [kn_peer_fh]
        mov cx, [kn_cmp_chunk]
        mov dx, kc_cmp
        mov ah, 3Fh
        int 21h
        jc .bad
        cmp ax, [kn_cmp_chunk]
        jne .bad
        cmp byte [kn_normalize], 0
        je .compare
        cmp dword [kn_peer_off], 0
        jne .compare
        mov ax, [kc_cmp+14]
        cmp ax, 1
        ja .bad
        mov [kn_consumed], ax
        mov word [kc_cmp+14], 0
.compare:
        push ds
        pop es
        mov si, kc_buf
        mov di, kc_cmp
        mov cx, [kn_cmp_chunk]
        repe cmpsb
        jne .bad
        movzx eax, word [kn_cmp_chunk]
        add [kn_cmp_off], eax
        add [kn_peer_off], eax
        sub [kn_cmp_left], eax
        jmp .chunk
.done:
        call kn_peer_close
        ret
.bad:
        call kn_peer_close
        jmp kn_bad
kn_peer_close:
        mov bx, [kn_peer_fh]
        mov ah, 3Eh
        int 21h
        jc kn_bad
        mov word [kn_peer_fh], 0ffffh
        clc
        ret

kn_match_file:
        mov ecx, edx
        xor edx, edx
        jmp kn_compare_range_file
kn_match_post:
        mov di, dx
        xor eax, eax
        xor edx, edx
        movzx ecx, word [kr_header+28]
        mov byte [kn_bank_compare], 1
        call kn_compare_range_file
        pushf
        mov byte [kn_bank_compare], 0
        popf
        ret

; Old snapshot stays open. Validate exact common frozen sections of a forward
; transition; ACTIVE->PREPARED additionally binds next paused cursor/post-roster.
kn_phase_pair:
        mov dx, [kn_pair_path]
        mov ax, 3D00h
        int 21h
        jc kn_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov dx, kn_pair_header
        mov cx, 64
        mov ah, 3Fh
        int 21h
        jc .close_bad
        cmp ax, 64
        jne .close_bad
        call kn_peer_close
        jc kn_bad
        cmp word [kr_header+20],3
        je kn_initial_pair
        mov ax, [kr_header+6]
        inc ax
        cmp ax, 3
        jb .ordinary
        jmp kn_active_pair
.ordinary:
        cmp ax, [kn_pair_header+6]
        jne kn_bad
        mov si, kr_header
        mov di, kn_pair_header
        mov cx, 6
        repe cmpsb
        jne kn_bad
        mov si, kr_header+8
        mov di, kn_pair_header+8
        mov cx, 16
        repe cmpsb
        jne kn_bad
        mov cx, 20
        cmp ax, 1
        je .lengths
        mov cx, 28
.lengths:
        mov [kn_common_lengths], cx
        mov si, kr_header+24
        mov di, kn_pair_header+24
        repe cmpsb
        jne kn_bad
        mov bx, [kn_common_lengths]
        mov ecx, [kr_offsets+bx]
        sub ecx, 64
        mov eax, 64
        mov edx, 64
        mov di, [kn_pair_path]
        mov byte [kn_peer_exact], 0
        call kn_compare_range_file
        pushf
        mov byte [kn_peer_exact], 1
        popf
        ret
.close_bad:
        call kn_peer_close
        jmp kn_bad

kn_active_pair:
        mov byte [kn_pair_cursor], 0
        cmp word [kn_pair_header+6], 0
        je .phase_ok
        cmp word [kn_pair_header+6], 1
        jne kn_bad
        cmp word [kn_pair_header+20], 1
        jb kn_bad
        cmp word [kn_pair_header+20], 2
        ja kn_bad
        mov byte [kn_pair_cursor], 1
.phase_ok:
        mov si, kr_header
        mov di, kn_pair_header
        mov cx, 6
        repe cmpsb
        jne kn_bad
        mov eax, 1184
        mov edx, eax
        mov ecx, KR_CONTEXT
        mov di, [kn_pair_path]
        mov byte [kn_peer_exact], 0
        call kn_compare_range_file
        pushf
        mov byte [kn_peer_exact], 1
        popf
        jc kn_bad
        mov ax, [kr_header+12]
        cmp ax, [kn_pair_header+12]
        jne kn_bad
        mov ax, [kr_header+18]
        cmp ax, [kn_pair_header+18]
        jne kn_bad
        mov eax, [kr_header+28]
        cmp eax, [kn_pair_header+28]
        jne kn_bad
        ; Offset of next roster = fixed body + request.
        mov edx, KR_BODY
        add edx, [kn_pair_header+24]
        movzx ecx, word [kr_header+28]
        xor eax, eax
        mov di, [kn_pair_path]
        mov byte [kn_bank_compare], 1
        mov byte [kn_peer_exact], 0
        call kn_compare_range_file
        pushf
        mov byte [kn_bank_compare], 0
        mov byte [kn_peer_exact], 1
        popf
        jc kn_bad
        ; Next paused cursor is exact previously acknowledged successor.
        mov edx, KR_BODY
        add edx, [kn_pair_header+24]
        add edx, [kn_pair_header+28]
        mov eax, [kr_offsets+28]
        mov ecx, [kr_header+52]
        cmp ecx, [kn_pair_header+32]
        jne kn_bad
        cmp word [kn_pair_header+20], 1
        jne .exact_paused
        cmp byte [kn_pair_cursor], 1
        jne .exact_paused
        mov eax, edx
        mov cx, [kn_pair_header+32]
        mov di, [kn_pair_path]
        mov byte [kn_peer_exact], 0
        call kn_load_peer_fx
        pushf
        mov byte [kn_peer_exact], 1
        popf
        jc kn_bad
        call kn_check_menu_banks
        jc kn_bad
        jmp .source_inputs
.exact_paused:
        mov di, [kn_pair_path]
        mov byte [kn_peer_exact], 0
        call kn_compare_range_file
        pushf
        mov byte [kn_peer_exact], 1
        popf
        jc kn_bad
.source_inputs:
        cmp byte [kn_pair_cursor],1
        jne .physical_request
        mov eax,[kr_offsets]
        mov cx,346
        mov di,kc_buf
        call kc_read_at
        jc .reset_bad
        cmp dword [kc_buf],'GBIR'
        jne .cursor_request_ready
        mov ax,[kn_pair_header+20]
        mov [kc_buf+8],ax
.cursor_request_ready:
        mov eax,KR_BODY
        mov cx,346
        mov di,[kn_pair_path]
        mov byte [kn_peer_exact],0
        call kn_load_peer_fx
        jc .reset_bad
        mov si,kc_buf
        mov di,32000
        mov cx,346
.request_byte:
        lodsb
        cmp al,[fs:di]
        jne .reset_bad
        inc di
        loop .request_byte
        jmp .source_frozen
.physical_request:
        cmp word [kv_initial_origin],0
        je .source_frozen
        cmp word [fs:KV_FX+8],3
        jne .reset_bad
        cmp word [fs:KV_FX+32],0
        je .reset_bad
.source_frozen:
        ; Same complete source and seed, and every ownership path except the
        ; paused/successor swap, are invariant across encounter preparation.
        mov edx, KR_BODY
        add edx, [kn_pair_header+24]
        add edx, [kn_pair_header+28]
        add edx, [kn_pair_header+32]
        mov eax, [kr_offsets+12]
        mov ecx, 150
        mov di, [kn_pair_path]
        mov byte [kn_peer_exact], 0
        call kn_compare_range_file
        jc .reset_bad
        mov edx, KR_BODY
        add edx, [kn_pair_header+24]
        add edx, [kn_pair_header+28]
        add edx, [kn_pair_header+32]
        add edx, [kn_pair_header+36]
        mov eax, [kr_offsets+16]
        mov ecx, [kr_header+40]
        cmp ecx, [kn_pair_header+40]
        jne .reset_bad
        mov di, [kn_pair_path]
        call kn_compare_range_file
        jc .reset_bad
        mov word [kn_pair_index], 0
.paths:
        mov ax, [kn_pair_index]
        cmp byte [kn_pair_cursor], 1
        je .compare_path
        cmp ax, 4*112
        je .next
        cmp ax, 7*112
        je .next
.compare_path:
        movzx eax, ax
        add eax, 64
        mov edx, eax
        mov ecx, 112
        mov di, [kn_pair_path]
        call kn_compare_range_file
        jc .reset_bad
.next:
        add word [kn_pair_index], 112
        cmp word [kn_pair_index], 1120
        jb .paths
        ; Cursor request was compared above, with only a proven GBIR origin rebind.
.done:
        mov byte [kn_peer_exact], 1
        clc
        ret
.reset_bad:
        mov byte [kn_peer_exact], 1
        jmp kn_bad

kn_delete_owned:
        mov ah, 41h
        int 21h
        jnc .ok
        cmp ax, 2
        jne kn_bad
.ok:   clc
        ret

kn_live_result_status:
        mov dx, kv_paths+3*112
        mov di, kn_small
        mov cx, 16
        call kn_read_small
        jc kn_bad
        cmp dword [kn_small], 'GBCR'
        jne kn_bad
        cmp word [kn_small+4], 3
        jne kn_bad
        mov ax, [kn_small+14]
        cmp ax, 1
        ja kn_bad
        clc
        ret
kn_read_small:
        mov [kn_small_dest], di
        mov [kn_small_length], cx
        mov ax, 3D00h
        int 21h
        jc kn_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov dx, [kn_small_dest]
        mov cx, [kn_small_length]
        mov ah, 3Fh
        int 21h
        jc .bad
        cmp ax, [kn_small_length]
        jne .bad
        jmp kn_peer_close
.bad:  call kn_peer_close
        jmp kn_bad

kn_transaction_path:
        push eax
        mov si, kn_expected_roster
        mov di, kn_transaction
        call kn_copy_path
        mov si, kn_transaction
        call kn_extension
        pop eax
        jc kn_bad
        mov [di], eax
        clc
        ret
kn_validate_gsc_optional:
        mov eax, 'GSC'
        call kn_transaction_path
        jc kn_bad
        mov dx, kn_transaction
        call kc_probe
        jc kn_bad
        test ax, ax
        jz .absent
        mov dx, kn_transaction
        mov di, kn_small
        mov cx, 8
        call kn_read_small
        jc kn_bad
        cmp dword [kn_small], 'GSC1'
        jne kn_bad
        cmp word [kn_small+4], 1
        jne kn_bad
        mov ax, [kr_header+28]
        cmp ax, [kn_small+6]
        jne kn_bad
        mov eax, [kr_offsets]
        mov edx, 8
        mov ecx, 346
        mov di, kn_transaction
        mov byte [kn_peer_exact], 0
        call kn_compare_range_file
        pushf
        mov byte [kn_peer_exact], 1
        popf
        jc kn_bad
        mov eax, [kr_offsets+4]
        mov edx, 8+346
        mov ecx, [kr_header+28]
        mov di, kn_transaction
        call kn_compare_range_file
        jc kn_bad
        mov ax, 1
        clc
        ret
.absent: xor ax, ax
        clc
        ret
kn_no_transaction:
        mov word [kn_transaction_index], 0
.next:
        mov bx, [kn_transaction_index]
        mov eax, [kn_transaction_extensions+bx]
        call kn_transaction_path
        jc kn_bad
        mov dx, kn_transaction
        call kc_probe
        jc kn_bad
        test ax, ax
        jnz kn_bad
        add word [kn_transaction_index], 4
        cmp word [kn_transaction_index], 12
        jb .next
        clc
        ret

kn_settle:
        mov byte [kn_normalize], 1
        mov di, kv_paths+3*112
        mov eax, [kr_offsets+20]
        xor edx, edx
        mov ecx, [kr_header+44]
        call kn_compare_range_file
        pushf
        mov byte [kn_normalize], 0
        popf
        jc kn_bad
        call kn_admit_live_roster
        jc kn_bad
        call kn_validate_gsc_optional
        jc kn_bad
        test ax, ax
        jnz .host
        cmp word [kn_consumed], 1
        jne kn_bad
        jmp .settled
.host:
        call kn_host_complete
        jc kn_bad
.settled:
        call kv_validate
        jc kn_bad
        mov byte [kn_normalize], 1
        mov di, kv_paths+3*112
        mov eax, [kr_offsets+20]
        xor edx, edx
        mov ecx, [kr_header+44]
        call kn_compare_range_file
        pushf
        mov byte [kn_normalize], 0
        popf
        jc kn_bad
        cmp word [kn_consumed], 1
        jne kn_bad
        mov dx, kn_expected_roster
        call kn_match_post
        jc kn_bad
        jmp kn_no_transaction

kn_admit_live_roster:
        mov dx, kn_expected_roster
        call kc_probe
        jc kn_bad
        test ax, ax
        jz .backup
        mov di, kn_expected_roster
        mov eax, [kr_offsets+4]
        mov ecx, [kr_header+28]
        xor edx, edx
        call kn_compare_range_file
        jnc .ok
        mov dx, kn_expected_roster
        jmp kn_match_post
.backup:
        ; Missing P is admitted only at the existing HP rename boundary:
        ; exact frozen preimage in B, plus an existing journal checked by /C.
        mov eax, 'GSB'
        call kn_transaction_path
        jc kn_bad
        mov di, kn_transaction
        mov eax, [kr_offsets+4]
        mov ecx, [kr_header+28]
        xor edx, edx
        call kn_compare_range_file
        jc kn_bad
        mov eax, 'GSJ'
        call kn_transaction_path
        jc kn_bad
        mov dx, kn_transaction
        call kc_probe
        jc kn_bad
        cmp ax, 1
        jne kn_bad
.ok: clc
        ret

kn_old_result_post:
        mov dx, kv_paths+3*112
        mov ax, 3D00h
        int 21h
        jc kn_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .bad
        test dx, dx
        jnz .bad
        cmp ax, 16
        jb .bad
        cmp ax, 32768+52
        ja .bad
        mov [sh_result_length], ax
        mov bx, [kn_peer_fh]
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .bad
        mov bx, [kn_peer_fh]
        mov cx, [sh_result_length]
        xor dx, dx
        push ds
        push fs
        pop ds
        mov ah, 3Fh
        int 21h
        pop ds
        jc .bad
        cmp ax, [sh_result_length]
        jne .bad
        call kn_peer_close
        jc kn_bad
        cmp word [fs:14], 1
        jne kn_bad
        mov word [fs:14], 0
        call sh_project
        jc kn_bad
        mov ax, [sr_length]
        cmp ax, [kr_header+28]
        jne kn_bad
        mov eax, [kr_offsets+4]
        mov [kn_cmp_off], eax
        mov word [kn_bank_off], 0
        mov ax, [sr_length]
        mov [kn_bank_left], ax
.chunk:
        mov cx, [kn_bank_left]
        jcxz .done
        cmp cx, 512
        jbe .bounded
        mov cx, 512
.bounded:
        mov [kn_cmp_chunk], cx
        mov eax, [kn_cmp_off]
        mov di, kc_buf
        call kc_read_at
        jc kn_bad
        mov si, kc_buf
        mov di, [kn_bank_off]
        mov cx, [kn_cmp_chunk]
        push gs
        pop es
        repe cmpsb
        push ds
        pop es
        jne kn_bad
        movzx eax, word [kn_cmp_chunk]
        add [kn_cmp_off], eax
        add [kn_bank_off], ax
        sub [kn_bank_left], ax
        jmp .chunk
.done: clc
        ret
.bad: call kn_peer_close
        jmp kn_bad

kn_host_prepare:
        mov si, kn_arg_prepare
        jmp kn_host
kn_host_complete:
        mov si, kn_arg_complete
kn_host:
        push si
        mov di, kv_paths+2*112
        mov eax, [kr_offsets]
        xor edx, edx
        mov ecx, 346
        call kn_compare_range_file
        pop si
        jc kn_bad
        call kn_tail_begin
        call kn_tail_add
        mov si, kv_paths+2*112
        call kn_tail_add
        mov si, kn_space
        call kn_tail_add
        mov si, kn_expected_roster
        call kn_tail_add
        call kn_tail_end
        jc kn_bad
        mov si, kn_prefix
        mov di, kn_child_path
        mov bx, kn_host_name
        call kn_join
        jc kn_bad
        mov dx, kn_child_path
        jmp kn_run_child

kn_tail_begin:
        mov byte [kn_tail], 0
        mov byte [kn_tail_error], 0
        ret
kn_tail_add:
        lodsb
        test al, al
        jz .done
        movzx bx, byte [kn_tail]
        cmp bx, 126
        jae .bad
        mov [kn_tail+1+bx], al
        inc byte [kn_tail]
        jmp kn_tail_add
.bad: mov byte [kn_tail_error], 1
.done: ret
kn_tail_end:
        cmp byte [kn_tail_error], 0
        jne kn_bad
        movzx bx, byte [kn_tail]
        mov byte [kn_tail+1+bx], 13
        clc
        ret

; Canonical directory + basename -> padded owned path, bounded 112 bytes.
kn_join:
        push bx
        push di
        mov cx, 56
        xor ax, ax
        rep stosw
        pop di
        mov cx, 111
.base: lodsb
        test al, al
        jz .slash
        stosb
        loop .base
        pop bx
        jmp kn_bad
.slash:
        cmp byte [di-1], 05ch
        je .name
        mov al, 05ch
        stosb
        dec cx
        jz .bad
.name: pop si
.suffix:
        lodsb
        stosb
        test al, al
        jz .done
        loop .suffix
        jmp kn_bad
.bad: pop bx
        jmp kn_bad
.done: clc
        ret

kn_workspace:
        push ds
        pop es
        mov word [kn_work_index], 0
.paths:
        mov bx, [kn_work_index]
        mov di, [kn_work_paths+bx]
        mov bx, [kn_work_names+bx]
        mov si, kv_paths+9*112
        call kn_join
        jc kn_bad
        add word [kn_work_index], 2
        cmp word [kn_work_index], 18
        jb .paths
        mov dword [kn_marker], 'GBKW'
        mov dword [kn_marker+4], 00080001h
        mov si, kn_authority
        mov di, kn_marker+8
        call kn_copy_path
        mov si, kn_expected_source
        mov di, kn_marker+120
        call kn_copy_path
        ; DOS reports path-not-found for OWNER beneath an absent directory.
        ; Inspect the directory itself first; generic file probes deliberately
        ; keep path/access errors distinct from file absence.
        mov dx, kv_paths+9*112
        mov ax, 4300h
        int 21h
        jc .directory_absent
        test cx, 10h
        jz kn_bad
        mov dx, kn_work_owner
        call kc_probe
        jc kn_bad
        test ax, ax
        jnz .existing
        jmp kn_bad                  ; existing unmarked directory is foreign
.directory_absent:
        cmp ax, 2
        je .create_directory
        cmp ax, 3
        jne kn_bad
.create_directory:
        cmp byte [kn_work_create], 1
        jne kn_bad
        ; A missing marker never authorizes adopting an existing directory.
        mov dx, kv_paths+9*112
        mov ah, 39h
        int 21h
        jc kn_bad
        mov dx, kn_work_owner
        xor cx, cx
        mov ah, 3Ch
        int 21h
        jc kn_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov dx, kn_marker
        mov cx, 232
        mov ah, 40h
        int 21h
        jc .bad
        cmp ax, 232
        jne .bad
        call kn_peer_close
        jc kn_bad
.existing:
        mov dx, kn_work_owner
        mov di, kn_marker_actual
        mov cx, 233
        mov ax, 3D00h
        int 21h
        jc kn_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov dx, kn_marker_actual
        mov cx, 233
        mov ah, 3Fh
        int 21h
        jc .bad
        cmp ax, 232
        jne .bad
        call kn_peer_close
        jc kn_bad
        push ds
        pop es
        mov si, kn_marker
        mov di, kn_marker_actual
        mov cx, 232
        repe cmpsb
        jne kn_bad
        clc
        ret
.bad: call kn_peer_close
        jmp kn_bad

kn_stage_absent:
        mov dx, kw_stage
        call kc_probe
        jc kn_bad
        test ax, ax
        jz .done
        ; Candidate recovery runs before this point. An unexpected existing
        ; file is preserved, never blindly truncated or deleted.
        jmp kn_bad
.done: clc
        ret

; Recover a complete acknowledged next-phase stage before rerunning producers.
; An invalid framing-stage is deletable only under the admitted old marker.
; A framed but semantically foreign candidate is preserved and fails closed.
kn_recover_candidate:
        mov dx, kw_stage
        call kc_probe
        jc kn_bad
        test ax, ax
        jz kn_candidate_none
        call kn_workspace
        jc kn_bad
        call kc_close
        jc kn_bad
        mov dx, kw_stage
        call kr_index
        jc kn_candidate_partial
        call kn_admit_loaded
        jc kn_bad
        call kc_close
        jc kn_bad
        mov dx, kn_authority
        call kn_admit
        jc kn_bad
        mov word [kn_pair_path], kw_stage
        call kn_phase_pair
        pushf
        mov word [kn_pair_path], kn_authority
        popf
        jc kn_bad
        call kc_close
        jc kn_bad
        call kn_admit_stage
        jc kn_bad
        call kn_publish_stage
        jc kn_bad
        mov ax, 1
        clc
        ret

kn_advance_menu:
        mov dx, kv_paths+6*112
        call kc_probe
        jc kn_bad
        test ax, ax
        jz kn_ready_current             ; retry without an invented answer
        cmp word [fs:KV_FX+8], 2
        jne kn_bad
        mov word [kw_advance_kind], 1
        jmp kn_advance_cursor

kn_pending_answer:
        mov dx, kv_paths+6*112
        call kc_probe
        jc kn_bad
        test ax, ax
        jz .none
        mov dx, kv_paths+6*112
        mov di, kn_small
        mov cx, 6
        call kn_read_small
        jc kn_bad
        cmp dword [kn_small], 'GBMO'
        jne .previous
        cmp word [kn_small+4], 2
        jne kn_bad
        mov ax, 1
        clc
        ret
.previous:
        ; The exact prior combat/empty outcome may still occupy the shared
        ; answer name. It is not a new menu answer and cannot consume a menu.
        mov di, kv_paths+6*112
        mov eax, [kr_offsets+24]
        mov ecx, [kr_header+48]
        xor edx, edx
        call kn_compare_range_file
        jc kn_bad
.none: xor ax, ax
        clc
        ret
kn_advance_empty:
        cmp word [fs:KV_FX+8], 3
        jne kn_ready_current
        mov word [kw_advance_kind], 2
kn_advance_cursor:
        ; Cursor acknowledgement introduces no HP transaction. GS already
        ; holds the old exact projected post-roster (or cursor roster), so
        ; bind that live party without requiring a retained old GBCR file.
        call kn_match_cursor_roster
        jc kn_bad
.context:
        call kv_validate
        jc kn_bad
        push ds
        pop es
        cmp word [kw_advance_kind], 1
        jne .empty
        mov di,kv_paths+7*112
        mov cx,[kr_header+52]
        cmp word [kr_header+20],3
        jne .menu_source
        mov di,kv_paths+4*112
        mov cx,[kr_header+32]
.menu_source:
        xor eax,eax
        call kn_load_peer_fx
        jc kn_bad
        call kn_check_menu_banks
        jc kn_bad
        call kn_validate_answer
        jc kn_bad
        jmp .snapshot
.empty:
        mov di,kv_paths+7*112
        mov eax,[kr_offsets+28]
        mov edx,[kr_header+52]
        cmp word [kr_header+20],3
        jne .empty_source
        mov di,kv_paths+4*112
        mov eax,[kr_offsets+8]
        mov edx,[kr_header+32]
.empty_source:
        call kn_match_file
        jc kn_bad
        call kn_validate_answer
        jc kn_bad
.snapshot:
        call kn_workspace
        jc kn_bad
        call kn_stage_absent
        jc kn_bad
        call kw_advance
        jc kn_bad
        call kc_close
        jc kn_bad
        call kn_admit_stage
        jc kn_bad
        call kn_prove_forward_stage
        jc kn_bad
        call kn_publish_stage
        jc kn_bad
        call kn_match_cursor_roster
        jc kn_bad
        call kn_retire_answer
        jc kn_bad
        call kn_produce
        jc kn_bad
        jmp kn_ready_active

kn_match_cursor_roster:
        mov dx, kn_expected_roster
        call kn_match_post
        jc kn_bad
        jmp kn_no_transaction
kn_retire_answer:
        cmp word [kr_header+20], 1
        jne .done
        mov dx, kv_paths+6*112
        call kc_probe
        jc kn_bad
        test ax, ax
        jz .done
        mov di, kv_paths+6*112
        mov eax, [kr_offsets+24]
        mov ecx, [kr_header+48]
        xor edx, edx
        call kn_compare_range_file
        jc kn_bad
        mov dx, kv_paths+6*112
        call kn_delete_owned
        jc kn_bad
.done: clc
        ret

kn_validate_answer:
        mov dx, kv_paths+6*112
        mov ax, 3D00h
        int 21h
        jc kn_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .bad
        test dx, dx
        jnz .bad
        mov cx, 18
        cmp word [kw_advance_kind], 1
        je .size
        mov cx, 9                    ; GBBOOT's empty-combat producer: victory CRLF
.size:
        cmp ax, cx
        jne .bad
        mov [kn_small_length], cx
        mov bx, [kn_peer_fh]
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .bad
        mov bx, [kn_peer_fh]
        mov cx, [kn_small_length]
        mov dx, kn_small
        mov ah, 3Fh
        int 21h
        jc .bad
        cmp ax, [kn_small_length]
        jne .bad
        call kn_peer_close
        jc kn_bad
        cmp word [kw_advance_kind], 1
        jne .victory
        cmp dword [kn_small], 'GBMO'
        jne kn_bad
        cmp word [kn_small+4], 2
        jne kn_bad
        mov ax, [kn_small+8]
        cmp ax, [fs:32000+5758]
        jne kn_bad
        mov si, kn_small+10
        mov di, 32000+5766
        mov cx, 4
.identity:
        lodsw
        cmp ax, [fs:di]
        jne kn_bad
        add di, 2
        loop .identity
        mov ax, [kn_small+6]
        cmp word [fs:32000+5760], 39h
        jne .ordinary_answer
        cmp ax, 0ffffh
        jne .who_answer
        cmp word [fs:KV_FX+5940], 1
        je kn_bad
        cmp word [fs:32000+5940], 1
        je kn_bad
        jmp .done
.who_answer:
        mov dx, ax
        inc dx
        cmp word [fs:32000+5940], 1
        jne kn_bad
        cmp dx, [fs:32000+5942]
        jne kn_bad
.ordinary_answer:
        cmp word [fs:32000+5760], 0fh
        je .number
        cmp word [fs:32000+5760], 10h
        je .string
        cmp ax, [kn_small+8]
        jae kn_bad
        jmp .done
.number:
        cmp word [kn_small+8], 0
        jne kn_bad
        jmp .done
.string:
        test ax, ax
        jnz kn_bad
        jmp .done
.victory:
        push ds
        pop es
        mov si, kn_small
        mov di, kn_empty_token
        mov cx, 9
        repe cmpsb
        jne kn_bad
.done: clc
        ret
.bad: call kn_peer_close
        jmp kn_bad

; DI peer file, EAX range offset, CX length. Load candidate into disposable
; FS:32000 while retaining old authoritative successor in FS:KV_FX.
kn_load_peer_fx:
        mov [kn_cmp_off], eax
        mov [kn_small_length], cx
        mov dx, di
        mov ax, 3D00h
        int 21h
        jc kn_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .bad
        movzx eax, ax
        movzx edx, dx
        shl edx, 16
        or eax, edx
        movzx edx, word [kn_small_length]
        add edx, [kn_cmp_off]
        jc .bad
        cmp eax, edx
        jb .bad
        cmp byte [kn_peer_exact], 0
        je .seek
        cmp eax, edx
        jne .bad
.seek:
        mov eax, [kn_cmp_off]
        mov dx, ax
        shr eax, 16
        mov cx, ax
        mov bx, [kn_peer_fh]
        mov ax, 4200h
        int 21h
        jc .bad
        mov bx, [kn_peer_fh]
        mov dx, 32000
        mov cx, [kn_small_length]
        push ds
        push fs
        pop ds
        mov ah, 3Fh
        int 21h
        pop ds
        jc .bad
        cmp ax, [kn_small_length]
        jne .bad
        call kn_peer_close
        ret
.bad: call kn_peer_close
        jmp kn_bad

; The response is an owned scratch endpoint, never any input/authority,
; effect sibling, restoration journal, tool or workspace marker. This runs
; before HP settlement and before restoration, not merely before final write.
kn_response_aliases:
        cmp byte [kn_mode], 'P'
        je .done
        mov si, kn_response
        call kv_path
        jc kn_bad
        mov word [kn_alias_index], 0
.direct:
        mov si, kv_paths
        add si, [kn_alias_index]
        call kn_no_response_alias
        jc kn_bad
        add word [kn_alias_index], 112
        cmp word [kn_alias_index], 1120
        jb .direct
        mov word [kn_alias_index], 0
.roster:
        mov si, kn_expected_roster
        mov di, kn_alias_path
        call kn_copy_path
        mov si, kn_alias_path
        call kn_extension
        jc kn_bad
        mov bx, [kn_alias_index]
        mov eax, [kn_alias_roster_exts+bx]
        mov [di], eax
        mov si, kn_alias_path
        call kn_no_response_alias
        jc kn_bad
        add word [kn_alias_index], 4
        cmp word [kn_alias_index], 40
        jb .roster
        mov word [kn_alias_base], 0
.effect:
        mov bx, [kn_alias_base]
        mov si, [kn_alias_effect_paths+bx]
        mov di, kn_alias_path
        call kn_copy_path
        mov word [kn_alias_index], 0
.extension:
        mov si, kn_alias_path
        call kn_extension
        jc kn_bad
        mov bx, [kn_alias_index]
        mov eax, [kn_alias_fx_exts+bx]
        mov [di], eax
        mov si, kn_alias_path
        call kn_alias_restoration
        jc kn_bad
        add word [kn_alias_index], 4
        cmp word [kn_alias_index], 20
        jb .extension
        ; Canonical FX itself also owns per-target restoration siblings.
        mov bx, [kn_alias_base]
        mov si, [kn_alias_effect_paths+bx]
        mov di, kn_alias_path
        call kn_copy_path
        mov si, kn_alias_path
        call kn_alias_restoration
        jc kn_bad
        add word [kn_alias_base], 2
        cmp word [kn_alias_base], 4
        jb .effect
        mov si, kv_paths+5*112
        mov di, kn_alias_path
        call kn_copy_path
        mov si, kn_alias_path
        call kn_alias_restoration
        jc kn_bad
        mov word [kn_alias_index], 0
.workspace:
        mov bx, [kn_alias_index]
        mov bx, [kn_alias_work_names+bx]
        test bx, bx
        jz .done
        mov si, kv_paths+9*112
        mov di, kn_alias_path
        call kn_join
        jc kn_bad
        mov si, kn_alias_path
        call kn_alias_restoration
        jc kn_bad
        add word [kn_alias_index], 2
        jmp .workspace
.done: clc
        ret
kn_no_response_alias:
        push ds
        pop es
        mov di, kn_response
        mov cx, 112
        repe cmpsb
        je kn_bad
        clc
        ret
kn_alias_restoration:
        push si
        call kn_no_response_alias
        pop si
        jc kn_bad
        call kn_extension
        jc kn_bad
        mov al, [di]
        mov [kn_alias_character], al
        mov word [di], 'GN'
        mov [di+2], al
        mov byte [di+3], 0
        mov si, kn_alias_path
        call kn_no_response_alias
        jc kn_bad
        mov si, kn_alias_path
        call kn_extension
        jc kn_bad
        mov word [di], 'GO'
        mov al, [kn_alias_character]
        mov [di+2], al
        mov si, kn_alias_path
        jmp kn_no_response_alias
kn_candidate_partial:
        cmp word [kr_error], 2          ; positively malformed framing only
        jne kn_bad                     ; transient IO cannot retire a candidate
        cmp word [kc_fh], 0ffffh
        jne kn_bad
        mov dx, kn_authority
        call kn_admit
        jc kn_bad
        mov dx, kw_stage
        call kn_delete_owned
        jc kn_bad
kn_candidate_none:
        xor ax, ax
        clc
        ret

kn_produce:
        call kn_workspace
        jc kn_bad
        cmp byte [kn_capture_mode], 0
        jne .capturing
        call kn_recover_candidate
        jc kn_bad
.capturing:
        cmp word [kr_header+6], 2
        je .done
        ; Every listed name is disposable only after exact OWNER admission.
        mov word [kn_work_index], 0
.clean:
        mov bx, [kn_work_index]
        mov bx, [kn_cleanup_names+bx]
        test bx, bx
        jz .inputs
        mov si, kv_paths+9*112
        mov di, kn_cleanup_path
        call kn_join
        jc kn_bad
        mov dx, kn_cleanup_path
        call kn_delete_owned
        jc kn_bad
        add word [kn_work_index], 2
        jmp .clean
.inputs:
        mov word [kn_restore_authorized], 1
        mov si, kn_work_input
        mov eax, [kr_offsets+8]
        mov edx, [kr_header+32]
        call kn_restore_section
        jc kn_bad
        mov si, kn_work_identity
        mov eax, [kr_offsets+16]
        mov edx, [kr_header+40]
        call kn_restore_section
        jc kn_bad
        mov si, kn_work_source
        mov eax, [kr_offsets+16]
        add eax, 16
        mov edx, [kr_header+40]
        sub edx, 16
        call kn_restore_section
        jc kn_bad
        mov si, kn_work_seed
        mov eax, [kr_offsets+12]
        mov edx, 150
        call kn_restore_section
        jc kn_bad
        mov si, kn_work_outcome
        mov eax, [kr_offsets+24]
        mov edx, [kr_header+48]
        call kn_restore_section
        jc kn_bad
        mov si, kn_prefix
        mov di, kn_child_path
        mov bx, kv_work_flow
        call kn_join
        jc kn_bad
        mov dx, kn_child_path
        mov di, kn_work_flow
        call kn_copy_file
        jc kn_bad
        mov si, kn_prefix
        mov di, kn_child_path
        mov bx, kv_work_ecl
        call kn_join
        jc kn_bad
        mov dx, kn_child_path
        mov di, kn_work_ecl
        call kn_copy_file
        jc kn_bad
        mov si, kv_paths+9*112
        mov di, kn_work_output
        mov bx, kn_output_name
        call kn_join
        jc kn_bad
        call kn_query_strength
        jc kn_bad
        call kn_query_names
        jc kn_bad
        ; Absolute arguments, but fixed private GBR.EFX is confined by cwd.
        call kn_save_cwd
        jc kn_bad
        mov dl, [kn_work_drive]
        mov ah, 0Eh
        int 21h
        mov dx, kv_paths+9*112
        mov ah, 3Bh
        int 21h
        jc kn_bad
        call kn_build_producer_tail
        jc kn_bad
        mov dx, kn_work_flow
        call kn_run_child
        jc kn_bad
        call kn_restore_cwd
        jc kn_bad
        ; Writer copies closed isolated output and receipt; semantic validator
        ; then admits the entire effect/stream/receipt before activation.
        call kn_stage_absent
        jc kn_bad
        mov word [kw_producer_source], kn_work_output
        call kw_active
        pushf
        mov word [kw_producer_source], 0
        popf
        jc kn_bad
        call kc_close
        jc kn_bad
        call kn_admit_stage
        jc kn_bad
        cmp byte [kn_capture_mode], 0
        je .publish
        call kc_close                 ; fully admitted private output only
        jc kn_bad
        jmp .done
.publish:
        call kn_publish_stage
        jc kn_bad
.done: clc
        ret

; Capture an actual producer/GBKO under admitted GKW ownership while the
; public outer GSK4 remains live. Input is an independently admitted COMPLETE
; GSK3; DX=its exact standalone filename. Only CAPTURE.GSK in the existing
; private workspace is produced. CF0 AX=0 new /1 exact cold capture reused.
; No ordinary GKT recovery, READY, answer retirement or publication is allowed.
kn_capture_producer:
        mov word [kc_verified], 0
        mov word [kn_restore_authorized], 0
        cmp byte [kc_view_active], 0
        jne kn_bad
        cmp byte [kn_capture_mode], 0
        jne kn_bad
        cmp word [kr_header+6], 1
        jne kn_bad
        mov ax, [kr_header+20]
        dec ax
        cmp ax, 1
        ja kn_bad
        mov ax, [kr_header+20]
        mov [kn_capture_kind], ax
        mov eax, [kc_extent]
        mov [kn_capture_input_length], eax
        mov si, dx
        mov di, kn_capture_input_path
        call kn_copy_path
        ; Filename and current open snapshot must describe the SAME whole
        ; standalone input, not a same-PC/schema alternative from the caller.
        mov byte [kn_peer_exact], 1
        mov byte [kn_normalize], 0
        mov byte [kn_bank_compare], 0
        xor eax, eax
        mov ecx, [kn_capture_input_length]
        xor edx, edx
        mov di, kn_capture_input_path
        call kn_compare_range_file
        jc kn_bad
        call kn_match_cursor_roster
        jc kn_bad
        call kn_workspace
        jc kn_bad
        push ds
        pop es
        mov si, kw_stage
        mov di, kn_capture_saved_stage
        mov cx, 112
        rep movsb
        mov si, kv_paths+9*112
        mov di, kw_stage
        mov bx, kn_capture_name
        call kn_join
        jc .restore
        mov byte [kn_capture_mode], 1
        call kn_capture_existing
        jc .restore
        test ax, ax
        jnz .restore
        call kn_produce
        jc .restore
        xor ax, ax
.restore:
        pushf
        mov byte [kn_capture_mode], 0
        mov word [kc_verified], 0
        mov word [kn_restore_authorized], 0
        push ds
        pop es
        mov si, kn_capture_saved_stage
        mov di, kw_stage
        mov cx, 112
        rep movsb
        popf
        ret

; A closed previous capture must bind the WHOLE current standalone COMPLETE
; input before any workspace cleanup, derived query, EXEC or write. Malformed,
; foreign or IO-failed captures are preserved for typed outer recovery.
kn_capture_existing:
        mov dx, kw_stage
        call kc_probe
        jc kn_bad
        test ax, ax
        jz .none
        call kc_close
        jc kn_bad
        call kn_admit_stage
        jc kn_bad
        cmp word [kr_header+6], 2
        jne kn_bad
        mov ax, [kn_capture_kind]
        cmp ax, [kr_header+20]
        jne kn_bad
        call kn_match_cursor_roster
        jc kn_bad
        mov ecx, [kn_capture_input_length]
        cmp ecx, [kr_receipt+8]
        jne kn_bad
        mov eax, [kr_receipt_input]
        mov di, kn_capture_input_path
        xor edx, edx
        mov byte [kn_peer_exact], 1
        mov byte [kn_normalize], 0
        mov byte [kn_bank_compare], 0
        call kn_compare_range_file
        jc kn_bad
        call kn_workspace
        jc kn_bad
        call kc_close
        jc kn_bad
        mov ax, 1
        clc
        ret
.none: xor ax, ax
        clc
        ret

kn_capture_mode db 0
kn_capture_name db 'CAPTURE.GSK',0
kn_capture_saved_stage times 112 db 0
kn_capture_input_path times 112 db 0
kn_capture_input_length dd 0
kn_capture_kind dw 0

; Fresh read-only query from the admitted settled P1. Never freeze derived Z
; into GBCX: every new producer invocation repeats this query after settlement.
kn_query_strength:
        mov byte [kn_metric_valid], 0
        test word [kv_context+8], 1
        jnz .done
        mov si, kv_paths+9*112
        mov di, kn_metric_path
        mov bx, kv_work_stat
        call kn_join
        jc kn_bad
        mov dx, kn_metric_path
        call kn_delete_owned           ; only the admitted fixed STAT.GSM
        jc kn_bad
        call kn_tail_begin
        mov si, kn_arg_metric
        call kn_tail_add
        mov si, kn_expected_roster
        call kn_tail_add
        mov si, kn_space
        call kn_tail_add
        mov si, kn_metric_path
        call kn_tail_add
        call kn_tail_end
        jc kn_bad
        mov si, kn_prefix
        mov di, kn_child_path
        mov bx, kn_party_name
        call kn_join
        jc kn_bad
        mov dx, kn_child_path
        call kn_run_child
        jc kn_bad
        ; Exact extent/read/close through disposable bank; source effect intact.
        mov byte [kn_peer_exact], 1
        mov di, kn_metric_path
        xor eax, eax
        mov cx, 16
        call kn_load_peer_fx
        jc kn_bad
        cmp dword [fs:32000], 'GBSM'
        jne kn_bad
        cmp dword [fs:32004], 00100001h
        jne kn_bad
        mov ax, [fs:32008]
        cmp ax, 255
        ja kn_bad
        mov [kn_metric_value], ax
        mov ax, [fs:32010]
        cmp ax, [kr_header+12]
        jne kn_bad
        mov ax, [fs:32012]
        cmp ax, [kr_header+28]
        jne kn_bad
        cmp word [fs:32014], 0
        jne kn_bad
        mov byte [kn_metric_valid], 1
.done: clc
        ret

; Complete bounded producer tail, shared by the actual EXEC and capacity tests.
kn_build_producer_tail:
        call kn_tail_begin
        mov si, kn_space
        call kn_tail_add
        mov si, kn_source_name
        call kn_tail_add
        mov si, kn_space
        call kn_tail_add
        mov ax, [kr_header+14]
        call kn_tail_decimal
        mov si, kn_arg_seed
        call kn_tail_add
        mov si, kv_work_seed
        call kn_tail_add
        mov si, kn_arg_secret
        call kn_tail_add
        cmp byte [kn_names_valid], 1
        jne kn_bad
        mov si, kn_arg_names
        call kn_tail_add
        call kn_context_args
        jc kn_bad
        test word [kv_context+8], 1
        jnz .strength_done
        cmp byte [kn_metric_valid], 1
        jne kn_bad
        mov si, kn_ctx_z
        call kn_tail_add
        mov ax, [kn_metric_value]
        call kn_tail_decimal
.strength_done:
        cmp word [kr_header+18], 0
        je .mode
        mov si, kn_arg_interactive
        call kn_tail_add
.mode:
        mov si, kn_arg_resume
        call kn_tail_add
        mov si, kv_work_input
        call kn_tail_add
        mov si, kn_space
        call kn_tail_add
        mov si, kv_work_outcome
        call kn_tail_add
        mov si, kn_arg_effect
        call kn_tail_add
        mov si, kn_output_name
        call kn_tail_add
        call kn_tail_end
        jc kn_bad
        cmp byte [kn_tail], 114        ; reserve CCFLOW's capacity replay suffix
        ja kn_bad
        clc
        ret

kn_save_cwd:
        push ds
        pop es
        mov di, kn_previous_cwd
        xor ax, ax
        mov cx, 56
        rep stosw
        mov ah, 19h
        int 21h
        mov [kn_previous_drive], al
        mov al, [kv_paths+9*112]
        mov [kn_previous_cwd], al
        sub al, 'A'
        mov [kn_work_drive], al
        mov word [kn_previous_cwd+1], 05c3ah
        mov dl, al
        inc dl
        mov si, kn_previous_cwd+3
        mov ah, 47h
        int 21h
        jc .bad
        mov byte [kn_cwd_owned], 1
        clc
        ret
.bad: stc
        ret
kn_restore_cwd:
        cmp byte [kn_cwd_owned], 1
        jne .done
        mov dl, [kn_work_drive]
        mov ah, 0Eh
        int 21h
        mov dx, kn_previous_cwd
        mov ah, 3Bh
        int 21h
        pushf
        mov dl, [kn_previous_drive]
        mov ah, 0Eh
        int 21h
        popf
        jc .bad
        mov byte [kn_cwd_owned], 0
.done: clc
        ret
.bad: stc
        ret

kn_tail_decimal:
        xor cx, cx
        mov bx, 10
.divide:
        xor dx, dx
        div bx
        push dx
        inc cx
        test ax, ax
        jnz .divide
.digit:
        pop ax
        add al, '0'
        mov [kn_digit], al
        push cx
        mov si, kn_digit
        call kn_tail_add
        pop cx
        loop .digit
        ret

; Existing CCECL scalar options, compact decimal forms. Defaults remain absent
; and explicit zero stays present; the source/context pair was fully admitted.
kn_context_args:
        mov word [kn_context_index], 0
.next:
        mov ax, [kn_context_index]
        cmp ax, 6
        jae .done
        bt word [kv_context+8], ax
        jnc .skip
        mov bx, ax
        shl bx, 1
        mov si, [kn_context_options+bx]
        call kn_tail_add
        mov bx, [kn_context_index]
        shl bx, 1
        mov ax, [kv_context+10+bx]
        call kn_tail_decimal
.skip:
        inc word [kn_context_index]
        jmp .next
.done:
        clc
        ret

kn_ready_paused:
        mov word [kn_ready_section], 8
        mov word [kn_ready_path], kv_paths+4*112
        jmp kn_ready
kn_ready_active:
        cmp word [kr_header+20], 0
        jne .cursor
        call kn_settle
        jc kn_bad
        jmp .validated
.cursor:
        call kn_match_cursor_roster
        jc kn_bad
.validated:
        call kv_validate
        jc kn_bad
        mov word [kn_ready_section], 28
        mov word [kn_ready_path], kv_paths+7*112
kn_ready:
        call kn_check_dispatch
        jc kn_bad
        call kn_workspace
        jc kn_bad
        mov word [kn_restore_authorized], 1
        mov bx, [kn_ready_section]
        mov eax, [kr_offsets+bx]
        mov edx, [kr_header+24+bx]
        mov si, [kn_ready_path]
        call kn_restore_section
        jc kn_bad
        mov si, kv_paths+5*112
        mov eax, [kr_offsets+12]
        mov edx, 150
        call kn_restore_section
        jc kn_bad
        mov si, [kn_ready_path]
        mov di, kn_ready_identity
        call kn_copy_path
        mov si, kn_ready_identity
        call kn_extension
        jc kn_bad
        mov dword [di], 'IDN'
        mov si, kn_ready_identity
        mov eax, [kr_offsets+16]
        mov edx, [kr_header+40]
        call kn_restore_section
        jc kn_bad
        cmp word [kr_header+20],3
        je .ready_stream
        cmp word [kr_header+6], 2
        jne .response
.ready_stream:
        mov si, [kn_ready_path]
        mov di, kn_ready_stream
        call kn_copy_path
        mov si, kn_ready_stream
        call kn_extension
        jc kn_bad
        mov dword [di], 'GBS'
        cmp dword [kr_header+56], 0
        je .no_stream
        mov si, kn_ready_stream
        mov eax, [kr_offsets+32]
        mov edx, [kr_header+56]
        call kn_restore_section
        jc kn_bad
        jmp .response
.no_stream:
        ; ACTIVE owns absence as well as bytes. A former successor sidecar
        ; cannot remain authoritative after its flag/stream was retired.
        mov dx, kn_ready_stream
        call kn_delete_owned
        jc kn_bad
.response:
        mov si, kn_response
        call kv_path
        jc kn_bad
        mov word [kn_work_index], 0
.disjoint:
        mov si, kn_response
        mov di, kv_paths
        add di, [kn_work_index]
        call kc_disjoint
        jc kn_bad
        add word [kn_work_index], 112
        cmp word [kn_work_index], 1120
        jb .disjoint
        push ds
        pop es
        mov di, kn_ready_response
        xor ax, ax
        mov cx, 196
        rep stosw
        mov dword [kn_ready_response], 'GBNR'
        mov dword [kn_ready_response+4], 00180003h
        mov ax, [fs:KV_FX+122]
        mov [kn_ready_response+8], ax
        mov ax, [kr_header+12]
        mov [kn_ready_response+10], ax
        mov ax, [kr_header+18]
        mov [kn_ready_response+12], ax
        mov word [kn_ready_response+14], 1
        mov word [kn_ready_response+16], 4
        mov si, kn_expected_source
        mov di, kn_ready_response+24
        call kn_copy_path
        mov si, [kn_ready_path]
        mov di, kn_ready_response+136
        call kn_copy_path
        mov si, kv_paths+5*112
        mov di, kn_ready_response+248
        call kn_copy_path
        mov si, kv_context
        mov di, kn_ready_response+360
        mov cx, KR_CONTEXT/2
        rep movsw
        mov dx, kn_response
        xor cx, cx
        mov ah, 3Ch
        int 21h
        jc kn_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov dx, kn_ready_response
        mov cx, 392
        mov ah, 40h
        int 21h
        jc .bad
        cmp ax, 392
        jne .bad
        call kn_peer_close
        jc kn_bad
        mov ax, 2
        clc
        ret
.bad: call kn_peer_close
        jmp kn_bad

kn_pair_path dw kn_authority
kn_work_create db 0
kn_work_output times 112 db 0
kn_output_name db 'O.EFX',0
kn_cleanup_path times 112 db 0
kn_cleanup_names dw kn_legacy_outcome,kn_legacy_output,kn_legacy_stream,kn_legacy_spool,kn_legacy_payload,kv_work_input,kv_work_identity,kv_work_seed,kv_work_outcome,kv_work_flow,kv_work_ecl,kv_work_gbr,kn_source_name,kn_output_name,kn_output_stream,kn_output_spool,kn_output_payload,0
kn_output_stream db 'O.GBS',0
kn_output_spool db 'O.GBT',0
kn_output_payload db 'O.GBP',0
kn_arg_seed db ' /G ',0
kn_arg_secret db ' /ID4',0
kn_arg_resume db ' /R ',0
kn_arg_effect db ' /E ',0
kn_arg_interactive db ' /!',0
kn_digit db 0,0
kn_ready_section dw 0
kn_ready_path dw 0
kn_ready_identity times 112 db 0
kn_ready_stream times 112 db 0
kn_ready_response times 392 db 0
kn_previous_cwd times 112 db 0
kn_previous_drive db 0
kn_work_drive db 0
kn_cwd_owned db 0
kn_pair_cursor db 0
kn_alias_index dw 0
kn_alias_base dw 0
kn_alias_path times 112 db 0
kn_alias_character db 0
kn_alias_roster_exts dd 'GSK','GKB','GKT','GKD','GSC','GSD','GSJ','GSB','GSN','GST'
kn_alias_effect_paths dw kv_paths+4*112,kv_paths+7*112
kn_alias_fx_exts dd 'IDN','GBS','GBT','GBP','DOP'
kn_alias_work_names dw kv_work_who,kn_legacy_outcome,kn_legacy_output,kn_legacy_stream,kn_legacy_spool,kn_legacy_payload,kv_work_stat,kn_owner_name,kv_work_input,kv_work_identity,kv_work_seed,kv_work_outcome,kn_source_name,kn_output_name,kn_output_stream,kv_work_gbr,kv_work_flow,kv_work_ecl,kn_work_host_name,kn_output_spool,kn_output_payload,kv_work_capture,0
kn_work_host_name db 'HOST.BIN',0
kn_empty_token db 'victory',13,10

kn_small times 64 db 0
kn_small_dest dw 0
kn_small_length dw 0
kn_transaction times 112 db 0
kn_transaction_index dw 0
kn_transaction_extensions dd 'GSC','GSJ','GSB'
kn_bank_off dw 0
kn_bank_left dw 0
kn_arg_prepare db ' /P ',0
kn_arg_complete db ' /C ',0
kn_space db ' ',0
kn_host_name db 'CCHOST.COM',0
kn_tail_error db 0
kn_child_path times 112 db 0
kn_work_input times 112 db 0
kn_work_identity times 112 db 0
kn_work_source times 112 db 0
kn_work_seed times 112 db 0
kn_work_outcome times 112 db 0
kn_work_flow times 112 db 0
kn_work_ecl times 112 db 0
kn_work_gbr times 112 db 0
kn_work_owner times 112 db 0
kn_owner_name db 'OWNER.BIN',0
kn_work_paths dw kn_work_input,kn_work_identity,kn_work_seed,kn_work_outcome,kn_work_flow,kn_work_ecl,kn_work_gbr,kn_work_owner,kn_work_source
kn_work_names dw kv_work_input,kv_work_identity,kv_work_seed,kv_work_outcome,kv_work_flow,kv_work_ecl,kv_work_gbr,kn_owner_name,kn_source_name
kn_work_index dw 0
kn_marker times 232 db 0
kn_marker_actual times 233 db 0

kn_authority times 112 db 0
kn_backup times 112 db 0
kn_new_header times 64 db 0
; /P owns these ten paths before any reward RW/RZ lifetime. The separate
; eleventh ITEM path at rw_paths+1120 is never preparation scratch.
%ifdef KN_PATH_OVERLAY
kn_new_paths equ rw_paths
%else
kn_new_paths times 1120 db 0
%endif
kn_new_context times KR_CONTEXT db 0
kn_source_name db 'SRC.GLB',0
kn_context_index dw 0
kn_context_options dw kn_ctx_z,kn_ctx_l,kn_ctx_c,kn_ctx_y,kn_ctx_o,kn_ctx_w
kn_ctx_z db ' /Z',0
kn_ctx_l db ' /L',0
kn_ctx_c db ' /C',0
kn_ctx_y db ' /Y',0
kn_ctx_o db ' /O',0
kn_ctx_w db ' /W',0
kn_peer_fh dw 0ffffh
kn_has_live dw 0
kn_match_index dw 0
kn_cmp_off dd 0
kn_peer_off dd 0
kn_cmp_left dd 0
kn_cmp_total dd 0
kn_cmp_chunk dw 0
kn_normalize db 0
kn_peer_exact db 1
kn_bank_compare db 0
kn_consumed dw 0
kn_prepared_paths dw kv_paths+2*112,kv_paths+112,kv_paths+4*112,kv_paths+5*112
kn_pair_header times 64 db 0
kn_common_lengths dw 0
kn_pair_index dw 0

kn_metric_valid db 0
kn_metric_value dw 0
kn_metric_path times 112 db 0
kn_arg_metric db ' /V ',0
kn_party_name db 'CCPARTY.COM',0

kn_names_valid db 0
kn_names_path times 112 db 0
kn_arg_names db ' /B W.GWN',0
kn_arg_names_query db ' /W ',0
kn_legacy_outcome db 'OUTCOME.OUT',0
kn_legacy_output db 'OUTPUT.EFX',0
kn_legacy_stream db 'OUTPUT.GBS',0
kn_legacy_spool db 'OUTPUT.GBT',0
kn_legacy_payload db 'OUTPUT.GBP',0

kn_query_names:
        mov byte [kn_names_valid], 0
        mov si, kv_paths+9*112
        mov di, kn_names_path
        mov bx, kv_work_who
        call kn_join
        jc kn_bad
        mov dx, kn_names_path
        call kn_delete_owned
        jc kn_bad
        call kn_tail_begin
        mov si, kn_arg_names_query
        call kn_tail_add
        mov si, kn_expected_roster
        call kn_tail_add
        mov si, kn_space
        call kn_tail_add
        mov si, kn_names_path
        call kn_tail_add
        call kn_tail_end
        jc kn_bad
        mov si, kn_prefix
        mov di, kn_child_path
        mov bx, kn_party_name
        call kn_join
        jc kn_bad
        mov dx, kn_child_path
        call kn_run_child
        jc kn_bad
        mov ax, [kr_header+12]
        imul ax,ax,30
        add ax,32
        mov cx, ax
        mov byte [kn_peer_exact], 1
        mov di, kn_names_path
        xor eax, eax
        call kn_load_peer_fx
        jc kn_bad
        cmp dword [fs:32000], 'GBWN'
        jne kn_bad
        cmp word [fs:32004], 3
        jne kn_bad
        mov ax, [kr_header+12]
        cmp ax, [fs:32008]
        jne kn_bad
        imul ax,ax,30
        add ax,32
        cmp ax, [fs:32006]
        jne kn_bad
        cmp word [fs:32010], 4
        jne kn_bad
        mov ax, [kr_header+28]
        cmp ax, [fs:32012]
        jne kn_bad
        cmp word [fs:32014], 0
        jne kn_bad
        xor bx, bx
.row:
        imul si, bx, 440
        add si, 17
        movzx cx, byte [gs:si]
        mov di, bx
        shl di, 4
        add di, 32016
        cmp cl,[fs:di]             ; GBWN carries a canonical Pascal row.
        jne kn_bad
        inc di
        inc si
        mov dx, 15
.byte:
        mov al, [gs:si]
        cmp al, [fs:di]
        jne kn_bad
        inc si
        inc di
        dec dx
        loop .byte
.padding:
        test dx,dx
        jz .next_name
        cmp byte [fs:di], 0
        jne kn_bad
        inc di
        dec dx
        jnz .padding
.next_name:
        inc bx
        cmp bx, [kr_header+12]
        jb .row
        ; DI follows the final canonical name row and starts closed GBSF.
        cmp dword [fs:di],'GBSF'
        jne kn_bad
        cmp word [fs:di+4],2
        jne kn_bad
        mov ax,[kr_header+12]
        cmp ax,[fs:di+8]
        jne kn_bad
        imul ax,ax,14
        add ax,16
        cmp ax,[fs:di+6]
        jne kn_bad
        cmp word [fs:di+10],7
        jne kn_bad
        cmp dword [fs:di+12],0
        jne kn_bad
        add di,16
        mov bx,[kr_header+12]
.field_row:
        mov cx,3
.unsigned:
        cmp word [fs:di],255
        ja kn_bad
        add di,2
        loop .unsigned
        mov cx,2
.signed:
        mov ax,[fs:di]
        mov dx,ax
        cbw
        cmp ax,dx
        jne kn_bad
        add di,2
        loop .signed
        mov cx,2
.last_unsigned:
        cmp word [fs:di],255
        ja kn_bad
        add di,2
        loop .last_unsigned
        dec bx
        jnz .field_row
        mov byte [kn_names_valid], 1
        clc
        ret

kn_ready_current:
        cmp word [kr_header+20],3
        je kn_ready_paused
        jmp kn_ready_active

; Immutable INITIAL -> genuine answered cursor. Candidate was independently
; admitted; this proof binds it to the retained original before publication.
kn_initial_pair:
        cmp word [kr_header+6],0
        jne kn_bad
        cmp word [kn_pair_header+6],1
        jne kn_bad
        mov ax,[kn_pair_header+20]
        cmp ax,1
        je .menu
        cmp ax,2
        jne kn_bad
        cmp word [fs:KV_FX+8],3
        jne kn_bad
        cmp word [fs:KV_FX+32],0
        jne kn_bad
        jmp .shape
.menu:
        cmp word [fs:KV_FX+8],2
        jne kn_bad
.shape:
        mov si,kr_header
        mov di,kn_pair_header
        mov cx,6
        repe cmpsb
        jne kn_bad
        mov si,kr_header+8
        mov di,kn_pair_header+8
        mov cx,12
        repe cmpsb
        jne kn_bad
        mov si,kr_header+24
        mov di,kn_pair_header+24
        mov cx,20
        repe cmpsb
        jne kn_bad
        mov eax,64
        mov edx,eax
        mov ecx,KR_BODY-64
        mov di,[kn_pair_path]
        mov byte [kn_peer_exact],0
        call kn_compare_range_file
        jc .reset_bad
        mov eax,KR_BODY
        mov edx,eax
        mov ecx,[kr_header+24]
        add ecx,[kr_header+28]
        mov di,[kn_pair_path]
        call kn_compare_range_file
        jc .reset_bad
        mov edx,[kr_offsets+8]
        cmp word [kn_pair_header+20],1
        jne .empty
        mov eax,edx
        mov cx,[kr_header+32]
        mov di,[kn_pair_path]
        call kn_load_peer_fx
        jc .reset_bad
        call kn_check_menu_banks
        jc .reset_bad
        jmp .inputs
.empty:
        mov eax,edx
        mov ecx,[kr_header+32]
        mov di,[kn_pair_path]
        call kn_compare_range_file
        jc .reset_bad
.inputs:
        mov eax,[kr_offsets+12]
        mov edx,eax
        mov ecx,[kr_header+36]
        add ecx,[kr_header+40]
        mov di,[kn_pair_path]
        call kn_compare_range_file
        jc .reset_bad
        mov byte [kn_peer_exact],1
        clc
        ret
.reset_bad:
        mov byte [kn_peer_exact],1
        jmp kn_bad

; No authority rename or token consumption precedes the old-to-new proof.
kn_prove_forward_stage:
        call kc_close
        jc kn_bad
        mov dx,kn_authority
        call kn_admit
        jc kn_bad
        mov word [kn_pair_path],kw_stage
        call kn_phase_pair
        pushf
        mov word [kn_pair_path],kn_authority
        popf
        jc kn_bad
        call kc_close
        jc kn_bad
        jmp kn_admit_stage
