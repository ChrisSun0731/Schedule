<template>
  <span
    class="shift-pill"
    :class="[meta?.cls, { dense }]"
    role="img"
    :aria-label="meta ? `${meta.label}（${meta.short}）` : '未排班'"
  >
    <span aria-hidden="true">{{ meta?.short ?? '—' }}</span>
    <q-tooltip v-if="tooltip && meta" :delay="300">{{ meta.label }}</q-tooltip>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SHIFT_META } from '@/constants/labels';
import type { ShiftCode } from '@/types/schedule';

const props = withDefaults(defineProps<{ code: ShiftCode | null | undefined; dense?: boolean; tooltip?: boolean }>(), {
  dense: false,
  tooltip: true,
});

const meta = computed(() => (props.code ? SHIFT_META[props.code] : null));
</script>

<style scoped lang="scss">
.shift-pill.dense {
  min-width: 1.875rem;
  height: 1.25rem;
  font-size: 0.6875rem;
}
</style>
