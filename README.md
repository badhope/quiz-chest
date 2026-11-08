# QuizChest

**A local-first question bank you actually own.**

Import your own question sets, then practise offline, run timed mock exams, drill your
mistakes and watch your accuracy climb — no account, no server, no telemetry.

[English](README.md) · [简体中文](README.zh-CN.md)

<p align="center">
  <img src="docs/screenshots/home.webp" alt="QuizChest home screen" width="900">
</p>

## What it does

QuizChest is built around one idea: **your question bank should not be trapped in
someone else's platform.** You bring a JSON or CSV file, QuizChest turns it into a
fully functional practice bank in under a second, and everything stays on your machine.

| | |
| --- | --- |
| **Import anything reasonable** | Excel (`.xlsx`), JSON, CSV, or a portable `.tiyu.json` bank package — all validated by the same row pipeline, with a preview before anything is saved. |
| **Three ways to find what to study** | Follow a goal track, drill down domain → stage → bank, or let a strategy pick for you. |
| **A complete practice loop** | Single choice, multiple choice and true/false. Instant feedback in practice mode, countdown and auto-submit in exam mode. |
| **Nothing you get wrong is lost** | Mistakes auto-collect into a wrong-book; answering correctly in review mode removes them. |
| **Edit what you imported** | Fix a typo without re-importing: stems, options, answers and explanations are editable in place; question IDs stay stable so wrong-book references never break. |
| **Undo a bad edit** | Every save archives the previous version first. Roll back to any of the last 20 revisions; a rollback itself is reversible. |
| **Pick up where you stopped** | Progress is written to the database as you answer. Close the app mid-session and the home screen offers to resume exactly where you left off. |
| **Questions can have images** | Diagram, geometry and reading-comprehension questions work: import a stem image or per-option images (URL or embedded data URI). |
| **Numbers that mean something** | Streaks, accuracy trend, per-domain distribution and a 7-day volume chart. |
| **Print a real paper** | Build a custom paper, then print it: A4 layout with name and score lines, optional answer key, navigation hidden automatically. |
| **Runs everywhere you do** | Web/PWA, Windows/macOS/Linux desktop (Tauri 2), Android (Capacitor 8). Same codebase, same data model. |

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/screenshots/catalog.webp" alt="Question bank catalogue"><br><sub><b>Catalogue</b> — domain tree, stage filters, bank cards</sub></td>
<td width="50%"><img src="docs/screenshots/practice.webp" alt="Practice screen"><br><sub><b>Practice</b> — instant marking with explanations</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/stats.webp" alt="Learning statistics"><br><sub><b>Statistics</b> — volume, accuracy trend, domain split</sub></td>
<td width="50%"><img src="docs/screenshots/settings.webp" alt="Settings and backup"><br><sub><b>Settings</b> — backup, restore and preferences</sub></td>
</tr>
</table>

## Quick start

Requires **Node 20.19+ or 22.12+** and **pnpm**.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # production build with PWA manifest and service worker
pnpm preview      # serve dist/ at http://localhost:4173
```

### Build for every platform

```bash
pnpm build                  # Web / PWA — deploy dist/ to any static host
pnpm desktop:build          # Windows desktop installer (needs Rust + MSVC)
pnpm build:native && npx cap sync android   # then build in android/ with Gradle
```

Native shells use hash routing and disable the service worker; the web build uses
browser history routing. All three share one data-layer interface
(`src/services/repository.ts`), so the engine underneath can change without
touching the callers.

## Import formats

The fastest path is a CSV with five required columns:

```csv
title,stem,optionA,optionB,optionC,optionD,answer,explanation,type
小学数学,一个数的 3 倍减去 12 等于 18，这个数是多少,8,10,12,14,B,设该数为 x，则 3x - 12 = 18,single
小学数学,下列哪些是偶数,1,2,3,4,B;D,能被 2 整除的整数是偶数,multiple
```

Accepted answer syntax: `B`, `BC`, `B;D`, `B,D`, `B、D`, `B/D`, or 1-based indexes
like `1,3`. Only `stem`, `optionA`, `optionB`, `answer` and `explanation` are mandatory.

Full field reference: [docs/IMPORT_FORMAT.md](docs/IMPORT_FORMAT.md).

## Your data

QuizChest ships its own on-device database. There is no server, and no data ever
leaves the machine:

| Runtime | Engine | Location |
| --- | --- | --- |
| Desktop (Tauri 2) | SQLite via Rust `rusqlite` | app data dir, `com.tiyu.questionbank/quizchest.db` |
| Web / PWA / Android (Capacitor) | IndexedDB | site storage, database `quizchest` |

The desktop database is a plain SQLite file — open it with any SQLite tool. Settings
→ *Local database* shows the live driver and the exact path.

**Back up before you clean.** Settings → *Full backup and restore* exports a single
JSON file containing every bank, mistake, favourite, session, paper and preference.
Restore it on any device to pick up exactly where you left off.

If the database is unavailable (private mode, restricted permissions), QuizChest keeps
working from memory for the session and says so explicitly rather than silently losing
writes. Legacy `localStorage` data is migrated into the database on first launch and the
old key is removed.

## Built-in sample content

Seven domains, 20 stages, 32 banks and 195 questions ship with the app **to demonstrate
the product structure**. Every sample bank is labelled and holds only 6–7 questions.
They are not study material. Hide them in Settings and import your own.

The current release deliberately has no accounts, no cloud sync, no admin backend and
no hosted question service.

## Architecture

```
src/
├─ data/        taxonomy, sample banks, question seeds, record types
├─ services/    data layer: SQLite / IndexedDB / memory drivers and selection
├─ lib/         grading, stats, import/export, strategy, paper building
├─ hooks/       session state, timers, brand, service worker, data-layer status
├─ store/       Zustand state with startup hydrate and async persistence
├─ components/  layout, question runner, charts, UI primitives
├─ pages/       route-level screens
└─ styles/      design tokens, layout, page and practice styles
```

Design decisions worth knowing:

- **Logic is separated from rendering.** All session rules live in
  `usePracticeSession`; `PracticeRunner` only maps state to markup. That is why the
  practice flow can be unit-tested without a browser.
- **The data layer is swappable.** Pages depend only on `src/services/repository.ts`;
  desktop runs SQLite, web runs IndexedDB, and changing engines does not touch screens.
- **Failed writes are visible.** A write updates memory first so the UI stays
  responsive, then persists; a failure lands in `persistenceError` and is shown in
  Settings instead of pretending the save succeeded.
- **Failures are contained.** A route-level `ErrorBoundary` keeps a broken page from
  taking down the shell.
- **Charts are lazy.** ECharts loads only on `/stats`, keeping the initial bundle at
  roughly 138 kB gzipped.

## Quality gates

```bash
pnpm check        # version → typecheck → lint → unit tests → build → cargo test → audit
pnpm test:e2e     # Playwright, real browser, critical paths
pnpm test:e2e:apk # Playwright against the real APK assets, Pixel 5 viewport
```

`pnpm check` covers question-bank integrity, grading, session summaries, strategies,
import/export round-trips, CSV export, both data-layer drivers, store-to-database
persistence, dialog focus management and the practice component. It also runs
`cargo test` for the Rust data layer (skipped with an explicit notice if cargo is
absent) and `scripts/audit-deps.mjs`, which fails on high/critical vulnerabilities in
runtime dependencies. Build-only toolchain advisories are reported separately, since
they never reach the shipped artifact.

`pnpm test:e2e` drives a real Chromium against a dev server and proves the paths unit
tests cannot: imported banks survive a reload from IndexedDB, wrong answers reach the
wrong book while correct ones do not, submitting a session records history, and a
backup survives reset-and-restore. Kept out of `pnpm check` because it starts a server
and takes ~25 s; CI runs both.

## Project management

- Versioning: [SemVer](https://semver.org/), single source in `package.json`,
  propagated by `scripts/sync-version.mjs`.
- History: [CHANGELOG.md](CHANGELOG.md).
- Release procedure: [docs/RELEASING.md](docs/RELEASING.md).
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md).
- Security policy: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
