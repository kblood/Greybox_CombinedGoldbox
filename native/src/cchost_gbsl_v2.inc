; GBSL v2 validator shared by the live DAMAGE preflight and DoK GBDJ
; journal checks.  Inputs: v2_fh, v2_base, v2_extent (all 16-bit).  The
; caller must establish the exact containing-file extent separately.
; Every seek and read remains inside [base,base+extent), and a malformed
; packed-text extension fails before any roster or source-save write.
validate_gbsl_v2:
        xor     dx, dx
        mov     cx, 8
        mov     di, v2_header
        call    v2_read_at
        jc      .bad
        cmp     dword [v2_header], 'GBSL'
        jne     .bad
        cmp     word [v2_header+4], 2
        jne     .bad
        mov     ax, [v2_header+6]
        or      ax, ax
        jz      .bad
        cmp     ax, 1213
        ja      .bad
        mov     [v2_count], ax
        mov     bx, 54
        mul     bx
        or      dx, dx
        jnz     .bad
        add     ax, 8
        jc      .bad
        mov     [v2_records_end], ax
        mov     dx, ax
        mov     cx, 12
        mov     di, v2_ext
        call    v2_read_at
        jc      .bad
        cmp     dword [v2_ext], 'GBPX'
        jne     .bad
        cmp     word [v2_ext+4], 1
        je      .codec_ok
%ifdef CCEFX_SECRET_TEXT
        ; Explicit diagnostic-only capability; CCHOST keeps extension1 only.
        cmp     word [v2_ext+4], 2
        jne     .bad
        cmp     word [version_seen], 16
        jne     .bad
        call    validate_v16_dump
        jc      .bad
%else
        jmp     .bad
%endif
.codec_ok:
        mov     ax, [v2_ext+6]
        or      ax, ax
        jz      .bad
        cmp     ax, [v2_count]
        ja      .bad
        mov     [v2_tag_count], ax
        cmp     word [v2_ext+10], 0
        jne     .bad
        mov     ax, [v2_ext+8]
        mov     [v2_payload_len], ax
        mov     ax, [v2_records_end]
        add     ax, 12
        jc      .bad
        mov     [v2_dir_base], ax
        mov     bx, [v2_tag_count]
        shl     bx, 3
        add     ax, bx
        jc      .bad
        mov     [v2_payload_base], ax
        add     ax, [v2_payload_len]
        jc      .bad
        cmp     ax, [v2_extent]
        jne     .bad
        mov     word [v2_seen_tags], 0
        mov     word [v2_seen_payload], 0
        mov     word [v2_index], 0
.record:
        mov     ax, [v2_index]
        cmp     ax, [v2_count]
        jae     .complete
        mov     bx, 54
        mul     bx
        or      dx, dx
        jnz     .bad
        add     ax, 8
        jc      .bad
        mov     dx, ax
        mov     cx, 54
        mov     di, v2_record
        call    v2_read_at
        jc      .bad
        mov     ax, [v2_record+20]
        cmp     ax, 0ffffh
        je      .long
        cmp     ax, 32
        ja      .bad
        jmp     .next
.long:
        cmp     word [v2_record], 11h
        je      .long_opcode_ok
        cmp     word [v2_record], 12h
        jne     .bad
.long_opcode_ok:
        cmp     dword [v2_record+22], 'GBPX'
        jne     .bad
        mov     ax, [v2_record+26]
        cmp     ax, [v2_seen_tags]
        jne     .bad
        mov     si, v2_record+28
        mov     cx, 26
.reserved:
        cmp     byte [si], 0
        jne     .bad
        inc     si
        loop    .reserved
        mov     ax, [v2_seen_tags]
        shl     ax, 3
        add     ax, [v2_dir_base]
        jc      .bad
        mov     dx, ax
        mov     cx, 8
        mov     di, v2_dir
        call    v2_read_at
        jc      .bad
        mov     ax, [v2_dir]
        cmp     ax, [v2_index]
        jne     .bad
        mov     ax, [v2_dir+2]
        cmp     ax, [v2_seen_payload]
        jne     .bad
        mov     ax, [v2_dir+4]
        or      ax, ax
        jz      .bad
        cmp     ax, 255
        ja      .bad
        add     [v2_seen_payload], ax
        jc      .bad
        cmp     word [v2_dir+6], 32
        jbe     .bad
        mov     dx, [v2_payload_base]
        add     dx, [v2_dir+2]
        jc      .bad
        mov     cx, [v2_dir+4]
        mov     di, v2_packed
        call    v2_read_at
        jc      .bad
        call    v2_count_packed
        cmp     bp, [v2_dir+6]
        jne     .bad
        inc     word [v2_seen_tags]
.next:
        inc     word [v2_index]
        jmp     .record
.complete:
        mov     ax, [v2_seen_tags]
        cmp     ax, [v2_tag_count]
        jne     .bad
        mov     ax, [v2_seen_payload]
        cmp     ax, [v2_payload_len]
        jne     .bad
        clc
        ret
.bad:   stc
        ret

; DX=sidecar-relative offset, CX=length, DI=destination.  The journal embeds
; the exact sidecar after its own prefix, so the absolute seek uses CX:DX.
v2_read_at:
        mov     [v2_read_len], cx
        mov     ax, dx
        add     ax, cx
        jc      .bad
        cmp     ax, [v2_extent]
        ja      .bad
        xor     cx, cx
        add     dx, [v2_base]
        adc     cx, 0
        mov     bx, [v2_fh]
        mov     ax, 4200h
        int     21h
        jc      .bad
        mov     bx, [v2_fh]
        mov     dx, di
        mov     cx, [v2_read_len]
        mov     ah, 3fh
        int     21h
        jc      .bad
        cmp     ax, [v2_read_len]
        jne     .bad
        clc
        ret
.bad:   stc
        ret

v2_count_packed:
        mov     si, v2_packed
        mov     cx, [v2_dir+4]
        xor     bp, bp
        xor     dx, dx
.char:
        xor     al, al
        mov     ah, 6
.bits:
        cmp     dh, 0
        jne     .source
        jcxz    .done
        mov     dl, [si]
        inc     si
        dec     cx
        mov     dh, 8
.source:
        shl     dl, 1
        rcl     al, 1
        dec     dh
        dec     ah
        jnz     .bits
        or      al, al
        jnz     .nonzero
        cmp     word [v2_ext+4], 2
        je      .char
        jmp     .done
.nonzero:
        cmp     word [v2_ext+4], 2
        jne     .count
        cmp     bp, 255
        jae     .char
.count:
        inc     bp
        jmp     .char
.done:  ret
