#!/usr/bin/env tsx
/**
 * Generate a bcrypt hash for the OmniDeck web UI password.
 *
 * Usage:
 *   echo "mypassword" | npx tsx hub/scripts/hash-password.ts
 *   npx tsx hub/scripts/hash-password.ts    # prompts for input
 *
 * Add the output to ~/.omnideck/secrets.yaml:
 *   hub_password_hash: "$2a$10$..."
 *
 * Then reference it in config.yaml:
 *   auth:
 *     password_hash: !secret hub_password_hash
 */

import { hash } from "bcryptjs";
import { createInterface } from "node:readline";

async function main() {
  let password: string;

  if (!process.stdin.isTTY) {
    // Piped input
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    password = Buffer.concat(chunks).toString().trim();
  } else {
    // Interactive prompt
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    password = await new Promise<string>((resolve) => {
      rl.question("Enter password: ", (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  if (!password) {
    console.error("Error: empty password");
    process.exit(1);
  }

  const hashed = await hash(password, 10);
  console.log(hashed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
