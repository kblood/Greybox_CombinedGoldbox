; CCINV B manifest request. GBMB v1/v2 is 672 bytes: 32-byte header, followed
; by five zero-padded ASCIIZ paths[128]: inventory, GBEF, GBPR, GBPS, ECL.
; Header +16 holds eight current learning bytes; +28 CRC32 with itself zero.
; Other header fields: magic, version:u16=1/2, length:u16=672; reserved zero.
; Version 2 adds a host DAMAGE acknowledgement watermark at header word +8.
; This constructor does not activate state, export retail saves or resume ECL.
; GBMB v3 (2026-09-09, GBMR v3): byte-identical to v2 across [0,MB_LEN), with
; a 40-byte GBOC v1 output-authorization record appended at MB_LEN, giving
; MB_LEN_V3 total bytes. v3 inherits v2's context-block/watermark semantics
; unchanged; the only new content is the appended GBOC payload, which
; mutation_request_body copies verbatim into the constructed GBMR request's
; own appended GBOC slot at core+13224.
MB_LEN equ 672
MB_LEN_V3 equ 712
MB_INV equ mb_manifest+32
MB_FX equ MB_INV+128
MB_PARTY equ MB_FX+128
MB_SEED equ MB_PARTY+128
MB_ECL equ MB_SEED+128

mutation_request_mode:
        xor ax, ax
        mov di, core
        ; Zero the full v3-sized core unconditionally: the manifest's own
        ; version (hence which length this request will actually be) is not
        ; known until mb_load reads it below. Over-zeroing the tail for a
        ; v1/v2 request is harmless -- that tail is never read or written by
        ; any v1/v2 code path -- and it means core's un-appended-to region
        ; never carries stale bytes from a previous, larger v3 request.
        mov cx, MR_LEN_V3
        rep stosb
        call mb_load
        jmp mutation_request_body
mb_load:
        ; Two-branch read mirroring mr_request's own pattern: a GBMB manifest
        ; has no independent variable-length tail, so its on-disk length must
        ; be EXACTLY MB_LEN (v1/v2) or EXACTLY MB_LEN_V3 (v3) -- never
        ; anything in between, and never silently truncated or padded.
        mov dx, arg1
        call open_in
        jc mb_fail
        call get_length
        jc mb_fail
        mov ax, [file_len]
        cmp dword [file_len], MB_LEN
        je .read_len
        cmp dword [file_len], MB_LEN_V3
        jne mb_fail
.read_len:
        mov dx, mb_manifest
        mov cx, ax
        call read_exact
        jc mb_fail
        call close_in
        jc mb_fail
        mov eax, [mb_manifest+28]
        mov [mb_expected_crc], eax
        mov dword [mb_manifest+28], 0
        mov si, mb_manifest
        mov cx, [file_len]
        call mb_crc
        cmp eax, [mb_expected_crc]
        jne mb_fail
        cmp dword [mb_manifest], 'GBMB'
        jne mb_fail
        mov ax, [mb_manifest+4]
        cmp ax, 3
        jne .not_v3_len
        cmp dword [file_len], MB_LEN_V3
        jne mb_fail
        cmp word [mb_manifest+6], MB_LEN_V3
        jne mb_fail
        jmp .version_len_ok
.not_v3_len:
        cmp dword [file_len], MB_LEN
        jne mb_fail
        cmp word [mb_manifest+6], MB_LEN
        jne mb_fail
.version_len_ok:
        dec ax
        cmp ax, 2
        ja mb_fail
        cmp word [mb_manifest+10], 0
        jne mb_fail
        test ax, ax
        jnz .version_ok
        cmp word [mb_manifest+8], 0
        jne mb_fail
.version_ok:
        cmp dword [mb_manifest+12], 0
        jne mb_fail
        cmp dword [mb_manifest+24], 0
        jne mb_fail
        mov si, MB_INV
        mov bp, 5
.path:
        cmp byte [si], 0
        je mb_fail
        mov cx, 128
.string:
        lodsb
        dec cx
        test al, al
        jz .padding
        test cx, cx
        jnz .string
        jmp mb_fail
.padding:
        jcxz .next_path
        lodsb
        test al, al
        jnz mb_fail
        loop .padding
.next_path:
        dec bp
        jnz .path
        clc
        ret
mutation_request_body:
        mov si, mb_manifest+16
        mov di, core+11104
        mov cx, 8
        rep movsb
        mov dword [core], 'GBMR'
        mov dword [core+4], 00010002h
        mov word [core+22], 5750
        mov word [core+24], MR_LEN
        ; mr_request.validate (called below, on this freshly-constructed
        ; in-memory core, not read from disk) trusts [mr_request_len_v3] as
        ; its OWN input for which length class this core belongs to -- it is
        ; not derived from [core+4] again, on purpose (see cokmutation.inc's
        ; ".version_ok:" comment: "explicitly [set] by mutation_request_mode/
        ; mutation_commit_mode for their in-memory-constructed/candidate
        ; cores"). Leaving it unset here left it at whatever a PRIOR request/
        ; candidate validation in this process last set it to, so a
        ; genuinely v3-shaped in-memory core could be rejected as "a
        ; version-3 header backed by only MR_LEN bytes" purely because of
        ; process-lifetime staleness -- set it explicitly on both branches.
        mov byte [mr_request_len_v3], 0
        cmp word [mb_manifest+4], 3
        jne .gbmr_version_ready
        mov dword [core+4], 00010003h
        mov word [core+24], MR_LEN_V3
        mov byte [mr_request_len_v3], 1
        mov si, mb_manifest+MB_LEN
        mov di, core+13224
        mov cx, 40
        rep movsb
.gbmr_version_ready:
        mov dx, MB_FX
        mov di, MR_FX
        mov cx, 5750
        call mb_read_file
        jc mb_fail
        mov si, MR_FX
        mov cx, 5750
        call mb_crc
        mov [mb_expected_crc], eax
        call mb_yield_path
        jc mb_fail
        mov dx, mb_name
        mov di, mb_yield
        mov cx, 72
        call mb_read_file
        jc mb_fail
        cmp dword [mb_yield], 'GBIY'
        jne mb_fail
        cmp dword [mb_yield+4], 00480002h
        jne mb_fail
        mov si, mb_yield
        mov cx, 68
        call mb_crc
        cmp eax, [mb_yield+68]
        jne mb_fail
        mov si, mb_yield+52
        mov di, core+32
        mov cx, 16
        rep movsb
        ; v3 inherits v2's context-block/watermark semantics unchanged
        ; (design doc "GBMR v3 design": v3 is byte-identical to v2 across
        ; [0,MR_LEN)), so this gate must accept version >= 2, not == 2.
        cmp word [mb_manifest+4], 2
        jb .context_ready
        mov ax, [mb_manifest+8]
        mov [core+38], ax
.context_ready:
        mov eax, [mb_expected_crc]
        cmp eax, [mb_yield+48]
        jne mb_fail
        cmp dword [mb_yield+40], 0
        jne mb_fail
        cmp dword [mb_yield+44], 0
        jne mb_fail
        mov ax, [mb_yield+8]
        mov [core+12], ax
        mov ax, [mb_yield+10]
        mov [core+14], ax
        mov ax, [mb_yield+12]
        mov [core+16], ax
        mov ax, [mb_yield+14]
        mov [core+10], ax
        mov si, mb_yield+16
        mov di, MR_FRAME
        mov cx, 32
        rep movsb
        mov dx, MB_PARTY
        call open_in
        jc mb_fail
        call get_length
        jc mb_fail
        cmp dword [file_len], 16
        jb mb_fail
        cmp dword [file_len], 2476
        ja mb_fail
        mov cx, [file_len]
        mov [core+20], cx
        mov [roster_len], cx
        mov dx, core+5798
        call read_exact
        jc mb_fail
        call close_in
        jc mb_fail
        call owners
        jc mb_fail
        mov dx, MB_SEED
        mov di, buffer
        mov cx, 3160
        call mb_read_file
        jc mb_fail
        cmp dword [buffer], 'GBPS'
        jne mb_fail
        cmp dword [buffer+4], 00010006h
        jne mb_fail
        mov ax, [owner_count]
        cmp ax, [buffer+8]
        jne mb_fail
        mov si, buffer+3112
        mov cx, 16
.ages:
        lodsb
        test al, al
        jnz mb_fail                    ; host must synchronize pending ages first
        loop .ages
        mov si, buffer+282
        mov di, core+8274
        mov cx, 258
        rep movsb
        mov si, buffer+540
        mov di, MR_TIMER
        mov cx, 2572
        rep movsb
        mov si, buffer+3128
        mov di, MR_TYPES
        mov cx, 32
        rep movsb
        mov byte [check_owners], 1
        mov dx, MB_INV
        call open_inventory
        jc mb_fail
        mov eax, [file_len]
        mov [MR_FRAME+28], eax
        mov si, query_bits
        mov di, MR_TYPES
        mov cx, 32
        repe cmpsb
        jne mb_fail
        call mr_inventory_crc
        jc mb_fail
        mov [MR_FRAME+24], eax
        call close_in
        jc mb_fail
        ; ECL's supplied path locates its sibling ITEMS. The resume consumer
        ; still owns actual block/opcode validation against that source.
        mov dx, MB_ECL
        call open_in
        jc mb_fail
        call close_in
        jc mb_fail
        call mb_items_path
        jc mb_fail
        mov dx, mb_name
        call open_in
        jc mb_fail
        call get_length
        jc mb_fail
        cmp dword [file_len], 2050
        jb mb_fail
        mov eax, 2
        mov bx, [in_fh]
        call mr_seek
        jc mb_fail
        mov dx, MR_TABLE
        mov cx, 2048
        call read_exact
        jc mb_fail
        call close_in
        jc mb_fail
        call mr_request.validate
        jc mb_fail
        ; [mr_len_eff] (set as an OUTPUT of the .validate call just above,
        ; from [mr_request_len_v3]) is this core's actual effective length --
        ; MR_LEN for v1/v2, MR_LEN_V3 for v3. A hardcoded MR_LEN here would
        ; silently drop the appended GBOC block from both the CRC and the
        ; file this constructor writes below, for every v3 request.
        mov si, core
        movzx cx, word [mr_len_eff]
        call mb_crc
        mov [core+28], eax
        mov si, arg2
        mov di, mb_name
        mov bx, 'NE'
        mov al, 'W'
        call extension_path
        jc mb_fail
        mov si, arg2
        mov di, mb_name
        call mr_distinct_path
        jc mb_fail
        mov dx, mb_name
        call mr_create
        jc mb_fail
        mov [out_fh], ax
        mov byte [mb_created], 1
        mov dx, core
        movzx cx, word [mr_len_eff]
        call write_exact
        jc mb_fail
        call close_out
        jc mb_fail
        mov dx, mb_name
        mov di, arg2
        mov ah, 56h
        int 21h
        jc mb_fail
        mov byte [mb_created], 0
        jmp good

mb_fail:
        call close_in
        call close_out
        cmp byte [mb_created], 0
        je .done
        mov dx, mb_name
        mov ah, 41h
        int 21h
.done: jmp bad

mb_read_file:                         ; DX path, DI buffer, CX exact length
        mov [mb_buffer], di
        mov [mb_length], cx
        call open_in
        jc .bad
        call get_length
        jc .bad
        movzx eax, word [mb_length]
        cmp eax, [file_len]
        jne .bad
        mov dx, [mb_buffer]
        mov cx, [mb_length]
        call read_exact
        jc .bad
        call close_in
        ret
.bad:  stc
        ret
mb_crc:
        mov dword [crc], -1
        call crc_update
        mov eax, [crc]
        not eax
        ret

mb_yield_path:
        mov si, MB_FX
        mov di, mb_name
        xor bx, bx
        mov cx, 124
.copy: lodsb
        stosb
        test al, al
        jz .extension
        cmp al, '.'
        jne .slash
        mov bx, di
        dec bx
.slash:
        cmp al, 5Ch
        je .component
        cmp al, '/'
        jne .next
.component:
        xor bx, bx
.next: loop .copy
        stc
        ret
.extension:
        dec di
        test bx, bx
        jz .append
        mov di, bx
.append:
        mov dword [di], '.YLD'
        mov byte [di+4], 0
        clc
        ret

mb_items_path:
        mov si, MB_ECL
        mov di, mb_name
        mov bp, di
.copy: lodsb
        stosb
        test al, al
        jz .append
        cmp al, 5Ch
        je .component
        cmp al, '/'
        je .component
        cmp al, ':'
        jne .copy
.component:
        mov bp, di
        jmp .copy
.append:
        cmp bp, mb_name+122
        ja .bad
        mov di, bp
        mov si, mb_items
        mov cx, 6
        rep movsb
        clc
        ret
.bad:  stc
        ret

mb_manifest times MB_LEN_V3 db 0
mb_yield times 72 db 0
mb_name times 128 db 0
mb_items db 'ITEMS',0
mb_expected_crc dd 0
mb_buffer dw 0
mb_length dw 0
mb_created db 0
