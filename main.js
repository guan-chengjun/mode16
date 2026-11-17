/**
 * main.js —— 程序入口与模块编排
 *
 * 模块关系：
 *   sceneSetup    渲染器/相机/灯光/OrbitControls
 *   kartBuilder   内置程序化卡丁车（无 GLB 时使用）
 *   modelLoader   网络 GLB 加载与零件归类
 *   displayModes  实体 / 线框 / 半透明 三种显示模式
 *   simulation    运转仿真动画
 *   picker        点击拾取与高亮
 *   ui            控制面板、讲解面板、转速表
 */
import * as THREE from 'three';
import { initScene } from './js/sceneSetup.js';
import { buildKart } from './js/kartBuilder.js';
import { loadGLB } from './js/modelLoader.js';
import { DisplayManager } from './js/displayModes.js';
import { Simulation } from './js/simulation.js';
import { Picker } from './js/picker.js';
import { UIController } from './js/ui.js';
import { PART_INFO } from './js/config.js';

/* ---------------- 初始化渲染环境 ---------------- */
const container = document.getElementById('app');
const { renderer, scene, camera, controls, resetView } = initScene(container);

/* ---------------- 各功能模块实例 ---------------- */
const display = new DisplayManager();
const simulation = new Simulation();
let picker = null;
let currentKart = null; // 当前卡丁车对象 { root, parts, roles }

/**
 * 释放旧卡丁车：还原材质、移除根节点、释放几何体与材质
 */
function disposeKart(kart) {
  if (!kart) return;
  display.restore();
  scene.remove(kart.root);
  kart.root.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m && m.dispose && m.dispose());
    }
  });
}

/**
 * 装载一辆新卡丁车（内置模型或 GLB 模型统一入口）
 */
function mountKart(kart) {
  if (currentKart) disposeKart(currentKart);
  currentKart = kart;
  scene.add(kart.root);

  // 各子系统重新绑定新模型
  display.setKart(kart.root);
  simulation.setRoles(kart.roles);
  if (!picker) {
    picker = new Picker(camera, renderer, kart.parts);
    picker.onSelect = (id) => ui.showPartInfo(id);
  } else {
    picker.setParts(kart.parts);
  }
  // 装载后若当前不是实体模式，重新应用一次，并恢复高亮
  display.apply(display.mode, () => picker.refreshAfterMaterialChange());
  ui.showPartInfo(null);
}

/* ---------------- UI 回调：把界面操作接到 3D 行为 ---------------- */
const ui = new UIController({
  // 加载网络 GLB
  async onLoadGLB(url) {
    ui.showLoading('正在连接模型地址…');
    try {
      const kart = await loadGLB(url, (pct) => ui.updateProgress(pct));
      mountKart(kart);
      ui.hideLoading();
      const count = [...kart.parts.keys()].length;
      ui.showToast(`模型加载成功，识别到 ${count}/14 个可讲解零件`);
    } catch (err) {
      console.error(err);
      ui.hideLoading();
      ui.showToast('模型加载失败：请检查 URL、网络与 CORS 跨域设置');
    }
  },

  // 恢复内置模型
  onUseBuiltin() {
    mountKart(buildKart());
    ui.showToast('已恢复内置教学卡丁车模型');
  },

  onResetView() {
    resetView();
  },

  onDisplayMode(mode) {
    display.apply(mode, () => picker && picker.refreshAfterMaterialChange());
  },

  onToggleRun() {
    const running = simulation.toggle();
    ui.setRunState(running);
  },

  onSpeedChange(v) {
    simulation.setSpeedScale(v);
  },

  onClearSelect() {
    if (picker) picker.clearSelection();
    ui.showPartInfo(null);
  }
});

// 仿真遥测 → 转速表/车速/挡位
simulation.onTelemetry = (data) => ui.updateTelemetry(data);

/* ---------------- 首屏装载内置模型 ---------------- */
mountKart(buildKart());

/* ---------------- 调试钩子（教学排查用，可在浏览器控制台查看） ----------------
   window.__kart.current —— 当前卡丁车 { root, parts, roles }
   window.__kart.camera  —— 透视相机
   window.__three        —— THREE 模块对象                              */
window.__kart = {
  camera,
  get current() { return currentKart; }
};
window.__PART_INFO = PART_INFO;
window.__three = THREE;

/* ---------------- 渲染主循环 ---------------- */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  controls.update();          // OrbitControls 阻尼更新
  simulation.update(delta);   // 运转仿真

  renderer.render(scene, camera);
}
animate();
