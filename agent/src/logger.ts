export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
}

const verbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");

export function createLogger(name: string): Logger {
  const prefix = `[${name}]`;
  return {
    info: (msg, data) => console.log(prefix, msg, data ?? ""),
    warn: (msg, data) => console.warn(prefix, msg, data ?? ""),
    error: (msg, data) => console.error(prefix, msg, data ?? ""),
    debug: (msg, data) => {
      if (verbose) console.log(prefix, "[DEBUG]", msg, data ?? "");
    },
  };
}
