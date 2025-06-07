<script setup>
import { usePlatform } from '@/src/context/platform.js';
import { useI18n } from '@/src/i18n/i18n.js';
const { t } = useI18n();
const platform = usePlatform();
</script>

<template>
  <div class="app-unsupported-platform">
    <h1>{{ t('unsupportedPlatformTitle') }}</h1>
    <p>{{ t('unsupportedPlatformMessage') }}</p>
    <ul>
      <li v-for="(browser, index) in platform.supportedBrowsers ?? []" :key="index">
        <a :href="browser.url" target="_blank" rel="noopener noreferrer">{{ browser.name }}</a>
      </li>
    </ul>
  </div>
</template>
