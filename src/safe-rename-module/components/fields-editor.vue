<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useApi, useStores } from "@directus/extensions-sdk";
import { FieldRaw } from "@directus/types";
import ImpactPreview from "./impact-preview.vue";

const api = useApi();

const props = defineProps<{
  activeCollection?: string | null;
}>();

const { useFieldsStore } = useStores();
const fieldsStore = useFieldsStore();

interface Field extends FieldRaw {
  field: string;
  newFieldName: string;
  impactResult?: {
    totalChanges: number;
    totalDependencies: number;
    totalOwners: number;
  };
}

const fields = ref<Field[]>([]);
const loadingFields = ref(false);
const showImpactPreview = ref(false);
const showAllImpacts = ref(false);

// Debounce timers per field
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

watch(
  () => props.activeCollection,
  async (value: string | undefined) => {
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
    fields.value = rawFields.map((f: FieldRaw) => ({
      ...f,
      field: f.field,
      newFieldName: f.field,
    }));
  } catch (error) {
    console.error(error);
    alert("Failed to load fields");
  } finally {
    loadingFields.value = false;
  }
}

// Debounced impact analysis for field changes
async function analyzeFieldImpact(field: Field) {
  // Clear existing timer
  const existingTimer = debounceTimers.get(field.field);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer
  const timer = setTimeout(async () => {
    if (!props.activeCollection || field.field === field.newFieldName) {
      field.impactResult = undefined;
      return;
    }
    try {
      const response = await api.post("/safe-rename/impact/analyze", {
        type: "field",
        collection: props.activeCollection,
        field: field.field,
        newName: field.newFieldName,
      });
      field.impactResult = {
        totalChanges: response.data.totalChanges,
        totalDependencies: response.data.summary.totalDependencies,
        totalOwners: response.data.summary.totalOwners,
      };
    } catch (error) {
      console.error("Impact analysis failed for field:", field.field);
    }
  }, 300);

  debounceTimers.set(field.field, timer);
}

const dirtyFields = computed(() =>
  fields.value.filter(
    (f: Field) => f.field !== f.newFieldName && f.newFieldName.trim() !== "",
  ),
);

// Get fields with impact results
const fieldsWithImpact = computed(() => {
  return dirtyFields.value.filter((f: Field) => f.impactResult);
});

const totalImpact = computed(() => {
  return fieldsWithImpact.value.reduce(
    (sum: number, f: Field) => sum + (f.impactResult?.totalDependencies ?? 0),
    0,
  );
});

const hasDirty = computed(() => dirtyFields.value.length > 0);
// The dialog does its own fresh analysis on mount, so we only need a dirty field.
// The inline badge pre-analysis is a convenience preview, not a gate.
const canReviewImpact = computed(() => dirtyFields.value.length > 0);

async function handleRename() {
  if (!props.activeCollection || !hasDirty.value) return;
  await executeRename();
}

async function executeRename() {
  if (!props.activeCollection || !hasDirty.value) return;

  try {
    await api.post("/safe-rename/fields/rename", {
      collection: props.activeCollection,
      fields: dirtyFields.value.map((f: Field) => ({
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

function handleImpactProceed() {
  showImpactPreview.value = false;
  executeRename();
}

function openImpactPreview() {
  if (!canReviewImpact.value) return;
  showImpactPreview.value = true;
}

function reset() {
  fields.value = fields.value.map((f: Field) => ({
    ...f,
    newFieldName: f.field,
    impactResult: undefined,
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
        <!-- Summary of total impact -->
        <div v-if="totalImpact > 0" class="impact-summary">
          <v-notice type="warning">
            <v-icon name="warning" />
            <span>
              Estimated <strong>{{ totalImpact }}</strong> changes across
              <strong>{{ fieldsWithImpact.length }}</strong> fields
            </span>
          </v-notice>
        </div>

        <div class="fields-list">
          <div
            v-for="field in fields"
            :key="field.field"
            class="field-row"
            :class="{
              dirty: field.field !== field.newFieldName && field.newFieldName.trim() !== '',
              invalid: field.newFieldName.trim() === '' && field.field !== field.newFieldName,
              hasImpact: field.impactResult?.totalDependencies,
            }"
          >
            <v-input
              :model-value="field.field"
              :label="field.field"
              disabled
              class="field-original"
            />

            <div class="arrow">→</div>

            <v-input
              :model-value="field.newFieldName"
              placeholder="new_field_name"
              db-safe
              class="field-new"
              @update:model-value="
                (val: any) => {
                  field.newFieldName = val ?? '';
                  analyzeFieldImpact(field);
                }
              "
            />

            <!-- Impact badge -->
            <div v-if="field.impactResult?.totalDependencies" class="impact-badge">
              <v-chip
                x-small
                :type="field.impactResult.totalDependencies > 10 ? 'danger' : 'warning'"
              >
                {{ field.impactResult.totalDependencies }}
              </v-chip>
            </div>
          </div>
        </div>

        <div v-if="hasDirty" class="dirty-summary">
          <v-notice type="info">
            {{ dirtyFields.length }} field(s) will be renamed
          </v-notice>
        </div>

        <div class="actions">
          <v-button secondary @click="reset"> Reset </v-button>

          <v-button
            secondary
            :disabled="!canReviewImpact"
            @click="openImpactPreview"
          >
            Review Impact
          </v-button>

          <v-button kind="primary" :disabled="!hasDirty" @click="handleRename">
            Rename Fields
          </v-button>
        </div>
      </template>
    </v-card>

    <!-- Impact Analysis Preview for first dirty field -->
    <impact-preview
      v-if="showImpactPreview && dirtyFields.length > 0"
      type="field"
      :collection="props.activeCollection ?? ''"
      :old-name="dirtyFields[0].field"
      :new-name="dirtyFields[0].newFieldName"
      @proceed="handleImpactProceed"
      @cancel="showImpactPreview = false"
    />
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
