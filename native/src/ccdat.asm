; ============================================================================
;  CCDAT.COM  --  Gold Box game-data record parser / verifiable dumper.
;
;  Clean-room x86 parsers for the SSI Gold Box ".CCH-family" records, mirroring
;  the project's VERIFIED TypeScript loaders (packages/engine/src/loaders/
;  monster.ts, savedCharacter.ts, item.ts, dqkSave.ts, dqkItem.ts). NOTHING here
;  is re-reverse-engineered: every offset is copied from those loaders / hackdocs.
;
;  Usage:
;    CCDAT M <container.dax> <index>   parse monster record at DAX block <index>
;                                      (409-byte CoK, 422-byte CoAB, or 216-byte DoK)
;    CCDAT C <file.SAV>                parse a raw 409-byte CHRDATA{n}.SAV record
;    CCDAT I <container.dax> <index>   parse 63-byte CoK item record(s) in block
;    CCDAT J <container.dax> <index>   parse 17-byte DoK item record(s) in block
;                                      (mirrors item.ts decodeDokItemArchive)
;    CCDAT Q <file.QSV>                parse the DQK SAVGAMA.QSV global header
;                                      (raw file, no DAX; mirrors dqkSave.ts)
;    CCDAT T <ITEMS.DAT> <index>       parse one DQK 16-byte base-item catalogue
;                                      record (raw file; mirrors dqkItem.ts
;                                      decodeDqkBaseItem)
;    CCDAT N <item.dat> <index>        parse one DQK 18-byte per-instance item
;                                      record (raw file; mirrors dqkItem.ts
;                                      decodeDqkItemRecord)
;    CCDAT S <container.dax> <index>   parse a MON{n}SPC.DAX block -> flat array
;                                      of 9-byte special/affect records (mirrors
;                                      monsterSideTables.ts decodeMonsterSpcArchive)
;    CCDAT K <container.dax> <index>   parse a MON{n}ITM.DAX block -> flat array
;                                      of 63-byte monster carried-item records
;                                      (mirrors monsterSideTables.ts
;                                      decodeMonsterItmArchive; 'K' continues the
;                                      I/J/K item-verb family since I and J are
;                                      already taken)
;    CCDAT Z <container.dax> <index>   parse a MON{n}WIZ.DAX block -> one 220-byte
;                                      monster spellbook/memorization record,
;                                      printing the verified 0..73 memorized-
;                                      spell list (mirrors monsterSideTables.ts
;                                      decodeMonsterWizArchive; W is already the
;                                      raw CHRDATAn.WIZ save-file evidence verb)
;    CCDAT G <CHRDATAn.GAM>            parse a raw DoK CHRDATA{n}.GAM save file:
;                                      a 216-byte record, BYTE-IDENTICAL in
;                                      layout to the DoK compact monster record
;                                      under verb M (see docs/engine/research/
;                                      dok-chrdata-save-format.md)
;    CCDAT V <CHRDATAn.JNK>            parse a raw CHRDATA{n}.JNK inventory
;                                      file: 63-byte-per-item records (name@0
;                                      and count@57 VERIFIED against real
;                                      saves; byte@42 is printed too but is a
;                                      stale scratch/pointer byte, not an item
;                                      field -- see the doc)
;    CCDAT W <CHRDATAn.WIZ>            parse a raw CHRDATA{n}.WIZ 220-byte
;                                      spell record (PARTIAL decode: isCaster
;                                      flag, the raw nonzero known-spell bytes
;                                      in the fixed 34..73 window, and the two
;                                      4-byte tail count groups -- see the doc)
;    CCDAT E <CHRDATAn.EFF>            parse a raw CHRDATA{n}.EFF active-affect
;                                      file: 9-byte records, the SAME layout as
;                                      the MON*SPC.DAX affect record (verb S)
;
;  Fields are printed as labelled decimal/hex text lines to stdout so the output
;  can be diffed field-for-field against the TS loader (the oracle).
;
;  DAX container parse + signed-byte RLE decompression are the SAME routines as
;  cgbc.asm (CCGBC), already verified byte-identical to tools/dax_decode.py.
;
;  Assemble:  build.ps1 -Target ccdat   (nasm -f bin src/ccdat.asm -o build/ccdat.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

ENTRY_SZ        equ 9
COK_REC         equ 409     ; CoK monster / saved-character record size
COAB_REC        equ 422     ; CoAB Player/monster record size
DOK_REC         equ 216     ; DoK compact monster record size
ITEM_REC        equ 63      ; CoK item record size
DOK_ITEM_REC    equ 17      ; DoK compact item record size (item.ts DokItemRecord)
DQK_CAT_REC     equ 16      ; DQK ITEMS.DAT base-item catalogue record size
DQK_INST_REC    equ 18      ; DQK item.dat per-instance item record size
MON_AFFECT_REC  equ 9       ; MON{n}SPC.DAX affect/special record size (COAB Affect.StructSize)
                             ; (MON{n}ITM.DAX reuses ITEM_REC=63 -- COAB confirms it's the
                             ; SAME Item.StructSize record as CoK ITEM{n}.DAX)
DQK_SAVE_MIN    equ 38      ; smallest file that reaches overlandRow@37 (dqkSave.ts)
TO_HIT_BASE     equ 60      ; AC / THAC0 stored as (60 - value)
WIZ_REC         equ 220     ; DoK CHRDATA{n}.WIZ spell record size (fixed, all characters)
MON_WIZ_LIST    equ 74      ; MON{n}WIZ.DAX memorized-spell-list bytes decoded by TS
                             ; (CHRDATA{n}.GAM reuses DOK_REC=216; CHRDATA{n}.EFF reuses
                             ; MON_AFFECT_REC=9; CHRDATA{n}.JNK reuses ITEM_REC=63 --
                             ; see docs/engine/research/dok-chrdata-save-format.md)

start:
        cld
        mov     sp, stacktop
        call    parse_args

        ; raw_seg = a segment 64KB above ours, for the decompressed block.
        mov     ax, cs
        add     ax, 1000h
        mov     [raw_seg], ax

        mov     al, [verb]
        cmp     al, 'M'
        je      .monster
        cmp     al, 'C'
        je      .character
        cmp     al, 'I'
        je      .item
        cmp     al, 'J'
        je      .dokitem
        cmp     al, 'Q'
        je      .dqksave
        cmp     al, 'T'
        je      .dqkcat
        cmp     al, 'N'
        je      .dqkinst
        cmp     al, 'S'
        je      .monspc
        cmp     al, 'K'
        je      .monitm
        cmp     al, 'Z'
        je      .monwiz
        cmp     al, 'G'
        je      .gam
        cmp     al, 'V'
        je      .jnk
        cmp     al, 'W'
        je      .wiz
        cmp     al, 'E'
        je      .eff
        jmp     .usage

; ----- C: raw 409-byte .SAV file, no DAX -----------------------------------
.character:
        call    read_savefile           ; raw_seg:0 = whole file, [raw_size]=len
        mov     ax, [raw_size]
        cmp     ax, COK_REC
        jne     .badsav
        call    print_character
        jmp     .ok

; ----- M: DAX block -> monster record --------------------------------------
.monster:
        call    open_container
        call    load_indexed_block      ; decompress selected block -> raw_seg:0
        mov     ax, [raw_size]
        cmp     ax, COK_REC
        je      .mok
        cmp     ax, COAB_REC
        je      .mok
        cmp     ax, DOK_REC
        je      .mok
        jmp     .badmon
.mok:
        call    print_monster
        jmp     .ok

; ----- I: DAX block -> 63-byte item record(s) ------------------------------
.item:
        call    open_container
        call    load_indexed_block
        call    print_items
        jmp     .ok

; ----- J: DAX block -> 17-byte DoK item record(s) --------------------------
.dokitem:
        call    open_container
        call    load_indexed_block
        call    print_dok_items
        jmp     .ok

; ----- Q: raw SAVGAMA.QSV file -> DQK global save header -------------------
.dqksave:
        call    read_savefile
        mov     ax, [raw_size]
        cmp     ax, DQK_SAVE_MIN
        jb      .badqsv
        call    print_dqksave
        jmp     .ok

; ----- T: raw ITEMS.DAT file -> one 16-byte base-item catalogue record -----
.dqkcat:
        call    read_savefile
        mov     ax, [xindex]
        mov     bx, DQK_CAT_REC
        mul     bx
        mov     [rec_off], ax
        add     ax, DQK_CAT_REC
        cmp     ax, [raw_size]
        ja      .badridx
        call    print_dqk_baseitem
        jmp     .ok

; ----- N: raw item.dat file -> one 18-byte per-instance item record --------
.dqkinst:
        call    read_savefile
        mov     ax, [xindex]
        mov     bx, DQK_INST_REC
        mul     bx
        mov     [rec_off], ax
        add     ax, DQK_INST_REC
        cmp     ax, [raw_size]
        ja      .badridx
        call    print_dqk_iteminst
        jmp     .ok

; ----- S: DAX block -> MON{n}SPC.DAX flat array of 9-byte affect records ---
.monspc:
        call    open_container
        call    load_indexed_block
        call    print_mon_spc
        jmp     .ok

; ----- K: DAX block -> MON{n}ITM.DAX flat array of 63-byte item records ----
.monitm:
        call    open_container
        call    load_indexed_block
        call    print_mon_itm
        jmp     .ok

; ----- Z: DAX block -> MON{n}WIZ.DAX 220-byte monster spell list ----------
.monwiz:
        call    open_container
        call    load_indexed_block
        mov     ax, [raw_size]
        cmp     ax, WIZ_REC
        jne     .badmwiz
        call    print_mon_wiz
        jmp     .ok

; ----- G: raw CHRDATA{n}.GAM file -> DoK 216-byte character record ---------
; Same struct as the DoK monster layout (verb M / dok_layout) -- see
; docs/engine/research/dok-chrdata-save-format.md.
.gam:
        call    read_savefile
        mov     ax, [raw_size]
        cmp     ax, DOK_REC
        jne     .badgam
        call    print_dok_char
        jmp     .ok

; ----- V: raw CHRDATA{n}.JNK file -> 63-byte carried-item record(s) --------
; print_jnk_items does its own nonzero-multiple-of-63 check (mirrors print_items).
.jnk:
        call    read_savefile
        call    print_jnk_items
        jmp     .ok

; ----- W: raw CHRDATA{n}.WIZ file -> 220-byte spell record (PARTIAL) -------
.wiz:
        call    read_savefile
        mov     ax, [raw_size]
        cmp     ax, WIZ_REC
        jne     .badwiz
        call    print_wiz
        jmp     .ok

; ----- E: raw CHRDATA{n}.EFF file -> 9-byte active-affect record(s) --------
; Same 9-byte layout as MON*SPC.DAX (verb S) -- print_eff reuses print_mon_spc's
; record loop, skipping the DAX-only blockId line.
.eff:
        call    read_savefile
        call    print_eff
        jmp     .ok

.ok:
        call    closefh
        mov     ax, 4C00h
        int     21h
.usage:
        mov     si, s_usage
        jmp     .die
.badsav:
        mov     si, s_badsav
        jmp     .die
.badmon:
        call    closefh
        mov     si, s_badmon
        jmp     .die
.badqsv:
        mov     si, s_badqsv
        jmp     .die
.badridx:
        call    closefh
        mov     si, s_badridx
        jmp     .die
.badgam:
        mov     si, s_badgam
        jmp     .die
.badwiz:
        mov     si, s_badwiz
        jmp     .die
.badmwiz:
        call    closefh
        mov     si, s_badmwiz
        jmp     .die
.die:
        call    puts
        mov     ax, 4C01h
        int     21h

closefh:
        cmp     word [fh], 0
        je      .r
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        mov     word [fh], 0
.r:     ret

; ============================================================================
;  read_savefile: read the whole <container> file into raw_seg:0, set raw_size.
;  Used for the raw .SAV character path (file is a bare record, not a DAX).
; ============================================================================
read_savefile:
        mov     ax, 3D00h
        mov     dx, cbuf
        int     21h
        jc      .noopen
        mov     [fh], ax
        ; read up to 65535 bytes into raw_seg:0
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     bx, [cs:fh]
        mov     ah, 3Fh
        mov     cx, 0FFFFh
        xor     dx, dx
        int     21h                     ; ax = bytes read
        pop     ds
        mov     [raw_size], ax
        ret
.noopen:
        mov     si, s_noopen
        jmp     start.die

; ============================================================================
;  open_container: open DAX, parse its TOC (identical to CCGBC).
; ============================================================================
open_container:
        mov     ax, 3D00h
        mov     dx, cbuf
        int     21h
        jc      .noopen
        mov     [fh], ax
        call    seek0
        call    getw                    ; word0 = toc_bytes
        mov     [toc_bytes], ax
        or      ax, ax
        jz      .badfmt
        xor     dx, dx
        mov     bx, ENTRY_SZ
        div     bx
        or      dx, dx
        jnz     .badfmt                 ; not a multiple of 9 -> not DAX
        mov     [entcount], ax
        mov     ax, [toc_bytes]
        add     ax, 2
        mov     [data_base], ax
        mov     cx, [toc_bytes]
        cmp     cx, TOC_MAX
        ja      .badfmt
        mov     di, toc
.rt:
        jcxz    .done
        call    getb
        mov     [di], al
        inc     di
        dec     cx
        jmp     .rt
.done:
        ret
.noopen:
        mov     si, s_noopen
        jmp     start.die
.badfmt:
        call    closefh
        mov     si, s_badfmt
        jmp     start.die

; ============================================================================
;  load_indexed_block: select TOC entry [xindex], decompress it fully into
;  raw_seg:0, leaving [raw_size] = decompressed size.
; ============================================================================
load_indexed_block:
        mov     ax, [xindex]
        cmp     ax, [entcount]
        jae     .badidx
        mov     [curidx], ax
        call    select_block            ; sets raw_size, seeks to block data
        mov     ax, [raw_size]
        mov     [rle_limit], ax
        mov     ax, [raw_seg]
        mov     es, ax
        call    decode_rle
        ret
.badidx:
        call    closefh
        mov     si, s_badidx
        jmp     start.die

; ============================================================================
;  select_block: from [curidx], read TOC fields + seek to compressed data.
;  (Same TOC layout as CCGBC: +1 offset lo, +3 offset hi, +5 raw_size.)
; ============================================================================
select_block:
        mov     ax, [curidx]
        mov     bx, ENTRY_SZ
        mul     bx
        mov     si, ax
        add     si, toc
        mov     ax, [si+5]              ; raw_size
        mov     [raw_size], ax
        mov     ax, [si+1]              ; data_offset low
        mov     dx, [si+3]              ; data_offset high
        add     ax, [data_base]
        adc     dx, 0
        call    seek_set
        ret

; ============================================================================
;  decode_rle: signed-byte RLE from the file (getb) -> es:0, [rle_limit] bytes.
;  Byte-identical to CCGBC / tools/dax_decode.py.
; ============================================================================
decode_rle:
        xor     di, di
.loop:
        mov     ax, di
        cmp     ax, [rle_limit]
        jae     .done
        call    getb
        cmp     al, 80h
        jae     .rep
        movzx   cx, al
        inc     cx
.lit:
        call    getb
        mov     [es:di], al
        inc     di
        loop    .lit
        jmp     .loop
.rep:
        neg     al
        movzx   cx, al
        call    getb
        mov     ah, al
.rp:
        mov     [es:di], ah
        inc     di
        loop    .rp
        jmp     .loop
.done:
        ret

; ============================================================================
;  RECORD ACCESS HELPERS
;  raw_seg:off holds the decompressed record. Read one byte / word at an offset.
; ============================================================================
; rb: AL = byte at raw_seg:BX. Preserves BX.
rb:
        push    ds
        push    ax
        mov     ax, [raw_seg]
        mov     ds, ax
        pop     ax
        mov     al, [bx]
        pop     ds
        ret

; rw: AX = LE word at raw_seg:BX.
rw:
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     ax, [bx]
        pop     ds
        ret

; ============================================================================
;  print a "<label>" then a decimal of AX then CRLF.
;  si = label (ASCIIZ), ax = value.
; ============================================================================
emit_label_dec:
        push    ax
        mov     di, linebuf
        mov     es, [cs:our_seg]        ; stosb targets ES = our data seg
        push    si
        ; copy label
.cl:
        lodsb
        or      al, al
        jz      .lc
        stosb
        jmp     .cl
.lc:
        pop     si
        pop     ax
        call    put_dec_di
        call    crlf_flush
        ret

; emit_label_sdec: like emit_label_dec but AX is signed (print leading '-').
emit_label_sdec:
        push    ax
        mov     di, linebuf
        mov     es, [cs:our_seg]
        push    si
.cl:
        lodsb
        or      al, al
        jz      .lc
        stosb
        jmp     .cl
.lc:
        pop     si
        pop     ax
        test    ax, 8000h
        jz      .pos
        push    ax
        mov     al, '-'
        stosb
        pop     ax
        neg     ax
.pos:
        call    put_dec_di
        call    crlf_flush
        ret

; put_dec_di: append decimal of AX at ES:DI (di advanced).
put_dec_di:
        push    bx
        push    cx
        push    dx
        mov     bx, 10
        xor     cx, cx
.dv:
        xor     dx, dx
        div     bx
        push    dx
        inc     cx
        or      ax, ax
        jnz     .dv
.pp:
        pop     dx
        add     dl, '0'
        mov     [es:di], dl
        inc     di
        loop    .pp
        pop     dx
        pop     cx
        pop     bx
        ret

; crlf_flush: append CRLF at ES:DI, then write linebuf..di to stdout.
crlf_flush:
        mov     al, 0Dh
        mov     [es:di], al
        inc     di
        mov     al, 0Ah
        mov     [es:di], al
        inc     di
        mov     cx, di
        sub     cx, linebuf
        push    ds
        mov     ax, [cs:our_seg]
        mov     ds, ax
        mov     dx, linebuf
        mov     bx, 1
        mov     ah, 40h
        int     21h
        pop     ds
        ret

; ============================================================================
;  print the record's name field: "name: <ascii>".
;  name = length byte at raw_seg:0, ASCII at raw_seg:1.., clamped to maxlen CX.
; ============================================================================
print_name:
        mov     di, linebuf
        mov     es, [cs:our_seg]
        mov     si, s_name
.cl:
        lodsb
        or      al, al
        jz      .lc
        stosb
        jmp     .cl
.lc:
        ; read length byte (raw_seg:0)
        xor     bx, bx
        call    rb                      ; al = name length
        movzx   cx, al
        cmp     cx, 15
        jbe     .clok
        mov     cx, 15
.clok:
        jcxz    .nameend
        mov     bx, 1                   ; name chars start at offset 1
.nl:
        call    rb                      ; al = raw_seg:bx
        or      al, al
        jz      .nameend
        mov     [es:di], al
        inc     di
        inc     bx
        loop    .nl
.nameend:
        call    crlf_flush
        ret

; ============================================================================
;  print abilities (6 scores, current byte of each cur,max pair @ base BX init).
;  on entry: dx = base offset (ability table). Prints STR/INT/WIS/DEX/CON/CHA.
; ============================================================================
print_abilities:
        mov     [abil_base], dx
        mov     si, s_str
        call    .one
        mov     si, s_int
        call    .one
        mov     si, s_wis
        call    .one
        mov     si, s_dex
        call    .one
        mov     si, s_con
        call    .one
        mov     si, s_cha
        call    .one
        ret
.one:
        push    si
        mov     bx, [abil_base]
        call    rb
        movzx   ax, al
        pop     si
        call    emit_label_dec
        add     word [abil_base], 2     ; next (cur,max) pair
        ret

; ============================================================================
;  print_character: parse a 409-byte CHRDATA{n}.SAV record.
;  Offsets mirror savedCharacter.ts exactly.
; ============================================================================
print_character:
        mov     si, s_hdr_char
        call    puts
        mov     cx, 15
        call    print_name

        mov     dx, 16                  ; abilities @16
        call    print_abilities

        ; thac0 = 60 - byte[89]
        mov     bx, 89
        call    rb
        mov     ah, TO_HIT_BASE
        sub     ah, al
        movzx   ax, ah
        mov     si, s_thac0
        call    emit_label_sdec

        ; class code @90
        mov     bx, 90
        call    rb
        movzx   ax, al
        mov     si, s_class
        call    emit_label_dec

        ; hp @98
        mov     bx, 98
        call    rb
        movzx   ax, al
        mov     si, s_hp
        call    emit_label_dec

        ; ac = 60 - byte[275]
        mov     bx, 275
        call    rb
        mov     ah, TO_HIT_BASE
        sub     ah, al
        movsx   ax, ah
        mov     si, s_ac
        call    emit_label_sdec

        mov     dx, 208
        call    print_saves_at

        ; xp = u16 @304
        mov     bx, 304
        call    rw
        mov     si, s_xp
        call    emit_label_dec
        ret

; print the 5 saving throws at offset DX (CoK/CoAB save layout).
; Offset is tracked in [save_off] memory because emit_label_dec clobbers BX.
print_saves_at:
        mov     [save_off], dx
        mov     si, s_sv1
        call    .sv
        mov     si, s_sv2
        call    .sv
        mov     si, s_sv3
        call    .sv
        mov     si, s_sv4
        call    .sv
        mov     si, s_sv5
        call    .sv
        ret
.sv:
        push    si
        mov     bx, [save_off]
        call    rb
        movzx   ax, al
        pop     si
        call    emit_label_dec
        inc     word [save_off]
        ret

; ============================================================================
;  print_monster: parse a 409-byte (CoK), 422-byte (CoAB), or 216-byte (DoK)
;  monster record.
;  Length-dispatches the offset table, mirroring monster.ts COK_LAYOUT/DOK_LAYOUT.
; ============================================================================
print_monster:
        ; choose layout pointer (cs:layout_ptr) by [raw_size]
        mov     ax, [raw_size]
        cmp     ax, COK_REC
        jne     .dok
        mov     word [layout_ptr], cok_layout
        mov     si, s_hdr_mon_cok
        jmp     .go
.dok:
        cmp     ax, COAB_REC
        jne     .dok2
        mov     word [layout_ptr], coab_layout
        mov     si, s_hdr_mon_coab
        jmp     .go
.dok2:
        mov     word [layout_ptr], dok_layout
        mov     si, s_hdr_mon_dok
.go:
        call    puts
.body:
        ; entry point for print_dok_char (verb G): [layout_ptr] is already set
        ; to dok_layout and the header already printed by the caller.
        mov     cx, 15
        call    print_name

        ; abilities (offset from layout)
        mov     bx, [layout_ptr]
        mov     dx, [bx+L_ABILITY]
        call    print_abilities

        ; category byte. CoAB has no CoK/DoK 5/6/7 category byte, so derive
        ; the same broad category from Race.monster or nonzero monsterType.
        cmp     word [raw_size], COAB_REC
        je      .coab_category
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_CATEGORY]
        call    rb
        movzx   ax, al
        jmp     .emit_category
.coab_category:
        mov     bx, 74h                  ; race
        call    rb
        cmp     al, 0
        je      .coab_monster
        mov     bx, 11Ah                 ; monsterType
        call    rb
        or      al, al
        jnz     .coab_monster
        mov     ax, 6                    ; classed humanoid
        jmp     .emit_category
.coab_monster:
        mov     ax, 7
.emit_category:
        mov     si, s_cat
        call    emit_label_dec

        ; thac0 = 60 - byte[layout.thac0]   (signed)
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_THAC0]
        call    rb
        mov     ah, TO_HIT_BASE
        sub     ah, al
        movsx   ax, ah
        mov     si, s_thac0
        call    emit_label_sdec

        ; ac = 60 - byte[layout.ac]   (signed)
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_AC]
        call    rb
        mov     ah, TO_HIT_BASE
        sub     ah, al
        movsx   ax, ah
        mov     si, s_ac
        call    emit_label_sdec

        ; damage: count d sides + bonus
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_DCOUNT]
        call    rb
        movzx   ax, al
        mov     si, s_dcount
        call    emit_label_dec
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_DSIDES]
        call    rb
        movzx   ax, al
        mov     si, s_dsides
        call    emit_label_dec
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_DBONUS]
        call    rb
        cmp     word [raw_size], COAB_REC
        jne     .db_unsigned
        cbw
        jmp     .db_emit
.db_unsigned:
        movzx   ax, al
.db_emit:
        mov     si, s_dbonus
        call    emit_label_dec

        cmp     word [raw_size], COAB_REC
        je      .skip_icon
        ; iconSize byte (present in both formats): print byte + decoded size (1/2)
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_ICON]
        call    rb
        movzx   ax, al
        mov     si, s_iconb
        call    emit_label_dec
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_ICON]
        call    rb
        cmp     al, 1
        jbe     .small
        mov     ax, 2
        jmp     .ie
.small:
        mov     ax, 1
.ie:
        mov     si, s_iconsz
        call    emit_label_dec
.skip_icon:

        ; morale byte: print raw + decoded %
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_MORALE]
        call    rb
        movzx   ax, al
        mov     si, s_moralb
        call    emit_label_dec
        mov     bx, [layout_ptr]
        mov     bx, [bx+L_MORALE]
        call    rb
        cmp     al, 7Fh
        jbe     .nomorale               ; <=0x7f -> never checks
        and     al, 7Fh
        movzx   ax, al
        shl     ax, 1                   ; (byte&0x7f)*2
        cmp     ax, 102
        jbe     .mok
        mov     ax, 102
.mok:
        mov     si, s_morale
        call    emit_label_dec
.nomorale:

        ; CoK/CoAB fields: hp, hitDice, saves, xp.
        cmp     word [raw_size], COK_REC
        je      .cok_tail
        cmp     word [raw_size], COAB_REC
        je      .coab_tail
        jmp     .done

.cok_tail:
        mov     bx, 98
        call    rb
        movzx   ax, al
        mov     si, s_hp
        call    emit_label_dec

        mov     bx, 214
        call    rb
        movzx   ax, al
        mov     si, s_hd
        call    emit_label_dec

        mov     dx, 208
        call    print_saves_at

        mov     bx, 304
        call    rw
        mov     si, s_xp
        call    emit_label_dec
        jmp     .done
.coab_tail:
        mov     bx, 1A4h                 ; hit_point_current
        call    rb
        or      al, al
        jnz     .coab_hp_ok
        mov     bx, 78h                  ; hit_point_max fallback
        call    rb
.coab_hp_ok:
        movzx   ax, al
        mov     si, s_hp
        call    emit_label_dec

        mov     bx, 0E5h
        call    rb
        movzx   ax, al
        mov     si, s_hd
        call    emit_label_dec

        mov     bx, 11Ch                 ; attacksCount in half-attacks
        call    rb
        movzx   ax, al
        mov     si, s_halfatt
        call    emit_label_dec

        mov     dx, 0DFh
        call    print_saves_at

        mov     bx, 127h
        call    rw
        push    ax
        mov     bx, 129h
        call    rw
        or      ax, ax
        pop     ax
        mov     si, s_xp
        call    emit_label_dec
.done:
        ret

; ============================================================================
;  print_dok_char: verb G -- raw CHRDATA{n}.GAM file (216 bytes). Prints its
;  own header then jumps into print_monster.body, since a DoK .GAM record is
;  BYTE-IDENTICAL to the DoK compact monster record (dok_layout): name@0,
;  abilities@16, thac0@31, category@32 (a class-code-like enum for a PC
;  record, not the monster 5/6/7 enum), dmg@89-91, ac@95, iconSize@41,
;  morale@62. Confirmed on all 6 real CHRDATA{1..6}.GAM records (name/ability
;  bytes match the known pregen party; thac0/ac/damage decode to sane D&D
;  values). See docs/engine/research/dok-chrdata-save-format.md.
; ============================================================================
print_dok_char:
        mov     word [layout_ptr], dok_layout
        mov     si, s_hdr_gam
        call    puts
        jmp     print_monster.body

; ============================================================================
;  print_items: split the decompressed block into 63-byte records and print
;  each (name / baseType@42 / count@57), stopping at a bad name-length byte.
;  Mirrors item.ts decodeItemArchive's per-block split + sniff.
; ============================================================================
print_items:
        ; block length must be a multiple of 63 (item.ts gate)
        mov     ax, [raw_size]
        xor     dx, dx
        mov     bx, ITEM_REC
        div     bx
        or      dx, dx
        jnz     .notitem
        mov     [rec_total], ax
        mov     word [rec_i], 0
        mov     word [rec_off], 0
.loop:
        mov     ax, [rec_i]
        cmp     ax, [rec_total]
        jae     .done
        ; sniff: name-length byte (raw_seg:rec_off) in 1..40
        mov     bx, [rec_off]
        call    rb
        cmp     al, 1
        jb      .done
        cmp     al, 40
        ja      .done
        call    print_one_item
        mov     ax, [rec_off]
        add     ax, ITEM_REC
        mov     [rec_off], ax
        inc     word [rec_i]
        jmp     .loop
.done:
        ret
.notitem:
        mov     si, s_baditem
        jmp     start.die

; print one item at base offset [rec_off]: index, name, baseType@+42, count@+57.
print_one_item:
        mov     si, s_item_hdr
        mov     ax, [rec_i]
        call    emit_label_dec

        ; name (length byte at rec_off, chars at rec_off+1)
        mov     di, linebuf
        mov     es, [cs:our_seg]
        mov     si, s_name
.cl:
        lodsb
        or      al, al
        jz      .lc
        stosb
        jmp     .cl
.lc:
        mov     bx, [rec_off]
        call    rb                      ; al = name length
        movzx   cx, al
        cmp     cx, ITEM_REC-1
        jbe     .clok
        mov     cx, ITEM_REC-1
.clok:
        mov     bx, [rec_off]
        inc     bx                      ; first name char
        jcxz    .nameend
.nl:
        call    rb
        or      al, al
        jz      .nameend
        mov     [es:di], al
        inc     di
        inc     bx
        loop    .nl
.nameend:
        call    crlf_flush

        ; baseType @ rec_off+42
        mov     bx, [rec_off]
        add     bx, 42
        call    rb
        movzx   ax, al
        mov     si, s_base
        call    emit_label_dec

        ; count @ rec_off+57
        mov     bx, [rec_off]
        add     bx, 57
        call    rb
        movzx   ax, al
        mov     si, s_count
        call    emit_label_dec
        ret

; ============================================================================
;  print_jnk_items: verb V -- raw CHRDATA{n}.JNK file. Splits the file into
;  63-byte-per-item records (SAME size as the CoK 'I' item record, item.ts
;  ITEM_RECORD_SIZE) and prints name@0/1 + count@57 -- both VERIFIED against
;  real saves (stackable items like "Arrows" carry their quantity at byte 57,
;  exactly item.ts's COUNT_OFFSET). byte@42 is ALSO printed (mirroring 'I''s
;  baseType@42 position) but it is NOT a reliable base-type id here: across
;  real records it increases by exactly 63 (the record's own size) from one
;  record to the next -- the low byte of a stale in-memory pointer to the
;  item's own record, not game data. Kept in the output for transparency, not
;  because it means anything -- see docs/engine/research/dok-chrdata-save-format.md.
; ============================================================================
print_jnk_items:
        mov     si, s_hdr_jnk
        call    puts

        mov     ax, [raw_size]
        xor     dx, dx
        mov     bx, ITEM_REC
        div     bx
        or      dx, dx
        jnz     .notjnk
        mov     [rec_total], ax
        mov     word [rec_i], 0
        mov     word [rec_off], 0
.loop:
        mov     ax, [rec_i]
        cmp     ax, [rec_total]
        jae     .done
        ; sniff: name-length byte (raw_seg:rec_off) in 1..40 (same gate as 'I')
        mov     bx, [rec_off]
        call    rb
        cmp     al, 1
        jb      .done
        cmp     al, 40
        ja      .done
        call    print_one_jnk
        mov     ax, [rec_off]
        add     ax, ITEM_REC
        mov     [rec_off], ax
        inc     word [rec_i]
        jmp     .loop
.done:
        ret
.notjnk:
        mov     si, s_badjnk
        jmp     start.die

; print one CHRDATA{n}.JNK item at base offset [rec_off]: index, name,
; scratch42 (see the header comment above -- NOT a real item field), count@57.
print_one_jnk:
        mov     si, s_item_hdr
        mov     ax, [rec_i]
        call    emit_label_dec

        ; name (length byte at rec_off, chars at rec_off+1)
        mov     di, linebuf
        mov     es, [cs:our_seg]
        mov     si, s_name
.cl:
        lodsb
        or      al, al
        jz      .lc
        stosb
        jmp     .cl
.lc:
        mov     bx, [rec_off]
        call    rb                      ; al = name length
        movzx   cx, al
        cmp     cx, ITEM_REC-1
        jbe     .clok
        mov     cx, ITEM_REC-1
.clok:
        mov     bx, [rec_off]
        inc     bx                      ; first name char
        jcxz    .nameend
.nl:
        call    rb
        or      al, al
        jz      .nameend
        mov     [es:di], al
        inc     di
        inc     bx
        loop    .nl
.nameend:
        call    crlf_flush

        ; scratch42 @ rec_off+42 (NOT a base-type id -- see header comment)
        mov     bx, [rec_off]
        add     bx, 42
        call    rb
        movzx   ax, al
        mov     si, s_scratch42
        call    emit_label_dec

        ; count @ rec_off+57 (VERIFIED: e.g. "61 Arrows +1" -> count=61)
        mov     bx, [rec_off]
        add     bx, 57
        call    rb
        movzx   ax, al
        mov     si, s_count
        call    emit_label_dec
        ret

; ============================================================================
;  print_dok_items: split the decompressed DAX block into 17-byte DoK item
;  records and print each. Mirrors item.ts decodeDokItemArchive's per-block
;  split (block length must be an exact multiple of 17) + sniffDokItemRecord
;  gate (byte0 in 1..150, byte8 <= 20, byte10 <= 1), stopping at the first
;  record that fails the sniff (the table's unused tail).
; ============================================================================
print_dok_items:
        mov     ax, [raw_size]
        xor     dx, dx
        mov     bx, DOK_ITEM_REC
        div     bx
        or      dx, dx
        jnz     .notdokitem
        mov     [rec_total], ax
        mov     word [rec_i], 0
        mov     word [rec_off], 0
.loop:
        mov     ax, [rec_i]
        cmp     ax, [rec_total]
        jae     .done
        ; sniff: byte0 (base-type pointer) in 1..150
        mov     bx, [rec_off]
        call    rb
        cmp     al, 1
        jb      .done
        cmp     al, 150
        ja      .done
        ; byte8 (magic bonus) <= 20
        mov     bx, [rec_off]
        add     bx, 8
        call    rb
        cmp     al, 20
        ja      .done
        ; byte10 (ready flag) <= 1
        mov     bx, [rec_off]
        add     bx, 10
        call    rb
        cmp     al, 1
        ja      .done
        call    print_one_dokitem
        mov     ax, [rec_off]
        add     ax, DOK_ITEM_REC
        mov     [rec_off], ax
        inc     word [rec_i]
        jmp     .loop
.done:
        ret
.notdokitem:
        mov     si, s_baddokitem
        jmp     start.die

; print one DoK item at base offset [rec_off]: index + every DokItemRecord field.
print_one_dokitem:
        mov     si, s_item_hdr
        mov     ax, [rec_i]
        call    emit_label_dec

        mov     bx, [rec_off]
        call    rb
        movzx   ax, al
        mov     si, s_base
        call    emit_label_dec

        ; nameCodes: [byte3 (primary), byte2 (adjective), byte1 (qualifier)]
        mov     bx, [rec_off]
        add     bx, 3
        call    rb
        movzx   ax, al
        mov     si, s_nc0
        call    emit_label_dec
        mov     bx, [rec_off]
        add     bx, 2
        call    rb
        movzx   ax, al
        mov     si, s_nc1
        call    emit_label_dec
        mov     bx, [rec_off]
        add     bx, 1
        call    rb
        movzx   ax, al
        mov     si, s_nc2
        call    emit_label_dec

        ; encumbrance u16 @4
        mov     bx, [rec_off]
        add     bx, 4
        call    rw
        mov     si, s_enc
        call    emit_label_dec

        ; value u16 @6
        mov     bx, [rec_off]
        add     bx, 6
        call    rw
        mov     si, s_value
        call    emit_label_dec

        ; magicBonus @8
        mov     bx, [rec_off]
        add     bx, 8
        call    rb
        movzx   ax, al
        mov     si, s_magicb
        call    emit_label_dec

        ; charges @14
        mov     bx, [rec_off]
        add     bx, 14
        call    rb
        movzx   ax, al
        mov     si, s_charges
        call    emit_label_dec

        ; ready: byte10 != 0
        mov     bx, [rec_off]
        add     bx, 10
        call    rb
        or      al, al
        jz      .rdy0
        mov     ax, 1
        jmp     .rdydone
.rdy0:
        xor     ax, ax
.rdydone:
        mov     si, s_ready
        call    emit_label_dec

        ; identified: byte11 == 0
        mov     bx, [rec_off]
        add     bx, 11
        call    rb
        or      al, al
        jnz     .id0
        mov     ax, 1
        jmp     .iddone
.id0:
        xor     ax, ax
.iddone:
        mov     si, s_ident
        call    emit_label_dec

        ; cursed: byte12 != 0
        mov     bx, [rec_off]
        add     bx, 12
        call    rb
        or      al, al
        jz      .cur0
        mov     ax, 1
        jmp     .curdone
.cur0:
        xor     ax, ax
.curdone:
        mov     si, s_cursed
        call    emit_label_dec
        ret

; ============================================================================
;  print_dqksave: parse the DQK SAVGAMA.QSV global-state header (raw file, no
;  DAX). Offsets mirror dqkSave.ts's OFF table exactly.
; ============================================================================
print_dqksave:
        mov     si, s_hdr_qsv
        call    puts

        mov     ax, [raw_size]
        mov     si, s_bytelen
        call    emit_label_dec

        mov     bx, 1
        call    rb
        movzx   ax, al
        mov     si, s_nomagic
        call    emit_label_dec

        mov     bx, 5
        call    rb
        movzx   ax, al
        mov     si, s_rounds
        call    emit_label_dec

        mov     bx, 6
        call    rb
        movzx   ax, al
        mov     si, s_turns
        call    emit_label_dec

        mov     bx, 7
        call    rb
        movzx   ax, al
        mov     si, s_hours
        call    emit_label_dec

        mov     bx, 8
        call    rb
        movzx   ax, al
        mov     si, s_days
        call    emit_label_dec

        mov     bx, 9
        call    rb
        movzx   ax, al
        mov     si, s_months
        call    emit_label_dec

        mov     bx, 10
        call    rb
        movzx   ax, al
        mov     si, s_years
        call    emit_label_dec

        mov     bx, 16
        call    rb
        movzx   ax, al
        mov     si, s_facing
        call    emit_label_dec

        mov     bx, 17
        call    rb
        movzx   ax, al
        mov     si, s_speed
        call    emit_label_dec

        mov     bx, 18
        call    rb
        movzx   ax, al
        mov     si, s_curmod
        call    emit_label_dec

        mov     bx, 21
        call    rb
        movzx   ax, al
        mov     si, s_init
        call    emit_label_dec

        mov     bx, 25
        call    rb
        movzx   ax, al
        mov     si, s_overland
        call    emit_label_dec

        mov     bx, 28
        call    rb
        movzx   ax, al
        mov     si, s_pnd
        call    emit_label_dec

        mov     bx, 29
        call    rb
        movzx   ax, al
        mov     si, s_notr
        call    emit_label_dec

        mov     bx, 30
        call    rb
        movzx   ax, al
        mov     si, s_noxp
        call    emit_label_dec

        mov     bx, 31
        call    rb
        movzx   ax, al
        mov     si, s_psize
        call    emit_label_dec

        mov     bx, 33
        call    rb
        movzx   ax, al
        mov     si, s_dungeon
        call    emit_label_dec

        mov     bx, 36
        call    rb
        movzx   ax, al
        mov     si, s_ocol
        call    emit_label_dec

        mov     bx, 37
        call    rb
        movzx   ax, al
        mov     si, s_orow
        call    emit_label_dec
        ret

; ============================================================================
;  print_wiz: verb W -- raw CHRDATA{n}.WIZ file (220 bytes, PARTIAL decode).
;  Every DoK character has a fixed 220-byte .WIZ record; it is ALL-ZERO for
;  non-casters (confirmed on real Knight-coded CHRDATA records) and holds a
;  run of nonzero bytes ending EXACTLY at offset 73 for casters -- a
;  right-justified, sorted, duplicate-allowing list of currently-memorized
;  spell-slot instances (CONFIRMED via a same-character before/after
;  level-up diff: gaining a level inserts new entries into this list as a
;  multiset union, never reorders or removes existing ones). The exact
;  spell-id encoding and the boolean-flag region past offset 73 are still
;  NOT pinned. This verb prints the honest raw evidence rather than
;  asserting an unconfirmed field model:
;    isCaster     - 1 if ANY byte in the 220-byte record is nonzero
;    knownSpell N / offset / value - each nonzero byte in the fixed 34..73
;                   window (the run present in every real caster sample,
;                   always ending at 73)
;    tailByte N / offset / value - each nonzero byte in 180..219, the wider
;                   window real data actually occupies (the original
;                   "slotsA@188-191 / slotsB@212-215" 4-byte guess was too
;                   narrow -- real samples also populate 180-187, 192-193
;                   and 196-197; one real character subgroup shows an
;                   IDENTICAL 212-219 run across 3 distinct characters at
;                   different apparent levels, suggesting at least part of
;                   this window is class-static data, not personal
;                   progression -- ruled out matching the engine's own
;                   spellSlots() cleric/magic-user tables directly)
;  See docs/engine/research/dok-chrdata-save-format.md for the byte evidence.
; ============================================================================
print_wiz:
        mov     si, s_hdr_wiz
        call    puts

        ; isCaster: any nonzero byte anywhere in the 220-byte record?
        mov     cx, WIZ_REC
        xor     bx, bx
        xor     dx, dx                  ; dx=0 -> not caster unless we find one
.scan:
        call    rb
        or      al, al
        jz      .scannext
        mov     dx, 1
.scannext:
        inc     bx
        loop    .scan
        mov     ax, dx
        mov     si, s_iscaster
        call    emit_label_dec

        ; knownSpell window: offsets 34..73 inclusive, print each nonzero byte
        mov     word [rec_i], 0         ; found-count (the printed index)
        mov     word [rec_off], 34
.kloop:
        cmp     word [rec_off], 74
        jae     .kdone
        mov     bx, [rec_off]
        call    rb
        or      al, al
        jz      .knext
        push    ax
        mov     si, s_spell_hdr
        mov     ax, [rec_i]
        call    emit_label_dec
        mov     ax, [rec_off]
        mov     si, s_spelloff
        call    emit_label_dec
        pop     ax
        movzx   ax, al
        mov     si, s_value
        call    emit_label_dec
        inc     word [rec_i]
.knext:
        inc     word [rec_off]
        jmp     .kloop
.kdone:

        ; tail window: offsets 180..219 inclusive, print each nonzero byte.
        ; Wider than the original 188-191/212-215 4-byte guess -- real
        ; samples populate 180-187, 192-193 and 196-197 too (see header
        ; comment above).
        mov     word [rec_i], 0
        mov     word [rec_off], 180
.tloop:
        cmp     word [rec_off], 220
        jae     .tdone
        mov     bx, [rec_off]
        call    rb
        or      al, al
        jz      .tnext
        push    ax
        mov     si, s_tail_hdr
        mov     ax, [rec_i]
        call    emit_label_dec
        mov     ax, [rec_off]
        mov     si, s_spelloff
        call    emit_label_dec
        pop     ax
        movzx   ax, al
        mov     si, s_value
        call    emit_label_dec
        inc     word [rec_i]
.tnext:
        inc     word [rec_off]
        jmp     .tloop
.tdone:
        ret

; ============================================================================
;  print_dqk_baseitem: parse one 16-byte DQK ITEMS.DAT base-item catalogue
;  record at [rec_off] (raw file, no DAX). Mirrors dqkItem.ts decodeDqkBaseItem.
; ============================================================================
print_dqk_baseitem:
        mov     si, s_hdr_cat
        call    puts

        mov     ax, [xindex]
        mov     si, s_idx
        call    emit_label_dec

        mov     bx, [rec_off]
        call    rb
        mov     [carryloc], al
        movzx   ax, al
        mov     si, s_carryloc
        call    emit_label_dec

        mov     bx, [rec_off]
        inc     bx
        call    rb
        movzx   ax, al
        mov     si, s_hands
        call    emit_label_dec

        ; damage vs Large: count@2 sides@3 bonus@4
        mov     bx, [rec_off]
        add     bx, 2
        call    rb
        movzx   ax, al
        mov     si, s_dlc
        call    emit_label_dec
        mov     bx, [rec_off]
        add     bx, 3
        call    rb
        movzx   ax, al
        mov     si, s_dls
        call    emit_label_dec
        mov     bx, [rec_off]
        add     bx, 4
        call    rb
        movzx   ax, al
        mov     si, s_dlb
        call    emit_label_dec

        ; rateOfFire @5
        mov     bx, [rec_off]
        add     bx, 5
        call    rb
        movzx   ax, al
        mov     si, s_rof
        call    emit_label_dec

        ; protectionValue @6
        mov     bx, [rec_off]
        add     bx, 6
        call    rb
        mov     [protval], al
        movzx   ax, al
        mov     si, s_protval
        call    emit_label_dec

        ; baseArmorClass: carryLocation==2 && protectionValue>=128 ->
        ; 188-protectionValue, else null (printed as hasArmorClass 0 + armorClass 0)
        mov     al, [carryloc]
        cmp     al, 2
        jne     .noarmor
        mov     al, [protval]
        cmp     al, 128
        jb      .noarmor
        mov     ax, 1
        mov     si, s_hasarmor
        call    emit_label_dec
        movzx   ax, byte [protval]
        mov     bx, 188
        sub     bx, ax
        mov     ax, bx
        mov     si, s_armorclass
        call    emit_label_sdec
        jmp     .weaponclass
.noarmor:
        xor     ax, ax
        mov     si, s_hasarmor
        call    emit_label_dec
        xor     ax, ax
        mov     si, s_armorclass
        call    emit_label_dec
.weaponclass:
        ; weaponClass @7
        mov     bx, [rec_off]
        add     bx, 7
        call    rb
        movzx   ax, al
        mov     si, s_wclass
        call    emit_label_dec

        ; meleeUsable: byte8 != 128
        mov     bx, [rec_off]
        add     bx, 8
        call    rb
        cmp     al, 128
        je      .notmelee
        mov     ax, 1
        jmp     .meleedone
.notmelee:
        xor     ax, ax
.meleedone:
        mov     si, s_melee
        call    emit_label_dec

        ; damage vs Small: count@9 sides@10 bonus@11
        mov     bx, [rec_off]
        add     bx, 9
        call    rb
        movzx   ax, al
        mov     si, s_dsc
        call    emit_label_dec
        mov     bx, [rec_off]
        add     bx, 10
        call    rb
        movzx   ax, al
        mov     si, s_dss
        call    emit_label_dec
        mov     bx, [rec_off]
        add     bx, 11
        call    rb
        movzx   ax, al
        mov     si, s_dsb
        call    emit_label_dec

        ; range @12
        mov     bx, [rec_off]
        add     bx, 12
        call    rb
        movzx   ax, al
        mov     si, s_range
        call    emit_label_dec

        ; classMask @13
        mov     bx, [rec_off]
        add     bx, 13
        call    rb
        movzx   ax, al
        mov     si, s_classmask
        call    emit_label_dec

        ; missileType @14
        mov     bx, [rec_off]
        add     bx, 14
        call    rb
        movzx   ax, al
        mov     si, s_missile
        call    emit_label_dec
        ret

; ============================================================================
;  print_dqk_iteminst: parse one 18-byte DQK item.dat per-instance record at
;  [rec_off] (raw file, no DAX). Mirrors dqkItem.ts decodeDqkItemRecord.
; ============================================================================
print_dqk_iteminst:
        mov     si, s_hdr_inst
        call    puts

        mov     ax, [xindex]
        mov     si, s_idx
        call    emit_label_dec

        mov     bx, [rec_off]
        call    rb
        movzx   ax, al
        mov     si, s_base
        call    emit_label_dec

        ; nameCodes: [byte3 (primary), byte2 (adjective), byte1 (qualifier)]
        mov     bx, [rec_off]
        add     bx, 3
        call    rb
        movzx   ax, al
        mov     si, s_nc0
        call    emit_label_dec
        mov     bx, [rec_off]
        add     bx, 2
        call    rb
        movzx   ax, al
        mov     si, s_nc1
        call    emit_label_dec
        mov     bx, [rec_off]
        add     bx, 1
        call    rb
        movzx   ax, al
        mov     si, s_nc2
        call    emit_label_dec

        ; encumbrance u16 @4
        mov     bx, [rec_off]
        add     bx, 4
        call    rw
        mov     si, s_enc
        call    emit_label_dec

        ; value u16 @6
        mov     bx, [rec_off]
        add     bx, 6
        call    rw
        mov     si, s_value
        call    emit_label_dec

        ; magicBonus @8
        mov     bx, [rec_off]
        add     bx, 8
        call    rb
        movzx   ax, al
        mov     si, s_magicb
        call    emit_label_dec

        ; secondaryCode @9
        mov     bx, [rec_off]
        add     bx, 9
        call    rb
        movzx   ax, al
        mov     si, s_seccode
        call    emit_label_dec

        ; ready: byte10 != 0
        mov     bx, [rec_off]
        add     bx, 10
        call    rb
        or      al, al
        jz      .rdy0
        mov     ax, 1
        jmp     .rdydone
.rdy0:
        xor     ax, ax
.rdydone:
        mov     si, s_ready
        call    emit_label_dec

        ; identifyMask @11
        mov     bx, [rec_off]
        add     bx, 11
        call    rb
        movzx   ax, al
        mov     si, s_identmask
        call    emit_label_dec

        ; cursed: byte12 != 0
        mov     bx, [rec_off]
        add     bx, 12
        call    rb
        or      al, al
        jz      .cur0
        mov     ax, 1
        jmp     .curdone
.cur0:
        xor     ax, ax
.curdone:
        mov     si, s_cursed
        call    emit_label_dec

        ; bundleCount @13
        mov     bx, [rec_off]
        add     bx, 13
        call    rb
        movzx   ax, al
        mov     si, s_bundle
        call    emit_label_dec

        ; charges @14
        mov     bx, [rec_off]
        add     bx, 14
        call    rb
        movzx   ax, al
        mov     si, s_charges
        call    emit_label_dec

        ; effectCode @15
        mov     bx, [rec_off]
        add     bx, 15
        call    rb
        movzx   ax, al
        mov     si, s_effcode
        call    emit_label_dec

        ; specialCode @16
        mov     bx, [rec_off]
        add     bx, 16
        call    rb
        movzx   ax, al
        mov     si, s_speccode
        call    emit_label_dec
        ret

; ============================================================================
;  print_blockid: print "blockId(monsterId): <n>" for the currently-selected
;  TOC entry [curidx] (byte 0 of its 9-byte TOC record -- see open_container /
;  select_block). MON{n}SPC.DAX / MON{n}ITM.DAX key each block by the monster's
;  id (COAB load_mob), which is NOT the same as the TOC's positional index, so
;  this is printed for correlation against the TS oracle (map keyed by blockId).
; ============================================================================
print_blockid:
        mov     ax, [curidx]
        mov     bx, ENTRY_SZ
        mul     bx
        mov     si, ax
        add     si, toc
        mov     al, [si]
        movzx   ax, al
        mov     si, s_blockid
        call    emit_label_dec
        ret

; ============================================================================
;  print_mon_spc: MON{n}SPC.DAX block -> flat array of 9-byte affect/special
;  records (no per-record sniffing -- mirrors monsterSideTables.ts
;  decodeMonsterSpcArchive, which decodes every record once the block length
;  is confirmed to be a nonzero exact multiple of MON_AFFECT_REC).
; ============================================================================
print_mon_spc:
        mov     si, s_hdr_spc
        call    puts
        call    print_blockid

.body:
        ; entry point for print_eff (verb E): the header is already printed by
        ; the caller and there is no DAX blockId to print for a raw file.
        mov     ax, [raw_size]
        or      ax, ax
        jz      .notspc
        xor     dx, dx
        mov     bx, MON_AFFECT_REC
        div     bx
        or      dx, dx
        jnz     .notspc
        mov     [rec_total], ax
        mov     word [rec_i], 0
        mov     word [rec_off], 0
.loop:
        mov     ax, [rec_i]
        cmp     ax, [rec_total]
        jae     .done
        call    print_one_affect
        mov     ax, [rec_off]
        add     ax, MON_AFFECT_REC
        mov     [rec_off], ax
        inc     word [rec_i]
        jmp     .loop
.done:
        ret
.notspc:
        mov     si, s_badspc
        jmp     start.die

; print one 9-byte affect record at base offset [rec_off]. Fields mirror
; monsterSideTables.ts decodeMonsterAffect: type@0, minutes u16@1, affectData@3,
; callAffectTable(bool)@4. The trailing 4 scratch bytes (@5..8) are preserved
; verbatim by the engine and not interpreted, so not printed here either.
print_one_affect:
        mov     si, s_aff_hdr
        mov     ax, [rec_i]
        call    emit_label_dec

        mov     bx, [rec_off]
        call    rb
        movzx   ax, al
        mov     si, s_afftype
        call    emit_label_dec

        mov     bx, [rec_off]
        add     bx, 1
        call    rw
        mov     si, s_affmin
        call    emit_label_dec

        mov     bx, [rec_off]
        add     bx, 3
        call    rb
        movzx   ax, al
        mov     si, s_affdata
        call    emit_label_dec

        mov     bx, [rec_off]
        add     bx, 4
        call    rb
        or      al, al
        jz      .call0
        mov     ax, 1
        jmp     .calldone
.call0:
        xor     ax, ax
.calldone:
        mov     si, s_affcall
        call    emit_label_dec
        ret

; ============================================================================
;  print_eff: verb E -- raw CHRDATA{n}.EFF file (one or more 9-byte active-
;  affect records; the file is ABSENT on disk when a character has no active
;  affects, matching COAB SavePlayer's "only write .fx if affects > 0"). Bytes
;  are the SAME 9-byte layout as MON*SPC.DAX (verb S / print_one_affect):
;  type@0, minutes u16@1, affectData@3, callAffectTable(bool)@4, 4 scratch
;  bytes @5..8. Confirmed on real CHRDATA{2,3,5}.EFF: minutes==0 and
;  affectData==0xff in every sample (permanent, item-granted effects with no
;  timer), and the scratch bytes show the same incrementing stale-pointer
;  pattern seen elsewhere in this format family (see the doc). Reuses
;  print_mon_spc's record loop, skipping the DAX-only blockId line.
; ============================================================================
print_eff:
        mov     si, s_hdr_eff
        call    puts
        jmp     print_mon_spc.body

; ============================================================================
;  print_mon_wiz: MON{n}WIZ.DAX block -> one 220-byte monster spellbook record.
;  Mirrors monsterSideTables.ts decodeMonsterWizRecord exactly for the monster-
;  useful region: offsets 0..73 are a flat memorized-spell-instance list. Each
;  nonzero byte is a DoK global spell id, with the high bit split to a learning
;  flag by analogy with COAB SpellList (never observed set in real MON1WIZ).
;  The player-save-only 74..219 regions are deliberately not decoded here.
; ============================================================================
print_mon_wiz:
        mov     si, s_hdr_mwiz
        call    puts
        call    print_blockid

        mov     word [rec_i], 0
        mov     word [rec_off], 0
.loop:
        cmp     word [rec_off], MON_WIZ_LIST
        jae     .done
        mov     bx, [rec_off]
        call    rb
        or      al, al
        jz      .next
        push    ax
        mov     si, s_mwiz_slot_hdr
        mov     ax, [rec_i]
        call    emit_label_dec
        mov     ax, [rec_off]
        mov     si, s_spelloff
        call    emit_label_dec
        pop     ax
        push    ax
        and     al, 7Fh
        movzx   ax, al
        mov     si, s_spellid
        call    emit_label_dec
        pop     ax
        test    al, 80h
        jz      .learn0
        mov     ax, 1
        jmp     .learndone
.learn0:
        xor     ax, ax
.learndone:
        mov     si, s_learning
        call    emit_label_dec
        inc     word [rec_i]
.next:
        inc     word [rec_off]
        jmp     .loop
.done:
        ret

; ============================================================================
;  print_mon_itm: MON{n}ITM.DAX block -> flat array of 63-byte carried-item
;  records (no per-record sniffing -- mirrors monsterSideTables.ts
;  decodeMonsterItmArchive). Reuses ITEM_REC (=63): COAB confirms this is the
;  SAME Item.StructSize record the CoK ITEM{n}.DAX archives use ('I' verb), but
;  the leading name region is editor/runtime scratch here, so (unlike 'I') only
;  the identity/stat fields at 0x2e.. are read -- see ITEM_FIELD in
;  monsterSideTables.ts.
; ============================================================================
print_mon_itm:
        mov     si, s_hdr_itm
        call    puts
        call    print_blockid

        mov     ax, [raw_size]
        or      ax, ax
        jz      .notitm
        xor     dx, dx
        mov     bx, ITEM_REC
        div     bx
        or      dx, dx
        jnz     .notitm
        mov     [rec_total], ax
        mov     word [rec_i], 0
        mov     word [rec_off], 0
.loop:
        mov     ax, [rec_i]
        cmp     ax, [rec_total]
        jae     .done
        call    print_one_monitem
        mov     ax, [rec_off]
        add     ax, ITEM_REC
        mov     [rec_off], ax
        inc     word [rec_i]
        jmp     .loop
.done:
        ret
.notitm:
        mov     si, s_baditm
        jmp     start.die

; print one 63-byte monster carried-item record at base offset [rec_off].
; Offsets mirror monsterSideTables.ts ITEM_FIELD exactly.
print_one_monitem:
        mov     si, s_item_hdr
        mov     ax, [rec_i]
        call    emit_label_dec

        ; baseTypeId @0x2e
        mov     bx, [rec_off]
        add     bx, 0x2e
        call    rb
        movzx   ax, al
        mov     si, s_base
        call    emit_label_dec

        ; nameCodes [namenum1@0x2f, namenum2@0x30, namenum3@0x31] (in order)
        mov     bx, [rec_off]
        add     bx, 0x2f
        call    rb
        movzx   ax, al
        mov     si, s_nc0
        call    emit_label_dec

        mov     bx, [rec_off]
        add     bx, 0x30
        call    rb
        movzx   ax, al
        mov     si, s_nc1
        call    emit_label_dec

        mov     bx, [rec_off]
        add     bx, 0x31
        call    rb
        movzx   ax, al
        mov     si, s_nc2
        call    emit_label_dec

        ; plus (signed) @0x32
        mov     bx, [rec_off]
        add     bx, 0x32
        call    rb
        cbw
        mov     si, s_plus
        call    emit_label_sdec

        ; plusSave @0x33
        mov     bx, [rec_off]
        add     bx, 0x33
        call    rb
        movzx   ax, al
        mov     si, s_plussave
        call    emit_label_dec

        ; readied(bool) @0x34
        mov     bx, [rec_off]
        add     bx, 0x34
        call    rb
        or      al, al
        jz      .rdy0
        mov     ax, 1
        jmp     .rdydone
.rdy0:
        xor     ax, ax
.rdydone:
        mov     si, s_ready
        call    emit_label_dec

        ; hiddenNamesFlag @0x35 -- raw byte (NOT coerced to bool: unlike readied@0x34,
        ; the TS oracle (monsterSideTables.ts ITEM_FIELD) only pins this as a byte
        ; offset, not a boolean -- verified nonzero-but-not-1 on real DoK data,
        ; e.g. Death Knights MON1ITM.DAX blockId 50 records have raw[0x35]=4)
        mov     bx, [rec_off]
        add     bx, 0x35
        call    rb
        movzx   ax, al
        mov     si, s_hidden
        call    emit_label_dec

        ; cursed @0x36 -- raw byte, same reasoning as hiddenNamesFlag above
        mov     bx, [rec_off]
        add     bx, 0x36
        call    rb
        movzx   ax, al
        mov     si, s_cursed
        call    emit_label_dec

        ; weight u16 @0x37
        mov     bx, [rec_off]
        add     bx, 0x37
        call    rw
        mov     si, s_mweight
        call    emit_label_dec

        ; count @0x39
        mov     bx, [rec_off]
        add     bx, 0x39
        call    rb
        movzx   ax, al
        mov     si, s_count
        call    emit_label_dec

        ; value u16 @0x3a
        mov     bx, [rec_off]
        add     bx, 0x3a
        call    rw
        mov     si, s_value
        call    emit_label_dec

        ; affect1/2/3 @0x3c/0x3d/0x3e
        mov     bx, [rec_off]
        add     bx, 0x3c
        call    rb
        movzx   ax, al
        mov     si, s_affect1
        call    emit_label_dec

        mov     bx, [rec_off]
        add     bx, 0x3d
        call    rb
        movzx   ax, al
        mov     si, s_affect2
        call    emit_label_dec

        mov     bx, [rec_off]
        add     bx, 0x3e
        call    rb
        movzx   ax, al
        mov     si, s_affect3
        call    emit_label_dec
        ret

; ============================================================================
;  Buffered file input (as in CCGBC).
; ============================================================================
seek0:
        mov     bx, [fh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        mov     word [iolen], 0
        mov     word [iopos], 0
        ret

seek_set:
        mov     cx, dx
        mov     dx, ax
        mov     bx, [fh]
        mov     ax, 4200h
        int     21h
        mov     word [iolen], 0
        mov     word [iopos], 0
        ret

iorefill:
        mov     ah, 3Fh
        mov     bx, [fh]
        mov     cx, IOBUF_SZ
        mov     dx, iobuf
        int     21h
        mov     [iolen], ax
        mov     word [iopos], 0
        ret

getb:
        push    bx
        push    cx
        push    dx
.again:
        mov     bx, [iopos]
        cmp     bx, [iolen]
        jb      .have
        call    iorefill
        cmp     word [iolen], 0
        je      .eof
        jmp     .again
.have:
        mov     al, [iobuf+bx]
        inc     word [iopos]
        clc
        jmp     .done
.eof:
        xor     al, al
        stc
.done:
        pop     dx
        pop     cx
        pop     bx
        ret

getw:
        call    getb
        mov     ah, al
        call    getb
        xchg    al, ah
        ret

puts:
        mov     di, si
.l:
        cmp     byte [di], 0
        je      .w
        inc     di
        jmp     .l
.w:
        mov     cx, di
        sub     cx, si
        mov     ah, 40h
        mov     bx, 1
        mov     dx, si
        int     21h
        ret

; ============================================================================
;  parse_args:  <verb> <container/file> [<index>]
; ============================================================================
parse_args:
        ; remember our data segment for stosb (ES) targets
        mov     ax, cs
        mov     [our_seg], ax
        ; terminate command tail at CR
        mov     si, 81h
.term:
        mov     al, [si]
        or      al, al
        jz      .t0
        cmp     al, 0Dh
        je      .t0
        inc     si
        jmp     .term
.t0:
        mov     byte [si], 0
        mov     si, 81h
        ; verb
        mov     di, vbuf
        call    read_token
        mov     al, [vbuf]
        and     al, 0DFh                ; upcase
        mov     [verb], al
        ; container / file
        mov     di, cbuf
        call    read_token
        ; index (M and I only; harmless to read for C)
        mov     di, nbuf
        call    read_token
        mov     si, nbuf
        call    atoi
        mov     [xindex], ax
        ret

; read_token: skip spaces at [si], copy non-space to [di], NUL-term.
read_token:
.sp:
        cmp     byte [si], ' '
        jne     .cp
        inc     si
        jmp     .sp
.cp:
        mov     al, [si]
        or      al, al
        jz      .d
        cmp     al, ' '
        je      .d
        mov     [di], al
        inc     si
        inc     di
        jmp     .cp
.d:
        mov     byte [di], 0
        ret

; atoi: ds:si decimal -> ax
atoi:
        xor     bx, bx
.l:
        mov     al, [si]
        cmp     al, '0'
        jb      .d
        cmp     al, '9'
        ja      .d
        sub     al, '0'
        movzx   ax, al
        push    ax
        mov     ax, bx
        mov     cx, 10
        mul     cx
        mov     bx, ax
        pop     ax
        add     bx, ax
        inc     si
        jmp     .l
.d:
        mov     ax, bx
        ret

; ============================================================================
;  Monster layout tables. Field order/values copied from monster.ts.
;  A layout is 9 words: ability, category, thac0, ac, dcount, dsides, dbonus,
;  icon, morale (each = the byte offset within the record).
; ============================================================================
L_ABILITY   equ 0
L_CATEGORY  equ 2
L_THAC0     equ 4
L_AC        equ 6
L_DCOUNT    equ 8
L_DSIDES    equ 10
L_DBONUS    equ 12
L_ICON      equ 14
L_MORALE    equ 16

cok_layout:
        dw 16        ; ability
        dw 90        ; category
        dw 89        ; thac0
        dw 275       ; ac
        dw 269       ; dmg count
        dw 271       ; dmg sides
        dw 270       ; dmg bonus
        dw 207       ; icon size
        dw 231       ; morale

coab_layout:
        dw 16        ; ability
        dw 0         ; category derived from race/monsterType
        dw 199h      ; hitBonus -> thac0
        dw 19Ah      ; ac
        dw 19Eh      ; dmg count
        dw 1A0h      ; dmg sides
        dw 1A2h      ; signed dmg bonus
        dw 0         ; icon size not located for this decoder
        dw 0F7h      ; morale

dok_layout:
        dw 16        ; ability
        dw 32        ; category
        dw 31        ; thac0
        dw 95        ; ac
        dw 89        ; dmg count
        dw 91        ; dmg sides
        dw 90        ; dmg bonus
        dw 41        ; icon size
        dw 62        ; morale

; ============================================================================
;  Strings.
; ============================================================================
s_usage     db 'Usage: CCDAT M|C|I|J|Q|T|N|S|K|Z|G|V|W|E <file> [index]',0Dh,0Ah
            db '  M <dax> <i>  monster        C <sav>    character   I <dax> <i>  CoK items',0Dh,0Ah
            db '  J <dax> <i>  DoK items      Q <qsv>    DQK save    T <dat> <i>  DQK ITEMS.DAT',0Dh,0Ah
            db '  N <dat> <i>  DQK item.dat   S <dax> <i> mon special/affect (SPC)',0Dh,0Ah
            db '  K <dax> <i> mon carried-item (ITM)  Z <dax> <i> mon spellbook (WIZ)',0Dh,0Ah
            db '  G <gam>     DoK CHRDATAn.GAM (216B char)  V <jnk> DoK CHRDATAn.JNK (inventory)',0Dh,0Ah
            db '  W <wiz>     DoK CHRDATAn.WIZ (spell, PARTIAL)  E <eff> DoK CHRDATAn.EFF (affects)',0Dh,0Ah,0
s_noopen    db 'CCDAT: cannot open file',0Dh,0Ah,0
s_badfmt    db 'CCDAT: not a DAX container',0Dh,0Ah,0
s_badidx    db 'CCDAT: block index out of range',0Dh,0Ah,0
s_badsav    db 'CCDAT: .SAV is not a 409-byte record',0Dh,0Ah,0
s_badmon    db 'CCDAT: block is not a 409/422/216-byte monster record',0Dh,0Ah,0
s_baditem   db 'CCDAT: block is not a 63-byte item block',0Dh,0Ah,0
s_baddokitem db 'CCDAT: block is not a 17-byte DoK item block',0Dh,0Ah,0
s_badqsv    db 'CCDAT: file too small for a DQK save header',0Dh,0Ah,0
s_badridx   db 'CCDAT: record index out of range for file',0Dh,0Ah,0
s_badspc    db 'CCDAT: block is not a nonzero multiple of 9-byte affect records',0Dh,0Ah,0
s_baditm    db 'CCDAT: block is not a nonzero multiple of 63-byte item records',0Dh,0Ah,0
s_badgam    db 'CCDAT: .GAM is not a 216-byte record',0Dh,0Ah,0
s_badjnk    db 'CCDAT: .JNK is not a nonzero multiple of 63-byte records',0Dh,0Ah,0
s_badwiz    db 'CCDAT: .WIZ is not a 220-byte record',0Dh,0Ah,0
s_badmwiz   db 'CCDAT: MON*WIZ block is not a 220-byte record',0Dh,0Ah,0

s_hdr_char     db '== CHARACTER (CoK 409-byte .CCH) ==',0Dh,0Ah,0
s_hdr_mon_cok  db '== MONSTER (CoK 409-byte) ==',0Dh,0Ah,0
s_hdr_mon_coab db '== MONSTER (CoAB 422-byte) ==',0Dh,0Ah,0
s_hdr_mon_dok  db '== MONSTER (DoK 216-byte) ==',0Dh,0Ah,0
s_hdr_qsv      db '== DQK SAVE HEADER (SAVGAMA.QSV) ==',0Dh,0Ah,0
s_hdr_cat      db '== DQK BASE ITEM (ITEMS.DAT) ==',0Dh,0Ah,0
s_hdr_inst     db '== DQK ITEM INSTANCE (item.dat) ==',0Dh,0Ah,0
s_hdr_spc      db '== MONSTER SPECIAL/AFFECT TABLE (MON*SPC.DAX) ==',0Dh,0Ah,0
s_hdr_itm      db '== MONSTER CARRIED-ITEM TABLE (MON*ITM.DAX) ==',0Dh,0Ah,0
s_hdr_mwiz     db '== MONSTER SPELLBOOK TABLE (MON*WIZ.DAX) ==',0Dh,0Ah,0
s_hdr_gam      db '== DoK CHARACTER (CHRDATAn.GAM, 216-byte) ==',0Dh,0Ah,0
s_hdr_jnk      db '== DoK INVENTORY (CHRDATAn.JNK) ==',0Dh,0Ah,0
s_hdr_wiz      db '== DoK SPELL RECORD (CHRDATAn.WIZ, PARTIAL) ==',0Dh,0Ah,0
s_hdr_eff      db '== DoK ACTIVE AFFECTS (CHRDATAn.EFF) ==',0Dh,0Ah,0
s_item_hdr     db '-- item index: ',0
s_aff_hdr      db '-- affect index: ',0
s_blockid      db 'blockId(monsterId): ',0
s_scratch42    db 'scratch42(notAField): ',0
s_iscaster     db 'isCaster: ',0
s_spell_hdr    db '-- knownSpell index: ',0
s_mwiz_slot_hdr db '-- memorizedSpell index: ',0
s_spelloff     db 'offset: ',0
s_spellid      db 'spellId: ',0
s_learning     db 'learning: ',0
s_tail_hdr     db '-- tailByte index: ',0

s_name      db 'name: ',0
s_str       db 'str: ',0
s_int       db 'int: ',0
s_wis       db 'wis: ',0
s_dex       db 'dex: ',0
s_con       db 'con: ',0
s_cha       db 'cha: ',0
s_thac0     db 'thac0: ',0
s_ac        db 'ac: ',0
s_class     db 'classCode: ',0
s_cat       db 'category: ',0
s_hp        db 'hp: ',0
s_hd        db 'hitDice: ',0
s_halfatt   db 'halfAttacks: ',0
s_dcount    db 'dmgCount: ',0
s_dsides    db 'dmgSides: ',0
s_dbonus    db 'dmgBonus: ',0
s_iconb     db 'iconByte: ',0
s_iconsz    db 'combatSize: ',0
s_moralb    db 'moraleByte: ',0
s_morale    db 'morale%: ',0
s_sv1       db 'save_ppd: ',0
s_sv2       db 'save_pp: ',0
s_sv3       db 'save_rsw: ',0
s_sv4       db 'save_breath: ',0
s_sv5       db 'save_spell: ',0
s_xp        db 'xp: ',0
s_base      db 'baseTypeId: ',0
s_count     db 'count: ',0

; -- DQK save (Q) field labels --------------------------------------------
s_bytelen   db 'byteLength: ',0
s_nomagic   db 'noMagic: ',0
s_rounds    db 'rounds: ',0
s_turns     db 'turns: ',0
s_hours     db 'hours: ',0
s_days      db 'days: ',0
s_months    db 'months: ',0
s_years     db 'years: ',0
s_facing    db 'facing: ',0
s_speed     db 'speed: ',0
s_curmod    db 'currentModule: ',0
s_init      db 'eclMemberId: ',0
s_overland  db 'overland: ',0
s_pnd       db 'partyNeverDies: ',0
s_notr      db 'noTreasure: ',0
s_noxp      db 'noXpForCombat: ',0
s_psize     db 'partySize: ',0
s_dungeon   db 'dungeon: ',0
s_ocol      db 'overlandCol: ',0
s_orow      db 'overlandRow: ',0

; -- DQK item catalogue (T) field labels ------------------------------------
s_idx        db 'index: ',0
s_carryloc   db 'carryLocation: ',0
s_hands      db 'handsRequired: ',0
s_dlc        db 'dmgLargeCount: ',0
s_dls        db 'dmgLargeSides: ',0
s_dlb        db 'dmgLargeBonus: ',0
s_rof        db 'rateOfFire: ',0
s_protval    db 'protectionValue: ',0
s_hasarmor   db 'hasArmorClass: ',0
s_armorclass db 'armorClass: ',0
s_wclass     db 'weaponClass: ',0
s_melee      db 'meleeUsable: ',0
s_dsc        db 'dmgSmallCount: ',0
s_dss        db 'dmgSmallSides: ',0
s_dsb        db 'dmgSmallBonus: ',0
s_range      db 'range: ',0
s_classmask  db 'classMask: ',0
s_missile    db 'missileType: ',0

; -- DoK item (J) / DQK item instance (N) shared field labels ---------------
s_nc0        db 'nameCode0: ',0    ; primary noun (byte3)
s_nc1        db 'nameCode1: ',0    ; adjective (byte2)
s_nc2        db 'nameCode2: ',0    ; qualifier (byte1)
s_enc        db 'encumbrance: ',0
s_value      db 'value: ',0
s_magicb     db 'magicBonus: ',0
s_seccode    db 'secondaryCode: ',0
s_ready      db 'ready: ',0
s_identmask  db 'identifyMask: ',0
s_ident      db 'identified: ',0
s_cursed     db 'cursed: ',0
s_bundle     db 'bundleCount: ',0
s_charges    db 'charges: ',0
s_effcode    db 'effectCode: ',0
s_speccode   db 'specialCode: ',0

; -- monster affect (S) field labels ----------------------------------------
s_afftype   db 'type: ',0
s_affmin    db 'minutes: ',0
s_affdata   db 'affectData: ',0
s_affcall   db 'callAffectTable: ',0

; -- monster carried-item (K) field labels (not already covered above) -----
s_plus      db 'plus: ',0
s_plussave  db 'plusSave: ',0
s_hidden    db 'hiddenNamesFlag: ',0
s_mweight   db 'weight: ',0
s_affect1   db 'affect1: ',0
s_affect2   db 'affect2: ',0
s_affect3   db 'affect3: ',0

IOBUF_SZ    equ 4096
TOC_MAX     equ 9*600

; ============================================================================
section .bss
alignb 2
verb        resb 1
vbuf        resb 8
nbuf        resb 8
cbuf        resb 128
linebuf     resb 96
our_seg     resw 1
fh          resw 1
raw_seg     resw 1
toc_bytes   resw 1
entcount    resw 1
data_base   resw 1
curidx      resw 1
xindex      resw 1
raw_size    resw 1
rle_limit   resw 1
iopos       resw 1
iolen       resw 1
layout_ptr  resw 1
abil_base   resw 1
save_off    resw 1
rec_total   resw 1
rec_i       resw 1
rec_off     resw 1
carryloc    resb 1
protval     resb 1
alignb 2
toc         resb TOC_MAX
iobuf       resb IOBUF_SZ
stackspace  resb 1024
stacktop:
