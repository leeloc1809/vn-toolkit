# Outreach

Drafts written 2026-10-04, before anything was posted anywhere. **Nothing in this
file has been published.** Each draft says which channel it is for, because a
post that works in one of them gets a post removed in another.

The rule that governs all of it: **lead with the thing worth knowing, and let the
library be the evidence.** Every large developer subreddit bans a link drop and
allows a technical write-up. The difference between the two is the whole craft.

## Do not post yet

Checked against the live registries on 2026-10-04:

| package | npm | PyPI |
|---|---|---|
| `@vntoolkit/vn-text` | **404** | 0.1.0 |
| `@vntoolkit/vn-collate` | **404** | 0.1.0 |
| `@vntoolkit/vn-money` | **404** | **404** |
| `@vntoolkit/vn-ident` | **404** | **404** |

Every draft below contains an install command. A post that sends a reader to a
404 costs more credibility than it earns, and on Reddit it is the kind of thing
people screenshot into a "don't trust this project" comment. Publish first, post
second.

npm is blocked on the `NPM_TOKEN` returning `E401` — see [RELEASING.md](../RELEASING.md).
PyPI needs nothing but a re-run of the existing release workflow, because it
publishes from `dist/` with `skip-existing: true` and will leave `vn-text` and
`vn-collate` alone.

## What is actually being said

Three stories, in descending order of how well they are received. Only the first
one is genuinely unusual; the other two are good practice that other people also
do, and the drafts say so rather than pretending otherwise.

1. **`Đ` has no canonical decomposition.** U+0110. There is no flag and no
   Unicode version that makes `normalize('NFD')` fold it, so the standard
   advice — normalise, strip the combining marks — silently leaves it standing.
   This is a fact about Unicode, not about a library, and it is true on its own
   without this project existing.
2. **One corpus, two ports.** A single JSON file that the TypeScript and the
   Python port both read, so "the two implementations agree" is a checkable
   fact rather than a claim.
3. **Proving the checks can fail.** Every guard in the repository is broken on
   purpose, on a schedule, to confirm it still catches the thing it watches for.
   A check that cannot fail is a comment.

Story 1 is the hook. Stories 2 and 3 are why somebody who does not care about
Vietnamese should still look.

---

## Reddit

### Where the rules actually are

| subreddit | self-promotion | what to do |
|---|---|---|
| `r/programming` | **Banned**, but "technical write-ups on what makes a project technically challenging, interesting, or educational are allowed and encouraged — just a link to a GitHub page or a list of features is not" | Post 1 below, as a write-up. This is the exact carve-out. |
| `r/unicode` | Check the sidebar before posting | Post 1 below, trimmed. The highest-signal audience for it. |
| `r/opensource` | Open source gets more leeway than most | Post 2 below |
| `r/Python` | Allowed in some form; there is a weekly thread for it | Post 2, in the weekly thread |
| `r/webdev` | **Showoff Saturday only** (Saturdays UTC), plus the 9:1 rule | Post 2, on a Saturday, in the thread |
| `r/VietNam` | A general country sub; `r/vietnamesedevs` was started once and did not take off | Do not bother |

**Do not** cross-post the same text to several subreddits. Reddit-wide spam
enforcement follows a pattern of near-identical posts across communities, and a
permanent ban is what you get instead of a day of upvotes.

### Post 1 — r/programming, r/unicode

Title:

> `Đ` is not a letter with an accent mark, and that breaks the standard advice for folding Vietnamese text

Body:

```
The standard advice for making text searchable is three steps: normalise to NFD,
strip the combining marks, compose back. It is correct, it is in the Unicode
standard's own recommendations, and it silently fails for Vietnamese.

The problem is one character. Đ is U+0110 LATIN CAPITAL LETTER D WITH STROKE, and
it has no canonical decomposition — not "no useful one", none at all. It is a
single code point that does not correspond to a base letter plus a modifier. So:

    "Đặng Minh".normalize("NFD")   ->  "Đặng Minh"   // the Đ is still there
    strip the combining marks       ->  "Đang Minh"   // nobody can type this

There is no flag, no option, and no Unicode version that changes this. U+0110
is not a diacritic-bearing letter; it is a letter in its own right that happens
to look like a D with a bar through it.

Three related things that bite in the same area:

- The Icelandic Ð (U+00D0) looks identical and is a different letter. A rule
  that folds any stroked D to d corrupts Icelandic and Danish names. So the
  repair and the fold have to be different operations, decided on purpose.

- The repair people usually reach for is the reverse one: mapping Ð -> Đ,
  because in Vietnamese data Ð is almost always mojibake. That is right for
  Vietnamese and wrong everywhere else, which is fine as long as it is a
  separate function you opt into rather than a side effect of folding.

- Tones interact with vowel identity, so "fold the accents" is not a character
  map you can read off a table. hóa and hòa are both "hoa" after folding and
  they are not the same word in Vietnamese orthography. Getting this right needs
  a nucleus table validated by native speakers, and shipping a wrong one is
  worse than shipping none.

Worth knowing if you index any text and support Vietnamese. I hit this while
building a small set of packages and wrote the failing cases down rather than
fixing them quietly, in case anyone else needs the same table:

https://github.com/leeloc1809/vn-toolkit

(Full disclosure: it's mine, it's brand new, it has no stars. I am not posting
it as a recommendation — the case table is the point and the link is the
evidence. Happy to answer questions about the Unicode details either way.)
```

Why this shape: 95% of it is a Unicode explanation that stands on its own, the
library is the supporting artefact, and the disclosure is in the first line of
the last paragraph rather than buried. On `r/programming` that is the difference
between a write-up and a project demo.

### Post 2 — r/opensource, r/Python (weekly thread), r/webdev (Showoff Saturday)

Title:

> Two ports, one corpus, and a habit of breaking my own checks to prove they work

Body:

```
I maintain a small multi-language package set, and I want to describe one
practice rather than the packages, because the practice is the transferable part.

**One conformance corpus, read by both ports.** Each package has a JSON file of
test cases. The TypeScript implementation and the Python implementation both
read that same file. Neither has its own private test expectations. So "the two
ports agree" is a checkable fact and not a claim in a README, and neither
implementation can quietly drift from the other.

The case file carries a note on every single case explaining what breaks if you
get it wrong. A corpus is only useful if somebody can tell whether a failing
case means "the code is wrong" or "the spec changed" — the note is what makes
that possible without reading the implementation.

**Generate the corpus instead of hand-writing it.** Wherever the platform already
has a correct answer, read it out and record which runtime you read it from. The
suite holds a string like "Intl.Collator('vi-VN') on win32/x64, ICU 75.1". If the
platform ever changes its mind, regenerating shows it as a diff in review instead
of a silent behaviour change in production. The generator refuses to emit a case
the platform disagrees with.

**Never edit a case to make it green.** Deleting a case is deleting the test, and
it is the one move that turns a conformance suite into a rubber stamp. The rule
is written down in CONTRIBUTING.md in the first three bullets.

**Then prove the checks can fail.** This is the one I would push hardest on. A
check that cannot fail is a comment that costs a CI minute. So there is a script
that breaks each check's target on purpose and asserts the check goes red, and
it runs against the real implementations:

    4/4 real port breakages were caught   (a money library)
    6/6 real port breakages were caught   (an identity library)

Writing those six breakages found two real holes in my own checks, which is
exactly the point — one of them had a substring test that happily accepted a
package name I had appended "-DISABLED" to.

If you maintain something with more than one language binding, the one thing I
would take from this is the last part. Everything else is a matter of taste.

https://github.com/leeloc1809/vn-toolkit
```

### The three replies worth having ready

Reddit rewards the account that answers questions, not the one that posts. These
are the comments this project will actually get, and answering them well is worth
more than the original post.

On *"why not just use underthesea?"* — it is the right answer for most people
and the draft says so. ~27,000 downloads a month, and its `text_normalize`
already handles the `Ð` -> `Đ` repair. The difference is narrow and stated as
narrow: a search key and a sort key are not a correct spelling, and the thing
this project adds is the collation order, which nothing else in that space has.

On *"a card number has no check digit, so what does your validator actually
do?"* — it checks shape, a province code that exists, and a defined fourth
digit, and the README, the code and the test suite all say exactly that. It
cannot detect a well-formed and wrong number. A validator that implies otherwise
is worse than one that checks less, because the thing you build on top inherits
the false confidence.

On *"is this AI-generated?"* — answer it directly. The conformance suites, the
parity corpus and the failure-proving scripts are the answer to that question,
and the repo is the evidence. Do not get defensive; answer and move on.

---

## X

The audience here is the Vietnamese developer community, so posts are in
Vietnamese and the angle is local. Each one stands alone.

**1 — the separator, the most shareable one**

```
vi-VN dùng dấu chấm để phân tách nghìn và dấu phẩy để tách thập phân.

  en-US:  1,100,000.50
  vi-VN:  1.100.000,50

Cùng đúng hai ký tự, ngược nghĩa nhau.

Nên chuỗi "1.500" là 1.500 ở Việt Nam, nhưng là 1,5 ở Mỹ. Sai số 1000 lần.

Người dùng gõ "1.500.000" vào ô giá, server parse theo kiểu en-US, ra 1.5 — và
số tiền đó vẫn trông hợp lệ. Không có gì báo lỗi.

Thêm nữa: ISO 4217 quy định VND không có đơn vị nhỏ nhất. Không có nửa đồng.
Nên parse("1.5") phải ném lỗi chứ không được làm tròn cho khỏi.
```

**2 — the `Đ` one**

```
Muốn tìm kiếm tiếng Việt không dấu, cách ai cũng dùy là:
  normalize("NFD") -> bỏ dấu -> compose lại

Đúng với mọi ngôn ngữ. Trừ tiếng Việt.

Vì "Đ" là U+0110 và nó KHÔNG có canonical decomposition nào cả — không phải
"không có cái nào hữu ích", mà là không có. Nên nó đứng nguyên:

  "Đặng Minh" -> "Đang Minh"

Không ai gõ "Đang" để tìm "Đặng". Ô tìm kiếm lặng lẽ trả về 0 kết quả.

Không có cờ nào, không có tùy chọn nào, không có phiên bản Unicode nào sửa
được. Đây là đặc tả Unicode, không phải ý kiến của thư viện nào.
```

**3 — the money one**

```
Chia tiền cho 3 người, tổng 1.000.000đ.

Math.round / 3 mỗi người = 333.333 x 3 = 999.999.
Mất đúng 1 đồng, và không ai biết nó đi đâu.

Largest-remainder: phần dư lớn nhất được ưu tiên, hòa thì người trước được
thêm trước. Kết quả: 333.334 / 333.333 / 333.333. Cộng lại đúng 1.000.000.

Chi tiết nhỏ mà thư viện nào cũng làm khác đi một chút: khi hai người có phần
dư bằng nhau, ai được thêm đồng?
```

**4 — the announcement, only once npm is live**

```
Đã xong 4 package cho tiếng Việt, mỗi cái có TypeScript + Python + cùng một
file conformance, và cả hai port đều đọc chính file đó.

  npm i @vntoolkit/vn-text      pip i vn-text
  npm i @vntoolkit/vn-collate   pip i vn-collate
  npm i @vntoolkit/vn-money     pip i vn-money
  npm i @vntoolkit/vn-ident     pip i vn-ident

Số download hiện tại: 0. Mới đăng hôm nay.
```

Stating "0 downloads" in the announcement is the point, not an apology. Anyone
who has looked at a new library before knows the number is zero, and the person
who says so is the one you can trust about the rest.

---

## Vietnamese channels

The research is consistent: Vietnamese developers are **not on Reddit**. There is
no active Vietnamese developer subreddit — `r/vietnamesedevs` was started once and
did not survive — and the recurring answer in `r/VietNam` is that the local
communities "mostly do secondary translations of what's already available in the
English communities". The people are on Facebook groups, and they are large.

| community | size | fit |
|---|---|---|
| Cộng đồng Coder lớn nhất Việt Nam | 11.5K | good general reach |
| Hội lập trình viên Việt Nam | — | on-topic, smaller |
| Cộng Đồng Lập Trình Viên (J2Team) | large | Vietnamese dev, broad |
| Group Lập Trình Python | 264K | `vn-text`, `vn-search` |
| Lập Trình C,C++,C#,Java,Python,PHP | 427K | broad, the biggest listed |
| TopDev | 176K | professional audience, higher quality signal |

Post 1 or Post 3 above, translated. In a Vietnamese group the rules are usually
looser than Reddit's, but the same principle holds and the same disclosure
sentence does too. A Vietnamese group is also the one place where a reply can be
useful within an hour rather than a day, which is the whole reason it is worth
doing alongside the English posts rather than instead of them.

Two things to do before posting to any of them:

- Join and read for a few days. A first-ever post from a brand new account in a
  Vietnamese group is how a person gets added to a spam list that outlives the
  project.
- Do not paste the same Vietnamese text into four groups on the same day.

---

## Order of work

1. **Publish.** PyPI first — it needs nothing but a workflow re-run. npm is
   blocked on the token. Nothing goes out until the install commands work.
2. **The X posts**, in the order above, starting with the separator one. They are
   self-contained, they do not need an install command, and post 1 is worth
   doing before the library is even linked.
3. **Post 2 to `r/opensource` and `r/Python`'s weekly thread.** Lowest
   self-promotion friction of the English subs, and the audience that most needs
   the practice rather than the packages.
4. **Post 1 to `r/programming` and `r/unicode`,** ideally on different days. Take
   the `r/unicode` one first if only one gets through; the audience is smaller
   and the fit is better.
5. **Post 2 to `r/webdev` on a Saturday UTC,** in the Showoff Saturday thread.
6. **The Vietnamese Facebook groups,** after a few days of reading.
7. **Then reply to every comment for a month.** This is the part that decides
   whether any of it worked.
