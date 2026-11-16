; Checked CoK inventory yield. No mutation is activated by this module.
; GBIY sidecar (72 bytes), replacing the effect filename extension with .YLD:
; magic[4],version:u16=2,len:u16=72,failurePC,successorPC,target,area,
; GBMC[32] (original inventory CRC/length initially zero), GBEF CRC32:u32.
; Then step/chain/repeat/damage-watermark:u16, loaded-block CRC32:u32,
; reserved:u32=0, and CRC32 of the preceding 68 sidecar bytes.
; The GBMC frame is PRE-operand state. Successful continuation must consume the
; checked operand once before advancing; preparation restores stateful reads.
; The output must be fresh: DOS create-new never truncates an existing file.
; Uses compbuf after VM exit and profilepath after dialect detection.

iy_prepare:
        mov byte [iy_valid], 0
        cmp byte [is_cok], 0
        je .ok
        mov si, [opp]
        mov ax, si
        add ax, 2
        jc .bad
        cmp ax, [blklen]
        ja .bad
        mov dl, [blk+si]
        cmp dl, 1
        je .three
        cmp dl, 2
        je .three
        cmp dl, 3
        je .three
        cmp dl, 81h
        je .three
        cmp dl, 80h
        jne .bounds
        movzx dx, byte [blk+si+1]
        add ax, dx
        jc .bad
        jmp .bounds
.three:
        inc ax
.bounds:
        cmp ax, [blklen]
        ja .bad
        mov [iy_successor], ax
        call read_opp
        ; 7D00h's selected-status accessor consumes selected_not_found.
        ; Resolve the target speculatively, keeping the failure state intact.
        mov al, [selected_not_found]
        push ax
        call opp_rvalue
        and ax, 00FFh
        mov [iy_target], ax
        pop ax
        mov [selected_not_found], al
        mov byte [iy_valid], 1
.ok:   clc
        ret
.bad:  stc
        ret

iy_write:
        cmp byte [iy_valid], 0
        je .ok
        cmp word [halt_reason], HALT_INVENTORY
        jne .bad
        ; fxhdr aliases compbuf since f7bf0402: CRC the serialized GBEF
        ; before the frame below overwrites its first 72 bytes.
        mov si, fxhdr
        mov cx, FXLEN
        call iy_crc
        push eax
        ; Construct the frame in dead decompression scratch.
        mov di, compbuf
        xor ax, ax
        mov cx, 36
        rep stosw
        mov dword [compbuf], 'GBIY'
        mov dword [compbuf+4], 00480002h
        mov ax, [halt_pc]
        mov [compbuf+8], ax
        mov ax, [iy_successor]
        mov [compbuf+10], ax
        mov ax, [iy_target]
        mov [compbuf+12], ax
        mov ax, [halt_area]
        mov [compbuf+14], ax
        mov dword [compbuf+16], 'GBMC'
        mov dword [compbuf+20], 00200001h
        mov ax, [cmp_l]
        mov [compbuf+24], ax
        mov ax, [cmp_r]
        mov [compbuf+26], ax
        mov si, flag_eq
        mov di, compbuf+28
        mov cx, 6
        rep movsb
        mov al, [selected_valid]
        mov [compbuf+34], al
        mov al, [selected_not_found]
        mov [compbuf+35], al
        mov ax, [selected_party]
        mov [compbuf+36], ax
        mov ax, [blklen]
        mov [compbuf+38], ax
        pop eax
        mov [compbuf+48], eax
        mov ax, [stepc]
        mov [compbuf+52], ax
        mov ax, [chain_count]
        mov [compbuf+54], ax
        mov ax, [bridge_repeat_count]
        mov [compbuf+56], ax
        mov si, blk
        mov cx, [blklen]
        call iy_crc
        mov [compbuf+60], eax
        mov si, compbuf
        mov cx, 68
        call iy_crc
        mov [compbuf+68], eax
        mov si, efxname
        cmp byte [si], 0
        jne .name
        mov si, s_efxname
.name: mov bp, si
        mov di, profilepath
        xor bx, bx
        mov cx, 124
.copy:
        lodsb
        stosb
        test al, al
        jz .extension
        cmp al, '.'
        jne .slash
        mov bx, di
        dec bx
.slash:
        cmp al, 5Ch
        je .component
        cmp al, '/'
        jne .next
.component:
        xor bx, bx
.next: loop .copy
        jmp .bad
.extension:
        dec di
        test bx, bx
        jz .append
        mov di, bx
.append:
        mov dword [di], '.YLD'
        mov byte [di+4], 0
        ; A .YLD effect output would alias the companion. Reject it.
        mov si, bp
        mov di, profilepath
.alias:
        lodsb
        mov ah, [di]
        inc di
        and ax, 0DFDFh
        cmp al, ah
        jne .create
        test al, al
        jnz .alias
        jmp .bad
.create:
        mov dx, profilepath
        xor cx, cx
        mov ah, 5Bh
        int 21h
        jc .bad
        mov [efxfh], ax
        mov bx, ax
        mov dx, compbuf
        mov cx, 72
        mov ah, 40h
        int 21h
        jc .close_bad
        cmp ax, 72
        jne .close_bad
        mov bx, [efxfh]
        mov ah, 3Eh
        int 21h
        jc .remove_bad
.ok:   clc
        ret
.close_bad:
        mov bx, [efxfh]
        mov ah, 3Eh
        int 21h
.remove_bad:
        mov dx, profilepath
        mov ah, 41h
        int 21h
.bad:  stc
        ret

; SI/CX nonempty bytes -> EAX CRC32, clobbers BX/CX/SI.
iy_crc:
        mov eax, -1
.byte: xor al, [si]
        inc si
        mov bl, 8
.bit:  shr eax, 1
        jnc .next
        xor eax, 0EDB88320h
.next: dec bl
        jnz .bit
        loop .byte
        not eax
        ret

iy_valid db 0
iy_successor dw 0
iy_target dw 0
