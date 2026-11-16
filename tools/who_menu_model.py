"""Pure-Python model of the GBMT WHO text fit (contract model, not the assembled code)."""
MENU_TEXT_CAP = 128
NAME_MAX = 15
PARTY_ROWS_MAX = 8


def fits(names, prompt_packed_len=None, cap=MENU_TEXT_CAP):
    """Mirror capture_who_text/capture_menu_text: prompt costs 1+len (Gen2 only);
    each name costs 1+len, len must be 1..15; fits iff running total <= cap."""
    used = 0
    if prompt_packed_len is not None:
        used += 1 + prompt_packed_len
        if used > cap:
            return False
    for n in names:
        if not 1 <= n <= NAME_MAX:
            return False
        used += 1 + n
        if used > cap:
            return False
    return True
