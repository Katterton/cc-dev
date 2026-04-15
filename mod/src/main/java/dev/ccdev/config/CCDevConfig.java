package dev.ccdev.config;

import net.neoforged.neoforge.common.ModConfigSpec;
import org.apache.commons.lang3.tuple.Pair;

public class CCDevConfig {

    public static final ModConfigSpec SPEC;
    public static final CCDevConfig INSTANCE;

    public final ModConfigSpec.IntValue port;
    public final ModConfigSpec.ConfigValue<String> token;
    public final ModConfigSpec.BooleanValue enabled;

    static {
        Pair<CCDevConfig, ModConfigSpec> pair = new ModConfigSpec.Builder()
                .configure(CCDevConfig::new);
        INSTANCE = pair.getLeft();
        SPEC = pair.getRight();
    }

    private CCDevConfig(ModConfigSpec.Builder builder) {
        builder.push("server");

        enabled = builder
                .comment("Enable the CC:Dev WebSocket server")
                .define("enabled", true);

        port = builder
                .comment("Port for the CC:Dev WebSocket server")
                .defineInRange("port", 42069, 1024, 65535);

        token = builder
                .comment("Shared secret token for authentication. Change this to something unique!")
                .define("token", "change-me-" + Long.toHexString(System.nanoTime()));

        builder.pop();
    }
}
