; dqkcreate.inc -- native DQK character creation for CCPARTY /Q /C.
; Included by ccparty.asm.  Rules model and evidence: tools/dqk_character_rules.py
; (create_record) and docs/engine/research/dqk-character-creation.md.
; The retail rules reproduced here: 1,000,001 starting XP, class level 1, the
; overlay-11 first-level HP helper (roll twice keep the larger below the dice
; cutoff, CON adjustment, byte arithmetic quirks) and the XP-driven level-up
; loop with racial caps.  The dice are NOT the retail random generator: they
; come from a /D byte file (raw = byte mod sides, cyclic) or a local LCG.
;
; The 414-byte record is built at qsvbuf (physical offsets, the importer sees
; it at qsvbuf+8), written to SAVE\<NAME>.QCH and projected into a native GBPR
; row (slot 80h..85h) by the existing build_dqk_qsv_member importer path.

DQ_REC_SIZE equ 414
DQ_XP equ 1000001

; CF set = rejected.  Nothing is written until every check has passed.
dqk_create:
        cmp byte [party_count], 6
        jae .reject
        cmp byte [dq_arg_bad], 0
        jne .reject
        cmp byte [dq_race], 6
        ja .reject
        cmp byte [dq_con], 25
        ja .reject
        call dq_check_name
        jc .reject
        ; class letter -> slot
        mov al, [forced_class]
        xor bx, bx
.class:
        cmp al, [bx+dq_class_letters]
        je .class_found
        inc bx
        cmp bx, 6
        jb .class
        jmp .reject
.class_found:
        mov al, [bx+dq_class_slots]
        mov [dq_slot], al
        ; race must be able to advance past level 1 in this class
        movzx bx, byte [dq_race]
        imul bx, bx, 7
        movzx ax, byte [dq_slot]
        add bx, ax
        cmp byte [bx+dqk_race_caps], 2
        jb .reject
        ; dice source
        call dq_dice_init
        jc .reject
        call dq_build_record
        jc .reject
        ; the importer's own acceptance test, before anything is written
        mov si, qsvbuf+8
        call dqk_qsv_candidate
        jc .reject
        ; first free native slot 80h..85h
        mov al, 80h
.slot:
        mov si, partybuf
        movzx cx, byte [party_count]
.slot_scan:
        jcxz .slot_free
        cmp [si], al
        je .slot_used
        add si, ENTRY_SIZE
        loop .slot_scan
.slot_free:
        mov [qch_slot], al
        jmp .write
.slot_used:
        inc al
        cmp al, 86h
        jb .slot
        jmp .reject
.write:
        call dq_write_qch
        jc .reject
        mov si, qsvbuf+8
        call build_dqk_qsv_member
        mov byte [qch_slot], 0
        clc
        ret
.reject:
        stc
        ret

; Name: 3..8 letters (it becomes the DOS file name and must satisfy the
; importer's letters-only rule).  Upper-cases create_name in place; CF = bad.
dq_check_name:
        movzx cx, byte [create_name_len]
        cmp cx, 3
        jb .bad
        cmp cx, 8
        ja .bad
        mov si, create_name
.name:
        mov al, [si]
        cmp al, 'a'
        jb .name_upper
        cmp al, 'z'
        ja .name_upper
        sub al, 20h
        mov [si], al
.name_upper:
        cmp al, 'A'
        jb .bad
        cmp al, 'Z'
        ja .bad
        inc si
        loop .name
        clc
        ret
.bad:
        stc
        ret

; Interactive `C` in the /Q /M menu.  Collects name, class, race and CON from
; the same input path as every other prompt, re-prompting on invalid values,
; then runs dqk_create (nothing is written before it).  CF = input failure
; (EOF/read error); a rejected character prints a message and returns CF clear.
dq_menu_create:
.name:
        mov si, s_dq_name_prompt
        call puts
        mov byte [name_input], 16
        mov byte [name_input+1], 0
        mov dx, name_input
        call read_input_line
        jc .ret
        movzx cx, byte [name_input+1]
        cmp cx, 8
        ja .bad_name
        mov [create_name_len], cl
        mov si, name_input+2
        mov di, create_name
        rep movsb
        mov byte [di], 0
        call dq_check_name
        jnc .class
.bad_name:
        mov si, s_bad_name
        call puts
        jmp .name
.class:
        mov si, s_class_prompt
        call puts
        call read_choice
        jc .ret
        xor bx, bx
.cls:
        cmp al, [bx+dq_class_letters]
        je .class_ok
        inc bx
        cmp bx, 6
        jb .cls
        jmp .class
.class_ok:
        mov [forced_class], al
.race:
        mov si, s_dq_race_prompt
        call dq_read_num
        jc .race_chk
        cmp al, 6
        ja .race
        mov [dq_race], al
        jmp .con
.race_chk:
        cmp byte [input_failed], 0
        je .race
        ret
.con:
        mov si, s_dq_con_prompt
        call dq_read_num
        jc .con_chk
        cmp al, 25
        ja .con
        mov [dq_con], al
        call dqk_create
        jnc .ok
        mov si, s_dqk_creation_unavailable
        call puts
.ok:
        clc
.ret:
        ret
.con_chk:
        cmp byte [input_failed], 0
        je .con
        ret

; SI = prompt.  AL = number, CF = unparsable (input_failed set on EOF).
dq_read_num:
        call puts
        mov byte [name_input], 16
        mov byte [name_input+1], 0
        mov dx, name_input
        call read_input_line
        jc .ret
        movzx cx, byte [name_input+1]
        mov si, name_input+2
        call dq_parse_num
.ret:
        ret

; ---- dice ---------------------------------------------------------------
dq_dice_init:
        cmp byte [dicepath], 0
        jne .file
        ; opt-in reproducible dice: _GBDICE.BIN in the current directory.
        ; Absent or unreadable/empty -> the timer seed below, exactly as before.
        mov ax, 3D00h
        mov dx, dice_optin
        int 21h
        jc .timer
        call .read
        jnc .ok
.timer:
        mov ah, 0
        int 1Ah
        mov [rng_state], dx
        mov word [dice_len], 0
        clc
        ret
.file:
        mov ax, 3D00h
        mov dx, dicepath
        int 21h
        jc .bad
        call .read
        jc .bad
.ok:
        clc
        ret
.bad:
        stc
        ret
; AX = open handle -> reads <=256 bytes, closes; CF = failed or empty.
.read:
        mov bx, ax
        mov ah, 3Fh
        mov cx, 256
        mov dx, dicebuf
        int 21h
        pushf
        push ax
        mov ah, 3Eh
        int 21h
        pop ax
        popf
        jc .rbad
        or ax, ax
        jz .rbad
        mov [dice_len], ax
        mov word [dice_pos], 0
        clc
        ret
.rbad:
        mov word [dice_len], 0
        stc
        ret

; AL = next dice byte.  Preserves everything else.
dq_byte:
        push bx
        cmp word [dice_len], 0
        je .lcg
        mov bx, [dice_pos]
        mov al, [bx+dicebuf]
        inc bx
        cmp bx, [dice_len]
        jb .store
        xor bx, bx
.store:
        mov [dice_pos], bx
        pop bx
        ret
.lcg:
        mov ax, [rng_state]
        imul ax, ax, 25173
        add ax, 13849
        mov [rng_state], ax
        mov al, ah
        pop bx
        ret

; BL = sides -> AX = raw 0..sides-1.  Preserves BX, CX, DX, SI.
dq_roll:
        call dq_byte
        xor ah, ah
        div bl
        mov al, ah
        xor ah, ah
        ret

; ---- hit points -----------------------------------------------------------
; CON adjustment helper (overlay 11 3A5B).  SI = slot, returns AL (unsigned).
dq_conbonus:
        movzx bx, byte [qsvbuf+81h]
        mov al, [bx+dqk_con_table]
        cmp si, 1
        jb .done
        cmp si, 4
        ja .done
        cmp bl, 17
        jb .done
        cmp bl, 25
        ja .done
        add al, [bx+dqk_con_extra-17]
.done:
        ret

; One trial of [hp_count] dice for slot SI, AL = total (byte).
dq_trial:
        push bx
        push cx
        xor dl, dl
        movzx cx, byte [hp_count]
.die:
        mov bl, [si+dqk_sides]
        call dq_roll
        inc al
        add dl, al
        loop .die
        mov al, dl
        pop cx
        pop bx
        ret

; Overlay 11 143B, grant mode: classes selected by [dq_mask], divisor [dq_div].
dq_hp:
        mov byte [hp_roll], 0
        mov byte [hp_con], 0
        xor si, si
.slot:
        mov al, [si+qsvbuf+0A5h]
        or al, al
        jz .next
        mov [hp_level], al
        mov al, [si+dqk_class_bit]
        test al, [dq_mask]
        jz .next
        mov al, [hp_level]
        cmp al, [si+dqk_cutoff]
        jae .fixed
        mov al, [si+dqk_first_dice]
        cmp byte [hp_level], 1
        jbe .count
        mov al, 1
.count:
        mov [hp_count], al
        call dq_trial
        mov [hp_t1], al
        call dq_trial
        cmp al, [hp_t1]
        ja .best
        mov al, [hp_t1]
.best:
        add [hp_roll], al
        call dq_conbonus
        mul byte [hp_count]
        add [hp_con], al
        jmp .next
.fixed:
        ; Retail ASSIGNS the fixed gain (it does not add it).
        movzx bx, byte [si+dqk_cat]
        mov al, [bx+dqk_fixed_gain]
        mov [hp_roll], al
.next:
        inc si
        cmp si, 7
        jb .slot
        movzx bx, byte [dq_div]
        or bl, bl
        jz .zero
        mov al, [hp_roll]
        xor ah, ah
        div bl
        or al, al
        jnz .roll_ok
        mov al, 1
.roll_ok:
        mov [hp_roll], al
        mov al, [hp_con]
        xor ah, ah
        div bl
        mov [hp_con], al
        mov al, [qsvbuf+89h]
        sub al, [qsvbuf+198h]
        mov [hp_def], al
        mov al, [hp_roll]
        add [qsvbuf+0C0h], al
        add al, [hp_con]
        add [qsvbuf+89h], al
        mov al, [qsvbuf+89h]
        cmp al, [hp_def]
        jb .cur_zero
        sub al, [hp_def]
        mov [qsvbuf+198h], al
        ret
.cur_zero:
        mov byte [qsvbuf+198h], 0
        ret
.zero:
        mov byte [qsvbuf+198h], 0
        mov byte [qsvbuf+0C0h], 0
        mov byte [qsvbuf+89h], 0
        ret

; ---- record ---------------------------------------------------------------
dq_count_active:
        xor si, si
        xor dl, dl
.c:
        cmp byte [si+qsvbuf+0A5h], 0
        je .n
        inc dl
.n:
        inc si
        cmp si, 7
        jb .c
        mov [dq_div], dl
        ret

dq_build_record:
        cld
        mov di, qsvbuf
        xor ax, ax
        mov cx, DQ_REC_SIZE/2
        rep stosw
        mov dword [qsvbuf+44h], DQ_XP
        movzx ax, byte [dq_race]
        mov [qsvbuf+58h], ax
        movzx ax, byte [dq_slot]
        mov [qsvbuf+5Ah], ax
        mov si, create_name
        mov di, qsvbuf+68h
        movzx cx, byte [create_name_len]
        rep movsb
        mov si, dq_abil
        mov di, qsvbuf+78h
        mov cx, 6
.abil:
        lodsb
        mov [di], al
        mov [di+1], al
        add di, 2
        loop .abil
        mov al, [dq_con]
        mov [qsvbuf+80h], al
        mov [qsvbuf+81h], al
        movzx bx, byte [dq_race]
        mov al, [bx+dqk_race_size]
        mov [qsvbuf+0C6h], al
        movzx bx, byte [dq_slot]
        mov byte [bx+qsvbuf+0A5h], 1
        cmp bl, 1
        jne .not_knight
        mov byte [qsvbuf+19Ah], 1       ; Crown order
.not_knight:
        cmp bl, 5
        jne .not_mage
        mov byte [qsvbuf+19Dh], 1       ; robe of the Order of the Red Robes
.not_mage:
        call dq_count_active
        mov byte [dq_mask], 0FFh
        call dq_hp
        mov byte [lv_iter], 64
.again:
        mov byte [dq_mask], 0
        xor si, si
.scan:
        mov al, [si+qsvbuf+0A5h]
        or al, al
        jz .scan_next
        movzx bx, byte [dq_race]
        imul bx, bx, 7
        add bx, si
        mov ah, [bx+dqk_race_caps]
        cmp ah, al
        jbe .scan_next                  ; at the racial cap
        inc al
        cmp al, 17
        ja .scan_next                   ; row 17 already exceeds the start XP
        movzx bx, byte [si+dqk_cat]
        imul bx, bx, 18
        movzx dx, al
        add bx, dx
        shl bx, 2
        mov eax, [bx+dqk_thr]
        or eax, eax
        jz .scan_next
        cmp eax, DQ_XP
        ja .scan_next
        mov al, [si+dqk_class_bit]
        or [dq_mask], al
.scan_next:
        inc si
        cmp si, 7
        jb .scan
        cmp byte [dq_mask], 0
        je .levelled
        xor si, si
.raise:
        cmp byte [si+qsvbuf+0A5h], 0
        je .raise_next
        mov al, [si+dqk_class_bit]
        test al, [dq_mask]
        jz .raise_next
        inc byte [si+qsvbuf+0A5h]
.raise_next:
        inc si
        cmp si, 7
        jb .raise
        call dq_hp
        dec byte [lv_iter]
        jnz .again
        stc
        ret
.levelled:
        xor si, si
        xor dx, dx                      ; DL highest to-hit byte, DH use mask
        mov byte [lv_max], 0
.final:
        movzx ax, byte [si+qsvbuf+0A5h]
        or al, al
        jz .final_next
        cmp al, [lv_max]
        jbe .not_max
        mov [lv_max], al
.not_max:
        mov bx, si
        imul bx, bx, 22
        add bx, ax
        mov cl, [bx+dqk_thac0]
        cmp cl, dl
        jbe .no_thac0
        mov dl, cl
.no_thac0:
        add dh, [si+dqk_use_mask]
.final_next:
        inc si
        cmp si, 7
        jb .final
        mov [qsvbuf+87h], dl
        mov [qsvbuf+0BFh], dh
        mov byte [qsvbuf+0B5h], 1
        mov byte [qsvbuf+0B7h], 2
        mov byte [qsvbuf+0BBh], 50
        mov byte [qsvbuf+90h], 12
        mov al, [lv_max]
        mov [qsvbuf+91h], al
        clc
        ret

; SAVE\<NAME>.QCH
dq_write_qch:
        mov si, dq_savedir
        mov di, dq_path
.dir:
        lodsb
        or al, al
        jz .name
        stosb
        jmp .dir
.name:
        mov si, create_name
        movzx cx, byte [create_name_len]
        rep movsb
        mov si, dq_ext
.ext:
        lodsb
        stosb
        or al, al
        jnz .ext
        mov ah, 3Ch
        xor cx, cx
        mov dx, dq_path
        int 21h
        jc .bad
        mov [ofh_qch], ax
        mov bx, ax
        mov ah, 40h
        mov cx, DQ_REC_SIZE
        mov dx, qsvbuf
        int 21h
        pushf
        push ax
        mov bx, [ofh_qch]
        mov ah, 3Eh
        int 21h
        pop ax
        popf
        jc .bad
        cmp ax, DQ_REC_SIZE
        jne .bad
        clc
        ret
.bad:
        stc
        ret

; ---- parsing helpers (called from parse_output; SI/CX are its cursor) ------
; AL = decimal 0..255, CF = invalid.  Clobbers AX, BX, DX.
dq_parse_num:
.skip:
        or cx, cx
        jz .bad
        cmp byte [si], ' '
        jne .digits
        inc si
        dec cx
        jmp .skip
.digits:
        xor dx, dx
        xor bl, bl
.digit:
        or cx, cx
        jz .end
        movzx ax, byte [si]
        sub al, '0'
        cmp al, 9
        ja .end
        imul dx, dx, 10
        add dx, ax
        cmp dx, 255
        ja .bad
        inc bl
        inc si
        dec cx
        jmp .digit
.end:
        or bl, bl
        jz .bad
        or cx, cx
        jz .good
        cmp byte [si], ' '
        jne .bad
.good:
        mov al, dl
        clc
        ret
.bad:
        stc
        ret

dq_race db 6
dq_con db 15
dq_arg_bad db 0
dq_slot db 0
dq_div db 1
dq_mask db 0
hp_roll db 0
hp_con db 0
hp_count db 0
hp_level db 0
hp_t1 db 0
hp_def db 0
lv_iter db 0
lv_max db 0
dice_len dw 0
dice_pos dw 0
rng_state dw 0
ofh_qch dw 0
dq_class_letters db 'CKFRMT'
dq_class_slots db 0,1,2,4,5,6
dq_abil db 14,14,14,14,15,14
dq_savedir db 'SAVE\',0
dq_ext db '.QCH',0
dice_optin db '_GBDICE.BIN',0
dicepath times 64 db 0
dq_path times 32 db 0
dicebuf times 256 db 0

; ---- tables derived from The Dark Queen of Krynn DQK.EXE ------------------
; tools/test_dqk_character_rules.py requires every line below to equal
; `python tools/dqk_character_rules.py --emit-asm`.
dqk_class_bit db 2,64,8,16,32,1,4   ; DS:63FA class-slot bit
dqk_use_mask db 2,16,8,64,128,1,4   ; DS:63F3 item-use mask summed into +0BFh
dqk_cutoff db 10,10,10,10,11,12,11   ; DS:640A dice cutoff level
dqk_first_dice db 1,2,1,1,2,1,1   ; DS:6411 first-level dice count
dqk_sides db 8,10,10,10,8,4,6   ; DS:6418 hit die sides (low bytes)
dqk_con_table db 47,47,47,254,255,255,255,0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2   ; DS:082D CON adjustment, CON 0..25
dqk_con_extra db 1,2,3,3,4,4,4,5,5   ; CS:3AAB warrior bonus, CON 17..25
dqk_fixed_gain db 1,1,3,2,2,2,2,1,1,2,3   ; CS:38F8 fixed gain above cutoff, category 0..10
dqk_cat db 0,3,2,10,6,7,9   ; creation category per slot (deity 0, order 1, robe 1)
dqk_race_size db 2,2,2,1,1,1,2   ; 25A4:1839 +0C6h by race
dqk_race_caps db 40,0,10,12,40,40,0   ; DS:17DC race 0
dqk_race_caps_1 db 40,0,14,0,40,40,40   ; DS:17DC race 1
dqk_race_caps_2 db 40,10,9,0,11,10,40   ; DS:17DC race 2
dqk_race_caps_3 db 10,0,40,8,0,0,8   ; DS:17DC race 3
dqk_race_caps_4 db 10,0,40,0,8,0,10   ; DS:17DC race 4
dqk_race_caps_5 db 12,0,5,0,5,0,40   ; DS:17DC race 5
dqk_race_caps_6 db 40,18,40,40,40,40,40   ; DS:17DC race 6
dqk_thac0 db 40,40,40,40,42,42,42,44,44,44,46,46,46,48,48,48,50,50,50,51,51,51   ; DS:6359 to-hit row, slot 0
dqk_thac0_1 db 39,40,40,42,42,44,44,46,46,48,48,50,50,52,52,54,54,56,56,56,56,56   ; DS:6359 to-hit row, slot 1
dqk_thac0_2 db 39,40,40,42,42,44,44,46,46,48,48,50,50,52,52,54,54,56,56,56,56,56   ; DS:6359 to-hit row, slot 2
dqk_thac0_3 db 40,40,40,42,42,44,44,46,46,48,48,50,50,52,52,54,54,56,56,56,56,56   ; DS:6359 to-hit row, slot 3
dqk_thac0_4 db 40,40,40,42,42,44,44,46,46,48,48,50,50,52,52,54,54,56,56,56,56,56   ; DS:6359 to-hit row, slot 4
dqk_thac0_5 db 39,40,40,40,40,40,41,41,41,41,41,44,44,44,44,44,47,47,47,47,47,49   ; DS:6359 to-hit row, slot 5
dqk_thac0_6 db 40,40,40,40,40,41,41,41,41,44,44,44,44,46,46,46,46,48,48,48,48,50   ; DS:6359 to-hit row, slot 6
dqk_thr dd 0x00000000,0x00000000,0x00000fa0,0x00001d4c,0x00003b92,0x000061a8,0x00009c40,0x00015f90,0x00027100,0x0003d090,0x0007a120,0x000b71b0,0x000f4240,0x001312d0,0x0016e360,0x001ab3f0,0x001e8480,0x00225510   ; DS:0852 row 0, levels 0..17
dqk_thr_1 dd 0x00000000,0x00000000,0x00000bb8,0x00001770,0x000032c8,0x00006b6c,0x0000d6d8,0x0001adb0,0x00036ee8,0x0006ddd0,0x000a4cb8,0x000dbba0,0x00112a88,0x00149970,0x00180858,0x001b7740,0x001ee628,0x00225510   ; DS:0852 row 1, levels 0..17
dqk_thr_2 dd 0x00000000,0x00000000,0x000007d1,0x00000fa1,0x00001f41,0x00004651,0x000088b9,0x00011171,0x0001e849,0x0003d091,0x0007a121,0x000b71b1,0x000f4241,0x001312d1,0x0016e361,0x001ab3f1,0x001e8481,0x00225511   ; DS:0852 row 2, levels 0..17
dqk_thr_3 dd 0x00000000,0x00000000,0x00001388,0x00002710,0x00004844,0x00009088,0x00014c08,0x000222e0,0x00035b60,0x000493e0,0x000927c0,0x000dbba0,0x00124f80,0x0016e360,0x001b7740,0x00200b20,0x00249f00,0x002932e0   ; DS:0852 row 3, levels 0..17
dqk_thr_4 dd 0x00000000,0x00000000,0x00001388,0x00002ee0,0x00005dc0,0x0000afc8,0x00017318,0x0002ab98,0x00055730,0x000aae60,0x00100590,0x00155cc0,0x001ab3f0,0x00200b20,0x00256250,0x002ab980,0x003010b0,0x003567e0   ; DS:0852 row 4, levels 0..17
dqk_thr_5 dd 0x00000000,0x00000000,0x00001388,0x00002ee0,0x00006978,0x0000ea60,0x0001e848,0x00030d40,0x00067c28,0x000c3500,0x0016e360,0x001e8480,0x002625a0,0x002dc6c0,0x003567e0,0x003d0900,0x0044aa20,0x004c4b40   ; DS:0852 row 5, levels 0..17
dqk_thr_6 dd 0x00000000,0x00000000,0x000008cb,0x00001195,0x00002711,0x00004e21,0x00009c41,0x00015f91,0x000249f1,0x00036ee9,0x0004f589,0x0009eb11,0x000ee099,0x0013d621,0x0018cba9,0x001dc131,0x0022b6b9,0x0027ac41   ; DS:0852 row 6, levels 0..17
dqk_thr_7 dd 0x00000000,0x00000000,0x00001388,0x00002710,0x00004e20,0x00009470,0x0000d6d8,0x000186a0,0x00030d40,0x00061a80,0x000927c0,0x000c3500,0x000f4240,0x001312d0,0x0016e360,0x001ab3f0,0x001e8480,0x00225510   ; DS:0852 row 7, levels 0..17
dqk_thr_8 dd 0x00000000,0x00000000,0x00001388,0x00002710,0x00004650,0x00008ca0,0x0000c350,0x00015f90,0x0002bf20,0x00055730,0x0007a120,0x000aae60,0x000dbba0,0x0010c8e0,0x0013d620,0x0016e360,0x0019f0a0,0x001cfde0   ; DS:0852 row 8, levels 0..17
dqk_thr_9 dd 0x00000000,0x00000000,0x000004e3,0x000009c5,0x00001389,0x00002711,0x00004e21,0x0000a605,0x00011171,0x0001adb1,0x00027101,0x00035b61,0x0006b6c1,0x000a1221,0x000d6d81,0x0010c8e1,0x00142441,0x00177fa1   ; DS:0852 row 9, levels 0..17
dqk_thr_10 dd 0x00000000,0x00000000,0x00000abf,0x0000157d,0x00002ee1,0x00005dc1,0x0000afc9,0x00017319,0x0002ab99,0x00055731,0x000aae61,0x00100591,0x00155cc1,0x001ab3f1,0x00200b21,0x00256251,0x002ab981,0x003010b1   ; DS:0852 row 10, levels 0..17
