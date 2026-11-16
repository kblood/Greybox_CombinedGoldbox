; Original CoK Borland Random: EAX=32-bit state, ECX=unsigned bound.
; Returns EAX=next state and EDX=zero-based result, including bound zero.
; Count/sides and ECL inclusive-byte maximum rules belong to the caller.
cr_bounded:
        imul eax, eax, 08088405h
        inc eax
        push eax
        shr eax, 16
        xor edx, edx
        test ecx, ecx
        jz .done
        div ecx
.done: pop eax
        ret
