# vn-ident

Vietnamese tax codes, mobile numbers and card numbers — validated against the
sources that define them, not against a regex somebody liked. Standard library
only, zero runtime dependencies.

```bash
pip install vn-ident
```

```python
from vn_ident import is_valid_mst, mst_check_digit, normalize_phone, detect_carrier, parse_cccd, classify_id

is_valid_mst("0100047516")       # True  — the tenth digit is computed, not matched
mst_check_digit("010004751")     # 6     — the worked example in the circular
mst_check_digit("000000000")     # None  — and None is the interesting part

normalize_phone("+84912345678")  # '0912345678'
detect_carrier("0987654321")     # 'viettel'
detect_carrier("0953456780")     # None  — a valid number that belongs to nobody

parse_cccd("001087123456")       # CardNumber(province_code='001', province='Hà Nội',
                                 #   century=20, gender='male', birth_year=1987, …)
classify_id("0912345678")        # 'phone'
```

The TypeScript port is [`@vntoolkit/vn-ident`](https://www.npmjs.com/package/@vntoolkit/vn-ident)
and the two are held to the same
[conformance suite](../../conformance/vn-ident-1.0.0.json) — 258 cases, read by
both. That suite is the contract; this package is one implementation of it.

## The thing to read first

**A tax code has a check digit. A card number does not.**

A tax code's tenth digit is computed from the first nine, so `is_valid_mst` tells
you the code is *right*. A card number's last six digits are random, so there is
nothing to verify: `is_valid_cccd` is a **format check and nothing more** —
twelve digits, a province code that exists, a fourth digit that is defined. It
cannot detect a number that is well-formed and wrong, and it will not pretend to.

It also cannot tell you which generation of card it is. The old unchipped
12-digit number and the current chip number have the same structure, and the 2025
reduction to 34 provincial units did not renumber any card issued before it.
`classify_id` returning `"cccd"` does not mean a chip card.

## The zero remainder

Ten minus zero is ten, which is not a digit, so the circular skips that sequence
number rather than assigning a check digit. That is why the function is typed
`int | None` and not `int`:

```python
mst_check_digit("000000000")   # None
mst_check_digit("000000007")   # 0
```

A naive implementation returns `10` there and then compares it against a
character. It rejects valid codes and never says why. No tax code whose first
nine digits sum to a multiple of 11 can be valid — and one that claims to be is
not.

## The weights are not a progression

`31 29 23 19 17 13 7 5 3` is transcribed from Thông tư 105/2020/TT-BTC, Phụ
lục 1, and pinned in the suite. That is the reason the parity check generates ten
thousand tax codes rather than trusting the hand-picked cases: a transposed pair
of weights still produces a well-formed digit for every code, so nothing
downstream would ever notice.

```text
ident parity: 673311/673311 operations identical across both ports
```

Six port breakages are introduced on purpose to prove the check catches them —
two transposed weights, the divisible-by-11 case, the Bắc Giang `023`/`024` typo
that one of the four published province tables actually carries, two swapped
carrier prefixes, the trunk-zero inference, and a `\d` widened to Unicode:

```bash
node scripts/prove-ident-parity-fails.mjs
# 6/6 real port breakages were caught
```

## Errors are values, not exceptions

Every function returns `False` or `None` on bad input, and every one accepts
anything at runtime. A validator that crashes on the wrong type has turned a
validation error into a 500, and form posts and JSON bodies do not respect your
type hints:

```python
is_valid_mst(None)        # False
parse_cccd(12345)         # None
classify_id({"a": 1})    # 'unknown'
```

The one exception is `mst_check_digit`, which raises `TypeError` on a prefix that
is not nine digits. That is a programming error in the caller rather than bad
user data, and it should not be a `None` you discover three lines later.

## Reading an amount out of a card number

The fourth digit is the century and the sex in one character, so the two year
digits alone are ambiguous and it is what settles them:

```python
parse_cccd("001085123456").birth_year   # 1985
parse_cccd("001285123456").birth_year   # 2085
```

A year in the future parses, deliberately: with no check digit nothing can detect
it, and a date-dependent `valid` would make the conformance suite change its own
answer over time.

## Known limitations

- **No card number verification is possible.** No check digit exists.
- **No province lookup for a tax code.** `region_code` comes from the tax
  authority's catalogue, not the card-number table, and this package does not
  carry a join between the two.
- **`detect_carrier` does not normalise.** `detect_carrier("+84912345678")` is
  `None`. Call `normalize_phone` first.
- **`is_valid_cmnd` is a shape test.** Nine digits, no structure, no check digit.
  It accepts `000000000`, which was never issued to anyone.
- **Non-ASCII digits are refused everywhere.** Both ports agree on that, and the
  proof script checks that they do.

## Licence

MIT
