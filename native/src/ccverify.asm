; ============================================================================
;  CCVERIFY.COM  --  in-DOS Gold Box format self-test for the cc tool suite.
;
;  Goal: "cc has tools to test that the different formats are supported."  This
;  is the IN-DOS companion to the headless oracle harness (native/ccformats-
;  test.ps1): point it at a file (or a wildcard) and it classifies every match
;  by magic + structure and prints, per file, which cc tool supports it:
;
;        CCVERIFY <file|wildcard>
;        CCVERIFY *.DAX
;        CCVERIFY MON1CHA.DAX
;
;  Output (one line per file):
;        NAME............ FORMAT ................ SUPPORTED (CCxxx)
;        NAME............ ...................... UNSUPPORTED (<reason>)
;
;  Exit code = 1 if ANY matched file is UNSUPPORTED (so a batch file can gate on
;  it), else 0.  No file is modified; only the 16-byte header + DTA size are read.
;
;  ---- Detection (mirrors the verified decoders, byte-for-byte) ----------------
;    HLIB : bytes[0..3]=='HLIB'.  tag@12 -> DIG4 sound(CCSND) / TILE,HL image
;           (CCHLIB) / DATA lib (CCGLB->CCGEO|CCHLIB).
;    DAX  : DOS little-endian.  word0(LE) != 0, % 9 == 0, 2+word0 <= filesize,
;           and block0 data_offset(LE u32 @3) == 0.            -> CCGBC
;    DAA  : Amiga big-endian.   11 <= word0(BE) <= filesize ; body=word0-2 ;
;           body % 9 == 0 (blocks, off0==0) or % 6 == 0 (sub-frame index). -> CCDAA
;    Extension (.DAX/.DAA/.TLB/.GLB) is used as a hint/corroborator, exactly as
;    cc.ini routes by extension.
;
;  Build:  native\build.ps1 -Target ccverify   (nasm -f bin -> build\ccverify.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

start:
        ; --- parse the wildcard/filename argument from the PSP tail -----------
        call    parse_arg
        cmp     byte [pattern], 0
        je      .usage

        ; --- remember the directory prefix of the pattern (FindNext gives only
        ;     the basename; we prepend this to open each match) ----------------
        call    split_dir

        ; --- point the DTA at our own buffer, then FindFirst -----------------
        mov     dx, dta
        mov     ah, 1Ah
        int     21h

        mov     dx, pattern
        mov     cx, 0                    ; normal files
        mov     ah, 4Eh
        int     21h
        jc      .none

.eachfile:
        call    do_one_file
        mov     ah, 4Fh                 ; FindNext
        int     21h
        jnc     .eachfile

        ; --- summary + exit code --------------------------------------------
        cmp     byte [anybad], 0
        jne     .somebad
        mov     ax, 4C00h
        int     21h
.somebad:
        mov     ax, 4C01h
        int     21h

.none:
        mov     dx, s_nomatch
        mov     ah, 9
        int     21h
        mov     ax, 4C01h
        int     21h
.usage:
        mov     dx, s_usage
        mov     ah, 9
        int     21h
        mov     ax, 4C01h
        int     21h

; ============================================================================
;  do_one_file: the DTA holds a match (name @ dta+30, size dword @ dta+26).
;  Build full path, open, read 16-byte header, classify, print the verdict.
; ============================================================================
do_one_file:
        ; full path = dirprefix + DTA basename
        mov     si, dirprefix
        mov     di, fullpath
.cpp:
        mov     al, [si]
        or      al, al
        jz      .pdone
        mov     [di], al
        inc     si
        inc     di
        jmp     .cpp
.pdone:
        mov     si, dta+30              ; ASCIIZ found name
        mov     [namep], di             ; remember where the basename starts
.cpn:
        mov     al, [si]
        mov     [di], al
        or      al, al
        jz      .ndone
        inc     si
        inc     di
        jmp     .cpn
.ndone:
        ; filesize (low 32 bits) from DTA
        mov     ax, [dta+26]
        mov     [fsize_lo], ax
        mov     ax, [dta+28]
        mov     [fsize_hi], ax

        ; open + read header
        mov     word [hdrlen], 0
        mov     ax, 3D00h
        mov     dx, fullpath
        int     21h
        jc      .openfail
        mov     [fh], ax
        mov     ah, 3Fh
        mov     bx, [fh]
        mov     cx, 16
        mov     dx, hdr
        int     21h
        mov     [hdrlen], ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h

        call    classify                ; -> DS:[fmtp]=format str, [toolp]=tool str,
                                         ;    [okflag]=1 supported / 0 not
        call    print_line
        ret

.openfail:
        mov     word [fmtp], s_dash
        mov     word [toolp], s_open_err
        mov     byte [okflag], 0
        call    print_line
        mov     byte [anybad], 1
        ret

; ============================================================================
;  classify: fills [fmtp], [toolp], [okflag] from hdr/ext/filesize.
; ============================================================================
classify:
        cmp     word [hdrlen], 16
        jb      .tooshort

        ; ---- HLIB magic? ----------------------------------------------------
        cmp     word [hdr], 'HL'
        jne     .nothlib
        cmp     word [hdr+2], 'IB'
        jne     .nothlib
        mov     ax, [hdr+12]            ; tag (first 2 bytes)
        cmp     ax, 'DI'
        je      .hlib_snd
        cmp     ax, 'TI'
        je      .hlib_img
        cmp     ax, 'HL'
        je      .hlib_img
        cmp     ax, 'DA'
        je      .hlib_data
        mov     word [fmtp], s_f_hlib
        mov     word [toolp], s_t_cchlib
        jmp     .ok
.hlib_snd:
        mov     word [fmtp], s_f_dig4
        mov     word [toolp], s_t_ccsnd
        jmp     .ok
.hlib_img:
        mov     word [fmtp], s_f_tile
        mov     word [toolp], s_t_cchlib
        jmp     .ok
.hlib_data:
        mov     word [fmtp], s_f_data
        mov     word [toolp], s_t_ccglb
        jmp     .ok

.nothlib:
        ; ---- extension hint -------------------------------------------------
        call    get_ext                 ; -> [ext3] upper-cased 3 chars (NUL-pad)
        ; .TLB / .GLB but no HLIB magic = broken HLIB
        cmp     dword [ext3], 'TLB'+0   ; compare 3 bytes via dword w/ ext3[3]=0
        je      .badhlib_ext
        cmp     dword [ext3], 'GLB'+0
        je      .badhlib_ext

        ; .DAX -> require DAX structure
        cmp     dword [ext3], 'DAX'+0
        jne     .not_dax_ext
        call    test_dax
        jc      .malformed
        mov     word [fmtp], s_f_dax
        mov     word [toolp], s_t_ccgbc
        jmp     .ok
.not_dax_ext:
        ; .DAA -> require DAA structure
        cmp     dword [ext3], 'DAA'+0
        jne     .no_ext_hint
        call    test_daa                ; CF=1 bad; else AL=0 blocks / 1 index
        jc      .malformed
        or      al, al
        jnz     .daa_index
        mov     word [fmtp], s_f_daa_b
        mov     word [toolp], s_t_ccdaa
        jmp     .ok
.daa_index:
        mov     word [fmtp], s_f_daa_i
        mov     word [toolp], s_t_ccdaa
        jmp     .ok

.no_ext_hint:
        ; ---- no/unknown extension: try structures (DAX then DAA) -----------
        call    test_dax
        jnc     .struct_dax
        call    test_daa
        jc      .unknown
        or      al, al
        jnz     .daa_index
        mov     word [fmtp], s_f_daa_b
        mov     word [toolp], s_t_ccdaa
        jmp     .ok
.struct_dax:
        mov     word [fmtp], s_f_dax
        mov     word [toolp], s_t_ccgbc
        jmp     .ok

.badhlib_ext:
        mov     word [fmtp], s_dash
        mov     word [toolp], s_r_badhlib
        jmp     .notok
.malformed:
        mov     word [fmtp], s_dash
        mov     word [toolp], s_r_malformed
        jmp     .notok
.tooshort:
        mov     word [fmtp], s_dash
        mov     word [toolp], s_r_short
        jmp     .notok
.unknown:
        mov     word [fmtp], s_dash
        mov     word [toolp], s_r_unknown
.notok:
        mov     byte [okflag], 0
        ret
.ok:
        mov     byte [okflag], 1
        ret

; ============================================================================
;  test_dax: CF=0 if hdr/filesize look like a DOS DAX container.
;    w0 = LE u16 @0 ; w0 != 0 ; w0 % 9 == 0 ; (2+w0) <= filesize ;
;    block0 data_offset (LE u32 @3) == 0.
; ============================================================================
test_dax:
        mov     ax, [hdr]               ; w0 (LE)
        or      ax, ax
        jz      .bad
        mov     [tmpw], ax
        ; w0 % 9 == 0 ?
        xor     dx, dx
        mov     bx, 9
        div     bx                      ; ax=w0/9 dx=w0%9
        or      dx, dx
        jnz     .bad
        ; need = 2 + w0  (32-bit) <= filesize
        mov     ax, [tmpw]
        add     ax, 2
        mov     bx, ax                  ; low word of need (no carry: w0<=65535 -> may carry)
        ; handle carry into high word
        mov     dx, 0
        adc     dx, 0
        ; compare need(dx:bx) <= filesize(hi:lo)
        cmp     dx, [fsize_hi]
        ja      .bad
        jb      .needs_ok
        cmp     bx, [fsize_lo]
        ja      .bad
.needs_ok:
        ; block0 data_offset LE u32 @ hdr+3 == 0 ?
        mov     ax, [hdr+3]
        or      ax, [hdr+5]
        jnz     .bad
        clc
        ret
.bad:
        stc
        ret

; ============================================================================
;  test_daa: CF=1 if not DAA.  Else CF=0 and AL = 0 (9-byte blocks) / 1 (6-byte
;  sub-frame index).
;    w0 = BE u16 @0 ; 11 <= w0 <= filesize ; body = w0-2 ;
;    body % 9 == 0 (blocks; prefer if block0 BE-offset @3 == 0) else body % 6 == 0.
; ============================================================================
test_daa:
        mov     al, [hdr]               ; BE high
        mov     ah, [hdr+1]             ; want ax = (hdr[0]<<8)|hdr[1]
        xchg    al, ah                  ; ax = BE word0
        mov     [tmpw], ax
        cmp     ax, 11
        jb      .bad
        ; w0 <= filesize ? (w0 is 16-bit; if filesize hi>0 it's certainly >=w0)
        cmp     word [fsize_hi], 0
        jne     .size_ok
        cmp     ax, [fsize_lo]
        ja      .bad
.size_ok:
        mov     ax, [tmpw]
        sub     ax, 2                   ; body
        mov     [tmpbody], ax
        ; blocks_ok = (body % 9 == 0) AND (block0 BE-offset @3..6 == 0)
        xor     dx, dx
        mov     bx, 9
        div     bx
        mov     bl, 0                   ; bl = blocks_ok flag
        or      dx, dx
        jnz     .b9done
        mov     ax, [hdr+3]             ; bytes 3,4
        or      ax, [hdr+5]             ; | bytes 5,6  -> BE u32 @3 == 0 ?
        jnz     .b9done
        mov     bl, 1
.b9done:
        ; index_ok = (body % 6 == 0)
        mov     ax, [tmpbody]
        xor     dx, dx
        mov     cx, 6
        div     cx
        mov     bh, 0                   ; bh = index_ok flag
        or      dx, dx
        jnz     .i6done
        mov     bh, 1
.i6done:
        ; decide
        or      bl, bl
        jnz     .blocks_maybe
        or      bh, bh
        jnz     .ret_index
        jmp     .bad                    ; neither
.blocks_maybe:
        ; blocks_ok set. If index_ok too AND body>=18, disambiguate by the 9-byte
        ; TOC invariant entry1.data_offset == entry0.comp_size (a real block chain).
        or      bh, bh
        jz      .ret_blocks
        cmp     word [tmpbody], 18
        jb      .ret_blocks
        ; entry1.d_off (BE u32 @ hdr+12) == entry0.comp (BE u16 @ hdr+9) ?
        cmp     byte [hdr+12], 0
        jne     .ret_index
        cmp     byte [hdr+13], 0
        jne     .ret_index
        mov     al, [hdr+14]
        cmp     al, [hdr+9]
        jne     .ret_index
        mov     al, [hdr+15]
        cmp     al, [hdr+10]
        jne     .ret_index
.ret_blocks:
        clc
        mov     al, 0
        ret
.ret_index:
        clc
        mov     al, 1
        ret
.bad:
        stc
        ret

; ============================================================================
;  get_ext: extract the (up to 3) chars after the last '.' of the DTA basename,
;  upper-case them, into ext3 (4 bytes: 3 chars + NUL).  No '.' -> ext3 empty.
; ============================================================================
get_ext:
        mov     dword [ext3], 0
        mov     si, dta+30
        mov     bx, 0                   ; last-dot pointer (0 = none)
.scan:
        mov     al, [si]
        or      al, al
        jz      .have
        cmp     al, '.'
        jne     .nx
        lea     bx, [si+1]
.nx:
        inc     si
        jmp     .scan
.have:
        or      bx, bx
        jz      .done
        mov     si, bx
        mov     di, ext3
        mov     cx, 3
.cpe:
        mov     al, [si]
        or      al, al
        jz      .done
        cmp     al, 'a'
        jb      .noup
        cmp     al, 'z'
        ja      .noup
        sub     al, 20h
.noup:
        mov     [di], al
        inc     si
        inc     di
        dec     cx
        jnz     .cpe
.done:
        ret

; ============================================================================
;  parse_arg: copy the first whitespace-delimited token of the PSP tail into
;  `pattern` (ASCIIZ).
; ============================================================================
parse_arg:
        mov     byte [pattern], 0
        mov     si, 81h
.sk:
        cmp     byte [si], ' '
        jne     .tok
        inc     si
        jmp     .sk
.tok:
        mov     di, pattern
.cp:
        mov     al, [si]
        or      al, al
        jz      .fin
        cmp     al, 13
        je      .fin
        cmp     al, ' '
        je      .fin
        mov     [di], al
        inc     si
        inc     di
        jmp     .cp
.fin:
        mov     byte [di], 0
        ret

; ============================================================================
;  split_dir: dirprefix = pattern up to and including the last '\' or ':'.
;  If the pattern has no path separator, dirprefix is empty (cwd).
; ============================================================================
split_dir:
        mov     byte [dirprefix], 0
        mov     si, pattern
        mov     bx, 0                   ; length of prefix to keep
        mov     cx, 0                   ; current index
.scan:
        mov     al, [si]
        or      al, al
        jz      .build
        cmp     al, '\'
        je      .sep
        cmp     al, ':'
        je      .sep
        jmp     .nx
.sep:
        mov     bx, cx
        inc     bx                      ; keep through this separator
.nx:
        inc     si
        inc     cx
        jmp     .scan
.build:
        or      bx, bx
        jz      .done
        mov     si, pattern
        mov     di, dirprefix
.cpd:
        or      bx, bx
        jz      .term
        mov     al, [si]
        mov     [di], al
        inc     si
        inc     di
        dec     bx
        jmp     .cpd
.term:
        mov     byte [di], 0
.done:
        ret

; ============================================================================
;  print_line: "<basename padded> <format padded> SUPPORTED|UNSUPPORTED (tool)"
; ============================================================================
print_line:
        mov     si, [namep]
        call    puts
        ; pad name to column 16
        mov     si, [namep]
        call    strlen                  ; -> cx
        mov     bx, 16
        sub     bx, cx
        jbe     .nfpad1
        mov     cx, bx
        call    spaces
        jmp     .fmt
.nfpad1:
        mov     cx, 1
        call    spaces
.fmt:
        mov     si, [fmtp]
        call    puts
        mov     si, [fmtp]
        call    strlen
        mov     bx, 22
        sub     bx, cx
        jbe     .vpad1
        mov     cx, bx
        call    spaces
        jmp     .verd
.vpad1:
        mov     cx, 1
        call    spaces
.verd:
        cmp     byte [okflag], 0
        je      .no
        mov     si, s_supported
        call    puts
        jmp     .tool
.no:
        mov     si, s_unsupported
        call    puts
        mov     byte [anybad], 1
.tool:
        mov     si, s_lpar
        call    puts
        mov     si, [toolp]
        call    puts
        mov     si, s_rpar
        call    puts
        mov     si, s_crlf
        call    puts
        ret

; ---- tiny output helpers (handle-1 writes; CR/LF safe) ---------------------
puts:                                   ; SI -> ASCIIZ
        push    cx
        push    dx
        push    si
        mov     dx, si
        mov     cx, 0
.cl:
        cmp     byte [si], 0
        je      .wr
        inc     si
        inc     cx
        jmp     .cl
.wr:
        mov     ah, 40h
        mov     bx, 1
        int     21h
        pop     si
        pop     dx
        pop     cx
        ret

strlen:                                 ; SI -> ASCIIZ, returns CX = length
        mov     cx, 0
.sl:
        cmp     byte [si], 0
        je      .d
        inc     si
        inc     cx
        jmp     .sl
.d:
        ret

spaces:                                 ; CX = count of spaces to emit
.sp:
        jcxz    .d
        push    cx
        mov     dx, s_space
        mov     cx, 1
        mov     ah, 40h
        mov     bx, 1
        int     21h
        pop     cx
        dec     cx
        jmp     .sp
.d:
        ret

; ============================================================================
;  Data
; ============================================================================
s_usage     db 'CCVERIFY <file|wildcard> -- classify Gold Box files + cc support',13,10
            db '  e.g. CCVERIFY *.DAX   CCVERIFY GEO.GLB   CCVERIFY *.*',13,10,'$'
s_nomatch   db 'CCVERIFY: no files match',13,10,'$'

s_supported   db 'SUPPORTED ',0
s_unsupported db 'UNSUPPORTED ',0
s_lpar      db '(',0
s_rpar      db ')',0
s_space     db ' '
s_crlf      db 13,10,0
s_dash      db '--',0

; format names
s_f_hlib    db 'DQK HLIB',0
s_f_dig4    db 'DQK HLIB DIG4 sound',0
s_f_tile    db 'DQK HLIB TILE image',0
s_f_data    db 'DQK HLIB DATA lib',0
s_f_dax     db 'DOS DAX container',0
s_f_daa_b   db 'Amiga DAA (blocks)',0
s_f_daa_i   db 'Amiga DAA (subframe idx)',0

; tool / reason strings
s_t_cchlib  db 'CCHLIB',0
s_t_ccsnd   db 'CCSND',0
s_t_ccglb   db 'CCGLB->CCGEO/CCHLIB',0
s_t_ccgbc   db 'CCGBC',0
s_t_ccdaa   db 'CCDAA',0
s_r_badhlib db 'bad HLIB magic',0
s_r_malformed db 'malformed header',0
s_r_short   db 'too short',0
s_r_unknown db 'unrecognized format',0
s_open_err  db 'cannot open',0

; ---- mutable state ----
anybad      db 0
okflag      db 0
fh          dw 0
hdrlen      dw 0
fsize_lo    dw 0
fsize_hi    dw 0
tmpw        dw 0
tmpbody     dw 0
namep       dw 0
fmtp        dw 0
toolp       dw 0

ext3        dd 0                        ; 3 upper chars + NUL
hdr         times 16 db 0
pattern     times 128 db 0
dirprefix   times 128 db 0
fullpath    times 144 db 0
dta         times 128 db 0             ; FindFirst/Next DTA (43h bytes min)
