; PRIVATE phase0 kind1 CAPTURE diagnostic; no journal/action/owner promotion.
ec_diagnostic:
        call ec_guard
        jc ec_bad
        mov si,81h
        call kn_skip
        mov di,kn_descriptor
        call kn_token
        jc ec_bad
        call kn_skip
        mov di,kn_prefix
        call kn_token
        jc ec_bad
        call kn_skip
        mov di,kn_response
        call kn_token
        jc ec_bad
        call kn_skip
        cmp byte [si],13
        jne ec_bad
        call kn_alloc
        jc ec_bad
        mov dx,kn_descriptor
        call kc_open
        jc ec_bad
        cmp dword [kc_extent],448
        jne ec_close_bad
        xor eax,eax
        mov cx,448
        mov di,rw_paths
        call kc_read_at
        jc ec_close_bad
        call kc_close
        jc ec_bad
        mov si,rw_paths
        mov di,rw_paths+112
        mov bx,rw_paths+224
        mov bp,rw_paths+336
        mov dx,stacktop
ec_invoke:
        call ec_guard
        jc ec_bad
        call rc_invoke
        jc ec_bad
        cmp word [rc_extent],stacktop
        jb ec_bad
        mov ax,cs
        mov bx,ds
        cmp ax,bx
        jne ec_bad
        mov bx,ss
        cmp ax,bx
        jne ec_bad
        cmp sp,stacktop-512
        jb ec_bad
        cmp sp,stacktop
        jae ec_bad
        mov dx,rc_anchors
        call rr_index
        jc ec_bad
        cmp word [rr_header+6],1
        jne ec_close_bad
        cmp dword [rr_header+24],0
        jne ec_close_bad
        cmp dword [rr_header+40],1
        jne ec_close_bad
        cmp dword [rr_header+44],0
        jne ec_close_bad
        mov dx,[rc_extent]
        call rv_record_relation
        jc ec_close_bad
        call rc_bind_live
        jc ec_close_bad
        call rj_match_live
        jc ec_close_bad
        mov dx,rv_paths+6*112
        call rc_absent
        jc ec_close_bad
        mov si,kn_prefix
        call rc_capture_path
        jc ec_close_bad
        mov si,kn_response
        call rc_capture_path
        jc ec_close_bad
        call kn_response_aliases
        jc ec_close_bad
        mov si,kn_response
        mov di,rc_anchors+336
        call kc_disjoint
        jc ec_close_bad
        call rc_names_only
        jc ec_close_bad
        mov word [ec_index],0
.namespace:
        mov bx,[ec_index]
        cmp bx,10 ; unrelated GRA preserved; exact GRC admitted below
        je .next
        cmp bx,14
        je .next
        mov dx,[rc_reserved+bx]
        call rc_absent
        jc ec_close_bad
.next:
        add word [ec_index],2
        cmp word [ec_index],16
        jb .namespace
        call kn_no_transaction
        jc ec_close_bad
        mov si,kv_other_path
        mov di,kn_descriptor ; pinned GRC, distinct from capture-input buffer
        call kn_copy_path
        call ec_tools
        jc ec_close_bad
        mov eax,[rr_offsets]
        mov edx,[rr_lengths]
        call kc_view_begin
        jc ec_close_bad
        call kr_index_open
        jc ec_view_bad
        call kv_validate
        jc ec_view_bad
        mov si,kr_header
        mov di,kw_header
        mov cx,32
        rep movsw
        mov word [kw_header+6],1
        mov word [kw_header+20],1
        mov eax,[kr_header+52]
        mov [kw_header+32],eax
        mov di,kw_header+44
        xor eax,eax
        mov cx,5
        rep stosd
        mov dword [kw_header+48],18
        mov eax,64
        mov ecx,[kr_offsets+8]
        sub ecx,eax
        mov edx,64
        mov di,rw_specs
        call ec_range
        mov eax,[kr_offsets+28]
        mov ecx,[kr_header+52]
        call ec_range
        mov eax,[kr_offsets+12]
        mov ecx,[kr_header+40]
        add ecx,150
        call ec_range
        mov eax,[rr_offsets+4]
        mov [di],eax
        mov dword [di+4],18
        mov [di+8],edx
        call kc_view_end
        jc ec_close_bad
        call kc_close
        jc ec_bad
ec_grc_reopen:
        mov dx,kn_descriptor
        call kr_index
        jc ec_bad
        call kv_validate
        jc ec_close_bad
        mov si,kw_header
        mov di,kr_header
        mov cx,32
        repe cmpsw
        jne ec_close_bad
        mov byte [kn_peer_exact],0 ; peer is outer owner, not standalone GRC
        mov word [ec_index],0
.relation:
        mov si,[ec_index]
        mov eax,[rw_specs+si+8] ; current GRC offset
        mov ecx,[rw_specs+si+4]
        mov edx,[rw_specs+si]   ; admitted owner's physical frozen offset
        mov di,rc_anchors
        call kn_compare_range_file
        jc ec_close_bad
        add word [ec_index],12
        cmp word [ec_index],48
        jb .relation
        mov byte [kn_peer_exact],1
        mov eax,[kr_offsets+4]
        mov ecx,[kr_header+28]
        xor edx,edx
        mov di,rc_anchors+112
        call kn_compare_range_file
        jc ec_close_bad
        mov eax,[kr_offsets+16]
        add eax,16
        mov ecx,[kr_header+40]
        sub ecx,16
        xor edx,edx
        mov di,rc_anchors+224
        call kn_compare_range_file
        jc ec_close_bad
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
ec_range:
        add eax,[rr_offsets]
        mov [di],eax
        mov [di+4],ecx
        mov [di+8],edx
        add edx,ecx
        add di,12
        ret
ec_tools:
        mov word [ec_tool_index],0
.tool:
        mov bx,[ec_tool_index]
        mov bx,[rc_tool_names+bx]
        mov si,kn_prefix
        mov di,kn_child_path
        call kn_join
        jc ec_bad
        mov word [ec_index],0
.protected:
        mov bx,[ec_index]
        imul di,bx,112
        add di,rv_paths
        mov si,kn_child_path
        call kc_disjoint
        jc ec_bad
        inc word [ec_index]
        cmp word [ec_index],11
        jb .protected
        mov si,kn_child_path
        mov di,kn_response
        call kc_disjoint
        jc ec_bad
        mov word [ec_index],0
.workspace:
        mov bx,[ec_index]
        mov bx,[kn_alias_work_names+bx]
        test bx,bx
        jz .probe
        mov si,rv_paths+9*112
        mov di,kn_marker_actual
        call kn_join
        jc ec_bad
        mov si,kn_child_path
        mov di,kn_marker_actual
        call kc_disjoint
        jc ec_bad
        add word [ec_index],2
        jmp .workspace
.probe:
        mov dx,kn_child_path
        call kc_probe
        jc ec_bad
        cmp ax,1
        jne ec_bad
        add word [ec_tool_index],2
        cmp word [ec_tool_index],4
        jne .advance
        add word [ec_tool_index],2 ; skip unsupported CCHOST
.advance:
        cmp word [ec_tool_index],8
        jb .tool
        clc
        ret
ec_view_bad:
        call kc_view_end
ec_close_bad:
        call kc_close
ec_bad:
        stc
        ret
ec_guard:
        push si
        push cx
        push bx
        cmp byte [kn_cwd_owned],0
        jne .bad
        cmp byte [kn_capture_mode],0
        jne .bad
        mov si,ec_handles
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
ec_index dw 0
ec_tool_index dw 0
ec_handles dw kc_fh,kn_peer_fh,kc_probe_fh,kw_out,kw_live_fh
ec_end:
