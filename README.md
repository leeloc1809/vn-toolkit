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
| `repairMojibake` | `Ð`→`Đ`, assumes the text is Vietnamese | `Đặng` | `Đor` |
| `fold` | search key, deaccent + stripStroke | `dang` | `ðor` |

### The other half of the problem: repairing it

The table above is about producing a search key from text you control. Most
systems also have text you do **not** control, and the single most common
corruption in stored Vietnamese is `Ð` (U+00D0) standing in for `Đ` (U+0110) —
legacy encodings produce it constantly. A record like `Ðặng Minh` can never be
found by anyone typing `Dang`, and nothing throws.

That is what [`underthesea.text_normalize`](https://github.com/undertheseanlp/underthesea)
already does, and at 27,000 downloads a month there is no doubt the need is real.
`repairMojibake` is the same repair, isolated as its own step:

```js
fold(repairMojibake('Ðặng Minh'));  // 'dang minh'  <- findable again
fold('Ðặng Minh');                  // 'ðặng minh'  <- the key, if it was never repaired
```

Note that `repairMojibake('Ðor')` returns `'Đor'`, which is wrong for an Icelandic
name. That is the trade, stated plainly and pinned by `mojibake-011` so it can
never be changed by accident. Use `fold` alone when the corpus may contain
Scandinavian text.

## Why a conformance suite instead of unit tests

Both ports read the **same** `conformance/vn-text-1.0.0.json`. 156 cases, hand
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

1. **The suite** — 156 cases, both languages, byte-identical results.
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

## See also

This is a small problem with mature, active solutions around it. Use the right
tool:

| project | what it is good at |
|---|---|
| [**underthesea**](https://github.com/undertheseanlp/underthesea) | The dominant Vietnamese NLP toolkit. Its `text_normalize` already maps `Ð` → `Đ` and fixes regional spelling. Start here. |
| [**VietnameseTextNormalizer**](https://github.com/langmaninternet/VietnameseTextNormalizer) | C++, the reference implementation for tone-mark placement and vowel composition (`hoà` → `hòa`). |
| [**vietnormalizer**](https://github.com/nghimestudio/vietnormalizer) | Pure Python, zero-dependency, aimed at TTS. Has a published paper. |
| [**undertheseanlp/NLP-Vietnamese-progress**](https://github.com/undertheseanlp/NLP-Vietnamese-progress) | The community's task-and-tool index for Vietnamese NLP. |

`vn-text` does not overlap with those on canonicalisation. They are about
producing a *correct spelling*. This library is about producing a *search key* and
a *sort key* — `Đặng` next to `Dang` rather than after `Z` — which none of them
covers. And it is the only one of the group with a TypeScript port and a
cross-language conformance suite.

The two approaches disagree about `Ð`, on purpose. `underthesea` maps it to `Đ`
because in Vietnamese data it is essentially always damage.
[`repairMojibake`](#api) does the same, for the same reason. [`fold`](#api) leaves
it alone, because its job is to produce a key and not to reinterpret letters. All
three answers are correct for different inputs, and the suite pins each one so
none of them can be changed silently.

If you are building something in this space and would rather not have written
this part yourself, the corpus is here to be reused.

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
- **No byte-level mojibake recovery.** `repairMojibake` handles the character-level
  `Ð`/`Đ` confusion. Damage of the form `Ä Ä¡` or `á»Æ` comes from UTF-8 bytes
  decoded as Windows-1252, and undoing it needs the original bytes, not a
  character mapping. There are dedicated libraries for that (`ftfy` in Python);
  guessing at it from a Unicode string is not reliable enough to ship.
- **No collation or sorting.** `Đặng` should sort next to `Dang`, not after `Z`.
  That is `vn-collate`, and it is the least-served part of this whole space.
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
repairMojibake(s: string): string // Ð -> Đ, for damaged legacy data
fold(s: string): string           // full search key
isVietnamese(s: string): boolean
```

Compose rather than reaching for a single mega-function, because the order
matters and different corpora need different ones:

```ts
fold(s)                        // clean input
fold(repairMojibake(s))        // Vietnamese input that may be damaged
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
