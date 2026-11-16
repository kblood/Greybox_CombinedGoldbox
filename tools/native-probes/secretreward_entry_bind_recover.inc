; PRIVATE callable recovery of an installed action2 journal.
; Same canonical four-anchor/DX resident-extent contract as rc_invoke.
; CF0: no J or recovered canonical phase1 owner; CF1: retain committed prefix.
; Executable private diagnostic: sole command-tail token is a 448-byte anchor
; descriptor. It only reads that file, allocates normal banks and calls narrow recovery.
ebr_diagnostic:
        cmp word [ebr_fault],0
        jne ebr_bad
        mov si,81h
        call kn_skip
        mov di,kn_descriptor
        call kn_token
        jc ebr_bad
        call kn_skip
        cmp byte [si],13
        jne ebr_bad
        call kn_alloc
        jc ebr_bad
        mov dx,kn_descriptor
        call kc_open
        jc ebr_bad
        cmp dword [kc_extent],448
        jne ebr_close_bad
        xor eax,eax
        mov cx,448
        mov di,rw_paths
        call kc_read_at
        jc ebr_close_bad
        call kc_close
        jc ebr_quarantine
        mov si,rw_paths
        mov di,rw_paths+112
        mov bx,rw_paths+224
        mov bp,rw_paths+336
        mov dx,stacktop
        jmp ebr_invoke

ebr_invoke:
        cmp word [ebr_fault],0
        jne ebr_bad
        cmp byte [kn_capture_mode],0
        jne ebr_bad
        cmp byte [kn_cwd_owned],0
        jne ebr_bad
        cmp dx,stacktop
        jb ebr_bad
        mov ax,cs
        mov cx,ds
        cmp ax,cx
        jne ebr_bad
        mov cx,ss
        cmp ax,cx
        jne ebr_bad
        cmp sp,stacktop-512
        jb ebr_bad
        cmp sp,stacktop
        jae ebr_bad
        jmp rcommit_recover4

; This private composition accepts action2 explicitly, never ordinary/GRA.
ebr_intent:
        cmp dword [rr_header+24],00010000h
        jne ebr_bad
        cmp dword [rr_header+28],00010002h
        jne ebr_bad
        cmp dword [rr_header+32],1
        jne ebr_bad
        cmp dword [rr_header+36],0
        jne ebr_bad
        cmp dword [rr_header+40],2
        jne ebr_bad
        cmp dword [rr_header+44],0
        jne ebr_bad
        clc
        ret

ebr_names:
        call rc_names_only
        jc ebr_bad
        ; RR/RV admits nested COMPLETED/kind1. Exact whole standalone bytes
        ; and EOF make that same admission apply to the required live GRC.
        mov eax,[rr_offsets+8]
        mov ecx,[rr_lengths+8]
        xor edx,edx
        mov di,kv_other_path
        mov byte [kn_peer_exact],1
        mov byte [kn_bank_compare],0
        mov byte [kn_normalize],0
        call kn_compare_range_file
        jc ebr_bad
        call ebr_token
        jc ebr_bad
        ; GKB/GKT/J are classified by the existing checked publication rows.
        ; Only their exact pre/post forms can license a subsequent operation.
        mov word [ebr_index],4
.namespace:
        mov bx,[ebr_index]
        cmp bx,10 ; unrelated GRA never opened
        je .next
        cmp bx,12 ; current durable J
        je .next
        cmp bx,14 ; exact retained GRC already proved
        je .next
        mov dx,[rc_reserved+bx]
        call rc_absent
        jc ebr_bad
.next:
        add word [ebr_index],2
        cmp word [ebr_index],16
        jb .namespace
        call kn_no_transaction
        jc ebr_bad
        mov si,rv_paths+9*112
        mov di,ebr_peer
        mov bx,ebr_capture
        call kn_join
        jc ebr_bad
        mov dx,ebr_peer
        jmp rc_absent

ebr_token:
        mov byte [rc_request_present],0
        mov word [rc_token_path],0
        mov dx,rv_paths+6*112
        jmp rc_absent

ebr_close_bad:
        call kc_close
        jc ebr_quarantine
ebr_bad:
        stc
        ret
ebr_quarantine:
        mov word [ebr_fault],1
        jmp ebr_bad

ebr_fault dw 0
ebr_index dw 0
ebr_capture db 'CAPTURE.GSK',0
ebr_peer times 112 db 0
ebr_end:
