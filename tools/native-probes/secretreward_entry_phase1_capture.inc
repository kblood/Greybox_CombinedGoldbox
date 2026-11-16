; PRIVATE phase1 kind1 CAPTURE diagnostic; no journal/action/owner promotion.
ecp_diagnostic:
        call ecp_guard
        jc ecp_bad
        mov si,81h
        call kn_skip
        mov di,kn_descriptor
        call kn_token
        jc ecp_bad
        call kn_skip
        mov di,kn_prefix
        call kn_token
        jc ecp_bad
        call kn_skip
        mov di,kn_response
        call kn_token
        jc ecp_bad
        call kn_skip
        cmp byte [si],13
        jne ecp_bad
        call kn_alloc
        jc ecp_bad
        mov dx,kn_descriptor
        call kc_open
        jc ecp_bad
        cmp dword [kc_extent],448
        jne ecp_close_bad
        xor eax,eax
        mov cx,448
        mov di,rw_paths
        call kc_read_at
        jc ecp_close_bad
        call kc_close
        jc ecp_bad
        mov si,rw_paths
        mov di,rw_paths+112
        mov bx,rw_paths+224
        mov bp,rw_paths+336
        mov dx,stacktop
ecp_invoke:
        call ecp_guard
        jc ecp_bad
        call rc_invoke
        jc ecp_bad
        cmp word [rc_extent],stacktop
        jb ecp_bad
        mov ax,cs
        mov bx,ds
        cmp ax,bx
        jne ecp_bad
        mov bx,ss
        cmp ax,bx
        jne ecp_bad
        cmp sp,stacktop-512
        jb ecp_bad
        cmp sp,stacktop
        jae ecp_bad
        mov dx,rc_anchors
        call rr_index
        jc ecp_bad
        cmp word [rr_header+6],1
        jne ecp_close_bad
        cmp dword [rr_header+24],00010001h
        jne ecp_close_bad
        cmp dword [rr_header+40],2
        jne ecp_close_bad
        cmp dword [rr_header+44],0
        jne ecp_close_bad
        mov dx,[rc_extent]
        call rv_record_relation
        jc ecp_close_bad
        call rc_bind_live
        jc ecp_close_bad
        call rj_match_live
        jc ecp_close_bad
        mov dx,rv_paths+6*112
        call rc_absent
        jc ecp_close_bad
        mov si,kn_prefix
        call rc_capture_path
        jc ecp_close_bad
        mov si,kn_response
        call rc_capture_path
        jc ecp_close_bad
        call kn_response_aliases
        jc ecp_close_bad
        mov si,kn_response
        mov di,rc_anchors+336
        call kc_disjoint
        jc ecp_close_bad
        call rc_names_only
        jc ecp_close_bad
        call ecp_namespace
        jc ecp_close_bad
        mov si,kv_other_path
        mov di,kn_descriptor ; pinned GRC, distinct from capture-input buffer
        call kn_copy_path
        call ecp_tools
        jc ecp_close_bad
        ; Dedicated storage survives KR/KV, RW/RZ and producer lifetimes.
        mov eax,[rr_offsets+8]
        mov [ecp_section2],eax
        mov eax,[rr_lengths+8]
        mov [ecp_section2+4],eax
        call kc_close
        jc ecp_bad
ecp_grc_reopen:
        mov dx,kn_descriptor
        call kr_index
        jc ecp_bad
        call kv_validate
        jc ecp_close_bad
        cmp word [kr_header+6],1
        jne ecp_close_bad
        cmp word [kr_header+20],1
        jne ecp_close_bad
        mov ecx,[kc_extent]
        cmp ecx,[ecp_section2+4]
        jne ecp_close_bad
        xor eax,eax
        mov edx,[ecp_section2]
        mov di,rc_anchors
        mov byte [kn_peer_exact],0 ; owner contains complete section2
        call kn_compare_range_file
        jc ecp_close_bad
        mov byte [kn_peer_exact],1
        mov eax,[kr_offsets+4]
        mov ecx,[kr_header+28]
        xor edx,edx
        mov di,rc_anchors+112
        call kn_compare_range_file
        jc ecp_close_bad
        mov eax,[kr_offsets+16]
        add eax,16
        mov ecx,[kr_header+40]
        sub ecx,16
        xor edx,edx
        mov di,rc_anchors+224
        call kn_compare_range_file
        jc ecp_close_bad
        ; KR/KV and live comparisons may reuse reserved-path scratch.
        call ecp_namespace
        jc ecp_close_bad
        ; No caller-ready grant: the unchanged helper re-admits standalone
        ; input, P1, workspace and existing whole-receipt CAPTURE before
        ; workspace mutation or EXEC.
        mov dx,kn_descriptor
        call kn_capture_producer
        jnc .captured
        ; A child error can return before the helper's normal CWD restore.
        ; Preserve failure while attempting only that already-owned restore.
        pushf
        call kn_restore_cwd
        popf
.captured:
        ret
ecp_namespace:
        call rc_names_only
        jc ecp_bad
        mov word [ecp_index],0
.namespace:
        mov bx,[ecp_index]
        cmp bx,10 ; unrelated GRA preserved; exact GRC admitted below
        je .next
        cmp bx,14
        je .next
        mov dx,[rc_reserved+bx]
        call rc_absent
        jc ecp_bad
.next:
        add word [ecp_index],2
        cmp word [ecp_index],16
        jb .namespace
        call kn_no_transaction
        jc ecp_bad
        clc
        ret
ecp_tools:
        mov word [ecp_tool_index],0
.tool:
        mov bx,[ecp_tool_index]
        mov bx,[rc_tool_names+bx]
        mov si,kn_prefix
        mov di,kn_child_path
        call kn_join
        jc ecp_bad
        mov word [ecp_index],0
.protected:
        mov bx,[ecp_index]
        imul di,bx,112
        add di,rv_paths
        mov si,kn_child_path
        call kc_disjoint
        jc ecp_bad
        inc word [ecp_index]
        cmp word [ecp_index],11
        jb .protected
        mov si,kn_child_path
        mov di,kn_response
        call kc_disjoint
        jc ecp_bad
        mov word [ecp_index],0
.workspace:
        mov bx,[ecp_index]
        mov bx,[kn_alias_work_names+bx]
        test bx,bx
        jz .probe
        mov si,rv_paths+9*112
        mov di,kn_marker_actual
        call kn_join
        jc ecp_bad
        mov si,kn_child_path
        mov di,kn_marker_actual
        call kc_disjoint
        jc ecp_bad
        add word [ecp_index],2
        jmp .workspace
.probe:
        mov dx,kn_child_path
        call kc_probe
        jc ecp_bad
        cmp ax,1
        jne ecp_bad
        add word [ecp_tool_index],2
        cmp word [ecp_tool_index],4
        jne .advance
        add word [ecp_tool_index],2 ; skip unsupported CCHOST
.advance:
        cmp word [ecp_tool_index],8
        jb .tool
        clc
        ret
ecp_view_bad:
        call kc_view_end
ecp_close_bad:
        call kc_close
ecp_bad:
        stc
        ret
ecp_guard:
        push si
        push cx
        push bx
        cmp byte [kn_cwd_owned],0
        jne .bad
        cmp byte [kn_capture_mode],0
        jne .bad
        mov si,ecp_handles
        mov cx,5
.owned:
        lodsw
        mov bx,ax
        cmp word [bx],0ffffh
        jne .bad
        loop .owned
        clc
        jmp .done
.bad:
        stc
.done:
        pop bx
        pop cx
        pop si
        ret
ecp_index dw 0
ecp_tool_index dw 0
ecp_handles dw kc_fh,kn_peer_fh,kc_probe_fh,kw_out,kw_live_fh
ecp_section2 times 2 dd 0
ecp_end:
