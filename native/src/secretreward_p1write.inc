; PRIVATE raw P1 scratch writer, no semantic/owner/publication authority.
; rq_write DX=caller-owned ABSENT path, DS=ES resident, FS=rz post bank.
; rz_valid=1, rz_ds_extent=actual resident extent, GS=immutable origin bank.
; Rechecks SR framing under temporary GS, restoring all 60 SR metadata bytes.
; Banks must satisfy existing RZ disjoint intervals. Source/FS never written.
; Uses frozen rw_buf512 only: caller must finish this BEFORE INTENT writing.
; RW header/specs/handle and source handle/view remain unchanged. General
; registers scratch, segments preserved. Exclusive5B; partial file on failure
; belongs to caller. No delete/rename/reopen/grant. rq_close retains failed FD.
rq_write:
        mov word [kc_verified],0
        mov ax,ds
        mov bx,es
        cmp ax,bx
        jne rq_bad
        cmp word [rq_fh],0ffffh
        jne rq_bad
        cmp byte [kc_view_active],0
        jne rq_bad
        cmp byte [rz_valid],1
        jne rq_bad
        cmp word [rz_ds_extent],0
        je rq_bad
        push dx
        mov ax,[rz_length]
        cmp ax,16
        jb rq_preflight_bad
        cmp ax,32768
        ja rq_preflight_bad
        movzx eax,word [rz_ds_extent]
        cmp eax,rq_end
        jb rq_preflight_bad
        mov ax,ds
        movzx eax,ax
        shl eax,4
        movzx edx,word [rz_ds_extent]
        mov bx,gs
        movzx ebx,bx
        shl ebx,4
        mov ecx,32768
        call rz_disjoint
        jc rq_preflight_bad
        mov ax,ds
        movzx eax,ax
        shl eax,4
        movzx edx,word [rz_ds_extent]
        mov bx,fs
        movzx ebx,bx
        shl ebx,4
        mov ecx,65536
        call rz_disjoint
        jc rq_preflight_bad
        mov ax,gs
        movzx eax,ax
        shl eax,4
        mov edx,32768
        mov bx,fs
        movzx ebx,bx
        shl ebx,4
        mov ecx,65536
        call rz_disjoint
        jc rq_preflight_bad
        pop dx
        mov [rq_path],dx
        cld
        mov si,sr_length
        mov di,rq_sr_saved
        mov cx,30
        rep movsw
        push gs
        push fs
        pop gs
        mov ax,[rz_length]
        mov [sr_length],ax
        call sr_validate
        pop gs
        pushf
        mov si,rq_sr_saved
        mov di,sr_length
        mov cx,30
        rep movsw
        popf
        jc rq_bad
        mov dx,[rq_path]
        xor cx,cx
        mov ax,5b00h
        int 21h
        jc rq_bad
        mov [rq_fh],ax
        mov word [rq_cursor],0
        mov ax,[rz_length]
        mov [rq_left],ax
.chunk:
        mov cx,[rq_left]
        test cx,cx
        jz .done
        cmp cx,512
        jbe .size
        mov cx,512
.size: mov [rq_chunk],cx
        mov si,[rq_cursor]
        mov di,rw_buf
.copy: mov al,[fs:si]
        inc si
        stosb
        loop .copy
        mov bx,[rq_fh]
        mov dx,rw_buf
        mov cx,[rq_chunk]
        mov ah,40h
        int 21h
        jc .fail
        cmp ax,[rq_chunk]
        jne .fail
        add [rq_cursor],ax
        sub [rq_left],ax
        jmp .chunk
.done: call rq_close
        ret
.fail: call rq_close
rq_bad:
        stc
        ret
rq_preflight_bad:
        pop dx
        jmp rq_bad
rq_close:
        mov bx,[rq_fh]
        cmp bx,0ffffh
        je rq_bad
        mov ah,3eh
        int 21h
        jc rq_bad
        mov word [rq_fh],0ffffh
        clc
        ret
rq_fh dw 0ffffh
rq_path dw 0
rq_cursor dw 0
rq_left dw 0
rq_chunk dw 0
rq_sr_saved times 60 db 0
rq_end:
