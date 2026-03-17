export interface DeckManager {
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onConnect(cb: () => void): void;
  onDisconnect(cb: () => void): void;

  // Input
  onKeyDown(cb: (key: number) => void): void;
  onKeyUp(cb: (key: number) => void): void;

  // Output
  setKeyImage(key: number, buffer: Buffer): Promise<void>;
  setBrightness(percent: number): Promise<void>;

  // Info
  readonly model: string;
  readonly keyCount: number;
  readonly keySize: { width: number; height: number };
  readonly keyColumns: number;
}
