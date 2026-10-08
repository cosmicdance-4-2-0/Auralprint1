"""Validate already-built RC-20 artifacts; called after build in Linux/Windows CI."""
import json
import sys
from pathlib import Path

from distribution import verify_distribution

root = Path(__file__).resolve().parent.parent
try:
    result = verify_distribution(root / "dist", root / "src/assets/branding",
                                 (root / "version").read_text(encoding="utf-8").strip(),
                                 (root / ".build/auralprint.css").read_text(encoding="utf-8"),
                                 (root / ".build/auralprint.js").read_text(encoding="utf-8"))
except (OSError, ValueError) as error:
    sys.exit(f"Distribution verification failed: {error}")
print(json.dumps(result, indent=2))
