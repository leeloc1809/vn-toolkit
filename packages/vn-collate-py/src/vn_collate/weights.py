"""Collation weights for Vietnamese, derived from ICU.

Do not hand-edit this table. Every value was read out of ICU by
``scripts/generate-collation-conformance.mjs`` and pinned by the 519 cases in
``conformance/vn-collate-1.0.0.json``. The suite records the exact runtime it
came from, so a future ICU change surfaces as a failing test rather than as a
silent behaviour change.
"""

from __future__ import annotations

#: Primary weights, in ICU order. 33 letters.
#:
#: The first 29 are the Vietnamese alphabet in its official order. The last four
#: are w, x, y, z: x and y are Vietnamese, but w and z are not -- they appear
#: because ICU's vi-VN locale still collates them as letters in meaningful
#: positions instead of dropping them into the fallback bucket alongside
#: punctuation. Keeping them where ICU puts them is what makes "sorts like ICU"
#: true rather than approximately true.
PRIMARY_ORDER: tuple[str, ...] = (
    "a", "ă", "â", "b", "c", "d", "đ", "e", "ê",
    "f", "g", "h", "i", "j", "k", "l", "m", "n",
    "o", "ô", "ơ", "p", "q", "r", "s", "t", "u",
    "ư", "v", "w", "x", "y", "z",
)

#: Tone weights. Uniform across every base letter, confirmed by probing all 33.
TONE_ORDER: tuple[str, ...] = ("none", "huyền", "hỏi", "ngã", "sắc", "nặng")


def cp(code_point: int) -> str:
    """Return the character for a code point.

    Combining marks are written as code points, never as literal characters.
    They are invisible in an editor, and a stray reformat can silently corrupt
    a lookup table that still compiles.
    """
    return chr(code_point)


#: Marks that modify the base letter rather than carrying tone.
LETTER_MODIFIERS: frozenset[str] = frozenset(
    {cp(0x0302), cp(0x0306), cp(0x031B)}  # circumflex, breve, horn
)

#: Marks that carry tone, mapped to their weight in TONE_ORDER.
TONE_MARKS: dict[str, int] = {
    cp(0x0300): 1,  # huyền
    cp(0x0309): 2,  # hỏi
    cp(0x0303): 3,  # ngã
    cp(0x0301): 4,  # sắc
    cp(0x0323): 5,  # nặng
}

#: Primary byte layout.
#:
#:     0x01..0x0A   digits 0-9, which ICU sorts before every letter
#:     0x0B..0x2B   the 33 letters above
#:     0xFE         anything else
#:
#: 0x00 is reserved as the level terminator, so no weight may be zero.
DIGIT_PRIMARY_BASE = 0x01
LETTER_PRIMARY_BASE = 0x0B
FALLBACK_PRIMARY = 0xFE

DIGITS = "0123456789"

PRIMARY_INDEX: dict[str, int] = {
    letter: LETTER_PRIMARY_BASE + i for i, letter in enumerate(PRIMARY_ORDER)
}

TERMINATOR = 0x00
