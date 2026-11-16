; Select explicit Secret import only when an owned roster or any source SAV
; is present. A present foreign/corrupt file goes to CCPARTY for rejection.
secret_boot_party:
        mov byte [secret_party], 0
        ; A transaction may have renamed P to its backup before interruption.
        ; Recover its stored request before a missing-P import decision.
        mov si, rosterpath
        mov di, secret_boot_journal
        mov cx, 112
.journal_path:
        lodsb
        stosb
        or al, al
        jz .journal_suffix
        loop .journal_path
        jmp .fail
.journal_suffix:
        cmp cx, 108
        ja .fail
        sub di, 5
        cmp byte [di], '.'
        jne .fail
        mov dword [di], '.GSJ'
        mov [secret_boot_suffix], di
        mov byte [di+3], 'C'
        mov dx, secret_boot_journal
        call secret_boot_exists
        jc .fail
        jz .journal_probe
        mov si, s_arg_host_secret_complete
        call secret_boot_host
        jc .fail
.journal_probe:
        mov di, [secret_boot_suffix]
        mov byte [di+3], 'J'
        mov dx, secret_boot_journal
        call secret_boot_exists
        jc .fail
        jz .no_journal
        mov si, s_arg_host_secret_state
        call secret_boot_host
        jc .fail
.no_journal:
        mov si, secret_boot_journal
.journal_end:
        lodsb
        or al, al
        jnz .journal_end
        mov byte [si-2], 'B'
        mov dx, secret_boot_journal
        call secret_boot_exists
        jc .fail
        jnz .fail
        mov dx, rosterpath
        call secret_boot_exists
        jc .fail
        jnz .selected
        mov byte [s_secret_sav+7], '1'
.probe:
        mov dx, s_secret_sav
        call secret_boot_exists
        jc .fail
        jnz .selected
        inc byte [s_secret_sav+7]
        cmp byte [s_secret_sav+7], '6'
        jbe .probe
.ok:
        clc
        ret
.selected:
        cmp byte [party_create_count], 0
        jne .fail
        mov byte [secret_party], 1
        call tail_begin
        mov si, s_arg_secret_party
        call tail_append_str
        call tail_append_space
        mov si, rosterpath
        call tail_append_str
        call tail_finish
        mov word [runpathp], child_party
        call do_exec_checked
        ret
.fail:
        stc
        ret

; CF means an access/IO error; ZF means true file-not-found, nothing else.
secret_boot_exists:
        mov ax, 3D00h
        int 21h
        jnc .present
        cmp ax, 2
        jne .bad
        xor ax, ax
        ret
.present:
        mov bx, ax
        mov ah, 3Eh
        int 21h
        jc .bad
        mov ax, 1
        or ax, ax
        ret
.bad:
        stc
        ret

secret_boot_journal times 112 db 0
s_arg_host_secret_state db ' /S ',0
s_arg_host_secret_complete db ' /C ',0
s_arg_host_secret_prepare db ' /P ',0
secret_boot_suffix dw 0

; SI explicit typed host option. Never regenerate a pending request.
secret_boot_host:
        push si
        mov di, titlepath
        mov si, s_host_result
        call compose_tool_path
        call tail_begin
        pop si
        call tail_append_str
        mov si, titlepath
        call tail_append_toolpath
        call tail_append_space
        mov si, rosterpath
        call tail_append_str
        call tail_finish
        mov word [runpathp], child_host
        jmp do_exec_checked

secret_boot_prepare:
        cmp byte [secret_party], 1
        jne .ok
        call secret_next_host_paths
        jc .bad
        call write_host_result_state
        jc .bad
        jmp secret_next_prepare
.ok:
        clc
        ret
.bad:
        stc
        ret

; Producer validates the complete typed image. Re-run its read-only load on
; cold continuation before accepting the count; never feed v3 to v2 readers.
secret_boot_count:
        call secret_boot_party
        jc .bad
        cmp byte [secret_party], 0
        je .ok
        mov dx, rosterpath
        mov ax, 3D00h
        int 21h
        jc .bad
        mov [auto_fh], ax
        mov bx, ax
        mov dx, rosterhdr
        mov cx, 16
        mov ah, 3Fh
        int 21h
        pushf
        push ax
        mov bx, [auto_fh]
        mov ah, 3Eh
        int 21h
        pop ax
        popf
        jc .bad
        cmp ax, 16
        jne .bad
        cmp dword [rosterhdr], 'GBPR'
        jne .bad
        cmp word [rosterhdr+4], 3
        jne .bad
        cmp word [rosterhdr+8], 440
        jne .bad
        cmp word [rosterhdr+10], 2
        jne .bad
        cmp dword [rosterhdr+12], 00010004h
        jne .bad
        mov ax, [rosterhdr+6]
        cmp ax, 1
        jb .bad
        cmp ax, 6
        ja .bad
        cmp byte [seed_count_explicit], 0
        je .count
        cmp ax, [seed_count]
        jne .bad
.count:
        mov [seed_count], ax
        mov byte [seed_count_valid], 1
.ok:
        clc
        ret
.bad:
        stc
        ret
