/**
 * E6.2b-4 — DQK copy-protection journal-word solver. Synthetic journal/codes text only (the real
 * GOG PDFs are copyrighted and never bundled); the cases mirror the real prompt format and the
 * word-position structure GOG documents (page 11 RUNNING AWAY → #3 may/#4 flee/#5 from; page 10
 * SAVING THROWS → #2 such/#4 poison/#6 spells).
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeHeading,
  journalParagraphFor,
  journalWords,
  answerDqkProtection,
  parseDqkProtectionPrompt,
  parseDqkCodes,
  parseDqkCodesVocabulary,
} from '../src/index.js';

// A miniature journal in the same shape pdftotext raw mode emits: a heading line, then the body
// paragraph on the next line. Includes a bare-page-number line and a wrapped heading to exercise
// the structural-line skipping.
const JOURNAL = [
  'Combat',
  '',
  '9',
  'Running Away',
  'A character may flee from the battlefield if he moves faster than all enemies .',
  'Saving Throws',
  'Attacks such as poison or spells do not automatically have their full effect .',
  'Wounded',
  'Characters',
  'A seriously wounded character must be cured before he can fight again .',
].join('\n');

describe('normalizeHeading', () => {
  it('uppercases, collapses spaces, strips punctuation', () => {
    expect(normalizeHeading('  Running   Away! ')).toBe('RUNNING AWAY');
  });
  it('maps the digit 0 to O so prompt "THAC0" matches journal "THACO"', () => {
    expect(normalizeHeading('THAC0')).toBe('THACO');
    expect(normalizeHeading('THACO')).toBe('THACO');
  });
});

describe('parseDqkProtectionPrompt — digit-bearing heading', () => {
  it('captures THAC0 (digit) from the prompt without truncation', () => {
    const q = parseDqkProtectionPrompt('JOURNAL, PAGE (9); WHAT IS WORD # 7; AFTER THE HEADING; THAC0');
    expect(q?.heading).toBe('THAC0');
    expect(q?.wordNumber).toBe(7);
  });
});

describe('parseDqkCodesVocabulary', () => {
  it('collects all capitalized answer words, lowercased', () => {
    const vocab = parseDqkCodesVocabulary('11 Running Away May\n11 Flee\n11 From\n9 THAC0 Ability\n9 Hit');
    expect(vocab.has('may')).toBe(true);
    expect(vocab.has('flee')).toBe(true);
    expect(vocab.has('ability')).toBe(true);
    // A mis-counted lowercase word like "into" is not a known answer.
    expect(vocab.has('into')).toBe(false);
  });
});

describe('journalWords', () => {
  it('counts whitespace words, dropping standalone punctuation and stripping edges', () => {
    expect(journalWords('A character may flee from the battlefield .')).toEqual([
      'A', 'character', 'may', 'flee', 'from', 'the', 'battlefield',
    ]);
  });
});

describe('journalParagraphFor', () => {
  it('returns the body line after a heading, skipping blanks and page numbers', () => {
    expect(journalParagraphFor(JOURNAL, 'RUNNING AWAY')).toMatch(/^A character may flee/);
  });
  it('is case- and spacing-insensitive', () => {
    expect(journalParagraphFor(JOURNAL, 'running away')).toMatch(/^A character may flee/);
    expect(journalParagraphFor(JOURNAL, 'Saving  Throws')).toMatch(/^Attacks such as poison/);
  });
  it('accepts a title-case heading with a lowercase connector from the retail journal', () => {
    const journal = JOURNAL + '\nThe Moons of Krynn\nSince the creation of the world three moons have governed magic in Krynn .';
    expect(journalParagraphFor(journal, 'THE MOONS OF KRYNN')).toMatch(/^Since the creation/);
    expect(answerDqkProtection(journal, { heading: 'THE MOONS OF KRYNN', wordNumber: 10 })).toBe('governed');
  });
  it('returns null for an unknown heading', () => {
    expect(journalParagraphFor(JOURNAL, 'NONEXISTENT')).toBeNull();
  });

  // cok-m4-fidelity round 12 (§20): live-observed on the retail, unmodified "The Dark Queen of
  // Krynn" GOG dir -- the DQK.EXE protection PROMPT itself reads "DIETIES" (confirmed against the
  // raw screenshot, not a vision/OCR misread) while the journal's own heading is correctly spelled
  // "Deities" -- a genuine single-typo mismatch baked into the retail binary's own prompt text, not
  // an extraction artifact on this project's side. A single-transposition-tolerant fallback (only
  // used when no EXACT match exists at all) resolves it so the boot route doesn't hard-fail.
  it('tolerates a single adjacent-transposition typo in the prompt heading (DIETIES -> Deities)', () => {
    const journalWithTypoHeading = JOURNAL + '\nDeities\nSince the earliest days all deities were honored .';
    expect(journalParagraphFor(journalWithTypoHeading, 'DIETIES')).toMatch(/^Since the earliest days/);
  });
  it('tolerates the authenticated retail prompt plus pdftotext two-edit heading disagreement', () => {
    const journal = JOURNAL + '\nPreparation lips\nOnce the party has banded together camp at the inn ready equipment .';
    expect(answerDqkProtection(journal, { heading: 'PREPERATION TIPS', wordNumber: 10 })).toBe('inn');
  });
  it('does not fuzzy-match an unrelated heading beyond distance 1', () => {
    expect(journalParagraphFor(JOURNAL, 'NONEXISTENT HEADING')).toBeNull();
  });
});

describe('answerDqkProtection — matches the GOG Codes.pdf word positions', () => {
  it('handles the retail journal’s lowercase initiative heading', () => {
    const journal = [
      'initiative',
      'Each round of combat is divided into 10 segments, and every character and foe acts',
    ].join('\n');
    expect(answerDqkProtection(journal, { heading: 'INITIATIVE', wordNumber: 9 })).toBe('segments');
  });
  it('RUNNING AWAY → #3 may / #4 flee / #5 from', () => {
    expect(answerDqkProtection(JOURNAL, { heading: 'RUNNING AWAY', wordNumber: 3 })).toBe('may');
    expect(answerDqkProtection(JOURNAL, { heading: 'RUNNING AWAY', wordNumber: 4 })).toBe('flee');
    expect(answerDqkProtection(JOURNAL, { heading: 'RUNNING AWAY', wordNumber: 5 })).toBe('from');
  });
  it('SAVING THROWS → #2 such / #4 poison / #6 spells', () => {
    expect(answerDqkProtection(JOURNAL, { heading: 'SAVING THROWS', wordNumber: 2 })).toBe('such');
    expect(answerDqkProtection(JOURNAL, { heading: 'SAVING THROWS', wordNumber: 4 })).toBe('poison');
    expect(answerDqkProtection(JOURNAL, { heading: 'SAVING THROWS', wordNumber: 6 })).toBe('spells');
  });
  it('returns null for an out-of-range word or bad input', () => {
    expect(answerDqkProtection(JOURNAL, { heading: 'RUNNING AWAY', wordNumber: 99 })).toBeNull();
    expect(answerDqkProtection(JOURNAL, { heading: 'RUNNING AWAY', wordNumber: 0 })).toBeNull();
    expect(answerDqkProtection(JOURNAL, { heading: 'NOPE', wordNumber: 1 })).toBeNull();
  });
});

describe('parseDqkProtectionPrompt — tolerant of OCR spacing/casing', () => {
  it('pulls page, word#, and heading from a realistic prompt', () => {
    const q = parseDqkProtectionPrompt('Journal, page (11)  what is word # 4  after the heading RUNNING AWAY  Enter');
    expect(q).toEqual({ page: 11, heading: 'RUNNING AWAY', wordNumber: 4 });
  });
  it('works without a page and with odd spacing', () => {
    const q = parseDqkProtectionPrompt('what is word #2 after the heading Saving Throws?');
    expect(q?.heading).toBe('Saving Throws');
    expect(q?.wordNumber).toBe(2);
  });
  it('end-to-end: parse the prompt then answer it from the journal', () => {
    const q = parseDqkProtectionPrompt('page (11) what is word # 4 after the heading RUNNING AWAY Enter');
    expect(q && answerDqkProtection(JOURNAL, q)).toBe('flee');
  });
  it('handles the real qwen3-vl format with "; "-joined lines', () => {
    // Exactly as the vision layer returns it (lines joined by "; ").
    const q = parseDqkProtectionPrompt(
      'JOURNAL, PAGE (4); WHAT IS WORD # 1; AFTER THE HEADING; CHARACTER CLASSES; ENTER',
    );
    expect(q).toEqual({ page: 4, heading: 'CHARACTER CLASSES', wordNumber: 1 });
  });
  it('returns null when no word number is present', () => {
    expect(parseDqkProtectionPrompt('press a key to continue')).toBeNull();
  });
});

describe('journalParagraphFor — Codes answers disambiguate credits vs rules occurrence', () => {
  // "Combat Strategies" appears twice: a credits line and the real rules body. The Codes answers
  // (succeed/skilled/deploys) pick the rules paragraph.
  const DUP = [
    'Combat Strategies',
    '',
    '11',
    '',
    'Additional Encounter Programming : David Arcand',
    'Combat Strategies',
    'To succeed in combat a skilled player deploys his party well and attacks .',
  ].join('\n');
  it('without answers, the longest body (the rules prose) wins over the short credits line', () => {
    expect(journalParagraphFor(DUP, 'Combat Strategies')).toMatch(/^To succeed in combat/);
  });
  it('with Codes answers, returns the rules body', () => {
    expect(journalParagraphFor(DUP, 'Combat Strategies', ['Succeed', 'Skilled', 'Deploys'])).toMatch(
      /^To succeed in combat/,
    );
    expect(
      answerDqkProtection(DUP, { heading: 'Combat Strategies', wordNumber: 2 }, ['Succeed', 'Skilled', 'Deploys']),
    ).toBe('succeed');
    expect(
      answerDqkProtection(DUP, { heading: 'Combat Strategies', wordNumber: 6 }, ['Succeed', 'Skilled', 'Deploys']),
    ).toBe('skilled');
  });
});

describe('journalParagraphFor — repeated-heading rules body beats table-of-contents spillover', () => {
  it('uses the real Alignment paragraph when a contents occurrence has a longer accidental body', () => {
    const journal = [
      'Alignment',
      'Other Attributes 7 Building a Successful Party 7 Combat 9 Combat Map 9 Initiative 9',
      '',
      'Alignment',
      'Alignment is the philosophy a character lives by, and can affect how NPCs react.',
    ].join('\n');
    expect(answerDqkProtection(journal, { heading: 'Alignment', wordNumber: 7 })).toBe('lives');
  });
});

describe('journalParagraphFor — prose ending in a topic name is not a heading', () => {
  it('selects the real Combat heading instead of an earlier prose line ending in combat', () => {
    const journal = [
      'The thief has an advantage in combat.',
      'Intelligence is the measure of how well a character can learn.',
      '',
      'COMBAT',
      'Adventurers must battle their way through many dangerous foes.',
    ].join('\n');
    expect(answerDqkProtection(journal, { heading: 'Combat', wordNumber: 3 })).toBe('battle');
  });
});

describe('parseDqkCodes — soft cross-check of the answer key', () => {
  it('groups the answers listed under each heading', () => {
    const codes = [
      '4 Character Classes Classes',
      '4                     Character',
      '4                     Must',
      '11 Running Away         May',
      '11                  Flee',
      '11                   From',
    ].join('\n');
    const table = parseDqkCodes(codes);
    expect(table[normalizeHeading('Running Away')]).toEqual(['May', 'Flee', 'From']);
    expect(table[normalizeHeading('Character Classes')]).toEqual(['Classes', 'Character', 'Must']);
  });
});
