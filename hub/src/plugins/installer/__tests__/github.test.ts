import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "../github.js";

describe("parseGitHubUrl", () => {
  it("parses full URL to repo root", () => {
    const result = parseGitHubUrl("https://github.com/user/repo");
    expect(result).toEqual({ owner: "user", repo: "repo", ref: undefined, path: "" });
  });

  it("parses URL with tree/branch/path", () => {
    const result = parseGitHubUrl("https://github.com/user/repo/tree/main/plugins/my-plugin");
    expect(result).toEqual({ owner: "user", repo: "repo", ref: "main", path: "plugins/my-plugin" });
  });

  it("parses short form user/repo", () => {
    const result = parseGitHubUrl("user/repo");
    expect(result).toEqual({ owner: "user", repo: "repo", ref: undefined, path: "" });
  });

  it("parses short form user/repo/path/to/plugin", () => {
    const result = parseGitHubUrl("user/repo/path/to/plugin");
    expect(result).toEqual({ owner: "user", repo: "repo", ref: undefined, path: "path/to/plugin" });
  });

  it("handles trailing slashes", () => {
    const result = parseGitHubUrl("https://github.com/user/repo/");
    expect(result).toEqual({ owner: "user", repo: "repo", ref: undefined, path: "" });
  });

  it("returns null for invalid URLs", () => {
    expect(parseGitHubUrl("")).toBeNull();
    expect(parseGitHubUrl("not-a-url")).toBeNull();
    expect(parseGitHubUrl("https://gitlab.com/user/repo")).toBeNull();
  });
});
