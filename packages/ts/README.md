# @vntoolkit/vn-text

Correct Unicode primitives for Vietnamese text. Zero runtime dependencies.

```bash
npm install @vntoolkit/vn-text
```

```ts
import { fold, deaccent, stripStroke, normalize, isVietnamese } from '@vntoolkit/vn-text';

fold('Đặng Minh Anh');    // 'dang minh anh'
fold('Hà Nội, Việt Nam!'); // 'ha noi viet nam'
deaccent('Tiếng Việt');   // 'Tieng Viet'
stripStroke('Đặng');      // 'Dặng'
isVietnamese('Nguyễn');    // true
```

## Why

Vietnamese `Đ` (U+0110) has no canonical decomposition, so NFD cannot fold it.
The usual "NFD then strip combining marks" recipe leaves `Đặng Minh` as
`Đang Minh` — and nobody types `Đang` to find `Đặng`, so search quietly returns
too few results. The tempting blanket fix also turns the Icelandic letter `Ð`
(U+00D0) into `D` and corrupts those names.

`stripStroke` handles U+0110 and U+0111 explicitly, and nothing else.

## Validation

Every function is checked against the shared conformance suite at
[`conformance/vn-text-1.0.0.json`](../../conformance/vn-text-1.0.0.json) — 139
hand-authored cases that the Python port also consumes, so the two
implementations cannot drift apart.

```bash
npm test          # 139 conformance cases + metadata + named regressions
npm run typecheck
npm run build
```

## Scope

Deliberately narrow. Tone-mark canonicalisation (`hóa` vs `hòa`), fuzzy
matching for unaccented-keyboard input, and Vietnamese collation are not here.
See the [root README](../../README.md#what-this-is-not) for why, and what is
planned.

## Licence

MIT
