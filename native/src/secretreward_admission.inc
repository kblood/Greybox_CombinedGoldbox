; Closed read-only prerequisite admission for a framed GSK4. This DOES NOT
; authorize the outer owner, replay, recovery, publication or any public action.
; rr_index has opened the full source. DS=ES, FS/GS are validator banks.
; CF0 proves exact originating ACTIVE menu/source triplet and bound resource.
; Further complete pre/post P1/state/ledger/action derivation is mandatory.
rv_prerequisites:
        mov word [kc_verified], 0
        mov byte [rv_prerequisites_valid], 0
        mov eax, 256
        mov cx, 1232
        mov di, rv_paths
        call rr_read_at
        jc rv_bad
        mov eax, 1488
        mov cx, 32
        mov di, rv_context
        call rr_read_at
        jc rv_bad
        mov eax, [rr_offsets]
        mov edx, [rr_lengths]
        call kc_view_begin
        jc rv_bad
        call kr_index_open
        jc rv_view_bad
        cmp word [kr_header+6], 2
        jne rv_view_bad
        cmp word [kr_header+20], 1
        jne rv_view_bad
        cmp word [kr_header+18], 1
        jne rv_view_bad
        mov ax, [rr_header+48]
        cmp ax, [kr_header+12]
        jne rv_view_bad
%ifdef RV_STREAM_PATHS
        call rv_match_view_paths
%else
        mov eax, 64
        mov cx, 1120
        mov di, rv_origin_paths
        call kc_read_at
%endif
        jc rv_view_bad
        call kv_validate
        jc rv_view_bad
        cmp word [kv_area], 16
        jne rv_view_bad
        cmp word [kv_pc], 6940
        jne rv_view_bad
        cmp word [fs:KV_FX+4], 16
        jne rv_view_bad
        cmp word [fs:KV_FX+8], 2
        jne rv_view_bad
        cmp word [fs:KV_FX+120], 13
        jne rv_view_bad
        cmp word [kv_menu_opcode], 2bh
        jne rv_view_bad
        cmp word [kv_menu_count], 1
        jne rv_view_bad
        cmp word [fs:KV_FX+130], 1
        jne rv_view_bad
        cmp word [fs:KV_FX+132], 024ah
        jne rv_view_bad
        mov ax, [fs:KV_FX+5940]
        mov [rv_origin_selection_flags], ax
        mov ax, [fs:KV_FX+5942]
        mov [rv_origin_selected], ax
        mov eax, [kr_offsets+4]
        add eax, [rr_offsets]
        jc rv_view_bad
        mov [rv_origin_p1_offset], eax
        mov ax, [kr_header+28]
        mov [rv_origin_p1_length], ax
        mov eax, [kr_offsets+16]
        add eax, [rr_offsets]
        jc rv_view_bad
        mov [rv_origin_identity_offset], eax
        mov eax, [kr_header+40]
        mov [rv_origin_identity_length], eax
        mov eax, [kr_offsets]
        add eax, [rr_offsets]
        jc rv_view_bad
        mov [rv_origin_request_offset], eax
        mov eax, [kr_offsets+12]
        add eax, [rr_offsets]
        jc rv_view_bad
        mov [rv_origin_seed_offset], eax
        mov eax, [kr_offsets+28]
        add eax, [rr_offsets]
        jc rv_view_bad
        mov [rv_origin_effect_offset], eax
        mov eax, [kr_header+52]
        mov [rv_origin_effect_length], eax
%ifndef RV_STREAM_PATHS
        mov si, rv_paths
        mov di, rv_origin_paths
        mov cx, 1120
        repe cmpsb                    ; exact raw path encodings, no normalization
        jne rv_view_bad
%endif
        mov si, rv_context
        mov di, kv_context
        mov cx, 32
        repe cmpsb
        jne rv_view_bad
        ; Re-read the selected member pointer after complete source admission.
        movzx eax, word [kv_match]
        shl eax, 2
        add eax, 16
        add eax, [kv_source_start]
        mov cx, 8
        mov di, rv_pointer
        call kc_read_at
        jc rv_view_bad
        mov eax, [rv_pointer]
        xchg al, ah
        rol eax, 16
        xchg al, ah
        add eax, [kv_source_start]
        jc rv_view_bad
        add eax, 024ah
        jc rv_view_bad
        mov cx, 19
        mov di, rv_source_sequence
        call kc_read_at
        jc rv_view_bad
        mov si, rv_source_sequence
        mov di, rv_expected_sequence
        mov cx, 19
        repe cmpsb
        jne rv_view_bad
        call kc_view_end
        jc rv_bad
        mov eax, [rr_offsets+4]
        mov cx, 18
        mov di, rv_answer
        call rr_read_at
        jc rv_bad
        cmp dword [rv_answer], 'GBMO'
        jne rv_bad
        cmp dword [rv_answer+4], 00000002h ; v2, zero-based option0
        jne rv_bad
        cmp word [rv_answer+8], 1
        jne rv_bad
        mov si, rv_answer+10
        mov di, KV_FX+5766
        mov cx, 4
.identity:
        lodsw
        cmp ax, [fs:di]
        jne rv_bad
        add di, 2
        loop .identity
        ; Actual archive/member/profile admission, never constants as assets.
        mov eax, [rr_offsets+16]
        add eax, 32
        jc rv_bad
        mov edx, [rr_lengths+16]
        sub edx, 32
        jc rv_bad
        call ru_validate
        jc rv_bad
        mov eax, [rr_offsets+16]
        mov cx, 32
        mov di, rv_descriptor
        call rr_read_at
        jc rv_bad
        mov si, rv_descriptor
        call ru_check_descriptor
        jc rv_bad
        mov eax, [rr_offsets+20]
        mov [rv_member_cursor], eax
        mov word [rv_profile_index], 0
.member:
        mov ax, [rv_profile_index]
        mov [ru_row], ax
        call ru_build_row              ; transparent named profile, 63-byte scratch
        mov eax, [rv_member_cursor]
        mov cx, 63
        mov di, rv_member_row
        call rr_read_at
        jc rv_bad
        mov si, rv_member_row
        mov di, ru_expected
        mov cx, 63
        repe cmpsb
        jne rv_bad
        add dword [rv_member_cursor], 63
        inc word [rv_profile_index]
        cmp word [rv_profile_index], 12
        jb .member
        mov byte [rv_prerequisites_valid], 1
        clc
        ret
rv_view_bad:
        call kc_view_end
rv_bad:
        mov word [kc_verified], 0
        mov byte [rv_prerequisites_valid], 0
        stc
        ret

rv_prerequisites_valid db 0
rv_paths times 1232 db 0
%ifndef RV_STREAM_PATHS
rv_origin_paths times 1120 db 0
%endif
rv_context times 32 db 0
rv_answer times 18 db 0
rv_pointer times 8 db 0
rv_source_sequence times 19 db 0
rv_expected_sequence db 1ch,27h
        times 5 dw 0                 ; first five immediate pools0
        db 0,20,0,0,0,18,24h        ; Gems20, Jewelry0, ITEM18, empty COMBAT
rv_descriptor times 32 db 0
rv_member_row times 63 db 0
rv_member_cursor dd 0
rv_profile_index dw 0
rv_origin_p1_offset dd 0
rv_origin_p1_length dw 0
rv_origin_identity_offset dd 0
rv_origin_identity_length dd 0
rv_origin_request_offset dd 0
rv_origin_seed_offset dd 0
rv_origin_effect_offset dd 0
rv_origin_effect_length dd 0
rv_origin_selection_flags dw 0
rv_origin_selected dw 0

; BX=2/3/15 independently admits a nested producer/rejoin record. Read-only
; prerequisite only; caller additionally binds predecessor/whole GBKO input.
rv_nested:
        mov word [kc_verified], 0
        mov [rv_nested_index], bx
        shl bx, 2
        mov eax, [rr_offsets+bx]
        mov edx, [rr_lengths+bx]
        test edx, edx
        jz rv_bad
        call kc_view_begin
        jc rv_bad
        call kr_index_open
        jc rv_view_bad
        call kv_validate
        jc rv_view_bad
        cmp word [fs:KV_FX+4], 16
        jne rv_view_bad
        mov eax, [kr_header+40]
        cmp eax, [rv_origin_identity_length]
        jne rv_view_bad
        mov bx, [rv_nested_index]
        shl bx, 2
        mov eax, [kr_offsets+16]
        add eax, [rr_offsets+bx]
        jc rv_view_bad
        mov [rv_nested_identity_offset], eax
        mov ax, [rr_header+48]
        cmp ax, [kr_header+12]
        jne rv_view_bad
        mov si, kv_context
        mov di, rv_context
        mov cx, 32
        repe cmpsb
        jne rv_view_bad
        ; Compare raw path bytes, not kv_validate's uppercase scratch.
%ifdef RV_STREAM_PATHS
        call rv_match_view_paths
        jc rv_view_bad
%else
        mov eax, 64
        mov cx, 1120
        mov di, rv_origin_paths
        call kc_read_at
        jc rv_view_bad
        mov si, rv_origin_paths
        mov di, rv_paths
        mov cx, 1120
        repe cmpsb
        jne rv_view_bad
%endif
        cmp word [rv_nested_index], 3
        je .output
        cmp word [kr_header+6], 1
        jne rv_view_bad
        cmp word [rv_nested_index], 15
        je .rejoin
        cmp word [kr_header+20], 1
        jne rv_view_bad
        cmp word [fs:KV_FX+8], 2
        jne rv_view_bad
        cmp word [kv_pc], 6940
        jne rv_view_bad
        movzx eax, word [rv_origin_p1_length]
        cmp eax, [kr_header+28]
        jne rv_view_bad
        mov eax, [rv_origin_effect_length]
        cmp eax, [kr_header+32]
        jne rv_view_bad
        ; Real kw_advance(kind1) retains request, P1, seed and source, uses
        ; the origin's current successor as paused FX and the accepted GBMO.
        mov si, kr_offsets
        mov di, rv_completed_offsets
        mov cx, 7
.offsets:
        lodsd
        add eax, [rr_offsets+8]
        jc rv_view_bad
        stosd
        loop .offsets
        jmp .done
.rejoin:
        cmp word [kr_header+20], 2
        jne rv_view_bad
        cmp word [fs:KV_FX+8], 3
        jne rv_view_bad
        cmp word [kv_pc], 605
        jne rv_view_bad
        call rv_check_gift_dispatch
        jc rv_view_bad
        movzx eax, word [rr_header+68]
        cmp eax, [kr_header+28]
        jne rv_view_bad
        mov si, kr_offsets
        mov di, rv_rejoin_offsets
        mov cx, 4
.rejoin_offsets:
        lodsd
        add eax, [rr_offsets+60]
        jc rv_view_bad
        stosd
        loop .rejoin_offsets
        jmp .done
.output:
        cmp word [kr_header+6], 2
        jne rv_view_bad
        cmp word [kr_header+20], 1
        jne rv_view_bad
        cmp word [fs:KV_FX+4], 16
        jne rv_view_bad
        cmp word [fs:KV_FX+8], 3
        jne rv_view_bad
        cmp word [kv_pc], 605
        jne rv_view_bad
        cmp word [fs:KV_FX+32], 0    ; exact empty combat queue
        jne rv_view_bad
        call rv_check_gift_dispatch
        jc rv_view_bad
        mov bx, 4cf5h
        call rv_sparse_context
        jc rv_view_bad
        mov [rv_collection_suppression], ax
        mov bx, 7f72h
        call rv_sparse_context
        jc rv_view_bad
        mov [rv_collection_bank], ax
        mov eax, [kr_offsets+28]
        add eax, [rr_offsets+12]
        jc rv_view_bad
        mov [rv_gift_effect_offset], eax
        cmp dword [kr_header+52], 5948
        jne rv_view_bad
        mov eax, [kr_receipt_input]
        add eax, [rr_offsets+12]
        jc rv_view_bad
        mov [rv_producer_input_offset], eax
        mov eax, [kr_receipt+8]
        cmp eax, [rr_lengths+8]
        jne rv_view_bad
.done:
        call kc_view_end
        jc rv_bad
        mov eax, [rv_nested_identity_offset]
        mov edx, [rv_origin_identity_offset]
        mov ecx, [rv_origin_identity_length]
        call kc_equal_offsets
        jc rv_bad
        cmp word [rv_nested_index], 2
        jne .producer
        mov eax, [rv_completed_offsets]
        mov edx, [rv_origin_request_offset]
        mov ecx, 346
        call kc_equal_offsets
        jc rv_bad
        mov eax, [rv_completed_offsets+4]
        mov edx, [rv_origin_p1_offset]
        movzx ecx, word [rv_origin_p1_length]
        call kc_equal_offsets
        jc rv_bad
        mov eax, [rv_completed_offsets+8]
        mov edx, [rv_origin_effect_offset]
        mov ecx, [rv_origin_effect_length]
        call kc_equal_offsets
        jc rv_bad
        mov eax, [rv_completed_offsets+12]
        mov edx, [rv_origin_seed_offset]
        mov ecx, 150
        call kc_equal_offsets
        jc rv_bad
        mov eax, [rv_completed_offsets+24]
        mov edx, [rr_offsets+4]
        mov ecx, 18
        call kc_equal_offsets
        jc rv_bad
.producer:
        cmp word [rv_nested_index], 3
        jne .ok
        mov eax, [rv_producer_input_offset]
        mov edx, [rr_offsets+8]
        mov ecx, [rr_lengths+8]
        call kc_equal_offsets        ; WHOLE independently admitted input
        jc rv_bad
.ok:    clc
        ret

; Independently reload the exact frozen origin P1. Legacy nested admission
; may use FS16K/32K scratch, so ALL nested admissions precede this post stage.
rv_load_origin_party:
        mov eax, [rv_origin_p1_offset]
        mov cx, [rv_origin_p1_length]
        xor di, di
        push gs
        pop es
        call kv_load_bank
        pushf
        push ds
        pop es
        popf
        jc rv_bad
        mov ax, [rv_origin_p1_length]
        mov [sr_length], ax
        call sr_validate
        jc rv_bad
        clc
        ret

rv_nested_index dw 0
rv_nested_identity_offset dd 0
rv_completed_offsets times 7 dd 0
rv_producer_input_offset dd 0
rv_collection_suppression dw 0
rv_collection_bank dw 0
rv_gift_effect_offset dd 0
rv_rejoin_offsets times 4 dd 0

; Independently admitted FX/GBSL, with its nested source view still open.
; The owned fixed-gift route retains exactly one complete TREASURE event.
; All other legacy blocked host mutations remain closed. A stream's rows
; are authoritative, including rows preceding the terminal inline chunk.
rv_check_gift_dispatch:
        mov word [kc_verified], 0
        mov word [rv_gift_index], 0
        mov byte [rv_gift_seen], 0
        cmp word [fs:KV_FX+82], 0
        jne .bad
        mov ax, [fs:KV_FX+2250]
        cmp ax, 64
        ja .bad
        cmp dword [kr_header+56], 0
        je .count
        mov ax, [kv_stream_count]
        test ax, ax
        jz .bad
        cmp ax, 1213
        ja .bad
.count: mov [rv_gift_count], ax
.record:
        mov ax, [rv_gift_index]
        cmp ax, [rv_gift_count]
        jae .done
        cmp dword [kr_header+56], 0
        jne .stream
        imul si, ax, 20
        add si, KV_FX+2252
        mov di, rv_script_row
        mov cx, 20
.copy: mov al, [fs:si]
        mov [di], al
        inc si
        inc di
        loop .copy
        jmp .opcode
.stream:
        movzx eax, ax
        imul eax, eax, 54
        add eax, 8
        add eax, [kr_offsets+32]
        jc .bad
        mov cx, 20
        mov di, rv_script_row
        call kc_read_at
        jc .bad
.opcode:
        mov ax, [rv_script_row]
        cmp ax, 27h
        je .gift
        cmp ax, 28h
        je .bad
        cmp ax, 2eh
        je .bad
        cmp ax, 36h
        je .bad
        cmp ax, 41h
        je .bad
        jmp .next
.gift: cmp byte [rv_gift_seen], 0
        jne .bad
        mov si, rv_script_row+2
        mov di, rv_gift_operands
        mov cx, 9                 ; argc8 and ALL eight u16 operands
        repe cmpsw
        jne .bad
        mov byte [rv_gift_seen], 1
.next: inc word [rv_gift_index]
        jmp .record
.done: cmp byte [rv_gift_seen], 1
        jne .bad
        clc
        ret
.bad:  stc
        ret

rv_gift_index dw 0
rv_gift_count dw 0
rv_gift_seen db 0
rv_script_row times 20 db 0
rv_gift_operands dw 8,0,0,0,0,0,20,0,18

; BX=0 pre /1 post; DX=actual DS extent. Derive the COMPLETE private image
; and compare P1, state160, item960 and ledger1056, never just familiar fields.
; All nested producer/rejoin admissions must precede this FS post-P1 stage.
rv_replay_image:
        mov word [kc_verified], 0
        mov byte [rv_image_valid], 0
        cmp byte [rv_prerequisites_valid], 1
        jne rv_bad
        cmp bx, 1
        ja rv_bad
        mov [rv_image_index], bx
        mov [rv_ds_extent], dx
        shl bx, 2
        mov eax, [rr_offsets+32+bx]
        mov cx, 160
        mov di, rl_target_state
        call rr_read_at
        jc rv_bad
        mov bx, [rv_image_index]
        shl bx, 1
        mov ax, [rr_header+24+bx]
        cmp ax, [rl_target_state+8]
        jne rv_bad
        mov [rv_image_phase], ax
        mov bx, [rv_image_index]
        shl bx, 2
        mov eax, [rr_offsets+48+bx]
        mov cx, 1056
        mov di, rl_target_ledger
        call rr_read_at
        jc rv_bad
        mov eax, [rr_offsets+20]
        mov cx, 756
        mov di, rv_member
        call rr_read_at
        jc rv_bad
        call rv_load_origin_party
        jc rv_bad
        cmp word [rv_image_phase], 3
        jb .provisional
        mov dx, [rv_ds_extent]
        mov si, rv_member
        mov cx, [rv_collection_suppression]
        mov bp, [rv_collection_bank]
        call rl_derive
        jc rv_bad
        jmp rv_compare_image
.provisional:
        mov dx, [rv_ds_extent]
        call rz_begin
        jc rv_bad
        mov al, 2
        mov cx, [sr_count]
        mov dx, [rv_origin_selection_flags]
        mov bx, [rv_origin_selected]
        mov si, rv_member
        call rt_init
        jc rv_bad
        mov ax, [rv_image_phase]
        mov [rt_state+8], ax
        call rt_sync
        call rt_validate
        jc rv_bad
rv_compare_image:
        mov bx, [rv_image_index]
        shl bx, 2
        movzx edx, word [rz_length]
        cmp edx, [rr_lengths+24+bx]
        jne rv_bad
        mov eax, [rr_offsets+24+bx]
        xor di, di
        mov byte [rv_compare_mode], 1
        call rv_compare_memory
        jc rv_bad
        mov bx, [rv_image_index]
        shl bx, 2
        mov eax, [rr_offsets+32+bx]
        mov edx, 160
        mov di, rt_state
        mov byte [rv_compare_mode], 0
        call rv_compare_memory
        jc rv_bad
        mov bx, [rv_image_index]
        shl bx, 2
        mov eax, [rr_offsets+40+bx]
        mov edx, 960
        mov di, rt_items
        call rv_compare_memory
        jc rv_bad
        mov bx, [rv_image_index]
        shl bx, 2
        mov eax, [rr_offsets+48+bx]
        mov edx, 1056
        mov di, rt_ledger
        call rv_compare_memory
        jc rv_bad
        mov byte [rv_image_valid], 1
        clc
        ret

; Closed relation of indexed pre/post images. This is private semantic proof
; ONLY: no live-P1, predecessor ownership, journal/recovery/publication grant.
; DS=ES, FS/GS validator banks; DX actual resident extent including the stack.
; rr_index has admitted header/directory and left the physical source open.
rv_record_relation:
        mov word [kc_verified], 0
        mov byte [rv_relation_valid], 0
        mov [rv_ds_extent], dx
        call rv_prerequisites
        jc rv_bad
        cmp dword [rr_lengths+8], 0
        je .output
        mov bx, 2
        call rv_nested
        jc rv_bad
.output:
        cmp dword [rr_lengths+12], 0
        je .rejoin
        mov bx, 3
        call rv_nested
        jc rv_bad
.rejoin:
        cmp dword [rr_lengths+60], 0
        je .pre
        mov bx, 15
        call rv_nested
        jc rv_bad
.pre:   xor bx, bx
        mov dx, [rv_ds_extent]
        call rv_replay_image
        jc rv_bad
        ; Entire canonical journal request, including generation and result,
        ; is checked before a private result0 copy is passed to arithmetic.
        mov eax, [rr_offsets+56]
        mov cx, 128
        mov di, rv_action
        call rr_read_at
        jc rv_bad
        call rv_check_action
        jc rv_bad
        cmp word [rr_header+6], 1
        je .equal
        mov ax, [rr_header+28]
        cmp ax, 1
        je .equal
        cmp ax, 19
        je .equal
        cmp ax, 2
        je .administrative
        cmp ax, 3
        je .administrative
        mov word [rv_action+28], 0 ; private copy ONLY, immutable file retained
        mov si, rv_action
        mov cx, [rv_collection_suppression]
        mov bp, [rv_collection_bank]
        call rt_apply
        jc rv_bad
        mov ax, [rt_result]
        cmp ax, [rr_header+30]
        jne rv_bad
        jmp .post
.administrative:
        cmp word [rr_header+30], 1
        jne rv_bad
        mov ax, [rr_header+26]
        mov [rt_state+8], ax
        call rt_sync
        call rt_validate
        jc rv_bad
        jmp .post
.equal: mov word [rv_pair_index], 24
.pair:  mov bx, [rv_pair_index]
        mov ecx, [rr_lengths+bx]
        cmp ecx, [rr_lengths+bx+4]
        jne rv_bad
        mov eax, [rr_offsets+bx]
        mov edx, [rr_offsets+bx+4]
        call kc_equal_offsets
        jc rv_bad
        add word [rv_pair_index], 8
        cmp word [rv_pair_index], 56
        jb .pair
.post:  mov ax, [rt_state+8]
        cmp ax, [rr_header+26]
        jne rv_bad
        mov word [rv_image_index], 1
        call rv_compare_image
        jc rv_bad
        cmp word [rr_header+26], 11
        jne .admitted
        call rv_bind_rejoin
        jc rv_bad
.admitted:
        mov byte [rv_relation_valid], 1
        mov word [kc_verified], 0
        clc
        ret

rv_check_action:
        cmp dword [rv_action], 'GBRA'
        jne .bad
        cmp dword [rv_action+4], 00800001h
        jne .bad
        mov eax, [rr_header+32]
        cmp eax, [rv_action+8]
        jne .bad
        mov eax, [rr_header+36]
        cmp eax, [rv_action+12]
        jne .bad
        mov ax, [rr_header+24]
        cmp ax, [rv_action+16]
        jne .bad
        mov ax, [rr_header+28]
        cmp ax, [rv_action+18]
        jne .bad
        mov dx, [rr_header+30]
        cmp dx, [rv_action+28]
        jne .bad
        cmp word [rv_action+30], 0
        jne .bad
        mov edx, [rt_state+12]
        cmp edx, [rv_action+32]
        jne .bad
        mov dx, [rr_header+48]
        cmp dx, [rv_action+36]
        jne .bad
        cmp word [rv_action+38], 16
        jne .bad
        mov dx, 605
        cmp word [rr_header+24], 2
        jae .pc
        mov dx, 6940
.pc:    cmp dx, [rv_action+40]
        jne .bad
        cmp ax, 6
        je .recipient
        cmp ax, 7
        je .recipient
        cmp ax, 10
        je .recipient
        cmp ax, 12
        je .recipient
        cmp word [rv_action+20], 0
        jne .bad
.recipient:
        cmp ax, 10
        je .item
        cmp word [rv_action+22], 0ffffh
        jne .bad
.item:  cmp ax, 12
        je .value
        cmp dword [rv_action+24], 0
        jne .bad
.value: mov di, rv_action+42
        mov cx, 86
        call rt_zero
        jc .bad
        clc
        ret
.bad:   stc
        ret

rv_relation_valid db 0
rv_pair_index dw 0
rv_action times 128 db 0

; Exact final kind2 input, still with retained paused27. It differs from the
; admitted producer pause ONLY in source-defined sparse cleanup and selection;
; the current post P1, request(kind2), seed and source remain independently bound.
rv_bind_rejoin:
        mov eax, [rv_rejoin_offsets+4]
        mov edx, [rr_offsets+28]
        mov ecx, [rr_lengths+28]
        call kc_equal_offsets
        jc rv_bad
        mov eax, [rv_rejoin_offsets+12]
        mov edx, [rv_origin_seed_offset]
        mov ecx, 150
        call kc_equal_offsets
        jc rv_bad
        mov eax, [rv_origin_request_offset]
        mov cx, 346
        mov di, kc_buf
        call rr_read_at
        jc rv_bad
        mov word [kc_buf+8], 2     ; expected source-owned GBIR kind transition
        mov eax, [rv_rejoin_offsets]
        mov edx, 346
        mov di, kc_buf
        mov byte [rv_compare_mode], 0
        call rv_compare_memory
        jc rv_bad
        mov eax, [rv_gift_effect_offset]
        mov cx, 5948
        mov di, KV_FX
        push fs
        pop es
        call kv_load_bank
        pushf
        push ds
        pop es
        popf
        jc rv_bad
        mov word [rv_cleanup_index], 0
.key:  mov bx, [rv_cleanup_index]
        mov bx, [rv_cleanup_keys+bx]
        mov cx, [fs:KV_FX+196]
        xor si, si
        xor dx, dx
        xor ax, ax
.find: jcxz .found
        cmp bx, [fs:KV_FX+198+si]
        jne .next
        inc dx
        cmp dx, 1
        ja rv_bad
        mov ax, [fs:KV_FX+1222+si]
        mov [rv_cleanup_cell], si
.next: add si, 2
        loop .find
.found:
        test dx, dx
        jnz .existing
        cmp si, 1024
        jae rv_bad
        mov [fs:KV_FX+198+si], bx
        mov [rv_cleanup_cell], si
        inc word [fs:KV_FX+196]
.existing:
        cmp word [rv_cleanup_index], 16
        je .masked
        xor ax, ax
        jmp .store
.masked:
        and ax, 1                 ; exact original2938; absent cell reads0
.store: mov si, [rv_cleanup_cell]
        mov [fs:KV_FX+1222+si], ax
        add word [rv_cleanup_index], 2
        cmp word [rv_cleanup_index], 18
        jb .key
        mov eax, [rt_state+12]     ; flags1 + final one-based actor
        mov [fs:KV_FX+5940], eax
        mov [fs:KV_FX+5784], ax
        shr eax, 16
        mov [fs:KV_FX+5782], ax
        mov eax, [rv_rejoin_offsets+8]
        mov edx, 5948
        mov di, KV_FX
        mov byte [rv_compare_mode], 1
        jmp rv_compare_memory

rv_cleanup_index dw 0
rv_cleanup_cell dw 0
rv_cleanup_keys dw 7ec7h,7ec8h,7f70h,7f71h,7f72h,7ee3h,7ee6h,4cf5h,7ecah

; EAX=file physical offset, EDX=length, DI=memory offset; mode0DS /1FS.
; Closed full extents, actual seek/read and every opaque byte are compared.
rv_compare_memory:
        mov [rv_compare_offset], eax
        mov [rv_compare_left], edx
        mov [rv_compare_memory_offset], di
.chunk:
        mov eax, [rv_compare_left]
        test eax, eax
        jz .done
        cmp eax, 512
        jbe .bounded
        mov ax, 512
.bounded:
        mov [rv_compare_chunk], ax
        mov cx, ax
        mov eax, [rv_compare_offset]
        mov di, rv_compare_buffer
        call rr_read_at
        jc rv_bad
        mov si, rv_compare_buffer
        mov di, [rv_compare_memory_offset]
        mov cx, [rv_compare_chunk]
.byte:
        lodsb
        cmp byte [rv_compare_mode], 0
        jne .fs
        cmp al, [di]
        jne rv_bad
        jmp .next
.fs:    cmp al, [fs:di]
        jne rv_bad
.next:  inc di
        loop .byte
        mov [rv_compare_memory_offset], di
        movzx eax, word [rv_compare_chunk]
        add [rv_compare_offset], eax
        sub [rv_compare_left], eax
        jmp .chunk
.done:  clc
        ret

rv_image_valid db 0
rv_image_index dw 0
rv_image_phase dw 0
rv_ds_extent dw 0
rv_member times 756 db 0
rv_compare_offset dd 0
rv_compare_left dd 0
rv_compare_memory_offset dw 0
rv_compare_chunk dw 0
rv_compare_mode db 0
; Opt-in integrated comparison scratch. All current expected DS spans are
; disjoint from kc_cmp (notably the live GBIR346 claim in kc_buf); the sole
; chunk read calls rr_read_at directly, with no nested peer/equality callback.
%ifdef RV_EXTERNAL_COMPARE
rv_compare_buffer equ RV_EXTERNAL_COMPARE
%else
rv_compare_buffer times 512 db 0
%endif

%ifdef RV_STREAM_PATHS
; Active nested view only: raw relative64..1183 versus frozen outer paths.
; KC viewbase is added once by kc_read_at. No normalized KV/self-compare.
; Failure is LOCAL; rv_view_bad caller alone unwinds the owned view once.
rv_match_view_paths:
        mov ax, ds
        mov bx, es
        cmp ax, bx
        jne .bad
        cmp byte [kc_view_active], 1
        jne .bad
        mov dword [rv_compare_offset], 64
        mov dword [rv_compare_left], 1120
        mov word [rv_compare_memory_offset], rv_paths
.chunk:
        mov eax, [rv_compare_left]
        test eax, eax
        jz .done
        cmp eax, 512
        jbe .bounded
        mov ax, 512
.bounded:
        mov [rv_compare_chunk], ax
        mov cx, ax
        mov eax, [rv_compare_offset]
        mov di, kc_cmp
        call kc_read_at
        jc .bad
        mov si, kc_cmp
        mov di, [rv_compare_memory_offset]
        mov cx, [rv_compare_chunk]
        repe cmpsb
        jne .bad
        mov [rv_compare_memory_offset], di
        movzx eax, word [rv_compare_chunk]
        add [rv_compare_offset], eax
        sub [rv_compare_left], eax
        jmp .chunk
.done: clc
        ret
.bad:  stc
        ret
%endif

; Current independently admitted producer FX context. Known duplicate keys
; are ambiguous and rejected; absent cells retain ordinary VM zero semantics.
rv_sparse_context:
        mov cx, [fs:KV_FX+196]
        cmp cx, 512
        ja .bad
        xor si, si
        xor dx, dx
        xor ax, ax
.cell:  jcxz .done
        cmp bx, [fs:KV_FX+198+si]
        jne .next
        inc dx
        cmp dx, 1
        jne .bad
        mov ax, [fs:KV_FX+1222+si]
.next:  add si, 2
        loop .cell
.done:  clc
        ret
.bad:   stc
        ret
