import { useState, useEffect, useCallback } from 'react';
import { eventBus } from './lib/event-bus';
import { getSettings, saveSettings, XTERM_THEMES } from './lib/settings';
import type { ClawQuirkSettings, ShellInfo } from './lib/settings';
import SettingsPanel from './components/SettingsPanel';

// Inline SVG icons
const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

export default function App() {
  const [terminalOpen, setTerminalOpen] = useState(
    () => localStorage.getItem('clawquirk-panel-open') === 'true'
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(getSettings);
  const [availableShells, setAvailableShells] = useState<ShellInfo[]>([]);

  useEffect(() => {
    fetch('/api/shells')
      .then((r) => r.json())
      .then((shells: ShellInfo[]) => setAvailableShells(shells))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onVisible = (open: boolean) => setTerminalOpen(open);
    eventBus.on('terminal:visible', onVisible);
    return () => eventBus.off('terminal:visible', onVisible);
  }, []);

  // Keyboard shortcut: Ctrl+` toggles terminal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        eventBus.emit('terminal:toggle');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleTerminal = () => {
    eventBus.emit('terminal:toggle');
  };

  const toggleTheme = () => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    const updated = { ...settings, theme: newTheme as 'dark' | 'light' };
    setSettings(updated);
    saveSettings(updated);
    document.documentElement.dataset.theme = newTheme;
    eventBus.emit('terminal:theme-changed', {
      theme: newTheme,
      xtermTheme: XTERM_THEMES[newTheme],
    });
  };

  const openProjectFolder = () => {
    fetch('/api/open-folder', { method: 'POST' }).catch(() => {});
  };

  const handleSettingsChange = useCallback((updated: ClawQuirkSettings) => {
    const prev = settings;
    setSettings(updated);
    saveSettings(updated);

    if (updated.terminalFontSize !== prev.terminalFontSize) {
      eventBus.emit('terminal:font-size-changed', updated.terminalFontSize);
    }
    if (updated.terminalPosition !== prev.terminalPosition) {
      document.documentElement.dataset.terminalPosition = updated.terminalPosition;
      eventBus.emit('terminal:position-changed', updated.terminalPosition);
    }
    if (updated.shell !== prev.shell) {
      eventBus.emit('terminal:shell-changed', updated.shell);
    }
    if (updated.autoLaunchCommand !== prev.autoLaunchCommand) {
      eventBus.emit('terminal:launch-command-changed', updated.autoLaunchCommand);
    }
  }, [settings]);

  return (
    <div className="main-panel">
      <div className="main-header">
        <h1>Orc</h1>
        {!terminalOpen && (
          <button className="toggle-btn" onClick={toggleTerminal}>
            Open Terminal
          </button>
        )}
      </div>
      <div className="main-content">
        <div className="placeholder">
          <h2>Welcome to Orc</h2>
          <p>
            Use the terminal panel to interact with your favorite
            AI coding tool. Click the button above to open an
            integrated terminal that persists across page refreshes.
          </p>
        </div>
      </div>

      <div
        className="icon-bar"
        style={terminalOpen && settings.terminalPosition === 'right'
          ? { right: `calc(var(--terminal-width) + 1.5rem)` }
          : undefined
        }
      >
        <button className="icon-btn" onClick={openProjectFolder} title="Open project folder">
          <FolderIcon />
        </button>
        <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
          {settings.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          className="icon-btn"
          onClick={() => setSettingsOpen(!settingsOpen)}
          title="Settings"
        >
          <GearIcon />
        </button>
        {settingsOpen && (
          <SettingsPanel
            settings={settings}
            onChange={handleSettingsChange}
            onClose={() => setSettingsOpen(false)}
            availableShells={availableShells}
          />
        )}
      </div>
    </div>
  );
}
