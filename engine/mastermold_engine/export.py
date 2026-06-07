"""Stage 4 file write: land the run bundle atomically in the data-drop directory.

The dashboard ingests the newest `engine-run-YYYY-MM-DD.json`. Writing is atomic
(temp file + rename) so the dashboard never reads a half-written bundle, and one file
per run date keeps ingestion idempotent (re-running a date overwrites it).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def out_dir() -> Path:
    """Resolve the data-drop directory: $ENGINE_OUT_DIR or engine/out next to this package."""
    env = os.environ.get("ENGINE_OUT_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parent.parent / "out"


def bundle_path(run_date: str, directory: Path | None = None) -> Path:
    return (directory or out_dir()) / f"engine-run-{run_date}.json"


def write_bundle(bundle: dict[str, Any], *, directory: Path | None = None) -> Path:
    """Validate-light then atomically write the bundle for its run date."""
    run_date = bundle["run"]["run_date"]
    target = bundle_path(run_date, directory)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(bundle, indent=2, sort_keys=False), encoding="utf-8")
    os.replace(tmp, target)  # atomic on POSIX
    return target
