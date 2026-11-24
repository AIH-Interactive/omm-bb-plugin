/*
 * Uses the host theme tokens so dark, light and high-contrast themes work.
 * Sizes follow docs/ui-prototype.md: left 256 px, right 320 px, toolbar 44 px.
 */
export const WORKFLOW_WORKSPACE_STYLE = `
.omm-workflow { display: flex; flex-direction: column; height: 100%; color: var(--color-text); background: var(--color-back); }
.omm-workflow button:disabled { opacity: 0.5; cursor: default; }
.omm-workflow__toolbar { display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 8px; background: var(--color-ui); border-bottom: 1px solid var(--color-border); }
.omm-workflow__toolbar .spacer { flex: 1; }
.omm-separator { width: 1px; height: 24px; background: var(--color-border); }
.omm-workflow__error { padding: 4px 8px; color: var(--color-text); background: var(--color-close); cursor: pointer; }
.omm-workflow__body { display: flex; flex: 1; min-height: 0; }
.omm-workflow__side { padding: 8px; background: var(--color-ui); overflow-y: auto; }
.omm-workflow__side--left { width: 256px; border-right: 1px solid var(--color-border); }
.omm-workflow__side--right { width: 320px; border-left: 1px solid var(--color-border); }
.omm-workflow__footer { display: flex; justify-content: space-between; padding: 2px 8px; background: var(--color-ui); border-top: 1px solid var(--color-border); }
.omm-muted { color: var(--color-subtle_text); }
.omm-hint { margin: 6px 0; font-size: 0.9em; }
.omm-diagnostic { color: var(--color-close); margin: 4px 0; }
.omm-tabs { display: flex; gap: 2px; margin-bottom: 8px; border-bottom: 1px solid var(--color-border); }
.omm-tabs button { background: none; border: none; padding: 4px 10px; color: var(--color-subtle_text); }
.omm-tabs button.active { color: var(--color-text); box-shadow: inset 0 -2px var(--color-accent); }
.omm-input { width: 100%; box-sizing: border-box; background: var(--color-back); color: var(--color-text); border: 1px solid var(--color-border); padding: 3px 6px; }
.omm-input.invalid { border-color: var(--color-close); }
.omm-input:focus, .omm-library__item:focus, .omm-bone:focus { outline: 1px solid var(--color-accent); }
.omm-section-title { margin: 0 0 8px; font-size: 1.1em; }
.omm-subtitle { margin: 10px 0 4px; font-weight: bold; }
.omm-field { display: flex; flex-direction: column; gap: 2px; margin: 6px 0; }
.omm-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
.omm-link-button { background: none; border: none; color: var(--color-accent); padding: 2px 0; }
.omm-icon-button { background: none; border: none; color: var(--color-subtle_text); width: 24px; }
.omm-port-row { display: grid; grid-template-columns: 1fr 96px 24px; gap: 4px; margin: 2px 0; }
.omm-code { width: 100%; box-sizing: border-box; font-family: var(--font-code, monospace); tab-size: 4; white-space: pre; background: var(--color-dark); color: var(--color-text); border: 1px solid var(--color-border); padding: 6px; }
.omm-node-id { margin-top: 12px; font-size: 0.85em; word-break: break-all; }
.omm-library__category { padding: 4px 2px; cursor: pointer; color: var(--color-subtle_text); }
.omm-library__item { padding: 4px 8px 4px 18px; cursor: grab; border-radius: 4px; }
.omm-library__item:hover { background: var(--color-selected); }
.omm-canvas { position: relative; flex: 1; overflow: hidden; background: var(--color-back); outline: none; cursor: default; }
.omm-canvas__layer { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
.omm-canvas__edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.omm-edge { fill: none; stroke-width: 2.5; stroke-linecap: round; pointer-events: stroke; }
.omm-edge--flow { stroke: var(--color-text); }
.omm-edge--data { stroke: var(--color-accent); }
.omm-edge--error { stroke: var(--color-close); stroke-dasharray: 6 4; }
.omm-edge--pending { stroke: var(--color-accent); stroke-dasharray: 4 4; pointer-events: none; }
.omm-node { position: absolute; width: 200px; box-sizing: border-box; background: var(--color-ui); border: 1px solid var(--color-border); border-radius: 10px; }
.omm-node--selected { border-color: var(--color-accent); box-shadow: 0 0 0 1px var(--color-accent); }
.omm-node--unknown { border-style: dashed; border-color: var(--color-close); }
.omm-node__header { height: 30px; line-height: 30px; padding: 0 10px; border-radius: 10px 10px 0 0; background: var(--color-elevated, var(--color-dark)); cursor: move; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.omm-port { position: absolute; display: flex; align-items: center; gap: 6px; height: 24px; font-size: 0.9em; white-space: nowrap; }
.omm-port--input { left: -6px; }
.omm-port--output { right: -6px; cursor: crosshair; }
.omm-port__dot { width: 11px; height: 11px; box-sizing: border-box; border: 2px solid var(--color-ui); }
.omm-port__dot--data { border-radius: 50%; background: var(--color-accent); }
.omm-port__dot--flow { border-radius: 3px; background: var(--color-text); }
.omm-port__label { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.omm-canvas__empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; pointer-events: none; }
.omm-canvas__empty-title { font-size: 1.2em; }
.omm-canvas__zoom { position: absolute; right: 8px; bottom: 6px; color: var(--color-subtle_text); }
.omm-control { padding: 6px; border-radius: 6px; cursor: pointer; }
.omm-control--selected { box-shadow: inset 0 0 0 1px var(--color-accent); }
.omm-control__widget { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.omm-swatch { width: 18px; height: 18px; flex: none; border: 1px solid var(--color-border); border-radius: 3px; }
.omm-event-log { max-height: 120px; overflow-y: auto; font-family: var(--font-code, monospace); font-size: 0.9em; }
.omm-bone-tree { max-height: 220px; overflow-y: auto; }
.omm-bone { padding: 2px 4px; cursor: pointer; border-radius: 3px; }
.omm-dialog-backdrop { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45); }
.omm-dialog { width: min(960px, 90%); max-height: 85%; overflow-y: auto; padding: 16px; background: var(--color-ui); border: 1px solid var(--color-border); border-radius: 8px; }
.omm-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.omm-compare .omm-code { max-height: 300px; overflow: auto; margin: 0; }
.omm-pending { margin: 8px 0; }
.omm-lua-preview { width: 360px; border-left: 1px solid var(--color-border); }
.omm-lua-preview .omm-code { margin: 0; min-height: 200px; }
.omm-workflow { position: relative; }
.omm-workflow__toolbar button.active { box-shadow: inset 0 -2px var(--color-accent); }
.omm-bone--bound { background: var(--color-selected); color: var(--color-accent); }
`;
