import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { createTonToCwRelayerWithConfig } from "@oraichain/tonbridge-relayer-to-cw";
import { createCwToTonRelayerWithConfig } from "@oraichain/tonbridge-relayer-to-ton";

import { loadConfig } from "./config";
dotenv.config();
const config = loadConfig();

console.log({ config });

(async () => {
  try {
    const app = express();
    const port = process.env.HEALTH_CHECK_PORT
      ? Number(process.env.HEALTH_CHECK_PORT)
      : 3000;

    app.get("/", (req: Request, res: Response) => {
      res.send("Pong from ton-to-cw relayer");
    });

    app.listen(port, "0.0.0.0", async () => {
      console.log(`Server is running at http://0.0.0.0:${port}`);
      const [tonToCwRelayer, cwToTonRelayer] = await Promise.all([
        createTonToCwRelayerWithConfig(config.tonToCw),
        createCwToTonRelayerWithConfig(config.cwToTon),
      ]);
      tonToCwRelayer.relay();
      cwToTonRelayer.start();
    });
  } catch (error) {
    console.error("error is: ", error);
    process.exit(1);
  }

  process.on("unhandledRejection", (reason) => {
    console.log(reason);
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
