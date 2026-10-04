"""Card numbers, the old paper card, and telling them apart.

The honest limit of this module is stated in every function that hits it: a
card number has no check digit, so it can be checked for shape and not for
truth.
"""

from __future__ import annotations

import re
from typing import Literal, NamedTuple

from vn_ident.mst import is_valid_mst
from vn_ident.phone import is_valid_phone
from vn_ident.tables import Gender, century_of, gender_of, is_province_code, province_name

_CCCD_SHAPE = re.compile(r"[0-9]{12}")
_CMND_SHAPE = re.compile(r"[0-9]{9}")


def is_valid_cccd(code: str) -> bool:
    """Is this a well-formed card number with a province code that exists?

    **There is no check digit on a card number.** The last six digits are
    random, so unlike a tax code there is nothing to verify: this cannot detect
    a number that is well-formed and wrong, and pretending otherwise would be
    the most expensive thing this package could do. A card number is a format
    check and nothing more, and the conformance suite says the same.

    **It also cannot tell you which generation of card it is.** The old
    unchipped 12-digit number and the current chip number have the same
    structure, the 2025 reduction to 34 provincial units did not renumber any
    card, and no function here will claim to distinguish them. If you need to
    know, you need the issuing authority.
    """
    if not isinstance(code, str) or not _CCCD_SHAPE.fullmatch(code):
        return False
    if not is_province_code(code[:3]):
        return False
    # Every fourth digit is defined, so this is a table lookup rather than a
    # range check. It is written out anyway so that a future table which drops
    # a digit fails here instead of silently yielding None.
    return century_of(code[3]) is not None


class CardNumber(NamedTuple):
    """The parts of a card number.

    ``birth_year`` uses the century digit rather than the two digits alone:
    85 in the fourth digit 0 is 1985, and in the fourth digit 2 it is 2085.
    That is the whole reason the fourth digit exists.
    """

    province_code: str
    province: str
    century: int
    gender: Gender
    birth_year: int
    serial: str


def parse_cccd(code: str) -> CardNumber | None:
    """The parts of a card number, or ``None`` if it is not a well-formed one.

    A birth year in the future parses. There is no check digit, so nothing here
    can detect it, and a date-dependent "valid" would make the conformance
    suite change its own answer over time.
    """
    if not is_valid_cccd(code):
        return None
    century = century_of(code[3])
    gender = gender_of(code[3])
    province = province_name(code[:3])
    if century is None or gender is None or province is None:
        return None
    return CardNumber(
        province_code=code[:3],
        province=province,
        century=century,
        gender=gender,
        birth_year=(century - 1) * 100 + int(code[4:6]),
        serial=code[6:],
    )


def is_valid_cmnd(code: str) -> bool:
    """The old paper card: nine digits.

    No structure to check and no check digit, so this is a shape test. All
    zeros is well-formed even though no such card was ever issued, and that is
    the honest answer: this function cannot tell you more than that.
    """
    return isinstance(code, str) and bool(_CMND_SHAPE.fullmatch(code))


IdentifierKind = Literal["cccd", "cmnd", "mst", "phone", "unknown"]


def classify_id(value: str) -> IdentifierKind:
    """What is this string, as far as structure goes?

    Ordered so the specific reading wins: a twelve-digit value with a known
    province code is a card, a ten- or thirteen-digit value is a tax code, a
    ten-digit value starting 0 is a phone number, and nine digits is the old
    paper card.

    Note what this does **not** say. ``"cccd"`` does not mean a chip card, and
    ``"phone"`` does not mean the number is subscribed to anyone. A result of
    ``"unknown"`` means the structure did not match anything here, which is a
    statement about this package and not about the value.
    """
    if not isinstance(value, str):
        return "unknown"
    s = value.strip()
    if not s:
        return "unknown"
    if is_valid_cccd(s):
        return "cccd"
    if is_valid_mst(s):
        return "mst"
    if is_valid_phone(s):
        return "phone"
    if is_valid_cmnd(s):
        return "cmnd"
    return "unknown"
