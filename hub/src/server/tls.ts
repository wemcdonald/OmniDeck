import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { hostname, networkInterfaces } from "node:os";
import { createHash } from "node:crypto";
import * as x509 from "@peculiar/x509";
import { createLogger } from "../logger.js";

const log = createLogger("tls");

export interface TlsCerts {
  caCert: Buffer;
  caKey: Buffer;
  serverCert: Buffer;
  serverKey: Buffer;
  /** SHA-256 fingerprint of the CA certificate (hex, colon-separated) */
  caFingerprint: string;
}

/**
 * Ensure TLS certificates exist in the given directory.
 * Generates a self-signed CA and server certificate on first run.
 * Idempotent — skips generation if valid certs already exist.
 */
export async function ensureTlsCerts(tlsDir: string): Promise<TlsCerts> {
  mkdirSync(tlsDir, { recursive: true });

  const caKeyPath = join(tlsDir, "ca.key");
  const caCertPath = join(tlsDir, "ca.crt");
  const serverKeyPath = join(tlsDir, "server.key");
  const serverCertPath = join(tlsDir, "server.crt");

  const allExist =
    existsSync(caKeyPath) &&
    existsSync(caCertPath) &&
    existsSync(serverKeyPath) &&
    existsSync(serverCertPath);

  if (allExist) {
    log.info({ tlsDir }, "TLS certificates already exist, loading");
    const caCert = readFileSync(caCertPath);
    const caKey = readFileSync(caKeyPath);
    const serverCert = readFileSync(serverCertPath);
    const serverKey = readFileSync(serverKeyPath);
    const caFingerprint = computeFingerprint(caCert);

    // Check if server cert is expiring within 30 days
    try {
      const cert = new x509.X509Certificate(serverCert);
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      if (cert.notAfter.getTime() - Date.now() < thirtyDays) {
        log.info("Server certificate expiring soon, regenerating");
        const renewed = await generateServerCert(caKey, caCert);
        writeFileSync(serverKeyPath, renewed.key, { mode: 0o600 });
        writeFileSync(serverCertPath, renewed.cert);
        return {
          caCert,
          caKey,
          serverCert: Buffer.from(renewed.cert),
          serverKey: Buffer.from(renewed.key),
          caFingerprint,
        };
      }
    } catch {
      log.warn("Failed to parse existing server cert, regenerating");
      const renewed = await generateServerCert(caKey, caCert);
      writeFileSync(serverKeyPath, renewed.key, { mode: 0o600 });
      writeFileSync(serverCertPath, renewed.cert);
      return {
        caCert,
        caKey,
        serverCert: Buffer.from(renewed.cert),
        serverKey: Buffer.from(renewed.key),
        caFingerprint,
      };
    }

    return { caCert, caKey, serverCert, serverKey, caFingerprint };
  }

  log.info({ tlsDir }, "Generating TLS certificates");

  // Generate CA key pair (4096-bit RSA)
  const caAlgorithm = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 4096,
  };
  const caKeys = await crypto.subtle.generateKey(caAlgorithm, true, [
    "sign",
    "verify",
  ]);

  // Create self-signed CA certificate (10-year validity)
  const caCertObj = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomSerialNumber(),
    name: "CN=OmniDeck CA",
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
    keys: caKeys,
    signingAlgorithm: caAlgorithm,
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
        true,
      ),
    ],
  });

  // Export CA key and cert as PEM
  const caKeyPem = await exportPrivateKeyPem(caKeys.privateKey);
  const caCertPem = caCertObj.toString("pem");

  // Generate server cert signed by CA
  const server = await generateServerCert(
    Buffer.from(caKeyPem),
    Buffer.from(caCertPem),
  );

  // Write all files
  writeFileSync(caKeyPath, caKeyPem, { mode: 0o600 });
  writeFileSync(caCertPath, caCertPem);
  writeFileSync(serverKeyPath, server.key, { mode: 0o600 });
  writeFileSync(serverCertPath, server.cert);

  const caCertBuf = Buffer.from(caCertPem);
  const caKeyBuf = Buffer.from(caKeyPem);
  const serverCertBuf = Buffer.from(server.cert);
  const serverKeyBuf = Buffer.from(server.key);
  const caFingerprint = computeFingerprint(caCertBuf);

  log.info({ caFingerprint }, "TLS certificates generated");

  return {
    caCert: caCertBuf,
    caKey: caKeyBuf,
    serverCert: serverCertBuf,
    serverKey: serverKeyBuf,
    caFingerprint,
  };
}

async function generateServerCert(
  caKeyPem: Buffer,
  caCertPem: Buffer,
): Promise<{ key: string; cert: string }> {
  const caAlgorithm = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 4096,
  };

  // Import the CA private key
  const caKeyData = pemToArrayBuffer(caKeyPem.toString(), "PRIVATE KEY");
  const caPrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    caKeyData,
    caAlgorithm,
    true,
    ["sign"],
  );

  // Parse the CA cert to use as issuer
  const caCertObj = new x509.X509Certificate(caCertPem.toString());

  // Generate server key pair (2048-bit RSA)
  const serverAlgorithm = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048,
  };
  const serverKeys = await crypto.subtle.generateKey(serverAlgorithm, true, [
    "sign",
    "verify",
  ]);

  // Build SAN list — include all local IPs so the cert works
  // over any network interface (LAN, Tailscale, etc.)
  const hostName = hostname();
  const sans: x509.JsonGeneralNames = [
    { type: "dns", value: "localhost" },
    { type: "dns", value: "omnideck.local" },
    { type: "ip", value: "127.0.0.1" },
  ];
  if (hostName && hostName !== "localhost") {
    sans.push({ type: "dns", value: hostName });
    if (!hostName.endsWith(".local")) {
      sans.push({ type: "dns", value: `${hostName}.local` });
    }
  }
  // Add all non-internal IPv4 addresses from network interfaces
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.internal) continue;
      if (iface.family === "IPv4") {
        sans.push({ type: "ip", value: iface.address });
      }
    }
  }

  // Create server certificate signed by CA (1-year validity)
  const serverCert = await x509.X509CertificateGenerator.create({
    serialNumber: randomSerialNumber(),
    subject: `CN=${hostName || "omnideck"}`,
    issuer: caCertObj.subject,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    signingKey: caPrivateKey,
    publicKey: serverKeys.publicKey,
    signingAlgorithm: caAlgorithm,
    extensions: [
      new x509.BasicConstraintsExtension(false),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment,
        true,
      ),
      new x509.ExtendedKeyUsageExtension(["1.3.6.1.5.5.7.3.1"]), // serverAuth
      new x509.SubjectAlternativeNameExtension(sans, false),
    ],
  });

  const serverKeyPem = await exportPrivateKeyPem(serverKeys.privateKey);
  return { key: serverKeyPem, cert: serverCert.toString("pem") };
}

function randomSerialNumber(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Ensure positive by clearing the high bit
  bytes[0] &= 0x7f;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function exportPrivateKeyPem(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("pkcs8", key);
  const b64 = Buffer.from(exported).toString("base64");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function pemToArrayBuffer(pem: string, label: string): ArrayBuffer {
  const b64 = pem
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s/g, "");
  const binary = Buffer.from(b64, "base64");
  return binary.buffer.slice(
    binary.byteOffset,
    binary.byteOffset + binary.byteLength,
  );
}

function computeFingerprint(certPem: Buffer): string {
  const cert = new x509.X509Certificate(certPem.toString());
  const derBytes = Buffer.from(cert.rawData);
  const hash = createHash("sha256").update(derBytes).digest("hex");
  // Format as colon-separated pairs
  return hash
    .match(/.{2}/g)!
    .join(":")
    .toUpperCase();
}
