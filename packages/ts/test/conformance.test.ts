import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  deaccent,
  fold,
  isVietnamese,
  normalize,
  stripStroke,
} from '../src/index.js';
import type { UnicodeFn } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFORMANCE_PATH = resolve(HERE, '../../../conformance/vn-text-1.0.0.json');

interface ConformanceCase {
  id: string;
  fn: string;
  input: string;
  /** String for the string-to-string transforms, boolean for isVietnamese. */
  expected: string | boolean;
  note?: string;
}

interface ConformanceSuite {
  schema: string;
  library: string;
  version: string;
  functions: string[];
  cases: ConformanceCase[];
}

const suite: ConformanceSuite = JSON.parse(
  readFileSync(CONFORMANCE_PATH, 'utf8'),
) as ConformanceSuite;

/**
 * Every function named in the conformance file must be dispatchable here, and
 * vice versa. If someone adds a case for a function the runner does not know
 * about, the suite fails loudly instead of quietly skipping it.
 */
const IMPLS: Record<string, (s: string) => string> = {
  normalize,
  deaccent,
  stripStroke,
  fold,
};

describe('conformance suite metadata', () => {
  it('declares the schema this runner understands', () => {
    expect(suite.schema).toBe('vn-text-conformance/1');
  });

  it('has no case referencing an unknown function', () => {
    const known = new Set([...Object.keys(IMPLS), 'isVietnamese']);
    const unknown = suite.cases
      .filter((c) => !known.has(c.fn))
      .map((c) => `${c.id} -> ${c.fn}`);
    expect(unknown).toEqual([]);
  });

  it('has unique case ids', () => {
    const ids = suite.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every declared function', () => {
    for (const fn of suite.functions) {
      const count = suite.cases.filter((c) => c.fn === fn).length;
      expect(count, `function "${fn}" has no conformance cases`).toBeGreaterThan(0);
    }
  });
});

describe.each(suite.functions)('conformance: %s', (fn) => {
  const cases = suite.cases.filter((c) => c.fn === fn);

  it.each(cases.map((c) => [c.id, c] as const))(
    '%s',
    (_id, c) => {
      const actual = fn === 'isVietnamese'
        ? isVietnamese(c.input)
        : (IMPLS[fn] as UnicodeFn)(c.input);
      expect(actual, c.note).toBe(c.expected);
    },
  );
});

/**
 * Regression tests for the specific mistakes that make an existing
 * Vietnamese text library wrong. These are duplicated here on purpose so the
 * headline behaviour stays visible in the test output, not just buried in
 * a JSON file.
 */
describe('regression: D-WITH-STROKE vs ETH', () => {
  it('folds Vietnamese Đ (U+0110) to D', () => {
    expect(fold('Đặng Minh')).toBe('dang minh');
  });

  it('never folds Icelandic Ð (U+00D0) to D', () => {
    expect(fold('Ðor')).toBe('ðor');
    expect(deaccent('Ðor')).toBe('Ðor');
    expect(stripStroke('Ðor')).toBe('Ðor');
  });

  it('preserves letter identity in deaccent but folds in fold()', () => {
    // Stripping tone marks should not silently rewrite which letter you have.
    expect(deaccent('Đặng')).toBe('Đang');
    // A search key has to collapse it, or users cannot find "Đặng" by typing
    // "Dang".
    expect(fold('Đặng')).toBe('dang');
  });
});

describe('regression: search equivalence', () => {
  it('treats accented and unaccented queries as the same key', () => {
    expect(fold('Cai gi the nay')).toBe(fold('Cái gì thế này'));
    expect(fold('Dang')).toBe(fold('Đặng'));
    expect(fold('HA NOI')).toBe(fold('Hà Nội'));
  });

  it('is idempotent', () => {
    for (const s of ['Cái gì thế này', 'Đặng Minh', 'Hà Nội, Việt Nam!', 'Ðor', '東京 Tokyo']) {
      expect(fold(s), s).toBe(fold(fold(s)));
    }
  });

  it('collapses whitespace and punctuation consistently', () => {
    expect(fold('  Hà    Nội  ')).toBe(fold('Hà-Nội'));
    expect(fold('TP. Hồ Chí Minh')).toBe('tp ho chi minh');
  });
});

describe('regression: normalisation', () => {
  it('folds NFD and NFC spellings of the same text identically', () => {
    const nfc = 'Cái gì thế này';
    const nfd = nfc.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    expect(normalize(nfd)).toBe(nfc);
    expect(fold(nfc)).toBe(fold(nfd));
  });

  it('uses NFD, not NFKD, so compatibility ligatures survive', () => {
    // NFKD would rewrite this to "fi" and change English text.
    expect(deaccent('ﬁ')).toBe('ﬁ');
  });
});
