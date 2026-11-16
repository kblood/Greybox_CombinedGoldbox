; cchost_npc.inc -- CCHOST /N: apply recorded DQK ADD_NPC joins to a GBPR.
;
; Usage: CCHOST /N <effect.GBEF> <MONCHA.GLB> <roster.GBPR>
;
; Retail semantics this mode reproduces (docs/engine/research/dqk-add-npc-route.md):
;   * The "already in the party?" guard in the area-27 Hulderfolk route is NOT
;     CHECKPARTY.  The instruction at 0x86DE is opcode 0x37 (LOAD_PIECES, two
;     operands in DQK), whose retail handler (DQK.EXE file 0x0434A8) walks the
;     party's linked records comparing the record name at +0x68 with the string
;     operand AND testing bit 7 of record byte +0x9B (the NPC flag ADD_NPC sets
;     to (morale/2)|0x80).  It stores the party index, or 0xFF if absent, in
;     the destination cell [0x00C0].  The script runs ADD_NPC only when
;     [0x00C0]==255.  So a duplicate join is a script-level skip in retail,
;     and a join record that names an NPC already present is a replay (menu/ack
;     resumes restore the join table; loop records repeat ids): this mode
;     skips it, logged, instead of adding a second copy.
;   * ADD_NPC itself loads the creature record for the id from MONCHA.GLB
;     (id table in member 0) into the party and sets +0x9B.
;
; The compact DQK row is the one CCPARTY builds for QSV heroes (name plus a
; GBD1 combat tail), derived from the MONCHA record exactly as CCPARTY's
; build_dqk_qsv_member derives it from a saved character record.  Two extra
; bytes in otherwise-zero tail padding carry the retail NPC flag byte and the
; NPC id, so the duplicate guard can be reproduced on a cold reload.
;
; All joins are applied to an in-memory copy.  Any rejection (bad input, full
; party, duplicate, missing MONCHA member) exits before the roster is opened
; for writing, so a rejected event leaves the file byte-identical.  The one
; write is a single DOS write that only ever extends the file.  Like /D it is
; not a crash-safe transaction: a power loss inside that one write can tear it.
;
; Exit codes: 0 applied / nothing to apply / every join already on the roster
;             (idempotent replay, logged), 1 bad input, 2 party full,
;             4 missing/undecodable MONCHA member.  (3 retired: it used to be
;             a duplicate join, which GBBOOT treated as fatal.)

NPC_ENTRY       equ 410
NPC_ROWS_MAX    equ 8                   ; retail DQK party cap (dqk-add-npc-full-party.md)
NPC_ROSTER_MAX  equ 16+(NPC_ROWS_MAX*NPC_ENTRY)
NPC_FX_LEN      equ 116
NPC_MON_MAX     equ 15360
NPC_DEC_CAP     equ 1024
NPC_REC_MIN     equ 1A0h
NPC_TAIL        equ 1+216               ; row offset of the GBD1 tail
NPC_MARK_OFF    equ 1+300               ; row offset of the NPC flag byte
NPC_ID_OFF      equ 1+301               ; row offset of the NPC id byte
NPC_NATIVE_FIRST equ 80h
NPC_NATIVE_LAST  equ 87h

npc_apply:
        cld
        mov     word [npc_rcount],0
        ; ---- effect prefix -------------------------------------------------
        mov     dx,effectpath
        mov     di,npc_fx
        mov     cx,NPC_FX_LEN
        call    npc_read_file
        jc      npc_bad_input
        cmp     ax,NPC_FX_LEN
        jne     npc_bad_input
        cmp     word [npc_fx],'GB'
        jne     npc_bad_input
        cmp     word [npc_fx+2],'EF'
        jne     npc_bad_input
        mov     ax,[npc_fx+4]
        cmp     ax,2                    ; join table exists from v2
        jb      npc_bad_input
        cmp     ax,15
        ja      npc_bad_input
        mov     ax,[npc_fx+82]
        cmp     ax,8                    ; NPCCAP
        ja      npc_bad_input
        mov     [npc_n],ax
        or      ax,ax
        jz      npc_flag_ok
        test    word [npc_fx+6],0010h   ; FX_HAVE_NPC must back a nonzero table
        jz      npc_bad_input
npc_flag_ok:
        ; Same envelope /D demands (version/length/status/sidecar<=>reason 10),
        ; read with single-word seeks so only the needed bytes are touched.
        call    npc_validate_effect
        jc      npc_bad_input
        cmp     word [npc_n],0
        je      npc_nothing
        ; ---- roster --------------------------------------------------------
        mov     dx,rosterpath
        mov     di,npc_rbuf
        mov     cx,NPC_ROSTER_MAX+1
        call    npc_read_file
        jc      npc_bad_input
        mov     [npc_rlen],ax
        cmp     ax,16
        jb      npc_bad_input
        cmp     ax,NPC_ROSTER_MAX
        ja      npc_bad_input
        cmp     word [npc_rbuf],'GB'
        jne     npc_bad_input
        cmp     word [npc_rbuf+2],'PR'
        jne     npc_bad_input
        cmp     word [npc_rbuf+4],2     ; v2
        jne     npc_bad_input
        cmp     word [npc_rbuf+8],NPC_ENTRY
        jne     npc_bad_input
        cmp     word [npc_rbuf+10],1    ; compact layout
        jne     npc_bad_input
        cmp     word [npc_rbuf+12],3    ; title id DQK
        jne     npc_bad_input
        cmp     word [npc_rbuf+14],1    ; schema revision
        jne     npc_bad_input
        mov     ax,[npc_rbuf+6]
        cmp     ax,NPC_ROWS_MAX
        ja      npc_bad_input
        mov     [npc_rcount],ax
        imul    ax,ax,NPC_ENTRY
        add     ax,16
        cmp     ax,[npc_rlen]
        jne     npc_bad_input
        ; ---- MONCHA library ------------------------------------------------
        mov     dx,npc_monpath
        mov     di,npc_monbuf
        mov     cx,NPC_MON_MAX+1
        call    npc_read_file
        jc      npc_bad_input
        mov     [npc_monlen],ax
        cmp     ax,32
        jb      npc_bad_input
        cmp     ax,NPC_MON_MAX
        ja      npc_bad_input
        call    npc_check_library
        jc      npc_bad_input
        ; ---- apply every join to the in-memory roster -----------------------
        mov     word [npc_i],0
        mov     ax,[npc_rcount]
        mov     [npc_rc0],ax
npc_join_loop:
        mov     ax,[npc_i]
        cmp     ax,[npc_n]
        jae     npc_write
        shl     ax,2
        mov     bx,ax
        mov     ax,[npc_fx+84+bx]
        cmp     ax,255
        ja      npc_bad_input
        mov     [npc_id],ax
        mov     ax,[npc_fx+86+bx]
        cmp     ax,255
        ja      npc_bad_input
        mov     [npc_morale],ax
        mov     ax,[npc_id]
        call    npc_find_member
        jc      npc_missing
        call    npc_load_member
        jc      npc_missing
        call    npc_build_row
        jc      npc_missing
        call    npc_check_duplicate
        jc      npc_skip_dup
        cmp     word [npc_rcount],NPC_ROWS_MAX
        jae     npc_full
        call    npc_pick_slot
        jc      npc_full
        mov     [npc_row],al
        ; append the row
        mov     ax,[npc_rcount]
        imul    ax,ax,NPC_ENTRY
        add     ax,npc_rbuf+16
        mov     di,ax
        mov     si,npc_row
        mov     cx,NPC_ENTRY
        rep     movsb
        inc     word [npc_rcount]
        inc     word [npc_i]
        jmp     npc_join_loop

npc_skip_dup:
        ; Idempotent: a replayed join (menu/ack resume restores the table, loop
        ; records repeat ids) is already applied.  Retail skips it silently; we
        ; log it so a transcript shows the skip.
        mov     dx,s_npc_skip
        call    puts
        inc     word [npc_i]
        jmp     npc_join_loop

npc_write:
        mov     ax,[npc_rcount]
        cmp     ax,[npc_rc0]
        je      npc_nothing_new
        mov     [npc_rbuf+6],ax
        imul    ax,ax,NPC_ENTRY
        add     ax,16
        mov     [npc_rlen],ax
        mov     ax,3D01h
        mov     dx,rosterpath
        int     21h
        jc      npc_bad_input
        mov     [npc_fh],ax
        mov     bx,ax
        mov     ah,40h
        mov     cx,[npc_rlen]
        mov     dx,npc_rbuf
        int     21h
        pushf
        push    ax
        mov     bx,[npc_fh]
        mov     ah,3Eh
        int     21h
        pop     ax
        popf
        jc      npc_bad_input
        cmp     ax,[npc_rlen]
        jne     npc_bad_input
        mov     dx,s_npc_applied
        call    puts
        mov     ax,4c00h
        int     21h
npc_nothing_new:
        mov     dx,s_npc_nonew
        call    puts
        mov     ax,4c00h
        int     21h
npc_nothing:
        mov     dx,s_npc_nothing
        call    puts
        mov     ax,4c00h
        int     21h
npc_bad_input:
        mov     dx,s_npc_bad
        mov     al,1
        jmp     short npc_exit
npc_full:
        mov     dx,s_npc_full
        mov     al,2
        jmp     short npc_exit
npc_missing:
        mov     dx,s_npc_missing
        mov     al,4
npc_exit:
        push    ax
        call    puts
        pop     ax
        mov     ah,4Ch
        int     21h

; DX = path, DI = buffer, CX = byte count to read.  AX = bytes read, CF=error.
npc_read_file:
        push    cx
        mov     ax,3D00h
        int     21h
        pop     cx
        jc      .err
        mov     [npc_fh],ax
        mov     bx,ax
        mov     ah,3Fh
        mov     dx,di
        int     21h
        pushf
        push    ax
        mov     bx,[npc_fh]
        mov     ah,3Eh
        int     21h
        pop     ax
        popf
        ret
.err:   stc
        ret

; CF set = effect is not an envelope /D would accept.  Reuses /D's validators
; (the dispatch below mirrors apply_effect_damage_roster's) so /N and /D cannot
; disagree about which records are well formed.
npc_validate_effect:
        mov     ax,3D00h
        mov     dx,effectpath
        int     21h
        jc      .open_bad
        mov     [efxfh],ax
        call    .body
        pushf
        mov     bx,[efxfh]
        mov     ah,3Eh
        int     21h
        popf
        ret
.open_bad:
        stc
        ret
.body:  mov     bx,[efxfh]
        mov     ax,4202h
        xor     cx,cx
        xor     dx,dx
        int     21h
        jc      .bad
        or      dx,dx
        jnz     .bad
        mov     [npc_flen],ax
        mov     ax,[npc_fx+4]
        cmp     ax,9
        je      .v9
        cmp     ax,14
        je      .v14
        cmp     ax,15
        jne     .bad
        cmp     word [npc_flen],GBEF_V15_LEN
        jne     .bad
        mov     ax,[npc_fx+8]
        cmp     ax,4
        je      .cap
        cmp     ax,2
        jne     .bad
        mov     bx,[efxfh]
        mov     dx,GBEF_MN_OPCODE_OFF
        call    read_effect_word_at
        jc      .bad
        cmp     ax,001dh
        je      .term
        jmp     validate_damage_v15_menu
.term:  jmp     validate_damage_v15_terminal
.cap:   jmp     validate_damage_v15_capacity
.v9:    cmp     word [npc_flen],GBEF_V9_LEN
        jne     .bad
        clc
        ret
.v14:   cmp     word [npc_flen],GBEF_V14_LEN
        jne     .bad
        test    word [npc_fx+6],FX_HAVE_SIDECAR
        jnz     .bad
        clc
        ret
.bad:   stc
        ret

; Validate the HLIB DATA envelope and cache the member count.
npc_check_library:
        cmp     word [npc_monbuf],'HL'
        jne     .bad
        cmp     word [npc_monbuf+2],'IB'
        jne     .bad
        cmp     word [npc_monbuf+12],'DA'
        jne     .bad
        mov     ax,[npc_monbuf+8]       ; stored pointer count - 1
        inc     ax
        cmp     ax,3
        jb      .bad
        cmp     ax,128
        ja      .bad
        mov     [npc_ptrn],ax
        ; every pointer must be a 16-bit offset inside the file, ascending
        xor     si,si
        xor     dx,dx                   ; previous pointer
.ptr:   cmp     si,[npc_ptrn]
        jae     .ok
        mov     bx,si
        shl     bx,2
        cmp     word [npc_monbuf+16+bx+2],0
        jne     .bad
        mov     ax,[npc_monbuf+16+bx]
        cmp     ax,dx
        jb      .bad
        cmp     ax,[npc_monlen]
        ja      .bad
        mov     dx,ax
        inc     si
        jmp     .ptr
.ok:    clc
        ret
.bad:   stc
        ret

; AX = NPC id -> AX = member index through the member-0 id table.  CF if absent.
npc_find_member:
        mov     [npc_want],ax
        mov     si,[npc_monbuf+16]      ; member 0 start
        mov     dx,[npc_monbuf+20]      ; member 0 end
        sub     dx,si
        add     si,npc_monbuf
        cmp     dx,2
        jb      .bad
        mov     cx,[si]                 ; entry count
        mov     ax,cx
        shl     ax,2
        add     ax,2
        cmp     ax,dx
        ja      .bad
        add     si,2
.scan:  or      cx,cx
        jz      .bad
        mov     ax,[si]
        cmp     ax,[npc_want]
        jne     .next
        mov     ax,[si+2]
        cmp     ax,1                    ; 0 is the id table itself
        jb      .bad
        mov     dx,[npc_ptrn]
        sub     dx,2                    ; last real member index
        cmp     ax,dx
        ja      .bad
        clc
        ret
.next:  add     si,4
        dec     cx
        jmp     .scan
.bad:   stc
        ret

; AX = member index -> npc_dec holds the expanded record, [npc_decl] its length.
npc_load_member:
        mov     bx,ax
        shl     bx,2
        mov     si,[npc_monbuf+16+bx]
        mov     dx,[npc_monbuf+16+bx+4]
        cmp     dx,[npc_monlen]
        ja      .bad
        sub     dx,si
        cmp     dx,3
        jb      .bad
        add     si,npc_monbuf
        mov     ax,si
        add     ax,dx
        mov     [npc_src_end],ax
        mov     al,[si]                 ; big-endian expanded length
        mov     ah,[si+1]
        xchg    al,ah
        ; (xchg above turns AL:AH = hi:lo into AX = hi<<8|lo)
        mov     [npc_want],ax
        add     si,2
        mov     di,npc_dec
.loop:  cmp     si,[npc_src_end]
        jae     .done
        lodsb
        cmp     al,80h
        je      .loop
        ja      .rep
        movzx   cx,al
        inc     cx
        mov     bx,si
        add     bx,cx
        cmp     bx,[npc_src_end]
        ja      .bad
        mov     bx,di
        add     bx,cx
        cmp     bx,npc_dec+NPC_DEC_CAP
        ja      .bad
        rep     movsb
        jmp     .loop
.rep:   cmp     si,[npc_src_end]
        jae     .bad
        movzx   ax,al
        mov     cx,101h
        sub     cx,ax
        mov     bx,di
        add     bx,cx
        cmp     bx,npc_dec+NPC_DEC_CAP
        ja      .bad
        lodsb
        rep     stosb
        jmp     .loop
.done:  mov     ax,di
        sub     ax,npc_dec
        cmp     ax,[npc_want]
        jne     .bad
        cmp     ax,NPC_REC_MIN
        jb      .bad
        mov     [npc_decl],ax
        clc
        ret
.bad:   stc
        ret

; Build the 410-byte compact row (slot byte left zero) from npc_dec.
; SI is kept 8 above the record start so the offsets match CCPARTY's
; build_dqk_qsv_member, which addresses the same fields from a QSV payload.
npc_build_row:
        mov     di,npc_row
        xor     ax,ax
        mov     cx,NPC_ENTRY/2
        rep     stosw
        mov     si,npc_dec+8
        push    si
        add     si,96                   ; record +0x68: 16-byte name
        mov     di,npc_row+2
        mov     cx,15
        xor     bx,bx
.name:  lodsb
        or      al,al
        jz      .name_done
        cmp     al,'a'
        jb      .store
        cmp     al,'z'
        ja      .store
        sub     al,20h
.store: mov     [di],al
        inc     di
        inc     bx
        loop    .name
.name_done:
        pop     si
        or      bl,bl
        jz      .bad
        mov     [npc_row+1],bl
        mov     byte [npc_row+NPC_TAIL],'G'
        mov     byte [npc_row+NPC_TAIL+1],'B'
        mov     byte [npc_row+NPC_TAIL+2],'D'
        mov     byte [npc_row+NPC_TAIL+3],'1'
        mov     word [npc_row+NPC_TAIL+4],1
        movzx   ax,byte [si+190h]       ; current HP (record +0x198)
        mov     [npc_row+NPC_TAIL+6],ax
        mov     al,60
        sub     al,[si+179]
        cbw
        mov     [npc_row+NPC_TAIL+8],ax
        movzx   ax,byte [si+173]
        mov     [npc_row+NPC_TAIL+10],ax
        movzx   ax,byte [si+175]
        mov     [npc_row+NPC_TAIL+12],ax
        mov     al,[si+177]
        cbw
        mov     [npc_row+NPC_TAIL+14],ax
        mov     al,60
        sub     al,[si+127]
        cbw
        mov     [npc_row+NPC_TAIL+20],ax
        movzx   ax,byte [si+136]
        cmp     ax,3
        jb      .move_min
        xor     dx,dx
        mov     bx,3
        div     bx
        or      ax,ax
        jnz     .move_clamp
.move_min:
        mov     ax,1
.move_clamp:
        cmp     ax,4
        jbe     .move_ok
        mov     ax,4
.move_ok:
        mov     [npc_row+NPC_TAIL+22],ax
        movzx   ax,byte [si+137]
        mov     [npc_row+NPC_TAIL+16],ax
        call    npc_class
        mov     [npc_row+NPC_TAIL+18],al
        mov     al,[si+179]
        mov     [npc_row+NPC_TAIL+19],al
        movzx   ax,byte [si+129]
        mov     [npc_row+NPC_TAIL+26],ax
        ; retail ADD_NPC stores (morale/2)|0x80 at record +0x9B
        mov     ax,[npc_morale]
        shr     al,1
        or      al,80h
        mov     [npc_row+NPC_MARK_OFF],al
        mov     al,[npc_id]
        mov     [npc_row+NPC_ID_OFF],al
        clc
        ret
.bad:   stc
        ret

; Same decision tree as CCPARTY's derive_dqk_qsv_class (SI = record + 8).
npc_class:
        mov     al,[si+183]
        test    al,58h
        jnz     .fighter
        test    al,04h
        jnz     .thief
        test    al,02h
        jnz     .cleric
        test    al,01h
        jnz     .mage
        cmp     byte [si+158],0
        jne     .fighter
        cmp     byte [si+159],0
        jne     .fighter
        cmp     byte [si+160],0
        jne     .fighter
        cmp     byte [si+161],0
        jne     .fighter
        cmp     byte [si+163],0
        jne     .thief
        cmp     byte [si+157],0
        jne     .cleric
        cmp     byte [si+162],0
        jne     .mage
        xor     al,al
        ret
.fighter:
        mov     al,1
        ret
.cleric:
        mov     al,2
        ret
.mage:
        mov     al,3
        ret
.thief:
        mov     al,4
        ret

; Retail guard: a member with the same name and the NPC flag already exists.
; CF set = duplicate.
npc_check_duplicate:
        xor     bx,bx
.row:   cmp     bx,[npc_rcount]
        jae     .none
        mov     ax,bx
        imul    ax,ax,NPC_ENTRY
        add     ax,npc_rbuf+16
        mov     si,ax
        test    byte [si+NPC_MARK_OFF],80h
        jz      .next
        movzx   cx,byte [npc_row+1]
        cmp     [si+1],cl
        jne     .next
        inc     cx                      ; compare length byte and the characters
        lea     di,[npc_row+1]
        lea     si,[si+1]
        repe    cmpsb
        je      .dup
.next:  inc     bx
        jmp     .row
.none:  clc
        ret
.dup:   stc
        ret

; AL = first unused native slot id 80h..85h.  CF if all are taken.
npc_pick_slot:
        mov     al,NPC_NATIVE_FIRST
.try:   cmp     al,NPC_NATIVE_LAST+1
        jae     .none
        xor     bx,bx
.row:   cmp     bx,[npc_rcount]
        jae     .free
        mov     dx,bx
        imul    dx,dx,NPC_ENTRY
        mov     si,dx
        cmp     [npc_rbuf+16+si],al
        je      .used
        inc     bx
        jmp     .row
.used:  inc     al
        jmp     .try
.free:  clc
        ret
.none:  stc
        ret

s_npc_applied db 'CCHOST: npc joins applied',13,10,'$'
s_npc_nothing db 'CCHOST: npc joins none',13,10,'$'
s_npc_bad db 'CCHOST: npc join input invalid',13,10,'$'
s_npc_full db 'CCHOST: npc join rejected: party full',13,10,'$'
s_npc_skip db 'CCHOST: npc join skipped: already in party',13,10,'$'
s_npc_nonew db 'CCHOST: npc joins none new',13,10,'$'
s_npc_missing db 'CCHOST: npc join rejected: no such member',13,10,'$'

section .bss
alignb 2
npc_monpath resb PATH_MAX
npc_fx      resb NPC_FX_LEN
npc_n       resw 1
npc_i       resw 1
npc_id      resw 1
npc_morale  resw 1
npc_rcount  resw 1
npc_rlen    resw 1
npc_monlen  resw 1
npc_ptrn    resw 1
npc_want    resw 1
npc_decl    resw 1
npc_src_end resw 1
npc_fh      resw 1
npc_flen    resw 1
npc_rc0     resw 1
npc_row     resb NPC_ENTRY
npc_dec     resb NPC_DEC_CAP
npc_rbuf    resb NPC_ROSTER_MAX+2
npc_monbuf  resb NPC_MON_MAX+2
section .text
