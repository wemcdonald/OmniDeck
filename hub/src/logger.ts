import pino from "pino";
import type { Broadcaster } from "./web/broadcast.js";

let logBroadcaster: Broadcaster | null = null;

export function setLogBroadcaster(b: Broadcaster): void {
  logBroadcaster = b;
}

export function createLogger(name: string) {
  return pino({
    name,
    hooks: {
      logMethod(inputArgs, method) {
        if (logBroadcaster) {
          const [obj, msgArg] =
            typeof inputArgs[0] === "object" && inputArgs[0] !== null
              ? [inputArgs[0] as Record<string, unknown>, inputArgs[1] as string | undefined]
              : [{}, inputArgs[0] as string | undefined];
          logBroadcaster.send({
            type: "log:line",
            data: {
              ts: new Date().toISOString(),
              level: method.name,
              name,
              msg: msgArg ?? "",
              ...obj,
            },
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return method.apply(this, inputArgs as any);
      },
    },
  });
}
