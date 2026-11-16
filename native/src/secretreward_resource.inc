; Strict READ-ONLY fixed ITEM.GLB/member18 admission, never reward authority.
; ru_validate EAX=physical archivebase,EDX=whole archiveextent, kc_fh already
; open/kc_extent physical EOF/kc_view_active=0 -> CF0 exact ru_descriptor32.
; Caller owns exact open/close/freeze and all origin/typed recovery semantics.
; Uses rr_read_at's exact returned seek/exact read and rf_find's pinned tokens.
; ru_check_descriptor SI=GBRI32 -> CF0 exact current validated metadata only.
; All registers scratch; DS=ES required. Input archive is never written.
RU_ARCHIVE_MAX equ 16*1024*1024
ru_validate:
        mov word [ru_valid],0
        cmp byte [kc_view_active],0
        jne ru_bad
        cmp edx,28
        jb ru_bad
        cmp edx,RU_ARCHIVE_MAX
        ja ru_bad
        mov [ru_base],eax
        mov [ru_length],edx
        add eax,edx
        jc ru_bad
        cmp eax,0x7fffffff
        ja ru_bad
        cmp eax,[kc_extent]
        ja ru_bad
        xor eax,eax
        mov cx,16
        mov di,ru_header
        call ru_read
        jc ru_bad
        cmp dword [ru_header],'GLIB'
        jne ru_bad
        cmp dword [ru_header+12],'DATA'
        jne ru_bad
        cmp word [ru_header+10],0100h
        jne ru_bad
        mov eax,[ru_header+4]
        call ru_be32
        cmp eax,[ru_length]
        jne ru_bad
        mov ax,[ru_header+8]
        xchg al,ah
        cmp ax,2
        jb ru_bad
        cmp ax,255                ; native256 pointers INCLUDES EOF
        ja ru_bad
        mov [ru_members],ax
        movzx eax,ax
        inc eax
        shl eax,2
        add eax,16
        cmp eax,[ru_length]
        ja ru_bad
        mov [ru_pointer_end],eax
        mov dword [ru_previous],0
        mov word [ru_index],0
.pointer:
        movzx eax,word [ru_index]
        shl eax,2
        add eax,16
        mov cx,4
        mov di,ru_buffer
        call ru_read
        jc ru_bad
        mov eax,[ru_buffer]
        call ru_be32
        cmp eax,[ru_length]
        ja ru_bad
        cmp eax,[ru_previous]
        jb ru_bad
        mov [ru_previous],eax
        cmp word [ru_index],0
        jne .second
        cmp eax,[ru_pointer_end]
        jb ru_bad
        mov [ru_table_start],eax
.second:
        cmp word [ru_index],1
        jne .next_pointer
        mov [ru_table_end],eax
.next_pointer:
        mov bx,[ru_index]
        cmp bx,[ru_members]
        je .pointers_done
        inc word [ru_index]
        jmp .pointer
.pointers_done:
        cmp eax,[ru_length]
        jne ru_bad
        mov eax,[ru_table_end]
        sub eax,[ru_table_start]
        cmp eax,2
        jb ru_bad
        cmp eax,512                ; native ID cap is BYTES, not entries
        ja ru_bad
        mov cx,ax
        mov [ru_table_bytes],ax
        mov eax,[ru_table_start]
        mov di,ru_table
        call ru_read
        jc ru_bad
        mov ax,[ru_table]
        xchg al,ah
        cmp ax,127
        ja ru_bad
        mov [ru_entries],ax
        shl ax,2
        add ax,2
        cmp ax,[ru_table_bytes]
        jne ru_bad
        mov word [ru_match],0
        mov si,ru_table+2
        mov cx,[ru_entries]
.entry:
        jcxz .entries_done
        mov ax,[si]
        xchg al,ah
        mov dx,[si+2]
        xchg dl,dh
        cmp dx,1
        jb ru_bad
        cmp dx,[ru_members]
        jae ru_bad
        mov di,ru_table+2
.unique:
        cmp di,si
        jae .unique_done
        mov bx,[di]
        xchg bl,bh
        cmp bx,ax
        je ru_bad
        add di,4
        jmp .unique
.unique_done:
        cmp ax,18
        jne .entry_next
        mov [ru_match],dx
.entry_next:
        add si,4
        dec cx
        jmp .entry
.entries_done:
        movzx eax,word [ru_match]
        test eax,eax
        jz ru_bad
        shl eax,2
        add eax,16
        mov cx,8
        mov di,ru_buffer
        call ru_read
        jc ru_bad
        mov eax,[ru_buffer]
        call ru_be32
        mov [ru_member_start],eax
        mov eax,[ru_buffer+4]
        call ru_be32
        sub eax,[ru_member_start]
        cmp eax,756
        jne ru_bad
        mov word [ru_row],0
.row:
        call ru_build_row
        movzx eax,word [ru_row]
        imul eax,63
        add eax,[ru_member_start]
        jc ru_bad
        mov cx,63
        mov di,ru_actual
        call ru_read
        jc ru_bad
        mov si,ru_expected
        mov di,ru_actual
        mov cx,63
        repe cmpsb                 ; EVERY byte, never CRC/hash/familiar fields
        jne ru_bad
        inc word [ru_row]
        cmp word [ru_row],12
        jb .row
        mov dword [ru_descriptor],'GBRI'
        mov dword [ru_descriptor+4],00200001h
        mov eax,[ru_length]
        mov [ru_descriptor+8],eax
        mov dword [ru_descriptor+12],18 ; member18/method0
        mov dword [ru_descriptor+16],1  ; kind1/reserved0
        mov dword [ru_descriptor+20],756
        mov eax,[ru_member_start]
        mov [ru_descriptor+24],eax
        mov dword [ru_descriptor+28],756
        mov word [ru_valid],1       ; comparator freshness ONLY, not authority
        clc
        ret
ru_bad:
        stc
        ret

ru_check_descriptor:
        cmp word [ru_valid],1
        jne ru_bad
        mov di,ru_descriptor
        mov cx,32
        repe cmpsb
        jne ru_bad
        clc
        ret

; EAX=archive-relative offset,CX=length,DI=DS destination.
ru_read:
        movzx edx,cx
        add edx,eax
        jc ru_bad
        cmp edx,[ru_length]
        ja ru_bad
        add eax,[ru_base]
        jc ru_bad
        jmp rr_read_at

ru_be32:
        xchg al,ah
        rol eax,16
        xchg al,ah
        ret

; Generate ONE63-byte comparison row from named facts and approved words.
; Initial cache is quantity + token49/48/47 joined with spaces, no F plural
; or trailing separator. Exact observed-zero cells are explicitly retained.
ru_build_row:
        mov di,ru_expected
        xor ax,ax
        mov cx,63
        rep stosb
        mov ax,[ru_row]
        imul ax,13
        mov si,ru_facts
        add si,ax
        mov di,ru_expected+46
        mov cx,5                 ; kind46/tokens47..49/magic50
        push si
        rep movsb
        pop si
        mov ax,[si+5]            ; unit_weight55
        mov [ru_expected+55],ax
        mov al,[si+7]            ; quantity57
        mov [ru_expected+57],al
        mov ax,[si+8]            ; price_word58
        mov [ru_expected+58],ax
        mov ax,[si+10]           ; auxiliary60/61, not assumed zero
        mov [ru_expected+60],ax
        mov al,[si+12]           ; auxiliary62
        mov [ru_expected+62],al
        cmp byte [si+7],0
        je .words
        movzx ax,byte [si+7]
        mov di,ru_digits+2
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
        mov [ru_expected],cl
        mov bx,1
.digit:
        mov al,[di]
        inc di
        mov [ru_expected+bx],al
        inc bx
        loop .digit
.words:
        mov bp,3
.word:
        mov bx,bp
        mov al,[si+bx]
        test al,al
        jz .next
        call rf_find             ; all fact tokens are the pinned22-word domain
        movzx cx,byte [di]
        inc di
        movzx bx,byte [ru_expected]
        test bx,bx
        jz .copy
        mov byte [ru_expected+bx+1],' '
        inc bx
.copy:
        mov al,[di]
        inc di
        mov [ru_expected+bx+1],al
        inc bx
        loop .copy
        mov [ru_expected],bl
.next:
        dec bp
        jnz .word
        ret

; Transparent named facts, archive order. No extracted/opaque resource blob.
; kind46,token47,token48,token49,magic50,unitweight55,quantity57,price58,aux60..62
%macro RU_FACT 11
        db %1,%2,%3,%4,%5
        dw %6
        db %7
        dw %8
        db %9,%10,%11
%endmacro
ru_facts:
        RU_FACT 36,111,47,36,1,450,0,5000,0,0,0       ; Plate Mail +1
        RU_FACT 37,0,112,37,2,50,0,5000,0,0,0        ; Shield +2
        RU_FACT 18,0,111,18,1,60,0,2000,0,0,0        ; Long Sword +1
        RU_FACT 8,0,111,8,1,100,0,3000,0,0,0         ; Mace +1
        RU_FACT 71,0,112,71,2,120,0,2500,0,0,0       ; Halberd +2
        RU_FACT 50,0,107,50,4,10,0,12000,0,0,0       ; Bracers AC6
        RU_FACT 52,62,90,51,6,10,0,15000,4,87,0      ; Wand; explicit aux60/61
        RU_FACT 72,78,90,72,2,10,0,15000,0,0,131      ; Gauntlets; aux62
        RU_FACT 33,112,47,33,2,400,0,1100,0,0,0      ; Scale Mail +2
        RU_FACT 31,111,48,31,1,150,0,800,0,0,0       ; Leather Armor +1
        RU_FACT 30,0,111,30,1,4,30,50,0,0,0          ; quantity30/singular Arrow
        RU_FACT 39,102,39,40,2,10,0,3000,113,111,51   ; Scroll; allthree auxbytes
%unmacro RU_FACT 11
ru_valid dw 0
ru_base dd 0
ru_length dd 0
ru_pointer_end dd 0
ru_previous dd 0
ru_table_start dd 0
ru_table_end dd 0
ru_member_start dd 0
ru_members dw 0
ru_index dw 0
ru_entries dw 0
ru_table_bytes dw 0
ru_match dw 0
ru_row dw 0
ru_digits times 3 db 0
ru_header times 16 db 0
ru_buffer times 8 db 0
ru_descriptor times 32 db 0
; Integrated RU precedes a complete1056-byte RL target reload. Opt-in callers
; discard the previous target's first512 bytes; controls and suffix stay live.
%ifdef RU_EXTERNAL_TABLE
ru_table equ RU_EXTERNAL_TABLE
%else
ru_table times 512 db 0
%endif
ru_expected times 63 db 0
ru_actual times 63 db 0
