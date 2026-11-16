; Closed names v1, six fields v2/GBSF1, or seven fields v3/GBSF2.
; The admitted column count bounds both row stride and selected-field access.
; Called after the closed 16-byte header was read. Caller owns checked close.
read_who_roster:
        cmp     byte [is_gen2], 2
        jne     .bad
        cmp     word [roster_expected_id], 4
        jne     .bad
        mov     ax,[rosterhdr+4]
        dec     ax
        cmp     ax,2
        ja      .bad
        cmp     word [rosterhdr+10], 4
        jne     .bad
        cmp     word [rosterhdr+14], 0
        jne     .bad
        mov     ax, [rosterhdr+12]
        cmp     ax, 2080
        jb      .bad
        cmp     ax, 32768
        ja      .bad
        mov     ax, [rosterhdr+8]
        dec     ax
        cmp     ax, 5
        ja      .bad
        inc     ax
        imul    dx, ax, 448
        add     dx, 2080
        cmp     dx, [rosterhdr+12]
        ja      .bad
        shl     ax, 4
        mov     [roster_expected_len], ax
        add     ax, 16
        cmp     word [rosterhdr+4],1
        je      .extent
        mov     dx,[rosterhdr+4]
        add     dx,4
        mov     [who_field_columns],dl
        shl     dx,1
        imul    dx,word [rosterhdr+8]
        add     ax,dx
        add     ax,16
.extent:
        cmp     ax, [rosterhdr+6]
        jne     .bad
        mov     bx, [rosterfh]
        xor     cx, cx
        xor     dx, dx
        mov     ax, 4202h
        int     21h
        jc      .bad
        test    dx, dx
        jnz     .bad
        cmp     ax, [rosterhdr+6]
        jne     .bad
        mov     ax, 4200h
        mov     dx, 16
        int     21h
        jc      .bad
        mov     dx, party_names
        mov     cx, [roster_expected_len]
        call    .read
        jc      .bad
        mov     bp, [rosterhdr+8]
        mov     si, party_names
.row:   lodsb
        dec     al
        cmp     al, 14
        ja      .bad
        inc     al
        movzx   cx, al
        mov     dl, 15
        sub     dl, al
.chars: lodsb
        sub     al, 32
        cmp     al, 94
        ja      .bad
        loop    .chars
        movzx   cx, dl
        jcxz    .next
.pad:   lodsb
        test    al, al
        jnz     .bad
        loop    .pad
.next:  dec     bp
        jnz     .row
        mov     ax, [rosterhdr+8]
        mov     [party_count], ax
        cmp     word [rosterhdr+4],1
        je      .names
        movzx   bp,byte [who_field_columns]
        shl     bp,1
        imul    bp,ax
        mov     dx,rosterhdr
        mov     cx,16
        call    .read
        jc      .bad
        cmp     dword [rosterhdr],'GBSF'
        jne     .bad
        mov     ax,bp
        add     ax,16
        cmp     ax,[rosterhdr+6]
        jne     .bad
        mov     ax,[party_count]
        cmp     ax,[rosterhdr+8]
        jne     .bad
        movzx   ax,byte [who_field_columns]
        cmp     ax,[rosterhdr+10]
        jne     .bad
        sub     ax,5
        cmp     ax,[rosterhdr+4]
        jne     .bad
        cmp     dword [rosterhdr+12],0
        jne     .bad
        mov     dx,who_fields
        mov     cx,bp
        call    .read
        jc      .bad
        mov     bp,[party_count]
        mov     si,who_fields
.fields:
        movzx   cx,byte [who_field_columns]
        mov     bl,18h                 ; signed columns3/4, all others unsigned
.word:  lodsw
        mov     dx,ax
        xor     ah,ah
        shr     bl,1
        jnc     .canonical
        cbw
.canonical:
        cmp     ax,dx
        jne     .bad
        loop    .word
        dec     bp
        jnz     .fields
        mov     byte [who_fields_valid],2 ; grant only after caller closes
.names:
        mov     byte [who_names_valid], 1
        mov     word [roster_id], 4
        mov     byte [roster_legacy], 1 ; names grant no HP/XP/spell capabilities
        clc
        ret
.bad:   stc
        ret
.read:  mov bx,[rosterfh]
        mov ah,3fh
        int 21h
        jc .bad
        cmp ax,cx
        jne .bad
        clc
        ret
