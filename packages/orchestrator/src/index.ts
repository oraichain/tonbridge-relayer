import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { exit } from "process";
import { createTonToCwRelayerWithConfig } from "@oraichain/tonbridge-relayer-to-cw";
import { loadConfig } from "./config";
import { createCwToTonRelayerWithConfig } from "@oraichain/tonbridge-relayer-to-ton";
dotenv.config();
const config = loadConfig();

(async () => {
  try {
    const app = express();
    const port = process.env.HEALTH_CHECK_PORT
      ? Number(process.env.HEALTH_CHECK_PORT)
      : 3000;

    app.get("/", (req: Request, res: Response) => {
      res.send("Pong from ton-to-cw relayer");
    });

    app.listen(port, "0.0.0.0", () => {
      console.log(`Server is running at http://0.0.0.0:${port}`);
    });

    const [tonToCwRelayer, cwToTonRelayer] = await Promise.all([
      createTonToCwRelayerWithConfig(config.tonToCw),
      createCwToTonRelayerWithConfig(config.cwToTon),
    ]);
    cwToTonRelayer.start();
    tonToCwRelayer.relay();
  } catch (error) {
    console.error("error is: ", error);
    exit(1);
  }
})();

process.on("unhandledRejection", (reason) => {
  console.log(reason);
  process.exit(1);
});

process.on("SIGKILL", () => {
  console.log("SIGKILL received");
  process.exit(0);
});
