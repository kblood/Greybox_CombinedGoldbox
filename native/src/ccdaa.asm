; ============================================================================
;  CCDAA.COM  --  Amiga Gold Box graphics viewer (SSI .DAA containers), VGA 13h.
;
;  The Amiga `.DAA` format is the BIG-ENDIAN, bit-planar, palette-carrying cousin
;  of the DOS `.DAX` format. It holds the superior Amiga CoK/DoK art. This tool
;  mirrors CCGB (the DAX viewer) with the cc VFS roles like CCGBC/CCGB:
;
;     CCDAA L <file.daa>          list members (one line per TOC entry)
;     CCDAA <file.daa> [i]        display member i in VGA mode 13h
;     CCDAA <file.daa> [i] /D     dump RAW (imgw,imgh,indices,768-pal) -> CCDAA.RAW
;                                 for byte-exact oracle diff (no mode switch)
;     CCDAA <file.daa> [i] /T out emit a versioned row-major GBTS resource
;     CCDAA <file.daa> /B id /I out emit a versioned row-major GBIM image
;
;  Faithful port of tools/daa_decode.py (the verified oracle):
;    container : word0 = 2 + N*9 (BE) == data_base; 9-byte BE TOC entries
;                {u8 id, u32 data_offset(BE), u16 raw(BE), u16 comp(BE)}.
;    RLE       : signed-byte run length, byte-order independent (same as DAX).
;    frame     : BE {u16 h, u16 w/8, u16 y, u16 x}, 1 pad byte, 32xBE-u16 0x0RGB
;                palette (x17 -> 8bpp), then 5 CONTIGUOUS bitplanes, word-aligned
;                row stride row_bytes=ceil(width/16)*2, LSB=plane0.
;    8X8D      : CoK 4-plane contiguous tile strip (h=8,w8=1,count byte) -> a
;                width=N*8 x 8 strip under the shared EGA-16 palette.
;    SUBFRAME  : the 6-byte sub-frame INDEX files (SPRIT*/PIC*/big HEAD*) --
;                SOLVED 2026-07 (was flagged "unsolved" before this pass). Each
;                6-byte TOC entry {u8 id, u8 0, u32 subOffset(BE)} points at a
;                compressed body encoded with a DIFFERENT inner RLE than the
;                outer container's (see decode_ars below), decoded in segments:
;                a header+32-colour-palette segment (pix_off bytes) then
;                numDist 5-plane planar "zoom level" frames. We render/dump
;                distance-frame 0 (the primary/closest view) only, matching
;                packages/engine/src/loaders/daa.ts's frameSet.frames.set(...,
;                sf.frames[0]). Reference: docs/daa-format.md §1b,
;                docs/engine/research/subframe-format.md, tools/subframe_decode.py.
;
;  Still unsolved (flagged, cleanly skipped, exactly as the oracle): word0==0
;  pointer/globals files; 8X8D block 201 (all-zero -> hdr 0,0 -> "complex");
;  a handful of CPIC1/HEAD1 sub-frame entries with implausible/non-chaining
;  headers (also routed to the "complex" message -- see probe_subframe).
;
;  Spec: docs/daa-format.md.  Assemble: nasm -f bin ccdaa.asm -o ccdaa.com
;                                       (see ../build.ps1 -Target ccdaa)
; ============================================================================
        cpu     386
        bits    16
        org     100h

ENTRY_SZ    equ 9              ; 9-byte BE TOC entry
FRAME_HDR   equ 8+1+64         ; 73: hdr(8)+pad(1)+palette(64) -> pixel data
NUM_PLANES  equ 5
PAL_COLORS  equ 32

; --- 6-byte sub-frame index (SPRIT/PIC/HEAD) constants ----------------------
SUBFRAME_PEEK   equ 96         ; generous fixed peek budget to read header fields
SUBFRAME_PALOFF equ 11         ; palette offset within the decompressed header
MAX_PLANE_SIZE  equ 4096       ; sanity cap on row_bytes*height (real files: 1056)

start:
        cld
        mov     sp, stacktop
        mov     byte [dumpmode], 0
        mov     byte [tilemode], 0
        mov     byte [idmode], 0
        mov     byte [listmode], 0
        mov     byte [is_index], 0
        mov     byte [outname], 0
        mov     byte [gbts_flags], 3     ; row-major + 32 colours unless 8X8D
        mov     byte [fname], 0
        mov     word [blkidx], 0
        call    parse_args
        cmp     byte [fname], 0
        je      .usage

        ; decode segments live above our own 64 KB segment:
        ;   raw_seg = cs+0x1000  (decompressed block bytes)
        ;   img_seg = cs+0x3000  (expanded 8bpp indices; strips can be 560 wide)
        mov     ax, cs
        add     ax, 1000h
        mov     [raw_seg], ax
        add     ax, 2000h
        mov     [img_seg], ax

        ; open
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .noopen
        mov     [fh], ax

        call    seek0

        ; --- container header: word0 (BIG-ENDIAN) ----------------------------
        call    getw_be
        mov     [word0], ax
        cmp     ax, 11
        jb      .badfmt
        mov     [data_base], ax     ; DAA: data_base == word0
        sub     ax, 2
        mov     [body], ax

        ; Try the 9-byte block TOC: body % 9 == 0 AND chain validates.
        mov     ax, [body]
        xor     dx, dx
        mov     bx, ENTRY_SZ
        div     bx
        or      dx, dx
        jnz     .try_index
        mov     [entcount], ax
        mov     cx, [body]
        cmp     cx, TOC_MAX
        ja      .try_index
        mov     di, toc
.rt:
        jcxz    .toc_done
        call    getb
        mov     [di], al
        inc     di
        dec     cx
        jmp     .rt
.toc_done:
        call    filesize
        mov     [fsz_lo], ax
        mov     [fsz_hi], dx
        call    validate_chain
        or      al, al
        jz      .try_index
        mov     byte [is_index], 0
        jmp     .have_toc

.try_index:
        ; 6-byte sub-frame index family (SPRIT/PIC/HEAD): list-only.
        mov     ax, [body]
        xor     dx, dx
        mov     bx, 6
        div     bx
        or      dx, dx
        jnz     .badfmt
        mov     [entcount], ax
        mov     byte [is_index], 1
        mov     ax, 2               ; reseek past word0, refill the TOC bytes
        xor     dx, dx
        call    seek_set
        mov     cx, [body]
        cmp     cx, TOC_MAX
        ja      .badfmt
        mov     di, toc
.rti:
        jcxz    .have_toc
        call    getb
        mov     [di], al
        inc     di
        dec     cx
        jmp     .rti

.have_toc:
        cmp     byte [listmode], 0
        je      .notlist
        call    do_list
        call    closefh
        mov     ax, 4C00h
        int     21h
.notlist:
        cmp     byte [is_index], 0
        jne     .isindex

        ; --- select block index ---------------------------------------------
        cmp     byte [idmode], 0
        je      .index_ready
        xor     bx, bx
.find_id:
        cmp     bx, [entcount]
        jae     .badidx
        mov     ax, bx
        mov     cx, ENTRY_SZ
        mul     cx
        mov     si, ax
        mov     al, [wanted_id]
        cmp     byte [toc+si], al
        je      .found_id
        inc     bx
        jmp     .find_id
.found_id:
        mov     [blkidx], bx
.index_ready:
        mov     ax, [blkidx]
        cmp     ax, [entcount]
        jae     .badidx
        mov     bx, ENTRY_SZ
        mul     bx
        mov     si, ax
        add     si, toc             ; si -> 9-byte BE entry
        mov     al, [si]
        mov     [selected_id], al
        ; raw (BE u16 @ si+5)
        mov     ah, [si+5]
        mov     al, [si+6]
        mov     [raw_size], ax
        ; comp (BE u16 @ si+7)
        mov     ah, [si+7]
        mov     al, [si+8]
        mov     [comp_size], ax
        ; data_offset BE u32 @ si+1 -> dxhi:axlo
        mov     ah, [si+1]
        mov     al, [si+2]
        mov     dx, ax              ; high word
        mov     ah, [si+3]
        mov     al, [si+4]          ; ax = low word
        add     ax, [data_base]
        adc     dx, 0
        call    seek_set

        ; --- RLE-decompress -> raw_seg ---------------------------------------
        mov     ax, [raw_seg]
        mov     es, ax
        call    decode_rle

        ; --- classify: 8X8D tile strip? else standard frame ------------------
        call    try_8x8d
        or      al, al
        jnz     .have_img

        ; --- standard 5-plane frame -----------------------------------------
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     ah, [0]             ; height BE
        mov     al, [1]
        mov     bx, ax
        mov     ah, [2]             ; width_div8 BE
        mov     al, [3]
        mov     cx, ax
        pop     ds
        mov     [imgh], bx
        or      bx, bx
        jz      .complex
        or      cx, cx
        jz      .complex
        cmp     cx, 256
        ja      .complex
        cmp     bx, 2048
        ja      .complex
        shl     cx, 3               ; width = w/8 * 8
        mov     [imgw], cx
        call    calc_rowbytes       ; -> [row_bytes]
        mov     ax, [row_bytes]
        mul     word [imgh]         ; ax = plane_size
        mov     [plane_size], ax
        ; need = plane_size*5 + 73 <= raw_size
        mov     bx, ax
        shl     ax, 2
        add     ax, bx
        add     ax, FRAME_HDR
        cmp     ax, [raw_size]
        ja      .complex
        mov     word [palsrcoff], 9     ; standard frame: palette at raw_seg+9
        call    read_palette32
        mov     word [pixbase], FRAME_HDR ; standard frame: planes start at +73
        call    planar_to_indices
.have_img:
        call    closefh
        cmp     byte [dumpmode], 3
        jne     .not_image_dump
        call    write_gbim
        jc      .complex
        mov     ax, 4C00h
        int     21h
.not_image_dump:
        cmp     byte [dumpmode], 2
        jne     .not_tile_dump
        call    write_gbts
        jc      .complex
        mov     ax, 4C00h
        int     21h
.not_tile_dump:
        cmp     byte [dumpmode], 0
        jne     .dump
        cmp     word [imgw], 320
        ja      .toobig
        cmp     word [imgh], 200
        ja      .toobig
        call    show_image
        mov     ax, 4C00h
        int     21h
.dump:
        call    write_raw
        mov     ax, 4C00h
        int     21h

.usage:
        mov     si, s_usage
        jmp     .die
.noopen:
        mov     si, s_noopen
        jmp     .die
.badfmt:
        call    closefh
        mov     si, s_badfmt
        jmp     .die
.badidx:
        call    closefh
        mov     si, s_badidx
        jmp     .die
.isindex:
        ; --- select 6-byte sub-frame entry, decode distance-frame 0 ----------
        mov     ax, [blkidx]
        cmp     ax, [entcount]
        jae     .badidx
        mov     bx, 6
        mul     bx
        mov     si, ax
        add     si, toc             ; si -> 6-byte entry {id, 0, u32 BE subOffset}
        call    decode_subframe
        or      al, al
        jz      .complex
        jmp     .have_img
.complex:
        call    closefh
        mov     si, s_complex
        jmp     .die
.toobig:
        mov     si, s_toobig
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
;  Signed-byte RLE: file (getb) -> es:0, producing raw_size bytes.
; ============================================================================
decode_rle:
        xor     di, di
.loop:
        mov     ax, di
        cmp     ax, [raw_size]
        jae     .done
        call    getb
        cmp     al, 80h
        jae     .repeat
        movzx   cx, al
        inc     cx
.lit:
        call    getb
        mov     [es:di], al
        inc     di
        loop    .lit
        jmp     .loop
.repeat:
        neg     al                  ; 256 - c
        movzx   cx, al
        call    getb
        mov     ah, al
.rep:
        mov     [es:di], ah
        inc     di
        loop    .rep
        jmp     .loop
.done:
        ret

; ============================================================================
;  decode_ars: the 6-byte-index SPRIT/PIC/HEAD sub-frame's INNER "Amiga sprite"
;  RLE -- a DISTINCT signed-byte scheme from decode_rle above (the outer
;  container's RLE); their 0x80 opcode means something different in each (the
;  outer scheme repeats a byte 128 times, the inner scheme is a no-op). Ported
;  from rleAmigaSprite() in packages/engine/src/loaders/daa.ts (== hunk 88 of
;  the Amiga CoK 'game' 68000 executable); see docs/daa-format.md §1b.
;
;    read control byte c:
;      c <= 0x7f          : copy next (c + 1) literal bytes
;      c == 0x80          : no-op (emits nothing)
;      0x81 <= c <= 0xff  : repeat next single byte ((256 - c) + 1) times
;
;  Reads bytes via getb() (the same buffered file reader decode_rle uses) from
;  wherever the file position currently sits -- callers seek_set() first when a
;  fresh start is required, and simply continue calling decode_ars back-to-back
;  to decode CONSECUTIVE segments off one running stream position (header
;  segment, then each distance frame's planar bitmap). Writes exactly
;  [ars_budget] bytes to es:0 (di always restarts at 0 -- each call targets a
;  fresh segment buffer); the final op may overshoot by up to 127 bytes, same
;  slack the TS/Python oracles allow, so callers size destination buffers with
;  that headroom.
; ============================================================================
decode_ars:
        xor     di, di
.loop:
        mov     ax, di
        cmp     ax, [ars_budget]
        jae     .done
        call    getb
        cmp     al, 80h
        jb      .lit
        je      .noop
        ; 0x81..0xff: repeat next byte ((256-c)+1) times
        neg     al                  ; al = 256-c  (c in 0x81..0xff -> 1..127)
        movzx   cx, al
        inc     cx
        call    getb
        mov     ah, al
.rep:
        mov     [es:di], ah
        inc     di
        loop    .rep
        jmp     .loop
.noop:
        jmp     .loop
.lit:
        movzx   cx, al
        inc     cx                  ; n = c+1 literal bytes
.litc:
        call    getb
        mov     [es:di], al
        inc     di
        loop    .litc
        jmp     .loop
.done:
        ret

; ============================================================================
;  validate_chain: 9-byte TOC offsets must chain by comp_size; last block ends
;  within 4 bytes of EOF. Returns al=1 ok. bp:bx = running 32-bit offset.
; ============================================================================
validate_chain:
        push    si
        mov     cx, [entcount]
        or      cx, cx
        jz      .fail
        mov     si, toc
        xor     bx, bx
        xor     bp, bp
.vl:
        mov     ah, [si+1]          ; data_offset BE u32
        mov     al, [si+2]
        mov     dx, ax              ; high word
        mov     ah, [si+3]
        mov     al, [si+4]          ; ax = low word
        cmp     ax, bx
        jne     .fail
        cmp     dx, bp
        jne     .fail
        mov     ah, [si+7]          ; comp BE u16
        mov     al, [si+8]
        add     bx, ax
        adc     bp, 0
        add     si, ENTRY_SZ
        dec     cx
        jnz     .vl
        ; last_end = data_base + (bp:bx)
        mov     ax, bx
        add     ax, [data_base]
        mov     dx, bp
        adc     dx, 0
        ; diff = filesize - last_end (must be 0..4)
        mov     bx, [fsz_lo]
        mov     bp, [fsz_hi]
        sub     bx, ax
        sbb     bp, dx
        or      bp, bp
        jnz     .fail
        cmp     bx, 4
        ja      .fail
        mov     al, 1
        jmp     .done
.fail:
        xor     al, al
.done:
        pop     si
        ret

; ============================================================================
;  try_8x8d: CoK 8X8D strip detection + decode. al=1 if matched.
;  raw header {h=8,w8=1}, raw[8]=N tile count, then 4 contiguous planes.
; ============================================================================
try_8x8d:
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     ah, [0]
        mov     al, [1]
        mov     bx, ax              ; h
        mov     ah, [2]
        mov     al, [3]
        mov     cx, ax              ; w8
        movzx   dx, byte [8]        ; N
        pop     ds
        cmp     bx, 8
        jne     .no
        cmp     cx, 1
        jne     .no
        or      dx, dx
        jz      .no
        mov     [tilecnt], dx
        mov     byte [gbts_flags], 1     ; row-major + shared EGA-16 palette
        ; row_bytes = ceil(N*8/16)*2
        mov     ax, dx
        shl     ax, 3
        add     ax, 15
        shr     ax, 4
        shl     ax, 1
        mov     [row_bytes], ax
        ; plane_size = row_bytes*8
        mov     bx, ax
        shl     bx, 3
        mov     [plane_size], bx
        ; needed = 9 + 4*plane_size <= raw_size
        mov     ax, bx
        shl     ax, 2
        add     ax, 9
        cmp     ax, [raw_size]
        ja      .no
        mov     ax, [tilecnt]
        shl     ax, 3
        mov     [imgw], ax          ; width = N*8
        mov     word [imgh], 8
        call    decode_8x8d
        call    load_ega_pal
        mov     al, 1
        ret
.no:
        xor     al, al
        ret

; decode_8x8d: build width=N*8 x 8 index image in img_seg from 4 planes.
;   plane base p at raw_seg: 9 + p*plane_size
;   pixel(t,x,y): index = sum_p bit(plane[p][y*row_bytes + t], 7-x) << p
;   dest offset  = y*width + t*8 + x
decode_8x8d:
        push    ds
        mov     ax, [img_seg]
        mov     es, ax
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     word [cs:cy], 0
.yloop:
        mov     ax, [cs:cy]
        cmp     ax, 8
        jae     .ydone
        mov     word [cs:ct], 0
.tloop:
        mov     ax, [cs:ct]
        cmp     ax, [cs:tilecnt]
        jae     .tdone
        ; base = 9 + y*row_bytes + t  (offset of plane-0 byte for this tile/row)
        mov     ax, [cs:cy]
        mul     word [cs:row_bytes]
        add     ax, [cs:ct]
        add     ax, 9
        mov     [cs:srcbase], ax
        mov     word [cs:cx_], 0
.xloop:
        mov     ax, [cs:cx_]
        cmp     ax, 8
        jae     .xdone
        ; bit = 7 - x
        mov     cx, 7
        sub     cx, ax              ; cl = shift
        ; accumulate 4 planes
        mov     si, [cs:srcbase]
        xor     bl, bl              ; index
        mov     bh, 0               ; plane counter loop via di
        mov     di, 4
        xor     dh, dh              ; plane bit position (0..3)
.ploop:
        mov     al, [si]            ; plane byte (ds=raw_seg)
        shr     al, cl
        and     al, 1
        ; shift left by dh
        mov     dl, dh
        push    cx
        mov     cl, dl
        shl     al, cl
        pop     cx
        or      bl, al
        add     si, [cs:plane_size]
        inc     dh
        dec     di
        jnz     .ploop
        ; dest = y*width + t*8 + x
        mov     ax, [cs:cy]
        mul     word [cs:imgw]      ; ax = y*width
        mov     dx, [cs:ct]
        shl     dx, 3
        add     ax, dx
        add     ax, [cs:cx_]
        mov     di, ax
        mov     [es:di], bl
        inc     word [cs:cx_]
        jmp     .xloop
.xdone:
        inc     word [cs:ct]
        jmp     .tloop
.tdone:
        inc     word [cs:cy]
        jmp     .yloop
.ydone:
        pop     ds
        ret

; ============================================================================
;  probe_subframe: si -> 6-byte sub-frame TOC entry {id, 0, u32 BE subOffset}.
;  Seeks to the entry's compressed body and peek-decodes (decode_ars, budget
;  SUBFRAME_PEEK) its FIXED header fields -- mirrors decodeAmigaSubEntry's
;  first "peek" pass in daa.ts. Does NOT touch si (getb/decode_ars/seek_set
;  never use si/di in a way that survives across calls -- verified: only
;  ax/bx/cx/dx and a transient ds swap), so callers may keep si live across
;  the call for a following [si] read.
;
;  On success (CF=0): [imgw]/[imgh] = canvas size, [subnd] = numDist (frame
;  count), [subpixoff] = header-segment length in bytes, [subf_off_lo/hi] =
;  this entry's absolute file start offset (so a real re-decode can reseek
;  there). On failure (CF=1, implausible geometry): none of the above should
;  be trusted.
;
;  Sanity bounds mirror daa.ts's decodeAmigaSubEntry (widthDiv8 1..64, height
;  1..256, numDist <=16); numDist==0 is additionally rejected here (nothing to
;  render for a single-frame viewer, even though the TS side tolerates it as
;  an empty frame list).
; ============================================================================
probe_subframe:
        push    bx
        push    cx
        push    dx
        ; abs file offset = data_base + subOffset (BE u32 @ si+2)
        mov     ah, [si+2]
        mov     al, [si+3]
        mov     dx, ax              ; high word
        mov     ah, [si+4]
        mov     al, [si+5]          ; ax = low word
        add     ax, [data_base]
        adc     dx, 0
        mov     [subf_off_lo], ax
        mov     [subf_off_hi], dx
        call    seek_set
        mov     ax, [raw_seg]
        mov     es, ax
        mov     word [ars_budget], SUBFRAME_PEEK
        call    decode_ars
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     al, [0]             ; pix_off (byte)
        mov     [cs:subpixoff], al  ; ds=raw_seg here -- must write via cs:
        mov     ah, [1]             ; height (BE u16)
        mov     al, [2]
        mov     bx, ax
        mov     ah, [3]             ; width_div8 (BE u16)
        mov     al, [4]
        mov     cx, ax
        mov     al, [10]            ; numDist -- offset 10, NOT 9 (unused flag byte)
        mov     [cs:subnd], al      ; ds=raw_seg here -- must write via cs:
        pop     ds
        mov     [imgh], bx
        or      bx, bx
        jz      .bad
        cmp     bx, 256
        ja      .bad
        or      cx, cx
        jz      .bad
        cmp     cx, 64
        ja      .bad
        movzx   ax, byte [subnd]
        or      ax, ax
        jz      .bad
        cmp     ax, 16
        ja      .bad
        shl     cx, 3               ; width = widthDiv8 * 8
        mov     [imgw], cx
        clc
        jmp     .pdone
.bad:
        stc
.pdone:
        pop     dx
        pop     cx
        pop     bx
        ret

; ============================================================================
;  decode_subframe: si -> 6-byte sub-frame TOC entry. Full decode of distance-
;  frame 0 (the primary/closest zoom level) into img_seg + pal, mirroring
;  decodeAmigaSubEntry() in daa.ts end to end:
;    1. probe_subframe (peek header -> geometry, reject implausible headers)
;    2. row_bytes/plane_size/frame_size from the geometry, capped at
;       MAX_PLANE_SIZE to stay clear of 16-bit overflow / segment limits
;    3. reseek to the entry start; re-decode_ars the header for REAL at exactly
;       [subpixoff] bytes, so the stream position lands precisely on frame 0's
;       planar bitmap (a single flat/peek decode can't be sliced -- a
;       completing RLE op can straddle the cut point)
;    4. read the 32-colour palette at header offset SUBFRAME_PALOFF
;    5. decode_ars exactly one frame_size segment (frame 0) and expand its
;       5-contiguous-plane bitmap via the shared planar_to_indices ([pixbase]=0)
;  Returns al=1 (success, imgw/imgh/pal/img_seg populated) or al=0 (implausible
;  header / oversized geometry -- caller falls back to the "complex" message).
; ============================================================================
decode_subframe:
        call    probe_subframe
        jc      .fail
        call    calc_rowbytes
        mov     ax, [row_bytes]
        mul     word [imgh]
        mov     [plane_size], ax
        cmp     ax, MAX_PLANE_SIZE
        ja      .fail
        mov     bx, ax
        shl     ax, 2
        add     ax, bx              ; frame_size = plane_size * 5
        mov     [frame_size], ax
        ; reseek to entry start; re-decode the header for real (exact pixOff)
        mov     ax, [subf_off_lo]
        mov     dx, [subf_off_hi]
        call    seek_set
        mov     ax, [raw_seg]
        mov     es, ax
        movzx   ax, byte [subpixoff]
        mov     [ars_budget], ax
        call    decode_ars
        mov     word [palsrcoff], SUBFRAME_PALOFF
        call    read_palette32
        ; decode distance-frame 0's planar bitmap (continues from current pos)
        mov     ax, [raw_seg]
        mov     es, ax
        mov     ax, [frame_size]
        mov     [ars_budget], ax
        call    decode_ars
        mov     word [pixbase], 0
        call    planar_to_indices
        mov     al, 1
        ret
.fail:
        xor     al, al
        ret

; ============================================================================
;  calc_rowbytes: row_bytes = ceil(imgw/16)*2 -> [row_bytes]
; ============================================================================
calc_rowbytes:
        mov     ax, [imgw]
        add     ax, 15
        shr     ax, 4
        shl     ax, 1
        mov     [row_bytes], ax
        ret

; ============================================================================
;  read_palette32: 32 BE u16 0x0RGB at raw_seg[palsrcoff] -> pal (768 bytes,
;  x17). Tail (colors 32..255) zeroed. [palsrcoff] = 9 for a standard frame's
;  embedded palette, SUBFRAME_PALOFF (11) for a decoded sub-frame header --
;  callers set it immediately before calling (see decode_subframe).
; ============================================================================
read_palette32:
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax              ; ds = raw block (palette source)
        mov     ax, cs
        mov     es, ax              ; es = our seg (pal dest)
        mov     si, [cs:palsrcoff]  ; palette offset in frame/header
        mov     di, pal
        mov     cx, PAL_COLORS
.pl:
        mov     bh, [si]            ; BE high byte = 0x.R  (top nibble unused, low=R)
        mov     bl, [si+1]          ; BE low byte  = 0xGB
        add     si, 2
        ; r = (high & 0x0F) ; g = (low >> 4) ; b = (low & 0x0F)
        mov     al, bh
        and     al, 0Fh
        call    x17
        mov     [es:di], al
        inc     di
        mov     al, bl
        shr     al, 4
        call    x17
        mov     [es:di], al
        inc     di
        mov     al, bl
        and     al, 0Fh
        call    x17
        mov     [es:di], al
        inc     di
        loop    .pl
        ; zero remaining (768 - 96) bytes
        mov     cx, 768 - PAL_COLORS*3
        xor     al, al
        rep     stosb
        pop     ds
        ret

; x17: al = al*17 (== (al<<4)|al). al in 0..15.
x17:
        mov     ah, al
        shl     al, 4
        or      al, ah
        ret

; ============================================================================
;  planar_to_indices: 5 contiguous planes (raw_seg : [pixbase]) -> img_seg
;  indices. row_bytes/plane_size already set. imgw/imgh set. [pixbase] = 73
;  (FRAME_HDR) for a standard frame, 0 for a decoded sub-frame distance-frame
;  buffer (whose planar bitmap starts at the top of its own fresh raw_seg
;  segment) -- callers set it immediately before calling (see decode_subframe).
;    byte_i = y*row_bytes + (x>>3) ; bit = 7-(x&7)
;    idx = sum_p bit(plane[p][byte_i], bit) << p ; plane base = p*plane_size
; ============================================================================
planar_to_indices:
        push    ds
        mov     ax, [img_seg]
        mov     es, ax
        mov     ax, [raw_seg]
        mov     ds, ax
        xor     di, di              ; dest index
        mov     word [cs:cy], 0
.yloop:
        mov     ax, [cs:cy]
        cmp     ax, [cs:imgh]
        jae     .ydone
        ; rbase = y*row_bytes  (+ [pixbase] for source)
        mov     ax, [cs:cy]
        mul     word [cs:row_bytes]
        add     ax, [cs:pixbase]
        mov     [cs:srcbase], ax
        mov     word [cs:cx_], 0
.xloop:
        mov     ax, [cs:cx_]
        cmp     ax, [cs:imgw]
        jae     .xdone
        ; byte offset within row = x>>3 ; bit = 7-(x&7)
        mov     bx, ax
        mov     cx, ax
        and     cx, 7
        mov     dx, 7
        sub     dx, cx              ; dl = bit shift
        shr     bx, 3               ; byte index within row
        add     bx, [cs:srcbase]    ; bx = base byte offset for plane 0
        ; accumulate 5 planes
        mov     si, bx
        xor     bl, bl              ; index accumulator
        mov     di, NUM_PLANES
        xor     dh, dh              ; plane number (0..4)
.ploop:
        mov     al, [si]
        mov     cl, dl              ; bit shift (7-(x&7))
        shr     al, cl
        and     al, 1
        mov     cl, dh              ; left-shift by plane number
        shl     al, cl
        or      bl, al
        add     si, [cs:plane_size]
        inc     dh
        dec     di
        jnz     .ploop
        ; write to dest; recompute dest di = y*imgw + x
        mov     ax, [cs:cy]
        mul     word [cs:imgw]
        add     ax, [cs:cx_]
        mov     di, ax
        mov     [es:di], bl
        inc     word [cs:cx_]
        jmp     .xloop
.xdone:
        inc     word [cs:cy]
        jmp     .yloop
.ydone:
        pop     ds
        ret

; ============================================================================
;  load_ega_pal: fixed EGA-16 -> pal, zero the rest. (8X8D strips.)
; ============================================================================
load_ega_pal:
        mov     ax, cs
        mov     ds, ax
        mov     es, ax
        mov     si, ega_pal
        mov     di, pal
        mov     cx, 16*3
        rep     movsb
        mov     cx, 768 - 16*3
        xor     al, al
        rep     stosb
        ret

; ============================================================================
;  do_list: print one line per TOC entry. 9-byte: "<raw> Bnnnn.DAI" (DAI = Amiga
;  DAA image, so cc's F3 maps it to CCDAA, not the DOS-only CCGB). 6-byte index:
;  "<w>x<h> x<numDist> Bnnnn.DAI" via probe_subframe (geometry only -- no
;  pixel/palette decode, so listing stays cheap), or "Bnnnn SUBFRAME
;  (bad/implausible header)" for the handful of entries whose header doesn't
;  pass the same sanity bounds decode_subframe enforces.  Stays text-mode.
; ============================================================================
do_list:
        cmp     byte [is_index], 0
        jne     .listidx
        mov     cx, [entcount]
        or      cx, cx
        jz      .done
        mov     si, toc
.bl:
        push    cx
        push    si
        ; raw (BE u16 @ si+5)
        mov     ah, [si+5]
        mov     al, [si+6]
        ; print raw decimal, then a space
        call    print_dec
        mov     al, ' '
        call    putc
        ; member name: Bnnnn.  (nnnn = block_id from si+0)
        mov     al, 'B'
        call    putc
        movzx   ax, byte [si]
        call    print_dec
        mov     al, '.'
        call    putc
        ; ext: DAI (DAA-image) so cc's F3 routes to CCDAA, not CCGB (which only
        ; decodes DOS .DAX, not Amiga big-endian planar frames).
        mov     al, 'D'
        call    putc
        mov     al, 'A'
        call    putc
        mov     al, 'I'
        call    putc
        call    crlf
        pop     si
        pop     cx
        add     si, ENTRY_SZ
        dec     cx
        jnz     .bl
.done:
        ret
.listidx:
        ; 6-byte sub-frame index: probe each entry's header (geometry only,
        ; SOLVED -- see probe_subframe/decode_subframe) and print its size.
        mov     cx, [entcount]
        or      cx, cx
        jz      .idone
        mov     si, toc
.il:
        push    cx
        push    si
        call    probe_subframe      ; si preserved (verified: never touched)
        jc      .ilbad
        movzx   ax, byte [si]       ; blockId -- read BEFORE print_dec/putc/puts
        mov     [tmpid], ax         ; clobber si (print_dec ends si=dec_buf ptr)
        mov     ax, [imgw]
        call    print_dec
        mov     al, 'x'
        call    putc
        mov     ax, [imgh]
        call    print_dec
        mov     al, ' '
        call    putc
        mov     al, 'x'
        call    putc
        movzx   ax, byte [subnd]
        call    print_dec
        mov     al, ' '
        call    putc
        mov     al, 'B'
        call    putc
        mov     ax, [tmpid]
        call    print_dec
        mov     al, '.'
        call    putc
        mov     al, 'D'
        call    putc
        mov     al, 'A'
        call    putc
        mov     al, 'I'
        call    putc
        call    crlf
        jmp     .ilcont
.ilbad:
        movzx   ax, byte [si]
        mov     [tmpid], ax
        mov     al, 'B'
        call    putc
        mov     ax, [tmpid]
        call    print_dec
        mov     si, s_subfr
        call    puts
.ilcont:
        pop     si
        pop     cx
        add     si, 6
        dec     cx
        jnz     .il
.idone:
        ret

; print AX as unsigned decimal (no leading zeros). Uses dec_buf.
print_dec:
        mov     bx, 10
        mov     di, dec_buf + 7
        mov     byte [di], 0
        dec     di
.pd:
        xor     dx, dx
        div     bx                  ; ax/10
        add     dl, '0'
        mov     [di], dl
        dec     di
        or      ax, ax
        jnz     .pd
        inc     di
        mov     si, di
        call    puts
        ret

putc:
        mov     [onec], al
        mov     ah, 40h
        mov     bx, 1
        mov     cx, 1
        mov     dx, onec
        int     21h
        ret

crlf:
        mov     si, s_crlf
        call    puts
        ret

; ============================================================================
;  Buffered input + seeks (as CCGB), but getw is BIG-ENDIAN here.
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

filesize:
        mov     bx, [fh]
        mov     ax, 4202h           ; seek end
        xor     cx, cx
        xor     dx, dx
        int     21h                 ; dx:ax = size
        push    dx
        push    ax
        ; restore position to start of data via a refill-forcing seek0-like reset
        mov     word [iolen], 0
        mov     word [iopos], 0
        pop     ax
        pop     dx
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

; getb -> al, CF=1 on EOF. Preserves bx,cx,dx.
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

; getw_be -> ax = big-endian word (first byte = high)
getw_be:
        call    getb
        mov     bh, al              ; high byte
        call    getb
        mov     bl, al              ; low byte
        mov     ax, bx
        ret

; ============================================================================
;  write_raw: CCDAA.RAW = imgw(2 LE) imgh(2 LE) indices(imgw*imgh) pal(768).
; ============================================================================
write_raw:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_rawname
        cmp     byte [outname], 0
        je      .create
        mov     dx, outname
.create:
        int     21h
        jc      .ret
        mov     [ofh], ax
        mov     ax, [imgw]
        mov     [w16], ax
        mov     ax, [imgh]
        mov     [h16], ax
        mov     bx, [ofh]
        mov     ah, 40h
        mov     cx, 4
        mov     dx, w16
        int     21h
        ; indices from img_seg
        mov     ax, [imgw]
        mul     word [imgh]
        mov     cx, ax
        push    ds
        mov     ax, [img_seg]
        mov     ds, ax
        xor     dx, dx
        mov     bx, [cs:ofh]
        mov     ah, 40h
        int     21h
        pop     ds
        ; palette
        mov     bx, [ofh]
        mov     ah, 40h
        mov     cx, 768
        mov     dx, pal
        int     21h
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

; GBTS v1: magic, version, logical block id, row-major flag, tile count,
; strip width, then row-major indices and a full 768-byte RGB palette.
write_gbts:
        cmp     word [imgh], 8
        jne     .err
        mov     ax, [imgw]
        test    ax, 7
        jnz     .err
        shr     ax, 3
        or      ax, ax
        jz      .err
        cmp     ax, 512
        ja      .err
        mov     [tilecnt], ax
        mov     [gbts_count], ax
        mov     ax, [imgw]
        mov     [gbts_width], ax
        mov     al, [selected_id]
        mov     [gbts_block], al

        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, outname
        cmp     byte [outname], 0
        jne     .create
        mov     dx, s_gbtsname
.create:
        int     21h
        jc      .err
        mov     [ofh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, 12
        mov     dx, gbts_header
        int     21h
        mov     ax, [tilecnt]
        shl     ax, 6
        mov     cx, ax
        push    ds
        mov     ds, [cs:img_seg]
        xor     dx, dx
        mov     bx, [cs:ofh]
        mov     ah, 40h
        int     21h
        pop     ds
        mov     bx, [ofh]
        mov     ah, 40h
        mov     cx, 768
        mov     dx, pal
        int     21h
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.err:
        stc
        ret

; GBIM v1: magic, version, logical id, row-major+32-colour flags, width,
; height, then width*height indices and a full 768-byte RGB palette.
write_gbim:
        mov     ax, [imgw]
        or      ax, ax
        jz      .err
        mul     word [imgh]
        or      dx, dx
        jnz     .err
        or      ax, ax
        jz      .err
        mov     [gbim_npix], ax
        mov     ax, [imgw]
        mov     [gbim_width], ax
        mov     ax, [imgh]
        mov     [gbim_height], ax
        xor     ax, ax
        mov     al, [selected_id]
        mov     [gbim_block], ax
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, outname
        cmp     byte [outname], 0
        jne     .create
        mov     dx, s_gbimname
.create:
        int     21h
        jc      .err
        mov     [ofh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, 14
        mov     dx, gbim_header
        int     21h
        mov     cx, [gbim_npix]
        push    ds
        mov     ds, [cs:img_seg]
        xor     dx, dx
        mov     bx, [cs:ofh]
        mov     ah, 40h
        int     21h
        pop     ds
        mov     bx, [ofh]
        mov     ah, 40h
        mov     cx, 768
        mov     dx, pal
        int     21h
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.err:
        stc
        ret

; ============================================================================
;  show_image: VGA mode 13h, load DAC, blit centred, wait, restore.
; ============================================================================
show_image:
        mov     ax, 0013h
        int     10h
        mov     dx, 3C8h
        xor     al, al
        out     dx, al
        mov     dx, 3C9h
        mov     si, pal
        mov     cx, 768
.dac:
        lodsb
        shr     al, 2
        out     dx, al
        loop    .dac
        push    ds
        mov     ax, 0A000h
        mov     es, ax
        mov     ax, 200
        sub     ax, [imgh]
        shr     ax, 1
        mov     bx, 320
        mul     bx
        mov     cx, 320
        sub     cx, [imgw]
        shr     cx, 1
        add     ax, cx
        mov     di, ax
        mov     bp, [imgw]
        mov     ax, [img_seg]
        mov     ds, ax
        xor     si, si
        xor     bx, bx
.row:
        cmp     bx, [cs:imgh]
        jae     .blit_done
        mov     cx, bp
        push    si
        push    di
        rep     movsb
        pop     di
        pop     si
        add     si, bp
        add     di, 320
        inc     bx
        jmp     .row
.blit_done:
        pop     ds
.drain:
        mov     ah, 1
        int     16h
        jz      .waitkey
        xor     ah, ah
        int     16h
        jmp     .drain
.waitkey:
        xor     ax, ax
        int     16h
        mov     ax, 0003h
        int     10h
        ret

; ============================================================================
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
        jcxz    .z
        mov     ah, 40h
        mov     bx, 1
        mov     dx, si
        int     21h
.z:
        ret

; ----------------------------------------------------------------------------
; parse_args: [ L ] <file> [ index | /B id ] and trailing dump mode
;   "L <file>"           -> listmode
;   "<file> [n] [/D]"    -> view / dump
parse_args:
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
        call    skip_sp
        ; leading "L" (list) ? single letter L followed by space.
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'L'
        jne     .notL
        mov     al, [si+1]
        cmp     al, ' '
        jne     .notL
        mov     byte [listmode], 1
        inc     si
        call    skip_sp
.notL:
.name:
        mov     di, fname
.cp:
        mov     al, [si]
        or      al, al
        jz      .fin
        cmp     al, ' '
        je      .num
        mov     [di], al
        inc     si
        inc     di
        jmp     .cp
.num:
        mov     byte [di], 0
        call    skip_sp
        ; optional decimal index
        xor     bx, bx
        mov     byte [hasnum], 0
.dl:
        mov     al, [si]
        cmp     al, '0'
        jb      .dfin
        cmp     al, '9'
        ja      .dfin
        mov     byte [hasnum], 1
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
        jmp     .dl
.dfin:
        mov     [blkidx], bx
        call    skip_sp
        cmp     byte [si], '/'
        jne     .mode
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'B'
        jne     .mode
        add     si, 2
        call    skip_sp
        xor     bx, bx
.bdl:
        mov     al, [si]
        cmp     al, '0'
        jb      .bdone
        cmp     al, '9'
        ja      .bdone
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
        jmp     .bdl
.bdone:
        cmp     bx, 255
        ja      .done
        mov     byte [idmode], 1
        mov     [wanted_id], bl
        call    skip_sp
.mode:
        ; optional /D after the index
        cmp     byte [si], '/'
        jne     .done
        inc     si
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'D'
        je      .set_dump
        cmp     al, 'T'
        je      .set_tile
        cmp     al, 'I'
        jne     .done
        mov     byte [dumpmode], 3
        jmp     .after_mode
.set_tile:
        mov     byte [tilemode], 1
        mov     byte [dumpmode], 2
        jmp     .after_mode
.set_dump:
        mov     byte [dumpmode], 1
.after_mode:
        inc     si
        call    skip_sp
        cmp     byte [si], 0
        je      .done
        cmp     byte [si], 13
        je      .done
        mov     di, outname
.ocp:
        mov     al, [si]
        or      al, al
        jz      .oend
        cmp     al, 13
        je      .oend
        cmp     al, ' '
        je      .oend
        mov     [di], al
        inc     di
        inc     si
        jmp     .ocp
.oend:
        mov     byte [di], 0
.done:
        ret
.fin:
        mov     byte [di], 0
        ret

skip_sp:
        cmp     byte [si], ' '
        jne     .d
        inc     si
        jmp     skip_sp
.d:     ret

; ============================================================================
;  Fixed EGA-16 palette (RGB 0..255).  docs/dax-format.md §5
ega_pal:
        db 000h,000h,000h
        db 000h,000h,0AAh
        db 000h,0AAh,000h
        db 000h,0AAh,0AAh
        db 0AAh,000h,000h
        db 0AAh,000h,0AAh
        db 0AAh,055h,000h
        db 0AAh,0AAh,0AAh
        db 055h,055h,055h
        db 055h,055h,0FFh
        db 055h,0FFh,055h
        db 055h,0FFh,0FFh
        db 0FFh,055h,055h
        db 0FFh,055h,0FFh
        db 0FFh,0FFh,055h
        db 0FFh,0FFh,0FFh

s_usage     db 'Usage: CCDAA L <f.daa> | CCDAA <f.daa> [i|/B id] [/D out|/T out|/I out]',0Dh,0Ah,0
s_noopen    db 'CCDAA: cannot open file',0Dh,0Ah,0
s_badfmt    db 'CCDAA: not a DAA container (word0 not /9 or /6)',0Dh,0Ah,0
s_badidx    db 'CCDAA: block index out of range',0Dh,0Ah,0
s_complex   db 'CCDAA: complex/unsupported frame (unsolved variant)',0Dh,0Ah,0
s_toobig    db 'CCDAA: image larger than 320x200 (use /D to dump)',0Dh,0Ah,0
s_subfr     db ' SUBFRAME (bad/implausible header)',0Dh,0Ah,0
s_crlf      db 0Dh,0Ah,0
s_rawname   db 'CCDAA.RAW',0
s_gbtsname  db 'CCDAA.GBT',0
s_gbimname  db 'CCDAA.GBI',0
gbts_header db 'GBTS'
            dw 1
gbts_block  db 0
gbts_flags  db 1                    ; bit 0 row-major, bit 1 32-colour palette
gbts_count  dw 0
gbts_width  dw 0
gbim_header db 'GBIM'
            dw 1
gbim_block  dw 0
            db 3                    ; bit 0 row-major, bit 1 32-colour palette
            db 0
gbim_width  dw 0
gbim_height dw 0

IOBUF_SZ    equ 4096
TOC_MAX     equ 9*1200          ; up to ~1200 entries

; ============================================================================
section .bss
alignb 2
dumpmode    resb 1
tilemode    resb 1
idmode      resb 1
wanted_id   resb 1
listmode    resb 1
is_index    resb 1
hasnum      resb 1
onec        resb 1
fname       resb 128
outname     resb 128
fh          resw 1
ofh         resw 1
raw_seg     resw 1
img_seg     resw 1
word0       resw 1
body        resw 1
entcount    resw 1
data_base   resw 1
blkidx      resw 1
raw_size    resw 1
comp_size   resw 1
imgw        resw 1
imgh        resw 1
row_bytes   resw 1
plane_size  resw 1
tilecnt     resw 1
selected_id resb 1
gbim_npix   resw 1
alignb 2
cy          resw 1
ct          resw 1
cx_         resw 1
srcbase     resw 1
fsz_lo      resw 1
fsz_hi      resw 1
w16         resw 1
h16         resw 1
iopos       resw 1
iolen       resw 1
; --- 6-byte sub-frame index (SPRIT/PIC/HEAD) scratch ------------------------
palsrcoff   resw 1          ; read_palette32 source offset: 9 (frame) / 11 (sub-frame)
pixbase     resw 1          ; planar_to_indices source base: FRAME_HDR (73) / 0
ars_budget  resw 1          ; decode_ars output-byte budget for its next call
frame_size  resw 1          ; plane_size*5 for one distance frame
subf_off_lo resw 1          ; selected sub-frame entry's absolute file offset (lo)
subf_off_hi resw 1          ; ...and (hi)
subpixoff   resb 1          ; header-segment length in bytes (decoded header[0])
subnd       resb 1          ; numDist -- decoded header[10]
tmpid       resw 1          ; do_list scratch: blockId saved across print_dec/puts
alignb 2
dec_buf     resb 8
toc         resb TOC_MAX
pal         resb 768
iobuf       resb IOBUF_SZ
stackspace  resb 1024
stacktop:
