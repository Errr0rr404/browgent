# Browser import & User Hub

## YC / product note

Import and a local profile hub are **standard browser features** (Chrome, Arc, Edge, Brave). They do **not** conflict with a YC application when framed as:

- **Local-only** — no cloud sync of passwords or profile  
- **Optional** — user-initiated one-click import  
- **Wedge-aligned** — agents use real SSO + user profile for form fill without inventing PII  

## Import (Settings → Import)

1. Scans the machine for installed browsers (Chrome, Edge, Brave, Arc, Firefox, Safari, …).  
2. One **Import** click per browser:  
   - **History** → Browgent history store  
   - **Bookmarks** → local bookmark store (Chromium + Firefox; Safari bookmarks not yet)  
   - **Passwords** (optional checkbox) → encrypted local vault (`safeStorage` when available)  
3. **Fully quit** the source browser if import finds 0 rows (SQLite / WAL lock).  
4. Chromium passwords on **macOS** may prompt for Keychain (“Chrome Safe Storage”). Windows DPAPI decrypt is not implemented yet (history/bookmarks still work).  
5. **Safari** history may require Full Disk Access for Browgent on macOS.  
6. **Firefox** passwords use NSS and are not imported yet.  

## User Hub (Settings → User Hub)

Store name, email, phones, company, address, and custom key/values locally (`userData/user-hub.json`).

- **Agent may use profile** — enables `get_profile` tool for form fill  
- **Vault** — shows origin + username only; agent uses `get_credentials` (human confirm)  

## Agent tools

| Tool | Role |
|------|------|
| `get_profile` | Non-secret contact fields for fill |
| `fill_form` | Match observe refs to profile / explicit fields (never passwords; prefer `dryRun` first) |
| `get_credentials` | Password for current site (confirm) |

Recipe **Fill with profile** runs a dry-run then real `fill_form`. See also [qa.md](./qa.md).

## Security

- Vault file mode `0600`; prefer Electron `safeStorage` encryption  
- Passwords never listed over IPC as plaintext  
- Trajectory redacts `password` fields  
- Private-host agent navigation still blocked by default  
