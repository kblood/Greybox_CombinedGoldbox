; Coordinator file helpers. kc_fh/extent are preserved. All mutations are to
; absent tool copies or marker-owned restoration scratch after full admission.
kn_copy_file:
        mov [kf_dest], di
        mov [kf_source], dx
        call kf_save
        mov dx, [kf_dest]
        call kc_probe
        jc kf_fail
        test ax, ax
        jnz kf_fail
        mov word [kc_fh], 0ffffh
        mov dx, [kf_source]
        call kc_open
        jc kf_fail
        mov ax, [kc_fh]
        mov [kf_live], ax
        mov eax, [kc_extent]
        mov [kf_length], eax
        mov dx, [kf_dest]
        call kf_create
        jc kf_close_source_bad
        xor eax, eax
        mov edx, [kf_length]
        mov bx, [kf_out]
        mov byte [kc_mode], 0
        call kc_transfer
        jc kf_close_source_bad
        call kc_close
        jc kf_fail
        mov word [kf_live], 0ffffh
        call kf_close_out
        jc kf_fail
        call kf_restore
        clc
        ret
kf_close_source_bad:
        call kc_close
        jc kf_fail
        mov word [kf_live], 0ffffh
        jmp kf_fail

kn_restore_section:
        cmp word [kn_restore_authorized], 1
        jne kf_bad
        mov [kf_offset], eax
        mov [kf_length], edx
        mov [kf_dest], si
        call kf_admit_span
        jc kf_bad
        call kf_save
        ; Per-target extension prevents FX and IDN recovery names colliding.
        mov si, [kf_dest]
        mov di, kf_temp
        call kf_path
        jc kf_fail
        mov al, [kf_temp+bx+1]
        mov [kf_ext], al
        mov word [kf_temp+bx+1], 'GN'
        mov [kf_temp+bx+3], al
        mov si, [kf_dest]
        mov di, kf_backup
        call kf_path
        jc kf_fail
        mov word [kf_backup+bx+1], 'GO'
        mov al, [kf_ext]
        mov [kf_backup+bx+3], al
        ; Neither restoration sibling may alias any protected path table entry.
        mov si, kf_temp
        call kf_unprotected
        jc kf_fail
        mov si, kf_backup
        call kf_unprotected
        jc kf_fail
        ; The workspace marker authorizes these partial transient files only.
        mov dx, kf_backup
        call kc_probe
        jc kf_fail
        test ax, ax
        jz .temp
        mov dx, [kf_dest]
        call kc_probe
        jc kf_fail
        test ax, ax
        jnz .discard_backup
        push ds
        pop es
        mov dx, kf_backup
        mov di, [kf_dest]
        mov ah, 56h
        int 21h
        jc kf_fail
        jmp .temp
.discard_backup:
        mov dx, kf_backup
        call kf_delete
        jc kf_fail
.temp: mov dx, kf_temp
        call kf_delete
        jc kf_fail
        mov dx, kf_temp
        call kf_create
        jc kf_fail
        mov eax, [kf_offset]
        mov edx, [kf_length]
        mov bx, [kf_out]
        mov byte [kc_mode], 0
        call kc_transfer
        jc kf_fail
        call kf_close_out
        jc kf_fail
        ; Reopen closed candidate and compare every byte to the frozen section.
        mov dx, kf_temp
        mov ax, 3D00h
        int 21h
        jc kf_fail
        mov [kf_other], ax
        mov bx, ax
        mov eax, [kf_offset]
        mov edx, [kf_length]
        mov byte [kc_mode], 1
        call kc_transfer
        jc kf_fail
        call kf_close_other
        jc kf_fail
        mov dx, [kf_dest]
        call kc_probe
        jc kf_fail
        mov [kf_exists], ax
        mov word [kc_fh], 0ffffh
        mov word [kc_verified], 1
        mov si, kf_temp
        mov di, [kf_dest]
        cmp word [kf_exists], 0
        jne .replace
        call kc_publish
        jc kf_fail
        jmp .done
.replace:
        mov bp, kf_backup
        call kc_replace
        jc kf_fail
.done: call kf_restore
        ; Candidate was byte-checked before rename. Authority remains immutable
        ; across this transient restore; any retry can recreate the same bytes.
        mov dx, kf_backup
        call kf_delete
        jc kf_bad
        clc
        ret

kf_admit_span:
        mov ecx, [kr_offsets+16]
        add ecx, 16
        jc kf_bad
        cmp eax, ecx
        jne .whole_sections
        mov ecx, [kr_header+40]
        sub ecx, 16
        jc kf_bad
        cmp edx, ecx
        jne kf_bad
        mov si, kf_source_name         ; frozen GBID payload, owned alias only
        jmp .workspace
.whole_sections:
        xor bx, bx
.part: cmp eax, [kr_offsets+bx]
        jne .next
        cmp edx, [kr_header+24+bx]
        je .found
.next: add bx, 4
        cmp bx, 36
        jb .part
        jmp kf_bad
.found:
        mov [kf_part], bx
        mov di, [kf_dest]
        cmp bx, 8
        je .paused
        cmp bx, 12
        je .seed
        cmp bx, 28
        je .successor
        cmp bx, 16
        je .identity
        cmp bx, 32
        je .stream
        cmp bx, 0
        je .host
        cmp bx, 24
        je .outcome
        jmp kf_bad
.paused: mov si, kv_paths+4*112
        call kn_path_equal
        je .ok
        mov si, kf_input_name
        jmp .workspace
.seed: mov si, kv_paths+5*112
        call kn_path_equal
        je .ok
        mov si, kf_seed_name
        jmp .workspace
.successor:
        mov si, kv_paths+7*112
        call kn_path_equal
        jne kf_bad
        jmp .ok
.identity:
        mov si, kv_paths+4*112
        mov di, kf_check
        call kf_path
        jc kf_bad
        mov dword [kf_check+bx], '.IDN'
        mov si, kf_check
        mov di, [kf_dest]
        call kn_path_equal
        je .ok
        mov si, kv_paths+7*112
        mov di, kf_check
        call kf_path
        jc kf_bad
        mov dword [kf_check+bx], '.IDN'
        mov si, kf_check
        mov di, [kf_dest]
        call kn_path_equal
        je .ok
        mov si, kf_idn_name
        jmp .workspace
.stream:
        mov si,kv_paths+7*112
        cmp word [kr_header+20],3
        jne .stream_owner
        mov si,kv_paths+4*112
.stream_owner:
        mov di, kf_check
        call kf_path
        jc kf_bad
        mov dword [kf_check+bx], '.GBS'
        mov si, kf_check
        mov di, [kf_dest]
        call kn_path_equal
        jne kf_bad
        jmp .ok
.host: mov si, kf_host_name
        jmp .workspace
.outcome: mov si, kf_outcome_name
.workspace:
        push si
        mov si, kv_paths+9*112
        mov di, kf_check
        mov cx, 100
.directory:
        lodsb
        test al, al
        jz .separator
        stosb
        loop .directory
        pop si
        jmp kf_bad
.separator:
        cmp byte [di-1], '\'
        je .name
        mov al, '\'
        stosb
.name: pop si
        mov cx, 12
.append: lodsb
        stosb
        test al, al
        jz .match
        loop .append
        jmp kf_bad
.match: mov si, kf_check
        mov di, [kf_dest]
        call kn_path_equal
        jne kf_bad
.ok:   clc
        ret

kf_path:
        mov bp, di
        mov cx, 112
.copy: lodsb
        stosb
        test al, al
        jz .end
        loop .copy
        stc
        ret
.end:  mov bx, di
        sub bx, bp
        sub bx, 5
        jc kf_bad
        mov si, bp
        add si, bx
        cmp byte [si], '.'
        jne kf_bad
        clc
        ret
kf_unprotected:
        mov [kf_compare_path], si
        xor bx, bx
.next: mov si, [kf_compare_path]
        mov di, kv_paths
        add di, bx
        push bx
        call kn_path_equal
        pop bx
        je kf_bad
        add bx, 112
        cmp bx, 1120
        jb .next
        clc
        ret
kf_create:
        mov ah, 3Ch
        xor cx, cx
        int 21h
        jc kf_bad
        mov [kf_out], ax
        clc
        ret
kf_close_out:
        mov bx, [kf_out]
        mov ah, 3Eh
        int 21h
        jc kf_bad
        mov word [kf_out], 0ffffh
        clc
        ret
kf_close_other:
        mov bx, [kf_other]
        mov ah, 3Eh
        int 21h
        jc kf_bad
        mov word [kf_other], 0ffffh
        clc
        ret
kf_delete:
        mov ah, 41h
        int 21h
        jnc .ok
        cmp ax, 2
        jne kf_bad
.ok:   clc
        ret
kf_save:
        mov ax, [kc_fh]
        mov [kf_saved_fh], ax
        mov eax, [kc_extent]
        mov [kf_saved_extent], eax
        mov word [kf_out], 0ffffh
        mov word [kf_other], 0ffffh
        mov word [kf_live], 0ffffh
        ret
kf_restore:
        mov ax, [kf_saved_fh]
        mov [kc_fh], ax
        mov eax, [kf_saved_extent]
        mov [kc_extent], eax
        ret
kf_fail:
        call kf_teardown
        call kf_restore
        jmp kf_bad
kf_teardown:
        cmp word [kf_out], 0ffffh
        je .other
        call kf_close_out
.other: cmp word [kf_other], 0ffffh
        je .restore
        call kf_close_other
.restore:
        cmp word [kf_live], 0ffffh
        je .done
        mov bx, [kf_live]
        mov ah, 3Eh
        int 21h
        jc kf_bad
        mov word [kf_live], 0ffffh
.done: ret
kf_bad: stc
        ret

kf_source dw 0
kf_dest dw 0
kf_compare_path dw 0
kf_out dw 0ffffh
kf_other dw 0ffffh
kf_live dw 0ffffh
kf_saved_fh dw 0ffffh
kf_saved_extent dd 0
kf_offset dd 0
kf_length dd 0
kf_exists dw 0
kf_part dw 0
kf_ext db 0
kf_temp times 112 db 0
kf_backup times 112 db 0
kf_check times 112 db 0
kf_input_name db 'INPUT.EFX',0
kf_idn_name db 'INPUT.IDN',0
kf_seed_name db 'SEED.BIN',0
kf_outcome_name db 'A.OUT',0
kf_host_name db 'HOST.BIN',0
kf_source_name db 'SRC.GLB',0
