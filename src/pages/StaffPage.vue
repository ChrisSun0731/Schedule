<template>
  <q-page class="page-pad">
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-icon name="groups" size="26px" color="primary" />
      <div class="page-title">人員管理</div>
      <q-chip dense outline color="grey-8">{{ users.list.length }}</q-chip>
      <q-space />
      <q-input v-model="search" dense outlined clearable placeholder="搜尋" class="bg-white" style="width: 200px">
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-btn outline no-caps color="primary" icon="group_add" label="載入示範人員" :loading="importing" @click="importDemo" />
      <q-btn unelevated no-caps color="primary" icon="person_add" label="新增人員" @click="openEditor(null)" />
    </div>

    <q-table
      flat
      bordered
      :rows="filtered"
      :columns="columns"
      row-key="id"
      :pagination="{ rowsPerPage: 50 }"
      :rows-per-page-options="[25, 50, 100, 0]"
      rows-per-page-label="每頁"
      no-data-label="尚無人員"
      class="staff-table"
    >
      <template #body-cell-name="props">
        <q-td :props="props">
          <div class="row items-center no-wrap">
            <q-avatar size="28px" color="teal-1" text-color="teal-10" class="q-mr-sm">
              <img v-if="props.row.photoURL" :src="props.row.photoURL" alt="" referrerpolicy="no-referrer" />
              <span v-else>{{ props.row.displayName.slice(0, 1) }}</span>
            </q-avatar>
            <div>
              <div class="text-weight-medium">{{ props.row.displayName }}</div>
              <div class="text-caption text-grey-7">{{ props.row.email }}</div>
            </div>
          </div>
        </q-td>
      </template>
      <template #body-cell-role="props">
        <q-td :props="props">
          <q-chip dense :color="ROLE_COLOR[props.row.role as UserRole]" text-color="white" class="q-ma-none">{{ ROLE_LABELS[props.row.role as UserRole] }}</q-chip>
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
          <q-icon :name="props.value ? 'event_available' : 'remove'" :color="props.value ? 'primary' : 'grey-5'" size="20px" />
        </q-td>
      </template>
      <template #body-cell-active="props">
        <q-td :props="props">
          <q-badge :color="props.value ? 'positive' : 'grey-5'">{{ props.value ? '啟用' : '停用' }}</q-badge>
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="text-right">
          <q-btn flat round dense icon="edit" color="primary" @click="openEditor(props.row)"><q-tooltip>編輯</q-tooltip></q-btn>
          <q-btn flat round dense icon="delete_outline" color="negative" :disable="props.row.id === auth.email" @click="remove(props.row)">
            <q-tooltip>刪除</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Editor -->
    <q-dialog v-model="editor.open">
      <q-card style="width: 480px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <q-icon :name="editor.isNew ? 'person_add' : 'manage_accounts'" color="primary" size="24px" class="q-mr-sm" />
          <div class="text-h6">{{ editor.isNew ? '新增人員' : '編輯人員' }}</div>
        </q-card-section>
        <q-form @submit.prevent="save">
          <q-card-section class="q-gutter-sm">
            <q-input
              v-model="editor.form.email"
              outlined
              dense
              type="email"
              label="Google 帳號 Email"
              :disable="!editor.isNew"
              :rules="[(v: string) => /.+@.+\..+/.test(v) || 'Email 格式錯誤', (v: string) => !editor.isNew || !users.byId.has(v.trim().toLowerCase()) || '此 Email 已存在']"
            />
            <div class="row q-col-gutter-sm">
              <q-input v-model="editor.form.displayName" class="col-7" outlined dense label="姓名" :rules="[(v: string) => !!v.trim() || '必填']" />
              <q-input v-model="editor.form.employeeId" class="col-5" outlined dense label="員工編號" />
            </div>
            <q-select
              v-model="editor.form.role"
              outlined
              dense
              emit-value
              map-options
              :options="USER_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))"
              label="角色"
              :disable="isSelf"
            />
            <div>
              <div class="text-caption text-grey-7 q-mb-xs">職級</div>
              <q-btn-toggle
                v-model="editor.form.level"
                spread
                unelevated
                toggle-color="primary"
                color="grey-2"
                text-color="grey-9"
                :options="NURSE_LEVELS.map((l) => ({ value: l, label: l }))"
              />
            </div>
            <div>
              <div class="text-caption text-grey-7 q-mb-xs">可排班別</div>
              <div class="row q-gutter-sm">
                <q-checkbox v-for="s in WORK_SHIFTS" :key="s" v-model="editor.form.allowedShifts" :val="s" :label="`${s} ${SHIFT_META[s].label}`" />
              </div>
            </div>
            <q-toggle v-model="editor.form.schedulable" label="排入班表" color="primary" />
            <q-toggle v-model="editor.form.active" label="帳號啟用" color="positive" :disable="isSelf" />
          </q-card-section>
          <q-card-actions align="right">
            <q-btn v-close-popup flat no-caps color="grey-8" label="取消" />
            <q-btn type="submit" unelevated no-caps color="primary" icon="save" label="儲存" :loading="saving" :disable="!editor.form.allowedShifts.length" />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Dialog, Notify, type QTableColumn } from 'quasar';
import LevelBadge from '@/components/LevelBadge.vue';
import ShiftPill from '@/components/ShiftPill.vue';
import { ROLE_LABELS, SHIFT_META } from '@/constants/labels';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useUsersStore } from '@/stores/users';
import { NURSE_LEVELS, USER_ROLES, WORK_SHIFTS, type UserProfile, type UserRole } from '@/types/schedule';
import { formatDateTime } from '@/utils/dates';

const auth = useAuthStore();
const users = useUsersStore();

const ROLE_COLOR: Record<UserRole, string> = { developer: 'deep-purple-6', head_nurse: 'secondary', nurse: 'teal-6' };

const search = ref<string | null>('');
const importing = ref(false);
const saving = ref(false);

const filtered = computed(() => {
  const q = (search.value ?? '').trim().toLowerCase();
  if (!q) return users.list;
  return users.list.filter((u) => [u.displayName, u.email, u.employeeId].some((x) => x.toLowerCase().includes(q)));
});

const columns: QTableColumn<UserProfile>[] = [
  { name: 'name', label: '姓名', field: 'displayName', align: 'left', sortable: true },
  { name: 'employeeId', label: '員工編號', field: 'employeeId', align: 'left', sortable: true },
  { name: 'role', label: '角色', field: 'role', align: 'left', sortable: true },
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
    level: 'N1',
    allowedShifts: [...WORK_SHIFTS],
    schedulable: true,
    active: true,
  };
}

const editor = reactive<{ open: boolean; isNew: boolean; form: UserProfile }>({ open: false, isNew: true, form: blank() });
const isSelf = computed(() => !editor.isNew && editor.form.email.toLowerCase() === auth.email);

function openEditor(u: UserProfile | null): void {
  editor.isNew = !u;
  editor.form = u ? { ...u, allowedShifts: [...u.allowedShifts] } : blank();
  editor.open = true;
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await users.save({ ...editor.form, allowedShifts: WORK_SHIFTS.filter((s) => editor.form.allowedShifts.includes(s)) });
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
    message: `刪除 ${u.displayName}（${u.email}）？既有班表不受影響。`,
    cancel: { flat: true, label: '取消', color: 'grey-8' },
    ok: { unelevated: true, label: '刪除', color: 'negative' },
  }).onOk(() => void users.remove(u.id).catch((err) => Notify.create({ type: 'negative', message: errorMessage(err) })));
}

async function importDemo(): Promise<void> {
  importing.value = true;
  try {
    const added = await users.importDemo();
    Notify.create({ type: 'positive', icon: 'group_add', message: added ? `已新增 ${added} 位示範人員` : '示範人員已存在' });
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped lang="scss">
.staff-table {
  border-radius: 12px;
}
</style>
