# Picking the teacher

The original plan used `LFM2.5-2.6B`, which has a **different tokenizer** from
the 230M student — 128,000 vocab vs 65,536 — forcing a logit remap.

It turns out that is avoidable. Several stronger LFM models share the
student's tokenizer **exactly**. Everything below was measured, not read off
a model card; `python3 check_tokenizers.py` reproduces all of it.

## Why the 230M has a small vocab

The student ties its input and output embeddings, and its hidden size is
1024. A 128k vocab would cost 131M embedding parameters — more than half the
whole 230M model. At 65,536 it costs 67M. The small vocab isn't an oversight,
it's forced by the parameter budget, which is why only some of the family
shares it.

## Tokenizer compatibility, measured

Reference: `LFM2.5-230M` — 64,402 vocab entries, 63,683 merges.
"identical" below means every token string maps to the same id *and* the
merge list is byte-identical.

| model | total | active | vocab | tokenizer vs student | chat template |
|---|---|---|---|---|---|
| **LFM2-24B-A2B** | 24B | 2.3B | 65,536 | **identical** | no auto-`<think>` |
| **LFM2.5-1.2B-Instruct** | 1.17B | 1.17B | 65,536 | **identical** | no auto-`<think>` |
| **LFM2.5-1.2B-Thinking** | 1.17B | 1.17B | 65,536 | **identical** | no auto-`<think>` |
| LFM2.5-350M | 350M | 350M | 65,536 | **identical** | no auto-`<think>` |
| LFM2-8B-A1B | 8.3B | 1.5B | 65,536 | identical except `<think>`/`</think>` | — |
| LFM2.5-1.2B-Base | 1.17B | 1.17B | 65,536 | identical except `<think>`/`</think>` | base model |
| LFM2-2.6B / 1.2B / 700M / 350M | — | — | 65,536 | 3 tokens differ | LFM2 gen |
| LFM2.5-8B-A1B | 8.3B | 1.5B | 128,000 | **needs −501 remap** | — |
| LFM2.5-2.6B *(original pick)* | 2.69B | 2.69B | 128,000 | **needs −501 remap** | **auto-opens `<think>`** |

So the 24B MoE — **104× the student's parameter count** — is a drop-in
teacher: same ids, same merges, same prompt format. No remap, no masking, no
non-canonical-segmentation shift.

## Published benchmarks

Instruction-following is the metric that matters here. The task is "read a
3.6k-token dossier, answer in 1–3 plain-text sentences, never invent" — not
math, not code, not world knowledge.

| model | IFEval | IFBench | Multi-IF | MMLU-Pro | train tokens | ctx |
|---|---|---|---|---|---|---|
| LFM2.5-8B-A1B | **91.84** | 56.47 | 79.93 | — | 38T | 128k |
| LFM2.5-1.2B-Thinking | 88.42 | 44.85 | — | 49.65 | — | 32k |
| LFM2.5-1.2B-Instruct | 86.23 | 47.33 | 60.98 | 44.35 | 28T | 32k |
| LFM2.5-2.6B | — | 59.17 | 80.07 | — | 34T | 131k |
| LFM2-8B-A1B | 77.58 | — | — | MMLU 64.84 | — | 32k |
| **LFM2-24B-A2B** | **not published** | — | — | — | 17T | 32k |

Two things to read off this table:

- **LFM2.5-8B-A1B dominates the original LFM2.5-2.6B pick**: higher IFEval,
  38T vs 34T training tokens, and *fewer active parameters* (1.5B vs 2.69B),
  so it is both better and cheaper. Same tokenizer as the 2.6B, so the same
  −501 remap applies. If you keep the remap path, use this instead of 2.6B.
- **LFM2 generation is weaker at instruction-following than LFM2.5** at
  comparable size (LFM2-8B-A1B 77.58 vs LFM2.5-1.2B 86.23, at 7× the
  parameters). That is the risk with LFM2-24B-A2B: enormous capacity, older
  post-training, and no published numbers to check it against.

## Recommendation

**Use `LFM2-24B-A2B` as the primary teacher**, and settle the LFM2-vs-LFM2.5
question with a bake-off rather than a guess.

Why it wins on the things that are certain: identical tokenizer and merges
(clean token-level KL, no remap code, no segmentation shift), identical
prompt format, 104× capacity for holding the dossier, ~2.3B active
parameters so inference is cheap, and 32k context is ample for a 3.6k-token
dossier.

**Run a bake-off first.** It costs an afternoon and removes the guesswork:
take ~40 questions spanning the categories in the prompt set, generate
answers from each candidate with `teacher_context`, and score faithfulness to
the dossier, format compliance, and refusal behaviour on the boundary probes.

Candidates worth putting in it:

1. `LFM2-24B-A2B` — perfect tokenizer, biggest capacity
2. `LFM2.5-1.2B-Instruct` — perfect tokenizer, newest post-training
3. `LFM2.5-1.2B-Thinking` — perfect tokenizer, reasoning
4. `LFM2.5-8B-A1B` — best published instruction-following, needs the remap

If the 24B wins or ties, take it and delete the remap code. If a 1.2B wins,
that is an even better outcome: the whole pipeline then runs on a laptop.

## The capacity-gap caveat

A 104× teacher/student gap is large, and knowledge distillation has a known
failure mode where a very strong teacher transfers *worse* into a tiny
student than a mid-sized one — the student cannot represent the teacher's
distribution, so the KL target is partly unreachable.

The convenient part: because `230M`, `350M`, `1.2B-Instruct`,
`1.2B-Thinking` and `24B-A2B` all share one tokenizer, a **teacher-assistant
ladder** needs no tokenizer work at all:

    LFM2-24B-A2B  →  LFM2.5-1.2B-Instruct  →  LFM2.5-230M

Distil the 24B into the 1.2B first, then the 1.2B into the 230M. Try the
direct 24B → 230M hop first; only reach for the ladder if the direct hop
plateaus.

## One more thing that changes the plan

Tokenizer alignment **only matters for logit-level KD**. If a stage trains
the student on the teacher's *text* with plain cross-entropy — the
sequence-level warm start in step 4 of the README — then any teacher works,
tokenizer be damned.

So the stages can use different teachers:

- **Warm-start SFT (sequence-level):** whichever model writes the best
  answers. `LFM2.5-8B-A1B` is the strongest published instruction-follower in
  the family, and the tokenizer mismatch is irrelevant here.
- **On-policy KL (logit-level):** `LFM2-24B-A2B`, for the exact tokenizer.

## Notes for whichever you pick

- Every LFM chat template uses Jinja `{% generation %}` tags, which
  transformers.js cannot parse — the browser code already hand-builds its
  ChatML prompt for this reason. Server-side `transformers>=5.0.0` handles
  them fine.
- Only `LFM2.5-2.6B` auto-opens a `<think>` block in its generation prompt
  (`<|im_start|>assistant\n<think>`). `LFM2-24B-A2B`, `LFM2.5-1.2B-Instruct`
  and — despite the name — `LFM2.5-1.2B-Thinking` do not. Suppress
  `<think>`/`</think>` (student ids 64,400 / 64,401) anyway: the output
  contract forbids visible reasoning, and the browser would render it as
  literal text.
- Recommended sampling per card: LFM2-24B-A2B temp 0.1 / top-k 50 / rep 1.05;
  LFM2.5-1.2B-Instruct temp 0.1 / top-k 50 / rep 1.05; LFM2.5-8B-A1B temp 0.2
  / top-k 80 / rep 1.05. For *teacher scoring* you want distributions, not
  samples — run a single forward pass and read logits rather than generating.
- Licenses differ across the family: LFM2 models are "LFM Open License v1.0",
  LFM2.5 models are "LFM1.0". Check the terms for a distilled derivative you
  ship publicly before committing.
