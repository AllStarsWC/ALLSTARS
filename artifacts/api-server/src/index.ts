import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { setSocketIO } from "./routes/gacha";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  path: "/socket.io",
});

setSocketIO(io);

io.on("connection", (socket) => {
  socket.on("chat-message", ({ username, message }: { username: string; message: string }) => {
    const safe = String(message)
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .slice(0, 200);
    io.emit("chat-message", { username, message: safe, timestamp: Date.now() });
  });
});

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
