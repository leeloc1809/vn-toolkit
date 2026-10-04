import {
  DIGITS,
  DIGIT_PRIMARY_BASE,
  FALLBACK_PRIMARY,
  LETTER_MODIFIERS,
  PRIMARY_INDEX,
  TONE_MARKS,
} from './weights.js';

export {
  PRIMARY_ORDER,
  TONE_ORDER,
  LETTER_MODIFIERS,
  TONE_MARKS,
  FALLBACK_PRIMARY,
  DIGIT_PRIMARY_BASE,
  LETTER_PRIMARY_BASE,
} from './weights.js';

/** The three comparison levels, plus the terminator after each. */
type Weights = {
  primary: number[];
  secondary: number[];
  tertiary: number[];
};

const TERMINATOR = 0x00;

/**
 * Split a string into clusters of one base character plus its combining marks.
 *
 * This has to run on the NFD form. NFC does not guarantee that a combining
 * mark stays attached to its base — `B` followed by U+0301 has no precomposed
 * form, so NFC leaves it as two code points, and walking that string would
 * treat the bare acute accent as a character of its own. NFD always leaves
 * marks trailing their base, so the grouping is unambiguous.
 */
function clusters(input: string): string[] {
  const out: string[] = [];
  for (const ch of input.normalize('NFD')) {
    if (out.length > 0 && COMBINING_MARK.test(ch)) {
      out[out.length - 1] += ch;
    } else {
      out.push(ch);
    }
  }
  return out;
}

const COMBINING_MARK = /\p{M}/u;

function weightsFor(cluster: string): [number, number, number] {
  let base = '';
  let modifiers = '';
  let tone = 0;

  for (const mark of cluster) {
    if (TONE_MARKS.has(mark)) {
      const weight = TONE_MARKS.get(mark) as number;
      // Deterministic when a character carries more than one tone mark:
      // the heaviest wins. Documented rather than accidental.
      if (weight > tone) tone = weight;
    } else if (LETTER_MODIFIERS.has(mark)) {
      modifiers += mark;
    } else if (base === '') {
      base = mark;
    }
  }

  // Recompose the base letter from its modifiers so ă, â, ê, ô, ơ and ư find
  // their own primary instead of collapsing onto a, e, o or u.
  const letter = (base + modifiers).normalize('NFC');

  // The table is lowercase. Case belongs on the tertiary level, so look the
  // letter up folded and record the case separately — otherwise every capital
  // lands in the fallback bucket and sorts after all the lowercase.
  const folded = letter.toLowerCase();

  let primary = PRIMARY_INDEX.get(folded);

  if (primary === undefined) {
    const digit = DIGITS.indexOf(folded);
    primary = digit >= 0 ? DIGIT_PRIMARY_BASE + digit : FALLBACK_PRIMARY;
  }

  return [primary, tone, letter !== folded ? 1 : 0];
}

function weights(input: string): Weights {
  const primary: number[] = [];
  const secondary: number[] = [];
  const tertiary: number[] = [];

  for (const cluster of clusters(input)) {
    const [p, s, t] = weightsFor(cluster);
    primary.push(p);
    secondary.push(s);
    tertiary.push(t);
  }

  return { primary, secondary, tertiary };
}

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build a sort key for `input`, as a hex string.
 *
 * ## Why the key is emitted level by level
 *
 * Interleaving the levels per character is the obvious encoding and it is
 * wrong. Comparing `"ab"` against `"á"` that way looks at the tone of the
 * second character before noticing that `"á"` has no second character, and
 * orders `"ab"` first. ICU orders `"á"` first, because a string that ends
 * earlier in the primary level sorts first. So the key is laid out primaries,
 * then secondaries, then tertiaries, each terminated — the same shape the
 * Unicode Collation Algorithm uses.
 *
 * ## Storing the key
 *
 * The key is **hex**, not raw bytes, so that both ports return the same type
 * and the value can live in a text column.
 *
 * That does not mean you can sort it with the database's default collation.
 * `ORDER BY key` on a `text`/`varchar` column re-sorts the key with the
 * column's own rules and produces nonsense. It has to be a binary
 * comparison:
 *
 * - Postgres: `bytea`, or `text COLLATE "C"`
 * - MySQL: `varbinary`, or `varchar` with `COLLATE utf8mb4_bin`
 *
 * @example
 * collateKey('Đặng') < collateKey('Dũng')   // false — Đ follows D
 * collateKey('a')    < collateKey('A')      // true
 * collateKey('1')    < collateKey('An')     // true — digits first
 */
export function collateKey(input: string): string {
  const w = weights(input);
  return toHex([
    ...w.primary, TERMINATOR,
    ...w.secondary, TERMINATOR,
    ...w.tertiary, TERMINATOR,
  ]);
}

/**
 * Compare two strings the way ICU's Vietnamese collation does.
 *
 * Defined as a comparison of their sort keys, so `compare` and `collateKey`
 * can never disagree with each other.
 *
 * @example
 * compare('Đặng', 'Dũng')   // 1
 * compare('Thảo', 'Thao')   // 1
 * compare('bao', 'Bảo')     // -1
 */
export function compare(a: string, b: string): -1 | 0 | 1 {
  const ka = collateKey(a);
  const kb = collateKey(b);
  if (ka === kb) return 0;
  // Hex digits compare in value order under both UTF-16 code unit order and
  // Python code point order, so a plain string comparison is a byte comparison.
  return ka < kb ? -1 : 1;
}

/**
 * Sort a list of strings by Vietnamese collation order.
 *
 * Does not mutate the input.
 *
 * @example
 * sort(['Đặng', 'Anh', 'Bảo', 'bao'])
 * // ['Anh', 'bao', 'Bảo', 'Đặng']
 */
export function sort<T>(items: readonly T[], key: (item: T) => string = String): T[] {
  return items
    .map((item, index) => ({ item, index, key: collateKey(key(item)) }))
    .sort((a, b) => {
      if (a.key === b.key) return a.index - b.index;
      return a.key < b.key ? -1 : 1;
    })
    .map((entry) => entry.item);
}
