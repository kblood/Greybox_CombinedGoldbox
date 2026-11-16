# Initial image documentation coverage — 2026-11-06

The approximately 6,000 images are **5,592 PNG files**, not 5,592 distinct game
subjects. The candidate contains original and Restyle outputs, shared images,
animation frames and local runtime artwork. Its 2,542 generated comparison
records reuse files; counting records times two does not give a unique file count.

This is a metadata audit, not a review of image pixels or the truth of all prose.
The [JSON report](image-documentation-coverage-2026-11-06.json) records input
metadata hashes, category counts and unmatched paths. Reproduce it with:

```powershell
python tools/image_documentation_coverage.py --pack C:/GoldBoxImg/greybox-hosted-restyle-candidate-05c2ed8b/restyle --output docs/engine/research/image-documentation-coverage-2026-11-06.json
python tools/test_image_documentation_coverage.py
```

## Package contents

| Directory | PNG files |
| --- | ---: |
| cok-generated | 5,029 |
| cok | 341 |
| orig | 75 |
| out | 75 |
| anim | 72 |
| Total | 5,592 |

## File coverage from the audited metadata

Categories overlap. A source description is not automatically a description of
its generated output. Declared hashes were joined without reading PNG bytes.

| Measure | Unique PNG files |
| --- | ---: |
| Referenced by audited comparison/animation manifest paths | 5,062 |
| Have a hash recorded in those manifest paths | 4,912 |
| Have provenance text in generated/curated records | 4,990 |
| Match registry source hash and have a visual description | 2,316 |
| Match registry Restyle output hash | 2,540 |
| Match a source with a non-unknown consumer record | 436 |
| Carry a generated-manifest runtime-approval assertion | 188 |
| Have generated-manifest prompt references | 4 |
| Match a Restyle registry output with a prompt hash | 3 |

The 530 unmatched paths consist of all 341 `cok/` files plus 189
`cok-generated/` files. This does **not** prove they are undocumented: runtime
manifests, held/external-comparison records and other metadata need a broader
join. The report names every unmatched path for follow-up.

## Source registry coverage is a different denominator

The CoK registry has 6,067 source identities and 2,597 Restyle records. All 6,067
identities have nonempty visual-description fields. However, their main
identity/usage descriptions are 5,420 unknown, 554 partial and 93 verified.
Only 623 source identities have a consumer record whose status is not unknown.
Those statuses are existing assertions, not independently reverified findings.

The DoK registry has 2,614 source identities, 691 with visual descriptions, no
Restyle records and 2,614 unknown main descriptions. Other games were not joined
to their own registries in this initial pass; missing joins must not be reported
as missing documentation for those games.

## Assessment and next work

Pixel-level prose and hash identities are extensive for CoK. Game meaning,
consumer selection, animation semantics, prompt lineage and runtime admission
are less complete. The low prompt-reference counts specifically describe the
audited manifests/registry fields; external prompt files and ledgers may contain
additional evidence.

Next join the 530 unmatched files to runtime and held records, inspect external
prompt ledgers, and sample the visual prose against its evidence to assess
quality. Produce separate measures for file coverage, source identity, visible
content, game usage, and generated-image provenance. Do not publish a single
percentage implying all those questions are answered.

The synthetic audit test passes and checks duplicate reference counting, absent
decoded metadata, unknown consumers, and rejection of any PNG file read. No game
runtime, browser, package build or deployment was run.
