package dev.ccdev.protocol;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dan200.computercraft.core.terminal.Terminal;
import dan200.computercraft.shared.computer.core.ServerComputer;

import java.util.Collection;

/**
 * Handles serialization of all WebSocket protocol messages.
 */
public final class Messages {

    private static final Gson GSON = new GsonBuilder().create();

    private Messages() {}

    // ── Outbound (Mod → VSCode) ──

    /**
     * List of all active computers.
     */
    public static String computerList(Collection<ServerComputer> computers) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "computer/list");
        JsonArray arr = new JsonArray();
        for (ServerComputer sc : computers) {
            JsonObject entry = new JsonObject();
            entry.addProperty("id", sc.getID());
            entry.addProperty("instanceId", sc.getInstanceID());
            entry.addProperty("label", sc.getLabel());
            entry.addProperty("on", sc.isOn());
            entry.addProperty("family", sc.getFamily().name());
            arr.add(entry);
        }
        msg.add("computers", arr);
        return GSON.toJson(msg);
    }

    /**
     * Full terminal sync for a computer.
     */
    public static String terminalSync(int computerId, Terminal terminal) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "terminal/sync");
        msg.addProperty("computerId", computerId);
        msg.addProperty("width", terminal.getWidth());
        msg.addProperty("height", terminal.getHeight());
        msg.addProperty("cursorX", terminal.getCursorX());
        msg.addProperty("cursorY", terminal.getCursorY());
        msg.addProperty("cursorBlink", terminal.getCursorBlink());

        JsonArray textLines = new JsonArray();
        JsonArray fgLines = new JsonArray();
        JsonArray bgLines = new JsonArray();

        synchronized (terminal) {
            for (int y = 0; y < terminal.getHeight(); y++) {
                textLines.add(terminal.getLine(y).toString());
                fgLines.add(terminal.getTextColourLine(y).toString());
                bgLines.add(terminal.getBackgroundColourLine(y).toString());
            }
        }

        msg.add("text", textLines);
        msg.add("fg", fgLines);
        msg.add("bg", bgLines);

        return GSON.toJson(msg);
    }

    /**
     * Filesystem listing response.
     */
    public static String fileList(int computerId, String path, JsonArray entries) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "fs/list");
        msg.addProperty("computerId", computerId);
        msg.addProperty("path", path);
        msg.add("entries", entries);
        return GSON.toJson(msg);
    }

    /**
     * File content response.
     */
    public static String fileRead(int computerId, String path, String content) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "fs/read");
        msg.addProperty("computerId", computerId);
        msg.addProperty("path", path);
        msg.addProperty("content", content);
        return GSON.toJson(msg);
    }

    /**
     * File write acknowledgement.
     */
    public static String fileWriteAck(int computerId, String path, boolean success) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "fs/writeAck");
        msg.addProperty("computerId", computerId);
        msg.addProperty("path", path);
        msg.addProperty("success", success);
        return GSON.toJson(msg);
    }

    /**
     * Error message.
     */
    public static String error(String message) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "error");
        msg.addProperty("message", message);
        return GSON.toJson(msg);
    }

    /**
     * Authentication success.
     */
    public static String authOk() {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "auth/ok");
        return GSON.toJson(msg);
    }

    /**
     * Authentication failure.
     */
    public static String authFail(String reason) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "auth/fail");
        msg.addProperty("reason", reason);
        return GSON.toJson(msg);
    }

    // ── Utility ──

    public static Gson gson() {
        return GSON;
    }
}
