# Mode-change-safe GameLink candidate

DOSBox-X `dosbox-x-v2026.07.02` clears `input_prev` whenever graphics tracking
reinitializes, although the shared mapping and guest's pressed keys survive.
A key released across mode 13h to mode 3 can therefore remain pressed in the
guest. The one-line patch retains previous keyboard and mouse button states.
The process-global SDL object still starts with zero state in a new process.
No additional key edges are injected.

Build a separate candidate with VS2022 C++ tools, Windows SDK, and MSBuild:

```powershell
python tools/build_dosbox_gamelink.py --work-dir C:/temp/dosbox-gamelink-candidate --msbuild 'C:/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe'
```

The directory must be new. `--archive path.zip` can reuse the exact-tag download.
The recipe checks the archive, pristine source, and patched source hashes,
preserves pristine source, writes build.log and manifest.json, and never replaces
an installed emulator. Compiler/SDK variation can change the executable hash;
the manifest records the actual result. The equivalent minimal source diff is
[dosbox-gamelink-mode-change.patch](dosbox-gamelink-mode-change.patch).

For an explicit public launch, pass the resulting `candidateExe` path to
`native/run-goldbox.ps1 -DosBoxPath`. For hidden testing, pass it to the existing
`Start-DosBoxSmoke -Dosbox` helper. The candidate has not become the default tool.
Application acceptance must use ordinary GameLink input and the generated public
config, without supplemental key edges or guest-memory changes.

Task249's paired probe uses unchanged DOS INT 10h/16h/33h boundaries: ordinary
Enter switches 13h to 3, then polls keys/buttons. The old tool repeats Enter;
the candidate records it once, consumes a later distinct A once, keeps the BIOS
ring stable after release, and preserves mouse press/release across that same
mode change. Genuine game state is outside this transport probe.
