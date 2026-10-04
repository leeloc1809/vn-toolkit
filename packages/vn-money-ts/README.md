# vn-money

Vietnamese money on integers, because VND has no minor unit. Format, parse,
apportion without losing a single dong, and read an amount out in Vietnamese
words. Zero runtime dependencies.

```bash
npm install vn-money
```

```ts
import { formatVnd, parseVnd, allocate, toWords, isVnd } from 'vn-money';

formatVnd(12345678);          // '12.345.678 ₫'  (U+00A0, then U+20AB)
parseVnd('12.345.678');       // 12345678
parseVnd('1.5');              // throws VndError, reason 'has-decimal'
allocate(1000000, [1, 1, 1]); // [333334, 333333, 333333]  — sums back exactly
toWords(15000);               // 'mười lăm nghìn'
isVnd(0.1 + 0.2);             // false
```

## Why integers

ISO 4217 gives VND a **minor unit of 0**. There is no half a dong. `hào` and `xu`
were withdrawn because they were issued in practice and became a rounding hazard.

Everything here follows from that one fact:

- every function takes or returns an integer amount
- a fractional amount is **refused**, not rounded — `parseVnd('1.5')` throws rather
  than returning 1 or 2, because a parser that guesses is worse than one that fails
- a number past `2^53 - 1` is refused too: a JavaScript number silently drops its
  low bits there, so accepting it means accepting a different amount

The same rule in Python:

```python
from vn_money import format_vnd, parse_vnd, allocate, to_words

format_vnd(12345678)          # '12.345.678 ₫'
parse_vnd("12.345.678")       # 12345678
allocate(1_000_000, [1, 1, 1])  # [333334, 333333, 333333]
to_words(15000)               # 'mười lăm nghìn'
```

## The separators are the whole trap

vi-VN uses **the same two characters as en-US with the opposite meaning**:

| | thousands | decimals |
|---|---|---|
| `vi-VN` | `1.000.000` | `1,5` |
| `en-US` | `1,000,000` | `1.5` |

Copying an en-US formatter produces a wrong number that still looks plausible —
`1.100.000` instead of `1,100,000` — and nothing in the pipeline complains.

So the default output is byte-for-byte what the platform produces:

```ts
new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(12345678);
// '12.345.678 ₫'   U+002E, then U+00A0, then U+20AB
```

and `formatVnd(12345678)` returns the same string. **Every formatting case in the
conformance suite was read out of ICU rather than written by hand** — the generator
refuses to emit a case that the two disagree on, so the suite cannot drift away from
the platform without showing up as a failure. The runtime it came from is recorded:

```json
"derivedFrom": "Intl.NumberFormat('vi-VN', {style:'currency', currency:'VND'}) on win32/x64, ICU 75.1, Unicode 15.1; ISO 4217 minor unit 0"
```

The separator is configurable, because it is the one thing a Vietnamese shop
genuinely argues about with a foreign marketplace:

```ts
formatVnd(12345678, { groupSeparator: ',' });        // '12,345,678 ₫'
formatVnd(12345678, { withSymbol: false });           // '12.345.678'
formatVnd(12345678, { groupSeparator: '' });          // '12345678'
formatVnd(12345678, { symbol: 'VND' });               // '12.345.678 VND'
formatVnd(12345678, { withSign: true });              // '+12.345.678 ₫'
```

## Parsing refuses rather than guesses

A dot or a comma is a thousands separator only when **exactly three digits** follow
it. Anything else is a decimal point, and this library will not decide for you
which of the two the author meant:

| input | result | why |
|---|---|---|
| `1.000` | `1000` | a dot followed by three digits groups |
| `1,000` | `1000` | a comma groups too, so en-US text does not become 1 |
| `1.5` | throws `has-decimal` | two digits after the dot is a decimal |
| `1.2345` | throws `has-decimal` | four digits is a malformed group |
| `1e3` | throws `unexpected-character` | scientific notation is not how a price arrives |
| `''` | throws `empty` | defaulting a blank field to 0 is how a form saves a blank total |

Every failure carries a machine-readable `reason`, so you can branch on it:

```ts
import { parseVnd, isVndError } from 'vn-money';

try {
  parseVnd(input);
} catch (err) {
  if (isVndError(err)) showFieldError(err.reason);  // 'has-decimal'
}
```

Spaces group wherever they appear — plain space, `U+00A0` (what ICU itself emits)
and `U+2009` (what a browser inserts when a price wraps). All three are accepted, so
a price pasted out of a spreadsheet, a receipt scan or a payment gateway all parse.

## Splitting a bill

`allocate` splits an amount by shares so the parts **add back up to the total
exactly**. No dong is created and none is lost:

```ts
allocate(1000000, [1, 1, 1]);   // [333334, 333333, 333333]
allocate(101, [1, 1]);          // [51, 50]
allocate(100, [0, 0, 1]);       // [0, 0, 100]   a zero share is nobody, not an error
allocate(-100, [1, 1, 1]);      // [-34, -33, -33]
```

It is the largest-remainder method, and the tie-break is not a nicety. The dong
left over go to the largest remainders, **earliest share first when two tie**. "Round
half up, in order" and "round half up, in whatever order the sort produced" give
different answers, and only the first is reproducible:

```ts
allocate(999, [3, 1]);   // [749, 250]  — the odd dong goes to the SMALLER share
allocate(999, [1, 3]);   // [250, 749]
```

The arithmetic runs on big integers, because a billion split into seven overflows
a 32-bit int and a money library that overflows is a money library that is wrong.

## Reading an amount out

`toWords` reads a number the way it is written out on a cheque. Vietnamese has
several published conventions here and **none of them is official**, so this one is
stated in full, pinned case by case in the suite, and names the reading it rejects
at every point where they disagree:

| rule | applies when | not |
|---|---|---|
| filler `linh` | hundreds present, tens zero, units not | `lẻ` |
| `mốt` for a units 1 | the tens digit of the same triplet is 2–9 | `một` |
| `tư` for a units 4 | the tens digit of the same triplet is 2–9 | `bốn` |
| `lăm` for a units 5 | the tens digit is any non-zero digit | `năm` |
| `mười` for a tens 1 | whatever follows it | `một mươi` |

The `mốt` and `tư` rules start at 2, so `11`, `14` and `15` are the values where a
sloppy implementation shows up:

```ts
toWords(15);        // 'mười lăm'   not 'mười năm', which sounds like 'fifteen years'
toWords(14);        // 'mười bốn'   not 'mười tư'
toWords(11);        // 'mười một'   not 'mười mốt'
toWords(105);       // 'một trăm linh năm'   not 'một trăm năm', which reads as 150
toWords(1001);      // 'một nghìn không trăm linh một'
toWords(1000008);   // 'một triệu không nghìn không trăm linh tám'
toWords(1000000);   // 'một triệu'
toWords(-1);        // 'âm một'     prefixed, not reversed
```

Every non-zero triplet is read in full, three slots, including `không trăm` when
its hundreds are zero — but only once something of greater magnitude has been
spoken, because that is the only time the position is ambiguous. So `5` is `năm`
and `1001` carries its `không trăm`.

A zero triplet with a non-zero triplet below it reads `không` plus its magnitude
name, so every place value is spoken exactly once. A zero triplet in the tail is
silence, so `1000000` is `một triệu` and not `một triệu không nghìn`.

**If your house style differs, this is the function to change — and the suite is
where the change has to be argued.** Open an issue rather than editing a case.

## Validation

1232 cases in
[`conformance/vn-money-1.0.0.json`](../../conformance/vn-money-1.0.0.json), every
one carrying the note explaining what breaks if you get it wrong. The Python port
reads the same file. All 1000 values from 0 to 999 are covered individually,
because the reading rules live entirely inside that range and the values that
break them are the ones nobody thinks to write down.

```bash
npm test              # 1232 conformance cases + metadata + named regressions
npm run typecheck
npm run build
node ../../scripts/verify-money-parity.mjs   # runs the real Python port
```

The parity check is the stronger property. It builds its own corpus, runs **both
real ports** over 17091 operations, and compares the answers directly — so it also
covers the inputs nobody thought to write a case for.

```text
money parity: 17091/17091 operations identical across both ports
```

## API

```ts
isVnd(value: unknown): value is number
formatVnd(amount: number, options?: FormatOptions): string
parseVnd(input: string): number              // throws VndError
allocate(total: number, shares: readonly number[]): number[]
toWords(amount: number): string

VndError.reason: 'empty' | 'has-decimal' | 'unexpected-character'
               | 'out-of-range' | 'not-integer' | 'empty-shares' | 'invalid-shares'
```

`CURRENCY_CODE`, `MINOR_UNITS`, `CURRENCY_SYMBOL`, `GROUP_SEPARATOR` and friends are
exported as constants, so a caller can assert against them rather than restating
the values.

## Known limitations

Stated precisely, because the boundaries are where this kind of library usually
lies.

**`toWords` is pinned to 15 significant digits.** `Number.MAX_SAFE_INTEGER` is
9007199254740991, and both ports take a number, so a larger amount would silently
read a rounded value. It is refused instead.

**`allocate` takes whole shares, not arbitrary ratios.** `allocate(100, [1, 3])`
works; `allocate(100, [0.5, 0.5])` raises. Fractional weights would need a scaling
denominator, and getting that wrong is a silent redistribution rather than a crash,
so the API refuses it. Scale the total yourself.

**`parseVnd` accepts only ASCII digits.** `١٢٣` is rejected, not silently read as
123. A price that arrives in Arabic-Indic numerals has already been through
something this library cannot see.

## Licence

MIT
