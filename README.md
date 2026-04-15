# CC:Dev — VSCode Bridge for CC:Tweaked

Connect VSCode to CC:Tweaked computers and turtles in Minecraft. Mirror terminals, edit Lua files with full Copilot support, and control your computers remotely — all without disrupting the turtle/computer.

## Architecture

```
┌──────────────┐              ┌──────────────────────────────────┐
│  VSCode Ext  │◄────WS──────►│  Minecraft (NeoForge)            │
│              │              │                                  │
│ • Terminal   │              │  CC:Dev Mod (Java)               │
│   webview    │              │  ├─ WebSocket server             │
│ • FileSystem │              │  ├─ Terminal observer per turtle  │
│   Provider   │              │  ├─ FS access via save dirs      │
│ • Copilot ✓  │              │  └─ Input injection              │
│ • Sidebar    │              │                                  │
│   explorer   │              │  CC:Tweaked (unmodified)         │
└──────────────┘              │  └─ Computers run normally       │
                              └──────────────────────────────────┘
```

**Key insight**: The mod hooks into CC:Tweaked's `ServerComputer` objects at the Java level. It reads terminal buffers and injects input events without running any Lua code on the computer — so **the turtle/computer is not affected at all**.

## Features

| Feature | How |
|---------|-----|
| Terminal mirroring | Webview panel mirrors the real CraftOS screen with CC's 16-color palette |
| Full keyboard/mouse | Key, char, mouse, scroll, and paste events injected as native CC events |
| File editing | `ccdev://computer-5/startup.lua` opens as a real VSCode document — with Copilot! |
| Computer explorer | Sidebar shows all computers/turtles with ID, label, family, and status |
| Power control | Turn on, shutdown, reboot, Ctrl+T terminate from VSCode |
| Zero impact | Java-side only — no Lua daemon, the computer doesn't know it's being observed |

## Setup

### 1. Install the Mod

1. Requires **NeoForge** for Minecraft **1.21.1** and **CC:Tweaked 1.113.0+**
2. Build the mod: `cd mod && ./gradlew build`
3. Copy `mod/build/libs/ccdev-0.1.0.jar` to your Minecraft `mods/` folder
4. Launch the game — the mod creates `ccdev-server.toml` in the `serverconfig` folder

### 2. Configure the Token

Edit `saves/<world>/serverconfig/ccdev-server.toml`:

```toml
[server]
enabled = true
port = 42069
token = "your-secret-token-here"  # Change this!
```

### 3. Install the VSCode Extension

```bash
cd vscode-ext
npm install
npm run compile
```

Then press `F5` in VSCode to launch the extension in debug mode, or package it:

```bash
npx @vscode/vsce package
code --install-extension ccdev-0.1.0.vsix
```

### 4. Connect

1. Open command palette → **CC:Dev: Connect to Server**
2. Enter the token when prompted
3. The sidebar shows all active computers/turtles
4. Click one to open its terminal
5. Open files: `Ctrl+Shift+P` → **Open File** → type `ccdev://computer-5/startup.lua`

## WebSocket Protocol

The mod runs a WebSocket server (default port `42069`). Messages are JSON.

### Authentication

First message must be:
```json
{ "type": "auth", "token": "your-token" }
```

Response: `{ "type": "auth/ok" }` or `{ "type": "auth/fail", "reason": "..." }`

### Computer Discovery

```json
// Request
{ "type": "computer/list" }

// Response
{ "type": "computer/list", "computers": [
    { "id": 0, "instanceId": 1, "label": "MyTurtle", "on": true, "family": "ADVANCED" }
]}
```

### Terminal Streaming

```json
// Subscribe to a computer's terminal
{ "type": "computer/subscribe", "computerId": 0 }

// Server streams terminal state:
{ "type": "terminal/sync", "computerId": 0,
  "width": 51, "height": 19,
  "text": ["CraftOS 1.9  ...", "..."],
  "fg": ["00000000...", "..."],
  "bg": ["fffffffff...", "..."],
  "cursorX": 2, "cursorY": 1, "cursorBlink": true }
```

### Input Injection

```json
{ "type": "input/key", "computerId": 0, "key": 28, "repeat": false }
{ "type": "input/char", "computerId": 0, "char": "h" }
{ "type": "input/mouse_click", "computerId": 0, "button": 1, "x": 5, "y": 3 }
{ "type": "input/paste", "computerId": 0, "text": "hello world" }
{ "type": "input/terminate", "computerId": 0 }
```

### Filesystem

```json
{ "type": "fs/list", "computerId": 0, "path": "/" }
{ "type": "fs/read", "computerId": 0, "path": "/startup.lua" }
{ "type": "fs/write", "computerId": 0, "path": "/startup.lua", "content": "print('hello')" }
```

## Project Structure

```
cc-dev/
├── mod/                          # NeoForge mod
│   ├── build.gradle
│   ├── gradle.properties
│   └── src/main/java/dev/ccdev/
│       ├── CCDevMod.java         # Mod entry point, tick hook
│       ├── config/
│       │   └── CCDevConfig.java  # Port, token, enabled
│       ├── protocol/
│       │   └── Messages.java     # JSON message serialization
│       └── server/
│           ├── CCDevServer.java  # Netty WebSocket server
│           ├── CCDevSession.java # Session handler (commands, FS, input)
│           └── ComputerWatcher.java  # Terminal state observer
│
└── vscode-ext/                   # VSCode extension
    ├── package.json
    └── src/
        ├── extension.ts          # Extension entry point
        ├── client.ts             # WebSocket client
        ├── terminalPanel.ts      # Terminal webview with CC renderer
        ├── computerExplorer.ts   # Sidebar tree view
        └── fileSystemProvider.ts # ccdev:// URI filesystem
```

## License

MIT