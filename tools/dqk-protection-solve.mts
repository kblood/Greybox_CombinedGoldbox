/**
 * E6.2b-4 — solve a DQK copy-protection journal-word prompt from the player's own journal text.
 *
 * The DOSBox capture harness vision-reads the live prompt ("…page (P) what is word #N after the
 * heading H…"), extracts the journal to text with `pdftotext`, and calls this to get the word to
 * type. Pure lookup over the engine solver — reads only the local journal text file you point it at
 * (a copyrighted GOG asset, never bundled); prints the single answer word to stdout, or exits 2 if
 * it can't be solved.
 *
 *   npx tsx tools/dqk-protection-solve.mts --journal /tmp/journal.txt \
 *       --prompt "Journal, page (11) what is word # 4 after the heading RUNNING AWAY Enter"
 *   # or:  --heading "RUNNING AWAY" --word 4
 */
import { readFileSync } from 'node:fs';
import {
  answerDqkProtection,
  parseDqkProtectionPrompt,
  parseDqkCodes,
  parseDqkCodesVocabulary,
  normalizeHeading,
  type DqkProtectionQuestion,
} from '../packages/engine/src/index.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const journalPath = arg('journal');
if (!journalPath) {
  console.error('usage: --journal <text> (--prompt "<text>" | --heading H --word N)');
  process.exit(2);
}
const journal = readFileSync(journalPath, 'utf8');

let q: DqkProtectionQuestion | null = null;
const prompt = arg('prompt');
if (prompt) {
  q = parseDqkProtectionPrompt(prompt);
} else {
  const heading = arg('heading');
  const word = Number(arg('word'));
  if (heading && Number.isInteger(word)) q = { heading, wordNumber: word };
}
if (!q) {
  console.error('could not parse a question (need --prompt or --heading/--word)');
  process.exit(2);
}

// Optional GOG Codes.pdf answer key: disambiguates a heading that also appears in credits/contents,
// AND validates the computed word against the vocabulary of real answers — so a mis-count from a
// fragmented journal section (e.g. THAC0) is reported as unsolved rather than typed wrongly.
const codesPath = arg('codes');
let answers: string[] | undefined;
let vocab: Set<string> | undefined;
if (codesPath) {
  const codesText = readFileSync(codesPath, 'utf8');
  answers = parseDqkCodes(codesText)[normalizeHeading(q.heading)];
  vocab = parseDqkCodesVocabulary(codesText);
}

const answer = answerDqkProtection(journal, q, answers);
if (!answer) {
  console.error(`unsolved: heading="${q.heading}" word#${q.wordNumber} not found in journal`);
  process.exit(2);
}
if (vocab && !vocab.has(answer.toLowerCase())) {
  console.error(`low-confidence: "${answer}" (heading="${q.heading}" #${q.wordNumber}) is not a known answer word`);
  process.exit(3);
}
process.stdout.write(answer + '\n');
