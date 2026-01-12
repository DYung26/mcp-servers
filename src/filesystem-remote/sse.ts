import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "./server.js";
import cors from "cors";

// Get allowed directories from environment variable set by index.ts
const allowedDirectoriesEnv = process.env.MCP_ALLOWED_DIRECTORIES || '';
const allowedDirectories = allowedDirectoriesEnv ? allowedDirectoriesEnv.split(':') : [];

if (allowedDirectories.length > 0) {
  console.error(`Starting Filesystem SSE server with allowed directories: ${allowedDirectories.join(', ')}`);
} else {
  console.error("Starting Filesystem SSE server (will use MCP Roots protocol for directories)");
}

const app = express();
app.use(
  cors({
    origin: "*",
    methods: "GET,POST",
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

const transports: Map<string, SSEServerTransport> = new Map<
  string,
  SSEServerTransport
>();

app.get("/sse", async (req, res) => {
  let transport: SSEServerTransport;
  const { server, cleanup } = createServer(allowedDirectories);

  if (req?.query?.sessionId) {
    const sessionId = req?.query?.sessionId as string;
    transport = transports.get(sessionId) as SSEServerTransport;
    console.error(
      "Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.",
      transport?.sessionId
    );
  } else {
    transport = new SSEServerTransport("/message", res);
    transports.set(transport.sessionId, transport);

    await server.connect(transport);
    const sessionId = transport.sessionId;
    console.error("Filesystem Client Connected: ", sessionId);

    server.server.onclose = async () => {
      const sessionId = transport.sessionId;
      console.error("Filesystem Client Disconnected: ", sessionId);
      transports.delete(sessionId);
      cleanup(sessionId);
    };
  }
});

app.post("/message", async (req, res) => {
  const sessionId = req?.query?.sessionId as string;

  const transport = transports.get(sessionId);
  if (transport) {
    console.error("Filesystem Client Message from", sessionId);
    await transport.handlePostMessage(req, res);
  } else {
    console.error(`No transport found for sessionId ${sessionId}`);
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.error(`Filesystem SSE Server is running on port ${PORT}`);
});
