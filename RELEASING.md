# Releasing

Publishing is the only irreversible thing in this repository, so it goes
through a tag and a gated workflow rather than a command anyone remembers to
type.

## The short version

Once, by hand — about ten minutes:

1. Create the npm packages.
2. Create the PyPI packages.
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
| `verify` | Typecheck, both TypeScript suites, both conformance suites, both parity checks. Also checks the tag against all four manifests. |
| `npm` | Publishes `@vntoolkit/vn-text` and `@vntoolkit/vn-collate` with provenance. |
| `pypi` | Builds both wheels and sdists, lists their contents, publishes to PyPI. |

The `verify` job is a hard gate. Nothing publishes unless it passes.

## One-time setup

### npm

The scope has to exist before anything can be published into it.

1. Sign in at <https://www.npmjs.com> and create the **`vntoolkit` organisation**
   (or a user account with that name). Free.
2. Create both packages from the command line. This is the one step that needs
   `npm login`:

   ```bash
   npm login
   npm publish --workspace @vntoolkit/vn-text --access public --dry-run
   npm publish --workspace @vntoolkit/vn-collate --access public --dry-run
   ```

   Drop `--dry-run` and re-run to actually create them. Creating the package is
   what npm's trusted publishing needs; the files do not have to be good yet,
   because the release workflow republishes over them.

3. Create a token: <https://www.npmjs.com/settings/leeloc1809/access-tokens>
   → **Automation** token → scope **Publish** (read/write). Copy it once; npm
   shows it once.
4. Add it as a repository secret:
   <https://github.com/leeloc1809/vn-toolkit/settings/secrets/actions/new>
   - Name: `NPM_TOKEN`
   - Value: the token

### PyPI

1. Create an account at <https://pypi.org> and verify your email.
2. Create both projects. There is no CLI for this; use the web form:
   - <https://pypi.org/project/vn-text/>
   - <https://pypi.org/project/vn-collate/>

   Tick **MIT** as the licence.
3. Create an API token: account settings → API tokens → name it, scope
   **publish** to the `vn-text` and `vn-collate` projects only, copy it once.
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

Version bumps touch four files, and they must agree:

```
packages/vn-text-ts/package.json
packages/vn-collate-ts/package.json
packages/vn-text-py/pyproject.toml
packages/vn-collate-py/pyproject.toml
```

`npm version` and a matching `sed` handle this, but check it first — the
mismatch is easy to make and the failure is confusing:

```bash
bash scripts/check-release-tag.sh
```

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
npm publish --workspace @vntoolkit/vn-text --access public
npm publish --workspace @vntoolkit/vn-collate --access public

node scripts/stage-license.mjs packages/vn-text-py packages/vn-collate-py
python -m build packages/vn-text-py
python -m build packages/vn-collate-py
python -m twine upload packages/*/dist/*
```

## What to check after a release

```bash
npm view @vntoolkit/vn-text
npm view @vncollate/vn-collate
pip install vn-text vn-collate
```

Then import them somewhere that is not this repository, and confirm the
conformance suite passed on the runner. A published package that is not
installable is worse than an unpublished one, because the failure is someone
else's problem.

## Why the version check is so strict

A tag that disagrees with the manifests publishes real code under a misleading
name, and nothing fails. `v0.2.0` on top of manifests that say `0.1.0` produces
an npm page labelled 0.2.0 that can never be republished, because npm treats
that name as taken. It is the kind of mistake that costs a version number
permanently and is invisible until someone tries to fix it.
