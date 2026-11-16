; PRIVATE action2 unpublished staging from genuine phase0 owner/GRC.
; No submission, EXEC, rename, recovery, publication or P1 mutation.
ebp_diagnostic:
        call ebp_guard
        jc ebp_bad
        mov si,81h
        call kn_skip
        mov di,kn_descriptor
        call kn_token
        jc ebp_bad
        call kn_skip
        cmp byte [si],13
        jne ebp_bad
        call kn_alloc
        jc ebp_bad
        mov dx,kn_descriptor
        call kc_open
        jc ebp_bad
        cmp dword [kc_extent],448
        jne ebp_close_bad
        xor eax,eax
        mov cx,448
        mov di,rw_paths
        call kc_read_at
        jc ebp_close_bad
        call kc_close
        jc ebp_bad
        mov si,rw_paths
        mov di,rw_paths+112
        mov bx,rw_paths+224
        mov bp,rw_paths+336
        mov dx,stacktop
ebp_invoke:
        call ebp_guard
        jc ebp_bad
        call rc_invoke
        jc ebp_bad
        cmp word [rc_extent],stacktop
        jb ebp_bad
        mov ax,cs
        mov bx,ds
        cmp ax,bx
        jne ebp_bad
        mov bx,ss
        cmp ax,bx
        jne ebp_bad
        cmp sp,stacktop-512
        jb ebp_bad
        cmp sp,stacktop
        jae ebp_bad
        call ebp_owner
        jc ebp_bad
        call rc_names_only
        jc ebp_close_bad
        mov si,kv_other_path
        mov di,kn_capture_input_path
        call kn_copy_path
        mov word [ebp_gate],1
        call ebp_namespace
        jc ebp_close_bad
        ; Freeze complete canonical kind1 header and its four source ranges.
        mov eax,[rr_offsets]
        mov edx,[rr_lengths]
        call kc_view_begin
        jc ebp_close_bad
        call kr_index_open
        jc ebp_view_bad
        call kv_validate
        jc ebp_view_bad
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
        call ebp_range
        mov eax,[kr_offsets+28]
        mov ecx,[kr_header+52]
        call ebp_range
        mov eax,[kr_offsets+12]
        mov ecx,[kr_header+40]
        add ecx,150
        call ebp_range
        mov eax,[rr_offsets+4]
        mov [di],eax
        mov dword [di+4],18
        mov [di+8],edx
        call kc_view_end
        jc ebp_close_bad
        call kc_close
        jc ebp_bad
ebp_grc_reopen:
        mov dx,kn_capture_input_path
        call kr_index
        jc ebp_bad
        call kv_validate
        jc ebp_close_bad
        mov si,kw_header
        mov di,kr_header
        mov cx,32
        repe cmpsw
        jne ebp_close_bad
        mov eax,[kc_extent]
        mov [ep_lengths+4],eax
        mov byte [kn_peer_exact],0
        mov word [ebp_index],0
.relation:
        mov si,[ebp_index]
        mov eax,[rw_specs+si+8]
        mov ecx,[rw_specs+si+4]
        mov edx,[rw_specs+si]
        mov di,rc_anchors
        call kn_compare_range_file
        jc ebp_close_bad
        add word [ebp_index],12
        cmp word [ebp_index],48
        jb .relation
        mov byte [kn_peer_exact],1
        mov eax,[kr_offsets+4]
        mov ecx,[kr_header+28]
        xor edx,edx
        mov di,rc_anchors+112
        call kn_compare_range_file
        jc ebp_close_bad
        mov eax,[kr_offsets+16]
        add eax,16
        mov ecx,[kr_header+40]
        sub ecx,16
        xor edx,edx
        mov di,rc_anchors+224
        call kn_compare_range_file
        jc ebp_close_bad
        call kc_close
        jc ebp_bad
        ; Reopen the owner after independent GRC admission. No stale caller grant.
        call ebp_owner
        jc ebp_bad
        ; KV and live binding reuse GRP/GRB scratch. Reconstruct all reserved
        ; names and recheck aliases after those admissions, before second scan.
        call rc_names_only
        jc ebp_close_bad
        mov eax,[kc_extent]
        mov [ep_lengths],eax
        mov word [ep_paths],rc_anchors
        mov word [ep_paths+2],kn_capture_input_path
        call ebp_frame
        jc ebp_close_bad
        mov word [ebp_gate],2
        call ebp_namespace
        jc ebp_close_bad
        mov dx,rj_temp
        call rw_write
        jc ebp_close_bad
        call kc_close
        jc ebp_bad
        mov word [ebp_gate],3
        mov dx,rj_temp
        call ep_compare
        jc ebp_bad
        mov word [ebp_gate],4
ebp_readmit:
        mov dx,rj_temp
        call rr_index
        jc ebp_bad
        mov dx,stacktop
        call rv_record_relation
        jc ebp_close_bad
        call rc_bind_live
        jc ebp_close_bad
        ; Match complete frozen pre-P1 to the still-current live anchor.
        mov eax,[rr_offsets+24]
        mov ecx,[rr_lengths+24]
        xor edx,edx
        mov di,rc_anchors+112
        call kn_compare_range_file
        jc ebp_close_bad
        ; The freshly admitted nested GRC must still equal the current whole
        ; standalone input after expected framing/compare lifetimes have ended.
        mov eax,[rr_offsets+8]
        mov ecx,[rr_lengths+8]
        xor edx,edx
        mov di,kn_capture_input_path
        call kn_compare_range_file
        jc ebp_close_bad
        ; Candidate's unchanged sections are also re-bound to the live owner.
        call ebp_match_owner
        jc ebp_close_bad
        call kc_close
        jc ebp_bad
        mov word [ebp_gate],0
        clc
        ret

ebp_owner:
        mov dx,rc_anchors
        call rr_index
        jc ebp_bad
        cmp word [rr_header+6],1
        jne ebp_close_bad
        cmp dword [rr_header+24],0
        jne ebp_close_bad
        cmp dword [rr_header+40],1
        jne ebp_close_bad
        cmp dword [rr_header+44],0
        jne ebp_close_bad
        mov dx,stacktop
        call rv_record_relation
        jc ebp_close_bad
        call rc_bind_live
        jc ebp_close_bad
        call rj_match_live
        jc ebp_close_bad
        mov dx,rv_paths+6*112
        call rc_absent
        ret

ebp_namespace:
        mov word [ebp_index],0
.sibling:
        mov bx,[ebp_index]
        cmp bx,10 ; preserve unrelated GRA
        je .next
        cmp bx,14 ; already-admitted GRC
        je .next
        mov dx,[rc_reserved+bx]
        call rc_absent
        jc ebp_bad
.next:
        add word [ebp_index],2
        cmp word [ebp_index],16
        jb .sibling
        call kn_no_transaction
        jc ebp_bad
        mov si,rv_paths+9*112
        mov di,kn_marker_actual
        mov bx,kn_capture_name
        call kn_join
        jc ebp_bad
        mov dx,kn_marker_actual
        jmp rc_absent

ebp_range:
        add eax,[rr_offsets]
        mov [di],eax
        mov [di+4],ecx
        mov [di+8],edx
        add edx,ecx
        add di,12
        ret

ebp_frame:
        ; Final RR/RV may destroy the RW/RZ overlay. Preserve the owner's
        ; complete header/directory outside it; expected RW framing dies at RV.
        mov si,rr_header
        mov di,ebp_owner_header
        mov cx,128
        rep movsw
        mov si,rr_header
        mov di,rw_header
        mov cx,128
        rep movsw
        mov word [rw_header+6],2
        mov word [rw_header+26],1
        mov dword [rw_header+28],00010002h
        mov dword [rw_header+32],1
        mov dword [rw_header+40],2
        mov si,rv_paths
        mov di,rw_paths
        mov cx,616
        rep movsw
        mov si,rv_context
        mov di,rw_context
        mov cx,16
        rep movsw
        mov word [ebp_index],0
.section:
        mov bx,[ebp_index]
        shl bx,2
        mov edx,[rr_offsets+bx]
        mov ecx,[rr_lengths+bx]
        mov bx,[ebp_index]
        imul di,bx,12
        add di,rw_specs
        xor eax,eax
        mov [di],eax
        mov [di+4],eax
        mov [di+8],eax
        test ecx,ecx
        jz .next
        mov word [di],3
        mov [di+4],edx
        mov [di+8],ecx
.next:
        inc word [ebp_index]
        cmp word [ebp_index],16
        jb .section
        mov word [rw_specs+2*12],3
        mov word [rw_specs+2*12+2],1
        mov eax,[ep_lengths+4]
        mov [rw_specs+2*12+8],eax
        mov word [rt_state+8],1
        call rt_sync
        call rt_validate
        jc ebp_bad
        mov bx,9
        mov ax,ds
        mov edx,rt_state
        mov ecx,160
        call rj_memory_spec
        mov di,rj_request
        xor ax,ax
        mov cx,64
        rep stosw
        mov dword [rj_request],'GBRA'
        mov dword [rj_request+4],00800001h
        mov dword [rj_request+8],1
        mov word [rj_request+18],2
        mov word [rj_request+22],0ffffh
        mov word [rj_request+28],1
        mov eax,[rt_state+12]
        mov [rj_request+32],eax
        mov ax,[rr_header+48]
        mov [rj_request+36],ax
        mov word [rj_request+38],16
        mov word [rj_request+40],6940
        mov bx,14
        mov ax,ds
        mov edx,rj_request
        mov ecx,128
        call rj_memory_spec
        jmp rw_preflight

; RR offsets now belong to the freshly admitted candidate. Read the live
; owner directory into scratch, then compare every immutable section exactly.
ebp_match_owner:
        xor bx,bx
        xor eax,eax
        mov di,rw_buf
        mov cx,256
        call ep_read ; also verifies exact whole live-owner extent
        jc ebp_bad
        mov si,rw_buf
        mov di,ebp_owner_header
        mov cx,128
        repe cmpsw
        jne ebp_bad
        mov word [ebp_index],0
.section:
        mov bx,[ebp_index]
        cmp bx,2
        je .next
        cmp bx,14
        je .next
        shl bx,2
        mov ecx,[rr_lengths+bx]
        test ecx,ecx
        jz .next
        mov eax,[rr_offsets+bx]
        cmp bx,36
        jne .offset
        mov eax,[rr_offsets+32] ; owner post-state equals candidate pre-state
.offset:
        mov si,bx
        shl si,1
        mov edx,[ebp_owner_header+128+si] ; frozen directory survives RW/RZ
        mov byte [kn_peer_exact],0
        mov di,rc_anchors
        call kn_compare_range_file
        jc ebp_bad
.next:
        inc word [ebp_index]
        cmp word [ebp_index],16
        jb .section
        ; Current SETTLED owner has the same complete canonical request with
        ; action/result NONE/0. Compare that last differing immutable section.
        mov word [rj_request+18],0
        mov word [rj_request+28],0
        xor bx,bx
        mov eax,[ebp_owner_header+240]
        mov cx,128
        mov di,rw_buf
        call ep_read
        jc ebp_bad
        mov si,rj_request
        mov di,rw_buf
        mov cx,64
        repe cmpsw
        jne ebp_bad
        mov byte [kn_peer_exact],1
        clc
        ret

ebp_guard:
        cmp byte [kn_cwd_owned],0
        jne ebp_bad
        cmp byte [kn_capture_mode],0
        jne ebp_bad
        push si
        push cx
        push bx
        mov si,ebp_handles
        mov cx,8
.owned:
        lodsw
        mov bx,ax
        cmp word [bx],0ffffh
        jne .bad
        loop .owned
        clc
        jmp .done
.bad:  stc
.done:
        pop bx
        pop cx
        pop si
        ret
ebp_view_bad:
        call kc_view_end
ebp_close_bad:
        call kc_close
ebp_bad:
        stc
        ret
ebp_index dw 0
ebp_gate dw 0
ebp_handles dw kc_fh,kn_peer_fh,kc_probe_fh,kw_out,kw_live_fh,rw_fh,ep_fh,kf_other
ebp_owner_header times 256 db 0
ebp_end:
