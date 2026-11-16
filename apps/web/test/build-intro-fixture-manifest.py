#!/usr/bin/env python3
"""Create the external, hash-pinned ten-title production intro fixture manifest.

Only metadata is written. Original title archives are read from the selected local roots and
verified against the archived GOG/NWN transfer ZIP members; no archive bytes are copied.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

GOG_MANIFEST_SHA256 = "1a8d8099d03993cfda23c3b16581ca9b887193d387ae7056ed9234b3cc189c54"
GOG_ARCHIVE_SHA256 = "47bb83d6e42c773397b0e3bc89e15d922bbe7e45b2621dccaed6608b12e55a61"
NWN_MANIFEST_SHA256 = "c292a8c0ac31f39927043ed8185b543419ce19be96df0df972d709fb961b9abb"
NWN_ARCHIVE_SHA256 = "69f8c99e605db2bf501ecad0fc4fd5af694aa0225c14adcca5fa93c287f29c5c"

GOG_TITLES = [
    ("1", "champions-of-krynn", "Champions of Krynn", "TITLE.DAX", "TITLE.DAX"),
    ("dok", "death-knights-of-krynn", "Death Knights of Krynn", "TITLE.DAX", "TITLE.DAX"),
    ("coab", "curse-of-the-azure-bonds", "Curse of the Azure Bonds", "TITLE.DAX", "TITLE.DAX"),
    ("secret", "secret-of-the-silver-blades", "Secret of the Silver Blades", "TITLE.DAX", "TITLE.DAX"),
    ("gateway", "gateway-to-the-savage-frontier", "Gateway to the Savage Frontier", "TITLE.DAX", "TITLE.DAX"),
    ("pool", "pool-of-radiance", "Pool of Radiance", "POOLRAD/TITLE.DAX", "POOLRAD/TITLE.DAX"),
    ("dqk", "dark-queen-of-krynn", "The Dark Queen of Krynn", "DISK1/TITLE.TLB", "DISK1/TITLE.TLB"),
    ("treasures", "treasures-of-the-savage-frontier", "Treasures of the Savage Frontier", "TITLE.DAX", "TITLE.DAX"),
    ("pools", "pools-of-darkness", "Pools of Darkness", "TITLE.DAX", "TITLE.DAX"),
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path, expected_sha: str, label: str) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    actual = sha256(raw)
    if actual != expected_sha:
        raise ValueError(f"{label} SHA-256 mismatch: {path}: {actual}")
    return json.loads(raw.decode("utf-8")), raw


def archive_member(archive: Path, member_path: str, expected_sha: str, expected_size: int) -> bytes:
    with zipfile.ZipFile(archive) as zf:
        matches = [name for name in zf.namelist() if name.replace("\\", "/").casefold() == member_path.casefold()]
        if len(matches) != 1:
            raise ValueError(f"Expected one ZIP member {member_path!r} in {archive}; found {len(matches)}")
        data = zf.read(matches[0])
    if len(data) != expected_size or sha256(data) != expected_sha:
        raise ValueError(f"ZIP member differs from independently pinned metadata: {archive}:{member_path}")
    return data


def selected_source_path(route: str, title: str, relative: str, repo_root: Path, gog_root: Path) -> Path:
    if route == "1":
        return repo_root / "Champions of Krynn" / "TITLE.DAX"
    if route == "dok":
        return repo_root / "Death Knights of Krynn" / "TITLE.DAX"
    if route == "dqk":
        return repo_root / "The Dark Queen of Krynn" / "DISK1" / "TITLE.TLB"
    return gog_root / "Games" / title / Path(relative)


def make_manifest(args: argparse.Namespace) -> dict:
    repo_root = args.repo_root.resolve()
    gog_root = args.gog_root.resolve()
    gog_manifest_path = args.gog_manifest.resolve()
    gog_archive_path = args.gog_archive.resolve()
    nwn_root = args.nwn_root.resolve()
    nwn_manifest_path = args.nwn_manifest.resolve()
    nwn_archive_path = args.nwn_archive.resolve()

    gog, gog_bytes = read_json(gog_manifest_path, GOG_MANIFEST_SHA256, "GOG reference manifest")
    if gog.get("archive", {}).get("sha256") != GOG_ARCHIVE_SHA256 or sha256(gog_archive_path.read_bytes()) != GOG_ARCHIVE_SHA256:
        raise ValueError("GOG reference ZIP does not match its independent archive pin")
    nwn, nwn_bytes = read_json(nwn_manifest_path, NWN_MANIFEST_SHA256, "NWN transfer manifest")
    if nwn.get("archive_sha256") != NWN_ARCHIVE_SHA256 or sha256(nwn_archive_path.read_bytes()) != NWN_ARCHIVE_SHA256:
        raise ValueError("NWN transfer ZIP does not match its documented archive pin")

    fixtures: dict[str, dict] = {}
    for route, profile_id, title, relative, archive_relative in GOG_TITLES:
        pin_entry_path = f"Games/{title}/{archive_relative}"
        rows = [row for row in gog.get("files", []) if row.get("archive_path", "").casefold() == pin_entry_path.casefold()]
        if len(rows) != 1:
            raise ValueError(f"GOG source manifest must contain one row for {pin_entry_path}")
        pin = rows[0]
        source = selected_source_path(route, title, relative, repo_root, gog_root)
        source_bytes = source.read_bytes()
        pinned_bytes = archive_member(gog_archive_path, pin_entry_path, pin["sha256"], pin["size_bytes"])
        if source_bytes != pinned_bytes:
            raise ValueError(f"Selected source differs from GOG source archive: {source}")
        if route == "1" and pin["sha256"] != "5276ba718f3c31018c25852f0b6858a292aed5a94f8bd938803961bb1ade0a00":
            raise ValueError("CoK source-roster pin mismatch")
        if route == "dok" and pin["sha256"] != "53157905e76886a6601767600622daa01000efe2cdeaec87c2279264777fdd83":
            raise ValueError("DoK source-roster pin mismatch")
        rel_in_install = relative if route not in ("pool", "dqk") else archive_relative
        pin_reference = (
            "docs/engine/research/cok-graphics-source-roster-v1.json" if route == "1" else
            "docs/engine/research/dok-graphics-source-roster-v1.json" if route == "dok" else
            f"{gog_manifest_path}#{pin_entry_path} (GOG ZIP SHA-256 {GOG_ARCHIVE_SHA256})"
        )
        fixtures[route] = {
            "profileId": profile_id,
            "platform": "DOS",
            "archivePath": str(source),
            "archiveRelativePath": rel_in_install,
            "byteLength": len(source_bytes),
            "sha256": sha256(source_bytes),
            "pinReference": pin_reference,
            "pinManifestPath": str(gog_manifest_path),
            "pinManifestSha256": sha256(gog_bytes),
            "pinArchivePath": str(gog_archive_path),
            "pinArchiveSha256": GOG_ARCHIVE_SHA256,
            "pinArchiveEntry": pin_entry_path,
        }

    nwn_member = "NWN/neverwint/TITLE.DAX"
    nwn_rows = [row for row in nwn.get("entries", []) if row.get("archive_path", "").casefold() == nwn_member.casefold()]
    if len(nwn_rows) != 1:
        raise ValueError(f"NWN transfer manifest must contain one row for {nwn_member}")
    pin = nwn_rows[0]
    nwn_source = nwn_root / "Neverwinter Nights DOS" / "neverwinter-nights" / "neverwint" / "TITLE.DAX"
    nwn_bytes_source = nwn_source.read_bytes()
    nwn_pinned = archive_member(nwn_archive_path, nwn_member, pin["sha256"], pin["size_bytes"])
    if nwn_bytes_source != nwn_pinned:
        raise ValueError("Selected NWN fixture differs from the verified transfer archive")
    fixtures["nwn"] = {
        "profileId": "neverwinter-nights-dos",
        "platform": "DOS",
        "archivePath": str(nwn_source),
        "archiveRelativePath": "neverwinter-nights/neverwint/TITLE.DAX",
        "byteLength": len(nwn_bytes_source),
        "sha256": sha256(nwn_bytes_source),
        "pinReference": f"{nwn_manifest_path}#{nwn_member} (verified ZIP SHA-256 {NWN_ARCHIVE_SHA256}; see docs/engine/research/greybox-public-release-2026-10-25.md)",
        "pinManifestPath": str(nwn_manifest_path),
        "pinManifestSha256": sha256(nwn_bytes),
        "pinArchivePath": str(nwn_archive_path),
        "pinArchiveSha256": NWN_ARCHIVE_SHA256,
        "pinArchiveEntry": nwn_member,
    }
    return {
        "schema": "goldbox-intro-fixture-manifest-v1",
        "version": 1,
        "reviewReference": "GOG GOLDBOX original data transfer and title rows cross-verified against its ZIP; NWN private transfer manifest and ZIP verified against the documented 2026-10-25 receipt. CoK/DoK also retain in-code and source-roster pins.",
        "fixtures": fixtures,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--gog-root", type=Path, required=True, help="Extracted GOG test root containing Games/")
    parser.add_argument("--gog-manifest", type=Path, required=True)
    parser.add_argument("--gog-archive", type=Path, required=True)
    parser.add_argument("--nwn-root", type=Path, required=True, help="Root containing the Neverwinter Nights DOS fixture folder")
    parser.add_argument("--nwn-manifest", type=Path, required=True)
    parser.add_argument("--nwn-archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="External manifest path; must be outside the repository")
    parser.add_argument("--write", action="store_true", help="Write a new file without overwriting an existing manifest")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(args.repo_root.resolve()):
        raise ValueError("Intro fixture manifest must stay outside the repository")
    data = (json.dumps(make_manifest(args), indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    print(json.dumps({"output": str(output), "sha256": sha256(data), "routes": 10,
                      "archiveBytes": sum(row["byteLength"] for row in json.loads(data)["fixtures"].values())}))
    if args.write:
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("xb") as stream:
            stream.write(data)


if __name__ == "__main__":
    main()
