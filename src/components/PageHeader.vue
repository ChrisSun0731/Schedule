<template>
  <div class="page-header-wrap">
    <header class="page-header">
      <div class="ph-main">
        <div class="ph-title-row">
          <h1 class="page-title">{{ title }}</h1>
          <q-btn
            v-if="items.length"
            flat
            dense
            no-caps
            class="ph-guide-btn"
            :class="{ open }"
            icon="help_outline"
            label="說明"
            :aria-expanded="open"
            :aria-controls="panelId"
            @click="open = !open"
          />
        </div>
        <p v-if="text" class="ph-desc">{{ text }}</p>
      </div>
      <div v-if="$slots.actions" class="ph-actions"><slot name="actions" /></div>
    </header>

    <!-- What this page can do. Open on the first visit; the choice is remembered per page. -->
    <section v-if="items.length" v-show="open" :id="panelId" class="ph-guide" :aria-label="`${title}：功能說明`">
      <dl class="ph-guide-list">
        <div v-for="i in shown" :key="i.title" class="ph-guide-item">
          <dt>{{ i.title }}</dt>
          <dd>{{ i.text }}</dd>
        </div>
      </dl>
      <div class="ph-guide-foot">
        <q-btn v-if="hidden" flat dense no-caps color="primary" :label="`顯示其他 ${hidden} 項`" @click="expanded = true" />
        <router-link v-else :to="{ name: 'help' }" class="ph-link">完整使用說明</router-link>
        <q-btn flat dense no-caps color="muted" label="收起說明" @click="open = false" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { GUIDES, itemsFor, summaryFor, type GuidePage } from '@/constants/guide';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{
  title: string;
  /** Overrides the guide's summary sentence. */
  description?: string;
  /** Shows that page's function list behind the 「說明」 button. */
  guide?: GuidePage;
}>();

const auth = useAuthStore();
const panelId = useId();

const page = computed(() => (props.guide ? GUIDES[props.guide] : null));
const text = computed(() => props.description ?? (page.value ? summaryFor(page.value, auth.role) : ''));
const items = computed(() => (page.value ? itemsFor(page.value, auth.role) : []));

/** Long lists start with the first few items (progressive disclosure); the rest is one tap away. */
const PREVIEW = 4;
const expanded = ref(false);
const shown = computed(() => (expanded.value || items.value.length <= PREVIEW + 1 ? items.value : items.value.slice(0, PREVIEW)));
const hidden = computed(() => items.value.length - shown.value.length);

const storageKey = computed(() => (props.guide ? `nursing-schedule:guide:${props.guide}` : ''));

function readOpen(): boolean {
  if (!storageKey.value) return false;
  try {
    return localStorage.getItem(storageKey.value) !== 'closed';
  } catch {
    return true;
  }
}

const open = ref(readOpen());
watch(open, (v) => {
  if (!storageKey.value) return;
  try {
    localStorage.setItem(storageKey.value, v ? 'open' : 'closed');
  } catch {
    /* storage unavailable (private mode): the panel still works for this visit */
  }
});
</script>

<style scoped lang="scss">
.page-header-wrap {
  margin-bottom: 16px;
}
.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
}
.ph-main {
  flex: 1 1 22rem;
  min-width: 0;
}
.ph-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ph-guide-btn {
  color: var(--text-2);
  border-radius: 999px;
  padding: 2px 10px 2px 6px;
  min-height: 32px;
  font-size: 0.8125rem;
  :deep(.q-icon) {
    font-size: 18px;
    margin-right: 4px;
  }
  &.open {
    background: var(--tint);
    color: var(--on-tint);
  }
}
.ph-desc {
  margin: 4px 0 0;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--text-2);
  max-width: 48rem;
  @media (max-width: 599px) {
    font-size: 0.875rem;
  }
}
.ph-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  @media (max-width: 599px) {
    flex: 1 1 100%;
  }
}

.ph-guide {
  margin-top: 12px;
  padding: 14px 16px 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.ph-guide-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(17rem, 100%), 1fr));
  gap: 12px 28px;
  margin: 0;
}
.ph-guide-item {
  min-width: 0;
  dt {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
  }
  dd {
    margin: 2px 0 0;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-2);
  }
}
.ph-guide-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}
.ph-link {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--focus);
  text-decoration: none;
  padding: 6px 0;
  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}
</style>
