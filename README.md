# vn-text

**Correct Unicode primitives for Vietnamese text.** Zero dependencies, TypeScript
and Python, validated against one shared conformance suite.

```ts
import { fold } from '@vntoolkit/vn-text';

fold('Đặng Minh Anh');   // 'dang minh anh'
fold('Hà Nội, Việt Nam!'); // 'ha noi viet nam'
fold('Cái gì thế này');   // 'cai gi the nay'
```

```python
from vn_text import fold

fold('Đặng Minh Anh')    # 'dang minh anh'
fold('Hà Nội, Việt Nam!')  # 'ha noi viet nam'
```

---

## The bug this library exists to fix

Vietnamese D-WITH-STROKE has **no canonical decomposition**. `Đ` is U+0110, and
NFD leaves it exactly as it is, because Unicode treats it as a letter in its own
right rather than a decorated `D`.

So the obvious implementation — normalise to NFD, strip the combining marks,
compose back — silently fails to fold it:

```js
'NFD + strip combining marks'
'Đặng Minh'  ->  'Đang Minh'   // note the Đ that will not go away
```

The index key no longer matches anything a user can type, because nobody types
`Đang` to find `Đặng`. Nothing throws. Nothing looks wrong. Search just quietly
returns fewer results than it should — a **false negative**, which is the hardest
kind of text-handling bug to notice.

## And why the obvious repair makes it worse

The Icelandic letter ETH, `Ð` (U+00D0), looks the same but is a different
letter. Neither it nor `ð` has a decomposition either, so NFD leaves them alone
too — but the tempting fix for the problem above is a blanket rule that folds any
stroked `D`. That rule also converts `Ð` to `D` and corrupts Icelandic and Danish
names. Transliteration tables that treat `Đ` as decoration hit exactly this.

So the two cases have to be told apart on purpose. `vn-text` separates the
operations so each does one thing, and the conformance suite pins both:

| function | what it does | `Đặng` | `Ðor` |
|---|---|---|---|
| `deaccent` | remove tone marks only | `Đang` | `Ðor` |
| `stripStroke` | `đ`→`d`, U+0110/U+0111 only | `Dặng` | `Ðor` |
| `fold` | search key, both of the above | `dang` | `ðor` |

## Why a conformance suite instead of unit tests

Both ports read the **same** `conformance/vn-text-1.0.0.json`. 139 cases, hand
authored, each with a note explaining what breaks if you get it wrong.

That file is the asset. Copy the library if you want, but the corpus is what
tells you whether your implementation is actually correct — including for the
characters nobody thought to test.

```
conformance/vn-text-1.0.0.json
packages/ts/test/conformance.test.ts    <- reads it
packages/py/tests/test_conformance.py   <- reads the same file
```

Three levels of check, because each catches a different class of mistake:

1. **The suite** — 139 cases, both languages, byte-identical results.
2. **Metadata assertions** — unique case ids, every declared function covered,
   no case referencing a function the runner does not implement. The suite fails
   loudly instead of silently skipping.
3. **Named regressions** — the `đ`/`Ð` cases are also asserted by name in both
   ports, so the headline behaviour stays visible in test output instead of
   hiding in a JSON file.

Run them:

```bash
npm test                                    # TypeScript
python packages/py/tests/test_conformance.py # Python, stdlib only, no install
node scripts/verify-port-parity.mjs          # both ports, no Python needed
```

## What this is not

Being explicit about the limits, because a conformance suite is only worth
anything if it is honest about what it covers.

- **No tone-mark canonicalisation.** `hóa` and `hòa` are not unified. Vietnamese
  tone-mark placement depends on syllable structure — `hòa` and `toán` share the
  nucleus `oa` but put the mark on different vowels, because one syllable is open
  and one is closed. Getting this right needs a nucleus table validated by
  native speakers, and shipping a wrong table would be worse than shipping none.
  Planned for v1.
- **No fuzzy matching.** Typing `ko bít` on an unaccented keyboard will not match
  `không biết`. That is `vn-search`, and it is a search problem, not a text
  problem.
- **No collation or sorting.** `Đặng` should sort next to `Dang`, not after `Z`.
  That is `vn-collate`.
- **`isVietnamese` is a character heuristic, not a language detector.** `Nguyen`,
  `Tran` and `Le` are pure ASCII and return `false`.
- **`deaccent` applies to all Unicode.** `café` → `cafe`, and Cyrillic `Ѐ` → `Е`.
  That is intentional: it uses NFD, not NFKD, so compatibility characters like the
  `ﬁ` ligature are left alone. NFKD would silently rewrite English text.

## The one real port risk

`fold()` classifies characters, and the two ports use different classifiers:
Python's `str.isalnum()` versus JavaScript's `\p{L}\p{N}`. They agree across all
127 distinct characters in the current corpus, measured by
`scripts/verify-port-parity.mjs` — but they are not guaranteed to agree for
every code point forever. The conformance suite is the mechanism that would
surface it, and adding a character to the corpus is how you pin it down.

## API

```ts
normalize(s: string): string      // NFC — for storage, keys, equality
decompose(s: string): string      // NFD — for walking combining marks
deaccent(s: string): string       // remove tone marks, keep letter identity
stripStroke(s: string): string    // đ -> d, nothing else
fold(s: string): string           // full search key
isVietnamese(s: string): boolean
```

Python mirrors this with `snake_case` plus `stripStroke` / `isVietnamese` aliases,
so call sites port across without renaming.

## Install

```bash
npm install @vntoolkit/vn-text
pip install vn-text
```

Both are MIT and have no runtime dependencies.

## Licence

MIT. See [LICENSE](./LICENSE).
