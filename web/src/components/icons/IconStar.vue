<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
    /** Filled star for active / starred state. */
    filled?: boolean
  }>(),
  { size: 14, filled: false },
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M12 2.5l2.85 5.78 6.38.93-4.62 4.5 1.09 6.36L12 17.02l-5.7 3.05 1.09-6.36-4.62-4.5 6.38-.93L12 2.5z"
    />
  </svg>
</template>
