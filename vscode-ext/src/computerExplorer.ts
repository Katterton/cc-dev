import * as vscode from 'vscode';
import { CCDevClient, ComputerInfo } from './client';

/**
 * Tree data provider for the CC:Dev sidebar showing connected computers.
 */
export class ComputerTreeProvider implements vscode.TreeDataProvider<ComputerTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ComputerTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private computers: ComputerInfo[] = [];
    private client: CCDevClient;

    constructor(client: CCDevClient) {
        this.client = client;

        // Listen for computer list updates
        this.client.on('computer/list', (msg: any) => {
            this.computers = msg.computers || [];
            this._onDidChangeTreeData.fire(undefined);
        });
    }

    refresh(): void {
        if (this.client.authenticated) {
            this.client.listComputers();
        }
    }

    getComputers(): ComputerInfo[] {
        return this.computers;
    }

    getTreeItem(element: ComputerTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): ComputerTreeItem[] {
        if (!this.client.connected) {
            return [new ComputerTreeItem('Not connected', '', 'disconnected')];
        }

        if (this.computers.length === 0) {
            return [new ComputerTreeItem('No computers found', '', 'empty')];
        }

        return this.computers.map(c => {
            const label = c.label || `Computer ${c.id}`;
            const statusIcon = c.on ? '🟢' : '🔴';
            const familyIcon = c.family === 'NORMAL' ? '💻' : c.family === 'ADVANCED' ? '🖥️' : '⌨️';
            const description = `#${c.id} ${statusIcon}`;

            const item = new ComputerTreeItem(
                `${familyIcon} ${label}`,
                description,
                'computer',
                c
            );
            return item;
        });
    }
}

export class ComputerTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        description: string,
        public readonly itemType: string,
        public readonly computer?: ComputerInfo
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.tooltip = computer
            ? `Computer #${computer.id}\nFamily: ${computer.family}\nStatus: ${computer.on ? 'ON' : 'OFF'}`
            : label;

        if (itemType === 'computer') {
            this.contextValue = 'computer';
            this.command = {
                command: 'ccdev.openTerminal',
                title: 'Open Terminal',
                arguments: [this],
            };
        }
    }
}
