import type { ExecResult } from "@omnideck/agent-sdk";

// When the agent runs as a launchd service on macOS, the PATH is minimal and
// doesn't include Homebrew. Prepend the standard Homebrew locations so plugins
// can call tools like m1ddc, ffmpeg, etc. without needing full paths.
const MACOS_EXTRA_PATHS =
  process.platform === "darwin"
    ? ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"]
    : [];

const augmentedEnv =
  MACOS_EXTRA_PATHS.length > 0
    ? {
        ...process.env,
        PATH: [...MACOS_EXTRA_PATHS, process.env.PATH ?? ""].filter(Boolean).join(":"),
      }
    : undefined;

export async function execCommand(
  command: string,
  args: string[] = [],
): Promise<ExecResult> {
  try {
    const proc = Bun.spawn([command, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: augmentedEnv,
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  } catch (err) {
    return {
      stdout: "",
      stderr: String(err),
      exitCode: 1,
    };
  }
}
