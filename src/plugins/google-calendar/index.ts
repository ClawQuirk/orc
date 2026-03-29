import type { FrontendPlugin } from '../registry';
import CalendarWidget from './CalendarWidget';

export const calendarPlugin: FrontendPlugin = {
  manifest: {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'View, create, and manage calendar events',
    version: '0.1.0',
    icon: 'calendar',
    category: 'calendar',
    requiresAuth: true,
    authType: 'oauth2',
  },
  widgets: [
    {
      manifest: {
        id: 'calendar-today',
        pluginId: 'google-calendar',
        title: 'Today\'s Agenda',
        defaultSize: { w: 2, h: 2 },
        minSize: { w: 1, h: 1 },
        refreshIntervalMs: 120_000,
      },
      component: CalendarWidget,
    },
  ],
};
