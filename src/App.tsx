import { useState, useEffect, useCallback } from 'react';
import { eventBus } from './lib/event-bus';
import { getSettings, saveSettings, XTERM_THEMES } from './lib/settings';
import type { ClawQuirkSettings, ShellInfo } from './lib/settings';
import { WorkspaceProvider, useWorkspace } from './lib/workspace-context';
import { HOME_WORKSPACE_ID } from '../shared/workspace-types';
import Sidebar from './components/Sidebar';
import type { PageId } from './components/Sidebar';
import SettingsPanel from './components/SettingsPanel';
import Dashboard from './components/Dashboard';
import PlanningPage from './components/PlanningPage';
import ProjectsPage from './components/ProjectsPage';
import ActionsPage from './components/ActionsPage';
import ShoppingPage from './components/ShoppingPage';
import PeoplePage from './components/PeoplePage';
import DocsPage from './components/DocsPage';
import MemoryPage from './components/MemoryPage';
import BrainstormPage from './components/BrainstormPage';
import KnowledgePage from './components/KnowledgePage';
import AgentsPage from './components/AgentsPage';
import BusinessPage from './components/BusinessPage';
import BusinessCreateModal from './components/BusinessCreateModal';
import VaultUnlock from './components/VaultUnlock';
import GoogleAuthSetup from './components/GoogleAuthSetup';
import FinancialSetup from './components/FinancialSetup';
import ShoppingSetup from './components/ShoppingSetup';

interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
}

interface PinnedWidget {
  widgetId: string;
  pluginId: string;
  settings: Record<string, unknown>;
}

const VALID_PAGES: PageId[] = [
  'dashboard',
  'projects',
  'planning',
  'actions',
  'shopping',
  'people',
  'docs',
  'memory',
  'brainstorm',
  'knowledge',
  'agents',
  'business',
];

function readInitialPage(): PageId {
  const stored = localStorage.getItem('orc-active-page');
  if (stored && (VALID_PAGES as string[]).includes(stored)) {
    return stored as PageId;
  }
  if (stored) localStorage.removeItem('orc-active-page');
  return 'dashboard';
}

export default function App() {
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);

  // Check vault status on mount
  useEffect(() => {
    let retries = 0;
    const checkVault = () => {
      fetch('/api/vault/status')
        .then((r) => r.json())
        .then((status: VaultStatus) => setVaultStatus(status))
        .catch(() => {
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

  // Hide terminal panel during vault unlock (security)
  useEffect(() => {
    const layout = document.getElementById('app-layout');
    const terminal = document.getElementById('vue-terminal');
    if (vaultLocked) {
      terminal?.classList.add('vault-locked');
      layout?.classList.remove('terminal-open');
      eventBus.emit('terminal:lock');
    } else {
      terminal?.classList.remove('vault-locked');
      eventBus.emit('terminal:unlock');
      if (terminal?.classList.contains('open')) {
        layout?.classList.add('terminal-open');
      }
    }
  }, [vaultLocked]);

  const handleVaultUnlocked = useCallback(() => {
    setVaultStatus({ exists: true, unlocked: true });
  }, []);

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

  return (
    <WorkspaceProvider enabled={vaultStatus?.unlocked === true}>
      <UnlockedApp setVaultStatus={setVaultStatus} />
    </WorkspaceProvider>
  );
}

interface UnlockedAppProps {
  setVaultStatus: (s: VaultStatus) => void;
}

function UnlockedApp({ setVaultStatus }: UnlockedAppProps) {
  const { activeWorkspaceId, setActiveWorkspace, workspaces } = useWorkspace();
  const [settings, setSettings] = useState(getSettings);
  const [terminalOpen, setTerminalOpen] = useState(
    () => localStorage.getItem('clawquirk-panel-open') === 'true'
  );
  const [activePage, setActivePage] = useState<PageId>(readInitialPage);
  const [googleAuthOpen, setGoogleAuthOpen] = useState(false);
  const [financialSetupOpen, setFinancialSetupOpen] = useState(false);
  const [shoppingSetupOpen, setShoppingSetupOpen] = useState(false);
  const [businessCreateOpen, setBusinessCreateOpen] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<DOMRect | null>(null);
  const [availableShells, setAvailableShells] = useState<ShellInfo[]>([]);
  const [pinnedWidgets, setPinnedWidgets] = useState<PinnedWidget[]>([]);

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

  // Reset pinned widgets when workspace changes (in-memory only; not persisted)
  useEffect(() => {
    setPinnedWidgets([]);
  }, [activeWorkspaceId]);

  // If active workspace vanishes (archived/deleted), fall back to Home + Dashboard
  useEffect(() => {
    if (workspaces.length === 0) return;
    const exists = workspaces.some((w) => w.id === activeWorkspaceId);
    if (!exists) {
      setActiveWorkspace(HOME_WORKSPACE_ID);
      setActivePage('dashboard');
      localStorage.setItem('orc-active-page', 'dashboard');
    }
  }, [workspaces, activeWorkspaceId, setActiveWorkspace]);

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

  const handleLockVault = () => {
    fetch('/api/vault/lock', { method: 'POST' })
      .then(() => setVaultStatus({ exists: true, unlocked: false }))
      .catch(() => {});
  };

  const handleNavigate = useCallback((workspaceId: string, page: PageId) => {
    setActiveWorkspace(workspaceId);
    setActivePage(page);
    localStorage.setItem('orc-active-page', page);
  }, [setActiveWorkspace]);

  const handleBusinessCreated = useCallback((newId: string) => {
    setBusinessCreateOpen(false);
    setActiveWorkspace(newId);
    setActivePage('business');
    localStorage.setItem('orc-active-page', 'business');
  }, [setActiveWorkspace]);

  const handleBusinessDeleted = useCallback(() => {
    setActiveWorkspace(HOME_WORKSPACE_ID);
    setActivePage('dashboard');
    localStorage.setItem('orc-active-page', 'dashboard');
  }, [setActiveWorkspace]);

  return (
    <div className="main-panel">
      <Sidebar
        onToggleTheme={toggleTheme}
        onOpenFolder={openProjectFolder}
        onLockVault={handleLockVault}
        onToggleSettings={(rect) => setSettingsAnchor((prev) => prev ? null : rect)}
        onNewBusiness={() => setBusinessCreateOpen(true)}
        theme={settings.theme}
        activeWorkspaceId={activeWorkspaceId}
        activePage={activePage}
        onNavigate={handleNavigate}
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
        {activePage === 'shopping' && <ShoppingPage />}
        {activePage === 'people' && <PeoplePage />}
        {activePage === 'docs' && <DocsPage />}
        {activePage === 'memory' && <MemoryPage />}
        {activePage === 'brainstorm' && <BrainstormPage />}
        {activePage === 'knowledge' && <KnowledgePage />}
        {activePage === 'agents' && <AgentsPage />}
        {activePage === 'business' && (
          <BusinessPage
            workspaceId={activeWorkspaceId}
            onNavigatePage={(p) => handleNavigate(activeWorkspaceId, p as PageId)}
            onDeleted={handleBusinessDeleted}
          />
        )}
      </div>

      {settingsAnchor && (
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setSettingsAnchor(null)}
          availableShells={availableShells}
          anchorRect={settingsAnchor}
          onOpenGoogleAuth={() => { setSettingsAnchor(null); setGoogleAuthOpen(true); }}
          onOpenFinancialSetup={() => { setSettingsAnchor(null); setFinancialSetupOpen(true); }}
          onOpenShoppingSetup={() => { setSettingsAnchor(null); setShoppingSetupOpen(true); }}
        />
      )}

      {googleAuthOpen && (
        <GoogleAuthSetup onClose={() => setGoogleAuthOpen(false)} />
      )}

      {financialSetupOpen && (
        <FinancialSetup onClose={() => setFinancialSetupOpen(false)} />
      )}

      {shoppingSetupOpen && (
        <ShoppingSetup onClose={() => setShoppingSetupOpen(false)} />
      )}

      {businessCreateOpen && (
        <BusinessCreateModal
          onClose={() => setBusinessCreateOpen(false)}
          onCreated={handleBusinessCreated}
        />
      )}
    </div>
  );
}
