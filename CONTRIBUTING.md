# Contributing

Thanks for looking at this. Contributions are genuinely wanted, including
first ones — the whole point of the conformance suite is that it makes
"is my implementation actually correct?" a question with a checkable answer, so
you do not need to be the author to improve it.

## The one thing to understand first

`conformance/vn-text-1.0.0.json` is the contract. Both the TypeScript and the
Python port are validated against that exact same file. If you change behaviour
in one port, the other must change with it, or CI fails.

Three things follow from that:

1. **A behaviour change means a new conformance case.** Add the case with a
   `note` explaining what breaks without it. A PR that changes output without a
   case will not be merged, because nothing would prevent the same regression
   coming back.
2. **Never edit an existing case to make it pass.** If a case looks wrong, open
   an issue and say why. Cases have been wrong before and that is how they were
   caught.
3. **A fix needs to land in both ports** unless the change is genuinely
   language-specific, in which case say so in the PR description.

## Running the tests

```bash
npm ci
npm run verify          # typecheck + TypeScript suite + cross-port parity

python packages/py/tests/test_conformance.py   # Python, no install needed
```

`npm run verify` is the same thing CI runs. If it passes locally, CI will pass.

`scripts/verify-port-parity.mjs` is worth understanding: it re-implements the
Python algorithm in JavaScript and checks it against the conformance file, then
measures whether `str.isalnum()` and `\p{L}\p{N}` disagree on any character in
the corpus. It runs without a Python interpreter, which is how a change to one
port gets caught before the Python job even starts.

## Good first issues

These are all real gaps, sized to be approachable:

- **Add conformance cases.** The corpus is hand-authored and Vietnamese coverage
  is thin outside names, provinces and a handful of everyday words. Product
  listings, street addresses, menu items, legal text, banking terms — all
  untested. A PR that adds cases *and* finds a bug in an implementation is
  especially welcome.
- **Add tone-mark canonicalisation.** `hóa` and `hòa` are not unified yet,
  because the answer depends on whether a syllable is open or closed, and the
  nucleus table needs native-speaker validation. See "What this is not" in the
  README.
- **Port coverage.** The two ports are kept in sync by hand right now. A
  generator that derives the Python implementation from a shared definition
  would remove the failure mode entirely.
- **Benchmark.** There is no claim in the README about speed, because there is
  no measurement. If you add one, it should be reproducible.

## Adding a function

- Keep it in `core.py` / `index.ts` as a pure function. No I/O, no configuration
  object, no options bag. Every current function is a pure string transform and
  that is what makes the conformance suite possible.
- The Python module must stay pure ASCII source. Code points are written as
  `chr(0xNNNN)`, never as literal characters or `\uXXXX` escapes — combining
  marks are invisible in an editor and a stray reformat can corrupt a character
  class that still compiles. `_unicode.py` has the reasoning.
- Add the function name to `functions` in the conformance file and give it at
  least one case. CI asserts that every declared function has coverage.

## Style

- TypeScript: the existing `tsconfig.json` is strict, including
  `noUncheckedIndexedAccess`. Do not weaken it.
- Python: standard library only, no runtime dependencies. A normalisation
  library that drags in dependencies is a dependency every consumer has to
  audit, and this one has to stay auditable itself.
- Comments should explain *why*, not restate the code. The `_unicode.py` and
  `unicode.ts` module docstrings are the reference for tone here: they explain
  the Unicode trap and show the evidence.

## Reporting a bug

Open an issue with the input, the output you got, and the output you expected.
If it is a Unicode edge case, please include the code points — `U+0110` in a bug
report saves an hour of guessing.

## Licence

By contributing you agree that your contributions are licensed under the MIT
licence in [LICENSE](./LICENSE).
