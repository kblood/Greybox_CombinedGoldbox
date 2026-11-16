import { describe, expect, it } from 'vitest';
import { moduleSaveKey } from '../../../apps/web/src/ui/moduleSaveKey.js';

describe('module browser save key', () => {
  it('keeps the legacy key byte-stable and separates same-id artifacts by digest', () => {
    const firstArtifact = 'a'.repeat(64);
    const secondArtifact = 'b'.repeat(64);

    expect(moduleSaveKey('same/module', 7)).toBe('greybox.module.save.same%2Fmodule.7');
    expect(moduleSaveKey('same/module', 7, firstArtifact)).toBe(
      `greybox.module.save.v2:73616d652f6d6f64756c65:7:${'61'.repeat(64)}`,
    );
    expect(moduleSaveKey('same/module', 7, firstArtifact)).not.toBe(
      moduleSaveKey('same/module', 7, secondArtifact),
    );
  });

  it('cannot collide when ids contain the old dot-delimited artifact syntax', () => {
    // These two tuples produced the exact same key in the original delimiter-based implementation.
    const first = moduleSaveKey('x', 1, 'y.2.artifact.z');
    const second = moduleSaveKey('x.1.artifact.y', 2, 'z');
    expect(first).not.toBe(second);

    // The raw-colon v2 namespace is also disjoint from every legacy encodeURIComponent key.
    expect(moduleSaveKey('x', 1, '2')).not.toBe(moduleSaveKey('v2:78:1', 32));
  });

  it('rejects malformed UTF-16 instead of lossy-encoding it into a colliding segment', () => {
    expect(() => moduleSaveKey('\ud800', 0, 'a')).toThrow(/module id must contain well-formed UTF-16/);
    expect(() => moduleSaveKey('\ud800', 0)).toThrow(/module id must contain well-formed UTF-16/);
    expect(() => moduleSaveKey('valid', 0, '\udc00')).toThrow(/artifact id must contain well-formed UTF-16/);
    expect(() => moduleSaveKey('valid', -1)).toThrow(/entrypoint id must be a non-negative safe integer/);
    expect(() => moduleSaveKey('valid', 1.5, 'artifact')).toThrow(
      /entrypoint id must be a non-negative safe integer/,
    );
  });
});
