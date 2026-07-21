/**
 * ============================================================================
 * SECURITY WARNING — NO WORKING AUTHENTICATION MODEL
 * ============================================================================
 * This MCP server currently has NO functioning authentication against the
 * main Cybersage app. The `MCP_SERVICE_TOKEN` env var below is plumbing only:
 * if set, it is attached as an `Authorization: Bearer <token>` header on every
 * outbound request to the app's API routes. But the target routes
 * (/api/send, /api/contacts, /api/campaigns, /api/email-logs) do NOT
 * currently validate that header — tool calls will fail with 401/403 (or, if
 * those routes happen to be unauthenticated, will run with NO per-user
 * permission scoping at all) until server-side changes are made.
 *
 * DO NOT "fix" this by adding a shared bypass/service token check to the
 * target API routes that simply lets any MCP-originated request through.
 * That would let a single shared secret impersonate an arbitrary user/action
 * with no per-invoking-user permission scoping (e.g. RBAC `can()` checks),
 * which is a worse hole than the current fail-closed 401s. A proper fix
 * needs a per-user-scoped credential (e.g. an API key or short-lived token
 * minted for the specific user invoking the MCP tool, checked against that
 * user's RBAC permissions), not a global shared secret.
 * ============================================================================
 */

/**
 * ============================================================================
 * MANUAL FOLLOW-UP REQUIRED — @modelcontextprotocol/sdk bumped 0.4.0 -> ^1.24.0
 * ============================================================================
 * This bump (finding F-10: 0.4.0 predates the SDK's DNS-rebinding protection
 * for HTTP/SSE transports) is a semver-major jump and the SDK's API surface
 * changed substantially between 0.4.x and 1.x. The code below was written
 * against the old 0.4.0 API and has NOT been migrated — it will very likely
 * throw at startup or misbehave until someone does the migration work and
 * tests it against a real MCP client. Known/likely breaking changes to check:
 *   - `Server#setRequestHandler(methodNameString, handler)` (used below with
 *     raw strings "tools/list" / "tools/call") — 1.x expects a Zod request
 *     schema object (e.g. `ListToolsRequestSchema`, `CallToolRequestSchema`
 *     from "@modelcontextprotocol/sdk/types.js"), not a bare method-name
 *     string.
 *   - `new Server({ name, version })` — 1.x's `Server` constructor takes a
 *     second argument for declared `capabilities` (e.g. `{ capabilities: {
 *     tools: {} } }`); omitting it may prevent tool discovery from working
 *     with strict clients.
 *   - Subclassing `Server` directly (as `CybersageMailServer extends Server`
 *     does here) is not the idiomatic 1.x pattern — most 1.x examples compose
 *     via a plain `Server`/`McpServer` instance and `server.tool(...)` /
 *     `server.registerTool(...)` helpers rather than subclassing.
 *   - Import subpaths (`@modelcontextprotocol/sdk/server/index.js`,
 *     `.../server/stdio.js`) should still resolve in 1.x, but confirm against
 *     the installed version's `exports` map — the SDK is mid-transition to a
 *     v2 split (`@modelcontextprotocol/server` / `@modelcontextprotocol/client`)
 *     and 1.x is the currently-supported production line.
 * DO NOT ship this version bump without exercising `npm run mcp` end-to-end
 * against a real MCP client (e.g. Claude Desktop / Claude Code) first.
 * ============================================================================
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// If set, attached as a Bearer token on every outbound fetch to the main app.
// See the security warning above — this has no corresponding server-side
// validation yet and is not a complete auth mechanism on its own.
const MCP_SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN || null;

function serviceAuthHeaders(extra = {}) {
  return MCP_SERVICE_TOKEN
    ? { ...extra, Authorization: `Bearer ${MCP_SERVICE_TOKEN}` }
    : { ...extra };
}

class CybersageMailServer extends Server {
  constructor() {
    super({
      name: "cybersage-mail",
      version: "1.0.0",
    });

    this.setRequestHandler("tools/list", this.handleListTools.bind(this));
    this.setRequestHandler("tools/call", this.handleCallTool.bind(this));
  }

  async handleListTools() {
    return {
      tools: [
        {
          name: "send_email",
          description: "Send an email using the Cybersage Mail service",
          inputSchema: {
            type: "object",
            properties: {
              to: { type: "string", description: "Recipient email address" },
              subject: { type: "string", description: "Email subject" },
              body: { type: "string", description: "Email body in HTML or text" },
              from: { type: "string", description: "Sender email address (optional, uses default)" },
            },
            required: ["to", "subject", "body"],
          },
        },
        {
          name: "get_contacts",
          description: "Get list of contacts from the Cybersage Mail database",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Maximum number of contacts to return (default 100)" },
              offset: { type: "number", description: "Offset for pagination (default 0)" },
            },
          },
        },
        {
          name: "create_campaign",
          description: "Create a new email campaign",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Campaign name" },
              description: { type: "string", description: "Campaign description" },
              templateId: { type: "string", description: "Template ID to use" },
            },
            required: ["name"],
          },
        },
        {
          name: "get_email_logs",
          description: "Get email delivery logs",
          inputSchema: {
            type: "object",
            properties: {
              campaignId: { type: "string", description: "Filter by campaign ID" },
              status: { type: "string", description: "Filter by status (SENT, DELIVERED, etc.)" },
              limit: { type: "number", description: "Maximum number of logs to return (default 50)" },
            },
          },
        },
      ],
    };
  }

  async handleCallTool(request) {
    const { name, arguments: args } = request.params;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    try {
      switch (name) {
        case "send_email":
          const sendResponse = await fetch(`${baseUrl}/api/send`, {
            method: "POST",
            headers: serviceAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              to: [args.to],
              subject: args.subject,
              html: args.body,
              from: args.from,
            }),
          });
          const sendResult = await sendResponse.json();
          return {
            content: [{ type: "text", text: JSON.stringify(sendResult, null, 2) }],
          };

        case "get_contacts":
          const contactsResponse = await fetch(`${baseUrl}/api/contacts?limit=${args.limit || 100}&offset=${args.offset || 0}`, {
            headers: serviceAuthHeaders(),
          });
          const contacts = await contactsResponse.json();
          return {
            content: [{ type: "text", text: JSON.stringify(contacts, null, 2) }],
          };

        case "create_campaign":
          const campaignResponse = await fetch(`${baseUrl}/api/campaigns`, {
            method: "POST",
            headers: serviceAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(args),
          });
          const campaign = await campaignResponse.json();
          return {
            content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }],
          };

        case "get_email_logs":
          const logsParams = new URLSearchParams();
          if (args.campaignId) logsParams.append("campaignId", args.campaignId);
          if (args.status) logsParams.append("status", args.status);
          if (args.limit) logsParams.append("limit", args.limit.toString());
          const logsResponse = await fetch(`${baseUrl}/api/email-logs?${logsParams}`, {
            headers: serviceAuthHeaders(),
          });
          const logs = await logsResponse.json();
          return {
            content: [{ type: "text", text: JSON.stringify(logs, null, 2) }],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
}

const server = new CybersageMailServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("Cybersage Mail MCP server running on stdio");