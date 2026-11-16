/**
 * Selected-folder read contract for the shipping DoK -> DQK party importer.
 *
 * This is intentionally a test-only import of the web adapter: production engine code remains
 * DOM/UI-free, while the contract exercises the actual source-selection branch instead of checking
 * its source text. Synthetic valid caster records make every slot request GAM + WIZ + JNK without
 * depending on locally installed retail assets.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportDokSavedCharacter } from '../src/index.js';
import { importDokParty } from '../../../apps/web/src/ui/importDokParty.js';
import {
  indexPreferredAssetPaths,
  type AssetSource,
} from '../../../apps/web/src/ui/assetSource.js';

const gamBytes = (slot: number): Uint8Array => exportDokSavedCharacter({
  name: `SOURCE ${slot}`,
  abilities: { str: 15, int: 17, wis: 14, dex: 16, con: 15, cha: 13 },
  thac0: 14,
  isCaster: true,
});

function recordingSource(
  files: ReadonlyMap<string, Uint8Array>,
  requested: string[],
): AssetSource {
  return {
    async readAsset(basename: string) {
      requested.push(basename);
      // AssetSource lookups are case-insensitive. Lower-case fixture keys also prove the importer
      // is asking for basenames, not repo-relative `Death Knights of Krynn/SAVE/...` paths.
      return files.get(basename.toLowerCase()) ?? null;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importDokParty — selected AssetSource reads', () => {
  it('prefers canonical shallow saves over duplicate cloud/backup basenames', () => {
    const indexed = indexPreferredAssetPaths([
      'cloud_saves/SAVE/CHRDATA1.GAM',
      'SAVE/CHRDATA1.GAM',
      'DISK2/ECL1.DAX',
      'DISK1/ECL1.DAX',
    ]);

    expect(indexed.get('chrdata1.gam')).toBe('SAVE/CHRDATA1.GAM');
    expect(indexed.get('ecl1.dax')).toBe('DISK2/ECL1.DAX');
  });

  it('requests only CHRDATA1..6 GAM/WIZ/JNK basenames and never falls back to bundled fetch', async () => {
    const files = new Map<string, Uint8Array>();
    for (let slot = 1; slot <= 6; slot++) files.set(`chrdata${slot}.gam`, gamBytes(slot));

    const requested: string[] = [];
    const fetchSpy = vi.fn(async () => {
      throw new Error('selected-source import must not use bundled fetch');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await importDokParty(recordingSource(files, requested));

    expect(result.imported).toEqual([
      'SOURCE 1', 'SOURCE 2', 'SOURCE 3', 'SOURCE 4', 'SOURCE 5', 'SOURCE 6',
    ]);
    expect(requested).toEqual(Array.from({ length: 6 }, (_, index) => {
      const slot = index + 1;
      return [`CHRDATA${slot}.GAM`, `CHRDATA${slot}.WIZ`, `CHRDATA${slot}.JNK`];
    }).flat());
    expect(requested.every((name) => !name.includes('/') && !name.includes('\\'))).toBe(true);
    expect(requested.some((name) => /\.EFF$/i.test(name))).toBe(false);
    expect(requested.some((name) => /^SAVGAMA\.PTY$/i.test(name))).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps a missing selected save missing instead of substituting a bundled pregen', async () => {
    const requested: string[] = [];
    const fetchSpy = vi.fn(async () => {
      throw new Error('missing selected file must not fall back');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await importDokParty(recordingSource(new Map(), requested));

    expect(result.imported).toEqual([]);
    expect(requested).toEqual(Array.from({ length: 6 }, (_, index) => `CHRDATA${index + 1}.GAM`));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
