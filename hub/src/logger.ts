import pino from "pino";
import type { Broadcaster } from "./web/broadcast.js";

const LEVEL_NAMES: Record<number, string> = {
  10: "trace", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "fatal",
};

const RING_SIZE = 500;
let logSeq = 0;
const logRing: Array<{ seq: number; ts: string; level: string; name: string; msg: string; [k: string]: unknown }> = [];

let logBroadcaster: Broadcaster | null = null;

export function setLogBroadcaster(b: Broadcaster): void {
  logBroadcaster = b;
}

export function replayLogs(send: (line: typeof logRing[number]) => void): void {
  for (const line of logRing) send(line);
}

export function createLogger(name: string) {
  return pino({
    name,
    hooks: {
      logMethod(inputArgs, method, level) {
        const [obj, msgArg] =
          typeof inputArgs[0] === "object" && inputArgs[0] !== null
            ? [inputArgs[0] as Record<string, unknown>, inputArgs[1] as string | undefined]
            : [{}, inputArgs[0] as string | undefined];

        const entry = {
          seq: ++logSeq,
          ts: new Date().toISOString(),
          level: LEVEL_NAMES[level] ?? "info",
          name,
          msg: msgArg ?? "",
          ...obj,
        };

        if (logRing.length >= RING_SIZE) logRing.shift();
        logRing.push(entry);

        if (logBroadcaster) {
          logBroadcaster.send({ type: "log:line", data: entry });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return method.apply(this, inputArgs as any);
      },
    },
  });
}
