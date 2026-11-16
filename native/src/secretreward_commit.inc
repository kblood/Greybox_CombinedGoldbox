; PRIVATE ordinary durable-journal recovery; no fresh request admission/UI.
; DS=ES, FS/GS disjoint, DX=actual resident extent including stack.
; SI=trusted canonical GSK, DI=P1, BX=ECL, BP=ITEM (all112 padded bytes).
; CF0 AX0 absent GRJ; AX1 completed. CF1 preserves every committed prefix.
; No caller ready flag grants permission. Failed close retains its handle.
rc_invoke:
        mov word [rc_error], 1
        ; Producer/restoration helpers retain failed-close ownership. Reject
        ; before caller snapshots or any transient reset can reuse their state.
        cmp word [kw_out], 0ffffh
        jne rc_bad
        cmp word [kw_live_fh], 0ffffh
        jne rc_bad
        cmp word [kf_out], 0ffffh
        jne rc_bad
        cmp word [kf_live], 0ffffh
        jne rc_bad
        cmp word [kf_other], 0ffffh
        jne rc_bad
        cld
        mov [rc_extent], dx
        mov [rc_inputs], si
        mov [rc_inputs+2], di
        mov [rc_inputs+4], bx
        mov [rc_inputs+6], bp
        mov byte [rc_jclose_attempted], 0
        call rc_clear_transients
        cmp word [kc_fh], 0ffffh
        jne rc_bad
        cmp word [kn_peer_fh], 0ffffh
        jne rc_bad
        cmp word [kc_probe_fh], 0ffffh
        jne rc_bad
        cmp word [rw_fh], 0ffffh
        jne rc_bad
%ifdef RCOMMIT_HAS_RQ
        cmp word [rq_fh], 0ffffh
        jne rc_bad
%endif
        cmp byte [kc_view_active], 0
        jne rc_bad
        cmp dx, rc_storage_end
        jb rc_bad
%ifdef RCOMMIT_HAS_SUBMIT
        cmp dx, rs_end
        jb rc_bad
%endif
        mov ax, ds
        mov bx, es
        cmp ax, bx
        jne rc_bad
        movzx eax, ax
        shl eax, 4
        movzx edx, word [rc_extent]
        mov bx, fs
        movzx ebx, bx
        shl ebx, 4
        mov ecx, 65536
        call rz_disjoint
        jc rc_bad
        mov ax, ds
        movzx eax, ax
        shl eax, 4
        movzx edx, word [rc_extent]
        mov bx, gs
        movzx ebx, bx
        shl ebx, 4
        mov ecx, 32768
        call rz_disjoint
        jc rc_bad
        mov ax, fs
        movzx eax, ax
        shl eax, 4
        mov edx, 65536
        mov bx, gs
        movzx ebx, bx
        shl ebx, 4
        mov ecx, 32768
        call rz_disjoint
        jc rc_bad
        xor bx, bx
.anchor:
        mov si, [rc_inputs+bx]
        movzx eax, si
        add eax, 112
        movzx edx, word [rc_extent]
        cmp eax, edx
        ja rc_bad
        cmp si, rc_storage_end
        jae .copy
        cmp eax, rc_storage_start
        ja rc_bad
.copy:
        push bx
        shr bx, 1
        imul di, bx, 112
        add di, rc_anchors
        push si
        push di
        mov cx, 56
        rep movsw
        pop si
        call kv_path
        pop di
        pop bx
        jc rc_bad
        mov si, [rc_inputs+bx]
        push bx
        shr bx, 1
        imul di, bx, 112
        add di, rc_anchors
        mov cx, 56
        repe cmpsw              ; kv_path must not repair caller encoding
        pop bx
        jne rc_bad
        add bx, 2
        cmp bx, 8
        jb .anchor
        ; ITEM belongs to the trusted ECL directory, never a journal-selected
        ; resource. Construct a padded basename replacement privately.
        mov si, rc_anchors+224
        mov di, kn_alias_path
        call kn_copy_path
        mov si, kn_alias_path
        mov di, si
.basename:
        lodsb
        test al, al
        jz .item_name
        cmp al, 05ch
        jne .basename
        mov di, si
        jmp .basename
.item_name:
        mov ax, kn_alias_path+112
        sub ax, di
        cmp ax, 9
        jb rc_bad
        mov cx, ax
        push di
        xor ax, ax
        rep stosb
        pop di
        mov dword [di], 'ITEM'
        mov dword [di+4], '.GLB'
        mov si, kn_alias_path
        mov di, rc_anchors+336
        mov cx, 56
        repe cmpsw
        jne rc_bad
        mov si, rc_anchors+112
        mov di, kn_expected_roster
        mov cx, 56
        rep movsw
        mov si, rc_anchors+224
        mov di, kn_expected_source
        mov cx, 56
        rep movsw
        call kn_names
        jc rc_bad
        mov si, rc_anchors
        mov di, kn_authority
        mov cx, 56
        repe cmpsw
        jne rc_bad
        mov si, kn_authority
        mov di, rc_journal
        call kn_copy_path
        mov si, rc_journal
        call kn_extension
        jc rc_bad
        mov dword [di], 'GRJ'
        clc
        ret

rcommit_recover4:
        call rc_invoke
        jc rc_bad
        mov word [rc_error], 2
        mov dx, rc_journal
        mov ax, 3d00h
        int 21h
        jnc .present
        cmp ax, 2              ; access/path errors are never absence
        jne rc_bad
        xor ax, ax
        clc
        ret
.present:
        mov [kc_fh], ax
        call kc_close
        jc rc_bad
.reindex:
        mov byte [rc_jclose_attempted], 0
        mov byte [rj_valid], 0
        mov byte [rj_live_valid], 0
        mov byte [ro_valid], 0
        mov word [rc_error], 3
        mov dx, rc_journal
        call rr_index
        jc rc_bad
        cmp word [rr_header+6], 2
        jne rc_close_bad
        mov ax, [rr_header+28]
        cmp ax, 1
        je .ordinary            ; durable internal ENTRY only, never submit
        cmp ax, 5
        jb rc_close_bad
        cmp ax, 16
        jbe .ordinary
        cmp ax, 19
        je .ordinary            ; durable final, never external submit
        cmp ax, 20
        jb rc_close_bad
        cmp ax, 23
        ja rc_close_bad
.ordinary:
        mov word [rc_error], 4
        mov dx, [rc_extent]
        call rv_record_relation
        jc rc_close_bad
        cmp word [rr_header+28], 1
        jne .live
        call rz_eligible_share  ; FS exact phase0 image, no XP/party writes
        jc rc_close_bad
.live:
        call rc_bind_live
        jc rc_close_bad
        mov word [rc_error], 8
        call rc_protocol
        jc rc_close_bad
        cmp ax, 2
        jne .completed
        call kc_close
        jc rc_bad
        jmp .reindex            ; cold-equivalent reindex/replay before framing
.completed:
        call rc_clear_transients
        mov ax, 1
        clc
        ret
rc_close_bad:
        cmp byte [rc_jclose_attempted], 0
        jne rc_bad
        call kc_close
rc_bad:
        call rc_clear_transients
        mov ax, [rc_error]
        stc
        ret

; Exact boundary reset shared by RC/RS. MOV-only: preserve every register,
; segment and EFLAGS. Handles/views/anchors/accepted request remain untouched.
rc_clear_transients:
        mov word [kc_verified], 0
        mov byte [ro_valid], 0
        mov byte [rj_valid], 0
        mov byte [rj_live_valid], 0
        mov byte [rv_relation_valid], 0
        mov byte [kn_peer_exact], 1
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        ret

rc_bind_live:
        mov si, rv_paths
        mov di, rc_anchors+224
        mov cx, 56
        repe cmpsw
        jne .bad
        mov si, rv_paths+112
        mov di, rc_anchors+112
        mov cx, 56
        repe cmpsw
        jne .bad
        mov si, rv_paths+8*112
        mov di, rc_anchors
        mov cx, 56
        repe cmpsw
        jne .bad
        mov si, rv_paths+10*112
        mov di, rc_anchors+336
        mov cx, 56
        repe cmpsw
        jne .bad
        mov word [rc_error], 5
        mov si, rc_anchors+112
        mov di, kn_alias_path
        call kn_copy_path
        mov si, kn_alias_path
        call kn_extension
        jc .bad
        mov dword [di], 'GKW'
        mov si, kn_alias_path
        mov di, rv_paths+9*112
        mov cx, 56
        repe cmpsw
        jne .bad
        mov si, rv_paths
        mov di, kv_paths
        mov cx, 560
        rep movsw
        call kv_check_paths
        jc .bad
        mov word [rc_index], 0
.item_disjoint:
        mov bx, [rc_index]
        imul di, bx, 112
        add di, kv_paths
        mov si, rc_anchors+336
        call kc_disjoint
        jc .bad
        inc word [rc_index]
        cmp word [rc_index], 10
        jb .item_disjoint
        mov byte [kn_work_create], 0
        call kn_workspace
        jc .bad
        mov word [rc_error], 6
        mov byte [kn_peer_exact], 1
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        mov eax, [rv_origin_identity_offset]
        add eax, 16
        jc .bad
        mov ecx, [rv_origin_identity_length]
        sub ecx, 16
        jc .bad
        xor edx, edx
        mov di, rc_anchors+224
        call kn_compare_range_file
        jc .bad
        mov word [rc_error], 7
        mov eax, [rr_offsets+4*4]
        add eax, 32
        jc .bad
        mov ecx, [rr_lengths+4*4]
        sub ecx, 32
        jc .bad
        xor edx, edx
        mov di, rc_anchors+336
        call kn_compare_range_file
        jc .bad
        clc
        ret
.bad:  stc
        ret

rc_names_only:
        mov word [rc_index], 4
.construct:
        mov bx, [rc_index]
        cmp bx, 12
        jne .target
        add bx, 2              ; skip existing GRJ to select GRC
.target:
        mov di, [rc_reserved+bx]
        mov [rc_reserved_path], di
        mov si, kn_authority
        call kn_copy_path
        mov si, [rc_reserved_path]
        call kn_extension
        jc .bad
        mov bx, [rc_index]
        sub bx, 4
        shl bx, 1
        mov eax, [rc_extensions+bx]
        mov [di], eax
        add word [rc_index], 2
        cmp word [rc_index], 14
        jb .construct
        mov word [rc_index], 0
.aliases:
        mov bx, [rc_index]
        mov si, [rc_reserved+bx]
        call rc_reserved_disjoint
        jc .bad
        add word [rc_index], 2
        cmp word [rc_index], 16
        jb .aliases
        clc
        ret
.bad:  stc
        ret

rc_names:
        call rc_names_only
        jc .bad
        mov dx, rj_temp
        call rc_absent
        jc .bad
        mov dx, kv_other_path
        cmp word [rr_header+28], 19
        je .final_input
        call rc_absent
        jc .bad
        jmp .token
.final_input:
        call rc_grc_match
        jc .bad
.token:
        call rc_token_exact
        jc .bad
        clc
        ret
.bad:  stc
        ret

; Classify ALL six peers before selecting any next operation. Owner peers
; use a checked header to select exactly ONE typed full comparison; a failed
; pre comparison never licenses trying post. Present P1 mask0 is foreign.
rc_classify_peers:
        call rc_names
        jc .bad
        mov word [rc_index], 0
.classify:
        mov bx, [rc_index]
        shl bx, 1
        mov dx, [rc_peers+bx]
        cmp bx, 6
        jae .party
        call rc_owner_class
        jmp .classified
.party:
        mov [rc_peer_path], dx
        call kc_probe
        jc .bad
        test ax, ax
        jz .classified
        mov dx, [rc_peer_path]
        call rpeer_match_p1
        jc .bad
        test ax, ax
        jz .bad
.classified:
        jc .bad
        mov bx, [rc_index]
        mov [rc_states+bx], al
        inc word [rc_index]
        cmp word [rc_index], 6
        jb .classify
        cmp word [rr_header+28], 19
        jne .typed_party_ok
        cmp byte [rc_states+3], 3
        jne .bad
        cmp byte [rc_states+4], 0
        jne .bad
        cmp byte [rc_states+5], 0
        jne .bad
        call rc_capture_class
        jc .bad
        test ax, ax
        jz .typed_party_ok
        cmp byte [rc_states], 1
        jne .bad
        cmp word [rc_states+1], 0
        jne .bad               ; K+C or postA+K isn't an emitted prefix
.typed_party_ok:
        clc
        ret
.bad:  stc
        ret

rc_protocol:
        call rc_classify_peers
        jc .bad
        cmp byte [rc_states+1], 1 ; B is exact pre or absent
        ja .bad
        cmp byte [rc_states+2], 0
        je .c_ok
        cmp byte [rc_states+2], 2 ; C is exact post or absent
        jne .bad
.c_ok:
        mov al, [rc_states]
        cmp al, 2
        je .published
        cmp al, 1
        je .pre
        test al, al
        jnz .bad
        cmp byte [rc_states+1], 1
        jne .bad
        cmp byte [rc_states+2], 2
        jne .bad
        call rc_post_party
        jc .bad
        mov dx, kw_stage
        mov di, kn_authority
        jmp .rename
.pre:
        cmp byte [rc_states+1], 0
        jne .bad
        cmp byte [rc_states+3], 1
        je .pre_party
        cmp byte [rc_states+3], 0
        je .missing_party
        call rc_post_party
        jc .bad
        cmp byte [rc_states+2], 2
        je .backup_owner
        cmp word [rr_header+28], 19
        jne .ordinary_frame
        mov word [rc_error], 14
        call rc_final_stage
        jc .bad
        jmp .again             ; stage restored OPEN J, close/reindex normally
.ordinary_frame:
        mov word [rc_error], 11
        mov al, 1
        call ro_frame          ; final replay already occurred this loop
        jc .bad
        mov dx, kw_stage
        call rw_write          ; no replay/R/RO during streaming
        jc .bad
        ; Reindex/replay before reopening C: no stale RW descriptors survive.
        jmp .again
.backup_owner:
        mov dx, kn_authority
        mov di, kn_backup
        jmp .rename
.pre_party:
        cmp byte [rc_states+2], 0
        jne .bad
        cmp byte [rc_states+4], 2
        jne .bad
        cmp byte [rc_states+5], 0
        jne .bad
        mov dx, kn_expected_roster
        mov di, kv_scratch
        jmp .rename
.missing_party:
        cmp byte [rc_states+2], 0
        jne .bad
        cmp byte [rc_states+4], 2
        jne .bad
        cmp byte [rc_states+5], 1
        jne .bad
        mov dx, kn_alias_path
        mov di, kn_expected_roster
.rename:
        mov word [rc_error], 12
        mov ah, 56h
        int 21h
        jc .bad
.again:
        mov ax, 2
        clc
        ret
.published:
        cmp byte [rc_states+2], 0
        jne .bad
        cmp byte [rc_states+4], 0
        jne .bad
        mov al, [rc_states+3]
        cmp al, 3
        je .equal_cleanup
        cmp al, 2
        jne .bad
        cmp byte [rc_states+5], 1
        ja .bad
        jmp .retire
.equal_cleanup:
        cmp byte [rc_states+5], 0
        jne .bad
.retire:
        mov word [rc_error], 13
        call rc_token_exact   ; reread exact typed token after RO scratch
        jc .bad
        cmp word [rr_header+28], 19
        jne .close_journal
        call rc_names          ; rebuild names/whole optional X before retirement
        jc .bad
.close_journal:
        mov byte [rc_jclose_attempted], 1
        call kc_close          ; failed close blocks EVERY retirement
        jc .bad
        cmp word [rr_header+28], 19
        jne .token_delete
        cmp byte [rc_grc_present], 0
        je .token_delete
        mov dx, kn_descriptor
        call rc_delete         ; X BEFORE backup, J remains the final operation
        jc .bad
.token_delete:
        cmp byte [rc_request_present], 0
        je .retire_party
        mov dx, [rc_token_path]
        call rc_delete
        jc .bad
.retire_party:
        cmp byte [rc_states+5], 0
        je .retire_owner
        mov dx, kv_scratch
        call rc_delete
        jc .bad
.retire_owner:
        cmp byte [rc_states+1], 0
        je .retire_journal
        mov dx, kn_backup
        call rc_delete
        jc .bad
.retire_journal:
        mov dx, rc_journal
        call rc_delete         ; J LAST, after exact token/known backups
        jc .bad
        mov ax, 1
        clc
        ret
.bad:  stc
        ret

rc_post_party:
        cmp byte [rc_states+4], 0
        jne .bad
        cmp byte [rc_states+3], 3
        je .equal
        cmp byte [rc_states+3], 2
        jne .bad
        cmp byte [rc_states+5], 1
        jne .bad
        clc
        ret
.equal:
        cmp byte [rc_states+5], 0
        jne .bad
        clc
        ret
.bad:  stc
        ret

rc_owner_class:
        mov [rc_peer_path], dx
        call kc_probe
        jc .bad
        test ax, ax
        jz .absent
        mov dx, [rc_peer_path]
        mov ax, 3d00h
        int 21h
        jc .bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov dx, kc_cmp
        mov cx, 256
        mov ah, 3fh
        int 21h
        jc .close_bad
        cmp ax, 256
        jne .close_bad
        cmp dword [kc_cmp], 'GSK3'
        je .entry_pre
        cmp dword [kc_cmp], 'GSK4'
        jne .close_bad          ; select generation only for a typed GSK4
        mov byte [rc_side], 0
        mov eax, [kc_cmp+32]
        mov edx, [kc_cmp+36]
        cmp eax, [rr_header+32]
        jne .post
        cmp edx, [rr_header+36]
        je .selected
.post:
        cmp eax, [rr_header+40]
        jne .close_bad
        cmp edx, [rr_header+44]
        jne .close_bad
        mov byte [rc_side], 1
.selected:
        call kn_peer_close
        jc .bad
        mov al, [rc_side]
        mov dx, [rc_peer_path]
        call ro_match
        jc .bad
        movzx ax, byte [rc_side]
        inc ax
        clc
        ret
.entry_pre:
        cmp word [rr_header+28], 19
        je rc_final_post_match
        cmp word [rr_header+28], 1
        jne .close_bad
        call kn_peer_close
        jc .bad
        mov eax, [rr_offsets]
        mov ecx, [rr_lengths]
        xor edx, edx
        mov byte [kn_peer_exact], 1
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        mov di, [rc_peer_path]
        call kn_compare_range_file
        jc .bad
        mov ax, 1
        clc
        ret
.close_bad:
        call kn_peer_close
.bad:  stc
        ret
.absent:
        xor ax, ax
        clc
        ret

rc_delete:
        mov ah, 41h
        int 21h
        ret

rc_absent:
        call kc_probe
        jc .bad
        test ax, ax
        jnz .bad
        clc
        ret
.bad:  stc
        ret

rc_party_exact:
        mov eax, [rr_offsets+bx]
        mov ecx, [rr_lengths+bx]
        xor edx, edx
        mov byte [kn_peer_exact], 1
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        jmp kn_compare_range_file

; Reserved siblings, including old authority scratch, cannot alias any
; protected journal path or the independently selected ITEM archive.
rc_reserved_disjoint:
        mov [rc_reserved_path], si
        mov word [rc_alias_index], 0
.next:
        mov bx, [rc_alias_index]
        imul di, bx, 112
        add di, rv_paths
        mov si, [rc_reserved_path]
        call kc_disjoint
        jc .bad
        inc word [rc_alias_index]
        cmp word [rc_alias_index], 11
        jb .next
        cmp byte [kn_response], 0
        je .workspace
        mov si, [rc_reserved_path]
        mov di, kn_response
        call kc_disjoint
        jc .bad
.workspace:
        mov word [rc_alias_index], 0
.work_name:
        mov bx, [rc_alias_index]
        mov bx, [kn_alias_work_names+bx]
        test bx, bx
        jz .tools
        mov si, rv_paths+9*112
        mov di, kn_marker_actual ; closed marker scratch; no replay afterwards
        call kn_join
        jc .bad
        mov si, [rc_reserved_path]
        mov di, kn_marker_actual
        call kc_disjoint
        jc .bad
        add word [rc_alias_index], 2
        jmp .work_name
.tools:
        cmp byte [kn_prefix], 0
        je .ok                 ; no external tools selected on private entry
        mov word [rc_alias_index], 0
.tool_name:
        mov bx, [rc_alias_index]
        mov bx, [rc_tool_names+bx]
        mov si, kn_prefix
        mov di, kn_marker_actual
        call kn_join
        jc .bad
        mov si, [rc_reserved_path]
        mov di, kn_marker_actual
        call kc_disjoint
        jc .bad
        add word [rc_alias_index], 2
        cmp word [rc_alias_index], 8
        jb .tool_name
.ok:
        clc
        ret
.bad:  stc
        ret

; Existing raw request must be exactly the journal request with ONLY result
; privately projected to zero. Missing request authorizes no new action.
rc_request_exact:
        mov word [rc_token_path], kn_work_output
        mov byte [rc_request_present], 0
        mov dx, kn_work_output
        call kc_probe
        jc .bad
        test ax, ax
        jz .ok
        mov byte [rc_request_present], 1
        mov eax, [rr_offsets+14*4]
        mov cx, 128
        mov di, rj_request
        call kc_read_at
        jc .bad
        mov word [rj_request+28], 0
        push gs
        push ds
        pop gs
        mov byte [kn_bank_compare], 1
        mov byte [kn_normalize], 0
        mov byte [kn_peer_exact], 1
        mov eax, rj_request
        mov ecx, 128
        xor edx, edx
        mov di, kn_work_output
        call kn_compare_range_file
        pop gs
        mov byte [kn_bank_compare], 0
        jc .bad
.ok:   clc
        ret
.bad:  stc
        ret

; Read-only GRC admission for durable final19. Descriptor input is dead after
; RC's immutable four-anchor snapshot; it is a stable112-byte derived path.
rc_grc_match:
        mov byte [rc_grc_present], 0
        mov si, kv_other_path
        mov di, kn_descriptor
        call kn_copy_path
        mov dx, kn_descriptor
        call kc_probe
        jc .bad
        test ax, ax
        jz .ok
        mov eax, [rr_offsets+15*4]
        mov ecx, [rr_lengths+15*4]
        xor edx, edx
        mov byte [kn_peer_exact], 1
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        mov di, kn_descriptor
        call kn_compare_range_file
        jc .bad
        mov byte [rc_grc_present], 1
.ok:   clc
        ret
.bad:  stc
        ret

; PRIVATE extraction primitive: caller has fully admitted J/live inputs and
; separately proved producer configuration/CAPTURE ownership. Not yet wired
; to the missing-C row. Existing GRC must match before reuse; no truncation,
; deletion or partial-file cleanup is authorized here.
rc_grc_extract:
        cmp word [rr_header+6], 2
        jne .bad
        cmp word [rr_header+28], 19
        jne .bad
        cmp byte [rv_relation_valid], 1
        jne .bad
        cmp byte [kc_view_active], 0
        jne .bad
        cmp word [rw_fh], 0ffffh
        jne .bad
        call rc_names_only
        jc .bad
        call rc_grc_match
        jc .bad
        cmp byte [rc_grc_present], 0
        jne .ok
        mov dx, kn_descriptor
        xor cx, cx
        mov ax, 5b00h
        int 21h
        jc .bad
        mov [rw_fh], ax
        mov bx, ax
        mov eax, [rr_offsets+15*4]
        mov edx, [rr_lengths+15*4]
        mov byte [kc_mode], 0
        call kc_transfer
        jc .write_bad
        call rw_close
        jc .bad
        call rc_grc_match       ; closed whole-file/EOF proof, never ready bits
        ret
.write_bad:
        call rw_close          ; one owned attempt; retained failure is blocked
.bad:  stc
        ret
.ok:   clc
        ret

; Exact ACTIVE kind2 post side. Temporary candidate admission destroys the
; replay banks, so restore the complete J proof before binding its section15
; to the checked GBKO input slice. No candidate classification is cached.
rc_final_post_match:
        call kn_peer_close
        jc .bad
        mov ax, [rc_index]
        mov [rc_final_index], ax
        mov byte [rc_jclose_attempted], 1
        call kc_close
        jc .bad
        mov dx, [rc_peer_path]
        call kr_index
        jc .bad                ; KR owns its failed admission/close
        call kv_validate
        jc .candidate_bad
        cmp word [kr_header+6], 2
        jne .candidate_bad
        cmp word [kr_header+20], 2
        jne .candidate_bad
        mov eax, [kr_receipt_input]
        mov [rc_final_offset], eax
        mov eax, [kr_receipt+8]
        mov [rc_final_length], eax
        call kc_close
        jc .bad
        call rc_restore_final_j
        jc .bad
        mov ax, [rc_final_index]
        mov [rc_index], ax
        shl ax, 1
        mov bx, ax
        mov di, [rc_peers+bx]
        mov [rc_peer_path], di
        mov ecx, [rr_lengths+15*4]
        cmp ecx, [rc_final_length]
        jne .bad
        mov eax, [rr_offsets+15*4]
        mov edx, [rc_final_offset]
        mov byte [kn_peer_exact], 0
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        call kn_compare_range_file
        mov byte [kn_peer_exact], 1
        jc .bad
        mov ax, 2
        clc
        ret
.candidate_bad:
        call kc_close          ; attempted once; retained failure blocks retry
.bad:  stc
        ret

rc_restore_final_j:
        mov dx, rc_journal
        call rr_index
        jc .bad                ; RR owns failed admission/close
        mov byte [rc_jclose_attempted], 0
        cmp word [rr_header+6], 2
        jne .bad
        cmp word [rr_header+28], 19
        jne .bad
        mov dx, [rc_extent]
        call rv_record_relation
        jc .bad
        call rc_bind_live
        jc .bad
        call rc_names
        ret
.bad:  stc
        ret

; Special seventh peer, never a public owner row. Its full typed admission
; uses the same refreshed-J/receipt proof as C, including oldkind1 refusal.
rc_capture_class:
        mov si, rv_paths+9*112
        mov di, kn_capture_saved_stage
        mov bx, kn_capture_name
        call kn_join
        jc .bad
        mov word [rc_index], 6
        mov dx, kn_capture_saved_stage
        call rc_owner_class
        jc .bad
        test ax, ax
        jz .ok
        cmp ax, 2
        jne .bad
.ok:   clc
        ret
.bad:  stc
        ret

; PRIVATE missing-C staging, not yet automatic owner publication. Caller
; has admitted the Apre/B0/C0/Qboth/P0/R0 row. GRC is never promoted to C:
; only a fully proved ACTIVEkind2 CAPTURE is atomically renamed there.
rc_final_stage:
        cmp word [rr_header+28], 19
        jne .bad
        cmp byte [rc_states], 1
        jne .bad
        cmp word [rc_states+1], 0
        jne .bad
        cmp byte [rc_states+3], 3
        jne .bad
        cmp word [rc_states+4], 0
        jne .bad
        call rc_capture_config
        jc .bad
        call rc_capture_class  ; foreign capture BEFORE create/cleanup/children
        jc .bad
        call rc_grc_extract
        jc .bad
        mov byte [rc_jclose_attempted], 1
        call kc_close
        jc .bad
        mov dx, kn_descriptor
        call kn_admit          ; actual source/response/roster semantic context
        jc .bad
        cmp word [kr_header+6], 1
        jne .close_bad
        cmp word [kr_header+20], 2
        jne .close_bad
        mov dx, kn_descriptor
        call kn_capture_producer
        jc .bad
        cmp word [kc_fh], 0ffffh
        jne .close_bad
        call rc_restore_final_j
        jc .bad
        call rc_capture_class  ; refreshed J, actual full receipt relation
        jc .bad
        cmp ax, 2
        jne .bad
        mov byte [rc_jclose_attempted], 1
        call kc_close
        jc .bad
        mov dx, kn_capture_saved_stage
        mov di, kw_stage
        mov ah, 56h
        int 21h
        jc .bad
        call rc_restore_final_j ; leaves J OPEN for existing AX2 close/reindex
        ret
.close_bad:
        call kc_close
.bad:  stc
        ret

rc_capture_config:
        mov ax, cs
        mov bx, ds
        cmp ax, bx
        jne .bad
        mov bx, ss
        cmp ax, bx
        jne .bad
        cmp sp, stacktop-512
        jb .bad
        cmp sp, stacktop
        jae .bad
        mov si, kn_prefix
        call rc_capture_path
        jc .bad
        mov si, kn_response
        call rc_capture_path
        jc .bad
        call kn_response_aliases
        jc .bad
        mov si, kn_response
        mov di, rc_anchors+336
        call kc_disjoint       ; new ITEM resource isn't in legacy ten paths
        jc .bad
        call rc_names
        jc .bad
        mov word [rc_index], 0
.tool:
        mov bx, [rc_index]
        mov bx, [rc_tool_names+bx]
        mov si, kn_prefix
        mov di, kn_child_path
        call kn_join
        jc .bad
        mov word [rc_alias_index], 0
.protected:
        mov bx, [rc_alias_index]
        imul di, bx, 112
        add di, rv_paths
        mov si, kn_child_path
        call kc_disjoint
        jc .bad
        inc word [rc_alias_index]
        cmp word [rc_alias_index], 11
        jb .protected
        mov word [rc_alias_index], 0
.workspace:
        mov bx, [rc_alias_index]
        mov bx, [kn_alias_work_names+bx]
        test bx, bx
        jz .probe
        mov si, rv_paths+9*112
        mov di, kn_marker_actual
        call kn_join
        jc .bad
        mov si, kn_child_path
        mov di, kn_marker_actual
        call kc_disjoint
        jc .bad
        add word [rc_alias_index], 2
        jmp .workspace
.probe:
        mov dx, kn_child_path
        call kc_probe
        jc .bad
        cmp ax, 1
        jne .bad
        add word [rc_index], 2
        cmp word [rc_index], 4
        jne .next
        add word [rc_index], 2 ; skip CCHOST, require CCPARTY third
.next:
        cmp word [rc_index], 8
        jb .tool
        jmp rc_names           ; canonical reserved paths after alias scratch
.bad:  stc
        ret

rc_capture_path:
        push si
        mov di, kn_child_path
        call kn_copy_path
        mov si, kn_child_path
        call kv_path
        pop di
        jc .bad
        mov si, kn_child_path
        mov cx, 56
        repe cmpsw             ; reject repair of literal caller configuration
        jne .bad
        clc
        ret
.bad:  stc
        ret

; Internal ENTRY consumes ONLY its exact source-bound GBMO18. A durable J
; tolerates an already retired answer; unrelated external GRA is untouched.
rc_token_exact:
        cmp word [rr_header+28], 19
        je .final
        cmp word [rr_header+28], 1
        jne rc_request_exact
        mov word [rc_token_path], rv_paths+6*112
        mov byte [rc_request_present], 0
        mov dx, [rc_token_path]
        call kc_probe
        jc .bad
        test ax, ax
        jz .ok
        mov byte [rc_request_present], 1
        mov eax, [rr_offsets+4]
        mov ecx, 18
        xor edx, edx
        mov byte [kn_peer_exact], 1
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        mov di, [rc_token_path]
        jmp kn_compare_range_file
.ok:   clc
        ret
.final:
        mov byte [rc_request_present], 0
        mov word [rc_token_path], 0
        clc
        ret
.bad:  stc
        ret

rc_storage_start:
rc_extent dw 0
rc_error dw 0
rc_inputs times 4 dw 0
rc_index dw 0
rc_alias_index dw 0
rc_reserved_path dw 0
rc_reserved dw kn_backup,kw_stage,rj_temp,kn_alias_path,kv_scratch,kn_work_output,rc_journal,kv_other_path
rc_extensions dd 'GRT','GRP','GRB','GRA','GRC'
rc_tool_names dw kv_work_flow,kv_work_ecl,kn_host_name,kn_party_name
rc_peers dw kn_authority,kn_backup,kw_stage,kn_expected_roster,kn_alias_path,kv_scratch,kn_capture_saved_stage
rc_states times 6 db 0
rc_peer_path dw 0
rc_side db 0
rc_request_present db 0
rc_token_path dw 0
rc_jclose_attempted db 0
rc_final_index dw 0
rc_final_offset dd 0
rc_final_length dd 0
rc_grc_present db 0
rc_anchors times 448 db 0
rc_journal times 112 db 0
rc_storage_end:
