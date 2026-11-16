/**
 * DQK copy-protection "journal-word" solver (E6.2b-4).
 *
 * `DQK.EXE` gates "Begin Adventuring" behind a manual-lookup check, randomized per boot:
 *
 *     <journal>, page (P)   what is word # N   after the heading <HEADING>   Enter _
 *
 * (the prompt strings live in `DQK.EXE` at file offset 0x6AC4A). The expected answer is simply
 * **word #N of the journal paragraph that immediately follows heading H** — verified against the
 * three positions GOG lists per heading in the bundled `Codes.pdf` answer key, e.g. page 11
 * "RUNNING AWAY" → "A character may flee from the battlefield…" → #3 may / #4 flee / #5 from, and
 * page 10 "SAVING THROWS" → "Attacks such as poison or spells…" → #2 such / #4 poison / #6 spells.
 *
 * This module is the **pure** core of the solver: given the player's OWN journal text (extracted
 * locally at capture time — never bundled; the PDFs are copyrighted GOG assets) plus a parsed
 * question, it returns the word to type. The DOSBox harness vision-reads the live prompt, calls
 * this, and types the answer. Nothing here reads files or embeds any journal content.
 */

/** A parsed copy-protection question (as vision-read from the live DQK prompt). */
export interface DqkProtectionQuestion {
  /** Journal page number (informational — the heading is what locates the text). */
  page?: number;
  /** The heading the word is counted after, e.g. "RUNNING AWAY" (case/space-insensitive). */
  heading: string;
  /** 1-based word number after the heading, e.g. 4. */
  wordNumber: number;
}

/**
 * Uppercase, collapse internal whitespace, strip anything but A–Z/0–9/space — for robust matching.
 * Maps the digit `0` to the letter `O` because the journal renders the only digit-bearing heading,
 * "THAC0", as "THACO" while the in-game prompt shows "THAC0"; no DQK heading uses a real zero.
 */
export function normalizeHeading(s: string): string {
  return s
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A line that is blank, a bare page number, or itself a short ALL-CAPS heading — skip when seeking a body. */
function isStructuralLine(line: string): boolean {
  const t = line.trim();
  if (t === '') return true;
  if (/^\d{1,3}$/.test(t)) return true; // bare page number from the two-column layout
  return false;
}

/**
 * True if `line` reads as a heading rather than body prose. `pdftotext -raw` emits one output line
 * per *physical* PDF line, so a multi-line body paragraph must be re-joined across lines (see
 * {@link bodyAfter}) — this tells the joiner where the paragraph ends. Headings in the real journal
 * (e.g. "After Combat", "The Moons of Krynn", "MAGIC", "Saving Throws") are short (<= 4 words)
 * and use Title Case or ALL CAPS, allowing the normal small title-case connector words; body prose
 * lines, even ones that start a new
 * sentence mid-paragraph ("If the entire party…"), always contain lowercase-led words elsewhere on
 * the line, so this heuristic does not false-positive on them (2026-07-18 live-run finding — see
 * docs/engine/research/cok-m4-fidelity-plan.md's addendum).
 */
function looksLikeHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // The retail DQK journal prints exactly this section heading in lowercase. Keep this narrow:
  // accepting arbitrary lowercase one-word lines would reintroduce prose-as-heading false matches.
  if (t === 'initiative') return true;
  const words = t.split(/\s+/);
  if (words.length === 0 || words.length > 4) return false;
  // `The Moons of Krynn` is a real DQK heading. PDF extraction retains its lowercase connector
  // "of", so treating *every* word as uppercase-led makes an exact live protection question
  // unsolvable. Keep the exception deliberately title-like rather than accepting arbitrary prose.
  const connectors = new Set(['of', 'the', 'and', 'in', 'to', 'for']);
  if (words.every((w, index) => /^[A-Z]/.test(w) || (index > 0 && connectors.has(w.toLowerCase())))) return true;
  // The player's locally extracted retail journal has one authenticated OCR defect:
  // `Preparation lips` for the heading "Preparation Tips". Permit one non-connector lowercase
  // tail only when every earlier word remains title-cased; ordinary prose cannot meet that shape.
  return /^[A-Z]/.test(words[0]!) && words.slice(0, -1).every((w) => /^[A-Z]/.test(w)) && /^[a-z]+$/.test(words.at(-1)!);
}

/** Safety bound on how many physical PDF lines one re-joined paragraph may span. */
const MAX_CONTINUATION_LINES = 20;

/**
 * The body paragraph after the heading occurrence starting at line index `i`, or null.
 *
 * `pdftotext -raw` emits one output line per *physical* PDF line, so a real journal paragraph
 * almost always spans several consecutive output lines, each ending mid-sentence (sometimes
 * mid-word, with a trailing hyphen from the PDF's own line-wrap). An earlier version of this
 * function returned only the FIRST such line, which silently truncated the word count whenever the
 * requested word number fell past that line's own word total — concretely, DQK's real Journal.pdf
 * heading "After Combat" has its word #9 on the SECOND physical line of the paragraph, not the
 * first (found live during the 2026-07-18 CoK M4 fidelity run; the existing unit tests never
 * caught this because their synthetic journal fixture only ever had one-line bodies).
 *
 * This now joins lines until a blank line, a new heading-looking line (see
 * {@link looksLikeHeadingLine}), or the safety bound is hit, re-joining a PDF line-wrap hyphen (a
 * trailing "-" glued directly to a word, e.g. "bod-" + "ies" -> "bodies") into one word instead of
 * leaving it as two separately-counted tokens.
 */
function bodyAfter(lines: string[], i: number): string | null {
  let start = -1;
  for (let j = i + 1; j < lines.length; j++) {
    if (isStructuralLine(lines[j])) continue;
    const words = journalWords(lines[j]);
    if (words.length >= 4) {
      start = j;
      break;
    }
    // A short non-structural line right after the heading is likely a wrapped heading tail
    // (e.g. "Wounded\nCharacters") — keep scanning for the real body.
  }
  if (start === -1) return null;

  const parts: string[] = [lines[start].trim()];
  for (let j = start + 1; j < lines.length && parts.length <= MAX_CONTINUATION_LINES; j++) {
    const raw = lines[j];
    if (isStructuralLine(raw)) break; // blank line / bare page number ends the paragraph
    if (looksLikeHeadingLine(raw)) break; // the next heading begins
    parts.push(raw.trim());
  }

  let joined = parts[0];
  for (let k = 1; k < parts.length; k++) {
    joined = /[A-Za-z]-$/.test(joined) ? joined.slice(0, -1) + parts[k] : `${joined} ${parts[k]}`;
  }
  return joined;
}

/**
 * Find the body paragraph that follows `heading` in `journalText` (one line per physical PDF line,
 * as `pdftotext -raw` emits — see {@link bodyAfter} for how multi-line paragraphs are re-joined).
 * Matches a line whose normalized text equals the normalized heading, then returns the paragraph
 * starting at the first following line that reads as real prose (≥ 4 words), skipping blank lines
 * and bare page numbers.
 *
 * A heading can appear more than once (e.g. once in the credits/contents and once in the rules
 * body). Disambiguation, strongest first: (1) if `answers` is given (the GOG `Codes.pdf` words for
 * this heading), the occurrence whose body actually contains one of those answer words wins;
 * (2) otherwise the **longest** body wins — rules paragraphs are long prose, while a same-named
 * credits/contents line is short. Returns `null` if the heading or any following body isn't found.
 */
export function journalParagraphFor(
  journalText: string,
  heading: string,
  answers?: readonly string[],
): string | null {
  const want = normalizeHeading(heading);
  if (!want) return null;
  const lines = journalText.split(/\r?\n/);
  const wantWords = (answers ?? []).map((a) => a.toLowerCase());
  let longest: string | null = null;
  let longestLen = -1;
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    // `normalizeHeading` deliberately strips punctuation for OCR tolerance, so a prose line
    // ending in a one-word topic (for example "... combat .") could otherwise masquerade as
    // the `COMBAT` heading.  Only a heading-shaped source line is a valid anchor.
    if (!looksLikeHeadingLine(lines[i]) || normalizeHeading(lines[i]) !== want) continue;
    const body = bodyAfter(lines, i);
    if (!body) continue;
    found = true;
    const words = journalWords(body);
    if (wantWords.length > 0) {
      const set = new Set(words.map((w) => w.toLowerCase()));
      if (wantWords.some((a) => set.has(a))) return body; // strongest signal — take it
    }
    // The real DQK rules entry for a topic can begin by repeating its heading (for example,
    // "Alignment\nAlignment is the philosophy...").  The table of contents has the same bare
    // heading but cannot satisfy this stronger local shape.  Prefer the repeated-heading prose
    // before the historical longest-paragraph fallback, which otherwise lets TOC spillover win.
    if (normalizeHeading(body).startsWith(`${want} `)) return body;
    if (words.length > longestLen) {
      longestLen = words.length;
      longest = body;
    }
  }
  if (found) return longest;

  // Fallback (2026-07-18, cok-m4-fidelity round 12, §20): DQK.EXE's own live protection prompt
  // can carry a genuine developer typo distinct from the journal's own (correctly-spelled)
  // heading -- live-observed on the retail "The Dark Queen of Krynn" GOG dir: the prompt reads
  // "DIETIES" while the journal's real heading is "Deities" (a transposed I/E, confirmed against
  // the raw screenshot, not an OCR/vision misread). Retry with a small adjacent-transposition-
  // tolerant match (restricted Damerau-Levenshtein distance <= 2) against every heading-looking
  // line. The extra one-edit allowance is needed only for the authenticated retail prompt
  // `PREPERATION TIPS` versus pdftotext's own `Preparation lips` OCR line; exact matches above
  // always win first, and this only fires when NONE were found at all.
  let bestLine: string | null = null;
  let bestDist = Infinity;
  for (const line of lines) {
    if (!looksLikeHeadingLine(line)) continue;
    const norm = normalizeHeading(line);
    if (!norm || Math.abs(norm.length - want.length) > 2) continue;
    const dist = restrictedDamerauLevenshtein2(want, norm);
    if (dist !== null && dist < bestDist) {
      bestDist = dist;
      bestLine = line;
    }
  }
  if (bestLine === null) return null;
  const idx = lines.indexOf(bestLine);
  return bodyAfter(lines, idx);
}

/**
 * Restricted Damerau-Levenshtein distance (substitutions, insertions, deletions, and adjacent
 * transpositions, each cost 1), capped at 2. Deliberately tiny/bounded (not a general string-
 * distance utility): this catches the two authenticated retail/PDF extraction variants while an
 * unbounded fuzzy search risks matching the WRONG heading. It only runs when exact lookup failed.
 */
function restrictedDamerauLevenshtein2(a: string, b: string): number | null {
  if (Math.abs(a.length - b.length) > 2) return null;
  const prev = Array.from({ length: b.length + 1 }, (_v, i) => i);
  let prior = prev.slice();
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = row[0];
    for (let j = 1; j <= b.length; j++) {
      const sub = prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      const del = prev[j]! + 1;
      const ins = row[j - 1]! + 1;
      let value = Math.min(sub, del, ins);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prior[j - 2]! + 1);
      }
      row.push(value); rowMin = Math.min(rowMin, value);
    }
    if (rowMin > 2) return null;
    prior = prev; prev.splice(0, prev.length, ...row);
  }
  return prev[b.length]! <= 2 ? prev[b.length]! : null;
}

/**
 * Split a paragraph into the words the protection counts: whitespace-delimited tokens with any
 * surrounding punctuation stripped, dropping tokens that were pure punctuation (e.g. the standalone
 * " . " that `pdftotext` inserts at sentence ends). Mirrors how the game counts printed words.
 */
export function journalWords(paragraph: string): string[] {
  return paragraph
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9]+$/, ''))
    .filter((w) => w.length > 0);
}

/**
 * Answer the protection: word #`wordNumber` (1-based) of the paragraph after `heading`. Returns the
 * bare word (no punctuation), or `null` if the heading/word can't be located. Case is preserved;
 * DQK's check is case-insensitive so the harness may type it verbatim.
 */
export function answerDqkProtection(
  journalText: string,
  q: DqkProtectionQuestion,
  answers?: readonly string[],
): string | null {
  if (!Number.isInteger(q.wordNumber) || q.wordNumber < 1) return null;
  const para = journalParagraphFor(journalText, q.heading, answers);
  if (!para) return null;
  const words = journalWords(para);
  return words[q.wordNumber - 1] ?? null;
}

/**
 * Parse the live DQK prompt text (as vision-read) into a question. Tolerant of OCR spacing/casing:
 * pulls "page (P)", "word # N", and the heading after "after the heading". Returns `null` if the
 * word number or heading can't be found.
 */
export function parseDqkProtectionPrompt(promptText: string): DqkProtectionQuestion | null {
  const flat = promptText.replace(/\s+/g, ' ').trim();
  const wordMatch = flat.match(/word\s*#?\s*(\d{1,3})/i);
  if (!wordMatch) return null;
  // The vision layer joins on-screen lines with "; ", so the heading is bracketed by separators:
  // "…AFTER THE HEADING; CHARACTER CLASSES; ENTER". Skip non-letters after "heading", then capture
  // the letters/spaces up to the next separator (";", "enter", or end).
  const headingMatch = flat.match(/after the heading[^A-Za-z0-9]*([A-Za-z][A-Za-z0-9 ]*?)\s*(?:;|\benter\b|[?.]|$)/i);
  if (!headingMatch) return null;
  const heading = headingMatch[1].trim();
  if (!heading) return null;
  const pageMatch = flat.match(/page\s*\(?\s*(\d{1,3})/i);
  return {
    heading,
    wordNumber: Number(wordMatch[1]),
    ...(pageMatch ? { page: Number(pageMatch[1]) } : {}),
  };
}

/**
 * Best-effort parse of the GOG `Codes.pdf` answer key into `normalizedHeading -> answers[]` (the
 * up-to-three answer words listed per heading, in word-number order). Used only as a soft
 * cross-check — the table is a two-column interleaved layout, so this is lenient and may miss rows;
 * the authoritative answer is {@link answerDqkProtection} counting the journal directly.
 */
export function parseDqkCodes(codesText: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let current: string | null = null;
  for (const raw of codesText.split(/\r?\n/)) {
    // Drop a leading page number (it repeats on continuation rows), then keep only Capitalized words.
    const rest = raw.replace(/\t/g, ' ').replace(/^\s*\d{1,3}\s+/, ' ');
    const words = rest.match(/\b[A-Z][A-Za-z]+\b/g);
    if (!words || words.length === 0) continue;
    if (words.length === 1) {
      // A lone Capitalized word → another answer for the heading in progress.
      if (current) out[current].push(words[0]);
    } else {
      // Heading row: all but the last word are the heading; the last is its first answer.
      current = normalizeHeading(words.slice(0, -1).join(' '));
      (out[current] ??= []).push(words[words.length - 1]);
    }
  }
  return out;
}

/**
 * The flat vocabulary of every Capitalized word in the `Codes.pdf` answer key, lowercased. Used as a
 * robust validation set: a computed answer that isn't in this vocabulary is almost certainly a
 * mis-count from a fragmented journal section (e.g. THAC0) — so the harness can decline to type it
 * (which would fail the check) and simply retry on the next boot's question. Unlike
 * {@link parseDqkCodes}, this does NOT depend on parsing the two-column table structure, so it is
 * reliable on the real layout.
 */
export function parseDqkCodesVocabulary(codesText: string): Set<string> {
  const vocab = new Set<string>();
  for (const w of codesText.match(/\b[A-Z][a-z]+\b/g) ?? []) vocab.add(w.toLowerCase());
  return vocab;
}
