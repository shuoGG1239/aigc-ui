<script setup lang="ts">
import { APP_DISPLAY_NAME } from '@shared/app-defaults'

const platform = window.api?.platform ?? 'win32'
</script>

<template>
  <header class="titlebar" :class="[`titlebar--${platform}`]" aria-label="窗口标题栏">
    <div class="titlebar-drag">
      <svg class="titlebar-mark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill="#2563eb" />
        <path
          d="M8 18.5L12.2 9h3.6L20 18.5h-2.7l-.8-1.9h-4.9l-.8 1.9H8zm4.2-4.2h3.6L14.1 11h-.2l-1.7 3.3z"
          fill="#fff"
        />
      </svg>
      <span class="titlebar-title">{{ APP_DISPLAY_NAME }}</span>
    </div>
  </header>
</template>
