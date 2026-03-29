import type { FrontendPlugin } from '../registry';
import GmailWidget from './GmailWidget';

export const gmailPlugin: FrontendPlugin = {
  manifest: {
    id: 'google-gmail',
    name: 'Gmail',
    description: 'Search, read, and send emails via Gmail',
    version: '0.1.0',
    icon: 'gmail',
    category: 'email',
    requiresAuth: true,
    authType: 'oauth2',
  },
  widgets: [
    {
      manifest: {
        id: 'gmail-inbox',
        pluginId: 'google-gmail',
        title: 'Gmail Inbox',
        defaultSize: { w: 2, h: 2 },
        minSize: { w: 1, h: 1 },
        refreshIntervalMs: 60_000,
      },
      component: GmailWidget,
    },
  ],
};
