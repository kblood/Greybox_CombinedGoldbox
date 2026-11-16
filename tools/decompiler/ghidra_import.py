# Greybox manifest importer for Ghidra's Python/Jython script environment.
# @category Greybox
# @runtime Jython

from __future__ import print_function

import hashlib
import io
import json
import os
from java.io import ByteArrayInputStream, RandomAccessFile
from jarray import zeros
from ghidra.program.model.symbol import RefType, SourceType
from ghidra.program.model.listing import CodeUnit


SCHEMA = "greybox-decompiler-inputs-v1"


def fail(message):
    raise RuntimeError("Greybox import: " + message)


def file_sha256(path):
    digest = hashlib.sha256()
    stream = io.open(path, "rb")
    try:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    finally:
        stream.close()
    return digest.hexdigest()


def source_paths(manifest, source_dir):
    wanted = {}
    for source in manifest["source_files"]:
        wanted.setdefault(source["filename"].lower(), []).append(source)
    resolved = {}
    for root, _dirs, files in os.walk(source_dir):
        for filename in files:
            candidates = wanted.get(filename.lower(), [])
            if not candidates:
                continue
            path = os.path.join(root, filename)
            digest = file_sha256(path)
            for source in candidates:
                if digest == source["sha256"]:
                    resolved[source["id"]] = path
    missing = [source["id"] for source in manifest["source_files"] if source["id"] not in resolved]
    if missing:
        fail("missing source hashes under {0}: {1}".format(source_dir, ", ".join(missing)))
    return resolved


def read_range(path, offset, size):
    handle = RandomAccessFile(path, "r")
    try:
        handle.seek(offset)
        data = zeros(size, "b")
        handle.readFully(data)
        return data
    finally:
        handle.close()


args = getScriptArgs()
if len(args) != 2:
    fail("usage: ghidra_import.py <manifest.json> <source-directory>")

manifest_path = os.path.abspath(args[0])
source_dir = os.path.abspath(args[1])
with io.open(manifest_path, "r", encoding="utf-8") as stream:
    manifest = json.load(stream)
if manifest.get("schema") != SCHEMA:
    fail("unsupported manifest schema")
if currentProgram is None:
    fail("open a bootstrap program using x86:LE:16:Protected Mode before running this script")
language_id = str(currentProgram.getLanguageID())
if "x86:LE:16" not in language_id or "Protected Mode" not in language_id:
    fail("program language must be x86:LE:16:Protected Mode, got " + language_id)

resolved_sources = source_paths(manifest, source_dir)
memory = currentProgram.getMemory()
space = currentProgram.getAddressFactory().getDefaultAddressSpace()
blocks = {}
for row in manifest["blocks"]:
    if row["size"] == 0:
        # A genuinely empty descriptor slot (e.g. an unused RTLink overlay entry) has
        # no bytes to import and no valid address range of its own. Ghidra's memory
        # API rejects zero-length blocks outright, so record the row for bookkeeping
        # and skip creating memory for it. Nothing in calls/symbols/signature_seeds
        # may target this block's synthetic_address -- that invariant is enforced by
        # export_decompiler_inputs.py, not re-checked here.
        blocks[row["id"]] = row
        continue
    start = space.getAddress(row["synthetic_address"])
    end = start.add(row["size"] - 1)
    for existing in memory.getBlocks():
        if existing.getStart().compareTo(end) <= 0 and existing.getEnd().compareTo(start) >= 0:
            fail("memory collision at block " + row["id"])
    data = read_range(
        resolved_sources[row["source_id"]],
        row["source_file_offset"],
        row["size"],
    )
    block = memory.createInitializedBlock(
        row["name"], start, ByteArrayInputStream(data), row["size"], monitor, False
    )
    block.setRead("r" in row["permissions"])
    block.setWrite("w" in row["permissions"])
    block.setExecute("x" in row["permissions"])
    blocks[row["id"]] = row

symbol_table = currentProgram.getSymbolTable()
for row in manifest.get("signature_seeds", []):
    address = space.getAddress(row["synthetic_address"])
    disassemble(address)
    function = getFunctionAt(address)
    if function is None:
        function = createFunction(address, row["name"])
    elif function.getName().startswith("FUN_"):
        function.setName(row["name"], SourceType.IMPORTED)
for row in manifest["symbols"]:
    address = space.getAddress(row["synthetic_address"])
    symbol_table.createLabel(address, row["name"], SourceType.IMPORTED)
for row in manifest.get("candidate_symbols", []):
    address = space.getAddress(row["synthetic_address"])
    disassemble(address)
    function = getFunctionAt(address)
    if function is None:
        function = createFunction(address, row["name"])
    else:
        function.setName(row["name"], SourceType.IMPORTED)
    currentProgram.getListing().setComment(
        address,
        CodeUnit.PLATE_COMMENT,
        "CANDIDATE ONLY: {0}\n{1}".format(row["provenance"], row["claim_boundary"]),
    )

reference_manager = currentProgram.getReferenceManager()
for row in manifest["calls"]:
    if row.get("target_synthetic_address") is None:
        continue
    source = space.getAddress(row["source_synthetic_address"])
    target = space.getAddress(row["target_synthetic_address"])
    disassemble(source)
    reference_manager.addMemoryReference(
        source, target, RefType.UNCONDITIONAL_CALL, SourceType.IMPORTED, 0
    )

entry = space.getAddress(manifest["entry_point"]["synthetic_address"])
symbol_table.createLabel(entry, "greybox_entry", SourceType.IMPORTED)
symbol_table.addExternalEntryPoint(entry)
disassemble(entry)
print("Greybox imported {0}: {1} blocks, {2} resolved calls, {3} symbols, {4} candidates".format(
    manifest["profile_id"],
    len(manifest["blocks"]),
    manifest["statistics"]["resolved_calls"],
    len(manifest["symbols"]),
    len(manifest.get("candidate_symbols", [])),
))
