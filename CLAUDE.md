# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file React component (`mens-rg-scorer.tsx`) that calculates competition scores for Japanese **men's rhythmic gymnastics** (男子新体操), individual mode. The entire app — definition tables, scoring logic, and UI — lives in one file with a `default export App`. The UI language is Japanese; domain terms below keep the Japanese names since they appear throughout the code.

## Project setup

There is no build config, `package.json`, test suite, or git here — the file is meant to be dropped into a host React project (or a Claude artifact). Dependencies it expects from the host: `react` (hooks) and `lucide-react` (icons). Styling is inline via the `S` style object at the bottom of the file; there is no CSS framework.

When asked to "run" or "test", there is no command to invoke — verify changes by reasoning through the scoring functions or by having the user drop the file into their React environment.

## Architecture

The data model is a flat **list of series**, each series an ordered list of `items`. Everything else is derived. There are four item `kind`s:

- `throw` (投げ) / `catch` (キャッチ) — bracket an apparatus throw; `reqTypes` holds required throws (e.g. `twothrow`, `lefthand`), `throwTypes`/`catchTypes` hold optional technique tags.
- `skill` (タンブリング技) — a tumbling element referencing `SKILL_LIST` by `skillId`, with `hasApparatus` and `isThrow` (throw executed mid-skill) flags.
- `motion` (徒手動作) — empty-hand body motions referencing `HAND_MOTIONS`.

### The core pipeline

`analyzeSeries(series)` is the heart of the model. It walks `items` left-to-right and groups them into **units** by flushing a buffer whenever a `catch` is seen:

- A run of skills/motions with **no throw** → a `tumbling` unit; difficulty from `calcTumblingDifficulty` (first skill's value, +1 per additional non-A skill, +1 if any throw, capped at E).
- A run that **contains a throw** → a `throw` unit. Its difficulty is `max(handDiff, tumblingDiff)`; `calcHandDifficulty` derives hand difficulty from accumulated motion count (縦3動作 → forced E). A throw unit that also contains a skill is a **投げタン** (`isThrowTumbling`) and counts toward tumbling, not hand.

Downstream, `App` computes the score from `analysis` (the per-series result of `analyzeSeries`) plus the raw `series`. Final score = **D (難度, additive) + A (10 − deductions) + E (10 − manual execution deductions)**:

- **D adds:** top-3 tumbling difficulties + top-3 hand difficulties (`ADOPT_COUNT`/`DIFF_SCORE`), series-throw bonus, technique-tag bonus, apparatus-operation bonus, two-throw-4-motion bonus.
- **A deducts:** missing-apparatus, missing-direction (前方系/側方系/後方系 must all appear), too-few-throws, salto-chain-too-short, throw/catch variety shortage — each capped per the `*_CAP`/`*_DEDUCTION` constants near the top.

### Conventions and gotchas

- **All scoring rules are tunable constants** declared at the top of the file (`DIFF_SCORE`, `*_BONUS`, `*_DEDUCTION`, `*_CAP`, `VARIETY_REQUIRED`, `ADOPT_COUNT`). Change scoring there, not inline in `App`.
- **Duplicate-series suppression:** `seriesSignature` + `dupFlags` detect identical series. Duplicates are excluded from counts/most bonuses but their difficulty still competes for the top-3 adopted slots. Many reductions in `App` start with `if (dupFlags[i]) return;` — preserve that guard when adding per-series logic.
- **The per-series breakdown** (`seriesBreakdowns` in `App`) deliberately **re-implements** the global bonus/deduction logic locally for display. If you change a scoring rule, update both the global computation and the matching branch in `seriesBreakdowns` or the UI breakdown will disagree with the totals.
- `checkApparatusFlow` is an independent validator simulating in-hand vs in-air apparatus counts (`APPARATUS_COUNT`) to surface throw/catch imbalance warnings; it does not affect the score.
- `NO_APPARATUS_DEDUCTION` is a legacy constant kept for compatibility — the live logic uses `NO_APP_SALTO_DEDUCTION` / `NO_APP_ALL_DEDUCTION` / `NO_APP_CAP`.
- State edits use `structuredClone` for immutable updates. Import/export round-trips the `{ version: 1, apparatus, series }` shape via both file download and a copy/paste JSON modal.
- Team mode (団体モード, 5-person) is shown as a disabled "準備中" placeholder — not implemented.
