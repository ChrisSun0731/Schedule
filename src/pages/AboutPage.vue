<template>
  <q-page class="page page--narrow">
    <article class="about-doc" aria-labelledby="about-title">
      <header class="about-head">
        <p class="eyebrow">排班系統 · About</p>
        <h1 id="about-title" class="about-title">About the Scheduling System</h1>
        <p class="version">Version {{ version }}</p>
      </header>

      <div class="lead">
        <p>
          This system builds 28-day nursing schedules, checks them against labour rules as they are edited, and handles shift
          swaps and leave requests online. It is developed and maintained by Chris Sun.
        </p>
      </div>

      <!--<section class="about-section" aria-labelledby="about-help">
        <h2 id="about-help" class="about-h2">Need help?</h2>
        <ul class="contacts">
          <li v-for="c in contacts" :key="c.label" class="contact">
            <div class="contact-label">{{ c.label }}</div>
            <ul v-if="c.people.length" class="people">
              <li v-for="p in c.people" :key="p.email">
                <span class="person-name">{{ p.name }}</span>
                <a :href="`mailto:${p.email}`" class="mail-link">{{ p.email }}</a>
              </li>
            </ul>
            <p v-else class="hint">{{ c.empty }}</p>
          </li>
        </ul>
      </section>

      <section class="about-section" aria-labelledby="about-team">
        <h2 id="about-team" class="about-h2">Development team</h2>
        <div class="member">
          <q-avatar size="44px" color="tint" text-color="on-tint" class="member-avatar" aria-hidden="true">CS</q-avatar>
          <div class="member-text">
            <p class="member-name">{{ DEVELOPER.name }}</p>
            <p class="member-role">Developer · design, development and maintenance</p>
            <a :href="`mailto:${DEVELOPER.email}`" class="mail-link">{{ DEVELOPER.email }}</a>
          </div>
        </div>
      </section>-->

      <section class="about-section" aria-labelledby="about-source">
        <h2 id="about-source" class="about-h2">Source code</h2>
        <p class="source-text">
          The source code is public on GitHub. You may copy and adapt it for non-commercial purposes, as long as you credit
          the author and share your changes under the same license.
        </p>
        <div class="source-row">
          <a :href="SOURCE_URL" target="_blank" rel="noopener" class="source-link">
            <q-icon name="code" size="20px" aria-hidden="true" />
            <span><span class="text-muted">github.com/</span>{{ SOURCE_URL.replace('https://github.com/', '') }}</span>
            <q-icon name="open_in_new" size="16px" class="text-muted" aria-hidden="true" />
            <span class="sr-only">(opens in a new tab)</span>
          </a>
          <a :href="LICENSE.url" target="_blank" rel="license noopener" class="license-badge">
            {{ LICENSE.name }}<span class="sr-only"> license (opens in a new tab)</span>
          </a>
        </div>
        <p class="copyright">© {{ COPYRIGHT_YEAR }} {{ DEVELOPER.name }}. Licensed under {{ LICENSE.name }}.</p>
      </section>

      <footer class="about-actions">
        <q-btn unelevated no-caps color="primary" icon="rate_review" label="Share feedback" :href="feedbackHref" />
      </footer>
    </article>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUsersStore } from '@/stores/users';
import { useWardsStore } from '@/stores/wards';
import type { UserProfile } from '@/types/schedule';
import { version } from '../../package.json';

const auth = useAuthStore();
const users = useUsersStore();
const wards = useWardsStore();

const DEVELOPER = { name: 'Chris', email: 'chris20090731@gmail.com' };

const SOURCE_URL = 'https://github.com/ChrisSun0731/Schedule';
/** Same licence as the LICENSE file at the repository root. */
const LICENSE = { name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' };
const COPYRIGHT_YEAR = 2026;

const feedbackHref =`mailto:${DEVELOPER.email}?subject=${encodeURIComponent('排班系統 feedback')}`;

interface Person {
  name: string;
  email: string;
}

/** Active people other than me, each listed once. */
function others(list: UserProfile[]): Person[] {
  const seen = new Set<string>();
  return list
    .filter((u) => u.active && u.email !== auth.email && !seen.has(u.id) && seen.add(u.id))
    .map((u) => ({ name: u.displayName, email: u.email }));
}

const headNurses = computed(() => others(wards.mine.flatMap((w) => users.headsOf(w.id))));
const administrators = computed(() => others(users.list.filter((u) => u.role === 'developer')));

const contacts = computed<{ label: string; people: Person[]; empty: string }[]>(() => [
  ...(auth.role === 'nurse'
    ? [{ label: 'Your schedule, swaps or leave: your head nurse', people: headNurses.value, empty: 'No head nurse is assigned to your ward yet.' }]
    : []),
  {
    label: 'Account access, roles and ward assignments: system administrators',
    people: administrators.value,
    empty: auth.role === 'developer' ? 'You are the only system administrator.' : 'No system administrator is listed. Ask your head nurse.',
  },
  { label: 'Problems with the system or suggestions: the developer', people: [DEVELOPER], empty: '' },
]);
</script>

<style scoped lang="scss">
// A reading card; on phones it drops the frame and uses the full width.
.about-doc {
  max-width: 44rem;
  margin: 0 auto;
  padding: 32px 40px 28px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  @media (max-width: 599px) {
    padding: 4px 0 0;
    background: none;
    border: 0;
  }
}

.about-head {
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--line);
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--focus);
}
.about-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.01em;
  @media (max-width: 599px) {
    font-size: 1.25rem;
  }
}
.version {
  margin: 10px 0 0;
  font-size: 0.8125rem;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.lead p {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.75;
  & + p {
    margin-top: 10px;
  }
}

.about-section {
  margin-top: 28px;
}
.about-h2 {
  margin: 0 0 12px;
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: normal;
}

.contacts {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.contact {
  padding: 12px 16px;
  & + & {
    border-top: 1px solid var(--line);
  }
}
.contact-label {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 4px;
}
.people {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 10px;
    min-width: 0;
  }
}
.person-name {
  font-size: 0.875rem;
}
.mail-link {
  font-size: 0.8125rem;
  color: var(--focus);
  text-decoration: none;
  overflow-wrap: anywhere;
  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}

.member {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.member-avatar {
  flex: none;
  font-size: 0.9375rem;
  font-weight: 700;
}
.member-text {
  min-width: 0;
  p {
    margin: 0;
  }
}
.member-name {
  font-weight: 700;
  font-size: 0.9375rem;
}
.member-role {
  font-size: 0.8125rem;
  color: var(--text-2);
  margin-bottom: 2px !important;
}

.source-text {
  margin: 0 0 12px;
  font-size: 0.9375rem;
  line-height: 1.75;
}
.source-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.source-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
  overflow-wrap: anywhere;
  &:hover {
    border-color: var(--focus);
  }
  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
}
.license-badge {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--text);
  font-size: 0.8125rem;
  font-weight: 600;
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
.copyright {
  margin: 12px 0 0;
  font-size: 0.8125rem;
  color: var(--text-2);
}

.about-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  @media (max-width: 599px) {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
