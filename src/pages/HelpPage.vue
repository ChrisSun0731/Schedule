<template>
  <q-page class="page page--narrow">
    <PageHeader title="使用說明" :description="`以下依你的角色（${roleLabel}）說明每個功能、班別代碼與規則檢查。`" />

    <nav class="toc" aria-label="本頁目錄">
      <a v-for="s in sections" :key="s.id" :href="`#${s.id}`" class="toc-link" @click.prevent="jump(s.id)">{{ s.label }}</a>
    </nav>

    <!-- 1. First steps -->
    <section id="help-start" class="help-section" aria-labelledby="help-start-title">
      <h2 id="help-start-title" class="help-h2">快速開始</h2>
      <ol class="steps">
        <li v-for="(s, i) in quickStart" :key="s.title" class="step">
          <span class="step-no" aria-hidden="true">{{ i + 1 }}</span>
          <div>
            <div class="step-title">{{ s.title }}</div>
            <p class="hint">{{ s.text }}</p>
          </div>
        </li>
      </ol>
    </section>

    <!-- 2. Every page and its functions -->
    <section id="help-pages" class="help-section" aria-labelledby="help-pages-title">
      <h2 id="help-pages-title" class="help-h2">各頁功能</h2>
      <article v-for="g in pages" :key="g.page" class="surface page-card" :aria-labelledby="`help-${g.page}`">
        <header class="page-card-head">
          <q-icon :name="g.icon" size="20px" class="text-muted" />
          <h3 :id="`help-${g.page}`" class="help-h3">{{ g.title }}</h3>
          <q-space />
          <q-btn v-if="g.page !== 'calendar'" flat dense no-caps color="primary" :label="`前往${g.title}`" :to="{ name: g.page }" />
        </header>
        <p class="hint q-mb-sm">{{ summaryFor(g, auth.role) }}</p>
        <dl class="defs">
          <div v-for="i in itemsFor(g, auth.role)" :key="i.title" class="def">
            <dt>{{ i.title }}</dt>
            <dd>{{ i.text }}</dd>
          </div>
        </dl>
      </article>
    </section>

    <!-- 3. Shift and leave codes -->
    <section id="help-shifts" class="help-section" aria-labelledby="help-shifts-title">
      <h2 id="help-shifts-title" class="help-h2">班別與假別代碼</h2>
      <p class="hint q-mb-sm">班表格子裡的代碼。白班、小夜、大夜的顏色由淺到深，對應白天、傍晚到夜晚。</p>
      <div class="surface table-wrap">
        <table class="help-table">
          <thead>
            <tr>
              <th scope="col">代碼</th>
              <th scope="col">名稱</th>
              <th scope="col">類別</th>
              <th scope="col">說明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in shiftRows" :key="c.code">
              <td><ShiftPill :code="c.code" :tooltip="false" /></td>
              <td class="nowrap">{{ c.label }}</td>
              <td class="nowrap text-muted">{{ c.kind }}</td>
              <td>{{ c.note }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 4. Rule check -->
    <section id="help-rules" class="help-section" aria-labelledby="help-rules-title">
      <h2 id="help-rules-title" class="help-h2">規則檢查</h2>
      <p class="hint q-mb-sm">
        班表會即時檢查以下規則。<strong>錯誤</strong>應在發布前修正，<strong>警告</strong>建議調整，<strong>提示</strong>僅供參考。
        數字取自目前的系統設定；人力需求依各病房的「人力設定」。
      </p>
      <div class="surface table-wrap">
        <table class="help-table">
          <thead>
            <tr>
              <th scope="col">規則</th>
              <th scope="col">類型</th>
              <th scope="col">說明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in ruleRows" :key="r.id">
              <td class="nowrap text-weight-medium">{{ RULE_LABELS[r.id] }}</td>
              <td class="nowrap">
                <span class="sev" :class="`sev-${r.severity}`"><q-icon :name="SEV[r.severity].icon" size="16px" />{{ SEV[r.severity].label }}</span>
              </td>
              <td>{{ r.text }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="hint q-mt-sm">在班表上，錯誤的格子有紅框與左上角紅點，警告為橘色虛線框，右上角三角形代表已鎖定。</p>
    </section>

    <!-- 5. Keyboard (people who edit) -->
    <section v-if="auth.isManager" id="help-keys" class="help-section" aria-labelledby="help-keys-title">
      <h2 id="help-keys-title" class="help-h2">鍵盤快捷鍵</h2>
      <p class="hint q-mb-sm">在「全體班表」點一下任一格後即可使用。</p>
      <div class="surface table-wrap">
        <table class="help-table">
          <tbody>
            <tr v-for="k in keys" :key="k.keys">
              <th scope="row" class="nowrap"><kbd v-for="part in k.keys.split(' ')" :key="part">{{ part }}</kbd></th>
              <td>{{ k.text }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 6. Roles -->
    <section id="help-roles" class="help-section" aria-labelledby="help-roles-title">
      <h2 id="help-roles-title" class="help-h2">角色</h2>
      <dl class="defs surface roles">
        <div v-for="r in roles" :key="r.role" class="def" :class="{ mine: r.role === auth.role }">
          <dt>{{ ROLE_LABELS[r.role] }}<span v-if="r.role === auth.role" class="you">你的角色</span></dt>
          <dd>{{ r.text }}</dd>
        </div>
      </dl>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PageHeader from '@/components/PageHeader.vue';
import ShiftPill from '@/components/ShiftPill.vue';
import { scrollBehavior } from '@/composables/useMotion';
import { GUIDES, GUIDE_ORDER, QUICK_START, canSee, itemsFor, summaryFor } from '@/constants/guide';
import { LEAVE_LABELS, ROLE_LABELS, RULE_LABELS, SHIFT_META } from '@/constants/labels';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { SHIFT_CODES, isStatutoryLeave, isWorkShift, type LeaveType, type RuleId, type Severity, type ShiftCode, type UserRole } from '@/types/schedule';

const auth = useAuthStore();
const settings = useSettingsStore();

const roleLabel = computed(() => (auth.role ? ROLE_LABELS[auth.role] : ''));
const quickStart = computed(() => QUICK_START[auth.role ?? 'nurse']);
const pages = computed(() => GUIDE_ORDER.map((p) => GUIDES[p]).filter((g) => canSee(g.for, auth.role)));

const sections = computed(() => [
  { id: 'help-start', label: '快速開始' },
  { id: 'help-pages', label: '各頁功能' },
  { id: 'help-shifts', label: '班別代碼' },
  { id: 'help-rules', label: '規則檢查' },
  ...(auth.isManager ? [{ id: 'help-keys', label: '快捷鍵' }] : []),
  { id: 'help-roles', label: '角色' },
]);

function jump(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  // Move focus too, so keyboard and screen-reader users land where they asked to go.
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

const rules = computed(() => settings.rules);

function shiftNote(code: ShiftCode): { kind: string; note: string } {
  if (isWorkShift(code)) {
    const t = rules.value.shiftTimes[code];
    return { kind: '上班', note: `${t.start}–${t.end}` };
  }
  if (code === 'OFF') return { kind: '休息', note: '休假日，計入例假與休息日。' };
  if (code === 'REQ') return { kind: '休息', note: '指定希望休息的日子，計入休息日，不算請假。' };
  const type = code as LeaveType;
  if (isStatutoryLeave(type)) return { kind: '法定假', note: `${LEAVE_LABELS[type]}。核准後一律排入班表，人力不足時由護理長補人。` };
  return { kind: '請假', note: `${LEAVE_LABELS[type]}。核准後依優先序，在人力許可時排入。` };
}

const shiftRows = computed(() => SHIFT_CODES.map((code) => ({ code, label: SHIFT_META[code].label, ...shiftNote(code) })));

// ---------------------------------------------------------------------------
// Rules (wording follows the messages in src/utils/scheduler.ts)
// ---------------------------------------------------------------------------

const SEV: Record<Severity, { label: string; icon: string }> = {
  error: { label: '錯誤', icon: 'error' },
  warning: { label: '警告', icon: 'warning' },
  info: { label: '提示', icon: 'info' },
};

const ruleRows = computed<{ id: RuleId; severity: Severity; text: string }[]>(() => {
  const r = rules.value;
  const senior = r.seniorLevels.join('、');
  return [
    { id: 'coverage_under', severity: 'error', text: '某天某班的人數少於病房設定的需求人數。' },
    { id: 'coverage_over', severity: 'warning', text: '某天某班的人數多於需求人數。' },
    { id: 'senior_min', severity: 'error', text: `某班的資深人力（${senior}）少於病房設定的最少人數。` },
    { id: 'senior_preferred', severity: 'warning', text: `某班的資深人力（${senior}）少於病房設定的建議人數。` },
    { id: 'max_consecutive_work', severity: 'error', text: `連續上班超過 ${r.maxConsecutiveWork} 天，會連同上一期最後 7 天一起計算。` },
    { id: 'max_consecutive_off', severity: 'error', text: `連續休假超過 ${r.maxConsecutiveOff} 天。` },
    { id: 'weekly_off', severity: 'error', text: `每週（7 天）的休息日少於 ${r.minOffPerWeek} 天。該週若全為請假則改為警告。` },
    { id: 'period_off', severity: 'error', text: `28 天內的休息日少於 ${r.minOffPerPeriod} 天。` },
    {
      id: 'shift_rest',
      severity: 'error',
      text: r.minRestHours ? `相鄰兩天的班之間休息少於 ${r.minRestHours} 小時，例如小夜接隔天白班。` : '目前未檢查（系統設定的輪班間隔為 0）。',
    },
    { id: 'shift_not_allowed', severity: 'error', text: '排了此人不可排的班別（在「人員管理」的「可排班別」設定）。' },
    { id: 'under_hours', severity: 'info', text: `休息日多於 ${r.minOffPerPeriod} 天，工時可能不足。` },
  ];
});

// ---------------------------------------------------------------------------
// Keyboard (mirrors KEY_TO_CODE in ScheduleGrid.vue)
// ---------------------------------------------------------------------------

const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
const keys = [
  { keys: '↑ ↓ ← →', text: '移動到相鄰的格子' },
  { keys: 'Enter', text: '開啟班別選單（在日期標題上：設為或取消國定假日）' },
  { keys: 'D E N', text: '白班、小夜、大夜，並移到下一天' },
  { keys: 'O', text: '休假（也可按 0）' },
  { keys: 'A L R', text: '年休、公假、預假' },
  { keys: 'S P M C', text: '病假、事假、生理假、補休' },
  { keys: 'B W I', text: '喪假、婚假、公傷假（產假、陪產假請從選單選擇）' },
  { keys: 'Delete', text: '改為休假' },
  { keys: `${modKey} Z`, text: '復原' },
  { keys: modKey === '⌘' ? '⌘ ⇧ Z' : 'Ctrl Y', text: '重做' },
];

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

const roles: { role: UserRole; text: string }[] = [
  { role: 'nurse', text: '查看所屬病房已發布的班表，申請換班與請假，回覆別人的換班邀請。' },
  { role: 'head_nurse', text: '管理所負責病房：建立與發布班表、自動排班、審核換班與請假、調整病房人力設定。' },
  { role: 'developer', text: '管理所有病房、人員與角色，設定全院的勞基法規則、班別時間與國定假日。' },
];
</script>

<style scoped lang="scss">
.toc {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.toc-link {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--text);
  font-size: 0.875rem;
  text-decoration: none;
  &:hover {
    background: var(--tint);
    color: var(--on-tint);
  }
  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
}

.help-section {
  padding-top: 24px;
  scroll-margin-top: 64px;
  &:focus {
    outline: none;
  }
}
.help-h2 {
  margin: 0 0 12px;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: normal;
}
.help-h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: normal;
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(18rem, 100%), 1fr));
  gap: 12px;
}
.step {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.step-no {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--tint);
  color: var(--on-tint);
  font-size: 0.8125rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.step-title {
  font-weight: 600;
  margin-bottom: 2px;
}

.page-card {
  padding: 14px 16px 16px;
  & + & {
    margin-top: 12px;
  }
}
.page-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.defs {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(18rem, 100%), 1fr));
  gap: 10px 24px;
}
.def {
  dt {
    font-size: 0.875rem;
    font-weight: 600;
  }
  dd {
    margin: 2px 0 0;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-2);
  }
}

.table-wrap {
  overflow-x: auto;
}
.help-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  th,
  td {
    padding: 8px 12px;
    text-align: left;
    vertical-align: middle;
    border-bottom: 1px solid var(--line);
  }
  thead th {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-2);
    background: var(--surface-2);
  }
  tbody tr:last-child > * {
    border-bottom: 0;
  }
  tbody th {
    font-weight: 500;
  }
}
.nowrap {
  white-space: nowrap;
}
kbd {
  display: inline-block;
  min-width: 1.75em;
  margin-right: 4px;
  padding: 1px 6px;
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--surface-2);
  font-family: inherit;
  font-size: 0.8125rem;
  text-align: center;
}
.sev {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
.sev-error {
  color: var(--error);
}
.sev-warning {
  color: var(--on-warn);
}
.sev-info {
  color: var(--text-2);
}

.roles {
  padding: 12px 16px;
  grid-template-columns: 1fr;
}
.def.mine dt {
  color: var(--on-tint);
}
.you {
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--tint);
  color: var(--on-tint);
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
