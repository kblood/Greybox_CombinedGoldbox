; PRIVATE transaction derivation/staging. No rename, token retirement, owner
; recovery/publication or live-P1 grant. Caller has rr_index's physical file.
; rj_derive SI=immutable external GBRA128/result0, DX=actual resident extent.
; It independently re-admits the current SETTLED owner relation, applies one
; supported action and prepares rw's exact unpublished INTENT framing/specs.
; CF0: RZ/RT post plus rw framing; rj_stage_intent exclusively creates the
; authority's GRT sibling, retaining partial output/failed close on failure.
; Internal ENTRY/producer/BUILD_REJOIN have separate source-capture lifetimes
; and are deliberately not handled by this ordinary private action primitive.
rj_derive:
        cld
        mov word [kc_verified], 0
        mov byte [rj_valid], 0
        mov byte [rj_live_valid], 0
        mov [rj_extent], dx
        movzx eax, si
        add eax, 128
        movzx edx, word [rj_extent]
        cmp eax, edx
        ja rj_bad
        ; Reject overlapping request/output storage before a resident copy.
        cmp si, rj_storage_end
        jae .request
        cmp eax, rj_storage_start
        ja rj_bad
.request:
        mov di, rj_request
        mov cx, 128
        rep movsb
        cmp word [rr_header+6], 1
        jne rj_bad
        mov dx, [rj_extent]
        call rv_record_relation
        jc rj_bad
        mov eax, [rr_header+40]
        cmp eax, [rj_request+8]
        jne rj_bad
        mov eax, [rr_header+44]
        cmp eax, [rj_request+12]
        jne rj_bad
        cmp word [rj_request+28], 0
        jne rj_bad
        mov ax, [rj_request+18]
        cmp ax, 19
        je .publication
        cmp ax, 4
        jb rj_bad
        cmp ax, 18
        je rj_bad                 ; section15 source extraction is separate
        mov si, rj_request
        mov cx, [rv_collection_suppression]
        mov bp, [rv_collection_bank]
        call rt_apply
        jc rj_bad
        jmp .intent
.publication:
        cmp word [rr_header+26], 11
        jne rj_bad
        ; Reuse the canonical NONE descriptor check without changing any
        ; immutable input/header: temporarily select action19 for the checker.
        mov si, rj_request
        mov di, rv_action
        mov cx, 128
        rep movsb
        mov word [rv_action+18], 0
        call rv_check_action
        jc rj_bad
        mov word [rt_result], 1
.intent:
        mov si, rr_header
        mov di, rw_header
        mov cx, 128
        rep movsw
        mov word [rw_header+6], 2
        mov ax, [rr_header+26]
        mov [rw_header+24], ax
        mov ax, [rt_state+8]
        mov [rw_header+26], ax
        mov ax, [rj_request+18]
        mov [rw_header+28], ax
        mov ax, [rt_result]
        mov [rw_header+30], ax
        mov [rj_request+28], ax    ; journal copy ONLY; external input unchanged
        mov eax, [rr_header+40]
        mov edx, [rr_header+44]
        mov [rw_header+32], eax
        mov [rw_header+36], edx
        add eax, 1
        adc edx, 0
        jc rj_bad
        mov [rw_header+40], eax
        mov [rw_header+44], edx
        mov eax, [rr_header+68]
        mov [rw_header+64], eax
        movzx eax, word [rz_length]
        mov [rw_header+68], eax
        mov si, rv_paths
        mov di, rw_paths
        mov cx, 1232
        rep movsb
        ; Context has its own address and exact frozen lifetime.
        mov si, rv_context
        mov di, rw_context
        mov cx, 32
        rep movsb
        mov word [rj_index], 0
.section:
        mov bx, [rj_index]
        shl bx, 2
        mov eax, [rr_offsets+bx]
        mov edx, [rr_lengths+bx]
        mov bx, [rj_index]
        imul di, bx, 12
        add di, rw_specs
        mov word [di], 1
        mov word [di+2], 0
        mov [di+4], eax
        mov [di+8], edx
        test edx, edx
        jnz .next
        mov dword [di], 0
        mov dword [di+4], 0
.next:  inc word [rj_index]
        cmp word [rj_index], 16
        jb .section
        ; Exact current POST is the new preimage. Derived outputs have owned
        ; bank/resident extents, never request-provided P1 or item data.
        mov bx, 6
.pre:   imul di, bx, 12
        add di, rw_specs
        shl bx, 2
        mov eax, [rr_offsets+bx+4]
        mov edx, [rr_lengths+bx+4]
        mov [di+4], eax
        mov [di+8], edx
        shr bx, 2
        add bx, 2
        cmp bx, 14
        jb .pre
        mov bx, 7
        mov ax, fs
        xor edx, edx
        movzx ecx, word [rz_length]
        call rj_memory_spec
        mov bx, 9
        mov ax, ds
        mov edx, rt_state
        mov ecx, 160
        call rj_memory_spec
        mov bx, 11
        mov edx, rt_items
        mov ecx, 960
        call rj_memory_spec
        mov bx, 13
        mov edx, rt_ledger
        mov ecx, 1056
        call rj_memory_spec
        mov bx, 14
        mov edx, rj_request
        mov ecx, 128
        call rj_memory_spec
        mov si, rv_paths+8*112
        mov di, rj_temp
        call kn_copy_path
        mov si, rj_temp
        call kn_extension
        jc rj_bad
        mov dword [di], 'GRT'
        mov byte [rj_valid], 1
        clc
        ret

rj_memory_spec:
        imul di, bx, 12
        add di, rw_specs
        mov word [di], 2
        mov [di+2], ax
        mov [di+4], edx
        mov [di+8], ecx
        ret

rj_stage_intent:
        mov word [kc_verified], 0
        cmp byte [rj_valid], 1
        jne rj_bad
        mov byte [rj_valid], 0     ; one attempt; stale buffers never restage
        mov byte [rj_live_valid], 0
        mov dx, rj_temp
        jmp rw_write

; Read-only exact live predecessor/P1 proof for a current SETTLED source.
; This alone grants no write/recovery/rename; a typed journal is still required.
rj_match_live:
        mov word [kc_verified], 0
        mov byte [rj_live_valid], 0
        cmp byte [rv_relation_valid], 1
        jne rj_bad
        cmp word [rr_header+6], 1
        jne rj_bad
        cmp byte [kc_view_active], 0
        jne rj_bad
        mov byte [kn_peer_exact], 1
        mov byte [kn_normalize], 0
        mov byte [kn_bank_compare], 0
        xor eax, eax
        xor edx, edx
        mov ecx, [kc_extent]
        mov di, rv_paths+8*112
        call kn_compare_range_file
        jc rj_bad
        mov eax, [rr_offsets+28]
        mov ecx, [rr_lengths+28]
        xor edx, edx
        mov di, rv_paths+112
        call kn_compare_range_file
        jc rj_bad
        mov word [kc_verified], 0
        mov byte [rj_live_valid], 1
        clc
        ret
rj_bad:
        mov word [kc_verified], 0
        mov byte [rj_valid], 0
        mov byte [rj_live_valid], 0
        stc
        ret

rj_storage_start:
rj_valid db 0
rj_live_valid db 0
rj_extent dw 0
rj_index dw 0
rj_request times 128 db 0
rj_temp times 112 db 0
rj_storage_end:
