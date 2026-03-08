<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useApi, useStores } from "@directus/extensions-sdk";
import { FieldRaw } from "@directus/types";

const api = useApi();

const props = defineProps<{
  activeCollection?: string | null;
}>();

const { useFieldsStore } = useStores();
const fieldsStore = useFieldsStore();

interface Field extends FieldRaw {
  newFieldName: string;
}

const fields = ref<Field[]>([]);
const loadingFields = ref(false);

watch(
  () => props.activeCollection,
  async (value) => {
    if (!value) {
      fields.value = [];
      return;
    }
    await loadFields(value);
  },
  { immediate: true },
);

async function loadFields(collection: string) {
  loadingFields.value = true;
  try {
    await fieldsStore.hydrate();
    const rawFields: FieldRaw[] =
      fieldsStore.getFieldsForCollection(collection);
    fields.value = rawFields.map((f) => ({
      ...f,
      newFieldName: f.field,
    }));
  } catch (error) {
    console.error(error);
    alert("Failed to load fields");
  } finally {
    loadingFields.value = false;
  }
}

const dirtyFields = computed(() =>
  fields.value.filter(
    (f) => f.field !== f.newFieldName && f.newFieldName.trim() !== "",
  ),
);

const hasDirty = computed(() => dirtyFields.value.length > 0);

async function handleRename() {
  if (!props.activeCollection || !hasDirty.value) return;

  try {
    await api.post("/safe-rename/fields/rename", {
      collection: props.activeCollection,
      fields: dirtyFields.value.map((f) => ({
        sourceField: f.field,
        targetField: f.newFieldName,
      })),
    });

    alert(`${dirtyFields.value.length} field(s) renamed successfully`);
    window.location.reload();
  } catch (error) {
    console.error(error);
    alert("Rename failed");
  }
}

function reset() {
  fields.value = fields.value.map((f) => ({
    ...f,
    newFieldName: f.field,
  }));
}
</script>

<template>
  <div class="content">
    <v-card class="editor">
      <h2 class="title">Rename Fields</h2>

      <v-notice type="warning">
        Renaming fields will update the database column names. This may affect
        existing relations and API usage.
      </v-notice>

      <div v-if="loadingFields" class="loading">
        <v-progress-circular indeterminate />
      </div>

      <template v-else>
        <div class="fields-list">

          <div v-for="field in fields" :key="field.field" class="field-row" :class="{
            dirty: field.field !== field.newFieldName && field.newFieldName.trim() !== '',
            invalid: field.newFieldName.trim() === '' && field.field !== field.newFieldName
          }">

            <v-input :model-value="field.field" :label="field.field" disabled class="field-original" />

            <div class="arrow">→</div>


            <v-input :model-value="field.newFieldName" placeholder="new_field_name" db-safe class="field-new"
              @update:model-value="(val: any) => field.newFieldName = val ?? ''" />
          </div>
        </div>

        <div v-if="hasDirty" class="dirty-summary">
          <v-notice type="info">
            {{ dirtyFields.length }} field(s) will be renamed
          </v-notice>
        </div>

        <div class="actions">
          <v-button secondary @click="reset"> Reset </v-button>

          <v-button kind="primary" :disabled="!hasDirty" @click="handleRename">
            Rename Fields
          </v-button>
        </div>
      </template>
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

.fields-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  margin-bottom: 16px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  border-radius: 6px;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.field-row.dirty {
  background-color: var(--warning-10, rgba(255, 171, 0, 0.1));
}

.field-row.invalid {
  background-color: var(--danger-10, rgba(255, 0, 0, 0.1));
}

.arrow {
  color: var(--foreground-subdued);
  font-size: 18px;
}

.dirty-summary {
  margin-top: 4px;
  flex-shrink: 0;
}

.loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  flex-shrink: 0;
}
</style>
