const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Monorepo root
const workspaceRoot = path.resolve(__dirname, "../..");
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so changes in packages/ are picked up
config.watchFolders = [workspaceRoot];

// Resolve modules from both the project and monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Force shared dependencies to always resolve from the project's node_modules.
// This is necessary in pnpm monorepos where Metro follows symlinks into .pnpm/
// and then resolves peer deps from the wrong location.
const forcedDeps = {
  react: require.resolve("react", { paths: [projectRoot] }),
  "react-native": require.resolve("react-native", { paths: [projectRoot] }),
};

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Intercept imports of shared deps and force them to the project's copy
  if (forcedDeps[moduleName]) {
    return {
      filePath: forcedDeps[moduleName],
      type: "sourceFile",
    };
  }

  // Fall back to default resolution
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
