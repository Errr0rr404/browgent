# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | ✅ Current development line |
| < 0.2   | ❌ No longer supported |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems that could put users at risk (e.g. RCE via page content, secret leakage, policy bypass that enables unexpected navigation/actions).

Instead:

1. Email or message the maintainer privately via GitHub: [@Errr0rr404](https://github.com/Errr0rr404)
2. Include steps to reproduce, affected version/commit, and impact
3. Allow reasonable time for a fix before public disclosure

We will acknowledge reports as soon as practical and work with you on coordinated disclosure.

## Scope notes

Browgent is a **local desktop browser** that runs agent tools against real web content. Expected residual risks include:

- Pages can attempt XSS; guest tabs are sandboxed but not a hardened browser-isolation product
- Agents with Act mode can click/type/navigate on behalf of the user — use policies and Takeover
- API keys in `.env` stay on the local machine; never commit them

Feature requests that improve isolation, policy, or consent UX are welcome as public issues.
