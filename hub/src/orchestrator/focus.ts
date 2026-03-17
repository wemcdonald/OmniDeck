export interface DeviceFocusState {
  online: boolean;
  idleTimeMs: number;
  lastActivity: Date;
  isFocused: boolean;
}

interface FocusConfig {
  strategy: "idle_time" | "manual" | "active_window";
  idle_threshold_ms: number;
}

type FocusChangeCallback = (from: string | null, to: string | null) => void;

interface DeviceUpdate {
  online: boolean;
  idleTimeMs: number;
}

export class FocusTracker {
  private config: FocusConfig;
  private _devices = new Map<string, DeviceFocusState>();
  private _focused: string | null = null;
  private changeCbs: FocusChangeCallback[] = [];

  constructor(config: FocusConfig) {
    this.config = config;
  }

  get focused(): string | null {
    return this._focused;
  }

  get devices(): Map<string, DeviceFocusState> {
    return this._devices;
  }

  onFocusChange(cb: FocusChangeCallback): void {
    this.changeCbs.push(cb);
  }

  updateDevice(deviceId: string, update: DeviceUpdate): void {
    const now = new Date();
    const existing = this._devices.get(deviceId);
    const state: DeviceFocusState = {
      online: update.online,
      idleTimeMs: update.idleTimeMs,
      lastActivity:
        update.idleTimeMs < this.config.idle_threshold_ms
          ? now
          : (existing?.lastActivity ?? now),
      isFocused: false,
    };
    this._devices.set(deviceId, state);
    this.recalculateFocus();
  }

  private recalculateFocus(): void {
    if (this.config.strategy === "manual") return;

    let bestDevice: string | null = null;
    let bestIdleTime = Infinity;

    for (const [id, state] of this._devices) {
      if (!state.online) continue;
      if (state.idleTimeMs >= this.config.idle_threshold_ms) continue;
      if (state.idleTimeMs < bestIdleTime) {
        bestIdleTime = state.idleTimeMs;
        bestDevice = id;
      }
    }

    if (bestDevice !== this._focused) {
      const prev = this._focused;
      this._focused = bestDevice;
      // Update isFocused flags
      for (const [id, state] of this._devices) {
        state.isFocused = id === bestDevice;
      }
      for (const cb of this.changeCbs) {
        cb(prev, bestDevice);
      }
    }
  }
}
