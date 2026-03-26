import pty, { type IPty } from 'node-pty';
import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import * as sessionStore from './session-store.js';
import type { SessionData } from './session-store.js';
import { getDefaultShell, isValidShell } from './shell-detect.js';

const MAX_SCROLLBACK = 100_000;
const SAVE_INTERVAL_MS = 5_000;
const AUTO_LAUNCH_DELAY_MS = 2_000;

export class PtyManager {
  private ptyProcess: IPty | null = null;
  private scrollback = '';
  private sessionId = '';
  private cols = 120;
  private rows = 30;
  private clients = new Set<WebSocket>();
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private commandLaunched = false;
  private currentShell: string;

  constructor() {
    this.currentShell = getDefaultShell().command;
  }

  init() {
    const saved = sessionStore.load();
    if (saved) {
      this.sessionId = saved.sessionId;
      this.scrollback = saved.scrollback;
      this.cols = saved.cols;
      this.rows = saved.rows;
      console.log(`[pty] Restored session ${this.sessionId} (${this.scrollback.length} chars scrollback)`);
    } else {
      this.sessionId = randomUUID();
      console.log(`[pty] Created new session ${this.sessionId}`);
    }

    this.spawnPty();

    this.saveTimer = setInterval(() => this.save(), SAVE_INTERVAL_MS);
  }

  private spawnPty() {
    console.log(`[pty] Spawning shell: ${this.currentShell}`);
    this.ptyProcess = pty.spawn(this.currentShell, [], {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.ptyProcess.onData((data: string) => {
      this.scrollback += data;
      if (this.scrollback.length > MAX_SCROLLBACK) {
        this.scrollback = this.scrollback.slice(-MAX_SCROLLBACK);
      }
      const msg = JSON.stringify({ type: 'output', data });
      for (const client of this.clients) {
        if (client.readyState === 1) {
          client.send(msg);
        }
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      console.log(`[pty] Process exited with code ${exitCode}`);
    });
  }

  private switchShell(shell: string) {
    if (!isValidShell(shell)) {
      console.log(`[pty] Rejected invalid shell: ${shell}`);
      return;
    }

    console.log(`[pty] Switching shell to: ${shell}`);

    // Kill existing PTY
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }

    // Reset state for new shell
    this.currentShell = shell;
    this.scrollback = '';
    this.commandLaunched = false;
    this.sessionId = randomUUID();

    // Spawn new PTY
    this.spawnPty();

    // Notify all clients
    const msg = JSON.stringify({ type: 'shell-switched', sessionId: this.sessionId });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  }

  private restartSession(autoLaunchCommand?: string) {
    console.log(`[pty] Restarting session`);

    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }

    this.scrollback = '';
    this.commandLaunched = false;
    this.sessionId = randomUUID();

    this.spawnPty();

    // Auto-launch command in new PTY
    if (autoLaunchCommand && autoLaunchCommand.trim()) {
      this.commandLaunched = true;
      setTimeout(() => {
        this.ptyProcess?.write(autoLaunchCommand.trim() + '\r');
      }, AUTO_LAUNCH_DELAY_MS);
    }

    const msg = JSON.stringify({ type: 'shell-switched', sessionId: this.sessionId });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  }

  handleClientConnect(ws: WebSocket) {
    this.clients.add(ws);

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());
        switch (msg.type) {
          case 'attach':
            // Switch shell if client requests a different one
            if (msg.shell && msg.shell !== this.currentShell && isValidShell(msg.shell)) {
              this.switchShell(msg.shell);
            }
            // Resize PTY to match client before sending scrollback
            if (msg.cols && msg.rows) {
              this.resize(msg.cols, msg.rows);
            }
            ws.send(JSON.stringify({ type: 'session', sessionId: this.sessionId }));
            if (this.scrollback.length > 0) {
              ws.send(JSON.stringify({ type: 'scrollback', data: this.scrollback }));
            }
            // Auto-launch command on first client attach if provided
            if (!this.commandLaunched) {
              const cmd = msg.autoLaunchCommand;
              if (cmd && typeof cmd === 'string' && cmd.trim()) {
                this.commandLaunched = true;
                setTimeout(() => {
                  this.ptyProcess?.write(cmd.trim() + '\r');
                }, AUTO_LAUNCH_DELAY_MS);
              }
            }
            break;
          case 'input':
            this.ptyProcess?.write(msg.data);
            break;
          case 'resize':
            this.resize(msg.cols, msg.rows);
            break;
          case 'restart-session':
            this.restartSession(msg.autoLaunchCommand);
            break;
          case 'switch-shell':
            if (msg.shell) {
              this.switchShell(msg.shell);
            }
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  private resize(cols: number, rows: number) {
    if (cols > 0 && rows > 0) {
      this.cols = cols;
      this.rows = rows;
      this.ptyProcess?.resize(cols, rows);
    }
  }

  private save() {
    const data: SessionData = {
      sessionId: this.sessionId,
      scrollback: this.scrollback.slice(-MAX_SCROLLBACK),
      cols: this.cols,
      rows: this.rows,
      createdAt: sessionStore.load()?.createdAt ?? new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };
    sessionStore.save(data);
  }

  shutdown() {
    console.log('[pty] Shutting down...');
    this.save();
    if (this.saveTimer) clearInterval(this.saveTimer);
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }
}
