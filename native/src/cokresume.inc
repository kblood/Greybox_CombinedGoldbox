; /R candidate CHECK | MUTATE. Reserved uppercase tokens, distinct from combat.
; CHECK validates source/operand using the supplied original roster and seed.
; MUTATE additionally requires the active roster/owned seed to match the candidate.
; This is a VM continuation consumer, not a publisher of party/inventory files.
IR_LEN equ 13224
; GBMR v3 (2026-09-09): a resume candidate may be a v2 (IR_LEN bytes) or v3
; (IR_LEN_V3 bytes, an appended 40-byte GBOC v1 record at IR_LEN) header.
; ir_read peeks the version word (already inside the first, fixed IR_LEN
; read) to decide whether the extra 40 bytes exist, then records which in
; the dynamic ir_len word; every downstream site that used to hardcode
; IR_LEN as "where the header ends and the appended GBIV tail begins" now
; uses [ir_len] instead. This module never inspects the GBOC record's own
; fields -- CCINV's C stage is the sole authority that validated it (magic/
; version/length/self-CRC/byte-identity-vs-request/RNG-refold) before
; publishing the file this reads; the authorized RNG value already lives at
; the ordinary GBEF offset (rbuf+174, well inside the unconditionally-copied
; [0,IR_LEN) prefix) and needs no special handling here.
IR_LEN_V3 equ 13264
IR_IO_CHUNK equ 1024
; Live decoded blk must survive the second resume read and ir_active. The
; script queue is dead here and restored completely from rbuf in ir_apply
; before DAMAGE processing/VM execution; it provides 1280 temporary bytes.
IR_IO_TEMP equ fx_script_events
IR_FRAME equ rbuf+11112

ir_select:
        mov byte [ir_mode], 0
        cmp dword [outname], 'CHEC'
        jne .mutate
        cmp word [outname+4], 'K'
        jne .ret
        mov byte [ir_mode], 1
        ret
.mutate:
        cmp dword [outname], 'MUTA'
        jne .ret
        cmp word [outname+4], 'TE'
        jne .ret
        cmp byte [outname+6], 0
        jne .ret
        mov byte [ir_mode], 2
.ret:  ret

ir_read:
        cmp byte [is_cok], 1
        jne ir_bad
        cmp byte [rostername], 0
        je ir_bad
        cmp byte [seedname], 0
        je ir_bad
        mov dx, resumename
        mov ax, 3D00h
        int 21h
        jc ir_bad
        mov [efxfh], ax
        mov bx, ax
        mov dx, rbuf
        mov cx, IR_LEN
        mov ah, 3Fh
        int 21h
        jc ir_close_bad
        cmp ax, IR_LEN
        jne ir_close_bad
        mov word [ir_len], IR_LEN
        cmp dword [rbuf+4], 00010003h
        jne .not_v3_len
        mov bx, [efxfh]
        mov dx, rbuf+IR_LEN
        mov cx, IR_LEN_V3-IR_LEN
        mov ah, 3Fh
        int 21h
        jc ir_close_bad
        cmp ax, IR_LEN_V3-IR_LEN
        jne ir_close_bad
        mov word [ir_len], IR_LEN_V3
.not_v3_len:
        mov eax, [rbuf+28]
        mov [ir_expected], eax
        mov dword [rbuf+28], 0
        mov si, rbuf
        movzx ecx, word [ir_len]
        call iy_crc
        mov [ir_crc], eax
        mov dword [ir_tail], 0
.tail:
        mov bx, [efxfh]
        mov dx, IR_IO_TEMP
        mov cx, IR_IO_CHUNK
        mov ah, 3Fh
        int 21h
        jc ir_close_bad
        test ax, ax
        jz .eof
        movzx eax, ax
        add [ir_tail], eax
        jc ir_close_bad
        mov cx, ax
        mov eax, [ir_crc]
        not eax
        mov si, IR_IO_TEMP
        call iy_crc.byte
        mov [ir_crc], eax
        jmp .tail
.eof:
        mov bx, [efxfh]
        mov ah, 3Eh
        int 21h
        jc ir_bad
        cmp dword [ir_tail], 16
        jb ir_bad
        mov eax, [ir_crc]
        cmp eax, [ir_expected]
        jne ir_bad
        cmp dword [rbuf], 'GBMR'
        jne ir_bad
        cmp dword [rbuf+4], 00010002h
        je .version_ok
        cmp dword [rbuf+4], 00010003h
        jne ir_bad
.version_ok:
        cmp word [rbuf+8], 1
        jne ir_bad
        cmp word [rbuf+16], 255
        ja ir_bad
        cmp word [rbuf+18], 0
        jne ir_bad
        movzx eax, word [ir_len]
        shl eax, 16
        add eax, 5750
        cmp dword [rbuf+22], eax
        jne ir_bad
        cmp word [rbuf+26], 0
        jne ir_bad
        cmp dword [rbuf+44], 0
        jne ir_bad
        cmp word [rbuf+32], 1
        jb ir_bad
        cmp word [rbuf+32], 60000
        jae ir_bad
        cmp word [rbuf+34], CHAINCAP
        ja ir_bad
        cmp word [rbuf+36], BRIDGE_REPEAT_CAP
        jae ir_bad
        mov ax, [rbuf+38]
        cmp ax, [rbuf+48+SX_COUNT_OFF]
        ja ir_bad
        cmp dword [IR_FRAME], 'GBMC'
        jne ir_bad
        cmp dword [IR_FRAME+4], 00200001h
        jne ir_bad
        mov ax, [IR_FRAME+22]
        cmp ax, GEN1_HEADER_LEN
        jb ir_bad
        cmp ax, BLKCAP
        ja ir_bad
        cmp [rbuf+14], ax
        ja ir_bad
        mov si, IR_FRAME+12
        mov cx, 8
.bool: lodsb
        cmp al, 1
        ja ir_bad
        loop .bool
        cmp dword [rbuf+48], 'GBEF'
        jne ir_bad
        cmp word [rbuf+52], 9
        jne ir_bad
        cmp word [rbuf+56], 4
        jne ir_bad
        cmp dword [rbuf+48+RS_MAGIC_OFF], 'GBRS'
        jne ir_bad
        cmp word [rbuf+48+RS_FLAGS_OFF], 0
        jne ir_bad
        cmp dword [rbuf+48+SX_MAGIC_OFF], 'GBSX'
        jne ir_bad
        cmp word [rbuf+48+SX_COUNT_OFF], SCRIPTCAP
        ja ir_bad
        mov cx, [rbuf+48+SX_COUNT_OFF]
        mov si, rbuf+48+SX_EVENTS_OFF
        jcxz .events_ok
.events:
        cmp word [si+2], 8
        ja ir_bad
        add si, SCRIPT_REC_BYTES
        loop .events
.events_ok:
        cmp word [rbuf+80], ENCCAP
        ja ir_bad
        cmp word [rbuf+130], NPCCAP
        ja ir_bad
        cmp dword [rbuf+48+ES_MAGIC_OFF], 'GBES'
        jne ir_bad
        cmp dword [rbuf+48+HD_MAGIC_OFF], 'GBHD'
        jne ir_bad
        cmp word [rbuf+48+HD_REASON_OFF], HALT_INVENTORY
        jne ir_bad
        cmp word [rbuf+48+HD_OPCODE_OFF], 40h
        jne ir_bad
        mov ax, [rbuf+12]
        cmp ax, GEN1_HEADER_LEN
        jb ir_bad
        cmp ax, [rbuf+48+RS_PC_OFF]
        jne ir_bad
        cmp ax, [rbuf+48+HD_PC_OFF]
        jne ir_bad
        cmp ax, [rbuf+14]
        jae ir_bad
        mov ax, [rbuf+10]
        cmp ax, [rbuf+48+RS_AREA_OFF]
        jne ir_bad
        cmp ax, [rbuf+48+HD_AREA_OFF]
        jne ir_bad
        cmp byte [is_dax], 0
        je .raw
        mov [area_id], ax
        clc
        ret
.raw:  cmp ax, 0FFFFh
        jne ir_bad
        clc
        ret
ir_close_bad:
        mov bx, [efxfh]
        mov ah, 3Eh
        int 21h
ir_bad:
        stc
        ret

ir_apply:
        mov ax, [blklen]
        cmp ax, [IR_FRAME+22]
        jne ir_bad
        cmp [rbuf+14], ax
        ja ir_bad
        mov si, blk
        mov cx, ax
        call iy_crc
        cmp eax, [rbuf+40]
        jne ir_bad
        mov bx, [rbuf+12]
        cmp bx, [hdrlen]
        jb ir_bad
        cmp byte [blk+bx], 40h
        jne ir_bad
        mov cx, [rbuf+48+RS_CALLSP_OFF]
        cmp cx, CALLCAP
        ja ir_bad
        mov si, rbuf+48+RS_STACK_OFF
        jcxz .stack_ok
.stack:
        lodsw
        cmp ax, [hdrlen]
        jb ir_bad
        cmp ax, [blklen]
        ja ir_bad
        loop .stack
.stack_ok:
        cmp byte [ir_mode], 2
        jne .restore
        call ir_active
        jc ir_bad
.restore:
        mov si, rbuf
        mov di, ir_header
        mov cx, 48
        rep movsb
        mov si, IR_FRAME
        mov di, ir_frame
        mov cx, 32
        rep movsb
        mov si, rbuf+48
        mov di, rbuf
        mov cx, FXLEN
        rep movsb
        mov word [resume_len], FXLEN
        call apply_resume_state.common
        jc ir_bad
        ; fxhdr aliases rbuf since f7bf0402, so the old rbuf->fxhdr copy was
        ; a self-copy. Restore the live GBSX tail and GBES words explicitly;
        ; apply_resume_state.common has already restored the prefix.
        mov si, rbuf+SX_COUNT_OFF
        mov di, fx_script_count
        mov cx, 2+SCRIPTCAP*SCRIPT_REC_BYTES+SCRIPTCAP*SCRIPT_TEXT_REC_BYTES
        rep movsb
        mov si, rbuf+ES_SPRITE_OFF
        mov di, fx_setup_sprite
        mov cl, 4
        rep movsw
        ; Only DAMAGE entries below the acknowledged host watermark are spent.
        ; Keep the queue length and all other encounter/script context intact.
        mov cx, [ir_header+38]
        mov si, fx_script_events
        jcxz .damage_done
.damage:
        cmp word [si], 2Eh
        jne .damage_next
        mov word [si+2], 0
.damage_next:
        add si, SCRIPT_REC_BYTES
        loop .damage
.damage_done:
        mov ax, [fx_enc_count]
        mov [enc_count], ax
        mov ax, [fx_npc_count]
        mov [npc_count], ax
        mov ax, [fx_chain]
        mov [chain_id], ax
        mov ax, [ir_header+32]
        mov [stepc], ax
        mov ax, [ir_header+34]
        mov [chain_count], ax
        mov ax, [ir_header+36]
        mov [bridge_repeat_count], ax
        mov ax, [ir_frame+8]
        mov [cmp_l], ax
        mov ax, [ir_frame+10]
        mov [cmp_r], ax
        mov si, ir_frame+12
        mov di, flag_eq
        mov cx, 6
        rep movsb
        mov al, [ir_frame+18]
        mov [selected_valid], al
        mov al, [ir_frame+19]
        mov [selected_not_found], al
        mov ax, [ir_frame+20]
        mov [selected_party], ax
        cmp byte [selected_valid], 0
        je .unselected
        test ax, ax
        jz ir_bad
        cmp ax, [party_count]
        ja ir_bad
        cmp byte [selected_not_found], 0
        jne ir_bad
        jmp .operand
.unselected:
        test ax, ax
        jnz ir_bad
.operand:
        mov ax, [pc]
        inc ax
        mov [opp], ax
        call iy_prepare
        jc ir_bad
        mov ax, [iy_target]
        cmp ax, [ir_header+16]
        jne ir_bad
        mov ax, [iy_successor]
        cmp ax, [ir_header+14]
        jne ir_bad
        ; iy_prepare restores selected_not_found. Consume once on continuation.
        call opp_rvalue
        mov ax, [iy_successor]
        mov [pc], ax
        mov byte [iy_valid], 0
        mov word [have_sel], 0       ; ON_GOTO/GOSUB scratch is clear between ops
        mov word [halt_reason], HALT_NONE
        mov word [halt_pc], 0
        mov word [halt_opcode], 0
        mov ax, [area_id]
        mov [halt_area], ax
        clc
        ret

ir_active:
        mov ax, [party_count]
        cmp ax, [rbuf+5804]
        jne ir_bad
        mov si, timer_ages
        mov cx, 8
.ages: lodsw
        test ax, ax
        jnz ir_bad
        loop .ages
        cmp byte [owned_items_valid], 1
        jne ir_bad
        mov si, rbuf+13192
        mov di, owned_item_bits
        mov cx, 32
        repe cmpsb
        jne ir_bad
        mov si, rbuf+8274
        mov di, owned_affect_flags
        mov cx, 258
        repe cmpsb
        jne ir_bad
        mov si, rbuf+8532
        mov di, timer_state
        mov cx, TIMER_STATE_LEN
        repe cmpsb
        jne ir_bad
        mov ax, [rbuf+20]
        cmp ax, 16
        jb ir_bad
        cmp ax, 2476
        ja ir_bad
        mov dx, rostername
        mov ax, 3D00h
        int 21h
        jc ir_bad
        mov [efxfh], ax
        ; Keep the complete header and decoded ECL intact. The dead script
        ; queue is restored after admission; compare bounded chunks there and
        ; probe EOF separately to retain the exact-extent check.
        mov ax, [rbuf+20]
        mov [ir_roster_left], ax
        mov di, rbuf+5798
.roster_read:
        mov cx, [ir_roster_left]
        cmp cx, IR_IO_CHUNK
        jbe .roster_chunk
        mov cx, IR_IO_CHUNK
.roster_chunk:
        mov bx, [efxfh]
        mov dx, IR_IO_TEMP
        push cx
        mov ah, 3Fh
        int 21h
        pop cx
        jc ir_close_bad
        cmp ax, cx
        jne ir_close_bad
        sub [ir_roster_left], cx
        mov si, IR_IO_TEMP
        repe cmpsb
        jne ir_close_bad
        cmp word [ir_roster_left], 0
        jne .roster_read
        mov bx, [efxfh]
        mov dx, IR_IO_TEMP
        mov cx, 1
        mov ah, 3Fh
        int 21h
        jc ir_close_bad
        test ax, ax
        jnz ir_close_bad
        mov bx, [efxfh]
        mov ah, 3Eh
        int 21h
        ret

ir_mode db 0
ir_crc dd 0
ir_expected dd 0
ir_tail dd 0
ir_len dw IR_LEN
ir_roster_left dw 0
ir_header times 48 db 0
ir_frame times 32 db 0
