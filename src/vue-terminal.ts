import { createApp } from 'vue';
import TerminalPanel from './components/TerminalPanel.vue';

export function mountVueTerminal() {
  const el = document.getElementById('vue-terminal');
  if (el) {
    createApp(TerminalPanel).mount(el);
  }
}
