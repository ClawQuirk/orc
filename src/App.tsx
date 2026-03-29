import { useState, useEffect, useCallback } from 'react';
import { eventBus } from './lib/event-bus';
import { getSettings, saveSettings, XTERM_THEMES } from './lib/settings';
import type { ClawQuirkSettings, ShellInfo } from './lib/settings';
import Sidebar from './components/Sidebar';
import type { PageId } from './components/Sidebar';
import SettingsPanel from './components/SettingsPanel';
import Dashboard from './components/Dashboard';
import PlanningPage from './components/PlanningPage';
import ProjectsPage from './components/ProjectsPage';
import ActionsPage from './components/ActionsPage';
import PeoplePage from './components/PeoplePage';
import DocsPage from './components/DocsPage';
import MemoryPage from './components/MemoryPage';
import KnowledgePage from './components/KnowledgePage';
import AgentsPage from './components/AgentsPage';
import SystemPage from './components/SystemPage';
import VaultUnlock from './components/VaultUnlock';
import GoogleAuthSetup from './components/GoogleAuthSetup';
import FinancialSetup from './components/FinancialSetup';

interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
}

interface PinnedWidget {
  widgetId: string;
  pluginId: string;
  settings: Record<string, unknown>;
}

export default function App() {
  const [terminalOpen, setTerminalOpen] = useState(
    () => localStorage.getItem('clawquirk-panel-open') === 'true'
  );
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [googleAuthOpen, setGoogleAuthOpen] = useState(false);
  const [financialSetupOpen, setFinancialSetupOpen] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<DOMRect | null>(null);
  const [settings, setSettings] = useState(getSettings);
  const [availableShells, setAvailableShells] = useState<ShellInfo[]>([]);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [pinnedWidgets, setPinnedWidgets] = useState<PinnedWidget[]>([]);

  // Check vault status on mount
  useEffect(() => {
    let retries = 0;
    const checkVault = () => {
      fetch('/api/vault/status')
        .then((r) => r.json())
        .then((status: VaultStatus) => setVaultStatus(status))
        .catch(() => {
          // Server may not be up yet — retry up to 10 times (10s total)
          if (retries < 10) {
            retries++;
            setTimeout(checkVault, 1000);
          } else {
            setVaultStatus({ exists: false, unlocked: false });
          }
        });
    };
    checkVault();
  }, []);

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

  const vaultLocked = vaultStatus !== null && !vaultStatus.unlocked;

  // Keyboard shortcut: Ctrl+` toggles terminal (suppressed during vault unlock)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        if (!vaultLocked) {
          eventBus.emit('terminal:toggle');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [vaultLocked]);

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

  const handleVaultUnlocked = useCallback(() => {
    setVaultStatus({ exists: true, unlocked: true });
  }, []);

  const handleUnpinWidget = useCallback((widgetId: string) => {
    setPinnedWidgets((prev) => prev.filter((w) => w.widgetId !== widgetId));
  }, []);

  const handleWidgetSettingsChange = useCallback(
    (widgetId: string, newSettings: Record<string, unknown>) => {
      setPinnedWidgets((prev) =>
        prev.map((w) =>
          w.widgetId === widgetId ? { ...w, settings: newSettings } : w
        )
      );
    },
    []
  );

  // Hide terminal panel during vault unlock (security: prevent brute-force via terminal)
  useEffect(() => {
    const layout = document.getElementById('app-layout');
    const terminal = document.getElementById('vue-terminal');
    if (vaultLocked) {
      // Hide terminal panel and remove layout margin so vault screen is centered
      terminal?.classList.add('vault-locked');
      layout?.classList.remove('terminal-open');
      // SECURITY: Disable terminal input to prevent password leakage and exploit attempts
      eventBus.emit('terminal:lock');
    } else {
      terminal?.classList.remove('vault-locked');
      // Re-enable terminal input
      eventBus.emit('terminal:unlock');
      // Restore layout margin if terminal was open before lock
      if (terminal?.classList.contains('open')) {
        layout?.classList.add('terminal-open');
      }
    }
  }, [vaultLocked]);

  // Show vault unlock screen if vault exists but is locked
  if (vaultLocked) {
    return (
      <div className="main-panel" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <VaultUnlock
          vaultExists={vaultStatus!.exists}
          onUnlocked={handleVaultUnlocked}
        />
      </div>
    );
  }

  const handleLockVault = () => {
    fetch('/api/vault/lock', { method: 'POST' })
      .then(() => setVaultStatus({ exists: true, unlocked: false }))
      .catch(() => {});
  };

  return (
    <div className="main-panel">
      <Sidebar
        onOpenGoogleAuth={() => setGoogleAuthOpen(true)}
        onOpenFinancialSetup={() => setFinancialSetupOpen(true)}
        onToggleTheme={toggleTheme}
        onOpenFolder={openProjectFolder}
        onLockVault={handleLockVault}
        onToggleSettings={(rect) => setSettingsAnchor((prev) => prev ? null : rect)}
        theme={settings.theme}
        activePage={activePage}
        onNavigate={setActivePage}
      />
      <div className="main-content">
        <div className="main-header">
          <h1>Orc</h1>
          {!terminalOpen && (
            <button className="toggle-btn" onClick={toggleTerminal}>
              Open Terminal
            </button>
          )}
        </div>
        {activePage === 'dashboard' && (
          <Dashboard
            pinnedWidgets={pinnedWidgets}
            onUnpin={handleUnpinWidget}
            onSettingsChange={handleWidgetSettingsChange}
          />
        )}
        {activePage === 'projects' && <ProjectsPage />}
        {activePage === 'planning' && <PlanningPage />}
        {activePage === 'actions' && <ActionsPage />}
        {activePage === 'people' && <PeoplePage />}
        {activePage === 'docs' && <DocsPage />}
        {activePage === 'memory' && <MemoryPage />}
        {activePage === 'knowledge' && <KnowledgePage />}
        {activePage === 'agents' && <AgentsPage />}
        {activePage === 'system' && <SystemPage />}
      </div>

      {settingsAnchor && (
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setSettingsAnchor(null)}
          availableShells={availableShells}
          anchorRect={settingsAnchor}
        />
      )}

      {googleAuthOpen && (
        <GoogleAuthSetup onClose={() => setGoogleAuthOpen(false)} />
      )}

      {financialSetupOpen && (
        <FinancialSetup onClose={() => setFinancialSetupOpen(false)} />
      )}
    </div>
  );
}
