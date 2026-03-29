import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { stripAnsi } from './chat-utils';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  streaming?: boolean;
}

export default function ChatMessage({ role, content, timestamp, streaming }: ChatMessageProps) {
  const cleanContent = role === 'assistant' ? stripAnsi(content) : content;

  return (
    <div className={`chat-message chat-message-${role}`}>
      <div className="chat-message-header">
        <span className="chat-message-role">
          {role === 'user' ? 'You' : role === 'assistant' ? 'Orc' : 'System'}
        </span>
        {timestamp && (
          <span className="chat-message-time">
            {new Date(timestamp).toLocaleTimeString()}
          </span>
        )}
        {streaming && <span className="chat-streaming-indicator" />}
      </div>
      <div className="chat-message-content">
        {role === 'assistant' ? (
          <Markdown remarkPlugins={[remarkGfm]}>{cleanContent}</Markdown>
        ) : (
          <p>{cleanContent}</p>
        )}
      </div>
    </div>
  );
}
