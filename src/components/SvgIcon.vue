<script setup>
import { onMounted, ref, useCssModule, watchPostEffect } from 'vue';

/** @template T @typedef {import('vue').Ref<T>} Ref */

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, required: true },
  width: { type: [String, Number], default: '24' },
  height: { type: [String, Number], default: '24' },
});

const style = useCssModule();

const containerRef = ref(/** @type {HTMLSpanElement} */ (null));
const svgText = ref('');

watchPostEffect(function () {
  if (!containerRef.value) return;
  if (!svgText.value) return;
  containerRef.value.innerHTML = svgText.value;
  const svgEl = containerRef.value.querySelector('svg');
  if (svgEl instanceof SVGSVGElement) {
    svgEl.querySelector('title')?.remove();
    const titleEl = document.createElement('title');
    titleEl.textContent = props.alt;
    svgEl.prepend(titleEl);
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('aria-label', props.alt);
  }
});

onMounted(async function () {
  try {
    const response = await fetch(props.src);
    if (!response.ok) {
      throw new Error(`Failed to fetch SVG: ${response.statusText}`);
    }
    svgText.value = await response.text();
  }
  catch (error) {
    console.error('Error loading SVG:', error);
  }
});
</script>

<template>
  <span ref="containerRef" :class="style.container"></span>
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
