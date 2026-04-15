package dev.ccdev.server;

import dev.ccdev.CCDevMod;
import dev.ccdev.protocol.Messages;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.*;
import io.netty.handler.codec.http.websocketx.*;
import net.minecraft.server.MinecraftServer;

import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Netty-based WebSocket server for CC:Dev.
 * Runs on a separate thread, communicates with the MC server via session objects.
 */
public class CCDevServer {

    private final MinecraftServer mcServer;
    private final int port;
    private final String token;

    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel serverChannel;

    private final CopyOnWriteArrayList<CCDevSession> sessions = new CopyOnWriteArrayList<>();

    public CCDevServer(MinecraftServer mcServer, int port, String token) {
        this.mcServer = mcServer;
        this.port = port;
        this.token = token;
    }

    public void start() throws InterruptedException {
        bossGroup = new NioEventLoopGroup(1);
        workerGroup = new NioEventLoopGroup(2);

        ServerBootstrap bootstrap = new ServerBootstrap();
        bootstrap.group(bossGroup, workerGroup)
                .channel(NioServerSocketChannel.class)
                .childHandler(new ChannelInitializer<SocketChannel>() {
                    @Override
                    protected void initChannel(SocketChannel ch) {
                        ChannelPipeline pipeline = ch.pipeline();
                        pipeline.addLast(new HttpServerCodec());
                        pipeline.addLast(new HttpObjectAggregator(65536));
                        pipeline.addLast(new WebSocketServerProtocolHandler("/", null, true));
                        pipeline.addLast(new CCDevWebSocketHandler());
                    }
                });

        serverChannel = bootstrap.bind(port).sync().channel();
    }

    public void stop() throws InterruptedException {
        for (CCDevSession session : sessions) {
            session.close();
        }
        sessions.clear();

        if (serverChannel != null) {
            serverChannel.close().sync();
        }
        if (bossGroup != null) {
            bossGroup.shutdownGracefully();
        }
        if (workerGroup != null) {
            workerGroup.shutdownGracefully();
        }
    }

    /**
     * Called every server tick on the main thread.
     * Streams terminal updates to all connected sessions.
     */
    public void tick() {
        sessions.removeIf(s -> !s.isActive());
        for (CCDevSession session : sessions) {
            session.tick();
        }
    }

    /**
     * Inner handler for WebSocket frames.
     */
    private class CCDevWebSocketHandler extends SimpleChannelInboundHandler<WebSocketFrame> {

        private boolean authenticated = false;
        private CCDevSession session;

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
            if (frame instanceof TextWebSocketFrame textFrame) {
                String text = textFrame.text();

                if (!authenticated) {
                    // First message must be auth
                    handleAuth(ctx, text);
                    return;
                }

                if (session != null) {
                    // Schedule message handling on the MC server thread
                    final String msg = text;
                    mcServer.execute(() -> session.handleMessage(msg));
                }
            }
        }

        private void handleAuth(ChannelHandlerContext ctx, String text) {
            try {
                var msg = com.google.gson.JsonParser.parseString(text).getAsJsonObject();
                String type = msg.has("type") ? msg.get("type").getAsString() : "";

                if (!"auth".equals(type)) {
                    ctx.channel().writeAndFlush(new TextWebSocketFrame(
                            Messages.authFail("First message must be auth")));
                    ctx.close();
                    return;
                }

                String providedToken = msg.has("token") ? msg.get("token").getAsString() : "";
                if (!token.equals(providedToken)) {
                    ctx.channel().writeAndFlush(new TextWebSocketFrame(
                            Messages.authFail("Invalid token")));
                    ctx.close();
                    return;
                }

                authenticated = true;
                session = new CCDevSession(ctx.channel(), mcServer);
                sessions.add(session);
                ctx.channel().writeAndFlush(new TextWebSocketFrame(Messages.authOk()));
                CCDevMod.LOGGER.info("CC:Dev client connected from {}", ctx.channel().remoteAddress());

            } catch (Exception e) {
                ctx.channel().writeAndFlush(new TextWebSocketFrame(
                        Messages.authFail("Invalid auth message: " + e.getMessage())));
                ctx.close();
            }
        }

        @Override
        public void channelInactive(ChannelHandlerContext ctx) {
            if (session != null) {
                sessions.remove(session);
                session.close();
                CCDevMod.LOGGER.info("CC:Dev client disconnected from {}", ctx.channel().remoteAddress());
            }
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            CCDevMod.LOGGER.error("CC:Dev WebSocket error", cause);
            ctx.close();
        }
    }
}
