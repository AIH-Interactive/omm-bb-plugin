import type { BoneInfo } from "../blockbench/bone-tree.ts";
import type { AnimationPlayback } from "../blockbench/host.ts";
import { DEFAULT_TRAIL_LENGTH } from "../workflow/trail-preview.ts";
import type { WorkspaceController } from "./workspace-controller.ts";

interface PreviewVm {
  controller: WorkspaceController;
  playback: AnimationPlayback;
  view: WorkspaceController["view"];
  trail: WorkspaceController["trail"]["state"];
}

/**
 * Current project's read-only bone tree, native timeline controls and the
 * bone trail sampled after each native animation frame.
 */
export function createModelPreviewPanel(controller: WorkspaceController, playback: AnimationPlayback): object {
  return {
    name: "omm-model-preview",
    data() {
      return {
        controller,
        playback,
        view: controller.view,
        trail: controller.trail.state,
        trailLength: DEFAULT_TRAIL_LENGTH,
      };
    },
    computed: {
      depthOf(this: PreviewVm) {
        const depths = new Map<string, number>();
        for (const bone of this.view.boneTree?.bones ?? []) {
          depths.set(bone.uuid, bone.parentUuid === null ? 0 : (depths.get(bone.parentUuid) ?? 0) + 1);
        }
        return depths;
      },
    },
    methods: {
      bind(this: PreviewVm, bone: BoneInfo) {
        this.controller.bindBone(bone);
      },
      isBound(this: PreviewVm, bone: BoneInfo): boolean {
        return this.trail.boneRef?.uuid === bone.uuid;
      },
      selectAnimation(this: PreviewVm, uuid: string) {
        this.playback.selectAnimation(uuid);
        this.controller.refreshHost();
      },
      togglePlay(this: PreviewVm) {
        if (this.playback.isPlaying()) {
          this.playback.pause();
        } else {
          this.playback.play();
        }
        this.controller.refreshHost();
      },
      rewind(this: PreviewVm) {
        this.playback.seek(0);
      },
      openViewport(this: PreviewVm) {
        this.playback.showNativeAnimationViewport();
      },
      refresh(this: PreviewVm) {
        this.controller.refreshHost();
      },
    },
    template: `
<div class="omm-preview">
  <div class="omm-subtitle">当前模型骨骼树</div>
  <div v-if="!view.boneTree || view.boneTree.bones.length === 0" class="omm-muted">当前工程没有骨骼。</div>
  <div v-else class="omm-bone-tree">
    <div v-for="bone in view.boneTree.bones" :key="bone.uuid" tabindex="0"
         :class="['omm-bone', { 'omm-bone--bound': isBound(bone) }]" :style="{ paddingLeft: (8 + depthOf.get(bone.uuid) * 14) + 'px' }"
         :title="'UUID ' + bone.uuid" @click="bind(bone)" @keydown.enter="bind(bone)">{{ bone.name }}</div>
  </div>
  <div class="omm-muted omm-hint">点击骨骼绑定拖尾采样。</div>

  <div class="omm-subtitle">模型动画预览</div>
  <label class="omm-field">动画片段
    <select class="omm-input" :value="view.selectedAnimationId" @change="selectAnimation($event.target.value)">
      <option v-for="animation in view.animations" :key="animation.uuid" :value="animation.uuid">{{ animation.name }}</option>
    </select>
  </label>
  <div class="omm-actions">
    <button type="button" :disabled="!view.selectedAnimationId" @click="togglePlay">{{ view.playing ? 'Ⅱ 暂停' : '▶ 播放' }}</button>
    <button type="button" @click="rewind">回到起点</button>
    <button type="button" @click="openViewport">在原生动画视口中查看</button>
    <button type="button" @click="refresh">刷新绑定</button>
  </div>
  <div v-if="trail.boneRef">拖尾：{{ trail.points.length }} / {{ trailLength }} 个采样点 · {{ trail.boneRef.name }}</div>
  <div v-if="trail.diagnostic" class="omm-diagnostic">{{ trail.diagnostic }}</div>
  <div class="omm-muted omm-hint">数据来自当前项目骨骼与动画求值后的世界变换。</div>
</div>`,
  };
}
