import { createLogger, format, transports } from "winston";
import { DiscordTransport } from "winston-transport-discord";
export const logger = (label: string, webhookUrl: string, loglevel?: string) =>
  createLogger({
    level: loglevel || "info",
    format: format.combine(
      format.label({ label }),
      format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      format.printf((info) => {
        return `[${info.label}] ${info.timestamp} ${info.level}: ${info.message}`;
      })
    ),
    transports: [
      new transports.Console(),
      new DiscordTransport({
        discord: {
          webhook: {
            url: webhookUrl,
          },
        },
        level: "error",
      }),
    ],
  });
