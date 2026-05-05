"""
Build a Chinese-localized copy of Hipo/university-domains-list.

Reads:  data/world_universities_and_domains.json (download from upstream if missing)
Writes: data/world_universities_zh.json
Cache:  data/.world_universities_zh_translation_cache.json  (resume-safe)

- country_zh: CLDR zh_CN territory names (Babel) from alpha_two_code
- name_zh, state_province_zh: Google Translate via deep-translator (network)
"""

from __future__ import annotations

import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from babel.core import Locale

try:
    from deep_translator import GoogleTranslator
except ImportError:
    print("pip install deep-translator babel", file=sys.stderr)
    raise

UPSTREAM = (
    "https://raw.githubusercontent.com/Hipo/university-domains-list/master/"
    "world_universities_and_domains.json"
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SRC = DATA / "world_universities_and_domains.json"
OUT = DATA / "world_universities_zh.json"
CACHE = DATA / ".world_universities_zh_translation_cache.json"

SLEEP_SEC = 0.06


def ensure_source() -> None:
    if SRC.exists() and SRC.stat().st_size > 1_000_000:
        return
    from urllib.request import urlopen

    DATA.mkdir(parents=True, exist_ok=True)
    with urlopen(UPSTREAM, timeout=120) as resp:  # noqa: S310
        body = resp.read()
    SRC.write_bytes(body)
    print(f"Downloaded {SRC.name} ({len(body)} bytes)")


def territory_zh(alpha_two: str) -> str:
    loc = Locale.parse("zh_CN")
    code = (alpha_two or "").strip().upper()
    if not code:
        return ""
    name = loc.territories.get(code)
    if name:
        return name
    # CLDR sometimes omits deprecated codes
    if code == "UK":
        return loc.territories.get("GB", code)
    return code


def load_cache() -> dict[str, str]:
    if not CACHE.exists():
        return {}
    try:
        data = json.loads(CACHE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def save_cache(c: dict[str, str]) -> None:
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=0), encoding="utf-8")


def translate_unique(texts: set[str], cache: dict[str, str], label: str) -> None:
    t = GoogleTranslator(source="auto", target="zh-CN")
    pending = sorted(x for x in texts if x and x not in cache)
    total = len(pending)
    print(f"{label}: {total} strings to translate (cache hits: {len(texts) - total})")
    for i, raw in enumerate(pending):
        try:
            cache[raw] = t.translate(raw)
        except Exception as exc:  # noqa: BLE001
            cache[raw] = raw
            print(f"  [{i + 1}/{total}] translate failed ({raw[:40]}…): {exc}")
        if (i + 1) % 200 == 0:
            save_cache(cache)
            print(f"  … {i + 1}/{total}")
        time.sleep(SLEEP_SEC)
    save_cache(cache)


def main() -> None:
    ensure_source()
    rows = json.loads(SRC.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("unexpected JSON root")

    cache = load_cache()
    names = {str(r.get("name") or "") for r in rows}
    names.discard("")
    states = {str(r.get("state-province") or "") for r in rows if r.get("state-province")}

    translate_unique(names, cache, "name")
    translate_unique(states, cache, "state_province")

    out_rows: list[dict] = []
    for r in rows:
        code = str(r.get("alpha_two_code") or "")
        c_en = str(r.get("country") or "")
        sp = r.get("state-province")
        sp_s = str(sp) if sp else ""
        name = str(r.get("name") or "")
        item = {
            "name": name,
            "name_zh": cache.get(name, name),
            "country": c_en,
            "country_zh": territory_zh(code) or c_en,
            "alpha_two_code": code,
            "state_province": sp_s if sp else None,
            "state_province_zh": (cache.get(sp_s, sp_s) if sp_s else None),
            "domains": r.get("domains") or [],
            "web_pages": r.get("web_pages") or [],
        }
        out_rows.append(item)

    envelope = {
        "source": UPSTREAM,
        "upstream_repo": "https://github.com/Hipo/university-domains-list",
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "locale": "zh-CN",
        "notes": (
            "country_zh from CLDR (Babel zh_CN); "
            "name_zh and state_province_zh from Google Translate (deep-translator). "
            "Proper nouns may be imperfect—verify critical entries."
        ),
        "count": len(out_rows),
        "universities": out_rows,
    }
    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(envelope, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({len(out_rows)} records)")


if __name__ == "__main__":
    main()
