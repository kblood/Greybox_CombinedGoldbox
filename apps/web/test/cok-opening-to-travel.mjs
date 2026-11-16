/** Drive CoK's real ECL1#36 -> #16 -> #17 -> #16 opening through its visible dialogue UI. */
export async function driveCokOpeningToTravel(page, errors) {
  await page.waitForFunction('window.__dialogue || window.__rendered === 0', { timeout: 45000 });
  const pictures = [];
  const lines = [];
  let usedTownService = false;
  let openingCamp = null;
  for (let guard = 0; guard < 80; guard++) {
    if (await page.evaluate('!!window.__cokTravel?.open?.()')) break;
    if (await page.evaluate('!!window.__cokOpeningCamp?.open?.()')) {
      openingCamp = await page.evaluate('({ picture: window.__cokOpeningCamp.pictureId(), commands: window.__cokOpeningCamp.commands() })');
      await page.evaluate('window.__cokOpeningCamp.exit()');
      continue;
    }
    if (await page.evaluate('!!window.__dialogue')) {
      const turn = await page.evaluate(`({
        kind: window.__dialogue.kind(),
        text: window.__dialogue.text(),
        choices: window.__dialogue.choices(),
        picture: window.__dialogue.pictureId()
      })`);
      if (turn.picture !== null && pictures.at(-1) !== turn.picture) pictures.push(turn.picture);
      if (turn.text) lines.push(turn.text);
      if (turn.kind === 'say') {
        const leave = turn.choices.findIndex((choice) => /^LEAVE$/i.test(choice));
        const commandant = turn.choices.findIndex((choice) => /^COMMANDANT$/i.test(choice));
        const choice = leave >= 0 && commandant >= 0 && !usedTownService ? commandant : leave >= 0 ? leave : 0;
        if (choice === commandant && commandant >= 0) usedTownService = true;
        await page.evaluate((picked) => window.__dialogue.choose(picked), choice);
      } else if (turn.kind === 'end') {
        await page.evaluate('window.__dialogue.close()');
      } else if (turn.kind === 'combat') {
        await page.waitForFunction('!!window.__combat', { timeout: 10000 });
        await page.evaluate('window.__combat.auto()');
        if (await page.evaluate('window.__combat.phase()') === 'treasure') {
          await page.evaluate('window.__combat.takeAllTreasure()');
          await page.evaluate('window.__combat.exitTreasure()');
        }
        await page.evaluate('window.__combat.dismiss()');
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await page.waitForFunction('window.__cokTravel && window.__cokTravel.open()', { timeout: 20000 });
  const opening = await page.evaluate('({ complete: window.__cokOpening.complete(), visited: window.__cokOpening.visited() })');
  if (!opening.complete || JSON.stringify(opening.visited) !== JSON.stringify([36, 16, 17, 16])) {
    errors.push(`cok-opening-route: ${JSON.stringify(opening)}`);
  }
  if (!pictures.includes(112) || !pictures.includes(121)) errors.push(`cok-opening-pictures: ${JSON.stringify(pictures)}`);
  if (!/FIRST MISSION IS TO PATROL THROTL/i.test(lines.join(' '))) errors.push('cok-opening-mission-text-missing');
  // R5 round 30: this read `if (!usedTownService)`, a flag the HARNESS set while driving the
  // opening loop — nothing was ever read back from the page, so the assertion could not detect a
  // regression inside the engine. Measured by A/B diff of `window.__cokOpening.memory()` with the
  // commandant branch driven vs skipped: the two runs are identical except for ECL word 19502
  // (0x4c2e), which is 1 only after the town-service branch actually runs. Assert that instead.
  const commandantMemory = await page.evaluate('window.__cokOpening.memory()');
  if (commandantMemory?.[19502] !== 1) {
    errors.push(`cok-opening-commandant-service-not-used: usedTownService=${usedTownService} word19502=${commandantMemory?.[19502]}`);
  }
  if (!openingCamp || openingCamp.picture !== 59 || JSON.stringify(openingCamp.commands) !== JSON.stringify(['Save', 'View', 'Magic', 'Rest', 'Alter', 'Fix', 'Exit'])) {
    errors.push(`cok-opening-camp: ${JSON.stringify(openingCamp)}`);
  }
  return { pictures, lines, opening, usedTownService, openingCamp };
}
