# vn-text

Correct Unicode primitives for Vietnamese text. **No runtime dependencies** —
standard library only.

```bash
pip install vn-text
```

```python
from vn_text import fold, deaccent, strip_stroke, is_vietnamese

fold('Đặng Minh Anh')     # 'dang minh anh'
fold('Hà Nội, Việt Nam!')  # 'ha noi viet nam'
deaccent('Tiếng Việt')    # 'Tieng Viet'
strip_stroke('Đặng')      # 'Dặng'
is_vietnamese('Nguyễn')   # True
```

## Why

Vietnamese `Đ` (U+0110) has no canonical decomposition, so NFD cannot fold it.
The usual "NFD then strip combining marks" recipe leaves `Đặng Minh` as
`Đang Minh` — and nobody types `Đang` to find `Đặng`, so search quietly returns
too few results. The tempting blanket fix also turns the Icelandic letter `Ð`
(U+00D0) into `D` and corrupts those names.

`strip_stroke` handles U+0110 and U+0111 explicitly, and nothing else.

## Validation

Every function is checked against the shared conformance suite at
[`conformance/vn-text-1.0.0.json`](../../conformance/vn-text-1.0.0.json) — 139
hand-authored cases that the TypeScript port also consumes, so the two
implementations cannot drift apart.

The test file runs with or without pytest, because a library whose correctness
guarantee depends on a test runner is a library you cannot check on a machine
that has no test runner:

```bash
python packages/py/tests/test_conformance.py   # stdlib only, nothing to install

pytest packages/py/tests -q                     # if you have it
```

## API parity

`snake_case` is the Python convention, but `stripStroke` and `isVietnamese` are
exported as aliases so a call site can move between the Python and TypeScript
ports without renaming.

## Known port risk

`fold()` classifies characters using `str.isalnum()`, while the TypeScript port
uses `\p{L}\p{N}`. These agree across all 127 distinct characters in the current
corpus, measured by `scripts/verify-port-parity.mjs`. They are not guaranteed to
agree for every code point; the conformance suite is how a divergence gets
caught.

## Scope

Deliberately narrow. Tone-mark canonicalisation (`hóa` vs `hòa`), fuzzy matching
for unaccented-keyboard input, and Vietnamese collation are not here. See the
[root README](../../README.md#what-this-is-not) for why.

## Licence

MIT
