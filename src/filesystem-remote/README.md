# Filesystem Remote MCP Server

A Model Context Protocol server providing secure filesystem operations with HTTP/SSE remote access support.

This is an extended version of the standard `mcp-server-filesystem` with added support for remote access via HTTP and SSE transports, enabling usage with remote MCP clients like ChatGPT over tunnels (ngrok, etc.).

## Features

- Secure filesystem operations within allowed directories
- Multiple transport options:
  - **sse** - Server-Sent Events (remote use)
  - **streamableHttp** - Streamable HTTP (remote use, default)
- Remote access via tunnels (ngrok, cloudflare, etc.)
- CORS support for browser-based clients
- Session management for concurrent clients
- **Command-line directory configuration** (same as standard filesystem server)
- **MCP Roots protocol support** for dynamic directory configuration

## Installation

```bash
npm install -g @modelcontextprotocol/server-filesystem-remote
```

Or build from source:

```bash
cd src/filesystem-remote
npm install
npm run build
```

## Usage

### With Allowed Directories (Recommended for Testing)

**Streamable HTTP (default):**
```bash
mcp-server-filesystem-remote streamableHttp /path/to/dir1 /path/to/dir2
# or
PORT=3002 mcp-server-filesystem-remote streamableHttp ~/projects ~/documents
```

**SSE:**
```bash
mcp-server-filesystem-remote sse /path/to/allowed/directory
# or
PORT=3002 mcp-server-filesystem-remote sse ~/workspace
```

**Default transport with directories:**
```bash
mcp-server-filesystem-remote /home/user/projects /home/user/docs
# Uses streamableHttp by default
```

### Without Directories (Uses MCP Roots Protocol)

**Streamable HTTP:**
```bash
PORT=3002 mcp-server-filesystem-remote streamableHttp
```

**SSE:**
```bash
PORT=3002 mcp-server-filesystem-remote sse
```

When started without directories, the server will use the **MCP Roots protocol** to receive allowed directories from the client.

## Directory Configuration

The server supports **two methods** for configuring allowed directories:

### 1. Command-Line Arguments (Same as standard filesystem server)

Specify directories when starting the server:

```bash
# Single directory
mcp-server-filesystem-remote streamableHttp /home/user/projects

# Multiple directories
mcp-server-filesystem-remote streamableHttp /home/user/projects /home/user/docs /var/data

# With tilde expansion
mcp-server-filesystem-remote streamableHttp ~/workspace ~/downloads

# Relative paths (converted to absolute)
mcp-server-filesystem-remote streamableHttp ./my-project ../shared-data
```

**Validation:**
- All directories must exist at startup
- Server will exit with error if directories don't exist or aren't accessible
- Symlinks are resolved for security

### 2. MCP Roots Protocol (Dynamic Configuration)

If the client supports MCP Roots, it can provide directories dynamically:

```javascript
// Client provides roots
{
  "roots": [
    {"uri": "file:///home/user/projects"},
    {"uri": "/home/user/documents"}
  ]
}
```

**Behavior:**
- MCP Roots **replace** command-line directories when provided
- Enables runtime directory updates without server restart
- Recommended for production deployments with MCP-capable clients

### Priority

1. If client supports MCP Roots and provides them → **Use MCP Roots** (replaces command-line)
2. If client doesn't support MCP Roots → **Use command-line directories**
3. If no directories from either source → **Server warns, operations will fail**

## Remote Access with ngrok

1. Start the server:
```bash
PORT=3002 mcp-server-filesystem-remote streamableHttp ~/projects ~/documents
```

2. Expose via ngrok:
```bash
ngrok http 3002
```

3. Use the ngrok URL in your remote MCP client

## Authentication

OAuth/authentication should be configured at the tunneling layer (ngrok, cloudflare, etc.), not within the MCP server itself. The server uses permissive CORS for maximum compatibility with tunneling solutions.

## Available Tools

- `read_file` / `read_text_file` - Read file contents
- `read_media_file` - Read images/audio as base64
- `read_multiple_files` - Read multiple files at once
- `write_file` - Write/create files
- `edit_file` - Apply line-based edits
- `create_directory` - Create directories
- `list_directory` - List directory contents
- `list_directory_with_sizes` - List with size information
- `directory_tree` - Get recursive tree structure
- `move_file` - Move/rename files
- `search_files` - Search for files by pattern
- `get_file_info` - Get file metadata
- `list_allowed_directories` - Show accessible directories

## Security

- All operations are restricted to allowed directories
- Path traversal attacks are prevented
- Symlinks are resolved during validation
- Paths are normalized to prevent bypasses
- Per-request validation ensures current allowed directories are enforced

## Comparison with Standard Filesystem Server

| Feature | filesystem (standard) | filesystem-remote |
|---------|---------------------|------------------|
| Transport | stdio only | HTTP, SSE |
| Remote access | No | Yes (via ngrok, etc.) |
| CLI directories | Yes | Yes |
| MCP Roots | Yes | Yes |
| Use case | Local MCP clients | Remote/web clients |

## Examples

### Example 1: Testing Locally
```bash
# Start with specific directories
PORT=3002 mcp-server-filesystem-remote streamableHttp ~/test-directory

# In another terminal, test with curl
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

### Example 2: Production with ngrok
```bash
# Start server
mcp-server-filesystem-remote streamableHttp /var/app/data /var/app/uploads

# Expose with ngrok
ngrok http 3002 --oauth=google --oauth-allow-domain=company.com

# Connect from remote MCP client using ngrok URL
```

### Example 3: Development with Dynamic Directories
```bash
# Start without directories (will use MCP Roots)
PORT=3002 mcp-server-filesystem-remote streamableHttp

# Client provides directories via MCP Roots protocol
# Directories can be updated at runtime
```

## License

MIT
