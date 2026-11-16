        cpu 386
        bits 16
        org 100h
%define CCHOST_DIRECT_DAMAGE 1
COK_CCH_XP_OFF equ 116h
DOK_META_OFF equ 216
DOK_META_FLAGS equ DOK_META_OFF+4
DOK_XP_CACHE_FLAG equ 0004h
DOK_XP_THRESH_OFF equ DOK_META_OFF+28
DOK_XP_OFF equ 62h
DOK_READY_OFF equ 0c6h
DOK_LEVELS_OFF equ 45h
DOK_AWARD_READ_LEN equ 277
DOK_CHAR_SIZE equ 216
GBCR_V1_CAST_OFF equ 12
GBCR_V1_CONSUMED_OFF equ 14
GBCR_BUF_LEN equ 16+(8*6)+1
GBTX_HEADER_LEN equ 10
GBTX_VERSION equ 1
GBTX_PREPARED equ 0
GBTX_FINALIZING equ 1
DOK_WIZ_SIZE equ 220
JOURNAL_SOURCE_REC_LEN equ 8
JOURNAL_SOURCE_LEN equ 6*JOURNAL_SOURCE_REC_LEN
DOK_WIZ_FIRST equ 34
DOK_WIZ_LAST equ 73
GBPR_VERSION_V1 equ 1
GBPR_VERSION_V2 equ 2
GBPR_ID_COK equ 1
GBPR_ID_DOK equ 2
GBPR_ID_DQK equ 3
GBPR_COMPACT_FLAG equ 1
DOK_MAGIC_MISSILE equ 15
PATH_MAX equ 112
GBEF_SCRIPT_MAGIC_OFF equ 2246
GBEF_SCRIPT_CAP equ 64
GBEF_SCRIPT_COUNT_OFF equ 2250
GBEF_SCRIPT_EVENTS_OFF equ 2252
GBEF_SCRIPT_EVENT_SIZE equ 20
FX_HAVE_SIDECAR equ 0100h
GBEF_V9_LEN equ 5750
GBEF_V14_LEN equ 5920
GBEF_V11_LEN equ GBEF_V9_LEN+24
GBEF_V12_LEN equ GBEF_V11_LEN+12
GBEF_MT_OFF equ GBEF_V12_LEN
GBEF_MN_OPCODE_OFF equ GBEF_V9_LEN+10
GBEF_V15_LEN equ 5932
GBEF_HD_MAGIC_OFF equ 5720
GBEF_HD_REASON_OFF equ 5724
GBHD_LOOP_DETECTED equ 10
GBEF_V15_FLAGS_OFF equ GBEF_V14_LEN+4
GBEF_V15_RESERVED_OFF equ GBEF_V15_FLAGS_OFF+6
GBDO_HEADER_LEN equ 16
GBDO_READ_LEN equ GBDO_HEADER_LEN+1
GBDJ_HEADER_LEN equ 480
GBDJ_VERSION equ 1
GBDJ_PREPARED equ 0
GBDJ_COMMITTED equ 1
GBDJ_COMPACT_FLAG equ 1
GBDJ_SOURCE_LEN equ 218
GBDJ_SOURCE_COUNT equ 6
GBDJ_SOURCE_TABLE_LEN equ GBDJ_SOURCE_LEN*GBDJ_SOURCE_COUNT
GBDJ_DATA_OFF equ GBDJ_HEADER_LEN+GBDJ_SOURCE_TABLE_LEN
GBHR_LEN equ 10+(PATH_MAX*3)
MODE_COK equ 1
MODE_GEN1 equ 2
MODE_OTHER equ 3
MODE_SECRET_HP equ 4
start:
        cld
        push cs
        pop ds
        mov sp,stacktop
        call parse_args
        jc bad_args
        cmp byte [npc_mode],1
        je npc_apply
        cmp byte [recovery_mode],1
        je recover_damage
        cmp byte [direct_mode],1
        je direct_damage
        call load_request
        jc bad_request
        cmp byte [secret_request_only], 0
        je .request_capability
        cmp word [mode], MODE_SECRET_HP
        jne bad_request
        mov si, rosterpath
        mov di, secret_expected_roster
        call sh_path_equal
        jne bad_request
.request_capability:
        cmp word [mode], MODE_SECRET_HP
        jne .ordinary_result
        call sh_apply
        jc bad_result
        cmp byte [secret_request_only], 3
        je secret_prepared
        jmp ready
.ordinary_result:
        call set_profile_marker
        ; Finish an interrupted v1 receipt before accepting a fresh result.
        ; The record is created before non-idempotent party/source mutation,
        ; so a failed receipt retry cannot award XP or consume a Cast twice.
        call recover_pending_finalization
        jc bad_request
%ifdef CCHOST_TEST_STOP_AFTER_RECOVERY
        cmp byte [journal_restored],0
        jne bad_result
%endif
        cmp byte [journal_recovered],0
        jne ready
        call load_combat_rng
        jc bad_result
        ; Validate both sides of the handoff before publishing CoK's final
        ; combat RNG.  A GBPR header without its declared body used to reach
        ; the write loop as EOF, which could extend the roster after the
        ; continuation had already advanced.
        mov     byte [preflight_only],1
        call    apply_combat_result_roster
        jc      bad_result
        mov     byte [preflight_only],0
        call    begin_v1_finalization
        jc      bad_result
        call sync_combat_rng
        jc bad_result
        ; Publish the resumable continuation before mutating persistent party
        ; records. A failed RNG/effect write must leave HP, conditions and XP
        ; untouched so rerunning the handoff cannot award combat XP twice.
        call apply_combat_result_roster
        jc bad_result
        call    commit_v1_finalization
        jc      bad_result
        jmp ready
direct_damage:
        mov word [gamep],game_cok
        mov word [effectreadp],effectpath
        cmp byte [damage_journal_mode],0
        jne .journal_mode
%ifndef CCHOST_TEST_SKIP_DAMAGE_TOKEN
        cmp byte [damage_token_requested],0
        je .apply
        call validate_damage_token
        jc bad_result
%endif
.apply:
        call apply_effect_damage_roster
        jc bad_result
        mov dx,s_damage_ready
        call puts
        mov ax,4c00h
        int 21h
.journal_mode:
        ; D.1: token validation always runs under /J, using the token path
        ; auto-derived at parse time (parse_args' .journal_flag).
        call validate_damage_token
        jc bad_result
        ; D.2/amendment C: an existing .GDJ can refuse, succeed trivially
        ; (already committed for this exact token), or be irrelevant and
        ; replaceable. Never mutate anything before this decision.
        call damage_journal_check_existing
        jnc .journal_proceed
        cmp byte [damage_journal_existing_kind],4
        je .journal_auto_recover
        cmp byte [damage_journal_existing_kind],1
        je .journal_recovery_required
        cmp byte [damage_journal_existing_kind],3
        je .journal_already_committed
        jmp bad_result
.journal_auto_recover:
        ; plan §20.5 A1/A2/A3: kind 4 (A1) is a PREPARED journal whose +32
        ; names this exact <effect>. Run the same reader+preflight+restore
        ; recover_damage_journal runs for /R, in production mode, before
        ; ever opening the effect for the producer scan -- so the handle
        ; peak here equals /R's own peak.
        mov byte [damage_journal_validate_only],0
%ifdef CCHOST_TEST_GBDJ_HOLD_HANDLES
        ; A3: hold K extra handles across only this call (never across the
        ; producer that follows), matching /R's own H8/H9 fixture shape.
        mov cx,CCHOST_TEST_GBDJ_HOLD_HANDLES
        mov di,damage_hold_fh
.journal_auto_hold:
        mov ax,3D02h
        mov dx,s_nul_device
        int 21h
        jc bad_result
        mov [di],ax
        add di,2
        loop .journal_auto_hold
%endif
        call recover_damage_journal
%ifdef CCHOST_TEST_GBDJ_HOLD_HANDLES
        ; Release before testing CF: none of mov/int 21h/loop below depend
        ; on incoming flags, and pushf/popf carries the call's own CF (and
        ; nothing else) across the release loop untouched.
        pushf
        mov cx,CCHOST_TEST_GBDJ_HOLD_HANDLES
        mov di,damage_hold_fh
.journal_auto_release:
        mov bx,[di]
        mov ah,3Eh
        int 21h
        add di,2
        loop .journal_auto_release
        popf
%endif
        jnc .journal_proceed
        ; A2 CF-set dispatch: reuse recover_damage's own three diagnostics.
        ; Do not alter recover_damage's own dispatch.
        cmp byte [damage_journal_preflight_bad],0
        jne .journal_auto_preflight_bad
        cmp byte [damage_journal_restore_bad],0
        jne .journal_auto_restore_bad
        jmp .journal_recovery_required
.journal_auto_preflight_bad:
        mov dx,s_damage_journal_preflight_bad
        call puts
        mov ax,4c01h
        int 21h
.journal_auto_restore_bad:
        mov dx,s_damage_journal_restore_bad
        call puts
        mov ax,4c01h
        int 21h
.journal_proceed:
        ; A prior interrupted /D /J can leave a temp .GDN sibling; only the
        ; proceed path may remove it (a refusal above must leave it alone).
        call damage_journal_delete_stale_gdn
        ; D4 (defect list plan §15.3, direct-damage-journal-v1.md amendment
        ; D.3): a real stale-".GDN" delete failure (anything but AX=2) must
        ; refuse with zero writes, not fall through into the write pass.
        jc bad_result
        call apply_effect_damage_roster
        jnc .journal_write_ok
        cmp byte [damage_journal_live],0
        jne .journal_incomplete
        jmp bad_result
.journal_write_ok:
        cmp byte [damage_journal_live],0
        je .journal_success
%ifdef CCHOST_TEST_GBDJ_D_CRASH
%if CCHOST_TEST_GBDJ_D_CRASH = 6
        mov ax,4C07h
        int 21h
%endif
%endif
        call damage_journal_commit
        jc .journal_incomplete
%ifdef CCHOST_TEST_GBDJ_D_CRASH
%if CCHOST_TEST_GBDJ_D_CRASH = 7
        mov ax,4C07h
        int 21h
%endif
%endif
.journal_success:
        mov dx,s_damage_ready
        call puts
        mov ax,4c00h
        int 21h
.journal_incomplete:
        mov dx,s_damage_journal_incomplete
        call puts
        mov ax,4c01h
        int 21h
.journal_recovery_required:
        mov dx,s_damage_journal_recovery_required
        call puts
        mov ax,4c01h
        int 21h
.journal_already_committed:
        mov dx,s_damage_journal_committed
        call puts
        mov ax,4c00h
        int 21h
recover_damage:
%ifdef CCHOST_TEST_GBDJ_HOLD_HANDLES
        ; Handle-budget fixture only (plan step 5): hold K extra handles open
        ; across the whole /R call, on the same NUL device, so the H8/H9/H9F
        ; fixtures measure 5 standard + K held + up to 7 retained destination
        ; handles against the real 20-entry JFT ceiling.
        mov     cx,CCHOST_TEST_GBDJ_HOLD_HANDLES
        mov     di,damage_hold_fh
.hold:  mov     ax,3D02h
        mov     dx,s_nul_device
        int     21h
        jc      bad_result
        mov     [di],ax
        add     di,2
        loop    .hold
%endif
        call recover_damage_journal
        jnc .reader_ok
        ; plan §22.5 J.1: an absent journal is not damage -- report it
        ; distinctly and exit 0, before the preflight/restore-bad dispatch.
        cmp byte [damage_journal_absent],0
        jne .absent
        cmp byte [damage_journal_preflight_bad],0
        jne .preflight_bad
        cmp byte [damage_journal_restore_bad],0
        jne .restore_bad
        jmp bad_result
.absent:
        mov dx,s_damage_journal_absent
        call puts
        mov ax,4c00h
        int 21h
.preflight_bad:
        mov dx,s_damage_journal_preflight_bad
        call puts
        mov ax,4c01h
        int 21h
.restore_bad:
        mov dx,s_damage_journal_restore_bad
        call puts
        mov ax,4c01h
        int 21h
.reader_ok:
        ; G1: COMMITTED is a genuine, structurally-checked success in every
        ; build. A PREPARED journal that clears every reader check, a real
        ; destination preflight (plan step 5) and a real restore (plan
        ; step 6) also reaches here with CF clear, in every build except the
        ; test-only accept-marker dry run (which never restores and always
        ; falls into the preflight-bad/restore-bad dispatch above via
        ; .bad -- it never sets damage_journal_committed either, so it always
        ; reaches bad_result there, not this label).
        cmp byte [damage_journal_committed],0
        je .not_committed
        mov dx,s_damage_journal_committed
        call puts
        mov ax,4c00h
        int 21h
.not_committed:
        ; plan §22.5 J.2: a successful PREPARED restore retires (deletes)
        ; the journal before reporting success; a retire failure is
        ; reported distinctly and exits 1, leaving the already-restored
        ; destinations and the PREPARED journal in place for another /R.
        call damage_journal_retire
        jc .not_retired
        mov dx,s_damage_recovered
        call puts
        mov ax,4c00h
        int 21h
.not_retired:
        mov dx,s_damage_journal_not_retired
        call puts
        mov ax,4c01h
        int 21h
ready:
        mov dx,s_ready
        call puts
        mov ax,4c00h
        int 21h
bad_args:
        mov dx,s_bad_args
        jmp short bad
bad_request:
        mov dx,s_bad_request
        jmp short bad
bad_result:
        mov dx,s_bad_result
bad:    ; DX names a diagnostic that retains the common invalid-request prefix.
        call puts
        mov ax,4c01h
        int 21h

; Validate the complete CoK GBCR before publishing its RNG to the paused
; continuation. The later roster routine revalidates the same result immediately
; before mutation, but it is too late to discover a short/body-invalid result
; after sync_combat_rng has changed GBEF. Read one byte beyond the largest legal
; record so a trailing byte is observable.
load_combat_rng:
        cmp     word [gamep], game_cok
        jne     .ok
        mov     ax, 3D00h
        mov     dx, combatresultpath
        int     21h
        jc      .fail
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, GBCR_BUF_LEN
        mov     dx, gbcrbuf
        int     21h
        push    ax
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 16
        jb      .fail
        mov     [gbcr_read_len], ax
        cmp     word [gbcrbuf], 'GB'
        jne     .fail
        cmp     word [gbcrbuf+2], 'CR'
        jne     .fail
        cmp     word [gbcrbuf+4], 2
        jne     .fail
        mov     ax, [gbcrbuf+10]
        cmp     ax, 8                   ; DQK rosters hold up to 8 rows
        ja      .fail
        imul    ax, ax, 6
        add     ax, 16
        cmp     ax, [gbcr_read_len]
        jne     .fail
        cmp     word [gbcrbuf+6], 3
        ja      .fail
        mov     cx, [gbcrbuf+10]
        mov     si, gbcrbuf+16
        xor     bx, bx
        jcxz    .ok
.rows:
        cmp     [si], bl
        jne     .fail
        cmp     byte [si+1], 3
        ja      .fail
        inc     bx
        add     si, 6
        loop    .rows
.ok:    clc
        ret
.fail:  stc
        ret

parse_args:
        mov si,81h
        call skip_space
        cmp byte [si],'/'
        jne .bad
        inc si
        mov al,[si]
        and al,0dfh
        cmp al,'D'
        je .damage
        cmp al,'R'
        je .recovery
        cmp al,'N'
        je .npc
        cmp al,'S'
        je .secret_recover
        cmp al,'C'
        je .secret_complete
        cmp al,'P'
        jne .generic_request
        mov byte [secret_request_only],3
        jmp .request_path
.secret_complete:
        mov byte [secret_request_only],2
        jmp .request_path
.secret_recover:
        mov byte [secret_request_only],1
        jmp .request_path
.generic_request:
        cmp al,'H'
        jne .bad
.request_path:
        inc si
        cmp byte [si],' '
        jne .bad
        call skip_space
        mov di,request_name
        call copy_token
        jc .bad
        cmp byte [request_name],0
        je .bad
        cmp byte [secret_request_only],0
        je .request_tail
        call skip_space
        mov di,secret_expected_roster
        call copy_token
        jc .bad
        cmp byte [secret_expected_roster],0
        je .bad
.request_tail:
        call skip_space
        mov al,[si]
        or al,al
        jz .ok
        cmp al,13
        jne .bad
.ok:    clc
        ret
.damage:
        inc si
        cmp byte [si],' '
        jne .bad
        call skip_space
        mov di,effectpath
        call copy_token
        jc .bad
        cmp byte [effectpath],0
        je .bad
        call skip_space
        mov di,rosterpath
        call copy_token
        jc .bad
        cmp byte [rosterpath],0
        je .bad
        call skip_space
        mov al,[si]
        or al,al
        jz .direct
        cmp al,13
        je .direct
        cmp al,'/'
        jne .bad
        inc si
        mov al,[si]
        and al,0dfh
        cmp al,'J'
        je .journal_flag
        cmp al,'T'
        jne .bad
        inc si
        cmp byte [si],' '
        jne .bad
        call skip_space
        mov di,damage_tokenpath
        call copy_token
        jc .bad
        cmp byte [damage_tokenpath],0
        je .bad
        call skip_space
        mov al,[si]
        or al,al
        jz .token
        cmp al,13
        jne .bad
.token: mov byte [damage_token_requested],1
        jmp .direct
.journal_flag:
        ; /J is mutually exclusive with /T (checked above: whichever flag
        ; letter is seen first is the only one parse_args will accept) and
        ; must be exactly "/J" followed by end/CR or a single run of spaces
        ; then end/CR -- never a token path of its own.
        inc si
        mov al,[si]
        or al,al
        jz .journal_ok
        cmp al,13
        je .journal_ok
        cmp al,' '
        jne .bad
        call skip_space
        mov al,[si]
        or al,al
        jz .journal_ok
        cmp al,13
        jne .bad
.journal_ok:
        ; D.2/D.3: under /J the effect and roster must already be canonical
        ; absolute identities (plain /D and /D /T take them as free-form
        ; tokens); the token and save-directory paths are then derived, not
        ; supplied.
        push si
        mov si,effectpath
        call validate_absolute_path
        pop si
        jc .bad
        push si
        mov si,rosterpath
        call validate_absolute_path
        pop si
        jc .bad
        call make_damage_dop_name
        jc .bad
        call damage_journal_derive_save_dir
        jc .bad
        mov byte [damage_journal_mode],1
.direct:
        mov byte [direct_mode],1
        clc
        ret
.npc:
        ; /N <effect> <MONCHA.GLB> <roster>: apply recorded DQK ADD_NPC joins.
        inc si
        cmp byte [si],' '
        jne .bad
        call skip_space
        mov di,effectpath
        call copy_token
        jc .bad
        cmp byte [effectpath],0
        je .bad
        call skip_space
        mov di,npc_monpath
        call copy_token
        jc .bad
        cmp byte [npc_monpath],0
        je .bad
        call skip_space
        mov di,rosterpath
        call copy_token
        jc .bad
        cmp byte [rosterpath],0
        je .bad
        call skip_space
        mov al,[si]
        or al,al
        jz .npc_ok
        cmp al,13
        jne .bad
.npc_ok:
        mov byte [npc_mode],1
        clc
        ret
.recovery:
        inc si
        cmp byte [si],' '
        jne .bad
        call skip_space
        mov di,rosterpath
        call copy_token
        jc .bad
        push si
        mov si,rosterpath
        call validate_absolute_path
        pop si
        jc .bad
        ; plan §27.5, amendment K: a bare "/R <roster>" (no second argument)
        ; derives the save directory the same way /D /J does, instead of
        ; requiring the caller to supply one. Two-argument form below is
        ; unchanged.
        call skip_space
        mov al,[si]
        or al,al
        jz .derive_savedir
        cmp al,13
        jne .savedir_arg
.derive_savedir:
        call damage_journal_derive_save_dir
        jc .bad
        jmp .recovered
.savedir_arg:
        mov di,damage_source_dir
        call copy_token
        jc .bad
        push si
        mov si,damage_source_dir
        call validate_absolute_path
        pop si
        jc .bad
        ; G2: the save directory is the target for <dir>\CHRDATA<n>.GAM, at
        ; most 111 characters combined, so the directory itself is bounded to
        ; 98 characters. copy_token already caps it at PATH_MAX-1 (111), so
        ; this is the only place that rejects the 99..111 range. SI must come
        ; back pointing into the real command tail afterward -- the trailing-
        ; argument check right below reads from wherever SI leaves off, and
        ; the scan below walks SI across the static damage_source_dir buffer,
        ; not the tail, so it is saved and restored around the scan.
        push si
        mov si,damage_source_dir
        xor cx,cx
.dirlen:
        mov al,[si]
        or al,al
        jz .dirlen_done
        inc cx
        inc si
        jmp .dirlen
.dirlen_done:
        pop si
        cmp cx,98
        ja .bad
        call skip_space
        mov al,[si]
        or al,al
        jz .recovered
        cmp al,13
        jne .bad
.recovered:
        mov byte [recovery_mode],1
        clc
        ret
.bad: stc
        ret
load_request:
        mov ax,3d00h
        mov dx,request_name
        int 21h
        jc .bad
        mov [fh],ax
        mov bx,ax
        mov cx,GBHR_LEN+1
        mov dx,request
        mov ah,3fh
        int 21h
        push ax
        mov bx,[fh]
        mov ah,3eh
        int 21h
        pop ax
        cmp ax,GBHR_LEN
        jne .bad_mode
        cmp word [request],'GB'
        jne .bad_magic
        cmp word [request+2],'HR'
        jne .bad_magic
        cmp word [request+4],2
        jne .legacy_version
        cmp word [request+6],MODE_SECRET_HP
        jne .bad_mode
        mov ax,MODE_SECRET_HP
        jmp .mode
.legacy_version:
        cmp word [request+4],1
        jne .bad_magic
        mov ax,[request+6]
        cmp ax,MODE_COK
        je .mode
        cmp ax,MODE_GEN1
        je .mode
        cmp ax,MODE_OTHER
        jne .bad_mode
.mode:  mov [mode],ax
        cmp word [request+8],0
        jne .bad_magic
        mov si,request+10
        mov di,combatresultpath
        call copy_canonical_path
        jc .bad_result_path
        mov si,request+10+PATH_MAX
        mov di,rosterpath
        call copy_canonical_path
        jc .bad_roster_path
        mov si,request+10+(PATH_MAX*2)
        mov di,effectpath
        call copy_canonical_path
        jc .bad_effect_path
        ; A CCFLOW loop record (GBHD reason 10) is never a completed combat
        ; handoff: reject it before any roster/RNG/journal work.
        call reject_loop_effect
        jc .bad_loop
        clc
        ret
.bad_loop:
        mov dx,s_bad_loop_effect
        call puts
.bad:   stc
        ret
.bad_magic:
        mov dx,s_bad_magic
        call puts
        jmp short .bad
.bad_mode:
        mov dx,s_bad_mode
        call puts
        jmp short .bad
.bad_result_path:
        mov dx,s_bad_result_path
        call puts
        jmp short .bad
.bad_roster_path:
        mov dx,s_bad_roster_path
        call puts
        jmp short .bad
.bad_effect_path:
        mov dx,s_bad_effect_path
        call puts
        jmp short .bad
; CF set when the effect file carries GBHD reason 10.  An unopenable or short
; file is not this check's concern (other validators own that).
reject_loop_effect:
        mov ax,3d00h
        mov dx,effectpath
        int 21h
        jc .no
        mov [fh],ax
        mov bx,ax
        mov ax,4200h
        xor cx,cx
        mov dx,GBEF_HD_MAGIC_OFF
        int 21h
        jc .close_no
        mov bx,[fh]
        mov ah,3fh
        mov cx,6
        mov dx,loopchk
        int 21h
        jc .close_no
        cmp ax,6
        jne .close_no
        mov bx,[fh]
        mov ah,3eh
        int 21h
        cmp word [loopchk],'GB'
        jne .no
        cmp word [loopchk+2],'HD'
        jne .no
        cmp word [loopchk+4],GBHD_LOOP_DETECTED
        jne .no
        stc
        ret
.close_no:
        mov bx,[fh]
        mov ah,3eh
        int 21h
.no:    clc
        ret
copy_canonical_path:
        push ax
        push bx
        push cx
        xor bx,bx
        mov cx,PATH_MAX
.loop:  lodsb
        or bh,bh
        jne .padding
        or al,al
        jz .nul
        stosb
        inc bl
        loop .loop
        jmp .bad
.nul:   or bl,bl
        jz .bad
        mov bh,1
        mov byte [di],0
        inc di
        loop .loop
        jmp .ok
.padding:
        or al,al
        jne .bad
        loop .loop
.ok:    pop cx
        pop bx
        pop ax
        clc
        ret
.bad:   pop cx
        pop bx
        pop ax
        stc
        ret
set_profile_marker:
        cmp word [mode],MODE_COK
        jne .not_cok
        mov word [gamep],game_cok
        jmp .paths
.not_cok:
        cmp word [mode],MODE_GEN1
        jne .other
        mov word [gamep],game_gen1
        jmp .paths
.other: mov word [gamep],game_dqk
.paths: mov word [effectreadp],effectpath
        ret

skip_space:
        cmp byte [si],' '
        jne .ret
        inc si
        jmp skip_space
.ret:   ret
copy_token:
        mov cx,PATH_MAX-1
.loop:  lodsb
        or al,al
        jz .done
        cmp al,13
        je .done
        cmp al,' '
        je .done
        stosb
        loop .loop
        stc
        ret
.done:  dec si                  ; leave delimiter for parse_args' trailing check
        mov byte [di],0
        clc
        ret

; /R takes identities rather than a current-directory-relative convenience
; path. DOS accepts C:FOO as drive-relative, which is not stable enough to
; bind a retained journal, so require strict canonical form (G3):
; X:\ with the drive in A..Z, one or more non-empty components separated by
; a single backslash, no lowercase a..z anywhere, no '/', no empty component
; (so no "\\" and no trailing "\", meaning the bare root "X:\" is rejected),
; and no component equal to "." or "..".
validate_absolute_path:
        mov     al,[si]
        cmp     al,'A'
        jb      .bad
        cmp     al,'Z'
        ja      .bad
        mov     al,[si+1]
        cmp     al,':'
        jne     .bad
        mov     al,[si+2]
        cmp     al,5Ch
        jne     .bad
        add     si,3
        xor     cx,cx           ; current component length
        xor     bx,bx           ; bl/bh = component's first/second byte
.scan:  mov     al,[si]
        or      al,al
        jz      .end
        cmp     al,'a'
        jb      .not_lower
        cmp     al,'z'
        ja      .not_lower
        jmp     .bad
.not_lower:
        cmp     al,'/'
        je      .bad
        cmp     al,5Ch
        jne     .charok
        jcxz    .bad            ; "\\" or a leading separator: empty component
        call    validate_path_dot_component
        jc      .bad
        xor     cx,cx
        xor     bx,bx
        inc     si
        jmp     .scan
.charok:
        inc     cx
        cmp     cx,1
        jne     .charok2
        mov     bl,al
        jmp     .adv
.charok2:
        cmp     cx,2
        jne     .adv
        mov     bh,al
.adv:   inc     si
        jmp     .scan
.end:   jcxz    .bad            ; trailing "\" or the bare root "X:\"
        call    validate_path_dot_component
        jc      .bad
        clc
        ret
.bad:   stc
        ret

; CX = the just-scanned component's length, BL/BH its first two bytes (valid
; only up to CX). Returns CY set iff the component is exactly "." or "..".
validate_path_dot_component:
        cmp     cx,1
        je      .one
        cmp     cx,2
        jne     .ok
        cmp     bl,'.'
        jne     .ok
        cmp     bh,'.'
        jne     .ok
        stc
        ret
.one:   cmp     bl,'.'
        jne     .ok
        stc
        ret
.ok:    clc
        ret

; An opt-in /D token is format validation only.  It is deliberately separate
; from the later transaction receipt: a GBDO header has no effect/roster binding
; and therefore cannot yet establish exactly-once delivery.
validate_damage_token:
        mov ax,3d00h
        mov dx,damage_tokenpath
        int 21h
        jc .bad
        mov [damage_token_fh],ax
        mov bx,ax
        mov ah,3fh
        mov cx,GBDO_READ_LEN
        mov dx,damage_token_header
        int 21h
        jc .close_bad
        cmp ax,GBDO_HEADER_LEN
        jne .close_bad
        cmp dword [damage_token_header],'GBDO'
        jne .close_bad
        cmp word [damage_token_header+4],1
        jne .close_bad
        cmp word [damage_token_header+6],1
        jne .close_bad
        mov ax,[damage_token_header+8]
        mov [damage_token_generation],ax
        mov ax,[damage_token_header+10]
        mov [damage_token_generation+2],ax
        mov ax,[damage_token_header+12]
        mov [damage_token_generation+4],ax
        mov ax,[damage_token_header+14]
        mov [damage_token_generation+6],ax
        mov ax,[damage_token_generation]
        or ax,[damage_token_generation+2]
        or ax,[damage_token_generation+4]
        or ax,[damage_token_generation+6]
        jz .close_bad
        mov bx,[damage_token_fh]
        mov ah,3eh
        int 21h
        jc .bad
        clc
        ret
.close_bad:
        mov bx,[damage_token_fh]
        mov ah,3eh
        int 21h
.bad:   stc
        ret
puts:   mov ah,09h
        int 21h
        ret
apply_combat_result_roster:
        cmp     word [gamep], game_cok
        je      .run
        cmp     word [gamep], game_pool
        je      .run
        cmp     word [gamep], game_curse
        je      .run
        cmp     word [gamep], game_secret
        je      .run
        cmp     word [gamep], game_gateway
        je      .run
        cmp     word [gamep], game_treasures
        je      .run
        cmp     word [gamep], game_pod
        je      .run
        cmp     word [gamep], game_nwn
        je      .run
        cmp     word [gamep], game_buck
        je      .run
        cmp     word [gamep], game_matrix
        je      .run
        cmp     word [gamep], game_gen1
        je      .run
        cmp     word [gamep], game_dok
        je      .run
        cmp     word [gamep], game_dqk
        jne     .ok
.run:
        mov     ax, 3D00h
        mov     dx, combatresultpath
        int     21h
        jc      .missing_result
        mov     [auto_fh], ax
        mov     [gbcr_roster_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, GBCR_BUF_LEN
        mov     dx, gbcrbuf
        int     21h
        jc      .close_result_fail
        cmp     ax, 16
        jb      .close_result_fail
        mov     [gbcr_read_len], ax
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jc      .fail
        cmp     word [gbcrbuf], 'GB'
        jne     .fail
        cmp     word [gbcrbuf+2], 'CR'
        jne     .fail
        mov     ax, 1
        cmp     word [gamep], game_cok
        jne     .version_ready
        inc     ax
.version_ready:
        cmp     [gbcrbuf+4], ax
        jne     .fail
        mov     ax, [gbcrbuf+10]
        cmp     ax, 8                   ; DQK rosters hold up to 8 rows
        ja      .fail
        mov     [gbcr_count], ax
        ; A GBCR record is a fixed header followed by precisely count six-byte
        ; rows.  This is a host boundary: enforce it for Gen1 and Gen2 as well
        ; as CoK, so a short non-CoK result cannot be read as zero-filled rows.
        imul    ax, ax, 6
        add     ax, 16
        cmp     ax, [gbcr_read_len]
        jne     .fail
        cmp     word [gbcrbuf+6], 3
        ja      .fail
        ; GBCR v1 reserves its last header word for a completed persistent
        ; handoff.  CCCOMBAT writes zero; a prior CCHOST success marks it so a
        ; replay cannot repeat HP, condition, or compact combat-XP mutation.
        cmp     word [gbcrbuf+4], 1
        jne     .result_fresh
        cmp     word [gbcrbuf+GBCR_V1_CONSUMED_OFF], 0
        jne     .fail
.result_fresh:
        mov     cx, [gbcr_count]
        mov     si, gbcrbuf+16
        xor     bx, bx
        jcxz    .result_ready
.result_records:
        cmp     [si], bl
        jne     .fail
        cmp     byte [si+1], 3
        ja      .fail
        inc     bx
        add     si, 6
        loop    .result_records
.result_ready:

        mov     ax, 3D02h
        mov     dx, rosterpath
        int     21h
        jnc     .roster_open
        ; Generic GLIB/HLIB probes deliberately use CCCOMBAT's ephemeral
        ; fallback party.  Their validated GBCR has no persistent GBPR target,
        ; so there is no post-combat mutation to apply.  Identified CoK/Gen1
        ; profiles retain the strict missing-roster rejection below.
        cmp     word [mode], MODE_OTHER
        je      .ok
        jmp     .missing_result
.roster_open:
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, rosterhdr
        int     21h
        jc      .close_roster_fail
        cmp     ax, 16
        jne     .close_roster_fail
        cmp     word [rosterhdr], 'GB'
        jne     .close_roster_fail
        cmp     word [rosterhdr+2], 'PR'
        jne     .close_roster_fail
        cmp     word [rosterhdr+8], 410
        jne     .close_roster_fail
        mov     ax, [rosterhdr+4]
        cmp     ax, GBPR_VERSION_V1
        je      .legacy_roster
        cmp     ax, GBPR_VERSION_V2
        jne     .close_roster_fail
        cmp     word [rosterhdr+14], 1
        jne     .close_roster_fail
        mov     ax, [rosterhdr+12]
        cmp     ax, GBPR_ID_COK
        je      .v2_cok
        cmp     ax, GBPR_ID_DOK
        je      .v2_compact
        cmp     ax, GBPR_ID_DQK
        jne     .close_roster_fail
.v2_compact:
        cmp     word [rosterhdr+10], GBPR_COMPACT_FLAG
        jne     .close_roster_fail
        jmp     .roster_identity_ok
.v2_cok:
        cmp     word [rosterhdr+10], 0
        jne     .close_roster_fail
        jmp     .roster_identity_ok
.legacy_roster:
        ; V1 compact is ambiguous between DoK and DQK and cannot authorize
        ; title-specific combat writeback. Preserve only the unique CoK shape.
        cmp     word [rosterhdr+10], 0
        jne     .close_roster_fail
        cmp     dword [rosterhdr+12], 0
        jne     .close_roster_fail
.roster_identity_ok:
        mov     ax, [rosterhdr+6]
        cmp     ax, 8
        ja      .close_roster_fail
        ; CCECL can synthesize a bridge-only fallback party when no native
        ; roster exists. GBPR then correctly remains empty, with no writable
        ; records even though CCCOMBAT returns its fallback rows. Every
        ; populated GBPR must instead match the result exactly.
        or      ax, ax
        jz      .limit_ready
        cmp     ax, [gbcr_count]
        jne     .close_roster_fail
.limit_ready:
        mov     [gbcr_limit], ax
        call    validate_roster_body
        jc      .close_roster_fail
        ; GBCR v1 byte 12 is a compact Cast receipt: low byte is the
        ; party-result ordinal and high byte is the raw DoK spell id. It is
        ; zero for every non-Cast combat. Preflight proves that receipt names
        ; an owned, still-prepared source spell before any GBPR/GAM write.
        call    validate_dok_cast_receipt
        jc      .close_roster_fail
        mov     word [gbcr_xp_share], 0
        cmp     word [gamep], game_cok
        je      .maybe_xp
        cmp     word [gamep], game_pool
        je      .maybe_xp
        cmp     word [gamep], game_curse
        je      .maybe_xp
        cmp     word [gamep], game_secret
        je      .maybe_xp
        cmp     word [gamep], game_gateway
        je      .maybe_xp
        cmp     word [gamep], game_treasures
        je      .maybe_xp
        cmp     word [gamep], game_pod
        je      .maybe_xp
        cmp     word [gamep], game_nwn
        je      .maybe_xp
        cmp     word [gamep], game_buck
        je      .maybe_xp
        cmp     word [gamep], game_matrix
        je      .maybe_xp
        cmp     word [gamep], game_gen1
        jne     .xp_ready
.maybe_xp:
        cmp     word [gbcrbuf+6], 0
        jne     .xp_ready
        mov     ax, [gbcrbuf+8]
        or      ax, ax
        jz      .xp_ready
        mov     bx, [gbcr_limit]
        or      bx, bx
        jz      .xp_ready
        xor     dx, dx
        div     bx
        mov     [gbcr_xp_share], ax
.xp_ready:
        ; The first call from start performs only complete result/roster
        ; preflight.  It closes the target before any continuation, party, or
        ; source-save write; the second call after RNG publication mutates the
        ; already-validated files.
        cmp     byte [preflight_only],0
        jne     .close_roster_ok
        mov     word [gbcr_index], 0
.loop:
        mov     ax, [gbcr_index]
        cmp     ax, [gbcr_limit]
        jae     .close_roster_ok
        mov     bx, ax
        shl     bx, 1
        mov     si, ax
        shl     si, 2
        add     si, bx
        add     si, gbcrbuf+16
        mov     al, [si+1]
        xor     ah, ah
        mov     [gbcr_cond], ax
        mov     ax, [si+2]
        test    ax, ax
        jns     .hp_nonneg
        xor     ax, ax
.hp_nonneg:
        mov     [gbcr_hp], ax
        mov     ax, [si+4]
        mov     [gbcr_maxhp], ax
        mov     ax, [gbcr_index]
        mov     bx, 410
        mul     bx
        add     ax, 16
        mov     [gbcr_entry_off], ax
        mov     ax, [gbcr_index]
        inc     ax
        mov     [gbcr_slot], al
        mov     ax, [gbcr_entry_off]
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .slot_ready
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, gbcr_slot
        int     21h
        jc      .slot_ready
        cmp     ax, 1
        jne     .slot_ready
.slot_ready:
        mov     ax, [gbcr_entry_off]
        inc     ax
        test    word [rosterhdr+10], 1
        jnz     .dok_patch
        add     ax, 407                ; CoK current HP; preserve maximum at 98
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_fail
        mov     ax, [gbcr_hp]
        cmp     ax, 255
        jbe     .cok_hp_ok
        mov     ax, 255
.cok_hp_ok:
        mov     [gbcr_hp_byte], al
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 1
        mov     dx, gbcr_hp_byte
        int     21h
        jc      .close_roster_fail
        cmp     ax, 1
        jne     .close_roster_fail
        mov     bx, [gbcr_roster_fh]
        mov     dx, [gbcr_entry_off]
        add     dx, 1+392
        call    write_cok_condition
        jc      .close_roster_fail
        cmp     word [gbcr_xp_share], 0
        je      .cok_source
        mov     ax, [gbcr_index]
        mov     bx, 410
        mul     bx
        add     ax, 16+1+COK_CCH_XP_OFF
        mov     [gbcr_xp_off], ax
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 4
        mov     dx, gbcr_xp_cur
        int     21h
        jc      .close_roster_fail
        cmp     ax, 4
        jne     .close_roster_fail
        mov     ax, [gbcr_xp_share]
        add     word [gbcr_xp_cur], ax
        adc     word [gbcr_xp_cur+2], 0
        mov     dx, [gbcr_xp_off]
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 4
        mov     dx, gbcr_xp_cur
        int     21h
        jc      .close_roster_fail
        cmp     ax, 4
        jne     .close_roster_fail
.cok_source:
        call    write_cok_save_result
        jc      .close_roster_fail
        jmp     .next
.dok_patch:
        ; A party victory's GBCR award is independent from ECL opcode 41.  Apply
        ; the same compact-record split and cached readiness rule before the
        ; HP/condition fields below, which otherwise write only combat damage.
        call    apply_dok_combat_xp
        jc      .close_roster_fail
        mov     ax, [gbcr_entry_off]
        inc     ax
        ; GBCR condition is an enum: 0 alive, 1 unconscious, 2 dead, 3 fled.
        ; GBD1 stores the importer's C_FLAGS bits: 2 unconscious, 1 dead, 8 fled.
        ; Translate here; copying the enum swaps dead/unconscious on re-import.
        push    ax
        xor     ax, ax
        cmp     word [gbcr_cond], 1
        jne     .cond_not_uncon
        mov     ax, 2
        jmp     .cond_flags_ready
.cond_not_uncon:
        cmp     word [gbcr_cond], 2
        jne     .cond_not_dead
        mov     ax, 1
        jmp     .cond_flags_ready
.cond_not_dead:
        cmp     word [gbcr_cond], 3
        jne     .cond_flags_ready
        mov     ax, 8
.cond_flags_ready:
        mov     [gbcr_cond], ax
        pop     ax
        add     ax, 216
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 4
        mov     dx, gbcr_magic
        int     21h
        jc      .close_roster_fail
        cmp     ax, 4
        jne     .close_roster_fail
        cmp     word [gbcr_magic], 'GB'
        jne     .close_roster_fail
        cmp     word [gbcr_magic+2], 'D1'
        jne     .close_roster_fail
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+6
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, gbcr_hp
        int     21h
        jc      .close_roster_fail
        cmp     ax, 2
        jne     .close_roster_fail
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+26
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, gbcr_maxhp
        int     21h
        jc      .close_roster_fail
        cmp     ax, 2
        jne     .close_roster_fail
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+4
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 2
        mov     dx, gbcr_meta_flags
        int     21h
        jc      .close_roster_fail
        cmp     ax, 2
        jne     .close_roster_fail
        or      word [gbcr_meta_flags], 2
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+4
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, gbcr_meta_flags
        int     21h
        jc      .close_roster_fail
        cmp     ax, 2
        jne     .close_roster_fail
        mov     ax, [gbcr_entry_off]
        add     ax, 1+216+24
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_fail
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, gbcr_cond
        int     21h
        jc      .close_roster_fail
        cmp     ax, 2
        jne     .close_roster_fail
        call    write_dok_save_award
        jc      .close_roster_fail
.next:
        inc     word [gbcr_index]
        jmp     .loop
.close_roster_ok:
        ; The receipt was validated against the raw sidecar during preflight.
        ; Consume one exact prepared instance only after all roster and .GAM
        ; writes have succeeded; a failed handoff remains replayable.
        cmp     byte [preflight_only], 0
        jne     .close_roster
        call    consume_dok_cast_receipt
        jc      .close_roster_fail
.close_roster:
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Eh
        int     21h
        jc      .fail
.ok:
        clc
        ret
.missing_result:
        ; CCHOST is invoked only after CCCOMBAT succeeds.  A missing result is
        ; therefore an interrupted handoff, never an empty-party fallback.
        jmp     .fail
.close_result_fail:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        stc
        ret
.close_roster_fail:
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret

; Apply a successful combat result's source-derived XP to one compact DoK
; member.  CCECL owns opcode 41 awards separately; GBCR carries CCCOMBAT's
; accumulated killed-monster reward and uses the same per-class divisor and
; CCPARTY cached next-level thresholds.  Defeat, flee, draw, and zero award
; leave XP/readiness untouched while the caller still writes HP/condition.
apply_dok_combat_xp:
        mov     byte [dok_award_valid], 0
        ; Compact layout is shared by DoK and DQK. Only stable ID 2 may
        ; apply DoK XP/readiness bytes to a CHRDATA.GAM source record.
        cmp     word [rosterhdr+12], GBPR_ID_DOK
        jne     .ok
        cmp     word [gbcrbuf+6], 0            ; GBCR outcome 0 = party victory
        jne     .ok
        mov     ax, [gbcrbuf+8]
        or      ax, ax
        jz      .ok
        mov     dx, [gbcr_entry_off]
        mov     cx, DOK_AWARD_READ_LEN
        call    read_dok_award_entry
        jc      .bad
        call    validate_dok_award_entry
        ; The cache is an XP capability, not the compact roster's combat
        ; capability.  Native-created or old compact parties can lack it;
        ; preserve their HP/condition handoff and simply leave XP/readiness
        ; untouched, as CCECL's AWARD_XP handler does for such a record.
        jc      .ok
        mov     si, dok_award_buf+1+DOK_LEVELS_OFF
        xor     bx, bx
        mov     cx, 8
.count:
        cmp     byte [si], 0
        je      .next_level
        inc     bx
.next_level:
        inc     si
        loop    .count
        or      bx, bx
        jz      .ok
        mov     ax, [gbcrbuf+8]
        xor     dx, dx
        div     bx
        add     [dok_award_buf+1+DOK_XP_OFF], ax
        adc     word [dok_award_buf+1+DOK_XP_OFF+2], 0
        mov     byte [dok_award_buf+1+DOK_READY_OFF], 0
        mov     si, dok_award_buf+1+DOK_XP_THRESH_OFF
        mov     cx, 8
.ready:
        mov     bx, [si]
        mov     dx, [si+2]
        or      bx, dx
        jz      .next_threshold
        cmp     dx, [dok_award_buf+1+DOK_XP_OFF+2]
        ja      .next_threshold
        jb      .set_ready
        cmp     bx, [dok_award_buf+1+DOK_XP_OFF]
        ja      .next_threshold
.set_ready:
        mov     byte [dok_award_buf+1+DOK_READY_OFF], 1
        jmp     .write
.next_threshold:
        add     si, 4
        loop    .ready
.write:
        mov     dx, [gbcr_entry_off]
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .bad
        mov     bx, [gbcr_roster_fh]
        mov     ah, 40h
        mov     cx, DOK_AWARD_READ_LEN
        mov     dx, dok_award_buf
        int     21h
        jc      .bad
        cmp     ax, DOK_AWARD_READ_LEN
        jne     .bad
        mov     byte [dok_award_valid], 1
.ok:    clc
        ret
.bad:   stc
        ret

; DX = member entry start, CX = required byte count.  The full compact prefix
; includes slot, raw .GAM body, GBD1 marker/flags, and all eight cached u32s.
read_dok_award_entry:
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .bad
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, DOK_AWARD_READ_LEN
        mov     dx, dok_award_buf
        int     21h
        jc      .bad
        cmp     ax, DOK_AWARD_READ_LEN
        jne     .bad
        clc
        ret
.bad:   stc
        ret

validate_dok_award_entry:
        cmp     word [rosterhdr+12], GBPR_ID_DOK
        jne     .bad
        mov     al, [dok_award_buf]
        cmp     al, 1
        jb      .bad
        cmp     al, 15
        ja      .bad
        cmp     word [dok_award_buf+1+DOK_META_OFF], 'GB'
        jne     .bad
        cmp     word [dok_award_buf+1+DOK_META_OFF+2], 'D1'
        jne     .bad
        mov     ax, [dok_award_buf+1+DOK_META_FLAGS]
        and     ax, 0005h
        cmp     ax, 0005h
        jne     .bad
        clc
        ret
.bad:   stc
        ret

; A writable GBPR is a complete bounded record set, not merely a plausible
; header.  Check its exact length before any seek/write can extend an EOF body.
; DoK compact records additionally require their claimed GBD1 capability, so a
; malformed member cannot be silently skipped while its neighbours are changed.
validate_roster_body:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        mov     ax, [rosterhdr+6]
        mov     bx, 410
        mul     bx
        add     ax, 16
        mov     [roster_expected_len], ax
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .bad
        or      dx, dx
        jnz     .bad
        cmp     ax, [roster_expected_len]
        jne     .bad
        test    word [rosterhdr+10], 1
        jz      .ok
        mov     word [roster_check_index], 0
.record:
        mov     ax, [roster_check_index]
        cmp     ax, [rosterhdr+6]
        jae     .ok
        mov     bx, 410
        mul     bx
        add     ax, 16+1+216
        mov     dx, ax
        xor     cx, cx
        mov     bx, [gbcr_roster_fh]
        mov     ax, 4200h
        int     21h
        jc      .bad
        mov     bx, [gbcr_roster_fh]
        mov     ah, 3Fh
        mov     cx, 4
        mov     dx, gbcr_magic
        int     21h
        jc      .bad
        cmp     ax, 4
        jne     .bad
        cmp     word [gbcr_magic], 'GB'
        jne     .bad
        cmp     word [gbcr_magic+2], 'D1'
        jne     .bad
        inc     word [roster_check_index]
        jmp     .record
.ok:
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        clc
        ret
.bad:
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        stc
        ret

; Validate the optional DoK Cast receipt in GBCR v1's previously-unused word
; at +12. The first supported spell is raw DoK id 15 (Magic Missile), whose
; identity is independently pinned in the retail spellbook and crosswalk. The
; receipt carries a party ordinal rather than a filesystem name; the GBPR slot
; remains the only authority for CHRDATA#.WIZ.
validate_dok_cast_receipt:
        mov     byte [dok_cast_active], 0
        cmp     word [gbcrbuf+4], 1
        jne     .ok
        mov     ax, [gbcrbuf+GBCR_V1_CAST_OFF]
        or      ax, ax
        jz      .ok
        ; Compact layout alone cannot authorize DoK spell/source semantics.
        cmp     word [rosterhdr+12], GBPR_ID_DOK
        jne     .bad
        mov     [dok_cast_receipt], ax
        mov     al, ah
        cmp     al, DOK_MAGIC_MISSILE
        jne     .bad
        mov     al, [dok_cast_receipt]
        xor     ah, ah
        cmp     ax, [gbcr_count]
        jae     .bad
        mov     bx, 410
        mul     bx
        add     ax, 16
        mov     dx, ax
        mov     cx, DOK_AWARD_READ_LEN
        call    read_dok_award_entry
        jc      .bad
        call    validate_dok_award_entry
        jc      .bad
        mov     al, [dok_award_buf]
        test    al, 80h
        jnz     .bad
        cmp     al, 1
        jb      .bad
        cmp     al, 6
        ja      .bad
        mov     [dok_cast_slot], al
        call    read_dok_cast_wiz
        jc      .bad
        mov     si, DOK_WIZ_FIRST
.find:
        cmp     si, DOK_WIZ_LAST
        ja      .bad
        mov     al, [dok_award_buf+si]
        cmp     al, DOK_MAGIC_MISSILE
        je      .found
        inc     si
        jmp     .find
.found:
        mov     byte [dok_cast_active], 1
.ok:    clc
        ret
.bad:   stc
        ret

; Read the exact fixed-size raw DoK spell sidecar for dok_cast_slot into the
; existing compact scratch. No partial file or missing source can be treated
; as an empty spellbook: that would authorize a made-up cast.
read_dok_cast_wiz:
        mov     al, [dok_cast_slot]
        add     al, '0'
        mov     [dokwizpath+12], al
        mov     ax, 3D00h
        mov     dx, dokwizpath
        int     21h
        jc      .bad
        mov     [gbcr_save_fh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        or      dx, dx
        jne     .close_bad
        cmp     ax, DOK_WIZ_SIZE
        jne     .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Fh
        mov     cx, DOK_WIZ_SIZE
        mov     dx, dok_award_buf
        int     21h
        jc      .close_bad
        cmp     ax, DOK_WIZ_SIZE
        jne     .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        clc
        ret
.close_bad:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

; Re-read and consume the exact prepared instance. The right-justified sorted
; 34..73 list loses one item by shifting its left prefix right one byte, then
; zeroing byte 34; every byte outside that confirmed list stays untouched.
consume_dok_cast_receipt:
        cmp     byte [dok_cast_active], 0
        je      .ok
        call    read_dok_cast_wiz
        jc      .bad
        mov     si, DOK_WIZ_FIRST
.find:
        cmp     si, DOK_WIZ_LAST
        ja      .bad
        cmp     byte [dok_award_buf+si], DOK_MAGIC_MISSILE
        je      .remove
        inc     si
        jmp     .find
.remove:
        mov     di, si
.shift:
        cmp     di, DOK_WIZ_FIRST
        je      .zero
        dec     di
        mov     al, [dok_award_buf+di]
        mov     [dok_award_buf+di+1], al
        jmp     .shift
.zero:
        mov     byte [dok_award_buf+DOK_WIZ_FIRST], 0
        mov     ax, 3D02h
        mov     dx, dokwizpath
        int     21h
        jc      .bad
        mov     [gbcr_save_fh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, DOK_WIZ_SIZE
        mov     dx, dok_award_buf
        int     21h
        jc      .close_bad
        cmp     ax, DOK_WIZ_SIZE
        jne     .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
.ok:    clc
        ret
.close_bad:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

; Mark a fully applied GBCR v1.  The marker lives in v1's otherwise-reserved
; header word; CoK v2 uses bytes 12..15 for its final combat RNG and is never
; written here.  This is deliberately after the roster close: only a complete
; handoff becomes non-replayable.
;
; The small GBTX sibling is intentionally a receipt-finalization record, not
; a second gameplay format.  It binds the exact original GBCR bytes and is
; made before v1 writes begin.  State PREPARED is fail-closed: an earlier I/O
; interruption cannot be retried into a second additive award.  State
; FINALIZING is written only after the roster, source-save, and optional WIZ
; writes return success, so a later receipt failure resumes only this marker.
begin_v1_finalization:
        mov     byte [journal_active], 0
        cmp     word [gbcrbuf+4], 1
        jne     .ok
        cmp     word [rosterhdr+6], 0
        je      .ok
        call    build_journal_path
        jc      .bad
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, journalpath
        int     21h
        jc      .bad
        mov     [journal_fh], ax
        mov     word [journal_header+6], GBTX_PREPARED
        mov     ax, [gbcr_read_len]
        mov     [journal_header+8], ax
        mov     dx, journal_header
        mov     cx, GBTX_HEADER_LEN
        call    journal_write
        jc      .close_bad
        mov     dx, gbcrbuf
        mov     cx, [gbcr_read_len]
        call    journal_write
        jc      .close_bad
        ; The existing v1 header/result remain the prefix.  The appended
        ; exact GBPR image is the preimage for PREPARED recovery; a fixed source-field
        ; table follows it, then an active DoK Cast appends its verified WIZ image.
        call    journal_backup_roster
        jc      .close_bad
        call    journal_snapshot_sources
        jc      .close_bad
        cmp     byte [dok_cast_active], 0
        je      .close
        mov     dx, dok_award_buf
        mov     cx, DOK_WIZ_SIZE
        call    journal_write
        jc      .close_bad
.close:
        mov     bx, [journal_fh]
        mov     ah, 3Eh
        int     21h
        jc      .delete_bad
        mov     byte [journal_active], 1
.ok:    clc
        ret
.close_bad:
        mov     bx, [journal_fh]
        mov     ah, 3Eh
        int     21h
.delete_bad:
        mov     dx, journalpath
        mov     ah, 41h
        int     21h
.bad:   stc
        ret

; Append the exact bounded GBPR image while it has already passed the complete
; body/metadata preflight.  This runs before sync_combat_rng or any persistent
; roster/source/WIZ write, so a PREPARED record always names the old state.
journal_backup_roster:
        mov     ax, 3D00h
        mov     dx, rosterpath
        int     21h
        jc      .bad
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        or      dx, dx
        jne     .close_bad
        cmp     ax, [roster_expected_len]
        jne     .close_bad
        mov     bx, [auto_fh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        mov     ax, [roster_expected_len]
        mov     [journal_left], ax
.copy: mov     cx, [journal_left]
        or      cx, cx
        jz      .close
        cmp     cx, 410
        jbe     .read
        mov     cx, 410
.read: mov     bx, [auto_fh]
        mov     ah, 3Fh
        mov     dx, journal_buf
        int     21h
        jc      .close_bad
        cmp     ax, cx
        jne     .close_bad
        mov     dx, journal_buf
        call    journal_write
        jc      .close_bad
        sub     [journal_left], cx
        jmp     .copy
.close:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        clc
        ret
.close_bad:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

; Capture the exact fields which a v1 handoff can alter in the retail source
; saves.  GBPR is a transport mirror, so it is not authoritative when a native
; save differs from it.  One fixed record per possible member keeps the GBTX
; extension bounded: flags, source slot, then six raw field bytes.
journal_snapshot_sources:
        mov     di, journal_source_table
        mov     cx, JOURNAL_SOURCE_LEN/2
        xor     ax, ax
        rep     stosw
        mov     ax, 3D00h
        mov     dx, rosterpath
        int     21h
        jc      .bad
        mov     [auto_fh], ax
        mov     word [journal_left], 0
.loop:  mov     ax, [journal_left]
        cmp     ax, [rosterhdr+6]
        jae     .close_roster
        cmp     ax, 6                   ; source table holds ordinals 0..5 only
        jae     .close_roster
        mov     bx, 410
        mul     bx
        add     ax, 16
        mov     dx, ax
        xor     cx, cx
        mov     bx, [auto_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_roster_bad
        mov     bx, [auto_fh]
        mov     ah, 3Fh
        mov     cx, 410
        mov     dx, journal_buf
        int     21h
        jc      .close_roster_bad
        cmp     ax, 410
        jne     .close_roster_bad
        mov     ax, [journal_left]
        shl     ax, 3
        mov     di, journal_source_table
        add     di, ax
        mov     al, [journal_buf]
        mov     [di+1], al
        cmp     al, 1
        jb      .next
        cmp     al, 6
        ja      .next
        ; DQK compact rows share GBD1 movement, but do not name a source save
        ; layout. CoK (v1/v2) and v2 DoK retain their established snapshots.
        cmp     word [rosterhdr+12], GBPR_ID_DQK
        je      .next
        add     al, '0'
        ; compact bit selects the .GAM shape; all remaining flag bits are
        ; irrelevant to this bounded snapshot.
        test    word [rosterhdr+10], 1
        jnz     .dok_open
        mov     [coksavepath+12], al
        mov     dx, coksavepath
        jmp     short .open
.dok_open:
        mov     [doksavepath+12], al
        mov     dx, doksavepath
.open:  mov     ax, 3D00h
        int     21h
        jnc     .opened
        cmp     ax, 2
        je      .next                 ; source-less native slot/file
        cmp     ax, 3
        je      .next                 ; source-less native save directory
        jmp     .close_roster_bad
.opened:
        mov     [gbcr_save_fh], ax
        ; Use the live roster flag while creating a record.
        test    word [rosterhdr+10], 1
        jnz     .read_dok
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 392
        int     21h
        jc      .close_source_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, di
        add     dx, 2
        int     21h
        jc      .close_source_bad
        cmp     ax, 1
        jne     .close_source_bad
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 407
        int     21h
        jc      .close_source_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, di
        add     dx, 3
        int     21h
        jc      .close_source_bad
        cmp     ax, 1
        jne     .close_source_bad
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, COK_CCH_XP_OFF
        int     21h
        jc      .close_source_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Fh
        mov     cx, 4
        mov     dx, di
        add     dx, 4
        int     21h
        jc      .close_source_bad
        cmp     ax, 4
        jne     .close_source_bad
        jmp     short .close_source
.read_dok:
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, DOK_XP_OFF
        int     21h
        jc      .close_source_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Fh
        mov     cx, 4
        mov     dx, di
        add     dx, 2
        int     21h
        jc      .close_source_bad
        cmp     ax, 4
        jne     .close_source_bad
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, DOK_READY_OFF
        int     21h
        jc      .close_source_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, di
        add     dx, 6
        int     21h
        jc      .close_source_bad
        cmp     ax, 1
        jne     .close_source_bad
.close_source:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
        jc      .close_roster_bad
        or      byte [di], 1
.next:  inc     word [journal_left]
        jmp     .loop
.close_roster:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        mov     dx, journal_source_table
        mov     cx, JOURNAL_SOURCE_LEN
        call    journal_write
        ret
.close_source_bad:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
.close_roster_bad:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

commit_v1_finalization:
        cmp     byte [journal_active], 0
        je      .ok
%ifdef CCHOST_TEST_FAIL_PREPARED
        ; Contract-fixture only: model an interruption after all mutable
        ; outputs have returned success but before GBTX reaches FINALIZING.
        ; The next process must restore its preimage, then apply once.
        stc
        ret
%endif
        mov     ax, 3D02h
        mov     dx, journalpath
        int     21h
        jc      .bad
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 6
        int     21h
        jc      .close_bad
        mov     word [journal_header+6], GBTX_FINALIZING
        mov     bx, [auto_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, journal_header+6
        int     21h
        jc      .close_bad
        cmp     ax, 2
        jne     .close_bad
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        call    mark_v1_result_consumed
        jc      .bad
        mov     dx, journalpath
        mov     ah, 41h
        int     21h
        jc      .bad
        mov     byte [journal_active], 0
.ok:    clc
        ret
.close_bad:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

recover_pending_finalization:
        mov     byte [journal_recovered], 0
        call    build_journal_path
        jc      .bad
        mov     ax, 3D00h
        mov     dx, journalpath
        int     21h
        jnc     .open
        cmp     ax, 2
        je      .ok
        jmp     .bad
.open:  mov     [journal_fh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        or      dx, dx
        jne     .close_bad
        mov     [journal_file_len], ax
        mov     bx, [journal_fh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        mov     dx, journal_header
        mov     cx, GBTX_HEADER_LEN
        call    journal_read
        jc      .close_bad
        cmp     dword [journal_header], 'GBTX'
        jne     .close_bad
        cmp     word [journal_header+4], GBTX_VERSION
        jne     .close_bad
        mov     ax, [journal_header+6]
        cmp     ax, GBTX_PREPARED
        je      .state_ok
        cmp     ax, GBTX_FINALIZING
        jne     .close_bad
.state_ok:
        mov     ax, [journal_header+8]
        cmp     ax, 16
        jb      .close_bad
        cmp     ax, GBCR_BUF_LEN
        ja      .close_bad
        add     ax, GBTX_HEADER_LEN
        mov     [journal_data_off], ax
        cmp     ax, [journal_file_len]
        ja      .close_bad
        mov     cx, [journal_header+8]
        mov     dx, journal_result
        call    journal_read
        jc      .close_bad
        cmp     word [journal_result+4], 1
        jne     .close_bad
        cmp     word [journal_result+GBCR_V1_CONSUMED_OFF], 0
        jne     .close_bad
        mov     byte [journal_has_wiz], 0
        mov     byte [journal_has_sources], 0
        mov     byte [journal_compact], 0
        mov     byte [journal_title_id], 0
        mov     ax, [journal_file_len]
        cmp     ax, [journal_data_off]
        je      .legacy
        call    journal_probe_backup
        jc      .close_bad
.legacy:
        mov     ax, 3D00h
        mov     dx, combatresultpath
        int     21h
        jc      .bad
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_result_bad
        or      dx, dx
        jne     .close_result_bad
        cmp     ax, [journal_header+8]
        jne     .close_result_bad
        mov     bx, [auto_fh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_result_bad
        mov     bx, [auto_fh]
        mov     ah, 3Fh
        mov     cx, [journal_header+8]
        mov     dx, gbcrbuf
        int     21h
        jc      .close_result_bad
        cmp     ax, cx
        jne     .close_result_bad
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        mov     ax, [gbcrbuf+GBCR_V1_CONSUMED_OFF]
        cmp     ax, 0
        je      .fresh
        cmp     ax, 1
        jne     .bad
        mov     byte [journal_consumed], 1
        jmp     short .compare
.fresh: mov     byte [journal_consumed], 0
.compare:
        mov     word [gbcrbuf+GBCR_V1_CONSUMED_OFF], 0
        mov     si, journal_result
        mov     di, gbcrbuf
        mov     cx, [journal_header+8]
        repe    cmpsb
        jne     .bad
        cmp     byte [journal_consumed], 0
        jne     .committed
        cmp     word [journal_header+6], GBTX_FINALIZING
        je      .finalize
        cmp     word [journal_header+6], GBTX_PREPARED
        jne     .bad
        mov     ax, [journal_file_len]
        cmp     ax, [journal_data_off]
        je      .bad                     ; legacy PREPARED was fail-closed
        call    journal_restore_prepared
        jc      .close_bad
        mov     bx, [journal_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        mov     dx, journalpath
        mov     ah, 41h
        int     21h
        jc      .bad
        mov     byte [journal_restored], 1
        ; Restored old state: run ordinary preflight and apply this result in
        ; the same fresh process rather than reporting a phantom success.
        jmp     short .ok
.finalize:
        mov     bx, [journal_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        call    mark_v1_result_consumed
        jc      .bad
        jmp     short .cleanup
.committed:
        cmp     word [journal_header+6], GBTX_FINALIZING
        jne     .bad
        ; A result already marked consumed can only be an interrupted cleanup;
        ; remove its verified sibling and report the original handoff complete.
        ; FINALIZING with a fresh result reaches .cleanup directly after mark.
        mov     bx, [journal_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
.cleanup:
        mov     dx, journalpath
        mov     ah, 41h
        int     21h
        jc      .bad
        mov     byte [journal_recovered], 1
.ok:    clc
        ret
.close_bad:
        mov     bx, [journal_fh]
        mov     ah, 3Eh
        int     21h
        jmp     short .bad
.close_result_bad:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

; The appended v1 extension begins with the exact old GBPR.  It is accepted
; only when that record is structurally bounded, and only an active compact
; Cast receipt may append the fixed WIZ preimage.
journal_probe_backup:
        mov     bx, [journal_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, [journal_data_off]
        int     21h
        jc      .bad
        mov     dx, journal_buf
        mov     cx, 16
        call    journal_read
        jc      .bad
        cmp     dword [journal_buf], 'GBPR'
        jne     .bad
        mov     ax,[journal_buf+4]
        cmp     ax,GBPR_VERSION_V1
        je      .legacy_roster
        cmp     ax,GBPR_VERSION_V2
        jne     .bad
        cmp     word [journal_buf+14],1
        jne     .bad
        mov     ax,[journal_buf+12]
        dec     ax
        cmp     ax,2
        ja      .bad
        inc     ax                      ; retain the declared one-based title ID
        mov     [journal_title_id],al
        cmp     ax,GBPR_ID_COK
        jne     .v2_compact
        cmp     word [journal_buf+10],0
        jne     .bad
        jmp     short .journal_identity_ok
.v2_compact:
        cmp     word [journal_buf+10],1
        jne     .bad
        jmp     short .journal_identity_ok
.legacy_roster:
        cmp     dword [journal_buf+12],0
        jne     .bad
        mov     ax,[journal_buf+10]
        cmp     ax,1
        ja      .bad
        inc     ax
        mov     [journal_title_id],al
.journal_identity_ok:
        cmp     word [journal_buf+8], 410
        jne     .bad
        mov     ax, [journal_buf+6]
        cmp     ax, 8
        ja      .bad
        mov     [journal_member_count], ax
        mov     bx, 410
        mul     bx
        add     ax, 16
        mov     [journal_roster_len], ax
        mov     bx, [journal_data_off]
        add     bx, ax
        mov     byte [journal_compact], 0
        test    word [journal_buf+10], 1
        jz      .check_sizes
        mov     byte [journal_compact], 1
        mov     ax, [journal_result+GBCR_V1_CAST_OFF]
        or      ax, ax
        jz      .check_sizes
        cmp     byte [journal_title_id],GBPR_ID_DOK
        jne     .check_sizes
        mov     byte [journal_has_wiz], 1
.check_sizes:
        ; Old extended records contain only GBPR (+ optional WIZ).  New
        ; records insert the fixed source-field table before WIZ.  Accept
        ; both so an interrupted predecessor can still be recovered.
        mov     ax, bx
        cmp     byte [journal_has_wiz], 0
        je      .legacy_size
        add     ax, DOK_WIZ_SIZE
.legacy_size:
        cmp     ax, [journal_file_len]
        je      .legacy
        mov     ax, bx
        add     ax, JOURNAL_SOURCE_LEN
        cmp     byte [journal_has_wiz], 0
        je      .source_size
        add     ax, DOK_WIZ_SIZE
.source_size:
        cmp     ax, [journal_file_len]
        jne     .bad
        mov     byte [journal_has_sources], 1
.legacy: clc
        ret
.bad:   stc
        ret

; Replace every field CCHOST can have touched with the preimage, then remove
; the PREPARED record and apply normally.  A failed restoration preserves the
; record for another recovery attempt; it never proceeds to an additive retry.
journal_restore_prepared:
        mov     bx, [journal_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, [journal_data_off]
        int     21h
        jc      .bad
        mov     ax, 3D02h
        mov     dx, rosterpath
        int     21h
        jc      .bad
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_roster_bad
        or      dx, dx
        jne     .close_roster_bad
        cmp     ax, [journal_roster_len]
        jne     .close_roster_bad
        mov     bx, [auto_fh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_roster_bad
        mov     ax, [journal_roster_len]
        mov     [journal_left], ax
.copy: mov     cx, [journal_left]
        or      cx, cx
        jz      .close_roster
        cmp     cx, 410
        jbe     .read
        mov     cx, 410
.read: mov     dx, journal_buf
        call    journal_read
        jc      .close_roster_bad
        mov     bx, [auto_fh]
        mov     ah, 40h
        int     21h
        jc      .close_roster_bad
        cmp     ax, cx
        jne     .close_roster_bad
        sub     [journal_left], cx
        jmp     .copy
.close_roster:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        cmp     byte [journal_title_id],GBPR_ID_DQK
        je      .sources_done
        cmp     byte [journal_has_sources], 0
        je      .legacy_sources
        mov     bx, [journal_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, [journal_data_off]
        add     dx, [journal_roster_len]
        int     21h
        jc      .bad
        mov     dx, journal_source_table
        mov     cx, JOURNAL_SOURCE_LEN
        call    journal_read
        jc      .bad
        call    journal_restore_saved_sources
        jc      .bad
        jmp     short .sources_done
.legacy_sources:
        ; Compatibility only for a predecessor GBTX that did not preserve
        ; source fields.  New records always take the exact-source path.
        call    journal_restore_sources
        jc      .bad
.sources_done:
        cmp     byte [journal_has_wiz], 0
        je      .ok
        mov     bx, [journal_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, [journal_data_off]
        add     dx, [journal_roster_len]
        cmp     byte [journal_has_sources], 0
        je      .wiz_seek
        add     dx, JOURNAL_SOURCE_LEN
.wiz_seek:
        int     21h
        jc      .bad
        mov     dx, journal_buf
        mov     cx, DOK_WIZ_SIZE
        call    journal_read
        jc      .bad
        cmp     byte [journal_has_sources], 0
        je      .legacy_wiz_slot
        mov     al, [journal_result+GBCR_V1_CAST_OFF]
        cmp     al, 6
        ja      .bad
        xor     ah, ah
        shl     ax, 3
        mov     bx, journal_source_table
        add     bx, ax
        mov     al, [bx+1]
        mov     [journal_wiz_slot], al
.legacy_wiz_slot:
        mov     al, [journal_wiz_slot]
        cmp     al, 1
        jb      .bad
        cmp     al, 6
        ja      .bad
        add     al, '0'
        mov     [dokwizpath+12], al
        mov     ax, 3D02h
        mov     dx, dokwizpath
        int     21h
        jc      .bad
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_wiz_bad
        or      dx, dx
        jne     .close_wiz_bad
        cmp     ax, DOK_WIZ_SIZE
        jne     .close_wiz_bad
        mov     bx, [auto_fh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_wiz_bad
        mov     bx, [auto_fh]
        mov     ah, 40h
        mov     cx, DOK_WIZ_SIZE
        mov     dx, journal_buf
        int     21h
        jc      .close_wiz_bad
        cmp     ax, DOK_WIZ_SIZE
        jne     .close_wiz_bad
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
.ok:    clc
        ret
.close_roster_bad:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jmp     short .bad
.close_wiz_bad:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

; Restore source fields from their exact journal preimage.  A record marked
; present must be writable now: accepting a vanished source would make the
; following normal retry additive against a half-restored world.
journal_restore_saved_sources:
        mov     word [journal_left], 0
.loop:  mov     ax, [journal_left]
        cmp     ax, 6
        jae     .ok
        shl     ax, 3
        mov     di, journal_source_table
        add     di, ax
        test    byte [di], 1
        jz      .next
        call    journal_restore_saved_source_entry
        jc      .bad
.next:  inc     word [journal_left]
        jmp     .loop
.ok:    clc
        ret
.bad:   stc
        ret

journal_restore_saved_source_entry:
        ; Require the source that was present when this record was made, then
        ; project the exact table bytes into the established field writer.
        ; That writer owns the known retail offsets for both source shapes.
        mov     al, [di+1]
        cmp     al, 1
        jb      .bad
        cmp     al, 6
        ja      .bad
        add     al, '0'
        cmp     byte [journal_compact], 0
        jne     .dok_path
        mov     [coksavepath+12], al
        mov     dx, coksavepath
        jmp     short .probe
.dok_path:
        mov     [doksavepath+12], al
        mov     dx, doksavepath
.probe: mov     ax, 3D00h
        int     21h
        jc      .bad
        mov     [gbcr_save_fh], ax
        mov     bx, ax
        mov     ah, 3Eh
        int     21h
        jc      .bad
        mov     al, [di+1]
        mov     [journal_buf], al
        cmp     byte [journal_compact], 0
        jne     .dok_fields
        mov     al, [di+2]
        mov     [journal_buf+1+392], al
        mov     al, [di+3]
        mov     [journal_buf+1+407], al
        mov     si, di
        add     si, 4
        mov     di, journal_buf+1+COK_CCH_XP_OFF
        mov     cx, 4
        rep     movsb
        jmp     short .write
.dok_fields:
        mov     si, di
        add     si, 2
        mov     di, journal_buf+1+DOK_XP_OFF
        mov     cx, 4
        rep     movsb
        mov     al, [si]
        mov     [journal_buf+1+DOK_READY_OFF], al
.write: mov     byte [journal_source_required], 1
        call    journal_restore_source_entry
        mov     byte [journal_source_required], 0
        ret
.bad:   stc
        ret

journal_restore_sources:
        mov     ax, 3D00h
        mov     dx, rosterpath
        int     21h
        jc      .bad
        mov     [auto_fh], ax
        mov     word [journal_left], 0
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 16
        int     21h
        jc      .close_bad
.loop: mov     ax, [journal_left]
        cmp     ax, [journal_member_count]
        jae     .close
        mov     bx, 410
        mul     bx
        add     ax, 16
        mov     dx, ax
        xor     cx, cx
        mov     bx, [auto_fh]
        mov     ax, 4200h
        int     21h
        jc      .close_bad
        mov     bx, [auto_fh]
        mov     ah, 3Fh
        mov     cx, 410
        mov     dx, journal_buf
        int     21h
        jc      .close_bad
        cmp     ax, 410
        jne     .close_bad
        mov     ax, [journal_left]
        cmp     al, [journal_result+GBCR_V1_CAST_OFF]
        jne     .source
        mov     al, [journal_buf]
        mov     [journal_wiz_slot], al
.source:
        call    journal_restore_source_entry
        jc      .close_bad
        inc     word [journal_left]
        jmp     .loop
.close:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        clc
        ret
.close_bad:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

journal_restore_source_entry:
        mov     al, [journal_buf]
        cmp     al, 1
        jb      .ok
        cmp     al, 6
        ja      .ok
        add     al, '0'
        cmp     byte [journal_compact], 0
        jne     .dok
        mov     [coksavepath+12], al
        mov     dx, coksavepath
        jmp     short .open
.dok:   mov     [doksavepath+12], al
        mov     dx, doksavepath
.open:  mov     ax, 3D02h
        int     21h
        jc      .ok                    ; source-less native slots are allowed
        mov     [gbcr_save_fh], ax
        cmp     byte [journal_compact], 0
        jne     .dok_write
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 392
        int     21h
        jc      .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, 1
        mov     dx, journal_buf+1+392
        int     21h
        jc      .close_bad
        cmp     ax, 1
        jne     .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 407
        int     21h
        jc      .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, 1
        mov     dx, journal_buf+1+407
        int     21h
        jc      .close_bad
        cmp     ax, 1
        jne     .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, COK_CCH_XP_OFF
        int     21h
        jc      .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, 4
        mov     dx, journal_buf+1+COK_CCH_XP_OFF
        jmp     short .finish
.dok_write:
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, DOK_XP_OFF
        int     21h
        jc      .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, 4
        mov     dx, journal_buf+1+DOK_XP_OFF
        int     21h
        jc      .close_bad
        cmp     ax, 4
        jne     .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, DOK_READY_OFF
        int     21h
        jc      .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, 1
        mov     dx, journal_buf+1+DOK_READY_OFF
.finish:
        int     21h
        jc      .close_bad
        cmp     ax, cx
        jne     .close_bad
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
.ok:    clc
        ret
.close_bad:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

journal_write:
        mov     bx, [journal_fh]
        mov     ah, 40h
        int     21h
        jc      .bad
        cmp     ax, cx
        jne     .bad
        clc
        ret
.bad:   stc
        ret

journal_read:
        mov     bx, [journal_fh]
        mov     ah, 3Fh
        int     21h
        jc      .bad
        cmp     ax, cx
        jne     .bad
        clc
        ret
.bad:   stc
        ret

; Produce a bounded sibling of the exact GBCR path.  The host accepts only
; canonical, zero-padded paths, so replacing its final extension cannot escape
; the requested directory.  A path without an extension has no safe sibling.
build_journal_path:
        mov     si, combatresultpath
        mov     di, journalpath
        mov     cx, PATH_MAX
        xor     bx, bx
.copy:  lodsb
        stosb
        or      al, al
        jz      .done
        cmp     al, '.'
        jne     .separator
        mov     bx, di
        dec     bx
.separator:
        cmp     al, 5Ch
        je      .reset
        cmp     al, '/'
        je      .reset
        cmp     al, ':'
        jne     .next
.reset: xor     bx, bx
.next:  loop    .copy
        jmp     short .bad
.done:  or      bx, bx
        jz      .bad
        mov     ax, bx
        add     ax, 5
        cmp     ax, journalpath+PATH_MAX
        ja      .bad
        mov     byte [bx], '.'
        mov     byte [bx+1], 'G'
        mov     byte [bx+2], 'B'
        mov     byte [bx+3], 'T'
        mov     byte [bx+4], 0
        clc
        ret
.bad:   stc
        ret

; The direct-DAMAGE recovery record is deliberately a different sibling from
; the combat-result GBTX record above.  In particular, it is rooted in the
; GBPR path rather than a transient GBCR result, so a later /R invocation can
; name the same durable target without reconstructing a combat request.
; Keep the extension replacement bounded and separator-aware: a period in a
; directory is not an extension, and a path without a final extension has no
; safe sibling identity.
build_damage_journal_path:
        mov     si, rosterpath
        mov     di, journalpath
        mov     cx, PATH_MAX
        xor     bx, bx
.copy:  lodsb
        stosb
        or      al, al
        jz      .done
        cmp     al, '.'
        jne     .separator
        mov     bx, di
        dec     bx
.separator:
        cmp     al, 5Ch
        je      .reset
        cmp     al, '/'
        je      .reset
        cmp     al, ':'
        jne     .next
.reset: xor     bx, bx
.next:  loop    .copy
        jmp     short .bad
.done:  or      bx, bx
        jz      .bad
        mov     ax, bx
        add     ax, 5
        cmp     ax, journalpath+PATH_MAX
        ja      .bad
        mov     byte [bx], '.'
        mov     byte [bx+1], 'G'
        mov     byte [bx+2], 'D'
        ; Producing a journal writes a temp ".GDN" sibling before renaming it
        ; onto ".GDJ" (plan step 7a); every other caller (the /R reader, and
        ; produce's own final rename target) wants the default ".GDJ".
        mov     byte [bx+3], 'J'
        cmp     byte [damage_journal_ext_gdn], 0
        je      .ext_done
        mov     byte [bx+3], 'N'
.ext_done:
        mov     byte [bx+4], 0
        clc
        ret
.bad:   stc
        ret

; Modeled on make_damage_side_name (cchost_damage.inc): replace only the
; final extension of effectpath, but emit ".DOP" into damage_tokenpath
; instead of ".GBS" into sidepath. Used only by parse_args' /J handling to
; derive the token sibling a plain /D or /D /T instead takes as an argument.
make_damage_dop_name:
        mov     si, effectpath
        mov     di, damage_tokenpath
        mov     cx, PATH_MAX
        xor     bx, bx
.copy:
        jcxz    .bad
        lodsb
        stosb
        dec     cx
        or      al, al
        jz      .end
        cmp     al, '.'
        jne     .separator
        mov     bx, di
        dec     bx
.separator:
        cmp     al, 5Ch
        je      .reset
        cmp     al, '/'
        je      .reset
        cmp     al, ':'
        jne     .copy
.reset:
        xor     bx, bx
        jmp     .copy
.end:
        or      bx, bx
        jz      .bad
        cmp     bx, damage_tokenpath + PATH_MAX - 5
        ja      .bad
        ; damage_tokenpath is later copied verbatim (all PATH_MAX bytes) into
        ; the GBDJ header's +256 field and read back through a zero-padding
        ; check, so a source extension longer than "DOP" must not leave its
        ; own tail bytes nonzero past our new, shorter terminator.
        push    bx
        mov     di, bx
        inc     di
        mov     cx, damage_tokenpath + PATH_MAX
        sub     cx, di
        xor     al, al
        rep     stosb
        pop     bx
        mov     byte [bx+1], 'D'
        mov     byte [bx+2], 'O'
        mov     byte [bx+3], 'P'
        mov     byte [bx+4], 0
        clc
        ret
.bad:
        stc
        ret

; /D /J supplies no save-directory argument (unlike /R): derive
; "<current drive>:\<current directory>\SAVE" from DOS 19h/47h. G2's 98-char
; bound is the same rule parse_args' .recovery enforces on its own argument,
; measured here on the complete derived path (matching what /R's caller-
; supplied damage_source_dir already names in full).
damage_journal_derive_save_dir:
        mov     ah, 19h
        int     21h
        add     al, 'A'
        mov     [damage_source_dir], al
        mov     byte [damage_source_dir+1], ':'
        mov     byte [damage_source_dir+2], 5Ch
        push    si
        mov     dl, 0
        mov     si, damage_source_dir+3
        mov     ah, 47h
        int     21h
        pop     si
        jc      .bad
        mov     di, damage_source_dir+3
.findz: cmp     byte [di], 0
        je      .found
        inc     di
        jmp     .findz
.found:
        cmp     di, damage_source_dir+3
        je      .root_case
        mov     byte [di], 5Ch
        inc     di
.root_case:
        mov     byte [di], 'S'
        mov     byte [di+1], 'A'
        mov     byte [di+2], 'V'
        mov     byte [di+3], 'E'
        mov     byte [di+4], 0
        mov     si, damage_source_dir
        xor     cx, cx
.dirlen:
        mov     al, [si]
        or      al, al
        jz      .dirlen_done
        inc     cx
        inc     si
        jmp     .dirlen
.dirlen_done:
        cmp     cx, 98
        ja      .bad
        clc
        ret
.bad:   stc
        ret

mark_v1_result_consumed:
%ifdef CCHOST_TEST_FAIL_FINAL_RECEIPT
        stc
        ret
%endif
        mov     ax, 3D02h
        mov     dx, combatresultpath
        int     21h
        jc      .bad
        mov     [auto_fh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, GBCR_V1_CONSUMED_OFF
        int     21h
        jc      .close_bad
        mov     bx, [auto_fh]
        mov     ah, 40h
        mov     cx, 2
        mov     dx, gbcr_consumed
        int     21h
        jc      .close_bad
        cmp     ax, 2
        jne     .close_bad
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        clc
        ret
.close_bad:
        mov     bx, [auto_fh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

; The leading compact bytes are the retail DoK .GAM record.  Preserve a real
; source slot's earned XP and readiness byte as well as the GBPR sidecar, so a
; cold CCPARTY /G reload cannot discard a combat victory.  High-bit native
; slots remain sidecar-owned.  An absent source file is legitimate for a
; native-only party, matching CoK's source-save policy.
write_dok_save_award:
        cmp     byte [dok_award_valid], 0
        je      .ok
        mov     al, [gbcr_slot]
        test    al, 80h
        jnz     .ok
        cmp     al, 1
        jb      .ok
        cmp     al, 6
        ja      .ok
        add     al, '0'
        mov     [doksavepath+12], al
        mov     ax, 3D02h
        mov     dx, doksavepath
        int     21h
        jc      .ok
        mov     [gbcr_save_fh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_fail
        or      dx, dx
        jne     .close_fail
        cmp     ax, DOK_CHAR_SIZE
        jne     .close_fail
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, DOK_XP_OFF
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, 4
        mov     dx, dok_award_buf+1+DOK_XP_OFF
        int     21h
        jc      .close_fail
        cmp     ax, 4
        jne     .close_fail
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, DOK_READY_OFF
        int     21h
        jc      .close_fail
        mov     bx, [gbcr_save_fh]
        mov     ah, 40h
        mov     cx, 1
        mov     dx, dok_award_buf+1+DOK_READY_OFF
        int     21h
        jc      .close_fail
        cmp     ax, 1
        jne     .close_fail
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
        jc      .fail
.ok:
        clc
        ret
.close_fail:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret

; Persist verified CoK result fields to the original SAVE\CHRDATA#.SAV source
; when this GBPR record came from an original low-numbered save slot. Native
; created high-bit slots remain GBPR-only.
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
sync_combat_rng:
        cmp word [gamep], game_cok
        jne .ok
        cmp word [gbcrbuf+4], 2
        jne .fail
        mov dx, [effectreadp]
        mov ax, 3D02h
        int 21h
        jc .fail
        mov [efxfh], ax
        mov bx, ax
        mov ax, 4200h
        xor cx, cx
        mov dx, 126
        int 21h
        jc .close_fail
        mov bx, [efxfh]
        mov ah, 40h
        mov cx, 4
        mov dx, gbcrbuf+12
        int 21h
        jc .close_fail
        cmp ax, 4
        jne .close_fail
        mov bx, [efxfh]
        mov ah, 3Eh
        int 21h
        ret
.close_fail:
        mov bx, [efxfh]
        mov ah, 3Eh
        int 21h
.fail: stc
        ret
.ok:   clc
        ret

gbcr_read_len dw 0
%include "cchost_damage.inc"
%include "cchost_damage_journal.inc"
%include "cchost_gbsl_v2.inc"
%include "cchost_npc.inc"

; Direct ECL DAMAGE updates the compact GBD1 cache first. When that record
; names a real DoK source slot, write current HP to retail byte 214 so a later
; cold CCPARTY /G import cannot resurrect it. Byte 40 is maximum HP.
; Only a high-bit native-only slot may omit a retail source. A low slot must
; name a writable, complete DoK character record.
write_dok_save_damage:
        mov     al, [gbcr_slot]
        test    al, 80h
        jnz     .ok
        cmp     al, 1
        jb      .fail
        cmp     al, 6
        ja      .fail
        add     al, '0'
        mov     [doksavepath+12], al
        mov     ax, 3D02h
        mov     dx, doksavepath
%ifdef CCHOST_TEST_FAIL_DOK_SAVE_OPEN
        ; Harness-only late-open failure. It deliberately reaches the normal
        ; post-preflight writer so jc must remain an error, not a false .ok.
        stc
        jmp     .test_open_done
%endif
        int     21h
.test_open_done:
        jc      .fail
        mov     [gbcr_save_fh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_fail
        or      dx, dx
        jne     .close_fail
        cmp     ax, DOK_CHAR_SIZE
        jne     .close_fail
        mov     al, [gbcr_hp]
        mov     [gbcr_hp_byte], al
        mov     bx, [gbcr_save_fh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 214
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
        mov     ah, 3Eh
        int     21h
        jc      .fail
.ok:
        clc
        ret
.close_fail:
        mov     bx, [gbcr_save_fh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret
s_arg_cok_rng db ' /J',0


s_ready db 'CCHOST: combat result applied',13,10,'$'
s_damage_ready db 'CCHOST: effect damage applied',13,10,'$'
s_damage_recovered db 'CCHOST: effect damage recovered',13,10,'$'
s_damage_journal_committed db 'CCHOST: effect damage already committed',13,10,'$'
s_damage_journal_preflight_bad db 'CCHOST: effect damage recovery target unavailable',13,10,'$'
s_damage_journal_restore_bad db 'CCHOST: effect damage recovery incomplete',13,10,'$'
s_damage_journal_recovery_required db 'CCHOST: effect damage recovery required',13,10,'$'
s_damage_journal_incomplete db 'CCHOST: effect damage incomplete',13,10,'$'
; plan §22.5 J.1/J.2
s_damage_journal_absent db 'CCHOST: effect damage journal absent',13,10,'$'
s_damage_journal_not_retired db 'CCHOST: effect damage recovered, journal not retired',13,10,'$'
%ifdef CCHOST_TEST_GBDJ_ACCEPT_MARK
s_damage_journal_accept_mark db 'CCHOST: GBDJ reader accepted (test build)',13,10,'$'
%endif
%ifdef CCHOST_TEST_GBDJ_HOLD_HANDLES
s_nul_device db 'NUL',0
%endif
s_bad db 'CCHOST: invalid host request',13,10,'$'
s_bad_args db 'CCHOST: invalid host request (arguments)',13,10,'$'
s_bad_request db 'CCHOST: invalid host request (state)',13,10,'$'
s_bad_result db 'CCHOST: invalid host request (result)',13,10,'$'
s_bad_magic db 'CCHOST: state magic/version/reserved invalid',13,10,'$'
s_bad_mode db 'CCHOST: state mode invalid',13,10,'$'
s_bad_result_path db 'CCHOST: state result path invalid',13,10,'$'
s_bad_roster_path db 'CCHOST: state roster path invalid',13,10,'$'
s_bad_loop_effect db 'CCHOST: loop-detected effect is not a combat result',13,10,'$'
loopchk times 6 db 0
damage_loop_record db 0
s_bad_effect_path db 'CCHOST: state effect path invalid',13,10,'$'
fh dw 0
mode dw 0
direct_mode db 0
npc_mode db 0
recovery_mode db 0
damage_ack dw 0
damage_preflight dw 0
damageword dw 0
damage_event_count dw 0
damage_event_index dw 0
damage_menu_opcode dw 0
damage_menu_flags dw 0
damage_event_off dw 0,0
damage_event_base dw 0
damage_event_stride dw 0
side_len_lo dw 0
side_len_hi dw 0
damage_side_version dw 0
v2_fh dw 0
v2_base dw 0
v2_extent dw 0
v2_count dw 0
v2_records_end dw 0
v2_dir_base dw 0
v2_payload_base dw 0
v2_payload_len dw 0
v2_tag_count dw 0
v2_seen_tags dw 0
v2_seen_payload dw 0
v2_index dw 0
v2_read_len dw 0
v2_header times 8 db 0
v2_ext times 12 db 0
v2_record times 54 db 0
v2_dir times 8 db 0
v2_packed times 255 db 0
damage_argc dw 0
damage_control dw 0
damage_count dw 0
damage_sides dw 0
damage_bonus dw 0
damage_value dw 0
damage_target_member dw 0
damage_roster_count dw 0
damage_hp_off dw 0
damage_preflight_index dw 0
damage_preflight_off dw 0
damage_token_requested db 0
damage_token_fh dw 0
damage_token_generation dq 0
damage_token_header times GBDO_READ_LEN db 0
auto_fh dw 0
efxfh dw 0
gamep dw 0
effectreadp dw 0
gbcr_count dw 0
gbcr_limit dw 0
gbcr_index dw 0
gbcr_hp dw 0
gbcr_maxhp dw 0
gbcr_cond dw 0
gbcr_hp_byte db 0
gbcr_xp_share dw 0
gbcr_xp_cur dd 0
gbcr_xp_off dw 0
gbcr_magic times 4 db 0
gbcr_consumed dw 1
dok_cast_receipt dw 0
dok_cast_slot db 0
dok_cast_active db 0
dok_award_buf times DOK_AWARD_READ_LEN db 0
dok_award_valid db 0
gbcr_meta_flags dw 0
gbcr_entry_off dw 0
gbcr_roster_fh dw 0
gbcr_save_fh dw 0
gbcr_slot db 0
preflight_only db 0
align 2
roster_expected_len dw 0
roster_check_index dw 0
cok_status_off dw 0
cok_status_byte db 0
rosterhdr times 16 db 0
gbcrbuf times GBCR_BUF_LEN db 0
coksavepath db 'SAVE\CHRDATA1.SAV',0
doksavepath db 'SAVE\CHRDATA1.GAM',0
dokwizpath db 'SAVE\CHRDATA1.WIZ',0
game_cok db 0
game_pool db 0
game_curse db 0
game_secret db 0
game_gateway db 0
game_treasures db 0
game_pod db 0
game_nwn db 0
game_buck db 0
game_matrix db 0
game_gen1 db 0
game_dok db 0
game_dqk db 0
request_name times PATH_MAX db 0
combatresultpath times PATH_MAX db 0
rosterpath times PATH_MAX db 0
effectpath times PATH_MAX db 0
damage_tokenpath times PATH_MAX db 0
damage_source_dir times PATH_MAX db 0
sidepath times PATH_MAX db 0
journalpath times PATH_MAX db 0
request times GBHR_LEN+1 db 0
journal_header db 'GBTX'
               dw GBTX_VERSION
               dw GBTX_PREPARED
               dw 0
journal_result times GBCR_BUF_LEN db 0
journal_file_len dw 0
journal_fh dw 0
journal_left dw 0
journal_roster_len dw 0
journal_data_off dw 0
journal_member_count dw 0
journal_compact db 0
journal_has_wiz db 0
journal_has_sources db 0
journal_title_id db 0
journal_source_required db 0
journal_wiz_slot db 0
journal_source_table times JOURNAL_SOURCE_LEN db 0
journal_buf times 410 db 0
journal_active db 0
journal_recovered db 0
journal_restored db 0
journal_consumed db 0
damage_journal_len_lo dw 0
damage_journal_len_hi dw 0
damage_journal_header times GBDJ_HEADER_LEN db 0
damage_journal_roster times 3296 db 0
damage_journal_members dw 0
damage_journal_sources times GBDJ_SOURCE_TABLE_LEN db 0
damage_journal_source_index dw 0
damage_journal_slot db 0
damage_journal_seen_slots dw 0
damage_journal_payload times 410 db 0
damage_journal_current times 410 db 0
damage_journal_committed db 0
damage_journal_effect_off dw 0
damage_journal_fxflags dw 0
damage_journal_compare_left dw 0
damage_journal_chunk_len dw 0
damage_journal_preflight_bad db 0
damage_journal_restore_bad db 0
; plan §22.5 J.1: set by recover_damage_journal's .GDJ open when it fails
; with AX = 2 (absent, not damaged); recover_damage tests this before the
; preflight/restore-bad dispatch above.
damage_journal_absent db 0
; Destination preflight (plan step 5). Index 0 is the roster; index k+1 is
; source-table ordinal k (0..5). Every slot is 0FFFFh unless it names an
; open, rewound-to-0 handle retained across a successful preflight.
damage_restore_fh times 7 dw 0FFFFh
damage_restore_path times PATH_MAX db 0
damage_restore_slot db 0
damage_restore_index dw 0
; Restore (plan step 6). damage_restore_units_done is both the count of
; units successfully written so far and the index of the unit about to be
; attempted -- CRASH_AT/TEAR_AT/FAIL_AT/SHORT_AT fixtures compare against it
; before that unit's write. damage_restore_close_bad latches a close
; failure across the unconditional close-everything loop.
damage_restore_units_done db 0
damage_restore_close_bad db 0
damage_restore_unit_handle dw 0
damage_restore_unit_buf dw 0
damage_restore_unit_len dw 0
; Producer (plan step 7a).
damage_journal_mode db 0
damage_journal_ext_gdn db 0
damage_journal_validate_only db 0
damage_journal_live db 0
damage_journal_existing_kind db 0
damage_journal_mask dw 0
damage_journal_gdn_fh dw 0
damage_journal_produce_fh dw 0
damage_journal_gdj_path times PATH_MAX db 0
damage_journal_gdn_path times PATH_MAX db 0
damage_journal_dop_scratch times PATH_MAX db 0
damage_journal_write_site db 0
damage_journal_write_first db 0
damage_journal_write_len dw 0
damage_journal_commit_state dw 0
%ifdef CCHOST_TEST_GBDJ_D_CORRUPT
damage_journal_corrupt_word dw 0
%endif
%ifdef CCHOST_TEST_GBDJ_D_CRASH
damage_journal_hook_fired db 0
%endif
%ifdef CCHOST_TEST_GBDJ_HOLD_HANDLES
damage_hold_fh times CCHOST_TEST_GBDJ_HOLD_HANDLES dw 0FFFFh
%endif
secret_request_only db 0
secret_prepared:
        mov dx,sc_prepared_message
        call puts
        mov ax,4C00h
        int 21h
sc_prepared_message db 'CCHOST: Secret combat binding ready',13,10,'$'
secret_expected_roster times PATH_MAX db 0
%include "secrethost.inc"
times 128 db 0
stacktop:
