import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler, stopScheduler } from "./services/scheduler";
import { startTelegramBot, stopTelegramBot } from "./services/telegramBot";

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

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  stopTelegramBot();
  stopScheduler();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startScheduler();
  startTelegramBot();
});
