# Releasing

How Browgent ships installers and the **Download DMG** link on the README.

## Artifact names (stable URL)

`electron-builder.yml` sets `artifactName: ${productName}-${os}-${arch}.${ext}` and writes to `release/`:

| Target | Script | Artifact |
|--------|--------|----------|
| macOS Apple Silicon DMG | `npm run dist:mac` | `release/Browgent-mac-arm64.dmg` |
| Windows NSIS x64 | `npm run dist:win` | `release/Browgent-win-x64.exe` |
| Linux AppImage x64 | `npm run dist:linux` | `release/Browgent-linux-x64.AppImage` |
| Unpacked dir | `npm run dist:dir` | `release/` (platform-dependent) |

GitHub **latest** download URL for the published macOS build (does not change between versions):

```text
https://github.com/Errr0rr404/browgent/releases/latest/download/Browgent-mac-arm64.dmg
```

The current published latest tag (**v0.2.0**) attaches that DMG. Windows/Linux artifacts are produced by CI on `v*` tags as a **draft** release; they are not on the latest published assets unless a maintainer undrafts / attaches them.

## Build locally

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run dist:mac     # or dist:win / dist:linux on that OS
# → release/Browgent-…
```

Unsigned by default (`identity: null` in `electron-builder.yml`, CI sets `CSC_IDENTITY_AUTO_DISCOVERY=false`). Users may need right-click → Open (macOS) or SmartScreen “More info → Run anyway” (Windows).

Set `CSC_IDENTITY` in a signing environment if you want signed macOS builds.

## CI: tag `v*` → draft GitHub Release

`.github/workflows/release.yml` runs on tags matching `v*`:

1. Matrix: `macos-14` (`dist:mac`), `windows-latest` (`dist:win`), `ubuntu-latest` (`dist:linux`)
2. Node **22.12**, `npm ci`, typecheck, `test:unit`, then the platform dist script
3. Upload `release/*.{dmg,exe,AppImage,yml,blockmap}` as artifacts
4. `softprops/action-gh-release` creates a **draft** release with those binaries and generated notes

Then a maintainer reviews the draft, attaches [release notes](./release-notes/) if needed, and publishes.

Manual alternative (macOS only, if you skip CI):

```bash
VERSION=$(node -p "require('./package.json').version")
npm run dist:mac
git tag "v${VERSION}"
git push origin "v${VERSION}"

gh release create "v${VERSION}" \
  --title "Browgent v${VERSION}" \
  --notes-file docs/release-notes/v${VERSION}.md \
  "release/Browgent-mac-arm64.dmg#Browgent-mac-arm64.dmg"
```

The README download button always points at `/releases/latest/download/Browgent-mac-arm64.dmg`, so publishing a new non-draft release updates the file behind that link.

## Landing page

Pushes to `website/**` on `main` deploy GitHub Pages (`.github/workflows/pages.yml`) → [errr0rr404.github.io/browgent](https://errr0rr404.github.io/browgent/).

## Checklist

- [ ] No `.env` or secrets in the tree
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:unit`, and `npm run build` pass
- [ ] Version in `package.json` matches the tag
- [ ] DMG opens and launches on a clean Mac
- [ ] Release asset name is exactly `Browgent-mac-arm64.dmg` if you advertise the README link
- [ ] Release is not left as a forgotten draft (or mark latest carefully)
