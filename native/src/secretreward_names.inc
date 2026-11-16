; Fixed pending F only. Caller admits exact member18 and complete party SFX.
; DS=ES, SI=private owned67-byte stage, AL=party-effect5 boolean, AH=ready
; prefix boolean (closed helper diagnostic ONLY; production always AH=0).
; CFclear: writes cache0..40 only;41..66 exact. CFset: no stage writes.
; SI/segments preserved; other regs scratch. No authority/publication/View.
rf_format:
        push si
        cmp al,1
        ja .bad
        cmp ah,1
        ja .bad
        cmp byte [si+46],73
        je .bad
        mov [rf_flags],ax
        mov [rf_record],si
        mov byte [rf_mask],0
        mov byte [rf_plural],0
        mov dx,0104h             ; DH=include bit, DL=identification bit
        mov bp,1
.preflight:
        mov bx,bp
        mov al,[si+bx+46]
        test al,al
        jz .pre_next
        test [si+53],dl
        jnz .pre_next
        call rf_find
        jc .bad
        or [rf_mask],dh
.pre_next:
        shl dh,1
        shr dl,1
        inc bp
        cmp bp,4
        jb .preflight
        mov byte [si],0          ; all rejection checks precede cache mutation
        cmp byte [rf_flags+1],0
        je .effect
        mov di,rf_no
        cmp byte [si+52],0
        je .prefix
        mov di,rf_yes
.prefix:
        mov cx,6
        call rf_append
.effect:
        cmp byte [rf_flags],0
        je .quantity
        cmp byte [si+50],0
        jg .star                ; original SIGNED byte predicates
        cmp byte [si+51],0
        jg .star
        cmp byte [si+54],0
        je .quantity
.star:
        mov di,rf_star
        mov cx,2
        call rf_append
.quantity:
        movzx ax,byte [si+57]
        test ax,ax
        jz .tokens
        mov di,rf_digits+2
        xor cx,cx
        mov bl,10
.decimal:
        div bl
        add ah,'0'
        mov [di],ah
        dec di
        inc cx
        xor ah,ah
        test ax,ax
        jnz .decimal
        inc di
        call rf_append
        mov di,rf_space
        mov cx,1
        call rf_append
.tokens:
        mov bp,3
.token:
        mov cx,bp
        dec cx
        mov dl,1
        shl dl,cl
        test [rf_mask],dl
        jz .token_next
        mov bx,bp
        mov al,[si+bx+46]
        call rf_find             ; guaranteed by preflight; exact source row
        movzx cx,byte [di]
        inc di
        call rf_append
        cmp byte [si+57],2
        jb .space
        cmp byte [rf_plural],0
        jne .space
        mov cx,bp
        dec cx
        mov dl,1
        shl dl,cl
        cmp [rf_mask],dl
        je .plural
        cmp bp,1
        jne .second
        cmp byte [rf_mask],4
        ja .plural
        jmp .space
.second:
        cmp bp,2
        jne .third
        test byte [rf_mask],1
        jz .plural
        jmp .space
.third:
        cmp byte [si+49],93
        je .space
        mov al,[si+46]
        cmp al,30
        je .plural
        cmp al,5
        je .plural
        cmp al,12
        jne .space
.plural:
        mov byte [rf_plural],1
        mov di,rf_plural_text
        mov cx,2
        call rf_append
        jmp .token_next
.space:
        mov di,rf_space
        mov cx,1
        call rf_append
.token_next:
        dec bp
        jnz .token
        pop si
        clc
        ret
.bad:
        pop si
        stc
        ret

; AL=token ID -> DI=exact21-byte Pascal source row, CFclear; unknown CFset.
; DX/SI/BP preserved for preflight; no item writes.
rf_find:
        mov di,rf_tokens
        mov cx,22
.row:
        cmp [di],al
        je .found
        add di,22
        loop .row
        stc
        ret
.found:
        inc di
        clc
        ret

; DI=fragment,CX=length. Append clips40 and preserves every stale tail byte.
rf_append:
        push si
        mov bx,[rf_record]
        movzx ax,byte [bx]
        mov si,bx
        add si,ax
        inc si
.byte:
        test cx,cx
        jz .done
        cmp ax,40
        jae .done
        mov dl,[di]
        inc di
        mov [si],dl
        inc si
        inc ax
        dec cx
        jmp .byte
.done:
        mov [bx],al
        pop si
        ret

rf_yes db ' Yes  '
rf_no db ' No   '
rf_star db '* '
rf_space db ' '
rf_plural_text db 's '
rf_flags dw 0
rf_record dw 0
rf_mask db 0
rf_plural db 0
rf_digits times 3 db 0

; Approved exact22 ID+Pascal rows. Not twelve assembled item labels.
%macro RF_TOKEN 2
        db %1
%%row:  db %strlen(%2),%2
        times 21-($-%%row) db 0
%endmacro
rf_tokens:
        RF_TOKEN 8,'Mace'
        RF_TOKEN 18,'Long Sword'
        RF_TOKEN 30,'Arrow'
        RF_TOKEN 31,'Leather'
        RF_TOKEN 33,'Scale'
        RF_TOKEN 36,'Plate'
        RF_TOKEN 37,'Shield'
        RF_TOKEN 39,'Scroll'
        RF_TOKEN 40,'Mage'
        RF_TOKEN 47,'Mail'
        RF_TOKEN 48,'Armor'
        RF_TOKEN 50,'Bracers'
        RF_TOKEN 51,'Wand'
        RF_TOKEN 62,'Ice Storm'
        RF_TOKEN 71,'Halberd'
        RF_TOKEN 72,'Gauntlets'
        RF_TOKEN 78,'Ogre Power'
        RF_TOKEN 90,'of'
        RF_TOKEN 102,'3 Spells'
        RF_TOKEN 107,'AC 6'
        RF_TOKEN 111,'+1'
        RF_TOKEN 112,'+2'
%unmacro RF_TOKEN 2
