import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoMachinePathLiterals } from '../scripts/public-artifact-policy.mjs';

const check = (text) => { assertNoMachinePathLiterals('assets/test.js', text); };

test('the approved GOG Galaxy vendor default install root is allowed', () => {
  check(String.raw`{iconPath:"C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MUSIC.DAX"}`);
  check(String.raw`"C:\\Program Files (x86)\\GOG Galaxy\\Games\\Pools of Darkness\\MUSIC.DAX"`);
});

test('the approved D:/Games default root is allowed', () => {
  check(String.raw`path:"D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/TITLE.DAX"`);
  check(String.raw`retail \`D:\\Games\\Neverwinter Nights DOS\\neverwinter-nights\``);
});

test('other drive-letter machine paths still fail', () => {
  assert.throws(() => check(String.raw`path:"C:/Users/someone/Documents/file.txt"`), /Machine-local path literal/);
  assert.throws(() => check(String.raw`path:"E:/Private/file.txt"`), /Machine-local path literal/);
  // A different drive-letter root that merely shares the vendor folder name still fails.
  assert.throws(() => check(String.raw`"D:/Program Files (x86)/GOG Galaxy/Games/a"`), /Machine-local path literal/);
});

test('drive-letter regex literals are not machine paths', () => {
  check(String.raw`const re = /i:/^x/;`);
});

test('Pascal string escapes are not UNC paths', () => {
  check(String.raw`"read \\x08Overland\\x08Dungeon and"`);
});

test('regex character classes and empty string literals are not UNC paths', () => {
  check(String.raw`/[\\\\:\\x00-\\x20]/.test(s)`);
  check(String.raw`value.replaceAll("\\\\","/").split("/").pop()`);
});

test('a real double-backslash UNC path is still rejected', () => {
  assert.throws(() => check(String.raw`"\\\\fileserver\\share\\data"`), /Machine-local path literal/);
});
