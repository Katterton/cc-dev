package dev.ccdev;

import com.mojang.logging.LogUtils;
import dev.ccdev.config.CCDevConfig;
import dev.ccdev.server.CCDevServer;
import net.minecraft.server.MinecraftServer;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppingEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import org.slf4j.Logger;

@Mod(CCDevMod.MODID)
public class CCDevMod {

    public static final String MODID = "ccdev";
    public static final Logger LOGGER = LogUtils.getLogger();

    private CCDevServer wsServer;

    public CCDevMod(IEventBus modEventBus, ModContainer modContainer) {
        modContainer.registerConfig(ModConfig.Type.SERVER, CCDevConfig.SPEC);
        NeoForge.EVENT_BUS.register(this);
        LOGGER.info("CC:Dev loaded — VSCode bridge for CC:Tweaked");
    }

    @SubscribeEvent
    public void onServerStarted(ServerStartedEvent event) {
        if (!CCDevConfig.INSTANCE.enabled.get()) {
            LOGGER.info("CC:Dev WebSocket server is disabled in config");
            return;
        }

        MinecraftServer server = event.getServer();
        int port = CCDevConfig.INSTANCE.port.get();
        String token = CCDevConfig.INSTANCE.token.get();

        if ("change-me".equals(token) || token.startsWith("change-me-")) {
            LOGGER.warn("CC:Dev is using a default token! Change 'token' in ccdev-server.toml for security.");
        }

        try {
            wsServer = new CCDevServer(server, port, token);
            wsServer.start();
            LOGGER.info("CC:Dev WebSocket server started on port {}", port);
        } catch (Exception e) {
            LOGGER.error("Failed to start CC:Dev WebSocket server", e);
        }
    }

    @SubscribeEvent
    public void onServerTick(ServerTickEvent.Post event) {
        if (wsServer != null) {
            wsServer.tick();
        }
    }

    @SubscribeEvent
    public void onServerStopping(ServerStoppingEvent event) {
        if (wsServer != null) {
            try {
                wsServer.stop();
                LOGGER.info("CC:Dev WebSocket server stopped");
            } catch (Exception e) {
                LOGGER.error("Error stopping CC:Dev WebSocket server", e);
            }
            wsServer = null;
        }
    }
}
