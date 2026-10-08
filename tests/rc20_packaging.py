"""Isolated packaging/failure/mutation assertions; never needs or edits checkout dist/."""
import base64
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from assemble_single_file import HEAD_MARKER, CSS_MARKER, JS_MARKER, VERSION_MARKER, assemble, main
from distribution import Document, ICONS, load_branding, parse_manifest, validate_html, verify_distribution

VERSION = "v0.1.15m.i.e"
CSS = "body { color: red; }\n"
JS = 'console.log("one shared application");\n'


class Packaging(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="auralprint-rc20-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.branding = self.root / "branding"
        shutil.copytree(ROOT / "src/assets/branding", self.branding)
        self.template = (ROOT / "src/index.template.html").read_text(encoding="utf-8")
        self.dist = self.root / "dist"
        self.portable = self.dist / f"auralprint_{VERSION[1:]}.html"
        self.hosted = self.dist / "hosted"
        self.assets, self.manifest = load_branding(self.branding)
        for filename, text in (("template.html", self.template), ("app.css", CSS), ("app.js", JS)):
            (self.root / filename).write_text(text, encoding="utf-8")
        self.args = [str(ROOT / "scripts/assemble_single_file.py"), str(self.root / "template.html"),
                     str(self.root / "app.css"), str(self.root / "app.js"), VERSION, str(self.portable),
                     "--branding", str(self.branding), "--hosted-dir", str(self.hosted)]

    def build(self):
        self.assertEqual(main(self.args), 0)

    def verify(self):
        return verify_distribution(self.dist, self.branding, VERSION, CSS, JS)

    def cli_failure(self, message):
        result = subprocess.run([sys.executable, *self.args], cwd=self.root, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(message, result.stderr)
        self.assertFalse(self.portable.exists(), "Invalid inputs must fail before distribution emission")

    def test_both_contracts_and_asset_integrity(self):
        originals = {p.relative_to(self.branding): p.read_bytes() for p in self.branding.rglob('*') if p.is_file()}
        self.build()
        artifacts = self.verify()
        self.assertEqual(len(artifacts), 9)
        doc = Document(self.portable.read_text(encoding="utf-8"))
        self.assertEqual(len(doc.links), 1)
        self.assertEqual(base64.b64decode(doc.links[0]['href'].split(',', 1)[1]), originals[Path('favicon.svg')])
        self.assertEqual(set(p.name for p in self.hosted.iterdir()), {'index.html', 'site.webmanifest', *ICONS})
        for name in ICONS:
            self.assertEqual((self.hosted / name).read_bytes(), originals[Path(name)])
        source = parse_manifest(originals[Path('site.webmanifest')])
        expected = json.loads(json.dumps(source))
        expected['start_url'], expected['scope'] = './index.html', './'
        for icon in expected['icons']:
            icon['src'] = '.' + icon['src']
        self.assertEqual(json.loads((self.hosted / 'site.webmanifest').read_text(encoding="utf-8")), expected)
        self.assertNotIn('og:image', self.portable.read_text(encoding="utf-8"))
        self.assertFalse((self.hosted / 'assets').exists())
        self.build()
        self.assertEqual(self.verify(), artifacts, 'Repeated assembly changes distributable bytes')
        self.assertEqual({p.relative_to(self.branding): p.read_bytes() for p in self.branding.rglob('*') if p.is_file()}, originals)

    def test_old_declarations_are_a_preserved_negative_control(self):
        old = json.loads((ROOT / 'docs/audits/evidence/2026-10-06_214431_PDT/packaging-results.json').read_text(encoding="utf-8"))
        portable, _ = assemble(self.template, CSS, JS, VERSION, self.assets)
        icon = Document(portable).links[0]['href']
        declarations = '\n'.join(f'<link rel="{link["rel"]}" href="{link["href"]}">' for link in old['rootRelativeMissingResources'])
        bad = portable.replace(f'<link rel="icon" type="image/svg+xml" href="{icon}">', declarations)
        with self.assertRaisesRegex(ValueError, 'Portable must have one embedded favicon'):
            validate_html(bad, 'portable', VERSION, self.assets)
        hosted = assemble(self.template, CSS, JS, VERSION, self.assets)[1]
        with self.assertRaisesRegex(ValueError, 'package-relative'):
            validate_html(hosted.replace('./favicon.ico', '/favicon.ico'), 'hosted', VERSION, self.assets)

    def test_build_missing_favicon(self):
        (self.branding / 'favicon.svg').unlink()
        self.cli_failure('Missing required branding asset')

    def test_build_missing_manifest_icon(self):
        (self.branding / 'web-app-manifest-192x192.png').unlink()
        self.cli_failure('Missing required branding asset')

    def test_build_malformed_manifest(self):
        (self.branding / 'site.webmanifest').write_text('{broken', encoding="utf-8")
        self.cli_failure('Invalid site.webmanifest JSON')

    def test_build_absent_manifest_reference(self):
        source = json.loads((self.branding / 'site.webmanifest').read_text(encoding="utf-8"))
        source['icons'][0]['src'] = '/absent.png'
        (self.branding / 'site.webmanifest').write_text(json.dumps(source), encoding="utf-8")
        self.cli_failure('Manifest references absent or unsupported icon')

    def test_build_invalid_icon(self):
        (self.branding / 'favicon.svg').write_text('<svg>', encoding="utf-8")
        self.cli_failure('Invalid SVG')

    def test_build_wrong_png_dimensions(self):
        data = bytearray((self.branding / 'favicon-96x96.png').read_bytes())
        data[19] = 95
        (self.branding / 'favicon-96x96.png').write_bytes(data)
        self.cli_failure('PNG dimensions')

    def test_build_corrupt_png_payload(self):
        data = bytearray((self.branding / 'favicon-96x96.png').read_bytes())
        data[-20] ^= 1
        (self.branding / 'favicon-96x96.png').write_bytes(data)
        self.cli_failure('Invalid PNG chunk checksum')

    def test_build_wrong_manifest_mime(self):
        source = json.loads((self.branding / 'site.webmanifest').read_text(encoding="utf-8"))
        source['icons'][0]['type'] = 'image/jpeg'
        (self.branding / 'site.webmanifest').write_text(json.dumps(source), encoding="utf-8")
        self.cli_failure('Manifest MIME mismatch')

    def test_build_unsafe_svg(self):
        (self.branding / 'favicon.svg').write_text('<!DOCTYPE svg [<!ENTITY bad "unsafe">]><svg/>', encoding="utf-8")
        self.cli_failure('Unsafe SVG declaration')

    def test_build_missing_and_duplicate_markers(self):
        for marker in (HEAD_MARKER, CSS_MARKER, JS_MARKER, VERSION_MARKER):
            with self.subTest(marker=marker, mutation='missing'):
                with self.assertRaisesRegex(ValueError, 'Missing or duplicate'):
                    assemble(self.template.replace(marker, ''), CSS, JS, VERSION, self.assets)
            with self.subTest(marker=marker, mutation='duplicate'):
                with self.assertRaisesRegex(ValueError, 'Missing or duplicate'):
                    assemble(self.template.replace(marker, marker + marker), CSS, JS, VERSION, self.assets)
        (self.root / 'template.html').write_text(self.template.replace(HEAD_MARKER, ''), encoding="utf-8")
        self.cli_failure('Missing or duplicate head metadata marker')

    def test_build_unresolved_marker(self):
        (self.root / 'template.html').write_text(self.template.replace('</head>', '<!-- AURALPRINT_FORGOTTEN -->\n</head>'), encoding="utf-8")
        self.cli_failure('Unresolved assembly marker')

    def test_build_external_portable_link(self):
        (self.root / 'template.html').write_text(self.template.replace('</head>', '<link rel="icon" href="./favicon.ico"></head>'), encoding="utf-8")
        self.cli_failure('Portable must have one embedded favicon')

    def test_artifact_missing_favicon(self):
        self.build()
        (self.hosted / 'favicon.ico').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing required branding asset'):
            self.verify()

    def test_artifact_missing_manifest_icon(self):
        self.build()
        (self.hosted / 'web-app-manifest-512x512.png').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing required branding asset'):
            self.verify()

    def test_artifact_root_relative_launch_and_scope(self):
        self.build()
        for key in ('start_url', 'scope'):
            with self.subTest(key=key):
                manifest = dict(self.manifest)
                manifest[key] = '/index.html' if key == 'start_url' else '/'
                (self.hosted / 'site.webmanifest').write_text(json.dumps(manifest), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, 'package-relative'):
                    self.verify()

    def test_artifact_malformed_manifest(self):
        self.build()
        (self.hosted / 'site.webmanifest').write_text('{broken', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, 'Invalid site.webmanifest JSON'):
            self.verify()

    def test_artifact_external_portable_icon(self):
        self.build()
        html = self.portable.read_text(encoding="utf-8")
        href = Document(html).links[0]['href']
        self.portable.write_text(html.replace(href, 'https://example.test/favicon.svg'), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, 'External portable favicon'):
            self.verify()

    def test_artifact_stale_version_each_edition(self):
        self.build()
        for file in (self.portable, self.hosted / 'index.html'):
            original = file.read_text(encoding="utf-8")
            with self.subTest(edition=file.name):
                file.write_text(original.replace(VERSION, 'v0.1.15m.i.c'), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, 'Stale or incorrect'):
                    self.verify()
                file.write_text(original, encoding="utf-8")

    def test_artifact_root_only_hosted_metadata(self):
        self.build()
        file = self.hosted / 'index.html'
        file.write_text(file.read_text(encoding="utf-8").replace('href="./', 'href="/'), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, 'package-relative'):
            self.verify()

    def test_artifact_shared_runtime_divergence(self):
        self.build()
        file = self.hosted / 'index.html'
        file.write_text(file.read_text(encoding="utf-8").replace(JS.strip(), 'console.log("diverged");'), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, 'JS differs from shared bundle'):
            self.verify()

    def test_build_rejects_external_scripts_and_stylesheets(self):
        for injection in ('<script src="https://example.test/app.js"></script>', '<link rel="stylesheet" href="https://example.test/app.css">'):
            with self.subTest(injection=injection):
                with self.assertRaisesRegex(ValueError, 'External application script|Portable must have'):
                    assemble(self.template.replace('</head>', injection + '</head>'), CSS, JS, VERSION, self.assets)


if __name__ == '__main__':
    unittest.main(verbosity=2)
