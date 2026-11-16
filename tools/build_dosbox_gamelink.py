"""Build an isolated DOSBox-X candidate with mode-change-safe GameLink releases.

Requires VS2022 C++/Windows SDK and MSBuild. Never replaces an installed emulator.
The work directory must be new; --archive permits an already downloaded pinned zip.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request
import zipfile

TAG = "dosbox-x-v2026.07.02"
URL = f"https://codeload.github.com/joncampbell123/dosbox-x/zip/refs/tags/{TAG}"
ARCHIVE_SHA = "2451af53717e31138b990e60706d23f61684077be699ac7ad51c903d208d15a0"
SOURCE_SHA = "5405b8403d10a72250f90a9de46d6113323606dfeed127e3774caddaeee21cca"
PATCHED_SHA = "165a496d56f1db42564104004a5c8ceb6c920d17f39ffef69f3d29d0f337c348"
OLD_LINE = b"    memset(&sdl.gamelink.input_prev, 0, sizeof(GameLink::sSharedMMapInput_R2));\n"
NEW_LINE = b"    // Keep injected key/button history across video/tracking reinitialization.\n"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def patch_source(data: bytes) -> bytes:
    if sha(data) != SOURCE_SHA or data.count(OLD_LINE) != 1:
        raise ValueError("Unexpected upstream GameLink source; refusing patch")
    result = data.replace(OLD_LINE, NEW_LINE)
    if sha(result) != PATCHED_SHA:
        raise ValueError("Unexpected patched source")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--msbuild", type=Path, required=True)
    args = parser.parse_args()
    if not args.msbuild.is_file():
        parser.error("MSBuild executable is missing")
    work = args.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=False)
    archive = work / f"{TAG}.zip"
    if args.archive:
        archive.write_bytes(args.archive.read_bytes())
    else:
        urllib.request.urlretrieve(URL, archive)
    if sha(archive.read_bytes()) != ARCHIVE_SHA:
        raise ValueError("Unexpected exact-tag archive hash")
    with zipfile.ZipFile(archive) as package:
        for member in package.infolist():
            target = (work / member.filename).resolve()
            if not target.is_relative_to(work):
                raise ValueError("Archive path escapes work directory")
        package.extractall(work)
    source = work / f"dosbox-x-{TAG}"
    cpp = source / "src/output/output_gamelink.cpp"
    pristine = cpp.read_bytes()
    (work / "output_gamelink-pristine.cpp").write_bytes(pristine)
    cpp.write_bytes(patch_source(pristine))
    command = [str(args.msbuild), str(source / "vs/dosbox-x.sln"), "/m:4",
               "/p:Configuration=Release SDL2", "/p:Platform=x64",
               "/p:PlatformToolset=v143", "/p:WindowsTargetPlatformVersion=10.0",
               "/verbosity:minimal"]
    with (work / "build.log").open("wb") as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
    exe = source / "bin/x64/Release SDL2/dosbox-x.exe"
    result = {"tag": TAG, "archiveUrl": URL, "archiveSha256": ARCHIVE_SHA,
              "sourceSha256": SOURCE_SHA, "patchedSourceSha256": PATCHED_SHA,
              "buildCommand": command, "candidateExe": str(exe),
              "candidateSha256": sha(exe.read_bytes()), "buildExit": 0}
    (work / "manifest.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
