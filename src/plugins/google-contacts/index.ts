import type { FrontendPlugin } from '../registry';
import ContactsWidget from './ContactsWidget';

export const contactsPlugin: FrontendPlugin = {
  manifest: {
    id: 'google-contacts',
    name: 'Google Contacts',
    description: 'Search, view, and create contacts via Google People API',
    version: '0.1.0',
    icon: 'contacts',
    category: 'contacts',
    requiresAuth: true,
    authType: 'oauth2',
  },
  widgets: [
    {
      manifest: {
        id: 'contacts-search',
        pluginId: 'google-contacts',
        title: 'Contacts',
        defaultSize: { w: 1, h: 2 },
        minSize: { w: 1, h: 1 },
        refreshIntervalMs: 0, // Manual search only
      },
      component: ContactsWidget,
    },
  ],
};
