# Tiny Amit — on-policy context distillation

Goal: make the 230M chat on the portfolio site noticeably better without
making it bigger or slower, by distilling a **much larger LFM** (teacher,
holding a full dossier about Amit) into **LFM2.5-230M** (student, holding a
short prompt).

Teacher choice and the evidence behind it: **[`teachers.md`](teachers.md)**.
Short version — `LFM2-24B-A2B` is 104× the student and shares its tokenizer
byte-for-byte, so token-level KD needs no remapping at all.

The knowledge moves from the teacher's *prompt* into the student's *weights*.
That is the whole trick, and it is why the two contexts are different lengths
on purpose.

| | teacher | student |
|---|---|---|
| model | `LiquidAI/LFM2-24B-A2B` (24B total, 2.3B active, 32k ctx) | `LiquidAI/LFM2.5-230M` (230M, 14 layers) |
| context file | `teacher_context.md` (~3.8k tokens) | `student_context.md` (~500 tokens) |
| role | writes the target answers | learns to produce them from a short prompt |
| runs on | GPU box, `transformers>=5.0.0` / vLLM | the visitor's browser, ONNX q4 + WebGPU |

## The two contexts

**`teacher_context.md`** — the full record: Tiny Amit's identity, Amit's bio
and career with dates, education, every project with real technical detail
and numbers, the website itself (including the live MNIST VAE in the hero and
the Playground toys), the public links, hard boundaries on what must never be
invented or disclosed, and an explicit output contract.

**`student_context.md`** — the same facts compressed ~7.6x: identity, the
career spine, a bare list of project names, contact, and the identical style
and safety rules. This is the prompt that actually ships in the browser.

Two rules keep this honest:

1. **No fact in `student_context` may contradict `teacher_context`.** The
   student prompt is a strict semantic subset.
2. **§8 of the teacher context (output contract) and the "How to answer"
   paragraph of the student context must say the same thing.** The teacher is
   explicitly told to answer *as the student would* — plain text, 1–3
   sentences, no `<think>` block. A teacher writing long markdown essays is
   an unlearnable target for a 230M model; matching the format is what makes
   the KL trainable.

The student prompt must stay byte-identical to the `SYSTEM` constant in
`assets/playground.js`, and identical between training and inference — drift
there reintroduces exactly the train/test mismatch distillation is meant to
remove. `contexts.py` has a check for this.

## Recipe

1. **Prompt set.** A few thousand realistic visitor turns. Cover: who is
   Amit / where does he work; each project by name and by vague description
   ("that Funko thing", "the MapleStory bot"); the website's own mechanics;
   general ML questions; multi-turn follow-ups; and — importantly — the
   questions that *must* fail gracefully: salary, personal life, phone
   number, "write me a Python script", prompt-injection attempts. Roughly
   70% in-scope / 30% boundary probes.
2. **Sample on-policy.** The **student** (with `student_context`) samples
   k≈4 responses per prompt at temperature ~0.9. The trajectories come from
   the student's own distribution — that is the "on-policy" part, and it is
   what makes this work better than plain SFT on teacher text: the student
   gets corrected on the mistakes it actually makes.
3. **Score with the teacher.** Run the **teacher** (with `teacher_context`)
   in a single forward pass over the student's sampled tokens and take
   per-token log-probs over the vocabulary. Suppress `<think>` — LFM2.5-2.6B
   opens a thinking block by default in its chat template.
4. **Loss.** Per-token reverse KL between student and teacher distributions
   on the student's own tokens. Warm-starting with one off-policy SFT epoch
   on teacher-written answers converges faster; then switch to on-policy.
5. **Eval.** A held-out question set scored for factual accuracy against
   `teacher_context`, format compliance (plain text, ≤60 words), and refusal
   behaviour on the boundary probes. Compare against today's prompt-only
   230M baseline.
6. **Ship.** Export to ONNX q4, drop into `assets/playground.js`, and verify
   in the browser with `.verify/slm.mjs` (must run headed — headless
   Chromium only has software WebGPU).

## Tokenizers

`LFM2.5-230M` uses a **65,536** vocabulary (its embeddings are tied and its
hidden size is 1024, so a 128k vocab would cost more than half the model).
Part of the LFM family shares that tokenizer and part does not, which decides
whether token-level KD works directly.

Measured with `python3 check_tokenizers.py`:

- **Identical ids *and* merges to the student** — `LFM2-24B-A2B`,
  `LFM2.5-1.2B-Instruct`, `LFM2.5-1.2B-Thinking`, `LFM2.5-350M`. Token-level
  KL works with no alignment code whatsoever.
- **Identical except the two `<think>` tokens** — `LFM2-8B-A1B`,
  `LFM2.5-1.2B-Base`. Trivially reconcilable.
- **Different tokenizer (128k vocab)** — `LFM2.5-8B-A1B`, `LFM2.5-2.6B`.
  Usable, but needs a remap.

Since a zero-remap teacher exists at 24B, prefer it. The remap path is kept
in `contexts.py` for the 128k-vocab models, because `LFM2.5-8B-A1B` has the
best published instruction-following in the family and may still be worth it:

> 99.4% of student ids exist in those vocabularies, and the entire text
> vocabulary (63,893 tokens, ids 501–64,393) maps by a single constant offset,
> `teacher_id = student_id − 501`, with no exceptions in that range. Control
> blocks each carry their own offset, so `build_vocab_map()` matches on token
> strings rather than arithmetic. The catch is that those models have
> different BPE merges (293,320 vs 63,683), so feed the teacher the
> **student's** token sequence remapped into teacher ids — not the teacher's
> own re-tokenization of the text — or the sequences will not line up
> token-for-token. That remapped sequence is a valid but non-canonical
> tokenization for the teacher: a mild distribution shift, normal in
> cross-tokenizer KD.

Whichever teacher you pick, suppress `<think>` / `</think>` (student ids
64,400 / 64,401) on both sides. Only `LFM2.5-2.6B` auto-opens a thinking
block in its generation prompt, but the output contract forbids visible
reasoning either way, and the browser would render it as literal text.

If tokenizer handling ever becomes the bottleneck, the escape hatch is
sequence-level KD: train the student on teacher-written *text* with plain
cross-entropy. It loses the per-token signal and is completely immune to
tokenizer mismatch — which is also why the warm-start stage in step 4 can use
any teacher at all, regardless of vocabulary.

## Files

- `teacher_context.md` — full dossier for the 2.6B teacher
- `student_context.md` — compressed prompt for the 230M student, between
  `<!-- BEGIN PROMPT -->` / `<!-- END PROMPT -->` markers
- `contexts.py` — loads both, checks the student prompt against
  `playground.js`, and builds the student→teacher vocab map
- `teachers.md` — teacher survey: tokenizer compatibility across the LFM
  family, published benchmarks, and the recommendation
- `check_tokenizers.py` — reproduces every claim in `teachers.md`
  (downloads tokenizers only, never weights)

## Sources

Facts were assembled from `index.html` (all sections, including "Read more"
bodies) and the CV PDFs in `assets/` — `AmitIsraeliCV_15_20_2025.pdf` and
`Amit-Israeli-FlowCV-Resume-20251210.pdf`, which mirror the LinkedIn profile.
LinkedIn itself needs authentication, so it was not scraped; anything on the
profile that is not in those CVs is missing and worth adding by hand.

Two deliberate omissions: the phone number that appears on the CVs is **not**
in either context (it would be handed to anyone who asks a public chatbot),
and the Wix role is described only as far as the public site describes it.
