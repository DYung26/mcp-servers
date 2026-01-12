#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { normalizePath, expandHome } from "./path-utils.js";

// Parse command-line arguments
const args = process.argv.slice(2);

// First arg might be transport or directory
// If it's 'sse' or 'streamableHttp', it's transport
// Otherwise, it's a directory and we default to streamableHttp
let transport = "streamableHttp";
let directoryArgs: string[] = [];

if (args.length === 0) {
  // No args - use default transport, no directories (will use MCP Roots)
  console.error("Usage: mcp-server-filesystem-remote [transport] [directories...]");
  console.error("  transport: sse | streamableHttp (default: streamableHttp)");
  console.error("  directories: one or more allowed directories");
  console.error("");
  console.error("Examples:");
  console.error("  mcp-server-filesystem-remote streamableHttp /path/to/dir1 /path/to/dir2");
  console.error("  mcp-server-filesystem-remote sse ~/projects ~/documents");
  console.error("  mcp-server-filesystem-remote /path/to/dir  # uses default transport");
  console.error("");
  console.error("Note: Allowed directories can also be provided via MCP Roots protocol");
} else if (args[0] === "sse" || args[0] === "streamableHttp") {
  // First arg is transport
  transport = args[0];
  directoryArgs = args.slice(1);
} else {
  // First arg is not a known transport, treat all args as directories
  transport = "streamableHttp";
  directoryArgs = args;
}

// Process and validate directories (same logic as filesystem/index.ts)
let allowedDirectories: string[] = [];

if (directoryArgs.length > 0) {
  console.error(`Processing ${directoryArgs.length} allowed director${directoryArgs.length === 1 ? 'y' : 'ies'}...`);
  
  allowedDirectories = await Promise.all(
    directoryArgs.map(async (dir) => {
      const expanded = expandHome(dir);
      const absolute = path.resolve(expanded);
      try {
        // Security: Resolve symlinks in allowed directories during startup
        const resolved = await fs.realpath(absolute);
        return normalizePath(resolved);
      } catch (error) {
        // If we can't resolve (doesn't exist), use the normalized absolute path
        return normalizePath(absolute);
      }
    })
  );

  // Validate that all directories exist and are accessible
  await Promise.all(allowedDirectories.map(async (dir) => {
    try {
      const stats = await fs.stat(dir);
      if (!stats.isDirectory()) {
        console.error(`Error: ${dir} is not a directory`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error accessing directory ${dir}:`, error);
      process.exit(1);
    }
  }));

  console.error(`Validated allowed directories: ${allowedDirectories.join(', ')}`);
}

// Pass allowed directories to transport via environment variable
// (since dynamic imports can't receive arguments directly)
if (allowedDirectories.length > 0) {
  process.env.MCP_ALLOWED_DIRECTORIES = allowedDirectories.join(':');
}

// Launch selected transport
async function run() {
  try {
    switch (transport) {
      case "sse":
        await import("./sse.js");
        break;
      case "streamableHttp":
        await import("./streamableHttp.js");
        break;
      default:
        console.error(`-`.repeat(53));
        console.error(`  Filesystem Remote Server Launcher`);
        console.error(`  Unknown transport: ${transport}`);
        console.error(`-`.repeat(53));
        console.log("Available transports:");
        console.log("- sse");
        console.log("- streamableHttp (default)");
        process.exit(1);
    }
  } catch (error) {
    console.error("Error running server:", error);
    process.exit(1);
  }
}

await run();
