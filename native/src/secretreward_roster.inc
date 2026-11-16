; PRIVATE complete P1 projector, never file/owner/UI authority.
; DS=ES resident, GS immutable32KiB pre-P1, FS private64KiB work bank.
; rz_begin DX=ACTUAL DS-owned extent (main stacktop), sr_length=input extent.
; Then rz_award CX=suppression; rz_recalc AX=onebased recipient/BP=6E4;
; rz_gems BX=onebased recipient/EAX=request/EDX=pool -> RC EAX/EDX/CX;
; rz_take AX=onebased recipient/DI=fixed67/BP=6E4 -> CX=1 accepted/3 refused.
; CF0: complete valid FS post at0..rz_length-1. CF1: DISCARD entire FS stage,
; including early overlap failure where no resident flag may safely be written.
; No GS writes. Segments and original sr_length/metadata are restored. Other
; regs scratch. FS16000/32000 never hold scratch while a post image is live.
; Caller owns once-only XP, fixed-member/P1 origin, actor/action/resource ledger.
rz_begin:
        push dx
        mov bp,sp
        test dx,dx
        jz .alias_bad
        mov ax,ds
        mov bx,es
        cmp ax,bx
        jne .alias_bad
        movzx eax,ax
        shl eax,4
        movzx edx,word [ss:bp]
        mov bx,gs
        movzx ebx,bx
        shl ebx,4
        mov ecx,32768
        call rz_disjoint
        jc .alias_bad
        mov ax,ds
        movzx eax,ax
        shl eax,4
        movzx edx,word [ss:bp]
        mov bx,fs
        movzx ebx,bx
        shl ebx,4
        mov ecx,65536
        call rz_disjoint
        jc .alias_bad
        mov ax,gs
        movzx eax,ax
        shl eax,4
        mov edx,32768
        mov bx,fs
        movzx ebx,bx
        shl ebx,4
        mov ecx,65536
        call rz_disjoint
        jc .alias_bad
        pop dx
        mov [rz_ds_extent],dx
        mov byte [rz_valid],0
        mov ax,[sr_length]
        mov [rz_input_length],ax
        cmp ax,16
        jb rz_fail
        cmp ax,32768
        ja rz_fail
        call sr_validate
        jc rz_fail
        mov ax,[sr_length]
        mov [rz_length],ax
        mov cx,ax
        xor si,si
.copy:
        mov al,[gs:si]
        mov [fs:si],al
        inc si
        loop .copy
        jmp rz_finish
.alias_bad:
        pop dx
        stc
        ret

rz_disjoint:
        add edx,eax
        jc .bad
        add ecx,ebx
        jc .bad
        cmp eax,ecx
        jae .ok
        cmp ebx,edx
        jae .ok
.bad:  stc
        ret
.ok:   clc
        ret

; Validate current FS under a temporary GS mapping. Metadata is post-relative
; only within this operation; original metadata is revalidated before return.
rz_enter:
        cmp byte [rz_valid],1
        jne rz_fail
        mov byte [rz_valid],0
        push gs
        push fs
        pop gs
        mov ax,[rz_length]
        mov [sr_length],ax
        call sr_validate
        pop gs
        jc rz_fail
        ret

rz_finish:
        push gs
        push fs
        pop gs
        mov ax,[rz_length]
        mov [sr_length],ax
        call sr_validate
        pop gs
        jc rz_fail
        call rz_restore
        jc rz_fail
        mov byte [rz_valid],1
        clc
        ret
rz_restore:
        mov ax,[rz_input_length]
        mov [sr_length],ax
        jmp sr_validate
rz_fail:
        mov byte [rz_valid],0
        call rz_restore
        stc
        ret

; AX physical onebased ordinal, never source slot. Copy exact439 + zero pad.
rz_actor:
        cmp ax,1
        jb .bad
        cmp ax,[sr_count]
        ja .bad
        dec ax
        mov [rz_actor_index],ax
        imul ax,440
        add ax,17
        mov [rz_actor_body],ax
        mov si,ax
        mov di,rp_body
        mov cx,439
.copy:
        mov al,[fs:si]
        inc si
        stosb
        loop .copy
        mov byte [rp_body+439],0
        clc
        ret
.bad:  stc
        ret
rz_store_body:
        mov si,rp_body
        mov di,[rz_actor_body]
        mov cx,439
.copy:
        lodsb
        mov [fs:di],al
        inc di
        loop .copy
        ret

; Pure preflight on an already admitted FS party. No memory/metadata/grant
; writes; local invalid-count failure, never rz_fail/rz_restore.
rz_eligible_share:
        mov cx,[sr_count]
        cmp cx,1
        jb .bad
        cmp cx,6
        ja .bad
        xor bx,bx
        mov si,17
        mov cx,[sr_count]
.eligible:
        cmp byte [fs:si+423],0
        je .excluded
        cmp byte [fs:si+422],1
        jne .next
.excluded:
        inc bx
.next:  add si,440
        loop .eligible
        mov cx,[sr_count]
        jmp rx_divide_share
.bad:   xor eax,eax
        stc
        ret

rz_award:
        mov [rz_suppression],cx
        call rz_enter
        jc rz_fail
        call rz_eligible_share
        jc rz_fail              ; zero denominator before ANY XP write
        mov [rz_share],eax
        mov [rz_denominator],dx
        mov word [rz_cursor],1
.actor:
        mov ax,[rz_cursor]
        call rz_actor
        jc rz_fail
        mov si,rp_body
        mov edx,[rz_share]
        mov cx,[rz_suppression]
        call rx_award_scalar
        jc rz_fail
        mov bx,[rz_actor_index]
        shl bx,2
        mov [rz_awards+bx],eax
        mov di,[rz_actor_body]
        add [fs:di+300],eax
        inc word [rz_cursor]
        mov ax,[rz_cursor]
        cmp ax,[sr_count]
        jbe .actor
        ; Unused actor award cells are canonical0, not stale prior results.
        mov bx,[sr_count]
        shl bx,2
.unused:
        cmp bx,24
        jae rz_finish
        mov dword [rz_awards+bx],0
        add bx,4
        jmp .unused

rz_recalc:
        mov [rz_recipient],ax
        mov [rz_bank],bp
        call rz_enter
        jc rz_fail
        call rz_run_r
        jc rz_fail
        call rz_store_body
        jmp rz_finish

rz_run_r:
        mov ax,[rz_recipient]
        call rz_actor
        jc .bad
        mov si,[sr_catalog]
        mov di,rz_catalog
        mov cx,2048
.catalog:
        mov al,[fs:si]
        inc si
        stosb
        loop .catalog
        mov bx,[rz_actor_index]
        shl bx,1
        mov cx,[sr_stf_len+bx]
        mov dx,[sr_sfx+bx]
        movzx eax,word [sr_sfx_len+bx]
        mov bx,[sr_stf+bx]
        mov si,rp_body
        mov di,rz_catalog
        mov bp,[rz_bank]
        push gs
        push fs
        pop gs                   ; BOTH STF and SFX read from live FS post
        call rp_calculate
        pop gs
.bad:  ret

rz_gems:
        mov [rz_recipient],bx
        mov [rz_request],eax
        mov [rz_pool],edx
        call rz_enter
        jc rz_fail
        mov ax,[rz_recipient]
        call rz_actor
        jc rz_fail
        mov si,rp_body
        mov eax,[rz_request]
        mov edx,[rz_pool]
        call rc_gems
        jc rz_fail
        mov [rz_transferred],eax
        mov [rz_remaining],edx
        mov [rz_result],cx
        call rz_store_body        ; RC changed ONLY269/411; never implicit R
        call rz_finish
        jc rz_fail
        mov eax,[rz_transferred]
        mov edx,[rz_remaining]
        mov cx,[rz_result]
        clc
        ret

rz_take:
        mov [rz_recipient],ax
        mov [rz_bank],bp
        ; Stage67 source is resident and must lie wholly inside owned DS extent.
        movzx eax,di
        add eax,67
        movzx edx,word [rz_ds_extent]
        cmp eax,edx
        ja rz_fail
        cmp byte [di+46],73
        je rz_fail
        cmp byte [di+46],128
        jae rz_fail
        mov si,di
        mov di,rz_offer
        mov cx,67
        rep movsb
        call rz_enter
        jc rz_fail
        call rz_run_r
        jc rz_fail
        mov di,rz_offer
        call rp_can_take
        jc rz_fail
        mov [rz_refused],ax
        call rz_store_body        ; refusal RETAINS exact first R writes
        cmp word [rz_refused],0
        jne .refused
        mov ax,[rz_length]
        add ax,67
        jc rz_fail
        cmp ax,32768
        ja rz_fail              ; do not convert owned P1 overflow to source refusal
        mov [rz_new_length],ax
        mov bx,[rz_actor_index]
        shl bx,1
        mov di,[sr_sfx+bx]       ; insert after all old STF, before intact old SFX
        mov [rz_insert],di
        mov si,[rz_length]
        mov cx,si
        sub cx,di
        mov di,[rz_new_length]
        dec si
        dec di
.shift:
        jcxz .append
        mov al,[fs:si]
        mov [fs:di],al
        dec si
        dec di
        loop .shift
.append:
        mov si,rz_offer
        mov di,[rz_insert]
        mov cx,67
.item:
        lodsb
        mov [fs:di],al
        inc di
        loop .item
        mov di,[rz_insert]
        mov dword [fs:di+42],0   ; ONLY new main next cell follows portable policy
        mov bx,[rz_actor_index]
        shl bx,1
        mov di,[sr_stf+bx]
        add word [fs:di-6],67   ; matching block STF length (start=header+8)
        mov di,[sr_trailer]
        mov ax,[rz_new_length]
        mov [fs:di+10],ax
        mov [rz_length],ax
        push gs
        push fs
        pop gs
        mov [sr_length],ax
        call sr_validate        ; recompute ALL following companion offsets
        pop gs
        jc rz_fail
        call rz_run_r
        jc rz_fail
        call rz_store_body
        mov word [rz_result],1
        jmp .finish
.refused:
        mov word [rz_result],3
.finish:
        call rz_finish
        jc rz_fail
        mov cx,[rz_result]
        clc
        ret

rz_valid db 0
rz_ds_extent dw 0
rz_input_length dw 0
rz_length dw 0
rz_actor_index dw 0
rz_actor_body dw 0
rz_recipient dw 0
rz_bank dw 0
rz_suppression dw 0
rz_cursor dw 0
rz_denominator dw 0
rz_share dd 0
rz_awards times 6 dd 0
rz_request dd 0
rz_pool dd 0
rz_transferred dd 0
rz_remaining dd 0
rz_result dw 0
rz_refused dw 0
rz_insert dw 0
rz_new_length dw 0
rz_offer times 67 db 0
; Opt-in integrated owner lifetime: every R destroys RW framing. The caller
; must finish replay before rebuilding RO/RW and never retain a stage grant
; across R/reindex. Default standalone storage is unchanged.
%ifdef RZ_EXTERNAL_CATALOG
rz_catalog equ RZ_EXTERNAL_CATALOG
%else
rz_catalog times 2048 db 0
%endif
