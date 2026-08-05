#!/usr/bin/env node
/**
 * @xmcl パッケージの壊れた main エントリを dist に直す（インストール後フック）
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pnpm = path.join(root, 'node_modules', '.pnpm')

function readJson(pkgPath) {
  let raw = fs.readFileSync(pkgPath, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  return JSON.parse(raw)
}

function patchPkg(pkgPath) {
  if (!fs.existsSync(pkgPath)) return
  let pkg
  try {
    pkg = readJson(pkgPath)
  } catch (err) {
    console.warn('skip invalid json', pkgPath, err.message)
    return
  }
  if (!pkg.name?.startsWith('@xmcl/')) return

  const dir = path.dirname(pkgPath)
  const distJs = path.join(dir, 'dist', 'index.js')
  const distMjs = path.join(dir, 'dist', 'index.mjs')
  const distDts = path.join(dir, 'dist', 'index.d.ts')
  const rootJs = path.join(dir, 'index.js')

  let changed = false

  if (fs.existsSync(distJs)) {
    if (pkg.main !== './dist/index.js') {
      pkg.main = './dist/index.js'
      changed = true
    }
  } else if (fs.existsSync(rootJs) && String(pkg.main || '').endsWith('.ts')) {
    pkg.main = './index.js'
    changed = true
  }

  if (fs.existsSync(distMjs)) {
    pkg.module = './dist/index.mjs'
    changed = true
  }
  if (fs.existsSync(distDts)) {
    pkg.types = './dist/index.d.ts'
    changed = true
  }
  if (pkg.browser && String(pkg.browser).endsWith('.ts')) {
    delete pkg.browser
    changed = true
  }

  // PowerShell 由来の BOM 付き JSON を常に正規化
  const next = JSON.stringify(pkg, null, 2) + '\n'
  const current = fs.readFileSync(pkgPath)
  if (changed || current[0] === 0xef) {
    fs.writeFileSync(pkgPath, next)
    console.log('patched', pkg.name)
  }

  // installer が require('@xmcl/core/utils') するため shim を用意
  if (pkg.name === '@xmcl/core') {
    const utilsJs = path.join(dir, 'utils.js')
    const shim = `'use strict';
const core = require('./dist/index.js');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
exports.checksum = core.checksum;
exports.exists = async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
};
exports.validateSha1 = async function validateSha1(target, hash, strict) {
  if (!hash) return !strict;
  try {
    const actual = await core.checksum(target, 'sha1');
    return actual === hash;
  } catch {
    return false;
  }
};
exports.isNotNull = function isNotNull(v) { return v !== undefined && v !== null; };
`
    fs.writeFileSync(utilsJs, shim)
    const pkg2 = readJson(pkgPath)
    pkg2.exports = {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.mjs',
        require: './dist/index.js',
      },
      './utils': {
        types: './dist/utils.d.ts',
        require: './utils.js',
        default: './utils.js',
      },
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg2, null, 2) + '\n')
    console.log('shimmed @xmcl/core/utils')
  }
}

if (!fs.existsSync(pnpm)) process.exit(0)

for (const entry of fs.readdirSync(pnpm)) {
  if (!entry.includes('xmcl')) continue
  const xmclRoot = path.join(pnpm, entry, 'node_modules', '@xmcl')
  if (!fs.existsSync(xmclRoot)) continue
  for (const child of fs.readdirSync(xmclRoot)) {
    patchPkg(path.join(xmclRoot, child, 'package.json'))
  }
}
