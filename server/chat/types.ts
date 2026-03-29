export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ChatStreamChunk {
  messageId: string;
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
}
