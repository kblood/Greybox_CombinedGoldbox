; PRIVATE serializer source provider. No semantic/publication grant.
; DS=ES; BX=0origin/1GBMO/2GBRI+ITEM, EAX=logical offset, CX<=512, DI=buffer.
; ep_paths points to three immutable canonical DOS paths; ep_lengths are
; physical extents. ep_descriptor is the previously validated32-byte GBRI.
; Uses its OWN read-only handle. KC physical/view state and FS/GS untouched.
; Failed close retains ep_fh; a warm read refuses before any DOS operation.
ep_read:
        cmp word [ep_fh], 0ffffh
        jne .bad
        mov dx, ds
        mov si, es
        cmp dx, si
        jne .bad
        cmp bx, 2
        ja .bad
        cmp cx, 512
        ja .bad
        test cx, cx
        jz .ok
        movzx edx, di
        movzx esi, cx
        add edx, esi
        cmp edx, 65536
        ja .bad
        cmp di, ep_end
        jae .range
        cmp edx, ep_storage
        ja .bad
.range:
        mov edx, eax
        add edx, esi
        jc .bad
        mov si, bx
        shl si, 2
        mov ebp, [ep_lengths+si]
        cmp bx, 2
        jne .bound
        add ebp, 32
        jc .bad
.bound:
        cmp edx, ebp
        ja .bad
        mov [ep_selector], bx
        mov [ep_cursor], eax
        mov [ep_left], cx
        mov [ep_dest], di
        cmp bx, 2
        jne .open
        cmp eax, 32
        jae .open
        mov cx, 32
        sub cx, ax
        cmp cx, [ep_left]
        jbe .prefix
        mov cx, [ep_left]
.prefix:
        mov dx, cx
        mov si, ep_descriptor
        add si, ax
        rep movsb
        mov [ep_dest], di
        sub [ep_left], dx
        movzx edx, dx
        add [ep_cursor], edx
        cmp word [ep_left], 0
        je .ok
.open:
        mov bx, [ep_selector]
        shl bx, 1
        mov dx, [ep_paths+bx]
        mov ax, 3d00h
        int 21h
        jc .bad
        mov [ep_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        movzx eax, ax
        movzx edx, dx
        shl edx, 16
        or eax, edx
        mov si, [ep_selector]
        shl si, 2
        cmp eax, [ep_lengths+si]
        jne .close_bad
        mov eax, [ep_cursor]
        cmp word [ep_selector], 2
        jne .seek
        sub eax, 32
.seek:
        mov [ep_position], eax
        mov dx, ax
        shr eax, 16
        mov cx, ax
        mov bx, [ep_fh]
        mov ax, 4200h
        int 21h
        jc .close_bad
        movzx eax, ax
        movzx edx, dx
        shl edx, 16
        or eax, edx
        cmp eax, [ep_position]
        jne .close_bad
        mov bx, [ep_fh]
        mov dx, [ep_dest]
        mov cx, [ep_left]
        mov ah, 3fh
        int 21h
        jc .close_bad
        cmp ax, [ep_left]
        jne .close_bad
        call ep_close
        ret
.close_bad:
        call ep_close
.bad:  stc
        ret
.ok:   clc
        ret

ep_close:
        mov bx, [ep_fh]
        cmp bx, 0ffffh
        je .bad
        mov ah, 3eh
        int 21h
        jc .bad
        mov word [ep_fh], 0ffffh
        clc
        ret
.bad:  stc
        ret

; RW preflight adapter: SI=mode3 spec, EAX=offset+length, EDX=length.
; Preserve BX directory index and EDX. No DOS or ownership changes.
ep_span:
        push bx
        mov bx, [si+2]
        cmp bx, 2
        ja .bad
        shl bx, 2
        mov ecx, [ep_lengths+bx]
        cmp bx, 8
        jne .bound
        add ecx, 32
        jc .bad
.bound:
        cmp eax, ecx
        ja .bad
        pop bx
        clc
        ret
.bad:
        pop bx
        stc
        ret

ep_storage:
ep_fh dw 0ffffh
ep_paths times 3 dw 0
ep_lengths times 3 dd 0
ep_descriptor times 32 db 0
ep_selector dw 0
ep_left dw 0
ep_dest dw 0
ep_cursor dd 0
ep_position dd 0
ep_end:
