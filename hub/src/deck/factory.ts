import type { DeckManager } from "./types.js";

/**
 * Create a DeckManager for the given driver name.
 * "auto" tries Elgato first, then Mirabox.
 */
export async function createDeck(driver: string): Promise<DeckManager> {
  switch (driver) {
    case "elgato": {
      const { ElgatoDeck } = await import("./elgato.js");
      return new ElgatoDeck();
    }
    case "mirabox": {
      const { MiraboxDeck } = await import("./mirabox/index.js");
      return new MiraboxDeck();
    }
    case "mock": {
      const { MockDeck } = await import("./mock.js");
      return new MockDeck();
    }
    case "auto":
      return autoDetect();
    default:
      throw new Error(`Unknown deck driver: "${driver}". Valid options: auto, elgato, mirabox`);
  }
}

async function autoDetect(): Promise<DeckManager> {
  // Try Elgato first (most common, existing behaviour)
  try {
    const { listStreamDecks } = await import("@elgato-stream-deck/node");
    const devices = await listStreamDecks();
    if (devices.length > 0) {
      const { ElgatoDeck } = await import("./elgato.js");
      return new ElgatoDeck();
    }
  } catch {
    // @elgato-stream-deck/node not available or errored — fall through
  }

  // Try Mirabox
  try {
    const { MiraboxDeck } = await import("./mirabox/index.js");
    const config = await MiraboxDeck.detect();
    if (config !== null) {
      return new MiraboxDeck();
    }
  } catch {
    // mirabox driver not available or errored — fall through
  }

  throw new Error(
    "No supported deck device found. Connect an Elgato Stream Deck or Mirabox AKP153E, or set deck.driver explicitly in your config.",
  );
}
