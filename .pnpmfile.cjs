const XMCL_VERSIONS = {
  '@xmcl/unzip': '2.2.0',
  '@xmcl/asm': '1.0.1',
  '@xmcl/file-transfer': '2.1.2',
  '@xmcl/forge-site-parser': '2.0.9',
  '@xmcl/yauzl': '2.10.0',
  '@xmcl/core': '2.16.0',
  '@xmcl/installer': '6.3.1',
}

function rewriteDeps(deps) {
  if (!deps) return
  for (const [name, version] of Object.entries(deps)) {
    if (typeof version === 'string' && version.startsWith('workspace:')) {
      if (XMCL_VERSIONS[name]) {
        deps[name] = XMCL_VERSIONS[name]
      }
    }
  }
}

/**
 * @xmcl 系は npm 上で workspace:^* のまま公開され、main がソースを指している。
 * 依存解決とエントリポイントを実行可能な dist に書き換える。
 */
function readPackage(pkg) {
  rewriteDeps(pkg.dependencies)
  rewriteDeps(pkg.optionalDependencies)
  rewriteDeps(pkg.peerDependencies)
  rewriteDeps(pkg.devDependencies)

  if (pkg.name === '@xmcl/installer' || pkg.name === '@xmcl/core') {
    pkg.main = './dist/index.js'
    pkg.module = './dist/index.mjs'
    pkg.types = './dist/index.d.ts'
    pkg.exports = {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.mjs',
        require: './dist/index.js',
      },
    }
  }

  return pkg
}

module.exports = {
  hooks: {
    readPackage,
  },
}
