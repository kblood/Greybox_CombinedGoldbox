; /J opts a CoK combat handoff into the shared ECL/rest RNG stream.
; It requires /E or an effect-file /F run and a binary /R result destination.
scan_cok_rng_arg:
        mov si, 81h
.scan: lodsb
        test al, al
        jz .done
        cmp al, 13
        je .done
        cmp al, '/'
        jne .scan
        mov al, [si]
        and al, 0DFh
        cmp al, 'J'
        jne .scan
        mov al, [si+1]
        cmp al, ' '
        je .found
        cmp al, 13
        je .found
        test al, al
        jnz .scan
.found: mov byte [cok_rng_mode], 1
.done: cmp byte [cok_rng_mode], 0
        je .ok
        cmp byte [resultname], 0
        je .bad
        cmp byte [emode], 0
        jne .ok
        cmp byte [fmode], 0
        je .bad
        cmp byte [vfxmode], 0
        je .bad
.ok:   clc
        ret
.bad:  stc
        ret

; File remains open after the stable 116-byte encounter prefix.
read_cok_rng:
        cmp byte [cok_rng_mode], 0
        je .ok
        cmp word [fxbuf+4], 9
        jne .bad
        mov bx, [infh]
        mov ah, 3Fh
        mov cx, 14
        mov dx, cok_rng_resume
        int 21h
        jc .bad
        cmp ax, 14
        jne .bad
        cmp dword [cok_rng_resume], 'GBRS'
        jne .bad
        cmp word [cok_rng_resume+4], 1
        jne .bad
.ok:   clc
        ret
.bad:  stc
        ret

cok_combat_die:
        movzx ecx, al                  ; original CoK dice sides are a byte
        mov eax, [rng_state]
        call cr_bounded                ; even d0/d1 consume a draw
        mov [rng_state], eax
        mov ax, dx
        inc ax
        ret

%include "cokrng.inc"

cok_rng_mode db 0
cok_rng_resume times 14 db 0
