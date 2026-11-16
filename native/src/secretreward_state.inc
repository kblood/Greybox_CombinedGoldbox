; PRIVATE finite reward derivation, never origin/file/journal/public authority.
; Caller owns immutable preimages and admits source/member/generation/GBKO.
; DS=ES; rz_begin has admitted actual DS extent and disjoint GS32K/FS64K.
; rt_init SI=actual admitted756,CX=count,DX=flags,BX=selected,AL=phase0/2.
; rt_apply SI=bound raw GBRA128(result0),CX=suppression,BP=precleanup6E4.
; CF0 private rt_state160/items960/ledger1056/current rz FSpost; rt_result.
; CF1 DISCARD all private postimages. Early source/output alias fails without
; touching source bytes, so CF1 overrides any stale private valid marker.
; Segments preserved; general regs scratch. No FS16000/32000 scratch or UI quota.
rt_init:
        push ax
        push cx
        push dx
        push bx
        push si
        mov cx,756
        call rt_span
        pop si
        pop bx
        pop dx
        pop cx
        pop ax
        jc rt_early_bad
        mov byte [rt_valid],0
        cmp byte [rz_valid],1
        jne rt_fail
        cmp al,0
        je .phase
        cmp al,2
        jne rt_fail
.phase:
        mov [rt_initial_phase],al
        cmp cx,1
        jb rt_fail
        cmp cx,6
        ja rt_fail
        cmp cx,[sr_count]
        jne rt_fail
        cmp dx,1
        ja rt_fail
        cmp bx,cx
        ja rt_fail
        test dx,dx
        jnz .selected
        test bx,bx
        jnz rt_fail
        jmp .identity
.selected:
        test bx,bx
        jz rt_fail
.identity:
        mov [rt_count],cx
        mov [rt_initial_flags],dx
        mov [rt_initial_selected],bx
        mov [rt_member],si
        mov di,rt_state
        xor ax,ax
        mov cx,160+960+1056
        rep stosb
        mov dword [rt_state],'GBRW'
        mov dword [rt_state+4],00a00001h
        movzx ax,byte [rt_initial_phase]
        mov [rt_state+8],ax
        mov ax,[rt_count]
        mov [rt_state+10],ax
        mov ax,[rt_initial_flags]
        mov [rt_state+12],ax
        mov ax,[rt_initial_selected]
        mov [rt_state+14],ax
        mov dword [rt_state+28],15000
        mov dword [rt_state+52],20
        mov dword [rt_state+100],0ffffffffh
        mov dword [rt_ledger],'GBRL'
        mov dword [rt_ledger+4],00100001h
        mov word [rt_ledger+10],32
        mov word [rt_ledger+12],1
        mov word [rt_cursor],0
.item:
        mov ax,[rt_cursor]
        imul ax,80
        mov di,rt_items
        add di,ax
        mov ax,[rt_cursor]
        mov [di],ax
        mov word [di+8],0ffffh
        add di,12
        mov si,[rt_member]
        mov cx,63
        rep movsb
        mov [rt_member],si
        inc word [rt_cursor]
        cmp word [rt_cursor],12
        jb .item
        mov byte [rt_r_written],0
        mov word [rt_result],0
        call rt_sync
        call rt_validate
        jc rt_fail
        mov byte [rt_valid],1
        clc
        ret

; Read-only input span check; caller must not alias immutable request/member
; bytes with this module's output/scratch cells. rz owns DS/bank interval proof.
rt_span:
        movzx eax,si
        movzx edx,cx
        add edx,eax
        movzx ebx,word [rz_ds_extent]
        cmp edx,ebx
        ja rt_early_bad
        cmp eax,rt_storage_end
        jae .ok
        cmp edx,rt_storage_start
        jbe .ok
        stc
        ret
.ok:   clc
        ret
rt_early_bad:
        stc
        ret
rt_fail:
        mov byte [rt_valid],0
        mov byte [rz_valid],0
        call rz_restore
        stc
        ret

rt_apply:
        push si
        push cx
        push bp
        mov cx,128
        call rt_span
        pop bp
        pop cx
        pop si
        jc rt_early_bad
        cmp byte [rt_valid],1
        jne rt_fail
        cmp byte [rz_valid],1
        jne rt_fail
        mov [rt_request],si
        mov [rt_suppression],cx
        mov [rt_bank],bp
        call rt_validate
        jc rt_fail
        mov si,[rt_request]
        cmp dword [si],'GBRA'
        jne rt_fail
        cmp dword [si+4],00800001h
        jne rt_fail
        cmp word [si+28],0
        jne rt_fail
        cmp word [si+30],0
        jne rt_fail
        cmp word [si+38],16
        jne rt_fail
        mov ax,[rt_state+8]
        cmp ax,[si+16]
        jne rt_fail
        mov ax,605
        cmp word [si+16],2
        jae .pc
        mov ax,6940
.pc:
        cmp ax,[si+40]
        jne rt_fail
        mov eax,[rt_state+12]
        cmp eax,[si+32]
        jne rt_fail
        mov ax,[rt_state+10]
        cmp ax,[si+36]
        jne rt_fail
        mov di,si
        add di,42
        mov cx,86
        call rt_zero
        jc rt_fail
        mov ax,[si+18]
        mov [rt_action],ax
        mov ax,[si+20]
        mov [rt_recipient],ax
        mov ax,[si+22]
        mov [rt_item],ax
        mov eax,[si+24]
        mov [rt_value],eax
        mov ax,[rt_action]
        cmp ax,6
        je .recipient_used
        cmp ax,7
        je .recipient_used
        cmp ax,10
        je .recipient_used
        cmp ax,12
        je .recipient_used
        cmp word [rt_recipient],0
        jne rt_fail
.recipient_used:
        cmp ax,10
        je .item_used
        cmp word [rt_item],0ffffh
        jne rt_fail
.item_used:
        cmp ax,12
        je .value_used
        cmp dword [rt_value],0
        jne rt_fail
.value_used:
        mov byte [rt_valid],0
        mov word [rt_result],1
        cmp ax,4
        je rt_award
        cmp ax,5
        je rt_continue
        cmp ax,6
        je rt_cycle
        cmp ax,7
        je rt_cycle
        cmp ax,8
        je rt_enter_items
        cmp ax,9
        je rt_exit_items
        cmp ax,10
        je rt_take
        cmp ax,11
        je rt_enter_money
        cmp ax,12
        je rt_gems
        cmp ax,13
        je rt_cancel
        cmp ax,14
        je rt_leave
        cmp ax,15
        je rt_return
        cmp ax,16
        je rt_abandon
        cmp ax,18
        je rt_rejoin
        cmp ax,20
        je rt_enter_take
        cmp ax,21
        je rt_exit_take
        cmp ax,22
        je rt_exit_coins
        cmp ax,23
        je rt_amount
        jmp rt_fail

rt_award:
        cmp word [rt_state+8],2
        jne rt_fail
        mov cx,[rt_suppression]
        call rz_award
        jc rt_fail
        mov si,rz_awards
        mov di,rt_state+72
        mov cx,12
        rep movsw
        mov dword [rt_state+12],00010001h ; original7D29 head reset
        mov dword [rt_state+108],3
        ; AddendumD mandatory827E R1..Rcount prefix BEFORE optional epoch0.
        mov word [rt_cursor],1
.r:
        mov ax,[rt_cursor]
        mov bp,[rt_bank]
        call rz_recalc
        jc rt_fail
        call rt_capture_r
        inc word [rt_cursor]
        mov ax,[rt_cursor]
        cmp ax,[rt_state+10]
        jbe .r
        mov word [rt_state+8],3
        jmp rt_finish
rt_continue:
        cmp word [rt_state+8],3
        jne rt_fail
        mov word [rt_state+8],4
        jmp rt_finish
rt_cycle:
        mov ax,[rt_state+8]
        cmp ax,4
        je .cycle
        cmp ax,5
        jne rt_fail
.cycle:
        mov ax,[rt_state+14]
        cmp word [rt_action],6
        jne .next
        dec ax
        jnz .compare
        mov ax,[rt_state+10]
        jmp .compare
.next: inc ax
        cmp ax,[rt_state+10]
        jbe .compare
        mov ax,1
.compare:
        cmp ax,[rt_recipient]
        jne rt_fail
        mov [rt_state+14],ax
        jmp rt_finish
rt_enter_take:
        cmp word [rt_state+8],4
        jne rt_fail
        cmp word [rt_state+16],0
        je .only_money
        cmp dword [rt_state+52],0
        je .only_items
        mov word [rt_state+8],5
        jmp rt_finish
.only_items:
        mov word [rt_state+8],6
        mov al,1
        call rt_do_operator
        jc rt_fail
        jmp rt_finish
.only_money:
        cmp dword [rt_state+52],0
        je rt_finish
        mov word [rt_state+8],7
        jmp rt_finish
rt_enter_items:
        cmp word [rt_state+8],5
        jne rt_fail
        cmp word [rt_state+16],0
        je rt_fail
        mov word [rt_state+8],6
        mov al,1
        call rt_do_operator
        jc rt_fail
        jmp rt_finish
rt_exit_items:
        cmp word [rt_state+8],6
        jne rt_fail
        jmp rt_collection_target
rt_enter_money:
        cmp word [rt_state+8],5
        jne rt_fail
        cmp dword [rt_state+52],0
        je rt_fail
        mov word [rt_state+8],7
        jmp rt_finish
rt_exit_take:
        cmp word [rt_state+8],5
        jne rt_fail
        mov word [rt_state+8],4
        jmp rt_finish
rt_exit_coins:
        cmp word [rt_state+8],7
        jne rt_fail
rt_collection_target:
        mov word [rt_state+8],4
        cmp word [rt_state+16],0
        je rt_finish
        cmp dword [rt_state+52],0
        je rt_finish
        mov word [rt_state+8],5
        jmp rt_finish
rt_amount:
        cmp word [rt_state+8],7
        jne rt_fail
        cmp dword [rt_state+52],0
        je rt_fail
        mov word [rt_state+8],8
        jmp rt_finish
rt_cancel:
        cmp word [rt_state+8],8
        jne rt_fail
        mov word [rt_state+8],7
        mov word [rt_result],2
        jmp rt_finish
rt_gems:
        cmp word [rt_state+8],8
        jne rt_fail
        mov bx,[rt_recipient]
        cmp bx,[rt_state+14]
        jne rt_fail
        mov eax,[rt_value]
        cmp eax,[rt_state+52]
        ja rt_fail
        mov edx,[rt_state+52]
        call rz_gems
        jc rt_fail
        mov [rt_result],cx
        mov [rt_transfer_amount],eax
        mov [rt_state+52],edx
        mov word [rt_state+8],7
        cmp cx,3
        je rt_finish
        test eax,eax
        jz rt_finish
        mov bx,[rt_recipient]
        dec bx
        shl bx,1
        add [rt_state+60+bx],ax
        mov word [rt_transfer_kind],2
        mov word [rt_item],0ffffh
        call rt_transfer
        jc rt_fail
        cmp dword [rt_state+52],0
        jne rt_finish
        mov word [rt_state+8],4
        jmp rt_finish
rt_take:
        cmp word [rt_state+8],6
        jne rt_fail
        mov ax,[rt_recipient]
        cmp ax,[rt_state+14]
        jne rt_fail
        mov bx,[rt_item]
        cmp bx,12
        jae rt_fail
        imul bx,80
        cmp byte [rt_items+bx+2],0
        jne rt_fail
        mov [rt_item_offset],bx
        ; Current post STF extent, not original source metadata after growth.
        call rt_meta
        jc rt_fail
        mov bx,[rt_recipient]
        dec bx
        shl bx,1
        mov ax,[sr_stf_len+bx]
        mov [rt_prior_stf],ax
        call rz_restore
        jc rt_fail
        mov di,rt_items+12
        add di,[rt_item_offset]
        mov ax,[rt_recipient]
        mov bp,[rt_bank]
        call rz_take
        jc rt_fail
        call rt_capture_r
        cmp cx,3
        je .refused
        mov bx,[rt_item_offset]
        mov byte [rt_items+bx+2],1
        mov ax,[rt_recipient]
        mov [rt_items+bx+3],al
        mov ax,[rt_state+96]
        inc ax
        mov [rt_items+bx+4],ax
        mov ax,[rt_prior_stf]
        mov [rt_items+bx+8],ax
        mov dword [rt_items+bx+12+42],0
        mov word [rt_transfer_kind],1
        mov dword [rt_transfer_amount],1
        call rt_transfer
        jc rt_fail
        call rt_sync
        cmp word [rt_state+16],0
        je .final
        ; Actual782F→7773 redraw F AFTER unlink, in the NEW epoch.
        mov al,1
        call rt_do_operator
        jc rt_fail
        jmp rt_finish
.final:
        mov word [rt_state+8],4
        jmp rt_finish
.refused:
        mov ax,[rt_recipient]
        inc ax
        call rt_do_operator
        jc rt_fail
        mov al,1                 ; source redraw after refusal: SAME epoch R,F
        call rt_do_operator
        jc rt_fail
        mov word [rt_result],3
        jmp rt_finish
rt_leave:
        cmp word [rt_state+8],4
        jne rt_fail
        mov word [rt_state+8],10
        cmp word [rt_state+16],0
        jne .confirm
        cmp dword [rt_state+52],0
        je rt_finish
.confirm:
        mov word [rt_state+8],9
        jmp rt_finish
rt_return:
        cmp word [rt_state+8],9
        jne rt_fail
        mov word [rt_state+8],4
        jmp rt_finish
rt_abandon:
        cmp word [rt_state+8],9
        jne rt_fail
        mov di,rt_items
        mov cx,12
.item:
        cmp byte [di+2],0
        jne .next
        mov byte [di+2],2
.next: add di,80
        loop .item
        or dword [rt_state+108],4
        mov word [rt_state+8],10
        jmp rt_finish
rt_rejoin:
        cmp word [rt_state+8],10
        jne rt_fail
        mov word [rt_state+8],11
        jmp rt_finish

; Private replay operator API only, not a UI action or origin/replay grant.
rt_operator:
        mov [rt_bank],bp
        cmp byte [rt_valid],1
        jne rt_fail
        cmp byte [rz_valid],1
        jne rt_fail
        mov [rt_op],al
        call rt_validate
        jc rt_fail
        mov byte [rt_valid],0
        mov al,[rt_op]
        call rt_do_operator
        jc rt_fail
        jmp rt_finish
rt_do_operator:
        mov [rt_op],al
        cmp al,1
        je .format
        cmp al,2
        jb rt_fail
        movzx ax,al
        dec ax
        cmp ax,[rt_state+10]
        ja rt_fail
        mov bp,[rt_bank]
        call rz_recalc
        jc rt_fail
        call rt_capture_r
        jmp rt_push_op
.format:
        call rz_enter
        jc rt_fail
        mov byte [rt_star],0
        mov word [rt_cursor],0
.actor:
        mov bx,[rt_cursor]
        shl bx,1
        mov si,[sr_sfx+bx]
        mov cx,[sr_sfx_len+bx]
.sfx:
        jcxz .next_actor
        cmp byte [fs:si],5
        jne .next_sfx
        mov byte [rt_star],1
.next_sfx:
        add si,9
        sub cx,9
        jmp .sfx
.next_actor:
        inc word [rt_cursor]
        mov ax,[rt_cursor]
        cmp ax,[rt_state+10]
        jb .actor
        mov word [rt_cursor],0
.pending:
        mov bx,[rt_cursor]
        imul bx,80
        cmp byte [rt_items+bx+2],0
        jne .next_item
        mov si,rt_items+12
        add si,bx
        mov al,[rt_star]
        xor ah,ah                ; production no View/ready prefix
        call rf_format
        jc rt_fail
        mov bx,[rt_cursor]
        imul bx,80
        mov word [rt_items+bx+6],1
.next_item:
        inc word [rt_cursor]
        cmp word [rt_cursor],12
        jb .pending
        call rz_finish
        jc rt_fail
rt_push_op:
        mov bx,[rt_ledger+8]
        shl bx,4
        add bx,rt_ledger+528
        movzx cx,byte [bx+1]
        xor si,si
.find:
        cmp si,cx
        jae .append
        mov al,[rt_op]
        cmp [bx+si+2],al
        je .remove
        inc si
        jmp .find
.remove:
        dec cx
.shift:
        cmp si,cx
        jae .append
        mov al,[bx+si+3]
        mov [bx+si+2],al
        inc si
        jmp .shift
.append:
        cmp cx,7
        jae rt_fail
        mov si,cx
        mov al,[rt_op]
        mov [bx+si+2],al
        inc cx
        mov [bx+1],cl
        clc
        ret
rt_capture_r:
        mov ax,[rp_ready_weight]
        mov [rt_ready_weight],ax
        mov al,[rp_movement]
        mov [rt_movement],al
        mov byte [rt_r_written],1
        ret
rt_meta:
        push gs
        push fs
        pop gs
        mov ax,[rz_length]
        mov [sr_length],ax
        call sr_validate
        pop gs
        ret
rt_transfer:
        mov ax,[rt_ledger+8]
        cmp ax,32
        jae rt_fail
        mov bx,ax
        shl bx,4
        add bx,rt_ledger+16
        mov dx,[rt_transfer_kind]
        mov [bx],dx
        mov dx,[rt_recipient]
        mov [bx+2],dx
        mov dx,[rt_item]
        mov [bx+4],dx
        mov word [bx+6],0
        mov edx,[rt_transfer_amount]
        mov [bx+8],edx
        inc ax
        movzx edx,ax
        mov [bx+12],edx
        mov [rt_ledger+8],ax
        mov bx,ax
        inc ax
        mov [rt_ledger+12],ax
        shl bx,4
        add bx,rt_ledger+528
        mov di,bx
        xor ax,ax
        mov cx,16
        rep stosb
        mov ax,[rt_ledger+8]
        mov [bx],al
        clc
        ret
rt_sync:
        xor ax,ax
        mov [rt_state+16],ax
        mov [rt_state+18],ax
        mov [rt_state+20],ax
        mov [rt_state+22],ax
        mov [rt_state+96],ax
        mov di,rt_items
        mov dx,1
        mov cx,12
.item:
        movzx bx,byte [di+2]
        shl bx,1
        or [rt_state+16+bx],dx
        cmp byte [di+2],1
        jne .formatted
        inc word [rt_state+96]
.formatted:
        cmp word [di+6],0
        je .next
        or [rt_state+22],dx
.next: shl dx,1
        add di,80
        loop .item
        mov ax,[rt_ledger+8]
        mov [rt_state+98],ax
        mov word [rt_state+100],0ffffh
        mov word [rt_state+102],0ffffh
        mov dword [rt_state+104],0
        cmp word [rt_state+8],8
        jne .epoch
        mov word [rt_state+102],5
        mov eax,[rt_state+52]
        mov [rt_state+104],eax
.epoch:
        mov bx,[rt_ledger+8]
        shl bx,4
        add bx,rt_ledger+528
        movzx cx,byte [bx+1]
        xor si,si
        xor dx,dx
.op:
        jcxz .done
        mov al,[bx+si+2]
        cmp al,2
        jb .next_op
        sub al,2
        push cx
        mov cl,al
        mov ax,1
        shl ax,cl
        or dx,ax
        pop cx
.next_op:
        inc si
        dec cx
        jmp .op
.done:
        mov [rt_state+112],dx
        ret
rt_finish:
        call rt_sync
        call rt_validate
        jc rt_fail
        mov byte [rt_valid],1
        clc
        ret

; Validator is defined below; bounded request zero helper preserves SI.
rt_zero:
        push ax
.byte: jcxz .ok
        cmp byte [di],0
        jne .bad
        inc di
        dec cx
        jmp .byte
.ok:   pop ax
        clc
        ret
.bad:  pop ax
        stc
        ret

rt_storage_start:
rt_valid db 0
rt_r_written db 0
rt_initial_phase db 0
rt_op db 0
rt_star db 0
rt_count dw 0
rt_initial_flags dw 0
rt_initial_selected dw 0
rt_member dw 0
rt_request dw 0
rt_suppression dw 0
rt_bank dw 0
rt_action dw 0
rt_recipient dw 0
rt_item dw 0
rt_item_offset dw 0
rt_prior_stf dw 0
rt_cursor dw 0
rt_result dw 0
rt_transfer_kind dw 0
rt_value dd 0
rt_transfer_amount dd 0
rt_ready_weight dw 0
rt_movement db 0
rt_check_state times 160 db 0
rt_check_gems times 6 dw 0
rt_check_acquired dw 0
rt_check_ledger_items dw 0
rt_check_ordinals dw 0
rt_check_gem_total dw 0
rt_check_transfer dw 0
rt_check_item_count dw 0
rt_check_epoch dw 0
rt_check_operators dw 0
rt_state times 160 db 0
rt_items times 960 db 0
rt_ledger times 1056 db 0
rt_storage_end:

; Closed canonical private wire validation. This does NOT prove source origin,
; exact resource/XP/P1 derivation, context, generation, producer or recovery.
rt_validate:
        cmp dword [rt_state],'GBRW'
        jne .bad
        cmp dword [rt_state+4],00a00001h
        jne .bad
        cmp word [rt_state+8],11
        ja .bad
        mov ax,[rt_state+10]
        cmp ax,1
        jb .bad
        cmp ax,6
        ja .bad
        cmp ax,[sr_count]
        jne .bad
        cmp word [rt_state+12],1
        ja .bad
        mov bx,[rt_state+14]
        cmp bx,ax
        ja .bad
        cmp word [rt_state+12],0
        jne .selected
        test bx,bx
        jnz .bad
        jmp .phase
.selected:
        test bx,bx
        jz .bad
.phase:
        cmp word [rt_state+8],3
        jb .preaward
        cmp word [rt_state+12],1
        jne .bad
        mov eax,[rt_state+108]
        cmp eax,3
        je .flags
        cmp eax,7
        jne .bad
        cmp word [rt_state+8],10
        jb .bad
        jmp .flags
.preaward:
        cmp dword [rt_state+108],0
        jne .bad
        mov di,rt_state+60
        mov cx,36
        call rt_zero
        jc .bad
.flags:
        cmp dword [rt_state+28],15000
        jne .bad
        cmp dword [rt_state+24],0
        jne .bad
        mov di,rt_state+114
        mov cx,46
        call rt_zero
        jc .bad
        mov di,rt_state+32
        mov cx,20
        call rt_zero
        jc .bad
        cmp dword [rt_state+56],0
        jne .bad
        cmp dword [rt_state+52],20
        ja .bad
        mov word [rt_check_gem_total],0
        xor bx,bx
.receipt:
        mov ax,[rt_state+60+bx]
        cmp ax,20
        ja .bad
        add [rt_check_gem_total],ax
        add bx,2
        cmp bx,12
        jb .receipt
        mov ax,[rt_check_gem_total]
        add ax,[rt_state+52]
        cmp ax,20
        jne .bad
        mov bx,[rt_state+10]
        mov di,rt_state+60
        shl bx,1
        add di,bx
        mov cx,12
        sub cx,bx
        call rt_zero
        jc .bad
        mov bx,[rt_state+10]
        shl bx,2
        mov di,rt_state+72
        add di,bx
        mov cx,24
        sub cx,bx
        call rt_zero
        jc .bad
        mov word [rt_check_acquired],0
        mov word [rt_check_ordinals],0
        mov word [rt_check_item_count],0
        mov word [rt_cursor],0
.item:
        mov bx,[rt_cursor]
        imul bx,80
        mov si,rt_items
        add si,bx
        mov ax,[rt_cursor]
        cmp ax,[si]
        jne .bad
        cmp byte [si+2],2
        ja .bad
        cmp word [si+6],1
        ja .bad
        cmp word [si+10],0
        jne .bad
        cmp byte [si+79],0
        jne .bad
        cmp byte [si+12],40
        ja .bad
        cmp byte [si+12+46],73
        je .bad
        cmp byte [si+12+46],128
        jae .bad
        cmp dword [si+12+42],0
        jne .bad
        cmp byte [si+2],1
        je .acquired
        cmp byte [si+3],0
        jne .bad
        cmp word [si+4],0
        jne .bad
        cmp word [si+8],0ffffh
        jne .bad
        jmp .item_next
.acquired:
        cmp word [si+6],1
        jne .bad
        movzx ax,byte [si+3]
        cmp ax,1
        jb .bad
        cmp ax,[rt_state+10]
        ja .bad
        mov cx,[si+4]
        cmp cx,1
        jb .bad
        cmp cx,12
        ja .bad
        dec cx
        mov ax,1
        shl ax,cl
        test [rt_check_ordinals],ax
        jnz .bad
        or [rt_check_ordinals],ax
        mov cx,[rt_cursor]
        mov ax,1
        shl ax,cl
        or [rt_check_acquired],ax
        inc word [rt_check_item_count]
        mov ax,[si+8]
        cmp ax,32701
        ja .bad
        xor dx,dx
        mov bx,67
        div bx
        test dx,dx
        jnz .bad
.item_next:
        inc word [rt_cursor]
        cmp word [rt_cursor],12
        jb .item
        mov cx,[rt_check_item_count]
        mov ax,1
        shl ax,cl
        dec ax
        cmp ax,[rt_check_ordinals]
        jne .bad
        cmp dword [rt_ledger],'GBRL'
        jne .bad
        cmp dword [rt_ledger+4],00100001h
        jne .bad
        cmp word [rt_ledger+10],32
        jne .bad
        cmp word [rt_ledger+14],0
        jne .bad
        mov ax,[rt_ledger+8]
        cmp ax,32
        ja .bad
        inc ax
        cmp ax,[rt_ledger+12]
        jne .bad
        mov di,rt_check_gems
        xor ax,ax
        mov cx,6
        rep stosw
        mov word [rt_check_ledger_items],0
        mov word [rt_check_item_count],0
        mov word [rt_check_transfer],0
.transfer:
        mov bx,[rt_check_transfer]
        cmp bx,[rt_ledger+8]
        jae .unused_transfers
        shl bx,4
        mov si,rt_ledger+16
        add si,bx
        cmp word [si+6],0
        jne .bad
        movzx eax,word [rt_check_transfer]
        inc eax
        cmp eax,[si+12]
        jne .bad
        mov dx,[si+2]
        cmp dx,1
        jb .bad
        cmp dx,[rt_state+10]
        ja .bad
        cmp word [si],1
        je .item_transfer
        cmp word [si],2
        jne .bad
        cmp word [si+4],0ffffh
        jne .bad
        mov eax,[si+8]
        cmp eax,1
        jb .bad
        cmp eax,20
        ja .bad
        mov bx,dx
        dec bx
        shl bx,1
        add [rt_check_gems+bx],ax
        cmp word [rt_check_gems+bx],20
        ja .bad
        jmp .transfer_next
.item_transfer:
        cmp dword [si+8],1
        jne .bad
        mov cx,[si+4]
        cmp cx,12
        jae .bad
        mov ax,1
        shl ax,cl
        test [rt_check_ledger_items],ax
        jnz .bad
        or [rt_check_ledger_items],ax
        mov di,cx
        imul di,80
        add di,rt_items
        cmp byte [di+2],1
        jne .bad
        cmp [di+3],dl
        jne .bad
        inc word [rt_check_item_count]
        mov ax,[rt_check_item_count]
        cmp ax,[di+4]
        jne .bad
.transfer_next:
        inc word [rt_check_transfer]
        jmp .transfer
.unused_transfers:
        mov ax,[rt_check_acquired]
        cmp ax,[rt_check_ledger_items]
        jne .bad
        mov si,rt_check_gems
        mov di,rt_state+60
        mov cx,6
        repe cmpsw
        jne .bad
        mov bx,[rt_ledger+8]
        shl bx,4
        mov di,rt_ledger+16
        add di,bx
        mov cx,512
        sub cx,bx
        call rt_zero
        jc .bad
        mov word [rt_check_epoch],0
.epoch:
        mov ax,[rt_check_epoch]
        cmp ax,[rt_ledger+8]
        ja .unused_epochs
        mov bx,ax
        shl bx,4
        add bx,rt_ledger+528
        cmp [bx],al
        jne .bad
        movzx dx,byte [bx+1]
        cmp dx,7
        ja .bad
        xor si,si
        mov word [rt_check_operators],0
.operator:
        cmp si,dx
        jae .epoch_zero
        movzx cx,byte [bx+si+2]
        cmp cx,1
        jb .bad
        mov ax,[rt_state+10]
        inc ax
        cmp cx,ax
        ja .bad
        dec cx
        mov ax,1
        shl ax,cl
        test [rt_check_operators],ax
        jnz .bad
        or [rt_check_operators],ax
        inc si
        jmp .operator
.epoch_zero:
        mov di,bx
        add di,2
        add di,dx
        mov cx,14
        sub cx,dx
        call rt_zero
        jc .bad
        inc word [rt_check_epoch]
        jmp .epoch
.unused_epochs:
        shl ax,4
        mov di,rt_ledger+528
        add di,ax
        mov cx,528
        sub cx,ax
        call rt_zero
        jc .bad
        ; Compare exact original serialized state against derived redundant
        ; masks/counters/amount fields/current epoch Rmask; never normalize it.
        mov si,rt_state
        mov di,rt_check_state
        mov cx,160
        rep movsb
        call rt_sync
        mov si,rt_check_state
        mov di,rt_state
        mov cx,160
        repe cmpsb
        jne .bad
        cmp word [rt_state+8],6
        jne .finished
        mov ax,[rt_state+16]
        and ax,[rt_state+22]
        cmp ax,[rt_state+16]
        jne .bad
.finished:
        cmp word [rt_state+8],10
        jb .ok
        cmp word [rt_state+16],0
        jne .bad
        cmp dword [rt_state+108],3
        jne .ok
        cmp dword [rt_state+52],0
        jne .bad
.ok:   clc
        ret
.bad:  stc
        ret
