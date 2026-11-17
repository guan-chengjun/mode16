/**
 * picker.js —— 零件点击拾取与高亮
 *
 * 功能：
 *  - 射线检测点击位置下的卡丁车网格，映射到 14 个标准零件
 *  - 区分“点击”与“拖拽旋转视角”（鼠标移动超过阈值不算点击）
 *  - 选中零件：自发光蓝色高亮；悬停：轻微高亮 + 手指光标
 *  - 支持“重置选中部件”
 */
import * as THREE from 'three';
import { PART_IDS } from './config.js';

const HIGHLIGHT_COLOR = 0x3b82f6; // 与界面主色一致的蓝色
const HOVER_TINT = 0x1f4d8f;
const DRAG_THRESHOLD = 6;         // 像素位移阈值，超过视为拖拽而非点击

export class Picker {
  /**
   * @param {THREE.Camera} camera
   * @param {THREE.WebGLRenderer} renderer
   * @param {Map<string, THREE.Object3D>} parts 零件分组表
   */
  constructor(camera, renderer, parts) {
    this.camera = camera;
    this.renderer = renderer;
    this.parts = parts;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.selectedId = null;
    this.hoveredId = null;
    /** 材质原始自发光值缓存，取消高亮时精确还原 */
    this.materialCache = new Map();
    /** 选中变化回调（main.js 用来更新讲解面板） */
    this.onSelect = null;

    this._downPos = null;
    this._bindEvents();
  }

  /** 模型切换后更新零件表并清除高亮 */
  setParts(parts) {
    this.clearSelection(false);
    this.parts = parts;
    this.materialCache.clear();
    this.selectedId = null;
    this.hoveredId = null;
  }

  _bindEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this._downPos = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      if (!this._downPos) return;
      const moved = Math.hypot(e.clientX - this._downPos.x, e.clientY - this._downPos.y);
      this._downPos = null;
      if (moved > DRAG_THRESHOLD) return; // 拖拽视角，忽略
      const hitId = this._pick(e);
      this.select(hitId);
    });
    // 悬停反馈（触控设备 pointermove 较少触发，无副作用）
    dom.addEventListener('pointermove', (e) => {
      if (e.buttons !== 0) return; // 正在拖拽时不做悬停检测，省性能
      const hitId = this._pick(e);
      if (hitId !== this.hoveredId) {
        this._setHover(this.hoveredId, false);
        this.hoveredId = hitId;
        this._setHover(hitId, true);
        dom.style.cursor = hitId ? 'pointer' : 'grab';
      }
    });
  }

  /** 射线检测，返回命中的标准零件 id（未命中返回 null） */
  _pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const targets = [];
    this.parts.forEach((group) => group.traverse((o) => o.isMesh && targets.push(o)));
    const hits = this.raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;

    // 从命中网格向上找到标准零件包装组（名称为 PART_IDS 之一）
    let node = hits[0].object;
    while (node) {
      if (PART_IDS.includes(node.name)) return node.name;
      node = node.parent;
    }
    return null;
  }

  /** 选中指定零件（传 null 表示取消选中） */
  select(id) {
    if (this.selectedId === id) return;
    this._setSelected(this.selectedId, false);
    this.selectedId = id;
    this._setSelected(id, true);
    if (this.onSelect) this.onSelect(id);
  }

  /** 重置选中部件 */
  clearSelection(notify = true) {
    this._setSelected(this.selectedId, false);
    this.selectedId = null;
    if (notify && this.onSelect) this.onSelect(null);
  }

  /* ---------------- 高亮实现 ---------------- */

  /** 缓存并返回某网格材质的原始自发光参数 */
  _cacheMaterial(material) {
    if (!this.materialCache.has(material)) {
      this.materialCache.set(material, {
        emissive: material.emissive ? material.emissive.getHex() : 0,
        intensity: material.emissiveIntensity ?? 1
      });
    }
    return this.materialCache.get(material);
  }

  /** 对一个零件组内全部网格应用/取消高亮 */
  _applyHighlight(id, color, intensity, on) {
    const group = id && this.parts.get(id);
    if (!group) return;
    group.traverse((obj) => {
      if (!obj.isMesh) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) {
        if (!('emissive' in m)) continue;
        const cache = this._cacheMaterial(m);
        if (on) {
          m.emissive.setHex(color);
          m.emissiveIntensity = intensity;
        } else {
          m.emissive.setHex(cache.emissive);
          m.emissiveIntensity = cache.intensity;
        }
      }
    });
  }

  _setSelected(id, on) {
    this._applyHighlight(id, HIGHLIGHT_COLOR, 0.75, on);
  }

  _setHover(id, on) {
    if (!id || id === this.selectedId) return; // 选中件保持选中高亮
    this._applyHighlight(id, HOVER_TINT, 0.45, on);
  }

  /**
   * 显示模式切换后材质被整体替换，需要重新对当前选中件打高亮。
   * 清掉旧缓存，由 DisplayManager 切换完成后调用。
   */
  refreshAfterMaterialChange() {
    this.materialCache.clear();
    this._setSelected(this.selectedId, true);
    if (this.hoveredId && this.hoveredId !== this.selectedId) {
      this._setHover(this.hoveredId, true);
    }
  }
}
