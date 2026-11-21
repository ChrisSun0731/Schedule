<template>
  <q-badge :color="LEVEL_COLORS[level]" class="level-badge" :label="level" />
</template>

<script setup lang="ts">
import { LEVEL_COLORS } from '@/constants/labels';
import type { NurseLevel } from '@/types/schedule';

defineProps<{ level: NurseLevel }>();
</script>

<style scoped lang="scss">
.level-badge {
  font-weight: 700;
  font-size: 10px;
  padding: 2px 5px;
  letter-spacing: 0.03em;
}
</style>
