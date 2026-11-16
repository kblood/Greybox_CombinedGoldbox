"""Extend the DoK glyph review with exact CoK decoded RGB appearances."""

from collections import Counter, defaultdict
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
import re

from PIL import Image

from dok_graphics_visual_descriptions import (
    BASELINE, CENSUS, COK_REGISTRY, PINS, ROOT, ROSTER, SCOPE, SIDECAR, SIDECAR_SHA256,
    digest, evidence_ref, pinned_document, read_input, serialize,
)
from graphics_source_render import exact_nearest_neighbor_render

EXTENSION = "dok-dos-registry-pixel-visual-descriptions-v1.json"
EXTENSION_SHA256 = "660312cacb5121e988b8445e0bdb1820c65aff83f3b15e2ffd149274ad564c2f"
GLYPH_REGISTRY_SHA256 = "fc63909f62047fd946c9b453ac918357597626729e58df79c4102c2c32d4f214"
DATASET_PINS = {
    "cok-amiga-8x8d0-visual-descriptions-v1.json": "f2f217b0acdbb30657f555ebdc7a855db1287db85c83ff6ae7d4953cbb8626cd",
    "cok-amiga-8x8d1-visual-descriptions-v1.json": "69a96aca4d45804a256c4e419e10ca6b684092da849f1db6f5af2edcbad41388",
    "cok-amiga-8x8d2-visual-descriptions-v1.json": "6ad2577dcf42a1e846fd913f3cd140e272a4a6e5749b2bbe04ec0092de0e5dd7",
    "cok-amiga-com-visual-descriptions-v1.json": "12f6ffae0b1c7f546bb75868b7fa9147d174b083d892b340e5f898e1ec831d54",
    "cok-dos-com-visual-descriptions-v1.json": "c1ba25811ee738d5620709000f89d32d9560d44b62f7293667e3f6f5c3e7e121",
    "cok-dos-pic123-visual-descriptions-v1.json": "6f8fd45972d8df073077786e37003c3686e07678741927a79c78b22b9ca6df70",
    "cok-dos-pic23-visual-descriptions-v1.json": "5db1f1f997f98024620bfc24de9489c74e422e22bc6415d08443e25de96d6c98",
}
EXTENSION_PINS = {
    **{name: PINS[name] for name in (COK_REGISTRY, BASELINE, CENSUS, ROSTER)},
    SIDECAR: SIDECAR_SHA256,
    **DATASET_PINS,
}
PNG_PREFIX = "apps/web/dist-app-cok57/restyle/cok-generated/images/"
CANDIDATE_EDITION = "Amiga disk 2 (candidate ADF extraction)"
CANDIDATE_SHA256 = "14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915"
CANDIDATE_SCOPE = "The 168 Amiga candidate ADF tile donors establish exact appearance only; retail Amiga provenance is unestablished."
EXTENSION_NOTE = "Prior CoK review: exact dimensions and RGB SHA-256; no new DoK inspection."
TARGET_ARCHIVES = {
    "8X8D1.DAX": 82, "8X8D2.DAX": 153, "8X8D3.DAX": 28, "8X8D4.DAX": 95, "8X8D5.DAX": 94,
    "COMSPR.DAX": 10, "DUNGCOM.DAX": 25, "PIC2.DAX": 4, "PIC3.DAX": 5, "PIC5.DAX": 9, "PIC6.DAX": 1,
}
DONOR_ARCHIVES = {
    ("Amiga", "8X8D0.DAA"): 220, ("Amiga", "8X8D1.DAA"): 220, ("Amiga", "8X8D1.DAX"): 168,
    ("Amiga", "8X8D2.DAA"): 155, ("Amiga", "DUNGCOM.DAA"): 2, ("Amiga", "WILDCOM.DAA"): 4,
    ("DOS-EGA", "8X8D1.DAX"): 168, ("DOS-EGA", "8X8D2.DAX"): 95, ("DOS-EGA", "8X8D3.DAX"): 118,
    ("DOS-EGA", "COMSPR.DAX"): 8, ("DOS-EGA", "DUNGCOM.DAX"): 25, ("DOS-EGA", "WILDCOM.DAX"): 4,
    ("DOS-EGA", "PIC1.DAX"): 8, ("DOS-EGA", "PIC2.DAX"): 11, ("DOS-EGA", "PIC3.DAX"): 9,
}
HASH = re.compile(r"[0-9a-f]{64}")


def unique_rows(rows, field):
    by_id = {}
    for row in rows:
        key = row[field]
        if key in by_id:
            raise ValueError(f"{key}: duplicate {field}")
        by_id[key] = row
    return by_id


def review_donor(asset, same_pixels, datasets):
    """Return all transitive PNG references and the review datasets actually used."""
    asset_id, archive, locator = asset["id"], asset["archive"], asset["locator"]
    description, decoded = asset["description"], asset["decoded"]
    text, source, rgb = description["visualDescription"], decoded["sha256"], decoded["pixelSha256"]
    prefix = {"DOS-EGA": "dos-ega", "Amiga": "amiga"}.get(asset["platform"])
    kind = {"tile": "tile", "block-frame": "frame"}.get(locator["kind"])
    location = f"block/{locator['blockId']}/{kind}/{locator.get(f'{kind}Index')}"
    if (asset["game"] != "cok" or not prefix or not kind
            or not re.fullmatch(f"cok/{prefix}/disk[1-3]/{re.escape(archive['name'].lower())}/{location}", asset_id)
            or any(type(value) is not int or value < 0 for value in (locator["blockId"], locator[f"{kind}Index"]))
            or not HASH.fullmatch(archive["sha256"]) or not HASH.fullmatch(source)
            or decoded["path"] != f"images/{source}.png" or asset["identityStatus"] != "source-pinned"
            or description["status"] != "unknown" or not isinstance(text, str) or not text.strip()):
        raise ValueError(f"{asset_id}: invalid exact donor source binding")
    evidence = description["evidence"]
    reviews = [item for item in evidence if item["kind"] == "visual-review"]
    if not reviews or len({item["reference"] for item in reviews}) != len(reviews):
        raise ValueError(f"{asset_id}: missing or duplicate donor visual review")
    candidate = asset["platform"] == "Amiga" and archive["name"] == "8X8D1.DAX"
    if candidate:
        provenance = [item for item in evidence if item["kind"] == "game-data"]
        dos_id = asset_id.replace("cok/amiga/disk2/", "cok/dos-ega/disk1/", 1)
        if (asset["edition"] != CANDIDATE_EDITION or archive["sha256"] != CANDIDATE_SHA256
                or kind != "tile" or len(provenance) != 1
                or provenance[0]["reference"] != f"{archive['path']}#{location}"
                or CANDIDATE_SHA256 not in provenance[0]["note"]
                or "does not establish provenance from an original retail Amiga installation" not in provenance[0]["note"]
                or not any(peer["id"] == dos_id and peer["archive"]["sha256"] == CANDIDATE_SHA256
                           for peer in same_pixels)):
            raise ValueError(f"{asset_id}: Amiga candidate provenance changed")
    elif asset["edition"] == CANDIDATE_EDITION:
        raise ValueError(f"{asset_id}: unexpected Amiga candidate")

    pngs, used = set(), set()
    for review in reviews:
        reference, note = review["reference"], review["note"]
        if source not in note or rgb not in note:
            raise ValueError(f"{asset_id}: visual review does not pin the exact PNG and RGB")
        if "#" in reference:
            filename = reference.split("#", 1)[0].removeprefix("docs/engine/research/")
            row = datasets.get(filename, {}).get(asset_id)
            if (not row or reference != evidence_ref(filename, asset_id) or DATASET_PINS[filename] not in note
                    or (row["sourceSha256"], row["pixelSha256"], row["visualDescription"]) != (source, rgb, text)
                    or len(row["evidence"]) != 1):
                raise ValueError(f"{asset_id}: donor review dataset does not match the pinned row")
            image_review = row["evidence"][0]
            if image_review["kind"] != "visual-review" or source not in image_review["note"] or rgb not in image_review["note"]:
                raise ValueError(f"{asset_id}: invalid review dataset PNG evidence")
            reference = image_review["reference"]
            used.add(filename)
        if reference != f"{PNG_PREFIX}{source}.png" and not (
                reference.startswith("C:/GoldBoxImg/") and reference.endswith(".png")):
            raise ValueError(f"{asset_id}: donor visual-review path is not an approved source PNG")
        pngs.add(reference)
    return pngs, used


def derive_extension(glyph_registry, glyph_sidecar, census, roster, donor_registry, datasets):
    """Build the transfer from the census/registry join, preserving every matched donor ID."""
    targets, donors = defaultdict(list), defaultdict(list)
    rows = unique_rows(glyph_registry["assets"], "id")
    old = unique_rows(glyph_sidecar["assets"], "assetId")
    old_keys = {(row["width"], row["height"], row["pixelSha256"]) for row in old.values()}
    pins = unique_rows(roster["files"], "path")
    seen = set()
    for file in census["files"]:
        name = file["path"]
        pin = pins[name]
        for entry in file["entries"]:
            ordinal, block = entry["entryIndex"], entry["blockId"]
            for child in entry["children"]:
                (asset_id,) = child["sourceIds"]
                asset = rows[asset_id]
                kind, index = child["kind"], child["index"]
                suffix = "frame" if kind == "block-frame" else kind
                key = child["width"], child["height"], child["rgbSha256"]
                content, locator = child["indexSha256"], asset["locator"]
                if (asset_id in seen or child["candidate"]
                        or any(type(d) is not int or d <= 0 for d in key[:2])
                        or not HASH.fullmatch(key[2]) or not HASH.fullmatch(content)
                        or locator["kind"] != kind or locator[f"{suffix}Index"] != index
                        or (locator["entryIndex"], locator["blockId"]) != (ordinal, block)
                        or asset_id != f"dok/dos-ega/dos-install/{name.lower()}/block/{block}/entry/{ordinal}/{suffix}/{index}"
                        or asset["archive"] != dict(name=name, path=name, sha256=pin["sha256"])
                        or file["sha256"] != pin["sha256"] or pin["tocBlockIds"][ordinal] != block
                        or (asset["sourceContentSha256"], asset["sourcePixelSha256"]) != (content, key[2])):
                    raise ValueError(f"{asset_id}: target differs from exact census/archive binding")
                seen.add(asset_id)
                targets[key].append(asset)
    if seen != rows.keys() or len(seen) != 2614 or len(targets) != 2192:
        raise ValueError("DoK census identity/appearance denominator changed")
    for asset in unique_rows(donor_registry["assets"], "id").values():
        decoded = asset.get("decoded")
        if decoded and (key := (decoded["width"], decoded["height"], decoded.get("pixelSha256"))) in targets:
            donors[key].append(asset)

    overlap_keys = donors.keys() & old_keys
    if len(overlap_keys) != 1 or sum(asset["id"] in old for key in overlap_keys for asset in targets[key]) != 16:
        raise ValueError("DoK extension overlap with approved glyph slice changed")
    appearances, archives, pngs = [], {}, {}
    donor_archives, donor_kinds, target_archives, target_kinds = Counter(), Counter(), Counter(), Counter()
    used_datasets, annotation_text = set(), {}
    for key in sorted(donors):
        approved_targets = [row for row in targets[key] if row["id"] not in old]
        if not approved_targets:
            continue
        approved_donors = sorted(donors[key], key=lambda row: row["id"])
        texts = {asset["description"]["visualDescription"] for asset in approved_donors}
        if len(texts) != 1:
            raise ValueError(f"{key}: conflicting exact-pixel donor wording")
        (text,) = texts
        if not any(asset["platform"] == "DOS-EGA" for asset in approved_donors):
            raise ValueError(f"{key}: exact DOS donor missing")
        for asset in approved_donors:
            refs, used = review_donor(asset, approved_donors, datasets)
            used_datasets.update(used)
            archive = asset["archive"]
            if archives.setdefault(archive["path"], archive["sha256"]) != archive["sha256"]:
                raise ValueError(f"{asset['id']}: conflicting donor archive hash")
            for ref in refs:
                binding = asset["decoded"]["sha256"], key
                if pngs.setdefault(ref, binding) != binding:
                    raise ValueError(f"{asset['id']}: conflicting donor PNG binding")
            donor_archives[asset["platform"], archive["name"]] += 1
            donor_kinds[asset["locator"]["kind"]] += 1
        target_records = []
        for asset in sorted(approved_targets, key=lambda row: row["id"]):
            asset_id = asset["id"]
            annotation_text[asset_id] = text
            target_records.append(dict(assetId=asset_id, archiveSha256=asset["archive"]["sha256"],
                                       sourceContentSha256=asset["sourceContentSha256"]))
            target_archives[asset["archive"]["name"]] += 1
            target_kinds[asset["locator"]["kind"]] += 1
        appearances.append(dict(width=key[0], height=key[1], pixelSha256=key[2], visualDescription=text,
                                targets=target_records, donorIds=[asset["id"] for asset in approved_donors]))
    if (len(appearances) != 335 or len(annotation_text) != 506 or target_archives != TARGET_ARCHIVES
            or target_kinds != {"tile": 477, "block-frame": 29} or donor_archives != DONOR_ARCHIVES
            or donor_kinds != {"tile": 1179, "block-frame": 36} or used_datasets != DATASET_PINS.keys()
            or len(archives) != 16 or len(pngs) != 339 or len(old_keys | {key for key in donors if key not in overlap_keys}) != 497):
        raise ValueError("DoK extension target, donor or evidence denominator changed")
    annotated = deepcopy(glyph_registry)
    for asset in annotated["assets"]:
        if asset["id"] in annotation_text:
            asset["description"]["visualDescription"] = annotation_text[asset["id"]]
            asset["description"]["evidence"] = [
                dict(kind="visual-review", reference=evidence_ref(EXTENSION, asset["id"]), note=EXTENSION_NOTE)
            ]
    sidecar = dict(schema=EXTENSION.removesuffix(".json"), inputSha256=EXTENSION_PINS, reviewScope=SCOPE,
                   candidateScope=CANDIDATE_SCOPE, appearances=appearances)
    return annotated, sidecar, archives, pngs


def verify_files(archives, pngs, root):
    """Read only the pinned donor files; require exact PNG bytes and native RGB."""
    local = Path("C:/GoldBoxImg").resolve(strict=True)
    for reference, pin in sorted(archives.items()):
        source = Path(reference)
        if source.parent.name == "Champions of Krynn":
            base = (root / "Champions of Krynn").resolve(strict=True)
            path = (base / source.name).resolve(strict=True)
        else:
            base = local
            path = source.resolve(strict=True)
        if not path.is_relative_to(base) or digest(path.read_bytes()) != pin:
            raise ValueError(f"{reference}: donor archive SHA-256 mismatch")
    for reference, (pin, (width, height, rgb)) in sorted(pngs.items()):
        if reference.startswith(PNG_PREFIX):
            base = root
            path = (base / reference).resolve(strict=True)
        else:
            base = local
            path = Path(reference).resolve(strict=True)
        if not path.is_relative_to(base):
            raise ValueError(f"{reference}: donor review PNG escapes the approved root")
        raw = path.read_bytes()
        if digest(raw) != pin:
            raise ValueError(f"{reference}: donor review PNG SHA-256 mismatch")
        with Image.open(BytesIO(raw), formats=["PNG"]) as image:
            scale, remainder = divmod(image.width, width)
            native = image.convert("RGB").resize((width, height), Image.Resampling.NEAREST).tobytes()
            if remainder or digest(native) != rgb or not exact_nearest_neighbor_render(image, native, width, height, scale):
                raise ValueError(f"{reference}: donor review PNG does not match exact decoded RGB")


def build_extension(glyph_registry, glyph_sidecar, census_bytes, roster_bytes, root=ROOT, *, verify_source_files=False):
    if digest(serialize(glyph_registry)) != GLYPH_REGISTRY_SHA256 or digest(serialize(glyph_sidecar)) != SIDECAR_SHA256:
        raise ValueError("DoK original glyph review differs from its reviewed output pins")
    donor_registry = pinned_document(COK_REGISTRY, read_input(COK_REGISTRY, root))
    census, roster = pinned_document(CENSUS, census_bytes), pinned_document(ROSTER, roster_bytes)
    datasets = {}
    for name, pin in DATASET_PINS.items():
        raw = read_input(name, root)
        if digest(raw) != pin:
            raise ValueError(f"{name}: donor evidence input SHA-256 mismatch")
        dataset = json.loads(raw)
        if dataset["version"] != 1:
            raise ValueError(f"{name}: unexpected donor evidence schema")
        datasets[name] = unique_rows(dataset["assets"], "assetId")
    annotated, sidecar, archives, pngs = derive_extension(glyph_registry, glyph_sidecar, census, roster, donor_registry, datasets)
    if digest(serialize(sidecar)) != EXTENSION_SHA256:
        raise ValueError(f"{EXTENSION}: derived bytes differ from the reviewed output SHA-256")
    if verify_source_files:
        verify_files(archives, pngs, root)
    return annotated, sidecar
