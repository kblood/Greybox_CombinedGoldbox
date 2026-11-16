/** Coordinate explicit failed-icon requests only; admission/byte validation belongs to the caller's loader. */
export function createCokCombatRestyleRetry() {
  const pending = new Map();
  return async (request) => {
    const work = [];
    for (const id of new Set(request.requestedIds)) {
      if (!request.failedIds.has(id) || request.successfulIds.has(id) || !request.admitted(id)) continue;
      const key = JSON.stringify([request.archiveSha256, id, request.generation]);
      let flight = pending.get(key);
      if (flight) { flight.request = request; work.push(flight.done); continue; }
      flight = { request };
      pending.set(key, flight);
      flight.done = Promise.resolve().then(async () => {
        try {
          const result = await request.load(id);
          if (flight.request.isCurrent()) flight.request.apply(id, result);
        } catch (error) {
          if (flight.request.isCurrent()) flight.request.failed(id, error);
        } finally { if (pending.get(key) === flight) pending.delete(key); }
      });
      work.push(flight.done);
    }
    await Promise.all(work);
  };
}
