import { createRoot } from 'react-dom/client';
import { getSettings } from './lib/settings';
import App from './App';
import './App.css';
import { mountVueTerminal } from './vue-terminal';

// Apply theme before render to prevent flash
const settings = getSettings();
document.documentElement.dataset.theme = settings.theme;
document.documentElement.dataset.terminalPosition = settings.terminalPosition;

createRoot(document.getElementById('react-root')!).render(<App />);
mountVueTerminal();
