import * as vscode from 'vscode';
import { CCDevClient } from './client';

/**
 * VSCode FileSystemProvider that exposes CC:Tweaked computer filesystems
 * as editable documents via the ccdev:// URI scheme.
 *
 * URI format: ccdev://computer-{id}/{path}
 * Example:    ccdev://computer-5/startup.lua
 */
export class CCDevFileSystemProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this._emitter.event;

    private client: CCDevClient;
    private fileCache: Map<string, Uint8Array> = new Map();
    private dirCache: Map<string, [string, vscode.FileType][]> = new Map();

    // Pending read/list operations (promise resolvers)
    private pendingReads: Map<string, { resolve: (data: Uint8Array) => void; reject: (err: Error) => void }> = new Map();
    private pendingDirs: Map<string, { resolve: (entries: [string, vscode.FileType][]) => void; reject: (err: Error) => void }> = new Map();
    private pendingWrites: Map<string, { resolve: () => void; reject: (err: Error) => void }> = new Map();

    constructor(client: CCDevClient) {
        this.client = client;

        // Handle filesystem responses
        this.client.on('fs/read', (msg: any) => {
            const key = `${msg.computerId}:${msg.path}`;
            const data = new TextEncoder().encode(msg.content);
            this.fileCache.set(key, data);
            const pending = this.pendingReads.get(key);
            if (pending) {
                pending.resolve(data);
                this.pendingReads.delete(key);
            }
        });

        this.client.on('fs/list', (msg: any) => {
            const key = `${msg.computerId}:${msg.path}`;
            const entries: [string, vscode.FileType][] = (msg.entries || []).map((e: any) => [
                e.name,
                e.isDir ? vscode.FileType.Directory : vscode.FileType.File
            ]);
            this.dirCache.set(key, entries);
            const pending = this.pendingDirs.get(key);
            if (pending) {
                pending.resolve(entries);
                this.pendingDirs.delete(key);
            }
        });

        this.client.on('fs/writeAck', (msg: any) => {
            const key = `${msg.computerId}:${msg.path}`;
            const pending = this.pendingWrites.get(key);
            if (pending) {
                if (msg.success) {
                    pending.resolve();
                } else {
                    pending.reject(new Error('Write failed'));
                }
                this.pendingWrites.delete(key);
            }
        });

        this.client.on('error', (msg: any) => {
            // Try to resolve any pending operations with errors
            console.error('CC:Dev error:', msg.message);
        });
    }

    private parseUri(uri: vscode.Uri): { computerId: number; path: string } {
        // URI: ccdev://computer-5/startup.lua
        const authority = uri.authority; // "computer-5"
        const match = authority.match(/^computer-(\d+)$/);
        if (!match) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        const computerId = parseInt(match[1], 10);
        const path = uri.path || '/';
        return { computerId, path };
    }

    watch(): vscode.Disposable {
        // No-op for now — we don't watch for external changes
        return new vscode.Disposable(() => {});
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const { computerId, path } = this.parseUri(uri);

        if (path === '/' || path === '') {
            return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
        }

        // Check if parent dir has this entry
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        const name = path.substring(path.lastIndexOf('/') + 1);

        const entries = await this.readDirectory(vscode.Uri.parse(`ccdev://computer-${computerId}${parentPath}`));
        const entry = entries.find(([n]) => n === name);

        if (!entry) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        return {
            type: entry[1],
            ctime: 0,
            mtime: Date.now(),
            size: 0,
        };
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const { computerId, path } = this.parseUri(uri);
        const key = `${computerId}:${path}`;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingDirs.delete(key);
                reject(new Error('Timeout reading directory'));
            }, 10000);

            this.pendingDirs.set(key, {
                resolve: (entries) => {
                    clearTimeout(timeout);
                    resolve(entries);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                },
            });

            this.client.listFiles(computerId, path);
        });
    }

    createDirectory(): void {
        // Directories are created implicitly when writing files
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const { computerId, path } = this.parseUri(uri);
        const key = `${computerId}:${path}`;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingReads.delete(key);
                reject(new Error('Timeout reading file'));
            }, 10000);

            this.pendingReads.set(key, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                },
            });

            this.client.readFile(computerId, path);
        });
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const { computerId, path } = this.parseUri(uri);
        const key = `${computerId}:${path}`;
        const text = new TextDecoder().decode(content);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingWrites.delete(key);
                reject(new Error('Timeout writing file'));
            }, 10000);

            this.pendingWrites.set(key, {
                resolve: () => {
                    clearTimeout(timeout);
                    // Invalidate cache
                    this.fileCache.delete(key);
                    resolve();
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                },
            });

            this.client.writeFile(computerId, path, text);
        });
    }

    delete(): void {
        throw vscode.FileSystemError.NoPermissions('Delete not yet supported');
    }

    rename(): void {
        throw vscode.FileSystemError.NoPermissions('Rename not yet supported');
    }
}
