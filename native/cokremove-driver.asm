; Test-only disk-backed removal driver. No retail files are opened.
; INPUT.BIN: cases:u16; per case fault:u8,target:u8,items:u32,effects:u16,
; gboc_present:u8,gboc[40],gbef_rng:u32,
; body[409],definitions[2048],items[63*N],effects[9*M].
; The gboc/gbef_rng block (2026-09-09, GBOC v1 effect-7 authorization, see
; native/src/cokremove.inc) is read into cm_gboc/cm_gbef_rng before every
; case; gboc_present=0 sets cm_gboc to zero, reproducing every case's
; pre-existing behaviour exactly (kind 7 still rejects unconditionally).
; OUTPUT.BIN: rejected:u8,gbef_rng:u32 (the post-call cm_gbef_rng, unconditionally
; -- unchanged on rejection); on success body[409],slots[52],heads[8],
; working items[63*N],working effects[9*M]. FREES.BIN has kind:u8,index:u32
; notifications and a FFh/0 terminator per case. Scratch magic is GBIW.
        cpu 386
        bits 16
        org 100h
        jmp start
%include "cokstats.inc"
%include "cokability.inc"
%include "cokremove.inc"
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
        call create
        mov [output], ax
        mov dx, frees_name
        call create
        mov [frees], ax
        mov dx, cases
        mov cx, 2
        call read
.case: cmp word [cases], 0
        je good
        mov dx, fault
        mov cx, 8
        call read
        mov al, [target]
        mov [cm_target], al
        mov eax, [count]
        mov [cm_count], eax
        mov [left], eax
        mov ax, [fxcount]
        cmp ax, 256
        ja bad
        mov [cm_fxcount], ax
        mov dx, gboc_present
        mov cx, 45
        call read
        mov word [cm_gboc], 0
        cmp byte [gboc_present], 0
        je .no_gboc
        mov word [cm_gboc], gboc
.no_gboc:
        mov eax, [driver_gbef_rng]
        mov [cm_gbef_rng], eax
        mov dx, body
        mov cx, 409
        call read
        mov dx, definitions
        mov cx, 2048
        call read
        mov dx, work_name
        call create
        mov [work], ax
        mov bx, ax
        mov dx, work_header
        mov cx, 16
        call write
        mov dword [index], 0
.copy: cmp dword [left], 0
        je .effects
        mov dx, cm_record
        mov cx, 63
        call read
        mov eax, [index]
        inc eax
        mov [cm_record+42], eax
        cmp dword [left], 1
        jne .copy_write
        mov dword [cm_record+42], -1
.copy_write:
        mov bx, [work]
        mov dx, cm_record
        mov cx, 63
        call write
        inc dword [index]
        dec dword [left]
        jmp .copy
.effects:
        mov dx, effect_records
        imul cx, [fxcount], 9
        call read
        mov word [cm_body], body
        mov word [cm_table], definitions
        mov word [cm_effects], effect_records
        mov dword [cm_head], -1
        cmp dword [count], 0
        je .run
        mov dword [cm_head], 0
.run:  call cm_destroy
        setc byte [rejected]
        mov bx, [output]
        mov dx, rejected
        mov cx, 1
        call write
        mov eax, [cm_gbef_rng]
        mov [driver_gbef_rng], eax
        mov dx, driver_gbef_rng
        mov cx, 4
        call write
        cmp byte [rejected], 0
        jne .end_case
        mov bx, [output]
        mov dx, body
        mov cx, 409
        call write
        mov dx, cs_slots
        mov cx, 52
        call write
        mov dx, cm_head
        mov cx, 8
        call write
        mov eax, [count]
        mov [left], eax
        mov dword [index], 0
        mov byte [fault], 0
.output_item:
        cmp dword [left], 0
        je .output_effect
        mov eax, [index]
        call cm_read
        jc bad
        mov bx, [output]
        mov dx, cm_record
        mov cx, 63
        call write
        inc dword [index]
        dec dword [left]
        jmp .output_item
.output_effect:
        mov bx, [output]
        mov dx, effect_records
        imul cx, [fxcount], 9
        call write
.end_case:
        mov al, 0FFh
        xor edx, edx
        call cm_notify
        mov bx, [work]
        mov ah, 3Eh
        int 21h
        jc bad
        dec word [cases]
        jmp .case

create: xor cx, cx
        mov ah, 3Ch
        int 21h
        jc bad
        ret
read:   mov bx, [input]
        mov ah, 3Fh
        int 21h
        jc bad
        cmp ax, cx
        jne bad
        ret
write:  mov ah, 40h
        int 21h
        jc bad
        cmp ax, cx
        jne bad
        ret
cm_seek:
        mov ecx, 63
        mul ecx
        test edx, edx
        jnz .bad
        add eax, 16
        jc .bad
        mov edx, eax
        shr eax, 16
        mov cx, ax
        mov bx, [work]
        mov ax, 4200h
        int 21h
        ret
.bad:  stc
        ret
cm_read:
        call cm_seek
        jc .done
        cmp byte [fault], 1
        jne .read
        mov bx, 0FFFFh
.read: mov dx, cm_record
        mov cx, 63
        mov ah, 3Fh
        int 21h
        jc .done
        cmp ax, 63
        je .ok
        stc
        ret
.ok:   clc
.done: ret
cm_write:
        call cm_seek
        jc .done
        cmp byte [fault], 2
        jne .write
        mov bx, 0FFFFh
.write:
        mov dx, cm_record
        mov cx, 63
        mov ah, 40h
        int 21h
        jc .done
        cmp ax, 63
        je .ok
        stc
        ret
.ok:   clc
.done: ret
cm_notify:
        mov [event], al
        mov [event+1], edx
        mov bx, [frees]
        mov dx, event
        mov cx, 5
        call write
        ret
good:  mov bx, [output]
        mov ah, 3Eh
        int 21h
        jc bad
        mov bx, [frees]
        mov ah, 3Eh
        int 21h
        jc bad
        mov ax, 4C00h
        int 21h
bad:   mov ax, 4C01h
        int 21h
input_name db 'INPUT.BIN',0
output_name db 'OUTPUT.BIN',0
work_name db 'WORK.BIN',0
frees_name db 'FREES.BIN',0
work_header db 'GBIW',1,0,0,0,0,0,0,0,0,0,0,0
input dw 0
output dw 0
work dw 0
frees dw 0
cases dw 0
fault db 0
target db 0
count dd 0
fxcount dw 0
gboc_present db 0
gboc times 40 db 0
driver_gbef_rng dd 0
left dd 0
index dd 0
rejected db 0
event times 5 db 0
body times 409 db 0
definitions times 2048 db 0
effect_records times 256*9 db 0
