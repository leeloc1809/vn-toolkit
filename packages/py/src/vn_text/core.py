"""Core Vietnamese text transforms.

Standard library only, on purpose. A text-normalisation library that drags in
a dependency is a dependency every consumer has to audit, and this one has to
stay auditable itself.

Every function here has a counterpart in the TypeScript port, and both ports
are validated against the same conformance file at
``conformance/vn-text-1.0.0.json``.
"""

from __future__ import annotations

import unicodedata

from ._unicode import (
    COMBINING_MARKS,
    D_WITH_STROKE_LOWER,
    D_WITH_STROKE_UPPER,
    ETH_LOWER,
    ETH_UPPER,
    VIETNAMESE_SPECIFIC,
)

__all__ = [
    "normalize",
    "decompose",
    "deaccent",
    "strip_stroke",
    "repair_mojibake",
    "fold",
    "is_vietnamese",
    # camelCase aliases for API parity with the TypeScript port.
    "stripStroke",
    "repairMojibake",
    "isVietnamese",
]


def normalize(text: str) -> str:
    """Normalise to Unicode Normalization Form C (composed).

    The form to use for storage, database keys, equality checks and
    deduplication. Two strings that look identical to a user can differ at the
    code-point level if one came from a Windows-1252 editor and the other from
    a UTF-8 terminal; NFC collapses them.

    >>> normalize(decompose("Cái gì thế này")) == "Cái gì thế này"
    True
    """
    return unicodedata.normalize("NFC", text)


def decompose(text: str) -> str:
    """Normalise to Unicode Normalization Form D (decomposed).

    Vietnamese letters such as ``ế`` become a base ``e`` plus the combining
    marks U+0302 (circumflex) and U+0301 (acute). Exposed because downstream
    code that walks combining marks needs the decomposed form.
    """
    return unicodedata.normalize("NFD", text)


def deaccent(text: str) -> str:
    """Remove every combining diacritical mark, leaving base letters intact.

    Applies to all of Unicode, not just Vietnamese -- ``café`` becomes
    ``cafe``, ``Ѐ`` becomes ``Е``.

    What this function deliberately does NOT do:

    It does not fold ``đ`` (U+0111) to ``d``. Vietnamese D-WITH-STROKE has no
    canonical decomposition, so it survives NFD untouched and comes back out
    as ``đ``. That is correct: stripping tone marks should not change which
    letter you are looking at. Use :func:`strip_stroke` or :func:`fold` when
    you need ``đ`` to become ``d``.

    It also leaves ETH (U+00D0) alone, because ETH is a real letter in
    Icelandic and Danish, not a decorated D.

    >>> deaccent("Tiếng Việt")
    'Tieng Viet'
    >>> deaccent("Đặng Minh")
    'Đang Minh'
    >>> deaccent("Ðor")
    'Ðor'
    """
    return unicodedata.normalize(
        "NFC", COMBINING_MARKS.sub("", unicodedata.normalize("NFD", text))
    )


def strip_stroke(text: str) -> str:
    """Replace Vietnamese D-WITH-STROKE with plain ``d`` / ``D``.

    Nothing else is changed. In particular tone marks are left alone -- that is
    :func:`deaccent`'s job -- and ETH (U+00D0, U+00F0) is preserved because it
    is a different letter belonging to another script.

    >>> strip_stroke("Đặng")
    'Dặng'
    >>> strip_stroke("Ðor")
    'Ðor'
    """
    return text.replace(D_WITH_STROKE_UPPER, "D").replace(
        D_WITH_STROKE_LOWER, "d"
    )


def repair_mojibake(text: str) -> str:
    """Repair the most common corruption in stored Vietnamese text.

    Maps ``Ð`` (U+00D0) to ``Đ`` (U+0110) and ``ð`` (U+00F0) to ``đ`` (U+0111).

    This is a **data repair** operation, not a search-key operation. It answers
    a different question from :func:`deaccent` and :func:`fold`:

    - :func:`fold` produces a search key and never reinterprets which letter you
      have. It leaves ``Ð`` alone, because in Icelandic and Danish it is a real
      letter called eth.
    - ``repair_mojibake`` assumes the text *is* Vietnamese and that ``Ð`` is
      damage. In Vietnamese text produced by legacy systems, ``Ð`` is
      essentially always a mangled ``Đ``, and leaving it in place means a user
      can never find the record again.

    Compose them when the corpus is Vietnamese and may be damaged::

        fold(repair_mojibake('Ðảm baỏ'))  # 'dam bao' -> finds the record

    What it deliberately does not do:

    - **It is Vietnamese-biased by design.** ``repair_mojibake('Ðor')`` returns
      ``'Đor'``, which is wrong for an Icelandic name. That is the trade, and it
      is the right one for a Vietnamese library, but do not call it on text you
      know contains Scandinavian or Icelandic content.
    - **It does not recover byte-level mojibake.** Damage of the form ``Ä Ä¡``
      comes from UTF-8 bytes decoded as Windows-1252, and undoing it needs the
      original bytes, not a character mapping. There is a dedicated library for
      that (``ftfy``); guessing at it from a Unicode string is not reliable
      enough to ship.
    - **It does not fix spelling or vowel composition.** ``lựơng`` stays
      ``lựơng``. Those are separate problems, and ``VietnameseTextNormalizer``
      and ``underthesea.text_normalize`` are the right tools for them.

    >>> repair_mojibake('Ðảm baỏ')
    'Đảm bảo'
    """
    return text.replace(ETH_UPPER, D_WITH_STROKE_UPPER).replace(
        ETH_LOWER, D_WITH_STROKE_LOWER
    )


def fold(text: str) -> str:
    """Produce a search key.

    Accent-free, stroke-free, lower-cased, with every run of punctuation and
    symbols collapsed to a single space. This is the canonical form to index
    under for Vietnamese search: two strings a user would consider the same
    hit produce the same key.

    >>> fold("Cái gì thế này")
    'cai gi the nay'
    >>> fold("Đặng Minh Anh")
    'dang minh anh'
    >>> fold("Hà Nội, Việt Nam!")
    'ha noi viet nam'

    Letters from other scripts are preserved rather than dropped, so
    ``fold("東京 Tokyo")`` gives ``"東京 tokyo"`` -- the ideographs stay
    searchable even though they carry no diacritics.
    """
    folded = strip_stroke(deaccent(text)).lower()
    # Lower-casing can reintroduce combining marks, e.g. U+0130 -> i + U+0307.
    folded = COMBINING_MARKS.sub("", unicodedata.normalize("NFD", folded))
    # str.isalnum() is the closest stdlib equivalent of JavaScript's
    # \p{L}\p{N}, covering the L* and N* general categories.
    spaced = "".join(ch if ch.isalnum() else " " for ch in folded)
    return " ".join(spaced.split())


def is_vietnamese(text: str) -> bool:
    """True when the string contains at least one Vietnamese-specific character.

    Useful for deciding whether a string needs Vietnamese-aware handling at
    all.

    This is a fast heuristic, not a language detector: the common Vietnamese
    surnames ``Nguyen``, ``Tran`` and ``Le`` are pure ASCII and return False.

    >>> is_vietnamese("Đặng")
    True
    >>> is_vietnamese("Nguyen")
    False
    """
    return VIETNAMESE_SPECIFIC.search(text) is not None


#: API-parity alias, so code can move between the Python and TypeScript ports
#: without renaming every call site.
stripStroke = strip_stroke

#: API-parity alias, see :func:`stripStroke`.
repairMojibake = repair_mojibake

#: API-parity alias, see :func:`stripStroke`.
isVietnamese = is_vietnamese
