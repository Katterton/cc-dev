import WebSocket from 'ws';
import * as vscode from 'vscode';

export interface ComputerInfo {
    id: number;
    instanceId: number;
    label: string | null;
    on: boolean;
    family: string;
}

export interface TerminalState {
    type: 'terminal/sync';
    computerId: number;
    width: number;
    height: number;
    cursorX: number;
    cursorY: number;
    cursorBlink: boolean;
    text: string[];
    fg: string[];
    bg: string[];
}

export interface FsEntry {
    name: string;
    isDir: boolean;
    size: number;
}

export type MessageHandler = (msg: any) => void;

/**
 * WebSocket client that connects to the CC:Dev mod server.
 */
export class CCDevClient {
    private ws: WebSocket | null = null;
    private messageHandlers: Map<string, MessageHandler[]> = new Map();
    private _connected = false;
    private _authenticated = false;

    get connected(): boolean {
        return this._connected;
    }

    get authenticated(): boolean {
        return this._authenticated;
    }

    async connect(host: string, port: number, token: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const url = `ws://${host}:${port}`;
            this.ws = new WebSocket(url);

            const timeout = setTimeout(() => {
                this.ws?.close();
                reject(new Error('Connection timeout'));
            }, 10000);

            this.ws.on('open', () => {
                this._connected = true;
                // Send auth immediately
                this.send({ type: 'auth', token });
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    const type = msg.type as string;

                    if (type === 'auth/ok') {
                        clearTimeout(timeout);
                        this._authenticated = true;
                        resolve();
                    } else if (type === 'auth/fail') {
                        clearTimeout(timeout);
                        reject(new Error(`Authentication failed: ${msg.reason}`));
                        this.ws?.close();
                    } else {
                        this.emit(type, msg);
                    }
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            });

            this.ws.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });

            this.ws.on('close', () => {
                this._connected = false;
                this._authenticated = false;
                this.emit('disconnected', {});
            });
        });
    }

    disconnect(): void {
        this.ws?.close();
        this.ws = null;
        this._connected = false;
        this._authenticated = false;
    }

    // ── Commands ──

    listComputers(): void {
        this.send({ type: 'computer/list' });
    }

    subscribe(computerId: number): void {
        this.send({ type: 'computer/subscribe', computerId });
    }

    unsubscribe(): void {
        this.send({ type: 'computer/unsubscribe' });
    }

    sendKey(computerId: number, key: number, repeat: boolean = false): void {
        this.send({ type: 'input/key', computerId, key, repeat });
    }

    sendKeyUp(computerId: number, key: number): void {
        this.send({ type: 'input/keyUp', computerId, key });
    }

    sendChar(computerId: number, char: string): void {
        this.send({ type: 'input/char', computerId, char });
    }

    sendMouseClick(computerId: number, button: number, x: number, y: number): void {
        this.send({ type: 'input/mouse_click', computerId, button, x, y });
    }

    sendMouseUp(computerId: number, button: number, x: number, y: number): void {
        this.send({ type: 'input/mouse_up', computerId, button, x, y });
    }

    sendMouseDrag(computerId: number, button: number, x: number, y: number): void {
        this.send({ type: 'input/mouse_drag', computerId, button, x, y });
    }

    sendMouseScroll(computerId: number, direction: number, x: number, y: number): void {
        this.send({ type: 'input/mouse_scroll', computerId, direction, x, y });
    }

    sendPaste(computerId: number, text: string): void {
        this.send({ type: 'input/paste', computerId, text });
    }

    sendTerminate(computerId: number): void {
        this.send({ type: 'input/terminate', computerId });
    }

    sendShutdown(computerId: number): void {
        this.send({ type: 'input/shutdown', computerId });
    }

    sendReboot(computerId: number): void {
        this.send({ type: 'input/reboot', computerId });
    }

    sendTurnOn(computerId: number): void {
        this.send({ type: 'input/turnOn', computerId });
    }

    listFiles(computerId: number, path: string = '/'): void {
        this.send({ type: 'fs/list', computerId, path });
    }

    readFile(computerId: number, path: string): void {
        this.send({ type: 'fs/read', computerId, path });
    }

    writeFile(computerId: number, path: string, content: string): void {
        this.send({ type: 'fs/write', computerId, path, content });
    }

    // ── Event system ──

    on(type: string, handler: MessageHandler): void {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type)!.push(handler);
    }

    off(type: string, handler: MessageHandler): void {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            const idx = handlers.indexOf(handler);
            if (idx >= 0) {
                handlers.splice(idx, 1);
            }
        }
    }

    private emit(type: string, msg: any): void {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            for (const h of handlers) {
                h(msg);
            }
        }
    }

    private send(msg: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
}
