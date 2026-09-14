"""Shared helpers: DB connection, run logging, GitHub API access.

Stdlib only. Scripts run from anywhere; paths resolve relative to this file.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPTS_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
DB_PATH = DATA_DIR / "vantage.sqlite"
SCHEMA_PATH = SCRIPTS_DIR / "schema.sql"

GITHUB_API = "https://api.github.com"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def version_key(v: str) -> tuple:
    """Ordering key for semver-ish strings: '0.10.0' > '0.9.1'."""
    parts = []
    for p in v.strip().lstrip("v").split("."):
        num = ""
        for ch in p:
            if ch.isdigit():
                num += ch
            else:
                break
        parts.append(int(num) if num else 0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


class Run:
    """Context manager: one sync_run row per script execution."""

    def __init__(self, script: str):
        self.script = script
        self.con = connect()

    def __enter__(self) -> sqlite3.Connection:
        cur = self.con.execute(
            "INSERT INTO sync_run (script, started_at) VALUES (?, ?)",
            (self.script, now()),
        )
        self.con.commit()
        self.id = cur.lastrowid
        return self.con

    def finish(self, status: str, detail: str = "") -> None:
        self.con.execute(
            "UPDATE sync_run SET finished_at = ?, status = ?, detail = ? WHERE id = ?",
            (now(), status, detail, self.id),
        )
        self.con.commit()

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc_type is None:
            self.finish("ok")
        else:
            self.finish("error", f"{exc_type.__name__}: {exc}")
        self.con.close()
        return False  # propagate


def scratch_dir() -> Path:
    """Per-run scratch space outside the project (disposable git mirrors)."""
    base = Path(os.environ.get("TMPDIR") or tempfile.gettempdir()) / "vantage-releases-git"
    base.mkdir(parents=True, exist_ok=True)
    return base


def store_raw(con, run_id: int, kind: str, repo: str, identifier: str, payload) -> None:
    """Append one bronze row (immutable; newest fetched_at wins in transform)."""
    con.execute(
        "INSERT OR IGNORE INTO raw_payload (run_id, kind, repo, identifier, payload, fetched_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (run_id, kind, repo, str(identifier), json.dumps(payload), now()),
    )


# ------------------------------------------------------------------ github ---

_token_cache: str | None = None
_token_resolved = False


def github_token() -> str | None:
    """GITHUB_TOKEN if set, else the stored git credential for github.com.

    Private repos 404 on the unauthenticated API; the same credential the
    git clones use (osxkeychain etc.) unlocks them. Never logged.
    """
    global _token_cache, _token_resolved
    if _token_resolved:
        return _token_cache
    _token_resolved = True
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        _token_cache = tok
        return tok
    try:
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        r = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True, text=True, timeout=10, env=env)
        for line in r.stdout.splitlines():
            if line.startswith("password="):
                _token_cache = line.split("=", 1)[1]
                break
    except Exception:
        pass
    return _token_cache


def _headers() -> dict[str, str]:
    h = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "vantage-releases-pipeline",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = github_token()
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def gh_get(path: str) -> object:
    """GET one API resource (path starts with /). Handles rate limits."""
    url = GITHUB_API + path
    for attempt in range(3):
        req = urllib.request.Request(url, headers=_headers())
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) and e.headers.get("x-ratelimit-remaining") == "0":
                reset = int(e.headers.get("x-ratelimit-reset", time.time() + 60))
                wait = max(reset - time.time(), 1)
                print(f"  rate limited, sleeping {wait:.0f}s", file=sys.stderr)
                time.sleep(wait)
                continue
            if e.code >= 500 and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError(f"github GET failed after retries: {path}")


def gh_get_paged(path: str, per_page: int = 100) -> list:
    """GET a paginated list resource, following ?page= pagination."""
    items: list = []
    page = 1
    while True:
        sep = "&" if "?" in path else "?"
        batch = gh_get(f"{path}{sep}per_page={per_page}&page={page}&state=all")
        if not batch:
            return items
        items.extend(batch)
        if len(batch) < per_page:
            return items
        page += 1


def http_get_json(url: str, headers: dict | None = None) -> object:
    """GET any JSON API (non-GitHub). Retries briefly on 5xx."""
    h = {"User-Agent": "vantage-releases-pipeline", "Accept": "application/json"}
    h.update(headers or {})
    for attempt in range(3):
        req = urllib.request.Request(url, headers=h)
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code >= 500 and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError(f"GET failed after retries: {url}")


def gh_get_content(repo: str, ref: str, file_path: str) -> str:
    """Fetch a file's contents at a ref, base64-decoded."""
    data = gh_get(f"/repos/{repo}/contents/{file_path}?ref={urllib.parse.quote(ref)}")
    import base64
    return base64.b64decode(data["content"]).decode()
