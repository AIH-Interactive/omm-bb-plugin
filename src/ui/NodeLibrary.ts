import type { NodeDefinition } from "../nodes/registry.ts";
import { CONTROL_LIBRARY, type WorkspaceController } from "./workspace-controller.ts";

interface LibraryVm {
  controller: WorkspaceController;
  query: string;
  tab: "nodes" | "controls";
  collapsed: Record<string, boolean>;
  $emit(event: string, ...args: unknown[]): void;
}

/** Node and control library; items can be dragged onto the canvas or added with Enter/click. */
export function createNodeLibrary(controller: WorkspaceController): object {
  return {
    name: "omm-node-library",
    data() {
      return { controller, query: "", tab: "nodes", collapsed: {}, controlLibrary: CONTROL_LIBRARY };
    },
    computed: {
      groups(this: LibraryVm): { category: string; items: NodeDefinition[] }[] {
        const groups = new Map<string, NodeDefinition[]>();
        for (const definition of this.controller.registry.search(this.query)) {
          const items = groups.get(definition.category) ?? [];
          items.push(definition);
          groups.set(definition.category, items);
        }
        return [...groups].map(([category, items]) => ({ category, items }));
      },
    },
    methods: {
      dragNode(event: DragEvent, type: string) {
        event.dataTransfer?.setData("application/x-omm-node", type);
      },
      dragControl(event: DragEvent, type: string) {
        event.dataTransfer?.setData("application/x-omm-control", type);
      },
      insertNode(this: LibraryVm, type: string) {
        this.$emit("insert-node", type);
      },
      insertControl(this: LibraryVm, type: string) {
        this.$emit("insert-control", type);
      },
      insertFirstMatch(this: LibraryVm & { groups: { items: NodeDefinition[] }[] }) {
        const first = this.groups[0]?.items[0];
        if (first !== undefined) {
          this.$emit("insert-node", first.type);
        }
      },
      toggle(this: LibraryVm, category: string) {
        this.collapsed = { ...this.collapsed, [category]: !this.collapsed[category] };
      },
    },
    template: `
<div class="omm-library">
  <div class="omm-tabs">
    <button type="button" :class="{ active: tab === 'nodes' }" @click="tab = 'nodes'">节点库</button>
    <button type="button" :class="{ active: tab === 'controls' }" @click="tab = 'controls'">控件库</button>
  </div>
  <template v-if="tab === 'nodes'">
    <input class="omm-input" type="search" v-model="query" placeholder="搜索节点 / Lua 名称" @keydown.enter="insertFirstMatch">
    <div v-for="group in groups" :key="group.category" class="omm-library__group">
      <div class="omm-library__category" @click="toggle(group.category)">{{ collapsed[group.category] ? '›' : '⌄' }}  {{ group.category }}</div>
      <template v-if="!collapsed[group.category]">
        <div v-for="item in group.items" :key="item.type" class="omm-library__item" tabindex="0" draggable="true"
             :title="item.luaName || item.type" @dragstart="dragNode($event, item.type)"
             @dblclick="insertNode(item.type)" @keydown.enter="insertNode(item.type)">{{ item.title }}</div>
      </template>
    </div>
    <div v-if="groups.length === 0" class="omm-muted">没有匹配的节点</div>
  </template>
  <template v-else>
    <div v-for="item in controlLibrary" :key="item.type" class="omm-library__item" tabindex="0" draggable="true"
         @dragstart="dragControl($event, item.type)" @dblclick="insertControl(item.type)"
         @keydown.enter="insertControl(item.type)">{{ item.title }}</div>
    <div class="omm-muted omm-hint">拖入画布或双击添加控件，会同时生成默认节点。</div>
  </template>
</div>`,
  };
}
