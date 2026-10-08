"""RC-20 distribution contracts. Standard library only; source artwork is immutable."""
from __future__ import annotations

import base64
import hashlib
import json
import re
import struct
import zlib
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ICONS = {
    "favicon.ico": ("image/x-icon", None),
    "favicon.svg": ("image/svg+xml", None),
    "favicon-96x96.png": ("image/png", (96, 96)),
    "apple-touch-icon.png": ("image/png", (180, 180)),
    "web-app-manifest-192x192.png": ("image/png", (192, 192)),
    "web-app-manifest-512x512.png": ("image/png", (512, 512)),
}
MANIFEST_ICONS = tuple(name for name in ICONS if name.startswith("web-app-"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_asset(root: Path, name: str) -> bytes:
    path = root / name
    require(path.is_file(), f"Missing required branding asset: {path}")
    data = path.read_bytes()
    require(bool(data), f"Empty required branding asset: {path}")
    return data


def validate_image(name: str, data: bytes) -> None:
    mime, dimensions = ICONS[name]
    if mime == "image/png":
        require(len(data) >= 33 and data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR",
                f"Invalid PNG signature: {name}")
        actual = struct.unpack(">II", data[16:24])
        require(actual == dimensions, f"PNG dimensions for {name}: expected {dimensions}, got {actual}")
        offset, chunks, compressed = 8, [], bytearray()
        while offset < len(data):
            require(offset + 12 <= len(data), f"Truncated PNG chunk: {name}")
            size = struct.unpack_from(">I", data, offset)[0]
            end = offset + 12 + size
            require(end <= len(data), f"Truncated PNG chunk data: {name}")
            kind = data[offset + 4:offset + 8]
            payload = data[offset + 8:offset + 8 + size]
            crc = struct.unpack_from(">I", data, offset + 8 + size)[0]
            require(zlib.crc32(kind + payload) == crc, f"Invalid PNG chunk checksum: {name}")
            chunks.append(kind)
            if kind == b"IDAT":
                compressed.extend(payload)
            offset = end
        require(chunks[0] == b"IHDR" and chunks[-1] == b"IEND" and bool(compressed), f"Incomplete PNG: {name}")
        try:
            require(bool(zlib.decompress(compressed)), f"Empty PNG image data: {name}")
        except zlib.error as error:
            raise ValueError(f"Invalid PNG compressed image data: {name}") from error
    elif mime == "image/x-icon":
        require(len(data) >= 6 and data[:4] == b"\x00\x00\x01\x00", f"Invalid ICO signature: {name}")
        count = struct.unpack("<H", data[4:6])[0]
        require(count > 0 and len(data) >= 6 + count * 16, f"Invalid ICO directory: {name}")
        for index in range(count):
            size, offset = struct.unpack_from("<II", data, 6 + index * 16 + 8)
            require(size > 0 and offset >= 6 + count * 16 and offset + size <= len(data),
                    f"Invalid ICO image bounds: {name}")
    else:
        # ElementTree does not resolve external entities; reject DTDs/entities explicitly.
        require(not re.search(br"<!DOCTYPE|<!ENTITY", data, re.I), f"Unsafe SVG declaration: {name}")
        try:
            svg = ET.fromstring(data)
        except ET.ParseError as error:
            raise ValueError(f"Invalid SVG: {name}: {error}") from error
        require(svg.tag == "{http://www.w3.org/2000/svg}svg" and bool(svg.get("viewBox")),
                f"Invalid SVG root/viewBox: {name}")
        for element in svg.iter():
            require(element.tag.rsplit("}", 1)[-1] not in ("script", "foreignObject"), f"Unsupported SVG content: {name}")
            for key, value in element.attrib.items():
                require(not key.lower().startswith("on"), f"Unsupported SVG event: {name}")
                if key.rsplit("}", 1)[-1] == "href":
                    require(value.startswith("#"), f"External SVG dependency: {name}")
                for reference in re.findall(r"url\(([^)]+)\)", value):
                    require(reference.strip("\"' ").startswith("#"), f"External SVG dependency: {name}")


def parse_manifest(data: bytes) -> dict:
    try:
        manifest = json.loads(data)
    except (ValueError, UnicodeError) as error:
        raise ValueError(f"Invalid site.webmanifest JSON: {error}") from error
    require(isinstance(manifest, dict), "site.webmanifest must be a JSON object")
    return manifest


def hosted_manifest(source: dict) -> dict:
    # Copy metadata; only deployment URLs and the previously absent scope change.
    manifest = json.loads(json.dumps(source))
    require(manifest.get("name") == "Auralprint - Waveform Analysis Tool", "Incorrect manifest application name")
    require(manifest.get("short_name") == "Auralprint", "Incorrect manifest short_name")
    icons = manifest.get("icons")
    require(isinstance(icons, list) and len(icons) == len(MANIFEST_ICONS), "Manifest must declare both supplied icons")
    seen = set()
    for icon in icons:
        require(isinstance(icon, dict), "Invalid manifest icon entry")
        src = icon.get("src", "")
        require(isinstance(src, str), "Invalid manifest icon src")
        name = src.removeprefix("/").removeprefix("./")
        require(name in MANIFEST_ICONS and name not in seen, f"Manifest references absent or unsupported icon: {src}")
        seen.add(name)
        mime, dimensions = ICONS[name]
        require(icon.get("type") == mime, f"Manifest MIME mismatch: {name}")
        require(icon.get("sizes") == f"{dimensions[0]}x{dimensions[1]}", f"Manifest dimensions mismatch: {name}")
        require(icon.get("purpose", "any") in ("any", "maskable", "any maskable"), f"Invalid icon purpose: {name}")
        icon["src"] = f"./{name}"
    manifest["start_url"] = "./index.html"
    manifest["scope"] = "./"
    return manifest


def load_branding(root: Path) -> tuple[dict[str, bytes], dict]:
    assets = {name: read_asset(root, name) for name in ICONS}
    for name, data in assets.items():
        validate_image(name, data)
    manifest = hosted_manifest(parse_manifest(read_asset(root, "site.webmanifest")))
    return assets, manifest


def metadata(edition: str, assets: dict[str, bytes]) -> str:
    if edition == "portable":
        encoded = base64.b64encode(assets["favicon.svg"]).decode("ascii")
        return f'<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,{encoded}">'
    require(edition == "hosted", f"Unknown distribution edition: {edition}")
    return '\n  '.join([
        '<link rel="shortcut icon" type="image/x-icon" href="./favicon.ico">',
        '<link rel="icon" type="image/png" sizes="96x96" href="./favicon-96x96.png">',
        '<link rel="icon" type="image/svg+xml" href="./favicon.svg">',
        '<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">',
        '<meta name="apple-mobile-web-app-title" content="Auralprint">',
        '<link rel="manifest" href="./site.webmanifest">',
    ])


class Document(HTMLParser):
    def __init__(self, html: str):
        super().__init__(convert_charrefs=True)
        self.links, self.metas, self.scripts, self.styles = [], [], [], []
        self.title = ""
        self.current = None
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link":
            self.links.append(attrs)
        if tag == "meta":
            self.metas.append(attrs)
        if tag == "script":
            require("src" not in attrs, "External application script dependency")
            self.scripts.append("")
        if tag == "style":
            self.styles.append("")
        if tag in ("script", "style", "title"):
            self.current = tag
        if tag == "base":
            raise ValueError("A base URL would break relocatable distribution")
        if tag in ("img", "iframe", "source", "audio", "video") and "src" in attrs:
            require(attrs["src"].startswith("data:"), f"External application {tag} dependency")

    def handle_endtag(self, tag):
        if tag == self.current:
            self.current = None

    def handle_data(self, data):
        if self.current == "script":
            self.scripts[-1] += data
        elif self.current == "style":
            self.styles[-1] += data
        elif self.current == "title":
            self.title += data


def relative_url(value: str) -> None:
    require(isinstance(value, str) and value.startswith("./") and "\\" not in value,
            f"Hosted URL must be package-relative: {value}")
    parsed = urlsplit(value)
    require(not parsed.scheme and not parsed.netloc and not parsed.query and not parsed.fragment,
            f"Invalid hosted resource URL: {value}")
    require(".." not in parsed.path.split("/"), f"Hosted URL escapes package: {value}")


def validate_html(html: str, edition: str, version: str, assets: dict[str, bytes]) -> Document:
    require(bool(html), f"Empty {edition} HTML")
    require(not re.search(r"<!--\s*AURALPRINT_|__AURALPRINT_[A-Z_]+__", html), "Unresolved assembly marker")
    doc = Document(html)
    require(doc.title == f"Auralprint - Waveform Analysis Tool - {version}", f"Stale or incorrect {edition} version/title")
    require(any(m.get("charset", "").lower() == "utf-8" for m in doc.metas), "Missing UTF-8 metadata")
    require(any(m.get("name") == "viewport" and m.get("content") for m in doc.metas), "Missing viewport")
    require(any(m.get("name") == "description" and m.get("content") for m in doc.metas), "Missing description")
    require(len(doc.scripts) == 1 and bool(doc.scripts[0].strip()), "Missing embedded application JS")
    require(len(doc.styles) == 1 and bool(doc.styles[0].strip()), "Missing embedded application CSS")
    require(not re.search(r"@import|url\(\s*(?![\"']?data:)", doc.styles[0]), "External stylesheet resource dependency")
    if edition == "portable":
        require(len(doc.links) == 1 and doc.links[0].get("rel") == "icon", "Portable must have one embedded favicon and no external metadata")
        icon = doc.links[0]
        require(icon.get("type") == "image/svg+xml", "Portable favicon MIME mismatch")
        prefix = "data:image/svg+xml;base64,"
        require(icon.get("href", "").startswith(prefix), "External portable favicon dependency")
        try:
            decoded = base64.b64decode(icon["href"][len(prefix):], validate=True)
        except ValueError as error:
            raise ValueError("Invalid embedded favicon base64") from error
        require(decoded == assets["favicon.svg"], "Embedded favicon differs from canonical source")
        validate_image("favicon.svg", decoded)
    else:
        expected = [("shortcut icon", "./favicon.ico"), ("icon", "./favicon-96x96.png"),
                    ("icon", "./favicon.svg"), ("apple-touch-icon", "./apple-touch-icon.png"),
                    ("manifest", "./site.webmanifest")]
        for link in doc.links:
            relative_url(link.get("href", ""))
        require([(link.get("rel"), link.get("href")) for link in doc.links] == expected,
                "Hosted metadata links differ from packaging contract")
        for link in doc.links:
            name = link["href"][2:]
            if name in ICONS and "type" in link:
                require(link["type"] == ICONS[name][0], f"HTML icon MIME mismatch: {name}")
            if name in ICONS and "sizes" in link:
                dimensions = ICONS[name][1]
                require(link["sizes"] == f"{dimensions[0]}x{dimensions[1]}", f"HTML icon dimensions mismatch: {name}")
    return doc


def verify_distribution(dist: Path, branding: Path, version: str, css: str, js: str) -> dict:
    # Import lazily so assembler and verifier share the exact safe inline block policy.
    from assemble_single_file import inline_script, inline_style
    assets, manifest = load_branding(branding)
    portable_path = dist / f"auralprint_{version.removeprefix('v')}.html"
    hosted = dist / "hosted"
    documents = []
    for edition, file in (("portable", portable_path), ("hosted", hosted / "index.html")):
        doc = validate_html(file.read_text(encoding="utf-8"), edition, version, assets)
        require(doc.scripts[0] == Document(inline_script(js)).scripts[0], f"{edition} JS differs from shared bundle")
        require(doc.styles[0] == Document(inline_style(css)).styles[0], f"{edition} CSS differs from shared bundle")
        documents.append(doc)
    require(documents[0].scripts == documents[1].scripts and documents[0].styles == documents[1].styles,
            "Application implementations diverged")
    for name, data in assets.items():
        require(read_asset(hosted, name) == data, f"Hosted icon differs from canonical source: {name}")
    generated = parse_manifest(read_asset(hosted, "site.webmanifest"))
    for value in [generated.get("start_url"), generated.get("scope")] + [i.get("src") for i in generated.get("icons", [])]:
        relative_url(value)
        for base in ("https://example.test/site.webmanifest", "https://example.test/apps/auralprint/site.webmanifest"):
            package = urljoin(base, "./")
            require(urljoin(base, value).startswith(package), f"Manifest URL escapes deployment prefix: {value}")
    require(generated == manifest, "Generated manifest differs from documented URL transformation")
    require({p.name for p in hosted.iterdir()} == {"index.html", "site.webmanifest", *ICONS}, "Unexpected or missing hosted package files")
    files = [portable_path, *sorted(hosted.iterdir())]
    return {str(p.relative_to(dist)).replace("\\", "/"): {"bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files}
