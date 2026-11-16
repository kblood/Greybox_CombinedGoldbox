; ============================================================================
;  CCGB.COM  --  Gold Box graphics viewer (SSI DOS .DAX containers), 256-col VGA.
;
;  A Claude-Commander-style standalone viewer tool (cf. CCIMG/CCHEX). Decodes the
;  Champions/Death Knights of Krynn `.DAX` graphics container: parses the TOC,
;  signed-byte-RLE-decompresses a block, reads the 17-byte standard-frame header,
;  expands the chunky 4bpp pixels (2 px/byte, high nibble = left), and shows them
;  in VGA mode 13h under the fixed EGA-16 palette. This is also the engine's asm
;  asset-load path, grown in a harness we can diff against tools/dax_decode.py.
;
;  Usage:  CCGB <file.dax> [n]      show TOC block index n (default 0) in mode 13h
;          CCGB /D <file.dax> [n]   decode only -> CCGB.RAW  (imgw(2) imgh(2) then
;                                   imgw*imgh index bytes then 768 palette bytes),
;                                   no mode switch — the oracle-diff format.
;          CCGB /G <file.dax> [n]   FONT mode: block n is a flat 1bpp 8x8 glyph
;                                   strip (CoK 8X8D1.DAX block 201 -- no standard
;                                   frame header, oracle: cokFont.ts) -> render
;                                   every stored glyph as a 16-column atlas sheet.
;          CCGB /T <file.dax> [n]   TILE-SHEET mode: block n is a full 8X8D DOS
;                                   tile strip (header h=8,w8=1,count@8; oracle:
;                                   tiles8x8.ts) -> render ALL N tiles as one
;                                   width=N*8 x 8 strip (not just tile 0). Mirrors
;                                   ccdaa.asm's Amiga decode_8x8d, chunky 4bpp.
;          CCGB /D <file.dax> n f   ANIMATED sub-frame: when block n fails the
;                                   standard-frame test it is a §B multi-frame
;                                   picture (SPRIT*/PIC*/BODY*; numFrames + 21-byte
;                                   per-frame headers; dax-complex-subframe.md,
;                                   dax.ts parseAnimated). Picks sub-frame f (0).
;          CCGB /D /X <file> n f    XOR-delta variant for animated PIC* portraits:
;                                   frame 0 verbatim, frames>0 XORed vs frame 0.
;          CCGB /A <file.dax> [n]   show for about three seconds or until a key;
;                                   intended for bounded intro/slideshow playback.
;          CCGB /A /M <file.gbm>    play a bounded GBM1 PC-speaker stream without
;                                   opening a DAX file (music-only intro helper).
;          /G/T/X combine with /D exactly like the standard path (any order,
;          e.g. "CCGB /D /G file.dax 0" dumps the glyph atlas to CCGB.RAW).
;
;  Format spec: docs/dax-format.md.  Helpers (getb/seek/show/dump) follow CCIMG.
;  Assemble:  nasm -f bin cgb.asm -o ccgb.com   (see ../build.ps1 -Target cgb)
; ============================================================================
        cpu     386
        bits    16
        org     100h

ENTRY_SZ    equ 9              ; TOC entry: u8 id, u32 data_off, u16 raw, u16 comp
FRAME_HDR   equ 17             ; standard-frame header length; pixels start here
GLYPH_BYTES equ 8              ; bytes per 8x8 1bpp glyph (font mode; cokFont.ts)
FONT_COLS   equ 16             ; glyph-atlas columns (16*8 = 128 px wide sheet)
FONT_FG     equ 15             ; glyph-atlas foreground index (white)
FONT_BG     equ 0              ; glyph-atlas background index (black)

start:
        cld
        mov     sp, stacktop
        mov     byte [dumpmode], 0
        mov     byte [rawdump], 0
        mov     byte [framemode], 0
        mov     byte [fontmode], 0
        mov     byte [tilesheetmode], 0
        mov     byte [automode], 0
        mov     byte [gbimdump], 0
        mov     byte [blockidmode], 0
        mov     byte [overlaymode], 0
        mov     byte [musicname], 0
        mov     byte [music_valid], 0
        mov     byte [fname], 0
        mov     word [blkidx], 0
        mov     word [frameidx], 0
        mov     byte [doxor], 0
        call    parse_args
        call    scan_music_arg
        call    load_music_optional
        cmp     byte [fname], 0
        jne     .have_name
        cmp     byte [music_valid], 0
        je      .usage
        call    play_music_only
        mov     ax, 4C00h
        int     21h
.have_name:

        ; decode target segments live above our own 64 KB segment:
        ;   raw_seg = cs+0x1000  (decompressed block bytes)
        ;   img_seg = cs+0x2000  (expanded 8bpp indices for display/dump)
        mov     ax, cs
        add     ax, 1000h
        mov     [raw_seg], ax
        add     ax, 1000h
        mov     [img_seg], ax

        ; open
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .noopen
        mov     [fh], ax

        call    seek0               ; rewind + prime the buffered reader

        cmp     byte [framemode], 0 ; /F : input IS a single decompressed frame
        je      .container
        call    read_frame
        jmp     .have_raw
.container:
        ; --- container header: word0 = toc_bytes = entry_count*9 -------------
        call    getw
        mov     [toc_bytes], ax
        or      ax, ax
        jz      .badfmt
        xor     dx, dx              ; ax/9 -> entry_count
        mov     bx, ENTRY_SZ
        div     bx                  ; ax = count, dx = remainder
        or      dx, dx
        jnz     .badfmt             ; word0 not a multiple of 9 -> not DAX
        mov     [entcount], ax
        ; data_base = 2 + toc_bytes
        mov     ax, [toc_bytes]
        add     ax, 2
        mov     [data_base], ax

        ; --- read the whole TOC into `toc` ----------------------------------
        mov     cx, [toc_bytes]
        cmp     cx, TOC_MAX
        ja      .badfmt
        mov     di, toc
.rt:
        jcxz    .toc_done
        call    getb
        mov     [di], al
        inc     di
        dec     cx
        jmp     .rt
.toc_done:

        ; --- select block index or logical block ID -------------------------
        cmp     byte [blockidmode], 0
        je      .select_index
        xor     bx, bx
.find_block_id:
        cmp     bx, [entcount]
        jae     .badidx
        mov     ax, bx
        mov     cx, ENTRY_SZ
        mul     cx
        mov     si, ax
        add     si, toc
        mov     al, [si]
        cmp     al, [blockid]
        je      .id_found
        inc     bx
        jmp     .find_block_id
.id_found:
        mov     [blkidx], bx
.select_index:
        mov     ax, [blkidx]
        cmp     ax, [entcount]
        jae     .badidx
        ; offset into toc = idx*9
        mov     bx, ENTRY_SZ
        mul     bx                  ; ax = idx*9 (dx:ax, idx small)
        mov     si, ax
        add     si, toc
        xor     ax, ax
        mov     al, [si]
        mov     [logicalid], ax
        ; si -> entry. fields:
        mov     ax, [si+5]          ; raw_size
        mov     [raw_size], ax
        mov     ax, [si+7]          ; comp_size
        mov     [comp_size], ax
        ; file offset = data_base + data_offset(u32 @ si+1)
        mov     ax, [si+1]          ; data_offset low
        mov     dx, [si+3]          ; data_offset high
        add     ax, [data_base]
        adc     dx, 0
        call    seek_set            ; seek to the block's compressed data

        ; --- RLE-decompress comp -> raw_seg, producing raw_size bytes -------
        cmp     word [raw_size], FRAME_HDR
        jb      .badfmt
        mov     ax, [raw_seg]
        mov     es, ax
        call    decode_rle

        ; --- /R diagnostic: dump the decompressed block to CCGB.BIN ----------
        cmp     byte [rawdump], 0
        je      .norawdump
        call    write_rawbin
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        mov     ax, 4C00h
        int     21h
.norawdump:
.have_raw:
        ; --- /G, /T: dedicated modes that bypass the standard-frame header ---
        cmp     byte [fontmode], 0
        jne     .do_font
        cmp     byte [tilesheetmode], 0
        jne     .do_tilesheet
        ; --- parse the 17-byte standard frame header (from raw_seg) ---------
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     ax, [0]             ; height
        mov     bx, [2]             ; width_div8
        pop     ds
        mov     [imgh], ax
        or      ax, ax
        jz      .complex
        or      bx, bx
        jz      .complex            ; width_div8==0 -> complex/transparent variant (unsolved)
        shl     bx, 3               ; width = width_div8 * 8
        mov     [imgw], bx
        ; bounds for mode 13h
        cmp     bx, 320
        ja      .toobig
        cmp     word [imgh], 200
        ja      .toobig

        ; pixbytes = (width/2) * height ; expand into img_seg
        mov     ax, bx
        shr     ax, 1               ; width/2 (row bytes)
        mul     word [imgh]         ; dx:ax = rowbytes*height (< 32000)
        mov     [pixbytes], ax
        call    expand_nibbles

        ; --- palette: EGA-16 into pal, rest zero ----------------------------
        call    load_ega_pal

        ; --- output ---------------------------------------------------------
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        cmp     byte [dumpmode], 0
        jne     .dump
        call    show_image
        call    report_music
        mov     ax, 4C00h
        int     21h
.dump:
        call    write_output
        mov     ax, 4C00h
        int     21h

; --- /G: flat 1bpp glyph strip -> COLS-wide font-atlas sheet ----------------
.do_font:
        call    decode_font_atlas   ; al=1 ok (>=1 whole glyph), 0 too few bytes
        or      al, al
        jz      .notfont
        call    load_ega_pal
        call    closefh
        cmp     byte [dumpmode], 0
        jne     .fdump
        cmp     word [imgw], 320
        ja      .toobig
        cmp     word [imgh], 200
        ja      .toobig
        call    show_image
        mov     ax, 4C00h
        int     21h
.fdump:
        call    write_output
        mov     ax, 4C00h
        int     21h

; --- /T: full 8X8D tile strip (all N tiles, not just tile 0) ---------------
.do_tilesheet:
        call    try_8x8d_sheet      ; al=1 ok (header 8,1 + count matched)
        or      al, al
        jz      .nottiles
        call    closefh
        cmp     byte [dumpmode], 0
        jne     .tdump
        cmp     word [imgw], 320
        ja      .toobig
        cmp     word [imgh], 200
        ja      .toobig
        call    show_image
        mov     ax, 4C00h
        int     21h
.tdump:
        call    write_output
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
.complex:
        ; not a standard frame -> try the §B animated multi-frame codec
        ; (SPRIT*/PIC*/BODY* sub-frames; dax-complex-subframe.md, dax.ts parseAnimated)
        call    decode_animated     ; al=1 ok (sets imgw/imgh/pixbytes/framepix)
        or      al, al
        jz      .notanim
        call    expand_animated
        call    load_ega_pal
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        cmp     byte [dumpmode], 0
        jne     .adump
        cmp     word [imgw], 320
        ja      .toobig
        cmp     word [imgh], 200
        ja      .toobig
        call    show_image
        mov     ax, 4C00h
        int     21h
.adump:
        call    write_output
        mov     ax, 4C00h
        int     21h
.notanim:
        call    closefh
        mov     si, s_complex
        jmp     .die
.notfont:
        call    closefh
        mov     si, s_notfont
        jmp     .die
.nottiles:
        call    closefh
        mov     si, s_nottiles
        jmp     .die
.toobig:
        call    closefh
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
;  Signed-byte RLE decompress: file (via getb) -> es:0, producing raw_size bytes.
;    c < 0x80 : copy next (c+1) bytes verbatim
;    c >=0x80 : emit next byte (256-c) times
; ============================================================================
decode_rle:
        xor     di, di
.loop:
        mov     ax, di
        cmp     ax, [raw_size]
        jae     .done
        call    getb                ; control byte
        cmp     al, 80h
        jae     .repeat
        ; literal run of (al+1) bytes
        movzx   cx, al
        inc     cx
.lit:
        call    getb
        mov     [es:di], al
        inc     di
        loop    .lit
        jmp     .loop
.repeat:
        neg     al                  ; al = 256 - c  (run length)
        movzx   cx, al
        call    getb                ; value byte
        mov     ah, al
.rep:
        mov     [es:di], ah
        inc     di
        loop    .rep
        jmp     .loop
.done:
        ret

; ============================================================================
;  Expand chunky 4bpp (raw_seg:17) -> 8bpp indices (img_seg:0). pixbytes source
;  bytes, each -> 2 dest pixels (high nibble = left). No row padding in DAX.
; ============================================================================
expand_nibbles:
        push    ds
        mov     ax, [img_seg]       ; read both segments while DS still = our seg
        mov     es, ax
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     si, FRAME_HDR       ; skip header
        xor     di, di
        mov     cx, [cs:pixbytes]
.ex:
        lodsb                       ; al = packed byte (ds:si)
        mov     bl, al
        shr     al, 4               ; high nibble -> left pixel
        mov     [es:di], al
        inc     di
        mov     al, bl
        and     al, 0Fh             ; low nibble -> right pixel
        mov     [es:di], al
        inc     di
        loop    .ex
        pop     ds
        ret

; ============================================================================
;  Load the fixed EGA-16 palette (RGB 0..255) into the first 16 pal entries,
;  zero the remaining 240 (so the DAC tail is black).
; ============================================================================
load_ega_pal:
        mov     ax, ds              ; expand_nibbles left ES=img_seg; restore ES=our seg
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
;  §B animated multi-frame decoder (dax-complex-subframe.md, dax.ts parseAnimated).
;  raw_seg:0 = decompressed block. Layout:
;    +0  u8   numFrames
;    per frame (21-byte header): u32 delay, u16 height, u16 width8, u16 x, u16 y,
;                                1 pad, u8[8] field_9; then height*width8*4 pixel
;    bytes (chunky 4bpp, high nibble = left). Records tightly packed to raw_size.
;  Walks to frame [frameidx], setting imgw/imgh/pixbytes/framepix (+ f0pix for XOR).
;  Returns al=1 on success, al=0 if not an animated block / frame out of range.
; ============================================================================
decode_animated:
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     al, [0]             ; numFrames
        or      al, al
        jz      .bad
        movzx   cx, al
        cmp     cx, 64              ; sanity cap (real blocks are 1..few frames)
        ja      .bad
        mov     [cs:nframes], cx
        mov     ax, [cs:frameidx]
        cmp     ax, cx
        jae     .bad                ; requested frame out of range
        mov     si, 1               ; first frame header
        xor     bx, bx              ; frame counter
        mov     word [cs:f0pix], 0
.walk:
        mov     ax, [si+4]          ; height
        mov     [cs:tmph], ax
        mov     ax, [si+6]          ; width8
        mov     [cs:tmpw8], ax
        ; pixbytes = height * width8 * 4
        mov     ax, [cs:tmph]
        mul     word [cs:tmpw8]     ; dx:ax = h*w8
        or      dx, dx
        jnz     .bad                ; would overflow *4 in 16 bits
        cmp     ax, 16000
        ja      .bad                ; h*w8*4 must fit (<64000)
        shl     ax, 2               ; *4
        mov     [cs:tmppix], ax
        mov     ax, si              ; pixel offset = frame start + 21
        add     ax, 21
        mov     [cs:tmppixoff], ax
        or      bx, bx              ; record frame-0 pixel offset (for XOR)
        jnz     .notf0
        mov     [cs:f0pix], ax
.notf0:
        cmp     bx, [cs:frameidx]
        je      .found
        ; advance to next frame header = pixoff + pixbytes
        mov     ax, [cs:tmppixoff]
        add     ax, [cs:tmppix]
        cmp     ax, [cs:raw_size]
        ja      .bad                ; ran past the block -> not this format
        mov     si, ax
        inc     bx
        jmp     .walk
.found:
        mov     ax, [cs:tmpw8]
        shl     ax, 3               ; width = width8 * 8
        mov     [cs:imgw], ax
        mov     ax, [cs:tmph]
        mov     [cs:imgh], ax
        mov     ax, [cs:tmppix]
        mov     [cs:pixbytes], ax
        mov     ax, [cs:tmppixoff]
        mov     [cs:framepix], ax
        pop     ds
        mov     al, 1
        ret
.bad:
        pop     ds
        xor     al, al
        ret

; ============================================================================
;  Expand the selected animated frame (raw_seg:framepix) -> 8bpp img_seg:0.
;  pixbytes packed source bytes, 2 dest pixels each (high nibble = left). If
;  /X (doxor) and frame>0, XOR each packed byte against frame 0 first (dax.ts
;  parseAnimated XOR-delta path; PIC*/portrait talk animations). f0pix/framepix
;  share raw_seg, so a single ds indexes both.
; ============================================================================
expand_animated:
        ; decide once: apply XOR only when /X set AND target != frame 0
        mov     byte [cs:applyxor], 0
        cmp     byte [cs:doxor], 0
        je      .noxset
        mov     ax, [cs:framepix]
        cmp     ax, [cs:f0pix]
        je      .noxset             ; frame 0 is stored verbatim
        mov     byte [cs:applyxor], 1
.noxset:
        push    ds
        mov     ax, [img_seg]
        mov     es, ax
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     si, [cs:framepix]
        mov     bx, [cs:f0pix]
        xor     di, di
        mov     cx, [cs:pixbytes]
.ex:
        mov     al, [si]            ; target packed byte
        cmp     byte [cs:applyxor], 0
        je      .nox
        mov     dl, [bx]            ; frame-0 packed byte (ds:bx)
        xor     al, dl
.nox:
        mov     ah, al
        shr     al, 4               ; high nibble -> left pixel
        mov     [es:di], al
        inc     di
        mov     al, ah
        and     al, 0Fh             ; low nibble -> right pixel
        mov     [es:di], al
        inc     di
        inc     si
        inc     bx
        loop    .ex
        pop     ds
        ret

; ============================================================================
;  /G: decode_font_atlas — a flat 1bpp 8x8 glyph blob (raw_seg:0..raw_size, NO
;  header — this is CoK's 8X8D1.DAX block 201, cokFont.ts) into a FONT_COLS-wide
;  grid atlas in img_seg. glyphCount = raw_size / GLYPH_BYTES (floor, matching
;  cokFont.ts's `Math.floor(raw.byteLength / GLYPH_BYTES)`).
;    glyph s, row y (0..7), col x (0..7): bit = (raw[s*8+y] >> (7-x)) & 1
;      (MSB = leftmost pixel, exactly makeBitmapFont's glyphBit / textmode.ts)
;    dest col  = (s % FONT_COLS) * 8 ; dest row-of-glyphs = (s / FONT_COLS) * 8
;    dest off  = (rowbase+y)*imgw + destcol + x ; imgw = FONT_COLS*8
;  Unused cells past glyphCount stay FONT_BG. al=1 on success, 0 if raw_size <
;  one whole glyph.
; ============================================================================
decode_font_atlas:
        mov     ax, [raw_size]
        cmp     ax, GLYPH_BYTES
        jae     .ok
        xor     al, al
        ret
.ok:
        xor     dx, dx
        mov     bx, GLYPH_BYTES
        div     bx                  ; ax = glyph count (raw_size / 8, floor)
        mov     [glyphcnt], ax
        ; rows = ceil(count / FONT_COLS)
        add     ax, FONT_COLS - 1
        mov     bx, FONT_COLS
        xor     dx, dx
        div     bx
        mov     [fontrows], ax
        shl     ax, 3               ; height = rows*8
        mov     [imgh], ax
        mov     word [imgw], FONT_COLS*8

        ; clear the whole atlas to FONT_BG first (unused trailing cells)
        mov     ax, [img_seg]
        mov     es, ax
        xor     di, di
        mov     ax, [imgw]
        mul     word [imgh]
        mov     cx, ax
        mov     al, FONT_BG
        rep     stosb

        push    ds
        mov     ax, [img_seg]
        mov     es, ax
        mov     ax, [raw_seg]
        mov     ds, ax
        xor     bx, bx              ; glyph index s
.sloop:
        cmp     bx, [cs:glyphcnt]
        jae     .sdone
        mov     ax, bx
        and     ax, FONT_COLS - 1   ; col = s % FONT_COLS
        shl     ax, 3
        mov     [cs:destcol], ax    ; destcol = col*8
        mov     ax, bx
        shr     ax, 4               ; row = s / FONT_COLS (FONT_COLS==16)
        shl     ax, 3
        mov     [cs:destrowbase], ax
        mov     ax, bx
        shl     ax, 3               ; src = s*8
        mov     si, ax
        xor     cx, cx              ; glyph row y
.yloop:
        cmp     cx, 8
        jae     .ydone
        lodsb                       ; glyph row byte (ds=raw_seg)
        mov     [cs:curbyte], al
        mov     ax, [cs:destrowbase]
        add     ax, cx
        mul     word [cs:imgw]      ; clobbers dx -- fine, unused after
        add     ax, [cs:destcol]
        mov     di, ax
        mov     bp, 8               ; pixel x within the glyph row
.xloop:
        mov     al, [cs:curbyte]
        shl     byte [cs:curbyte], 1
        and     al, 80h             ; MSB = leftmost pixel
        jz      .bg
        mov     byte [es:di], FONT_FG
        jmp     .nextpix
.bg:
        mov     byte [es:di], FONT_BG
.nextpix:
        inc     di
        dec     bp
        jnz     .xloop
        inc     cx
        jmp     .yloop
.ydone:
        inc     bx
        jmp     .sloop
.sdone:
        pop     ds
        mov     al, 1
        ret

; ============================================================================
;  /T: try_8x8d_sheet — detect + decode a full DOS 8X8D tile strip (all N
;  tiles) into a width=N*8 x 8 sheet. Header (17 bytes, tiles8x8.ts):
;    raw[0:2]=h(=8)  raw[2:4]=w/8(=1)  raw[4:8]=xpos,ypos  raw[8]=count N
;    raw[9:17]=field_9[8] (ignored)   raw[17..]=N contiguous 32-byte tiles
;  al=1 if the header matches and N*32+17 fits raw_size, else 0.
; ============================================================================
try_8x8d_sheet:
        cmp     word [raw_size], FRAME_HDR
        jb      .no
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     ax, [0]             ; height
        mov     bx, ax
        mov     ax, [2]             ; width/8
        mov     cx, ax
        movzx   dx, byte [8]        ; tile count N
        pop     ds
        cmp     bx, 8
        jne     .no
        cmp     cx, 1
        jne     .no
        or      dx, dx
        jz      .no
        mov     [tilecnt], dx
        ; needed = 17 + N*32 <= raw_size
        mov     ax, dx
        shl     ax, 5               ; N*32
        add     ax, FRAME_HDR
        cmp     ax, [raw_size]
        ja      .no
        shl     dx, 3               ; width = N*8
        mov     [imgw], dx
        mov     word [imgh], 8
        call    decode_8x8d_sheet
        call    load_ega_pal
        mov     al, 1
        ret
.no:
        xor     al, al
        ret

; decode_8x8d_sheet: raw_seg (17 + t*32-byte chunky-4bpp tiles) -> img_seg,
; width=N*8 x 8. Mirrors ccdaa.asm's decode_8x8d loop nest (per-tile, per-row,
; per-pixel) but DOS tiles are already chunky 4bpp (2 px/byte, high nibble =
; left) -- no bit-planes to recombine, so each row is a straight nibble
; unpack (as expand_nibbles) placed at the tile's column offset in the sheet.
decode_8x8d_sheet:
        push    ds
        mov     ax, [img_seg]
        mov     es, ax
        mov     ax, [raw_seg]
        mov     ds, ax
        xor     bx, bx              ; tile index t
.tloop:
        cmp     bx, [cs:tilecnt]
        jae     .tdone
        mov     ax, bx
        shl     ax, 5               ; t*32
        add     ax, FRAME_HDR
        mov     [cs:srcbase], ax    ; tile base offset in raw_seg
        mov     ax, bx
        shl     ax, 3               ; t*8
        mov     [cs:destcol], ax
        xor     cx, cx              ; row y (0..7)
.yloop:
        cmp     cx, 8
        jae     .ydone
        mov     ax, cx
        shl     ax, 2               ; y*4 (row bytes per tile)
        add     ax, [cs:srcbase]
        mov     si, ax              ; -> 4 packed bytes for this tile row
        mov     ax, cx
        mul     word [cs:imgw]      ; clobbers dx -- fine, unused after
        add     ax, [cs:destcol]
        mov     di, ax              ; dest row start (sheet coords)
        mov     bp, 4               ; bytes per tile row
.xb:
        lodsb
        mov     dl, al
        shr     al, 4               ; high nibble = left pixel
        mov     [es:di], al
        inc     di
        mov     al, dl
        and     al, 0Fh             ; low nibble = right pixel
        mov     [es:di], al
        inc     di
        dec     bp
        jnz     .xb
        inc     cx
        jmp     .yloop
.ydone:
        inc     bx
        jmp     .tloop
.tdone:
        pop     ds
        ret

; ============================================================================
;  /F frame mode: read the whole (already-decompressed) file into raw_seg:0 and
;  set raw_size = bytes read (capped to 64000). The standard-frame header parse
;  then runs exactly as for a container-decompressed block.
; ============================================================================
read_frame:
        ; file size -> dx:ax
        mov     bx, [fh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        or      dx, dx              ; >64 KB? cap (frames are well under)
        jnz     .cap
        cmp     ax, 64000
        jbe     .sz
.cap:
        mov     ax, 64000
.sz:
        mov     [raw_size], ax
        ; rewind
        mov     bx, [fh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        ; read into raw_seg:0
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, [cs:raw_size]
        xor     dx, dx
        int     21h
        pop     ds
        ret

; ============================================================================
;  Buffered input (sequential getb + seeks that refill) -- as in CCIMG.
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

; seek to dx:ax absolute, then force a refill
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

; getb -> al = next byte, CF=1 on EOF. Preserves bx,cx,dx.
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

; getw -> ax = little-endian word
getw:
        call    getb
        mov     ah, al
        call    getb
        xchg    al, ah
        ret

; ============================================================================
;  Output: CCGB.RAW = imgw(2) imgh(2) pixels(imgw*imgh) palette(768)
; ============================================================================
write_output:
        cmp     byte [gbimdump], 0
        je      write_raw
        jmp     write_gbim

; GBIM v1: magic, version, logical id, row-major flag, dimensions, indexed
; pixels, then the 768-byte RGB palette. This is intentionally the same
; bounded resource contract emitted by CCDAA and consumed by CCFP.
write_gbim:
        mov     ax, [imgw]
        or      ax, ax
        jz      .ret
        mul     word [imgh]
        or      dx, dx
        jnz     .ret
        or      ax, ax
        jz      .ret
        mov     [gbim_npix], ax
        mov     ax, [imgw]
        mov     [gbim_width], ax
        mov     ax, [imgh]
        mov     [gbim_height], ax
        mov     ax, [logicalid]
        mov     [gbim_block], ax
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, gbimname
        int     21h
        jc      .ret
        mov     [ofh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, 14
        mov     dx, gbim_header
        int     21h
        cmp     ax, 14
        jne     .close
        mov     cx, [gbim_npix]
        push    ds
        mov     ax, [img_seg]
        mov     ds, ax
        xor     dx, dx
        mov     bx, [cs:ofh]
        mov     ah, 40h
        int     21h
        pop     ds
        cmp     ax, cx
        jne     .close
        mov     bx, [ofh]
        mov     ah, 40h
        mov     cx, 768
        mov     dx, pal
        int     21h
.close:
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

write_raw:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_rawname
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
        ; pixels from img_seg
        mov     ax, [imgw]
        mul     word [imgh]
        mov     cx, ax              ; imgw*imgh (< 64000)
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

; ============================================================================
;  /R diagnostic: write raw_seg[0..raw_size] to CCGB.BIN (decompressed block).
; ============================================================================
write_rawbin:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_binname
        int     21h
        jc      .ret
        mov     [ofh], ax
        mov     cx, [raw_size]
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        xor     dx, dx
        mov     bx, [cs:ofh]
        mov     ah, 40h
        int     21h
        pop     ds
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

; ============================================================================
;  Display: VGA mode 13h, load DAC, blit, wait for a key, restore text mode.
; ============================================================================
show_image:
        mov     ax, 0013h
        int     10h
        ; load the DAC (palette 0..255 -> 6-bit, value>>2)
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
        ; blit img_seg -> A000, row by row, centred.
        push    ds
        mov     ax, 0A000h
        mov     es, ax
        ; centre start offset (computed while DS still = our seg):
        ;   di0 = ((200-imgh)/2)*320 + (320-imgw)/2
        mov     ax, 200
        sub     ax, [imgh]
        shr     ax, 1
        mov     bx, 320
        mul     bx                  ; clobbers DX -- fine, done before the loop
        mov     cx, 320
        sub     cx, [imgw]
        shr     cx, 1
        add     ax, cx
        mov     di, ax
        mov     bp, [imgw]          ; bytes per row
        mov     ax, [img_seg]
        mov     ds, ax
        xor     si, si
        xor     bx, bx              ; row counter
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
        call    apply_overlay
        ; drain any stale keystrokes (e.g. the Enter that launched us) so the
        ; image isn't skipped instantly, then wait for a fresh key.
.drain:
        mov     ah, 1
        int     16h
        jz      .waitkey
        xor     ah, ah
        int     16h
        jmp     .drain
.waitkey:
        cmp     byte [automode], 0
        je      .blocking_key
        ; BIOS timer ticks at 18.2 Hz. A 54-tick deadline keeps unattended
        ; title playback bounded while preserving immediate keyboard skip.
        mov     ah, 00h
        int     1Ah
        mov     bp, dx
        call    music_start
.auto_wait:
        mov     ah, 01h
        int     16h
        jnz     .consume_key
        mov     ah, 00h
        int     1Ah
        call    music_update
        sub     dx, bp
        cmp     dx, 54
        jb      .auto_wait
        jmp     .restore_text
.consume_key:
        xor     ah, ah
        int     16h
        jmp     .restore_text
.blocking_key:
        xor     ax, ax              ; wait for a key
        int     16h
.restore_text:
        call    speaker_off
        mov     ax, 0003h
        int     10h
        cmp     byte [automode], 0
        je      .ret
        mov     si, s_frame_played
        call    puts
.ret:
        ret

; /O <block> <x> <y>: decode a second standard-frame block from the same DAX
; archive and copy it at an explicit VGA position.  Title archives use these
; partial opaque bands to build their later title screens over the full base.
apply_overlay:
        cmp     byte [overlaymode], 0
        je      .ret
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .ret
        mov     [fh], ax
        mov     ax, [overlayidx]
        cmp     ax, [entcount]
        jae     .close
        mov     bx, ENTRY_SZ
        mul     bx
        mov     si, ax
        add     si, toc
        mov     ax, [si+5]
        mov     [raw_size], ax
        mov     ax, [si+7]
        mov     [comp_size], ax
        mov     ax, [si+1]
        mov     dx, [si+3]
        add     ax, [data_base]
        adc     dx, 0
        call    seek_set
        mov     ax, [raw_seg]
        mov     es, ax
        call    decode_rle
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     ax, [0]
        mov     bx, [2]
        pop     ds
        or      ax, ax
        jz      .close
        or      bx, bx
        jz      .close
        shl     bx, 3
        mov     [imgh], ax
        mov     [imgw], bx
        mov     cx, [overlayx]
        add     cx, bx
        cmp     cx, 320
        ja      .close
        mov     cx, [overlayy]
        add     cx, ax
        cmp     cx, 200
        ja      .close
        mov     ax, bx
        shr     ax, 1
        mul     word [imgh]
        mov     [pixbytes], ax
        call    expand_nibbles
        call    blit_image_at
.close:
        call    closefh
.ret:
        ret

; Copy img_seg at overlayx,overlayy.  The caller has already selected mode 13h.
blit_image_at:
        push    ds
        mov     ax, 0A000h
        mov     es, ax
        mov     ax, [overlayy]
        mov     bx, 320
        mul     bx
        add     ax, [overlayx]
        mov     di, ax
        mov     bp, [imgw]
        mov     ax, [img_seg]
        mov     ds, ax
        xor     si, si
        xor     bx, bx
.row:
        cmp     bx, [cs:imgh]
        jae     .done
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
.done:
        pop     ds
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
        mov     ah, 40h
        mov     bx, 1
        mov     dx, si
        int     21h
        ret

; ----------------------------------------------------------------------------
; parse_args: [ /D ] [ /G | /T | /F ] [ /O block x y ] <file> [ block ]
;   (leading flags may repeat/combine in any order, e.g. "/D /G" or "/G /D")
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
.flagloop:
        ; optional /D (decode -> CCGB.RAW), /R (raw block -> CCGB.BIN),
        ; /A (timed display), /F (frame file), /G (font-glyph atlas),
        ; /T (8X8D tile-strip sheet), /M <gbm> (music, independently scanned)
        cmp     byte [si], '/'
        jne     .name
        inc     si
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'D'
        je      .isd
        cmp     al, 'A'
        je      .isa
        cmp     al, 'R'
        je      .isr
        cmp     al, 'F'
        je      .isf
        cmp     al, 'G'
        je      .isg
        cmp     al, 'T'
        je      .ist
        cmp     al, 'X'
        je      .isx
        cmp     al, 'M'
        je      .ism
        cmp     al, 'I'
        je      .isi
        cmp     al, 'B'
        je      .isb
        cmp     al, 'O'
        je      .iso
        jmp     .name               ; unrecognised flag char (matches pre-/G/T behaviour)
.isd:
        mov     byte [dumpmode], 1
        jmp     .flagdone
.isa:
        mov     byte [automode], 1
        jmp     .flagdone
.isr:
        mov     byte [rawdump], 1
        jmp     .flagdone
.isf:
        mov     byte [framemode], 1
        jmp     .flagdone
.isg:
        mov     byte [fontmode], 1
        jmp     .flagdone
.ist:
        mov     byte [tilesheetmode], 1
        jmp     .flagdone
.isx:
        mov     byte [doxor], 1
        jmp     .flagdone
.ism:
        inc     si
        call    skip_sp
.skipm:
        mov     al, [si]
        or      al, al
        jz      .flagdone_noinc
        cmp     al, 0Dh
        je      .flagdone_noinc
        cmp     al, ' '
        je      .flagdone_noinc
        inc     si
        jmp     .skipm
.isi:
        mov     byte [gbimdump], 1
        mov     byte [dumpmode], 1
        inc     si
        call    skip_sp
        mov     di, gbimname
.icopy:
        mov     al, [si]
        or      al, al
        jz      .idone
        cmp     al, 0Dh
        je      .idone
        cmp     al, ' '
        je      .idone
        mov     [di], al
        inc     si
        inc     di
        jmp     .icopy
.idone:
        mov     byte [di], 0
        jmp     .flagdone_noinc
.isb:
        mov     byte [blockidmode], 1
        inc     si
        call    skip_sp
        xor     bx, bx
.bnum:
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
        jmp     .bnum
.bdone:
        mov     [blockid], bl
        jmp     .flagdone_noinc
.iso:
        mov     byte [overlaymode], 1
        inc     si
        call    skip_sp
        call    parse_decimal
        mov     [overlayidx], ax
        call    skip_sp
        call    parse_decimal
        mov     [overlayx], ax
        call    skip_sp
        call    parse_decimal
        mov     [overlayy], ax
        jmp     .flagdone_noinc
.flagdone:
        inc     si
.flagdone_noinc:
        call    skip_sp
        jmp     .flagloop
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
        ; optional decimal block index
        xor     bx, bx
.dl:
        mov     al, [si]
        cmp     al, '0'
        jb      .dfin
        cmp     al, '9'
        ja      .dfin
        sub     al, '0'
        movzx   ax, al
        push    ax
        mov     ax, bx
        mov     cx, 10
        mul     cx                  ; ax = bx*10
        mov     bx, ax
        pop     ax
        add     bx, ax
        inc     si
        jmp     .dl
.dfin:
        mov     [blkidx], bx
        ; optional second decimal = frame index (animated blocks)
        call    skip_sp
        xor     bx, bx
        mov     al, [si]
        cmp     al, '0'
        jb      .fdfin
        cmp     al, '9'
        ja      .fdfin
.fdl:
        mov     al, [si]
        cmp     al, '0'
        jb      .fdfin
        cmp     al, '9'
        ja      .fdfin
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
        jmp     .fdl
.fdfin:
        mov     [frameidx], bx
        ret
.fin:
        mov     byte [di], 0
        ; no block index given: if the name ends in .GBI it is an already
        ; decompressed standard frame (what CCGBC X emits) -> view it as a
        ; frame.  This is how cc's [view] map (gbi = CCGB) lands here.
        call    detect_gbi_ext
        ret

; Parse an unsigned decimal at DS:SI, advancing SI.  AX=0 if no digits.
parse_decimal:
        xor     bx, bx
.loop:
        mov     al, [si]
        cmp     al, '0'
        jb      .done
        cmp     al, '9'
        ja      .done
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
        jmp     .loop
.done:
        mov     ax, bx
        ret

; If fname ends with ".GBI" (case-insensitive), set framemode=1.
detect_gbi_ext:
        mov     si, fname
.flen:
        cmp     byte [si], 0            ; find terminator
        je      .atend
        inc     si
        jmp     .flen
.atend:
        sub     si, 4                   ; point at the '.' of a 4-char ext
        cmp     si, fname
        jb      .no                     ; name too short for ".GBI"
        cmp     byte [si], '.'
        jne     .no
        mov     al, [si+1]
        and     al, 0DFh                ; upper-case
        cmp     al, 'G'
        jne     .no
        mov     al, [si+2]
        and     al, 0DFh
        cmp     al, 'B'
        jne     .no
        mov     al, [si+3]
        and     al, 0DFh
        cmp     al, 'I'
        jne     .no
        mov     byte [framemode], 1
.no:
        ret

skip_sp:
        cmp     byte [si], ' '
        jne     .d
        inc     si
        jmp     skip_sp
.d:     ret

; Independent optional /M path scan. It may follow the positional DAX args.
scan_music_arg:
        mov     si, 81h
.scan:
        mov     al, [si]
        or      al, al
        jz      .ret
        cmp     al, 13
        je      .ret
        cmp     al, '/'
        jne     .next
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'M'
        jne     .next
        add     si, 2
        call    skip_sp
        mov     di, musicname
.copy:
        mov     al, [si]
        or      al, al
        jz      .done
        cmp     al, 13
        je      .done
        cmp     al, ' '
        je      .done
        stosb
        inc     si
        jmp     .copy
.done:
        mov     byte [di], 0
        ret
.next:
        inc     si
        jmp     .scan
.ret:
        ret

load_music_optional:
        cmp     byte [musicname], 0
        je      .ret
        mov     ax, 3D00h
        mov     dx, musicname
        int     21h
        jc      .ret
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 4096
        mov     dx, musicbuf
        int     21h
        push    ax
        mov     ah, 3Eh
        int     21h
        pop     ax
        mov     [music_len], ax
        cmp     ax, 10
        jb      .ret
        cmp     word [musicbuf], 'GB'
        jne     .ret
        cmp     word [musicbuf+2], 'M1'
        jne     .ret
        mov     cx, [musicbuf+4]
        or      cx, cx
        jz      .ret
        mov     ax, cx
        shl     ax, 2
        add     ax, 6
        cmp     ax, [music_len]
        ja      .ret
        mov     byte [music_valid], 1
.ret:
        ret

music_start:
        cmp     byte [music_valid], 0
        je      .ret
        mov     word [music_index], 0
        mov     word [music_left], 0
        mov     ah, 00h
        int     1Ah
        mov     [music_last], dx
        call    music_next
.ret:
        ret

; DX=current BIOS tick. Advance once for every elapsed tick.
music_update:
        cmp     byte [music_valid], 0
        je      .ret
        push    ax
        push    bx
        push    cx
        push    dx
        mov     ax, dx
        sub     ax, [music_last]
        jz      .done
        mov     [music_last], dx
        mov     cx, ax
.ticks:
        push    cx
        call    music_tick
        pop     cx
        loop    .ticks
.done:
        pop     dx
        pop     cx
        pop     bx
        pop     ax
.ret:
        ret

music_tick:
        cmp     word [music_left], 0
        je      music_next
        dec     word [music_left]
        jz      music_next
.done:
        ret
music_next:
        mov     ax, [music_index]
        cmp     ax, [musicbuf+4]
        jae     speaker_off
        mov     bx, ax
        shl     bx, 2
        add     bx, musicbuf+6
        inc     word [music_index]
        mov     ax, [bx+2]
        mov     [music_left], ax
        mov     ax, [bx]
        or      ax, ax
        jz      speaker_off
        push    ax
        mov     al, 0B6h
        out     43h, al
        pop     ax
        out     42h, al
        mov     al, ah
        out     42h, al
        in      al, 61h
        or      al, 03h
        out     61h, al
.ret:
        ret

speaker_off:
        in      al, 61h
        and     al, 0FCh
        out     61h, al
        ret

report_music:
        cmp     byte [music_valid], 0
        je      .ret
        cmp     word [music_index], 1
        jbe     .ret
        mov     si, s_music_played
        call    puts
.ret:
        ret

play_music_only:
.drain:
        mov     ah, 1
        int     16h
        jz      .start
        xor     ah, ah
        int     16h
        jmp     .drain
.start:
        mov     ah, 00h
        int     1Ah
        mov     bp, dx
        call    music_start
.wait:
        mov     ah, 01h
        int     16h
        jnz     .consume
        mov     ah, 00h
        int     1Ah
        call    music_update
        sub     dx, bp
        cmp     dx, 54
        jb      .wait
        jmp     .done
.consume:
        xor     ah, ah
        int     16h
.done:
        call    speaker_off
        call    report_music
        ret

; ============================================================================
;  Fixed EGA-16 palette, RGB 0..255 (brown corrected at index 6). docs/dax-format.md §5
ega_pal:
        db 000h,000h,000h          ; 0  black
        db 000h,000h,0AAh          ; 1  blue
        db 000h,0AAh,000h          ; 2  green
        db 000h,0AAh,0AAh          ; 3  cyan
        db 0AAh,000h,000h          ; 4  red
        db 0AAh,000h,0AAh          ; 5  magenta
        db 0AAh,055h,000h          ; 6  brown
        db 0AAh,0AAh,0AAh          ; 7  light gray
        db 055h,055h,055h          ; 8  dark gray
        db 055h,055h,0FFh          ; 9  bright blue
        db 055h,0FFh,055h          ; 10 bright green
        db 055h,0FFh,0FFh          ; 11 bright cyan
        db 0FFh,055h,055h          ; 12 bright red
        db 0FFh,055h,0FFh          ; 13 bright magenta
        db 0FFh,0FFh,055h          ; 14 yellow
        db 0FFh,0FFh,0FFh          ; 15 white

s_usage     db 'Usage: CCGB [/A|/D] [/G|/T|/F] [/X] [/O block x y] [/B id /I out.gbi] <file> [block] [frame] [/M music.gbm]',0Dh,0Ah
            db '       CCGB /A /M music.gbm  (bounded music-only playback)',0Dh,0Ah
            db '  /A timed display (about 3 seconds, any key skips)',0Dh,0Ah
            db '  /F frame file  /G font-glyph atlas  /T 8X8D tile-strip sheet',0Dh,0Ah
            db '  /X XOR-delta animated frame (PIC portraits); [frame] picks a sub-frame',0Dh,0Ah
            db '  /O block x y composites a same-archive standard-frame band at x,y',0Dh,0Ah,0
s_noopen    db 'CCGB: cannot open file',0Dh,0Ah,0
s_badfmt    db 'CCGB: not a DAX container',0Dh,0Ah,0
s_badidx    db 'CCGB: block index out of range',0Dh,0Ah,0
s_complex   db 'CCGB: complex/transparent frame (unsupported)',0Dh,0Ah,0
s_notfont   db 'CCGB: block too small for a font glyph strip',0Dh,0Ah,0
s_nottiles  db 'CCGB: not an 8X8D tile-strip block (need header 8,1 + count)',0Dh,0Ah,0
s_toobig    db 'CCGB: image larger than 320x200 (use /D to dump)',0Dh,0Ah,0
s_rawname   db 'CCGB.RAW',0
s_binname   db 'CCGB.BIN',0
gbim_header db 'GBIM'
            dw 1
gbim_block  dw 0
            db 1                    ; bit 0 row-major (DOS EGA palette)
            db 0
gbim_width  dw 0
gbim_height dw 0
s_frame_played db 'CCGB: bounded DAX frame displayed',13,10,0
s_music_played db 'CCGB: GBM1 PC-speaker sequence advanced',13,10,0
musicname   times 128 db 0
musicbuf    times 4096 db 0
music_len   dw 0
music_index dw 0
music_left  dw 0
music_last  dw 0
music_valid db 0

IOBUF_SZ    equ 4096
TOC_MAX     equ 9*600           ; up to 600 TOC entries

; ============================================================================
section .bss
alignb 2
dumpmode    resb 1
rawdump     resb 1
framemode   resb 1
fontmode    resb 1
tilesheetmode resb 1
automode     resb 1
gbimdump     resb 1
blockidmode  resb 1
overlaymode  resb 1
fname       resb 128
gbimname    resb 128
fh          resw 1
ofh         resw 1
raw_seg     resw 1
img_seg     resw 1
toc_bytes   resw 1
entcount    resw 1
data_base   resw 1
blkidx      resw 1
logicalid   resw 1
gbim_npix   resw 1
blockid     resb 1
alignb 2
overlayidx  resw 1
overlayx    resw 1
overlayy    resw 1
raw_size    resw 1
comp_size   resw 1
imgw        resw 1
imgh        resw 1
pixbytes    resw 1
w16         resw 1
h16         resw 1
iopos       resw 1
iolen       resw 1
; /G font-atlas + /T tile-sheet scratch (see decode_font_atlas, try_8x8d_sheet)
glyphcnt    resw 1
fontrows    resw 1
destrowbase resw 1
destcol     resw 1
curbyte     resb 1
tilecnt     resw 1
srcbase     resw 1
; §B animated multi-frame scratch (decode_animated / expand_animated)
frameidx    resw 1
doxor       resb 1
applyxor    resb 1
nframes     resw 1
tmph        resw 1
tmpw8       resw 1
tmppix      resw 1
tmppixoff   resw 1
f0pix       resw 1
framepix    resw 1
alignb 2
toc         resb TOC_MAX
pal         resb 768
iobuf       resb IOBUF_SZ
stackspace  resb 1024
stacktop:
