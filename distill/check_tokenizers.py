"""Verify which LFM models can teach LFM2.5-230M with token-level KD.

Downloads only tokenizer.json / chat_template.jinja (a few MB), never weights.
Reproduces every claim in teachers.md.

    python3 check_tokenizers.py
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import re
import urllib.request

STUDENT = "LiquidAI/LFM2.5-230M"

CANDIDATES = [
    # (model, total params, active params)
    ("LiquidAI/LFM2-24B-A2B",         "24B",   "2.3B"),
    ("LiquidAI/LFM2.5-1.2B-Instruct", "1.17B", "1.17B"),
    ("LiquidAI/LFM2.5-1.2B-Thinking", "1.17B", "1.17B"),
    ("LiquidAI/LFM2.5-350M",          "350M",  "350M"),
    ("LiquidAI/LFM2-8B-A1B",          "8.3B",  "1.5B"),
    ("LiquidAI/LFM2.5-1.2B-Base",     "1.17B", "1.17B"),
    ("LiquidAI/LFM2-2.6B",            "2.6B",  "2.6B"),
    ("LiquidAI/LFM2.5-8B-A1B",        "8.3B",  "1.5B"),
    ("LiquidAI/LFM2.5-2.6B",          "2.69B", "2.69B"),
]


def _fetch(model: str, filename: str) -> bytes:
    url = f"https://huggingface.co/{model}/resolve/main/{filename}"
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read()


def vocab_and_merges(model: str) -> tuple[dict[str, int], list]:
    spec = json.loads(_fetch(model, "tokenizer.json"))
    vocab = dict(spec["model"]["vocab"])
    for t in spec.get("added_tokens", []):
        vocab[t["content"]] = t["id"]
    return vocab, spec["model"]["merges"]


def auto_opens_think(model: str) -> bool | None:
    """Does the generation prompt inject a <think> block?"""
    try:
        tmpl = _fetch(model, "chat_template.jinja").decode()
    except Exception:
        return None
    m = re.search(r"\{%-?\s*if add_generation_prompt.*", tmpl, re.S)
    return bool(m and "<think>" in m.group(0)[:200])


def compare(ref_v, ref_m, v, m):
    """Classify a candidate tokenizer against the student's."""
    if len(v) == len(ref_v) and all(v.get(k) == i for k, i in ref_v.items()):
        return ("IDENTICAL" if m == ref_m else "ids match, merges differ"), []
    misid = [k for k, i in ref_v.items() if k in v and v[k] != i]
    if misid:
        # is it one constant offset over the text vocabulary?
        offs = {v[k] - ref_v[k] for k in misid}
        note = f"remap needed ({len(offs)} offset(s): {sorted(offs)[:3]})"
        return note, sorted(set(ref_v) - set(v))
    return "same ids, different token set", sorted(set(ref_v) - set(v))


def main() -> None:
    models = [STUDENT] + [c[0] for c in CANDIDATES]
    with cf.ThreadPoolExecutor(6) as ex:
        toks = dict(zip(models, ex.map(vocab_and_merges, models)))
        thinks = dict(zip(models, ex.map(auto_opens_think, models)))

    ref_v, ref_m = toks[STUDENT]
    print(f"student {STUDENT.split('/')[-1]}: {len(ref_v)} vocab entries, "
          f"{len(ref_m)} merges, auto-<think>={thinks[STUDENT]}\n")
    print(f"{'model':26} {'total':>6} {'act':>6} {'vocab':>7} "
          f"{'<think>':>8}  tokenizer vs student")
    print("-" * 96)
    for name, total, active in CANDIDATES:
        v, m = toks[name]
        verdict, missing = compare(ref_v, ref_m, v, m)
        extra = f"  (missing {missing[:2]})" if missing and len(missing) <= 3 else (
            f"  ({len(missing)} student tokens absent)" if missing else "")
        print(f"{name.replace('LiquidAI/',''):26} {total:>6} {active:>6} "
              f"{len(v):>7} {str(thinks[name]):>8}  {verdict}{extra}")

    print("\nUsable for token-level KD with zero remapping:")
    for name, total, active in CANDIDATES:
        v, m = toks[name]
        verdict, _ = compare(ref_v, ref_m, v, m)
        if verdict == "IDENTICAL":
            print(f"  {name}  ({total} total / {active} active)")


if __name__ == "__main__":
    main()
