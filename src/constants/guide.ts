/**
 * What every page and function does, in the words the interface uses.
 *
 * One source for: the sentence under each page title, the 「說明」 panel on each page,
 * the descriptions on the 更多 page and the 使用說明 (help) page. Keep labels here identical
 * to the button and menu labels in the pages they describe.
 */
import type { UserRole } from '@/types/schedule';

/** Who a line of help is for. `staff` = nurses only; `manager` = head nurses and developers. */
export type Audience = 'all' | 'staff' | 'manager' | 'developer';

export type GuidePage = 'schedule' | 'swaps' | 'leave' | 'calendar' | 'wards' | 'emails' | 'staff' | 'settings';

export interface GuideItem {
  title: string;
  text: string;
  for?: Audience;
}

export interface PageGuide {
  page: GuidePage;
  title: string;
  icon: string;
  /** Who may open the page (mirrors the route guard). */
  for: Audience;
  /** One sentence under the page title; the most specific entry for the role wins. */
  summary: Partial<Record<Audience, string>>;
  items: GuideItem[];
}

export function canSee(audience: Audience | undefined, role: UserRole | null): boolean {
  switch (audience ?? 'all') {
    case 'all':
      return true;
    case 'staff':
      return role === 'nurse';
    case 'manager':
      return role === 'head_nurse' || role === 'developer';
    case 'developer':
      return role === 'developer';
  }
}

export function summaryFor(g: PageGuide, role: UserRole | null): string {
  const s = g.summary;
  if (role === 'developer') return s.developer ?? s.manager ?? s.all ?? '';
  if (role === 'head_nurse') return s.manager ?? s.all ?? '';
  return s.staff ?? s.all ?? '';
}

export function itemsFor(g: PageGuide, role: UserRole | null): GuideItem[] {
  return g.items.filter((i) => canSee(i.for, role));
}

export const GUIDES: Record<GuidePage, PageGuide> = {
  schedule: {
    page: 'schedule',
    title: '班表',
    icon: 'calendar_month',
    for: 'all',
    summary: {
      staff: '查看病房的 28 天班表與你自己的班。班表發布後，可以在這裡申請換班。',
      manager: '建立、編輯並發布 28 天班表。系統會即時檢查人力需求與勞基法規則。',
    },
    items: [
      {
        title: '排班週期',
        text: '每份班表涵蓋 28 天（四週）。用上方的選單切換週期。「草稿」只有護理長看得到，「已發布」病房所有人都看得到。',
      },
      {
        title: '我的班表／全體班表',
        text: '「我的班表」以月曆顯示你每天的班與下一班時間；「全體班表」顯示整個病房，你的那一列會標示出來。',
      },
      {
        title: '申請換班',
        text: '在「我的班表」點選自己的上班日，或按「申請換班」，選擇要和誰交換哪一天。',
      },
      {
        title: '加入 Google 日曆',
        text: '在「我的班表」下方按「加入 Google 日曆」，把上班與請假日加入行事曆，也可以下載 .ics 檔。',
      },
      {
        title: '規則檢查',
        text: '列出違反規則的地方（錯誤）與建議改善處（警告）。點選任一項會跳到班表中對應的格子。',
      },
      {
        title: '修改班別',
        text: '點選格子選擇班別或假別，也可以用鍵盤直接輸入 D、E、N、O 等代碼。手動修改的格子會自動鎖定。',
        for: 'manager',
      },
      {
        title: '鎖定',
        text: '格子右上角的三角形代表已鎖定，自動排班不會更動它。點選格子後按「解除鎖定」即可取消。',
        for: 'manager',
      },
      {
        title: '自動排班',
        text: '依人力需求、職級與勞基法規則填滿班表，並依優先序排入已核准的請假。結果先預覽，按「套用至班表」才會寫入。',
        for: 'manager',
      },
      {
        title: '復原／重做',
        text: '撤銷或重做最近的修改，包括自動排班與清除鎖定（⌘Z 或 Ctrl+Z）。',
        for: 'manager',
      },
      {
        title: '發布並通知',
        text: '發布後護理師即可看到班表，並收到一封個人班表 Email。已發布的班表可以「重新通知」。',
        for: 'manager',
      },
      {
        title: '每日人力統計',
        text: '班表底部列出每天白班、小夜、大夜的人數，以及其中 N2+ 資深人力的人數。低於需求時以紅底標示。',
        for: 'manager',
      },
      {
        title: '國定假日',
        text: '點選日期標題可設為或取消國定假日，當天改用假日人力需求。',
        for: 'manager',
      },
      {
        title: '更多動作（⋮）',
        text: '新增排班週期、匯出 Excel、同步人員名單、清除全部鎖定、改回草稿與刪除班表。',
        for: 'manager',
      },
    ],
  },

  swaps: {
    page: 'swaps',
    title: '換班',
    icon: 'swap_horiz',
    for: 'all',
    summary: {
      staff: '和同事交換已發布班表中的班。對方同意且符合規則時，班表會自動更新。',
      manager: '提出與處理換班。違反規則的換班，或病房設定需核准時，由護理長審核。',
    },
    items: [
      {
        title: '申請換班',
        text: '選擇你要換出的班與對方的班。系統會先檢查交換後是否符合規則，送出後以 Email 通知對方。',
      },
      {
        title: '待我回覆',
        text: '別人想和你交換的班。同意後若符合規則，班表立即更新；否則轉給護理長審核。',
      },
      {
        title: '我的申請',
        text: '你送出的申請與目前狀態。對方回覆前可以撤回。',
      },
      {
        title: '護理長審核',
        text: '等待你核准的換班。核准後班表立即更新，並以 Email 通知雙方。',
        for: 'manager',
      },
      {
        title: '全部紀錄',
        text: '所有換班紀錄，包括已核准、已拒絕與已取消的申請。',
      },
    ],
  },

  leave: {
    page: 'leave',
    title: '請假',
    icon: 'event_busy',
    for: 'all',
    summary: {
      staff: '申請年休、預假、病假等假別，由護理長審核。核准的假會在自動排班時排入班表。',
      manager: '審核請假，或直接替護理師登記請假。核准的假會在自動排班時依優先序排入。',
    },
    items: [
      {
        title: '申請請假',
        text: '選擇假別與日期後送出，等待護理長審核。審核前可以撤回。',
        for: 'staff',
      },
      {
        title: '新增請假',
        text: '替病房的護理師登記請假。由護理長新增的請假直接核准。',
        for: 'manager',
      },
      {
        title: '核准／駁回',
        text: '在「待審核」處理申請。駁回後無法更改，送出前會再確認一次。',
        for: 'manager',
      },
      {
        title: '排入優先序',
        text: '法定假（病假、生理假、喪假、婚假、產假、陪產假、公傷假）核准後一律排入。其他假別依 年休 › 公假 › 補休 › 事假 › 預假 的順序，在人力許可時排入。',
      },
      {
        title: '預假',
        text: '指定希望休息的日子。預假算作休息日，不算請假。',
      },
    ],
  },

  calendar: {
    page: 'calendar',
    title: '加入行事曆',
    icon: 'event_available',
    for: 'all',
    summary: {
      all: '把你在已發布班表中的上班日與請假日加入行事曆，休假日不加入。',
    },
    items: [
      {
        title: '加入 Google 日曆',
        text: '第一次使用時，Google 會詢問是否允許本系統管理日曆活動。系統只新增、更新或移除這份班表的班，不會讀取或更動其他行程。',
      },
      {
        title: '重新同步',
        text: '換班核准後再按一次即可更新，不會重複新增。',
      },
      {
        title: '下載 .ics',
        text: '下載後用 Apple 行事曆或 Outlook 開啟即可匯入。班表異動後需重新下載。',
      },
    ],
  },

  wards: {
    page: 'wards',
    title: '病房',
    icon: 'apartment',
    for: 'manager',
    summary: {
      manager: '每個病房有自己的人員、人力需求與班表。在這裡查看各病房狀態並調整人力設定。',
      developer: '建立與管理病房。每個病房有自己的人員、人力需求與班表。',
    },
    items: [
      {
        title: '病房狀態',
        text: '每張卡片顯示目前週期、規則錯誤數，以及等待審核的換班與請假。',
      },
      {
        title: '人力設定',
        text: '設定平日與週末每班需要幾人、每班至少幾位資深人力，以及換班是否一律需要護理長核准。',
      },
      {
        title: '開啟班表',
        text: '切換到該病房的班表。',
      },
      {
        title: '新增／重新命名／刪除病房',
        text: '新增後到「人員管理」指派人員。病房內仍有班表或人員時無法刪除。',
        for: 'developer',
      },
    ],
  },

  emails: {
    page: 'emails',
    title: '郵件紀錄',
    icon: 'outgoing_mail',
    for: 'manager',
    summary: {
      manager: '系統寄出的每一封通知信與寄送結果，用來確認護理師是否收到班表或換班通知。',
    },
    items: [
      {
        title: '郵件類型',
        text: '個人班表（發布時寄給每位護理師）、換班徵詢（寄給被邀請換班的人）、換班結果（核准或拒絕後寄給雙方）。',
      },
      {
        title: '篩選',
        text: '只看已送出或寄送失敗的郵件。',
      },
      {
        title: '寄送失敗',
        text: '「錯誤」說明失敗原因。正在寄送的郵件可以從頁首的郵件圖示重試。',
      },
    ],
  },

  staff: {
    page: 'staff',
    title: '人員管理',
    icon: 'groups',
    for: 'developer',
    summary: {
      developer: '新增人員並設定角色、病房、職級與可排的班別。只有名單上的 Google 帳號可以登入。',
    },
    items: [
      {
        title: '新增人員',
        text: '輸入對方登入用的 Google 帳號 Email，並指定所屬病房。',
      },
      {
        title: '角色',
        text: '護理師：查看班表、換班、請假。護理長：管理所負責病房的班表並審核申請。系統管理員：管理所有病房、人員與設定。',
      },
      {
        title: '職級',
        text: 'N0 到 N3。計入資深人力的職級（預設 N2、N3）在「系統設定」指定，班表中以實心標籤顯示。',
      },
      {
        title: '可排班別',
        text: '自動排班只會把勾選的班別排給此人。',
      },
      {
        title: '排入班表',
        text: '開啟後，此人會出現在病房的新班表中。不需排班的護理長或行政人員可以關閉。',
      },
      {
        title: '帳號啟用',
        text: '關閉後此人無法登入，既有班表不受影響。',
      },
      {
        title: '載入示範人員',
        text: '建立兩個示範病房與一批虛構人員，方便試用系統。',
      },
    ],
  },

  settings: {
    page: 'settings',
    title: '系統設定',
    icon: 'tune',
    for: 'developer',
    summary: {
      developer: '全院共用的勞基法規則、班別時間、國定假日與通知信。各病房的人力需求在「病房」頁設定。',
    },
    items: [
      {
        title: '勞基法／工時規則',
        text: '規則檢查與自動排班依這些數字判斷錯誤，例如最多連續上班天數與輪班間隔。',
      },
      {
        title: '班別時間',
        text: '用來計算輪班間隔，也會寫入護理師的行事曆活動。',
      },
      {
        title: '國定假日',
        text: '這些日期改用週末人力需求，並在班表上標示「假」。',
      },
      {
        title: '資深人力職級',
        text: '哪些職級計入每班的 N2+ 資深人力。',
      },
      {
        title: '通知信',
        text: 'Email 中連結的系統網址，以及收件人看到的寄件者名稱。',
      },
    ],
  },
};

/** Order of pages on the help page. */
export const GUIDE_ORDER: GuidePage[] = ['schedule', 'swaps', 'leave', 'calendar', 'wards', 'emails', 'staff', 'settings'];

export interface NavItem {
  name: GuidePage;
  label: string;
  icon: string;
}

const navItem = (p: GuidePage): NavItem => ({ name: p, label: GUIDES[p].title, icon: GUIDES[p].icon });

/** Everyday sections (tab bar / first sidebar group) and the management pages this role may open. */
export function navForRole(role: UserRole | null): { primary: NavItem[]; manage: NavItem[] } {
  return {
    primary: (['schedule', 'swaps', 'leave'] as const).map(navItem),
    manage: (['wards', 'emails', 'staff', 'settings'] as const).filter((p) => canSee(GUIDES[p].for, role)).map(navItem),
  };
}

/** First steps on the help page, per role. */
export const QUICK_START: Record<UserRole, GuideItem[]> = {
  nurse: [
    { title: '查看班表', text: '在「班表」查看已發布的班表；「我的班表」列出你每天的班與下一班時間。' },
    { title: '加入行事曆', text: '在「我的班表」下方按「加入 Google 日曆」，或下載 .ics 檔。' },
    { title: '請假', text: '在「請假」選擇假別與日期送出，等待護理長審核。' },
    { title: '換班', text: '點選自己的上班日，或在「換班」申請。對方同意後班表自動更新。' },
  ],
  head_nurse: [
    { title: '確認人力設定', text: '在「病房」按「人力設定」，填入平日與週末每班需要的人數。' },
    { title: '新增排班週期', text: '在「班表」的「更多動作（⋮）」選「新增排班週期」，建立 28 天草稿。' },
    { title: '自動排班', text: '按「自動排班」，預覽結果後套用。已核准的請假會自動排入。' },
    { title: '檢查與調整', text: '打開「規則檢查」逐項修正錯誤，點選格子手動調整。' },
    { title: '發布並通知', text: '按「發布並通知」，每位護理師會收到個人班表 Email。' },
    { title: '審核申請', text: '在「換班」與「請假」處理等待審核的申請，頁籤上的數字是待處理件數。' },
  ],
  developer: [
    { title: '建立病房', text: '在「病房」按「新增病房」，並設定人力需求。' },
    { title: '新增人員', text: '在「人員管理」加入 Google 帳號，設定角色、病房與職級。' },
    { title: '設定規則', text: '在「系統設定」確認勞基法規則、班別時間與國定假日。' },
    { title: '交給護理長', text: '護理長登入後即可建立、自動排班並發布所負責病房的班表。' },
  ],
};
