#!/usr/bin/env node
/**
 * WeBrief MCP Server — v1 stdio transport
 *
 * Environment variables:
 *   WEBRIEF_MCP_TOKEN   Required. The mcpt_* token for authenticating with the WeBrief backend.
 *   WEBRIEF_BACKEND_URL Optional. Defaults to http://localhost:3000.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as tools from './tools/index.js';

// Validate required env vars at startup (non-fatal in Fase 0 since all handlers
// are no-ops, but the warning is useful during integration testing).
if (!process.env.WEBRIEF_MCP_TOKEN) {
  process.stderr.write(
    '[webbrief-mcp] WARNING: WEBRIEF_MCP_TOKEN is not set. ' +
      'All tool calls will fail with an auth error once handlers are implemented.\n'
  );
}

const server = new McpServer(
  {
    name: 'webbrief',
    version: '0.1.0',
  },
  {
    capabilities: { tools: {} },
    instructions:
      'WeBrief MCP server. Use session.getContext first to discover your companyId, ' +
      'then use the project and page tools to manage WeBrief content on the user\'s behalf.',
  }
);

// Register all 10 v1 tools
for (const tool of Object.values(tools)) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (input) => {
      const result = await tool.handler(input);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write('[webbrief-mcp] Server started on stdio transport.\n');
