import type { ExecResult } from "@omnideck/agent-sdk";

export async function execCommand(
  command: string,
  args: string[] = [],
): Promise<ExecResult> {
  try {
    const proc = Bun.spawn([command, ...args], {
      stdout: "pipe",
      stderr: "pipe",
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
