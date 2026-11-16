; PRIVATE callable installation of a separately staged ENTRY. No recovery.
; Same canonical four-anchor/DX resident-extent contract as rc_invoke.
; CF0: exactly one closed GRT -> GRJ rename; CF1: preserve retained evidence.
; Executable private diagnostic: sole command-tail token is a448-byte anchor
; descriptor. It only reads that file, allocates normal banks and calls installer.
ei_diagnostic:
        mov si,81h
        call kn_skip
        mov di,kn_descriptor
        call kn_token
        jc ei_bad
        call kn_skip
        cmp byte [si],13
        jne ei_bad
        call kn_alloc
        jc ei_bad
        mov dx,kn_descriptor
        call kc_open
        jc ei_bad
        cmp dword [kc_extent],448
        jne ei_close_bad
        xor eax,eax
        mov cx,448
        mov di,rw_paths
        call kc_read_at
        jc ei_close_bad
        call kc_close
        jc ei_quarantine
        mov si,rw_paths
        mov di,rw_paths+112
        mov bx,rw_paths+224
        mov bp,rw_paths+336
        mov dx,stacktop
%ifdef ENTRY_DIAGNOSTIC_RECOVERY
        jmp rcommit_recover4 ; separate recovery COM; never installer dispatch
%else
        jmp ei_invoke
%endif

ei_invoke:
        cmp word [ei_fault],0
        jne ei_bad
        call rc_invoke
        jc ei_bad
        cmp word [rc_extent],stacktop
        jb ei_bad
        mov si,rc_journal
        mov di,ei_stage
        call kn_copy_path
        mov si,ei_stage
        call kn_extension
        jc ei_bad
        mov dword [di],'GRT'
        mov dx,ei_stage
        call rr_index
        jc ei_bad
        cmp word [rr_header+6],2
        jne ei_close_bad
        cmp dword [rr_header+24],0
        jne ei_close_bad
        cmp dword [rr_header+28],00010001h
        jne ei_close_bad
        ; RR proves ENTRY virtual generation0 ->1 and exact sections/EOF.
        mov dx,[rc_extent]
        call rv_record_relation
        jc ei_close_bad
        call rz_eligible_share
        jc ei_close_bad
        call rc_bind_live
        jc ei_close_bad
        mov si,ei_stage
        call rc_reserved_disjoint
        jc ei_close_bad
        mov dx,rc_anchors
        call rc_owner_class
        jc ei_close_bad
        cmp ax,1
        jne ei_close_bad
        mov bx,6*4
        mov di,rc_anchors+112
        call rc_party_exact
        jc ei_close_bad
        call rc_token_exact
        jc ei_close_bad
        cmp byte [rc_request_present],1
        jne ei_close_bad
        mov word [ei_index],0
.namespace:
        mov si,rc_anchors
        mov di,ei_peer
        call kn_copy_path
        mov si,ei_peer
        call kn_extension
        jc ei_close_bad
        mov bx,[ei_index]
        mov eax,[ei_extensions+bx]
        mov [di],eax
        mov si,ei_peer
        call rc_reserved_disjoint
        jc ei_close_bad
        mov dx,ei_peer
        call rc_absent
        jc ei_close_bad
        add word [ei_index],4
        cmp word [ei_index],36
        jb .namespace
        mov si,rv_paths+9*112
        mov di,ei_peer
        mov bx,ei_capture
        call kn_join
        jc ei_close_bad
        mov dx,ei_peer
        call rc_absent
        jc ei_close_bad
        call kc_close
        jc ei_quarantine
        ; Every owned handle must be closed before the sole mutation.
        cmp word [kn_peer_fh],0ffffh
        jne ei_quarantine
        cmp word [kc_probe_fh],0ffffh
        jne ei_quarantine
        mov dx,ei_stage
        mov di,rc_journal
        mov ah,56h
        int 21h
        jc ei_bad
        clc
        ret
ei_close_bad:
        call kc_close
        jc ei_quarantine
ei_bad:
        stc
        ret
ei_quarantine:
        mov word [ei_fault],1
        jmp ei_bad

ei_fault dw 0
ei_index dw 0
ei_extensions dd 'GKB','GKT','GRJ','GRP','GRB','GRC','GSC','GSJ','GSB'
ei_capture db 'CAPTURE.GSK',0
ei_stage times 112 db 0
ei_peer times 112 db 0
ei_end:
