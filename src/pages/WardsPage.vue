<template>
  <q-page class="page-pad">
    <div class="page-head q-mb-md">
      <h1 class="page-title">病房</h1>
      <q-chip v-if="wards.mine.length" dense outline color="muted" :aria-label="`共 ${wards.mine.length} 個病房`">{{ wards.mine.length }}</q-chip>
      <q-space />
      <q-btn v-if="auth.isDeveloper" unelevated no-caps color="primary" icon="add_business" label="新增病房" @click="createWard" />
    </div>

    <!-- Data from before wards existed (developers only) -->
    <q-banner v-if="auth.isDeveloper && legacyTotal" rounded class="bg-warn-soft text-on-warn q-mb-md migrate">
      <template #avatar><q-icon name="move_down" /></template>
      <div class="text-weight-medium">有資料尚未歸屬病房</div>
      <div class="text-caption">
        {{ legacyParts.join(' · ') }}。歸入病房後，護理長才能看到並管理這些資料。
      </div>
      <template #action>
        <q-btn unelevated no-caps color="primary" icon="move_down" label="歸入病房…" @click="openMigration" />
      </template>
    </q-banner>

    <div v-if="!wards.loaded || !schedules.loaded" class="q-pa-xl flex flex-center">
      <q-spinner-dots size="40px" color="primary" aria-label="載入中" />
    </div>

    <div v-else-if="!wards.mine.length" class="surface empty-state empty-box">
      <q-icon name="apartment" size="48px" class="text-subtle" />
      <div class="empty-title q-mt-sm">{{ auth.isDeveloper ? '尚未建立病房' : '你目前沒有負責的病房' }}</div>
      <div class="text-body2 q-mt-xs">
        {{
          auth.isDeveloper
            ? '每個病房有自己的人員名單、人力需求與班表。建立病房後，到「人員管理」指派護理師與護理長。'
            : '請系統管理員在「人員管理」把你設為病房的護理長。'
        }}
      </div>
      <q-btn v-if="auth.isDeveloper" unelevated no-caps color="primary" icon="add_business" label="建立第一個病房" class="q-mt-md" @click="createWard" />
    </div>

    <div v-else class="ward-grid">
      <q-card v-for="c in cards" :key="c.ward.id" flat bordered class="ward-card">
        <q-card-section class="q-pb-sm">
          <div class="row items-center no-wrap">
            <h2 class="ward-name ellipsis">{{ c.ward.name }}</h2>
            <q-space />
            <q-btn v-if="auth.isDeveloper" flat round dense icon="more_vert" :aria-label="`${c.ward.name} 更多動作`">
              <q-menu anchor="bottom right" self="top right">
                <q-list style="min-width: 200px">
                  <q-item v-close-popup clickable @click="renameWard(c.ward)">
                    <q-item-section avatar><q-icon name="edit" /></q-item-section>
                    <q-item-section>重新命名</q-item-section>
                  </q-item>
                  <q-item v-close-popup clickable class="text-negative" :disable="!!c.blockDelete" @click="removeWard(c.ward)">
                    <q-item-section avatar><q-icon name="delete" color="negative" /></q-item-section>
                    <q-item-section>
                      <q-item-label>刪除病房</q-item-label>
                      <q-item-label v-if="c.blockDelete" caption>{{ c.blockDelete }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </div>
          <div class="text-caption text-muted">
            {{ c.roster }} 位排班人員<template v-if="c.heads.length"> · 護理長 {{ c.heads.join('、') }}</template>
          </div>
        </q-card-section>

        <q-separator inset />

        <q-card-section class="q-gutter-y-sm">
          <!-- Current period -->
          <div class="row items-center no-wrap q-gutter-x-sm">
            <q-icon name="calendar_month" color="primary" size="20px" />
            <template v-if="c.schedule">
              <span class="tabular ellipsis">{{ formatPeriod(c.schedule.startDate, c.schedule.endDate) }}</span>
              <q-badge :color="c.schedule.status === 'published' ? 'positive' : 'muted'">{{ c.schedule.status === 'published' ? '已發布' : '草稿' }}</q-badge>
              <span v-if="c.errors" class="row items-center no-wrap text-negative text-caption">
                <q-icon name="error" size="16px" class="q-mr-xs" />{{ c.errors }} 項錯誤
              </span>
            </template>
            <span v-else class="text-muted">尚未建立班表</span>
          </div>
          <!-- Waiting for this ward's head nurse -->
          <div v-if="c.swaps || c.leaves" class="row items-center no-wrap q-gutter-x-sm text-on-warn">
            <q-icon name="pending_actions" size="20px" />
            <span>待審核<template v-if="c.swaps"> 換班 {{ c.swaps }}</template><template v-if="c.leaves"> 請假 {{ c.leaves }}</template></span>
          </div>
          <div class="row items-center no-wrap q-gutter-x-sm text-muted">
            <q-icon name="groups" size="20px" />
            <span class="tabular">{{ demandSummary(c.ward) }}</span>
          </div>
          <div class="row items-center q-gutter-xs">
            <q-chip dense color="soft" text-color="ink" icon="workspace_premium" class="q-ml-none">N2+ ≥ {{ c.ward.minSeniorPerShift }}/班</q-chip>
            <q-chip v-if="c.ward.requireHeadApproval" dense color="soft" text-color="ink" icon="verified_user" class="q-ml-none">換班需護理長核准</q-chip>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pt-none">
          <q-btn flat no-caps color="primary" icon="tune" label="人力設定" @click="openPolicy(c.ward)" />
          <q-btn unelevated no-caps color="primary" icon="calendar_month" label="開啟班表" @click="openSchedule(c.ward)" />
        </q-card-actions>
      </q-card>
    </div>

    <!-- Staffing & swap policy of one ward -->
    <q-dialog v-model="policy.open">
      <q-card style="width: 460px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <q-icon name="tune" color="primary" size="24px" class="q-mr-sm" />
          <div class="text-h6 ellipsis">{{ policy.name }} 人力設定</div>
        </q-card-section>
        <q-card-section class="q-gutter-y-md">
          <table class="demand-table">
            <thead>
              <tr>
                <th></th>
                <th v-for="s in WORK_SHIFTS" :key="s"><ShiftPill :code="s" dense /></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>平日（一至五）</td>
                <td v-for="s in WORK_SHIFTS" :key="s">
                  <q-input v-model.number="policy.form.weekdayDemand[s]" type="number" min="0" inputmode="numeric" dense outlined :aria-label="`平日${SHIFT_META[s].label}人數`" />
                </td>
              </tr>
              <tr>
                <td>週末 / 國定假日</td>
                <td v-for="s in WORK_SHIFTS" :key="s">
                  <q-input v-model.number="policy.form.weekendDemand[s]" type="number" min="0" inputmode="numeric" dense outlined :aria-label="`週末與國定假日${SHIFT_META[s].label}人數`" />
                </td>
              </tr>
            </tbody>
          </table>
          <div>
            <div class="text-caption text-muted q-mb-xs">資深人力（{{ settings.rules.seniorLevels.join('、') }}）每班</div>
            <div class="row q-col-gutter-sm">
              <q-input v-model.number="policy.form.minSeniorPerShift" class="col-6" type="number" min="0" outlined dense label="最少" />
              <q-input v-model.number="policy.form.preferredSeniorPerShift" class="col-6" type="number" min="0" outlined dense label="建議" />
            </div>
          </div>
          <q-toggle v-model="policy.form.requireHeadApproval" color="primary" label="換班一律需護理長核准" />
          <div class="text-caption text-muted">勞基法規則、班別時間與國定假日由系統管理員統一設定，所有病房共用。</div>
        </q-card-section>
        <q-card-actions align="right">
          <span v-if="policyError" class="text-caption text-negative q-mr-auto q-pl-sm">{{ policyError }}</span>
          <q-btn v-close-popup flat no-caps color="muted" label="取消" />
          <q-btn unelevated no-caps color="primary" icon="save" label="儲存" :loading="policy.saving" :disable="!!policyError" @click="savePolicy" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Migration of pre-ward data -->
    <q-dialog v-model="migration.open">
      <q-card style="width: 440px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <q-icon name="move_down" color="primary" size="24px" class="q-mr-sm" />
          <div class="text-h6">歸入病房</div>
        </q-card-section>
        <q-card-section class="q-gutter-y-md">
          <p class="q-mb-none">{{ legacyParts.join('、') }}將歸入：</p>
          <q-select v-model="migration.target" outlined dense emit-value map-options :options="migrationOptions" label="病房" />
          <q-input v-if="migration.target === NEW_WARD" v-model="migration.name" outlined dense label="新病房名稱" :rules="[(v: string) => !!v.trim() || '必填']" />
          <div class="text-caption text-muted">班表會以新的編號重新建立，原有換班申請會一併指向新班表。系統管理員不會被歸入病房。</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat no-caps color="muted" label="取消" />
          <q-btn
            unelevated
            no-caps
            color="primary"
            icon="move_down"
            label="歸入"
            :loading="migration.busy"
            :disable="!migration.target || (migration.target === NEW_WARD && !migration.name.trim())"
            @click="runMigration"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Dialog, Notify } from 'quasar';
import { useRouter } from 'vue-router';
import ShiftPill from '@/components/ShiftPill.vue';
import { SHIFT_META } from '@/constants/labels';
import { errorMessage } from '@/services/firebase';
import { findLegacy, legacyCount, migrateToWard } from '@/services/wardMigration';
import { useAuthStore } from '@/stores/auth';
import { useLeavesStore } from '@/stores/leaves';
import { useSchedulesStore } from '@/stores/schedules';
import { useSettingsStore } from '@/stores/settings';
import { useSwapsStore } from '@/stores/swaps';
import { useUsersStore } from '@/stores/users';
import { useWardsStore, type WardPolicy } from '@/stores/wards';
import { WORK_SHIFTS, type Ward } from '@/types/schedule';
import { formatPeriod } from '@/utils/dates';
import { evaluateScheduleDoc } from '@/utils/scheduleHelpers';
import { DEFAULT_RULES } from '@/utils/scheduler';
import { demandSummary, wardRulesOf } from '@/utils/wards';

const router = useRouter();
const auth = useAuthStore();
const wards = useWardsStore();
const schedules = useSchedulesStore();
const settings = useSettingsStore();
const swaps = useSwapsStore();
const leaves = useLeavesStore();
const users = useUsersStore();

const cards = computed(() =>
  wards.mine.map((ward) => {
    const schedule = schedules.defaultFor(ward.id);
    const errors = schedule ? evaluateScheduleDoc(schedule, wards.rulesFor(ward.id), schedules.previousOf(schedule)).errorCount : 0;
    const staff = users.list.filter((u) => u.wardIds.includes(ward.id) && u.role !== 'developer').length;
    const scheduleCount = schedules.ofWard(ward.id).length;
    return {
      ward,
      schedule,
      errors,
      roster: users.rosterOf(ward.id).length,
      heads: users.headsOf(ward.id).map((u) => u.displayName),
      swaps: swaps.review.filter((s) => s.wardId === ward.id).length,
      leaves: leaves.pending.filter((l) => l.wardId === ward.id).length,
      blockDelete: scheduleCount ? `尚有 ${scheduleCount} 份班表` : staff ? `尚有 ${staff} 位人員，請先在人員管理改派` : '',
    };
  }),
);

function openSchedule(w: Ward): void {
  wards.select(w.id);
  void router.push({ name: 'schedule' });
}

// ---------------------------------------------------------------------------
// Staffing policy (head nurses of the ward, developers)
// ---------------------------------------------------------------------------

function policyOf(w: Ward): WardPolicy {
  return { ...wardRulesOf(w), requireHeadApproval: w.requireHeadApproval };
}

const policy = reactive<{ open: boolean; id: string; name: string; form: WardPolicy; saving: boolean }>({
  open: false,
  id: '',
  name: '',
  form: { ...wardRulesOf(DEFAULT_RULES), requireHeadApproval: false },
  saving: false,
});

const policyError = computed(() => {
  const f = policy.form;
  const counts = [...WORK_SHIFTS.flatMap((s) => [f.weekdayDemand[s], f.weekendDemand[s]]), f.minSeniorPerShift, f.preferredSeniorPerShift];
  if (counts.some((n) => typeof n !== 'number' || !Number.isInteger(n) || n < 0)) return '人數須為 0 以上的整數';
  if (f.preferredSeniorPerShift < f.minSeniorPerShift) return '資深人力「建議」不可少於「最少」';
  return '';
});

function openPolicy(w: Ward): void {
  policy.id = w.id;
  policy.name = w.name;
  policy.form = policyOf(w);
  policy.open = true;
}

async function savePolicy(): Promise<void> {
  policy.saving = true;
  try {
    await wards.savePolicy(policy.id, policy.form, auth.email);
    Notify.create({ type: 'positive', icon: 'check', message: `已儲存 ${policy.name} 的人力設定` });
    policy.open = false;
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    policy.saving = false;
  }
}

// ---------------------------------------------------------------------------
// Create / rename / delete (developers)
// ---------------------------------------------------------------------------

function askName(title: string, ok: string, model = ''): Promise<string | null> {
  return new Promise((resolve) =>
    Dialog.create({
      title,
      prompt: {
        model,
        type: 'text',
        outlined: true,
        dense: true,
        label: '病房名稱，例如「5A 內科病房」',
        isValid: (v: string) => !!v.trim() && v.trim().length <= 40,
      },
      cancel: { flat: true, noCaps: true, label: '取消', color: 'muted' },
      ok: { unelevated: true, noCaps: true, label: ok, color: 'primary' },
    })
      .onOk((v: string) => resolve(v.trim()))
      .onCancel(() => resolve(null)),
  );
}

async function createWard(): Promise<void> {
  const name = await askName('新增病房', '建立');
  if (!name) return;
  try {
    const id = await wards.create(name, auth.email);
    Notify.create({ type: 'positive', icon: 'check', message: `已建立 ${name}，到「人員管理」指派人員` });
    const w = wards.byId.get(id);
    if (w) openPolicy(w);
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  }
}

async function renameWard(w: Ward): Promise<void> {
  const name = await askName('重新命名', '儲存', w.name);
  if (!name || name === w.name) return;
  try {
    await wards.rename(w.id, name, auth.email);
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  }
}

function removeWard(w: Ward): void {
  Dialog.create({
    title: '刪除病房',
    message: `刪除 ${w.name}？此動作無法復原。`,
    cancel: { flat: true, noCaps: true, label: '取消', color: 'muted' },
    ok: { unelevated: true, noCaps: true, label: '刪除', color: 'negative' },
  }).onOk(() => void wards.remove(w.id).catch((err) => Notify.create({ type: 'negative', message: errorMessage(err) })));
}

// ---------------------------------------------------------------------------
// Migration of data created before wards existed (developers)
// ---------------------------------------------------------------------------

const NEW_WARD = '__new__';

const legacy = computed(() =>
  auth.isDeveloper ? findLegacy({ schedules: schedules.list, users: users.list, swaps: swaps.list, leaves: leaves.list }) : null,
);
const legacyTotal = computed(() => (legacy.value ? legacyCount(legacy.value) : 0));
const legacyParts = computed(() => {
  const l = legacy.value;
  if (!l) return [];
  return [
    l.schedules.length ? `${l.schedules.length} 份班表` : '',
    l.users.length ? `${l.users.length} 位人員` : '',
    l.swaps.length ? `${l.swaps.length} 筆換班` : '',
    l.leaves.length ? `${l.leaves.length} 筆請假` : '',
  ].filter(Boolean);
});

const migration = reactive({ open: false, target: '' as string, name: '', busy: false });
const migrationOptions = computed(() => [
  ...wards.list.map((w) => ({ value: w.id, label: w.name })),
  { value: NEW_WARD, label: '＋ 新增病房' },
]);

function openMigration(): void {
  migration.target = wards.list.length === 1 ? wards.list[0]!.id : wards.list.length ? '' : NEW_WARD;
  // Single-ward installs kept the ward's name and swap policy in the global settings.
  migration.name = settings.settings.wardName || '護理病房';
  migration.open = true;
}

async function runMigration(): Promise<void> {
  const l = legacy.value;
  if (!l) return;
  migration.busy = true;
  try {
    const wardId =
      migration.target === NEW_WARD
        ? await wards.create(migration.name, auth.email, { requireHeadApproval: settings.settings.requireHeadApproval })
        : migration.target;
    const r = await migrateToWard(wardId, l, new Set(schedules.list.map((s) => s.id)), auth.email);
    const name = wards.nameOf(wardId);
    Notify.create({
      type: r.skipped.length ? 'warning' : 'positive',
      icon: 'move_down',
      timeout: r.skipped.length ? 0 : 5000,
      message: `已歸入 ${name}：${r.schedules} 份班表、${r.users} 位人員、${r.swaps} 筆換班、${r.leaves} 筆請假`,
      caption: r.skipped.length ? `${name} 已有相同開始日期的班表，未移動：${r.skipped.join('、')}` : undefined,
      actions: r.skipped.length ? [{ label: '關閉', noCaps: true, color: 'white' }] : [],
    });
    migration.open = false;
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    migration.busy = false;
  }
}
</script>

<style scoped lang="scss">
.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ward-grid {
  display: grid;
  // min() keeps a single column from overflowing a 320px-wide phone.
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
  gap: 16px;
  max-width: 1200px;
}
.ward-card {
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  .q-card__actions {
    margin-top: auto;
  }
}
.ward-name {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1.4;
  min-width: 0;
}
.migrate {
  max-width: 1200px;
}
.empty-box {
  max-width: 520px;
  margin: 40px auto;
}
.demand-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 4px;
  td:first-child {
    font-size: 0.8125rem;
    color: var(--text-2);
    white-space: nowrap;
  }
  th {
    text-align: center;
  }
}
</style>
