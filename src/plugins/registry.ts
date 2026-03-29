import type { PluginManifest, WidgetManifest } from '../../shared/plugin-types';
import type { ComponentType } from 'react';

export interface WidgetProps {
  widgetId: string;
  pluginId: string;
  settings: Record<string, unknown>;
  onSettingsChange: (settings: Record<string, unknown>) => void;
}

export interface WidgetRegistration {
  manifest: WidgetManifest;
  component: ComponentType<WidgetProps>;
}

export interface FrontendPlugin {
  manifest: PluginManifest;
  widgets: WidgetRegistration[];
}

class FrontendPluginRegistry {
  private plugins = new Map<string, FrontendPlugin>();
  private widgets = new Map<string, WidgetRegistration>();

  register(plugin: FrontendPlugin): void {
    this.plugins.set(plugin.manifest.id, plugin);
    for (const widget of plugin.widgets) {
      this.widgets.set(widget.manifest.id, widget);
    }
  }

  getPlugin(id: string): FrontendPlugin | undefined {
    return this.plugins.get(id);
  }

  getWidget(id: string): WidgetRegistration | undefined {
    return this.widgets.get(id);
  }

  getAllPlugins(): FrontendPlugin[] {
    return Array.from(this.plugins.values());
  }

  getAllWidgets(): WidgetRegistration[] {
    return Array.from(this.widgets.values());
  }
}

export const pluginRegistry = new FrontendPluginRegistry();
