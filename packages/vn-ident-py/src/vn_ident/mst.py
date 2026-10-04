"""Tax codes: validate them and take them apart.

The tenth digit is computed, not pattern-matched, so a code is either right or
it is refused. There is one case in the algorithm that a naive implementation
gets wrong and that this module is explicit about: the remainder being zero.
"""

from __future__ import annotations

import re
from typing import NamedTuple

from vn_ident.tables import MST_MODULUS, MST_WEIGHTS

_DIGITS = re.compile(r"[0-9]+")
_PREFIX = re.compile(r"[0-9]{9}")
_CC = re.compile(r"[0-9]{12}")


def _bare(code: str) -> str:
    """Drop the hyphen the circular writes into the 13-digit form."""
    return code.replace("-", "")


def mst_check_digit(nine: str) -> int | None:
    """The tenth digit of a tax code, from its first nine.

    Thông tư 105/2020/TT-BTC, Phụ lục 1: multiply the nine digits by the nine
    weights, add, divide by 11, and take ten minus the remainder.

    **The remainder being zero is a case, not an edge case.** Ten minus zero is
    ten, which is not a digit, so the circular skips that sequence number rather
    than assigning a check digit. This returns ``None`` for it, which means no
    tax code whose first nine digits sum to a multiple of 11 can be valid --
    and one that claims to be is not. A naive implementation returns 10 here and
    then compares it against a character, so it rejects a valid code and never
    says why.

    >>> mst_check_digit("010004751")   # the worked example in the circular
    6
    >>> mst_check_digit("000000000") is None
    True
    """
    if not isinstance(nine, str) or not _PREFIX.fullmatch(nine):
        raise TypeError(f"a tax code prefix is nine digits, got {nine!r}")

    total = sum(int(digit) * weight for digit, weight in zip(nine, MST_WEIGHTS))
    remainder = total % MST_MODULUS
    # The circular says it in words: ten minus the remainder.
    return None if remainder == 0 else 10 - remainder


def is_valid_mst(code: str) -> bool:
    """Is this a tax code with a check digit that matches?

    Ten digits for an independent entity, thirteen for a dependent unit, and
    the hyphen between them is accepted because that is how the circular prints
    it. A thirteen-digit code's last three run from 001 to 999, so a branch of
    000 does not exist and accepting it would let a typo through as a real
    entity.

    Whitespace is refused rather than trimmed. A paste that arrives with a
    trailing space is a visible error, not a silent success that hides a broken
    integration.
    """
    if not isinstance(code, str):
        return False
    s = _bare(code)
    if not _DIGITS.fullmatch(s):
        return False
    if len(s) not in (10, 13):
        return False
    if len(s) == 13 and not 1 <= int(s[10:]) <= 999:
        return False
    return mst_check_digit(s[:9]) == int(s[9])


class TaxCode(NamedTuple):
    """The parts of a tax code.

    ``region_code`` is **not** a province. These two digits are the revenue
    code of the provincial tax office, from the Ministry of Finance's own
    catalogue. It is a *different list* from the province codes on a card
    number, and calling this one a province is how two catalogues end up merged
    in somebody's database.

    ``serial`` is a string because the leading zeros are part of it: 0004751 and
    4751 are the same serial and this is the representation that says so.
    """

    region_code: str
    serial: str
    check_digit: int
    branch: str | None


def parse_mst(code: str) -> TaxCode | None:
    """The parts of a tax code, or ``None`` if it is not one."""
    if not is_valid_mst(code):
        return None
    s = _bare(code)
    return TaxCode(
        region_code=s[:2],
        serial=s[2:9],
        check_digit=int(s[9]),
        branch=s[10:] if len(s) == 13 else None,
    )
