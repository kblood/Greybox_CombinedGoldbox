# Gold Box Runtime Probe CLI — design memo

## Repository facts

- [`tools/dosbox_gamelink.py`](../../../tools/dosbox_gamelink.py#L247) reads physical guest RAM through GameLink v4 and bounds reads against reported RAM size.
- Its [`poke`](../../../tools/dosbox_gamelink.py#L263) is already compare-and-swap-like: expected and replacement lengths must match; it aborts on an expected-byte mismatch and verifies bytes after writing. Operations are protected by the GameLink mutex.
- GameLink uses a global named mapping, so session contamination is possible. Existing probes explicitly reject foreign `dosbox-x.exe` processes, e.g. [`tools/trace_pool_ecl2_20_route_complete_v10.ps1`](../../../tools/trace_pool_ecl2_20_route_complete_v10.ps1#L102).
- Existing save patchers—including [`tools/patch_pool_save_pose.py`](../../../tools/patch_pool_save_pose.py#L34), [`tools/patch_pool_route_state.py`](../../../tools/patch_pool_route_state.py#L42), and [`tools/patch_secret_route_save.py`](../../../tools/patch_secret_route_save.py#L38)—hash-lock supported inputs, validate size/current fields, forbid in-place or existing outputs, verify exact changed offsets, and emit manifests with claim boundaries.
- [`tools/clone_pool_save_sidecars.py`](../../../tools/clone_pool_save_sidecars.py#L28) demonstrates that save bundles may require validated character sidecars.
- [`tools/inspect_pool_save.py`](../../../tools/inspect_pool_save.py#L32) is the current read-only save-inspection model.

## Proposed CLI (design inference)

Add one thin orchestrator, `tools/goldbox_runtime_probe.py`, reusing `GameLink`; do not generalize title-specific structure decoding initially.

```powershell
python tools/goldbox_runtime_probe.py checkpoint --region bios=0x400:0x100 --region state=0x24a00:0x200 --out run/pre
python tools/goldbox_runtime_probe.py checkpoint --same-as run/pre --out run/post
python tools/goldbox_runtime_probe.py diff run/pre run/post --out run/diff.json
python tools/goldbox_runtime_probe.py manifest verify run/pre/manifest.json

# Dry-run unless --apply is present
python tools/goldbox_runtime_probe.py memory patch --plan plans/pose.json
python tools/goldbox_runtime_probe.py memory patch --plan plans/pose.json --apply

python tools/goldbox_runtime_probe.py save patch-copy --source SAVGAMA.DAT `
  --output stage/SAVGAMA.DAT --plan plans/save-pose.json
```

`checkpoint` should capture only named ranges, never default to all RAM. `--same-as` fixes the region layout. Before memory writes, require exactly one `dosbox-x.exe`, matching `status.program`, RAM size, checkpoint fingerprint, and expected bytes. Permit one contiguous CAS hunk per invocation; this avoids misleading multi-hunk atomicity. `memory patch` should emit its own before/after checkpoint and audit manifest.

`save patch-copy` must remain output-only: source SHA-256 and size lock, per-hunk expected bytes, output-nonexistence check, temporary-file verification followed by atomic rename, exact changed-offset verification, and optional explicitly listed sidecar copies. Never infer sidecars or overwrite originals.

## Minimal schema

```json
{
  "schema_version": 1,
  "kind": "checkpoint|diff|memory_patch|save_patch",
  "created_utc": "...",
  "target": {"program": "...", "ram_size": 1048576, "dosbox_pid": 1234},
  "source": {"path": "...", "size": 13137, "sha256": "..."},
  "regions": [{
    "name": "state", "address": 150016, "length": 32,
    "sha256": "...", "blob": "regions/state.bin"
  }],
  "hunks": [{"offset_or_address": 12801, "expected": "0f", "replacement": "0e"}],
  "result": {"changed_offsets": [12801], "sha256": "..."},
  "claim_boundary": "Byte-level observation/edit only; no semantic claim."
}
```

Paths in manifests should be relative to the manifest directory; hashes cover every blob.

## Test plan

1. Unit-test range overflow, overlapping/duplicate names, schema rejection, hashes, deterministic diff runs, and corrupted blobs.
2. Use a fake GameLink backend to test wrong program/RAM size, multiple DOSBox processes, stale checkpoints, CAS mismatch, post-write mismatch, and absence of writes during dry-run.
3. Fixture-test save copying for wrong hash/size/current bytes, existing output, unexpected changed offsets, sidecar mismatch, and simulated interruption before rename.
4. Integration-test against a disposable DOSBox-X session: checkpoint stability, a reversible scratch-RAM CAS, deliberate stale-CAS rejection, and before/after audit verification.
5. Run existing title-specific patchers against known fixtures and confirm the generic patch plan produces byte-identical outputs and equivalent manifests.