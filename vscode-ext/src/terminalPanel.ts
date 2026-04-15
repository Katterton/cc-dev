import * as vscode from 'vscode';
import { CCDevClient, ComputerInfo, TerminalState } from './client';

/**
 * CC:Tweaked's 16-color palette (default colors).
 * Index corresponds to the hex character in the color buffer (0-9, a-f).
 */
const CC_PALETTE: string[] = [
    '#F0F0F0', // 0 = white
    '#F2B233', // 1 = orange
    '#E57FD8', // 2 = magenta
    '#99B2F2', // 3 = lightBlue
    '#DEDE6C', // 4 = yellow
    '#7FCC19', // 5 = lime
    '#F2B2CC', // 6 = pink
    '#4C4C4C', // 7 = gray
    '#999999', // 8 = lightGray
    '#4C99B2', // 9 = cyan
    '#B266E5', // a = purple
    '#3366CC', // b = blue
    '#7F664C', // c = brown
    '#57A64E', // d = green
    '#CC4C4C', // e = red
    '#111111', // f = black
];

/**
 * Manages a terminal webview panel for a single CC:Tweaked computer.
 */
export class TerminalPanel {
    private panel: vscode.WebviewPanel;
    private client: CCDevClient;
    private computerId: number;
    private computerLabel: string;
    private disposed = false;

    constructor(
        extensionUri: vscode.Uri,
        client: CCDevClient,
        computer: ComputerInfo
    ) {
        this.client = client;
        this.computerId = computer.id;
        this.computerLabel = computer.label || `Computer ${computer.id}`;

        this.panel = vscode.window.createWebviewPanel(
            'ccdev.terminal',
            `🖥️ ${this.computerLabel}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this.panel.webview.html = this.getHtml();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage((msg) => {
            switch (msg.type) {
                case 'key':
                    this.client.sendKey(this.computerId, msg.key, msg.repeat);
                    break;
                case 'keyUp':
                    this.client.sendKeyUp(this.computerId, msg.key);
                    break;
                case 'char':
                    this.client.sendChar(this.computerId, msg.char);
                    break;
                case 'mouse_click':
                    this.client.sendMouseClick(this.computerId, msg.button, msg.x, msg.y);
                    break;
                case 'mouse_up':
                    this.client.sendMouseUp(this.computerId, msg.button, msg.x, msg.y);
                    break;
                case 'mouse_drag':
                    this.client.sendMouseDrag(this.computerId, msg.button, msg.x, msg.y);
                    break;
                case 'mouse_scroll':
                    this.client.sendMouseScroll(this.computerId, msg.direction, msg.x, msg.y);
                    break;
                case 'paste':
                    this.client.sendPaste(this.computerId, msg.text);
                    break;
                case 'terminate':
                    this.client.sendTerminate(this.computerId);
                    break;
                case 'shutdown':
                    this.client.sendShutdown(this.computerId);
                    break;
                case 'reboot':
                    this.client.sendReboot(this.computerId);
                    break;
                case 'turnOn':
                    this.client.sendTurnOn(this.computerId);
                    break;
            }
        });

        this.panel.onDidDispose(() => {
            this.disposed = true;
            this.client.unsubscribe();
        });

        // Subscribe to terminal updates
        this.client.subscribe(this.computerId);
    }

    /**
     * Update the terminal display with new state from the server.
     */
    updateTerminal(state: TerminalState): void {
        if (this.disposed) { return; }
        this.panel.webview.postMessage({
            ...state,
            type: 'terminalSync',
        });
    }

    isDisposed(): boolean {
        return this.disposed;
    }

    getComputerId(): number {
        return this.computerId;
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CC:Tweaked Terminal</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #111111;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            overflow: hidden;
            font-family: monospace;
        }
        #toolbar {
            display: flex;
            gap: 8px;
            padding: 8px;
            background: #222;
            border-radius: 4px 4px 0 0;
        }
        #toolbar button {
            background: #444;
            color: #ccc;
            border: none;
            padding: 4px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        #toolbar button:hover { background: #555; }
        #terminal {
            background: #111111;
            padding: 4px;
            border-radius: 0 0 4px 4px;
            cursor: text;
            outline: none;
            position: relative;
        }
        #terminal canvas {
            display: block;
            image-rendering: pixelated;
        }
        #cursor {
            position: absolute;
            background: #F0F0F0;
            animation: blink 0.8s step-end infinite;
        }
        @keyframes blink {
            50% { opacity: 0; }
        }
        #status {
            color: #888;
            font-size: 11px;
            padding: 4px 8px;
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <button onclick="sendAction('terminate')">Ctrl+T (Terminate)</button>
        <button onclick="sendAction('shutdown')">Shutdown</button>
        <button onclick="sendAction('reboot')">Reboot</button>
        <button onclick="sendAction('turnOn')">Turn On</button>
    </div>
    <div id="terminal" tabindex="0">
        <canvas id="screen"></canvas>
        <div id="cursor" style="display:none"></div>
    </div>
    <div id="status">Waiting for terminal data...</div>

    <script>
        const vscode = acquireVsCodeApi();
        const palette = ${JSON.stringify(CC_PALETTE)};

        // Terminal state
        let termWidth = 51;
        let termHeight = 19;
        const charWidth = 12;
        const charHeight = 18;
        const fontSize = 15;

        const canvas = document.getElementById('screen');
        const ctx = canvas.getContext('2d');
        const cursorEl = document.getElementById('cursor');
        const statusEl = document.getElementById('status');
        const terminalEl = document.getElementById('terminal');

        let termText = [];
        let termFg = [];
        let termBg = [];
        let cursorX = 0;
        let cursorY = 0;
        let cursorBlink = false;

        function resizeCanvas(w, h) {
            termWidth = w;
            termHeight = h;
            canvas.width = w * charWidth;
            canvas.height = h * charHeight;
            canvas.style.width = (w * charWidth) + 'px';
            canvas.style.height = (h * charHeight) + 'px';
            cursorEl.style.width = charWidth + 'px';
            cursorEl.style.height = charHeight + 'px';
        }

        function colorIndex(ch) {
            const c = ch.charCodeAt(0);
            if (c >= 48 && c <= 57) return c - 48;      // '0'-'9'
            if (c >= 97 && c <= 102) return c - 97 + 10; // 'a'-'f'
            return 15;
        }

        function render() {
            ctx.font = fontSize + 'px monospace';
            ctx.textBaseline = 'top';

            for (let y = 0; y < termHeight; y++) {
                const text = termText[y] || '';
                const fg = termFg[y] || '';
                const bg = termBg[y] || '';

                for (let x = 0; x < termWidth; x++) {
                    const bgColor = palette[colorIndex(bg[x] || 'f')];
                    const fgColor = palette[colorIndex(fg[x] || '0')];
                    const ch = text[x] || ' ';

                    // Draw background
                    ctx.fillStyle = bgColor;
                    ctx.fillRect(x * charWidth, y * charHeight, charWidth, charHeight);

                    // Draw character
                    if (ch !== ' ') {
                        ctx.fillStyle = fgColor;
                        ctx.fillText(ch, x * charWidth + 1, y * charHeight + 1);
                    }
                }
            }

            // Update cursor
            if (cursorBlink && cursorX >= 0 && cursorX < termWidth && cursorY >= 0 && cursorY < termHeight) {
                cursorEl.style.display = 'block';
                cursorEl.style.left = (4 + cursorX * charWidth) + 'px';
                cursorEl.style.top = (4 + cursorY * charHeight) + 'px';
                const fgLine = termFg[cursorY] || '';
                cursorEl.style.background = palette[colorIndex(fgLine[cursorX] || '0')];
            } else {
                cursorEl.style.display = 'none';
            }
        }

        resizeCanvas(termWidth, termHeight);

        // ── Handle messages from extension ──
        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.type === 'terminalSync') {
                if (msg.width !== termWidth || msg.height !== termHeight) {
                    resizeCanvas(msg.width, msg.height);
                }
                termText = msg.text;
                termFg = msg.fg;
                termBg = msg.bg;
                cursorX = msg.cursorX;
                cursorY = msg.cursorY;
                cursorBlink = msg.cursorBlink;
                render();
                statusEl.textContent = 'Computer #' + msg.computerId + ' — ' + termWidth + 'x' + termHeight;
            }
        });

        // ── CC:Tweaked key code mapping ──
        // Maps browser key codes to CC key codes
        const KEY_MAP = {
            'Enter': 28, 'Backspace': 14, 'Tab': 15,
            'ShiftLeft': 42, 'ShiftRight': 54,
            'ControlLeft': 29, 'ControlRight': 157,
            'AltLeft': 56, 'AltRight': 184,
            'CapsLock': 58, 'Escape': 1,
            'Space': 57,
            'ArrowUp': 200, 'ArrowDown': 208,
            'ArrowLeft': 203, 'ArrowRight': 205,
            'Home': 199, 'End': 207,
            'PageUp': 201, 'PageDown': 209,
            'Insert': 210, 'Delete': 211,
            'F1': 59, 'F2': 60, 'F3': 61, 'F4': 62,
            'F5': 63, 'F6': 64, 'F7': 65, 'F8': 66,
            'F9': 67, 'F10': 68, 'F11': 87, 'F12': 88,
            'Numpad0': 82, 'Numpad1': 79, 'Numpad2': 80,
            'Numpad3': 81, 'Numpad4': 75, 'Numpad5': 76,
            'Numpad6': 77, 'Numpad7': 71, 'Numpad8': 72,
            'Numpad9': 73,
            'NumpadAdd': 78, 'NumpadSubtract': 74,
            'NumpadMultiply': 55, 'NumpadDecimal': 83,
            'NumpadEnter': 156, 'NumpadDivide': 181,
            // Letter keys
            'KeyA': 30, 'KeyB': 48, 'KeyC': 46, 'KeyD': 32,
            'KeyE': 18, 'KeyF': 33, 'KeyG': 34, 'KeyH': 35,
            'KeyI': 23, 'KeyJ': 36, 'KeyK': 37, 'KeyL': 38,
            'KeyM': 50, 'KeyN': 49, 'KeyO': 24, 'KeyP': 25,
            'KeyQ': 16, 'KeyR': 19, 'KeyS': 31, 'KeyT': 20,
            'KeyU': 22, 'KeyV': 47, 'KeyW': 17, 'KeyX': 45,
            'KeyY': 21, 'KeyZ': 44,
            // Number keys
            'Digit0': 11, 'Digit1': 2, 'Digit2': 3, 'Digit3': 4,
            'Digit4': 5, 'Digit5': 6, 'Digit6': 7, 'Digit7': 8,
            'Digit8': 9, 'Digit9': 10,
            // Punctuation
            'Minus': 12, 'Equal': 13, 'BracketLeft': 26,
            'BracketRight': 27, 'Backslash': 43, 'Semicolon': 39,
            'Quote': 40, 'Backquote': 41, 'Comma': 51,
            'Period': 52, 'Slash': 53,
        };

        const keysDown = new Set();

        terminalEl.addEventListener('keydown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Ctrl+V = paste
            if (e.ctrlKey && e.key === 'v') {
                navigator.clipboard.readText().then(text => {
                    if (text) vscode.postMessage({ type: 'paste', text });
                });
                return;
            }

            // Ctrl+T = terminate
            if (e.ctrlKey && e.key === 't') {
                vscode.postMessage({ type: 'terminate' });
                return;
            }

            // Ctrl+S = shutdown
            if (e.ctrlKey && e.key === 's') {
                vscode.postMessage({ type: 'shutdown' });
                return;
            }

            // Ctrl+R = reboot
            if (e.ctrlKey && e.key === 'r') {
                vscode.postMessage({ type: 'reboot' });
                return;
            }

            const ccKey = KEY_MAP[e.code];
            if (ccKey !== undefined) {
                const repeat = keysDown.has(ccKey);
                keysDown.add(ccKey);
                vscode.postMessage({ type: 'key', key: ccKey, repeat });
            }

            // Also send char event for typable characters
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                vscode.postMessage({ type: 'char', char: e.key });
            }
        });

        terminalEl.addEventListener('keyup', (e) => {
            e.preventDefault();
            const ccKey = KEY_MAP[e.code];
            if (ccKey !== undefined) {
                keysDown.delete(ccKey);
                vscode.postMessage({ type: 'keyUp', key: ccKey });
            }
        });

        // ── Mouse handling ──
        let mouseDown = -1;

        function getTermPos(e) {
            const rect = canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / charWidth) + 1;
            const y = Math.floor((e.clientY - rect.top) / charHeight) + 1;
            return { x: Math.max(1, Math.min(x, termWidth)), y: Math.max(1, Math.min(y, termHeight)) };
        }

        canvas.addEventListener('mousedown', (e) => {
            terminalEl.focus();
            const pos = getTermPos(e);
            const button = e.button === 0 ? 1 : e.button === 2 ? 2 : 3;
            mouseDown = button;
            vscode.postMessage({ type: 'mouse_click', button, x: pos.x, y: pos.y });
        });

        canvas.addEventListener('mouseup', (e) => {
            if (mouseDown > 0) {
                const pos = getTermPos(e);
                vscode.postMessage({ type: 'mouse_up', button: mouseDown, x: pos.x, y: pos.y });
                mouseDown = -1;
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (mouseDown > 0) {
                const pos = getTermPos(e);
                vscode.postMessage({ type: 'mouse_drag', button: mouseDown, x: pos.x, y: pos.y });
            }
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const pos = getTermPos(e);
            const direction = e.deltaY > 0 ? 1 : -1;
            vscode.postMessage({ type: 'mouse_scroll', direction, x: pos.x, y: pos.y });
        });

        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // ── Toolbar actions ──
        function sendAction(action) {
            vscode.postMessage({ type: action });
        }

        // Focus terminal on load
        terminalEl.focus();
    </script>
</body>
</html>`;
    }
}
