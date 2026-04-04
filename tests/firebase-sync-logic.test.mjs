/**
 * Pure logic mirrors index.html Firebase "subsequent update" stale detection.
 * Run: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

/** @returns {boolean} true if remote snapshot should NOT replace local state */
export function isStaleSnapshot(remoteGen, localPersistGen) {
  return typeof remoteGen === 'number' && remoteGen < localPersistGen;
}

export function mergePersistGenAfterApply(remoteGen, localPersistGen) {
  if (typeof remoteGen === 'number') {
    return Math.max(localPersistGen, remoteGen);
  }
  return localPersistGen;
}

describe('isStaleSnapshot (matches index.html listener)', () => {
  it('ignores older numbered snapshots after CSV import (gen 0 vs local 1)', () => {
    assert.strictEqual(isStaleSnapshot(0, 1), true);
  });

  it('accepts same generation (echo of current write)', () => {
    assert.strictEqual(isStaleSnapshot(3, 3), false);
  });

  it('accepts newer generation from another tab', () => {
    assert.strictEqual(isStaleSnapshot(5, 3), false);
  });

  it('does not treat missing _persistGen as stale (legacy payloads)', () => {
    assert.strictEqual(isStaleSnapshot(undefined, 5), false);
  });

  it('first session: local 0 never stale-guards in this helper', () => {
    assert.strictEqual(isStaleSnapshot(0, 0), false);
  });
});

describe('mergePersistGenAfterApply', () => {
  it('takes max when remote has gen', () => {
    assert.strictEqual(mergePersistGenAfterApply(7, 3), 7);
  });

  it('keeps local when remote omits gen', () => {
    assert.strictEqual(mergePersistGenAfterApply(undefined, 4), 4);
  });
});

describe('simulated out-of-order RTDB callbacks', () => {
  it('CSV import survives empty snapshot delivered after persist()', () => {
    let teams = [];
    let persistGen = 0;

    const apply = (val) => {
      if (!val) return;
      const remoteGen = val._persistGen;
      if (isStaleSnapshot(remoteGen, persistGen)) return;
      teams = [...(val.teams || [])];
      persistGen = mergePersistGenAfterApply(remoteGen, persistGen);
    };

    // Empty DB seed echo
    apply({ teams: [], judges: ['j'], _persistGen: 0 });
    persistGen = mergePersistGenAfterApply(0, persistGen);
    assert.deepStrictEqual(teams, []);

    // User imports 2 teams (persist bumps gen before write)
    teams = [{ id: 1, project: 'A' }, { id: 2, project: 'B' }];
    persistGen++;
    // Stale empty snapshot (late)
    apply({ teams: [], judges: ['j'], _persistGen: 0 });
    assert.strictEqual(teams.length, 2);
    assert.strictEqual(teams[0].project, 'A');

    // Fresh snapshot
    apply({ teams, _persistGen: persistGen });
    assert.strictEqual(teams.length, 2);
  });
});
