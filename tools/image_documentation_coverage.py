"""Audit image documentation from metadata; never open or decode image files.

Usage: python tools/image_documentation_coverage.py --pack PATH --output REPORT.json
The output counts references and assertions, not independent visual verification.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def audit(pack, repository):
    images = {p.relative_to(pack).as_posix() for p in pack.rglob("*.png")}
    coverage = collections.defaultdict(set)
    hashes = collections.defaultdict(set)
    root_manifest = load(pack / "manifest.json")
    generated = load(pack / "cok-generated/manifest.json")
    animation = load(pack / "anim/index.json")
    registries = []
    for game in ("cok", "dok"):
        registries.append((game, load(repository / "docs/engine/research" / f"{game}-graphics-identity-registry-v1.json")))

    def mark(path, field):
        if path in images:
            coverage[field].add(path)

    # A manifest's source/output hash is a metadata assertion, not rehashed here.
    for item in generated["assets"]:
        for role in ("source", "output"):
            path = "cok-generated/" + item[role]
            mark(path, "manifest_reference")
            mark(path, "title_platform_metadata")
            if item.get(role + "Sha256"):
                hashes[item[role + "Sha256"]].add(path)
                mark(path, "manifest_hash")
            if item.get("sourceProvenance"):
                mark(path, "provenance_text")
            if item.get("promptReferences"):
                mark(path, "prompt_reference")
            if item.get("runtimeApproved"):
                mark(path, "runtime_approval_assertion")
    for item in root_manifest["items"]:
        stem = item["stem"]
        for path in (f"orig/{stem}.png", f"out/{stem}.png"):
            mark(path, "manifest_reference")
            if item.get("description"):
                mark(path, "curated_description")
            if item.get("src"):
                mark(path, "provenance_text")
    for path, digest in animation.get("imageSha256", {}).items():
        # Some index versions store paths relative to the pack, others to anim/.
        candidates = [path, "anim/" + path]
        for candidate in candidates:
            if candidate in images and isinstance(digest, str):
                hashes[digest].add(candidate)
                mark(candidate, "manifest_reference")
                mark(candidate, "manifest_hash")

    registry_summary = {}
    for game, registry in registries:
        assets = registry["assets"]
        summary = collections.Counter()
        summary["source_ids"] = len(assets)
        summary["restyle_records"] = len(registry.get("restyles", []))
        for asset in assets:
            description = asset.get("description", {})
            visual = description.get("visualDescription")
            if visual:
                summary["nonempty_visual_description"] += 1
            summary["description_status_" + description.get("status", "missing")] += 1
            digest = (asset.get("decoded") or {}).get("sha256")
            matched = hashes.get(digest, set())
            consumers = [c for c in asset.get("gameConsumers", []) if c.get("status") not in (None, "unknown")]
            if consumers:
                summary["source_ids_with_nonunknown_consumer"] += 1
            for path in matched:
                mark(path, "registry_source_hash_match")
                if visual:
                    mark(path, "registry_visual_description")
                if consumers:
                    mark(path, "registry_nonunknown_consumer")
        for restyle in registry.get("restyles", []):
            for output in restyle.get("outputs", []):
                for path in hashes.get(output.get("sha256"), set()):
                    mark(path, "registry_restyle_hash_match")
                    if restyle.get("prompt", {}).get("sha256"):
                        mark(path, "registry_prompt_hash")
        registry_summary[game] = dict(summary)
    return {
        "schema": "greybox-image-documentation-coverage-v1",
        "pack": str(pack),
        "metadata_sha256": {
            str(p): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in [pack / "manifest.json", pack / "cok-generated/manifest.json", pack / "anim/index.json"]
            + [repository / "docs/engine/research" / f"{game}-graphics-identity-registry-v1.json" for game in ("cok", "dok")]
        },
        "method": "Metadata-only path and declared-hash joins; no image bytes read or pixels decoded. Fields are documentation assertions, not independent verification. Categories overlap.",
        "png_files": len(images),
        "directories": dict(collections.Counter(p.split("/")[0] for p in images)),
        "generated_comparison_records": len(generated["assets"]),
        "curated_comparison_records": len(root_manifest["items"]),
        "animation_records": len(animation["items"]),
        "coverage": {key: len(value) for key, value in sorted(coverage.items())},
        "unreferenced_by_audited_manifests": sorted(images - coverage["manifest_reference"]),
        "registries": registry_summary,
        "limitations": [
            "Only CoK and DoK identity registries are joined; other titles are not assumed undocumented.",
            "Source descriptions do not automatically describe a generated Restyle output.",
            "Hash matches use declared metadata hashes; this audit does not verify image bytes.",
            "Nonempty visual-description fields are counted without judging prose quality or evidence correctness.",
            "Animation descriptions, individual prompt text files and external ledgers require further review.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.pack, Path(__file__).resolve().parents[1])
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "unreferenced_by_audited_manifests"}, indent=2))
