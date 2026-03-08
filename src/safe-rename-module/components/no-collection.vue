<script setup lang="ts">
// no logic needed
</script>

<template>
  <div class="no-collection">
    <v-info
      icon="drive_file_rename_outline"
      title="No Collection Selected"
      center
    >
      Select a collection from the sidebar to rename it or its fields.
    </v-info>
  </div>
</template>

<style scoped>
.no-collection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
