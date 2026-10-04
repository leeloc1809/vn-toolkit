import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CURRENCY_CODE,
  CURRENCY_SYMBOL,
  MINOR_UNITS,
  SYMBOL_SPACER,
  VndError,
  allocate,
  formatVnd,
  isVnd,
  isVndError,
  parseVnd,
  toWords,
} from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE_PATH = resolve(HERE, '../../../conformance/vn-money-1.0.0.json');

interface Case {
  id: string;
  fn: string;
  input: Record<string, unknown>;
  expected: unknown;
  note?: string;
}

interface Suite {
  schema: string;
  library: string;
  version: string;
  derivedFrom: string;
  currency: { code: string; minorUnits: number; symbol: string; groupSeparator: string };
  readingConvention: Record<string, unknown>;
  functions: string[];
  caseCounts: Record<string, number>;
  cases: Case[];
}

const suite: Suite = JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite;

/** Run one case, and describe a mismatch in terms of the case, not the stack. */
function check(c: Case): void {
  let actual: unknown;
  try {
    switch (c.fn) {
      case 'isVnd':
        actual = isVnd(c.input.value);
        break;
      case 'formatVnd':
        actual = formatVnd(c.input.amount as number, c.input.options as never);
        break;
      case 'parseVnd':
        actual = parseVnd(c.input.input as string);
        break;
      case 'allocate':
        actual = allocate(c.input.total as number, c.input.shares as number[]);
        break;
      case 'toWords':
        actual = toWords(c.input.amount as number);
        break;
      default:
        throw new Error(`no runner for ${c.fn}`);
    }
  } catch (err) {
    if (isVndError(err)) actual = { error: err.reason };
    else throw err;
  }
  expect(actual, c.note).toEqual(c.expected);
}

describe('suite metadata', () => {
  it('declares the schema this runner understands', () => {
    expect(suite.schema).toBe('vn-money-conformance/1');
  });

  it('records the runtime the formatting was read out of', () => {
    // If a future ICU formats VND differently, this string is how you find out
    // what moved. The suite also re-checks the agreement directly below.
    expect(suite.derivedFrom).toMatch(/ICU \d+/);
  });

  it('has unique case ids', () => {
    const ids = suite.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has cases for every function it claims', () => {
    expect(suite.caseCounts).toEqual(
      Object.fromEntries(suite.functions.map((f) => [f, suite.cases.filter((c) => c.fn === f).length])),
    );
    // A function with no cases would let a stub pass. The generator refuses to
    // emit one; this is the check on the generator.
    for (const f of suite.functions) {
      expect(suite.caseCounts[f], f).toBeGreaterThan(0);
    }
  });

  it('pins the currency facts every function is defined in terms of', () => {
    expect(suite.currency.code).toBe(CURRENCY_CODE);
    expect(suite.currency.minorUnits).toBe(MINOR_UNITS);
    // The whole package works on integers because of this one line of ISO
    // 4217. If it ever changes, every function changes with it.
    expect(MINOR_UNITS).toBe(0);
  });

  it('records the reading convention, word by word', () => {
    // There is no platform to defer to for Vietnamese number reading, so the
    // suite has to state the choice. A convention that is not written down is
    // a convention nobody can check.
    const convention = suite.readingConvention;
    expect(convention).toHaveProperty('fillerWord', 'linh');
    expect(convention).toHaveProperty('magnitudeNames');
    expect(Array.isArray(convention.magnitudeNames)).toBe(true);
  });
});

describe('conformance', () => {
  it.each(suite.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    check(c);
  });
});

describe('agreement with ICU', () => {
  // The suite's formatting expectations were read out of ICU, so this is a
  // direct check rather than a re-derivation. If the runtime's ICU ever drifts
  // from the recorded one, this is what says so -- and it says which side moved.
  const amounts = [0, 1, 999, 1000, 1234, 1000000, 1000000000, -1000, 123456789];

  it.each(amounts)('formatVnd(%i) matches Intl.NumberFormat("vi-VN")', (amount) => {
    const icu = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    expect(formatVnd(amount)).toBe(icu);
  });

  it('the spacer really is a no-break space', () => {
    expect(SYMBOL_SPACER.codePointAt(0)).toBe(0x00a0);
    // A plain space would let a line wrap between the digits and the symbol.
    expect(SYMBOL_SPACER).not.toBe(' ');
  });

  it('the symbol really is U+20AB and not the informal letter', () => {
    expect(CURRENCY_SYMBOL.codePointAt(0)).toBe(0x20ab);
  });
});

describe('round trip', () => {
  it('every formatted amount parses back to itself', () => {
    for (const amount of [0, 1, 999, 1000, 1001, 123456789, 1000000000, -1000, -123456789]) {
      expect(parseVnd(formatVnd(amount)), formatVnd(amount)).toBe(amount);
    }
  });

  it('a grouped amount survives a change of separator', () => {
    expect(parseVnd(formatVnd(1234567, { groupSeparator: ',' }))).toBe(1234567);
  });
});

describe('isVnd', () => {
  it('rejects anything that is not an exact whole amount', () => {
    expect(isVnd(1.5)).toBe(false);
    expect(isVnd(Number.NaN)).toBe(false);
    expect(isVnd('1000')).toBe(false);
    expect(isVnd(null)).toBe(false);
    expect(isVnd(undefined)).toBe(false);
  });

  it('accepts zero and negative amounts', () => {
    // A refund is a negative amount, not an invalid one.
    expect(isVnd(0)).toBe(true);
    expect(isVnd(-1)).toBe(true);
  });
});

describe('parseVnd refuses rather than guesses', () => {
  it('reports a machine-readable reason', () => {
    for (const [input, reason] of [
      ['', 'empty'],
      ['1.5', 'has-decimal'],
      ['abc', 'unexpected-character'],
    ] as const) {
      try {
        parseVnd(input);
        throw new Error(`"${input}" parsed, but it should not have`);
      } catch (err) {
        expect(isVndError(err), String(err)).toBe(true);
        expect((err as VndError).reason).toBe(reason);
      }
    }
  });

  it('never rounds a fractional amount into a whole one', () => {
    // The failure this exists for: 1.500 read as 1.5 and then formatted back
    // out as 2, because the library rounded instead of asking.
    expect(() => parseVnd('1.500,00')).toThrow(VndError);
    expect(() => parseVnd('1,500.00')).toThrow(VndError);
  });
});

describe('allocate', () => {
  it('the parts always add back up to the total', () => {
    for (const [total, shares] of [
      [100, [1, 1, 1]],
      [1, [1, 1, 1, 1, 1]],
      [0, [1, 2, 3]],
      [-100, [1, 1, 1]],
      [12345, [2, 3, 5]],
      [1000000, [1, 1, 1]],
    ] as const) {
      const parts = allocate(total, shares as unknown as number[]);
      expect(parts.reduce((a, b) => a + b, 0), JSON.stringify(parts)).toBe(total);
    }
  });

  it('is reproducible: same inputs, same answer, every time', () => {
    const once = allocate(100, [1, 1, 1]);
    for (let i = 0; i < 20; i += 1) {
      expect(allocate(100, [1, 1, 1])).toEqual(once);
    }
  });

  it('does not mutate its input', () => {
    const shares = [1, 1, 1];
    const snapshot = [...shares];
    allocate(100, shares);
    expect(shares).toEqual(snapshot);
  });

  it('treats a zero share as nobody, not as an error', () => {
    // A filtered list gives [0, 0, 1]. Refusing it would break the caller
    // rather than the input.
    expect(allocate(100, [0, 0, 1])).toEqual([0, 0, 100]);
  });

  it('rejects a share list that cannot be apportioned', () => {
    expect(() => allocate(100, [])).toThrow(VndError);
    expect(() => allocate(100, [0, 0])).toThrow(VndError);
    expect(() => allocate(100, [1, -1])).toThrow(VndError);
    expect(() => allocate(100, [1, 1.5])).toThrow(VndError);
    expect(() => allocate(1.5, [1, 1])).toThrow(VndError);
  });
});

describe('toWords', () => {
  it('reads the contested values the way the suite says', () => {
    // Each of these is a value where two published Vietnamese conventions
    // disagree. They are pinned, with the rejected reading, in the suite.
    for (const [amount, expected] of [
      [5, 'năm'],
      [15, 'mười lăm'],
      [14, 'mười bốn'],
      [11, 'mười một'],
      [21, 'hai mươi mốt'],
      [24, 'hai mươi tư'],
      [105, 'một trăm linh năm'],
      [1001, 'một nghìn không trăm linh một'],
      [1000000, 'một triệu'],
    ] as const) {
      expect(toWords(amount), String(amount)).toBe(expected);
    }
  });

  it('prefixes a negative amount instead of reversing it', () => {
    expect(toWords(-1)).toBe('âm một');
    expect(toWords(-15000)).toBe('âm mười lăm nghìn');
  });

  it('refuses to read out a fractional amount', () => {
    expect(() => toWords(1.5)).toThrow(VndError);
    expect(() => toWords(Number.NaN)).toThrow(VndError);
  });
});
