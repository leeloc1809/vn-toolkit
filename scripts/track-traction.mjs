/**
 * Traction tracker for vn-toolkit.
 *
 *   node scripts/track-traction.mjs            # print a report
 *   node scripts/track-traction.mjs --save     # also append a snapshot
 *   node scripts/track-traction.mjs --json     # machine-readable
 *
 * ## Why this exists
 *
 * The Codex for Open Source application asks for GitHub stars and monthly
 * downloads. Those are the same numbers week after week, and reading them off
 * two dashboards by hand is both tedious and wrong: the version published last
 * Tuesday is not in last month's download count yet, and the npm dashboard
 * defaults to a period that quietly rolls.
 *
 * A snapshot history is the only way to answer "is this actually moving?",
 * which is the question that matters and the one a single reading cannot
 * answer. Everything here is public information, fetched read-only.
 *
 * ## Honesty about zero
 *
 * Nothing is guessed and nothing is filled in. A metric that cannot be
 * fetched is reported as unavailable, not as zero -- those are different
 * claims, and only one of them is true. Before the packages are published,
 * "0 downloads" and "not published yet" are both accurate, and the
 * difference matters to anyone reading the number.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const HISTORY = resolve(ROOT, '.traction/history.json');

const REPO = 'leeloc1809/vn-toolkit';

/**
 * Logins that count as the project itself rather than as community.
 *
 * Derived from the repository owner rather than hardcoded as a name substring.
 * A hardcoded substring is exactly the kind of thing that looks fine, reports a
 * plausible number, and is quietly wrong -- a typo here turns "0 external
 * contributors" into "1", which is the kind of figure that does not survive a
 * reviewer checking it.
 */
const OWN_LOGINS = new Set([REPO.split('/')[0].toLowerCase()]);

const NPM_PACKAGES = ['@vntoolkit/vn-text', '@vntoolkit/vn-collate'];
const PYPI_PACKAGES = ['vn-text', 'vn-collate'];

const args = new Set(process.argv.slice(2));
const SAVE = args.has('--save');
const AS_JSON = args.has('--json');

/** Distinguishes "zero" from "cannot tell", which are not the same claim. */
const UNKNOWN = null;

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'vn-toolkit-traction-tracker',
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) return UNKNOWN;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    return { __error: error.message };
  }
}

/**
 * The GitHub API is used rather than the gh CLI so this works on a machine
 * with no gh installed, which is the normal case for a contributor.
 */
async function githubMetrics() {
  const repo = await fetchJson(`https://api.github.com/repos/${REPO}`);

  const contributors = await fetchJson(
    `https://api.github.com/repos/${REPO}/contributors?per_page=100`,
  );

  // open_issues_count on the repository endpoint counts issues and pull
  // requests together. Reporting that as "open issues" would overstate it by
  // however many PRs happen to be open, and this number goes in a grant
  // application where an inflated figure is worse than no figure.
  const issues = await fetchJson(
    `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${REPO} is:issue is:open`)}`,
  );
  const pulls = await fetchJson(
    `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${REPO} is:pr is:open`)}`,
  );

  const releases = await fetchJson(`https://api.github.com/repos/${REPO}/releases?per_page=100`);

  if (repo?.__error) return { error: repo.__error };

  // Dependabot and friends appear in the contributors list. They are not
  // evidence of community, and counting them would misrepresent the repository
  // to a reviewer who checks.
  const all = Array.isArray(contributors) ? contributors : [];
  const humans = all.filter((c) => c.type !== 'Bot' && !/\[bot\]$/i.test(c.login ?? ''));
  const externalLogins = humans
    .map((c) => (c.login ?? '').toLowerCase())
    .filter((login) => !OWN_LOGINS.has(login));

  return {
    stars: repo.stargazers_count ?? UNKNOWN,
    forks: repo.forks_count ?? UNKNOWN,
    watchers: repo.subscribers_count ?? UNKNOWN,
    contributorsAll: all.length || UNKNOWN,
    contributorsHuman: all.length === 0 ? 0 : humans.length,
    externalContributors: all.length === 0 ? 0 : externalLogins.length,
    externalLogins,
    releases: Array.isArray(releases) ? releases.length : UNKNOWN,
    openIssues: issues?.total_count ?? UNKNOWN,
    openPullRequests: pulls?.total_count ?? UNKNOWN,
    createdAt: repo.created_at ?? UNKNOWN,
    pushedAt: repo.pushed_at ?? UNKNOWN,
  };
}

async function npmDownloads(name) {
  const scoped = name.replace('/', '%2F');
  const month = await fetchJson(
    `https://api.npmjs.org/downloads/point/last-month/${name}`,
  );
  const week = await fetchJson(`https://api.npmjs.org/downloads/point/last-week/${name}`);

  // A 404 means the package does not exist on npm yet, which is different from
  // a package nobody is downloading.
  const published = month !== UNKNOWN && !month?.__error;
  if (!published) {
    return { published: false, monthly: UNKNOWN, weekly: UNKNOWN };
  }
  return {
    published: true,
    monthly: month.downloads ?? UNKNOWN,
    weekly: week?.downloads ?? UNKNOWN,
  };
}

async function pypiDownloads(name) {
  const stats = await fetchJson(`https://pypistats.org/api/packages/${name}/recent`);
  if (stats === UNKNOWN || stats?.__error) {
    return { published: false, lastMonth: UNKNOWN, lastWeek: UNKNOWN, lastDay: UNKNOWN };
  }
  return {
    published: true,
    lastMonth: stats.data?.last_month ?? UNKNOWN,
    lastWeek: stats.data?.last_week ?? UNKNOWN,
    lastDay: stats.data?.last_day ?? UNKNOWN,
  };
}

function loadHistory() {
  if (!existsSync(HISTORY)) return [];
  try {
    return JSON.parse(readFileSync(HISTORY, 'utf8'));
  } catch {
    return [];
  }
}

/** Difference against the most recent snapshot, or null for a first run. */
function delta(previous, current) {
  if (!previous) return null;
  const out = {};
  for (const [key, value] of Object.entries(current)) {
    if (typeof value !== 'number' || typeof previous[key] !== 'number') continue;
    out[key] = value - previous[key];
  }
  return out;
}

const github = await githubMetrics();
const npm = {};
for (const name of NPM_PACKAGES) npm[name] = await npmDownloads(name);
const pypi = {};
for (const name of PYPI_PACKAGES) pypi[name] = await pypiDownloads(name);

const snapshot = {
  at: new Date().toISOString(),
  github,
  npm,
  pypi,
};

/**
 * Invariants. These exist because a wrong number in a grant application is
 * worse than a missing one, and because a subtly wrong filter produces a
 * plausible-looking number rather than an obvious error.
 *
 * The first version of this check was `externalContributors <=
 * contributorsHuman`, which looked obviously right and caught nothing: the bug
 * that motivated it reported 1 external against 1 human, and 1 is not greater
 * than 1. The check has to name the specific wrong thing -- the owner appearing
 * in the external list -- rather than bound it.
 */
const invariantErrors = [];
const h = github;
if (!h.error) {
  // Ground truth for "the owner", taken from REPO rather than from OWN_LOGINS.
  // An invariant that checks OWN_LOGINS against itself cannot catch OWN_LOGINS
  // being wrong, which is the exact failure it was written for.
  const ownerFromRepo = REPO.split('/')[0].toLowerCase();

  if (!OWN_LOGINS.has(ownerFromRepo)) {
    invariantErrors.push(
      `OWN_LOGINS does not contain the repository owner (${ownerFromRepo}); ` +
        `the filter is not derived from the repository it is measuring`,
    );
  }

  if (Array.isArray(h.externalLogins)) {
    const ownerLeaked = h.externalLogins.filter((login) => login === ownerFromRepo);
    if (ownerLeaked.length > 0) {
      invariantErrors.push(
        `the repository owner (${ownerFromRepo}) is counted as an external contributor`,
      );
    }
  }

  if (typeof h.externalContributors === 'number' && typeof h.contributorsHuman === 'number') {
    if (h.externalContributors > h.contributorsHuman) {
      invariantErrors.push(
        `externalContributors (${h.externalContributors}) exceeds contributorsHuman ` +
          `(${h.contributorsHuman})`,
      );
    }
  }
  if (typeof h.contributorsHuman === 'number' && typeof h.contributorsAll === 'number') {
    if (h.contributorsHuman > h.contributorsAll) {
      invariantErrors.push('contributorsHuman exceeds contributorsAll');
    }
  }
}

const history = loadHistory();
const previous = history[history.length - 1] ?? null;
const githubDelta = delta(previous?.github, github);

// A snapshot with a broken invariant is worse than no snapshot: it becomes
// history that later deltas are computed against, and the error propagates
// silently from then on. So the check runs before anything is written.
if (invariantErrors.length > 0) {
  process.stderr.write(`\nrefusing to record a snapshot: ${invariantErrors.join('; ')}\n`);
  process.exit(1);
}

if (SAVE) {
  history.push(snapshot);
  mkdirSync(dirname(HISTORY), { recursive: true });
  writeFileSync(HISTORY, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
}

if (AS_JSON) {
  console.log(JSON.stringify({ snapshot, previous: previous?.at ?? null, githubDelta }, null, 2));
  process.exit(0);
}

const fmt = (value) => (value === UNKNOWN ? 'n/a' : String(value));
const signed = (value) => (value === null ? '' : value > 0 ? ` +${value}` : ` ${value}`);

console.log(`\n  vn-toolkit traction  ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n`);
console.log(`  ${'-'.repeat(52)}`);

if (github.error) {
  console.log(`  GitHub: unavailable (${github.error})`);
} else {
  console.log(`  GitHub  ${REPO}`);
  console.log(`    stars          ${fmt(github.stars)}${githubDelta?.stars !== undefined ? signed(githubDelta.stars) : ''}`);
  console.log(`    forks          ${fmt(github.forks)}${githubDelta?.forks !== undefined ? signed(githubDelta.forks) : ''}`);
  console.log(
    `    contributors   ${fmt(github.contributorsHuman)} human ` +
    `(${fmt(github.contributorsAll)} incl. bots, ${fmt(github.externalContributors)} external)`,
  );
  console.log(`    releases       ${fmt(github.releases)}`);
  console.log(`    open issues    ${fmt(github.openIssues)}`);
  console.log(`    open PRs       ${fmt(github.openPullRequests)}`);
}

console.log(`\n  npm`);
for (const [name, stats] of Object.entries(npm)) {
  const line = stats.published
    ? `monthly ${fmt(stats.monthly)}  weekly ${fmt(stats.weekly)}`
    : 'not published yet';
  console.log(`    ${name.padEnd(22)} ${line}`);
}

console.log(`\n  PyPI`);
for (const [name, stats] of Object.entries(pypi)) {
  const line = stats.published
    ? `last month ${fmt(stats.lastMonth)}  last week ${fmt(stats.lastWeek)}  last day ${fmt(stats.lastDay)}`
    : 'not published yet';
  console.log(`    ${name.padEnd(22)} ${line}`);
}

console.log(`\n  ${'-'.repeat(52)}`);

if (invariantErrors.length > 0) {
  console.log('\n  INVARIANT VIOLATIONS -- these numbers should not be trusted:');
  for (const message of invariantErrors) console.log(`    ! ${message}`);
}

if (previous) {
  const days = Math.max(1, Math.round((Date.parse(snapshot.at) - Date.parse(previous.at)) / 86_400_000));
  console.log(`  previous snapshot: ${previous.at.slice(0, 16).replace('T', ' ')} (${days} day${days === 1 ? '' : 's'} ago)`);
} else {
  console.log('  no previous snapshot -- run with --save to start the history');
}
if (SAVE) {
  console.log(`  saved ${history.length} snapshot${history.length === 1 ? '' : 's'} to .traction/history.json`);
}
console.log('');
