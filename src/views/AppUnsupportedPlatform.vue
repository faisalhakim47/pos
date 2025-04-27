<script setup>
import { useI18n } from '@/i18n/i18n.js';

const { t } = useI18n();
const supportedBrowsers = [
  { name: 'Google Chrome', url: 'https://www.google.com/chrome/' },
  { name: 'Mozilla Firefox', url: 'https://www.mozilla.org/firefox/' },
];
</script>

<template>
  <div class="app-unsupported-platform">
    <h1>{{ t('unsupportedPlatformTitle') }}</h1>
    <p>{{ t('unsupportedPlatformMessage') }}</p>
    <ul>
      <li v-for="(browser, index) in supportedBrowsers" :key="index">
        <a :href="browser.url" target="_blank" rel="noopener noreferrer">{{ browser.name }}</a>
      </li>
    </ul>
  </div>
</template>
