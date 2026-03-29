<template>
  <div class="resize-handle" @mousedown="startResize"></div>
  <div class="terminal-header">
    <span>Terminal</span>
    <button class="close-btn" @click="close">Close Terminal</button>
  </div>
  <div ref="terminalRef" class="terminal-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { eventBus } from '../lib/event-bus';
import { getSettings, XTERM_THEMES } from '../lib/settings';

const terminalRef = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let ws: WebSocket | null = null;
let isOpen = false;
let initialized = false;
let inputLocked = false;

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 300;
const MAX_WIDTH_RATIO = 0.8;

function getPanelState(): boolean {
  return localStorage.getItem('clawquirk-panel-open') === 'true';
}

function setPanelState(open: boolean) {
  localStorage.setItem('clawquirk-panel-open', open ? 'true' : 'false');
}

function getSavedWidth(): number {
  const saved = localStorage.getItem('clawquirk-panel-width');
  return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
}

function setSavedWidth(w: number) {
  localStorage.setItem('clawquirk-panel-width', String(w));
}

function applyWidth(w: number) {
  document.documentElement.style.setProperty('--terminal-width', w + 'px');
}

function getTerminalPosition(): 'left' | 'right' {
  return getSettings().terminalPosition;
}

function startResize(e: MouseEvent) {
  e.preventDefault();
  const pos = getTerminalPosition();
  const onMove = (ev: MouseEvent) => {
    let w: number;
    if (pos === 'right') {
      w = window.innerWidth - ev.clientX;
    } else {
      w = ev.clientX;
    }
    w = Math.min(Math.max(w, MIN_WIDTH), window.innerWidth * MAX_WIDTH_RATIO);
    applyWidth(w);
    fitAddon?.fit();
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const width = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--terminal-width')
    );
    if (width) setSavedWidth(width);
    fitAddon?.fit();
  };
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function getSessionId(): string | null {
  return localStorage.getItem('clawquirk-session');
}

function setSessionId(id: string) {
  localStorage.setItem('clawquirk-session', id);
}

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    const settings = getSettings();
    ws!.send(JSON.stringify({
      type: 'attach',
      sessionId: getSessionId(),
      cols: term!.cols,
      rows: term!.rows,
      autoLaunchCommand: settings.autoLaunchCommand,
      shell: settings.shell || undefined,
    }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case 'session':
        setSessionId(msg.sessionId);
        break;
      case 'scrollback':
        term!.write(msg.data);
        break;
      case 'output':
        term!.write(msg.data);
        break;
      case 'shell-switched':
        term!.clear();
        if (msg.sessionId) setSessionId(msg.sessionId);
        break;
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 2000);
  };
}

function initTerminal() {
  if (initialized || !terminalRef.value) return;
  initialized = true;

  const settings = getSettings();
  const xtermTheme = XTERM_THEMES[settings.theme];

  term = new Terminal({
    cursorBlink: true,
    fontSize: settings.terminalFontSize,
    fontFamily: 'Cascadia Code, Consolas, monospace',
    theme: xtermTheme,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(terminalRef.value);

  term.onData((data: string) => {
    // SECURITY: Block all keyboard input when vault is locked
    if (inputLocked) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  });
}

function fitAndConnect() {
  fitAddon?.fit();
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    connectWebSocket();
  }
  // Auto-focus terminal so user can type immediately
  term?.focus();
}

function fitAfterTransition() {
  const vueEl = document.getElementById('vue-terminal');
  let fired = false;
  const handler = () => {
    if (fired) return;
    fired = true;
    vueEl?.removeEventListener('transitionend', handler);
    fitAndConnect();
  };
  vueEl?.addEventListener('transitionend', handler);
  setTimeout(handler, 350);
}

function setVisible(open: boolean) {
  isOpen = open;
  setPanelState(open);
  const vueEl = document.getElementById('vue-terminal');
  const layout = document.getElementById('app-layout');
  if (open) {
    applyWidth(getSavedWidth());
    vueEl?.classList.add('open');
    layout?.classList.add('terminal-open');
    if (!initialized) {
      nextTick(() => {
        initTerminal();
        fitAfterTransition();
      });
    } else {
      fitAfterTransition();
    }
  } else {
    vueEl?.classList.remove('open');
    layout?.classList.remove('terminal-open');
  }
  eventBus.emit('terminal:visible', open);
}

function close() {
  setVisible(false);
}

function onResize() {
  if (isOpen && fitAddon) {
    fitAddon.fit();
  }
}

onMounted(() => {
  eventBus.on('terminal:toggle', () => setVisible(!isOpen));
  window.addEventListener('resize', onResize);

  // Settings change listeners
  eventBus.on('terminal:theme-changed', (payload: { theme: string; xtermTheme: Record<string, string> }) => {
    if (term) {
      term.options.theme = payload.xtermTheme;
    }
  });

  eventBus.on('terminal:font-size-changed', (size: number) => {
    if (term) {
      term.options.fontSize = size;
      fitAddon?.fit();
    }
  });

  eventBus.on('terminal:position-changed', () => {
    if (isOpen) {
      nextTick(() => fitAddon?.fit());
    }
  });

  eventBus.on('terminal:launch-command-changed', (command: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'restart-session', autoLaunchCommand: command }));
    }
  });

  eventBus.on('terminal:shell-changed', (shell: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'switch-shell', shell: shell || undefined }));
    }
  });

  // SECURITY: Lock/unlock terminal input during vault lock
  eventBus.on('terminal:lock', () => {
    inputLocked = true;
    // Blur the terminal so it cannot capture keystrokes
    term?.blur();
    // Also blur the underlying textarea that xterm.js uses for input
    const textarea = document.querySelector('#vue-terminal textarea');
    if (textarea instanceof HTMLElement) textarea.blur();
  });

  eventBus.on('terminal:unlock', () => {
    inputLocked = false;
    // Do NOT auto-focus — let the user click into the terminal intentionally
  });

  // Restore panel state from previous session
  if (getPanelState()) {
    setVisible(true);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  if (ws) ws.close();
  if (term) term.dispose();
});
</script>
