"""Vietnamese tax codes, mobile numbers and card numbers.

Standard library only, and a conformance suite shared with the TypeScript port
at conformance/vn-ident-1.0.0.json.

The one thing to read before using it: a tax code has a check digit and this
can tell you it is right. A card number does not, and this cannot. Both facts
are stated in the code, in the suite and in the README, because a validation
library that overstates what it checks is worse than one that checks less.
"""

from __future__ import annotations

from vn_ident.identity import (
    CardNumber,
    IdentifierKind,
    classify_id,
    is_valid_cccd,
    is_valid_cmnd,
    parse_cccd,
)
from vn_ident.mst import TaxCode, is_valid_mst, mst_check_digit, parse_mst
from vn_ident.phone import detect_carrier, is_valid_phone, normalize_phone
from vn_ident.tables import (
    ASSIGNED_PREFIX_COUNT,
    CARRIERS,
    CENTURY_GENDER,
    MST_MODULUS,
    MST_WEIGHTS,
    PROVINCES,
    Carrier,
    Gender,
    carrier_of_prefix,
    century_of,
    gender_of,
    is_province_code,
    province_name,
)

__all__ = [
    "ASSIGNED_PREFIX_COUNT",
    "CARRIERS",
    "CARRIER_NAMES",
    "CENTURY_GENDER",
    "MST_MODULUS",
    "MST_WEIGHTS",
    "PROVINCES",
    "CardNumber",
    "Carrier",
    "Gender",
    "IdentifierKind",
    "TaxCode",
    "carrier_of_prefix",
    "century_of",
    "classify_id",
    "detect_carrier",
    "gender_of",
    "is_province_code",
    "is_valid_cccd",
    "is_valid_cmnd",
    "is_valid_mst",
    "is_valid_phone",
    "mst_check_digit",
    "normalize_phone",
    "parse_cccd",
    "parse_mst",
    "province_name",
]

__version__ = "0.1.0"

#: The five carrier names, in the order the table lists them.
CARRIER_NAMES: tuple[Carrier, ...] = tuple(name for name, _ in CARRIERS)
