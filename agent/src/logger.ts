export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
}

const verbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");

/** When true, all log output goes to stderr (stdout reserved for JSON IPC). */
let stderrOnly = false;

export function setStderrOnly(enabled: boolean): void {
  stderrOnly = enabled;
}

export function createLogger(name: string): Logger {
  const prefix = `[${name}]`;
  return {
    info: (msg, data) => {
      if (stderrOnly) {
        console.error(prefix, msg, data ?? "");
      } else {
        console.log(prefix, msg, data ?? "");
      }
    },
    warn: (msg, data) => console.error(prefix, "WARN", msg, data ?? ""),
    error: (msg, data) => console.error(prefix, "ERROR", msg, data ?? ""),
    debug: (msg, data) => {
      if (verbose) {
        if (stderrOnly) {
          console.error(prefix, "[DEBUG]", msg, data ?? "");
        } else {
          console.log(prefix, "[DEBUG]", msg, data ?? "");
        }
      }
    },
  };
}
