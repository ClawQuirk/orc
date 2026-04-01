import type { ServiceBrowserConfig } from './types.js';

class ServiceRegistry {
  private configs = new Map<string, ServiceBrowserConfig>();

  register(config: ServiceBrowserConfig): void {
    this.configs.set(config.serviceId, config);
    console.log(`[automation] Registered browser config for: ${config.serviceId}`);
  }

  get(serviceId: string): ServiceBrowserConfig | undefined {
    return this.configs.get(serviceId);
  }

  getAll(): ServiceBrowserConfig[] {
    return [...this.configs.values()];
  }

  has(serviceId: string): boolean {
    return this.configs.has(serviceId);
  }
}

export const serviceRegistry = new ServiceRegistry();
