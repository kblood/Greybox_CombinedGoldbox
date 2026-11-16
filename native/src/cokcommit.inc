; C manifest original-request candidate. Caller must run CCECL CHECK first.
; All inputs are verified before any active file is renamed. Three fresh stages
; and backups give ordinary-error rollback; this is not a crash transaction.

mutation_commit_mode:
        call mb_load
        call mr_request
        jc mc_fail
        ; GBMR v3 (2026-09-09): accept version 2 or 3 here (mr_request.validate
        ; has already rejected anything else). [mr_len_eff] now reflects the
        ; request's own effective length, set by that validate call.
        cmp word [core+4], 2
        je .req_version_ok
        cmp word [core+4], 3
        jne mc_fail
.req_version_ok:
        ; v3 inherits v2's watermark semantics unchanged (matches
        ; cokrequest.inc's own >= 2 gate for the same field).
        cmp word [mb_manifest+4], 2
        jb .ack_ok
        mov ax, [mb_manifest+8]
        cmp ax, [core+38]
        jne mc_fail
.ack_ok:
        mov si, core
        mov di, mc_request
        movzx cx, word [mr_len_eff]
        rep movsb
        cmp word [core+4], 3
        jne .req_gboc_rng_ok
        ; The request's own GBOC record's rng-before must match this SAME
        ; request's own paused-GBEF RNG dword at core+174 -- exactly the
        ; precondition cm_authorize_output enforces dynamically at M-stage
        ; (native/src/cokmutation.inc's .gboc:/.invoke: owner loop) before it
        ; will ever fold the RNG forward. Checking it again here, independently,
        ; closes a gap the byte-identity carve-out below cannot see on its
        ; own: without this, a hand-forged (never-through-real-M-stage)
        ; request/candidate pair could carry a GBOC record whose rng-before
        ; has no relationship to the request's actual paused RNG, and the
        ; carve-out's fold re-derivation alone would not catch it, because it
        ; only checks internal GBOC self-consistency, not GBOC-vs-request
        ; agreement. `core` here is still the just-read REQUEST (the
        ; candidate has not been loaded yet), so this is a request-only
        ; invariant, not something mr_request.validate's shared .matrix:
        ; check can enforce (which also runs against candidates, where
        ; core+174 legitimately differs from GBOC.rng-before after a
        ; successful authorization).
        mov eax, [core+13224+16]
        cmp eax, [core+174]
        jne mc_fail
.req_gboc_rng_ok:
        mov si, mb_manifest+16
        mov di, core+11104
        mov cx, 8
        repe cmpsb
        jne mc_fail
        call mb_items_path
        jc mc_fail
        mov dx, mb_name
        call open_in
        jc mc_fail
        call get_length
        jc mc_fail
        cmp dword [file_len], 2050
        jb mc_fail
        mov eax, 2
        mov bx, [in_fh]
        call mr_seek
        jc mc_fail
        mov dx, buffer
        mov cx, 2048
        call read_exact
        jc mc_fail
        call close_in
        jc mc_fail
        mov si, buffer
        mov di, MR_TABLE
        mov cx, 2048
        repe cmpsb
        jne mc_fail
        mov dx, MB_PARTY
        mov si, core+5798
        mov cx, [core+20]
        call mc_compare_file
        jc mc_fail
        mov dx, MB_FX
        mov si, MR_FX
        mov cx, 5750
        call mc_compare_file
        jc mc_fail
        mov dx, MB_SEED
        mov di, mc_seed
        mov cx, 3160
        call mb_read_file
        jc mc_fail
        cmp dword [mc_seed], 'GBPS'
        jne mc_fail
        cmp dword [mc_seed+4], 00010006h
        jne mc_fail
        mov ax, [owner_count]
        cmp ax, [mc_seed+8]
        jne mc_fail
        mov si, mc_seed+282
        mov di, core+8274
        mov cx, 2830
        repe cmpsb
        jne mc_fail
        mov si, mc_seed+3128
        mov di, MR_TYPES
        mov cx, 32
        repe cmpsb
        jne mc_fail
        mov si, mc_seed+3112
        mov cx, 8
.ages: lodsw
        test ax, ax
        jnz mc_fail
        loop .ages
        mov byte [check_owners], 1
        call mc_clear_bits
        mov dx, MB_INV
        call open_inventory
        jc mc_fail
        mov eax, [file_len]
        cmp eax, [MR_FRAME+28]
        jne mc_fail
        call mr_inventory_crc
        jc mc_fail
        cmp eax, [MR_FRAME+24]
        jne mc_fail
        call close_in
        jc mc_fail
        mov si, query_bits
        mov di, MR_TYPES
        mov cx, 32
        repe cmpsb
        jne mc_fail
        ; Candidate validation; preserve original core for immutable comparisons.
        mov dx, arg3
        call open_in
        jc mc_fail
        call get_length
        jc mc_fail
        ; GBMR v3: the candidate's length is determined from the ALREADY-
        ; VALIDATED request's own version (mc_request+4), never from the
        ; candidate file's own self-declared fields -- those are exactly what
        ; a forged candidate could lie about. mr_request_len_v3/mr_len_eff are
        ; pre-set here from that trusted source; the candidate's own version
        ; word is cross-checked against it below (a NEW invariant: candidate
        ; version must equal request version exactly), and
        ; mr_request.validate re-derives/confirms the same effective length
        ; from the now-read candidate bytes.
        mov ax, [mc_request+4]
        cmp ax, 3
        jne .cand_not_v3
        mov byte [mr_request_len_v3], 1
        mov word [mr_len_eff], MR_LEN_V3
        jmp .cand_len_set
.cand_not_v3:
        mov byte [mr_request_len_v3], 0
        mov word [mr_len_eff], MR_LEN
.cand_len_set:
        movzx eax, word [mr_len_eff]
        add eax, 16
        cmp [file_len], eax
        jb mc_fail
        mov eax, [file_len]
        movzx ecx, word [mr_len_eff]
        sub eax, ecx
        mov [mc_inv_len], eax
        mov dx, core
        mov cx, [mr_len_eff]
        call read_exact
        jc mc_fail
        call file_crc
        jc mc_fail
        cmp eax, [core+28]
        jne mc_fail
        cmp word [core+8], 1
        jne mc_fail
        mov word [core+8], 0
        mov ax, [core+4]
        cmp ax, [mc_request+4]
        jne mc_fail
        call mr_request.validate
        jc mc_fail
        mov si, core
        mov di, mc_request
        mov cx, 28
        repe cmpsb
        jne mc_fail
        cmp word [core+4], 3
        je .v3_middle_split
        mov si, core+32
        mov di, mc_request+32
        mov cx, 5798-32
        repe cmpsb
        jne mc_fail
        jmp .middle_done
.v3_middle_split:
        ; The ONLY field in [32,5798) a v3 candidate may differ from its
        ; request in is the 4-byte paused RNG dword at core+174 (MR_FX+126) --
        ; and only when independently re-derived here, never merely accepted
        ; because the candidate claims it. This is the carve-out: the
        ; blanket byte-identity check that forbids EVERY other field from
        ; changing is preserved unconditionally on both sides of it.
        mov si, core+32
        mov di, mc_request+32
        mov cx, 174-32
        repe cmpsb
        jne mc_fail
        ; Re-derive the expected RNG value purely from the (now byte-verified
        ; against the request, see the 4th check below) GBOC record's own
        ; draws/rng-before -- never trust the candidate's core+174 directly.
        ; draws==0 (write-flag-clear) means no fold occurred and core+174
        ; must be unchanged from rng-before, matching cm_authorize_output's
        ; own two-branch semantics exactly.
        mov cx, [core+13224+12]        ; GBOC draws
        mov eax, [core+13224+16]       ; GBOC rng_before
        test cx, cx
        jz .rng_expected
.rng_fold:
        imul eax, eax, 08088405h
        inc eax
        loop .rng_fold
.rng_expected:
        cmp eax, [core+174]
        jne mc_fail
        mov si, core+178
        mov di, mc_request+178
        mov cx, 5798-178
        repe cmpsb
        jne mc_fail
        ; 4th check: the appended GBOC block itself must be byte-identical
        ; between request and candidate -- a candidate cannot substitute a
        ; DIFFERENT GBOC record than the one the original request carried
        ; (whose rng-before was already tied to the request's own core+174
        ; above, before the candidate was ever loaded).
        mov si, core+13224
        mov di, mc_request+13224
        mov cx, 40
        repe cmpsb
        jne mc_fail
.middle_done:
        mov si, core+11104
        mov di, mc_request+11104
        mov cx, 13192-11104
        repe cmpsb
        jne mc_fail
        mov si, core+5814
        mov di, mc_request+5814
        mov cx, [owner_count]
        jcxz .owners_ok
.ids:  mov al, [si]
        cmp al, [di]
        jne mc_fail
        add si, 410
        add di, 410
        loop .ids
.owners_ok:
        call mc_clear_bits
        movzx eax, word [mr_len_eff]
        mov [scan_base], eax
        mov bx, [in_fh]
        call mr_seek
        jc mc_fail
        call scan_inventory
        jc mc_fail
        call close_in
        jc mc_fail
        mov si, query_bits
        mov di, MR_TYPES
        mov cx, 32
        repe cmpsb
        jne mc_fail
        ; Derive the active owned seed from the current prefix and new state.
        mov si, core+8274
        mov di, mc_seed+282
        mov cx, 2830
        rep movsb
        mov si, MR_TYPES
        mov di, mc_seed+3128
        mov cx, 32
        rep movsb
        xor ax, ax
        mov di, mc_seed+70          ; GBPS movement words, eight entries
        mov cx, 8
        rep stosw
        mov ax, [owner_count]
        mov [mc_seed+17], al
        mov cx, ax
        mov si, core+5814+1+408
        mov di, mc_seed+70
        jcxz .paths
.moves:
        movzx ax, byte [si]
        stosw
        add si, 410
        loop .moves
.paths:
        mov word [mc_index], 0
.path:
        call mc_paths
        mov si, [mc_dest]
        mov di, [mc_stage]
        mov bx, 'MS'
        mov al, [mc_index]
        add al, '0'
        call mc_extension
        jc mc_fail
        mov si, [mc_dest]
        mov di, [mc_backup]
        mov bx, 'MB'
        mov al, [mc_index]
        add al, '0'
        call mc_extension
        jc mc_fail
        mov dx, [mc_stage]
        call mc_absent
        jc mc_fail
        mov dx, [mc_backup]
        call mc_absent
        jc mc_fail
        inc word [mc_index]
        cmp word [mc_index], 3
        jb .path
        mov word [mc_index], 0
.stage:
        call mc_paths
        mov dx, [mc_stage]
        call mr_create
        jc mc_fail
        mov [out_fh], ax
        mov bx, [mc_index]
        bts [mc_created], bx
        test bx, bx
        jz .inventory
        cmp bx, 1
        jne .seed
        mov dx, core+5798
        mov cx, [core+20]
        jmp .write
.seed: mov dx, mc_seed
        mov cx, 3160
.write:
        call write_exact
        jc mc_fail
        jmp .staged
.inventory:
        mov dx, arg3
        call open_in
        jc mc_fail
        mov bx, [in_fh]
        movzx eax, word [mr_len_eff]
        call mr_seek
        jc mc_fail
        mov eax, [mc_inv_len]
        mov [copy_left], eax
        call copy_bytes
        jc mc_fail
        call close_in
        jc mc_fail
.staged:
        call close_out
        jc mc_fail
        inc word [mc_index]
        cmp word [mc_index], 3
        jb .stage
        mov word [mc_index], 0
.backup:
        call mc_paths
        mov dx, [mc_dest]
        mov di, [mc_backup]
        call mc_rename
        jc mc_fail
        mov bx, [mc_index]
        bts [mc_backed], bx
        inc word [mc_index]
        cmp word [mc_index], 3
        jb .backup
        mov word [mc_index], 0
.publish:
        call mc_paths
        mov dx, [mc_stage]
        mov di, [mc_dest]
        call mc_rename
        jc mc_fail
        mov bx, [mc_index]
        bts [mc_moved], bx
        inc word [mc_index]
        cmp word [mc_index], 3
        jb .publish
        mov word [mc_index], 0
.clean:
        call mc_paths
        mov dx, [mc_backup]
        mov ah, 41h
        int 21h                    ; committed state remains valid if cleanup fails
        inc word [mc_index]
        cmp word [mc_index], 3
        jb .clean
        jmp good

mc_clear_bits:
        xor ax, ax
        mov di, query_bits
        mov cx, 16
        rep stosw
        ret

mc_compare_file:                     ; DX path, SI bytes, CX exact length
        mov [mc_compare_ptr], si
        mov [mc_compare_left], cx
        call open_in
        jc .bad
        call get_length
        jc .bad
        movzx eax, word [mc_compare_left]
        cmp eax, [file_len]
        jne .bad
.chunk:
        mov cx, [mc_compare_left]
        test cx, cx
        jz .done
        cmp cx, 4096
        jbe .read
        mov cx, 4096
.read: mov dx, buffer
        call read_exact
        jc .bad
        sub [mc_compare_left], cx
        mov si, [mc_compare_ptr]
        mov di, buffer
        repe cmpsb
        jne .bad
        mov [mc_compare_ptr], si
        jmp .chunk
.done: call close_in
        ret
.bad:  stc
        ret

mc_absent:
        mov ax, 4300h
        int 21h
        jnc .bad
        cmp ax, 2
        jne .bad
        clc
        ret
.bad:  stc
        ret

; Bounded sibling name; accepts arbitrary original extensions and dotted folders.
mc_extension:
        push ax
        push bx
        mov bp, di
        mov cx, 128
        xor dx, dx
.copy: lodsb
        stosb
        test al, al
        jz .end
        cmp al, '.'
        jne .separator
        mov dx, di
        dec dx
.separator:
        cmp al, 5Ch
        je .reset
        cmp al, '/'
        je .reset
        cmp al, ':'
        jne .next
.reset: xor dx, dx
.next: loop .copy
        jmp .bad
.end:  dec di
        test dx, dx
        jz .position
        mov di, dx
.position:
        mov ax, di
        sub ax, bp
        cmp ax, 123
        ja .bad
        pop bx
        pop ax
        mov byte [di], '.'
        mov [di+1], bx
        mov [di+3], al
        mov byte [di+4], 0
        clc
        ret
.bad:  pop bx
        pop ax
        stc
        ret

mc_paths:
        mov bx, [mc_index]
        shl bx, 1
        mov ax, [mc_destinations+bx]
        mov [mc_dest], ax
        mov bx, [mc_index]
        shl bx, 7
        lea ax, [mc_stages+bx]
        mov [mc_stage], ax
        lea ax, [mc_backups+bx]
        mov [mc_backup], ax
        ret

mc_rename:
%ifdef MC_TEST_FAIL_STAGE
        cmp byte [mc_step], MC_TEST_FAIL_STAGE
        je .fault
        inc byte [mc_step]
%endif
        mov ah, 56h
        int 21h
        ret
%ifdef MC_TEST_FAIL_STAGE
.fault: stc
        ret
%endif

mc_fail:
        call close_in
        call close_out
        mov word [mc_index], 0
.undo:
        call mc_paths
        mov bx, [mc_index]
        bt [mc_moved], bx
        jnc .restore
        mov dx, [mc_dest]
        mov ah, 41h
        int 21h
        jc .stage_clean            ; preserve backup if replacement cannot be removed
.restore:
        mov bx, [mc_index]
        bt [mc_backed], bx
        jnc .stage_clean
        mov dx, [mc_backup]
        mov di, [mc_dest]
        mov ah, 56h                ; rollback bypasses test fault injection
        int 21h                    ; retain backup if restoration itself fails
.stage_clean:
        mov bx, [mc_index]
        bt [mc_created], bx
        jnc .next
        mov dx, [mc_stage]
        mov ah, 41h
        int 21h
.next: inc word [mc_index]
        cmp word [mc_index], 3
        jb .undo
        jmp bad

mc_destinations dw MB_INV, MB_PARTY, MB_SEED
mc_dest dw 0
mc_stage dw 0
mc_backup dw 0
mc_index dw 0
mc_created dw 0
mc_backed dw 0
mc_moved dw 0
mc_compare_ptr dw 0
mc_compare_left dw 0
mc_inv_len dd 0
%ifdef MC_TEST_FAIL_STAGE
mc_step db 0
%endif
mc_stages times 384 db 0
mc_backups times 384 db 0
mc_request times MR_LEN_V3 db 0
mc_seed times 3160 db 0
