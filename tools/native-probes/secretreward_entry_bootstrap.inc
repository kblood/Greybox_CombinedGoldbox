; PRIVATE read-only diagnostic. No RW/output/child/READY calls.
; Called by private startup after real KN allocation; DS=ES, actual final stack.
; Descriptor data is snapped before KV scratch; no caller output/state inputs.
eb_run:
        cmp word [kc_fh],0ffffh
        jne eb_bad
        cmp word [kn_peer_fh],0ffffh
        jne eb_bad
        cmp word [kc_probe_fh],0ffffh
        jne eb_bad
        mov word [eb_gate],1
        mov si,81h
        call kn_skip
        mov di,eb_descriptor_path
        call kn_token
        jc eb_bad
        call kn_skip
        cmp byte [si],13
        jne eb_bad
        mov si,eb_descriptor_path
        call eb_canonical
        jc eb_bad
        mov dx,eb_descriptor_path
        call kc_open
        jc eb_bad
        cmp dword [kc_extent],448
        jne eb_close_bad
        xor eax,eax
        mov cx,448
        mov di,eb_anchors
        call kc_read_at
        jc eb_close_bad
        call kc_close
        jc eb_bad
        mov word [eb_index],0
.paths:
        mov si,[eb_index]
        add si,eb_anchors
        call eb_canonical
        jc eb_bad
        add word [eb_index],112
        cmp word [eb_index],448
        jb .paths
        ; Pairwise descriptor aliases, including the descriptor itself.
        mov word [eb_index],0
.outer:
        cmp word [eb_index],0
        je .descriptor_alias
        mov word [eb_other],0
.inner:
        mov si,[eb_index]
        add si,eb_anchors
        mov di,[eb_other]
        add di,eb_anchors
        call kc_disjoint
        jc eb_bad
        add word [eb_other],112
        mov ax,[eb_other]
        cmp ax,[eb_index]
        jb .inner
.descriptor_alias:
        mov si,[eb_index]
        add si,eb_anchors
        mov di,eb_descriptor_path
        call kc_disjoint
        jc eb_bad
        add word [eb_index],112
        cmp word [eb_index],448
        jb .outer
        mov si,eb_anchors
        mov di,kn_authority
        call kn_copy_path
        mov si,eb_anchors+224
        mov di,kn_expected_source
        call kn_copy_path
        call eb_origin
        jc eb_bad
        mov word [eb_gate],5
        call kc_close
        jc eb_bad
        mov dx,eb_anchors+336
        call kc_open
        jc eb_bad
        xor eax,eax
        mov edx,[kc_extent]
        call ru_validate
        jc eb_close_bad
        mov si,ru_descriptor
        mov di,eb_resource
        mov cx,16
        rep movsw
        mov eax,[ru_member_start]
        mov cx,756
        mov di,eb_member
        call ru_read
        jc eb_close_bad
        call kc_close
        jc eb_bad
        ; Re-admit origin after resource work, binding live files again.
        call eb_origin
        jc eb_bad
        mov word [eb_gate],6
        mov eax,[kr_offsets+4]
        mov cx,[kr_header+28]
        xor di,di
        push gs
        pop es
        call kv_load_bank
        pushf
        push ds
        pop es
        popf
        jc eb_close_bad
        mov ax,[kr_header+28]
        mov [sr_length],ax
        call sr_validate
        jc eb_close_bad
        call kc_close
        jc eb_bad
        mov dx,stacktop
        call rz_begin
        jc eb_bad
        call rz_eligible_share
        jc eb_bad
        xor al,al
        mov cx,[sr_count]
        mov dx,[eb_flags]
        mov bx,[eb_selected]
        mov si,eb_member
        call rt_init
        jc eb_bad
        mov word [eb_gate],0
        clc
        ret
eb_canonical:
        push si
        mov di,eb_path_copy
        mov cx,56
        rep movsw
        pop si
        push si
        call kv_path
        pop si
        jc eb_bad
        mov di,eb_path_copy
        mov cx,56
        repe cmpsw
        jne eb_bad
        clc
        ret

eb_origin:
        mov word [eb_gate],2
        mov dx,eb_anchors
        call kr_index
        jc eb_bad
        call kv_validate
        jc eb_close_bad
        cmp word [kr_header+6],2
        jne eb_close_bad
        cmp word [kr_header+18],1
        jne eb_close_bad
        cmp word [kr_header+20],1
        jne eb_close_bad
        cmp word [kv_area],16
        jne eb_close_bad
        cmp word [kv_pc],6940
        jne eb_close_bad
        cmp word [fs:KV_FX+4],16
        jne eb_close_bad
        cmp word [fs:KV_FX+8],2
        jne eb_close_bad
        cmp word [fs:KV_FX+120],13
        jne eb_close_bad
        cmp word [kv_menu_opcode],2bh
        jne eb_close_bad
        cmp word [kv_menu_count],1
        jne eb_close_bad
        cmp word [fs:KV_FX+130],1
        jne eb_close_bad
        cmp word [fs:KV_FX+132],024ah
        jne eb_close_bad
        ; ACTIVE ENTRY precedes the TREASURE dispatch. The exact immediate
        ; instruction sequence below is the origin proof; rv_check_gift_dispatch
        ; belongs to later completed/rejoin snapshots, not this ACTIVE cursor.
        mov ax,[fs:KV_FX+5940]
        mov [eb_flags],ax
        mov ax,[fs:KV_FX+5942]
        mov [eb_selected],ax
        mov word [eb_gate],3
        mov si,kv_paths
        mov di,eb_anchors+224
        mov cx,56
        repe cmpsw
        jne eb_close_bad
        mov si,kv_paths+112
        mov di,eb_anchors+112
        mov cx,56
        repe cmpsw
        jne eb_close_bad
        mov si,kv_paths+8*112
        mov di,eb_anchors
        mov cx,56
        repe cmpsw
        jne eb_close_bad
        ; ITEM must be the exact sibling of admitted ECL; not an arbitrary asset.
        mov si,eb_anchors+224
        mov di,eb_item_path
        call kn_copy_path
        mov si,eb_item_path
        mov di,si
.directory:
        lodsb
        test al,al
        jz .item
        cmp al,5ch
        jne .directory
        mov di,si
        jmp .directory
.item:
        mov cx,eb_item_path+112
        sub cx,di
        cmp cx,9
        jb eb_close_bad
        push di
        xor ax,ax
        rep stosb
        pop di
        mov dword [di],'ITEM'
        mov dword [di+4],'.GLB'
        mov si,eb_item_path
        mov di,eb_anchors+336
        mov cx,56
        repe cmpsw
        jne eb_close_bad
        mov word [eb_index],0
.aliases:
        mov si,eb_anchors+336
        mov di,[eb_index]
        add di,kv_paths
        call kc_disjoint
        jc eb_close_bad
        add word [eb_index],112
        cmp word [eb_index],1120
        jb .aliases
        mov byte [kn_work_create],0
        call kn_workspace
        jc eb_close_bad
        mov eax,[kr_offsets+16]
        add eax,16
        mov ecx,[kr_header+40]
        sub ecx,16
        xor edx,edx
        mov di,eb_anchors+224
        call kn_compare_range_file
        jc eb_close_bad
        mov eax,[kr_offsets+4]
        movzx ecx,word [kr_header+28]
        xor edx,edx
        mov di,eb_anchors+112
        call kn_compare_range_file
        jc eb_close_bad
        ; Exact source instruction chunk, independently pinned from source.
        movzx eax,word [kv_match]
        shl eax,2
        add eax,16
        add eax,[kv_source_start]
        jc eb_close_bad
        mov cx,8
        mov di,rv_pointer
        call kc_read_at
        jc eb_close_bad
        mov eax,[rv_pointer]
        call ru_be32
        add eax,[kv_source_start]
        jc eb_close_bad
        add eax,024ah
        jc eb_close_bad
        mov cx,19
        mov di,rv_source_sequence
        call kc_read_at
        jc eb_close_bad
        mov si,rv_source_sequence
        mov di,rv_expected_sequence
        mov cx,19
        repe cmpsb
        jne eb_close_bad
        mov word [eb_gate],4
        ; Read one extra byte: neither trailing answer nor missing bytes pass.
        mov dx,kv_paths+6*112
        mov ax,3d00h
        int 21h
        jc eb_close_bad
        mov [kn_peer_fh],ax
        mov bx,ax
        mov dx,eb_answer
        mov cx,19
        mov ah,3fh
        int 21h
        jc .answer_bad
        cmp ax,18
        jne .answer_bad
        call kn_peer_close
        jc eb_close_bad
        cmp dword [eb_answer],'GBMO'
        jne eb_close_bad
        cmp dword [eb_answer+4],2
        jne eb_close_bad
        cmp word [eb_answer+8],1
        jne eb_close_bad
        mov si,eb_answer+10
        mov di,KV_FX+5766
        mov cx,4
.identity:
        lodsw
        cmp ax,[fs:di]
        jne eb_close_bad
        add di,2
        loop .identity
        clc
        ret
.answer_bad:
        call kn_peer_close
eb_close_bad:
        call kc_close
eb_bad:
        stc
        ret

eb_gate dw 0
eb_index dw 0
eb_other dw 0
eb_flags dw 0
eb_selected dw 0
eb_descriptor_path times 112 db 0
eb_anchors times 448 db 0
eb_path_copy times 112 db 0
eb_item_path times 112 db 0
eb_answer times 19 db 0
eb_resource times 32 db 0
eb_member times 756 db 0
eb_end:
