"""Mobile numbers: reduce what a person typed, and say whose it is.

Everything here is unambiguous except one switch, which exists because a typo
and a correct number look exactly the same at the boundary.
"""

from __future__ import annotations

import re

from vn_ident.tables import Carrier, carrier_of_prefix

_TRUNK = "0"
_COUNTRY = "84"

#: Already normalised: ten digits, starting with the trunk zero.
_NATIONAL_SHAPE = re.compile(r"0[0-9]{9}")
_NON_DIGITS = re.compile(r"\D")


def normalize_phone(text: str, *, assume_trunk_zero: bool = True) -> str | None:
    """Reduce what a person typed to a ten-digit national number, or ``None``.

    The ``+84`` forms all say the same thing; spaces, dashes, dots and brackets
    are how people write a number down rather than information; and a number
    that is 8, 11 or 12 digits with no country code is refused rather than
    reshaped.

    ``assume_trunk_zero`` is the one inference in this package, and the one
    place a typo and a correct number look the same. A national number written
    without its leading zero is how it appears in a contact form and how it is
    read aloud, so the default recovers it. Pass ``assume_trunk_zero=False`` to
    refuse instead, which is the right choice if the input came from a system
    that always includes it.

    >>> normalize_phone("+84912345678")
    '0912345678'
    >>> normalize_phone("0912 345 678")
    '0912345678'
    """
    if not isinstance(text, str):
        return None

    s = _NON_DIGITS.sub("", text)
    if not s:
        return None

    rest = s[len(_COUNTRY) :] if s.startswith(_COUNTRY) else s

    if len(rest) == 9 and not rest.startswith(_TRUNK):
        if not assume_trunk_zero:
            return None
        rest = _TRUNK + rest

    return rest if _NATIONAL_SHAPE.fullmatch(rest) else None


def detect_carrier(phone: str) -> Carrier | None:
    """Which mobile network is this number on, or ``None``.

    Only a normalised number is looked up, on purpose. A nine-digit number has
    no carrier until the trunk zero is known, and guessing is how a phone
    number ends up attributed to the wrong network -- which then decides which
    carrier portal the user is sent to.

    ``None`` covers three different situations, and they are not the same: a
    number that is not a number, a number whose prefix belongs to nobody, and a
    ten-digit number that is not a mobile number at all. Call
    :func:`normalize_phone` first if you need to tell them apart.
    """
    if not isinstance(phone, str):
        return None
    s = _NON_DIGITS.sub("", phone)
    if not _NATIONAL_SHAPE.fullmatch(s):
        return None
    return carrier_of_prefix(s[:3])


def is_valid_phone(text: str) -> bool:
    """Is this something a person could have meant as a Vietnamese phone number?

    True for a ten-digit number that no carrier owns, which is correct: the
    shape is what is being checked, not the subscription.
    """
    return normalize_phone(text) is not None
