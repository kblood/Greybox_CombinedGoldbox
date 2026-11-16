; Source2B horizontal menu: typed Secret only, exact existing GBMT label codec.
validate_horizontal_labels:
        mov ax,[loadbuf+MN_COUNT_OFF]
        cmp ax,[loadbuf+MT_COUNT_OFF]
        jne .bad
        mov cx,ax
        mov si,MT_DATA_OFF
.label:
        jcxz .padding
        cmp si,MT_DATA_OFF+MENU_TEXT_CAP
        jae .bad
        movzx ax,byte [loadbuf+si]
        inc si
        add si,ax
        cmp si,MT_DATA_OFF+MENU_TEXT_CAP
        ja .bad
        loop .label
.padding:
        cmp si,MT_DATA_OFF+MENU_TEXT_CAP
        jae .done
        cmp byte [loadbuf+si],0
        jne .bad
        inc si
        jmp .padding
.done:
        cmp byte [ackname],0
        je .bad
        clc
        ret
.bad: stc
        ret

show_horizontal_labels:
        mov word [horizontal_ordinal],1
        mov si,MT_DATA_OFF
        mov cx,[loadbuf+MN_COUNT_OFF]
.label:
        jcxz .done
        push cx
        mov ax,[horizontal_ordinal]
        call print_horizontal_ordinal
        mov dl,'.'
        mov ah,02h
        int 21h
        mov dl,' '
        int 21h
        call print_pending_label
        mov dl,13
        mov ah,02h
        int 21h
        mov dl,10
        int 21h
        inc word [horizontal_ordinal]
        pop cx
        loop .label
.done: ret

print_horizontal_ordinal:
        push bx
        push cx
        push dx
        mov bx,10
        xor cx,cx
.divide:
        xor dx,dx
        div bx
        push dx
        inc cx
        test ax,ax
        jnz .divide
.digit:
        pop dx
        add dl,'0'
        mov ah,02h
        int 21h
        loop .digit
        pop dx
        pop cx
        pop bx
        ret
horizontal_ordinal dw 0
s_horizontal_input db 'Choose 1..N: $'
