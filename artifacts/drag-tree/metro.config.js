const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Monorepo root — two levels up from artifacts/drag-tree
const monorepoRoot = path.resolve(__dirname, "../..");

const config = getDefaultConfig(__dirname);

// Let Metro resolve workspace packages (symlinked by pnpm)
config.watchFolders = [monorepoRoot];

// Tell Metro where to look for node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = config;
