"""Contexts for Tiny Amit's on-policy context distillation.

    from contexts import TEACHER_CONTEXT, STUDENT_CONTEXT, build_vocab_map

TEACHER_CONTEXT goes to LFM2.5-2.6B while it produces distillation targets.
STUDENT_CONTEXT goes to LFM2.5-230M — at training time *and* in the browser;
the two must match exactly or the distillation is undone by prompt drift.

Run this file directly to verify both contexts and the vocab mapping.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
SITE = HERE.parent

STUDENT_ID = "LiquidAI/LFM2.5-230M"

# Primary teacher: 104x the student, and byte-identical tokenizer + merges, so
# token-level KD needs no remapping. See teachers.md / check_tokenizers.py.
TEACHER_ID = "LiquidAI/LFM2-24B-A2B"

# Teachers that share the student's tokenizer exactly (no alignment needed).
SAME_TOKENIZER_TEACHERS = (
    "LiquidAI/LFM2-24B-A2B",          # 24B total / 2.3B active
    "LiquidAI/LFM2.5-1.2B-Instruct",  # newest post-training, laptop-friendly
    "LiquidAI/LFM2.5-1.2B-Thinking",
    "LiquidAI/LFM2.5-350M",
)

# Teachers on the 128k vocabulary: stronger published instruction-following,
# but their logits need build_vocab_map() before any KL.
REMAP_TEACHERS = (
    "LiquidAI/LFM2.5-8B-A1B",         # best published IFEval in the family
    "LiquidAI/LFM2.5-2.6B",           # also auto-opens a <think> block
)

# Measured: the whole text vocabulary (student ids 501..64393, 63,893 tokens)
# maps to the teacher with a single constant offset, no exceptions.
VOCAB_OFFSET = -501
VOCAB_OFFSET_RANGE = (501, 64393)

# Control-token blocks sit outside that range and each carry their own offset,
# so build_vocab_map matches on token strings instead. Kept for sanity checks.
SPECIAL_MAP = {
    1: 124894,   # <|startoftext|>
    6: 124899,   # <|im_start|>
    7: 124900,   # <|im_end|>
    64400: 124901,  # <think>   — suppress these during distillation
    64401: 124902,  # </think>
}

# Ban these in the student sampler and strip them from teacher targets: the
# teacher's chat template opens a thinking block by default, and the browser
# UI would render it as literal text.
THINK_TOKEN_IDS = (64400, 64401)


def _read(name: str) -> str:
    return (HERE / name).read_text(encoding="utf-8")


def _prompt_block(md: str) -> str:
    """Pull the literal prompt out of student_context.md."""
    m = re.search(r"<!-- BEGIN PROMPT -->\n(.*?)\n<!-- END PROMPT -->", md, re.S)
    if not m:
        raise ValueError("student_context.md is missing its PROMPT markers")
    return m.group(1).strip()


def _dossier_body(md: str) -> str:
    """Drop the file's own explanatory header, keep the dossier itself."""
    return md.split("---", 1)[1].strip() if "---" in md else md.strip()


TEACHER_CONTEXT = _dossier_body(_read("teacher_context.md"))
STUDENT_CONTEXT = _prompt_block(_read("student_context.md"))


def site_system_prompt() -> str | None:
    """The SYSTEM constant currently shipping in assets/playground.js."""
    js = (SITE / "assets" / "playground.js").read_text(encoding="utf-8")
    m = re.search(r"const SYSTEM = \[(.*?)\]\.join\('\\n'\)", js, re.S)
    if not m:
        return None
    lines = re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(1))
    return "\n".join(l.replace("\\'", "'").replace("\\\\", "\\") for l in lines)


def check_in_sync() -> bool:
    """True when the browser prompt matches STUDENT_CONTEXT."""
    live = site_system_prompt()
    return live is not None and " ".join(live.split()) == " ".join(STUDENT_CONTEXT.split())


def load_vocab(model_id: str) -> dict[str, int]:
    """Full vocab (base + added tokens) straight from the hub's tokenizer.json.

    Deliberately avoids transformers: LFM2.5 needs transformers>=5.0.0 for its
    TokenizersBackend, and this check should run regardless.
    """
    import urllib.request
    url = f"https://huggingface.co/{model_id}/resolve/main/tokenizer.json"
    with urllib.request.urlopen(url, timeout=180) as r:
        spec = json.load(r)
    vocab = dict(spec["model"]["vocab"])
    for t in spec.get("added_tokens", []):
        vocab[t["content"]] = t["id"]
    return vocab


def build_vocab_map(s_vocab: dict[str, int], t_vocab: dict[str, int]):
    """student vocab id -> teacher vocab id, for aligning logits.

    Takes two {token: id} dicts (see load_vocab). Returns (mapping, unmapped)
    where mapping[student_id] is the teacher id, or -1 when the token has no
    teacher counterpart (mask those out of the KL). Matches on token strings
    rather than trusting the constant offset.
    """
    size = max(s_vocab.values()) + 1
    mapping = [-1] * size
    unmapped = []
    for tok, sid in s_vocab.items():
        tid = t_vocab.get(tok)
        if tid is None:
            tid = SPECIAL_MAP.get(sid)
        if tid is None:
            unmapped.append(tok)
            continue
        mapping[sid] = tid
    return mapping, unmapped


def remap_ids(student_ids, mapping):
    """Rewrite a student token sequence into teacher ids.

    Feed the teacher *this*, not its own re-tokenization of the text: the two
    tokenizers have different merges, so re-tokenizing would not line up
    token-for-token with the student's sequence.
    """
    out = []
    for i in student_ids:
        t = mapping[i] if i < len(mapping) else -1
        if t < 0:
            raise ValueError(f"student token id {i} has no teacher counterpart")
        out.append(t)
    return out


if __name__ == "__main__":
    approx = lambda s: len(s) // 4
    print(f"teacher_context : {len(TEACHER_CONTEXT.split()):>5} words  ~{approx(TEACHER_CONTEXT):>5} tokens")
    print(f"student_context : {len(STUDENT_CONTEXT.split()):>5} words  ~{approx(STUDENT_CONTEXT):>5} tokens")
    print(f"compression     : {len(TEACHER_CONTEXT)/len(STUDENT_CONTEXT):.1f}x")

    live = site_system_prompt()
    if live is None:
        print("\nplayground.js  : SYSTEM constant not found")
    elif check_in_sync():
        print("\nplayground.js  : in sync with student_context ✓")
    else:
        print("\nplayground.js  : OUT OF SYNC with student_context")
        print(f"                 live prompt is {len(live.split())} words, "
              f"student_context is {len(STUDENT_CONTEXT.split())}")
        print("                 (expected until the distilled model ships)")

    try:
        sv, tv = load_vocab(STUDENT_ID), load_vocab(TEACHER_ID)
    except Exception as e:                       # offline is fine
        print(f"\nvocab map      : skipped ({type(e).__name__})")
        raise SystemExit(0)

    mapping, unmapped = build_vocab_map(sv, tv)
    mapped = sum(1 for m in mapping if m >= 0)
    print(f"\nvocab map      : {mapped}/{len(mapping)} student ids mapped "
          f"({100 * mapped / len(mapping):.1f}%), {len(unmapped)} without a "
          f"teacher counterpart")

    lo, hi = VOCAB_OFFSET_RANGE
    shared = [(sid, tv[tok]) for tok, sid in sv.items() if tok in tv]
    text = [(a, b) for a, b in shared if lo <= a <= hi]
    text_offsets = {b - a for a, b in text}
    blocks = {}
    for a, b in shared:
        blocks[b - a] = blocks.get(b - a, 0) + 1

    if text_offsets == {0} and len(blocks) == 1:
        print(f"alignment      : identity over all {len(shared)} shared ids — "
              f"no remap needed ✓")
    elif text_offsets == {VOCAB_OFFSET}:
        print(f"alignment      : ids {lo}-{hi}: {len(text)} text tokens at "
              f"offset {VOCAB_OFFSET} ✓ (remap required)")
        print("                 blocks: "
              + ", ".join(f"{d:+}({n})" for d, n in
                          sorted(blocks.items(), key=lambda kv: -kv[1])))
    else:
        print(f"alignment      : unexpected — text offsets {text_offsets}, "
              f"{len(blocks)} blocks; re-check teachers.md")

    if TEACHER_ID in REMAP_TEACHERS:
        for name, sid in (("<|im_start|>", 6), ("<|im_end|>", 7)):
            print(f"                 {name} {sid} -> {mapping[sid]} "
                  f"(SPECIAL_MAP says {SPECIAL_MAP.get(sid)})")
