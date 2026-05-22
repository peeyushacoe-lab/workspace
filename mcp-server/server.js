import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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
            headers: { "Content-Type": "application/json" },
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
          const contactsResponse = await fetch(`${baseUrl}/api/contacts?limit=${args.limit || 100}&offset=${args.offset || 0}`);
          const contacts = await contactsResponse.json();
          return {
            content: [{ type: "text", text: JSON.stringify(contacts, null, 2) }],
          };

        case "create_campaign":
          const campaignResponse = await fetch(`${baseUrl}/api/campaigns`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
          const logsResponse = await fetch(`${baseUrl}/api/email-logs?${logsParams}`);
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