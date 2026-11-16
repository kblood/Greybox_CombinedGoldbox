; Owned CoK mutation orchestration. Large validation/staging stays in CCINV.
mutation_bridge:
        xor ax, ax
        cmp word [gamep], game_cok
        jne .done
        cmp word [fxstatus], 4
        jne .done
        mov dx, [effectreadp]
        mov ax, 3D00h
        int 21h
        jc .bad
        mov bx, ax
        mov ax, 4200h
        xor cx, cx
        mov dx, 5720
        int 21h
        jc .close_bad
        mov ah, 3Fh
        mov dx, fxbuf
        mov cx, 10
        int 21h
        jc .close_bad
        cmp ax, 10
        jne .close_bad
        mov ah, 3Eh
        int 21h
        jc .bad
        xor ax, ax
        cmp dword [fxbuf], 'GBHD'
        jne .bad
        cmp word [fxbuf+4], 6
        jne .done
        cmp word [fxbuf+8], 40h
        jne .bad
        ; Manifest scratch and B/M outputs are owned by this synchronous bridge.
        mov di, fxbuf
        mov cx, 336
        rep stosw
        mov dword [fxbuf], 'GBMB'
        mov dword [fxbuf+4], 02A00002h
        mov ax, [damage_ack]
        mov [fxbuf+8], ax
        mov si, learn_state
        mov di, fxbuf+16
        mov cx, 8
        rep movsb
        mov si, inventorypath
        mov di, fxbuf+32
        call mutation_copy
        mov si, [effectreadp]
        mov di, fxbuf+160
        call mutation_copy
        mov si, rosterpath
        mov di, fxbuf+288
        call mutation_copy
        mov si, seedpath
        mov di, fxbuf+416
        call mutation_copy
        mov si, [eclp]
        mov di, fxbuf+544
        call mutation_copy
        mov si, fxbuf
        mov cx, 672
        call buffer_crc
        mov [fxbuf+28], eax
        mov dx, inventorycorepath
        mov si, fxbuf
        mov cx, 672
        call checkpoint_write
        jc .bad
        mov dx, learnrequestpath
        call mutation_delete
        mov dx, learnresponsepath
        call mutation_delete
        mov al, 'B'
        call mutation_helper
        jc .bad
        mov al, 'M'
        call mutation_helper
        jc .bad
%ifdef MUTATION_TEST_BAD_SOURCE
        mov dx, [eclp]
        mov ax, 3D02h
        int 21h
        jc .bad
        mov bx, ax
        mov ax, 4200h
        xor cx, cx
        mov dx, 2
        int 21h
        jc .close_bad
        mov byte [fxbuf], 255        ; make yielded archive block unavailable
        mov dx, fxbuf
        mov cx, 1
        mov ah, 40h
        int 21h
        mov ah, 3Eh
        int 21h
%endif
        mov byte [mutation_mode], 0
        call mutation_vm
        jc .bad
        mov al, 'C'
        call mutation_helper
        jc .bad
        ; Preserve C's movement refresh before sync_ecl_timers rewrites GBPS.
        mov dx, seedpath
        mov si, fxbuf
        mov cx, 3161
        call checkpoint_read
        jc .bad
        cmp ax, 3160
        jne .bad
        mov al, [fxbuf+17]
        mov [seed_move_count], al
        mov si, fxbuf+70
        mov di, seed_moves
        mov cx, 8
        rep movsw
        mov word [inventory_dirty], 0FFFFh
        call mutation_clear_yield
        mov byte [mutation_mode], 1
        call mutation_vm
        jc .bad
        mov ax, 1
.done: clc
        ret
.close_bad:
        mov ah, 3Eh
        int 21h
.bad:  stc
        ret

mutation_copy:
        lodsb
        stosb
        test al, al
        jnz mutation_copy
        ret

mutation_delete:
        mov ah, 41h
        int 21h
        ret

mutation_clear_yield:
        cmp word [gamep], game_cok
        jne .done
        mov si, [effectwritep]
        mov di, fxbuf
        call mutation_copy
        sub di, 4                  ; owned host effect paths have .BIN suffix
        mov dword [di], 'YLD'
        mov dx, fxbuf
        call mutation_delete
.done: ret

mutation_helper:
        mov [mutation_mode], al
        call tail_begin
        mov al, [mutation_mode]
        call tail_append_char
        call tail_append_space
        mov si, inventorycorepath
        cmp byte [mutation_mode], 'M'
        jne .first
        mov si, inventorypath
.first: call tail_append_str
        call tail_append_space
        mov si, learnrequestpath
        call tail_append_str
        cmp byte [mutation_mode], 'B'
        je .run
        call tail_append_space
        mov si, learnresponsepath
        call tail_append_str
.run:  jmp inventory_run.run

mutation_vm:
        call tail_begin
        call tail_append_space
        mov si, [eclp]
        call tail_append_str
        call tail_append_space
        mov ax, [eclid]
        call tail_append_dec
        call append_ccecl_seed_args
        call append_ccecl_roster_arg
        mov si, s_arg_resume
        call tail_append_str
        mov si, learnresponsepath
        call tail_append_str
        mov si, mutation_check
        cmp byte [mutation_mode], 0
        je .outcome
        mov si, mutation_resume
.outcome:
        call tail_append_str
        cmp byte [mutation_mode], 0
        je .run
        mov si, s_arg_effect
        call tail_append_str
        mov si, [effectwritep]
        call tail_append_str
.run:  call tail_finish
        mov word [runpathp], child_ecl
        call do_exec
        jc .done
        mov ah, 4Dh
        int 21h
        test al, al
        jz .done
        stc
.done: ret

damage_ack dw 0
mutation_mode db 0
mutation_from_combat db 0
mutation_check db ' CHECK',0
mutation_resume db ' MUTATE',0
