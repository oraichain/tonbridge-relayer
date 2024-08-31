import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { createTonToCwRelayerWithConfig } from "@oraichain/tonbridge-relayer-to-cw";
import { createCwToTonRelayerWithConfig } from "@oraichain/tonbridge-relayer-to-ton";
import { loadConfig, logger as createServiceLogger } from "./config";
import { Logger } from "winston";

dotenv.config();
const config = loadConfig();
// eslint-disable-next-line prefer-const
let appLogger: Logger;

(async () => {
  try {
    appLogger = createServiceLogger(
      "Orchestrator",
      config.appConfig.webhookUrl,
      config.appConfig.loglevel
    );
    appLogger.debug(JSON.stringify(config));
    const cwToTonLogger = createServiceLogger(
      "CwToTonRelayer",
      config.appConfig.webhookUrl,
      config.appConfig.loglevel
    );
    const app = express();
    const port = process.env.HEALTH_CHECK_PORT
      ? Number(process.env.HEALTH_CHECK_PORT)
      : 3000;

    app.get("/", (req: Request, res: Response) => {
      res.send("Pong from ton-to-cw relayer");
    });

    app.listen(port, "0.0.0.0", async () => {
      appLogger.info(`Server is running at http://0.0.0.0:${port}`);
      const [tonToCwRelayer, cwToTonRelayer] = await Promise.all([
        createTonToCwRelayerWithConfig(config.tonToCw),
        createCwToTonRelayerWithConfig(config.cwToTon, cwToTonLogger),
      ]);
      // tonToCwRelayer.relay();
      cwToTonRelayer.start();
      cwToTonRelayer.on("error", (error) => {
        appLogger.error(`cwToTonRelayer`, error);
      });
    });
  } catch (error) {
    console.error("error is: ", error);
    process.exit(1);
  }

  process.on("unhandledRejection", (reason) => {
    console.log("unhandledRejection", reason);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("SIGTERM received");
    process.exit(0);
  });
})();
