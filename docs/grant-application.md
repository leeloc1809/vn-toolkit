# Codex for Open Source — application draft

Everything below is written to be pasted into the form as-is. Every free-text
field is counted, because the form enforces a 500-character limit and a field
that overflows is rejected server-side with an error that does not say which
field was wrong.

**Nothing here is submitted by anyone but the maintainer.** The form requires a
ChatGPT account email and an OpenAI Organization ID, and submitting it is a
statement made in the maintainer's name.

## Verified facts about the programme

Checked 2026-10-04 against <https://openai.com/form/codex-for-oss/> and the
programme terms.

| | |
|---|---|
| Review | Rolling, no deadline. Selected applicants notified by email. |
| Re-application | **Explicitly allowed.** Previous recipients are encouraged to re-apply. |
| Scale | Renewed 2026-09-15: grants doubled from 5,000 to **10,000**. Pro is the $100 tier. |
| Fund | $1M Codex Open Source Fund, up to $25,000 API credits per project. |
| Star threshold | **None published.** The page says apply anyway and explain if the project does not fit but matters to the ecosystem. |
| Requirement | A valid ChatGPT account, and accurate information about the maintainer role and repository control. |

The re-application policy is the one that changes the plan. Applying costs
minutes and forecloses nothing, so there is no reason to wait for traction that
the application itself would help create.

A third-party blog claims a 1,000-star threshold. That is not on OpenAI's page
and is treated here as unverified.

## The form, field by field

Schema read from the live page.

| # | Field | Required | Max | Value |
|---|---|---|---|---|
| 1 | First name | yes | — | Lê |
| 2 | Last name | yes | — | Lộc |
| 3 | Email | yes | — | *ChatGPT account email* |
| 4 | GitHub username | yes | — | `leeloc1809` |
| 5 | GitHub repository URL | yes | — | `https://github.com/leeloc1809/vn-toolkit` |
| 6 | Maintainer role | yes | — | **Primary maintainer** |
| 7 | Why does this repository qualify? | yes | 500 | see below |
| 8 | I'm interested in… | no | — | **API credits** (+ Codex Security, conditional) |
| 9 | OpenAI Organization ID | yes | — | *from platform.openai.com → Settings → Organization* |
| 10 | How will you use API credits? | yes | 500 | see below |
| 11 | Anything else we should know? | no | 500 | see below |

If **Codex Security** is ticked, field 9a appears: "Why does your project need
Codex Security?" (500 chars, required).

**Before submitting, re-run the tracker.** The numbers quoted below are a
snapshot and go stale, and a stale number in an application is worse than a
rough one:

```bash
node scripts/track-traction.mjs
```

---

## Field 7 — Why does this repository qualify? (500 char limit)

> `Đ` (U+0110) has no canonical decomposition, so the usual NFD-then-strip-marks
> recipe leaves `Đặng Minh` as `Đang Minh` — nothing throws, search just returns
> fewer results. This repo ships correct primitives for that class of bug in
> TypeScript and Python, each validated against one shared conformance suite of
> 675 annotated cases, with both ports required to emit byte-identical results.
> New: 0 stars, 0 downloads. Early — asking for the tooling to maintain it.

**462 characters.**

The last sentence is deliberate. With no adoption yet, claiming otherwise would
be false and is exactly the kind of thing a reviewer checks. Naming the gap and
asking for the maintenance tooling reads as honest rather than as weakness, and
it matches what the programme says it funds.

**Revisit this field once there are numbers.** It is the field that decides the
application, and the same text will read very differently at 50 stars and 50,000
monthly downloads. The tracker exists so this paragraph gets rewritten from
measurement rather than from optimism.

## Field 10 — How will you use API credits? (500 char limit)

> Running Codex in the release workflow: reviewing pull requests against the
> conformance suites, triaging the Unicode edge cases contributors file, and
> regenerating the collation table from ICU so an upstream change surfaces as a
> diff in review instead of a silent behaviour change. I also want it to widen
> the corpus — the Vietnamese coverage outside names and provinces is thin, and
> finding the cases nobody thought to test is the whole value of the suite.

**456 characters.**

## Field 11 — Anything else? (500 char limit, optional)

> The conformance suites are the asset, not the code. Anyone can copy a
> 200-line library; the corpus is what tells you whether an implementation is
> correct, including for the characters nobody thought to test. Other Vietnamese
> tooling is welcome to consume the files directly. Two packages: search keys,
> and a Vietnamese collation sort key derived from ICU, because Postgres has
> none. Both MIT, zero runtime dependencies, Python standard library only.

**449 characters.**

## Field 9a — Why does this project need Codex Security? (only if ticked)

Honest answer: it does not, yet. A text-processing library with no network, no
parser and no untrusted input is a poor security candidate, and claiming
otherwise would be padding. **Recommendation: do not tick Codex Security.**
Tick API credits only.

## Suggested checkbox selection

- ☑ **API credits for my project**
- ☐ Codex Security

---

## After submitting

OpenAI notifies by email. If nothing arrives in three weeks, that is not a
rejection — one vim maintainer reported applying twice with no reply. Re-apply
with updated numbers rather than assuming an answer.

## What to do next, in order

1. Publish the packages. Downloads cannot be quoted until they exist.
2. Re-run the tracker and update field 7 with real numbers.
3. Submit.

Step 1 is blocked on the npm and PyPI account setup described in
[RELEASING.md](../RELEASING.md). Nothing else in this document depends on it.
