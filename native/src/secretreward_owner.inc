; PRIVATE typed GSK4 SETTLED peer comparison against an admitted INTENT.
; AL=0pre/1post, DX=canonical peer pathname; source rr_index/rv_record_relation
; has admitted the exact journal. ro_match compares canonical header/EOF and
; EVERY section byte, rebuilding NONE rather than normalizing foreign bytes.
; No file writes, rename/recovery/publication grant. rj/rw framing is invalidated
; and reused as scratch; callers must rederive before subsequent staging.
ro_match:
        mov [ro_path], dx
        call ro_frame
        jc ro_bad
        mov dx, [ro_path]
        jmp ro_compare_framed

; PRIVATE exact already-framed comparison. The TWO integrated callers have
; copied canonical paths/context byte-for-byte from the physical KC source.
; Fresh INTENT mode2 spans include FS postP1 and DS RT/request arrays; typed
; SETTLED framing contains DS NONE. Do not call ro_frame on fresh RJ framing.
; No writes/rename/grant: consumes stale staging flags BEFORE proof work.
ro_compare_framed:
        mov [ro_path], dx
        mov word [kc_verified], 0
        mov byte [ro_valid], 0
        mov byte [rj_valid], 0
        mov byte [rj_live_valid], 0
        mov ax, ds
        mov bx, es
        cmp ax, bx
        jne ro_bad
        cmp byte [kc_view_active], 0
        jne ro_bad
        cmp word [kc_fh], 0ffffh
        je ro_bad
        cmp word [kn_peer_fh], 0ffffh
        jne ro_bad
        cmp word [rw_fh], 0ffffh
        jne ro_bad
        call rw_preflight
        jc ro_bad
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        mov dx, [ro_path]
        mov ax, 3d00h
        int 21h
        jc ro_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        cmp ax, [rw_header+16]
        jne .close_bad
        cmp dx, [rw_header+18]
        jne .close_bad
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        or ax, dx
        jnz .close_bad
        mov ah, 3fh
        mov cx, 256
        mov dx, kc_buf
        int 21h
        jc .close_bad
        cmp ax, 256
        jne .close_bad
        mov si, kc_buf
        mov di, rw_header
        mov cx, 128
        repe cmpsw
        jne .close_bad
        call kn_peer_close
        jc ro_bad
        mov byte [kn_peer_exact], 0
        mov eax, 256
        mov edx, 256
        mov ecx, 1232+32          ; ALL raw paths and context, never normalized
        mov di, [ro_path]
        call kn_compare_range_file
        jc ro_bad
        mov word [ro_index], 0
.section:
        mov bx, [ro_index]
        imul si, bx, 12
        add si, rw_specs
        mov ecx, [si+8]
        test ecx, ecx
        jz .next
        shl bx, 3
        mov edx, [rw_header+128+bx]
        mov eax, [si+4]
        mov di, [ro_path]
        mov byte [kn_peer_exact], 0 ; exact whole EOF already matched header
        cmp word [si], 2
        je .memory
        call kn_compare_range_file
        jc ro_bad
        jmp .next
.memory:
        ; rw_preflight bounds the range; only the two constructed banks are
        ; permitted here. Fresh uses FS postP1/DS RT; typed peers DS NONE.
        mov bx, ds
        cmp [si+2], bx
        je .segment_ok
        mov bx, fs
        cmp [si+2], bx
        jne ro_bad
.segment_ok:
        mov byte [kn_bank_compare], 1
        push gs
        mov gs, [si+2]
        call kn_compare_range_file
        pop gs
        mov byte [kn_bank_compare], 0
        jc ro_bad
.next:  inc word [ro_index]
        cmp word [ro_index], 16
        jb .section
        mov byte [ro_valid], 1
        mov word [kc_verified], 0
        mov byte [kn_peer_exact], 1
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        clc
        ret
.close_bad:
        call kn_peer_close
ro_bad:
        mov word [kc_verified], 0
        mov byte [ro_valid], 0
        mov byte [kn_peer_exact], 1
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        stc
        ret

; Build the exact expected side without emitting files. rw_preflight generates
; contiguous directory/EOF with the frozen framing/caps. All actual content
; comes from the admitted journal except the canonical derived NONE request.
ro_frame:
        mov byte [rj_valid], 0
        mov byte [rj_live_valid], 0
        cmp byte [rv_relation_valid], 1
        jne ro_bad
        cmp word [rr_header+6], 2
        jne ro_bad
        cmp al, 1
        ja ro_bad
        test al, al
        jnz .post_side
        cmp word [rr_header+28], 1 ; ENTRY predecessor is genuine GSK3
        je ro_bad
        jmp .gsk4_side
.post_side:
        cmp word [rr_header+28], 19 ; final successor is genuine GSK3
        je ro_bad
.gsk4_side:
        cmp byte [kc_view_active], 0
        jne ro_bad
        movzx bx, al
        mov [ro_side], bx
        mov si, rr_header
        mov di, rw_header
        mov cx, 128
        rep movsw
        mov word [rw_header+6], 1
        mov dword [rw_header+28], 0
        mov bx, [ro_side]
        shl bx, 1
        mov ax, [rr_header+24+bx]
        mov [rw_header+24], ax
        mov [rw_header+26], ax
        mov bx, [ro_side]
        shl bx, 3
        mov eax, [rr_header+32+bx]
        mov edx, [rr_header+36+bx]
        mov [rw_header+32], eax
        mov [rw_header+40], eax
        mov [rw_header+36], edx
        mov [rw_header+44], edx
        mov bx, [ro_side]
        shl bx, 2
        mov eax, [rr_header+64+bx]
        mov [rw_header+64], eax
        mov [rw_header+68], eax
        mov si, rv_paths
        mov di, rw_paths
        mov cx, 1232
        rep movsb
        mov si, rv_context
        mov di, rw_context
        mov cx, 32
        rep movsb
        mov word [ro_index], 0
.section:
        mov bx, [ro_index]
        mov si, bx
        cmp bx, 6
        jb .source
        cmp bx, 14
        jae .source
        and si, 0fffeh
        add si, [ro_side]
.source:
        shl si, 2
        mov eax, [rr_offsets+si]
        mov edx, [rr_lengths+si]
        imul di, bx, 12
        add di, rw_specs
        mov word [di], 1
        mov word [di+2], 0
        mov [di+4], eax
        mov [di+8], edx
        cmp bx, 2
        jne .output
        cmp word [rw_header+26], 1
        jb .absent
.output:
        cmp bx, 3
        jne .rejoin
        cmp word [rw_header+26], 2
        jb .absent
.rejoin:
        cmp bx, 15
        jne .present
        cmp word [rw_header+26], 11
        jb .absent
.present:
        test edx, edx
        jnz .next
.absent:
        mov dword [di], 0
        mov dword [di+4], 0
        mov dword [di+8], 0
.next:  inc word [ro_index]
        cmp word [ro_index], 16
        jb .section
        mov bx, [ro_side]
        shl bx, 2
        mov eax, [rr_offsets+32+bx]
        mov cx, 16
        mov di, kc_buf
        call rr_read_at
        jc ro_bad
        mov di, rj_request
        xor ax, ax
        mov cx, 64
        rep stosw
        mov dword [rj_request], 'GBRA'
        mov dword [rj_request+4], 00800001h
        mov eax, [rw_header+32]
        mov edx, [rw_header+36]
        mov [rj_request+8], eax
        mov [rj_request+12], edx
        mov ax, [rw_header+26]
        mov [rj_request+16], ax
        mov word [rj_request+22], 0ffffh
        mov eax, [kc_buf+12]
        mov [rj_request+32], eax
        mov ax, [rw_header+48]
        mov [rj_request+36], ax
        mov word [rj_request+38], 16
        mov ax, 605
        cmp word [rw_header+26], 2
        jae .pc
        mov ax, 6940
.pc:    mov [rj_request+40], ax
        mov bx, 14
        mov ax, ds
        mov edx, rj_request
        mov ecx, 128
        call rj_memory_spec
        jmp rw_preflight

ro_valid db 0
ro_side dw 0
ro_path dw 0
ro_index dw 0
