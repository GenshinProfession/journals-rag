"""
Build a Chinese-localized copy of Hipo/university-domains-list.

Reads:  data/world_universities_and_domains.json (download from upstream if missing)
Writes: data/world_universities_zh.json
Cache:  data/.world_universities_zh_translation_cache.json  (resume-safe)

- country_zh: CLDR zh_CN territory names (Babel) for all rows
- name_zh / state_province_zh: machine translation **only** for CN / HK / MO / TW;
  other countries keep English in name_zh and omit state_province_zh (null).
"""

from __future__ import annotations

import json
import re
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

CHINA_REGION_CODES = frozenset({"CN", "HK", "MO", "TW"})

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


def _has_cjk(s: str) -> bool:
    return bool(re.search(r"[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]", s))


def _looks_like_english_phrase(s: str) -> bool:
    letters = len(re.findall(r"[A-Za-z]", s))
    return letters >= 4 and not _has_cjk(s)


def translate_phrase_to_zh(raw: str) -> str:
    """
    English institution names: en→zh-CN first, then auto if output still lacks CJK.
    Already-CJK strings: auto only. Retries; does not cache identity on transient errors.
    """
    raw = raw.strip()
    if not raw:
        return raw

    prefer_en = _looks_like_english_phrase(raw)
    last_err: Exception | None = None
    for attempt in range(3):
        time.sleep(SLEEP_SEC * (attempt + 0.5))
        try:
            if prefer_en:
                out = GoogleTranslator(source="en", target="zh-CN").translate(raw)
                if out.strip() == raw.strip() or not _has_cjk(out):
                    out2 = GoogleTranslator(source="auto", target="zh-CN").translate(raw)
                    if _has_cjk(out2) or (out2.strip() != raw.strip() and out2.strip()):
                        out = out2
            else:
                out = GoogleTranslator(source="auto", target="zh-CN").translate(raw)
            if out and out.strip():
                return out.strip()
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(0.4 * (attempt + 1))

    print(f"  translate failed after retries ({raw[:48]}…): {last_err}")
    return raw


def purge_stale_identity_entries(cache: dict[str, str], texts: set[str]) -> int:
    removed = 0
    for key in list(texts):
        if key and cache.get(key) == key:
            del cache[key]
            removed += 1
    return removed


def translate_unique(texts: set[str], cache: dict[str, str], label: str) -> None:
    if not texts:
        print(f"{label}: nothing to translate")
        return
    stale = purge_stale_identity_entries(cache, texts)
    if stale:
        print(f"{label}: dropped {stale} stale cache entries (value==key, will re-translate)")

    pending = sorted(x for x in texts if x and x not in cache)
    total = len(pending)
    print(f"{label}: {total} strings to translate (cache hits: {len(texts) - total})")
    for i, raw in enumerate(pending):
        cache[raw] = translate_phrase_to_zh(raw)
        if (i + 1) % 50 == 0:
            save_cache(cache)
            print(f"  … {i + 1}/{total}")
        time.sleep(SLEEP_SEC)
    save_cache(cache)


def main() -> None:
    ensure_source()
    rows = json.loads(SRC.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("unexpected JSON root")

    china_rows = [
        r
        for r in rows
        if str(r.get("alpha_two_code") or "").strip().upper() in CHINA_REGION_CODES
    ]

    cache = load_cache()
    names_cn = {str(r.get("name") or "") for r in china_rows}
    names_cn.discard("")
    states_cn = {
        str(r.get("state-province") or "")
        for r in china_rows
        if r.get("state-province")
    }

    translate_unique(names_cn, cache, "name (CN/HK/MO/TW only)")
    translate_unique(states_cn, cache, "state_province (CN/HK/MO/TW only)")

    out_rows: list[dict] = []
    for r in rows:
        code = str(r.get("alpha_two_code") or "").strip().upper()
        c_en = str(r.get("country") or "")
        sp = r.get("state-province")
        sp_s = str(sp) if sp else ""
        name = str(r.get("name") or "")
        is_cn_region = code in CHINA_REGION_CODES

        if is_cn_region:
            name_zh = cache.get(name, name)
            state_province_zh = cache.get(sp_s, sp_s) if sp_s else None
        else:
            name_zh = name
            state_province_zh = None

        item = {
            "name": name,
            "name_zh": name_zh,
            "country": c_en,
            "country_zh": territory_zh(code) or c_en,
            "alpha_two_code": code,
            "state_province": sp_s if sp else None,
            "state_province_zh": state_province_zh,
            "domains": r.get("domains") or [],
            "web_pages": r.get("web_pages") or [],
        }
        out_rows.append(item)

    envelope = {
        "source": UPSTREAM,
        "upstream_repo": "https://github.com/Hipo/university-domains-list",
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "locale": "zh-CN",
        "translation_policy": (
            "country_zh: CLDR (Babel zh_CN) for all rows. "
            "name_zh / state_province_zh: Google Translate only when alpha_two_code is "
            "CN, HK, MO, or TW; elsewhere name_zh equals name and state_province_zh is null."
        ),
        "china_region_codes": sorted(CHINA_REGION_CODES),
        "count": len(out_rows),
        "china_region_count": len(china_rows),
        "universities": out_rows,
    }
    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(envelope, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({len(out_rows)} records, {len(china_rows)} in CN/HK/MO/TW)")


if __name__ == "__main__":
    main()
