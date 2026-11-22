<template>
  <span class="level-badge" :class="senior ? 'senior' : 'junior'" :title="senior ? '計入資深人力' : undefined">
    {{ level }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import type { NurseLevel } from '@/types/schedule';

const props = defineProps<{ level: NurseLevel }>();
const settings = useSettingsStore();

/**
 * Levels that count toward the senior-staffing rule (Settings → 資深人力, N2+ by default) are filled;
 * the rest are outlined. Badges stay neutral so indigo only ever means the night shift.
 */
const senior = computed(() => settings.rules.seniorLevels.includes(props.level));
</script>

<style scoped lang="scss">
.level-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.03em;
  border: 1px solid var(--level);
}
.senior {
  background: var(--level);
  color: var(--on-level);
}
.junior {
  background: transparent;
  color: var(--level);
}
</style>
