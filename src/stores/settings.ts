import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { AppSettings, RuleConfig } from '@/types/schedule';
import { DEFAULT_RULES } from '@/utils/scheduler';

export const DEFAULT_SETTINGS: AppSettings = {
  ...DEFAULT_RULES,
  wardName: '護理病房',
  portalUrl: '',
  holidays: [],
  requireHeadApproval: false,
  emailSenderName: '護理排班系統',
};

function merge(data: Partial<AppSettings> | undefined): AppSettings {
  const d = data ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...d,
    weekdayDemand: { ...DEFAULT_SETTINGS.weekdayDemand, ...d.weekdayDemand },
    weekendDemand: { ...DEFAULT_SETTINGS.weekendDemand, ...d.weekendDemand },
    shiftTimes: {
      D: { ...DEFAULT_SETTINGS.shiftTimes.D, ...d.shiftTimes?.D },
      E: { ...DEFAULT_SETTINGS.shiftTimes.E, ...d.shiftTimes?.E },
      N: { ...DEFAULT_SETTINGS.shiftTimes.N, ...d.shiftTimes?.N },
    },
    seniorLevels: d.seniorLevels?.length ? d.seniorLevels : DEFAULT_SETTINGS.seniorLevels,
    holidays: d.holidays ?? [],
  };
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(merge(undefined));
  const loaded = ref(false);
  let unsub: Unsubscribe | null = null;

  function start(): void {
    stop();
    unsub = onSnapshot(doc(db(), 'settings', 'app'), (snap) => {
      settings.value = merge(snap.data() as Partial<AppSettings> | undefined);
      loaded.value = true;
    });
  }

  function stop(): void {
    unsub?.();
    unsub = null;
    loaded.value = false;
  }

  const rules = computed<RuleConfig>(() => {
    const s = settings.value;
    return {
      weekdayDemand: s.weekdayDemand,
      weekendDemand: s.weekendDemand,
      minSeniorPerShift: s.minSeniorPerShift,
      preferredSeniorPerShift: s.preferredSeniorPerShift,
      seniorLevels: s.seniorLevels,
      maxConsecutiveWork: s.maxConsecutiveWork,
      maxConsecutiveOff: s.maxConsecutiveOff,
      minOffPerWeek: s.minOffPerWeek,
      minOffPerPeriod: s.minOffPerPeriod,
      minRestHours: s.minRestHours,
      shiftTimes: s.shiftTimes,
    };
  });

  /** Public URL used in e-mails (falls back to the current page). */
  const portalUrl = computed(() => {
    if (settings.value.portalUrl) return settings.value.portalUrl;
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${window.location.pathname}`;
  });

  async function save(next: AppSettings, by: string): Promise<void> {
    await setDoc(doc(db(), 'settings', 'app'), { ...next, updatedAt: Date.now(), updatedBy: by });
  }

  return { settings, loaded, rules, portalUrl, start, stop, save };
});
