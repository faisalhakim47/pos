<script setup>
import { RouterLink } from 'vue-router';

import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountListRoute, AppPanelJournalEntryListRoute } from '@/src/router/router.js';

const { t } = useI18n();
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('dashboardTitle') }}</h1>
    </header>

    <section class="dashboard-navigation">
      <div class="nav-grid">
        <RouterLink :to="{ name: AppPanelAccountListRoute }" class="nav-card">
          <h3>{{ t('menuItemAccountLabel') }}</h3>
          <p>{{ t('accountListSubtitle') }}</p>
        </RouterLink>

        <RouterLink :to="{ name: AppPanelJournalEntryListRoute }" class="nav-card">
          <h3>{{ t('menuItemJournalEntryLabel') }}</h3>
          <p>{{ t('journalEntryListSubtitle') }}</p>
        </RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.dashboard-navigation {
  padding: 2rem 0;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.nav-card {
  display: block;
  padding: 2rem;
  background-color: #f8f9fa;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;
}

.nav-card:hover {
  background-color: #f3f4f6;
  border-color: #d1d5db;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.nav-card h3 {
  margin: 0 0 0.5rem 0;
  color: #1f2937;
  font-size: 1.25rem;
  font-weight: 600;
}

.nav-card p {
  margin: 0;
  color: #6b7280;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
