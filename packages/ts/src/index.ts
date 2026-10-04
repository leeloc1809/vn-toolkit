import { NON_ALPHANUMERIC } from './unicode.js';

/** Signature shared by every string-to-string transform in this package. */
export type UnicodeFn = (input: string) => string;

/**
 * Normalise to Unicode Normalization Form C (composed).
 *
 * This is the form you want for storage, database keys, equality checks and
 * deduplication. Two strings that look identical to a user can differ at the
 * code-point level if one came from a Windows-1252 editor and the other from
 * a UTF-8 terminal; NFC collapses them.
 */
export function normalize(input: string): string {
  return input.normalize('NFC');
}

/**
 * Normalise to Unicode Normalization Form D (decomposed).
 *
 * Vietnamese letters like `ế` become a base `e` plus the combining marks
 * U+0302 (circumflex) and U+0301 (acute). Exposed because downstream code
 * that walks combining marks needs the decomposed form.
 */
export function decompose(input: string): string {
  return input.normalize('NFD');
}

/**
 * Remove every combining diacritical mark, leaving the base letters intact.
 *
 * Applies to all of Unicode, not just Vietnamese — `café` becomes `cafe`,
 * `Ѐ` becomes `Е`.
 *
 * ## What this function deliberately does NOT do
 *
 * It does not fold `đ` (U+0111) to `d`. Vietnamese D-WITH-STROKE has no
 * canonical decomposition, so it survives NFD untouched and comes back out as
 * `đ`. That is the correct behaviour: stripping tone marks should not change
 * which letter you are looking at. Use {@link stripStroke} or {@link fold} when
 * you need `đ` to become `d`.
 *
 * It also leaves `Ð` (U+00D0, ETH) alone, because ETH is a real letter in
 * Icelandic and Danish, not a decorated D.
 *
 * @example
 * deaccent('Tiếng Việt')  // 'Tieng Viet'
 * deaccent('Đặng Minh')   // 'Đang Minh'   <- letter identity preserved
 * deaccent('Ðor')         // 'Ðor'          <- ETH untouched
 */
export function deaccent(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC');
}

/**
 * Replace Vietnamese D-WITH-STROKE (`đ` U+0111, `Đ` U+0110) with plain
 * `d` / `D`. Nothing else is changed.
 *
 * ETH (`Ð` U+00D0, `ð` U+00F0) is intentionally left alone — it is a
 * different letter belonging to another script.
 *
 * @example
 * stripStroke('Đặng')  // 'Dang'
 * stripStroke('Ðor')   // 'Ðor'
 */
export function stripStroke(input: string): string {
  return input.replace(/[\u0110\u0111]/g, (c) => (c === '\u0110' ? 'D' : 'd'));
}

/**
 * Produce a search key: accent-free, stroke-free, lower-cased, with all
 * punctuation and symbols collapsed to single spaces.
 *
 * The canonical form for indexing Vietnamese search. Two strings that a user
 * would consider the same search hit produce the same key:
 *
 * @example
 * fold('Cái gì thế này')   // 'cai gi the nay'
 * fold('  CÁI   GÌ  thế này ') // 'cai gi the nay'
 * fold('Đặng Minh Anh')   // 'dang minh anh'
 *
 * Letters from other scripts are preserved rather than dropped, so
 * `fold('東京 Tokyo')` gives `'東京 tokyo'` — the ideographs stay searchable
 * even though they carry no diacritics.
 */
export function fold(input: string): string {
  return stripStroke(deaccent(input))
    .toLowerCase()
    // Lower-casing can reintroduce combining marks, e.g. U+0130 İ -> i + U+0307.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(NON_ALPHANUMERIC, ' ')
    .trim()
    .replace(/ {2,}/g, ' ');
}

/**
 * True when the string contains at least one Vietnamese-specific character.
 *
 * Useful for deciding whether a string needs Vietnamese-aware handling at
 * all. Note this is a fast heuristic, not a language detector: the common
 * Vietnamese surnames `Nguyen`, `Tran` and `Le` are pure ASCII and will
 * return false.
 */
export function isVietnamese(input: string): boolean {
  return /[\u0110\u0111\u1ea0-\u1ef9]/.test(input);
}
