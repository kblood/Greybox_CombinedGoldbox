#!/usr/bin/env python3
"""Find a legal Gen1 GEO route and emit cardinal steps plus DOS keys."""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

import goldbox_corpus


DIRECTIONS = ("north", "east", "south", "west")
DELTA = {"north": (0, -1), "east": (1, 0), "south": (0, 1), "west": (-1, 0)}


def parse_point(value: str) -> tuple[int, int]:
    try:
        x, y = (int(part) for part in value.split(",", 1))
    except (TypeError, ValueError) as error:
        raise argparse.ArgumentTypeError(f"expected x,y, got {value!r}") from error
    return x, y


def parse_int(value: str) -> int:
    try:
        return int(value, 0)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"expected integer, got {value!r}") from error


def decode_edges(raw: bytes) -> list[dict[str, tuple[int, int]]]:
    if len(raw) != 1026:
        raise ValueError(f"expected 1026-byte Gen1 GEO block, got {len(raw)}")
    plane0 = raw[2:258]
    plane1 = raw[258:514]
    doors = raw[770:1026]
    cells: list[dict[str, tuple[int, int]]] = []
    for index in range(256):
        cells.append(
            {
                "north": (plane0[index] >> 4, doors[index] & 0x03),
                "east": (plane0[index] & 0x0F, (doors[index] >> 2) & 0x03),
                "south": (plane1[index] >> 4, (doors[index] >> 4) & 0x03),
                "west": (plane1[index] & 0x0F, (doors[index] >> 6) & 0x03),
            }
        )
    return cells


def decode_descriptors(raw: bytes, mask: int) -> list[int]:
    if len(raw) != 1026:
        raise ValueError(f"expected 1026-byte Gen1 GEO block, got {len(raw)}")
    return [value & mask for value in raw[514:770]]


def find_path(
    cells: list[dict[str, tuple[int, int]]],
    start: tuple[int, int],
    target: tuple[int, int],
    blocked: set[tuple[int, int]] | None = None,
) -> tuple[list[str], list[tuple[int, int]]]:
    blocked = blocked or set()
    queue = deque([start])
    previous: dict[tuple[int, int], tuple[tuple[int, int], str]] = {}
    visited = {start}
    while queue and target not in visited:
        x, y = queue.popleft()
        for direction in DIRECTIONS:
            wall, door = cells[y * 16 + x][direction]
            if wall != 0 and door == 0:
                continue
            dx, dy = DELTA[direction]
            next_point = x + dx, y + dy
            if not (0 <= next_point[0] < 16 and 0 <= next_point[1] < 16):
                continue
            if next_point in blocked and next_point != target:
                continue
            if next_point in visited:
                continue
            visited.add(next_point)
            previous[next_point] = ((x, y), direction)
            queue.append(next_point)
    if target not in visited:
        raise ValueError(f"target {target} is not reachable from {start}")

    directions: list[str] = []
    coordinates = [target]
    cursor = target
    while cursor != start:
        cursor, direction = previous[cursor]
        directions.append(direction)
        coordinates.append(cursor)
    directions.reverse()
    coordinates.reverse()
    return directions, coordinates


def dos_keys(directions: list[str], initial_facing: str) -> tuple[str, str]:
    keys: list[str] = []
    facing = initial_facing
    for direction in directions:
        turn = (DIRECTIONS.index(direction) - DIRECTIONS.index(facing)) % 4
        if turn == 1:
            keys.append("{RIGHT}")
        elif turn == 2:
            keys.extend(("{RIGHT}", "{RIGHT}"))
        elif turn == 3:
            keys.append("{LEFT}")
        keys.append("{UP}")
        facing = direction
    return "".join(keys), facing


def traversal_requirements(
    cells: list[dict[str, tuple[int, int]]],
    directions: list[str],
    coordinates: list[tuple[int, int]],
) -> list[dict[str, object]]:
    """Describe door interaction required by each otherwise traversable edge.

    A non-zero GEO door flag makes an edge graph-reachable, but the original runtime does not
    treat every such edge as an unconditional step. The Gen1 movement contract recovered in
    `decompile-ovr015-movement.md` is: flag 1 passes automatically, flag 2 opens the
    Bash/Pick/Knock prompt, and flag 3 is unpickable (Bash/Knock only). Reporting this separately
    prevents a legal graph path from being mistaken for a key-only route.
    """
    rows: list[dict[str, object]] = []
    for index, direction in enumerate(directions):
        x, y = coordinates[index]
        wall, door = cells[y * 16 + x][direction]
        if wall == 0:
            interaction = "none"
        elif door == 1:
            interaction = "automatic-door"
        elif door == 2:
            interaction = "locked-door:bash-or-pick-or-knock"
        elif door == 3:
            interaction = "locked-door:bash-or-knock"
        else:  # decode_edges constrains this to two bits; retain an honest guard.
            raise ValueError(f"invalid door flag {door} at {(x, y)} {direction}")
        rows.append(
            {
                "from": {"x": x, "y": y},
                "to": {"x": coordinates[index + 1][0], "y": coordinates[index + 1][1]},
                "direction": direction,
                "wall_slot": wall,
                "door_flag": door,
                "interaction": interaction,
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--geo", type=Path, required=True)
    parser.add_argument("--block", type=int, required=True)
    parser.add_argument("--start", type=parse_point, required=True)
    parser.add_argument("--target", type=parse_point, required=True)
    parser.add_argument("--facing", choices=DIRECTIONS, required=True)
    event_policy = parser.add_mutually_exclusive_group()
    event_policy.add_argument(
        "--allow-event-index",
        type=parse_int,
        action="append",
        help="allow only these masked descriptor indices on intermediate cells (repeatable)",
    )
    event_policy.add_argument(
        "--avoid-event-index",
        type=parse_int,
        action="append",
        help="avoid these masked descriptor indices on intermediate cells (repeatable)",
    )
    parser.add_argument("--event-mask", type=parse_int, default=0x7F)
    args = parser.parse_args()

    block = next(
        (item for item in goldbox_corpus.read_dax_blocks(args.geo) if item["block_id"] == args.block),
        None,
    )
    if block is None:
        raise ValueError(f"GEO block {args.block} not found")
    if not 0 <= args.event_mask <= 0xFF:
        raise ValueError("event mask must be in 0..255")
    descriptors = decode_descriptors(block["raw"], args.event_mask)
    if args.allow_event_index is not None:
        allowed = {value & args.event_mask for value in args.allow_event_index}
        blocked = {
            (index % 16, index // 16)
            for index, descriptor in enumerate(descriptors)
            if descriptor not in allowed
        }
    else:
        avoided = {value & args.event_mask for value in (args.avoid_event_index or [])}
        blocked = {
            (index % 16, index // 16)
            for index, descriptor in enumerate(descriptors)
            if descriptor in avoided
        }
    blocked.discard(args.start)
    blocked.discard(args.target)
    directions, coordinates = find_path(
        decode_edges(block["raw"]), args.start, args.target, blocked
    )
    keys, final_facing = dos_keys(directions, args.facing)
    traversal = traversal_requirements(decode_edges(block["raw"]), directions, coordinates)
    print(
        json.dumps(
            {
                "geo": args.geo.name,
                "block_id": args.block,
                "start": {"x": args.start[0], "y": args.start[1], "facing": args.facing},
                "target": {"x": args.target[0], "y": args.target[1]},
                "step_count": len(directions),
                "directions": directions,
                "coordinates": [
                    {"x": x, "y": y, "event_index": descriptors[y * 16 + x]}
                    for x, y in coordinates
                ],
                "event_mask": args.event_mask,
                "allowed_event_indices": args.allow_event_index,
                "avoided_event_indices": args.avoid_event_index,
                "blocked_cell_count": len(blocked),
                "final_facing": final_facing,
                "dos_keys": keys,
                "traversal": traversal,
                "required_interactions": [
                    row for row in traversal if row["interaction"].startswith("locked-door:")
                ],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
