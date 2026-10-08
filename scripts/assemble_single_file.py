from __future__ import annotations

import argparse
import json
import re
import sys
from html import escape

from pathlib import Path

from distribution import load_branding, metadata, require, validate_html

CSS_MARKER = "<!-- AURALPRINT_INLINE_CSS -->"
JS_MARKER = "<!-- AURALPRINT_INLINE_JS -->"
HEAD_MARKER = "<!-- AURALPRINT_HEAD_METADATA -->"
VERSION_MARKER = "__AURALPRINT_VERSION__"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def normalize_block(text: str) -> str:
    return text.rstrip("\n") + "\n"


def inline_style(css: str) -> str:
    return "<style>\n" + normalize_block(css) + "</style>"


def inline_script(js: str) -> str:
    safe_js = normalize_block(js).replace("</script", "<\\/script")
    return "<script>\n" + safe_js + "</script>"


def assemble(template: str, css: str, js: str, version: str, assets: dict) -> tuple[str, str]:
    for label, marker in (("CSS", CSS_MARKER), ("JS", JS_MARKER), ("version", VERSION_MARKER), ("head metadata", HEAD_MARKER)):
        require(template.count(marker) == 1, f"Missing or duplicate {label} marker in template")
    require(bool(re.fullmatch(r"v[0-9][A-Za-z0-9.\-]*", version)), "Invalid version tag")
    shared = template.replace(VERSION_MARKER, escape(version))
    shared = shared.replace(CSS_MARKER, inline_style(css)).replace(JS_MARKER, inline_script(js))
    outputs = tuple(shared.replace(HEAD_MARKER, metadata(edition, assets)) for edition in ("portable", "hosted"))
    for edition, output in zip(("portable", "hosted"), outputs):
        validate_html(output, edition, version, assets)
    return outputs


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Assemble portable HTML and optional hosted package from shared bundles")
    parser.add_argument("template", type=Path)
    parser.add_argument("css", type=Path)
    parser.add_argument("js", type=Path)
    parser.add_argument("version")
    parser.add_argument("output", type=Path)
    parser.add_argument("--branding", type=Path, default=Path(__file__).resolve().parent.parent / "src/assets/branding")
    parser.add_argument("--hosted-dir", type=Path)
    args = parser.parse_args(argv[1:])
    try:
        assets, manifest = load_branding(args.branding)
        portable, hosted = assemble(read_text(args.template), read_text(args.css), read_text(args.js), args.version.strip(), assets)
        # Validate all inputs and both HTML variants before writing any output.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(portable, encoding="utf-8", newline="\n")
        if args.hosted_dir:
            args.hosted_dir.mkdir(parents=True, exist_ok=True)
            (args.hosted_dir / "index.html").write_text(hosted, encoding="utf-8", newline="\n")
            for name, data in assets.items():
                (args.hosted_dir / name).write_bytes(data)
            (args.hosted_dir / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    except (ValueError, OSError) as error:
        parser.exit(1, f"Distribution packaging failed: {error}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
