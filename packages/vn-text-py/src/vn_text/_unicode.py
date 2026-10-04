"""Unicode constants that matter for Vietnamese text handling.

The trap
--------

Four characters look like a capital or lowercase D with a stroke::

    U+0110  LATIN CAPITAL LETTER D WITH STROKE   -> Vietnamese
    U+0111  LATIN SMALL LETTER D WITH STROKE     -> Vietnamese
    U+00D0  LATIN CAPITAL LETTER ETH              -> Icelandic, Danish
    U+00F0  LATIN SMALL LETTER ETH                -> Icelandic, Danish

None has a canonical decomposition, and none has a compatibility decomposition
either -- verified against both NFD and NFKD. Unicode treats each as a letter in
its own right rather than a decorated ``D``.

Why that breaks search
----------------------

The obvious implementation, normalise to NFD and strip the combining marks,
silently fails to fold Vietnamese ``Đ``::

    'Đặng Minh'  ->  'Đang Minh'

The surviving ``Đ`` means the index key no longer matches anything a user can
type, because nobody types ``Đang`` to find ``Đặng``. Nothing throws. Search
just quietly returns fewer results than it should.

The obvious repair is worse. A blanket "fold any stroked D" rule also turns ETH
into ``D``, corrupting Icelandic and Danish names. Transliteration tables that
treat ``Đ`` as decoration hit exactly that.

So the two must be distinguished explicitly. That is what
:func:`vn_text.strip_stroke` does: U+0110 and U+0111, nothing else.

All code points below are written as :func:`chr` calls rather than as literal
characters or ``\\uXXXX`` escapes. Combining marks are invisible in an editor
and a stray reformat or copy-paste can silently corrupt a character class that
happens to still compile. Keeping this module pure ASCII makes that class of
accident impossible, and keeps diffs readable.
"""

from __future__ import annotations

import re

#: LATIN CAPITAL LETTER D WITH STROKE (Vietnamese).
D_WITH_STROKE_UPPER = chr(0x0110)

#: LATIN SMALL LETTER D WITH STROKE (Vietnamese).
D_WITH_STROKE_LOWER = chr(0x0111)

#: LATIN CAPITAL LETTER ETH (Icelandic, Danish). Never fold to D.
ETH_UPPER = chr(0x00D0)

#: LATIN SMALL LETTER ETH (Icelandic, Danish). Never fold to d.
ETH_LOWER = chr(0x00F0)

#: The five Vietnamese tone marks as combining marks, in NFD form.
#: sắc, huyền, hỏi, ngã, nặng.
TONE_MARKS: tuple[str, ...] = (
    chr(0x0301),  # sắc    - COMBINING ACUTE ACCENT
    chr(0x0300),  # huyền  - COMBINING GRAVE ACCENT
    chr(0x0309),  # hỏi    - COMBINING HOOK ABOVE
    chr(0x0303),  # ngã    - COMBINING TILDE
    chr(0x0323),  # nặng   - COMBINING DOT BELOW
)

#: Full Combining Diacritical Marks block, U+0300 to U+036F.
COMBINING_MARKS = re.compile(f"[{chr(0x0300)}-{chr(0x036F)}]")

#: Vietnamese-specific letters: D WITH STROKE plus the precomposed block
#: U+1EA0 to U+1EF9 (a-circumflex-dot-below through y-tilde-dot-below).
VIETNAMESE_SPECIFIC = re.compile(
    f"[{D_WITH_STROKE_UPPER}{D_WITH_STROKE_LOWER}{chr(0x1EA0)}-{chr(0x1EF9)}]"
)
