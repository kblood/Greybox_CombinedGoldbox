; ============================================================================
;  CCHLIB.COM  --  DQK "HLIB" / DataLib (.TLB / .GLB) lister + tile viewer.
;
;  One binary, two roles (so the complex HLIB walk is shared):
;    CCHLIB L <file>            list every image as "<size> Innnn.HTI" (cc [open])
;    CCHLIB X <file> <i> <dir>  extract image i's raw span to dir\Innnn.HTI
;    CCHLIB <file> <i>          display image i in VGA mode 13h     (cc [view])
;    CCHLIB /D <file> <i> [out] dump decoded RAW (imgw,imgh,indices,768pal) -> out/CCHLIB.RAW
;    CCHLIB W <file> [set out [count]]
;                               summarize DQK/FRUA 47-image groups; optionally
;                               emit count consecutive decoded GBWS wall sets
;    CCHLIB S <file> <id> <dir>  extract HLIB master set id as dir\Snnnn.HLB
;
;  IMAGE vs DATA libraries (the leaf-type validation, project goal #7):
;  The container tag at off 12 selects the role.  "TILE"/"HLIB" => image library
;  (the walk above).  "DATA"/"DIG4" (SOUNDS/MONCHA/ECL/GEO .GLB) => a NON-IMAGE
;  DATA library whose members are opaque byte chunks, NOT images.  For those the
;  same verbs operate on FLAT pointer spans instead of walking images:
;    CCHLIB L <file>            list members as "<size> Dnnnn.HTD" (BY TYPE, no hang)
;    CCHLIB X <file> <i> <dir>  extract member i's raw bytes to dir\Dnnnn.HTD (exact)
;    CCHLIB <file> <i>          HEX-DUMP member i to stdout (cc F3), not mode 13h
;  Member i = [ptrs[i], ptrs[i+1]) for i in 0..count-2, matching hlib_decode.py's
;  non-image branch exactly -> safe to map .glb in cc.ini (see foot of file).
;
;  HLIB = VGA 256-colour, 8bpp chunky, Chain-4 interleaved pixels, an 8-bit-RGB
;  colour table per leaf, pointer-table directory, MASTER libs nest self-contained
;  leaf TILE files.  Mirrors tools/hlib_decode.py walk()/decode_image() so the
;  flat image index here == the oracle's enumeration order.  See docs/hlib-format.md.
;
;  Methods implemented (all verified byte-identical to hlib_decode.py): 16
;  (uncompressed opaque -- DUNGCOM/WILDCOM dungeon tiles), 18 (compressed opaque
;  -- BIGPIC/TITLE/PICA backdrops), 17 (AND/OR mask), 21 (uncompressed
;  transparent), 23 (compressed transparent sprites -- PICA/SPRIT; index 255 = key).
;
;  Scope: .TLB leaf/master image libraries AND .GLB data libraries.  The tag-based
;  is_data split means a DATA .GLB now lists/dumps by type instead of mis-walking
;  as images.  (NOTE: MONCHA.GLB tags "DATA", not an image master -- the oracle
;  treats it as a data library too, so CCHLIB does the same.)  Pointer counts are
;  still clamped to PTRCAP(256) as belt-and-suspenders.
;
;  Build:  build.ps1 cchlib   (nasm -f bin -> build\cchlib.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

RAW_SEG_OFF equ 1000h           ; cs+1000h : raw image span (file bytes)
IMG_SEG_OFF equ 2000h           ; cs+2000h : decoded 8bpp indices (width*height)

start:
        mov     ax, cs
        add     ax, RAW_SEG_OFF
        mov     [raw_seg], ax
        mov     ax, cs
        add     ax, IMG_SEG_OFF
        mov     [img_seg], ax

        call    parse_args
        cmp     byte [fname], 0
        je      .usage

        ; open the container
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .noopen
        mov     [fh], ax

        call    read_container_header
        jc      .badhdr

        cmp     byte [verb], 'L'
        je      .do_list
        cmp     byte [verb], 'X'
        je      .do_extract
        cmp     byte [verb], 'W'
        je      .do_wall
        cmp     byte [verb], 'S'
        je      .do_set
        ; ---- DATA/DIG4 library: members are flat byte spans, not images. The
        ; default action (cc F3) HEX-DUMPS member [blkidx] instead of rendering. ----
        cmp     byte [is_data], 0
        je      .img_default
        call    find_member         ; -> mem_start/mem_end, CF=1 if out of range
        jc      .nofind
        call    hexdump_member
        jmp     .done
.img_default:
        ; default / '/D' : locate + decode image [blkidx]
        call    find_image          ; -> img_start/img_end/pal_off, CF=1 if not found
        jc      .nofind
        call    load_palette
        call    decode_image        ; -> img_seg, [imgw],[imgh]; CF=1 unsupported
        jc      .unsupp
        cmp     byte [dumpmode], 0
        jne     .dump
        call    show_image
        jmp     .done
.dump:
        call    write_raw
        jmp     .done
.do_list:
        cmp     byte [is_data], 0
        jne     .list_data
        call    list_images
        jmp     .done
.list_data:
        call    list_members        ; emit "<size> Dnnnn.HTD" per flat member
        jmp     .done
.do_extract:
        cmp     byte [is_data], 0
        jne     .extract_data
        call    find_image
        jc      .nofind
        call    extract_image
        jmp     .done
.extract_data:
        call    find_member
        jc      .nofind
        call    extract_member      ; raw member bytes -> dir\Dnnnn.HTD (byte-exact)
        jmp     .done
.do_wall:
        cmp     byte [is_data], 0
        jne     .notimg
        call    wall_summary
        jc      .nofind
        jmp     .done
.do_set:
        call    extract_master_set
        jc      .seterr
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
.seterr:
        mov     dx, s_seterr
        jmp     .closedie
.unsupp:
        mov     dx, s_unsupp
        jmp     .closedie
.notimg:
        mov     dx, s_notimg
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
;  Container header: read "HLIB" or Amiga "GLIB", file size, pointer count,
;  tag, pointer list.
;  Pointers go into `ptrs` (count DWORDs).  CF=1 on a bad signature.
; ============================================================================
read_container_header:
        xor     cx, cx              ; seek 0
        xor     dx, dx
        call    seek32
        mov     dx, fhdr            ; read 16-byte header into fhdr
        mov     cx, 16
        call    read_here
        mov     byte [is_glib], 0
        cmp     word [fhdr], 'HL'
        jne     .try_glib
        cmp     word [fhdr+2], 'IB'
        jne     .bad
        mov     ax, [fhdr+8]        ; stored count-1
        jmp     .count_ax
.try_glib:
        cmp     word [fhdr], 'GL'
        jne     .bad
        cmp     word [fhdr+2], 'IB'
        jne     .bad
        mov     byte [is_glib], 1
        mov     ax, [fhdr+8]        ; big-endian stored count-1
        xchg    al, ah
.count_ax:
        inc     ax
        cmp     ax, PTRCAP          ; clamp: a non-image/garbage header could carry
        jbe     .pcok               ; a huge count that would overflow `ptrs` (256)
        mov     ax, PTRCAP
.pcok:
        mov     [ptrcount], ax
        ; tag at off 12: "TILE"=>leaf image, "HLIB"=>image master, anything else
        ; ("DATA"/"DIG4") => a NON-IMAGE data library (members are flat byte spans).
        ; Amiga GLIB image/TILE leaves use a different nested image directory
        ; shape; keep them in the safe opaque-member DATA role until that format
        ; is decoded instead of trying to render bogus image spans.
        ; First 2 chars suffice: TI / HL / DA / DI all differ.
        mov     ax, [fhdr+12]
        mov     [tag], ax
        mov     byte [is_data], 0
        cmp     byte [is_glib], 0
        je      .class_hlib
        mov     byte [is_data], 1
        jmp     .pcok2
.class_hlib:
        cmp     ax, 'TI'            ; leaf TILE
        je      .pcok2
        cmp     ax, 'HL'            ; image master
        je      .pcok2
        mov     byte [is_data], 1  ; DATA / DIG4 -> per-type data library
.pcok2:
        ; read the pointer list (count DWORDs) from offset 16
        mov     cx, 0
        mov     dx, 16
        call    seek32
        mov     ax, [ptrcount]
        shl     ax, 2               ; bytes = count*4
        mov     cx, ax
        mov     dx, ptrs
        call    read_here
        cmp     byte [is_glib], 0
        je      .done
        mov     si, ptrs
        mov     cx, [ptrcount]
        call    byteswap_dwords
.done:
        clc
        ret
.bad:
        stc
        ret

; Convert cx big-endian dwords at si to little-endian in place.
byteswap_dwords:
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
;  Enumeration core (mirrors hlib_decode.walk + iter_leaf_images).
;  Walks every image in flat order.  For each image calls [enum_cb] with
;  img_start/img_end (DWORD at those vars) and pal_off, and the running index
;  in [gidx].  enum_cb returns CF=1 to STOP the walk (used by find_image).
; ============================================================================
enumerate:
        mov     word [gidx], 0
        ; MASTER ("HL.."/"GL..") vs LEAF ("TI..")
        cmp     word [tag], 'HL'
        je      .master
        cmp     word [tag], 'GL'
        je      .master
        ; ---- leaf: one set whose base is 0, header already in fhdr/ptrs ----
        xor     ax, ax              ; set_base = 0
        xor     dx, dx
        mov     [set_base], ax
        mov     [set_base+2], dx
        mov     si, fhdr            ; sub-header source = file header
        mov     di, ptrs            ; sub-pointers source = file ptrs
        mov     cx, [ptrcount]
        call    walk_one_set
        ret
.master:
        ; sets run ptr[1] .. ptr[count-2]; each is a self-contained leaf.
        mov     word [si_idx], 1
.mloop:
        mov     ax, [ptrcount]
        dec     ax                  ; last index = count-1 (EOF); sets up to count-2
        cmp     word [si_idx], ax
        jae     .mdone
        ; set_base = ptrs[si_idx]
        mov     bx, [si_idx]
        shl     bx, 2
        mov     ax, [ptrs+bx]
        mov     dx, [ptrs+bx+2]
        mov     [set_base], ax
        mov     [set_base+2], dx
        ; read this set's sub-header (16 bytes) + sub-pointers into shdr/sptrs
        mov     cx, [set_base+2]
        mov     dx, [set_base]
        call    seek32
        mov     dx, shdr
        mov     cx, 16
        call    read_here
        mov     ax, [shdr+8]
        cmp     byte [is_glib], 0
        je      .sub_count_ok
        xchg    al, ah
.sub_count_ok:
        inc     ax
        cmp     ax, PTRCAP          ; clamp (see read_container_header): a data set
        jbe     .scok               ; (DIG4/DATA) misread as a leaf can carry garbage
        mov     ax, PTRCAP
.scok:
        mov     [sptrcount], ax
        ; sub-pointers from set_base+16
        mov     ax, [set_base]
        mov     dx, [set_base+2]
        add     ax, 16
        adc     dx, 0
        mov     cx, dx
        mov     dx, ax
        call    seek32
        mov     ax, [sptrcount]
        shl     ax, 2
        mov     cx, ax
        mov     dx, sptrs
        call    read_here
        cmp     byte [is_glib], 0
        je      .sptrs_ok
        mov     si, sptrs
        mov     cx, [sptrcount]
        call    byteswap_dwords
.sptrs_ok:
        ; walk this set
        mov     si, shdr
        mov     di, sptrs
        mov     cx, [sptrcount]
        call    walk_one_set
        jc      .mstop              ; callback asked to stop
        inc     word [si_idx]
        jmp     .mloop
.mdone:
        clc
        ret
.mstop:
        ret

; Walk one leaf set.  Inputs: [set_base] (DWORD abs), si->sub header(16), di->sub
; pointers(DWORDs, RELATIVE to set_base), cx = sub pointer count.
; Determines palette offset + first image index, then iterates images.
walk_one_set:
        mov     [ws_cnt], cx
        mov     [ws_hdr], si
        mov     [ws_ptr], di
        ; magic = byte [si+11]
        mov     al, [si+11]
        mov     [ws_magic], al
        ; default: no palette
        xor     ax, ax
        mov     [pal_off], ax
        mov     [pal_off+2], ax
        cmp     byte [ws_magic], 1
        jne     .magic0
        ; magic==1: ptr[1]=colour table, images from ptr[2]
        mov     word [first_img], 2
        mov     bx, [ws_ptr]
        mov     ax, [bx+4]          ; sptrs[1] low
        mov     dx, [bx+6]          ; sptrs[1] high
        call    abs_from_set
        mov     ax, [scratch]       ; pal_off = set_base + sptrs[1]
        mov     [pal_off], ax
        mov     ax, [scratch+2]
        mov     [pal_off+2], ax
        jmp     .iter
.magic0:
        ; magic==0: ptr[0] = colour table (or first image if no palette)
        mov     word [first_img], 1
        mov     bx, [ws_ptr]
        mov     ax, [bx]            ; sptrs[0]
        mov     dx, [bx+2]
        call    abs_from_set        ; pal_off = set_base + sptrs[0]
        mov     ax, [scratch]
        mov     [pal_off], ax
        mov     ax, [scratch+2]
        mov     [pal_off+2], ax
        ; peek ncolors (word at pal_off+4); 0 => no palette, ptr[0] is an image
        mov     ax, [pal_off]
        mov     dx, [pal_off+2]
        add     ax, 4
        adc     dx, 0
        mov     cx, dx
        mov     dx, ax
        call    seek32
        mov     dx, tmpw
        mov     cx, 2
        call    read_here
        cmp     word [tmpw], 0
        jne     .iter               ; palette present
        mov     word [first_img], 0 ; no palette -> ptr[0] is the first image
        xor     ax, ax
        mov     [pal_off], ax
        mov     [pal_off+2], ax
.iter:
        ; for i in first_img .. ws_cnt-2:  image span = [sptrs[i], sptrs[i+1])
        mov     ax, [first_img]
        mov     [img_i], ax
.iloop:
        mov     ax, [ws_cnt]
        dec     ax                  ; last = cnt-1 (EOF rel); images up to cnt-2
        cmp     word [img_i], ax
        jae     .idone
        ; img_start = set_base + sptrs[img_i]
        mov     bx, [img_i]
        shl     bx, 2
        add     bx, [ws_ptr]
        mov     ax, [bx]
        mov     dx, [bx+2]
        call    abs_from_set
        mov     ax, [scratch]
        mov     [img_start], ax
        mov     ax, [scratch+2]
        mov     [img_start+2], ax
        ; img_end = set_base + sptrs[img_i+1]
        mov     bx, [img_i]
        inc     bx
        shl     bx, 2
        add     bx, [ws_ptr]
        mov     ax, [bx]
        mov     dx, [bx+2]
        call    abs_from_set
        mov     ax, [scratch]
        mov     [img_end], ax
        mov     ax, [scratch+2]
        mov     [img_end+2], ax
        ; invoke callback
        mov     bx, [enum_cb]
        call    bx                  ; CF=1 -> stop
        jc      .stop
        inc     word [gidx]
        inc     word [img_i]
        jmp     .iloop
.idone:
        clc
        ret
.stop:
        ret

; dx:ax + set_base -> [scratch] (DWORD).  Callers that want the palette offset
; copy scratch -> pal_off themselves (so the image-bounds calls don't clobber it).
abs_from_set:
        add     ax, [set_base]
        adc     dx, [set_base+2]
        mov     [scratch], ax
        mov     [scratch+2], dx
        ret

; ============================================================================
;  list_images : enumerate, emit "<size> Innnn.HTI\r\n" per image to stdout.
; ============================================================================
list_images:
        mov     word [enum_cb], cb_list
        call    enumerate
        ret

; ============================================================================
;  wall_summary : enumerate images and report DQK/FRUA 47-image wall-set groups.
; ============================================================================
WALL_GROUP  equ 47

wall_summary:
        mov     word [wallm21], 0
        mov     word [wallbad], 0
        mov     word [enum_cb], cb_wall
        call    enumerate

        mov     ax, [gidx]
        xor     dx, dx
        mov     si, s_w_images
        call    emit_label_dec

        mov     ax, [gidx]
        xor     dx, dx
        mov     bx, WALL_GROUP
        div     bx
        mov     [wallsets], ax
        mov     [wallrem], dx

        mov     ax, [wallsets]
        xor     dx, dx
        mov     si, s_w_sets
        call    emit_label_dec

        mov     ax, [wallrem]
        xor     dx, dx
        mov     si, s_w_rem
        call    emit_label_dec

        mov     ax, [wallm21]
        xor     dx, dx
        mov     si, s_w_m21
        call    emit_label_dec

        mov     ax, [wallbad]
        xor     dx, dx
        mov     si, s_w_bad
        call    emit_label_dec

        mov     si, s_w_groups
        call    emit_str_line
        cmp     byte [dirarg], 0
        je      .summary_only
        call    write_wall_bundle
        ret
.summary_only:
        clc
        ret

cb_wall:
        mov     cx, [img_start+2]
        mov     dx, [img_start]
        call    seek32
        mov     dx, imghdr
        mov     cx, 8
        call    read_here
        cmp     byte [imghdr+7], 21
        je      .m21
        inc     word [wallbad]
        clc
        ret
.m21:
        inc     word [wallm21]
        clc
        ret

; ============================================================================
;  write_wall_bundle : W <file> <set> <out> [count]
;  Writes a decoded GBWS stream for one or more 47-image DQK/FRUA wall sets:
;    GBWS header (16 bytes), then N * (GBWI record, pixels, 768-byte palette).
;  Version 2 appends the original signed HLIB image y/x offsets to each GBWI
;  header so CCFP /F can preserve the crop-placement hint.
; ============================================================================
write_wall_bundle:
        mov     ax, [wallcount]
        or      ax, ax
        jz      .err
        mov     bx, WALL_GROUP
        mul     bx
        or      dx, dx
        jnz     .err
        mov     [walltotal], ax

        mov     ax, [blkidx]
        mov     [wallsetidx], ax
        mov     bx, WALL_GROUP
        mul     bx
        or      dx, dx
        jnz     .err
        mov     [wallbase], ax
        mov     bx, [walltotal]
        dec     bx
        add     ax, bx
        jc      .err
        cmp     ax, [gidx]
        jae     .err

        mov     ax, [wallsetidx]
        mov     [wallhdr+6], ax
        mov     ax, [walltotal]
        mov     [wallhdr+8], ax
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, dirarg
        int     21h
        jc      .err
        mov     [ofh], ax

        mov     dx, wallhdr
        mov     cx, WALLHDR_LEN
        call    write_out
        jc      .close_err

        mov     word [walllocal], 0
.loop:
        mov     ax, [walllocal]
        cmp     ax, [walltotal]
        jae     .done
        add     ax, [wallbase]
        mov     [wallglobal], ax
        mov     [blkidx], ax
        call    find_image
        jc      .close_err
        call    load_palette
        call    decode_image
        jc      .close_err

        call    build_wall_image_header
        mov     dx, wallihdr
        mov     cx, WALLIHDR_LEN
        call    write_out
        jc      .close_err

        push    ds
        mov     ds, [cs:img_seg]
        xor     dx, dx
        mov     cx, [cs:img_npix]
        call    write_out
        pop     ds
        jc      .close_err

        mov     dx, pal
        mov     cx, 768
        call    write_out
        jc      .close_err

        inc     word [walllocal]
        jmp     .loop
.done:
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_err:
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.err:
    stc
    ret

; CCHLIB S <master.hlib> <logical-set-id> <dir>
; Copy exactly the nested leaf selected by member[0]'s {id,ptr#} table.
; The destination is created with DOS AH=5Bh so an existing file is never
; truncated. This exports one bounded leaf, not a decoded/rendered battlefield.
extract_master_set:
        cmp     word [tag], 'HL'
        jne     .err
        cmp     word [blkidx], 9999
        ja      .err
        ; The master set-id table is member 0 at ptrs[0]. Read its entry count.
        mov     ax, [ptrs]
        mov     dx, [ptrs+2]
        mov     cx, dx
        mov     dx, ax
        call    seek32
        jc      .err
        mov     bx, [fh]
        mov     ah, 3Fh
        mov     cx, 2
        mov     dx, tmpw
        int     21h
        jc      .err
        cmp     ax, 2
        jne     .err
        mov     ax, [tmpw]
        or      ax, ax
        jz      .err
        cmp     ax, PTRCAP
        ja      .err
        mov     [set_entry_count], ax
        ; Read count * {id,ptr#} into the existing secondary pointer scratch.
        mov     ax, [ptrs]
        mov     dx, [ptrs+2]
        add     ax, 2
        adc     dx, 0
        mov     cx, dx
        mov     dx, ax
        call    seek32
        jc      .err
        mov     ax, [set_entry_count]
        shl     ax, 2
        mov     [set_table_bytes], ax
        mov     cx, ax
        mov     dx, sptrs
        mov     bx, [fh]
        mov     ah, 3Fh
        int     21h
        jc      .err
        cmp     ax, [set_table_bytes]
        jne     .err
        mov     si, sptrs
        mov     cx, [set_entry_count]
.find:
        mov     ax, [si]
        cmp     ax, [blkidx]
        je      .found
        add     si, 4
        loop    .find
        jmp     .err
.found:
        mov     ax, [si+2]            ; logical id -> 1-based leaf pointer number
        cmp     ax, 1
        jb      .err                  ; ptr[0] is the set-id table
        inc     ax
        cmp     ax, [ptrcount]        ; ptr[n] is the next leaf or EOF
        jae     .err
        mov     ax, [si+2]
        mov     [si_idx], ax
        shl     ax, 2
        mov     bx, ax
        mov     ax, [ptrs+bx]
        mov     [mem_start], ax
        mov     ax, [ptrs+bx+2]
        mov     [mem_start+2], ax
        mov     ax, [ptrs+bx+4]
        mov     [mem_end], ax
        mov     ax, [ptrs+bx+6]
        mov     [mem_end+2], ax
        mov     ax, [mem_end]
        mov     dx, [mem_end+2]
        sub     ax, [mem_start]
        sbb     dx, [mem_start+2]
        or      dx, dx
        jnz     .err                  ; supported leaf must fit one DOS read
        or      ax, ax
        jz      .err
        mov     [span_len], ax
        call    build_set_destpath
        mov     ax, 5B00h             ; create new, never overwrite an existing set
        xor     cx, cx
        mov     dx, destpath
        int     21h
        jc      .err
        mov     [ofh], ax
        mov     cx, [mem_start+2]
        mov     dx, [mem_start]
        call    seek32
        jc      .close_bad
        push    ds
        mov     ds, [cs:raw_seg]
        mov     bx, [cs:fh]
        mov     ah, 3Fh
        mov     cx, [cs:span_len]
        xor     dx, dx
        int     21h
        pop     ds
        jc      .close_bad
        cmp     ax, [cs:span_len]
        jne     .close_bad
        push    ds
        mov     ds, [cs:raw_seg]
        mov     bx, [cs:ofh]
        mov     ah, 40h
        mov     cx, [cs:span_len]
        xor     dx, dx
        int     21h
        pop     ds
        jc      .close_bad
        cmp     ax, [cs:span_len]
        jne     .close_bad
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_bad:
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        mov     dx, destpath            ; 5Bh guaranteed this partial is ours
        mov     ah, 41h
        int     21h
.err:
        stc
        ret

build_set_destpath:
        mov     si, dirarg
        mov     di, destpath
.dir:
        lodsb
        or      al, al
        jz      .slash
        stosb
        jmp     .dir
.slash:
        cmp     di, destpath
        je      .name
        cmp     byte [di-1], '\'
        je      .name
        mov     al, '\'
        stosb
.name:
        mov     al, 'S'
        stosb
        mov     ax, [blkidx]
        call    put_dec16_4
        mov     si, s_ext_hlb
        call    cat_si
        mov     byte [di], 0
        ret

build_wall_image_header:
        mov     ax, [walllocal]
        mov     [wallihdr+4], ax
        mov     ax, [wallglobal]
        mov     [wallihdr+6], ax
        mov     ax, [imgw]
        mov     [wallihdr+8], ax
        mov     ax, [imgh]
        mov     [wallihdr+10], ax
        mov     ax, [img_npix]
        mov     [wallihdr+12], ax
        mov     ax, [pal_first]
        mov     [wallihdr+14], ax
        mov     ax, [pal_ncol]
        mov     [wallihdr+16], ax
        mov     al, [method]
        mov     [wallihdr+18], al
        mov     ax, [imghdr+2]
        mov     [wallihdr+20], ax
        mov     ax, [imghdr+4]
        mov     [wallihdr+22], ax

        mov     ax, [walllocal]
        xor     dx, dx
        mov     bx, WALL_GROUP
        div     bx
        mov     ax, dx
        cmp     ax, 10
        jb      .g1
        cmp     ax, 20
        jb      .g2
        cmp     ax, 29
        jb      .g3
        cmp     ax, 38
        jb      .g4
        mov     al, 5
        jmp     .setg
.g1:
        mov     al, 1
        jmp     .setg
.g2:
        mov     al, 2
        jmp     .setg
.g3:
        mov     al, 3
        jmp     .setg
.g4:
        mov     al, 4
.setg:
        mov     [wallihdr+19], al
        ret

cb_list:
        ; size = img_end - img_start (low 32; we print low word-pair as decimal)
        mov     ax, [img_end]
        mov     dx, [img_end+2]
        sub     ax, [img_start]
        sbb     dx, [img_start+2]
        ; build line in linebuf: "<size> Innnn.HTI\r\n"
        mov     di, linebuf
        call    put_dec32           ; ax(lo)/dx(hi) decimal at di
        mov     al, ' '
        stosb
        mov     al, 'I'
        stosb
        mov     ax, [gidx]
        call    put_dec16_4         ; 4-digit zero-padded
        mov     si, s_ext_hti
        call    cat_si
        mov     al, 13
        stosb
        mov     al, 10
        stosb
        ; write to stdout (handle 1)
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, 1
        mov     ah, 40h
        int     21h
        clc                         ; keep walking
        ret

; ============================================================================
;  find_image : enumerate until gidx == blkidx; capture its span+palette.
;  CF=1 if not found.
; ============================================================================
find_image:
        mov     word [enum_cb], cb_find
        mov     byte [found], 0
        call    enumerate
        cmp     byte [found], 0
        je      .no
        clc
        ret
.no:
        stc
        ret

cb_find:
        mov     ax, [gidx]
        cmp     ax, [blkidx]
        jne     .keep
        ; capture (img_start/img_end/pal_off already set); stop the walk
        mov     byte [found], 1
        stc
        ret
.keep:
        clc
        ret

; ============================================================================
;  extract_image : write the raw image span [img_start,img_end) to dir\Innnn.HTI
; ============================================================================
extract_image:
        call    build_destpath
        mov     ah, 3Ch             ; create
        xor     cx, cx
        mov     dx, destpath
        int     21h
        jc      .ret
        mov     [ofh], ax
        ; span length (assume < 64KB) = img_end - img_start
        mov     ax, [img_end]
        sub     ax, [img_start]
        mov     [span_len], ax
        ; read span into raw_seg
        mov     cx, [img_start+2]
        mov     dx, [img_start]
        call    seek32
        push    ds
        mov     ds, [cs:raw_seg]
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, [cs:span_len]
        xor     dx, dx
        int     21h
        pop     ds
        ; write raw_seg -> file
        push    ds
        mov     ds, [cs:raw_seg]
        mov     ah, 40h
        mov     bx, [cs:ofh]
        mov     cx, [cs:span_len]
        xor     dx, dx
        int     21h
        pop     ds
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

; ============================================================================
;  DATA / DIG4 library support (tag != "TILE"/"HLIB").
;
;  These libraries reuse the HLIB container + pointer table but their members
;  are opaque byte chunks (DIG4 sound, DATA = ECL scripts / GEO maps / monster
;  records), NOT images.  Per hlib_decode.py's non-image branch, the members are
;  the FLAT positional spans of the top-level pointer list:
;     member i = [ptrs[i], ptrs[i+1])   for i in 0 .. ptrcount-2
;  (no magic/palette skip -- even MONCHA.GLB, magic=1, starts at ptrs[0]).  So
;  the flat member index here == the oracle's enumeration order exactly.
; ============================================================================

; member span -> [mem_start,mem_end) (DWORDs).  ax=index.  CF=1 if out of range.
member_span:
        mov     cx, [ptrcount]
        dec     cx                  ; member count = ptrcount-1
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

; list_members : emit "<size> Dnnnn.HTD\r\n" per flat member to stdout.
list_members:
        mov     word [gidx], 0
.loop:
        mov     ax, [gidx]
        mov     cx, [ptrcount]
        dec     cx
        cmp     ax, cx
        jae     .done
        call    member_span
        ; size = mem_end - mem_start
        mov     ax, [mem_end]
        mov     dx, [mem_end+2]
        sub     ax, [mem_start]
        sbb     dx, [mem_start+2]
        mov     di, linebuf
        call    put_dec32
        mov     al, ' '
        stosb
        mov     al, 'D'
        stosb
        mov     ax, [gidx]
        call    put_dec16_4
        mov     si, s_ext_htd
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
        inc     word [gidx]
        jmp     .loop
.done:
        ret

; find_member : resolve member [blkidx] span into mem_start/mem_end.  CF=1 if oor.
find_member:
        mov     ax, [blkidx]
        call    member_span
        ret

; read the member span [mem_start,mem_end) (assumed < 64KB) into raw_seg.
; sets [span_len].
read_member:
        mov     ax, [mem_end]
        sub     ax, [mem_start]
        mov     [span_len], ax
        mov     cx, [mem_start+2]
        mov     dx, [mem_start]
        call    seek32
        push    ds
        mov     ds, [cs:raw_seg]
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, [cs:span_len]
        xor     dx, dx
        int     21h
        pop     ds
        ret

; extract_member : write the raw member span to dir\Dnnnn.HTD (byte-exact).
extract_member:
        call    read_member
        call    build_destpath_d
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, destpath
        int     21h
        jc      .ret
        mov     [ofh], ax
        push    ds
        mov     ds, [cs:raw_seg]
        mov     ah, 40h
        mov     bx, [cs:ofh]
        mov     cx, [cs:span_len]
        xor     dx, dx
        int     21h
        pop     ds
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

; hexdump_member : print member [blkidx] as a canonical hex+ASCII dump to stdout
;  (offset  16 hex bytes  |ascii|).  Capped at HEXCAP bytes so a multi-KB member
;  doesn't flood the cc pager; a trailing note is printed when truncated.
HEXCAP  equ 1024
hexdump_member:
        call    read_member
        ; n = min(span_len, HEXCAP)
        mov     ax, [span_len]
        mov     word [hex_trunc], 0
        cmp     ax, HEXCAP
        jbe     .nset
        mov     ax, HEXCAP
        mov     word [hex_trunc], 1
.nset:
        mov     [hex_n], ax
        mov     word [hex_off], 0
.line:
        mov     ax, [hex_off]
        cmp     ax, [hex_n]
        jae     .tail
        mov     di, linebuf
        ; offset (4 hex digits)
        mov     ax, [hex_off]
        call    put_hex16
        mov     al, ' '
        stosb
        mov     al, ' '
        stosb
        ; up to 16 bytes
        mov     word [hex_col], 0
.bytes:
        mov     ax, [hex_col]
        cmp     ax, 16
        jae     .asc
        mov     ax, [hex_off]
        add     ax, [hex_col]
        cmp     ax, [hex_n]
        jae     .padbyte
        ; byte = raw_seg:[hex_off+hex_col]
        push    ds
        mov     bx, ax
        mov     ds, [cs:raw_seg]
        mov     al, [bx]
        pop     ds
        mov     [hexbyte], al
        call    put_hex8
        mov     al, ' '
        stosb
        inc     word [hex_col]
        jmp     .bytes
.padbyte:
        mov     al, ' '
        stosb
        mov     al, ' '
        stosb
        mov     al, ' '
        stosb
        inc     word [hex_col]
        jmp     .bytes
.asc:
        mov     al, '|'
        stosb
        mov     word [hex_col], 0
.ascloop:
        mov     ax, [hex_col]
        cmp     ax, 16
        jae     .ascend
        mov     ax, [hex_off]
        add     ax, [hex_col]
        cmp     ax, [hex_n]
        jae     .ascend
        push    ds
        mov     bx, ax
        mov     ds, [cs:raw_seg]
        mov     al, [bx]
        pop     ds
        cmp     al, 32
        jb      .dot
        cmp     al, 126
        ja      .dot
        jmp     .putc
.dot:
        mov     al, '.'
.putc:
        stosb
        inc     word [hex_col]
        jmp     .ascloop
.ascend:
        mov     al, '|'
        stosb
        mov     al, 13
        stosb
        mov     al, 10
        stosb
        ; write the line
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, 1
        mov     ah, 40h
        int     21h
        add     word [hex_off], 16
        jmp     .line
.tail:
        cmp     word [hex_trunc], 0
        je      .ret
        mov     dx, s_trunc
        mov     cx, s_trunc_len
        mov     bx, 1
        mov     ah, 40h
        int     21h
.ret:
        ret

; build destpath = dir + '\' + Dnnnn.HTD  (mirrors build_destpath but 'D'/.HTD)
build_destpath_d:
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
        mov     al, 'D'
        stosb
        mov     ax, [blkidx]
        call    put_dec16_4
        mov     si, s_ext_htd
        call    cat_si
        mov     byte [di], 0
        ret

; put ax as 4 hex digits at di
put_hex16:
        push    ax
        mov     al, ah
        call    put_hex8_al
        pop     ax
        call    put_hex8_al
        ret

; put [hexbyte] as 2 hex digits at di
put_hex8:
        mov     al, [hexbyte]
put_hex8_al:
        push    ax
        shr     al, 4
        call    .nib
        pop     ax
        and     al, 0Fh
        call    .nib
        ret
.nib:
        and     al, 0Fh
        cmp     al, 10
        jb      .dig
        add     al, 'A'-10
        jmp     .st
.dig:
        add     al, '0'
.st:
        stosb
        ret

; ============================================================================
;  load_palette : read the colour table at [pal_off] into pal[768] (>>2 done
;  later at DAC load).  If pal_off==0 leave a default grey ramp.
; ============================================================================
load_palette:
        ; default grey ramp so missing-palette leaves still show structure
        mov     di, pal
        xor     cx, cx
.gr:
        mov     ax, cx
        cmp     ax, 256
        jae     .grd
        stosb
        stosb
        stosb
        inc     cx
        jmp     .gr
.grd:
        mov     ax, [pal_off]
        or      ax, [pal_off+2]
        jz      .ret                ; no palette
        ; read 8-byte colour-table header
        mov     cx, [pal_off+2]
        mov     dx, [pal_off]
        call    seek32
        mov     dx, palhdr
        mov     cx, 8
        call    read_here
        mov     ax, [palhdr+2]      ; first_col
        mov     [pal_first], ax
        mov     ax, [palhdr+4]      ; ncolors
        mov     [pal_ncol], ax
        or      ax, ax
        jz      .ret
        ; read ncolors*3 RGB bytes into palrgb
        mov     ax, [pal_ncol]
        mov     bx, 3
        mul     bx
        mov     cx, ax              ; byte count
        mov     dx, palrgb
        call    read_here
        ; scatter into pal[] starting at first_col*3
        mov     ax, [pal_first]
        mov     bx, 3
        mul     bx
        mov     di, pal
        add     di, ax
        mov     si, palrgb
        mov     cx, [pal_ncol]
        mov     bx, 3
        push    cx
        mov     ax, cx
        mul     bx
        mov     cx, ax
        pop     ax
        rep     movsb
.ret:
        ret

; ============================================================================
;  decode_image : read image header at [img_start], deinterlace Chain-4 into
;  img_seg.  Sets [imgw],[imgh].  CF=1 if drawing method unsupported.
; ============================================================================
decode_image:
        ; read 8-byte image header
        mov     cx, [img_start+2]
        mov     dx, [img_start]
        call    seek32
        mov     dx, imghdr
        mov     cx, 8
        call    read_here
        mov     ax, [imghdr]        ; height
        mov     [imgh], ax
        movzx   ax, byte [imghdr+6] ; width/4
        shl     ax, 2               ; width
        mov     [imgw], ax
        mov     al, [imghdr+7]
        mov     [method], al
        ; q = width/4
        mov     ax, [imgw]
        shr     ax, 2
        mov     [qwidth], ax
        ; span body length = img_end - img_start - 8
        mov     ax, [img_end]
        sub     ax, [img_start]
        sub     ax, 8
        mov     [span_len], ax
        ; read body into raw_seg (image data starts right after the 8-byte header)
        mov     ax, [img_start]
        mov     dx, [img_start+2]
        add     ax, 8
        adc     dx, 0
        mov     cx, dx
        mov     dx, ax
        call    seek32
        push    ds
        mov     ds, [cs:raw_seg]
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, [cs:span_len]
        xor     dx, dx
        int     21h
        pop     ds
        ; clear img_seg to 255 (transparent key) for width*height
        mov     ax, [imgw]
        mul     word [imgh]
        mov     [img_npix], ax
        push    es
        mov     es, [img_seg]
        xor     di, di
        mov     cx, [img_npix]
        mov     al, 255
        rep     stosb
        pop     es
        ; dispatch by method
        mov     al, [method]
        cmp     al, 16
        je      .m16
        cmp     al, 21
        je      .m16                ; 21 = uncompressed (transparent) same layout
        cmp     al, 17
        je      .m17
        cmp     al, 18
        je      .m18
        cmp     al, 23
        je      .m23
        stc                         ; 25 (image-id list) not handled
        ret
; ---- method 16/21: uncompressed; 17: AND mask then OR mask (use OR = 2nd block) ----
.m16:
        mov     word [bodyk], 0
        jmp     .deint
.m17:
        mov     ax, [img_npix]      ; OR-mask block starts after the AND-mask block
        mov     [bodyk], ax
.deint:
        ; k=bodyk; for y: for s in 0..3: for i in 0..q-1: x=i*4+s; img[y*w+x]=body[k++]
        mov     word [cy], 0
.m16_y:
        mov     ax, [cy]
        cmp     ax, [imgh]
        jae     .m16_done
        mov     word [cs_], 0       ; sweep s
.m16_s:
        cmp     word [cs_], 4
        jae     .m16_sd
        mov     word [ci], 0        ; i
.m16_i:
        mov     ax, [ci]
        cmp     ax, [qwidth]
        jae     .m16_id
        ; x = i*4 + s
        mov     ax, [ci]
        shl     ax, 2
        add     ax, [cs_]
        ; dest = y*width + x
        mov     bx, [cy]
        push    ax
        mov     ax, [imgw]
        mul     bx
        pop     bx
        add     bx, ax              ; bx = dest offset
        ; src byte = raw_seg:[bodyk]
        push    ds
        mov     ds, [cs:raw_seg]
        mov     si, [cs:bodyk]
        mov     al, [si]
        pop     ds
        inc     word [bodyk]
        mov     es, [img_seg]
        mov     [es:bx], al
        inc     word [ci]
        jmp     .m16_i
.m16_id:
        inc     word [cs_]
        jmp     .m16_s
.m16_sd:
        inc     word [cy]
        jmp     .m16_y
.m16_done:
        clc
        ret
; ---- method 18: compressed opaque; one continuous run-stream per row over the
;      Chain-4 column order of `width` pixels ----
.m18:
        mov     word [bodyk], 0
        mov     word [cy], 0
.m18_y:
        mov     ax, [cy]
        cmp     ax, [imgh]
        jae     .m18_done
        mov     word [col], 0       ; 0..width-1 index into Chain-4 order
.m18_row:
        mov     ax, [col]
        cmp     ax, [imgw]
        jae     .m18_rowd
        ; fetch control byte
        call    body_getb           ; al = byte, advances bodyk; ZF set if EOF
        jc      .m18_done           ; ran out
        cmp     al, 128
        jae     .m18_run
        ; literal run of c+1
        movzx   cx, al
        inc     cx
.m18_lit:
        cmp     word [col], 0       ; (col<width checked at top, recheck inline)
        mov     ax, [col]
        cmp     ax, [imgw]
        jae     .m18_row
        call    body_getb
        jc      .m18_done
        call    chain4_put          ; write al at Chain-4 column [col] of row [cy]
        inc     word [col]
        loop    .m18_lit
        jmp     .m18_row
.m18_run:
        ; repeat next byte 257-c times
        neg     al                  ; al = 256-c (8-bit); +1 -> 257-c
        movzx   cx, al
        inc     cx
        call    body_getb           ; the value
        jc      .m18_done
        mov     [runval], al
.m18_rep:
        mov     ax, [col]
        cmp     ax, [imgw]
        jae     .m18_row
        mov     al, [runval]
        call    chain4_put
        inc     word [col]
        loop    .m18_rep
        jmp     .m18_row
.m18_rowd:
        inc     word [cy]
        jmp     .m18_y
.m18_done:
        clc
        ret
; ---- method 23: compressed transparent; 4 image sweeps, each row 0-terminated.
;      per row: c==0 ends row; c>=128 skip (256-c) transparent; c<128 copy c literals.
;      sweep column = col*4 + s  (col 0..q-1) ----
.m23:
        mov     word [bodyk], 0
        mov     word [cs_], 0       ; sweep s
.m23_s:
        cmp     word [cs_], 4
        jae     .m23_done
        mov     word [cy], 0
.m23_y:
        mov     ax, [cy]
        cmp     ax, [imgh]
        jae     .m23_yd
        mov     word [col], 0
.m23_ctrl:
        call    body_getb
        jc      .m23_done
        or      al, al
        jz      .m23_rowend         ; c==0 ends the row
        cmp     al, 128
        jae     .m23_skip
        movzx   ax, al              ; copy c literals
        mov     [litn], ax
.m23_lit:
        cmp     word [litn], 0
        jbe     .m23_ctrl
        call    body_getb
        jc      .m23_done
        mov     [runval], al        ; stash value (mul below clobbers dx/dl)
        mov     ax, [col]
        cmp     ax, [qwidth]
        jae     .m23_litadv         ; col past sweep width -> advance only
        ; dest = cy*width + col*4 + s
        mov     ax, [col]
        shl     ax, 2
        add     ax, [cs_]
        mov     bx, ax
        mov     ax, [cy]
        mul     word [imgw]
        add     bx, ax
        mov     es, [img_seg]
        mov     al, [runval]
        mov     [es:bx], al
.m23_litadv:
        inc     word [col]
        dec     word [litn]
        jmp     .m23_lit
.m23_skip:
        neg     al                  ; 256-c transparent pixels skipped
        movzx   ax, al
        add     [col], ax
        jmp     .m23_ctrl
.m23_rowend:
        inc     word [cy]
        jmp     .m23_y
.m23_yd:
        inc     word [cs_]
        jmp     .m23_s
.m23_done:
        clc
        ret

; write al into img_seg at row [cy], Chain-4 logical column [col].
; order[col] = (col % q)*4 + (col / q)   -- sweep = col/q, i = col%q, x=i*4+sweep
chain4_put:
        push    ax
        mov     ax, [col]
        xor     dx, dx
        div     word [qwidth]       ; ax = sweep (col/q), dx = i (col%q)
        mov     bx, dx
        shl     bx, 2               ; i*4
        add     bx, ax              ; + sweep -> x
        mov     ax, [cy]
        mul     word [imgw]
        add     bx, ax              ; dest = y*width + x
        pop     ax
        mov     es, [img_seg]
        mov     [es:bx], al
        ret

; al = next body byte (raw_seg:[bodyk]); CF=1 if bodyk >= span_len.
body_getb:
        mov     ax, [bodyk]
        cmp     ax, [span_len]
        jae     .eof
        push    ds
        mov     ds, [cs:raw_seg]
        mov     si, [cs:bodyk]
        mov     al, [si]
        pop     ds
        inc     word [bodyk]
        clc
        ret
.eof:
        stc
        ret

; ============================================================================
;  show_image : VGA mode 13h, load DAC (8-bit RGB >>2), centred blit, wait, text.
; ============================================================================
show_image:
        mov     ax, 0013h
        int     10h
        ; load DAC from pal[768] (values are 8-bit -> shift >>2 for 6-bit DAC)
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
        ; centred blit: di = (100 - h/2)*320 + (160 - w/2)
        mov     ax, [imgh]
        shr     ax, 1
        mov     bx, 100
        sub     bx, ax
        mov     ax, 320
        mul     bx
        mov     di, ax
        mov     ax, [imgw]
        shr     ax, 1
        mov     bx, 160
        sub     bx, ax
        add     di, bx
        ; blit width*height from img_seg -> A000
        push    ds
        mov     ax, 0A000h
        mov     es, ax
        mov     ds, [cs:img_seg]
        xor     si, si
        mov     bx, 0               ; row counter
.row:
        cmp     bx, [cs:imgh]
        jae     .blit_done
        mov     cx, [cs:imgw]
        push    di
        push    si
        rep     movsb
        pop     si
        pop     di
        add     si, [cs:imgw]
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
;  write_raw : dump raw decoded image = imgw,imgh, indices(w*h), pal(768).
;  Defaults to CCHLIB.RAW for oracle compatibility; /D's optional trailing path
;  selects an explicit output file for bridge/smoke-test consumers.
; ============================================================================
write_raw:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_rawname
        cmp     byte [dirarg], 0
        je      .create
        mov     dx, dirarg
.create:
        int     21h
        jc      .ret
        mov     [ofh], ax
        ; header imgw,imgh
        mov     ax, [imgw]
        mov     [tmpw], ax
        mov     dx, tmpw
        mov     cx, 2
        call    wfile
        mov     ax, [imgh]
        mov     [tmpw], ax
        mov     dx, tmpw
        mov     cx, 2
        call    wfile
        ; indices from img_seg (w*h)
        mov     ax, [imgw]
        mul     word [imgh]
        mov     cx, ax              ; capture count BEFORE clobbering ax
        push    ds
        mov     ds, [cs:img_seg]
        mov     bx, [cs:ofh]
        xor     dx, dx
        mov     ah, 40h
        int     21h
        pop     ds
        ; palette 768
        mov     dx, pal
        mov     cx, 768
        call    wfile
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

wfile:
        mov     bx, [ofh]
        mov     ah, 40h
        int     21h
        ret

; ============================================================================
;  Helpers
; ============================================================================
; seek file [fh] to cx:dx (32-bit absolute)
seek32:
        push    ax
        mov     bx, [fh]
        mov     ax, 4200h
        int     21h
        pop     ax
        ret

; read cx bytes into ds:dx from [fh]
read_here:
        push    ax
        push    bx
        mov     bx, [fh]
        mov     ah, 3Fh
        int     21h
        pop     bx
        pop     ax
        ret

; write cx bytes from ds:dx to [ofh].  CF=1 on DOS/short-write error.
write_out:
        push    ax
        push    bx
        mov     bx, [cs:ofh]
        mov     ah, 40h
        int     21h
        jc      .bad
        cmp     ax, cx
        jne     .bad
        clc
        jmp     .ret
.bad:
        stc
.ret:
        pop     bx
        pop     ax
        ret

; append ASCIIZ at si to di (no terminator written)
cat_si:
        lodsb
        or      al, al
        jz      .d
        stosb
        jmp     cat_si
.d:
        ret

; emit ASCIIZ label at si followed by unsigned decimal dx:ax and CRLF.
emit_label_dec:
        push    ax
        push    dx
        mov     di, linebuf
        call    cat_si
        pop     dx
        pop     ax
        call    put_dec32
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

; emit ASCIIZ string at si followed by CRLF.
emit_str_line:
        mov     di, linebuf
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

; put low-32 decimal of dx:ax at di (di advanced).  Uses 32-bit divide.
put_dec32:
        push    bx
        push    cx
        push    si
        mov     [d32lo], ax
        mov     [d32hi], dx
        mov     si, d32buf+11
        mov     byte [si], 0
.dv:
        ; divide [d32hi:d32lo] by 10 -> quotient back, remainder in cx
        mov     ax, [d32hi]
        xor     dx, dx
        mov     bx, 10
        div     bx                  ; ax=hi/10, dx=rem
        mov     [d32hi], ax
        mov     ax, [d32lo]
        div     bx                  ; ax=lo quotient (with dx carry-in), dx=rem
        mov     [d32lo], ax
        add     dl, '0'
        dec     si
        mov     [si], dl
        mov     ax, [d32hi]
        or      ax, [d32lo]
        jnz     .dv
        ; copy si.. to di
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
        div     bx                  ; ax/bx
        add     al, '0'
        mov     [di], al
        inc     di
        mov     ax, dx              ; remainder
        push    ax
        mov     ax, bx
        xor     dx, dx
        mov     bx, 10
        div     bx
        mov     bx, ax              ; bx /= 10
        pop     ax
        loop    .dl
        pop     dx
        pop     cx
        pop     bx
        ret

; build destpath = dir + '\' + Innnn.HTI  (dir in `dirarg`)
build_destpath:
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
        ; ensure trailing backslash
        cmp     di, destpath
        je      .nm
        cmp     byte [di-1], '\'
        je      .nm
        mov     byte [di], '\'
        inc     di
.nm:
        mov     al, 'I'
        stosb
        mov     ax, [blkidx]
        call    put_dec16_4
        mov     si, s_ext_hti
        call    cat_si
        mov     byte [di], 0
        ret

; ============================================================================
;  parse_args:  [ /D ]  [L|X|W|S] <file> [index] [dir|dump-out] [W-count]
; ============================================================================
parse_args:
        mov     byte [verb], 0
        mov     byte [dumpmode], 0
        mov     byte [fname], 0
        mov     byte [dirarg], 0
        mov     word [blkidx], 0
        mov     word [wallcount], 1
        mov     si, 81h
.skip0:
        call    skip_sp
        ; optional /D
        cmp     byte [si], '/'
        jne     .maybe_verb
        inc     si
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'D'
        jne     .maybe_verb
        mov     byte [dumpmode], 1
        inc     si
        call    skip_sp
.maybe_verb:
        ; optional L, X, or W verb (single letter followed by space)
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'L'
        je      .isverb
        cmp     al, 'X'
        je      .isverb
        cmp     al, 'W'
        je      .isverb
        cmp     al, 'S'
        je      .isverb
        jmp     .getfile
.isverb:
        mov     ah, [si+1]
        cmp     ah, ' '
        jne     .getfile            ; not a lone verb -> treat as filename
        mov     [verb], al
        inc     si
        call    skip_sp
.getfile:
        mov     di, fname
.cf:
        mov     al, [si]
        or      al, al
        jz      .fin
        cmp     al, 13              ; CR terminates the DOS command tail
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
        ; index
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
        ; optional dir (for X) or output path (for /D)
        mov     di, dirarg
.cdd:
        mov     al, [si]
        or      al, al
        jz      .dfin
        cmp     al, 13
        je      .dfin
        cmp     al, ' '
        je      .maybe_wcount
        mov     [di], al
        inc     si
        inc     di
        jmp     .cdd
.maybe_wcount:
        mov     byte [di], 0
        cmp     byte [verb], 'W'
        jne     .dfin_ret
        call    skip_sp
        xor     bx, bx
.wcnt:
        mov     al, [si]
        cmp     al, '0'
        jb      .wcnt_done
        cmp     al, '9'
        ja      .wcnt_done
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
        jmp     .wcnt
.wcnt_done:
        or      bx, bx
        jz      .dfin_ret
        mov     [wallcount], bx
.dfin_ret:
        ret
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
;  Data
; ============================================================================
s_usage   db 'CCHLIB <file.tlb/.glb> <i> | /D <file> <i> [out] | L <file> | X <file> <i> <dir> | W <file> [set out [count]] | S <master> <id> <dir>',13,10,'$'
s_noopen  db 'cannot open file',13,10,'$'
s_badhdr  db 'not an HLIB container',13,10,'$'
s_nofind  db 'image index out of range',13,10,'$'
s_seterr  db 'master set id missing or leaf copy failed',13,10,'$'
s_unsupp  db 'drawing method not supported yet',13,10,'$'
s_notimg  db 'not an image HLIB library',13,10,'$'
s_rawname db 'CCHLIB.RAW',0
s_ext_hti db '.HTI',0
s_ext_htd db '.HTD',0
s_ext_hlb db '.HLB',0
s_trunc   db '... (truncated; X extracts the full member)',13,10
s_trunc_len equ $ - s_trunc
s_w_images db 'images: ',0
s_w_sets   db 'wallSets47: ',0
s_w_rem    db 'remainder: ',0
s_w_m21    db 'method21: ',0
s_w_bad    db 'badMethods: ',0
s_w_groups db 'groups: 10,10,9,9,9',0

WALLHDR_LEN  equ 16
WALLIHDR_LEN equ 24
wallhdr   db 'GBWS'
          dw 2
          dw 0
          dw WALL_GROUP
          db 10,10,9,9,9,0
wallihdr  db 'GBWI'
          times WALLIHDR_LEN-4 db 0

verb        db 0
dumpmode    db 0
is_data     db 0
fh          dw 0
ofh         dw 0
raw_seg     dw 0
img_seg     dw 0

PTRCAP      equ 256             ; capacity of the ptrs / sptrs pointer buffers
fhdr        times 16 db 0
tag         dw 0
is_glib     db 0
ptrcount    dw 0
ptrs        times PTRCAP dd 0

shdr        times 16 db 0
sptrcount   dw 0
sptrs       times PTRCAP dd 0

set_base    dd 0
si_idx      dw 0
ws_cnt      dw 0
ws_hdr      dw 0
ws_ptr      dw 0
ws_magic    db 0
first_img   dw 0
img_i       dw 0
gidx        dw 0
enum_cb     dw 0
found       db 0
scratch     dd 0
wallsets    dw 0
wallrem     dw 0
wallm21     dw 0
wallbad     dw 0
wallsetidx  dw 0
wallbase    dw 0
walllocal   dw 0
wallglobal  dw 0
wallcount   dw 1
walltotal   dw WALL_GROUP

img_start   dd 0
img_end     dd 0
pal_off     dd 0

mem_start   dd 0
mem_end     dd 0
hex_off     dw 0
hex_n       dw 0
hex_col     dw 0
hex_trunc   dw 0
hexbyte     db 0

palhdr      times 8 db 0
pal_first   dw 0
pal_ncol    dw 0
palrgb      times 768 db 0
pal         times 768 db 0

imghdr      times 8 db 0
imgw        dw 0
imgh        dw 0
method      db 0
qwidth      dw 0
span_len    dw 0
img_npix    dw 0
bodyk       dw 0
runval      db 0
litn        dw 0
cy          dw 0
cs_         dw 0
ci          dw 0
col         dw 0

blkidx      dw 0
fname       times 128 db 0
dirarg      times 128 db 0
destpath    times 160 db 0
linebuf     times 96 db 0       ; holds a 74-byte hex-dump line (offset+16 bytes+ascii)
tmpw        dw 0
set_entry_count dw 0
set_table_bytes dw 0

d32lo       dw 0
d32hi       dw 0
d32buf      times 12 db 0
