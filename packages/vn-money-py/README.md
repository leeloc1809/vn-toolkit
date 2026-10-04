# vn-money

Vietnamese money on integers, because VND has no minor unit. Format, parse,
apportion without losing a single dong, and read an amount out in Vietnamese
words. Standard library only, zero runtime dependencies.

```bash
pip install vn-money
```

```python
from vn_money import format_vnd, parse_vnd, allocate, to_words, is_vnd

format_vnd(12345678)            # '12.345.678 ₫'  (U+00A0, then U+20AB)
parse_vnd("12.345.678")         # 12345678
parse_vnd("1.5")                # VndError, reason 'has-decimal'
allocate(1_000_000, [1, 1, 1])  # [333334, 333333, 333333]  — sums back exactly
to_words(15000)                 # 'mười lăm nghìn'
is_vnd(0.1 + 0.2)               # False
```

The TypeScript port is [`vn-money`](https://www.npmjs.com/package/vn-money)
and the two are held to the same
[conformance suite](../../conformance/vn-money-1.0.0.json) — 1232 cases, read by
both. That suite is the contract; this package is one implementation of it.

## Why integers

ISO 4217 gives VND a **minor unit of 0**. There is no half a dong, and a price
that arrives with a decimal point is either an error or a different currency.

So a fractional amount is **refused**, not rounded:

```python
parse_vnd("1.5")     # VndError('has-decimal')
is_vnd(1.5)          # False
```

A money parser that guesses is worse than one that fails: under a
dot-as-separator reading `"1.5"` is either fifteen hundred or a typo, and the two
are not interchangeable on an invoice.

The default format matches ICU byte for byte, and every formatting case in the
suite was **read out of** `Intl.NumberFormat('vi-VN', {style: 'currency',
currency: 'VND'})` rather than written by hand. vi-VN groups thousands with a dot
and separates decimals with a comma — the same two characters as `en-US` with the
opposite meaning, which is the single easiest way to produce a wrong number that
still looks fine.

## Errors carry a reason

`VndError` subclasses `ValueError`, and `.reason` is a closed set of strings rather
than a message, because the conformance suite compares it across two languages and
a caller needs to branch on it:

```python
try:
    parse_vnd(user_input)
except VndError as exc:
    if exc.reason == "has-decimal":
        form.errors["amount"] = "VND không có phần thập phân"
```

`empty` · `has-decimal` · `unexpected-character` · `out-of-range` · `not-integer` ·
`empty-shares` · `invalid-shares`

## Reading an amount out

`to_words` follows one stated convention among several published ones, and pins it
case by case in the suite. `mốt` and `tư` need a tens digit of at least 2, so
`11`, `14` and `15` are where a careless implementation shows up:

```python
to_words(15)       # 'mười lăm'
to_words(14)       # 'mười bốn'
to_words(105)      # 'một trăm linh năm'
to_words(1001)     # 'một nghìn không trăm linh một'
to_words(-1)       # 'âm một'
```

If your house style differs, that is an issue to open, not a case to edit.

## Validation

```bash
pytest packages/vn-money-py/tests -q
python packages/vn-money-py/tests/test_vn_money.py    # needs nothing installed
```

The parity check runs both real ports over 17091 operations and compares the
answers directly, which covers the inputs nobody thought to write a case for:

```bash
node scripts/verify-money-parity.mjs
# money parity: 17091/17091 operations identical across both ports
```

## Notes for this port

`bool` is rejected wherever an `int` is expected, even though it is a subclass:
`True` is not an amount, and accepting it lets a form's checkbox through as a
price. `format_vnd` takes keyword arguments rather than an options object, because
that is how the language already does optional arguments.

`SYMBOL_SPACER` is `chr(0x00A0)` and `CURRENCY_SYMBOL` is the literal `₫`
(U+20AB). The spacer is built from a code point on purpose — a literal no-break
space is invisible in an editor, so it survives review and is then silently
replaced by a reformat, and the formatter stops matching ICU by one code point.

## Licence

MIT
