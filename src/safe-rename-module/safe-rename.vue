<script>
import { computed } from "vue";
import { useStores } from "@directus/extensions-sdk";
import { useRouter, useRoute } from "vue-router";

import CollectionSidebar from "./components/collection-sidebar.vue";
import CollectionEditor from "./components/collection-editor.vue";
import FieldsEditor from "./components/fields-editor.vue";

export default {
  components: {
    CollectionSidebar,
    CollectionEditor,
    FieldsEditor,
  },

  setup() {
    const { useCollectionsStore } = useStores();
    const collectionsStore = useCollectionsStore();

    const router = useRouter();
    const route = useRoute();

    const activeCollection = computed(() => {
      const param = route.params.collection;
      return typeof param === "string" ? param : null;
    });

    const filteredCollections = computed(() => {
      return collectionsStore.visibleCollections.filter(
        (c) => !c.collection.startsWith("directus_"),
      );
    });

    const breadcrumb = computed(() => {
      const items = [
        {
          name: "Safe Rename",
          to: "/safe-rename",
        },
      ];

      if (activeCollection.value) {
        items.push({
          name: activeCollection.value,
        });
      }

      return items;
    });

    function selectCollection(collection) {
      router.push({
        name: "safe-rename",
        params: { collection },
      });
    }

    return {
      filteredCollections,
      activeCollection,
      breadcrumb,
      selectCollection,
    };
  },
};
</script>

<template>
  <private-view title="Safe Rename" icon="drive_file_rename_outline">
    <template #headline>
      <v-breadcrumb :items="breadcrumb" />
    </template>

    <template #navigation>
      <collection-sidebar
        :collections="filteredCollections"
        :active-collection="activeCollection"
        :loading="loading"
        @select="selectCollection"
      />
    </template>

    <collection-editor :active-collection="activeCollection" />

    <fields-editor :active-collection="activeCollection" />
  </private-view>
</template>

<style scoped>
.header-icon {
  --v-button-background-color: var(--theme--primary-background);
  --v-button-color: var(--theme--primary);
  --v-button-background-color-hover: var(--theme--primary-subdued);
}
</style>
