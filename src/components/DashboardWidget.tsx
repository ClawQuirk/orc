import { useState } from 'react';

interface DashboardWidgetProps {
  title: string;
  pluginId: string;
  widgetId: string;
  onUnpin?: () => void;
  children: React.ReactNode;
}

export default function DashboardWidget({
  title,
  onUnpin,
  children,
}: DashboardWidgetProps) {
  const [minimized, setMinimized] = useState(false);

  return (
    <div className={`dashboard-widget ${minimized ? 'minimized' : ''}`}>
      <div className="widget-header">
        <span className="widget-title">{title}</span>
        <div className="widget-actions">
          <button
            className="widget-btn"
            onClick={() => setMinimized(!minimized)}
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? '+' : '\u2013'}
          </button>
          {onUnpin && (
            <button className="widget-btn" onClick={onUnpin} title="Unpin">
              \u00d7
            </button>
          )}
        </div>
      </div>
      {!minimized && <div className="widget-body">{children}</div>}
    </div>
  );
}
