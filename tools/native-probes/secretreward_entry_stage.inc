; PRIVATE descriptor-only unpublished ENTRY staging. No public dispatch.
; Expected bytes come only from eb_run; framing must survive exact compare.
er_run:
        cmp word [rw_fh],0ffffh
        jne er_bad
        cmp word [ep_fh],0ffffh
        jne er_bad
        call eb_run
        jc er_bad
        mov eax,[kc_extent]
        mov [er_origin_length],eax
        mov si,kv_paths+6*112
        mov di,er_answer_path
        call kn_copy_path
        mov word [er_gate],1
        call er_namespace
        jc er_bad
        call er_frame
        jc er_bad
        mov word [er_gate],2
        ; No DOS/file call is permitted between this checked scan and writer.
        call er_namespace
        jc er_bad
        mov dx,er_output
        call rw_write
        jc er_bad
        mov word [er_gate],3
        mov dx,er_output
        call ep_compare
        jc er_bad
        ; Only now may semantic admission overwrite RW/RZ framing and banks.
        mov word [er_gate],4
        mov dx,er_output
        call rr_index
        jc er_bad
        mov dx,stacktop
        call rv_record_relation
        jc er_close_bad
        call er_live
        jc er_close_bad
        call kc_close
        jc er_bad
        mov word [er_gate],0
        clc
        ret

; Ten closed sibling names must be absent and disjoint from every protected
; origin path, ITEM, and descriptor. Existing bytes are never adopted/deleted.
er_namespace:
        mov word [er_index],0
.sibling:
        mov si,eb_anchors
        mov di,er_scan_path
        call kn_copy_path
        mov si,er_scan_path
        call kn_extension
        jc er_bad
        mov bx,[er_index]
        mov eax,[er_extensions+bx]
        mov [di],eax
        call er_aliases
        jc er_bad
        mov dx,er_scan_path
        call kc_probe
        jc er_bad
        test ax,ax
        jnz er_bad
        add word [er_index],4
        cmp word [er_index],40
        jb .sibling
        mov si,kv_paths+9*112
        mov di,er_scan_path
        mov bx,er_capture_name
        call kn_join
        jc er_bad
        mov dx,er_scan_path
        call kc_probe
        jc er_bad
        test ax,ax
        jnz er_bad
        clc
        ret
er_aliases:
        mov word [er_alias_index],0
.origin:
        mov si,er_scan_path
        mov di,[er_alias_index]
        add di,kv_paths
        call kc_disjoint
        jc er_bad
        add word [er_alias_index],112
        cmp word [er_alias_index],1120
        jb .origin
        mov si,er_scan_path
        mov di,eb_anchors+336
        call kc_disjoint
        jc er_bad
        mov si,er_scan_path
        mov di,eb_descriptor_path
        jmp kc_disjoint

er_frame:
        mov si,eb_anchors
        mov di,er_output
        call kn_copy_path
        mov si,er_output
        call kn_extension
        jc er_bad
        mov dword [di],'GRT'
        mov di,rw_header
        xor ax,ax
        mov cx,128
        rep stosw
        mov dword [rw_header],'GSK4'
        mov dword [rw_header+4],00020004h
        mov si,rr_constants
        mov cx,15
.constant:
        lodsw
        mov bx,ax
        lodsw
        mov [rw_header+bx],ax
        loop .constant
        mov dword [rw_header+28],00010001h
        mov dword [rw_header+40],1
        mov ax,[sr_count]
        mov [rw_header+48],ax
        movzx eax,word [rz_length]
        mov [rw_header+64],eax
        mov [rw_header+68],eax
        mov eax,[eb_resource+8]
        mov [rw_header+72],eax
        mov si,kv_paths
        mov di,rw_paths
        mov cx,560
        rep movsw
        mov si,eb_anchors+336
        mov di,rw_paths+1120
        call kn_copy_path
        mov si,kv_context
        mov di,rw_context
        mov cx,16
        rep movsw
        mov di,er_action
        xor ax,ax
        mov cx,64
        rep stosw
        mov dword [er_action],'GBRA'
        mov dword [er_action+4],00800001h
        mov word [er_action+18],1
        mov word [er_action+22],0ffffh
        mov word [er_action+28],1
        mov eax,[rt_state+12]
        mov [er_action+32],eax
        mov ax,[sr_count]
        mov [er_action+36],ax
        mov word [er_action+38],16
        mov word [er_action+40],6940
        mov word [ep_paths],eb_anchors
        mov word [ep_paths+2],er_answer_path
        mov word [ep_paths+4],eb_anchors+336
        mov eax,[er_origin_length]
        mov [ep_lengths],eax
        mov dword [ep_lengths+4],18
        mov eax,[eb_resource+8]
        mov [ep_lengths+8],eax
        mov si,eb_resource
        mov di,ep_descriptor
        mov cx,16
        rep movsw
        mov di,rw_specs
        xor ax,ax
        mov cx,96
        rep stosw
        xor bx,bx
        mov ax,3
        xor bp,bp
        xor edx,edx
        mov ecx,[er_origin_length]
        call er_spec
        mov bx,1
        mov bp,1
        mov ecx,18
        call er_spec
        mov bx,4
        mov bp,2
        mov ecx,[eb_resource+8]
        add ecx,32
        jc er_bad
        call er_spec
        mov bx,5
        mov ax,2
        mov bp,ds
        mov edx,eb_member
        mov ecx,756
        call er_spec
        mov bx,6
        mov bp,fs
        xor edx,edx
        movzx ecx,word [rz_length]
        call er_spec
        inc bx
        call er_spec
        mov bx,8
        mov bp,ds
        mov edx,rt_state
        mov ecx,160
        call er_spec
        inc bx
        call er_spec
        mov bx,10
        mov edx,rt_items
        mov ecx,960
        call er_spec
        inc bx
        call er_spec
        mov bx,12
        mov edx,rt_ledger
        mov ecx,1056
        call er_spec
        inc bx
        call er_spec
        mov bx,14
        mov edx,er_action
        mov ecx,128
        call er_spec
        jmp rw_preflight
er_spec:
        imul di,bx,12
        add di,rw_specs
        mov [di],ax
        mov [di+2],bp
        mov [di+4],edx
        mov [di+8],ecx
        ret

; Candidate is fully semantically admitted. Bind every current live input;
; comparisons read the candidate physical source and own a separate peer FD.
er_live:
        mov si,rv_paths
        mov di,eb_anchors+224
        mov cx,56
        repe cmpsw
        jne er_bad
        mov si,rv_paths+112
        mov di,eb_anchors+112
        mov cx,56
        repe cmpsw
        jne er_bad
        mov si,rv_paths+8*112
        mov di,eb_anchors
        mov cx,56
        repe cmpsw
        jne er_bad
        mov si,rv_paths+1120
        mov di,eb_anchors+336
        mov cx,56
        repe cmpsw
        jne er_bad
        mov si,rv_paths+6*112
        mov di,er_answer_path
        mov cx,56
        repe cmpsw
        jne er_bad
        mov si,rv_paths
        mov di,kv_paths
        mov cx,560
        rep movsw
        mov byte [kn_work_create],0
        call kn_workspace
        jc er_bad
        mov byte [kn_peer_exact],1
        mov byte [kn_bank_compare],0
        mov byte [kn_normalize],0
        mov eax,[rr_offsets]
        mov ecx,[rr_lengths]
        xor edx,edx
        mov di,eb_anchors
        call kn_compare_range_file
        jc er_bad
        mov eax,[rv_origin_p1_offset]
        movzx ecx,word [rv_origin_p1_length]
        xor edx,edx
        mov di,eb_anchors+112
        call kn_compare_range_file
        jc er_bad
        mov eax,[rv_origin_identity_offset]
        add eax,16
        jc er_bad
        mov ecx,[rv_origin_identity_length]
        sub ecx,16
        jc er_bad
        xor edx,edx
        mov di,eb_anchors+224
        call kn_compare_range_file
        jc er_bad
        mov eax,[rr_offsets+16]
        add eax,32
        jc er_bad
        mov ecx,[rr_lengths+16]
        sub ecx,32
        jc er_bad
        xor edx,edx
        mov di,eb_anchors+336
        call kn_compare_range_file
        jc er_bad
        mov eax,[rr_offsets+4]
        mov ecx,18
        xor edx,edx
        mov di,er_answer_path
        jmp kn_compare_range_file
er_close_bad:
        call kc_close
er_bad:
        stc
        ret

er_gate dw 0
er_index dw 0
er_alias_index dw 0
er_origin_length dd 0
er_extensions dd 'GKB','GKT','GRJ','GRT','GRP','GRB','GRC','GSC','GSJ','GSB'
er_capture_name db 'CAPTURE.GSK',0
er_output times 112 db 0
er_scan_path times 112 db 0
er_answer_path times 112 db 0
er_action times 128 db 0
er_end:
