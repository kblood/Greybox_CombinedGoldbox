"""Derive the approved DoK DOS visual descriptions from pinned CoK glyph reviews."""
from collections import Counter, defaultdict
from copy import deepcopy
import json

from cok_graphics_source_census import RESEARCH, ROOT, digest, serialize
from import_cok_dos_font_visual_descriptions import validate_rows as validate_glyph_rows

DONOR = "cok-dos-font-glyph-visual-descriptions-v1.json"
COK_REGISTRY = "cok-graphics-identity-registry-v1.json"
BASELINE = "dok-graphics-identity-registry-v1.json"
CENSUS = "dok-graphics-source-census-v1.json"
ROSTER = "dok-graphics-source-roster-v1.json"
SIDECAR = "dok-dos-exact-pixel-visual-descriptions-v1.json"
SIDECAR_SHA256 = "5164a887a9438b86b2992d9cf215fb529f620084d939425ba0c0516f186c2316"
PINS = {
    DONOR: "ab634a069908dc6ff0670866ba7550d9bd2c294bb023378219a6424ac806975b",
    COK_REGISTRY: "103530666a8d6e8735b1c2c1a274429e7093db8b04606180313f548dd7dff9ec",
    BASELINE: "d99b2703c5afb8de0f075da763a40a52e4e5f6f1c19f71f25070a50e5ea79b9c",
    CENSUS: "f26d6ac40f8589a8c5bac00f67b85cf09152d90a9f2614bc3fbe40d53f53a236",
    ROSTER: "3c2a2716d7f88ade66b132f4f3a2099424ef8441042e11f01e647221679c5491",
}
BLACK_RGB = digest(bytes(8 * 8 * 3))
BLACK_TILE_CONTENT = digest(bytes(8 * 8 // 2))
GROWTH_LIMIT = 1024 * 1024
SCOPE = ("Visible appearance only. No character identity, subject, game use, playback, "
         "cross-version identity, Restyle lineage, or runtime admission is established.")
NOTE = "Copied from previously reviewed exact pixels; no new DoK visual inspection."


def evidence_ref(filename, asset_id):
    return f"docs/engine/research/{filename}#{asset_id}"


def pinned_document(name, data):
    if digest(data) != PINS[name]:
        raise ValueError(f"{name}: exact visual-description input SHA-256 mismatch")
    return json.loads(data)


def donor_appearances(donor_registry, donor_dataset):
    matches = defaultdict(list)
    texts = {}
    for asset, row in validate_glyph_rows(donor_registry, donor_dataset):
        asset_id = row["assetId"]
        pixel = row["pixelSha256"]
        content = row["sourceContentSha256"]
        text = row["visualDescription"]
        reference = evidence_ref(DONOR, asset_id)
        note = (f"Visible 8×8 pixel pattern reviewed against source atlas SHA-256 {donor_dataset['sourceAtlasSha256']}; "
                f"stored glyph bytes SHA-256 {content} and decoded pixel SHA-256 {pixel}. "
                "Character/codepoint, subject, game use, selector, and playback semantics are not inferred.")
        description = asset["description"]
        reviews = [item for item in description["evidence"] if item["kind"] == "visual-review"]
        if (asset["archive"]["sha256"] != donor_dataset["sourceArchiveSha256"]
                or description.get("visualDescription") != text
                or reviews != [dict(kind="visual-review", reference=reference, note=note)]):
            raise ValueError(f"{asset_id}: donor wording, archive, or visual-review evidence differs")
        key = (8, 8, pixel)
        texts[key] = text
        matches[key].append(dict(assetId=asset_id, reviewReference=reference))
    if len(matches) != 162:
        raise ValueError("DoK approved donor appearance denominator changed")
    return texts, matches


def target_rows(baseline, census, roster, donor_registry, donor_dataset):
    texts, matches = donor_appearances(donor_registry, donor_dataset)
    donor_by_index = {row["glyphIndex"]: row for row in donor_dataset["assets"]}
    assets = {row["id"]: row for row in baseline["assets"]}
    pins = {row["path"]: row for row in roster["files"]}
    result = {}
    for file in census["files"]:
        name = file["path"]
        pin = pins[name]
        for entry in file["entries"]:
            for child in entry["children"]:
                key = (child["width"], child["height"], child["rgbSha256"])
                if key not in matches:
                    continue
                (asset_id,) = child["sourceIds"]
                asset = assets[asset_id]
                kind = child["kind"]
                index = child["index"]
                ordinal, block = entry["entryIndex"], entry["blockId"]
                content = child["indexSha256"]
                if kind == "glyph":
                    if (name, ordinal, block, content, key[2]) != (
                            "8X8D1.DAX", 0, 201, donor_by_index[index]["sourceContentSha256"],
                            donor_by_index[index]["pixelSha256"]):
                        raise ValueError(f"{asset_id}: target glyph does not match the pinned stored font")
                elif (kind != "tile" or key[2] != BLACK_RGB or content != BLACK_TILE_CONTENT):
                    raise ValueError(f"{asset_id}: unexpected exact appearance outside the glyph/black tile slice")
                locator = asset["locator"]
                if (asset_id in result or child["candidate"] or locator["kind"] != kind
                        or (locator["entryIndex"], locator["blockId"], locator[f"{kind}Index"]) != (ordinal, block, index)
                        or asset_id != f"dok/dos-ega/dos-install/{name.lower()}/block/{block}/entry/{ordinal}/{kind}/{index}"
                        or asset["archive"] != dict(name=name, path=name, sha256=pin["sha256"])
                        or file["sha256"] != pin["sha256"] or pin["tocBlockIds"][ordinal] != block
                        or (asset["sourceContentSha256"], asset["sourcePixelSha256"]) != (content, key[2])):
                    raise ValueError(f"{asset_id}: target differs from exact census/archive binding")
                result[asset_id] = dict(assetId=asset_id, kind=kind, archiveSha256=pin["sha256"],
                                        width=key[0], height=key[1], sourceContentSha256=content, pixelSha256=key[2],
                                        visualDescription=texts[key], donors=matches[key])
    if (Counter(row["kind"] for row in result.values()) != {"glyph": 177, "tile": 8}
            or len({(row["width"], row["height"], row["pixelSha256"]) for row in result.values()}) != 162):
        raise ValueError("DoK approved exact visual-description denominator changed")
    return [result[key] for key in sorted(result)]


def derive(baseline, census, roster, donor_registry, donor_dataset):
    rows = target_rows(baseline, census, roster, donor_registry, donor_dataset)
    sidecar = dict(schema=SIDECAR.removesuffix(".json"), inputSha256=PINS, reviewScope=SCOPE, assets=rows)
    annotated = deepcopy(baseline)
    by_id = {row["assetId"]: row for row in rows}
    for asset in annotated["assets"]:
        if asset["id"] in by_id:
            asset["description"]["visualDescription"] = by_id[asset["id"]]["visualDescription"]
            asset["description"]["evidence"] = [
                dict(kind="visual-review", reference=evidence_ref(SIDECAR, asset["id"]), note=NOTE)
            ]
    return annotated, sidecar


def read_input(name, root=ROOT):
    path = (root / RESEARCH.relative_to(ROOT) / name).resolve(strict=True)
    if not path.is_relative_to(root):
        raise ValueError(f"{name}: visual-description path escapes repository")
    return path.read_bytes()


def build_outputs(baseline, census_bytes, roster_bytes, root=ROOT):
    pinned_document(BASELINE, serialize(baseline))
    census = pinned_document(CENSUS, census_bytes)
    roster = pinned_document(ROSTER, roster_bytes)
    donor_registry = pinned_document(COK_REGISTRY, read_input(COK_REGISTRY, root))
    donor_dataset = pinned_document(DONOR, read_input(DONOR, root))
    annotated, sidecar = derive(baseline, census, roster, donor_registry, donor_dataset)
    if digest(serialize(sidecar)) != SIDECAR_SHA256:
        raise ValueError(f"{SIDECAR}: derived bytes differ from the reviewed output SHA-256")
    return annotated, sidecar


def check_annotated_registry(registry, root):
    from dok_graphics_pixel_visual_descriptions import EXTENSION, build_extension

    baseline = deepcopy(registry)
    for asset in baseline["assets"]:
        if isinstance(asset, dict) and asset.get("game") == "dok" and isinstance(asset.get("description"), dict):
            asset["description"].pop("visualDescription", None)
            asset["description"]["evidence"] = []
    census, roster = read_input(CENSUS, root), read_input(ROSTER, root)
    glyph_registry, glyph_sidecar = build_outputs(baseline, census, roster, root)
    if read_input(SIDECAR, root) != serialize(glyph_sidecar):
        raise ValueError("DoK exact pixel visual-description sidecar differs from pinned derivation")
    expected_registry, expected_sidecar = build_extension(glyph_registry, glyph_sidecar, census, roster, root)
    if registry != expected_registry:
        raise ValueError("DoK registry descriptions differ from the approved exact pixel annotations")
    if read_input(EXTENSION, root) != serialize(expected_sidecar):
        raise ValueError("DoK pixel-transfer sidecar differs from pinned derivation")
