"""Read a number out in Vietnamese words.

Vietnamese has several published conventions for this and none of them is
official, so this one is stated in full and pinned by the conformance suite
rather than assumed. The decisions, and what each one rejects:

===========================  ==========================================  ============
rule                         applies when                                not
===========================  ==========================================  ============
filler ``linh``              hundreds present, tens zero, units not      ``lẻ``
``mốt`` for a units 1        the tens digit of the same triplet is 2-9   ``một``
``tư`` for a units 4         the tens digit of the same triplet is 2-9   ``bốn``
``lăm`` for a units 5        the tens digit is any non-zero digit         ``năm``
``mười`` for a tens 1        whatever follows it                          ``một mươi``
===========================  ==========================================  ============

The ``mốt`` and ``tư`` rules start at 2, so 11, 14 and 15 are the values where
a sloppy implementation shows up, and the suite pins all three.

Every non-zero triplet is read in full, three slots, including ``không trăm``
when its hundreds are zero -- but only once something of greater magnitude has
been spoken, because that is the only time the position is ambiguous. So 5 is
``năm`` and 1001 is ``một nghìn không trăm linh một``.

A zero triplet with a non-zero triplet below it reads ``không`` plus its
magnitude name, so 1000008 is ``một triệu không nghìn không trăm linh tám``. A
zero triplet in the tail is silence, so 1000000 is ``một triệu``.

Negative amounts are prefixed with ``âm`` rather than read backwards, so no sign
can be lost in a string operation.
"""

from __future__ import annotations

from vn_money.core import MAX_SAFE_AMOUNT, VndError

DIGIT_WORDS = (
    "không",
    "một",
    "hai",
    "ba",
    "bốn",
    "năm",
    "sáu",
    "bảy",
    "tám",
    "chín",
)

#: Indexed from the thousands upwards; the units triplet has no name of its own.
MAGNITUDE_NAMES = ("nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ")


def _read_triplet(value: int, speak_zero_hundreds: bool) -> str:
    hundreds, rest = divmod(value, 100)
    tens, units = divmod(rest, 10)
    parts: list[str] = []

    if hundreds > 0:
        parts.append(f"{DIGIT_WORDS[hundreds]} trăm")
    elif speak_zero_hundreds:
        parts.append("không trăm")

    if tens > 0:
        parts.append("mười" if tens == 1 else f"{DIGIT_WORDS[tens]} mươi")
    elif units > 0 and (hundreds > 0 or speak_zero_hundreds):
        parts.append("linh")

    if units > 0:
        if units == 1:
            parts.append("mốt" if tens >= 2 else "một")
        elif units == 4:
            parts.append("tư" if tens >= 2 else "bốn")
        elif units == 5:
            parts.append("lăm" if tens >= 1 else "năm")
        else:
            parts.append(DIGIT_WORDS[units])

    return " ".join(parts)


def to_words(amount: int) -> str:
    """Read ``amount`` out in Vietnamese words.

    Raises :class:`~vn_money.core.VndError` with reason ``not-integer`` for
    anything that is not a whole amount, and ``out-of-range`` past 2^53-1.
    """
    if isinstance(amount, bool) or not isinstance(amount, int):
        raise VndError("not-integer", f"{amount!r} is not a whole amount")
    if abs(amount) > MAX_SAFE_AMOUNT:
        raise VndError("out-of-range", f"{amount} cannot be represented exactly")
    if amount == 0:
        return "không"

    negative = amount < 0
    digits = str(abs(amount))

    if len(digits) > (len(MAGNITUDE_NAMES) + 1) * 3:
        raise VndError("out-of-range", f"{amount} needs more triplets than are named")

    # Only the triplets the number actually occupies. Padding to the full width
    # would push the significant digits into the topmost triplet and read five
    # dong as five million billion.
    group_count = -(-len(digits) // 3)
    padded = digits.rjust(group_count * 3, "0")

    # i counts magnitudes from the units upwards, but the padded string counts
    # characters from the left, so the offset is the mirror of i.
    triplets = [
        int(padded[(group_count - 1 - i) * 3 : (group_count - 1 - i) * 3 + 3])
        for i in range(group_count)
    ]

    lowest = next((i for i, t in enumerate(triplets) if t != 0), group_count)
    words: list[str] = []
    started = False

    for i in range(group_count - 1, -1, -1):
        triplet = triplets[i]
        magnitude = "" if i == 0 else MAGNITUDE_NAMES[i - 1]

        if triplet == 0:
            # A zero triplet above the most significant one is padding the
            # number happens to have, not a place value the speaker intended.
            # So is a trailing one: 1,000,000 is "một triệu", not "một triệu
            # không nghìn". Only a zero with a non-zero triplet below it is a
            # real hole.
            if started and i > 0 and i > lowest:
                words.append(f"không {magnitude}")
            continue

        text = _read_triplet(triplet, started)
        words.append(text if magnitude == "" else f"{text} {magnitude}")
        started = True

    return ("âm " if negative else "") + " ".join(words)
