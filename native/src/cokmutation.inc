; CCINV M inv request response: one unpublished combined candidate.
; GBMR uses the checkpoint's body/effect offsets, but is NOT a camp save.
; Header: magic,version=1/2,game=1,phase=0/1,area,failurePC,successorPC,target,
; reserved,rosterLen,fxLen=5750,coreLen,reserved,CRC32 (zeroed for CRC).
; +32 reserved[16], +48 GBEF v9 paused on inventory halt, +5798 GBPR[2476],
; +8274 owned effects[258], +8532 timers[2572], +11104 learning[8],
; +11112 GBMC[32], +11144 ITEMS definitions[2048], +13192 item bitmap[32].
; GBMC: magic,version=1,len=32,cmpL,cmpR,flags[6],selectedValid,notFound,
; selectedOrdinal,blockLen,originalInventoryCRC32,originalInventoryLen32.
; Response phase=1 appends GBIV. VM bytes/continuation remain pending, unchanged.
; Host must separately validate/activate the candidate and resume the successor.
; v1 +32 is reserved zero. v2 +32: step,chain,repeat,damage-watermark words,
; loaded-block CRC32, reserved zero dword. Helpers preserve this context;
; actual block identity and host-event acknowledgement belong to continuation.
;
; GBMR v3 (2026-09-09, docs/engine/research/cok-mutation-output-ownership.md
; "GBMR v3 design"/"GBMR v3 hook-point decision" sections): version 3 is
; byte-identical to v2 across offsets 0..13223 (same context-block semantics,
; same every field), with one 40-byte GBOC v1 record appended immediately
; after the fixed core at absolute offset 13224 (MR_LEN_V3 = 13264). A v1/v2
; file is read/validated exactly as before -- MR_LEN stays the effective
; length, no GBOC block is looked for. A v3 file's on-disk length must equal
; MR_LEN_V3 exactly; a version-3-declared file that is only MR_LEN bytes, or
; a version-1/2-declared file that is MR_LEN_V3 bytes, is rejected outright,
; never silently truncated or read as padding. mr_len_eff (word) is set by
; mr_request.validate on every successful validate call (request or
; candidate) to the effective length for the version just validated, so
; every downstream mutation_mode/mr_finish/mutation_commit_mode site that
; used to hardcode MR_LEN for "how much of core to move/seek/write" now uses
; [mr_len_eff] instead.
MR_LEN equ 13224
MR_LEN_V3 equ 13264
MR_FX equ core+48
MR_TIMER equ core+8532
MR_FRAME equ core+11112
MR_TABLE equ core+11144
MR_TYPES equ core+13192

%include "cokstats.inc"
%include "cokability.inc"
%include "cokremove.inc"

mutation_mode:
        call mr_request
        jc mr_fail
        ; Validate the full inventory before creating any output.
        mov byte [check_owners], 1
        ; [mr_len_eff] now reflects the just-validated request's own effective
        ; length (MR_LEN or MR_LEN_V3), set by mr_request.validate.
        mov dx, arg1
        call open_inventory
        jc mr_fail
        mov eax, [file_len]
        cmp eax, [MR_FRAME+28]
        jne mr_fail
        mov si, query_bits
        mov di, MR_TYPES
        mov cx, 32
        repe cmpsb
        jne mr_fail
        call mr_inventory_crc
        jc mr_fail
        cmp eax, [MR_FRAME+24]
        jne mr_fail
        ; Rewind to the first owner. Keep this read-only handle throughout.
        mov bx, [in_fh]
        mov eax, 16
        call mr_seek
        jc mr_fail
        mov dx, arg3
        mov ax, 4300h
        int 21h
        jnc mr_fail                    ; never replace an existing response
        cmp ax, 2
        jne mr_fail
        mov si, arg3
        mov di, temp_path
        mov bx, 'NE'
        mov al, 'W'
        call extension_path
        jc mr_fail
        mov si, arg3
        mov di, mr_work_path
        mov bx, 'IW'
        mov al, 'K'
        call extension_path
        jc mr_fail
        mov si, arg3
        mov di, temp_path
        call mr_distinct_path
        jc mr_fail
        mov si, arg3
        mov di, mr_work_path
        call mr_distinct_path
        jc mr_fail
        mov dx, temp_path
        call mr_create
        jc mr_fail
        mov [out_fh], ax
        mov byte [mr_created], 1
        mov dx, mr_work_path
        call mr_create
        jc mr_fail
        mov [mr_work], ax
        mov byte [mr_work_created], 1
        ; Core is rewritten only after every owner's mutation succeeds.
        mov dx, core
        movzx cx, word [mr_len_eff]
        call write_exact
        jc mr_fail
        mov dx, inv_header
        mov cx, 16
        call write_exact
        jc mr_fail
        movzx eax, word [mr_len_eff]
        add eax, 16
        mov [mr_position], eax
        xor ax, ax
        mov di, MR_TYPES
        mov cx, 32
        rep stosb
        mov di, core+8274
        mov cx, 258
        rep stosb
        mov word [core+8274], 1
        mov word [mr_owner], 0
.owner:
        mov ax, [mr_owner]
        cmp ax, [owner_count]
        jae mr_finish
        mov dx, row
        mov cx, 8
        call read_exact
        jc mr_fail
        mov eax, [row+4]
        xor edx, edx
        mov ecx, 63
        div ecx
        mov [cm_count], eax
        mov [mr_left], eax
        mov dword [mr_index], 0
        mov bx, [mr_work]
        xor eax, eax
        call mr_seek
        jc mr_fail
        mov dx, mr_work_header
        mov cx, 16
        mov ah, 40h
        int 21h
        jc mr_fail
        cmp ax, 16
        jne mr_fail
.copy:
        cmp dword [mr_left], 0
        je .effects
        mov dx, cm_record
        mov cx, 63
        call read_exact
        jc mr_fail
        mov eax, [mr_index]
        inc eax
        mov [cm_record+42], eax
        cmp dword [mr_left], 1
        jne .write
        mov dword [cm_record+42], -1
.write:
        mov eax, [mr_index]
        call cm_write
        jc mr_fail
        inc dword [mr_index]
        dec dword [mr_left]
        jmp .copy
.effects:
        ; Gather this owner's effects; remember original global ordinals.
        mov word [cm_fxcount], 0
        xor bp, bp
        mov si, MR_TIMER+12
        mov di, mr_effects
.gather:
        cmp bp, [MR_TIMER+2]
        jae .run
        mov ax, [mr_owner]
        inc ax
        cmp al, [si]
        jne .next_effect
        mov bx, [cm_fxcount]
        shl bx, 1
        mov [mr_fxmap+bx], bp
        inc word [cm_fxcount]
        push si
        inc si
        mov cx, 9
        rep movsb
        pop si
.next_effect:
        add si, 10
        inc bp
        jmp .gather
.run:
        imul ax, [mr_owner], 410
        add ax, core+5815
        mov [cm_body], ax
        mov word [cm_table], MR_TABLE
        mov word [cm_effects], mr_effects
        mov al, [core+16]
        mov [cm_target], al
        mov dword [cm_head], -1
        cmp dword [cm_count], 0
        je .gboc
        mov dword [cm_head], 0
.gboc:
        ; GBOC v1 output authorization (2026-09-09, GBMR v3). cm_gboc is a
        ; process-lifetime static (cokremove.inc), so it is explicitly reset
        ; to zero for EVERY owner before deciding whether this one is the
        ; GBOC record's own (one-based) target_ordinal -- a stale nonzero
        ; value surviving from an earlier owner in the same combined
        ; candidate must never authorize a later, unrelated owner's kind-7
        ; effect. v1/v2 requests always leave this at zero for every owner,
        ; byte-for-byte unaffected.
        mov word [cm_gboc], 0
        cmp word [core+4], 3
        jne .invoke
        mov ax, [mr_owner]
        inc ax
        cmp ax, [core+13224+24]        ; GBOC target_ordinal (one-based)
        jne .invoke
        mov word [cm_gboc], core+13224
        mov eax, [core+174]            ; MR_FX+126: paused GBEF RNG dword
        mov [cm_gbef_rng], eax
.invoke:
        call cm_destroy
        jc mr_fail
        cmp word [cm_gboc], 0
        je .no_output
        ; A validated write-present GBOC record may have folded the RNG
        ; forward inside cm_authorize_output; persist that fold into the
        ; response candidate's own embedded GBEF so mr_finish's later
        ; full-core write, and eventually CCECL's resume, see it. A
        ; write-flag-clear record leaves cm_gbef_rng equal to what it
        ; already was, so this is a harmless no-op in that case.
        mov eax, [cm_gbef_rng]
        mov [core+174], eax
.no_output:
        ; Materialize this completed owner into the unpublished response.
        mov eax, [mr_position]
        mov [mr_row_position], eax
        mov dword [row+4], 0
        mov dx, row
        mov cx, 8
        call write_exact
        jc mr_fail
        add dword [mr_position], 8
        jc mr_fail
        mov eax, [cm_count]
        mov [mr_left], eax
        mov eax, [cm_head]
.live_item:
        cmp eax, -1
        je .row_done
        cmp eax, [cm_count]
        jae mr_fail
        cmp dword [mr_left], 0
        je mr_fail
        dec dword [mr_left]
        call cm_read
        jc mr_fail
        mov eax, [cm_record+42]
        mov [mr_index], eax
        mov dword [cm_record+42], 0
        movzx bx, byte [cm_record+46]
        bts word [MR_TYPES], bx
        mov dx, cm_record
        mov cx, 63
        call write_exact
        jc mr_fail
        add dword [row+4], 63
        jc mr_fail
        add dword [mr_position], 63
        jc mr_fail
        mov eax, [mr_index]
        jmp .live_item
.row_done:
        mov eax, [mr_row_position]
        mov bx, [out_fh]
        call mr_seek
        jc mr_fail
        mov dx, row
        mov cx, 8
        call write_exact
        jc mr_fail
        mov eax, [mr_position]
        mov bx, [out_fh]
        call mr_seek
        jc mr_fail
        mov eax, [cm_fxhead]
        movzx ecx, word [cm_fxcount]
.live_effect:
        cmp eax, -1
        je .next_owner
        cmp eax, 256
        jae mr_fail
        cmp ax, [cm_fxcount]
        jae mr_fail
        test cx, cx
        jz mr_fail
        dec cx
        push cx
        mov bx, ax
        shl bx, 1
        mov bx, [mr_fxmap+bx]
        mov byte [mr_live+bx], 1
        imul di, bx, 10
        add di, MR_TIMER+13
        imul si, ax, 9
        add si, mr_effects
        mov eax, [si+5]
        mov [mr_index], eax
        mov dword [si+5], 0
        movzx bx, byte [si]
        test bx, bx
        jz .effect_copy
        mov dx, [mr_owner]
        shl dx, 5
        add dx, core+8276
        push si
        mov si, dx
        bts word [si], bx
        pop si
.effect_copy:
        mov cx, 9
        rep movsb
        pop cx
        mov eax, [mr_index]
        jmp .live_effect
.next_owner:
        inc word [mr_owner]
        jmp .owner

mr_finish:
        ; Compact surviving timers in ORIGINAL global order.
        xor bx, bx
        xor bp, bp
        mov si, MR_TIMER+12
        mov di, si
.timer:
        cmp bx, [MR_TIMER+2]
        jae .timer_done
        cmp byte [mr_live+bx], 0
        je .skip
        mov cx, 10
        rep movsb
        inc bp
        jmp .next
.skip: add si, 10
.next: inc bx
        jmp .timer
.timer_done:
        mov [MR_TIMER+2], bp
        mov cx, MR_TIMER+2572
        sub cx, di
        xor ax, ax
        rep stosb
        mov word [core+8], 1
        mov dword [core+28], 0
        mov eax, [mr_position]
        movzx ecx, word [mr_len_eff]
        sub eax, ecx
        mov [inv_header+8], eax
        mov bx, [out_fh]
        movzx eax, word [mr_len_eff]
        call mr_seek
        jc mr_fail
        mov dx, inv_header
        mov cx, 16
        call write_exact
        jc mr_fail
        mov bx, [out_fh]
        xor eax, eax
        call mr_seek
        jc mr_fail
        mov dx, core
        movzx cx, word [mr_len_eff]
        call write_exact
        jc mr_fail
        call close_in
        call close_out
        jc mr_fail
        mov dx, temp_path
        call open_in
        jc mr_fail
        call file_crc
        jc mr_fail
        mov [core+28], eax
        call close_in
        mov dx, temp_path
        mov ax, 3D02h
        int 21h
        jc mr_fail
        mov [out_fh], ax
        mov bx, ax
        mov eax, 28
        call mr_seek
        jc mr_fail
        mov dx, core+28
        mov cx, 4
        call write_exact
        jc mr_fail
        call close_out
        jc mr_fail
        call mr_close_work
        jc mr_fail
        mov dx, mr_work_path
        mov ah, 41h
        int 21h
        jc mr_fail
        mov byte [mr_work_created], 0
        mov dx, temp_path
        mov di, arg3
        mov ah, 56h                   ; DOS rename refuses existing target
        int 21h
        jc mr_fail
        mov byte [mr_created], 0
        jmp good

mr_fail:
        call close_in
        call close_out
        call mr_close_work
        cmp byte [mr_work_created], 0
        je .temp
        mov dx, mr_work_path
        mov ah, 41h
        int 21h
.temp: cmp byte [mr_created], 0
        je .done
        mov dx, temp_path
        mov ah, 41h
        int 21h
.done: jmp bad

mr_request:
        mov dx, arg2
        call open_in
        jc .bad
        call get_length
        jc .bad
        ; A request has no appended variable-length tail (unlike a candidate,
        ; which always carries an appended GBIV): its on-disk length must be
        ; EXACTLY MR_LEN (v1/v2) or EXACTLY MR_LEN_V3 (v3), nothing else and
        ; nothing in between. Which one was read is cross-checked against the
        ; header's own version word below, in .validate -- a v3-declared file
        ; that is actually MR_LEN bytes, or a v1/v2-declared file that is
        ; actually MR_LEN_V3 bytes, is rejected there, never silently
        ; truncated or treated as padding.
        cmp dword [file_len], MR_LEN
        je .read_short
        cmp dword [file_len], MR_LEN_V3
        jne .bad
        mov byte [mr_request_len_v3], 1
        mov dx, core
        mov cx, MR_LEN_V3
        call read_exact
        jc .bad
        jmp .have_core
.read_short:
        mov byte [mr_request_len_v3], 0
        mov dx, core
        mov cx, MR_LEN
        call read_exact
        jc .bad
.have_core:
        call file_crc
        jc .bad
        cmp eax, [core+28]
        jne .bad
        call close_in
.validate:
        xor ax, ax
        mov di, mr_bits
        mov cx, 128
        rep stosw                    ; callers may validate two cores in one process
        cmp dword [core], 'GBMR'
        jne .bad
        cmp word [core+6], 1
        jne .bad
        cmp word [core+4], 1
        je .version_ok
        cmp word [core+4], 2
        je .version_ok
        cmp word [core+4], 3
        jne .bad
.version_ok:
        ; Effective length must match this header's own version, cross-checked
        ; against the actual byte count the caller structurally read/wrote for
        ; this exact core (mr_request_len_v3 is set by mr_request's own disk
        ; read for a request, and explicitly by mutation_request_mode/
        ; mutation_commit_mode for their in-memory-constructed/candidate
        ; cores). A version-3 header backed by only MR_LEN bytes, or a
        ; version-1/2 header backed by MR_LEN_V3 bytes, is rejected here --
        ; never silently truncated or treated as padding.
        cmp word [core+4], 3
        jne .not_v3
        cmp byte [mr_request_len_v3], 0
        je .bad
        mov word [mr_len_eff], MR_LEN_V3
        jmp .len_set
.not_v3:
        cmp byte [mr_request_len_v3], 0
        jne .bad
        mov word [mr_len_eff], MR_LEN
.len_set:
        cmp word [core+8], 0
        jne .bad
        cmp word [core+16], 255
        ja .bad
        cmp word [core+18], 0
        jne .bad
        cmp word [core+22], 5750
        jne .bad
        cmp word [core+4], 3
        jne .core_len_v12
        cmp word [core+24], MR_LEN_V3
        jmp .core_len_checked
.core_len_v12:
        cmp word [core+24], MR_LEN
.core_len_checked:
        jne .bad
        cmp word [core+26], 0
        jne .bad
        mov si, core+32
        mov cx, 16
        cmp word [core+4], 1
        je .reserved
        cmp word [core+32], 1
        jb .bad
        cmp word [core+32], 60000
        jae .bad
        cmp word [core+34], 32
        ja .bad
        cmp word [core+36], 16
        jae .bad
        mov ax, [core+38]
        cmp ax, [MR_FX+2250]
        ja .bad
        mov si, core+44
        mov cx, 4
.reserved:
        lodsb
        test al, al
        jnz .bad
        loop .reserved
        mov ax, [core+20]
        mov [roster_len], ax
        call owners
        jc .bad
        ; owners admits canonical CoK v1 or CoK ID 1/schema 1 v2 for M mode;
        ; compact layouts are rejected before they can enter the GBMR builder.
        ; Fixed-size roster padding is canonical zero, never hidden state.
        mov si, core+5798
        add si, [roster_len]
        mov cx, core+8274
        sub cx, si
        jcxz .frame
.padding:
        lodsb
        test al, al
        jnz .bad
        loop .padding
.frame:
        cmp dword [MR_FRAME], 'GBMC'
        jne .bad
        cmp dword [MR_FRAME+4], 00200001h
        jne .bad
        mov si, MR_FRAME+12
        mov cx, 8
.booleans:
        lodsb
        cmp al, 1
        ja .bad
        loop .booleans
        mov ax, [MR_FRAME+20]
        cmp byte [MR_FRAME+18], 0
        je .unselected
        test ax, ax
        jz .bad
        cmp ax, [owner_count]
        ja .bad
        cmp byte [MR_FRAME+19], 0
        jne .bad
        jmp .pc
.unselected:
        test ax, ax
        jnz .bad
.pc:   mov ax, [MR_FRAME+22]
        cmp ax, 22
        jb .bad
        cmp ax, 16384
        ja .bad
        cmp [core+14], ax
        ja .bad
        mov ax, [core+12]
        cmp ax, 22
        jb .bad
        cmp ax, [core+14]
        jae .bad
        cmp dword [MR_FX], 'GBEF'
        jne .bad
        cmp word [MR_FX+4], 9
        jne .bad
        cmp word [MR_FX+8], 4
        jne .bad
        cmp dword [MR_FX+116], 'GBRS'
        jne .bad
        cmp word [MR_FX+120], 0
        jne .bad
        cmp ax, [MR_FX+124]
        jne .bad
        cmp ax, [MR_FX+5726]
        jne .bad
        mov ax, [core+10]
        cmp ax, [MR_FX+122]
        jne .bad
        cmp ax, [MR_FX+5730]
        jne .bad
        cmp word [MR_FX+130], 32
        ja .bad
        cmp word [MR_FX+196], 512
        ja .bad
        cmp dword [MR_FX+2246], 'GBSX'
        jne .bad
        cmp word [MR_FX+2250], 64
        ja .bad
        cmp word [MR_FX+32], 8
        ja .bad
        cmp word [MR_FX+82], 8
        ja .bad
        cmp dword [MR_FX+5708], 'GBES'
        jne .bad
        cmp dword [MR_FX+5720], 'GBHD'
        jne .bad
        cmp word [MR_FX+5724], 6
        jne .bad
        cmp word [MR_FX+5728], 40h
        jne .bad
        cmp dword [MR_FX+5732], 'GBCL'
        jne .bad
        cmp word [core+8274], 1
        jne .bad
        cmp word [MR_TIMER], 1
        jne .bad
        cmp word [MR_TIMER+2], 256
        ja .bad
        xor bx, bx
.source:
        mov al, [MR_TIMER+4+bx]
        cmp al, 2
        ja .bad
        test al, al
        jz .source_next
        cmp bx, [owner_count]
        jae .bad
        cmp byte [owner_ids+bx], 128
        jae .bad
.source_next:
        inc bx
        cmp bx, 8
        jb .source
        mov cx, [MR_TIMER+2]
        mov si, MR_TIMER+12
.timer:
        jcxz .matrix
        movzx bx, byte [si]
        test bx, bx
        jz .bad
        cmp bx, [owner_count]
        ja .bad
        dec bx
        cmp byte [MR_TIMER+4+bx], 0
        je .bad
        shl bx, 5
        add bx, mr_bits
        movzx ax, byte [si+1]
        test ax, ax
        jz .timer_next
        bts word [bx], ax
.timer_next:
        add si, 10
        loop .timer
.matrix:
        mov si, mr_bits
        mov di, core+8276
        mov cx, 256
        repe cmpsb
        jne .bad
        ; GBOC v1 structural check for v3 only: magic/version/length/self-CRC
        ; of the appended record at core+13224..13263, mirroring
        ; cm_authorize_output's own header checks (cokremove.inc). This is
        ; deliberately structural only -- reserved-byte-zero, RNG-before
        ; match, write-flag semantics, callback id and target ordinal are all
        ; cm_authorize_output's job at owner-dispatch time, not this
        ; envelope-level check's.
        cmp word [core+4], 3
        jne .ok
        cmp dword [core+13224], 'GBOC'
        jne .bad
        cmp word [core+13224+4], 1
        jne .bad
        cmp word [core+13224+6], 40
        jne .bad
        mov di, core+13224
        mov cx, 36
        call cm_output_crc
        cmp eax, [core+13224+36]
        jne .bad
.ok:   clc
        ret
.bad:  stc
        ret

mr_inventory_crc:
        mov bx, [in_fh]
        xor eax, eax
        call mr_seek
        jc .bad
        mov dword [crc], -1
.read: mov dx, buffer
        mov cx, 4096
        call read_some
        jc .bad
        test ax, ax
        jz .done
        mov cx, ax
        mov si, buffer
        call crc_update
        jmp .read
.done: mov eax, [crc]
        not eax
        clc
        ret
.bad:  stc
        ret

mr_create:
        xor cx, cx
        mov ah, 5Bh                   ; create NEW, never truncate a file
        int 21h
        ret
mr_distinct_path:                     ; CF if identical, case-insensitive
        lodsb
        mov ah, [di]
        inc di
        and ax, 0DFDFh
        cmp al, ah
        jne .different
        test al, al
        jnz mr_distinct_path
        stc
        ret
.different:
        clc
        ret
mr_seek:                              ; BX handle, EAX absolute offset
        test eax, eax
        js .bad
        mov edx, eax
        shr eax, 16
        mov cx, ax
        mov ax, 4200h
        int 21h
        ret
.bad:  stc
        ret
mr_close_work:
        mov bx, [mr_work]
        cmp bx, -1
        je .ok
        mov word [mr_work], -1
        mov ah, 3Eh
        int 21h
        ret
.ok:   clc
        ret
cm_seek:
        mov ecx, 63
        mul ecx
        test edx, edx
        jnz .bad
        add eax, 16
        jc .bad
        mov bx, [mr_work]
        jmp mr_seek
.bad:  stc
        ret
cm_read:
        call cm_seek
        jc cm_io.done
        mov ah, 3Fh
        jmp cm_io
cm_write:
        call cm_seek
        jc cm_io.done
        mov ah, 40h
cm_io:
        mov dx, cm_record
        mov cx, 63
        int 21h
        jc .done
        cmp ax, 63
        jne .bad
        clc
.done: ret
.bad:  stc
        ret
cm_notify:
        ret

; GBMR v3 (2026-09-09): mr_request_len_v3 is a structural length-class flag
; that MUST be set by every caller of mr_request.validate BEFORE calling it
; (mr_request itself sets it from its own disk-read branch; the in-memory
; self-check in mutation_request_mode and the candidate-read in
; mutation_commit_mode each set it from their own already-known/just-read
; version word). mr_len_eff is an OUTPUT of .validate: the effective core
; length (MR_LEN or MR_LEN_V3) implied by the header's own version word,
; once cross-checked against mr_request_len_v3. Every site downstream of a
; successful .validate call must use [mr_len_eff], never a hardcoded MR_LEN,
; when determining how many bytes of `core` are meaningful.
mr_request_len_v3 db 0
mr_len_eff dw MR_LEN

mr_work dw -1
mr_created db 0
mr_work_created db 0
mr_work_path times 128 db 0
mr_work_header db 'GBIW',1,0,0,0,0,0,0,0,0,0,0,0
mr_owner dw 0
mr_position dd 0
mr_row_position dd 0
mr_left dd 0
mr_index dd 0
mr_bits times 256 db 0
mr_live times 256 db 0
mr_fxmap times 256 dw 0
mr_effects times 256*9 db 0
