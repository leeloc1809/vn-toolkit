"""vn-collate — Vietnamese collation sort keys.

Standard library only. Mirrors the TypeScript port function for function, and
both are validated against the shared conformance suite in
``conformance/vn-collate-1.0.0.json``.

    >>> from vn_collate import collate_key, compare, sort
    >>> sort(['Đặng', 'Anh', 'Bảo', 'bao'])
    ['Anh', 'bao', 'Bảo', 'Đặng']
"""

from __future__ import annotations

from .core import (
    DIGIT_PRIMARY_BASE,
    FALLBACK_PRIMARY,
    LETTER_MODIFIERS,
    LETTER_PRIMARY_BASE,
    PRIMARY_ORDER,
    TONE_MARKS,
    TONE_ORDER,
    collateKey,
    collate_key,
    compare,
    sort,
)
from .weights import TERMINATOR

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "collate_key",
    "compare",
    "sort",
    "collateKey",
    "PRIMARY_ORDER",
    "TONE_ORDER",
    "LETTER_MODIFIERS",
    "TONE_MARKS",
    "TERMINATOR",
    "FALLBACK_PRIMARY",
    "DIGIT_PRIMARY_BASE",
    "LETTER_PRIMARY_BASE",
]
