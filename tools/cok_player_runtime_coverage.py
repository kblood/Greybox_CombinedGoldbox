#!/usr/bin/env python3
"""Build a source-only CoK player-icon runtime coverage report.

The report keeps archive identity, package declarations, consumer source bindings, inventory
review, and runtime observation as independent evidence. It never changes admission or artwork.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_DEFAULT = Path("docs/engine/research/cok-player-consumer-contract-v1.json")
REPORT_DEFAULT = Path("docs/engine/research/cok-player-runtime-coverage-v1.json")
HEX = set("0123456789abcdef")

sys.path.insert(0, str(ROOT / "tools"))
from import_cok_player_appearance_registry import derive_appearance_sets  # noqa: E402


def read_json(root: Path, relative: str | Path) -> Any:
    return json.loads((root / relative).read_text(encoding="utf-8"))


def digest_file(root: Path, relative: str | Path) -> str:
    return hashlib.sha256((root / relative).read_bytes()).hexdigest()


def text_digest_file(root: Path, relative: str | Path) -> str:
    """Pin digest for reviewed text inputs: CRLF is normalised to LF so CRLF and LF checkouts agree."""
    return hashlib.sha256((root / relative).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def _relative_path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or Path(value).is_absolute() or ".." in Path(value).parts:
        raise ValueError(f"{label} must be a non-empty workspace-relative path")
    return Path(value).as_posix()


def validate_restyle_admission_policy(manifest: dict[str, Any], policy: dict[str, Any]) -> dict[tuple[str, int], dict[str, str]]:
    if policy.get("schema") != "cok-player-restyle-admission-v1" or not isinstance(policy.get("frames"), list):
        raise ValueError("unsupported CoK player Restyle admission policy")
    expected: dict[tuple[str, int], dict[str, Any]] = {}
    for appearance in manifest.get("appearances", []):
        appearance_id = appearance.get("appearanceId")
        head = appearance.get("head", {})
        if not isinstance(appearance_id, str) or not isinstance(appearance.get("bodyFrames"), list):
            raise ValueError("invalid appearance in player Restyle admission manifest")
        for index, body in enumerate(appearance["bodyFrames"]):
            key = (appearance_id, index)
            if key in expected:
                raise ValueError("duplicate appearance/frame in player Restyle admission manifest")
            expected[key] = {
                "headBlockIds": appearance.get("head", {}).get("blockIds"),
                "bodyBlockId": body.get("blockId"),
                "head": {name: str(head.get(name, "")).lower() for name in ("sourceSha256", "restyleSha256")},
                "body": {name: str(body.get(name, "")).lower() for name in ("sourceSha256", "restyleSha256")},
            }
    actual: dict[tuple[str, int], dict[str, str]] = {}
    for row in policy["frames"]:
        if not isinstance(row, dict) or not isinstance(row.get("appearanceId"), str) \
                or not isinstance(row.get("frameIndex"), int) or row["frameIndex"] < 0:
            raise ValueError("invalid player Restyle admission row")
        key = (row["appearanceId"], row["frameIndex"])
        pinned = expected.get(key)
        if pinned is None or key in actual or row.get("state") not in ("admitted", "held") \
                or not isinstance(row.get("reason"), str) or not row["reason"].strip():
            raise ValueError("duplicate, unknown or invalid player Restyle admission row")
        candidate = {
            "headBlockIds": row.get("headBlockIds"),
            "bodyBlockId": row.get("bodyBlockId"),
            "head": {name: str(row.get("head", {}).get(name, "")).lower() for name in ("sourceSha256", "restyleSha256")},
            "body": {name: str(row.get("body", {}).get(name, "")).lower() for name in ("sourceSha256", "restyleSha256")},
        }
        if candidate != pinned:
            raise ValueError("player Restyle admission row differs from the source manifest pins")
        actual[key] = {"state": row["state"], "reason": row["reason"]}
    if not expected or set(actual) != set(expected):
        raise ValueError("player Restyle admission policy must account for every composed frame")
    return actual


def verify_contract(root: Path, contract: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    if contract.get("schema") != "cok-player-consumer-contract-v1" or contract.get("mode") != "Restyle":
        raise ValueError("unsupported player consumer contract schema or graphics mode")
    manifest_pin = contract.get("sourceManifest", {})
    manifest_path = _relative_path(manifest_pin.get("path"), "sourceManifest.path")
    if text_digest_file(root, manifest_path) != manifest_pin.get("sha256"):
        raise ValueError("player appearance manifest hash differs from reviewed consumer contract")
    inventory_pin = contract.get("inventorySnapshot", {})
    inventory_path = _relative_path(inventory_pin.get("path"), "inventorySnapshot.path")
    if text_digest_file(root, inventory_path) != inventory_pin.get("sha256"):
        raise ValueError("retained generated-inventory snapshot hash differs from reviewed contract")
    consumers = contract.get("consumerSources")
    if not isinstance(consumers, list) or not consumers:
        raise ValueError("consumerSources must be a non-empty pinned list")
    ids: set[str] = set()
    for entry in consumers:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or entry["id"] in ids:
            raise ValueError("consumerSources contains an invalid or duplicate id")
        ids.add(entry["id"])
        path = _relative_path(entry.get("path"), f"consumer {entry['id']} path")
        expected = entry.get("sha256")
        if not isinstance(expected, str) or len(expected) != 64 or any(ch not in HEX for ch in expected):
            raise ValueError(f"consumer {entry['id']} has an invalid source hash pin")
        if text_digest_file(root, path) != expected:
            raise ValueError(f"consumer source differs from reviewed pin: {path}")
    manifest = read_json(root, manifest_path)
    registry = read_json(root, _relative_path(contract.get("registryPath"), "registryPath"))
    inventory = read_json(root, inventory_path)
    policy_pin = contract.get("restyleAdmissionPolicy", {})
    policy_path = _relative_path(policy_pin.get("path"), "restyleAdmissionPolicy.path")
    if text_digest_file(root, policy_path) != policy_pin.get("sha256"):
        raise ValueError("player Restyle admission policy hash differs from reviewed contract")
    resolver = policy_pin.get("resolverSource", {})
    resolver_path = _relative_path(resolver.get("path"), "restyleAdmissionPolicy.resolverSource.path")
    if text_digest_file(root, resolver_path) != resolver.get("sha256"):
        raise ValueError("player Restyle admission resolver differs from reviewed contract")
    package_builder = policy_pin.get("packageBuilderSource", {})
    package_builder_path = _relative_path(package_builder.get("path"), "restyleAdmissionPolicy.packageBuilderSource.path")
    if text_digest_file(root, package_builder_path) != package_builder.get("sha256"):
        raise ValueError("player Restyle package builder differs from reviewed contract")
    policy = read_json(root, policy_path)
    validate_restyle_admission_policy(manifest, policy)
    return manifest, registry, inventory, policy


def inventory_pair_evidence(inventory: dict[str, Any], source_sha: str, output_sha: str) -> dict[str, Any]:
    matches = [row for row in inventory.get("assets", [])
               if row.get("sourceSha256", "").lower() == source_sha.lower()
               and row.get("outputSha256", "").lower() == output_sha.lower()]
    if len(matches) > 1:
        raise ValueError(f"duplicate generated-inventory pair for {source_sha}:{output_sha}")
    if not matches:
        return {
            "status": "unmatched",
            "assetId": None,
            "runtimeApproved": None,
            "runtimeApprovalEvidence": [],
            "compositionReview": "unknown",
            "promptStatus": "unknown",
            "promptReferenceCount": 0,
        }
    row = matches[0]
    references = row.get("promptReferences", [])
    return {
        "status": "matched",
        "assetId": row.get("id"),
        "runtimeApproved": row.get("runtimeApproved"),
        "runtimeApprovalEvidence": list(row.get("runtimeApprovalEvidence", [])),
        "compositionReview": row.get("compositionReview", "unknown"),
        "promptStatus": "referenced" if references else "unknown",
        "promptReferenceCount": len(references),
    }


def package_file_evidence(root: Path, package_root: str, appearance_id: str, component: dict[str, Any]) -> dict[str, Any]:
    identities = {}
    for kind, file_key, hash_key in (("original", "sourceFile", "sourceSha256"),
                                     ("restyle", "restyleFile", "restyleSha256")):
        filename = Path(component[file_key]).name
        relative = Path(package_root) / appearance_id / kind / filename
        expected = component[hash_key].lower()
        path = root / relative
        if not path.is_file():
            identities[kind] = {"packageId": relative.as_posix(), "status": "missing", "expectedSha256": expected,
                                "actualSha256": None}
            continue
        actual = digest_file(root, relative)
        identities[kind] = {"packageId": relative.as_posix(),
                            "status": "hash-match" if actual == expected else "hash-mismatch",
                            "expectedSha256": expected, "actualSha256": actual}
    return identities


def runtime_package_audit(root: Path, contract: dict[str, Any], manifest: dict[str, Any],
                          policy: dict[str, Any]) -> dict[str, Any]:
    """Audit the exact build roster separately from per-component manifest file slots."""
    frame_states = validate_restyle_admission_policy(manifest, policy)
    package_root = _relative_path(contract["packageRoot"], "packageRoot")
    planned: list[dict[str, Any]] = []
    held: list[dict[str, Any]] = []

    def add(appearance_id: str, kind: str, component: dict[str, Any]) -> None:
        filename_key, hash_key = (("sourceFile", "sourceSha256") if kind == "original"
                                  else ("restyleFile", "restyleSha256"))
        filename = Path(component[filename_key]).name
        package_id = (Path(package_root) / appearance_id / kind / filename).as_posix()
        expected = component[hash_key].lower()
        path = root / package_id
        actual = digest_file(root, package_id) if path.is_file() else None
        planned.append({"packageId": package_id, "expectedSha256": expected,
                        "actualSha256": actual,
                        "sourceStatus": "missing" if actual is None else
                        "hash-match" if actual == expected else "hash-mismatch"})

    for appearance in manifest["appearances"]:
        appearance_id = appearance["appearanceId"]
        body_frames = appearance["bodyFrames"]
        add(appearance_id, "original", appearance["head"])
        if any(frame_states[(appearance_id, index)]["state"] == "admitted"
               for index in range(len(body_frames))):
            add(appearance_id, "restyle", appearance["head"])
        for index, body in enumerate(body_frames):
            add(appearance_id, "original", body)
            frame = frame_states[(appearance_id, index)]
            if frame["state"] == "admitted":
                add(appearance_id, "restyle", body)
            else:
                filename = Path(body["restyleFile"]).name
                package_id = (Path(package_root) / appearance_id / "restyle" / filename).as_posix()
                held.append({"packageId": package_id,
                             "sourceStatus": "present" if (root / package_id).is_file() else "missing",
                             "buildOutputPolicy": "removed-if-present-by-player-package-builder"})

    if len(planned) != 20 or len({row["packageId"] for row in planned}) != 20:
        raise ValueError("runtime player package plan differs from the exact 20-path build contract")
    return {
        "sourceRoot": package_root,
        "plan": planned,
        "heldRestylePaths": held,
        "scope": "public source-tree copy audit; no build output or runtime observation",
    }


def build_component_report(root: Path, contract: dict[str, Any], appearance_id: str,
                           variant_index: int, role: str, manifest_component: dict[str, Any],
                           registry_asset: dict[str, Any], inventory: dict[str, Any],
                           frame_admission: dict[str, str]) -> dict[str, Any]:
    source_sha = manifest_component["sourceSha256"].lower()
    output_sha = manifest_component["restyleSha256"].lower()
    expected_source = registry_asset.get("decoded", {}).get("sha256", "").lower()
    source_archive_sha = registry_asset.get("archive", {}).get("sha256", "").lower()
    inventory_evidence = inventory_pair_evidence(inventory, source_sha, output_sha)
    package = package_file_evidence(root, contract["packageRoot"], appearance_id, manifest_component)
    bindings = []
    for consumer in contract["consumerSources"]:
        indexes = consumer.get("variantIndexes")
        if indexes is not None and variant_index not in indexes:
            continue
        bindings.append({
            "consumerId": consumer["id"],
            "presentation": consumer.get("presentation", "mode-dispatch"),
            "staticBound": True,
            "runtimeObserved": "unverified",
        })
    issues = []
    if inventory_evidence["runtimeApproved"] is False and bindings:
        issues.append({
            "code": "consumer-scope-exceeds-inventory-approval-scope",
            "consumers": [binding["consumerId"] for binding in bindings],
        })
    return {
        "appearanceId": appearance_id,
        "variantIndex": variant_index,
        "role": role,
        "sourceIdentity": {
            "sourceAssetId": registry_asset.get("id"),
            "sourceAddressable": bool(registry_asset),
            "archive": registry_asset.get("archive", {}).get("name"),
            "archiveSha256": source_archive_sha,
            "blockId": manifest_component.get("blockId", manifest_component.get("blockIds", [None])[variant_index]
                                                   if role == "head" else None),
            "sourceSha256": source_sha,
            "registrySourceHashMatchesManifest": expected_source == source_sha,
        },
        "manifestDeclaredPackageAdmission": {
            "declared": True,
            "manifestPath": contract["sourceManifest"]["path"],
            "outputSha256": output_sha,
            "nativeSize": [manifest_component.get("nativeWidth"), manifest_component.get("nativeHeight")],
        },
        "packageIdentities": package,
        "consumerBindings": bindings,
        "runtimeObservation": "unverified",
        "frameRestyleAdmission": {"state": frame_admission["state"], "reason": frame_admission["reason"]},
        "inventoryEvidence": inventory_evidence,
        "issues": issues,
    }


def build_report_from_data(root: Path, contract: dict[str, Any], manifest: dict[str, Any],
                           registry: dict[str, Any], inventory: dict[str, Any],
                           policy: dict[str, Any], input_hashes: dict[str, str]) -> dict[str, Any]:
    manifest_path = Path(contract["sourceManifest"]["path"])
    appearance_sets = derive_appearance_sets(manifest, registry, manifest_path, source_root=root)
    frame_admissions = validate_restyle_admission_policy(manifest, policy)
    assets = {row["id"]: row for row in registry.get("assets", [])}
    report_components: list[dict[str, Any]] = []
    for appearance, derived in zip(manifest.get("appearances", []), appearance_sets, strict=True):
        by_role_and_variant = {
            (component["role"], variant["index"]): component
            for variant in derived["variants"] for component in variant["components"]
        }
        head = appearance["head"]
        body_frames = appearance["bodyFrames"]
        components: list[tuple[str, int, dict[str, Any]]] = []
        for index in range(2):
            components.append(("head", index, head))
            components.append(("body", index, body_frames[index]))
        for role, index, component in components:
            link = by_role_and_variant[(role, index)]
            asset = assets[link["assetId"]]
            report_components.append(build_component_report(root, contract, appearance["appearanceId"],
                                                            index, role, component, asset, inventory,
                                                            frame_admissions[(appearance["appearanceId"], index)]))

    distinct_pairs = {(row["sourceIdentity"]["sourceSha256"],
                       row["manifestDeclaredPackageAdmission"]["outputSha256"])
                      for row in report_components}
    distinct_packages = {part["packageId"] for row in report_components
                         for part in row["packageIdentities"].values()}
    runtime_packages = runtime_package_audit(root, contract, manifest, policy)
    counts = {
        "appearanceSets": len(appearance_sets),
        "acceptedTuples": sum(len(row["acceptedTuples"]) for row in appearance_sets),
        "componentRows": len(report_components),
        "distinctPackageIdentities": len(distinct_packages),
        "distinctSourceOutputPairs": len(distinct_pairs),
        "manifestDeclaredComponents": sum(row["manifestDeclaredPackageAdmission"]["declared"] for row in report_components),
        "staticConsumerBindings": sum(len(row["consumerBindings"]) for row in report_components),
        "runtimeObservedComponents": 0,
        "restyleAdmittedFrames": sum(row["state"] == "admitted" for row in frame_admissions.values()),
        "restyleHeldFrames": sum(row["state"] == "held" for row in frame_admissions.values()),
        "inventoryApprovedComponents": sum(row["inventoryEvidence"]["runtimeApproved"] is True for row in report_components),
        "inventoryUnapprovedComponents": sum(row["inventoryEvidence"]["runtimeApproved"] is False for row in report_components),
        "componentsWithIssues": sum(bool(row["issues"]) for row in report_components),
        "componentPackageSlotsMissing": sum(part["status"] == "missing" for row in report_components
                                             for part in row["packageIdentities"].values()),
        "componentPackageSlotsHashMismatch": sum(part["status"] == "hash-mismatch" for row in report_components
                                                  for part in row["packageIdentities"].values()),
        "runtimePackagePlanPaths": 20,
        "runtimePackageSourceFilesPresent": sum(row["sourceStatus"] == "hash-match"
                                                  for row in runtime_packages["plan"]),
        "runtimePackageSourceFilesMissing": sum(row["sourceStatus"] == "missing"
                                                 for row in runtime_packages["plan"]),
        "runtimePackageSourceFilesHashMismatch": sum(row["sourceStatus"] == "hash-mismatch"
                                                      for row in runtime_packages["plan"]),
        "heldRestyleOutputPaths": sum(frame["state"] == "held" for frame in frame_admissions.values()),
        "heldRestylePathsPresentInPublicSource": sum(row["sourceStatus"] == "present"
                                                       for row in runtime_packages["heldRestylePaths"]),
    }
    return {
        "schema": "cok-player-runtime-coverage-v1",
        "evidenceScope": "source-only static coverage; not browser/runtime observation",
        "inputs": input_hashes,
        "counts": counts,
        "runtimePackageAudit": runtime_packages,
        "components": report_components,
        "limitations": [
            "Source identity and a player manifest entry establish a declared exact package mapping, not visual review or runtime approval.",
            "Generated inventory approval, composition review, and prompt provenance are independent of manifest declarations.",
            "Frame Restyle admission is separately pinned; approval of individual source/output pairs does not admit a composed creator variant.",
            "A static source binding does not establish that the view rendered the component in an observed session.",
            "Component package-slot counts include repeated head rows and held Restyle declarations; runtimePackageAudit is the exact build roster.",
            "runtimePackageAudit checks the public source-tree mirror only; it does not prove a built package or runtime observation.",
            "Held Restyle paths are excluded from the runtime roster and the package builder removes those exact files from build output.",
            "Package paths are per-appearance identities; equal hashes do not merge their distinct package paths.",
        ],
    }


def build_report(root: Path, contract: dict[str, Any]) -> dict[str, Any]:
    manifest, registry, inventory, policy = verify_contract(root, contract)
    input_hashes = {
        "contractSha256": hashlib.sha256(json.dumps(contract, ensure_ascii=False, indent=2).encode("utf-8")).hexdigest(),
        "manifestSha256": text_digest_file(root, contract["sourceManifest"]["path"]),
        "registrySha256": text_digest_file(root, contract["registryPath"]),
        "inventorySnapshotSha256": text_digest_file(root, contract["inventorySnapshot"]["path"]),
        "restyleAdmissionPolicySha256": text_digest_file(root, contract["restyleAdmissionPolicy"]["path"]),
        "restyleAdmissionResolverSha256": text_digest_file(root, contract["restyleAdmissionPolicy"]["resolverSource"]["path"]),
        "playerPackageBuilderSha256": text_digest_file(root, contract["restyleAdmissionPolicy"]["packageBuilderSource"]["path"]),
    }
    return build_report_from_data(root, contract, manifest, registry, inventory, policy, input_hashes)


def validate_report(report: dict[str, Any], policy: dict[str, Any], *,
                    root: Path | None = None, contract: dict[str, Any] | None = None) -> None:
    if report.get("schema") != "cok-player-runtime-coverage-v1":
        raise ValueError("unsupported player runtime coverage report schema")
    root = ROOT if root is None else root
    contract = read_json(root, CONTRACT_DEFAULT) if contract is None else contract
    manifest = read_json(root, contract["sourceManifest"]["path"])
    policy_rows = validate_restyle_admission_policy(manifest, policy)
    expected_policy_sha = text_digest_file(root, contract["restyleAdmissionPolicy"]["path"])
    if report.get("inputs", {}).get("restyleAdmissionPolicySha256") != expected_policy_sha:
        raise ValueError("report admission-policy hash differs from the currently pinned contract")
    components = report.get("components")
    if not isinstance(components, list) or not components:
        raise ValueError("components must be a non-empty array")
    pairs: set[tuple[str, int, str]] = set()
    frame_states: dict[tuple[str, int], dict[str, str]] = {}
    for component in components:
        identity = component.get("sourceIdentity", {})
        package = component.get("packageIdentities", {})
        admission = component.get("manifestDeclaredPackageAdmission", {})
        frame_admission = component.get("frameRestyleAdmission", {})
        inventory = component.get("inventoryEvidence", {})
        if not identity.get("sourceAddressable") or not identity.get("registrySourceHashMatchesManifest"):
            raise ValueError("component source identity is not addressable or hash-matched")
        if admission.get("declared") is not True:
            raise ValueError("component package admission must remain an explicit manifest declaration")
        if frame_admission.get("state") not in ("admitted", "held") or not isinstance(frame_admission.get("reason"), str) or not frame_admission["reason"].strip():
            raise ValueError("component frame Restyle admission is missing or invalid")
        frame_key = (component["appearanceId"], component["variantIndex"])
        expected_frame = policy_rows.get(frame_key)
        if expected_frame != frame_admission:
            raise ValueError("component frame Restyle admission differs from the pinned policy")
        prior_frame = frame_states.setdefault(frame_key, frame_admission)
        if prior_frame != frame_admission:
            raise ValueError("head/body components disagree on composed-frame Restyle admission")
        for kind in ("original", "restyle"):
            part = package.get(kind, {})
            if part.get("status") not in ("missing", "hash-match", "hash-mismatch"):
                raise ValueError(f"invalid {kind} package identity status")
            if not isinstance(part.get("packageId"), str) or not part["packageId"]:
                raise ValueError(f"invalid {kind} package identity")
            if part.get("expectedSha256") != (identity.get("sourceSha256") if kind == "original"
                                               else admission.get("outputSha256")):
                raise ValueError(f"{kind} package expected hash disagrees with the manifest identity")
            if part.get("status") == "hash-match" and part.get("actualSha256") != part.get("expectedSha256"):
                raise ValueError(f"{kind} package hash-match is inconsistent")
            if part.get("status") == "missing" and part.get("actualSha256") is not None:
                raise ValueError(f"missing {kind} package must not report an actual hash")
            if part.get("status") == "hash-mismatch" and part.get("actualSha256") in (None, part.get("expectedSha256")):
                raise ValueError(f"{kind} package hash-mismatch is inconsistent")
        if component.get("runtimeObservation") != "unverified":
            raise ValueError("source-only report cannot claim runtime observation")
        if inventory.get("runtimeApproved") not in (True, False, None):
            raise ValueError("inventory approval must be an independent tri-state value")
        approval_evidence = inventory.get("runtimeApprovalEvidence", [])
        if inventory.get("status") not in ("matched", "unmatched"):
            raise ValueError("inventory pair match status is invalid")
        if inventory.get("status") == "unmatched" and (inventory.get("assetId") is not None
                or inventory.get("runtimeApproved") is not None or approval_evidence):
            raise ValueError("unmatched inventory pair cannot carry an inventory approval identity")
        if inventory.get("status") == "matched" and inventory.get("runtimeApproved") != bool(approval_evidence):
            raise ValueError("inventory runtime approval does not agree with its exact approval evidence")
        if inventory.get("promptReferenceCount", 0) < 0 or (
            (inventory.get("promptReferenceCount", 0) > 0) != (inventory.get("promptStatus") == "referenced")
        ):
            raise ValueError("prompt status does not agree with exact prompt-reference count")
        key = (component["appearanceId"], component["variantIndex"], component["role"])
        if key in pairs:
            raise ValueError("duplicate appearance component identity")
        pairs.add(key)
        for binding in component.get("consumerBindings", []):
            if binding.get("runtimeObserved") != "unverified" or binding.get("staticBound") is not True:
                raise ValueError("consumer binding must distinguish static binding from unverified runtime")
        if inventory.get("runtimeApproved") is False and component.get("consumerBindings"):
            matching_issue = next((issue for issue in component.get("issues", [])
                                   if issue.get("code") == "consumer-scope-exceeds-inventory-approval-scope"), None)
            expected_consumers = [binding["consumerId"] for binding in component["consumerBindings"]]
            if matching_issue is None or matching_issue.get("consumers") != expected_consumers:
                raise ValueError("unapproved inventory pair with static consumers needs a scope issue")
        elif component.get("issues"):
            raise ValueError("an approval-scope issue requires an unapproved inventory pair and static consumers")
    counts = report.get("counts", {})
    if counts.get("componentRows") != len(components):
        raise ValueError("component count does not match report rows")
    if counts.get("restyleAdmittedFrames") != sum(frame["state"] == "admitted" for frame in frame_states.values()):
        raise ValueError("Restyle-admitted frame count does not match component rows")
    if counts.get("restyleHeldFrames") != sum(frame["state"] == "held" for frame in frame_states.values()):
        raise ValueError("Restyle-held frame count does not match component rows")
    expected_packages = {part.get("packageId") for component in components
                         for part in component.get("packageIdentities", {}).values()}
    expected_pairs = {(component["sourceIdentity"]["sourceSha256"],
                       component["manifestDeclaredPackageAdmission"]["outputSha256"])
                      for component in components}
    if counts.get("distinctPackageIdentities") != len(expected_packages):
        raise ValueError("distinct package identity count does not match package paths")
    if counts.get("distinctSourceOutputPairs") != len(expected_pairs):
        raise ValueError("distinct source/output pair count does not match component rows")
    expected_bindings = sum(len(component.get("consumerBindings", [])) for component in components)
    if counts.get("staticConsumerBindings") != expected_bindings:
        raise ValueError("static consumer binding count does not match component rows")
    if counts.get("manifestDeclaredComponents") != sum(
        component["manifestDeclaredPackageAdmission"]["declared"] is True for component in components
    ):
        raise ValueError("manifest declaration count does not match component rows")
    if counts.get("inventoryApprovedComponents") != sum(
        component["inventoryEvidence"]["runtimeApproved"] is True for component in components
    ) or counts.get("inventoryUnapprovedComponents") != sum(
        component["inventoryEvidence"]["runtimeApproved"] is False for component in components
    ):
        raise ValueError("inventory approval counts do not match component rows")
    if counts.get("componentsWithIssues") != sum(bool(component.get("issues")) for component in components):
        raise ValueError("issue count does not match component rows")
    package_parts = [part for component in components for part in component["packageIdentities"].values()]
    if counts.get("componentPackageSlotsMissing") != sum(part["status"] == "missing" for part in package_parts):
        raise ValueError("missing component package-slot count does not match component rows")
    if counts.get("componentPackageSlotsHashMismatch") != sum(part["status"] == "hash-mismatch" for part in package_parts):
        raise ValueError("component package-slot hash-mismatch count does not match component rows")
    package_audit = report.get("runtimePackageAudit", {})
    plan = package_audit.get("plan", [])
    held_paths = package_audit.get("heldRestylePaths", [])
    if counts.get("runtimePackagePlanPaths") != 20 or len(plan) != 20 \
            or len({row.get("packageId") for row in plan}) != 20:
        raise ValueError("runtime package audit must account for the exact 20-path build plan")
    for row in plan:
        status = row.get("sourceStatus")
        if status not in ("missing", "hash-match", "hash-mismatch"):
            raise ValueError("runtime package source status is invalid")
        if status == "missing" and row.get("actualSha256") is not None:
            raise ValueError("missing runtime package source must not report a hash")
        if status == "hash-match" and row.get("actualSha256") != row.get("expectedSha256"):
            raise ValueError("runtime package source hash-match is inconsistent")
        if status == "hash-mismatch" and row.get("actualSha256") in (None, row.get("expectedSha256")):
            raise ValueError("runtime package source hash-mismatch is inconsistent")
    if counts.get("runtimePackageSourceFilesPresent") != sum(row["sourceStatus"] == "hash-match" for row in plan) \
            or counts.get("runtimePackageSourceFilesMissing") != sum(row["sourceStatus"] == "missing" for row in plan) \
            or counts.get("runtimePackageSourceFilesHashMismatch") != sum(row["sourceStatus"] == "hash-mismatch" for row in plan):
        raise ValueError("runtime package source counts do not match the exact plan")
    if len(held_paths) != counts.get("heldRestyleOutputPaths") \
            or counts.get("heldRestylePathsPresentInPublicSource") != sum(row.get("sourceStatus") == "present" for row in held_paths) \
            or any(row.get("buildOutputPolicy") != "removed-if-present-by-player-package-builder" for row in held_paths):
        raise ValueError("held Restyle output audit differs from the pinned build policy")
    if counts.get("runtimeObservedComponents") != 0:
        raise ValueError("source-only report cannot count runtime-observed components")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--contract", type=Path, default=CONTRACT_DEFAULT)
    parser.add_argument("--output", type=Path, default=REPORT_DEFAULT)
    parser.add_argument("--write", action="store_true", help="write the deterministic report; default is read-only")
    parser.add_argument("--check", action="store_true", help="compare the existing report to a fresh deterministic build")
    args = parser.parse_args()
    root = args.root.resolve()
    contract = read_json(root, args.contract)
    report = build_report(root, contract)
    validate_report(report, read_json(root, contract["restyleAdmissionPolicy"]["path"]),
                    root=root, contract=contract)
    output = root / args.output
    if args.check:
        existing = json.loads(output.read_text(encoding="utf-8"))
        if existing != report:
            raise ValueError(f"generated report differs: {args.output}")
    elif args.write:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"components": report["counts"]["componentRows"],
                      "bindings": report["counts"]["staticConsumerBindings"],
                      "issues": report["counts"]["componentsWithIssues"], "write": args.write,
                      "check": args.check}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
