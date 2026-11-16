/** Read one title archive from a user-selected install, using HTTP only in development. */
export async function loadIntroTitleBytes({ titlePath, assetRelativePaths, assetSource, developmentUrl, fetchImpl = globalThis.fetch }) {
  const filename = titlePath.split(/[\\/]/).at(-1) ?? titlePath;
  if (assetSource) {
    const normalizedPath = titlePath.replace(/\\/g, '/');
    const isAbsolute = /^(?:[a-z]:\/|\/\/)/i.test(normalizedPath);
    if (typeof assetSource.readPath === 'function' && (Array.isArray(assetRelativePaths) || !isAbsolute)) {
      // Profiles often store `<game folder>/<archive>` while Library entries are rooted at the
      // selected install. Try both forms, but never guess by basename when exact path lookup is
      // available: duplicate archive names across disks must remain distinguishable.
      const candidates = Array.isArray(assetRelativePaths) ? assetRelativePaths : [normalizedPath];
      if (!Array.isArray(assetRelativePaths)) {
        const firstSlash = normalizedPath.indexOf('/');
        if (firstSlash >= 0) candidates.push(normalizedPath.slice(firstSlash + 1));
      }
      for (const candidate of [...new Set(candidates)]) {
        if (typeof candidate !== 'string' || !candidate) continue;
        const bytes = await assetSource.readPath(candidate);
        if (bytes instanceof Uint8Array) return bytes;
      }
      throw new Error(`${titlePath} was not found at an exact path in the selected game folder`);
    }
    const bytes = await assetSource.readAsset(filename);
    if (!(bytes instanceof Uint8Array)) throw new Error(`${filename} was not found in the selected game folder`);
    return bytes;
  }
  if (typeof developmentUrl !== 'string' || !developmentUrl) {
    throw new Error('Select the matching game folder from Game Library to load its title screens');
  }
  if (typeof fetchImpl !== 'function') throw new Error('Development title fetch is unavailable');
  const response = await fetchImpl(developmentUrl);
  if (!response.ok) throw new Error(`${titlePath}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
