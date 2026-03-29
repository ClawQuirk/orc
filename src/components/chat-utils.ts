// Strip ANSI escape sequences from terminal output for display
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}
