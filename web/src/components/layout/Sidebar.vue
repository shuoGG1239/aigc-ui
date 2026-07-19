<script setup lang="ts">
import { IconMoon, IconSun } from '@/components/icons'
import { useTheme } from '@/composables/useTheme'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()

const primaryItems = [
  { path: '/', label: '文生图', icon: 'spark' as const },
  { path: '/pools', label: '提示词池', icon: 'book' as const },
  { path: '/console', label: '控制台', icon: 'console' as const },
]

function go(path: string): void {
  router.push(path)
}
</script>

<template>
  <aside class="sidebar">
    <nav class="nav-list">
      <button
        v-for="item in primaryItems"
        :key="item.path"
        type="button"
        class="nav-item"
        :class="{ active: route.path === item.path }"
        :title="item.label"
        @click="go(item.path)"
      >
        <svg
          v-if="item.icon === 'spark'"
          class="nav-icon"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 3l1.8 5.6L19.5 10.5l-5.7 1.9L12 18l-1.8-5.6L4.5 10.5l5.7-1.9L12 3z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
          <path
            d="M18 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1z"
            fill="currentColor"
          />
        </svg>
        <svg
          v-else-if="item.icon === 'book'"
          class="nav-icon"
          viewBox="0 0 1024 1024"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M864 64H704V32c0-17.066667-14.933333-32-32-32S640 14.933333 640 32V64H384V32c0-17.066667-14.933333-32-32-32S320 14.933333 320 32V64H160C142.933333 64 128 78.933333 128 96v896c0 17.066667 14.933333 32 32 32h704c17.066667 0 32-14.933333 32-32v-896c0-17.066667-14.933333-32-32-32zM832 960H192V128h128v64c0 17.066667 14.933333 32 32 32S384 209.066667 384 192V128h256v64c0 17.066667 14.933333 32 32 32S704 209.066667 704 192V128h128v832z"
          />
          <path
            d="M704 384H320c-17.066667 0-32 14.933333-32 32S302.933333 448 320 448h384c17.066667 0 32-14.933333 32-32S721.066667 384 704 384zM704 640H320c-17.066667 0-32 14.933333-32 32S302.933333 704 320 704h384c17.066667 0 32-14.933333 32-32S721.066667 640 704 640z"
          />
        </svg>
        <svg v-else class="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.6" />
          <path
            d="M7 9.5l2.2 2.2L7 13.9M12.5 14.5H17"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </nav>

    <div class="sidebar-footer">
      <button
        type="button"
        class="nav-item"
        :title="isDark ? '切换到白天模式' : '切换到暗黑模式'"
        :aria-label="isDark ? '切换到白天模式' : '切换到暗黑模式'"
        @click="toggleTheme"
      >
        <IconSun v-if="!isDark" class="nav-icon" :size="22" />
        <IconMoon v-else class="nav-icon" :size="22" />
        <span class="nav-label">{{ isDark ? '暗黑' : '白天' }}</span>
      </button>
      <button
        type="button"
        class="nav-item"
        :class="{ active: route.path === '/settings' }"
        title="设置"
        @click="go('/settings')"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5z"
            stroke="currentColor"
            stroke-width="1.6"
          />
          <path
            d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.77 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.05.24.25.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.22 1.12-.54 1.63-.94l2.39.96c.25.1.54 0 .68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58z"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
        <span class="nav-label">设置</span>
      </button>
    </div>
  </aside>
</template>
