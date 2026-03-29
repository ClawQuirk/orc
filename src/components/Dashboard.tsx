import { pluginRegistry } from '../plugins/registry';
import DashboardWidget from './DashboardWidget';

interface PinnedWidget {
  widgetId: string;
  pluginId: string;
  settings: Record<string, unknown>;
}

interface DashboardProps {
  pinnedWidgets: PinnedWidget[];
  onUnpin: (widgetId: string) => void;
  onSettingsChange: (widgetId: string, settings: Record<string, unknown>) => void;
}

export default function Dashboard({ pinnedWidgets, onUnpin, onSettingsChange }: DashboardProps) {
  if (pinnedWidgets.length === 0) return null;

  return (
    <div className="dashboard-grid">
      {pinnedWidgets.map((pw) => {
        const registration = pluginRegistry.getWidget(pw.widgetId);
        if (!registration) return null;
        const WidgetComponent = registration.component;

        return (
          <DashboardWidget
            key={pw.widgetId}
            title={registration.manifest.title}
            pluginId={pw.pluginId}
            widgetId={pw.widgetId}
            onUnpin={() => onUnpin(pw.widgetId)}
          >
            <WidgetComponent
              widgetId={pw.widgetId}
              pluginId={pw.pluginId}
              settings={pw.settings}
              onSettingsChange={(s) => onSettingsChange(pw.widgetId, s)}
            />
          </DashboardWidget>
        );
      })}
    </div>
  );
}
