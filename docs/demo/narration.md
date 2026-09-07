# BLACKBOOK — Demo Narration

Target: ~2:30, hard ceiling 3:00. Nine scenes.

**Voice rules applied throughout.** One idea per sentence. No filler, no hype adjectives, no
reading the UI aloud. Narration carries the *why*; the screen carries the *what*. Nothing is
spoken over a moment the viewer needs to read — the pauses in `narration.json` are placed at
those points deliberately.

Machine-readable copy of this script lives in `demo/narration.json`; that file is the single
source of truth for the recorder and the subtitle generator. **Edit both together.**

---

### Scene 01 — `intro` · the problem

> A studio development team decides whether to chase a book, a comic, or a format. Those calls
> are worth millions, and the research behind them sits in trade articles and someone's
> memory. BLACKBOOK researches an intellectual property, makes the call, records why, and
> watches for the moment that call stops being right.

*Hook. Establishes the problem before showing any UI.*

---

### Scene 02 — `command-center` · what the system holds

> Every decision the system has ever made is here. Each one carries a recommendation — pursue,
> watch, or pass — a score out of a hundred, and the four components underneath it: market
> opportunity, rights confidence, competition, and production feasibility.

*Action + result. Names the vocabulary the rest of the video depends on.*

---

### Scene 03 — `deterministic` · the core claim

> Gemini scores those four components and explains its reasoning. It never picks the final
> number. A fixed weighted function in our own code turns those components into the score and
> the recommendation. The model explains; the system decides. The same inputs always produce
> the same decision.

*Why it matters. This is the load-bearing claim of the whole project.*

---

### Scene 04 — `evidence` · structure over prose

> Behind every decision is an evidence graph. Each claim is a node with a typed relationship
> to another, not a paragraph of summary text.

*Transition into provenance. Short, because the graph needs looking at.*

---

### Scene 05 — `evidence-node` · provenance

> Open any node and you get the source, when it was published, when we observed it, a
> confidence level, and the exact sentence the claim came from. Nothing in a decision is
> unattributed.

*Result + why it matters. The pause after "unattributed" lets the panel be read.*

---

### Scene 06 — `counterfactual` · stress testing

> The stress test asks what would have to change for this call to flip. Every scenario runs
> through the same scoring function as the real decision, so these numbers are exactly what
> the engine would produce. The smallest change that moves this off pursue is a thirty point
> drop in market opportunity.

*Hook + action + result. States the smallest-flip claim the engine now actually guarantees.*

---

### Scene 07 — `floor` · refusing to invent

> When nothing can flip a recommendation, the system says so. It reports how much margin is
> left instead of inventing a change that does not exist.

*Why it matters. Honesty as a feature.*

---

### Scene 08 — `drift` · the agentic loop

> Decisions do not stay correct. A Parallel monitor watches the web for events touching this
> property. Each event carries its own provenance, is de-duplicated so one story never fires
> twice, and is tested for materiality before anything changes.

*Hook + action. The differentiator.*

---

### Scene 09 — `close` · the payoff

> The result is a decision that keeps a memory. This property went from pursue, to watch when
> a competing adaptation was announced, to pass when the rights were sold. Three linked
> revisions, every one evidenced and explained.

*Result + why it matters. Lands on the through-line from Scene 01.*

---

## Words deliberately avoided

`revolutionary`, `seamless`, `powerful`, `cutting-edge`, `simply`, `just`, `as you can see`,
`here we have`, `let's take a look`. Every sentence states a fact about the system or the
problem.

## Pronunciation notes for TTS

- Write "intellectual property" in full rather than "IP", which the synthesiser reads as a
  network term.
- "de-duplicated" is hyphenated so it is not read as one word.
- Numbers under a hundred are spelled out ("thirty point") so the cadence matches speech.
