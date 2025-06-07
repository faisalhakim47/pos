<script setup>
import { onMounted, reactive, useCssModule } from 'vue';

/** @template T @typedef {import('vue').Ref<T>} Ref */

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, required: true },
  width: { type: [String, Number], default: '24' },
  height: { type: [String, Number], default: '24' },
});

const style = useCssModule();

const state = reactive({
  loadedSvgText: '',
  get svgText() {
    return state.loadedSvgText.replace(
      'fill="currentColor"><',
      `fill="currentColor"><title>${props.alt}</title><`,
    );
  },
});

onMounted(async function () {
  try {
    const response = await fetch(props.src);
    if (!response.ok) {
      throw new Error(`Failed to fetch SVG: ${response.statusText}`);
    }
    state.loadedSvgText = await response.text();
  }
  catch (error) {
    console.error('Error loading SVG:', error);
  }
});
</script>

<template>
  <span
    :class="style.container"
    v-html="state.svgText"
  ></span>
</template>

<style module>
.container {
  display: inline-block;
  width: v-bind('props.width')px;
  height: v-bind('props.height')px;
}
.container svg {
  display: block;
  width: inherit;
  height: inherit;
}
</style>
