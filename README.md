# vn-toolkit

Small, sharp packages for Vietnamese text in production. TypeScript and Python,
zero runtime dependencies, and every one of them validated against a shared
conformance suite that both ports read.

| package | what it does | npm | PyPI |
|---|---|---|---|
| [`vn-text`](./packages/vn-text-ts) | Search keys and text repair — the `Đ` problem | `@vntoolkit/vn-text` | [`vn-text`](./packages/vn-text-py) |
| [`vn-collate`](./packages/vn-collate-ts) | Vietnamese sort order, as a key you can store | `@vntoolkit/vn-collate` | [`vn-collate`](./packages/vn-collate-py) |

```ts
import { fold } from '@vntoolkit/vn-text';
import { sort } from '@vntoolkit/vn-collate';

fold('Đặng Minh Anh');     // 'dang minh anh'
sort(['Đặng', 'Anh', 'Bảo', 'bao']);
// ['Anh', 'bao', 'Bảo', 'Đặng']
```

```python
from vn_text import fold
from vn_collate import sort

fold('Đặng Minh Anh')     # 'dang minh anh'
sort(['Đặng', 'Anh', 'Bảo', 'bao'])
# ['Anh', 'bao', 'Bảo', 'Đặng']
```

## The idea

Vietnamese text breaks text libraries in ways that are quiet. Nothing throws,
nothing looks wrong, and the result is a search box that finds fewer results
than it should — the hardest kind of bug to notice, and the kind that gets
attributed to the user.

This repository exists because that class of bug is not a matter of taste, it
is a matter of the Unicode specification. `Đ` is U+0110 and it has no
canonical decomposition. There is no flag, no option and no Unicode version
that makes `normalize('NFD')` fold it. Every library that looks like it does
this is really doing something else, and the difference only shows up on the
characters that matter.

So rather than shipping opinions, this repository ships **corpora**.

## The conformance suites are the asset

```
conformance/vn-text-1.0.0.json      156 cases / 6 functions
conformance/vn-collate-1.0.0.json   519 cases / 33 letters
```

Each suite is read by **both** the TypeScript port and the Python port. The
corpus is the part worth reusing: it is what tells you whether an
implementation is actually correct, including for the characters nobody thought
to test.

```
conformance/vn-collate-1.0.0.json
packages/vn-collate-ts/test/conformance.test.ts   <- reads it
packages/vn-collate-py/tests/test_vn_collate.py  <- reads the same file
```

Three levels of check, because each catches a different class of mistake.

1. **The suite** — every case, both languages, identical results.
2. **Metadata assertions** — unique case ids, every declared function covered,
   no case referencing a function the runner does not implement. The suite fails
   loudly instead of silently skipping.
3. **Named regressions** — the headline behaviours are also asserted by name in
   both ports, so they stay visible in test output instead of hiding in a JSON
   file.

And one check that the suite cannot make on its own, because it needs both
runtimes at once:

```bash
node scripts/verify-collate-parity.mjs
```

A suite pins the **order**, which a self-consistent port satisfies on its own.
Two implementations can order identically and still emit sort keys that a
database sorts differently — and that stays invisible until someone stores a
key written by Node next to one written by Python. So that script runs both real
ports over 445 strings and compares the keys byte for byte.

The collation suite is also **generated, not hand-written**:
`scripts/generate-collation-conformance.mjs` probes `Intl.Collator('vi-VN')` and
emits both the table and the cases, recording the runtime in a `derivedFrom`
field. Weights are never written from memory, and an ICU change surfaces as a
diff in review rather than as a silent behaviour change in production.

```bash
npm run verify        # typecheck, tests, build, both parity checks
```

## The two problems

### `vn-text` — `Đ` has no decomposition

The obvious implementation — normalise to NFD, strip the combining marks,
compose back — silently fails:

```
'Đặng Minh'  ->  'Đang Minh'   // the Đ that will not go away
```

The search key no longer matches anything a user can type, because nobody types
`Đang` to find `Đặng`.

And the obvious repair makes it worse. The Icelandic letter `Ð` (U+00D0) looks
the same but is a different letter, and a blanket rule that folds any stroked
`D` corrupts Icelandic and Danish names. So the two cases have to be told apart
on purpose:

| function | what it does | `Đặng` | `Ðor` |
|---|---|---|---|
| `deaccent` | remove tone marks only | `Đang` | `Ðor` |
| `stripStroke` | `đ`→`d`, U+0110/U+0111 only | `Dặng` | `Ðor` |
| `repairMojibake` | `Ð`→`Đ`, assumes Vietnamese | `Đặng` | `Đor` |
| `fold` | search key, deaccent + stripStroke | `dang` | `ðor` |

`repairMojibake` is not a differentiator — it is the same repair
[`underthesea.text_normalize`](https://github.com/undertheseanlp/underthesea)
already does, and it is here because the operation deserves its own name and
its own pinned behaviour. It is honest to call it parity rather than novelty.

→ [Full API and scope](./packages/vn-text-ts/README.md)

### `vn-collate` — nobody has the sort order

`Đặng` should sort next to `Dang`, not after `Z`. Postgres has no Vietnamese
collation; MySQL ships one whose behaviour depends on server version and
configuration rather than on anything you can pin.

`vn-collate` builds a **sort key** whose byte order is the Vietnamese collation
order, so the database only has to do byte comparison — which every database
already gets right.

| | |
|---|---|
| letters | `a ă â b c d đ e ê f g h i j k l m n o ô ơ p q r s t u ư v w x y z` |
| tones | `none > huyền > hỏi > ngã > sắc > nặng` |
| digits | before every letter |

A key rather than a comparator, because a key is the only formulation that
answers range queries, exact lookups, multi-column `ORDER BY` and indexes — and
the only one where a Node service and a Python service agree on the bytes.

→ [Full API, SQL examples and known limitations](./packages/vn-collate-ts/README.md)

## This is a small problem with mature solutions around it

Use the right tool. These are all worth knowing about, and none of them is
replaced by anything here.

| project | what it is good at |
|---|---|
| [**underthesea**](https://github.com/undertheseanlp/underthesea) | The dominant Vietnamese NLP toolkit, ~27,000 downloads a month. Its `text_normalize` already maps `Ð` → `Đ` and fixes regional spelling. **Start here** if you are building Vietnamese NLP. |
| [**VietnameseTextNormalizer**](https://github.com/langmaninternet/VietnameseTextNormalizer) | C++, the reference implementation for tone-mark placement and vowel composition (`hoà` → `hòa`). |
| [**vietnormalizer**](https://github.com/nghimestudio/vietnormalizer) | Pure Python, zero-dependency, aimed at TTS. Has a published paper. |
| [**undertheseanlp/NLP-Vietnamese-progress**](https://github.com/undertheseanlp/NLP-Vietnamese-progress) | The community's task-and-tool index for Vietnamese NLP. |

`vn-text` does not overlap with those on canonicalisation — they produce a
*correct spelling*, this produces a *search key* and a *sort key*. `vn-collate`
does not overlap with anything: search keys are the well-served part of this
space, collation is the part nobody has done.

The two approaches disagree about `Ð` on purpose. `underthesea` maps it to `Đ`
because in Vietnamese data it is essentially always damage. `repairMojibake`
does the same, for the same reason. `fold` leaves it alone, because its job is
to produce a key and not to reinterpret letters. All three answers are correct
for different inputs, and the suite pins each one so none can be changed
silently.

If you are building something in this space and would rather not have written
this part yourself, the corpora are here to be reused.

## What this is not

Being explicit, because a conformance suite is only worth anything if it is
honest about what it covers.

- **No tone-mark canonicalisation.** `hóa` and `hòa` are not unified. Vietnamese
  tone placement depends on syllable structure — `hòa` and `toán` share the
  nucleus `oa` but mark different vowels, because one syllable is open and one
  is closed. Getting this right needs a nucleus table validated by native
  speakers, and shipping a wrong table would be worse than shipping none.
- **No fuzzy matching.** Typing `ko bít` will not match `không biết`. That is
  a search problem, not a text problem.
- **No byte-level mojibake recovery.** Damage of the form `Ä Ä¡` comes from
  UTF-8 bytes decoded as Windows-1252, and undoing it needs the original bytes,
  not a character mapping. There is a library for that (`ftfy` in Python);
  guessing at it from a Unicode string is not reliable enough to ship.
- **`vn-collate` sorts punctuation and spaces after letters, not before.** ICU
  sorts them first. Corpora that are internally consistent order identically;
  a corpus that mixes `Nguyễn Văn An` with `NguyễnVănAn` does not. Precise
  details and the other boundaries are in the
  [package README](./packages/vn-collate-ts/README.md#known-limitations).
- **`isVietnamese` is a character heuristic, not a language detector.**
  `Nguyen`, `Tran` and `Le` are pure ASCII and return `false`.
- **`deaccent` applies to all Unicode.** `café` → `cafe`. That is intentional:
  it uses NFD, not NFKD, so compatibility characters like the `ﬁ` ligature
  survive. NFKD would silently rewrite English text.

## The one real port risk

`vn-text`'s `fold()` classifies characters, and the two ports use different
classifiers: Python's `str.isalnum()` versus JavaScript's `\p{L}\p{N}`. They
agree across all 127 distinct characters in the current corpus, measured by
`scripts/verify-port-parity.mjs` — but they are not guaranteed to agree for
every code point forever. The conformance suite is the mechanism that would
surface it, and adding a character to the corpus is how you pin it down.

`vn-collate` has no equivalent risk. It runs both real interpreters and
compares keys byte for byte, so the question is answered rather than measured.

## Contributing

Three rules, in [CONTRIBUTING.md](./CONTRIBUTING.md), non-negotiable:

1. **The conformance suite is a contract.** It is the asset. Changing a case to
   make a port go green defeats the entire purpose of the repository.
2. **Never edit an existing case to make it pass.** A case that no longer holds
   gets a new case alongside it that documents the new behaviour, with a `note`
   explaining what changed. Deleting a case is deleting the test.
3. **Fix one port, fix both.** A behaviour change in TypeScript that is not
   mirrored in Python is a regression, not a feature.

## Licence

MIT. See [LICENSE](./LICENSE).
