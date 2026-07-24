# Guest identity regression checklist

Run after changing `guest-identity.ts`, `preload/guest.ts`, or partition config.

## Automated smoke

```bash
# App running with CDP optional; this script checks bridge + UA notes via tools if MCP is up
npm run test:identity
```

## Manual (10 min)

| # | Check | Pass? |
|---|--------|-------|
| 1 | New tab → example.com loads | |
| 2 | DevTools on guest page: `navigator.userAgent` has **no** `Electron` | |
| 3 | `navigator.webdriver` is false/undefined | |
| 4 | Google homepage loads without immediate “unusual traffic” (best-effort) | |
| 5 | After MCP `navigate` to example.com, title is Example Domain | |
| 6 | Takeover → type in page → Resume still works | |
| 7 | Stop mid-task clears agent ownership on tabs | |

## Notes

Guest identity is **Chrome-like, not full anti-detect**. Aggressive WAFs and flagged IPs can still challenge. Never ship Electron UA to guest pages.

### Google Sign-In (“This browser or app may not be secure”)

Google OAuth is deliberately hostile to non-Chrome shells. Browgent:

1. Strips Electron from UA  
2. Forces `sec-ch-ua` / `navigator.userAgentData` brands to include **Google Chrome** (Electron’s native brands are Chromium-only — that alone triggers the error)  
3. Disables `AutomationControlled` / hides `navigator.webdriver`  

Still not 100%: TLS fingerprint, IP reputation, and Google’s embedded-browser policy can block sign-in. If it persists: sign in once in system Chrome, or retry after a clean guest session. Agent web-search stays on DuckDuckGo to avoid reCAPTCHA during automation; omnibox defaults to Google.
