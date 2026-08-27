# Expanding the prompt set

`../training_prompts.txt` holds 1,211 hand-written visitor turns across 22
categories. That is enough to start on-policy distillation. This file is for
when you want more, and it is a rewrite of the `gen_prompts.py` prompt rather
than a tweak — the old one had four structural problems.

## What was wrong

**1. The anti-leak rule was fighting realism.** "Never state a fact from the
fact sheet inside a question" bans the way people actually type while reading
a page: *"i see he was at reality defender, what did he do there?"*. Forbidding
it forces quiz-show phrasing — "where does Amit work?" — that nobody types
into a chat widget.

The rule is right for an **eval** set, where a self-answering question really
measures nothing. It is close to irrelevant for a **training** set: the
student is learning to *respond*, not to guess a withheld answer, and the
teacher supplies the target either way. Narrow it to "no question whose answer
is entirely contained in itself" and let the rest be natural.

**2. No page context.** The visitor is looking at the portfolio. A live MNIST
VAE is training in the hero, there are three games, a koala, an achievement
system, and they just clicked through a 210 MB download to reach the chat.
None of that can emerge from a category called `projects` or `identity`. In
the hand-written set `page_context` is the second-largest category, and it is
the one the old generator could not have produced at all.

**3. Forty questions per call collapses to six ideas.** Asking one model for
40 questions about one abstract category in one call yields rephrasings, not
variety — temperature does not fix this, because the model conditions on the
39 it already wrote. Ask for 8–12 per call across many more, narrower calls.

**4. The failure surface was missing.** A 230M model does not break on "where
does Amit work". It breaks on vague asks, compound asks, false premises,
questions with no answer in the dossier, prompt injection, and anything that
tempts it into markdown or nine sentences. Those are where distillation buys
the most, and the old category list had almost none of them. It also had zero
low-effort turns — "hi", "test", "?" — which is what a real widget receives
more of than anything else.

## Revised generator

**System message**

    You write the messages that real visitors type into a small chat widget
    on one person's portfolio website. You are building a training set.

    Output messages only, one per line. Never answer them. No numbering, no
    bullets, no quotes, no commentary.

    These are chat messages, not survey questions. That means:
    - Many are not questions at all: greetings, fragments, reactions,
      keyboard-search strings, "test", "?".
    - People type lowercase, skip punctuation, and make typos. Include them.
      Do not clean anything up.
    - People reference what is on the screen in front of them.
    - Real messages are often lazy, blunt, or oddly specific.

    The only hard rule: never write a message whose answer is entirely
    contained in the message itself. "what does Maple LLM play?" is good —
    the answer is MapleStory and you must not say it. Referring to something
    visible on the page is fine and realistic.

    Write {N} messages. Do not repeat an idea with different wording — if you
    run out of distinct ideas, stop early.

**User message**

    CONTEXT (grounding only — do not answer anything, do not restate an
    answer inside a message)
    {fact_sheet}

    THE PAGE THE VISITOR IS LOOKING AT
    A one-page portfolio. The hero panel trains a real MNIST VAE live in the
    browser with a visible loss curve and a strip of generated digits. A
    Playground section holds three toys — a gradient-descent game, a
    real-vs-AI paper-title quiz, a Funko Pop generator — plus this chat, which
    the visitor started by downloading 210 MB. There is a koala mascot, an
    achievement/trophy system, hidden easter eggs, a Zotero-synced reading
    list, and a CV download.

    THIS BATCH
    Category: {category} — {category_description}
    Who is typing: {persona}
    How they type: {style}

    Write {N} messages.

**Call parameters.** `N = 10`, temperature `1.0`, top_p `0.95`. Cross the
category list with the persona and style lists and take a fresh cell per call
— many narrow calls, not few broad ones.

## Axes to cross

Use the 22 category names and weights from `training_prompts.txt` as the
category axis; the descriptions there explain what each one is for.

**Personas** — this axis did the most work in the hand-written set:

    a recruiter with a specific role to fill
    a hiring manager who does not know much ML
    an ML engineer checking whether the work is real
    a PhD student who wants the method details
    a bootcamp student looking for a path in
    a bored developer who found the site on Hacker News
    someone who came for the games and stayed
    a person who has read nothing on the page
    a sceptic who assumes the portfolio is inflated
    someone testing the model's limits for sport
    a non-native English speaker
    someone on a phone, one-thumbing it
    a fellow small-model enthusiast
    a journalist looking for an angle
    someone who thinks this is a general assistant

**Styles**

    blunt, 3-8 words
    polite one-liner
    lowercase, no punctuation, one typo
    fragment / keyword search, no verb
    long run-on with two or three things in it
    sceptical and slightly rude
    playfully teasing the tiny model
    over-formal, almost like an email
    voice-to-text, rambling but grammatical
    follow-up assuming earlier context

## Keep it honest

- **Deduplicate across rounds**, not just within a call. Normalise (lowercase,
  strip punctuation) and hash; a near-duplicate rate above ~15% per round
  means the axes are too coarse.
- **Hold the failure surface at ~35%** of the final mix. Generators drift
  toward pleasant factual questions because those are easier to write.
- **Keep an eval set strictly separate**, hand-written, with the *strict*
  no-leak rule and known-correct answers. Never sample it from the same
  generator you trained on.
- **Read 50 at random before using a round.** If you would not believe a
  human typed it, the round is bad — that judgement is faster and more
  reliable than any automatic filter.
