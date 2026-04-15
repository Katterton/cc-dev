import * as vscode from 'vscode';
import { CCDevClient, TerminalState } from './client';
import { TerminalPanel } from './terminalPanel';
import { ComputerTreeProvider, ComputerTreeItem } from './computerExplorer';
import { CCDevFileSystemProvider } from './fileSystemProvider';

let client: CCDevClient;
let treeProvider: ComputerTreeProvider;
let fsProvider: CCDevFileSystemProvider;
let activeTerminals: Map<number, TerminalPanel> = new Map();
let refreshInterval: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext) {
    client = new CCDevClient();
    treeProvider = new ComputerTreeProvider(client);
    fsProvider = new CCDevFileSystemProvider(client);

    // Register the tree view
    const treeView = vscode.window.createTreeView('ccdev.computers', {
        treeDataProvider: treeProvider,
    });
    context.subscriptions.push(treeView);

    // Register the filesystem provider
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('ccdev', fsProvider, {
            isCaseSensitive: true,
        })
    );

    // Handle terminal sync messages
    client.on('terminal/sync', (msg: TerminalState) => {
        const panel = activeTerminals.get(msg.computerId);
        if (panel && !panel.isDisposed()) {
            panel.updateTerminal(msg);
        }
    });

    // Handle disconnection
    client.on('disconnected', () => {
        vscode.window.showWarningMessage('CC:Dev: Disconnected from server');
        stopRefreshInterval();
        treeProvider.refresh();
    });

    // ── Commands ──

    context.subscriptions.push(
        vscode.commands.registerCommand('ccdev.connect', async () => {
            const config = vscode.workspace.getConfiguration('ccdev');
            const host = config.get<string>('host', 'localhost');
            const port = config.get<number>('port', 42069);
            let token = config.get<string>('token', '');

            if (!token) {
                token = await vscode.window.showInputBox({
                    prompt: 'Enter CC:Dev authentication token',
                    password: true,
                    placeHolder: 'Token from ccdev-server.toml',
                }) || '';

                if (!token) {
                    return;
                }
            }

            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Connecting to CC:Dev at ${host}:${port}...`,
                    },
                    async () => {
                        await client.connect(host, port, token);
                    }
                );

                vscode.window.showInformationMessage(`CC:Dev: Connected to ${host}:${port}`);
                client.listComputers();
                startRefreshInterval();
            } catch (err: any) {
                vscode.window.showErrorMessage(`CC:Dev: Failed to connect — ${err.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ccdev.disconnect', () => {
            client.disconnect();
            activeTerminals.clear();
            stopRefreshInterval();
            treeProvider.refresh();
            vscode.window.showInformationMessage('CC:Dev: Disconnected');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ccdev.refreshComputers', () => {
            treeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ccdev.openTerminal', (item?: ComputerTreeItem) => {
            if (!client.authenticated) {
                vscode.window.showErrorMessage('CC:Dev: Not connected. Run "CC:Dev: Connect to Server" first.');
                return;
            }

            let computer = item?.computer;

            if (!computer) {
                // Show quick pick
                const computers = treeProvider.getComputers();
                if (computers.length === 0) {
                    vscode.window.showInformationMessage('CC:Dev: No computers available');
                    return;
                }

                vscode.window.showQuickPick(
                    computers.map(c => ({
                        label: `${c.label || `Computer ${c.id}`}`,
                        description: `#${c.id} — ${c.family} — ${c.on ? 'ON' : 'OFF'}`,
                        computer: c,
                    })),
                    { placeHolder: 'Select a computer to connect to' }
                ).then(selected => {
                    if (selected) {
                        openTerminalForComputer(context, selected.computer);
                    }
                });
                return;
            }

            openTerminalForComputer(context, computer);
        })
    );
}

function openTerminalForComputer(context: vscode.ExtensionContext, computer: any) {
    // Close existing terminal for this computer if any
    const existing = activeTerminals.get(computer.id);
    if (existing && !existing.isDisposed()) {
        // Already open — just bring it to focus (panel is retained)
        return;
    }

    const panel = new TerminalPanel(context.extensionUri, client, computer);
    activeTerminals.set(computer.id, panel);
}

function startRefreshInterval() {
    stopRefreshInterval();
    // Refresh computer list every 5 seconds
    refreshInterval = setInterval(() => {
        if (client.authenticated) {
            client.listComputers();
        }
    }, 5000);
}

function stopRefreshInterval() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = undefined;
    }
}

export function deactivate() {
    stopRefreshInterval();
    client?.disconnect();
    activeTerminals.clear();
}
