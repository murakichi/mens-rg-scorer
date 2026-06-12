# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Vite + React + TypeScript single-page app that calculates competition scores for Japanese **men's rhythmic gymnastics** (男子新体操), individual mode. The UI language is Japanese; domain terms below keep the Japanese names since they appear throughout the code. The authoritative rules spec lives in `mens-rg-rules.md` — keep it and the definition tables in `src/scoring/constants.ts` in sync.

## Commands

- `npm run dev` — Vite dev server (hot reload).
- `npm run build` — `tsc -b` typecheck (strict) then `vite build` to `dist/`.
- `npm run typecheck` — types only, no emit.
- `npm run preview` — serve the production build locally.

There is no test runner yet. After changing scoring logic, run `npm run build` (strict TS) and reason through the pure functions in `src/scoring/`.

## Deployment

GitHub Pages via `.github/workflows/deploy.yml` (builds on push to `main`, uploads `dist/`). The Pages source must be set to **GitHub Actions**. `vite.config.ts` sets `base: "/mens-rg-scorer/"` — this must match the repo name or assets 404 on Pages.

## Architecture

The codebase splits cleanly into **pure scoring logic** (`src/scoring/`) and **UI** (`src/App.tsx` + `src/components/`). The UI holds state and renders; it contains no scoring math.

The data model is a flat **list of `Series`**, each an ordered list of `items` (`src/scoring/types.ts`). Everything else is derived. Four item `kind`s (a discriminated union on `kind`):

- `throw` (投げ) / `catch` (キャッチ) — bracket an apparatus throw; `reqTypes` holds required throws (e.g. `twothrow`, `lefthand`), `throwTypes`/`catchTypes` hold optional technique tags.
- `skill` (タンブリング技) — a tumbling element referencing `SKILL_LIST` by `skillId`, with `hasApparatus` and `isThrow` (throw executed mid-skill) flags.
- `motion` (徒手動作) — empty-hand body motions referencing `HAND_MOTIONS`.

### The scoring pipeline (`src/scoring/`)

- **`constants.ts`** — all definition tables and tunable rule values (`SKILL_LIST`, `HAND_MOTIONS`, `DIFF_SCORE`, `*_BONUS`, `*_DEDUCTION`, `*_CAP`, `ADOPT_COUNT`, …). Change scoring values **here only**.
- **`analysis.ts`** — per-series functions. `analyzeSeries(series)` is the heart: it walks `items` left-to-right and flushes a buffer into **units** whenever a `catch` is seen.
  - A run with **no throw** → a `tumbling` unit; `calcTumblingDifficulty` = first skill's value, +1 per additional non-A skill, +1 if any throw, capped at E.
  - A run **containing a throw** → a `throw` unit; difficulty is `max(handDiff, tumblingDiff)`. `calcHandDifficulty` derives hand difficulty from accumulated motion count (縦3動作 → forced E). A throw unit that also contains a skill is a **投げタン** (`isThrowTumbling`) and counts toward tumbling, not hand.
  - Also: `maxSaltoChain`, `hasConnect`/`hasConnectWithoutApparatus` (つなぎ技 detection), `checkApparatusFlow` (in-hand/in-air validator, warnings only — no score effect), `seriesSignature` (dup detection).
- **`score.ts`** — `computeScore(series, apparatus): ScoreResult` is the single source of truth for the whole-routine score. The UI calls it once (memoized in `App`) and renders the returned object. Final score = **D (難度, additive) + A (10 − deductions) + E (10 − manual execution deductions)**, both A and E floored at 0.

### Conventions and gotchas

- **`computeScore` returns everything the UI needs**, including `seriesBreakdowns` (per-series contribution rows) and `required`/`missing` (必須要素 checks). Add new derived values to `ScoreResult`, not as ad-hoc calculations in components.
- **Single source of truth for sums:** `computeScore` computes `seriesBreakdowns` first, then the literal-sum globals (`techniqueBonus`, `apparatusOpBonus`, `twoThrowMotionBonus`, and the base of `noApparatusDeduction`) are derived by summing those breakdowns — so per-series rows and grand totals cannot drift apart. The genuinely-global values that can't be derived per-series (top-3 adopted `tumblingScore`/`handScore`, the single `seriesBonus`, direction/throwCount/saltoChain/variety deductions) are computed across all series. When adding a rule, decide which category it is.
- **Duplicate-series suppression:** `seriesSignature` + `dupFlags` detect identical series. Duplicates are excluded from counts/most bonuses but their difficulty still competes for the top-3 adopted slots. Per-series logic guarded by `if (isDup)`/`if (dupFlags[i])` — preserve that guard when adding rules.
- **`other` (その他) throws/catches count every time**, even in duplicate series — note the `throwOtherCount`/`catchOtherCount` paths sit *before* the `if (isDup) return` guard in the variety counting.
- State edits use `structuredClone` for immutable updates. Import/export round-trips the `{ version: 1, apparatus, series }` shape (`SaveData`) via file download and a copy/paste JSON modal (`JsonModal`).
- Team mode (団体モード, 5-person) is a disabled "準備中" placeholder — not implemented.
