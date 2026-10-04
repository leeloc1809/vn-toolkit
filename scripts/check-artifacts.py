"""Check that the Python artefacts would publish something complete.

    python scripts/check-artifacts.py [dist-dir]

A file missing from a wheel still imports perfectly from the repository and only
fails once somebody installs the published package. The wheel is the thing
users get, so the wheel is what gets checked.

What this asserts, and why each one matters:

  LICENSE in the wheel and the sdist
      npm and PyPI both display it on the package page. Its absence is
      invisible until someone is deciding whether to depend on the package.

  py.typed inside the wheel
      Both packages declare "Typing :: Typed". Without the marker a type
      checker ignores every annotation, so the declaration is a lie and a
      consumer running mypy gets an untyped import.

  no runtime Requires-Dist
      The libraries are standard-library only by design. A dependency creeping
      in is the kind of change that happens without anyone deciding it.

  Project-URL in METADATA
      The registry page needs to link back to the source, or the package is
      untraceable to a repository.
"""

from __future__ import annotations

import pathlib
import sys
import tarfile
import zipfile

DIST = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist")

if not DIST.is_dir():
    print(f"no artefact directory at {DIST}", file=sys.stderr)
    sys.exit(2)

problems: list[str] = []


def check_wheel(wheel: pathlib.Path) -> None:
    names = zipfile.ZipFile(wheel).namelist()
    module = next(n.split("/")[0] for n in names if n.endswith(".dist-info/METADATA"))
    meta = zipfile.ZipFile(wheel).read(f"{module}/METADATA").decode("utf-8")

    if not any("LICENSE" in n for n in names):
        problems.append(f"{wheel.name}: no LICENSE in the wheel")
    if not any(n.endswith("py.typed") for n in names):
        problems.append(f"{wheel.name}: no py.typed, but the package claims Typing :: Typed")

    runtime = [
        line
        for line in meta.splitlines()
        if line.startswith("Requires-Dist") and "extra ==" not in line
    ]
    if runtime:
        problems.append(f"{wheel.name}: unexpected runtime dependencies {runtime}")

    if "Project-URL: Homepage" not in meta:
        problems.append(f"{wheel.name}: METADATA has no Project-URL")

    print(f"  {wheel.name}: {len(names)} entries")


def check_sdist(sdist: pathlib.Path) -> None:
    names = tarfile.open(sdist).getnames()
    if not any(n.endswith("LICENSE") for n in names):
        problems.append(f"{sdist.name}: no LICENSE in the sdist")
    print(f"  {sdist.name}: {len(names)} entries")


wheels = sorted(DIST.glob("*.whl"))
sdists = sorted(DIST.glob("*.tar.gz"))

if not wheels and not sdists:
    print(f"no artefacts in {DIST}", file=sys.stderr)
    sys.exit(2)

for wheel in wheels:
    check_wheel(wheel)
for sdist in sdists:
    check_sdist(sdist)

if problems:
    for problem in problems:
        print(f"::error::{problem}")
    print(f"\n{len(problems)} packaging problem(s)")
    sys.exit(1)

print("every artefact would publish something complete")
