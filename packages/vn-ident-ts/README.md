# vn-ident

Vietnamese tax codes, mobile numbers and card numbers — validated against the
sources that define them, not against a regex somebody liked. Zero runtime
dependencies.

```bash
npm install vn-ident
```

```ts
import { isValidMst, mstCheckDigit, detectCarrier, isValidCccd, parseCccd, classifyId } from 'vn-ident';

isValidMst('0100047516');      // true  — the tenth digit is computed, not pattern-matched
isValidMst('0100047517');      // false
mstCheckDigit('010004751');    // 6
mstCheckDigit('000000000');    // null — and null is the interesting part

normalizePhone('+84912345678');  // '0912345678'
detectCarrier('0987654321');     // 'viettel'
detectCarrier('0953456780');     // null  — a valid number that belongs to nobody

isValidCccd('001087123456');     // true
parseCccd('001087123456');       // { provinceCode: '001', province: 'Hà Nội',
                                //   century: 20, gender: 'male', birthYear: 1987, … }
classifyId('0912345678');        // 'phone'
```

## The thing to read first

**A tax code has a check digit. A card number does not.**

A tax code's tenth digit is computed from the first nine. This library recomputes
it, so `isValidMst` tells you the code is *right*.

A card number's last six digits are random. There is nothing to verify, so
`isValidCccd` is a **format check and nothing more** — twelve digits, a province
code that exists, a fourth digit that is defined. It cannot detect a number that
is well-formed and wrong, and it will not pretend to. A validation library that
overstates what it checks is worse than one that checks less, because the thing
you build on top of it inherits the false confidence.

Nor can it tell you **which generation of card** it is. The old unchipped
12-digit number and the current chip number have the same structure, and the
2025 reduction to 34 provincial units did not renumber any card issued before it.
`classifyId` returning `'cccd'` does not mean a chip card. If you need to know,
you need the issuing authority.

## The tax check digit

Thông tư 105/2020/TT-BTC, Phụ lục 1. Nine digits in, one digit out:

```
N1 × 31 + N2 × 29 + N3 × 23 + N4 × 19 + N5 × 17
  + N6 × 13 + N7 × 7  + N8 × 5  + N9 × 3
  = sum
remainder = sum mod 11
check     = 10 − remainder
```

The weights are **not a progression**. That is exactly why they are transcribed
from the regulation and pinned in the suite rather than computed, and why the
parity check generates ten thousand codes instead of trusting the hand-picked
ones: a transposed pair of weights still produces a well-formed digit for every
code, so nothing downstream would ever notice.

**And remainder zero is a case, not an edge case.** Ten minus zero is ten, which
is not a digit, so the circular skips that sequence number rather than assigning
a check digit. This is why `mstCheckDigit` returns `number | null`:

```ts
mstCheckDigit('000000000');    // null
mstCheckDigit('000000007');    // 0
```

A naive implementation returns `10` there and then compares it against a
character. It rejects valid codes and never says why. Here, no tax code whose
first nine digits sum to a multiple of 11 can be valid — and one that claims to
be is not.

A thirteen-digit code is a dependent unit: the same ten digits, then a branch
from `001` to `999`. A branch of `000` does not exist.

```ts
isValidMst('0100047516001');   // true
isValidMst('0100047516000');   // false
isValidMst('0100047516-001');  // true  — the hyphen the circular prints
isValidMst('0100047516 ');     // false — a paste is a visible error, not a silent success
```

`parseMst` returns the serial as a **string**, because `0004751` and `4751` are
the same serial and the leading zeros are part of it:

```ts
parseMst('0100047516');
// { regionCode: '01', serial: '0004751', checkDigit: 6, branch: null }
```

`regionCode` is **not a province.** Those two digits are the revenue code of the
provincial tax office, from the Ministry of Finance's own catalogue. It is a
different list from the province codes on a card number, and calling this one a
province is how two catalogues end up merged in somebody's database.

## Mobile numbers

Every spelling of one number reduces to the same ten digits:

```ts
for (const input of [
  '0912345678', '+84912345678', '84912345678', '840912345678',
  '0912 345 678', '0912-345-678', '0912.345.678', '(0912) 345678', '  0912345678  ',
]) {
  normalizePhone(input);   // '0912345678'
}
```

**One inference, and it is switchable.** A bare nine-digit number is assumed to
have lost its trunk zero, because that is how a national number is written down
and how it arrives from a contact form:

```ts
normalizePhone('912345678');                            // '0912345678'
normalizePhone('912345678', { assumeTrunkZero: false }); // null
```

That is the one place a typo and a correct number look identical, so the option
exists for callers whose input always includes the zero.

Everything else is refused rather than guessed: a number from another country
(`+1 202 555 0143`) is not reshaped into looking Vietnamese, and neither is one
that is 8, 11 or 12 digits with no country code.

### Which network

```ts
detectCarrier('0912345678');   // 'vinaphone'
detectCarrier('0987654321');   // 'viettel'
detectCarrier('0953456780');   // null
```

| carrier | prefixes |
|---|---|
| Viettel | `032`–`039`, `086`, `096`, `097`, `098` |
| Vinaphone | `081`–`085`, `088`, `091`, `094` |
| Mobifone | `070`, `076`–`079`, `089`, `090`, `093` |
| Vietnamobile | `052`, `056`, `058`, `092` |
| Gmobile | `059`, `099` |

**34 of the 100 three-digit prefixes are assigned.** The rest belong to nobody,
and that is the interesting part: a ten-digit number can be perfectly valid and
have no carrier. `null` is a different answer from `invalid`, and conflating them
is how a number ends up attributed to the wrong network — which then decides
which carrier portal the user is sent to.

`detectCarrier` deliberately does **not** normalise. A nine-digit number has no
carrier until the trunk zero is known, and guessing is the failure above.

## Card numbers

Twelve digits: three for the province, one for the century and sex, two for the
year, six random.

```ts
parseCccd('001087123456');
// { provinceCode: '001', province: 'Hà Nội', century: 20,
//   gender: 'male', birthYear: 1987, serial: '123456' }
```

The **fourth digit** is the one worth reading. It is the century and the sex in
one character, two per century:

| digit | century | sex | digit | century | sex |
|---|---|---|---|---|---|
| 0 | 20 | male | 5 | 22 | female |
| 1 | 20 | female | 6 | 23 | male |
| 2 | 21 | male | 7 | 23 | female |
| 3 | 21 | female | 8 | 24 | male |
| 4 | 22 | male | 9 | 24 | female |

So the two year digits alone are ambiguous — `85` is 1985 or 2085 — and the
fourth digit is what settles it:

```ts
parseCccd('001085123456')?.birthYear;   // 1985
parseCccd('001285123456')?.birthYear;   // 2085
```

**63 province codes**, from Quyết định 124/2004/QĐ-TTg. They run `001` to `096`
with gaps, and **a gap is not an assignment**: `003` is nobody, and a card number
starting `003` is not a card number.

```ts
isValidCccd('003098512345');   // false
```

The table was cross-checked against four published sources, because one of them
prints Bắc Giang as `023` where the other three, and the decree itself, say
`024`. A single-source transcription would have carried the typo.

A year in the future parses, and that is deliberate: with no check digit nothing
can detect it, and a date-dependent `valid` would make the conformance suite
change its own answer over time. Whether the person is alive is your question,
not this function's.

## Telling them apart

```ts
classifyId('001098512345');    // 'cccd'
classifyId('001001001');       // 'cmnd'  — the old paper card, nine digits
classifyId('0100047516');       // 'mst'
classifyId('0100047516001');    // 'mst'   — a dependent unit
classifyId('0912345678');       // 'phone'
classifyId('abc');              // 'unknown'
```

A ten-digit number is ambiguous between a tax code and a phone number, and the
tenth digit settles it. A twelve-digit value is unambiguous, because a
dependent tax unit is thirteen digits.

## Validation

258 cases in
[`conformance/vn-ident-1.0.0.json`](../../conformance/vn-ident-1.0.0.json), every
one carrying the note explaining what breaks if you get it wrong. The Python
port reads the same file.

```bash
npm test              # 289 tests
npm run typecheck
npm run build
node ../../scripts/verify-ident-parity.mjs   # runs the real Python port
```

The parity check is the stronger property, and it is where the transcription risk
actually gets tested:

```text
ident parity: 673311/673311 operations identical across both ports
  mstCheckDigit: 13000, isValidMst: 387297, parseMst: 216397
  province codes exercised: 63, carriers exercised: all five
```

Every carrier prefix, every province code, every fourth digit, and ten thousand
**generated** tax codes. The generated ones are the point: a hand-picked suite
cannot tell you the weight table is right, and ten thousand codes either agree or
they do not.

Six port breakages are introduced on purpose to confirm the check catches each
one — two transposed weights, the divisible-by-11 case, the Bắc Giang typo, two
swapped carrier prefixes, the trunk-zero inference, and a `\d` widened to
Unicode:

```bash
node ../../scripts/prove-ident-parity-fails.mjs
# 6/6 real port breakages were caught
```

## API

```ts
mstCheckDigit(prefix: string): number | null
isValidMst(code: string): boolean
parseMst(code: string): TaxCode | null

normalizePhone(input: string, options?: NormalizeOptions): string | null
detectCarrier(phone: string): Carrier | null
isValidPhone(input: string): boolean

isValidCccd(code: string): boolean
parseCccd(code: string): CardNumber | null
isValidCmnd(code: string): boolean
classifyId(value: string): IdentifierKind
```

Every function returns `false` or `null` rather than throwing on bad input, and
every function accepts `unknown` at runtime — a number, `null` or an object
arrives at these from form posts and JSON bodies, and a validator that crashes
on the wrong type has just turned a validation error into a 500.

## Known limitations

Stated precisely, because the boundaries are where this kind of library usually
lies.

**No card number verification is possible.** Stated at the top, repeated here
because it is the one that matters.

**No province lookup for a tax code.** `regionCode` comes from the tax
authority's catalogue, not from the card-number table, and this library does not
carry a mapping between them. The Ministry of Finance publishes one; inventing a
join between two different catalogues is not a thing to guess at.

**`detectCarrier` does not normalise.** By design, and it means
`detectCarrier('+84912345678')` is `null`. Call `normalizePhone` first.

**`isValidCmnd` is a shape test.** Nine digits, no structure, no check digit. It
accepts `000000000`, which was never issued to anyone.

**Non-ASCII digits are refused everywhere.** `١٢٣٤٥٦٧٨٩` is nine digits to a
Unicode-aware regular expression engine and not nine digits to a card. Both
ports agree on refusing it, and `prove-ident-parity-fails.mjs` checks that they
do.

## Licence

MIT
