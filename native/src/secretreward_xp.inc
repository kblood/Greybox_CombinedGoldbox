; Fixed-gift READ-ONLY XP scalar helpers. No actor/global/P1 writes or authority.
; Caller supplies admitted exact actor bytes and source suppression word, derives
; physical count/exclusions, and owns the once-only award/whole-P1 write set.
; All routines preserve SI. Other arithmetic registers/flags are scratch.

; SI=DS:439-byte actor -> EAX=0/1, CF clear. EDX/CX/BX preserved.
rx_eligible:
        xor eax,eax
        cmp byte [si+423],0
        je .done
        cmp byte [si+422],1
        je .done
        inc eax
.done:
        clc
        ret

; CX=physical count1..6, BX=DERIVED exclusions -> EAX=15000/denominator,
; DX=denominator (1..6), CF clear. Invalid/zero eligibility -> EAX=0, CF set.
; No virtual divisor1: caller must refuse before accepting the originating answer.
rx_divide_share:
        cmp cx,1
        jb .bad
        cmp cx,6
        ja .bad
        cmp bx,cx
        jae .bad
        sub cx,bx
        movzx ebx,cx
        mov eax,15000
        xor edx,edx
        div ebx
        mov dx,bx
        clc
        ret
.bad:
        xor eax,eax
        stc
        ret

; SI=actor, EDX=raw u32 share, CX=whole u16 bank0+3EA suppression.
; EAX=raw u32 award/CF clear for every valid source-width scalar input.
; Class bytes17..255 preserve source's default unchanged share; suppressed or
; ineligible actors return0 without inspecting class. Caller admits body bounds.
; Signed32 division mirrors original C5D:0294; addition wraps u32. Real fixed
; gift shares are positive<=15000; full-width helper inputs are diagnostics only.
rx_award_scalar:
        xor eax,eax
        test cx,cx
        jnz .zero
        call rx_eligible
        test eax,eax
        jz .zero
        movzx ecx,byte [si+108]
        mov eax,edx
        cmp ecx,16
        ja .done                 ; source default, including signed-negative bytes
        cmp cl,0
        je .class0
        cmp cl,2
        je .class2
        cmp cl,3
        je .class3
        cmp cl,4
        je .class4
        cmp cl,5
        je .class5
        cmp cl,6
        je .class6
        mov ebx,0x17d00          ; classes8,10..14,16; validated class<=16
        bt ebx,ecx
        jc .half
        cmp cl,9
        je .third
        cmp cl,15
        je .third
        jmp .done               ; classes1,7: unadjusted
.class0:
        cmp byte [si+21],14
        jbe .done               ; original unsigned JBE
        jmp .bonus
.class4:
        cmp byte [si+19],15
        jbe .done
.class3:
        cmp byte [si+21],15
        jbe .done
.class2:
        cmp byte [si+17],15
        jbe .done
        jmp .bonus
.class5:
        cmp byte [si+19],15
        jbe .done
        jmp .bonus
.class6:
        cmp byte [si+23],15
        jbe .done
.bonus:
        mov ebx,eax
        mov ecx,10
        cdq
        idiv ecx
        add eax,ebx
        jmp .done
.half:
        mov ecx,2
        jmp .divide
.third:
        mov ecx,3
.divide:
        cdq
        idiv ecx
.done:
        clc
        ret
.zero:
        xor eax,eax
        clc
        ret
