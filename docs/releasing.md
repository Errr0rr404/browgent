# Releasing

How Browgent ships the **Download DMG** link on the README.

## Artifact name (stable URL)

`electron-builder` writes:

```text
release/Browgent-mac-arm64.dmg
```

GitHub **latest** download URL (does not change between versions):

```text
https://github.com/Errr0rr404/browgent/releases/latest/download/Browgent-mac-arm64.dmg
```

Configured in `electron-builder.yml` via `artifactName`.

## Build locally (macOS Apple Silicon)

```bash
npm ci
npm run dist:mac
# → release/Browgent-mac-arm64.dmg
```

Unsigned by default (open-source). Users may need right-click → Open.

## Publish a GitHub Release

```bash
# 1. Ensure clean tree, bump version in package.json if needed
VERSION=$(node -p "require('./package.json').version")

# 2. Build
npm run dist:mac

# 3. Tag + release with the DMG attached
git tag "v${VERSION}"
git push origin "v${VERSION}"

gh release create "v${VERSION}" \
  --title "Browgent v${VERSION}" \
  --notes-file docs/release-notes/v${VERSION}.md \
  "release/Browgent-mac-arm64.dmg#Browgent-mac-arm64.dmg"
```

If you skip a notes file:

```bash
gh release create "v${VERSION}" \
  --title "Browgent v${VERSION}" \
  --generate-notes \
  "release/Browgent-mac-arm64.dmg#Browgent-mac-arm64.dmg"
```

The README download button always points at `/releases/latest/download/Browgent-mac-arm64.dmg`, so publishing a new release updates the file behind that link.

## Checklist

- [ ] No `.env` or secrets in the tree
- [ ] `npm run typecheck` and `npm run build` pass
- [ ] DMG opens and launches on a clean Mac
- [ ] Release asset name is exactly `Browgent-mac-arm64.dmg`
- [ ] Release is not draft (or mark latest carefully)

## Other platforms

Windows NSIS and Linux AppImage targets exist in `electron-builder.yml` but are not published yet. Add:

```bash
npm run build && npx electron-builder --win
npm run build && npx electron-builder --linux
```

Then attach artifacts with matching `artifactName` patterns and document links in the root README.
