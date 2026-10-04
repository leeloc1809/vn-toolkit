## What does this change?

<!-- One or two sentences. -->

## Type of change

- [ ] Bug fix in an existing function
- [ ] New function
- [ ] Conformance cases only
- [ ] Infrastructure, docs, or CI
- [ ] Port parity work

## Checklist

- [ ] `npm run verify` passes locally
- [ ] `python packages/vn-text-py/tests/test_vn_text.py` passes
- [ ] A behaviour change comes with a new conformance case, including a `note`
      explaining what breaks without it
- [ ] Both ports are updated, or the PR explains why the change is
      language-specific
- [ ] No existing conformance case was edited to make it pass
- [ ] TypeScript stays free of runtime dependencies, Python stays standard
      library only

## Code points, if this is a Unicode edge case

<!-- e.g. "input uses U+0110, not U+00D0" — saves a lot of guessing -->
