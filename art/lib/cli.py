"""Command line for asset scripts run as `blender -b --factory-startup --python <script> -- ...`."""

import argparse
import sys
import traceback
from pathlib import Path

from .export import GLTF_TRANSFORM

ART = Path(__file__).resolve().parent.parent
REPO = ART.parent


def asset_args(name):
    """Parse the arguments after Blender's `--` separator, failing early without gltf-transform."""
    if not GLTF_TRANSFORM.exists():
        sys.exit(f"{GLTF_TRANSFORM} is missing. Run `npm ci` in {ART} first.")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog=f"art/{name}.py")
    parser.add_argument("--out", type=Path, default=REPO / "public" / "models" / f"{name}.glb")
    parser.add_argument("--preview", type=Path, default=ART / "previews" / f"{name}.png")
    return parser.parse_args(argv)


def run(main):
    """Run `main` and exit non-zero on any error.

    Blender's `--python` prints an uncaught exception and still exits 0, which would let
    a broken build look like a passing one.
    """
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
