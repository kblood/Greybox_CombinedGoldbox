; /D effect roster source: closed read-only Secret dispatch admission.
; kr_header/offsets below are validator scratch, never an indexed receipt.
; Every file is opened read-only; no authority, token or party is published.
ki_inspect:
        mov si,kn_descriptor
        call kv_path
        jc .bad
        mov si,kn_expected_roster
        call kv_path
        jc .bad
        mov si,kn_expected_source
        call kv_path
        jc .bad
        mov dx,kn_expected_roster
        call sr_read
        jc .bad
        call sc_validate_hp
        jc .bad
        mov ax,[sr_count]
        mov [kr_header+12],ax
        mov word [kv_index],0
.levels:
        imul si,word [kv_index],440
        add si,290
        mov cx,14
.level:
        cmp byte [gs:si],18
        ja .bad
        inc si
        loop .level
        inc word [kv_index]
        mov ax,[kv_index]
        cmp ax,[sr_count]
        jb .levels
        mov dx,kn_descriptor
        call kc_open
        jc .bad
        cmp dword [kc_extent],5948
        jne .close_bad
        mov byte [kv_pending],0
        mov word [kr_header+18],1
        xor eax,eax
        mov cx,5948
        call kv_effect
        jc .close_bad
        call kc_close
        jc .bad
        mov si,kn_descriptor
        mov di,kv_scratch
        call kn_copy_path
        mov si,kv_scratch
        call kv_extension
        jc .bad
        mov dword [si],'IDN'
        mov dx,kv_scratch
        call kc_open
        jc .bad
        mov eax,[kc_extent]
        mov [kr_header+40],eax
        mov dword [kr_offsets+16],0
        call kv_source_pc
        jc .close_bad
        mov eax,16
        mov ecx,[kv_source_len]
        xor edx,edx
        mov di,kn_expected_source
        mov byte [kn_peer_exact],1
        call kn_compare_range_file
        jc .close_bad
        call kc_close
        jc .bad
        mov si,kn_descriptor
        mov di,kv_scratch
        call kn_copy_path
        mov si,kv_scratch
        call kv_extension
        jc .bad
        mov dword [si],'GBS'
        mov dword [kr_header+56],0
        test word [fs:KV_FX+6],0100h
        jnz .stream
        mov dx,kv_scratch
        call kc_probe
        jc .bad
        test ax,ax
        jnz .bad
        call kv_stream
        jc .bad
        jmp kv_check_readonly_dispatch
.stream:
        mov dx,kv_scratch
        call kc_open
        jc .bad
        mov eax,[kc_extent]
        test eax,eax
        jz .close_bad
        mov [kr_header+56],eax
        mov dword [kr_offsets+32],0
        call kv_stream
        jc .close_bad
        call kv_check_readonly_dispatch
        jc .close_bad
        call kc_close
        ret
.close_bad:
        call kc_close
.bad:   stc
        ret
