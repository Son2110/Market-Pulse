#!/usr/bin/env python3
"""Build a small, allowlisted documentation site for CI artifacts and Pages."""

from __future__ import annotations

import html
import re
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
DOCUMENTS = (
    "README.md",
    "MarketPulse_VN_Project_Documentation.md",
    "docs/PRD.md",
    "docs/ROADMAP.md",
    "docs/CODEX_WORKFLOW.md",
    "docs/CI_CD.md",
    "docs/GITHUB_SETUP.md",
)
ASSETS = ("docs/assets/marketpulse-banner.svg",)
PORTAL = ROOT / "docs/assets/portal.html"


def title_for(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    for line in text.splitlines():
        heading = re.match(r"^#\s+(.+?)\s*#*\s*$", line)
        if heading:
            return heading.group(1)
    return path.stem.replace("_", " ").replace("-", " ").title()


def main() -> int:
    missing = [name for name in (*DOCUMENTS, *ASSETS, "docs/assets/portal.html") if not (ROOT / name).is_file()]
    if missing:
        print("Required documentation inputs are missing:", file=sys.stderr)
        print("\n".join(f"- {name}" for name in missing), file=sys.stderr)
        return 1
    if OUTPUT.is_symlink():
        print("Refusing to replace a symlink at _site.", file=sys.stderr)
        return 1
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()

    cards = []
    for name in DOCUMENTS:
        source = ROOT / name
        relative = Path(name)
        destination = OUTPUT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        github_source = f"https://github.com/Son2110/Market-Pulse/blob/main/{relative.as_posix()}"
        label = html.escape(title_for(source))
        href = html.escape(relative.as_posix(), quote=True)
        origin = html.escape(github_source, quote=True)
        cards.append(
            f'<article class="card"><h2>{label}</h2>'
            f'<a class="download" href="{href}" download>Download Markdown</a>'
            f'<a class="source" href="{origin}">View source on GitHub</a></article>'
        )

    for name in ASSETS:
        source = ROOT / name
        relative = Path(name)
        destination = OUTPUT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)

    portal = PORTAL.read_text(encoding="utf-8")
    marker = "<!-- DOCUMENT_LINKS -->"
    if portal.count(marker) != 1:
        print(f"Portal must contain exactly one {marker} placeholder.", file=sys.stderr)
        return 1
    rendered_portal = portal.replace("../../docs/assets/", "docs/assets/")
    (OUTPUT / "index.html").write_text(
        rendered_portal.replace(marker, "\n".join(cards)), encoding="utf-8"
    )
    print(f"Built documentation portal and {len(DOCUMENTS)} source documents in _site/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
