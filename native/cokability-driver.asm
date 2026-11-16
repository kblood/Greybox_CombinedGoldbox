; Test-only streaming DOS driver, not a production mutation protocol.
; INPUT: u16 cases; each mode:u8, item count:u32, effect count:u32,
; body[409], items[count*63], effects[count*9]. OUTPUT: rejected:u8, body[409].
        cpu 386
        bits 16
        org 100h
        jmp start
%include "cokability.inc"
start:
        cld
        push cs
        pop ds
        push cs
        pop es
        mov dx, input_name
        mov ax, 3D00h
        int 21h
        jc bad
        mov [input], ax
        mov dx, output_name
        xor cx, cx
        mov ah, 3Ch
        int 21h
        jc bad
        mov [output], ax
        mov dx, cases
        mov cx, 2
        call read
.case: cmp word [cases], 0
        je good
        mov dx, mode
        mov cx, 9
        call read
        mov dx, body
        mov cx, 409
        call read
        mov si, body
        mov al, [mode]
        call ca_begin
        setc byte [rejected]
.item: cmp dword [items], 0
        je .effect
        mov dx, record
        mov cx, 63
        call read
        cmp byte [rejected], 0
        jne .next_item
        mov si, record
        call ca_item
.next_item:
        dec dword [items]
        jmp .item
.effect:
        cmp dword [effects], 0
        je .finish
        mov dx, record
        mov cx, 9
        call read
        cmp byte [rejected], 0
        jne .next_effect
        mov si, record
        call ca_effect
.next_effect:
        dec dword [effects]
        jmp .effect
.finish:
        cmp byte [rejected], 0
        jne .write
        call ca_finish
.write: mov dx, rejected
        mov cx, 1
        call write
        mov dx, body
        mov cx, 409
        call write
        dec word [cases]
        jmp .case
read:   mov bx, [input]
        mov ah, 3Fh
        int 21h
        jc bad
        cmp ax, cx
        jne bad
        ret
write:  mov bx, [output]
        mov ah, 40h
        int 21h
        jc bad
        cmp ax, cx
        jne bad
        ret
good:   mov bx, [output]
        mov ah, 3Eh
        int 21h
        jc bad
        mov ax, 4C00h
        int 21h
bad:    mov ax, 4C01h
        int 21h
input_name db 'INPUT.BIN',0
output_name db 'OUTPUT.BIN',0
input dw 0
output dw 0
cases dw 0
mode db 0
items dd 0
effects dd 0
rejected db 0
body times 409 db 0
record times 63 db 0
