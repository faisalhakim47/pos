<script setup>
import { watchEffect } from 'vue';

import { unknownErrorToString } from '@/src/tools/error.js';

const props = defineProps({
  error: { type: Object, required: false },
});

watchEffect(function () {
  if (props.error) {
    console.error('UnhandledError:', props.error);
  }
});
</script>


<template>
  <p v-if="props.error" aria-role="alert">{{ unknownErrorToString(props.error) }}</p>
</template>
