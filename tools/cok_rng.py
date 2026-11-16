"""Original DOS CoK random state and byte-valued ECL/dice boundaries."""


def step(state):
    if not isinstance(state, int) or not 0 <= state <= 0xFFFFFFFF:
        raise ValueError('CoK RNG state must be an unsigned 32-bit integer')
    return (state*0x08088405+1)&0xFFFFFFFF


def bounded(state, bound):
    """Borland Random(word): consumes state even for a zero bound."""
    if not isinstance(bound, int) or not 0 <= bound <= 0xFFFF:
        raise ValueError('random bound must be an unsigned word')
    state = step(state)
    return state, (state>>16)%bound if bound else 0


def ecl_random(state, maximum):
    """ECL RANDOM uses the low operand byte, incremented unless already FFh."""
    if not isinstance(maximum, int) or not 0 <= maximum <= 0xFFFF:
        raise ValueError('ECL maximum must be an unsigned word')
    maximum &= 255
    return bounded(state, min(maximum+1, 255))


def dice(state, count, sides):
    """DB:52 uses byte count/sides and sums rolls with byte wrapping."""
    if any(not isinstance(v, int) or not 0 <= v <= 255 for v in (count, sides)):
        raise ValueError('dice count and sides must be bytes')
    if not isinstance(state, int) or not 0 <= state <= 0xFFFFFFFF:
        raise ValueError('CoK RNG state must be an unsigned 32-bit integer')
    total = 0
    for _ in range(count):
        state, roll = bounded(state, sides)
        total = (total+roll+1)&255
    return state, total
