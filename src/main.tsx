import { createRoot } from 'react-dom/client';
import { getSettings } from './lib/settings';
import App from './App';
import './App.css';
import { mountVueTerminal } from './vue-terminal';
import { pluginRegistry } from './plugins/registry';
import { gmailPlugin } from './plugins/google-gmail/index';
import { calendarPlugin } from './plugins/google-calendar/index';
import { contactsPlugin } from './plugins/google-contacts/index';

// Apply theme before render to prevent flash
const settings = getSettings();
document.documentElement.dataset.theme = settings.theme;
document.documentElement.dataset.terminalPosition = settings.terminalPosition;

// Register plugins
pluginRegistry.register(gmailPlugin);
pluginRegistry.register(calendarPlugin);
pluginRegistry.register(contactsPlugin);

createRoot(document.getElementById('react-root')!).render(<App />);
mountVueTerminal();
