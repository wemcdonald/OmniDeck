// hub/src/config/watcher.ts
import chokidar, { FSWatcher } from "chokidar";

type ChangeCallback = (filePath: string) => void;

/**
 * ConfigWatcher monitors a config directory for YAML file changes and
 * notifies registered callbacks so plugins can react via onConfigChange.
 */
export class ConfigWatcher {
  private readonly configDir: string;
  private readonly callbacks: ChangeCallback[] = [];
  private fsWatcher: FSWatcher | null = null;

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  /**
   * Register a callback to be invoked when a .yaml or .yml file is
   * added, changed, or removed in the watched directory.
   */
  onChange(cb: ChangeCallback): void {
    this.callbacks.push(cb);
  }

  /**
   * Begin watching the config directory. Resolves once chokidar is ready.
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.fsWatcher = chokidar.watch(this.configDir, {
        persistent: true,
        ignoreInitial: false,
        ignored: (filePath: string) =>
          !filePath.endsWith(".yaml") &&
          !filePath.endsWith(".yml") &&
          filePath !== this.configDir,
      });

      const notify = (filePath: string): void => {
        for (const cb of this.callbacks) {
          cb(filePath);
        }
      };

      this.fsWatcher
        .on("add", notify)
        .on("change", notify)
        .on("unlink", notify)
        .on("ready", () => resolve());
    });
  }

  /**
   * Stop watching and release file system resources.
   */
  async stop(): Promise<void> {
    if (this.fsWatcher) {
      await this.fsWatcher.close();
      this.fsWatcher = null;
    }
  }
}
