import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

async function fetchTools(): Promise<ToolDef[]> {
  const res = await fetch(`${BACKEND_URL}/api/mcp/tools`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch tools: ${(body as any).error || res.statusText}`);
  }
  const data = (await res.json()) as { tools: ToolDef[] };
  return data.tools;
}

async function executeTool(
  tool: string,
  args: Record<string, unknown>
): Promise<any> {
  const res = await fetch(`${BACKEND_URL}/api/mcp/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return {
      content: [
        { type: 'text', text: `Error: ${(body as any).error || res.statusText}` },
      ],
      isError: true,
    };
  }
  return res.json();
}

async function main() {
  // Fetch tool definitions from the running backend
  let tools: ToolDef[];
  try {
    tools = await fetchTools();
  } catch (err: any) {
    console.error(`[mcp] Cannot reach backend at ${BACKEND_URL}: ${err.message}`);
    console.error(
      '[mcp] Make sure the Orc backend is running and the vault is unlocked.'
    );
    process.exit(1);
  }

  const server = new Server(
    { name: 'orc', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // List tools — return raw JSON schemas from the backend
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // Execute tools — proxy to the backend
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return executeTool(name, args ?? {});
  });

  console.error(
    `[mcp] Orc MCP server starting with ${tools.length} tools (proxied via backend)`
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[mcp] Fatal error:', err);
  process.exit(1);
});
