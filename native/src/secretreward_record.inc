; GSK4 READ-ONLY envelope indexing. No authority, projection, writes or cleanup.
; rr_index uses kc_open/kc_read_at/kc_close; success leaves source open.
; Caller MUST admit canonical paths/GBCX, nested GSK3/GBKO, frozen resource,
; P1/state/item/ledger/action semantics and typed origin/recovery relation.
; CF clear proves only the bounded envelope and section presence/extent.
RR_HEADER equ 256
RR_PATHS equ 1232
RR_CONTEXT equ 32
RR_BODY equ 1520
RR_SOURCE_MAX equ 16*1024*1024
RR_COMPLETED_MAX equ 16817916
RR_ACTIVE_MAX equ 40725548

rr_index:
        mov word [kc_verified],0
        mov word [rr_error],1
        call kc_open
        jc rr_bad
        mov word [rr_error],2
        cmp dword [kc_extent],RR_BODY
        jb rr_close_bad
        cmp dword [kc_extent],0x7fffffff
        ja rr_close_bad
        xor eax,eax
        mov cx,RR_HEADER
        mov di,rr_header
        call rr_read_at
        jc rr_close_bad
        mov word [rr_error],3
        cmp dword [rr_header],'GSK4'
        jne rr_close_bad
        cmp word [rr_header+4],4
        jne rr_close_bad
        mov word [rr_error],2
        mov ax,[rr_header+6]
        cmp ax,1
        jb rr_close_bad
        cmp ax,2
        ja rr_close_bad
        mov si,rr_constants
        mov cx,15
.constant:
        lodsw
        mov bx,ax
        lodsw
        cmp [rr_header+bx],ax
        jne rr_close_bad
        loop .constant
        mov eax,[rr_header+16]
        cmp eax,[kc_extent]
        jne rr_close_bad
        cmp dword [rr_header+76],756
        jne rr_close_bad
        cmp word [rr_header+24],11
        ja rr_close_bad
        cmp word [rr_header+26],11
        ja rr_close_bad
        mov ax,[rr_header+48]
        dec ax
        cmp ax,5
        ja rr_close_bad
        mov si,rr_header+82
        mov cx,46
.reserved:
        lodsb
        test al,al
        jnz rr_close_bad
        loop .reserved
        mov eax,[rr_header+32]
        mov edx,[rr_header+36]
        cmp word [rr_header+6],1
        jne .intent
        mov ecx,eax
        or ecx,edx
        jz rr_close_bad
        cmp eax,[rr_header+40]
        jne rr_close_bad
        cmp edx,[rr_header+44]
        jne rr_close_bad
        mov ax,[rr_header+24]
        cmp ax,[rr_header+26]
        jne rr_close_bad
        cmp dword [rr_header+28],0
        jne rr_close_bad
        jmp .directory
.intent:
        add eax,1
        adc edx,0
        jc rr_close_bad
        cmp eax,[rr_header+40]
        jne rr_close_bad
        cmp edx,[rr_header+44]
        jne rr_close_bad
        mov ax,[rr_header+28]
        dec ax
        cmp ax,22
        ja rr_close_bad
        cmp ax,16                  ; removed action17
        je rr_close_bad
        mov ax,[rr_header+30]
        dec ax
        cmp ax,2
        ja rr_close_bad
        mov eax,[rr_header+32]
        or eax,[rr_header+36]
        cmp word [rr_header+28],1
        jne .nonentry
        test eax,eax
        jnz rr_close_bad
        jmp .transition
.nonentry:
        test eax,eax
        jz rr_close_bad
.transition:
        movzx ebx,word [rr_header+28]
        shl ebx,2
        mov cx,[rr_header+24]
        mov ax,1
        shl ax,cl
        test ax,[rr_transitions+ebx]
        jz rr_close_bad
        mov cx,[rr_header+26]
        mov ax,1
        shl ax,cl
        test ax,[rr_transitions+ebx+2]
        jz rr_close_bad
        cmp word [rr_header+28],6
        je .selection
        cmp word [rr_header+28],7
        jne .publication
.selection:
        mov ax,[rr_header+24]
        cmp ax,[rr_header+26]
        jne rr_close_bad
.publication:
        cmp word [rr_header+28],19
        jne .directory
        cmp dword [rr_header+24],0x000b000b
        jne rr_close_bad
        cmp word [rr_header+30],1
        jne rr_close_bad
.directory:
        xor ebx,ebx
        mov eax,RR_BODY
.section:
        mov edx,[rr_header+132+ebx*2]
        mov [rr_lengths+bx],edx
        mov ecx,[rr_header+128+ebx*2]
        mov [rr_offsets+bx],ecx
        test edx,edx
        jnz .present
        test ecx,ecx
        jnz rr_close_bad
        cmp bx,8                   ; section2 optional before PRODUCER
        je .optional2
        cmp bx,12
        je .optional3
        cmp bx,60
        jne rr_close_bad
        cmp word [rr_header+26],11
        je rr_close_bad
        jmp .next
.optional2:
        cmp word [rr_header+26],1
        jae rr_close_bad
        jmp .next
.optional3:
        cmp word [rr_header+26],2
        jae rr_close_bad
        jmp .next
.present:
        cmp ecx,eax
        jne rr_close_bad
        cmp edx,[rr_minimum+bx]
        jb rr_close_bad
        cmp edx,[rr_maximum+bx]
        ja rr_close_bad
        cmp bx,8
        jne .presence3
        cmp word [rr_header+26],1
        jb rr_close_bad
.presence3:
        cmp bx,12
        jne .presence15
        cmp word [rr_header+26],2
        jb rr_close_bad
.presence15:
        cmp bx,60
        jne .sum
        cmp word [rr_header+26],11
        jne rr_close_bad
.sum:
        add eax,edx
        jc rr_close_bad
        cmp eax,[kc_extent]
        ja rr_close_bad
.next:
        add bx,4
        cmp bx,64
        jb .section
        cmp eax,[kc_extent]
        jne rr_close_bad
        mov eax,[rr_lengths+24]
        cmp eax,[rr_header+64]
        jne rr_close_bad
        mov eax,[rr_lengths+28]
        cmp eax,[rr_header+68]
        jne rr_close_bad
        mov eax,[rr_header+72]
        cmp eax,16
        jb rr_close_bad
        cmp eax,RR_SOURCE_MAX
        ja rr_close_bad
        add eax,32
        cmp eax,[rr_lengths+16]
        jne rr_close_bad
        mov word [rr_error],0
        clc
        ret
rr_close_bad:
        call kc_close
rr_bad:
        stc
        ret

; Exact read with checked u32 range and returned DOS seek position.
; EAX offset, CX length, DI destination. Preserves no scratch registers.
rr_read_at:
        mov [rr_read_offset],eax
        mov [rr_read_length],cx
        mov [rr_read_dest],di
        movzx edx,cx
        add edx,eax
        jc .bad
        cmp edx,[kc_extent]
        ja .bad
        mov edx,eax
        shr eax,16
        mov cx,ax
        mov bx,[kc_fh]
        mov ax,4200h
        int 21h
        jc .bad
        movzx ecx,dx
        shl ecx,16
        mov cx,ax
        cmp ecx,[rr_read_offset]
        jne .bad
        mov bx,[kc_fh]
        mov dx,[rr_read_dest]
        mov cx,[rr_read_length]
        mov ah,3fh
        int 21h
        jc .bad
        cmp ax,[rr_read_length]
        jne .bad
        clc
        ret
.bad:
        stc
        ret

; Action indexed pre/post phase masks; semantic resource predicates are caller-owned.
rr_transitions dw 0,0,1,1,1,2,2,4,4,8,8,16,48,48,48,48
               dw 32,64,64,48,64,80,32,128,256,144,256,128
               dw 16,1536,512,16,512,1024,0,0,1024,2048,2048,2048
               dw 16,240,32,16,128,48,128,256
rr_constants dw 8,4,10,1,12,256,14,16,20,11,22,32,50,16,52,604,54,605
             dw 56,18,58,12,60,80,62,0,76,756,80,1
rr_minimum dd 64,18,64,64,48,756,16,16,160,160,960,960,1056,1056,128,64
rr_maximum dd RR_ACTIVE_MAX,18,RR_COMPLETED_MAX,RR_ACTIVE_MAX,32+RR_SOURCE_MAX,756
           dd 32768,32768,160,160,960,960,1056,1056,128,RR_COMPLETED_MAX
rr_header times RR_HEADER db 0
rr_offsets times 16 dd 0
rr_lengths times 16 dd 0
rr_error dw 0                  ; 1 IO, 2 malformed envelope, 3 unknown tag/version
rr_read_offset dd 0
rr_read_length dw 0
rr_read_dest dw 0
