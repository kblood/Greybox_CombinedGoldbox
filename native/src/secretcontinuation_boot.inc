; Secret CCNEXT coordinator interface. READY is a typed closed response;
; a successful EXEC alone never authorizes effect dispatch.
secret_next_recover:
        mov byte [secret_next_ready], 0
        cmp byte [secret_profile], 1
        jne .none
        call secret_next_context
        jc .bad
        mov di, sn_probe
        mov eax, '.GSK'
        call sn_roster_sibling
        jc .bad
        mov dx, sn_probe
        call secret_boot_exists
        jc .bad
        jnz .recover
        mov di, sn_probe
        mov eax, '.GKB'
        call sn_roster_sibling
        jc .bad
        mov dx, sn_probe
        call secret_boot_exists
        jc .bad
        jnz .recover
        mov di, sn_probe
        mov eax, '.GKT'
        call sn_roster_sibling
        jc .bad
        mov dx, sn_probe
        call secret_boot_exists
        jc .bad
        jz .none
.recover:
        mov si, sn_arg_recover
        call secret_next_call
        jc .bad
        ret
.none: clc
        ret
.bad: stc
        ret

secret_next_complete:
        mov byte [secret_next_ready], 0
        call secret_next_context
        jc .bad
        mov si, sn_arg_complete
        call secret_next_call
        jc .bad
        cmp byte [secret_next_ready], 1
        jne .bad                      ; completed combat must have authority
        clc
        ret
.bad: stc
        ret

secret_next_menu:
        mov si, sn_arg_menu
        jmp secret_next_cursor
secret_next_empty:
        mov si, sn_arg_empty
secret_next_cursor:
        push si
        mov byte [secret_next_ready], 0
        call secret_next_context
        pop si
        jc sn_bad
        jmp secret_next_call

; Canonical expected source/roster/seed, and owned response path.
secret_next_context:
        mov si, [eclp]
        test si, si
        jz sn_bad
        mov di, sn_descriptor+64
        call sn_canonical
        jc sn_bad
        mov si, rosterpath
        mov di, sn_descriptor+64+112
        call sn_canonical
        jc sn_bad
        mov si, seedpath
        mov di, sn_descriptor+64+5*112
        call sn_canonical
        jc sn_bad
        mov di, sn_response_path
        mov si, sn_response_name
        call compose_tool_path
        mov si, sn_response_path
        mov di, sn_temp
        call sn_canonical
        jc sn_bad
        mov si, sn_temp
        mov di, sn_response_path
        mov cx, 56
        rep movsw
        clc
        ret

; SI=/R or /C. Exit 0 absent, 2 READY, all others reject.
secret_next_call:
        push si
        call tail_begin
        pop si
        call tail_append_str
        mov si, sn_descriptor+64+112
        call tail_append_str
        call tail_append_space
        mov si, sn_descriptor+64
        call tail_append_str
        call tail_append_space
        mov si, sn_response_path
        call tail_append_str
        call tail_finish
        call sn_exec
        jc sn_bad
        test al, al
        jz .absent
        cmp al, 2
        jne sn_bad
        call sn_read_response
        jc sn_bad
        mov byte [secret_next_ready], 1
        clc
        ret
.absent: clc
        ret

sn_exec:
        mov di, titlepath
        mov si, sn_child
        call compose_tool_path
        mov word [runpathp], titlepath
        call do_exec
        jc sn_bad
        mov ah, 4Dh
        int 21h
        test ah, ah                    ; reject TSR/abnormal termination
        jnz sn_bad
        clc
        ret

sn_read_response:
        mov dx, sn_response_path
        mov ax, 3D00h
        int 21h
        jc sn_bad
        mov [sn_fh], ax
        mov bx, ax
        mov dx, sn_response
        mov cx, 392
        mov ah, 3Fh
        int 21h
        jc .close_bad
        cmp ax, 392
        jne .close_bad
        mov bx, [sn_fh]
        mov dx, sn_temp
        mov cx, 1
        mov ah, 3Fh
        int 21h
        jc .close_bad
        test ax, ax
        jnz .close_bad
        call sn_close
        jc sn_bad
        cmp dword [sn_response], 'GBNR'
        jne sn_bad
        cmp dword [sn_response+4], 00180003h
        jne sn_bad
        cmp word [sn_response+8], 255
        ja sn_bad
        mov ax, [sn_response+10]
        cmp ax, 1
        jb sn_bad
        cmp ax, 6
        ja sn_bad
        cmp byte [seed_count_explicit], 0
        je .count_ok
        cmp ax, [seed_count]
        jne sn_bad
.count_ok:
        cmp word [sn_response+12], 1
        ja sn_bad
        cmp word [sn_response+14], 1
        jne sn_bad
        cmp word [sn_response+16], 4
        jne sn_bad
        cmp word [sn_response+18], 0
        jne sn_bad
        cmp dword [sn_response+20], 0
        jne sn_bad
        mov si, sn_response+24
        mov di, sn_descriptor+64
        mov cx, 112
        repe cmpsb
        jne sn_bad
        mov si, sn_response+248
        mov di, sn_descriptor+64+5*112
        mov cx, 112
        repe cmpsb
        jne sn_bad
        mov si, eventpath
        mov di, sn_temp
        call sn_canonical
        jc sn_bad
        mov si, sn_response+136
        mov di, sn_temp
        mov cx, 112
        repe cmpsb
        je .effect_ok
        mov si, resumepath
        mov di, sn_temp
        call sn_canonical
        jc sn_bad
        mov si, sn_response+136
        mov di, sn_temp
        mov cx, 112
        repe cmpsb
        je .effect_ok
        mov si, effectpath
        mov di, sn_temp
        call sn_canonical
        jc sn_bad
        mov si, sn_response+136
        mov di, sn_temp
        mov cx, 112
        repe cmpsb
        jne sn_bad
.effect_ok:
        mov si, sn_response+360
        mov ax, [sn_response+12]
        call scx_validate
        jc sn_bad
        call sn_apply_context
        mov ax, [sn_response+8]
        mov [eclid], ax
        mov ax, [sn_response+10]
        mov [seed_count], ax
        mov byte [seed_count_valid], 1
        mov ax, [sn_response+12]
        mov [interactive_menu], al
        mov byte [secret_profile], 1
        mov byte [secret_party], 1
        mov byte [seed_sidecar_valid], 1
        mov word [eclp], sn_response+24
        mov word [effectreadp], sn_response+136
        mov word [effectwritep], sn_response+136
        clc
        ret
.close_bad:
        call sn_close
        jmp sn_bad

sn_close:
        mov bx, [sn_fh]
        mov ah, 3Eh
        int 21h
        jc sn_bad
        mov word [sn_fh], 0ffffh
        clc
        ret

; DOS TRUENAME, bounded path and zero padding for exact typed comparisons.
sn_canonical:
        push di
        push si
        mov di, sn_canon
        mov cx, 64
        xor ax, ax
        rep stosw
        pop si
        mov di, sn_canon
        mov ax, 6000h
        int 21h
        pop di
        jc sn_bad
        push di
        mov si, sn_canon
        mov cx, 112
.end:
        lodsb
        test al, al
        jz .bounded
        loop .end
        pop di
        jmp sn_bad
.bounded:
        pop di
        push di
        mov cx, 56
        xor ax, ax
        rep stosw
        pop di
        mov si, sn_canon
        mov cx, 56
        rep movsw
        clc
        ret

; EAX extension, DI destination; canonical expected roster owns sibling stem.
sn_roster_sibling:
        push eax
        push di
        mov si, sn_descriptor+64+112
        mov cx, 56
        rep movsw
        pop di
        mov cx, 112
.end_scan:
        cmp byte [di], 0
        jz .end
        inc di
        loop .end_scan
        pop eax
        jmp sn_bad
.end:
        sub di, 4
        pop eax
        cmp byte [di], '.'
        jne sn_bad
        mov [di], eax
        clc
        ret

; GBHR and GSK must bind identical canonical path encodings.
secret_next_host_paths:
        mov si, rosterpath
        mov di, rosterpath
        call sn_canonical
        jc sn_bad
        mov si, combatresultpath
        mov di, combatresultpath
        call sn_canonical
        jc sn_bad
        mov si, [effectreadp]
        mov di, si
        jmp sn_canonical

; Called after typed GBHR is closed. PREPARED publication precedes combat.
secret_next_prepare:
        mov byte [sn_initial_prepare],0
        jmp sn_prepare_common
secret_next_initial_prepare:
        mov byte [sn_initial_prepare],1
sn_prepare_common:
        call secret_next_context
        jc sn_bad
        mov di, sn_descriptor
        xor ax, ax
        mov cx, 32
        rep stosw
        mov dword [sn_descriptor], 'GSK3'
        mov word [sn_descriptor+4], 3
        mov word [sn_descriptor+8], 4
        mov word [sn_descriptor+10], 1
        mov ax, [seed_count]
        mov [sn_descriptor+12], ax
        mov ax, [eclid]
        mov [sn_descriptor+14], ax
        mov word [sn_descriptor+16], 64
        cmp byte [sn_initial_prepare],0
        je .descriptor_mode
        mov word [sn_descriptor+20],3
.descriptor_mode:
        movzx ax, byte [interactive_menu]
        mov [sn_descriptor+18], ax
        call sn_capture_context
        jc sn_bad
        mov si, titlepath               ; write_host_result_state's request
        mov di, sn_descriptor+64+2*112
        call sn_canonical
        jc sn_bad
        mov si, combatresultpath
        mov di, sn_descriptor+64+3*112
        call sn_canonical
        jc sn_bad
        mov si, [effectreadp]
        mov di, sn_descriptor+64+4*112
        call sn_canonical
        jc sn_bad
        mov si, outcomepath
        mov di, sn_descriptor+64+6*112
        call sn_canonical
        jc sn_bad
        mov si, resumepath
        mov di, sn_descriptor+64+7*112
        call sn_canonical
        jc sn_bad
        mov si, sn_descriptor+64+4*112
        mov di, sn_descriptor+64+7*112
        mov cx, 112
        repe cmpsb
        jne .successor
        mov si, eventpath
        mov di, sn_descriptor+64+7*112
        call sn_canonical
        jc sn_bad
.successor:
        mov di, sn_descriptor+64+8*112
        mov eax, '.GSK'
        call sn_roster_sibling
        jc sn_bad
        mov di, sn_descriptor+64+9*112
        mov eax, '.GKW'
        call sn_roster_sibling
        jc sn_bad
        mov di, sn_descriptor_path
        mov si, sn_descriptor_name
        call compose_tool_path
        mov dx, sn_descriptor_path
        xor cx, cx
        mov ah, 3Ch
        int 21h
        jc sn_bad
        mov [sn_fh], ax
        mov bx, ax
        mov dx, sn_descriptor
        mov cx, 1216
        mov ah, 40h
        int 21h
        jc .close_bad
        cmp ax, 1216
        jne .close_bad
        call sn_close
        jc sn_bad
        call tail_begin
        mov si, sn_arg_prepare
        call tail_append_str
        mov si, sn_descriptor_path
        call tail_append_toolpath
        call tail_finish
        call sn_exec
        jc sn_bad
        test al, al
        jnz sn_bad
        clc
        ret
.close_bad:
        call sn_close
; Capture the effective scalar arguments before PREPARED publication. The
; host's full answer is distinct from the byte-normalized CCECL menu seed.
sn_capture_context:
        push ds
        pop es
        mov di, sn_descriptor+1184
        xor ax, ax
        mov cx, 16
        rep stosw
        mov dword [sn_descriptor+1184], 'GBCX'
        mov dword [sn_descriptor+1188], 00200001h
        movzx ax, byte [interactive_menu]
        mov [sn_descriptor+1208], ax
        mov word [sn_context_index], 0
.field:
        mov ax, [sn_context_index]
        mov bx, ax
        shl bx, 1
        mov si, [sn_context_valid+bx]
        cmp byte [si], 0
        je .next
        bts word [sn_descriptor+1192], ax
        mov si, [sn_context_values+bx]
        mov ax, [si]
        mov [sn_descriptor+1194+bx], ax
.next:
        inc word [sn_context_index]
        cmp word [sn_context_index], 7
        jb .field
        mov si, sn_descriptor+1184
        movzx ax, byte [interactive_menu]
        jmp scx_validate

; Typed READY restores the saved context, clearing absent current CLI values.
; Replaying different scalar options cannot replace an admitted continuation.
sn_apply_context:
        mov word [sn_context_index], 0
.field:
        mov ax, [sn_context_index]
        mov bx, ax
        shl bx, 1
        mov si, [sn_context_valid+bx]
        bt word [sn_response+368], ax
        setc dl
        mov [si], dl
        mov si, [sn_context_values+bx]
        mov ax, [sn_response+370+bx]
        mov [si], ax
        inc word [sn_context_index]
        cmp word [sn_context_index], 7
        jb .field
        clc
        ret

%include "secretcontinuation_context.inc"
sn_context_index dw 0
sn_context_valid dw seed_strength_valid,seed_input_valid,seed_menu_valid,seed_parlay_valid,seed_encounter_valid,seed_who_valid,seed_menu_valid
sn_context_values dw seed_strength,seed_input,seed_menu,seed_parlay,seed_encounter,seed_who,menu_answer

sn_bad: stc
        ret

secret_next_ready db 0
sn_child db 'CCNEXT.COM',0
sn_arg_prepare db ' /P ',0
sn_arg_recover db ' /R ',0
sn_arg_complete db ' /C ',0
sn_arg_menu db ' /M ',0
sn_arg_empty db ' /E ',0
sn_descriptor_name db '_GBDESC.BIN',0
sn_response_name db '_GBNEXT.BIN',0
sn_fh dw 0ffffh
sn_descriptor times 1216 db 0
sn_response times 392 db 0
sn_descriptor_path times 112 db 0
sn_response_path times 112 db 0
sn_probe times 112 db 0
sn_temp times 112 db 0
sn_canon times 128 db 0

; A real initial menu/empty checkpoint exists before any frontend answer.
secret_next_initial:
        cmp byte [secret_party],1
        jne .ok
        cmp byte [secret_next_ready],1
        je .ok
        call secret_next_host_paths
        jc .bad
        call write_host_result_state
        jc .bad
        mov dx,titlepath
        mov ax,3d02h
        int 21h
        jc .bad
        mov [sn_fh],ax
        mov dword [fxbuf],'GBIR'
        mov word [fxbuf+4],1
        mov ax,[fxstatus]
        dec ax                      ; menu2 -> origin1; empty combat3 -> origin2
        mov [fxbuf+8],ax
        mov bx,[sn_fh]
        mov cx,10
        mov dx,fxbuf
        mov ah,40h
        int 21h
        jc .close_bad
        cmp ax,10
        jne .close_bad
        call sn_close
        jc .bad
        call secret_next_initial_prepare
        jc .bad
        mov si,sn_arg_recover
        call secret_next_call
        jc .bad
        cmp byte [secret_next_ready],1
        jne .bad
.ok: clc
        ret
.close_bad:
        call sn_close
.bad: stc
        ret
sn_initial_prepare db 0

; Secret presentation/VM streams have no supported external roster mutation.
; Admit their complete closed shape through CCNEXT, never generic CCHOST /D.
secret_inspect_sidecar:
        push ds
        pop es
        call tail_begin
        mov si,s_arg_host_damage
        call tail_append_str
        mov si,[effectreadp]
        mov di,sn_temp
        call sn_canonical
        jc sn_bad
        mov si,sn_temp
        call tail_append_str
        call tail_append_space
        mov si,rosterpath
        mov di,sn_temp
        call sn_canonical
        jc sn_bad
        mov si,sn_temp
        call tail_append_str
        call tail_append_space
        mov si,[eclp]
        mov di,sn_temp
        call sn_canonical
        jc sn_bad
        mov si,sn_temp
        call tail_append_str
        call tail_finish
        mov di,titlepath
        mov si,sn_child
        call compose_tool_path
        mov word [runpathp],titlepath
        jmp do_exec_checked
