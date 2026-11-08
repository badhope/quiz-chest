## What changed

<!-- One paragraph. What does this PR do, and why does the project need it? -->

## How it was verified

<!--
Paste the exact commands you ran. If the change touches UI, attach before/after
screenshots at 1440px and 390px.
-->

```bash
pnpm check
```

## What I did not do

<!-- Known gaps, deliberate omissions, follow-ups. Be honest — this section is read. -->

## Checklist

- [ ] `pnpm check` passes locally
- [ ] New logic has tests that assert behaviour, not implementation
- [ ] Persisted state changes bump the store `version` and extend `migrate`
- [ ] UI changes verified at 1440px and 390px width
- [ ] No secrets, build output or editor state included
