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
