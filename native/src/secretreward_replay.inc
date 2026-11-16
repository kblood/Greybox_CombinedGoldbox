; PRIVATE strict cold history, never source/owner/generation/GBKO admission.
; rl_derive DX=actualDSextent,SI=admitted756,CX=suppression,BP=precleanup6E4.
; GS=immutable originP1/sr_length; FS=private post64K; DS=ES.
; Immutable rl_target_state160/rl_target_ledger1056 are caller-loaded claims.
; CF0: FS P1/rz_length, rt_state/items/ledger and R globals rederived; exact
; targetstate+ledger match. Caller MUST compare full claimed P1/item960 too.
; CF1 DISCARD private outputs. Segments/SRmetadata/GS/target inputs preserved.
; No IO, UI quota, arbitrary optionalR, stale-movement normalization or grants.
rl_derive:
        push si
        push cx
        push bp
        push dx
        call rz_begin             ; actual DS/GS32K/FS64K interval proof first
        pop dx
        pop bp
        pop cx
        pop si
        jc rl_early_bad
        mov byte [rl_valid],0
        cmp dx,rl_storage_end
        jb rl_fail
        mov [rl_member],si
        mov [rl_suppression],cx
        mov [rl_bank],bp
        movzx eax,si
        add eax,756
        movzx edx,word [rz_ds_extent]
        cmp eax,edx
        ja rl_fail
        cmp si,rl_storage_end
        jae .member_ok
        cmp eax,rl_storage_start
        ja rl_fail
.member_ok:
        cmp dword [rl_target_state],'GBRW'
        jne rl_fail
        cmp dword [rl_target_state+4],00a00001h
        jne rl_fail
        mov ax,[rl_target_state+8]
        cmp ax,3
        jb rl_fail
        cmp ax,11
        ja rl_fail
        mov ax,[sr_count]
        cmp ax,[rl_target_state+10]
        jne rl_fail
        cmp word [rl_target_state+12],1
        jne rl_fail
        mov bx,[rl_target_state+14]
        cmp bx,1
        jb rl_fail
        cmp bx,ax
        ja rl_fail
        mov eax,[rl_target_state+108]
        cmp eax,3
        je .flags
        cmp eax,7
        jne rl_fail
.flags:
        cmp dword [rl_target_ledger],'GBRL'
        jne rl_fail
        cmp dword [rl_target_ledger+4],00100001h
        jne rl_fail
        cmp word [rl_target_ledger+10],32
        jne rl_fail
        cmp word [rl_target_ledger+14],0
        jne rl_fail
        mov ax,[rl_target_ledger+8]
        cmp ax,32
        ja rl_fail
        mov [rl_count],ax
        inc ax
        cmp ax,[rl_target_ledger+12]
        jne rl_fail
        mov si,[rl_member]
        mov cx,[sr_count]
        xor dx,dx
        xor bx,bx
        mov ax,2
        call rt_init
        jc rl_fail
        mov word [rl_action],4
        mov word [rl_recipient],0
        mov word [rl_item],0ffffh
        mov dword [rl_value],0
        call rl_dispatch          ; XP/head reset + mandatory ordered all-party R
        jc rl_fail
        mov word [rl_epoch],0
.epoch:
        mov bx,[rl_epoch]
        shl bx,4
        add bx,rl_target_ledger+528
        mov ax,[rl_epoch]
        cmp [bx],al
        jne rl_fail
        movzx cx,byte [bx+1]
        cmp cx,7
        ja rl_fail
        mov [rl_op_count],cx
        mov [rl_epoch_address],bx
        mov di,bx
        add di,2
        add di,cx
        neg cx
        add cx,14
        call rt_zero
        jc rl_fail
        cmp word [rl_op_count],0
        je .operators
        cmp word [rt_state+16],0
        je rl_fail               ; pending at THIS prefix, never final masks
        mov bx,[rl_epoch_address]
        add bx,[rl_op_count]
        cmp byte [bx+1],1
        jne rl_fail              ; every nonempty owner epoch MUST end F
.operators:
        mov word [rl_seen_ops],0
        mov word [rl_op_index],0
.operator:
        mov bx,[rl_op_index]
        cmp bx,[rl_op_count]
        jae .epoch_equal
        add bx,[rl_epoch_address]
        movzx cx,byte [bx+2]
        cmp cx,1
        jb rl_fail
        mov ax,[rt_state+10]
        inc ax
        cmp cx,ax
        ja rl_fail
        mov [rl_current_op],cx
        dec cx
        mov ax,1
        shl ax,cl
        test [rl_seen_ops],ax
        jnz rl_fail
        or [rl_seen_ops],ax
        mov ax,[rl_current_op]
        mov bp,[rl_bank]
        call rt_operator
        jc rl_fail
        cmp word [rl_current_op],2
        jb .next_op
        ; rt_operator executed exact R first. Its RP body/allowance is current.
        ; A source count/word-weight refusal among CURRENT pending is required.
        mov word [rl_witness_index],0
.witness:
        mov bx,[rl_witness_index]
        imul bx,80
        cmp byte [rt_items+bx+2],0
        jne .next_witness
        mov di,rt_items+12
        add di,bx
        call rp_can_take          ; NO append, allocation failure or Gems witness
        jc rl_fail
        cmp ax,1
        je .next_op
.next_witness:
        inc word [rl_witness_index]
        cmp word [rl_witness_index],12
        jb .witness
        jmp rl_fail
.next_op:
        inc word [rl_op_index]
        jmp .operator
.epoch_equal:
        mov si,[rl_epoch_address]
        mov bx,[rl_epoch]
        shl bx,4
        mov di,rt_ledger+528
        add di,bx
        mov cx,16
        repe cmpsb
        jne rl_fail              ; inherited mandatory nonfinal-Take F cannot vanish
        mov ax,[rl_epoch]
        cmp ax,[rl_count]
        je .history_equal
        mov bx,ax
        shl bx,4
        add bx,rl_target_ledger+16
        cmp word [bx+6],0
        jne rl_fail
        inc ax
        movzx eax,ax
        cmp eax,[bx+12]
        jne rl_fail
        mov ax,[bx+2]
        cmp ax,1
        jb rl_fail
        cmp ax,[rt_state+10]
        ja rl_fail
        mov [rl_recipient],ax
        mov [rt_state+14],ax      ; quota-free source actor navigation is admissible
        mov ax,[bx+4]
        mov [rl_item],ax
        mov eax,[bx+8]
        mov [rl_value],eax
        cmp word [bx],1
        je .item
        cmp word [bx],2
        jne rl_fail
        cmp word [rl_item],0ffffh
        jne rl_fail
        cmp eax,1
        jb rl_fail
        cmp eax,[rt_state+52]
        ja rl_fail
        mov word [rt_state+8],8
        mov word [rl_action],12
        jmp .transfer
.item:
        cmp eax,1
        jne rl_fail
        cmp word [rl_op_count],0
        je rl_fail
        cmp word [rl_item],12
        jae rl_fail
        mov word [rt_state+8],6
        mov word [rl_action],10
        mov dword [rl_value],0     ; canonical request item value is unused
.transfer:
        call rt_sync
        call rl_dispatch
        jc rl_fail
        cmp word [rt_result],1
        jne rl_fail               ; a recorded success cannot be source-refused/zero
        inc word [rl_epoch]
        jmp .epoch
.history_equal:
        mov si,rl_target_ledger
        mov di,rt_ledger
        mov cx,1056
        repe cmpsb
        jne rl_fail              ; also validates ALL unused transfer/epoch bytes
        jmp rl_terminal
rl_early_bad:
        stc
        ret
rl_fail:
        mov byte [rl_valid],0
        mov byte [rt_valid],0
        mov byte [rz_valid],0
        call rz_restore
        stc
        ret

rl_terminal:
        mov ax,[rl_target_state+8]
        cmp ax,3
        jne .take
        cmp word [rl_count],0
        jne rl_fail
        cmp byte [rt_ledger+529],0
        jne rl_fail
        cmp word [rl_target_state+14],1
        jne rl_fail
.take:
        cmp ax,5
        jne .items
        cmp word [rt_state+16],0
        je rl_fail
        cmp dword [rt_state+52],0
        je rl_fail
.items:
        cmp ax,6
        jne .money
        cmp word [rt_state+16],0
        je rl_fail
        mov bx,[rl_count]
        shl bx,4
        add bx,rt_ledger+528
        movzx cx,byte [bx+1]
        test cx,cx
        jz rl_fail
        add bx,cx
        cmp byte [bx+1],1
        jne rl_fail
.money:
        cmp ax,7
        je .need_money
        cmp ax,8
        jne .confirm
.need_money:
        cmp dword [rt_state+52],0
        je rl_fail
.confirm:
        cmp ax,9
        jne .selection
        cmp word [rt_state+16],0
        jne .selection
        cmp dword [rt_state+52],0
        je rl_fail
.selection:
        mov ax,[rl_target_state+14]
        mov [rt_state+14],ax
        test byte [rl_target_state+108],4
        jz .exhaustion
        cmp word [rl_target_state+8],10
        jb rl_fail
        cmp word [rt_state+16],0
        jne .no
        cmp dword [rt_state+52],0
        je rl_fail               ; exhausted Exit skips confirmation; cannot claim No
.no:
        mov word [rt_state+8],9
        call rt_sync
        mov word [rl_action],16
        mov word [rl_recipient],0
        mov word [rl_item],0ffffh
        mov dword [rl_value],0
        call rl_dispatch          ; abandon only AFTER final epoch, even zero items
        jc rl_fail
        jmp .phase
.exhaustion:
        cmp word [rl_target_state+8],10
        jb .phase
        cmp word [rt_state+16],0
        jne rl_fail
        cmp dword [rt_state+52],0
        jne rl_fail
.phase:
        mov ax,[rl_target_state+8]
        mov [rt_state+8],ax
        call rt_sync
        call rt_validate
        jc rl_fail
        mov si,rl_target_state
        mov di,rt_state
        mov cx,160
        repe cmpsb
        jne rl_fail
        mov byte [rl_valid],1
        clc
        ret

; Internal canonical raw GBRA, only invoking the already-proven private core.
; No owner generation is claimed by the scratch descriptor (parent owns it).
rl_dispatch:
        mov di,rl_request
        xor ax,ax
        mov cx,128
        rep stosb
        mov dword [rl_request],'GBRA'
        mov dword [rl_request+4],00800001h
        mov ax,[rt_state+8]
        mov [rl_request+16],ax
        mov ax,[rl_action]
        mov [rl_request+18],ax
        mov ax,[rl_recipient]
        mov [rl_request+20],ax
        mov ax,[rl_item]
        mov [rl_request+22],ax
        mov eax,[rl_value]
        mov [rl_request+24],eax
        mov eax,[rt_state+12]
        mov [rl_request+32],eax
        mov ax,[rt_state+10]
        mov [rl_request+36],ax
        mov word [rl_request+38],16
        mov word [rl_request+40],605
        mov si,rl_request
        mov cx,[rl_suppression]
        mov bp,[rl_bank]
        jmp rt_apply

rl_storage_start:
rl_valid db 0
rl_member dw 0
rl_suppression dw 0
rl_bank dw 0
rl_count dw 0
rl_epoch dw 0
rl_op_count dw 0
rl_epoch_address dw 0
rl_seen_ops dw 0
rl_op_index dw 0
rl_current_op dw 0
rl_witness_index dw 0
rl_action dw 0
rl_recipient dw 0
rl_item dw 0
rl_value dd 0
rl_request times 128 db 0
; Input-only claims. No instruction in this module writes these arrays.
rl_target_state times 160 db 0
rl_target_ledger times 1056 db 0
rl_storage_end:
