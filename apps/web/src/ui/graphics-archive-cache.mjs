/** Six-entry decoded-archive cache scoped to the current local archive selection.
 * Hits, misses and in-flight work share one promise. A changed selection or explicit clear
 * invalidates both cached results and returns still pending from the previous generation.
 */
export function createGraphicsArchiveCache(readRevision) {
  if (typeof readRevision !== 'function') throw new TypeError('Archive cache requires a revision reader');
  const entries = new Map();
  let revision = readRevision();
  let generation = 0;
  const clear = () => { entries.clear(); generation++; };
  const synchronize = () => {
    const nextRevision = readRevision();
    if (nextRevision !== revision) { revision = nextRevision; clear(); }
  };
  return Object.freeze({
    get size() { synchronize(); return entries.size; },
    clear,
    get(key, load) {
      synchronize();
      const cached = entries.get(key);
      if (cached) return cached;
      const requestRevision = revision;
      const requestGeneration = generation;
      const current = () => readRevision() === requestRevision && generation === requestGeneration;
      const pending = Promise.resolve().then(() => current() ? load() : null).then(
        (value) => current() ? value : null,
        (error) => { if (!current()) return null; throw error; },
      );
      entries.set(key, pending);
      while (entries.size > 6) entries.delete(entries.keys().next().value);
      return pending;
    },
  });
}
