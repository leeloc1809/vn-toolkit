"""Run the shared collation conformance suite against the Python port.

Runnable two ways, on purpose:

    pytest packages/vn-collate-py/tests -q
    python packages/vn-collate-py/tests/test_vn_collate.py

The second form needs nothing installed. The conformance suite is the contract
between the two ports, and being able to check it with nothing but a Python
interpreter is what stops them drifting apart.
"""

from __future__ import annotations

import json
import sys
import unicodedata
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from vn_collate import (  # noqa: E402  (path set up above)
    PRIMARY_ORDER,
    TONE_ORDER,
    collate_key,
    compare,
    sort,
)

CONFORMANCE_PATH = (
    Path(__file__).resolve().parents[3] / "conformance" / "vn-collate-1.0.0.json"
)


def load_suite() -> dict[str, Any]:
    with CONFORMANCE_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


SUITE = load_suite()
CASES = SUITE["cases"]


def test_schema_is_understood() -> None:
    assert SUITE["schema"] == "vn-collate-conformance/1", SUITE["schema"]


def test_suite_records_its_provenance() -> None:
    # If a future ICU disagrees, this string is how you find out what moved.
    assert "ICU " in SUITE["derivedFrom"], SUITE["derivedFrom"]


def test_case_ids_are_unique() -> None:
    ids = [c["id"] for c in CASES]
    assert len(set(ids)) == len(ids), "duplicate case ids in conformance file"


def test_suite_pins_both_directions_and_reflexivity() -> None:
    expected = {c["expected"] for c in CASES}
    assert expected == {-1, 0, 1}, f"suite cannot reject a constant comparator: {expected}"


def test_table_matches_the_suite() -> None:
    assert list(PRIMARY_ORDER) == SUITE["primaryOrder"]
    assert list(TONE_ORDER) == SUITE["toneOrder"]


def test_conformance_suite() -> None:
    failures: list[str] = []
    for case in CASES:
        actual = compare(case["a"], case["b"])
        if actual != case["expected"]:
            failures.append(
                f"{case['id']}  compare({case['a']!r}, {case['b']!r})\n"
                f"    expected: {case['expected']}\n"
                f"    actual:   {actual}\n"
                f"    note:     {case.get('note', '')}"
            )
    assert not failures, f"{len(failures)} conformance failures:\n" + "\n".join(failures[:10])


# --- Invariants ---------------------------------------------------------------


def test_compare_agrees_with_comparing_the_keys() -> None:
    for a, b in [
        ("a", "A"),
        ("a", "á"),
        ("Đặng", "Dũng"),
        ("1", "An"),
        ("ab", "á"),
        ("", "a"),
    ]:
        ka, kb = collate_key(a), collate_key(b)
        expected = 0 if ka == kb else (-1 if ka < kb else 1)
        assert compare(a, b) == expected, f"{a!r} vs {b!r}"


def test_antisymmetric() -> None:
    words = ["a", "A", "á", "Á", "à", "b", "đ", "Đ", "Thảo", "Thao", "1", ""]
    for a in words:
        for b in words:
            assert compare(a, b) + compare(b, a) == 0, f"{a!r} vs {b!r}"


def test_prefix_sorts_before_its_extension() -> None:
    # The case that breaks per-character interleaved keys.
    assert compare("á", "ab") == -1
    assert compare("a", "ab") == -1


def test_nfc_and_nfd_input_collate_identically() -> None:
    # The last two have no precomposed form at all, so NFD is their only
    # spelling and cluster splitting cannot be avoided. The combining mark is
    # written as a code point because a literal one is invisible in an editor,
    # and an invisible mark in a test about cluster splitting is precisely the
    # bug the test exists to catch.
    cases = [
        "Đặng",
        "Thảo",
        "đường",
        "Ăn",
        "B" + chr(0x0301),
        "b" + chr(0x0303) + chr(0x031B),
    ]
    for s in cases:
        assert compare(s, unicodedata.normalize("NFD", s)) == 0, s
        assert collate_key(s) == collate_key(unicodedata.normalize("NFD", s)), s


def test_digits_sort_before_every_letter() -> None:
    for digit in "0123456789":
        for letter in PRIMARY_ORDER:
            assert compare(digit, letter) == -1, f"{digit} vs {letter}"


def test_unknown_characters_sort_last_deterministically() -> None:
    assert compare("z", "☃") == -1
    assert compare("☃", "☃") == 0


def test_key_is_hex_only() -> None:
    # Hex only, so the key is safe in a text column with binary collation.
    key = collate_key("Đặng Thảo 1")
    assert all(c in "0123456789abcdef" for c in key), key


def test_sort_is_stable_and_does_not_mutate() -> None:
    original = ["b", "B", "b", "B"]
    snapshot = list(original)
    out = sort(original)
    assert original == snapshot, "sort mutated its input"
    # b sorts before B, and the two of each keep their input order.
    assert out == ["b", "b", "B", "B"], out
    # An already-sorted list comes back unchanged.
    already = ["a", "A", "á", "Á"]
    assert sort(already) == already, already


def test_sort_accepts_a_key_function() -> None:
    people = [{"n": "Đặng"}, {"n": "Anh"}, {"n": "Bảo"}]
    assert [p["n"] for p in sort(people, key=lambda p: p["n"])] == ["Anh", "Bảo", "Đặng"]


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
    print(f"{len(CASES)} conformance cases across {len(SUITE['primaryOrder'])} letters")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_standalone())
