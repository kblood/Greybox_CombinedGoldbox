; Closed Secret v16 identity envelope. Missing older state stays unknown.
validate_v16_state:
        cmp     byte [is_gen2], 2
        jne     .bad
        cmp     dword [rbuf+SI_MAGIC_OFF], 'GBSI'
        jne     .bad
        cmp     dword [rbuf+SI_MAGIC_OFF+4], 00100001h
        jne     .bad
        cmp     word [rbuf+SI_MAGIC_OFF+14], 0
        jne     .bad
        mov     ax, [rbuf+SI_COUNT_OFF]
        cmp     ax, 6
        ja      .bad
        cmp     ax, [party_count]
        jne     .bad
        cmp     dword [rbuf+MS_MAGIC_OFF], 'GBMS'
        jne     .bad
        mov     dx, [rbuf+SI_FLAGS_OFF]
        cmp     dx, 2
        ja      .bad
        cmp     dx, [rbuf+MS_FLAGS_OFF]
        jne     .bad
        mov     bx, [rbuf+SI_SELECTED_OFF]
        cmp     bx, [rbuf+MS_SELECTED_OFF]
        jne     .bad
        cmp     dx, 1
        jne     .null
        test    bx, bx
        jz      .bad
        cmp     bx, ax
        ja      .bad
        jmp     validate_v15_state
.null:  test    bx, bx
        jz      validate_v15_state
.bad:   stc
        ret

restore_v16_state:
        mov     eax, [rbuf+MS_CMP_L_OFF]
        mov     [cmp_l], eax
        mov     ax, [rbuf+SI_SELECTED_OFF]
        mov     [selected_party], ax
        mov     ax, [rbuf+SI_FLAGS_OFF]
        mov     dl, al
        and     al, 1
        mov     [selected_valid], al
        shr     dl, 1
        mov     [selected_not_found], dl
        mov     si, rbuf+GBRF_FLAGS_OFF
        mov     di, flag_eq
        mov     cx, 6
        rep     movsb
        ret

; Match every pending WHO label to this transition's closed name capability.
; SI addresses the prompt segment on entry; no actor lookup by display name.
validate_who_names:
        movzx   ax, byte [rbuf+si]
        inc     si
        add     si, ax
        mov     di, party_names
        mov     bp, [party_count]
.row:   movzx   cx, byte [di]
        cmp     cl, [rbuf+si]
        jne     .bad
        inc     si
        push    di
        inc     di
.chars: mov     al, [di]
        cmp     al, [rbuf+si]
        jne     .pop_bad
        inc     si
        inc     di
        loop    .chars
        pop     di
        add     di, 16
        dec     bp
        jnz     .row
        clc
        ret
.pop_bad:
        pop     di
.bad:   stc
        ret
