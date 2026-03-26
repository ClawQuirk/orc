import { execSync } from 'node:child_process';

export interface ShellInfo {
  id: string;
  name: string;
  command: string;
}

const SHELL_CANDIDATES: Record<string, ShellInfo[]> = {
  win32: [
    { id: 'pwsh', name: 'PowerShell 7', command: 'pwsh.exe' },
    { id: 'powershell', name: 'Windows PowerShell', command: 'powershell.exe' },
    { id: 'cmd', name: 'Command Prompt', command: 'cmd.exe' },
    { id: 'bash', name: 'Git Bash', command: 'bash.exe' },
  ],
  darwin: [
    { id: 'zsh', name: 'Zsh', command: '/bin/zsh' },
    { id: 'bash', name: 'Bash', command: '/bin/bash' },
    { id: 'fish', name: 'Fish', command: '/usr/local/bin/fish' },
    { id: 'pwsh', name: 'PowerShell', command: 'pwsh' },
  ],
  linux: [
    { id: 'bash', name: 'Bash', command: '/bin/bash' },
    { id: 'zsh', name: 'Zsh', command: '/usr/bin/zsh' },
    { id: 'fish', name: 'Fish', command: '/usr/bin/fish' },
    { id: 'sh', name: 'sh', command: '/bin/sh' },
    { id: 'pwsh', name: 'PowerShell', command: 'pwsh' },
  ],
};

let cachedShells: ShellInfo[] | null = null;

function shellExists(command: string): boolean {
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${probe} ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function detectAvailableShells(): ShellInfo[] {
  if (cachedShells) return cachedShells;

  const candidates = SHELL_CANDIDATES[process.platform] ?? SHELL_CANDIDATES.linux;
  cachedShells = candidates.filter((s) => shellExists(s.command));

  console.log(`[shells] Detected: ${cachedShells.map((s) => s.name).join(', ')}`);
  return cachedShells;
}

export function getDefaultShell(): ShellInfo {
  const shells = detectAvailableShells();
  return shells[0] ?? { id: 'sh', name: 'sh', command: '/bin/sh' };
}

export function isValidShell(command: string): boolean {
  return detectAvailableShells().some((s) => s.command === command);
}
