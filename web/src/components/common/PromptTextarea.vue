<script setup lang="ts">
import { ref } from 'vue'
import type { ModelFamily } from '@shared/family'
import { useTagComplete } from '@/composables/useTagComplete'
import { tagCategoryClass } from '@/prompt/tag-complete/tag-db'

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    family: ModelFamily
    id?: string
    rows?: number
    placeholder?: string
    sm?: boolean
    /** Fill parent height (for flex layouts that grow with the window). */
    fill?: boolean
    fieldAttr?: string
  }>(),
  {
    rows: 5,
    placeholder: '',
    sm: false,
    fill: false,
  },
)

const emit = defineEmits<{
  focus: [e: FocusEvent]
  blur: [e: FocusEvent]
  caret: []
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

const {
  items,
  active,
  panelStyle,
  hasItems,
  applyAt,
  onKeydown,
  onCompositionStart,
  onCompositionEnd,
  onFocus,
  onBlur,
  onInput,
  onPointerCaret,
  onCaret,
  highlight,
} = useTagComplete({
  textareaRef,
  family: () => props.family,
  model,
  emitCaret: () => emit('caret'),
  emitFocus: (e) => emit('focus', e),
  emitBlur: (e) => emit('blur', e),
})

defineExpose({
  getTextarea: () => textareaRef.value,
})
</script>

<template>
  <div class="prompt-textarea" :class="{ 'prompt-textarea--fill': fill }">
    <textarea
      :id="id"
      ref="textareaRef"
      v-model="model"
      class="textarea"
      :class="{ 'textarea--sm': sm && !fill, 'textarea--fill': fill }"
      :rows="fill ? undefined : rows"
      :placeholder="placeholder"
      :data-prompt-field="fieldAttr"
      wrap="soft"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
      @keydown="onKeydown"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @click="onPointerCaret"
      @keyup="onCaret"
      @select="onPointerCaret"
    />
    <Teleport to="body">
      <div
        v-if="hasItems"
        class="tac-panel"
        :style="panelStyle"
        role="listbox"
        @mousedown.prevent
      >
        <button
          v-for="(item, i) in items"
          :key="item.key"
          type="button"
          class="tac-item"
          :class="[
            { 'is-active': i === active },
            item.kind === 'tag' && item.category != null ? tagCategoryClass(item.category) : '',
            item.kind === 'lora' ? 'tac-kind-lora' : '',
          ]"
          role="option"
          :aria-selected="i === active"
          @mouseenter="active = i"
          @click="applyAt(i)"
        >
          <span class="tac-label">
            <template v-for="(part, pi) in highlight(item.label)" :key="pi">
              <mark v-if="part.hit" class="tac-hit">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
            <span v-if="item.matchedAlias" class="tac-alias">← {{ item.matchedAlias }}</span>
            <span v-if="item.translation" class="tac-zh">{{ item.translation }}</span>
          </span>
          <span class="tac-meta">{{ item.meta }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.prompt-textarea {
  position: relative;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.prompt-textarea--fill {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.prompt-textarea :deep(.textarea) {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-all;
}

.prompt-textarea :deep(.textarea--fill) {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  resize: none;
}
</style>

<!-- Teleport 到 body：不用 scoped，避免样式丢失 -->
<style>
.tac-panel {
  position: fixed;
  z-index: 1200;
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  padding: 4px;
}

.tac-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--text);
  cursor: pointer;
}

.tac-item:hover,
.tac-item.is-active {
  background: var(--bg-sidebar-item-hover);
}

.tac-label {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.tac-alias {
  margin-left: 6px;
  color: var(--text-muted);
  font-size: 11.5px;
}

.tac-zh {
  margin-left: 8px;
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 400;
}

.tac-meta {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 11.5px;
}

.tac-hit {
  background: transparent;
  color: inherit;
  font-weight: 700;
  padding: 0;
}

.tac-cat-general {
  color: #2563eb;
}
.tac-cat-artist {
  color: #c2410c;
}
.tac-cat-copyright {
  color: #7c3aed;
}
.tac-cat-character {
  color: #15803d;
}
.tac-cat-meta {
  color: #64748b;
}
.tac-kind-lora {
  color: #0f766e;
}

.tac-cat-general .tac-meta,
.tac-cat-artist .tac-meta,
.tac-cat-copyright .tac-meta,
.tac-cat-character .tac-meta,
.tac-cat-meta .tac-meta,
.tac-kind-lora .tac-meta {
  color: var(--text-muted);
}
</style>
