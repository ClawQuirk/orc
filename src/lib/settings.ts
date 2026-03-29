export interface ShellInfo {
  id: string;
  name: string;
  command: string;
}

export interface ClawQuirkSettings {
  theme: 'dark' | 'light';
  terminalFontSize: number;
  autoLaunchCommand: string;
  terminalPosition: 'right' | 'left';
  iconBarPosition: 'top' | 'bottom';
  shell: string;
}

export const DEFAULT_SETTINGS: ClawQuirkSettings = {
  theme: 'dark',
  terminalFontSize: 14,
  autoLaunchCommand: 'claude',
  terminalPosition: 'right',
  iconBarPosition: 'bottom',
  shell: '',
};

export const LAUNCH_PRESETS = [
  { label: 'None', value: '' },
  { label: 'Claude Code', value: 'claude' },
  { label: 'Claude Code (continue)', value: 'claude --continue' },
  { label: 'Claude Code (resume)', value: 'claude --resume' },
  { label: 'Aider', value: 'aider' },
  { label: 'Ollama (Llama 3)', value: 'ollama run llama3' },
  { label: 'Ollama (CodeLlama)', value: 'ollama run codellama' },
] as const;

const STORAGE_KEY = 'clawquirk-settings';

export function getSettings(): ClawQuirkSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: ClawQuirkSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const XTERM_THEMES = {
  dark: {
    background: '#0d0d1a',
    foreground: '#e0e0e0',
    cursor: '#ffffff',
    selectionBackground: '#4a4a8a',
  },
  light: {
    background: '#ffffff',
    foreground: '#2a2a3a',
    cursor: '#333333',
    selectionBackground: '#b0b0d0',
  },
} as const;
