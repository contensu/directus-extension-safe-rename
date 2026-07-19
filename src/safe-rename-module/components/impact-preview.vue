<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useApi } from "@directus/extensions-sdk";

const api = useApi();

type ImpactCategory =
  | "schema"
  | "relationship"
  | "interface"
  | "display"
  | "filter"
  | "permission"
  | "preset"
  | "automation"
  | "dashboard"
  | "content";

interface ImpactDependency {
  key: string;
  category: ImpactCategory;
  severity: "low" | "medium" | "high";
  scope: "direct" | "related";
  table: string;
  column: string;
  path?: string;
  ownerType: string;
  ownerId: string | number;
  ownerLabel: string;
  collection?: string;
  field?: string;
  relatedCollection?: string;
  relatedField?: string;
  summary: string;
  currentValue: string;
  nextValue: string;
}

interface CategorySummary {
  category: ImpactCategory;
  label: string;
  count: number;
}

interface ImpactAnalysisResult {
  type: "collection" | "field";
  sourceName: string;
  targetName: string;
  totalChanges: number;
  dependencies: ImpactDependency[];
  summary: {
    totalDependencies: number;
    totalOwners: number;
    totalTables: number;
    directDependencies: number;
    relatedDependencies: number;
    categories: CategorySummary[];
  };
}

interface Props {
  type: "collection" | "field";
  collection: string;
  oldName: string;
  newName: string;
}

const props = defineProps<Props>();

interface Emits {
  (e: "proceed"): void;
  (e: "cancel"): void;
}

const emit = defineEmits<Emits>();

const impact = ref<ImpactAnalysisResult | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedCategory = ref<ImpactCategory | "all">("all");
const selectedScope = ref<"all" | "direct" | "related">("all");
const expandedKeys = ref<Set<string>>(new Set());
const activeView = ref<"overview" | "details">("overview");

const diagramContainerRef = ref<HTMLElement | null>(null);
const zoom = ref(1);
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartScrollLeft = 0;
let dragStartScrollTop = 0;

function setZoom(next: number) {
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
}

function zoomIn() {
  setZoom(zoom.value + 0.2);
}

function zoomOut() {
  setZoom(zoom.value - 0.2);
}

function zoomReset() {
  zoom.value = 1;
  const el = diagramContainerRef.value;
  if (el) {
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }
}

function onDiagramWheel(e: WheelEvent) {
  // Only hijack the wheel for zoom when a modifier is held, so normal
  // scrolling of the page/panel still works.
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setZoom(zoom.value + (e.deltaY < 0 ? 0.15 : -0.15));
}

function onDiagramMousedown(e: MouseEvent) {
  const el = diagramContainerRef.value;
  if (!el) return;
  isDragging = true;
  dragStartX = e.pageX;
  dragStartY = e.pageY;
  dragStartScrollLeft = el.scrollLeft;
  dragStartScrollTop = el.scrollTop;
  el.style.cursor = "grabbing";
  // Prevents text selection / drag behavior
  e.preventDefault();
}

function onDiagramMousemove(e: MouseEvent) {
  if (!isDragging) return;
  const el = diagramContainerRef.value;
  if (!el) return;
  e.preventDefault();
  el.scrollLeft = dragStartScrollLeft - (e.pageX - dragStartX);
  el.scrollTop = dragStartScrollTop - (e.pageY - dragStartY);
}

function onDiagramMouseup() {
  isDragging = false;
  const el = diagramContainerRef.value;
  if (el) el.style.cursor = "grab";
}

function onDiagramTouchstart(e: TouchEvent) {
  const el = diagramContainerRef.value;
  if (!el || !e.touches[0]) return;
  isDragging = true;
  dragStartX = e.touches[0].pageX;
  dragStartY = e.touches[0].pageY;
  dragStartScrollLeft = el.scrollLeft;
  dragStartScrollTop = el.scrollTop;
}

function onDiagramTouchmove(e: TouchEvent) {
  if (!isDragging) return;
  const el = diagramContainerRef.value;
  if (!el || !e.touches[0]) return;
  el.scrollLeft = dragStartScrollLeft - (e.touches[0].pageX - dragStartX);
  el.scrollTop = dragStartScrollTop - (e.touches[0].pageY - dragStartY);
}

const filteredDependencies = computed(() => {
  const dependencies = impact.value?.dependencies ?? [];

  return dependencies.filter((item) => {
    if (selectedCategory.value !== "all" && item.category !== selectedCategory.value) {
      return false;
    }

    if (selectedScope.value !== "all" && item.scope !== selectedScope.value) {
      return false;
    }

    return true;
  });
});

const groupedDependencies = computed(() => {
  const groups = new Map<string, { label: string; dependencies: ImpactDependency[] }>();

  for (const dependency of filteredDependencies.value) {
    const key = dependency.ownerLabel;
    const existing = groups.get(key);
    if (existing) {
      existing.dependencies.push(dependency);
    } else {
      groups.set(key, {
        label: key,
        dependencies: [dependency],
      });
    }
  }

  return [...groups.values()].sort(
    (left, right) => right.dependencies.length - left.dependencies.length,
  );
});

const diagramCategories = computed(() => {
  return (impact.value?.summary.categories ?? [])
    .filter((item) =>
      selectedCategory.value === "all" ? true : item.category === selectedCategory.value,
    )
    .filter((item) =>
      filteredDependencies.value.some((dependency) => dependency.category === item.category),
    );
});

const ownerGroupsForDiagram = computed(() => {
  return groupedDependencies.value
    .slice(0, 8)
    .map((group) => ({
      label: group.label,
      count: group.dependencies.length,
      scope: group.dependencies.some((dependency) => dependency.scope === "related")
        ? "related"
        : "direct",
    }));
});

const diagramHeight = computed(() => {
  const rows = Math.max(
    ownerGroupsForDiagram.value.length,
    diagramCategories.value.length,
    1,
  );
  return Math.max(320, rows * 64 + 80);
});

const diagramLinks = computed(() => {
  const links: Array<{
    key: string;
    path: string;
    tone: string;
    width: number;
    label: string;
  }> = [];

  const sourceX = 140;
  const categoryX = 430;
  const ownerX = 760;
  const sourceY = diagramHeight.value / 2;

  const categoryIndex = new Map(
    diagramCategories.value.map((category, index) => [category.category, index]),
  );
  const ownerIndex = new Map(
    ownerGroupsForDiagram.value.map((owner, index) => [owner.label, index]),
  );

  const categoryYs = diagramCategories.value.map(
    (_item, index) =>
      48 +
      ((index + 0.5) * (diagramHeight.value - 96)) /
        Math.max(diagramCategories.value.length, 1),
  );

  const ownerYs = ownerGroupsForDiagram.value.map(
    (_item, index) =>
      48 +
      ((index + 0.5) * (diagramHeight.value - 96)) /
        Math.max(ownerGroupsForDiagram.value.length, 1),
  );

  for (const category of diagramCategories.value) {
    const index = categoryIndex.get(category.category);
    if (index === undefined) continue;
    const y = categoryYs[index] ?? sourceY;
    links.push({
      key: `source-${category.category}`,
      path: `M ${sourceX + 72} ${sourceY} C 250 ${sourceY}, 300 ${y}, ${categoryX - 84} ${y}`,
      tone: categoryTone(category.category),
      width: Math.max(2, Math.min(14, category.count)),
      label: category.label,
    });
  }

  for (const dependencyGroup of groupedDependencies.value.slice(0, 8)) {
    const ownerI = ownerIndex.get(dependencyGroup.label);
    if (ownerI === undefined) continue;
    const ownerY = ownerYs[ownerI] ?? sourceY;

    const categoryCounts = new Map<ImpactCategory, number>();
    for (const dependency of dependencyGroup.dependencies) {
      categoryCounts.set(
        dependency.category,
        (categoryCounts.get(dependency.category) ?? 0) + 1,
      );
    }

    for (const [category, count] of categoryCounts) {
      const categoryI = categoryIndex.get(category);
      if (categoryI === undefined) continue;
      const categoryY = categoryYs[categoryI] ?? sourceY;

      links.push({
        key: `${category}-${dependencyGroup.label}`,
        path: `M ${categoryX + 84} ${categoryY} C 560 ${categoryY}, 620 ${ownerY}, ${ownerX - 104} ${ownerY}`,
        tone: categoryTone(category),
        width: Math.max(2, Math.min(12, count * 2)),
        label: dependencyGroup.label,
      });
    }
  }

  return {
    sourceX,
    categoryX,
    ownerX,
    sourceY,
    categoryYs,
    ownerYs,
    links,
  };
});

const topCategory = computed(() => impact.value?.summary.categories[0] ?? null);

const hasImpact = computed(() => (impact.value?.summary.totalDependencies ?? 0) > 0);

const maxBarCount = computed(() => {
  const cats = impact.value?.summary.categories ?? [];
  return Math.max(1, ...cats.map((c) => c.count));
});

const severityCounts = computed(() => {
  const deps = impact.value?.dependencies ?? [];
  return {
    high: deps.filter((d) => d.severity === "high").length,
    medium: deps.filter((d) => d.severity === "medium").length,
    low: deps.filter((d) => d.severity === "low").length,
  };
});

const categoryOptions = computed(() => {
  const base = [{ value: "all", text: "All Categories" }];
  const dynamic = (impact.value?.summary.categories ?? []).map((item) => ({
    value: item.category,
    text: `${item.label} (${item.count})`,
  }));

  return [...base, ...dynamic];
});

const scopeOptions = [
  { value: "all", text: "All Scopes" },
  { value: "direct", text: "Direct Only" },
  { value: "related", text: "Related Collections" },
];

async function analyze() {
  loading.value = true;
  error.value = null;

  try {
    const response = await api.post("/safe-rename/impact/analyze", {
      type: props.type,
      collection: props.collection,
      field: props.type === "field" ? props.oldName : undefined,
      newName: props.newName,
    });

    impact.value = response.data;
  } catch (err: any) {
    console.error("Impact analysis failed:", err);
    error.value = err?.response?.data?.error ?? err?.message ?? "Analysis failed";
    impact.value = null;
  } finally {
    loading.value = false;
  }
}

function toggleDependency(key: string) {
  const next = new Set(expandedKeys.value);

  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }

  expandedKeys.value = next;
}

function expandAll() {
  const keys = new Set<string>();
  for (const group of groupedDependencies.value) {
    keys.add(group.label);
  }
  expandedKeys.value = keys;
}

function collapseAll() {
  expandedKeys.value = new Set();
}

function selectCategory(cat: ImpactCategory | "all") {
  selectedCategory.value = cat;
  activeView.value = "details";
}

function categoryTone(category: ImpactCategory): string {
  if (category === "schema" || category === "relationship" || category === "permission") {
    return "danger";
  }

  if (category === "filter" || category === "automation" || category === "dashboard") {
    return "warning";
  }

  return "info";
}

function categoryIcon(category: ImpactCategory): string {
  const icons: Record<ImpactCategory, string> = {
    schema: "table_chart",
    relationship: "device_hub",
    interface: "tune",
    display: "visibility",
    filter: "filter_list",
    permission: "lock",
    preset: "bookmark",
    automation: "bolt",
    dashboard: "dashboard",
    content: "article",
  };
  return icons[category] ?? "info";
}

function dependencyTone(severity: ImpactDependency["severity"]): string {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "info";
}

function scopeLabel(scope: ImpactDependency["scope"]): string {
  return scope === "related" ? "Related" : "Direct";
}

function ownerMeta(dependency: ImpactDependency): string {
  const parts = [dependency.table, dependency.column];
  if (dependency.path) parts.push(dependency.path);
  return parts.join(" · ");
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("cancel");
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  document.body.style.overflow = "hidden";
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});

analyze();
</script>

<template>
  <Teleport to="body">
    <Transition name="overlay">
      <div class="impact-overlay">
        <!-- Top bar -->
        <header class="top-bar">
          <div class="top-bar-left">
            <button class="back-btn" type="button" @click="emit('cancel')">
              <v-icon name="arrow_back" />
            </button>
            <div class="top-bar-title">
              <span class="top-bar-eyebrow">Impact Analysis</span>
              <div class="top-bar-rename">
                <code class="rename-chip rename-old">{{ props.oldName }}</code>
                <v-icon class="rename-arrow-icon" name="east" x-small />
                <code class="rename-chip rename-new">{{ props.newName }}</code>
                <span class="rename-context">{{ props.type }} in <strong>{{ props.collection }}</strong></span>
              </div>
            </div>
          </div>
          <div class="top-bar-right">
            <template v-if="!loading && impact">
              <div v-if="hasImpact" class="top-bar-badge badge-warning">
                <v-icon name="warning_amber" x-small />
                {{ impact.summary.totalDependencies }} impacts found
              </div>
              <div v-else class="top-bar-badge badge-success">
                <v-icon name="check_circle" x-small />
                No impacts
              </div>
            </template>
            <button class="action-btn btn-cancel" type="button" @click="emit('cancel')">Cancel</button>
            <button
              v-if="!loading"
              class="action-btn btn-proceed"
              :class="{ 'btn-warning': hasImpact }"
              type="button"
              @click="emit('proceed')"
            >
              <v-icon :name="hasImpact ? 'warning' : 'check'" x-small />
              {{ hasImpact ? "Proceed Anyway" : "Proceed" }}
            </button>
          </div>
        </header>

        <!-- Loading state -->
        <div v-if="loading" class="loading-fullscreen">
          <div class="loading-content">
            <div class="loading-spinner">
              <v-progress-circular indeterminate />
            </div>
            <h2 class="loading-title">Analyzing Dependencies</h2>
            <p class="loading-sub">Scanning collections, relations, permissions, flows, dashboards, and presets…</p>
          </div>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="error-fullscreen">
          <div class="error-content">
            <div class="error-icon-wrap">
              <v-icon name="error" />
            </div>
            <h2>Analysis Failed</h2>
            <p>{{ error }}</p>
            <button class="action-btn btn-proceed" type="button" @click="analyze()">
              <v-icon name="refresh" x-small />
              Retry
            </button>
          </div>
        </div>

        <!-- Main content -->
        <div v-else-if="impact" class="main-layout">

          <!-- Left sidebar -->
          <aside class="sidebar">

            <!-- Status card -->
            <div class="sidebar-status" :class="hasImpact ? 'status-warning' : 'status-safe'">
              <div class="status-icon">
                <v-icon :name="hasImpact ? 'warning_amber' : 'verified'" />
              </div>
              <div class="status-body">
                <span class="status-title">{{ hasImpact ? "Impact Detected" : "No Impact" }}</span>
                <span class="status-sub">{{ hasImpact ? `${impact.summary.totalDependencies} dependency points will be updated` : "This rename is safe to proceed" }}</span>
              </div>
            </div>

            <!-- Quick stats -->
            <div class="sidebar-section">
              <div class="section-label">Summary</div>
              <div class="stats-column">
                <div class="mini-stat">
                  <div class="mini-stat-icon msi-primary"><v-icon name="link" x-small /></div>
                  <div class="mini-stat-body">
                    <span class="mini-stat-value">{{ impact.summary.totalDependencies }}</span>
                    <span class="mini-stat-label">Dependencies</span>
                  </div>
                </div>
                <div class="mini-stat">
                  <div class="mini-stat-icon msi-accent"><v-icon name="people" x-small /></div>
                  <div class="mini-stat-body">
                    <span class="mini-stat-value">{{ impact.summary.totalOwners }}</span>
                    <span class="mini-stat-label">Owners</span>
                  </div>
                </div>
                <div class="mini-stat">
                  <div class="mini-stat-icon msi-info"><v-icon name="table_chart" x-small /></div>
                  <div class="mini-stat-body">
                    <span class="mini-stat-value">{{ impact.summary.totalTables }}</span>
                    <span class="mini-stat-label">Tables</span>
                  </div>
                </div>
                <div class="mini-stat">
                  <div class="mini-stat-icon msi-scope"><v-icon name="call_split" x-small /></div>
                  <div class="mini-stat-body">
                    <span class="mini-stat-value">{{ impact.summary.directDependencies }} / {{ impact.summary.relatedDependencies }}</span>
                    <span class="mini-stat-label">Direct / Related</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Severity breakdown -->
            <div v-if="hasImpact" class="sidebar-section">
              <div class="section-label">Severity</div>
              <div class="severity-row">
                <div v-if="severityCounts.high" class="severity-chip sev-high">
                  <span class="sev-dot" />{{ severityCounts.high }} High
                </div>
                <div v-if="severityCounts.medium" class="severity-chip sev-medium">
                  <span class="sev-dot" />{{ severityCounts.medium }} Medium
                </div>
                <div v-if="severityCounts.low" class="severity-chip sev-low">
                  <span class="sev-dot" />{{ severityCounts.low }} Low
                </div>
              </div>
            </div>

            <!-- Category list -->
            <div v-if="impact.summary.categories.length" class="sidebar-section">
              <div class="section-label">Categories</div>
              <nav class="category-nav">
                <button
                  class="cat-nav-item"
                  :class="{ active: selectedCategory === 'all' }"
                  type="button"
                  @click="selectCategory('all')"
                >
                  <div class="cat-nav-icon cat-all"><v-icon name="apps" x-small /></div>
                  <span class="cat-nav-name">All</span>
                  <span class="cat-nav-count">{{ impact.summary.totalDependencies }}</span>
                </button>
                <button
                  v-for="cat in impact.summary.categories"
                  :key="cat.category"
                  class="cat-nav-item"
                  :class="{ active: selectedCategory === cat.category }"
                  type="button"
                  @click="selectCategory(cat.category)"
                >
                  <div class="cat-nav-icon" :class="`cat-icon-${categoryTone(cat.category)}`">
                    <v-icon :name="categoryIcon(cat.category)" x-small />
                  </div>
                  <span class="cat-nav-name">{{ cat.label }}</span>
                  <span class="cat-nav-count" :class="`cat-count-${categoryTone(cat.category)}`">{{ cat.count }}</span>
                </button>
              </nav>
            </div>

            <!-- Scope filter -->
            <div class="sidebar-section">
              <div class="section-label">Scope</div>
              <div class="scope-btns">
                <button
                  v-for="opt in scopeOptions"
                  :key="opt.value"
                  class="scope-btn"
                  :class="{ active: selectedScope === opt.value }"
                  type="button"
                  @click="selectedScope = opt.value as any"
                >{{ opt.text }}</button>
              </div>
            </div>
          </aside>

          <!-- Right main panel -->
          <main class="main-panel">

            <!-- View tabs -->
            <div class="view-header">
              <div class="view-tabs">
                <button
                  class="view-tab"
                  :class="{ active: activeView === 'overview' }"
                  type="button"
                  @click="activeView = 'overview'"
                >
                  <v-icon name="bar_chart" x-small />
                  Overview
                </button>
                <button
                  class="view-tab"
                  :class="{ active: activeView === 'details' }"
                  type="button"
                  @click="activeView = 'details'"
                >
                  <v-icon name="list_alt" x-small />
                  Details
                  <span v-if="filteredDependencies.length" class="tab-count">{{ filteredDependencies.length }}</span>
                </button>
              </div>
              <div class="view-actions">
                <span class="filter-summary">
                  {{ filteredDependencies.length }} of {{ impact.summary.totalDependencies }} shown
                </span>
                <template v-if="activeView === 'details'">
                  <button class="mini-btn" type="button" @click="expandAll">Expand All</button>
                  <button class="mini-btn" type="button" @click="collapseAll">Collapse All</button>
                </template>
              </div>
            </div>

            <!-- Overview tab -->
            <div v-if="activeView === 'overview'" class="tab-content">

              <!-- Category breakdown with horizontal bars -->
              <div v-if="impact.summary.categories.length" class="panel">
                <div class="panel-head">
                  <h3><v-icon name="bar_chart" x-small /> Impact by Category</h3>
                  <span class="panel-meta">Click a category to filter details</span>
                </div>
                <div class="panel-body-scrollable">
                  <div class="hbar-list">
                    <button
                      v-for="cat in impact.summary.categories"
                      :key="cat.category"
                      class="hbar-row"
                      type="button"
                      @click="selectCategory(cat.category)"
                    >
                      <div class="hbar-label">
                        <div class="hbar-icon" :class="`icon-${categoryTone(cat.category)}`">
                          <v-icon :name="categoryIcon(cat.category)" x-small />
                        </div>
                        <span>{{ cat.label }}</span>
                      </div>
                      <div class="hbar-bar-wrap">
                        <div class="hbar-track">
                          <div
                            class="hbar-fill"
                            :class="`fill-${categoryTone(cat.category)}`"
                            :style="{ width: `${(cat.count / maxBarCount) * 100}%` }"
                          />
                        </div>
                        <span class="hbar-value" :class="`count-${categoryTone(cat.category)}`">{{ cat.count }}</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Dependency flow diagram -->
              <div v-if="filteredDependencies.length" class="panel">
                <div class="panel-head">
                  <h3><v-icon name="account_tree" x-small /> Dependency Flow</h3>
                  <span class="panel-meta">Source → Category → Affected Owner</span>
                </div>
                <div class="panel-body panel-body-flush">
                  <div class="diagram-toolbar">
                    <button class="dg-btn" type="button" title="Zoom out" :disabled="zoom <= MIN_ZOOM" @click="zoomOut">
                      <v-icon name="remove" x-small />
                    </button>
                    <span class="dg-zoom">{{ Math.round(zoom * 100) }}%</span>
                    <button class="dg-btn" type="button" title="Zoom in" :disabled="zoom >= MAX_ZOOM" @click="zoomIn">
                      <v-icon name="add" x-small />
                    </button>
                    <button class="dg-btn" type="button" title="Reset view" @click="zoomReset">
                      <v-icon name="restart_alt" x-small />
                    </button>
                  </div>
                  <div
                    ref="diagramContainerRef"
                    class="diagram-container"
                    @mousedown="onDiagramMousedown"
                    @mousemove="onDiagramMousemove"
                    @mouseup="onDiagramMouseup"
                    @mouseleave="onDiagramMouseup"
                    @wheel="onDiagramWheel"
                    @touchstart.passive="onDiagramTouchstart"
                    @touchmove.prevent="onDiagramTouchmove"
                    @touchend="onDiagramMouseup"
                  >
                    <svg
                      class="impact-diagram"
                      :viewBox="`0 0 900 ${diagramHeight}`"
                      preserveAspectRatio="xMidYMid meet"
                      draggable="false"
                      :style="{ width: `${900 * zoom}px`, height: `${diagramHeight * zoom}px` }"
                    >
                      <defs>
                        <filter id="ns" x="-8%" y="-8%" width="116%" height="116%">
                          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.08"/>
                        </filter>
                      </defs>

                      <!-- Links -->
                      <g v-for="link in diagramLinks.links" :key="link.key">
                        <path
                          :d="link.path"
                          class="diagram-link"
                          :class="`link-${link.tone}`"
                          :style="{ strokeWidth: `${link.width}px` }"
                        />
                      </g>

                      <!-- Source node -->
                      <g class="diagram-node source-node" filter="url(#ns)">
                        <rect
                          :x="diagramLinks.sourceX - 72"
                          :y="diagramLinks.sourceY - 36"
                          width="144"
                          height="72"
                          rx="16"
                        />
                        <text
                          :x="diagramLinks.sourceX"
                          :y="diagramLinks.sourceY - 8"
                          text-anchor="middle"
                          class="node-text"
                          style="fill: #ffffff !important"
                        >
                          {{ truncate(props.oldName, 16) }}
                        </text>
                        <text
                          :x="diagramLinks.sourceX"
                          :y="diagramLinks.sourceY + 14"
                          text-anchor="middle"
                          class="node-sub"
                          style="fill: rgba(255, 255, 255, 0.8) !important"
                        >
                          rename source
                        </text>
                      </g>

                      <!-- Category nodes -->
                      <g
                        v-for="(category, index) in diagramCategories"
                        :key="category.category"
                        class="diagram-node"
                        filter="url(#ns)"
                      >
                        <rect
                          :x="diagramLinks.categoryX - 84"
                          :y="(diagramLinks.categoryYs[index] ?? 0) - 26"
                          width="168"
                          height="52"
                          rx="12"
                          :class="`cat-rect-${categoryTone(category.category)}`"
                        />
                        <text
                          :x="diagramLinks.categoryX"
                          :y="(diagramLinks.categoryYs[index] ?? 0) - 4"
                          text-anchor="middle"
                          class="node-text"
                          style="fill: #ffffff !important"
                        >
                          {{ truncate(category.label, 18) }}
                        </text>
                        <text
                          :x="diagramLinks.categoryX"
                          :y="(diagramLinks.categoryYs[index] ?? 0) + 15"
                          text-anchor="middle"
                          class="node-sub"
                          style="fill: rgba(255, 255, 255, 0.8) !important"
                        >
                          {{ category.count }} refs
                        </text>
                      </g>

                      <!-- Owner nodes -->
                      <g
                        v-for="(owner, index) in ownerGroupsForDiagram"
                        :key="owner.label"
                        class="diagram-node"
                        filter="url(#ns)"
                      >
                        <rect
                          :x="diagramLinks.ownerX - 104"
                          :y="(diagramLinks.ownerYs[index] ?? 0) - 26"
                          width="208"
                          height="52"
                          rx="12"
                          :class="owner.scope === 'related' ? 'owner-related' : 'owner-direct'"
                        />
                        <text
                          :x="diagramLinks.ownerX"
                          :y="(diagramLinks.ownerYs[index] ?? 0) - 4"
                          text-anchor="middle"
                          class="node-text node-text-sm"
                          style="fill: #ffffff !important"
                        >
                          {{ truncate(owner.label, 24) }}
                        </text>
                        <text
                          :x="diagramLinks.ownerX"
                          :y="(diagramLinks.ownerYs[index] ?? 0) + 15"
                          text-anchor="middle"
                          class="node-sub"
                          style="fill: rgba(255, 255, 255, 0.8) !important"
                        >
                          {{ owner.count }} refs · {{ owner.scope }}
                        </text>
                      </g>
                    </svg>
                  </div>
                  <div class="diagram-legend">
                    <span class="legend-item"><i class="ldot ldot-danger" /> Schema · Relations · Permissions</span>
                    <span class="legend-item"><i class="ldot ldot-warning" /> Filters · Automation · Dashboards</span>
                    <span class="legend-item"><i class="ldot ldot-info" /> Interface · Display · Presets · Content</span>
                  </div>
                </div>
              </div>

              <!-- No impact placeholder -->
              <div v-if="!hasImpact" class="empty-hero">
                <div class="empty-hero-icon">
                  <v-icon name="verified" />
                </div>
                <h2>Safe to Rename</h2>
                <p>No secondary dependencies detected across Directus metadata. You can safely proceed.</p>
              </div>
            </div>

            <!-- Details tab -->
            <div v-if="activeView === 'details'" class="tab-content">
              <div v-if="filteredDependencies.length" class="owners-list">
                <div
                  v-for="group in groupedDependencies"
                  :key="group.label"
                  class="owner-card"
                  :class="{ expanded: expandedKeys.has(group.label) }"
                >
                  <button class="owner-header" type="button" @click="toggleDependency(group.label)">
                    <div class="owner-header-left">
                      <div class="owner-avatar">{{ group.label.slice(0, 2).toUpperCase() }}</div>
                      <div class="owner-header-text">
                        <span class="owner-name">{{ group.label }}</span>
                        <span class="owner-sub">{{ group.dependencies.length }} dependency point{{ group.dependencies.length !== 1 ? "s" : "" }}</span>
                      </div>
                    </div>
                    <div class="owner-header-right">
                      <div class="category-pills">
                        <span
                          v-for="cat in [...new Set(group.dependencies.map(d => d.category))].slice(0, 4)"
                          :key="cat"
                          class="cpill"
                          :class="`cpill-${categoryTone(cat as ImpactCategory)}`"
                        >{{ cat }}</span>
                      </div>
                      <v-icon :name="expandedKeys.has(group.label) ? 'expand_less' : 'expand_more'" />
                    </div>
                  </button>

                  <Transition name="slide">
                    <div v-if="expandedKeys.has(group.label)" class="dep-list-wrap">
                      <div class="dep-grid">
                        <article
                          v-for="dep in group.dependencies"
                          :key="dep.key"
                          class="dep-card"
                          :class="`dep-border-${dependencyTone(dep.severity)}`"
                        >
                          <div class="dep-chips">
                            <span class="dchip" :class="`dchip-${categoryTone(dep.category)}`">
                              <v-icon :name="categoryIcon(dep.category)" x-small />
                              {{ dep.category }}
                            </span>
                            <span class="dchip dchip-outline">{{ scopeLabel(dep.scope) }}</span>
                            <span class="dchip" :class="`dchip-sev-${dependencyTone(dep.severity)}`">{{ dep.severity }}</span>
                          </div>

                          <p class="dep-summary">{{ dep.summary }}</p>

                          <div class="dep-values">
                            <code class="dval dval-old">{{ dep.currentValue }}</code>
                            <span class="dval-arrow">→</span>
                            <code class="dval dval-new">{{ dep.nextValue }}</code>
                          </div>

                          <div class="dep-meta">
                            <v-icon name="table_rows" x-small />
                            {{ ownerMeta(dep) }}
                          </div>

                          <div
                            v-if="dep.relatedCollection || dep.relatedField"
                            class="dep-related"
                          >
                            <v-icon name="account_tree" x-small />
                            Related:
                            <strong>
                              {{ dep.relatedCollection || dep.collection }}
                              <template v-if="dep.relatedField">.{{ dep.relatedField }}</template>
                            </strong>
                          </div>
                        </article>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>

              <!-- No results -->
              <div v-else class="empty-results">
                <div class="empty-icon-wrap">
                  <v-icon name="search_off" />
                </div>
                <h3>No dependencies match these filters</h3>
                <p>Try changing the Category or Scope filter in the sidebar.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Full-screen overlay ──────────────────────── */
.impact-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  flex-direction: column;
  background: var(--theme--background);
  color: var(--theme--foreground-normal);
}

/* On larger screens give the overlay a proper backdrop and center the interface */
@media (min-width: 860px) {
  .impact-overlay {
    background: color-mix(in srgb, var(--theme--background-page) 60%, var(--theme--background));
  }
}

@media (min-width: 1280px) {
  .impact-overlay {
    background: color-mix(in srgb, var(--theme--background-page) 80%, var(--theme--background));
  }
}

.overlay-enter-active { animation: ov-in 0.22s ease-out; }
.overlay-leave-active { animation: ov-in 0.18s ease-in reverse; }
@keyframes ov-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Top bar ──────────────────────────────────── */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px;
  height: 60px;
  flex-shrink: 0;
  background: var(--theme--background);
  border-bottom: 1px solid var(--theme--border-subdued);
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--theme--foreground-subdued);
  cursor: pointer;
  transition: all 0.15s;
}
.back-btn:hover {
  background: var(--theme--background-subdued);
  color: var(--theme--foreground-normal);
}

.top-bar-eyebrow {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme--foreground-subdued);
  font-weight: 600;
}

.top-bar-rename {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rename-chip {
  font-family: var(--theme--fonts--monospace--font-family, monospace);
  font-size: 13px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 6px;
  white-space: nowrap;
}

.rename-old {
  background: var(--theme--background-subdued);
  border: 1px solid var(--theme--border-subdued);
}

.rename-new {
  background: color-mix(in srgb, var(--theme--primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme--primary) 25%, transparent);
  color: var(--theme--primary);
}

.rename-arrow-icon { color: var(--theme--foreground-subdued); }

.rename-context {
  font-size: 12px;
  color: var(--theme--foreground-subdued);
  margin-left: 4px;
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.top-bar-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 999px;
}

.badge-warning {
  background: color-mix(in srgb, #e9a100 15%, var(--theme--background));
  color: #e9a100;
}

.badge-success {
  background: color-mix(in srgb, #34d399 15%, var(--theme--background));
  color: #34d399;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: 0;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-cancel {
  background: var(--theme--background-subdued);
  color: var(--theme--foreground-normal);
}
.btn-cancel:hover { background: var(--theme--border-subdued); }

.btn-proceed {
  background: var(--theme--primary);
  color: var(--theme--primary-foreground, #fff);
}
.btn-proceed:hover { opacity: 0.9; }

.btn-warning {
  background: #c47e00;
  color: #fff;
}

/* ── Loading / Error ──────────────────────────── */
.loading-fullscreen,
.error-fullscreen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-content,
.error-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  max-width: 400px;
}

.loading-spinner { font-size: 36px; }

.loading-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.loading-sub {
  margin: 0;
  font-size: 14px;
  color: var(--theme--foreground-subdued);
  line-height: 1.6;
}

.error-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: color-mix(in srgb, #d65f36 12%, transparent);
  color: #d65f36;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.error-content h2 { margin: 0; font-size: 18px; }
.error-content p { margin: 0; font-size: 14px; color: var(--theme--foreground-subdued); }

/* ── Main layout: sidebar + panel ─────────────── */
.main-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Sidebar ──────────────────────────────────── */
.sidebar {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  overflow-y: auto;
  border-right: 1px solid var(--theme--border-subdued);
  background: var(--theme--background);
}

.sidebar-status {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  margin-bottom: 8px;
}

.status-warning {
  background: color-mix(in srgb, #e9a100 10%, var(--theme--background));
  border: 1px solid color-mix(in srgb, #e9a100 25%, var(--theme--background));
}

.status-safe {
  background: color-mix(in srgb, #34d399 10%, var(--theme--background));
  border: 1px solid color-mix(in srgb, #34d399 25%, var(--theme--background));
}

.status-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
.status-warning .status-icon { color: #e9a100; }
.status-safe .status-icon { color: #34d399; }

.status-body { display: flex; flex-direction: column; gap: 2px; }
.status-title { font-size: 13px; font-weight: 700; }
.status-sub { font-size: 11px; color: var(--theme--foreground-subdued); line-height: 1.4; }

.sidebar-section {
  padding: 12px 0;
}

.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--theme--foreground-subdued);
  margin-bottom: 10px;
  padding: 0 4px;
}

/* Mini stats */
.stats-column { display: flex; flex-direction: column; gap: 6px; }

.mini-stat {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  transition: background 0.12s;
}
.mini-stat:hover { background: var(--theme--background-subdued); }

.mini-stat-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.msi-primary { background: color-mix(in srgb, var(--theme--primary) 12%, transparent); color: var(--theme--primary); }
.msi-accent  { background: color-mix(in srgb, #1a9952 12%, transparent); color: #1a9952; }
.msi-info    { background: color-mix(in srgb, #2f6fed 12%, transparent); color: #2f6fed; }
.msi-scope   { background: color-mix(in srgb, #8b5cf6 12%, transparent); color: #8b5cf6; }

.mini-stat-body { display: flex; flex-direction: column; gap: 1px; }
.mini-stat-value { font-size: 14px; font-weight: 700; }
.mini-stat-label { font-size: 11px; color: var(--theme--foreground-subdued); }

/* Severity chips */
.severity-row { display: flex; gap: 6px; flex-wrap: wrap; }

.severity-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
}

.sev-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex-shrink: 0;
}

.sev-high { background: color-mix(in srgb, #ef7b5b 15%, var(--theme--background)); color: #ef7b5b; }
.sev-high .sev-dot { background: #ef7b5b; }
.sev-medium { background: color-mix(in srgb, #e9a100 15%, var(--theme--background)); color: #e9a100; }
.sev-medium .sev-dot { background: #e9a100; }
.sev-low { background: color-mix(in srgb, #5b9cff 15%, var(--theme--background)); color: #5b9cff; }
.sev-low .sev-dot { background: #5b9cff; }

/* Category nav */
.category-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cat-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--theme--foreground-normal);
  cursor: pointer;
  transition: all 0.12s;
  text-align: left;
  font-size: 13px;
  width: 100%;
}
.cat-nav-item:hover { background: var(--theme--background-subdued); }
.cat-nav-item.active {
  background: color-mix(in srgb, var(--theme--primary) 10%, transparent);
  color: var(--theme--primary);
  font-weight: 600;
}

.cat-nav-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cat-all { background: var(--theme--background-subdued); color: var(--theme--foreground-subdued); }
.cat-icon-danger  { background: color-mix(in srgb, #ef7b5b 18%, var(--theme--background)); color: #ef7b5b; }
.cat-icon-warning { background: color-mix(in srgb, #e9a100 18%, var(--theme--background)); color: #e9a100; }
.cat-icon-info    { background: color-mix(in srgb, #5b9cff 18%, var(--theme--background)); color: #5b9cff; }

.cat-nav-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.cat-nav-count {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--theme--background-subdued);
  color: var(--theme--foreground-subdued);
}

.cat-count-danger  { background: color-mix(in srgb, #ef7b5b 18%, var(--theme--background)); color: #ef7b5b; }
.cat-count-warning { background: color-mix(in srgb, #e9a100 18%, var(--theme--background)); color: #e9a100; }
.cat-count-info    { background: color-mix(in srgb, #5b9cff 18%, var(--theme--background)); color: #5b9cff; }

/* Scope buttons */
.scope-btns { display: flex; gap: 4px; }

.scope-btn {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--theme--border-subdued);
  border-radius: 8px;
  background: transparent;
  color: var(--theme--foreground-subdued);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
  text-align: center;
}
.scope-btn:hover { background: var(--theme--background-subdued); }
.scope-btn.active {
  background: color-mix(in srgb, var(--theme--primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--theme--primary) 30%, transparent);
  color: var(--theme--primary);
}

/* ── Main panel ───────────────────────────────── */
.main-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--theme--border-subdued);
  flex-shrink: 0;
  background: var(--theme--background);
}

.view-tabs { display: flex; gap: 2px; }

.view-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme--foreground-subdued);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}
.view-tab:hover { background: var(--theme--background-subdued); color: var(--theme--foreground-normal); }
.view-tab.active { background: color-mix(in srgb, var(--theme--primary) 10%, transparent); color: var(--theme--primary); }

.tab-count {
  font-size: 10px;
  background: var(--theme--primary);
  color: var(--theme--primary-foreground, #fff);
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 700;
}

.view-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-summary {
  font-size: 12px;
  color: var(--theme--foreground-subdued);
}

.mini-btn {
  padding: 4px 10px;
  border: 1px solid var(--theme--border-subdued);
  border-radius: 6px;
  background: transparent;
  color: var(--theme--foreground-subdued);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}
.mini-btn:hover { background: var(--theme--background-subdued); color: var(--theme--foreground-normal); }

/* ── Tab content ──────────────────────────────── */
.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--theme--background-subdued, var(--theme--background));
}

/* ── Panels ───────────────────────────────────── */
.panel {
  border: 1px solid var(--theme--border-subdued);
  border-radius: 14px;
  background: var(--theme--background);
  overflow: hidden;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--theme--foreground-normal) 6%, transparent);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--theme--border-subdued);
  background: color-mix(in srgb, var(--theme--foreground-normal) 3%, var(--theme--background));
}

.panel-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-meta {
  font-size: 12px;
  color: var(--theme--foreground-subdued);
}

.panel-body { padding: 18px 20px; }
.panel-body-flush { position: relative; }
.panel-body-scrollable {
  padding: 18px 20px;
  max-height: 360px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--theme--border-subdued) transparent;
}
.panel-body-flush { padding: 0; }

/* ── Horizontal bar chart ─────────────────────── */
.hbar-list { display: flex; flex-direction: column; gap: 8px; }

.hbar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;
  width: 100%;
  text-align: left;
  color: inherit;
}
.hbar-row:hover { background: var(--theme--background-subdued); }

.hbar-label {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 160px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
}

.hbar-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-danger  { background: color-mix(in srgb, #ef7b5b 18%, var(--theme--background)); color: #ef7b5b; }
.icon-warning { background: color-mix(in srgb, #e9a100 18%, var(--theme--background)); color: #e9a100; }
.icon-info    { background: color-mix(in srgb, #5b9cff 18%, var(--theme--background)); color: #5b9cff; }

.hbar-bar-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.hbar-track {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme--foreground-normal) 8%, var(--theme--background));
  overflow: hidden;
}

.hbar-fill {
  height: 100%;
  border-radius: inherit;
  min-width: 6px;
  transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fill-danger  { background: linear-gradient(90deg, #ef7b5b, #ffb088); }
.fill-warning { background: linear-gradient(90deg, #e9a100, #ffd166); }
.fill-info    { background: linear-gradient(90deg, #5b9cff, #93c5fd); }

.hbar-value {
  font-size: 13px;
  font-weight: 700;
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.count-danger  { color: #ef7b5b; }
.count-warning { color: #e9a100; }
.count-info    { color: #5b9cff; }

/* ── Diagram ──────────────────────────────────── */
.diagram-container {
  overflow: auto;
  max-height: 460px;
  padding: 12px 0;
  background: color-mix(in srgb, var(--theme--foreground-normal) 4%, var(--theme--background));
  border: 1px solid var(--theme--border-subdued);
  border-left: 0;
  border-right: 0;
  cursor: grab;
  user-select: none;
  scrollbar-width: thin;
  scrollbar-color: var(--theme--border-subdued) transparent;
}

.impact-diagram {
  display: block;
  margin: 0 auto;
}

/* Zoom / pan toolbar overlaid on the diagram */
.diagram-toolbar {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: var(--theme--background);
  border: 1px solid var(--theme--border-subdued);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--theme--foreground-normal) 12%, transparent);
}

.dg-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--theme--foreground-subdued);
  cursor: pointer;
  transition: all 0.12s;
}
.dg-btn:hover:not(:disabled) {
  background: var(--theme--background-subdued);
  color: var(--theme--foreground-normal);
}
.dg-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.dg-zoom {
  min-width: 40px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--theme--foreground-normal);
  font-variant-numeric: tabular-nums;
}

.diagram-link {
  fill: none;
  stroke-linecap: round;
  opacity: 0.7;
  transition: opacity 0.2s;
}
.diagram-link:hover { opacity: 1; }

.link-danger  { stroke: #ef7b5b; }
.link-warning { stroke: #e9a100; }
.link-info    { stroke: #5b9cff; }

.source-node rect {
  fill: var(--theme--primary);
  rx: 16;
}
.source-node .node-text { fill: var(--theme--primary-foreground, #fff) !important; }
.source-node .node-sub { fill: color-mix(in srgb, var(--theme--primary-foreground, #fff) 70%, transparent) !important; }

/* Solid fills so the forced-white node labels stay readable in every theme */
.cat-rect-danger  { fill: #b23c22; stroke: #ef7b5b; stroke-width: 1.5; }
.cat-rect-warning { fill: #8a6510; stroke: #e9a100; stroke-width: 1.5; }
.cat-rect-info    { fill: #2b62c9; stroke: #5b9cff; stroke-width: 1.5; }

.owner-direct  { fill: #2b62c9; stroke: #5b9cff; stroke-width: 1.5; }
.owner-related { fill: #8a6510; stroke: #e9a100; stroke-width: 1.5; }

/* Force readable text inside SVG regardless of theme.
   Category/owner nodes have coloured fills so text must always be
   high contrast. We also use explicit inline styles now, but keep this
   as a safety fallback. */
.node-text {
  fill: #ffffff !important;
  font-size: 13px;
  font-weight: 700;
  paint-order: stroke;
  stroke: rgba(0,0,0,0.3) !important;
  stroke-width: 2.5px;
  stroke-linejoin: round;
}
.node-text-sm { font-size: 12px; }
.node-sub {
  fill: rgba(255,255,255,0.85) !important;
  font-size: 11px;
  font-weight: 400;
  paint-order: stroke;
  stroke: rgba(0,0,0,0.2) !important;
  stroke-width: 2px;
  stroke-linejoin: round;
}

.diagram-legend {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  padding: 12px 20px;
  border-top: 1px solid var(--theme--border-subdued);
  color: var(--theme--foreground-subdued);
  font-size: 12px;
}

.legend-item { display: flex; align-items: center; gap: 6px; }

.ldot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex-shrink: 0;
  display: inline-block;
}

.ldot-danger  { background: #ef7b5b; }
.ldot-warning { background: #e9a100; }
.ldot-info    { background: #5b9cff; }

/* ── Empty states ─────────────────────────────── */
.empty-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 64px 24px;
  gap: 12px;
}

.empty-hero-icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: color-mix(in srgb, #1a9952 10%, transparent);
  color: #1a9952;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  margin-bottom: 8px;
}

.empty-hero h2 { margin: 0; font-size: 22px; font-weight: 700; }
.empty-hero p { margin: 0; font-size: 14px; color: var(--theme--foreground-subdued); max-width: 420px; line-height: 1.6; }

.empty-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px;
  gap: 8px;
}

.empty-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--theme--background-subdued);
  border: 1px solid var(--theme--border-subdued);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--theme--foreground-subdued);
  font-size: 22px;
  margin-bottom: 4px;
}

.empty-results h3 { margin: 0; font-size: 15px; font-weight: 700; }
.empty-results p { margin: 0; font-size: 13px; color: var(--theme--foreground-subdued); }

/* ── Owner cards ──────────────────────────────── */
.owners-list { display: flex; flex-direction: column; gap: 8px; }

.owner-card {
  border: 1px solid var(--theme--border-subdued);
  border-radius: 14px;
  background: var(--theme--background);
  overflow: hidden;
  transition: border-color 0.12s;
}
.owner-card.expanded { border-color: color-mix(in srgb, var(--theme--primary) 35%, transparent); }

.owner-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background 0.12s;
  gap: 12px;
}
.owner-header:hover { background: var(--theme--background-subdued); }

.owner-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.owner-avatar {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--theme--primary) 12%, transparent);
  color: var(--theme--primary);
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.owner-header-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.owner-name { font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.owner-sub { font-size: 11px; color: var(--theme--foreground-subdued); }

.owner-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.category-pills { display: flex; gap: 4px; flex-wrap: wrap; }

.cpill {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  text-transform: capitalize;
}

.cpill-danger  { background: color-mix(in srgb, #ef7b5b 18%, var(--theme--background)); color: #ef7b5b; }
.cpill-warning { background: color-mix(in srgb, #e9a100 18%, var(--theme--background)); color: #e9a100; }
.cpill-info    { background: color-mix(in srgb, #5b9cff 18%, var(--theme--background)); color: #5b9cff; }

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: max-height 0.28s ease, opacity 0.22s ease;
  overflow: hidden;
  max-height: 3000px;
}
.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}

.dep-list-wrap {
  border-top: 1px solid var(--theme--border-subdued);
}

.dep-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px;
  padding: 14px 16px;
}

.dep-card {
  padding: 14px;
  border-radius: 12px;
  background: var(--theme--background-subdued);
  border: 1px solid var(--theme--border-subdued);
  border-left: 3px solid;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dep-border-danger  { border-left-color: #ef7b5b; }
.dep-border-warning { border-left-color: #e9a100; }
.dep-border-info    { border-left-color: #5b9cff; }

.dep-chips { display: flex; gap: 5px; flex-wrap: wrap; }

.dchip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  text-transform: capitalize;
}

.dchip-danger   { background: color-mix(in srgb, #ef7b5b 18%, var(--theme--background)); color: #ef7b5b; }
.dchip-warning  { background: color-mix(in srgb, #e9a100 18%, var(--theme--background)); color: #e9a100; }
.dchip-info     { background: color-mix(in srgb, #5b9cff 18%, var(--theme--background)); color: #5b9cff; }
.dchip-outline  { background: color-mix(in srgb, var(--theme--foreground-normal) 5%, var(--theme--background)); border: 1px solid var(--theme--border-subdued); color: var(--theme--foreground-subdued); }

.dchip-sev-danger  { background: color-mix(in srgb, #ef7b5b 15%, var(--theme--background)); color: #ef7b5b; }
.dchip-sev-warning { background: color-mix(in srgb, #e9a100 15%, var(--theme--background)); color: #e9a100; }
.dchip-sev-info    { background: color-mix(in srgb, #5b9cff 15%, var(--theme--background)); color: #5b9cff; }

.dep-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.dep-values {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dval {
  font-family: var(--theme--fonts--monospace--font-family, monospace);
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dval-old { background: color-mix(in srgb, #ef7b5b 15%, var(--theme--background)); color: #ef7b5b; }
.dval-new { background: color-mix(in srgb, #5b9cff 15%, var(--theme--background)); color: #5b9cff; }
.dval-arrow { color: var(--theme--foreground-subdued); font-size: 14px; }

.dep-meta,
.dep-related {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--theme--foreground-subdued);
}

/* ── Responsive ───────────────────────────────── */
@media (max-width: 860px) {
  .sidebar { display: none; }

  .top-bar-rename .rename-context { display: none; }

  .hbar-label { width: 120px; }
}

@media (max-width: 580px) {
  .top-bar { padding: 0 14px; }
  .tab-content { padding: 16px; }
  .view-header { padding: 8px 14px; }
  .view-actions .filter-summary { display: none; }

  .dep-grid { grid-template-columns: 1fr; }
}
</style>
