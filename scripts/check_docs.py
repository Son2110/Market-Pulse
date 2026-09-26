#!/usr/bin/env python3
"""Check local Markdown links without following examples inside fenced blocks."""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
INLINE_LINK = re.compile(r"!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))")
REFERENCE_LINK = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))")
SKIP_DIRS = {".git", ".github", "_site", "node_modules", ".venv", "dist", "coverage"}
HTML_FILES = {".html", ".htm"}


def outside_fences(lines: list[str]):
    fence_char = ""
    fence_size = 0
    for line_number, line in enumerate(lines, 1):
        match = FENCE.match(line)
        if match:
            marker = match.group(1)
            if not fence_char:
                fence_char, fence_size = marker[0], len(marker)
            elif marker[0] == fence_char and len(marker) >= fence_size:
                fence_char, fence_size = "", 0
            continue
        if not fence_char:
            yield line_number, line


def link_targets(line: str):
    for match in INLINE_LINK.finditer(line):
        yield match.group(1) or match.group(2)
    definition = REFERENCE_LINK.match(line)
    if definition:
        yield definition.group(1) or definition.group(2)


class HTMLLinkParser(HTMLParser):
    def __init__(self, first_line: int):
        super().__init__(convert_charrefs=True)
        self.first_line = first_line
        self.targets: list[tuple[int, str]] = []

    def handle_starttag(self, tag: str, attrs):
        for name, value in attrs:
            if name in {"href", "src"} and value:
                self.targets.append((self.first_line + self.getpos()[0] - 1, value))

    def handle_startendtag(self, tag: str, attrs):
        self.handle_starttag(tag, attrs)


def markdown_files(root: Path):
    for path in root.rglob("*.md"):
        if not any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            yield path


def html_files(root: Path):
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in HTML_FILES:
            if not any(part in SKIP_DIRS for part in path.relative_to(root).parts):
                yield path


def html_targets(lines: list[str]):
    visible_lines = [""] * len(lines)
    for line_number, line in outside_fences(lines):
        visible_lines[line_number - 1] = line
    parser = HTMLLinkParser(1)
    parser.feed("\n".join(visible_lines))
    yield from parser.targets


def check_link(source: Path, target: str, root: Path) -> bool | None:
    target = target.strip()
    parsed = urlsplit(target)
    if parsed.scheme or parsed.netloc or target.startswith("//"):
        return None
    path_text = unquote(parsed.path)
    if not path_text:
        return None
    # Markdown paths use forward slashes on every platform.
    destination = (root / path_text.lstrip("/")) if path_text.startswith("/") else (source.parent / path_text)
    return destination.exists()


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    errors: list[str] = []
    local_checked = 0
    skipped_external = 0
    skipped_anchors = 0
    sources = [*markdown_files(root), *html_files(root)]
    for source in sources:
        lines = source.read_text(encoding="utf-8").splitlines()
        targets = []
        if source.suffix.lower() == ".md":
            for line_number, line in outside_fences(lines):
                targets.extend((line_number, target) for target in link_targets(line))
            targets.extend(html_targets(lines))
        else:
            parser = HTMLLinkParser(1)
            parser.feed("\n".join(lines))
            targets.extend(parser.targets)
        for line_number, target in targets:
            present = check_link(source, target, root)
            if present is None:
                parsed = urlsplit(target)
                if parsed.scheme or parsed.netloc or target.startswith("//"):
                    skipped_external += 1
                else:
                    skipped_anchors += 1
                continue
            local_checked += 1
            if not present:
                relative = source.relative_to(root).as_posix()
                errors.append(f"{relative}:{line_number}: missing local target {target!r}")
    if errors:
        print("Broken local Markdown links:")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print(
        f"Checked {local_checked} local Markdown/HTML file targets; all targets exist. "
        f"Skipped {skipped_external} external links and {skipped_anchors} fragment-only links "
        "(they are not fetched or anchor-validated)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
