export const VERSION = "0.1.0";

export const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "vendor",
  "worktrees"
]);

export const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".conf",
  ".config",
  ".env",
  ".example",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".sample",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

export const MAX_FILE_BYTES = 1024 * 1024;

