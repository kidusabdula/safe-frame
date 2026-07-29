// Metro config for a pnpm monorepo + bundled ONNX model asset.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the workspace so @safeframe/core resolves and hot-reloads.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// The quantized ViT ships as a bundled asset.
config.resolver.assetExts = [...config.resolver.assetExts, "onnx"];

module.exports = config;
