# vn-toolkit

Small, sharp packages for Vietnamese text in production. TypeScript and Python,
zero runtime dependencies, and every one of them validated against a shared
conformance suite that both ports read.

| package | what it does | npm | PyPI |
|---|---|---|---|
| [`vn-text`](./packages/vn-text-ts) | Search keys and text repair — the `Đ` problem | `vn-text` | [`vn-text`](./packages/vn-text-py) |
| [`vn-collate`](./packages/vn-collate-ts) | Vietnamese sort order, as a key you can store | `vn-collate` | [`vn-collate`](./packages/vn-collate-py) |
| [`vn-money`](./packages/vn-money-ts) | VND on integers — format, parse, split, read out | `vn-money` | [`vn-money`](./packages/vn-money-py) |
| [`vn-ident`](./packages/vn-ident-ts) | Tax codes, phone numbers, card numbers | `vn-ident` | [`vn-ident`](./packages/vn-ident-py) |

```ts
import { fold } from 'vn-text';
import { sort } from 'vn-collate';
import { formatVnd, allocate } from 'vn-money';

fold('Đặng Minh Anh');     // 'dang minh anh'
sort(['Đặng', 'Anh', 'Bảo', 'bao']);
// ['Anh', 'bao', 'Bảo', 'Đặng']
formatVnd(12345678);      // '12.345.678 ₫'
allocate(1000000, [1, 1, 1]);   // [333334, 333333, 333333]
```

```python
from vn_text import fold
from vn_collate import sort
from vn_money import format_vnd, allocate

fold('Đặng Minh Anh')     # 'dang minh anh'
sort(['Đặng', 'Anh', 'Bảo', 'bao'])
# ['Anh', 'bao', 'Bảo', 'Đặng']
format_vnd(12345678)      # '12.345.678 ₫'
allocate(1_000_000, [1, 1, 1])   # [333334, 333333, 333333]
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
conformance/vn-text-1.0.0.json      156 cases /  6 functions
conformance/vn-collate-1.0.0.json   519 cases / 33 letters
conformance/vn-money-1.0.0.json    1232 cases /  5 functions
conformance/vn-ident-1.0.0.json     258 cases / 10 functions, 63 provinces
```

Each suite is read by **both** the TypeScript port and the Python port. The
corpus is the part worth reusing: it is what tells you whether an
implementation is actually correct, including for the characters nobody thought
to test.

```
conformance/vn-collate-1.0.0.json
packages/vn-collate-ts/test/collate.test.ts    <- reads it
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

And checks that a single-language suite cannot make on its own, because they need
both runtimes at once:

```bash
node scripts/verify-port-parity.mjs       # 445 strings
node scripts/verify-collate-parity.mjs    # 445 sort keys, byte for byte
node scripts/verify-money-parity.mjs      # 17091 operations
node scripts/verify-ident-parity.mjs      # 673311 operations
```

A suite pins the **order**, which a self-consistent port satisfies on its own.
Two implementations can order identically and still emit sort keys that a
database sorts differently — and that stays invisible until someone stores a
key written by Node next to one written by Python. So that script runs both real
ports over 445 strings and compares the keys byte for byte.

`vn-money` goes further, because a second parser that agrees on the cases nobody
thought of is still a bug waiting for a user. Its parity check builds its own
corpus of 17091 operations, runs both real ports, and compares the answers
directly:

```text
money parity: 17091/17091 operations identical across both ports
```

The collation and money suites are also **generated, not hand-written**:
`scripts/generate-collation-conformance.mjs` probes `Intl.Collator('vi-VN')` and
`scripts/generate-money-conformance.mjs` probes
`Intl.NumberFormat('vi-VN', {style: 'currency'})`, emitting both the tables and
the cases and recording the runtime in a `derivedFrom` field. Weights are never
written from memory, and an ICU change surfaces as a diff in review rather than
as a silent behaviour change in production. The generator **refuses to emit a
case the platform disagrees with**, so the suite cannot quietly drift.

```bash
npm run verify        # typecheck, tests, build, all three parity checks
```

## The four problems

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

### `vn-money` — a comma that means something else

vi-VN groups thousands with a dot and separates decimals with a comma. `en-US`
does the exact opposite, using the same two characters. Every JavaScript
developer has `toLocaleString` in muscle memory and every one of them, once,
produces `1.100.000` where they meant `1,100,000` — a wrong number that still
looks entirely plausible, on an invoice.

| | thousands | decimals |
|---|---|---|
| `vi-VN` | `1.000.000` | `1,5` |
| `en-US` | `1,000,000` | `1.5` |

Then there is ISO 4217 giving VND a **minor unit of 0**, so the library works on
integers and *refuses* a fractional amount instead of rounding it — a money
parser that guesses is worse than one that fails.

```ts
parseVnd('1.5');     // throws, reason 'has-decimal'   — not 1, not 2
allocate(100, [1, 1, 1]);   // [34, 33, 33]  — the parts add back up exactly
```

`allocate` is largest-remainder apportionment with a stated tie-break, so
splitting a bill between three people gives the same answer on a server in
Hanoi and in Frankfurt, and no dong is created or lost. `toWords` reads an
amount out for a cheque, pinned to one of several published Vietnamese
conventions — and naming the reading it rejects at every point they disagree.

The formatting cases were **read out of** `Intl.NumberFormat('vi-VN')`, so
`formatVnd` agrees with the platform byte for byte, including the `U+00A0`
between the digits and the symbol.

→ [Full API, the reading convention and known limitations](./packages/vn-money-ts/README.md)

### `vn-ident` — one of these has a check digit and the other does not

A Vietnamese tax code's tenth digit is computed from its first nine, using nine
weights that are deliberately not a progression. A card number has **no check
digit at all** — the last six digits are random.

Libraries that treat both as "a regex" will tell you a well-formed card number
is valid, which is true and nearly useless. The more interesting failure is
silent: a transposed pair of tax weights still produces a well-formed digit for
every code, so a hand-picked test suite sails past it.

```ts
mstCheckDigit('000000000');    // null, not 10 — and null is the whole point
isValidMst('0100047516');      // true
detectCarrier('0953456780');   // null — 34 of 100 prefixes are assigned
parseCccd('001285123456');     // birthYear 2085; with digit 0 it is 1985
```

The tables come from Thông tư 105/2020/TT-BTC and Quyết định 124/2004/QĐ-TTg,
cross-checked against four published sources — because one of the four prints
Bắc Giang as `023` where the other three and the decree say `024`.

→ [Full API, the sources, and what this cannot verify](./packages/vn-ident-ts/README.md)

## This is a small problem with mature solutions around it

Use the right tool. These are all worth knowing about, and none of them is
replaced by anything here.

| project | what it is good at |
|---|---|
| [**underthesea**](https://github.com/undertheseanlp/underthesea) | The dominant Vietnamese NLP toolkit, ~27,000 downloads a month. Its `text_normalize` already maps `Ð` → `Đ` and fixes regional spelling. **Start here** if you are building Vietnamese NLP. |
| [**VietnameseTextNormalizer**](https://github.com/langmaninternet/VietnameseTextNormalizer) | C++, the reference implementation for tone-mark placement and vowel composition (`hoà` → `hòa`). |
| [**vietnormalizer**](https://github.com/nghimestudio/vietnormalizer) | Pure Python, zero-dependency, aimed at TTS. Has a published paper. |
| [**undertheseanlp/NLP-Vietnamese-progress**](https://github.com/undertheseanlp/NLP-Vietnamese-progress) | The community's task-and-tool index for Vietnamese NLP. |
| [**Babel.js / CLDR**](https://github.com/unicode-org/cldr) | The platform's own answer to sorting and formatting. `Intl` is genuinely good, and `vn-collate` and `vn-money` are pinned to it rather than to an opinion. Use `Intl` when you have it. |

`vn-text` does not overlap with those on canonicalisation — they produce a
*correct spelling*, this produces a *search key* and a *sort key*. `vn-collate`
does not overlap with anything: search keys are the well-served part of this
space, collation is the part nobody has done. `vn-money` is not a text problem
at all — it is here because every other part of this stack ends up formatting a
number somewhere, and because there is no money library here that refuses a
decimal rather than inventing one.

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
- **`vn-money`'s `toWords` follows one reading convention, not all of them.**
  `linh` against `lẻ`, `một` against `mốt`, `bốn` against `tư` are all in
  current use. The choice is stated, pinned and names the alternative it
  rejects — see
  [the convention table](./packages/vn-money-ts/README.md#reading-an-amount-out).
- **`vn-money`'s `allocate` takes whole shares, not arbitrary ratios.**
  `allocate(100, [1, 3])` works; `allocate(100, [0.5, 0.5])` raises. Fractional
  weights would need a scaling denominator, and getting that wrong is a silent
  redistribution rather than a crash.
- **`vn-money` reads at most 15 significant digits**, because `2^53 - 1` is the
  largest amount a JavaScript number holds exactly and the Python port takes the
  same input type.
- **`vn-ident` cannot verify a card number.** There is no check digit. It checks
  shape, a province code that exists, and a defined fourth digit — and it says
  so rather than implying more. It also cannot distinguish an unchipped 12-digit
  card from a chip one; they have the same structure, and the 2025 reduction to
  34 provincial units did not renumber any card.

## The one real port risk

`vn-text`'s `fold()` classifies characters, and the two ports use different
classifiers: Python's `str.isalnum()` versus JavaScript's `\p{L}\p{N}`. They
agree across all 127 distinct characters in the current corpus, measured by
`scripts/verify-port-parity.mjs` — but they are not guaranteed to agree for
every code point forever. The conformance suite is the mechanism that would
surface it, and adding a character to the corpus is how you pin it down.

`vn-collate` has no equivalent risk. It runs both real interpreters and
compares keys byte for byte, so the question is answered rather than measured.

`vn-money` has one of its own, and it is the reason the parity check exists.
Python's `\d` and `\s` are **Unicode-aware**; JavaScript's are not in the same
way. A parser written with `re.compile(r"\d+")` accepts `١٢٣`, and a TypeScript
port written with the same pattern does not. That is invisible in every test
anybody would write by hand, and it is exactly the kind of thing that reaches a
user as "the form accepted my number and the total is wrong".

So the check breaks the Python port four ways on purpose and confirms each one
is caught — the `\d` widening, a narrowed whitespace class, and both halves of
the `mốt`/`tư` threshold:

```bash
node scripts/prove-money-parity-fails.mjs
# 4/4 real port breakages were caught
```

`vn-ident` has a larger version of the same problem, because its tables are
transcriptions rather than platform behaviour. A transposed pair of tax weights,
the `023`/`024` province typo that one of the four published tables actually
carries, a swapped carrier prefix: each of these is a real way to ship something
that passes every hand-written test.

```bash
node scripts/prove-ident-parity-fails.mjs
# 6/6 real port breakages were caught
```

A check that cannot fail is decoration. These have been seen to fail.

## Contributing

Three rules, in [CONTRIBUTING.md](./CONTRIBUTING.md), non-negotiable:

1. **The conformance suite is a contract.** It is the asset. Changing a case to
   make a port go green defeats the entire purpose of the repository.
2. **Never edit an existing case to make it pass.** A case that no longer holds
   gets a new case alongside it that documents the new behaviour, with a `note`
   explaining what changed. Deleting a case is deleting the test.
3. **Fix one port, fix both.** A behaviour change in TypeScript that is not
   mirrored in Python is a regression, not a feature.

### The guards, and why they exist

Two of the things this repository is careful about fail *silently* when they
break, so both are checked rather than trusted:

```bash
npm run check:wiring      # every package is in every list that enumerates packages
npm run check:invisible  # no literal U+00A0 / U+2007 / U+2009 in source
```

`check:wiring` exists because a package added to `packages/` and not added to
`.github/dependabot.yml` is never reported by anything. Dependabot has no glob
for directories, so that package's dependencies would silently fall years
behind, and the only symptom would be a stale version number nobody remembers
choosing. The same goes for a package that CI installs but never tests, or that
the release job builds and never publishes.

`check:invisible` exists because a literal no-break space is invisible in an
editor. The VND formatter depends on `U+00A0` to match ICU exactly; a reformat
that turns it into an ordinary space breaks that by one code point, and nothing
fails in a way that points at the cause. (The Python port has the same problem
with combining marks, checked separately in CI.)

Both have been seen to fail:

```bash
node scripts/prove-checks-fail.mjs
# 5/5 real mistakes were caught
```

## Licence

MIT. See [LICENSE](./LICENSE).
