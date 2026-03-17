type StatusChangeCallback = (deviceId: string, online: boolean) => void;

export class PresenceManager {
  private onlineDevices = new Set<string>();
  private statusChangeCbs: StatusChangeCallback[] = [];

  deviceConnected(deviceId: string): void {
    this.onlineDevices.add(deviceId);
    this.notify(deviceId, true);
  }

  deviceDisconnected(deviceId: string): void {
    this.onlineDevices.delete(deviceId);
    this.notify(deviceId, false);
  }

  isOnline(deviceId: string): boolean {
    return this.onlineDevices.has(deviceId);
  }

  getOpacity(deviceId: string): number {
    return this.isOnline(deviceId) ? 1.0 : 0.5;
  }

  onStatusChange(cb: StatusChangeCallback): void {
    this.statusChangeCbs.push(cb);
  }

  private notify(deviceId: string, online: boolean): void {
    for (const cb of this.statusChangeCbs) cb(deviceId, online);
  }
}
