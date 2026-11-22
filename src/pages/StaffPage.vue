<template>
  <q-page class="page page--wide">
    <PageHeader title="人員管理" guide="staff">
      <template #actions>
        <q-btn unelevated no-caps color="primary" label="新增人員" @click="openEditor(null)" />
        <q-btn flat round dense icon="more_vert" class="text-muted" aria-label="更多動作">
          <q-tooltip>更多動作</q-tooltip>
          <q-menu anchor="bottom right" self="top right">
            <q-list style="min-width: 260px; max-width: 320px">
              <q-item v-close-popup clickable :disable="importing" @click="importDemo">
                <q-item-section avatar><q-icon name="group_add" /></q-item-section>
                <q-item-section>
                  <q-item-label>載入示範人員</q-item-label>
                  <q-item-label caption>建立兩個示範病房與一批虛構人員，方便試用</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </template>
    </PageHeader>

    <div class="filters">
      <q-input v-model="search" dense outlined clearable placeholder="搜尋姓名、Email 或員工編號" aria-label="搜尋人員" class="bg-surface search">
        <template #prepend><q-icon name="search" size="20px" /></template>
      </q-input>
      <q-select
        v-if="wards.list.length"
        v-model="wardFilter"
        dense
        outlined
        emit-value
        map-options
        options-dense
        aria-label="依病房篩選"
        :options="wardFilterOptions"
        class="bg-surface ward-filter"
      />
      <span class="hint tabular">共 {{ filtered.length }} 位<template v-if="filtered.length !== users.list.length">（全部 {{ users.list.length }} 位）</template></span>
    </div>

    <!-- Below 1024px: one card per person instead of a ten-column table. -->
    <q-table
      flat
      bordered
      :grid="$q.screen.lt.md"
      :rows="filtered"
      :columns="columns"
      row-key="id"
      :pagination="{ rowsPerPage: 50 }"
      :rows-per-page-options="[25, 50, 100, 0]"
      rows-per-page-label="每頁"
      :no-data-label="users.list.length ? '沒有符合搜尋條件的人員' : '尚無人員。按「新增人員」，或從「更多動作」載入示範人員。'"
      class="staff-table"
    >
      <template #item="props">
        <div class="col-12 col-sm-6 q-pa-xs">
          <q-card flat bordered class="person-card full-height">
            <q-card-section class="row items-center no-wrap q-pb-sm">
              <q-avatar size="36px" color="tint" text-color="on-tint" class="q-mr-sm">
                <img v-if="props.row.photoURL" :src="props.row.photoURL" alt="" referrerpolicy="no-referrer" />
                <span v-else>{{ props.row.displayName.slice(0, 1) }}</span>
              </q-avatar>
              <div class="col" style="min-width: 0">
                <div class="text-weight-medium ellipsis">{{ props.row.displayName }} <span class="text-caption text-muted">{{ props.row.employeeId }}</span></div>
                <div class="text-caption text-muted ellipsis">{{ props.row.email }}</div>
              </div>
              <q-btn flat round icon="edit" color="primary" :aria-label="`編輯 ${props.row.displayName}`" @click="openEditor(props.row)" />
              <q-btn
                flat
                round
                icon="delete_outline"
                color="negative"
                :aria-label="`刪除 ${props.row.displayName}`"
                :disable="props.row.id === auth.email"
                @click="remove(props.row)"
              />
            </q-card-section>
            <q-card-section class="row items-center q-gutter-xs q-pt-none">
              <span class="tag">{{ ROLE_LABELS[props.row.role as UserRole] }}</span>
              <span v-for="w in wardNames(props.row)" :key="w" class="tag tag--outline">{{ w }}</span>
              <span v-if="props.row.role === 'nurse' && !wardNames(props.row).length" class="tag text-negative">未分配病房</span>
              <LevelBadge :level="props.row.level" />
              <ShiftPill v-for="sh in props.row.allowedShifts" :key="sh" :code="sh" dense />
              <span v-if="!props.row.active" class="tag">已停用</span>
              <span v-if="!props.row.schedulable" class="text-caption text-muted">不排班</span>
            </q-card-section>
          </q-card>
        </div>
      </template>
      <template #body-cell-name="props">
        <q-td :props="props">
          <div class="row items-center no-wrap">
            <q-avatar size="28px" color="tint" text-color="on-tint" class="q-mr-sm">
              <img v-if="props.row.photoURL" :src="props.row.photoURL" alt="" referrerpolicy="no-referrer" />
              <span v-else>{{ props.row.displayName.slice(0, 1) }}</span>
            </q-avatar>
            <div>
              <div class="text-weight-medium">{{ props.row.displayName }}</div>
              <div class="text-caption text-muted">{{ props.row.email }}</div>
            </div>
          </div>
        </q-td>
      </template>
      <template #body-cell-role="props">
        <q-td :props="props">
          <span class="tag">{{ ROLE_LABELS[props.row.role as UserRole] }}</span>
        </q-td>
      </template>
      <template #body-cell-wards="props">
        <q-td :props="props">
          <div class="row q-gutter-xs">
            <span v-for="w in wardNames(props.row)" :key="w" class="tag tag--outline">{{ w }}</span>
            <span v-if="!wardNames(props.row).length" class="text-caption" :class="props.row.role === 'nurse' ? 'text-negative' : 'text-muted'">
              {{ props.row.role === 'developer' ? '全部' : '未分配' }}
            </span>
          </div>
        </q-td>
      </template>
      <template #body-cell-level="props">
        <q-td :props="props"><LevelBadge :level="props.row.level" /></q-td>
      </template>
      <template #body-cell-shifts="props">
        <q-td :props="props">
          <div class="row no-wrap q-gutter-x-xs">
            <ShiftPill v-for="s in props.row.allowedShifts" :key="s" :code="s" dense />
          </div>
        </q-td>
      </template>
      <template #body-cell-schedulable="props">
        <q-td :props="props">
          <q-icon :name="props.value ? 'event_available' : 'remove'" :color="props.value ? 'primary' : 'muted'" size="20px" />
          <span class="sr-only">{{ props.value ? '排入班表' : '不排班' }}</span>
        </q-td>
      </template>
      <template #body-cell-active="props">
        <q-td :props="props">
          <span :class="props.value ? 'text-positive' : 'text-muted'">{{ props.value ? '啟用' : '停用' }}</span>
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="text-right">
          <q-btn flat round dense icon="edit" color="primary" :aria-label="`編輯 ${props.row.displayName}`" @click="openEditor(props.row)"><q-tooltip>編輯</q-tooltip></q-btn>
          <q-btn
            flat
            round
            dense
            icon="delete_outline"
            color="negative"
            :aria-label="`刪除 ${props.row.displayName}`"
            :disable="props.row.id === auth.email"
            @click="remove(props.row)"
          >
            <q-tooltip>刪除</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Editor -->
    <AppDialog
      v-model="editor.open"
      form
      :title="editor.isNew ? '新增人員' : '編輯人員'"
      :description="editor.isNew ? '輸入對方登入用的 Google 帳號。只有名單上的帳號可以登入本系統。' : editor.form.email"
      :width="500"
      @submit="save"
    >
      <div class="q-gutter-y-sm">
        <q-input
          v-if="editor.isNew"
          v-model="editor.form.email"
          outlined
          dense
          type="email"
          label="Google 帳號 Email"
          placeholder="name@example.com"
          :rules="[(v: string) => /.+@.+\..+/.test(v) || '請輸入完整的 Email，例如 name@example.com', (v: string) => !users.byId.has(v.trim().toLowerCase()) || '此 Email 已在名單中']"
        />
        <div class="row q-col-gutter-sm">
          <q-input v-model="editor.form.displayName" class="col-7" outlined dense label="姓名" :rules="[(v: string) => !!v.trim() || '請輸入姓名']" />
          <q-input v-model="editor.form.employeeId" class="col-5" outlined dense label="員工編號" />
        </div>
        <q-select
          v-model="editor.form.role"
          outlined
          dense
          emit-value
          map-options
          :options="USER_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], caption: ROLE_HINT[r] }))"
          label="角色"
          :hint="isSelf ? '無法變更自己的角色' : ROLE_HINT[editor.form.role]"
          :disable="isSelf"
        >
          <template #option="{ itemProps, opt }">
            <q-item v-bind="itemProps">
              <q-item-section>
                <q-item-label>{{ opt.label }}</q-item-label>
                <q-item-label caption>{{ opt.caption }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <q-select
          v-if="editor.form.role !== 'developer'"
          v-model="wardModel"
          outlined
          dense
          emit-value
          map-options
          :multiple="editor.form.role === 'head_nurse'"
          :use-chips="editor.form.role === 'head_nurse'"
          :clearable="editor.form.role === 'nurse'"
          :options="wards.list.map((w) => ({ value: w.id, label: w.name }))"
          :label="editor.form.role === 'head_nurse' ? '負責病房（可複選）' : '所屬病房'"
          :hint="wardHint"
          :disable="!wards.list.length"
          class="q-pt-sm"
        />
        <p v-else class="hint q-pt-sm">系統管理員可管理所有病房，不需指定病房。</p>

        <div class="q-pt-md">
          <div id="staff-level" class="section-title">職級</div>
          <p class="hint q-mb-sm">{{ settings.rules.seniorLevels.join('、') }} 計入每班的資深人力。</p>
          <q-btn-toggle
            v-model="editor.form.level"
            spread
            unelevated
            toggle-color="primary"
            color="soft"
            text-color="ink"
            aria-labelledby="staff-level"
            :options="NURSE_LEVELS.map((l) => ({ value: l, label: l }))"
          />
        </div>
        <div class="q-pt-md">
          <div id="staff-shifts" class="section-title">可排班別</div>
          <p class="hint">自動排班只會排勾選的班別。</p>
          <div class="row q-gutter-sm" role="group" aria-labelledby="staff-shifts">
            <q-checkbox v-for="s in WORK_SHIFTS" :key="s" v-model="editor.form.allowedShifts" :val="s" :label="`${s} ${SHIFT_META[s].label}`" />
          </div>
          <p v-if="!editor.form.allowedShifts.length" class="text-caption text-negative q-mb-none">至少勾選一個班別</p>
        </div>
        <q-list class="q-pt-sm">
          <q-item tag="label" class="q-px-none">
            <q-item-section avatar><q-toggle v-model="editor.form.schedulable" color="primary" /></q-item-section>
            <q-item-section>
              <q-item-label>排入班表</q-item-label>
              <q-item-label caption>開啟後會出現在病房的新班表中；不需排班的護理長可以關閉</q-item-label>
            </q-item-section>
          </q-item>
          <q-item tag="label" class="q-px-none" :disable="isSelf">
            <q-item-section avatar><q-toggle v-model="editor.form.active" color="primary" :disable="isSelf" /></q-item-section>
            <q-item-section>
              <q-item-label>帳號啟用</q-item-label>
              <q-item-label caption>{{ isSelf ? '無法停用自己的帳號' : '關閉後無法登入，既有班表不受影響' }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>
      <template #actions>
        <q-btn v-close-popup flat no-caps color="muted" label="取消" />
        <q-btn type="submit" unelevated no-caps color="primary" label="儲存" :loading="saving" :disable="!editor.form.allowedShifts.length" />
      </template>
    </AppDialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Dialog, Notify, type QTableColumn } from 'quasar';
import AppDialog from '@/components/AppDialog.vue';
import LevelBadge from '@/components/LevelBadge.vue';
import PageHeader from '@/components/PageHeader.vue';
import ShiftPill from '@/components/ShiftPill.vue';
import { ROLE_LABELS, SHIFT_META } from '@/constants/labels';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useUsersStore } from '@/stores/users';
import { useWardsStore } from '@/stores/wards';
import { NURSE_LEVELS, USER_ROLES, WORK_SHIFTS, type UserProfile, type UserRole } from '@/types/schedule';
import { formatDateTime } from '@/utils/dates';

const auth = useAuthStore();
const users = useUsersStore();
const wards = useWardsStore();

const settings = useSettingsStore();

/** What each role may do, shown where the role is chosen. */
const ROLE_HINT: Record<UserRole, string> = {
  nurse: '查看班表、申請換班與請假',
  head_nurse: '管理負責病房的班表，審核換班與請假',
  developer: '管理所有病房、人員與系統設定',
};

const search = ref<string | null>('');
const importing = ref(false);
const saving = ref(false);

const UNASSIGNED = '__none__';
/** null = everyone; UNASSIGNED = non-developers without a ward. */
const wardFilter = ref<string | null>(null);
const wardFilterOptions = computed(() => [
  { value: null, label: '全部病房' },
  ...wards.list.map((w) => ({ value: w.id, label: w.name })),
  { value: UNASSIGNED, label: '未分配病房' },
]);

function wardNames(u: UserProfile): string[] {
  return u.role === 'developer' ? [] : u.wardIds.map((id) => wards.nameOf(id));
}

const filtered = computed(() => {
  const q = (search.value ?? '').trim().toLowerCase();
  const w = wardFilter.value;
  return users.list
    .filter((u) => !w || (w === UNASSIGNED ? u.role !== 'developer' && !u.wardIds.length : u.wardIds.includes(w)))
    .filter((u) => !q || [u.displayName, u.email, u.employeeId].some((x) => x.toLowerCase().includes(q)));
});

const columns: QTableColumn<UserProfile>[] = [
  { name: 'name', label: '姓名', field: 'displayName', align: 'left', sortable: true },
  { name: 'employeeId', label: '員工編號', field: 'employeeId', align: 'left', sortable: true },
  { name: 'role', label: '角色', field: 'role', align: 'left', sortable: true },
  { name: 'wards', label: '病房', field: 'wardIds', align: 'left' },
  { name: 'level', label: '職級', field: 'level', align: 'center', sortable: true },
  { name: 'shifts', label: '可排班別', field: 'allowedShifts', align: 'left' },
  { name: 'schedulable', label: '排班', field: 'schedulable', align: 'center' },
  { name: 'active', label: '狀態', field: 'active', align: 'center' },
  { name: 'lastLoginAt', label: '最後登入', field: 'lastLoginAt', align: 'left', format: (v: number | null) => formatDateTime(v), sortable: true },
  { name: 'actions', label: '', field: 'id', align: 'right' },
];

function blank(): UserProfile {
  return {
    id: '',
    email: '',
    displayName: '',
    employeeId: '',
    role: 'nurse',
    // New staff join the ward being looked at (or the only ward).
    wardIds: wardFilter.value && wardFilter.value !== UNASSIGNED ? [wardFilter.value] : wards.list.length === 1 ? [wards.list[0]!.id] : [],
    level: 'N1',
    allowedShifts: [...WORK_SHIFTS],
    schedulable: true,
    active: true,
  };
}

const editor = reactive<{ open: boolean; isNew: boolean; form: UserProfile }>({ open: false, isNew: true, form: blank() });
const isSelf = computed(() => !editor.isNew && editor.form.email.toLowerCase() === auth.email);

/** Nurses belong to one ward; head nurses may manage several. */
const wardModel = computed<string | string[] | null>({
  get: () => (editor.form.role === 'head_nurse' ? editor.form.wardIds : editor.form.wardIds[0] ?? null),
  set: (v) => (editor.form.wardIds = Array.isArray(v) ? v : v ? [v] : []),
});
const wardHint = computed(() => {
  if (!wards.list.length) return '尚未建立病房，請先到「病房」新增';
  if (editor.form.wardIds.length) return '';
  return editor.form.role === 'head_nurse' ? '未指定病房的護理長無法排班或審核' : '未分配病房的護理師不會排入任何班表';
});

/** Wards as stored: none for developers, at most one for nurses, only existing wards. */
function wardIdsFor(u: UserProfile): string[] {
  if (u.role === 'developer') return [];
  const ids = u.wardIds.filter((id) => wards.byId.has(id));
  return u.role === 'nurse' ? ids.slice(0, 1) : ids;
}

function openEditor(u: UserProfile | null): void {
  editor.isNew = !u;
  editor.form = u ? { ...u, allowedShifts: [...u.allowedShifts], wardIds: [...u.wardIds] } : blank();
  editor.open = true;
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await users.save({
      ...editor.form,
      wardIds: wardIdsFor(editor.form),
      allowedShifts: WORK_SHIFTS.filter((s) => editor.form.allowedShifts.includes(s)),
    });
    Notify.create({ type: 'positive', icon: 'check', message: '已儲存' });
    editor.open = false;
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    saving.value = false;
  }
}

function remove(u: UserProfile): void {
  Dialog.create({
    title: '刪除人員',
    message: `刪除 ${u.displayName}（${u.email}）？此人將無法登入；既有班表不受影響。`,
    cancel: { flat: true, noCaps: true, label: '取消', color: 'muted' },
    ok: { unelevated: true, noCaps: true, label: '刪除', color: 'negative' },
  }).onOk(() => void users.remove(u.id).catch((err) => Notify.create({ type: 'negative', message: errorMessage(err) })));
}

async function importDemo(): Promise<void> {
  importing.value = true;
  try {
    const added = await users.importDemo((id) => wards.byId.has(id), auth.email);
    Notify.create({
      type: 'positive',
      icon: 'group_add',
      message: added ? `已新增 ${added} 位示範人員（5A 內科病房、ICU 加護病房）` : '示範人員已存在',
    });
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped lang="scss">
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.search {
  flex: 0 1 18rem;
  min-width: 12rem;
  @media (max-width: 599px) {
    flex: 1 1 100%;
  }
}
.ward-filter {
  min-width: 160px;
  @media (max-width: 599px) {
    flex: 1 1 auto;
  }
}
.staff-table {
  border-radius: var(--radius);
}
.person-card {
  border-radius: var(--radius);
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  &--outline {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--text-2);
  }
}
</style>
