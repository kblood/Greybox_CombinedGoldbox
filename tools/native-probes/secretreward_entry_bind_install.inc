; PRIVATE callable installation of a separately staged action2. No recovery.
; Same canonical four-anchor/DX resident-extent contract as rc_invoke.
; CF0: exactly one closed GRT -> GRJ rename; CF1: preserve retained evidence.
; Executable private diagnostic: sole command-tail token is a 448-byte anchor
; descriptor. It only reads that file, allocates normal banks and calls installer.
ebi_diagnostic:
        cmp word [ebi_fault],0
        jne ebi_bad
        mov si,81h
        call kn_skip
        mov di,kn_descriptor
        call kn_token
        jc ebi_bad
        call kn_skip
        cmp byte [si],13
        jne ebi_bad
        call kn_alloc
        jc ebi_bad
        mov dx,kn_descriptor
        call kc_open
        jc ebi_bad
        cmp dword [kc_extent],448
        jne ebi_close_bad
        xor eax,eax
        mov cx,448
        mov di,rw_paths
        call kc_read_at
        jc ebi_close_bad
        call kc_close
        jc ebi_quarantine
        mov si,rw_paths
        mov di,rw_paths+112
        mov bx,rw_paths+224
        mov bp,rw_paths+336
        mov dx,stacktop
        jmp ebi_invoke

ebi_invoke:
        cmp word [ebi_fault],0
        jne ebi_bad
        cmp byte [kn_capture_mode],0
        jne ebi_bad
        cmp byte [kn_cwd_owned],0
        jne ebi_bad
        call rc_invoke
        jc ebi_bad
        cmp word [rc_extent],stacktop
        jb ebi_bad
        mov ax,cs
        mov bx,ds
        cmp ax,bx
        jne ebi_bad
        mov bx,ss
        cmp ax,bx
        jne ebi_bad
        cmp sp,stacktop-512
        jb ebi_bad
        cmp sp,stacktop
        jae ebi_bad
        mov si,rc_journal
        mov di,ebi_stage
        call kn_copy_path
        mov si,ebi_stage
        call kn_extension
        jc ebi_bad
        mov dword [di],'GRT'
        mov dx,ebi_stage
        call rr_index
        jc ebi_bad
        cmp word [rr_header+6],2
        jne ebi_close_bad
        cmp dword [rr_header+24],00010000h
        jne ebi_close_bad
        cmp dword [rr_header+28],00010002h
        jne ebi_close_bad
        cmp dword [rr_header+32],1
        jne ebi_close_bad
        cmp dword [rr_header+36],0
        jne ebi_close_bad
        cmp dword [rr_header+40],2
        jne ebi_close_bad
        cmp dword [rr_header+44],0
        jne ebi_close_bad
        ; RR/RV independently prove action2 phase0->1, generation1->2.
        mov dx,[rc_extent]
        call rv_record_relation
        jc ebi_close_bad
        call rc_bind_live
        jc ebi_close_bad
        mov si,ebi_stage
        call rc_reserved_disjoint
        jc ebi_close_bad
ebi_owner_match:
        mov dx,rc_anchors
        call rc_owner_class
        jc ebi_close_bad
        cmp ax,1
        jne ebi_close_bad
        mov bx,6*4
        mov di,rc_anchors+112
        call rc_party_exact
        jc ebi_close_bad
        ; Complete current kind1 COMPLETED GRC equals candidate section2.
        ; RV has already admitted its nested KR/KV semantics.
        mov si,rc_anchors
        mov di,ebi_peer
        call kn_copy_path
        mov si,ebi_peer
        call kn_extension
        jc ebi_close_bad
        mov dword [di],'GRC'
        mov si,ebi_peer
        call rc_reserved_disjoint
        jc ebi_close_bad
ebi_grc_match:
        mov eax,[rr_offsets+8]
        mov ecx,[rr_lengths+8]
        xor edx,edx
        mov di,ebi_peer
        call kn_compare_range_file
        jc ebi_close_bad
        ; Retired internal GBMO must remain absent. Unrelated GRA is preserved.
        mov dx,rv_paths+6*112
        call rc_absent
        jc ebi_close_bad
        ; Owner/RV comparisons reuse GRP/GRB path scratch. Reconstruct it
        ; before the final reserved-name admission and the sole rename.
        call rc_names_only
        jc ebi_close_bad
        mov word [ebi_gate],1
        mov word [ebi_index],0
.namespace:
        mov si,rc_anchors
        mov di,ebi_peer
        call kn_copy_path
        mov si,ebi_peer
        call kn_extension
        jc ebi_close_bad
        mov bx,[ebi_index]
        mov eax,[ebi_extensions+bx]
        mov [di],eax
        mov si,ebi_peer
        call rc_reserved_disjoint
        jc ebi_close_bad
        mov dx,ebi_peer
        call rc_absent
        jc ebi_close_bad
        add word [ebi_index],4
        cmp word [ebi_index],32
        jb .namespace
        call kn_no_transaction
        jc ebi_close_bad
        mov si,rv_paths+9*112
        mov di,ebi_peer
        mov bx,ebi_capture
        call kn_join
        jc ebi_close_bad
        mov dx,ebi_peer
        call rc_absent
        jc ebi_close_bad
        call kc_close
        jc ebi_quarantine
        ; Every owned handle must be closed before the sole mutation.
        cmp word [kn_peer_fh],0ffffh
        jne ebi_quarantine
        cmp word [kc_probe_fh],0ffffh
        jne ebi_quarantine
        mov dx,ebi_stage
        mov di,rc_journal
        mov ah,56h
        int 21h
        jc ebi_bad
        clc
        ret
ebi_close_bad:
        call kc_close
        jc ebi_quarantine
ebi_bad:
        stc
        ret
ebi_quarantine:
        mov word [ebi_fault],1
        jmp ebi_bad

ebi_fault dw 0
ebi_index dw 0
ebi_gate dw 0
ebi_extensions dd 'GKB','GKT','GRJ','GRP','GRB','GSC','GSJ','GSB'
ebi_capture db 'CAPTURE.GSK',0
ebi_stage times 112 db 0
ebi_peer times 112 db 0
ebi_end:
