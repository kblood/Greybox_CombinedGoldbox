; Private ENTRY candidate comparator for the disposable native framing probe.
; DX=candidate path. Requires frozen expected header/paths/context and rw_specs.
; Uses the ordinary RR candidate reader plus the ENTRY source provider. It is
; not included by production CCNEXT and grants no publication authority.
ep_compare:
        cmp word [kc_fh],0ffffh
        jne .bad
        cmp byte [kc_view_active],0
        jne .bad
        call rr_index
        jc .bad
        mov si,rr_header
        mov di,rw_header
        mov cx,256
        repe cmpsb
        jne .close_bad
        mov word [ec_part],0
        mov dword [ec_cursor],0
.fixed:
        mov bx,[ec_part]
        shl bx,1
        movzx eax,word [ec_offsets+bx]
        movzx ecx,word [ec_lengths+bx]
        cmp [ec_cursor],ecx
        jae .fixed_next
        sub ecx,[ec_cursor]
        cmp ecx,512
        jbe .fixed_chunk
        mov ecx,512
.fixed_chunk:
        mov [ec_chunk],cx
        add eax,[ec_cursor]
        mov di,kc_cmp
        call rr_read_at
        jc .close_bad
        mov si,[ec_cursor]
        cmp word [ec_part],0
        jne .context
        mov si,rw_paths
        jmp .fixed_cmp
.context:
        mov si,rw_context
.fixed_cmp:
        add si,[ec_cursor]
        mov di,kc_cmp
        mov cx,[ec_chunk]
        repe cmpsb
        jne .close_bad
        movzx eax,word [ec_chunk]
        add [ec_cursor],eax
        jmp .fixed
.fixed_next:
        inc word [ec_part]
        cmp word [ec_part],2
        jb .fixed_more
        mov word [ec_index],0
        jmp .section
.fixed_more:
        mov dword [ec_cursor],0
        jmp .fixed
.section:
        mov bx,[ec_index]
        imul si,bx,12
        add si,rw_specs
        mov ax,[si]
        test ax,ax
        jz .next
        mov [ec_mode],ax
        mov ax,[si+2]
        mov [ec_bank],ax
        mov eax,[si+4]
        mov [ec_source],eax
        mov eax,[si+8]
        mov [ec_left],eax
        movzx bx,word [ec_index]
        shl bx,2
        mov eax,[rr_offsets+bx]
        mov [ec_destination],eax
.chunk:
        mov eax,[ec_left]
        test eax,eax
        jz .next
        mov cx,512
        cmp eax,512
        jae .chunk_ready
        mov cx,ax
.chunk_ready:
        mov [ec_chunk],cx
        cmp word [ec_mode],3
        jne .memory
        mov bx,[ec_bank]
        mov eax,[ec_source]
        mov cx,[ec_chunk]
        mov di,rw_buf
        call ep_read
        jc .close_bad
        jmp .candidate
.memory:
        push fs
        mov ax,[ec_bank]
        mov fs,ax
        mov si,[ec_source]
        mov di,rw_buf
        mov cx,[ec_chunk]
.copy: mov al,[fs:si]
        inc si
        stosb
        loop .copy
        pop fs
.candidate:
        mov eax,[ec_destination]
        mov cx,[ec_chunk]
        mov di,kc_cmp
        call rr_read_at
        jc .close_bad
        mov si,rw_buf
        mov di,kc_cmp
        mov cx,[ec_chunk]
        repe cmpsb
        jne .close_bad
        movzx eax,word [ec_chunk]
        add [ec_source],eax
        add [ec_destination],eax
        sub [ec_left],eax
        jmp .chunk
.next:
        inc word [ec_index]
        cmp word [ec_index],16
        jb .section
        call kc_close
        ret
.close_bad:
        call kc_close
.bad:  stc
        ret

ec_part dw 0
ec_offsets dw 256,1488
ec_lengths dw 1232,32
ec_cursor dd 0
ec_index dw 0
ec_mode dw 0
ec_bank dw 0
ec_source dd 0
ec_left dd 0
ec_destination dd 0
ec_chunk dw 0
