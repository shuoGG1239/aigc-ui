import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const sharedAlias = {
  '@shared': resolve(__dirname, 'shared'),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAlias,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAlias,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'web'),
    server: {
      // renderer root 在 web/，字体依赖与 shared/ 在上级，需显式放行
      fs: {
        allow: [resolve(__dirname)],
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'web/index.html'),
          findBar: resolve(__dirname, 'web/find-bar.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'web/src'),
        ...sharedAlias,
      },
    },
    plugins: [vue()],
  },
})
