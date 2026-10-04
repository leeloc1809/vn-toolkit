/**
 * Build a one-page fill-in-the-blank sheet from docs/grant-application.md.
 *
 *   node scripts/build-grant-sheet.mjs <output.html>
 *
 * The markdown is the source of truth. The sheet is generated from it rather
 * than written separately, because a second copy of the answers is a second
 * copy that can drift -- and the character counts are measured against the
 * text, so a drifted copy is one the form will reject for no visible reason.
 *
 * The point of the sheet is that nobody has to read a document to use it: one
 * card per field, one click to copy, the character count visible against the
 * 500 limit, and the two fields that cannot be automated called out as blanks.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DOC = resolve(ROOT, 'docs/grant-application.md');
const OUT = process.argv[2] ?? resolve(ROOT, '.tmp/grant-sheet.html');

const LIMIT = 500;

const md = readFileSync(DOC, 'utf8');

/** Blockquote body of a "## Field N" section, as one pasted paragraph. */
function fieldBody(id) {
  const match = [...md.matchAll(/^## Field (\S+)[^\n]*\n\n((?:> .*\n|\n)+)/gm)]
    .find(([, sectionId]) => sectionId === id);
  if (!match) throw new Error(`no section for field ${id}`);
  return match[2]
    .split('\n')
    .filter((l) => l.startsWith('> '))
    .map((l) => l.slice(2).trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

const FIELDS = [
  {
    n: 1,
    label: 'Why does this repository qualify?',
    hint: 'Ô lớn nhất của form. Dán vào ô textarea đầu tiên.',
    id: 'field7',
    value: fieldBody('7'),
  },
  {
    n: 2,
    label: 'How will you use API credits for your project?',
    hint: 'Ô textarea thứ hai.',
    id: 'field10',
    value: fieldBody('10'),
  },
  {
    n: 3,
    label: 'Anything else we should know?',
    hint: 'Ô textarea cuối. Không bắt buộc, nhưng nên điền.',
    id: 'field11',
    value: fieldBody('11'),
  },
];

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cards = FIELDS.map(
  (f) => `
  <section class="card">
    <div class="card-head">
      <span class="num">${f.n}</span>
      <div>
        <h2>${escapeHtml(f.label)}</h2>
        <p class="hint">${escapeHtml(f.hint)}</p>
      </div>
      <div class="count" data-for="${f.id}">${[...f.value].length} / ${LIMIT}</div>
    </div>
    <textarea id="${f.id}" readonly spellcheck="false">${escapeHtml(f.value)}</textarea>
    <div class="row">
      <button class="copy" data-target="${f.id}">Copy</button>
      <span class="spare" data-spare-for="${f.id}"></span>
    </div>
  </section>`,
).join('\n');

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Codex for Open Source &mdash; điền form</title>
<style>
  :root {
    --bg: #0f1115;
    --card: #171a21;
    --line: #262b36;
    --text: #e6e9ef;
    --muted: #98a2b3;
    --accent: #4f9cf9;
    --ok: #3fb950;
    --warn: #d29922;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 80px;
    background: var(--bg); color: var(--text);
    font: 16px/1.6 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 6px; }
  .sub { color: var(--muted); margin: 0 0 28px; }
  .open {
    display: inline-block; background: var(--accent); color: #06101f; font-weight: 650;
    padding: 13px 22px; border-radius: 8px; text-decoration: none; margin-bottom: 30px;
  }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    padding: 20px; margin-bottom: 20px;
  }
  .card-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
  .num {
    flex: 0 0 30px; height: 30px; border-radius: 50%; background: var(--accent);
    color: #06101f; font-weight: 700; display: grid; place-items: center;
  }
  .card-head h2 { font-size: 17px; margin: 3px 0 2px; }
  .hint { color: var(--muted); font-size: 13px; margin: 0; }
  .count { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--ok); font-weight: 650; }
  textarea {
    width: 100%; min-height: 132px; resize: vertical;
    background: #0c0e13; color: var(--text);
    border: 1px solid var(--line); border-radius: 8px;
    padding: 14px; font: 14px/1.65 ui-monospace, "Cascadia Code", Consolas, monospace;
  }
  .row { display: flex; align-items: center; gap: 14px; margin-top: 12px; }
  button.copy {
    background: var(--accent); color: #06101f; border: 0; border-radius: 7px;
    padding: 10px 22px; font-size: 15px; font-weight: 650; cursor: pointer;
  }
  button.copy:hover { filter: brightness(1.1); }
  button.copy.done { background: var(--ok); }
  .spare { color: var(--muted); font-size: 13px; }
  table.blanks { width: 100%; border-collapse: collapse; }
  table.blanks td { padding: 11px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.blanks td:first-child { color: var(--muted); width: 240px; }
  .fill { color: var(--warn); font-weight: 650; }
  .checklist { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px 24px; }
  .checklist li { margin: 9px 0; }
  a { color: var(--accent); }
  code { background: #0c0e13; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
  .warnbox {
    background: rgba(210,153,34,.12); border: 1px solid rgba(210,153,34,.4);
    border-radius: 10px; padding: 14px 18px; margin-bottom: 24px;
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>Codex for Open Source &mdash; điền form</h1>
  <p class="sub">Ba ô textarea dưới đây. Bấm <strong>Copy</strong> rồi dán vào form. Không sửa nội dung.</p>

  <a class="open" href="https://openai.com/form/codex-for-oss/" target="_blank" rel="noopener">Mở form &rarr;</a>

  <div class="warnbox">
    <strong>Đừng tick Codex Security.</strong> Tick v&agrave;o sẽ hiện th&ecirc;m m&ocirc;t trường bắt buộc, m&agrave; thư viện text kh&ocirc;ng cần security n&ecirc;u. Chỉ tick <strong>API credits</strong>.
  </div>

${cards}

  <section class="card">
    <h2>C&ograve;ng anh tự điền</h2>
    <table class="blanks">
      <tr><td>First / Last name</td><td class="fill">L&ecirc; &nbsp;/&nbsp; Lộc</td></tr>
      <tr><td>Email</td><td class="fill">Email tài khoản ChatGPT của anh</td></tr>
      <tr><td>GitHub username</td><td><code>leeloc1809</code></td></tr>
      <tr><td>Repository URL</td><td><code>https://github.com/leeloc1809/vn-toolkit</code></td></tr>
      <tr><td>Maintainer role</td><td class="fill">Primary maintainer</td></tr>
      <tr><td>I'm interested in</td><td class="fill">&#9745; API credits &nbsp; &#9744; Codex Security</td></tr>
      <tr><td>OpenAI Organization ID</td><td class="fill">platform.openai.com &rarr; Settings &rarr; Organization</td></tr>
    </table>
  </section>

  <div class="checklist">
    <h2>Thứ tự l&agrave;m</h2>
    <ol>
      <li>Copy &ocirc; 1, d&aacute;n v&agrave;o &ocirc; &ldquo;Why does this repository qualify?&rdquo;</li>
      <li>Copy &ocirc; 2, d&aacute;n v&agrave;o &ocirc; &ldquo;How will you use API credits&hellip;&rdquo;</li>
      <li>Copy &ocirc; 3, d&aacute;n v&agrave;o &ocirc; &ldquo;Anything else&hellip;&rdquo;</li>
      <li>Tick <strong>API credits</strong>, kh&ocirc;ng tick Codex Security</li>
      <li>Điền Organization ID</li>
      <li>Bấm Submit. Xong th&ocirc; b&aacute;o em.</li>
    </ol>
    <p style="color:var(--muted);font-size:14px">
      Ba tu chối khi qu&aacute; 500 k&yacute; tự. Số đ&ecirc; đ&ecirc; đo rồi, c&oacute; dư. Đừng th&ecirc;m bớt từ.
    </p>
  </div>
</div>

<script>
  const LIMIT = ${LIMIT};

  function count(el) { return [...el.value].length; }

  for (const ta of document.querySelectorAll('textarea')) {
    const badge = document.querySelector('[data-for="' + ta.id + '"]');
    const spare = document.querySelector('[data-spare-for="' + ta.id + '"]');
    const update = () => {
      const n = count(ta);
      const left = LIMIT - n;
      badge.textContent = n + ' / ' + LIMIT;
      badge.style.color = left > 0 ? 'var(--ok)' : 'var(--warn)';
      spare.textContent = left > 0
        ? 'còn ' + left + ' ký tự'
        : 'VƯỢT ' + (-left) + ' ký tự — form sẽ từ chối';
    };
    ta.addEventListener('input', update);
    update();
  }

  for (const btn of document.querySelectorAll('button.copy')) {
    btn.addEventListener('click', async () => {
      const ta = document.getElementById(btn.dataset.target);
      ta.select();
      try {
        await navigator.clipboard.writeText(ta.value);
      } catch {
        document.execCommand('copy');
      }
      const old = btn.textContent;
      btn.textContent = 'Đã copy ✓';
      btn.classList.add('done');
      setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1600);
    });
  }
</script>
</body>
</html>
`;

writeFileSync(OUT, html, 'utf8');
console.log(`wrote ${OUT}`);
for (const f of FIELDS) {
  console.log(`  ${f.label}: ${[...f.value].length}/${LIMIT} chars, ${LIMIT - [...f.value].length} spare`);
}
