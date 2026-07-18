import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
      // renderer root 在 web/，字体依赖在上级 node_modules，需显式放行
      fs: {
        allow: [resolve(__dirname)],
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'web/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'web/src'),
      },
    },
    plugins: [vue()],
  },
})

