#!/usr/bin/env python3
"""Reproduce a static CoK graphics coverage ledger from reviewed source and metadata.

Default mode is read-only. --write writes only the fixed report. --scan-combat
rederives the separate combat receipt from user-supplied local game archives.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
from tempfile import NamedTemporaryFile

from cok_ecl_picture_census import ARCHIVES, read_archive
from cok_player_runtime_coverage import validate_restyle_admission_policy
from gen1_ecl_encounter_scan import opcodes_for_profile, scan_block, word_sets_for_profile
from gen1_ecl_encounter_variants import LIMITS, roster_id, scan_block_variants

ROOT = Path(__file__).resolve().parents[1]
DOCS = "docs/engine/research/"
UI = "apps/web/src/ui/"
CONTRACT = DOCS + "cok-runtime-art-consumers-v1.json"
REPORT = DOCS + "cok-runtime-art-coverage-v1.json"
COMBAT = DOCS + "cok-runtime-art-combat-sites-v1.json"
CONTRACT_V2 = DOCS + "cok-runtime-art-consumers-v2.json"
REPORT_V2 = DOCS + "cok-runtime-art-coverage-v2.json"
SCHEMA_V2 = DOCS + "cok-runtime-art-coverage-v2.schema.json"
COMBAT_V2 = DOCS + "cok-runtime-art-combat-sites-v2.json"
REGISTRY = DOCS + "cok-graphics-identity-registry-v1.json"
PICTURES = DOCS + "cok-ecl-picture-census-2026-11-03.json"
PLAYER = UI + "cokPlayerAppearanceManifest.json"
PLAYER_POLICY = UI + "cokPlayerRestyleAdmission.json"
COMBAT_SCOPE = {"evidenceScope": "representative paths of a static CoK ECL scan",
                "complete": False, "selectedPathOnly": True}
VARIANT_SCOPE = {"evidenceScope": "bounded CoK ECL traversal",
                 "variantRetention": "all-distinct-discovered-rosters", "campaignComplete": False}
SCAN_HELPERS = ("tools/gen1_ecl_encounter_scan.py", "tools/gen1_ecl_encounter_variants.py",
                "tools/dqk_ca03_stream_decode.py",
                "tools/cok_ecl_picture_census.py")
METADATA_LIMIT = 1024 * 1024


def sha(value):
    return hashlib.sha256(value).hexdigest()


def text_sha(value):
    """Pin digest for reviewed text inputs: CRLF is normalised to LF so CRLF and LF checkouts agree."""
    return sha(value.replace(b"\r\n", b"\n"))


def read_json(path):
    return json.loads(path.read_bytes())


def stable_json(document, *, indent=2):
    return (json.dumps(document, indent=indent, ensure_ascii=True, sort_keys=True) + "\n").encode()


def report_bytes(report):
    """Write one row per line in the large tables to stay within the metadata budget."""
    def compact(value):
        return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))

    sections = []
    for key, value in sorted(report.items()):
        if isinstance(value, dict):
            rows = [f"  {compact(k)}: {compact(v)}" for k, v in sorted(value.items())]
            section = "{\n" + ",\n".join(rows) + "\n }"
        elif isinstance(value, list):
            section = "[\n" + ",\n".join(f"  {compact(row)}" for row in value) + "\n ]"
        else:
            section = compact(value)
        sections.append(f" {compact(key)}: {section}")
    return ("{\n" + ",\n".join(sections) + "\n}\n").encode()


def write_atomic(path, data):
    with NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temp = Path(handle.name)
        try:
            handle.write(data)
            handle.close()
            temp.replace(path)
        finally:
            temp.unlink(missing_ok=True)


def relative(value):
    path = PurePosixPath(value)
    if not value or path.is_absolute() or str(path) != value or ".." in path.parts or re.search(r"[:\\]", value):
        raise ValueError(f"unsafe relative path: {value!r}")
    return value


def basename(value):
    return relative(value).rsplit("/", 1)[-1]


def digest(value):
    if not isinstance(value, str) or re.fullmatch("[a-fA-F0-9]{64}", value) is None:
        raise ValueError("invalid SHA-256 pin")
    return value.lower()


def checked_inputs(root, contract, *, version=1):
    if contract["schema"] != f"cok-runtime-art-consumers-v{version}":
        raise ValueError("unexpected consumer contract version")
    result = {}
    for path, expected in contract["inputs"].items():
        data = (root / relative(path)).read_bytes()
        if text_sha(data) != digest(expected):
            raise ValueError(f"reviewed input changed: {path}")
        result[path] = data
    for consumer in (contract["consumers"].values() if version == 1 else ()):
        if not consumer["sources"] or any(path not in result for path in consumer["sources"]):
            raise ValueError("consumer is missing a reviewed source pin")
    return result


def picture_operands(roster):
    operands = [group[2] for group in roster]
    return (sorted({item["value"] for item in operands if item["kind"] == "immediate"}),
            sum(item["kind"] != "immediate" for item in operands))


def effective_picture_ids(raw_values):
    grouped = defaultdict(list)
    for value in raw_values:
        grouped[value & 0xff].append(value)
    return sorted(grouped.items())


def combat_receipt(dos_root):
    """Keep all representative entry/site rows, including paths with no local roster."""
    profile = "champions-of-krynn"
    opcodes = opcodes_for_profile(profile)
    word_sets = word_sets_for_profile(profile)
    archives = []
    for name, spec in ARCHIVES.items():
        blocks = []
        for block in read_archive((dos_root / name).read_bytes(), spec):
            findings = scan_block(block["raw"], opcodes=opcodes, word_sets=word_sets)
            sites = []
            for site in findings["candidates"]:
                immediate, dynamic = picture_operands(site["roster"])
                sites.append({
                    "entry": site["entry"], "offset": site["combat_offset"],
                    "alternatePaths": site["alternate_path_count"], "rosteredPaths": site["rostered_path_variants"],
                    "immediateRawOperands": immediate, "dynamicPictureOperandCount": dynamic,
                    "localRoster": bool(site["roster"]),
                })
            blocks.append({"blockId": block["blockId"], "blockSha256": block["blockSha256"], "sites": sites,
                           "truncatedOffsets": findings["truncated_offsets"],
                           "stateLimitReached": findings["state_limit_reached"]})
        archives.append({"archive": name, "archiveSha256": spec["sha256"], "blocks": blocks})
    return {"schema": "cok-runtime-art-combat-sites-v1", **COMBAT_SCOPE, "archives": archives}


def combat_receipt_v2(dos_root):
    archives = []
    for name, spec in ARCHIVES.items():
        blocks = [{"blockId": block["blockId"], "blockSha256": block["blockSha256"],
                   **scan_block_variants(block["raw"])}
                  for block in read_archive((dos_root / name).read_bytes(), spec)]
        for block in blocks:
            for site in block["sites"]:
                for variant in site["variants"]:
                    variant["pictureIds"] = sorted({value & 255 for code, value in picture_slots(variant["roster"])
                                                    if code == 0})
        archives.append({"archive": name, "archiveSha256": spec["sha256"], "blocks": blocks})
    return {"schema": "cok-runtime-art-combat-sites-v2", **VARIANT_SCOPE, "limits": LIMITS,
            "inputs": {path: text_sha((ROOT / path).read_bytes()) for path in SCAN_HELPERS}, "archives": archives}


def picture_slots(roster):
    return [group[2] for group in roster]


class Ledger:
    def __init__(self, registry, inputs, consumers):
        self.inputs = inputs
        self.consumers = consumers
        self.assets = {item["id"]: item for item in registry["assets"]}
        if len(self.assets) != len(registry["assets"]):
            raise ValueError("duplicate source IDs")
        self.locators = defaultdict(list)
        for item in self.assets.values():
            archive, loc = item["archive"], item["locator"]
            key = (item["platform"], archive["name"].upper(), archive["sha256"],
                   loc["blockId"], loc.get("frameIndex"), loc.get("tileIndex"))
            self.locators[key].append(item["id"])
        self.registry_restyles = {item["id"]: item for item in registry["restyles"]}
        if len(self.registry_restyles) != len(registry["restyles"]):
            raise ValueError("duplicate Restyle IDs")
        self.restyles_by_source = defaultdict(set)
        for item in self.registry_restyles.values():
            for source in item["sourceAssetIds"]:
                self.restyles_by_source[source].add(item["id"])
        self.registry_groups = {group["id"]: group for group in registry["animationGroups"]}
        self.sources = {}
        self.mappings = {}
        self.outputs = {}
        self.frames = {}
        self.requests = []

    def data(self, path):
        return json.loads(self.inputs[path])

    def source_id(self, system, archive, archive_sha, block, *, frame=0, tile=None):
        hits = self.source_candidates(system, archive, archive_sha, block, frame=frame, tile=tile)
        if len(hits) != 1 or self.assets[hits[0]]["identityStatus"] != "source-pinned":
            return None
        return self.use_source(hits[0])

    def source_candidates(self, system, archive, archive_sha, block, *, frame=0, tile=None):
        key = (system, basename(archive).upper(), digest(archive_sha), block, frame, tile)
        return sorted(self.locators.get(key, []))

    def use_source(self, source_id):
        source = self.assets[source_id]
        if source["identityStatus"] != "source-pinned":
            raise ValueError(f"receipt references unpinned source: {source_id}")
        decoded = source.get("decoded") or {}
        self.sources[source_id] = {
            "platform": source["platform"], "archive": source["archive"]["name"],
            "archiveSha256": digest(source["archive"]["sha256"]), "locator": source["locator"],
            "sourcePngSha256": decoded.get("sha256"), "pixelSha256": decoded.get("pixelSha256"),
            "frameGroupId": source.get("animationGroupId"),
            "restyleRecordIds": sorted(self.restyles_by_source[source_id]),
        }
        return source_id

    def scene_source(self, spec):
        return self.source_id(spec["system"], spec["archive"], spec["archiveSha256"],
                              spec["blockId"], frame=spec["frameIndex"])

    def add_mapping(self, key, consumer, evidence, base, source, path, output_sha,
                    *, state="runtime-declared", reason=None, pins=None, exact_base=True):
        if key in self.mappings or consumer not in self.consumers or evidence not in self.inputs:
            raise ValueError(f"invalid or repeated mapping: {key}")
        output_sha = digest(output_sha)
        path = relative(path)
        if path in self.outputs and self.outputs[path]["sha256"] != output_sha:
            raise ValueError(f"conflicting expected outputs for {path}")
        self.outputs[path] = {"sha256": output_sha}
        exact = sorted(
            rid for rid in self.restyles_by_source.get(source, ())
            if any(out["sha256"] == output_sha for out in self.registry_restyles[rid]["outputs"])
        )
        pins = pins or {}
        rendered = self.sources.get(source, {}).get("sourcePngSha256")
        source_png = pins.get("sourcePngSha256")
        self.mappings[key] = {
            "consumer": consumer, "evidence": evidence, "baseSourceId": base, "generationSourceId": source,
            "sourceStatus": "source-pinned" if base and source else "unresolved-locator",
            "outputPath": path, "exactRestyleRecordIds": exact, "admission": state,
            "admissionReason": reason, "sourcePins": pins, "automaticRequestAssociation": exact_base,
            "compositionStatus": "awaiting-review" if reason == "awaiting-prompt-and-composition-review" else "unverified",
            "sourcePngComparison": ("match" if source_png == rendered else "different-render")
            if source_png and rendered else "unverified",
        }
        return key

    def add_picture_mappings(self, contract):
        for item in contract["pictureMappings"]:
            path = item["manifest"]
            manifest = self.data(path)
            archive = manifest if "sourceKey" not in item else manifest[item["sourceKey"]]
            locator = {"system": item["system"], "blockId": manifest.get("blockId", manifest.get("pictureId")),
                       "frameIndex": manifest["frameIndex"], **archive}
            base = manifest.get("baseSource") or manifest.get(item.get("baseKey")) or locator
            base = {**locator, **base, "system": item.get("baseSystem", base.get("system", item["system"]))}
            output = manifest["restyle"]
            pins = {"sourcePngSha256": manifest["source"]["sha256"]}
            pins.update({key: locator[key] for key in ("blockSha256", "indicesSha256") if key in locator})
            generation = self.scene_source(locator)
            self.add_mapping(item["id"], item["consumer"], path, self.scene_source(base),
                             generation, "cok/" + output["destination"], output["sha256"],
                             pins=pins, reason=item.get("condition"))
            if generation is None:
                self.mappings[item["id"]]["unresolvedGenerationLocator"] = {
                    "archive": basename(locator["archive"]), "archiveSha256": locator["archiveSha256"],
                    "blockId": locator["blockId"], "frameIndex": locator["frameIndex"], "platform": locator["system"],
                    "candidateIds": self.source_candidates(locator["system"], locator["archive"], locator["archiveSha256"],
                                                           locator["blockId"], frame=locator["frameIndex"]),
                }
        cottage = contract["cottage"]
        path = cottage["evidence"]
        for value in (cottage["base"]["archiveSha256"], cottage["source"]["archiveSha256"],
                      cottage["outputSha256"], cottage["sourcePngSha256"]):
            if digest(value).encode() not in self.inputs[path]:
                raise ValueError("cottage pin absent from source")
        self.add_mapping("cottage/112", "cottage", path, self.scene_source(cottage["base"]),
                         self.scene_source(cottage["source"]), cottage["outputPath"], cottage["outputSha256"],
                         pins={"sourcePngSha256": cottage["sourcePngSha256"]},
                         reason="Matches the bounded DOS opening-cottage source; Restyle does not require an installed Amiga original.")
        self.original_variants = {"travel-map/Amiga": self.scene_source(self.data(UI + "cokAmigaTravelManifest.json"))}

    def add_tile_mappings(self):
        for consumer, filename, folder in (("combat-terrain", "cokTerrainRestyleManifest.json", "terrain"),
                                           ("dungeon-walls", "cokWallRestyleManifest.json", "walls")):
            path = UI + filename
            manifest = self.data(path)
            for bank in manifest.get("banks", [manifest]):
                block = bank["blockId"]
                for tile in bank["tiles"]:
                    index = tile["tileIndex"]
                    source = self.source_id(manifest["system"], manifest["archive"], manifest["sourceArchiveSha256"],
                                            block, frame=None, tile=index)
                    pins = {"sourcePngSha256": tile["sourcePngSha256"], "sourceIndicesSha256": tile["sourceIndicesSha256"]}
                    if "sourceBlockSha256" in bank:
                        pins["sourceBlockSha256"] = bank["sourceBlockSha256"]
                    self.add_mapping(f"{consumer}/{block}/{index}", consumer, path, source, source,
                                     f"cok/{folder}/{tile['stem']}.png", tile["sha256"], pins=pins)

    def add_title(self, title_screens):
        path = UI + "cokTitleRestyleManifest.json"
        manifest = self.data(path)
        for key, output in manifest["blocks"].items():
            source = self.source_id("DOS-EGA", manifest["source"]["path"], manifest["source"]["sha256"], int(key))
            self.add_mapping(f"title/{key}", "title", path, source, source,
                             "cok/title/" + output["destination"], output["sha256"])
        for index, layers in enumerate(title_screens):
            self.frames[f"title/{index}"] = {"kind": "screen-composition", "consumerIds": ["title"],
                "admission": "all-layers-required", "reason": "One paint commits a complete title screen.",
                "components": [{"role": "layer", "mappingId": f"title/{block}", "x": x, "y": y}
                               for block, x, y in layers]}

    def add_players(self, player_draw):
        manifest = self.data(PLAYER)
        decisions = validate_restyle_admission_policy(manifest, self.data(PLAYER_POLICY))
        for appearance in manifest["appearances"]:
            key = appearance["appearanceId"]
            for index, body in enumerate(appearance["bodyFrames"]):
                decision = decisions[(key, index)]
                components = []
                for role, component in (("head", appearance["head"]), ("body", body)):
                    archive = ("CHEAD.DAX" if role == "head" else "CBODY.DAX")
                    block = component["blockIds"][index] if role == "head" else body["blockId"]
                    source = self.source_id("DOS-EGA", archive, manifest["sourceContainers"][archive], block)
                    mapping = self.add_mapping(f"player/{key}/{index}/{role}", "player-loader", PLAYER, source, source,
                        f"cok/player/{key}/restyle/{basename(component['restyleFile'])}", component["restyleSha256"],
                        state=decision["state"], reason=decision["reason"], exact_base=False,
                        pins={"sourcePngSha256": digest(component["sourceSha256"])})
                    components.append({"role": role, "mappingId": mapping, "sourceBlockId": block})
                self.frames[f"player/{key}/{index}"] = {"kind": "player-component-variant",
                    "consumerIds": [consumer for consumer, indexes in player_draw.items() if index in indexes],
                    "admission": decision["state"], "evidence": PLAYER_POLICY, "reason": decision["reason"],
                    "components": components}

    def add_combat(self, disks):
        path = UI + "cokCombatRestyleManifest.json"
        banks = {bank["name"]: bank for bank in self.data(path)["banks"]}
        for name, bank in banks.items():
            for item in bank["icons"]:
                block = item["pictureId"]
                source = self.source_id("DOS-EGA", name + ".DAX", bank["sourceArchiveSha256"], block)
                pins = {}
                for key, field in (("sourceImageSha256", "sourcePngSha256"), ("sourceIndicesSha256", "sourceIndicesSha256")):
                    if key in item:
                        pins[field] = item[key]
                self.add_mapping(f"combat/{name}/{block}", "combat-icons", path, source, source,
                                 f"cok/combat/{item['stem']}.png", item["sha256"], pins=pins)
        evidence = self.data(COMBAT)
        if evidence["schema"] != "cok-runtime-art-combat-sites-v1":
            raise ValueError("unexpected combat receipt version")
        if any(evidence[key] != value for key, value in COMBAT_SCOPE.items()):
            raise ValueError("unexpected combat receipt evidence scope")
        for archive in evidence["archives"]:
            ecl = archive["archive"]
            bank_pin = disks[ecl]
            name, archive_sha = bank_pin["bank"], bank_pin["archiveSha256"]
            if digest(archive_sha) != banks[name]["sourceArchiveSha256"]:
                raise ValueError(f"combat consumer/archive manifest disagreement: {name}")
            for block in archive["blocks"]:
                for site in block["sites"]:
                    bindings = []
                    for picture, raw in effective_picture_ids(site["immediateRawOperands"]):
                        source = self.source_id("DOS-EGA", name + ".DAX", archive_sha, picture)
                        mapping = f"combat/{name}/{picture}"
                        bindings.append({"pictureId": picture, "rawPictureOperands": raw, "sourceId": source,
                                         "mappingId": mapping if source and mapping in self.mappings else None})
                    self.requests.append({
                        "kind": "combat-entry", "consumer": "combat-icons", "evidence": COMBAT,
                        "archive": ecl, "archiveSha256": archive["archiveSha256"],
                        "blockId": block["blockId"], "blockSha256": block["blockSha256"],
                        "offset": site["offset"], "entry": site["entry"], "alternatePaths": site["alternatePaths"],
                        "rosteredPaths": site["rosteredPaths"],
                        "localRoster": site["localRoster"], "dynamicPictureOperandCount": site["dynamicPictureOperandCount"],
                        "status": "representative-roster" if site["localRoster"] else "unresolved-no-local-roster",
                        "bank": name, "bankArchiveSha256": archive_sha, "bindings": bindings,
                    })
        return {**COMBAT_SCOPE,
                "truncatedInstructionOffsets": sum(block["truncatedOffsets"] for a in evidence["archives"] for block in a["blocks"]),
                "blocksAtStateLimit": sum(block["stateLimitReached"] for a in evidence["archives"] for block in a["blocks"])}

    def demo_combat(self, spec):
        source_rows = [row for row in self.requests if row["kind"] == "combat-entry"
                       and row["archive"] == spec["archive"] and row["blockId"] == spec["blockId"]
                       and row["entry"] == "initial_entry"]
        if len(source_rows) != 1:
            raise ValueError("demo combat must have one representative initial-entry site")
        site = source_rows[0]
        enemy = [picture for picture, _ in spec["enemyGroups"]]
        if sorted(set(enemy)) != [row["pictureId"] for row in site["bindings"]]:
            raise ValueError("demo enemy pictures differ from static COMBAT receipt")
        roster = [(f"demo-npc-{index}", picture) for index, picture in enumerate(spec["partyPictureIds"])]
        enemy_slots = [picture for picture, count in spec["enemyGroups"] for _ in range(count)]
        for index, picture in enumerate(enemy_slots):
            roster.append((f"demo-foe-{index}", picture))
        bindings = []
        for slot, picture in roster:
            mapping_id = f"combat/{site['bank']}/{picture}"
            bindings.append({"slot": slot, "pictureId": picture, "mappingId": mapping_id,
                             "sourceId": self.mappings[mapping_id]["baseSourceId"]})
        return {"archive": site["archive"], "archiveSha256": site["archiveSha256"], "blockId": site["blockId"],
                "blockSha256": site["blockSha256"], "offset": site["offset"], "bank": site["bank"],
                "evidence": spec["evidence"], "bindings": bindings}

    def add_picture_requests(self, receipts, reviewed_sites):
        joined = {}
        source_mappings = defaultdict(list)
        for key, item in self.mappings.items():
            if item["baseSourceId"] and item["automaticRequestAssociation"] and item["consumer"] in {
                "dialogue-pictures", "demo-picture", "cottage", "travel-map",
            }:
                source_mappings[item["baseSourceId"]].append(key)
        for spec in receipts:
            document = self.data(spec["path"])
            ecl = document.get("ecl", {})
            archive_sha = ecl.get("archiveSha256", ecl.get("sha256", document.get("eclArchiveSha256")))
            block_id = ecl.get("blockId", document.get("eclBlockId"))
            block_sha = ecl.get("blockSha256", document.get("eclBlockSha256"))
            for site in document["sites"]:
                # Different receipts retain different binding structures. Copy only explicit source links.
                binding = site.get("conditionalBinding", site.get("binding", site))
                source_ids = binding.get("sourceAssetIds") or [
                    binding.get("sourceAssetId", site.get("siteAssetMapping"))]
                source_ids = [self.use_source(sid) for sid in source_ids if sid is not None]
                key = (archive_sha, block_id, site["offset"])
                if key in joined:
                    raise ValueError(f"duplicate picture receipt join: {key}")
                status = binding.get("status", binding.get("classification"))
                joined[key] = (spec["path"], block_sha, site["pictureId"], source_ids, status)
        for site in reviewed_sites:
            key = (site["archiveSha256"], site["blockId"], site["offset"])
            if key in joined or site["evidence"] not in self.inputs:
                raise ValueError(f"invalid reviewed picture site: {key}")
            joined[key] = (site["evidence"], site["blockSha256"], site["pictureId"],
                           [self.use_source(site["sourceAssetId"])], "reviewed-bounded-host-binding")
        for archive in self.data(PICTURES)["archives"]:
            archive_sha = archive["archiveSha256"]
            block_hashes = {row["blockId"]: row["blockSha256"] for row in archive["inventory"]}
            for block in archive["staticFindings"]:
                block_id = block["blockId"]
                for site in block["pictureSites"]:
                    key = (archive_sha, block_id, site["offset"])
                    evidence, block_sha, picture, sources, status = joined.pop(key, (
                        PICTURES, block_hashes[block_id], site["pictureId"], [],
                        "unresolved-dynamic" if site["pictureId"] is None else "unresolved-immediate"))
                    if block_sha != block_hashes[block_id] or picture != site["pictureId"]:
                        raise ValueError(f"picture receipt does not match census: {key}")
                    if picture is None and sources:
                        raise ValueError(f"dynamic picture cannot have a guessed source: {key}")
                    self.requests.append({
                        "kind": "ecl-picture", "consumer": "dialogue-pictures", "evidence": evidence,
                        "archive": archive["archive"], "archiveSha256": archive_sha, "blockId": block_id,
                        "blockSha256": block_sha, "offset": site["offset"], "pictureId": picture,
                        "entries": site["entries"], "status": status, "sourceIds": sources,
                        "conditionalMappingIds": sorted({mid for sid in sources for mid in source_mappings[sid]}),
                    })
        if joined:
            raise ValueError(f"picture receipt contains sites absent from census: {sorted(joined)}")

    def finalize(self):
        groups = {}
        for source in list(self.sources.values()):
            group_id = source["frameGroupId"]
            if group_id and group_id not in groups:
                group = self.registry_groups[group_id]
                groups[group_id] = {key: group[key] for key in ("semantics", "playback", "status", "frames")}
                for frame in group["frames"]:
                    self.use_source(frame["assetId"])
        used_restyles = {rid for source in self.sources.values() for rid in source["restyleRecordIds"]}
        records = {}
        for rid in sorted(used_restyles):
            item = self.registry_restyles[rid]
            records[rid] = {"registryReview": item["reviewStatus"], "promptStatus": item["prompt"]["status"],
                            "outputs": [{"sha256": o["sha256"], "role": o["role"]} for o in item["outputs"]]}
        return groups, records


def summarize(ledger, combat_scan):
    combat = [row for row in ledger.requests if row["kind"] == "combat-entry"]
    pictures = [row for row in ledger.requests if row["kind"] == "ecl-picture"]
    by_bank = {}
    for bank in sorted({row["bank"] for row in combat}):
        rows = [row for row in combat if row["bank"] == bank]
        immediate = {b["pictureId"] for row in rows for b in row["bindings"]}
        mapped = {b["pictureId"] for row in rows for b in row["bindings"] if b["mappingId"]}
        dynamic = {(row["archive"], row["blockId"], row["offset"]) for row in rows if row["dynamicPictureOperandCount"]}
        physical = {(row["archive"], row["blockId"], row["offset"]) for row in rows}
        no_roster = {(row["archive"], row["blockId"], row["offset"]) for row in rows if not row["localRoster"]}
        by_bank[bank] = {"distinctImmediatePictureIds": len(immediate), "withDeclaredMapping": len(mapped),
                         "unmappedPictureIds": sorted(immediate - mapped), "distinctDynamicSites": len(dynamic),
                         "distinctCombatSites": len(physical), "sitesWithNoLocalRosterEntry": len(no_roster),
                         "withoutLocalRosterEntryRows": sum(not row["localRoster"] for row in rows)}
    return {
        "combatScan": {**combat_scan, "entrySiteRows": len(combat),
                       "physicalSites": sum(row["distinctCombatSites"] for row in by_bank.values()),
                       "representativePathsWithAlternates": sum(row["alternatePaths"] > 0 for row in combat),
                       "byBank": by_bank},
        "eclPictureSites": {"total": len(pictures), "dynamic": sum(row["pictureId"] is None for row in pictures),
                            "withConditionalSource": sum(bool(row["sourceIds"]) for row in pictures)},
        "mappingEntriesByConsumer": dict(Counter(row["consumer"] for row in ledger.mappings.values())),
        "outputPaths": len(ledger.outputs), "distinctOutputHashes": len({row["sha256"] for row in ledger.outputs.values()}),
        "framesByKind": dict(Counter(row["kind"] for row in ledger.frames.values())),
        "frameComponentPlacements": sum(len(row["components"]) for row in ledger.frames.values()),
        "canonicalSourceIds": len(ledger.sources),
    }


def build_report(root=ROOT):
    contract_bytes = (root / CONTRACT).read_bytes()
    contract = json.loads(contract_bytes)
    inputs = checked_inputs(root, contract)
    ledger = Ledger(json.loads(inputs[REGISTRY]), inputs, contract["consumers"])
    ledger.add_picture_mappings(contract)
    ledger.add_tile_mappings()
    ledger.add_title(contract["titleScreens"])
    ledger.add_players(contract["playerDraw"])
    combat_scan = ledger.add_combat(contract["combatDisks"])
    demo_combat = ledger.demo_combat(contract["demoCombat"])
    ledger.add_picture_requests(contract["pictureReceipts"], contract["reviewedPictureSites"])
    groups, records = ledger.finalize()
    return {
        "schema": "cok-runtime-art-coverage-v1", "inputs": {CONTRACT: text_sha(contract_bytes), **contract["inputs"]},
        "runtimeObservation": "unverified", "productionPackage": "unverified", "consumers": ledger.consumers,
        "limitations": contract["limitations"], "summary": summarize(ledger, combat_scan),
        "originalVariants": ledger.original_variants, "travelMapLayers": contract["travelMapLayers"],
        "demoCombat": demo_combat,
        "requests": ledger.requests, "mappings": ledger.mappings, "sourceAssets": ledger.sources,
        "restyleRecords": records, "sourceFrameGroups": groups, "frames": ledger.frames, "outputs": ledger.outputs,
    }


def picture_requests_v2(prior, census):
    sites = {}
    for archive in census["archives"]:
        block_hashes = {block["blockId"]: block["blockSha256"] for block in archive["inventory"]}
        for block in archive["staticFindings"]:
            for site in block["pictureSites"]:
                key = (archive["archive"], archive["archiveSha256"], block["blockId"],
                       block_hashes[block["blockId"]], site["offset"])
                if key in sites:
                    raise ValueError(f"duplicate census PICTURE site: {key}")
                sites[key] = site
    requests = []
    for row in prior["requests"]:
        if row["kind"] != "ecl-picture":
            continue
        key = (row["archive"], row["archiveSha256"], row["blockId"], row["blockSha256"], row["offset"])
        site = sites.pop(key)
        if row["pictureId"] != site["pictureId"] or row["entries"] != site["entries"]:
            raise ValueError(f"PICTURE receipt differs at {key}")
        requests.append({**row, "operand": site["operand"], "entryWitnesses": site["entryWitnesses"]})
    if sites:
        raise ValueError("PICTURE ledger omitted pinned census sites")
    return requests


def combat_variants_v2(receipt, ledger, disks, prior):
    if (receipt["schema"] != "cok-runtime-art-combat-sites-v2" or receipt["limits"] != LIMITS
            or any(receipt[key] != value for key, value in VARIANT_SCOPE.items())):
        raise ValueError("unexpected v2 combat evidence scope or bounds")
    manifest = ledger.data(UI + "cokCombatRestyleManifest.json")
    bank_pins = {bank["name"]: bank["sourceArchiveSha256"] for bank in manifest["banks"]}
    prior_rows = [r for r in prior["requests"] if r["kind"] == "combat-entry"]
    prior_dynamic = {(r["archive"], r["blockId"], r["offset"], r["entry"])
                     for r in prior_rows if r["dynamicPictureOperandCount"]}
    prior_empty = {(r["archive"], r["blockId"], r["offset"], r["entry"])
                   for r in prior_rows if not r["localRoster"]}
    added_dynamic, added_empty = set(), set()
    by_bank, bindings_by_bank, frontier_counts = {}, {}, Counter()
    archive_names = []
    explored = 0

    for archive in receipt["archives"]:
        name = archive["archive"]
        archive_names.append(name)
        spec = ARCHIVES[name]
        if archive["archiveSha256"] != spec["sha256"] or [
            (block["blockId"], block["blockSha256"]) for block in archive["blocks"]
        ] != [(block, digest_value) for block, _, digest_value in spec["blocks"]]:
            raise ValueError(f"v2 combat archive or block pins differ: {name}")
        pin = disks[name]
        bank, bank_sha = pin["bank"], pin["archiveSha256"]
        if bank_pins[bank] != bank_sha or bank in by_bank:
            raise ValueError(f"combat consumer/archive manifest disagreement: {bank}")
        counts, bank_frontiers, immediate = Counter(), Counter(), defaultdict(set)
        for block in archive["blocks"]:
            block_id = block["blockId"]
            counts["exploredStates"] += block["exploredStates"]
            counts["blocksAtStateLimit"] += any(frontier["reason"] == "state-budget" for frontier in block["frontiers"])
            for frontier in block["frontiers"]:
                bank_frontiers[frontier["reason"]] += frontier["events"]
            offsets = set()
            for site in block["sites"]:
                offset = site["offset"]
                if offset in offsets or not site["variants"]:
                    raise ValueError("duplicate or empty physical COMBAT site")
                offsets.add(offset)
                counts["physicalSites"] += 1
                entries, ids = set(), set()
                any_dynamic = any_empty = False
                for variant in site["variants"]:
                    roster = variant["roster"]
                    slots = picture_slots(roster)
                    raw = {value for code, value in slots if code == 0}
                    variant_id = roster_id(block["blockSha256"], offset, roster)
                    if (variant["id"] != variant_id or variant_id in ids or not variant["entries"]
                            or variant["pictureIds"] != sorted({value & 255 for value in raw})):
                        raise ValueError("invalid or duplicate combat roster variant")
                    ids.add(variant_id)
                    entries.update(variant["entries"])
                    counts["distinctRosterVariants"] += 1
                    counts["entryVariantAssociations"] += len(variant["entries"])
                    dynamic = any(code != 0 for code, _ in slots)
                    any_dynamic |= dynamic
                    any_empty |= not roster
                    memberships = {(name, block_id, offset, entry) for entry in variant["entries"]}
                    if dynamic:
                        added_dynamic.update(memberships - prior_dynamic)
                    if not roster:
                        added_empty.update(memberships - prior_empty)
                    for picture, raw_values in effective_picture_ids(sorted(raw)):
                        immediate[picture].update(raw_values)
                counts["entrySiteAssociations"] += len(entries)
                counts["sitesWithDynamicPictureVariant"] += any_dynamic
                counts["sitesWithEmptyRosterVariant"] += any_empty

        bindings = {}
        for picture, raw_values in sorted(immediate.items()):
            source = ledger.source_id("DOS-EGA", bank + ".DAX", bank_sha, picture)
            mapping = f"combat/{bank}/{picture}"
            declared = prior["mappings"].get(mapping)
            if declared is not None and declared["baseSourceId"] != source:
                raise ValueError(f"v2 combat source differs from its declaration: {mapping}")
            bindings[str(picture)] = {"sourceId": source, "rawPictureOperands": sorted(raw_values),
                                      "mappingId": mapping if source and declared is not None else None}
        bindings_by_bank[bank] = {"archiveSha256": bank_sha, "pictures": bindings}
        by_bank[bank] = {**counts, "frontierEventsByReason": dict(bank_frontiers),
                         "distinctImmediatePictureIds": len(bindings),
                         "withDeclaredMapping": sum(bool(row["mappingId"]) for row in bindings.values()),
                         "unresolvedSourcePictureIds": [int(key) for key, row in bindings.items() if not row["sourceId"]],
                         "unmappedPictureIds": [int(key) for key, row in bindings.items() if not row["mappingId"]]}
        frontier_counts.update(bank_frontiers)
        explored += counts["exploredStates"]

    if archive_names != list(ARCHIVES):
        raise ValueError("combat receipt archive roster differs")
    summary = {**VARIANT_SCOPE, "exploredStates": explored, "frontierEventsByReason": dict(frontier_counts),
               "hasExplorationFrontiers": bool(frontier_counts), "byBank": by_bank}
    for key in ("physicalSites", "entrySiteAssociations", "entryVariantAssociations", "distinctRosterVariants",
                "sitesWithDynamicPictureVariant", "sitesWithEmptyRosterVariant", "blocksAtStateLimit",
                "distinctImmediatePictureIds", "withDeclaredMapping"):
        summary[key] = sum(row[key] for row in by_bank.values())

    prior_by_bank = prior["summary"]["combatScan"]["byBank"]
    delta_banks = {}
    for bank, row in by_bank.items():
        old = {b["pictureId"] for r in prior_rows if r["bank"] == bank for b in r["bindings"]}
        new = set(map(int, bindings_by_bank[bank]["pictures"]))
        delta_banks[bank] = {"addedPictureIds": sorted(new - old), "removedPictureIds": sorted(old - new),
                             "v1Identified": prior_by_bank[bank]["distinctImmediatePictureIds"],
                             "v2Identified": row["distinctImmediatePictureIds"],
                             "v1Mapped": prior_by_bank[bank]["withDeclaredMapping"],
                             "v2Mapped": row["withDeclaredMapping"]}
    def locations(items):
        return [{"archive": archive, "blockId": block, "offset": offset, "entry": entry}
                for archive, block, offset, entry in sorted(items)]

    delta = {"baseReport": REPORT, "byBank": delta_banks, "newDynamicEntrySites": locations(added_dynamic),
             "newEmptyRosterEntrySites": locations(added_empty)}
    return summary, bindings_by_bank, delta


def original_source_uses(contract, ledger, prior):
    """Bind reviewed original-game uses to exact canonical source locators, without Restyle admission."""
    rows, seen_ids = [], set()
    declarations = contract.get("originalSourceUses")
    if not isinstance(declarations, list):
        raise ValueError("v2 originalSourceUses must be an array")
    for declaration in declarations:
        if (not isinstance(declaration, dict) or not declaration.get("id")
                or not isinstance(declaration.get("consumerIds"), list)
                or not declaration["consumerIds"]
                or any(consumer not in ledger.consumers for consumer in declaration["consumerIds"])
                or declaration["platform"] != "DOS-EGA"
                or declaration["archive"] != "8X8D1.DAX"
                or declaration["archiveSha256"] != "14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915"
                or declaration["indexField"] not in ("tileIndex", "glyphIndex")
                or not isinstance(declaration.get("indices"), list)
                or not declaration["indices"]
                or not isinstance(declaration.get("evidence"), list)
                or not declaration["evidence"]
                or any(path not in prior["inputs"] for path in declaration["evidence"])):
            raise ValueError("invalid or unpinned v2 original source-use declaration")
        source_ids = []
        for index in declaration["indices"]:
            if not isinstance(index, int) or index < 0:
                raise ValueError("invalid v2 original source-use index")
            source_id = f"{declaration['sourceIdPrefix']}{index}"
            if source_id in seen_ids:
                raise ValueError(f"duplicate v2 original source ID: {source_id}")
            source = ledger.assets.get(source_id)
            expected_locator = {"kind": declaration["locatorKind"], "blockId": declaration["blockId"],
                                "entryIndex": declaration["entryIndex"], "frameIndex": None,
                                "tileIndex": index if declaration["indexField"] == "tileIndex" else None,
                                "cellIndex": None}
            if declaration["indexField"] == "glyphIndex":
                expected_locator["glyphIndex"] = index
            if (source is None or source["identityStatus"] != "source-pinned"
                    or source["platform"] != declaration["platform"]
                    or source["archive"]["name"] != declaration["archive"]
                    or source["archive"]["sha256"] != declaration["archiveSha256"]
                    or source["locator"] != expected_locator):
                raise ValueError(f"original source locator mismatch: {source_id}")
            ledger.use_source(source_id)
            seen_ids.add(source_id)
            source_ids.append(source_id)
        rows.append({key: declaration[key] for key in (
            "id", "consumerIds", "platform", "archive", "archiveSha256", "blockId", "locatorKind",
            "indexField", "selectionScope", "evidence")}
            | {"sourceIds": source_ids})
    return rows


def build_report_v2(root=ROOT):
    contract_bytes = (root / CONTRACT_V2).read_bytes()
    contract = json.loads(contract_bytes)
    inputs = checked_inputs(root, contract, version=2)
    prior = build_report(root)
    if inputs[REPORT] != report_bytes(prior):
        raise ValueError("historical coverage report no longer reproduces")
    receipt = json.loads(inputs[COMBAT_V2])
    if receipt["inputs"] != {path: text_sha(inputs[path]) for path in SCAN_HELPERS}:
        raise ValueError("v2 combat receipt helper pins differ")
    base_contract = json.loads(inputs[CONTRACT])
    ledger = Ledger(json.loads(inputs[REGISTRY]), inputs, prior["consumers"])
    ledger.sources = dict(prior["sourceAssets"])
    original_uses = original_source_uses(contract, ledger, prior)
    summary, bindings, delta = combat_variants_v2(receipt, ledger, base_contract["combatDisks"], prior)
    groups, records = ledger.finalize()
    return {**prior, "schema": "cok-runtime-art-coverage-v2",
            "inputs": {**prior["inputs"], CONTRACT_V2: text_sha(contract_bytes), **contract["inputs"]},
            "limitations": contract["limitations"], "combatEvidence": COMBAT_V2,
            "pictureEvidenceScope": "fixed encoded operands with bounded entry witnesses",
            "combatBindings": bindings, "deltaFromV1": delta,
            "originalSourceUses": original_uses,
            "summary": {**prior["summary"], "combatScan": summary, "canonicalSourceIds": len(ledger.sources)},
            "requests": picture_requests_v2(prior, json.loads(inputs[PICTURES])),
            "sourceAssets": ledger.sources, "sourceFrameGroups": groups, "restyleRecords": records}


def audit_output_files(report, asset_pack):
    root = asset_pack.resolve()
    results = {}
    for relative_path, output in report["outputs"].items():
        path = (root / relative(relative_path)).resolve()
        if not path.is_relative_to(root):
            raise ValueError(f"asset pack entry escapes root: {relative_path}")
        actual = sha(path.read_bytes()) if path.is_file() else None
        results[relative_path] = {"status": "missing" if actual is None else
                                  "hash-match" if actual == output["sha256"] else "hash-mismatch",
                                  "sha256": actual}
    return results


def require_metadata_budget(size):
    if size > METADATA_LIMIT:
        raise ValueError(f"metadata requires {size:,} bytes; the 1 MiB budget is {METADATA_LIMIT:,} bytes")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="atomically write only the report")
    mode.add_argument("--check", action="store_true", help="check the existing report is current")
    mode.add_argument("--scan-combat", type=Path, metavar="DOS_GAME_ROOT", help="recompute the combat receipt to stdout")
    mode.add_argument("--write-combat", type=Path, metavar="DOS_GAME_ROOT", help="atomically write the v2 combat receipt")
    parser.add_argument("--v2", action="store_true", help="use the bounded all-distinct-rosters ledger")
    parser.add_argument("--asset-pack", type=Path, help="audit a local pack independently of report generation")
    args = parser.parse_args()
    try:
        if args.scan_combat is not None or args.write_combat is not None:
            if not args.v2 and args.write_combat is not None:
                raise ValueError("--write-combat requires --v2")
            dos_root = args.scan_combat if args.scan_combat is not None else args.write_combat
            data = report_bytes(combat_receipt_v2(dos_root)) if args.v2 else stable_json(combat_receipt(dos_root))
            if args.v2:
                require_metadata_budget(len(data))
            if args.write_combat is not None:
                write_atomic(ROOT / COMBAT_V2, data)
            else:
                sys.stdout.write(data.decode())
            return 0
        report = build_report_v2(ROOT) if args.v2 else build_report()
        path = ROOT / (REPORT_V2 if args.v2 else REPORT)
        data = report_bytes(report)
        other_bytes = sum((ROOT / item).stat().st_size for item in (COMBAT_V2, CONTRACT_V2, SCHEMA_V2)) if args.v2 else 0
        require_metadata_budget(len(data) + other_bytes)
        if args.check and path.read_bytes() != data:
            raise ValueError("checked-in report differs from the deterministic report")
        summary = {**report["summary"], "runtimeObservation": report["runtimeObservation"],
                   "productionPackage": report["productionPackage"], "limitations": report["limitations"]}
        if args.asset_pack is not None:
            files = audit_output_files(report, args.asset_pack)
            summary = {**summary, "localPackFiles": dict(Counter(row["status"] for row in files.values())),
                       "localPackExceptions": {path: row for path, row in files.items() if row["status"] != "hash-match"}}
        if args.write:
            write_atomic(path, data)
        sys.stdout.write(stable_json(summary).decode())
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
