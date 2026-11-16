; PRIVATE post-ENTRY producer-input adapter. No action2/producer/recovery/UI.
ea_diagnostic:
        mov si,81h
        call kn_skip
        mov di,kn_descriptor
        call kn_token
        jc ea_bad
        call kn_skip
        cmp byte [si],13
        jne ea_bad
        call kn_alloc
        jc ea_bad
        mov dx,kn_descriptor
        call kc_open
        jc ea_bad
        cmp dword [kc_extent],448
        jne ea_close_bad
        xor eax,eax
        mov cx,448
        mov di,rw_paths
        call kc_read_at
        jc ea_close_bad
        call kc_close
        jc ea_bad
        mov si,rw_paths
        mov di,rw_paths+112
        mov bx,rw_paths+224
        mov bp,rw_paths+336
        mov dx,stacktop
ea_invoke:
        call rc_invoke
        jc ea_bad
        cmp word [rc_extent],stacktop
        jb ea_bad
        mov dx,rc_anchors
        call rr_index
        jc ea_bad
        cmp word [rr_header+6],1
        jne ea_close_bad
        cmp dword [rr_header+24],0
        jne ea_close_bad
        cmp dword [rr_header+40],1
        jne ea_close_bad
        cmp dword [rr_header+44],0
        jne ea_close_bad
        mov dx,[rc_extent]
        call rv_record_relation
        jc ea_close_bad
        call rc_bind_live
        jc ea_close_bad
        call rj_match_live
        jc ea_close_bad
        mov dx,rv_paths+6*112
        call rc_absent
        jc ea_close_bad
        call rc_names_only
        jc ea_close_bad
        mov word [ea_index],0
.namespace:
        mov bx,[ea_index]
        cmp bx,10 ; unrelated GRA is retained and never probed
        je .next
        mov dx,[rc_reserved+bx]
        call rc_absent
        jc ea_close_bad
.next:
        add word [ea_index],2
        cmp word [ea_index],16
        jb .namespace
        call kn_no_transaction
        jc ea_close_bad
        mov si,rv_paths+9*112
        mov di,kn_capture_input_path
        mov bx,kn_capture_name
        call kn_join
        jc ea_close_bad
        mov dx,kn_capture_input_path
        call rc_absent
        jc ea_close_bad
        ; RV admitted the owner; independently index its exact nested origin.
        mov eax,[rr_offsets]
        mov edx,[rr_lengths]
        call kc_view_begin
        jc ea_close_bad
        call kr_index_open
        jc ea_view_bad
        call kv_validate
        jc ea_view_bad
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
        ; Four immutable physical source ranges. Peer offsets are cumulative.
        mov eax,64
        mov ecx,[kr_offsets+8]
        sub ecx,eax
        mov edx,64
        mov di,rw_specs
        call ea_range
        mov eax,[kr_offsets+28]
        mov ecx,[kr_header+52]
        call ea_range
        mov eax,[kr_offsets+12]
        mov ecx,[kr_header+40]
        add ecx,150
        call ea_range
        mov eax,[rr_offsets+4]
        mov [di],eax
        mov dword [di+4],18
        mov [di+8],edx
        call kc_view_end
        jc ea_close_bad
        ; KV overwrites kv_other_path with successor IDN scratch. Derive the
        ; canonical GRC again into dedicated dead CAPTURE-path storage and
        ; independently recheck disjointness/absence after that clobber.
        mov si,rc_anchors
        mov di,kn_capture_input_path
        call kn_copy_path
        mov si,kn_capture_input_path
        call kn_extension
        jc ea_close_bad
        mov dword [di],'GRC'
        mov si,kn_capture_input_path
        call rc_reserved_disjoint
        jc ea_close_bad
        mov dx,kn_capture_input_path
        call rc_absent
        jc ea_close_bad
        mov dx,kn_capture_input_path
        xor cx,cx
        mov ax,5b00h
        int 21h
        jc ea_close_bad
        mov [kw_out],ax
        mov dx,kw_header
        mov cx,64
        call kw_write
        jc ea_write_bad
        mov word [ea_index],0
.copy:
        mov si,[ea_index]
        mov eax,[rw_specs+si]
        mov edx,[rw_specs+si+4]
        mov bx,[kw_out]
        mov byte [kc_mode],0
        call kc_transfer
        jc ea_write_bad
        add word [ea_index],12
        cmp word [ea_index],48
        jb .copy
        ; Header lengths were final before writing. One checked owned close;
        ; failure retains kw_out and does not license a warm re-entry.
        mov bx,[kw_out]
        mov ah,3eh
        int 21h
        jc ea_close_bad
        mov word [kw_out],0ffffh
        ; Exact header and complete source relation before KR/KV readmission.
        mov dx,kn_capture_input_path
        mov di,kc_cmp
        mov cx,64
        call kn_read_small
        jc ea_close_bad
        mov si,kw_header
        mov di,kc_cmp
        mov cx,32
        repe cmpsw
        jne ea_close_bad
        mov byte [kn_peer_exact],0
        mov word [ea_index],0
.compare:
        mov si,[ea_index]
        mov eax,[rw_specs+si]
        mov ecx,[rw_specs+si+4]
        mov edx,[rw_specs+si+8]
        cmp si,36
        jne .peer
        mov byte [kn_peer_exact],1 ; final range ends at exact EOF
.peer:
        mov di,kn_capture_input_path
        call kn_compare_range_file
        jc ea_close_bad
        add word [ea_index],12
        cmp word [ea_index],48
        jb .compare
        call kc_close
        jc ea_bad
        mov si,kn_capture_input_path
        mov di,kw_stage
        call kn_copy_path
        mov dx,kw_stage
        call kr_index
        jc ea_bad
        call kv_validate
        jc ea_close_bad
        cmp word [kr_header+6],1
        jne ea_close_bad
        cmp word [kr_header+20],1
        jne ea_close_bad
        ; kn_admit also assumes a frontend response path. This private adapter
        ; has none; perform its complete frozen-source relation explicitly.
        mov eax,[kr_offsets+16]
        add eax,16
        mov ecx,[kr_header+40]
        sub ecx,16
        xor edx,edx
        mov di,rc_anchors+224
        call kn_compare_range_file
        jc ea_close_bad
        ; Fresh KR/KV proves roster structure; rebind its complete identity
        ; after reopening, since a valid foreign roster can arrive after the
        ; earlier owner-range comparisons without invalidating KR/KV.
        mov eax,[kr_offsets+4]
        mov ecx,[kr_header+28]
        xor edx,edx
        mov di,rc_anchors+112
        call kn_compare_range_file
        jc ea_close_bad
        call kc_close
        ret
ea_range:
        add eax,[rr_offsets]
        mov [di],eax
        mov [di+4],ecx
        mov [di+8],edx
        add edx,ecx
        add di,12
        ret
ea_write_bad:
        call kw_fail
ea_close_bad:
        call kc_close
ea_bad:
        stc
        ret
ea_view_bad:
        call kc_view_end
        jmp ea_close_bad
ea_index dw 0
ea_end:
