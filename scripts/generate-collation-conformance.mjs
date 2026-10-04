// Generates conformance/vn-collate-1.0.0.json from ICU.
//
// The collation table is not hand-written from memory: it is read out of
// Intl.Collator('vi-VN'), and every adjacent pair in ICU's order becomes a
// permanent test case. If a future ICU changes, the suite stops matching and
// that is the point — the data records what ICU said on a specific runtime.
//
//   node scripts/generate-collation-conformance.mjs
//
// Re-run only deliberately, and review the diff when you do.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../conformance/vn-collate-1.0.0.json');

const collator = new Intl.Collator('vi-VN');
const sorted = (items) => [...items].sort(collator.compare);

/** Tones with their combining marks, in Vietnamese names. */
const TONES = [
  ['none', ''],
  ['sắc', '\u0301'],
  ['huyền', '\u0300'],
  ['hỏi', '\u0309'],
  ['ngã', '\u0303'],
  ['nặng', '\u0323'],
];

// --- Probe the primary order -------------------------------------------------
// Every letter ICU will order, including the four Latin letters that are not in
// the Vietnamese alphabet but still sort in meaningful positions.
const PROBE = [
  'a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'f', 'g', 'h', 'i', 'j', 'k',
  'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'w',
  'x', 'y', 'z',
];
const primaryOrder = sorted(PROBE);

// --- Where do digits actually sit? -------------------------------------------
// Not assumed. Probed, and the answer goes into the key so the order is real
// rather than convenient.
const digitsBefore = PROBE.filter((l) => collator.compare('0', l) < 0).length;
const digitsAfter = PROBE.filter((l) => collator.compare('0', l) > 0).length;
const digitPlacement =
  digitsBefore === PROBE.length ? 'before-all-letters'
    : digitsAfter === PROBE.length ? 'after-all-letters'
      : `interleaved:${digitsBefore}`;

// --- Confirm ICU's tone order is uniform -------------------------------------
// Sort the STRINGS, not wrapped objects. `collator.compare` stringifies its
// arguments, so sorting `{name, s}` objects compares "[object Object]" to
// "[object Object]", changes nothing, and silently reports the input order back
// as if it were a measurement.
const toneOrders = new Set();
for (const base of primaryOrder) {
  const pairs = TONES.map(([name, mark]) => ({ name, s: (base + mark).normalize('NFC') }));
  const order = [...pairs]
    .sort((x, y) => collator.compare(x.s, y.s))
    .map((i) => i.name);

  // Guard against the exact bug above: a probe that cannot reorder is not a
  // probe. If the sort came back as the input order for every base, either ICU
  // genuinely orders tones as we listed them, or the comparison did nothing.
  if (base === 'a' && order.join('>') === TONES.map(([n]) => n).join('>')) {
    throw new Error(
      `tone probe for base 'a' returned the input order unchanged: ${order.join(' > ')}. ` +
      'Either ICU really sorts tones this way, or the comparison is not working.',
    );
  }
  toneOrders.add(order.join('>'));
}
if (toneOrders.size !== 1) {
  throw new Error(`tone order is not uniform across bases: ${[...toneOrders].join(' | ')}`);
}
const toneOrder = [...toneOrders][0].split('>');

// --- Confirm case is tertiary (lowercase first) ------------------------------
for (const base of primaryOrder) {
  const [first, second] = sorted([base, base.toUpperCase()]);
  if (first !== base) {
    throw new Error(`uppercase sorts before lowercase for ${base}: expected lowercase first`);
  }
}

// --- Build the full repertoire ICU orders ------------------------------------
// 33 letters x 6 tones x 2 cases. Every string is unique, so sorting the array
// directly by ICU keeps the case level rather than collapsing it.
const repertoire = [];
for (const letter of primaryOrder) {
  for (const [tone, mark] of TONES) {
    const composed = letter + mark;
    repertoire.push(composed.normalize('NFC'));
    repertoire.push(composed.toUpperCase().normalize('NFC'));
  }
}
if (new Set(repertoire).size !== repertoire.length) {
  throw new Error(`repertoire has duplicates: ${repertoire.length - new Set(repertoire).size}`);
}

const ordered = repertoire.slice().sort(collator.compare);

// Adjacent pairs pin the total order. A key that gets any single weight wrong
// fails at least one of these.
const cases = [];
for (let i = 0; i + 1 < ordered.length; i++) {
  cases.push({
    id: `order-${String(i).padStart(3, '0')}`,
    fn: 'compare',
    a: ordered[i],
    b: ordered[i + 1],
    expected: -1,
    note: `${describe(ordered[i])} must sort before ${describe(ordered[i + 1])}`,
  });
}

// Symmetric assertions for a sample, so an implementation that always returns -1
// cannot pass.
for (let i = 0; i + 1 < ordered.length; i += 7) {
  cases.push({
    id: `order-rev-${String(i).padStart(3, '0')}`,
    fn: 'compare',
    a: ordered[i + 1],
    b: ordered[i],
    expected: 1,
    note: 'reverse of an adjacent pair, so a constant comparator cannot pass',
  });
}

// Reflexivity on the whole repertoire.
for (const [i, s] of ordered.entries()) {
  if (i % 11 !== 0) continue;
  cases.push({
    id: `self-${String(i).padStart(3, '0')}`,
    fn: 'compare',
    a: s,
    b: s,
    expected: 0,
  });
}

// Normalization independence: a composed string must equal its NFD form.
for (const s of ordered.filter((_, i) => i % 13 === 0)) {
  cases.push({
    id: `nfc-vs-nfd-${String(s.codePointAt(0)).padStart(4, '0')}`,
    fn: 'compare',
    a: s,
    b: s.normalize('NFD'),
    expected: 0,
    note: 'ICU collates composed and decomposed forms equally, so the key must normalise to NFC first',
  });
}

const suite = {
  schema: 'vn-collate-conformance/1',
  library: 'vn-collate',
  version: '0.1.0',
  created: new Date().toISOString().slice(0, 10),
  derivedFrom: `Intl.Collator('vi-VN') on ${process.platform}/${process.arch}, ICU ${process.versions.icu}, Unicode ${process.versions.unicode}`,
  description:
    'Collate ordering for Vietnamese, read out of ICU rather than written from memory. ' +
    'Adjacent pairs of the full letter x tone x case repertoire pin the total order, ' +
    'so any single wrong weight fails at least one case.',
  primaryOrder,
  toneOrder,
  digitPlacement,
  cases,
};

writeFileSync(OUT, JSON.stringify(suite, null, 2) + '\n', 'utf8');

console.log(`wrote ${OUT}`);
console.log(`  primary order (${primaryOrder.length}): ${primaryOrder.join(' ')}`);
console.log(`  tone order   (${toneOrder.length}): ${toneOrder.join(' > ')}`);
console.log(`  digit placement: ${digitPlacement}`);
console.log(`  repertoire: ${ordered.length} strings`);
console.log(`  cases: ${cases.length}`);

function describe(s) {
  return `${JSON.stringify(s)} (${[...s].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ')})`;
}
