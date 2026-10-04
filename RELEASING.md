# Releasing

Publishing is the only irreversible thing in this repository, so it goes
through a tag and a gated workflow rather than a command anyone remembers to
type.

## The short version

Once, by hand — about ten minutes:

1. Create the four npm packages. The names are unscoped, so there is no
   organisation to make and this is one `npm publish --dry-run` each.
2. Create the four PyPI projects through the web form.
3. Add the two API tokens as repository secrets.

Then, every release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

That is the whole release. The workflow runs the full test suite first and
refuses to publish if anything is red or if the tag disagrees with the version
in the manifests.

## What the workflow does

`.github/workflows/release.yml`, triggered by a `v*` tag.

| job | what it does |
|---|---|
| `verify` | Typecheck, all four TypeScript suites, all four conformance suites, all four parity checks, and every wiring check. Also checks the tag against all eight manifests. |
| `npm` | Publishes `vn-text`, `vn-collate`, `vn-money` and `vn-ident` with provenance. |
| `pypi` | Builds four wheels and four sdists, lists their contents, publishes to PyPI. |

The `verify` job is a hard gate. Nothing publishes unless it passes.

The npm and PyPI names are the same four strings. That is deliberate: a reader
who sees `vn-money` in this README does not have to work out whether npm or
PyPI is meant, and the install line in a bug report is the same either way.

## One-time setup

### npm

The four names are unscoped, so there is no organisation to create and no
scope to be refused access to. This is not a detail. The packages were first
published under a `@vntoolkit/` scope, and the scope did not exist: the
registry answered `404` for every publish, with an error that reads like a
missing package rather than a missing permission to create one.

1. Create a token: <https://www.npmjs.com/settings/leeloc/access-tokens>

   Use a **granular access token**, not a legacy automation token, and tick
   **Bypass 2FA**. The account has 2FA on, and without that box npm refuses to
   publish with

   ```
   403 Two-factor authentication or granular access token with
       bypass 2fa enabled is required to publish packages
   ```

   Packages: read and write. Copy it once; npm shows it once.

2. Add it as a repository secret:
   <https://github.com/leeloc1809/vn-toolkit/settings/secrets/actions/new>
   - Name: `NPM_TOKEN`
   - Value: the token

3. Confirm the token is really being used. The release log prints
   `account: <name>` and the run fails at that step rather than at the publish
   if the registry rejects it, which is the difference between a credential
   problem and a scope problem being visible in the log.

   The write goes to `${NPM_CONFIG_USERCONFIG:-$HOME/.npmrc}` and not to
   `~/.npmrc`, because `actions/setup-node` with `registry-url` sets
   `NPM_CONFIG_USERCONFIG`, and that variable wins over the home directory.
   Writing `~/.npmrc` instead puts the token in a file npm never opens. That
   cost two release runs and reported itself as a 404 on a scope, which is a
   misleading error for a file that was never read. `check-wiring` fails the
   build if the write target goes back to `~/.npmrc`.

### PyPI

1. Create an account at <https://pypi.org> and verify your email.
2. Create the four projects. There is no CLI for this; use the web form:
   - <https://pypi.org/project/vn-text/>
   - <https://pypi.org/project/vn-collate/>
   - <https://pypi.org/project/vn-money/>
   - <https://pypi.org/project/vn-ident/>

   Tick **MIT** as the licence.
3. Create an API token: account settings → API tokens → name it, scope
   **publish** to the four projects only, copy it once.
4. Add it as a repository secret named `PYPI_API_TOKEN`, same page as above.

## After the first release: drop the tokens

API tokens are long-lived credentials sitting in a repository. Once the first
release works, replace them with **trusted publishing**, which uses a short-lived
OIDC token and stores nothing.

**npm** — on each package page: Settings → Trusted Publisher → GitHub Actions,
then `leeloc1809/vn-toolkit`, workflow `release.yml`, environment blank.

**PyPI** — account settings → Publishing → add a pending publisher per project:
`leeloc1809`, `vn-toolkit`, repository `leeloc1809/vn-toolkit`, workflow
`release.yml`.

Then delete `NPM_TOKEN` and `PYPI_API_TOKEN` from the repository secrets. The
workflow detects their absence and switches to OIDC on its own; nothing in the
YAML needs editing.

## Releasing a new version

Version bumps touch eight files, and they must all agree:

```
packages/vn-text-ts/package.json        packages/vn-text-py/pyproject.toml
packages/vn-collate-ts/package.json     packages/vn-collate-py/pyproject.toml
packages/vn-money-ts/package.json       packages/vn-money-py/pyproject.toml
packages/vn-ident-ts/package.json       packages/vn-ident-py/pyproject.toml
```

`npm version` and a matching `sed` handle this, but check it first — the
mismatch is easy to make and the failure is confusing:

```bash
bash scripts/check-release-tag.sh
```

That script globs the manifests rather than holding its own list, so a fifth
package cannot be left behind by forgetting to edit it here.

Then:

```bash
git commit -am "release: v0.1.0"
git tag v0.1.0
git push origin main --follow-tags
```

If the workflow fails after the tag is pushed, fix the problem and re-push the
same tag:

```bash
git tag -f v0.1.0
git push --force origin v0.1.0
```

## Publishing by hand

Occasionally necessary — usually when the first package creation needs a human.

```bash
npm login
npm run build
for pkg in vn-text vn-collate vn-money vn-ident; do
  npm publish --workspace "$pkg" --access public
done

for pkg in packages/vn-*-py; do
  node scripts/stage-license.mjs "$pkg"
  python -m build "$pkg"
done
python -m twine upload packages/*/dist/*
```

## What to check after a release

```bash
for pkg in vn-text vn-collate vn-money vn-ident; do npm view "$pkg"; done
pip install vn-text vn-collate vn-money vn-ident
```

Then import them somewhere that is not this repository, and confirm the
conformance suite passed on the runner. A published package that is not
installable is worse than an unpublished one, because the failure is someone
else's problem.

Do this against a clean virtual environment, not from a checkout. An import
that resolves to the working tree proves the source is fine and says nothing
about whether the wheel is.

## Why the version check is so strict

A tag that disagrees with the manifests publishes real code under a misleading
name, and nothing fails. `v0.2.0` on top of manifests that say `0.1.0` produces
an npm page labelled 0.2.0 that can never be republished, because npm treats
that name as taken. It is the kind of mistake that costs a version number
permanently and is invisible until someone tries to fix it.
