"""Bounded fixed-offer F formatter; source tokens, never assembled item labels.

The caller admits exact ITEM member18 before using this English profile. The
Pascal cache retains all old tail bytes, list status and logical record fields.
"""
from tools.cok_equipment import signed_byte


# Source DS0F0D +21*ID. Exact u16-ID/21-byte-row serialization:
# SHA256 330848154fecaa4ead97efe87078cc82e29c647c995bf38f5863dbdb3bd24a34.
TOKEN_TEXT = {
    8: b"Mace", 18: b"Long Sword", 30: b"Arrow", 31: b"Leather",
    33: b"Scale", 36: b"Plate", 37: b"Shield", 39: b"Scroll",
    40: b"Mage", 47: b"Mail", 48: b"Armor", 50: b"Bracers",
    51: b"Wand", 62: b"Ice Storm", 71: b"Halberd", 72: b"Gauntlets",
    78: b"Ogre Power", 90: b"of", 102: b"3 Spells", 107: b"AC 6",
    111: b"+1", 112: b"+2",
}
TOKEN_ROWS = {key: bytes((len(text),)) + text + bytes(20 - len(text))
              for key, text in TOKEN_TEXT.items()}


def party_has_effect5(heroes):
    for hero in heroes:
        if len(hero.sfx) % 9:
            raise ValueError("complete owned SFX records required")
        if 5 in hero.sfx[::9]:
            return True
    return False


def format_pending(record, effect5=False, *, ready_prefix=False):
    """Complete no-draw fixed-offer cache rule, including original tail writes.

    ready_prefix is a closed helper diagnostic; the reward UI exposes no View.
    Kind73's separate quantity conversion is outside the fixed-offer domain.
    """
    if (len(record) != 67 or record[46] == 73 or
            type(effect5) is not bool or type(ready_prefix) is not bool):
        raise ValueError("bounded fixed-offer record and boolean context required")
    result = bytearray(record)
    result[0] = 0

    def append(fragment):
        text = bytes(result[1:1 + result[0]]) + fragment
        text = text[:40]
        result[0] = len(text)
        result[1:1 + len(text)] = text

    if ready_prefix:
        append(b" Yes  " if record[52] else b" No   ")
    if effect5 and (signed_byte(record[50]) > 0 or signed_byte(record[51]) > 0 or record[54]):
        append(b"* ")
    quantity = record[57]
    if quantity:
        append(str(quantity).encode("ascii") + b" ")
    included = [i for i in (1, 2, 3) if record[46 + i] and not record[53] & (1 << (3 - i))]
    if any(record[46 + i] not in TOKEN_TEXT for i in included):
        raise ValueError("token outside admitted fixed-offer dictionary")
    mask = sum(1 << (i - 1) for i in included)
    pluralized = False
    for i in reversed(included):
        append(TOKEN_TEXT[record[46 + i]])
        plural = quantity >= 2 and not pluralized and (
            mask == 1 << (i - 1) or i == 1 and mask > 4
            or i == 2 and not mask & 1
            or i == 3 and record[46] in (30, 5, 12) and record[49] != 93)
        append(b"s " if plural else b" ")
        pluralized |= plural
    return bytes(result)
