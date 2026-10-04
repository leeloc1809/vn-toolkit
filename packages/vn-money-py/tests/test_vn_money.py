"""Run the shared money conformance suite against the Python port.

Runnable two ways, on purpose:

    pytest packages/vn-money-py/tests -q
    python packages/vn-money-py/tests/test_vn_money.py

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

from vn_money import (  # noqa: E402  (path set up above)
    CURRENCY_CODE,
    CURRENCY_SYMBOL,
    MINOR_UNITS,
    SYMBOL_SPACER,
    VndError,
    allocate,
    format_vnd,
    is_vnd,
    parse_vnd,
    to_words,
)

CONFORMANCE_PATH = (
    Path(__file__).resolve().parents[3] / "conformance" / "vn-money-1.0.0.json"
)


def load_suite() -> dict[str, Any]:
    with CONFORMANCE_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


SUITE = load_suite()
CASES = SUITE["cases"]


RUNNERS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "isVnd": lambda d: is_vnd(d["value"]),
    "formatVnd": lambda d: format_vnd(
        d["amount"],
        group_separator=(d.get("options") or {}).get("groupSeparator", "."),
        symbol=(d.get("options") or {}).get("symbol", CURRENCY_SYMBOL),
        with_symbol=(d.get("options") or {}).get("withSymbol", True),
        with_sign=(d.get("options") or {}).get("withSign", False),
    ),
    "parseVnd": lambda d: parse_vnd(d["input"]),
    "allocate": lambda d: allocate(d["total"], d["shares"]),
    "toWords": lambda d: to_words(d["amount"]),
}


def test_schema_is_understood() -> None:
    assert SUITE["schema"] == "vn-money-conformance/1", SUITE["schema"]


def test_package_ships_a_py_typed_marker() -> None:
    # The package declares "Typing :: Typed" on the PyPI page. Without this
    # marker a type checker ignores every annotation in the module, so the
    # claim is false and a consumer running mypy gets "untyped import" from a
    # library that is annotated throughout.
    import vn_money

    marker = Path(vn_money.__file__).resolve().parent / "py.typed"
    assert marker.exists(), (
        f"{marker} is missing. The wheel must contain it, or drop the "
        f"Typing :: Typed classifier instead of advertising types it hides."
    )


def test_suite_records_its_provenance() -> None:
    # If a future ICU disagrees, this string is how you find out what moved.
    assert "ICU " in SUITE["derivedFrom"], SUITE["derivedFrom"]


def test_case_ids_are_unique() -> None:
    ids = [c["id"] for c in CASES]
    assert len(set(ids)) == len(ids), "duplicate case ids in conformance file"


def test_every_function_has_cases() -> None:
    # A function with no cases would let a stub pass, and the suite would look
    # comprehensive while checking nothing about it.
    for fn in SUITE["functions"]:
        count = sum(1 for c in CASES if c["fn"] == fn)
        assert count > 0, f"no cases for {fn}"
        assert count == SUITE["caseCounts"][fn], (
            f"{fn}: caseCounts says {SUITE['caseCounts'][fn]} but there are {count}"
        )


def test_currency_facts_match_the_suite() -> None:
    assert SUITE["currency"]["code"] == CURRENCY_CODE
    assert SUITE["currency"]["minorUnits"] == MINOR_UNITS
    # The whole package works on integers because of this one line of ISO 4217.
    # If it ever changes, every function changes with it.
    assert MINOR_UNITS == 0


def test_reading_convention_is_stated_not_assumed() -> None:
    # There is no platform to defer to for Vietnamese number reading, so the
    # suite has to state the choice. A convention that is not written down is a
    # convention nobody can check.
    convention = SUITE["readingConvention"]
    assert convention["fillerWord"] == "linh", convention
    assert isinstance(convention["magnitudeNames"], list)
    for key in ("unitOne", "unitFour", "unitFive", "tensOne", "emptyTriplet"):
        assert "alternative" in convention[key], f"{key} names no rejected reading"


def test_conformance_suite() -> None:
    failures: list[str] = []
    for case in CASES:
        try:
            actual = RUNNERS[case["fn"]](case["input"])
        except VndError as exc:
            actual = {"error": exc.reason}
        if actual != case["expected"]:
            failures.append(
                f"{case['id']}  {case['fn']}({case['input']!r})\n"
                f"    expected: {case['expected']!r}\n"
                f"    actual:   {actual!r}\n"
                f"    note:     {case.get('note', '')}"
            )
    assert not failures, f"{len(failures)} conformance failures:\n" + "\n".join(failures[:10])


# --- Invariants -------------------------------------------------------------


def test_formatted_amounts_parse_back() -> None:
    for amount in (0, 1, 999, 1000, 1001, 123456789, 1000000000, -1000, -123456789):
        assert parse_vnd(format_vnd(amount)) == amount, format_vnd(amount)


def test_formatter_agrees_with_icu_on_the_agreed_points() -> None:
    # The suite holds ICU's own output. These are the two facts ICU pins that
    # are easy to lose in a refactor: a no-break space, and no decimals.
    assert format_vnd(1000000) == "1.000.000" + SYMBOL_SPACER + CURRENCY_SYMBOL
    assert "." not in format_vnd(1000000).replace("1.000.000", "")
    assert SYMBOL_SPACER == chr(0x00A0)
    assert CURRENCY_SYMBOL == chr(0x20AB)


def test_is_vnd_rejects_anything_not_exact() -> None:
    for value in (1.5, 0.5, "1000", None, True, [], 2**53):
        assert is_vnd(value) is False, repr(value)
    # A refund is a negative amount, not an invalid one.
    for value in (0, 1, -1, 2**53 - 1, -(2**53 - 1)):
        assert is_vnd(value) is True, repr(value)


def test_parse_refuses_rather_than_guesses() -> None:
    for text, reason in (
        ("", "empty"),
        ("   ", "empty"),
        ("-", "empty"),
        ("1.5", "has-decimal"),
        ("1,50", "has-decimal"),
        ("abc", "unexpected-character"),
        ("1e3", "unexpected-character"),
        ("1000₫500", "unexpected-character"),
    ):
        try:
            parse_vnd(text)
        except VndError as exc:
            assert exc.reason == reason, f"{text!r} gave {exc.reason}"
        else:
            raise AssertionError(f"{text!r} parsed, but it should not have")


def test_allocate_parts_add_back_up() -> None:
    for total, shares in (
        (100, [1, 1, 1]),
        (1, [1, 1, 1, 1, 1]),
        (0, [1, 2, 3]),
        (-100, [1, 1, 1]),
        (12345, [2, 3, 5]),
        (1000000, [1, 1, 1]),
        (2**53 - 1, [1, 1]),
    ):
        parts = allocate(total, shares)
        assert sum(parts) == total, f"{total} {[1] * len(shares)} -> {parts}"


def test_allocate_is_reproducible() -> None:
    once = allocate(100, [1, 1, 1])
    for _ in range(20):
        assert allocate(100, [1, 1, 1]) == once


def test_allocate_treats_a_zero_share_as_nobody() -> None:
    # A filtered list gives [0, 0, 1]. Refusing it would break the caller rather
    # than the input.
    assert allocate(100, [0, 0, 1]) == [0, 0, 100]


def test_allocate_rejects_impossible_shares() -> None:
    for total, shares in ((100, []), (100, [0, 0]), (100, [1, -1]), (100, [1, 1.5])):
        try:
            allocate(total, shares)
        except VndError as exc:
            assert exc.reason in {"not-integer", "empty-shares", "invalid-shares"}, exc.reason
        else:
            raise AssertionError(f"allocate({total}, {shares}) should have raised")


def test_words_pins_the_contested_values() -> None:
    # Each of these is a value where two published Vietnamese conventions
    # disagree. They are pinned, with the rejected reading, in the suite.
    for amount, expected in (
        (5, "năm"),
        (15, "mười lăm"),
        (14, "mười bốn"),
        (11, "mười một"),
        (21, "hai mươi mốt"),
        (24, "hai mươi tư"),
        (105, "một trăm linh năm"),
        (1001, "một nghìn không trăm linh một"),
        (1000000, "một triệu"),
        (1000008, "một triệu không nghìn không trăm linh tám"),
    ):
        assert to_words(amount) == expected, f"{amount}"


def test_words_prefixes_a_negative_amount() -> None:
    assert to_words(-1) == "âm một"
    assert to_words(-15000) == "âm mười lăm nghìn"


def test_words_refuses_a_fraction() -> None:
    for value in (1.5, "5", None, True):
        try:
            to_words(value)
        except VndError as exc:
            assert exc.reason == "not-integer", exc.reason
        else:
            raise AssertionError(f"to_words({value!r}) should have raised")


def test_every_value_from_0_to_999_is_covered() -> None:
    # The triplet rules live between 0 and 999, and the cases that break a
    # reading rule are the ones nobody thinks to write down.
    covered = {c["input"]["amount"] for c in CASES if c["fn"] == "toWords"}
    missing = [n for n in range(1000) if n not in covered]
    assert not missing, f"{len(missing)} values below 1000 are not covered: {missing[:10]}"


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
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_standalone())
