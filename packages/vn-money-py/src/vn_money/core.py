"""Currency facts, validation, formatting, parsing and apportionment.

Standard library only. Every rule here is held in common with the TypeScript
port by conformance/vn-money-1.0.0.json; nothing in this file is a preference
of one language over the other.
"""

from __future__ import annotations

import re
from typing import Literal, NoReturn

# --- Currency facts, and why each one is here ------------------------------
#
# These are not settings. Changing any of them changes what an amount means, and
# every function in the package is defined in terms of them.

#: ISO 4217.
CURRENCY_CODE = "VND"

#: ISO 4217 gives VND a minor unit of 0.
#:
#: This one fact is the reason the whole package works on integers. There is no
#: half a dong, ``hào`` and ``xu`` were withdrawn because they were issued in
#: practice, and a price that arrives with a decimal point is either an error or
#: a different currency.
MINOR_UNITS = 0

#: U+20AB VIETNAMESE DONG SIGN, which is what ICU writes.
#:
#: U+0110 (D with stroke) and U+0111 (d with stroke) are the informal stand-ins
#: and they are not interchangeable in a document that has to render identically
#: everywhere, so they are accepted on input and never produced on output.
CURRENCY_SYMBOL = "₫"

#: What vi-VN uses to group thousands.
GROUP_SEPARATOR = "."

#: What vi-VN uses for a decimal point. Never produced: there are no decimals.
DECIMAL_SEPARATOR = ","

#: U+00A0 NO-BREAK SPACE, between the digits and the symbol.
#:
#: Written with chr() on purpose. A literal no-break space is invisible in an
#: editor, so a later edit that "cleans it up" replaces it with an ordinary
#: space and the formatter quietly stops matching ICU by one code point.
SYMBOL_SPACER = chr(0x00A0)

#: Every spelling of the symbol that :func:`parse_vnd` accepts.
ACCEPTED_SYMBOLS = (CURRENCY_SYMBOL, "đ", "Đ", "VND", "vnd")

#: The largest amount both ports can represent exactly.
MAX_SAFE_AMOUNT = 2**53 - 1


# --- Errors ----------------------------------------------------------------

VndErrorReason = Literal[
    "empty",
    "has-decimal",
    "unexpected-character",
    "out-of-range",
    "not-integer",
    "empty-shares",
    "invalid-shares",
]
"""Machine-readable failure reason.

A closed set of strings rather than a message, because the conformance suite
has to compare it across two languages and a caller has to be able to branch on
it. A message that changes with a patch release can be neither.
"""


class VndError(ValueError):
    """Every failure this package reports.

    Subclasses :class:`ValueError` so a caller that is not interested in the
    distinction can catch the obvious one.
    """

    reason: VndErrorReason

    def __init__(self, reason: VndErrorReason, message: str) -> None:
        super().__init__(message)
        self.reason = reason


def _fail(reason: VndErrorReason, message: str) -> NoReturn:
    raise VndError(reason, message)


def is_vnd_error(value: object) -> bool:
    return isinstance(value, VndError)


# --- Validation ------------------------------------------------------------


def is_vnd(value: object) -> bool:
    """Is this a whole VND amount both ports can hold exactly?

    The one check worth having before anything else: it is the difference
    between an amount and a float that happens to be near one. ``0.1 + 0.2`` is
    ``0.30000000000000004`` in binary floating point, and a price that arrives
    that way has already lost money before this library sees it.

    ``bool`` is rejected on purpose even though it is an ``int``: ``True`` is
    not an amount, and accepting it lets a flag from a form through as one.
    """
    if isinstance(value, bool) or not isinstance(value, int):
        return False
    return -MAX_SAFE_AMOUNT <= value <= MAX_SAFE_AMOUNT


# --- Formatting ------------------------------------------------------------


def _group(digits: str, separator: str) -> str:
    """Group a digit string from the right, in threes."""
    out: list[str] = []
    end = len(digits)
    while end > 0:
        out.append(digits[max(0, end - 3) : end])
        end -= 3
    return separator.join(reversed(out))


def format_vnd(
    amount: int,
    group_separator: str = GROUP_SEPARATOR,
    symbol: str = CURRENCY_SYMBOL,
    with_symbol: bool = True,
    with_sign: bool = False,
) -> str:
    """Format a VND amount the way vi-VN does.

    vi-VN groups thousands with a dot and separates decimals with a comma: the
    same two characters as en-US with the opposite meaning. Copying an en-US
    formatter here produces a wrong number that still looks plausible, which is
    the worst kind of bug to ship into an invoice.

    The default output is what
    ``Intl.NumberFormat('vi-VN', {{style: 'currency', currency: 'VND'}})``
    produces, and the conformance suite holds the two together.

    Raises :class:`VndError` with reason ``not-integer`` for anything that is
    not a whole amount, because VND has no minor unit and there is nothing to
    round to.
    """
    if isinstance(amount, bool) or not isinstance(amount, int):
        _fail("not-integer", f"{amount!r} is not a whole amount")
    if abs(amount) > MAX_SAFE_AMOUNT:
        _fail("out-of-range", f"{amount} cannot be represented exactly")

    negative = amount < 0
    sign = "-" if negative else ("+" if with_sign else "")
    body = _group(str(abs(amount)), group_separator)

    if with_symbol:
        return f"{sign}{body}{SYMBOL_SPACER}{symbol}"
    return f"{sign}{body}"


# --- Parsing ---------------------------------------------------------------

#: Spaces are ignorable wherever they appear.
#:
#: A price arrives from a form, a spreadsheet, a scan of a receipt, and a
#: gateway. Each writes the grouping space differently: U+0020, U+00A0, U+2009.
#: Rejecting the two we did not expect would fail an amount a human can read at
#: a glance. Python's \s is Unicode-aware and already covers all of them.
_SPACES = re.compile(r"\s")

#: A grouped or ungrouped run of ASCII digits, optionally signed.
#:
#: The grouped branch demands exactly three digits per group, which is what
#: separates "1.000" (one thousand) from "1.00" (a decimal nobody should have
#: written). [0-9] rather than \d on purpose: Python's \d matches every Unicode
#: digit, so "\d" here would accept Arabic-Indic numerals the TypeScript port
#: rejects, and the two would quietly disagree.
_AMOUNT = re.compile(r"[+-]?(?:[0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)")

_HAS_DIGIT = re.compile(r"[0-9]")
#: Dot and comma, which group in vi-VN. The name says so, because "decimal"
#: would be the wrong word: neither of these ever produces a decimal here.
_GROUPING = re.compile(r"[.,]")
_SIGN_ONLY = re.compile(r"[+-]*")


def _strip_symbol(s: str) -> str:
    for token in ACCEPTED_SYMBOLS:
        if s.startswith(token):
            s = s[len(token) :]
            break
    for token in ACCEPTED_SYMBOLS:
        if s.endswith(token):
            s = s[: -len(token)]
            break
    return s


def parse_vnd(text: str) -> int:
    """Parse a written amount back into an integer.

    Deliberately refuses rather than guesses. A money parser that guesses is
    worse than one that fails, because "1.5" under a dot-as-separator reading is
    either fifteen hundred or a typo, and the two are not interchangeable on an
    invoice.

    Raises :class:`VndError` with a machine-readable ``reason``:

    ``empty``
        nothing but spaces and maybe a sign
    ``has-decimal``
        a dot or comma that does not group exactly three digits
    ``unexpected-character``
        anything else
    ``out-of-range``
        parsed, but past 2^53-1
    """
    if not isinstance(text, str):
        _fail("unexpected-character", f"{text!r} is not text")

    s = _SPACES.sub("", text)
    s = _strip_symbol(s)

    if not _AMOUNT.fullmatch(s):
        # A sign on its own carries no digits. So does nothing at all. Anything
        # else that fails here either has a misplaced separator or is not a
        # number, and those two are worth telling apart.
        if not _HAS_DIGIT.search(s):
            if _SIGN_ONLY.fullmatch(s):
                _fail("empty", f"{text!r} holds no digits")
            _fail("unexpected-character", f"{text!r} is not an amount")
        if _GROUPING.search(s):
            _fail(
                "has-decimal",
                f"{text!r} has a separator that does not group exactly three digits",
            )
        _fail("unexpected-character", f"{text!r} is not an amount")

    # Strip the grouping separators only once the shape is known to be valid.
    sign = -1 if s.startswith("-") else 1
    body = _GROUPING.sub("", s).lstrip("+-")
    value = sign * int(body)

    if abs(value) > MAX_SAFE_AMOUNT:
        _fail("out-of-range", f"{text!r} is past 2^53-1")
    return value


# --- Apportionment ---------------------------------------------------------


def allocate(total: int, shares: list[int] | tuple[int, ...]) -> list[int]:
    """Split an amount between shares without creating or losing a single dong.

    Largest-remainder apportionment: every share gets
    ``total * share // sum``, and the dong that are left over go to the largest
    remainders, earliest share first when two tie. The tie-break is not a
    nicety. "Round half up, in order" and "round half up, in whatever order the
    sort happened to produce" give different answers, and only the first one is
    reproducible.

    Python integers are arbitrary precision, so the arithmetic cannot overflow
    the way a 64-bit intermediate would on a large amount; the range check at
    the end keeps the two ports answering for the same set of inputs.

    A zero share is nobody, not an error: ``[0, 0, 1]`` is a filtered list, and
    refusing it would break the caller rather than the input.

    Raises :class:`VndError` with reason ``not-integer``, ``empty-shares`` or
    ``invalid-shares``.
    """
    if isinstance(total, bool) or not isinstance(total, int) or abs(total) > MAX_SAFE_AMOUNT:
        _fail("not-integer", f"{total!r} is not a whole amount")
    if len(shares) == 0:
        _fail("empty-shares", "there is nobody to split between")

    for share in shares:
        if isinstance(share, bool) or not isinstance(share, int) or share < 0:
            _fail("invalid-shares", f"{share!r} is not a non-negative whole share")

    weight_sum = sum(shares)
    if weight_sum == 0:
        _fail("invalid-shares", "the shares add up to nothing")

    magnitude = abs(total)
    sign = -1 if total < 0 else 1

    base: list[int] = []
    remainder: list[int] = []
    for share in shares:
        weighted = magnitude * share
        whole = weighted // weight_sum
        base.append(whole)
        remainder.append(weighted - whole * weight_sum)

    out = [v * sign for v in base]

    # Sort the indices by remainder descending, breaking ties by index. Written
    # as an explicit key rather than relying on a sort being stable.
    order = sorted(range(len(shares)), key=lambda i: (-remainder[i], i))

    leftover = magnitude - sum(base)
    if leftover < 0 or leftover >= len(shares):
        # Unreachable: leftover is the difference between the total and a sum
        # of floors of parts of it, so it is always between 0 and the share
        # count minus one. It is checked anyway, because a money library that
        # can silently lose money is worse than one that raises.
        _fail("out-of-range", f"{total} could not be apportioned exactly")
    for k in range(leftover):
        out[order[k]] += sign

    if any(abs(v) > MAX_SAFE_AMOUNT for v in out):
        _fail("out-of-range", "a share came out past 2^53-1")
    return out
