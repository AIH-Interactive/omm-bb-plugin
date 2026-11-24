import { hasValue } from "../workflow/controls.ts";
import type { ControlDefinition, ControlType } from "../workflow/schema.ts";
import type { WorkspaceController } from "./workspace-controller.ts";

interface PanelVm {
  controller: WorkspaceController;
  view: WorkspaceController["view"];
  capturing: string | null;
  selected: ControlDefinition | null;
}

const TYPE_TITLES: Record<ControlType, string> = {
  TOGGLE: "开关",
  SLIDER: "滑块",
  NUMBER: "数值",
  ENUM: "枚举",
  COLOR: "颜色",
  TEXT: "文本",
  KEYBIND: "按键绑定",
  BUTTON: "按钮",
  LABEL: "标签",
  SEPARATOR: "分隔线",
};

function describeEvent(event: WorkspaceController["view"]["simulation"]["events"][number]): string {
  switch (event.kind) {
    case "changed":
      return `${event.controlId} → ${JSON.stringify(event.value)}`;
    case "pressed":
      return `${event.controlId} 按下`;
    case "pageChanged":
      return `切换到页面 ${event.page}`;
  }
}

/**
 * Simulated OMM control panel (preview session only, never written to the
 * model) plus the property editor of the selected control.
 */
export function createControlPanel(controller: WorkspaceController): object {
  return {
    name: "omm-control-panel",
    data() {
      return { controller, view: controller.view, capturing: null, typeTitles: TYPE_TITLES };
    },
    computed: {
      pages(this: PanelVm): string[] {
        return [...new Set(["main", ...this.view.controls.map((control) => control.page)])];
      },
      pageControls(this: PanelVm): ControlDefinition[] {
        const page = this.view.simulation.page;
        return this.view.controls.filter((control) => control.page === page);
      },
      selected(this: PanelVm): ControlDefinition | null {
        return this.view.controls.find((control) => control.controlId === this.view.selectedControlId) ?? null;
      },
      boundCount(this: PanelVm): number {
        return this.selected === null ? 0 : this.controller.boundNodeCount(this.selected.controlId);
      },
      eventLines(this: PanelVm): string[] {
        return this.view.simulation.events.map(describeEvent).reverse();
      },
    },
    methods: {
      valueOf(this: PanelVm, control: ControlDefinition): unknown {
        return this.view.simulation.values[control.controlId];
      },
      errorOf(this: PanelVm, control: ControlDefinition): string | undefined {
        return this.view.simulation.errors[control.controlId];
      },
      setValue(this: PanelVm, control: ControlDefinition, raw: unknown) {
        this.controller.simulation.setValue(control, raw);
        this.controller.refreshSimulation();
      },
      press(this: PanelVm, control: ControlDefinition) {
        this.controller.simulation.press(control);
        this.controller.refreshSimulation();
      },
      reset(this: PanelVm, control: ControlDefinition) {
        this.controller.simulation.reset(control);
        this.controller.refreshSimulation();
      },
      resetAll(this: PanelVm) {
        this.controller.simulation.resetAll(this.view.controls);
        this.controller.refreshSimulation();
      },
      setPage(this: PanelVm, page: string) {
        this.controller.simulation.page = page;
        this.controller.refreshSimulation();
      },
      canReset(control: ControlDefinition): boolean {
        return hasValue(control);
      },
      isModified(this: PanelVm, control: ControlDefinition): boolean {
        return this.controller.simulation.isModified(control);
      },
      startCapture(this: PanelVm, control: ControlDefinition) {
        this.capturing = control.controlId;
      },
      onCaptureKey(
        this: PanelVm & { setValue(control: ControlDefinition, raw: unknown): void },
        event: KeyboardEvent,
        control: ControlDefinition,
      ) {
        if (this.capturing !== control.controlId) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.capturing = null;
        if (event.key !== "Escape") {
          this.setValue(control, event.code);
        }
      },
      select(this: PanelVm, control: ControlDefinition) {
        this.view.selectedControlId = control.controlId;
      },
      update(this: PanelVm, field: keyof ControlDefinition, value: unknown) {
        if (this.selected !== null) {
          this.controller.updateControl(this.selected.controlId, { [field]: value } as Partial<ControlDefinition>);
        }
      },
      updateNumber(this: PanelVm, field: "min" | "max" | "step", raw: string) {
        const value = Number(raw);
        if (Number.isFinite(value)) {
          (this as unknown as { update(f: string, v: unknown): void }).update(field, value);
        }
      },
      updateOptions(this: PanelVm, raw: string) {
        // One option per line: "id=标题" or just "id".
        const options = raw
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== "")
          .map((line) => {
            const [id, title] = line.split("=");
            return { id: id!.trim(), title: (title ?? id!).trim() };
          });
        (this as unknown as { update(f: string, v: unknown): void }).update("options", options);
      },
      optionsText(control: ControlDefinition): string {
        return (control.options ?? []).map((option) => `${option.id}=${option.title}`).join("\n");
      },
      remove(this: PanelVm) {
        if (this.selected !== null) {
          this.controller.removeControl(this.selected.controlId);
        }
      },
    },
    template: `
<div class="omm-controls">
  <div class="omm-tabs">
    <button v-for="page in pages" :key="page" type="button" :class="{ active: page === view.simulation.page }" @click="setPage(page)">{{ page }}</button>
  </div>
  <div v-if="pageControls.length === 0" class="omm-muted">此页还没有控件，从控件库添加。</div>
  <div v-for="control in pageControls" :key="control.controlId"
       :class="['omm-control', { 'omm-control--selected': control.controlId === view.selectedControlId }]" @click="select(control)">
    <hr v-if="control.type === 'SEPARATOR'">
    <template v-else>
      <div class="omm-control__title">{{ control.title }} <span class="omm-muted">{{ control.controlId }}</span></div>
      <div class="omm-control__widget">
        <label v-if="control.type === 'TOGGLE'"><input type="checkbox" :checked="valueOf(control)" @change="setValue(control, $event.target.checked)"> {{ valueOf(control) ? '开启' : '关闭' }}</label>
        <template v-else-if="control.type === 'SLIDER'">
          <input type="range" :min="control.min" :max="control.max" :step="control.step" :value="valueOf(control)" @input="setValue(control, Number($event.target.value))">
          <span>{{ Number(valueOf(control)).toFixed(2) }} · {{ control.min }}–{{ control.max }}</span>
        </template>
        <select v-else-if="control.type === 'ENUM'" class="omm-input" :value="valueOf(control)" @change="setValue(control, $event.target.value)">
          <option v-for="option in control.options || []" :key="option.id" :value="option.id">{{ option.title }}</option>
        </select>
        <template v-else-if="control.type === 'COLOR'">
          <span class="omm-swatch" :style="{ background: errorOf(control) ? 'transparent' : '#' + String(valueOf(control)).replace('#', '') }"></span>
          <input class="omm-input" :value="valueOf(control)" @change="setValue(control, $event.target.value)">
        </template>
        <input v-else-if="control.type === 'TEXT'" class="omm-input" :value="valueOf(control)" @change="setValue(control, $event.target.value)">
        <input v-else-if="control.type === 'NUMBER'" class="omm-input" :value="valueOf(control)" @change="setValue(control, $event.target.value)">
        <button v-else-if="control.type === 'KEYBIND'" type="button" @click.stop="startCapture(control)" @keydown="onCaptureKey($event, control)">
          {{ capturing === control.controlId ? '按下任意键…（Esc 取消）' : (valueOf(control) || '未绑定') }}
        </button>
        <button v-else-if="control.type === 'BUTTON'" type="button" @click.stop="press(control)">{{ control.targetPage ? '打开 ' + control.targetPage + ' ›' : '运行' }}</button>
        <button v-if="canReset(control)" type="button" class="omm-link-button" :disabled="!isModified(control)" @click.stop="reset(control)">重置</button>
      </div>
      <div v-if="errorOf(control)" class="omm-diagnostic">{{ errorOf(control) }}</div>
    </template>
  </div>
  <div class="omm-actions"><button type="button" @click="resetAll">重置全部</button></div>
  <div class="omm-subtitle">模拟事件</div>
  <div class="omm-event-log">
    <div v-if="eventLines.length === 0" class="omm-muted">等待操作</div>
    <div v-for="(line, index) in eventLines" :key="index">{{ line }}</div>
  </div>
  <div class="omm-muted omm-hint">模拟操作不会写入模型文件。</div>

  <template v-if="selected">
    <div class="omm-subtitle">控件属性 · {{ typeTitles[selected.type] }}</div>
    <label class="omm-field">标题<input class="omm-input" :value="selected.title" @change="update('title', $event.target.value)"></label>
    <label class="omm-field">页面<input class="omm-input" :value="selected.page" @change="update('page', $event.target.value)"></label>
    <div class="omm-field">控件 ID<span class="omm-muted">{{ selected.controlId }}</span></div>
    <template v-if="selected.type === 'SLIDER' || selected.type === 'NUMBER'">
      <label class="omm-field">最小值<input class="omm-input" :value="selected.min" @change="updateNumber('min', $event.target.value)"></label>
      <label class="omm-field">最大值<input class="omm-input" :value="selected.max" @change="updateNumber('max', $event.target.value)"></label>
      <label class="omm-field">步长<input class="omm-input" :value="selected.step" @change="updateNumber('step', $event.target.value)"></label>
    </template>
    <label v-if="selected.type === 'ENUM'" class="omm-field">选项（每行 id=标题）
      <textarea class="omm-input" rows="3" :value="optionsText(selected)" @change="updateOptions($event.target.value)"></textarea>
    </label>
    <label v-if="selected.type === 'BUTTON'" class="omm-field">跳转页面（留空为普通按钮）
      <input class="omm-input" :value="selected.targetPage || ''" @change="update('targetPage', $event.target.value || undefined)">
    </label>
    <div class="omm-muted omm-hint">改名或换页后仍按控件 ID 绑定。</div>
    <div class="omm-actions">
      <button type="button" @click="remove">删除控件</button>
      <span v-if="boundCount > 0" class="omm-diagnostic">将同时删除 {{ boundCount }} 个绑定节点</span>
    </div>
  </template>
</div>`,
  };
}
