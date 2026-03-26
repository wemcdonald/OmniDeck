import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLogger } from "../../logger.js";

const log = createLogger("github-fetcher");

export interface GitHubRef {
  owner: string;
  repo: string;
  ref: string | undefined;
  path: string;
}

export function parseGitHubUrl(input: string): GitHubRef | null {
  if (!input || !input.trim()) return null;

  let owner: string;
  let repo: string;
  let ref: string | undefined;
  let path = "";

  // Try as full URL first
  try {
    const url = new URL(input);
    if (url.hostname !== "github.com") return null;

    const parts = url.pathname.replace(/^\/|\/$/g, "").split("/");
    if (parts.length < 2) return null;

    owner = parts[0];
    repo = parts[1];

    // /tree/branch/path/to/dir
    if (parts.length > 3 && parts[2] === "tree") {
      ref = parts[3];
      path = parts.slice(4).join("/");
    }

    return { owner, repo, ref, path };
  } catch {
    // Not a full URL — try short form
  }

  // Short form: user/repo or user/repo/path/to/plugin
  const parts = input.replace(/^\/|\/$/g, "").split("/");
  if (parts.length < 2) return null;

  owner = parts[0];
  repo = parts[1];
  path = parts.slice(2).join("/");

  // Basic validation: owner and repo should look like GitHub identifiers
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;

  return { owner, repo, ref, path };
}

interface GitHubContentEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

/**
 * Fetch a plugin directory from GitHub into a local temp directory.
 * Uses the GitHub Contents API to fetch individual files.
 */
export async function fetchPluginFromGitHub(
  ref: GitHubRef,
): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), "omnideck-plugin-install-"));

  await fetchDirectory(ref, ref.path, tmpDir);

  return tmpDir;
}

async function fetchDirectory(
  ref: GitHubRef,
  dirPath: string,
  localDir: string,
): Promise<void> {
  const apiUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${dirPath}${ref.ref ? `?ref=${ref.ref}` : ""}`;

  log.info({ url: apiUrl }, "Fetching directory listing");

  const res = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "OmniDeck-Hub",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${body}`);
  }

  const entries = (await res.json()) as GitHubContentEntry[];

  for (const entry of entries) {
    if (entry.type === "file" && entry.download_url) {
      const fileRes = await fetch(entry.download_url);
      if (!fileRes.ok) {
        throw new Error(`Failed to download ${entry.name}: ${fileRes.status}`);
      }
      const content = await fileRes.text();
      writeFileSync(join(localDir, entry.name), content);
    } else if (entry.type === "dir") {
      const subDir = join(localDir, entry.name);
      mkdirSync(subDir, { recursive: true });
      await fetchDirectory(ref, entry.path, subDir);
    }
  }
}

/**
 * Fetch the latest commit SHA for a repo (used for cache invalidation).
 */
export async function fetchLatestSha(
  owner: string,
  repo: string,
): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
    {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "OmniDeck-Hub",
      },
    },
  );

  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status})`);
  }

  const commits = (await res.json()) as Array<{ sha: string }>;
  return commits[0].sha;
}

/**
 * Fetch a repo tarball and extract all plugin manifests for browsing.
 * Returns temp dir containing extracted repo contents.
 */
export async function fetchRepoTarball(
  owner: string,
  repo: string,
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/tarball`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "OmniDeck-Hub",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`GitHub tarball download failed (${res.status})`);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "omnideck-browse-"));
  const tarballPath = join(tmpDir, "repo.tar.gz");

  const arrayBuffer = await res.arrayBuffer();
  writeFileSync(tarballPath, Buffer.from(arrayBuffer));

  return tarballPath;
}
