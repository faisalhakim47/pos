<script setup>
import { ref, useCssModule, onMounted, onUnmounted } from 'vue';

const style = useCssModule();
const randomColor = ref('blue');

onMounted(function () {
  const interval = setInterval(function () {
    randomColor.value = '#' + Math.floor(Math.random() * 16777215).toString(16);
  }, 1000);
  onUnmounted(function () {
    clearInterval(interval);
  });
});
</script>

<template>
  <div :class="style.container">
    <h1>App Panel Dashboard</h1>
    <p>This is the App Panel Dashboard view.</p>
    <p>{{ randomColor }}</p>
  </div>
</template>

<style module>
.container {
  color: v-bind(randomColor);
}
</style>
