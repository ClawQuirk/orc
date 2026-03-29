import { useState, useEffect, useRef, useCallback } from 'react';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  streaming?: boolean;
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamBufferRef = useRef('');

  // Load chat history on mount
  useEffect(() => {
    fetch('/api/chat/history?limit=100')
      .then((r) => r.json())
      .then((data: { messages: Message[] }) => {
        if (data.messages?.length) {
          setMessages(data.messages);
        }
      })
      .catch(() => {});
  }, []);

  // Connect to WebSocket for chat streaming
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type !== 'chat:chunk') return;

          if (msg.chunkType === 'content' && msg.content) {
            streamBufferRef.current += msg.content;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.id === msg.messageId && last.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: streamBufferRef.current },
                ];
              }
              return [
                ...prev,
                {
                  id: msg.messageId,
                  role: 'assistant',
                  content: streamBufferRef.current,
                  timestamp: new Date().toISOString(),
                  streaming: true,
                },
              ];
            });
          } else if (msg.chunkType === 'done') {
            finishStreaming(msg.messageId);
          } else if (msg.chunkType === 'error') {
            setIsStreaming(false);
            streamBufferRef.current = '';
          }
        } catch {
          // Not a chat message, ignore
        }
      };

      ws.onclose = () => {
        setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  const finishStreaming = useCallback((messageId: string) => {
    setIsStreaming(false);
    const content = streamBufferRef.current;
    streamBufferRef.current = '';

    // Save assistant response to DB
    if (content && wsRef.current?.readyState === 1) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:save-response',
          messageId,
          content,
        })
      );
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, streaming: false } : m
      )
    );
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    (content: string) => {
      const messageId = crypto.randomUUID();
      const userMessage: Message = {
        id: messageId,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      streamBufferRef.current = '';

      // Send via WebSocket
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(
          JSON.stringify({
            type: 'chat:send',
            messageId,
            content,
          })
        );
      }
    },
    []
  );

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <h3>Welcome to Orc</h3>
            <p>Your personal knowledge assistant. Ask me anything about your email, calendar, contacts, and more.</p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
            streaming={msg.streaming}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
