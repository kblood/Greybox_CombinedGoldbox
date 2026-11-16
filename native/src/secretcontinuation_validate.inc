; Read-only semantic admission for indexed GSK3 snapshots. DS=CCHOST,
; GS=32768-byte roster bank, FS=65536-byte result/effect/bitmap bank.
; kv_validate never publishes, opens another file, or sets kc_verified.
; FS:40000 is the current effect; FS:50000..58191 is an area-id bitmap.
KV_FX equ 40000
KV_BITMAP equ 50000
kv_validate:
        cld
        mov eax, KR_HEADER+KR_PATHS
        mov cx, 32
        mov di, kv_context
        call kc_read_at
        jc kv_bad
        call kv_check_context
        jc kv_bad
        cmp word [kr_header+20], 3
        ja kv_bad
        cmp word [kr_header+22], 0
        jne kv_bad
        cmp word [kr_header+20], 0
        je .kind_ok
        cmp word [kr_header+6], 0
        jne .not_prepared
        cmp word [kr_header+20],3
        jne kv_bad
        jmp .kind_ok
.not_prepared:
        cmp word [kr_header+20],3
        je kv_bad
.kind_ok:
        mov eax, 64
        mov cx, 1120
        mov di, kv_paths
        call kc_read_at
        jc kv_bad
        call kv_check_paths
        jc kv_bad
        mov eax, [kr_offsets]
        mov cx, 346
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        mov word [kv_initial_origin],0
        cmp dword [kc_buf],'GBIR'
        je .initial_request
        cmp dword [kc_buf],'GBHR'
        jne kv_bad
        cmp dword [kc_buf+4],00040002h
        jne kv_bad
        cmp word [kc_buf+8],0
        jne kv_bad
        cmp word [kr_header+20],3
        je kv_bad
        jmp .request_paths
.initial_request:
        cmp dword [kc_buf+4],00040001h
        jne kv_bad
        mov ax,[kc_buf+8]
        cmp ax,1
        jb kv_bad
        cmp ax,2
        ja kv_bad
        mov [kv_initial_origin],ax
        cmp word [kr_header+20],0
        je kv_bad
        cmp word [kr_header+20],3
        je .request_paths
        cmp ax,[kr_header+20]
        jne kv_bad
.request_paths:
        mov si, kc_buf+10
        mov di, kv_paths+3*112
        call kv_request_path
        jc kv_bad
        mov si, kc_buf+122
        mov di, kv_paths+112
        call kv_request_path
        jc kv_bad
        mov si, kc_buf+234
        mov di, kv_paths+4*112
        call kv_request_path
        jc kv_bad
        mov eax, [kr_offsets+4]
        mov cx, [kr_header+28]
        xor di, di
        push gs
        pop es
        call kv_load_bank
        jc kv_bad
        mov ax, [kr_header+28]
        mov [sr_length], ax
        call sr_validate
        jc kv_bad
        mov ax, [sr_count]
        cmp ax, [kr_header+12]
        jne kv_bad
        call sc_validate_hp
        jc kv_bad
        mov word [kv_index], 0
.levels:
        imul si, word [kv_index], 440
        add si, 16+1+273
        mov cx, 14
.level:
        cmp byte [gs:si], 18
        ja kv_bad
        inc si
        loop .level
        inc word [kv_index]
        mov ax, [kv_index]
        cmp ax, [sr_count]
        jb .levels
        mov eax, [kr_offsets+12]
        mov cx, 150
        mov di, kv_seed
        call kc_read_at
        jc kv_bad
        call kv_check_seed
        jc kv_bad
        mov eax, [kr_offsets+8]
        mov cx, [kr_header+32]
        mov byte [kv_pending], 1
        cmp word [kr_header+20],3
        je .initial_pending
        cmp word [kr_header+20], 1
        jne .paused_kind
.initial_pending:
        mov byte [kv_pending], 0
.paused_kind:
        call kv_effect
        jc kv_bad
        mov ax, [kv_area]
        cmp ax, [kr_header+14]
        jne kv_bad
        cmp word [kr_header+20],3
        jne .answered_menu
        mov ax,[kv_initial_origin]
        cmp ax,1
        jne .initial_empty
        cmp word [fs:KV_FX+8],2
        jne kv_bad
        jmp .paused_source
.initial_empty:
        cmp word [fs:KV_FX+8],3
        jne kv_bad
        cmp word [fs:KV_FX+32],0
        jne kv_bad
        jmp .paused_source
.answered_menu:
        cmp word [kr_header+20], 1
        jne .paused_empty
        cmp word [fs:KV_FX+4], 16
        je .paused_empty
        cmp word [fs:KV_FX+4], 15
        jne kv_bad
.paused_empty:
        cmp word [kr_header+20], 2
        jne .paused_source
        cmp word [fs:KV_FX+32], 0
        jne kv_bad
.paused_source:
        call kv_source_pc
        jc kv_bad
        cmp word [kr_header+6],0
        jne .completed_state
        cmp word [kr_header+20],3
        jne kv_ok
        call kv_stream
        jc kv_bad
        jmp kv_ok
.completed_state:
        cmp word [kr_header+20], 0
        je .hp_result
        cmp dword [kr_header+44], 0
        jne kv_bad
        call kv_advance_outcome
        jc kv_bad
        jmp .after_completion
.hp_result:
        mov eax, [kr_offsets+20]
        mov cx, [kr_header+44]
        xor di, di
        push fs
        pop es
        call kv_load_bank
        jc kv_bad
        mov ax, [kr_header+44]
        mov [sh_result_length], ax
        mov ax, [kr_header+28]
        cmp ax, [fs:12]
        jne kv_bad
        mov ax, [kr_header+12]
        cmp ax, [fs:10]
        jne kv_bad
        movzx ecx, word [kr_header+28]
        mov eax, [kr_offsets+4]
        movzx edx, word [kr_header+12]
        imul edx, edx, 6
        add edx, 16
        add edx, [kr_offsets+20]
        call kc_equal_offsets
        jc kv_bad
        call sh_project
        jc kv_bad
        mov ax, [fs:6]
        shl ax, 1
        mov bx, ax
        mov si, [kv_outcomes+bx]
        mov ax, [kv_outcome_lengths+bx]
        cmp ax, [kr_header+48]
        jne kv_bad
        mov [kv_text_ptr], si
        mov cx, ax
        mov eax, [kr_offsets+24]
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        mov si, [kv_text_ptr]
        mov di, kc_buf
        mov cx, [kr_header+48]
        push ds
        pop es
        repe cmpsb
        jne kv_bad
.after_completion:
        cmp word [kr_header+6], 1
        je kv_ok
        mov byte [kv_pending], 0
        mov eax, [kr_offsets+28]
        mov cx, [kr_header+52]
        call kv_effect
        jc kv_bad
        call kv_source_pc
        jc kv_bad
        call kv_stream
        jc kv_bad
kv_ok: push ds
        pop es
        clc
        ret
kv_bad: push ds
        pop es
        stc
        ret

; Standalone descriptor and indexed-record context admission. The caller
; supplies header+18 mode and complete kv_context; no IO or mutation occurs.
kv_check_context:
        mov si, kv_context
        mov ax, [kr_header+18]
        jmp scx_validate

; EAX snapshot offset, CX bounded length, ES:DI target bank. Streaming source
; reads always go through kc_read_at's DS buffer, never a wrapping DOS bank.
kv_load_bank:
        mov [kv_load_off], eax
        mov [kv_load_left], cx
        mov [kv_load_dest], di
.loop:
        mov cx, [kv_load_left]
        jcxz .done
        cmp cx, 512
        jbe .bounded
        mov cx, 512
.bounded:
        mov [kv_load_chunk], cx
        mov eax, [kv_load_off]
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        mov si, kc_buf
        mov di, [kv_load_dest]
        mov cx, [kv_load_chunk]
        rep movsb
        mov [kv_load_dest], di
        movzx eax, word [kv_load_chunk]
        add [kv_load_off], eax
        mov ax, [kv_load_chunk]
        sub [kv_load_left], ax
        jmp .loop
.done: clc
        ret

kv_request_path:
        push di
        push si
        call kv_path
        pop si
        pop di
        jc kv_bad
        push ds
        pop es
        mov cx, 112
        repe cmpsb
        jne kv_bad
        clc
        ret

; Canonicalize one complete padded DOS 8.3 path in DS:SI. No physical alias
; claim: the coordinator separately owns a controlled mount contract.
kv_path:
        push ds
        pop es
        mov [kv_path_start], si
        mov cx, 112
        mov di, si
.upper:
        mov al, [di]
        cmp al, 'a'
        jb .next
        cmp al, 'z'
        ja .next
        sub al, 32
        mov [di], al
.next: inc di
        loop .upper
        cmp byte [si], 'A'
        jb kv_bad
        cmp byte [si], 'Z'
        ja kv_bad
        cmp word [si+1], 05c3ah
        jne kv_bad
        add si, 3
.component:
        cmp byte [si], 0
        je .padding
        mov [kv_component], si
        xor bx, bx
        xor dx, dx
        xor bp, bp
.char:
        mov al, [si]
        test al, al
        jz .end_component
        cmp al, 05ch
        je .end_component
        cmp al, '.'
        je .dot
        cmp al, 33
        jb kv_bad
        cmp al, 126
        ja kv_bad
        mov di, kv_forbidden
.forbidden:
        mov ah, [di]
        test ah, ah
        jz .allowed
        inc di
        cmp al, ah
        je kv_bad
        jmp .forbidden
.allowed:
        test bp, bp
        jnz .extension
        inc bx
        cmp bx, 8
        ja kv_bad
        jmp .advance
.extension:
        inc dx
        cmp dx, 3
        ja kv_bad
.advance:
        inc si
        mov ax, si
        sub ax, [kv_path_start]
        cmp ax, 112
        jae kv_bad
        jmp .char
.dot:
        test bp, bp
        jnz kv_bad
        test bx, bx
        jz kv_bad
        inc bp
        jmp .advance
.end_component:
        test bx, bx
        jz kv_bad
        test bp, bp
        jz .device
        test dx, dx
        jz kv_bad
.device:
        push si
        mov si, [kv_component]
        mov di, kv_devices
.device_next:
        cmp byte [di], 0
        je .device_done
        push si
        push di
        mov cx, bx
        repe cmpsb
        pop di
        pop si
        jne .skip_device
        cmp byte [di+bx], 0
        je .device_bad
.skip_device:
        cmp byte [di], 0
        je .skip_end
        inc di
        jmp .skip_device
.skip_end:
        inc di
        jmp .device_next
.device_bad:
        pop si
        jmp kv_bad
.device_done:
        ; COM1..9/LPT1..9 are devices even with an extension.
        cmp bx, 4
        jne .not_numbered
        cmp word [si], 'CO'
        jne .lpt
        cmp byte [si+2], 'M'
        je .numbered
.lpt:  cmp word [si], 'LP'
        jne .not_numbered
        cmp byte [si+2], 'T'
        jne .not_numbered
.numbered:
        cmp byte [si+3], '1'
        jb .not_numbered
        cmp byte [si+3], '9'
        jbe .device_bad
.not_numbered:
        pop si
        cmp byte [si], 0
        je .padding
        inc si
        cmp byte [si], 0
        je kv_bad
        jmp .component
.padding:
        mov di, [kv_path_start]
        add di, 112
.pad:  cmp si, di
        jae kv_bad
        cmp byte [si], 0
        jne kv_bad
        inc si
        cmp si, di
        jb .pad
        clc
        ret

kv_check_paths:
        push ds
        pop es
        mov word [kv_index], 0
.path:
        mov ax, [kv_index]
        imul ax, ax, 112
        mov si, kv_paths
        add si, ax
        call kv_path
        jc kv_bad
        inc word [kv_index]
        cmp word [kv_index], 10
        jb .path
        xor bx, bx
.outer:
        mov dx, bx
        inc dx
.inner:
        cmp dx, 10
        jae .next_outer
        push bx
        push dx
        imul si, bx, 112
        add si, kv_paths
        imul di, dx, 112
        add di, kv_paths
        call kc_disjoint
        pop dx
        pop bx
        jc kv_bad
        inc dx
        jmp .inner
.next_outer:
        inc bx
        cmp bx, 9
        jb .outer
        ; Files may not name drive roots. Workdir is the one directory entry.
        mov si, kv_paths+3
        mov cx, 9
.roots:
        cmp byte [si], 0
        je kv_bad
        add si, 112
        loop .roots
        mov si, kv_paths+112
        mov di, kv_scratch
        call kv_copy_path
        jc kv_bad
        mov si, kv_scratch
        call kv_extension
        jc kv_bad
        cmp dword [si-1], '.GBP'
        jne kv_bad
        mov dword [si-1], '.GSK'
        mov si, kv_scratch
        mov di, kv_paths+8*112
        mov cx, 112
        repe cmpsb
        jne kv_bad
        ; Every derived transaction/effect/authority sibling must be disjoint
        ; from all protected paths; paused/successor IDN stems also disjoint.
        mov word [kv_index], 0
.derived:
        mov bx, [kv_index]
        mov si, [kv_derived_paths+bx]
        mov di, kv_scratch
        call kv_copy_path
        jc kv_bad
        mov si, kv_scratch
        call kv_extension
        jc kv_bad
        mov bx, [kv_index]
        shl bx, 1
        mov eax, [kv_derived_exts+bx]
        mov [si], eax
        mov byte [si+3], 0
        call kv_disjoint_all
        jc kv_bad
        add word [kv_index], 2
        cmp word [kv_index], 38
        jb .derived
        mov si, kv_paths+4*112
        mov di, kv_scratch
        call kv_copy_path
        mov si, kv_scratch
        call kv_extension
        jc kv_bad
        mov dword [si], 'IDN'
        mov si, kv_paths+7*112
        mov di, kv_other_path
        call kv_copy_path
        mov si, kv_other_path
        call kv_extension
        jc kv_bad
        mov dword [si], 'IDN'
        mov si, kv_scratch
        mov di, kv_other_path
        call kc_disjoint
        jc kv_bad
        ; Fixed working-directory scratch names.
        mov word [kv_index], 0
.work:
        mov si, kv_paths+9*112
        mov di, kv_scratch
        call kv_copy_path
        jc kv_bad
        mov si, kv_scratch
.find_end:
        cmp byte [si], 0
        je .end
        inc si
        jmp .find_end
.end:  cmp byte [si-1], 05ch
        je .slash
        mov byte [si], 05ch
        inc si
.slash:
        mov bx, [kv_index]
        mov di, [kv_work_names+bx]
.name: cmp si, kv_scratch+112
        jae kv_bad
        mov al, [di]
        inc di
        mov [si], al
        inc si
        test al, al
        jnz .name
        mov ax, si
        sub ax, kv_scratch
        cmp ax, 112
        ja kv_bad
        call kv_disjoint_all
        jc kv_bad
        add word [kv_index], 2
        cmp word [kv_index], kv_work_names_end-kv_work_names
        jb .work
        clc
        ret
kv_copy_path:
        mov cx, 112
        rep movsb
        clc
        ret
kv_extension:
        mov [kv_ext_start], si
        xor dx, dx
.scan: mov al, [si]
        test al, al
        jz .end
        cmp al, '.'
        jne .next
        mov dx, si
.next: inc si
        jmp .scan
.end:  test dx, dx
        jz kv_bad
        mov ax, dx
        sub ax, [kv_ext_start]
        cmp ax, 107                 ; three-byte extension and NUL must fit
        ja kv_bad
        mov si, dx
        inc si
        clc
        ret
kv_disjoint_all:
        xor bp, bp
.loop:
        mov si, kv_scratch
        mov di, kv_paths
        add di, bp
        push bp
        call kc_disjoint
        pop bp
        jc kv_bad
        add bp, 112
        cmp bp, 1120
        jb .loop
        clc
        ret

kv_check_seed:
        cmp dword [kv_seed], 'GBPS'
        jne kv_bad
        cmp word [kv_seed+4], 1
        jne kv_bad
        mov ax, [kv_seed+6]
        test ax, 0fff8h
        jnz kv_bad
        test ax, 1
        jz kv_bad
        mov ax, [kr_header+12]
        cmp ax, [kv_seed+8]
        jne kv_bad
        cmp byte [kv_seed+21], 0
        jne kv_bad
        xor bx, bx
.list: mov al, [kv_seed+14+bx]
        cmp al, [kv_seed_caps+bx]
        ja kv_bad
        inc bx
        cmp bx, 7
        jb .list
        movzx cx, byte [kv_seed+16]
        mov si, kv_seed+54
        call .members
        jc kv_bad
        movzx cx, byte [kv_seed+20]
        mov si, kv_seed+134
.members:
        jcxz .done
        mov ax, [si]
        cmp ax, 1
        jb kv_bad
        cmp ax, [kr_header+12]
        ja kv_bad
        add si, 4
        loop .members
.done: clc
        ret

kv_effect:
        mov [kv_fx_len], cx
        mov di, KV_FX
        push fs
        pop es
        call kv_load_bank
        jc kv_bad
        cmp dword [fs:KV_FX], 'GBEF'
        jne kv_bad
        mov ax, [fs:KV_FX+4]
        cmp ax, 9
        je .v9
        cmp ax, 16
        je .v16
        cmp ax, 15
        jne kv_bad
        cmp word [kv_fx_len], 5932
        jne kv_bad
        cmp byte [kv_pending], 0
        jne kv_bad
        cmp word [kr_header+18], 1
        jne kv_bad
        cmp word [fs:KV_FX+8], 2
        jne kv_bad
        jmp .resumable
.v16:
        cmp word [kv_fx_len], 5948
        jne kv_bad
        mov bp, KV_FX
        call kv_selection
        jc kv_bad
        cmp dword [fs:KV_FX+5920], 'GBRF'
        jne kv_bad
        cmp word [fs:KV_FX+5930], 0
        jne kv_bad
        mov si, KV_FX+5924
        mov cx, 6
.rawflag:
        cmp byte [fs:si], 1
        ja kv_bad
        inc si
        loop .rawflag
        mov ax, [fs:KV_FX+8]
        cmp ax, 2
        jne .v16_nonmenu
        cmp byte [kv_pending], 0
        jne kv_bad
        cmp word [kr_header+18], 1
        jne kv_bad
        jmp .resumable
.v16_nonmenu:
        cmp byte [kv_pending], 1
        jne .successor
        cmp ax, 3
        jne kv_bad
        jmp .resumable
.v9:   cmp word [kv_fx_len], 5750
        jne kv_bad
        mov ax, [fs:KV_FX+8]
        cmp byte [kv_pending], 1
        jne .successor
        cmp ax, 3
        jne kv_bad
        jmp .resumable
.successor:
        cmp ax, 3
        je .resumable
        cmp ax, 1
        ja kv_bad
        jmp .state
.resumable:
        test word [fs:KV_FX+120], 1
        jz kv_bad
.state:
        cmp dword [fs:KV_FX+116], 'GBRS'
        jne kv_bad
        ; Closed paired bits bind Secret long frames and proven ECL RNG.
        mov ax, [fs:KV_FX+120]
        and ax, 0fffeh
        cmp ax, 12
        jne kv_bad
        mov ax, [fs:KV_FX+122]
        mov [kv_area], ax
        cmp byte [kv_pending], 1
        jne .pc
        cmp ax, [kr_header+14]
        jne kv_bad
.pc:   mov ax, [fs:KV_FX+124]
        mov [kv_pc], ax
        cmp word [fs:KV_FX+130], 32
        ja kv_bad
        cmp word [fs:KV_FX+196], 512
        ja kv_bad
        cmp dword [fs:KV_FX+2246], 'GBSX'
        jne kv_bad
        cmp word [fs:KV_FX+2250], 64
        ja kv_bad
        cmp dword [fs:KV_FX+5720], 'GBHD'
        jne kv_bad
        cmp word [fs:KV_FX+5724], 0
        jne kv_bad
        cmp dword [fs:KV_FX+5708], 'GBES'
        jne kv_bad
        cmp dword [fs:KV_FX+5732], 'GBCL'
        jne kv_bad
        cmp word [fs:KV_FX+32], 8
        ja kv_bad
        cmp word [fs:KV_FX+82], 8
        ja kv_bad
        cmp word [fs:KV_FX+8], 2
        je kv_menu
        clc
        ret

; Complete method-zero GLIB area/member ownership, streamed u32 archive.
kv_source_pc:
        mov eax, [kr_offsets+16]
        mov cx, 32
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        cmp dword [kc_buf], 'GBID'
        jne kv_bad
        cmp dword [kc_buf+4], 00100001h
        jne kv_bad
        cmp dword [kc_buf+12], 0
        jne kv_bad
        mov eax, [kr_header+40]
        sub eax, 16
        cmp eax, [kc_buf+8]
        jne kv_bad
        mov [kv_source_len], eax
        cmp dword [kc_buf+16], 'GLIB'
        jne kv_bad
        mov eax, [kc_buf+20]
        xchg al, ah
        rol eax, 16
        xchg al, ah
        cmp eax, [kv_source_len]
        jne kv_bad
        cmp word [kc_buf+26], 0100h
        jne kv_bad
        mov ax, [kc_buf+24]
        xchg al, ah
        cmp ax, 2
        jb kv_bad
        cmp ax, 256
        ja kv_bad
        mov [kv_members], ax
        movzx eax, ax
        inc eax
        shl eax, 2
        add eax, 16
        mov [kv_ptr_end], eax
        cmp eax, [kv_source_len]
        ja kv_bad
        mov eax, [kr_offsets+16]
        add eax, 16
        mov [kv_source_start], eax
        mov word [kv_index], 0
        mov dword [kv_previous], 0
.ptr:
        movzx eax, word [kv_index]
        shl eax, 2
        add eax, 16
        add eax, [kv_source_start]
        mov cx, 4
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        mov eax, [kc_buf]
        xchg al, ah
        rol eax, 16
        xchg al, ah
        cmp eax, [kv_source_len]
        ja kv_bad
        cmp eax, [kv_previous]
        jb kv_bad
        mov [kv_previous], eax
        cmp word [kv_index], 0
        jne .second
        cmp eax, [kv_ptr_end]
        jb kv_bad
        mov [kv_table_start], eax
.second:
        cmp word [kv_index], 1
        jne .next_ptr
        mov [kv_table_end], eax
.next_ptr:
        mov bx, [kv_index]
        cmp bx, [kv_members]
        je .last
        inc word [kv_index]
        jmp .ptr
.last: cmp eax, [kv_source_len]
        jne kv_bad
        mov eax, [kv_table_end]
        sub eax, [kv_table_start]
        cmp eax, 2
        jb kv_bad
        mov [kv_table_len], eax
        mov eax, [kv_source_start]
        add eax, [kv_table_start]
        mov cx, 2
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        mov ax, [kc_buf]
        xchg al, ah
        mov [kv_entries], ax
        movzx eax, ax
        shl eax, 2
        add eax, 2
        cmp eax, [kv_table_len]
        jne kv_bad
        push fs
        pop es
        mov di, KV_BITMAP
        xor ax, ax
        mov cx, 4096
        rep stosw
        mov word [kv_index], 0
        mov word [kv_match], 0
.entry:
        mov ax, [kv_index]
        cmp ax, [kv_entries]
        jae .entries_done
        movzx eax, ax
        shl eax, 2
        add eax, 2
        add eax, [kv_table_start]
        add eax, [kv_source_start]
        mov cx, 4
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        mov ax, [kc_buf]
        xchg al, ah
        mov dx, ax
        mov bx, ax
        shr bx, 3
        and bx, 0fffeh
        and ax, 15
        bt word [fs:KV_BITMAP+bx], ax
        jc kv_bad
        bts word [fs:KV_BITMAP+bx], ax
        mov ax, [kc_buf+2]
        xchg al, ah
        cmp ax, 1
        jb kv_bad
        cmp ax, [kv_members]
        jae kv_bad
        cmp dx, [kv_area]
        jne .next_entry
        mov [kv_match], ax
.next_entry:
        inc word [kv_index]
        jmp .entry
.entries_done:
        movzx eax, word [kv_match]
        test eax, eax
        jz kv_bad
        shl eax, 2
        add eax, 16
        add eax, [kv_source_start]
        mov cx, 8
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        mov eax, [kc_buf+4]
        xchg al, ah
        rol eax, 16
        xchg al, ah
        mov edx, [kc_buf]
        xchg dl, dh
        rol edx, 16
        xchg dl, dh
        sub eax, edx
        cmp eax, 20
        jb kv_bad
        cmp eax, 16000
        ja kv_bad
        movzx edx, word [kv_pc]
        cmp edx, 20
        jb kv_bad
        cmp edx, eax
        ja kv_bad
        clc
        ret

; Model-equivalent Secret long-frame menu state. WHO and
; DoK-specific ACK are rejected; private capacity status is rejected earlier.
kv_menu:
        cmp dword [fs:KV_FX+5774], 'GBMS'
        jne kv_bad
        test word [fs:KV_FX+5784], 0fffch
        jnz kv_bad
        cmp dword [fs:KV_FX+5920], 'GBRF'
        jne kv_bad
        cmp word [fs:KV_FX+5930], 0
        jne kv_bad
        mov si, KV_FX+5924
        mov cx, 6
.flag: cmp byte [fs:si], 1
        ja kv_bad
        inc si
        loop .flag
        cmp dword [fs:KV_FX+5750], 'GBMN'
        jne kv_bad
        mov ax, [fs:KV_FX+5754]
        mov [kv_menu_flags], ax
        mov ax, [fs:KV_FX+5756]
        mov [kv_menu_dest], ax
        mov ax, [fs:KV_FX+5758]
        cmp ax, 255
        ja kv_bad
        mov [kv_menu_count], ax
        mov ax, [fs:KV_FX+5760]
        mov [kv_menu_opcode], ax
        cmp ax, 0fh
        je .supported
        cmp ax, 10h
        je .supported
        cmp ax, 15h
        je .supported
        cmp ax, 2bh
        je .supported
        cmp ax, 2ch
        je .supported
        cmp ax, 39h
        jne kv_bad
        cmp word [fs:KV_FX+4], 16
        jne kv_bad
.supported:
        cmp word [kv_menu_count], 0
        jne .count
        cmp ax, 0fh
        jne kv_bad
.count:
        mov ax, [fs:KV_FX+2250]
        test ax, ax
        jz kv_bad
        dec ax
        cmp ax, [fs:KV_FX+5762]
        jne kv_bad
        imul si, ax, 20
        add si, KV_FX+2252
        mov ax, [fs:si]
        cmp ax, [kv_menu_opcode]
        jne kv_bad
        mov ax, [kv_pc]
        cmp ax, [fs:KV_FX+5766]
        jne kv_bad
        mov ax, [kv_area]
        cmp ax, [fs:KV_FX+5768]
        jne kv_bad
        mov ax, [kv_menu_dest]
        cmp ax, [fs:KV_FX+5770]
        jne kv_bad
        mov ax, [kv_menu_opcode]
        cmp ax, [fs:KV_FX+5772]
        jne kv_bad
        cmp ax, 22h
        je .yesno
        cmp word [kv_menu_flags], 1
        jne kv_bad
        cmp word [fs:KV_FX+5764], 0
        jne kv_bad
        cmp ax, 15h
        je .vertical
        cmp ax, 0fh
        je .number
        cmp ax, 10h
        je .string
        cmp ax, 2ch
        je .parlay
        cmp ax, 39h
        je .who
        cmp word [fs:si+2], 2
        jb kv_bad
        mov ax, [fs:si+4]
        cmp ax, [kv_menu_dest]
        jne kv_bad
        mov ax, [fs:si+6]
        cmp ax, [kv_menu_count]
        jne kv_bad
        jmp .text
.vertical:
        cmp word [fs:si+2], 3
        jb kv_bad
        mov ax, [fs:si+4]
        cmp ax, [kv_menu_dest]
        jne kv_bad
        mov ax, [fs:si+8]
        cmp ax, [kv_menu_count]
        jne kv_bad
        jmp .text
.number:
        cmp word [kv_menu_count], 0
        jne kv_bad
        cmp word [fs:si+2], 2
        jb kv_bad
        mov ax, [fs:si+6]
        cmp ax, [kv_menu_dest]
        jne kv_bad
        jmp .text
.string:
        cmp word [fs:si+2], 2
        jne kv_bad
        mov ax, [fs:si+4]
        cmp ax, [kv_menu_count]
        jne kv_bad
        mov ax, [fs:si+6]
        cmp ax, [kv_menu_dest]
        jne kv_bad
        jmp .text
.parlay:
        cmp word [fs:si+2], 6
        jb kv_bad
        mov ax, [fs:si+14]
        cmp ax, [kv_menu_dest]
        jne kv_bad
        cmp word [kv_menu_count], 5
        jne kv_bad
        jmp .text
.who:
        cmp word [kv_menu_dest], 0ffffh
        jne kv_bad
        mov ax, [kr_header+12]
        cmp ax, [kv_menu_count]
        jne kv_bad
        cmp word [fs:si+2], 1
        jne kv_bad
        cmp word [fs:si+4], 1
        jb kv_bad
        cmp word [fs:si+4], 128
        ja kv_bad
        jmp .text
.yesno:
        cmp word [kv_menu_flags], 3
        jne kv_bad
        cmp word [kv_menu_dest], 0ffffh
        jne kv_bad
        cmp word [kv_menu_count], 2
        jne kv_bad
        cmp word [fs:si+2], 0
        jne kv_bad
        test word [fs:KV_FX+5764], 0fffch
        jnz kv_bad
.text:
        cmp dword [fs:KV_FX+5786], 'GBMT'
        jne kv_bad
        mov cx, [kv_menu_count]
        mov ax, [kv_menu_opcode]
        cmp ax, 0fh
        je .zero_text
        cmp ax, 10h
        je .zero_text
        cmp ax, 15h
        je .extra
        cmp ax, 39h
        je .extra
        cmp ax, 22h
        jne .text_count
.extra:inc cx
        jmp .text_count
.zero_text:
        xor cx, cx
.text_count:
        cmp cx, [fs:KV_FX+5790]
        jne kv_bad
        mov si, KV_FX+5792
        mov word [kv_yes_labels], 0
.segment:
        jcxz .padding
        cmp si, KV_FX+5920
        jae kv_bad
        movzx ax, byte [fs:si]
        inc si
        add si, ax
        cmp si, KV_FX+5920
        ja kv_bad
        cmp word [kv_menu_opcode], 22h
        jne .next
        cmp cx, 3
        jne .label
        mov [kv_yes_labels], si
.label:
.next: loop .segment
.padding:
        cmp si, KV_FX+5920
        jae .labels
        cmp byte [fs:si], 0
        jne kv_bad
        inc si
        jmp .padding
.labels:
        cmp word [kv_menu_opcode], 39h
        je kv_who_labels
        cmp word [kv_menu_opcode], 22h
        jne .done
        mov si, [kv_yes_labels]
        cmp dword [fs:si], 0c0546403h
        jne kv_bad
        cmp dword [fs:si+4], 00f03803h
        jne kv_bad
.done: clc
        ret

; Exact closed GBSL bundle semantics. All containing offsets remain u32;
; only the embedded v2 relative extent is 16-bit, matching CCHOST/CCFLOW.
kv_stream:
        mov ax, [fs:KV_FX+6]
        and ax, 0100h
        mov edx, [kr_header+56]
        test edx, edx
        jz .absent
        test ax, ax
        jz kv_bad
        mov [kv_stream_len], edx
        mov eax, [kr_offsets+32]
        mov [kv_stream_base], eax
        mov cx, 8
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        cmp dword [kc_buf], 'GBSL'
        jne kv_bad
        mov ax, [kc_buf+4]
        cmp ax, 1
        je .version
        cmp ax, 2
        jne kv_bad
.version:
        mov [kv_stream_version], ax
        movzx eax, word [kc_buf+6]
        test eax, eax
        jz kv_bad
        mov [kv_stream_count], ax
        imul eax, eax, 54
        add eax, 8
        mov [kv_records_end], eax
        cmp eax, [kv_stream_len]
        ja kv_bad
        cmp word [kv_stream_version], 2
        je .v2
        cmp eax, [kv_stream_len]
        jne kv_bad
        jmp .records
.v2:
        cmp word [kv_stream_count], 1213
        ja kv_bad
        cmp dword [kv_stream_len], 65535
        ja kv_bad
        add eax, 12
        cmp eax, [kv_stream_len]
        ja kv_bad
        sub eax, 12
        add eax, [kv_stream_base]
        mov cx, 12
        mov di, v2_ext
        call kc_read_at
        jc kv_bad
        cmp dword [v2_ext], 'GBPX'
        jne kv_bad
        cmp word [v2_ext+4], 1
        je .codec_ok
        cmp word [v2_ext+4], 2
        jne kv_bad
        ; kv_effect already validated the closed Secret GBRS/status/identity.
        cmp word [fs:KV_FX+4], 16
        jne kv_bad
.codec_ok:
        cmp word [v2_ext+10], 0
        jne kv_bad
        mov ax, [v2_ext+6]
        test ax, ax
        jz kv_bad
        cmp ax, [kv_stream_count]
        ja kv_bad
        mov [kv_tags], ax
        movzx eax, ax
        shl eax, 3
        add eax, 12
        add eax, [kv_records_end]
        mov [kv_payload_base], eax
        movzx edx, word [v2_ext+8]
        add eax, edx
        cmp eax, [kv_stream_len]
        jne kv_bad
.records:
        mov ax, [kv_stream_count]
        sub ax, [fs:KV_FX+2250]
        jc kv_bad
        mov [kv_terminal_start], ax
        mov word [kv_stream_index], 0
        mov word [kv_seen_tags], 0
        mov word [kv_seen_payload], 0
.record:
        mov ax, [kv_stream_index]
        cmp ax, [kv_stream_count]
        jae .done
        movzx eax, ax
        imul eax, eax, 54
        add eax, 8
        add eax, [kv_stream_base]
        mov cx, 54
        mov di, v2_record
        call kc_read_at
        jc kv_bad
        mov ax, [v2_record+20]
        cmp ax, 32
        jbe .terminal
        cmp word [kv_stream_version], 2
        jne kv_bad
        cmp ax, 0ffffh
        jne kv_bad
        cmp word [v2_record], 11h
        je .long
        cmp word [v2_record], 12h
        jne kv_bad
.long:
        cmp dword [v2_record+22], 'GBPX'
        jne kv_bad
        mov ax, [kv_seen_tags]
        cmp ax, [kv_tags]
        jae kv_bad
        cmp ax, [v2_record+26]
        jne kv_bad
        mov si, v2_record+28
        mov cx, 26
.zero: cmp byte [si], 0
        jne kv_bad
        inc si
        loop .zero
        movzx eax, word [kv_seen_tags]
        shl eax, 3
        add eax, 12
        add eax, [kv_records_end]
        add eax, [kv_stream_base]
        mov cx, 8
        mov di, v2_dir
        call kc_read_at
        jc kv_bad
        mov ax, [kv_stream_index]
        cmp ax, [v2_dir]
        jne kv_bad
        mov ax, [kv_seen_payload]
        cmp ax, [v2_dir+2]
        jne kv_bad
        mov ax, [v2_dir+4]
        cmp ax, 1
        jb kv_bad
        cmp ax, 255
        ja kv_bad
        add ax, [kv_seen_payload]
        jc kv_bad
        cmp ax, [v2_ext+8]
        ja kv_bad
        mov [kv_seen_payload], ax
        cmp word [v2_dir+6], 32
        jbe kv_bad
        movzx eax, word [v2_dir+2]
        add eax, [kv_payload_base]
        add eax, [kv_stream_base]
        mov cx, [v2_dir+4]
        mov di, v2_packed
        call kc_read_at
        jc kv_bad
        call v2_count_packed
        cmp bp, [v2_dir+6]
        jne kv_bad
        inc word [kv_seen_tags]
.terminal:
        mov ax, [kv_stream_index]
        cmp ax, [kv_terminal_start]
        jb .next
        sub ax, [kv_terminal_start]
        mov [kv_terminal_index], ax
        imul di, ax, 20
        add di, KV_FX+2252
        mov si, v2_record
        mov cx, 20
.event:
        mov al, [si]
        cmp al, [fs:di]
        jne kv_bad
        inc si
        inc di
        loop .event
        imul di, word [kv_terminal_index], 34
        add di, KV_FX+3532
        cmp word [fs:di], 32
        ja .reference
        mov si, v2_record+20
        mov cx, 34
.text: mov al, [si]
        cmp al, [fs:di]
        jne kv_bad
        inc si
        inc di
        loop .text
        jmp .next
.reference:
        cmp word [kv_stream_version], 2
        jne kv_bad
        cmp word [fs:di], 0ffffh
        jne kv_bad
        cmp dword [fs:di+2], 'DREF'
        jne kv_bad
        cmp dword [v2_record+22], 'GBPX'
        jne kv_bad
        cmp word [v2_record+20], 0ffffh
        jne kv_bad
        cmp word [fs:di+6], 255
        ja kv_bad
        mov ax, [fs:di+10]
        cmp ax, 1
        jb kv_bad
        cmp ax, 255
        ja kv_bad
        cmp ax, [v2_dir+4]
        jne kv_bad
        add ax, [fs:di+8]
        jc kv_bad
        cmp ax, [fs:di+12]
        ja kv_bad
        add di, 14
        mov cx, 20
.refzero:
        cmp byte [fs:di], 0
        jne kv_bad
        inc di
        loop .refzero
.next: inc word [kv_stream_index]
        jmp .record
.done:
        cmp word [kv_stream_version], 2
        jne kv_ok
        mov ax, [kv_seen_tags]
        cmp ax, [kv_tags]
        jne kv_bad
        mov ax, [kv_seen_payload]
        cmp ax, [v2_ext+8]
        jne kv_bad
        jmp kv_ok
.absent:
        test ax, ax
        jnz kv_bad
        mov cx, [fs:KV_FX+2250]
        mov si, KV_FX+3532
.inline:
        jcxz .inline_done
        cmp word [fs:si], 32
        ja kv_bad
        add si, 34
        loop .inline
.inline_done:
        jmp kv_ok

; Separate HP-only host-dispatch capability check, AFTER kv_validate succeeded
; on ACTIVE or PREPARED authority. PREPARED READY re-enters .ecl_return with
; frozen paused FX for a missing-result retry, so its host effects need the
; same policy. COMPLETED is not a READY state. This never rejects otherwise
; valid archival FX formats.
; Reject before READY; caller keeps ACTIVE authority on CF and must not route
; those effects through CoK/DoK mutation schemas or restart the completed ECL.
;
; GBBOOT .ecl_return applies DAMAGE before menu/combat dispatch. Its fixed
; writer and CCHOST /D both require 410-byte GBPR1/2, not Secret GBPR3/440.
; CCECL 27/28 record TREASURE/ROB without Secret currency/inventory ownership;
; 41's XP writers only admit roster IDs1/2; GBBOOT NPC joins only game_dqk.
; ECL_CLOCK34 is captured GBCL state: GBPS1 has no owned timers, GBBOOT timer
; sync admits only CoK +seed>=5. SPELL3B is a query, PROTECTION3C is a no-op,
; not an externally applied affect mutation. Presentation and VM changes stay
; in the atomically owned effect. No world-save or complete party support claim.
kn_check_dispatch:
kv_check_dispatch:
        mov word [kv_blocked_opcode], 0
        cmp word [kr_header+6], 1
        je kv_bad
        cmp word [kr_header+6], 2
        ja kv_bad
        cmp word [kr_header+6], 0
        jne .owned_stream
        cmp word [kr_header+20],3
        je .owned_stream
        test word [fs:KV_FX+6], 0100h ; PREPARED does not snapshot paused GBS
        jnz kv_bad
.owned_stream:
kv_check_readonly_dispatch:
        ; Shared row policy after independent closed-file inspection. This
        ; entry grants no durable ACTIVE/INITIAL ownership or publication.
        mov word [kv_blocked_opcode], 0
        cmp word [fs:KV_FX+82], 0
        jne .npc
        cmp dword [kr_header+56], 0
        jne .stream
        mov word [kv_stream_index], 0
.inline:
        mov ax, [kv_stream_index]
        cmp ax, [fs:KV_FX+2250]
        jae kv_ok
        imul si, ax, 20
        mov ax, [fs:KV_FX+2252+si]
        call .opcode
        jc kv_bad
        inc word [kv_stream_index]
        jmp .inline
.stream:
        mov word [kv_stream_index], 0
.record:
        mov ax, [kv_stream_index]
        cmp ax, [kv_stream_count]
        jae kv_ok
        movzx eax, ax
        imul eax, eax, 54
        add eax, 8
        add eax, [kr_offsets+32]
        mov cx, 2
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        mov ax, [kc_buf]
        call .opcode
        jc kv_bad
        inc word [kv_stream_index]
        jmp .record
.npc:  mov ax, 36h
        jmp .blocked
.opcode:
        cmp ax, 27h                    ; TREASURE
        je .blocked
        cmp ax, 28h                    ; ROB
        je .blocked
        cmp ax, 2eh                    ; DAMAGE
        je .blocked
        cmp ax, 36h                    ; ADD_NPC
        je .blocked
        cmp ax, 41h                    ; AWARD_XP
        je .blocked
        clc
        ret

.blocked:
        mov [kv_blocked_opcode], ax
        stc
        ret

; Kind1/2 COMPLETED inputs have no HP mutation. Validate the exact frozen
; GBMO2 answer against the pending v15 identity without consuming the token,
; or GBBOOT's canonical empty-combat victory outcome against a no-encounter v9 pause.
kv_advance_outcome:
        mov eax, [kr_offsets+24]
        mov cx, [kr_header+48]
        cmp word [kr_header+20], 1
        je .menu
        cmp cx, 9
        jne kv_bad
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        mov si, kv_empty_victory
        mov di, kc_buf
        push ds
        pop es
        mov cx, 9
        repe cmpsb
        jne kv_bad
        jmp kv_ok
.menu: cmp cx, 18
        jne kv_bad
        mov di, kc_buf
        call kc_read_at
        jc kv_bad
        cmp dword [kc_buf], 'GBMO'
        jne kv_bad
        cmp word [kc_buf+4], 2
        jne kv_bad
        mov ax, [kv_menu_count]
        cmp ax, [kc_buf+8]
        jne kv_bad
        mov ax, [kc_buf+6]
        cmp word [kv_menu_opcode], 39h
        jne .ordinary
        cmp ax, 0ffffh
        jne .who_selected
        cmp word [fs:KV_FX+5940], 1
        je kv_bad
        jmp .identity
.who_selected:
        mov dx, ax
        inc dx
        cmp word [fs:KV_FX+5940], 1
        jne kv_bad
        cmp dx, [fs:KV_FX+5942]
        jne kv_bad
.ordinary:
        cmp word [kv_menu_opcode], 0fh
        jne .bounded
        cmp word [kv_menu_count], 0
        je .identity
.bounded:
        cmp ax, [kv_menu_count]
        jae kv_bad
.identity:
        cmp word [kv_menu_opcode], 10h
        jne .id_fields
        test ax, ax                 ; CCMENU commits GBRS then token choice0
        jnz kv_bad
        mov word [kv_string_bank], KV_FX
        call kv_read_committed_text
        jc kv_bad
.id_fields:
        mov si, kc_buf+10
        mov di, KV_FX+5766
        mov cx, 8
.byte: mov al, [si]
        cmp al, [fs:di]
        jne kv_bad
        inc si
        inc di
        loop .byte
        jmp kv_ok

; Compare old validated ACTIVE menu FS:40000 and live committed menu
; FS:32000. Non-string menus are byte-exact. INPUT_STRING may ONLY perform
; CCMENU commit_string's ordered key update/append and uppercase text+NUL.
; FS:16000..21931 is disposable simulation scratch; FS inputs/GS unchanged.
kn_check_menu_banks:
        cld
        cmp word [fs:KV_FX+5760], 39h
        je .who
        cmp word [fs:KV_FX+5760], 10h
        je .string
        mov si, KV_FX
        mov di, 32000
        call kv_menu_bank_length
        jmp .compare
.who:
        mov bp, 32000
        call kv_selection
        jc kv_bad
        cmp word [fs:32000+5940], 1
        je .who_copy
        mov ax, [fs:KV_FX+5940]
        cmp ax, [fs:32000+5940]
        jne kv_bad
        cmp word [fs:KV_FX+5942], 0
        jne kv_bad
.who_copy:
        push fs
        pop es
        mov si, KV_FX
        mov di, 16000
        call kv_menu_bank_length
        fs rep movsb
        mov eax, [fs:32000+5782]
        mov [fs:16000+5782], eax
        mov eax, [fs:32000+5940]
        mov [fs:16000+5940], eax
        mov si, 16000
        mov di, 32000
        call kv_menu_bank_length
        jmp .compare
.string:
        mov word [kv_string_bank], 32000
        call kv_read_committed_text
        jc kv_bad
        push fs
        pop es
        mov si, KV_FX
        mov di, 16000
        call kv_menu_bank_length
        fs rep movsb
        cmp word [fs:16000+196], 512
        ja kv_bad
        mov word [kv_string_index], 0
        mov bx, [fs:KV_FX+5756]
.commit:
        mov cx, [fs:16000+196]
        xor si, si
.find_old:
        jcxz .append
        cmp bx, [fs:16000+198+si]
        je .store
        add si, 2
        loop .find_old
.append:
        cmp word [fs:16000+196], 512
        jae kv_bad
        mov [fs:16000+198+si], bx
        inc word [fs:16000+196]
.store:
        mov di, [kv_string_index]
        movzx ax, byte [kv_string+di]
        mov [fs:16000+1222+si], ax
        cmp di, [kv_string_length]
        jae .committed
        inc word [kv_string_index]
        inc bx
        jmp .commit
.committed:
        mov si, 16000
        mov di, 32000
        call kv_menu_bank_length
.compare:
        mov al, [fs:si]
        cmp al, [fs:di]
        jne kv_bad
        inc si
        inc di
        loop .compare
        jmp kv_ok
kv_read_committed_text:
        mov bp, [kv_string_bank]
        cmp word [fs:bp+196], 512
        ja kv_bad
        mov word [kv_string_length], 0
        mov bx, [fs:KV_FX+5756]
.collect:
        call kv_find_string_cell
        jc kv_bad
        test ax, ax
        jz .terminator
        cmp ax, 32
        jb kv_bad
        cmp ax, 126
        ja kv_bad
        cmp ax, 'a'
        jb .character
        cmp ax, 'z'
        jbe kv_bad
.character:
        mov di, [kv_string_length]
        cmp di, [fs:KV_FX+5758]
        jae kv_bad
        cmp di, 255
        jae kv_bad
        mov [kv_string+di], al
        inc word [kv_string_length]
        inc bx
        jmp .collect
.terminator:
        cmp word [kv_string_length], 0
        je kv_bad
        mov di, [kv_string_length]
        mov byte [kv_string+di], 0
        jmp kv_ok

kv_find_string_cell:
        mov bp, [kv_string_bank]
        mov cx, [fs:bp+196]
        xor si, si
        xor dx, dx
        mov word [kv_string_value], 0
.search:
        jcxz .found
        cmp bx, [fs:bp+198+si]
        jne .next
        inc dx
        mov ax, [fs:bp+1222+si]
        mov [kv_string_value], ax
.next: add si, 2
        loop .search
.found:
        cmp dx, 1
        jne kv_bad
        mov ax, [kv_string_value]
        clc
        ret

%include "secretcontinuation_context.inc"

kv_paths times 1120 db 0
kv_context times 32 db 0
kv_seed times 150 db 0
kv_scratch times 112 db 0
kv_other_path times 112 db 0
kv_forbidden db '/ *?"<>|+,;=[]:',0
kv_devices db 'CON',0,'PRN',0,'AUX',0,'NUL',0,'CLOCK$',0,0
kv_seed_caps db 8,8,4,8,8,16,4
kv_empty_victory db 'victory',13,10
kv_outcome_party db 'party',13,10
kv_outcome_enemy db 'enemy',13,10
kv_outcome_draw db 'draw',13,10
kv_outcome_flee db 'flee',13,10
kv_outcomes dw kv_outcome_party,kv_outcome_enemy,kv_outcome_draw,kv_outcome_flee
kv_outcome_lengths dw 7,7,6,6
kv_derived_paths:
        times 6 dw kv_paths+112
        times 5 dw kv_paths+4*112
        times 5 dw kv_paths+7*112
        times 3 dw kv_paths+8*112
kv_derived_exts:
        db 'GSJ',0,'GSB',0,'GSN',0,'GST',0,'GSC',0,'GSD',0
        db 'IDN',0,'DOP',0,'GBS',0,'GBT',0,'GBP',0
        db 'IDN',0,'DOP',0,'GBS',0,'GBT',0,'GBP',0
        db 'GKT',0,'GKB',0,'GKO',0
kv_work_input db 'INPUT.EFX',0
kv_work_identity db 'INPUT.IDN',0
kv_work_seed db 'SEED.BIN',0
kv_work_outcome db 'A.OUT',0
kv_work_flow db 'CCFLOW.COM',0
kv_work_ecl db 'CCECL.COM',0
kv_work_gbr db 'GBR.EFX',0
kv_work_src db 'SRC.GLB',0
kv_work_src_temp db 'SRC.GNG',0
kv_work_src_backup db 'SRC.GOG',0
kv_work_stat db 'STAT.GSM',0
kv_work_who db 'W.GWN',0
kv_work_o db 'O.EFX',0
kv_work_ogs db 'O.GBS',0
kv_work_ogt db 'O.GBT',0
kv_work_ogp db 'O.GBP',0
kv_work_olda db 'OUTCOME.OUT',0
kv_work_oldo db 'OUTPUT.EFX',0
kv_work_oldgs db 'OUTPUT.GBS',0
kv_work_oldgt db 'OUTPUT.GBT',0
kv_work_oldgp db 'OUTPUT.GBP',0
kv_work_capture db 'CAPTURE.GSK',0
kv_work_names dw kv_work_who,kv_work_o,kv_work_ogs,kv_work_ogt,kv_work_ogp,kv_work_olda,kv_work_oldo,kv_work_oldgs,kv_work_oldgt,kv_work_oldgp,kv_work_stat,kv_work_gbr,kv_work_input,kv_work_identity,kv_work_seed,kv_work_outcome,kv_work_flow,kv_work_ecl,kv_work_src,kv_work_src_temp,kv_work_src_backup,kv_work_capture
kv_work_names_end:
kv_load_off dd 0
kv_load_left dw 0
kv_load_dest dw 0
kv_load_chunk dw 0
kv_path_start dw 0
kv_component dw 0
kv_ext_start dw 0
kv_index dw 0
kv_pending db 0
kv_fx_len dw 0
kv_area dw 0
kv_pc dw 0
kv_text_ptr dw 0
kv_source_len dd 0
kv_source_start dd 0
kv_members dw 0
kv_ptr_end dd 0
kv_previous dd 0
kv_table_start dd 0
kv_table_end dd 0
kv_table_len dd 0
kv_entries dw 0
kv_match dw 0
kv_menu_flags dw 0
kv_menu_dest dw 0
kv_menu_count dw 0
kv_menu_opcode dw 0
kv_yes_labels dw 0
kv_stream_base dd 0
kv_stream_len dd 0
kv_stream_version dw 0
kv_stream_count dw 0
kv_records_end dd 0
kv_tags dw 0
kv_payload_base dd 0
kv_terminal_start dw 0
kv_terminal_index dw 0
kv_stream_index dw 0
kv_seen_tags dw 0
kv_seen_payload dw 0
kv_blocked_opcode dw 0

kv_string times 256 db 0
kv_string_length dw 0
kv_string_index dw 0
kv_string_value dw 0

kv_string_bank dw 0

; BP is an FS effect bank with a complete v16 image; compare both identities.
kv_selection:
        cmp dword [fs:bp+5774], 'GBMS'
        jne kv_bad
        cmp dword [fs:bp+5932], 'GBSI'
        jne kv_bad
        cmp dword [fs:bp+5936], 00100001h
        jne kv_bad
        cmp word [fs:bp+5946], 0
        jne kv_bad
        mov ax, [fs:bp+5944]
        cmp ax, [kr_header+12]
        jne kv_bad
        mov ax, [fs:bp+5940]
        cmp ax, 2
        ja kv_bad
        cmp ax, [fs:bp+5784]
        jne kv_bad
        mov dx, [fs:bp+5942]
        cmp dx, [fs:bp+5782]
        jne kv_bad
        cmp ax, 1
        jne .null
        cmp dx, 1
        jb kv_bad
        cmp dx, [kr_header+12]
        ja kv_bad
        jmp kv_ok
.null: test dx, dx
        jnz kv_bad
        jmp kv_ok

kv_who_labels:
        mov di, [fs:KV_FX+5762]
        imul di, di, 20
        movzx ax, byte [fs:KV_FX+5792]
        cmp ax, [fs:KV_FX+2256+di]
        jne kv_bad
        mov si, KV_FX+5792
        movzx ax, byte [fs:si]
        inc si
        add si, ax
        xor bx, bx
.row:
        imul di, bx, 440
        add di, 17
        movzx cx, byte [gs:di]
        cmp cl, [fs:si]
        jne kv_bad
        inc si
        inc di
.byte:
        mov al, [gs:di]
        cmp al, [fs:si]
        jne kv_bad
        inc si
        inc di
        loop .byte
        inc bx
        cmp bx, [kr_header+12]
        jb .row
        jmp kv_ok

kv_menu_bank_length:
        mov cx, 5932
        cmp word [fs:KV_FX+4], 16
        jne .done
        mov cx, 5948
.done: ret

kv_initial_origin dw 0
