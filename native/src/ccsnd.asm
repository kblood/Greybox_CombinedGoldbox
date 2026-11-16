; ============================================================================
;  CCSND.COM  --  DQK DIG4 digitized-sound lister + PCM extractor/decoder.
;
;  DQK ships its sound effects inside SOUNDS.GLB, an HLIB "DIG4" *data* library
;  (tag "DIG4" at off 12).  It is NOT an image library: its members are flat
;  positional spans of the top-level pointer list (member i = [ptrs[i],ptrs[i+1])
;  for i in 0..ptrcount-2), exactly like CCHLIB's DATA/DIG4 branch and
;  hlib_decode.py's non-image branch.  See packages/engine/src/audio/dig.ts.
;
;  DIG4 member layout (oracle: dig.ts decodeDigMember; settled 2026-10-07 from retail bytes):
;    u16  big-endian sample rate (Hz)   -- e.g. 1C FA = 7418
;    u16  high word of the rate         -- always 00 00 (rate < 65536)
;    u16  big-endian payload length in BYTES (member length - 6, or - 7 when an odd
;         payload is padded to an even member length; 13 of 13 retail members)
;    ...  payload: 4-bit unsigned samples, TWO per byte, LOW nibble first, centre 8
;  The tag name is literal: DIG4 = 4 bits/sample.  Retail evidence (13 members):
;  mean lag-1 autocorrelation 0.754 as nibbles vs 0.434 as bytes (nibbles win in
;  13/13; a byte-shuffled null scores ~0.4 as nibbles), nibble mean 6.1..7.6 (centre 8)
;  against byte mean ~125 (centre 128) either way.  Until 2026-10-07 this tool read a
;  4-byte header + 8-bit PCM, so it played the length word as two samples and the
;  nibble stream at half the true length.
;  Decoded sample = nibble*16 (8-bit unsigned, centre 0x80); dig.ts (n-8)/8 is
;  exactly (nibble*16-128)/128, so this is a lossless byte-for-byte image of it.
;  Sample count = 2 * payload bytes.
;
;  cc VFS roles (mirrors CCHLIB / CCGEO):
;    CCSND L <file.glb>            list every DIG4 member as "<rate>Hz <pcmlen> Snnnn.RAW"
;    CCSND X <file.glb> <i> <dir>  extract member i's DECODED PCM to dir\Snnnn.RAW
;    CCSND /D <file.glb> <i>       dump member i's decoded PCM to CCSND.RAW (oracle diff)
;    CCSND /P <i> <rate> [file]    play member i's decoded samples at <rate> Hz through a
;                                  Sound Blaster direct-DAC (DSP 10h) and publish GBSN.BIN;
;                                  file defaults to SOUNDS.GLB in the current directory
;
;  GBSN.BIN status sidecar (little-endian, 22 bytes, VERSION 2) written by /P on EVERY outcome:
;    +0  "GBSN"
;    +4  u16 version = 2 (1 was the wrong 4-byte-header/8-bit reading)
;    +6  u16 status: 1 played, 0 unavailable (no Sound Blaster answered the DSP reset),
;                    2 rate-mismatch (requested rate != the member header's BE rate; not played)
;    +8  u16 member index
;    +10 u16 requested rate (Hz)
;    +12 u16 member-header rate (Hz)
;    +14 u16 payload length in bytes (declared by the member header; samples = 2x)
;    +16 u32 CRC-32 (IEEE, reflected 0xEDB88320) of the payload bytes (not the decoded samples)
;    +20 u16 Sound Blaster base port that answered, 0 if none
;  /P touches no game state: it reads the library, reprograms PIT ch0 only for
;  pacing (restored to mode 3 on exit) and writes only GBSN.BIN.
;
;  CCSND.RAW / Snnnn.RAW dump format (little-endian, for the dig.ts byte-diff):
;    u16  sample rate (Hz)        (parsed from the BE header)
;    u32  decoded sample count    (= 2 * payload bytes)
;    ...  decoded samples, one byte each: low nibble then high nibble of every
;         payload byte, each scaled nibble*16 (8-bit unsigned)
;
;  Build:  build.ps1 -Target ccsnd   (nasm -f bin -> build\ccsnd.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

RAW_SEG_OFF equ 1000h           ; cs+1000h : member PCM payload (file bytes)

start:
        mov     ax, cs
        add     ax, RAW_SEG_OFF
        mov     [raw_seg], ax

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
        cmp     byte [is_dig], 0
        je      .notdig

        cmp     byte [verb], 'P'
        je      .do_play
        cmp     byte [verb], 'L'
        je      .do_list
        cmp     byte [verb], 'X'
        je      .do_extract
        ; default / '/D' : decode member [blkidx] and dump to CCSND.RAW
        call    find_member         ; -> mem_start/mem_end; CF=1 if out of range
        jc      .nofind
        call    read_member         ; -> raw_seg holds member, [mlen]
        call    parse_dig           ; -> [snd_rate],[pcm_len]; CF=1 if member too short
        jc      .short
        mov     dx, s_rawname
        call    dump_pcm
        jmp     .done
.do_play:
        call    find_member
        jc      .nofind
        call    read_member
        call    parse_dig
        jc      .short
        call    crc_pcm
        mov     word [gbsn_status], 2
        mov     ax, [snd_rate]
        cmp     ax, [reqrate]
        jne     .play_pub           ; header rate disagrees: refuse, publish
        mov     word [gbsn_status], 0
        call    sb_detect
        cmp     word [sbbase], 0
        je      .play_pub           ; no DSP answered: unavailable
        call    sb_play
        mov     word [gbsn_status], 1
.play_pub:
        call    publish_gbsn
        jmp     .done
.do_list:
        call    list_members
        jmp     .done
.do_extract:
        call    find_member
        jc      .nofind
        call    read_member
        call    parse_dig
        jc      .short
        call    build_destpath
        mov     dx, destpath
        call    dump_pcm
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
.notdig:
        mov     dx, s_notdig
        jmp     .closedie
.nofind:
        mov     dx, s_nofind
        jmp     .closedie
.short:
        mov     dx, s_short
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
;  read_container_header: read "HLIB", count, tag, top-level pointer list.
;  Sets [is_dig]=1 only for a DIG4 data library (tag "DI").  CF=1 on bad sig.
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
        mov     ax, [fhdr+8]            ; stored count-1
        inc     ax
        cmp     ax, PTRCAP
        jbe     .pcok
        mov     ax, PTRCAP
.pcok:
        mov     [ptrcount], ax
        ; tag at off 12; DIG4 ("DI") => digitized-sound data library.
        mov     ax, [fhdr+12]
        mov     [tag], ax
        mov     byte [is_dig], 0
        cmp     ax, 'DI'
        jne     .nottag
        mov     byte [is_dig], 1
.nottag:
        ; read pointer list (count DWORDs) from offset 16
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
;  member_span: ax=index -> [mem_start,mem_end) DWORDs.  CF=1 if out of range.
;  member i = [ptrs[i], ptrs[i+1]) for i in 0..ptrcount-2.
; ============================================================================
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

; find_member: resolve member [blkidx] span into mem_start/mem_end.  CF=1 if oor.
find_member:
        mov     ax, [blkidx]
        call    member_span
        ret

; read_member: load member span [mem_start,mem_end) (< 64KB) into raw_seg.
;  Sets [mlen] = member byte length.
read_member:
        mov     ax, [mem_end]
        sub     ax, [mem_start]
        mov     [mlen], ax
        mov     cx, [mem_start+2]
        mov     dx, [mem_start]
        call    seek32
        push    ds
        mov     ds, [cs:raw_seg]
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, [cs:mlen]
        xor     dx, dx
        int     21h
        pop     ds
        ret

; ============================================================================
;  parse_dig: parse a member already loaded in raw_seg ([mlen] bytes).
;    [snd_rate] = (raw[0]<<8)|raw[1]   (big-endian u16)
;    [pcm_len]  = payload BYTES: the BE u16 at raw[4] when 0 < it <= mlen-6, else mlen-6
;    [smp_cnt]  = 2 * pcm_len          (4-bit samples)
;  CF=1 if member shorter than the 6-byte header.
; ============================================================================
DIG_HDR equ 6
parse_dig:
        mov     ax, [mlen]
        cmp     ax, DIG_HDR
        jb      .short
        push    ds
        mov     ds, [cs:raw_seg]
        mov     dh, [4]             ; declared payload length, big-endian
        mov     dl, [5]
        mov     bh, [0]             ; rate, big-endian
        mov     bl, [1]
        pop     ds
        mov     [snd_rate], bx
        mov     ax, [mlen]
        sub     ax, DIG_HDR
        or      dx, dx
        jz      .useavail
        cmp     dx, ax
        ja      .useavail
        mov     ax, dx
.useavail:
        mov     [pcm_len], ax
        movzx   eax, ax
        add     eax, eax
        mov     [smp_cnt], eax
        clc
        ret
.short:
        stc
        ret

; ============================================================================
;  dump_pcm: write the decoded RAW (u16 rate, u32 pcm_len, pcm bytes) to file
;  whose ASCIIZ name is at ds:dx.  PCM = raw_seg[4 .. mlen).
; ============================================================================
dump_pcm:
        mov     ah, 3Ch
        xor     cx, cx
        int     21h                 ; create/trunc, dx = name
        jc      .ret
        mov     [ofh], ax
        ; u16 sample rate
        mov     ax, [snd_rate]
        mov     [tmpw], ax
        mov     dx, tmpw
        mov     cx, 2
        call    wfile
        ; u32 decoded sample count
        mov     eax, [smp_cnt]
        mov     [tmpd], eax
        mov     dx, tmpd
        mov     cx, 4
        call    wfile
        ; decoded samples: low nibble then high nibble of each payload byte, *16
        mov     word [dsrc], DIG_HDR
        mov     ax, [pcm_len]
        mov     [dleft], ax
.chunk:
        mov     cx, [dleft]
        or      cx, cx
        jz      .close
        cmp     cx, 128
        jbe     .szok
        mov     cx, 128
.szok:
        sub     [dleft], cx
        mov     [dn], cx
        mov     si, [dsrc]
        push    ds
        push    cs
        pop     es
        mov     di, dbuf
        mov     ds, [raw_seg]
.dl:
        lodsb
        mov     ah, al
        and     al, 0Fh
        shl     al, 4
        stosb
        mov     al, ah
        and     al, 0F0h
        stosb
        loop    .dl
        pop     ds
        mov     [dsrc], si
        mov     cx, [dn]
        shl     cx, 1
        mov     dx, dbuf
        call    wfile
        jmp     .chunk
.close:
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
;  list_members: emit "<rate>Hz <pcmlen> Snnnn.RAW\r\n" per DIG4 member.
;  Reads each member's 4-byte header to report its parsed rate (proves order).
; ============================================================================
list_members:
        mov     word [gidx], 0
.loop:
        mov     ax, [gidx]
        mov     cx, [ptrcount]
        dec     cx
        cmp     ax, cx
        jae     .done
        call    find_member         ; uses blkidx; set it from gidx
        ; (member_span on gidx directly)
        mov     ax, [gidx]
        call    member_span
        call    read_member
        call    parse_dig
        jc      .next               ; skip degenerate (too-short) member silently
        ; build line
        mov     di, linebuf
        mov     ax, [snd_rate]
        xor     dx, dx
        call    put_dec32           ; rate
        mov     si, s_hz
        call    cat_si
        mov     ax, [smp_cnt]
        mov     dx, [smp_cnt+2]
        call    put_dec32           ; decoded sample count
        mov     al, ' '
        stosb
        mov     al, 'S'
        stosb
        mov     ax, [gidx]
        call    put_dec16_4
        mov     si, s_ext_raw
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
        inc     word [gidx]
        jmp     .loop
.done:
        ret

; ============================================================================
;  build_destpath = dirarg + '\' + Snnnn.RAW  (for X)
; ============================================================================
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
        cmp     di, destpath
        je      .nm
        cmp     byte [di-1], '\'
        je      .nm
        mov     byte [di], '\'
        inc     di
.nm:
        mov     al, 'S'
        stosb
        mov     ax, [blkidx]
        call    put_dec16_4
        mov     si, s_ext_raw
        call    cat_si
        mov     byte [di], 0
        ret

; ============================================================================
;  Helpers (identical conventions to CCHLIB)
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

; put low-32 decimal of dx:ax at di
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
;  parse_args:  [ /D ]  [L|X]  <file>  [index]  [dir]   (mirrors CCHLIB)
; ============================================================================
parse_args:
        mov     byte [verb], 0
        mov     byte [fname], 0
        mov     byte [dirarg], 0
        mov     word [blkidx], 0
        mov     si, 81h
.skip0:
        call    skip_sp
        ; optional /D (dump to CCSND.RAW); no separate dumpmode flag needed --
        ; the default action already dumps, so /D just selects the default verb.
        cmp     byte [si], '/'
        jne     .maybe_verb
        inc     si
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'P'
        je      .isP
        cmp     al, 'D'
        jne     .maybe_verb
        inc     si
        call    skip_sp
.maybe_verb:
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
        ; optional dir (for X)
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

; /P <member> <rate> [file]
.isP:
        inc     si
        mov     byte [verb], 'P'
        call    skip_sp
        call    parse_num
        mov     [blkidx], bx
        call    skip_sp
        call    parse_num
        mov     [reqrate], bx
        call    skip_sp
        mov     di, fname
.pf:
        mov     al, [si]
        or      al, al
        jz      .pfd
        cmp     al, 13
        je      .pfd
        cmp     al, ' '
        je      .pfd
        mov     [di], al
        inc     si
        inc     di
        jmp     .pf
.pfd:
        mov     byte [di], 0
        cmp     byte [fname], 0
        jne     .pret
        mov     si, s_defglb
        mov     di, fname
.pc:
        lodsb
        stosb
        or      al, al
        jnz     .pc
.pret:
        ret

; parse_num: decimal at [si] -> bx, si advanced past the digits.
parse_num:
        xor     bx, bx
.pn:
        mov     al, [si]
        cmp     al, '0'
        jb      .pnd
        cmp     al, '9'
        ja      .pnd
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
        jmp     .pn
.pnd:
        ret

skip_sp:
        cmp     byte [si], ' '
        jne     .d
        inc     si
        jmp     skip_sp
.d:
        ret

; ============================================================================
;  /P support: CRC-32, Sound Blaster direct-DAC playback, GBSN.BIN sidecar
; ============================================================================

; crc_pcm: [gbsn_crc] = CRC-32 of raw_seg[DIG_HDR .. DIG_HDR+pcm_len)
crc_pcm:
        mov     es, [raw_seg]
        mov     si, DIG_HDR
        mov     cx, [pcm_len]
        mov     edx, 0FFFFFFFFh
        or      cx, cx
        jz      .fin
.byte:
        xor     dl, [es:si]
        mov     bl, 8
.bit:
        shr     edx, 1
        jnc     .nx
        xor     edx, 0EDB88320h
.nx:
        dec     bl
        jnz     .bit
        inc     si
        loop    .byte
.fin:
        not     edx
        mov     [gbsn_crc], edx
        ret

; sb_detect: probe DSP reset at 220h/240h/260h; [sbbase]=port that answered 0AAh, else 0.
sb_detect:
        mov     word [sbbase], 220h
.try:
        mov     dx, [sbbase]
        add     dx, 6
        mov     al, 1
        out     dx, al
        mov     cx, 64
.d1:
        in      al, dx
        loop    .d1
        xor     al, al
        out     dx, al
        mov     dx, [sbbase]
        add     dx, 0Eh
        mov     cx, 0FFFFh
.poll:
        in      al, dx
        test    al, 80h
        jnz     .rd
        loop    .poll
        jmp     .fail
.rd:
        mov     dx, [sbbase]
        add     dx, 0Ah
        in      al, dx
        cmp     al, 0AAh
        je      .ok
.fail:
        add     word [sbbase], 20h
        cmp     word [sbbase], 260h
        jbe     .try
        mov     word [sbbase], 0
.ok:
        ret

; dsp_write: al = byte for the DSP write port (bounded wait for ready)
dsp_write:
        push    cx
        push    dx
        mov     ah, al
        mov     dx, [sbbase]
        add     dx, 0Ch
        mov     cx, 0FFFFh
.w:
        in      al, dx
        test    al, 80h
        jz      .go
        loop    .w
.go:
        mov     al, ah
        out     dx, al
        pop     dx
        pop     cx
        ret

; pit_read: latch + read PIT channel 0 -> ax
pit_read:
        xor     al, al
        out     43h, al
        in      al, 40h
        mov     ah, al
        in      al, 40h
        xchg    al, ah
        ret

; sb_play: stream PCM to the DSP with DSP 10h (direct 8-bit DAC), one sample per
; 1193182/rate PIT ticks.  PIT ch0 is put in mode 2 (count 65536, decrement 1/tick)
; for pacing and restored to the DOS default mode 3 afterwards.
sb_play:
        mov     al, 34h
        out     43h, al
        xor     al, al
        out     40h, al
        out     40h, al
        mov     eax, 1193182
        xor     edx, edx
        movzx   ecx, word [snd_rate]
        div     ecx
        mov     [interval], ax
        mov     al, 0D1h                ; speaker on
        call    dsp_write
        mov     es, [raw_seg]
        mov     si, DIG_HDR
        mov     byte [nhi], 0
        mov     ax, [pcm_len]
        mov     [remain], ax
        or      ax, ax
        jz      .off
        call    pit_read
        mov     [prev], ax
        xor     bx, bx                  ; tick accumulator
.wait:
        call    pit_read
        mov     dx, [prev]
        sub     dx, ax
        mov     [prev], ax
        add     bx, dx
        cmp     bx, [interval]
        jb      .wait
        sub     bx, [interval]
        mov     al, 10h
        call    dsp_write
        mov     al, [es:si]
        cmp     byte [nhi], 0
        jne     .hi
        and     al, 0Fh                 ; low nibble first
        shl     al, 4
        mov     byte [nhi], 1
        jmp     .snd
.hi:
        and     al, 0F0h
        mov     byte [nhi], 0
        inc     si
        dec     word [remain]
.snd:
        call    dsp_write
        cmp     word [remain], 0
        jne     .wait
.off:
        mov     al, 0D3h                ; speaker off
        call    dsp_write
        mov     al, 36h                 ; PIT ch0 back to mode 3, count 65536
        out     43h, al
        xor     al, al
        out     40h, al
        out     40h, al
        ret

; publish_gbsn: fill the sidecar from the run state, write GBSN.BIN, echo a status line.
publish_gbsn:
        push    cs                      ; crc_pcm/sb_play left ES at raw_seg; cat_si stosb needs ES=DS
        pop     es
        mov     ax, [blkidx]
        mov     [gbsn_member], ax
        mov     ax, [reqrate]
        mov     [gbsn_req], ax
        mov     ax, [snd_rate]
        mov     [gbsn_hdr], ax
        mov     ax, [pcm_len]
        mov     [gbsn_len], ax
        mov     eax, [smp_cnt]
        mov     [gbsn_smp], eax
        mov     ax, [sbbase]
        mov     [gbsn_sb], ax
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_gbsnname
        int     21h
        jc      .echo
        mov     bx, ax
        mov     ah, 40h
        mov     cx, 22
        mov     dx, gbsn
        int     21h
        mov     ah, 3Eh
        int     21h
.echo:
        mov     di, linebuf
        mov     si, s_gbsnpre
        call    cat_si
        mov     bx, [gbsn_status]
        mov     si, s_unavail
        cmp     bx, 1
        jne     .st2
        mov     si, s_played
.st2:
        cmp     bx, 2
        jne     .st3
        mov     si, s_ratemis
.st3:
        call    cat_si
        mov     si, s_mem
        call    cat_si
        mov     ax, [gbsn_member]
        xor     dx, dx
        call    put_dec32
        mov     si, s_rate
        call    cat_si
        mov     ax, [gbsn_req]
        xor     dx, dx
        call    put_dec32
        mov     si, s_lenl
        call    cat_si
        mov     ax, [gbsn_len]
        xor     dx, dx
        call    put_dec32
        mov     si, s_smpl
        call    cat_si
        mov     ax, [gbsn_smp]
        mov     dx, [gbsn_smp+2]
        call    put_dec32
        mov     si, s_crcl
        call    cat_si
        mov     eax, [gbsn_crc]
        mov     cx, 8
.hx:
        rol     eax, 4
        mov     dl, al
        and     dl, 0Fh
        add     dl, '0'
        cmp     dl, '9'
        jbe     .hd
        add     dl, 7
.hd:
        mov     [di], dl
        inc     di
        loop    .hx
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
;  Data
; ============================================================================
s_usage   db 'CCSND L <file.glb> | X <file.glb> <i> <dir> | /D <file.glb> <i> | /P <i> <rate> [file]',13,10,'$'
s_noopen  db 'cannot open file',13,10,'$'
s_badhdr  db 'not an HLIB container',13,10,'$'
s_notdig  db 'not a DIG4 sound library',13,10,'$'
s_nofind  db 'member index out of range',13,10,'$'
s_short   db 'member too short for DIG4 header',13,10,'$'
s_rawname db 'CCSND.RAW',0
s_ext_raw db '.RAW',0
s_hz      db 'Hz ',0
s_defglb  db 'SOUNDS.GLB',0
s_gbsnname db 'GBSN.BIN',0
s_gbsnpre db 'GBSN status=',0
s_played  db 'played',0
s_unavail db 'unavailable',0
s_ratemis db 'rate-mismatch',0
s_mem     db ' member=',0
s_rate    db ' rate=',0
s_lenl    db ' len=',0
s_smpl    db ' samples=',0
s_crcl    db ' crc32=',0

verb        db 0
is_dig      db 0
fh          dw 0
ofh         dw 0
raw_seg     dw 0

PTRCAP      equ 256
fhdr        times 16 db 0
tag         dw 0
ptrcount    dw 0
ptrs        times PTRCAP dd 0

mem_start   dd 0
mem_end     dd 0
mlen        dw 0
snd_rate    dw 0
pcm_len     dw 0
smp_cnt     dd 0
gbsn_smp    dd 0
nhi         db 0
dsrc        dw 0
dleft       dw 0
dn          dw 0
dbuf        times 256 db 0
gidx        dw 0

blkidx      dw 0
fname       times 128 db 0
dirarg      times 128 db 0
destpath    times 160 db 0
linebuf     times 96 db 0
tmpw        dw 0
tmpd        dd 0

reqrate     dw 0
sbbase      dw 0
interval    dw 0
prev        dw 0
remain      dw 0
gbsn        db 'GBSN'
            dw 2
gbsn_status dw 0
gbsn_member dw 0
gbsn_req    dw 0
gbsn_hdr    dw 0
gbsn_len    dw 0
gbsn_crc    dd 0
gbsn_sb     dw 0

d32lo       dw 0
d32hi       dw 0
d32buf      times 12 db 0
