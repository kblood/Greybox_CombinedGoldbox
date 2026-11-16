const matchesCokDos = (entry) => entry?.kind === 'game'
  && entry.match?.profileId === 'champions-of-krynn' && entry.match?.platform === 'DOS';

/** Resolve one intended CoK install without borrowing an unrelated or ambiguous Library entry. */
export function resolveCokPlayInstall(entries, selected = null) {
  if (matchesCokDos(selected)) return { status: 'selected', entry: selected, count: 1 };
  const matches = entries.filter(matchesCokDos);
  if (matches.length === 1) return { status: 'unique', entry: matches[0], count: 1 };
  if (matches.length > 1) return { status: 'ambiguous', entry: null, count: matches.length };
  return { status: 'missing', entry: null, count: 0 };
}
