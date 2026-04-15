package dev.ccdev.server;

import dan200.computercraft.core.terminal.Terminal;
import dan200.computercraft.shared.computer.core.ServerComputer;

/**
 * Observes a ServerComputer's terminal state and detects changes.
 * Stores a snapshot of the previous terminal state for diffing.
 */
public class ComputerWatcher {

    private final ServerComputer computer;

    // Snapshot of last-sent terminal state
    private String[] lastText;
    private String[] lastFg;
    private String[] lastBg;
    private int lastCursorX = -1;
    private int lastCursorY = -1;
    private boolean lastCursorBlink = false;
    private int lastWidth = -1;
    private int lastHeight = -1;

    public ComputerWatcher(ServerComputer computer) {
        this.computer = computer;
    }

    public ServerComputer getComputer() {
        return computer;
    }

    public int getComputerId() {
        return computer.getID();
    }

    /**
     * Check if the terminal state has changed since last snapshot.
     * Returns true if a full sync or update should be sent.
     */
    public boolean hasChanged() {
        Terminal terminal = getTerminal();
        if (terminal == null) return false;

        synchronized (terminal) {
            // Size change = full resync needed
            if (terminal.getWidth() != lastWidth || terminal.getHeight() != lastHeight) {
                return true;
            }

            // Cursor change
            if (terminal.getCursorX() != lastCursorX ||
                terminal.getCursorY() != lastCursorY ||
                terminal.getCursorBlink() != lastCursorBlink) {
                return true;
            }

            // Content change
            if (lastText == null) return true;
            for (int y = 0; y < terminal.getHeight(); y++) {
                String text = terminal.getLine(y).toString();
                String fg = terminal.getTextColourLine(y).toString();
                String bg = terminal.getBackgroundColourLine(y).toString();

                if (!text.equals(lastText[y]) || !fg.equals(lastFg[y]) || !bg.equals(lastBg[y])) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Take a snapshot of the current terminal state.
     * Call this after sending the state to the client.
     */
    public void snapshot() {
        Terminal terminal = getTerminal();
        if (terminal == null) return;

        synchronized (terminal) {
            lastWidth = terminal.getWidth();
            lastHeight = terminal.getHeight();
            lastCursorX = terminal.getCursorX();
            lastCursorY = terminal.getCursorY();
            lastCursorBlink = terminal.getCursorBlink();

            lastText = new String[lastHeight];
            lastFg = new String[lastHeight];
            lastBg = new String[lastHeight];

            for (int y = 0; y < lastHeight; y++) {
                lastText[y] = terminal.getLine(y).toString();
                lastFg[y] = terminal.getTextColourLine(y).toString();
                lastBg[y] = terminal.getBackgroundColourLine(y).toString();
            }
        }
    }

    /**
     * Check if the terminal size changed (requires full resync).
     */
    public boolean sizeChanged() {
        Terminal terminal = getTerminal();
        if (terminal == null) return false;
        return terminal.getWidth() != lastWidth || terminal.getHeight() != lastHeight;
    }

    /**
     * Get the underlying terminal. The terminal object is on the NetworkedTerminal
     * field of ServerComputer. Since ServerComputer's terminal field is private,
     * we access it through the TerminalState.
     * <p>
     * NOTE: We access the terminal directly through the computer. The terminal
     * is effectively the NetworkedTerminal (which extends Terminal).
     */
    private Terminal getTerminal() {
        // ServerComputer stores a NetworkedTerminal which extends Terminal.
        // We can access it via reflection, or we rely on the fact that
        // ServerComputer exposes getTerminalState() which creates a TerminalState snapshot.
        // For real-time watching, we need the actual Terminal object.
        // We'll use reflection to access the private 'terminal' field.
        try {
            var field = ServerComputer.class.getDeclaredField("terminal");
            field.setAccessible(true);
            return (Terminal) field.get(computer);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Get terminal for external use (e.g., Messages.terminalSync).
     */
    public Terminal getTerminalDirect() {
        return getTerminal();
    }
}
