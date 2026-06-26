import Foundation
import NIOCore
import NIOHTTP1
import NIOPosix
import NIOWebSocket

/// Fan-out for JSON text frames to every connected WebSocket client (thread-safe).
final class EEGWebSocketFanout: @unchecked Sendable {
    private let lock = NSLock()
    private var channels: [Channel] = []
    /// For compact broadcast diagnostics (avoid per-chunk spam once working).
    private var broadcastInvocationCount = 0

    var clientCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return channels.count
    }

    func add(_ channel: Channel) {
        lock.lock()
        let oid = ObjectIdentifier(channel)
        let already = channels.contains { ObjectIdentifier($0) == oid }
        if !already {
            channels.append(channel)
        }
        let count = channels.count
        lock.unlock()
        print("[WS fanout] client registered id=\(oid) registryCount=\(count) duplicateSkipped=\(already)")
    }

    func remove(_ channel: Channel) {
        lock.lock()
        let oid = ObjectIdentifier(channel)
        let before = channels.count
        channels.removeAll { ObjectIdentifier($0) == oid }
        let after = channels.count
        lock.unlock()
        print("[WS fanout] client removed id=\(oid) count \(before)→\(after)")
    }

    /// Safe to call from the Capsule `Update` thread; dispatches writes onto each channel’s event loop.
    func broadcastJSON(_ json: String) {
        lock.lock()
        broadcastInvocationCount += 1
        let inv = broadcastInvocationCount
        let copy = channels
        let n = copy.count
        lock.unlock()

        let verbose = inv <= 5 || inv % 200 == 0
        if verbose {
            print("[WS fanout] broadcastJSON #\(inv) byteLength=\(json.utf8.count) clientCount=\(n)")
        }

        if n == 0 {
            if verbose {
                print("[WS fanout] broadcastJSON: no clients — nothing sent")
            }
            return
        }

        for ch in copy {
            let oid = ObjectIdentifier(ch)
            ch.eventLoop.execute {
                guard ch.isActive else {
                    print("[WS fanout] send skip id=\(oid) (channel inactive)")
                    return
                }
                var buf = ch.allocator.buffer(capacity: json.utf8.count)
                buf.writeString(json)
                let frame = WebSocketFrame(fin: true, opcode: .text, data: buf)
                let p = ch.eventLoop.makePromise(of: Void.self)
                ch.writeAndFlush(frame, promise: p)
                p.futureResult.whenSuccess {
                    if verbose {
                        print("[WS fanout] send OK id=\(oid)")
                    }
                }
                p.futureResult.whenFailure { err in
                    print("[WS fanout] send FAIL id=\(oid) error=\(err)")
                }
            }
        }
    }
}

private final class EEGWebSocketSessionHandler: ChannelInboundHandler, @unchecked Sendable {
    typealias InboundIn = WebSocketFrame
    typealias OutboundOut = WebSocketFrame

    private let fanout: EEGWebSocketFanout

    init(fanout: EEGWebSocketFanout) {
        self.fanout = fanout
    }

    /// After HTTP→WebSocket upgrade, this handler is added to an **already-active** channel.
    /// NIO does not call `channelActive` for handlers added late, so registration must happen here too.
    func handlerAdded(context: ChannelHandlerContext) {
        print("[WS session] EEGWebSocketSessionHandler added isActive=\(context.channel.isActive)")
        if context.channel.isActive {
            print("[WS session] channel already active — invoking registration path")
            channelActive(context: context)
        }
    }

    func channelActive(context: ChannelHandlerContext) {
        print("[WS session] channelActive remote=\(String(describing: context.channel.remoteAddress))")
        fanout.add(context.channel)
        context.fireChannelActive()
    }

    func channelInactive(context: ChannelHandlerContext) {
        print("[WS session] channelInactive")
        fanout.remove(context.channel)
        context.fireChannelInactive()
    }

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        let frame = Self.unwrapInboundIn(data)
        switch frame.opcode {
        case .ping:
            var data = frame.data
            if let mask = frame.maskKey {
                data.webSocketUnmask(mask)
            }
            context.writeAndFlush(
                Self.wrapOutboundOut(WebSocketFrame(fin: true, opcode: .pong, data: data)),
                promise: nil
            )
        case .connectionClose:
            context.close(promise: nil)
        default:
            break
        }
    }
}

/// Minimal localhost HTTP + WebSocket upgrade server (SwiftNIO).
final class EEGWebSocketServer {
    private let group: EventLoopGroup
    private let serverChannel: Channel

    init(host: String, port: Int, fanout: EEGWebSocketFanout) throws {
        let group = MultiThreadedEventLoopGroup(numberOfThreads: 1)
        self.group = group

        let upgrader = NIOWebSocketServerUpgrader(
            maxFrameSize: 1 << 20,
            shouldUpgrade: { channel, head in
                let ok = head.uri.hasPrefix("/ws")
                print("[WS upgrade] shouldUpgrade uri=\(head.uri) accept=\(ok)")
                if ok {
                    return channel.eventLoop.makeSucceededFuture(HTTPHeaders())
                }
                return channel.eventLoop.makeSucceededFuture(nil)
            },
            upgradePipelineHandler: { channel, head in
                print("[WS upgrade] upgradePipelineHandler uri=\(head.uri) — attaching EEGWebSocketSessionHandler")
                return channel.pipeline.addHandler(EEGWebSocketSessionHandler(fanout: fanout))
            }
        )

        let bootstrap = ServerBootstrap(group: group)
            .serverChannelOption(.socketOption(.so_reuseaddr), value: 1)
            .childChannelInitializer { channel in
                print("[WS server] new TCP child channel")
                return channel.pipeline.configureHTTPServerPipeline(
                    withServerUpgrade: (
                        upgraders: [upgrader],
                        completionHandler: { ctx in
                            print("[WS server] upgrade completionHandler (HTTP pipeline post-upgrade)")
                            _ = ctx
                        }
                    )
                )
            }

        self.serverChannel = try bootstrap.bind(host: host, port: port).wait()
        print("[WS server] listening bind=\(String(describing: self.serverChannel.localAddress))")
    }

    func shutdown() {
        _ = try? serverChannel.close().wait()
        _ = try? group.syncShutdownGracefully()
    }
}
