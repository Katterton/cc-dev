package dev.ccdev.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dan200.computercraft.core.input.UserComputerInput;
import dan200.computercraft.core.terminal.Terminal;
import dan200.computercraft.shared.computer.core.ServerComputer;
import dan200.computercraft.shared.computer.core.ServerContext;
import dev.ccdev.CCDevMod;
import dev.ccdev.protocol.Messages;
import io.netty.channel.Channel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import net.minecraft.server.MinecraftServer;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * Handles an authenticated WebSocket session.
 * Processes incoming messages and manages computer subscriptions.
 */
public class CCDevSession {

    private final Channel channel;
    private final MinecraftServer server;
    private final Map<Integer, ComputerWatcher> watchers = new HashMap<>();

    // Currently subscribed computer for terminal streaming (single-client model)
    private int subscribedComputerId = -1;

    public CCDevSession(Channel channel, MinecraftServer server) {
        this.channel = channel;
        this.server = server;
    }

    /**
     * Handle an incoming text message from the VSCode client.
     */
    public void handleMessage(String text) {
        try {
            JsonObject msg = JsonParser.parseString(text).getAsJsonObject();
            String type = msg.get("type").getAsString();

            switch (type) {
                case "computer/list" -> handleListComputers();
                case "computer/subscribe" -> handleSubscribe(msg);
                case "computer/unsubscribe" -> handleUnsubscribe();
                case "input/key" -> handleKeyInput(msg);
                case "input/keyUp" -> handleKeyUpInput(msg);
                case "input/char" -> handleCharInput(msg);
                case "input/mouse_click" -> handleMouseClick(msg);
                case "input/mouse_up" -> handleMouseUp(msg);
                case "input/mouse_drag" -> handleMouseDrag(msg);
                case "input/mouse_scroll" -> handleMouseScroll(msg);
                case "input/paste" -> handlePaste(msg);
                case "input/terminate" -> handleTerminate(msg);
                case "input/shutdown" -> handleShutdown(msg);
                case "input/reboot" -> handleReboot(msg);
                case "input/turnOn" -> handleTurnOn(msg);
                case "fs/list" -> handleFsList(msg);
                case "fs/read" -> handleFsRead(msg);
                case "fs/write" -> handleFsWrite(msg);
                default -> send(Messages.error("Unknown message type: " + type));
            }
        } catch (Exception e) {
            CCDevMod.LOGGER.error("Error handling message", e);
            send(Messages.error("Error: " + e.getMessage()));
        }
    }

    /**
     * Called every server tick — streams terminal updates to the client.
     */
    public void tick() {
        if (subscribedComputerId < 0) return;

        ComputerWatcher watcher = watchers.get(subscribedComputerId);
        if (watcher == null) return;

        if (watcher.hasChanged()) {
            Terminal terminal = watcher.getTerminalDirect();
            if (terminal != null) {
                send(Messages.terminalSync(subscribedComputerId, terminal));
                watcher.snapshot();
            }
        }
    }

    public boolean isActive() {
        return channel.isActive();
    }

    public void close() {
        watchers.clear();
    }

    // ── Computer Management ──

    private void handleListComputers() {
        var registry = ServerContext.get(server).registry();
        send(Messages.computerList(registry.getComputers()));
    }

    private void handleSubscribe(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        ServerComputer sc = findComputerById(computerId);
        if (sc == null) {
            send(Messages.error("Computer not found: " + computerId));
            return;
        }

        subscribedComputerId = computerId;
        ComputerWatcher watcher = new ComputerWatcher(sc);
        watchers.put(computerId, watcher);

        // Send initial full terminal sync
        Terminal terminal = watcher.getTerminalDirect();
        if (terminal != null) {
            send(Messages.terminalSync(computerId, terminal));
            watcher.snapshot();
        }
    }

    private void handleUnsubscribe() {
        if (subscribedComputerId >= 0) {
            watchers.remove(subscribedComputerId);
            subscribedComputerId = -1;
        }
    }

    // ── Input Injection ──

    private void handleKeyInput(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        int key = msg.get("key").getAsInt();
        boolean repeat = msg.has("repeat") && msg.get("repeat").getAsBoolean();

        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            // Use queueEvent for direct event injection
            sc.queueEvent("key", new Object[]{ key, repeat });
        }
    }

    private void handleKeyUpInput(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        int key = msg.get("key").getAsInt();

        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.queueEvent("key_up", new Object[]{ key });
        }
    }

    private void handleCharInput(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        String ch = msg.get("char").getAsString();

        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.queueEvent("char", new Object[]{ ch });
        }
    }

    private void handleMouseClick(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        int button = msg.get("button").getAsInt();
        int x = msg.get("x").getAsInt();
        int y = msg.get("y").getAsInt();

        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.queueEvent("mouse_click", new Object[]{ button, x, y });
        }
    }

    private void handleMouseUp(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        int button = msg.get("button").getAsInt();
        int x = msg.get("x").getAsInt();
        int y = msg.get("y").getAsInt();

        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.queueEvent("mouse_up", new Object[]{ button, x, y });
        }
    }

    private void handleMouseDrag(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        int button = msg.get("button").getAsInt();
        int x = msg.get("x").getAsInt();
        int y = msg.get("y").getAsInt();

        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.queueEvent("mouse_drag", new Object[]{ button, x, y });
        }
    }

    private void handleMouseScroll(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        int direction = msg.get("direction").getAsInt();
        int x = msg.get("x").getAsInt();
        int y = msg.get("y").getAsInt();

        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.queueEvent("mouse_scroll", new Object[]{ direction, x, y });
        }
    }

    private void handlePaste(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        String text = msg.get("text").getAsString();

        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.queueEvent("paste", new Object[]{ text });
        }
    }

    private void handleTerminate(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.queueEvent("terminate");
        }
    }

    private void handleShutdown(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.shutdown();
        }
    }

    private void handleReboot(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.reboot();
        }
    }

    private void handleTurnOn(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        ServerComputer sc = findComputerById(computerId);
        if (sc != null) {
            sc.turnOn();
        }
    }

    // ── Filesystem ──

    private void handleFsList(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        String path = msg.has("path") ? msg.get("path").getAsString() : "/";

        // Access the computer's filesystem through the save directory
        Path computerDir = getComputerDir(computerId);
        if (computerDir == null) {
            send(Messages.error("Cannot access filesystem for computer " + computerId));
            return;
        }

        Path targetPath = computerDir.resolve(sanitizePath(path)).normalize();
        if (!targetPath.startsWith(computerDir)) {
            send(Messages.error("Access denied: path outside computer directory"));
            return;
        }
        JsonArray entries = new JsonArray();

        try {
            if (Files.isDirectory(targetPath)) {
                try (var stream = Files.list(targetPath)) {
                    stream.forEach(p -> {
                        JsonObject entry = new JsonObject();
                        entry.addProperty("name", p.getFileName().toString());
                        entry.addProperty("isDir", Files.isDirectory(p));
                        try {
                            entry.addProperty("size", Files.isRegularFile(p) ? Files.size(p) : 0);
                        } catch (IOException e) {
                            entry.addProperty("size", 0);
                        }
                        entries.add(entry);
                    });
                }
            }
        } catch (IOException e) {
            send(Messages.error("Error listing path: " + e.getMessage()));
            return;
        }

        send(Messages.fileList(computerId, path, entries));
    }

    private void handleFsRead(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        String path = msg.get("path").getAsString();

        Path computerDir = getComputerDir(computerId);
        if (computerDir == null) {
            send(Messages.error("Cannot access filesystem for computer " + computerId));
            return;
        }

        Path targetPath = computerDir.resolve(sanitizePath(path)).normalize();
        if (!targetPath.startsWith(computerDir)) {
            send(Messages.error("Access denied: path outside computer directory"));
            return;
        }
        try {
            send(Messages.fileRead(computerId, path, content));
        } catch (IOException e) {
            send(Messages.error("Error reading file: " + e.getMessage()));
        }
    }

    private void handleFsWrite(JsonObject msg) {
        int computerId = msg.get("computerId").getAsInt();
        String path = msg.get("path").getAsString();
        String content = msg.get("content").getAsString();

        Path computerDir = getComputerDir(computerId);
        if (computerDir == null) {
            send(Messages.fileWriteAck(computerId, path, false));
            return;
        }

        Path targetPath = computerDir.resolve(sanitizePath(path)).normalize();
        if (!targetPath.startsWith(computerDir)) {
            send(Messages.error("Access denied: path outside computer directory"));
            send(Messages.fileWriteAck(computerId, path, false));
            return;
        }
        try {
            Files.createDirectories(targetPath.getParent());
            Files.writeString(targetPath, content, StandardCharsets.UTF_8);
            send(Messages.fileWriteAck(computerId, path, true));
        } catch (IOException e) {
            send(Messages.error("Error writing file: " + e.getMessage()));
            send(Messages.fileWriteAck(computerId, path, false));
        }
    }

    // ── Helpers ──

    private ServerComputer findComputerById(int computerId) {
        var registry = ServerContext.get(server).registry();
        for (ServerComputer sc : registry.getComputers()) {
            if (sc.getID() == computerId) return sc;
        }
        return null;
    }

    private Path getComputerDir(int computerId) {
        var context = ServerContext.get(server);
        Path storageDir = context.storageDir();
        Path computerDir = storageDir.resolve("computer").resolve(String.valueOf(computerId));
        if (Files.isDirectory(computerDir)) {
            return computerDir;
        }
        // Create the directory if it doesn't exist
        try {
            Files.createDirectories(computerDir);
            return computerDir;
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * Sanitize a path to prevent directory traversal.
     * Uses Path.normalize() and validates the result stays within the base directory.
     */
    private String sanitizePath(String path) {
        // Decode any percent-encoded characters
        String decoded = path;
        try {
            decoded = java.net.URLDecoder.decode(path, StandardCharsets.UTF_8);
        } catch (Exception e) {
            // If decoding fails, use the raw string
        }

        // Remove leading slashes and backslashes
        String sanitized = decoded.replace("\\", "/");
        while (sanitized.startsWith("/")) {
            sanitized = sanitized.substring(1);
        }

        // Remove any ".." components manually first
        String[] parts = sanitized.split("/");
        StringBuilder result = new StringBuilder();
        for (String part : parts) {
            if (part.equals("..") || part.equals(".") || part.isEmpty()) {
                continue;
            }
            if (!result.isEmpty()) {
                result.append("/");
            }
            result.append(part);
        }

        // Use Path.normalize() as a second check and verify no traversal occurred
        String normalized = result.toString();
        if (normalized.isEmpty()) {
            return "";
        }

        java.nio.file.Path normalizedPath = java.nio.file.Path.of(normalized).normalize();
        // Ensure the normalized path doesn't start with ".." (traversal attempt)
        if (normalizedPath.toString().startsWith("..")) {
            return "";
        }

        return normalizedPath.toString();
    }

    private void send(String message) {
        if (channel.isActive()) {
            channel.writeAndFlush(new TextWebSocketFrame(message));
        }
    }
}
