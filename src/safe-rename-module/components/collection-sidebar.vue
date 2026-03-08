<script setup lang="ts">
import { computed } from "vue";
import { AppCollection } from "@directus/types";

const { collections, activeCollection, loading } = defineProps<{
  collections: AppCollection[];
  activeCollection?: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", collection: string): void;
}>();

const items = computed(() => collections);

function getIcon(collection: AppCollection) {
  return collection.icon;
}

function getLabel(collection: AppCollection) {
  return collection.name;
}

function getColor(collection: AppCollection) {
  return collection.color;
}

function handleClick(collection: string) {
  emit("select", collection);
}
</script>

<template>
  <v-list nav>
    <v-progress-linear v-if="loading" indeterminate />

    <v-list-item
      v-for="collection in items"
      :key="collection.collection"
      :active="activeCollection === collection.collection"
      @click="handleClick(collection.collection)"
      clickable
    >
      <v-list-item-icon>
        <v-icon :name="getIcon(collection)" :color="getColor(collection)" />
      </v-list-item-icon>

      <v-list-item-content>
        {{ getLabel(collection) }}
      </v-list-item-content>
    </v-list-item>
  </v-list>
</template>
