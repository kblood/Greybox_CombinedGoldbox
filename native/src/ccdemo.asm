; CCDEMO.COM -- standalone GBDM v1 native attract-manifest reader.
; Usage: CCDEMO manifest.gbd
; This initial player executes the complete stream as a deterministic DOS trace.
; Rendering/CCFP/CCCOMBAT dispatch is intentionally layered on this validated
; reader rather than changing CCECL's resume-compatible GBEF record.
        cpu 386
        bits 16
        org 100h

start:  cld
        mov sp,stacktop
        push cs
        pop ds
        mov byte [fname],0
        call parse
        cmp byte [fname],0
        je usage
        mov ax,3d00h
        mov dx,fname
        int 21h
        jc bad
        mov [fh],ax
        mov bx,ax
        mov ah,3fh
        mov cx,10
        mov dx,hdr
        int 21h
        cmp ax,10
        jne badclose
        cmp word [hdr],'BG'
        jne badclose
        cmp word [hdr+2],'DM'
        jne badclose
        cmp word [hdr+4],1
        jne badclose
        mov ax,[hdr+6]
        cmp ax,1
        jb badclose
        cmp ax,2
        ja badclose
        mov [title],ax
        mov ax,[hdr+8]
        mov [left],ax
looprec:
        cmp word [left],0
        je done
        mov bx,[fh]
        mov ah,3fh
        mov cx,6
        mov dx,rec
        int 21h
        cmp ax,6
        jne badclose
        mov ax,[rec+4]
        cmp ax,255
        ja badclose
        mov [textlen],ax
        call printrec
        cmp word [textlen],0
        je next
        mov bx,[fh]
        mov ah,3fh
        mov cx,[textlen]
        mov dx,text
        int 21h
        cmp ax,[textlen]
        jne badclose
        mov bx,1
        mov ah,40h
        mov cx,[textlen]
        mov dx,text
        int 21h
        mov dx,crlf
        call puts
next:   dec word [left]
        jmp looprec
done:   mov bx,[fh]
        mov ah,3eh
        int 21h
        mov dx,pass
        call puts
        mov ax,4c00h
        int 21h
badclose:
        mov bx,[fh]
        mov ah,3eh
        int 21h
bad:    mov dx,fail
        call puts
        mov ax,4c01h
        int 21h
usage:  mov dx,help
        call puts
        mov ax,4c01h
        int 21h

; Print a trace row.  Records are consumed in file order, preserving exact
; authored chronology for later picture/text/walk/combat dispatch.
printrec:
        mov dx,prefix
        call puts
        xor ax,ax
        mov al,[rec]
        call hexw
        mov dx,argtag
        call puts
        mov ax,[rec+2]
        call hexw
        mov dx,lentag
        call puts
        mov ax,[textlen]
        call hexw
        cmp word [textlen],0
        je .nl
        mov dx,spc
        call puts
.nl:    ret

hexw:   push ax
        mov al,ah
        call hexb
        pop ax
hexb:   push ax
        shr al,4
        call nib
        pop ax
        and al,15
nib:    cmp al,10
        jb .digit
        add al,'A'-10
        jmp .out
.digit: add al,'0'
.out:   mov [one],al
        mov bx,1
        mov ah,40h
        mov cx,1
        mov dx,one
        int 21h
        ret
puts:   push ax
        push bx
        push cx
        push dx
        mov si,dx
.n:    cmp byte [si],0
        je .w
        inc si
        jmp .n
.w:    mov cx,si
        sub cx,dx
        mov bx,1
        mov ah,40h
        int 21h
        pop dx
        pop cx
        pop bx
        pop ax
        ret
parse:  mov si,81h
.sp:    cmp byte [si],' '
        jne .copy
        inc si
        jmp .sp
.copy:  mov di,fname
.c:     mov al,[si]
        cmp al,0
        je .end
        cmp al,13
        je .end
        cmp al,' '
        je .end
        mov [di],al
        inc di
        inc si
        jmp .c
.end:   mov byte [di],0
        ret

help db 'CCDEMO manifest.gbd',13,10,0
fail db 'CCDEMO: invalid or truncated GBDM v1 manifest',13,10,0
pass db 'RESULT: CCDEMO manifest stream PASS',13,10,0
prefix db 'GBDM K=',0
argtag db ' A=',0
lentag db ' L=',0
spc db ' ',0
crlf db 13,10,0
fh dw 0
title dw 0
left dw 0
textlen dw 0
hdr times 10 db 0
rec times 6 db 0
text times 255 db 0
one db 0
fname times 128 db 0
        times 512 db 0
stacktop:
