import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@fledge/core', '@fledge/shared'],
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
        },
        external: [/^@xmcl\//],
      },
    },
    resolve: {
      alias: {
        '@fledge/core': resolve('../../packages/core/src/index.ts'),
        '@fledge/shared': resolve('../../packages/shared/src/index.ts'),
      },
    },
  },
  preload: {
    // shared を preload に同梱し、実行時 require 解決失敗を防ぐ
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@fledge/shared'],
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts'),
        },
      },
    },
    resolve: {
      alias: {
        '@fledge/shared': resolve('../../packages/shared/src/index.ts'),
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@renderer': resolve('src'),
        '@fledge/shared': resolve('../../packages/shared/src/index.ts'),
        '@fledge/i18n': resolve('../../packages/i18n/src/index.ts'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
