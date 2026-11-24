import type { ControlDefinition, LuaLiteral } from "./schema.ts";

/*
 * Editor-side simulation of OMM avatar controls. Value rules follow
 * AvatarControlDefinition.normalizeValue (numbers clamp to min..max) and
 * AvatarControlsScreen (hex colors with optional '#', NUMBER text parsed as
 * double, BUTTON with targetPage only navigates).
 */

export type ValueCheck =
  | { readonly ok: true; readonly value: LuaLiteral }
  | { readonly ok: false; readonly message: string };

export type ControlEvent =
  | { readonly kind: "changed"; readonly controlId: string; readonly value: LuaLiteral }
  | { readonly kind: "pressed"; readonly controlId: string }
  | { readonly kind: "pageChanged"; readonly page: string };

const HEX_COLOR = /^#?[0-9a-fA-F]{1,8}$/;

function clamp(control: ControlDefinition, value: number): number {
  const min = control.min ?? Number.NEGATIVE_INFINITY;
  const max = control.max ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, value));
}

/** Slider positions snap to `min + k * step`; NUMBER inputs keep the typed value. */
function snapToStep(control: ControlDefinition, value: number): number {
  const step = control.step ?? 0.05;
  const origin = control.min ?? 0;
  const snapped = origin + Math.round((value - origin) / step) * step;
  // Remove binary noise such as 0.30000000000000004.
  return Number(snapped.toFixed(10));
}

/** Validates raw UI input; invalid input never becomes the control value. */
export function checkControlValue(control: ControlDefinition, raw: unknown): ValueCheck {
  switch (control.type) {
    case "TOGGLE":
      return typeof raw === "boolean"
        ? { ok: true, value: raw }
        : { ok: false, message: "开关只接受布尔值。" };

    case "SLIDER":
    case "NUMBER": {
      const number = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof number !== "number" || !Number.isFinite(number)) {
        return { ok: false, message: "请输入有效数字。" };
      }
      const clamped = clamp(control, number);
      const value = control.type === "SLIDER" ? clamp(control, snapToStep(control, clamped)) : clamped;
      return { ok: true, value };
    }

    case "ENUM": {
      const optionId = String(raw);
      const known = (control.options ?? []).some((option) => option.id === optionId);
      return known ? { ok: true, value: optionId } : { ok: false, message: `未知选项：${optionId}` };
    }

    case "COLOR":
      return typeof raw === "string" && HEX_COLOR.test(raw.trim())
        ? { ok: true, value: raw.trim() }
        : { ok: false, message: "颜色格式应为十六进制，如 #FF8800。" };

    case "TEXT":
    case "KEYBIND":
      return typeof raw === "string"
        ? { ok: true, value: raw }
        : { ok: false, message: "只接受文本。" };

    case "BUTTON":
    case "LABEL":
    case "SEPARATOR":
      return { ok: false, message: "此控件没有可设置的值。" };
  }
}

export function hasValue(control: ControlDefinition): boolean {
  return control.type !== "BUTTON" && control.type !== "LABEL" && control.type !== "SEPARATOR";
}

/** Preview-session state; never persisted with the workflow. */
export class ControlSimulation {
  private readonly values = new Map<string, LuaLiteral>();
  private readonly fieldErrors = new Map<string, string>();
  private readonly listeners = new Set<(event: ControlEvent) => void>();
  readonly eventLog: ControlEvent[] = [];
  page: string;

  constructor(initialPage = "main") {
    this.page = initialPage;
  }

  onEvent(listener: (event: ControlEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  valueOf(control: ControlDefinition): LuaLiteral {
    return this.values.has(control.controlId)
      ? (this.values.get(control.controlId) as LuaLiteral)
      : control.defaultValue;
  }

  errorOf(controlId: string): string | undefined {
    return this.fieldErrors.get(controlId);
  }

  /**
   * Returns whether the input was accepted. Only accepted values that
   * actually differ from the current value emit `changed`.
   */
  setValue(control: ControlDefinition, raw: unknown): boolean {
    const check = checkControlValue(control, raw);
    if (!check.ok) {
      this.fieldErrors.set(control.controlId, check.message);
      return false;
    }

    this.fieldErrors.delete(control.controlId);
    if (check.value === this.valueOf(control)) {
      return true;
    }

    this.values.set(control.controlId, check.value);
    this.emit({ kind: "changed", controlId: control.controlId, value: check.value });
    return true;
  }

  press(control: ControlDefinition): void {
    if (control.type !== "BUTTON") {
      return;
    }
    if (control.targetPage !== undefined) {
      this.page = control.targetPage;
      this.emit({ kind: "pageChanged", page: control.targetPage });
      return;
    }
    this.emit({ kind: "pressed", controlId: control.controlId });
  }

  reset(control: ControlDefinition): void {
    if (!hasValue(control)) {
      return;
    }
    this.fieldErrors.delete(control.controlId);
    const before = this.valueOf(control);
    this.values.delete(control.controlId);
    if (before !== control.defaultValue) {
      this.emit({ kind: "changed", controlId: control.controlId, value: control.defaultValue });
    }
  }

  resetAll(controls: readonly ControlDefinition[]): void {
    for (const control of controls) {
      this.reset(control);
    }
  }

  isModified(control: ControlDefinition): boolean {
    return hasValue(control) && this.valueOf(control) !== control.defaultValue;
  }

  private emit(event: ControlEvent): void {
    this.eventLog.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
