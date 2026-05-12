const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const sharedRoot = path.resolve(projectRoot, '../shared')

const config = getDefaultConfig(projectRoot)

// Let Metro watch the shared package outside the mobile directory
config.watchFolders = [sharedRoot]

// When Babel transforms files inside shared/, it emits @babel/runtime helpers.
// Those helpers live in mobile/node_modules, not shared/node_modules (which
// doesn't exist). Adding mobile's node_modules as a fallback search path fixes
// "cannot find @babel/runtime" errors for any file resolved from shared/.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
]

// Explicitly resolve @miximixi/shared subpath exports to their TS source files.
// Metro does not reliably follow the package.json "exports" field for file: deps.
const sharedMap = {
  '@miximixi/shared': path.join(sharedRoot, 'src/index.ts'),
  '@miximixi/shared/api': path.join(sharedRoot, 'src/api.ts'),
  '@miximixi/shared/types': path.join(sharedRoot, 'src/types.ts'),
  '@miximixi/shared/constants': path.join(sharedRoot, 'src/constants.ts'),
  '@miximixi/shared/cupConversions': path.join(sharedRoot, 'src/cupConversions.ts'),
  '@miximixi/shared/categoryUtils': path.join(sharedRoot, 'src/categoryUtils.ts'),
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (sharedMap[moduleName]) {
    return { filePath: sharedMap[moduleName], type: 'sourceFile' }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
