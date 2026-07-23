# Agent Pet + New Tab companion — design

**Date:** 2026-07-23  
**Status:** Approved for planning  
**Scope:** Theme-aware agent pet, New Tab presence, dock modes that replace the top Agent button unless the pet is hidden.

---

## Problem

The New Tab surface is static relative to the theme system. The agent is only reachable via a toolbar **Agent** button, which is utilitarian and disconnected from the product’s character. We want a themed **pet** that:

1. Lives on New Tab as a companion next to the greeting  
2. Floats bottom-right elsewhere and opens the existing agent side panel  
3. Can be hidden via right-click, after which the toolbar Agent button returns  

---

## Goals

- Theme-aware pet with a **distinct skin for all 8 themes**  
- Clear modes: **newtab companion** · **dock** · **hidden**  
- Prefer the pet over the top Agent toggle when the pet is visible  
- Subtle New Tab entrance animation; idle motion with `prefers-reduced-motion` respect  
- Reuse the current `AgentPanel` (no shell redesign in v1)  
- Persist visibility preference  

## Non-goals (v1)

- Speech bubbles / streaming lipsync on the pet  
- Free drag positioning of the pet  
- Custom pet editor or user-uploaded skins  
- Replacing AgentPanel layout with a pet-shaped chat shell  
- Lottie/canvas 3D assets  

---

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Look | Agent avatar that **changes by theme** (8 skins) |
| Side chat | Pet **floats bottom-right**; click toggles existing agent panel |
| New Tab | Companion **beside the greeting** |
| Skins v1 | **All 8 themes** |
| Hide | Right-click → hide → toolbar Agent button returns |

---

## Architecture

### Components

```
AgentPet/
  AgentPet.tsx          # shell: size, modes, click, context menu, busy state
  skins/
    types.ts            # PetSkinId, PetMood
    registry.ts         # ThemeId → skin component
    shared.css          # idle / busy / reduced-motion keyframes
    EinkPet.tsx
    MidnightPet.tsx
    TerminalPet.tsx
    MatrixPet.tsx
    NordPet.tsx
    SolarizedPet.tsx
    SynthwavePet.tsx
    BrutalistPet.tsx
```

Skins are **inline SVG + CSS** (no external Lottie). Shared silhouette language (rounded body + face region + accent mark) so motion and hit targets stay consistent; materials/colors/details differ per theme.

### Placement owners

| Location | Who mounts `AgentPet` |
|----------|------------------------|
| New Tab companion | `NewTabPage` — `mode="companion"` beside greeting |
| Global dock | `App` (or small `AgentPetDock`) — `mode="dock"` when pet visible and not exclusively “only on new tab” |
| Toolbar fallback | Existing `Toolbar` Agent toggle when pet **hidden** |

**Dock vs companion:** On New Tab, show **companion only** (not a second dock duplicate). On all other surfaces (settings, real pages, library layouts), show **dock** when pet is visible.

### State & prefs

Extend `chromePrefs` (zustand persist):

```ts
agentPetVisible: boolean  // default true
```

- `true` → pet shown; toolbar Agent button **hidden**  
- `false` → pet unmounted; toolbar Agent button **shown**  

Agent open/close remains `agentOpen` in `App` (unchanged). Pet click calls the same toggle as today’s Agent button / ⌘J.

### Mood mapping

| Agent session status | Pet mood |
|----------------------|----------|
| `idle` / no session | `idle` |
| `thinking` / `acting` | `busy` |
| `waiting_human` | `attention` |
| `paused` | `busy` (slower pulse) |
| `error` | `attention` (optional tint) |

---

## UX detail

### New Tab companion

- Sits **to the left of** the greeting block (or between brand and greeting if brand stays above).  
- Size ~72–88px.  
- Click → `setAgentOpen(true)` (and optional focus agent composer).  
- Right-click → context menu: **Hide companion**.  
- Entrance: short fade + translate with the greeting stagger.  

### Dock (bottom-right)

- Fixed within the renderer chrome (not over guest WebContentsView when guest is covering the hole — **must sit in chrome insets**, typically above status bar and left of agent panel when open).  
- Size ~48–64px.  
- z-index above content-hole HTML when guest is hidden; when guest is visible, dock must live in the **bottom chrome** (status bar row) or **right chrome** so it is not covered by `WebContentsView` (same constraint as theme picker).  

**Electron constraint (critical):** Native guest view paints above HTML in the content hole. Dock positioning options:

1. **Preferred:** Anchor dock in the **status bar** right cluster (always chrome), or a thin bottom chrome strip reserved when pet is visible.  
2. **Alternative:** Temporarily only show dock when guest is not covering (settings / new tab); on real pages use a **right-edge chrome tab** that toggles the panel.  

**v1 choice:** Reserve dock in **status bar trailing area** (or a small always-on bottom-right chrome chip outside the content hole metrics). Update `useChromeMetrics` / status bar layout so the pet never sits under the guest. When agent panel is open, pet sits just **left of the panel edge** still in chrome (status bar or panel header lip is acceptable if metrics stay correct).

If status-bar placement feels too small, use a **right chrome gutter** (~56px) only when pet is visible and panel is closed; panel open reclaims that gutter. Metrics must update (`agentOpen` + `agentPetVisible`).

**Resolved layout for implementation:**

- Pet dock: `position` in the **body** layer as a sibling of content-hole, **only when** guest is not covering **or** with **right inset** chrome metrics when pet visible and panel closed so the dock sits in the free strip.  
- Simplest correct approach: when `agentPetVisible && !agentOpen`, set `chromeMetrics.right` to include dock width (~56–64px) so WebContentsView shrinks and HTML dock is visible; when panel open, existing agent width already reserves right. When pet hidden, no extra inset.

### Hide / show

**Hide (context menu on pet):**

- Label: **Hide companion**  
- Sets `agentPetVisible = false`  
- Toolbar shows Agent button again  

**Show again:**

- Right-click the toolbar **Agent** button → **Show companion**  
- Optional: Settings → Appearance → “Show agent companion” toggle (nice-to-have; include if cheap)

### Keyboard

- ⌘J continues to toggle the panel regardless of pet visibility.  
- Pet itself is focusable (`button` or `role="button"`) with Enter/Space to toggle panel.

### Reduced motion

- `@media (prefers-reduced-motion: reduce)`: no idle loop; static skin; busy = opacity pulse only or none.

---

## Theme skins (8)

Shared structure: body · face · accent · optional ears/mark.

| Theme | Direction |
|-------|-----------|
| **E-Ink** | Ink blot / paper creature, serif-soft, monochrome, slow blink |
| **Midnight** | Teal orb familiar, soft glow, Arc-like |
| **Terminal** | Cursor-block head, mono edges, green phosphor |
| **Matrix** | Glyph-faced node, rain-tick idle |
| **Nord** | Soft arctic fox-like rounded form, cool blues |
| **Solarized** | Sun/disk face, cyan/amber accents |
| **Synthwave** | Neon cat/synth mascot, grid wink |
| **Brutalist** | Hard square stamp face, thick black stroke |

Skins register as:

```ts
// registry.ts
export const PET_SKINS: Record<ThemeId, ComponentType<PetSkinProps>>
```

`PetSkinProps`: `{ mood: PetMood; size: number; reducedMotion: boolean }`.

---

## New Tab visual polish

In parallel with the pet:

1. **Staggered entrance** — brand, clock, greeting, search, chips, favs (CSS animation classes, ~400ms total).  
2. **Theme ambient** — already token-driven; ensure E-Ink stays quiet, dark themes keep soft radial ambient.  
3. **Greeting row layout** — flex row: `[Pet companion] [greeting column]`.  
4. **Search bar** unchanged behavior (navigate / ⌘↵ agent).

---

## Files to touch (expected)

| Area | Files |
|------|--------|
| Prefs | `stores/chromePrefs.ts` — `agentPetVisible` |
| Pet UI | `components/agent/AgentPet/*` (new) |
| New Tab | `NewTabPage.tsx`, `chrome-pages.css` |
| App shell | `App.tsx` — dock mount, metrics key, hide toolbar agent when pet visible |
| Toolbar | `Toolbar.tsx` — conditional Agent button + context menu “Show companion” |
| Status / metrics | `useChromeMetrics` layout key; optional right inset when dock shown |
| Styles | `app.css` / pet CSS for dock hit area |
| Settings (optional) | Appearance toggle |

---

## Accessibility

- Pet control has accessible name: “Agent companion” / “Open agent panel”.  
- `aria-pressed` or `aria-expanded` reflecting `agentOpen`.  
- Context menu items keyboard-reachable (native `menu` or simple custom menu with focus trap lite).  
- Busy mood is decorative; status text remains in agent panel / status bar.  

---

## Testing

- Manual: all 8 themes skin swap on theme change.  
- Pet visible → no toolbar Agent; hide → toolbar returns; show → pet returns.  
- ⌘J still toggles panel.  
- Real page + pet visible: dock not covered by guest (metrics inset).  
- New Tab: companion beside greeting, no duplicate dock.  
- `prefers-reduced-motion`: no continuous idle animation.  

---

## Implementation phases

1. Prefs + toolbar show/hide wiring (no skins yet — placeholder circle).  
2. Dock placement + chrome metrics so guest never covers pet.  
3. New Tab companion layout + entrance animation.  
4. Eight SVG skins + mood mapping.  
5. Context menus (hide / show).  
6. Polish + reduced motion + optional settings toggle.  

---

## Open points resolved for implementers

- **Default:** `agentPetVisible: true`.  
- **No drag.**  
- **One pet instance** per window (companion XOR dock, not both).  
- **Panel chrome** stays as today’s `AgentPanel`.  
