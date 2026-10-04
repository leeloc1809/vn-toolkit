"""Run the shared conformance suite against the Python port.

This file is deliberately runnable two ways:

    pytest packages/py/tests -q              # full runner, nice reporting
    python packages/vn-text-py/tests/test_vn_text.py   # stdlib only, no install

The second form exists because the conformance suite is the contract between
the two ports. Being able to check it with nothing but a Python interpreter
means the Python side can never silently drift from the TypeScript side.

Both ports read the exact same JSON file. There is no second copy to keep in
sync, which is the whole point.
"""

from __future__ import annotations

import json
import sys
import unicodedata
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from vn_text import (  # noqa: E402  (path set up above)
    deaccent,
    decompose,
    fold,
    is_vietnamese,
    normalize,
    repair_mojibake,
    strip_stroke,
)

CONFORMANCE_PATH = (
    Path(__file__).resolve().parents[3] / "conformance" / "vn-text-1.0.0.json"
)


def test_package_ships_a_py_typed_marker() -> None:
    # The package declares "Typing :: Typed" on the PyPI page. Without this
    # marker a type checker ignores every annotation in the module, so the claim
    # is false and a consumer running mypy gets "untyped import" from a library
    # that is annotated throughout.
    import vn_text

    marker = Path(vn_text.__file__).resolve().parent / "py.typed"
    assert marker.exists(), (
        f"{marker} is missing. The wheel must contain it, or drop the "
        f"Typing :: Typed classifier instead of advertising types it hides."
    )


def load_suite() -> dict[str, Any]:
    with CONFORMANCE_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


#: Dispatch table keyed by the function names used in the conformance file.
#: These are the TypeScript names, so the mapping stays one-to-one.
IMPLS: dict[str, Callable[[str], str | bool]] = {
    "normalize": normalize,
    "deaccent": deaccent,
    "stripStroke": strip_stroke,
    "repairMojibake": repair_mojibake,
    "fold": fold,
    "isVietnamese": is_vietnamese,
}

SUITE = load_suite()
CASES = SUITE["cases"]


# --------------------------------------------------------------------------
# Metadata checks -- fail loudly if the suite itself drifts out of shape.
# --------------------------------------------------------------------------


def test_schema_is_understood() -> None:
    assert SUITE["schema"] == "vn-text-conformance/1", SUITE["schema"]


def test_no_case_references_an_unknown_function() -> None:
    unknown = [f"{c['id']} -> {c['fn']}" for c in CASES if c["fn"] not in IMPLS]
    assert unknown == [], f"unknown functions in conformance file: {unknown}"


def test_case_ids_are_unique() -> None:
    ids = [c["id"] for c in CASES]
    assert len(set(ids)) == len(ids), "duplicate case ids in conformance file"


def test_every_declared_function_has_cases() -> None:
    for fn in SUITE["functions"]:
        count = sum(1 for c in CASES if c["fn"] == fn)
        assert count > 0, f'function "{fn}" has no conformance cases'


# --------------------------------------------------------------------------
# The suite itself.
# --------------------------------------------------------------------------


def test_conformance_suite() -> None:
    failures: list[str] = []
    for case in CASES:
        impl = IMPLS[case["fn"]]
        actual = impl(case["input"])
        if actual != case["expected"]:
            failures.append(
                f"{case['id']}  {case['fn']}({case['input']!r})\n"
                f"    expected: {case['expected']!r}\n"
                f"    actual:   {actual!r}"
            )
    assert not failures, "conformance failures:\n" + "\n".join(failures)


# --------------------------------------------------------------------------
# Regression tests for the mistakes that make existing libraries wrong.
# Duplicated on purpose so the headline behaviour stays visible in the report.
# --------------------------------------------------------------------------


def test_d_with_stroke_folds_to_d() -> None:
    assert fold("Đặng Minh") == "dang minh"


def test_eth_never_folds_to_d() -> None:
    assert fold("Ðor") == "ðor"
    assert deaccent("Ðor") == "Ðor"
    assert strip_stroke("Ðor") == "Ðor"


def test_deaccent_preserves_letter_identity_but_fold_collapses_it() -> None:
    # Stripping tone marks should not silently rewrite which letter you have.
    assert deaccent("Đặng") == "Đang"
    # A search key has to collapse it, or users cannot find "Đặng" by
    # typing "Dang".
    assert fold("Đặng") == "dang"


def test_search_equivalence() -> None:
    assert fold("Cai gi the nay") == fold("Cái gì thế này")
    assert fold("Dang") == fold("Đặng")
    assert fold("HA NOI") == fold("Hà Nội")


def test_fold_is_idempotent() -> None:
    for s in [
        "Cái gì thế này",
        "Đặng Minh",
        "Hà Nội, Việt Nam!",
        "Ðor",
        "東京 Tokyo",
    ]:
        assert fold(s) == fold(fold(s)), s


def test_whitespace_and_punctuation_collapse_consistently() -> None:
    assert fold("  Hà    Nội  ") == fold("Hà-Nội")
    assert fold("TP. Hồ Chí Minh") == "tp ho chi minh"


def test_nfd_and_nfc_spellings_agree() -> None:
    nfc = "Cái gì thế này"
    nfd = unicodedata.normalize("NFD", nfc)
    assert nfc != nfd
    assert normalize(nfd) == nfc
    assert fold(nfc) == fold(nfd)
    assert decompose(nfc) == nfd


def test_uses_nfd_not_nfkd_so_compatibility_ligatures_survive() -> None:
    # NFKD would rewrite this to "fi" and change English text.
    ligature = chr(0xFB01)
    assert deaccent(ligature) == ligature


def test_repair_mojibake_is_idempotent() -> None:
    for s in ["Ðảm baỏ", "Ðor", "Đặng", "", "Không có gì"]:
        assert repair_mojibake(s) == repair_mojibake(repair_mojibake(s)), s


def test_repair_then_fold_makes_damaged_text_findable() -> None:
    # The whole point of the function: a record indexed after repair is
    # reachable by the string a user would actually type.
    assert fold(repair_mojibake("Ðặng Minh")) == fold("Đặng Minh") == "dang minh"
    # Without the repair step the record is unreachable, and silently so.
    assert fold("Ðặng Minh") != fold("Đặng Minh")


def test_repair_and_fold_answer_different_questions() -> None:
    # fold never reinterprets a letter; repair_mojibake assumes the corpus is
    # Vietnamese and that ETH is damage. Both are correct, for different inputs.
    assert fold("Ðor") == "ðor"
    assert repair_mojibake("Ðor") == "Đor"


# --------------------------------------------------------------------------
# Zero-dependency runner, for when pytest is not available.
# --------------------------------------------------------------------------


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
    print(f"{len(CASES)} conformance cases across {len(SUITE['functions'])} functions")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_standalone())
