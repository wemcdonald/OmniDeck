// agent/src/__tests__/mdns-resolver.test.ts
// Verifies the fingerprint pinning behavior of HubResolver. Subscribers should
// only be notified for endpoints whose fingerprint matches the one they
// registered for — a hub advertising on the LAN with a different fp (a
// different install, a hub whose cert rotated, a spoofer) must not trigger
// onUp for a subscriber pinned to a different fp.
//
// We don't touch real mDNS. handleUp/handleDown are exposed on HubResolver
// specifically so tests can drive the event machinery with fake Service
// payloads.

import { describe, it, expect, beforeEach } from "bun:test";
import type { Service } from "bonjour-service";
import { HubResolver, type HubEndpoint } from "../mdns-resolver.js";

function svc(overrides: {
  name?: string;
  host?: string;
  address?: string;
  port?: number;
  fp?: string;
}): Service {
  const {
    name = "omnideck-hub",
    host = "hub.local",
    address,
    port = 4443,
    fp,
  } = overrides;
  return {
    name,
    host,
    port,
    txt: fp !== undefined ? { fp, name } : { name },
    referer: address ? { address } : undefined,
  } as unknown as Service;
}

describe("HubResolver fingerprint pinning", () => {
  let resolver: HubResolver;

  beforeEach(() => {
    resolver = new HubResolver();
  });

  it("onUp fires only for endpoints whose fingerprint matches the subscription", () => {
    const fpSubscribed = "aabbccdd";
    const fpOther = "11223344";

    const seen: HubEndpoint[] = [];
    resolver.onUp(fpSubscribed, (ep) => seen.push(ep));

    // Advertise a hub with a DIFFERENT fingerprint — subscriber must not fire.
    resolver.handleUp(svc({ fp: fpOther, address: "192.168.1.5" }));
    expect(seen).toHaveLength(0);

    // Same subscription, now a matching hub shows up — subscriber fires.
    resolver.handleUp(svc({ fp: fpSubscribed, address: "192.168.1.6" }));
    expect(seen).toHaveLength(1);
    expect(seen[0].fingerprint).toBe(fpSubscribed);
    expect(seen[0].address).toBe("192.168.1.6");
  });

  it("services without a fingerprint are ignored entirely", () => {
    const seen: HubEndpoint[] = [];
    resolver.onUp("aabbccdd", (ep) => seen.push(ep));

    // No TXT.fp — could be a legacy or buggy announcer. Must not match any
    // fingerprint-keyed subscriber.
    resolver.handleUp(svc({ address: "192.168.1.7" }));
    expect(seen).toHaveLength(0);
    expect(resolver.get("aabbccdd")).toBeUndefined();
  });

  it("replays the current endpoint to a late subscriber (fingerprint match only)", async () => {
    // Hub is already seen on the network.
    resolver.handleUp(svc({ fp: "aabbccdd", address: "192.168.1.8" }));

    // A late subscriber for the same fingerprint gets notified on the next
    // microtask tick (the resolver uses queueMicrotask for the replay).
    const seen: HubEndpoint[] = [];
    resolver.onUp("aabbccdd", (ep) => seen.push(ep));
    await Promise.resolve();
    expect(seen).toHaveLength(1);
    expect(seen[0].address).toBe("192.168.1.8");

    // A late subscriber for a different fingerprint sees nothing.
    const other: HubEndpoint[] = [];
    resolver.onUp("11223344", (ep) => other.push(ep));
    await Promise.resolve();
    expect(other).toHaveLength(0);
  });

  it("onDown fires only for the matching fingerprint", () => {
    const downs: HubEndpoint[] = [];
    resolver.onDown("aabbccdd", (ep) => downs.push(ep));

    resolver.handleUp(svc({ fp: "aabbccdd", address: "192.168.1.9" }));
    resolver.handleDown(svc({ fp: "11223344", address: "192.168.1.9" }));
    expect(downs).toHaveLength(0);

    resolver.handleDown(svc({ fp: "aabbccdd", address: "192.168.1.9" }));
    expect(downs).toHaveLength(1);
    expect(resolver.get("aabbccdd")).toBeUndefined();
  });

  it("unsubscribing stops further callbacks", () => {
    const seen: HubEndpoint[] = [];
    const unsub = resolver.onUp("aabbccdd", (ep) => seen.push(ep));

    resolver.handleUp(svc({ fp: "aabbccdd", address: "192.168.1.10" }));
    expect(seen).toHaveLength(1);

    unsub();
    resolver.handleDown(svc({ fp: "aabbccdd", address: "192.168.1.10" }));
    resolver.handleUp(svc({ fp: "aabbccdd", address: "192.168.1.11" }));
    expect(seen).toHaveLength(1); // no new entries after unsub
  });
});
