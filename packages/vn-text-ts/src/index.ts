import {
  D_WITH_STROKE_LOWER,
  D_WITH_STROKE_UPPER,
  ETH_LOWER,
  ETH_UPPER,
  NON_ALPHANUMERIC,
} from './unicode.js';

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
 * Repair the single most common corruption in stored Vietnamese text: `Ð`
 * (U+00D0) standing in for `Đ` (U+0110), and `ð` (U+00F0) for `đ` (U+0111).
 *
 * This is a **data repair** operation, not a search-key operation. It answers a
 * different question from {@link deaccent} and {@link fold}:
 *
 * - {@link fold} produces a search key and never reinterprets which letter you
 *   have. It leaves `Ð` alone, because in Icelandic and Danish it is a real
 *   letter called eth.
 * - `repairMojibake` assumes the text *is* Vietnamese and that `Ð` is damage.
 *   In Vietnamese text produced by legacy systems, `Ð` is essentially always a
 *   mangled `Đ`, and leaving it in place means a user can never find the record
 *   again.
 *
 * The two answers are both correct, for different inputs. Compose them when you
 * know the corpus is Vietnamese and may be damaged:
 *
 * @example
 * repairMojibake('Ðảm baỏ');        // 'Đảm bảo'
 * fold(repairMojibake('Ðặng Minh')) // 'dang minh'  <- findable again
 * fold('Ðặng Minh')                 // 'ðặng minh'  <- the index key, if it was never repaired
 *
 * ## What it deliberately does not do
 *
 * - **It is Vietnamese-biased by design.** `repairMojibake('Ðor')` returns
 *   `'Đor'`, which is wrong for an Icelandic name. That is the trade, and it is
 *   the right one for a Vietnamese library, but you should not call it on text
 *   you know contains Scandinavian or Icelandic content.
 * - **It does not recover byte-level mojibake.** Damage of the form
 *   `Ä Ä¡` or `á»Æ` comes from UTF-8 bytes being decoded as Windows-1252, and
 *   undoing it needs the original bytes, not a character mapping. There are
 *   dedicated libraries for that (`ftfy` on Python); guessing at it from a
 *   Unicode string is not reliable enough to ship.
 * - **It does not fix spelling or vowel composition.** `lựơng` stays `lựơng`.
 *   Those are separate problems, and VietnameseTextNormalizer and
 *   `underthesea.text_normalize` are the right tools for them.
 */
export function repairMojibake(input: string): string {
  return input
    .replace(new RegExp(ETH_UPPER, 'g'), D_WITH_STROKE_UPPER)
    .replace(new RegExp(ETH_LOWER, 'g'), D_WITH_STROKE_LOWER);
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
 *
 * If the corpus may contain mojibake, repair it first:
 * `fold(repairMojibake(input))`. See {@link repairMojibake} for why that is a
 * separate step rather than something `fold` does itself.
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
