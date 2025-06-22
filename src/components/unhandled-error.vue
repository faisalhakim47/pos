<script setup>
import { unknownErrorToString } from '@/src/tools/error.js';

const props = defineProps({
  error: { type: Object, required: false },
});
</script>


<template>
  <p v-if="props.error" aria-role="alert">{{ unknownErrorToString(props.error) }}</p>
</template>
