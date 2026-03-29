// Strips ANSI escape sequences from terminal output
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

// Prompt patterns for common LLMs to detect when response is complete
const PROMPT_PATTERNS = [
  /\n>\s*$/,                    // Claude Code: "> "
  /\naider>\s*$/,               // Aider: "aider> "
  /\n>>>\s*$/,                  // Ollama / generic
  /\n\$\s*$/,                   // Shell prompt
  /\n%\s*$/,                    // Zsh prompt
  /\n❯\s*$/,                    // Starship / custom prompt
  /\nPS[^>]*>\s*$/,             // PowerShell
];

export function detectPromptReturn(buffer: string): boolean {
  const clean = stripAnsi(buffer).trimEnd();
  return PROMPT_PATTERNS.some((p) => p.test(clean));
}

// Detect when LLM starts producing output after our input
export function detectResponseStart(data: string, inputEcho: string): boolean {
  const clean = stripAnsi(data);
  // If we see content beyond just our echoed input, the LLM is responding
  return clean.length > 0 && !clean.trim().endsWith(inputEcho.trim());
}
