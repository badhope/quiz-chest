# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.1.x | Yes |
| < 1.1 | No |

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Report privately through GitHub's "Report a vulnerability" advisory flow on the
repository, or contact the maintainer directly. Include:

- A description of the issue and its impact.
- Steps to reproduce, ideally with a minimal input file.
- Affected version and platform (Web / Desktop / Android).
- Any suggested mitigation.

You can expect an acknowledgement within a few days. Once a fix is available, the
advisory will be published with credit unless you prefer to stay anonymous.

## Scope

QuizChest is a local-first front-end application. It has no server, no accounts and no
network communication. The threat model that matters most:

| Area | Risk | Mitigation |
| --- | --- | --- |
| Imported question files | Malicious or malformed JSON/CSV | Every row is validated before it reaches state; no `eval`, no `innerHTML` anywhere in the codebase |
| Rendered question text | Stored XSS via imported stems | Content is rendered as React text nodes only |
| Local storage | Quota exhaustion, denied access | `src/lib/storage.ts` degrades to an in-memory store and notifies the user |
| Native shells | WebView loading remote content | Tauri CSP restricts sources to `'self'`; Capacitor uses the bundled `dist/` only |
| Dependencies | Supply-chain compromise | Pinned versions, `pnpm` lockfile, `pnpm check` on every change |

## Out of scope

- Vulnerabilities requiring physical access to an unlocked device.
- Issues in browsers or OS WebViews themselves.
- Data loss caused by the user clearing site data — that is the documented behaviour of
  a local-only app.
