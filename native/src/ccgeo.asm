; ============================================================================
;  CCGEO.COM  --  Gold Box GEO map lister + top-down area-map viewer.
;
;  Reads BOTH GEO generations through the same verbs (container kind is
;  auto-detected from the file's own header -- no flag needed):
;    - Gen2: DQK's GEO.GLB (HLIB "DATA" library, variable W x H maps) and
;      Amiga GLIB "DATA" GEO libraries (raw 16x16 maps).
;    - Gen1: CoK/DoK's GEOn.DAX (indexed signed-byte-RLE archive, fixed 16x16
;      maps) -- see "GEN1 (CoK/DoK DAX) SUPPORT" below.
;    - FRUA design GEOxxx.DAT (FORM/AMOD, documented 6-byte grid records).
;
;  One binary, three cc VFS roles (like CCHLIB):
;    CCGEO L <file>          list every dungeon map as "<size> Mnnnn.GEO" (Gen2,
;                            positional) or "<size> Bnnnn.GEO" (Gen1, raw DAX
;                            block id)                                  ([open])
;    CCGEO <file> <i>        draw area map i top-down in VGA mode 13h.  i is the
;                            Gen2 positional index for a .GLB, or the raw DAX
;                            block id for a Gen1 .DAX.  Gen1 id 0 means
;                            "first valid GEO block".                  ([view])
;    CCGEO /B <file> <i> <out.bin>
;                            BRIDGE: bake a CCFP-compatible WALLS.BIN from GEO map
;                            i.  Output = a 6-byte header 'WGRD' + u8 W + u8 H, then
;                            W*H cells of 4 wall-slot bytes [N,E,S,W] (row-major),
;                            derived from plane0 = (N<<4)|E and plane1 = (S<<4)|W --
;                            the EXACT plane->slot mapping the TS oracle
;                            packages/engine/src/loaders/geo.ts (buildGeoResult) uses
;                            and which the project VERIFIED produces the golden
;                            16x16 WALLS.BIN prefix.  Optional W*H plane2
;                            backdrop/roof and W*H plane3 door/gateway tails
;                            follow for CCFP's sky gate and movement collision.
;                            CCFP reads the WGRD header for variable W,H; a
;                            legacy raw 16x16 file (no
;                            header) still loads unchanged.
;    CCGEO /C <file> <i> <out.wgr> <x> <y>
;                            COMBAT BRIDGE: bake a compact 10x10 WGRD crop
;                            centered on x,y. This is Greybox's blocked-terrain
;                            bridge for CCCOMBAT, not DQK's original
;                            DungCom/WildCom 50x25 combat setup. Out-of-map
;                            crop cells are open.
;    CCGEO /F <file> <i>     HEADLESS BRIDGE LAUNCH: load map i, bake _FPWALK.BIN,
;                            and EXEC sibling CCFP.COM with the same tail the
;                            in-viewer F hotkey would use. This gives smoke tests
;                            the bridge coverage without foreground SendInput.
;
;  GEO.GLB is an HLIB/GLIB "DATA" leaf: ptr[0] = an id table, ptr[1..N] =
;  the maps. The id table maps logical ECL/GEO area ids to member indexes. Map
;  id 0 remains a native fallback meaning "first sniffed GEO member"; nonzero
;  ids are matched through the table, with positional fallback for
;  synthetic/no-table fixtures. HLIB map members (layout reverse-engineered in
;  packages/engine/src/loaders/geo.ts and validated by the TS engine) are:
;    byte 0   = width  W
;    byte 1   = height H
;    bytes 2..7 = 6 reserved header bytes
;    then 4 planes of W*H bytes:
;      plane0 = (North<<4)|East wall slots   (nibble per edge; 0 = open)
;      plane1 = (South<<4)|West wall slots
;      plane2 = backdrop / zone byte         (not drawn here)
;      plane3 = door flags, 2 bits/dir       (N=0-1,E=2-3,S=4-5,W=6-7;
;                                             0 plain, 1 door, 2 gateway)
;  A member is a GEO map iff len == 8 + 4*W*H exactly (with sane W,H) -- so this
;  same tool is SAFE on a non-map .GLB (SOUNDS/ECL/MONCHA): their members fail the
;  sniff and simply produce an empty list, no hang.
;  Amiga GLIB GEO maps use the same four 16x16 planes without the 8-byte Gen2
;  W/H header, and the container/id table/pointers are big-endian; CCGEO swaps
;  those metadata fields and loads the raw planes at geobuf+8 so rendering and
;  bridges stay shared with HLIB and Gen1.
;
;  FRUA design maps are direct FORM/AMOD files, not DQK GEO.GLB members. Their
;  documented header has H at byte 26 and W at byte 27; grid records begin at
;  322 and are {N,E,S,W,event,backdrop+zone}. CCGEO validates the FORM/AMOD and
;  `MAP`/`ENCR`/`STRG` markers, then normalizes the first four fields into the
;  same four planes used by the renderer and WGRD bridge. The lock-kind high
;  nibble becomes the existing 2-bit door display class: plain/blocked=0,
;  secret/false-door=2, and the other locked forms=1. This is the same bounded
;  mapping retained by packages/engine/src/module/frua/importer.ts.
;
;  GEN1 (CoK/DoK DAX) SUPPORT: GEOn.DAX (e.g. "Champions of Krynn/GEO1.DAX") is a
;  DAX container -- the SAME headerless indexed archive read elsewhere by cgbc.asm
;  (u16 toc_bytes, then toc_bytes/9 entries of {u8 blockId, u32 dataOffset, u16
;  rawSize, u16 compSize}, signed-byte-RLE compressed data after the TOC).  A block
;  is a Gen1 GEO map iff its decompressed rawSize is exactly 1026 bytes: a 2-byte
;  header word (ignored -- CoK's is the constant 1024, DoK's is a different
;  area/checksum value, see geo.ts) followed by the SAME 4 x 256-byte wall/backdrop/
;  door planes as Gen2, just fixed at W=H=16 instead of variable.  Every real
;  GEOn.DAX in CoK/DoK is ALL block-1026 (verified: GEO1..3 in both games), so the
;  sniff never false-positives on other DAX archives this tool might be pointed at.
;  find_map_gen1 decompresses the matched block straight into `geobuf+8` (skipping
;  its 2-byte header into the unused geobuf+6..7 gap) so render_map/bridge_walls --
;  which only ever look at [gW]/[gH] and geobuf+8-relative planes -- run UNCHANGED
;  for both generations; only container parsing (open_dax_container/list_maps_gen1/
;  find_map_gen1/decode_rle_mem) is new.  Oracle: packages/engine/src/loaders/geo.ts
;  (decodeGeoBlock) -- byte-diff verified, see the CCVERIFY-style /D debug dump.
;
;  Walls render white, doors bright-blue, gateways yellow on the mode-13h default
;  palette (indices 15/9/14) -- no DAC load needed.
;
;  IN-VIEWER FIRST-PERSON HOTKEY:  while a map is shown top-down (mode 13h) and
;  CCGEO is waiting for a key, press 'F' (or ENTER) to drop into the CCFP
;  first-person walk of THAT map.  CCGEO bakes the live map to a temp _FPWALK.BIN
;  (its own /B bridge_walls logic) in the cwd and EXECs CCFP _FPWALK.BIN /W (or
;  /T /A n /W when GEOn's 8X8Dn.DAX + WALLDEFn.DAX and boot-cap 8X8D1.DAX are
;  present in cwd for textured walls).
;  When CCFP exits (Esc) CCGEO re-draws the top-down map and waits again; any
;  other key exits the viewer cleanly to text mode.  This is additive -- L, the
;  top-down view, /B, and the strict GEO sniff are all unchanged.
;
;  Build:  build.ps1 ccgeo   (nasm -f bin -> build\ccgeo.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

start:
        call    parse_args
        cmp     byte [fname], 0
        je      .usage

        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .noopen
        mov     [fh], ax

        ; Auto-detect container kind: try Gen2 HLIB/Amiga GLIB first; if that
        ; fails, fall back to a Gen1 DAX sniff (toc_bytes a nonzero multiple of
        ; 9).  Neither matching -> badhdr.
        mov     byte [gen1], 0
        mov     byte [glib], 0
        mov     byte [frua], 0
        call    read_container_header
        jnc     .have_container
        call    open_frua_geo
        jnc     .have_frua
        call    open_dax_container
        jc      .badhdr
        mov     byte [gen1], 1
.have_container:

        jmp     .dispatch
.have_frua:
        mov     byte [frua], 1
.dispatch:
        cmp     byte [frua], 0
        je      .not_frua
        cmp     word [blkidx], 0
        jne     .nofind
        cmp     byte [verb], 'L'
        je      .list_frua
        cmp     byte [verb], 'B'
        je      .frua_bridge
        cmp     byte [verb], 'C'
        je      .frua_crop
        cmp     byte [verb], 'F'
        je      .frua_fp
        call    render_map
        jmp     .done
.list_frua:
        call    list_frua_map
        jmp     .done
.frua_bridge:
        call    bridge_walls
        jc      .nowrite
        jmp     .done
.frua_crop:
        call    bridge_walls_crop
        jc      .nowrite
        jmp     .done
.frua_fp:
        call    launch_fp
        jmp     .done
.not_frua:

        cmp     byte [verb], 'L'
        je      .do_list
        cmp     byte [verb], 'B'
        je      .do_bridge
        cmp     byte [verb], 'C'
        je      .do_crop_bridge
        cmp     byte [verb], 'F'
        je      .do_fp_launch
        ; default: render map [blkidx]
        cmp     byte [gen1], 0
        jne     .find_gen1
        call    find_map            ; -> cur_off/mlen/gW/gH; CF=1 if not found
        jc      .nofind
        call    load_member
        jmp     .render
.find_gen1:
        call    find_map_gen1       ; decodes DAX block [blkidx] into geobuf/gW/gH; CF=1 if not found
        jc      .nofind
.render:
        call    render_map
        jmp     .done
.do_list:
        cmp     byte [gen1], 0
        jne     .list_gen1
        call    list_maps
        jmp     .done
.list_gen1:
        call    list_maps_gen1
        jmp     .done
.do_bridge:
        ; /B: locate map [blkidx], load it, bake WALLS.BIN to [outname].
        cmp     byte [gen1], 0
        jne     .bridge_gen1
        call    find_map            ; -> cur_off/mlen/gW/gH; CF=1 if not found
        jc      .nofind
        call    load_member
        jmp     .bridge_common
.bridge_gen1:
        call    find_map_gen1       ; CF=1 if not found
        jc      .nofind
.bridge_common:
        call    bridge_walls        ; CF=1 if the output file cannot be created
        jc      .nowrite
        jmp     .done
.do_crop_bridge:
        ; /C: locate map [blkidx], load it, bake a compact 10x10 WGRD crop.
        cmp     byte [gen1], 0
        jne     .crop_gen1
        call    find_map
        jc      .nofind
        call    load_member
        jmp     .crop_common
.crop_gen1:
        call    find_map_gen1
        jc      .nofind
.crop_common:
        call    bridge_walls_crop
        jc      .nowrite
        jmp     .done
.do_fp_launch:
        ; /F: locate/load map [blkidx], then run the same CCFP bridge used by
        ; the in-viewer F hotkey. No VGA viewer or keyboard focus is needed.
        cmp     byte [gen1], 0
        jne     .fp_gen1
        call    find_map
        jc      .nofind
        call    load_member
        jmp     .fp_common
.fp_gen1:
        call    find_map_gen1
        jc      .nofind
.fp_common:
        call    launch_fp
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
.nofind:
        mov     dx, s_nofind
        jmp     .closedie
.nowrite:
        mov     dx, s_nowrite
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
;  read_container_header: verify "HLIB" or Amiga "GLIB", read pointer list
;  (count DWORDs). All GEO.GLB offsets fit in 16 bits (file < 64 KB), so callers
;  use ptr low words.
; ============================================================================
read_container_header:
        xor     cx, cx
        xor     dx, dx
        call    seek32
        mov     dx, fhdr
        mov     cx, 16
        call    read_here
        cmp     word [fhdr], 'HL'
        jne     .try_glib
        cmp     word [fhdr+2], 'IB'
        jne     .bad
        mov     byte [glib], 0
        mov     ax, [fhdr+8]        ; stored count-1
        jmp     .count_ax
.try_glib:
        cmp     word [fhdr], 'GL'
        jne     .bad
        cmp     word [fhdr+2], 'IB'
        jne     .bad
        mov     byte [glib], 1
        mov     ax, [fhdr+8]        ; big-endian stored count-1
        xchg    al, ah
.count_ax:
        inc     ax
        cmp     ax, PTRCAP          ; clamp: never overflow `ptrs`
        jbe     .ok
        mov     ax, PTRCAP
.ok:
        mov     [ptrcount], ax
        mov     cx, 0
        mov     dx, 16
        call    seek32
        mov     ax, [ptrcount]
        shl     ax, 2
        mov     cx, ax
        mov     dx, ptrs
        call    read_here
        cmp     byte [glib], 0
        je      .done
        call    byteswap_ptrs
.done:
        clc
        ret
.bad:
        stc
        ret

; GLIB stores absolute u32 pointers big-endian.  Convert in-place to the
; little-endian dwords the existing HLIB path already consumes.
byteswap_ptrs:
        mov     si, ptrs
        mov     cx, [ptrcount]
.loop:
        mov     al, [si]
        mov     ah, [si+1]
        mov     bl, [si+2]
        mov     bh, [si+3]
        mov     [si], bh
        mov     [si+1], bl
        mov     [si+2], ah
        mov     [si+3], al
        add     si, 4
        loop    .loop
        ret

; ============================================================================
;  enumerate_geo: for each member i in 0..ptrcount-2, sniff a GEO map; on a hit
;  call [geo_cb] with cur_off/mlen/gW/gH set, geo_idx = running 0-based index,
;  and geo_logical = the HLIB id-table area id when present.
;  geo_cb returns CF=1 to stop the walk.
; ============================================================================
enumerate_geo:
        mov     word [geo_idx], 0
        mov     word [mi], 0
.loop:
        mov     ax, [ptrcount]
        dec     ax                  ; member count = ptrcount-1
        cmp     [mi], ax
        jae     .done
        mov     bx, [mi]
        shl     bx, 2
        mov     ax, [ptrs+bx]       ; cur offset (low word)
        mov     [cur_off], ax
        mov     ax, [ptrs+bx+4]     ; next offset (low word)
        sub     ax, [cur_off]
        mov     [mlen], ax          ; member length
        cmp     byte [glib], 0
        je      .sniff_hlib
        cmp     ax, 1024            ; Amiga GLIB GEO maps are raw 16x16 planes
        jne     .sniff_hlib         ; DQK Amiga GLIB keeps Gen2 W/H headers
        mov     word [gW], 16
        mov     word [gH], 16
        jmp     .map_hit
.sniff_hlib:
        ; read the 2-byte W,H header
        xor     cx, cx
        mov     dx, [cur_off]
        call    seek32
        mov     cx, 2
        mov     dx, tmphdr
        call    read_here
        movzx   ax, byte [tmphdr]   ; W
        mov     [gW], ax
        movzx   cx, byte [tmphdr+1] ; H
        mov     [gH], cx
        ; sane bounds keep W*H*4 in range and reject non-maps
        cmp     ax, 1
        jb      .next
        cmp     ax, 63
        ja      .next
        cmp     cx, 1
        jb      .next
        cmp     cx, 63
        ja      .next
        ; expected = 8 + 4*W*H
        mul     cx                  ; ax = W*H (< 4096, dx=0)
        shl     ax, 2
        add     ax, 8
        cmp     ax, [mlen]
        jne     .next
        ; GEO map hit -> callback
.map_hit:
        call    resolve_geo_id
        mov     bx, [geo_cb]
        call    bx
        jc      .stop
        inc     word [geo_idx]
.next:
        inc     word [mi]
        jmp     .loop
.done:
        clc
        ret
.stop:
        ret

; ---- L: list every GEO map as "<size> Mnnnn.GEO" -----------------------------
list_maps:
        mov     word [geo_cb], cb_list
        call    enumerate_geo
        ret

cb_list:
        mov     di, linebuf
        mov     ax, [mlen]          ; size (decimal)
        xor     dx, dx
        call    put_dec32
        mov     al, ' '
        stosb
        mov     al, 'M'
        stosb
        mov     ax, [geo_logical]
        call    put_dec16_4
        mov     si, s_ext_geo
        call    cat_si
        mov     al, 13
        stosb
        mov     al, 10
        stosb
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, 1
        mov     ah, 40h
        int     21h
        clc
        ret

; ---- find a GEO map ----------------------------------------------------------
; [blkidx] = 0 selects the first sniffed GEO member. Nonzero values are logical
; HLIB id-table area ids when the table is valid, otherwise positional indexes.
find_map:
        mov     word [geo_cb], cb_find
        mov     byte [found], 0
        call    enumerate_geo
        cmp     byte [found], 0
        je      .no
        clc
        ret
.no:
        stc
        ret

cb_find:
        cmp     word [blkidx], 0
        jne     .by_id
        mov     ax, [geo_idx]
        cmp     ax, 0
        jne     .keep
        jmp     .hit
.by_id:
        mov     ax, [geo_logical]
        cmp     ax, [blkidx]
        jne     .keep
.hit:
        mov     byte [found], 1     ; cur_off/mlen/gW/gH already set for this member
        stc
        ret
.keep:
        clc
        ret

; ---- resolve HLIB logical GEO id for current member --------------------------
; The first DATA member in real DQK GEO.GLB is a little-endian id table:
;   u16 count, then count * { u16 logicalId, u16 memberIndex }.
; Synthetic/no-table fixtures fall back to the 0-based sniff order.
resolve_geo_id:
        mov     ax, [geo_idx]
        mov     [geo_logical], ax
        cmp     word [ptrcount], 2
        jb      .ret
        mov     ax, [ptrs]
        mov     [id_table_off], ax
        mov     ax, [ptrs+4]
        sub     ax, [id_table_off]
        mov     [id_table_len], ax
        cmp     ax, 2
        jb      .ret

        xor     cx, cx
        mov     dx, [id_table_off]
        call    seek32
        mov     cx, 2
        mov     dx, tmphdr
        call    read_here
        mov     ax, [tmphdr]
        cmp     byte [glib], 0
        je      .count_ok
        xchg    al, ah
.count_ok:
        mov     [id_count], ax
        or      ax, ax
        jz      .ret
        cmp     ax, 128
        ja      .ret
        shl     ax, 2
        add     ax, 2
        cmp     ax, [id_table_len]
        ja      .ret

        mov     word [id_i], 0
.loop:
        mov     ax, [id_i]
        cmp     ax, [id_count]
        jae     .ret
        shl     ax, 2
        add     ax, 2
        add     ax, [id_table_off]
        xor     cx, cx
        mov     dx, ax
        call    seek32
        mov     cx, 4
        mov     dx, idrec
        call    read_here
        mov     ax, [idrec+2]
        cmp     byte [glib], 0
        je      .member_ok
        xchg    al, ah
.member_ok:
        cmp     ax, [mi]
        jne     .next
        mov     ax, [idrec]
        cmp     byte [glib], 0
        je      .logical_ok
        xchg    al, ah
.logical_ok:
        mov     [geo_logical], ax
        ret
.next:
        inc     word [id_i]
        jmp     .loop
.ret:
        ret

; ============================================================================
;  load_member: read the selected map (cur_off, mlen bytes) into geobuf.
; ============================================================================
load_member:
        xor     cx, cx
        mov     dx, [cur_off]
        call    seek32
        cmp     byte [glib], 0
        je      .hlib
        cmp     word [mlen], 1024
        jne     .hlib
        mov     word [geobuf], 1010h
        mov     word [geobuf+2], 0
        mov     word [geobuf+4], 0
        mov     word [geobuf+6], 0
        mov     cx, 1024
        mov     dx, geobuf+8
        call    read_here
        ret
.hlib:
        mov     cx, [mlen]
        mov     dx, geobuf
        call    read_here
        ret

; ============================================================================
;  FRUA GEOxxx.DAT (FORM/AMOD) SUPPORT
;
;  The FRUA design editor stores the full 12,962-byte GEO record directly in
;  each .DSN folder. It is an IFF-shaped FORM/AMOD record, but its documented
;  map layout is not an HLIB GEO member. Read the bounded record into `fruabuf`,
;  validate fixed markers, then normalize its 6-byte grid cells into CCGEO's
;  common four-plane `geobuf` representation.
; ============================================================================

FRUA_GEO_MIN    equ 6200
FRUA_GEO_MAX    equ 13000
FRUA_GRID_OFF   equ 322
FRUA_GRID_MAX   equ 576
FRUA_MAP_MARK   equ 314
FRUA_ENCR_MARK  equ 3778
FRUA_STRG_MARK  equ 5786

; open_frua_geo: CF=0 only for one complete, bounded FORM/AMOD GEO record.
open_frua_geo:
        ; Find the file length. FRUA GEO records fit in one DOS segment and the
        ; 13,000-byte bound includes the largest installed 12,962-byte record.
        mov     bx, [fh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        or      dx, dx
        jnz     .bad
        cmp     ax, FRUA_GEO_MIN
        jb      .bad
        cmp     ax, FRUA_GEO_MAX
        ja      .bad
        mov     [frua_len], ax
        xor     cx, cx
        xor     dx, dx
        call    seek32
        mov     cx, [frua_len]
        mov     dx, fruabuf
        call    read_here

        cmp     byte [fruabuf], 'F'
        jne     .bad
        cmp     byte [fruabuf+1], 'O'
        jne     .bad
        cmp     byte [fruabuf+2], 'R'
        jne     .bad
        cmp     byte [fruabuf+3], 'M'
        jne     .bad
        cmp     byte [fruabuf+8], 'A'
        jne     .bad
        cmp     byte [fruabuf+9], 'M'
        jne     .bad
        cmp     byte [fruabuf+10], 'O'
        jne     .bad
        cmp     byte [fruabuf+11], 'D'
        jne     .bad
        cmp     byte [fruabuf+FRUA_MAP_MARK], 'M'
        jne     .bad
        cmp     byte [fruabuf+FRUA_MAP_MARK+1], 'A'
        jne     .bad
        cmp     byte [fruabuf+FRUA_MAP_MARK+2], 'P'
        jne     .bad
        cmp     byte [fruabuf+FRUA_ENCR_MARK], 'E'
        jne     .bad
        cmp     byte [fruabuf+FRUA_ENCR_MARK+1], 'N'
        jne     .bad
        cmp     byte [fruabuf+FRUA_ENCR_MARK+2], 'C'
        jne     .bad
        cmp     byte [fruabuf+FRUA_ENCR_MARK+3], 'R'
        jne     .bad
        cmp     byte [fruabuf+FRUA_STRG_MARK+2], 'R'
        jne     .bad
        cmp     byte [fruabuf+FRUA_STRG_MARK], 'S'
        jne     .bad
        cmp     byte [fruabuf+FRUA_STRG_MARK+1], 'T'
        jne     .bad
        cmp     byte [fruabuf+FRUA_STRG_MARK+3], 'G'
        jne     .bad

        movzx   ax, byte [fruabuf+27] ; documented width
        or      ax, ax
        jz      .bad
        mov     [gW], ax
        movzx   cx, byte [fruabuf+26] ; documented height
        or      cx, cx
        jz      .bad
        mov     [gH], cx
        mul     cx
        or      dx, dx
        jnz     .bad
        cmp     ax, FRUA_GRID_MAX
        ja      .bad
        mov     [plane], ax

        mov     al, [fruabuf+27]
        mov     [geobuf], al
        mov     al, [fruabuf+26]
        mov     [geobuf+1], al
        mov     word [geobuf+2], 0
        mov     word [geobuf+4], 0
        mov     word [geobuf+6], 0
        mov     word [p0p], geobuf+8
        mov     ax, [p0p]
        add     ax, [plane]
        mov     [p1p], ax
        add     ax, [plane]
        mov     [p2p], ax
        add     ax, [plane]
        mov     [p3p], ax
        mov     word [ci], 0
.cell:
        mov     bx, [ci]
        cmp     bx, [plane]
        jae     .ok
        mov     ax, bx
        mov     cx, 6
        mul     cx
        add     ax, fruabuf+FRUA_GRID_OFF
        mov     si, ax

        ; plane 0: (north-slot << 4) | east-slot
        mov     al, [si]
        and     al, 0Fh
        shl     al, 4
        mov     ah, [si+1]
        and     ah, 0Fh
        or      al, ah
        mov     di, [p0p]
        mov     [di+bx], al
        ; plane 1: (south-slot << 4) | west-slot
        mov     al, [si+2]
        and     al, 0Fh
        shl     al, 4
        mov     ah, [si+3]
        and     ah, 0Fh
        or      al, ah
        mov     di, [p1p]
        mov     [di+bx], al
        ; FRUA's backdrop+zone byte maps directly to plane 2.
        mov     al, [si+5]
        mov     di, [p2p]
        mov     [di+bx], al

        ; Make CCGEO's four 2-bit door fields from FRUA wall-kind nibbles.
        xor     ch, ch
        mov     al, [si]
        call    frua_door_flag
        or      ch, al
        mov     al, [si+1]
        call    frua_door_flag
        shl     al, 2
        or      ch, al
        mov     al, [si+2]
        call    frua_door_flag
        shl     al, 4
        or      ch, al
        mov     al, [si+3]
        call    frua_door_flag
        shl     al, 6
        or      ch, al
        mov     di, [p3p]
        mov     [di+bx], ch
        inc     word [ci]
        jmp     .cell
.ok:
        clc
        ret
.bad:
        stc
        ret

; AL = FRUA wall byte. Return AL = common door class (0 plain, 1 door, 2 special).
frua_door_flag:
        and     al, 0F0h
        jz      .plain              ; open
        cmp     al, 0E0h
        je      .plain              ; blocked
        cmp     al, 10h
        je      .special            ; secret
        cmp     al, 0F0h
        je      .special            ; false door
        mov     al, 1               ; locked / wizard / key forms
        ret
.plain:
        xor     al, al
        ret
.special:
        mov     al, 2
        ret

; A direct FRUA file is one normalized map, called M0000 for list consumers.
list_frua_map:
        mov     di, linebuf
        mov     ax, [frua_len]
        xor     dx, dx
        call    put_dec32
        mov     al, ' '
        stosb
        mov     al, 'M'
        stosb
        xor     ax, ax
        call    put_dec16_4
        mov     si, s_ext_geo
        call    cat_si
        mov     al, 13
        stosb
        mov     al, 10
        stosb
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, 1
        mov     ah, 40h
        int     21h
        ret

; ============================================================================
;  GEN1 (CoK/DoK DAX) SUPPORT
;
;  A GEOn.DAX is the same headerless indexed archive cgbc.asm reads: u16
;  toc_bytes at offset 0 (a nonzero multiple of 9), then toc_bytes/9 entries of
;  9 bytes each {u8 blockId, u32 dataOffset, u16 rawSize, u16 compSize}, with
;  the signed-byte-RLE compressed block data starting at `2+toc_bytes` (the
;  "data base").  A block is a Gen1 GEO map iff its rawSize is exactly 1026
;  (the fixed 2-byte-header + four 256-byte-plane size geo.ts sniffs on).
; ============================================================================

; ----------------------------------------------------------------------------
;  open_dax_container: read+validate the DAX TOC into `daxtoc`.  Sets
;  [dax_n] (entry count) and [dax_base] (data section base).  CF=1 if word0
;  is zero or not a multiple of 9, or the entry count exceeds our buffer.
; ----------------------------------------------------------------------------
open_dax_container:
        xor     cx, cx
        xor     dx, dx
        call    seek32
        mov     cx, 2
        mov     dx, tmphdr
        call    read_here
        mov     ax, [tmphdr]
        or      ax, ax
        jz      .bad
        xor     dx, dx
        mov     bx, 9
        div     bx
        or      dx, dx
        jnz     .bad                ; not a multiple of 9 -> not a DAX container
        cmp     ax, DAXTOC_ENTRIES  ; clamp: never overflow `daxtoc`
        ja      .bad
        mov     [dax_n], ax
        mov     ax, [tmphdr]
        add     ax, 2
        mov     [dax_base], ax
        ; read the TOC (dax_n*9 bytes) starting right after the toc_bytes word
        xor     cx, cx
        mov     dx, 2
        call    seek32
        mov     ax, [dax_n]
        mov     bx, 9
        mul     bx
        mov     cx, ax
        mov     dx, daxtoc
        call    read_here
        clc
        ret
.bad:
        stc
        ret

; ----------------------------------------------------------------------------
;  list_maps_gen1 (L): emit "<1026> Bnnnn.GEO" for every TOC entry whose
;  rawSize is exactly 1026 (a Gen1 GEO block); nnnn = the raw DAX block id.
; ----------------------------------------------------------------------------
list_maps_gen1:
        mov     word [mi], 0
.l:
        mov     ax, [mi]
        cmp     ax, [dax_n]
        jae     .done
        mov     bx, 9
        mul     bx
        mov     si, ax
        add     si, daxtoc
        mov     ax, [si+5]          ; rawSize
        cmp     ax, 1026
        jne     .next
        mov     di, linebuf
        xor     dx, dx
        call    put_dec32           ; "1026"
        mov     al, ' '
        stosb
        mov     al, 'B'
        stosb
        movzx   ax, byte [si]       ; raw DAX block id
        call    put_dec16_4
        mov     si, s_ext_geo
        call    cat_si
        mov     al, 13
        stosb
        mov     al, 10
        stosb
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, 1
        mov     ah, 40h
        int     21h
.next:
        inc     word [mi]
        jmp     .l
.done:
        ret

; ----------------------------------------------------------------------------
;  find_map_gen1: scan `daxtoc` for the entry whose blockId == [blkidx] (the
;  raw DAX block id passed on the command line) AND whose rawSize == 1026.  If
;  [blkidx] is 0, select the first 1026-byte GEO block in TOC order instead;
;  read its compressed bytes into `compbuf` and RLE-decompress into
;  `geobuf+6` (so the 2-byte Gen1 header lands at geobuf+6..7 and the four
;  256-byte planes land at geobuf+8, EXACTLY where render_map/bridge_walls
;  already expect Gen2 planes to start).  Sets [gW]=[gH]=16.  CF=1 if no
;  matching 1026-byte block is found.
; ----------------------------------------------------------------------------
find_map_gen1:
        mov     word [mi], 0
.l:
        mov     ax, [mi]
        cmp     ax, [dax_n]
        jae     .no
        mov     bx, 9
        mul     bx
        mov     si, ax
        add     si, daxtoc
        movzx   ax, byte [si]       ; this entry's block id
        cmp     word [blkidx], 0
        je      .check_size
        cmp     ax, [blkidx]
        jne     .next
.check_size:
        mov     ax, [si+5]          ; rawSize must be exactly 1026
        cmp     ax, 1026
        jne     .next
        ; --- found: seek to data_base + dataOffset, read compSize bytes ----
        mov     ax, [si+1]          ; dataOffset low word
        mov     dx, [si+3]          ; dataOffset high word
        add     ax, [dax_base]
        adc     dx, 0
        mov     cx, dx              ; seek32 wants cx:dx = high:low
        mov     dx, ax
        call    seek32
        mov     ax, [si+7]          ; compSize (fresh read; si still valid)
        mov     cx, ax
        mov     dx, compbuf
        call    read_here
        ; --- decompress compbuf -> geobuf+6, exactly 1026 bytes -------------
        mov     si, compbuf
        mov     di, geobuf+6
        mov     word [rle_lim], 1026
        call    decode_rle_mem
        mov     word [gW], 16
        mov     word [gH], 16
        clc
        ret
.next:
        inc     word [mi]
        jmp     .l
.no:
        stc
        ret

; ----------------------------------------------------------------------------
;  decode_rle_mem: signed-byte RLE (matches cgbc.asm's decode_rle and
;  tools/dax_decode.py's signedByteRLE) reading from an in-memory compressed
;  buffer (si, DS-relative) instead of the file -- Gen1 GEO blocks are small
;  enough (<= ~1.1 KB compressed) to read whole before decompressing.
;  Produces exactly [rle_lim] bytes at di (DS-relative); si/di both advance.
; ----------------------------------------------------------------------------
decode_rle_mem:
        push    ax
        push    cx
        push    dx
        mov     word [rle_off], 0
.loop:
        mov     ax, [rle_off]
        cmp     ax, [rle_lim]
        jae     .done
        lodsb
        cmp     al, 80h
        jae     .rep
        movzx   cx, al
        inc     cx
.lit:
        lodsb
        mov     [di], al
        inc     di
        inc     word [rle_off]
        loop    .lit
        jmp     .loop
.rep:
        neg     al
        movzx   cx, al
        lodsb
        mov     ah, al
.rp:
        mov     [di], ah
        inc     di
        inc     word [rle_off]
        loop    .rp
        jmp     .loop
.done:
        pop     dx
        pop     cx
        pop     ax
        ret

; ============================================================================
;  bridge_walls (/B): bake a CCFP-compatible WALLS.BIN from the loaded GEO map
;  (geobuf holds the member: byte0 W, byte1 H, 6 reserved, then 4 W*H planes).
;
;  Output layout (the WGRD-headered WALLS format CCFP detects):
;    'W','G','R','D'  u8 W  u8 H        ; 6-byte header
;    then W*H cells, 4 bytes each, row-major i = y*W + x:
;      cell[0] = N = plane0[i] >> 4
;      cell[1] = E = plane0[i] & 0x0f
;      cell[2] = S = plane1[i] >> 4
;      cell[3] = W = plane1[i] & 0x0f
;    then W*H optional bytes copied from plane2 (backdrop / roof byte).
;    then W*H optional bytes copied from plane3 (door/gateway flags).
;  This is byte-for-byte the geo.ts buildGeoResult mapping (north=p0>>4,
;  east=p0&0xf, south=p1>>4, west=p1&0xf) and reproduces the project's golden
;  16x16 WALLS.BIN prefix.  CCFP accepts the optional plane3 tail to let /M and
;  /W movement pass through walled edges flagged as doors/gateways.
;
;  CF=1 if the output file cannot be created, else CF=0 and [outfh] is closed.
; ============================================================================
bridge_walls:
        ; plane pointers: p0 = geobuf+8, p1 = p0 + W*H
        mov     ax, [gW]
        mul     word [gH]
        mov     [plane], ax             ; W*H (< 4096)
        mov     ax, geobuf+8
        mov     [p0p], ax
        add     ax, [plane]
        mov     [p1p], ax
        ; --- build the payload into wallout ---
        ; header: 'WGRD', W, H
        mov     di, wallout
        mov     al, 'W'
        stosb
        mov     al, 'G'
        stosb
        mov     al, 'R'
        stosb
        mov     al, 'D'
        stosb
        mov     al, [gW]                ; low byte = W (W<=62)
        stosb
        mov     al, [gH]
        stosb
        ; cells: i = 0 .. W*H-1
        mov     word [ci], 0
.cl:
        mov     ax, [ci]
        cmp     ax, [plane]
        jae     .append_backdrop
        mov     bx, [ci]
        ; N,E from plane0
        mov     si, [p0p]
        mov     al, [si+bx]             ; plane0 byte
        mov     ah, al
        shr     al, 4                   ; N = hi nibble
        stosb
        mov     al, ah
        and     al, 0Fh                 ; E = lo nibble
        stosb
        ; S,W from plane1
        mov     si, [p1p]
        mov     al, [si+bx]             ; plane1 byte
        mov     ah, al
        shr     al, 4                   ; S = hi nibble
        stosb
        mov     al, ah
        and     al, 0Fh                 ; W = lo nibble
        stosb
        inc     word [ci]
        jmp     .cl

.append_backdrop:
        ; Append plane2 as an optional W*H backdrop/roof tail, then plane3 as
        ; optional W*H door/gateway flags. Older CCFP builds copy only the wall
        ; cells above and ignore these extra bytes.
        mov     si, [p1p]
        add     si, [plane]
        mov     cx, [plane]
        rep     movsb
        mov     si, [p1p]
        mov     ax, [plane]
        shl     ax, 1
        add     si, ax
        mov     cx, [plane]
        rep     movsb
        ; di now points just past the payload; total = di - wallout
.cdone:
        mov     ax, di
        sub     ax, wallout
        mov     [outlen], ax
        ; create [outname] and write [outlen] bytes from wallout
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, outname
        int     21h
        jc      .err
        mov     [outfh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, [outlen]
        mov     dx, wallout
        int     21h
        mov     bx, [outfh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.err:
        stc
        ret

; ============================================================================
;  bridge_walls_crop (/C): bake a compact 10x10 Greybox bridge WGRD centered on
;  crop_x,crop_y. Missing cells outside the source map are emitted open. This
;  does not model DQK's original DungCom/WildCom 50x25 terrain population.
; ============================================================================
bridge_walls_crop:
        mov     ax, [gW]
        mul     word [gH]
        mov     [plane], ax
        mov     ax, geobuf+8
        mov     [p0p], ax
        add     ax, [plane]
        mov     [p1p], ax
        mov     di, wallout
        mov     al, 'W'
        stosb
        mov     al, 'G'
        stosb
        mov     al, 'R'
        stosb
        mov     al, 'D'
        stosb
        mov     al, 10
        stosb
        stosb
        mov     word [crop_row], 0
.row:
        cmp     word [crop_row], 10
        jae     .done_cells
        mov     word [crop_col], 0
.col:
        cmp     word [crop_col], 10
        jae     .next_row
        mov     ax, [crop_y]
        add     ax, [crop_row]
        cmp     ax, 5
        jb      .solid
        sub     ax, 5
        cmp     ax, [gH]
        jae     .solid
        mov     [crop_src_y], ax
        mov     ax, [crop_x]
        add     ax, [crop_col]
        cmp     ax, 5
        jb      .solid
        sub     ax, 5
        cmp     ax, [gW]
        jae     .solid
        mov     [crop_src_x], ax
        mov     ax, [crop_src_y]
        mul     word [gW]
        add     ax, [crop_src_x]
        mov     bx, ax
        mov     si, [p0p]
        mov     al, [si+bx]
        mov     ah, al
        shr     al, 4
        stosb
        mov     al, ah
        and     al, 0Fh
        stosb
        mov     si, [p1p]
        mov     al, [si+bx]
        mov     ah, al
        shr     al, 4
        stosb
        mov     al, ah
        and     al, 0Fh
        stosb
        jmp     .advance
.solid:
        xor     al, al
        stosb
        stosb
        stosb
        stosb
.advance:
        inc     word [crop_col]
        jmp     .col
.next_row:
        inc     word [crop_row]
        jmp     .row
.done_cells:
        mov     ax, di
        sub     ax, wallout
        mov     [outlen], ax
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, outname
        int     21h
        jc      .err
        mov     [outfh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, [outlen]
        mov     dx, wallout
        int     21h
        mov     bx, [outfh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.err:
        stc
        ret

; ============================================================================
;  render_map: top-down area map in mode 13h.
;  cell = min(320/W, 200/H) clamped to [2,14]; map centred.
; ============================================================================
render_map:
        ; cell width/height candidates
        mov     ax, 320
        xor     dx, dx
        div     word [gW]           ; ax = 320 / W
        mov     bx, ax
        mov     ax, 200
        xor     dx, dx
        div     word [gH]           ; ax = 200 / H
        cmp     ax, bx
        jbe     .haveh
        mov     ax, bx              ; ax = min(cw, ch)
.haveh:
        cmp     ax, 2
        jae     .cmin
        mov     ax, 2
.cmin:
        cmp     ax, 14
        jbe     .ccap
        mov     ax, 14
.ccap:
        mov     [cell], ax
        ; ox = (320 - W*cell)/2
        mov     ax, [gW]
        mul     word [cell]
        mov     bx, 320
        sub     bx, ax
        shr     bx, 1
        mov     [ox], bx
        ; oy = (200 - H*cell)/2
        mov     ax, [gH]
        mul     word [cell]
        mov     bx, 200
        sub     bx, ax
        shr     bx, 1
        mov     [oy], bx
        ; plane pointers: p0 = geobuf+8, p1 = p0 + W*H, p3 = p1 + 2*W*H
        mov     ax, [gW]
        mul     word [gH]
        mov     [plane], ax         ; W*H
        mov     ax, geobuf+8
        mov     [p0p], ax
        add     ax, [plane]
        mov     [p1p], ax
        add     ax, [plane]
        add     ax, [plane]
        mov     [p3p], ax

        ; enter mode 13h, es = A000  (re-entry point after returning from CCFP)
.redraw:
        mov     ax, 0013h
        int     10h
        mov     ax, 0A000h
        mov     es, ax

        mov     word [cy], 0
.yloop:
        mov     ax, [cy]
        cmp     ax, [gH]
        jae     .ydone
        mov     word [cx_], 0
.xloop:
        ; -- linear cell index i = cy*W + cx --
        mov     ax, [cy]
        mul     word [gW]
        add     ax, [cx_]
        mov     [ci], ax
        ; fetch wall planes
        mov     bx, [ci]
        mov     si, [p0p]
        mov     al, [si+bx]         ; plane0 byte
        mov     [b0], al
        mov     si, [p1p]
        mov     al, [si+bx]         ; plane1 byte
        mov     [b1], al
        mov     si, [p3p]
        mov     al, [si+bx]         ; plane3 (doors)
        mov     [b3], al
        ; cell origin x0 = ox + cx*cell, y0 = oy + cy*cell
        mov     ax, [cx_]
        mul     word [cell]
        add     ax, [ox]
        mov     [x0], ax
        mov     ax, [cy]
        mul     word [cell]
        add     ax, [oy]
        mov     [y0], ax
        ; len = cell+1 (corners meet)
        mov     ax, [cell]
        inc     ax
        mov     [seglen], ax

        ; North edge = b0>>4
        mov     al, [b0]
        shr     al, 4
        jz      .noN
        mov     cl, [b3]
        and     cl, 03h             ; door flag N
        call    edge_color
        mov     ax, [x0]
        mov     [px_], ax
        mov     ax, [y0]
        mov     [py_], ax
        call    hline
.noN:
        ; West edge = b1 & 0x0f
        mov     al, [b1]
        and     al, 0Fh
        jz      .noW
        mov     cl, [b3]
        shr     cl, 6               ; door flag W (bits 6-7)
        and     cl, 03h
        call    edge_color
        mov     ax, [x0]
        mov     [px_], ax
        mov     ax, [y0]
        mov     [py_], ax
        call    vline
.noW:
        ; East edge = b0 & 0x0f  -> at x0+cell
        mov     al, [b0]
        and     al, 0Fh
        jz      .noE
        mov     cl, [b3]
        shr     cl, 2
        and     cl, 03h             ; door flag E (bits 2-3)
        call    edge_color
        mov     ax, [x0]
        add     ax, [cell]
        mov     [px_], ax
        mov     ax, [y0]
        mov     [py_], ax
        call    vline
.noE:
        ; South edge = b1>>4  -> at y0+cell
        mov     al, [b1]
        shr     al, 4
        jz      .noS
        mov     cl, [b3]
        shr     cl, 4
        and     cl, 03h             ; door flag S (bits 4-5)
        call    edge_color
        mov     ax, [x0]
        mov     [px_], ax
        mov     ax, [y0]
        add     ax, [cell]
        mov     [py_], ax
        call    hline
.noS:
        inc     word [cx_]
        mov     ax, [cx_]
        cmp     ax, [gW]
        jb      .xloop
        inc     word [cy]
        jmp     .yloop
.ydone:
        ; drain stale keys, then wait
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
        ; HOTKEY 'F' / 'f' (or ENTER) -> drop into the CCFP first-person walk,
        ; then return here and re-draw the top-down map.  Any other key exits.
        ; 'F' is the documented hotkey (its ASCII is unambiguous regardless of
        ; keypad/BIOS translation); ENTER is accepted too as a convenience.
        cmp     al, 'F'
        je      .into_fp
        cmp     al, 'f'
        je      .into_fp
        cmp     al, 0Dh             ; ENTER (AL=0Dh, scancode 1Ch)
        je      .into_fp
        mov     ax, 0003h
        int     10h
        ret
.into_fp:
        ; Move the stack INTO our image before the EXEC excursion.  A .COM's stack
        ; lives at the very top of the 64 KB segment (SP=FFFEh), but launch_fp's
        ; shrink_mem (SETBLOCK) releases everything above prog_end -- which frees
        ; the old high stack out from under us, so CCFP would overwrite it and the
        ; post-EXEC redraw would crash on corrupted stack.  fp_stack sits inside
        ; the kept image, so it survives the shrink.  We never return up the old
        ; call chain (this path loops to .redraw and exits via 4C00h), so dropping
        ; the original SP is safe.
        cli
        push    ds
        pop     ss                  ; SS = DS (already equal, kept explicit)
        mov     sp, fp_stack_top
        sti
        call    launch_fp           ; bake _FPWALK.BIN + EXEC CCFP (restores video)
        ; CCFP restores text mode (mode 03h) on its Esc exit, so the screen is
        ; already clean for cc.  Re-draw the top-down map so the user lands back in
        ; the CCGEO viewer; the redraw runs on the kept-in-image stack.
        jmp     .redraw             ; re-render the top-down view, wait again

; pick the wall colour into [ecol]: cl = door flag (0 plain,1 door,2 gateway)
edge_color:
        push    ax
        mov     byte [ecol], 15     ; wall = white
        cmp     cl, 1
        jne     .ng
        mov     byte [ecol], 9      ; door = bright blue
        jmp     .d
.ng:
        cmp     cl, 2
        jne     .d
        mov     byte [ecol], 14     ; gateway = yellow
.d:
        pop     ax
        ret

; di = py_*320 + px_
plot_di:
        mov     ax, [py_]
        mov     bx, 320
        mul     bx
        add     ax, [px_]
        mov     di, ax
        ret

; horizontal run of [seglen] pixels of colour [ecol] from (px_,py_)
hline:
        call    plot_di
        mov     al, [ecol]
        mov     cx, [seglen]
        rep     stosb
        ret

; vertical run of [seglen] pixels of colour [ecol] from (px_,py_)
vline:
        call    plot_di
        mov     al, [ecol]
        mov     cx, [seglen]
.l:
        mov     [es:di], al
        add     di, 320
        loop    .l
        ret

; ============================================================================
;  launch_fp:  in-viewer "ENTER" bridge -- bake the CURRENTLY displayed map to a
;  fixed temp WALLS file (_FPWALK.BIN, via the existing bridge_walls routine) and
;  EXEC CCFP.COM on it in interactive walk mode, then return to the caller (which
;  re-draws the top-down map).  CCFP itself restores text mode on Esc; on any
;  failure we just return and the caller re-enters mode 13h cleanly.
;
;  Wall-tile fallback: if GEOn's textured-wall DAX files (8X8Dn.DAX and
;  WALLDEFn.DAX) plus the Gen1 boot-cap tile pool (8X8D1.DAX) are present in the
;  current directory we launch "/T /A n /W" (textured walk); otherwise we launch
;  just "/W" (outline walk, which needs no extra data and always works).  CCFP's
;  default pose (8 13 4) is used -- we pass no pose.
; ============================================================================
launch_fp:
        ; render_map left ES = A000h (video).  Every stosb below (the name copy and
        ; bridge_walls' wallout staging) targets ES:DI, so restore ES = DS first or
        ; we would scribble into VRAM instead of our data segment.
        push    ds
        pop     es
        ; --- bake the live map to _FPWALK.BIN using the /B bridge logic ---------
        ; copy the fixed temp name into `outname`, then reuse bridge_walls verbatim
        mov     si, s_fpwalls
        mov     di, outname
.cpname:
        lodsb
        stosb
        or      al, al
        jnz     .cpname
        call    bridge_walls            ; writes _FPWALK.BIN; CF=1 on create error
        jc      .ret                    ; cannot stage -> abort, leave map onscreen

        ; --- choose the command tail: " _FPWALK.BIN /T /A n /W" or "/W" -------
        ; derive n from GEOn.DAX, then probe DAX art in cwd (INT 21h findfirst).
        call    set_texture_area
        call    have_tile_files         ; ZF=1 if all texture inputs are present
        jz      .textured
        mov     si, s_tail_w            ; outline walk
        jmp     .settail
.textured:
        mov     si, s_tail_tw           ; textured walk
.settail:
        ; build the Pascal command tail: len byte + text + CR
        mov     di, fptail+1
        xor     cx, cx                  ; cx = char count
.tc:
        lodsb
        or      al, al
        jz      .tcend
        stosb
        inc     cx
        jmp     .tc
.tcend:
        mov     byte [di], 0Dh          ; DOS requires a CR-terminated tail
        mov     [fptail], cl            ; Pascal length (excludes CR)

        ; --- resolve "<our dir>\CCFP.COM" into childpath -----------------------
        call    build_child_path

        ; --- shrink our memory once (idempotent), then EXEC CCFP ---------------
        call    shrink_mem
        call    do_exec                 ; CF set on failure; video already text on
                                        ; CCFP's clean exit, or untouched on fail
.ret:
        ret

; ----------------------------------------------------------------------------
;  set_texture_area: derive area digit n from fname containing GEOn.DAX.  The
;  mutated probe names and CCFP tail default to area 1 when fname is GEO.GLB or
;  otherwise has no GEOn stem.
; ----------------------------------------------------------------------------
set_texture_area:
        mov     byte [geoarea_ch], '1'
        mov     si, fname
.scan:
        lodsb
        or      al, al
        jz      .apply
        and     al, 0DFh
        cmp     al, 'G'
        jne     .scan
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'E'
        jne     .scan
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'O'
        jne     .scan
        mov     al, [si+2]
        cmp     al, '1'
        jb      .scan
        cmp     al, '9'
        ja      .scan
        mov     [geoarea_ch], al
.apply:
        mov     al, [geoarea_ch]
        mov     [s_dax_8x8d+4], al
        mov     [s_dax_walldef+7], al
        mov     [s_tail_tw_area], al
        ret

; ----------------------------------------------------------------------------
;  have_tile_files: ZF=1 (set) iff 8X8Dn.DAX, WALLDEFn.DAX, and boot-cap
;  8X8D1.DAX exist in cwd.
;  Uses INT 21h AH=4Eh (find first); DTA = PSP:80h (the default, fine here).
; ----------------------------------------------------------------------------
have_tile_files:
        mov     ah, 4Eh
        xor     cx, cx                  ; normal attributes
        mov     dx, s_dax_8x8d
        int     21h
        jc      .no
        mov     ah, 4Eh
        xor     cx, cx
        mov     dx, s_dax_walldef
        int     21h
        jc      .no
        mov     ah, 4Eh
        xor     cx, cx
        mov     dx, s_dax_8x8d_boot
        int     21h
        jc      .no
        xor     ax, ax                  ; ZF=1 -> all found
        ret
.no:
        or      al, 1                   ; ZF=0 -> at least one missing
        ret

; ----------------------------------------------------------------------------
;  build_child_path: childpath = <CCGEO's own directory> + "CCFP.COM".  Resolved
;  from argv0 (the program-name string after the env block at PSP:[2Ch]); copied
;  verbatim from the verified ccglb.asm routine.  (env scan runs under push es.)
; ----------------------------------------------------------------------------
build_child_path:
        push    es
        mov     es, [2Ch]               ; environment segment
        xor     di, di
.scan:
        cmp     byte [es:di], 0
        jne     .adv
        cmp     byte [es:di+1], 0
        je      .endenv
.adv:
        inc     di
        jmp     .scan
.endenv:
        add     di, 2                   ; past the double-NUL
        add     di, 2                   ; skip the WORD string count -> argv0 start
        mov     bx, childpath           ; bx tracks dest
        xor     dx, dx                  ; dx = offset just past last '\' or ':'
.cpy:
        mov     al, [es:di]
        or      al, al
        jz      .stripped
        mov     [bx], al
        cmp     al, '\'
        je      .sep
        cmp     al, ':'
        je      .sep
        jmp     .cont
.sep:
        lea     dx, [bx+1]
        sub     dx, childpath
.cont:
        inc     bx
        inc     di
        jmp     .cpy
.stripped:
        pop     es
        mov     di, childpath
        add     di, dx                  ; di -> where the child basename goes
        mov     si, s_ccfp
.app:
        mov     al, [si]
        mov     [di], al
        or      al, al
        jz      .done
        inc     si
        inc     di
        jmp     .app
.done:
        ret

; ----------------------------------------------------------------------------
;  shrink_mem: SETBLOCK our PSP segment down to just our image + a stack pad so
;  the EXEC'd child has conventional RAM (a .COM otherwise owns all 640K).
;  Idempotent: shrinking to the same size again is harmless.
; ----------------------------------------------------------------------------
FP_STACKPAD equ 1024
shrink_mem:
        mov     bx, prog_end
        add     bx, FP_STACKPAD
        add     bx, 15
        shr     bx, 4
        mov     ah, 4Ah
        push    ds
        pop     es
        int     21h
        ret

; ----------------------------------------------------------------------------
;  do_exec: INT 21h 4B00h, ds:dx = childpath, es:bx = EPB.  EPB: env=0 (inherit),
;  cmd-tail = our fptail, two default FCBs.  Saves/restores SS:SP (DOS clobbers
;  them on return).  CF=1 on EXEC failure (CF preserved from INT 21h).
; ----------------------------------------------------------------------------
do_exec:
        mov     ax, ds
        mov     word [epb+0], 0         ; inherit parent environment
        mov     word [epb+2], fptail    ; command-tail offset
        mov     [epb+4], ax             ; command-tail segment
        mov     word [epb+6], 5Ch       ; FCB #1 in our PSP
        mov     [epb+8], ax
        mov     word [epb+10], 6Ch      ; FCB #2 in our PSP
        mov     [epb+12], ax
        mov     [save_sp], sp
        mov     [save_ss], ss
        push    ds
        pop     es
        mov     dx, childpath
        mov     bx, epb
        mov     ax, 4B00h
        int     21h
        ; DOS clobbers ALL segment regs except CS:IP across EXEC.  Restore SS:SP
        ; (saved CS-relative, safe with a bad DS) BEFORE touching the stack, then
        ; restore DS=CS (this is a .COM, so DS==CS at load) so the caller's
        ; re-draw can read our data segment again -- without this the post-EXEC
        ; redraw reads garbage through a stale DS.
        cli
        mov     ss, [cs:save_ss]
        mov     sp, [cs:save_sp]
        sti
        push    cs
        pop     ds                      ; DS = our segment again
        push    cs
        pop     es                      ; ES = DS for the redraw's string ops
        ret                             ; CF preserved from INT 21h on failure

; ============================================================================
;  Helpers (same idioms as cchlib.asm)
; ============================================================================
seek32:
        push    ax
        mov     bx, [fh]
        mov     ax, 4200h
        int     21h
        pop     ax
        ret

read_here:
        push    ax
        push    bx
        mov     bx, [fh]
        mov     ah, 3Fh
        int     21h
        pop     bx
        pop     ax
        ret

cat_si:
        lodsb
        or      al, al
        jz      .d
        stosb
        jmp     cat_si
.d:
        ret

; put low-32 decimal of dx:ax at di (di advanced)
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

; put ax as 4-digit zero-padded decimal at di
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
;  parse_args:  [L | /B | /C | /F] <file> [index] [out] [x] [y]
;    L  <file>            list
;    /B <file> <i> <out>  bridge map i to WALLS.BIN <out>
;    /C <file> <i> <out> <x> <y>
;                         bridge a compact 10x10 combat WGRD crop
;    /F <file> <i>        launch CCFP bridge for map i without viewer input
;       <file> <i>        render map i top-down (default)
; ============================================================================
parse_args:
        mov     byte [verb], 0
        mov     byte [fname], 0
        mov     byte [outname], 0
        mov     word [blkidx], 0
        mov     word [crop_x], 0
        mov     word [crop_y], 0
        mov     si, 81h
        call    skip_sp
        ; optional slash verb: "/B" full bridge, "/C" compact crop, or "/F" launch
        mov     al, [si]
        cmp     al, '/'
        jne     .chkL
        mov     ah, [si+1]
        and     ah, 0DFh
        cmp     ah, 'B'
        je      .setslash
        cmp     ah, 'C'
        je      .setslash
        cmp     ah, 'F'
        jne     .chkL
.setslash:
        mov     [verb], ah
        add     si, 2
        call    skip_sp
        jmp     .getfile
.chkL:
        ; optional lone L verb
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'L'
        jne     .getfile
        mov     ah, [si+1]
        cmp     ah, ' '
        jne     .getfile
        mov     byte [verb], 'L'
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
.dnum:
        mov     al, [si]
        cmp     al, '0'
        jb      .dend
        cmp     al, '9'
        ja      .dend
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
        jmp     .dnum
.dend:
        mov     [blkidx], bx
        ; /B and /C take a third token: the output WGRD filename
        cmp     byte [verb], 'B'
        je      .read_out
        cmp     byte [verb], 'C'
        jne     .pret
.read_out:
        call    skip_sp
        mov     di, outname
.ocf:
        mov     al, [si]
        or      al, al
        jz      .ofin
        cmp     al, 13
        je      .ofin
        cmp     al, ' '
        je      .ofin
        mov     [di], al
        inc     si
        inc     di
        jmp     .ocf
.ofin:
        mov     byte [di], 0
        cmp     byte [verb], 'C'
        jne     .pret
        call    skip_sp
        call    read_dec_token
        mov     [crop_x], bx
        call    skip_sp
        call    read_dec_token
        mov     [crop_y], bx
.pret:
        ret
.fin:
        mov     byte [di], 0
        ret

read_dec_token:
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
        ret

skip_sp:
        cmp     byte [si], ' '
        jne     .d
        inc     si
        jmp     skip_sp
.d:
        ret

; ============================================================================
;  Data
; ============================================================================
s_usage   db 'CCGEO <file.glb|.dax> <i> | L <file> | /B <file> <i> <out.bin> | /C <file> <i> <out.wgr> <x> <y> | /F <file> <i>  (DAX i=0 auto)',13,10,'$'
s_noopen  db 'cannot open file',13,10,'$'
s_badhdr  db 'not an HLIB, DAX, or FRUA GEO record',13,10,'$'
s_nofind  db 'map index out of range',13,10,'$'
s_nowrite db 'cannot create output file',13,10,'$'
s_ext_geo db '.GEO',0

; --- in-viewer ENTER -> CCFP first-person bridge ----------------------------
s_fpwalls     db '_FPWALK.BIN',0       ; fixed temp WALLS file (cwd, derived data)
s_ccfp        db 'CCFP.COM',0          ; sibling first-person viewer (co-located)
s_dax_8x8d    db '8X8D1.DAX',0         ; GEOn textured-wall tile pool (mutated)
s_dax_walldef db 'WALLDEF1.DAX',0      ; GEOn wall->tile route table (mutated)
s_dax_8x8d_boot db '8X8D1.DAX',0       ; boot-cap tile pool needed by CCFP /T
; command tails handed to CCFP (text only; built into the Pascal `fptail`):
s_tail_w      db ' _FPWALK.BIN /W',0       ; outline walk (always works)
s_tail_tw     db ' _FPWALK.BIN /T /A '     ; textured walk (needs DAX art)
s_tail_tw_area db '1'
              db ' /W',0
geoarea_ch    db '1'

PTRCAP    equ 256
verb        db 0
fh          dw 0
fhdr        times 16 db 0
ptrcount    dw 0
ptrs        times PTRCAP dd 0

tmphdr      times 2 db 0
mi          dw 0
geo_idx     dw 0
geo_logical dw 0
geo_cb      dw 0
found       db 0
cur_off     dw 0
mlen        dw 0
gW          dw 0
gH          dw 0
blkidx      dw 0
id_table_off dw 0
id_table_len dw 0
id_count   dw 0
id_i       dw 0
idrec      times 4 db 0

; --- Gen1 (CoK/DoK DAX) container state --------------------------------------
DAXTOC_ENTRIES equ 64      ; clamp: real GEOn.DAX files have 2-8 entries
COMPBUF_SZ     equ 2048    ; clamp: real GEO blocks compress to <= ~1.1 KB
gen1        db 0           ; 1 iff [fname] sniffed as a Gen1 DAX (not HLIB)
glib        db 0           ; 1 iff [fname] sniffed as an Amiga GLIB DATA library
frua        db 0           ; 1 iff [fname] is a direct FRUA FORM/AMOD GEOxxx.DAT
dax_n       dw 0           ; DAX TOC entry count
dax_base    dw 0           ; DAX data-section base (2 + toc_bytes)
rle_lim     dw 0           ; decode_rle_mem: bytes to produce
frua_len    dw 0           ; validated direct FORM/AMOD source length
rle_off     dw 0           ; decode_rle_mem: bytes produced so far
daxtoc      times DAXTOC_ENTRIES*9 db 0
compbuf     times COMPBUF_SZ db 0

plane       dw 0
p0p         dw 0
p1p         dw 0
p2p         dw 0
p3p         dw 0
crop_x      dw 0
crop_y      dw 0
crop_row    dw 0
crop_col    dw 0
crop_src_x  dw 0
crop_src_y  dw 0
cell        dw 0
ox          dw 0
oy          dw 0
cx_         dw 0
cy          dw 0
ci          dw 0
x0          dw 0
y0          dw 0
px_         dw 0
py_         dw 0
seglen      dw 0
b0          db 0
b1          db 0
b3          db 0
ecol        db 0

d32lo       dw 0
d32hi       dw 0
d32buf      times 12 db 0

; /B bridge bookkeeping
outfh       dw 0
outlen      dw 0

fname       times 128 db 0
outname     times 128 db 0
linebuf     times 64 db 0
geobuf      times 4096 db 0
; One direct FRUA GEOxxx.DAT record (installed records are 12,962 bytes).
; It is normalized into geobuf before any renderer or bridge reads it.
fruabuf     times FRUA_GEO_MAX db 0
; WGRD payload staging: 6-byte header + W*H*4 cells + optional plane2/plane3
; tails.  Verified GEO maps include DQK's 28x28 (784 cells -> 4710 bytes);
; 8192 leaves generous headroom.
wallout     times 8192 db 0

; --- CCFP EXEC bridge bookkeeping (mirrors ccglb.asm) ------------------------
save_sp     dw 0
save_ss     dw 0
epb         times 14 db 0
childpath   times 144 db 0
fptail      times 130 db 0             ; Pascal: len byte + up to 127 chars + CR

; In-image stack for the CCFP EXEC excursion (see .into_fp).  Lives below
; prog_end so shrink_mem keeps it; 512 bytes is ample for the redraw + EXEC.
            times 512 db 0
fp_stack_top equ $                      ; SP loaded here (full-descending stack)

prog_end    equ $                       ; image end; shrink_mem keeps up to here
