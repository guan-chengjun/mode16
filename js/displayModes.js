/**
 * displayModes.js —— 三种显示模式切换
 *
 * solid     实体着色：恢复模型原始材质
 * wireframe 透视线框：全部材质以线框方式渲染，可观察骨架结构
 * xray      半透明透视：降低不透明度并关闭深度写入，
 *           被遮挡的内部零件（发动机、离合、链条等）清晰可见
 *
 * 所有修改只作用于卡丁车自身的网格，地面与网格线不受影响。
 */
import * as THREE from 'three';

const MODES = ['solid', 'wireframe', 'xray'];

export class DisplayManager {
  constructor() {
    this.mode = 'solid';
    this.kartRoot = null;
    /** 保存每个网格的原始材质，切回实体模式时还原 */
    this.originalMaterials = new Map();
    /** 当前生效的克隆材质（线框/半透明用），切换或还原时需要 dispose */
    this.activeClones = new Set();
  }

  /** 切换当前卡丁车根节点（重新加载模型后调用） */
  setKart(root) {
    this.restore(); // 先把旧模型材质还原
    this.kartRoot = root;
    this.originalMaterials.clear();
    this.activeClones.clear();
    if (!root) return;
    root.traverse((obj) => {
      if (obj.isMesh) this.originalMaterials.set(obj, obj.material);
    });
    this.apply(this.mode);
  }

  /** 释放全部克隆材质并把网格切回原始材质 */
  _releaseClones() {
    this.activeClones.forEach((m) => m.dispose && m.dispose());
    this.activeClones.clear();
  }

  /**
   * 应用指定显示模式
   * @param {'solid'|'wireframe'|'xray'} mode
   * @param {Function} [onAfterSwitch] 切换完成回调（用于恢复选中高亮）
   */
  apply(mode, onAfterSwitch) {
    if (!MODES.includes(mode)) return;
    this.mode = mode;
    if (!this.kartRoot) return;

    // 每次切换先释放上一轮的克隆材质，避免 GPU 内存泄漏
    this._releaseClones();

    this.kartRoot.traverse((obj) => {
      if (!obj.isMesh) return;
      const original = this.originalMaterials.get(obj);
      if (!original) return;

      if (mode === 'solid') {
        // 还原原始材质
        obj.material = original;
        return;
      }

      // 线框/半透明模式使用克隆材质，避免污染原始材质对象
      const cloned = original.clone();
      if (mode === 'wireframe') {
        cloned.wireframe = true;
        cloned.transparent = false;
        cloned.opacity = 1;
      } else if (mode === 'xray') {
        cloned.transparent = true;
        cloned.opacity = 0.38;
        cloned.depthWrite = false; // 关键：关闭深度写入才能看穿外层结构
        cloned.side = THREE.DoubleSide;
      }
      obj.material = cloned;
      cloned.needsUpdate = true;
      this.activeClones.add(cloned);
    });

    if (onAfterSwitch) onAfterSwitch();
  }

  /** 还原实体模式（销毁模型前调用，防止材质残留引用） */
  restore() {
    if (this.kartRoot) {
      this.kartRoot.traverse((obj) => {
        if (obj.isMesh && this.originalMaterials.has(obj)) {
          obj.material = this.originalMaterials.get(obj);
        }
      });
    }
    this._releaseClones();
  }
}
