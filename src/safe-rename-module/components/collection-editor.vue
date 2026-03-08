<script setup lang="ts">
import { ref, watch } from "vue";
import { useApi } from "@directus/extensions-sdk";

const api = useApi();

const props = defineProps<{
  activeCollection?: string | null;
}>();

const newCollectionName = ref("");

watch(
  () => props.activeCollection,
  (value) => {
    newCollectionName.value = value ?? "";
  },
  { immediate: true },
);

async function handleRename() {
  if (!props.activeCollection || !newCollectionName.value) return;

  try {
    await api.post("/safe-rename/collections/rename", {
      sourceCollection: props.activeCollection,
      targetCollection: newCollectionName.value,
    });

    alert("Collection renamed successfully");

    window.location.href = `/admin/safe-rename/${newCollectionName.value}`;
  } catch (error) {
    console.error(error);
    alert("Rename failed");
  }
}

function reset() {
  newCollectionName.value = props.activeCollection ?? "";
}
</script>

<template>
  <div class="content">
    <v-card class="editor">
      <h2 class="title">Rename Collection</h2>

      <v-notice type="warning">
        Renaming a collection will update the database table name. This may
        affect existing relations and API usage.
      </v-notice>

      <div class="collection-list">
        <div
          class="collection-row"
          :class="{ dirty: activeCollection !== newCollectionName }"
        >
          <v-input
            :model-value="activeCollection"
            label="Current Collection"
            disabled
          />

          <div class="arrow">→</div>

          <v-input
            v-model="newCollectionName"
            label="New Collection Name"
            placeholder="collection_name"
            db-safe
          />
        </div>
      </div>

      <div class="actions">
        <v-button secondary @click="reset"> Reset </v-button>

        <v-button
          kind="primary"
          :disabled="newCollectionName === activeCollection"
          @click="handleRename"
        >
          Rename Collection
        </v-button>
      </div>
    </v-card>
  </div>
</template>

<style scoped>
.content {
  padding: 24px;
}

.editor {
  display: contents;
}

.title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
}

.warning {
  margin-bottom: 16px;
}

.collection-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  margin-bottom: 16px;
}

.collection-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  border-radius: 6px;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.collection-row.dirty {
  background-color: var(--warning-10, rgba(255, 171, 0, 0.1));
}

.arrow {
  color: var(--foreground-subdued);
  font-size: 18px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
</style>
