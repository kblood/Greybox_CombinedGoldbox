; CCBIND.COM -- exact source identity for a cold ECL continuation.
;
; CCBIND /W source effect writes effect's .IDN sibling.  /N additionally
; mints a same-stem monotonically increasing .DOP occurrence token for the
; direct-DAMAGE transaction protocol. It is a versioned occurrence header;
; the separate .IDN sibling remains the exact private copy of source. CCBIND /V requires the
; current source, sibling header, sibling extent and every source byte to
; agree.  A missing, truncated, future-version, invalid-kind or trailing
; sibling is invalid.  This deliberately avoids a collision-prone digest in
; CCECL's nearly-full resident image.
        cpu 386
        bits 16
        org 100h

HDRLEN  equ 16
OPHDRLEN equ 16
BUFLEN  equ 512

start:
        cld
        call parse
        jc fail
        call side_name
        jc fail
        cmp byte [mode], 'W'
        je .write
        cmp byte [mode], 'N'
        jne .verify
        call write_identity
        jc fail
        call write_operation_token
        jc fail
        mov ax,4c00h
        int 21h
.write:
        call write_identity
        jc fail
        mov ax,4c00h
        int 21h
.verify:
        call verify_identity
        jc fail
        mov ax,4c00h
        int 21h
fail:   mov dx,msg_bad
        mov ah,9
        int 21h
        mov ax,4c01h
        int 21h

; exactly /W|/N|/V source effect, unquoted nonempty DOS tokens
parse:  mov si,81h
        xor cx,cx
        mov cl,[80h]
skip:   jcxz .bad
        cmp byte [si],' '
        jne .slash
        inc si
        dec cx
        jmp skip
.slash: cmp byte [si],'/'
        jne .bad
        inc si
        dec cx
        jcxz .bad
        lodsb
        dec cx
        and al,0DFh
        cmp al,'W'
        je .mode
        cmp al,'N'
        je .mode
        cmp al,'V'
        jne .bad
.mode:  mov [mode],al
.space: jcxz .bad
        cmp byte [si],' '
        jne .source
        inc si
        dec cx
        jmp .space
.source: mov di,source
        call token
        jc .bad
.space2:jcxz .bad
        cmp byte [si],' '
        jne .effect
        inc si
        dec cx
        jmp .space2
.effect:mov di,effect
        call token
        jc .bad
.tail:  jcxz .ok
        cmp byte [si],' '
        jne .bad
        inc si
        dec cx
        jmp .tail
.ok:    clc
        ret
.bad:   stc
        ret
; copy a bounded token at SI/CX to DI; CF on empty/overflow
token:  xor bx,bx
.loop: jcxz .end
        lodsb
        dec cx
        cmp al,' '
        je .end
        cmp al,0Dh
        je .end
        cmp bx,127
        jae .bad
        mov [di],al
        inc di
        inc bx
        jmp .loop
.end:  or bx,bx
        jz .bad
        mov byte [di],0
        clc
        ret
.bad:  stc
        ret

; Replace only the final extension.  An extensionless effect is ambiguous.
side_name:
        mov si,effect
        mov di,side
        xor bx,bx
.copy: lodsb
        mov [di],al
        or al,al
        jz .done
        cmp al,'.'
        jne .next
        mov bx,di
.next: inc di
        jmp .copy
.done: or bx,bx
        jz .bad
        mov byte [bx+1],'I'
        mov byte [bx+2],'D'
        mov byte [bx+3],'N'
        mov byte [bx+4],0
        clc
        ret
.bad:  stc
        ret

; Same bounded replacement as .IDN, but the operation record is intentionally
; separate: rewrites of source identity cannot reset a durable generation.
operation_name:
        mov si,effect
        mov di,opside
        xor bx,bx
.copy: lodsb
        mov [di],al
        or al,al
        jz .done
        cmp al,'.'
        jne .next
        mov bx,di
.next: inc di
        jmp .copy
.done: or bx,bx
        jz .bad
        mov byte [bx+1],'D'
        mov byte [bx+2],'O'
        mov byte [bx+3],'P'
        mov byte [bx+4],0
        clc
        ret
.bad:  stc
        ret

; /N creates a durable occurrence record. An absent sibling starts at one;
; malformed, truncated, future or trailing siblings are never reset, because
; that could reuse a generation after an interrupted write.
write_operation_token:
        call operation_name
        jc .bad
        mov ax,3d00h
        mov dx,opside
        int 21h
        jnc .open
        cmp ax,2
        jne .bad
        mov dword [op_generation],1
        mov dword [op_generation+4],0
        jmp .publish
.open: mov [fhb],ax
        mov bx,ax
        mov ah,3fh
        mov cx,OPHDRLEN
        mov dx,op_header
        int 21h
        jc .close_bad
        cmp ax,OPHDRLEN
        jne .close_bad
        cmp dword [op_header],'GBDO'
        jne .close_bad
        cmp word [op_header+4],1
        jne .close_bad
        cmp word [op_header+6],1
        jne .close_bad
        mov ax,[op_header+8]
        or ax,[op_header+10]
        or ax,[op_header+12]
        or ax,[op_header+14]
        jz .close_bad
        mov bx,[fhb]
        mov ax,4202h
        xor cx,cx
        xor dx,dx
        int 21h
        jc .close_bad
        or dx,dx
        jne .close_bad
        cmp ax,OPHDRLEN
        jne .close_bad
        mov ax,[op_header+8]
        mov [op_generation],ax
        mov ax,[op_header+10]
        mov [op_generation+2],ax
        mov ax,[op_header+12]
        mov [op_generation+4],ax
        mov ax,[op_header+14]
        mov [op_generation+6],ax
        add word [op_generation],1
        adc word [op_generation+2],0
        adc word [op_generation+4],0
        adc word [op_generation+6],0
        mov ax,[op_generation]
        or ax,[op_generation+2]
        or ax,[op_generation+4]
        or ax,[op_generation+6]
        je .close_bad
.close: call close_b
        jc .bad
.publish:
        mov ah,3ch
        xor cx,cx
        mov dx,opside
        int 21h
        jc .bad
        mov [fhb],ax
        mov dword [op_header],'GBDO'
        mov word [op_header+4],1
        mov word [op_header+6],1
        mov ax,[op_generation]
        mov [op_header+8],ax
        mov ax,[op_generation+2]
        mov [op_header+10],ax
        mov ax,[op_generation+4]
        mov [op_header+12],ax
        mov ax,[op_generation+6]
        mov [op_header+14],ax
        mov bx,[fhb]
        mov ah,40h
        mov cx,OPHDRLEN
        mov dx,op_header
        int 21h
        jc .close_bad
        cmp ax,OPHDRLEN
        jne .close_bad
        call close_b
        jc .bad
        clc
        ret
.close_bad:
        call close_b
.bad:   stc
        ret

open_source:
        mov ax,3d00h
        mov dx,source
        int 21h
        ret
close_a:mov bx,[fha]
        mov ah,3eh
        int 21h
        ret
close_b:mov bx,[fhb]
        mov ah,3eh
        int 21h
        ret
; AX:DX = source length and rewind A
length_a:
        mov bx,[fha]
        mov ax,4202h
        xor cx,cx
        xor dx,dx
        int 21h
        jc .bad
        mov [length],ax
        mov [length+2],dx
        mov ax,4200h
        xor cx,cx
        xor dx,dx
        int 21h
.bad:  ret

write_identity:
        call open_source
        jc .bad
        mov [fha],ax
        call length_a
        jc .close
        mov dx,side
        mov ah,41h
        int 21h                    ; stale/partial identity is never trusted
        mov ah,3ch
        xor cx,cx
        mov dx,side
        int 21h
        jc .close
        mov [fhb],ax
        mov word [header],'GB'
        mov word [header+2],'ID'
        mov word [header+4],1
        mov word [header+6],HDRLEN
        mov ax,[length]
        mov [header+8],ax
        mov ax,[length+2]
        mov [header+10],ax
        mov dword [header+12],0
        mov bx,[fhb]
        mov ah,40h
        mov cx,HDRLEN
        mov dx,header
        int 21h
        jc .closeboth
        cmp ax,HDRLEN
        jne .closeboth
.copy: mov bx,[fha]
        mov ah,3fh
        mov cx,BUFLEN
        mov dx,bufa
        int 21h
        jc .closeboth
        or ax,ax
        jz .done
        mov [count],ax
        mov bx,[fhb]
        mov ah,40h
        mov cx,[count]
        mov dx,bufa
        int 21h
        jc .closeboth
        cmp ax,[count]
        jne .closeboth
        add [copied],ax
        adc word [copied+2],0
        jmp .copy
.done: mov ax,[copied]
        cmp ax,[length]
        jne .closeboth
        mov ax,[copied+2]
        cmp ax,[length+2]
        jne .closeboth
        call close_b
        call close_a
        clc
        ret
.closeboth: call close_b
.close: call close_a
.bad:   stc
        ret

verify_identity:
        call open_source
        jc .bad
        mov [fha],ax
        call length_a
        jc .closea
        mov ax,3d00h
        mov dx,side
        int 21h
        jc .closea
        mov [fhb],ax
        mov bx,ax
        mov ah,3fh
        mov cx,HDRLEN
        mov dx,header
        int 21h
        jc .closeboth
        cmp ax,HDRLEN
        jne .closeboth
        cmp dword [header],'GBID'
        jne .closeboth
        cmp word [header+4],1
        jne .closeboth
        cmp word [header+6],HDRLEN
        jne .closeboth
        cmp dword [header+12],0
        jne .closeboth
        mov ax,[header+8]
        cmp ax,[length]
        jne .closeboth
        mov ax,[header+10]
        cmp ax,[length+2]
        jne .closeboth
        ; sidecar must be exactly header + source length, no trailing bytes.
        mov bx,[fhb]
        mov ax,4202h
        xor cx,cx
        xor dx,dx
        int 21h
        jc .closeboth
        sub ax,HDRLEN
        sbb dx,0
        jc .closeboth
        cmp ax,[length]
        jne .closeboth
        cmp dx,[length+2]
        jne .closeboth
        mov bx,[fhb]
        mov ax,4200h
        xor cx,cx
        mov dx,HDRLEN
        int 21h
        jc .closeboth
        mov ax,[length]
        mov [left],ax
        mov ax,[length+2]
        mov [left+2],ax
.loop: mov ax,[left]
        or ax,[left+2]
        jz .good
        mov cx,BUFLEN
        cmp word [left+2],0
        jne .want
        cmp word [left],cx
        jae .want
        mov cx,[left]
.want: mov [count],cx
        mov bx,[fha]
        mov ah,3fh
        mov dx,bufa
        int 21h
        jc .closeboth
        cmp ax,[count]
        jne .closeboth
        mov bx,[fhb]
        mov ah,3fh
        mov cx,[count]
        mov dx,bufb
        int 21h
        jc .closeboth
        cmp ax,[count]
        jne .closeboth
        mov si,bufa
        mov di,bufb
        mov cx,[count]
        repe cmpsb
        jne .closeboth
        mov ax,[count]                ; REP consumed CX; retain the block size.
        sub [left],ax
        sbb word [left+2],0
        jmp .loop
.good: call close_b
        call close_a
        clc
        ret
.closeboth: call close_b
.closea: call close_a
.bad:   stc
        ret

msg_bad db 'CCBIND: invalid source identity',13,10,'$'
mode db 0
source times 128 db 0
effect times 128 db 0
side times 128 db 0
opside times 128 db 0
header times HDRLEN db 0
op_header times OPHDRLEN db 0
fha dw 0
fhb dw 0
length dd 0
copied dd 0
left dd 0
count dw 0
op_generation dq 0
bufa times BUFLEN db 0
bufb times BUFLEN db 0
