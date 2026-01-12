import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import express, { Request, Response } from "express";
import { createServer } from "./server.js";
import { randomUUID } from "node:crypto";
import cors from "cors";

// Get allowed directories from environment variable set by index.ts
const allowedDirectoriesEnv = process.env.MCP_ALLOWED_DIRECTORIES || '';
const allowedDirectories = allowedDirectoriesEnv ? allowedDirectoriesEnv.split(':') : [];

if (allowedDirectories.length > 0) {
  console.log(`Starting Filesystem Streamable HTTP server with allowed directories: ${allowedDirectories.join(', ')}`);
} else {
  console.log("Starting Filesystem Streamable HTTP server (will use MCP Roots protocol for directories)");
}

const app = express();
app.use(
  cors({
    origin: "*",
    methods: "GET,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
    exposedHeaders: ["mcp-session-id", "last-event-id", "mcp-protocol-version"],
  })
);

const transports: Map<string, StreamableHTTPServerTransport> = new Map<
  string,
  StreamableHTTPServerTransport
>();

app.post("/mcp", async (req: Request, res: Response) => {
  console.log("Filesystem MCP POST request");
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (!sessionId) {
      const { server, cleanup } = createServer(allowedDirectories);

      const eventStore = new InMemoryEventStore();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore,
        onsessioninitialized: (sessionId: string) => {
          console.log(`Filesystem session initialized with ID: ${sessionId}`);
          transports.set(sessionId, transport);
        },
      });

      server.server.onclose = async () => {
        const sid = transport.sessionId;
        if (sid && transports.has(sid)) {
          console.log(
            `Filesystem transport closed for session ${sid}, removing from transports map`
          );
          transports.delete(sid);
          cleanup(sid);
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: req?.body?.id,
      });
      return;
    }

    await transport.handleRequest(req, res);
  } catch (error) {
    console.log("Filesystem MCP error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: req?.body?.id,
      });
      return;
    }
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  console.log("Filesystem MCP GET request");
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  console.log("Session ID from headers:", sessionId);
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: req?.body?.id,
    });
    return;
  }

  const lastEventId = req.headers["last-event-id"] as string | undefined;
  if (lastEventId) {
    console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
  } else {
    console.log(`Establishing new SSE stream for filesystem session ${sessionId}`);
  }

  const transport = transports.get(sessionId);
  await transport!.handleRequest(req, res);
});

app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: req?.body?.id,
    });
    return;
  }

  console.log(`Filesystem session termination request for ${sessionId}`);

  try {
    const transport = transports.get(sessionId);
    await transport!.handleRequest(req, res);
  } catch (error) {
    console.log("Error handling filesystem session termination:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Error handling session termination",
        },
        id: req?.body?.id,
      });
      return;
    }
  }
});

const PORT = process.env.PORT || 3002;
const server = app.listen(PORT, () => {
  console.error(`Filesystem MCP Streamable HTTP Server listening on port ${PORT}`);
});

server.on("error", (err: unknown) => {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  if (code === "EADDRINUSE") {
    console.error(
      `Failed to start: Port ${PORT} is already in use. Set PORT to a free port or stop the conflicting process.`
    );
  } else {
    console.error("HTTP server encountered an error while starting:", err);
  }
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.log("Shutting down filesystem server...");

  for (const sessionId in transports) {
    try {
      console.log(`Closing filesystem transport for session ${sessionId}`);
      await transports.get(sessionId)!.close();
      transports.delete(sessionId);
    } catch (error) {
      console.log(`Error closing filesystem transport for session ${sessionId}:`, error);
    }
  }

  console.log("Filesystem server shutdown complete");
  process.exit(0);
});
