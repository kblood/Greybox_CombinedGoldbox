# Greybox Function ID (FID) database builder.
#
# Runs as a headless -postScript AFTER ghidra_import.py has populated the current
# program with a manifest's blocks and signature-seed functions. Creates (or reuses)
# a packed .fidb file and ingests every defined function in the current program into
# one FID library record, using Ghidra's own FidService -- the same API the GUI
# "Function ID -> Create/Populate FidDb" actions use. This produces a real compiled
# Function ID database, not a textual pattern file.
# @category Greybox
# @runtime Jython

from __future__ import print_function

import os

from java.io import File
from java.util import ArrayList

from ghidra.feature.fid.db import FidFileManager
from ghidra.feature.fid.service import FidService


def fail(message):
    raise RuntimeError("Greybox FID build: " + message)


args = getScriptArgs()
if len(args) != 4:
    fail(
        "usage: ghidra_fid_build.py <fidb-path> <library-family> "
        "<library-version> <library-variant>"
    )

fidb_path = os.path.abspath(args[0])
library_family = args[1]
library_version = args[2]
library_variant = args[3]

if currentProgram is None:
    fail("no program open -- run ghidra_import.py as a prior -postScript first")

manager = FidFileManager.getInstance()
fidb_file = File(fidb_path)
if not fidb_file.exists():
    manager.createNewFidDatabase(fidb_file)
fid_file = manager.addUserFidFile(fidb_file)
if fid_file is None:
    fail("could not open or create FID database at " + fidb_path)

fid_db = fid_file.getFidDB(True)
try:
    domain_files = ArrayList()
    domain_files.add(currentProgram.getDomainFile())
    service = FidService()
    language_id = currentProgram.getLanguageID()
    result = service.createNewLibraryFromPrograms(
        fid_db,
        library_family,
        library_version,
        library_variant,
        domain_files,
        None,
        language_id,
        None,
        None,
        monitor,
    )
    fid_db.saveDatabase("Greybox FID build", monitor)
    print(
        "Greybox FID build {0}:{1}:{2}: {3} attempted, {4} added, {5} excluded".format(
            library_family,
            library_version,
            library_variant,
            result.getTotalAttempted(),
            result.getTotalAdded(),
            result.getTotalExcluded(),
        )
    )
    failures = result.getFailures()
    keys = failures.keySet()
    iterator = keys.iterator()
    while iterator.hasNext():
        key = iterator.next()
        print("  exclusion {0}: {1}".format(key, failures.get(key)))
finally:
    fid_db.close()
