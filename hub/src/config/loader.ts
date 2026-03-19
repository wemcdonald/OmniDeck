// hub/src/config/loader.ts
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { parse, parseDocument, visit, isScalar } from "yaml";

export interface RawConfig {
  deck?: Record<string, unknown>;
  devices?: Array<Record<string, unknown>>;
  plugins?: Record<string, Record<string, unknown>>;
  orchestrator?: Record<string, unknown>;
  pages: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function loadSecrets(secretsPath: string): Map<string, string> {
  if (!existsSync(secretsPath)) return new Map();
  const raw = readFileSync(secretsPath, "utf-8");
  const parsed = parse(raw) as Record<string, string>;
  return new Map(Object.entries(parsed));
}

function parseYamlWithSecrets(
  content: string,
  secrets: Map<string, string>
): unknown {
  const doc = parseDocument(content, {
    customTags: [{ tag: "!secret", identify: () => false, resolve: (str: string) => str }],
  });

  // Walk AST and resolve all !secret scalars in-place
  visit(doc, {
    Scalar(_key, node) {
      if (node.tag === "!secret") {
        const secretKey = String(node.value);
        const secretVal = secrets.get(secretKey);
        if (secretVal === undefined) {
          throw new Error(
            `Secret key "${secretKey}" not found in secrets.yaml`
          );
        }
        node.tag = undefined;
        node.value = secretVal;
      }
    },
  });

  return doc.toJSON();
}

function loadYamlFiles(
  dir: string,
  secrets: Map<string, string>
): Record<string, unknown> {
  if (!existsSync(dir)) return {};

  const files = readdirSync(dir).filter(
    (f) => extname(f) === ".yaml" || extname(f) === ".yml"
  );

  let merged: Record<string, unknown> = {};
  for (const file of files.sort()) {
    const content = readFileSync(join(dir, file), "utf-8");
    const parsed = parseYamlWithSecrets(content, secrets) as Record<
      string,
      unknown
    >;
    if (parsed) {
      merged = { ...merged, ...parsed };
    }
  }
  return merged;
}

const DEFAULT_CONFIG = `\
deck:
  brightness: 100
  wake_on_touch: true
  default_page: main

plugins:
  sound: {}
`;

const DEFAULT_PAGE = `\
page: main
name: Main
buttons: []
`;

function bootstrapConfigDir(configDir: string): void {
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const configFile = join(configDir, "config.yaml");
  if (!existsSync(configFile)) {
    writeFileSync(configFile, DEFAULT_CONFIG, "utf-8");
  }
  const pagesDir = join(configDir, "pages");
  if (!existsSync(pagesDir)) {
    mkdirSync(pagesDir, { recursive: true });
  }
  const hasPages = readdirSync(pagesDir).some(
    (f) => extname(f) === ".yaml" || extname(f) === ".yml"
  );
  if (!hasPages) {
    writeFileSync(join(pagesDir, "main.yaml"), DEFAULT_PAGE, "utf-8");
  }
}

export async function loadConfig(
  configDir: string,
  secretsPath?: string
): Promise<RawConfig> {
  bootstrapConfigDir(configDir);

  const secrets = secretsPath
    ? loadSecrets(secretsPath)
    : new Map<string, string>();

  // Load root YAML files
  const rootConfig = loadYamlFiles(configDir, secrets);

  // Load page configs from pages/ subdirectory
  const pagesDir = join(configDir, "pages");
  const pages: Array<Record<string, unknown>> = [];
  if (existsSync(pagesDir)) {
    const pageFiles = readdirSync(pagesDir).filter(
      (f) => extname(f) === ".yaml" || extname(f) === ".yml"
    );
    for (const file of pageFiles.sort()) {
      const content = readFileSync(join(pagesDir, file), "utf-8");
      const parsed = parseYamlWithSecrets(content, secrets);
      if (parsed) {
        pages.push(parsed as Record<string, unknown>);
      }
    }
  }

  return {
    ...rootConfig,
    pages,
  } as RawConfig;
}
