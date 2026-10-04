import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { collateKey, compare, sort, PRIMARY_ORDER, TONE_ORDER } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE_PATH = resolve(HERE, '../../../conformance/vn-collate-1.0.0.json');

interface CompareCase {
  id: string;
  fn: string;
  a: string;
  b: string;
  expected: -1 | 0 | 1;
  note?: string;
}

interface Suite {
  schema: string;
  library: string;
  version: string;
  derivedFrom: string;
  primaryOrder: string[];
  toneOrder: string[];
  digitPlacement: string;
  cases: CompareCase[];
}

const suite: Suite = JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite;

describe('suite metadata', () => {
  it('declares the schema this runner understands', () => {
    expect(suite.schema).toBe('vn-collate-conformance/1');
  });

  it('records where the weights came from', () => {
    // If a future ICU disagrees, this string is how you find out what moved.
    expect(suite.derivedFrom).toMatch(/ICU \d+/);
  });

  it('has unique case ids', () => {
    const ids = suite.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers both directions and reflexivity, so a constant comparator cannot pass', () => {
    const expected = suite.cases.map((c) => c.expected);
    expect(expected).toContain(-1);
    expect(expected).toContain(1);
    expect(expected).toContain(0);
  });
});

describe('the table matches the suite', () => {
  it('primary order', () => {
    expect([...PRIMARY_ORDER]).toEqual(suite.primaryOrder);
  });

  it('tone order', () => {
    expect([...TONE_ORDER]).toEqual(suite.toneOrder);
  });
});

describe('conformance', () => {
  it.each(suite.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const actual = compare(c.a, c.b);
    expect(actual, c.note).toBe(c.expected);
  });
});

describe('agreement with ICU', () => {
  // The suite is derived from ICU, so this is a direct check rather than a
  // re-derivation. If the runtime's ICU ever drifts from the recorded one, this
  // is where it surfaces.
  const icu = new Intl.Collator('vi-VN');

  const repertoire: string[] = [];
  for (const letter of suite.primaryOrder) {
    for (const [, mark] of [
      ['', ''],
      ['sắc', '́'],
      ['huyền', '̀'],
      ['hỏi', '̉'],
      ['ngã', '̃'],
      ['nặng', '̣'],
    ] as const) {
      const composed = letter + mark;
      repertoire.push(composed.normalize('NFC'), composed.toUpperCase().normalize('NFC'));
    }
  }

  it(`sorts all ${repertoire.length} letters x tones x cases exactly as ICU does`, () => {
    const ours = sort(repertoire);
    const theirs = [...repertoire].sort(icu.compare);
    const firstDiff = ours.findIndex((value, i) => value !== theirs[i]);
    expect(
      firstDiff,
      firstDiff === -1
        ? ''
        : `first divergence at ${firstDiff}: we say ${JSON.stringify(ours[firstDiff])}, ` +
          `ICU says ${JSON.stringify(theirs[firstDiff])}`,
    ).toBe(-1);
  });

  it('agrees with ICU on a realistic name list', () => {
    const names = ['Đặng', 'Dung', 'Dũng', 'Anh', 'Bảo', 'bao', 'Bao', 'Thảo', 'Thao', 'Nguyễn', 'nguyễn', 'An', '1', 'A1'];
    expect(sort(names)).toEqual([...names].sort(icu.compare));
  });
});

describe('invariants', () => {
  it('compare agrees with comparing the keys', () => {
    const pairs: [string, string][] = [
      ['a', 'A'], ['a', 'á'], ['Đặng', 'Dũng'], ['1', 'An'], ['ab', 'á'], ['', 'a'],
    ];
    for (const [a, b] of pairs) {
      const ka = collateKey(a);
      const kb = collateKey(b);
      const expected = ka === kb ? 0 : ka < kb ? -1 : 1;
      expect(compare(a, b), `${a} vs ${b}`).toBe(expected);
    }
  });

  it('is antisymmetric', () => {
    const words = ['a', 'A', 'á', 'Á', 'à', 'b', 'đ', 'Đ', 'Thảo', 'Thao', '1', ''];
    for (const a of words) {
      for (const b of words) {
        // Sum rather than negate: -(0) is -0, and Object.is(0, -0) is false,
        // which would fail on every reflexive pair for no real reason.
        expect(compare(a, b) + compare(b, a), `${a} vs ${b}`).toBe(0);
      }
    }
  });

  it('sort is stable and does not mutate its input', () => {
    const input = ['b', 'B', 'b', 'B'];
    const output = sort(input);
    expect(input).toEqual(['b', 'B', 'b', 'B']);
    // b sorts before B, and the two of each keep their input order.
    expect(output).toEqual(['b', 'b', 'B', 'B']);
    // An already-sorted list comes back unchanged.
    const already = ['a', 'A', 'á', 'Á'];
    expect(sort(already)).toEqual(already);
  });

  it('sort accepts a key function', () => {
    const people = [{ n: 'Đặng' }, { n: 'Anh' }, { n: 'Bảo' }];
    expect(sort(people, (p) => p.n).map((p) => p.n)).toEqual(['Anh', 'Bảo', 'Đặng']);
  });

  it('orders a string before any string it is a prefix of', () => {
    // The case that breaks per-character interleaved keys.
    expect(compare('á', 'ab')).toBe(-1);
    expect(compare('a', 'ab')).toBe(-1);
  });

  it('treats NFC and NFD input as the same string', () => {
    for (const s of ['Đặng', 'Thảo', 'đường', 'Ăn']) {
      expect(compare(s, s.normalize('NFD')), s).toBe(0);
      expect(collateKey(s), s).toBe(collateKey(s.normalize('NFD')));
    }
  });

  it('puts every digit before every letter', () => {
    for (const d of '0123456789') {
      for (const letter of PRIMARY_ORDER) {
        expect(compare(d, letter), `${d} vs ${letter}`).toBe(-1);
      }
    }
  });

  it('sorts unknown characters last, deterministically', () => {
    expect(compare('z', '☃')).toBe(-1);
    expect(compare('☃', '☃')).toBe(0);
  });

  it('keeps the key free of characters a database might mangle', () => {
    // Hex only, so the key is safe in a text column with binary collation.
    expect(collateKey('Đặng Thảo 1')).toMatch(/^[0-9a-f]+$/);
  });
});
