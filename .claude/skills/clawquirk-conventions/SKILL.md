---
name: clawquirk-conventions
description: ClawQuirk development conventions covering cross-framework React+Vue architecture, event bus communication, settings system, theming, and UI patterns. Use this skill when modifying any ClawQuirk frontend code, adding new UI features, working with the event bus, changing settings behavior, or adding cross-framework interactions. Especially important when creating new events, adding settings, or touching both React and Vue code in the same task.
user-invocable: false
paths: "src/**"
---

# ClawQuirk Frontend Conventions

## Dual-Framework Architecture

ClawQuirk runs React 19 and Vue 3 side-by-side on the same page:

- **React** mounts at `#react-root` — owns the main panel, header, settings, icon bar (`src/App.tsx`)
- **Vue** mounts at `#vue-terminal` — owns the terminal panel (`src/components/TerminalPanel.vue`)
- Vite loads both `@vitejs/plugin-react` and `@vitejs/plugin-vue`; file extension determines routing: `.tsx` = React, `.vue` = Vue

### Framework boundaries

Keep React and Vue in separate DOM trees. Don't import Vue components into React or vice versa, and don't share state through global variables, window properties, or DOM manipulation. These boundaries exist because the two frameworks have incompatible reactivity systems — crossing them creates subtle bugs where one framework's state updates don't trigger the other's re-renders. The event bus is the designated bridge.

## Event Bus (`src/lib/event-bus.ts`)

Simple pub/sub Map with `on`, `off`, `emit` methods.

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `terminal:toggle` | React -> Vue | none | Toggle terminal panel visibility |
| `terminal:visible` | Vue -> React | `boolean` | Sync panel open/close state to React |
| `terminal:theme-changed` | React -> Vue | `{ theme, xtermTheme }` | Live theme update for xterm.js |
| `terminal:font-size-changed` | React -> Vue | `number` (px) | Live font size update |
| `terminal:position-changed` | React -> Vue | `'left' \| 'right'` | Swap terminal panel side |
| `terminal:launch-command-changed` | React -> Vue | `string` | Restart terminal with new auto-launch command |
| `terminal:shell-changed` | React -> Vue | `string` | Switch to a different shell |

### Adding a new event

1. Define the event name and payload type
2. Emit from the source framework
3. Listen in the target framework (register in `onMounted`/`useEffect`, clean up on unmount)
4. Update this table

## Settings System (`src/lib/settings.ts`)

All preferences stored in `localStorage` under key `clawquirk-settings`.

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| `theme` | `'dark' \| 'light'` | `'dark'` | Applied via `data-theme` on `<html>` |
| `terminalFontSize` | `number` | `14` | Range: 10-20px |
| `autoLaunchCommand` | `string` | `'claude'` | Presets in `LAUNCH_PRESETS` + custom |
| `terminalPosition` | `'right' \| 'left'` | `'right'` | Applied via `data-terminal-position` on `<html>` |
| `shell` | `string` | `''` (OS default) | Validated against detected shells |

### Settings change flow

1. User changes setting in `SettingsPanel.tsx`
2. `handleSettingsChange` in `App.tsx` calls `saveSettings()` and emits the relevant event bus event
3. Vue `TerminalPanel.vue` listens for the event and applies the change

### Text inputs with backend effects

Text inputs that trigger backend actions (like `autoLaunchCommand`) should commit on Enter/blur only, not on every keystroke. Each keystroke change restarts the terminal session, so debouncing prevents the PTY from being killed and respawned dozens of times while the user is still typing.

## Theming

- CSS variable-based: defined in `src/App.css`
- Theme initialized before React renders (in `index.html` script) to prevent flash
- Both the UI and xterm.js terminal are themed simultaneously
- xterm.js themes defined in `XTERM_THEMES` constant in `settings.ts`

## Key Constraints

- Terminal panel default width: 480px (user-resizable, min 300px, max 80% viewport)
- xterm.js lazy-initialized on first panel open (not on page load)
- Keyboard shortcut: Ctrl+` toggles terminal
- Icon bar repositions dynamically when terminal is open on right side
