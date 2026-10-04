"""vn-text — correct Unicode primitives for Vietnamese text.

Standard library only. Mirrors the TypeScript port function-for-function, and
both are validated against the shared conformance suite in
``conformance/vn-text-1.0.0.json``.

    >>> from vn_text import fold
    >>> fold("Đặng Minh Anh")
    'dang minh anh'
"""

from __future__ import annotations

from ._unicode import (
    COMBINING_MARKS,
    D_WITH_STROKE_LOWER,
    D_WITH_STROKE_UPPER,
    ETH_LOWER,
    ETH_UPPER,
    TONE_MARKS,
    VIETNAMESE_SPECIFIC,
)
from .core import (
    decompose,
    deaccent,
    fold,
    is_vietnamese,
    isVietnamese,
    normalize,
    strip_stroke,
    stripStroke,
)

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "normalize",
    "decompose",
    "deaccent",
    "strip_stroke",
    "fold",
    "is_vietnamese",
    "stripStroke",
    "isVietnamese",
    "D_WITH_STROKE_UPPER",
    "D_WITH_STROKE_LOWER",
    "ETH_UPPER",
    "ETH_LOWER",
    "TONE_MARKS",
    "COMBINING_MARKS",
    "VIETNAMESE_SPECIFIC",
]
