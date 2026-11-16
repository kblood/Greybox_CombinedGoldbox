; PRIVATE unpublished GSK4 framing writer. No authority/semantic admission.
; DX=owned ABSENT scratch path; DS=ES resident, no active kc section view.
; rw_header256/paths1232/context32, rw_specs16*12:
; +0u16mode0absent/1physical already-open kc source/2memory, +2u16segment,
; +4u32source offset,+8u32length. Mode0 requires ALL fields0; mode1 segment0.
; Rebuilds contiguous directory/EOF. All framing/source bounds BEFORE DOS5B.
; Exact512-byte chunks/close. CF1 leaves partial scratch; NEVER delete/promote.
; Caller owns path aliases, source/typed/replay admission, reopen verification.
; Source handle/bytes and segments remain unchanged. General regs scratch.
; rw_close retains rw_fh on close failure so caller can retry exact owned close.
rw_write:
        mov word [kc_verified],0 ; framing never retains or grants old publication authority
        mov ax,ds
        mov bx,es
        cmp ax,bx
        jne rw_bad
        cmp word [rw_fh],0ffffh
        jne rw_bad
        cmp byte [kc_view_active],0
        jne rw_bad
        mov [rw_path],dx
        call rw_preflight
        jc rw_bad
        mov dx,[rw_path]
        xor cx,cx
        mov ax,5b00h             ; exclusive create, never truncate existing path
        int 21h
        jc rw_bad
        mov [rw_fh],ax
        mov word [rw_mode],2
        mov ax,ds
        mov [rw_segment],ax
        mov dword [rw_cursor],rw_header
        mov dword [rw_left],256
        call rw_emit
        jc rw_fail
        mov dword [rw_cursor],rw_paths
        mov dword [rw_left],1232
        call rw_emit
        jc rw_fail
        mov dword [rw_cursor],rw_context
        mov dword [rw_left],32
        call rw_emit
        jc rw_fail
        mov word [rw_index],0
.section:
        mov si,[rw_index]
        imul si,12
        add si,rw_specs
        mov ax,[si]
        mov [rw_mode],ax
        test ax,ax
        jz .next
        mov ax,[si+2]
        mov [rw_segment],ax
        mov eax,[si+4]
        mov [rw_cursor],eax
        mov eax,[si+8]
        mov [rw_left],eax
        call rw_emit
        jc rw_fail
.next: inc word [rw_index]
        cmp word [rw_index],16
        jb .section
        call rw_close
        jc rw_bad
        clc
        ret
rw_fail:
        call rw_close
rw_bad:
        stc
        ret
rw_close:
        mov bx,[rw_fh]
        cmp bx,0ffffh
        je rw_bad
        mov ah,3eh
        int 21h
        jc rw_bad                 ; RETAIN owned handle on close failure
        mov word [rw_fh],0ffffh
        clc
        ret

rw_emit:
        mov eax,[rw_left]
        test eax,eax
        jz .done
        mov cx,512
        cmp eax,512
        jae .chunk
        mov cx,ax
.chunk:
        mov [rw_chunk],cx
%ifdef RW_SECTION_PROVIDER
        cmp word [rw_mode],3
        jne .standard_source
        mov bx,[rw_segment]       ; private provider selector, not a segment
        mov eax,[rw_cursor]
        mov di,rw_buf
        call RW_SECTION_PROVIDER
        jc rw_bad
        jmp .write
.standard_source:
%endif
        cmp word [rw_mode],1
        jne .memory
        mov eax,[rw_cursor]
        mov di,rw_buf
        call rr_read_at           ; physical source, exact returned seek/read
        jc rw_bad
        jmp .write
.memory:
        push fs
        mov fs,[rw_segment]
        mov si,[rw_cursor]
        mov di,rw_buf
.copy: mov al,[fs:si]
        inc si
        stosb
        loop .copy
        pop fs
.write:
        mov bx,[rw_fh]
        mov dx,rw_buf
        mov cx,[rw_chunk]
        mov ah,40h
        int 21h
        jc rw_bad
        cmp ax,[rw_chunk]
        jne rw_bad
        movzx eax,word [rw_chunk]
        add [rw_cursor],eax
        sub [rw_left],eax
        jmp rw_emit
.done: clc
        ret

rw_preflight:
        cmp dword [rw_header],'GSK4'
        jne rw_bad
        cmp word [rw_header+4],4
        jne rw_bad
        mov ax,[rw_header+6]
        cmp ax,1
        jb rw_bad
        cmp ax,2
        ja rw_bad
        mov si,rr_constants
        mov cx,15
.constant:
        lodsw
        mov bx,ax
        lodsw
        cmp [rw_header+bx],ax
        jne rw_bad
        loop .constant
        cmp dword [rw_header+76],756
        jne rw_bad
        cmp word [rw_header+24],11
        ja rw_bad
        cmp word [rw_header+26],11
        ja rw_bad
        mov ax,[rw_header+48]
        dec ax
        cmp ax,5
        ja rw_bad
        mov si,rw_header+82
        mov cx,46
.reserved:
        lodsb
        test al,al
        jnz rw_bad
        loop .reserved
        mov eax,[rw_header+32]
        mov edx,[rw_header+36]
        cmp word [rw_header+6],1
        jne .intent
        mov ecx,eax
        or ecx,edx
        jz rw_bad
        cmp eax,[rw_header+40]
        jne rw_bad
        cmp edx,[rw_header+44]
        jne rw_bad
        mov ax,[rw_header+24]
        cmp ax,[rw_header+26]
        jne rw_bad
        cmp dword [rw_header+28],0
        jne rw_bad
        jmp .directory
.intent:
        add eax,1
        adc edx,0
        jc rw_bad
        cmp eax,[rw_header+40]
        jne rw_bad
        cmp edx,[rw_header+44]
        jne rw_bad
        mov ax,[rw_header+28]
        dec ax
        cmp ax,22
        ja rw_bad
        cmp ax,16
        je rw_bad
        mov ax,[rw_header+30]
        dec ax
        cmp ax,2
        ja rw_bad
        mov eax,[rw_header+32]
        or eax,[rw_header+36]
        cmp word [rw_header+28],1
        jne .nonentry
        test eax,eax
        jnz rw_bad
        jmp .transition
.nonentry:
        test eax,eax
        jz rw_bad
.transition:
        movzx ebx,word [rw_header+28]
        shl ebx,2
        mov cx,[rw_header+24]
        mov ax,1
        shl ax,cl
        test ax,[rr_transitions+ebx]
        jz rw_bad
        mov cx,[rw_header+26]
        mov ax,1
        shl ax,cl
        test ax,[rr_transitions+ebx+2]
        jz rw_bad
        cmp word [rw_header+28],6
        je .selection
        cmp word [rw_header+28],7
        jne .publication
.selection:
        mov ax,[rw_header+24]
        cmp ax,[rw_header+26]
        jne rw_bad
.publication:
        cmp word [rw_header+28],19
        jne .directory
        cmp dword [rw_header+24],000b000bh
        jne rw_bad
        cmp word [rw_header+30],1
        jne rw_bad
.directory:
        mov dword [rw_extent],1520
        mov word [rw_index],0
.section:
        mov bx,[rw_index]
        shl bx,2
        mov si,[rw_index]
        imul si,12
        add si,rw_specs
        mov ax,[si]
%ifdef RW_SECTION_PROVIDER
        cmp ax,3
        je .provider_present
%endif
        cmp ax,2
        ja rw_bad
        test ax,ax
        jnz .present
        cmp word [si+2],0
        jne rw_bad
        cmp dword [si+4],0
        jne rw_bad
        cmp dword [si+8],0
        jne rw_bad
        cmp bx,8
        je .absent2
        cmp bx,12
        je .absent3
        cmp bx,60
        jne rw_bad
        cmp word [rw_header+26],11
        je rw_bad
        jmp .absent
.absent2:
        cmp word [rw_header+26],1
        jae rw_bad
        jmp .absent
.absent3:
        cmp word [rw_header+26],2
        jae rw_bad
.absent:
        movzx ebx,bx
        mov dword [rw_header+128+ebx*2],0
        mov dword [rw_header+132+ebx*2],0
        jmp .next
%ifdef RW_SECTION_PROVIDER
.provider_present:
%endif
.present:
        mov edx,[si+8]
        cmp edx,[rr_minimum+bx]
        jb rw_bad
        cmp edx,[rr_maximum+bx]
        ja rw_bad
        cmp bx,8
        jne .presence3
        cmp word [rw_header+26],1
        jb rw_bad
.presence3:
        cmp bx,12
        jne .presence15
        cmp word [rw_header+26],2
        jb rw_bad
.presence15:
        cmp bx,60
        jne .source
        cmp word [rw_header+26],11
        jne rw_bad
.source:
        mov eax,[si+4]
        add eax,edx
        jc rw_bad
%ifdef RW_SECTION_PROVIDER
        cmp word [si],3
        jne .standard_bound
        call RW_SECTION_BOUND
        jc rw_bad
        jmp .sum
.standard_bound:
%endif
        cmp word [si],1
        jne .memory_bound
        cmp word [si+2],0
        jne rw_bad
        cmp word [kc_fh],0ffffh
        je rw_bad
        cmp dword [kc_extent],0x7fffffff
        ja rw_bad
        cmp eax,[kc_extent]
        ja rw_bad
        jmp .sum
.memory_bound:
        cmp eax,65536
        ja rw_bad
.sum:
        mov eax,[rw_extent]
        movzx ebx,bx
        mov [rw_header+128+ebx*2],eax
        mov [rw_header+132+ebx*2],edx
        add eax,edx
        jc rw_bad
        cmp eax,0x7fffffff
        ja rw_bad
        mov [rw_extent],eax
.next:
        inc word [rw_index]
        cmp word [rw_index],16
        jb .section
        mov eax,[rw_extent]
        mov [rw_header+16],eax
        mov eax,[rw_specs+6*12+8]
        cmp eax,[rw_header+64]
        jne rw_bad
        mov eax,[rw_specs+7*12+8]
        cmp eax,[rw_header+68]
        jne rw_bad
        mov eax,[rw_header+72]
        cmp eax,16
        jb rw_bad
        cmp eax,RR_SOURCE_MAX
        ja rw_bad
        add eax,32
        cmp eax,[rw_specs+4*12+8]
        jne rw_bad
        clc
        ret

rw_fh dw 0ffffh
rw_path dw 0
rw_index dw 0
rw_mode dw 0
rw_segment dw 0
rw_chunk dw 0
rw_cursor dd 0
rw_left dd 0
rw_extent dd 0
rw_header times 256 db 0
rw_paths times 1232 db 0
rw_context times 32 db 0
rw_specs times 16*12 db 0
rw_buf times 512 db 0
