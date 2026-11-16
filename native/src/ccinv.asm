; CCINV -- streaming CoK inventory/checkpoint storage helper.
; I roster inv : import selected SAVE/cloud STF files into a GBIV envelope.
; P inv        : validate envelope and reject pending scroll scribing.
; S core inv   : extend an unpublished GBCP v4 temporary file to v5.
; L save core stage : validate save, extract legacy core and staged inventory.
; A stage inv  : publish a validated staged envelope, with rollback attempt.
; R inv request response : plan a GBLR learning action; stage inventory as .NEW.
; W inv mask : export selected retail owners with staged writes and rollback.
; Q inv roster seed : publish GBPS v6 with an exact owned item-type bitmap.
; M inv request response : stage a combined GBMR item-removal candidate.
; B manifest request : construct GBMR from native files and a checked yield.
; C manifest request candidate : stage/activate matching owned state with rollback.
; All payload lengths are 32-bit; records are streamed without a node-count cap.
        cpu 386
        bits 16
        org 100h
        jmp start

start:
        cld
        push cs
        pop ds
        push cs
        pop es
        cli
        mov ax, cs
        mov ss, ax
        mov sp, stacktop
        sti
        mov si, 81h
        movzx cx, byte [80h]
        call skip_space
        test cx, cx
        jz bad
        lodsb
        dec cx
        and al, 0DFh
        mov [mode], al
        mov di, arg1
        call token
        jc bad
        cmp byte [mode], 'P'
        je .parsed
        mov di, arg2
        call token
        jc bad
        cmp byte [mode], 'L'
        je .third
        cmp byte [mode], 'R'
        je .third
        cmp byte [mode], 'M'
        je .third
        cmp byte [mode], 'C'
        je .third
        cmp byte [mode], 'Q'
        jne .parsed
.third: mov di, arg3
        call token
        jc bad
.parsed:
        call skip_space
        test cx, cx
        jnz bad
        cmp byte [mode], 'I'
        je import_mode
        cmp byte [mode], 'P'
        je preflight_mode
        cmp byte [mode], 'S'
        je store_mode
        cmp byte [mode], 'L'
        je load_mode
        cmp byte [mode], 'A'
        je activate_mode
        cmp byte [mode], 'R'
        je learn_mode
        cmp byte [mode], 'W'
        je export_mode
        cmp byte [mode], 'Q'
        je query_mode
        cmp byte [mode], 'M'
        je mutation_mode
        cmp byte [mode], 'B'
        je mutation_request_mode
        cmp byte [mode], 'C'
        je mutation_commit_mode
        jmp bad

skip_space:
        jcxz .done
        cmp byte [si], ' '
        jne .done
        inc si
        dec cx
        jmp skip_space
.done: ret
token:
        call skip_space
        jcxz .bad
        mov bx, 127
.loop:
        lodsb
        dec cx
        cmp al, ' '
        je .end
        stosb
        dec bx
        jz .bad
        jcxz .end
        jmp .loop
.end:  mov byte [di], 0
        clc
        ret
.bad:  stc
        ret

import_mode:
        mov dx, arg1
        call open_in
        jc bad
        mov dx, core+5798
        mov cx, 2477
        call read_some
        jc bad
        mov [roster_len], ax
        call close_in
        call owners
        jc bad
        mov word [destination], arg2
        call import_inventory
        jc bad
        jmp good

preflight_mode:
        mov byte [pending_check], 1
        mov dx, arg1
        call open_inventory
        jc bad
        call close_in
        jmp good

activate_mode:
        mov dx, arg1
        call open_inventory
        jc bad
        call close_in
        mov word [staged], arg1
        mov word [destination], arg2
        call publish
        jc bad
        jmp good

store_mode:
        mov dx, arg1
        call open_core
        jc bad
        cmp word [core+4], 4
        jne bad
        call close_in
        mov byte [check_owners], 1
        mov dx, arg2
        call open_inventory
        jc bad
        call close_in
        mov word [core+4], 5
        mov dword [core+28], 0
        mov dx, arg1               ; caller supplies an unpublished temporary file
        call open_out
        jc bad
        mov dx, core
        mov cx, 11112
        call write_exact
        jc bad
        mov dx, arg2
        call open_in
        jc bad
        call get_length
        jc bad
        mov eax, [file_len]
        mov [copy_left], eax
        call copy_bytes
        jc bad
        call close_in
        call close_out
        jc bad
        mov dx, arg1
        call open_in
        jc bad
        call file_crc
        jc bad
        mov [crc_result], eax
        call close_in
        mov dx, arg1
        mov ax, 3D02h
        int 21h
        jc bad
        mov [out_fh], ax
        mov bx, ax
        xor cx, cx
        mov dx, 28
        mov ax, 4200h
        int 21h
        jc bad
        mov dx, crc_result
        mov cx, 4
        call write_exact
        jc bad
        jmp good

load_mode:
        mov dx, arg1
        call open_core
        jc bad
        cmp word [core+4], 5
        jne .legacy
        mov byte [check_owners], 1
        mov dword [scan_base], 11112
        mov bx, [in_fh]
        xor cx, cx
        mov dx, 11112
        mov ax, 4200h
        int 21h
        jc bad
        call scan_inventory
        jc bad
        mov dx, arg3
        call open_out
        jc bad
        mov bx, [in_fh]
        xor cx, cx
        mov dx, 11112
        mov ax, 4200h
        int 21h
        jc bad
        mov eax, [file_len]
        sub eax, 11112
        mov [copy_left], eax
        call copy_bytes
        jc bad
        call close_in
        call close_out
        jc bad
        mov word [core+4], 4
        mov dword [core+28], 0
        mov dword [crc], 0FFFFFFFFh
        mov si, core
        mov cx, 11112
        call crc_update
        mov eax, [crc]
        not eax
        mov [core+28], eax
        jmp .core
.legacy:
        call close_in
        mov word [destination], arg3
        call import_inventory     ; older checkpoints had no saved inventory
        jc bad
.core:
        mov dx, arg2
        call open_out
        jc bad
        mov dx, core
        mov cx, [core_len]
        call write_exact
        jc bad
        jmp good

; Read/CRC-check the entire file; retain only the fixed legacy core in memory.
open_core:
        call open_in
        jc .bad
        call get_length
        jc .bad
        mov dx, core
        mov cx, 32
        call read_exact
        jc .bad
        cmp dword [core], 'GBCP'
        jne .bad
        ; core+6 is gbboot.asm checkpoint_header+6, the checkpoint_game_id
        ; byte (1 CoK / 2 DoK, high byte always 0 from the header's own
        ; zero-fill) -- this used to hard-reject anything but CoK's 1, an
        ; EIGHTH FLAG_DOK-family gate, found by running a real DoK checkpoint
        ; save. Nothing below this point reads the game id; it is only
        ; re-checked for consistency by checkpoint_validate's own
        ; checkpoint_game_id call on the gbboot side.
        mov ax, [core+6]
        dec ax
        cmp ax, 1
        ja .bad
        mov bx, [core+4]
        dec bx
        cmp bx, 4
        ja .bad
        shl bx, 1
        mov ax, [core_lengths+bx]
        mov [core_len], ax
        cmp ax, [core+24]
        jne .bad
        movzx eax, ax
        cmp [file_len], eax
        jb .bad
        cmp word [core+4], 5
        je .read
        cmp [file_len], eax
        jne .bad
.read: sub ax, 32
        mov cx, ax
        mov dx, core+32
        call read_exact
        jc .bad
        mov ax, [core+20]
        mov [roster_len], ax
        call owners
        jc .bad
        call file_crc
        jc .bad
        cmp eax, [core+28]
        jne .bad
        clc
        ret
.bad:  stc
        ret

owners:
        cmp dword [core+5798], 'GBPR'
        jne .bad
        cmp word [core+5806], 410
        jne .bad
        ; core+5808 is ccparty.asm's FLAG_DOK word (GBPR body offset 10):
        ; 0 for CoK's full 409-byte CCH body, 1 for DoK's 216-byte .GAM body
        ; plus GBD1 tail. Neither shape is read here beyond the per-owner
        ; slot id owner_bit checks below -- but owners: is shared by FOUR
        ; modes, and only three of them (import 'I', checkpoint store 'S',
        ; checkpoint load 'L') are DoK-safe: query 'Q' and learn 'R' feed a
        ; DOS-side reference model (tools/cok_learning.py's _parse) that
        ; requires this same roster's flags word to be exactly 0 for a
        ; DIFFERENT reason -- scroll scribing (learn_mode) must stay
        ; CoK-only, matching gbboot.asm's rest_learn_prepare/rest_learn_tick
        ; guards, because DoK's compact body has real character data (not
        ; padding) at the offsets scribing progress would otherwise use.
        ; Relaxing this check unconditionally regressed
        ; gbboot-create-test.ps1's learning-fixtures.py negative fixture
        ; C0185 (mutates this exact word to 1 inside a learn request and
        ; expects rejection) -- found by running the full flow sweep, not by
        ; inspection. So the DoK exception is scoped to the three modes that
        ; actually need it.
        mov ax, [core+5802]
        cmp ax, 1
        je .v1
        cmp ax, 2
        jne .bad
        cmp word [core+5812], 1
        jne .bad
        mov ax, [core+5810]
        cmp ax, 1
        je .v2_cok
        cmp ax, 2
        je .v2_compact
        cmp ax, 3
        jne .bad
.v2_compact:
        cmp word [core+5808], 1
        jne .bad
        jmp .compact_modes
.v2_cok:
        cmp word [core+5808], 0
        jne .bad
        jmp .flagok
.v1:
        cmp dword [core+5810], 0
        jne .bad
        cmp word [core+5808], 0
        je .flagok
        cmp word [core+5808], 1
        jne .bad
.compact_modes:
        cmp byte [mode], 'I'
        je .flagok
        cmp byte [mode], 'S'
        je .flagok
        cmp byte [mode], 'L'
        je .flagok
        jmp .bad
.flagok:
        mov cx, [core+5804]
        cmp cx, 6
        ja .bad
        mov [owner_count], cx
        imul ax, cx, 410
        add ax, 16
        cmp ax, [roster_len]
        jne .bad
        mov word [seen], 0
        mov si, core+5814
        mov di, owner_ids
.loop: jcxz .done
        mov al, [si]
        call owner_bit
        jc .bad
        bts [seen], bx
        jc .bad
        stosb
        add si, 410
        loop .loop
.done: clc
        ret
.bad:  stc
        ret
owner_bit:                         ; AL source id, BX unique index 0..11
        movzx bx, al
        cmp bx, 128
        jae .native
        dec bx
        cmp bx, 5
        ja .bad
        clc
        ret
.native:
        sub bx, 128
        cmp bx, 5
        ja .bad
        add bx, 6
        clc
        ret
.bad:  stc
        ret

open_inventory:
        call open_in
        jc .bad
        call get_length
        jc .bad
        mov dword [scan_base], 0
        call scan_inventory
        ret
.bad:  stc
        ret
scan_inventory:
        mov dx, inv_header
        mov cx, 16
        call read_exact
        jc .bad
        cmp dword [inv_header], 'GBIV'
        jne .bad
        cmp word [inv_header+4], 1
        jne .bad
        cmp dword [inv_header+12], 0
        jne .bad
        mov ax, [inv_header+6]
        cmp ax, 6
        ja .bad
        cmp byte [check_owners], 0
        je .count
        cmp ax, [owner_count]
        jne .bad
.count:
        mov [rows_left], ax
        mov eax, [file_len]
        sub eax, [scan_base]
        jc .bad
        cmp eax, [inv_header+8]
        jne .bad
        sub eax, 16
        jc .bad
        mov [inv_left], eax
        mov word [row_index], 0
        mov word [seen], 0
.row:
        cmp word [rows_left], 0
        je .done
        sub dword [inv_left], 8
        jc .bad
        mov dx, row
        mov cx, 8
        call read_exact
        jc .bad
        mov al, [row]
        call owner_bit
        jc .bad
        bts [seen], bx
        jc .bad
        cmp byte [check_owners], 0
        je .flags
        mov bx, [row_index]
        cmp al, [owner_ids+bx]
        jne .bad
.flags:
        cmp word [row+2], 0
        jne .bad
        mov al, [row+1]
        cmp al, 3
        ja .bad
        cmp al, 2
        je .bad
        test al, al
        jnz .length
        cmp dword [row+4], 0
        jne .bad
.length:
        mov eax, [row+4]
        sub [inv_left], eax
        jc .bad
        xor edx, edx
        mov ebx, 63
        div ebx
        test edx, edx
        jnz .bad
        mov [nodes_left], eax
.node:
        cmp dword [nodes_left], 0
        je .next
        mov dx, buffer
        mov cx, 63
        call read_exact
        jc .bad
        cmp byte [pending_check], 0
        je .advance
        cmp byte [buffer+46], 39
        je .scroll
        cmp byte [buffer+46], 40
        jne .advance
.scroll:
        mov al, [pending_limit]
        cmp byte [buffer+60], al
        ja .bad
        cmp byte [buffer+61], al
        ja .bad
        cmp byte [buffer+62], al
        ja .bad
.advance:
        cmp byte [mode], 'Q'
        je .query
        cmp byte [mode], 'M'
        je .query
        cmp byte [mode], 'B'
        je .query
        cmp byte [mode], 'C'
        jne .learning
.query:
        movzx bx, byte [buffer+46]
        bts word [query_bits], bx
.learning:
        call lr_tag_pending
        dec dword [nodes_left]
        jmp .node
.next: inc word [row_index]
        dec word [rows_left]
        jmp .row
.done: cmp dword [inv_left], 0
        jne .bad
        clc
        ret
.bad:  stc
        ret

; Import exact source records into a temporary envelope before publication.
import_inventory:
        mov si, [destination]
        mov di, temp_path
        mov bx, 'TM'
        mov al, 'P'
        call extension_path
        jc .bad
        mov word [staged], temp_path
        mov dx, temp_path
        call open_out
        jc .bad
        mov dword [inv_header], 'GBIV'
        mov word [inv_header+4], 1
        mov ax, [owner_count]
        mov [inv_header+6], ax
        mov dword [inv_header+8], 16
        mov dword [inv_header+12], 0
        mov dx, inv_header
        mov cx, 16
        call write_exact
        jc .bad
        mov word [row_index], 0
.row:
        mov bx, [row_index]
        cmp bx, [owner_count]
        jae .finish
        mov dword [row], 0
        mov dword [row+4], 0
        mov al, [owner_ids+bx]
        mov [row], al
        cmp al, 128
        jae .write
        add al, '0'
        mov [save_path+12], al
        mov [cloud_path+21], al
        mov dx, save_path
        call open_in
        jnc .present
        cmp ax, 2
        je .cloud
        cmp ax, 3
        jne .bad
.cloud:
        mov dx, cloud_path
        call open_in
        jnc .cloud_present
        cmp ax, 2
        je .write
        cmp ax, 3
        je .write
        jmp .bad
.cloud_present:
        mov byte [row+1], 2
.present:
        or byte [row+1], 1
        call get_length
        jc .bad
        mov eax, [file_len]
        mov [row+4], eax
        xor edx, edx
        mov ebx, 63
        div ebx
        test edx, edx
        jnz .bad
.write:
        add dword [inv_header+8], 8
        jc .bad
        mov eax, [row+4]
        add [inv_header+8], eax
        jc .bad
        test dword [inv_header+8], 80000000h
        jnz .bad
        mov [copy_left], eax
        mov dx, row
        mov cx, 8
        call write_exact
        jc .bad
        call copy_bytes
        jc .bad
        call close_in
        inc word [row_index]
        jmp .row
.finish:
        mov bx, [out_fh]
        xor cx, cx
        xor dx, dx
        mov ax, 4200h
        int 21h
        jc .bad
        mov dx, inv_header
        mov cx, 16
        call write_exact
        jc .bad
        call close_out
        jc .bad
        call publish
        ret
.bad:  stc
        ret

; SI input pathname, DI output; replace a three-character extension.
extension_path:
        push ax
        push bx
        mov cx, 124
        xor dx, dx
.copy: lodsb
        stosb
        test al, al
        jz .end
        cmp al, '.'
        jne .next
        mov dx, di
.next: loop .copy
        pop bx
        pop ax
        stc
        ret
.end:  pop bx
        pop ax
        test dx, dx
        jz .bad
        sub di, dx
        cmp di, 4
        jne .bad
        mov di, dx
        mov [di], bx
        mov [di+2], al
        mov byte [di+3], 0
        clc
        ret
.bad:  stc
        ret

publish:
        mov si, [destination]
        mov di, backup_path
        mov bx, 'BA'
        mov al, 'K'
        call extension_path
        jc .bad
        mov byte [had_old], 0
        mov dx, [destination]
        mov ax, 4300h
        int 21h
        jnc .old
        cmp ax, 2
        je .new
        cmp ax, 3
        jne .bad
        jmp .new
.old:  mov dx, backup_path
        mov ah, 41h
        int 21h
        jnc .move_old
        cmp ax, 2
        je .move_old
        cmp ax, 3
        jne .bad
.move_old:
        mov dx, [destination]
        mov di, backup_path
        mov ah, 56h
        int 21h
        jc .bad
        mov byte [had_old], 1
.new:  mov dx, [staged]
        mov di, [destination]
        mov ah, 56h
        int 21h
        jnc .ok
        cmp byte [had_old], 0
        je .bad
        mov dx, backup_path
        mov di, [destination]
        mov ah, 56h
        int 21h
.bad:  stc
        ret
.ok:   clc
        ret

open_in:
        mov ax, 3D00h
        int 21h
        jc .done
        mov [in_fh], ax
.done: ret
open_out:
        xor cx, cx
        mov ah, 3Ch
        int 21h
        jc .done
        mov [out_fh], ax
.done: ret
close_in:
        mov bx, [in_fh]
        cmp bx, 0FFFFh
        je .done
        mov ah, 3Eh
        int 21h
        mov word [in_fh], 0FFFFh
.done: ret
close_out:
        mov bx, [out_fh]
        cmp bx, 0FFFFh
        je .done
        mov ah, 3Eh
        int 21h
        mov word [out_fh], 0FFFFh
.done: ret
read_some:
        mov bx, [in_fh]
        mov ah, 3Fh
        int 21h
        ret
read_exact:
        call read_some
        jc .bad
        cmp ax, cx
        jne .bad
        clc
        ret
.bad:  stc
        ret
write_exact:
        mov bx, [out_fh]
        mov ah, 40h
        int 21h
        jc .bad
        cmp ax, cx
        jne .bad
        clc
        ret
.bad:  stc
        ret
get_length:
        mov bx, [in_fh]
        xor cx, cx
        xor dx, dx
        mov ax, 4202h
        int 21h
        jc .bad
        movzx ecx, dx
        shl ecx, 16
        mov cx, ax
        mov [file_len], ecx
        test ecx, ecx
        js .bad
        xor cx, cx
        xor dx, dx
        mov ax, 4200h
        int 21h
        ret
.bad:  stc
        ret
copy_bytes:
        cmp dword [copy_left], 0
        je .done
        mov ecx, [copy_left]
        cmp ecx, 4096
        jbe .chunk
        mov cx, 4096
.chunk:
        mov dx, buffer
        call read_exact
        jc .bad
        mov dx, buffer
        call write_exact
        jc .bad
        movzx eax, cx
        sub [copy_left], eax
        jmp copy_bytes
.done: clc
        ret
.bad:  stc
        ret

crc_update:
        mov eax, [crc]
.byte: xor al, [si]
        inc si
        mov bl, 8
.bit:  shr eax, 1
        jnc .next
        xor eax, 0EDB88320h
.next: dec bl
        jnz .bit
        loop .byte
        mov [crc], eax
        ret
file_crc:
        mov dword [crc], 0FFFFFFFFh
        mov byte [crc_first], 1
        mov bx, [in_fh]
        xor cx, cx
        xor dx, dx
        mov ax, 4200h
        int 21h
        jc .bad
.read: mov dx, buffer
        mov cx, 4096
        call read_some
        jc .bad
        test ax, ax
        jz .done
        cmp byte [crc_first], 0
        je .update
        cmp ax, 32
        jb .bad
        mov dword [buffer+28], 0
        mov byte [crc_first], 0
.update:
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

; Q inv roster seed -- derive every byte-sized type from the selected GBIV.
; Validate both inventory ownership and the complete v5 input before replacing
; the seed. Version 6 appends 32 bytes, including presence of item type zero.
query_mode:
        mov dx, arg2
        call open_in
        jc bad
        mov dx, core+5798
        mov cx, 2477
        call read_some
        jc bad
        mov [roster_len], ax
        call close_in
        call owners
        jc bad
        cmp word [core+5802], 2
        jne .legacy_cok_identity
        cmp word [core+5810], 1
        jne bad
        cmp word [core+5812], 1
        jne bad
        jmp .cok_identity_ok
.legacy_cok_identity:
        cmp dword [core+5810], 0
        jne bad
.cok_identity_ok:
        mov byte [check_owners], 1
        mov dx, arg1
        call open_inventory
        jc bad
        call close_in
        mov dx, arg3
        call open_in
        jc bad
        mov dx, core
        mov cx, 3129
        call read_some
        jc bad
        cmp ax, 3128
        jne bad
        call close_in
        cmp dword [core], 'GBPS'
        jne bad
        cmp word [core+4], 5
        jne bad
        test word [core+6], 1
        jz bad
        ; Explicit diagnostic party-count seeds may differ from the roster.
        ; Inventory ownership was checked against the complete GBPR above.
        cmp word [core+8], 6
        ja bad
        mov word [core+4], 6
        mov si, arg3
        mov word [destination], arg3
        mov di, temp_path
        mov bx, 'TM'
        mov al, 'P'
        call extension_path
        jc bad
        mov word [staged], temp_path
        mov dx, temp_path
        call open_out
        jc bad
        mov dx, core
        mov cx, 3128
        call write_exact
        jc bad
        mov dx, query_bits
        mov cx, 32
        call write_exact
        jc bad
        call close_out
        jc bad
        call publish
        jc bad
        jmp good

query_bits times 32 db 0

; W inv mask -- stage all selected retail STF files before publishing them.
; Native-created owners remain GBIV-owned. Roll back earlier publications if
; a later rename fails; this is not a cross-file power-failure transaction.
export_mode:
        mov si, arg2
        xor bx, bx
.digit:
        lodsb
        test al, al
        jz .mask
        sub al, '0'
        cmp al, 9
        ja bad
        movzx ax, al
        imul bx, bx, 10
        add bx, ax
        cmp bx, 63
        ja bad
        jmp .digit
.mask: mov [lr_dirty_mask], bx
        mov dx, arg1
        call open_inventory
        jc bad
        call close_in
        mov cx, [inv_header+6]
        mov [owner_count], cx
        mov ax, [lr_dirty_mask]
        shr ax, cl
        test ax, ax
        jnz bad
        mov dx, arg1
        call open_in
        jc bad
        mov dx, inv_header
        mov cx, 16
        call read_exact
        jc bad
        mov word [row_index], 0
.stage_owner:
        mov bx, [row_index]
        cmp bx, [owner_count]
        jae .staged
        call lr_read_row
        jc bad
        mov bx, [row_index]
        mov al, [row]
        mov [lr_export_sources+bx], al
        mov al, [row+1]
        mov [lr_export_flags+bx], al
        bt [lr_dirty_mask], bx
        jnc .skip
        cmp byte [row], 128
        jae .skip
        cmp byte [row+1], 0
        je .skip
        call lr_export_path
        jc bad
        mov dx, temp_path
        call open_out
        jc bad
        mov eax, [row+4]
        mov [copy_left], eax
        call copy_bytes
        jc bad
        call close_out
        jc bad
        mov bx, [row_index]
        bts [lr_export_ready], bx
        jmp .next_stage
.skip: mov eax, [row+4]
        mov dx, ax
        shr eax, 16
        mov cx, ax
        mov bx, [in_fh]
        mov ax, 4201h
        int 21h
        jc bad
.next_stage:
        inc word [row_index]
        jmp .stage_owner
.staged:
        call close_in
        mov word [row_index], 0
.publish_owner:
        mov bx, [row_index]
        cmp bx, [owner_count]
        jae good
        bt [lr_export_ready], bx
        jnc .next_publish
        call lr_export_path
        jc .rollback
        call publish
        jc .rollback
        mov bx, [row_index]
        bts [lr_export_done], bx
        cmp byte [had_old], 1
        jne .next_publish
        bts [lr_export_old], bx
.next_publish:
        inc word [row_index]
        jmp .publish_owner
.rollback:
        mov word [row_index], 0
.undo:
        mov bx, [row_index]
        cmp bx, [owner_count]
        jae bad
        bt [lr_export_done], bx
        jnc .next_undo
        call lr_export_path
        jc .next_undo
        mov si, [destination]
        mov di, backup_path
        mov bx, 'BA'
        mov al, 'K'
        call extension_path
        jc .next_undo
        mov dx, [destination]
        mov ah, 41h
        int 21h
        jc .next_undo
        mov bx, [row_index]
        bt [lr_export_old], bx
        jnc .next_undo
        mov dx, backup_path
        mov di, [destination]
        mov ah, 56h
        int 21h
.next_undo:
        inc word [row_index]
        jmp .undo

lr_export_path:
        mov bx, [row_index]
        mov al, [lr_export_sources+bx]
        add al, '0'
        mov [save_path+12], al
        mov [cloud_path+21], al
        mov si, save_path
        cmp byte [lr_export_flags+bx], 3
        jne .path
        mov si, cloud_path
.path: mov [destination], si
        mov di, temp_path
        mov bx, 'TM'
        mov al, 'P'
        call extension_path
        mov word [staged], temp_path
        ret

lr_export_sources times 6 db 0
lr_export_flags times 6 db 0
lr_export_ready dw 0
lr_export_done dw 0
lr_export_old dw 0

; GBLR v1 uses the idle checkpoint buffer for a 2512-byte staged response.
LR_LEN equ 2512
lr_header equ core+5782
lr_party equ core+5798
lr_state equ core+8274
lr_scribed equ core+8282
lr_memorized equ core+8288

learn_mode:
        mov dx, arg2
        call open_in
        jc bad
        call get_length
        jc bad
        cmp dword [file_len], LR_LEN
        jne bad
        mov dx, lr_header
        mov cx, LR_LEN
        call read_exact
        jc bad
        call close_in
        cmp dword [lr_header], 'GBLR'
        jne bad
        cmp word [lr_header+4], 1
        jne bad
        cmp word [lr_header+6], 1
        ja bad
        cmp word [lr_header+8], LR_LEN
        jne bad
        cmp word [lr_header+10], 0
        jne bad
        mov edx, [lr_header+12]
        mov dword [lr_header+12], 0
        push edx
        mov dword [crc], 0FFFFFFFFh
        mov si, lr_header
        mov cx, LR_LEN
        call crc_update
        not eax
        pop edx
        cmp eax, edx
        jne bad
        mov ax, [lr_party+4]
        cmp ax, 1
        je .legacy_cok
        cmp ax, 2
        jne bad
        cmp word [lr_party+12], 1
        jne bad
        cmp word [lr_party+14], 1
        jne bad
        cmp word [lr_party+10], 0
        jne bad
        jmp short .learn_identity_ok
.legacy_cok:
        cmp word [lr_party+10], 0
        jne bad
        cmp dword [lr_party+12], 0
        jne bad
.learn_identity_ok:
        mov ax, [lr_party+6]
        cmp ax, 6
        ja bad
        imul ax, ax, 410
        add ax, 16
        mov [roster_len], ax
        call owners
        jc bad
        mov di, lr_party
        add di, [roster_len]
        mov cx, 2476
        sub cx, [roster_len]
        call lr_zero_check
        jc bad
        mov di, lr_scribed
        mov cx, 12
        call lr_zero_check
        jc bad
        cmp byte [lr_state], 1
        ja bad
        cmp byte [lr_state+1], 12
        jae bad
        cmp byte [lr_state], 0
        jne .active
        cmp word [lr_header+6], 1
        je bad
        mov di, lr_state+1
        mov cx, 7
        call lr_zero_check
        jc bad
.active:
        xor bp, bp
        mov si, lr_party+17
.validate_member:
        cmp bp, 6
        jae .inventory
        cmp byte [lr_state+2+bp], 21
        ja bad
        cmp bp, [owner_count]
        jb .body
        cmp byte [lr_state+2+bp], 0
        jne bad
        jmp .next_member
.body: cmp byte [si+88], 6
        ja bad
        cmp byte [si+88], 0
        je .queue
        cmp byte [lr_state+2+bp], 0
        jne bad
.queue:
        mov di, si
        add di, 30
        mov cx, 58
.slot: mov al, [di]
        test al, 80h
        jz .next_slot
        and al, 7Fh
        dec al
        cmp al, 106
        ja bad
.next_slot:
        inc di
        loop .slot
.next_member:
        add si, 410
        inc bp
        jmp .validate_member
.inventory:
        mov byte [check_owners], 1
        mov byte [pending_check], 1
        mov byte [pending_limit], 235
        mov dx, arg1
        call open_inventory
        jc bad
        call close_in
        cmp word [lr_header+6], 0
        jne .tick
        cmp byte [lr_state], 1
        je lr_response
        mov byte [lr_fresh], 1
        mov byte [lr_state], 1
        jmp .plan
.tick: inc byte [lr_state+1]
        cmp byte [lr_state+1], 12
        jb .plan
        mov byte [lr_state+1], 0
        mov byte [lr_hour], 1
.plan:
        mov word [lr_pending_mask], 0
        mov di, lr_candidates
        mov cx, 12
        mov ax, 0FFFFh
        rep stosw
        mov dx, arg1
        call open_in
        jc bad
        mov dx, inv_header
        mov cx, 16
        call read_exact
        jc bad
        mov word [row_index], 0
.owner:
        mov bx, [row_index]
        cmp bx, [owner_count]
        jae .planned
        imul si, bx, 410
        add si, lr_party+17
        mov [lr_body], si
        mov byte [lr_need], 0
        mov byte [lr_look], 0
        mov byte [lr_stop], 0
        mov byte [lr_level], 0
        mov word [lr_mem_sum], 0     ; sum and max are adjacent bytes
        mov word [lr_scroll_sum], 0
        cmp byte [lr_fresh], 1
        je .estimate
        cmp byte [lr_state+2+bx], 0
        je .due
        dec byte [lr_state+2+bx]
.due:  cmp byte [lr_state+2+bx], 0
        jne .read_row
        cmp byte [si+88], 0
        je .complete
        cmp byte [lr_hour], 1
        jne .read_row
        dec byte [si+88]
        jnz .read_row
        mov byte [lr_look], 1
.complete:
        mov byte [lr_need], 1
        jmp .read_row
.estimate:
        mov di, si
        add di, 30
        mov cx, 58
.estimate_slot:
        mov al, [di]
        test al, 80h
        jz .estimate_next
        and ax, 7Fh
        mov bx, ax
        mov al, [lr_levels+bx]
        test al, al
        jnz .estimate_nonzero
        inc al
.estimate_nonzero:
        add [lr_mem_sum], al
        cmp al, [lr_mem_max]
        jbe .estimate_next
        mov [lr_mem_max], al
.estimate_next:
        inc di
        loop .estimate_slot
.read_row:
        call lr_read_row
        jc bad
.node:
        cmp dword [nodes_left], 0
        je .owner_done
        mov dx, buffer
        mov cx, 63
        call read_exact
        jc bad
        mov byte [lr_removed_current], 0
        cmp byte [buffer+46], 39
        je .scroll
        cmp byte [buffer+46], 40
        jne .advance
.scroll:
        cmp byte [lr_fresh], 1
        jne .maybe_scan
        mov di, 60
.scroll_estimate:
        mov al, [buffer+di]
        test al, 80h
        jz .scroll_next
        and ax, 7Fh
        mov bx, ax
        mov al, [lr_levels+bx]
        add [lr_scroll_sum], al
        cmp al, [lr_scroll_max]
        jbe .scroll_next
        mov [lr_scroll_max], al
.scroll_next:
        inc di
        cmp di, 63
        jb .scroll_estimate
        jmp .advance
.maybe_scan:
        cmp byte [lr_need], 1
        jne .advance
        cmp byte [lr_stop], 0
        jne .advance
        cmp byte [lr_level], 0
        jne .advance
        call lr_scan_node
.advance:
        call lr_tag_pending
        inc dword [lr_node_index]
        dec dword [nodes_left]
        jmp .node
.owner_done:
        mov si, [lr_body]
        cmp byte [lr_fresh], 1
        jne .countdown
        xor ax, ax
        mov al, [lr_mem_sum]
        or al, [lr_scroll_sum]
        jz .no_delay
        mov al, 4
.no_delay:
        cmp byte [lr_mem_max], 2
        ja .six
        cmp byte [lr_scroll_max], 2
        jbe .delay
.six:  mov al, 6
.delay:
        mov [si+88], al
        jmp .next_owner
.countdown:
        cmp byte [lr_need], 1
        jne .next_owner
        cmp byte [lr_level], 0
        jne .count
        call lr_mem_scan
.count:
        mov al, [lr_level]
        mov dl, al
        add al, al
        add al, dl
        mov bx, [row_index]
        mov [lr_state+2+bx], al
.next_owner:
        inc word [row_index]
        jmp .owner
.planned:
        call close_in
        cmp word [lr_dirty_mask], 0
        je lr_response
        call lr_write_stage
        jc bad
lr_response:
        mov ax, [lr_pending_mask]
        shl ax, 8
        or ax, [lr_dirty_mask]
        mov [lr_header+10], ax
        mov dword [crc], 0FFFFFFFFh
        mov si, lr_header
        mov cx, LR_LEN
        call crc_update
        not eax
        mov [lr_header+12], eax
        mov dx, arg3
        call open_out
        jc bad
        mov dx, lr_header
        mov cx, LR_LEN
        call write_exact
        jc bad
        jmp good

lr_tag_pending:
        cmp byte [mode], 'R'
        jne .done
        cmp byte [lr_removed_current], 0
        jne .done
        cmp byte [buffer+46], 39
        je .scroll
        cmp byte [buffer+46], 40
        jne .done
.scroll:
        cmp byte [buffer+60], 128
        ja .pending
        cmp byte [buffer+61], 128
        ja .pending
        cmp byte [buffer+62], 128
        jbe .done
.pending:
        mov bx, [row_index]
        bts [lr_pending_mask], bx
.done: ret

lr_zero_check:
        test cx, cx
        jz .done
.byte: cmp byte [di], 0
        jne .bad
        inc di
        loop .byte
.done: clc
        ret
.bad:  stc
        ret

lr_read_row:
        mov dx, row
        mov cx, 8
        call read_exact
        jc .bad
        mov eax, [row+4]
        xor edx, edx
        mov ebx, 63
        div ebx
        mov [nodes_left], eax
        mov dword [lr_node_index], 0
        clc
        ret
.bad:  stc
        ret

lr_scan_node:
        mov byte [lr_removed_current], 0
        mov di, 60
.slot: cmp di, 63
        jae .done
        cmp byte [lr_level], 0
        jne .done
        mov al, [buffer+di]
        cmp al, 128
        jbe .next
        and ax, 7Fh
        mov bx, ax
        cmp byte [lr_look], 1
        je .look
        mov [lr_spell], al
        mov si, [lr_body]
        mov byte [si+98+bx], 1
        mov bx, [row_index]
        mov [lr_scribed+bx], al
        bts [lr_dirty_mask], bx
        push di
        mov bp, 60
.last: mov al, [buffer+bp]
        and al, 7Fh
        cmp al, [lr_spell]
        jne .last_next
        mov dx, bp
.last_next:
        inc bp
        cmp bp, 63
        jb .last
        mov di, dx
        mov byte [buffer+di], 0
        dec byte [buffer+47]
        cmp byte [buffer+47], 100
        jae .retain
        mov byte [lr_removed_current], 1
        bts [lr_remove_mask], bx
.retain:
        imul di, bx, 63
        add di, lr_changed
        mov si, buffer
        mov cx, 63
        rep movsb
        shl bx, 2
        mov eax, [lr_node_index]
        mov [lr_candidates+bx], eax
        pop di
        mov byte [lr_look], 1
        jmp .next
.look: mov al, [lr_levels+bx]
        mov [lr_level], al
.next: inc di
        jmp .slot
.done: cmp byte [lr_removed_current], 1
        jne .return
        mov byte [lr_stop], 1
.return:
        ret

lr_mem_scan:
        mov di, [lr_body]
        add di, 30
        mov cx, 58
.slot: mov al, [di]
        test al, 80h
        jz .next
        and ax, 7Fh
        mov bx, ax
        cmp byte [lr_look], 1
        je .look
        mov [di], al
        mov bx, [row_index]
        mov [lr_memorized+bx], al
        mov byte [lr_look], 1
        jmp .next
.look: mov al, [lr_levels+bx]
        test al, al
        jz .next
        mov [lr_level], al
        ret
.next: inc di
        loop .slot
        ret

lr_write_stage:
        mov si, arg1
        mov di, temp_path
        mov bx, 'NE'
        mov al, 'W'
        call extension_path
        jc .bad
        mov dx, arg1
        call open_in
        jc .bad
        mov dx, temp_path
        call open_out
        jc .bad
        mov dx, inv_header
        mov cx, 16
        call read_exact
        jc .bad
        mov ax, [lr_remove_mask]
.length:
        test ax, ax
        jz .header
        shr ax, 1
        jnc .length
        sub dword [inv_header+8], 63
        jmp .length
.header:
        mov dx, inv_header
        mov cx, 16
        call write_exact
        jc .bad
        mov word [row_index], 0
.owner:
        mov bx, [row_index]
        cmp bx, [owner_count]
        jae .done
        call lr_read_row
        jc .bad
        mov bx, [row_index]
        bt [lr_remove_mask], bx
        jnc .row
        sub dword [row+4], 63
.row:  mov dx, row
        mov cx, 8
        call write_exact
        jc .bad
.node: cmp dword [nodes_left], 0
        je .next_owner
        mov dx, buffer
        mov cx, 63
        call read_exact
        jc .bad
        mov bx, [row_index]
        shl bx, 2
        mov eax, [lr_node_index]
        cmp eax, [lr_candidates+bx]
        jne .unchanged
        shr bx, 2
        bt [lr_remove_mask], bx
        jc .advance
        imul dx, bx, 63
        add dx, lr_changed
        jmp .write
.unchanged:
        mov dx, buffer
.write:
        mov cx, 63
        call write_exact
        jc .bad
.advance:
        inc dword [lr_node_index]
        dec dword [nodes_left]
        jmp .node
.next_owner:
        inc word [row_index]
        jmp .owner
.done: call close_in
        call close_out
        ret
.bad:  stc
        ret

lr_body dw 0
lr_dirty_mask dw 0
lr_pending_mask dw 0
lr_remove_mask dw 0
lr_node_index dd 0
lr_fresh db 0
lr_hour db 0
lr_need db 0
lr_look db 0
lr_stop db 0
lr_level db 0
lr_spell db 0
lr_removed_current db 0
lr_mem_sum db 0
lr_mem_max db 0
lr_scroll_sum db 0
lr_scroll_max db 0
lr_candidates times 6 dd 0
lr_changed times 6*63 db 0

lr_levels db 0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,7,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,7,6,4,6,6,6,6,6,6,6,4,4,4,4,4,5,5,5,5,5,5,1,1,1,1,4,4,4,4,4,4,4,4,4,5,5,5,5,5,6,6,6,6,6,4,0,0,0,0,0,0,0

%include "cokmutation.inc"
%include "cokrequest.inc"
%include "cokcommit.inc"

good:
        call close_in
        call close_out
        jc bad
        mov ax, 4C00h
        int 21h
bad:
        call close_in
        call close_out
        mov dx, error_text
        mov ah, 9
        int 21h
        mov ax, 4C01h
        int 21h

error_text db 'Inventory could not be loaded or saved.',13,10,'$'
core_lengths dw 8274,8532,11104,11112,11112
save_path db 'SAVE\CHRDATA1.STF',0
cloud_path db 'CLOUD_~1\SAVE\CHRDATA1.STF',0
in_fh dw 0FFFFh
out_fh dw 0FFFFh
mode db 0
pending_check db 0
pending_limit db 128
check_owners db 0
had_old db 0
crc_first db 0
destination dw 0
staged dw 0
roster_len dw 0
core_len dw 0
owner_count dw 0
owner_ids times 6 db 0
seen dw 0
row_index dw 0
rows_left dw 0
file_len dd 0
scan_base dd 0
inv_left dd 0
copy_left dd 0
nodes_left dd 0
crc dd 0
crc_result dd 0
inv_header times 16 db 0
row times 8 db 0
section .bss
arg1 resb 128
arg2 resb 128
arg3 resb 128
temp_path resb 128
backup_path resb 128
; GBMR v3 (2026-09-09): core must hold the largest core any version can
; produce -- MR_LEN_V3 (13264), not the v1/v2-only MR_LEN (13224). Growing
; this by 40 bytes only shifts buffer/stack below it in .bss; nothing
; elsewhere references core by a hardcoded offset from its end.
core resb MR_LEN_V3
buffer resb 4096
stack resb 512
stacktop:
