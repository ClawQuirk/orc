import http from 'node:http';
import { exec } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { PtyManager } from './pty-manager.js';
import { detectAvailableShells } from './shell-detect.js';

const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

// Detect shells at startup
const availableShells = detectAvailableShells();

const ptyManager = new PtyManager();
ptyManager.init();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else if (req.url === '/api/shells') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(availableShells));
  } else if (req.url === '/api/open-folder' && req.method === 'POST') {
    const cwd = process.cwd();
    const platform = process.platform;
    let cmd: string;
    if (platform === 'win32') {
      cmd = `explorer "${cwd}"`;
    } else if (platform === 'darwin') {
      cmd = `open "${cwd}"`;
    } else {
      cmd = `xdg-open "${cwd}"`;
    }
    exec(cmd, (err) => {
      if (err) {
        console.error(`[server] Failed to open folder: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to open folder' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ path: cwd }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[ws] Client connected');
  ptyManager.handleClientConnect(ws);
});

function shutdown() {
  ptyManager.shutdown();
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
  ptyManager.shutdown();
});

server.listen(PORT, () => {
  console.log(`[server] Terminal backend running on port ${PORT}`);
});
