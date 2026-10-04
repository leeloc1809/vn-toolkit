# vn-collate

Vietnamese collation sort keys, derived from ICU. Zero runtime dependencies.

```bash
npm install vn-collate
```

```ts
import { collateKey, compare, sort } from 'vn-collate';

sort(['Đặng Minh', 'An Nguyễn', 'Bảo Châu', 'Lê Duẩn']);
// ['An Nguyễn', 'Bảo Châu', 'Đặng Minh', 'Lê Duẩn']

compare('Đặng', 'Dũng');  // 1  — Đ follows D, it does not fall through to the end
compare('bao', 'Bảo');    // -1 — tone order is huyền hỏi ngã sắc nặng
```

## Why

Postgres has no Vietnamese collation. MySQL's `utf8mb4_vietnamese_ci` exists,
but it is one of a fixed set of orders the server ships, and whichever one you
get depends on the server's version and configuration rather than on anything
you can pin. The result is that a Vietnamese `ORDER BY` is either
unreproducible between environments or not Vietnamese at all.

This library takes the order out of the server's hands. It builds a **sort key**
— a string whose byte order is the Vietnamese collation order — so you store the
key once and the database only has to do byte comparison, which every database
already does correctly.

```sql
-- Postgres
CREATE TABLE people (
  name    text,
  sortkey bytea          -- or text COLLATE "C"
);
CREATE INDEX ON people (sortkey);

INSERT INTO people VALUES ('Đặng Minh', decode(:key, 'hex'));
SELECT name FROM people ORDER BY sortkey;   -- correct Vietnamese order
```

```sql
-- MySQL
CREATE TABLE people (
  name    varchar(255),
  sortkey varbinary(255)  -- or varchar COLLATE utf8mb4_bin
);
```

**The column has to be binary.** `ORDER BY key` on a `text` or `varchar` column
re-sorts the key using the column's own collation rules and produces nonsense.
This is the one way to use the library incorrectly, and it fails silently.

## The order, and where it comes from

| | |
|---|---|
| letters | `a ă â b c d đ e ê f g h i j k l m n o ô ơ p q r s t u ư v w x y z` |
| tones | `none > huyền > hỏi > ngã > sắc > nặng` |
| digits | before every letter, `0`–`9` in numeric order |
| case | secondary to tone: `a A á Á` |
| unknown | after everything, ordered deterministically |

33 letters, not 29: ICU's `vi-VN` locale still collates `w` and `z` as letters
in meaningful positions rather than dropping them in with the punctuation, so
they are kept where ICU puts them. That is what makes "sorts like ICU" true
rather than approximately true.

**Every value in that table was read out of `Intl.Collator('vi-VN')`, not
written from memory.** `scripts/generate-collation-conformance.mjs` probes the
runtime and emits both the table and the conformance suite. The suite records
the runtime it came from:

```json
"derivedFrom": "Intl.Collator('vi-VN') on win32/x64, ICU 75.1, Unicode 15.1"
```

So if ICU ever changes the order, the next regeneration shows it as a diff
landing in review — instead of a silent behaviour change shipping to users.

## Why a sort key and not a comparison function

A comparator answers one question. A sort key answers every question the
database will ever be asked, including the ones you did not anticipate:

- `WHERE sortkey BETWEEN $a AND $b` — range queries on names
- `WHERE sortkey = $x` — exact lookup
- `ORDER BY sortkey` — and `ORDER BY lastname_key, firstname_key`
- an index on the key column

All of these work with a stored key and none of them work with a comparator.
The key is also the only formulation where a Node service and a Python service
agree: both produce the same bytes, so a key written by one sorts correctly
against data written by the other. `scripts/verify-collate-parity.mjs` checks
that on every push, across 445 strings.

The key is emitted level by level — all primaries, a terminator, all
secondaries, a terminator, all tertiaries — because the obvious per-character
interleaving gets prefix ordering wrong. Comparing `"ab"` against `"á"` that
way looks at the tone of the second character before noticing that `"á"` has no
second character, and orders `"ab"` first. ICU orders `"á"` first. This shape is
the same one the Unicode Collation Algorithm uses.

## Known limitations

Stated precisely, because the boundaries are where this kind of library
usually lies.

**Punctuation and spaces sort after every letter, not before.** ICU sorts
them first. This only changes the order of records that differ *only* in
punctuation:

```ts
sort(['Nguyen Van An', 'NguyenVanAn']);  // ours: NguyenVanAn, Nguyen Van An
                                       //  ICU: Nguyen Van An, NguyenVanAn
```

A corpus that is internally consistent — every name punctuated the same way,
which is the normal case — orders identically to ICU. Verified: six real
multi-word Vietnamese names sort the same in both. A corpus that mixes
`Nguyễn Văn An` with `NguyễnVănAn` does not, and ICU's answer is the more
natural one. Handling this properly means ICU's variable weighting, which is a
configuration axis rather than a fixed order; that is v1 work, not a patch.

**An unrecognised combining mark is dropped.** `ä` is `a` + U+0308, U+0308 is
not a Vietnamese tone or letter modifier, so it contributes no weight and `ä`
collates identically to `a`:

```ts
collateKey('a') === collateKey('ä');  // true
```

This never happens for Vietnamese text. It is a real key collision for text
that mixes in other languages, and it is deliberate — a guessed weight for an
unknown mark would be wrong in a way that is much harder to notice.

**Latin letters outside the Vietnamese set are in the fallback bucket.**
`ç`, `ñ`, `š`, `ž` and friends sort after every letter rather than beside their
base letter as ICU does. `ß` and `æ` are in the same bucket.

**No punctuation, no Latin-Extended, no numeric collation.** `a2 > a10`,
matching ICU's default. Pass your own ordering if you need natural sort.

## Validation

519 cases in
[`conformance/vn-collate-1.0.0.json`](../../conformance/vn-collate-1.0.0.json),
generated from ICU rather than hand-authored, every one carrying the note
explaining what breaks if you get it wrong. The Python port reads the same file.

```bash
npm test              # 519 conformance cases + metadata + named regressions
npm run typecheck
npm run build
node ../../scripts/verify-collate-parity.mjs   # runs the real Python port
```

## API

```ts
collateKey(input: string): string          // hex sort key
compare(a: string, b: string): -1 | 0 | 1  // defined as key comparison
sort<T>(items: readonly T[], key?: (item: T) => string): T[]
```

`compare` is defined in terms of `collateKey`, so the two can never disagree
with each other. The tables are exported as constants for callers who want to
inspect or extend them.

## Licence

MIT
