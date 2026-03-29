import type { ChatStreamChunk } from './types.js';
import { detectPromptReturn, stripAnsi } from './response-parser.js';

type BridgeState = 'idle' | 'waiting' | 'streaming';

const RESPONSE_TIMEOUT_MS = 120_000; // 2 min max response time
const IDLE_TIMEOUT_MS = 30_000;      // 30s of silence = done (MCP tool calls need time)

export class ChatBridge {
  private state: BridgeState = 'idle';
  private currentMessageId: string | null = null;
  private responseBuffer = '';
  private listeners = new Set<(chunk: ChatStreamChunk) => void>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;
  private writeFn: ((data: string) => void) | null = null;

  setWriteFn(fn: (data: string) => void): void {
    this.writeFn = fn;
  }

  // Called by PtyManager on every PTY output chunk
  onPtyOutput(data: string): void {
    if (this.state === 'idle') return;

    if (this.state === 'waiting') {
      // LLM has started producing output
      this.state = 'streaming';
    }

    if (this.state === 'streaming') {
      this.responseBuffer += data;

      // Emit chunk to listeners
      this.emit({
        messageId: this.currentMessageId!,
        type: 'content',
        content: data,
      });

      // Reset idle timer
      this.resetIdleTimer();

      // Check if LLM prompt has returned (response complete)
      if (detectPromptReturn(this.responseBuffer)) {
        this.finishResponse();
      }
    }
  }

  sendMessage(messageId: string, content: string): void {
    if (!this.writeFn) {
      this.emit({
        messageId,
        type: 'error',
        error: 'Terminal not connected',
      });
      return;
    }

    this.currentMessageId = messageId;
    this.responseBuffer = '';
    this.state = 'waiting';

    // Set max response timeout
    this.responseTimer = setTimeout(() => {
      if (this.state !== 'idle') {
        this.finishResponse();
      }
    }, RESPONSE_TIMEOUT_MS);

    // Set initial idle timeout (for detecting response start)
    this.resetIdleTimer();

    // Write to PTY stdin
    this.writeFn(content + '\r');
  }

  onChunk(listener: (chunk: ChatStreamChunk) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isActive(): boolean {
    return this.state !== 'idle';
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.state === 'streaming') {
        this.finishResponse();
      }
    }, IDLE_TIMEOUT_MS);
  }

  private finishResponse(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.responseTimer) clearTimeout(this.responseTimer);

    this.emit({
      messageId: this.currentMessageId!,
      type: 'done',
    });

    this.state = 'idle';
    this.currentMessageId = null;
    this.responseBuffer = '';
  }

  private emit(chunk: ChatStreamChunk): void {
    for (const listener of this.listeners) {
      listener(chunk);
    }
  }
}
