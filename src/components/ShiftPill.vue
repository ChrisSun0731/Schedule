<template>
  <span class="shift-pill" :class="meta?.cls" :style="dense ? 'min-width:30px;height:20px;font-size:11px' : ''">
    {{ meta?.short ?? '—' }}
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
