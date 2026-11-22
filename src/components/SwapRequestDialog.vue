<template>
  <q-dialog :model-value="modelValue" :maximized="$q.screen.xs" @update:model-value="$emit('update:modelValue', $event)">
    <q-card class="sheet" :style="$q.screen.xs ? undefined : 'width: 560px; max-width: 96vw'">
      <q-card-section class="row items-center q-pb-sm">
        <q-icon name="swap_horiz" color="primary" size="26px" class="q-mr-sm" />
        <div class="text-h6">申請換班</div>
        <q-space />
        <q-chip dense outline color="muted" class="gt-xs">{{ formatPeriod(schedule.startDate, schedule.endDate) }}</q-chip>
      </q-card-section>

      <q-card-section class="sheet-body q-pt-none q-gutter-y-md">
        <!-- 1. Requester -->
        <div class="step">
          <div class="step-title"><span class="step-no" aria-hidden="true">1</span>{{ auth.isManager ? '申請人的班' : '我的班' }}</div>
          <q-select
            v-if="auth.isManager"
            v-model="requesterId"
            outlined
            dense
            emit-value
            map-options
            :options="allNurseOptions"
            label="申請人"
            class="q-mb-sm"
          />
          <q-select
            v-model="requesterDay"
            outlined
            dense
            emit-value
            map-options
            :options="requesterDayOptions"
            label="日期與班別"
            :disable="!requesterId"
          >
            <template #option="{ itemProps, opt }">
              <q-item v-bind="itemProps">
                <q-item-section>{{ opt.label }}</q-item-section>
                <q-item-section side><ShiftPill :code="opt.code" dense /></q-item-section>
              </q-item>
            </template>
            <template #append>
              <ShiftPill v-if="requesterShift" :code="requesterShift" dense />
            </template>
          </q-select>
        </div>

        <!-- 2. Target -->
        <div class="step">
          <div class="step-title row items-center">
            <span class="step-no" aria-hidden="true">2</span>換班對象
            <q-space />
            <q-btn-toggle
              v-model="targetMode"
              dense
              no-caps
              unelevated
              size="sm"
              toggle-color="primary"
              color="soft"
              text-color="ink"
              aria-label="指定方式"
              :options="[
                { label: '選擇', value: 'select', icon: 'list' },
                { label: '手動輸入', value: 'manual', icon: 'edit' },
              ]"
            />
          </div>
          <q-select
            v-if="targetMode === 'select'"
            v-model="targetId"
            outlined
            dense
            emit-value
            map-options
            use-input
            input-debounce="0"
            :options="filteredTargetOptions"
            label="護理師"
            @filter="filterTargets"
          >
            <template #option="{ itemProps, opt }">
              <q-item v-bind="itemProps">
                <q-item-section>
                  <q-item-label>{{ opt.label }}</q-item-label>
                  <q-item-label caption>{{ opt.caption }}</q-item-label>
                </q-item-section>
                <q-item-section side><LevelBadge :level="opt.level" /></q-item-section>
              </q-item>
            </template>
          </q-select>
          <div v-else class="row q-col-gutter-sm">
            <q-input v-model="manual.name" class="col-12 col-sm-4" outlined dense label="姓名" />
            <q-input v-model="manual.employeeId" class="col-12 col-sm-3" outlined dense label="員工編號" />
            <q-input v-model="manual.email" class="col-12 col-sm-5" outlined dense type="email" label="Email" />
            <div class="col-12">
              <q-chip v-if="target" dense color="tint" text-color="on-tint" icon="how_to_reg" class="q-ml-none">
                {{ target.name }} · {{ target.employeeId }} · {{ target.level }}
              </q-chip>
              <q-chip v-else-if="manual.employeeId || manual.email" dense color="error-soft" text-color="negative" icon="person_off" class="q-ml-none">
                此班表查無此人，請確認員工編號或 Email
              </q-chip>
            </div>
          </div>
        </div>

        <!-- 3. Target shift -->
        <div class="step">
          <div class="step-title"><span class="step-no" aria-hidden="true">3</span>對方的班</div>
          <q-select
            v-model="targetDay"
            outlined
            dense
            emit-value
            map-options
            :options="targetDayOptions"
            label="日期與班別"
            :disable="!target"
          >
            <template #option="{ itemProps, opt }">
              <q-item v-bind="itemProps">
                <q-item-section>{{ opt.label }}</q-item-section>
                <q-item-section side><ShiftPill :code="opt.code" dense /></q-item-section>
              </q-item>
            </template>
            <template #append>
              <ShiftPill v-if="targetShift" :code="targetShift" dense />
            </template>
          </q-select>
        </div>

        <q-input v-model="note" outlined dense autogrow label="備註（選填）" maxlength="200" />

        <!-- Preview -->
        <div v-if="preview" class="preview" aria-live="polite">
          <table class="preview-table">
            <thead>
              <tr>
                <th></th>
                <th v-for="d in preview.days" :key="d">{{ formatMDW(schedule.startDate ? addDays(schedule.startDate, d) : '') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in preview.rows" :key="r.name">
                <td class="text-weight-medium ellipsis">{{ r.name }}</td>
                <td v-for="(c, i) in r.cells" :key="i">
                  <ShiftPill :code="c[0]" dense />
                  <q-icon name="arrow_forward" size="12px" class="q-mx-xs text-subtle" />
                  <ShiftPill :code="c[1]" dense />
                </td>
              </tr>
            </tbody>
          </table>
          <q-banner v-if="check?.blocked" dense rounded class="bg-error-soft text-negative q-mt-sm">
            <template #avatar><q-icon name="block" /></template>
            {{ check.blocked }}
          </q-banner>
          <q-banner v-else-if="check?.introduced.length" dense rounded class="bg-warn-soft text-on-warn q-mt-sm">
            <template #avatar><q-icon name="warning" /></template>
            換班後需護理長審核
            <ul class="q-my-xs q-pl-md text-caption">
              <li v-for="(v, i) in check.introduced.slice(0, 4)" :key="i">{{ v.message }}</li>
            </ul>
          </q-banner>
          <q-banner v-else-if="check" dense rounded class="bg-ok-soft text-positive q-mt-sm">
            <template #avatar><q-icon name="task_alt" /></template>
            符合排班規則
          </q-banner>
        </div>
      </q-card-section>

      <q-card-actions align="right" class="sheet-actions">
        <q-btn v-close-popup flat no-caps color="muted" label="取消" />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="send"
          label="送出並通知對方"
          :loading="busy"
          :disable="!canSubmit"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Notify } from 'quasar';
import LevelBadge from '@/components/LevelBadge.vue';
import ShiftPill from '@/components/ShiftPill.vue';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useSchedulesStore } from '@/stores/schedules';
import { useSwapsStore } from '@/stores/swaps';
import { useWardsStore } from '@/stores/wards';
import { isWorkShift, type NurseLevel, type NurseSnapshot, type Schedule, type ShiftCode } from '@/types/schedule';
import { addDays, formatMDW, formatPeriod, todayISO } from '@/utils/dates';
import { checkSwap } from '@/utils/scheduleHelpers';

const props = defineProps<{ modelValue: boolean; schedule: Schedule; initialDay?: number | null }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>();

const auth = useAuthStore();
const schedules = useSchedulesStore();
const wards = useWardsStore();
const swaps = useSwapsStore();

const requesterId = ref<string | null>(null);
const requesterDay = ref<number | null>(null);
const targetMode = ref<'select' | 'manual'>('select');
const targetId = ref<string | null>(null);
const manual = reactive({ name: '', employeeId: '', email: '' });
const targetDay = ref<number | null>(null);
const note = ref('');
const busy = ref(false);
const targetFilter = ref('');

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    requesterId.value = props.schedule.nurses[auth.email] ? auth.email : null;
    requesterDay.value = props.initialDay ?? null;
    targetMode.value = 'select';
    targetId.value = null;
    Object.assign(manual, { name: '', employeeId: '', email: '' });
    targetDay.value = null;
    note.value = '';
  },
  { immediate: true },
);

const nurses = computed(() => props.schedule.nurseOrder.map((id) => props.schedule.nurses[id]).filter((n): n is NurseSnapshot => !!n));
const today = todayISO();

function row(id: string | null | undefined): ShiftCode[] {
  return (id && props.schedule.assignments[id]) || [];
}

function workDayOptions(id: string | null | undefined) {
  return row(id)
    .map((code, day) => ({ code, day, date: addDays(props.schedule.startDate, day) }))
    .filter((x) => isWorkShift(x.code) && x.date >= today)
    .map((x) => ({ value: x.day, label: formatMDW(x.date), code: x.code }));
}

const allNurseOptions = computed(() => nurses.value.map((n) => ({ value: n.id, label: `${n.name}（${n.employeeId}）` })));
const requesterDayOptions = computed(() => workDayOptions(requesterId.value));
const requesterShift = computed(() => (requesterDay.value !== null ? row(requesterId.value)[requesterDay.value] : undefined));

const targetOptions = computed(() =>
  nurses.value
    .filter((n) => n.id !== requesterId.value)
    .map((n) => ({ value: n.id, label: n.name, caption: `${n.employeeId} · ${n.email}`, level: n.level as NurseLevel })),
);
const filteredTargetOptions = computed(() => {
  const q = targetFilter.value.trim().toLowerCase();
  if (!q) return targetOptions.value;
  return targetOptions.value.filter((o) => o.label.toLowerCase().includes(q) || o.caption.toLowerCase().includes(q));
});
function filterTargets(val: string, update: (fn: () => void) => void): void {
  update(() => (targetFilter.value = val));
}

const target = computed<NurseSnapshot | null>(() => {
  if (targetMode.value === 'select') return targetId.value ? props.schedule.nurses[targetId.value] ?? null : null;
  const emp = manual.employeeId.trim().toLowerCase();
  const mail = manual.email.trim().toLowerCase();
  if (!emp && !mail) return null;
  return (
    nurses.value.find(
      (n) => n.id !== requesterId.value && ((emp && n.employeeId.toLowerCase() === emp) || (mail && n.email.toLowerCase() === mail)),
    ) ?? null
  );
});
const targetEmail = computed(() =>
  targetMode.value === 'manual' && manual.email.trim() ? manual.email.trim().toLowerCase() : target.value?.email ?? '',
);

const targetDayOptions = computed(() => workDayOptions(target.value?.id));
const targetShift = computed(() => (targetDay.value !== null ? row(target.value?.id)[targetDay.value] : undefined));

// Default the target day to the same day when the target works a different shift then.
watch(target, (t) => {
  targetDay.value = null;
  if (!t || requesterDay.value === null) return;
  const same = row(t.id)[requesterDay.value];
  if (isWorkShift(same) && same !== requesterShift.value) targetDay.value = requesterDay.value;
});

const shape = computed(() => {
  if (!requesterId.value || !target.value || requesterDay.value === null || targetDay.value === null) return null;
  return {
    requesterId: requesterId.value,
    targetId: target.value.id,
    requesterDay: requesterDay.value,
    targetDay: targetDay.value,
    requesterShift: requesterShift.value ?? 'OFF',
    targetShift: targetShift.value ?? 'OFF',
  };
});

const check = computed(() => {
  if (!shape.value) return null;
  const result = checkSwap(props.schedule, shape.value, wards.rulesFor(props.schedule.wardId), schedules.previousOf(props.schedule));
  if (!result.blocked) {
    const s = shape.value;
    const unchanged = [...new Set([s.requesterDay, s.targetDay])].every(
      (d) => row(s.requesterId)[d] === row(s.targetId)[d],
    );
    if (unchanged) return { ...result, blocked: '換班前後班別相同' };
  }
  return result;
});

const preview = computed(() => {
  const s = shape.value;
  if (!s || !check.value) return null;
  const days = [...new Set([s.requesterDay, s.targetDay])].sort((a, b) => a - b);
  const mk = (id: string, name: string) => ({
    name,
    cells: days.map((d) => [row(id)[d] ?? 'OFF', check.value!.after[id]?.[d] ?? 'OFF'] as [ShiftCode, ShiftCode]),
  });
  return {
    days,
    rows: [mk(s.requesterId, props.schedule.nurses[s.requesterId]?.name ?? ''), mk(s.targetId, props.schedule.nurses[s.targetId]?.name ?? '')],
  };
});

const canSubmit = computed(() => !!shape.value && !!check.value && !check.value.blocked && !!targetEmail.value);

async function submit(): Promise<void> {
  const s = shape.value;
  const t = target.value;
  const r = s ? props.schedule.nurses[s.requesterId] : null;
  if (!s || !t || !r) return;
  busy.value = true;
  try {
    await swaps.create(
      {
        scheduleId: props.schedule.id,
        requesterId: r.id,
        requesterName: r.name,
        requesterEmployeeId: r.employeeId,
        requesterEmail: r.email,
        requesterDay: s.requesterDay,
        requesterDate: addDays(props.schedule.startDate, s.requesterDay),
        requesterShift: s.requesterShift,
        targetId: t.id,
        targetName: targetMode.value === 'manual' && manual.name.trim() ? manual.name.trim() : t.name,
        targetEmployeeId: t.employeeId,
        targetEmail: targetEmail.value,
        targetDay: s.targetDay,
        targetDate: addDays(props.schedule.startDate, s.targetDay),
        targetShift: s.targetShift,
        note: note.value.trim(),
      },
      props.schedule,
    );
    Notify.create({ type: 'positive', icon: 'mark_email_read', message: `已送出，已通知 ${t.name}` });
    emit('update:modelValue', false);
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
// Full-screen on phones: the form scrolls, the actions stay put.
.sheet {
  display: flex;
  flex-direction: column;
}
.sheet-body {
  flex: 1 1 auto;
  overflow-y: auto;
}
.sheet-actions {
  border-top: 1px solid var(--line);
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
}
.step-title {
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--text-2);
  margin-bottom: 6px;
}
.step-no {
  display: inline-flex;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: var(--focus);
  color: var(--surface);
  font-size: 0.6875rem;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
}
.preview {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  background: var(--surface-2);
  overflow-x: auto;
}
.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
  th {
    font-weight: 600;
    color: var(--text-2);
    text-align: left;
    padding: 4px;
  }
  td {
    padding: 4px;
    max-width: 7.5rem;
  }
}
</style>
