<template>
  <q-dialog
    :model-value="modelValue"
    :persistent="persistent"
    :maximized="phone"
    :transition-show="transitionShow"
    :transition-hide="transitionHide"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <q-card class="app-dialog" :class="{ 'app-dialog--full': phone }" :style="phone ? undefined : { width: `${width}px`, maxWidth: '94vw' }">
      <component :is="form ? QForm : 'div'" class="app-dialog__frame" @submit="emit('submit')">
        <header class="app-dialog__head">
          <div class="app-dialog__title-row">
            <h2 class="app-dialog__title">{{ title }}</h2>
            <span v-if="meta" class="app-dialog__meta">{{ meta }}</span>
          </div>
          <!-- Every dialog says what it does and what happens next. -->
          <p v-if="description" class="app-dialog__desc">{{ description }}</p>
        </header>
        <div class="app-dialog__body"><slot /></div>
        <footer v-if="$slots.actions" class="app-dialog__actions"><slot name="actions" /></footer>
      </component>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { QForm, useQuasar } from 'quasar';
import { useReducedMotion } from '@/composables/useMotion';

withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    /** One or two sentences: what the dialog does and what happens after the main action. */
    description?: string;
    /** Context shown beside the title, such as the period or ward. */
    meta?: string;
    /** Width on tablets and desktops; phones always get the full screen. */
    width?: number;
    persistent?: boolean;
    /** Wrap body and actions in a QForm; a submit button then emits `submit` after validation. */
    form?: boolean;
  }>(),
  { description: '', meta: '', width: 480, persistent: false, form: false },
);
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; submit: [] }>();

const $q = useQuasar();
const reducedMotion = useReducedMotion();
const phone = computed(() => $q.screen.xs);
const transitionShow = computed(() => (reducedMotion.value ? 'fade' : phone.value ? 'slide-up' : 'scale'));
const transitionHide = computed(() => (reducedMotion.value ? 'fade' : phone.value ? 'slide-down' : 'scale'));
</script>

<style scoped lang="scss">
.app-dialog {
  border-radius: var(--radius);
  max-height: 92vh;
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
  &--full {
    border-radius: 0;
    max-height: none;
  }
}
.app-dialog__frame {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}
.app-dialog__head {
  padding: 20px 20px 8px;
  .app-dialog--full & {
    padding-top: calc(16px + env(safe-area-inset-top));
  }
}
.app-dialog__title-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.app-dialog__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: normal;
}
.app-dialog__meta {
  font-size: 0.8125rem;
  color: var(--text-2);
}
.app-dialog__desc {
  margin: 4px 0 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-2);
}
.app-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 20px 16px;
}
.app-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  .app-dialog--full & {
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }
}
</style>
