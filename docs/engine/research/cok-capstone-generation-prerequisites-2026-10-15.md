# Capstone acquisition evidence and later generation prerequisites

Read-only local source/log/hash review,2026-10-15. No imports, decoding, downloads,
builds or execution authorization.

## Located evidence

Existing package root:
`build/cok-recomp/world-persistence-sol-candidate-20261015-a/luna-controls-20261015-a/python-packages`.
Its sibling `capstone-install.log` records pip installing capstone==5.0.7;
`capstone-wheel-download.log` records a cached wheel download into `wheelhouse`.
`commands-and-exits.txt` records those commands with exit0. These are historical
logs/summaries, not a newly observed acquisition or authenticated publisher receipt.

Fresh read-only SHA256 results:

| Artifact | SHA256 |
|---|---|
|wheelhouse/capstone-5.0.7-py3-none-win_amd64.whl (1272204B)|4ab8bcb7da8f221ff45926ca168ca33e76f7237d06fbf3c10780002faa2670e1|
|python-packages/capstone/__init__.py|0417ae554252be8e8d03e328054fad4c3cec6cf4895deecec637078380840f8b|
|python-packages/capstone/lib/capstone.dll|46b7c385efe50db4def8aa99aa351c44ea28b1f3c2ccbc4ca41dbb2a02340e39|
|capstone-install.log|d047c1573d7c7a0e393fd2c4b762d1454a4f50b1320590cdb8c5c2a8ba6ab594|
|capstone-wheel-download.log|74a187430e7056ea99fa6c058966cb2d624e70e7ae347dcd4df2bbbf20ab23ab|
|commands-and-exits.txt|ed9d461a7675199e76f0a09b8d55bb47729ca2c9986ec81da0d8688669b05a4b|
|build/cok-recomp-tools/venv/Scripts/python.exe|200d001707ed494066ef00e31e38330e32490c2a74a450ca5d66d2179396fd0e|

Local dist-info says Version5.0.7, INSTALLER=pip and wheel tag
py3-none-win_amd64. No direct_url.json is present there. The found pip logs do
not record index URL, exact download URL, publisher signature/attestation or an
independently authenticated release digest. METADATA author/homepage and the
previous64-file RECORD match are self-contained package claims/consistency.
They do not establish publisher authenticity. No such authenticity was verified
in this review. The retained wheel makes a later independent archive-to-installed
byte comparison possible without installation or network access.

Prior View-v3 import evidence is retained under
`build/rea/rea-view-host-guard-v3-luna-20261015-a-preflight` and described in
`cok-view-host-guard-validation-2026-10-15.md`. It selected this package through
child PYTHONPATH after discovering the venv default was5.0.9. That historical
selection must not be confused with changing the venv or proving a future load.
The earlier world execution summary says venv5.0.7; it is historical, not the
current venv selection. LIBCAPSTONE_PATH was not captured in that later review.

## Independent package-index comparison

Root subsequently read the official [PyPI5.0.7 release-file details](https://pypi.org/project/capstone/5.0.7/#capstone-5.0.7-py3-none-win_amd64.whl)
through the web tool, without downloading or executing the wheel. PyPI lists
SHA256 `4ab8bcb7da8f221ff45926ca168ca33e76f7237d06fbf3c10780002faa2670e1`
for `capstone-5.0.7-py3-none-win_amd64.whl`, matching the retained archive.
It reports upload2026-02-09 via twine6.1.0 and Trusted Publishing=No.
This adds independent agreement with the package index's published digest;
it does not establish a signed publisher attestation, Microsoft malware
clearance or a clean-machine verdict. No package installation or security
setting was changed. The archive-to-installed comparison and actual selected
module/native DLL checks below remain prerequisites before decoding.

## Minimal later gate requirements

1. Root explicitly reviews reuse of this exact retained wheel/package and its
   provenance limitation. If authenticated publisher origin is required, obtain
   independently trusted release evidence in a separately authorized read-only
   verification; local RECORD/log agreement cannot substitute for it. No download,
   reinstall, package fallback or security-setting change is authorized here.
2. Before the named PrepareOnly gate, pin candidate/entrypoint/original inputs,
   exact Python executable, selected package files and native DLL. Record the
   selected interpreter's base executable/runtime DLL and pyvenv.cfg identities
   as applicable; the venv launcher hash alone is not the complete interpreter.
   Compare wheel entries with selected installed source/DLL without importing
   package code, retaining explicit generated/installation-only file exceptions.
3. Record exact child cwd and environment, including absent versus set values of
   LIBCAPSTONE_PATH, PYTHONPATH, PYTHONHOME, PYTHONNOUSERSITE, PATH and relevant
   virtualenv/startup selection. Review .pth/sitecustomize/usercustomize exposure
   before import; no unknown startup module is silently accepted. Keep the venv
   unchanged. Select the reviewed package root explicitly and, if approved,
   LIBCAPSTONE_PATH explicitly as its absolute `capstone/lib` directory.
4. The reviewed import entrypoint must fail before decoding if the selected module
   path/hash or native-library path/hash differs. Record actual module file,
   distribution version, native engine version and loaded DLL path/hash in the
   same child that generates evidence. An explicit environment path alone does
   not prove actual loading: __init__.py tries LIBCAPSTONE_PATH first, then package
   resources/lib, filename/lib, current/global path, platlib and platform fallback.
   Missing/mismatched approved DLL must stop, not silently choose another copy.
   Pin and check the intended DLL before import and verify the actual load before
   any generation; do not rewrite the installed package to bypass its loader.
5. Preserve actual child PID, UTC, argv, raw output, exit and before/after pins.
   Separate successful prerequisite identity verification from successful
   PrepareOnly generation. Any OS5/security interference stops under the existing
   continuation policy; no alternative interpreter/path/encoding retry.

This prepares the prerequisite decision only. Pure/Rust gates, a fresh
PrepareOnly release and later native/runtime gates remain separately authorized.
