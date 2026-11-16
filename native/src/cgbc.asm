; ============================================================================
;  CCGBC.COM  --  Gold Box container lister/extractor (cc VFS helper).
;
;  Implements Claude Commander's [open]-helper verb protocol so a Gold Box
;  container browses inside cc as a folder, each member routed to the right
;  viewer by a type-tagged pseudo-extension:
;
;    CCGBC L <container>            list members: one "<rawsize> Bnnnn.EXT" line
;                                   per block to stdout (cc redirects to a file).
;                                   EXT = GBI (image) or GBD (data), classified
;                                   from the block's standard-frame header.
;    CCGBC X <container> <i> <dir>  extract block i (decompressed) to dir\Bnnnn.EXT
;    CCGBC XA <container> <dir>     extract every block to dir
;
;  The member index i is the 0-based listing position (== DAX TOC index), which is
;  exactly what cc's VFS passes back to X. Container parsing + signed-byte RLE are
;  shared with CCGB and verified against tools/dax_decode.py.
;
;  Format today: SSI DOS .DAX. (Sniffing for HLIB .TLB/.GLB and Amiga .DAA slots
;  in here later -- same L/X protocol, different parse.)
;
;  Assemble:  nasm -f bin cgbc.asm -o ccgbc.com   (build.ps1 -Target cgbc)
; ============================================================================
        cpu     386
        bits    16
        org     100h

ENTRY_SZ    equ 9
FRAME_HDR   equ 17

start:
        cld
        mov     sp, stacktop
        call    parse_args
        ; segments above ours: raw_seg holds decompressed block bytes.
        mov     ax, cs
        add     ax, 1000h
        mov     [raw_seg], ax

        ; verb dispatch
        mov     al, [verb]
        cmp     al, 'L'
        je      .do_list
        cmp     al, 'X'
        je      .do_extract
        jmp     .usage

.do_list:
        call    open_container
        call    list_blocks
        jmp     .ok

.do_extract:
        call    open_container
        cmp     byte [xall], 0
        je      .one
        call    extract_all
        jmp     .ok
.one:
        mov     ax, [xindex]
        cmp     ax, [entcount]
        jae     .badidx
        mov     [curidx], ax
        call    extract_one
        jmp     .ok

.ok:
        call    closefh
        mov     ax, 4C00h
        int     21h
.usage:
        mov     si, s_usage
        jmp     .die
.badidx:
        call    closefh
        mov     si, s_badidx
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
;  Open the container (cbuf) and parse its DAX TOC.
; ============================================================================
open_container:
        mov     ax, 3D00h
        mov     dx, cbuf
        int     21h
        jc      .noopen
        mov     [fh], ax
        call    seek0
        call    getw                ; word0 = toc_bytes
        mov     [toc_bytes], ax
        or      ax, ax
        jz      .badfmt
        xor     dx, dx
        mov     bx, ENTRY_SZ
        div     bx
        or      dx, dx
        jnz     .badfmt             ; not a multiple of 9 -> not DAX
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
;  L: list every block to stdout as "<rawsize> Bnnnn.EXT".
; ============================================================================
list_blocks:
        mov     word [curidx], 0
.l:
        mov     ax, [curidx]
        cmp     ax, [entcount]
        jae     .done
        call    select_block        ; sets raw_size, seeks to block data
        mov     word [rle_limit], 4 ; only need the 4 header bytes to classify
        mov     ax, [raw_seg]
        mov     es, ax
        call    decode_rle
        call    classify            ; -> [ftype] (1=image .GBI, 0=data .GBD)
        call    emit_line
        inc     word [curidx]
        jmp     .l
.done:
        ret

; ============================================================================
;  X: extract block [curidx] (fully decompressed) to dbuf\Bnnnn.EXT.
; ============================================================================
extract_one:
        call    select_block
        mov     ax, [raw_size]
        mov     [rle_limit], ax
        mov     ax, [raw_seg]
        mov     es, ax
        call    decode_rle
        call    classify
        call    build_destpath      ; destpath = dbuf\Bnnnn.EXT
        ; create + write raw_size bytes from raw_seg
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, destpath
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

extract_all:
        mov     word [curidx], 0
.l:
        mov     ax, [curidx]
        cmp     ax, [entcount]
        jae     .done
        call    extract_one
        inc     word [curidx]
        jmp     .l
.done:
        ret

; ============================================================================
;  select_block: from [curidx], read TOC fields + seek to compressed data.
; ============================================================================
select_block:
        mov     ax, [curidx]
        mov     bx, ENTRY_SZ
        mul     bx
        mov     si, ax
        add     si, toc
        mov     ax, [si+5]          ; raw_size
        mov     [raw_size], ax
        mov     ax, [si+7]          ; comp_size
        mov     [comp_size], ax
        mov     ax, [si+1]          ; data_offset low
        mov     dx, [si+3]          ; data_offset high
        add     ax, [data_base]
        adc     dx, 0
        call    seek_set
        ret

; ============================================================================
;  classify: read the just-decoded header (raw_seg:0 height, :2 width_div8) and
;  decide image vs data using the standard-frame test (matches dax_decode.py).
; ============================================================================
classify:
        push    ds
        mov     ax, [raw_seg]
        mov     ds, ax
        mov     ax, [0]
        mov     [cs:fheight], ax
        mov     ax, [2]
        mov     [cs:fwdiv8], ax
        pop     ds
        mov     ax, [fwdiv8]
        or      ax, ax
        jz      .data
        mov     ax, [fheight]
        or      ax, ax
        jz      .data
        ; need = 17 + (fwdiv8*4) * height    (fwdiv8*4 = width/2 = row bytes)
        mov     ax, [fwdiv8]
        shl     ax, 2
        mul     word [fheight]      ; dx:ax = rowbytes*height
        add     ax, FRAME_HDR
        adc     dx, 0
        or      dx, dx
        jnz     .data               ; > 64 KB -> not a standard frame
        mov     bx, [raw_size]
        cmp     ax, bx
        ja      .data               ; need > raw_size
        mov     cx, bx
        sub     cx, ax              ; raw_size - need
        cmp     cx, 16
        ja      .data               ; too much trailing -> not a clean frame
        mov     byte [ftype], 1     ; image
        ret
.data:
        mov     byte [ftype], 0     ; data
        ret

; ============================================================================
;  emit_line: write "<raw_size> Bnnnn.EXT\r\n" (curidx, ftype) to stdout.
; ============================================================================
emit_line:
        mov     ax, ds              ; stosb targets ES; decode left ES=raw_seg
        mov     es, ax
        mov     di, linebuf
        mov     ax, [raw_size]
        call    put_dec
        mov     al, ' '
        stosb
        call    put_member_name     ; appends "Bnnnn.EXT"
        mov     al, 0Dh
        stosb
        mov     al, 0Ah
        stosb
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, 1               ; stdout
        mov     ah, 40h
        int     21h
        ret

; append "Bnnnn.EXT" at ds:di (di advanced). nnnn = curidx (4 decimal digits).
put_member_name:
        mov     al, 'B'
        stosb
        mov     ax, [curidx]
        call    put_dec4
        mov     al, '.'
        stosb
        mov     si, s_gbd
        cmp     byte [ftype], 0
        je      .e
        mov     si, s_gbi
.e:
        call    catz
        ret

; ============================================================================
;  build_destpath: destpath = dbuf + '\' + "Bnnnn.EXT"
; ============================================================================
build_destpath:
        mov     ax, ds              ; stosb targets ES
        mov     es, ax
        mov     si, dbuf
        mov     di, destpath
        call    catz                ; copy destdir (without NUL); di advanced
        mov     al, '\'
        stosb
        call    put_member_name
        mov     al, 0
        stosb
        ret

; ============================================================================
;  Signed-byte RLE: file (via getb) -> es:0, producing [rle_limit] bytes.
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
;  Buffered input (as in CCIMG / CCGB).
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

; ============================================================================
;  Small helpers: decimal output, string copy, puts.
; ============================================================================
; append decimal of ax at ds:di (di advanced).
put_dec:
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
        mov     [di], dl
        inc     di
        loop    .pp
        pop     dx
        pop     cx
        pop     bx
        ret

; append ax as exactly 4 decimal digits at ds:di (di advanced).
put_dec4:
        push    bx
        push    dx
        xor     dx, dx
        mov     bx, 1000
        div     bx
        add     al, '0'
        mov     [di], al
        inc     di
        mov     ax, dx
        xor     dx, dx
        mov     bx, 100
        div     bx
        add     al, '0'
        mov     [di], al
        inc     di
        mov     ax, dx
        xor     dx, dx
        mov     bx, 10
        div     bx
        add     al, '0'
        mov     [di], al
        inc     di
        mov     al, dl
        add     al, '0'
        mov     [di], al
        inc     di
        pop     dx
        pop     bx
        ret

; append ASCIIZ ds:si -> ds:di WITHOUT the NUL (di advanced).
catz:
        mov     al, [si]
        or      al, al
        jz      .d
        mov     [di], al
        inc     si
        inc     di
        jmp     catz
.d:     ret

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
;  parse_args:  <verb> <container> [<index>] [<destdir>]
; ============================================================================
parse_args:
        ; terminate the command tail at CR
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
        and     al, 0DFh
        mov     [verb], al
        mov     byte [xall], 0
        mov     al, [vbuf+1]        ; "XA" ?
        and     al, 0DFh
        cmp     al, 'A'
        jne     .nc
        mov     byte [xall], 1
.nc:
        ; container
        mov     di, cbuf
        call    read_token
        ; X needs index + destdir; XA needs only destdir
        mov     al, [verb]
        cmp     al, 'X'
        jne     .ret
        cmp     byte [xall], 0
        jne     .xa
        ; index
        mov     di, nbuf
        call    read_token
        mov     si, nbuf
        call    atoi
        mov     [xindex], ax
.xa:
        mov     di, dbuf
        call    read_token
.ret:
        ret

; read_token: skip spaces at [si], copy non-space/non-NUL to [di], NUL-term.
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
s_usage     db 'Usage: CCGBC L|X|XA <container> [index] [destdir]',0Dh,0Ah,0
s_noopen    db 'CCGBC: cannot open container',0Dh,0Ah,0
s_badfmt    db 'CCGBC: not a DAX container',0Dh,0Ah,0
s_badidx    db 'CCGBC: block index out of range',0Dh,0Ah,0
s_gbi       db 'GBI',0
s_gbd       db 'GBD',0

IOBUF_SZ    equ 4096
TOC_MAX     equ 9*600

; ============================================================================
section .bss
alignb 2
verb        resb 1
xall        resb 1
ftype       resb 1
vbuf        resb 8
nbuf        resb 8
cbuf        resb 128
dbuf        resb 128
destpath    resb 160
linebuf     resb 64
fh          resw 1
ofh         resw 1
raw_seg     resw 1
toc_bytes   resw 1
entcount    resw 1
data_base   resw 1
curidx      resw 1
xindex      resw 1
raw_size    resw 1
comp_size   resw 1
rle_limit   resw 1
fheight     resw 1
fwdiv8      resw 1
iopos       resw 1
iolen       resw 1
alignb 2
toc         resb TOC_MAX
iobuf       resb IOBUF_SZ
stackspace  resb 1024
stacktop:
