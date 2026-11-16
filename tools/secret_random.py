"""Independent Secret ECL RANDOM model; no emulator or filesystem access."""


def random_step(seed, bound):
    """Original resident Random advances u32 state and reduces its high word."""
    if type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF or type(bound) is not int or not 0 <= bound <= 65535:
        raise ValueError('unsigned32 seed and unsigned16 bound required')
    next_seed = (seed * 0x08088405 + 1) & 0xFFFFFFFF
    return ((next_seed >> 16) % bound if bound else 0), next_seed


def ecl_random(seed, range_word):
    """Resolve word first, truncate to byte, then increment unless saturatedFF."""
    if type(range_word) is not int or not 0 <= range_word <= 65535:
        raise ValueError('unsigned16 original RANDOM operand required')
    byte = range_word & 255
    return random_step(seed, byte + (byte != 255))
