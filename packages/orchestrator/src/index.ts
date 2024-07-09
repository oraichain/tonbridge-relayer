import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { exit } from "process";
import TonToCwRelayer from "@oraichain/tonbridge-relayer-to-cw";
dotenv.config();

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

    // FIXME: add block & tx processor initiator here. Also add relayer from cw-to-ton as well
    const tonToCwRelayer = new TonToCwRelayer();
    tonToCwRelayer.relay();
  } catch (error) {
    console.error("error is: ", error);
    exit(1);
  }
})();
