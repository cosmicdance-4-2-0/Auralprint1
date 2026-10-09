"""Opt-in native export inspection using existing ffprobe/ffmpeg, no packages.

Usage: python export-probe.py --output fresh.json f6-corrupt.webm f6-after-tap.webm
The independent browser runner generates A=440Hz and B=660Hz (right=2x).
Probe actual encoded streams and decoded audio before claiming capture recovery.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("files", nargs="+", type=Path)
args = parser.parse_args()
results = []
for file in args.files:
    probe = subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-show_streams",
                            "-show_format", "-of", "json", str(file)], capture_output=True, check=True)
    metadata = json.loads(probe.stdout)
    decode = subprocess.run(["ffmpeg", "-v", "error", "-i", str(file), "-map", "0:a:0",
                             "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"],
                            capture_output=True, check=True)
    pcm = array.array("f", decode.stdout)
    if sys.byteorder != "little":
        pcm.byteswap()
    windows = []
    for offset in range(0, len(pcm) - 3840 + 1, 3840):
        samples = pcm[offset:offset + 3840]
        rms = math.sqrt(sum(x * x for x in samples) / len(samples))
        amplitudes = {}
        for hz in [440, 660]:
            real = sum(x * math.cos(2 * math.pi * hz * i / 48000) for i, x in enumerate(samples))
            imag = sum(x * math.sin(2 * math.pi * hz * i / 48000) for i, x in enumerate(samples))
            amplitudes[str(hz)] = 2 * math.hypot(real, imag) / len(samples)
        a, b = amplitudes["440"], amplitudes["660"]
        label = "A" if a > 0.005 and a > 4 * b else "B" if b > 0.005 and b > 4 * a else "transition/silence"
        windows.append({"startSeconds": round(offset / 48000, 2), "rms": round(rms, 6),
                        "amplitudes": amplitudes, "dominantFixture": label})
    labels = {w["dominantFixture"] for w in windows}
    streams = [{key: s.get(key) for key in ["codec_name", "codec_type", "sample_rate", "channels", "nb_read_packets"]}
               for s in metadata["streams"]]
    passed = {"A", "B"}.issubset(labels) and {"audio", "video"}.issubset({s["codec_type"] for s in streams})
    results.append({"file": file.name, "bytes": file.stat().st_size,
                    "sha256": hashlib.sha256(file.read_bytes()).hexdigest(), "streams": streams,
                    "decodedAudioSeconds": len(pcm) / 48000, "windows": windows,
                    "bothFixturesCaptured": {"A", "B"}.issubset(labels), "passed": passed})
output = {"method": "Actual native WebM demux/decode; 80ms Fourier amplitude windows at generated 440/660Hz",
          "cases": results, "summary": {"cases": len(results), "passed": sum(c["passed"] for c in results),
                                       "failed": sum(not c["passed"] for c in results)}}
args.output.write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps(output["summary"]))
sys.exit(0 if all(c["passed"] for c in results) else 1)
