; ============================================================================
;  GBMARKF.COM -- failing GBBOOT EXEC smoke-test child.
;
;  Writes the PSP command tail it received to GBEXEC.TXT in the current DOS
;  directory, then exits 1. Tests copy this over a helper that should be invoked
;  exactly once and use the nonzero exit to stop the parent before later helpers
;  can overwrite the recorded tail.
; ============================================================================
        cpu     8086
        bits    16
        org     100h

start:
        push    cs
        pop     ds

        mov     dx, outname
        xor     cx, cx
        mov     ah, 3Ch
        int     21h
        jc      .fail
        mov     [fh], ax

        mov     bx, [fh]
        mov     dx, header
        mov     cx, header_len
        mov     ah, 40h
        int     21h
        jc      .close_fail

        xor     cx, cx
        mov     cl, [80h]
        jcxz    .crlf
        mov     dx, 81h
        mov     bx, [fh]
        mov     ah, 40h
        int     21h
        jc      .close_fail

.crlf:
        mov     bx, [fh]
        mov     dx, eol
        mov     cx, 2
        mov     ah, 40h
        int     21h
.close_fail:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
.fail:
        mov     ax, 4C01h
        int     21h

outname db 'GBEXEC.TXT',0
header  db 'GBMARKF',13,10,'TAIL='
header_len equ $ - header
eol     db 13,10
fh      dw 0
