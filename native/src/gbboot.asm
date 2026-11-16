; ============================================================================
;  GBBOOT.COM -- Greybox native DOS boot front door.
;
;  This is the first engine-facing native slice: a DOS .COM program that can be
;  dropped into, or run from another drive against, a mounted Gold Box install.
;  It detects the local engine/data family and either reports the boot plan
;  (/D dry-run), EXECs the right DOS executable, or (/E) chains the native asm
;  GEO->first-person preview path through sibling CCGEO.COM + CCFP.COM.
;
;  Supported concrete layouts in this slice:
;    - Champions of Krynn DOS     START.EXE + KRYNN.CFG + DAX data
;    - Death Knights of Krynn DOS START.EXE + DKK.CFG + DAX data
;    - Pool of Radiance DOS       START.EXE + POOL.CFG
;    - Curse of Azure Bonds DOS   START.EXE + CURSE.CFG
;    - Secret/Silver Blades DOS   START.EXE + BLADES.CFG
;    - Pools of Darkness DOS      GAME.EXE + POOL4.CFG + GAME.OVR
;    - Neverwinter Nights DOS/AOL GAME.EXE + GAME.CFG + GAME.OVR + ECL0/GEO0
;    - Gateway/Savage DOS         GAME.EXE + GAME.CFG + ZOUNDS.DAX
;    - Treasures/Savage DOS       GAME.EXE + TREASURE.CFG + ZOUNDS.DAX
;    - Buck Rogers CDtD DOS       BUCK1.EXE + BUCK2.EXE + BUCK3.EXE
;    - Buck Rogers Matrix Cubed   START.EXE + MATRIX.CFG
;    - DQK / generated HLIB build DQK.EXE + DISK*\*.GLB/TLB layout
;    - Generic START.EXE + *.DAX Gen1 install fallback
;    - Named broader Gen1 data-only marker + GEO*.DAX fallback (native /E only)
;    - Generic data-only GEO*.DAX Gen1 DAX fallback (native /E only)
;    - Data-only ECL.GLB/GEO.GLB HLIB fallback (native /E only)
;    - Generic data-only GEO.GLB HLIB fallback (native /E only)
;    - FRUA CKIT.EXE + root SCRIPT or installed DISK3 fallback
;    - Steam/GOG-style GAME\<shortname> child folders for FR and Buck DOS games
;
;  Build: native\build.ps1 -Target gbboot
;  Test:  GBBOOT /D      (detect only, no EXEC)
;         GBBOOT /E      (native first-person preview, when GEO is known)
;         GBBOOT /E /X   (native snapshot to _GBVIEW.RAW/_GBCOMB.RAW, then exit)
;         GBBOOT /E /A 2  (native preview area/map override)
;         GBBOOT /E /A 1 /B 34
;                         (experimental Gen1/HLIB ECL entry override)
;         GBBOOT /E /I 31 /F 12 /U 2 12 /M 4 /M 10 /K 42 /S 22 /P 2 /H 1 /L 77 /C 1 /Y 2 /O 2 /W 3 /Q 3
;                         (optional CCECL party/query/selection/distance seed pass-through)
; ============================================================================
        cpu     386
        bits    16
        org     100h

TAIL_MAX equ 127
HLIB_8X8DB_SETS equ 9
PARTY_ITEM_MAX equ 8
PARTY_AFFECT_MAX equ 8
PARTY_MEMBER_AFFECT_MAX equ 4
PARTY_MEMBER_SPELL_MAX equ 4
PARTY_MOVE_MAX equ 8
PARTY_THIEF_MAX equ 8
PARTY_THIEF_SKILL_COUNT equ 8

; CoK's eight thief skills live at record offset 219, NOT at 139 (2026-09-07).
; 139 is FRUA's Pick Pocket offset -- hackdocs CCHFORM.TXT 139..146, a document
; whose own opening lines say it describes FRUA .cch -- and it had been pasted in
; here for a game that is not FRUA. Measured over all six retail
; `Champions of Krynn\SAVE\CHRDATA{1..6}.SAV` records (409 bytes each):
;   bytes 139..146 are ZERO in 6 of 6, MOLLY included;
;   bytes 219..226 are ZERO in 5 of 6 and hex `34 3D 2F 28 22 16 62 00` for
;   MOLLY -- decimal 52/61/47/40/34/22/98/0, i.e. thief-skill percentages --
;   who is the party's ONLY thief -- her class byte 91 is 14 = Fighter/Thief and
;   her race byte 90 is 5 = Kender, both read off CoK's own START.EXE menu enums.
; The old code could not have worked even with the right offset: it read only 147
; bytes of the file, so offset 219 was outside the buffer entirely. It copied eight
; zeros per character and still incremented seed_thief_matrix_count, so the matrix
; was reported POPULATED and was uniformly zero.
; 147 was not arbitrary either -- it is CCHFORM.TXT's OWN next offset (147 = "Set to
; zero (reserved for 128 + Morale)"), so the read LENGTH came from the FRUA document
; along with the offset. This was a faithful implementation of the wrong spec, which
; is exactly why it read as correct.
; NULL, stated because it is the weak part: only 1 of the 6 records discriminates.
; A non-thief is zero at both offsets, so five records are uninformative and both
; the location of 219 and the refutation of 139 rest on MOLLY alone. Nothing here
; was checked outside these six shipped pregens.
COK_CCH_THIEF_OFF equ 219
COK_CCH_THIEF_READ equ COK_CCH_THIEF_OFF + PARTY_THIEF_SKILL_COUNT

; CoK player experience is the 32-bit accumulator at CCH+116h.  The nearby
; CCH+130h (raw byte 304) is a monster's flat combat-award term: calc_battle_exp
; reads it while totaling defeated enemies, so writing player awards there
; corrupts monster metadata and leaves player experience unchanged.
COK_CCH_XP_OFF equ 116h
PARTY_SPELL_MAX equ 16
AUTO_ITEM_MAX equ 4
AUTO_SPELL_MAX equ 4
PARTY_CREATE_MAX equ 6
DQK_STRENGTH_PER_MEMBER equ 40
MEM_SEED_MAX equ 16
PS_V1_LEN equ 150
PS_V2_LEN equ PS_V1_LEN + 2 + (PARTY_THIEF_MAX * PARTY_THIEF_SKILL_COUNT)
PS_V3_LEN equ PS_V2_LEN + 2 + (MEM_SEED_MAX * 2) + (MEM_SEED_MAX * 2)
PS_V4_LEN equ PS_V3_LEN + 258       ; ownership flag + eight 256-id bitsets
PSLEN equ PS_V4_LEN
GBCR_BUF_LEN equ 16 + (6 * 6) + 1 ; extra byte detects oversized v2 results
GBEF_RS_MAGIC_OFF equ 116
GBEF_RS_AREA_OFF equ 122
GBEF_RS_MEMCOUNT_OFF equ 196
GBEF_RS_KEYS_OFF equ 198
GBEF_RS_VALS_OFF equ 1222
GBEF_MAXMEM equ 512
GBEF_SCRIPT_MAGIC_OFF equ 2246
GBEF_SCRIPT_CAP equ 64
GBEF_SCRIPT_BYTES equ (6 + (GBEF_SCRIPT_CAP * 20))
GBEF_SCRIPT_TEXT_REL equ GBEF_SCRIPT_BYTES
GBEF_SCRIPT_TOTAL_BYTES equ (GBEF_SCRIPT_BYTES + (GBEF_SCRIPT_CAP * 34))
GBEF_SCRIPT_TEXT_OFF equ (GBEF_SCRIPT_MAGIC_OFF + 6 + (GBEF_SCRIPT_CAP * 20))
GBEF_SETUP_OFF equ (GBEF_SCRIPT_TEXT_OFF + (GBEF_SCRIPT_CAP * 34))
GBEF_CLOCK_OFF equ GBEF_SETUP_OFF + 24
REST_FX_LEN equ GBEF_CLOCK_OFF + 18
GBEF_SCRIPT_COUNT_OFF equ 2250
GBEF_SCRIPT_EVENTS_OFF equ 2252
GBEF_SCRIPT_EVENT_SIZE equ 20

start:
        cld
        mov     sp, stacktop
        mov     ax, cs
        add     ax, IMG_BASE_PARAS
        mov     fs, ax
        mov     [img_seg], ax
        call    parse_args
        cmp     byte [menu_input_bad], 0
        jne     .badmenu
        cmp     byte [secret_profile_bad], 0
        jne     .badprofile
        cmp     byte [helpflag], 0
        jne     .usage

        call    detect_game
        jc      .nogame
        cmp     byte [secret_profile], 0
        je      .profile_ok
        cmp     byte [engineflag], 1
        jne     .badprofile
        cmp     word [gamep], game_hlib_data
        jne     .badprofile
        mov     si, s_secret_profile
        call    puts
.profile_ok:
        call    resolve_graphics_set
        call    apply_area_override
        call    apply_entry_override
        call    auto_seed_party_count
        call    auto_seed_dqk_strength
        call    auto_seed_party_thief_matrix
        call    auto_seed_party_items
        call    auto_seed_party_affect
        call    auto_seed_party_moves
        call    auto_seed_party_spells

        call    print_plan
        cmp     byte [dryrun], 0
        jne     .ok

        cmp     byte [engineflag], 0
        jne     .native

        cmp     word [exep], 0
        je      .noexec
        call    build_child_tail
        mov     ax, [exep]
        mov     [runpathp], ax
        call    shrink_mem
        call    do_exec
        jc      .execfail

        ; Child returned normally. Preserve the child's exit code when DOS
        ; reports one; otherwise exit 0.
        mov     ah, 4Dh
        int     21h
        mov     ah, 4Ch
        int     21h

.native:
        call    run_native_preview
        jc      .nativefail
.ok:
        mov     ax, 4C00h
        int     21h
.usage:
        mov     si, s_usage
        call    puts
        mov     ax, 4C01h
        int     21h
.nogame:
        mov     si, s_nogame
        call    puts
        mov     ax, 4C01h
        int     21h
.execfail:
        ; AX holds the DOS EXEC error code.
        mov     [execerr], ax
        mov     si, s_execfail
        call    puts
        mov     ax, [execerr]
        call    print_dec
        mov     si, s_crlf
        call    puts
        mov     ax, 4C02h
        int     21h
.badprofile:
        mov     si, s_bad_profile
        call    puts
        mov     ax, 4C03h
        int     21h
.badmenu:
        mov     si, s_bad_menu_input
        call    puts
        mov     ax, 4C01h
        int     21h
.noexec:
        mov     si, s_noexecfail
        call    puts
        mov     ax, 4C02h
        int     21h
.nativefail:
        ; Every gate in run_native_preview used to funnel into one
        ; undifferentiated string, so a failure told nobody WHICH check fired.
        ; That is why the DoK /B 35 preview failure survived two
        ; investigations. nfail_gate carries the last gate entered; print it.
        mov     si, s_nativefail
        call    puts
        mov     al, [nfail_gate]
        xor     ah, ah
        call    print_dec
        mov     si, s_crlf
        call    puts
        mov     ax, 4C03h
        int     21h

; ============================================================================
;  Command-line parse: /D or /N = dry-run, /E = native engine preview,
;  /A n = native preview area/map override, /B n = native ECL entry override,
;  /G n = graphics set (0 auto, 1 DOS, 2 Amiga, 3 C64),
;  /T [n] = headless forward-step loop with an optional step budget,
;  /0 addr value = sparse CCECL memory seed,
;  /1 n = Gen1/DQK vmRun1 far-pointer dispatch probe for the supplied cell word,
;  /2 [ticks] = headless camp entry, optionally rest bounded five-minute ticks,
;  /3 n = DQK far-pointer slot-3 event dispatch probe,
;  /7 = store persistent camp checkpoints beside GBBOOT.COM rather than in
;       the current game-data directory (for read-only mounted asset media),
;  /8 n = select one validated, fixed-width packaged title-state namespace
;       (1..13). Its three-byte prefix replaces _GB in generated sidecars.
;  /@ n = CCECL direct-entry probe at ECL virtual address n,
;  /! = yield ECL menus to CCMENU (use /C n only for a headless choice),
;  /X = snapshot/exit native preview, /J = force title intro before headless
;  exit, /? = help. Native party creation can be
;  driven with /R name class (class C/F/R/K/M/T). Native CCECL party
;  seed aliases are /I item, /F affect, /U member affect, /M move, /K thief,
;  /S spell, /V member spell, /P partyCount, /H hasRanger, /L inputValue,
;  /C menuChoice, /Y parlayChoice, /O encounterAction, /W whoChoice,
;  /Q encounterDistance, /Z partyStrength. Nonnumeric /C passes a tactical
;  command script to CCCOMBAT. /F, /P, and /Q avoid GBBOOT's
;  existing /A, /N, and /D meanings.
; ============================================================================
parse_args:
        mov     byte [secret_profile], 0
        mov     byte [secret_profile_bad], 0
        mov     byte [dryrun], 0
        mov     byte [engineflag], 0
        mov     byte [interactive_menu], 0
        mov     byte [snapflag], 0
        mov     byte [introflag], 0
        mov     byte [step_once], 0
        mov     byte [camp_once], 0
        mov     byte [mem_requested], 0
        mov     byte [checkpoint_tool_root], 0
        mov     byte [state_namespace], 0
        mov     word [step_budget], 0
        mov     byte [handler3_valid], 0
        mov     byte [handler3_pending], 0
        mov     word [handler3_descriptor], 0
        mov     byte [handler1_valid], 0
        mov     word [handler1_descriptor], 0
        mov     byte [direct_entry_valid], 0
        mov     word [direct_entry_vaddr], 0
        mov     byte [helpflag], 0
        mov     byte [area_override], 0
        mov     word [area_override_num], 0
        mov     byte [entry_override], 0
        mov     word [entry_override_num], 0
        mov     byte [graphics_requested], 0
        mov     byte [combat_cmd_valid], 0
        mov     byte [combat_cmd], 0
        mov     byte [party_create_count], 0
        mov     byte [party_create_tmp_name], 0
        mov     byte [seed_item_count], 0
        mov     byte [inventory_active], 0
        mov     byte [seed_affect_count], 0
        mov     byte [seed_member_affect_count], 0
        mov     byte [seed_move_count], 0
        mov     byte [seed_move_explicit], 0
        mov     byte [seed_thief_count], 0
        mov     byte [seed_thief_explicit], 0
        mov     byte [seed_thief_matrix_count], 0
        mov     byte [seed_spell_count], 0
        mov     byte [seed_member_spell_count], 0
        mov     byte [seed_memory_count], 0
        mov     byte [seed_count_valid], 0
        mov     byte [seed_count_explicit], 0
        mov     word [seed_count], 0
        mov     byte [seed_ranger_valid], 0
        mov     word [seed_ranger], 0
        mov     byte [seed_strength_valid], 0
        mov     byte [secret_strength_valid], 0
        mov     word [seed_strength], 0
        mov     byte [seed_input_valid], 0
        mov     word [seed_input], 0
        mov     byte [seed_menu_valid], 0
        mov     word [seed_menu], 0
        mov byte [secret_names_valid],0
        mov     word [menu_answer], 0
        mov     byte [menu_input_bad], 0
        mov     byte [seed_parlay_valid], 0
        mov     word [seed_parlay], 0
        mov     byte [seed_encounter_valid], 0
        mov     word [seed_encounter], 0
        mov     byte [seed_who_valid], 0
        mov     word [seed_who], 0
        mov     byte [seed_distance_valid], 0
        mov     word [seed_distance], 0
        movzx   cx, byte [80h]
        mov     si, 81h
.scan:
        cmp     cx, 0
        je      .done
        mov     al, [si]
        cmp     al, '/'
        je      .flag
        cmp     al, '-'
        je      .flag
        inc     si
        dec     cx
        jmp     .scan
.flag:
        cmp     cx, 2
        jb      .done
        mov     al, [si+1]
        cmp     al, '?'
        je      .sethelp
        cmp     al, '0'
        je      .setmemory
        cmp     al, '1'
        je      .sethandler1
        cmp     al, '2'
        je      .setcamp
        cmp     al, '3'
        je      .sethandler3
        cmp     al, '4'
        je      .setsavecamp
        cmp     al, '5'
        je      .setloadcamp
        cmp     al, '6'
        je      .setmemorize
        cmp     al, '7'
        je      .setsessioncheckpoint
        cmp     al, '8'
        je      .setstatenamespace
        cmp     al, '9'
        je      .setsecretprofile
        cmp     al, '@'
        je      .setdirectentry
        cmp     al, '!'
        je      .setinteractivemenu
        and     al, 0DFh
        cmp     al, 'D'
        je      .setdry
        cmp     al, 'N'
        je      .setdry
        cmp     al, 'E'
        je      .setengine
        cmp     al, 'X'
        je      .setsnap
        cmp     al, 'J'
        je      .setintro
        cmp     al, 'T'
        je      .setstep
        cmp     al, 'A'
        je      .setarea
        cmp     al, 'B'
        je      .setentry
        cmp     al, 'G'
        je      .setgraphics
        cmp     al, 'R'
        je      .setcreate
        cmp     al, 'C'
        je      .setmenu
        cmp     al, 'I'
        je      .setitem
        cmp     al, 'F'
        je      .setaffect
        cmp     al, 'U'
        je      .setmemberaffect
        cmp     al, 'M'
        je      .setmove
        cmp     al, 'K'
        je      .setthief
        cmp     al, 'S'
        je      .setspell
        cmp     al, 'V'
        je      .setmemberspell
        cmp     al, 'P'
        je      .setcount
        cmp     al, 'H'
        je      .setranger
        cmp     al, 'Z'
        je      .setstrength
        cmp     al, 'L'
        je      .setinput
        cmp     al, 'W'
        je      .setwho
        cmp     al, 'Y'
        je      .setparlay
        cmp     al, 'O'
        je      .setencounter
        cmp     al, 'Q'
        je      .setdistance
        add     si, 2
        sub     cx, 2
        jmp     .scan
.setdry:
        mov     byte [dryrun], 1
        add     si, 2
        sub     cx, 2
        jmp     .scan
.setengine:
        mov     byte [engineflag], 1
        add     si, 2
        sub     cx, 2
        jmp     .scan
.setinteractivemenu:
        mov     byte [engineflag], 1
        mov     byte [interactive_menu], 1
        add     si, 2
        sub     cx, 2
        jmp     .scan
.setsnap:
        mov     byte [snapflag], 1
        add     si, 2
        sub     cx, 2
        jmp     .scan
.setintro:
        mov     byte [introflag], 1
        add     si, 2
        sub     cx, 2
        jmp     .scan
.setstep:
        mov     byte [step_once], 1
        add     si, 2
        sub     cx, 2
        mov     word [step_budget], 16
        call    parse_opt_word
        jc      .scan
        cmp     bx, 0
        jne     .step_have_budget
        inc     bx
.step_have_budget:
        mov     [step_budget], bx
        jmp     .scan
.setsavecamp:
        mov     byte [checkpoint_save], 1
        add     si, 2
        sub     cx, 2
        jmp     .scan
.setloadcamp:
        mov     byte [checkpoint_load], 1
        mov     byte [engineflag], 1
        add     si, 2
        sub     cx, 2
        jmp     .scan
.setmemorize:
        mov     byte [camp_once], 1
        mov     byte [snapflag], 1
        mov     byte [mem_requested], 1
        mov     word [mem_member], 0FFFFh
        mov     word [mem_spell], 0FFFFh
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     [mem_member], bx
        call    parse_opt_word
        jc      .scan
        mov     [mem_spell], bx
        jmp     .scan
.setsessioncheckpoint:
        mov     byte [checkpoint_tool_root], 1
        add     si, 2
        sub     cx, 2
        jmp     .scan
.setstatenamespace:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        cmp     bx, 1
        jb      .scan
        cmp     bx, 13
        ja      .scan
        mov     [state_namespace], bl
        dec     bx
        mov     ax, bx
        shl     bx, 1
        add     bx, ax
        add     bx, state_prefix_table
        mov     ax, [bx]
        mov     [state_prefix], ax
        mov     al, [bx+2]
        mov     [state_prefix+2], al
        ; parse_opt_word left SI at the next command-tail token.  Preserve it
        ; while the three state names borrow SI as their static source.
        push    si
        mov     di, s_checkpoint_file
        mov     si, s_state_checkpoint_gbs
        call    set_state_checkpoint_name
        mov     di, s_checkpoint_temp
        mov     si, s_state_checkpoint_tmp
        call    set_state_checkpoint_name
        mov     di, s_checkpoint_backup
        mov     si, s_state_checkpoint_bak
        call    set_state_checkpoint_name
        pop     si
        jmp     .scan
.setcamp:
        mov     byte [camp_once], 1
        mov     byte [snapflag], 1
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        cmp     bx, 2880
        jbe     .rest_bound
        mov     bx, 2880
.rest_bound:
        mov     [rest_requested], bx
        jmp     .scan
.setmemory:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     [seed_member_tmp], bx
        call    parse_opt_word
        jc      .scan
        mov     ax, bx
        mov     bx, [seed_member_tmp]
        call    add_seed_memory
        jmp     .scan
.sethandler1:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     byte [handler1_valid], 1
        mov     [handler1_descriptor], bx
        jmp     .scan
.sethandler3:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     byte [handler3_valid], 1
        mov     [handler3_descriptor], bx
        jmp     .scan
.setdirectentry:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        or      bx, bx
        jz      .scan
        mov     byte [direct_entry_valid], 1
        mov     [direct_entry_vaddr], bx
        jmp     .scan
.setarea:
        add     si, 2
        sub     cx, 2
.askip:
        cmp     cx, 0
        jne     .askip_have
        jmp     .scan
.askip_have:
        cmp     byte [si], ' '
        jne     .anum_start
        inc     si
        dec     cx
        jmp     .askip
.anum_start:
        xor     bx, bx
.anum:
        jcxz    .anum_done
        mov     al, [si]
        cmp     al, '0'
        jb      .anum_done
        cmp     al, '9'
        ja      .anum_done
        sub     al, '0'
        movzx   ax, al
        push    ax
        mov     ax, bx
        mov     dx, 10
        mul     dx
        mov     bx, ax
        pop     ax
        add     bx, ax
        inc     si
        dec     cx
        jmp     .anum
.anum_done:
        or      bx, bx
        jz      .scan
        mov     byte [area_override], 1
        mov     [area_override_num], bx
        jmp     .scan
.setentry:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        or      bx, bx
        jz      .scan
        mov     byte [entry_override], 1
        mov     [entry_override_num], bx
        jmp     .scan
.setgraphics:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        cmp     bx, 3
        ja      .scan
        mov     [graphics_requested], bl
        jmp     .scan
.setcreate:
        add     si, 2
        sub     cx, 2
.rskip_name:
        cmp     cx, 0
        je      .scan
        cmp     byte [si], ' '
        jne     .rname
        inc     si
        dec     cx
        jmp     .rskip_name
.rname:
        mov     di, party_create_tmp_name
        xor     bx, bx
.rname_loop:
        cmp     cx, 0
        je      .scan
        mov     al, [si]
        cmp     al, ' '
        je      .rname_done
        cmp     al, 0Dh
        je      .scan
        cmp     bx, 15
        jae     .rname_advance
        mov     [di], al
        inc     di
        inc     bx
.rname_advance:
        inc     si
        dec     cx
        jmp     .rname_loop
.rname_done:
        or      bx, bx
        jz      .scan
        mov     byte [di], 0
.rskip_class:
        cmp     cx, 0
        je      .scan
        cmp     byte [si], ' '
        jne     .rclass
        inc     si
        dec     cx
        jmp     .rskip_class
.rclass:
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'C'
        je      .rclass_ok
        cmp     al, 'F'
        je      .rclass_ok
        cmp     al, 'R'
        je      .rclass_ok
        cmp     al, 'K'
        je      .rclass_ok
        cmp     al, 'M'
        je      .rclass_ok
        cmp     al, 'T'
        jne     .scan
.rclass_ok:
        mov     dl, al
        cmp     byte [party_create_count], PARTY_CREATE_MAX
        jae     .rclass_advance
        push    si
        push    cx
        movzx   bx, byte [party_create_count]
        mov     ax, bx
        shl     ax, 4
        mov     di, party_create_names
        add     di, ax
        mov     si, party_create_tmp_name
        mov     cx, 16
        rep     movsb
        movzx   bx, byte [party_create_count]
        mov     [party_create_classes+bx], dl
        inc     byte [party_create_count]
        pop     cx
        pop     si
.rclass_advance:
        cmp     cx, 0
        je      .scan
        cmp     byte [si], ' '
        je      .scan
        inc     si
        dec     cx
        jmp     .rclass_advance
.setmenu:
        add     si, 2
        sub     cx, 2
        call    parse_menu_word
        jnc     .menu_number
        cmp     byte [menu_input_bad], 0
        jne     .scan
        jmp     .setcombatcmd
.menu_number:
        mov     [menu_answer], bx
        and     bx, 00ffh
        mov     byte [seed_menu_valid], 1
        mov     [seed_menu], bx
        jmp     .scan
.setcombatcmd:
        call    parse_combat_cmd_token
        jmp     .scan
.setitem:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     ax, bx
        call    add_seed_item
        jmp     .scan
.setaffect:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     ax, bx
        call    add_seed_affect
        jmp     .scan
.setmemberaffect:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     [seed_member_tmp], bx
        call    parse_opt_word
        jc      .scan
        mov     ax, bx
        mov     bx, [seed_member_tmp]
        call    add_seed_member_affect
        jmp     .scan
.setmove:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     ax, bx
        call    add_seed_move
        mov     byte [seed_move_explicit], 1
        jmp     .scan
.setthief:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     ax, bx
        call    add_seed_thief
        mov     byte [seed_thief_explicit], 1
        jmp     .scan
.setspell:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     ax, bx
        call    add_seed_spell
        jmp     .scan
.setmemberspell:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     [seed_member_tmp], bx
        call    parse_opt_word
        jc      .scan
        mov     ax, bx
        mov     bx, [seed_member_tmp]
        call    add_seed_member_spell
        jmp     .scan
.setcount:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     byte [seed_count_valid], 1
        mov     byte [seed_count_explicit], 1
        mov     [seed_count], bx
        jmp     .scan
.setranger:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     byte [seed_ranger_valid], 1
        mov     [seed_ranger], bx
        jmp     .scan
.setstrength:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     byte [seed_strength_valid], 1
        mov     [seed_strength], bx
        jmp     .scan
.setinput:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     byte [seed_input_valid], 1
        mov     [seed_input], bx
        jmp     .scan
.setwho:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        and     bx, 00ffh
        mov     byte [seed_who_valid], 1
        mov     [seed_who], bx
        jmp     .scan
.setparlay:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        and     bx, 00ffh
        mov     byte [seed_parlay_valid], 1
        mov     [seed_parlay], bx
        jmp     .scan
.setencounter:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        and     bx, 00ffh
        mov     byte [seed_encounter_valid], 1
        mov     [seed_encounter], bx
        jmp     .scan
.setdistance:
        add     si, 2
        sub     cx, 2
        call    parse_opt_word
        jc      .scan
        mov     byte [seed_distance_valid], 1
        mov     [seed_distance], bx
        jmp     .scan
.setsecretprofile:
        cmp     byte [secret_profile], 0
        jne     .profile_bad
        add     si, 2
        sub     cx, 2
.profile_space:
        jcxz    .profile_bad
        cmp     byte [si], ' '
        jne     .profile_value
        inc     si
        dec     cx
        jmp     .profile_space
.profile_value:
        cmp     byte [si], '1'
        jne     .profile_bad
        inc     si
        dec     cx
        jcxz    .profile_set
        cmp     byte [si], ' '
        jne     .profile_bad
.profile_set:
        mov     byte [secret_profile], 1
        jmp     .scan
.profile_bad:
        mov     byte [secret_profile_bad], 1
        ret
.sethelp:
        mov     byte [helpflag], 1
.done:
        ret

; /C has two contracts: a checked full-word CCMENU answer and the existing
; byte CCECL seed, or a symbolic combat tape. Numeric errors never become tapes.
; CF=1 without menu_input_bad means symbolic; SI/CX still point at that token.
parse_menu_word:
        push    ax
        push    dx
.skip:
        jcxz    .bad
        cmp     byte [si], ' '
        jne     .first
        inc     si
        dec     cx
        jmp     .skip
.first:
        mov     al, [si]
        cmp     al, '+'
        je      .bad
        cmp     al, '-'
        je      .bad
        cmp     al, '/'
        je      .bad
        cmp     al, 13
        je      .bad
        cmp     al, '0'
        jb      .symbolic
        cmp     al, '9'
        ja      .symbolic
        xor     bx, bx
.digit:
        mov     al, [si]
        sub     al, '0'
        xor     ah, ah
        push    ax
        mov     ax, bx
        mov     dx, 10
        mul     dx
        test    dx, dx
        jnz     .overflow
        mov     bx, ax
        pop     ax
        add     bx, ax
        jc      .bad
        inc     si
        dec     cx
        jcxz    .done
        mov     al, [si]
        cmp     al, '0'
        jb      .boundary
        cmp     al, '9'
        jbe     .digit
.boundary:
        cmp     al, ' '
        je      .done
        cmp     al, 13
        je      .done
        cmp     al, '/'
        je      .done
        jmp     .bad
.overflow:
        pop     ax
.bad:
        mov     byte [menu_input_bad], 1
.symbolic:
        stc
        jmp     .ret
.done:
        clc
.ret:
        pop     dx
        pop     ax
        ret

parse_opt_word:                         ; SI/CX after flag, returns BX=value
        push    ax                      ; CF=0 when at least one digit parsed
        push    dx
        push    bp
.skip:
        cmp     cx, 0
        je      .nodigits
        cmp     byte [si], ' '
        jne     .start
        inc     si
        dec     cx
        jmp     .skip
.start:
        xor     bx, bx
        xor     bp, bp
.digits:
        cmp     cx, 0
        je      .done
        mov     al, [si]
        cmp     al, '0'
        jb      .done
        cmp     al, '9'
        ja      .done
        sub     al, '0'
        mov     ah, 0
        push    ax
        mov     ax, bx
        mov     dx, 10
        mul     dx
        mov     bx, ax
        pop     ax
        add     bx, ax
        inc     bp
        inc     si
        dec     cx
        jmp     .digits
.done:
        cmp     bp, 0
        je      .nodigits
        clc
        jmp     .ret
.nodigits:
        stc
.ret:
        pop     bp
        pop     dx
        pop     ax
        ret

parse_combat_cmd_token:                 ; SI/CX at nonnumeric /C argument
        push    ax
        push    bx
        push    di
.skip:
        cmp     cx, 0
        je      .done
        cmp     byte [si], ' '
        jne     .start
        inc     si
        dec     cx
        jmp     .skip
.start:
        mov     di, combat_cmd
        xor     bx, bx
.loop:
        cmp     cx, 0
        je      .term
        mov     al, [si]
        cmp     al, ' '
        je      .term
        cmp     al, 0Dh
        je      .term
        cmp     bx, 31
        jae     .advance
        mov     [di], al
        inc     di
        inc     bx
.advance:
        inc     si
        dec     cx
        jmp     .loop
.term:
        mov     byte [di], 0
        cmp     bx, 0
        je      .done
        mov     byte [combat_cmd_valid], 1
.done:
        pop     di
        pop     bx
        pop     ax
        ret

; ============================================================================
;  Detection. Returns CF=0 on match with profile pointers populated.
; ============================================================================
detect_game:
        call    maybe_enter_nested_game_dir

        ; DQK and the project's generated CoK/DoK-on-DQK builds keep the same
        ; DQK.EXE + DISK1/2/3 HLIB layout.
        mov     dx, f_dqk_exe
        call    file_exists
        jc      .check_dqk_data
        mov     dx, f_disk3_ecl
        call    file_exists
        jc      .check_dqk_flat
        mov     dx, f_disk3_geo
        call    file_exists
        jc      .check_dqk_flat
        mov     si, game_dqk
        mov     di, eng_hlib
        mov     bx, f_dqk_exe
        mov     dx, args_dqk
        mov     bp, note_dqk
        call    set_profile
        mov     word [geop], f_disk3_geo
        mov     word [mapid], 1
        mov     word [eclp], f_disk3_ecl
        mov     word [eclid], 1
        clc
        ret
.check_dqk_flat:
        ; Flat HLIB build fallback: DQK.EXE beside ECL.GLB/GEO.GLB.
        mov     dx, f_ecl_glb
        call    file_exists
        jc      .check_cok
        mov     dx, f_geo_glb
        call    file_exists
        jc      .check_cok
        mov     si, game_dqk
        mov     di, eng_hlib
        mov     bx, f_dqk_exe
        mov     dx, args_dqk
        mov     bp, note_dqk
        call    set_profile
        mov     word [geop], f_geo_glb
        mov     word [mapid], 1
        mov     word [eclp], f_ecl_glb
        mov     word [eclid], 1
        clc
        ret

.check_dqk_data:
        ; Original disk-layout data-only DQK dumps can run the native ECL/GEO
        ; preview without an original DQK.EXE.
        mov     dx, f_disk3_ecl
        call    file_exists
        jc      .check_dqk_data_flat
        mov     dx, f_disk3_geo
        call    file_exists
        jc      .check_dqk_data_flat
        mov     si, game_dqk
        mov     di, eng_hlib
        xor     bx, bx
        mov     dx, args_none
        mov     bp, note_dqk_data
        call    set_profile
        mov     word [geop], f_disk3_geo
        mov     word [mapid], 1
        mov     word [eclp], f_disk3_ecl
        mov     word [eclid], 1
        clc
        ret
.check_dqk_data_flat:
        ; Flat data-only HLIB/GLIB dumps can pair ECL.GLB and GEO.GLB through
        ; the native Gen2 bridge without assuming the content is DQK.
        mov     dx, f_ecl_glb
        call    file_exists
        jc      .check_cok
        mov     dx, f_geo_glb
        call    file_exists
        jc      .check_cok
        mov     si, game_hlib_data
        mov     di, eng_hlib
        xor     bx, bx
        mov     dx, args_none
        mov     bp, note_hlib_data
        call    set_profile
        mov     word [geop], f_geo_glb
        mov     word [mapid], 1
        mov     word [eclp], f_ecl_glb
        mov     word [eclid], 1
        clc
        ret

.check_cok:
        mov     dx, f_start_exe
        call    file_exists
        jc      .check_cok_data
        mov     dx, f_krynn_cfg
        call    file_exists
        jc      .check_dok
        mov     dx, f_ecl1_dax
        call    file_exists
        jc      .check_dok
        mov     dx, f_geo1_dax
        call    file_exists
        jc      .check_dok
        mov     si, game_cok
        mov     di, eng_dax_gen1
        mov     bx, f_start_exe
        mov     dx, args_none
        mov     bp, note_cok
        call    set_profile
        mov     word [geop], f_geo1_dax
        mov     word [mapid], 34
        mov     word [eclp], f_ecl1_dax
        mov     word [eclid], 34
        clc
        ret
.check_cok_data:
        mov     dx, f_krynn_cfg
        call    file_exists
        jc      .check_dok
        mov     dx, f_ecl1_dax
        call    file_exists
        jc      .check_dok
        mov     dx, f_geo1_dax
        call    file_exists
        jc      .check_dok
        mov     si, game_cok
        mov     di, eng_dax_gen1
        xor     bx, bx
        mov     dx, args_none
        mov     bp, note_cok_data
        call    set_profile
        mov     word [geop], f_geo1_dax
        mov     word [mapid], 34
        mov     word [eclp], f_ecl1_dax
        mov     word [eclid], 34
        clc
        ret

.check_dok:
        mov     dx, f_start_exe
        call    file_exists
        jc      .check_dok_data
        mov     dx, f_dkk_cfg
        call    file_exists
        jc      .check_pool
        mov     dx, f_ecl1_dax
        call    file_exists
        jc      .check_pool
        mov     dx, f_geo1_dax
        call    file_exists
        jc      .check_pool
        mov     si, game_dok
        mov     di, eng_dax_gen1
        mov     bx, f_start_exe
        mov     dx, args_none
        mov     bp, note_dok
        call    set_profile
        mov     word [geop], f_geo1_dax
        mov     word [mapid], 34
        mov     word [eclp], f_ecl1_dax
        mov     word [eclid], 34
        clc
        ret
.check_dok_data:
        mov     dx, f_dkk_cfg
        call    file_exists
        jc      .check_pool
        mov     dx, f_ecl1_dax
        call    file_exists
        jc      .check_pool
        mov     dx, f_geo1_dax
        call    file_exists
        jc      .check_pool
        mov     si, game_dok
        mov     di, eng_dax_gen1
        xor     bx, bx
        mov     dx, args_none
        mov     bp, note_dok_data
        call    set_profile
        mov     word [geop], f_geo1_dax
        mov     word [mapid], 34
        mov     word [eclp], f_ecl1_dax
        mov     word [eclid], 34
        clc
        ret

.check_pool:
        mov     dx, f_start_exe
        call    file_exists
        jc      .check_curse_data
        mov     dx, f_pool_cfg
        call    file_exists
        jc      .check_curse
        mov     si, game_pool
        mov     di, eng_dax_gen1
        mov     bx, f_start_exe
        mov     dx, args_none
        mov     bp, note_pool
        call    set_profile
        call    maybe_broad_gen1_ecl_preview
        clc
        ret

.check_curse:
        mov     dx, f_start_exe
        call    file_exists
        jc      .check_treasures
        mov     dx, f_curse_cfg
        call    file_exists
        jc      .check_secret
        mov     si, game_curse
        mov     di, eng_dax_gen1
        mov     bx, f_start_exe
        mov     dx, args_none
        mov     bp, note_curse
        call    set_profile
        mov     dx, f_geo2_dax
        call    file_exists
        jc      .curse_no_preview
        mov     word [geop], f_geo2_dax
        mov     word [mapid], 1
        mov     dx, f_ecl2_dax
        call    file_exists
        jc      .curse_no_preview
        mov     word [eclp], f_ecl2_dax
        mov     word [eclid], 1
.curse_no_preview:
        clc
        ret

.check_curse_data:
        ; Data-only Curse/CoAB dumps have no START.EXE/CURSE.CFG, but can still
        ; drive the native ECL2/GEO2 preview directly.
        mov     dx, f_ecl1_dax
        call    file_exists
        jc      .check_treasures
        mov     dx, f_ecl2_dax
        call    file_exists
        jc      .check_treasures
        mov     dx, f_geo2_dax
        call    file_exists
        jc      .check_treasures
        mov     dx, f_8x8d1_dax
        call    file_exists
        jc      .check_treasures
        mov     dx, f_8x8d2_dax
        call    file_exists
        jc      .check_treasures
        mov     dx, f_walldef2_dax
        call    file_exists
        jc      .check_treasures
        mov     si, game_curse
        mov     di, eng_dax_gen1
        xor     bx, bx
        mov     dx, args_none
        mov     bp, note_curse_data
        call    set_profile
        mov     word [geop], f_geo2_dax
        mov     word [mapid], 1
        mov     word [eclp], f_ecl2_dax
        mov     word [eclid], 1
        clc
        ret

.check_secret:
        mov     dx, f_start_exe
        call    file_exists
        jc      .check_treasures
        mov     dx, f_blades_cfg
        call    file_exists
        jc      .check_treasures
        mov     si, game_secret
        mov     di, eng_dax_gen1
        mov     bx, f_start_exe
        mov     dx, args_none
        mov     bp, note_secret
        call    set_profile
        call    maybe_broad_gen1_ecl_preview
        clc
        ret

.check_treasures:
        mov     dx, f_zounds_dax
        call    file_exists
        jc      .check_pod
        mov     dx, f_treasure_cfg
        call    file_exists
        jc      .check_pod
        mov     dx, f_game_exe
        call    file_exists
        jc      .check_pod
        mov     si, game_treasures
        mov     di, eng_dax_gen1
        mov     bx, f_game_exe
        mov     dx, args_none
        mov     bp, note_treasures
        call    set_profile
        call    maybe_broad_gen1_ecl_preview
        clc
        ret

.check_pod:
        mov     dx, f_pool4_cfg
        call    file_exists
        jc      .check_nwn
        mov     dx, f_game_exe
        call    file_exists
        jc      .check_nwn
        mov     dx, f_game_ovr
        call    file_exists
        jc      .check_nwn
        mov     si, game_pod
        mov     di, eng_dax_gen1
        mov     bx, f_game_exe
        mov     dx, args_none
        mov     bp, note_pod
        call    set_profile
        call    maybe_broad_gen1_ecl_preview
        clc
        ret

.check_nwn:
        mov     dx, f_game_cfg
        call    file_exists
        jc      .check_gateway
        mov     dx, f_game_exe
        call    file_exists
        jc      .check_gateway
        mov     dx, f_game_ovr
        call    file_exists
        jc      .check_gateway
        mov     dx, f_ecl0_dax
        call    file_exists
        jc      .check_gateway
        mov     dx, f_geo0_dax
        call    file_exists
        jc      .check_gateway
        mov     si, game_nwn
        mov     di, eng_dax_gen1
        mov     bx, f_game_exe
        mov     dx, args_none
        mov     bp, note_nwn
        call    set_profile
        mov     word [geop], f_geo0_dax
        mov     word [mapid], 1
        mov     word [eclp], f_ecl0_dax
        mov     word [eclid], 1
        clc
        ret

.check_gateway:
        mov     dx, f_zounds_dax
        call    file_exists
        jc      .check_buck
        mov     dx, f_game_cfg
        call    file_exists
        jc      .check_buck
        mov     dx, f_game_exe
        call    file_exists
        jc      .check_buck
        mov     si, game_gateway
        mov     di, eng_dax_gen1
        mov     bx, f_game_exe
        mov     dx, args_gateway
        mov     bp, note_gateway
        call    set_profile
        call    maybe_broad_gen1_ecl_preview
        clc
        ret

.check_buck:
        mov     dx, f_buck1_exe
        call    file_exists
        jc      .check_buck_data
        mov     dx, f_buck2_exe
        call    file_exists
        jc      .check_buck_data
        mov     dx, f_buck3_exe
        call    file_exists
        jc      .check_buck_data
        mov     si, game_buck
        mov     di, eng_dax_gen1
        mov     bx, f_buck1_exe
        mov     dx, args_none
        mov     bp, note_buck
        call    set_profile
        call    maybe_broad_gen1_ecl_preview
        clc
        ret
.check_buck_data:
        ; Matrix Cubed ships MON0CHA/WALLDEF1 too: its MATRIX.CFG marker must win
        ; before the Countdown data-only test below, or it boots as Countdown.
        mov     dx, f_matrix_cfg
        call    file_exists
        jnc     .check_matrix
        mov     dx, f_ecl1_dax
        call    file_exists
        jc      .check_matrix
        mov     dx, f_geo1_dax
        call    file_exists
        jc      .check_matrix
        mov     dx, f_walldef1_dax
        call    file_exists
        jc      .check_matrix
        mov     dx, f_mon0cha_dax
        call    file_exists
        jc      .check_matrix
        mov     si, game_buck
        mov     di, eng_dax_gen1
        xor     bx, bx
        mov     dx, args_none
        mov     bp, note_buck_data
        call    set_profile
        call    maybe_broad_gen1_ecl_preview
        clc
        ret

.check_matrix:
        mov     dx, f_start_exe
        call    file_exists
        jc      .check_broad_gen1_data
        mov     dx, f_matrix_cfg
        call    file_exists
        jc      .check_broad_gen1_data
        mov     si, game_matrix
        mov     di, eng_dax_gen1
        mov     bx, f_start_exe
        mov     dx, args_none
        mov     bp, note_matrix
        call    set_profile
        call    maybe_broad_gen1_ecl_preview
        clc
        ret

.check_broad_gen1_data:
        ; Preserve the game name for executable-less broader Gen1 data folders
        ; when their profile marker is present and at least one GEO archive can
        ; drive the native /E raw-map path.
        mov     dx, f_curse_cfg
        call    file_exists
        jc      .bdata_pool
        mov     si, game_curse
        mov     bp, note_broad_data
        call    set_broad_data_profile
        jnc     .bdata_found
.bdata_pool:
        mov     dx, f_pool_cfg
        call    file_exists
        jc      .bdata_secret
        mov     si, game_pool
        mov     bp, note_broad_data
        call    set_broad_data_profile
        jnc     .bdata_found
.bdata_secret:
        mov     dx, f_blades_cfg
        call    file_exists
        jc      .bdata_treasures
        mov     si, game_secret
        mov     bp, note_broad_data
        call    set_broad_data_profile
        jnc     .bdata_found
.bdata_treasures:
        mov     dx, f_treasure_cfg
        call    file_exists
        jc      .bdata_pod
        mov     dx, f_zounds_dax
        call    file_exists
        jc      .bdata_pod
        mov     si, game_treasures
        mov     bp, note_broad_data
        call    set_broad_data_profile
        jnc     .bdata_found
.bdata_pod:
        mov     dx, f_pool4_cfg
        call    file_exists
        jc      .bdata_gateway
        mov     si, game_pod
        mov     bp, note_broad_data
        call    set_broad_data_profile
        jnc     .bdata_found
.bdata_gateway:
        mov     dx, f_game_cfg
        call    file_exists
        jc      .bdata_nwn
        mov     dx, f_zounds_dax
        call    file_exists
        jc      .bdata_nwn
        mov     si, game_gateway
        mov     bp, note_broad_data
        call    set_broad_data_profile
        jnc     .bdata_found
.bdata_nwn:
        mov     dx, f_game_cfg
        call    file_exists
        jc      .bdata_matrix
        mov     dx, f_game_ovr
        call    file_exists
        jc      .bdata_matrix
        mov     dx, f_ecl0_dax
        call    file_exists
        jc      .bdata_matrix
        mov     dx, f_geo0_dax
        call    file_exists
        jc      .bdata_matrix
        mov     si, game_nwn
        mov     di, eng_dax_gen1
        mov     bx, 0
        mov     dx, args_none
        mov     bp, note_nwn_data
        call    set_profile
        mov     word [geop], f_geo0_dax
        mov     word [mapid], 1
        mov     word [eclp], f_ecl0_dax
        mov     word [eclid], 1
        clc
        ret
.bdata_matrix:
        mov     dx, f_matrix_cfg
        call    file_exists
        jc      .check_generic_gen1
        mov     si, game_matrix
        mov     bp, note_broad_data
        call    set_broad_data_profile
        jnc     .bdata_found
        jmp     .check_generic_gen1
.bdata_found:
        clc
        ret

.check_generic_gen1:
        mov     dx, f_start_exe
        call    file_exists
        jc      .check_gen1_data
        mov     dx, f_any_dax
        call    find_exists
        jc      .check_gen1_data
        mov     si, game_gen1
        mov     di, eng_dax_gen1
        mov     bx, f_start_exe
        mov     dx, args_none
        mov     bp, note_gen1
        call    set_profile
        call    maybe_geo_preview
        clc
        ret

.check_gen1_data:
        ; Generic extracted DAX data dumps have no executable/cfg marker, but a
        ; GEO archive alone is enough for the native raw-map preview path.
        mov     si, game_gen1
        mov     di, eng_dax_gen1
        xor     bx, bx
        mov     dx, args_none
        mov     bp, note_gen1_data
        call    set_profile
        call    find_geo_preview
        jc      .check_frua
        clc
        ret

.check_frua:
        mov     dx, f_ckit_exe
        call    file_exists
        jc      .check_hlib_data
        mov     dx, f_script_glb
        call    file_exists
        jc      .check_frua_disk3
        mov     si, game_frua
        mov     di, eng_hlib
        mov     bx, f_ckit_exe
        mov     dx, args_none
        mov     bp, note_frua
        call    set_profile
        mov     dx, f_geo_glb
        call    file_exists
        jc      .frua_no_preview
        mov     word [geop], f_geo_glb
        mov     word [mapid], 0
.frua_no_preview:
        clc
        ret
.check_frua_disk3:
        ; The installed retail FRUA release keeps its playable data in DISK3,
        ; not beside CKIT.EXE. SCRIPT.GLB there is FRUA's event-page library,
        ; and GEO.GLB's FORM/AMOD members are not the DQK raw GEO shape. Detect
        ; the client faithfully, but do not route either through CCECL/CCGEO
        ; until the separate FRUA formats are decoded.
        mov     dx, f_disk3_geo
        call    file_exists
        jc      .check_hlib_data
        mov     si, game_frua
        mov     di, eng_hlib
        mov     bx, f_ckit_exe
        mov     dx, args_none
        mov     bp, note_frua
        call    set_profile
        clc
        ret
.check_hlib_data:
        ; Generic extracted HLIB/GLB map dumps have no executable marker, but
        ; GEO.GLB alone is enough for the native raw-map preview path.
        mov     dx, f_geo_glb
        call    file_exists
        jc      .none
        mov     si, game_hlib_data
        mov     di, eng_hlib
        xor     bx, bx
        mov     dx, args_none
        mov     bp, note_hlib_data
        call    set_profile
        mov     word [geop], f_geo_glb
        mov     word [mapid], 0
        clc
        ret
.none:
        stc
        ret

apply_area_override:
        cmp     byte [engineflag], 0
        je      .ret
        cmp     byte [area_override], 0
        je      .ret
        mov     ax, [area_override_num]
        or      ax, ax
        jz      .ret
        cmp     word [enginep], eng_hlib
        je      .hlib
        cmp     word [gamep], game_cok
        je      .krynn_gen1
        cmp     word [gamep], game_dok
        je      .krynn_gen1
        cmp     word [gamep], game_curse
        je      .curse_gen1
        cmp     word [gamep], game_nwn
        je      .nwn_gen1
        ; Gen1 DAX override: force a raw GEOn.DAX map preview.  The ECL entry
        ; blocks for broader games are not known uniformly, so /A alone does
        ; not guess; a separate /B entry override can opt into ECLn.DAX.
        cmp     ax, 1
        jb      .ret
        cmp     ax, 8
        ja      .ret
        dec     ax
        shl     ax, 1
        mov     bx, ax
        mov     dx, [geo_probe_table+bx]
        push    bx
        call    file_exists
        pop     bx
        jc      .gen1_missing
        mov     ax, [geo_probe_table+bx]
        mov     [geop], ax
        mov     word [mapid], 0
        mov     word [eclp], 0
        mov     word [eclid], 0
        ret
.gen1_missing:
        mov     word [geop], 0
        mov     word [mapid], 0
        mov     word [eclp], 0
        mov     word [eclid], 0
        ret
.krynn_gen1:
        ; CoK/DoK area archive startup blocks are verified from the real local
        ; ECL DAX TOCs: area 1 -> 34, area 2 -> 48, area 3 -> 80. Keep this
        ; scoped to the Krynn profiles; broader Gen1 games still use raw-map
        ; preview until their startup ECL entries are proven or supplied with /B.
        cmp     ax, 1
        jb      .gen1_missing
        cmp     ax, 3
        ja      .gen1_missing
        dec     ax
        shl     ax, 1
        mov     bx, ax
        mov     dx, [krynn_geo_table+bx]
        push    bx
        call    file_exists
        pop     bx
        jc      .gen1_missing
        mov     dx, [krynn_ecl_table+bx]
        push    bx
        call    file_exists
        pop     bx
        jc      .gen1_missing
        mov     ax, [krynn_geo_table+bx]
        mov     [geop], ax
        mov     ax, [krynn_ecl_table+bx]
        mov     [eclp], ax
        mov     ax, [krynn_entry_table+bx]
        mov     [eclid], ax
        mov     [mapid], ax
        ret
.nwn_gen1:
        ; The AOL Neverwinter Nights dump starts at ECL0/GEO0, but numbered
        ; travel areas observed in the local archive use ECL1/GEO1 -> entry 10,
        ; ECL2/GEO2 -> 20, and ECL3/GEO3 -> 30. ECL7 has no matching GEO7 in
        ; the inspected archive; /A 7 is a script-only combat entry seeded from
        ; the AOL host state and rendered through the GEO0 fallback.
        cmp     ax, 7
        je      .nwn_ecl7
        cmp     ax, 1
        jb      .gen1_missing
        cmp     ax, 3
        ja      .gen1_missing
        dec     ax
        shl     ax, 1
        mov     bx, ax
        mov     dx, [nwn_geo_table+bx]
        push    bx
        call    file_exists
        pop     bx
        jc      .gen1_missing
        mov     dx, [nwn_ecl_table+bx]
        push    bx
        call    file_exists
        pop     bx
        jc      .gen1_missing
        mov     ax, [nwn_geo_table+bx]
        mov     [geop], ax
        mov     ax, [nwn_ecl_table+bx]
        mov     [eclp], ax
        mov     ax, [nwn_entry_table+bx]
        mov     [eclid], ax
        mov     [mapid], ax
        ret
.nwn_ecl7:
        mov     dx, f_geo0_dax
        call    file_exists
        jc      .gen1_missing
        mov     dx, f_ecl7_dax
        call    file_exists
        jc      .gen1_missing
        mov     word [geop], f_geo0_dax
        mov     word [eclp], f_ecl7_dax
        mov     word [eclid], 79
        mov     word [mapid], 79
        ret
.curse_gen1:
        ; COAB chapter archives use sparse block ids.  The forced preview uses
        ; the first verified block in each archive that emits LOAD_FILES for
        ; that chapter (area 5 skips setup block 48 and starts at 49). Area 1
        ; has no GEO1.DAX in the extracted data and remains unavailable here.
        cmp     ax, 2
        jb      .gen1_missing
        cmp     ax, 6
        ja      .gen1_missing
        sub     ax, 2
        shl     ax, 1
        mov     bx, ax
        mov     dx, [curse_geo_table+bx]
        push    bx
        call    file_exists
        pop     bx
        jc      .gen1_missing
        mov     dx, [curse_ecl_table+bx]
        push    bx
        call    file_exists
        pop     bx
        jc      .gen1_missing
        mov     ax, [curse_geo_table+bx]
        mov     [geop], ax
        mov     ax, [curse_ecl_table+bx]
        mov     [eclp], ax
        mov     ax, [curse_entry_table+bx]
        mov     [eclid], ax
        mov     [mapid], ax
        ret
.hlib:
        cmp     word [eclp], 0
        je      .hlib_raw
        mov     ax, [area_override_num]
        mov     [eclid], ax
        mov     [mapid], ax
        ret
.hlib_raw:
        cmp     word [geop], 0
        je      .ret
        mov     ax, [area_override_num]
        mov     [mapid], ax
.ret:
        ret

apply_entry_override:
        cmp     byte [engineflag], 0
        je      .ret
        cmp     byte [entry_override], 0
        je      .ret
        cmp     word [enginep], eng_hlib
        je      .hlib
        cmp     word [enginep], eng_dax_gen1
        jne     .ret
        cmp     word [gamep], game_nwn
        je      .nwn
        mov     ax, 1
        cmp     byte [area_override], 0
        je      .have_area
        mov     ax, [area_override_num]
.have_area:
        cmp     ax, 1
        jb      .missing
        cmp     ax, 8
        ja      .missing
        dec     ax
        shl     ax, 1
        mov     bx, ax
        mov     dx, [geo_probe_table+bx]
        push    bx
        call    file_exists
        pop     bx
        jc      .missing
        mov     dx, [ecl_probe_table+bx]
        push    bx
        call    file_exists
        pop     bx
        jc      .missing
        mov     ax, [geo_probe_table+bx]
        mov     [geop], ax
        mov     ax, [ecl_probe_table+bx]
        mov     [eclp], ax
        mov     ax, [entry_override_num]
        mov     [eclid], ax
        mov     [mapid], ax
        ret
.nwn:
        cmp     word [eclp], 0
        je      .missing
        cmp     word [geop], 0
        je      .missing
        mov     ax, [entry_override_num]
        mov     [eclid], ax
        mov     [mapid], ax
        ret
.hlib:
        cmp     word [eclp], 0
        je      .hlib_try_frua_script
        mov     ax, [entry_override_num]
        mov     [eclid], ax
        mov     [mapid], ax
        ret
.hlib_try_frua_script:
        cmp     word [gamep], game_frua
        jne     .ret
        cmp     word [geop], 0
        je      .missing
        mov     dx, f_script_glb
        call    file_exists
        jc      .missing
        mov     word [eclp], f_script_glb
        mov     ax, [entry_override_num]
        mov     [eclid], ax
        mov     [mapid], ax
        ret
.missing:
        mov     word [geop], 0
        mov     word [eclp], 0
        mov     word [mapid], 0
        mov     word [eclid], 0
.ret:
        ret

set_profile:
        mov     [gamep], si
        mov     [enginep], di
        mov     [exep], bx
        mov     [argsp], dx
        mov     [notep], bp
        mov     word [geop], 0
        mov     word [mapid], 0
        mov     word [eclp], 0
        mov     word [eclid], 0
        ret

set_broad_data_profile:
        mov     di, eng_dax_gen1
        xor     bx, bx
        mov     dx, args_none
        call    set_profile
        call    maybe_broad_gen1_ecl_preview
        cmp     word [geop], 0
        jne     .ok
        stc
        ret
.ok:
        clc
        ret

maybe_geo_preview:
        call    find_geo_preview
        ret

maybe_broad_gen1_ecl_preview:
        ; Pool/Secret/Gateway/Treasures/POD/Buck/Matrix share the verified
        ; area-1 smoke entry used by the explicit "/B 34" path. Promote that
        ; only when both ECL1 and GEO1 are present; otherwise keep raw-map
        ; preview fallback for partial installs and data-only map dumps.
        ; Gateway DOS ships ECL2..6/GEO2..6 only: its real start is ECL2
        ; block 1 (LOAD_FILES -> GEO2 block 1).
        cmp     word [gamep], game_gateway
        jne     .not_gateway
        mov     dx, f_ecl1_dax
        call    file_exists
        jnc     .not_gateway
        mov     dx, f_ecl2_dax
        call    file_exists
        jc      .not_gateway
        mov     dx, f_geo2_dax
        call    file_exists
        jc      .not_gateway
        mov     word [geop], f_geo2_dax
        mov     word [eclp], f_ecl2_dax
        mov     word [mapid], 1
        mov     word [eclid], 1
        clc
        ret
.not_gateway:
        mov     dx, f_ecl1_dax
        call    file_exists
        jc      maybe_geo_preview
        mov     dx, f_geo1_dax
        call    file_exists
        jc      maybe_geo_preview
        mov     word [geop], f_geo1_dax
        mov     word [eclp], f_ecl1_dax
        cmp     word [gamep], game_matrix
        jne     .not_matrix
        ; Matrix Cubed's real new-game start is ECL1 block 16 -> NEWECL 19 ->
        ; GEO1 block 17 (matrix-start-route.md); synthetic fixtures without
        ; block 16 keep the shared entry-34 smoke start.
        mov     dx, f_ecl1_dax
        mov     al, 16
        call    dax_has_block
        jc      .not_matrix
        mov     word [mapid], 17
        mov     word [eclid], 16
        clc
        ret
.not_matrix:
        ; Pools of Darkness (ECL1 block 18) and Treasures of the Savage
        ; Frontier (block 20) start at their real init blocks; the GEO comes
        ; from the block's LOAD_FILES effect. Fixtures without the block keep
        ; the shared entry-34 smoke start.
        mov     al, 18
        cmp     word [gamep], game_pod
        je      .init_probe
        mov     al, 20
        cmp     word [gamep], game_treasures
        jne     .not_init
.init_probe:
        mov     dx, f_ecl1_dax
        call    dax_has_block
        jc      .entry34
        mov     al, [dax_probe_id]
        xor     ah, ah
        mov     [mapid], ax
        mov     [eclid], ax
        clc
        ret
.not_init:
        cmp     word [gamep], game_pool
        jne     .entry34
        mov     dx, f_ecl1_dax
        mov     al, 2
        call    dax_has_block
        jnc     .entry2
        mov     dx, f_ecl1_dax
        mov     al, 34
        call    dax_has_block
        jc      maybe_geo_preview
.entry34:
        mov     word [mapid], 34
        mov     word [eclid], 34
        clc
        ret
.entry2:
        mov     word [mapid], 2
        mov     word [eclid], 2
        clc
        ret

find_geo_preview:
        mov     si, geo_probe_table
.loop:
        mov     dx, [si]
        or      dx, dx
        jz      .none
        call    file_exists
        jnc     .found
        add     si, 2
        jmp     .loop
.found:
        mov     ax, [si]
        mov     [geop], ax
        mov     word [mapid], 0
        clc
        ret
.none:
        stc
        ret

maybe_enter_nested_game_dir:
        ; Re-release wrappers commonly mount the game root one level above the
        ; actual DOS cwd: e.g. GAME\SECRET\START.EXE. If the current directory
        ; already has a runnable marker, leave it alone.
        mov     dx, f_dqk_exe
        call    file_exists
        jnc     .ret
        mov     dx, f_start_exe
        call    file_exists
        jnc     .ret
        mov     dx, f_game_exe
        call    file_exists
        jnc     .ret
        mov     dx, f_buck1_exe
        call    file_exists
        jnc     .ret
        mov     dx, f_ckit_exe
        call    file_exists
        jnc     .ret

        ; Some wrappers put the actual DOS game files directly under GAME\,
        ; instead of a title-specific child such as GAME\POOLRAD.
        mov     dx, n_game_start
        call    file_exists
        jc      .try_game_direct_game_exe
        mov     dx, n_game_krynn_cfg
        call    file_exists
        jnc     .enter_game
        mov     dx, n_game_dkk_cfg
        call    file_exists
        jnc     .enter_game
        mov     dx, n_game_pool_cfg
        call    file_exists
        jnc     .enter_game
        mov     dx, n_game_curse_cfg
        call    file_exists
        jnc     .enter_game
        mov     dx, n_game_blades_cfg
        call    file_exists
        jnc     .enter_game
        mov     dx, n_game_matrix_cfg
        call    file_exists
        jnc     .enter_game

.try_game_direct_game_exe:
        mov     dx, n_game_game_exe
        call    file_exists
        jc      .try_game_direct_buck
        mov     dx, n_game_zounds
        call    file_exists
        jc      .try_game_direct_pod
        mov     dx, n_game_game_cfg_root
        call    file_exists
        jnc     .enter_game
        mov     dx, n_game_treasure_cfg
        call    file_exists
        jnc     .enter_game
.try_game_direct_pod:
        mov     dx, n_game_pool4_cfg
        call    file_exists
        jc      .try_game_direct_buck
        mov     dx, n_game_game_ovr
        call    file_exists
        jnc     .enter_game

.try_game_direct_buck:
        mov     dx, n_game_buck1_root
        call    file_exists
        jc      .try_game_direct_data
        mov     dx, n_game_buck2_root
        call    file_exists
        jc      .try_game_direct_data
        mov     dx, n_game_buck3_root
        call    file_exists
        jc      .try_game_direct_data
        jmp     .enter_game

.try_game_direct_data:
        mov     dx, n_game_krynn_cfg
        call    file_exists
        jc      .try_game_data_dok
        mov     dx, n_game_ecl1
        call    file_exists
        jc      .try_game_data_dok
        mov     dx, n_game_geo1
        call    file_exists
        jnc     .enter_game
.try_game_data_dok:
        mov     dx, n_game_dkk_cfg
        call    file_exists
        jc      .try_game_data_pool
        mov     dx, n_game_ecl1
        call    file_exists
        jc      .try_game_data_pool
        mov     dx, n_game_geo1
        call    file_exists
        jnc     .enter_game
.try_game_data_pool:
        mov     dx, n_game_pool_cfg
        call    file_exists
        jc      .try_game_data_curse
        mov     dx, n_game_geo_dax
        call    find_exists
        jnc     .enter_game
.try_game_data_curse:
        mov     dx, n_game_curse_cfg
        call    file_exists
        jc      .try_game_data_secret
        mov     dx, n_game_geo_dax
        call    find_exists
        jnc     .enter_game
.try_game_data_secret:
        mov     dx, n_game_blades_cfg
        call    file_exists
        jc      .try_game_data_gateway
        mov     dx, n_game_geo_dax
        call    find_exists
        jnc     .enter_game
.try_game_data_gateway:
        mov     dx, n_game_game_cfg_root
        call    file_exists
        jc      .try_game_data_treasures
        mov     dx, n_game_zounds
        call    file_exists
        jc      .try_game_data_treasures
        mov     dx, n_game_geo_dax
        call    find_exists
        jnc     .enter_game
.try_game_data_treasures:
        mov     dx, n_game_treasure_cfg
        call    file_exists
        jc      .try_game_data_pod
        mov     dx, n_game_zounds
        call    file_exists
        jc      .try_game_data_pod
        mov     dx, n_game_geo_dax
        call    find_exists
        jnc     .enter_game
.try_game_data_pod:
        mov     dx, n_game_pool4_cfg
        call    file_exists
        jc      .try_game_data_matrix
        mov     dx, n_game_geo_dax
        call    find_exists
        jnc     .enter_game
.try_game_data_matrix:
        mov     dx, n_game_matrix_cfg
        call    file_exists
        jc      .try_pool
        mov     dx, n_game_geo_dax
        call    find_exists
        jnc     .enter_game

.try_pool:
        mov     dx, n_pool_cfg
        call    file_exists
        jc      .try_curse
        mov     dx, n_pool_start
        call    file_exists
        jnc     .enter_pool
        mov     dx, n_pool_geo
        call    find_exists
        jc      .try_curse
.enter_pool:
        mov     dx, d_pool
        jmp     .chdir
.try_curse:
        mov     dx, n_curse_cfg
        call    file_exists
        jc      .try_secret
        mov     dx, n_curse_start
        call    file_exists
        jnc     .enter_curse
        mov     dx, n_curse_geo
        call    find_exists
        jc      .try_secret
.enter_curse:
        mov     dx, d_curse
        jmp     .chdir
.try_secret:
        mov     dx, n_blades_cfg
        call    file_exists
        jc      .try_treasures
        mov     dx, n_secret_start
        call    file_exists
        jnc     .enter_secret
        mov     dx, n_secret_geo
        call    find_exists
        jc      .try_treasures
.enter_secret:
        mov     dx, d_secret
        jmp     .chdir
.try_treasures:
        mov     dx, n_treasure_cfg
        call    file_exists
        jc      .try_pod
        mov     dx, n_treasure_zounds
        call    file_exists
        jc      .try_pod
        mov     dx, n_treasure_game
        call    file_exists
        jnc     .enter_treasure
        mov     dx, n_treasure_geo
        call    find_exists
        jc      .try_pod
.enter_treasure:
        mov     dx, d_treasure
        jmp     .chdir
.try_pod:
        mov     dx, n_pool4_cfg
        call    file_exists
        jc      .try_gateway
        mov     dx, n_pod_game
        call    file_exists
        jnc     .enter_pod
        mov     dx, n_pod_geo
        call    find_exists
        jc      .try_gateway
.enter_pod:
        mov     dx, d_darkness
        jmp     .chdir
.try_gateway:
        mov     dx, n_game_cfg
        call    file_exists
        jc      .try_buck_nested
        mov     dx, n_gateway_zounds
        call    file_exists
        jc      .try_buck_nested
        mov     dx, n_gateway_game
        call    file_exists
        jnc     .enter_gateway
        mov     dx, n_gateway_geo
        call    find_exists
        jc      .try_buck_nested
.enter_gateway:
        mov     dx, d_gateway
        jmp     .chdir
.try_buck_nested:
        mov     dx, n_buck1_exe
        call    file_exists
        jc      .try_matrix_nested
        mov     dx, n_buck2_exe
        call    file_exists
        jc      .try_matrix_nested
        mov     dx, n_buck3_exe
        call    file_exists
        jc      .try_matrix_nested
        mov     dx, d_buck
        jmp     .chdir
.try_matrix_nested:
        mov     dx, n_matrix_cfg
        call    file_exists
        jc      .try_game_dqk_nested
        mov     dx, n_matrix_start
        call    file_exists
        jnc     .enter_matrix
        mov     dx, n_matrix_geo
        call    find_exists
        jc      .try_game_dqk_nested
.enter_matrix:
        mov     dx, d_matrix
        jmp     .chdir
.try_game_dqk_nested:
        mov     dx, n_game_dqk_exe
        call    file_exists
        jc      .try_game_dqk_data_nested
        mov     dx, n_game_disk3_ecl
        call    file_exists
        jc      .try_game_frua_nested
        mov     dx, n_game_disk3_geo
        call    file_exists
        jc      .try_game_frua_nested
        jmp     .enter_game
.try_game_dqk_data_nested:
        mov     dx, n_game_disk3_ecl
        call    file_exists
        jc      .try_game_frua_nested
        mov     dx, n_game_disk3_geo
        call    file_exists
        jc      .try_game_frua_nested
.enter_game:
        mov     dx, d_game
        jmp     .chdir
.try_game_frua_nested:
        mov     dx, n_game_ckit
        call    file_exists
        jc      .try_game_hlib_data
        mov     dx, n_game_script
        call    file_exists
        jc      .try_game_hlib_data
        mov     dx, d_game
        jmp     .chdir
.try_game_hlib_data:
        mov     dx, n_game_geo
        call    file_exists
        jc      .ret
        mov     dx, d_game
.chdir:
        mov     ah, 3Bh
        int     21h
.ret:
        ret

file_exists:
        mov     ax, 4300h
        int     21h
        ret

find_exists:
        mov     ah, 4Eh
        xor     cx, cx
        int     21h
        ret

; dax_has_block: DX -> DOS DAX archive path, AL = one-byte block id.
; Returns CF=0 when the little-endian 9-byte TOC contains the block id.
dax_has_block:
        mov     [dax_probe_id], al
        mov     ax, 3D00h
        int     21h
        jc      .err
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 2
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, 2
        jne     .close_err
        mov     ax, [fxbuf]
        xor     dx, dx
        mov     bx, 9
        div     bx
        or      dx, dx
        jnz     .close_err
        or      ax, ax
        jz      .close_err
        mov     [dax_probe_left], ax
.loop:
        cmp     word [dax_probe_left], 0
        je      .close_err
        mov     bx, [auto_fh]
        mov     ah, 3Fh
        mov     cx, 9
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, 9
        jne     .close_err
        mov     al, [fxbuf]
        cmp     al, [dax_probe_id]
        je      .found
        dec     word [dax_probe_left]
        jmp     .loop
.found:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_err:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

auto_seed_party_count:
        cmp     byte [seed_count_valid], 0
        jne     .ret
        cmp     word [gamep], game_cok
        je      .cok
        cmp     word [gamep], game_dok
        je      .dok
        cmp     word [gamep], game_dqk
        je      .dqk
        ret
.cok:
        mov     si, f_save_chrdata_sav
        call    count_save_slots
        or      ax, ax
        jnz     .store
        mov     si, f_cloud_chrdata_sav
        call    count_cloud_save_slots
        jmp     .store
.dok:
        mov     si, f_save_chrdata_gam
        call    count_save_slots
        or      ax, ax
        jnz     .store
        mov     si, f_cloud_chrdata_gam
        call    count_cloud_save_slots
        or      ax, ax
        jnz     .store
        mov     si, f_cloud_chrdatb_gam
        call    count_cloud_save_slots
        or      ax, ax
        jnz     .store
        mov     si, f_cloud_chrdatc_gam
        call    count_cloud_save_slots
        jmp     .store
.dqk:
        mov     si, f_save_savgama_qsv
        mov     di, 11
        call    read_qsv_slot_family
        or      ax, ax
        jnz     .store
        mov     si, f_cloud_savgama_qsv
        mov     di, 20
        call    read_qsv_slot_family
        or      ax, ax
        jnz     .store
        mov     si, f_savgama_qsv
        mov     di, 6
        call    read_qsv_slot_family
        or      ax, ax
        jnz     .store
        mov     si, f_save_savgame_qsv
        call    read_qsv_party_size
        or      ax, ax
        jnz     .store
        mov     si, f_cloud_savgame_qsv
        call    read_qsv_party_size
        or      ax, ax
        jnz     .store
        mov     si, f_savgame_qsv
        call    read_qsv_party_size
        or      ax, ax
        jnz     .store
        mov     si, f_save_chrdata_qch
        call    count_save_slots8
        or      ax, ax
        jnz     .store
        mov     si, f_cloud_chrdata_qch
        call    count_cloud_save_slots
        or      ax, ax
        jnz     .store
        mov     si, f_cloud_chrdatb_qch
        call    count_cloud_save_slots
        or      ax, ax
        jnz     .store
        mov     si, f_cloud_chrdatc_qch
        call    count_cloud_save_slots
.store:
        or      ax, ax
        jz      .ret
        mov     [seed_count], ax
        mov     byte [seed_count_valid], 1
.ret:
        ret

auto_seed_dqk_strength:
        cmp     byte [secret_profile], 0
        jne     .ret
        cmp     byte [seed_strength_valid], 0
        jne     .ret
        cmp     word [gamep], game_dqk
        jne     .ret
        cmp     byte [seed_count_valid], 0
        je      .ret
        mov     ax, [seed_count]
        or      ax, ax
        jz      .ret
        cmp     ax, 8
        ja      .ret
        mov     bx, ax
        shl     ax, 5                  ; count * 32
        shl     bx, 3                  ; count * 8
        add     ax, bx                 ; count * 40
        mov     [seed_strength], ax
        mov     byte [seed_strength_valid], 1
.ret:
        ret

count_save_slots:                       ; SI -> mutable SAVE\CHRDATA1.xxx
        push    bx
        push    dx
        mov     word [auto_party_count], 0
        xor     bx, bx
.loop:
        cmp     bx, 6
        jae     .done
        mov     al, '1'
        add     al, bl
        mov     [si+12], al
        mov     dx, si
        call    file_exists
        jc      .next
        inc     word [auto_party_count]
.next:
        inc     bx
        jmp     .loop
.done:
        mov     ax, [auto_party_count]
        pop     dx
        pop     bx
        ret

count_save_slots8:                      ; SI -> mutable SAVE\CHRDATA1.xxx
        push    bx
        push    dx
        mov     word [auto_party_count], 0
        xor     bx, bx
.loop:
        cmp     bx, 8
        jae     .done
        mov     al, '1'
        add     al, bl
        mov     [si+12], al
        mov     dx, si
        call    file_exists
        jc      .next
        inc     word [auto_party_count]
.next:
        inc     bx
        jmp     .loop
.done:
        mov     ax, [auto_party_count]
        pop     dx
        pop     bx
        ret

count_cloud_save_slots:                 ; SI -> mutable CLOUD_~1\SAVE\CHRDATA1.xxx
        push    bx
        push    dx
        mov     word [auto_party_count], 0
        xor     bx, bx
.loop:
        cmp     bx, 8
        jae     .done
        mov     al, '1'
        add     al, bl
        mov     [si+21], al
        mov     dx, si
        call    file_exists
        jc      .next
        inc     word [auto_party_count]
.next:
        inc     bx
        jmp     .loop
.done:
        mov     ax, [auto_party_count]
        pop     dx
        pop     bx
        ret

read_qsv_party_size:                    ; SI -> SAVGAMA.QSV path, returns AX=partySize or 0
        push    bx
        push    cx
        push    dx
        mov     dx, si
        mov     ax, 3D00h
        int     21h
        jc      .none
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 32
        mov     dx, auto_qsvbuf
        int     21h
        jc      .close_none
        cmp     ax, 32
        jb      .close_none
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        mov     al, [auto_qsvbuf+31]
        xor     ah, ah
        or      ax, ax
        jz      .none
        cmp     ax, 8
        ja      .none
        jmp     .done
.close_none:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.none:
        xor     ax, ax
.done:
        pop     dx
        pop     cx
        pop     bx
        ret

read_qsv_slot_family:                   ; SI -> mutable SAVGAMA.QSV path, DI -> slot letter offset
        push    bx
        push    di
        push    si
        xor     bx, bx
.loop:
        cmp     bx, 10
        jae     .none
        mov     al, 'A'
        add     al, bl
        push    si
        add     si, di
        mov     [si], al
        pop     si
        call    read_qsv_party_size
        or      ax, ax
        jnz     .done
        inc     bx
        jmp     .loop
.none:
        xor     ax, ax
.done:
        pop     si
        pop     di
        pop     bx
        ret

auto_seed_party_affect:
        cmp     byte [seed_affect_count], 0
        jne     .ret
        cmp     word [gamep], game_cok
        je      .cok
        cmp     word [gamep], game_dok
        je      .dok
        ret
.cok:
        ; Import after GBPR selection, so source slots map to actual roster
        ; members and native-created members cannot inherit retail effects.
        ret
.dok:
        mov     si, f_save_chrdata_eff
        call    collect_save_affects
        cmp     byte [seed_affect_count], 0
        jne     .ret
        mov     si, f_cloud_chrdata_eff
        call    collect_cloud_save_affects
        cmp     byte [seed_affect_count], 0
        jne     .ret
        mov     si, f_cloud_chrdatb_eff
        call    collect_cloud_save_affects
        cmp     byte [seed_affect_count], 0
        jne     .ret
        mov     si, f_cloud_chrdatc_eff
        call    collect_cloud_save_affects
.ret:
        ret

auto_seed_party_items:
        cmp     byte [seed_item_count], 0
        jne     .ret
        cmp     word [gamep], game_cok
        je      .cok
        cmp     word [gamep], game_dok
        je      .dok
        ret
.cok:
        mov     si, f_save_chrdata_stf
        call    collect_save_items
        cmp     byte [seed_item_count], 0
        jne     .ret
        mov     si, f_cloud_chrdata_stf
        call    collect_cloud_save_items
        jmp     .ret
.dok:
        mov     si, f_save_chrdata_jnk
        call    collect_save_items
        cmp     byte [seed_item_count], 0
        jne     .ret
        mov     si, f_cloud_chrdata_jnk
        call    collect_cloud_save_items
        cmp     byte [seed_item_count], 0
        jne     .ret
        mov     si, f_cloud_chrdatb_jnk
        call    collect_cloud_save_items
        cmp     byte [seed_item_count], 0
        jne     .ret
        mov     si, f_cloud_chrdatc_jnk
        call    collect_cloud_save_items
.ret:
        ret

auto_seed_party_moves:
        cmp     byte [seed_move_count], 0
        jne     .ret
        cmp     word [gamep], game_cok
        je      .cok
        cmp     word [gamep], game_dok
        je      .dok
        ret
.cok:
        mov     si, f_save_chrdata_stf
        call    collect_save_moves
        cmp     byte [seed_move_count], 0
        jne     .ret
        mov     si, f_cloud_chrdata_stf
        call    collect_cloud_save_moves
        jmp     .ret
.dok:
        mov     si, f_save_chrdata_jnk
        call    collect_save_moves
        cmp     byte [seed_move_count], 0
        jne     .ret
        mov     si, f_cloud_chrdata_jnk
        call    collect_cloud_save_moves
        cmp     byte [seed_move_count], 0
        jne     .ret
        mov     si, f_cloud_chrdatb_jnk
        call    collect_cloud_save_moves
        cmp     byte [seed_move_count], 0
        jne     .ret
        mov     si, f_cloud_chrdatc_jnk
        call    collect_cloud_save_moves
.ret:
        ret

auto_seed_party_thief_matrix:
        cmp     byte [seed_thief_count], 0
        jne     .ret
        cmp     byte [seed_thief_matrix_count], 0
        jne     .ret
        cmp     word [gamep], game_cok
        jne     .ret
        mov     si, f_save_chrdata_sav
        call    collect_save_thief_matrix
        cmp     byte [seed_thief_matrix_count], 0
        jne     .ret
        mov     si, f_cloud_chrdata_sav
        call    collect_cloud_save_thief_matrix
.ret:
        ret

auto_seed_party_spells:
        cmp     byte [seed_spell_count], 0
        jne     .ret
        cmp     word [gamep], game_dok
        jne     .ret
        mov     si, f_save_chrdata_wiz
        call    collect_save_spells
        cmp     byte [seed_spell_count], 0
        jne     .ret
        mov     si, f_cloud_chrdata_wiz
        call    collect_cloud_save_spells
        cmp     byte [seed_spell_count], 0
        jne     .ret
        mov     si, f_cloud_chrdatb_wiz
        call    collect_cloud_save_spells
        cmp     byte [seed_spell_count], 0
        jne     .ret
        mov     si, f_cloud_chrdatc_wiz
        call    collect_cloud_save_spells
.ret:
        ret

; CoK SFX ownership follows selected GBPR entries, not source-slot ordinal.
; Legacy explicit /F remains party-wide; /U remains an additive member seed.
collect_cok_owned_affects:
        cmp     word [gamep], game_cok
        jne     .ok
        cmp     byte [seed_affect_count], 0
        jne     .ok
        xor     ax, ax
        mov     di, timer_state
        mov     cx, TIMER_STATE_LEN
        rep     stosb
        mov     word [timer_state], 1
        mov     word [seed_owned_flags], 0
        xor     ax, ax
        mov     di, seed_owned_matrix
        mov     cx, 256
        rep     stosb
        mov     dx, rosterpath
        mov     si, rest_party
        mov     cx, 2477
        call    checkpoint_read
        jc      .bad
        mov     [rest_party_len], ax
        mov     si, rest_party
        call    validate_gbpr_header
        jc      .bad
        cmp     ax, [rest_party_len]
        jne     .bad
        mov     bp, cx
        ; sync_cok_roster_count already validated GBPR; bound each record here.
        mov     si, rest_party+16
        xor     di, di
.member:
        test    bp, bp
        jz      .ok
        mov     al, [si]
        cmp     al, 1
        jb      .next
        cmp     al, 8
        ja      .next
        add     al, '0'
        mov     [f_save_chrdata_sfx+12], al
        mov     [f_cloud_chrdata_sfx+21], al
        mov     byte [timer_source], 1
        mov     dx, f_save_chrdata_sfx
        mov     ax, 3D00h
        int     21h
        jnc     .opened
        mov     byte [timer_source], 2
        mov     dx, f_cloud_chrdata_sfx
        mov     ax, 3D00h
        int     21h
        jc      .next
.opened:
        mov     [auto_fh], ax
        mov     word [seed_owned_flags], 1
        mov     bx, di
        shr     bx, 5
        mov     al, [timer_source]
        mov     [timer_sources+bx], al
.record:
        mov     bx, [auto_fh]
        mov     dx, auto_effbuf
        mov     cx, 9
        mov     ah, 3Fh
        int     21h
        jc      .close_bad
        test    ax, ax
        jz      .close
        cmp     ax, 9
        jne     .close_bad
        cmp     word [timer_count], TIMER_CAP
        jae     .close_bad
        pusha
        mov     ax, [timer_count]
        mov     bx, 10
        mul     bx
        mov     bx, di
        shr     bx, 5
        inc     bx
        mov     di, timer_records
        add     di, ax
        mov     ax, bx
        stosb
        mov     si, auto_effbuf
        mov     cx, 9
        rep     movsb
        inc     word [timer_count]
        popa
        movzx   ax, byte [auto_effbuf]
        test    ax, ax
        jz      .record
        bts     word [seed_owned_matrix+di], ax
        jmp     .record
.close:
        mov     ah, 3Eh
        int     21h
.next:
        add     si, 410
        add     di, 32
        dec     bp
        jmp     .member
.close_bad:
        mov     ah, 3Eh
        int     21h
.bad:
        stc
        ret
.ok:
        clc
        ret

collect_save_affects:                   ; SI -> mutable SAVE\CHRDATA1.EFF
        mov     word [auto_path_digit_offset], 12
        mov     word [auto_path_slot_limit], 6
        jmp     collect_save_affects_at

collect_cloud_save_affects:             ; SI -> mutable CLOUD_~1\SAVE\CHRDATA1.EFF
        mov     word [auto_path_digit_offset], 21
        mov     word [auto_path_slot_limit], 8

collect_save_affects_at:
        push    bx
        push    cx
        push    dx
        push    di
        mov     word [auto_save_slot], 0
.slot_loop:
        cmp     byte [seed_affect_count], PARTY_AFFECT_MAX
        jae     .done
        mov     bx, [auto_save_slot]
        cmp     bx, [auto_path_slot_limit]
        jae     .done
        mov     al, '1'
        add     al, bl
        mov     di, si
        add     di, [auto_path_digit_offset]
        mov     [di], al
        mov     dx, si
        mov     ax, 3D00h
        int     21h
        jc      .next
        mov     [auto_fh], ax
.record_loop:
        cmp     byte [seed_affect_count], PARTY_AFFECT_MAX
        jae     .close
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 9
        mov     dx, auto_effbuf
        int     21h
        jc      .close
        cmp     ax, 9
        jne     .close
        mov     al, [auto_effbuf]
        xor     ah, ah
        or      ax, ax
        jnz     .store_record
        mov     ax, [auto_fh]
        jmp     .record_loop
.store_record:
        call    add_seed_affect
        mov     bx, [auto_save_slot]
        inc     bx
        call    add_seed_member_affect
        mov     ax, [auto_fh]
        jmp     .record_loop
.close:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.next:
        inc     word [auto_save_slot]
        jmp     .slot_loop
.done:
        pop     di
        pop     dx
        pop     cx
        pop     bx
        ret

collect_save_items:                     ; SI -> mutable SAVE\CHRDATA1.JNK/STF
        mov     word [auto_path_digit_offset], 12
        mov     word [auto_path_slot_limit], 6
        jmp     collect_save_items_at

collect_cloud_save_items:               ; SI -> mutable CLOUD_~1\SAVE\CHRDATA1.JNK/STF
        mov     word [auto_path_digit_offset], 21
        mov     word [auto_path_slot_limit], 8

collect_save_items_at:
        push    bx
        push    cx
        push    dx
        push    di
        mov     word [auto_save_slot], 0
.slot_loop:
        cmp     byte [seed_item_count], AUTO_ITEM_MAX
        jae     .done
        mov     bx, [auto_save_slot]
        cmp     bx, [auto_path_slot_limit]
        jae     .done
        mov     al, '1'
        add     al, bl
        mov     di, si
        add     di, [auto_path_digit_offset]
        mov     [di], al
        mov     dx, si
        mov     ax, 3D00h
        int     21h
        jc      .next
        mov     [auto_fh], ax
.record_loop:
        cmp     byte [seed_item_count], AUTO_ITEM_MAX
        jae     .close
        mov     bx, [auto_fh]
        mov     ah, 3Fh
        mov     cx, 63
        mov     dx, auto_jnkbuf
        int     21h
        jc      .close
        cmp     ax, 63
        jne     .close
        mov     al, [auto_jnkbuf]
        cmp     al, 1
        jb      .close
        cmp     al, 56
        ja      .close
        mov     al, [auto_jnkbuf+46]    ; .JNK/.STF item identity, not scratch byte 42
        xor     ah, ah
        or      ax, ax
        jz      .record_loop
        call    add_seed_item
        jmp     .record_loop
.close:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.next:
        inc     word [auto_save_slot]
        jmp     .slot_loop
.done:
        pop     di
        pop     dx
        pop     cx
        pop     bx
        ret

collect_save_thief_matrix:              ; SI -> mutable SAVE\CHRDATA1.SAV
        mov     word [auto_path_digit_offset], 12
        mov     word [auto_path_slot_limit], 6
        jmp     collect_save_thief_matrix_at

collect_cloud_save_thief_matrix:        ; SI -> mutable CLOUD_~1\SAVE\CHRDATA1.SAV
        mov     word [auto_path_digit_offset], 21
        mov     word [auto_path_slot_limit], 8

collect_save_thief_matrix_at:
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     word [auto_save_slot], 0
.slot_loop:
        cmp     byte [seed_thief_matrix_count], PARTY_THIEF_MAX
        jae     .done
        mov     bx, [auto_save_slot]
        cmp     bx, [auto_path_slot_limit]
        jae     .done
        mov     al, '1'
        add     al, bl
        mov     di, si
        add     di, [auto_path_digit_offset]
        mov     [di], al
        mov     dx, si
        mov     ax, 3D00h
        int     21h
        jc      .next
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, COK_CCH_THIEF_READ
        mov     dx, auto_savbuf
        int     21h
        push    ax
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, COK_CCH_THIEF_READ
        jb      .next
        mov     al, [auto_savbuf]
        cmp     al, 1
        jb      .next
        cmp     al, 15
        ja      .next
        movzx   bx, byte [seed_thief_matrix_count]
        shl     bx, 3
        mov     di, seed_thief_matrix
        add     di, bx
        push    si
        mov     si, auto_savbuf+COK_CCH_THIEF_OFF
        mov     cx, PARTY_THIEF_SKILL_COUNT
.copy:
        lodsb
        mov     [di], al
        inc     di
        loop    .copy
        pop     si
        inc     byte [seed_thief_matrix_count]
.next:
        inc     word [auto_save_slot]
        jmp     .slot_loop
.done:
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        ret

collect_save_moves:                     ; SI -> mutable SAVE\CHRDATA1.JNK/STF
        mov     word [auto_path_digit_offset], 12
        mov     word [auto_path_slot_limit], 6
        jmp     collect_save_moves_at

collect_cloud_save_moves:               ; SI -> mutable CLOUD_~1\SAVE\CHRDATA1.JNK/STF
        mov     word [auto_path_digit_offset], 21
        mov     word [auto_path_slot_limit], 8

collect_save_moves_at:
        push    bx
        push    cx
        push    dx
        push    di
        mov     word [auto_save_slot], 0
.slot_loop:
        cmp     byte [seed_move_count], PARTY_MOVE_MAX
        jae     .done
        mov     bx, [auto_save_slot]
        cmp     bx, [auto_path_slot_limit]
        jae     .done
        mov     al, '1'
        add     al, bl
        mov     di, si
        add     di, [auto_path_digit_offset]
        mov     [di], al
        mov     dx, si
        mov     ax, 3D00h
        int     21h
        jc      .next
        mov     [auto_fh], ax
        mov     word [auto_move_value], 4
.record_loop:
        mov     bx, [auto_fh]
        mov     ah, 3Fh
        mov     cx, 63
        mov     dx, auto_jnkbuf
        int     21h
        jc      .close_store
        cmp     ax, 63
        jne     .close_store
        mov     al, [auto_jnkbuf]
        cmp     al, 1
        jb      .close_store
        cmp     al, 56
        ja      .close_store
        cmp     byte [auto_jnkbuf+34h], 0
        je      .record_loop
        mov     al, [auto_jnkbuf+46]
        cmp     al, 36                  ; Plate Mail
        je      .plate
        cmp     al, 32                  ; Ring Mail
        je      .ring
        jmp     .record_loop
.plate:
        cmp     word [auto_move_value], 2
        jle     .record_loop
        mov     word [auto_move_value], 2
        jmp     .record_loop
.ring:
        cmp     word [auto_move_value], 3
        jle     .record_loop
        mov     word [auto_move_value], 3
        jmp     .record_loop
.close_store:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        mov     ax, [auto_move_value]
        call    add_seed_move
.next:
        inc     word [auto_save_slot]
        jmp     .slot_loop
.done:
        pop     di
        pop     dx
        pop     cx
        pop     bx
        ret

collect_save_spells:                    ; SI -> mutable SAVE\CHRDATA1.WIZ
        mov     word [auto_path_digit_offset], 12
        mov     word [auto_path_slot_limit], 6
        jmp     collect_save_spells_at

collect_cloud_save_spells:              ; SI -> mutable CLOUD_~1\SAVE\CHRDATA1.WIZ
        mov     word [auto_path_digit_offset], 21
        mov     word [auto_path_slot_limit], 8

collect_save_spells_at:
        push    bx
        push    cx
        push    dx
        push    di
        mov     word [auto_save_slot], 0
.slot_loop:
        cmp     byte [seed_spell_count], AUTO_SPELL_MAX
        jae     .done
        mov     bx, [auto_save_slot]
        cmp     bx, [auto_path_slot_limit]
        jae     .done
        mov     al, '1'
        add     al, bl
        mov     di, si
        add     di, [auto_path_digit_offset]
        mov     [di], al
        mov     dx, si
        mov     ax, 3D00h
        int     21h
        jc      .next
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 220
        mov     dx, auto_wizbuf
        int     21h
        push    ax
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 220
        jne     .next
        mov     di, auto_wizbuf+34
        mov     cx, 40
.spell_loop:
        cmp     byte [seed_spell_count], AUTO_SPELL_MAX
        jae     .done
        mov     al, [di]
        xor     ah, ah
        or      ax, ax
        jz      .spell_next
        call    add_seed_spell_unique
        mov     bx, [auto_save_slot]
        inc     bx
        call    add_seed_member_spell
.spell_next:
        inc     di
        loop    .spell_loop
.next:
        inc     word [auto_save_slot]
        jmp     .slot_loop
.done:
        pop     di
        pop     dx
        pop     cx
        pop     bx
        ret

add_seed_affect:                        ; AX = decimal affect id, unique by low byte
        push    ax
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        mov     [auto_affect_type], ax
        movzx   cx, byte [seed_affect_count]
        xor     di, di
.scan:
        cmp     cx, 0
        je      .store
        mov     bx, [seed_affects+di]
        and     bx, 00ffh
        cmp     bx, [auto_affect_type]
        je      .done
        add     di, 2
        dec     cx
        jmp     .scan
.store:
        movzx   bx, byte [seed_affect_count]
        cmp     bx, PARTY_AFFECT_MAX
        jae     .done
        shl     bx, 1
        mov     ax, [auto_affect_type]
        mov     [seed_affects+bx], ax
        inc     byte [seed_affect_count]
.done:
        pop     di
        pop     cx
        pop     bx
        pop     ax
        ret

add_seed_member_affect:                 ; BX = one-based member, AX = affect id
        push    ax
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        and     bx, 00ffh
        or      bx, bx
        jz      .done
        mov     [auto_affect_type], ax
        mov     [seed_member_tmp], bx
        movzx   cx, byte [seed_member_affect_count]
        xor     di, di
.scan:
        cmp     cx, 0
        je      .store
        mov     bx, [seed_member_affects+di]
        and     bx, 00ffh
        cmp     bx, [seed_member_tmp]
        jne     .next
        mov     bx, [seed_member_affects+di+2]
        and     bx, 00ffh
        cmp     bx, [auto_affect_type]
        je      .done
.next:
        add     di, 4
        dec     cx
        jmp     .scan
.store:
        movzx   bx, byte [seed_member_affect_count]
        cmp     bx, PARTY_MEMBER_AFFECT_MAX
        jae     .done
        shl     bx, 1
        shl     bx, 1
        mov     ax, [seed_member_tmp]
        mov     [seed_member_affects+bx], ax
        mov     ax, [auto_affect_type]
        mov     [seed_member_affects+bx+2], ax
        inc     byte [seed_member_affect_count]
.done:
        pop     di
        pop     cx
        pop     bx
        pop     ax
        ret

add_seed_item:                          ; AX = decimal item id, unique by low byte
        push    ax
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        mov     [auto_affect_type], ax
        movzx   cx, byte [seed_item_count]
        xor     di, di
.scan:
        cmp     cx, 0
        je      .store
        mov     bx, [seed_items+di]
        and     bx, 00ffh
        cmp     bx, [auto_affect_type]
        je      .done
        add     di, 2
        dec     cx
        jmp     .scan
.store:
        movzx   bx, byte [seed_item_count]
        cmp     bx, PARTY_ITEM_MAX
        jae     .done
        shl     bx, 1
        mov     ax, [auto_affect_type]
        mov     [seed_items+bx], ax
        inc     byte [seed_item_count]
.done:
        pop     di
        pop     cx
        pop     bx
        pop     ax
        ret

add_seed_spell:                         ; AX = decimal spell id, preserves order
        push    ax
        push    bx
        and     ax, 00ffh
        movzx   bx, byte [seed_spell_count]
        cmp     bx, PARTY_SPELL_MAX
        jae     .done
        shl     bx, 1
        mov     [seed_spells+bx], ax
        inc     byte [seed_spell_count]
.done:
        pop     bx
        pop     ax
        ret

add_seed_member_spell:                  ; BX = one-based member, AX = spell id
        push    ax
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        and     bx, 00ffh
        or      bx, bx
        jz      .done
        mov     [auto_affect_type], ax
        mov     [seed_member_tmp], bx
        movzx   cx, byte [seed_member_spell_count]
        xor     di, di
.scan:
        cmp     cx, 0
        je      .store
        mov     bx, [seed_member_spells+di]
        and     bx, 00ffh
        cmp     bx, [auto_affect_type]
        jne     .next
        mov     bx, [seed_member_spells+di+2]
        cmp     bx, [seed_member_tmp]
        je      .done
.next:
        add     di, 4
        dec     cx
        jmp     .scan
.store:
        movzx   bx, byte [seed_member_spell_count]
        cmp     bx, PARTY_MEMBER_SPELL_MAX
        jae     .done
        shl     bx, 2
        mov     ax, [auto_affect_type]
        mov     [seed_member_spells+bx], ax
        mov     ax, [seed_member_tmp]
        mov     [seed_member_spells+bx+2], ax
        inc     byte [seed_member_spell_count]
.done:
        pop     di
        pop     cx
        pop     bx
        pop     ax
        ret

add_seed_spell_unique:                  ; AX = spell id, unique by low byte
        push    ax
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        mov     [auto_affect_type], ax
        movzx   cx, byte [seed_spell_count]
        xor     di, di
.scan:
        cmp     cx, 0
        je      .store
        mov     bx, [seed_spells+di]
        and     bx, 00ffh
        cmp     bx, [auto_affect_type]
        je      .done
        add     di, 2
        dec     cx
        jmp     .scan
.store:
        movzx   bx, byte [seed_spell_count]
        cmp     bx, PARTY_SPELL_MAX
        jae     .done
        shl     bx, 1
        mov     ax, [auto_affect_type]
        mov     [seed_spells+bx], ax
        inc     byte [seed_spell_count]
.done:
        pop     di
        pop     cx
        pop     bx
        pop     ax
        ret

add_seed_move:                          ; AX = decimal movement byte, preserves order
        push    ax
        push    bx
        and     ax, 00ffh
        movzx   bx, byte [seed_move_count]
        cmp     bx, PARTY_MOVE_MAX
        jae     .done
        shl     bx, 1
        mov     [seed_moves+bx], ax
        inc     byte [seed_move_count]
.done:
        pop     bx
        pop     ax
        ret

add_seed_thief:                         ; AX = decimal thief-skill byte, preserves order
        push    ax
        push    bx
        and     ax, 00ffh
        movzx   bx, byte [seed_thief_count]
        cmp     bx, PARTY_THIEF_MAX
        jae     .done
        shl     bx, 1
        mov     [seed_thieves+bx], ax
        inc     byte [seed_thief_count]
.done:
        pop     bx
        pop     ax
        ret

; Resolve the presentation request independently from game detection/state.  The
; current first-person bridge consumes DOS DAX/HLIB data, so alternate sets are
; reported without pretending that their pixels are active yet.
resolve_graphics_set:
        mov     word [graphics_activep], gfx_dos
        mov     word [graphics_statusp], gfx_status_native
        mov     al, [graphics_requested]
        cmp     al, 1
        je      .dos
        cmp     al, 2
        je      .amiga
        cmp     al, 3
        je      .c64
        mov     word [graphics_requestedp], gfx_auto
        ret
.dos:
        mov     word [graphics_requestedp], gfx_dos
        ret
.amiga:
        mov     word [graphics_requestedp], gfx_amiga
        mov     dx, f_8x8d1_daa
        call    file_exists
        jc      .amiga_disk2
        mov     word [graphics_daap], f_8x8d1_daa
        jmp     .amiga_found
.amiga_disk2:
        mov     dx, f_disk2_8x8d1_daa
        call    file_exists
        jc      .amiga_game
        mov     word [graphics_daap], f_disk2_8x8d1_daa
        jmp     .amiga_found
.amiga_game:
        mov     dx, n_game_8x8d1_daa
        call    file_exists
        jc      .amiga_missing
        mov     word [graphics_daap], n_game_8x8d1_daa
        jmp     .amiga_found
.amiga_missing:
        mov     word [graphics_statusp], gfx_status_missing
        ret
.amiga_found:
        mov     byte [graphics_amiga_available], 1
        mov     word [graphics_activep], gfx_amiga
        mov     word [graphics_statusp], gfx_status_bridge
        ret
.c64:
        mov     word [graphics_requestedp], gfx_c64
        ; C64 first-person wall layout is not decoded, but a user-imported
        ; PIC scene is a bounded GBIM resource CCFP can render.  Keep the
        ; resource in the mounted game directory beside the user's assets.
        mov     dx, f_c64scene
        call    file_exists
        jc      .c64_missing
        mov     byte [graphics_c64_available], 1
        mov     word [graphics_activep], gfx_c64
        mov     word [graphics_statusp], gfx_status_c64_scene
        ret
.c64_missing:
        mov     word [graphics_statusp], gfx_status_unsupported
        ret

; Resolve the imported C64 scene only when it names the retail PICTURE id CCECL
; selected.  CCFP validates dimensions/palette itself; matching the GBIM header
; here prevents an unrelated imported picture from being counted as a replay.
prepare_c64_scene:
        cmp     byte [graphics_c64_available], 0
        je      .err
        mov     ax, 3D00h
        mov     dx, f_c64scene
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 14
        mov     dx, fxbuf
        int     21h
        push    ax
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 14
        jne     .err
        cmp     byte [fxbuf], 'G'
        jne     .err
        cmp     byte [fxbuf+1], 'B'
        jne     .err
        cmp     byte [fxbuf+2], 'I'
        jne     .err
        cmp     byte [fxbuf+3], 'M'
        jne     .err
        cmp     word [fxbuf+4], 1
        jne     .err
        test    byte [fxbuf+8], 1
        jz      .err
        mov     ax, [fxbuf+6]
        cmp     ax, [graphics_picture_id]
        jne     .err
        mov     si, f_c64scene
        mov     di, altscenepath
.copy:
        lodsb
        stosb
        or      al, al
        jnz     .copy
        mov     byte [graphics_scene_ready], 1
        clc
        ret
.err:
        stc
        ret

; ============================================================================
;  Output.
; ============================================================================
print_plan:
        mov     si, s_banner
        call    puts
        mov     si, s_game
        call    puts
        mov     si, [gamep]
        call    puts
        mov     si, s_crlf
        call    puts
        mov     si, s_engine
        call    puts
        mov     si, [enginep]
        call    puts
        mov     si, s_crlf
        call    puts
        mov     si, s_graphics
        call    puts
        mov     si, [graphics_requestedp]
        call    puts
        mov     si, s_graphics_arrow
        call    puts
        mov     si, [graphics_activep]
        call    puts
        mov     si, s_graphics_lparen
        call    puts
        mov     si, [graphics_statusp]
        call    puts
        mov     si, s_graphics_rparen
        call    puts
        mov     si, s_exec
        call    puts
        cmp     word [exep], 0
        je      .exec_native_only
        mov     si, [exep]
        call    puts
        mov     si, [argsp]
        call    puts
        jmp     .exec_done
.exec_native_only:
        mov     si, s_native_only_exec
        call    puts
.exec_done:
        mov     si, s_crlf
        call    puts
        mov     si, s_note
        call    puts
        mov     si, [notep]
        call    puts
        mov     si, s_crlf
        call    puts
        cmp     byte [engineflag], 0
        je      .mode_done
        mov     si, s_native
        call    puts
        cmp     word [geop], 0
        je      .native_unavail
        cmp     word [eclp], 0
        jne     .native_ecl
        mov     si, s_ccgeo_prefix
        call    puts
        mov     si, [geop]
        call    puts
        mov     si, s_space_map
        call    puts
        mov     ax, [mapid]
        call    print_dec
        mov     si, s_crlf
        call    puts
        call    maybe_print_gen1_texture_probe
        call    maybe_print_hlib_wall_probe
        jmp     .mode_done
.native_ecl:
        mov     si, s_ccecl_prefix
        call    puts
        mov     si, [eclp]
        call    puts
        mov     si, s_entry
        call    puts
        mov     ax, [eclid]
        call    print_dec
        mov     si, s_ecl_arrow
        call    puts
        mov     si, [geop]
        call    puts
        mov     si, s_crlf
        call    puts
        call    maybe_print_gen1_texture_probe
        call    maybe_print_hlib_wall_probe
        jmp     .mode_done
.native_unavail:
        cmp     byte [entry_override], 0
        je      .native_unavail_area
        mov     si, s_native_no_ecl
        call    puts
        jmp     .mode_done
.native_unavail_area:
        cmp     byte [area_override], 0
        je      .native_unavail_default
        mov     si, s_native_no_area
        call    puts
        jmp     .mode_done
.native_unavail_default:
        mov     si, s_native_no_geo
        call    puts
.mode_done:
        cmp     byte [dryrun], 0
        jne     .dry
        cmp     byte [engineflag], 0
        je      .launching
        cmp     word [geop], 0
        jne     .launching
        mov     si, s_native_no_launch
        call    puts
        ret
.dry:
        mov     si, s_dry
        call    puts
        ret
.launching:
        mov     si, s_launch
        call    puts
        ret

maybe_print_hlib_wall_probe:
        cmp     word [enginep], eng_hlib
        jne     .ret
        call    detect_hlib_art
        cmp     byte [hlibflag], 0
        je      .ret
        mov     si, s_native
        call    puts
        mov     si, s_hlib_wall_prefix
        call    puts
        mov     si, [hlibwallp]
        call    puts
        cmp     word [hlibwall2p], 0
        je      .newline
        mov     si, s_plus
        call    puts
        mov     si, [hlibwall2p]
        call    puts
.newline:
        mov     si, s_crlf
        call    puts
.ret:
        ret

maybe_print_gen1_texture_probe:
        cmp     word [enginep], eng_dax_gen1
        jne     .ret
        call    detect_texture_art
        cmp     byte [texflag], 0
        je      .ret
        mov     si, s_native
        call    puts
        mov     si, s_ccfp_tex_prefix
        call    puts
        mov     al, [texarea_ch]
        mov     [texarea_out], al
        mov     si, texarea_out
        call    puts
        mov     si, s_crlf
        call    puts
.ret:
        ret

puts:                                   ; SI -> ASCIIZ
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        mov     dx, si
        xor     cx, cx
.len:
        cmp     byte [si], 0
        je      .write
        inc     si
        inc     cx
        jmp     .len
.write:
        mov     bx, 1
        mov     ah, 40h
        int     21h
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

print_dec:                              ; AX unsigned
        push    ax
        push    bx
        push    cx
        push    dx
        push    di
        mov     di, numbuf+5
        mov     byte [di], 0
        mov     bx, 10
        xor     cx, cx
        cmp     ax, 0
        jne     .loop
        dec     di
        mov     byte [di], '0'
        jmp     .out
.loop:
        xor     dx, dx
        div     bx
        add     dl, '0'
        dec     di
        mov     [di], dl
        inc     cx
        cmp     ax, 0
        jne     .loop
.out:
        mov     si, di
        call    puts
        pop     di
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

; ============================================================================
;  EXEC support.
; ============================================================================
build_child_tail:
        call    tail_begin
        mov     si, [argsp]
        call    tail_append_str
        call    tail_finish
        ret

run_native_preview:
        mov     byte [nfail_gate], 1
        cmp     word [geop], 0
        je      .fail
        mov     byte [texflag], 0
        mov     byte [hlibflag], 0
        mov     byte [graphics_alt_ready], 0
        mov     byte [graphics_alt_ready2], 0
        mov     byte [graphics_image_ready], 0
        mov     byte [graphics_scene_ready], 0
        mov     byte [step_event], 0
        mov     byte [step_handler_mode], 0
        mov     byte [effect_state_valid], 0
        mov     word [effectwritep], effectpath
        mov     word [hlibsetcur], 0
        call    build_tool_paths
        mov     dx, wallpath
        mov     ah, 41h
        int     21h                         ; clear stale wall sidecar at boot start
        mov     dx, effectwallpath
        mov     ah, 41h
        int     21h                         ; ignore missing/stale-delete errors
        mov     word [effectreadp], effectpath
        call    shrink_mem
        ; Recover Secret durable continuation before legacy GSC settlement,
        ; party import or fresh seed publication can destroy its inputs.
        call    secret_next_recover
        jc      .fail
        cmp     byte [secret_next_ready], 0
        je      .secret_next_absent
        mov     byte [mutation_from_combat], 1
        jmp     .ecl_return
.secret_next_absent:
        ; plan §27.5 / §28.5: boot-time GBDJ recovery, DoK only.  Runs before
        ; the checkpoint_load branch so it also covers /5 camp loads.  Exit 0
        ; means absent/recovered/already-committed (proceed); exit 1 means the
        ; party is locked and CCHOST has already printed why.
        cmp     word [gamep], game_dok
        jne     .journal_ready
        mov     byte [nfail_gate], 35
        call    tail_begin
        mov     si, s_arg_resume          ; ' /R '
        call    tail_append_str
        mov     si, rosterpath
        call    tail_append_str           ; long form, never X:NAME
        call    host_tail_exec
        jc      .fail
.journal_ready:
        cmp     byte [checkpoint_load], 0
        jne     .load_camp
        mov     byte [nfail_gate], 2
        call    run_cok_intro
        jc      .fail
        mov     byte [nfail_gate], 3
        call    choose_krynn_title_mode
        jc      .fail
        mov     byte [nfail_gate], 4
        call    run_cok_party
        jc      .fail
        mov     byte [nfail_gate], 5
        call    sync_cok_roster_count
        jc      .fail
        mov     byte [nfail_gate], 6
        call    collect_cok_owned_affects
        jc      .fail
        call    prepare_handler3_seed_sidecar
        call    prepare_nwn_ecl7_seed_sidecar
        mov     byte [nfail_gate], 7
        call    write_seed_sidecar
        jc      .fail
        cmp     word [eclp], 0
        je      .raw_map
        cmp     byte [handler1_valid], 0
        je      .check_handler3
        mov     byte [step_event], 1
        mov     byte [step_handler_mode], 2
        mov     byte [step_skip_persist], 1
        mov     ax, [handler1_descriptor]
        mov     [step_descriptor], ax
        mov     [step_cell_word], ax
        mov     word [step_facing], 0
        mov     word [effectwritep], eventpath
        jmp     .run_ecl
.check_handler3:
        cmp     byte [handler3_valid], 0
        je      .run_ecl
        cmp     byte [secret_profile], 1
        je      .handler3_direct
        ; DQK area 5 slot 3 is not a standalone entry.  Its retail path first
        ; enters vmRun1, which selects the dragon branch and leaves the state
        ; that slot 3 resumes.  Starting straight at /3 left CCECL's direct
        ; host defaults in C1/C2, so the script's RANDOM/ADD instructions
        ; never ran.  Reuse the ordinary vmRun1 -> natural-handler3 bridge.
        cmp     word [gamep], game_dqk
        jne     .handler3_direct
        cmp     word [eclid], 5
        jne     .handler3_direct
        mov     byte [step_event], 1
        mov     byte [step_handler_mode], 2
        mov     byte [step_skip_persist], 1
        mov     word [step_cell_word], 0
        mov     word [step_facing], 0
        mov     word [effectwritep], eventpath
        jmp     .run_ecl
.handler3_direct:
        mov     byte [handler3_pending], 1
.run_ecl:
        mov     byte [mutation_from_combat], 0
        call    mutation_clear_yield
        call    secret_strength_refresh
        jc      .fail
        call    secret_names_refresh
        jc      .fail
        call secret_source_enter
        jc .fail
        call    build_ecl_tail
        mov     di, titlepath
        mov     si, s_ccflow
        call    compose_tool_path
        mov     word [runpathp], titlepath
.execute_ecl:
        mov     byte [nfail_gate], 8
        call    do_exec_checked
        pushf
        call secret_source_leave
        jc .source_leave_failed
        popf
        jc .fail
        jmp .ecl_return
.source_leave_failed:
        popf
        jmp .fail
.ecl_return:
        mov     dx, [effectwritep]
        mov     byte [nfail_gate], 9
        call    sync_ecl_timers
        jc      .fail
        mov     ax, [effectwritep]
        mov     [effectreadp], ax
        ; CCECL's GBEF contains a PC but no archive provenance.  Bind this
        ; newly published effect before any host consumer may mutate a roster.
        mov     si, s_bind_write
        call    bind_effect_source
        jc      .fail
        mov     byte [host_effect_mode], 1
        ; Menu resumes also publish to resumepath without a combat mutation.
        ; Select the actual effect record for diagnostics and host consumers.
        cmp     word [effectwritep], resumepath
        jne     .effect_dump
        mov     byte [host_effect_mode], 2
.effect_dump:
        call    dump_effect_optional
        mov     byte [nfail_gate], 10
        call    read_effect_header
        jc      .fail
        mov     byte [effect_state_valid], 1
        mov     byte [nfail_gate], 11
        test    word [fxflags], 0100h
        jz      .fixed_damage
        call    apply_sidecar_damage_roster
        jc      .fail
        jmp     short .damage_done
.fixed_damage:
        call    apply_effect_damage_roster
        jc      .fail
.damage_done:
        cmp     word [gamep], game_dqk
        jne     .npc_done
        test    word [fxflags], 0010h    ; FX_HAVE_NPC: ECL ADD_NPC joins
        jz      .npc_done
        call    apply_npc_joins
        jc      .fail
.npc_done:
        mov     byte [nfail_gate], 12
        call    mutation_bridge
        jc      .fail
        test    ax, ax
        jnz     .ecl_return
        cmp     word [fxstatus], 2       ; CCECL vm status: MENU yield
        je      .menu
        cmp     word [fxstatus], 3       ; CCECL vm status: COMBAT yield
        jne     .not_combat
        call    present_precombat_pictures
        mov     ax, [fxflags]
        test    ax, 0008h                ; FX_HAVE_ENC
        jz      .empty_combat
        call    detect_mon_archive
        call    prepare_combat_graphics
        call    prepare_combat_wall
        call    secret_boot_prepare
        jc      .fail
        call    build_combat_tail
        mov     word [runpathp], child_combat
        mov     byte [nfail_gate], 13
        call    do_exec_checked
        jc      .fail
%ifdef GBBOOT_TEST_SECRET_STOP_AFTER_RESULT
        cmp     byte [secret_party], 1
        jne     .no_secret_test_stop
        mov     ax, 4C58h
        int     21h
.no_secret_test_stop:
%endif
        mov     byte [nfail_gate], 14
        call    apply_combat_result_roster
        jc      .fail
        cmp     byte [secret_next_ready], 0
        je      .resume_combat_effect
        mov     byte [mutation_from_combat], 1
        jmp     .ecl_return
.resume_combat_effect:
        cmp     byte [secret_party], 1
        jne     .ordinary_resume
        cmp     word [fxbuf+8], 2
        jne     .secret_empty_resume
        call    secret_next_menu
        jmp     .secret_cursor_return
.secret_empty_resume:
        call    secret_next_empty
.secret_cursor_return:
        jc      .fail
        cmp     byte [secret_next_ready], 0
        je      .ordinary_resume       ; no authority before first physical battle
        mov     byte [mutation_from_combat], 1
        jmp     .ecl_return
.ordinary_resume:
        ; All cold resumes require the exact source that yielded this effect.
        ; This also covers headless empty-combat continuations.
        mov     si, s_bind_verify
        call    bind_effect_source
        jc      .fail
        cmp     word [fxbuf+8], 2
        je      .resume_not_combat
        mov     byte [mutation_from_combat], 1
.resume_not_combat:
        mov     word [effectwritep], resumepath
        call    mutation_clear_yield
        call    secret_strength_refresh
        jc      .fail
        call    secret_names_refresh
        jc      .fail
        call    build_ecl_resume_tail
        ; Resumes must stay in CCFLOW even when the consumed input was
        ; the completed v9 combat state. Direct CCECL can yield another v15
        ; ACK without publishing the sidecar CCHOST requires at this boundary.
        mov     di, titlepath
        mov     si, s_ccflow
        call    compose_tool_path
        mov     word [runpathp], titlepath
.resume_execute:
        mov     byte [nfail_gate], 16
        call    do_exec_checked
        jc      .fail
        ; A resumed VM can yield another menu or combat on every title.
        ; Re-enter the normal state dispatcher instead of treating non-CoK
        ; resumes as terminal map-only effects.
        jmp     .ecl_return
.combat_effect_geo:
        call    read_effect_geo
        jnc     .combat_have_map
        cmp     word [gamep], game_cok
        jne     .combat_legacy_geo
        ; The older effect may supply GEO, but the checkpoint must keep the
        ; resumed VM's memory, RNG and PC, even when it emits no new LOAD_FILES.
        push    word [effectreadp]
        mov     word [effectreadp], effectpath
        call    read_effect_geo
        pop     word [effectreadp]
        jc      .combat_done
        jmp     .combat_have_map
.combat_legacy_geo:
        mov     word [effectreadp], effectpath
        call    read_effect_geo
        jc      .combat_done
.combat_have_map:
        call    detect_texture_art
        call    detect_hlib_art
        jmp     .have_map
.combat_done:
        ; A retail title-demo combat is throwaway.  Once the ECL continuation
        ; has run, return to the title loop instead of dropping the temporary
        ; party into normal exploration.  The next title decision owns whether
        ; to start another demo or Play; clear the flag before re-entering it.
        cmp     byte [demoflag], 0
        je      .not_demo_loop
        cmp     byte [snapflag], 0
        jne     .not_demo_loop
        mov     byte [demoflag], 0
        jmp     run_native_preview
.not_demo_loop:
        cmp     byte [step_handler_mode], 3
        jne     .combat_not_handler3
        mov     byte [step_handler_mode], 0
        mov     byte [step_event], 0
        cmp     byte [rest_interrupted], 0
        jne     .rest_hook_done
        clc
        ret
.combat_not_handler3:
        cmp     byte [step_handler_mode], 4
        jne     .combat_not_camp
        mov     byte [step_handler_mode], 0
        mov     byte [step_event], 0
        cmp     byte [camp_once], 2
        je      .camp_done
        jmp     .run_fp
.combat_not_camp:
        cmp     byte [step_handler_mode], 2
        jne     .combat_no_vmrun_search
        mov     byte [step_handler_mode], 1
        mov     word [effectreadp], resumepath
        mov     word [effectwritep], effectpath
        jmp     .run_ecl
.combat_no_vmrun_search:
        cmp     byte [step_event], 0
        jne     .run_fp
        clc
        ret
.empty_combat:
        mov dx,outcomepath
        mov ah,41h
        int 21h
        jnc .empty_answer_cleared
        cmp ax,2
        jne .fail
.empty_answer_cleared:
        call secret_next_initial
        jc .fail
        mov     byte [nfail_gate], 18
        call    write_empty_combat_outcome
        jc      .fail
        jmp     .resume_combat_effect
.menu:
        ; CCECL has persisted the v12 VM state. CCMENU writes a separate,
        ; validated GBMO response which the ordinary resume path consumes once.
        ; Preserve the narrative pictures from each menu/ACK chunk before the
        ; next VM resume replaces its effect and sidecar. The renderer uses
        ; fxbuf as scratch, so reload the validated header before dispatch.
        call    present_precombat_pictures
        call    read_effect_header
        jc      .fail
        mov dx,outcomepath
        mov ah,41h                    ; established client-owned menu boundary
        int 21h
        jnc .menu_answer_cleared
        cmp ax,2
        jne .fail
.menu_answer_cleared:
        call secret_next_initial
        jc .fail
        call read_effect_header
        jc .fail
        mov     di, titlepath            ; title buffer is dead after boot art
        mov     si, s_ccmenu
        test    word [fxbuf+6], 0100h    ; FX_HAVE_SIDECAR -> CCFP narration
        jz      .menu_tool_ready
        mov     si, s_ccfp
.menu_tool_ready:
        call    compose_tool_path
        mov     dx, titlepath
        call    file_exists
        jc      .fail
        call    build_menu_tail
        mov     word [runpathp], titlepath
        mov     byte [nfail_gate], 34
        call    do_exec_checked
        jc      .fail
        jmp     .resume_combat_effect
.not_combat:
        cmp     byte [mutation_from_combat], 0
        jne     .combat_effect_geo
        cmp     byte [step_handler_mode], 4
        je      .camp_ready
        cmp     byte [handler3_pending], 0
        je      .not_handler3_pending
        mov     byte [handler3_pending], 0
        mov     byte [step_event], 1
        mov     byte [step_handler_mode], 3
        mov     ax, [handler3_descriptor]
        mov     [step_descriptor], ax
        mov     word [step_facing], 0
        mov     word [effectreadp], effectpath
        mov     word [effectwritep], eventpath
        jmp     .run_ecl
.not_handler3_pending:
        cmp     byte [step_handler_mode], 3
        jne     .not_handler3
        mov     byte [step_handler_mode], 0
        mov     byte [step_event], 0
        cmp     byte [rest_interrupted], 0
        jne     .rest_hook_done
        clc
        ret
.not_handler3:
        cmp     byte [step_handler_mode], 2
        jne     .not_vmrun_step
        call    detect_dqk_natural_handler3
        jc      .vmrun_search_step
        mov     byte [seed_memory_count], 0
        mov     byte [seed_distance_valid], 1
        mov     word [seed_distance], 4
        mov     byte [nfail_gate], 19
        call    write_seed_sidecar
        jc      .fail
        mov     byte [step_skip_persist], 0
        mov     byte [step_handler_mode], 3
        mov     word [step_descriptor], 0
        mov     word [effectreadp], eventpath
        mov     word [effectwritep], effectpath
        jmp     .run_ecl
.vmrun_search_step:
        mov     byte [step_handler_mode], 1
        mov     word [effectreadp], eventpath
        mov     word [effectwritep], effectpath
        jmp     .run_ecl
.not_vmrun_step:
        cmp     byte [step_handler_mode], 1
        jne     .not_search_step
        mov     byte [step_handler_mode], 0
.not_search_step:
        call    read_effect_geo
        jnc     .effect_has_map
        call    use_selected_geo_fallback
        jc      .step_no_map
.effect_has_map:
        call    detect_texture_art
        call    detect_hlib_art
        ; Decode any bounded scene before GEO. Overland PICTURE events can carry
        ; a virtual GEO id which has no CCGEO map, but their presentation does
        ; not depend on that geometry.
        call    prepare_alt_graphics
        jmp     .have_map
.step_no_map:
        cmp     byte [step_event], 0
        jne     .step_event_no_map
        mov     byte [nfail_gate], 20
        call    accept_terminal_ecl_exit
        jc      .fail
        clc
        ret
.step_event_no_map:
        cmp     byte [step_handler_mode], 0
        jne     .step_event_render_fp
        cmp     byte [handler1_valid], 0
        je      .step_event_render_fp
        mov     byte [step_event], 0
        clc
        ret
.step_event_render_fp:
        mov     word [effectreadp], effectpath
        jmp     .run_fp
.have_map:
        call    build_geo_tail
        mov     word [runpathp], child_geo
        call    do_exec_checked
        jc      .scene_wall_fallback

        cmp     byte [hlibflag], 0
        je      .run_fp
        call    build_hlib_tail
        mov     word [runpathp], child_hlib
        call    do_exec_checked
        jc      .hlib_fallback
        jmp     .run_fp
.hlib_fallback:
        mov     byte [hlibflag], 0

.scene_wall_fallback:
        ; A real PICTURE scene may be paired with a virtual overland GEO id
        ; (DoK ECL1#17 uses 127). Render the scene with an ordinary Gen1 wall
        ; map only as a bounded CCFP backing surface; the opaque scene replaces
        ; the viewport and its source pixels remain the authoritative content.
        mov     byte [nfail_gate], 21
        call    build_scene_wall_fallback
        jc      .fail
        jmp     .run_fp

.run_fp:
        cmp     byte [step_once], 0
        je      .run_fp_start
        cmp     word [step_budget], 0
        jne     .run_fp_start
        clc
        ret
.run_fp_start:
        call    prepare_alt_graphics
        call    build_fp_tail
        mov     word [runpathp], child_fp
        mov     byte [nfail_gate], 22
        call    do_exec
        jc      .fail
        mov     ah, 4Dh
        int     21h
        cmp     al, 10
        je      .step_yield
        cmp     al, 11
        je      .camp_yield
        or      al, al
        jnz     .fail
        clc
        ret
.camp_yield:
        mov     byte [learn_active], 0
        mov     word [rest_credit], 0
        mov     byte [nfail_gate], 23
        call    read_step_yield
        jc      .fail
        cmp     byte [camp_once], 1
        jne     .camp_dispatch
        mov     byte [camp_once], 2
.camp_dispatch:
        mov     byte [step_event], 1
        mov     byte [step_skip_persist], 0
        mov     byte [step_handler_mode], 4
        mov     word [effectwritep], effectpath
        jmp     .run_ecl
.load_camp:
        mov     byte [nfail_gate], 24
        call    checkpoint_restore
        jc      .fail
        mov     byte [nfail_gate], 25
        call    sync_cok_roster_count
        jc      .fail
        mov     byte [nfail_gate], 26
        call    write_seed_sidecar
        jc      .fail
        cmp     byte [step_once], 0
        jne     .camp_leave
        cmp     byte [snapflag], 0
        je      .camp_ready
        mov     byte [camp_once], 2
.camp_ready:
        mov     byte [nfail_gate], 27
        cmp     word [fxstatus], 0
        jne     .fail
        mov     byte [checkpoint_camp_active], 1
        mov     byte [step_handler_mode], 0
        mov     byte [step_event], 0
        mov     si, s_camp_menu
        call    puts
        cmp     byte [mem_requested], 0
        je      .mem_done
        mov     byte [mem_requested], 0
        mov     byte [nfail_gate], 28
        call    mem_command
        jc      .fail
.mem_done:
        cmp     byte [camp_once], 2
        jne     .camp_options
        cmp     word [rest_requested], 0
        je      .camp_done
        mov     ax, [rest_requested]
        jmp     .camp_rest
.camp_options:
        ; Rest is shared Gen1 camp behaviour (CoK and DoK both export a
        ; GBPR-shaped roster load_cok_camp_state can read). Memorization
        ; stays CoK-only: mem_select_member's status/active bytes 392/393
        ; and the spell-queue fields mem_* reads at body offsets 30..298 are
        ; never populated for DoK's compact GBD1-tailed body (ccparty.asm's
        ; DOK_META_* fields end at byte 244; clear_charbuf zero-fills the
        ; rest), so every DoK member would read active=0 and be uniformly
        ; rejected. See native/README.md "DoK camp/rest parity".
        call    is_gen1_rest_capable
        jne     .camp_mem_check
        mov     si, s_rest_option
        call    puts
.camp_mem_check:
        cmp     word [gamep], game_cok
        jne     .camp_key
        mov     si, s_mem_option
        call    puts
.camp_key:
        xor     ah, ah
        int     16h
        cmp     al, 27
        je      .camp_leave
        and     al, 0DFh
        cmp     al, 'M'
        je      .camp_mem_key
        cmp     al, 'R'
        je      .camp_rest_key
        cmp     al, 'S'
        je      .camp_save_key
        cmp     al, 'X'
        jne     .camp_key
.camp_leave:
        mov     byte [checkpoint_camp_active], 0
        call    detect_texture_art
        jmp     .have_map
.camp_save_key:
        call    checkpoint_store
        jc      .camp_save_failed
        jmp     .camp_options
.camp_save_failed:
        mov     si, s_checkpoint_failed
        call    puts
        jmp     .camp_options
.camp_mem_key:
        cmp     word [gamep], game_cok
        jne     .camp_key
        call    mem_menu
        jmp     .camp_options
.camp_rest_key:
        call    is_gen1_rest_capable
        jne     .camp_key
        mov     byte [learn_active], 0 ; R starts a new retail rest action
        mov     ax, 96                 ; eight hours in five-minute iterations
.camp_rest:
        mov     byte [nfail_gate], 29
        call    run_cok_rest
        jnc     .rest_success
        cmp     byte [timer_blocked], 0
        je      .fail
        cmp     byte [camp_once], 2
        je      .fail
        jmp     .camp_options
.rest_success:
        cmp     byte [rest_interrupted], 0
        jne     .rest_encounter
        cmp     byte [camp_once], 2
        je      .camp_done
        jmp     .camp_options
.rest_encounter:
        mov     byte [checkpoint_camp_active], 0
        mov     byte [rest_effect_pending], 1
        mov     byte [step_event], 1
        mov     byte [step_handler_mode], 3
        mov     word [effectwritep], eventpath
        jmp     .run_ecl
.rest_hook_done:
        mov     byte [rest_interrupted], 0
        cmp     byte [camp_once], 2
        je      .camp_done
        jmp     .run_fp
.camp_done:
        cmp     byte [checkpoint_save], 0
        je      .camp_return
        ; An interrupted camp is no longer a saveable camp boundary.
        mov     byte [nfail_gate], 30
        cmp     byte [rest_effect_pending], 0
        jne     .fail
        mov     byte [nfail_gate], 31
        call    checkpoint_store
        jc      .fail
.camp_return:
        clc
        ret
.step_yield:
        mov     byte [step_skip_persist], 0
        mov     byte [nfail_gate], 32
        call    read_step_yield
        jc      .fail
        mov     byte [nfail_gate], 33
        call    prepare_dqk_step_host_state
        jc      .fail
        cmp     byte [step_once], 0
        je      .step_continue
        cmp     word [step_budget], 0
        je      .step_continue
        dec     word [step_budget]
.step_continue:
        mov     byte [step_event], 1
        cmp     byte [rest_effect_pending], 0
        jne     .rest_step_state
        ; Keep effectreadp from .ecl_return: after an ACK, that is the
        ; completed v9 resumepath, while effectpath still holds the pending
        ; v15 ACK and is not valid persistent /P state.
.rest_step_state:
        mov     byte [rest_effect_pending], 0
        mov     byte [step_handler_mode], 2
        mov     word [effectwritep], eventpath
        jmp     .run_ecl
.raw_map:
        cmp     word [enginep], eng_hlib
        jne     .raw_gen1
        call    detect_hlib_art
        call    select_raw_hlib_wall_set
        jmp     .have_map
.raw_gen1:
        call    detect_texture_art
        jmp     .have_map
.fail:
        stc
        ret

; Build child_geo/child_fp/wallpath beside GBBOOT.COM, based on argv0 in the PSP
; environment block. Running from C:\GBBOOT.COM yields C:\CCGEO.COM, C:\CCFP.COM,
; and C:\_GBWALL.BIN; running from a tools directory keeps all generated scratch
; there instead of writing into the mounted game folder.
build_tool_paths:
        call    build_tool_prefix
        call    probe_toolpath_short
        cmp     byte [checkpoint_tool_root], 0
        je      .checkpoint_paths_done
        ; A mounted asset drive is input-only.  The VHD launcher opts into
        ; this narrow persistent-state redirect, so GREYBOX.{GBS,TMP,BAK}
        ; lives beside the client while all title data remains on its drive.
        mov     di, checkpoint_file
        mov     si, s_checkpoint_file
        call    compose_tool_path
        mov     di, checkpoint_temp
        mov     si, s_checkpoint_temp
        call    compose_tool_path
        mov     di, checkpoint_backup
        mov     si, s_checkpoint_backup
        call    compose_tool_path
.checkpoint_paths_done:
        mov     di, child_geo
        mov     si, s_ccgeo
        call    compose_tool_path
        mov     di, child_fp
        mov     si, s_ccfp
        call    compose_tool_path
        mov     di, child_ecl
        mov     si, s_ccecl
        call    compose_tool_path
        ; CCFLOW's own child resolver starts CCECL beside this executable.
        ; Keep its path transient in titlepath because the later GBHR writer
        ; deliberately reuses that buffer after title playback is complete.
        mov     di, child_hlib
        mov     si, s_cchlib
        call    compose_tool_path
        mov     di, child_combat
        mov     si, s_cccombat
        call    compose_tool_path
        mov     di, child_efx
        mov     si, s_ccefx
        call    compose_tool_path
        mov     di, child_host
        mov     si, s_cchost
        call    compose_tool_path
        mov     di, child_daa
        mov     si, s_ccdaa
        call    compose_tool_path
        mov     di, child_gb
        mov     si, s_ccgb
        call    compose_tool_path
        mov     di, child_party
        mov     si, s_ccparty
        call    compose_tool_path
        mov     di, child_inventory
        mov     si, s_ccinv
        call    compose_tool_path
        mov     di, inventorypath
        mov     si, s_inventory
        call    compose_tool_path
        mov     di, inventorystagepath
        mov     si, s_inventory_stage
        call    compose_tool_path
        mov     di, inventorycorepath
        mov     si, s_inventory_core
        call    compose_tool_path
        mov     di, learnrequestpath
        mov     si, s_learn_request
        call    compose_tool_path
        mov     di, learnresponsepath
        mov     si, s_learn_response
        call    compose_tool_path
        mov     di, wallpath
        mov     si, s_wallbin
        call    compose_tool_path
        mov     di, viewpath
        mov     si, s_viewbin
        call    compose_tool_path
        mov     di, titlepath
        mov     si, s_titlebin
        call    compose_tool_path
        mov     di, effectpath
        mov     si, s_effectbin
        call    compose_tool_path
        mov     di, effectwallpath
        mov     si, s_effectwgr
        call    compose_tool_path
        mov     di, eventpath
        mov     si, s_eventbin
        call    compose_tool_path
        mov     di, seedpath
        mov     si, s_seedbin
        call    compose_tool_path
        mov     di, rosterpath
        mov     si, s_rosterbin
        call    compose_tool_path
        mov     di, sessionpath
        mov     si, s_sessionbin
        call    compose_tool_path
        mov     di, musicpath
        mov     si, s_musicbin
        call    compose_tool_path
        mov     di, dqkmusicpath
        mov     si, s_dqkmusicbin
        call    compose_tool_path
        mov     di, dokmusicpath
        mov     si, s_dokmusicbin
        call    compose_tool_path
        mov     di, steppath
        mov     si, s_stepbin
        call    compose_tool_path
        mov     di, gbwpath
        mov     si, s_gbwbin
        call    compose_tool_path
        mov     di, altgraphicspath
        mov     si, s_altgraphics
        call    compose_tool_path
        mov     di, altgraphicspath2
        mov     si, s_altgraphics2
        call    compose_tool_path
        mov     di, altimagepath
        mov     si, s_altimage
        call    compose_tool_path
        mov     di, altscenepath
        mov     si, s_altscene
        call    compose_tool_path
        mov     di, picturereplaypath
        mov     si, s_picturereplay
        call    compose_tool_path
        mov     di, picturereplayviewpath
        mov     si, s_picturereplayview
        call    compose_tool_path
        mov     di, combaticonpath
        mov     si, s_combaticon
        call    compose_tool_path
        mov     di, combatpath
        mov     si, s_combbin
        call    compose_tool_path
        mov     di, outcomepath
        mov     si, s_combout
        call    compose_tool_path
        mov     di, combatviewpath
        mov     si, s_combview
        call    compose_tool_path
        mov     di, combatresultpath
        mov     si, s_combresult
        call    compose_tool_path
        mov     di, resumepath
        mov     si, s_resumebin
        call    compose_tool_path
        ret

; Show/decode title art before entering the native session. Gen1 DAX
; profiles with TITLE.DAX display bounded boot frames; DQK /J decodes TITLE.TLB
; to _GBTITLE.RAW so headless runs can prove the title-art bridge without
; hanging for keyboard.
run_cok_intro:
        cmp     word [enginep], eng_dax_gen1
        je      .maybe_run
        cmp     word [gamep], game_dqk
        je      .maybe_dqk
        jmp     .ok
.maybe_run:
        cmp     byte [introflag], 0
        jne     .run
        cmp     byte [snapflag], 0
        jne     .ok
        cmp     byte [step_once], 0
        jne     .ok
        mov     dx, f_title_dax
        call    file_exists
        jc      .ok
.run:
        mov     word [intro_frame], 0
.frame:
        call    tail_begin
        mov     si, s_arg_autoplay
        call    tail_append_str
        cmp     word [gamep], game_cok
        je      .krynn_overlay
        cmp     word [gamep], game_dok
        jne     .overlay_space_done ; other profiles retain their two-frame preview
.krynn_overlay:
        cmp     word [intro_frame], 0
        je      .no_overlay
        mov     si, s_arg_overlay
        call    tail_append_str
        mov     ax, [intro_frame]
        inc     ax                  ; frame 1/2 use TITLE blocks 2/3 as bands
        call    tail_append_dec
        call    tail_append_space
        cmp     word [gamep], game_dok
        je      .dok_overlay_xy
        ; CoK recovered TITLE.DAX placements: block2=(40,8), block3=(0,8).
        cmp     word [intro_frame], 1
        jne     .cok_last_xy
        mov     ax, 40
        call    tail_append_dec
        call    tail_append_space
        mov     ax, 8
        call    tail_append_dec
        jmp     .no_overlay
.cok_last_xy:
        xor     ax, ax
        call    tail_append_dec
        call    tail_append_space
        mov     ax, 8
        call    tail_append_dec
        jmp     .no_overlay
.dok_overlay_xy:
        ; DoK recovered TITLE.DAX placements: block2=(0,88), block3=(0,87).
        xor     ax, ax
        call    tail_append_dec
        call    tail_append_space
        cmp     word [intro_frame], 1
        jne     .dok_last_y
        mov     ax, 88
        call    tail_append_dec
        jmp     .no_overlay
.dok_last_y:
        mov     ax, 87
        call    tail_append_dec
.no_overlay:
        cmp     word [intro_frame], 0
        je      .overlay_space_done
        call    tail_append_space
.overlay_space_done:
        mov     si, f_title_dax
        call    tail_append_str
        call    tail_append_space
        mov     ax, [intro_frame]
        cmp     ax, 0
        je      .base_index_ready
        mov     ax, 1               ; later composed title screens share base block 1
.base_index_ready:
        call    tail_append_dec
        cmp     word [intro_frame], 0
        jne     .tail_done
        cmp     word [gamep], game_cok
        je      .cok_music
        cmp     word [gamep], game_dok
        jne     .tail_done
        mov     dx, dokmusicpath
        jmp     .maybe_music
.cok_music:
        mov     dx, musicpath
.maybe_music:
        call    file_exists
        jc      .tail_done
        mov     si, s_arg_music
        call    tail_append_str
        cmp     word [gamep], game_dok
        jne     .append_cok_music
        mov     si, dokmusicpath
        jmp     .append_music
.append_cok_music:
        mov     si, musicpath
.append_music:
        call    tail_append_str
.tail_done:
        call    tail_finish
        mov     word [runpathp], child_gb
        call    do_exec_checked
        jc      .exec_fail
        inc     word [intro_frame]
        cmp     word [gamep], game_cok
        je      .krynn_frames
        cmp     word [gamep], game_dok
        je      .krynn_frames
        cmp     word [intro_frame], 2
        jb      .frame
        jmp     .ok
.krynn_frames:
        cmp     word [intro_frame], 3
        jb      .frame
.ok:
        clc
        ret
.exec_fail:
        stc
        ret

.maybe_dqk:
        cmp     byte [introflag], 0
        je      .ok
        mov     dx, f_disk1_title_tlb
        call    file_exists
        jnc     .dqk_disk_title
        mov     dx, f_title_tlb
        call    file_exists
        jc      .exec_fail
        mov     word [titlelibp], f_title_tlb
        jmp     .dqk_tail
.dqk_disk_title:
        mov     word [titlelibp], f_disk1_title_tlb
.dqk_tail:
        call    tail_begin
        mov     si, s_arg_dump
        call    tail_append_str
        mov     si, [titlelibp]
        call    tail_append_str
        call    tail_append_space
        xor     ax, ax
        call    tail_append_dec
        call    tail_append_space
        mov     si, titlepath
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_hlib
        call    do_exec_checked
        jc      .exec_fail
        mov     dx, dqkmusicpath
        call    file_exists
        jc      .ok
        call    tail_begin
        mov     si, s_arg_autoplay
        call    tail_append_str
        mov     si, s_arg_music
        call    tail_append_str
        mov     si, dqkmusicpath
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_gb
        call    do_exec_checked
        jc      .exec_fail
        jmp     .ok

; Native replacement for the otherwise missing interactive title seam.  The
; retail browser reconstruction establishes P/D as the title hotkeys; use the
; recovered original ECL entries, never a synthetic demo map.  Headless /X and
; /T routes deliberately bypass this wait so existing regression flows remain
; deterministic.
choose_krynn_title_mode:
        ; Direct recovered demo entries are the deterministic headless test
        ; route. They select exactly the same state as title-key D; /X later
        ; exits after combat instead of re-entering the retail title loop.
        cmp     byte [entry_override], 0
        je      .check_bypass
        cmp     word [gamep], game_cok
        jne     .direct_dok
        cmp     word [entry_override_num], 57
        jne     .check_bypass
        mov     byte [demoflag], 1
        jmp     .check_bypass
.direct_dok:
        cmp     word [gamep], game_dok
        jne     .check_bypass
        cmp     word [entry_override_num], 2
        jne     .check_bypass
        mov     byte [demoflag], 1
.check_bypass:
        cmp     byte [snapflag], 0
        jne     .ok
        cmp     byte [step_once], 0
        jne     .ok
        cmp     word [gamep], game_cok
        je      .show
        cmp     word [gamep], game_dok
        jne     .ok
.show:
        mov     si, s_title_choice
        call    puts
        mov     ah, 00h
        int     1Ah
        mov     [title_wait_tick], dx
.wait:
        mov     ah, 01h
        int     16h
        jnz     .key
        mov     ah, 00h
        int     1Ah
        sub     dx, [title_wait_tick]
        cmp     dx, 546             ; about 30 seconds at 18.2 Hz
        jb      .wait
        mov     al, 'D'
        jmp     .choose
.key:
        xor     ax, ax
        int     16h
.choose:
        and     al, 0DFh
        cmp     al, 'P'
        je      .ok
        cmp     al, 'D'
        jne     .wait
        mov     byte [demoflag], 1
        cmp     word [gamep], game_cok
        jne     .dok
        mov     word [eclp], f_ecl2_dax
        mov     word [eclid], 57
        mov     word [geop], f_geo2_dax
        mov     word [mapid], 64
        jmp     .ok
.dok:
        mov     word [eclp], f_ecl1_dax
        mov     word [eclid], 2
        mov     word [geop], f_geo1_dax
        mov     word [mapid], 32
.ok:
        clc
        ret

; CF=1 when [gamep] is a party title: the game_* labels are one consecutive run
; game_cok..game_gen1 (frua/hlib_data follow). Preserves every register.
party_game:
        push    ax
        mov     ax, [gamep]
        sub     ax, game_cok
        cmp     ax, game_frua - game_cok
        pop     ax
        ret

; Materialize a lossless native roster before ECL/exploration. DAX-family Gen1
; profiles use the Gen1 GBPR body; DoK uses the compact GBD1 tail. A valid empty
; GBPR is intentional: the following party-menu slice can distinguish a new
; campaign from a missing/corrupt loader result without guessing from GBPS.
run_cok_party:
        cmp     byte [secret_profile], 0
        jne     secret_boot_party
        call    party_game
        jnc     .ok
.run:
        cmp     byte [party_create_count], 0
        jne     .create_loop
        call    tail_begin
        cmp     word [gamep], game_dok
        je      .dok_arg
        cmp     word [gamep], game_dqk
        je      .dqk_arg
        jmp     .maybe_menu
.dok_arg:
        mov     si, s_arg_dok_party
        call    tail_append_str
        jmp     .maybe_menu
.dqk_arg:
        mov     si, s_arg_dqk_qsv_party
        call    tail_append_str
.maybe_menu:
        cmp     byte [snapflag], 0
        jne     .path
        cmp     byte [step_once], 0
        jne     .path
        mov     si, s_arg_party_menu
        call    tail_append_str
.path:
        call    tail_append_space
        mov     si, rosterpath
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_party
        call    do_exec_checked
        jc      .fail
.ok:
        clc
        ret
.fail:
        stc
        ret

.create_loop:
        mov     byte [party_create_index], 0
.create_next:
        mov     al, [party_create_index]
        cmp     al, [party_create_count]
        jae     .ok
        call    tail_begin
        cmp     word [gamep], game_dok
        je      .create_compact_arg
        cmp     word [gamep], game_dqk
        jne     .create_arg
        mov     si, s_arg_dok_party
        call    tail_append_str
        mov     si, s_arg_party_id
        call    tail_append_str
        mov     al, '3'
        call    tail_append_char
        jmp     .create_arg
.create_compact_arg:
        mov     si, s_arg_dok_party
        call    tail_append_str
.create_arg:
        mov     si, s_arg_party_create
        call    tail_append_str
        movzx   bx, byte [party_create_index]
        mov     ax, bx
        shl     ax, 4
        mov     si, party_create_names
        add     si, ax
        call    tail_append_str
        call    tail_append_space
        movzx   bx, byte [party_create_index]
        mov     al, [party_create_classes+bx]
        call    tail_append_char
        ; (falls through)
.path_create:
        call    tail_append_space
        mov     si, rosterpath
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_party
        call    do_exec_checked
        jc      .fail
        inc     byte [party_create_index]
        jmp     .create_next

; GBPR is authoritative after the party menu because it may contain characters
; created natively rather than SAVE\CHRDATA files. Feed verified GBPR fields
; back into GBPS so ECL queries and the later CCCOMBAT /P gate see the same
; roster.
sync_cok_roster_count:
        cmp     byte [secret_profile], 0
        jne     secret_boot_count
        call    party_game
        jnc     .ok
.run:
        cmp     byte [seed_count_explicit], 0
        jne     .ok
        mov     ax, 3D00h
        mov     dx, rosterpath
        int     21h
        jc      .fail
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, rosterhdr
        int     21h
        jc      .close_fail
        cmp     ax, 16
        jne     .close_fail
        mov     si, rosterhdr
        call    validate_gbpr_header
        jc      .close_fail
        mov     [auto_roster_expected_len], ax
        mov     [auto_roster_left], cx
        mov     bx, [auto_fh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_fail
        or      dx, dx
        jnz     .close_fail
        cmp     ax, [auto_roster_expected_len]
        jne     .close_fail
        mov     bx, [auto_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 16
        int     21h
        jc      .close_fail
        mov     ax, [auto_roster_left]
        or      ax, ax
        jnz     .nonempty_count
        cmp     word [gamep], game_cok
        jne     .close_ok
        mov     [seed_count], ax
        mov     byte [seed_count_valid], 1
        jmp     .close_ok
.nonempty_count:
        mov     [auto_roster_left], ax
        cmp     byte [seed_count_explicit], 0
        jne     .count_done
        mov     [seed_count], ax
        mov     byte [seed_count_valid], 1
.count_done:
        cmp     word [gamep], game_cok
        jne     .check_dok_moves
        cmp     byte [seed_thief_explicit], 0
        jne     .read_records
        mov     byte [seed_thief_matrix_count], 0
        call    clear_seed_thief_matrix
        jmp     .read_records
.check_dok_moves:
        cmp     word [gamep], game_dok
        je      .clear_compact_moves
        cmp     word [gamep], game_dqk
        jne     .read_records
.clear_compact_moves:
        cmp     byte [seed_move_explicit], 0
        jne     .read_records
        mov     byte [seed_move_count], 0
        call    clear_seed_moves
.read_records:
        mov     ax, [auto_roster_left]
        or      ax, ax
        jz      .close_ok
.record_loop:
        mov     bx, [auto_fh]
        mov     ah, 3Fh
        mov     cx, 410
        mov     dx, rosterbuf
        int     21h
        jc      .close_fail
        cmp     ax, 410
        jne     .close_fail
        mov     al, [rosterbuf+1]
        cmp     al, 1
        jb      .record_next
        cmp     al, 15
        ja      .record_next
        cmp     word [gamep], game_dok
        je      .record_dok
        cmp     word [gamep], game_dqk
        je      .record_dok
        call    party_game
        jc      .record_cok
        jmp     .record_next
.record_cok:
        cmp     byte [seed_thief_explicit], 0
        jne     .record_next
        cmp     byte [seed_thief_matrix_count], PARTY_THIEF_MAX
        jae     .record_next
        movzx   bx, byte [seed_thief_matrix_count]
        shl     bx, 3
        mov     di, seed_thief_matrix
        add     di, bx
        ; .record_cok is reached by ELEVEN profiles (CoK, Pool, Curse, Secret,
        ; Gateway, Treasures, PoD, NWN, Buck, Matrix, generic Gen1), and the retail
        ; record is NOT one layout across them: Champions of Krynn is 409 bytes,
        ; Curse of the Azure Bonds 422 and Pool of Radiance 285 (measured from each
        ; title's own shipped CHRDATA saves). So a single hard-coded offset cannot
        ; be right for all eleven, and the fix is gated rather than applied wholesale.
        ; CoK gets its measured 219; the other ten keep the constant they had. That
        ; is NOT an endorsement of 139 for them -- it is FRUA's offset and none of
        ; them is FRUA -- it is a refusal to extend a one-title measurement to ten
        ; titles that were never measured. Whoever measures them owes this site a
        ; per-profile offset instead of a second special case.
        mov     si, rosterbuf+1+139
        cmp     word [gamep], game_cok
        jne     .cok_off_ready
        mov     si, rosterbuf+1+COK_CCH_THIEF_OFF
.cok_off_ready:
        mov     cx, PARTY_THIEF_SKILL_COUNT
.cok_copy:
        lodsb
        mov     [di], al
        inc     di
        loop    .cok_copy
        inc     byte [seed_thief_matrix_count]
        jmp     .record_next
.record_dok:
        cmp     word [rosterbuf+1+216], 'GB'
        jne     .record_next
        cmp     word [rosterbuf+1+216+2], 'D1'
        jne     .record_next
        test    word [rosterbuf+1+216+4], 1
        jz      .record_next
        cmp     byte [seed_thief_explicit], 0
        jne     .dok_move
        call    add_dok_thief_matrix_row
.dok_move:
        cmp     byte [seed_move_explicit], 0
        jne     .record_next
        mov     ax, [rosterbuf+1+216+22]
        or      ax, ax
        jz      .record_next
        call    add_seed_move
.record_next:
        dec     word [auto_roster_left]
        jnz     .record_loop
.close_ok:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.ok:
        clc
        ret
.close_fail:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret

; DoK compact GBPR rows do not carry CoK's raw CCH thief bytes. CCPARTY stores
; its inferred class/level in the GBD1 tail; when that class is thief (4), write
; the AD&D base thief-skill row so selected-player 0x7CA5..0x7CAC reads work.
add_dok_thief_matrix_row:
        push    ax
        push    bx
        push    cx
        push    si
        push    di
        cmp     byte [seed_thief_matrix_count], PARTY_THIEF_MAX
        jae     .done
        cmp     byte [rosterbuf+1+216+18], 4
        jne     .done
        mov     ax, [rosterbuf+1+216+16]
        cmp     ax, 1
        jae     .level_min_ok
        mov     ax, 1
.level_min_ok:
        cmp     ax, 12
        jbe     .level_max_ok
        mov     ax, 12
.level_max_ok:
        dec     ax
        shl     ax, 3
        mov     si, dok_thief_base_rows
        add     si, ax
        movzx   bx, byte [seed_thief_matrix_count]
        shl     bx, 3
        mov     di, seed_thief_matrix
        add     di, bx
        mov     cx, PARTY_THIEF_SKILL_COUNT
.copy:
        lodsb
        mov     [di], al
        inc     di
        loop    .copy
        inc     byte [seed_thief_matrix_count]
.done:
        pop     di
        pop     si
        pop     cx
        pop     bx
        pop     ax
        ret

dok_thief_base_rows:
        db 30,25,20,15,10,10,85,0
        db 35,29,25,21,15,10,86,0
        db 40,33,30,27,20,15,87,0
        db 45,37,35,33,25,15,88,20
        db 50,42,40,40,31,20,90,25
        db 55,47,45,37,20,92,30,60
        db 52,50,55,43,25,94,35,65
        db 57,55,62,49,25,96,40,70
        db 62,60,70,56,30,98,45,80
        db 67,65,78,63,30,99,50,90
        db 72,70,86,70,35,99,60,100
        db 100,77,75,94,77,35,99,65

; Apply source-ordered ECL DAMAGE script effects that are unambiguously
; native-owned before either ordinary continuation or a COMBAT handoff:
; automatic party-wide damage and selected-member/no-save damage with exported
; LOAD_CHARACTER context. Saving throws and random targets stay preserved in
; GBSX until native save/targeting/death state is strong enough.
apply_effect_damage_roster:
        ; mutation_bridge publishes [damage_ack] as the GBMB damage watermark;
        ; CCECL's ir_apply zeroes DAMAGE records below it so a continuation
        ; GBEF cannot re-apply them. 973aa1ac dropped both writes.
        mov     word [damage_ack], 0
        ; DoK compact rosters have two authoritative storage layers. CCHOST
        ; owns the low-slot retail .GAM mirror, while this old in-process body
        ; can only update GBD1. Keep other title paths here and delegate DoK
        ; through the same validated /D helper used by saturated streams.
        cmp     word [gamep], game_dok
        jne     .local
        call    apply_sidecar_damage_roster
        ret
.local:
        call    party_game
        jnc     .ok
.run:
        mov     ax, 3D00h
        mov     dx, [effectreadp]
        int     21h
        jc      .fail
        mov     [efxfh], ax
        mov     bx, [efxfh]
        xor     dx, dx
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'GB'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, 2
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'EF'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, GBEF_SCRIPT_MAGIC_OFF
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'GB'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, GBEF_SCRIPT_MAGIC_OFF+2
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 'SX'
        jne     .close_fail
        mov     bx, [efxfh]
        mov     dx, GBEF_SCRIPT_COUNT_OFF
        call    read_effect_word_at
        jc      .close_fail
        ; Accept up to GBEF_SCRIPT_CAP events -- the SAME constant the whole
        ; GBSX buffer layout above is derived from (GBEF_SCRIPT_BYTES,
        ; GBEF_SCRIPT_TEXT_OFF, GBEF_SETUP_OFF all scale by it). This was a
        ; separate GBEF_SCRIPT_EVENT_MAX equ 16 with exactly one use, this
        ; compare, so a GBSX declaring 17..64 events was rejected even though
        ; every buffer it feeds was already sized for 64 and the scan below
        ; streams straight out of the file with no fixed-size array of its
        ; own. Deleted rather than raised: a second constant can drift from
        ; the buffer that justifies it, and this one had. Zero byte cost --
        ; 16 and 64 both assemble to the 3-byte 83 F8 ib form.
        cmp     ax, GBEF_SCRIPT_CAP
        ja      .close_fail
        mov     [damage_event_count], ax
        mov     word [damage_event_index], 0
.scan:
        mov     ax, [damage_event_index]
        cmp     ax, [damage_event_count]
        jae     .scan_done
        mov     bx, GBEF_SCRIPT_EVENT_SIZE
        mul     bx
        add     ax, GBEF_SCRIPT_EVENTS_OFF
        mov     [damage_event_off], ax
        mov     bx, [efxfh]
        mov     dx, ax
        call    read_effect_word_at
        jc      .close_fail
        cmp     ax, 002Eh
        jne     .next
        mov     bx, [efxfh]
        mov     dx, [damage_event_off]
        add     dx, 2
        call    read_effect_word_at
        jc      .close_fail
        mov     [damage_argc], ax
        cmp     ax, 5
        jb      .next
        mov     bx, [efxfh]
        mov     dx, [damage_event_off]
        add     dx, 4
        call    read_effect_word_at
        jc      .close_fail
        mov     [damage_control], ax
        mov     word [damage_target_member], 0
        and     ax, 00E0h
        cmp     ax, 00E0h
        je      .policy_ok
        mov     ax, [damage_control]
        test    ax, 0080h
        jz      .next
        test    ax, 0040h
        jnz     .next
        cmp     word [damage_argc], 7
        jb      .next
        mov     bx, [efxfh]
        mov     dx, [damage_event_off]
        add     dx, 12
        call    read_effect_word_at
        jc      .close_fail
        test    ax, 0080h
        jz      .next
        test    ax, 0007h
        jnz     .next
        mov     bx, [efxfh]
        mov     dx, [damage_event_off]
        add     dx, 14
        call    read_effect_word_at
        jc      .close_fail
        or      ax, ax
        jz      .next
        mov     bx, [efxfh]
        mov     dx, [damage_event_off]
        add     dx, 16
        call    read_effect_word_at
        jc      .close_fail
        or      ax, ax
        jz      .next
        mov     [damage_target_member], ax
.policy_ok:
        mov     bx, [efxfh]
        mov     dx, [damage_event_off]
        add     dx, 6
        call    read_effect_word_at
        jc      .close_fail
        mov     [damage_count], ax
        mov     bx, [efxfh]
        mov     dx, [damage_event_off]
        add     dx, 8
        call    read_effect_word_at
        jc      .close_fail
        mov     [damage_sides], ax
        mov     bx, [efxfh]
        mov     dx, [damage_event_off]
        add     dx, 10
        call    read_effect_word_at
        jc      .close_fail
        mov     [damage_bonus], ax
        mov     ax, [damage_count]
        mul     word [damage_sides]
        or      dx, dx
        jz      .mul_ok
        mov     ax, 0FFFFh
.mul_ok:
        add     ax, [damage_bonus]
        jnc     .sum_ok
        mov     ax, 0FFFFh
.sum_ok:
        or      ax, ax
        jz      .next
        mov     [damage_value], ax
        call    apply_damage_value_to_roster
        jc      .close_fail
.next:
        inc     word [damage_event_index]
        jmp     .scan
.scan_done:
        push    ax
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        jc      .fail
        mov     [damage_ack], ax
.ok:
        clc
        ret
.close_fail:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret

apply_damage_value_to_roster:
        mov     ax, 3D02h
        mov     dx, rosterpath
        int     21h
        jc      .fail
        mov     [gbcr_roster_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, rosterhdr
        int     21h
        jc      .close_fail
        cmp     ax, 16
        jne     .close_fail
        mov     si, rosterhdr
        call    validate_gbpr_header
        jc      .close_fail
        cmp     word [rosterhdr+4], 1
        jne     .damage_identity_ok
        test    word [rosterhdr+10], 1
        jnz     .close_fail
.damage_identity_ok:
        mov     [damage_roster_count], cx
        mov     [damage_roster_len], ax
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_fail
        or      dx, dx
        jnz     .close_fail
        cmp     ax, [damage_roster_len]
        jne     .close_fail
        mov     word [gbcr_index], 0
.loop:
        mov     ax, [gbcr_index]
        cmp     ax, [damage_roster_count]
        jae     .close_ok
        mov     bx, 410
        mul     bx
        add     ax, 16
        mov     [gbcr_entry_off], ax
        mov     ax, [damage_target_member]
        or      ax, ax
        jz      .patch_current
        mov     bx, [gbcr_index]
        inc     bx
        cmp     ax, bx
        jne     .next
.patch_current:
        mov     dx, [gbcr_entry_off]
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, gbcr_slot
        int     21h
        jc      .close_fail
        cmp     ax, 1
        jne     .close_fail
        test    word [rosterhdr+10], 1
        jnz     .dok_patch
        mov     ax, [gbcr_entry_off]
        add     ax, 1+407              ; CoK current HP; preserve maximum at 98
        mov     [damage_hp_off], ax
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, gbcr_hp_byte
        int     21h
        jc      .close_fail
        cmp     ax, 1
        jne     .close_fail
        xor     ax, ax
        mov     al, [gbcr_hp_byte]
        cmp     ax, [damage_value]
        ja      .cok_sub
        xor     ax, ax
        jmp     .cok_store
.cok_sub:
        sub     ax, [damage_value]
.cok_store:
        mov     [gbcr_hp], ax
        mov     [gbcr_hp_byte], al
        mov     dx, [damage_hp_off]
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 1
        mov     dx, gbcr_hp_byte
        int     21h
        jc      .close_fail
        cmp     ax, 1
        jne     .close_fail
        mov     word [gbcr_xp_share], 0
        call    write_cok_save_result
        jc      .close_fail
        jmp     .next
.dok_patch:
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 4
        mov     dx, gbcr_magic
        int     21h
        jc      .close_fail
        cmp     ax, 4
        jne     .close_fail
        cmp     word [gbcr_magic], 'GB'
        jne     .next
        cmp     word [gbcr_magic+2], 'D1'
        jne     .next
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+6
        mov     [damage_hp_off], ax
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 2
        mov     dx, gbcr_hp
        int     21h
        jc      .close_fail
        cmp     ax, 2
        jne     .close_fail
        mov     ax, [gbcr_hp]
        cmp     ax, [damage_value]
        ja      .dok_sub
        xor     ax, ax
        jmp     .dok_store
.dok_sub:
        sub     ax, [damage_value]
.dok_store:
        mov     [gbcr_hp], ax
        mov     dx, [damage_hp_off]
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, gbcr_hp
        int     21h
        jc      .close_fail
        cmp     ax, 2
        jne     .close_fail
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+4
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 2
        mov     dx, gbcr_meta_flags
        int     21h
        jc      .close_fail
        cmp     ax, 2
        jne     .close_fail
        or      word [gbcr_meta_flags], 2
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+4
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, gbcr_meta_flags
        int     21h
        jc      .close_fail
        cmp     ax, 2
        jne     .close_fail
.next:
        inc     word [gbcr_index]
        jmp     .loop
.close_ok:
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Eh
        int     21h
        jc      .fail
.ok:
        clc
        ret
.close_fail:
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret

write_cok_save_result:
        mov     al, [gbcr_slot]
        test    al, 80h
        jnz     .ok
        cmp     al, 1
        jb      .ok
        cmp     al, 6
        ja      .ok
        add     al, '0'
        mov     [coksavepath+12], al
        mov     ax, 3D02h
        mov     dx, coksavepath
        int     21h
        jc      .ok
        mov     [gbcr_save_fh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 407                ; retail CoK current HP, not maximum
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, 1
        mov     dx, gbcr_hp_byte
        int     21h
        jc      .close_fail
        cmp     ax, 1
        jne     .close_fail
        mov     bx, [gbcr_save_fh]
        mov     dx, 392
        call    write_cok_condition
        jc      .close_fail
        cmp     word [gbcr_xp_share], 0
        je      .close_ok
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, COK_CCH_XP_OFF
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, 4
        mov     dx, gbcr_xp_cur
        int     21h
        jc      .close_fail
        cmp     ax, 4
        jne     .close_fail
.close_ok:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
.ok:
        clc
        ret
.close_fail:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
        stc
        ret

; BX = writable file, DX = CoK status byte offset (roster body or raw save).
; GBCR dead -> retail 6; newly unconscious normal member -> retail 4.
; Retain dying=5 and other pre-existing conditions: the GBCR enum cannot
; represent their extra state. In particular, unconscious is not a cure.
write_cok_condition:
        mov     [cok_status_off], dx
        xor     cx, cx
        mov     ax, 4200h
        int     21h
        jc      .fail
        mov     dx, cok_status_byte
        mov     cx, 1
        mov     ah, 3Fh
        int     21h
        jc      .fail
        cmp     ax, 1
        jne     .fail
        cmp     word [gbcr_cond], 2
        je      .dead
        cmp     word [gbcr_cond], 1
        jne     .ok
        cmp     byte [cok_status_byte], 0
        jne     .ok
        mov     byte [cok_status_byte], 4
        jmp     .write
.dead:
        mov     byte [cok_status_byte], 6
.write:
        mov     dx, [cok_status_off]
        xor     cx, cx
        mov     ax, 4200h
        int     21h
        jc      .fail
        mov     dx, cok_status_byte
        mov     cx, 1
        mov     ah, 40h
        int     21h
        jc      .fail
        cmp     ax, 1
        jne     .fail
.ok:
        clc
        ret
.fail:
        stc
        ret


; After a validated GBCR v2 and successful roster update, publish CoK's final
; combat RNG into the paused GBEF before CCECL resumes. GBEF has no file CRC.

; CCHOST owns GBCR validation and post-combat mutation. GBBOOT publishes every
; mutable input in GBHR v1 and passes only the request pathname to the helper.
apply_combat_result_roster:
        cmp     byte [secret_party], 1
        jne     .generic
        jmp     secret_next_complete
.generic:
        call    write_host_result_state
        jc      .fail
        call    build_host_result_tail
        mov     word [runpathp], child_host
        call    do_exec_checked
        jc      .fail
        clc
        ret
.fail:  stc
        ret

; CCFLOW marks a terminal GBEF only after it has written and closed its exact
; same-stem GBSL stream. CCHOST validates that stream's header/count/extent
; before opening GBPR, then applies the existing supported DAMAGE policy.
; plan §27.5 / §28.5: `/N`-bound effect sidecars now carry a DoK GBDJ direct-
; DAMAGE journal (` /J`).  host_tail_exec is a shared tail-call ending: the
; boot-time /R recovery block above also calls it directly, after building
; its own ` /R <roster>` tail, so the two exec paths cannot drift apart.
apply_sidecar_damage_roster:
        cmp     byte [secret_profile], 1
        je      secret_inspect_sidecar
        call    tail_begin
        mov     si, s_arg_host_damage
        call    tail_append_str
        mov     si, [effectreadp]
        call    tail_append_str           ; was tail_append_toolpath
        call    tail_append_space
        mov     si, rosterpath
        call    tail_append_str           ; was tail_append_toolpath
        cmp     word [gamep], game_dok
        jne     host_tail_exec
        mov     si, s_arg_cok_rng         ; ' /J'
        call    tail_append_str
host_tail_exec:
        call    tail_finish
        mov     word [runpathp], child_host
        jmp     do_exec_checked           ; CF is already the contract

; DQK ECL ADD_NPC joins: CCHOST /N <GBEF> <MONCHA.GLB> <GBPR>. A full GBPR
; (exit 2, the stock six-hero QSV party) is reported and the join deferred --
; making it fatal turns every ADD_NPC route red. Cap is 8 rows (DQK).
apply_npc_joins:
        mov     dx, rosterpath           ; no roster yet: nothing to join
        call    file_exists
        jc      .skip
        call    detect_mon_archive
        cmp     word [monp], 0
        je      .fail
        call    tail_begin
        mov     si, s_arg_host_npc
        call    tail_append_str
        mov     si, [effectreadp]
        call    tail_append_str
        call    tail_append_space
        mov     si, [monp]
        call    tail_append_str
        call    tail_append_space
        mov     si, rosterpath
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_host
        call    do_exec
        jc      .fail
        mov     ah, 4Dh
        int     21h
        cmp     al, 2                    ; CCHOST /N exit 2: party full
        je      .full
        neg     al                       ; any other nonzero status is fatal
        ret                              ; CF=0 after NEG only when AL was 0
.skip:  clc
        ret
.full:  mov     si, s_npc_full
        call    puts
        clc
        ret
.fail:  stc
        ret

build_host_result_tail:
        call    tail_begin
        mov     si, s_arg_host_state
        call    tail_append_str
        mov     si, titlepath
        call    tail_append_toolpath
        call    tail_finish
        ret

; GBHR v1: magic, version, mode, zero reservation, and three canonical 112-byte
; paths. fxbuf is dead after the pre-combat decode; titlepath is dead after title
; playback and is reused for this request path just as CCEFX reuses it later.
write_host_result_state:
        mov     di, titlepath
        mov     si, s_host_result
        call    compose_tool_path
        mov     di, fxbuf
        xor     ax, ax
        mov     cx, 173
        rep     stosw
        mov     word [fxbuf], 'GB'
        mov     word [fxbuf+2], 'HR'
        mov     word [fxbuf+4], 1
        mov     ax, 3
        cmp     byte [secret_party], 1
        jne     .ordinary_mode
        mov     word [fxbuf+4], 2
        mov     ax, 4
        jmp     .mode_done
.ordinary_mode:
        cmp     word [gamep], game_cok
        jne     .mode_non_cok
        mov     ax, 1
        jmp     .mode_done
.mode_non_cok:
        cmp     word [gamep], game_dok
        je      .mode_done
        cmp     word [gamep], game_dqk
        je      .mode_done
        call    party_game
        jnc     .mode_done
.gen1:  mov     ax, 2
.mode_done:
        mov     [fxbuf+6], ax
        mov     si, combatresultpath
        mov     di, fxbuf+10
        call    copy_host_path
        mov     si, rosterpath
        mov     di, fxbuf+122
        call    copy_host_path
        mov     si, [effectreadp]
        mov     di, fxbuf+234
        call    copy_host_path
        mov     dx, titlepath
        xor     cx, cx
        mov     ah, 3Ch
        int     21h
        jc      .fail
        mov     [efxfh], ax
        mov     bx, ax
        mov     cx, 346
        mov     dx, fxbuf
        mov     ah, 40h
        int     21h
        push    ax
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 346
        jne     .fail
        clc
        ret
.fail:  stc
        ret

copy_host_path:
        lodsb
        stosb
        or      al, al
        jne     copy_host_path
        ret
; Shared camp/rest eligibility for both Gen1 titles that export a
; GBPR-shaped roster (ccparty.asm ENTRY_SIZE=410): CoK, whose body IS the
; full 409-byte CCH record, and DoK, whose body is its 216-byte .GAM record
; plus a DOK_META_* combat tail ending at byte 244. Consolidates what were
; 5 separate inline `cmp word [gamep], game_cok` gates (camp menu's rest
; option, R key, load_cok_camp_state, checkpoint_store, checkpoint_restore).
; Deliberately NOT used for memorization -- see the .camp_options comment.
is_gen1_rest_capable:
        cmp     word [gamep], game_cok
        je      .yes
        cmp     word [gamep], game_dok
.yes:
        ret

; AL = stable on-disk GBCP game id (1 CoK, 2 DoK), checked on restore so a
; checkpoint written by one Gen1 title is never silently accepted by the
; other. Never a raw COM pointer, matching the original CoK-only comment.
checkpoint_game_id:
        mov     al, 1
        cmp     word [gamep], game_cok
        je      .ret
        mov     al, 2
.ret:
        ret

; CoK retail rest: five-minute iterations, one HP per 288 iterations,
; period/chance from ECL 7ED2/7ED3. The existing native ECL RNG is continued.
; AX=requested iterations. SFX durations use five minutes per iteration.
%include "cokrng.inc"
run_cok_rest:
        mov     [rest_left], ax
        mov     word [rest_elapsed], 0
        mov     byte [timer_blocked], 0
        mov     byte [rest_interrupted], 0
        call    load_cok_camp_state
        jc      .fail
        call    rest_learn_prepare
        jc      .fail
.tick:
        cmp     word [rest_left], 0
        je      .persist
        mov     si, rest_fx+GBEF_CLOCK_OFF+4
        mov     ax, 5
        mov     bx, 1
        call    lunar_plan
        jnc     .lunar_ready
        mov     byte [timer_blocked], 1
        mov     si, s_lunar_full
        call    puts
        jmp     .persist
.lunar_ready:
        call    rest_timer_preflight
        jc      .persist
        mov     byte [learn_planned], 0
        call    rest_learn_needs_plan
        jnc     .learning_ready
        mov     al, 1
        call    rest_learn_plan
        jc      .learning_blocked
        call    rest_learn_activate
        jc      .learning_blocked
        mov     byte [learn_planned], 1
.learning_ready:
        call    rest_timer_tick
        jc      .persist
        dec     word [rest_left]
        inc     word [rest_elapsed]
        add     word [fs:rest_fx+GBEF_CLOCK_OFF+6], 5
        xor     si, si
.clock:
        mov     ax, [fs:rest_fx+GBEF_CLOCK_OFF+4+si]
        xor     dx, dx
        div     word [rest_radices+si]
        mov     [fs:rest_fx+GBEF_CLOCK_OFF+4+si], dx
        cmp     si, 12
        je      .clock_done
        add     [fs:rest_fx+GBEF_CLOCK_OFF+6+si], ax
        add     si, 2
        jmp     .clock
.clock_done:
        call    lunar_apply
        inc     word [rest_credit]
        cmp     word [rest_credit], 288
        jb      .learn
        mov     word [rest_credit], 0
        call    rest_heal_party
.learn:
        cmp     byte [learn_planned], 1
        jne     .ordinary_learning
        call    rest_learn_apply
        jmp     .encounter
.ordinary_learning:
        call    rest_learn_tick
.encounter:
        cmp     word [rest_period], 0
        je      .tick
        inc     word [rest_enc_count]
        mov     ax, [rest_enc_count]
        cmp     ax, [rest_period]
        jb      .tick
        mov     word [rest_enc_count], 0
        mov     eax, [fs:rest_fx+126]
        mov     ecx, 100
        call    cr_bounded
        mov     [fs:rest_fx+126], eax
        inc     dx
        cmp     dx, [rest_chance]
        ja      .tick
        mov     byte [rest_interrupted], 1
        jmp     .persist
.learning_blocked:
        mov     byte [timer_blocked], 1
        mov     si, s_learn_blocked
        call    puts
.persist:
        mov     dx, [effectreadp]
        mov     si, rest_fx
        mov     cx, REST_FX_LEN
        call    rest_write_file_fs
        jc      .fail
        call    rest_write_party
        jc      .fail
.timers:
        call    rest_timer_write
        jc      .fail
        cmp     word [inventory_dirty], 0
        je      .inventory_written
        mov     al, 'W'
        call    inventory_run
        jc      .fail
        mov     word [inventory_dirty], 0
.inventory_written:
        call    write_seed_sidecar
        jc      .fail
.report:
        mov     si, s_rest_elapsed
        call    puts
        mov     ax, [rest_elapsed]
        call    print_dec
        mov     si, s_rest_end
        call    puts
        cmp     byte [timer_blocked], 0
        jne     .fail
        clc
        ret
.fail:
        stc
        ret

; CoK queue learning. A bounded headless rest continues a saved action; an
; interactive R or fresh camp starts another action, as the retail menu does.
; STF is the serialized inventory (63-byte records, opaque links at 42..45).
; Pending scroll scribing is planned against checkpoint-owned inventory.
load_cok_camp_state:
        call    is_gen1_rest_capable
        jne     .fail
        mov     dx, [effectreadp]
        mov     ax, 3D00h
        int     21h
        jc      .fail
        mov     bx, ax
        mov     dx, rest_fx
        mov     cx, REST_FX_LEN+1
        mov     ah, 3Fh
        call    int21_fs
        pushf
        push    ax
        mov     ah, 3Eh
        int     21h
        pop     ax
        popf
        jc      .fail
        cmp     ax, REST_FX_LEN
        jne     .fail
        cmp     word [fs:rest_fx], 'GB'
        jne     .fail
        cmp     word [fs:rest_fx+2], 'EF'
        jne     .fail
        cmp     word [fs:rest_fx+4], 9
        jne     .fail
        cmp     word [fs:rest_fx+116], 'GB'
        jne     .fail
        cmp     word [fs:rest_fx+118], 'RS'
        jne     .fail
        cmp     word [fs:rest_fx+GBEF_CLOCK_OFF], 'GB'
        jne     .fail
        cmp     word [fs:rest_fx+GBEF_CLOCK_OFF+2], 'CL'
        jne     .fail
        cmp     word [fs:rest_fx+196], 512
        ja      .fail
        mov     ax, 7ED2h
        call    rest_mem_get
        mov     [rest_period], ax
        mov     ax, 7ED3h
        call    rest_mem_get
        mov     [rest_chance], ax
        mov     dx, rosterpath
        mov     ax, 3D00h
        int     21h
        jc      .fail
        mov     bx, ax
        mov     dx, rest_party
        mov     cx, 2477
        mov     ah, 3Fh
        int     21h
        pushf
        push    ax
        mov     ah, 3Eh
        int     21h
        pop     ax
        popf
        jc      .fail
        mov     [rest_party_len], ax
        mov     si, rest_party
        call    validate_gbpr_header
        jc      .fail
        ; rest_party+10 is ccparty.asm's FLAG_DOK word (0=CoK, 1=DoK body
        ; shape). This used to hard-reject any nonzero value, silently
        ; re-narrowing this function back to CoK-only after the
        ; is_gen1_rest_capable check above already admitted DoK -- found by
        ; running a real DoK rest, not by inspection. Both values are now
        ; legitimate GBPR shapes for a title is_gen1_rest_capable accepted;
        ; nothing below this point reads the flag.
        cmp     ax, [rest_party_len]
        jne     .fail
        clc
        ret
.fail:
        stc
        ret

; Camp spell selection operates on the cached retail capacities. No stat rebuild.
mem_select_member:
        mov     ax, [mem_member]
        dec     ax
        cmp     ax, [rest_party+6]
        jae     .bad
        mov     bx, 410
        mul     bx
        add     ax, rest_party+17
        mov     [mem_body], ax
        mov     di, ax
        cmp     byte [di+392], 1
        je      .bad
        cmp     byte [di+393], 0
        je      .bad
        clc
        ret
.bad:
        stc
        ret

mem_regained:                       ; DI=body, AL=original F7:48 predicate
        xor     ax, ax
        ; Retail's F7:48 regained-slot predicate is gated on the Human race
        ; byte at CCH+90 (Human=6), not on the class byte at +91.
        cmp     byte [di+90], 6
        jne     .compare
        push    bx
        xor     bx, bx
.scan:
        mov     al, [di+249+bx]
        test    al, al
        jnz     .found
        inc     bx
        cmp     bx, 8
        jb      .scan
.found:
        pop     bx
.compare:
        cmp     al, [di+215]
        mov     al, 0
        jle     .done
        inc     ax
.done:
        ret

mem_eligible:                       ; BX=id, CF=reject. Camp is not combat state 5.
        pusha
        mov     di, [mem_body]
        cmp     byte [di+98+bx], 0
        je      .bad
        mov     al, [mem_groups+bx]
        cmp     al, 3
        je      .mage
        cmp     al, 4
        je      .bad
        cmp     byte [di+21], 8
        jbe     .bad
        cmp     al, 1
        je      .ranger
        cmp     al, 2
        jne     .divine
        ; Retail's group-two list skips slot zero when checking duplicates.
        mov     si, di
        add     si, 31
        mov     cx, 57
.duplicate:
        lodsb
        and     al, 127
        cmp     al, bl
        je      .bad
        loop    .duplicate
.divine:
        cmp     byte [di+249], 0
        jg      .ok
        cmp     byte [di+256], 5
        jg      .ok
        call    mem_regained
        test    al, al
        jz      .bad
        cmp     byte [di+257], 0
        jg      .ok
        cmp     byte [di+264], 5
        jg      .ok
        jmp     .bad
.ranger:
        cmp     byte [di+253], 6
        jg      .ok
        call    mem_regained
        test    al, al
        jz      .bad
        cmp     byte [di+261], 6
        jg      .ok
        jmp     .bad
.mage:
        cmp     byte [di+19], 8
        jbe     .bad
.ok:
        popa
        clc
        ret
.bad:
        popa
        stc
        ret

mem_count:                          ; BX=group, DX=level -> AX=used (all 58 bytes)
        push    cx
        push    si
        push    di
        mov     word [mem_used], 0
        mov     si, [mem_body]
        add     si, 30
        mov     cx, 58
.loop:
        lodsb
        test    al, al
        jz      .next
        and     ax, 127
        cmp     ax, 107             ; malformed imported ids have no level row
        ja      .next
        mov     di, ax
        cmp     [mem_groups+di], bl
        jne     .next
        cmp     [learn_levels+di], dl
        jne     .next
        inc     word [mem_used]
.next:
        loop    .loop
        mov     ax, [mem_used]
        pop     di
        pop     si
        pop     cx
        ret

mem_moon_room:                      ; AX=shared extra mage allowance, 0..2
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     word [mem_bonus], 0
        mov     di, [mem_body]
        cmp     byte [di+254], 0
        jle     .done
        movzx   ax, byte [di+94]
        test    ax, ax
        jz      .done
        add     ax, 4CF8h
        call    rest_mem_get
        cmp     ax, 1
        jb      .done
        cmp     ax, 2
        ja      .done
        mov     [mem_bonus], ax
        mov     bx, 3
        mov     dx, 1
.level:
        call    mem_count
        mov     di, [mem_body]
        mov     si, dx
        add     si, di
        movzx   cx, byte [si+298]
        sub     ax, cx
        jbe     .next
        cmp     ax, [mem_bonus]
        ja      .zero
        sub     [mem_bonus], ax
.next:
        inc     dx
        cmp     dx, 5
        jbe     .level
        jmp     .done
.zero:
        mov     word [mem_bonus], 0
.done:
        mov     ax, [mem_bonus]
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        ret

mem_available:                      ; BX=spell id -> AX=remaining admission count
        push    bx
        push    cx
        push    dx
        push    di
        movzx   dx, byte [learn_levels+bx]
        movzx   bx, byte [mem_groups+bx]
        call    mem_count
        mov     di, [mem_body]
        cmp     bx, 2
        je      .holy
        imul    cx, bx, 5
        add     cx, dx
        add     di, cx
        movzx   ax, byte [di+283]
        sub     ax, [mem_used]
        jae     .room
        xor     ax, ax
.room:
        cmp     bx, 3
        jne     .done
        push    ax
        call    mem_moon_room
        pop     cx
        add     ax, cx
        jmp     .done
.holy:
        ; An inactive cleric leaves an uninitialized local in retail 1AD6E.
        ; Reject this undefined state rather than using incidental stack data.
        xor     ax, ax
        cmp     byte [di+249], 0
        jle     .done
        mov     al, 1
        cmp     byte [di+93], 4
        jne     .not_three
        mov     al, 3
.not_three:
        cmp     byte [di+93], 6
        jne     .subtract
        xor     ax, ax
.subtract:
        sub     al, [mem_used]     ; retail byte subtraction, deliberately wrapping
        xor     ah, ah
.done:
        pop     di
        pop     dx
        pop     cx
        pop     bx
        ret

mem_mutate:                         ; selected member, mem_spell (0=cancel pending)
        mov     bx, [mem_spell]
        test    bx, bx
        jz      .cancel
        cmp     bx, 107
        ja      .bad
        mov     si, [mem_body]
        add     si, 30
        mov     cx, 58
.validate:
        lodsb
        test    al, al
        jz      .valid_entry
        and     al, 127
        jz      .bad
        cmp     al, 107
        ja      .bad
.valid_entry:
        loop    .validate
        call    mem_eligible
        jc      .bad
        call    mem_available
        test    ax, ax
        jz      .bad
        mov     di, [mem_body]
        add     di, 30
        mov     cx, 58
.empty:
        cmp     byte [di], 0
        je      .insert
        inc     di
        loop    .empty
        jmp     .bad
.insert:
        mov     al, bl
        or      al, 128
        mov     [di], al
        ; Exact retail pairwise swaps, not a stable library sort.
        mov     si, [mem_body]
        add     si, 30
        mov     cx, 57
.outer:
        mov     di, si
        mov     dx, cx
        inc     dx
.inner:
        mov     al, [si]
        mov     ah, [di]
        and     ax, 7F7Fh
        cmp     al, ah
        jbe     .ordered
        mov     al, [si]
        xchg    al, [di]
        mov     [si], al
.ordered:
        inc     di
        dec     dx
        jnz     .inner
        inc     si
        loop    .outer
        jmp     .write
.cancel:
        mov     di, [mem_body]
        mov     byte [di+88], 0
        add     di, 30
        mov     cx, 58
.clear:
        cmp     byte [di], 127
        jbe     .keep
        mov     byte [di], 0
.keep:
        inc     di
        loop    .clear
.write:
        call    rest_write_party
        jc      .bad
        ; Queue changes start a fresh future rest action, never a stale countdown.
        mov     byte [learn_active], 0
        mov     byte [learn_phase], 0
        mov     dword [learn_counts], 0
        mov     word [learn_counts+4], 0
        clc
        ret
.bad:
        stc
        ret

mem_command:
        ; Headless /6 dispatches here directly from .camp_ready, bypassing
        ; the interactive M-key gate at .camp_mem_key -- so this needs its
        ; own CoK-only check independent of load_cok_camp_state, which
        ; is_gen1_rest_capable above has widened to include DoK for rest.
        cmp     word [gamep], game_cok
        jne     .bad
        call    load_cok_camp_state
        jc      .bad
        call    mem_select_member
        jc      .bad
        call    mem_mutate
        jc      .bad
        mov     si, s_mem_saved
        call    puts
        clc
        ret
.bad:
        mov     si, s_mem_rejected
        call    puts
        stc
        ret

mem_member dw 0
mem_spell dw 0
mem_body dw 0
mem_used dw 0
mem_bonus dw 0
mem_requested db 0
s_mem_saved db 'Spell queue updated. Rest to memorize pending spells.',13,10,0
s_mem_rejected db 'Cannot change this spell queue: member, spell or capacity is unavailable.',13,10,0

mem_input:                         ; AX=number, FFFF=back/invalid; C means zero
        mov     byte [mem_line+1], 0
        mov     dx, mem_line
        mov     ah, 0Ah
        int     21h
        mov     si, s_mem_newline
        call    puts
        cmp     byte [mem_line+1], 0
        je      .back
        mov     al, [mem_line+2]
        and     al, 0DFh
        cmp     al, 'C'
        je      .command
        cmp     al, 'X'
        je      .command
        mov     si, mem_line+2
        movzx   cx, byte [mem_line+1]
        call    parse_opt_word
        jc      .back
        test    cx, cx
        jnz     .back
        mov     ax, bx
        ret
.command:
        cmp     byte [mem_line+1], 1
        jne     .back
        cmp     al, 'X'
        je      .back
.zero:
        xor     ax, ax
        ret
.back:
        mov     ax, 0FFFFh
        ret

mem_menu:
        call    load_cok_camp_state
        jc      .error
        cmp     word [rest_party+6], 0
        je      .error
        mov     si, s_mem_title
        call    puts
        mov     bp, 1
.member:
        mov     ax, bp
        call    print_dec
        mov     si, s_mem_space
        call    puts
        mov     ax, bp
        dec     ax
        imul    ax, 410
        mov     di, rest_party+17
        add     di, ax
        movzx   cx, byte [di]
        cmp     cx, 15
        ja      .error
        lea     dx, [di+1]
        mov     bx, 1
        mov     ah, 40h
        int     21h
        mov     si, s_mem_newline
        call    puts
        inc     bp
        cmp     bp, [rest_party+6]
        jbe     .member
        mov     si, s_mem_member
        call    puts
        call    mem_input
        cmp     ax, 0FFFFh
        je      .done
        mov     [mem_member], ax
        call    mem_select_member
        jc      .error
.list:
        call    mem_show_pending
        mov     si, s_mem_known
        call    puts
        mov     bx, 1
        mov     bp, 0
.spell:
        call    mem_eligible
        jc      .next
        mov     ax, bx
        call    print_dec
        mov     si, s_mem_space
        call    puts
        mov     di, bx
        shl     di, 1
        mov     si, [mem_name_ptrs+di]
        call    puts
        mov     si, s_mem_room
        call    puts
        call    mem_available
        call    print_dec
        mov     si, s_mem_newline
        call    puts
        inc     bp
        cmp     bp, 12
        jb      .next
        push    bx
        mov     si, s_mem_more
        call    puts
        call    mem_input
        pop     bx
        xor     bp, bp
.next:
        inc     bx
        cmp     bx, 107
        jbe     .spell
        mov     si, s_mem_action
        call    puts
        call    mem_input
        cmp     ax, 0FFFFh
        je      .done
        cmp     ax, 107
        ja      .error
        mov     [mem_spell], ax
        call    mem_confirm
        jc      .list
        call    mem_mutate
        jc      .error
        mov     si, s_mem_saved
        call    puts
        jmp     .list
.error:
        mov     si, s_mem_rejected
        call    puts
.done:
        ret
mem_show_pending:
        pusha
        mov     si, s_mem_pending
        call    puts
        mov     di, [mem_body]
        add     di, 30
        mov     cx, 58
.loop:
        movzx   ax, byte [di]
        cmp     ax, 127
        jbe     .next
        and     ax, 127
        call    print_dec
        mov     si, s_mem_blank
        call    puts
.next:
        inc     di
        loop    .loop
        mov     si, s_mem_newline
        call    puts
        popa
        ret

mem_confirm:
        mov     ax, [mem_spell]
        mov     si, s_mem_cancel
        test    ax, ax
        jz      .question
        mov     si, s_mem_prepare
        call    puts
        shl     ax, 1
        mov     di, ax
        mov     si, [mem_name_ptrs+di]
.question:
        call    puts
        mov     si, s_mem_yesno
        call    puts
        mov     byte [mem_line+1], 0
        mov     dx, mem_line
        mov     ah, 0Ah
        int     21h
        mov     si, s_mem_newline
        call    puts
        cmp     byte [mem_line+1], 1
        jne     .no
        mov     al, [mem_line+2]
        and     al, 0DFh
        cmp     al, 'Y'
        jne     .no
        clc
        ret
.no:
        stc
        ret
s_mem_pending db 'Pending spell numbers: ',0
s_mem_blank db ' ',0
s_mem_cancel db 'Cancel all pending spells',0
s_mem_prepare db 'Prepare ',0
s_mem_yesno db '? Y/N: ',0
mem_line db 4,0,0,0,0,0,0
s_mem_newline db 13,10,0
s_mem_space db ' - ',0
s_mem_title db 13,10,'Memorize',13,10,0
s_mem_member db 'Choose member number (X back): ',0
s_mem_known db 'Known spells and remaining allowance:',13,10,0
s_mem_room db '  slots: ',0
s_mem_more db 'Enter for more...',0
s_mem_action db 'Spell number to prepare, C cancel pending, X back: ',0

mem_groups db 0,0,0,0,0,0,0,0,0,3,3,3,3,3,3,3,3,3,3,3,3,3,0,0,0,0,0,0,0,3,3,3,3,3,3,3,4,0,0,0,0,0,0,0,0,3,3,3,3,3,3,3,3,3,3,3,0,4,0,4,4,4,4,4,4,4,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,3,3,3,3,3,3,3,3,3,4,3,3,3,3,4,4,4,4,4,3,2,2,2,2,2,2,2,0,40,42,46,49,39,40,45,2,10,20,30,40,50,60,70,15,10,5,0
mem_name_ptrs dw mem_name_0,mem_name_1,mem_name_2,mem_name_3,mem_name_4,mem_name_5,mem_name_6,mem_name_7,mem_name_8,mem_name_9,mem_name_10,mem_name_11,mem_name_12,mem_name_13,mem_name_14,mem_name_15,mem_name_16,mem_name_17,mem_name_18,mem_name_19,mem_name_20,mem_name_21,mem_name_22,mem_name_23,mem_name_24,mem_name_25,mem_name_26,mem_name_27,mem_name_28,mem_name_29,mem_name_30,mem_name_31,mem_name_32,mem_name_33,mem_name_34,mem_name_35,mem_name_36,mem_name_37,mem_name_38,mem_name_39,mem_name_40,mem_name_41,mem_name_42,mem_name_43,mem_name_44,mem_name_45,mem_name_46,mem_name_47,mem_name_48,mem_name_49,mem_name_50,mem_name_51,mem_name_52,mem_name_53,mem_name_54,mem_name_55,mem_name_56,mem_name_57,mem_name_58,mem_name_59,mem_name_60,mem_name_61,mem_name_62,mem_name_63,mem_name_64,mem_name_65,mem_name_66,mem_name_67,mem_name_68,mem_name_69,mem_name_70,mem_name_71,mem_name_72,mem_name_73,mem_name_74,mem_name_75,mem_name_76,mem_name_77,mem_name_78,mem_name_79,mem_name_80,mem_name_81,mem_name_82,mem_name_83,mem_name_84,mem_name_85,mem_name_86,mem_name_87,mem_name_88,mem_name_89,mem_name_90,mem_name_91,mem_name_92,mem_name_93,mem_name_94,mem_name_95,mem_name_96,mem_name_97,mem_name_98,mem_name_99,mem_name_100,mem_name_101,mem_name_102,mem_name_103,mem_name_104,mem_name_105,mem_name_106,mem_name_107
mem_name_0 db 0
mem_name_1 db 66,108,101,115,115,0
mem_name_2 db 67,117,114,115,101,0
mem_name_3 db 67,117,114,101,32,76,105,103,104,116,32,87,111,117,110,100,115,0
mem_name_4 db 67,97,117,115,101,32,76,105,103,104,116,32,87,111,117,110,100,115,0
mem_name_5 db 68,101,116,101,99,116,32,77,97,103,105,99,0
mem_name_6 db 80,114,111,116,101,99,116,105,111,110,32,70,114,111,109,32,69,118,105,108,0
mem_name_7 db 80,114,111,116,101,99,116,105,111,110,32,102,114,111,109,32,71,111,111,100,0
mem_name_8 db 82,101,115,105,115,116,32,67,111,108,100,0
mem_name_9 db 66,117,114,110,105,110,103,32,72,97,110,100,115,0
mem_name_10 db 67,104,97,114,109,32,80,101,114,115,111,110,0
mem_name_11 db 68,101,116,101,99,116,32,77,97,103,105,99,0
mem_name_12 db 69,110,108,97,114,103,101,0
mem_name_13 db 82,101,100,117,99,101,0
mem_name_14 db 70,114,105,101,110,100,115,0
mem_name_15 db 77,97,103,105,99,32,77,105,115,115,105,108,101,0
mem_name_16 db 80,114,111,116,101,99,116,105,111,110,32,70,114,111,109,32,69,118,105,108,0
mem_name_17 db 80,114,111,116,101,99,116,105,111,110,32,70,114,111,109,32,71,111,111,100,0
mem_name_18 db 82,101,97,100,32,77,97,103,105,99,0
mem_name_19 db 83,104,105,101,108,100,0
mem_name_20 db 83,104,111,99,107,105,110,103,32,71,114,97,115,112,0
mem_name_21 db 83,108,101,101,112,0
mem_name_22 db 70,105,110,100,32,84,114,97,112,115,0
mem_name_23 db 72,111,108,100,32,80,101,114,115,111,110,0
mem_name_24 db 82,101,115,105,115,116,32,70,105,114,101,0
mem_name_25 db 83,105,108,101,110,99,101,44,32,49,53,39,32,82,97,100,105,117,115,0
mem_name_26 db 83,108,111,119,32,80,111,105,115,111,110,0
mem_name_27 db 83,110,97,107,101,32,67,104,97,114,109,0
mem_name_28 db 83,112,105,114,105,116,117,97,108,32,72,97,109,109,101,114,0
mem_name_29 db 68,101,116,101,99,116,32,73,110,118,105,115,105,98,105,108,105,116,121,0
mem_name_30 db 73,110,118,105,115,105,98,105,108,105,116,121,0
mem_name_31 db 75,110,111,99,107,0
mem_name_32 db 77,105,114,114,111,114,32,73,109,97,103,101,0
mem_name_33 db 82,97,121,32,111,102,32,69,110,102,101,101,98,108,101,109,101,110,116,0
mem_name_34 db 83,116,105,110,107,105,110,103,32,67,108,111,117,100,0
mem_name_35 db 83,116,114,101,110,103,116,104,0
mem_name_36 db 65,110,105,109,97,116,101,32,68,101,97,100,0
mem_name_37 db 67,117,114,101,32,66,108,105,110,100,110,101,115,115,0
mem_name_38 db 67,97,117,115,101,32,66,108,105,110,100,110,101,115,115,0
mem_name_39 db 67,117,114,101,32,68,105,115,101,97,115,101,0
mem_name_40 db 67,97,117,115,101,32,68,105,115,101,97,115,101,0
mem_name_41 db 68,105,115,112,101,108,32,77,97,103,105,99,0
mem_name_42 db 80,114,97,121,101,114,0
mem_name_43 db 82,101,109,111,118,101,32,67,117,114,115,101,0
mem_name_44 db 66,101,115,116,111,119,32,67,117,114,115,101,0
mem_name_45 db 66,108,105,110,107,0
mem_name_46 db 68,105,115,112,101,108,32,77,97,103,105,99,0
mem_name_47 db 70,105,114,101,98,97,108,108,0
mem_name_48 db 72,97,115,116,101,0
mem_name_49 db 72,111,108,100,32,80,101,114,115,111,110,0
mem_name_50 db 73,110,118,105,115,105,98,105,108,105,116,121,44,32,49,48,39,32,82,97,100,105,117,115,0
mem_name_51 db 76,105,103,104,116,110,105,110,103,32,66,111,108,116,0
mem_name_52 db 80,114,111,116,101,99,116,105,111,110,32,70,114,111,109,32,69,118,105,108,44,32,49,48,39,32,82,97,100,105,117,115,0
mem_name_53 db 80,114,111,116,101,99,116,105,111,110,32,70,114,111,109,32,71,111,111,100,44,32,49,48,39,32,82,97,100,105,117,115,0
mem_name_54 db 80,114,111,116,101,99,116,105,111,110,32,70,114,111,109,32,78,111,114,109,97,108,32,77,105,115,115,105,108,101,115,0
mem_name_55 db 83,108,111,119,0
mem_name_56 db 82,101,115,116,111,114,97,116,105,111,110,0
mem_name_57 db 0
mem_name_58 db 67,117,114,101,32,83,101,114,105,111,117,115,32,87,111,117,110,100,115,0
mem_name_59 db 0
mem_name_60 db 0
mem_name_61 db 0
mem_name_62 db 0
mem_name_63 db 0
mem_name_64 db 0
mem_name_65 db 0
mem_name_66 db 67,97,117,115,101,32,83,101,114,105,111,117,115,32,87,111,117,110,100,115,0
mem_name_67 db 78,101,117,116,114,97,108,105,122,101,32,80,111,105,115,111,110,0
mem_name_68 db 80,111,105,115,111,110,0
mem_name_69 db 80,114,111,116,101,99,116,105,111,110,32,69,118,105,108,44,32,49,48,39,32,82,97,100,105,117,115,0
mem_name_70 db 83,116,105,99,107,115,32,116,111,32,83,110,97,107,101,115,0
mem_name_71 db 67,117,114,101,32,67,114,105,116,105,99,97,108,32,87,111,117,110,100,115,0
mem_name_72 db 67,97,117,115,101,32,67,114,105,116,105,99,97,108,32,87,111,117,110,100,115,0
mem_name_73 db 68,105,115,112,101,108,32,69,118,105,108,0
mem_name_74 db 70,108,97,109,101,32,83,116,114,105,107,101,0
mem_name_75 db 82,97,105,115,101,32,68,101,97,100,0
mem_name_76 db 83,108,97,121,32,76,105,118,105,110,103,0
mem_name_77 db 68,101,116,101,99,116,32,77,97,103,105,99,0
mem_name_78 db 69,110,116,97,110,103,108,101,0
mem_name_79 db 70,97,101,114,105,101,32,70,105,114,101,0
mem_name_80 db 73,110,118,105,115,105,98,105,108,105,116,121,32,116,111,32,65,110,105,109,97,108,115,0
mem_name_81 db 67,104,97,114,109,32,77,111,110,115,116,101,114,115,0
mem_name_82 db 67,111,110,102,117,115,105,111,110,0
mem_name_83 db 68,105,109,101,110,115,105,111,110,32,68,111,111,114,0
mem_name_84 db 70,101,97,114,0
mem_name_85 db 70,105,114,101,32,83,104,105,101,108,100,0
mem_name_86 db 70,117,109,98,108,101,0
mem_name_87 db 73,99,101,32,83,116,111,114,109,0
mem_name_88 db 77,105,110,111,114,32,71,108,111,98,101,32,79,102,32,73,110,118,117,108,110,101,114,97,98,105,108,105,116,121,0
mem_name_89 db 82,101,109,111,118,101,32,67,117,114,115,101,0
mem_name_90 db 65,110,105,109,97,116,101,32,68,101,97,100,0
mem_name_91 db 67,108,111,117,100,32,75,105,108,108,0
mem_name_92 db 67,111,110,101,32,111,102,32,67,111,108,100,0
mem_name_93 db 70,101,101,98,108,101,109,105,110,100,0
mem_name_94 db 72,111,108,100,32,77,111,110,115,116,101,114,115,0
mem_name_95 db 0
mem_name_96 db 0
mem_name_97 db 0
mem_name_98 db 0
mem_name_99 db 0
mem_name_100 db 66,101,115,116,111,119,32,67,117,114,115,101,0
mem_name_101 db 80,114,111,116,101,99,116,105,111,110,32,70,114,111,109,32,69,118,105,108,32,49,48,39,32,82,97,100,105,117,115,0
mem_name_102 db 83,105,108,101,110,99,101,32,49,53,39,32,114,97,100,105,117,115,0
mem_name_103 db 68,101,116,101,99,116,32,77,97,103,105,99,0
mem_name_104 db 82,101,109,111,118,101,32,67,117,114,115,101,0
mem_name_105 db 66,108,101,115,115,0
mem_name_106 db 67,104,97,114,109,32,80,101,114,115,111,110,0
mem_name_107 db 66,117,114,110,105,110,103,32,72,97,110,100,115,0

; Plan learning in private files. fxbuf retains the checked response until
; timers/healing finish; application copies only learning-owned body fields.
rest_learn_prepare:
        ; Scroll scribing during rest is CoK-only, same as memorization: it
        ; plans against CCINV's owned-inventory envelope, and ccinv.asm's
        ; owners: check (core+5808, the same FLAG_DOK word ccparty.asm writes
        ; at GBPR body offset 10) rejects any DoK-shaped roster outright --
        ; found by running a real DoK rest, not by inspection. Skip cleanly
        ; rather than widen a second .COM file's CoK-only assumptions.
        cmp word [gamep], game_cok
        je .cok
        clc
        ret
.cok:
        xor ax, ax
        call rest_learn_plan
        jc .bad
        call rest_learn_apply
        clc
        ret
.bad:  mov si, s_learn_blocked
        call puts
        stc
        ret

rest_learn_plan:                    ; AL=0 preparation, 1 tick
        pusha
        mov [learn_request_mode], al
        call inventory_ensure
        jc .bad
        xor ax, ax
        mov di, fxbuf
        mov cx, 2512
        rep stosb
        mov dword [fxbuf], 'GBLR'
        mov word [fxbuf+4], 1
        mov al, [learn_request_mode]
        mov [fxbuf+6], ax
        mov word [fxbuf+8], 2512
        mov si, rest_party
        mov di, fxbuf+16
        mov cx, [rest_party_len]
        rep movsb
        cmp byte [learn_active], 0
        je .state
        mov si, learn_state
        mov di, fxbuf+2492
        mov cx, 8
        rep movsb
.state:
        mov si, fxbuf
        mov cx, 2512
        call buffer_crc
        mov [fxbuf+12], eax
        mov dx, learnrequestpath
        mov si, fxbuf
        mov cx, 2512
        call checkpoint_write
        jc .bad
        mov al, 'R'
        call inventory_run
        jc .bad
        mov dx, learnresponsepath
        mov si, fxbuf
        mov cx, 2513
        call checkpoint_read
        jc .bad
        cmp ax, 2512
        jne .bad
        cmp dword [fxbuf], 'GBLR'
        jne .bad
        cmp word [fxbuf+4], 1
        jne .bad
        movzx ax, byte [learn_request_mode]
        cmp [fxbuf+6], ax
        jne .bad
        cmp word [fxbuf+8], 2512
        jne .bad
        mov edx, [fxbuf+12]
        mov dword [fxbuf+12], 0
        push edx
        mov si, fxbuf
        mov cx, 2512
        call buffer_crc
        pop edx
        cmp eax, edx
        jne .bad
        mov ax, [fxbuf+10]
        test ax, 0C0C0h
        jnz .bad
        or al, ah
        xor ah, ah
        mov cx, [rest_party+6]
        shr ax, cl
        test ax, ax
        jnz .bad
        mov si, rest_party
        mov di, fxbuf+16
        mov cx, 16
        repe cmpsb
        jne .bad
        mov cx, [rest_party+6]
.owners:
        jcxz .state_check
        mov al, [si]
        cmp al, [di]
        jne .bad
        add si, 410
        add di, 410
        loop .owners
.state_check:
        cmp byte [fxbuf+2492], 1
        jne .bad
        cmp byte [fxbuf+2493], 12
        jae .bad
        mov si, fxbuf+2494
        mov cx, 6
.counts:
        lodsb
        cmp al, 21
        ja .bad
        loop .counts
        mov cx, 12
.events:
        lodsb
        cmp al, 107
        ja .bad
        loop .events
        popa
        clc
        ret
.bad:  popa
        stc
        ret

; Carry means a scroll owner reaches completion/lookahead during this tick.
rest_learn_needs_plan:
        pusha
        mov bl, [learn_scroll_mask]
        xor bp, bp
        mov si, rest_party+17
.owner:
        test bl, bl
        jz .no
        shr bl, 1
        jnc .next
        cmp byte [si+88], 0
        jne .preparing
        cmp byte [learn_counts+bp], 1
        jbe .yes
        jmp .next
.preparing:
        cmp byte [si+88], 1
        jne .next
        cmp byte [learn_phase], 11
        je .yes
.next: add si, 410
        inc bp
        jmp .owner
.no:   popa
        clc
        ret
.yes:  popa
        stc
        ret

rest_learn_activate:
        pusha
        cmp byte [fxbuf+10], 0
        je .ok
        mov al, 'A'
        call inventory_run
        jc .bad
.ok:   popa
        clc
        ret
.bad:  popa
        stc
        ret

rest_learn_apply:
        pusha
        mov al, [fxbuf+11]
        mov [learn_scroll_mask], al
        movzx ax, byte [fxbuf+10]
        or [inventory_dirty], ax
        mov si, fxbuf+2492
        mov di, learn_state
        mov cx, 8
        rep movsb
        mov bp, [rest_party+6]
        mov si, fxbuf+16+17+30
        mov di, rest_party+17+30
.owner:
        test bp, bp
        jz .events
        mov cx, 59
        rep movsb
        add si, 10
        add di, 10
        mov cx, 107
        rep movsb
        add si, 234
        add di, 234
        dec bp
        jmp .owner
.events:
        xor bp, bp
.event:
        cmp bp, [rest_party+6]
        jae .done
        movzx ax, byte [fxbuf+2500+bp]
        mov si, s_scribed_done
        test ax, ax
        jnz .print
        movzx ax, byte [fxbuf+2506+bp]
        mov si, s_learn_done
        test ax, ax
        jz .next_event
.print:
        push ax
        call puts
        pop ax
        call print_dec
        mov si, s_rest_end
        call puts
.next_event:
        inc bp
        jmp .event
.done: popa
        ret

; SI = character body, DL = 0 complete then look ahead, 1 look ahead only.
; Return AL = first NONZERO pending level after any completion. Do not compact
; holes or skip a zero-level entry when choosing which pending byte to complete.
rest_learn_scan:
        mov     di, si
        add     di, 30
        mov     cx, 58
.scan:
        mov     al, [di]
        test    al, 80h
        jz      .next
        test    dl, dl
        jnz     .look
        sub     byte [di], 80h
        mov     dl, 1
        pusha
        movzx   ax, byte [di]
        push    ax
        mov     si, s_learn_done
        call    puts
        pop     ax
        call    print_dec
        mov     si, s_rest_end
        call    puts
        popa
        jmp     .next
.look:
        and     ax, 7Fh
        mov     bx, ax
        mov     al, [learn_levels+bx]
        test    al, al
        jnz     .return
.next:
        inc     di
        loop    .scan
        xor     ax, ax
.return:
        ret

; Retail order: decrement/complete spells, then the twelve-tick hourly phase.
rest_learn_tick:
        ; Called every rest tick regardless of learn_planned; body offset 88
        ; is real retail DoK .GAM data here (never a CoK-shaped scribing
        ; counter), so this must stay CoK-only for the same reason
        ; rest_learn_prepare above does -- an uninitiated learn_scroll_mask
        ; is not enough, this reads per-member bytes unconditionally.
        cmp     word [gamep], game_cok
        je      .cok
        ret
.cok:
        pusha
        xor     bp, bp
        mov     si, rest_party+17
.member:
        cmp     bp, [rest_party+6]
        jae     .hour
        cmp     byte [learn_counts+bp], 0
        je      .due
        dec     byte [learn_counts+bp]
.due:
        cmp     byte [learn_counts+bp], 0
        jne     .next_member
        cmp     byte [si+88], 0
        jne     .next_member
        xor     dx, dx
        call    rest_learn_scan
        mov     dl, al
        add     al, al
        add     al, dl
        mov     [learn_counts+bp], al
.next_member:
        add     si, 410
        inc     bp
        jmp     .member
.hour:
        inc     byte [learn_phase]
        cmp     byte [learn_phase], 12
        jb      .done
        mov     byte [learn_phase], 0
        xor     bp, bp
        mov     si, rest_party+17
.hour_member:
        cmp     bp, [rest_party+6]
        jae     .done
        cmp     byte [si+88], 0
        je      .hour_next
        dec     byte [si+88]
        jnz     .hour_next
        mov     dl, 1
        call    rest_learn_scan
        mov     dl, al
        add     al, al
        add     al, dl
        mov     [learn_counts+bp], al
.hour_next:
        add     si, 410
        inc     bp
        jmp     .hour_member
.done:
        popa
        ret

checkpoint_learn_validate:
        cmp     byte [fs:checkpoint_learn], 1
        ja      checkpoint_bad
        cmp     byte [fs:checkpoint_learn], 0
        jne     .active
        mov     si, checkpoint_learn+1
        mov     cx, 7
.empty:
        cmp     byte [fs:si], 0
        jne     checkpoint_bad
        inc     si
        loop    .empty
        clc
        ret
.active:
        cmp     byte [fs:checkpoint_learn+1], 12
        jae     checkpoint_bad
        xor     bx, bx
        mov     si, rest_party+17
.member:
        cmp     byte [fs:checkpoint_learn+2+bx], 21
        ja      checkpoint_bad
        cmp     bx, [rest_party+6]
        jb      .body
        cmp     byte [fs:checkpoint_learn+2+bx], 0
        jne     checkpoint_bad
        jmp     .next_member
.body:
        cmp     byte [si+88], 6
        ja      checkpoint_bad
        cmp     byte [si+88], 0
        je      .queue
        cmp     byte [fs:checkpoint_learn+2+bx], 0
        jne     checkpoint_bad
.queue:
        mov     di, si
        add     di, 30
        mov     cx, 58
.slot:
        mov     al, [di]
        test    al, 80h
        jz      .next_slot
        and     al, 7Fh
        dec     al
        cmp     al, 106
        ja      checkpoint_bad
.next_slot:
        inc     di
        loop    .slot
.next_member:
        add     si, 410
        inc     bx
        cmp     bx, 6
        jb      .member
        clc
        ret

; Preflight the entire tick before changing any duration or character. Retail
; expiry DB:2F calls applied callbacks and has additional 0C/0E/26 handlers.
; Only unapplied ordinary effects and verified haste/slow are handled here.
rest_timer_preflight:
        pusha
        cmp     word [timer_state], 1
        jne     .done
        mov     cx, [timer_count]
        mov     si, timer_records
.check:
        jcxz    .done
        mov     ax, [si+2]
        test    ax, ax
        jz      .checked
        cmp     ax, 5
        ja      .checked
        mov     al, [si+1]
        cmp     al, 0Ch
        je      .blocked
        cmp     al, 0Eh
        je      .blocked
        cmp     al, 26h
        je      .blocked
        cmp     byte [si+5], 0
        je      .checked
        cmp     al, 27h
        je      .checked
        cmp     al, 2Ah
        jne     .blocked
.checked:
        add     si, 10
        loop    .check
.done:
        popa
        clc
        ret
.blocked:
        mov     byte [timer_blocked], 1
        movzx   ax, al
        push    ax
        mov     si, s_timer_blocked
        call    puts
        pop     ax
        call    print_dec
        mov     si, s_rest_end
        call    puts
        popa
        stc
        ret

; All rejection checks run before any staged inventory is activated.
rest_timer_tick:
        pusha
        cmp     word [timer_state], 1
        jne     .done
.apply:
        mov     cx, [timer_count]
        mov     si, timer_records
        mov     di, si
.record:
        jcxz    .compact_done
        mov     ax, [si+2]
        test    ax, ax
        jz      .keep
        cmp     ax, 5
        ja      .decrement
        ; Haste's callback ages once if its node +3 bit 10h is still clear.
        cmp     byte [si+1], 27h
        jne     .removed
        cmp     byte [si+5], 0
        je      .removed
        test    byte [si+4], 10h
        jnz     .removed
        movzx   ax, byte [si]
        dec     ax
        mov     bx, 410
        mul     bx
        mov     bx, ax
        inc     word [rest_party+17+96+bx]
.removed:
        add     si, 10
        jmp     .next
.decrement:
        sub     word [si+2], 5
.keep:
        push    cx
        mov     cx, 10
        rep     movsb
        pop     cx
.next:
        loop    .record
.compact_done:
        mov     ax, di
        sub     ax, timer_records
        xor     dx, dx
        mov     bx, 10
        div     bx
        mov     [timer_count], ax
        mov     cx, timer_records+TIMER_CAP*10
        sub     cx, di
        xor     ax, ax
        rep     stosb
        mov     di, seed_owned_matrix
        mov     cx, 256
        rep     stosb
        mov     si, timer_records
        mov     cx, [timer_count]
.bits:
        jcxz    .done
        movzx   ax, byte [si+1]
        test    ax, ax
        jz      .next_bit
        movzx   bx, byte [si]
        dec     bx
        shl     bx, 5
        bts     word [seed_owned_matrix+bx], ax
.next_bit:
        add     si, 10
        loop    .bits
.done:
        popa
        clc
        ret

; SFX loading in retail rebuilds the links in file order, ignoring saved far
; pointer values. Preserve those bytes in surviving records; never dereference.
; fxbuf is idle here and exceeds the maximum 256*9-byte single-owner output.
rest_write_party:
        mov     dx, rosterpath
        mov     si, rest_party
        mov     cx, [rest_party_len]
        call    rest_write_file
        jc      .fail
        ; Original low-numbered saves receive the same body, preserving every
        ; non-HP/status byte. Native-created high-bit slots stay roster-only.
        ; CoK-only: the target is CoK's 409-byte SAVE\CHRDATA#.SAV, which does
        ; not exist for DoK (DoK's own retail save is the 216-byte .GAM this
        ; roster's body already came from, written back only through the
        ; _GBPARTY.GBP roster above) -- found the same way rest_heal_party's
        ; gate above was: a real DoK rest reaching this loop with real
        ; low-numbered CHRDATA{1..6}.GAM slot tags open()s a nonexistent
        ; SAVE\CHRDATA1.SAV and fails the whole rest silently.
        cmp     word [rest_party+10], 0
        jne     .done
        mov     bp, [rest_party+6]
        mov     di, rest_party+16
.saves:
        test    bp, bp
        jz      .done
        mov     al, [di]
        cmp     al, 1
        jb      .next_save
        cmp     al, 6
        ja      .next_save
        add     al, '0'
        mov     [coksavepath+12], al
        mov     dx, coksavepath
        mov     si, di
        inc     si
        mov     cx, 409
        call    rest_write_file
        jc      .fail
.next_save:
        add     di, 410
        dec     bp
        jmp     .saves
.done:
        clc
        ret
.fail:
        stc
        ret

rest_timer_write:
        cmp     word [timer_state], 1
        jne     .done
        xor     bp, bp
.member:
        cmp     bp, [rest_party+6]
        jae     .done
        mov     bx, bp
        cmp     byte [timer_sources+bx], 0
        je      .next
        mov     di, fxbuf
        mov     si, timer_records
        mov     cx, [timer_count]
.record:
        jcxz    .write
        mov     ax, bp
        inc     ax
        cmp     [si], al
        jne     .skip
        inc     si
        push    cx
        mov     cx, 9
        rep     movsb
        pop     cx
        jmp     .copied
.skip:
        add     si, 10
.copied:
        loop    .record
.write:
        mov     ax, bp
        mov     bx, 410
        mul     bx
        mov     bx, ax
        mov     al, [rest_party+16+bx]
        add     al, '0'
        mov     [f_save_chrdata_sfx+12], al
        mov     [f_cloud_chrdata_sfx+21], al
        mov     dx, f_save_chrdata_sfx
        mov     bx, bp
        cmp     byte [timer_sources+bx], 2
        jne     .path
        mov     dx, f_cloud_chrdata_sfx
.path:
        mov     cx, di
        sub     cx, fxbuf
        mov     si, fxbuf
        call    checkpoint_write
        jc      .bad
.next:
        inc     bp
        jmp     .member
.done:
        clc
        ret
.bad:
        stc
        ret

; Validate timer owners, source selection and the redundant query bitset before
; publishing/restoring a checkpoint. Legacy versions have an empty extension.
checkpoint_timer_validate:
        cmp     word [fs:checkpoint_timers], 1
        ja      checkpoint_bad
        mov     cx, [fs:checkpoint_timers+2]
        cmp     cx, TIMER_CAP
        ja      checkpoint_bad
        cmp     word [fs:checkpoint_timers], 0
        jne     .known
        test    cx, cx
        jnz     checkpoint_bad
        mov     si, checkpoint_timers+4
        mov     cx, TIMER_STATE_LEN-4
.unknown_empty:
        cmp     byte [fs:si], 0
        jne     checkpoint_bad
        inc     si
        loop    .unknown_empty
        clc
        ret
.known:
        xor     ax, ax
        mov     di, fxbuf
        push    cx
        mov     cx, 256
        rep     stosb
        pop     cx
        xor     bx, bx
.sources:
        cmp     byte [fs:checkpoint_timers+4+bx], 2
        ja      checkpoint_bad
        cmp     bx, [rest_party+6]
        jb      .active
        cmp     byte [fs:checkpoint_timers+4+bx], 0
        jne     checkpoint_bad
        jmp     .source_next
.active:
        cmp     byte [fs:checkpoint_timers+4+bx], 0
        je      .source_next
        mov     ax, bx
        mov     dx, 410
        mul     dx
        mov     di, ax
        test    byte [rest_party+16+di], 80h
        jnz     checkpoint_bad
.source_next:
        inc     bx
        cmp     bx, 8
        jb      .sources
        mov     si, checkpoint_timers+12
        ; si walks the FS-resident image timer records
.record:
        jcxz    .compare
        movzx   bx, byte [fs:si]
        test    bx, bx
        jz      checkpoint_bad
        cmp     bx, [rest_party+6]
        ja      checkpoint_bad
        dec     bx
        cmp     byte [fs:checkpoint_timers+4+bx], 0
        je      checkpoint_bad
        shl     bx, 5
        movzx   ax, byte [fs:si+1]
        test    ax, ax
        jz      .next
        bts     word [fxbuf+bx], ax
.next:
        add     si, 10
        loop    .record
.compare:
        mov     si, fxbuf
        mov     di, checkpoint_owned_matrix
        mov     cx, 256
        push    es
        push    fs
        pop     es
        repe    cmpsb
        pop     es                  ; POP keeps the compare flags
        jne     checkpoint_bad
        cmp     word [fs:checkpoint_timers+2], 0
        je      .ok
        cmp     word [fs:checkpoint_owned_flags], 1
        jne     checkpoint_bad
.ok:
        clc
        ret

; Consume the VM's synchronous GBPS v5 timer exchange. The seed is scratch,
; never the explicit camp checkpoint. Age deltas are consumed once and cleared
; before any subsequent ECL invocation (including combat continuation).
sync_ecl_timers:
        mov     [timer_effect_output], dx
        cmp     word [seed_version], 5
        jb      .ok
        cmp     word [gamep], game_cok
        jne     .ok
        mov     dx, seedpath
        mov     si, fxbuf
        mov     cx, 3161
        call    checkpoint_read
        jc      .bad
        mov     bx, 3128
        cmp     word [seed_version], 6
        jne     .seed_length
        mov     bx, 3160
.seed_length:
        cmp     ax, bx
        jne     .bad
        cmp     dword [fxbuf], 'GBPS'
        jne     .bad
        mov     ax, [seed_version]
        cmp     [fxbuf+4], ax
        jne     .bad
        mov     si, fxbuf+282
        mov     di, checkpoint_owned_flags
        mov     cx, 258
        push    es
        push    fs
        pop     es
        rep     movsb
        mov     si, fxbuf+540
        mov     di, checkpoint_timers
        mov     cx, TIMER_STATE_LEN
        rep     movsb
        pop     es
        mov     dx, rosterpath
        mov     si, rest_party
        mov     cx, 2477
        call    checkpoint_read
        jc      .bad
        mov     [rest_party_len], ax
        mov     si, rest_party
        call    validate_gbpr_header
        jc      .bad
        cmp     word [rest_party+10], 0
        jne     .bad
        cmp     ax, [rest_party_len]
        jne     .bad
        ; Validation uses only fxbuf's first 256 bytes, preserving age deltas.
        call    checkpoint_timer_validate
        jc      .bad
        mov     si, checkpoint_owned_flags
        mov     di, seed_owned_flags
        mov     cx, 258
        rep     fs movsb
        mov     si, checkpoint_timers
        mov     di, timer_state
        mov     cx, TIMER_STATE_LEN
        rep     fs movsb
        mov     cx, [rest_party+6]
        mov     di, rest_party+17
        mov     si, fxbuf+3112
.ages:
        jcxz    .persist
        lodsw
        add     [di+96], ax
        add     di, 410
        loop    .ages
.persist:
        call    rest_write_party
        jc      .bad
        call    rest_timer_write
        jc      .bad
        call    write_seed_sidecar
        jc      .bad
        mov     dx, [timer_effect_output]
        mov     ax, 3D00h
        int     21h
        jc      .bad
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 5720
        int     21h
        jc      .close_bad
        mov     ah, 3Fh
        mov     dx, fxbuf
        mov     cx, 6
        int     21h
        jc      .close_bad
        cmp     ax, 6
        jne     .close_bad
        mov     ah, 3Eh
        int     21h
        cmp     dword [fxbuf], 'GBHD'
        jne     .bad
        cmp     word [fxbuf+4], 5
        jne     .ok
        mov     si, s_ecl_timer_halt
        call    puts
        jmp     .bad
.close_bad:
        mov     ah, 3Eh
        int     21h
        stc
        ret
.ok:
        clc
        ret
.bad:
        stc
        ret


; CoK GAME.OVR 2A87C: three phase/counter pairs, updated on EACH hour carry.
; The sparse-memory plan is read-only; apply runs only after all tick preflights.
LUNAR_COUNT equ rest_fx+196
LUNAR_KEYS equ rest_fx+198
LUNAR_VALS equ rest_fx+1222
lunar_plan:                         ; SI=seven clock words, AX=step, BX=slot
        pusha
        mov     dx, ax
        mov     di, lunar_clock
        mov     cx, 4
        push    es
        push    ds
        pop     es
        rep     fs movsw
        pop     es
        cmp     bx, 3
        ja      .normalize
        shl     bx, 1
        add     [lunar_clock+bx], dx
.normalize:
        xor     si, si
.carry:
        mov     ax, [lunar_clock+si]
        xor     dx, dx
        div     word [lunar_radices+si]
        cmp     si, 6
        je      .days
        add     [lunar_clock+si+2], ax
        add     si, 2
        jmp     .carry
.days:
        mov     [lunar_days], ax
        test    ax, ax
        jz      .ok
        xor     di, di
        mov     bx, 4CF9h
.check:
        call    lunar_index
        jnc     .present
        inc     di
.present:
        inc     bx
        cmp     bx, 4CFFh
        jb      .check
        add     di, [fs:LUNAR_COUNT]
        cmp     di, 512
        ja      .full
.ok:
        popa
        clc
        ret
.full:
        popa
        stc
        ret

lunar_index:                        ; BX=key -> SI=byte index, CF=missing
        push    cx
        mov     cx, [fs:LUNAR_COUNT]
        xor     si, si
.loop:
        jcxz    .missing
        cmp     [fs:LUNAR_KEYS+si], bx
        je      .found
        add     si, 2
        loop    .loop
.missing:
        pop     cx
        stc
        ret
.found:
        pop     cx
        clc
        ret

lunar_apply:                        ; lunar_plan already reserved sufficient space
        pusha
        cmp     word [lunar_days], 0
        je      .done
        mov     bx, 4CF9h
        xor     di, di
.index:
        call    lunar_index
        jnc     .existing
        mov     [fs:LUNAR_KEYS+si], bx
        mov     word [fs:LUNAR_VALS+si], 0
        inc     word [fs:LUNAR_COUNT]
.existing:
        mov     [lunar_indices+di], si
        add     di, 2
        inc     bx
        cmp     bx, 4CFFh
        jb      .index
        mov     cx, [lunar_days]
.day:
        xor     di, di
.moon:
        mov     si, [lunar_indices+di+6]
        mov     ax, [fs:LUNAR_VALS+si]
        cmp     ax, [lunar_thresholds+di]
        jb      .increment
        mov     word [fs:LUNAR_VALS+si], 0
        mov     si, [lunar_indices+di]
        cmp     word [fs:LUNAR_VALS+si], 3
        jb      .increment
        mov     word [fs:LUNAR_VALS+si], 0
        jmp     .next
.increment:
        inc     word [fs:LUNAR_VALS+si]
.next:
        add     di, 2
        cmp     di, 6
        jb      .moon
        loop    .day
.done:
        popa
        ret
lunar_days dw 0
lunar_clock times 4 dw 0
lunar_indices times 6 dw 0
lunar_radices dw 10,10,6,24
lunar_thresholds dw 8,1,6

s_lunar_full db 'Rest stopped: lunar script memory is full',13,10,0

rest_mem_get:                       ; AX=key, AX=value (default zero)
        mov     cx, [fs:rest_fx+196]
        xor     si, si
.loop:
        jcxz    .missing
        cmp     ax, [fs:rest_fx+198+si]
        je      .found
        add     si, 2
        loop    .loop
.missing:
        xor     ax, ax
        ret
.found:
        mov     ax, [fs:rest_fx+1222+si]
        ret

rest_heal_party:
        ; DoK's GBPR body is the 216-byte real .GAM record plus a GBD1 combat
        ; tail (ccparty.asm); it is NOT a 409-byte CoK CCH record, so the
        ; offsets below (392/407/98) do not name DoK fields. rest_party+10 is
        ; the same FLAG_DOK word every other CoK-shaped-offset consumer in
        ; this file already gates on (load_cok_camp_state, checkpoint_validate,
        ; the GBCR combat-writeback patchers) -- follow that convention here
        ; too instead of relying on the target offsets being harmless.
        cmp     word [rest_party+10], 0
        jne     .done
        mov     cx, [rest_party+6]
        mov     si, rest_party+17
.loop:
        jcxz    .done
        mov     al, [si+392]
        cmp     al, 1
        jbe     .heal
        cmp     al, 4
        je      .heal
        cmp     al, 5
        jne     .next
.heal:
        movzx   ax, byte [si+407]
        inc     ax
        movzx   dx, byte [si+98]
        cmp     ax, dx
        jbe     .hp
        mov     ax, dx
.hp:
        mov     [si+407], al
        ; The native host is outside combat during camp; wake down/dying
        ; members directly, as CoK's healer does in that state.
        cmp     byte [si+392], 4
        jb      .next
        mov     byte [si+392], 0
        mov     byte [si+393], 1
.next:
        add     si, 410
        loop    .loop
.done:
        ret

rest_write_file:                    ; DX=existing path, SI=bytes (DS), CX=length
        push    ds
        jmp     short rest_write_file_core
rest_write_file_fs:                 ; same, SI is an offset in the image segment
        push    fs
rest_write_file_core:
        push    cx
        mov     ax, 3D02h
        int     21h
        pop     cx
        jc      .open_bad
        mov     bx, ax
        mov     dx, si
        pop     ax                  ; buffer segment
        push    ds
        mov     ds, ax
        push    cx
        mov     ah, 40h
        int     21h
        pop     cx
        pop     ds
        jc      .close_bad
        cmp     ax, cx
        jne     .close_bad
        mov     ah, 3Eh
        int     21h
        ret
.close_bad:
        mov     ah, 3Eh
        int     21h
        stc
        ret
.open_bad:
        add     sp, 2
        ret

; GBCP v4 adds rest-action memorization phase and per-member countdowns.
; Collect and validate everything before opening any destination for writing.
inventory_ensure:
        cmp     byte [inventory_active], 1
        je      .ok
        mov     al, 'I'
        call    inventory_run
        jc      .bad
        mov     byte [inventory_active], 1
.ok:    clc
        ret
.bad:   stc
        ret

inventory_run:                      ; AL=CCINV operation; buffers live beside GBBOOT
        mov     [inventory_mode], al
        call    tail_begin
        mov     al, [inventory_mode]
        call    tail_append_char
        call    tail_append_space
        mov     si, inventorypath
        cmp     byte [inventory_mode], 'P'
        je      .first
        cmp     byte [inventory_mode], 'R'
        je      .first
        cmp     byte [inventory_mode], 'W'
        je      .first
        cmp     byte [inventory_mode], 'Q'
        je      .first
        mov     si, rosterpath
        cmp     byte [inventory_mode], 'I'
        je      .first
        mov     si, checkpoint_temp
        cmp     byte [inventory_mode], 'S'
        je      .first
        mov     si, checkpoint_file
        cmp     byte [inventory_mode], 'L'
        je      .first
        mov     si, inventorystagepath
.first: call    tail_append_str
        cmp     byte [inventory_mode], 'P'
        je      .run
        call    tail_append_space
        cmp     byte [inventory_mode], 'W'
        jne     .path_argument
        mov     ax, [inventory_dirty]
        call    tail_append_dec
        jmp     .run
.path_argument:
        mov     si, rosterpath
        cmp     byte [inventory_mode], 'Q'
        je      .second
        mov     si, learnrequestpath
        cmp     byte [inventory_mode], 'R'
        je      .second
        mov     si, inventorypath
        cmp     byte [inventory_mode], 'L'
        jne     .second
        mov     si, inventorycorepath
.second:
        call    tail_append_str
        mov     si, seedpath
        cmp     byte [inventory_mode], 'Q'
        je      .third
        mov     si, learnresponsepath
        cmp     byte [inventory_mode], 'R'
        je      .third
        cmp     byte [inventory_mode], 'L'
        jne     .run
        mov     si, inventorystagepath
.third: call    tail_append_space
        call    tail_append_str
.run:   call    tail_finish
        mov     word [runpathp], child_inventory
        call    do_exec_checked
        jc      .bad
        clc
        ret
.bad:   stc
        ret

checkpoint_store:
        cmp     byte [checkpoint_camp_active], 1
        jne     checkpoint_bad
        mov     word [checkpoint_len], CHECKPOINT_LEN
        call    is_gen1_rest_capable
        jne     checkpoint_bad
        call    inventory_ensure
        jc      checkpoint_bad
        xor     ax, ax
        ; Zero the whole GBCP image: the FS-resident parts, then rest_party
        ; (the original single rep stosb cleared both, and the unused tail of
        ; rest_party is written to disk and checksummed).
        push    es
        push    fs
        pop     es
        xor     di, di
        mov     cx, IMG_SIZE
        rep     stosb
        pop     es
        mov     di, rest_party
        mov     cx, 2476
        rep     stosb
        mov     dword [fs:checkpoint_header], 'GBCP'
        mov     word [fs:checkpoint_header+4], 4
        call    checkpoint_game_id
        mov     [fs:checkpoint_header+6], al ; 1 CoK / 2 DoK; checked on restore
        xor     bx, bx
.archive:
        mov     ax, [krynn_ecl_table+bx]
        cmp     ax, [eclp]
        je      .found
        add     bx, 2
        cmp     bx, 6
        jb      .archive
        jmp     checkpoint_bad
.found:
        shr     bx, 1
        inc     bx
        mov     [fs:checkpoint_header+8], bx
        mov     ax, [mapid]
        mov     [fs:checkpoint_header+12], ax
        mov     word [fs:checkpoint_header+14], 1 ; in camp
        mov     ax, [rest_credit]
        mov     [fs:checkpoint_header+16], ax
        mov     ax, [rest_enc_count]
        mov     [fs:checkpoint_header+18], ax
        mov     word [fs:checkpoint_header+22], REST_FX_LEN
        mov     word [fs:checkpoint_header+24], CHECKPOINT_LEN
        mov     ax, [step_descriptor]
        mov     [fs:checkpoint_header+26], ax
        mov     dx, [effectreadp]
        mov     si, rest_fx
        mov     cx, REST_FX_LEN+1
        call    checkpoint_read_fs
        jc      checkpoint_bad
        cmp     ax, REST_FX_LEN
        jne     checkpoint_bad
        mov     ax, [fs:rest_fx+122]     ; current block, including CHAIN successors
        mov     [fs:checkpoint_header+10], ax
        mov     dx, sessionpath
        mov     si, checkpoint_pose
        mov     cx, 17
        ; Read the extra byte separately: pose is immediately before GBEF.
        push    word [fs:rest_fx]
        call    checkpoint_read_fs
        pop     word [fs:rest_fx]
        jc      checkpoint_bad
        cmp     ax, 16
        jne     checkpoint_bad
        mov     dx, rosterpath
        mov     si, rest_party
        mov     cx, 2477
        call    checkpoint_read
        jc      checkpoint_bad
        mov     [fs:checkpoint_header+20], ax
        mov     si, seed_owned_flags
        mov     di, checkpoint_owned_flags
        mov     cx, 258
        push    es
        push    fs
        pop     es
        rep     movsb
        mov     si, timer_state
        mov     di, checkpoint_timers
        mov     cx, TIMER_STATE_LEN
        rep     movsb
        mov     si, learn_state
        mov     di, checkpoint_learn
        mov     cx, 8
        rep     movsb
        pop     es
        call    checkpoint_validate
        jc      checkpoint_bad
        call    checkpoint_crc
        mov     [fs:checkpoint_header+28], eax
        mov     dx, checkpoint_temp
        call    checkpoint_write_image
        jc      checkpoint_bad
        mov     al, 'S'
        call    inventory_run       ; v5 envelope/CRC, still unpublished GREYBOX.TMP
        jc      checkpoint_bad
        mov     byte [checkpoint_old], 0
        mov     dx, checkpoint_file
        call    file_exists
        jc      .publish
        mov     dx, checkpoint_backup
        mov     ah, 41h
        int     21h                 ; missing backup is normal
        mov     dx, checkpoint_file
        mov     di, checkpoint_backup
        call    checkpoint_rename
        jc      checkpoint_bad
        mov     byte [checkpoint_old], 1
.publish:
        mov     dx, checkpoint_temp
        mov     di, checkpoint_file
        call    checkpoint_rename
        jnc     .saved
        cmp     byte [checkpoint_old], 0
        je      checkpoint_bad
        mov     dx, checkpoint_backup
        mov     di, checkpoint_file
        call    checkpoint_rename    ; attempt rollback; backup remains if it fails
        jmp     checkpoint_bad
.saved:
        mov     si, s_checkpoint_saved
        call    puts
        clc
        ret

checkpoint_restore:
        call    is_gen1_rest_capable
        jne     checkpoint_bad
        mov     al, 'L'
        call    inventory_run       ; validate whole file, retain staged inventory
        jc      checkpoint_bad
        mov     dx, inventorycorepath
        call    checkpoint_read_image
        jc      checkpoint_bad
        cmp     ax, CHECKPOINT_LEN
        je      .length_ok
        cmp     ax, CHECKPOINT_V3_LEN
        je      .old_length
        cmp     ax, CHECKPOINT_V2_LEN
        je      .old_length
        cmp     ax, CHECKPOINT_V1_LEN
        jne     checkpoint_bad
.old_length:
        ; Every legal short length ends at or after rest_party, so the zeroed
        ; tail lies wholly in the FS-resident owned/timer/learn part.
        push    ax
        push    es
        push    fs
        pop     es
        mov     di, checkpoint_owned_flags-(IMG_A_LEN+2476)
        add     di, ax
        mov     cx, CHECKPOINT_LEN
        sub     cx, ax
        xor     ax, ax
        rep     stosb
        pop     es
        pop     ax
.length_ok:
        mov     [checkpoint_len], ax
        mov     edx, [fs:checkpoint_header+28]
        mov     dword [fs:checkpoint_header+28], 0
        push    edx
        call    checkpoint_crc
        pop     edx
        cmp     eax, edx
        jne     checkpoint_bad
        mov     [fs:checkpoint_header+28], eax
        call    checkpoint_validate
        jc      checkpoint_bad
        mov     si, checkpoint_owned_flags
        mov     di, seed_owned_flags
        mov     cx, 258
        rep     fs movsb
        mov     si, checkpoint_timers
        mov     di, timer_state
        mov     cx, TIMER_STATE_LEN
        rep     fs movsb
        mov     si, checkpoint_learn
        mov     di, learn_state
        mov     cx, 8
        rep     fs movsb
        mov     ax, [fs:checkpoint_header+8]
        mov     [area_override_num], ax
        mov     byte [area_override], 1
        call    apply_area_override
        cmp     word [geop], 0
        je      checkpoint_bad
        cmp     word [eclp], 0
        je      checkpoint_bad
        mov     ax, [fs:checkpoint_header+10]
        mov     [eclid], ax
        mov     ax, [fs:checkpoint_header+12]
        mov     [mapid], ax
        ; Decode the selected map before touching active party/ECL/pose files.
        ; CCFP silently ignores a GBSN with different dimensions; reject it here.
        call    build_geo_tail
        mov     word [runpathp], child_geo
        call    do_exec_checked
        jc      checkpoint_bad
        mov     dx, wallpath
        mov     si, fxbuf
        mov     cx, 6
        call    checkpoint_read
        jc      checkpoint_bad
        cmp     ax, 6
        jne     checkpoint_bad
        cmp     dword [fxbuf], 'WGRD'
        jne     checkpoint_bad
        movzx   ax, byte [fxbuf+4]
        cmp     ax, [fs:checkpoint_pose+12]
        jne     checkpoint_bad
        movzx   ax, byte [fxbuf+5]
        cmp     ax, [fs:checkpoint_pose+14]
        jne     checkpoint_bad
        mov     al, 'A'
        call    inventory_run       ; core/map validation completed before activation
        jc      checkpoint_bad
        mov     byte [inventory_active], 1
        mov     ax, [fs:checkpoint_header+16]
        mov     [rest_credit], ax
        mov     ax, [fs:checkpoint_header+18]
        mov     [rest_enc_count], ax
        mov     ax, [fs:checkpoint_pose+6]
        mov     [step_x], ax
        mov     ax, [fs:checkpoint_pose+8]
        mov     [step_y], ax
        mov     ax, [fs:checkpoint_pose+10]
        mov     [step_facing], ax
        mov     ax, [fs:checkpoint_header+26]
        mov     [step_descriptor], ax
        mov     [step_cell_word], ax
        mov     dx, effectpath
        mov     si, rest_fx
        mov     cx, REST_FX_LEN
        call    checkpoint_write_fs
        jc      checkpoint_bad
        mov     dx, rosterpath
        mov     si, rest_party
        mov     cx, [fs:checkpoint_header+20]
        call    checkpoint_write
        jc      checkpoint_bad
        mov     dx, sessionpath
        mov     si, checkpoint_pose
        mov     cx, 16
        call    checkpoint_write_fs
        jc      checkpoint_bad
        mov     byte [effect_state_valid], 1
        mov     word [effectreadp], effectpath
        mov     word [effectwritep], effectpath
        call    read_effect_header
        jc      checkpoint_bad
        mov     si, s_checkpoint_loaded
        call    puts
        clc
        ret

checkpoint_validate:
        cmp     dword [fs:checkpoint_header], 'GBCP'
        jne     checkpoint_bad
        cmp     word [fs:checkpoint_header+4], 1
        je      .version1
        cmp     word [fs:checkpoint_header+4], 2
        je      .version2
        cmp     word [fs:checkpoint_header+4], 3
        je      .version3
        cmp     word [fs:checkpoint_header+4], 4
        jne     checkpoint_bad
        cmp     word [checkpoint_len], CHECKPOINT_LEN
        jne     checkpoint_bad
        cmp     word [fs:checkpoint_owned_flags], 1
        ja      checkpoint_bad
        jmp     .version_ok
.version3:
        cmp     word [checkpoint_len], CHECKPOINT_V3_LEN
        jne     checkpoint_bad
        cmp     word [fs:checkpoint_owned_flags], 1
        ja      checkpoint_bad
        jmp     .version_ok
.version2:
        cmp     word [checkpoint_len], CHECKPOINT_V2_LEN
        jne     checkpoint_bad
        cmp     word [fs:checkpoint_owned_flags], 1
        ja      checkpoint_bad
        jmp     .version_ok
.version1:
        cmp     word [checkpoint_len], CHECKPOINT_V1_LEN
        jne     checkpoint_bad
.version_ok:
        call    checkpoint_game_id
        cmp     byte [fs:checkpoint_header+6], al
        jne     checkpoint_bad
        mov     ax, [fs:checkpoint_header+8]
        dec     ax
        cmp     ax, 2
        ja      checkpoint_bad
        cmp     word [fs:checkpoint_header+14], 1
        jne     checkpoint_bad
        cmp     word [fs:checkpoint_header+12], 255
        ja      checkpoint_bad
        cmp     word [fs:checkpoint_header+16], 288
        jae     checkpoint_bad
        cmp     word [fs:checkpoint_header+22], REST_FX_LEN
        jne     checkpoint_bad
        mov     ax, [checkpoint_len]
        cmp     word [fs:checkpoint_header+24], ax
        jne     checkpoint_bad
        cmp     dword [fs:checkpoint_pose], 'GBSN'
        jne     checkpoint_bad
        cmp     word [fs:checkpoint_pose+4], 1
        jne     checkpoint_bad
        mov     ax, [fs:checkpoint_pose+6]
        cmp     ax, [fs:checkpoint_pose+12]
        jae     checkpoint_bad
        mov     ax, [fs:checkpoint_pose+8]
        cmp     ax, [fs:checkpoint_pose+14]
        jae     checkpoint_bad
        mov     ax, [fs:checkpoint_pose+10]
        test    ax, 0FFF9h           ; only even directions 0,2,4,6
        jnz     checkpoint_bad
        cmp     dword [fs:rest_fx], 'GBEF'
        jne     checkpoint_bad
        cmp     word [fs:rest_fx+4], 9
        jne     checkpoint_bad
        cmp     word [fs:rest_fx+8], 0  ; no combat/chain/halt continuation
        jne     checkpoint_bad
        cmp     dword [fs:rest_fx+116], 'GBRS'
        jne     checkpoint_bad
        cmp     word [fs:rest_fx+120], 0 ; combat-resume flag must be clear in camp
        jne     checkpoint_bad
        mov     ax, [fs:rest_fx+122]
        cmp     ax, 255
        ja      checkpoint_bad
        cmp     ax, [fs:checkpoint_header+10]
        jne     checkpoint_bad
        cmp     word [fs:rest_fx+130], 32
        ja      checkpoint_bad
        cmp     word [fs:rest_fx+196], 512
        ja      checkpoint_bad
        cmp     dword [fs:rest_fx+2246], 'GBSX'
        jne     checkpoint_bad
        cmp     word [fs:rest_fx+2250], 64
        ja      checkpoint_bad
        cmp     dword [fs:rest_fx+GBEF_SETUP_OFF], 'GBES'
        jne     checkpoint_bad
        cmp     dword [fs:rest_fx+GBEF_SETUP_OFF+12], 'GBHD'
        jne     checkpoint_bad
        cmp     dword [fs:rest_fx+GBEF_CLOCK_OFF], 'GBCL'
        jne     checkpoint_bad
        xor     si, si
.clock:
        mov     ax, [fs:rest_fx+GBEF_CLOCK_OFF+4+si]
        cmp     ax, [rest_radices+si]
        jae     checkpoint_bad
        add     si, 2
        cmp     si, 14
        jb      .clock
        mov     si, rest_party
        call    validate_gbpr_header
        jc      checkpoint_bad
        ; rest_party+10 is ccparty.asm's FLAG_DOK word (0=CoK 409-byte CCH
        ; body, 1=DoK 216-byte .GAM body + GBD1 tail). This used to reject
        ; anything but 0 -- a SEVENTH FLAG_DOK gate, found by running a real
        ; DoK checkpoint save/restore, not by inspection. The per-member loop
        ; below only reads the leading slot byte (game-agnostic, per
        ; ccparty.asm's own "original slot byte" header comment) and the
        ; body's byte 0 (name length, confirmed identical convention for
        ; both games' body layouts -- see
        ; docs/engine/research/dok-chrdata-save-format.md section 2.1,
        ; offset 0 = name length for DoK's compact record, matching CoK's
        ; NAME_OFFSET=1/length-byte convention), so both flag values are
        ; legitimate here.
        jcxz    checkpoint_bad
        cmp     ax, [fs:checkpoint_header+20]
        jne     checkpoint_bad
        ; Slot identities are used for source-save writeback. Reject invalid
        ; or duplicate identities before any later rest can touch those files.
        mov     si, rest_party+16
        xor     dx, dx
.member:
        movzx   ax, byte [si]
        and     al, 7Fh
        test    byte [si], 80h
        jnz     .native_slot
        dec     ax
        cmp     ax, 5
        ja      checkpoint_bad
        jmp     .slot
.native_slot:
        cmp     ax, 5
        ja      checkpoint_bad
        add     ax, 6
.slot:
        bts     dx, ax
        jc      checkpoint_bad
        cmp     byte [si+1], 15     ; bounded length-prefixed name
        ja      checkpoint_bad
        add     si, 410
        loop    .member
        call    checkpoint_timer_validate
        jc      checkpoint_bad
        call    checkpoint_learn_validate
        ret
checkpoint_bad:
        stc
        ret

checkpoint_crc:                     ; standard reflected CRC32, checksum field zero
        ; The image is split across segments but checksummed as the same
        ; contiguous byte stream: header..rest_fx (FS), rest_party (DS),
        ; then owned/timers/learn (FS) up to checkpoint_len.
        mov     eax, 0FFFFFFFFh
        xor     si, si
        mov     cx, IMG_A_LEN
        call    crc_fs
        push    fs
        push    ds
        pop     fs
        mov     si, rest_party
        mov     cx, 2476
        call    crc_fs
        pop     fs
        mov     si, checkpoint_owned_flags
        mov     cx, [checkpoint_len]
        sub     cx, IMG_A_LEN+2476
        call    crc_fs
        not     eax
        ret

crc_fs:                             ; EAX running CRC, FS:SI bytes, CX count (0 ok)
        jcxz    .done
.byte:
        xor     al, [fs:si]
        inc     si
        mov     dl, 8
.bit:
        shr     eax, 1
        jnc     .next
        xor     eax, 0EDB88320h
.next:
        dec     dl
        jnz     .bit
        loop    .byte
.done:
        ret

buffer_crc:
        mov     eax, 0FFFFFFFFh
.byte:
        xor     al, [si]
        inc     si
        mov     dl, 8
.bit:
        shr     eax, 1
        jnc     .next
        xor     eax, 0EDB88320h
.next:
        dec     dl
        jnz     .bit
        loop    .byte
        not     eax
        ret

; INT 21h with DS temporarily the image segment (DS:DX buffer in the image).
; Flags and AX returned by DOS are preserved across the DS restore.
int21_fs:
        push    ds
        push    fs
        pop     ds
        int     21h
        pop     ds
        ret

checkpoint_read:                    ; DX path, SI buffer (DS), CX capacity; AX length
        push    ds
        jmp     short checkpoint_read_core
checkpoint_read_fs:                 ; same, SI is an offset in the image segment
        push    fs
checkpoint_read_core:
        push    cx
        mov     ax, 3D00h
        int     21h
        pop     cx
        jc      .open_bad
        mov     bx, ax
        mov     dx, si
        pop     ax                  ; buffer segment
        push    ds
        mov     ds, ax
        mov     ah, 3Fh
        int     21h
        pop     ds
        pushf
        push    ax
        mov     ah, 3Eh
        int     21h
        pop     ax
        popf
        ret
.open_bad:
        add     sp, 2
        jmp     checkpoint_bad

checkpoint_write:                   ; DX path, SI buffer (DS), CX length
        push    ds
        jmp     short checkpoint_write_core
checkpoint_write_fs:                ; same, SI is an offset in the image segment
        push    fs
checkpoint_write_core:
        push    cx
        xor     cx, cx
        mov     ah, 3Ch
        int     21h
        pop     cx
        jc      .open_bad
        mov     bx, ax
        mov     dx, si
        pop     ax                  ; buffer segment
        push    ds
        mov     ds, ax
        push    cx
        mov     ah, 40h
        int     21h
        pop     cx
        pop     ds
        jc      .bad
        cmp     ax, cx
        jne     .bad
        mov     ah, 3Eh
        int     21h
        ret
.bad:
        mov     ah, 3Eh
        int     21h
        stc
        ret
.open_bad:
        add     sp, 2
        jmp     checkpoint_bad

; Read the whole GBCP image from DX in file order: header..rest_fx (FS),
; rest_party (DS), owned/timers/learn plus the oversize sentinel (FS).
; AX = total bytes read, exactly as the old single contiguous read.
checkpoint_read_image:
        mov     ax, 3D00h
        int     21h
        jc      checkpoint_bad
        mov     bx, ax
        mov     word [ck_total], 0
        mov     ah, 3Fh
        xor     dx, dx
        mov     cx, IMG_A_LEN
        call    int21_fs
        jc      .done
        mov     [ck_total], ax
        cmp     ax, IMG_A_LEN
        jne     .done
        mov     ah, 3Fh
        mov     dx, rest_party
        mov     cx, 2476
        int     21h
        jc      .done
        add     [ck_total], ax
        cmp     ax, 2476
        jne     .done
        mov     ah, 3Fh
        mov     dx, checkpoint_owned_flags
        mov     cx, IMG_C_READ
        call    int21_fs
        jc      .done
        add     [ck_total], ax
.done:
        pushf
        mov     ah, 3Eh
        int     21h
        mov     ax, [ck_total]
        popf
        ret
ck_total dw 0

; Write CHECKPOINT_LEN bytes of the image in file order to the path in DX.
checkpoint_write_image:
        xor     cx, cx
        mov     ah, 3Ch
        int     21h
        jc      checkpoint_bad
        mov     bx, ax
        mov     ah, 40h
        xor     dx, dx
        mov     cx, IMG_A_LEN
        call    int21_fs
        jc      .bad
        cmp     ax, IMG_A_LEN
        jne     .bad
        mov     ah, 40h
        mov     dx, rest_party
        mov     cx, 2476
        int     21h
        jc      .bad
        cmp     ax, 2476
        jne     .bad
        mov     ah, 40h
        mov     dx, checkpoint_owned_flags
        mov     cx, CHECKPOINT_LEN-(IMG_A_LEN+2476)
        call    int21_fs
        jc      .bad
        cmp     ax, CHECKPOINT_LEN-(IMG_A_LEN+2476)
        jne     .bad
        mov     ah, 3Eh
        int     21h
        ret
.bad:
        mov     ah, 3Eh
        int     21h
        stc
        ret

checkpoint_rename:                  ; DS:DX old, ES:DI new (same directory)
        push    es
        push    ds
        pop     es
        mov     ah, 56h
        int     21h
        pop     es
        ret

clear_seed_moves:
        push    ax
        push    cx
        push    di
        xor     ax, ax
        xor     di, di
        mov     cx, PARTY_MOVE_MAX
.loop:
        mov     [seed_moves+di], ax
        add     di, 2
        loop    .loop
        pop     di
        pop     cx
        pop     ax
        ret

clear_seed_thief_matrix:
        push    ax
        push    cx
        push    di
        xor     ax, ax
        xor     di, di
        mov     cx, PARTY_THIEF_MAX * PARTY_THIEF_SKILL_COUNT
.loop:
        mov     [seed_thief_matrix+di], al
        inc     di
        loop    .loop
        pop     di
        pop     cx
        pop     ax
        ret

read_step_yield:
        mov     ax, 3D00h
        mov     dx, steppath
        int     21h
        jc      .fail
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 14
        mov     dx, stepbuf
        int     21h
        push    ax
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 14
        jne     .fail
        cmp     word [stepbuf], 'GB'
        jne     .fail
        cmp     word [stepbuf+2], 'ST'
        jne     .fail
        cmp     word [stepbuf+4], 1
        jne     .fail
        mov     ax, [stepbuf+6]
        cmp     ax, 255
        ja      .fail
        mov     [step_descriptor], ax
        mov     [step_cell_word], ax
        mov     ax, [stepbuf+8]
        mov     [step_x], ax
        mov     ax, [stepbuf+10]
        mov     [step_y], ax
        mov     ax, [stepbuf+12]
        shr     ax, 1
        and     ax, 0003h
        mov     [step_facing], ax
        cmp     word [gamep], game_dqk
        jne     .done
        mov     ax, [step_x]
        cmp     ax, 255
        ja      .fail
        mov     ax, [step_y]
        cmp     ax, 255
        ja      .fail
        mov     ah, al
        mov     al, [step_x]
        mov     [step_cell_word], ax
.done:
        clc
        ret
.fail:
        stc
        ret

; CCFP requires a decoded wall grid even when an opaque ECL PICTURE will cover
; the whole viewport. For a Gen1 virtual/overland GEO id, use the profile's
; known map-34 wall data strictly as presentation backing; restore the logical
; map id before the caller continues its ECL state handling.
build_scene_wall_fallback:
        cmp     byte [graphics_scene_ready], 0
        je      .err
        cmp     word [enginep], eng_dax_gen1
        jne     .err
        cmp     word [geop], 0
        je      .err
        mov     ax, [mapid]
        mov     [scene_source_mapid], ax
        mov     ax, [geop]
        mov     [scene_source_geop], ax
        cmp     byte [demoflag], 0
        jne     .source_map
        mov     word [mapid], 34
.source_map:
        ; The CoK and DoK demo scripts name logical GEO scene routes rather
        ; than CCGEO wall-grid members. Their opaque pictures still need a
        ; valid grid for CCFP, so use the proven area-1 map 34 strictly as
        ; invisible presentation backing.
        cmp     byte [demoflag], 0
        je      .build
        cmp     word [gamep], game_cok
        je      .demo_map34
        cmp     word [gamep], game_dok
        jne     .build
.demo_map34:
        mov     word [geop], f_geo1_dax
        mov     word [mapid], 34
.build:
        call    build_geo_tail
        mov     word [runpathp], child_geo
        call    do_exec
        mov     ax, [scene_source_mapid]
        mov     [mapid], ax
        mov     ax, [scene_source_geop]
        mov     [geop], ax
        jc      .err
        mov     ah, 4Dh
        int     21h
        or      al, al
        jnz     .err
        clc
        ret
.err:
        stc
        ret

; Present the currently selected ECL picture before a combat yield. This is
; deliberately non-fatal: missing art must not block the retail combat route.
; The opening's last pre-combat record is DoK PIC2#96, so this establishes the
; real narrative-to-tactical boundary while the ordered multi-record replay is
; expanded separately.
present_precombat_pictures:
        ; Round 36: ordinary play now takes the same bridge the title demo
        ; takes.  TERMINATION CAVEAT, added after this comment first shipped
        ; over a hang: taking the same bridge is not the same as taking the same
        ; exit.  The scene child is CCFP, and CCFP's ordinary render path ends in
        ; a blocking INT 16h.  build_fp_tail therefore bounds the child on the
        ; two non-interactive hosts (/X snapshot and /T stepped play, see the
        ; measured transcript at build_fp_tail.walk) and leaves the key-wait in
        ; place only for a genuinely interactive session, where a human pressing
        ; a key IS the exit.  Before that, /T-stepped DoK never terminated:
        ; 1.61 s before the promotion, killed at 60 s / 91 s / 301 s after.
        ; The comment that stood here said non-demo play "retains the
        ; narrower Amiga-only pre-combat bridge until its ordinary event timing
        ; is promoted separately", and the gate below it required
        ; graphics_requested == 2 plus a located Amiga archive -- so on a DOS
        ; install the complete DOS scene decode at .dos_scene was unreachable
        ; outside the demo and NO pre-combat picture was presented at all.
        ; Measured before this change, non-demo: DoK area 1 entry 16 collects 6
        ; PICTURE records (5 after the 255 reset sentinel) and presented 0 of
        ; them under /G 1 against 5 of 5 under /G 2.  CoK's own proven
        ; encounter carries no PICTURE record at all, so it neither confirms
        ; nor refutes this -- 725 CoK configurations (213 direct ECL entries
        ; across areas 1-3, 512 area-1/2 cells) reached combat 7 times and none
        ; of the 6 non-demo ones carried one.
        ;
        ; What survives of the old gate is the part that is a real
        ; prerequisite rather than a platform preference: this bridge composes
        ; its opaque scene over a Gen1 wall grid (build_scene_wall_fallback
        ; requires eng_dax_gen1 and a GEO), and CCFP needs that area's
        ; WALLDEF/8X8D bank present.  Both are checked here so a title without
        ; them returns before touching the script table instead of printing one
        ; skip line per record.
        cmp     byte [demoflag], 0
        jne     .begin
        cmp     word [enginep], eng_dax_gen1
        jne     .ret
        cmp     word [geop], 0
        je      .ret
        call    detect_texture_art
        cmp     byte [texflag], 0
        je      .ret
.begin:
        call    collect_effect_pictures
        jc      .done
        mov     word [scene_event_index], 0
.next:
        mov     ax, [scene_event_index]
        cmp     ax, [scene_source_count]
        jae     .done
        shl     ax, 1
        mov     bx, ax
        mov     ax, [scene_source_ids+bx]
        mov     [graphics_picture_id], ax
        mov     ax, [scene_source_events+bx]
        mov     [scene_script_event_selected], ax
        call    find_scene_text_for_picture
        cmp     word [graphics_picture_id], 255
        je      .advance              ; retail PICTURE reset sentinel, not art
        mov     byte [graphics_picture_locked], 1
        mov     byte [scene_replay_force], 1
        call    prepare_alt_graphics
        cmp     byte [graphics_scene_ready], 0
        jne     .have_scene
        mov     si, s_scene_skip_art
        call    puts
        jmp     .advance
.have_scene:
        call    build_scene_wall_fallback
        jnc     .have_scene_wall
        mov     si, s_scene_skip_wall
        call    puts
        jmp     .advance
.have_scene_wall:
        call    build_fp_tail
        mov     word [runpathp], child_fp
        call    do_exec
        jc      .skip_exec
        ; ROUND 36: check the child's exit code, not just that EXEC succeeded.
        ; This site counted a picture as presented on CF=0 alone, which is only
        ; "DOS managed to load CCFP" -- a CCFP that ran and failed still got
        ; counted, so the "N of N presented" figure this loop feeds could be
        ; larger than the number of pictures actually drawn.  Every other
        ; do_exec site in this file already reads AH=4Dh (build_scene_wall_
        ; fallback at :5329 among them); this one did not.
        mov     ah, 4Dh
        int     21h
        ; AH holds the child's DOS return code; AL holds its termination type.
        ; A clean CCFP frame requires both to be zero.
        or      ax, ax
        jz      .replayed
.skip_exec:
        mov     si, s_scene_skip_exec
        call    puts
        jmp     .advance
.replayed:
        call    add_replayed_picture
        ; A missing/failed individual frame remains non-fatal. Continue the
        ; bounded script order so one unsupported picture cannot suppress the
        ; following retail narrative record.
.advance:
        inc     word [scene_event_index]
        jmp     .next
.done:
        mov     byte [graphics_picture_locked], 0
        mov     byte [scene_replay_force], 0
        call    write_picture_replay
.ret:
        ret

add_replayed_picture:
        mov     ax, [scene_replay_count]
        cmp     ax, 16
        jae     .ret
        shl     ax, 1
        mov     bx, ax
        mov     ax, [graphics_picture_id]
        mov     [scene_replay_ids+bx], ax
        inc     word [scene_replay_count]
.ret:
        ret

write_picture_replay:
        cmp     word [scene_replay_count], 0
        je      .ret
        mov     ax, [scene_replay_count]
        mov     [picture_replay_count], ax
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, picturereplaypath
        int     21h
        jc      .ret
        mov     [efxfh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, 8
        mov     dx, picture_replay_header
        int     21h
        cmp     ax, 8
        jne     .close
        mov     ax, [scene_replay_count]
        shl     ax, 1
        mov     cx, ax
        mov     bx, [efxfh]
        mov     ah, 40h
        mov     dx, scene_replay_ids
        int     21h
.close:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

prepare_alt_graphics:
        mov     byte [graphics_scene_ready], 0
        mov     byte [graphics_scene_paperdoll], 0
        ; A matching C64 scene temporarily replaces this path with the
        ; read-only imported resource.  Restore the ordinary bridge target
        ; before every PICTURE so a following DOS fallback cannot overwrite
        ; C64SCENE.GBI and make a later matching picture fall back too.
        mov     di, altscenepath
        mov     si, s_altscene
        call    compose_tool_path
        cmp     byte [graphics_requested], 3
        jne     .not_c64
        ; Ordinary live effects arrive here with no caller-selected PICTURE.
        ; Resolve the current GBSX record before comparing an imported C64 GBIM
        ; id: otherwise graphics_picture_id is still zero (or the prior
        ; effect's id), and a valid C64 scene silently misses or replays the
        ; wrong picture. Ordered pre-combat replay already locks its own id.
        cmp     byte [graphics_picture_locked], 0
        jne     .c64_picture_ready
        call    read_effect_picture
        jc      .not_c64
.c64_picture_ready:
        call    prepare_c64_scene
        jnc     .ret
.not_c64:
        cmp     byte [graphics_requested], 2
        jne     .dos_image
        cmp     byte [graphics_amiga_available], 0
        je      .dos_image
        cmp     byte [texflag], 0
        je      .scene
        call    tail_begin
        call    tail_append_space
        mov     si, [graphics_daap]
        call    tail_append_str
        call    tail_append_space
        mov     ax, 2                    ; CoK DAA TOC index for logical block 203
        cmp     word [gamep], game_dok
        jne     .first_index_ready
        mov     ax, 29                   ; DoK wide-frame DAA: TOC #29 is logical block 203
.first_index_ready:
        call    tail_append_dec
        mov     si, s_arg_daa_tiles
        call    tail_append_str
        mov     si, altgraphicspath
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_daa
        call    do_exec_checked
        jc      .second
        mov     byte [graphics_alt_ready], 1
.second:
        call    tail_begin
        call    tail_append_space
        mov     si, [graphics_daap]
        call    tail_append_str
        call    tail_append_space
        mov     ax, 1                    ; CoK DAA TOC index for logical block 202
        cmp     word [gamep], game_dok
        jne     .second_index_ready
        mov     ax, 28                   ; DoK wide-frame DAA: TOC #28 is logical block 202
.second_index_ready:
        call    tail_append_dec
        mov     si, s_arg_daa_tiles
        call    tail_append_str
        mov     si, altgraphicspath2
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_daa
        call    do_exec_checked
        jc      .image
        mov     byte [graphics_alt_ready2], 1
.image:
        call    read_effect_setup_pic
        jc      .scene
        call    find_amiga_cpic
        jc      .scene
        call    tail_begin
        call    tail_append_space
        mov     si, [graphics_cpicp]
        call    tail_append_str
        mov     si, s_arg_daa_block
        call    tail_append_str
        mov     ax, [graphics_setup_pic]
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, altimagepath
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_daa
        call    do_exec_checked
        jc      .scene
        mov     byte [graphics_image_ready], 1
        jmp     .scene
; T6-3: DOS first-person encounter art.  When the Amiga set is not the one
; in force (or its archive is absent), decode the GBES setup monster's CPIC1.DAX
; frame into the same GBIM contract CCFP's /I consumes.  Gen1 DAX titles only;
; a missing id or archive leaves no image and CCFP keeps the marker.  CCFP's
; effect_setup_pic == gbim_block check is the provenance control for staleness.
.dos_image:
        cmp     word [enginep], eng_dax_gen1
        jne     .scene
        cmp     byte [texflag], 0
        je      .scene
        cmp     byte [graphics_picture_locked], 0
        jne     .scene
        call    read_effect_setup_pic    ; before find_dos_cpic: both use fxbuf
        jc      .scene
        call    find_dos_cpic
        jc      .scene
        call    tail_begin
        mov     si, s_arg_dax_block
        call    tail_append_str
        mov     ax, [graphics_setup_pic]
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, altimagepath
        call    tail_append_str
        call    tail_append_space
        mov     si, [graphics_cpicp]
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_gb
        call    do_exec_checked
        jc      .scene
        mov     byte [graphics_image_ready], 1
.scene:
        cmp     byte [graphics_picture_locked], 0
        jne     .have_picture
        call    read_effect_picture
        jc      .ret
.have_picture:
        ; CoK's shop scene is not a PIC2 block.  The original sequence saves
        ; HEAD id 69 then invokes PICTURE 68; the renderer composes HEAD2#69
        ; at (24,24) with BODY2#68 at (24,64), producing the recovered 88x88
        ; paper doll.  Keep both source archives explicit rather than falling
        ; through to an unrelated PIC2 logical id.
        cmp     word [gamep], game_cok
        jne     .not_cok_paperdoll
        cmp     word [graphics_picture_id], 68
        jne     .not_cok_paperdoll
        call    prepare_cok_shopkeeper_scene
        ret
.not_cok_paperdoll:
        ; DoK's opening intercuts BIGPIC1 112/113 with the animated 88x88
        ; PIC2 block 96. It is a distinct source archive, not a failed
        ; BIGPIC lookup. CGB emits its frame-0 GBIM fallback until an Amiga
        ; PIC2 sub-frame bridge is available.
        cmp     word [gamep], game_dok
        jne     .bigpic_scene
        ; The DoK attract demo's early portrait records are PIC4 members,
        ; not BIGPIC fallbacks: #78 opens the reel and #60 introduces the
        ; treasure beat.  Keep the archive choice source-owned so CGB can
        ; decode their frame-0 animated GBIMs.
        cmp     word [graphics_picture_id], 78
        je      .dos_pic4_scene
        cmp     word [graphics_picture_id], 60
        je      .dos_pic4_scene
        cmp     word [graphics_picture_id], 96
        je      .dos_pic2_scene
        cmp     word [graphics_picture_id], 5
        je      .dos_pic5_scene
        cmp     word [graphics_picture_id], 77
        je      .dos_pic5_scene
.bigpic_scene:
        ; Only reach for the Amiga scene archive when the Amiga set is the one
        ; that actually resolved.  graphics_amiga_available is set solely by
        ; resolve_graphics_set's /G 2 branch after it locates a real Amiga tile
        ; archive, so this is "the requested set is Amiga and it was found",
        ; not "an Amiga file happens to be in the directory".  Before round 36
        ; this call was unconditional, which was harmless only because ordinary
        ; play could not get here at all; with the gate above promoted, a
        ; complete install carrying both platforms' archives would otherwise
        ; have drawn Amiga pixels while the boot plan printed "DOS -> DOS", the
        ; exact silent fallback the /G contract exists to prevent.
        cmp     byte [graphics_amiga_available], 0
        je      .dos_scene
        call    find_amiga_bigpic
        jc      .dos_scene
        call    tail_begin
        call    tail_append_space
        mov     si, [graphics_bigpicp]
        call    tail_append_str
        mov     si, s_arg_daa_block
        call    tail_append_str
        mov     ax, [graphics_picture_id]
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, altscenepath
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_daa
        call    do_exec_checked
        jc      .dos_scene
        mov     byte [graphics_scene_ready], 1
.ret:
        ret

; A requested logical PICTURE may be absent from an extracted Amiga archive.
; Keep the source provenance honest: use its original DOS BIGPIC1.DAX frame
; rather than substituting a different Amiga block. CGB selects by logical ID
; and emits the same GBIM v1 contract CCFP consumes from CCDAA.
.dos_scene:
        call    tail_begin
        mov     si, s_arg_dax_block
        call    tail_append_str
        mov     ax, [graphics_picture_id]
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, altscenepath
        call    tail_append_str
        call    tail_append_space
        ; CoK area 2 splits its scene art by logical id: the ordinary portrait
        ;/animation ids (including demo PICTURE 70) live in PIC2.DAX; only
        ; 116 and 119 are BIGPIC2.DAX members. DoK's area-1 opening remains
        ; BIGPIC1.DAX except for its explicit PIC2/PIC5 paths above.
        cmp     word [gamep], game_cok
        jne     .dos_scene_path
        cmp     word [graphics_picture_id], 116
        je      .cok_bigpic
        cmp     word [graphics_picture_id], 119
        je      .cok_bigpic
        mov     si, f_pic2_dax
        jmp     .dos_scene_append
.cok_bigpic:
        mov     si, f_bigpic2_dax
        jmp     .dos_scene_append
.dos_scene_path:
        mov     si, f_bigpic1_dax
.dos_scene_append:
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_gb
        call    do_exec_checked
        jc      .ret
        mov     byte [graphics_scene_ready], 1
        ret

.dos_pic2_scene:
        call    tail_begin
        mov     si, s_arg_dax_block
        call    tail_append_str
        mov     ax, [graphics_picture_id]
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, altscenepath
        call    tail_append_str
        call    tail_append_space
        mov     si, f_pic2_dax
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_gb
        call    do_exec_checked
        jc      .ret
        mov     byte [graphics_scene_ready], 1
        ret

.dos_pic5_scene:
        call    tail_begin
        mov     si, s_arg_dax_block
        call    tail_append_str
        mov     ax, [graphics_picture_id]
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, altscenepath
        call    tail_append_str
        call    tail_append_space
        mov     si, f_pic5_dax
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_gb
        call    do_exec_checked
        jc      .ret
        mov     byte [graphics_scene_ready], 1
        ret

.dos_pic4_scene:
        call    tail_begin
        mov     si, s_arg_dax_block
        call    tail_append_str
        mov     ax, [graphics_picture_id]
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, altscenepath
        call    tail_append_str
        call    tail_append_space
        mov     si, f_pic4_dax
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_gb
        call    do_exec_checked
        jc      .ret
        mov     byte [graphics_scene_ready], 1
        ret

; Emit the two original CoK shopkeeper pieces.  CCFP /H overlays the BODY
; frame beneath the opaque HEAD scene at the coordinates recovered from the
; retail DrawHeadBody call site.
prepare_cok_shopkeeper_scene:
        call    tail_begin
        mov     si, s_arg_dax_block
        call    tail_append_str
        mov     ax, 69
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, altscenepath
        call    tail_append_str
        call    tail_append_space
        mov     si, f_head2_dax
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_gb
        call    do_exec_checked
        jc      .ret
        call    tail_begin
        mov     si, s_arg_dax_block
        call    tail_append_str
        mov     ax, 68
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, altimagepath
        call    tail_append_str
        call    tail_append_space
        mov     si, f_body2_dax
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_gb
        call    do_exec_checked
        jc      .ret
        mov     byte [graphics_scene_ready], 1
        mov     byte [graphics_image_ready], 1
        mov     byte [graphics_scene_paperdoll], 1
.ret:
        ret

; Locate the DOS-side combat-picture archive for the Gen1 DAX titles.  Both
; CoK and DoK ship CPIC1.DAX beside their other archives; the DISK2/GAME
; variants mirror the layouts find_amiga_cpic already probes.
find_dos_cpic:
        mov     dx, f_cpic1_dax
        call    file_exists
        jc      .disk2
        mov     word [graphics_cpicp], f_cpic1_dax
        clc
        ret
.disk2:
        mov     dx, f_disk2_cpic1_dax
        call    file_exists
        jc      .game
        mov     word [graphics_cpicp], f_disk2_cpic1_dax
        clc
        ret
.game:
        mov     dx, n_game_cpic1_dax
        call    file_exists
        jc      .missing
        mov     word [graphics_cpicp], n_game_cpic1_dax
        clc
        ret
.missing:
        stc
        ret

find_amiga_cpic:
        mov     dx, f_cpic1_daa
        call    file_exists
        jc      .disk2
        mov     word [graphics_cpicp], f_cpic1_daa
        clc
        ret
.disk2:
        mov     dx, f_disk2_cpic1_daa
        call    file_exists
        jc      .game
        mov     word [graphics_cpicp], f_disk2_cpic1_daa
        clc
        ret
.game:
        mov     dx, n_game_cpic1_daa
        call    file_exists
        jc      .missing
        mov     word [graphics_cpicp], n_game_cpic1_daa
        clc
        ret
.missing:
        stc
        ret

find_amiga_bigpic:
        mov     dx, f_bigpic1_daa
        call    file_exists
        jc      .disk2
        mov     word [graphics_bigpicp], f_bigpic1_daa
        clc
        ret
.disk2:
        mov     dx, f_disk2_bigpic1_daa
        call    file_exists
        jc      .game
        mov     word [graphics_bigpicp], f_disk2_bigpic1_daa
        clc
        ret
.game:
        mov     dx, n_game_bigpic1_daa
        call    file_exists
        jc      .missing
        mov     word [graphics_bigpicp], n_game_bigpic1_daa
        clc
        ret
.missing:
        stc
        ret

read_effect_setup_pic:
        mov     ax, 3D00h
        mov     dx, [effectreadp]
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, GBEF_SETUP_OFF
        int     21h
        jc      .close_err
        mov     bx, [efxfh]
        mov     ah, 3Fh
        mov     cx, 12
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, 12
        jne     .close_err
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        cmp     word [fxbuf], 'GB'
        jne     .err
        cmp     word [fxbuf+2], 'ES'
        jne     .err
        mov     ax, [fxbuf+8]
        or      ax, ax
        jz      .err
        cmp     ax, 255
        ja      .err
        mov     [graphics_setup_pic], ax
        clc
        ret
.close_err:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

; Read the latest GBSX PICTURE event.
read_effect_picture:
        mov     ax, 3D00h
        mov     dx, [effectreadp]
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 2246
        int     21h
        jc      .close_err
        mov     bx, [efxfh]
        mov     ah, 3Fh
        mov     cx, GBEF_SCRIPT_TOTAL_BYTES
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, GBEF_SCRIPT_TOTAL_BYTES
        jne     .close_err
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        cmp     word [fxbuf], 'GB'
        jne     .err
        cmp     word [fxbuf+2], 'SX'
        jne     .err
        mov     cx, [fxbuf+4]
        cmp     cx, GBEF_SCRIPT_CAP
        ja      .err
        mov     si, fxbuf+6
        mov     word [graphics_picture_id], 0FFFFh
.scan:
        jcxz    .done
        cmp     word [si], 000Eh
        jne     .next
        cmp     word [si+2], 1
        jb      .next
        mov     ax, [si+4]
        mov     [graphics_picture_id], ax
.next:
        add     si, 20
        loop    .scan
.done:
        cmp     word [graphics_picture_id], 0FFFFh
        je      .err
        cmp     word [graphics_picture_id], 255
        ja      .err
        clc
        ret
.close_err:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

; Select the Nth bounded GBSX PICTURE record in source order. This is used for
; narrative playback before a combat yield; unlike read_effect_picture it does
; not collapse the stream to its final record.
read_effect_picture_at:
        mov     ax, 3D00h
        mov     dx, [effectreadp]
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 2246
        int     21h
        jc      .close_err
        mov     bx, [efxfh]
        mov     ah, 3Fh
        mov     cx, GBEF_SCRIPT_TOTAL_BYTES
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, GBEF_SCRIPT_TOTAL_BYTES
        jne     .close_err
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        cmp     word [fxbuf], 'GB'
        jne     .err
        cmp     word [fxbuf+2], 'SX'
        jne     .err
        mov     cx, [fxbuf+4]
        cmp     cx, GBEF_SCRIPT_CAP
        ja      .err
        mov     si, fxbuf+6
        mov     word [scene_picture_seen], 0
        mov     word [scene_script_event_index], 0
.scan:
        jcxz    .err
        cmp     word [si], 000Eh
        jne     .next
        cmp     word [si+2], 1
        jb      .next
        mov     ax, [scene_picture_seen]
        cmp     ax, [scene_event_index]
        jne     .seen_next
        mov     ax, [si+4]
        cmp     ax, 255
        ja      .err
        mov     [graphics_picture_id], ax
        mov     ax, [scene_script_event_index]
        mov     [scene_script_event_selected], ax
        call    find_scene_text_for_picture
        clc
        ret

.seen_next:
        inc     word [scene_picture_seen]
.next:
        add     si, 20
        inc     word [scene_script_event_index]
        loop    .scan
.err:
        stc
        ret
.close_err:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        stc
        ret

; Read the bounded GBSX table once before launching any scene helpers.  The
; title's linear PICTURE order is source state, so retaining its ids and event
; slots makes replay independent of child-process scratch usage between
; frames.
collect_effect_pictures:
        mov     word [scene_source_count], 0
        mov     ax, 3D00h
        mov     dx, [effectreadp]
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 2246
        int     21h
        jc      .close_err
        mov     bx, [efxfh]
        mov     ah, 3Fh
        mov     cx, GBEF_SCRIPT_TOTAL_BYTES
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, GBEF_SCRIPT_TOTAL_BYTES
        jne     .close_err
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        cmp     word [fxbuf], 'GB'
        jne     .err
        cmp     word [fxbuf+2], 'SX'
        jne     .err
        mov     cx, [fxbuf+4]
        cmp     cx, GBEF_SCRIPT_CAP
        ja      .err
        mov     si, fxbuf+6
        xor     bx, bx
.scan:
        jcxz    .done
        cmp     word [si], 000Eh
        jne     .next
        cmp     word [si+2], 1
        jb      .next
        mov     ax, [si+4]
        cmp     ax, 255
        ja      .err
        cmp     word [scene_source_count], 16
        jae     .next
        mov     di, [scene_source_count]
        shl     di, 1
        mov     [scene_source_ids+di], ax
        mov     [scene_source_events+di], bx
        inc     word [scene_source_count]
.next:
        add     si, 20
        inc     bx
        loop    .scan
.done:
        cmp     word [scene_source_count], 0
        je      .err
        clc
        ret
.close_err:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

; The prose for a PICTURE is commonly a following PRINT/PRINTCLEAR event.
; Bind the scene to the first populated text slot before the next PICTURE,
; preserving the authored narrative grouping rather than merely the image ID.
find_scene_text_for_picture:
        mov     ax, [scene_script_event_selected]
        mov     [scene_text_event_selected], ax
.scan:
        cmp     ax, [fxbuf+4]
        jae     .ret
        mov     bx, ax
        shl     bx, 4
        mov     dx, ax
        shl     dx, 2
        add     bx, dx              ; index * 20
        cmp     ax, [scene_script_event_selected]
        je      .text
        cmp     word [fxbuf+6+bx], 000Eh
        je      .ret
.text:
        mov     bx, ax
        shl     bx, 5
        mov     dx, ax
        shl     dx, 1
        add     bx, dx              ; index * 34
        cmp     word [fxbuf+GBEF_SCRIPT_TEXT_REL+bx], 0
        jne     .found
        inc     ax
        jmp     .scan
.found:
        mov     [scene_text_event_selected], ax
.ret:
        ret

build_tool_prefix:
        mov     byte [toolprefix], 0
        push    es
        mov     es, [2Ch]
        xor     di, di
.scan:
        cmp     byte [es:di], 0
        jne     .adv
        cmp     byte [es:di+1], 0
        je      .endenv
.adv:
        inc     di
        jmp     .scan
.endenv:
        add     di, 2
        add     di, 2
        mov     bx, toolprefix
        xor     dx, dx
.copy:
        mov     al, [es:di]
        or      al, al
        jz      .donecopy
        mov     [bx], al
        cmp     al, '\'
        je      .sep
        cmp     al, ':'
        je      .sep
        jmp     .next
.sep:
        lea     dx, [bx+1]
        sub     dx, toolprefix
.next:
        inc     bx
        inc     di
        jmp     .copy
.donecopy:
        pop     es
        mov     di, toolprefix
        add     di, dx
        mov     byte [di], 0
        ret

compose_tool_path:                       ; DI=dest, SI=suffix
        push    si
        mov     si, toolprefix
.prefix:
        mov     al, [si]
        or      al, al
        jz      .suffix_start
        mov     [di], al
        inc     si
        inc     di
        jmp     .prefix
.suffix_start:
        pop     si
        ; A packaged /8 profile replaces the leading _GB while retaining the
        ; exact filename length, so child COM tails do not grow.
        cmp     byte [state_namespace], 0
        je      .suffix
        cmp     byte [si], '_'
        jne     .suffix
        cmp     byte [si+1], 'G'
        jne     .suffix
        cmp     byte [si+2], 'B'
        jne     .suffix
        mov     al, [state_prefix]
        mov     [di], al
        mov     al, [state_prefix+1]
        mov     [di+1], al
        mov     al, [state_prefix+2]
        mov     [di+2], al
        add     di, 3
        add     si, 3
.suffix:
        mov     al, [si]
        mov     [di], al
        or      al, al
        jz      .done
        inc     si
        inc     di
        jmp     .suffix
.done:
        ret

set_state_checkpoint_name:              ; DI=basename, SI=SAVE.<ext>
        mov     ax, [state_prefix]
        mov     [di], ax
        mov     al, [state_prefix+2]
        mov     [di+2], al
        add     di, 3
.copy:
        mov     al, [si]
        mov     [di], al
        inc     si
        inc     di
        or      al, al
        jne     .copy
        ret

build_geo_tail:
        call    tail_begin
        mov     si, s_arg_bridge
        call    tail_append_str
        mov     si, [geop]
        call    tail_append_str
        call    tail_append_space
        mov     ax, [mapid]
        call    tail_append_dec
        call    tail_append_space
        mov     si, wallpath
        call    tail_append_str
        call    tail_finish
        ret

build_geo_crop_tail:
        call    tail_begin
        mov     si, s_arg_crop_bridge
        call    tail_append_str
        mov     si, [geop]
        call    tail_append_str
        call    tail_append_space
        mov     ax, [mapid]
        call    tail_append_dec
        call    tail_append_space
        mov     si, effectwallpath
        call    tail_append_str
        call    tail_append_space
        mov     ax, [step_x]
        call    tail_append_dec
        call    tail_append_space
        mov     ax, [step_y]
        call    tail_append_dec
        call    tail_finish
        ret

build_fp_tail:
        call    tail_begin
        call    tail_append_space
        mov     si, wallpath
        call    tail_append_str
        ; Ordered ECL PICTURE replay is an opaque GBIM scene.  Do not let a
        ; normally selected HLIB wall-preview path bypass /U and /K: those are
        ; the resources that make the original narrative art visible.
        cmp     byte [scene_replay_force], 0
        jne     .replay_scene
        cmp     byte [hlibflag], 0
        je      .chktex
        mov     si, s_arg_firstgbw
        call    tail_append_str
        mov     si, gbwpath
        call    tail_append_str
        cmp     word [eclp], 0
        je      .walk
        mov     si, s_arg_effect
        call    tail_append_str
        mov     si, [effectreadp]
        call    tail_append_str
        jmp     .walk
.chktex:
        cmp     byte [texflag], 0
        jne     .tex
        cmp     word [eclp], 0
        je      .walk
        mov     si, s_arg_effect
        call    tail_append_str
        mov     si, [effectreadp]
        call    tail_append_str
        jmp     .walk
.tex:
        cmp     word [eclp], 0
        je      .tex_no_effect
        ; Forced picture replay supplies an opaque /K scene and has no need to
        ; ask CCFP to re-open the ECL sidecar.  Besides being semantically
        ; cleaner, omitting this absolute path avoids overflowing DOS's
        ; 127-byte child command tail during the opening sequence.
        cmp     byte [scene_replay_force], 0
        jne     .tex_no_effect
        mov     si, s_arg_effect
        call    tail_append_str
        mov     si, [effectreadp]
        call    tail_append_str
.tex_no_effect:
        mov     si, s_arg_textured
        call    tail_append_str
        mov     si, s_arg_area
        call    tail_append_str
        mov     al, [texarea_ch]
        call    tail_append_char
        cmp     byte [graphics_alt_ready], 0
        je      .maybe_second_alt
        mov     si, s_arg_altgraphics
        call    tail_append_str
        mov     si, altgraphicspath
        call    tail_append_str
.maybe_second_alt:
        ; An opaque replay scene needs the first GBTS resource only to enable
        ; its palette path. Avoid optional wall/combat resources here so the
        ; DOS child tail stays below 127 bytes during scripted playback.
        cmp     byte [scene_replay_force], 0
        jne     .maybe_scene
        cmp     byte [graphics_alt_ready2], 0
        je      .maybe_image
        mov     si, s_arg_altgraphics2
        call    tail_append_str
        mov     si, altgraphicspath2
        call    tail_append_str
.maybe_image:
        cmp     byte [graphics_image_ready], 0
        je      .maybe_scene
        mov     si, s_arg_altimage
        call    tail_append_str
        mov     si, altimagepath
        call    tail_append_str
.maybe_scene:
        cmp     byte [graphics_scene_ready], 0
        je      .walk
        mov     si, s_arg_altscene
        call    tail_append_str
        mov     si, altscenepath
        call    tail_append_str
        cmp     byte [scene_replay_force], 0
        je      .walk
        mov     si, s_arg_scene_force
        call    tail_append_str
.replay_done:
        jmp     .walk
.replay_scene:
        ; Replay uses only a self-contained /K GBIM scene.  Do not append
        ; wall-texture resources: aside from being irrelevant to an opaque
        ; picture, their absolute paths would exceed DOS's 127-byte child
        ; command tail once a HEAD/BODY overlay is present.
        mov     si, s_arg_effect
        call    tail_append_str
        mov     si, [effectreadp]
        call    tail_append_str
        mov     si, s_arg_text_slot
        call    tail_append_str
        mov     ax, [scene_text_event_selected]
        call    tail_append_dec
        mov     si, s_arg_altscene
        call    tail_append_str
        mov     si, altscenepath
        call    tail_append_str
        cmp     byte [graphics_scene_paperdoll], 0
        je      .replay_no_paperdoll
        mov     si, s_arg_scene_overlay
        call    tail_append_str
.replay_no_paperdoll:
        mov     si, s_arg_scene_force
        call    tail_append_str
        jmp     .replay_done
.walk:
        cmp     byte [scene_replay_force], 0
        je      .normal_walk
        cmp     byte [snapflag], 0
        jne     .maybe_snapshot
        cmp     byte [step_once], 0
        je      .finish
; ROUND 36 DEFECT FIX.  This branch used to jump to .timed_scene, which appended
; CCFP's ' /L'.  MEASURED, not inferred: ' /L' cannot bound this child.  CCFP
; consults automode at exactly one site -- ccfp.asm .gbws_wait -- which is only
; reachable when gbwfpmode is set, and gbwfpmode is set only by CCFP's /F.  This
; builder appends /F (s_arg_firstgbw) solely on the hlibflag branch, and that
; branch is unreachable under scene_replay_force because .replay_scene jumps out
; above it.  So every ' /L' this program has ever emitted was inert, and the
; scene child fell through to CCFP's ordinary .drain/.waitkey blocking INT 16h.
; Direct measurement, same run directory, CCFP invoked standalone on the
; artifacts of a real DoK area-1 entry-16 scene:
;     ... /K C:\_GBSCENE.GBI /O /L        killed at 30.12 s, did not exit
;     ... /K C:\_GBSCENE.GBI /O           killed at 30.03 s, did not exit
;     ... /K C:\_GBSCENE.GBI /O /S <raw>  exited in 1.04 s
; With '/L' and without it behaving identically, '/L' measures as a no-op here,
; and '/S' is what actually terminates.  So:
;   - /X snapshot runs keep taking .maybe_snapshot, unchanged;
;   - HEADLESS STEPPED runs (/T n, step_once) now take the same bounded /S arm,
;     because a scripted run has no operator to press the key CCFP waits for;
;   - a genuinely interactive run (no /X, no /T) appends neither and CCFP waits
;     for a keypress, which is the correct behaviour for a human reading the
;     picture and the only arm where the wait is wanted.
        mov     si, s_arg_snapshot
        call    tail_append_str
        mov     si, picturereplayviewpath
        call    tail_append_str
        jmp     .finish
.normal_walk:
        ; A deterministic snapshot neither resumes nor yields a movement step.
        ; Omitting these paths also keeps asset-heavy invocations below DOS's
        ; 127-byte command-tail ceiling.
        cmp     byte [camp_once], 1
        je      .pose_args
        cmp     byte [snapflag], 0
        jne     .maybe_snapshot
.pose_args:
        mov     si, s_arg_session
        call    tail_append_str
        mov     si, sessionpath
        call    tail_append_str
        mov     si, s_arg_step
        call    tail_append_str
        mov     si, steppath
        call    tail_append_str
        cmp     byte [camp_once], 1
        jne     .maybe_step
        mov     si, s_arg_camp_once
        call    tail_append_str
        jmp     .finish
.maybe_step:
        cmp     byte [step_once], 0
        je      .maybe_snapshot
        mov     si, s_arg_move_once
        call    tail_append_str
        jmp     .finish
.maybe_snapshot:
        cmp     byte [snapflag], 0
        je      .append_walk
        mov     si, s_arg_snapshot
        call    tail_append_str
        cmp     byte [scene_replay_force], 0
        je      .normal_snapshot
        mov     si, picturereplayviewpath
        call    tail_append_str
        jmp     .finish
.normal_snapshot:
        mov     si, viewpath
        call    tail_append_str
        jmp     .finish
.append_walk:
        mov     si, s_arg_walk
        call    tail_append_str
; The ' /L' emission that stood here is deleted, not re-gated.  See the measured
; transcript at .walk above: CCFP honours automode only behind /F, this builder
; never emits /F under scene_replay_force, and the /L and no-/L arms of the
; standalone probe timed out identically.  Emitting an option that names a bound
; the child does not implement is how the hang stayed invisible; the tail now
; says only what CCFP will act on.  (This deletion is behaviour-neutral by
; construction -- the removed bytes were an argument CCFP's parser set a flag
; from and then never read on this path.)
.finish:
        call    tail_finish
        ret

; CCFP acknowledgement mode presents the authoritative GBSL narration and
; writes an identity-bound GBMO token. It needs only the rendered wall grid,
; the terminal effect and the answer path; movement/session yields stay off.
build_hlib_tail:
        call    tail_begin
        mov     si, s_arg_wallset
        call    tail_append_str
        mov     ax, [hlibsetcur]
        mov     bx, [hlibwallp]
        cmp     ax, HLIB_8X8DB_SETS
        jb      .selected
        cmp     word [hlibwall2p], 0
        je      .fallback_primary
        cmp     ax, HLIB_8X8DB_SETS + 8
        jae     .fallback_primary
        sub     ax, HLIB_8X8DB_SETS
        mov     bx, [hlibwall2p]
        jmp     .selected
.fallback_primary:
        xor     ax, ax
        mov     bx, [hlibwallp]
.selected:
        mov     [hlibtailset], ax
        mov     si, bx
        call    tail_append_str
        call    tail_append_space
        mov     ax, [hlibtailset]
        call    tail_append_dec
        call    tail_append_space
        mov     si, gbwpath
        call    tail_append_str
        call    tail_append_space
        mov     ax, 3
        call    tail_append_dec
        call    tail_finish
        ret

prepare_combat_wall:
        cmp     word [enginep], eng_dax_gen1
        jne     .compact
        call    read_effect_geo
        jc      .copy_current
        mov     dx, wallpath
        mov     ah, 41h
        int     21h                         ; replace any prior exploration wall
        mov     dx, effectwallpath
        mov     ah, 41h
        int     21h                         ; replace any prior same-stem combat wall
        call    build_geo_tail
        mov     word [runpathp], child_geo
        call    do_exec
        jc      .ok
        mov     ah, 4Dh
        int     21h
        call    copy_wall_to_effectwall
        jc      .ok
        jmp     .ok
.copy_current:
        call    copy_wall_to_effectwall
        jc      .ok
        jmp     .ok
.compact:
        cmp     word [enginep], eng_hlib
        jne     .ok
        cmp     byte [step_event], 0
        je      .ok
        mov     dx, effectwallpath
        mov     ah, 41h
        int     21h                         ; ignore missing/stale-delete errors
        call    read_effect_geo
        jc      .ok
        call    build_geo_crop_tail
        mov     word [runpathp], child_geo
        call    do_exec
        jc      .ok
        mov     ah, 4Dh
        int     21h
.ok:
        clc
        ret

copy_wall_to_effectwall:
        mov     ax, 3D00h
        mov     dx, wallpath
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, effectwallpath
        int     21h
        jc      .close_in_err
        mov     [auto_fh], ax
.loop:
        mov     bx, [efxfh]
        mov     ah, 3Fh
        mov     cx, 326
        mov     dx, fxbuf
        int     21h
        jc      .close_both_err
        or      ax, ax
        jz      .done
        mov     cx, ax
        mov     bx, [auto_fh]
        mov     ah, 40h
        mov     dx, fxbuf
        int     21h
        jc      .close_both_err
        cmp     ax, cx
        jne     .close_both_err
        jmp     .loop
.done:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_both_err:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.close_in_err:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

build_combat_tail:
        call    tail_begin
        ; A human who chose the interactive ECL path must reach CCCOMBAT's
        ; keyboard renderer too.  /E remains the deterministic resolver for
        ; snapshots, bounded/stepped probes, camp probes, and supplied command
        ; tapes: those callers have no human available to answer a combat turn.
        cmp     byte [interactive_menu], 0
        je      .automatic
        cmp     byte [snapflag], 0
        jne     .automatic
        cmp     byte [step_once], 0
        jne     .automatic
        cmp     byte [camp_once], 0
        jne     .automatic
        cmp     byte [combat_cmd_valid], 0
        jne     .automatic
        mov     si, s_arg_combat_keyboard
        jmp     .mode_ready
.automatic:
        mov     si, s_arg_effect
.mode_ready:
        call    tail_append_str
        mov     si, [effectreadp]
        call    tail_append_toolpath
        cmp     word [monp], 0
        je      .seed
        call    tail_append_space
        mov     si, [monp]
        call    tail_append_str
.seed:
        call    tail_append_space
        mov     ax, 4660
        cmp     word [gamep], game_cok
        jne     .seed_ready
        xor     ax, ax                  ; /J reads GBEF; reclaim three tail bytes
.seed_ready:
        call    tail_append_dec
        call    tail_append_space
        mov     si, combatpath
        call    tail_append_toolpath
        call    tail_append_space
        mov     si, outcomepath
        call    tail_append_toolpath
        cmp     byte [snapflag], 0
        jne     .combat_snapshot
        cmp     byte [step_once], 0
        je      .maybe_icon
.combat_snapshot:
        call    tail_append_space
        mov     si, combatviewpath
        call    tail_append_toolpath
.maybe_icon:
        ; Gen1 combat terrain is supplied as same-stem _GBECL.WGR so the
        ; CCCOMBAT command tail stays below DOS's 127-byte ceiling.
.maybe_result:
        cmp     byte [secret_profile], 0
        je      .profile_done
        mov     si, s_arg_secret_profile
        call    tail_append_str
.profile_done:
        mov     si, s_arg_combat_result
        call    tail_append_str
        mov     si, combatresultpath
        call    tail_append_toolpath
        cmp     byte [combat_cmd_valid], 0
        je      .maybe_real_icon
        mov     si, s_arg_combat_command
        call    tail_append_str
        mov     si, combat_cmd
        call    tail_append_str
; The icon series is the optional argument that yields when the 127-byte DOS
; tail is exhausted: it is the only one that can be dropped without losing
; tactical state.  It is NOT the last argument appended -- ' /P <rosterpath>'
; still follows it at .party_game -- so the guard must reserve that too.
;
; ROUND 36 DEFECT FIX.  The guard as first written compared
; toolpath_len(icon) + 4 + taillen against TAIL_MAX and stopped there, while
; party_tail_len bytes were appended AFTER it.  On a CoK route with a loaded
; party that is 19 more bytes than it counted (' /P ' plus the UNSHORTENED
; 'C:\_GBPARTY.GBP'; every other path in this tail goes through
; tail_append_toolpath and loses one byte, the roster does not).  MEASURED on
; the '/C G' route with an instrumented build that dumps taillen at this point:
; taillen is 95 and toolpath_len(icon) is 12, so the old guard computed
; 12 + 4 + 95 = 111 against 127 and read 16 bytes of headroom that do not
; exist -- the real total with the roster is 111 + 19 = 130.
; Its branch was inverted exactly where it mattered: dropping the icon only
; helps for taillen in [93,108], but the un-reserved arithmetic could not fire
; below taillen 112, by which point 112 + 19 = 131 is over the ceiling with or
; without the icon.  MEASURED on the unmutated source, adding the supported
; option '/C G' to the proven CoK encounter: final tail 130, clamped at 127,
; tailerr=1, truncation landing inside ' /P C:\_GBPARTY.', console 'GBBOOT:
; native preview failed', and NO 'combat icon omitted' note.  Counting the
; roster gives 95 + 19 = 114, which fits, so the icon is dropped and the
; combat runs -- measured on the fixed build, same route: CCCOMBAT tail
; len=114 tailerr=0, '_GBCOMB.RAW' produced, 'combat icon omitted' printed.
;
; The old comment's claim that the alternative is tail_append_char "silently"
; truncating is also wrong and is corrected here: tail_append_char sets tailerr
; (see :8073) and do_exec refuses the EXEC outright (:8151), so the failure is
; loud but total -- the combat does not run at all.  That is the outcome this
; guard exists to trade an icon for.
.maybe_real_icon:
        cmp     byte [graphics_image_ready], 0
        je      .maybe_party
        push    bx
        mov     si, combaticonpath
        call    toolpath_len
        add     ax, 4                    ; the " /I " token itself
        add     ax, [taillen]
        mov     bx, ax
        call    party_tail_len           ; ' /P <roster>' is appended AFTER this
        add     ax, bx
        cmp     word [gamep], game_cok
        jne     .rng_reserved
        add     ax, 3                    ; final " /J" shared-RNG option
.rng_reserved:
        pop     bx
        cmp     ax, TAIL_MAX
        ja      .icon_too_long
        mov     si, s_arg_combat_icon
        call    tail_append_str
        mov     si, combaticonpath
        call    tail_append_toolpath
        jmp     .maybe_party
.icon_too_long:
        mov     si, s_icon_tail_full
        call    puts
.maybe_party:
        ; Asks the SAME routine the icon guard above asked.  The eligibility
        ; test used to be spelled out here and nowhere else, which is why the
        ; guard could not see these bytes coming.
        call    party_tail_len
        or      ax, ax
        je      .finish
        mov     si, s_arg_party
        call    tail_append_str
        mov     si, rosterpath
        call    tail_append_str
.finish:
        cmp     word [gamep], game_cok
        jne     .tail_done
        mov     si, s_arg_cok_rng
        call    tail_append_str
.tail_done:
        call    tail_finish
        ret

; Returns AX = the number of bytes build_combat_tail's .maybe_party arm will
; append, or 0 when this run appends none.  Single source of truth on purpose:
; .maybe_real_icon has to reserve this before it decides the icon fits, because
; ' /P <rosterpath>' is emitted AFTER the icon, and rosterpath is appended with
; tail_append_str rather than tail_append_toolpath, so unlike every other path
; in this tail it is not shortened by one byte.
party_tail_len:
        xor     ax, ax
        cmp     byte [seed_count_valid], 0
        je      .ret
        cmp     word [seed_count], 0
        je      .ret
        cmp     byte [secret_party], 1
        je      .eligible
        call    party_game
        jnc     .ret
.eligible:
        push    si
        mov     si, rosterpath
.len:
        cmp     byte [si], 0
        je      .done
        inc     ax
        inc     si
        jmp     .len
.done:
        pop     si
        add     ax, 4                    ; the ' /P ' token itself
.ret:
        ret

prepare_combat_graphics:
        mov     byte [graphics_image_ready], 0
        mov     byte [graphics_combat_count], 0
        mov     byte [graphics_combat_dos], 0
        cmp     byte [graphics_requested], 2
        jne     .try_dos
        cmp     byte [graphics_amiga_available], 0
        je      .try_dos
        call    find_amiga_cpic
        jnc     .have_source
; The Amiga CPIC archive used to be this bridge's only combat-icon source, so
; every non-Amiga graphics set drew no tactical icon at all.  The retail Gen1
; DOS CPIC archive carries the same logical block ids as its Amiga sibling and
; stores them as ordinary 17-byte-header standard frames, so CGB decodes them
; into the identical GBIM contract CCCOMBAT already consumes from CCDAA.  Keep
; the source lookup ahead of the effect read below: find_dos_cpic and the
; effect-group reader both use fxbuf as scratch.
.try_dos:
        cmp     word [enginep], eng_dax_gen1
        jne     .ret
        call    find_dos_cpic
        jc      .ret
        mov     byte [graphics_combat_dos], 1
.have_source:
        mov     ax, 3D00h
        ; A resumed DoK encounter is written to _GBRES.BIN; effectpath can
        ; still name the pending pre-combat ACK in _GBECL.BIN. Read the
        ; checked current combat yield selected by ecl_return instead.
        mov     dx, [effectreadp]
        int     21h
        jc      .ret
        mov     [efxfh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 32
        int     21h
        jc      .close
        mov     bx, [efxfh]
        mov     ah, 3Fh
        mov     cx, 50
        mov     dx, fxbuf
        int     21h
        cmp     ax, 50
        jne     .close
.close:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        mov     cx, [fxbuf]
        cmp     cx, 8
        jbe     .count_ok
        mov     cx, 8
.count_ok:
        mov     [graphics_combat_groups], cx
        mov     word [graphics_combat_group_idx], 0
.group:
        mov     ax, [graphics_combat_group_idx]
        cmp     ax, [graphics_combat_groups]
        jae     .done
        mov     bx, 6
        mul     bx
        mov     si, ax
        mov     ax, [fxbuf+6+si]
        or      ax, ax
        jz      .next
        cmp     ax, 255
        ja      .next
        mov     [graphics_setup_pic], ax
        xor     bx, bx
.dedupe:
        movzx   dx, byte [graphics_combat_count]
        cmp     bx, dx
        jae     .decode
        mov     di, bx
        shl     di, 1
        cmp     ax, [graphics_combat_ids+di]
        je      .next
        inc     bx
        jmp     .dedupe
.decode:
        call    tail_begin
        cmp     byte [graphics_combat_dos], 0
        jne     .decode_dos
        call    tail_append_space
        mov     si, [graphics_cpicp]
        call    tail_append_str
        mov     si, s_arg_daa_block
        call    tail_append_str
        mov     ax, [graphics_setup_pic]
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, combaticonpath
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_daa
        jmp     .decode_exec
; CGB's argument order puts the archive last ("/B id /I out FILE.DAX"), the
; same tail present_precombat_pictures builds for its DOS scene branch.  A
; block id the archive does not carry exits CGB with errorlevel 1, so the
; group is skipped rather than counted -- no placeholder is substituted.
.decode_dos:
        mov     si, s_arg_dax_block
        call    tail_append_str
        mov     ax, [graphics_setup_pic]
        call    tail_append_dec
        mov     si, s_arg_daa_image
        call    tail_append_str
        mov     si, combaticonpath
        call    tail_append_str
        call    tail_append_space
        mov     si, [graphics_cpicp]
        call    tail_append_str
        call    tail_finish
        mov     word [runpathp], child_gb
.decode_exec:
        call    do_exec_checked
        jc      .next
        movzx   bx, byte [graphics_combat_count]
        mov     di, bx
        shl     di, 1
        mov     ax, [graphics_setup_pic]
        mov     [graphics_combat_ids+di], ax
        inc     byte [graphics_combat_count]
        call    bump_combat_icon_name
.next:
        inc     word [graphics_combat_group_idx]
        jmp     .group
.done:
        call    reset_combat_icon_name
        cmp     byte [graphics_combat_count], 0
        je      .ret
        mov     byte [graphics_image_ready], 1
.ret:
        ret

bump_combat_icon_name:
        push    si
        mov     si, combaticonpath
.scan:
        cmp     byte [si], 0
        je      .found
        inc     si
        jmp     .scan
.found:
        cmp     si, combaticonpath+5
        jb      .ret
        inc     byte [si-5]
.ret:
        pop     si
        ret

reset_combat_icon_name:
        push    si
        mov     si, combaticonpath
.scan:
        cmp     byte [si], 0
        je      .found
        inc     si
        jmp     .scan
.found:
        cmp     si, combaticonpath+5
        jb      .ret
        mov     byte [si-5], '0'
.ret:
        pop     si
        ret

prepare_handler3_seed_sidecar:
        cmp     byte [secret_profile], 1
        je      .ret
        cmp     byte [handler3_valid], 0
        je      .ret
        mov     byte [seed_memory_count], 0
        cmp     word [gamep], game_dqk
        jne     .ret
        cmp     word [eclid], 5
        jne     .ret
        cmp     byte [seed_distance_valid], 0
        jne     .have_distance
        mov     byte [seed_distance_valid], 1
        mov     word [seed_distance], 4
.have_distance:
        ; These are the host inputs to area 5's vmRun1 selector, not the
        ; resulting slot-3 state.  CCECL writes CA/CB/CC during vmRun1 and
        ; GBBOOT then continues through detect_dqk_natural_handler3.
        mov     bx, 0023h
        mov     ax, 3
        call    add_seed_memory
        mov     bx, 0111h
        mov     ax, 29
        call    add_seed_memory
        mov     bx, 0112h
        mov     ax, 2
        call    add_seed_memory
.ret:
        ret

prepare_nwn_ecl7_seed_sidecar:
        cmp     word [gamep], game_nwn
        jne     .ret
        cmp     word [eclp], f_ecl7_dax
        jne     .ret
        cmp     word [eclid], 79
        jne     .ret
        ; ECL7 block 79 is normally entered by the AOL host as ECL 29 with a
        ; vmRun selector in c04f. Selector 125 reaches the verified beholder
        ; encounter and leaves the printed setup text in the effect stream.
        ; Preserve explicit /0 seeds so focused probes can exercise the other
        ; real selector branches through GBBOOT instead of bypassing it.
        mov     bx, 4bf2h
        call    seed_memory_has_key
        jc      .have_ecl_marker
        mov     ax, 29
        call    add_seed_memory
.have_ecl_marker:
        mov     bx, 0c04fh
        call    seed_memory_has_key
        jc      .ret
        mov     ax, 125
        call    add_seed_memory
.ret:
        ret

prepare_dqk_step_host_state:
        cmp     byte [secret_profile], 1
        je      .ok
        cmp     word [gamep], game_dqk
        jne     .ok
        cmp     word [eclid], 5
        jne     .ok
        cmp     word [step_facing], 0
        jne     .ok
        cmp     word [step_x], 0
        jne     .check_ship_gate
        cmp     word [step_y], 0
        jne     .ok
        mov     byte [step_skip_persist], 1
        ; Area 5's northern special position feeds vmRun selector 3 into the
        ; dragon table candidate. These are CCECL logical sparse-memory seed
        ; keys, not original DQK.EXE DGROUP offsets; GBBOOT derives them from
        ; the persisted first-person pose instead of requiring a command-tail
        ; /X probe.
        mov     bx, 0023h
        mov     ax, 3
        call    add_seed_memory
        mov     bx, 0111h
        mov     ax, 29
        call    add_seed_memory
        mov     bx, 0112h
        mov     ax, 2
        call    add_seed_memory
        jmp     .write
.check_ship_gate:
        cmp     word [step_x], 3
        jne     .check_ship_offer
        cmp     word [step_y], 2
        jne     .ok
        mov     byte [step_skip_persist], 1
        ; Area 5's ship-required branch is also selected by CCECL sparse
        ; position keys and vmRun selector, not by a packed x/y word alone.
        mov     word [step_cell_word], 3
        call    prepare_dqk_area5_special_party_seeds
        mov     bx, 0111h
        mov     ax, 3
        call    add_seed_memory
        mov     bx, 0112h
        mov     ax, 2
        call    add_seed_memory
        jmp     .write
.check_ship_offer:
        cmp     word [step_x], 5
        jne     .ok
        cmp     word [step_y], 4
        jne     .ok
        mov     byte [step_skip_persist], 1
        ; A nearby fisherman-offer branch uses selector 7 with the same
        ; CCECL sparse position-key convention.
        mov     word [step_cell_word], 7
        call    prepare_dqk_area5_special_party_seeds
        mov     bx, 0111h
        mov     ax, 5
        call    add_seed_memory
        mov     bx, 0112h
        mov     ax, 4
        call    add_seed_memory
.write:
        call    write_seed_sidecar
        jc      .err
.ok:
        clc
        ret
.err:
        stc
        ret

prepare_dqk_area5_special_party_seeds:
        cmp     byte [secret_profile], 1
        je      .ret
        cmp     byte [seed_distance_valid], 0
        jne     .have_distance
        mov     byte [seed_distance_valid], 1
        mov     word [seed_distance], 4
.have_distance:
        cmp     byte [seed_ranger_valid], 0
        jne     .have_ranger
        mov     byte [seed_ranger_valid], 1
        mov     word [seed_ranger], 1
.have_ranger:
        cmp     byte [seed_strength_valid], 0
        jne     .ret
        mov     byte [seed_strength_valid], 1
        mov     word [seed_strength], 240
.ret:
        ret

add_seed_memory:                        ; BX = sparse address, AX = value
        push    bx
        push    ax
        push    di
        movzx   di, byte [seed_memory_count]
        cmp     di, MEM_SEED_MAX
        jae     .done
        shl     di, 1
        mov     [seed_memory_keys+di], bx
        mov     [seed_memory_vals+di], ax
        inc     byte [seed_memory_count]
.done:
        pop     di
        pop     ax
        pop     bx
        ret

seed_memory_has_key:                    ; BX = sparse address, CF=1 if present
        push    ax
        push    cx
        push    di
        movzx   cx, byte [seed_memory_count]
        xor     di, di
.loop:
        jcxz    .no
        cmp     [seed_memory_keys+di], bx
        je      .yes
        add     di, 2
        dec     cx
        jmp     .loop
.yes:
        stc
        jmp     .done
.no:
        clc
.done:
        pop     di
        pop     cx
        pop     ax
        ret

build_ecl_resume_tail:
        call    tail_begin
        call    tail_append_space
        mov     si, [eclp]
        call    tail_append_str
        call    tail_append_space
        mov     ax, [eclid]
        call    tail_append_dec
        call    append_ccecl_seed_args
        cmp     byte [interactive_menu], 0
        je      .no_interactive_menu
        mov     si, s_arg_interactive_menu
        call    tail_append_str
.no_interactive_menu:
        call    append_ccecl_roster_arg
.no_roster:
        mov     si, s_arg_resume
        call    tail_append_str
        ; All three sidecar paths use the short toolpath form: DQK's
        ; "DISK3\ECL.GLB" route measured a 115-byte tail, and CCFLOW appends
        ; " /R GBR.EFX" (12 bytes) under DOS's 126-byte limit.
        mov     si, [effectreadp]
        call    tail_append_toolpath
        call    tail_append_space
        mov     si, outcomepath
        call    tail_append_toolpath
        mov     si, s_arg_effect
        call    tail_append_str
        mov     si, resumepath
        call    tail_append_toolpath
        call    tail_finish
        ret

; /W records an exact source sibling for [effectwritep]; /V validates the
; existing sibling for [effectreadp].  CCBIND is deliberately a separate
; COM: CCECL has only 81 resident bytes free, while an exact byte comparison
; needs two bounded buffers.  Unbound legacy effects fail closed.
bind_effect_source:                     ; SI -> "/W " or "/V "
        call    tail_begin
        call    tail_append_str
        mov     si, [eclp]
        call    tail_append_toolpath
        call    tail_append_space
        mov     si, [effectreadp]
        call    tail_append_toolpath
        call    tail_finish
        mov     di, titlepath
        mov     [runpathp], di
        mov     si, s_ccbind
        call    compose_tool_path
        call    do_exec_checked
        jc      .bad
        ret
.bad:   stc
        ret

; CCMENU receives the yielded GBEF plus an answer sidecar. /C remains CCECL's
; ordinary automation seed; under explicit /! it also supplies CCMENU's /S
; selection so headless DOSBox can prove the complete host round trip.
build_menu_tail:
        call    tail_begin
        call    tail_append_space
        mov     si, [effectreadp]
        call    tail_append_toolpath
        call    tail_append_space
        mov     si, outcomepath
        call    tail_append_toolpath
        cmp     byte [seed_menu_valid], 0
        je      .finish
        mov     si, s_arg_menu_select
        call    tail_append_str
        mov     ax, [menu_answer]
        call    tail_append_dec
.finish:
        call    tail_finish
        ret

build_efx_tail:
        call    tail_begin
        mov     si, s_arg_host_state
        call    tail_append_str
        mov     si, titlepath
        call    tail_append_str
        call    tail_finish
        ret

; Publish CCEFX's fixed-size host-owned dispatch record before EXEC. CCEFX
; validates magic, version, mode and both zero words before opening a file.
write_host_effect_state:
        ; TITLE.GBM is consumed during the optional title sequence before the
        ; first ECL invocation. Reuse its otherwise-dead path buffer here so
        ; the versioned state bridge does not consume another 112 resident
        ; bytes in GBBOOT's constrained .COM image.
        mov     di, titlepath
        mov     si, s_host_state
        call    compose_tool_path
        mov     dx, titlepath
        xor     cx, cx
        mov     ah, 3Ch
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     word [hostbuf], 'GB'
        mov     word [hostbuf+2], 'HS'
        mov     word [hostbuf+4], 1
        mov     ax, [host_effect_mode]
        mov     [hostbuf+6], ax
        mov     word [hostbuf+8], 0
        mov     word [hostbuf+10], 0
        mov     bx, [efxfh]
        mov     cx, 12
        mov     dx, hostbuf
        mov     ah, 40h
        int     21h
        push    ax
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 12
        jne     .err
        clc
        ret
.err:
        stc
        ret

dump_effect_optional:
dump_resume_effect_optional:
        mov     dx, child_efx
        call    file_exists
        jc      .done
        call    write_host_effect_state
        jc      .done
        call    build_efx_tail
        mov     word [runpathp], child_efx
        call    do_exec
        jc      .done
        mov     ah, 4Dh
        int     21h
.done:
        ret

detect_mon_archive:
        mov     word [monp], 0
        cmp     byte [secret_profile], 0
        jne     .try_dqk_flat
        call    set_mon_area
        mov     al, [monarea_ch]
        mov     [f_monxcha_dax+3], al
        mov     dx, f_monxcha_dax
        call    file_exists
        jc      .try_mon1
        mov     word [monp], f_monxcha_dax
        ret
.try_mon1:
        cmp     byte [f_monxcha_dax+3], '1'
        je      .try_mon0
        mov     byte [f_monxcha_dax+3], '1'
        mov     dx, f_monxcha_dax
        call    file_exists
        jc      .try_mon0
        mov     word [monp], f_monxcha_dax
        ret
.try_mon0:
        mov     dx, f_mon0cha_dax
        call    file_exists
        jc      .try_mon_unsuffixed
        mov     word [monp], f_mon0cha_dax
        ret
.try_mon_unsuffixed:
        mov     dx, f_moncha_dax
        call    file_exists
        jc      .try_dqk_disk
        mov     word [monp], f_moncha_dax
        ret
.try_dqk_disk:
        mov     dx, f_disk2_moncha
        call    file_exists
        jc      .try_dqk_flat
        mov     word [monp], f_disk2_moncha
        ret
.try_dqk_flat:
        mov     dx, f_moncha_glb
        call    file_exists
        jc      .ret
        mov     word [monp], f_moncha_glb
.ret:
        ret

set_mon_area:
        mov     byte [monarea_ch], '1'
        mov     si, [geop]
.scan:
        lodsb
        or      al, al
        jz      .ret
        cmp     al, 'G'
        jne     .scan
        cmp     byte [si], 'E'
        jne     .scan
        cmp     byte [si+1], 'O'
        jne     .scan
        mov     al, [si+2]
        cmp     al, '1'
        jb      .scan
        cmp     al, '9'
        ja      .scan
        mov     [monarea_ch], al
.ret:
        ret

detect_texture_art:
        mov     byte [texflag], 0
        call    set_texture_area
        mov     al, [texarea_ch]
        mov     [f_walldef1_dax+7], al
        mov     [f_8x8d1_dax+4], al
        mov     dx, f_walldef1_dax
        call    file_exists
        jc      .ret
        mov     dx, f_8x8d1_dax
        call    file_exists
        jc      .ret
        mov     dx, f_8x8d_boot_dax
        call    file_exists
        jc      .ret
        mov     byte [texflag], 1
.ret:
        ret

set_texture_area:
        mov     byte [texarea_ch], '1'
        mov     si, [geop]
.scan:
        lodsb
        or      al, al
        jz      .ret
        cmp     al, 'G'
        jne     .scan
        cmp     byte [si], 'E'
        jne     .scan
        cmp     byte [si+1], 'O'
        jne     .scan
        mov     al, [si+2]
        cmp     al, '1'
        jb      .scan
        cmp     al, '9'
        ja      .scan
        mov     [texarea_ch], al
.ret:
        ret

detect_hlib_art:
        mov     byte [hlibflag], 0
        mov     word [hlibwallp], 0
        mov     word [hlibwall2p], 0
        mov     dx, f_disk2_8x8db
        call    file_exists
        jc      .try_flat
        mov     word [hlibwallp], f_disk2_8x8db
        mov     dx, f_disk2_8x8dc
        call    file_exists
        jc      .disk_have
        mov     word [hlibwall2p], f_disk2_8x8dc
.disk_have:
        mov     byte [hlibflag], 1
        ret
.try_flat:
        mov     dx, f_8x8db_tlb
        call    file_exists
        jc      .ret
        mov     word [hlibwallp], f_8x8db_tlb
        mov     dx, f_8x8dc_tlb
        call    file_exists
        jc      .flat_have
        mov     word [hlibwall2p], f_8x8dc_tlb
.flat_have:
        mov     byte [hlibflag], 1
.ret:
        ret

select_raw_hlib_wall_set:
        cmp     word [eclp], 0
        jne     .ret
        cmp     byte [hlibflag], 0
        je      .ret
        mov     word [hlibsetcur], 0
        cmp     byte [area_override], 0
        je      .ret
        mov     ax, [area_override_num]
        or      ax, ax
        jz      .ret
        dec     ax
        mov     [hlibsetcur], ax
.ret:
        ret

write_seed_sidecar:
        mov     byte [seed_sidecar_valid], 0
        cmp     word [gamep], game_cok
        jne     .legacy_seed
        call    inventory_ensure
        jc      .err
        jmp     .write
.legacy_seed:
        cmp     word [seed_owned_flags], 0
        jne     .write
        cmp     byte [seed_item_count], 0
        jne     .write
        cmp     byte [seed_affect_count], 0
        jne     .write
        cmp     byte [seed_member_affect_count], 0
        jne     .write
        cmp     byte [seed_move_count], 0
        jne     .write
        cmp     byte [seed_thief_count], 0
        jne     .write
        cmp     byte [seed_thief_matrix_count], 0
        jne     .write
        cmp     byte [seed_spell_count], 0
        jne     .write
        cmp     byte [seed_member_spell_count], 0
        jne     .write
        cmp     byte [seed_memory_count], 0
        jne     .write
        cmp     byte [seed_count_valid], 0
        jne     .write
        cmp     byte [seed_ranger_valid], 0
        jne     .write
        cmp     byte [seed_distance_valid], 0
        jne     .write
        clc
        ret
.write:
        mov     word [seed_version], 1
        cmp     byte [seed_memory_count], 0
        je      .no_memory_version
        mov     word [seed_version], 3
        jmp     .version_ready
.no_memory_version:
        cmp     byte [seed_thief_matrix_count], 0
        je      .version_ready
        mov     word [seed_version], 2
.version_ready:
        cmp     word [seed_owned_flags], 0
        je      .owned_version_ready
        mov     word [seed_version], 4
.owned_version_ready:
        cmp     word [timer_state], 1
        jne     .timer_version_ready
        cmp     word [timer_count], 0
        je      .timer_version_ready
        mov     word [seed_version], 5
.timer_version_ready:
        cmp     word [gamep], game_cok
        jne     .inventory_version_ready
        mov     word [seed_version], 5  ; CCINV publishes v6 after writing the prefix.
.inventory_version_ready:
        mov     word [seed_flags], 0
        mov     word [seed_count_word], 0
        mov     word [seed_ranger_word], 0
        mov     word [seed_distance_word], 0
        cmp     byte [seed_count_valid], 0
        je      .no_count
        or      word [seed_flags], 0001h
        mov     ax, [seed_count]
        mov     [seed_count_word], ax
.no_count:
        cmp     byte [seed_ranger_valid], 0
        je      .no_ranger
        or      word [seed_flags], 0002h
        mov     ax, [seed_ranger]
        mov     [seed_ranger_word], ax
.no_ranger:
        cmp     byte [seed_distance_valid], 0
        je      .no_distance
        or      word [seed_flags], 0004h
        mov     ax, [seed_distance]
        mov     [seed_distance_word], ax
.no_distance:
        mov     al, [seed_item_count]
        mov     [seed_hdr_item_count], al
        mov     al, [seed_affect_count]
        mov     [seed_hdr_affect_count], al
        mov     al, [seed_member_affect_count]
        mov     [seed_hdr_member_affect_count], al
        mov     al, [seed_move_count]
        mov     [seed_hdr_move_count], al
        mov     al, [seed_thief_count]
        mov     [seed_hdr_thief_count], al
        mov     al, [seed_spell_count]
        mov     [seed_hdr_spell_count], al
        mov     al, [seed_member_spell_count]
        mov     [seed_hdr_member_spell_count], al

        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, seedpath
        int     21h
        jc      .err
        mov     [seedfh], ax
        mov     dx, seedhdr
        mov     cx, 22
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_items
        mov     cx, PARTY_ITEM_MAX * 2
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_affects
        mov     cx, PARTY_AFFECT_MAX * 2
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_member_affects
        mov     cx, PARTY_MEMBER_AFFECT_MAX * 4
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_moves
        mov     cx, PARTY_MOVE_MAX * 2
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_thieves
        mov     cx, PARTY_THIEF_MAX * 2
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_spells
        mov     cx, PARTY_SPELL_MAX * 2
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_member_spells
        mov     cx, PARTY_MEMBER_SPELL_MAX * 4
        call    write_seed_chunk
        jc      .close_err
        cmp     word [seed_version], 2
        jb      .no_thief_matrix
        mov     dx, seed_thief_matrix_count
        mov     cx, 1
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_thief_matrix_reserved
        mov     cx, 1
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_thief_matrix
        mov     cx, PARTY_THIEF_MAX * PARTY_THIEF_SKILL_COUNT
        call    write_seed_chunk
        jc      .close_err
.no_thief_matrix:
        cmp     word [seed_version], 3
        jb      .no_memory_seeds
        mov     dx, seed_memory_count
        mov     cx, 1
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_memory_reserved
        mov     cx, 1
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_memory_keys
        mov     cx, MEM_SEED_MAX * 2
        call    write_seed_chunk
        jc      .close_err
        mov     dx, seed_memory_vals
        mov     cx, MEM_SEED_MAX * 2
        call    write_seed_chunk
        jc      .close_err
.no_memory_seeds:
        cmp     word [seed_version], 4
        jb      .no_owned_affects
        mov     dx, seed_owned_flags
        mov     cx, 258
        call    write_seed_chunk
        jc      .close_err
.no_owned_affects:
        cmp     word [seed_version], 5
        jb      .no_timers
        mov     dx, timer_state
        mov     cx, TIMER_STATE_LEN
        call    write_seed_chunk
        jc      .close_err
        mov     dx, timer_zero_ages
        mov     cx, 16
        call    write_seed_chunk
        jc      .close_err
.no_timers:
        mov     bx, [seedfh]
        mov     ah, 3Eh
        int     21h
        jc      .err
        cmp     word [gamep], game_cok
        jne     .seed_ready
        mov     al, 'Q'
        call    inventory_run
        jc      .err
        mov     word [seed_version], 6
.seed_ready:
        mov     byte [seed_sidecar_valid], 1
        clc
        ret
.close_err:
        mov     bx, [seedfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

write_seed_chunk:
        mov     bx, [seedfh]
        mov     ah, 40h
        int     21h
        jc      .err
        cmp     ax, cx
        jne     .err
        clc
        ret
.err:
        stc
        ret

write_empty_combat_outcome:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, outcomepath
        int     21h
        jc      .err
        mov     [seedfh], ax
        mov     bx, ax
        mov     dx, s_outcome_victory
        mov     cx, s_outcome_victory_len
        mov     ah, 40h
        int     21h
        jc      .close_err
        cmp     ax, cx
        jne     .close_err
        mov     bx, [seedfh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_err:
        mov     bx, [seedfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

build_ecl_tail:
        call    tail_begin
        call    tail_append_space
        mov     si, [eclp]
        call    tail_append_str
        call    tail_append_space
        mov     ax, [eclid]
        call    tail_append_dec
        cmp     byte [step_event], 0
        je      .seeded
        cmp     byte [step_handler_mode], 3
        je      .handler3
.seeded:
        call    append_ccecl_seed_args
        call    append_ccecl_roster_arg
        cmp     byte [direct_entry_valid], 0
        je      .check_step_event
        mov     si, s_arg_direct_entry
        call    tail_append_str
        mov     ax, [direct_entry_vaddr]
        call    tail_append_dec
.check_step_event:
        cmp     byte [step_event], 0
        je      .effect
        cmp     byte [step_skip_persist], 0
        jne     .after_persist
        mov     si, s_arg_persist
        call    tail_append_str
        mov     si, [effectreadp]
        call    tail_append_str
.after_persist:
        cmp     byte [step_handler_mode], 4
        je      .precamp
        cmp     byte [step_handler_mode], 2
        jne     .search
        mov     si, s_arg_vmrun
        call    tail_append_str
        mov     ax, [step_cell_word]
        call    tail_append_dec
        mov     si, s_arg_facing
        call    tail_append_str
        mov     ax, [step_facing]
        call    tail_append_dec
        jmp     .effect
.handler3:
        cmp byte [secret_profile],1
        jne .generic_handler3
        call append_ccecl_seed_args
        call append_ccecl_roster_arg
        jmp .handler3_no_seed
.generic_handler3:
        cmp     byte [seed_sidecar_valid], 0
        je      .handler3_no_seed
        mov     si, s_arg_seed_file
        call    tail_append_str
        mov     si, seedpath
        call    tail_append_str
.handler3_no_seed:
        cmp     byte [effect_state_valid], 0
        je      .handler3_no_persist
        mov     si, s_arg_persist
        call    tail_append_str
        mov     si, [effectreadp]
        call    tail_append_str
.handler3_no_persist:
        mov     si, s_arg_handler3
        call    tail_append_str
        mov     ax, [step_descriptor]
        call    tail_append_dec
        mov     si, s_arg_facing
        call    tail_append_str
        mov     ax, [step_facing]
        call    tail_append_dec
        jmp     .effect
.search:
        mov     si, s_arg_search
        call    tail_append_str
        mov     ax, [step_descriptor]
        call    tail_append_dec
        mov     si, s_arg_facing
        call    tail_append_str
        mov     ax, [step_facing]
        call    tail_append_dec
        jmp     .effect
.precamp:
        mov     si, s_arg_precamp
        call    tail_append_str
        mov     ax, [step_cell_word]
        call    tail_append_dec
        mov     si, s_arg_facing
        call    tail_append_str
        mov     ax, [step_facing]
        call    tail_append_dec
.effect:
        cmp     byte [interactive_menu], 0
        je      .no_interactive_menu
        mov     si, s_arg_interactive_menu
        call    tail_append_str
.no_interactive_menu:
        mov     si, s_arg_effect
        call    tail_append_str
        mov     si, [effectwritep]
        cmp byte [secret_profile],1
        jne .ordinary_effect_path
        call tail_append_toolpath
        jmp .effect_path_done
.ordinary_effect_path:
        call    tail_append_str
.effect_path_done:
        call    tail_finish
        ret

append_ccecl_seed_args:
        cmp     byte [seed_sidecar_valid], 0
        je      .legacy
        mov     si, s_arg_seed_file
        call    tail_append_str
        mov     si, seedpath
        cmp byte [secret_profile],1
        jne .ordinary_seed_path
        call tail_append_toolpath
        jmp .strength
.ordinary_seed_path:
        call    tail_append_str
        jmp     .strength
.legacy:
        mov     word [seed_item_index], 0
.item_loop:
        mov     ax, [seed_item_index]
        movzx   bx, byte [seed_item_count]
        cmp     ax, bx
        jae     .affect
        mov     si, s_arg_seed_item
        call    tail_append_str
        mov     bx, [seed_item_index]
        shl     bx, 1
        mov     ax, [seed_items+bx]
        call    tail_append_dec
        inc     word [seed_item_index]
        jmp     .item_loop
.affect:
        mov     word [seed_affect_index], 0
.affect_loop:
        mov     ax, [seed_affect_index]
        movzx   bx, byte [seed_affect_count]
        cmp     ax, bx
        jae     .member_affect
        mov     si, s_arg_seed_affect
        call    tail_append_str
        mov     bx, [seed_affect_index]
        shl     bx, 1
        mov     ax, [seed_affects+bx]
        call    tail_append_dec
        inc     word [seed_affect_index]
        jmp     .affect_loop
.member_affect:
        mov     word [seed_member_affect_index], 0
.member_affect_loop:
        mov     ax, [seed_member_affect_index]
        movzx   bx, byte [seed_member_affect_count]
        cmp     ax, bx
        jae     .move
        mov     si, s_arg_seed_member_affect
        call    tail_append_str
        mov     bx, [seed_member_affect_index]
        shl     bx, 1
        shl     bx, 1
        mov     ax, [seed_member_affects+bx]
        call    tail_append_dec
        call    tail_append_space
        mov     bx, [seed_member_affect_index]
        shl     bx, 1
        shl     bx, 1
        mov     ax, [seed_member_affects+bx+2]
        call    tail_append_dec
        inc     word [seed_member_affect_index]
        jmp     .member_affect_loop
.move:
        mov     word [seed_move_index], 0
.move_loop:
        mov     ax, [seed_move_index]
        movzx   bx, byte [seed_move_count]
        cmp     ax, bx
        jae     .thief
        mov     si, s_arg_seed_move
        call    tail_append_str
        mov     bx, [seed_move_index]
        shl     bx, 1
        mov     ax, [seed_moves+bx]
        call    tail_append_dec
        inc     word [seed_move_index]
        jmp     .move_loop
.thief:
        mov     word [seed_thief_index], 0
.thief_loop:
        mov     ax, [seed_thief_index]
        movzx   bx, byte [seed_thief_count]
        cmp     ax, bx
        jae     .spell
        mov     si, s_arg_seed_thief
        call    tail_append_str
        mov     bx, [seed_thief_index]
        shl     bx, 1
        mov     ax, [seed_thieves+bx]
        call    tail_append_dec
        inc     word [seed_thief_index]
        jmp     .thief_loop
.spell:
        mov     word [seed_spell_index], 0
.spell_loop:
        mov     ax, [seed_spell_index]
        movzx   bx, byte [seed_spell_count]
        cmp     ax, bx
        jae     .member_spell
        mov     si, s_arg_seed_spell
        call    tail_append_str
        mov     bx, [seed_spell_index]
        shl     bx, 1
        mov     ax, [seed_spells+bx]
        call    tail_append_dec
        inc     word [seed_spell_index]
        jmp     .spell_loop
.member_spell:
        mov     word [seed_member_spell_index], 0
.member_spell_loop:
        mov     ax, [seed_member_spell_index]
        movzx   bx, byte [seed_member_spell_count]
        cmp     ax, bx
        jae     .count
        mov     si, s_arg_seed_member_spell
        call    tail_append_str
        mov     bx, [seed_member_spell_index]
        shl     bx, 2
        mov     ax, [seed_member_spells+bx+2]
        call    tail_append_dec
        call    tail_append_space
        mov     bx, [seed_member_spell_index]
        shl     bx, 2
        mov     ax, [seed_member_spells+bx]
        call    tail_append_dec
        inc     word [seed_member_spell_index]
        jmp     .member_spell_loop
.count:
        cmp     byte [seed_count_valid], 0
        je      .ranger
        mov     si, s_arg_seed_count
        call    tail_append_str
        mov     ax, [seed_count]
        call    tail_append_dec
.ranger:
        cmp     byte [seed_ranger_valid], 0
        je      .distance
        mov     si, s_arg_seed_ranger
        call    tail_append_str
        mov     ax, [seed_ranger]
        call    tail_append_dec
.distance:
        cmp     byte [seed_distance_valid], 0
        je      .strength
        mov     si, s_arg_seed_distance
        call    tail_append_str
        mov     ax, [seed_distance]
        call    tail_append_dec
.strength:
        cmp     byte [seed_strength_valid], 0
        je      .derived_strength
        mov     si, s_arg_seed_strength
        call    tail_append_scalar
        mov     ax, [seed_strength]
        call    tail_append_dec
        jmp     .input
.derived_strength:
        cmp     byte [secret_strength_valid], 0
        je      .input
        mov     si, s_arg_seed_strength
        call    tail_append_scalar
        mov     ax, [secret_strength_value]
        call    tail_append_dec
.input:
        cmp     byte [seed_input_valid], 0
        je      .menu
        mov     si, s_arg_seed_input
        call    tail_append_scalar
        mov     ax, [seed_input]
        call    tail_append_dec
.menu:
        cmp     byte [seed_menu_valid], 0
        je      .parlay
        mov     si, s_arg_seed_menu
        call    tail_append_scalar
        mov     ax, [seed_menu]
        call    tail_append_dec
.parlay:
        cmp     byte [seed_parlay_valid], 0
        je      .encounter
        mov     si, s_arg_seed_parlay
        call    tail_append_scalar
        mov     ax, [seed_parlay]
        call    tail_append_dec
.encounter:
        cmp     byte [seed_encounter_valid], 0
        je      .who
        mov     si, s_arg_seed_encounter
        call    tail_append_scalar
        mov     ax, [seed_encounter]
        call    tail_append_dec
.who:
        cmp     byte [seed_who_valid], 0
        je      .done
        mov     si, s_arg_seed_who
        call    tail_append_scalar
        mov     ax, [seed_who]
        call    tail_append_dec
.done:
        ret

append_ccecl_roster_arg:
        cmp     byte [secret_profile], 1
        je      .secret
        cmp     byte [secret_party], 1
        jne     .generic
.secret:
        mov si,s_arg_secret_id
        call tail_append_str
        cmp byte [secret_names_valid],1
        jne .done
        mov si,s_arg_roster_file
        call tail_append_str
        mov si,secret_names_reply
        call tail_append_toolpath
        ret
.generic:
        ; CCECL's /B reader owns the bounded GBPR name fields used by WHO.
        ; DQK writes the same normalized 410-byte bridge when its saved QSV
        ; party is materialized, so it must cross both fresh and cold ECL
        ; continuations instead of silently falling back to /W member zero.
        call    current_party_title_id
        jc      .done
        push    ax
        mov     si, s_arg_roster_file
        call    tail_append_str
        mov     si, rosterpath
        call    tail_append_str
        mov     si, s_arg_party_id
        call    tail_append_str
        pop     ax
        add     al, '0'
        call    tail_append_char
.done:
        ret

; Validate a GBPR header at DS:SI against the selected profile. V1 remains
; readable as a legacy shape, but only v2 carries title provenance. Compact
; v1 is never accepted for CoK field offsets or title-specific writeback.
validate_gbpr_header:
        cmp     dword [si], 'GBPR'
        jne     .bad
        cmp     word [si+8], 410
        jne     .bad
        mov     cx, [si+6]
        cmp     cx, 8                    ; DQK v2 rosters hold up to 8 rows
        ja      .bad
        mov     ax, [si+4]
        cmp     ax, 1
        je      .v1
        cmp     ax, 2
        jne     .bad
        cmp     word [si+14], 1
        jne     .bad
        call    current_party_title_id
        jc      .v2_generic
        cmp     ax, [si+12]
        jne     .bad
        cmp     ax, 3
        je      .row_cap_ok
        cmp     cx, 6                    ; every other title keeps six rows
        ja      .bad
.row_cap_ok:
        cmp     ax, 1
        jne     .compact
        cmp     word [si+10], 0
        jne     .bad
        jmp     short .ok
.compact:
        cmp     word [si+10], 1
        jne     .bad
        jmp     short .ok
.v2_generic:
        ; CCPARTY's shared Gen1 writer emits the canonical CoK-shaped v2
        ; bridge for generic DAX profiles. They have no title identity here;
        ; admit only that noncompact shape on the Gen1 DAX engine.
        cmp     word [enginep], eng_dax_gen1
        jne     .bad
        cmp     cx, 6
        ja      .bad
        cmp     word [si+12], 1
        jne     .bad
        cmp     word [si+10], 0
        jne     .bad
.ok:
        jmp     short .success
.v1:   cmp     cx, 6
        ja      .bad
        cmp     dword [si+12], 0
        jne     .bad
        mov     bx, [si+10]
        call    current_party_title_id
        jc      .v1_generic
        cmp     ax, 1
        jne     .v1_compact_profile
        or      bx, bx
        jnz     .bad
        jmp     short .success
.v1_compact_profile:
        cmp     bx, 1
        jne     .bad
        jmp     short .success
.v1_generic:
        mov     bx, [si+10]
        cmp     bx, 1
        ja      .bad
.success:
        ; Success returns exact byte extent in AX and row count in CX.
        ; BX is clobbered; callers retain any actual file length separately.
        mov     ax, cx
        mov     bx, 410
        mul     bx
        add     ax, 16
        clc
        ret
.bad:  stc
        ret

; AX=stable title ID 1/2/3; CF for non-roster game profiles.
current_party_title_id:
        mov     ax, [gamep]
        cmp     ax, game_cok
        je      .cok
        cmp     ax, game_dok
        je      .dok
        cmp     ax, game_dqk
        jne     .bad
        mov     ax, 3
        clc
        ret
.cok:   mov     ax, 1
        clc
        ret
.dok:   mov     ax, 2
        clc
        ret
.bad:   stc
        ret

read_effect_header:
        mov     ax, 3D00h
        mov     dx, [effectreadp]
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 32
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, 32
        jne     .close_err
        cmp word [fxbuf+4],16
        jne .close_header
        call boot_validate_v16
        jc .close_err
.close_header:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        jc .err
        cmp     word [fxbuf], 'GB'
        jne     .err
        cmp     word [fxbuf+2], 'EF'
        jne     .err
        mov     ax, [fxbuf+4]
        cmp     ax, 1
        jb      .err
        cmp ax,16
        je .header_ok
        cmp     ax, 15
        ja      .err
        cmp     ax, 10
        je      .err
        cmp     ax, 9
        jbe     .header_ok
        cmp     word [fxbuf+8], 2         ; v11+ carry explicit host-interaction state
        je      .header_ok
        cmp     word [fxbuf+8], 4         ; Gen2 script-effect capacity record (v15)
        jne     .err
.header_ok:
        mov     ax, [fxbuf+6]
        mov     [fxflags], ax
        mov     ax, [fxbuf+8]
        mov     [fxstatus], ax
        mov     ax, [fxbuf+30]
        mov     [fxchain], ax
        clc
        ret
.close_err:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

read_effect_geo:
        mov     ax, 3D00h
        mov     dx, [effectreadp]
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 32
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, 32
        jne     .close_err
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        cmp     word [fxbuf], 'GB'
        jne     .err
        cmp     word [fxbuf+2], 'EF'
        jne     .err
        mov     ax, [fxbuf+4]
        cmp     ax, 1
        jb      .err
        cmp     ax, 15
        ja      .err
        mov     ax, [fxbuf+6]
        test    ax, 1                   ; FX_HAVE_FILES
        jz      .err
        mov     ax, [fxbuf+10]
        mov     [mapid], ax
        mov     word [hlibsetcur], 0
        mov     ax, [fxbuf+6]
        test    ax, 2                   ; FX_HAVE_PIECES
        jz      .done
        mov     ax, [fxbuf+24]          ; first resolved LOAD_PIECES wall set
        cmp     ax, 0
        je      .done
        cmp     ax, 0FFFFh
        je      .done
        dec     ax                      ; ECL ids are 1-based, CCHLIB W sets are 0-based
        mov     [hlibsetcur], ax
.done:
        clc
        ret
.close_err:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

use_selected_geo_fallback:
        cmp     word [gamep], game_nwn
        je      .nwn
        cmp     word [gamep], game_matrix
        je      .matrix
        cmp     word [gamep], game_buck
        jne     .err
        cmp     word [geop], 0
        je      .err
        mov     word [mapid], 0
        clc
        ret
.matrix:                                ; with MATRIX.CFG CCECL frames 0x4C as the two-
        cmp     word [geop], 0           ; operand Matrix op and the start reaches its
        je      .err                     ; LOAD_FILES (effect-GEO path); this fallback only
                                         ; keeps the route's selected GEO (mapid 17) when an
                                         ; effect carries no LOAD_FILES
        clc
        ret
.nwn:
        cmp     word [eclid], 79
        je      .err
        cmp     word [geop], 0
        je      .err
        cmp     word [mapid], 0
        je      .err
        clc
        ret
.err:
        stc
        ret

; A direct ECL probe can legitimately finish without selecting a GEO map or
; yielding combat. Keep this narrow: each accepted route pins its title, ECL
; member, direct source PC, and the exact terminal effect shape.
accept_terminal_ecl_exit:
        cmp     word [gamep], game_pool
        jne     .nwn
        cmp     word [eclp], f_ecl1_dax
        jne     .err
        cmp     word [eclid], 15
        jne     .err
        cmp     byte [direct_entry_valid], 1
        jne     .err
        cmp     word [direct_entry_vaddr], 33208
        jne     .err
        cmp     word [fxstatus], 0
        jne     .err
        cmp     word [fxflags], 0020h
        jne     .err
        clc
        ret
.nwn:
        cmp     word [gamep], game_nwn
        jne     .err
        cmp     word [eclp], f_ecl7_dax
        jne     .err
        cmp     word [eclid], 79
        jne     .err
        cmp     word [fxstatus], 4
        jne     .err
        cmp     word [fxchain], 29
        jne     .err
        clc
        ret
.err:
        stc
        ret

detect_dqk_natural_handler3:
        cmp     byte [secret_profile], 1
        je      .err
        cmp     word [gamep], game_dqk
        jne     .err
        cmp     word [eclid], 5
        jne     .err
        mov     byte [dqk_nat_ca], 0
        mov     byte [dqk_nat_cb], 0
        mov     byte [dqk_nat_cc], 0
        mov     ax, 3D00h
        mov     dx, [effectreadp]
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     dx, GBEF_RS_MAGIC_OFF
        call    read_effect_word_at
        jc      .close_err
        cmp     ax, 'GB'
        jne     .close_err
        mov     dx, GBEF_RS_MAGIC_OFF+2
        call    read_effect_word_at
        jc      .close_err
        cmp     ax, 'RS'
        jne     .close_err
        mov     dx, GBEF_RS_AREA_OFF
        call    read_effect_word_at
        jc      .close_err
        cmp     ax, 5
        jne     .close_err
        mov     dx, GBEF_RS_MEMCOUNT_OFF
        call    read_effect_word_at
        jc      .close_err
        cmp     ax, GBEF_MAXMEM
        ja      .close_err
        mov     [dqk_nat_memcount], ax
        mov     word [dqk_nat_index], 0
.scan:
        mov     ax, [dqk_nat_index]
        cmp     ax, [dqk_nat_memcount]
        jae     .scanned
        shl     ax, 1
        add     ax, GBEF_RS_KEYS_OFF
        mov     dx, ax
        call    read_effect_word_at
        jc      .close_err
        cmp     ax, 00CAh
        je      .read_ca
        cmp     ax, 00CBh
        je      .read_cb
        cmp     ax, 00CCh
        je      .read_cc
.next:
        inc     word [dqk_nat_index]
        jmp     .scan
.read_ca:
        call    read_dqk_nat_value
        jc      .close_err
        cmp     ax, 14
        jne     .next
        mov     byte [dqk_nat_ca], 1
        jmp     .next
.read_cb:
        call    read_dqk_nat_value
        jc      .close_err
        cmp     ax, 5
        jne     .next
        mov     byte [dqk_nat_cb], 1
        jmp     .next
.read_cc:
        call    read_dqk_nat_value
        jc      .close_err
        cmp     ax, 00E5h
        jne     .next
        mov     byte [dqk_nat_cc], 1
        jmp     .next
.scanned:
        cmp     byte [dqk_nat_ca], 0
        je      .close_err
        cmp     byte [dqk_nat_cb], 0
        je      .close_err
        cmp     byte [dqk_nat_cc], 0
        je      .close_err
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_err:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

read_dqk_nat_value:
        mov     ax, [dqk_nat_index]
        shl     ax, 1
        add     ax, GBEF_RS_VALS_OFF
        mov     dx, ax
        jmp     read_effect_word_at

read_effect_word_at:                    ; BX = open file handle, DX = byte offset, returns AX
        push    cx
        push    dx
        mov     ax, 4200h
        xor     cx, cx
        int     21h
        pop     dx
        pop     cx
        jc      .err
        mov     ah, 3Fh
        mov     cx, 2
        mov     dx, fxbuf
        int     21h
        jc      .err
        cmp     ax, 2
        jne     .err
        mov     ax, [fxbuf]
        clc
        ret
.err:
        stc
        ret

tail_begin:
        mov     word [taillen], 0
        mov     byte [tailerr], 0
        ret

; The CCCOMBAT tail was measured at 114 of the 127 bytes DOS allows before any
; icon argument (CoK area-1, full install), so a 17-byte " /I C:\_GBCP0.GBI"
; overflowed it and do_exec refused the whole exec.  ROUND 36 CORROBORATION,
; same CoK area-1 route but with this shortening in force: 109 bytes before the
; icon (114 minus the one byte each of the five toolpaths in that tail saves),
; and 125 of 127 with the icon appended -- so the plain route's live margin is
; 2, not the "margin 3" an earlier note published.  Both figures are from an
; instrumented build that prints taillen at .maybe_real_icon and at tail_finish.
; When the tool prefix is a
; bare drive root AND that drive's current directory is the root, "C:_GBCOMB.TRC"
; names exactly the same file as "C:\_GBCOMB.TRC" and costs one byte less.  Both
; conditions are checked at startup -- guessing either one would silently point a
; child at the wrong file.
probe_toolpath_short:
        mov     byte [toolpath_short], 0
        cmp     byte [toolprefix], 0
        je      .ret
        cmp     byte [toolprefix+1], ':'
        jne     .ret
        cmp     byte [toolprefix+2], '\'
        jne     .ret
        cmp     byte [toolprefix+3], 0
        jne     .ret
        mov     al, [toolprefix]
        and     al, 0DFh
        sub     al, 'A'
        jb      .ret
        cmp     al, 25
        ja      .ret
        inc     al
        mov     dl, al
        push    si
        mov     si, cwdbuf
        mov     byte [si], 0
        mov     ah, 47h
        int     21h
        pop     si
        jc      .ret
        cmp     byte [cwdbuf], 0
        jne     .ret
        mov     byte [toolpath_short], 1
.ret:
        ret

; SI -> ASCIIZ path; returns AX = the number of bytes tail_append_toolpath
; would emit for it.
toolpath_len:
        push    si
        xor     ax, ax
.loop:
        cmp     byte [si], 0
        je      .done
        inc     ax
        inc     si
        jmp     .loop
.done:
        pop     si
        cmp     byte [toolpath_short], 0
        je      .ret
        call    toolpath_is_root
        jc      .ret
        dec     ax
.ret:
        ret

; CF=0 when SI -> "X:\<something>" and the short form is safe for it.
toolpath_is_root:
        push ax                         ; toolpath_len retains its byte count
        cmp     byte [toolpath_short], 0
        je      .no
        cmp     byte [si], 0
        je      .no
        cmp     byte [si+1], ':'
        jne     .no
        cmp     byte [si+2], '\'
        jne     .no
        cmp     byte [si+3], 0
        je      .no
        ; Only this drive's root CWD was verified by probe_toolpath_short.
        ; A canonical source on another drive must remain absolute.
        mov al,[si]
        mov ah,[toolprefix]
        and ax,0dfdfh
        cmp al,ah
        jne .no
        pop ax
        clc
        ret
.no:
        pop ax
        stc
        ret

tail_append_toolpath:                    ; SI -> ASCIIZ tool sidecar path
        call    toolpath_is_root
        jc      tail_append_str
        push    si
        mov     al, [si]
        call    tail_append_char
        mov     al, ':'
        call    tail_append_char
        add     si, 3
        call    tail_append_str
        pop     si
        ret

tail_append_space:
        mov     al, ' '
        jmp     tail_append_char

tail_append_str:                         ; SI -> ASCIIZ
.loop:
        mov     al, [si]
        or      al, al
        jz      .done
        call    tail_append_char
        inc     si
        jmp     .loop
.done:
        ret

tail_append_char:
        push    di
        cmp     word [taillen], TAIL_MAX
        jb      .store
        mov     byte [tailerr], 1
        pop     di
        ret
.store:
        mov     di, tail+1
        add     di, [taillen]
        mov     [di], al
        inc     word [taillen]
        pop     di
        ret

tail_append_dec:                         ; AX unsigned
        push    ax
        push    bx
        push    dx
        push    di
        mov     di, numbuf+5
        mov     byte [di], 0
        mov     bx, 10
        cmp     ax, 0
        jne     .loop
        dec     di
        mov     byte [di], '0'
        jmp     .emit
.loop:
        xor     dx, dx
        div     bx
        add     dl, '0'
        dec     di
        mov     [di], dl
        cmp     ax, 0
        jne     .loop
.emit:
        mov     si, di
        call    tail_append_str
        pop     di
        pop     dx
        pop     bx
        pop     ax
        ret

tail_finish:
        mov     ax, [taillen]
        mov     [tail], al
        mov     di, tail+1
        add     di, ax
        mov     byte [di], 0Dh
        ret

STACKPAD equ 1024
shrink_mem:
        ; Round at assembly time: a near-64-KiB image plus STACKPAD can wrap
        ; a 16-bit byte count even though its DOS paragraph count fits BX.
        mov     bx, IMG_BASE_PARAS+IMG_PARAS
        mov     ah, 4Ah
        push    ds
        pop     es
        int     21h
        ret

; Run the current child and reject either an EXEC error or the child's nonzero
; DOS termination status.  Most native helpers have this exact contract; keep
; it in one routine so every caller cannot consume resident space repeating it.
do_exec_checked:
        call    do_exec
        jc      .return
        mov     ah, 4Dh
        int     21h
        ; NEG preserves the contract in CF: zero status clears it; any nonzero
        ; status sets it.  AL is not a result of this zero-success helper.
        neg     al
.return:
        ret

do_exec:
        cmp     byte [tailerr], 0
        jne     .tail_fail
        mov     ax, ds
        mov     word [epb+0], 0         ; inherit environment
        mov     word [epb+2], tail      ; command tail
        mov     [epb+4], ax
        mov     word [epb+6], 5Ch       ; default FCB #1
        mov     [epb+8], ax
        mov     word [epb+10], 6Ch      ; default FCB #2
        mov     [epb+12], ax
        mov     [save_sp], sp
        mov     [save_ss], ss
        push    ds
        pop     es
        mov     dx, [runpathp]
        mov     bx, epb
        mov     ax, 4B00h
        int     21h
        cli
        mov     ss, [cs:save_ss]
        mov     sp, [cs:save_sp]
        sti
        push    cs
        pop     ds
        push    cs
        pop     es
        mov     fs, [img_seg]           ; DOS gives no FS guarantee across EXEC
        ret                             ; CF preserved from INT 21h
.tail_fail:
        stc
        ret

; ============================================================================
;  Strings and state.
; ============================================================================
s_usage    db 'GBBOOT [/D] -- detect and boot a mounted Gold Box install',13,10
           db '  /D or /N: dry-run detection only (no EXEC)',13,10
           db '  /E: native ASM preview via CCECL/CCGEO/CCFP or CCCOMBAT',13,10
           db '  /X: with /E, snapshot CCFP/CCCOMBAT RAW frames and exit',13,10
           db '  /J: with /E, play/decode title art before a headless /X or /T exit',13,10
           db '  /T [n]: with /E, drive at most n headless forward-step yields (default 16)',13,10
           db '  /2 [ticks]: with /E, enter camp; optionally rest up to 2880 five-minute CoK ticks',13,10
           db '  /4: save CoK camp on headless exit; /5: restore GREYBOX.GBS camp',13,10
           db '  /6 member spell: CoK queue spell 1..107; spell 0 cancels pending',13,10
           db '  /0 a v: with /E, pass a sparse CCECL memory seed word pair',13,10
           db '  /1 n: with /E, run vmRun1 far-pointer dispatch for the supplied cell word',13,10
           db '  /3 n: with /E, run DQK far-pointer slot-3 event dispatch for the supplied cell word',13,10
           db '  /@ n: with /E, pass CCECL a direct ECL virtual-address entry probe',13,10
           db '  /A n: native preview area/map override',13,10
           db '  /B n: native ECL entry override for ECLn.DAX/GEOn.DAX or HLIB ECL.GLB/SCRIPT.GLB',13,10
           db '  /G n: graphics set: 0 auto, 1 DOS, 2 Amiga, 3 C64 (fallback is reported)',13,10
           db '  /R name class: with /E, create a native member; repeat up to six (class C/F/R/K/M/T)',13,10
           db '  /I item /F affect /U member affect /M move /K thief /S spell /V member spell /P count /H ranger /Z strength /L input /C menu /Y parlay /O enc /W who /Q dist:',13,10
           db '      pass decimal CCECL party/query/selection/distance seeds during /E',13,10
           db '      nonnumeric /C commands pass a tactical script to CCCOMBAT (G/W guard, F flee, P party-flee, A auto)',13,10
           db '  Run from the game directory, or run C:\GBBOOT while another drive is current.',13,10,0
s_nogame   db 'GBBOOT: no supported Gold Box boot layout detected in the current directory.',13,10
           db 'Expected DQK.EXE+DISK*\*.GLB/TLB, ECL.GLB+GEO.GLB or GEO.GLB, START.EXE+*.CFG, GAME.EXE+*.CFG/DAX, BUCK1/2/3.EXE, or CKIT.EXE+SCRIPT.GLB.',13,10,0
s_banner   db 'Greybox native boot',13,10,0
s_game     db 'game:   ',0
s_engine   db 'engine: ',0
s_graphics db 'graphics: ',0
s_graphics_arrow db ' -> ',0
s_graphics_lparen db ' (',0
s_graphics_rparen db ')',13,10,0
s_exec     db 'exec:   ',0
s_note     db 'note:   ',0
s_dry      db 'dry-run: not launching child executable',13,10,0
s_launch   db 'launching...',13,10,0
s_native_no_launch db 'native preview unavailable: not launching helper chain',13,10,0
s_execfail db 'GBBOOT: EXEC failed, DOS error ',0
s_noexecfail db 'GBBOOT: no original executable is present for this data-only profile; rerun with /E for the native ASM engine path.',13,10,0
s_nativefail db 'GBBOOT: native preview failed; gate ',0
s_scene_skip_art db 'GBBOOT: demo scene skipped (source art unavailable).',13,10,0
s_scene_skip_wall db 'GBBOOT: demo scene skipped (wall backing unavailable).',13,10,0
s_scene_skip_exec db 'GBBOOT: demo scene skipped (child tail/EXEC unavailable).',13,10,0
s_native   db 'native: ',0
s_ccgeo_prefix db 'CCGEO /B ',0
s_ccecl_prefix db 'CCECL ',0
s_entry    db ' entry ',0
s_ecl_arrow db ' -> CCGEO /B ',0
s_hlib_wall_prefix db 'CCHLIB W ',0
s_ccfp_tex_prefix db 'CCFP /T /A ',0
s_plus     db ' + ',0
s_native_no_geo db 'unavailable: no known GEO map for this profile',13,10,0
s_native_no_area db 'unavailable: requested native area/map is not present',13,10,0
s_native_no_ecl db 'unavailable: requested native ECL entry/archive is not present',13,10,0
s_native_only_exec db '(native /E only)',0
s_space_map db ' map ',0
s_crlf     db 13,10,0
s_title_choice db 13,10,'Greybox title: [P]lay  [D]emo: ',0
gfx_auto   db 'auto',0
gfx_dos    db 'DOS',0
gfx_amiga  db 'Amiga',0
gfx_c64    db 'C64',0
gfx_status_native db 'native renderer',0
gfx_status_missing db 'assets unavailable; DOS fallback',0
gfx_status_bridge db 'native resource bridge with DOS fallback',0
gfx_status_c64_scene db 'imported C64 scene bridge with DOS fallback',0
gfx_status_unsupported db 'decoder unavailable; DOS fallback',0

game_cok    db 'Champions of Krynn',0
game_dok    db 'Death Knights of Krynn',0
game_pool   db 'Pool of Radiance',0
game_curse  db 'Curse of the Azure Bonds',0
game_secret db 'Secret of the Silver Blades',0
game_gateway db 'Gateway to the Savage Frontier',0
game_nwn    db 'Neverwinter Nights (DOS/AOL)',0
game_treasures db 'Treasures of the Savage Frontier',0
game_pod    db 'Pools of Darkness',0
game_buck   db 'Buck Rogers: Countdown to Doomsday',0
game_matrix db 'Buck Rogers: Matrix Cubed',0
game_dqk    db 'Dark Queen / DQK-class HLIB build',0
game_gen1   db 'Generic Gold Box Gen1 DAX install',0
game_frua   db 'Forgotten Realms Unlimited Adventures-style HLIB install',0
game_hlib_data db 'Generic Gold Box HLIB/GLB data dump',0
; party_game depends on this label order (cok first, then every party title, gen1 last, frua after).
struc game_order_check
        times   game_dok - game_cok - 1 resb 0
        times   game_pool - game_dok - 1 resb 0
        times   game_curse - game_pool - 1 resb 0
        times   game_secret - game_curse - 1 resb 0
        times   game_gateway - game_secret - 1 resb 0
        times   game_nwn - game_gateway - 1 resb 0
        times   game_treasures - game_nwn - 1 resb 0
        times   game_pod - game_treasures - 1 resb 0
        times   game_buck - game_pod - 1 resb 0
        times   game_matrix - game_buck - 1 resb 0
        times   game_dqk - game_matrix - 1 resb 0
        times   game_gen1 - game_dqk - 1 resb 0
        times   game_frua - game_gen1 - 1 resb 0
        times   game_hlib_data - game_frua - 1 resb 0
endstruc

eng_dax_gen1 db 'Gen1 DOS DAX/Pascal family',0
eng_hlib     db 'Gen2 HLIB/TLB/GLB family',0

note_cok   db 'native engine slice can boot original CoK START.EXE; data path is DAX.',0
note_dok   db 'native engine slice can boot original DoK START.EXE; data path is DAX.',0
note_cok_data db 'data-only Champions of Krynn dump; no chainload executable, but native preview uses ECL1/GEO1.',0
note_dok_data db 'data-only Death Knights of Krynn dump; no chainload executable, but native preview uses ECL1/GEO1.',0
note_pool  db 'boots START.EXE using POOL.CFG marker; ruleset is plain AD&D 1e.',0
note_curse db 'boots START.EXE using CURSE.CFG marker; native preview uses verified ECL/GEO chapters when present.',0
note_curse_data db 'data-only Curse/CoAB dump; no chainload executable, but native preview uses verified ECL/GEO chapters.',0
note_secret db 'boots START.EXE using BLADES.CFG marker; Secret is the third Moonsea game.',0
note_gateway db 'boots GAME.EXE UseStart using GAME.CFG plus ZOUNDS.DAX markers; ruleset is AD&D 2e.',0
note_nwn   db 'boots GAME.EXE using GAME.CFG/GAME.OVR markers; native preview uses ECL0/GEO0.',0
note_nwn_data db 'data-only Neverwinter Nights DOS/AOL dump; no chainload executable, but native preview uses ECL0/GEO0.',0
note_treasures db 'boots GAME.EXE using TREASURE.CFG plus ZOUNDS.DAX markers.',0
note_pod   db 'boots GAME.EXE using POOL4.CFG plus GAME.OVR markers; VACE intro may be present.',0
note_buck  db 'boots BUCK1.EXE from the verified BUCK1/BUCK2/BUCK3 split executable set.',0
note_buck_data db 'data-only Buck Rogers Countdown dump; no chainload executable, but native preview uses available GEO/ECL archives.',0
note_matrix db 'boots START.EXE using MATRIX.CFG marker; Buck Rogers XXVc sequel.',0
note_dqk   db 'boots DQK.EXE with Sound Blaster defaults; also covers generated DQK-class builds.',0
note_dqk_data db 'data-only DQK HLIB; preview uses ECL.GLB/GEO.GLB.',0
note_broad_data db 'data-only broader Gen1 marker; no chainload executable, but native preview uses available GEO/ECL archives.',0
note_gen1  db 'fallback profile: START.EXE with at least one DAX archive.',0
note_gen1_data db 'data-only Gen1 DAX dump; no chainload executable, but native preview uses the first GEO archive.',0
note_frua  db 'FRUA: CKIT + DISK3 data detected.',0
note_hlib_data db 'data-only HLIB/GLB dump; no chainload executable, but native preview uses GEO.GLB and optional ECL.GLB.',0

f_start_exe  db 'START.EXE',0
f_game_exe   db 'GAME.EXE',0
f_dqk_exe    db 'DQK.EXE',0
f_ckit_exe   db 'CKIT.EXE',0
f_krynn_cfg  db 'KRYNN.CFG',0
f_dkk_cfg    db 'DKK.CFG',0
f_pool_cfg   db 'POOL.CFG',0
f_curse_cfg  db 'CURSE.CFG',0
f_blades_cfg db 'BLADES.CFG',0
f_treasure_cfg db 'TREASURE.CFG',0
f_pool4_cfg  db 'POOL4.CFG',0
f_game_cfg   db 'GAME.CFG',0
f_zounds_dax db 'ZOUNDS.DAX',0
f_game_ovr   db 'GAME.OVR',0
f_vace_exe   db 'VACE.EXE',0
f_buck1_exe  db 'BUCK1.EXE',0
f_buck2_exe  db 'BUCK2.EXE',0
f_buck3_exe  db 'BUCK3.EXE',0
f_matrix_cfg db 'MATRIX.CFG',0
f_ecl0_dax   db 'ECL0.DAX',0
f_ecl1_dax   db 'ECL1.DAX',0
f_ecl2_dax   db 'ECL2.DAX',0
f_ecl3_dax   db 'ECL3.DAX',0
f_ecl4_dax   db 'ECL4.DAX',0
f_ecl5_dax   db 'ECL5.DAX',0
f_ecl6_dax   db 'ECL6.DAX',0
f_ecl7_dax   db 'ECL7.DAX',0
f_ecl8_dax   db 'ECL8.DAX',0
f_geo0_dax   db 'GEO0.DAX',0
f_geo1_dax   db 'GEO1.DAX',0
f_geo2_dax   db 'GEO2.DAX',0
f_geo3_dax   db 'GEO3.DAX',0
f_geo4_dax   db 'GEO4.DAX',0
f_geo5_dax   db 'GEO5.DAX',0
f_geo6_dax   db 'GEO6.DAX',0
f_geo7_dax   db 'GEO7.DAX',0
f_geo8_dax   db 'GEO8.DAX',0
f_walldef1_dax db 'WALLDEF1.DAX',0
f_8x8d1_dax  db '8X8D1.DAX',0
f_8x8d1_daa  db '8X8D1.DAA',0
f_c64scene   db 'C64SCENE.GBI',0
f_disk2_8x8d1_daa db 'DISK2\8X8D1.DAA',0
f_cpic1_daa db 'CPIC1.DAA',0
f_disk2_cpic1_daa db 'DISK2\CPIC1.DAA',0
f_bigpic1_daa db 'BIGPIC1.DAA',0
f_disk2_bigpic1_daa db 'DISK2\BIGPIC1.DAA',0
f_bigpic1_dax db 'BIGPIC1.DAX',0
f_bigpic2_dax db 'BIGPIC2.DAX',0
f_pic2_dax db 'PIC2.DAX',0
f_pic4_dax db 'PIC4.DAX',0
f_head2_dax db 'HEAD2.DAX',0
f_body2_dax db 'BODY2.DAX',0
f_pic5_dax db 'PIC5.DAX',0
f_cpic1_dax db 'CPIC1.DAX',0
f_disk2_cpic1_dax db 'DISK2\CPIC1.DAX',0
f_walldef2_dax db 'WALLDEF2.DAX',0
f_8x8d2_dax  db '8X8D2.DAX',0
f_8x8d_boot_dax db '8X8D1.DAX',0
f_any_dax    db '*.DAX',0
f_disk3_ecl  db 'DISK3\ECL.GLB',0
f_disk3_geo  db 'DISK3\GEO.GLB',0
f_disk1_title_tlb db 'DISK1\TITLE.TLB',0
f_disk2_8x8db db 'DISK2\8X8DB.TLB',0
f_disk2_8x8dc db 'DISK2\8X8DC.TLB',0
f_8x8db_tlb db '8X8DB.TLB',0
f_8x8dc_tlb db '8X8DC.TLB',0
f_title_tlb db 'TITLE.TLB',0
f_ecl_glb    db 'ECL.GLB',0
f_geo_glb    db 'GEO.GLB',0
f_monxcha_dax db 'MON1CHA.DAX',0
f_mon0cha_dax db 'MON0CHA.DAX',0
f_moncha_dax db 'MONCHA.DAX',0
f_disk2_moncha db 'DISK2\MONCHA.GLB',0
f_moncha_glb db 'MONCHA.GLB',0
f_script_glb db 'SCRIPT.GLB',0
f_savgama_qsv db 'SAVGAMA.QSV',0
f_save_savgama_qsv db 'SAVE\SAVGAMA.QSV',0
f_cloud_savgama_qsv db 'CLOUD_~1\SAVE\SAVGAMA.QSV',0
f_savgame_qsv db 'SAVGAME.QSV',0
f_save_savgame_qsv db 'SAVE\SAVGAME.QSV',0
f_cloud_savgame_qsv db 'CLOUD_~1\SAVE\SAVGAME.QSV',0
f_save_chrdata_sav db 'SAVE\CHRDATA1.SAV',0
f_save_chrdata_gam db 'SAVE\CHRDATA1.GAM',0
f_save_chrdata_qch db 'SAVE\CHRDATA1.QCH',0
coksavepath db 'SAVE\CHRDATA1.SAV',0
f_cloud_chrdata_qch db 'CLOUD_~1\SAVE\CHRDATA1.QCH',0
f_cloud_chrdatb_qch db 'CLOUD_~1\SAVE\CHRDATB1.QCH',0
f_cloud_chrdatc_qch db 'CLOUD_~1\SAVE\CHRDATC1.QCH',0
f_cloud_chrdata_sav db 'CLOUD_~1\SAVE\CHRDATA1.SAV',0
f_cloud_chrdata_gam db 'CLOUD_~1\SAVE\CHRDATA1.GAM',0
f_save_chrdata_jnk db 'SAVE\CHRDATA1.JNK',0
f_save_chrdata_eff db 'SAVE\CHRDATA1.EFF',0
f_save_chrdata_stf db 'SAVE\CHRDATA1.STF',0
f_save_chrdata_sfx db 'SAVE\CHRDATA1.SFX',0
f_save_chrdata_wiz db 'SAVE\CHRDATA1.WIZ',0
f_cloud_chrdata_jnk db 'CLOUD_~1\SAVE\CHRDATA1.JNK',0
f_cloud_chrdata_eff db 'CLOUD_~1\SAVE\CHRDATA1.EFF',0
f_cloud_chrdata_stf db 'CLOUD_~1\SAVE\CHRDATA1.STF',0
f_cloud_chrdata_sfx db 'CLOUD_~1\SAVE\CHRDATA1.SFX',0
f_cloud_chrdata_wiz db 'CLOUD_~1\SAVE\CHRDATA1.WIZ',0
f_cloud_chrdatb_gam db 'CLOUD_~1\SAVE\CHRDATB1.GAM',0
f_cloud_chrdatb_jnk db 'CLOUD_~1\SAVE\CHRDATB1.JNK',0
f_cloud_chrdatb_eff db 'CLOUD_~1\SAVE\CHRDATB1.EFF',0
f_cloud_chrdatb_wiz db 'CLOUD_~1\SAVE\CHRDATB1.WIZ',0
f_cloud_chrdatc_gam db 'CLOUD_~1\SAVE\CHRDATC1.GAM',0
f_cloud_chrdatc_jnk db 'CLOUD_~1\SAVE\CHRDATC1.JNK',0
f_cloud_chrdatc_eff db 'CLOUD_~1\SAVE\CHRDATC1.EFF',0
f_cloud_chrdatc_wiz db 'CLOUD_~1\SAVE\CHRDATC1.WIZ',0

d_pool       db 'GAME\POOLRAD',0
d_curse      db 'GAME\CURSE',0
d_secret     db 'GAME\SECRET',0
d_darkness   db 'GAME\DARKNESS',0
d_gateway    db 'GAME\GATEWAY',0
d_treasure   db 'GAME\TREASURE',0
d_buck       db 'GAME\BUCK',0
d_matrix     db 'GAME\MATRIX',0
d_game       db 'GAME',0
n_game_start db 'GAME\START.EXE',0
n_game_krynn_cfg db 'GAME\KRYNN.CFG',0
n_game_dkk_cfg db 'GAME\DKK.CFG',0
n_game_pool_cfg db 'GAME\POOL.CFG',0
n_game_curse_cfg db 'GAME\CURSE.CFG',0
n_game_blades_cfg db 'GAME\BLADES.CFG',0
n_game_matrix_cfg db 'GAME\MATRIX.CFG',0
n_game_game_exe db 'GAME\GAME.EXE',0
n_game_game_cfg_root db 'GAME\GAME.CFG',0
n_game_treasure_cfg db 'GAME\TREASURE.CFG',0
n_game_pool4_cfg db 'GAME\POOL4.CFG',0
n_game_zounds db 'GAME\ZOUNDS.DAX',0
n_game_game_ovr db 'GAME\GAME.OVR',0
n_game_buck1_root db 'GAME\BUCK1.EXE',0
n_game_buck2_root db 'GAME\BUCK2.EXE',0
n_game_buck3_root db 'GAME\BUCK3.EXE',0
n_game_ecl1 db 'GAME\ECL1.DAX',0
n_game_geo1 db 'GAME\GEO1.DAX',0
n_game_geo_dax db 'GAME\GEO?.DAX',0
n_pool_cfg   db 'GAME\POOLRAD\POOL.CFG',0
n_pool_start db 'GAME\POOLRAD\START.EXE',0
n_pool_geo   db 'GAME\POOLRAD\GEO?.DAX',0
n_curse_cfg  db 'GAME\CURSE\CURSE.CFG',0
n_curse_start db 'GAME\CURSE\START.EXE',0
n_curse_geo  db 'GAME\CURSE\GEO?.DAX',0
n_blades_cfg db 'GAME\SECRET\BLADES.CFG',0
n_secret_start db 'GAME\SECRET\START.EXE',0
n_secret_geo db 'GAME\SECRET\GEO?.DAX',0
n_treasure_cfg db 'GAME\TREASURE\TREASURE.CFG',0
n_treasure_zounds db 'GAME\TREASURE\ZOUNDS.DAX',0
n_treasure_game db 'GAME\TREASURE\GAME.EXE',0
n_treasure_geo db 'GAME\TREASURE\GEO?.DAX',0
n_pool4_cfg  db 'GAME\DARKNESS\POOL4.CFG',0
n_pod_game   db 'GAME\DARKNESS\GAME.EXE',0
n_pod_geo    db 'GAME\DARKNESS\GEO?.DAX',0
n_game_cfg   db 'GAME\GATEWAY\GAME.CFG',0
n_gateway_zounds db 'GAME\GATEWAY\ZOUNDS.DAX',0
n_gateway_game db 'GAME\GATEWAY\GAME.EXE',0
n_gateway_geo db 'GAME\GATEWAY\GEO?.DAX',0
n_buck1_exe  db 'GAME\BUCK\BUCK1.EXE',0
n_buck2_exe  db 'GAME\BUCK\BUCK2.EXE',0
n_buck3_exe  db 'GAME\BUCK\BUCK3.EXE',0
n_matrix_cfg db 'GAME\MATRIX\MATRIX.CFG',0
n_matrix_start db 'GAME\MATRIX\START.EXE',0
n_matrix_geo db 'GAME\MATRIX\GEO?.DAX',0
n_game_dqk_exe db 'GAME\DQK.EXE',0
n_game_disk3_ecl db 'GAME\DISK3\ECL.GLB',0
n_game_disk3_geo db 'GAME\DISK3\GEO.GLB',0
n_game_ckit  db 'GAME\CKIT.EXE',0
n_game_script db 'GAME\SCRIPT.GLB',0
n_game_geo   db 'GAME\GEO.GLB',0
n_game_8x8d1_daa db 'GAME\8X8D1.DAA',0
n_game_cpic1_daa db 'GAME\CPIC1.DAA',0
n_game_cpic1_dax db 'GAME\CPIC1.DAX',0
n_game_bigpic1_daa db 'GAME\BIGPIC1.DAA',0

args_none db 0
args_dqk  db ' SB220 SI7 RB330',0
args_gateway db ' UseStart',0
s_ccgeo   db 'CCGEO.COM',0
s_ccfp    db 'CCFP.COM',0
s_ccecl   db 'CCECL.COM',0
s_ccflow  db 'CCFLOW.COM',0
s_ccbind  db 'CCBIND.COM',0
s_bind_write db '/N ',0
s_bind_verify db '/V ',0
s_ccefx   db 'CCEFX.COM',0
s_cchost  db 'CCHOST.COM',0
s_ccmenu  db 'CCMENU.COM',0
s_cchlib  db 'CCHLIB.COM',0
s_cccombat db 'CCCOMBAT.COM',0
s_ccdaa   db 'CCDAA.COM',0
s_ccgb    db 'CGB.COM',0
s_ccparty db 'CCPARTY.COM',0
s_ccinv db 'CCINV.COM',0
s_inventory db '_GBINV.BIN',0
s_inventory_stage db '_GBINV.NEW',0
s_inventory_core db '_GBICORE.BIN',0
f_title_dax db 'TITLE.DAX',0
s_wallbin db '_GBWALL.BIN',0
s_viewbin db '_GBVIEW.RAW',0
s_picturereplayview db '_GBPIC.RAW',0
s_titlebin db '_GBTITLE.RAW',0
s_effectbin db '_GBECL.BIN',0
s_effectwgr db '_GBECL.WGR',0
s_eventbin db '_GBEVT.BIN',0
s_seedbin db '_GBSEED.BIN',0
s_rosterbin db '_GBPARTY.GBP',0
s_sessionbin db '_GBSESS.GBS',0
s_musicbin db 'COKTITLE.GBM',0
s_dokmusicbin db 'DOKTITLE.GBM',0
s_dqkmusicbin db 'DQKTITLE.GBM',0
s_stepbin db '_GBSTEP.BIN',0
s_resumebin db '_GBRES.BIN',0
s_host_state db '_GBHOST.BIN',0
s_host_result db '_GBRESULT.BIN',0
s_arg_host_state db ' /H ',0
s_arg_host_damage db ' /D ',0
s_arg_host_npc db ' /N ',0
s_npc_full db 'GBBOOT: npc join deferred: party full (GBPR cap 8)',13,10,0
s_gbwbin db '_GBWSET.GBW',0
s_altgraphics db '_GBAMIGA.GBT',0
s_altgraphics2 db '_GBAMIG2.GBT',0
s_altimage db '_GBAMIGA.GBI',0
s_altscene db '_GBSCENE.GBI',0
s_picturereplay db '_GBPICS.BIN',0
s_combaticon db '_GBCP0.GBI',0
s_combbin db '_GBCOMB.TRC',0
s_combout db '_GBCOMB.OUT',0
s_combview db '_GBCOMB.RAW',0
s_combresult db '_GBCR.BIN',0
s_outcome_victory db 'victory',13,10
s_outcome_victory_len equ $-s_outcome_victory
s_arg_bridge db ' /B ',0
s_arg_cok_rng db ' /J',0
s_arg_secret_profile db ' /9 1',0
s_secret_profile db 'Combat source: Secret Amiga normal melee (/9 1)',13,10,0
s_bad_profile db 'GBBOOT: invalid combat source profile',13,10,0
s_bad_menu_input db 'GBBOOT: invalid numeric menu answer (0..65535)',13,10,0
secret_profile db 0
secret_profile_bad db 0
secret_party db 0
s_arg_secret_id db ' /ID4',0
s_arg_secret_party db ' /S',0
s_secret_sav db 'CHRDATA1.SAV',0
%include "secretbootparty.inc"
%include "secretcontinuation_boot.inc"
%include "secretstrength_boot.inc"
s_arg_crop_bridge db ' /C ',0
s_arg_autoplay db ' /A ',0
s_arg_overlay db '/O ',0
s_arg_walk db ' /W',0
s_arg_snapshot db ' /S ',0
s_arg_effect db ' /E ',0
s_arg_combat_keyboard db ' /K ',0
s_icon_tail_full db 'GBBOOT: combat icon omitted; DOS 127-byte command tail is full',13,10,0
s_arg_text_slot db ' /Z ',0
s_arg_resume db ' /R ',0
s_arg_textured db ' /T',0
s_arg_area db ' /A ',0
s_arg_wallset db ' W ',0
s_arg_firstgbw db ' /F ',0
s_arg_daa_tiles db ' /T ',0
s_arg_daa_block db ' /B ',0
s_arg_dax_block db ' /B ',0
s_arg_daa_image db ' /I ',0
s_arg_altgraphics db ' /U ',0
s_arg_altgraphics2 db ' /V ',0
s_arg_altimage db ' /I ',0
s_arg_altscene db ' /K ',0
s_arg_scene_overlay db ' /H 24 64',0
s_arg_scene_force db ' /O',0
s_arg_combat_icon db ' /I ',0
s_arg_combat_command db ' /C ',0
s_arg_combat_result db ' /R ',0
s_arg_combat_wall db ' /W ',0
s_arg_party db ' /P ',0
s_arg_dok_party db ' /G',0
s_arg_dqk_qsv_party db ' /Q',0
s_arg_party_menu db ' /M',0
s_arg_party_create db ' /C ',0
s_arg_party_id db ' /ID ',0
s_arg_session db ' /N ',0
s_arg_music db ' /M ',0
s_arg_dump db ' /D ',0
s_arg_step db ' /Y ',0
s_arg_search db ' /J ',0
s_arg_vmrun db ' /Q ',0
s_arg_handler3 db ' /3 ',0
s_arg_direct_entry db ' /@ ',0
s_arg_facing db ' /F ',0
s_arg_persist db ' /P ',0
s_arg_move_once db ' /M F',0
s_arg_camp_once db ' /M C',0
s_arg_precamp db ' /2 ',0
s_camp_menu db 13,10,'Camp',13,10,'X - Leave camp',13,10,0
s_rest_option db 'R - Rest eight hours',13,10,'S - Save camp',13,10,0
s_mem_option db 'M - Memorize spells',13,10,0
s_arg_seed_item db ' /I ',0
s_arg_seed_affect db ' /A ',0
s_arg_seed_member_affect db ' /U ',0
s_arg_seed_move db ' /M ',0
s_arg_seed_thief db ' /K ',0
s_arg_seed_spell db ' /S ',0
s_arg_seed_member_spell db ' /V ',0
s_arg_seed_file db ' /G ',0
s_arg_roster_file db ' /B ',0
s_arg_seed_count db ' /N ',0
s_arg_seed_ranger db ' /H ',0
s_arg_seed_strength db ' /Z ',0
s_arg_seed_input db ' /L ',0
s_arg_seed_menu db ' /C ',0
s_arg_interactive_menu db ' /!',0
s_arg_menu_select db ' /S ',0
s_arg_seed_parlay db ' /Y ',0
s_arg_seed_encounter db ' /O ',0
s_arg_seed_who db ' /W ',0
s_arg_seed_distance db ' /D ',0
geo_probe_table dw f_geo1_dax, f_geo2_dax, f_geo3_dax, f_geo4_dax
                dw f_geo5_dax, f_geo6_dax, f_geo7_dax, f_geo8_dax, 0
ecl_probe_table dw f_ecl1_dax, f_ecl2_dax, f_ecl3_dax, f_ecl4_dax
                dw f_ecl5_dax, f_ecl6_dax, f_ecl7_dax, f_ecl8_dax
krynn_ecl_table dw f_ecl1_dax, f_ecl2_dax, f_ecl3_dax
krynn_geo_table dw f_geo1_dax, f_geo2_dax, f_geo3_dax
krynn_entry_table dw 34, 48, 80
nwn_ecl_table dw f_ecl1_dax, f_ecl2_dax, f_ecl3_dax
nwn_geo_table dw f_geo1_dax, f_geo2_dax, f_geo3_dax
nwn_entry_table dw 10, 20, 30
curse_ecl_table dw f_ecl2_dax, f_ecl3_dax, f_ecl4_dax, f_ecl5_dax, f_ecl6_dax
curse_geo_table dw f_geo2_dax, f_geo3_dax, f_geo4_dax, f_geo5_dax, f_geo6_dax
curse_entry_table dw 1, 16, 32, 49, 64

dryrun    db 0
engineflag db 0
snapflag  db 0
introflag db 0
helpflag  db 0
area_override db 0
area_override_num dw 0
entry_override db 0
entry_override_num dw 0
graphics_requested db 0
graphics_amiga_available db 0
graphics_c64_available db 0
graphics_alt_ready db 0
graphics_alt_ready2 db 0
graphics_image_ready db 0
graphics_combat_dos db 0
graphics_scene_ready db 0
graphics_scene_paperdoll db 0
graphics_requestedp dw gfx_auto
graphics_activep dw gfx_dos
graphics_statusp dw gfx_status_native
graphics_daap dw 0
graphics_cpicp dw 0
graphics_bigpicp dw 0
graphics_setup_pic dw 0
graphics_picture_id dw 0
graphics_picture_locked db 0
scene_replay_force db 0
align 2
scene_source_mapid dw 0
scene_source_geop dw 0
scene_event_index dw 0
scene_picture_seen dw 0
scene_script_event_index dw 0
scene_script_event_selected dw 0
scene_text_event_selected dw 0
scene_replay_count dw 0
scene_replay_ids times 16 dw 0
scene_source_count dw 0
scene_source_ids times 16 dw 0
scene_source_events times 16 dw 0
picture_replay_header db 'GBPI'
                     dw 1
picture_replay_count dw 0
graphics_combat_count db 0
graphics_combat_groups dw 0
graphics_combat_group_idx dw 0
graphics_combat_ids times 8 dw 0
combat_cmd_valid db 0
combat_cmd times 32 db 0
seed_item_count db 0
seed_items dw PARTY_ITEM_MAX dup 0
seed_item_index dw 0
seed_affect_count db 0
seed_affects dw PARTY_AFFECT_MAX dup 0
seed_affect_index dw 0
seed_member_affect_count db 0
seed_member_affects dw PARTY_MEMBER_AFFECT_MAX * 2 dup 0 ; one-based member, affect
seed_member_affect_index dw 0
seed_move_count db 0
seed_move_explicit db 0
seed_moves dw PARTY_MOVE_MAX dup 0
seed_move_index dw 0
seed_thief_count db 0
seed_thief_explicit db 0
seed_thieves dw PARTY_THIEF_MAX dup 0
seed_thief_index dw 0
seed_thief_matrix_count db 0
seed_thief_matrix_reserved db 0
seed_thief_matrix times PARTY_THIEF_MAX * PARTY_THIEF_SKILL_COUNT db 0
seed_spell_count db 0
seed_spells dw PARTY_SPELL_MAX dup 0
seed_spell_index dw 0
seed_member_spell_count db 0
seed_member_spells dw PARTY_MEMBER_SPELL_MAX * 2 dup 0 ; spell, one-based member
seed_member_spell_index dw 0
seed_sidecar_valid db 0
seed_count_valid db 0
seed_count_explicit db 0
seed_count dw 0
seed_ranger_valid db 0
seed_ranger dw 0
seed_strength_valid db 0
seed_strength dw 0
seed_input_valid db 0
seed_input dw 0
seed_menu_valid db 0
seed_menu dw 0
menu_answer dw 0
menu_input_bad db 0
seed_parlay_valid db 0
seed_parlay dw 0
seed_encounter_valid db 0
seed_encounter dw 0
seed_who_valid db 0
seed_who dw 0
seed_distance_valid db 0
seed_distance dw 0
party_create_count db 0
party_create_index db 0
party_create_tmp_name times 16 db 0
party_create_names times PARTY_CREATE_MAX*16 db 0
party_create_classes times PARTY_CREATE_MAX db 0
auto_party_count dw 0
auto_roster_left dw 0
auto_roster_expected_len dw 0
auto_affect_type dw 0
seed_member_tmp dw 0
seedfh     dw 0
seedhdr db 'GBPS'
seed_version dw 1
seed_flags dw 0
seed_count_word dw 0
seed_ranger_word dw 0
seed_distance_word dw 0
seed_hdr_item_count db 0
seed_hdr_affect_count db 0
seed_hdr_member_affect_count db 0
seed_hdr_move_count db 0
seed_hdr_thief_count db 0
seed_hdr_spell_count db 0
seed_hdr_member_spell_count db 0
seed_hdr_reserved db 0
seed_memory_count db 0
seed_memory_reserved db 0
seed_memory_keys dw MEM_SEED_MAX dup 0
seed_memory_vals dw MEM_SEED_MAX dup 0
seed_owned_flags dw 0
seed_owned_matrix times 256 db 0
; Owner ordinal + exact nine-byte SFX node. Duplicate ids are significant.
TIMER_CAP equ 256
TIMER_STATE_LEN equ 12+TIMER_CAP*10
timer_state dw 0                    ; 0=legacy unknown durations, 1=canonical
timer_count dw 0
timer_sources times 8 db 0          ; 0=none, 1=SAVE, 2=CLOUD_~1/SAVE
timer_records times TIMER_CAP*10 db 0
timer_zero_ages times 16 db 0
timer_effect_output dw 0
s_ecl_timer_halt db 'ECL CLOCK stopped: unsupported effect expiry',13,10,0
timer_source db 0
timer_blocked db 0
s_timer_blocked db 'Rest stopped: unsupported effect expiry ',0
auto_save_slot dw 0
auto_path_digit_offset dw 12
auto_path_slot_limit dw 6
auto_fh    dw 0
dax_probe_id db 0
dax_probe_left dw 0
gbcr_count dw 0
gbcr_limit dw 0
gbcr_index dw 0
gbcr_hp   dw 0
gbcr_maxhp dw 0
gbcr_cond dw 0
gbcr_hp_byte db 0
cok_status_byte db 0
cok_status_off dw 0
gbcr_xp_share dw 0
gbcr_xp_cur dd 0
gbcr_xp_off dw 0
gbcr_magic times 4 db 0
gbcr_meta_flags dw 0
gbcr_entry_off dw 0
gbcr_roster_fh dw 0
gbcr_save_fh dw 0
gbcr_slot db 0
damage_event_count dw 0
damage_event_index dw 0
damage_event_off dw 0
damage_argc dw 0
damage_control dw 0
damage_count dw 0
damage_sides dw 0
damage_bonus dw 0
damage_value dw 0
damage_target_member dw 0
damage_roster_count dw 0
damage_roster_len dw 0
damage_hp_off dw 0
auto_move_value dw 0
auto_jnkbuf times 63 db 0
auto_savbuf times COK_CCH_THIEF_READ db 0
auto_effbuf times 9 db 0
auto_wizbuf equ fxbuf             ; save-spell import completes before effect reads
auto_qsvbuf times 32 db 0
gbcrbuf times GBCR_BUF_LEN db 0
texflag   db 0
hlibflag  db 0
texarea_ch db '1'
texarea_out db '1',0
monarea_ch db '1'
hlibwallp dw 0
hlibwall2p dw 0
hlibsetcur dw 0
hlibtailset dw 0
titlelibp dw 0
monp      dw 0
fxflags   dw 0
fxstatus  dw 0
fxchain   dw 0
execerr   dw 0
efxfh     dw 0
gamep     dw 0
enginep   dw 0
exep      dw 0
argsp     dw 0
notep     dw 0
geop      dw 0
mapid     dw 0
eclp      dw 0
eclid     dw 0
runpathp  dw 0
effectreadp dw 0
save_sp   dw 0
save_ss   dw 0
taillen   dw 0
tailerr   db 0
epb       times 14 db 0
tail      times TAIL_MAX+2 db 0
numbuf    times 6 db 0
toolprefix times 96 db 0
toolpath_short db 0
cwdbuf    times 68 db 0
child_geo times 112 db 0
child_fp  times 112 db 0
child_ecl times 112 db 0
child_efx times 112 db 0
child_host times 112 db 0
child_hlib times 112 db 0
child_combat times 112 db 0
child_daa times 112 db 0
child_gb  times 112 db 0
child_party times 112 db 0
child_inventory times 112 db 0
inventorypath times 112 db 0
inventorystagepath times 112 db 0
inventorycorepath times 112 db 0
learnrequestpath times 112 db 0
learnresponsepath times 112 db 0
inventory_active db 0
inventory_mode db 0
altgraphicspath times 112 db 0
altgraphicspath2 times 112 db 0
altimagepath times 112 db 0
altscenepath times 112 db 0
picturereplaypath times 112 db 0
picturereplayviewpath times 112 db 0
combaticonpath times 112 db 0
wallpath  times 112 db 0
viewpath  times 112 db 0
titlepath times 112 db 0
effectpath times 112 db 0
effectwallpath times 112 db 0
eventpath times 112 db 0
effectwritep dw 0
seedpath  times 112 db 0
rosterpath times 112 db 0
rosterhdr times 16 db 0
rosterbuf equ fxbuf               ; roster-derived seed helpers do not read effects
sessionpath times 112 db 0
musicpath times 112 db 0
dokmusicpath times 112 db 0
dqkmusicpath times 112 db 0
steppath times 112 db 0
intro_frame dw 0
step_event db 0
step_handler_mode db 0                    ; 0=none, 1=SearchLocation, 2=vmRun1, 3=slot3, 4=PreCampCheck
step_once db 0
camp_once db 0                      ; 1=request headless camp, 2=camp yielded
; Retail CoK DS:31B4 + id*16, ids 0..107; guarded against held START.EXE.
learn_levels db 0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,7,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,7,6,4,6,6,6,6,6,6,6,4,4,4,4,4,5,5,5,5,5,5,1,1,1,1,4,4,4,4,4,4,4,4,4,5,5,5,5,5,6,6,6,6,6,4,0,0,0,0,0,0,0
learn_state:
learn_active db 0
learn_phase db 0
learn_counts times 6 db 0
s_learn_done db 'Memorized spell: ',0
s_scribed_done db 'Scribed spell: ',0
s_learn_request db '_GBLEARN.INP',0
s_learn_response db '_GBLEARN.OUT',0
learn_request_mode db 0
learn_scroll_mask db 0
learn_planned db 0
inventory_dirty dw 0
s_learn_blocked db 'Rest stopped: invalid spell queue/inventory or learning I/O failure',13,10,0
rest_requested dw 0
rest_left dw 0
rest_elapsed dw 0
rest_credit dw 0
rest_enc_count dw 0
rest_period dw 0
rest_chance dw 0
rest_party_len dw 0
rest_interrupted db 0
rest_effect_pending db 0
rest_radices dw 10,10,6,24,30,12,256
s_rest_elapsed db 'Rest iterations: ',0
s_rest_end db 13,10,0
; GBCP v4 image. It is NOT emitted in this file: it lives in a separate
; segment (FS) allocated directly above the stack pad by shrink_mem (see
; IMG_BASE_PARAS), so it costs no resident .COM bytes. Offsets below are
; offsets inside that segment; every access carries an FS override.
; rest_party stays resident (DS) because pointer-heavy rest/memorize code
; addresses it; the file order header,pose,rest_fx,rest_party,owned,timers,
; learn is reproduced by checkpoint_read_image/write_image/crc.
; One pad byte follows rest_fx: the REST_FX_LEN+1 read overruns by one byte
; (formerly the first byte of rest_party, which is always reloaded).
checkpoint_header equ 0
checkpoint_pose equ 32
rest_fx equ 48
IMG_A_LEN equ 32+16+REST_FX_LEN
IMG_PAD equ rest_fx+REST_FX_LEN
checkpoint_owned_flags equ IMG_PAD+1
checkpoint_owned_matrix equ checkpoint_owned_flags+2
checkpoint_timers equ checkpoint_owned_matrix+256
checkpoint_learn equ checkpoint_timers+TIMER_STATE_LEN
IMG_SENTINEL equ checkpoint_learn+8        ; oversized-file read sentinel
IMG_SIZE equ IMG_SENTINEL+1
IMG_C_READ equ IMG_SIZE-checkpoint_owned_flags
IMG_PARAS equ (IMG_SIZE+15)/16
IMG_BASE_PARAS equ (prog_end-$$+100h+STACKPAD+15)/16
img_seg dw 0
rest_party times 2476 db 0
CHECKPOINT_V1_LEN equ 32+16+REST_FX_LEN+2476
CHECKPOINT_V2_LEN equ CHECKPOINT_V1_LEN+258
CHECKPOINT_V3_LEN equ CHECKPOINT_V2_LEN+TIMER_STATE_LEN
CHECKPOINT_LEN equ CHECKPOINT_V3_LEN+8
; Which run_native_preview gate was last entered.  Printed after s_nativefail
; so a "native preview failed" names the check that fired instead of pointing
; at all 33 of them at once.
;
; WHY THIS EXISTS.  run_native_preview has 33 distinct failure gates and every
; one of them funnelled into the single s_nativefail string.  On 2026-09-09 a
; DoK `/B 35` and `/B 36` preview failure survived TWO investigations without
; being localised, and the second one (native\ccecl-dok-combat-gap-test.ps1,
; the comment above its vmRun conf) stopped with "could not isolate further
; without instrumenting the assembly".  The gate that was firing turned out to
; be 11, apply_effect_damage_roster, rejecting a GBSX that declared more than
; the then-hardcoded GBEF_SCRIPT_EVENT_MAX=16 script events -- a one-line
; constant that f015c0e has since deleted in favour of GBEF_SCRIPT_CAP.  A
; single `gate 11` in the transcript would have named it on the first run.
;
; COST.  33 `mov byte [nfail_gate], n` sites plus the print: 64,601 -> 64,786
; bytes emitted, 64,857 -> 65,042 resident against the 65,280 .COM ceiling.
; If headroom ever has to be reclaimed, shorten s_nativefail's parenthetical
; (~68 bytes) before dropping gates -- a partial table is worse than none,
; because it reports the wrong gate rather than no gate.
;
; GATE TABLE (run_native_preview, in source order):
;    1 geop == 0 (no GEO archive selected)
;    2 run_cok_intro              3 choose_krynn_title_mode
;    4 run_cok_party              5 sync_cok_roster_count
;    6 collect_cok_owned_affects  7 write_seed_sidecar
;    8 CCECL exec / exit code    9 sync_ecl_timers
;   10 read_effect_header        11 apply_effect_damage_roster
;   12 mutation_bridge           13 CCCOMBAT exec / exit code
;   14 apply_combat_result_roster 15 sync_combat_rng
;   16 CCECL resume exec / exit  17 sync_ecl_timers (resume)
;   18 write_empty_combat_outcome 19 write_seed_sidecar (vmrun step)
;   20 accept_terminal_ecl_exit (reached only when the effect carried no GEO
;      and use_selected_geo_fallback declined; exact source-terminal routes
;      are accepted, otherwise on Gen1 this means "this ECL entry produced no
;      map", not a dispatch bug)
;   21 build_scene_wall_fallback 22 CCFP exec / exit code
;   23 read_step_yield (camp yield)
;   24 checkpoint_restore        25 sync_cok_roster_count (camp)
;   26 write_seed_sidecar (camp) 27 fxstatus != 0 at .camp_ready
;   28 mem_command               29 run_cok_rest
;   30 rest_effect_pending at .camp_done
;   31 checkpoint_store          32 read_step_yield (step yield)
;   33 prepare_dqk_step_host_state
;   34 build_menu_tail (menu child exec)
;   35 boot /R journal recovery (DoK)
nfail_gate db 0
checkpoint_len dw CHECKPOINT_LEN
checkpoint_save db 0
checkpoint_load db 0
checkpoint_old db 0
checkpoint_camp_active db 0
checkpoint_tool_root db 0
state_namespace db 0
state_prefix db '_GB'
state_prefix_table db 'COK','DOK','POL','CUR','SEC','GAT','TRE','POD','NWN','BUC','MAT','DQK','FRU'
s_checkpoint_file db 'GREYBOX.GBS',0
s_checkpoint_temp db 'GREYBOX.TMP',0
s_checkpoint_backup db 'GREYBOX.BAK',0
s_state_checkpoint_gbs db 'SAVE.GBS',0
s_state_checkpoint_tmp db 'SAVE.TMP',0
s_state_checkpoint_bak db 'SAVE.BAK',0
checkpoint_file db 'GREYBOX.GBS',0
                times 100 db 0
checkpoint_temp db 'GREYBOX.TMP',0
                times 100 db 0
checkpoint_backup db 'GREYBOX.BAK',0
                times 100 db 0
s_checkpoint_saved db 'Camp saved to GREYBOX.GBS',13,10,0
s_checkpoint_loaded db 'Camp restored from GREYBOX.GBS',13,10,0
s_checkpoint_failed db 'Camp save failed',13,10,0
demoflag db 0
title_wait_tick dw 0
step_skip_persist db 0
step_budget dw 0
dqk_nat_memcount dw 0
dqk_nat_index dw 0
dqk_nat_ca db 0
dqk_nat_cb db 0
dqk_nat_cc db 0
handler3_valid db 0
handler3_pending db 0
handler3_descriptor dw 0
handler1_valid db 0
handler1_descriptor dw 0
direct_entry_valid db 0
direct_entry_vaddr dw 0
effect_state_valid db 0
interactive_menu db 0
step_descriptor dw 0
step_cell_word dw 0
step_facing dw 0
step_x dw 0
step_y dw 0
stepbuf times 14 db 0
resumepath times 112 db 0
gbwpath   times 112 db 0
combatpath times 112 db 0
outcomepath times 112 db 0
combatviewpath times 112 db 0
combatresultpath times 112 db 0
host_effect_mode dw 0
hostbuf times 12 db 0
fxbuf     times GBEF_SCRIPT_TOTAL_BYTES db 0
%include "cokhost.inc"


; Exact v16 header admission without growing the shared graphics FX bank.
boot_validate_v16:
        cmp byte [secret_profile],1
        jne .bad
        mov bx,[efxfh]
        xor cx,cx
        xor dx,dx
        mov ax,4202h
        int 21h
        jc .bad
        test dx,dx
        jnz .bad
        cmp ax,5948
        jne .bad
        mov dx,116
        mov cx,6
        mov di,boot_v16_rs
        call boot_read_at
        jc .bad
        cmp dword [boot_v16_rs],'GBRS'
        jne .bad
        mov ax,[boot_v16_rs+4]
        and ax,0fffeh
        cmp ax,12
        jne .bad
        mov ax,[fxbuf+8]
        cmp ax,3
        ja .bad
        cmp ax,2
        je .resume
        cmp ax,3
        jne .suffix
.resume:
        test word [boot_v16_rs+4],1
        jz .bad
.suffix:
        mov dx,5774
        mov cx,12
        mov di,boot_v16_state
        call boot_read_at
        jc .bad
        mov dx,5920
        mov cx,28
        mov di,boot_v16_state+12
        call boot_read_at
        jc .bad
        cmp dword [boot_v16_state],'GBMS'
        jne .bad
        cmp dword [boot_v16_state+12],'GBRF'
        jne .bad
        cmp word [boot_v16_state+22],0
        jne .bad
        mov si,boot_v16_state+16
        mov cx,6
.flags:
        cmp byte [si],1
        ja .bad
        inc si
        loop .flags
        cmp dword [boot_v16_state+24],'GBSI'
        jne .bad
        cmp dword [boot_v16_state+28],00100001h
        jne .bad
        cmp word [boot_v16_state+38],0
        jne .bad
        mov ax,[boot_v16_state+32]
        cmp ax,2
        ja .bad
        cmp ax,[boot_v16_state+10]
        jne .bad
        mov dx,[boot_v16_state+34]
        cmp dx,[boot_v16_state+8]
        jne .bad
        mov cx,[boot_v16_state+36]
        cmp cx,6
        ja .bad
        cmp byte [secret_party],1
        jne .actor
        cmp byte [seed_count_valid],1
        jne .bad
        cmp cx,[seed_count]
        jne .bad
.actor:
        cmp ax,1
        jne .null
        cmp dx,1
        jb .bad
        cmp dx,cx
        ja .bad
        jmp .ok
.null: test dx,dx
        jnz .bad
.ok: clc
        ret
.bad: stc
        ret

; Open efxfh: exact fixed offset read, preserving caller's expected count.
boot_read_at:
        push cx
        push di
        mov bx,[efxfh]
        xor cx,cx
        mov ax,4200h
        int 21h
        pop di
        pop cx
        jc .bad
        mov dx,di
        mov bx,[efxfh]
        mov ah,3fh
        int 21h
        jc .bad
        cmp ax,cx
        jne .bad
        clc
        ret
.bad: stc
        ret

boot_v16_rs times 6 db 0
boot_v16_state times 40 db 0


; Read-only Secret names capability from the current owned P1, including /Z.
secret_names_refresh:
        mov byte [secret_names_valid],0
        cmp byte [secret_profile],1
        jne .ok
        cmp byte [secret_party],1
        jne .ok
        cmp byte [seed_count_valid],1
        jne .bad
        cld
        push ds
        pop es
        mov dx,rosterpath
        mov ax,3d00h
        int 21h
        jc .bad
        mov [efxfh],ax
        mov dx,0
        mov cx,16
        mov di,secret_names_data
        call boot_read_at
        jc .close_bad
        cmp dword [secret_names_data],'GBPR'
        jne .close_bad
        cmp word [secret_names_data+4],3
        jne .close_bad
        cmp dword [secret_names_data+8],000201b8h
        jne .close_bad
        cmp dword [secret_names_data+12],00010004h
        jne .close_bad
        mov ax,[secret_names_data+6]
        cmp ax,[seed_count]
        jne .close_bad
        cmp ax,1
        jb .close_bad
        cmp ax,6
        ja .close_bad
        mov [secret_names_count],ax
        mov bx,[efxfh]
        xor cx,cx
        xor dx,dx
        mov ax,4202h
        int 21h
        jc .close_bad
        test dx,dx
        jnz .close_bad
        cmp ax,32768
        ja .close_bad
        mov [secret_names_extent],ax
        mov di,secret_names_expected
        xor ax,ax
        mov cx,48
        rep stosw
        mov word [secret_names_index],0
.row:
        mov ax,[secret_names_index]
        imul ax,ax,440
        add ax,17
        mov dx,ax
        mov cx,16
        mov di,secret_names_pascal
        call boot_read_at
        jc .close_bad
        movzx cx,byte [secret_names_pascal]
        cmp cx,1
        jb .close_bad
        cmp cx,15
        ja .close_bad
        mov si,secret_names_pascal+1
        mov di,[secret_names_index]
        shl di,4
        add di,secret_names_expected
        mov al,cl
        stosb                     ; canonical Pascal length byte belongs to GBWN
.name:
        lodsb
        cmp al,32
        jb .close_bad
        cmp al,126
        ja .close_bad
        stosb
        loop .name
        inc word [secret_names_index]
        mov ax,[secret_names_index]
        cmp ax,[secret_names_count]
        jb .row
        mov bx,[efxfh]
        mov ah,3eh
        int 21h
        jc .bad
        mov di,secret_names_reply
        mov si,secret_names_reply_name
        call compose_tool_path
        mov si,secret_names_reply
        mov di,secret_names_reply
        call sn_canonical
        jc .bad
        mov word [secret_names_index],0
.protected:
        mov bx,[secret_names_index]
        mov si,[secret_names_paths+bx]
        test si,si
        jz .source
        cmp byte [si],0
        je .next_path
        mov di,secret_names_temp
        call sn_canonical
        jc .bad
        mov si,secret_names_temp
        mov di,secret_names_reply
        mov cx,112
        repe cmpsb
        je .bad
.next_path:
        add word [secret_names_index],2
        jmp .protected
.source:
        mov si,[eclp]
        test si,si
        jz .clear
        cmp byte [si],0
        je .clear
        mov di,secret_names_temp
        call sn_canonical
        jc .bad
        mov si,secret_names_temp
        mov di,secret_names_reply
        mov cx,112
        repe cmpsb
        je .bad
.clear:
        mov dx,secret_names_reply
        mov ah,41h
        int 21h
        jnc .query
        cmp ax,2
        jne .bad
.query:
        call tail_begin
        mov si,secret_names_option
        call tail_append_str
        mov si,rosterpath
        call tail_append_str
        call tail_append_space
        mov si,secret_names_reply
        call tail_append_toolpath
        call tail_finish
        mov word [runpathp],child_party
        call do_exec_checked
        jc .bad
        mov dx,secret_names_reply
        mov ax,3d00h
        int 21h
        jc .bad
        mov [efxfh],ax
        mov bx,ax
        xor cx,cx
        xor dx,dx
        mov ax,4202h
        int 21h
        jc .close_bad
        test dx,dx
        jnz .close_bad
        mov cx,[secret_names_count]
        imul cx,cx,30
        add cx,32
        cmp ax,cx
        jne .close_bad
        mov dx,0
        mov di,secret_names_data
        call boot_read_at
        jc .close_bad
        mov bx,[efxfh]
        mov ah,3eh
        int 21h
        jc .bad
        cmp dword [secret_names_data],'GBWN'
        jne .bad
        cmp word [secret_names_data+4],3
        jne .bad
        mov ax,[secret_names_count]
        cmp ax,[secret_names_data+8]
        jne .bad
        imul ax,ax,30
        add ax,32
        cmp ax,[secret_names_data+6]
        jne .bad
        cmp word [secret_names_data+10],4
        jne .bad
        mov ax,[secret_names_extent]
        cmp ax,[secret_names_data+12]
        jne .bad
        cmp word [secret_names_data+14],0
        jne .bad
        mov si,secret_names_data+16
        mov di,secret_names_expected
        mov cx,[secret_names_count]
        shl cx,4
        repe cmpsb
        jne .bad
        ; SI follows the matched canonical names into the closed field suffix.
        cmp dword [si],'GBSF'
        jne .bad
        cmp word [si+4],2
        jne .bad
        mov ax,[secret_names_count]
        cmp ax,[si+8]
        jne .bad
        imul ax,ax,14
        add ax,16
        cmp ax,[si+6]
        jne .bad
        cmp word [si+10],7
        jne .bad
        cmp dword [si+12],0
        jne .bad
        add si,16
        mov bx,[secret_names_count]
.field_row:
        mov cx,3
.unsigned:
        cmp word [si],255
        ja .bad
        add si,2
        loop .unsigned
        mov cx,2
.signed:
        lodsw
        mov dx,ax
        cbw
        cmp ax,dx
        jne .bad
        loop .signed
        mov cx,2
.last_unsigned:
        cmp word [si],255
        ja .bad
        add si,2
        loop .last_unsigned
        dec bx
        jnz .field_row
        mov byte [secret_names_valid],1
.ok: clc
        ret
.close_bad:
        mov bx,[efxfh]
        mov ah,3eh
        int 21h
.bad: stc
        ret

secret_names_valid db 0
secret_names_count dw 0
secret_names_extent dw 0
secret_names_index dw 0
secret_names_data times 212 db 0
secret_names_expected times 96 db 0
secret_names_pascal times 16 db 0
secret_names_reply times 112 db 0
secret_names_temp times 112 db 0
secret_names_reply_name db '_GBWHO.GWN',0
secret_names_option db ' /W ',0
secret_names_paths dw rosterpath,effectpath,eventpath,resumepath,outcomepath,seedpath,combatresultpath,0


; Compact only the six frozen Secret scalar switches. Generic tails unchanged.
tail_append_scalar:
        cmp byte [secret_profile],1
        jne tail_append_str
.loop:
        lodsb
        test al,al
        jz .done
        cmp al,' '
        jne .emit
        cmp byte [si],0
        je .done
.emit:
        call tail_append_char
        jmp .loop
.done: ret


; Fresh Secret uses the exact source directory as read-only child CWD. The
; canonical caller source stays intact and is restored before CCBIND/context.
secret_source_enter:
        mov byte [secret_source_owned],0
        cmp byte [secret_profile],1
        jne .ok
        mov ax,[eclp]
        mov [secret_source_original],ax
        mov si,ax
        mov di,sn_descriptor+64
        call sn_canonical
        jc .bad
        mov si,sn_descriptor+64
        mov di,si
.scan:
        lodsb
        test al,al
        jz .last
        cmp al,05ch
        jne .scan
        mov di,si
        jmp .scan
.last:
        cmp di,sn_descriptor+67
        jb .bad
        mov [secret_source_name],di
        mov al,[di-1]
        mov [secret_source_separator],al
        mov ah,19h
        int 21h
        mov [secret_source_previous_drive],al
        mov word [secret_source_previous_cwd+1],05c3ah
        mov al,[sn_descriptor+64]
        mov [secret_source_previous_cwd],al
        sub al,'A'
        mov [secret_source_drive],al
        mov dl,al
        inc dl
        mov si,secret_source_previous_cwd+3
        mov ah,47h
        int 21h
        jc .bad
        mov byte [secret_source_owned],1
        mov di,[secret_source_name]
        cmp di,sn_descriptor+67
        je .root_directory
        mov byte [di-1],0
        jmp .directory
.root_directory:
        mov byte [di],0             ; retain X:\ for a root source
.directory:
        mov dx,sn_descriptor+64
        mov ah,3bh
        int 21h
        pushf
        mov di,[secret_source_name]
        cmp di,sn_descriptor+67
        jne .restore_separator
        ; Root directory truncation was at first filename byte.
        mov al,[sn_canon+3]
        mov [di],al
        jmp .directory_result
.restore_separator:
        mov al,[secret_source_separator]
        mov [di-1],al
.directory_result:
        popf
        jc .restore_bad
        mov dl,[secret_source_drive]
        mov ah,0eh
        int 21h
        mov ax,[secret_source_name]
        mov [eclp],ax
.ok: clc
        ret
.restore_bad:
        call secret_source_leave
.bad: stc
        ret

secret_source_leave:
        cmp byte [secret_source_owned],1
        jne .ok
        mov ax,[secret_source_original]
        mov [eclp],ax
        mov dx,secret_source_previous_cwd
        mov ah,3bh
        int 21h
        pushf
        mov dl,[secret_source_previous_drive]
        mov ah,0eh
        int 21h
        popf
        jc .bad
        mov byte [secret_source_owned],0
.ok: clc
        ret
.bad: stc
        ret
secret_source_owned db 0
secret_source_original dw 0
secret_source_name dw 0
secret_source_separator db 0
secret_source_previous_drive db 0
secret_source_drive db 0
secret_source_previous_cwd times 68 db 0

        times 512 db 0
stacktop:
prog_end:
