; ============================================================================
;  Greybox native DOS engine — slice 1 ("pixel on screen").
;
;  Purpose: prove the pipeline end-to-end with the smallest real program —
;  NASM (-f bin) -> flat .COM -> DOS/DOSBox -> VGA mode 13h -> A000 VRAM.
;  Same toolchain model as C:\LLM\cc (no linker): NASM emits the runnable binary
;  directly. The mode-13h framebuffer lives in *video RAM* at A000:0000, separate
;  from this .COM's own 64 KB segment, so a flat .COM does 256-colour graphics
;  fine. We adopt a linker/.EXE only later, once the engine's own code+data cross
;  the 64 KB wall.
;
;  It enters 320x200x256 (mode 13h) and paints the *default VGA DAC palette* as a
;  16x16 grid of colour blocks (block colour = row*16 + col, i.e. palette index
;  0..255). Seeing that grid under DOSBox confirms: NASM produced a working image,
;  INT 10h switched modes, and direct writes to A000:0000 land on screen. No
;  external assets. (Slice 1b will `incbin` a real decoded DAX/HLIB frame + its
;  palette in place of the grid; that art stays out of git per repo rules.)
;
;  Build: see ../build.ps1   (nasm -f bin pixel.asm -o pixel.com)
; ============================================================================

cpu 386
bits 16
org 100h

VGASEG  equ 0A000h
SCRW    equ 320
SCRH    equ 200
BLOCK_W equ 20             ; 320/16 = 20 px per colour column
BLOCK_H equ 13             ; ~200/16; last band slightly short — fine

start:
        cld

        mov     ax, 0013h         ; set VGA 320x200x256
        int     10h

        mov     ax, VGASEG
        mov     es, ax
        xor     di, di            ; ES:DI -> framebuffer, advances per pixel

        xor     dx, dx            ; dx = y (0..199)
.yloop:
        mov     ax, dx            ; blockrow = y / BLOCK_H  (0..15)
        mov     bl, BLOCK_H
        div     bl                ; al = y/BLOCK_H, ah = remainder
        mov     bh, al
        shl     bh, 4             ; bh = blockrow*16 (high nibble = palette row)

        xor     cx, cx            ; cx = x (0..319)
.xloop:
        mov     ax, cx            ; blockcol = x / BLOCK_W (0..15)
        mov     bl, BLOCK_W
        div     bl                ; al = x/BLOCK_W (col), ah = remainder
        or      al, bh            ; al = blockrow*16 + blockcol = palette index
        stosb                     ; write pixel; di++
        inc     cx
        cmp     cx, SCRW
        jb      .xloop

        inc     dx
        cmp     dx, SCRH
        jb      .yloop

        xor     ax, ax            ; wait for any key
        int     16h

        mov     ax, 0003h         ; restore 80x25 text mode
        int     10h

        mov     ax, 4C00h         ; exit(0)
        int     21h
