<template>
  <q-page class="page page--wide">
    <PageHeader title="病房" guide="wards">
      <template v-if="auth.isDeveloper" #actions>
        <q-btn unelevated no-caps color="primary" label="新增病房" @click="createWard" />
      </template>
    </PageHeader>

    <!-- Data from before wards existed (developers only) -->
    <q-banner v-if="auth.isDeveloper && legacyTotal" rounded class="bg-warn-soft text-on-warn q-mb-md">
      <template #avatar><q-icon name="move_down" /></template>
      <div class="text-weight-medium">有資料尚未歸屬病房</div>
      <div class="text-caption">
        {{ legacyParts.join(' · ') }}。歸入病房後，護理長才能看到並管理這些資料。
      </div>
      <template #action>
        <q-btn unelevated no-caps color="primary" label="歸入病房…" @click="openMigration" />
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
      <q-btn v-if="auth.isDeveloper" unelevated no-caps color="primary" label="建立第一個病房" class="q-mt-md" @click="createWard" />
    </div>

    <div v-else class="ward-grid">
      <article v-for="c in cards" :key="c.ward.id" class="surface ward-card" :aria-labelledby="`ward-${c.ward.id}`">
        <header class="ward-head">
          <div class="ward-head-text">
            <h2 :id="`ward-${c.ward.id}`" class="ward-name ellipsis">{{ c.ward.name }}</h2>
            <p class="hint">
              {{ c.roster }} 位排班人員<template v-if="c.heads.length"> · 護理長 {{ c.heads.join('、') }}</template>
            </p>
          </div>
          <q-btn v-if="auth.isDeveloper" flat round dense icon="more_vert" class="text-muted" :aria-label="`${c.ward.name} 更多動作`">
            <q-menu anchor="bottom right" self="top right">
              <q-list style="min-width: 220px">
                <q-item v-close-popup clickable @click="renameWard(c.ward)">
                  <q-item-section avatar><q-icon name="edit" /></q-item-section>
                  <q-item-section>重新命名</q-item-section>
                </q-item>
                <q-item v-close-popup clickable class="text-negative" :disable="!!c.blockDelete" @click="removeWard(c.ward)">
                  <q-item-section avatar><q-icon name="delete" color="negative" /></q-item-section>
                  <q-item-section>
                    <q-item-label>刪除病房</q-item-label>
                    <q-item-label caption>{{ c.blockDelete || '無法復原' }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </header>

        <dl class="facts">
          <div>
            <dt>目前週期</dt>
            <dd>
              <template v-if="c.schedule">
                <span class="tabular">{{ formatPeriod(c.schedule.startDate, c.schedule.endDate) }}</span>
                <span class="status" :class="c.schedule.status === 'published' ? 'status--published' : 'status--draft'">
                  {{ c.schedule.status === 'published' ? '已發布' : '草稿' }}
                </span>
                <span v-if="c.errors" class="text-negative"><q-icon name="error" size="16px" /> {{ c.errors }} 項錯誤</span>
              </template>
              <span v-else class="text-muted">尚未建立班表</span>
            </dd>
          </div>
          <div v-if="c.swaps || c.leaves">
            <dt>待審核</dt>
            <dd class="text-on-warn text-weight-medium">
              <template v-if="c.swaps">換班 {{ c.swaps }}</template><template v-if="c.swaps && c.leaves"> · </template><template v-if="c.leaves">請假 {{ c.leaves }}</template>
            </dd>
          </div>
          <div>
            <dt>每班人數</dt>
            <dd class="tabular">{{ demandSummary(c.ward) }}</dd>
          </div>
          <div>
            <dt>資深人力</dt>
            <dd>每班至少 {{ c.ward.minSeniorPerShift }} 位（建議 {{ c.ward.preferredSeniorPerShift }} 位）</dd>
          </div>
          <div>
            <dt>換班</dt>
            <dd>{{ c.ward.requireHeadApproval ? '一律需護理長核准' : '符合規則即生效' }}</dd>
          </div>
        </dl>

        <footer class="ward-actions">
          <q-btn unelevated no-caps color="soft" text-color="ink" label="人力設定" @click="openPolicy(c.ward)" />
          <q-btn unelevated no-caps color="primary" label="開啟班表" @click="openSchedule(c.ward)" />
        </footer>
      </article>
    </div>

    <!-- Staffing & swap policy of one ward -->
    <AppDialog
      v-model="policy.open"
      title="人力設定"
      :meta="policy.name"
      description="此病房每天每班需要的人數與資深人力下限。規則檢查與自動排班都依此計算。"
      :width="480"
    >
      <div class="q-gutter-y-md">
        <div>
          <div class="section-title">每班需要的人數</div>
          <p class="hint q-mb-sm">國定假日使用週末的人數。</p>
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
                <td>週末／國定假日</td>
                <td v-for="s in WORK_SHIFTS" :key="s">
                  <q-input v-model.number="policy.form.weekendDemand[s]" type="number" min="0" inputmode="numeric" dense outlined :aria-label="`週末與國定假日${SHIFT_META[s].label}人數`" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <div class="section-title">資深人力</div>
          <p class="hint q-mb-sm">每班需要的 {{ settings.rules.seniorLevels.join('、') }} 人數。少於「最少」為錯誤，少於「建議」為警告。</p>
          <div class="row q-col-gutter-sm">
            <q-input v-model.number="policy.form.minSeniorPerShift" class="col-6" type="number" min="0" inputmode="numeric" outlined dense label="最少" />
            <q-input v-model.number="policy.form.preferredSeniorPerShift" class="col-6" type="number" min="0" inputmode="numeric" outlined dense label="建議" />
          </div>
        </div>
        <q-item tag="label" class="q-px-none">
          <q-item-section avatar><q-toggle v-model="policy.form.requireHeadApproval" color="primary" /></q-item-section>
          <q-item-section>
            <q-item-label>換班一律需護理長核准</q-item-label>
            <q-item-label caption>關閉時，對方同意且符合規則的換班會立即生效</q-item-label>
          </q-item-section>
        </q-item>
        <p class="hint">勞基法規則、班別時間與國定假日由系統管理員在「系統設定」統一設定，所有病房共用。</p>
      </div>
      <template #actions>
        <span v-if="policyError" class="text-caption text-negative q-mr-auto">{{ policyError }}</span>
        <q-btn v-close-popup flat no-caps color="muted" label="取消" />
        <q-btn unelevated no-caps color="primary" label="儲存" :loading="policy.saving" :disable="!!policyError" @click="savePolicy" />
      </template>
    </AppDialog>

    <!-- Migration of pre-ward data -->
    <AppDialog
      v-model="migration.open"
      title="歸入病房"
      description="把建立病房之前的資料移到一個病房。班表會以新的編號重新建立，原有換班申請會一併指向新班表。系統管理員不會被歸入病房。"
      :width="460"
    >
      <div class="q-gutter-y-md">
        <p class="q-mb-none">{{ legacyParts.join('、') }}將歸入：</p>
        <q-select v-model="migration.target" outlined dense emit-value map-options :options="migrationOptions" label="病房" />
        <q-input v-if="migration.target === NEW_WARD" v-model="migration.name" outlined dense label="新病房名稱" :rules="[(v: string) => !!v.trim() || '請輸入病房名稱']" />
      </div>
      <template #actions>
        <q-btn v-close-popup flat no-caps color="muted" label="取消" />
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="歸入"
          :loading="migration.busy"
          :disable="!migration.target || (migration.target === NEW_WARD && !migration.name.trim())"
          @click="runMigration"
        />
      </template>
    </AppDialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Dialog, Notify } from 'quasar';
import { useRouter } from 'vue-router';
import AppDialog from '@/components/AppDialog.vue';
import PageHeader from '@/components/PageHeader.vue';
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
.ward-grid {
  display: grid;
  // min() keeps a single column from overflowing a 320px-wide phone.
  grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
  gap: 16px;
}
.ward-card {
  display: flex;
  flex-direction: column;
  padding: 16px 16px 12px;
}
.ward-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}
.ward-head-text {
  flex: 1 1 auto;
  min-width: 0;
}
.ward-name {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: normal;
}
.facts {
  margin: 0 0 12px;
  font-size: 0.875rem;
  div {
    display: flex;
    gap: 12px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }
  dt {
    flex: 0 0 4.5em;
    color: var(--text-2);
  }
  dd {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
  }
}
.status {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  &--published {
    background: var(--ok-soft);
    color: var(--ok);
  }
  &--draft {
    background: var(--soft);
    color: var(--text-2);
  }
}
.ward-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
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
