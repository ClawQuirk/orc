import type { ServerPlugin, PluginDependencies, ToolResult } from './base-plugin.js';
import type { PluginToolDefinition } from '../../shared/plugin-types.js';

export interface PluginToolEntry {
  plugin: ServerPlugin;
  tool: PluginToolDefinition;
}

class PluginLoader {
  private plugins = new Map<string, ServerPlugin>();

  async register(
    plugin: ServerPlugin,
    deps: PluginDependencies
  ): Promise<void> {
    await plugin.initialize(deps);
    this.plugins.set(plugin.manifest.id, plugin);
    console.log(
      `[plugins] Registered: ${plugin.manifest.name} (${plugin.tools.length} tools)`
    );
  }

  getPlugin(id: string): ServerPlugin | undefined {
    return this.plugins.get(id);
  }

  getAllPlugins(): ServerPlugin[] {
    return Array.from(this.plugins.values());
  }

  getAllTools(): PluginToolEntry[] {
    const tools: PluginToolEntry[] = [];
    for (const plugin of this.plugins.values()) {
      for (const tool of plugin.tools) {
        tools.push({ plugin, tool });
      }
    }
    return tools;
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    for (const plugin of this.plugins.values()) {
      const tool = plugin.tools.find((t) => t.name === toolName);
      if (tool) {
        return plugin.executeTool(toolName, args);
      }
    }
    return {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  async shutdownAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.shutdown();
    }
    this.plugins.clear();
  }
}

export const pluginLoader = new PluginLoader();
