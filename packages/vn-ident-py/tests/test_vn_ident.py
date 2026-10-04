"""Run the shared identity conformance suite against the Python port.

Runnable two ways, on purpose:

    pytest packages/vn-ident-py/tests -q
    python packages/vn-ident-py/tests/test_vn_ident.py

The second form needs nothing installed. The conformance suite is the contract
between the two ports, and being able to check it with nothing but a Python
interpreter is what stops them drifting apart.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from vn_ident import (  # noqa: E402  (path set up above)
    ASSIGNED_PREFIX_COUNT,
    CARRIERS,
    CENTURY_GENDER,
    MST_MODULUS,
    MST_WEIGHTS,
    PROVINCES,
    classify_id,
    detect_carrier,
    is_valid_cccd,
    is_valid_cmnd,
    is_valid_mst,
    is_valid_phone,
    mst_check_digit,
    normalize_phone,
    parse_cccd,
    parse_mst,
)

CONFORMANCE_PATH = (
    Path(__file__).resolve().parents[3] / "conformance" / "vn-ident-1.0.0.json"
)


def load_suite() -> dict[str, Any]:
    with CONFORMANCE_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


SUITE = load_suite()
CASES = SUITE["cases"]
TABLES = SUITE["tables"]


def _as_tuple(value: Any) -> tuple[Any, ...]:
    """The JSON suite gives lists; the port gives tuples.

    Compared as lists, because that is what the file contains and what the
    TypeScript port sees. A runner that quietly normalised here would hide a
    real difference in the table order.
    """
    return value if isinstance(value, list) else list(value)


RUNNERS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "mstCheckDigit": lambda d: mst_check_digit(d["prefix"]),
    "isValidMst": lambda d: is_valid_mst(d["code"]),
    "parseMst": lambda d: (
        None
        if parse_mst(d["code"]) is None
        else {
            "regionCode": parse_mst(d["code"]).region_code,
            "serial": parse_mst(d["code"]).serial,
            "checkDigit": parse_mst(d["code"]).check_digit,
            "branch": parse_mst(d["code"]).branch,
        }
    ),
    "normalizePhone": lambda d: normalize_phone(
        d["input"], assume_trunk_zero=(d.get("options") or {}).get("assumeTrunkZero", True)
    ),
    "detectCarrier": lambda d: detect_carrier(d["phone"]),
    "isValidPhone": lambda d: is_valid_phone(d["input"]),
    "isValidCccd": lambda d: is_valid_cccd(d["code"]),
    "parseCccd": lambda d: (
        None
        if parse_cccd(d["code"]) is None
        else {
            "provinceCode": parse_cccd(d["code"]).province_code,
            "province": parse_cccd(d["code"]).province,
            "century": parse_cccd(d["code"]).century,
            "gender": parse_cccd(d["code"]).gender,
            "birthYear": parse_cccd(d["code"]).birth_year,
            "serial": parse_cccd(d["code"]).serial,
        }
    ),
    "isValidCmnd": lambda d: is_valid_cmnd(d["code"]),
    "classifyId": lambda d: classify_id(d["value"]),
}


def test_schema_is_understood() -> None:
    assert SUITE["schema"] == "vn-ident-conformance/1", SUITE["schema"]


def test_package_ships_a_py_typed_marker() -> None:
    # The package declares "Typing :: Typed" on the PyPI page. Without this
    # marker a type checker ignores every annotation in the module, so the claim
    # is false and a consumer running mypy gets "untyped import" from a library
    # that is annotated throughout.
    import vn_ident

    marker = Path(vn_ident.__file__).resolve().parent / "py.typed"
    assert marker.exists(), (
        f"{marker} is missing. The wheel must contain it, or drop the "
        f"Typing :: Typed classifier instead of advertising types it hides."
    )


def test_suite_records_every_source() -> None:
    # Four sources, not one. A single-source transcription of a weight table or
    # a province list is a typo waiting to be shipped.
    derived = SUITE["derivedFrom"]
    assert "105/2020/TT-BTC" in derived, derived
    assert "124/2004" in derived, derived
    assert "cross-checked" in derived, derived


def test_case_ids_are_unique() -> None:
    ids = [c["id"] for c in CASES]
    assert len(set(ids)) == len(ids), "duplicate case ids in conformance file"


def test_every_function_has_cases() -> None:
    for fn in SUITE["functions"]:
        count = sum(1 for c in CASES if c["fn"] == fn)
        assert count > 0, f"no cases for {fn}"
        assert count == SUITE["caseCounts"][fn], (
            f"{fn}: caseCounts says {SUITE['caseCounts'][fn]} but there are {count}"
        )


def test_tables_match_the_suite() -> None:
    # The tables are the contract. A regeneration cannot quietly reorder them
    # without showing up here.
    assert _as_tuple(MST_WEIGHTS) == TABLES["mstWeights"]
    assert MST_MODULUS == TABLES["mstModulus"]
    assert len(MST_WEIGHTS) == 9

    assert len(PROVINCES) == 63
    assert len(TABLES["provinces"]) == 63
    codes = [code for code, _ in PROVINCES]
    assert len(set(codes)) == len(codes), "duplicate province codes"
    names = [name for _, name in PROVINCES]
    assert len(set(names)) == len(names), "duplicate province names"

    assert len(CENTURY_GENDER) == 10
    assert sorted(int(d) for d, _, _ in CENTURY_GENDER) == list(range(10))

    all_prefixes = [p for _, prefixes in CARRIERS for p in prefixes]
    assert len(all_prefixes) == 34
    assert len(set(all_prefixes)) == 34, "a prefix is assigned to two carriers"
    assert ASSIGNED_PREFIX_COUNT == 34
    assert TABLES["carrierCount"] == 34


def test_conformance_suite() -> None:
    failures: list[str] = []
    for case in CASES:
        try:
            actual = RUNNERS[case["fn"]](case["input"])
        except (TypeError, ValueError) as exc:
            actual = {"error": type(exc).__name__}
        if actual != case["expected"]:
            failures.append(
                f"{case['id']}  {case['fn']}({case['input']!r})\n"
                f"    expected: {case['expected']!r}\n"
                f"    actual:   {actual!r}\n"
                f"    note:     {case.get('note', '')}"
            )
    assert not failures, f"{len(failures)} conformance failures:\n" + "\n".join(failures[:10])


# --- Invariants -------------------------------------------------------------


def test_reproduces_the_worksed_example_from_the_circular() -> None:
    # The one anchor that comes from outside this repository. Everything else
    # about the tax rules is a transcription; this is the transcription being
    # checked against its source.
    assert mst_check_digit("010004751") == 6
    assert is_valid_mst("0100047516") is True


def test_zero_remainder_gives_none_not_ten() -> None:
    # 10 - 0 is 10, which is not a digit, so the circular skips the sequence
    # number. A naive implementation returns 10 and then compares it against a
    # character, so it rejects valid codes without ever saying why.
    assert mst_check_digit("000000000") is None
    assert is_valid_mst("0000000000") is False
    for d in range(10):
        assert is_valid_mst(f"000000000{d}") is False, f"check digit {d}"


def test_every_check_digit_value_is_reachable() -> None:
    seen = set()
    for n in range(40000):
        check = mst_check_digit(str(n).zfill(9))
        if check is not None:
            seen.add(check)
        if len(seen) == 10:
            break
    assert sorted(seen) == list(range(10))


def test_exactly_one_tenth_digit_is_accepted() -> None:
    # The property the whole thing rests on: change any digit and the code is
    # refused. If two digits passed, the check digit would not be checking.
    for prefix in ("010004751", "030475101", "790000000", "012345678"):
        accepted = [d for d in range(10) if is_valid_mst(f"{prefix}{d}")]
        assert accepted == [mst_check_digit(prefix)], prefix


def test_whitespace_and_separators_are_refused_not_trimmed() -> None:
    assert is_valid_mst("0100047516") is True
    assert is_valid_mst("0100047516 ") is False
    assert is_valid_mst(" 0100047516") is False
    assert is_valid_mst("01.00047516") is False
    # The hyphen the circular prints is the one exception, in the right place.
    assert is_valid_mst("0100047516-001") is True


def test_a_non_string_is_refused_rather_than_crashing() -> None:
    # The TypeScript port takes `unknown` here. A Python caller passing None or
    # an int must get the same answer, not a traceback.
    for value in (None, 12345, [], {}, 0):
        assert is_valid_mst(value) is False, repr(value)
        assert is_valid_cccd(value) is False, repr(value)
        assert is_valid_cmnd(value) is False, repr(value)
        assert is_valid_phone(value) is False, repr(value)
        assert normalize_phone(value) is None, repr(value)
        assert detect_carrier(value) is None, repr(value)
        assert parse_mst(value) is None, repr(value)
        assert parse_cccd(value) is None, repr(value)
        assert classify_id(value) == "unknown", repr(value)


def test_every_province_code_parses_to_its_own_name() -> None:
    for code, name in PROVINCES:
        parsed = parse_cccd(f"{code}098512345")
        assert parsed is not None, code
        assert parsed.province == name, code
        assert parsed.province_code == code


def test_the_century_digit_is_what_makes_a_birth_year() -> None:
    # 85 in the fourth digit 0 is 1985; in the fourth digit 2 it is 2085. This
    # is the whole reason the fourth digit exists.
    assert parse_cccd("001085123456").birth_year == 1985
    assert parse_cccd("001285123456").birth_year == 2085
    assert parse_cccd("001285123456").century == 21


def test_a_future_year_still_parses() -> None:
    # There is no check digit, so nothing can detect it, and a date-dependent
    # "valid" would make the conformance suite change its own answer over time.
    # The fourth digit 8 is the twenty-fourth century, so 99 there is 2399.
    assert parse_cccd("001899999999").birth_year == 2399
    assert parse_cccd("001000000000").birth_year == 1900


def test_phone_normalisation_is_one_number_many_spellings() -> None:
    expected = "0912345678"
    for text in (
        "0912345678", "+84912345678", "84912345678", "840912345678",
        "0912 345 678", "0912-345-678", "0912.345.678", "(0912) 345678",
        "  0912345678  ",
    ):
        assert normalize_phone(text) == expected, text


def test_the_one_inference_is_switchable() -> None:
    assert normalize_phone("912345678") == "0912345678"
    assert normalize_phone("912345678", assume_trunk_zero=False) is None


def test_a_valid_number_can_belong_to_nobody() -> None:
    # 34 of the 100 three-digit prefixes are assigned. "Unassigned" is a
    # different answer from "invalid", and this is where the two get confused.
    assert is_valid_phone("0953456780") is True
    assert detect_carrier("0953456780") is None
    assert is_valid_phone("0800123456") is True
    assert detect_carrier("0800123456") is None


def test_detect_carrier_does_not_normalise() -> None:
    # Guessing the trunk zero is how a number ends up attributed to the wrong
    # network, which then decides which carrier portal the user is sent to.
    assert detect_carrier("912345678") is None
    assert detect_carrier("+84912345678") is None


def test_classify_id_sorts_out_the_four_shapes() -> None:
    assert classify_id("001098512345") == "cccd"
    assert classify_id("001001001") == "cmnd"
    assert classify_id("0100047516") == "mst"
    assert classify_id("0100047516001") == "mst"
    assert classify_id("0912345678") == "phone"
    assert classify_id("") == "unknown"
    assert classify_id("abc") == "unknown"


def _run_standalone() -> int:
    tests = [
        (name, obj)
        for name, obj in sorted(globals().items())
        if name.startswith("test_") and callable(obj)
    ]
    failed = 0
    for name, fn in tests:
        try:
            fn()
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {name}\n{exc}\n")
        else:
            print(f"ok   {name}")
    print()
    print(f"{len(tests) - failed}/{len(tests)} test functions passed")
    counts = SUITE["caseCounts"]
    detail = ", ".join(f"{fn} {counts[fn]}" for fn in SUITE["functions"])
    print(f"{len(CASES)} conformance cases: {detail}")
    print(f"63 provinces, {ASSIGNED_PREFIX_COUNT} carrier prefixes")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_standalone())
