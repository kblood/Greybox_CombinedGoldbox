"""Round-34 R5: self-contradiction audit for `tools/goldbox_capabilities.json`.

`tools/docs_numeric_claims.py` (round 31's R5) pins numeric/status claims in four Markdown
docs via a curated `CONTRADICTION_PAIRS` registry. That idiom does not reach the capability
ledger at all: `tools/goldbox_capabilities.json` has 13 profiles and 109 `partial`/
`unsupported` capability rows, each carrying a `status`, a `detail` prose blob and a `gaps`
list, and nothing checks those three for internal consistency. A round can correct `detail`
and leave a `gaps` bullet -- or a sibling capability's own `detail` -- asserting the opposite,
and none of the 101 guard tests in `tools/test_goldbox_corpus.py` can see this class of bug.

Design, mirroring `docs_numeric_claims.py`'s two deliberate choices:

1. **Curated, subject-anchored patterns, not a bare polarity-word sweep.** A draft version of
   this module tried a generic "positive decode word in `detail`" vs "negative word in
   `gaps`" cross product (`decoded`/`no decoder`, `mapped`/`unmapped`, ...). It fired on
   `buck-rogers-countdown-to-doomsday`'s own map_container entry for the WRONG reason: the
   entry's `detail` proves GEO/WALLDEF decode, and gaps[0] separately says monster/item
   records are "GENUINELY UNMAPPED" -- both true, about DIFFERENT sub-families of the same
   capability, not a contradiction. It also flagged the CoK audio entry's own self-correcting
   "RESOLVED: ... previously 'UNLOCATED' ..." bullet, which quotes the stale claim in the
   course of retracting it. Every pattern below is instead anchored to the concrete shape of
   a real, reproducible sentence family, the same way `docs_numeric_claims.CONTRADICTION_PAIRS`
   names one concrete subject rather than sweeping "unrecoverable"/"recovered" project-wide.
2. **Precision over recall, adjudicated by hand.** `find_stale_claims` returns *candidates*;
   `tools/test_ledger_stale_claims.py` pins which of them are real (`KNOWN_STALE_LEDGER_CLAIMS`)
   the same way `test_docs_claims.py` pins `KNOWN_STALE_CLAIMS`. A pattern firing does not by
   itself mean the ledger is wrong -- see the CORRECTED-quote guard below.

Three patterns, each keyed to one concrete, reproducible sentence shape found in the ledger
at round 34's base commit (`4fc4533`):

- **P_FAMILY_LIST** -- a `gaps[]` bullet of the shape "``<A>/<B>/... container layouts for
  <title> have not been reverse-engineered ...``" where one or more of the slash-separated
  family names (`GEO`, `WALLDEF`, `ECL`) is independently proven decoded by the SAME
  capability's own `detail` (a "100%"/"decode(s)" sentence naming that family). The bullet is
  flagged with exactly the families it wrongly denies, so the fix is a narrowing (drop the
  decoded families from the "not reverse-engineered" list; keep the ones that still are).
- **P_STATUS_STALE** -- `status == "unsupported"` while `detail` carries a dated
  `CORRECTED <date>` or `UPDATED <date>` marker together with decode-success language
  (`100%`, `now DECODED`, `fully decoded`, `byte-decoded`). A correction that upgrades the
  prose but not the status is exactly what round 33 did to
  `buck-rogers-matrix-cubed.map_container`.
- **P_CROSS_CAPABILITY_DISASSEMBLY** -- a capability OTHER than `ecl` whose `detail` (or a
  `gaps[]` bullet) says a title's ECL corpus "has not (even) been disassembled", while the
  SAME profile's own `ecl` capability's `detail` independently proves disassembly (mentions
  a named dialect table, a dispatch map, or "disassembles"/"clean ... EXIT"). This is a
  same-profile, cross-capability check, not a within-entry one -- `map_container`'s own gaps
  list already contains the identical false claim, self-corrected in place (see the guard
  below); `quests` carries the uncorrected copy.

**CORRECTED-quote guard**: a bullet that contains the literal marker ``CORRECTED`` earlier in
its own text than the matched phrase, with the matched phrase itself appearing inside a
quoted span (``'...'`` or ``"..."``), is a bullet quoting an old, already-retracted claim in
the course of correcting it -- not a live assertion. `docs/engine/PLAN-ROUND-34.md`'s R5
section names this shape explicitly ("this gap said X, which was false") and requires the
detector to stay silent on it; `_is_guarded_by_correction` implements the check and
`tools/test_ledger_stale_claims.py` plants both a real hit and this exact shape to prove the
guard fires only on the latter.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CAPABILITIES_JSON = REPO_ROOT / "tools" / "goldbox_capabilities.json"

Capability = dict[str, Any]
Profile = dict[str, Any]

# ---------------------------------------------------------------------------
# The CORRECTED-quote guard
# ---------------------------------------------------------------------------

_CORRECTED_MARKER = re.compile(r"\bCORRECTED\b")
# A quoted span is `'...'` or `"..."` not crossing a sentence boundary (`.` followed by a
# space+capital), which is enough to catch both the real ledger idiom ('have not been
# reverse-engineered') and a plain double-quoted phrase without reaching across bullets.
_QUOTED_SPAN = re.compile(r"'[^'\n]{3,160}'|\"[^\"\n]{3,160}\"")


def _is_guarded_by_correction(text: str, match_start: int, match_end: int) -> bool:
    """True if the match at ``text[match_start:match_end]`` sits inside a quoted span in a
    bullet that also contains ``CORRECTED`` before the quote -- the "quotes an old claim in
    the course of correcting it" shape, which must NOT be flagged as a live contradiction."""
    corrected = _CORRECTED_MARKER.search(text)
    if not corrected or corrected.start() >= match_start:
        return False
    for qm in _QUOTED_SPAN.finditer(text):
        if qm.start() <= match_start and match_end <= qm.end():
            return True
    return False


_NEGATION_NEARBY = re.compile(r"\b(?:no|not|never|n't)\s+$", re.IGNORECASE)


def _is_negated_immediately_before(text: str, match_start: int, window: int = 12) -> bool:
    """True if a negation word sits directly before the match (within ``window`` chars),
    e.g. "no dispatch map exists" -- a proof-phrase regex must not treat a NEGATED mention of
    its own proof phrase as proof. Guards `_DISASSEMBLY_PROOF` and `_FAMILY_DECODE_PROOF`
    against exactly the kind of sentence this project writes a lot of ("X has NOT been
    decoded", "no dispatch map"), even though no live ledger sentence triggers it today."""
    return bool(_NEGATION_NEARBY.search(text[max(0, match_start - window):match_start]))


# ---------------------------------------------------------------------------
# Pattern 1: family-list "have not been reverse-engineered" vs a same-entry decode claim
# ---------------------------------------------------------------------------

_FAMILY_LIST_GAP = re.compile(
    r"([A-Za-z]+(?:/[A-Za-z]+)+)\s+container layouts for [^.]*?"
    r"have not been reverse-engineered",
    re.IGNORECASE,
)

# One anchored "this family decodes" sentence shape per known container family. Each is a
# real, quotable phrase this project actually writes when a family's decoder is proven, not
# a bare "decoded" keyword -- see the module docstring's point 1 for why that failed.
_FAMILY_DECODE_PROOF: dict[str, re.Pattern[str]] = {
    "GEO": re.compile(r"\bGEO\b[^.]{0,140}?(?:100%|decodes?\b)", re.IGNORECASE),
    "WALLDEF": re.compile(r"\bWALLDEF\b[^.]{0,140}?(?:100%|decodes?\b)", re.IGNORECASE),
    "ECL": re.compile(r"\bECL\b[^.]{0,160}?(?:carrying|magic|decodes?\b)", re.IGNORECASE),
}


@dataclass(frozen=True)
class StaleClaim:
    profile_id: str
    capability: str
    pattern: str
    message: str
    evidence: str


def _find_family_list_claims(profile_id: str, capability_key: str, cap: Capability) -> list[StaleClaim]:
    detail = cap.get("detail", "") or ""
    gaps = cap.get("gaps", []) or []
    out: list[StaleClaim] = []
    for gap in gaps:
        m = _FAMILY_LIST_GAP.search(gap)
        if not m:
            continue
        if _is_guarded_by_correction(gap, m.start(), m.end()):
            continue
        families = [f.strip() for f in m.group(1).split("/")]
        contradicted = []
        for f in families:
            proof_re = _FAMILY_DECODE_PROOF.get(f.upper())
            if not proof_re:
                continue
            proof_m = proof_re.search(detail)
            if proof_m and not _is_negated_immediately_before(detail, proof_m.start()):
                contradicted.append(f)
        if contradicted:
            still_true = [f for f in families if f not in contradicted]
            out.append(
                StaleClaim(
                    profile_id=profile_id,
                    capability=capability_key,
                    pattern="P_FAMILY_LIST",
                    message=(
                        f"gaps bullet denies {families} are reverse-engineered, but detail "
                        f"proves {contradicted} decoded (still genuinely true: {still_true})"
                    ),
                    evidence=gap[:220],
                )
            )
    return out


# ---------------------------------------------------------------------------
# Pattern 2: status stays "unsupported" despite a dated correction claiming decode success
# ---------------------------------------------------------------------------

_CORRECTION_DATE_MARKER = re.compile(r"\b(?:CORRECTED|UPDATED)\s+20\d\d-\d\d-\d\d\b")
_DECODE_SUCCESS = re.compile(
    r"100%|byte-decoded|fully decoded|now DECODED|now decodes", re.IGNORECASE
)


def _find_status_stale_claims(profile_id: str, capability_key: str, cap: Capability) -> list[StaleClaim]:
    if cap.get("status") != "unsupported":
        return []
    detail = cap.get("detail", "") or ""
    marker = _CORRECTION_DATE_MARKER.search(detail)
    if not marker:
        return []
    success_m = _DECODE_SUCCESS.search(detail)
    if not success_m or _is_negated_immediately_before(detail, success_m.start()):
        return []
    return [
        StaleClaim(
            profile_id=profile_id,
            capability=capability_key,
            pattern="P_STATUS_STALE",
            message=(
                f"status is 'unsupported' but detail carries a dated correction "
                f"({marker.group(0)}) with decode-success language"
            ),
            evidence=detail[:220],
        )
    ]


# ---------------------------------------------------------------------------
# Pattern 3: a sibling capability's "ECL corpus has not been disassembled" contradicted by
# the profile's OWN `ecl` capability entry
# ---------------------------------------------------------------------------

_DISASSEMBLY_DENIAL = re.compile(r"has not (?:even )?been disassembled", re.IGNORECASE)
_DISASSEMBLY_PROOF = re.compile(
    r"disassembl|ECL_GEN1|dispatch map|clean[^.]{0,15}EXIT", re.IGNORECASE
)


def _find_cross_capability_disassembly_claims(profile_id: str, capabilities: dict[str, Capability]) -> list[StaleClaim]:
    ecl_detail = (capabilities.get("ecl", {}) or {}).get("detail", "") or ""
    proof_m = _DISASSEMBLY_PROOF.search(ecl_detail)
    ecl_proven = bool(proof_m) and not _is_negated_immediately_before(ecl_detail, proof_m.start())
    out: list[StaleClaim] = []
    if not ecl_proven:
        return out
    for key, cap in capabilities.items():
        if key == "ecl":
            continue
        for field_name, text in (("detail", cap.get("detail", "") or ""), *[
            ("gaps", g) for g in (cap.get("gaps", []) or [])
        ]):
            m = _DISASSEMBLY_DENIAL.search(text)
            if not m:
                continue
            if _is_guarded_by_correction(text, m.start(), m.end()):
                continue
            out.append(
                StaleClaim(
                    profile_id=profile_id,
                    capability=key,
                    pattern="P_CROSS_CAPABILITY_DISASSEMBLY",
                    message=(
                        f"{key}.{field_name} denies the ECL corpus was disassembled, but this "
                        f"profile's own ecl entry proves disassembly"
                    ),
                    evidence=text[:220],
                )
            )
    return out


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def find_stale_claims_in_profiles(profiles: list[Profile]) -> list[StaleClaim]:
    """Pure function: profiles (the ledger's `profiles` list shape) -> candidate contradictions.
    Takes the already-parsed structure (not a path) so tests can hand it synthetic fixtures
    without touching the real ledger file."""
    out: list[StaleClaim] = []
    for profile in profiles:
        pid = profile.get("profile_id", "?")
        capabilities: dict[str, Capability] = profile.get("capabilities", {}) or {}
        for key, cap in capabilities.items():
            out.extend(_find_family_list_claims(pid, key, cap))
            out.extend(_find_status_stale_claims(pid, key, cap))
        out.extend(_find_cross_capability_disassembly_claims(pid, capabilities))
    return out


def load_ledger(path: Path = CAPABILITIES_JSON) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def find_stale_claims(path: Path = CAPABILITIES_JSON) -> list[StaleClaim]:
    data = load_ledger(path)
    return find_stale_claims_in_profiles(data.get("profiles", []))


def stale_claim_ids(claims: list[StaleClaim]) -> set[str]:
    """A stable identifier per claim, for the exact-set pinning idiom
    (`tools/test_ledger_stale_claims.py`'s `KNOWN_STALE_LEDGER_CLAIMS`)."""
    return {f"{c.profile_id}::{c.capability}::{c.pattern}" for c in claims}


if __name__ == "__main__":  # pragma: no cover - manual inspection helper
    claims = find_stale_claims()
    print(f"{len(claims)} candidate ledger self-contradiction(s):\n")
    for c in claims:
        print(f"[{c.pattern}] {c.profile_id} / {c.capability}")
        print(f"  {c.message}")
        print(f"  evidence: {c.evidence!r}\n")
