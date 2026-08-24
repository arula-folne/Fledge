import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** ランタイムデータ（JDK 等）を Vite のファイル監視から除外して EBUSY を防ぐ */
const watchIgnored = ['**/.fledge-root/**', '**/.fledge-root']

const workspaceSrc = [
  resolve('../../packages/core/src'),
  resolve('../../packages/shared/src'),
]

/** メインは Vite の root 外パッケージを監視しないことがあるため明示する */
function watchWorkspacePackages() {
  return {
    name: 'watch-workspace-packages',
    buildStart(this: { addWatchFile: (id: string) => void }) {
      for (const dir of workspaceSrc) this.addWatchFile(dir)
    },
  }
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@fledge/core', '@fledge/shared'],
      }),
      watchWorkspacePackages(),
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
    server: {
      watch: { ignored: watchIgnored },
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
    server: {
      watch: { ignored: watchIgnored },
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
    server: {
      watch: { ignored: watchIgnored },
    },
  },
})
