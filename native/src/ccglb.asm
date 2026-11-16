; ============================================================================
;  CCGLB.COM  --  DQK ".GLB sniffing dispatcher" for cc's [open] map.
;
;  ONE helper that cc maps to the .glb extension; it PEEKS the HLIB container's
;  content type and EXECs the right *existing* sibling tool, forwarding the SAME
;  command tail so the child's listing reaches cc's (already-redirected) stdout
;  byte-for-byte unchanged.  cc invokes open-helpers as
;        CCGLB L <file.glb>         (browse a container -> member list)
;  and also the view/extract forms (CCGLB <file> <i>, CCGLB X <file> <i> <dir>);
;  whatever the tail is, CCGLB re-emits it verbatim to the chosen child, so all
;  three roles route correctly with one dispatcher.
;
;  ---- Sniff / dispatch decision tree (mirrors the sibling tools' own sniffs) --
;    1. Read 16-byte header.  Not 'HLIB' magic            -> print error, exit 1.
;    2. Tag@12 == "DI" (DIG4 digitized sound, SOUNDS.GLB) -> dispatch CCSND.
;    3. Tag@12 == "TI" (leaf TILE) or "HL" (image master) -> dispatch CCHLIB.
;    4. Tag@12 == "DA" (DATA library) -> sniff member 0 with CCGEO's STRICT test
;       (byte0=W, byte1=H, W,H in 1..63, member_len == 8 + 4*W*H):
;         pass -> dispatch CCGEO  (GEO.GLB area maps)
;         fail -> sniff MONCHA-shape (see below):
;           pass -> dispatch CCMON  (MONCHA.GLB monster records)
;           fail -> dispatch CCHLIB (generic DATA member list -- see note)
;
;  ---- MONCHA sniff (member-content test, not member-0 shape) -----------------
;  GEO.GLB, ECL.GLB and MONCHA.GLB member 0 are ALL a "count + count*4-byte" id
;  table (verified against the real files: GEO 20, ECL 47, MONCHA 98 entries --
;  same convention, so a member-0 SHAPE test can't tell them apart the way
;  sniff_geo's W,H test can for GEO). What DOES discriminate: MONCHA.GLB's
;  members[1..] are monchaRLE-compressed fixed-offset DQK monster records (see
;  ccmon.asm's header for the full field layout); ECL.GLB's members are raw
;  (uncompressed) ECL bytecode. sniff_moncha walks members 1..N, monchaRLE-
;  decodes each, and applies the same plausibility test CCMON's own
;  sniff_dqk_monster uses (type@2==8, printable name, thac0/ac/hd/damage
;  ranges) -- first hit wins, same short-circuit style as sniff_geo. Verified
;  against real files: MONCHA.GLB 5/98 members pass, ECL.GLB 0/47, GEO.GLB
;  0/20 (moot -- GEO is already caught by sniff_geo first).
;
;  ---- DATA-but-not-GEO-not-MONCHA fallback = CCHLIB (documented choice) ------
;  The remaining DATA lib is ECL.GLB (scripts). Two candidates list members for
;  cc: CCHLIB's DATA branch and CCECL. CCHLIB emits a clean, non-hanging
;  "<size> Dnnnn.HTD" member list (and supports F3 hex-dump + X byte-exact
;  extract on those members), which is exactly the generic VFS browse cc
;  wants. CCECL is a single-script ECL *diagnostic/disassembler* with no
;  equivalent flat L-listing role. So the generic DATA fallback is CCHLIB.
;
;  ---- Dispatch mechanism ----------------------------------------------------
;  DOS EXEC (INT 21h AH=4Bh, AL=00h).  A .COM owns all of conventional memory, so
;  we SETBLOCK-shrink our own block (INT 21h AH=4Ah) down to just what CCGLB uses
;  before EXEC, or the child won't load ("insufficient memory").  The child .com
;  is co-located with CCGLB (cc copies helpers together): we resolve CCGLB's own
;  directory from the program-name string that follows the environment block
;  (PSP:[2Ch] env seg -> after the double-NUL: word count, then ASCIIZ argv0),
;  strip to the directory, and append the child name.  env=0 in the EPB so the
;  child inherits our environment; stdout (handle 1) is inherited across EXEC
;  automatically, so the child's listing lands on cc's redirected file unchanged.
;
;  Build:  native\build.ps1 -Target ccglb   (nasm -f bin -> build\ccglb.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

start:
        ; --- capture the raw command tail FIRST (PSP 80h = len byte, 81h.. = text)
        call    capture_tail
        ; --- find the filename argument (skip optional /D, L|X verb)
        call    parse_fname
        cmp     byte [fname], 0
        je      .usage

        ; --- open + sniff the container ---------------------------------------
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .noopen
        mov     [fh], ax

        call    read_header             ; -> fhdr(16); CF=1 if not HLIB
        jc      .badhdr
        call    classify                ; -> [child] = pointer to child name
        ; close the file before EXEC (child reopens it itself)
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h

        ; --- resolve "<our dir>\<child>" into childpath -----------------------
        call    build_child_path

        ; --- shrink our memory, then EXEC the child with the same tail --------
        call    shrink_mem
        call    do_exec
        jc      .execfail

        mov     ax, 4C00h
        int     21h

.usage:
        mov     dx, s_usage
        jmp     .die
.noopen:
        mov     dx, s_noopen
        jmp     .die
.badhdr:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        mov     dx, s_badhdr
        jmp     .die
.execfail:
        mov     dx, s_execfail
        jmp     .die
.die:
        mov     ah, 9
        int     21h
        mov     ax, 4C01h
        int     21h

; ============================================================================
;  capture_tail: copy the PSP command tail (80h = length, 81h.. = bytes) into
;  our own `tail` Pascal-ish buffer (len byte + bytes + CR) so the EPB can point
;  at it AFTER we have parsed/overwritten nothing.  We re-emit it verbatim to the
;  child, so the child sees exactly the args cc gave us (e.g. " L C:\...\X.GLB").
; ============================================================================
capture_tail:
        movzx   cx, byte [80h]          ; tail length (excludes CR)
        mov     [tail], cl              ; child EPB wants the same Pascal length
        mov     si, 81h
        mov     di, tail+1
        jcxz    .term
.cp:
        mov     al, [si]
        mov     [di], al
        inc     si
        inc     di
        loop    .cp
.term:
        mov     byte [di], 0Dh          ; DOS requires the tail terminated by CR
        ret

; ============================================================================
;  parse_fname: walk the tail text to extract the container filename argument.
;  Grammar (same shape as the siblings):  [ /D ]  [ L | X ]  <file> ...
;  We only need <file> for the sniff; the full tail is forwarded untouched.
; ============================================================================
parse_fname:
        mov     byte [fname], 0
        mov     si, 81h
        call    skip_sp
        ; optional /D
        cmp     byte [si], '/'
        jne     .verb
        inc     si
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'D'
        jne     .verb
        inc     si
        call    skip_sp
.verb:
        ; optional lone L or X verb (single letter followed by space)
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'L'
        je      .isv
        cmp     al, 'X'
        je      .isv
        jmp     .file
.isv:
        cmp     byte [si+1], ' '
        jne     .file                   ; not a lone verb -> it's the filename
        inc     si
        call    skip_sp
.file:
        mov     di, fname
.cf:
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
        jmp     .cf
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
;  read_header: seek 0, read 16-byte header into fhdr.  CF=1 if not 'HLIB'.
; ============================================================================
read_header:
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
        clc
        ret
.bad:
        stc
        ret

; ============================================================================
;  classify: pick the child tool from tag@12 (+ a member sniff for DATA).
;  Sets [child] = offset of the child-name ASCIIZ.
; ============================================================================
classify:
        mov     ax, [fhdr+12]           ; first 2 chars of the tag
        cmp     ax, 'DI'                ; DIG4 -> sound
        je      .snd
        cmp     ax, 'TI'                ; TILE leaf -> image
        je      .hlib
        cmp     ax, 'HL'                ; image master -> image
        je      .hlib
        ; ---- DATA (or anything else): sniff member 0 for a GEO map ----------
        call    sniff_geo               ; CF=0 (geo) / CF=1 (not geo)
        jc      .not_geo
        mov     word [child], s_ccgeo
        ret
.not_geo:
        ; ---- not GEO: sniff members 1.. for MONCHA-shaped records ------------
        call    sniff_moncha            ; CF=0 (moncha) / CF=1 (not moncha)
        jc      .data_other
        mov     word [child], s_ccmon
        ret
.data_other:
        mov     word [child], s_cchlib  ; documented DATA-not-GEO-not-MONCHA fallback
        ret
.snd:
        mov     word [child], s_ccsnd
        ret
.hlib:
        mov     word [child], s_cchlib
        ret

; ============================================================================
;  sniff_geo: a GEO data lib is identified the SAME way CCGEO itself decides it
;  has something to show -- by walking every top-level member and applying the
;  strict per-member GEO test (byte0=W, byte1=H, W,H in 1..63, member_len ==
;  8 + 4*W*H).  If ANY member passes, this is a GEO lib (GEO.GLB's member 0 is a
;  20-entry id table that intentionally fails; the real maps start at member 1).
;  ECL/MONCHA/SOUNDS members all fail the test (CCGEO lists them as empty), so a
;  single hit is a sound discriminator.  CF=0 -> GEO lib ; CF=1 -> not GEO.
;
;  We read the WHOLE top-level pointer list once (clamped to PTRCAP) and iterate
;  member i = [ptrs[i], ptrs[i+1]) for i in 0..count-2.  All GEO offsets fit in
;  16 bits (file < 64KB) so low words suffice.
; ============================================================================
PTRCAP  equ 256
sniff_geo:
        mov     ax, [fhdr+8]            ; stored count-1
        inc     ax                      ; pointer count
        cmp     ax, 2                   ; need at least one member + successor
        jb      .no
        cmp     ax, PTRCAP
        jbe     .pcok
        mov     ax, PTRCAP
.pcok:
        mov     [ptrcount], ax
        ; read the pointer list (count DWORDs) from offset 16
        xor     cx, cx
        mov     dx, 16
        call    seek32
        mov     ax, [ptrcount]
        shl     ax, 2
        mov     cx, ax
        mov     dx, ptrs
        call    read_here
        ; walk members 0 .. count-2
        mov     word [mi], 0
.loop:
        mov     ax, [ptrcount]
        dec     ax                      ; member count = ptrcount-1
        cmp     [mi], ax
        jae     .no
        mov     bx, [mi]
        shl     bx, 2
        mov     ax, [ptrs+bx]           ; ptrs[mi] low (offset)
        mov     [cur_off], ax
        mov     ax, [ptrs+bx+4]         ; ptrs[mi+1] low
        sub     ax, [cur_off]           ; member length
        mov     [mlen], ax
        ; read the 2-byte W,H header at cur_off
        xor     cx, cx
        mov     dx, [cur_off]
        call    seek32
        mov     dx, whbuf
        mov     cx, 2
        call    read_here
        movzx   ax, byte [whbuf]        ; W
        movzx   cx, byte [whbuf+1]      ; H
        cmp     ax, 1
        jb      .next
        cmp     ax, 63
        ja      .next
        cmp     cx, 1
        jb      .next
        cmp     cx, 63
        ja      .next
        mul     cx                      ; ax = W*H (< 4096, dx=0)
        shl     ax, 2                   ; 4*W*H
        add     ax, 8                   ; expected = 8 + 4*W*H
        cmp     ax, [mlen]
        jne     .next
        clc                             ; a member passed -> GEO lib
        ret
.next:
        inc     word [mi]
        jmp     .loop
.no:
        stc
        ret

; ============================================================================
;  sniff_moncha: walk members 1..memberCount-1 (same "walk every member,
;  strict per-member test, first hit wins" short-circuit style as sniff_geo
;  above); for each, monchaRLE-decompress (duplicated here as a lightweight
;  dispatch-time sniff -- see ccmon.asm's decompress_moncha for the
;  authoritative algorithm/comments) and apply the fixed-offset DQK monster
;  record plausibility test (type@2==8, printable name, thac0/ac/hitDice/
;  damage ranges -- see ccmon.asm's sniff_dqk_monster for the authoritative
;  field-offset comments). CF=0 as soon as ANY member passes; CF=1 if none do.
;  Requires [ptrcount]/[ptrs] already populated -- sniff_geo's own
;  unconditional pointer-list read (above) leaves them set for any real file.
; ============================================================================
MCOMPCAP equ 512
MDECCAP  equ 768
sniff_moncha:
        mov     word [mmi], 1
.loop:
        mov     ax, [ptrcount]
        dec     ax                      ; member count = ptrcount-1
        cmp     [mmi], ax
        jae     .no
        mov     bx, [mmi]
        shl     bx, 2
        mov     ax, [ptrs+bx]           ; ptrs[mmi] low (member start)
        mov     [m_start], ax
        mov     ax, [ptrs+bx+4]         ; ptrs[mmi+1] low (member end)
        sub     ax, [m_start]
        cmp     ax, MCOMPCAP
        jbe     .lenok
        mov     ax, MCOMPCAP
.lenok:
        mov     [m_clen], ax
        xor     cx, cx
        mov     dx, [m_start]
        call    seek32
        mov     dx, mcomp
        mov     cx, [m_clen]
        call    read_here
        call    moncha_decode           ; mcomp[0..m_clen) -> mdec[0..m_dlen)
        call    moncha_sniff_one
        jc      .next
        clc
        ret
.next:
        inc     word [mmi]
        jmp     .loop
.no:
        stc
        ret

; monchaRLE decode: mcomp[0..m_clen) -> mdec, clamped to MDECCAP. Sets [m_dlen].
moncha_decode:
        mov     word [m_si], 0
        mov     word [m_di], 0
.loop:
        mov     ax, [m_si]
        cmp     ax, [m_clen]
        jae     .done
        mov     ax, [m_di]
        cmp     ax, MDECCAP
        jae     .done
        mov     bx, [m_si]
        mov     al, [mcomp+bx]
        inc     word [m_si]
        cmp     al, 81h
        jb      .lit
        ; ---- repeat: cnt = 257 - c ----
        mov     cx, 257
        movzx   bx, al
        sub     cx, bx
        mov     ax, [m_si]
        cmp     ax, [m_clen]
        jae     .loop
        mov     bx, [m_si]
        mov     al, [mcomp+bx]
        inc     word [m_si]
        mov     [m_rv], al
.rf:
        jcxz    .loop
        mov     ax, [m_di]
        cmp     ax, MDECCAP
        jae     .done
        mov     bx, ax
        mov     al, [m_rv]
        mov     [mdec+bx], al
        inc     word [m_di]
        dec     cx
        jmp     .rf
.lit:
        ; ---- literal: cnt = c+1 ----
        movzx   cx, al
        inc     cx
.lf:
        jcxz    .loop
        mov     ax, [m_si]
        cmp     ax, [m_clen]
        jae     .loop
        mov     bx, [m_si]
        mov     al, [mcomp+bx]
        inc     word [m_si]
        mov     [m_rv], al
        mov     ax, [m_di]
        cmp     ax, MDECCAP
        jae     .done
        mov     bx, ax
        mov     al, [m_rv]
        mov     [mdec+bx], al
        inc     word [m_di]
        dec     cx
        jmp     .lf
.done:
        mov     ax, [m_di]
        mov     [m_dlen], ax
        ret

; fixed-offset DQK monster plausibility test on mdec[0..m_dlen). CF=0 pass.
moncha_sniff_one:
        mov     ax, [m_dlen]
        cmp     ax, 108
        jb      .fail
        mov     bx, 2
        mov     al, [mdec+bx]
        cmp     al, 8
        jne     .fail
        mov     word [m_letters], 0
        mov     word [m_nmi], 0
.nmloop:
        mov     ax, [m_nmi]
        cmp     ax, 16
        jae     .nmdone
        mov     bx, ax
        add     bx, 24
        mov     al, [mdec+bx]
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
        inc     word [m_letters]
.nmnext:
        inc     word [m_nmi]
        jmp     .nmloop
.nmdone:
        cmp     word [m_letters], 0
        je      .fail
        mov     bx, 55                  ; thac0 = 60 - byte[55]; range [0,30]
        movzx   ax, byte [mdec+bx]
        mov     cx, 60
        sub     cx, ax
        cmp     cx, 0
        jl      .fail
        cmp     cx, 30
        jg      .fail
        mov     bx, 107                 ; ac = 60 - byte[107]; range [-12,16]
        movzx   ax, byte [mdec+bx]
        mov     cx, 60
        sub     cx, ax
        cmp     cx, -12
        jl      .fail
        cmp     cx, 16
        jg      .fail
        mov     bx, 65                  ; hitDice; range [1,40]
        movzx   ax, byte [mdec+bx]
        cmp     ax, 1
        jl      .fail
        cmp     ax, 40
        jg      .fail
        mov     bx, 101                 ; damage count; range [1,20]
        movzx   ax, byte [mdec+bx]
        cmp     ax, 1
        jl      .fail
        cmp     ax, 20
        jg      .fail
        mov     bx, 103                 ; damage sides; valid die size
        mov     al, [mdec+bx]
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
;  build_child_path: childpath = <CCGLB's own directory> + child name.
;  CCGLB's full path is the program-name string after the environment block:
;    env seg = PSP:[2Ch]; scan to the env double-NUL, skip it + a WORD (string
;    count), then an ASCIIZ argv0 = our full .com path.  Strip to last '\' or ':'.
; ============================================================================
build_child_path:
        push    es
        mov     es, [2Ch]               ; environment segment
        xor     di, di
.scan:                                  ; advance to the terminating double-NUL
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
        ; copy argv0 (full path of CCGLB.COM) into childpath
        mov     si, 0
        mov     bx, childpath           ; bx tracks dest; remember last sep
        xor     dx, dx                  ; dx = offset just past last '\' or ':'
        mov     di, di                  ; di = source index in env seg
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
        lea     dx, [bx+1]              ; dest offset just after this separator
        sub     dx, childpath
.cont:
        inc     bx
        inc     di
        jmp     .cpy
.stripped:
        pop     es
        ; di-side done; truncate to the directory part: dest = childpath+dx
        mov     di, childpath
        add     di, dx                  ; di -> where the child basename goes
        mov     si, [child]
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

; ============================================================================
;  shrink_mem: release the tail of our 64KB allocation so the child has RAM.
;  Keep everything up to end-of-image rounded to paragraphs, plus a small stack
;  pad.  New size (paragraphs) = (program_end_offset + STACKPAD + 15) >> 4.
; ============================================================================
STACKPAD equ 1024
shrink_mem:
        mov     bx, prog_end
        add     bx, STACKPAD
        add     bx, 15
        shr     bx, 4                   ; paragraphs needed from PSP base
        mov     ah, 4Ah                 ; SETBLOCK on our PSP segment (ES=PSP)
        push    ds
        pop     es
        int     21h
        ret

; ============================================================================
;  do_exec: INT 21h 4B00h, ds:dx = childpath, es:bx = EPB.
;  EPB: env=0 (inherit), cmd-tail ptr = our captured `tail`, two default FCBs.
;  Saves/restores SS:SP (DOS may clobber on return).  CF=1 on EXEC failure.
; ============================================================================
do_exec:
        ; build EPB
        mov     ax, ds
        mov     word [epb+0], 0         ; inherit parent environment
        mov     word [epb+2], tail      ; command-tail offset
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
        cli
        mov     ss, [cs:save_ss]
        mov     sp, [cs:save_sp]
        sti
        push    ds
        pop     es
        ret                             ; CF preserved from INT 21h on failure

; ============================================================================
;  Helpers (same idioms as the sibling tools)
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

; ============================================================================
;  Data
; ============================================================================
s_usage    db 'CCGLB <file.glb> [args] -- sniffs HLIB tag, dispatches the right tool',13,10,'$'
s_noopen   db 'cannot open file',13,10,'$'
s_badhdr   db 'not an HLIB container',13,10,'$'
s_execfail db 'cannot launch sibling tool (child .com missing or no memory)',13,10,'$'

s_ccgeo    db 'CCGEO.COM',0
s_cchlib   db 'CCHLIB.COM',0
s_ccsnd    db 'CCSND.COM',0
s_ccmon    db 'CCMON.COM',0

child       dw 0                        ; -> chosen child-name ASCIIZ
fh          dw 0
mlen        dw 0
ptrcount    dw 0
mi          dw 0
cur_off     dw 0
save_sp     dw 0
save_ss     dw 0

mmi         dw 0                        ; sniff_moncha member cursor
m_start     dw 0
m_clen      dw 0
m_dlen      dw 0
m_si        dw 0
m_di        dw 0
m_rv        db 0
m_letters   dw 0
m_nmi       dw 0

fhdr        times 16 db 0
whbuf       times 2  db 0
ptrs        times PTRCAP dd 0           ; top-level pointer list (count DWORDs)
mcomp       times MCOMPCAP db 0         ; sniff_moncha compressed-member scratch
mdec        times MDECCAP db 0          ; sniff_moncha decompressed-member scratch
epb         times 14 db 0

fname       times 128 db 0
childpath   times 144 db 0
tail        times 130 db 0             ; len byte + up to 127 chars + CR

prog_end    equ $                       ; image end; shrink_mem keeps up to here
