; CCNEXT.COM -- owned Secret completed-combat continuation coordinator.
; /P descriptor, /R|/C roster source response, /V authority roster source.
; /D effect roster source performs independent closed read-only dispatch admission.
; Return0=none,2=validated restored cursor,1=failure. Coordinator owns authority;
; CCHOST retains its established standalone HP /P-/C protocol.
cpu 386
bits 16
org 100h
%ifdef CCNEXT_PUBLIC_FINAL
%define RZ_EXTERNAL_CATALOG rw_header
%define RU_EXTERNAL_TABLE rl_target_ledger
%define RV_EXTERNAL_COMPARE kc_cmp
%define RV_STREAM_PATHS 1
%define RCOMMIT_HAS_RQ 1
%define RCOMMIT_HAS_SUBMIT 1
; Preparation's ten paths are dead before reward framing/catalogue use.
; The public composition supplies RW storage; standalone callers retain it.
%ifndef CCNEXT_NO_PATH_OVERLAY
%define KN_PATH_OVERLAY 1
%endif
%endif
PATH_MAX equ 112
GBHR_LEN equ 346
start:
        cld
        push cs
        pop ds
        push cs
        pop es
        mov sp, stacktop
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 1
%endif
        call kn_parse
        jc kn_fail
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 2
%endif
        call kn_tool_prefix
        jc kn_fail
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 3
%endif
        call kn_alloc
        jc kn_fail
        cmp byte [kn_mode], 'P'
        je .prepare
        cmp byte [kn_mode], 'D'
        je .inspect
        cmp byte [kn_mode], 'V'
        je .verify
        call kn_resume
        jc kn_fail
        jmp .exit
.prepare:
%ifdef CCNEXT_TRACE
        mov byte [kn_trace_gate], 4
%endif
        call kn_prepare
        jc kn_fail
        xor ax, ax
        jmp .exit
.inspect:
        call ki_inspect
        jc kn_fail
        xor ax, ax
        jmp .exit
.verify:
        mov dx, kn_descriptor
        call kr_index
        jc kn_fail
        call kv_validate
        jc kn_fail
        mov si, kv_paths+112
        mov di, kn_expected_roster
        call kn_path_equal
        jne kn_fail
        mov si, kv_paths
        mov di, kn_expected_source
        call kn_path_equal
        jne kn_fail
        call kc_close
        jc kn_fail
        xor ax, ax
.exit:
%ifdef CCNEXT_PUBLIC_FINAL
        cmp word [kc_fh], 0ffffh
        je .closed
        push ax
        call kc_close
        pop ax
        jc kn_fail             ; no close retry; exit2 alone authorizes GBNR
.closed:
%endif
        mov ah, 4Ch
        int 21h
kn_fail:
%ifdef CCNEXT_TRACE
        mov dx, kn_trace_text
        mov ah, 9
        int 21h
        mov dl, [kn_trace_gate]
        cmp dl, 9
        jbe .trace_digit
        add dl, 7
.trace_digit:
        add dl, '0'
        mov ah, 2
        int 21h
        mov dl, 13
        int 21h
        mov dl, 10
        int 21h
%endif
        mov dx, kn_error
        mov ah, 9
        int 21h
        mov ax, 4C01h
        int 21h

kn_parse:
        mov si, 81h
        movzx bx, byte [80h]
        mov byte [81h+bx], 0
        call kn_skip
        lodsb
        cmp al, '/'
        jne .bad
        lodsb
        and al, 0DFh
        cmp al, 'P'
        je .mode
        cmp al, 'R'
        je .mode
        cmp al, 'C'
        je .mode
        cmp al, 'M'
        je .mode
        cmp al, 'E'
        je .mode
        cmp al, 'D'
        je .mode
        cmp al, 'V'
        jne .bad
.mode: mov [kn_mode], al
        cmp byte [si], ' '
        jne .bad
        call kn_skip
        mov di, kn_expected_roster
        cmp al, 'P'
        je .descriptor
        cmp al, 'D'
        je .descriptor
        cmp al, 'V'
        jne .first
.descriptor:
        mov di, kn_descriptor
.first:
        call kn_token
        jc .bad
        cmp byte [kn_mode], 'P'
        je .end
        cmp byte [kn_mode], 'D'
        je .roster
        cmp byte [kn_mode], 'V'
        jne .source
.roster:
        call kn_skip
        mov di, kn_expected_roster
        call kn_token
        jc .bad
.source:
        call kn_skip
        mov di, kn_expected_source
        call kn_token
        jc .bad
        cmp byte [kn_mode], 'D'
        je .end
        cmp byte [kn_mode], 'V'
        je .end
        call kn_skip
        mov di, kn_response
        call kn_token
        jc .bad
.end:  call kn_skip
        cmp byte [si], 0
        jne .bad
        clc
        ret
.bad:  stc
        ret
kn_skip:
        cmp byte [si], ' '
        jne .done
        inc si
        jmp kn_skip
.done: ret
kn_token:
        mov cx, 111
        xor bx, bx
.next: lodsb
        test al, al
        jz .end
        cmp al, ' '
        je .end
        cmp al, 13
        je .end
        stosb
        inc bx
        loop .next
        stc
        ret
.end:  dec si
        test bx, bx
        jz .bad
        inc cx
        xor ax, ax
        rep stosb
        clc
        ret
.bad:  stc
        ret

kn_alloc:
        mov bx, (stacktop-$$+100h+15)/16
        mov ah, 4Ah
        int 21h
        jc .bad
        mov bx, 4096
        mov ah, 48h
        int 21h
        jc .bad
        mov fs, ax
        mov bx, 2048
        mov ah, 48h
        int 21h
        jc .bad
        mov gs, ax
        clc
        ret
.bad:  stc
        ret

; Environment's executable pathname provides the sibling helper directory.
kn_tool_prefix:
        mov es, [2Ch]
        xor di, di
        mov cx, 32767
.env:  cmp word [es:di], 0
        je .path
        inc di
        loop .env
        jmp .bad
.path: add di, 4
        mov bx, kn_prefix
        xor dx, dx
        mov cx, 111
.copy: mov al, [es:di]
        test al, al
        jz .end
        mov [bx], al
        cmp al, '\'
        je .separator
        cmp al, ':'
        jne .advance
.separator: lea dx, [bx+1]
.advance:
        inc di
        inc bx
        loop .copy
        jmp .bad
.end:  test dx, dx
        jz .bad
        mov bx, dx
        mov byte [bx], 0
%ifdef CCNEXT_PUBLIC_FINAL
        ; The capture ABI binds all112 raw directory bytes, not only its first
        ; NUL. Remove the copied executable basename from directory padding.
        mov di, dx
        mov cx, kn_prefix+112
        sub cx, di
        push ds
        pop es
        xor ax, ax
        rep stosb
%endif
        push ds
        pop es
        clc
        ret
.bad:  push ds
        pop es
        stc
        ret

kn_path_equal:
        mov cx, 112
.byte: lodsb
        mov ah, [di]
        inc di
        cmp al, 'a'
        jb .left
        cmp al, 'z'
        ja .left
        sub al, 32
.left: cmp ah, 'a'
        jb .right
        cmp ah, 'z'
        ja .right
        sub ah, 32
.right: cmp al, ah
        jne .done
        test al, al
        jz .done
        loop .byte
        or ax, 1
.done: ret

; DX=absolute child helper; kn_tail is standard length byte + tail + CR.
kn_run_child:
        mov [kn_exec_path], dx
        mov ax, ds
        mov word [kn_execpb], 0
        mov word [kn_execpb+2], kn_tail
        mov [kn_execpb+4], ax
        mov word [kn_execpb+6], 5Ch
        mov [kn_execpb+8], ax
        mov word [kn_execpb+10], 6Ch
        mov [kn_execpb+12], ax
        mov [kn_saved_sp], sp
        mov [kn_saved_ss], ss
        mov [kn_saved_fs], fs
        mov [kn_saved_gs], gs
        push ds
        pop es
        mov bx, kn_execpb
        mov ax, 4B00h
        int 21h
        cli
        mov ss, [cs:kn_saved_ss]
        mov sp, [cs:kn_saved_sp]
        sti
        push cs
        pop ds
        push cs
        pop es
        mov fs, [kn_saved_fs]
        mov gs, [kn_saved_gs]
        jc .bad
        mov ah, 4Dh
        int 21h
        test ax, ax
        jnz .bad
        clc
        ret
.bad:  stc
        ret

%include "secretcontinuation_io.inc"
%include "secretcontinuation_record.inc"
%include "secretcontinuation_validate.inc"
%include "secretcontinuation_write.inc"
%include "secretroster.inc"
%include "secretcontinuation_projection.inc"
%include "secretcontinuation_files.inc"
%include "secretcontinuation_coordinator.inc"
%include "secretcontinuation_inspect.inc"
sh_bad: stc
        ret
sh_pre_offset dw 0
sh_result_length dw 0
v2_ext times 12 db 0
v2_record times 54 db 0
v2_dir times 8 db 0
v2_packed times 255 db 0
kn_mode db 0
kn_descriptor times 112 db 0
kn_expected_roster times 112 db 0
kn_expected_source times 112 db 0
kn_response times 112 db 0
kn_prefix times 112 db 0
kn_tail times 128 db 0
kn_execpb times 14 db 0
kn_exec_path dw 0
kn_saved_sp dw 0
kn_saved_ss dw 0
kn_saved_fs dw 0
kn_saved_gs dw 0
kn_restore_authorized dw 0
kn_error db 'CCNEXT: continuation ownership/recovery failed.',13,10,'$'
%ifdef CCNEXT_TRACE
kn_trace_gate db 0
kn_trace_text db 'CCNEXT trace startup gate=', '$'
%endif
%ifdef CCNEXT_PUBLIC_FINAL
%include "secretreward_record.inc"
%include "secretreward_names.inc"
%include "secretreward_resource.inc"
%include "secretreward_party.inc"
%include "secretreward_currency.inc"
%include "secretreward_xp.inc"
%include "secretreward_roster.inc"
%include "secretreward_state.inc"
%include "secretreward_replay.inc"
%include "secretreward_write.inc"
%include "secretreward_admission.inc"
%include "secretreward_transaction.inc"
%include "secretreward_p1write.inc"
%include "secretreward_owner.inc"
%include "secretreward_peer.inc"
%include "secretreward_commit.inc"
%include "secretreward_submit.inc"
%include "secretreward_public_final.inc"
rj_external equ kn_tail
%endif
times 512 db 0
stacktop:
