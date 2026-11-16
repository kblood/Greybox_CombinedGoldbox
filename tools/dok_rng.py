"""Original DOS DoK random state: same Borland recurrence as CoK (see docs/engine/research/dok-rng.md).

The multiplier is a parameter only so mutation tests can show that a wrong one
is detected by the original-routine comparison; every default is the measured value.
"""
MULTIPLIER = 0x08088405


def step(state, multiplier=MULTIPLIER):
    if not isinstance(state, int) or not 0 <= state <= 0xFFFFFFFF:
        raise ValueError('DoK RNG state must be an unsigned 32-bit integer')
    return (state*multiplier+1) & 0xFFFFFFFF


def bounded(state, bound, multiplier=MULTIPLIER):
    """Borland Random(word): consumes state even for a zero bound."""
    if not isinstance(bound, int) or not 0 <= bound <= 0xFFFF:
        raise ValueError('random bound must be an unsigned word')
    state = step(state, multiplier)
    return state, (state >> 16) % bound if bound else 0


def ecl_random(state, maximum, multiplier=MULTIPLIER):
    """ECL RANDOM: low operand byte, incremented unless already FFh."""
    if not isinstance(maximum, int) or not 0 <= maximum <= 0xFFFF:
        raise ValueError('ECL maximum must be an unsigned word')
    maximum &= 255
    return bounded(state, min(maximum+1, 255), multiplier)


def dice(state, count, sides, multiplier=MULTIPLIER):
    """Dice loop at GAME.OVR 30EACh: byte count/sides, byte-wrapping sum."""
    if any(not isinstance(v, int) or not 0 <= v <= 255 for v in (count, sides)):
        raise ValueError('dice count and sides must be bytes')
    total = 0
    for _ in range(count):
        state, roll = bounded(state, sides, multiplier)
        total = (total+roll+1) & 255
    return state, total
