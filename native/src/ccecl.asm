; ============================================================================
;  CCECL.COM  --  Clean-room x86 ECL bytecode interpreter (Tier-1 subset).
;
;  Interprets a DECOMPRESSED Krynn ECL block -- either dialect -- well enough to
;  walk real event/dialogue/combat-trigger scripts, and (with /T) emits a
;  deterministic EXECUTION TRACE to CCECL.TRC for oracle verification against the
;  project's VERIFIED TypeScript VM (packages/engine/src/ecl/vm.ts). With /E it
;  also emits a compact machine-readable effect record for GBBOOT's native
;  CCGEO->CCFP bridge.
;
;  Input forms, auto-detected by sniffing the file's first bytes (see
;  sniff_dialect):
;
;    CCECL <block.bin> [/T] [/E [out]] [/R <state.gbef> <outcome>]
;                       [/B party.gbpr] [/I item]... [/A affect]... [/U member affect]... [/M move]... [/K thief]... [/S spell]... [/V member spell]...
;                       [/N partyCount] [/H hasRanger] [/L inputValue] [/C menuChoice]
;                       [/Y parlayChoice] [/O encounterAction] [/W whoChoice]
;                                      Gen1 (CoK/DoK): a raw decompressed ECL
;                                       block, INCLUDING the 22-byte header
;                                       (2-byte 0x1388 magic + five far
;                                       pointers). Execution starts at byte 22
;                                       (vaddr 0x8014); vbase = 0x7FFE. Produce
;                                       the .BIN with the throwaway exporter (a
;                                       vitest mirror of test/firstperson-
;                                       integration.test.ts). The .BIN is
;                                       copyrighted derived data -- do NOT
;                                       commit it.
;
;    CCECL <file.dax> <blockId> [/T] [/E [out]] [/R <state.gbef> <outcome>]
;                         [/B party.gbpr] [/I item]... [/A affect]... [/U member affect]... [/M move]... [/K thief]... [/S spell]... [/V member spell]...
;                         [/N partyCount] [/H hasRanger] [/L inputValue] [/C menuChoice]
;                         [/Y parlayChoice] [/O encounterAction] [/W whoChoice]
;                                      Gen1 DAX archive form: locate raw DAX
;                                      block id <blockId>, signed-byte-RLE
;                                      decompress it into the same raw-block
;                                      buffer, then run the Gen1 dialect.
;
;    CCECL <file.glb> <areaId> [/T] [/E [out]] [/R <state.gbef> <outcome>]
;                         [/B party.gbpr] [/I item]... [/A affect]... [/U member affect]... [/M move]... [/K thief]... [/S spell]... [/V member spell]...
;                         [/N partyCount] [/H hasRanger] [/L inputValue] [/C menuChoice]
;                         [/Y parlayChoice] [/O encounterAction] [/W whoChoice]
;                                      Gen2 (DQK): a whole ECL.GLB container --
;                                       an HLIB "DATA" library (magic "HLIB" at
;                                       byte 0), the SAME flat-member layout
;                                       CCHLIB/CCGEO already speak for
;                                       GEO.GLB/MONCHA.GLB. member[0] is an id
;                                       table (packages/engine/src/loaders/
;                                       eclGlb.ts): uint16 count, then count *
;                                       {uint16 areaId, uint16 memberIndex}
;                                       (LE). CCECL resolves <areaId> through
;                                       that table, loads the matching
;                                       member's raw bytes exactly like the
;                                       Gen1 form loads a whole file, and runs
;                                       it under the GEN2 header dialect:
;                                       20-byte header (the SAME five far
;                                       pointers, NO 0x1388 magic), execution
;                                       starts at byte 20 (vaddr 0x8014),
;                                       vbase = 0x8000. See ECL_GEN2 in
;                                       packages/engine/src/ecl/disassemble.ts
;                                       (the authoritative dialect definition
;                                       this mirrors).
;
;  Gen1 and Gen2 share the SAME opcode core, dispatch table, operand framing,
;  and 6-bit string packing -- the container + block header differ (see
;  docs/engine/research/decompile-dqk-ecl-dispatch.md: "Gen2 preserves the core
;  opcode numbering" 0x00-0x40; any extended opcode above that is a documented
;  research gap with no confirmed operand framing). One semantic operand
;  convention differs in real DQK scripts: low raw CALL words 0001/0002 are
;  direct routine ids. So vm_run/exec_one below are shared between dialects;
;  [hdrlen]/[vbaseval] and op_call's low-word id branch use the detected dialect.
;
;  Trace format (one line per executed instruction, fully deterministic):
;     PC=NNNN OP=XX                       (no memory write)
;     PC=NNNN OP=XX MEM[AAAA]=VVVV         (one memory cell changed)
;  PC is the byte offset of the opcode within the block (matches the TS
;  programCounter); OP is the opcode byte; addr/value are 16-bit hex. The TS
;  oracle (a throwaway vitest mirror) emits the same lines; diff must be 0.
;
;  Opcode subset (the block-34 entry path exercises COMPARE/IF_EQ/SAVE/LOAD_FILES/
;  LOAD_PIECES/GOSUB/EXIT; the rest are implemented for control-flow robustness):
;     00 EXIT      01 GOTO     02 GOSUB    03 COMPARE   04 ADD     05 SUBTRACT
;     06 DIVIDE    07 MULTIPLY 08 RANDOM   09 SAVE      0B LOAD_MONSTER
;     0F INPUT_NUMBER 10 INPUT_STRING 13 RETURN    14 COMPARE_AND
;     15 VERTICAL_MENU 16..1B IF_EQ..IF_GE 1C CLEAR_MONSTERS
;     1D PARTYSTRENGTH 1E CHECKPARTY 20 NEWECL 21 LOAD_FILES 22 PARTY_SURPRISE
;     23 SURPRISE  24 COMBAT   25 ON_GOTO  26 ON_GOSUB 27 TREASURE 28 ROB
;     29 ENCOUNTER_MENU 2A GETTABLE 2B HORIZONTAL_MENU 2C PARLAY 2D CALL
;     2E DAMAGE    2F AND      30 OR       31 SHORT_MENU 32 FIND_ITEM 34 ECL_CLOCK
;     35 SAVE_TABLE 36 ADD_NPC 37 LOAD_PIECES 38 PROGRAM 39 WHO 3B SPELL
;     3C PROTECTION 3E DUMP 3F FIND_SPECIAL 40 DESTROY_ITEMS
;  Visual/host-owned effects that are not native-owned yet are preserved in
;  GBSX; known no-op/control opcodes are consumed deterministically. Buck
;  Countdown opcodes 0x42/0x4B/0x4C are currently observed only as zero-operand
;  host/state transitions and are preserved that way. Buck 0x43/0x45/0x46 are
;  only framed as host/script effects with observed operand counts 1/2/2; they
;  do not infer combat or mutate native state yet. Other opcode bytes ABOVE
;  0x40 are undocumented (Gen2 extended range, research gap -- no confirmed
;  operand framing exists to skip them safely) and are treated exactly like the
;  TS oracle's `decodeInstructionAt` "badOpcode" case: the VM halts WITHOUT
;  emitting a trace line for them (no instruction was actually decoded).
;
;  Memory model: a flat sparse 16-bit address space, modelled as a small assoc
;  array (addr,val) with linear lookup/insert -- the path touches few cells.
;  If a synthetic or future script exhausts the fixed resume/effect capacity,
;  CCECL halts deterministically instead of silently dropping a write.
;  Same dispatch as the TS VM; SUBTRACT is op2-op1; arithmetic dest = arg2.
;  RANDOM uses the same deterministic LCG seed as the TS oracle. PARTYSTRENGTH
;  uses the TS default host metric (0), or a host-supplied /Z strength seed.
;  Host-input opcodes use the headless boot responder: INPUT_* write 0 by
;  default or the /L value, VERTICAL/HORIZONTAL_MENU write
;  0 by default or the zero-based /C choice, PARLAY chooses attitude 0 by
;  default or the zero-based /Y choice, ENCOUNTER_MENU chooses action slot 0
;  (COMBAT) by default or the zero-based /O action slot. Gen1 WHO writes 0 by
;  default or the zero-based /W choice; Gen2 WHO selects that GBPR member
;  without writing its inline-prompt length to ECL memory. Under /!, both
;  dialects yield their bounded GBPR roster names through CCMENU. Buck
;  Countdown ECL2 block 50 has one
;  observed 15-operand ENCOUNTER_MENU at offset 0x048E; the normal shared shape
;  remains 14 operands.
;  Optional decimal party seed switches let tests/hosts provide the first native
;  party-query inputs before a full save/roster loader exists:
;    /I item      repeatable carried item types for FIND_ITEM/DESTROY_ITEMS
;    /A affect    repeatable party-wide affects for CHECKPARTY/FIND_SPECIAL fallback
;    /U mem aff   repeatable one-based member affect for LOAD_CHARACTER+FIND_SPECIAL
;    /M move      repeatable movement bytes for CHECKPARTY min/max/avg
;    /K thief     repeatable thief-skill bytes for CHECKPARTY min/max/avg
;    /S spell     repeatable spell ids at party member 0 slots for SPELL
;    /V mem spell repeatable one-based member spell for SPELL
;    /N count     party member count used by LOAD_CHARACTER bounds
;    /H n         nonzero means PARTY_SURPRISE sees a ranger present
;    /Z n         PARTYSTRENGTH host metric
;    /L n         headless INPUT_NUMBER/INPUT_STRING response value
;    /C n         zero-based headless VERTICAL/HORIZONTAL_MENU response
;    /Y n         zero-based headless PARLAY attitude response
;    /O n         zero-based headless ENCOUNTER_MENU action slot
;    /W n         zero-based headless WHO response
;    /D distance  encounter distance seed for SETUP_MONSTER/APPROACH
;    /F facing    handler facing ordinal (0=N,1=E,2=S,3=W); Gen1 maps this
;                 to [0xC04E]=0/2/4/6, Gen2 seeds [0x0011] directly
;    /J cellWord  run SearchLocation and seed the GEO/cell descriptor
;    /Q cellWord  run vmRun1 and seed the GEO/cell descriptor
;    /@ vaddr     direct-entry probe at an ECL virtual address
;    /2 cellWord  run far-pointer slot 2 (PreCampCheck) for event probes
;    /3 cellWord  run far-pointer slot 3 (CampInterrupted) for event probes
;    /X addr val   repeatable sparse-memory seed for native handler probes
;    /B party.gbpr import verified GBPR roster count, CoK thief rows, DoK movement
;  LOAD_PIECES resolves the COAB CMD_LoadFiles 0x7F / two-set dispatch (it has
;  no MEM effect so it emits no MEM= in the trace, matching the oracle).
;
;  /E writes CCECL.EFX by default, or the optional [out] path if supplied. The
;  binary record starts with "GBEF"; v9 keeps the original v2/v3/v4/v5/v6/v7/v8 prefix intact,
;  appends continuation state for /R, and ends with a bounded "GBSX" script-
;  effect tail plus append-only "GBES" encounter-setup and "GBHD" halt-diagnostic
;  tails plus "GBCL" clock slots. /R resumes from a prior v3+ COMBAT yield
;  after the host writes an outcome token/file ("party", "enemy", "draw",
;  "victory", "defeat", or "flee").
;
;  Build:  build.ps1 -Target ccecl   (nasm -f bin src/ccecl.asm -o build/ccecl.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

GEN1_HEADER_LEN equ 22           ; Gen1 (CoK/DoK DAX): magic + five far pointers
GEN1_VBASE      equ 0x7ffe       ; Gen1 vaddr = GEN1_VBASE + byte_offset (entry byte22->0x8014)
POOL_GEN1_VBASE equ 0x98fe       ; retail Pool addend 0x6700 -> file offset = vaddr - 0x98fe
GEN2_HEADER_LEN equ 20           ; Gen2 (DQK ECL.GLB): five far pointers, NO magic word
GEN2_VBASE      equ 0x8000       ; Gen2 vaddr = GEN2_VBASE + byte_offset (entry byte20->0x8014)
KNOWN_OP_MAX    equ 0x40         ; opcodes are only DEFINED over 00..40 (shared Gen1/Gen2 core)
AREA_1CE    equ 0x4be7          ; LOAD_PIECES two-set flag A
AREA_1D0    equ 0x4be8          ; LOAD_PIECES two-set flag B
PIECES_DEF1 equ 0x7f
PIECES_RST  equ 0xff
MAXMEM      equ 512             ; assoc-array capacity (addr/val word pairs)
CALLCAP     equ 32
FX_HAVE_FILES  equ 0x0001
FX_HAVE_PIECES equ 0x0002
FX_TWOSET      equ 0x0004
FX_HAVE_ENC    equ 0x0008
FX_HAVE_NPC    equ 0x0010
FX_HAVE_SCRIPT equ 0x0020
FX_HAVE_SETUP  equ 0x0040
FX_HAVE_CLOCK  equ 0x0080
FX_HAVE_SIDECAR equ 0x0100         ; CCFLOW publication bit; never inherited by CCECL
HALT_NONE       equ 0
HALT_BAD_OPCODE equ 1
HALT_STEP_BUDGET equ 2
HALT_MEM_FULL   equ 3
HALT_CHAIN      equ 4
HALT_TIMER      equ 5
HALT_INVENTORY  equ 6
HALT_SCRIPT_FULL equ 7
HALT_ENCOUNTER_FULL equ 8
HALT_CALL_FULL  equ 9
DAX_ENTRY_SZ   equ 9
DAXTOC_ENTRIES equ 128
ENCCAP          equ 8
NPCCAP          equ 8
SCRIPTCAP       equ 64
SCRIPT_ARGS     equ 8
SCRIPT_REC_WORDS equ 10          ; opcode, argc, then up to 8 operand rvalues
SCRIPT_REC_BYTES equ SCRIPT_REC_WORDS * 2
SCRIPT_TEXT_BYTES equ 32
SCRIPT_TEXT_REC_BYTES equ SCRIPT_TEXT_BYTES + 2
CHAINCAP        equ 32            ; bounded NEWECL follow depth for container inputs
BRIDGE_REPEAT_CAP equ 16          ; stable LOAD_FILES/LOAD_PIECES loop cutoff
PARTY_ITEM_MAX equ 8
PARTY_AFFECT_MAX equ 8
PARTY_MEMBER_AFFECT_MAX equ 8
PARTY_MOVE_MAX equ 8
PARTY_THIEF_MAX equ 8
PARTY_ROWS_MAX equ 8                   ; GBPR rows accepted (DQK 8; gbboot gates Gen1 to 6)
GEN1_ROWS_MAX  equ 6                   ; GBPS v6 is written by CCINV (Gen1) only, so it keeps the Gen1 row limit
PARTY_SPELL_MAX equ 16
PARTY_MEMBER_SPELL_MAX equ 16
MEM_SEED_MAX equ 16
PARTY_NAME_BYTES equ 16
GBPR_ENTRY_SIZE equ 410
GBPR_COMPACT_FLAG equ 0001h
GBPR_VERSION_V1 equ 1
GBPR_VERSION_V2 equ 2
GBPR_ID_COK equ 1
GBPR_ID_DOK equ 2
GBPR_ID_DQK equ 3
GBPR_DOK_META_OFF equ 216
GBPR_DOK_META_FLAGS equ GBPR_DOK_META_OFF+4
GBPR_DOK_META_MOVE equ GBPR_DOK_META_OFF+22
GBPR_DOK_XP_CACHE_FLAG equ 0004h
GBPR_DOK_XP_THRESH_OFF equ GBPR_DOK_META_OFF+28
DOK_CHAR_XP_OFF equ 62h
DOK_CHAR_READY_OFF equ 0c6h
DOK_CHAR_LEVELS_OFF equ 45h
COK_CCH_XP_OFF equ 116h
COK_CCH_ACTIVE_OFF equ 0F9h
COK_CCH_XP_ELIGIBLE_OFF equ 189h
PS_ITEM_CAP equ 8
PS_AFFECT_CAP equ 8
PS_MEMBER_AFFECT_CAP equ 4
PS_MOVE_CAP equ 8
PS_THIEF_CAP equ 8
PS_THIEF_MATRIX_CAP equ 8
PS_THIEF_SKILL_COUNT equ 8

; CoK's thief skills are at record offset 219; 139 is FRUA's offset and this is
; not FRUA. Full provenance and the one-record null are in native/src/gbboot.asm
; beside COK_CCH_THIEF_OFF. Verified end-to-end against our OWN artifact rather
; than only the retail file: native/build/ROSTER.GBP, a CoK GBPR this engine
; wrote, carries hex `34 3D 2F 28 22 16 62 00` at body offset 219 for MOLLY -- the
; same eight bytes the retail record has there -- and zeros at 139. So GBPR
; embeds the retail body verbatim, and the old read returned
; zeros for every character.
; This remains a CoK-only field: the v1 zero-flag compatibility path reaches it
; only when source-profile selection found KRYNN.CFG, while v2 requires ID 1.
; GBPR_ENTRY_SIZE is 410 = 1 + 409, matching CoK's body; other Gen1 records
; with different lengths are not admitted as CoK title data.
; This path is a FALLBACK in any case -- `start:` selects the source profile,
; imports the roster, then reads the GBPS seed; a v2 seed overwrites
; party_thief_matrix_count, so a seeded run never depends on this field.
PS_COK_THIEF_OFF equ 219
PS_SPELL_CAP equ 16
PS_MEMBER_SPELL_CAP equ 4
PS_MAGIC_OFF equ 0
PS_VERSION_OFF equ 4
PS_FLAGS_OFF equ 6
PS_COUNT_OFF equ 8
PS_RANGER_OFF equ 10
PS_DISTANCE_OFF equ 12
PS_ITEM_COUNT_OFF equ 14
PS_AFFECT_COUNT_OFF equ 15
PS_MEMBER_AFFECT_COUNT_OFF equ 16
PS_MOVE_COUNT_OFF equ 17
PS_THIEF_COUNT_OFF equ 18
PS_SPELL_COUNT_OFF equ 19
PS_MEMBER_SPELL_COUNT_OFF equ 20
PS_ITEMS_OFF equ 22
PS_AFFECTS_OFF equ PS_ITEMS_OFF + (PS_ITEM_CAP * 2)
PS_MEMBER_AFFECTS_OFF equ PS_AFFECTS_OFF + (PS_AFFECT_CAP * 2)
PS_MOVES_OFF equ PS_MEMBER_AFFECTS_OFF + (PS_MEMBER_AFFECT_CAP * 4)
PS_THIEVES_OFF equ PS_MOVES_OFF + (PS_MOVE_CAP * 2)
PS_SPELLS_OFF equ PS_THIEVES_OFF + (PS_THIEF_CAP * 2)
PS_MEMBER_SPELLS_OFF equ PS_SPELLS_OFF + (PS_SPELL_CAP * 2)
PS_V1_LEN equ PS_MEMBER_SPELLS_OFF + (PS_MEMBER_SPELL_CAP * 4)
PS_THIEF_MATRIX_COUNT_OFF equ PS_V1_LEN
PS_THIEF_MATRIX_RESERVED_OFF equ PS_THIEF_MATRIX_COUNT_OFF + 1
PS_THIEF_MATRIX_OFF equ PS_THIEF_MATRIX_RESERVED_OFF + 1
PS_V2_LEN equ PS_THIEF_MATRIX_OFF + (PS_THIEF_MATRIX_CAP * PS_THIEF_SKILL_COUNT)
PS_MEM_SEED_COUNT_OFF equ PS_V2_LEN
PS_MEM_SEED_RESERVED_OFF equ PS_MEM_SEED_COUNT_OFF + 1
PS_MEM_SEED_KEYS_OFF equ PS_MEM_SEED_RESERVED_OFF + 1
PS_MEM_SEED_VALS_OFF equ PS_MEM_SEED_KEYS_OFF + (MEM_SEED_MAX * 2)
PS_V3_LEN equ PS_MEM_SEED_VALS_OFF + (MEM_SEED_MAX * 2)
PS_V4_LEN equ PS_V3_LEN + 258
TIMER_CAP equ 256
TIMER_STATE_LEN equ 12+TIMER_CAP*10
PS_V5_LEN equ PS_V4_LEN+TIMER_STATE_LEN+16
PS_V6_LEN equ PS_V5_LEN+32
PSLEN equ PS_V6_LEN+1
FX_PREFIX_LEN   equ 116
RS_MAGIC_OFF    equ FX_PREFIX_LEN
RS_FLAGS_OFF    equ RS_MAGIC_OFF + 4
RS_AREA_OFF     equ RS_FLAGS_OFF + 2
RS_PC_OFF       equ RS_AREA_OFF + 2
RS_RNG_OFF      equ RS_PC_OFF + 2
RS_CALLSP_OFF   equ RS_RNG_OFF + 4
RS_STACK_OFF    equ RS_CALLSP_OFF + 2
RS_MEMCOUNT_OFF equ RS_STACK_OFF + (CALLCAP * 2)
RS_KEYS_OFF     equ RS_MEMCOUNT_OFF + 2
RS_VALS_OFF     equ RS_KEYS_OFF + (MAXMEM * 2)
FX_V3_LEN       equ RS_VALS_OFF + (MAXMEM * 2)
SX_MAGIC_OFF    equ FX_V3_LEN
SX_COUNT_OFF    equ SX_MAGIC_OFF + 4
SX_EVENTS_OFF   equ SX_COUNT_OFF + 2
SX_TEXT_OFF     equ SX_EVENTS_OFF + (SCRIPTCAP * SCRIPT_REC_BYTES)
FX_V6_LEN       equ SX_TEXT_OFF + (SCRIPTCAP * SCRIPT_TEXT_REC_BYTES)
ES_MAGIC_OFF    equ FX_V6_LEN
ES_SPRITE_OFF   equ ES_MAGIC_OFF + 4
ES_MAX_OFF      equ ES_SPRITE_OFF + 2
ES_PIC_OFF      equ ES_MAX_OFF + 2
ES_DIST_OFF     equ ES_PIC_OFF + 2
FX_V7_LEN       equ ES_DIST_OFF + 2
HD_MAGIC_OFF    equ FX_V7_LEN
HD_REASON_OFF   equ HD_MAGIC_OFF + 4
HD_PC_OFF       equ HD_REASON_OFF + 2
HD_OPCODE_OFF   equ HD_PC_OFF + 2
HD_AREA_OFF     equ HD_OPCODE_OFF + 2
FX_V8_LEN       equ HD_AREA_OFF + 2
CL_MAGIC_OFF    equ FX_V8_LEN
CL_SLOTS_OFF    equ CL_MAGIC_OFF + 4
FXLEN           equ CL_SLOTS_OFF + (7 * 2)
MN_MAGIC_OFF    equ FXLEN
MN_FLAGS_OFF    equ MN_MAGIC_OFF + 4
MN_DEST_OFF     equ MN_FLAGS_OFF + 2
MN_COUNT_OFF    equ MN_DEST_OFF + 2
MN_OPCODE_OFF   equ MN_COUNT_OFF + 2
MN_EVENT_OFF    equ MN_OPCODE_OFF + 2
MN_RESERVED_OFF equ MN_EVENT_OFF + 2
MN_ID_PC_OFF    equ MN_RESERVED_OFF + 2
MN_ID_AREA_OFF  equ MN_ID_PC_OFF + 2
MN_ID_DEST_OFF  equ MN_ID_AREA_OFF + 2
MN_ID_OPCODE_OFF equ MN_ID_DEST_OFF + 2
FX_V11_LEN      equ MN_ID_OPCODE_OFF + 2
MS_MAGIC_OFF     equ FX_V11_LEN
MS_CMP_L_OFF     equ MS_MAGIC_OFF + 4
MS_CMP_R_OFF     equ MS_CMP_L_OFF + 2
MS_SELECTED_OFF  equ MS_CMP_R_OFF + 2
MS_FLAGS_OFF     equ MS_SELECTED_OFF + 2
FX_V12_LEN      equ MS_FLAGS_OFF + 2
; v14 appends the bounded raw packed menu text so CCMENU can render every label.
MT_MAGIC_OFF     equ FX_V12_LEN
MT_COUNT_OFF     equ MT_MAGIC_OFF + 4
MT_DATA_OFF      equ MT_COUNT_OFF + 2
MENU_TEXT_CAP    equ 128
FX_V14_LEN       equ MT_DATA_OFF + MENU_TEXT_CAP
; v15 carries Gen2 script-capacity checkpoints and the DoK acknowledgement.
; The suffix stores the six raw VM flags because comparison operands cannot
; reconstruct flags set directly by boolean opcodes.
GBRF_MAGIC_OFF   equ FX_V14_LEN
GBRF_FLAGS_OFF   equ GBRF_MAGIC_OFF + 4
GBRF_RESERVED_OFF equ GBRF_FLAGS_OFF + 6
FX_V15_LEN       equ GBRF_RESERVED_OFF + 2
SI_MAGIC_OFF     equ FX_V15_LEN
SI_FLAGS_OFF     equ SI_MAGIC_OFF + 8
SI_SELECTED_OFF  equ SI_FLAGS_OFF + 2
SI_COUNT_OFF     equ SI_SELECTED_OFF + 2
FX_V16_LEN      equ SI_MAGIC_OFF + 16

start:
        cld
        mov     sp, stacktop
        mov     ax, cs
        mov     [our_seg], ax
        call    parse_args
        cmp     byte [fname], 0
        je      .usage
        call    sniff_dialect           ; -> [is_gen2]; CF=1 if [fname] can't open
        jc      .noopen
        call    select_operand_dialect  ; sibling DoK DAX installs use retail short frames
        ; Select the ECL source profile before admitting any title-specific
        ; GBPR fields. /ID and the selected retail/container profile must agree.
        cmp     byte [rostername], 0
        je      .roster_ready
        call    read_roster_file
        jc      .rostererr
.roster_ready:
        cmp     byte [seedname], 0
        je      .seed_ready
        call    read_seed_file
        jc      .seederr
.seed_ready:
        cmp     byte [resume_flag], 0
        je      .dialect_ready
        call    read_resume_state
        jc      .resumeerr

.dialect_ready:
        cmp     byte [is_gen2], 0
        je      .gen1

        ; ---- Gen2: CCECL <file.glb> <areaId> [/T] ------------------------
        cmp     word [area_id], 0xffff
        je      .needarea
        mov     word [hdrlen], GEN2_HEADER_LEN
        mov     word [vbaseval], GEN2_VBASE
        call    load_gen2_block         ; container-walk + id-table -> blk:/[blklen]
        jc      .gen2err
        jmp     .haveblk

.gen1:
        ; ---- Gen1: CCECL <block.bin> [/T] (unchanged raw-block flow) -----
        mov     word [hdrlen], GEN1_HEADER_LEN
        mov     word [vbaseval], GEN1_VBASE
        cmp     byte [is_pool], 0
        je      .gen1_base_ready
        mov     word [vbaseval], POOL_GEN1_VBASE
.gen1_base_ready:
        cmp     byte [is_dax], 0
        je      .gen1_raw
        cmp     word [area_id], 0xffff
        je      .needblock
        call    load_dax_block          ; -> blk:, [blklen]; CF on error
        jc      .daxerr
        jmp     .haveblk
.gen1_raw:
        call    load_block              ; -> blk:, [blklen]; CF on error
        jc      .noopen

.haveblk:
        call    vm_reset_all
        cmp     byte [state_flag], 0
        je      .state_imported
        call    read_persistent_state
        jc      .resumeerr
        call    apply_persistent_state
        jc      .resumeerr
.state_imported:
        mov     word [chain_count], 0
        mov     al, [resume_flag]
        mov     [resume_pending], al
        cmp     al, 0
        je      .state_ready
        ; The early resume read selects the container block. Decompression
        ; reuses its scratch, so reload the continuation before applying it.
        call    read_resume_state
        jc      .resumeerr
        call    apply_resume_state
        jc      .badblk
        cmp     byte [ir_mode], 1
        jne     .state_ready
        mov     ax, 4C00h             ; CHECK has no output/seed side effects
        int     21h
.state_ready:

        cmp     byte [trace], 0
        je      .norun
        call    open_trace
.norun:
.runblk:
        mov     ax, [blklen]
        cmp     ax, [hdrlen]
        jb      .badblk
        cmp     byte [resume_pending], 0
        jne     .run_resume
        call    vm_run                  ; interpret; status -> [vmstat]
        jmp     .after_run
.run_resume:
        mov     byte [resume_pending], 0
        call    vm_run_resume           ; continue after COMBAT; status -> [vmstat]
.after_run:
        cmp     byte [vmstat], 1
        jne     .finish_run

        ; Raw .BIN inputs can only report NEWECL in the effect record. Container
        ; inputs can resolve the next block and keep the shared VM memory/effects.
        cmp     byte [is_gen2], 0
        jne     .follow_chain
        cmp     byte [is_dax], 0
        je      .finish_run

.follow_chain:
        inc     word [chain_count]
        cmp     word [chain_count], CHAINCAP
        ja      .chainhalt
        call    load_chain_block
        jc      .chainhalt
        jmp     .runblk

.chainhalt:
        mov     byte [vmstat], 4
        mov     word [halt_reason], HALT_CHAIN
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     ax, [pc]
        mov     [halt_pc], ax
        mov     word [halt_opcode], 0ffffh

.finish_run:

        cmp     byte [trace], 0
        je      .done
        call    close_trace
.done:
        cmp     byte [effects], 0
        je      .exit0
        call    write_effects
        jc      .efxerr
.exit0:
        call    write_timer_seed
        jc      .efxerr
        mov     ax, 4C00h
        int     21h

.usage:
        mov     si, s_usage
        jmp     .die
.noopen:
        mov     si, s_noopen
        jmp     .die
.needarea:
        mov     si, s_needarea
        jmp     .die
.needblock:
        mov     si, s_needblock
        jmp     .die
.gen2err:
        mov     si, s_gen2err
        jmp     .die
.daxerr:
        mov     si, s_daxerr
        jmp     .die
.badblk:
        mov     si, s_badblk
        jmp     .die
.efxerr:
        mov     si, s_efxerr
        jmp     .die
.resumeerr:
        mov     si, s_resumeerr
        jmp     .die
.seederr:
        mov     si, s_seederr
        jmp     .die
.rostererr:
        mov     si, s_rostererr
        jmp     .die
.die:
        push    si
        mov     si, s_error_prefix
        call    puts
        pop     si
        call    puts
        mov     ax, 4C01h
        int     21h

; ============================================================================
;  load_block: read <fname> into blk:, set [blklen]. CF=1 on open failure.
; ============================================================================
load_block:
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .err
        mov     [fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, BLKCAP
        mov     dx, blk
        int     21h                     ; ax = bytes read
        mov     [blklen], ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.err:
        stc
        ret

; ============================================================================
;  load_dax_block: read a Gen1 ECL*.DAX archive, locate raw block id [area_id],
;  signed-byte-RLE decompress it into blk:, and set [blklen]. CF=1 on failure.
;  DAX TOC layout: u16 toc_bytes, then toc_bytes/9 entries:
;    u8 blockId, u32 dataOffset, u16 rawSize, u16 compSize
;  Block data starts at file offset 2+toc_bytes.
; ============================================================================
load_dax_block:
        mov     ax, [area_id]
        cmp     ax, 255
        ja      .err
        mov     [dax_bid], al

        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .err
        mov     [fh], ax

        xor     cx, cx
        xor     dx, dx
        call    seek32
        mov     dx, daxtoc_bytes
        mov     cx, 2
        call    read_here
        mov     ax, [daxtoc_bytes]
        or      ax, ax
        jz      .close_err
        xor     dx, dx
        mov     bx, DAX_ENTRY_SZ
        div     bx
        or      dx, dx
        jnz     .close_err
        cmp     ax, DAXTOC_ENTRIES
        ja      .close_err
        mov     [dax_n], ax
        mov     ax, [daxtoc_bytes]
        add     ax, 2
        mov     [dax_base], ax

        xor     cx, cx
        mov     dx, 2
        call    seek32
        mov     cx, [daxtoc_bytes]
        mov     dx, daxtoc
        call    read_here

        mov     cx, [dax_n]
        mov     si, daxtoc
        jcxz    .close_err
.scan:
        mov     al, [dax_bid]
        cmp     [si], al
        je      .found
        add     si, DAX_ENTRY_SZ
        loop    .scan
        jmp     .close_err

.found:
        mov     ax, [si+5]
        mov     [blklen], ax
        cmp     ax, BLKCAP
        ja      .close_err
        mov     ax, [si+7]
        mov     [dax_comp], ax
        cmp     ax, DAXCOMP_CAP
        ja      .close_err
        mov     dx, [si+1]              ; data offset low word
        mov     cx, [si+3]              ; data offset high word
        add     dx, [dax_base]
        adc     cx, 0
        call    seek32
        call    decode_dax_stream
        jc      .close_err
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        jc      .err
        clc
        ret

.close_err:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

decode_dax_rle:                    ; historical source-contract boundary
%include "daxstream.inc"

; ============================================================================
;  sniff_dialect: open [fname], peek its first 4 bytes. If they read "HLIB"
;  or Amiga "GLIB" this is a Gen2 ECL.GLB container.
;  Otherwise, a nonzero first word divisible by 9 marks a Gen1 DAX archive;
;  everything else remains the original raw decompressed Gen1 block form.
;  Closes the handle either way -- load_block/load_gen2_block reopen [fname].
;  Sets [is_gen2]/[is_dax]. CF=1 only if the file cannot be opened at all.
; ============================================================================
sniff_dialect:
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .err
        mov     [fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 4
        mov     dx, sniffbuf
        int     21h
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        mov     byte [is_gen2], 0
        mov     byte [is_glib], 0
        mov     byte [is_dax], 0
        cmp     word [sniffbuf], 'HL'
        jne     .tryglib
        cmp     word [sniffbuf+2], 'IB'
        jne     .tryglib
        mov     byte [is_gen2], 1
        jmp     .ret
.tryglib:
        cmp     word [sniffbuf], 'GL'
        jne     .trydax
        cmp     word [sniffbuf+2], 'IB'
        jne     .trydax
        mov     byte [is_gen2], 1
        mov     byte [is_glib], 1
        jmp     .ret
.trydax:
        mov     ax, [sniffbuf]
        or      ax, ax
        jz      .ret
        xor     dx, dx
        mov     bx, DAX_ENTRY_SZ
        div     bx
        or      dx, dx
        jnz     .ret
        cmp     ax, DAXTOC_ENTRIES
        ja      .ret
        mov     byte [is_dax], 1
.ret:
        clc
        ret
.err:
        stc
        ret

; ============================================================================
; select_operand_dialect: choose the Gen1 profile after container sniffing.
; A DKK.CFG or POOL4.CFG sibling selects the verified DoK/Pools-of-Darkness
; short operand frames; BUCK.CFG and MATRIX.CFG select their independently
; verified 0x31 menu frame only; KRYNN.CFG selects CoK; POOL.CFG selects Pool's retail 0x6700
; loader addend (vbase 0x98fe). These are
; install-owned markers, so direct probes and the GBBOOT child path agree.
; Gen2 selects every measured frame in the opcode handlers themselves. This keeps direct CCECL
; probes and the GBBOOT child path on the same evidence-backed dialect without
; a test-only command-line switch.
; ============================================================================
select_operand_dialect:
        mov     byte [short_opframes], 0
        mov     byte [short_menu_opframes], 0
        mov     byte [short2_frames], 0
        mov     byte [is_dok], 0
        mov     byte [is_cok], 0
        mov     byte [use_cokrng], 0
        mov     byte [is_pool], 0
        mov     byte [is_matrix], 0
        cmp     byte [is_gen2], 0
        je      .gen1
        ; Storage does not determine opcode semantics. Only explicitly
        ; selected Secret GLIB uses the source-proven DOS long frames.
        cmp     byte [is_glib], 1
        jne     .done
        cmp     word [roster_expected_id], 4
        jne     .done
        mov     byte [is_gen2], 2
        mov     byte [use_cokrng], 2    ; proven Secret ECL08, distinct from legacy SURPRISE
        ; All measured DQK frame differences are Gen2-wide and selected by
        ; their opcode handlers below. `short_opframes` is a Gen1 DoK/PoD-only
        ; dialect selected from retail install markers.
        jmp     .done
.gen1:
        mov     si, fname
        mov     di, profilepath
        mov     bp, di                  ; beginning of final path component
.copy_path:
        mov     al, [si]
        mov     [di], al
        inc     si
        inc     di
        or      al, al
        jz      .have_path
        cmp     al, 5ch
        je      .component
        cmp     al, '/'
        jne     .copy_path
.component:
        mov     bp, di
        jmp     .copy_path
.have_path:
        mov     si, s_dkkcfg
        call    probe_marker
        jc      .try_pool4
        mov     byte [is_dok], 1
        mov     byte [use_cokrng], 1
        mov     byte [short_opframes], 1
        mov     byte [short_menu_opframes], 1
        jmp     .done
.try_pool4:
        mov     si, s_pool4cfg
        call    probe_marker
        jc      .try_treasure
        mov     byte [short_opframes], 1
        mov     byte [short_menu_opframes], 1
        mov     byte [short2_frames], 1
        jmp     .done
.try_treasure:
        mov     si, s_treasurecfg
        call    probe_marker
        jc      .try_buck
        mov     byte [short_opframes], 1
        mov     byte [short2_frames], 1
        jmp     .done
.try_buck:
        mov     si, s_buckcfg
        call    probe_marker
        jc      .try_matrix
        mov     byte [short_menu_opframes], 1
        jmp     .done
.try_matrix:
        mov     si, s_matrixcfg
        call    probe_marker
        jc      .try_pool
        mov     byte [short_menu_opframes], 1
        mov     byte [is_matrix], 1
        jmp     .done
.try_pool:
        mov     si, s_poolcfg
        call    probe_marker
        jc      .try_cok
        mov     byte [is_pool], 1
        jmp     .done
.try_cok:
        mov     si, s_krynncfg
        call    probe_marker
        jc      .done
        mov     byte [is_cok], 1
        mov     byte [use_cokrng], 1
.done:
        ret

; probe_marker: SI = zero-terminated marker file name; BP = start of the final
; component of `profilepath`. Replaces that component with the marker and tries to
; open it. CF=0 when the marker exists (handle closed), CF=1 when absent.
probe_marker:
        mov     di, bp
.copy:
        lodsb
        stosb
        test    al, al
        jnz     .copy
        mov     dx, profilepath
        mov     ax, 3D00h
        int     21h
        jc      .ret
        mov     bx, ax
        mov     ah, 3Eh
        int     21h
        clc
.ret:
        ret

; ============================================================================
;  GEN2 CONTAINER SUPPORT -- DQK ECL.GLB (HLIB/Amiga GLIB "DATA" library)
;
;  ECL.GLB uses the SAME flat HLIB member layout CCHLIB/CCGEO already speak for
;  GEO.GLB/MONCHA.GLB (packages/engine/src/loaders/hlib.ts decodeHlib's
;  non-image branch): a 16-byte header ('HLIB' or 'GLIB' magic, stored-count-1
;  word at +8, 4-char tag at +12), then a table of (count) DWORD file offsets
;  at byte 16. Member i is the flat span [ptrs[i], ptrs[i+1]) for i in
;  0 .. count-2. GLIB stores header count, pointers, and id-table words
;  big-endian; CCECL converts metadata while leaving member payload bytes as-is.
;  ECL.GLB is ~446 KB, well past 64 KB, so offsets need real 32-bit seeks
;  (unlike CCGEO's GEO.GLB, which documents a file-under-64KB shortcut) --
;  every member SIZE is still small enough that a 16-bit low-word subtraction
;  of two DWORD offsets is exact (mirrors CCHLIB's read_member).
;
;  member[0] is the id table (packages/engine/src/loaders/eclGlb.ts
;  parseIdTable): uint16 count, then count * {uint16 areaId, uint16
;  memberIndex}. member[1..N] are the Gen2 ECL blocks themselves (20-byte
;  header, no magic, vbase 0x8000 -- see the GEN2_* equs above).
;
;  load_gen2_block resolves [area_id] through the id table, then loads that
;  member's raw bytes into blk/[blklen] -- exactly what load_block does for a
;  standalone Gen1 file, so vm_run/exec_one don't care which loader ran.
;  CF=1 on: open failure, bad HLIB/GLIB magic, or area id not present in table.
; ============================================================================
GLB_PTRCAP equ 256              ; top-level pointer-table capacity (ECL.GLB needs 49)
IDCAP      equ 512              ; id-table read cap in bytes (ECL.GLB's is 190)

load_gen2_block:
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .err
        mov     [fh], ax

        ; ---- 16-byte HLIB/GLIB header ----
        xor     cx, cx
        xor     dx, dx
        call    seek32
        mov     dx, ghdr
        mov     cx, 16
        call    read_here
        cmp     byte [is_glib], 0
        jne     .check_glib
        cmp     word [ghdr], 'HL'
        jne     .fail
        cmp     word [ghdr+2], 'IB'
        jne     .fail
        mov     ax, [ghdr+8]         ; stored count-1
        jmp     .have_count
.check_glib:
        cmp     word [ghdr], 'GL'
        jne     .fail
        cmp     word [ghdr+2], 'IB'
        jne     .fail
        mov     ax, [ghdr+8]         ; stored count-1
        xchg    al, ah
.have_count:
        inc     ax
        cmp     ax, GLB_PTRCAP
        jbe     .pcok
        mov     ax, GLB_PTRCAP
.pcok:
        mov     [gptrcount], ax
        cmp     ax, 3                ; need >= member0(id table) + member1 + EOF ptr
        jb      .fail

        ; ---- pointer table: [gptrcount] DWORD file offsets at byte 16 ----
        xor     cx, cx
        mov     dx, 16
        call    seek32
        mov     ax, [gptrcount]
        shl     ax, 2
        mov     cx, ax
        mov     dx, gptrs
        call    read_here
        cmp     byte [is_glib], 0
        je      .ptrs_ok
        call    byteswap_gptrs
.ptrs_ok:

        ; ---- member 0 (id table): span = [gptrs[0], gptrs[1]) ----
        mov     ax, [gptrs]          ; mem_start lo
        mov     dx, [gptrs+2]        ; mem_start hi
        mov     [g_mstart], ax
        mov     [g_mstart+2], dx
        mov     ax, [gptrs+4]        ; mem_end lo (ptrs[1])
        sub     ax, [g_mstart]       ; span (16-bit safe: id table is tiny)
        cmp     ax, IDCAP
        jbe     .idlenok
        mov     ax, IDCAP
.idlenok:
        mov     [span_len], ax
        mov     cx, [g_mstart+2]
        mov     dx, [g_mstart]
        call    seek32
        mov     dx, idtab
        mov     cx, [span_len]
        call    read_here

        ; ---- scan the id table for [area_id] -> memberIndex ----
        mov     cx, [idtab]          ; entry count
        cmp     byte [is_glib], 0
        je      .idcount_ok
        xchg    cl, ch
.idcount_ok:
        mov     word [g_found], 0
        or      cx, cx
        jnz     .id_nonzero
        jmp     .fail
.id_nonzero:
        mov     si, idtab+2
.idloop:
        mov     ax, [si]             ; areaId
        cmp     byte [is_glib], 0
        je      .area_ok
        xchg    al, ah
.area_ok:
        cmp     ax, [area_id]
        jne     .idnext
        mov     ax, [si+2]           ; memberIndex
        cmp     byte [is_glib], 0
        je      .memidx_ok
        xchg    al, ah
.memidx_ok:
        mov     [g_memidx], ax
        mov     word [g_found], 1
        jmp     .idfound
.idnext:
        add     si, 4
        loop    .idloop
.idfound:
        cmp     word [g_found], 0
        je      .fail

        ; ---- resolve member [g_memidx] span = [gptrs[idx], gptrs[idx+1]) ----
        mov     ax, [g_memidx]
        mov     cx, [gptrcount]
        dec     cx                   ; flat member count = gptrcount-1
        cmp     ax, cx
        jae     .fail
        mov     bx, ax
        shl     bx, 1
        shl     bx, 1
        mov     ax, [gptrs+bx]
        mov     dx, [gptrs+bx+2]
        mov     [g_mstart], ax
        mov     [g_mstart+2], dx
        mov     ax, [gptrs+bx+4]     ; next pointer's low word
        sub     ax, [g_mstart]       ; span (16-bit safe: ECL blocks are small)
        cmp     ax, BLKCAP
        jbe     .szok
        mov     ax, BLKCAP
.szok:
        mov     [blklen], ax
        mov     cx, [g_mstart+2]
        mov     dx, [g_mstart]
        call    seek32
        mov     dx, blk
        mov     cx, [blklen]
        call    read_here

        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.fail:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        stc
        ret
.err:
        stc
        ret

; GLIB stores absolute u32 pointers big-endian. Convert in-place to the
; little-endian dwords the existing Gen2 loader already consumes.
byteswap_gptrs:
        mov     si, gptrs
        mov     cx, [gptrcount]
.loop:
        mov     al, [si]
        mov     ah, [si+1]
        mov     bl, [si+2]
        mov     bh, [si+3]
        mov     [si], bh
        mov     [si+1], bl
        mov     [si+2], ah
        mov     [si+3], al
        add     si, 4
        loop    .loop
        ret

; seek file [fh] to cx:dx (32-bit absolute; cx=high word, dx=low word)
seek32:
        push    ax
        mov     bx, [fh]
        mov     ax, 4200h
        int     21h
        pop     ax
        ret

; read cx bytes into ds:dx from [fh]
read_here:
        push    ax
        push    bx
        mov     bx, [fh]
        mov     ah, 3Fh
        int     21h
        pop     bx
        pop     ax
        ret

; load_chain_block: resolve the last NEWECL id through the active container.
; CF=1 when the id cannot be loaded.
load_chain_block:
        mov     ax, [chain_id]
        mov     [area_id], ax
        cmp     byte [is_gen2], 0
        jne     .gen2
        call    load_dax_block
        ret
.gen2:
        call    load_gen2_block
        ret

; read_resume_state: load a v3+ GBEF continuation record. For container inputs,
; override [area_id] with the block that actually yielded COMBAT; raw .BIN uses
; the caller's file path directly.
read_resume_state:
        call    ir_select
        cmp     byte [ir_mode], 0
        jne     ir_read
        mov     ax, 3D00h
        mov     dx, resumename
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, FX_V16_LEN+1       ; reject an otherwise-valid trailing byte
        mov     dx, rbuf
        int     21h
        jc      .close_err
        mov     [resume_len], ax
        cmp     ax, FXLEN
        jae     .size_ok
        cmp     ax, FX_V3_LEN
        jb      .close_err
.size_ok:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        jc      .err

        cmp     word [rbuf], 'GB'
        jne     .err
        cmp     word [rbuf+2], 'EF'
        jne     .err
        call    validate_resume_format
        jc      .err
        ; Admit the complete source-selected state before opening any answer.
        cmp     word [rbuf+RS_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+RS_MAGIC_OFF+2], 'RS'
        jne     .err
        call    validate_resume_dialect
        jc      .err
        mov     ax, [rbuf+RS_FLAGS_OFF]
        test    ax, 1
        jz      .err
        mov     ax, [rbuf+8]
        cmp     ax, 3                  ; COMBAT continuation
        je      .combat
        cmp     ax, 2                  ; player-selected menu continuation
        jne     .not_menu
        cmp     word [rbuf+4], 14
        je      .resume_v14_menu
        cmp     word [rbuf+4], 16
        je      .resume_v15_menu
        cmp     word [rbuf+4], 15
        jne     .err
        cmp     word [rbuf+MN_OPCODE_OFF], 001dh
        jne     .resume_v15_menu
        call    read_resume_ack
        jc      .err
        mov     byte [resume_kind], 5
        jmp     .state
.resume_v15_menu:
        call    read_resume_menu
        jc      .err
        call    validate_v15_state
        jc      .err
        mov     byte [resume_kind], 2
        jmp     .state
.resume_v14_menu:
        call    read_resume_menu
        jc      .err
        mov     byte [resume_kind], 2
        jmp     .state
.not_menu:
        ; CCFLOW alone creates this private replay copy after it validates a
        ; complete v9 script-capacity halt.  It has no combat outcome, so it
        ; must not inherit COMBAT's synthetic comparison flags.
        cmp     ax, 4
        jne     .err
        cmp     word [rbuf+4], 9
        je      .legacy_script_full
        cmp     word [rbuf+4], 16
        je      .extended_script_full
        cmp     word [rbuf+4], 15
        jne     .err
.extended_script_full:
        cmp     dword [rbuf+HD_MAGIC_OFF], 'GBHD'
        jne     .err
        cmp     word [rbuf+HD_REASON_OFF], HALT_SCRIPT_FULL
        jne     .err
        cmp     byte [is_gen2], 0
        je      .err
        call    validate_v15_state
        jc      .err
        call    validate_v15_capacity
        jc      .err
        mov     byte [resume_kind], 4
        jmp     .state
.legacy_script_full:
        cmp     dword [rbuf+HD_MAGIC_OFF], 'GBHD'
        jne     .err
        cmp     word [rbuf+HD_REASON_OFF], HALT_SCRIPT_FULL
        jne     .err
        mov     byte [resume_kind], 4
        jmp     .state
.combat:
        cmp     word [rbuf+4], 16
        je      .combat_format_ready
        cmp     word [rbuf+4], 9       ; menus alone use the v14 extension
        ja      .err
.combat_format_ready:
        call    read_resume_outcome
        jc      .err
        mov     byte [resume_kind], 3
.state:
        mov     ax, [rbuf+RS_AREA_OFF]
        cmp     ax, 0ffffh
        je      .ok
        cmp     byte [is_gen2], 0
        jne     .set_area
        cmp     byte [is_dax], 0
        je      .ok
.set_area:
        mov     [area_id], ax
.ok:
        clc
        ret
.close_err:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

; Validate the v11 GBMN tail and its exactly-one GBMO answer before restoring
; a byte of VM state.  This is deliberately separate from combat's textual
; outcome parser: an untrusted player answer must never default to choice zero.
read_resume_menu:
        ; A matching GBMO must also describe the actual pending resume state.
        mov     ax, [rbuf+RS_PC_OFF]
        cmp     ax, [rbuf+MN_ID_PC_OFF]
        jne     .err
        mov     ax, [rbuf+RS_AREA_OFF]
        cmp     ax, [rbuf+MN_ID_AREA_OFF]
        jne     .err
        mov     ax, [rbuf+MN_DEST_OFF]
        cmp     ax, [rbuf+MN_ID_DEST_OFF]
        jne     .err
        mov     ax, [rbuf+MN_OPCODE_OFF]
        cmp     ax, [rbuf+MN_ID_OPCODE_OFF]
        jne     .err
        cmp     word [rbuf+MS_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+MS_MAGIC_OFF+2], 'MS'
        jne     .err
        mov     ax, [rbuf+MS_FLAGS_OFF]
        test    ax, 0fffch
        jnz     .err
        cmp     word [rbuf+SX_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+SX_MAGIC_OFF+2], 'SX'
        jne     .err
        cmp     word [rbuf+MN_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+MN_MAGIC_OFF+2], 'MN'
        jne     .err
        mov     ax, [rbuf+MN_FLAGS_OFF]
        cmp     ax, 1
        je      .menu_flags_ok
        cmp     ax, 3                  ; opcode 22: yes/no selection, no destination
        jne     .err
.menu_flags_ok:
        mov     ax, [rbuf+SX_COUNT_OFF]
        cmp     ax, 1
        jb      .err
        cmp     ax, SCRIPTCAP
        ja      .err
        mov     ax, [rbuf+MN_DEST_OFF]
        mov     [resume_menu_dest], ax
        mov     ax, [rbuf+MN_COUNT_OFF]
        cmp     ax, 255
        ja      .err
        mov     [resume_menu_count], ax
        mov     ax, [rbuf+MN_OPCODE_OFF]
        cmp     ax, 0015h
        je      .opcode_ok
        cmp     ax, 0022h
        je      .opcode_ok
        cmp     ax, 002Bh
        je      .opcode_ok
        cmp     ax, 0031h
        je      .opcode_ok
        cmp     ax, 002ch
        je      .opcode_ok
        cmp     ax, 0039h
        je      .opcode_ok
        cmp     ax, 000fh
        je      .opcode_ok
        cmp     ax, 0010h
        jne     .err
.opcode_ok:
        cmp     ax, 0039h
        jne     .supported_resume_opcode
        cmp     byte [is_gen2], 2
        je      .secret_who_profile
        cmp     word [roster_expected_id], 4
        je      .err                    ; explicit Secret cannot import HLIB WHO
        jmp     .supported_resume_opcode
.secret_who_profile:
        cmp     word [rbuf+4], 16
        jne     .err
        cmp     byte [who_names_valid], 1
        jne     .err
        mov     dx, [party_count]
        cmp     dx, [resume_menu_count]
        jne     .err
.supported_resume_opcode:
        mov     [resume_menu_opcode], ax
        cmp     ax, 0022h
        jne     .ordinary_menu_flags
        cmp     word [rbuf+MN_FLAGS_OFF], 3
        jne     .err
        jmp     .menu_flag_shape_ok
.ordinary_menu_flags:
        cmp     word [rbuf+MN_FLAGS_OFF], 1
        jne     .err
.menu_flag_shape_ok:
        mov     ax, [rbuf+MN_RESERVED_OFF]
        cmp     word [resume_menu_opcode], 0022h
        jne     .reserved_zero
        test    ax, 0fffch
        jnz     .err
        mov     [resume_menu_flags], ax
        jmp     .reserved_ok
.reserved_zero:
        or      ax, ax
        jnz     .err
        mov     word [resume_menu_flags], 0
.reserved_ok:
        cmp     word [resume_menu_count], 0
        jne     .count_shape_ok
        cmp     word [resume_menu_opcode], 000fh
        jne     .err
.count_shape_ok:
        mov     ax, [rbuf+MN_EVENT_OFF]
        cmp     ax, [rbuf+SX_COUNT_OFF]
        jae     .err
        mov     bx, ax
        shl     bx, 2
        mov     dx, bx
        shl     bx, 2
        add     bx, dx                  ; event index * 20
        mov     ax, [rbuf+SX_EVENTS_OFF+bx]
        cmp     ax, [resume_menu_opcode]
        jne     .err
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+2]
        cmp     word [resume_menu_opcode], 0022h
        je      .party_prompt
        cmp     word [resume_menu_opcode], 0015h
        jne     .horizontal
        cmp     ax, 3
        jb      .err
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+4]
        cmp     ax, [resume_menu_dest]
        jne     .err
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+8]
        jmp     .count
.horizontal:
        cmp     word [resume_menu_opcode], 002ch
        je      .parlay
        cmp     word [resume_menu_opcode], 0039h
        je      .who
        cmp     word [resume_menu_opcode], 0010h
        je      .string
        cmp     word [resume_menu_opcode], 000fh
        je      .number
        cmp     ax, 2
        jb      .err
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+4]
        cmp     ax, [resume_menu_dest]
        jne     .err
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+6]
        jmp     .count
.number:
        cmp     word [resume_menu_count], 0
        jne     .err
        cmp     ax, 2
        jb      .err
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+6] ; operand 1 is metadata; operand 2 is destination
        cmp     ax, [resume_menu_dest]
        jne     .err
        xor     ax, ax
        jmp     .count
.string:
        cmp     ax, 2
        jne     .err
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+4]
        cmp     ax, [resume_menu_count]
        jne     .err
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+6]
        cmp     ax, [resume_menu_dest]
        jne     .err
        mov     ax, [resume_menu_count]
        jmp     .count
.who:
        cmp     ax, 1
        jne     .err
        cmp     word [resume_menu_dest], 0ffffh
        jne     .who_legacy_dest
        mov     dx, [rbuf+SX_EVENTS_OFF+bx+4]
        or      dx, dx
        jz      .err                    ; Gen2 WHO must carry its inline prompt
        cmp     word [resume_menu_count], 1
        jb      .err
        cmp     word [resume_menu_count], PARTY_ROWS_MAX
        ja      .err
        mov     ax, [resume_menu_count]
        jmp     .count
.who_legacy_dest:
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+4]
        cmp     ax, [resume_menu_dest]
        jne     .err
        mov     ax, [resume_menu_count]
        jmp     .count
.parlay:
        cmp     ax, 6
        jb      .err
        mov     ax, [rbuf+SX_EVENTS_OFF+bx+14]
        cmp     ax, [resume_menu_dest]
        jne     .err
        mov     ax, 5
.count:
        cmp     ax, [resume_menu_count]
        jne     .err
        ; GBMT carries one prompt plus each vertical choice, or just each
        ; horizontal choice. Every byte after those length-prefixed segments
        ; must be fixed-width zero padding.
        jmp     .menu_event_shape_ok
.party_prompt:
        or      ax, ax
        jnz     .err
        cmp     word [resume_menu_dest], 0ffffh
        jne     .err
        cmp     word [resume_menu_count], 2
        jne     .err
.menu_event_shape_ok:
        cmp     word [rbuf+MT_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+MT_MAGIC_OFF+2], 'MT'
        jne     .err
        mov     ax, [resume_menu_count]
        cmp     word [resume_menu_opcode], 000fh
        je      .text_zero
        cmp     word [resume_menu_opcode], 0010h
        je      .text_zero
        cmp     word [resume_menu_opcode], 0015h
        jne     .check_party_text
        inc     ax
        jmp     .text_count_final
.check_party_text:
        cmp     word [resume_menu_opcode], 0022h
        je      .party_text_count
        cmp     word [resume_menu_opcode], 0039h
        jne     .text_count_final
        cmp     word [resume_menu_dest], 0ffffh
        jne     .text_count_final
.party_text_count:
        inc     ax                  ; party-surprise label or Gen2 WHO prompt
        jmp     .text_count_final
.text_zero:
        xor     ax, ax
.text_count_final:
        cmp     ax, [rbuf+MT_COUNT_OFF]
        jne     .err
        mov     cx, ax
        mov     si, MT_DATA_OFF
.text_segment:
        jcxz   .text_padding
        movzx   ax, byte [rbuf+si]
        inc     si
        add     si, ax
        cmp     si, MT_DATA_OFF+MENU_TEXT_CAP
        ja      .err
        loop    .text_segment
.text_padding:
        cmp     si, MT_DATA_OFF+MENU_TEXT_CAP
        jae     .text_done
        cmp     byte [rbuf+si], 0
        jne     .err
        inc     si
        jmp     .text_padding
.text_done:
        cmp     word [resume_menu_opcode], 0039h
        jne     .check_party_labels
        cmp     word [resume_menu_dest], 0ffffh
        jne     .check_party_labels
        mov     si, MT_DATA_OFF
        movzx   ax, byte [rbuf+si]   ; first GBMT segment is the packed prompt
        mov     di, [rbuf+MN_EVENT_OFF]
        imul    di, di, 20
        cmp     ax, [rbuf+SX_EVENTS_OFF+di+4]
        jne     .err
        cmp     byte [is_gen2], 2
        jne     .check_party_labels
        call    validate_who_names
        jc      .err
.check_party_labels:
        cmp     word [resume_menu_opcode], 0022h
        jne     .party_labels_ok
        mov     si, MT_DATA_OFF
        movzx   ax, byte [rbuf+si]
        inc     si
        add     si, ax                  ; skip the captured PRINTCLEAR prompt
        cmp     byte [rbuf+si], 3
        jne     .err
        inc     si
        cmp     word [rbuf+si], 05464h  ; packed "YE"
        jne     .err
        cmp     byte [rbuf+si+2], 0c0h  ; packed "S\0"
        jne     .err
        add     si, 3
        cmp     byte [rbuf+si], 3
        jne     .err
        inc     si
        cmp     word [rbuf+si], 0f038h  ; packed "NO"
        jne     .err
        cmp     byte [rbuf+si+2], 0
        jne     .err
.party_labels_ok:
        cmp     byte [outname], 0
        je      .err
        mov     ax, 3D00h
        mov     dx, outname
        int     21h
        jc      .err
        mov     [fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 19                ; 18 bytes exactly; detect a trailing byte
        mov     dx, outbuf
        int     21h
        jc      .answer_close_error
        push    ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        jc      .err
        cmp     ax, 18
        jne     .err
        cmp     word [outbuf], 'GB'
        jne     .err
        cmp     word [outbuf+2], 'MO'
        jne     .err
        cmp     word [outbuf+4], 2
        jne     .err
        mov     ax, [outbuf+8]
        cmp     ax, [resume_menu_count]
        jne     .err
        mov     ax, [outbuf+6]
        cmp     word [resume_menu_opcode], 000fh
        jne     .bounded_answer
        cmp     word [resume_menu_count], 0
        je      .answer_ok
.bounded_answer:
        cmp     byte [is_gen2], 2
        jne     .ordinary_bounded_answer
        cmp     word [resume_menu_opcode], 0039h
        jne     .ordinary_bounded_answer
        mov     dx, ax
        inc     dx                      ; FFFF token denotes null actor
        cmp     dx, [rbuf+SI_SELECTED_OFF]
        jne     .err
        test    dx, dx
        jz      .answer_ok
.ordinary_bounded_answer:
        cmp     ax, [resume_menu_count]
        jae     .err
.answer_ok:
        mov     ax, [outbuf+10]
        cmp     ax, [rbuf+MN_ID_PC_OFF]
        jne     .err
        mov     ax, [outbuf+12]
        cmp     ax, [rbuf+MN_ID_AREA_OFF]
        jne     .err
        mov     ax, [outbuf+14]
        cmp     ax, [rbuf+MN_ID_DEST_OFF]
        jne     .err
        mov     ax, [outbuf+16]
        cmp     ax, [rbuf+MN_ID_OPCODE_OFF]
        jne     .err
        mov     ax, [outbuf+6]
        mov     [resume_menu_selected], ax
        clc
        ret
.answer_close_error:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

; Validate the DoK 1Dh acknowledgement identity and its one-shot GBMO token.
; Unlike read_resume_menu, this path has no destination write and does not
; synthesize comparison flags.
read_resume_ack:
        cmp     word [rbuf+8], 2
        jne     .err
        test    word [rbuf+6], FX_HAVE_SIDECAR
        jz      .err
        call    validate_v15_state
        jc      .err
        cmp     word [rbuf+MS_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+MS_MAGIC_OFF+2], 'MS'
        jne     .err
        mov     ax, [rbuf+MS_FLAGS_OFF]
        test    ax, 0fffch
        jnz     .err
        cmp     word [rbuf+SX_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+SX_MAGIC_OFF+2], 'SX'
        jne     .err
        cmp     word [rbuf+MN_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+MN_MAGIC_OFF+2], 'MN'
        jne     .err
        cmp     word [rbuf+MN_FLAGS_OFF], 2
        jne     .err
        cmp     word [rbuf+MN_DEST_OFF], 0ffffh
        jne     .err
        cmp     word [rbuf+MN_COUNT_OFF], 1
        jne     .err
        cmp     word [rbuf+MN_OPCODE_OFF], 001dh
        jne     .err
        cmp     word [rbuf+MN_RESERVED_OFF], 0
        jne     .err
        ; ACK identity follows the yielded instruction in any DoK block.
        ; apply_resume_state checks this PC against the loaded source bounds.
        mov     ax, [rbuf+RS_PC_OFF]
        cmp     ax, [rbuf+MN_ID_PC_OFF]
        jne     .err
        mov     ax, [rbuf+RS_AREA_OFF]
        cmp     ax, [rbuf+MN_ID_AREA_OFF]
        jne     .err
        cmp     word [rbuf+MN_ID_DEST_OFF], 0ffffh
        jne     .err
        cmp     word [rbuf+MN_ID_OPCODE_OFF], 001dh
        jne     .err
        mov     ax, [rbuf+SX_COUNT_OFF]
        or      ax, ax
        jz      .err
        cmp     ax, SCRIPTCAP
        ja      .err
        dec     ax
        cmp     ax, [rbuf+MN_EVENT_OFF]
        jne     .err
        mov     bx, ax
        imul    bx, bx, 20
        cmp     word [rbuf+SX_EVENTS_OFF+bx], 001dh
        jne     .err
        cmp     word [rbuf+SX_EVENTS_OFF+bx+2], 0
        jne     .err
        cmp     byte [outname], 0
        je      .err
        mov     ax, 3D00h
        mov     dx, outname
        int     21h
        jc      .err
        mov     [fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 19
        mov     dx, outbuf
        int     21h
        push    ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 18
        jne     .err
        cmp     word [outbuf], 'GB'
        jne     .err
        cmp     word [outbuf+2], 'MO'
        jne     .err
        cmp     word [outbuf+4], 2
        jne     .err
        cmp     word [outbuf+6], 1
        jne     .err
        cmp     word [outbuf+8], 1
        jne     .err
        mov     ax, [outbuf+10]
        cmp     ax, [rbuf+MN_ID_PC_OFF]
        jne     .err
        mov     ax, [outbuf+12]
        cmp     ax, [rbuf+MN_ID_AREA_OFF]
        jne     .err
        mov     ax, [outbuf+14]
        cmp     ax, [rbuf+MN_ID_DEST_OFF]
        jne     .err
        mov     ax, [outbuf+16]
        cmp     ax, [rbuf+MN_ID_OPCODE_OFF]
        jne     .err
        clc
        ret
.err:
        stc
        ret

read_persistent_state:
        mov     ax, 3D00h
        mov     dx, statename
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, FX_V16_LEN+1      ; reject an otherwise-valid trailing byte
        mov     dx, rbuf
        int     21h
        jc      .close_error
        mov     [resume_len], ax
        push    ax
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        jc      .err
        cmp     word [rbuf], 'GB'
        jne     .err
        cmp     word [rbuf+2], 'EF'
        jne     .err
        call    validate_resume_format
        jc      .err
        cmp     word [rbuf+4], 16
        jne     .legacy_format
        cmp     word [rbuf+8], 2       ; /P never imports a pending menu
        je      .err
        jmp     .ordinary_format
.legacy_format:
        cmp     word [rbuf+4], 9       ; /P imports ordinary state, never menus
        ja      .err
.ordinary_format:
        cmp     word [rbuf+RS_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+RS_MAGIC_OFF+2], 'RS'
        jne     .err
        call    validate_resume_dialect
        jc      .err
        mov     ax, [rbuf+RS_MEMCOUNT_OFF]
        cmp     ax, MAXMEM
        ja      .err
        clc
        ret
.close_error:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

 ; Both /R and /P require the same source-selected semantic revision.
validate_resume_dialect:
        mov     al, [is_gen2]
        and     al, 2
        neg     al
        and     al, 12                ; expected0 generic or12 Secret frame+RNG revision
        xor     al, [rbuf+RS_FLAGS_OFF]
        test    al, 12
        jnz     .bad
        test    word [rbuf+RS_FLAGS_OFF], 0fff2h
        jnz     .bad
        clc
        ret
.bad:   stc
        ret

; The fixed GBEF layouts are closed formats.  Do not interpret a future
; version as its nearest older prefix, and do not let an appended byte become
; an unnoticed incompatible extension.  v3-v5 share the original GBRS body;
; every later supported version owns one exact append-only length.  v14 is the
; separately validated interactive-menu continuation.
; CF=0 only when [rbuf+4] and [resume_len] are an exact supported pair.
validate_resume_format:
        mov     ax, [rbuf+4]
        cmp     ax, 3
        jb      .bad
        cmp     ax, 5
        jbe     .v3
        cmp     ax, 6
        je      .v6
        cmp     ax, 7
        je      .v7
        cmp     ax, 8
        je      .v8
        cmp     ax, 9
        je      .v9
        cmp     ax, 14
        je      .v14
        cmp     ax, 15
        je      .v15
        cmp     ax, 16
        je      .v16
.bad:   stc
        ret
.v3:   mov     ax, FX_V3_LEN
        jmp     .length
.v6:   mov     ax, FX_V6_LEN
        jmp     .length
.v7:   mov     ax, FX_V7_LEN
        jmp     .length
.v8:   mov     ax, FX_V8_LEN
        jmp     .length
.v9:   mov     ax, FXLEN
        jmp     .length
.v14:  mov     ax, FX_V14_LEN
        jmp     .length
.v15:  mov     ax, FX_V15_LEN
        jmp     .length
.v16:  cmp     byte [is_gen2], 2
        jne     .bad
        mov     ax, FX_V16_LEN
.length:
        cmp     [resume_len], ax
        jne     .bad
        cmp     word [rbuf+4], 16
        je      validate_v16_state
        clc
        ret

apply_persistent_state:
        mov     eax, [rbuf+RS_RNG_OFF]
        mov     [rng_state], eax
        mov     ax, [rbuf+RS_MEMCOUNT_OFF]
        mov     [memcount], ax
        mov     si, rbuf+RS_KEYS_OFF
        mov     di, mem_keys
        mov     cx, MAXMEM
        rep     movsw
        mov     si, rbuf+RS_VALS_OFF
        mov     di, mem_vals
        mov     cx, MAXMEM
        rep     movsw

        cmp     word [rbuf+4], 9
        jb      .ok
        cmp     word [resume_len], FXLEN
        jb      .err
        cmp     word [rbuf+CL_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+CL_MAGIC_OFF+2], 'CL'
        jne     .err
        mov     si, rbuf+CL_SLOTS_OFF
        mov     di, clock_slots
        mov     cx, 7
        rep     movsw
.ok:
        cmp     word [rbuf+4], 16
        jne     .identity_ready
        call    restore_v16_state
.identity_ready:
        clc
        ret
.err:
        stc
        ret

read_resume_outcome:
        cmp     byte [outname], 0
        je      .fail

        ; Prefer file contents.  Combat's text result is an untrusted handoff
        ; boundary: accept precisely one documented outcome token, optionally
        ; followed by its DOS CR/LF.  Do not let an absent, truncated, or
        ; trailing result default to comparison zero and advance the paused VM.
        ; If the token is not a path, parse the complete direct token by the
        ; same grammar.
        mov     ax, 3D00h
        mov     dx, outname
        int     21h
        jc      .direct
        mov     [fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 17                ; max token is "victory" + CR/LF (9)
        mov     dx, outbuf
        int     21h
        push    ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        jc      .close_fail
        pop     ax
        cmp     ax, 17                ; one byte beyond every valid file
        jae     .fail
        mov     si, outbuf
        mov     cx, ax
        call    parse_outcome_file
        ret
.close_fail:
        pop     ax
        jmp     .fail
.direct:
        mov     si, outname
        xor     bx, bx
.direct_len:
        cmp     byte [si+bx], 0
        je      .direct_parse
        inc     bx
        cmp     bx, 127
        jbe     .direct_len
        jmp     .fail
.direct_parse:
        mov     cx, bx
        call    parse_outcome_token
        ret
.fail:
        stc
        ret

; SI/CX names a file's complete contents.  The producer writes CR/LF, but
; never accepts whitespace or arbitrary trailing bytes after it.
parse_outcome_file:
        cmp     cx, 2
        jb      parse_outcome_token
        mov     bx, cx
        sub     bx, 2
        cmp     byte [si+bx], 13
        jne     parse_outcome_token
        cmp     byte [si+bx+1], 10
        jne     .fail
        sub     cx, 2
        jmp     parse_outcome_token
.fail:
        stc
        ret

; SI/CX names exactly one case-insensitive documented outcome token.
parse_outcome_token:
        cmp     cx, 5                  ; party
        jne     .victory
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'P'
        jne     .victory
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'A'
        jne     .fail
        mov     al, [si+2]
        and     al, 0DFh
        cmp     al, 'R'
        jne     .fail
        mov     al, [si+3]
        and     al, 0DFh
        cmp     al, 'T'
        jne     .fail
        mov     al, [si+4]
        and     al, 0DFh
        cmp     al, 'Y'
        jne     .fail
        jmp     .win
.victory:
        cmp     cx, 7
        jne     .flee
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'V'
        jne     .flee
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'I'
        jne     .fail
        mov     al, [si+2]
        and     al, 0DFh
        cmp     al, 'C'
        jne     .fail
        mov     al, [si+3]
        and     al, 0DFh
        cmp     al, 'T'
        jne     .fail
        mov     al, [si+4]
        and     al, 0DFh
        cmp     al, 'O'
        jne     .fail
        mov     al, [si+5]
        and     al, 0DFh
        cmp     al, 'R'
        jne     .fail
        mov     al, [si+6]
        and     al, 0DFh
        cmp     al, 'Y'
        jne     .fail
.win:
        mov     byte [resume_outcome], 1
        clc
        ret
.flee:
        cmp     cx, 4
        jne     .enemy
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'F'
        jne     .enemy
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'L'
        jne     .fail
        mov     al, [si+2]
        and     al, 0DFh
        cmp     al, 'E'
        jne     .fail
        mov     al, [si+3]
        and     al, 0DFh
        cmp     al, 'E'
        jne     .fail
.flee_ok:
        mov     byte [resume_outcome], 2
        clc
        ret
.enemy:
        cmp     cx, 5
        jne     .draw
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'E'
        jne     .draw
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'N'
        jne     .fail
        mov     al, [si+2]
        and     al, 0DFh
        cmp     al, 'E'
        jne     .fail
        mov     al, [si+3]
        and     al, 0DFh
        cmp     al, 'M'
        jne     .fail
        mov     al, [si+4]
        and     al, 0DFh
        cmp     al, 'Y'
        jne     .fail
        jmp     .zero
.draw:
        cmp     cx, 4
        jne     .defeat
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'D'
        jne     .defeat
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'R'
        jne     .fail
        mov     al, [si+2]
        and     al, 0DFh
        cmp     al, 'A'
        jne     .fail
        mov     al, [si+3]
        and     al, 0DFh
        cmp     al, 'W'
        jne     .fail
        jmp     .zero
.defeat:
        cmp     cx, 6
        jne     .fail
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'D'
        jne     .fail
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'E'
        jne     .fail
        mov     al, [si+2]
        and     al, 0DFh
        cmp     al, 'F'
        jne     .fail
        mov     al, [si+3]
        and     al, 0DFh
        cmp     al, 'E'
        jne     .fail
        mov     al, [si+4]
        and     al, 0DFh
        cmp     al, 'A'
        jne     .fail
        mov     al, [si+5]
        and     al, 0DFh
        cmp     al, 'T'
        jne     .fail
.zero:
        mov     byte [resume_outcome], 0
        clc
        ret
.fail:
        stc
        ret

apply_resume_state:
        cmp     byte [ir_mode], 0
        jne     ir_apply
.common:
        mov     ax, [rbuf+RS_PC_OFF]
        cmp     ax, [hdrlen]
        jb      .err
        cmp     ax, [blklen]
        ja      .err                    ; pc==blklen is a valid immediate exit
        mov     [pc], ax

        mov     eax, [rbuf+RS_RNG_OFF]
        mov     [rng_state], eax

        mov     ax, [rbuf+RS_CALLSP_OFF]
        cmp     ax, CALLCAP
        ja      .err
        mov     [callsp], ax
        mov     si, rbuf+RS_STACK_OFF
        mov     di, callstk
        mov     cx, CALLCAP
        rep     movsw

        mov     ax, [rbuf+RS_MEMCOUNT_OFF]
        cmp     ax, MAXMEM
        ja      .err
        mov     [memcount], ax
        mov     si, rbuf+RS_KEYS_OFF
        mov     di, mem_keys
        mov     cx, MAXMEM
        rep     movsw
        mov     si, rbuf+RS_VALS_OFF
        mov     di, mem_vals
        mov     cx, MAXMEM
        rep     movsw

        ; Menus and the exact script-capacity replay retain the published
        ; handoff prefix. Ordinary combat resumes deliberately keep their
        ; established output shape.
        cmp     byte [resume_kind], 3
        je      .menu_state_done
        call    restore_fx_prefix
        cmp     byte [resume_kind], 2
        je      .menu_state
        cmp     byte [resume_kind], 4
        je      .check_v15_state
        cmp     byte [resume_kind], 5
        jne     .menu_state_done
.check_v15_state:
        cmp     word [rbuf+4], 15
        jne     .menu_state_done
.menu_state:
        mov     ax, [rbuf+MS_CMP_L_OFF]
        mov     [cmp_l], ax
        mov     ax, [rbuf+MS_CMP_R_OFF]
        mov     [cmp_r], ax
        cmp     byte [resume_kind], 4
        je      .restore_raw_flags
        cmp     byte [resume_kind], 5
        je      .restore_raw_flags
        cmp     word [rbuf+4], 15
        jne     .synthesize_menu_flags
.restore_raw_flags:
        mov     si, rbuf+GBRF_FLAGS_OFF
        mov     di, flag_eq
        mov     cx, 6
        rep     movsb
        jmp     .menu_state_flags_done
.synthesize_menu_flags:
        cmp     word [resume_menu_opcode], 0022h
        je      .restore_party_flags
        call    set_cmp_flags
        jmp     .menu_state_flags_done
.restore_party_flags:
        call    clear_party_prompt_flags
        mov     ax, [resume_menu_flags]
        mov     bx, ax
        and     al, 1
        mov     [flag_le], al
        shr     bx, 1
        and     bl, 1
        mov     [flag_ge], bl
        mov     ax, [resume_menu_selected]
        call    set_party_prompt_answer
.menu_state_flags_done:
        mov     ax, [rbuf+MS_SELECTED_OFF]
        mov     [selected_party], ax
        mov     ax, [rbuf+MS_FLAGS_OFF]
        and     ax, 1
        mov     [selected_valid], al
        mov     ax, [rbuf+MS_FLAGS_OFF]
        shr     ax, 1
        and     ax, 1
        mov     [selected_not_found], al
.menu_state_done:
        cmp     word [rbuf+4], 16
        jne     .identity_ready
        call    restore_v16_state
.identity_ready:

        cmp     word [rbuf+4], 9
        jb      .clock_done
        cmp     word [resume_len], FXLEN
        jb      .err
        cmp     word [rbuf+CL_MAGIC_OFF], 'GB'
        jne     .err
        cmp     word [rbuf+CL_MAGIC_OFF+2], 'CL'
        jne     .err
        mov     si, rbuf+CL_SLOTS_OFF
        mov     di, clock_slots
        mov     cx, 7
        rep     movsw
.clock_done:

        mov     word [stepc], 0
        mov     byte [vmstat], 0
        mov     byte [flow_stop], 0
        mov     byte [mem_changed], 0
        cmp     byte [resume_kind], 2
        jne     .not_menu_resume
        cmp     word [resume_menu_opcode], 0022h
        je      .menu_outcome_ready
        call    can_write_menu_selection
        jc      .err
.menu_outcome_ready:
        call    consume_menu_outcome
        jc      .err
        cmp     word [resume_menu_opcode], 0022h
        jne     .menu_answer_done
        mov     ax, [resume_menu_selected]
        call    set_party_prompt_answer
.menu_answer_done:
        cmp     word [resume_menu_opcode], 0010h
        je      .menu_done
        cmp     word [resume_menu_opcode], 0022h
        je      .menu_done
        cmp     word [resume_menu_opcode], 0039h
        jne     .menu_destination_write
        cmp     word [resume_menu_dest], 0ffffh
        je      .who_resume_answer
.menu_destination_write:
        mov     bx, [resume_menu_dest]
        mov     ax, [resume_menu_selected]
        ; PARLAY's answer is an attitude index. Its title-owned response value
        ; remains in the verified GBSX event, so recover it after validation.
        cmp     word [resume_menu_opcode], 002ch
        jne     .menu_value_ready
        mov     di, [rbuf+MN_EVENT_OFF]
        imul    di, di, 20
        mov     si, [resume_menu_selected]
        shl     si, 1
        add     di, si
        mov     ax, [rbuf+di+SX_EVENTS_OFF+4]
.menu_value_ready:
        call    mem_set
        jmp     .menu_done
.who_resume_answer:
        mov     ax, [resume_menu_selected]
        cmp     byte [is_gen2], 2
        jne     .apply_who_answer
        cmp     ax, 0ffffh
        je      .menu_done              ; retain the admitted null/not-found state
.apply_who_answer:
        call    set_who_party_selection
.menu_done:
        clc
        ret
.not_menu_resume:
        cmp     byte [resume_kind], 4
        je      .menu_done
        cmp     byte [resume_kind], 5
        jne     .combat_flags
        call    consume_menu_outcome
        jmp     .menu_done
.combat_flags:
        call    set_resume_cmp_flags
        clc
        ret
.err:
        stc
        ret

; Restore the fixed native handoff prefix after vm_reset_all.  GBSX stays
; invocation-local: a replay writes a new chunk instead of duplicating the
; preceding 64 records.
restore_fx_prefix:
        mov     si, rbuf
        mov     di, fx_state
        mov     cx, FX_PREFIX_LEN/2
        rep     movsw
        ; Sidecar provenance belongs to the just-published GBEF/GBSL pair.
        ; CCECL writes a new effect on resume, so never copy the old bridge's
        ; publication bit into that invocation-local GBSX stream.
        and     word [fx_flags], 0feffh
        mov     ax, [fx_enc_count]
        mov     [enc_count], ax
        mov     ax, [fx_npc_count]
        mov     [npc_count], ax
        ret

; The answer file is the one-time publication token for a pending menu. Do
; not remove it until the restored sparse store can accept the selected value;
; after this check, mem_set cannot enter its full-memory halt path.
can_write_menu_selection:
        push    ax
        push    cx
        push    si
        cmp     word [resume_menu_opcode], 0039h
        jne     .destination_write
        cmp     word [resume_menu_dest], 0ffffh
        je      .ok                    ; Gen2 WHO updates selected-party state, not VM memory
.destination_write:
        mov     bx, [resume_menu_dest]
        mov     cx, [memcount]
        mov     si, mem_keys
.find:
        jcxz    .space
        cmp     [si], bx
        je      .ok
        add     si, 2
        loop    .find
.space:
        cmp     word [memcount], MAXMEM
        jae     .full
.ok:
        clc
        jmp     .done
.full:
        stc
.done:
        pop     si
        pop     cx
        pop     ax
        ret

consume_menu_outcome:
        mov     dx, outname
        mov     ah, 41h
        int     21h
        ret

set_resume_cmp_flags:
        mov     word [cmp_l], 0
        cmp     byte [resume_outcome], 1
        jne     .not_victory
        mov     word [cmp_l], 1
        jmp     .set
.not_victory:
        cmp     byte [resume_outcome], 2
        jne     .set
        mov     word [cmp_l], 2
.set:
        mov     word [cmp_r], 1
        call    set_cmp_flags
        ret

; ============================================================================
;  VM STATE & MEMORY (assoc array)
;  mem_get: BX=addr -> AX=value (0 if absent).
;  mem_set: BX=addr, AX=value. Records [last_addr]/[last_val] + [mem_changed]=1.
; ============================================================================
mem_get:
        push    cx
        push    si
        call    secret_field_get
        jnc     .field
        cmp     bx, 7d00h
        je      .selected_in_combat
        cmp     bx, 7ca5h
        jb      .assoc
        cmp     bx, 7cach
        ja      .assoc
        cmp     byte [party_thief_matrix_count], 0
        jne     .selected_thief_skill
.assoc:
        mov     cx, [memcount]
        mov     si, mem_keys
        jcxz    .miss
.l:
        cmp     [si], bx
        je      .hit
        add     si, 2
        loop    .l
.miss:
        xor     ax, ax
        pop     si
        pop     cx
        ret
.hit:
        mov     si, si
        sub     si, mem_keys            ; si = index*2
        mov     ax, [mem_vals+si]
        pop     si
        pop     cx
        ret
.selected_in_combat:
        call    selected_in_combat_value
        pop     si
        pop     cx
        ret
.selected_thief_skill:
        call    selected_thief_skill_value
.field:
        pop     si
        pop     cx
        ret

%include "secretselectedfields.inc"

selected_in_combat_value:
        cmp     byte [selected_not_found], 0
        je      .not_missing
        mov     byte [selected_not_found], 0
        xor     ax, ax
        ret
.not_missing:
        cmp     byte [selected_valid], 0
        je      .no_selection
        mov     ax, 1
        ret
.no_selection:
        xor     ax, ax
        ret

selected_thief_skill_value:
        push    bx
        push    dx
        push    si
        mov     [t0], bx
        xor     ax, ax
        cmp     byte [selected_valid], 0
        je      .done
        mov     bx, [selected_party]
        cmp     bx, 0
        je      .done
        dec     bx
        movzx   dx, byte [party_thief_matrix_count]
        cmp     bx, dx
        jae     .done
        shl     bx, 3
        mov     si, party_thief_matrix
        add     si, bx
        mov     bx, [t0]
        sub     bx, 7ca5h
        add     si, bx
        xor     ax, ax
        mov     al, [si]
.done:
        pop     si
        pop     dx
        pop     bx
        ret

; mem_set: BX=addr AX=value
mem_set:
        push    cx
        push    si
        push    ax
        mov     cx, [memcount]
        mov     si, mem_keys
        jcxz    .ins
.l:
        cmp     [si], bx
        je      .upd
        add     si, 2
        loop    .l
.ins:
        mov     si, [memcount]
        cmp     si, MAXMEM
        jae     .full
        shl     si, 1
        mov     [mem_keys+si], bx
        pop     ax
        mov     [mem_vals+si], ax
        inc     word [memcount]
        mov     byte [state_changed], 1
        jmp     .rec
.upd:
        sub     si, mem_keys            ; si = index*2
        pop     ax
        cmp     [mem_vals+si], ax
        je      .same
        mov     byte [state_changed], 1
.same:
        mov     [mem_vals+si], ax
.rec:
        mov     [last_addr], bx
        mov     [last_val], ax
        mov     byte [mem_changed], 1
        pop     si
        pop     cx
        ret
.full:
        mov     byte [vmstat], 4
        mov     byte [flow_stop], 1
        mov     word [halt_reason], HALT_MEM_FULL
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     ax, [ins_off]
        mov     [halt_pc], ax
        movzx   ax, byte [cur_op]
        mov     [halt_opcode], ax
        pop     ax
        pop     si
        pop     cx
        ret

; ============================================================================
;  OPERAND DECODE
;  Operands are read from blk: at [opp]. Each call to read_opp:
;    - reads code (byte), high (byte); for code in {1,2,3,0x81} reads val (byte)
;    - advances [opp]
;    - stores: [o_code], [o_high], [o_word]
;    - for code 0x80: advances [opp] by [o_high] (inline 6-bit string bytes)
; ============================================================================
read_opp:
        mov     si, [opp]
        mov     al, [blk+si]            ; code
        mov     [o_code], al
        mov     ah, [blk+si+1]          ; high
        mov     [o_high], ah
        mov     word [o_text_off], 0
        mov     word [o_text_len], 0
        add     si, 2
        ; default word = high
        movzx   bx, ah
        mov     [o_word], bx
        cmp     al, 1
        je      .three
        cmp     al, 2
        je      .three
        cmp     al, 3
        je      .three
        cmp     al, 0x81                ; string copied from typed memory address
        je      .three
        cmp     al, 0x80
        je      .strskip
        mov     [opp], si
        ret
.three:
        mov     dl, [blk+si]            ; val
        inc     si
        ; word = (val<<8) | high
        mov     bh, dl
        mov     bl, [o_high]
        mov     [o_word], bx
        mov     [opp], si
        ret
.strskip:
        ; inline string: high bytes follow
        movzx   cx, byte [o_high]
        mov     [o_text_off], si
        mov     [o_text_len], cx
        add     si, cx
        mov     [opp], si
        ret

; rvalue of last-read operand -> AX.
;   code 0x00          -> high (immediate)
;   code 0x80          -> high (inline string marker/text slot)
;   code 0x81          -> word (runtime memory-string pointer)
;   code 0x02/0x81    -> word (16-bit immediate / runtime memory-string pointer)
;   code 1/3/0x7F     -> mem[word]
;   default            -> high
opp_rvalue:
        mov     al, [o_code]
        cmp     al, 0x00
        je      .imm
        cmp     al, 0x80
        je      .imm
        cmp     al, 0x81
        je      .wordval
        cmp     al, 0x02
        je      .wordval
        cmp     al, 0x01
        je      .deref
        cmp     al, 0x03
        je      .deref
        cmp     al, 0x7f
        je      .deref
.imm:
        movzx   ax, byte [o_high]
        ret
.wordval:
        mov     ax, [o_word]
        ret
.deref:
        mov     bx, [o_word]
        call    mem_get
        ret

; ============================================================================
;  init_fx_state: initialize the mutable portion of a v9 GBEF record. The
;  serialized image itself is assembled in compbuf after ECL execution.
; ============================================================================
init_fx_state:
        push    ax
        push    cx
        push    di
        xor     ax, ax
        mov     di, fx_state
        mov     cx, FX_PREFIX_LEN/2
        rep     stosw
        mov     di, fx_script_count
        mov     cx, (2 + SCRIPTCAP*SCRIPT_REC_BYTES + SCRIPTCAP*SCRIPT_TEXT_REC_BYTES)/2
        rep     stosw
        mov     di, fx_setup_sprite
        mov     cx, 8                 ; setup and halt value words
        rep     stosw
        mov     word [fx_state], 'GB'
        mov     word [fx_state+2], 'EF'
        mov     word [fx_version], 9
        mov     word [fx_geo], 0ffffh
        mov     word [fx_chain], 0ffffh
        mov     word [fx_halt_area], 0ffffh
        pop     di
        pop     cx
        pop     ax
        ret

; ============================================================================
;  vm_reset_all: once-per-invocation state reset. Container NEWECL chains keep
;  this state across blocks so memory, RNG, and queued native effects survive.
; ============================================================================
vm_reset_all:
        call    init_fx_state
        mov     byte [iy_valid], 0
        mov     dword [rng_state], 0x00001234
        mov     word [memcount], 0
        mov     word [enc_count], 0
        mov     word [npc_count], 0
        mov     word [chain_id], 0ffffh
        mov     word [call_picture_frame], 0
        mov     word [call_event_slot], 0ffffh
        mov     word [fx_flags], 0
        mov     word [fx_status], 0
        ; init_fx_state already sets fx_geo before any alias is written.
        mov     word [fx_files+0], 0
        mov     word [fx_files+2], 0
        mov     word [fx_files+4], 0
        mov     word [fx_piece_raw+0], 0
        mov     word [fx_piece_raw+2], 0
        mov     word [fx_piece_raw+4], 0
        mov     word [fx_piece_set+0], 0
        mov     word [fx_piece_set+2], 0
        mov     word [fx_piece_set+4], 0
        ; init_fx_state already set these prefix cells, and no intervening
        ; instruction writes an alias: fx_chain=FFFF, fx_enc_count=0.
        mov     word [fx_npc_count], 0
        ; init_fx_state already zeroed the script count and its text slots.
        mov     word [fx_setup_sprite], 0
        mov     word [fx_setup_max], 0
        mov     word [fx_setup_pic], 0
        mov     word [fx_setup_dist], 0
        mov     word [fx_halt_reason], 0
        mov     word [fx_halt_pc], 0
        mov     word [fx_halt_opcode], 0
        mov     word [fx_halt_area], 0ffffh
        mov     si, clock_slots
        mov     cx, 7
.clock_clear:
        mov     word [si], 0
        add     si, 2
        loop    .clock_clear
        ; fx_clock_slots aliases clock_slots; the first loop clears both.
        mov     word [halt_reason], HALT_NONE
        mov     word [halt_area], 0ffffh
        mov     word [halt_pc], 0
        mov     word [halt_opcode], 0
        mov     word [bridge_repeat_count], 0
        mov     byte [menu_seen], 0
        mov     byte [ack_pending], 0
        ret

; ============================================================================
;  vm_start_block: per-block VM frame reset. Shared memory/effects stay intact.
; ============================================================================
vm_start_block:
        mov     word [callsp], 0
        mov     word [last_clear_next_pc], 0ffffh
        mov     word [cmp_l], 0
        mov     word [cmp_r], 0
        mov     word [have_sel], 0
        cmp     byte [is_gen2], 2
        je      .selection_preserved
        mov     byte [selected_valid], 0
        mov     word [selected_party], 0
        mov     byte [selected_not_found], 0
.selection_preserved:
        mov     word [chain_id], 0ffffh
        mov     byte [flag_eq], 0
        mov     byte [flag_ne], 0
        mov     byte [flag_lt], 0
        mov     byte [flag_gt], 0
        mov     byte [flag_le], 0
        mov     byte [flag_ge], 0
        mov     byte [mem_changed], 0
        mov     byte [state_changed], 0
        mov     word [bridge_repeat_count], 0
        mov     word [halt_reason], HALT_NONE
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     word [halt_pc], 0
        mov     word [halt_opcode], 0
        mov     byte [flow_stop], 0
        mov     byte [vmstat], 0
        mov     byte [ack_pending], 0
        mov     ax, [hdrlen]
        mov     [pc], ax
        cmp     byte [handler_mode], 0
        je      .handler_seed_done
        cmp     byte [is_gen2], 0
        jne     .handler_gen2
        cmp     byte [handler_mode], 4
        je      .handler_gen1_slot2
        cmp     byte [handler_mode], 3
        je      .handler_gen1_slot3
        cmp     byte [handler_mode], 2
        je      .handler_gen1_vmrun
        mov     ax, [blk+8]             ; Gen1 searchLocation vaddr word
        jmp     .handler_pc
.handler_gen1_vmrun:
        mov     ax, [blk+4]             ; Gen1 vmRun1 vaddr word
        jmp     .handler_pc
.handler_gen1_slot2:
        mov     ax, [blk+12]            ; Gen1 far-pointer slot 2 vaddr word
        jmp     .handler_pc
.handler_gen1_slot3:
        mov     ax, [blk+16]            ; Gen1 far-pointer slot 3 vaddr word
        jmp     .handler_pc
.handler_gen2:
        cmp     byte [handler_mode], 4
        je      .handler_gen2_slot2
        cmp     byte [handler_mode], 3
        je      .handler_gen2_slot3
        cmp     byte [handler_mode], 2
        je      .handler_gen2_vmrun
        mov     ax, [blk+6]             ; Gen2 searchLocation vaddr word
        jmp     .handler_pc
.handler_gen2_vmrun:
        mov     ax, [blk+2]             ; Gen2 vmRun1 vaddr word
        jmp     .handler_pc
.handler_gen2_slot2:
        mov     ax, [blk+10]            ; Gen2 far-pointer slot 2 vaddr word
        jmp     .handler_pc
.handler_gen2_slot3:
        mov     ax, [blk+14]            ; Gen2 far-pointer slot 3 vaddr word
.handler_pc:
        sub     ax, [vbaseval]
        cmp     ax, [hdrlen]
        jb      .handler_done
        cmp     ax, [blklen]
        jae     .handler_done
        mov     [pc], ax
        cmp     byte [is_gen2], 1
        je      .seed_gen2_cell
        mov     bx, 0C04Fh
        mov     ax, [cell_descriptor]
        call    mem_set
        mov     bx, 7F79h
        mov     ax, [cell_descriptor]
        and     ax, 003Fh
        call    mem_set
        mov     bx, 0C04Eh
        mov     ax, [cell_facing]
        shl     ax, 1                  ; Gen1 MapDirection: 0=N,2=E,4=S,6=W
        and     ax, 0006h
        call    mem_set
        jmp     .handler_seed_done
.seed_gen2_cell:
        mov     bx, 002Dh
        mov     ax, [cell_descriptor]
        call    mem_set
        mov     bx, 0011h
        mov     ax, [cell_facing]
        call    mem_set
        mov     bx, 001Bh
        mov     ax, [area_id]
        call    mem_set
.handler_seed_done:
        call    derive_dqk_handler_state
        call    apply_memory_seeds
        cmp     byte [direct_pc_flag], 0
        je      .handler_done
        mov     ax, [direct_pc_vaddr]
        cmp     ax, [vbaseval]
        jb      .handler_done
        sub     ax, [vbaseval]
        cmp     ax, [hdrlen]
        jb      .handler_done
        cmp     ax, [blklen]
        jae     .handler_done
        mov     [pc], ax
.handler_done:
        mov     word [stepc], 0
        ret

derive_dqk_handler_state:
        cmp     byte [is_gen2], 1
        jne     .ret
        cmp     byte [handler_mode], 3
        jne     .ret
        cmp     word [area_id], 5
        jne     .ret
        mov     bx, 00CAh
        call    mem_get
        cmp     ax, 14
        jne     .ret
        mov     bx, 00CBh
        call    mem_get
        cmp     ax, 5
        jne     .ret
        mov     bx, 00CCh
        call    mem_get
        cmp     ax, 00E5h
        jne     .ret
        ; DQK area 5's dragon dispatcher consumes CCECL logical sparse-memory
        ; encounter keys after vmRun1 has selected the 0xE5 table entry. These
        ; keys are not original DQK.EXE DGROUP offsets.
        mov     bx, 0112h
        mov     ax, 16
        call    mem_set
        mov     bx, 00C1h
        mov     ax, 3
        call    mem_set
        mov     bx, 00C2h
        mov     ax, 2
        call    mem_set
.ret:
        ret

apply_memory_seeds:
        push    ax
        push    bx
        push    cx
        push    si
        movzx   cx, byte [memory_seed_count]
        xor     si, si
        jcxz    .done
.loop:
        mov     bx, [memory_seed_keys+si]
        mov     ax, [memory_seed_vals+si]
        call    mem_set
        add     si, 2
        loop    .loop
.done:
        pop     si
        pop     cx
        pop     bx
        pop     ax
        ret

; ============================================================================
;  vm_run: main interpreter loop. PC = byte offset in blk (start = [hdrlen]).
;  Sets [vmstat]: 0 exited, 1 chain, 3 combat, 4 halted, 2 awaiting (not hit here)
; ============================================================================
vm_run:
        call    vm_start_block
vm_run_resume:
.loop:
        inc     word [stepc]
        cmp     word [stepc], 60000     ; safety budget (path is ~16 steps)
        jae     .halt
        mov     ax, [pc]
        cmp     ax, [blklen]
        jae     .exit
        ; decode opcode at pc
        mov     si, ax
        mov     al, [blk+si]
        ; Opcodes 00..40 share the core.  41 is now independently grounded as
        ; a two-operand XP award in Gen1 and a two-operand recorded host effect
        ; in Gen2. Remaining bytes outside that set are undocumented extensions.
        ; Mirror the TS oracle's decodeInstructionAt() "badOpcode" path for
        ; those: halt WITHOUT emitting a trace line (no instruction decoded).
        cmp     al, KNOWN_OP_MAX
        jbe     .known_op
        cmp     al, 041h
        je      .known_op
.check_extended:
        cmp     al, 042h
        je      .known_op
        cmp     al, 043h
        je      .known_op
        cmp     al, 045h
        je      .known_op
        cmp     al, 046h
        je      .known_op
        cmp     al, 04bh
        je      .known_op
        cmp     al, 04ch
        je      .known_op
        cmp     al, 0a1h
        je      .known_op
        jmp     .badop
.known_op:
        mov     [cur_op], al
        mov     byte [mem_changed], 0
        mov     byte [state_changed], 0
        ; The fixed v9 GBSX tail holds exactly SCRIPTCAP host effects.  Do not
        ; decode and execute a recordable instruction once it is full: that
        ; used to consume the instruction and silently lose its host effect.
        ; Halt at its opcode instead so the normal GBEF continuation payload
        ; retains the exact PC, sparse memory, call stack, and RNG state.
        movzx   bx, al
        mov     cl, bl
        shr     bx, 3
        and     cl, 7
        mov     al, 1
        shl     al, cl
        test    byte [script_event_mask+bx], al
        jz      .capacity_ok
        cmp     word [fx_script_count], SCRIPTCAP
        jae     .script_full
.capacity_ok:
        ; record trace pc/op now (so MEM= can append after exec)
        call    exec_one                ; updates [pc]; may set [vmstat] + flow
        ; emit trace line for the instruction that just ran
        call    trace_line
        cmp     byte [state_changed], 0
        je      .no_state_change
        mov     word [bridge_repeat_count], 0
.no_state_change:
        cmp     byte [flow_stop], 0
        jne     .stopped
        jmp     .loop
.script_full:
        mov     word [halt_reason], HALT_SCRIPT_FULL
        mov     ax, [pc]                 ; first unconsumed event instruction
        mov     [halt_pc], ax
        call    halt_at_current
        mov     si, s_script_full
        call    puts
        ret
.badop:
        ; Native map/script preview already owns the bridge once LOAD_FILES or
        ; host-facing script effects have fired. Some retail scripts fall
        ; through or branch into packed data after that handoff; exit cleanly
        ; there while preserving true pre-bridge bad-op diagnostics below.
        test    word [fx_flags], FX_HAVE_FILES
        jnz     .badop_clean
        test    word [fx_flags], FX_HAVE_SCRIPT
        jnz     .badop_clean
        jmp     .badop_halt
.badop_clean:
        mov     byte [vmstat], 0
        mov     word [halt_reason], HALT_NONE
        ret
.badop_halt:
        mov     byte [vmstat], 4
        mov     word [halt_reason], HALT_BAD_OPCODE
        movzx   ax, byte [blk+si]
        mov     [halt_opcode], ax
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     [halt_pc], si
        ret
.exit:
        mov     byte [vmstat], 0
        ret
.halt:
        mov     byte [vmstat], 4
        mov     word [halt_reason], HALT_STEP_BUDGET
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     ax, [pc]
        mov     [halt_pc], ax
        mov     word [halt_opcode], 0ffffh
        cmp     ax, [blklen]
        jae     .halt_ret
        mov     si, ax
        movzx   ax, byte [blk+si]
        mov     [halt_opcode], ax
.halt_ret:
        ret
.stopped:
        ret

; exec_one: execute the instruction at [pc]. Pre: [cur_op] set, [pc]=this op.
;   Sets [opp] = pc+1 for operand reads; computes [pc] = fall-through or branch.
;   Sets [flow_stop]=1 and [vmstat] when the VM yields (exit/chain/combat/halt).
exec_one:
        mov     [field_abort_sp], sp     ; unavailable actor fields abort this whole instruction
        mov     byte [flow_stop], 0
        mov     ax, [pc]
        mov     [ins_off], ax           ; remember this instruction's offset for the trace
        inc     ax
        mov     [opp], ax               ; operands begin after the opcode byte

        mov     al, [cur_op]
        ; dispatch
        cmp     al, 0x00
        je      op_exit
        cmp     al, 0x01
        je      op_goto
        cmp     al, 0x02
        je      op_gosub
        cmp     al, 0x03
        je      op_compare
        cmp     al, 0x04
        je      op_add
        cmp     al, 0x05
        je      op_sub
        cmp     al, 0x06
        je      op_div
        cmp     al, 0x07
        je      op_mul
        cmp     al, 0x08
        je      op_random
        cmp     al, 0x09
        je      op_save
        cmp     al, 0x0a
        je      op_load_character
        cmp     al, 0x0b
        je      op_loadmonster
        cmp     al, 0x0c
        je      op_setup_monster
        cmp     al, 0x0d
        je      op_approach
        cmp     al, 0x0e
        je      op_script_effect
        cmp     al, 0x0f
        je      op_auto_input
        cmp     al, 0x10
        je      op_auto_input
        cmp     al, 0x11
        je      op_script_effect
        cmp     al, 0x12
        je      op_script_effect
        cmp     al, 0x13
        je      op_return
        cmp     al, 0x14
        je      op_compare_and
        cmp     al, 0x15
        je      op_vertical_menu
        cmp     al, 0x16
        jb      op_default
        cmp     al, 0x1b
        jbe     op_if
        cmp     al, 0x1c
        je      op_clearmonsters
        cmp     al, 0x1d
        je      op_partystrength
        cmp     al, 0x1e
        je      op_checkparty
        cmp     al, 0x1f
        je      op_script_effect
        cmp     al, 0x20
        je      op_newecl
        cmp     al, 0x21
        je      op_loadfiles
        cmp     al, 0x22
        je      op_party_surprise
        cmp     al, 0x23
        je      op_surprise
        cmp     al, 0x24
        je      op_combat
        cmp     al, 0x25
        je      op_ongoto
        cmp     al, 0x26
        je      op_ongosub
        cmp     al, 0x27
        je      op_script_effect
        cmp     al, 0x28
        je      op_script_effect
        cmp     al, 0x29
        je      op_encounter_menu
        cmp     al, 0x2a
        je      op_gettable
        cmp     al, 0x2b
        je      op_horizontal_menu
        cmp     al, 0x2c
        je      op_parlay
        cmp     al, 0x2d
        je      op_call
        cmp     al, 0x2e
        je      op_damage
        cmp     al, 0x2f
        je      op_and
        cmp     al, 0x30
        je      op_or
        cmp     al, 0x31
        jne     .not_short_menu
        cmp     byte [is_gen2], 1
        je     op_horizontal_menu
        cmp     byte [short_menu_opframes], 0
        je      op_script_effect
        cmp     byte [interactive_menu], 0
        je      op_script_effect
        jmp     op_horizontal_menu
.not_short_menu:
        cmp     al, 0x32
        je      op_find_item
        cmp     al, 0x33
        je      op_script_effect
        cmp     al, 0x34
        je      op_ecl_clock
        cmp     al, 0x35
        je      op_savetable
        cmp     al, 0x36
        je      op_addnpc
        cmp     al, 0x37
        je      op_loadpieces
        cmp     al, 0x38
        je      op_program
        cmp     al, 0x39
        je      op_who
        cmp     al, 0x3a
        je      op_script_effect
        cmp     al, 0x3b
        je      op_spell
        cmp     al, 0x3c
        je      op_protection
        cmp     al, 0x3d
        je      op_script_effect
        cmp     al, 0x3e
        je      op_dump
        cmp     al, 0x3f
        je      op_find_special
        cmp     al, 0x40
        je      op_destroy_items
        cmp     al, 0x41
        je      op_award_xp
        cmp     al, 0x42
        je      op_buck_ext_zero
        cmp     al, 0x43
        je      op_buck_ext_one
        cmp     al, 0x45
        je      op_buck_ext_two
        cmp     al, 0x46
        je      op_buck_ext_two
        cmp     al, 0x4b
        je      op_buck_ext_zero
        cmp     al, 0x4c
        jne     .not_4c
        cmp     byte [is_matrix], 0
        jne     op_buck_ext_two         ; Matrix's own table frames 0x4C as 2 operands
        jmp     op_buck_ext_zero
.not_4c:
        cmp     al, 0xa1
        je      op_pool_ext_a1
        jmp     op_default

; ---- 0x00 EXIT ----
op_exit:
        mov     byte [vmstat], 0
        mov     byte [flow_stop], 1
        ret

; ---- 0x01 GOTO ----
op_goto:
        call    read_opp                ; a0 = target vaddr
        call    resolve_target          ; AX = byte offset, CF=1 if non-local
        jc      .nonlocal
        mov     [pc], ax
        ret
.nonlocal:
        ; fall through (mirror vm.ts unhandled GOTO(nonlocal))
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x02 GOSUB ----
op_gosub:
        call    read_opp
        call    resolve_target
        jc      .nonlocal
        ; push fall-through (opp) onto call stack
        mov     bx, [callsp]
        cmp     bx, CALLCAP
        jae     .overflow
        mov     dx, [opp]
        shl     bx, 1
        mov     [callstk+bx], dx
        inc     word [callsp]
        mov     [pc], ax
        ret
.nonlocal:
        mov     ax, [opp]
        mov     [pc], ax
        ret
.overflow:
        call    call_stack_full_halt
        ret

; ---- 0x13 RETURN ----
op_return:
        cmp     word [callsp], 0
        je      .empty
        dec     word [callsp]
        mov     bx, [callsp]
        shl     bx, 1
        mov     ax, [callstk+bx]
        mov     [pc], ax
        ret
.empty:
        mov     byte [vmstat], 0
        mov     byte [flow_stop], 1
        ret

; ---- 0x03 COMPARE a,b ----
op_compare:
        call    read_opp
        cmp     byte [o_code], 81h
        jne     .numeric
        mov     ax, [o_word]
        mov     [t0], ax
        call    read_opp
        cmp     byte [o_code], 80h
        jne     .pointer_numeric
        call    compare_runtime_inline
        mov     [cmp_r], ax
        xor     ax, ax
        mov     [cmp_l], ax
        jmp     .set
.pointer_numeric:
        push    word [t0]              ; right-side legacy getters may reuse T0
        call    opp_rvalue
        mov     [cmp_r], ax
        pop     ax
        mov     [cmp_l], ax
        jmp     .set
.numeric:
        call    opp_rvalue
        push    ax                     ; field_abort_sp also unwinds this pending value
        call    read_opp
        call    opp_rvalue
        mov     [cmp_r], ax
        pop     ax
        mov     [cmp_l], ax
.set:
        mov     ax, [cmp_l]
        mov     bx, [cmp_r]
        cmp     byte [is_gen2], 2
        jne     .flags
        ; Secret's original numeric COMPARE helper AC3C uses unsigned words.
        ; Bias only register operands into signed order; saved words stay exact.
        xor     ax, 8000h
        xor     bx, 8000h
.flags:
        call    set_cmp_flags_regs
        mov     ax, [opp]
        mov     [pc], ax
        ret

; Compare a runtime memory string (T0 address) with the just-read inline
; six-bit ECL string. Returns AX=0 for equality, AX=1 otherwise. INPUT_STRING
; stores uppercase bytes and a NUL terminator in the same sparse map, so this
; survives the menu helper's cold continuation without a second string store.
compare_runtime_inline:
        mov     si, [o_text_off]
        add     si, blk
        mov     cx, [o_text_len]
        xor     dx, dx                  ; DL shifted source byte, DH bits left
.char:
        xor     ax, ax
        mov     bp, 6
.bit:
        or      dh, dh
        jnz     .source
        jcxz   .bad
        mov     dl, [si]
        inc     si
        dec     cx
        mov     dh, 8
.source:
        shl     dl, 1
        rcl     al, 1
        dec     dh
        dec     bp
        jnz     .bit
        or      al, al
        jz      .end
        cmp     al, 31
        ja      .ascii
        add     al, 64
.ascii:
        mov     [t1], ax
        mov     bx, [t0]
        call    mem_get
        cmp     ax, [t1]
        jne     .bad
        inc     word [t0]
        jmp     .char
.end:
        mov     bx, [t0]
        call    mem_get
        or      ax, ax
        jnz     .bad
        ret
.bad:
        mov     ax, 1
        ret

; ---- 0x14 COMPARE_AND a,b,c,d ----
op_compare_and:
        call    read_opp
        call    opp_rvalue
        mov     [t0], ax
        call    read_opp
        call    opp_rvalue
        mov     [t1], ax
        call    read_opp
        call    opp_rvalue
        mov     [t2], ax
        call    read_opp
        call    opp_rvalue
        mov     [t3], ax
        ; bothEqual = (t0==t1) && (t2==t3)
        mov     ax, [t0]
        cmp     ax, [t1]
        jne     .ne
        mov     ax, [t2]
        cmp     ax, [t3]
        jne     .ne
        ; EQ
        mov     byte [flag_eq], 1
        mov     byte [flag_ne], 0
        jmp     .zero
.ne:
        mov     byte [flag_eq], 0
        mov     byte [flag_ne], 1
.zero:
        mov     byte [flag_lt], 0
        mov     byte [flag_gt], 0
        mov     byte [flag_le], 0
        mov     byte [flag_ge], 0
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x16..0x1B IF_* ----
op_if:
        ; al = opcode; flag index = opcode-0x16
        mov     bl, al
        sub     bl, 0x16
        movzx   bx, bl
        mov     al, [flag_eq+bx]        ; flags stored contiguously
        or      al, al
        jnz     .pass
        ; skip the guarded instruction: decode its size and advance pc past it
        mov     ax, [opp]               ; opp == pc+1 == start of next instruction
        mov     [pc], ax
        call    skip_one_instruction    ; advances [pc] by the size of next ins
        ret
.pass:
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x09 SAVE value,dest ----
op_save:
        call    read_opp                ; a0 value
        call    opp_rvalue
        mov     [t0], ax
        call    read_opp                ; a1 dest
        mov     bx, [o_word]
        mov     ax, [t0]
        call    mem_set
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x04 ADD / 0x05 SUBTRACT (dest = arg2) ----
op_add:
        call    read_opp
        call    opp_rvalue
        mov     [t0], ax                ; op1
        call    read_opp
        call    opp_rvalue
        mov     [t1], ax                ; op2
        mov     ax, [t0]
        add     ax, [t1]
        mov     [t2], ax
        jmp     arith_store
op_sub:
        call    read_opp
        call    opp_rvalue
        mov     [t0], ax                ; op1
        call    read_opp
        call    opp_rvalue
        mov     [t1], ax                ; op2
        mov     ax, [t1]
        sub     ax, [t0]                ; op2 - op1
        mov     [t2], ax
        jmp     arith_store
op_div:
        call    read_opp
        call    opp_rvalue
        mov     [t0], ax                ; op1
        call    read_opp
        call    opp_rvalue
        mov     [t1], ax                ; op2
        or      ax, ax
        jz      .zero
        mov     ax, [t0]
        xor     dx, dx
        div     word [t1]               ; op1 / op2
        jmp     .have
.zero:
        xor     ax, ax
.have:
        mov     [t2], ax
        jmp     arith_store
op_mul:
        call    read_opp
        call    opp_rvalue
        mov     [t0], ax                ; op1
        call    read_opp
        call    opp_rvalue
        mov     [t1], ax                ; op2
        mov     ax, [t0]
        mul     word [t1]               ; low 16 bits match TS r & 0xffff
        mov     [t2], ax
        jmp     arith_store
op_and:
        call    read_opp
        call    opp_rvalue
        mov     [t0], ax
        call    read_opp
        call    opp_rvalue
        and     ax, [t0]
        mov     [t2], ax
        jmp     logic_store
op_or:
        call    read_opp
        call    opp_rvalue
        mov     [t0], ax
        call    read_opp
        call    opp_rvalue
        or      ax, [t0]
        mov     [t2], ax
        jmp     logic_store
arith_store:
        call    read_opp                ; a2 = dest
        mov     bx, [o_word]
        mov     ax, [t2]
        call    mem_set
        mov     ax, [opp]
        mov     [pc], ax
        ret
logic_store:
        mov     ax, [t2]
        mov     [cmp_l], ax
        mov     word [cmp_r], 0
        call    set_cmp_flags           ; AND/OR also compare result vs 0
        call    read_opp                ; a2 = dest
        mov     bx, [o_word]
        mov     ax, [t2]
        call    mem_set
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x08 RANDOM range,dest ----
%include "cokrng.inc"
op_random:
        call    read_opp                ; range
        call    opp_rvalue
        cmp     byte [use_cokrng], 0
        je      .generic_range
        and     ax, 00ffh
        cmp     al, 255
        je      .range_ok
        inc     ax
        jmp     .range_ok
.generic_range:
        or      ax, ax
        jnz     .range_ok
        mov     ax, 1
.range_ok:
        mov     [t1], ax
        call    read_opp                ; destination address
        mov     ax, [o_word]
        mov     [t0], ax
        mov     eax, [rng_state]
        cmp     byte [use_cokrng], 0
        je      .generic_rng
        movzx   ecx, word [t1]
        call    cr_bounded
        mov     [rng_state], eax
        jmp     .result
.generic_rng:
        imul    eax, eax, 1664525
        add     eax, 1013904223
        mov     [rng_state], eax
        xor     edx, edx
        movzx   ecx, word [t1]
        div     ecx                     ; EDX = random % range
.result:
        mov     bx, [t0]
        mov     ax, dx
        call    mem_set
        mov     ax, [opp]
        mov     [pc], ax
        ret

roll_d6:
        mov     eax, [rng_state]
        cmp     byte [use_cokrng], 1
        jne     .generic              ; Secret mode2 does not change unproven SURPRISE
        mov     ecx, 6
        call    cr_bounded
        mov     [rng_state], eax
        mov     ax, dx
        inc     ax
        ret
.generic:
        imul    eax, eax, 1664525
        add     eax, 1013904223
        mov     [rng_state], eax
        xor     edx, edx
        mov     ecx, 6
        div     ecx
        mov     ax, dx                  ; 0..5
        inc     ax                      ; 1..6
        ret

; ---- 0x0B LOAD_MONSTER id,copies,picBlock ----
op_loadmonster:
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [t0], ax
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        or      ax, ax
        jnz     .count_ok
        mov     ax, 1
.count_ok:
        mov     [t1], ax
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [t2], ax

        call    append_encounter_group_from_t
        mov     ax, [opp]
        mov     [pc], ax
        ret

append_encounter_group_from_t:
        push    ax
        push    bx
        push    dx
        mov     ax, [enc_count]
        cmp     ax, ENCCAP
        jae     .full
        mov     bx, ax
        shl     bx, 1
        mov     dx, bx
        shl     bx, 1
        add     bx, dx                  ; bx = count * 6 bytes
        mov     ax, [t0]
        mov     [fx_enc_groups+bx], ax
        mov     ax, [t1]
        mov     [fx_enc_groups+bx+2], ax
        mov     ax, [t2]
        mov     [fx_enc_groups+bx+4], ax
        inc     word [enc_count]
        or      word [fx_flags], FX_HAVE_ENC
        jmp     .done
.full:
        ; Never yield COMBAT with a prefix of the requested encounter.  A
        ; later group is source-owned combat state, not optional decoration.
        ; Discard every earlier queued group and halt before the host can
        ; launch a smaller battle or publish a result for it.
        mov     word [enc_count], 0
        and     word [fx_flags], 0fff7h
        mov     byte [vmstat], 4
        mov     byte [flow_stop], 1
        mov     word [halt_reason], HALT_ENCOUNTER_FULL
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     ax, [pc]
        mov     [halt_pc], ax
        movzx   ax, byte [cur_op]
        mov     [halt_opcode], ax
        mov     si, s_encounter_full
        call    puts
.done:
        pop     dx
        pop     bx
        pop     ax
        ret

; ---- 0x0C SETUP_MONSTER sprite,max_distance,pic ----
; COAB configures encounter approach art and clamps current distance from the
; map. /D supplies the native host distance seed; the default remains the
; TS/headless value 0. The approach-art operands and current distance are
; preserved in the GBES tail for the renderer bridge.
op_setup_monster:
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [fx_setup_sprite], ax
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [fx_setup_max], ax
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [fx_setup_pic], ax
        ; DoK and DQK pass a fourth setup operand. Its consumer is still
        ; host-owned, but it must be consumed to keep the following opcode
        ; aligned (the TypeScript VM records the same extra value).
        cmp     byte [is_gen2], 1
        je     .read_fourth
        cmp     byte [short_opframes], 0
        je      .frame_done
.read_fourth:
        call    read_opp
        call    opp_rvalue
.frame_done:
        mov     ax, [encounter_distance]
        and     ax, 00ffh
        cmp     ax, [fx_setup_max]
        jbe     .dist_ok
        mov     ax, [fx_setup_max]
.dist_ok:
        mov     [fx_setup_dist], ax
        or      word [fx_flags], FX_HAVE_SETUP
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x0D APPROACH ----
; Decrements active encounter distance in the full engine. The native bridge
; tracks the value only when SETUP_MONSTER has established an encounter setup.
op_approach:
        test    word [fx_flags], FX_HAVE_SETUP
        jz      .done
        cmp     word [fx_setup_dist], 0
        je      .done
        dec     word [fx_setup_dist]
.done:
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x0F/0x10 INPUT_* ----
; INPUT_NUMBER's first operand is unused by the DQK retail handler; operand 2
; is the answer destination. A zero menu count marks a free 16-bit numeric
; reply in the v14 bridge. INPUT_STRING is maxLength,destination and keeps its
; bounded text payload in the existing CCMENU/GBRS path.
op_auto_input:
        call    start_script_event_cur
        cmp     byte [cur_op], 10h
        je      .string_operands
        call    read_opp                ; unused/prompt metadata
        call    record_operand_text
        call    opp_rvalue
        call    append_script_arg_ax
        call    read_opp                ; answer destination
        mov     ax, [o_word]
        mov     [menu_pending_dest], ax
        call    append_script_arg_ax
        cmp     byte [interactive_menu], 0
        je      .headless
        mov     word [menu_pending_count], 0 ; free unsigned 16-bit answer
        call    start_menu_text
        call    finish_script_event
        call    yield_menu
        ret
.string_operands:
        ; Retail INPUT_STRING is maxLength, destination.  The input value is
        ; still scalar in this bounded native path, but it must never overwrite
        ; the source-owned length operand.
        call    read_opp                ; source length cap / metadata
        call    record_operand_text
        call    opp_rvalue
        mov     [menu_pending_count], ax
        call    append_script_arg_ax
        call    read_opp                ; destination
        mov     ax, [o_word]
        mov     [menu_pending_dest], ax
        call    append_script_arg_ax
        mov     ax, [menu_pending_count]
        cmp     byte [interactive_menu], 0
        je      .headless
        or      ax, ax
        jz      .headless
        cmp     ax, 255
        ja      .headless
        cmp     byte [cur_op], 0Fh
        jne     .string_count
        inc     ax
.string_count:
        mov     [menu_pending_count], ax
        call    start_menu_text
        call    finish_script_event
        call    yield_menu
        ret
.headless:
        mov     bx, [menu_pending_dest]
        mov     ax, [input_value]
        call    mem_set
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x15 VERTICAL_MENU dest,prompt,count,+items ----
op_vertical_menu:
        call    start_script_event_cur
        call    start_menu_text
        mov     ax, [pc]                ; stable instruction offset for loop detection
        mov     [menu_pc], ax
        call    read_opp                ; destination/result slot
        mov     bx, [o_word]
        mov     [t1], bx
        mov     [menu_pending_dest], bx
        mov     ax, bx                  ; preserve destination address for host UI
        call    append_script_arg_ax
        call    read_opp                ; prompt string/index
        call    record_operand_text
        call    capture_menu_text
        call    opp_rvalue
        call    append_script_arg_ax
        call    read_opp                ; count
        call    opp_rvalue
        mov     [t0], ax
        call    append_script_arg_ax
        mov     ax, [t0]
        cmp     ax, 1
        jb      .invalid_count
        cmp     ax, 255
        ja      .invalid_count
        mov     [menu_pending_count], ax
.choice:
        cmp     byte [interactive_menu], 0
        jne     .no_choice
        call    clamp_menu_choice
        mov     bx, [t1]
        call    mem_set
.no_choice:
        mov     cx, [t0]
.item:
        jcxz    .items_done
        push    cx
        call    read_opp
        call    record_operand_text
        call    capture_menu_text
        call    opp_rvalue
        call    append_script_arg_ax
        pop     cx
        loop    .item
.items_done:
        call    finish_script_event
        cmp     byte [interactive_menu], 0
        je      .headless
        call    yield_menu
        ret
.headless:
        call    stop_repeated_menu
        mov     ax, [opp]
        mov     [pc], ax
        ret
.invalid_count:
        cmp     byte [interactive_menu], 0
        je      .headless_count
        mov     byte [vmstat], 4
        mov     word [halt_reason], HALT_BAD_OPCODE
        mov     ax, [pc]
        mov     [halt_pc], ax
        movzx   ax, byte [cur_op]
        mov     [halt_opcode], ax
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     byte [flow_stop], 1
        ret
.headless_count:
        mov     [menu_pending_count], ax
        jmp     .choice

; ---- 0x2B HORIZONTAL_MENU / Gen2 0x31 SHORT_MENU dest,count,+items ----
op_horizontal_menu:
        call    start_script_event_cur
        call    start_menu_text
        mov     ax, [pc]                ; stable instruction offset for loop detection
        mov     [menu_pc], ax
        call    read_opp                ; destination/result slot
        mov     bx, [o_word]
        mov     [t1], bx
        mov     [menu_pending_dest], bx
        mov     ax, bx                  ; preserve destination address for host UI
        call    append_script_arg_ax
        call    read_opp                ; count
        call    opp_rvalue
        mov     [t0], ax
        call    append_script_arg_ax
        mov     ax, [t0]
        cmp     ax, 1
        jb      .invalid_count
        cmp     ax, 255
        ja      .invalid_count
        mov     [menu_pending_count], ax
.choice:
        cmp     byte [interactive_menu], 0
        jne     .no_choice
        call    clamp_menu_choice
        mov     bx, [t1]
        call    mem_set
.no_choice:
        mov     cx, [t0]
.item:
        jcxz    .items_done
        push    cx
        call    read_opp
        call    record_operand_text
        call    capture_menu_text
        call    opp_rvalue
        call    append_script_arg_ax
        pop     cx
        loop    .item
.items_done:
        call    finish_script_event
        cmp     byte [interactive_menu], 0
        je      .headless
        call    yield_menu
        ret
.headless:
        call    stop_repeated_menu
        mov     ax, [opp]
        mov     [pc], ax
        ret
.invalid_count:
        cmp     byte [interactive_menu], 0
        je      .headless_count
        mov     byte [vmstat], 4
        mov     word [halt_reason], HALT_BAD_OPCODE
        mov     ax, [pc]
        mov     [halt_pc], ax
        movzx   ax, byte [cur_op]
        mov     [halt_opcode], ax
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     byte [flow_stop], 1
        ret
.headless_count:
        mov     [menu_pending_count], ax
        jmp     .choice

; Both menu variants have fully consumed their operands before reaching here.
; That leaves PC at the first byte after the instruction and allows a cold
; process to resume without replaying the prompt or any preceding effects.
; Start a fixed v14 raw-text payload for one MENU instruction.
start_menu_text:
        push    ax
        push    cx
        push    di
        xor     ax, ax
        mov     di, menu_textbuf
        mov     cx, MENU_TEXT_CAP/2
        rep     stosw
        mov     byte [menu_text_active], 1
        mov     word [menu_text_count], 0
        mov     word [menu_text_used], 0
        mov     byte [menu_text_overflow], 0
        pop     di
        pop     cx
        pop     ax
        ret

; Append the just-read inline packed ECL string as {u8 byteLength, raw bytes}.
; A menu label we cannot represent is a rejected yield, never a truncated one.
capture_menu_text:
        pusha
        cmp     byte [menu_text_active], 0
        je      .ret
        cmp     byte [o_code], 80h
        jne     .bad
        mov     bx, [o_text_len]
        cmp     bx, 255
        ja      .bad
        mov     ax, [menu_text_used]
        inc     bx
        add     ax, bx
        cmp     ax, MENU_TEXT_CAP
        ja      .bad
        mov     di, menu_textbuf
        add     di, [menu_text_used]
        mov     bx, [o_text_len]
        mov     al, bl
        stosb
        mov     si, [o_text_off]
        add     si, blk
        mov     cx, bx
        rep     movsb
        mov     ax, [menu_text_used]
        add     ax, bx
        inc     ax
        mov     [menu_text_used], ax
        inc     word [menu_text_count]
        jmp     .ret
.bad:
        mov     byte [menu_text_overflow], 1
.ret:
        popa
        ret

; Append a static packed-text segment addressed by DS:SI to GBMT. The source
; byte is its packed byte length, followed by that many packed ECL bytes.
append_static_menu_text:
        pusha
        movzx   cx, byte [si]
        mov     bx, cx
        inc     bx
        mov     ax, [menu_text_used]
        add     ax, bx
        cmp     ax, MENU_TEXT_CAP
        ja      .bad
        mov     di, menu_textbuf
        add     di, [menu_text_used]
        mov     ax, cx
        stosb
        inc     si
        rep     movsb
        mov     ax, [menu_text_used]
        add     ax, bx
        mov     [menu_text_used], ax
        inc     word [menu_text_count]
        jmp     .ret
.bad:
        mov     byte [menu_text_overflow], 1
.ret:
        popa
        ret

yield_menu:
        cmp     byte [menu_text_overflow], 0
        jne     .overflow
        ; Every caller finishes exactly one GBSX event before yielding. Record
        ; that just-finished index here rather than duplicating pre-recording
        ; assignments in every menu opcode.
        mov     ax, [fx_script_count]
        dec     ax
        mov     [menu_event_index], ax
        cmp     ax, SCRIPTCAP
        jae     .overflow
        mov     word [menu_pending_opcode], 0
        movzx   ax, byte [cur_op]
        mov     [menu_pending_opcode], ax
        mov     byte [vmstat], 2
        mov     byte [flow_stop], 1
        mov     ax, [opp]
        mov     [pc], ax
        ret
.overflow:
        mov     byte [vmstat], 4
        mov     word [halt_reason], HALT_STEP_BUDGET
        mov     ax, [pc]
        mov     [halt_pc], ax
        movzx   ax, byte [cur_op]
        mov     [halt_opcode], ax
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     byte [flow_stop], 1
        ret

; The native boot responder records menus for a future interactive host, but
; currently supplies a deterministic /C answer and continues.  DQK area 4 is
; observed to return to that exact prompt after completing the selected branch.
; Do not re-run that known headless choice forever: preserve the first branch's
; effects and return the captured state to GBBOOT.  Keep the bound specific to
; the measured area: area 7 revisits an equivalent menu while advancing a valid
; multi-stage route.  Key on the instruction, destination, and actual clamped
; answer so a later area-4 variant cannot trip it accidentally.
stop_repeated_menu:
        push    ax
        push    bx
        cmp     byte [is_gen2], 1
        jne     .ret
        cmp     word [area_id], 4
        jne     .ret
        cmp     byte [menu_seen], 0
        je      .remember
        mov     ax, [menu_pc]
        cmp     ax, [last_menu_pc]
        jne     .remember
        mov     ax, [last_addr]
        cmp     ax, [last_menu_dest]
        jne     .remember
        mov     ax, [last_val]
        cmp     ax, [last_menu_choice]
        jne     .remember
        mov     byte [vmstat], 0
        mov     byte [flow_stop], 1
        jmp     .ret
.remember:
        mov     ax, [menu_pc]
        mov     [last_menu_pc], ax
        mov     ax, [last_addr]
        mov     [last_menu_dest], ax
        mov     ax, [last_val]
        mov     [last_menu_choice], ax
        mov     byte [menu_seen], 1
.ret:
        pop     bx
        pop     ax
        ret

clamp_menu_choice:                      ; t0=count, returns AX=0..count-1
        push    bx
        mov     ax, [menu_choice]
        and     ax, 00ffh
        mov     bx, [t0]
        and     bx, 00ffh
        or      bx, bx
        jz      .zero
        cmp     ax, bx
        jb      .done
        mov     ax, bx
        dec     ax
        jmp     .done
.zero:
        xor     ax, ax
.done:
        pop     bx
        ret

; ---- 0x29 ENCOUNTER_MENU sprite,maxdist,pic,dest,actions[5],texts[3],thresholds[2] ----
; Native headless chooses action slot 0 (COMBAT), or the clamped zero-based /O
; action slot. COAB maps action values 0/1/3/4 for most selected slots to
; script result 1. Action value 2 lets monsters flee when their threshold
; exceeds party max movement. Repeatable /M supplies the current native
; movement list; absent /M keeps the old deterministic max 0. Preserve the
; 14-operand menu shape in GBSX for a later interactive host.
op_encounter_menu:
        cmp     byte [is_gen2], 1
        je      .gen2
        call    maybe_buck_b98_encounter_island
        cmp     al, 0
        je      .normal
        ret
.normal:
        call    start_script_event_cur
        mov     ax, [encounter_choice]
        and     ax, 00ffh
        cmp     ax, 4
        jbe     .choice_ok
        mov     ax, 4
.choice_ok:
        mov     [t3], ax
        call    read_opp                ; sprite block
        call    opp_rvalue
        call    append_script_arg_ax
        call    read_opp                ; max encounter distance
        call    opp_rvalue
        call    append_script_arg_ax
        call    read_opp                ; pic block
        call    opp_rvalue
        call    append_script_arg_ax
        call    read_opp                ; destination
        mov     ax, [o_word]
        mov     [t0], ax
        call    append_script_arg_ax

        call    read_opp                ; action value for COMBAT
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t3], 0
        jne     .not_action0
        and     ax, 00ffh
        mov     [t1], ax
.not_action0:

        call    read_opp                ; WAIT action
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t3], 1
        jne     .not_action1
        and     ax, 00ffh
        mov     [t1], ax
.not_action1:
        call    read_opp                ; FLEE action
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t3], 2
        jne     .not_action2
        and     ax, 00ffh
        mov     [t1], ax
.not_action2:
        call    read_opp                ; ADVANCE action
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t3], 3
        jne     .not_action3
        and     ax, 00ffh
        mov     [t1], ax
.not_action3:
        call    read_opp                ; PARLAY action
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t3], 4
        jne     .not_action4
        and     ax, 00ffh
        mov     [t1], ax
.not_action4:
        call    read_opp                ; text 0
        call    record_operand_text
        call    opp_rvalue
        call    append_script_arg_ax
        call    read_opp                ; text 1
        call    record_operand_text
        call    opp_rvalue
        call    append_script_arg_ax
        call    read_opp                ; text 2
        call    record_operand_text
        call    opp_rvalue
        call    append_script_arg_ax
        call    read_opp                ; flee threshold
        call    opp_rvalue
        call    append_script_arg_ax
        call    read_opp                ; monster-flee threshold
        call    opp_rvalue
        call    append_script_arg_ax
        and     ax, 00ffh
        mov     [t2], ax
        call    maybe_read_buck_b50_encounter_extra

        mov     ax, 1
        cmp     word [t1], 2
        jne     .store
        cmp     word [t2], 0
        je      .store
        xor     bx, bx
        cmp     byte [party_move_count], 0
        je      .cmp_move
        movzx   cx, byte [party_move_count]
        xor     di, di
.max_move_loop:
        mov     ax, [party_moves+di]
        and     ax, 00ffh
        cmp     ax, bx
        jbe     .max_move_next
        mov     bx, ax
.max_move_next:
        add     di, 2
        loop    .max_move_loop
.cmp_move:
        cmp     bx, [t2]
        jae     .combat_value
        xor     ax, ax
        jmp     .store
.combat_value:
        mov     ax, 1
.store:
        mov     bx, [t0]
        call    mem_set
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret
.gen2:
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x2C PARLAY values[5],dest ----
; Headless native chooses attitude index 0 (HAUGHTY) by default, or the clamped
; zero-based /Y seed, and writes the selected response value to the script
; destination. Preserve the attitude mapping in GBSX for a later interactive
; host.
op_parlay:
        call    start_script_event_cur
        mov     ax, [parlay_choice]
        and     ax, 00ffh
        cmp     ax, 4
        jbe     .choice_ok
        mov     ax, 4
.choice_ok:
        mov     [t1], ax
        ; DQK PARLAY has one destination operand (the retail handler's own
        ; prefetch proves this for the complete Gen2 dialect). Do not use the
        ; old long Gen1 six-frame reader here: it consumes real following
        ; opcodes and changes the dragon count.
        cmp     byte [is_gen2], 1
        je     .short
.gen1:
        cmp     byte [short_opframes], 0
        jne     .short

        call    read_opp                ; response value for HAUGHTY
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t1], 0
        jne     .not0
        and     ax, 00ffh
        mov     [t0], ax
.not0:
        call    read_opp                ; SLY value
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t1], 1
        jne     .not1
        and     ax, 00ffh
        mov     [t0], ax
.not1:
        call    read_opp                ; NICE value
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t1], 2
        jne     .not2
        and     ax, 00ffh
        mov     [t0], ax
.not2:
        call    read_opp                ; MEEK value
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t1], 3
        jne     .not3
        and     ax, 00ffh
        mov     [t0], ax
.not3:
        call    read_opp                ; ABUSIVE value
        call    opp_rvalue
        call    append_script_arg_ax
        cmp     word [t1], 4
        jne     .not4
        and     ax, 00ffh
        mov     [t0], ax
.not4:
        call    read_opp                ; destination
        mov     bx, [o_word]
        mov     ax, bx                  ; preserve destination address for host UI
        call    append_script_arg_ax
        cmp     byte [interactive_menu], 0
        je      .headless
        mov     [menu_pending_dest], bx
        mov     word [menu_pending_count], 5
        call    start_menu_text
        mov     word [menu_text_count], 5
        call    finish_script_event
        call    yield_menu
        ret
.headless:
        mov     ax, [t0]
        call    mem_set
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret
.short:
        ; Short-dialect PARLAY carries only its destination; write the raw
        ; clamped attitude index, matching the TypeScript passthrough model.
        call    read_opp
        mov     bx, [o_word]
        mov     ax, bx
        call    append_script_arg_ax
        mov     ax, [t1]
        call    mem_set
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x39 WHO dest ----
op_who:
        call    start_script_event_cur
        call    read_opp
        cmp     byte [is_gen2], 0
        jne     .gen2_who
        mov     bx, [o_word]
        mov     ax, bx                  ; preserve destination address for host UI
        call    append_script_arg_ax
        cmp     byte [interactive_menu], 0
        je      .headless
        mov     ax, [party_count]
        cmp     ax, 1
        jb      .headless
        cmp     ax, PARTY_ROWS_MAX
        ja      .headless
        mov     [menu_pending_dest], bx
        mov     [menu_pending_count], ax
        call    start_menu_text
        call    capture_who_text
        jc      .headless
        call    finish_script_event
        call    yield_menu
        ret
.headless:
        mov     ax, [who_choice]
        and     ax, 00ffh
        call    append_script_arg_ax
        call    mem_set
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

.gen2_who:
        cmp     byte [is_gen2], 2
        je      .secret_who_profile
        cmp     word [roster_expected_id], 4
        jne     .supported_who
        jmp     .unsupported_who        ; HLIB storage retains Gen2 semantics
.secret_who_profile:
        cmp     byte [who_names_valid], 1
        je      .supported_who
.unsupported_who:
        mov     word [halt_reason], HALT_BAD_OPCODE
        call    halt_at_current
        ret
.supported_who:
        ; HLIB WHO carries an inline prompt and updates the selected-party
        ; context. Its operand is prompt length metadata, never a VM address.
        call    record_operand_text
        mov     ax, [o_word]
        call    append_script_arg_ax
        mov     ax, [party_count]
        cmp     ax, 1
        jb      .gen2_headless
        cmp     ax, PARTY_ROWS_MAX
        ja      .gen2_headless
        cmp     byte [interactive_menu], 0
        je      .gen2_headless
        mov     word [menu_pending_dest], 0ffffh
        mov     [menu_pending_count], ax
        call    start_menu_text
        call    capture_menu_text
        jc      .gen2_headless
        call    capture_who_text
        jc      .gen2_headless
        call    finish_script_event
        call    yield_menu
        ret
.gen2_headless:
        cmp     byte [is_gen2], 2
        jne     .diagnostic_choice
        cmp     byte [who_choice_valid], 0
        je      .selection_done
.diagnostic_choice:
        mov     ax, [who_choice]
        and     ax, 00ffh
        call    set_who_party_selection
.selection_done:
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

; WHO selection is zero based in GBMO and one based in the native selected
; member context. An absent roster leaves the context invalid and never writes
; the prompt-length metadata to sparse VM memory.
set_who_party_selection:
        push    bx
        cmp     word [party_count], 1
        jb      .clear
        cmp     word [party_count], PARTY_ROWS_MAX
        ja      .clear
        cmp     ax, [party_count]
        jb      .index_ok
        cmp     byte [is_gen2], 2
        je      .clear
        xor     ax, ax
.index_ok:
        inc     ax
        mov     [selected_party], ax
        mov     byte [selected_valid], 1
        mov     byte [selected_not_found], 0
        jmp     .done
.clear:
        mov     word [selected_party], 0
        mov     byte [selected_valid], 0
        mov     byte [selected_not_found], 0
.done:
        pop     bx
        ret

; GBPR's proven length-prefixed member names follow the optional packed Gen2
; WHO prompt as bounded ASCII segments. CCMENU uses the destination sentinel
; to distinguish the mixed Gen2 prompt/name payload from legacy name-only WHO.
capture_who_text:
        pusha
        mov     cx, [party_count]
        xor     bx, bx
.member:
        jcxz    .ok
        mov     ax, bx
        shl     ax, 4
        mov     si, party_names
        add     si, ax
        mov     dl, [si]
        movzx   ax, dl
        cmp     ax, 1
        jb      .bad
        cmp     ax, 15
        ja      .bad
        mov     di, [menu_text_used]
        inc     ax
        add     ax, di
        cmp     ax, MENU_TEXT_CAP
        ja      .bad
        mov     di, menu_textbuf
        add     di, [menu_text_used]
        mov     al, dl
        stosb
        movzx   ax, dl
        inc     si
        mov     cx, ax
        rep     movsb
        mov     ax, [menu_text_used]
        movzx   dx, dl
        add     ax, dx
        inc     ax
        mov     [menu_text_used], ax
        inc     word [menu_text_count]
        inc     bx
        mov     cx, [party_count]
        sub     cx, bx
        jmp     .member
.ok:
        clc
        jmp     .ret
.bad:
        mov     byte [menu_text_overflow], 1
        stc
.ret:
        popa
        ret

; ---- 0x1E CHECKPARTY query,affect,locA,locB,locC,locD ----
; Optional /A, /M, and /K seeds provide the first native party-query inputs:
;   query 8001 -> locD = party has affect
;   query 009F -> locA/B/C = movement min/max/avg across /M seeds
;   query 00A5..00AC -> locA/B/C = thief skill min/max/avg across /K seeds
; Other queries still use deterministic empty-roster zeros.
op_checkparty:
        call    read_opp                ; query selector
        mov     ax, [o_word]
        cmp     byte [o_code], 1
        je      .query_have
        call    opp_rvalue
.query_have:
        cmp     byte [is_cok], 0
        je      .generic_query
        sub     ax, 7c00h             ; CoK GAME.OVR CHECKPARTY field base
        cmp     ax, 8400h             ; raw selector zero: party affect query
        jne     .query_id
        mov     ax, 1f41h             ; normalize to the existing query branch
        jmp     .query_id
.generic_query:
        sub     ax, 7fffh
.query_id:
        mov     [t0], ax                ; decoded query id
        call    read_opp                ; affect id / unused for stat selectors
        call    opp_rvalue
        and     ax, 00ffh
        mov     [t1], ax                ; affect id

        mov     word [t2], 0            ; locA value
        mov     word [t3], 0            ; locB value
        mov     word [tmptarget], 0     ; locC value
        mov     word [sel_vaddr], 0     ; locD value

        cmp     word [t0], 1f41h        ; decimal 8001, party affect query
        jne     .check_move
        mov     ax, [t1]
        call    seed_has_party_affect
        or      ax, ax
        jz      .values_ready
        mov     word [sel_vaddr], 1
        jmp     .values_ready
.check_move:
        cmp     word [t0], 00a5h        ; first thief-skill query
        jb      .movement_query
        cmp     word [t0], 00ach        ; last thief-skill query
        ja      .movement_query
        cmp     byte [party_thief_matrix_count], 0
        jne     .matrix_thieves
        cmp     byte [party_thief_count], 0
        je      .values_ready
        call    summarize_party_thieves
        jmp     .values_ready
.matrix_thieves:
        call    summarize_party_thief_matrix
        jmp     .values_ready
.movement_query:
        cmp     word [t0], 009fh        ; movement min/max/avg query
        jne     .values_ready
        cmp     byte [party_move_count], 0
        je      .values_ready
        call    summarize_party_moves
.values_ready:
        call    read_opp                ; loc A
        mov     bx, [o_word]
        mov     ax, [t2]
        call    mem_set
        call    read_opp                ; loc B
        mov     bx, [o_word]
        mov     ax, [t3]
        call    mem_set
        call    read_opp                ; loc C
        mov     bx, [o_word]
        mov     ax, [tmptarget]
        call    mem_set
        call    read_opp                ; loc D
        mov     bx, [o_word]
        mov     ax, [sel_vaddr]
        call    mem_set
        mov     ax, [opp]
        mov     [pc], ax
        ret

summarize_party_moves:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        movzx   cx, byte [party_move_count]
        mov     [t1], cx
        xor     si, si
        mov     ax, [party_moves]
        and     ax, 00ffh
        mov     [t2], ax                ; min
        mov     [t3], ax                ; max
        xor     dx, dx                  ; sum
.loop:
        mov     ax, [party_moves+si]
        and     ax, 00ffh
        add     dx, ax
        cmp     ax, [t2]
        jae     .maxchk
        mov     [t2], ax
.maxchk:
        cmp     ax, [t3]
        jbe     .next
        mov     [t3], ax
.next:
        add     si, 2
        loop    .loop
        mov     ax, dx
        xor     dx, dx
        mov     bx, [t1]
        div     bx
        mov     [tmptarget], ax         ; integer average
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

summarize_party_thieves:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        movzx   cx, byte [party_thief_count]
        mov     [t1], cx
        xor     si, si
        mov     ax, [party_thieves]
        and     ax, 00ffh
        mov     [t2], ax                ; min
        mov     [t3], ax                ; max
        xor     dx, dx                  ; sum
.loop:
        mov     ax, [party_thieves+si]
        and     ax, 00ffh
        add     dx, ax
        cmp     ax, [t2]
        jae     .maxchk
        mov     [t2], ax
.maxchk:
        cmp     ax, [t3]
        jbe     .next
        mov     [t3], ax
.next:
        add     si, 2
        loop    .loop
        mov     ax, dx
        xor     dx, dx
        mov     bx, [t1]
        div     bx
        mov     [tmptarget], ax         ; integer average
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

summarize_party_thief_matrix:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        mov     ax, [t0]
        sub     ax, 00a5h
        mov     si, party_thief_matrix
        add     si, ax
        movzx   cx, byte [party_thief_matrix_count]
        mov     [t1], cx
        mov     al, [si]
        xor     ah, ah
        mov     [t2], ax                ; min
        mov     [t3], ax                ; max
        xor     dx, dx                  ; sum
.loop:
        mov     al, [si]
        xor     ah, ah
        add     dx, ax
        cmp     ax, [t2]
        jae     .maxchk
        mov     [t2], ax
.maxchk:
        cmp     ax, [t3]
        jbe     .next
        mov     [t3], ax
.next:
        add     si, PS_THIEF_SKILL_COUNT
        loop    .loop
        mov     ax, dx
        xor     dx, dx
        mov     bx, [t1]
        div     bx
        mov     [tmptarget], ax         ; integer average
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

; ---- 0x0A LOAD_CHARACTER player_index ----
; COAB updates SelectedPlayer when the requested party index exists. /N supplies
; a native 1-based party count for bounds. /U supplies member-scoped affects
; for FIND_SPECIAL; /A remains the party-wide/legacy selected affect fallback.
op_load_character:
        call    read_opp
        call    opp_rvalue
        and     ax, 007fh
        cmp     ax, 0
        je      .missing
        cmp     ax, [party_count]
        ja      .missing
        mov     [selected_party], ax
        mov     byte [selected_valid], 1
        mov     byte [selected_not_found], 0
        jmp     .done
.missing:
        mov     word [selected_party], 0
        mov     byte [selected_valid], 0
        mov     byte [selected_not_found], 1
.done:
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x40 DESTROY_ITEMS item_type ----
; COAB removes every item of this type from every party member. The current
; native seed model has a bounded carried-item type set, so a match removes it.
op_destroy_items:
        cmp     byte [owned_items_valid], 0
        je      .legacy
        ; Original CoK removal also updates equipment and character fields.
        ; Do not mutate only the query bitmap while retaining owned records.
        mov     word [halt_reason], HALT_INVENTORY
        call    iy_prepare
        jnc     .halt
        mov     word [halt_reason], HALT_BAD_OPCODE
.halt:
        mov     byte [vmstat], 4
        mov     byte [flow_stop], 1
        mov     ax, [pc]
        mov     [halt_pc], ax
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     word [halt_opcode], 40h
        cmp     word [halt_reason], HALT_INVENTORY
        jne     .halt_done
        mov     si, s_item_halt
        call    puts
.halt_done:
        ret
.legacy:
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        call    seed_remove_item
.done:
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x41 AWARD_XP party_flag,amount ----
; CoK GAME.OVR:4048 divides amount by the number of positive CCH+0F9h
; records, then adds the zero-extended quotient to CCH+116h as a u32.  A
; nonzero flag walks the party and applies it to every CCH+189h-eligible
; record; a zero flag applies it only to the selected LOAD_CHARACTER member.
; DoK splits each member's award by its own positive class-slot count, updates
; raw +62h XP, and derives +c6h readiness from CCPARTY's validated cache.
op_award_xp:
        ; Read the operands without advancing the generic recorder's cursor.
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        push    bp
        push    ds
        push    es
        mov     ax, [opp]
        push    ax
        call    read_opp
        call    opp_rvalue
        mov     [cok_award_mode], ax
        call    read_opp
        call    opp_rvalue
        mov     [cok_award_amount], ax
        pop     ax
        mov     [opp], ax
        cmp     word [roster_id], GBPR_ID_COK
        je      .cok
        cmp     word [roster_id], GBPR_ID_DOK
        jne     .restore
        call    apply_dok_award_xp
        jmp     .restore
.cok:
        cmp     byte [roster_legacy], 0
        jne     .restore
        call    apply_cok_award_xp
.restore:
        pop     es
        pop     ds
        pop     bp
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        jmp     op_script_effect

; Mutate only GBBOOT's transient CoK GBPR.  The consumer revalidates the
; header before writing, so an independently launched CCECL with a malformed
; /B sidecar records the event but cannot write arbitrary bytes.
apply_cok_award_xp:
        cmp     byte [cok_award_roster_valid], 1
        jne     .ret
        cmp     word [roster_id], GBPR_ID_COK
        jne     .ret
        cmp     byte [roster_legacy], 0
        jne     .ret
        movzx   cx, byte [cok_award_live_count]
        or      cx, cx
        jz      .ret                   ; retail would divide by zero; do not invent a share
        mov     ax, [cok_award_amount]
        xor     dx, dx
        div     cx
        mov     [cok_award_share], ax
        mov     ax, 3D02h
        mov     dx, rostername
        int     21h
        jc      .ret
        mov     [rosterfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, rosterhdr
        int     21h
        jc      .close
        cmp     ax, 16
        jne     .close
        cmp     word [rosterhdr], 'GB'
        jne     .close
        cmp     word [rosterhdr+2], 'PR'
        jne     .close
        mov     ax, [rosterhdr+4]
        cmp     ax, [roster_version]
        jne     .close
        cmp     ax, GBPR_VERSION_V1
        jne     .cok_v2_header
        cmp     word [rosterhdr+10], 0
        jne     .close
        cmp     dword [rosterhdr+12], 0
        jne     .close
        jmp     .cok_header_ok
.cok_v2_header:
        cmp     ax, GBPR_VERSION_V2
        jne     .close
        cmp     word [rosterhdr+12], GBPR_ID_COK
        jne     .close
        cmp     word [rosterhdr+14], 1
        jne     .close
.cok_header_ok:
        cmp     word [rosterhdr+8], GBPR_ENTRY_SIZE
        jne     .close
        cmp     word [rosterhdr+10], 0
        jne     .close
        mov     ax, [rosterhdr+6]
        cmp     ax, [party_count]
        jne     .close
        call    validate_roster_reopen_extent
        jc      .close
        mov     ax, [cok_award_mode]
        or      ax, ax
        jz      .selected
        mov     word [cok_award_index], 0
.party:
        mov     ax, [cok_award_index]
        cmp     ax, [party_count]
        jae     .close
        call    apply_cok_award_current
        inc     word [cok_award_index]
        jmp     .party
.selected:
        cmp     byte [selected_valid], 1
        jne     .close
        mov     ax, [selected_party]
        or      ax, ax
        jz      .close
        dec     ax
        cmp     ax, [party_count]
        jae     .close
        mov     [cok_award_index], ax
        call    apply_cok_award_current
.close:
        mov     bx, [rosterfh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

; Apply the prepared quotient to one zero-based GBPR entry iff its retail
; CCH+189h eligibility byte is nonzero.  I/O failure leaves this event
; recorded but stops further writes; all normal GBBOOT rosters have already
; passed the same structural checks in read_roster_file above.
apply_cok_award_current:
        mov     ax, [cok_award_index]
        mov     bx, GBPR_ENTRY_SIZE
        mul     bx
        add     ax, 16
        mov     [cok_award_entry_off], ax
        add     ax, 1+COK_CCH_XP_ELIGIBLE_OFF
        mov     dx, ax
        xor     cx, cx
        mov     bx, [rosterfh]
        mov     ax, 4200h
        int     21h
        jc      .ret
        mov     bx, [rosterfh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, cok_award_eligible
        int     21h
        jc      .ret
        cmp     ax, 1
        jne     .ret
        cmp     byte [cok_award_eligible], 0
        je      .ret
        mov     ax, [cok_award_entry_off]
        add     ax, 1+COK_CCH_XP_OFF
        mov     [cok_award_xp_off], ax
        mov     dx, ax
        xor     cx, cx
        mov     bx, [rosterfh]
        mov     ax, 4200h
        int     21h
        jc      .ret
        mov     bx, [rosterfh]
        mov     ah, 3Fh
        mov     cx, 4
        mov     dx, cok_award_xp
        int     21h
        jc      .ret
        cmp     ax, 4
        jne     .ret
        mov     ax, [cok_award_share]
        add     [cok_award_xp], ax
        adc     word [cok_award_xp+2], 0
        mov     dx, [cok_award_xp_off]
        xor     cx, cx
        mov     bx, [rosterfh]
        mov     ax, 4200h
        int     21h
        jc      .ret
        mov     bx, [rosterfh]
        mov     ah, 40h
        mov     cx, 4
        mov     dx, cok_award_xp
        int     21h
.ret:
        ret

; Apply DoK's title-local AWARD_XP semantics to a CCPARTY compact roster. The
; cached threshold flag is a capability check: malformed, stale, or manually
; made GBPR files still record opcode 41 but never receive a partial write.
apply_dok_award_xp:
        cmp     word [roster_id], GBPR_ID_DOK
        jne     .ret
        cmp     byte [roster_legacy], 0
        jne     .ret
        mov     ax, 3D02h
        mov     dx, rostername
        int     21h
        jc      .ret
        mov     [rosterfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, rosterhdr
        int     21h
        jc      .close
        cmp     ax, 16
        jne     .close
        cmp     word [rosterhdr], 'GB'
        jne     .close
        cmp     word [rosterhdr+2], 'PR'
        jne     .close
        cmp     word [rosterhdr+4], GBPR_VERSION_V2
        jne     .close
        cmp     word [rosterhdr+12], GBPR_ID_DOK
        jne     .close
        cmp     word [rosterhdr+14], 1
        jne     .close
        cmp     word [rosterhdr+8], GBPR_ENTRY_SIZE
        jne     .close
        cmp     word [rosterhdr+10], GBPR_COMPACT_FLAG
        jne     .close
        mov     ax, [rosterhdr+6]
        cmp     ax, [party_count]
        jne     .close
        call    validate_roster_reopen_extent
        jc      .close
        mov     ax, [cok_award_mode]
        or      ax, ax
        jz      .selected
        mov     word [cok_award_index], 0
.party:
        mov     ax, [cok_award_index]
        cmp     ax, [party_count]
        jae     .close
        call    apply_dok_award_current
        inc     word [cok_award_index]
        jmp     .party
.selected:
        cmp     byte [selected_valid], 1
        jne     .close
        mov     ax, [selected_party]
        or      ax, ax
        jz      .close
        dec     ax
        cmp     ax, [party_count]
        jae     .close
        mov     [cok_award_index], ax
        call    apply_dok_award_current
.close:
        mov     bx, [rosterfh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

; Reopened mutation targets must still have the exact validated extent.
validate_roster_reopen_extent:
        mov     ax, [rosterhdr+6]
        mov     bx, GBPR_ENTRY_SIZE
        mul     bx
        add     ax, 16
        adc     dx, 0
        or      dx, dx
        jnz     .bad
        mov     [roster_expected_len], ax
        mov     bx, [rosterfh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .bad
        or      dx, dx
        jnz     .bad
        cmp     ax, [roster_expected_len]
        jne     .bad
        clc
        ret
.bad:  stc
        ret

; Read one complete compact entry, validate its GBD1 threshold capability,
; apply the member-local split, and write only the bytes that were inspected.
apply_dok_award_current:
        mov     ax, [cok_award_index]
        mov     bx, GBPR_ENTRY_SIZE
        mul     bx
        add     ax, 16
        mov     [cok_award_entry_off], ax
        mov     dx, ax
        xor     cx, cx
        mov     bx, [rosterfh]
        mov     ax, 4200h
        int     21h
        jc      .ret
        mov     bx, [rosterfh]
        mov     ah, 3Fh
        mov     cx, 277                 ; slot + raw 216 + GBD1 through cached u32s
        mov     dx, rosterbuf
        int     21h
        jc      .ret
        cmp     ax, 277
        jne     .ret
        mov     al, [rosterbuf+1]
        cmp     al, 1
        jb      .ret
        cmp     al, 15
        ja      .ret
        cmp     word [rosterbuf+1+GBPR_DOK_META_OFF], 'GB'
        jne     .ret
        cmp     word [rosterbuf+1+GBPR_DOK_META_OFF+2], 'D1'
        jne     .ret
        mov     ax, [rosterbuf+1+GBPR_DOK_META_FLAGS]
        and     ax, GBPR_COMPACT_FLAG+GBPR_DOK_XP_CACHE_FLAG
        cmp     ax, GBPR_COMPACT_FLAG+GBPR_DOK_XP_CACHE_FLAG
        jne     .ret
        mov     si, rosterbuf+1+DOK_CHAR_LEVELS_OFF
        xor     bx, bx
        mov     cx, 8
.count:
        cmp     byte [si], 0
        je      .next
        inc     bx
.next:
        inc     si
        loop    .count
        or      bx, bx
        jz      .ret                   ; retail division would have no divisor
        mov     ax, [cok_award_amount]
        xor     dx, dx
        div     bx
        add     [rosterbuf+1+DOK_CHAR_XP_OFF], ax
        adc     word [rosterbuf+1+DOK_CHAR_XP_OFF+2], 0
        mov     byte [rosterbuf+1+DOK_CHAR_READY_OFF], 0
        mov     si, rosterbuf+1+GBPR_DOK_XP_THRESH_OFF
        mov     cx, 8
.ready:
        mov     bx, [si]
        mov     dx, [si+2]
        or      bx, dx
        jz      .next_threshold
        cmp     dx, [rosterbuf+1+DOK_CHAR_XP_OFF+2]
        ja      .next_threshold
        jb      .set_ready
        cmp     bx, [rosterbuf+1+DOK_CHAR_XP_OFF]
        ja      .next_threshold
.set_ready:
        mov     byte [rosterbuf+1+DOK_CHAR_READY_OFF], 1
        jmp     .write
.next_threshold:
        add     si, 4
        loop    .ready
.write:
        mov     dx, [cok_award_entry_off]
        xor     cx, cx
        mov     bx, [rosterfh]
        mov     ax, 4200h
        int     21h
        jc      .ret
        mov     bx, [rosterfh]
        mov     ah, 40h
        mov     cx, 277
        mov     dx, rosterbuf
        int     21h
.ret:
        ret

; ---- 0x38 PROGRAM program_id ----
; Host-engine routine dispatch. PROGRAM #0 is CoK's StartGameMenu path; the
; clean-room/native headless VM does not call DOS GAME.OVR copy-protection code,
; so preserve the dispatch for the bridge and keep control flow deterministic.
op_program:
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [program_id], ax
        call    record_program_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x2D CALL raw_operand ----
; COAB Gen1 computes a routine id from the raw operand word: (word - 0x7fff).
; Real DQK Gen2 ECL.GLB also uses low raw words (0001/0002) as direct CALL ids
; for the same duel setup routines, while high/vaddr-style operands keep the
; Gen1 subtraction rule. Every routine is recorded as a bridge-visible event
; with the raw operand word plus the dialect-adjusted routine id.
;
; The two grounded ids below add their data as EXTRA OPERANDS on that same
; event rather than as events of their own, so the trace keeps its
; one-instruction-one-event invariant and no `GBSX count` or `#NN OP=` index
; pin in the flow suite shifts. See extend_call_event_redraw for what an
; earlier append-a-second-event revision cost.
;
; THREE of the eight named ids now get genuinely distinct native handling,
; ground-truthed against COAB's decompiled Gen1 `CMD_Call` switch
; (coab_extracted/engine/ovr003.cs, `case 0xAE11` / `case 0xE804` — COAB is
; this project's shared Gen1 engine reference, applicable to CoK/DoK alike):
;
;   0xAE11 / 0xADCC "redraw dungeon view" — CoK's and DoK's respective
;   retail CALL dispatchers use these ids for the same first switch arm. DoK's
;   own GAME.OVR at 0x2ab1 has the homologous dispatcher: its 0xADCC compare
;   directly calls its view routine, while the following 0x3204/0x401F/0x4019/
;   0xE804 arms retain CoK's order. The real routine unconditionally reads the
;   CURRENT dungeon position (gbl.mapPosY, gbl.mapPosX) via get_wall_x2 before
;   its conditional bigpic/wall-type refresh. CCECL has no GEO wall grid
;   loaded (this .COM takes none), so the wall/roof id itself is NOT
;   computed and NOT claimed — that half of the routine is out of reach here.
;   What IS reproduced, faithfully and without invention, is the routine's
;   own documented input: it snapshots the position/facing sparse-memory
;   cells (0xc04b/0xc04c/0xc04d — the same Gen1 default addresses
;   apps/web/src/ui/demoGen1.ts already uses for this exact routine's pose
;   capture) as three EXTRA OPERANDS on this instruction's own CALL
;   trace event, widening it from ARGC=02 to ARGC=05.
;
;   0xE804 "advance animated picture" — the real routine calls
;   gbl.byte_1D556.NextFrame(), whose own body
;   (coab_extracted/Classes/DaxFiles/DaxArray.cs) is
;   `curFrame++; if (curFrame > numFrames) curFrame = 1;`. CCECL does not
;   track a loaded picture's numFrames (PICTURE is still one of
;   op_script_effect's placeholder-recorded opcodes — a separate, documented
;   gap), so the wrap-to-1 half cannot be reproduced without inventing a
;   frame count and is deliberately NOT modeled. What IS reproduced is the
;   unconditional half: a persistent frame counter increments by exactly
;   one per CALL and is surfaced as one EXTRA OPERAND on this
;   instruction's own CALL trace event, widening it from ARGC=02
;   to ARGC=03.
;
; The other five named ids (SetupDuel x2, contextual sound, MovePosition-
; Forward, refresh outdoor wall type) are UNGROUNDED here — grounding them
; would need combat-duel state, sound-channel state, and outdoor wall-type
; state this VM does not own either — and keep falling through to the
; original vacuous `.known:` tail (record + advance pc, nothing else),
; exactly as before. This is a partial, honestly-scoped fix, not a claim
; that CALL is now fully applied.
op_call:
        call    read_opp
        mov     ax, [o_word]
        mov     [call_raw_word], ax
        cmp     byte [is_gen2], 1
        jne      .coab_id
        test    ax, 8000h
        jz      .have_id
.coab_id:
        sub     ax, 7fffh
.have_id:
        mov     [call_routine_id], ax
        cmp     ax, 0ae11h              ; redraw dungeon view
        je      .known
        cmp     ax, 0adcch              ; DoK redraw dungeon view
        je      .known
        cmp     ax, 0001h               ; SetupDuel(true)
        je      .known
        cmp     ax, 0002h               ; SetupDuel(false)
        je      .known
        cmp     ax, 3201h               ; contextual sound
        je      .known
        cmp     ax, 401fh               ; MovePositionForward
        je      .known
        cmp     ax, 4019h               ; refresh outdoor wall type
        je      .known
        cmp     ax, 0e804h              ; advance animated picture
        je      .known

        call    record_call_event
        mov     ax, [opp]
        mov     [pc], ax
        ret
.known:
        call    record_call_event
        mov     ax, [call_routine_id]
        cmp     ax, 0ae11h
        je      .redraw_dungeon_view
        cmp     ax, 0adcch
        je      .redraw_dungeon_view
        cmp     ax, 0e804h
        je      .advance_animated_picture
        mov     ax, [opp]
        mov     [pc], ax
        ret
.redraw_dungeon_view:
        mov     bx, 0c04bh              ; MAP_X_ADDR (demoGen1.ts default)
        call    mem_get
        mov     [call_redraw_x], ax
        mov     bx, 0c04ch              ; MAP_Y_ADDR
        call    mem_get
        mov     [call_redraw_y], ax
        mov     bx, 0c04dh              ; MAP_DIRECTION_ADDR
        call    mem_get
        mov     [call_redraw_facing], ax
        call    extend_call_event_redraw
        mov     ax, [opp]
        mov     [pc], ax
        ret
.advance_animated_picture:
        inc     word [call_picture_frame]
        call    extend_call_event_picture
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x34 ECL_CLOCK time_step,time_slot ----
; COAB calls step_game_time(time_slot, time_step). Native headless CCECL keeps
; the same seven mixed-radix slots the TS VM models, persists them in GBCL, and
; still preserves the resolved operands in GBSX for transcript fidelity.
op_ecl_clock:
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [t0], ax
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [t1], ax
        cmp     ax, 6
        ja      .record
        cmp     byte [is_cok], 0
        je      .lunar_ready
        mov     bx, ax
        mov     si, clock_slots
        mov     ax, [t0]
        call    lunar_plan
        jc      .lunar_halt
.lunar_ready:
        mov     cx, [t1]
        mov     ax, [t0]
.timer_units:
        cmp     cx, 1
        jbe     .timer_advance
        dec     cx
        mov     bx, cx
        shl     bx, 1
        mul     word [clock_radices+bx]
        jmp     .timer_units
.timer_advance:
        call    advance_owned_timers
        jc      .timer_halt
.record:
        call    record_clock_event
        cmp     word [t1], 6
        ja      .done
        mov     bx, [t1]
        shl     bx, 1
        mov     ax, [clock_slots+bx]
        add     ax, [t0]
        mov     [clock_slots+bx], ax
        call    normalize_clock
        cmp     byte [is_cok], 0
        je      .clock_ready
        call    lunar_apply
        cmp     word [lunar_days], 0
        je      .clock_ready
        mov     byte [state_changed], 1
.clock_ready:
        or      word [fx_flags], FX_HAVE_CLOCK
.done:
        mov     ax, [opp]
        mov     [pc], ax
        ret
.lunar_halt:
        mov     word [halt_reason], HALT_MEM_FULL
        jmp     .clock_halt
.timer_halt:
        mov     word [halt_reason], HALT_TIMER
.clock_halt:
        mov     byte [vmstat], 4
        mov     byte [flow_stop], 1
        mov     ax, [pc]
        mov     [halt_pc], ax
        mov     ax, [area_id]
        mov     [halt_area], ax
        mov     word [halt_opcode], 34h
        ret

advance_owned_timers:
        mov     [timer_elapsed], ax
        pusha
        cmp     word [timer_state], 1
        jne     .done
        mov     cx, [timer_count]
        mov     si, timer_records
.check:
        jcxz    .apply
        mov     ax, [si+2]
        test    ax, ax
        jz      .checked
        cmp     ax, [timer_elapsed]
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
.apply:
        mov     cx, [timer_count]
        mov     si, timer_records
        mov     di, si
.record:
        jcxz    .compact_done
        mov     ax, [si+2]
        test    ax, ax
        jz      .keep
        cmp     ax, [timer_elapsed]
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
        shl     ax, 1
        mov     bx, ax
        inc     word [timer_ages+bx]
.removed:
        add     si, 10
        jmp     .next
.decrement:
        sub     ax, [timer_elapsed]
        mov     [si+2], ax
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
        mov     di, owned_affect_matrix
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
        bts     word [owned_affect_matrix+bx], ax
.next_bit:
        add     si, 10
        loop    .bits
.done:
        popa
        clc
        ret
.blocked:
        popa
        stc
        ret

; GBPS v5 is a per-invocation timer exchange. Update only ownership and timers;
; GBBOOT consumes age deltas and rewrites a zero-delta input before another VM.
write_timer_seed:
        cmp     word [timer_state], 1
        jne     .ok
        mov     dx, seedname
        mov     ax, 3D02h
        int     21h
        jc      .bad
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, PS_V3_LEN
        int     21h
        jc      .close_bad
        mov     dx, owned_affect_flags
        mov     cx, 258
        call    .chunk
        jc      .close_bad
        mov     dx, timer_state
        mov     cx, TIMER_STATE_LEN+16
        call    .chunk
        jc      .close_bad
        mov     ah, 3Eh
        int     21h
        ret
.chunk:
        mov     ah, 40h
        int     21h
        jc      .bad
        cmp     ax, cx
        jne     .bad
.ok:
        clc
        ret
.close_bad:
        mov     ah, 3Eh
        int     21h
.bad:
        stc
        ret


; CoK GAME.OVR 2A87C: three phase/counter pairs, updated on EACH hour carry.
; The sparse-memory plan is read-only; apply runs only after all tick preflights.
LUNAR_COUNT equ memcount
LUNAR_KEYS equ mem_keys
LUNAR_VALS equ mem_vals
lunar_plan:                         ; SI=seven clock words, AX=step, BX=slot
        pusha
        mov     dx, ax
        mov     di, lunar_clock
        mov     cx, 4
        push    es
        push    ds
        pop     es
        rep     movsw
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
        add     di, [LUNAR_COUNT]
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
        mov     cx, [LUNAR_COUNT]
        xor     si, si
.loop:
        jcxz    .missing
        cmp     [LUNAR_KEYS+si], bx
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
        mov     [LUNAR_KEYS+si], bx
        mov     word [LUNAR_VALS+si], 0
        inc     word [LUNAR_COUNT]
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
        mov     ax, [LUNAR_VALS+si]
        cmp     ax, [lunar_thresholds+di]
        jb      .increment
        mov     word [LUNAR_VALS+si], 0
        mov     si, [lunar_indices+di]
        cmp     word [LUNAR_VALS+si], 3
        jb      .increment
        mov     word [LUNAR_VALS+si], 0
        jmp     .next
.increment:
        inc     word [LUNAR_VALS+si]
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

normalize_clock:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        xor     si, si
.loop:
        cmp     si, 12
        jae     .year
        mov     ax, [clock_slots+si]
        xor     dx, dx
        mov     bx, [clock_radices+si]
        div     bx
        mov     [clock_slots+si], dx
        add     [clock_slots+si+2], ax
        add     si, 2
        jmp     .loop
.year:
        mov     ax, [clock_slots+12]
        xor     dx, dx
        mov     bx, 256
        div     bx
        mov     [clock_slots+12], dx
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

; ---- 0x3C PROTECTION arg ----
; The CoK ECL corpus does not use this opcode for its copy protection; that
; check lives behind PROGRAM #0 in GAME.OVR. Treat it as a clean-room no-op.
op_protection:
        call    read_opp
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x3E DUMP ----
; Retail/debug diagnostic with no game-state effect in the clean-room VM.
op_dump:
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x32 FIND_ITEM item_type ----
; COAB CMD_FindItem searches the party inventory and sets only EQ/NE.
; Repeatable /I supplies carried item types until a full inventory loader exists.
op_find_item:
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        call    seed_has_item
        or      ax, ax
        jz      .not_found
        mov     ax, 1
        jmp     .flags
.not_found:
        xor     ax, ax
.flags:
        call    set_bool_flags          ; not found
        mov     ax, [opp]
        mov     [pc], ax
        ret

seed_has_item:                         ; AX low byte = item id, returns AX=1/0
        cmp     byte [owned_items_valid], 0
        je      .legacy
        and     ax, 00ffh
        push    bx
        mov     bx, ax
        bt      word [owned_item_bits], bx
        mov     ax, 0
        adc     ax, 0
        pop     bx
        ret
.legacy:
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        mov     [t0], ax
        movzx   cx, byte [party_item_count]
        xor     di, di
.loop:
        cmp     cx, 0
        je      .miss
        mov     bx, [party_items+di]
        and     bx, 00ffh
        cmp     bx, [t0]
        je      .hit
        add     di, 2
        dec     cx
        jmp     .loop
.hit:
        mov     ax, 1
        jmp     .done
.miss:
        xor     ax, ax
.done:
        pop     di
        pop     cx
        pop     bx
        ret

seed_remove_item:                      ; AX low byte = item id
        push    ax
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        mov     [t0], ax
        movzx   cx, byte [party_item_count]
        xor     di, di
.loop:
        cmp     cx, 0
        je      .done
        mov     bx, [party_items+di]
        and     bx, 00ffh
        cmp     bx, [t0]
        je      .remove
        add     di, 2
        dec     cx
        jmp     .loop
.remove:
        dec     byte [party_item_count]
        movzx   bx, byte [party_item_count]
        shl     bx, 1
        mov     ax, [party_items+bx]
        mov     [party_items+di], ax
.done:
        pop     di
        pop     cx
        pop     bx
        pop     ax
        ret

; ---- 0x3F FIND_SPECIAL affect_id ----
; COAB CMD_FindSpecial checks the selected player's affects and sets only
; EQ/NE. Repeatable /U supplies member-scoped affects selected by
; LOAD_CHARACTER; repeatable /A remains the party-wide/legacy selected fallback.
op_find_special:
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        call    seed_has_selected_affect
        or      ax, ax
        jz      .not_found
        mov     ax, 1
        jmp     .flags
.not_found:
        xor     ax, ax
.flags:
        call    set_bool_flags          ; not found
        mov     ax, [opp]
        mov     [pc], ax
        ret

seed_has_selected_affect:              ; AX low byte = affect id, returns AX=1/0
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        mov     [t0], ax
        cmp     byte [selected_valid], 0
        je      .party_scan
        movzx   cx, byte [party_member_affect_count]
        xor     di, di
.member_loop:
        cmp     cx, 0
        je      .party_scan
        mov     bx, [party_member_affects+di]
        and     bx, 00ffh
        cmp     bx, [t0]
        jne     .member_next
        mov     bx, [party_member_affects+di+2]
        cmp     bx, [selected_party]
        je      .hit
.member_next:
        add     di, 4
        dec     cx
        jmp     .member_loop
.party_scan:
        cmp     byte [selected_valid], 0
        je      .unselected_party
        mov     bx, [selected_party]
        dec     bx
        cmp     bx, 7
        ja      .legacy_party
        shl     bx, 5
        cmp     word [owned_affect_flags], 1
        jne     .legacy_party
        mov     ax, [t0]
        bt      word [owned_affect_matrix+bx], ax
        jc      .hit
.legacy_party:
        mov     ax, [t0]
        ; Explicit /A is global. Imported ownership must never fall back to
        ; another member's union when a selected member lacks this effect.
        call    seed_has_legacy_affect
        jmp     .done
.unselected_party:
        mov     ax, [t0]
        call    seed_has_party_affect
        jmp     .done
.hit:
        mov     ax, 1
.done:
        pop     di
        pop     cx
        pop     bx
        ret

seed_has_party_affect:                 ; AX low byte = party-wide affect id, returns AX=1/0
        push    bx
        and     ax, 00ffh
        cmp     word [owned_affect_flags], 1
        jne     .legacy
        xor     bx, bx
.owned:
        bt      word [owned_affect_matrix+bx], ax
        jc      .found
        add     bx, 32
        cmp     bx, 256
        jb      .owned
.legacy:
        pop     bx
        jmp     seed_has_legacy_affect
.found:
        pop     bx
        mov     ax, 1
        ret

seed_has_legacy_affect:
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        mov     [t0], ax
        movzx   cx, byte [party_affect_count]
        xor     di, di
.loop:
        cmp     cx, 0
        je      .miss
        mov     bx, [party_affects+di]
        and     bx, 00ffh
        cmp     bx, [t0]
        je      .hit
        add     di, 2
        dec     cx
        jmp     .loop
.hit:
        mov     ax, 1
        jmp     .done
.miss:
        xor     ax, ax
.done:
        pop     di
        pop     cx
        pop     bx
        ret

; ---- 0x3B SPELL spell_id,slot_dest,player_dest ----
; COAB scans party spell lists and writes a 1-based spell slot plus 0-based
; party index. Repeatable /V supplies explicit member-scoped spell slots;
; repeatable /S remains the legacy member-0 fallback list. /N supplies the
; synthetic roster length for an absent spell's last-scanned player index.
op_spell:
        call    read_opp                ; spell id
        call    opp_rvalue
        and     ax, 00ffh
        mov     [t0], ax
        call    read_opp                ; slot destination
        mov     bx, [o_word]
        mov     [tmptarget], bx
        mov     word [t1], 00ffh        ; slot result
        mov     word [t2], 00ffh        ; player result
        ; Explicit /S and /V retain their legacy synthetic conventions. CoK
        ; GBPR queries use the retail raw queue and its zero-based slot index.
        cmp     byte [party_member_spell_count], 0
        jne     .have_spell_seed
        cmp     byte [party_spell_count], 0
        jne     .have_spell_seed
        cmp     byte [cok_spells_valid], 0
        je      .store_slot
        call    find_cok_roster_spell
        mov     [t1], ax
        mov     [t2], bx
        jmp     .store_slot
.have_spell_seed:
        mov     ax, [party_count]
        or      ax, ax
        jz      .one_spell_member
        dec     ax
        and     ax, 00ffh
        mov     [t2], ax                ; absent => last scanned roster member
        jmp     .find_member
.one_spell_member:
        mov     word [t2], 0
.find_member:
        cmp     byte [party_member_spell_count], 0
        je      .find_legacy
        mov     ax, [t0]
        call    seed_find_member_spell
        or      ax, ax
        jz      .find_legacy
        mov     [t1], ax
        mov     [t2], bx
        jmp     .store_slot
.find_legacy:
        cmp     byte [party_spell_count], 0
        je      .store_slot
        mov     ax, [t0]
        call    seed_find_spell
        or      ax, ax
        jz      .store_slot
        mov     [t1], ax
        mov     word [t2], 0            ; /S is a member-0 synthetic list
.store_slot:
        mov     ax, [t1]
        mov     bx, [tmptarget]
        call    mem_set
        call    read_opp                ; player-index destination
        mov     bx, [o_word]
        mov     ax, [t2]
        call    mem_set
        mov     ax, [opp]
        mov     [pc], ax
        ret

; Retail CoK SPELL at GAME.OVR 3AF7 scans all 58 raw slots, preserving holes,
; duplicates and pending high bits. Slot miss=FF, player=last scanned (or 0).
find_cok_roster_spell:
        xor     bx, bx
        mov     si, cok_spell_rows
        mov     cx, [cok_spell_count]
.member:
        jcxz    .miss
        xor     dx, dx
.slot:
        lodsb
        cmp     al, [t0]
        je      .found
        inc     dx
        cmp     dx, 58
        jb      .slot
        dec     cx
        jz      .miss
        inc     bx
        jmp     .member
.found:
        mov     ax, dx
        ret
.miss:
        mov     ax, 00FFh
        ret

seed_find_spell:                       ; AX low byte = spell id, returns slot 1..N or 0
        push    bx
        push    cx
        push    di
        push    dx
        and     ax, 00ffh
        mov     [t0], ax
        movzx   cx, byte [party_spell_count]
        xor     di, di
        mov     dx, 1
.loop:
        cmp     cx, 0
        je      .miss
        mov     bx, [party_spells+di]
        and     bx, 00ffh
        cmp     bx, [t0]
        je      .hit
        add     di, 2
        inc     dx
        dec     cx
        jmp     .loop
.hit:
        mov     ax, dx
        jmp     .done
.miss:
        xor     ax, ax
.done:
        pop     dx
        pop     di
        pop     cx
        pop     bx
        ret

seed_find_member_spell:                ; AX low byte = spell id, returns AX=slot or 0, BX=0-based member
        push    cx
        push    di
        push    dx
        and     ax, 00ffh
        mov     [t0], ax
        movzx   cx, byte [party_member_spell_count]
        xor     di, di
.loop:
        cmp     cx, 0
        je      .miss
        mov     bx, [party_member_spells+di]
        and     bx, 00ffh
        cmp     bx, [t0]
        je      .hit
        add     di, 6
        dec     cx
        jmp     .loop
.hit:
        mov     ax, [party_member_spells+di+4]
        mov     bx, [party_member_spells+di+2]
        dec     bx
        and     bx, 00ffh
        jmp     .done
.miss:
        xor     ax, ax
.done:
        pop     dx
        pop     di
        pop     cx
        ret

; ---- 0x20 NEWECL #id ----
op_newecl:
        call    read_opp
        call    opp_rvalue
        mov     [chain_id], ax
        mov     byte [vmstat], 1
        mov     byte [flow_stop], 1
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x21 LOAD_FILES (Gen1 a,b,c; Gen2 a,b) ----
op_loadfiles:
        call    read_opp
        call    opp_rvalue
        mov     [t0], ax
        call    read_opp
        call    opp_rvalue
        mov     [t1], ax
        mov     word [t2], 0
        mov     al, [is_gen2]
        and     al, 1                   ; enum2 uses the long opcode frame
        or      al, [short2_frames]
        jnz     .operands_done
        call    read_opp
        call    opp_rvalue
        mov     [t2], ax
.operands_done:
        call    note_loadfiles_repeat
        mov     ax, [t0]
        mov     [fx_geo], ax
        mov     [fx_files+0], ax
        mov     ax, [t1]
        mov     [fx_files+2], ax
        mov     ax, [t2]
        ; DQK LOAD_FILES operand 2 updates persistent combat context DS:CA03.
        ; Keep raw operand 2 above and use Gen2's unused third prefix word for
        ; tagged context state (0xD0xx). FF must bypass the store entirely;
        ; Gen1 still stores its raw third operand, including zero and FF.
        cmp     byte [is_gen2], 1
        jne     .store_context
        cmp     byte [is_dok], 1
        je      .store_context
        mov     al, [t1]
        cmp     al, 0ffh
        je      .context_done
        mov     ah, 0d0h
.store_context:
        mov     [fx_files+4], ax
.context_done:
        or      word [fx_flags], FX_HAVE_FILES
        mov     ax, [opp]
        mov     [pc], ax
        call    maybe_stop_stable_bridge
        ret

; ---- 0x1D Secret byte-metric destination store; other legacy title models ----
op_partystrength:
        cmp     byte [is_gen2], 2
        jne     .other_title
        call    start_script_event_cur
        call    read_opp
        mov     bx, [o_word]
        mov     ax, bx
        call    append_script_arg_ax
        mov     ax, [party_strength]
        and     ax, 00ffh              ; original stores the unsigned byte sum
        call    mem_set
        jmp     .finish
.other_title:
        cmp     byte [is_dok], 1
        jne     .legacy
        call    start_script_event_cur
        call    finish_script_event
        mov     ax, [fx_script_count]
        dec     ax
        mov     [menu_event_index], ax
        mov     word [menu_pending_dest], 0ffffh
        mov     word [menu_pending_count], 1
        mov     word [menu_pending_opcode], 001dh
        mov     byte [ack_pending], 1
        mov     byte [vmstat], 2
        mov     byte [flow_stop], 1
        mov     ax, [opp]
        mov     [pc], ax
        ret
.legacy:
        call    start_script_event_cur
        mov     ax, [party_strength]
        call    append_script_arg_ax
        ; DQK's measured frame fetches no operand in every Gen2 area. DoK also
        ; uses a zero-operand frame, but retail DoK 1Dh is a continue prompt
        ; with input and screen cleanup, not this comparison. CoAB's long-frame
        ; command writes computed strength to operand memory. Keep this handler
        ; as an explicitly incomplete legacy model until title dispatch/yield
        ; replaces it; its zero-threshold branches still mutate cmp flags.
        cmp     byte [is_gen2], 1
        je     .short
        cmp     byte [short_opframes], 0
        jne     .short
        call    read_opp
        call    opp_rvalue
        call    append_script_arg_ax
        mov     [cmp_r], ax             ; threshold
        jmp     .compare
.short:
        xor     ax, ax
        mov     [cmp_r], ax
.compare:
        mov     ax, [party_strength]
        mov     [cmp_l], ax
        call    set_cmp_flags
.finish:
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x22 PARTY_SURPRISE (Gen2: Yes/No prompt; Gen1: two output operands) ----
; COAB CMD_PartySurprise writes 1 to the first destination when the party has a
; ranger or cleric/ranger multiclass, and always writes 0 to the second. CCECL
; defaults to no ranger, or uses nonzero /H when a host supplies that signal.
op_party_surprise:
        call    start_script_event_cur
        ; DQK's PARTY_SURPRISE handler fetches no operands in every Gen2 area.
        cmp     byte [is_gen2], 1
        je     .short
        cmp     byte [short_opframes], 0
        jne     .short
        call    read_opp
        mov     bx, [o_word]
        mov     ax, bx
        call    append_script_arg_ax
        xor     ax, ax
        cmp     byte [party_has_ranger], 0
        je      .store_first
        mov     ax, 1
.store_first:
        mov     [t0], ax
        call    mem_set
        call    read_opp
        mov     bx, [o_word]
        mov     ax, bx
        call    append_script_arg_ax
        xor     ax, ax
        call    mem_set
        mov     ax, [t0]
        call    append_script_arg_ax
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret
.short:
        ; The reviewed Yes/No flag and interactive contract is DQK Gen2.
        ; Keep the existing deterministic model for Gen1 short-frame titles
        ; until their title-owned opcode behavior is independently traced.
        cmp     byte [is_gen2], 1
        jne     .legacy_short
        ; Retail clears EQ/NE/LT/GT, presents Yes/No, and then sets EQ for Yes
        ; or NE for No. LE/GE deliberately survive this opcode.
        call    clear_party_prompt_flags
        cmp     byte [interactive_menu], 0
        je      .headless
        mov     word [menu_pending_dest], 0ffffh
        mov     word [menu_pending_count], 2
        mov     ax, [flag_le]
        and     ax, 1
        mov     bx, [flag_ge]
        and     bx, 1
        shl     bx, 1
        or      ax, bx
        mov     [menu_pending_reserved], ax
        ; The retail YES/NO handler has an empty caption; area scripts print
        ; the question immediately before PARTY_SURPRISE. Carry that exact
        ; packed text through the cold menu resume when the instructions are
        ; adjacent in the same ECL block.
        mov     ax, [pc]
        cmp     ax, [last_clear_next_pc]
        jne     .empty_prompt
        mov     byte [menu_text_active], 1 ; retain cached PRINTCLEAR segment
        jmp     .labels
.empty_prompt:
        call    start_menu_text
        mov     byte [o_code], 80h
        mov     word [o_text_off], 0
        mov     word [o_text_len], 0
        call    capture_menu_text
.labels:
        mov     si, party_yes_text
        call    append_static_menu_text
        mov     si, party_no_text
        call    append_static_menu_text
        call    finish_script_event
        call    yield_menu
        ret
.headless:
        mov     ax, [menu_choice]
        and     ax, 00ffh
        call    set_party_prompt_answer
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret
.legacy_short:
        mov     ax, [menu_choice]
        and     ax, 00ffh
        or      ax, ax
        jz      .legacy_yes
        xor     ax, ax
        jmp     .legacy_flags
.legacy_yes:
        mov     ax, 1
.legacy_flags:
        call    set_bool_flags
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

clear_party_prompt_flags:
        mov     byte [flag_eq], 0
        mov     byte [flag_ne], 0
        mov     byte [flag_lt], 0
        mov     byte [flag_gt], 0
        ret

set_party_prompt_answer:                ; AX=0 means Yes; other values mean No
        or      ax, ax
        jnz     .no
        mov     byte [flag_eq], 1
        ret
.no:
        mov     byte [flag_ne], 1
        ret

; ---- 0x23 SURPRISE a,b,c,d -> mem[0x02CB] ----
; Mirrors COAB sub_2771E: thresholds are signed bytes
;   party = byte(arg4 + 2 - arg1), monster = byte(arg2 + 2 - arg3)
; and two d6 rolls write the result to memory[0x02CB]. The original performs
; the second monster-side check after the nested both-sides write, so "both
; pass" stores 2, not 3.
op_surprise:
        call    start_script_event_cur
        ; DQK SURPRISE is a zero-operand redraw then terminal exit in every
        ; Gen2 area; the four-operand roll is Gen1-only.
        cmp     byte [is_gen2], 1
        je      .short
        cmp     byte [short_opframes], 0
        jne     .short
        call    read_opp
        call    opp_rvalue
        call    append_script_arg_ax
        and     ax, 00ffh               ; arg1
        mov     [t0], ax
        call    read_opp
        call    opp_rvalue
        call    append_script_arg_ax
        and     ax, 00ffh               ; arg2
        mov     [t1], ax
        call    read_opp
        call    opp_rvalue
        call    append_script_arg_ax
        and     ax, 00ffh               ; arg3
        mov     [t2], ax
        call    read_opp
        call    opp_rvalue
        call    append_script_arg_ax
        and     ax, 00ffh               ; arg4
        mov     [t3], ax

        mov     ax, [t3]
        add     ax, 2
        sub     ax, [t0]
        mov     [t0], ax                ; low byte = party threshold

        mov     ax, [t1]
        add     ax, 2
        sub     ax, [t2]
        mov     [t1], ax                ; low byte = monster threshold

        call    roll_d6
        mov     [t2], ax                ; party roll
        call    roll_d6
        mov     [t3], ax                ; monster roll

        mov     word [tmptarget], 0
        mov     ax, [t2]
        movsx   dx, byte [t0]
        cmp     ax, dx
        jg      .check_monster
        mov     ax, [t3]
        movsx   dx, byte [t1]
        cmp     ax, dx
        jg      .party_only
        mov     word [tmptarget], 3
        jmp     .check_monster
.party_only:
        mov     word [tmptarget], 1
.check_monster:
        mov     ax, [t3]
        movsx   dx, byte [t1]
        cmp     ax, dx
        jg      .store
        mov     word [tmptarget], 2
.store:
        mov     bx, 02cbh
        mov     ax, [tmptarget]
        call    mem_set
        mov     ax, [tmptarget]
        call    append_script_arg_ax
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret
.short:
        ; DoK/DQK SURPRISE is a zero-operand redraw then tail EXIT, not the
        ; older four-operand surprise-roll instruction.
        call    finish_script_event
        mov     byte [vmstat], 0
        mov     byte [flow_stop], 1
        ret

; ---- 0x2A GETTABLE base,offset,dest ----
; COAB CMD_GetTable reads a byte table at base + byte(offset) into dest.
; SAVE_TABLE/memory values override the original inline ECL table bytes.
op_gettable:
        call    read_opp
        mov     ax, [o_word]            ; table base address, not rvalue
        mov     [t0], ax
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh               ; COAB casts the offset to byte
        add     ax, [t0]
        mov     [t2], ax                ; effective table address

        mov     bx, ax
        call    secret_field_get
        jnc     .have_value            ; Secret source getter outranks sparse/inline tables

        ; First honor mutable VM memory, so SAVE_TABLE can change table cells.
        push    si
        push    cx
        mov     bx, [t2]
        mov     cx, [memcount]
        mov     si, mem_keys
        jcxz    .mem_miss
.mem_loop:
        cmp     [si], bx
        je      .mem_hit
        add     si, 2
        loop    .mem_loop
.mem_miss:
        pop     cx
        pop     si
        ; Fall back to the original byte embedded in the current ECL block.
        mov     ax, [t2]
        cmp     ax, [vbaseval]
        jb      .inline_rel
        sub     ax, [vbaseval]
.inline_rel:
        cmp     ax, [hdrlen]
        jb      .inline_zero
        cmp     ax, [blklen]
        jae     .inline_zero
        mov     si, ax
        xor     ax, ax
        mov     al, [blk+si]
        jmp     .have_value
.inline_zero:
        xor     ax, ax
        jmp     .have_value
.mem_hit:
        sub     si, mem_keys            ; si = index*2
        mov     ax, [mem_vals+si]
        pop     cx
        pop     si
.have_value:
        mov     [t1], ax
        call    read_opp
        mov     bx, [o_word]
        mov     ax, [t1]
        call    mem_set
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x35 SAVE_TABLE value,base,offset ----
; COAB writes value to memory[base + offset]; DQK selects width from base type.
op_savetable:
        call    read_opp
        call    opp_rvalue
        mov     [t0], ax
        call    read_opp
        mov     ax, [o_word]            ; table base address, not rvalue
        mov     [t1], ax
        mov     al, [o_code]            ; DQK's writer uses base operand type for width
        mov     [t2], al
        call    read_opp
        call    opp_rvalue
        add     ax, [t1]
        mov     bx, ax                   ; address remains a full word
        mov     ax, [t0]
        ; DQK 25a4:06d2 (file 040992) writes one byte for operand types 0/1
        ; and a word for types 2/3. This truncates the stored value, not the
        ; full base-plus-offset address. Keep the DAX memory model unchanged.
        cmp     byte [is_gen2], 1
        jne     .store
        cmp     byte [t2], 1
        ja      .store
        and     ax, 00ffh
.store:
        call    mem_set
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x1C CLEAR_MONSTERS ----
op_clearmonsters:
        mov     word [enc_count], 0
        mov     ax, [fx_flags]
        and     ax, 0fff7h              ; clear FX_HAVE_ENC
        mov     [fx_flags], ax
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x24 COMBAT ----
op_combat:
        mov     byte [vmstat], 3
        mov     byte [flow_stop], 1
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x36 ADD_NPC npc_id,morale ----
op_addnpc:
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [t0], ax
        call    read_opp
        call    opp_rvalue
        and     ax, 00ffh
        mov     [t1], ax

        mov     ax, [npc_count]
        cmp     ax, NPCCAP
        jae     .full
        mov     bx, ax
        shl     bx, 2                   ; bx = count * 4 bytes
        mov     ax, [t0]
        mov     [fx_npc_joins+bx], ax
        mov     ax, [t1]
        mov     [fx_npc_joins+bx+2], ax
        inc     word [npc_count]
.full:
        or      word [fx_flags], FX_HAVE_NPC
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x37 LOAD_PIECES (legacy) / two-operand Gen2 host effect ----
op_loadpieces:
        mov     al, [is_gen2]
        and     al, 1                   ; enum2 uses the long opcode frame
        or      al, [short2_frames]
        jnz     loadpieces_gen2        ; do not apply the three-set loader to Gen2
        call    read_opp                ; var3
        call    opp_rvalue
        mov     [t0], ax
        call    read_opp                ; var2
        call    opp_rvalue
        mov     [t1], ax
        call    read_opp                ; var1
        call    opp_rvalue
        mov     [t2], ax
        call    note_loadpieces_repeat
        call    record_loadpieces
        mov     ax, [opp]
        mov     [pc], ax
        call    maybe_stop_stable_bridge
        ret

; DQK 0x37 (DQK.EXE 0x434A8): party-by-name lookup. Record the event as
; before, then match memstr[op1] against /B party names whose GBPR body +300
; flag byte has bit 7 (the ADD_NPC mark); op2 <- member index, else 255.
loadpieces_gen2:
        mov     ax, [opp]
        push    ax
        call    op_script_effect
        pop     ax
        cmp     word [party_count], 0
        je      .ret
        mov     [opp], ax
        call    read_opp
        cmp     byte [o_code], 81h
        jne     .ret
        mov     ax, [o_word]
        mov     [t0], ax
        call    read_opp
        mov     ax, [o_word]
        mov     [t1], ax
        mov     word [t2], 0
.member:
        mov     ax, [t2]
        cmp     ax, PARTY_ROWS_MAX
        jae     .none
        cmp     ax, [party_count]
        jae     .none
        mov     bx, ax
        test    byte [party_ext+bx], 80h
        jz      .next
        shl     ax, 4
        mov     si, party_names
        add     si, ax
        movzx   cx, byte [si]
        jcxz    .next
        inc     si
        mov     di, [t0]
.ch:
        mov     bx, di
        call    mem_get
        movzx   dx, byte [si]
        cmp     ax, dx
        jne     .next
        inc     si
        inc     di
        loop    .ch
        mov     bx, di
        call    mem_get
        or      ax, ax
        jnz     .next
        mov     ax, [t2]
        jmp     .store
.next:
        inc     word [t2]
        jmp     .member
.none:
        mov     ax, 255
.store:
        mov     bx, [t1]
        call    mem_set
.ret:
        ret

note_loadfiles_repeat:
        test    word [fx_flags], FX_HAVE_FILES
        jz      .reset
        mov     ax, [fx_files+0]
        cmp     ax, [t0]
        jne     .reset
        mov     ax, [fx_files+2]
        cmp     ax, [t1]
        jne     .reset
        ; DQK's Gen2 third prefix word carries tagged CA03, not an operand.
        cmp     byte [is_gen2], 1
        jne     .third_operand
        cmp     byte [is_dok], 1
        jne     .same
.third_operand:
        mov     ax, [fx_files+4]
        cmp     ax, [t2]
        jne     .reset
.same:
        inc     word [bridge_repeat_count]
        ret
.reset:
        mov     word [bridge_repeat_count], 0
        ret

note_loadpieces_repeat:
        test    word [fx_flags], FX_HAVE_PIECES
        jz      .reset
        mov     ax, [fx_piece_raw+0]
        cmp     ax, [t0]
        jne     .reset
        mov     ax, [fx_piece_raw+2]
        cmp     ax, [t1]
        jne     .reset
        mov     ax, [fx_piece_raw+4]
        cmp     ax, [t2]
        jne     .reset
        inc     word [bridge_repeat_count]
        ret
.reset:
        mov     word [bridge_repeat_count], 0
        ret

maybe_stop_stable_bridge:
        cmp     word [bridge_repeat_count], BRIDGE_REPEAT_CAP
        jb      .ret
        test    word [fx_flags], FX_HAVE_FILES
        jz      .ret
        mov     byte [vmstat], 0
        mov     byte [flow_stop], 1
.ret:
        ret

; record_loadpieces: t0/t1/t2 = raw LOAD_PIECES operands [var3,var2,var1].
; Mirrors packages/engine/src/ecl/vm.ts resolvePieces(): 0x7F special first,
; then the two-set-area flags at 0x4BE7/0x4BE8, otherwise all three sets.
record_loadpieces:
        mov     ax, [t0]
        mov     [fx_piece_raw+0], ax
        mov     ax, [t1]
        mov     [fx_piece_raw+2], ax
        mov     ax, [t2]
        mov     [fx_piece_raw+4], ax

        mov     ax, [fx_flags]
        or      ax, FX_HAVE_PIECES
        and     ax, 0FFFBh              ; clear FX_TWOSET before recomputing
        mov     [fx_flags], ax

        cmp     word [t0], PIECES_DEF1
        je      .default_set1

        mov     bx, AREA_1CE
        call    mem_get
        or      ax, ax
        jz      .normal
        mov     bx, AREA_1D0
        call    mem_get
        or      ax, ax
        jz      .normal

        mov     ax, [fx_flags]
        or      ax, FX_TWOSET
        mov     [fx_flags], ax
        mov     ax, [t0]
        mov     [fx_piece_set+0], ax
        mov     word [fx_piece_set+2], PIECES_RST
        mov     ax, [t2]
        mov     [fx_piece_set+4], ax
        ret

.normal:
        mov     ax, [t0]
        mov     [fx_piece_set+0], ax
        mov     ax, [t1]
        mov     [fx_piece_set+2], ax
        mov     ax, [t2]
        mov     [fx_piece_set+4], ax
        ret

.default_set1:
        mov     word [fx_piece_set+0], PIECES_DEF1
        mov     word [fx_piece_set+2], PIECES_RST
        mov     word [fx_piece_set+4], PIECES_RST
        ret

; ---- host-facing script effects without native game-state mutation yet ----
; These are real host-facing script effects, plus the documented unknown opcode
; that the TS VM surfaces and skips. Preserve decoded
; rvalues so the host can observe and eventually apply or investigate them
; instead of losing the event while control flow continues.
;
; start_script_event_cur / append_script_arg_ax / finish_script_event support
; host-owned opcodes that also need native headless state mutation. Menu opcodes
; use this path: they write the deterministic choice to memory, while preserving
; prompt/option structure for a future interactive host.
start_script_event_cur:
        push    ax
        push    bx
        push    dx
        mov     byte [script_recording], 0
        mov     word [script_arg_index], 0
        mov     ax, [fx_script_count]
        cmp     ax, SCRIPTCAP
        jae     .ret

        imul    bx, ax, SCRIPT_REC_BYTES
        mov     [script_event_base], bx

        movzx   ax, byte [cur_op]
        mov     [fx_script_events+bx], ax
        mov     byte [script_recording], 1
.ret:
        pop     dx
        pop     bx
        pop     ax
        ret

append_script_arg_ax:
        push    bx
        push    di
        push    si
        cmp     byte [script_recording], 0
        je      .ret
        mov     si, [script_arg_index]
        cmp     si, SCRIPT_ARGS
        jae     .count_only
        mov     bx, [script_event_base]
        mov     di, si
        shl     di, 1
        mov     [fx_script_events+bx+4+di], ax
.count_only:
        inc     word [script_arg_index]
.ret:
        pop     si
        pop     di
        pop     bx
        ret

finish_script_event:
        push    ax
        push    bx
        cmp     byte [script_recording], 0
        je      .ret
        mov     bx, [script_event_base]
        mov     ax, [script_arg_index]
        mov     [fx_script_events+bx+2], ax
        inc     word [fx_script_count]
        or      word [fx_flags], FX_HAVE_SCRIPT
        mov     byte [script_recording], 0
.ret:
        pop     bx
        pop     ax
        ret

; record_call_event: append a compact CALL event for a host routine.
; operand[0] is the raw CALL operand word; operand[1] is the dialect-adjusted
; routine id. Control-flow handling remains the deterministic native no-op.
record_call_event:
        push    ax
        push    bx
        push    dx
        mov     word [call_event_slot], 0ffffh
        mov     ax, [fx_script_count]
        cmp     ax, SCRIPTCAP
        jae     .ret

        imul    bx, ax, SCRIPT_REC_BYTES

        mov     [call_event_slot], bx   ; published for extend_call_event_*
        mov     word [fx_script_events+bx], 002dh
        mov     word [fx_script_events+bx+2], 2
        mov     ax, [call_raw_word]
        mov     [fx_script_events+bx+4], ax
        mov     ax, [call_routine_id]
        mov     [fx_script_events+bx+6], ax
        inc     word [fx_script_count]
        or      word [fx_flags], FX_HAVE_SCRIPT
.ret:
        pop     dx
        pop     bx
        pop     ax
        ret

; extend_call_event_redraw: attach the CALL-0xAE11/0xADCC "redraw dungeon view" pose
; snapshot to the CALL event record_call_event just wrote for THIS instruction,
; as operands 3..5 (x, y, facing), widening its argc from 2 to 5. See op_call's
; .redraw_dungeon_view comment for the retail grounding and the explicit scope
; limit (no wall/roof id).
;
; It EXTENDS rather than APPENDS, and that is the whole point. An earlier
; revision of this routine appended a SECOND, separately-tagged event for the
; same instruction, which broke the trace's one-instruction-one-event
; invariant: `GBSX count` stopped counting executed instructions and every
; `#NN OP=` index pin downstream of a CALL shifted by one. That was not
; hypothetical -- it turned gbcoab-flow-test.ps1's FIRST stage red on its
; `GBSX count=0007` needle (CoAB block 50 executes 0xAE11), moving that
; script's failure point EARLIER than the /B 51 pin it was already failing
; on. Extending the existing record keeps every count and index pin in the
; suite stable while surfacing exactly the same data.
;
; Two further things fall out of extending instead of appending, and both are
; why no ccefx.asm change is needed. The tag stays the REAL opcode 0x2D, so
; the auxiliary data no longer has to dodge print_opcode_name's mnemonic
; table -- the append version had to be tagged 0x80AE precisely because
; 0xAE11's low byte 0x11 collides with real opcode 0x11 PRINT and the dump
; rendered the pose snapshot as "OP=11 PRINT ARGC=03 ARGS= 000F 0005 0003".
; And ccefx.asm's `.call` detail formatter guards its two fields with `jb`
; (argc>=1 prints the operand, argc>=2 the routine id), so argc=5 still
; renders "CALL=operand:XXXX routine:YYYY" unchanged, with the three extra
; words appearing in the generic ARGS list. SCRIPT_ARGS is 8 (ccefx.asm:21),
; so 5 operands is well inside the 20-byte record.
extend_call_event_redraw:
        push    ax
        push    bx
        mov     bx, [call_event_slot]
        cmp     bx, 0ffffh
        je      .ret                    ; trace was at SCRIPTCAP; nothing written
        mov     word [fx_script_events+bx+2], 5
        mov     ax, [call_redraw_x]
        mov     [fx_script_events+bx+8], ax
        mov     ax, [call_redraw_y]
        mov     [fx_script_events+bx+10], ax
        mov     ax, [call_redraw_facing]
        mov     [fx_script_events+bx+12], ax
.ret:
        pop     bx
        pop     ax
        ret

; extend_call_event_picture: attach the CALL-0xE804 "advance animated picture"
; frame counter to the CALL event record_call_event just wrote for THIS
; instruction, as operand 3, widening its argc from 2 to 3. See op_call's
; .advance_animated_picture comment for the retail grounding and the explicit
; scope limit (no numFrames wrap). Same extend-not-append rationale as
; extend_call_event_redraw above.
extend_call_event_picture:
        push    ax
        push    bx
        mov     bx, [call_event_slot]
        cmp     bx, 0ffffh
        je      .ret                    ; trace was at SCRIPTCAP; nothing written
        mov     word [fx_script_events+bx+2], 3
        mov     ax, [call_picture_frame]
        mov     [fx_script_events+bx+8], ax
.ret:
        pop     bx
        pop     ax
        ret

; record_program_event: append PROGRAM host dispatch id as a compact event.
record_program_event:
        push    ax
        push    bx
        push    dx
        mov     ax, [fx_script_count]
        cmp     ax, SCRIPTCAP
        jae     .ret

        imul    bx, ax, SCRIPT_REC_BYTES

        mov     word [fx_script_events+bx], 0038h
        mov     word [fx_script_events+bx+2], 1
        mov     ax, [program_id]
        mov     [fx_script_events+bx+4], ax
        inc     word [fx_script_count]
        or      word [fx_flags], FX_HAVE_SCRIPT
.ret:
        pop     dx
        pop     bx
        pop     ax
        ret

record_clock_event:
        push    ax
        push    bx
        push    dx
        mov     ax, [fx_script_count]
        cmp     ax, SCRIPTCAP
        jae     .ret

        imul    bx, ax, SCRIPT_REC_BYTES

        mov     word [fx_script_events+bx], 0034h
        mov     word [fx_script_events+bx+2], 2
        mov     ax, [t0]
        mov     [fx_script_events+bx+4], ax
        mov     ax, [t1]
        mov     [fx_script_events+bx+6], ax
        inc     word [fx_script_count]
        or      word [fx_flags], FX_HAVE_SCRIPT
.ret:
        pop     dx
        pop     bx
        pop     ax
        ret

op_script_effect:
        mov     ax, [fx_script_count]
        cmp     ax, SCRIPTCAP
        jae     .skip

        imul    bx, ax, SCRIPT_REC_BYTES

        movzx   ax, byte [cur_op]
        mov     [fx_script_events+bx], ax

        push    bx
        mov     al, [cur_op]
        call    get_operand_meta
        mov     [fx_count_at], dh       ; 0xff = no count-driven tail
        mov     word [fx_count_extra], 0
        movzx   ax, dl                  ; dialect-adjusted fixed operand count
        pop     bx
        mov     [fx_script_events+bx+2], ax
        mov     cx, ax
        xor     si, si
.args:
        cmp     si, cx
        jae     .done
        push    bx
        push    cx
        push    si
        call    read_opp
        ; If this is the count operand, remember its RAW word as the tail
        ; length. Raw [o_word] deliberately mirrors skip_operands_generic, so
        ; the execute and skip paths advance [opp] identically -- a divergence
        ; here would be worse than either being uniformly wrong. (For an
        ; immediate operand, code 0x00, the raw word and opp_rvalue agree.)
        mov     al, [fx_count_at]
        cmp     al, 0xff
        je      .nocount
        movzx   ax, al
        cmp     ax, si
        jne     .nocount
        mov     ax, [o_word]
        mov     [fx_count_extra], ax
.nocount:
        call    record_operand_text
        call    opp_rvalue
        pop     si
        pop     cx
        pop     bx
        cmp     si, SCRIPT_ARGS
        jae     .next_arg
        mov     di, si
        shl     di, 1
        mov     [fx_script_events+bx+4+di], ax
.next_arg:
        inc     si
        jmp     .args
.done:
        ; Cache Gen2 PRINTCLEAR's packed bytes in the existing menu buffer for
        ; an immediately following PARTY_SURPRISE yield.
        cmp byte [cur_op], 12h
        jne .clear_cached
        cmp byte [is_gen2], 1
        jne .clear_cache_invalid
        cmp byte [o_code], 80h
        jne .clear_cache_invalid
        call start_menu_text
        call capture_menu_text
        mov byte [menu_text_active], 0
        mov ax, [opp]
        mov [last_clear_next_pc], ax
        jmp .clear_cached
.clear_cache_invalid:
        mov word [last_clear_next_pc], 0ffffh
.clear_cached:
        ; Consume the count-driven tail. Without this the fixed operands are
        ; read and the tail is left in the instruction stream to be executed as
        ; code -- corpus-wide 317 operand words for Gen2 0x27 alone, tails up
        ; to 49 items. The .skip arm below already consumes it via
        ; skip_operands_generic, so omitting it here would make the executed
        ; and skipped paths disagree about where the next instruction starts.
        mov     cx, [fx_count_extra]
        jcxz    .no_tail
.tail:
        push    cx
        call    read_opp
        pop     cx
        loop    .tail
.no_tail:
        inc     word [fx_script_count]
        or      word [fx_flags], FX_HAVE_SCRIPT
        mov     ax, [opp]
        mov     [pc], ax
        ret
.skip:
        call    skip_operands_of_cur
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- Buck Countdown observed extended host/state opcodes ----
; 0x42/0x4B/0x4C are observed at byte boundaries where the next byte is another
; valid instruction. 0x43/0x45/0x46 are observed with operand framing 1/2/2.
; Preserve these events for host research, but do not infer combat or mutate
; state until the side effects are reversed.
op_buck_ext_zero:
        call    start_script_event_cur
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

op_buck_ext_one:
        mov     cx, 1
        jmp     op_buck_ext_args

op_buck_ext_two:
        mov     cx, 2

op_buck_ext_args:
        call    start_script_event_cur
.arg:
        cmp     cx, 0
        je      .done
        push    cx
        call    read_opp
        call    record_operand_text
        call    opp_rvalue
        call    append_script_arg_ax
        pop     cx
        dec     cx
        jmp     .arg
.done:
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- Pool of Radiance observed extended/no-operand opcode ----
; Real Pool ECL1 block 15 reaches 0xA1 immediately before ordinary PRINTCLEAR
; text after queuing a monster group. Treat it as a host-facing no-op event so
; the surrounding script can continue to its normal menu/combat route, while
; preserving the opcode in GBSX for future Pool-dialect research.
op_pool_ext_a1:
        call    start_script_event_cur
        call    finish_script_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ---- 0x2E DAMAGE control,count,sides,bonus,target ----
; Preserve the normal five operands plus current LOAD_CHARACTER selection
; context so GBBOOT can own the bounded selected/no-save HP mutation.
op_damage:
        mov     ax, [fx_script_count]
        cmp     ax, SCRIPTCAP
        jae     .skip

        mov     bx, ax
        shl     bx, 2
        mov     dx, bx
        shl     bx, 2
        add     bx, dx                  ; bx = event index * 20 bytes

        mov     word [fx_script_events+bx], 002Eh
        mov     word [fx_script_events+bx+2], 7
        xor     si, si
.args:
        cmp     si, 5
        jae     .context
        push    bx
        push    si
        call    read_opp
        call    opp_rvalue
        pop     si
        pop     bx
        mov     di, si
        shl     di, 1
        mov     [fx_script_events+bx+4+di], ax
        inc     si
        jmp     .args
.context:
        xor     ax, ax
        mov     al, [selected_valid]
        mov     [fx_script_events+bx+14], ax
        mov     ax, [selected_party]
        mov     [fx_script_events+bx+16], ax
        inc     word [fx_script_count]
        or      word [fx_flags], FX_HAVE_SCRIPT
        mov     ax, [opp]
        mov     [pc], ax
        ret
.skip:
        call    skip_operands_of_cur
        mov     ax, [opp]
        mov     [pc], ax
        ret

; record_operand_text: if the just-read operand was an inline packed ECL
; string, decode it into this event's v6 text slot. Only the first inline
; string per event is kept; numeric operands remain in the fixed event record.
record_operand_text:
        pusha
        mov     ax, [fx_script_count]
        cmp     ax, SCRIPTCAP
        jae     .ret
        imul    bx, ax, SCRIPT_TEXT_REC_BYTES
        cmp     word [fx_script_texts+bx], 0
        jne     .ret
        lea     di, [fx_script_texts+bx+2]
        cmp     byte [o_code], 80h
        je      .inline
        ; Original Secret A628/7C00: exact current selected Pascal name.
        ; This is an instruction-time preview, never a WHO menu mutation.
        cmp     byte [is_gen2], 2
        jne     .ret
        mov     al, [cur_op]
        sub     al, 11h
        cmp     al, 1
        ja      .ret
        cmp     byte [o_code], 1
        jne     .ret
        cmp     word [o_word], 7c00h
        jne     .ret
        mov     al, [selected_valid]
        and     al, [who_names_valid]
        cmp     al, 1
        jne     .unavailable
        mov     si, [selected_party]
        dec     si
        cmp     si, [party_count]
        jae     .unavailable
        shl     si, 4
        add     si, party_names
        movzx   cx, byte [si]
        inc     si                     ; validated GBWN name: 1..15 ASCII
        mov     [fx_script_texts+bx], cx
        rep     movsb
        jmp     .ret
.unavailable:
        jmp     secret_field_get.unavailable
.inline:
        mov     si, [o_text_off]
        mov     cx, [o_text_len]
        xor     bp, bp                  ; output chars
        xor     dx, dx                  ; dl=current shifted byte, dh=bits left
.char:
        xor     al, al                  ; 6-bit char accumulator
        mov     ah, 6
.bits:
        test    dh, dh
        jne     .have_source
        jcxz    .done
        mov     dl, [blk+si]
        inc     si
        dec     cx
        mov     dh, 8
.have_source:
        shl     dl, 1
        rcl     al, 1
        dec     dh
        dec     ah
        jnz     .bits
.have_char:
        or      al, al
        jnz     .nonzero
        ; Secret's original PRINT codec skips zero symbols, even before32.
        ; Other operands/profiles retain the established terminator policy.
        cmp     byte [is_gen2], 2
        jne     .done
        mov     al, [cur_op]
        sub     al, 11h
        cmp     al, 1
        jbe     .char
        jmp     .done
.nonzero:
        cmp     al, 31
        ja      .store
        add     al, 64
.store:
        cmp     bp, SCRIPT_TEXT_BYTES
        jae     .long
        stosb
        inc     bp
        jmp     .char
.long:
        ; A Gen1 DAX source reference uses the same 34-byte text slot.  The
        ; child does not retain a second large text buffer; CCFLOW resolves
        ; this bounded reference from its original source path after EXEC.
        cmp     byte [is_dax], 0
        jne     .reference_profile
        cmp     byte [is_gen2], 2
        jne     .done
.reference_profile:
        ; CCFLOW marks its EXEC child through FCB1.  A direct CCECL /E keeps
        ; the historical 32-character inline prefix: it has no DAX resolver.
        cmp     dword [5ch], 'GBLR'
        jne     .done
        mov     al, [cur_op]
        sub     al, 11h
        cmp     al, 1
        ja      .done                  ; only player-visible PRINT/PRINTCLEAR
        sub     di, SCRIPT_TEXT_REC_BYTES
        mov     ax, 0ffffh
        stosw
        mov     ax, 'DR'
        stosw
        mov     ax, 'EF'
        stosw
        mov     ax, [area_id]
        stosw
        mov     si, o_text_off
        movsw
        movsw
        mov     ax, [blklen]
        stosw
        xor     ax, ax
        mov     cl, 10               ; high byte stays zero: inline len is u8
        rep     stosw
        jmp     .ret
.done:
        mov     [fx_script_texts+bx], bp
.ret:
        popa
        ret

; Validate the v15 raw flag suffix shared by Gen2 capacity and acknowledgement
; subtypes. Each VM flag is a canonical byte boolean; the reserved word is 0.
validate_v15_state:
        cmp     dword [rbuf+GBRF_MAGIC_OFF], 'GBRF'
        jne     .bad
        cmp     word [rbuf+GBRF_RESERVED_OFF], 0
        jne     .bad
        mov     si, rbuf+GBRF_FLAGS_OFF
        mov     cx, 6
.flag:
        cmp     byte [si], 1
        ja      .bad
        inc     si
        loop    .flag
        clc
        ret
.bad:
        stc
        ret

%include "secretwhostate.inc"

; A v15 status-4 record is an internal Gen2 script-capacity replay only. Its
; menu/text extensions are canonical zero, while GBMS and GBRF preserve state.
validate_v15_capacity:
        cmp     dword [rbuf+MS_MAGIC_OFF], 'GBMS'
        jne     .bad
        mov     ax, [rbuf+MS_FLAGS_OFF]
        test    ax, 0fffch
        jnz     .bad
        mov     si, rbuf+MN_MAGIC_OFF
        mov     cx, (MS_MAGIC_OFF-MN_MAGIC_OFF)/2
.menu_zero:
        lodsw
        or      ax, ax
        jnz     .bad
        loop    .menu_zero
        mov     si, rbuf+MT_MAGIC_OFF
        mov     cx, (FX_V14_LEN-MT_MAGIC_OFF)/2
.text_zero:
        lodsw
        or      ax, ax
        jnz     .bad
        loop    .text_zero
        clc
        ret
.bad:
        stc
        ret

; ---- 0x25 ON_GOTO selector,count,targets... ----
; Target decoding is identical to ON_GOSUB; the shared handler dispatches the
; final transfer by [cur_op].
op_ongoto:
        jmp     op_ongosub

; ---- 0x26 ON_GOSUB selector,count,targets... ----
op_ongosub:
        call    read_opp                ; a0 selector
        call    opp_rvalue
        mov     [t0], ax                ; selector
        call    read_opp                ; a1 count
        mov     ax, [o_word]
        mov     [t1], ax                ; count
        xor     cx, cx
        mov     word [t3], 0xffff
.tl:
        cmp     cx, [t1]
        jae     .after
        push    cx
        call    read_opp                ; one target operand
        mov     ax, [o_word]
        mov     [tmptarget], ax
        pop     cx
        mov     ax, cx
        cmp     ax, [t0]
        jne     .nx
        push    cx
        mov     ax, [tmptarget]
        mov     [sel_vaddr], ax
        pop     cx
        mov     word [have_sel], 1
.nx:
        inc     cx
        jmp     .tl
.after:
        cmp     word [have_sel], 0
        je      .fall
        mov     ax, [sel_vaddr]
        cmp     ax, [vbaseval]
        jb      .rel
        sub     ax, [vbaseval]
.rel:
        cmp     ax, [hdrlen]
        jb      .fall
        cmp     ax, [blklen]
        jae     .fall
        cmp     byte [cur_op], 25h
        je      .goto
        mov     bx, [callsp]
        cmp     bx, CALLCAP
        jae     .overflow
        push    ax
        mov     dx, [opp]
        shl     bx, 1
        mov     [callstk+bx], dx
        inc     word [callsp]
        pop     ax
        mov     [pc], ax
        mov     word [have_sel], 0
        ret
.goto:
        mov     [pc], ax
        mov     word [have_sel], 0
        ret
.overflow:
        call    call_stack_full_halt
        ret
.fall:
        mov     word [have_sel], 0
        mov     ax, [opp]
        mov     [pc], ax
        ret

; Preserve a deterministic halt boundary at the active instruction.
halt_at_current:
        mov     byte [vmstat], 4
        mov     byte [flow_stop], 1
        mov     ax, [area_id]
        mov     [halt_area], ax
        movzx   ax, byte [cur_op]
        mov     [halt_opcode], ax
        ret

; Call-stack overflow is a source-program fault.  It must not reuse the
; nonlocal/fall-through path because that silently changes the script branch.
call_stack_full_halt:
        mov     word [halt_reason], HALT_CALL_FULL
        mov     ax, [ins_off]
        mov     [halt_pc], ax
        call    halt_at_current
        ret

; ---- default: unhandled opcode -> skip operands, fall through ----
op_default:
        call    skip_operands_of_cur    ; advances [opp] past wordSet (+count) operands
        mov     ax, [opp]
        mov     [pc], ax
        ret

; ============================================================================
;  skip_one_instruction: [pc] points at an opcode; advance [pc] past the whole
;  instruction (opcode + its operands). Used by the IF_* skip path.
; ============================================================================
skip_one_instruction:
        mov     ax, [pc]
        cmp     ax, [blklen]
        jae     .end
        mov     si, ax
        mov     al, [blk+si]
        mov     [skip_op], al
        cmp     al, 042h
        je      .ext_zero
        cmp     al, 043h
        je      .ext_one
        cmp     al, 045h
        je      .ext_two
        cmp     al, 046h
        je      .ext_two
        cmp     al, 04bh
        je      .ext_zero
        cmp     al, 04ch
        jne     .sk_not_4c
        cmp     byte [is_matrix], 0
        jne     .ext_two
        jmp     .ext_zero
.sk_not_4c:
        cmp     al, 041h
        je      .ext_two
        cmp     al, 0a1h
        je      .ext_zero
        cmp     al, KNOWN_OP_MAX
        ja      .unknown_op
        mov     ax, [pc]
        inc     ax
        mov     [opp], ax
        mov     byte [skip_use_cur], 0
        call    skip_operands_generic
        call    maybe_skip_buck_b50_encounter_extra
        mov     ax, [opp]
        mov     [pc], ax
        ret
.ext_zero:
        mov     ax, [pc]
        inc     ax
        mov     [pc], ax
        ret
.ext_one:
        mov     ax, [pc]
        inc     ax
        mov     [opp], ax
        mov     cx, 1
        call    skip_extra_operands
        mov     ax, [opp]
        mov     [pc], ax
        ret
.ext_two:
        mov     ax, [pc]
        inc     ax
        mov     [opp], ax
        mov     cx, 2
        call    skip_extra_operands
        mov     ax, [opp]
        mov     [pc], ax
        ret
.end:
        ret
.unknown_op:
        ; [pc] still points AT the unknown byte -- do not advance it. The next
        ; vm_run_resume iteration applies its own KNOWN_OP_MAX test and produces
        ; exactly the .badop outcome the TRUE branch of this same IF would have
        ; produced. Both branches then agree.
        ret

; skip_operands_of_cur: skip operands of [cur_op] starting at [opp].
skip_operands_of_cur:
        mov     al, [cur_op]
        mov     [skip_op], al
        call    skip_operands_generic
        ret

; skip_operands_generic: read wordSet (then countAt extras) operands of [skip_op],
; advancing [opp]. Uses the opcode table; for ON_GOTO/ON_GOSUB/menus the count
; operand drives the extra operands (mirrors disassemble.ts).
skip_operands_generic:
        mov     al, [skip_op]
        call    get_operand_meta
.store_meta:
        mov     [ws_n], dl
        mov     [count_at], dh
        ; read wordSet operands
        xor     cx, cx
        movzx   bp, byte [ws_n]
        mov     word [count_extra], 0
.fix:
        cmp     cx, bp
        jae     .extras
        push    cx
        push    bp
        call    read_opp
        pop     bp
        pop     cx
        ; if this operand index == count_at, remember its word as extra count
        mov     al, [count_at]
        cmp     al, 0xff
        je      .nocount
        movzx   ax, al
        cmp     ax, cx
        jne     .nocount
        mov     ax, [o_word]
        mov     [count_extra], ax
.nocount:
        inc     cx
        jmp     .fix
.extras:
        mov     cx, [count_extra]
        jcxz    .done
.el:
        push    cx
        call    read_opp
        pop     cx
        loop    .el
.done:
        ret

; get_operand_meta: AL=opcode -> DL=wordSet, DH=countAt. The base table is
; CoK/long Gen1; DoK has five short frames and Gen2 selects its proven frames above.
get_operand_meta:
        push    bx
        movzx   bx, al
        add     bx, bx
        mov     dl, [optab+bx]
        mov     dh, [optab+bx+1]
        cmp     byte [is_gen2], 1
        jne     .maybe_dok
        cmp     al, 21h
        je      .two
        cmp     al, 27h
        je      .gen2_treasure
        cmp     al, 1fh
        je      .one                 ; Gen2 UNKNOWN_1F has one operand
        cmp     al, 31h
        je      .gen2_short_menu
        cmp     al, 29h
        je      .zero                 ; Gen2 ENCOUNTER_MENU immediately returns
        cmp     al, 37h
        je      .two                  ; Gen2 handler prefetches two operands
        cmp     al, 2ch
        je      .one                  ; Gen2 PARLAY has one destination operand
        cmp     al, 1dh
        je      .zero                 ; Gen2 PARTYSTRENGTH has no operands
        cmp     al, 22h
        je      .zero                 ; Gen2 PARTY_SURPRISE has no operands
        cmp     al, 23h
        je      .zero                 ; Gen2 SURPRISE has no operands
        cmp     al, 0ch
        je      .four                 ; Gen2 SETUP_MONSTER has four operands
        jmp     .done
.two:
        mov     dl, 2                   ; Gen2 LOAD_FILES has two operands
        jmp     .done
; Gen2 TREASURE is (wordSet 4, countAt 3): four fixed operands then a
; count-driven item tail. The base table's (8, 0xff) is the Gen1 CoK frame,
; which stays correct for Gen1 (measured: CoK 22 sites, 0 halts at (8,0xff) vs
; 1 halt at (4,3), and 21 of 22 have args[3]==0). Deliberately placed ABOVE the
; area_id==5 test: the 43 Gen2 sites span 17 areas, so area-gating would be
; wrong. Setting DH is load-bearing -- every other arm here sets only DL and
; inherits DH from the table, which for 0x27 is the 0xff "no tail" sentinel;
; (4, 0xff) lands on a spurious EXIT at 30 of 30 nonzero-count sites, because
; the first byte of an operand-encoded word is 0x00 = EXIT.
; See docs/engine/research/ecl-gen2-treasure-operand-frame.md.
.gen2_treasure:
        mov     dl, 4                   ; four fixed operands
        mov     dh, 3                   ; operand index 3 holds the tail length
        jmp     .done
.gen2_short_menu:
        mov     dl, 2                   ; shared 2B/31 menu's fixed operands
        mov     dh, 1                   ; operand 1 carries the inline-item count
        jmp     .done
.maybe_dok:
        cmp     byte [short_opframes], 0
        je      .done
        cmp     al, 0ch
        je      .four
        cmp     al, 1dh
        je      .zero
        cmp     al, 22h
        je      .zero
        cmp     al, 23h
        je      .zero
        cmp     al, 2ch
        je      .one
        cmp     byte [short2_frames], 0
        je      .done
        cmp     al, 1fh
        je      .one
        cmp     al, 21h
        je      .two
        cmp     al, 37h
        je      .two
        jmp     .done
.zero:
        xor     dl, dl
        jmp     .done
.one:
        mov     dl, 1
        jmp     .done
.four:
        mov     dl, 4
.done:
        pop     bx
        ret

; skip_extra_operands: CX=count, advancing [opp] by that many operands.
skip_extra_operands:
        jcxz    .done
.l:
        push    cx
        call    read_opp
        pop     cx
        loop    .l
.done:
        ret

is_buck_b50_encounter_048e:
        cmp     byte [is_gen2], 0
        jne     .no
        cmp     word [area_id], 50
        jne     .no
        cmp     word [pc], 048eh
        jne     .no
        cmp     byte [blk+048eh], 029h
        jne     .no
        cmp     word [opp], 04b1h
        jne     .no
        mov     al, 1
        ret
.no:
        xor     al, al
        ret

maybe_skip_buck_b50_encounter_extra:
        call    is_buck_b50_encounter_048e
        cmp     al, 0
        je      .ret
        mov     cx, 1
        call    skip_extra_operands
.ret:
        ret

maybe_read_buck_b50_encounter_extra:
        call    is_buck_b50_encounter_048e
        cmp     al, 0
        je      .ret
        call    read_opp
        call    opp_rvalue
        call    append_script_arg_ax
.ret:
        ret

maybe_buck_b98_encounter_island:
        ; Buck ECL3 block 98 has a control-room guard sequence where the
        ; second 0x29 menu frame contains an aligned CLEARMONSTERS /
        ; LOAD_MONSTER / LOAD_MONSTER / COMBAT island. The standard Gen1
        ; 14-operand ENCOUNTER_MENU framing would swallow that island and then
        ; reach a later naked COMBAT with an empty encounter.
        cmp     byte [is_gen2], 0
        jne     .no
        cmp     word [area_id], 98
        jne     .no
        cmp     word [pc], 19d3h
        jne     .no
        cmp     byte [blk+19d3h], 029h
        jne     .no
        cmp     byte [blk+1a92h], 01ch
        jne     .no
        cmp     byte [blk+1a93h], 00bh
        jne     .no
        cmp     byte [blk+1a9ah], 00bh
        jne     .no
        cmp     byte [blk+1aa1h], 024h
        jne     .no
        mov     word [pc], 1a92h
        mov     al, 1
        ret
.no:
        xor     al, al
        ret

; ============================================================================
;  resolve_target: last-read operand [o_word] = vaddr -> AX byte offset.
;  CF=1 if not in code (offset < [hdrlen] or >= blklen).
; ============================================================================
resolve_target:
        mov     ax, [o_word]
        cmp     ax, [vbaseval]
        jb      .keep
        sub     ax, [vbaseval]
.keep:
        cmp     ax, [hdrlen]
        jb      .bad
        cmp     ax, [blklen]
        jae     .bad
        clc
        ret
.bad:
        stc
        ret

; ============================================================================
; Signed comparisons, retaining the established register and CPU flag results.
set_cmp_flags:
        mov     ax, [cmp_l]
        mov     bx, [cmp_r]
set_cmp_flags_regs:
        cmp     ax, bx
        sete    byte [flag_eq]
        setne   byte [flag_ne]
        setl    byte [flag_lt]
        setg    byte [flag_gt]
        setle   byte [flag_le]
        setge   byte [flag_ge]
        mov     dl, [flag_ge]           ; retain the existing register result
        ret

; AX=0 is not found; every nonzero word is found.
set_bool_flags:
        or      ax, ax
        setne   byte [flag_eq]
        sete    byte [flag_ne]
        mov     word [flag_lt], 0
        mov     word [flag_le], 0
        ret

; ============================================================================
;  trace_line: emit "PC=NNNN OP=XX[ MEM[AAAA]=VVVV]" CRLF to CCECL.TRC.
;  Skipped entirely when [trace]==0.
; ============================================================================
trace_line:
        cmp     byte [trace], 0
        je      .r
        mov     di, linebuf
        mov     es, [our_seg]
        mov     si, s_pc
        call    cat
        mov     ax, [ins_off]
        call    put_hex16
        mov     si, s_op
        call    cat
        movzx   ax, byte [cur_op]
        call    put_hex8
        cmp     byte [mem_changed], 0
        je      .nomem
        mov     si, s_mem
        call    cat
        mov     ax, [last_addr]
        call    put_hex16
        mov     si, s_memv
        call    cat
        mov     ax, [last_val]
        call    put_hex16
.nomem:
        mov     al, 13
        stosb
        mov     al, 10
        stosb
        ; write linebuf..di to trace file
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, [trcfh]
        mov     ah, 40h
        push    ds
        push    es
        pop     ds                      ; ds = our_seg (linebuf lives here)
        int     21h
        pop     ds
.r:
        ret

; cat: copy ASCIIZ [ds:si] to es:di (di advanced).
cat:
        push    ds
        mov     ax, [cs:our_seg]
        mov     ds, ax
.l:
        lodsb
        or      al, al
        jz      .d
        stosb
        jmp     .l
.d:
        pop     ds
        ret

; put_hex16: AX -> 4 uppercase hex digits at es:di.
put_hex16:
        push    ax
        mov     al, ah
        call    put_hex8
        pop     ax
        call    put_hex8
        ret

; put_hex8: AL -> 2 uppercase hex digits at es:di.
put_hex8:
        push    ax
        push    bx
        mov     bl, al
        mov     al, bl
        shr     al, 4
        call    .nib
        mov     al, bl
        and     al, 0x0f
        call    .nib
        pop     bx
        pop     ax
        ret
.nib:
        cmp     al, 10
        jb      .dig
        add     al, 'A'-10
        jmp     .st
.dig:
        add     al, '0'
.st:
        stosb
        ret

; ============================================================================
;  open_trace / close_trace: create CCECL.TRC in the current dir.
; ============================================================================
open_trace:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_trcname
        int     21h
        jc      .err
        mov     [trcfh], ax
        ret
.err:
        mov     byte [trace], 0         ; disable tracing if we can't create it
        ret

close_trace:
        mov     bx, [trcfh]
        mov     ah, 3Eh
        int     21h
        ret

; ============================================================================
;  write_effects: create the GBEF binary effect record.
;  Layout:
;    00 char[4] magic "GBEF"
;    04 u16     version (=9)
;    06 u16     flags (1=LOAD_FILES, 2=LOAD_PIECES, 4=two-set pieces,
;                      8=queued encounter groups, 16=ADD_NPC joins,
;                      32=script side effects)
;    08 u16     vm status (0=exit, 1=chain, 3=combat, 4=halt)
;    10 u16     latest LOAD_FILES GEO id
;    12 u16[3]  LOAD_FILES operands; Gen2 DQK tags CA03 state in word 3
;    18 u16[3]  LOAD_PIECES raw operands
;    24 u16[3]  LOAD_PIECES resolved wall-set ids
;    30 u16     NEWECL chain id, if any
;    32 u16     queued encounter group count (v2, max ENCCAP emitted)
;    34 group[] {u16 monsterId, u16 count, u16 picBlock}
;    82 u16     ADD_NPC join count (v2, max NPCCAP emitted)
;    84 join[]  {u16 npcId, u16 morale}
;   116 char[4] resume magic "GBRS" (v3)
;   120 u16     resume flags (bit0=state present)
;   122 u16     current block/area id, or 0xFFFF for raw block inputs
;   124 u16     saved pc (post-COMBAT)
;   126 u32     RNG state
;   130 u16     call-stack depth
;   132 u16[32] call-stack return PCs
;   196 u16     sparse memory count
;   198 u16[512] memory keys
;  1222 u16[512] memory values
;  2246 char[4] script magic "GBSX" (v4/v5/v6)
;  2250 u16     script side-effect count (max SCRIPTCAP = 64)
;  2252 event[] {u16 opcode, u16 argc, u16 operands[8]}
;  3532 text[]  {u16 charCount, char ascii[32]} (v6)
;  5708 char[4] setup magic "GBES" (v7)
;  5712 u16     setup sprite id
;  5714 u16     setup max distance
;  5716 u16     setup picture id
;  5718 u16     setup current distance
;  5720 char[4] halt magic "GBHD" (v8)
;  5724 u16     halt reason (0=none, 1=bad opcode, 2=step budget,
;                            3=sparse memory full, 4=chain follow failure,
;                            7=script-effect capacity, 8=encounter capacity,
;                            9=call-stack capacity)
;  5726 u16     halt pc
;  5728 u16     halt opcode byte, or 0xFFFF if not available
;  5730 u16     active ECL area/block at the halt point
;  5732 char[4] clock magic "GBCL" (v9)
;  5736 u16[7]  mixed-radix clock slots, low to high
; ============================================================================
write_effects:
        movzx   ax, byte [vmstat]
        mov     [fx_status], ax
        mov     ax, [chain_id]
        mov     [fx_chain], ax
        mov     ax, [enc_count]
        mov     [fx_enc_count], ax
        mov     ax, [npc_count]
        mov     [fx_npc_count], ax
        mov     ax, [halt_reason]
        mov     [fx_halt_reason], ax
        mov     ax, [halt_pc]
        mov     [fx_halt_pc], ax
        mov     ax, [halt_opcode]
        mov     [fx_halt_opcode], ax
        mov     ax, [halt_area]
        mov     [fx_halt_area], ax

        ; The decoder buffer is free only after the final VM block. Build the
        ; fixed-width v9 record there from the live state, preserving its
        ; byte-for-byte layout while avoiding a second resident image.
        xor     ax, ax
        mov     di, fxhdr
        mov     cx, FX_V14_LEN/2
        rep     stosw
        mov     si, fx_state
        mov     di, fxhdr
        mov     cx, FX_PREFIX_LEN
        rep     movsb
        ; A restored menu prefix carries its v12 publication marker.  Ordinary
        ; completed effects retain the fixed v9 layout and version.
        mov     word [fxhdr+4], 9
        mov     word [fxhdr+RS_MAGIC_OFF], 'GB'
        mov     word [fxhdr+RS_MAGIC_OFF+2], 'RS'
        mov     word [fx_resume_flags], 0
        cmp     byte [vmstat], 3
        je      .has_resume
        cmp     byte [vmstat], 2
        jne     .resume_common
.has_resume:
        mov     word [fx_resume_flags], 1
.resume_common:
        cmp     byte [is_gen2], 2
        jne     .dialect_ready
        or      word [fx_resume_flags], 12 ; Secret long frames plus proven ECL RNG
.dialect_ready:
        mov     ax, [area_id]
        mov     [fx_resume_area], ax
        mov     ax, [pc]
        mov     [fx_resume_pc], ax
        mov     eax, [rng_state]
        mov     [fx_resume_rng], eax
        mov     ax, [callsp]
        mov     [fx_resume_callsp], ax
        mov     si, callstk
        mov     di, fx_resume_stack
        mov     cx, CALLCAP
        rep     movsw
        mov     ax, [memcount]
        mov     [fx_resume_memcount], ax
        mov     si, mem_keys
        mov     di, fx_resume_mem_keys
        mov     cx, MAXMEM
        rep     movsw
        mov     si, mem_vals
        mov     di, fx_resume_mem_vals
        mov     cx, MAXMEM
        rep     movsw
        mov     word [fxhdr+SX_MAGIC_OFF], 'GB'
        mov     word [fxhdr+SX_MAGIC_OFF+2], 'SX'
        mov     ax, [fx_script_count]
        mov     [fxhdr+SX_COUNT_OFF], ax
        mov     si, fx_script_events
        mov     di, fxhdr+SX_EVENTS_OFF
        mov     cx, SCRIPTCAP*SCRIPT_REC_BYTES
        rep     movsb
        mov     si, fx_script_texts
        mov     di, fxhdr+SX_TEXT_OFF
        mov     cx, SCRIPTCAP*SCRIPT_TEXT_REC_BYTES
        rep     movsb
        mov     word [fxhdr+ES_MAGIC_OFF], 'GB'
        mov     word [fxhdr+ES_MAGIC_OFF+2], 'ES'
        mov     ax, [fx_setup_sprite]
        mov     [fxhdr+ES_SPRITE_OFF], ax
        mov     ax, [fx_setup_max]
        mov     [fxhdr+ES_MAX_OFF], ax
        mov     ax, [fx_setup_pic]
        mov     [fxhdr+ES_PIC_OFF], ax
        mov     ax, [fx_setup_dist]
        mov     [fxhdr+ES_DIST_OFF], ax
        mov     word [fxhdr+HD_MAGIC_OFF], 'GB'
        mov     word [fxhdr+HD_MAGIC_OFF+2], 'HD'
        mov     ax, [fx_halt_reason]
        mov     [fxhdr+HD_REASON_OFF], ax
        mov     ax, [fx_halt_pc]
        mov     [fxhdr+HD_PC_OFF], ax
        mov     ax, [fx_halt_opcode]
        mov     [fxhdr+HD_OPCODE_OFF], ax
        mov     ax, [fx_halt_area]
        mov     [fxhdr+HD_AREA_OFF], ax
        mov     word [fxhdr+CL_MAGIC_OFF], 'GB'
        mov     word [fxhdr+CL_MAGIC_OFF+2], 'CL'
        mov     si, clock_slots
        mov     di, fxhdr+CL_SLOTS_OFF
        mov     cx, 7
        rep     movsw
        cmp     byte [vmstat], 2
        jne     .not_status_two
        cmp     byte [ack_pending], 1
        je      .ack_v15
        cmp     byte [is_gen2], 0
        je      .menu_v14
        mov     word [fxhdr+4], 15
        jmp     .menu_v14
.not_status_two:
        cmp     byte [vmstat], 4
        jne     .output_ready
        cmp     word [fx_halt_reason], HALT_SCRIPT_FULL
        jne     .output_ready
        ; HLIB/GLIB Gen2 VMs need their six comparison flags across a private
        ; capacity replay just as DoK does. CCFLOW routing remains host-gated.
        cmp     byte [is_gen2], 0
        je      .output_ready
        jmp     .capacity_v15
.menu_v14:
        cmp     word [fxhdr+4], 15
        je      .menu_version_ready
        mov     word [fxhdr+4], 14
.menu_version_ready:
        mov     word [fxhdr+MN_MAGIC_OFF], 'GB'
        mov     word [fxhdr+MN_MAGIC_OFF+2], 'MN'
        mov     word [fxhdr+MN_FLAGS_OFF], 1
        mov     word [fxhdr+MN_RESERVED_OFF], 0
        mov     ax, [menu_pending_dest]
        mov     [fxhdr+MN_DEST_OFF], ax
        cmp     word [menu_pending_opcode], 0022h
        jne     .menu_shape_ready
        mov     word [fxhdr+MN_FLAGS_OFF], 3
        mov     word [fxhdr+MN_DEST_OFF], 0ffffh
        mov     ax, [menu_pending_reserved]
        mov     [fxhdr+MN_RESERVED_OFF], ax
.menu_shape_ready:
        mov     ax, [menu_pending_count]
        mov     [fxhdr+MN_COUNT_OFF], ax
        mov     ax, [menu_pending_opcode]
        mov     [fxhdr+MN_OPCODE_OFF], ax
        mov     ax, [menu_event_index]
        mov     [fxhdr+MN_EVENT_OFF], ax
        mov     ax, [pc]
        mov     [fxhdr+MN_ID_PC_OFF], ax
        mov     ax, [area_id]
        mov     [fxhdr+MN_ID_AREA_OFF], ax
        mov     ax, [menu_pending_dest]
        mov     [fxhdr+MN_ID_DEST_OFF], ax
        mov     ax, [menu_pending_opcode]
        mov     [fxhdr+MN_ID_OPCODE_OFF], ax
        mov     word [fxhdr+MT_MAGIC_OFF], 'GB'
        mov     word [fxhdr+MT_MAGIC_OFF+2], 'MT'
        mov     ax, [menu_text_count]
        mov     [fxhdr+MT_COUNT_OFF], ax
        mov     si, menu_textbuf
        mov     di, fxhdr+MT_DATA_OFF
        mov     cx, MENU_TEXT_CAP
        rep     movsb
        ; V14 and V15 share their GBMS state. The extra raw-flag scratch
        ; is harmless for V14: its shorter closed extent omits that suffix.
        jmp     .write_v15_state
.capacity_v15:
        mov     word [fxhdr+4], 15
        jmp     .write_v15_state
.ack_v15:
        mov     word [fxhdr+4], 15
        mov     word [fxhdr+MN_MAGIC_OFF], 'GB'
        mov     word [fxhdr+MN_MAGIC_OFF+2], 'MN'
        mov     word [fxhdr+MN_FLAGS_OFF], 2
        mov     word [fxhdr+MN_DEST_OFF], 0ffffh
        mov     word [fxhdr+MN_COUNT_OFF], 1
        mov     word [fxhdr+MN_OPCODE_OFF], 001dh
        mov     ax, [menu_event_index]
        mov     [fxhdr+MN_EVENT_OFF], ax
        mov     ax, [pc]
        mov     [fxhdr+MN_ID_PC_OFF], ax
        mov     ax, [area_id]
        mov     [fxhdr+MN_ID_AREA_OFF], ax
        mov     word [fxhdr+MN_ID_DEST_OFF], 0ffffh
        mov     word [fxhdr+MN_ID_OPCODE_OFF], 001dh
.write_v15_state:
        mov     word [fxhdr+MS_MAGIC_OFF], 'GB'
        mov     word [fxhdr+MS_MAGIC_OFF+2], 'MS'
        mov     ax, [cmp_l]
        mov     [fxhdr+MS_CMP_L_OFF], ax
        mov     ax, [cmp_r]
        mov     [fxhdr+MS_CMP_R_OFF], ax
        mov     ax, [selected_party]
        mov     [fxhdr+MS_SELECTED_OFF], ax
        xor     ax, ax
        cmp     byte [selected_valid], 0
        je      .capacity_not_selected
        or      ax, 1
.capacity_not_selected:
        cmp     byte [selected_not_found], 0
        je      .capacity_flags_done
        or      ax, 2
.capacity_flags_done:
        mov     [fxhdr+MS_FLAGS_OFF], ax
        mov     dword [fxhdr+GBRF_MAGIC_OFF], 'GBRF'
        mov     si, flag_eq
        mov     di, fxhdr+GBRF_FLAGS_OFF
        mov     cx, 6
        rep     movsb
        mov     word [fxhdr+GBRF_RESERVED_OFF], 0
        cmp     byte [is_gen2], 2
        jne     .output_ready
        mov     word [fxhdr+4], 16
        mov     dword [fxhdr+SI_MAGIC_OFF], 'GBSI'
        mov     dword [fxhdr+SI_MAGIC_OFF+4], 00100001h
        mov     ax, [fxhdr+MS_FLAGS_OFF]
        mov     [fxhdr+SI_FLAGS_OFF], ax
        mov     ax, [selected_party]
        mov     [fxhdr+SI_SELECTED_OFF], ax
        mov     ax, [party_count]
        mov     [fxhdr+SI_COUNT_OFF], ax
        mov     word [fxhdr+SI_MAGIC_OFF+14], 0
.output_ready:
        cmp     byte [is_gen2], 2
        jne     .open_output
        cmp     word [fxhdr+4], 16
        jne     .write_v15_state        ; every Secret status retains actor identity
.open_output:
        mov     dx, efxname
        cmp     byte [efxname], 0
        jne     .create
        mov     dx, s_efxname
.create:
        mov     ah, 3Ch
        xor     cx, cx
        int     21h
        jc      .err
        mov     [efxfh], ax
        mov     bx, ax
        ; The serialized length is a format constant selected only by the
        ; pending-menu status.  Set it after DOS create, which is allowed to
        ; clobber CX; keeping it out of mutable VM state prevents a damaged
        ; count from creating a plausible truncated GBEF sidecar.
        mov     cx, FXLEN
        cmp     byte [vmstat], 2
        jne     .outlen_ready
        mov     cx, FX_V14_LEN
.outlen_ready:
        cmp     word [fxhdr+4], 16
        jne     .not_v16_length
        mov     cx, FX_V16_LEN
        jmp     .write_effect_length
.not_v16_length:
        cmp     word [fxhdr+4], 15
        jne     .write_effect_length
        mov     cx, FX_V15_LEN
.write_effect_length:
        mov     ah, 40h
        push    cx
        mov     dx, fxhdr
        int     21h
        pop     cx
        jc      .cerr
        cmp     ax, cx
        jne     .cerr
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
        jc      .err
        jmp     iy_write
.cerr:
        mov     bx, [efxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

%include "cokyield.inc"
%include "cokresume.inc"

; ============================================================================
;  puts: write ASCIIZ [ds:si] to stdout.
; ============================================================================
puts:
        mov     di, si
.l:
        cmp     byte [di], 0
        je      .w
        inc     di
        jmp     .l
.w:
        mov     cx, di
        sub     cx, si
        mov     ah, 40h
        mov     bx, 1
        mov     dx, si
        int     21h
        ret

; ============================================================================
;  read_seed_file: load a fixed GBPS party seed sidecar named by [seedname].
; ============================================================================
read_seed_file:
        mov     ax, 3D00h
        mov     dx, seedname
        int     21h
        jc      .err
        mov     [fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, PSLEN
        mov     dx, seedbuf
        int     21h
        mov     [seedlen], ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        mov     ax, [seedlen]
        cmp     ax, PS_V1_LEN
        jb      .err
        cmp     byte [seedbuf+0], 'G'
        jne     .err
        cmp     byte [seedbuf+1], 'B'
        jne     .err
        cmp     byte [seedbuf+2], 'P'
        jne     .err
        cmp     byte [seedbuf+3], 'S'
        jne     .err
        cmp     word [seedbuf+PS_VERSION_OFF], 1
        je      .version1
        cmp     word [seedbuf+PS_VERSION_OFF], 2
        je      .version2
        cmp     word [seedbuf+PS_VERSION_OFF], 3
        je      .version3
        cmp     word [seedbuf+PS_VERSION_OFF], 4
        je      .version4
        cmp     word [seedbuf+PS_VERSION_OFF], 6
        je      .version6
        cmp     word [seedbuf+PS_VERSION_OFF], 5
        jne     .err
        cmp     word [seedlen], PS_V5_LEN
        jne     .err
        jmp     .timers
.version6:
        cmp     word [seedlen], PS_V6_LEN
        jne     .err
        test    word [seedbuf+PS_FLAGS_OFF], 1
        jz      .err
        cmp     word [seedbuf+PS_COUNT_OFF], GEN1_ROWS_MAX
        ja      .err
        mov     si, seedbuf+PS_V5_LEN
        mov     di, owned_item_bits
        mov     cx, 32
        rep     movsb
        mov     byte [owned_items_valid], 1
        cmp     word [seedbuf+PS_V4_LEN], 0
        jne     .timers
        ; Older checkpoints can carry owned affects with unknown durations.
        mov     si, seedbuf+PS_V4_LEN
        mov     cx, TIMER_STATE_LEN+16
.unknown_timer:
        lodsb
        test    al, al
        jnz     .err
        loop    .unknown_timer
        jmp     .owned
.timers:
        cmp     word [seedbuf+PS_V4_LEN], 1
        jne     .err
        test    word [seedbuf+PS_FLAGS_OFF], 1
        jz      .err
        cmp     word [seedbuf+PS_COUNT_OFF], PARTY_ROWS_MAX
        ja      .err
        mov     si, seedbuf+PS_V4_LEN
        mov     di, timer_state
        mov     cx, TIMER_STATE_LEN+16
        rep     movsb
        mov     cx, [timer_count]
        cmp     cx, TIMER_CAP
        ja      .err
        cmp     word [seedbuf+PS_VERSION_OFF], 6
        jne     .timer_owned
        jcxz    .timer_owned_ready
.timer_owned:
        cmp     word [seedbuf+PS_V3_LEN], 1
        jne     .err
.timer_owned_ready:
        xor     bx, bx
.timer_sources:
        cmp     byte [timer_sources+bx], 2
        ja      .err
        inc     bx
        cmp     bx, 8
        jb      .timer_sources
        push    cx
        mov     di, seedbuf+PSLEN
        xor     ax, ax
        mov     cx, 256
        rep     stosb
        pop     cx
        mov     si, timer_records
.timer_owner:
        jcxz    .timer_bits
        movzx   ax, byte [si]
        test    ax, ax
        jz      .err
        cmp     ax, [seedbuf+PS_COUNT_OFF]
        ja      .err
        mov     bx, ax
        dec     bx
        cmp     byte [timer_sources+bx], 0
        je      .err
        shl     bx, 5
        movzx   ax, byte [si+1]
        test    ax, ax
        jz      .timer_next
        bts     word [seedbuf+PSLEN+bx], ax
.timer_next:
        add     si, 10
        loop    .timer_owner
.timer_bits:
        mov     si, seedbuf+PSLEN
        mov     di, seedbuf+PS_V3_LEN+2
        mov     cx, 256
        repe    cmpsb
        jne     .err
.timer_ages:
        mov     si, timer_ages
        mov     cx, 8
.age:
        lodsw
        test    ax, ax
        jnz     .err
        loop    .age
        jmp     .owned
.version1:
        cmp     word [seedlen], PS_V1_LEN
        jne     .err
        jmp     .version_ok
.version2:
        cmp     word [seedlen], PS_V2_LEN
        jne     .err
        jmp     .version_ok
.version3:
        cmp     word [seedlen], PS_V3_LEN
        jne     .err
        jmp     .version_ok
.version4:
        cmp     word [seedlen], PS_V4_LEN
        jne     .err
.owned:
        cmp     word [seedbuf+PS_V3_LEN], 1
        ja      .err
        mov     si, seedbuf+PS_V3_LEN
        mov     di, owned_affect_flags
        mov     cx, 258
        push    ds
        pop     es
        rep     movsb
.version_ok:

        mov     ax, [seedbuf+PS_FLAGS_OFF]
        test    ax, 0001h
        jz      .no_count
        mov     ax, [seedbuf+PS_COUNT_OFF]
        mov     [party_count], ax
.no_count:
        mov     ax, [seedbuf+PS_FLAGS_OFF]
        test    ax, 0002h
        jz      .no_ranger
        mov     ax, [seedbuf+PS_RANGER_OFF]
        or      ax, ax
        jz      .ranger0
        mov     byte [party_has_ranger], 1
        jmp     .no_ranger
.ranger0:
        mov     byte [party_has_ranger], 0
.no_ranger:
        mov     ax, [seedbuf+PS_FLAGS_OFF]
        test    ax, 0004h
        jz      .items
        mov     ax, [seedbuf+PS_DISTANCE_OFF]
        mov     [encounter_distance], ax

.items:
        movzx   cx, byte [seedbuf+PS_ITEM_COUNT_OFF]
        cmp     cx, PS_ITEM_CAP
        jbe     .items_count_ok
        mov     cx, PS_ITEM_CAP
.items_count_ok:
        xor     di, di
.item_loop:
        cmp     cx, 0
        je      .affects
        mov     ax, [seedbuf+PS_ITEMS_OFF+di]
        push    cx
        call    add_party_item
        pop     cx
        add     di, 2
        dec     cx
        jmp     .item_loop

.affects:
        movzx   cx, byte [seedbuf+PS_AFFECT_COUNT_OFF]
        cmp     cx, PS_AFFECT_CAP
        jbe     .affects_count_ok
        mov     cx, PS_AFFECT_CAP
.affects_count_ok:
        xor     di, di
.affect_loop:
        cmp     cx, 0
        je      .member_affects
        movzx   bx, byte [party_affect_count]
        cmp     bx, PARTY_AFFECT_MAX
        jae     .member_affects
        shl     bx, 1
        mov     ax, [seedbuf+PS_AFFECTS_OFF+di]
        mov     [party_affects+bx], ax
        inc     byte [party_affect_count]
        add     di, 2
        dec     cx
        jmp     .affect_loop

.member_affects:
        movzx   cx, byte [seedbuf+PS_MEMBER_AFFECT_COUNT_OFF]
        cmp     cx, PS_MEMBER_AFFECT_CAP
        jbe     .member_affects_count_ok
        mov     cx, PS_MEMBER_AFFECT_CAP
.member_affects_count_ok:
        xor     di, di
.member_affect_loop:
        cmp     cx, 0
        je      .moves
        mov     bx, [seedbuf+PS_MEMBER_AFFECTS_OFF+di]      ; one-based member
        mov     ax, [seedbuf+PS_MEMBER_AFFECTS_OFF+di+2]    ; affect id
        push    cx
        call    add_party_member_affect
        pop     cx
        add     di, 4
        dec     cx
        jmp     .member_affect_loop

.moves:
        movzx   cx, byte [seedbuf+PS_MOVE_COUNT_OFF]
        cmp     cx, PS_MOVE_CAP
        jbe     .moves_count_ok
        mov     cx, PS_MOVE_CAP
.moves_count_ok:
        xor     di, di
.move_loop:
        cmp     cx, 0
        je      .thieves
        mov     ax, [seedbuf+PS_MOVES_OFF+di]
        push    cx
        call    add_party_move
        pop     cx
        add     di, 2
        dec     cx
        jmp     .move_loop

.thieves:
        movzx   cx, byte [seedbuf+PS_THIEF_COUNT_OFF]
        cmp     cx, PS_THIEF_CAP
        jbe     .thieves_count_ok
        mov     cx, PS_THIEF_CAP
.thieves_count_ok:
        xor     di, di
.thief_loop:
        cmp     cx, 0
        je      .spells
        mov     ax, [seedbuf+PS_THIEVES_OFF+di]
        push    cx
        call    add_party_thief
        pop     cx
        add     di, 2
        dec     cx
        jmp     .thief_loop

.spells:
        movzx   cx, byte [seedbuf+PS_SPELL_COUNT_OFF]
        cmp     cx, PS_SPELL_CAP
        jbe     .spells_count_ok
        mov     cx, PS_SPELL_CAP
.spells_count_ok:
        xor     di, di
.spell_loop:
        cmp     cx, 0
        je      .member_spells
        mov     ax, [seedbuf+PS_SPELLS_OFF+di]
        push    cx
        call    add_party_spell
        pop     cx
        add     di, 2
        dec     cx
        jmp     .spell_loop

.member_spells:
        movzx   cx, byte [seedbuf+PS_MEMBER_SPELL_COUNT_OFF]
        cmp     cx, PS_MEMBER_SPELL_CAP
        jbe     .member_spells_count_ok
        mov     cx, PS_MEMBER_SPELL_CAP
.member_spells_count_ok:
        xor     di, di
.member_spell_loop:
        cmp     cx, 0
        je      .thief_matrix
        mov     ax, [seedbuf+PS_MEMBER_SPELLS_OFF+di]       ; spell id
        mov     bx, [seedbuf+PS_MEMBER_SPELLS_OFF+di+2]     ; one-based member
        push    cx
        call    add_party_member_spell
        pop     cx
        add     di, 4
        dec     cx
        jmp     .member_spell_loop

.thief_matrix:
        cmp     word [seedbuf+PS_VERSION_OFF], 2
        jb      .ok
        movzx   cx, byte [seedbuf+PS_THIEF_MATRIX_COUNT_OFF]
        cmp     cx, PS_THIEF_MATRIX_CAP
        jbe     .thief_matrix_count_ok
        mov     cx, PS_THIEF_MATRIX_CAP
.thief_matrix_count_ok:
        mov     [party_thief_matrix_count], cl
        mov     si, seedbuf+PS_THIEF_MATRIX_OFF
        mov     di, party_thief_matrix
        shl     cx, 3
        jcxz    .memory_seeds
        push    ds
        pop     es
        rep     movsb
.memory_seeds:
        cmp     word [seedbuf+PS_VERSION_OFF], 3
        jb      .ok
        movzx   cx, byte [seedbuf+PS_MEM_SEED_COUNT_OFF]
        cmp     cx, MEM_SEED_MAX
        jbe     .memory_seed_count_ok
        mov     cx, MEM_SEED_MAX
.memory_seed_count_ok:
        mov     [memory_seed_count], cl
        mov     si, seedbuf+PS_MEM_SEED_KEYS_OFF
        mov     di, memory_seed_keys
        push    cx
        shl     cx, 1
        jcxz    .memory_vals
        rep     movsb
.memory_vals:
        pop     cx
        mov     si, seedbuf+PS_MEM_SEED_VALS_OFF
        mov     di, memory_seed_vals
        shl     cx, 1
        jcxz    .ok
        rep     movsb
.ok:
        clc
        ret
.err:
        stc
        ret

; ============================================================================
;  read_roster_file: validate identity and exact extent before importing any
;  GBPR fields. V1 remains a legacy name/count-only input; title-specific data
;  is consumed only from an identity-matched v2 record.
; ============================================================================
read_roster_file:
        mov     word [who_fields_valid], 0 ; validity/column count never survive another admission
        mov     byte [cok_award_roster_valid], 0
        mov     byte [cok_award_live_count], 0
        mov     byte [roster_legacy], 0
        mov     byte [roster_dok], 0
        mov     byte [roster_compact], 0
        mov     word [roster_id], 0
        mov     word [roster_version], 0
        cmp     word [roster_expected_id], 0ffffh
        je      .err
        mov     ax, 3D00h
        mov     dx, rostername
        int     21h
        jc      .err
        mov     [rosterfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, rosterhdr
        int     21h
        jc      .close_err
        cmp     ax, 16
        jne     .close_err
        cmp     dword [rosterhdr], 'GBWN'
        jne     .actor_roster
        call    read_who_roster
        jc      .close_err
        jmp     .close_ok
.actor_roster:
        cmp     word [rosterhdr], 'GB'
        jne     .close_err
        cmp     word [rosterhdr+2], 'PR'
        jne     .close_err
        cmp     word [rosterhdr+8], GBPR_ENTRY_SIZE
        jne     .close_err
        mov     ax, [rosterhdr+6]
        cmp     ax, PARTY_ROWS_MAX
        ja      .close_err
        mov     [roster_left], ax
        mov     ax, [rosterhdr+4]
        mov     [roster_version], ax
        cmp     ax, GBPR_VERSION_V1
        je      .v1
        cmp     ax, GBPR_VERSION_V2
        jne     .close_err
        mov     ax, [rosterhdr+12]
        cmp     ax, GBPR_ID_COK
        je      .v2_cok
        cmp     ax, GBPR_ID_DOK
        je      .v2_compact
        cmp     ax, GBPR_ID_DQK
        jne     .close_err
.v2_compact:
        cmp     word [rosterhdr+10], GBPR_COMPACT_FLAG
        jne     .close_err
        jmp     .v2_identity
.v2_cok:
        cmp     word [rosterhdr+10], 0
        jne     .close_err
.v2_identity:
        cmp     word [rosterhdr+14], 1
        jne     .close_err
        mov     ax, [rosterhdr+12]
        cmp     word [roster_expected_id], 0
        je      .close_err
        cmp     ax, [roster_expected_id]
        jne     .close_err
        cmp     ax, GBPR_ID_COK
        je      .v2_source_cok
        cmp     ax, GBPR_ID_DOK
        je      .v2_source_dok
        cmp     byte [is_gen2], 1
        jne     .close_err
        jmp     .v2_expected_ok
.v2_source_cok:
        cmp     byte [is_cok], 1
        jne     .close_err
        jmp     .v2_expected_ok
.v2_source_dok:
        cmp     byte [is_dok], 1
        jne     .close_err
.v2_expected_ok:
        mov     [roster_id], ax
        cmp     ax, GBPR_ID_DOK
        je      .v2_dok
        cmp     ax, GBPR_ID_DQK
        jne     .v2_layout_done
.v2_dok:
        mov     byte [roster_compact], 1
        cmp     word [roster_id], GBPR_ID_DOK
        jne     .v2_layout_done
        mov     byte [roster_dok], 1
.v2_layout_done:
        jmp     .extent
.v1:
        ; V1's compact bit is shared by DoK and DQK, so it carries no title
        ; provenance. Accept only its canonical reserved words and layout bit;
        ; all v1 data is exposed as common count/name data only.
        cmp     word [rosterhdr+12], 0
        jne     .close_err
        cmp     word [rosterhdr+14], 0
        jne     .close_err
        cmp     word [rosterhdr+10], 0
        je      .v1_cok
        cmp     word [rosterhdr+10], GBPR_COMPACT_FLAG
        jne     .close_err
        ; V1 compact records cannot distinguish DoK from DQK. Keep their
        ; common names/count and shared normalized GBD1 movement field, but
        ; never route title-specific HP/condition or DoK XP by /ID.
        mov     byte [roster_legacy], 1
        mov     byte [roster_compact], 1
        cmp     word [roster_expected_id], GBPR_ID_COK
        je      .close_err
        cmp     word [roster_expected_id], 0
        je      .v1_compact_profile_ok
        cmp     word [roster_expected_id], GBPR_ID_DOK
        jne     .v1_compact_dqk
        cmp     byte [is_dok], 1
        jne     .close_err
        jmp     .v1_compact_profile_ok
.v1_compact_dqk:
        cmp     word [roster_expected_id], GBPR_ID_DQK
        jne     .close_err
        cmp     byte [is_gen2], 1
        jne     .close_err
.v1_compact_profile_ok:
        jmp     .extent
.v1_cok:
        ; The zero layout flag is the legacy 409-byte CCH shape. Preserve its
        ; established CoK behavior and reject an explicit non-CoK expectation.
        cmp     word [roster_expected_id], 0
        je      .v1_cok_ok
        cmp     word [roster_expected_id], GBPR_ID_COK
        jne     .close_err
.v1_cok_ok:
        cmp     byte [is_cok], 1
        je      .v1_cok_source_ok
        cmp     word [roster_expected_id], GBPR_ID_COK
        jne     .v1_cok_names_only
        jmp     .close_err
.v1_cok_names_only:
        mov     byte [roster_legacy], 1
        jmp     .extent
.v1_cok_source_ok:
        mov     word [roster_id], GBPR_ID_COK
.extent:
        ; Seek to EOF and require the exact declared extent before importing
        ; names or title fields. This rejects truncated and trailing rosters.
        mov     ax, [roster_left]
        mov     bx, GBPR_ENTRY_SIZE
        mul     bx
        add     ax, 16
        adc     dx, 0
        or      dx, dx
        jnz     .close_err
        mov     [roster_expected_len], ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        mov     bx, [rosterfh]
        int     21h
        jc      .close_err
        cmp     dx, 0
        jne     .close_err
        cmp     ax, [roster_expected_len]
        jne     .close_err
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 16
        mov     bx, [rosterfh]
        int     21h
        jc      .close_err
        mov     [party_count], ax
        mov     ax, [rosterhdr+6]
        mov     [party_count], ax
        mov     [cok_spell_count], ax
        mov     [roster_left], ax
        cmp     byte [roster_legacy], 0
        jne     .begin_records
        cmp     byte [roster_compact], 0
        jne     .dok_init
        mov     byte [party_thief_matrix_count], 0
        mov     byte [cok_spells_valid], 1
        jmp     .begin_records
.dok_init:
        mov     byte [party_move_count], 0
.begin_records:
        cmp     word [roster_left], 0
        je      .close_ok
.record_loop:
        mov     bx, [rosterfh]
        mov     ah, 3Fh
        mov     cx, GBPR_ENTRY_SIZE
        mov     dx, rosterbuf
        int     21h
        jc      .close_err
        cmp     ax, GBPR_ENTRY_SIZE
        jne     .close_err
        cmp     byte [rosterbuf+1], 15
        ja      .close_err
        cmp     byte [roster_compact], 0
        je      .name_ready
        cmp     word [rosterbuf+1+GBPR_DOK_META_OFF], 'GB'
        jne     .close_err
        cmp     word [rosterbuf+1+GBPR_DOK_META_OFF+2], 'D1'
        jne     .close_err
        test    word [rosterbuf+1+GBPR_DOK_META_FLAGS], GBPR_COMPACT_FLAG
        jz      .close_err
.name_ready:
        ; Preserve the roster's length-prefixed display name for interactive
        ; WHO.  All GBPR writers use the CCH/compact convention at body +0.
        mov     ax, [party_count]
        sub     ax, [roster_left]
        shl     ax, 4
        mov     di, party_names
        add     di, ax
        mov     si, rosterbuf+1
        mov     cx, PARTY_NAME_BYTES
        rep     movsb
        mov     bx, [party_count]
        sub     bx, [roster_left]
        mov     al, [rosterbuf+1+300]   ; CCHOST /N NPC mark (DQK 0x37 lookup)
        mov     [party_ext+bx], al
        cmp     byte [roster_legacy], 0
        jne     .spell_row_done
        cmp     word [roster_id], GBPR_ID_COK
        jne     .spell_row_done
        ; CoK GAME.OVR's opcode 41 counts only positive CCH+0F9h entries
        ; before dividing the requested award.  Retain that title-local
        ; state while importing the otherwise lossless GBPR body; the later
        ; handler reopens this same transient roster to make its XP writes.
        cmp     byte [rosterbuf+1+COK_CCH_ACTIVE_OFF], 0
        jle     .award_state_done
        inc     byte [cok_award_live_count]
.award_state_done:
        mov     ax, [cok_spell_count]
        sub     ax, [roster_left]
        cmp     ax, 6                   ; cok_spell_rows holds six CoK rows
        jae     .close_err
        mov     bx, 58
        mul     bx
        mov     di, cok_spell_rows
        add     di, ax
        mov     si, rosterbuf+1+30
        mov     cx, 58
        rep     movsb
.spell_row_done:
        mov     al, [rosterbuf+1]
        cmp     al, 1
        jb      .record_next
        cmp     al, 15
        ja      .record_next
        cmp     word [roster_id], GBPR_ID_COK
        jne     .record_compact
        cmp     byte [roster_legacy], 0
        jne     .record_next
        cmp     byte [party_thief_matrix_count], PARTY_THIEF_MAX
        jae     .record_next
        movzx   bx, byte [party_thief_matrix_count]
        shl     bx, 3
        mov     di, party_thief_matrix
        add     di, bx
        mov     si, rosterbuf+1+PS_COK_THIEF_OFF
        mov     cx, PS_THIEF_SKILL_COUNT
.cok_copy:
        lodsb
        mov     [di], al
        inc     di
        loop    .cok_copy
        inc     byte [party_thief_matrix_count]
        jmp     .record_next
.record_compact:
        cmp     word [rosterbuf+1+GBPR_DOK_META_OFF], 'GB'
        jne     .record_next
        cmp     word [rosterbuf+1+GBPR_DOK_META_OFF+2], 'D1'
        jne     .record_next
        test    word [rosterbuf+1+GBPR_DOK_META_FLAGS], GBPR_COMPACT_FLAG
        jz      .record_next
        mov     ax, [rosterbuf+1+GBPR_DOK_META_MOVE]
        or      ax, ax
        jz      .record_next
        call    add_party_move
.record_next:
        dec     word [roster_left]
        jnz     .record_loop
.close_ok:
        mov     bx, [rosterfh]
        mov     ah, 3Eh
        int     21h
        jc      .err
        cmp     byte [roster_legacy], 0
        jne     .close_ok_done
        cmp     word [roster_id], GBPR_ID_COK
        jne     .close_ok_done
        mov     byte [cok_award_roster_valid], 1
.close_ok_done:
        cmp     byte [who_fields_valid], 2
        jne     .fields_closed
        dec     byte [who_fields_valid] ; admission includes the checked close
.fields_closed:
        clc
        ret
.close_err:
        mov     bx, [rosterfh]
        mov     ah, 3Eh
        int     21h
.err:
        mov     word [who_fields_valid], 0
        stc
        ret

; ============================================================================
;  parse_args: <file> [/T]  |  <file.glb> <areaId> [/T]
; ============================================================================
%include "secretwhoroster.inc"

parse_args:
        ; Names and NPC marks belong only to this invocation's optional /B.
        ; DOS can retain the preceding .COM process's uninitialized storage.
        push    ds
        pop     es
        mov     di, party_ext
        xor     ax, ax
        mov     cx, (PARTY_ROWS_MAX * (PARTY_NAME_BYTES + 1)) / 2
        rep     stosw
        ; /B is optional. These writeback guards live in BSS, which DOS does
        ; not promise to clear for a .COM image, so reset them before parsing.
        mov     byte [cok_award_roster_valid], 0
        mov     byte [cok_award_live_count], 0
        mov     byte [owned_items_valid], 0
        mov     word [owned_affect_flags], 0
        mov     byte [cok_spells_valid], 0
        mov     word [timer_state], 0
        mov     byte [fname], 0
        mov     byte [efxname], 0
        mov     byte [resumename], 0
        mov     byte [outname], 0
        mov     byte [seedname], 0
        mov     byte [rostername], 0
        mov     word [roster_expected_id], 0
        mov     byte [statename], 0
        mov     dword [trace], 0
        mov     byte [resume_kind], 0
        mov     word [state_flag], 0
        mov     byte [interactive_menu], 0
        mov     byte [party_item_count], 0
        mov     byte [party_affect_count], 0
        mov     byte [party_member_affect_count], 0
        mov     byte [party_move_count], 0
        mov     byte [party_thief_count], 0
        mov     byte [party_thief_matrix_count], 0
        mov     byte [party_spell_count], 0
        mov     byte [party_member_spell_count], 0
        mov     word [party_count], 0
        mov     byte [party_has_ranger], 0
        mov     word [party_strength], 0
        mov     word [input_value], 0
        mov     word [menu_choice], 0
        mov     word [parlay_choice], 0
        mov     word [encounter_choice], 0
        mov     word [who_choice], 0
        mov     byte [who_choice_valid], 0
        mov     byte [who_names_valid], 0
        mov     word [who_fields_valid], 0
        mov     word [field_abort_sp], 0
        mov     word [encounter_distance], 0
        mov     byte [handler_mode], 0
        mov     word [cell_descriptor], 0
        mov     word [cell_facing], 0
        mov     byte [direct_pc_flag], 0
        mov     word [direct_pc_vaddr], 0
        mov     byte [memory_seed_count], 0
        mov     byte [selected_valid], 0
        mov     word [selected_party], 0
        mov     byte [selected_not_found], 0
        mov     word [area_id], 0xffff   ; sentinel: no numeric arg supplied
        mov     si, 81h
        ; terminate at CR
.term:
        mov     al, [si]
        or      al, al
        jz      .t0
        cmp     al, 0Dh
        je      .t0
        inc     si
        jmp     .term
.t0:
        mov     byte [si], 0
        mov     si, 81h
.sp1:
        cmp     byte [si], ' '
        jne     .file
        inc     si
        jmp     .sp1
.file:
        mov     di, fname
.cf:
        mov     al, [si]
        or      al, al
        jz      .fin
        cmp     al, ' '
        je      .cfd
        mov     [di], al
        inc     si
        inc     di
        jmp     .cf
.cfd:
        mov     byte [di], 0
        ; optional decimal area-id (Gen2: CCECL <file.glb> <areaId> [/T])
.sp2:
        cmp     byte [si], ' '
        jne     .aidchk
        inc     si
        jmp     .sp2
.aidchk:
        mov     al, [si]
        cmp     al, '0'
        jb      .scan
        cmp     al, '9'
        ja      .scan
        call    parse_next_word
        mov     [area_id], ax
        ; scan rest for /T
.scan:
        mov     al, [si]
        or      al, al
        jz      .fin
        cmp     al, '/'
        jne     .nx
        cmp     byte [si+1], '!'
        je      .set_interactive_menu
        cmp     byte [si+1], '@'
        je      .set_direct_pc
        cmp     byte [si+1], '2'
        je      .set_handler_slot2
        cmp     byte [si+1], '3'
        je      .set_handler_slot3
        cmp     byte [si+1], 'I'
        jne     .not_id
        cmp     byte [si+2], 'D'
        je      .set_title_id
.not_id:
        mov     ah, [si+1]
        and     ah, 0DFh
        cmp     ah, 'T'
        je      .set_trace
        cmp     ah, 'E'
        je      .set_effects
        cmp     ah, 'R'
        je      .set_resume
        cmp     ah, 'I'
        je      .set_party_item
        cmp     ah, 'A'
        je      .set_party_affect
        cmp     ah, 'U'
        je      .set_party_member_affect
        cmp     ah, 'M'
        je      .set_party_move
        cmp     ah, 'K'
        je      .set_party_thief
        cmp     ah, 'S'
        je      .set_party_spell
        cmp     ah, 'V'
        je      .set_party_member_spell
        cmp     ah, 'N'
        je      .set_party_count
        cmp     ah, 'H'
        je      .set_party_ranger
        cmp     ah, 'Z'
        je      .set_party_strength
        cmp     ah, 'L'
        je      .set_input_value
        cmp     ah, 'C'
        je      .set_menu_choice
        cmp     ah, 'Y'
        je      .set_parlay_choice
        cmp     ah, 'O'
        je      .set_encounter_choice
        cmp     ah, 'W'
        je      .set_who_choice
        cmp     ah, 'D'
        je      .set_encounter_distance
        cmp     ah, 'F'
        je      .set_facing
        cmp     ah, 'Q'
        je      .set_vmrun1
        cmp     ah, 'X'
        je      .set_memory_seed
        cmp     ah, 'G'
        je      .set_seed_file
        cmp     ah, 'B'
        je      .set_roster_file
        cmp     ah, 'J'
        je      .set_search_location
        cmp     ah, 'P'
        je      .set_persistent_state
        jmp     .nx
.set_interactive_menu:
        ; A yielded menu has no useful stdout-only result: force a GBEF output
        ; even when the caller omitted /E, retaining the traditional default.
        mov     byte [interactive_menu], 1
        mov     byte [effects], 1
        jmp     .nx
.set_trace:
        mov     byte [trace], 1
        jmp     .nx
.set_party_item:
        call    parse_opt_word
        call    add_party_item
        jmp     .scan
.set_party_affect:
        call    parse_opt_word
        movzx   bx, byte [party_affect_count]
        cmp     bx, PARTY_AFFECT_MAX
        jae     .scan
        shl     bx, 1
        mov     [party_affects+bx], ax
        inc     byte [party_affect_count]
        jmp     .scan
.set_party_member_affect:
        call    parse_opt_word
        mov     [t0], ax
        call    parse_next_word
        mov     bx, [t0]
        call    add_party_member_affect
        jmp     .scan
.set_party_move:
        call    parse_opt_word
        call    add_party_move
        jmp     .scan
.set_party_thief:
        call    parse_opt_word
        call    add_party_thief
        jmp     .scan
.set_party_spell:
        call    parse_opt_word
        call    add_party_spell
        jmp     .scan
.set_party_member_spell:
        call    parse_opt_word
        mov     [t0], ax
        call    parse_next_word
        mov     bx, [t0]
        call    add_party_member_spell
        jmp     .scan
.set_party_count:
        call    parse_opt_word
        mov     [party_count], ax
        jmp     .scan
.set_party_ranger:
        call    parse_opt_word
        or      ax, ax
        jz      .ranger0
        mov     byte [party_has_ranger], 1
        jmp     .scan
.ranger0:
        mov     byte [party_has_ranger], 0
        jmp     .scan
.set_party_strength:
        call    parse_opt_word
        mov     [party_strength], ax
        jmp     .scan
.set_input_value:
        call    parse_opt_word
        mov     [input_value], ax
        jmp     .scan
.set_menu_choice:
        call    parse_opt_word
        and     ax, 00ffh
        mov     [menu_choice], ax
        jmp     .scan
.set_parlay_choice:
        call    parse_opt_word
        and     ax, 00ffh
        mov     [parlay_choice], ax
        jmp     .scan
.set_encounter_choice:
        call    parse_opt_word
        and     ax, 00ffh
        mov     [encounter_choice], ax
        jmp     .scan
.set_who_choice:
        call    parse_opt_word
        and     ax, 00ffh
        mov     [who_choice], ax
        mov     byte [who_choice_valid], 1
        jmp     .scan
.set_encounter_distance:
        call    parse_opt_word
        and     ax, 00ffh
        mov     [encounter_distance], ax
        jmp     .scan
.set_facing:
        call    parse_opt_word
        and     ax, 00ffh
        mov     [cell_facing], ax
        jmp     .scan
.set_search_location:
        call    parse_opt_word
        mov     [cell_descriptor], ax
        mov     byte [handler_mode], 1
        jmp     .scan
.set_vmrun1:
        call    parse_opt_word
        mov     [cell_descriptor], ax
        mov     byte [handler_mode], 2
        jmp     .scan
.set_handler_slot2:
        call    parse_opt_word
        mov     [cell_descriptor], ax
        mov     byte [handler_mode], 4
        jmp     .scan
.set_handler_slot3:
        call    parse_opt_word
        mov     [cell_descriptor], ax
        mov     byte [handler_mode], 3
        jmp     .scan
.set_direct_pc:
        call    parse_opt_word
        mov     [direct_pc_vaddr], ax
        mov     byte [direct_pc_flag], 1
        jmp     .scan
.set_memory_seed:
        call    parse_opt_word
        mov     [t0], ax
        call    parse_next_word
        mov     bx, [t0]
        call    add_memory_seed
        jmp     .scan
.set_persistent_state:
        mov     byte [state_flag], 1
        mov     di, statename
        call    parse_path_arg
        jmp     .scan
.set_seed_file:
        mov     di, seedname
        call    parse_path_arg
        jmp     .scan
.set_roster_file:
        mov     di, rostername
        call    parse_path_arg
        jmp     .scan
.set_title_id:
        add     si, 3
        cmp     byte [si], ' '
        jne     .title_id_digit
        inc     si
.title_id_digit:
        cmp     byte [si], '1'
        jb      .bad_title_id
        cmp     byte [si], '4'
        ja      .bad_title_id
        cmp     byte [si+1], ' '
        je      .title_id_parse
        cmp     byte [si+1], 0
        jne     .bad_title_id
.title_id_parse:
        call    parse_next_word
        or      ax, ax
        jz      .bad_title_id
        cmp     ax, 4
        ja      .bad_title_id
        mov     [roster_expected_id], ax
        jmp     .scan
.bad_title_id:
        mov     word [roster_expected_id], 0ffffh
        jmp     .scan
.set_effects:
        mov     byte [effects], 1
        mov     di, efxname
        call    parse_path_arg
        jmp     .scan
.set_resume:
        mov     byte [resume_flag], 1
        mov     di, resumename
        call    parse_path_arg
.rop_sp:
        cmp     byte [si], ' '
        jne     .rop
        inc     si
        jmp     .rop_sp
.rop:
        cmp     byte [si], 0
        je      .scan
        cmp     byte [si], '/'
        je      .scan
        mov     di, outname
.ropcp:
        mov     al, [si]
        or      al, al
        jz      .ropd
        cmp     al, ' '
        je      .ropd
        mov     [di], al
        inc     si
        inc     di
        jmp     .ropcp
.ropd:
        mov     byte [di], 0
        jmp     .scan
.nx:
        inc     si
        jmp     .scan
.fin:
        mov     byte [di], 0
        ret

; parse decimal word after a one-letter option at [si] ("/X 123"). Returns AX
; and leaves SI at the first non-digit after the value.
parse_opt_word:
        add     si, 2
        jmp     parse_next_word

; Parse the first DOS path token after the current two-character option into
; DS:DI. A space ends it; a slash is left for parse_args to handle as its next
; option. This shared form keeps /P, /G, /B, /E and /R delimiter behavior.
parse_path_arg:
        add     si, 2
.skip:
        cmp     byte [si], ' '
        jne     .start
        inc     si
        jmp     .skip
.start:
        cmp     byte [si], 0
        je      .done
        cmp     byte [si], '/'
        je      .done
.copy:
        mov     al, [si]
        or      al, al
        jz      .done
        cmp     al, ' '
        je      .done
        cmp     al, '/'
        je      .done
        mov     [di], al
        inc     si
        inc     di
        jmp     .copy
.done:
        mov     byte [di], 0
        ret

parse_next_word:
.sp:
        cmp     byte [si], ' '
        jne     .num
        inc     si
        jmp     .sp
.num:
        xor     bx, bx
.dig:
        mov     al, [si]
        cmp     al, '0'
        jb      .done
        cmp     al, '9'
        ja      .done
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
        jmp     .dig
.done:
        mov     ax, bx
        ret

add_party_item:                         ; AX = item id, unique by low byte
        push    ax
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        mov     [t0], ax
        movzx   cx, byte [party_item_count]
        xor     di, di
.scan:
        cmp     cx, 0
        je      .store
        mov     bx, [party_items+di]
        and     bx, 00ffh
        cmp     bx, [t0]
        je      .done
        add     di, 2
        dec     cx
        jmp     .scan
.store:
        movzx   bx, byte [party_item_count]
        cmp     bx, PARTY_ITEM_MAX
        jae     .done
        shl     bx, 1
        mov     ax, [t0]
        mov     [party_items+bx], ax
        inc     byte [party_item_count]
.done:
        pop     di
        pop     cx
        pop     bx
        pop     ax
        ret

add_party_member_affect:                ; BX = one-based member, AX = affect id
        push    ax
        push    bx
        push    cx
        push    di
        and     ax, 00ffh
        and     bx, 00ffh
        or      bx, bx
        jz      .done
        mov     [t0], ax
        mov     [t1], bx
        movzx   cx, byte [party_member_affect_count]
        xor     di, di
.scan:
        cmp     cx, 0
        je      .store
        mov     bx, [party_member_affects+di]
        and     bx, 00ffh
        cmp     bx, [t0]
        jne     .next
        mov     bx, [party_member_affects+di+2]
        cmp     bx, [t1]
        je      .done
.next:
        add     di, 4
        dec     cx
        jmp     .scan
.store:
        movzx   bx, byte [party_member_affect_count]
        cmp     bx, PARTY_MEMBER_AFFECT_MAX
        jae     .done
        shl     bx, 2
        mov     ax, [t0]
        mov     [party_member_affects+bx], ax
        mov     ax, [t1]
        mov     [party_member_affects+bx+2], ax
        inc     byte [party_member_affect_count]
.done:
        pop     di
        pop     cx
        pop     bx
        pop     ax
        ret

add_party_spell:                        ; AX = spell id, preserves order
        push    ax
        push    bx
        and     ax, 00ffh
        movzx   bx, byte [party_spell_count]
        cmp     bx, PARTY_SPELL_MAX
        jae     .done
        shl     bx, 1
        mov     [party_spells+bx], ax
        inc     byte [party_spell_count]
.done:
        pop     bx
        pop     ax
        ret

add_party_member_spell:                 ; BX = one-based member, AX = spell id
        push    ax
        push    bx
        push    cx
        push    dx
        push    di
        and     ax, 00ffh
        and     bx, 00ffh
        or      bx, bx
        jz      .done
        mov     [t0], ax
        mov     [t1], bx
        mov     dx, 1                  ; next slot for this member
        movzx   cx, byte [party_member_spell_count]
        xor     di, di
.slot_scan:
        cmp     cx, 0
        je      .store
        mov     bx, [party_member_spells+di+2]
        cmp     bx, [t1]
        jne     .slot_next
        inc     dx
.slot_next:
        add     di, 6
        dec     cx
        jmp     .slot_scan
.store:
        movzx   bx, byte [party_member_spell_count]
        cmp     bx, PARTY_MEMBER_SPELL_MAX
        jae     .done
        mov     di, bx
        shl     di, 1
        shl     bx, 2
        add     di, bx                 ; index * 6
        mov     ax, [t0]
        mov     [party_member_spells+di], ax
        mov     ax, [t1]
        mov     [party_member_spells+di+2], ax
        mov     ax, dx
        mov     [party_member_spells+di+4], ax
        inc     byte [party_member_spell_count]
.done:
        pop     di
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

add_party_move:                         ; AX = movement byte, preserves order
        push    ax
        push    bx
        and     ax, 00ffh
        movzx   bx, byte [party_move_count]
        cmp     bx, PARTY_MOVE_MAX
        jae     .done
        shl     bx, 1
        mov     [party_moves+bx], ax
        inc     byte [party_move_count]
.done:
        pop     bx
        pop     ax
        ret

add_party_thief:                        ; AX = thief-skill byte, preserves order
        push    ax
        push    bx
        and     ax, 00ffh
        movzx   bx, byte [party_thief_count]
        cmp     bx, PARTY_THIEF_MAX
        jae     .done
        shl     bx, 1
        mov     [party_thieves+bx], ax
        inc     byte [party_thief_count]
.done:
        pop     bx
        pop     ax
        ret

add_memory_seed:                        ; BX = address, AX = value
        push    bx
        push    ax
        push    di
        movzx   di, byte [memory_seed_count]
        cmp     di, MEM_SEED_MAX
        jae     .done
        shl     di, 1
        mov     [memory_seed_keys+di], bx
        mov     [memory_seed_vals+di], ax
        inc     byte [memory_seed_count]
.done:
        pop     di
        pop     ax
        pop     bx
        ret

; ============================================================================
;  Strings & data
; ============================================================================
s_usage   db 'CCECL <block|dax blockId|glb areaId>',13,10
          db ' /T /E out /B party /G seed /R state outcome /@ vaddr',13,10,0
s_error_prefix db 'CCECL: ',0
s_noopen  db 'cannot open block file',13,10,0
s_badblk  db 'block too small for its header',13,10,0
s_needarea db 'GLB requires areaId',13,10,0
s_needblock db 'DAX requires blockId',13,10,0
s_gen2err db 'invalid GLB area/container',13,10,0
s_daxerr  db 'invalid DAX block/archive',13,10,0
s_dkkcfg  db 'DKK.CFG',0
s_pool4cfg db 'POOL4.CFG',0
s_treasurecfg db 'TREASURE.CFG',0
s_buckcfg db 'BUCK.CFG',0
s_matrixcfg db 'MATRIX.CFG',0
s_krynncfg db 'KRYNN.CFG',0
s_poolcfg db 'POOL.CFG',0
s_efxerr  db 'cannot write effect file',13,10,0
s_resumeerr db 'bad or unsupported resume state',13,10,0
s_seederr db 'bad or unsupported party seed sidecar',13,10,0
s_item_halt db 'Item removal pending.',13,10,0
s_script_full db 'CCECL: script-effect capacity reached; state saved.',13,10,0
s_encounter_full db 'CCECL: encounter capacity reached; combat rejected.',13,10,0
s_rostererr db 'bad or unsupported GBPR roster sidecar',13,10,0
; Six-bit packed ECL strings: "YES\0" and "NO\0" (three bytes each).
party_yes_text db 3,064h,054h,0c0h
party_no_text  db 3,038h,0f0h,000h
s_trcname db 'CCECL.TRC',0
s_efxname db 'CCECL.EFX',0
s_pc      db 'PC=',0
s_op      db ' OP=',0
s_mem     db ' MEM[',0
s_memv    db ']=',0
; Bit i says opcode i emits exactly one GBSX host effect.  This pre-dispatch
; map is deliberately shared by all capture paths, including CALL/PROGRAM/
; ECL_CLOCK and the menu helpers, so none can silently drop the 65th record.
script_event_mask db 00h,0c0h,27h,0a0h,8ch,7bh,9ah,27h
                  db 6eh,18h,00h,00h,00h,00h,00h,00h
                  db 00h,00h,00h,00h,02h,00h,00h,00h
                  db 00h,00h,00h,00h,00h,00h,00h,00h

; The live effect state lives in .bss. write_effects serializes it into the
; decoder scratch only after the final ECL block has run, so DAX chains retain
; their full 16 KiB compressed-member buffer while the emitted .COM no longer
; carries a second 5.7 KiB zero-filled GBEF image.
clock_radices dw 10,10,6,24,30,12
script_recording db 0
script_event_base dw 0
script_arg_index dw 0

; --- opcode table: 2 bytes per opcode {wordSet, countAt(0xFF=none)} 0x00..0x40
;     (mirrors packages/engine/src/ecl/opcodes.ts) ---
optab:
        db 0,0xff    ; 00 EXIT
        db 1,0xff    ; 01 GOTO
        db 1,0xff    ; 02 GOSUB
        db 2,0xff    ; 03 COMPARE
        db 3,0xff    ; 04 ADD
        db 3,0xff    ; 05 SUBTRACT
        db 3,0xff    ; 06 DIVIDE
        db 3,0xff    ; 07 MULTIPLY
        db 2,0xff    ; 08 RANDOM
        db 2,0xff    ; 09 SAVE
        db 1,0xff    ; 0A LOAD_CHARACTER
        db 3,0xff    ; 0B LOAD_MONSTER
        db 3,0xff    ; 0C SETUP_MONSTER
        db 0,0xff    ; 0D APPROACH
        db 1,0xff    ; 0E PICTURE
        db 2,0xff    ; 0F INPUT_NUMBER
        db 2,0xff    ; 10 INPUT_STRING
        db 1,0xff    ; 11 PRINT
        db 1,0xff    ; 12 PRINTCLEAR
        db 0,0xff    ; 13 RETURN
        db 4,0xff    ; 14 COMPARE_AND
        db 3,2       ; 15 VERTICAL_MENU (countAt=2)
        db 0,0xff    ; 16 IF_EQ
        db 0,0xff    ; 17 IF_NE
        db 0,0xff    ; 18 IF_LT
        db 0,0xff    ; 19 IF_GT
        db 0,0xff    ; 1A IF_LE
        db 0,0xff    ; 1B IF_GE
        db 0,0xff    ; 1C CLEARMONSTERS
        db 1,0xff    ; 1D PARTYSTRENGTH
        db 6,0xff    ; 1E CHECKPARTY
        db 2,0xff    ; 1F UNKNOWN_1F
        db 1,0xff    ; 20 NEWECL
        db 3,0xff    ; 21 LOAD_FILES
        db 2,0xff    ; 22 PARTY_SURPRISE
        db 4,0xff    ; 23 SURPRISE
        db 0,0xff    ; 24 COMBAT
        db 2,1       ; 25 ON_GOTO (countAt=1)
        db 2,1       ; 26 ON_GOSUB (countAt=1)
        db 8,0xff    ; 27 TREASURE
        db 3,0xff    ; 28 ROB
        db 14,0xff   ; 29 ENCOUNTER_MENU
        db 3,0xff    ; 2A GETTABLE
        db 2,1       ; 2B HORIZONTAL_MENU (countAt=1)
        db 6,0xff    ; 2C PARLAY
        db 1,0xff    ; 2D CALL
        db 5,0xff    ; 2E DAMAGE
        db 3,0xff    ; 2F AND
        db 3,0xff    ; 30 OR
        db 0,0xff    ; 31 SPRITE_OFF
        db 1,0xff    ; 32 FIND_ITEM
        db 0,0xff    ; 33 PRINT_RETURN
        db 2,0xff    ; 34 ECL_CLOCK
        db 3,0xff    ; 35 SAVE_TABLE
        db 2,0xff    ; 36 ADD_NPC
        db 3,0xff    ; 37 LOAD_PIECES
        db 1,0xff    ; 38 PROGRAM
        db 1,0xff    ; 39 WHO
        db 0,0xff    ; 3A DELAY
        db 3,0xff    ; 3B SPELL
        db 1,0xff    ; 3C PROTECTION
        db 0,0xff    ; 3D CLEAR_BOX
        db 0,0xff    ; 3E DUMP
        db 1,0xff    ; 3F FIND_SPECIAL
        db 1,0xff    ; 40 DESTROY_ITEMS
        db 2,0xff    ; 41 AWARD_XP (CoK applies; DoK records pending compact XP proof)

; ============================================================================
section .bss
alignb 2
our_seg     resw 1
fh          resw 1
rosterfh    resw 1
roster_expected_len resw 1
roster_version resw 1
cok_award_roster_valid resb 1
cok_award_live_count resb 1
cok_award_eligible resb 1
alignb 2
cok_award_mode resw 1
cok_award_amount resw 1
cok_award_share resw 1
cok_award_index resw 1
cok_award_entry_off resw 1
cok_award_xp_off resw 1
cok_award_xp resd 1
trcfh       resw 1
efxfh       resw 1
trace       resb 1
effects     resb 1
resume_flag resb 1
resume_pending resb 1
state_flag resb 1
resume_outcome resb 1
is_gen2     resb 1               ; 0 legacy; 1 HLIB/GLIB Gen2; 2 Secret-long GLIB
is_glib     resb 1               ; 1 if the Gen2 container is Amiga GLIB metadata
is_dax      resb 1               ; 1 if [fname] sniffed as a Gen1 DAX archive
is_dok      resb 1               ; DKK.CFG admission; distinct from DoK/PoD shared frames
use_cokrng resb 1                ; 0 generic; 1 CoK/DoK; 2 Secret ECL RANDOM only
is_cok resb 1                 ; Gen1 archive has KRYNN.CFG and no DKK.CFG sibling
is_matrix resb 1               ; MATRIX.CFG sibling: 0x4C takes 2 operands
is_pool resb 1                 ; Gen1 archive has POOL.CFG and uses vbase 0x98fe
short_opframes resb 1            ; DoK/PoD short operand-frame family (0x0C/1D/22/23/2C deltas)
short_menu_opframes resb 1       ; DoK/PoD/Buck verified interactive 0x31 frame
short2_frames resb 1             ; PoD/Treasures: 0x1F=1, 0x21 LOAD_FILES=2, 0x37=2 (POOL4.CFG / TREASURE.CFG)
area_id     resw 1               ; parsed Gen2 <areaId> / Gen1 DAX <blockId> (0xFFFF = not given)
party_item_count resb 1
owned_items_valid resb 1
owned_item_bits resb 32
party_items resw PARTY_ITEM_MAX
party_affect_count resb 1
party_affects resw PARTY_AFFECT_MAX
party_member_affect_count resb 1
party_member_affects resw PARTY_MEMBER_AFFECT_MAX * 2 ; affect, one-based member
party_move_count resb 1
party_moves resw PARTY_MOVE_MAX
party_thief_count resb 1
party_thieves resw PARTY_THIEF_MAX
party_thief_matrix_count resb 1
party_thief_matrix resb PARTY_THIEF_MAX * 8
party_spell_count resb 1
party_spells resw PARTY_SPELL_MAX
party_member_spell_count resb 1
party_member_spells resw PARTY_MEMBER_SPELL_MAX * 3 ; spell, one-based member, one-based slot
party_count resw 1
party_ext   resb PARTY_ROWS_MAX
party_names resb PARTY_ROWS_MAX * PARTY_NAME_BYTES ; u8 length + up to 15 ASCII bytes, from GBPR
party_has_ranger resb 1
party_strength resw 1
input_value resw 1
menu_choice resw 1
interactive_menu resb 1
parlay_choice resw 1
encounter_choice resw 1
who_choice resw 1
who_choice_valid resb 1
who_names_valid resb 1
who_fields_valid resb 1
who_field_columns resb 1
; Source profiles are selected once before roster admission. CoK spell and
; Secret field capabilities are mutually exclusive and reset by parse_args.
; Keep all six CoK58-byte rows; Secret uses at most6*14 bytes of this bank.
who_fields equ cok_spell_rows
field_abort_sp resw 1
encounter_distance resw 1
handler_mode resb 1
cell_descriptor resw 1
cell_facing resw 1
direct_pc_flag resb 1
direct_pc_vaddr resw 1
memory_seed_count resb 1
memory_seed_keys resw MEM_SEED_MAX
memory_seed_vals resw MEM_SEED_MAX
selected_valid resb 1
selected_party resw 1
selected_not_found resb 1
resume_len  resw 1
resume_kind resb 1
alignb 2
resume_menu_dest resw 1
resume_menu_count resw 1
resume_menu_opcode resw 1
resume_menu_selected resw 1
resume_menu_flags resw 1
hdrlen      resw 1               ; active dialect's block header length (Gen1 22 / Gen2 20)
vbaseval    resw 1               ; active dialect's vbase (Gen1 0x7FFE / Gen2 0x8000)
sniffbuf    resb 4               ; first 4 bytes of [fname], for the HLIB magic check
blklen      resw 1
pc          resw 1
opp         resw 1
stepc       resw 1
vmstat      resb 1
halt_reason resw 1
halt_area   resw 1
halt_pc     resw 1
halt_opcode resw 1
flow_stop   resb 1
cur_op      resb 1
skip_op     resb 1
skip_use_cur resb 1
ins_off     resw 1
chain_id    resw 1
chain_count resw 1
rng_state   resd 1

o_code      resb 1
o_high      resb 1
o_word      resw 1
o_text_off  resw 1
o_text_len  resw 1

cmp_l       resw 1
cmp_r       resw 1
; six contiguous flag bytes (EQ,NE,LT,GT,LE,GE) indexed by opcode-0x16
flag_eq     resb 1
flag_ne     resb 1
flag_lt     resb 1
flag_gt     resb 1
flag_le     resb 1
flag_ge     resb 1

t0          resw 1
t1          resw 1
t2          resw 1
t3          resw 1
tmptarget   resw 1
sel_vaddr   resw 1
have_sel    resw 1
call_raw_word resw 1
call_routine_id resw 1
call_redraw_x resw 1
call_redraw_y resw 1
call_redraw_facing resw 1
call_picture_frame resw 1
call_event_slot resw 1
program_id  resw 1
clock_slots resw 7

ws_n        resb 1
count_at    resb 1
count_extra resw 1
; op_script_effect's own copies, kept separate from the skip path's globals
fx_count_at resb 1
fx_count_extra resw 1

callsp      resw 1

last_addr   resw 1
last_val    resw 1
mem_changed resb 1
state_changed resb 1
bridge_repeat_count resw 1
menu_pc     resw 1
last_menu_pc resw 1
last_menu_dest resw 1
last_menu_choice resw 1
menu_seen   resb 1
alignb 2
menu_event_index resw 1
ack_pending resb 1
menu_pending_dest resw 1
menu_pending_count resw 1
menu_pending_opcode resw 1
menu_pending_reserved resw 1
last_clear_next_pc resw 1
menu_text_active resb 1
menu_text_overflow resb 1
menu_text_count resw 1
menu_text_used resw 1
menu_textbuf resb MENU_TEXT_CAP
memcount    resw 1
enc_count   resw 1
npc_count   resw 1

linebuf     resb 56              ; longest trace line is 31 bytes
fname       resb 128
efxname     resb 128
resumename  resb 128
outname     resb 128
seedname    resb 128
rostername  resb 128
roster_expected_id resw 1       ; /ID title identity supplied by GBBOOT
statename   resb 128
outbuf      resb 20
owned_affect_flags resw 1
owned_affect_matrix resb 256
cok_spells_valid resb 1
cok_spell_count resw 1
cok_spell_rows resb 6*58               ; CoK rows only: the roster loader rejects CoK counts above 6
timer_state resw 1
timer_count resw 1
timer_sources resb 8
timer_records resb TIMER_CAP*10
timer_ages resw 8
timer_elapsed resw 1
; Startup reads roster then seed, copies their live fields, and only afterward
; loads/decompresses any ECL block. These input buffers share that later scratch.
seedbuf     equ compbuf
seedlen     resw 1
rosterhdr   resb 16
rosterbuf   equ compbuf
roster_left resw 1
roster_dok  resb 1
roster_compact resb 1
roster_legacy resb 1
roster_id   resw 1
alignb 2
; Mutable GBEF prefix and script tails. The continuation payload itself is
; copied from the canonical VM arrays when write_effects serializes the record.
fx_state    resb FX_PREFIX_LEN
fx_version  equ fx_state+4
fx_flags    equ fx_state+6
fx_status   equ fx_state+8
fx_geo      equ fx_state+10
fx_files    equ fx_state+12
fx_piece_raw equ fx_state+18
fx_piece_set equ fx_state+24
fx_chain    equ fx_state+30
fx_enc_count equ fx_state+32
fx_enc_groups equ fx_state+34
fx_npc_count equ fx_state+82
fx_npc_joins equ fx_state+84
fx_script_count resw 1
fx_script_events resw SCRIPTCAP*SCRIPT_REC_WORDS
fx_script_texts resb SCRIPTCAP*SCRIPT_TEXT_REC_BYTES
; Profile detection completes before vm_reset_all initializes script effects.
profilepath equ fx_script_texts
fx_setup_sprite resw 1
fx_setup_max resw 1
fx_setup_pic resw 1
fx_setup_dist resw 1
fx_halt_reason resw 1
fx_halt_pc resw 1
fx_halt_opcode resw 1
fx_halt_area resw 1
fx_clock_slots equ clock_slots
mem_keys    resw MAXMEM
mem_vals    resw MAXMEM

callstk     resw CALLCAP

; The largest measured DAX ECL payload is 13,713 bytes compressed (13,353 raw);
; The accepted packed-input cap stays 14,500. Stream it through the full
; 13,264-byte inventory/header scratch; tail IO uses the dead script queue.
; Gen2/HLIB loads directly into the unchanged 16,000-byte decoded buffer.
BLKCAP      equ 16000
DAXCOMP_CAP equ 14500              ; accepted packed input domain is unchanged
SCRATCH_CAP equ IR_LEN_V3          ; tail IO aliases the dead script queue
%if IR_IO_CHUNK > SCRIPTCAP * SCRIPT_REC_BYTES
    %error "inventory continuation scratch exceeds the temporary script queue"
%endif
blk         resb BLKCAP
compbuf     resb SCRATCH_CAP
rbuf        equ compbuf          ; reloaded after block decompression on resume
; Compbuf is exclusively the decoder/resume buffer until all chained blocks
; have run. write_effects then uses it as the one-shot serialized GBEF record.
fxhdr       equ compbuf
fx_resume_flags equ fxhdr+RS_FLAGS_OFF
fx_resume_area equ fxhdr+RS_AREA_OFF
fx_resume_pc equ fxhdr+RS_PC_OFF
fx_resume_rng equ fxhdr+RS_RNG_OFF
fx_resume_callsp equ fxhdr+RS_CALLSP_OFF
fx_resume_stack equ fxhdr+RS_STACK_OFF
fx_resume_memcount equ fxhdr+RS_MEMCOUNT_OFF
fx_resume_mem_keys equ fxhdr+RS_KEYS_OFF
fx_resume_mem_vals equ fxhdr+RS_VALS_OFF

; ---- Gen1 DAX container scratch (load_dax_block) ----
daxtoc_bytes resw 1
dax_n       resw 1
dax_base    resw 1
dax_comp    resw 1
dax_out     resw 1
dax_bid     resb 1
; DAX and HLIB directory arrays share the block buffer. Each loader consumes
; its directory before reading/decoding the selected payload into blk.
daxtoc      equ blk

; ---- Gen2 ECL.GLB container-walk scratch (load_gen2_block) ----
ghdr        resb 16              ; the container's 16-byte HLIB header
gptrcount   resw 1               ; top-level pointer count
; These loader-only tables overlay blk; Gen2 directory data is dead before its
; selected member is read there. DAX's maximum TOC (128*9 bytes) also fits.
gptrs       equ blk
idtab       equ blk + GLB_PTRCAP*4
span_len    resw 1               ; scratch: current member's byte length
g_mstart    resd 1               ; scratch: current member's absolute file offset
g_memidx    resw 1               ; id-table lookup result: HLIB member index
g_found     resw 1               ; id-table lookup result: 1 if [area_id] matched

; ----------------------------------------------------------------------------
;  Stack. Anchored at the TOP of the .COM segment rather than reserved as a
;  block after the buffers above. DOS hands a .COM the whole 64 KB segment with
;  SP already at 0FFFEh, so this is where the stack lives anyway.
;
;  Reserving 1024 bytes here instead put the resident top at 0102AFh -- 687
;  bytes past 0FFFFh -- and NASM silently truncated `mov sp, stacktop` (start:)
;  to `mov sp, 02AFh`. SP then pointed into this program's own code. load_block
;  occupies 0290h..02B7h, so the first INT 21h of any run pushed FLAGS/CS/IP
;  over `int 21h` + `mov [blklen], ax` at 02A7h..02ACh; by the time .gen1_raw
;  called load_block those bytes were already garbage. `CCECL <block>.BIN /E
;  <out>.EFX` therefore produced neither an .EFX nor a diagnostic -- .die's
;  `call puts` (0288h) is destroyed by the same overlay. load_dax_block begins
;  at 02B8h, nine bytes above the truncated SP, which is the only reason the
;  `CCECL <file>.DAX <n> /E <out>.EFX` form kept working.
;
;  The build guard could not see this. native/build.ps1's .COM size check read
;  the SECTION-RELATIVE <res> offsets out of the .lst, so it measured .bss alone
;  (45,733 here) against the 64 KB limit and never added org 100h + the emitted
;  code -- it reported OK at 46,757 while the true top was 66,223. FIXED in the
;  same commit as this line: the guard now adds the base for a zero-based
;  `section .bss` and not for the `absolute` idiom, and it was mutation-tested by
;  building this file's own pre-fix revision, which it now rejects at 66,223.
;
;  A CLAIM THAT STOOD HERE BRIEFLY AND WAS FALSE: "ccfp.com currently overruns by
;  4,514 bytes unreported." It does not. ccfp.asm:5649 reserves its scratch with
;  `absolute ccfp_bss_start` at the current flat offset instead of `section .bss`,
;  so its listing offsets are ALREADY absolute -- its first <res> sits at 0413Ah,
;  exactly its 16,698-byte code size, where ccecl's sits at 017h. Adding the code
;  size to ccfp's figure double-counts it. Measured top: 53,352 bytes. Safe.
;
;  With the stack anchored absolutely, SP no longer depends on .bss growth. The
;  compact final-effect serializer leaves 63,263 bytes resident: 2,017 bytes
;  under build.ps1's 65,280 guard and 2,273 under the hard 0FFFFh segment top.
; ----------------------------------------------------------------------------
stacktop    equ 0FFFEh
