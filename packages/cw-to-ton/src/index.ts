import { Config } from "./config";
import { Logger } from "winston";
import { RelayerToTonBuilder } from "./relayer";

export async function createCwToTonRelayerWithConfig(
  config: Config,
  injectLogger: Logger
) {
  const RelayerToTon = await new RelayerToTonBuilder()
    .withConfig(config)
    .withLogger(injectLogger)
    .build();

  return RelayerToTon;
}

export * from "./relayer";
export * from "./@types";
export type { Config } from "./config";
export * from "./utils";
export * from "./models/block-offset";
export * from "./worker";
