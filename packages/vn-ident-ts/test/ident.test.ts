import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ASSIGNED_PREFIX_COUNT,
  CARRIERS,
  CENTURY_GENDER,
  MST_MODULUS,
  MST_WEIGHTS,
  PROVINCES,
  classifyId,
  detectCarrier,
  isValidCccd,
  isValidCmnd,
  isValidMst,
  isValidPhone,
  mstCheckDigit,
  normalizePhone,
  parseCccd,
  parseMst,
} from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE_PATH = resolve(HERE, '../../../conformance/vn-ident-1.0.0.json');

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
  tables: Record<string, unknown>;
  functions: string[];
  caseCounts: Record<string, number>;
  cases: Case[];
}

const suite: Suite = JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite;

/** The tables are the contract, so a regeneration cannot quietly change them. */
const tables = suite.tables as {
  mstWeights: number[];
  mstModulus: number;
  provinces: { code: string; name: string }[];
  centuryGender: { digit: number; century: number; gender: string }[];
  carriers: { name: string; prefixes: string[] }[];
  carrierCount: number;
};

function run(c: Case): unknown {
  const input = c.input;
  switch (c.fn) {
    case 'mstCheckDigit':
      return mstCheckDigit(input.prefix as string);
    case 'isValidMst':
      return isValidMst(input.code as string);
    case 'parseMst':
      return parseMst(input.code as string);
    case 'normalizePhone':
      return normalizePhone(input.input as string, (input.options ?? {}) as never);
    case 'detectCarrier':
      return detectCarrier(input.phone as string);
    case 'isValidPhone':
      return isValidPhone(input.input as string);
    case 'isValidCccd':
      return isValidCccd(input.code as string);
    case 'parseCccd':
      return parseCccd(input.code as string);
    case 'isValidCmnd':
      return isValidCmnd(input.code as string);
    case 'classifyId':
      return classifyId(input.value as string);
    default:
      throw new Error(`no runner for ${c.fn}`);
  }
}

describe('suite metadata', () => {
  it('declares the schema this runner understands', () => {
    expect(suite.schema).toBe('vn-ident-conformance/1');
  });

  it('records where every table came from', () => {
    // Four sources, not one. A single-source transcription of a weight table or
    // a province list is a typo waiting to be shipped.
    expect(suite.derivedFrom).toMatch(/105\/2020\/TT-BTC/);
    expect(suite.derivedFrom).toMatch(/124\/2004/);
    expect(suite.derivedFrom).toMatch(/cross-checked/);
  });

  it('has unique case ids', () => {
    const ids = suite.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has cases for every function it claims', () => {
    for (const fn of suite.functions) {
      const count = suite.cases.filter((c) => c.fn === fn).length;
      expect(count, fn).toBeGreaterThan(0);
      expect(count, fn).toBe(suite.caseCounts[fn]);
    }
  });
});

describe('the tables match the suite', () => {
  it('tax weights', () => {
    // Nine weights, and they are not a progression. That is precisely why they
    // are transcribed and pinned rather than computed.
    expect([...MST_WEIGHTS]).toEqual(tables.mstWeights);
    expect(MST_MODULUS).toBe(tables.mstModulus);
    expect(MST_WEIGHTS).toHaveLength(9);
  });

  it('63 provinces, no duplicate codes, no duplicate names', () => {
    expect(PROVINCES).toHaveLength(63);
    expect(tables.provinces).toHaveLength(63);
    const codes = PROVINCES.map(([code]) => code);
    expect(new Set(codes).size).toBe(codes.length);
    const names = PROVINCES.map(([, name]) => name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('the fourth digit covers all ten values', () => {
    expect(CENTURY_GENDER).toHaveLength(10);
    const digits = CENTURY_GENDER.map(([d]) => Number(d));
    expect([...digits].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Two per century, male then female, and the sexes are never the same.
    for (const [, century, gender] of CENTURY_GENDER) {
      expect([20, 21, 22, 23, 24]).toContain(century);
      expect(['male', 'female']).toContain(gender);
    }
  });

  it('34 carrier prefixes, none assigned twice', () => {
    const all = CARRIERS.flatMap(([, prefixes]) => prefixes);
    expect(all).toHaveLength(34);
    expect(new Set(all).size).toBe(all.length);
    expect(ASSIGNED_PREFIX_COUNT).toBe(34);
    expect(tables.carrierCount).toBe(34);
  });
});

describe('conformance', () => {
  it.each(suite.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(run(c), c.note).toEqual(c.expected);
  });
});

describe('the tax check digit', () => {
  it('reproduces the worked example printed in the circular', () => {
    // The one anchor that comes from outside this repository. Everything else
    // about the tax rules is a transcription; this is the transcription being
    // checked against its source.
    expect(mstCheckDigit('010004751')).toBe(6);
    expect(isValidMst('0100047516')).toBe(true);
  });

  it('returns null when the sum is divisible by 11, rather than 10', () => {
    // 10 - 0 is 10, which is not a digit, so the circular skips the sequence
    // number. A naive implementation returns 10 and then compares it against a
    // character, so it rejects valid codes without ever saying why.
    expect(mstCheckDigit('000000000')).toBeNull();
    expect(isValidMst('0000000000')).toBe(false);
    // No digit makes it valid, which is the point.
    for (let d = 0; d <= 9; d += 1) {
      expect(isValidMst(`000000000${d}`), `check digit ${d}`).toBe(false);
    }
  });

  it('produces every digit from 0 to 9 and nothing else', () => {
    const seen = new Set<number>();
    for (let n = 0; n < 40000 && seen.size < 10; n += 1) {
      const prefix = String(n).padStart(9, '0');
      const check = mstCheckDigit(prefix);
      if (check !== null) seen.add(check);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('exactly one tenth digit is accepted, for any real code', () => {
    // The property the whole thing rests on: change any digit and the code is
    // refused. If two digits passed, the check digit would not be checking.
    for (const prefix of ['010004751', '030475101', '790000000', '012345678']) {
      const accepted = [];
      for (let d = 0; d <= 9; d += 1) {
        if (isValidMst(`${prefix}${d}`)) accepted.push(d);
      }
      expect(accepted, prefix).toEqual([mstCheckDigit(prefix)]);
    }
  });

  it('refuses a code whose last ten digits are right but whose branch is not', () => {
    expect(isValidMst('0100047516001')).toBe(true);
    expect(isValidMst('0100047516000')).toBe(false);
    expect(isValidMst('0100047516999')).toBe(true);
    expect(isValidMst('01000475161000')).toBe(false);
  });

  it('refuses whitespace and separators rather than trimming them', () => {
    // A paste that arrives with a trailing space is a visible error, not a
    // silent success that hides a broken integration.
    expect(isValidMst('0100047516')).toBe(true);
    expect(isValidMst('0100047516 ')).toBe(false);
    expect(isValidMst(' 0100047516')).toBe(false);
    expect(isValidMst('01.00047516')).toBe(false);
    // The hyphen the circular prints is the one exception, and it is in the
    // right place.
    expect(isValidMst('0100047516-001')).toBe(true);
  });

  it('rejects a prefix that is not nine digits rather than guessing', () => {
    expect(() => mstCheckDigit('123')).toThrow(TypeError);
    expect(() => mstCheckDigit('0100047516')).toThrow(TypeError);
  });
});

describe('the serial keeps its leading zeros', () => {
  it('is a string, because 0004751 and 4751 are different numbers here', () => {
    const parsed = parseMst('0100047516');
    expect(parsed).not.toBeNull();
    expect(parsed?.serial).toBe('0004751');
    expect(typeof parsed?.serial).toBe('string');
  });

  it('a 13-digit code is the same ten digits plus a branch', () => {
    const ten = parseMst('0100047516');
    const thirteen = parseMst('0100047516001');
    expect(thirteen?.regionCode).toBe(ten?.regionCode);
    expect(thirteen?.serial).toBe(ten?.serial);
    expect(thirteen?.checkDigit).toBe(ten?.checkDigit);
    expect(ten?.branch).toBeNull();
    expect(thirteen?.branch).toBe('001');
  });
});

describe('phone numbers', () => {
  it('reduces every spelling of one number to the same ten digits', () => {
    const expected = '0912345678';
    for (const input of [
      '0912345678', '+84912345678', '84912345678', '840912345678',
      '0912 345 678', '0912-345-678', '0912.345.678', '(0912) 345678',
      '  0912345678  ',
    ]) {
      expect(normalizePhone(input), input).toBe(expected);
    }
  });

  it('the one inference it makes is switchable', () => {
    // A bare nine-digit number could be a national number missing its trunk
    // zero, or a number that is simply short. The default recovers it because
    // that is how it arrives from a form; the option refuses it.
    expect(normalizePhone('912345678')).toBe('0912345678');
    expect(normalizePhone('912345678', { assumeTrunkZero: false })).toBeNull();
  });

  it('refuses a number from somewhere else rather than reshaping it', () => {
    expect(normalizePhone('+12025550143')).toBeNull();
    expect(normalizePhone('8491234567')).toBeNull();
    expect(normalizePhone('09123456789')).toBeNull();
    expect(normalizePhone('091234567')).toBeNull();
  });

  it('names the carrier for every assigned prefix', () => {
    // A national number is ten digits and the prefix is its first three, so
    // "032" is the start of 0321234567 -- it already includes the trunk zero.
    for (const [name, prefixes] of CARRIERS) {
      for (const prefix of prefixes) {
        expect(detectCarrier(`${prefix}3456789`), prefix).toBe(name);
      }
    }
  });

  it('a valid number can belong to nobody', () => {
    // 34 of the 100 three-digit prefixes are assigned. The rest are not, and
    // "unassigned" is a different answer from "invalid".
    expect(isValidPhone('0953456780')).toBe(true);
    expect(detectCarrier('0953456780')).toBeNull();
    expect(detectCarrier('0800123456')).toBeNull();
    expect(isValidPhone('0800123456')).toBe(true);
  });

  it('does not normalise inside detectCarrier', () => {
    // Guessing the trunk zero is how a number ends up attributed to the wrong
    // network, which then decides which carrier portal the user is sent to.
    expect(detectCarrier('912345678')).toBeNull();
    expect(detectCarrier('+84912345678')).toBeNull();
  });
});

describe('card numbers', () => {
  it('accepts every province code in the table', () => {
    for (const [code] of PROVINCES) {
      expect(isValidCccd(`${code}098512345`), code).toBe(true);
    }
  });

  it('refuses a gap in the numbering, because a gap is not an assignment', () => {
    expect(isValidCccd('000098512345')).toBe(false);
    expect(isValidCccd('003098512345')).toBe(false);
    expect(isValidCccd('097098512345')).toBe(false);
  });

  it('reads the birth year using the century digit, not just the two digits', () => {
    // 85 in the fourth digit 0 is 1985; in the fourth digit 2 it is 2085. This
    // is the whole reason the fourth digit exists.
    expect(parseCccd('001085123456')?.birthYear).toBe(1985);
    expect(parseCccd('001285123456')?.birthYear).toBe(2085);
    expect(parseCccd('001285123456')?.century).toBe(21);
  });

  it('covers all ten fourth digits', () => {
    for (const [digit, century, gender] of CENTURY_GENDER) {
      const parsed = parseCccd(`001${digit}85123456`);
      expect(parsed?.century, digit).toBe(century);
      expect(parsed?.gender, digit).toBe(gender);
      expect(parsed?.birthYear, digit).toBe((century - 1) * 100 + 85);
    }
  });

  it('does not pretend to know whether the person is alive', () => {
    // A year in the future parses. There is no check digit, so nothing here can
    // detect it, and a date-dependent "valid" would make the conformance suite
    // change answer on its own. The fourth digit 8 is the twenty-fourth
    // century, so 99 under it is 2399.
    expect(parseCccd('001899999999')?.birthYear).toBe(2399);
    expect(parseCccd('001000000000')?.birthYear).toBe(1900);
  });

  it('refuses a card number with the country code in front', () => {
    expect(isValidCccd('+84001098512345')).toBe(false);
  });
});

describe('classifyId', () => {
  it('sorts out the four shapes', () => {
    expect(classifyId('001098512345')).toBe('cccd');
    expect(classifyId('001001001')).toBe('cmnd');
    expect(classifyId('0100047516')).toBe('mst');
    expect(classifyId('0100047516001')).toBe('mst');
    expect(classifyId('0912345678')).toBe('phone');
    expect(classifyId('')).toBe('unknown');
    expect(classifyId('abc')).toBe('unknown');
  });

  it('prefers the card reading when a twelve-digit value could be either', () => {
    // A ten-digit number is ambiguous between a tax code and a phone number,
    // and the tenth digit is what tells them apart. A twelve-digit number is
    // unambiguous, because a dependent tax unit is thirteen digits.
    expect(classifyId('0912345678')).toBe('phone');
    expect(classifyId('0912345679')).toBe('phone');
    expect(isValidMst('0912345679')).toBe(false);
  });
});
