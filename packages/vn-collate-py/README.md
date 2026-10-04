# vn-collate

Vietnamese collation sort keys, derived from ICU. **No runtime dependencies** —
standard library only.

```bash
pip install vn-collate
```

```python
from vn_collate import collate_key, compare, sort

sort(['Đặng Minh', 'An Nguyễn', 'Bảo Châu', 'Lê Duẩn'])
# ['An Nguyễn', 'Bảo Châu', 'Đặng Minh', 'Lê Duẩn']

compare('Đặng', 'Dũng')   # 1   — Đ follows D, it does not fall through to the end
compare('bao', 'Bảo')     # -1  — tone order is huyền hỏi ngã sắc nặng
```

## Why

Postgres has no Vietnamese collation. MySQL's `utf8mb4_vietnamese_ci` exists,
but it is one of a fixed set of orders the server ships, and whichever one you
get depends on the server's version and configuration rather than on anything
you can pin. The result is that a Vietnamese `ORDER BY` is either
unreproducible between environments or not Vietnamese at all.

This library takes the order out of the server's hands. It builds a **sort
key** — a string whose byte order is the Vietnamese collation order — so you
store the key once and the database only has to do byte comparison, which
every database already does correctly.

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
runtime and emits both the table and the conformance suite, which records the
runtime it came from:

```json
"derivedFrom": "Intl.Collator('vi-VN') on win32/x64, ICU 75.1, Unicode 15.1"
```

If ICU ever changes the order, the next regeneration shows it as a diff landing
in review — instead of a silent behaviour change shipping to users.

## Why a sort key and not a comparison function

A comparator answers one question. A sort key answers every question the
database will ever be asked, including the ones you did not anticipate: range
queries on names, exact lookup, `ORDER BY` on one or several key columns, and
an index on any of them.

A key is also the only formulation where a Python service and a Node service
agree. Both ports emit byte-identical keys, checked on every push by
`scripts/verify-collate-parity.mjs` across 445 strings — so a key written by one
service sorts correctly against data written by the other.

## Known limitations

Stated precisely, because the boundaries are where this kind of library
usually lies.

**Punctuation and spaces sort after every letter, not before.** ICU sorts them
first. This only changes the order of records that differ *only* in
punctuation:

```python
sort(['Nguyen Van An', 'NguyenVanAn'])   # ours: NguyenVanAn, Nguyen Van An
                                      #  ICU: Nguyen Van An, NguyenVanAn
```

A corpus that is internally consistent — every name punctuated the same way,
which is the normal case — orders identically to ICU. Verified: six real
multi-word Vietnamese names sort the same in both. A corpus that mixes
`Nguyễn Văn An` with `NguyễnVănAn` does not, and ICU's answer is the more
natural one. Handling this properly means ICU's variable weighting, which is a
configuration axis rather than a fixed order; that is v1 work.

**An unrecognised combining mark is dropped.** `ä` is `a` + U+0308, U+0308 is
not a Vietnamese tone or letter modifier, so it contributes no weight and `ä`
collates identically to `a`:

```python
collate_key('a') == collate_key('ä')   # True
```

This never happens for Vietnamese text. It is a real key collision for text
that mixes in other languages, and it is deliberate — a guessed weight for an
unknown mark would be wrong in a way that is much harder to notice.

**Latin letters outside the Vietnamese set are in the fallback bucket.**
`ç`, `ñ`, `š`, `ž` and friends sort after every letter rather than beside their
base letter as ICU does. `ß` and `æ` are in the same bucket.

**No numeric collation.** `a2 > a10`, matching ICU's default.

## Validation

519 cases in
[`conformance/vn-collate-1.0.0.json`](../../conformance/vn-collate-1.0.0.json),
generated from ICU rather than hand-authored, every one carrying the note
explaining what breaks if you get it wrong. The TypeScript port reads the same
file.

The test file runs with or without pytest, because a library whose correctness
guarantee depends on a test runner is a library you cannot check on a machine
that has no test runner:

```bash
python packages/vn-collate-py/tests/test_conformance.py   # stdlib only
pytest packages/vn-collate-py/tests -q                     # if you have it
```

## API parity

```python
collate_key(text) -> str
compare(a, b) -> int            # -1, 0 or 1
sort(items, key=None) -> list   # stable, does not mutate the input
```

`collateKey` is exported as an alias so a call site moves between the Python and
TypeScript ports without renaming. The tables are exported as constants for
callers who want to inspect or extend them.

`compare` is defined in terms of `collate_key`, so the two can never disagree.

## Licence

MIT
