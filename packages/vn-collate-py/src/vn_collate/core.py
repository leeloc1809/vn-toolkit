"""Vietnamese collation: sort keys, comparison, sorting.

Standard library only, deliberately. This has to be trustworthy, and it has to
be the same answer in both ports, so it has as few moving parts as possible.

Every function is validated against ``conformance/vn-collate-1.0.0.json``,
which the TypeScript port also reads.
"""

from __future__ import annotations

import unicodedata
from typing import Callable, Iterable, Sequence, TypeVar

from .weights import (
    DIGITS,
    DIGIT_PRIMARY_BASE,
    FALLBACK_PRIMARY,
    LETTER_MODIFIERS,
    LETTER_PRIMARY_BASE,
    PRIMARY_INDEX,
    PRIMARY_ORDER,
    TONE_MARKS,
    TONE_ORDER,
    TERMINATOR,
)

__all__ = [
    "collate_key",
    "compare",
    "sort",
    "collateKey",
    "PRIMARY_ORDER",
    "TONE_ORDER",
    "LETTER_MODIFIERS",
    "TONE_MARKS",
    "FALLBACK_PRIMARY",
    "DIGIT_PRIMARY_BASE",
    "LETTER_PRIMARY_BASE",
]

T = TypeVar("T")


def _clusters(text: str) -> list[str]:
    """Split a string into one base character plus its combining marks.

    This has to run on the NFD form. NFC does not guarantee that a combining
    mark stays attached to its base -- ``B`` followed by U+0301 has no
    precomposed form, so NFC leaves it as two code points, and walking that
    string would treat the bare acute accent as a character of its own. NFD
    always leaves marks trailing their base, so the grouping is unambiguous.
    """
    out: list[str] = []
    for ch in unicodedata.normalize("NFD", text):
        if out and unicodedata.combining(ch):
            out[-1] += ch
        else:
            out.append(ch)
    return out


def _weights_for(cluster: str) -> tuple[int, int, int]:
    base = ""
    modifiers = ""
    tone = 0

    for mark in cluster:
        if mark in TONE_MARKS:
            weight = TONE_MARKS[mark]
            # Deterministic when a character carries more than one tone mark:
            # the heaviest wins. Documented rather than accidental.
            if weight > tone:
                tone = weight
        elif mark in LETTER_MODIFIERS:
            modifiers += mark
        elif not base:
            base = mark

    # Recompose the base letter from its modifiers so ă, â, ê, ô, ơ and ư find
    # their own primary instead of collapsing onto a, e, o or u.
    letter = unicodedata.normalize("NFC", base + modifiers)

    # The table is lowercase. Case belongs on the tertiary level, so look the
    # letter up folded and record the case separately -- otherwise every
    # capital lands in the fallback bucket and sorts after all the lowercase.
    folded = letter.lower()

    primary = PRIMARY_INDEX.get(folded)
    if primary is None:
        digit = DIGITS.find(folded)
        primary = DIGIT_PRIMARY_BASE + digit if digit >= 0 else FALLBACK_PRIMARY

    return primary, tone, 1 if letter != folded else 0


def collate_key(text: str) -> str:
    """Build a sort key for ``text``, as a hex string.

    Why the key is emitted level by level
    -------------------------------------
    Interleaving the levels per character is the obvious encoding and it is
    wrong. Comparing ``"ab"`` against ``"á"`` that way looks at the tone of the
    second character before noticing that ``"á"`` has no second character, and
    orders ``"ab"`` first. ICU orders ``"á"`` first, because a string that ends
    earlier in the primary level sorts first. So the key is laid out primaries,
    then secondaries, then tertiaries, each terminated -- the same shape the
    Unicode Collation Algorithm uses.

    Storing the key
    ---------------
    The key is **hex**, not raw bytes, so that both ports return the same type
    and the value can live in a text column.

    That does not mean you can sort it with the database's default collation.
    ``ORDER BY key`` on a ``text``/``varchar`` column re-sorts the key with the
    column's own rules and produces nonsense. It has to be a binary
    comparison:

    - Postgres: ``bytea``, or ``text COLLATE "C"``
    - MySQL: ``varbinary``, or ``varchar`` with ``COLLATE utf8mb4_bin``

    >>> collate_key('a') < collate_key('A')
    True
    >>> collate_key('Đặng') < collate_key('Dũng')
    False
    """
    primary: list[int] = []
    secondary: list[int] = []
    tertiary: list[int] = []

    for cluster in _clusters(text):
        p, s, t = _weights_for(cluster)
        primary.append(p)
        secondary.append(s)
        tertiary.append(t)

    raw = (
        primary + [TERMINATOR] + secondary + [TERMINATOR] + tertiary + [TERMINATOR]
    )
    return "".join(f"{b:02x}" for b in raw)


def compare(a: str, b: str) -> int:
    """Compare two strings the way ICU's Vietnamese collation does.

    Defined as a comparison of their sort keys, so ``compare`` and
    ``collate_key`` can never disagree with each other. Returns -1, 0 or 1.

    >>> compare('Đặng', 'Dũng')
    1
    >>> compare('Thảo', 'Thao')
    1
    >>> compare('bao', 'Bảo')
    -1
    """
    ka = collate_key(a)
    kb = collate_key(b)
    if ka == kb:
        return 0
    # Hex digits compare in value order under Python code point order, so a
    # plain string comparison is a byte comparison.
    return -1 if ka < kb else 1


def sort(items: Iterable[T], key: Callable[[T], str] | None = None) -> list[T]:
    """Sort a list of items by Vietnamese collation order.

    Stable, and does not mutate the input. ``key`` defaults to treating each
    item as a string, mirroring the TypeScript port.

    >>> sort(['Đặng', 'Anh', 'Bảo', 'bao'])
    ['Anh', 'bao', 'Bảo', 'Đặng']
    """
    key_fn: Callable[[T], str] = key if key is not None else (lambda x: x)  # type: ignore[assignment,arg-type]
    indexed = [
        (collate_key(key_fn(item)), index, item)
        for index, item in enumerate(items)
    ]
    # Sort on the key and the original index only. Including the item would ask
    # Python to compare items of a type that may not be orderable.
    indexed.sort(key=lambda entry: (entry[0], entry[1]))
    return [item for _, _, item in indexed]


#: API-parity aliases, so call sites move between the ports without renaming.
collateKey = collate_key
