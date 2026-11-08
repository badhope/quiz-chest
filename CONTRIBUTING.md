# Contributing to QuizChest

Thanks for taking the time to contribute. This document keeps the bar high and the
process short.

## Before you start

- Read [README.md](README.md) for what the product is and is not.
- Check [CHANGELOG.md](CHANGELOG.md) for what is already in flight.
- For anything larger than a bug fix, open an issue first so we can agree on the
  approach before you write code.

## Development setup

```bash
pnpm install
pnpm dev
```

Node 20.19+ or 22.12+. The project uses pnpm exclusively; do not commit a
`package-lock.json` or `yarn.lock`.

## The gate you must pass

```bash
pnpm check
```

This runs version consistency, TypeScript, ESLint, the Vitest suite and a production
build, and stops at the first failure. **A pull request that does not pass `pnpm check`
will not be merged.** There is no "fix it later" path.

## Code conventions

**Structure**

- Business logic belongs in `src/lib/`, not in components.
- Session and UI behaviour belongs in hooks (`src/hooks/`), not in page components.
- Pages compose; they do not implement rules.
- If a component exceeds roughly 250 lines, split it. The practice runner was split for
  exactly this reason — see `usePracticeSession` + `QuestionCard` + `AnswerCard`.

**Types**

- `strict` is on, `noUnusedLocals` and `noUnusedParameters` are on. Do not silence
  them with `any` or `@ts-ignore`.
- Prefer explicit domain types from `src/data/types.ts` over structural guessing.

**State**

- Persisted state changes require bumping the persist `version` and extending `migrate`
  in `src/store/useAppStore.ts`. Never leave an old schema unmapped.

**Styling**

- Use the CSS variables in `src/styles/tokens.css`. No hard-coded colours.
- Layout must be verified at 1440px and 390px width.

## Tests

- New pure logic goes in `src/lib/*.test.ts`.
- New interactive behaviour goes in a `.test.tsx` next to the component, with
  `// @vitest-environment jsdom` as the first line.
- Assert user-visible behaviour, not implementation details. A test that only checks
  a class name or an internal call count will be rejected in review.

## Commits

Use the imperative mood, present tense, with a conventional prefix:

```
feat: add CSV title column support
fix: keep answer card reachable on mobile
refactor: extract practice session hook
docs: clarify storage migration contract
chore: bump version to 1.1.0
```

One logical change per commit. Do not mix a refactor with a behaviour change.

## Pull requests

A good PR description states:

1. **What changed** and why.
2. **How you verified it** — the exact commands you ran, plus screenshots for any UI
   change.
3. **What you did not do** — known gaps, follow-ups, deliberate omissions.

## Reporting bugs

Include the platform (Web / Desktop / Android), the steps to reproduce, what you
expected and what happened. If it involves imported data, attach a minimal CSV or JSON
that triggers it — that is worth more than a paragraph of description.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
