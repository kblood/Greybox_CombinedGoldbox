; Test-only DOS streaming driver for cokstats.inc; not a production protocol.
; INPUT.BIN: u16 cases; each u32 item count, body[409], table[2048],
; followed by {u32 stable index, item[63]} records.
; OUTPUT.BIN: per case {u8 rejected, body[409], slots[13*u32], u16 equipped}.
; Rejected cases return zero payload. No original game files are accessed.
        cpu 386
        bits 16
        org 100h
        jmp start
%include "cokstats.inc"
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
.case:
        cmp word [cases], 0
        je good
        mov dx, remaining
        mov cx, 4
        call read
        mov dx, body
        mov cx, 409
        call read
        mov dx, table
        mov cx, 2048
        call read
        mov byte [rejected], 0
        mov si, body
        mov di, table
        call cs_begin
        jnc .item
        mov byte [rejected], 1
.item:
        cmp dword [remaining], 0
        je .finish
        mov dx, index
        mov cx, 4
        call read
        mov dx, record
        mov cx, 63
        call read
        cmp byte [rejected], 0
        jne .next_item
        mov eax, [index]
        mov si, record
        call cs_item
        jnc .next_item
        mov byte [rejected], 1
.next_item:
        dec dword [remaining]
        jmp .item
.finish:
        cmp byte [rejected], 0
        jne .zero
        call cs_finish
        jnc .write
        mov byte [rejected], 1
.zero:
        mov di, body
        xor ax, ax
        mov cx, 409
        rep stosb
        mov di, cs_slots
        mov cx, 26
        rep stosw
        mov word [cs_equipped_weight], 0
.write:
        mov dx, rejected
        mov cx, 1
        call write
        mov dx, body
        mov cx, 409
        call write
        mov dx, cs_slots
        mov cx, 52
        call write
        mov dx, cs_equipped_weight
        mov cx, 2
        call write
        dec word [cases]
        jmp .case
read:
        mov bx, [input]
        mov ah, 3Fh
        int 21h
        jc bad
        cmp ax, cx
        jne bad
        ret
write:
        mov bx, [output]
        mov ah, 40h
        int 21h
        jc bad
        cmp ax, cx
        jne bad
        ret
good:
        mov bx, [output]
        mov ah, 3Eh
        int 21h
        jc bad
        mov ax, 4C00h
        int 21h
bad:
        mov ax, 4C01h
        int 21h
input_name db 'INPUT.BIN',0
output_name db 'OUTPUT.BIN',0
input dw 0
output dw 0
cases dw 0
remaining dd 0
index dd 0
rejected db 0
body times 409 db 0
table times 2048 db 0
record times 63 db 0
