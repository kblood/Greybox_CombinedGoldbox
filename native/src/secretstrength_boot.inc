; Ephemeral Secret metric from current admitted owned P1, never saved context.
secret_strength_refresh:
        mov byte [secret_strength_valid], 0
        cmp byte [secret_profile], 1
        jne .ok
        cmp byte [seed_strength_valid], 0
        jne .ok                   ; Saved explicit /Z needs no derived query.
        cmp byte [secret_party], 1
        jne .ok                   ; No loose actors or fixture-count inference.
        cmp byte [seed_count_valid], 1
        jne .bad
        mov dx, rosterpath
        mov ax, 3D00h
        int 21h
        jc .bad
        mov [secret_strength_fh], ax
        mov bx, ax
        mov dx, secret_strength_header
        mov cx, 16
        mov ah, 3Fh
        int 21h
        jc .close_bad
        cmp ax, 16
        jne .close_bad
        cmp dword [secret_strength_header], 'GBPR'
        jne .close_bad
        cmp word [secret_strength_header+4], 3
        jne .close_bad
        cmp word [secret_strength_header+8], 440
        jne .close_bad
        cmp word [secret_strength_header+10], 2
        jne .close_bad
        cmp dword [secret_strength_header+12], 00010004h
        jne .close_bad
        mov ax, [secret_strength_header+6]
        cmp ax, [seed_count]
        jne .close_bad
        cmp ax, 1
        jb .close_bad
        cmp ax, 6
        ja .close_bad
        mov [secret_strength_count], ax
        mov bx, [secret_strength_fh]
        xor cx, cx
        xor dx, dx
        mov ax, 4202h
        int 21h
        jc .close_bad
        or dx, dx
        jnz .close_bad
        cmp ax, 16
        jb .close_bad
        cmp ax, 32768
        ja .close_bad
        mov [secret_strength_extent], ax
        mov bx, [secret_strength_fh]
        mov ah, 3Eh
        int 21h
        jc .bad
        mov di, secret_strength_reply
        mov si, secret_strength_reply_name
        call compose_tool_path
        mov dx, secret_strength_reply
        mov ah, 41h
        int 21h
        jnc .cleared
        cmp ax, 2
        jne .bad
.cleared:
        call tail_begin
        mov si, secret_strength_option
        call tail_append_str
        mov si, rosterpath
        call tail_append_str
        call tail_append_space
        mov si, secret_strength_reply
        call tail_append_toolpath
        call tail_finish
        mov word [runpathp], child_party
        call do_exec_checked
        jc .bad
        mov dx, secret_strength_reply
        mov ax, 3D00h
        int 21h
        jc .bad
        mov [secret_strength_fh], ax
        mov bx, ax
        xor cx, cx
        xor dx, dx
        mov ax, 4202h
        int 21h
        jc .close_bad
        or dx, dx
        jnz .close_bad
        cmp ax, 16
        jne .close_bad
        mov bx, [secret_strength_fh]
        xor cx, cx
        xor dx, dx
        mov ax, 4200h
        int 21h
        jc .close_bad
        mov bx, [secret_strength_fh]
        mov dx, secret_strength_header
        mov cx, 16               ; Exact closed extent was checked separately.
        mov ah, 3Fh
        int 21h
        jc .close_bad
        cmp ax, 16
        jne .close_bad
        mov bx, [secret_strength_fh]
        mov ah, 3Eh
        int 21h
        jc .bad
        cmp dword [secret_strength_header], 'GBSM'
        jne .bad
        cmp dword [secret_strength_header+4], 00100001h
        jne .bad
        cmp word [secret_strength_header+8], 255
        ja .bad
        mov ax, [secret_strength_header+10]
        cmp ax, [secret_strength_count]
        jne .bad
        mov ax, [secret_strength_header+12]
        cmp ax, [secret_strength_extent]
        jne .bad
        cmp word [secret_strength_header+14], 0
        jne .bad
        mov ax, [secret_strength_header+8]
        mov [secret_strength_value], ax
        mov byte [secret_strength_valid], 1
.ok:    clc
        ret
.close_bad:
        mov bx, [secret_strength_fh]
        mov ah, 3Eh
        int 21h
.bad:   stc
        ret

secret_strength_valid db 0
secret_strength_value dw 0
secret_strength_count dw 0
secret_strength_extent dw 0
secret_strength_fh dw 0FFFFh
secret_strength_header times 17 db 0
secret_strength_reply times 112 db 0
secret_strength_reply_name db '_GBSTAT.GSM',0
secret_strength_option db ' /V ',0
