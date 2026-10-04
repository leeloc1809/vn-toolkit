"""Vietnamese money, on integers, because VND has no minor unit.

Five functions, standard library only, and a conformance suite shared with the
TypeScript port at conformance/vn-money-1.0.0.json. The suite is the contract;
the two ports are implementations of it.
"""

from __future__ import annotations

from vn_money.core import (
    ACCEPTED_SYMBOLS,
    CURRENCY_CODE,
    CURRENCY_SYMBOL,
    DECIMAL_SEPARATOR,
    GROUP_SEPARATOR,
    MAX_SAFE_AMOUNT,
    MINOR_UNITS,
    SYMBOL_SPACER,
    VndError,
    VndErrorReason,
    allocate,
    format_vnd,
    is_vnd,
    is_vnd_error,
    parse_vnd,
)
from vn_money.words import to_words

__all__ = [
    "ACCEPTED_SYMBOLS",
    "CURRENCY_CODE",
    "CURRENCY_SYMBOL",
    "DECIMAL_SEPARATOR",
    "GROUP_SEPARATOR",
    "MAX_SAFE_AMOUNT",
    "MINOR_UNITS",
    "SYMBOL_SPACER",
    "VndError",
    "VndErrorReason",
    "allocate",
    "format_vnd",
    "is_vnd",
    "is_vnd_error",
    "parse_vnd",
    "to_words",
]

__version__ = "0.1.0"
