/** Add an actionable fixture explanation to a Vitest skip title. */
export function optionalFixtureSkipTitle(
  title: string,
  missingFixtures: readonly string[],
): string {
  if (missingFixtures.length === 0) return title;
  const fixtureList = missingFixtures.join(', ');
  return `${title} [skipped: required fixture${missingFixtures.length === 1 ? '' : 's'} absent: ${fixtureList}]`;
}
