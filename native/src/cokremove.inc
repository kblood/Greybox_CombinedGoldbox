; Staged CoK removal kernel; 386, DS=ES caller data, DF clear, near calls.
; Caller supplies cm_body, cm_table, cm_effects (9-byte records), cm_fxcount,
; cm_count (32-bit inventory count), cm_head and cm_target before cm_destroy.
; Working inventory links at +42 are stable u32 indices, FFFFFFFF=end.
; Hooks cm_read/cm_write: EAX=index, transfer cm_record[63], CF=I/O failure.
; Hook cm_notify: AL=0 item / 1 effect, EDX=removed index; preserves nothing.
; Effects are staged in memory; initial order is array order. Count <=256.
; CF rejects whole stage (unsupported applied callback, malformed chain, I/O,
; undefined stat state, original missing-node error). Never publish on CF.
; Success: cm_head / cm_fxhead identify live chains; cs_slots stable indices.
; Caller may compact a completed owner into unpublished staging; publish the
; combined candidate only after all owners succeed. Discard all staging on CF.
; Includes cokstats.inc and cokability.inc in the caller's translation unit.
;
; GBOC v1 effect-7 output authorization (2026-09-09,
; docs/engine/research/cok-mutation-output-ownership.md). Optional caller
; input: cm_gboc (word, 0 or a pointer to a 40-byte GBOC record) and
; cm_gbef_rng (dword, the paused GBEF RNG state cm_gboc's rng-before must
; match). Both default to zero, so every EXISTING caller (the real CCINV.COM
; pipeline, the standalone cokremove-driver.asm/tools.cok_native_removal
; harness, and every Python-vs-native differential test) is unaffected byte
; for byte: with cm_gboc==0, an applied kind-7 effect still falls straight to
; cm_bad exactly as before this change. Only a caller that explicitly sets
; cm_gboc to a validated-looking record can reach the new .damage path in
; cm_remove_effect, and cm_authorize_output re-validates that record's
; ENVELOPE fully (magic/version/length/reserved-zero/self-CRC/RNG-fold/
; callback-id/target) before touching any state. cm_body's byte layout is the
; ORIGINAL retail character-body struct (cokremove-driver.asm's fixture is a
; real 409-byte Champions of Krynn CHRDATA1.SAV body; cm_destroy's own
; `.finish` already clears struct offsets 227/323 by that same convention),
; so the HP write at +407 and the status/active-flag writes at +392/+393
; reuse the exact offsets docs/engine/research/cok-item-removal-native-plan.md's
; 2026-09-08 continuation dynamically confirmed for E6:0xA7 (`es:[di+0x197]`,
; `es:[di+0x188]`, `es:[di+0x189]`).
;
; SCOPE, NARROWED 2026-09-09 by an adversarial review that executed the
; retail binary against varied PRIOR status values (every existing test,
; native and Python, had held prior status fixed at 0, so nothing caught
; this): retail E6:0xA7 has two additional mechanisms keyed on the prior
; status byte at struct+392 that this routine's arithmetic does NOT
; reproduce -- (1) a second route to status 6 when remaining HP hits 0 and
; prior status was already 1, and (2) a post-hoc membership gate that forces
; HP=0/active=0 whenever the RESULTING status is outside {0,1}, even for a
; zero-damage call. Rather than reimplement that state machine unverified,
; this routine now REJECTS (falls to cm_bad) any write-present GBOC record
; whose target's prior status is not exactly 0 -- see the `cmp byte
; [bx+392], 0` guard below. Its damage arithmetic is proven correct only for
; that one prior-status value; a target already at status 1/2/4/5/6 can never
; be authorized through this path yet. This narrows, not widens, the
; original claim.
;
; PROVENANCE, NOT JUST CONSISTENCY (2026-09-09, second adversarial finding):
; the RNG-fold check (`.fold` below) proves a GBOC record's rng_before/
; rng_after/draws fields are mutually self-consistent -- NOT that the record
; actually originated from a real cm_remove_effect kind-7 invocation with a
; real damage value. A forged record with an internally-consistent fold and
; an arbitrary `damage` byte (0..255) passes every check this routine makes.
; This routine is an envelope/arithmetic validator, not a provenance oracle;
; whatever constructs cm_gboc records (CCINV's B/M stages) is the actual
; trust boundary, and that construction path is what must be trusted, not
; this check alone.
;
; This round's scope is single-target/single-owner: cm_authorize_output
; requires target_ordinal==1 (the record's own owner). Wiring cm_gboc/
; cm_gbef_rng through the full GBMR request/response envelope (GBMR v3,
; 2026-09-09) and through cokyield.inc's CCECL-side check/resume validation
; are addressed by the v3 work above; see the design doc's dated section for
; what remains open.

cm_destroy:
        cmp word [cm_fxcount], 256
        ja cm_bad
        mov dword [cm_fxhead], -1
        movzx ecx, word [cm_fxcount]
        test ecx, ecx
        jz .items
        mov dword [cm_fxhead], 0
        xor eax, eax
        mov di, [cm_effects]
.init_effect:
        inc eax
        mov [di+5], eax
        add di, 9
        cmp eax, ecx
        jb .init_effect
        mov dword [di-4], -1
.items: mov eax, [cm_head]
        mov [cm_current], eax
        mov eax, [cm_count]
        mov [cm_outerleft], eax
.outer:
        mov eax, [cm_current]
        cmp eax, -1
        je .finish
        cmp dword [cm_outerleft], 0
        je cm_bad
        dec dword [cm_outerleft]
        call cm_get
        jc cm_bad
        mov eax, [cm_record+42]
        mov [cm_following], eax
        mov al, [cm_record+46]
        cmp al, [cm_target]
        jne .next
        cmp byte [cm_record+52], 0
        je .unlink
        cmp byte [cm_record+54], 0
        jne .unlink
        mov byte [cm_record+52], 0
        mov al, [cm_record+62]
        mov [cm_action], al
        mov al, [cm_record+61]
        mov [cm_kind], al
        mov eax, [cm_current]
        call cm_put
        jc cm_bad
        mov al, [cm_action]
        test al, 128
        jz .unlink
        and al, 127
        cmp al, 0
        je .effect
        cmp al, 2
        je .effect
        cmp al, 3
        je .strength
        cmp al, 5
        je .strength
        cmp al, 9
        jne .unlink
        mov byte [cm_kind], 17h
.effect:
        call cm_remove_effect
        jc cm_bad
        jmp .unlink
.strength:
        xor al, al
        call cm_ability
        jc cm_bad
.unlink:
        mov eax, [cm_current]
        call cm_unlink
        jc cm_bad
.next: mov eax, [cm_following]
        mov [cm_current], eax
        jmp .outer
.finish:
        call cm_stats
        jc cm_bad
        mov si, [cm_body]
        mov dword [si+227], 0
        mov dword [si+323], 0
cm_ok: clc
        ret
cm_bad: stc
        ret

cm_get:
        cmp eax, [cm_count]
        jae cm_bad
        jmp cm_read
cm_put:
        cmp eax, [cm_count]
        jae cm_bad
        jmp cm_write

cm_scan_begin:
        mov eax, [cm_count]
        mov [cm_scanleft], eax
        mov eax, [cm_head]
        mov [cm_scan], eax
        ret
cm_scan_get:
        cmp dword [cm_scanleft], 0
        je cm_bad
        dec dword [cm_scanleft]
        mov eax, [cm_scan]
        call cm_get
        jc cm_bad
        mov eax, [cm_record+42]
        mov [cm_scannext], eax
        jmp cm_ok
cm_scan_next:
        mov eax, [cm_scannext]
        mov [cm_scan], eax
        ret

cm_unlink:
        mov [cm_removed], eax
        mov dword [cm_previous], -1
        call cm_scan_begin
.search:
        cmp dword [cm_scan], -1
        je cm_bad
        call cm_scan_get
        jc cm_bad
        mov eax, [cm_scan]
        cmp eax, [cm_removed]
        je .found
        mov [cm_previous], eax
        call cm_scan_next
        jmp .search
.found:
        mov eax, [cm_record+42]
        mov [cm_removednext], eax
        mov dword [cm_record+42], -1
        mov eax, [cm_removed]
        call cm_put
        jc cm_bad
        mov eax, [cm_previous]
        cmp eax, -1
        jne .previous
        mov eax, [cm_removednext]
        mov [cm_head], eax
        jmp .notify
.previous:
        call cm_get
        jc cm_bad
        mov eax, [cm_removednext]
        mov [cm_record+42], eax
        mov eax, [cm_previous]
        call cm_put
        jc cm_bad
.notify:
        mov edx, [cm_removed]
        xor al, al
        call cm_notify
        jmp cm_ok

cm_fx_get:
        movzx edx, word [cm_fxcount]
        cmp eax, edx
        jae cm_bad
        imul di, ax, 9
        add di, [cm_effects]
        jmp cm_ok

cm_remove_effect:
        mov dword [cm_fxprevious], -1
        mov eax, [cm_fxhead]
        mov [cm_fxcurrent], eax
        movzx eax, word [cm_fxcount]
        mov [cm_fxleft], eax
.search:
        mov eax, [cm_fxcurrent]
        cmp eax, -1
        je cm_ok
        cmp dword [cm_fxleft], 0
        je cm_bad
        dec dword [cm_fxleft]
        call cm_fx_get
        jc cm_bad
        mov al, [cm_kind]
        cmp al, [di]
        je .found
        mov eax, [cm_fxcurrent]
        mov [cm_fxprevious], eax
        mov eax, [di+5]
        mov [cm_fxcurrent], eax
        jmp .search
.found:
        cmp byte [di+4], 0
        je .unlink
        cmp al, 17h
        je .conjured
        cmp al, 0Ch
        je .unlink
        cmp al, 0Eh
        je .unlink
        cmp al, 26h
        je .unlink
        cmp al, 7
        je .damage
        jmp cm_bad
.damage:
        ; GBOC-authorized effect-7 output only; see the file header. Absent a
        ; caller-supplied record (the default, every existing call site) this
        ; rejects exactly as it did before this branch existed.
        cmp word [cm_gboc], 0
        je cm_bad
        call cm_authorize_output
        jc cm_bad
        jmp .unlink
.conjured:
        call cm_scan_begin
.find_item:
        cmp dword [cm_scan], -1
        je .stats
        call cm_scan_get
        jc cm_bad
        cmp byte [cm_record+46], 6
        jne .next_item
        cmp byte [cm_record+49], 79h
        jne .next_item
        mov eax, [cm_scan]
        call cm_unlink
        jc cm_bad
        jmp .stats
.next_item:
        call cm_scan_next
        jmp .find_item
.stats: call cm_stats
        jc cm_bad
.unlink:
        mov eax, [cm_fxcurrent]
        call cm_fx_get
        jc cm_bad
        mov eax, [di+5]
        mov [cm_fxnext], eax
        mov dword [di+5], -1
        mov eax, [cm_fxprevious]
        cmp eax, -1
        jne .previous
        mov eax, [cm_fxnext]
        mov [cm_fxhead], eax
        jmp .notify
.previous:
        call cm_fx_get
        jc cm_bad
        mov eax, [cm_fxnext]
        mov [di+5], eax
.notify:
        mov edx, [cm_fxcurrent]
        mov al, 1
        call cm_notify
        mov al, [cm_kind]
        cmp al, 0Eh
        je .charisma
        cmp al, 0Ch
        je .strength
        cmp al, 26h
        jne cm_ok
.strength:
        xor al, al
        jmp cm_ability
.charisma:
        mov al, 5
        jmp cm_ability

cm_stats:
        mov si, [cm_body]
        mov di, [cm_table]
        call cs_begin
        jc cm_bad
        call cm_scan_begin
.item: cmp dword [cm_scan], -1
        je .finish
        call cm_scan_get
        jc cm_bad
        mov si, cm_record
        mov eax, [cm_scan]
        call cs_item
        jc cm_bad
        call cm_scan_next
        jmp .item
.finish:
        jmp cs_finish

cm_ability:
        mov si, [cm_body]
        call ca_begin
        jc cm_bad
        call cm_scan_begin
.item: cmp dword [cm_scan], -1
        je .effects
        call cm_scan_get
        jc cm_bad
        mov si, cm_record
        call ca_item
        jc cm_bad
        call cm_scan_next
        jmp .item
.effects:
        mov eax, [cm_fxhead]
        mov [cm_fxscan], eax
        movzx eax, word [cm_fxcount]
        mov [cm_fxscanleft], eax
.effect:
        mov eax, [cm_fxscan]
        cmp eax, -1
        je .finish
        cmp dword [cm_fxscanleft], 0
        je cm_bad
        dec dword [cm_fxscanleft]
        call cm_fx_get
        jc cm_bad
        mov eax, [di+5]
        mov [cm_fxscan], eax
        mov si, di
        call ca_effect
        jc cm_bad
        jmp .effect
.finish:
        jmp ca_finish

; GBOC v1 validate+apply for effect kind 7. SI=[cm_gboc]. Mirrors
; tools/cok_mutation_output.py's validate() field-for-field (magic, version,
; length, self-CRC over bytes 0..35, all reserved bytes zero, rng-before must
; match cm_gbef_rng, write-flag-clear requires every output field zero and
; rng-after==rng-before, write-flag-present requires callback id 7, a nonzero
; draw count, rng-after folding `draws` applications of state*08088405h+1 over
; rng-before, and target_ordinal==1 -- single-owner scope, see the file
; header). Only on a fully-validated write-present record does this touch
; [cm_body]: it reproduces E6:0xA7's own arithmetic exactly (clamp(hp-damage,
; 0) at +407, then on any lethal result a status byte at +392 -- 4 exact, 5
; overkill<=9, 6 overkill>9 -- and clearing the active flag at +393; a
; non-lethal remainder never touches +392/+393, matching the documented
; "(50,0,1) unchanged" zero-damage null). CF on any rejection; nothing is
; touched on CF, including cm_gbef_rng.
cm_authorize_output:
        mov si, [cm_gboc]
        cmp dword [si], 'GBOC'
        jne cm_bad
        cmp word [si+4], 1
        jne cm_bad
        cmp word [si+6], 40
        jne cm_bad
        mov di, si
        mov cx, 36
        call cm_output_crc
        cmp eax, [si+36]
        jne cm_bad
        cmp byte [si+11], 0
        jne cm_bad
        cmp word [si+14], 0
        jne cm_bad
        cmp byte [si+27], 0
        jne cm_bad
        mov di, si
        add di, 30
        mov cx, 6
.reserved:
        cmp byte [di], 0
        jne cm_bad
        inc di
        loop .reserved
        mov eax, [si+16]
        cmp eax, [cm_gbef_rng]
        jne cm_bad
        movzx bx, byte [si+10]
        cmp bx, 1
        je .write_present
        test bx, bx
        jnz cm_bad
        cmp word [si+12], 0
        jne cm_bad
        cmp word [si+24], 0
        jne cm_bad
        cmp byte [si+26], 0
        jne cm_bad
        cmp word [si+28], 0
        jne cm_bad
        mov eax, [si+20]
        cmp eax, [si+16]
        jne cm_bad
        clc
        ret
.write_present:
        cmp word [si+8], 7
        jne cm_bad
        mov cx, [si+12]
        test cx, cx
        jz cm_bad
        mov eax, [si+16]
.fold:  imul eax, eax, 08088405h
        inc eax
        loop .fold
        cmp eax, [si+20]
        jne cm_bad
        cmp word [si+24], 1
        jne cm_bad
        movzx dx, byte [si+26]
        mov bx, [cm_body]
        ; 2026-09-09 adversarial-review fix: retail E6:0xA7 (file
        ; 0x038A7D-0x038B78, confirmed by Unicorn execution against the
        ; retail GAME.OVR binary) has TWO mechanisms this routine did not
        ; reproduce -- a second route to status 6 when remaining HP is 0 AND
        ; the PRIOR status (es:[di+0x188], this struct's +392) was already 1,
        ; and a post-hoc membership gate that forces HP=0/active=0 whenever
        ; the resulting status is outside {0,1}, even for a zero-damage call.
        ; Both are keyed on the prior status byte, which this routine never
        ; read. Rather than reimplement that full state machine sight
        ; unseen, narrow this routine's scope to the one prior-status value
        ; its existing arithmetic below IS proven correct for: status 0
        ; ("alive/undamaged"). Any other prior status is rejected outright,
        ; so a caller can never observe wrong output for a status this
        ; routine doesn't handle -- it simply refuses to authorize.
        cmp byte [bx+392], 0
        jne cm_bad
        movzx ax, byte [bx+407]
        cmp ax, dx
        jb .overkill
        sub ax, dx
        mov [bx+407], al
        test ax, ax
        jnz .apply_rng
        mov byte [bx+392], 4
        mov byte [bx+393], 0
        jmp .apply_rng
.overkill:
        mov cx, dx
        sub cx, ax
        mov byte [bx+407], 0
        mov byte [bx+393], 0
        cmp cx, 9
        jbe .partial
        mov byte [bx+392], 6
        jmp .apply_rng
.partial:
        mov byte [bx+392], 5
.apply_rng:
        mov eax, [si+20]
        mov [cm_gbef_rng], eax
        clc
        ret

; DI buffer, CX byte count -> EAX CRC32 (bytewise poly 0EDB88320h, init -1,
; final NOT, matching zlib.crc32 and cokyield.inc's iy_crc). Preserves SI.
cm_output_crc:
        push si
        mov si, di
        mov eax, -1
.byte: xor al, [si]
        inc si
        mov bl, 8
.bit:  shr eax, 1
        jnc .next
        xor eax, 0EDB88320h
.next: dec bl
        jnz .bit
        loop .byte
        not eax
        pop si
        ret

cm_gboc dw 0
cm_gbef_rng dd 0
cm_body dw 0
cm_table dw 0
cm_effects dw 0
cm_fxcount dw 0
cm_target db 0
cm_action db 0
cm_kind db 0
cm_count dd 0
cm_head dd -1
cm_fxhead dd -1
cm_current dd 0
cm_following dd 0
cm_outerleft dd 0
cm_scan dd 0
cm_scannext dd 0
cm_scanleft dd 0
cm_previous dd 0
cm_removed dd 0
cm_removednext dd 0
cm_fxcurrent dd 0
cm_fxprevious dd 0
cm_fxnext dd 0
cm_fxleft dd 0
cm_fxscan dd 0
cm_fxscanleft dd 0
cm_record times 63 db 0
