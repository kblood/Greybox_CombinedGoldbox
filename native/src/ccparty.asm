; CCPARTY.COM -- lossless Krynn roster loader.
; Usage: CCPARTY [/G] [/M] [output.gbpr]
;        CCPARTY [/G] /C <name> <class> [output.gbpr]
;        CCPARTY /S <output.gbp>
;        CCPARTY /V <owned.gbp> <reply.gsm> (read-only Secret metric query)
;        CCPARTY /W <owned.gbp> <reply.gwn> (read-only owned Secret names)
; /S explicitly imports all six Secret SAV439 pregens plus owned STF67/SFX9
; and ITEMS2048, or loads existing GBPR3/title4 without reopening the sources.
; /G reads Death Knights of Krynn SAVE\CHRDATA*.GAM compact records.
; /Q reads The Dark Queen of Krynn SAVGAMA.QSV embedded CCH-style records,
;    falling back to loose SAVE\CHRDATA*.QCH/cloud QCH records, and emits
;    compact derived combat metadata for the transient roster. Prior native
;    rows are retained alongside imported rows; overflow rejects unchanged.
; /M opens the native Begin/Create party gate. Native-created records use
; high-bit slot IDs and are merged back from the existing GBPR on later runs.
; GBPR v2 header: "GBPR", version, count, entrySize=410, layout flags,
; stable title id, schema revision. Entries remain slot + 409-byte body.
; Each entry is original slot byte + a 409-byte body. CoK stores the complete
; 409-byte CHRDATA.SAV record; DoK stores the 216-byte CHRDATA.GAM record and
; a GBD1 derived combat tail in the padding region. Header flags bit 0 marks
; DoK compact records.
        cpu 386
        bits 16
        org 100h

CHAR_SIZE equ 409
DOK_CHAR_SIZE equ 216
ENTRY_SIZE equ 410
PARTY_CAP_MAX equ 8                    ; DQK roster cap (retail 8); CoK/DoK stay 6
GBPR_MAX_LEN equ 16+(PARTY_CAP_MAX*ENTRY_SIZE)
QSV_BUF_SIZE equ 8192
DQK_FIELDS_SIZE equ 19Eh              ; physical fields through robe +19Dh
FLAG_DOK equ 0001h
GBPR_VERSION equ 2
GBPR_ID_COK equ 1
GBPR_ID_DOK equ 2
GBPR_ID_DQK equ 3
DOK_META_OFF equ DOK_CHAR_SIZE
DOK_META_FLAGS equ DOK_META_OFF+4
DOK_META_HP equ DOK_META_OFF+6
DOK_META_AC equ DOK_META_OFF+8
DOK_META_DCOUNT equ DOK_META_OFF+10
DOK_META_DSIDES equ DOK_META_OFF+12
DOK_META_DBONUS equ DOK_META_OFF+14
DOK_META_LEVEL equ DOK_META_OFF+16
DOK_META_CLASS equ DOK_META_OFF+18
DOK_META_BASEAC equ DOK_META_OFF+19
DOK_META_THAC0 equ DOK_META_OFF+20
DOK_META_MOVE equ DOK_META_OFF+22
DOK_META_COND equ DOK_META_OFF+24
DOK_META_MAXHP equ DOK_META_OFF+26
DOK_META_XP_THRESH equ DOK_META_OFF+28
DOK_META_XP_CACHE equ 0004h

start:
        cld
        mov sp, stacktop
        mov word [ofh], 0FFFFh
        call parse_output
        cmp byte [sq_mode], 0
        jne secret_strength_main
        cmp byte [wn_mode], 0
        jne secret_who_names_main
        cmp byte [secret_mode], 0
        jne secret_party_main
        cmp byte [title_id_invalid], 0
        jne .previous_bad
        call apply_dialect
        cmp word [title_id], 0
        jne .title_id_set
        cmp byte [qsvmode], 0
        jne .infer_dqk_id
        cmp byte [dokmode], 0
        jne .infer_dok_id
        mov word [title_id], GBPR_ID_COK
        jmp .title_id_set
.infer_dok_id:
        mov word [title_id], GBPR_ID_DOK
        jmp .title_id_set
.infer_dqk_id:
        mov word [title_id], GBPR_ID_DQK
.title_id_set:
        cmp word [title_id], 0
        je .legacy_title
        cmp word [title_id], 1
        jb .previous_bad
        cmp word [title_id], GBPR_ID_DQK
        ja .previous_bad
        cmp byte [qsvmode], 0
        je .title_not_qsv
        cmp word [title_id], GBPR_ID_DQK
        jne .previous_bad
.title_not_qsv:
        cmp byte [dokmode], 0
        je .title_ready
        cmp word [title_id], GBPR_ID_DOK
        je .title_ready
        cmp word [title_id], GBPR_ID_DQK
        jne .previous_bad
.title_ready:
        mov ax, [title_id]
        cmp ax, GBPR_ID_COK
        jne .title_compact
        cmp word [party_flags], 0
        jne .previous_bad
        jmp .title_layout_ok
.title_compact:
        cmp word [party_flags], FLAG_DOK
        jne .previous_bad
.title_layout_ok:
        cmp word [title_id], GBPR_ID_DQK
        jne .cap_set
        mov byte [party_cap], PARTY_CAP_MAX
.cap_set:
        mov word [header+4], GBPR_VERSION
        mov [header+12], ax
        mov word [header+14], 1
        jmp .identity_ready
.legacy_title:
        ; No identity option retains the exact legacy v1 contract.
        mov word [header+4], 1
        mov word [header+12], 0
        mov word [header+14], 0
.identity_ready:
.load_prior:
        ; Headless DQK creation (GBBOOT /R builds /G /ID 3 /C name class):
        ; route through the title-owned DQK rules, starting from the prior
        ; native roster rather than a QSV/QCH import.
        cmp byte [createmode], 0
        je .no_hl_dqk
        cmp byte [qsvmode], 0
        jne .no_hl_dqk
        cmp word [title_id], GBPR_ID_DQK
        jne .no_hl_dqk
        mov byte [qsvmode], 1
        mov byte [dokmode], 0
        mov byte [hl_dqk], 1
.no_hl_dqk:
        call load_previous
        jc .previous_bad
        cmp byte [qsvmode], 0
        je .slot_scan
        cmp byte [hl_dqk], 0
        je .qsv_import
        call restore_native
        jc .write_fail
        jmp .qsv_loaded
.qsv_import:
        call load_dqk_qsv_party
        jc .write_fail
.qsv_loaded:
        ; Ordinary DQK launch supplies /Q /M.  QSV loading must retain the
        ; menu gate as every other roster source.  /C creates through the
        ; title-owned DQK rules in dqkcreate.inc; a full party, an unknown
        ; class or any invalid option rejects before any output is opened.
        cmp byte [createmode], 0
        je .maybe_menu
        call dqk_create
        jc .dqk_create_fail
        jmp .maybe_menu
.slot_scan:
        mov byte [slot_digit], '1'
        mov byte [slot_num], 1
.scan:
        call load_slot
        jc .next
        call valid_record
        jc .next
        call derive_dok_meta
        mov al, [slot_num]
        call append_current
        jc .write_fail
        call print_member
.next:
        inc byte [slot_digit]
        inc byte [slot_num]
        cmp byte [slot_num], 7
        jb .scan
        call restore_native
        jc .write_fail
        cmp byte [createmode], 0
        je .maybe_menu
        call create_argument
        jc .write_fail
.maybe_menu:
        cmp byte [menumode], 0
        je .finalize
        call party_menu
        jc .write_fail
.finalize:
        xor ax, ax
        mov al, [party_count]
        mov [header+6], ax
        mov ah, 3Ch
        xor cx, cx
        mov dx, outname
        int 21h
        jc .create_fail
        mov [ofh], ax
        mov dx, header
        mov cx, 16
        call write_bytes
        jc .write_fail
        mov si, partybuf
        mov al, [party_count]
        mov [entry_write_left], al
.write_entries:
        cmp byte [entry_write_left], 0
        jz .close_output
        mov dx, si
        mov cx, ENTRY_SIZE
        call write_bytes
        jc .write_fail
        add si, ENTRY_SIZE
        dec byte [entry_write_left]
        jmp .write_entries
.close_output:
        call close_output
        mov si, s_loaded
        call puts
        xor ax, ax
        mov al, [party_count]
        call put_dec
        mov si, s_members
        call puts
        mov ax, 4C00h
        int 21h
.create_fail:
        mov si, s_create_fail
        jmp .die
.previous_bad:
        mov si, s_previous_fail
        jmp .die
.dqk_create_fail:
        mov si, s_dqk_creation_unavailable
        jmp .die
.write_fail:
        call close_output
        mov si, s_write_fail
.die:
        call puts
        mov ax, 4C01h
        int 21h

parse_output:
        call sq_parse
        cmp byte [sq_mode], 0
        je .ordinary
        ret
.ordinary:
        call wn_parse
        cmp byte [wn_mode], 0
        je .ordinary_roster
        ret
.ordinary_roster:
        mov si, 81h
        mov di, outname
        movzx cx, byte [80h]
.skip:
        or cx, cx
        jz .default
        cmp byte [si], ' '
        jne .copy
        inc si
        dec cx
        jmp .skip
.copy:
        cmp byte [si], '/'
        jne .copy_name
        cmp cx, 2
        jb .copy_name
        mov al, [si+1]
        and al, 0DFh
        cmp al, 'M'
        je .menu_flag
        cmp al, 'C'
        je .create_flag
        cmp al, 'G'
        je .dok_flag
        cmp al, 'Q'
        je .qsv_flag
        cmp al, 'S'
        je .secret_flag
        cmp al, 'R'
        je .race_flag
        cmp al, 'N'
        je .con_flag
        cmp al, 'D'
        je .dice_flag
        cmp al, 'I'
        jne .not_id_flag
        cmp cx, 3
        jb .copy_name
        mov al, [si+2]
        and al, 0DFh
        cmp al, 'D'
        je .id_flag
.not_id_flag:
        jmp .copy_name
.secret_flag:
        cmp byte [secret_mode], 0
        jne .secret_invalid
        cmp cx, 2
        je .secret_set
        cmp byte [si+2], ' '
        jne .secret_invalid
.secret_set:
        mov byte [secret_mode], 1
        add si, 2
        sub cx, 2
        jmp .skip
.secret_invalid:
        mov byte [secret_mode], 1
        mov byte [title_id_invalid], 1
        add si, 2
        sub cx, 2
        jmp .skip
.id_flag:
        add si, 3
        sub cx, 3
        jmp .id_skip
.id_skip:
        or cx, cx
        jz .id_invalid
        cmp byte [si], ' '
        jne .id_digits
        inc si
        dec cx
        jmp .id_skip
.id_digits:
        cmp byte [si], '1'
        jb .id_invalid
        cmp byte [si], '3'
        ja .id_invalid
        mov al, [si]
        cmp byte [si+1], ' '
        je .id_single
        cmp byte [si+1], 0
        jne .id_invalid
.id_single:
        sub al, '0'
        xor ah, ah
        inc si
        dec cx
        mov [title_id], ax
        jmp .skip
.id_invalid:
        mov byte [title_id_invalid], 1
.id_discard:
        or cx, cx
        jz .default
        cmp byte [si], ' '
        je .skip
        inc si
        dec cx
        jmp .id_discard
.race_flag:
        add si, 2
        sub cx, 2
        call dq_parse_num
        jc .opt_bad
        mov [dq_race], al
        jmp .skip
.con_flag:
        add si, 2
        sub cx, 2
        call dq_parse_num
        jc .opt_bad
        mov [dq_con], al
        jmp .skip
.dice_flag:
        add si, 2
        sub cx, 2
.dice_space:
        or cx, cx
        jz .opt_bad
        cmp byte [si], ' '
        jne .dice_copy
        inc si
        dec cx
        jmp .dice_space
.dice_copy:
        mov bx, dicepath
.dice_loop:
        or cx, cx
        jz .dice_done
        mov al, [si]
        cmp al, ' '
        je .dice_done
        cmp bx, dicepath+63
        jae .opt_bad
        mov [bx], al
        inc bx
        inc si
        dec cx
        jmp .dice_loop
.dice_done:
        mov byte [bx], 0
        jmp .skip
.opt_bad:
        mov byte [dq_arg_bad], 1
        jmp .skip
.menu_flag:
        mov byte [menumode], 1
        add si, 2
        sub cx, 2
        jmp .skip
.dok_flag:
        mov byte [dokmode], 1
        add si, 2
        sub cx, 2
        jmp .skip
.qsv_flag:
        mov byte [qsvmode], 1
        add si, 2
        sub cx, 2
        jmp .skip
.create_flag:
        mov byte [createmode], 1
        add si, 2
        sub cx, 2
.cskip_name:
        or cx, cx
        jz .default
        cmp byte [si], ' '
        jne .cname
        inc si
        dec cx
        jmp .cskip_name
.cname:
        mov di, create_name
        xor bx, bx
.cname_loop:
        or cx, cx
        jz .default
        mov al, [si]
        cmp al, ' '
        je .cname_done
        cmp bx, 15
        jae .cname_advance
        mov [di], al
        inc di
        inc bx
.cname_advance:
        inc si
        dec cx
        jmp .cname_loop
.cname_done:
        mov byte [di], 0
        mov [create_name_len], bl
.cskip_class:
        or cx, cx
        jz .default
        cmp byte [si], ' '
        jne .cclass
        inc si
        dec cx
        jmp .cskip_class
.cclass:
        mov al, [si]
        and al, 0DFh
        mov [forced_class], al
.cclass_advance:
        or cx, cx
        jz .default
        cmp byte [si], ' '
        je .cclass_done
        inc si
        dec cx
        jmp .cclass_advance
.cclass_done:
        mov di, outname
        jmp .skip
.copy_name:
        or cx, cx
        jz .done
        mov al, [si]
        cmp al, ' '
        je .done
        cmp al, 0Dh
        je .done
        mov [di], al
        inc si
        inc di
        dec cx
        cmp di, outname+111
        jb .copy
.done:
        mov byte [di], 0
        ret
.default:
        mov si, s_default_out
.dcopy:
        lodsb
        stosb
        or al, al
        jnz .dcopy
        ret

apply_dialect:
        mov word [party_record_size], CHAR_SIZE
        mov word [party_flags], 0
        call set_ext_sav
        cmp byte [qsvmode], 0
        je .maybe_dok
        mov word [party_flags], FLAG_DOK
        jmp .done
.maybe_dok:
        cmp byte [dokmode], 0
        je .done
        mov word [party_record_size], DOK_CHAR_SIZE
        mov word [party_flags], FLAG_DOK
        call set_ext_gam
.done:
        mov ax, [party_flags]
        mov [header+10], ax
        ret

load_dqk_qsv_party:
        mov byte [qch_slot], 0
        mov si, qsv_root
        call load_dqk_qsv_file
        cmp byte [party_count], 0
        jne .ok
        mov si, qsv_save
        call load_dqk_qsv_file
        cmp byte [party_count], 0
        jne .ok
        mov si, qsv_cloud
        call load_dqk_qsv_file
        cmp byte [party_count], 0
        jne .ok
        call load_dqk_qch_party
        jc .err
.ok:
        ; Imported rows and native rows have distinct slot identities. Keep
        ; both families, or reject before opening the existing output.
        call restore_native
        jc .err
        mov byte [qch_slot], 0
        clc
        ret
.err:
        mov byte [qch_slot], 0
        stc
        ret

load_dqk_qch_party:
        mov si, qch_save
        mov di, qch_save_digit
        call load_dqk_qch_family
        jc .err
        cmp byte [party_count], 0
        jne .ok
        mov si, qch_cloud_a
        mov di, qch_cloud_a_digit
        call load_dqk_qch_family
        jc .err
        cmp byte [party_count], 0
        jne .ok
        mov si, qch_cloud_b
        mov di, qch_cloud_b_digit
        call load_dqk_qch_family
        jc .err
        cmp byte [party_count], 0
        jne .ok
        mov si, qch_cloud_c
        mov di, qch_cloud_c_digit
        call load_dqk_qch_family
        jc .err
.ok:
        clc
        ret
.err:
        stc
        ret

load_dqk_qch_family:
        push si
        push di
        mov byte [di], '1'
        mov byte [slot_num], 1
.loop:
        mov al, [party_cap]
        cmp [party_count], al
        jae .done
        push di
        call load_dqk_qch_file
        pop di
        jc .err
        inc byte [di]
        inc byte [slot_num]
        cmp byte [slot_num], 9
        jb .loop
.done:
        pop di
        pop si
        clc
        ret
.err:
        pop di
        pop si
        stc
        ret

load_dqk_qch_file:
        push si
        mov ax, 3D00h
        mov dx, si
        int 21h
        jc .done
        mov [ifh], ax
        mov bx, ax
        mov ah, 3Fh
        mov cx, QSV_BUF_SIZE
        mov dx, qsvbuf
        int 21h
        jc .close
        mov [qsv_len], ax
        mov bx, [ifh]
        mov ah, 3Eh
        int 21h
        ; The current-HP byte is at physical +198h (shifted +190h).
        ; Reject an opened short record before any projection/output write;
        ; bytes left in qsvbuf by another character are not save data.
        cmp word [qsv_len], DQK_FIELDS_SIZE
        jb .done_err
        mov si, qsvbuf+8
        call dqk_qsv_candidate
        jc .done
        mov al, [slot_num]
        mov [qch_slot], al
        call build_dqk_qsv_member
        jc .done_err
        jmp .done
.close:
        mov bx, [ifh]
        mov ah, 3Eh
        int 21h
        jmp .done_err
.done:
        pop si
        clc
        ret
.done_err:
        pop si
        stc
        ret

load_dqk_qsv_file:
        push si
        mov ax, 3D00h
        mov dx, si
        int 21h
        jc .done
        mov [ifh], ax
        mov bx, ax
        mov ah, 3Fh
        mov cx, QSV_BUF_SIZE
        mov dx, qsvbuf
        int 21h
        jc .close
        mov [qsv_len], ax
        mov bx, [ifh]
        mov ah, 3Eh
        int 21h
        cmp word [qsv_len], 1400
        jb .done
        ; DOS QSV records begin at 040Fh. The header byte at +1Fh and the
        ; duplicate word immediately before the roster have to agree before
        ; we trust either one: a content scan can otherwise mistake bytes in
        ; the global state for a plausible CCH-shaped party member.
        mov al, [qsvbuf+31]
        or al, al
        jz .done
        cmp al, [qsvbuf+40Dh]
        jne .done
        cmp byte [qsvbuf+40Eh], 0
        jne .done
        cmp al, [party_cap]
        jbe .count_ok
        mov al, [party_cap]          ; GBPR row cap (6, DQK 8)
.count_ok:
        mov [qsv_remaining], al
        mov word [qsv_scan], 1039
.scan:
        cmp byte [qsv_remaining], 0
        je .done
        mov si, qsvbuf
        add si, [qsv_scan]
        ; The QSV record begins with an eight-byte save-specific prefix; its
        ; embedded CCH-shaped payload is what the existing projection reads.
        add si, 8
        call dqk_qsv_candidate
        jc .done
        ; A QSV member is a 1A1h-byte fixed body, 17-byte inventory entries,
        ; zero or more 9-byte affect nodes, then a 6-byte null-pointer
        ; terminator. Advance over that structure before build_dqk_qsv_member
        ; changes SI; malformed tails fail closed instead of resuming a byte
        ; scan at an arbitrary interior offset.
        push si
        call dqk_qsv_advance
        pop si
        jc .done
        call build_dqk_qsv_member
        jc .done_err
        dec byte [qsv_remaining]
        jmp .scan
.close:
        mov bx, [ifh]
        mov ah, 3Eh
        int 21h
.done:
        pop si
        clc
        ret
.done_err:
        pop si
        stc
        ret

; SI is a validated DOS-QSV embedded CCH payload (+8 from the record start).
; Advance qsv_scan to the following physical QSV record using the solved
; variable tail. The mirror at CCH+0C1h (QSV +0C9h) is a structural guard
; against a wrong start or a corrupted item count. Carry means malformed or
; truncated data; callers must not fall back to a heuristic byte scan.
dqk_qsv_advance:
        push ax
        push bx
        push cx
        push dx
        push di
        mov al, [si]
        cmp al, [si+0C1h]
        jne .bad
        xor ah, ah
        mov cx, 17
        mul cx
        or dx, dx
        jnz .bad
        add ax, 1A1h
        jc .bad
        add ax, [qsv_scan]
        jc .bad
        mov bx, ax                  ; relative start of affect list
.tail:
        mov ax, bx
        add ax, 6                   ; two bytes followed by a far pointer
        jc .bad
        cmp ax, [qsv_len]
        ja .bad
        mov di, qsvbuf
        add di, bx
        cmp word [di+2], 0
        jne .node
        cmp word [di+4], 0
        jne .node
        mov [qsv_scan], ax          ; first byte after the terminator
        clc
        jmp .done
.node:
        add bx, 9
        jc .bad
        jmp .tail
.bad:
        stc
.done:
        pop di
        pop dx
        pop cx
        pop bx
        pop ax
        ret

; DQK QSV embeds CCH-style records. The shipped save has a short preface before
; the first record; scan for records whose CCHFORM combat fields are plausible
; and whose 15-byte name at +96 is printable ASCII.
dqk_qsv_candidate:
        cmp byte [si], 20
        ja .bad
        cmp byte [si+1], 0
        jne .bad
        cmp byte [si+2], 0
        jne .bad
        cmp byte [si+3], 0
        jne .bad
        cmp byte [si+94], 9
        ja .bad
        mov al, [si+127]
        cmp al, 30
        jb .bad
        cmp al, 59
        ja .bad
        mov al, [si+129]
        cmp al, 1
        jb .bad
        cmp al, 250
        ja .bad
        mov al, [si+173]
        cmp al, 1
        jb .bad
        cmp al, 10
        ja .bad
        mov al, [si+175]
        cmp al, 1
        jb .bad
        cmp al, 20
        ja .bad
        push si
        add si, 96
        call dqk_qsv_name_len
        pop si
        cmp byte [qsv_name_len], 3
        jb .bad
        clc
        ret
.bad:
        stc
        ret

dqk_qsv_name_len:
        mov byte [qsv_name_len], 0
        mov cx, 15
.loop:
        lodsb
        or al, al
        jz .done
        cmp al, ' '
        je .ok
        cmp al, 'A'
        jb .lower
        cmp al, 'Z'
        jbe .alpha
.lower:
        cmp al, 'a'
        jb .bad
        cmp al, 'z'
        ja .bad
.alpha:
        inc byte [qsv_name_len]
.ok:
        loop .loop
.done:
        clc
        ret
.bad:
        mov byte [qsv_name_len], 0
        stc
        ret

build_dqk_qsv_member:
        push si
        call clear_charbuf
        pop si
        push si
        add si, 96
        mov di, charbuf+1
        mov cx, 15
        xor bx, bx
.name_loop:
        lodsb
        or al, al
        jz .name_done
        cmp al, 'a'
        jb .name_store
        cmp al, 'z'
        ja .name_store
        sub al, 20h
.name_store:
        mov [di], al
        inc di
        inc bx
        loop .name_loop
.name_done:
        mov [charbuf], bl
        pop si
        mov byte [charbuf+DOK_META_OFF], 'G'
        mov byte [charbuf+DOK_META_OFF+1], 'B'
        mov byte [charbuf+DOK_META_OFF+2], 'D'
        mov byte [charbuf+DOK_META_OFF+3], '1'
        mov word [charbuf+DOK_META_FLAGS], 1
        ; Original DQK healing code clamps physical +198h to maximum +89h.
        ; SI points eight bytes into the physical record. Preserve zero HP.
        movzx ax, byte [si+190h]
        mov [charbuf+DOK_META_HP], ax
        mov al, 60
        sub al, [si+179]
        cbw
        mov [charbuf+DOK_META_AC], ax
        movzx ax, byte [si+173]
        mov [charbuf+DOK_META_DCOUNT], ax
        movzx ax, byte [si+175]
        mov [charbuf+DOK_META_DSIDES], ax
        mov al, [si+177]
        cbw
        mov [charbuf+DOK_META_DBONUS], ax
        mov al, 60
        sub al, [si+127]
        cbw
        mov [charbuf+DOK_META_THAC0], ax
        movzx ax, byte [si+136]
        cmp ax, 3
        jb .move_min
        xor dx, dx
        mov bx, 3
        div bx
        or ax, ax
        jnz .move_clamp
.move_min:
        mov ax, 1
.move_clamp:
        cmp ax, 4
        jbe .move_ok
        mov ax, 4
.move_ok:
        mov [charbuf+DOK_META_MOVE], ax
        movzx ax, byte [si+137]
        mov [charbuf+DOK_META_LEVEL], ax
        call derive_dqk_qsv_class
        mov [charbuf+DOK_META_CLASS], al
        mov al, [si+179]
        mov [charbuf+DOK_META_BASEAC], al
        movzx ax, byte [si+129]
        mov [charbuf+DOK_META_MAXHP], ax
        call overlay_dqk_previous_meta
        mov al, [qch_slot]
        or al, al
        jnz .append_slot
        mov al, [party_count]
        inc al
.append_slot:
        call append_current
        jc .err
        mov al, [qch_slot]
        or al, al
        jnz .print_slot
        mov al, [party_count]
.print_slot:
        mov [slot_num], al
        call print_member
        clc
        ret
.err:
        stc
        ret

; DQK's embedded QSV payloads are CCH-like, but byte +89 is zero for the
; shipped six-hero save. Derive the compact GBD1 combat class from the DQK
; item-use mask (+183), with current class-level slots as a no-mask fallback.
derive_dqk_qsv_class:
        mov al, [si+183]
        test al, 58h                    ; fighter/knight/ranger-style use flags
        jnz .fighter
        test al, 04h
        jnz .thief
        test al, 02h
        jnz .cleric
        test al, 01h
        jnz .mage
        cmp byte [si+158], 0            ; knight current level
        jne .fighter
        cmp byte [si+159], 0            ; fighter current level
        jne .fighter
        cmp byte [si+160], 0            ; paladin current level
        jne .fighter
        cmp byte [si+161], 0            ; ranger current level
        jne .fighter
        cmp byte [si+163], 0            ; thief current level
        jne .thief
        cmp byte [si+157], 0            ; cleric current level
        jne .cleric
        cmp byte [si+162], 0            ; mage current level
        jne .mage
        xor al, al
        ret
.fighter:
        mov al, 1
        ret
.cleric:
        mov al, 2
        ret
.mage:
        mov al, 3
        ret
.thief:
        mov al, 4
        ret

overlay_dqk_previous_meta:
        cmp byte [qsvmode], 0
        je .ret
        cmp byte [prev_count], 0
        je .ret
        mov al, [qch_slot]
        or al, al
        jnz .have_slot
        mov al, [party_count]
        inc al
.have_slot:
        mov [prev_slot_match], al
        xor bx, bx
.loop:
        cmp bl, [prev_count]
        jae .ret
        mov ax, bx
        imul ax, ax, ENTRY_SIZE
        add ax, prevbuf+16
        mov si, ax
        mov al, [si]
        cmp al, [prev_slot_match]
        jne .next
        cmp word [si+1+DOK_META_OFF], 'GB'
        jne .next
        cmp word [si+1+DOK_META_OFF+2], 'D1'
        jne .next
        test word [si+1+DOK_META_FLAGS], 2
        jz .next
        mov ax, [si+1+DOK_META_FLAGS]
        or [charbuf+DOK_META_FLAGS], ax
        mov ax, [si+1+DOK_META_HP]
        mov [charbuf+DOK_META_HP], ax
        mov ax, [si+1+DOK_META_COND]
        mov [charbuf+DOK_META_COND], ax
        mov ax, [si+1+DOK_META_MAXHP]
        or ax, ax
        jz .ret
        mov [charbuf+DOK_META_MAXHP], ax
        ret
.next:
        inc bx
        jmp .loop
.ret:
        ret

set_ext_sav:
        mov byte [saveext+1], 'S'
        mov byte [saveext+2], 'A'
        mov byte [saveext+3], 'V'
        ret

set_ext_gam:
        mov byte [saveext+1], 'G'
        mov byte [saveext+2], 'A'
        mov byte [saveext+3], 'M'
        ret

set_ext_jnk:
        mov byte [saveext+1], 'J'
        mov byte [saveext+2], 'N'
        mov byte [saveext+3], 'K'
        ret

set_ext_wiz:
        mov byte [saveext+1], 'W'
        mov byte [saveext+2], 'I'
        mov byte [saveext+3], 'Z'
        ret

; Preserve an existing GBPR before truncating it. A missing output is normal;
; an opened output must be an exact complete GBPR, otherwise fail before any
; source slot or native record can replace its bytes.
load_previous:
        mov byte [prev_count], 0
        mov ax, 3D00h
        mov dx, outname
        int 21h
        jc .open_fail
        mov [ifh], ax
        mov bx, ax
        mov ah, 3Fh
        mov cx, GBPR_MAX_LEN
        mov dx, prevbuf
        int 21h
        jc .close_bad
        mov [prev_read_len], ax
        mov bx, [ifh]
        mov ah, 3Fh
        mov cx, 1
        mov dx, extra
        int 21h
        jc .close_bad
        mov [prev_extra_len], al
        mov bx, [ifh]
        mov ah, 3Eh
        int 21h
        jc .bad
        cmp word [prev_read_len], 16
        jb .bad
        cmp word [prevbuf], 'GB'
        jne .bad
        cmp word [prevbuf+2], 'PR'
        jne .bad
        cmp word [prevbuf+4], 1
        je .legacy_header
        cmp word [prevbuf+4], GBPR_VERSION
        jne .bad
        cmp word [title_id], 0
        je .bad
        mov ax, [title_id]
        cmp [prevbuf+12], ax
        jne .bad
        cmp word [prevbuf+14], 1
        jne .bad
        jmp .roster_header_ok
.legacy_header:
        cmp word [prevbuf+12], 0
        jne .bad
        cmp word [prevbuf+14], 0
        jne .bad
.roster_header_ok:
        cmp word [prevbuf+8], ENTRY_SIZE
        jne .bad
        mov ax, [party_flags]
        cmp [prevbuf+10], ax
        jne .bad
        mov ax, [prevbuf+6]
        cmp al, [party_cap]
        ja .bad
        cmp ah, 0
        jne .bad
        mov [prev_count], al
        imul ax, ax, ENTRY_SIZE
        add ax, 16
        cmp ax, [prev_read_len]
        jne .bad
        cmp byte [prev_extra_len], 0
        jne .bad
        ; Every stored slot has a bounded source/native ID. Duplicate source
        ; and native IDs would make later save reconciliation ambiguous.
        mov word [seen_source_slots], 0
        mov word [seen_native_slots], 0
        movzx cx, byte [prev_count]
        mov si, prevbuf+16
.slot_check:
        jcxz .slots_checked
        mov al, [si]
        test al, 80h
        jnz .native_slot_check
        cmp al, 1
        jb .bad
        cmp al, 8
        ja .bad
        movzx ax, al
        dec ax
        bt word [seen_source_slots], ax
        jc .bad
        bts word [seen_source_slots], ax
        jmp short .slot_next
.native_slot_check:
        ; append_created stores zero-based ordinals 0..cap-1 as 80h..; CCHOST /N
        ; adds DQK NPC rows at 86h/87h.
        and al, 7fh
        mov ah, [party_cap]
        dec ah
        cmp al, ah
        ja .bad
        movzx ax, al
        bt word [seen_native_slots], ax
        jc .bad
        bts word [seen_native_slots], ax
.slot_next:
        add si, ENTRY_SIZE
        dec cx
        jmp .slot_check
.slots_checked:
        ; A v1 roster has no title identity. Never merge its per-slot
        ; native records or title-specific metadata into this v2 output.
        cmp word [prevbuf+4], GBPR_VERSION
        je .identified_previous
        ; DQK's QSV records carry current HP/condition in the compact tail,
        ; so even a source-backed v1 row cannot be safely reconstructed.
        cmp byte [qsvmode], 0
        jne .legacy_nonempty_check
        ; Legacy high-bit rows are native-created characters with no retail
        ; source. Refuse before CCPARTY opens/truncates output rather than
        ; silently dropping them during migration.
        movzx cx, byte [prev_count]
        mov si, prevbuf+16
.legacy_scan:
        jcxz .legacy_safe
        test byte [si], 80h
        jnz .bad
        add si, ENTRY_SIZE
        dec cx
        jmp .legacy_scan
.legacy_nonempty_check:
        cmp byte [prev_count], 0
        jne .bad
.legacy_safe:
        mov byte [prev_count], 0
.identified_previous:
        clc
        ret
.open_fail:
        cmp ax, 2                  ; file not found
        je .missing
        cmp ax, 3                  ; path not found
        jne .bad
.missing:
        clc
        ret
.close_bad:
        mov bx, [ifh]
        mov ah, 3Eh
        int 21h
.bad:
        stc
        ret

restore_native:
        xor bx, bx
.loop:
        cmp bl, [prev_count]
        jae .ok
        mov ax, bx
        imul ax, ax, ENTRY_SIZE
        add ax, prevbuf+16
        mov si, ax
        mov al, [si]
        test al, 80h
        jz .next
        ; Never silently discard a stored native member when imports fill
        ; the party. All reconciliation happens before output truncation.
        mov al, [party_cap]
        cmp [party_count], al
        jae .err
        push bx
        push si
        inc si
        mov di, charbuf
        mov cx, CHAR_SIZE
        rep movsb
        call valid_record
        pop si
        jc .restore_bad
        mov al, [si]
        call append_current
        pop bx
        jc .err
        mov al, [si]
        mov [slot_num], al
        call print_member
        jmp .next_after
.restore_bad:
        pop bx
        stc
        ret
.next_after:
.next:
        inc bx
        jmp .loop
.ok:
        clc
        ret
.err:
        stc
        ret

append_current:
        mov [entry_slot], al
        movzx ax, byte [party_count]
        imul ax, ax, ENTRY_SIZE
        mov di, partybuf
        add di, ax
        mov al, [entry_slot]
        stosb
        mov si, charbuf
        mov cx, CHAR_SIZE
        rep movsb
        inc byte [party_count]
.ok:
        clc
.ret:
        ret

load_slot:
        call clear_charbuf
        mov ax, 3D00h
        mov dx, savepath
        int 21h
        jc .bad
        mov [ifh], ax
        mov bx, ax
        mov ah, 3Fh
        mov cx, [party_record_size]
        mov dx, charbuf
        int 21h
        jc .close_bad
        cmp ax, [party_record_size]
        jne .close_bad
        mov bx, [ifh]
        mov ah, 3Fh
        mov cx, 1
        mov dx, extra
        int 21h
        jc .close_bad
        or ax, ax
        jnz .close_bad
        mov bx, [ifh]
        mov ah, 3Eh
        int 21h
        clc
        ret
.close_bad:
        mov bx, [ifh]
        mov ah, 3Eh
        int 21h
.bad:
        stc
        ret

clear_charbuf:
        push ax
        push cx
        push di
        mov di, charbuf
        xor ax, ax
        mov cx, CHAR_SIZE
        rep stosb
        pop di
        pop cx
        pop ax
        ret

valid_record:
        mov al, [charbuf]
        cmp al, 1
        jb .bad
        cmp al, 15
        ja .bad
        xor ch, ch
        mov cl, al
        mov si, charbuf+1
.chars:
        lodsb
        cmp al, 20h
        jb .bad
        cmp al, 7Eh
        ja .bad
        loop .chars
        clc
        ret
.bad:
        stc
        ret

; DoK GBPR keeps the original 216-byte .GAM body intact and stores native
; combat fields in the zero-padded tail. DoK combat reads current HP at byte
; 214 and maximum HP at byte 40; class, level and effective equipment stats
; still use the provisional native derivations.
derive_dok_meta:
        cmp byte [dokmode], 0
        jne .run
        ret
.run:
        call infer_dok_class
        call infer_dok_level
        movzx ax, byte [charbuf+214]
        mov [meta_hp], ax
        call init_dok_damage
        call derive_dok_ac
        call apply_dok_str_damage
        call write_dok_meta
        ; /Q DQK records share GBD1 combat metadata but not DoK's raw class
        ; slots or retail XP table. Never advertise the DoK cache capability
        ; on that distinct compact format.
        cmp byte [qsvmode], 0
        jne .done
        call write_dok_award_cache
.done:
        ret

infer_dok_class:
        mov al, [charbuf+32]
        cmp al, 6
        je .noncaster
        call vote_dok_wiz_class
        cmp al, 2
        je .cleric
        cmp al, 3
        je .mage
        mov al, [charbuf+20]            ; caster fallback: WIS >= INT => cleric, else mage
        cmp al, [charbuf+18]
        jae .cleric
        jmp .mage
.noncaster:
        mov al, [charbuf+16]
        cmp al, [charbuf+22]
        jae .fighter
        jmp .thief
.fighter:
        mov byte [meta_class], 1
        ret
.cleric:
        mov byte [meta_class], 2
        ret
.mage:
        mov byte [meta_class], 3
        ret
.thief:
        mov byte [meta_class], 4
        ret

vote_dok_wiz_class:
        call read_dok_wiz_votes
        jnc .scan
        xor al, al
        ret
.scan:
        mov byte [wiz_cleric], 0
        mov byte [wiz_mage], 0
        xor bx, bx
.next_id:
        mov al, [jnkbuf+bx]
        and al, 7Fh
        jz .advance
        cmp al, 126
        ja .advance
        xor di, di
.seen_loop:
        cmp di, bx
        jae .unique
        mov dl, [jnkbuf+di]
        and dl, 7Fh
        cmp dl, al
        je .advance
        inc di
        jmp .seen_loop
.unique:
        xor ah, ah
        mov si, dok_spell_class-1
        add si, ax
        mov al, [si]
        cmp al, 1
        je .cleric_vote
        cmp al, 2
        je .mage_vote
        jmp .advance
.cleric_vote:
        inc byte [wiz_cleric]
        jmp .advance
.mage_vote:
        inc byte [wiz_mage]
.advance:
        inc bx
        cmp bx, 74
        jb .next_id
        mov al, [wiz_cleric]
        cmp al, [wiz_mage]
        ja .vote_cleric
        jb .vote_mage
        xor al, al
        ret
.vote_cleric:
        mov al, 2
        ret
.vote_mage:
        mov al, 3
        ret

read_dok_wiz_votes:
        call set_ext_wiz
        mov ax, 3D00h
        mov dx, savepath
        int 21h
        jc .bad_restore
        mov [jnkfh], ax
        mov bx, ax
        mov ah, 3Fh
        mov cx, 74
        mov dx, jnkbuf
        int 21h
        jc .close_bad
        cmp ax, 74
        jne .close_bad
        mov bx, [jnkfh]
        mov ah, 3Eh
        int 21h
        call set_ext_gam
        clc
        ret
.close_bad:
        mov bx, [jnkfh]
        mov ah, 3Eh
        int 21h
.bad_restore:
        call set_ext_gam
        stc
        ret

infer_dok_level:
        mov al, 60
        sub al, [charbuf+31]
        mov [meta_thac0], al
        mov si, dok_thac0_fighter
        cmp byte [meta_class], 1
        je .table_ok
        mov si, dok_thac0_cleric
        cmp byte [meta_class], 2
        je .table_ok
        mov si, dok_thac0_mage
        cmp byte [meta_class], 3
        je .table_ok
        mov si, dok_thac0_thief
.table_ok:
        mov byte [meta_level], 1
        mov byte [meta_best_diff], 7Fh
        mov bl, 1
        mov cx, 12
.loop:
        mov al, [si]
        sub al, [meta_thac0]
        jns .diff_ok
        neg al
.diff_ok:
        cmp al, [meta_best_diff]
        jae .next
        mov [meta_best_diff], al
        mov [meta_level], bl
.next:
        inc si
        inc bl
        loop .loop
        ret

derive_dok_hp:
        mov ax, 6
        cmp byte [meta_class], 1
        je .gain_ok
        mov ax, 5
        cmp byte [meta_class], 2
        je .gain_ok
        mov ax, 3
        cmp byte [meta_class], 3
        je .gain_ok
        mov ax, 4
.gain_ok:
        mov [meta_hp_per_level], ax
        movzx bx, byte [charbuf+24]      ; CON
        cmp bx, 3
        jae .con_min_ok
        mov bx, 3
.con_min_ok:
        cmp bx, 19
        jbe .con_max_ok
        mov bx, 19
.con_max_ok:
        sub bx, 3
        cmp byte [meta_class], 1
        je .warrior
        mov al, [dok_con_nonwarrior+bx]
        jmp .bonus
.warrior:
        mov al, [dok_con_warrior+bx]
.bonus:
        cbw
        add [meta_hp_per_level], ax
        movzx ax, byte [meta_level]
        mul word [meta_hp_per_level]
        mov [meta_hp], ax
        ret

derive_dok_ac:
        mov al, 60
        sub al, [charbuf+95]
        cbw
        mov [meta_base_ac], ax
        mov word [meta_move], 4
        call apply_dok_jnk_equipment
        movzx bx, byte [charbuf+22]      ; DEX
        cmp bx, 3
        jae .dex_min_ok
        mov bx, 3
.dex_min_ok:
        cmp bx, 19
        jbe .dex_max_ok
        mov bx, 19
.dex_max_ok:
        sub bx, 3
        mov al, [dok_dex_ac+bx]
        cbw
        add ax, [meta_base_ac]
        mov [meta_ac], ax
        ret

init_dok_damage:
        mov byte [meta_weapon], 0
        mov word [meta_hitbonus], 0
        movzx ax, byte [charbuf+89]
        or ax, ax
        jnz .dcount_ok
        mov ax, 1
.dcount_ok:
        mov [meta_dcount], ax
        movzx ax, byte [charbuf+91]
        or ax, ax
        jnz .dsides_ok
        mov ax, 2
.dsides_ok:
        mov [meta_dsides], ax
        mov al, [charbuf+90]
        cbw
        mov [meta_dbonus], ax
        ret

apply_dok_str_damage:
        cmp byte [meta_weapon], 0
        jne .run
        ret
.run:
        movzx bx, byte [charbuf+16]      ; STR
        cmp bx, 3
        jae .str_min_ok
        mov bx, 3
.str_min_ok:
        cmp bx, 19
        jbe .str_max_ok
        mov bx, 19
.str_max_ok:
        sub bx, 3
        mov al, [dok_str_damage+bx]
        cbw
        add [meta_dbonus], ax
        mov al, [dok_str_hit+bx]
        cbw
        add [meta_hitbonus], ax
        ret

apply_dok_jnk_equipment:
        call set_ext_jnk
        mov ax, 3D00h
        mov dx, savepath
        int 21h
        jc .restore
        mov [jnkfh], ax
.read:
        mov bx, [jnkfh]
        mov ah, 3Fh
        mov cx, 63
        mov dx, jnkbuf
        int 21h
        jc .close
        cmp ax, 63
        jne .close
        cmp byte [jnkbuf+34h], 0
        je .read
        mov al, [jnkbuf+2Eh]
        cmp al, 18                    ; DQK ITEMS.DAT type 18: Long Sword, 1d8 vs S/M
        je .long_sword
        cmp al, 67                    ; DQK ITEMS.DAT type 67: Hoopak, 1d6+2 vs S/M
        je .hoopak
        cmp al, 36                    ; DoK Plate Mail -> base item Plate Mail, AC 3
        je .plate
        cmp al, 32                    ; DoK Ring Mail -> base item Ring Mail, AC 7
        je .ring
        cmp al, 37                    ; DoK Shield -> -1 AC when readied
        je .shield
        jmp .read
.plate:
        cmp word [meta_base_ac], 3
        jle .plate_move
        mov word [meta_base_ac], 3
.plate_move:
        cmp word [meta_move], 2
        jle .read
        mov word [meta_move], 2
        jmp .read
.ring:
        cmp word [meta_base_ac], 7
        jle .ring_move
        mov word [meta_base_ac], 7
.ring_move:
        cmp word [meta_move], 3
        jle .read
        mov word [meta_move], 3
        jmp .read
.shield:
        dec word [meta_base_ac]
        jmp .read
.long_sword:
        mov byte [meta_weapon], 1
        mov al, [jnkbuf+32h]
        cbw
        mov [meta_hitbonus], ax
        mov word [meta_dcount], 1
        mov word [meta_dsides], 8
        mov [meta_dbonus], ax
        jmp .read
.hoopak:
        mov byte [meta_weapon], 1
        mov al, [jnkbuf+32h]
        cbw
        mov [meta_hitbonus], ax
        mov word [meta_dcount], 1
        mov word [meta_dsides], 6
        add ax, 2
        mov [meta_dbonus], ax
        jmp .read
.close:
        mov bx, [jnkfh]
        mov ah, 3Eh
        int 21h
.restore:
        call set_ext_gam
        ret

write_dok_meta:
        mov byte [charbuf+DOK_META_OFF], 'G'
        mov byte [charbuf+DOK_META_OFF+1], 'B'
        mov byte [charbuf+DOK_META_OFF+2], 'D'
        mov byte [charbuf+DOK_META_OFF+3], '1'
        mov word [charbuf+DOK_META_FLAGS], 1
        mov ax, [meta_hp]
        mov [charbuf+DOK_META_HP], ax
        movzx ax, byte [charbuf+40]
        mov [charbuf+DOK_META_MAXHP], ax
        mov ax, [meta_ac]
        mov [charbuf+DOK_META_AC], ax
        mov ax, [meta_dcount]
        mov [charbuf+DOK_META_DCOUNT], ax
        mov ax, [meta_dsides]
        mov [charbuf+DOK_META_DSIDES], ax
        mov ax, [meta_dbonus]
        mov [charbuf+DOK_META_DBONUS], ax
        movzx ax, byte [meta_level]
        mov [charbuf+DOK_META_LEVEL], ax
        mov al, [meta_class]
        mov [charbuf+DOK_META_CLASS], al
        mov ax, [meta_base_ac]
        mov [charbuf+DOK_META_BASEAC], al
        movzx ax, byte [meta_thac0]
        sub ax, [meta_hitbonus]
        cmp ax, 1
        jge .thac0_min_ok
        mov ax, 1
.thac0_min_ok:
        mov [charbuf+DOK_META_THAC0], ax
        mov ax, [meta_move]
        mov [charbuf+DOK_META_MOVE], ax
        ret

; Cache the next-level threshold for each DoK class slot in unused GBD1
; padding. CCECL can then apply retail AWARD_XP without carrying START.EXE's
; 2,244-byte matrix in its nearly-full COM image. A cache flag is set only for
; records whose active slots have a defined retail category mapping.
write_dok_award_cache:
        push ax
        push bx
        push cx
        push dx
        push si
        push di
        push es
        push ds
        pop es
        xor dx, dx                    ; DH: at least one usable threshold cached
        mov di, charbuf+DOK_META_XP_THRESH
        xor eax, eax
        mov cx, 8
        rep stosd
        xor si, si
.slot:
        mov al, [charbuf+45h+si]
        or al, al
        jz .next
        cmp al, 18
        jae .next
        mov bl, [charbuf+32]
        cmp bl, 6
        ja .invalid
        xor bh, bh
        shl bx, 3
        add bx, dok_award_limits
        add bx, si
        mov dl, [bx]
        cmp dl, al
        jbe .next
        call dok_award_category
        jc .invalid
        movzx bx, al
        mov ax, bx
        shl bx, 6
        shl ax, 3
        add bx, ax                    ; category * 72 (18 dwords)
        movzx ax, byte [charbuf+45h+si]
        inc ax
        shl ax, 2
        add bx, ax
        mov eax, [dok_award_thresholds+bx]
        test eax, eax
        jz .next
        mov bx, si
        shl bx, 2
        mov [charbuf+DOK_META_XP_THRESH+bx], eax
        mov dh, 1
.next:
        inc si
        cmp si, 8
        jb .slot
        or dh, dh
        jz .done
        or word [charbuf+DOK_META_FLAGS], DOK_META_XP_CACHE
        jmp .done
.invalid:
        and word [charbuf+DOK_META_FLAGS], 0fffBh
.done:
        pop es
        pop di
        pop si
        pop dx
        pop cx
        pop bx
        pop ax
        ret

; AL = GAME.OVR:359c3 category for class slot SI; carry marks an impossible
; positive slot instead of manufacturing a category.
dok_award_category:
        cmp si, 0
        jne .not_zero
        mov al, [charbuf+35]
        cmp al, 4
        mov al, 0
        jbe .ok
        inc al
        clc
        ret
.not_zero:
        cmp si, 7
        jne .not_seven
        mov al, [charbuf+34]
        cmp al, 1
        je .three
        cmp al, 2
        je .four
        cmp al, 3
        je .five
        stc
        ret
.three: mov al, 3
        jmp .ok
.four:  mov al, 4
        jmp .ok
.five:  mov al, 5
        jmp .ok
.not_seven:
        cmp si, 2
        je .two
        cmp si, 4
        je .six
        cmp si, 5
        je .five_slot
        cmp si, 6
        je .nine
        cmp si, 3
        je .ten
        stc
        ret
.two:   mov al, 2
        jmp .ok
.six:   mov al, 6
        jmp .ok
.five_slot:
        mov al, [charbuf+36]
        cmp al, 1
        mov al, 8
        jne .ok
        mov al, 7
        jmp .ok
.nine:  mov al, 9
        jmp .ok
.ten:   mov al, 10
.ok:    clc
        ret

party_menu:
.show:
        mov si, s_menu
        call puts
        call read_choice
        jc .err
        cmp al, 'B'
        je .begin
        cmp al, 'C'
        jne .show
        cmp byte [qsvmode], 0
        jne .dqk_create
        cmp byte [party_count], 6
        jae .full
        call create_character
        jnc .append
        cmp byte [input_failed], 0
        jne .err
        jmp .show
.append:
        call append_created
        jc .err
        jmp .show
.dqk_create:
        cmp byte [party_count], 6
        jae .full
        call dq_menu_create
        jnc .show
        jmp .err
.full:
        mov si, s_full
        call puts
        jmp .show
.begin:
        cmp byte [party_count], 0
        jne .ok
        mov si, s_need_member
        call puts
        jmp .show
.ok:
        clc
        ret
.err:
        stc
        ret

create_argument:
        cmp byte [party_count], 6
        jae .err
        mov al, [create_name_len]
        cmp al, 1
        jb .err
        mov [name_input+1], al
        xor ch, ch
        mov cl, al
        mov si, create_name
        mov di, name_input+2
        rep movsb
        call create_character
        jc .err
        call append_created
        ret
.err:
        stc
        ret

append_created:
        cmp byte [dokmode], 0
        je .metadata
        ; New characters have no retail HP to import. Retain their creation
        ; formula, then store its result in the two known .GAM HP positions.
        call infer_dok_class
        call infer_dok_level
        call derive_dok_hp
        mov ax, [meta_hp]
        mov [charbuf+40], al
        mov [charbuf+214], al
.metadata:
        call derive_dok_meta
        ; Source membership can shrink between launches. A row count is not
        ; an unused native ID: retain existing IDs and find the first gap.
        mov al, 80h
.next_native_slot:
        mov si, partybuf
        movzx cx, byte [party_count]
.scan_native_slot:
        jcxz .native_slot_available
        cmp [si], al
        je .native_slot_used
        add si, ENTRY_SIZE
        loop .scan_native_slot
.native_slot_available:
        call append_current
        jc .ret
        mov al, [party_count]
        mov [slot_num], al
        call print_member
.ret:
        ret
.native_slot_used:
        inc al
        cmp al, 86h
        jb .next_native_slot
        stc
        ret

create_character:
        mov di, charbuf
        xor ax, ax
        mov cx, CHAR_SIZE
        rep stosb
        mov si, s_name_prompt
        cmp byte [createmode], 0
        jne .have_name
        call puts
        mov byte [name_input], 16       ; 15 name bytes plus terminating CR
        mov byte [name_input+1], 0
        mov dx, name_input
        call read_input_line
        jc .input_error
.have_name:
        mov al, [name_input+1]
        cmp al, 1
        jb .bad
        cmp al, 15
        ja .bad
        mov [charbuf], al
        xor ch, ch
        mov cl, al
        mov si, name_input+2
        mov di, charbuf+1
.name_copy:
        lodsb
        cmp al, 20h
        jb .bad
        cmp al, 7Eh
        ja .bad
        stosb
        loop .name_copy

        cmp byte [dokmode], 0
        jne .dok_baseline

        ; CoK's retail 409-byte CCH layout stores race at +90 and class at
        ; +91.  START.EXE's unpacked menu tables make Human=6; the selected
        ; class arm below supplies the zero-based class enum value.  Keeping
        ; those fields separate matters to cokstats.inc, which already reads
        ; +90 as race for racial combat modifiers.
        mov di, charbuf+16
        mov cx, 6
.abilities:
        mov word [di], 1010h
        add di, 2
        loop .abilities
        mov byte [charbuf+89], 40       ; THAC0 20
        mov byte [charbuf+98], 8
        mov byte [charbuf+208], 14
        mov byte [charbuf+209], 14
        mov byte [charbuf+210], 14
        mov byte [charbuf+211], 14
        mov byte [charbuf+212], 14
        mov byte [charbuf+275], 50      ; AC 10
        mov byte [charbuf+90], 6         ; Human (retail START.EXE race enum)
        ; The camp spell menu rejects records whose active byte is clear.  All
        ; held CoK CCH records carry one here, and GBBOOT reads it directly.
        mov byte [charbuf+393], 1
        jmp .class_prompt

.dok_baseline:
        mov di, charbuf+16
        mov cx, 6
.dok_abilities:
        mov word [di], 1010h
        add di, 2
        loop .dok_abilities
        mov byte [charbuf+31], 40       ; THAC0 20 stored as 60 - value
        mov byte [charbuf+32], 6        ; class-like byte, non-caster default
        mov byte [charbuf+41], 1        ; PC icon size: 1x1
        mov byte [charbuf+62], 0        ; PCs do not rout
        mov byte [charbuf+89], 1        ; unarmed 1d2 baseline
        mov byte [charbuf+90], 0
        mov byte [charbuf+91], 2
        mov byte [charbuf+95], 50       ; AC 10 stored as 60 - value

.class_prompt:
        mov al, [forced_class]
        or al, al
        jnz .have_class
        mov si, s_class_prompt
        call puts
        call read_choice
        jc .input_error
.have_class:
        cmp al, 'C'
        je .cleric
        cmp al, 'F'
        je .fighter
        cmp al, 'R'
        je .ranger
        cmp al, 'K'
        je .knight
        cmp al, 'M'
        je .mage
        cmp al, 'T'
        je .thief
        jmp .class_prompt
.cleric:
        cmp byte [dokmode], 0
        jne .dok_cleric
        mov byte [charbuf+91], 0         ; Cleric (retail START.EXE class enum)
        mov byte [charbuf+249], 1        ; level slot 0: Cleric
        mov word [charbuf+20], 1212h    ; WIS 18
        mov byte [charbuf+98], 8
        mov byte [charbuf+275], 54      ; AC 6
        ; GAME.OVR F7:25/2A capacity initialization, evaluated at level 1
        ; and Wisdom 18: three first-level divine slots, with this build's
        ; five level-one divine spells placed in the grimoire.
        mov byte [charbuf+284], 3
        mov byte [charbuf+99], 1         ; spell 1
        mov byte [charbuf+101], 1        ; spell 3
        mov byte [charbuf+103], 1        ; spell 5
        mov byte [charbuf+104], 1        ; spell 6
        mov byte [charbuf+106], 1        ; spell 8
        jmp .good
.mage:
        cmp byte [dokmode], 0
        jne .dok_mage
        mov byte [charbuf+91], 5         ; Mage
        mov byte [charbuf+254], 1        ; level slot 5: Mage
        mov word [charbuf+18], 1212h    ; INT 18
        mov byte [charbuf+98], 4
        ; F7:25's mage arm grants one level-one capacity.  Retail START.EXE
        ; creation then saves its automatic starting grimoire without showing
        ; a spellbook-selection prompt: spells 11, 12, 15, 18, and 21.
        mov byte [charbuf+299], 1
        mov byte [charbuf+109], 1        ; spell 11
        mov byte [charbuf+110], 1        ; spell 12
        mov byte [charbuf+113], 1        ; spell 15
        mov byte [charbuf+116], 1        ; spell 18
        mov byte [charbuf+119], 1        ; spell 21
        jmp .good
.fighter:
        cmp byte [dokmode], 0
        jne .dok_fighter
        mov byte [charbuf+91], 2         ; Fighter
        mov byte [charbuf+251], 1        ; level slot 2: Fighter
        mov word [charbuf+16], 1212h    ; STR 18
        mov byte [charbuf+89], 42       ; THAC0 18
        mov byte [charbuf+98], 10
        mov byte [charbuf+275], 54
        jmp .good
.ranger:
        cmp byte [dokmode], 0
        jne .dok_ranger
        mov byte [charbuf+91], 4         ; Ranger
        mov byte [charbuf+253], 1        ; level slot 4: Ranger
        mov word [charbuf+16], 1212h
        mov word [charbuf+18], 0D0Dh
        mov word [charbuf+20], 0E0Eh
        mov word [charbuf+24], 0E0Eh
        mov byte [charbuf+89], 42
        mov byte [charbuf+98], 10
        mov byte [charbuf+275], 54
        jmp .good
.thief:
        cmp byte [dokmode], 0
        jne .dok_thief
        mov byte [charbuf+91], 6         ; Thief
        mov byte [charbuf+255], 1        ; level slot 6: Thief
        mov word [charbuf+22], 1212h    ; DEX 18
        mov byte [charbuf+98], 6
        mov byte [charbuf+275], 52      ; AC 8
        jmp .good
.knight:
        cmp byte [dokmode], 0
        jne .dok_knight
        mov byte [charbuf+91], 7         ; Knight
        mov byte [charbuf+256], 1        ; level slot 7: Knight
        mov word [charbuf+16], 1212h
        mov word [charbuf+20], 0D0Dh
        mov byte [charbuf+89], 42
        mov byte [charbuf+98], 12
        mov byte [charbuf+275], 54
        jmp .good
.dok_cleric:
        mov byte [charbuf+32], 1
        mov word [charbuf+20], 1212h
        mov byte [charbuf+31], 42       ; THAC0 18
        mov byte [charbuf+95], 54       ; AC 6
        jmp .good
.dok_mage:
        mov byte [charbuf+32], 2
        mov word [charbuf+18], 1212h
        jmp .good
.dok_fighter:
        mov byte [charbuf+32], 6
        mov word [charbuf+16], 1212h
        mov byte [charbuf+31], 42
        mov byte [charbuf+95], 54
        jmp .good
.dok_ranger:
        mov byte [charbuf+32], 6
        mov word [charbuf+16], 1212h
        mov word [charbuf+18], 0D0Dh
        mov word [charbuf+20], 0E0Eh
        mov word [charbuf+24], 0E0Eh
        mov byte [charbuf+31], 42
        mov byte [charbuf+95], 54
        jmp .good
.dok_thief:
        mov byte [charbuf+32], 6
        mov word [charbuf+22], 1212h
        mov byte [charbuf+95], 52
        jmp .good
.dok_knight:
        mov byte [charbuf+32], 6
        mov word [charbuf+16], 1212h
        mov word [charbuf+20], 0D0Dh
        mov byte [charbuf+31], 42
        mov byte [charbuf+95], 54
.good:
        cmp byte [dokmode], 0
        jne .good_done
        ; A newly created CoK member starts at full health. Maximum is +62h;
        ; current is +197h, as read by the retail damage and morale routines.
        mov al, [charbuf+98]
        mov [charbuf+407], al
.good_done:
        clc
        ret
.bad:
        mov si, s_bad_name
        call puts
.input_error:
        stc
        ret

; Read one redirected/console line and fold its first ASCII character.
read_choice:
.again:
        mov byte [choice_input], 2      ; one choice byte plus terminating CR
        mov byte [choice_input+1], 0
        mov dx, choice_input
        call read_input_line
        jc .err
        cmp byte [choice_input+1], 1
        jne .again
        mov al, [choice_input+2]
        and al, 0DFh
.err:
        ret

; DX -> DOS-style capacity/count/data buffer. Console input retains DOS line
; editing. Redirected files are read through CR, accepting CRLF and draining
; overlong lines; count=capacity marks overflow without writing past the buffer.
; EOF or a read error returns CF so callers cannot spin after input runs out.
read_input_line:
        push bx
        push cx
        push dx
        push si
        push di
        push bp
        mov si, dx
        mov byte [input_failed], 0
        mov ax, 4400h
        xor bx, bx
        int 21h
        jc .err
        test dx, 80h
        jz .file
        mov dx, si
        mov ah, 0Ah
        int 21h
        clc
        jmp .done
.file:
        xor di, di
        movzx bp, byte [si]
        dec bp
        mov byte [input_overflow], 0
.next:
        xor bx, bx
        mov cx, 1
        mov dx, input_byte
        mov ah, 3Fh
        int 21h
        jc .err
        cmp ax, 1
        jne .err
        mov al, [input_byte]
        cmp byte [input_skip_lf], 0
        je .character
        mov byte [input_skip_lf], 0
        cmp al, 10
        je .next
.character:
        cmp al, 13
        je .eol
        cmp di, bp
        jae .overflow
        mov bx, si
        mov [bx+di+2], al
        inc di
        jmp .next
.overflow:
        mov byte [input_overflow], 1
        jmp .next
.eol:
        mov byte [input_skip_lf], 1
        mov bx, si
        mov [bx+di+2], al
        mov ax, di
        cmp byte [input_overflow], 0
        je .count
        inc ax
.count:
        mov [si+1], al
        clc
        jmp .done
.err:
        mov byte [input_failed], 1
        stc
.done:
        pop bp
        pop di
        pop si
        pop dx
        pop cx
        pop bx
        ret

write_bytes:
        mov bx, [ofh]
        mov ah, 40h
        int 21h
        jc .ret
        cmp ax, cx
        jne .short
        clc
        ret
.short:
        stc
.ret:
        ret

close_output:
        cmp word [ofh], 0FFFFh
        je .ret
        mov bx, [ofh]
        mov ah, 3Eh
        int 21h
        mov word [ofh], 0FFFFh
.ret:
        ret

print_member:
        push bx
        mov si, s_slot
        call puts
        xor ax, ax
        mov al, [slot_num]
        call put_dec
        mov si, s_sep
        call puts
        xor ch, ch
        mov cl, [charbuf]
        mov dx, charbuf+1
        mov bx, 1
        mov ah, 40h
        int 21h
        mov si, s_crlf
        call puts
        pop bx
        ret

puts:
        push ax
        push bx
        push cx
        push dx
        mov dx, si
        xor cx, cx
.len:
        cmp byte [si], 0
        je .emit
        inc si
        inc cx
        jmp .len
.emit:
        mov bx, 1
        mov ah, 40h
        int 21h
        pop dx
        pop cx
        pop bx
        pop ax
        ret

put_dec:
        push ax
        push bx
        push cx
        push dx
        xor cx, cx
        mov bx, 10
.digits:
        xor dx, dx
        div bx
        push dx
        inc cx
        or ax, ax
        jnz .digits
.emit:
        pop dx
        add dl, '0'
        mov [digitbuf], dl
        push cx
        mov dx, digitbuf
        mov cx, 1
        mov bx, 1
        mov ah, 40h
        int 21h
        pop cx
        loop .emit
        pop dx
        pop cx
        pop bx
        pop ax
        ret

%include "dqkcreate.inc"
%include "secretparty.inc"
%include "secretstrength.inc"
%include "secretwhonames.inc"
secret_mode db 0

header db 'GBPR'
       dw 1,0,ENTRY_SIZE,FLAG_DOK
       dw 0,0
savepath db 'SAVE\CHRDATA'
slot_digit db '1'
saveext db '.SAV',0
qsv_root db 'SAVGAMA.QSV',0
qsv_save db 'SAVE\SAVGAMA.QSV',0
qsv_cloud db 'CLOUD_~1\SAVE\SAVGAMA.QSV',0
qch_save db 'SAVE\CHRDATA'
qch_save_digit db '1'
         db '.QCH',0
qch_cloud_a db 'CLOUD_~1\SAVE\CHRDATA'
qch_cloud_a_digit db '1'
            db '.QCH',0
qch_cloud_b db 'CLOUD_~1\SAVE\CHRDATB'
qch_cloud_b_digit db '1'
            db '.QCH',0
qch_cloud_c db 'CLOUD_~1\SAVE\CHRDATC'
qch_cloud_c_digit db '1'
            db '.QCH',0
s_default_out db 'CCPARTY.GBP',0
s_slot db '  slot ',0
s_sep db ': ',0
s_crlf db 13,10,0
s_loaded db 'CCPARTY: loaded ',0
s_members db ' member(s)',13,10,0
s_menu db 13,10,'[B]egin adventuring  [C]reate character: ',0
s_dqk_creation_unavailable db 13,10,'DQK character creation was rejected.',13,10,0
s_dq_name_prompt db 13,10,'Name (3-8 letters): ',0
s_dq_race_prompt db 13,10,'Race 0 Silvanesti 1 Qualinesti 2 Half-elf 3 Hill dwarf 4 Mountain dwarf 5 Kender 6 Human: ',0
s_dq_con_prompt db 13,10,'Constitution (0-25): ',0
s_name_prompt db 13,10,'Name (1-15 ASCII characters): ',0
s_class_prompt db 13,10,'Class [C]leric [F]ighter [R]anger [K]night [M]age [T]hief: ',0
s_full db 13,10,'Party is full (6).',13,10,0
s_need_member db 13,10,'Create at least one character before beginning.',13,10,0
s_bad_name db 13,10,'Invalid character name.',13,10,0
s_create_fail db 'CCPARTY: cannot create roster sidecar',13,10,0
s_previous_fail db 'CCPARTY: prior roster is invalid or legacy-only native state needs migration; output unchanged',13,10,0
s_write_fail db 'CCPARTY: roster sidecar write failed',13,10,0
dok_thac0_fighter db 20,20,18,17,16,15,14,13,12,11,10,9
dok_thac0_cleric  db 20,20,20,18,18,18,16,16,16,14,14,14
dok_thac0_mage    db 21,21,21,21,21,19,19,19,19,19,17,17
dok_thac0_thief   db 20,20,20,20,19,19,19,19,16,16,16,16
dok_con_nonwarrior db -2,-1,-1,-1,0,0,0,0,0,0,0,0,1,2,2,2,2
dok_con_warrior    db -2,-1,-1,-1,0,0,0,0,0,0,0,0,1,2,3,4,5
dok_dex_ac         db 4,3,2,1,0,0,0,0,0,0,0,0,-1,-2,-3,-4,-4
dok_str_hit        db -3,-2,-2,-1,-1,0,0,0,0,0,0,0,0,0,1,1,3
dok_str_damage     db -1,-1,-1,0,0,0,0,0,0,0,0,0,0,1,1,2,7
dok_spell_class db \
  1,1,1,1,1,1,1,1, 2,2,2,2,2,2,2,2, \
  2,2,2,2,2,1,1,1, 1,1,1,1,2,2,2,2, \
  2,2,2,1,1,1,1,1, 1,1,1,1,2,2,2,2, \
  2,2,2,2,2,2,2,1, 0,1,0,0,0,0,0,0, \
  0,1,1,1,1,1,1,1, 1,1,1,1,0,0,0,0, \
  2,2,2,2,2,2,2,2, 2,0,2,2,2,2,0,0, \
  0,0,0,2,1,1,1,1, 1,0,0,0,0,2,2,2, \
  2,2,2,2,2,2,2,2, 2,2

; START.EXE DS:7638, first 18 u32 values of each 204-byte category row.
; Active levels are 1..17 and index level+1, so later row bytes are never read.
dok_award_thresholds:
        dd 0x02020202,0x02020202,0x00000fa0,0x00001d4c,0x00003b92,0x000061a8,0x00009c40,0x00015f90,0x00027100,0x0003d090,0x0007a120,0x000b71b0,0x000f4240,0x001312d0,0x0016e360,0xffffffff,0xffffffff,0xffffffff ; DoK category 0
        dd 0x01000000,0x00010101,0x00000bb8,0x00001770,0x000032c8,0x00006b6c,0x0000d6d8,0x0001adb0,0x00036ee8,0x0006ddd0,0x000a4cb8,0x000dbba0,0x00112a88,0x00149970,0x00180858,0xffffffff,0xffffffff,0xffffffff ; DoK category 1
        dd 0x00000000,0x00010000,0x000007d1,0x00000fa1,0x00001f41,0x00004651,0x000088b9,0x00011171,0x0001e849,0x0003d091,0x0007a121,0x000b71b1,0x000f4241,0x001312d1,0x0016e361,0xffffffff,0xffffffff,0xffffffff ; DoK category 2
        dd 0x00000000,0x00000000,0x00001388,0x00002710,0x00004844,0x00009088,0x00014c08,0x000222e0,0x00035b60,0x000493e0,0x000927c0,0x000dbba0,0x00124f80,0x0016e360,0x001b7740,0xffffffff,0xffffffff,0xffffffff ; DoK category 3
        dd 0x00000000,0x00000000,0x00001388,0x00002ee0,0x00005dc0,0x0000afc8,0x00017318,0x0002ab98,0x00055730,0x000aae60,0x00100590,0x00155cc0,0x001ab3f0,0x00200b20,0x00256250,0xffffffff,0xffffffff,0xffffffff ; DoK category 4
        dd 0x00000000,0x00000000,0x00001388,0x00002ee0,0x00006978,0x0000ea60,0x0001e848,0x00030d40,0x00067c28,0x000c3500,0x0016e360,0x001e8480,0x002625a0,0x002dc6c0,0x003567e0,0xffffffff,0xffffffff,0xffffffff ; DoK category 5
        dd 0x00000000,0x00000000,0x000008cb,0x00001195,0x00002711,0x00004e21,0x00009c41,0x00015f91,0x000249f1,0x00036ee9,0x0004f589,0x0009eb11,0x000ee099,0x0013d621,0x0018cba9,0xffffffff,0xffffffff,0xffffffff ; DoK category 6
        dd 0x00000000,0x00000000,0x00001388,0x00002710,0x00004e20,0x00009470,0x0000d6d8,0x000186a0,0x00030d40,0x00061a80,0x000927c0,0x000c3500,0x000f4240,0x001312d0,0x0016e360,0xffffffff,0xffffffff,0xffffffff ; DoK category 7
        dd 0x00000000,0x00000000,0x00001388,0x00002710,0x00004650,0x00008ca0,0x0000c350,0x00015f90,0x0002bf20,0x00055730,0x0007a120,0x000aae60,0x000dbba0,0x0010c8e0,0x0013d620,0xffffffff,0xffffffff,0xffffffff ; DoK category 8
        dd 0x00000000,0x00000000,0x000004e3,0x000009c5,0x00001389,0x00002711,0x00004e21,0x0000a605,0x00011171,0x0001adb1,0x00027101,0x00035b61,0x0006b6c1,0x000a1221,0x000d6d81,0x0010c8e1,0x00142441,0x00177fa1 ; DoK category 9
        dd 0x00000000,0x00000000,0x00000abf,0x0000157d,0x00002ee1,0x00005dc1,0x0000afc9,0x00017319,0x0002ab99,0x00055731,0x000aae61,0x00100591,0x00155cc1,0x001ab3f1,0x00200b21,0xffffffff,0xffffffff,0xffffffff ; DoK category 10
dok_award_limits db 14,0,10,12,14,14,0,0,14,0,14,0,14,14,18,0,14,0,9,0,11,10,18,10,10,0,14,8,0,0,8,0,10,0,14,0,8,0,10,0,12,0,5,0,5,0,18,0,14,0,14,14,14,14,18,14

align 2
ofh dw 0
ifh dw 0
jnkfh dw 0
party_count db 0
entry_write_left db 0
menumode db 0
createmode db 0
dokmode db 0
qsvmode db 0
hl_dqk db 0
title_id dw 0
title_id_invalid db 0
seen_source_slots dw 0
seen_native_slots dw 0
prev_count db 0
prev_extra_len db 0
create_name_len db 0
forced_class db 0
slot_num db 0
entry_slot db 0
partybuf times ENTRY_SIZE*PARTY_CAP_MAX db 0
party_cap db 6
prev_slot_match db 0
extra db 0
digitbuf db 0
party_record_size dw CHAR_SIZE
party_flags dw 0
prev_read_len dw 0
meta_hp dw 0
meta_ac dw 0
meta_base_ac dw 0
meta_dcount dw 0
meta_dsides dw 0
meta_dbonus dw 0
meta_hitbonus dw 0
meta_move dw 0
meta_hp_per_level dw 0
meta_thac0 db 0
meta_class db 0
meta_level db 0
meta_best_diff db 0
meta_weapon db 0
wiz_cleric db 0
wiz_mage db 0
qsv_len dw 0
qsv_scan dw 0
qsv_name_len db 0
qsv_remaining db 0
qch_slot db 0
outname times 112 db 0
charbuf times CHAR_SIZE db 0
jnkbuf times 74 db 0
name_input times 18 db 0
choice_input times 4 db 0
input_byte db 0
input_overflow db 0
input_skip_lf db 0
input_failed db 0
create_name times 16 db 0
prevbuf times GBPR_MAX_LEN db 0
qsvbuf times QSV_BUF_SIZE db 0
times 256 db 0
stacktop:
