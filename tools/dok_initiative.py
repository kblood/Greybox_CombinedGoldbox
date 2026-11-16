"""DoK (Death Knights of Krynn) combat initiative / turn order, derived from GAME.OVR.

Rule (all file offsets are GAME.OVR offsets; see docs/engine/research/dok-initiative.md):

PER ROUND (the combat loop at 0x8C68-0x8D4E runs the three steps below once per round):

1. CalculateInitiative (0x1ED0F, reached by `lcall 0x89:0x25`, called at 0x8C91 for every
   combatant in the team list): for each combatant in combat

       delay = max(1, Random(6)+1 + DexReactionAdj(dex))          # 1d6 + dex modifier, floor 1
       if (team+1) & surprise_mask:  delay -= 6                    # surprised side
       if delay < 0 or delay > 20:   delay = 0

   and delay = 0 for a combatant not in combat (no RNG draw). The result is the action
   record's byte +3 (`actions.delay`).
2. The surprise byte (area2 + [DS:0846] = area2+2CBh) is cleared right after the whole list has
   been rolled (0x8CAB-0x8CB7), so surprise costs the affected side only the first round unless
   script re-sets it.
3. Order builder (0x910A, near call at 0x8CBE): walk the team list in list order and insertion-
   sort into DS:C4D5[] (<= 0x48 far pointers), HIGHEST delay first. A newcomer goes in front of the
   first entry whose delay it beats; on a TIE it flips a coin, Random(2) (dice(1,2)) == 1 puts it in
   front of that entry, otherwise it moves on to the next entry.

Acting (0x9275) then walks that array in order and skips combatants with delay <= 0; a delay of
20 is lowered to 19 there.

DexReactionAdj (0x3363A, `lcall 0xCF:0x61`) is a byte-range table over the DEX byte at +0x17.

The model parameters (`die`, `surprise_penalty`, ...) exist so mutation tests can show that a
wrong rule is detected against the unchanged original routines run under Unicorn.
"""
from pathlib import Path
import struct

from tools import dok_rng

# GAME.OVR addresses (file offsets)
CALC_INITIATIVE = 0x1ED0F
DEX_REACTION_ADJ = 0x3363A
BUILD_ORDER = 0x910A
ACT_ON_TURN = 0x9275
ROUND_LOOP = 0x8C68
SORT_CAP = 0x48

DEX_TABLE = (  # (lo, hi, adjustment) -- anything else is 0
    (0, 2, -4), (3, 5, None), (16, 18, None), (19, 20, 3), (21, 23, 4), (24, 25, 5))


def dex_reaction_adj(dex):
    """0-2 -> -4, 3-5 -> dex-6, 16-18 -> dex-15, 19-20 -> 3, 21-23 -> 4, 24-25 -> 5, else 0."""
    if not isinstance(dex, int) or not 0 <= dex <= 255:
        raise ValueError('DEX is a byte')
    if dex <= 2:
        return -4
    if 3 <= dex <= 5:
        return dex-6
    if 16 <= dex <= 18:
        return dex-15
    if 19 <= dex <= 20:
        return 3
    if 21 <= dex <= 23:
        return 4
    if 24 <= dex <= 25:
        return 5
    return 0


def _signed(byte):
    byte &= 255
    return byte-256 if byte >= 128 else byte


def roll_delay(state, dex, in_combat, team, surprise_mask, *, die=6, floor=1,
               surprise_penalty=6, use_dex=True, apply_surprise=True):
    """CalculateInitiative's delay for one combatant. Returns (state, delay_byte)."""
    if not in_combat:
        return state, 0
    adj = dex_reaction_adj(dex) if use_dex else 0
    state, roll = dok_rng.dice(state, 1, die)
    delay = _signed(roll+adj)
    if delay < floor:
        delay = floor
    if apply_surprise and ((team+1) & surprise_mask & 255) != 0:
        delay = _signed(delay-surprise_penalty)
    if delay < 0 or delay > 20:
        delay = 0
    return state, delay


def build_order(state, delays, *, descending=True, coin_ties=True, cap=SORT_CAP):
    """Order builder: returns (state, [list indices in acting order]).

    `delays` are the action bytes in team-list order. Mirrors 0x910A including the RNG draw
    taken at every tie met during an insertion scan.
    """
    slots = []   # indices into delays
    for index, delay in enumerate(delays):
        d = _signed(delay)
        pos = 0
        while pos < 0x40:                       # 0x910A scans positions 1..0x40
            if pos >= len(slots):
                break                           # empty slot reads as -1: always loses
            other = _signed(delays[slots[pos]])
            beats = d > other if descending else d < other
            if beats:
                break
            if d == other:
                if coin_ties:
                    state, flip = dok_rng.dice(state, 1, 2)
                    if flip == 1:
                        break
                # without a coin the equal entry is simply passed (stable order)
            pos += 1
        slots.insert(pos, index)
        del slots[cap:]
    return state, slots


# --------------------------------------------------------------------------------------------
# Oracle: run the unchanged original routines under Unicorn (reuses tools/dok_rng_oracle.py)
# --------------------------------------------------------------------------------------------
DS_BASE = 0x50000
PLAYER_BASE = 0x72000
PLAYER_STRIDE = 0x200
ACTION_BASE = 0x73800
AREA2 = 0x74000
SURPRISE_OFFSET = 0x2CB     # word at DS:0846 in the unpacked START.EXE image
DS_AREA2_PTR = 0x8C31
DS_TEAM_HEAD = 0xA2C6
DS_ORDER = 0xC4D5
P_DEX, P_NEXT, P_ACTION, P_IN_COMBAT, P_TEAM = 0x17, 0xB9, 0xBD, 0xC8, 0xC9
A_DELAY = 3
XOR_RETF = bytes((0x31, 0xC0, 0xCA))   # xor ax,ax ; retf n


def _far(address):
    return struct.pack('<HH', address & 15, address >> 4)


class Oracle:
    """Original CalculateInitiative / DexReactionAdj / order builder, callees stubbed out except
    the dice routine (0xC5:4D), DexReactionAdj (0xCF:61) and the resident Random/FillChar."""
    REAL_STUBS = {(0xC5, 0x4D), (0xCF, 0x61)}

    def __init__(self, retail, *, calc_stubs=True):
        from tools import dok_rng_oracle
        self.m = dok_rng_oracle.Machine(retail)
        self.retail_overlay = retail[1]
        self.uc = self.m.uc
        if calc_stubs:
            self._stub_everything_else()
        data = self.uc.mem_read(DS_BASE+0x846, 2)
        assert struct.unpack('<H', data)[0] == SURPRISE_OFFSET
        self.uc.mem_write(DS_BASE+DS_AREA2_PTR, _far(AREA2))

    # -- stubbing ------------------------------------------------------------------------
    def _retf_operand(self, file_offset):
        import capstone
        loc = self.m.location(file_offset)
        code = bytes(self.uc.mem_read(loc, 0x800))
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
        pos = 0
        while pos < len(code):
            for ins in md.disasm(code[pos:], pos):
                if ins.mnemonic == 'retf':
                    return int(ins.op_str, 0) if ins.op_str else 0
                pos = ins.address+ins.size
            pos += 1                        # skip an undecodable byte (CS-relative data)
        raise AssertionError(f'no retf after {file_offset:x}')

    def _stub_everything_else(self):
        """Replace every callee CalculateInitiative reaches (far stubs it calls, plus the two
        near helpers) by `xor ax,ax; retf n`, leaving only the dice routine, DexReactionAdj and
        the resident Random/FillChar real."""
        overlay = self.m.overlays_by_segment = {d.segment: d for d, _ in self.m.overlays}
        code = self.retail_overlay[CALC_INITIATIVE:CALC_INITIATIVE+0x14C]
        for i in range(len(code)-4):
            if code[i] != 0x9A:
                continue
            off, seg = struct.unpack_from('<HH', code, i+1)
            if seg not in overlay or (seg, off) in self.REAL_STUBS:
                continue
            d = overlay[seg]
            idx, rem = divmod(off-32, 5)
            if rem or not 0 <= idx < len(d.procedure_offsets):
                continue
            n = self._retf_operand(d.file_offset+d.procedure_offsets[idx])
            self.uc.mem_write(seg*16+off, XOR_RETF+struct.pack('<H', n))
        for helper in (0x1FA78, 0x1FB95):
            n = self._retf_operand(helper)
            self.patch(helper, XOR_RETF+struct.pack('<H', n))

    def patch(self, file_offset, data):
        """Patch the LOADED copy only (mutation control); never the file on disk."""
        self.uc.mem_write(self.m.location(file_offset), data)

    # -- data setup ----------------------------------------------------------------------
    def make_player(self, slot, dex, *, in_combat=1, team=0, delay=0, next_slot=None):
        base = PLAYER_BASE+slot*PLAYER_STRIDE
        action = ACTION_BASE+slot*0x40
        self.uc.mem_write(base, bytes(0x100))
        self.uc.mem_write(action, bytes(0x40))
        self.uc.mem_write(base+P_DEX, bytes([dex]))
        self.uc.mem_write(base+P_IN_COMBAT, bytes([in_combat]))
        self.uc.mem_write(base+P_TEAM, bytes([team]))
        self.uc.mem_write(base+P_ACTION, _far(action))
        self.uc.mem_write(base+P_NEXT, _far(0) if next_slot is None else _far(PLAYER_BASE+next_slot*PLAYER_STRIDE))
        self.uc.mem_write(action+A_DELAY, bytes([delay & 255]))
        return base

    def delay_of(self, slot):
        return self.uc.mem_read(ACTION_BASE+slot*0x40+A_DELAY, 1)[0]

    def set_surprise(self, mask):
        self.uc.mem_write(AREA2+SURPRISE_OFFSET, bytes([mask]))

    # -- original routines ---------------------------------------------------------------
    def dex_adj(self, dex):
        base = self.make_player(0, dex)
        self.m.overlay_call(DEX_REACTION_ADJ, _far(base))
        return _signed(self.uc.reg_read(self._ax()) & 255)

    def _ax(self):
        from unicorn.x86_const import UC_X86_REG_AX
        return UC_X86_REG_AX

    def calc_initiative(self, state, dex, in_combat, team, surprise_mask):
        base = self.make_player(0, dex, in_combat=in_combat, team=team)
        self.set_surprise(surprise_mask)
        self.m.set_state(state)
        self.m.overlay_call(CALC_INITIATIVE, _far(base))
        return self.m.state(), self.delay_of(0)

    def order(self, state, delays):
        """Run 0x910A over a team list with the given action delays; returns (state, order)."""
        n = len(delays)
        for slot, delay in enumerate(delays):
            self.make_player(slot, 10, delay=delay, next_slot=slot+1 if slot+1 < n else None)
        self.uc.mem_write(DS_BASE+DS_TEAM_HEAD, _far(PLAYER_BASE) if n else _far(0))
        self.m.set_state(state)
        self.m.overlay_call(BUILD_ORDER)
        raw = bytes(self.uc.mem_read(DS_BASE+DS_ORDER, 4*min(n, SORT_CAP)))
        slots = []
        for i in range(0, len(raw), 4):
            off, seg = struct.unpack_from('<HH', raw, i)
            addr = seg*16+off
            if addr:
                slots.append((addr-PLAYER_BASE)//PLAYER_STRIDE)
        return self.m.state(), slots


def load_retail(root=None):
    from tools import dok_rng_oracle
    root = Path(root) if root else Path(__file__).resolve().parents[1]
    return dok_rng_oracle.load(root/'Death Knights of Krynn')
