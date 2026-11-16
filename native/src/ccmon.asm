; ============================================================================
;  CCMON.COM  --  DQK "MONCHA.GLB" monster-record decoder (decompress + field
;  parse), sibling to CCHLIB (which only exposes MONCHA.GLB as opaque
;  STILL-COMPRESSED "Dnnnn.HTD" chunks -- nobody decompresses/field-parses it).
;
;  Oracle (authoritative, do not re-derive): packages/engine/src/loaders/moncha.ts
;  and packages/engine/src/util/rle.ts (monchaRLE). Every offset/algorithm below
;  is copied from there.
;
;  Container shape (same HLIB "DATA" library family as ECL.GLB/GEO.GLB, per
;  cchlib.asm's own DATA-library note): magic=1, member[0] = id table (unused
;  here), members[1..N] = individual creature records, each **monchaRLE**-
;  compressed. Member index below is 1-based, matching moncha.ts's memberIndex.
;
;  monchaRLE (hackdocs MONSTDAT.TXT; NOTE the +1 vs the DAX/DAA signed-byte RLE
;  cchlib/CCGBC use -- boundary and repeat count are each one higher):
;     read control byte c:
;       c <= 0x80 (<=128) : copy the next (c+1) bytes literally
;       c >  0x80 (>=129) : repeat the next single byte (257-c) times
;
;  Member framing (fidelity-plan §29, 2026-08-21): each member begins with a
;  **2-byte BIG-ENDIAN uncompressed length**; the monchaRLE stream starts at
;  byte 2 and expands to exactly that many bytes (98 of 98 shipped members).
;  This is not an inference -- DQK's own loader reads the word at file 0x3570C
;  and passes it to its decompressor at canonical 00d7:0a1c as the bounded
;  expected output size. CCMON previously decompressed from byte 0, faithfully
;  mirroring the same bug in its moncha.ts oracle, which consumed the length
;  word as two RLE control bytes and left every record out of phase by a
;  record-dependent amount.
;
;  Decompressed record layout (offsets are past the length word; every field is
;  at a FIXED offset in all 98 shipped members -- nothing is searched for):
;     054h     u16  experience-point award (little-endian)
;     058h     u8   race: 7 = plain monster, 6 = humanoid, 5 = kender
;     066h     u8   is-monster flag: 1 = bestiary half, 0 = character/NPC half
;     068h     ascii name, NUL-padded, 16-byte field
;     078h     6 ability scores, 2 bytes each (current,max); monsters default 10
;     +15      u8   THAC0, stored inverted: to-hit-AC0 = 60 - byte
;     +19..23  u8x5 saving throws (paralyze/poison/death, petrify, rod, breath, spell)
;     +25      u8   hit-dice count
;     +61      u8   damage: number of dice
;     +63      u8   damage: die size
;     +65      u8   damage: flat bonus, SIGNED byte
;     +67      u8   armour class, stored inverted: AC = 60 - byte
;     19Eh     u8   count of 5-byte tail entries
;     19Fh     u8   count of 17-byte tail entries
;     1A0h          end of the fixed part; the two tail arrays follow, whole
;                   record padded to an even length
;  hitPoints (not stored on disk) is reported as the average HD roll,
;  round(HD*4.5) i.e. (HD*9+1)>>1, floored at HD -- matches moncha.ts's
;  avgHpForHd exactly for all integer HD.
;
;  WITHDRAWN by §29 -- this header used to document a "record type tag at
;  offset 2 (8 = monster)", a name field at 24 and an ability block at 40, plus
;  a SCOPE note listing six reconstruction strategies (inline-RLE re-expansion,
;  a dec-path retry, an ability-block scan, a compact/short-tail layout for
;  HYDRA, a canon-AC injection for UMBERHULK, and a name-list of "type-8 NPCs"
;  THENOL FNATIC / PRINCE ALHOOK). All six were compensating for the phase
;  error, and all six are gone: see decode_extended. Offset 2 was inside the
;  length word, so there was never a type byte at all; THENOL FANATIC and
;  PRINCE TALHOOK were mis-read names and both decode normally now, and UMBER
;  HULK's AC (2) is on the disk after all, so CCMON no longer injects it.
;
;  Names now read at the fixed 068h. The offset-independent scan
;  (scan_monster_name) is retained for the no-clean-record display path only.
;  Under the old phase the scan was the ONLY way to get a name, and it still
;  got them subtly wrong: SAUAGIN, IRON OLEM, SKEL WARROR, TASLEHOFF, UVWW.
;  are SAHUAGIN, IRON GOLEM, SKEL WARRIOR, TASSLEHOFF and LICH.
;
;  BUGS FOUND + FIXED in build_recon (both the same class -- a plain,
;  non-cs:-prefixed read of a cs-resident global performed WHILE ds had
;  already been switched to dec_seg's segment for the verbatim header/name
;  copy, so the read silently pulled 2 garbage bytes out of the CURRENT
;  record's own decompressed data instead of the intended variable):
;    1. `mov cx,[recon_end]` (should be `[cs:recon_end]`) -- corrupted the
;       verbatim-copy length. Data-dependent; MONCHA member 80 (BALDRIC)
;       decoded fine standalone but broke when reached via "L" list mode,
;       since the two builds placed recon_end at different cs offsets.
;    2. `mov ax,[recon_seg]` (should be `[cs:recon_seg]`) -- corrupted the ES
;       destination segment for the header/name `rep movsb`, so the copy
;       silently wrote to a garbage segment while the buffer's real head
;       stayed zeroed and the later RLE-decoded tail (written via
;       g_dst_seg, read with ds==cs) landed correctly -- producing a
;       spliced buffer with a zeroed head that hung find_ability_block_g
;       scanning it. Verified case: MONCHA member 3 (WHISPER SPIDER).
;  Both are now cs:-prefixed. See build_recon below for the full inline note.
;
;  Usage:
;    CCMON L <file.glb>            list every record: "<decLen> Mnnnn.MON <0|1> <name>"
;                                   (0|1 = whether fixed-offset stats decoded)
;    CCMON <file.glb> <i>          view record i's fields (i = 1-based member index;
;                                   member 0 is the id table, not a record)
;    CCMON X <file.glb> <i> <dir>  extract record i's DECOMPRESSED bytes (byte-exact
;                                   monchaRLE output) to dir\Mnnnn.MON
;
;  House style matches cchlib.asm (HLIB header/ptrs, PTRCAP-clamped pointer
;  table, member_span, seek32/read_here, cat_si/put_dec32/put_dec16_4,
;  parse_args) and ccdat.asm (rb/rw record-field readers, emit_label_dec/
;  emit_label_sdec labelled-field text dump, print_abilities/print_saves).
;
;  Build:  native\build.ps1 -Target ccmon   (nasm -f bin -> build\ccmon.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

COMP_SEG_OFF  equ 1000h          ; cs+1000h : compressed member bytes (<=COMPCAP)
DEC_SEG_OFF   equ 2000h          ; cs+2000h : decompressed record bytes (<=DECCAP)
RECON_SEG_OFF equ 3000h          ; cs+3000h : reconstructed record bytes (<=RECONCAP)
COMPCAP       equ 2048
DECCAP        equ 2048
RECONCAP      equ 2048
PTRCAP        equ 256            ; capacity of the ptrs pointer buffer

; ---------------------------------------------------------------------------
;  Record layout (fidelity-plan §29). Offsets are into the DECOMPRESSED record,
;  i.e. past MEMBER_HDR. Every one is fixed in all 98 shipped members; nothing
;  below is searched for.
; ---------------------------------------------------------------------------
MEMBER_HDR    equ 2                ; u16be uncompressed length, then the RLE stream
L_XP          equ 054h             ; u16 LE experience award
L_RACE        equ 058h             ; 7 = plain monster, 6 = humanoid, 5 = kender
L_ISMON       equ 066h             ; 1 = bestiary record, 0 = character/NPC record
L_NAME        equ 068h             ; 16-byte NUL-padded name
L_ABIL        equ 078h             ; 12-byte ability block; stats at L_ABIL+delta
L_AFFECTC     equ 19Eh             ; count of 5-byte special-ability (affect) records, not spells
L_ITEMC       equ 19Fh             ; count of 17-byte tail entries
L_FIXED       equ 1A0h             ; end of the fixed part; the tail arrays follow

start:
        mov     ax, cs
        add     ax, COMP_SEG_OFF
        mov     [comp_seg], ax
        mov     ax, cs
        add     ax, DEC_SEG_OFF
        mov     [dec_seg], ax
        mov     ax, cs
        add     ax, RECON_SEG_OFF
        mov     [recon_seg], ax

        call    parse_args
        cmp     byte [fname], 0
        je      .usage

        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .noopen
        mov     [fh], ax

        call    read_container_header
        jc      .badhdr

        ; Reject image (TILE/HLIB) containers -- CCMON is DATA-library only.
        mov     ax, [tag]
        cmp     ax, 'TI'
        je      .notdata
        cmp     ax, 'HL'
        je      .notdata

        cmp     byte [verb], 'L'
        je      .do_list
        cmp     byte [verb], 'X'
        je      .do_extract

        ; ---- bare form: view record [blkidx] ----
        mov     ax, [blkidx]
        call    load_record
        jc      .badidx
        call    sniff_dqk_monster
        jc      .try_ext
        call    print_clean_record
        jmp     .done
.try_ext:
        ; Fixed-offset sniff failed -- try the extended reconstruction chain
        ; (recon / dec-path / compact / canon-AC / character-NPC framing; see
        ; decode_extended below). It always runs scan_monster_name internally
        ; first (so scan_off/scan_len are valid for print_noclean_record even
        ; when nothing decodes), mirroring moncha.ts's decodeFullStatMonster +
        ; decodeMonchaGlb's NPC fallback exactly.
        call    decode_extended
        cmp     byte [ext_ok], 1
        jne     .noclean
        cmp     byte [ext_cat], 0
        jne     .isnpc
        call    print_generic_monster
        jmp     .done
.isnpc:
        call    print_npc_record
        jmp     .done
.noclean:
        call    print_noclean_record
        jmp     .done

.do_list:
        call    list_records
        jmp     .done

.do_extract:
        mov     ax, [blkidx]
        call    load_record
        jc      .badidx
        call    write_record_file
        jmp     .done

.done:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        mov     ax, 4C00h
        int     21h

.usage:
        mov     dx, s_usage
        jmp     .die
.noopen:
        mov     dx, s_noopen
        jmp     .die
.badhdr:
        mov     dx, s_badhdr
        jmp     .closedie
.notdata:
        mov     dx, s_notdata
        jmp     .closedie
.badidx:
        cmp     byte [is_id0], 1
        je      .isid0
        mov     dx, s_oor
        jmp     .closedie
.isid0:
        mov     dx, s_isid0
        jmp     .closedie
.closedie:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
.die:
        mov     ah, 9
        int     21h
        mov     ax, 4C01h
        int     21h

; ============================================================================
;  Container header: read "HLIB", stored pointer count, tag, pointer list.
;  Flat DATA-library shape only (no leaf/master image walk -- MONCHA.GLB's
;  members are flat positional spans, per cchlib.asm's own DATA-library note:
;  member i = [ptrs[i], ptrs[i+1]) for i in 0..ptrcount-2, no magic/palette
;  skip). CF=1 on a bad signature.
; ============================================================================
read_container_header:
        xor     cx, cx
        xor     dx, dx
        call    seek32
        mov     dx, fhdr
        mov     cx, 16
        call    read_here
        cmp     word [fhdr], 'HL'
        jne     .bad
        cmp     word [fhdr+2], 'IB'
        jne     .bad
        mov     ax, [fhdr+8]        ; stored count-1
        inc     ax
        cmp     ax, PTRCAP
        jbe     .pcok
        mov     ax, PTRCAP
.pcok:
        mov     [ptrcount], ax
        mov     ax, [fhdr+12]       ; tag@12, first 2 chars suffice (TI/HL/DA/DI differ)
        mov     [tag], ax
        xor     cx, cx
        mov     dx, 16
        call    seek32
        mov     ax, [ptrcount]
        shl     ax, 2
        mov     cx, ax
        mov     dx, ptrs
        call    read_here
        clc
        ret
.bad:
        stc
        ret

; ============================================================================
;  member_span : ax=index -> [mem_start,mem_end) (DWORDs). CF=1 if oor.
;  (member count = ptrcount-1; valid index range 0..ptrcount-2)
; ============================================================================
member_span:
        mov     cx, [ptrcount]
        dec     cx
        cmp     ax, cx
        jae     .oor
        mov     bx, ax
        shl     bx, 2
        mov     ax, [ptrs+bx]
        mov     dx, [ptrs+bx+2]
        mov     [mem_start], ax
        mov     [mem_start+2], dx
        mov     ax, [ptrs+bx+4]
        mov     dx, [ptrs+bx+6]
        mov     [mem_end], ax
        mov     [mem_end+2], dx
        clc
        ret
.oor:
        stc
        ret

; ============================================================================
;  load_record : ax=index (1-based; 0 = id table, rejected).
;  On success (CF=0): comp_seg/dec_seg populated, [comp_len]/[dec_len] set.
;  CF=1 + [is_id0]=1 if index==0; CF=1 + [is_id0]=0 if out of range.
; ============================================================================
load_record:
        mov     byte [is_id0], 0
        or      ax, ax
        jnz     .go
        mov     byte [is_id0], 1
        stc
        ret
.go:
        call    member_span
        jc      .oor
        call    read_member_clamped
        call    decompress_moncha
        clc
        ret
.oor:
        stc
        ret

; read [mem_start,mem_end) into comp_seg, clamped to COMPCAP. Sets [comp_len].
read_member_clamped:
        mov     ax, [mem_end]
        sub     ax, [mem_start]
        cmp     ax, COMPCAP
        jbe     .ok
        mov     ax, COMPCAP
.ok:
        mov     [comp_len], ax
        mov     cx, [mem_start+2]
        mov     dx, [mem_start]
        call    seek32
        push    ds
        mov     ds, [cs:comp_seg]
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, [cs:comp_len]
        xor     dx, dx
        int     21h
        pop     ds
        ret

; ============================================================================
;  decompress_moncha : monchaRLE-decode comp_seg[0..comp_len) -> dec_seg,
;  clamped to DECCAP (generous safety cap; real MONCHA.GLB records top out at
;  ~530 decompressed bytes). Sets [dec_len].
; ============================================================================
decompress_moncha:
        ; §29: the member's first two bytes are a BIG-ENDIAN uncompressed length that DQK's
        ; own loader reads (file 0x3570C) and hands to its decompressor as the expected
        ; output size. Record it, then start the RLE stream at byte MEMBER_HDR. Decoding
        ; from byte 0 -- what CCMON did until now, faithfully mirroring the same bug in
        ; moncha.ts -- eats the length word as two control bytes and leaves every record
        ; out of phase by a record-dependent amount.
        mov     word [decl_len], 0
        mov     ax, [comp_len]
        cmp     ax, MEMBER_HDR
        jb      .nohdr
        mov     word [srci], 0
        call    compb                   ; al = member[0]
        mov     ah, al
        mov     word [srci], 1
        call    compb                   ; al = member[1]
        mov     [decl_len], ax          ; ah:al = big-endian u16
.nohdr:
        mov     word [srci], MEMBER_HDR
        mov     word [dsti], 0
.loop:
        mov     ax, [srci]
        cmp     ax, [comp_len]
        jae     .done
        mov     ax, [dsti]
        cmp     ax, DECCAP
        jae     .done
        call    compb               ; al = comp_seg[srci]
        inc     word [srci]
        cmp     al, 81h
        jb      .lit
        ; ---- repeat: cnt = 257 - c  (c in 129..255 -> cnt in 2..128) ----
        mov     cx, 257
        movzx   bx, al
        sub     cx, bx
        mov     ax, [srci]
        cmp     ax, [comp_len]
        jae     .loop               ; no value byte available -> stop (mirrors TS i++ / loop end)
        call    compb
        inc     word [srci]
        mov     [runval], al
.rep_fill:
        jcxz    .loop
        mov     ax, [dsti]
        cmp     ax, DECCAP
        jae     .done
        mov     al, [runval]
        call    decwrite
        inc     word [dsti]
        dec     cx
        jmp     .rep_fill
.lit:
        ; ---- literal: cnt = c+1  (c in 0..128 -> cnt in 1..129) ----
        movzx   cx, al
        inc     cx
.lit_fill:
        jcxz    .loop
        mov     ax, [srci]
        cmp     ax, [comp_len]
        jae     .loop               ; ran out of source mid-run -> stop this run
        call    compb
        inc     word [srci]
        mov     [runval], al
        mov     ax, [dsti]
        cmp     ax, DECCAP
        jae     .done
        mov     al, [runval]
        call    decwrite
        inc     word [dsti]
        dec     cx
        jmp     .lit_fill
.done:
        mov     ax, [dsti]
        mov     [dec_len], ax
        ; The length word is a checkable claim, not decoration: flag any member whose
        ; payload does not expand to exactly what its own header declares. 0 of 98
        ; shipped members disagree, which is what makes the header trustworthy.
        mov     byte [decl_bad], 0
        cmp     ax, [decl_len]
        je      .lenok
        mov     byte [decl_bad], 1
.lenok:
        ret

; al = comp_seg:[srci] (does not advance srci; caller does).
compb:
        push    ds
        mov     ax, [cs:comp_seg]
        mov     ds, ax
        mov     bx, [cs:srci]
        mov     al, [bx]
        pop     ds
        ret

; write al -> dec_seg:[dsti] (does not advance dsti; caller does).
; NOTE: al is an INPUT parameter (the byte to store) -- do NOT stage the
; segment load through ax (mov ax,[cs:dec_seg]/mov es,ax) or it clobbers the
; caller's al *before* the write, corrupting every byte to dec_seg's own low
; byte (verified live in DOSBox: every decompressed record read back as a
; constant equal to dec_seg's low byte, with decLen/bookkeeping still correct
; since srci/dsti tracking is independent of the byte value -- this was a
; real, pre-existing, silent bug: CCMON never actually decoded anything, incl.
; the previously-claimed 5/98 fixed-offset records). Load the segment straight
; into es (mov Sreg,r/m16 accepts a memory operand) so al is never touched.
decwrite:
        push    es
        mov     es, [cs:dec_seg]
        mov     bx, [cs:dsti]
        mov     [es:bx], al
        pop     es
        ret

; ============================================================================
;  sniff_dqk_monster : CF=0 if dec_seg[0..dec_len) is a clean fixed-offset DQK
;  monster record (mirrors moncha.ts sniffDqkMonster exactly, ability@40 fixed).
; ============================================================================
sniff_dqk_monster:
        mov     ax, [dec_len]
        cmp     ax, L_FIXED         ; a real record is at least the 0x1A0 fixed part
        jb      .fail
        mov     bx, L_ISMON
        call    rb
        cmp     al, 1                ; is-monster flag, not a "type 8" byte
        jne     .fail
        ; name printable + >=1 letter, scanning up to 16 bytes at offset 24
        mov     word [letters], 0
        mov     word [nmi], 0
.nmloop:
        mov     ax, [nmi]
        cmp     ax, 16
        jae     .nmdone
        mov     bx, ax
        add     bx, L_NAME
        call    rb
        or      al, al
        jz      .nmdone
        cmp     al, 20h
        jb      .fail
        cmp     al, 7Eh
        ja      .fail
        cmp     al, 'A'
        jb      .chklower
        cmp     al, 'Z'
        jbe     .isletter
.chklower:
        cmp     al, 'a'
        jb      .nmnext
        cmp     al, 'z'
        ja      .nmnext
.isletter:
        inc     word [letters]
.nmnext:
        inc     word [nmi]
        jmp     .nmloop
.nmdone:
        cmp     word [letters], 0
        je      .fail
        ; thac0 = 60 - byte[55]; range [0,30]
        mov     bx, L_ABIL+15
        call    rb
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        cmp     cx, 0
        jl      .fail
        cmp     cx, 30
        jg      .fail
        ; ac = 60 - byte[107]; range [-12,16]
        mov     bx, L_ABIL+67
        call    rb
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        cmp     cx, -12
        jl      .fail
        cmp     cx, 16
        jg      .fail
        ; hd = byte[65]; range [1,40]
        mov     bx, L_ABIL+25
        call    rb
        movzx   ax, al
        cmp     ax, 1
        jl      .fail
        cmp     ax, 40
        jg      .fail
        ; dc = byte[101]; range [1,20]
        mov     bx, L_ABIL+61
        call    rb
        movzx   ax, al
        cmp     ax, 1
        jl      .fail
        cmp     ax, 20
        jg      .fail
        ; ds = byte[103]; must be a valid polyhedral die size
        mov     bx, L_ABIL+63
        call    rb
        call    is_die_size
        jc      .fail
        clc
        ret
.fail:
        stc
        ret

; is_die_size: AL in. CF=0 if AL in {1,2,3,4,6,8,10,12,20,100}, else CF=1.
is_die_size:
        cmp     al, 1
        je      .yes
        cmp     al, 2
        je      .yes
        cmp     al, 3
        je      .yes
        cmp     al, 4
        je      .yes
        cmp     al, 6
        je      .yes
        cmp     al, 8
        je      .yes
        cmp     al, 10
        je      .yes
        cmp     al, 12
        je      .yes
        cmp     al, 20
        je      .yes
        cmp     al, 100
        je      .yes
        stc
        ret
.yes:
        clc
        ret

; ============================================================================
;  scan_monster_name : offset-independent name scan (mirrors moncha.ts
;  scanMonsterName exactly) -- the longest run (>=3 chars, >=2 letters) of
;  A-Z/space/0-9/./'/- at or past offset 16 in dec_seg[0..dec_len].
;  Sets [scan_off]/[scan_len] (scan_len=0 if none found).
; ============================================================================
scan_monster_name:
        mov     word [scan_off], 0
        mov     word [scan_len], 0
        mov     word [cur_start], 0FFFFh
        mov     word [ni], 0
.loop:
        mov     ax, [ni]
        cmp     ax, [dec_len]
        ja      .end
        jb      .readc
        xor     al, al              ; ni == dec_len -> synthetic sentinel byte 0
        jmp     .gotc
.readc:
        mov     bx, ax
        call    rb
.gotc:
        cmp     word [ni], 16
        jb      .notname            ; i<16 never counts, regardless of content
        call    is_name_byte
        jc      .notname
        cmp     word [cur_start], 0FFFFh
        jne     .nextiter
        mov     ax, [ni]
        mov     [cur_start], ax
        jmp     .nextiter
.notname:
        cmp     word [cur_start], 0FFFFh
        je      .nextiter
        ; ---- close run [cur_start,ni): trim trailing spaces, count letters ----
        mov     ax, [ni]
        mov     [run_end], ax
.trim:
        mov     ax, [run_end]
        cmp     ax, [cur_start]
        jbe     .trimmed
        mov     bx, ax
        dec     bx
        call    rb
        cmp     al, ' '
        jne     .trimmed
        dec     word [run_end]
        jmp     .trim
.trimmed:
        mov     word [letters], 0
        mov     ax, [cur_start]
        mov     [scan_i], ax
.cntloop:
        mov     ax, [scan_i]
        cmp     ax, [run_end]
        jae     .cntdone
        mov     bx, ax
        call    rb
        cmp     al, 'A'
        jb      .cntnext
        cmp     al, 'Z'
        ja      .cntnext
        inc     word [letters]
.cntnext:
        inc     word [scan_i]
        jmp     .cntloop
.cntdone:
        mov     ax, [run_end]
        sub     ax, [cur_start]     ; ax = run length
        cmp     ax, 3
        jb      .noqualify
        cmp     word [letters], 2
        jb      .noqualify
        cmp     ax, [scan_len]
        jbe     .noqualify
        mov     [scan_len], ax
        mov     ax, [cur_start]
        mov     [scan_off], ax
.noqualify:
        mov     word [cur_start], 0FFFFh
.nextiter:
        inc     word [ni]
        jmp     .loop
.end:
        ret

; is_name_byte: AL in. CF=0 if A-Z / space / 0-9 / . / ' / - , else CF=1.
is_name_byte:
        cmp     al, 'A'
        jb      .chkspace
        cmp     al, 'Z'
        jbe     .yes
.chkspace:
        cmp     al, ' '
        je      .yes
        cmp     al, '0'
        jb      .chkpunct
        cmp     al, '9'
        jbe     .yes
.chkpunct:
        cmp     al, '.'
        je      .yes
        cmp     al, 27h             ; '
        je      .yes
        cmp     al, '-'
        je      .yes
        stc
        ret
.yes:
        clc
        ret

; ============================================================================
;  Record field readers. rb/rw read from dec_seg:[bx]; compb/decwrite (above)
;  are the decompressor's comp_seg/dec_seg-index-based counterparts.
; ============================================================================
; rb: AL = byte at dec_seg:[bx]. Preserves BX.
rb:
        push    ds
        push    ax
        mov     ax, [cs:dec_seg]
        mov     ds, ax
        pop     ax
        mov     al, [bx]
        pop     ds
        ret

; rw: AX = LE word at dec_seg:[bx].
rw:
        push    ds
        mov     ax, [cs:dec_seg]
        mov     ds, ax
        mov     ax, [bx]
        pop     ds
        ret

; ============================================================================
;  print_clean_record : full labelled field dump of a sniff-passed record
;  (fixed ability offset 40). Mirrors moncha.ts decodeDqkMonsterRecord.
; ============================================================================
print_clean_record:
        mov     dx, s_hdr1
        mov     ah, 9
        int     21h
        call    print_fixed_name

        mov     bx, L_ISMON
        call    rb
        movzx   ax, al
        mov     si, s_type
        call    emit_label_dec

        mov     bx, L_XP
        call    rw
        mov     si, s_xp
        call    emit_label_dec

        call    print_abilities

        mov     bx, L_ABIL+15       ; thac0 = 60 - byte[L_ABIL+15]
        call    rb
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        mov     ax, cx
        mov     si, s_thac0
        call    emit_label_sdec

        mov     bx, L_ABIL+67       ; ac = 60 - byte[L_ABIL+67]
        call    rb
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        mov     ax, cx
        mov     si, s_ac
        call    emit_label_sdec

        mov     bx, L_ABIL+25       ; hitDice
        call    rb
        movzx   ax, al
        mov     [hdval], ax
        mov     si, s_hd
        call    emit_label_dec

        ; hitPoints = max(hd, (hd*9+1)>>1)  -- matches moncha.ts avgHpForHd
        mov     ax, [hdval]
        mov     cx, 9
        mul     cx
        inc     ax
        shr     ax, 1
        mov     cx, ax
        mov     ax, [hdval]
        cmp     cx, ax
        jae     .hpok
        mov     cx, ax
.hpok:
        mov     ax, cx
        mov     si, s_hp
        call    emit_label_dec

        mov     bx, L_ABIL+61       ; damage: count
        call    rb
        movzx   ax, al
        mov     si, s_dcount
        call    emit_label_dec

        mov     bx, L_ABIL+63       ; damage: sides
        call    rb
        movzx   ax, al
        mov     si, s_dsides
        call    emit_label_dec

        mov     bx, L_ABIL+65       ; damage: bonus (signed byte)
        call    rb
        cbw
        mov     si, s_dbonus
        call    emit_label_sdec

        call    print_saves

        mov     dx, s_catmon
        mov     ah, 9
        int     21h
        ret

; print abilities (STR/INT/WIS/DEX/CON/CHA): current byte of each (cur,max)
; pair, base = ability offset 40 (the fixed direct layout).
;
; NOTE: the running offset is tracked in the [abil_base] MEMORY variable, not
; in BX across calls -- emit_label_dec ends in line_crlf_out, which sets
; BX=1 (the stdout handle) for its int 21h write and never restores it, so a
; register-held offset would be silently destroyed after the first field
; (same pitfall ccdat.asm's print_saves_at_208 comment calls out).
print_abilities:
        mov     word [abil_base], L_ABIL
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
        add     word [abil_base], 2
        ret

; print the 5 saving throws at fixed offset L_ABIL+19. [save_off] memory var for the
; same reason as [abil_base] above (BX does not survive emit_label_dec).
print_saves:
        mov     word [save_off], L_ABIL+19
        mov     si, s_sv1
        call    .one
        mov     si, s_sv2
        call    .one
        mov     si, s_sv3
        call    .one
        mov     si, s_sv4
        call    .one
        mov     si, s_sv5
        call    .one
        ret
.one:
        push    si
        mov     bx, [save_off]
        call    rb
        movzx   ax, al
        pop     si
        call    emit_label_dec
        inc     word [save_off]
        ret

; ============================================================================
;  print_noclean_record : name-only report for a record whose fixed-offset
;  stat block didn't validate (needs moncha.ts's reconstruction, unimplemented
;  here). [scan_off]/[scan_len] must already be set (caller ran scan_monster_name).
; ============================================================================
print_noclean_record:
        mov     dx, s_hdr0
        mov     ah, 9
        int     21h
        call    print_scanned_name

        mov     ax, [dec_len]
        cmp     ax, L_ISMON+1
        jb      .notype
        mov     bx, L_ISMON
        call    rb
        movzx   ax, al
        mov     si, s_type
        call    emit_label_dec
        jmp     .decl
.notype:
        mov     dx, s_notype
        mov     ah, 9
        int     21h
.decl:
        mov     ax, [dec_len]
        mov     si, s_declen
        call    emit_label_dec

        mov     dx, s_note
        mov     ah, 9
        int     21h
        ret

; ============================================================================
;  list_records : one line per record 1..memberCount-1:
;     "<decLen> Mnnnn.MON <0|1> <name>"
;  then a summary (records: N / fixedOffsetStats: N / fullStats: N). fullStats
;  is the TRUE coverage figure (fixed-offset + the extended reconstruction
;  chain: recon/dec-path/compact/canon-AC/NPC -- see decode_extended); it is
;  what to diff against moncha.ts's decodeMonchaGlb `decoded` count.
; ============================================================================
list_records:
        mov     word [gidx], 1
        mov     word [cleancnt], 0
        mov     word [extcnt], 0
.loop:
        mov     ax, [ptrcount]
        dec     ax                  ; memberCount (flat, includes id table)
        cmp     [gidx], ax
        jae     .done
        mov     ax, [gidx]
        call    load_record         ; always succeeds here (gidx in 1..memberCount-1)
        mov     byte [use_fixed_name], 0
        call    sniff_dqk_monster
        jc      .try_ext3
        inc     word [cleancnt]
        mov     byte [hasstats], 1
        mov     byte [use_fixed_name], 1
        jmp     .haveflag
.try_ext3:
        call    decode_extended     ; also sets scan_off/scan_len (name source)
        cmp     byte [ext_ok], 1
        jne     .noclean
        inc     word [extcnt]
        mov     byte [hasstats], 1
        jmp     .haveflag
.noclean:
        mov     byte [hasstats], 0
.haveflag:
        mov     di, linebuf
        mov     ax, [dec_len]
        xor     dx, dx
        call    put_dec32
        mov     byte [di], ' '
        inc     di
        mov     byte [di], 'M'
        inc     di
        mov     ax, [gidx]
        call    put_dec16_4
        mov     si, s_ext_mon
        call    cat_si
        mov     byte [di], ' '
        inc     di
        mov     al, [hasstats]
        add     al, '0'
        mov     [di], al
        inc     di
        mov     byte [di], ' '
        inc     di
        cmp     byte [hasstats], 0
        je      .usescan
        cmp     byte [use_fixed_name], 0
        je      .usescan            ; extended-stat record -> scanned name, not the offset-24 field
        call    append_fixed_name
        jmp     .lineend
.usescan:
        call    append_scanned_name
.lineend:
        call    line_crlf_out
        inc     word [gidx]
        jmp     .loop
.done:
        mov     ax, [ptrcount]
        sub     ax, 2               ; total records = ptrcount - 2 (drop EOF + id table)
        mov     si, s_total
        call    emit_label_dec
        mov     ax, [cleancnt]
        mov     si, s_clean
        call    emit_label_dec
        mov     ax, [cleancnt]
        add     ax, [extcnt]
        mov     si, s_fullstats
        call    emit_label_dec
        ret

; ============================================================================
;  Name helpers.
; ============================================================================
; append_fixed_name: appends dec_seg[24..40) NUL-clamped chars at di (di advances).
append_fixed_name:
        mov     cx, 16
        mov     bx, L_NAME
.loop:
        jcxz    .done
        call    rb
        or      al, al
        jz      .done
        mov     [di], al
        inc     di
        inc     bx
        loop    .loop
.done:
        ret

; append_scanned_name: appends [scan_off..scan_off+scan_len) at di; '?' if none.
append_scanned_name:
        mov     cx, [scan_len]
        jcxz    .none
        mov     bx, [scan_off]
.loop:
        jcxz    .done
        call    rb
        mov     [di], al
        inc     di
        inc     bx
        loop    .loop
        jmp     .done
.none:
        mov     byte [di], '?'
        inc     di
.done:
        ret

print_fixed_name:
        mov     di, linebuf
        mov     si, s_name
        call    cat_si
        call    append_fixed_name
        call    line_crlf_out
        ret

print_scanned_name:
        mov     di, linebuf
        mov     si, s_name
        call    cat_si
        call    append_scanned_name
        call    line_crlf_out
        ret

; ============================================================================
;  extract (verb X): write dec_seg[0..dec_len) -- the byte-exact monchaRLE
;  output -- to dir\Mnnnn.MON.
; ============================================================================
write_record_file:
        call    build_destpath_m
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, destpath
        int     21h
        jc      .ret
        mov     [ofh], ax
        push    ds
        mov     ds, [cs:dec_seg]
        mov     ah, 40h
        mov     bx, [cs:ofh]
        mov     cx, [cs:dec_len]
        xor     dx, dx
        int     21h
        pop     ds
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

; build destpath = dir + '\' + Mnnnn.MON  (mirrors cchlib's build_destpath_d)
build_destpath_m:
        mov     si, dirarg
        mov     di, destpath
.cd:
        mov     al, [si]
        or      al, al
        jz      .sl
        mov     [di], al
        inc     si
        inc     di
        jmp     .cd
.sl:
        cmp     di, destpath
        je      .nm
        cmp     byte [di-1], '\'
        je      .nm
        mov     byte [di], '\'
        inc     di
.nm:
        mov     al, 'M'
        mov     [di], al
        inc     di
        mov     ax, [blkidx]
        call    put_dec16_4
        mov     si, s_ext_mon
        call    cat_si
        mov     byte [di], 0
        ret

; ============================================================================
;  Generic text/print helpers (same idioms as cchlib.asm / ccdat.asm).
; ============================================================================
; emit_label_dec: si=label(ASCIIZ), ax=unsigned value. "<label><dec>\r\n" -> stdout.
emit_label_dec:
        push    ax
        mov     di, linebuf
        call    cat_si
        pop     ax
        xor     dx, dx
        call    put_dec32
        call    line_crlf_out
        ret

; emit_label_sdec: like emit_label_dec but AX is a signed 16-bit value.
emit_label_sdec:
        push    ax
        mov     di, linebuf
        call    cat_si
        pop     ax
        test    ax, 8000h
        jz      .pos
        neg     ax
        push    ax
        mov     byte [di], '-'
        inc     di
        pop     ax
.pos:
        xor     dx, dx
        call    put_dec32
        call    line_crlf_out
        ret

; line_crlf_out: append CRLF at di, write linebuf..di to stdout (handle 1).
line_crlf_out:
        mov     byte [di], 13
        inc     di
        mov     byte [di], 10
        inc     di
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, 1
        mov     ah, 40h
        int     21h
        ret

; seek file [fh] to cx:dx (32-bit absolute).
seek32:
        push    ax
        mov     bx, [fh]
        mov     ax, 4200h
        int     21h
        pop     ax
        ret

; read cx bytes into ds:dx from [fh].
read_here:
        push    ax
        push    bx
        mov     bx, [fh]
        mov     ah, 3Fh
        int     21h
        pop     bx
        pop     ax
        ret

; append ASCIIZ at si to di (no terminator written); clobbers AX/SI.
cat_si:
        lodsb
        or      al, al
        jz      .d
        stosb
        jmp     cat_si
.d:
        ret

; put low-32 decimal of dx:ax at di (di advanced). 32-bit divide by 10.
put_dec32:
        push    bx
        push    cx
        push    si
        mov     [d32lo], ax
        mov     [d32hi], dx
        mov     si, d32buf+11
        mov     byte [si], 0
.dv:
        mov     ax, [d32hi]
        xor     dx, dx
        mov     bx, 10
        div     bx
        mov     [d32hi], ax
        mov     ax, [d32lo]
        div     bx
        mov     [d32lo], ax
        add     dl, '0'
        dec     si
        mov     [si], dl
        mov     ax, [d32hi]
        or      ax, [d32lo]
        jnz     .dv
.cp:
        mov     al, [si]
        or      al, al
        jz      .done
        mov     [di], al
        inc     di
        inc     si
        jmp     .cp
.done:
        pop     si
        pop     cx
        pop     bx
        ret

; put ax as 4-digit zero-padded decimal at di.
put_dec16_4:
        push    bx
        push    cx
        push    dx
        mov     bx, 1000
        mov     cx, 4
.dl:
        xor     dx, dx
        div     bx
        add     al, '0'
        mov     [di], al
        inc     di
        mov     ax, dx
        push    ax
        mov     ax, bx
        xor     dx, dx
        mov     bx, 10
        div     bx
        mov     bx, ax
        pop     ax
        loop    .dl
        pop     dx
        pop     cx
        pop     bx
        ret

; ============================================================================
;  parse_args : [L|X] <file> [index] [dir]   (same grammar/skeleton as cchlib,
;  minus the /D flag which CCMON has no use for).
; ============================================================================
parse_args:
        mov     byte [verb], 0
        mov     byte [fname], 0
        mov     byte [dirarg], 0
        mov     word [blkidx], 0
        mov     si, 81h
        call    skip_sp
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'L'
        je      .isverb
        cmp     al, 'X'
        je      .isverb
        jmp     .getfile
.isverb:
        mov     ah, [si+1]
        cmp     ah, ' '
        jne     .getfile
        mov     [verb], al
        inc     si
        call    skip_sp
.getfile:
        mov     di, fname
.cf:
        mov     al, [si]
        or      al, al
        jz      .fin
        cmp     al, 13
        je      .fin
        cmp     al, ' '
        je      .cfd
        mov     [di], al
        inc     si
        inc     di
        jmp     .cf
.cfd:
        mov     byte [di], 0
        call    skip_sp
        xor     bx, bx
.di:
        mov     al, [si]
        cmp     al, '0'
        jb      .did
        cmp     al, '9'
        ja      .did
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
        jmp     .di
.did:
        mov     [blkidx], bx
        call    skip_sp
        mov     di, dirarg
.cdd:
        mov     al, [si]
        or      al, al
        jz      .dfin
        cmp     al, 13
        je      .dfin
        mov     [di], al
        inc     si
        inc     di
        jmp     .cdd
.dfin:
        mov     byte [di], 0
        ret
.fin:
        mov     byte [di], 0
        ret

skip_sp:
        cmp     byte [si], ' '
        jne     .d
        inc     si
        jmp     skip_sp
.d:
        ret

; ============================================================================
;  EXTENDED RECONSTRUCTION (this session's port of moncha.ts's
;  decodeFullStatMonster + decodeMonchaGlb's NPC fallback). Ported strategies
;  are enumerated in the file header SCOPE comment; this section implements
;  them. All of it is additive -- the original fixed-offset path above
;  (sniff_dqk_monster / print_clean_record, ability@40 on dec_seg) is
;  untouched, still tried FIRST by every caller, exactly as moncha.ts tries
;  sniffDqkMonster before reconstructDqkRecord.
;
;  Generic buffer access: [gseg] names the "active" segment (recon_seg or
;  dec_seg) and [glen] its length; rbg reads a byte from it. This lets ONE set
;  of ability-anchored routines (find_ability_block_g, sniff_at_ability_g, ...)
;  work on either buffer, mirroring how moncha.ts's helpers take a plain
;  Uint8Array (reconstructed or not) + an ability offset.
;
;  rbg: AL = [gseg]:[bx]. Preserves BX.
; ============================================================================
rbg:
        push    ds
        push    ax
        mov     ax, [cs:gseg]
        mov     ds, ax
        pop     ax
        mov     al, [bx]
        pop     ds
        ret

; ============================================================================
;  rle_decode_g : generic monchaRLE decode, buffer/offset-agnostic (duplicates
;  decompress_moncha's proven algorithm rather than refactoring it, so the
;  already-verified 5/98 fixed-offset path is never put at risk).
;  Inputs (globals): g_src_seg/g_src_off/g_src_len, g_dst_seg/g_dst_off,
;  g_dst_cap (REMAINING room from g_dst_off -- caller passes cap-minus-offset
;  so the absolute-from-dst_off clamp matches decompress_moncha's
;  absolute-from-0 clamp semantics).
;  Output: g_out_len = bytes written at g_dst_seg:[g_dst_off .. +g_out_len).
; ============================================================================
rle_decode_g:
        mov     ax, [g_src_off]
        mov     [g_si], ax
        add     ax, [g_src_len]
        mov     [g_send], ax
        mov     ax, [g_dst_off]
        mov     [g_di], ax
        add     ax, [g_dst_cap]
        mov     [g_dend], ax
.loop:
        mov     ax, [g_si]
        cmp     ax, [g_send]
        jae     .done
        mov     ax, [g_di]
        cmp     ax, [g_dend]
        jae     .done
        call    g_readb
        inc     word [g_si]
        cmp     al, 81h
        jb      .lit
        mov     cx, 257
        movzx   bx, al
        sub     cx, bx
        mov     ax, [g_si]
        cmp     ax, [g_send]
        jae     .loop
        call    g_readb
        inc     word [g_si]
        mov     [g_rv], al
.rf:
        jcxz    .loop
        mov     ax, [g_di]
        cmp     ax, [g_dend]
        jae     .done
        mov     al, [g_rv]
        call    g_writeb
        inc     word [g_di]
        dec     cx
        jmp     .rf
.lit:
        movzx   cx, al
        inc     cx
.lf:
        jcxz    .loop
        mov     ax, [g_si]
        cmp     ax, [g_send]
        jae     .loop
        call    g_readb
        inc     word [g_si]
        mov     [g_rv], al
        mov     ax, [g_di]
        cmp     ax, [g_dend]
        jae     .done
        mov     al, [g_rv]
        call    g_writeb
        inc     word [g_di]
        dec     cx
        jmp     .lf
.done:
        mov     ax, [g_di]
        sub     ax, [g_dst_off]
        mov     [g_out_len], ax
        ret

; g_readb: AL = g_src_seg:[g_si] (absolute offset; does not advance g_si).
g_readb:
        push    ds
        mov     ax, [cs:g_src_seg]
        mov     ds, ax
        mov     bx, [cs:g_si]
        mov     al, [bx]
        pop     ds
        ret

; g_writeb: g_dst_seg:[g_di] = AL (absolute offset; does not advance g_di).
; NOTE: same al-is-an-input-parameter hazard as decwrite (see its comment) --
; load es straight from memory, never stage through ax.
g_writeb:
        push    es
        mov     es, [cs:g_dst_seg]
        mov     bx, [cs:g_di]
        mov     [es:bx], al
        pop     es
        ret

; ============================================================================
;  build_recon : moncha.ts's reconstructDqkRecord. Requires scan_off/scan_len
;  already set (non-zero length -- caller checks) by a prior scan_monster_name
;  over dec_seg. Splices dec_seg[0..end) (header+name, unchanged) with a
;  SECOND monchaRLE pass over dec_seg[end..dec_len) into recon_seg, where
;  end = scan_off+scan_len. Sets [arseg]/[arlen] = the resulting active
;  buffer/length (always recon_seg here -- the "alias to dec_seg unchanged"
;  no-op case in moncha.ts only occurs when no name was scanned, which the
;  caller already filtered out before calling build_recon).
; ============================================================================
build_recon:
        mov     ax, [scan_off]
        add     ax, [scan_len]
        mov     [recon_end], ax
        ; copy dec_seg[0..end) -> recon_seg[0..end) verbatim
        push    ds
        push    es
        mov     ax, [dec_seg]
        mov     ds, ax
        ; BUG (found + fixed live in DOSBox, TWO separate instances of the same
        ; class): once ds is switched to dec_seg (immediately above), ANY plain
        ; (non-cs:-prefixed) read of a cs-resident global here picks up 2
        ; garbage bytes from INSIDE the current record's own decompressed data
        ; at whatever offset that variable happens to sit at in cs, instead of
        ; the real variable -- a data-dependent bug that only misbehaves for
        ; records whose data bytes at that offset don't coincidentally look
        ; like a plausible value. Instance 1 (recon_end, below): verified case
        ; MONCHA member 80 (BALDRIC) decoded correctly in isolation but failed
        ; via "L" list mode, because the two builds placed recon_end at
        ; different cs offsets, sampling different (wrong) bytes each time.
        ; Instance 2 (recon_seg, used for ES just below): verified case MONCHA
        ; member 3 -- the plain [recon_seg] read returned a garbage segment
        ; value from inside dec_seg's own bytes, so `rep movsb` copied the
        ; verbatim header+name into the WRONG (garbage) segment, leaving the
        ; real recon_seg buffer's head all-zero while the later RLE-decoded
        ; tail (written via g_dst_seg, read with ds==cs) landed correctly --
        ; producing a corrupt spliced buffer that hung find_ability_block_g.
        ; Both reads must go via cs: explicitly since ds != cs in this window.
        mov     ax, [cs:recon_seg]
        mov     es, ax
        xor     si, si
        xor     di, di
        mov     cx, [cs:recon_end]
        cld
        rep     movsb
        pop     es
        pop     ds
        ; monchaRLE-decode dec_seg[end..dec_len) -> recon_seg[end..)
        mov     ax, [dec_seg]
        mov     [g_src_seg], ax
        mov     ax, [recon_end]
        mov     [g_src_off], ax
        mov     ax, [dec_len]
        sub     ax, [recon_end]
        mov     [g_src_len], ax
        mov     ax, [recon_seg]
        mov     [g_dst_seg], ax
        mov     ax, [recon_end]
        mov     [g_dst_off], ax
        mov     ax, RECONCAP
        sub     ax, [recon_end]     ; remaining room -> absolute clamp at RECONCAP
        mov     [g_dst_cap], ax
        call    rle_decode_g
        mov     ax, [recon_end]
        add     ax, [g_out_len]
        mov     [arlen], ax
        mov     ax, [recon_seg]
        mov     [arseg], ax
        ret

; ============================================================================
;  find_ability_block_g : moncha.ts findAbilityBlock. [gseg]/[glen] must be
;  set. CF=0 + AX=A on success; CF=1 if no ability block found.
; ============================================================================
find_ability_block_g:
        mov     word [fab_A], 1
.outer:
        mov     ax, [fab_A]
        add     ax, 67                  ; ABILITY_DELTA.ac
        cmp     ax, [glen]
        jae     .notfound
        mov     word [fab_k], 0
        mov     word [fab_ok], 1
.kloop:
        mov     ax, [fab_k]
        cmp     ax, 12
        jae     .kdone
        mov     bx, [fab_A]
        add     bx, ax
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jb      .knot
        cmp     ax, 25
        jbe     .kok
.knot:
        mov     word [fab_ok], 0
.kok:
        inc     word [fab_k]
        jmp     .kloop
.kdone:
        cmp     word [fab_ok], 0
        je      .next
        mov     bx, [fab_A]
        add     bx, 12
        call    rbg
        or      al, al
        jnz     .next
        mov     bx, [fab_A]
        add     bx, 13
        call    rbg
        or      al, al
        jnz     .next
        mov     bx, [fab_A]
        add     bx, 14
        call    rbg
        or      al, al
        jnz     .next
        ; prev = gseg[A-1] must NOT be in [1,25] (block start, not mid-run)
        mov     bx, [fab_A]
        dec     bx
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jb      .found
        cmp     ax, 25
        jbe     .next
        jmp     .found
.found:
        mov     ax, [fab_A]
        clc
        ret
.next:
        inc     word [fab_A]
        jmp     .outer
.notfound:
        stc
        ret

; ============================================================================
;  sniff_at_ability_g : moncha.ts sniffAtAbility. AX=A in; [gseg]/[glen] set.
;  CF=0 pass.
; ============================================================================
sniff_at_ability_g:
        mov     [sab_A], ax
        add     ax, 67
        cmp     ax, [glen]
        jae     .fail
        mov     bx, [sab_A]
        add     bx, 15                  ; thac0 = 60 - gseg[A+15]; range [0,30]
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        cmp     cx, 0
        jl      .fail
        cmp     cx, 30
        jg      .fail
        mov     bx, [sab_A]
        add     bx, 67                  ; ac = 60 - gseg[A+67]; range [-12,16]
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        cmp     cx, -12
        jl      .fail
        cmp     cx, 16
        jg      .fail
        mov     bx, [sab_A]
        add     bx, 25                  ; hd = gseg[A+25]; range [1,40]
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jl      .fail
        cmp     ax, 40
        jg      .fail
        mov     bx, [sab_A]
        add     bx, 61                  ; dc = gseg[A+61]; range [1,12]
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jl      .fail
        cmp     ax, 12
        jg      .fail
        mov     bx, [sab_A]
        add     bx, 63                  ; ds = gseg[A+63]; valid die size, >=2
        call    rbg
        cmp     al, 2
        jb      .fail
        call    is_die_size
        jc      .fail
        clc
        ret
.fail:
        stc
        ret

; ============================================================================
;  sniff_compact_monster_g : moncha.ts sniffCompactMonster (HYDRA short-tail).
;  AX=A in; [gseg]/[glen] set. CF=0 pass.
; ============================================================================
sniff_compact_monster_g:
        mov     [scm_A], ax
        add     ax, 46
        cmp     ax, [glen]
        jae     .fail
        mov     bx, [scm_A]
        add     bx, 15                  ; thac0 (standard offset)
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        cmp     cx, 0
        jl      .fail
        cmp     cx, 30
        jg      .fail
        mov     bx, [scm_A]
        add     bx, 46                  ; ac (COMPACT_DELTA)
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        cmp     cx, -12
        jl      .fail
        cmp     cx, 16
        jg      .fail
        mov     bx, [scm_A]
        add     bx, 25                  ; hd (standard offset)
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jl      .fail
        cmp     ax, 40
        jg      .fail
        mov     bx, [scm_A]
        add     bx, 43                  ; dc (COMPACT_DELTA)
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jl      .fail
        cmp     ax, 12
        jg      .fail
        mov     bx, [scm_A]
        add     bx, 44                  ; ds (COMPACT_DELTA)
        call    rbg
        cmp     al, 2
        jb      .fail
        call    is_die_size
        jc      .fail
        clc
        ret
.fail:
        stc
        ret

; ============================================================================
;  sniff_at_ability_except_ac_g : moncha.ts sniffAtAbilityExceptAc (gates the
;  UMBERHULK canon-AC injection). AX=A in; [gseg]/[glen] set. CF=0 pass (every
;  field valid EXCEPT ac, which must be OUT of the normal [-12,16] range).
; ============================================================================
sniff_at_ability_except_ac_g:
        mov     [sae_A], ax
        add     ax, 67
        cmp     ax, [glen]
        jae     .fail
        mov     bx, [sae_A]
        add     bx, 15
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        cmp     cx, 0
        jl      .fail
        cmp     cx, 30
        jg      .fail
        mov     bx, [sae_A]
        add     bx, 25
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jl      .fail
        cmp     ax, 40
        jg      .fail
        mov     bx, [sae_A]
        add     bx, 61
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jl      .fail
        cmp     ax, 12
        jg      .fail
        mov     bx, [sae_A]
        add     bx, 63
        call    rbg
        cmp     al, 2
        jb      .fail
        call    is_die_size
        jc      .fail
        mov     bx, [sae_A]
        add     bx, 67
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        cmp     cx, -12
        jl      .pass
        cmp     cx, 16
        jg      .pass
        jmp     .fail                   ; ac IS in range -> not the consumed-opcode pathology
.pass:
        clc
        ret
.fail:
        stc
        ret

; ============================================================================
;  is_monster_default_ability_g : moncha.ts isMonsterDefaultAbility. AX=A in;
;  [gseg] set. Returns AL=1 (true) / AL=0 (false).
; ============================================================================
is_monster_default_ability_g:
        mov     [ida_A], ax
        mov     word [ida_tens], 0
        mov     word [ida_non10cnt], 0
        mov     word [ida_non10idx], 0FFFFh
        mov     word [ida_non10val], 0
        mov     word [ida_allle10], 1
        mov     word [ida_i], 0
.loop:
        mov     ax, [ida_i]
        cmp     ax, 6
        jae     .done
        mov     bx, [ida_A]
        mov     cx, ax
        shl     cx, 1
        add     bx, cx
        call    rbg
        movzx   ax, al
        cmp     ax, 10
        jne     .not10
        inc     word [ida_tens]
        jmp     .chkrange
.not10:
        inc     word [ida_non10cnt]
        mov     cx, [ida_i]
        mov     [ida_non10idx], cx
        mov     [ida_non10val], ax
.chkrange:
        cmp     ax, 1
        jb      .clramp
        cmp     ax, 10
        jbe     .cont
.clramp:
        mov     word [ida_allle10], 0
.cont:
        inc     word [ida_i]
        jmp     .loop
.done:
        mov     ax, [ida_tens]
        cmp     ax, 4
        jb      .checkB
        cmp     word [ida_allle10], 0
        je      .checkB
        mov     al, 1
        ret
.checkB:
        cmp     word [ida_non10cnt], 1
        jne     .false
        cmp     word [ida_non10idx], 1
        jne     .false
        cmp     word [ida_non10val], 18
        jne     .false
        mov     al, 1
        ret
.false:
        mov     al, 0
        ret

; ============================================================================
;  is_rolled_ability_g : moncha.ts isRolledAbility. AX=A in; [gseg] set.
;  Returns AL=1 (true) / AL=0 (false): all 6 currents in [1,25] AND at least
;  one > 10.
; ============================================================================
is_rolled_ability_g:
        mov     [ira_A], ax
        mov     word [ira_anyhigh], 0
        mov     word [ira_allrange], 1
        mov     word [ira_i], 0
.loop:
        mov     ax, [ira_i]
        cmp     ax, 6
        jae     .done
        mov     bx, [ira_A]
        mov     cx, ax
        shl     cx, 1
        add     bx, cx
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jb      .oor
        cmp     ax, 25
        jbe     .inr
.oor:
        mov     word [ira_allrange], 0
        jmp     .cont
.inr:
        cmp     ax, 10
        jbe     .cont
        mov     word [ira_anyhigh], 1
.cont:
        inc     word [ira_i]
        jmp     .loop
.done:
        cmp     word [ira_allrange], 0
        je      .false
        cmp     word [ira_anyhigh], 0
        je      .false
        mov     al, 1
        ret
.false:
        mov     al, 0
        ret

; ============================================================================
;  npc_fields_valid_g : the validity gate half of moncha.ts decodeNpcRecord
;  (thac0/hp/level in range + the A+71 bound check). AX=A in; [gseg]/[glen]
;  set. CF=0 valid.
; ============================================================================
npc_fields_valid_g:
        mov     [nfv_A], ax
        add     ax, 71                  ; NPC_DELTA.classCode
        cmp     ax, [glen]
        jae     .bad
        mov     bx, [nfv_A]
        add     bx, 15                  ; thac0
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        cmp     cx, 0
        jl      .bad
        cmp     cx, 30
        jg      .bad
        mov     bx, [nfv_A]
        add     bx, 17                  ; hp -- stored, not rolled
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jl      .bad
        cmp     ax, 255
        jg      .bad
        mov     bx, [nfv_A]
        add     bx, 25                  ; level (same offset as monster hitDice)
        call    rbg
        movzx   ax, al
        cmp     ax, 1
        jl      .bad
        cmp     ax, 40
        jg      .bad
        clc
        ret
.bad:
        stc
        ret

; dqk_type_byte: AL = dec_seg[2] (the raw record-type tag; always read from the
; ORIGINAL decompressed member, never the reconstructed buffer -- the header
; is identical in both, but this avoids any [gseg] dependency).
dqk_type_byte:
        push    bx
        push    ds
        mov     ax, [cs:dec_seg]
        mov     ds, ax
        mov     bx, L_ISMON
        mov     al, [bx]
        pop     ds
        pop     bx
        ret

; name_is_umberhulk: CF=0 if the scanned name (scan_off/scan_len over dec_seg)
; is exactly "UMBERHULK" (9 chars) -- the sole entry in moncha.ts's CANON_AC
; table. CF=1 otherwise.
name_is_umberhulk:
        cmp     word [scan_len], 9
        jne     .no
        mov     cx, 9
        mov     bx, [scan_off]
        mov     si, s_umberhulk
.cmp:
        jcxz    .yes
        call    rb                      ; AL = dec_seg[bx] (scan is always over dec_seg)
        mov     dl, [si]
        cmp     al, dl
        jne     .no
        inc     bx
        inc     si
        loop    .cmp
.yes:
        clc
        ret
.no:
        stc
        ret

; ============================================================================
;  decode_extended : the orchestrator -- mirrors moncha.ts's
;  decodeFullStatMonster (recon/dec-path/compact/canon-AC) plus
;  decodeMonchaGlb's separate character/NPC fallback. Requires dec_seg/dec_len
;  already loaded (load_record) and the fixed-offset sniff_dqk_monster already
;  tried and failed by the caller.
;
;  Output:
;    [ext_ok]  = 1 if any stat record decoded, else 0 (name-only remains).
;    [ext_cat] = 0 (monster) / 1 (npc), valid only if ext_ok=1.
;    [gseg]/[gm_A] = buffer + ability-anchor offset to read fields from
;      (print_generic_monster / print_npc_record consume these).
;    [gm_ac_override]/[gm_ac_val]/[gm_ac_canon], [gm_dmg_override]/
;      [gm_dmg_n]/[gm_dmg_s]/[gm_dmg_b] = field overrides for the compact and
;      canon-AC short-tail paths (see moncha.ts's decodeDqkMonsterRecord opts).
;    [scan_off]/[scan_len] = the record's name (over dec_seg) -- always set,
;      even when ext_ok=0, for the caller's name-only fallback.
; ============================================================================
decode_extended:
        ; §29 (2026-08-21): this used to be a six-strategy staged recovery -- a second RLE
        ; pass over the tail (build_recon), a scan for the ability block, a "dec-path"
        ; retry on the raw member, a compact/short-tail layout for HYDRA, a canon-AC
        ; injection for UMBERHULK, and an NPC framing -- every one of which existed to
        ; compensate for records that would not decode at a fixed offset. They would not
        ; decode because the decompressor was eating the member's 2-byte length word, not
        ; because DQK's format is irregular. With the phase fixed there is nothing to
        ; reconstruct: the name is at L_NAME and the ability block at L_ABIL in all 98
        ; shipped members. So the chain collapses to "which half of the library is this
        ; record in", read from the is-monster byte.
        ;
        ; The strategies themselves (build_recon, find_ability_block_g,
        ; sniff_compact_monster_g, sniff_at_ability_except_ac_g, name_is_umberhulk) are
        ; left assembled but unreferenced from here, as the record of a wrong turn; see
        ; docs/engine/research/cok-m4-fidelity-plan.md §29. Nothing invents a stat any
        ; more: gm_ac_override / gm_ac_canon / gm_dmg_override are never set, so every
        ; number CCMON prints is a byte that is actually on the disk.
        mov     byte [ext_ok], 0
        mov     byte [gm_ac_override], 0
        mov     byte [gm_ac_canon], 0
        mov     byte [gm_dmg_override], 0
        mov     byte [have_reconA], 0

        mov     ax, [dec_len]
        cmp     ax, L_FIXED
        jb      .fail                   ; short of the fixed part -> no stats, no guessing

        mov     ax, [dec_seg]
        mov     [gseg], ax
        mov     ax, [dec_len]
        mov     [glen], ax
        mov     word [gm_A], L_ABIL
        call    scan_monster_name       ; display path only; the real name is at L_NAME

        call    dqk_type_byte           ; al = record[L_ISMON]
        cmp     al, 1
        jne     .npc

        ; ---- bestiary half: monster stats at the fixed ability offset ----
        mov     ax, L_ABIL
        call    sniff_at_ability_g
        jc      .fail
        mov     byte [ext_ok], 1
        mov     byte [ext_cat], 0
        ret

.npc:
        ; ---- character half: the NPC deltas, same fixed anchor ----
        mov     ax, L_ABIL
        call    npc_fields_valid_g
        jc      .fail
        mov     byte [ext_ok], 1
        mov     byte [ext_cat], 1
        ret

.fail:
        ret

; ============================================================================
;  print_generic_monster : field dump for a monster-framed record decoded via
;  the extended chain, anchored at ability offset [gm_A] in [gseg]. Mirrors
;  print_clean_record's field order/format exactly (moncha.ts
;  decodeDqkMonsterRecord) but reads through rbg (buffer-agnostic) and honours
;  the compact/canon-AC overrides. Name comes from the DEC_SEG scan
;  (scan_off/scan_len) via rb, same as print_noclean_record's name -- moncha.ts
;  always names via the outer scanMonsterName(dec), never a reconstructed
;  buffer.
; ============================================================================
print_generic_monster:
        mov     dx, s_hdr1r
        mov     ah, 9
        int     21h
        call    print_scanned_name

        mov     bx, L_ISMON             ; is-monster flag, absolute dec_seg offset
        call    rb
        movzx   ax, al
        mov     si, s_type
        call    emit_label_dec

        mov     bx, L_XP                ; xp: absolute dec_seg offset L_XP..+1
        call    rw
        mov     si, s_xp
        call    emit_label_dec

        call    print_abilities_g

        mov     bx, [gm_A]
        add     bx, 15
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        mov     ax, cx
        mov     si, s_thac0
        call    emit_label_sdec

        cmp     byte [gm_ac_override], 0
        je      .ac_from_field
        mov     ax, [gm_ac_val]
        jmp     .ac_have
.ac_from_field:
        mov     bx, [gm_A]
        add     bx, 67
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        mov     ax, cx
.ac_have:
        mov     si, s_ac
        call    emit_label_sdec

        mov     bx, [gm_A]
        add     bx, 25
        call    rbg
        movzx   ax, al
        mov     [hdval], ax
        mov     si, s_hd
        call    emit_label_dec

        mov     ax, [hdval]             ; hitPoints = max(hd,(hd*9+1)>>1)
        mov     cx, 9
        mul     cx
        inc     ax
        shr     ax, 1
        mov     cx, ax
        mov     ax, [hdval]
        cmp     cx, ax
        jae     .hpok
        mov     cx, ax
.hpok:
        mov     ax, cx
        mov     si, s_hp
        call    emit_label_dec

        cmp     byte [gm_dmg_override], 0
        je      .dmg_from_field
        mov     ax, [gm_dmg_n]
        mov     si, s_dcount
        call    emit_label_dec
        mov     ax, [gm_dmg_s]
        mov     si, s_dsides
        call    emit_label_dec
        mov     ax, [gm_dmg_b]
        mov     si, s_dbonus
        call    emit_label_sdec
        jmp     .dmg_done
.dmg_from_field:
        mov     bx, [gm_A]
        add     bx, 61
        call    rbg
        movzx   ax, al
        mov     si, s_dcount
        call    emit_label_dec
        mov     bx, [gm_A]
        add     bx, 63
        call    rbg
        movzx   ax, al
        mov     si, s_dsides
        call    emit_label_dec
        mov     bx, [gm_A]
        add     bx, 65
        call    rbg
        cbw
        mov     si, s_dbonus
        call    emit_label_sdec
.dmg_done:
        call    print_saves_g

        cmp     byte [gm_ac_canon], 0
        je      .nocanon
        mov     dx, s_accanon
        mov     ah, 9
        int     21h
.nocanon:
        mov     dx, s_catmon
        mov     ah, 9
        int     21h
        ret

; print abilities at [gm_A] in [gseg] (STR..CHA, current byte of each pair).
; [abil_base] memory var for the same BX-survival reason as print_abilities.
print_abilities_g:
        mov     ax, [gm_A]
        mov     [abil_base], ax
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
        call    rbg
        movzx   ax, al
        pop     si
        call    emit_label_dec
        add     word [abil_base], 2
        ret

; print the 5 saving throws at [gm_A]+19 in [gseg]. [save_off] memory var, ditto.
print_saves_g:
        mov     ax, [gm_A]
        add     ax, 19
        mov     [save_off], ax
        mov     si, s_sv1
        call    .one
        mov     si, s_sv2
        call    .one
        mov     si, s_sv3
        call    .one
        mov     si, s_sv4
        call    .one
        mov     si, s_sv5
        call    .one
        ret
.one:
        push    si
        mov     bx, [save_off]
        call    rbg
        movzx   ax, al
        pop     si
        call    emit_label_dec
        inc     word [save_off]
        ret

; ============================================================================
;  print_npc_record : field dump for a character/NPC-framed record (moncha.ts
;  decodeNpcRecord) anchored at [gm_A] in [gseg]. Distinct field set from the
;  monster dump: stored HP (not HD-rolled), level, class code; damage/xp are
;  the TS decoder's own nominal placeholders (real weapon damage / kill-XP are
;  not in the monster fields for a character record) so they are NOT printed
;  here (nothing to cross-check them against).
; ============================================================================
print_npc_record:
        mov     dx, s_hdrnpc
        mov     ah, 9
        int     21h
        call    print_scanned_name

        mov     bx, [gm_A]
        add     bx, 15                  ; thac0 = 60 - gseg[A+15]
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        mov     ax, cx
        mov     si, s_thac0
        call    emit_label_sdec

        mov     bx, [gm_A]
        add     bx, 17                  ; hp -- stored directly, not HD-rolled
        call    rbg
        movzx   ax, al
        mov     si, s_hp
        call    emit_label_dec

        call    print_abilities_g
        call    print_saves_g

        mov     bx, [gm_A]
        add     bx, 25                  ; level
        call    rbg
        movzx   ax, al
        mov     si, s_level
        call    emit_label_dec

        mov     bx, [gm_A]
        add     bx, 67                  ; ac = 60 - gseg[A+67] (placeholder 10 if unequipped)
        call    rbg
        movzx   ax, al
        mov     cx, 60
        sub     cx, ax
        mov     ax, cx
        mov     si, s_ac
        call    emit_label_sdec

        mov     bx, [gm_A]
        add     bx, 71                  ; class code
        call    rbg
        movzx   ax, al
        mov     si, s_class
        call    emit_label_dec

        mov     dx, s_catnpc
        mov     ah, 9
        int     21h
        ret

; ============================================================================
;  Data
; ============================================================================
s_usage    db 'CCMON <file.glb> <i> | L <file.glb> | X <file.glb> <i> <dir>',13,10,'$'
s_noopen   db 'cannot open file',13,10,'$'
s_badhdr   db 'not an HLIB container',13,10,'$'
s_notdata  db 'not a DATA library (looks like a TILE/HLIB image container)',13,10,'$'
s_oor      db 'record index out of range',13,10,'$'
s_isid0    db 'member 0 is the id table, not a monster record (indices start at 1)',13,10,'$'
s_ext_mon  db '.MON',0

s_hdr1     db '== MONCHA record: fixed-offset stats ==',13,10,'$'
s_hdr1r    db '== MONCHA record: reconstructed stats ==',13,10,'$'
s_hdrnpc   db '== MONCHA record: character/NPC stats ==',13,10,'$'
s_hdr0     db '== MONCHA record: no stats (name-only) ==',13,10,'$'
s_notype   db 'typeByte: NA (record too short)',13,10,'$'
s_note     db 'note: no reconstruction path validated for this record (see moncha.ts C4.2b+)',13,10,'$'
s_catmon   db 'category: monster',13,10,'$'
s_catnpc   db 'category: npc',13,10,'$'
s_accanon  db 'acSource: canon',13,10,'$'

s_name     db 'name: ',0
s_type     db 'type: ',0
s_xp       db 'xp: ',0
s_str      db 'str: ',0
s_int      db 'int: ',0
s_wis      db 'wis: ',0
s_dex      db 'dex: ',0
s_con      db 'con: ',0
s_cha      db 'cha: ',0
s_thac0    db 'thac0: ',0
s_ac       db 'ac: ',0
s_hd       db 'hitDice: ',0
s_hp       db 'hitPoints: ',0
s_dcount   db 'dmgCount: ',0
s_dsides   db 'dmgSides: ',0
s_dbonus   db 'dmgBonus: ',0
s_sv1      db 'save_ppd: ',0
s_sv2      db 'save_pp: ',0
s_sv3      db 'save_rsw: ',0
s_sv4      db 'save_breath: ',0
s_sv5      db 'save_spell: ',0
s_declen   db 'decLen: ',0
s_total    db 'records: ',0
s_clean    db 'fixedOffsetStats: ',0
s_fullstats db 'fullStats: ',0
s_level    db 'npcLevel: ',0
s_class    db 'npcClass: ',0
s_umberhulk db 'UMBERHULK'

comp_seg    dw 0
dec_seg     dw 0
recon_seg   dw 0
fh          dw 0
ofh         dw 0
verb        db 0
is_id0      db 0

fhdr        times 16 db 0
tag         dw 0
ptrcount    dw 0
ptrs        times PTRCAP dd 0

mem_start   dd 0
mem_end     dd 0
comp_len    dw 0
dec_len     dw 0
decl_len    dw 0      ; §29: the u16be uncompressed length the member declares in its first 2 bytes
decl_bad    db 0      ; 1 = the payload did not expand to [decl_len] (never true for shipped data)
srci        dw 0
dsti        dw 0
runval      db 0

letters     dw 0
nmi         dw 0
scan_off    dw 0
scan_len    dw 0
cur_start   dw 0
ni          dw 0
run_end     dw 0
scan_i      dw 0

hdval       dw 0
abil_base   dw 0
save_off    dw 0
gidx        dw 0
cleancnt    dw 0
extcnt      dw 0
hasstats    db 0
use_fixed_name db 0

blkidx      dw 0
fname       times 128 db 0
dirarg      times 128 db 0
destpath    times 160 db 0
linebuf     times 128 db 0

d32lo       dw 0
d32hi       dw 0
d32buf      times 12 db 0

; ---- extended-reconstruction working state (decode_extended and its
; sub-routines; see the EXTENDED RECONSTRUCTION section above) ----
gseg           dw 0      ; "active" segment for rbg (recon_seg or dec_seg)
glen           dw 0      ; length of the buffer currently in [gseg]
arseg          dw 0      ; build_recon's resulting active segment (recon_seg)
arlen          dw 0      ; build_recon's resulting active length
recon_end      dw 0      ; end offset (scan_off+scan_len) copied verbatim
reconA         dw 0      ; ability offset found on the reconstructed buffer
decA           dw 0      ; ability offset found on the raw dec_seg (dec-path)
have_reconA    db 0      ; 1 if reconA is valid (find_ability_block_g hit)

ext_ok         db 0      ; decode_extended result: 1 = stats decoded
ext_cat        db 0      ; 0 = monster, 1 = npc (valid only if ext_ok=1)
gm_A           dw 0      ; ability anchor offset used by the print_* routines
gm_ac_override db 0      ; 1 = use gm_ac_val instead of the standard AC field
gm_ac_canon    db 0      ; 1 = also print "acSource: canon" (UMBERHULK only)
gm_ac_val      dw 0
gm_dmg_override db 0     ; 1 = use gm_dmg_n/s/b instead of the standard fields
gm_dmg_n       dw 0
gm_dmg_s       dw 0
gm_dmg_b       dw 0

fab_A          dw 0      ; find_ability_block_g cursor
fab_k          dw 0
fab_ok         dw 0
sab_A          dw 0      ; sniff_at_ability_g anchor
scm_A          dw 0      ; sniff_compact_monster_g anchor
sae_A          dw 0      ; sniff_at_ability_except_ac_g anchor
nfv_A          dw 0      ; npc_fields_valid_g anchor

ida_A          dw 0      ; is_monster_default_ability_g state
ida_tens       dw 0
ida_non10cnt   dw 0
ida_non10idx   dw 0
ida_non10val   dw 0
ida_allle10    dw 0
ida_i          dw 0

ira_A          dw 0      ; is_rolled_ability_g state
ira_anyhigh    dw 0
ira_allrange   dw 0
ira_i          dw 0

; generic monchaRLE (rle_decode_g) parameters/state
g_src_seg      dw 0
g_src_off      dw 0
g_src_len      dw 0
g_dst_seg      dw 0
g_dst_off      dw 0
g_dst_cap      dw 0
g_out_len      dw 0
g_si           dw 0
g_send         dw 0
g_di           dw 0
g_dend         dw 0
g_rv           db 0
