; Bounded DOS file primitives for the Secret continuation coordinator.
; These routines do not interpret or authorize GSK/GBKO state. The coordinator
; must validate complete closed snapshots before setting kc_verified and
; publishing. u32 extents are streamed through two fixed 512-byte buffers.
; Range/compare failures never write. A copy failure may leave partial scratch;
; its caller must discard it, and it cannot retain publication authorization.
KC_IO_BYTES equ 512

; DX=source path. Reset invocation ownership, open read-only, record u32 EOF.
kc_open:
        cmp word [kc_fh], 0ffffh
        jne kc_bad
        mov word [kc_fh], 0ffffh
        mov word [kc_verified], 0
        mov byte [kc_view_active], 0
        mov dword [kc_view_base], 0
        mov dword [kc_extent], 0
        mov ax, 3D00h
        int 21h
        jc kc_bad
        mov [kc_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        movzx ecx, dx
        shl ecx, 16
        mov cx, ax
        mov [kc_extent], ecx
        clc
        ret
.close_bad:
        call kc_close
        jmp kc_bad

kc_close:
        mov bx, [kc_fh]
        cmp bx, 0ffffh
        je kc_bad
        mov ah, 3Eh
        int 21h
        jc kc_bad                 ; retain the handle so teardown can retry
        mov word [kc_fh], 0ffffh
        cmp byte [kc_view_active], 0
        je .closed
        call kc_view_end
.closed:
        clc
        ret

; Internal read-only nested record view. An indexed parent section defines
; EAX=physicalbase, EDX=extent; no path/output/semantic authority is granted.
; One level only. All logical reads remain inside this exact section.
kc_view_begin:
        mov word [kc_verified], 0
        cmp word [kc_fh], 0ffffh
        je kc_bad
        cmp byte [kc_view_active], 0
        jne kc_bad
        mov ecx, eax
        add ecx, edx
        jc kc_bad
        cmp ecx, [kc_extent]
        ja kc_bad
        test edx, edx
        jz kc_bad
        mov [kc_view_base], eax
        mov eax, [kc_extent]
        mov [kc_view_parent_extent], eax
        mov [kc_extent], edx
        mov byte [kc_view_active], 1
        clc
        ret

kc_view_end:
        mov word [kc_verified], 0
        cmp byte [kc_view_active], 1
        jne kc_bad
        mov eax, [kc_view_parent_extent]
        mov [kc_extent], eax
        mov dword [kc_view_base], 0
        mov byte [kc_view_active], 0
        clc
        ret

; EAX=source offset, CX=length, DI=DS destination. Reject overflow/EOF before
; seeking. All counters are independent of DOS's returned AX/DX values.
kc_read_at:
        mov word [kc_error], 2
        cmp byte [kc_view_active], 0
        je .ordinary
        mov word [kc_verified], 0
.ordinary:
        cmp word [kc_fh], 0ffffh
        je kc_bad
        mov [kc_read_len], cx
        mov [kc_read_dest], di
        mov edx, eax
        movzx ecx, cx
        add edx, ecx
        jc kc_bad
        cmp edx, [kc_extent]
        ja kc_bad
        add eax, [kc_view_base]
        jc kc_bad
        mov [kc_read_position], eax
        mov edx, eax
        shr eax, 16
        mov cx, ax
        mov bx, [kc_fh]
        mov ax, 4200h
        mov word [kc_error], 1
        int 21h
        jc kc_bad
        movzx ecx, dx
        shl ecx, 16
        mov cx, ax
        cmp ecx, [kc_read_position]
        jne kc_bad
        mov bx, [kc_fh]
        mov dx, [kc_read_dest]
        mov cx, [kc_read_len]
        mov ah, 3Fh
        int 21h
        jc kc_bad
        cmp ax, [kc_read_len]
        jne kc_bad
        clc
        ret

; EAX=source offset, EDX=u32 length, BX=other already-open handle.
; kc_mode=0 copies into the other file at its current position; mode=1 compares
; its complete contents and requires exact EOF. Caller owns other handle close.
; Copying is only to unpublished coordinator scratch, never live authority.
kc_transfer:
        mov word [kc_verified], 0
        cmp byte [kc_view_active], 0
        je .ordinary
        cmp byte [kc_mode], 1          ; a nested view is read-only
        jne kc_bad
.ordinary:
        cmp byte [kc_mode], 1
        ja kc_bad
        cmp bx, [kc_fh]
        je kc_bad
        mov [kc_other], bx
        mov [kc_offset], eax
        mov [kc_left], edx
        add eax, edx
        jc kc_bad
        cmp eax, [kc_extent]
        ja kc_bad
        cmp byte [kc_mode], 1
        jne .chunk
        mov bx, [kc_other]
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc kc_bad
.chunk:
        mov eax, [kc_left]
        test eax, eax
        jz .complete
        cmp eax, KC_IO_BYTES
        jbe .bounded
        mov ax, KC_IO_BYTES
.bounded:
        mov [kc_chunk], ax
        mov cx, ax
        mov eax, [kc_offset]
        mov di, kc_buf
        call kc_read_at
        jc kc_bad
        cmp byte [kc_mode], 1
        je .compare
        mov bx, [kc_other]
        mov cx, [kc_chunk]
        mov dx, kc_buf
        mov ah, 40h
        int 21h
        jc kc_bad
        cmp ax, [kc_chunk]
        jne kc_bad
        jmp .advance
.compare:
        mov bx, [kc_other]
        mov cx, [kc_chunk]
        mov dx, kc_cmp
        mov ah, 3Fh
        int 21h
        jc kc_bad
        cmp ax, [kc_chunk]
        jne kc_bad
        push ds
        pop es
        mov si, kc_buf
        mov di, kc_cmp
        mov cx, [kc_chunk]
        repe cmpsb
        jne kc_bad
.advance:
        movzx eax, word [kc_chunk]
        add [kc_offset], eax
        sub [kc_left], eax
        jmp .chunk
.complete:
        cmp byte [kc_mode], 1
        jne .ok
        mov bx, [kc_other]
        mov dx, kc_cmp
        mov cx, 1
        mov ah, 3Fh
        int 21h
        jc kc_bad
        test ax, ax
        jnz kc_bad
.ok:   clc
        ret

; SI=validated closed scratch, DI=absent authority, with canonical disjoint
; paths established by the semantic coordinator. This primitive NEVER replaces
; existing authority. Phase replacement requires the separate recovery journal.
kc_publish:
        call kc_no_view
        jc kc_bad
        cmp word [kc_verified], 1
        jne kc_bad
        cmp word [kc_fh], 0ffffh
        jne kc_bad
        mov [kc_scratch], si
        mov [kc_live], di
        mov cx, 112
.same:
        lodsb
        mov ah, [di]
        inc di
        cmp al, 'a'
        jb .left
        cmp al, 'z'
        ja .left
        sub al, 32
.left:
        cmp ah, 'a'
        jb .right
        cmp ah, 'z'
        ja .right
        sub ah, 32
.right:
        cmp al, ah
        jne .different
        test al, al
        jz kc_bad
        loop .same
        jmp kc_bad
.different:
        mov dx, [kc_live]
        call kc_probe
        jc kc_bad
        test ax, ax
        jnz kc_bad
        push ds
        pop es
        mov dx, [kc_scratch]
        mov di, [kc_live]
        mov ah, 56h
        int 21h
        jc kc_bad
        mov word [kc_verified], 0     ; cannot reuse publication authorization
        clc
        ret

kc_bad:
        stc
        ret

; Return AX=0 for true file-not-found, AX=1 for present, CF for other IO.
; Unlike metadata inference, an access/path error can never authorize rename.
kc_probe:
        cmp word [kc_probe_fh], 0ffffh
        jne kc_bad
        mov ax, 3D00h
        int 21h
        jc .absent
        mov [kc_probe_fh], ax
        call kc_probe_close
        jc kc_bad
        mov ax, 1
        clc
        ret
.absent:
        cmp ax, 2
        jne kc_bad
        xor ax, ax
        ret

kc_probe_close:
        mov bx, [kc_probe_fh]
        cmp bx, 0ffffh
        je kc_bad
        mov ah, 3Eh
        int 21h
        jc kc_bad
        mov word [kc_probe_fh], 0ffffh
        clc
        ret

; SI/DI canonical paths. Case-insensitive equal/unterminated -> CF.
kc_disjoint:
        mov cx, 112
.byte:
        lodsb
        mov ah, [di]
        inc di
        cmp al, 'a'
        jb .left
        cmp al, 'z'
        ja .left
        sub al, 32
.left:
        cmp ah, 'a'
        jb .right
        cmp ah, 'z'
        ja .right
        sub ah, 32
.right:
        cmp al, ah
        jne .different
        test al, al
        jz kc_bad
        loop .byte
        jmp kc_bad
.different:
        clc
        ret

; Replace an existing authority without deleting it. SI=closed candidate,
; DI=old authority, BP=absent backup. The coordinator must bind old/new phases
; semantically and establish canonical ownership before setting kc_verified.
; On success the backup REMAINS until new authority is reopened/validated.
; Failure of second rename attempts rollback; failed rollback retains backup.
kc_replace:
        call kc_no_view
        jc kc_bad
        cmp word [kc_verified], 1
        jne kc_bad
        cmp word [kc_fh], 0ffffh
        jne kc_bad
        mov [kc_scratch], si
        mov [kc_live], di
        mov [kc_backup], bp
        call kc_disjoint
        jc kc_bad
        mov si, [kc_scratch]
        mov di, [kc_backup]
        call kc_disjoint
        jc kc_bad
        mov si, [kc_live]
        mov di, [kc_backup]
        call kc_disjoint
        jc kc_bad
        mov dx, [kc_backup]
        call kc_probe
        jc kc_bad
        test ax, ax
        jnz kc_bad
        mov dx, [kc_live]
        call kc_probe
        jc kc_bad
        cmp ax, 1
        jne kc_bad
        push ds
        pop es
        mov dx, [kc_live]
        mov di, [kc_backup]
        mov ah, 56h
        int 21h
        jc kc_bad
        mov dx, [kc_scratch]
        mov di, [kc_live]
        mov ah, 56h
        int 21h
        jc .rollback
        mov word [kc_verified], 0
        clc
        ret
.rollback:
        mov dx, [kc_backup]
        mov di, [kc_live]
        mov ah, 56h
        int 21h
        mov word [kc_verified], 0
        jmp kc_bad

; Recover only a semantically validated closed backup into true absence.
; Existing live authority is retained for the coordinator's phase validation.
kc_recover:
        call kc_no_view
        jc kc_bad
        cmp word [kc_verified], 1
        jne kc_bad
        cmp word [kc_fh], 0ffffh
        jne kc_bad
        mov [kc_backup], si
        mov [kc_live], di
        call kc_disjoint
        jc kc_bad
        mov dx, [kc_live]
        call kc_probe
        jc kc_bad
        test ax, ax
        jnz kc_bad
        push ds
        pop es
        mov dx, [kc_backup]
        mov di, [kc_live]
        mov ah, 56h
        int 21h
        jc kc_bad
        mov word [kc_verified], 0
        clc
        ret

; Compare two u32 ranges within the same closed-source snapshot: EAX first,
; EDX second, ECX length. Used to bind embedded producer receipts exactly.
kc_equal_offsets:
        mov word [kc_error], 2
        mov [kc_offset], eax
        mov [kc_second], edx
        mov [kc_left], ecx
        add eax, ecx
        jc kc_bad
        cmp eax, [kc_extent]
        ja kc_bad
        add edx, ecx
        jc kc_bad
        cmp edx, [kc_extent]
        ja kc_bad
.chunk:
        mov eax, [kc_left]
        test eax, eax
        jz .ok
        cmp eax, KC_IO_BYTES
        jbe .bounded
        mov ax, KC_IO_BYTES
.bounded:
        mov [kc_chunk], ax
        mov cx, ax
        mov eax, [kc_offset]
        mov di, kc_buf
        call kc_read_at
        jc kc_bad
        mov cx, [kc_chunk]
        mov eax, [kc_second]
        mov di, kc_cmp
        call kc_read_at
        jc kc_bad
        push ds
        pop es
        mov si, kc_buf
        mov di, kc_cmp
        mov cx, [kc_chunk]
        mov word [kc_error], 2
        repe cmpsb
        jne kc_bad
        movzx eax, word [kc_chunk]
        add [kc_offset], eax
        add [kc_second], eax
        sub [kc_left], eax
        jmp .chunk
.ok:   clc
        ret

kc_no_view:
        cmp byte [kc_view_active], 0
        je .ok
        mov word [kc_verified], 0
        stc
        ret
.ok:    clc
        ret

kc_fh dw 0ffffh
kc_other dw 0
kc_extent dd 0
kc_offset dd 0
kc_second dd 0
kc_left dd 0
kc_read_len dw 0
kc_read_dest dw 0
kc_read_position dd 0
kc_view_base dd 0
kc_view_parent_extent dd 0
kc_view_active db 0
kc_chunk dw 0
kc_mode db 0
kc_verified dw 0
kc_scratch dw 0
kc_live dw 0
kc_backup dw 0
kc_probe_fh dw 0ffffh
kc_error dw 0                 ; 1=IO,2=range/content rejection (on CF)
kc_buf times KC_IO_BYTES db 0
kc_cmp times KC_IO_BYTES db 0
