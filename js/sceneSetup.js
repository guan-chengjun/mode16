/**
 * sceneSetup.js —— 渲染基础设施
 * 负责创建：WebGL 渲染器（抗锯齿+阴影）、场景、透视相机、
 * OrbitControls（含防穿模限位）、三点布光、地面与网格。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA_DEFAULT, CONTROL_LIMITS } from './config.js';

/**
 * 初始化整套渲染环境
 * @param {HTMLElement} container 画布挂载容器
 * @returns 场景各对象的集合
 */
export function initScene(container) {
  // ---------- 渲染器：抗锯齿、软阴影、正确色彩空间 ----------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制 DPR，兼顾移动端性能
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 柔和环境阴影
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // ---------- 场景与背景 ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111826);
  scene.fog = new THREE.Fog(0x111826, 14, 30); // 远景雾，增加空间层次

  // ---------- 透视相机 ----------
  const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(...CAMERA_DEFAULT.position);

  // ---------- OrbitControls：360°旋转 / 缩放 / 平移 ----------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...CAMERA_DEFAULT.target);
  controls.enableDamping = true;          // 阻尼惯性，手感更顺滑
  controls.dampingFactor = 0.08;
  controls.minDistance = CONTROL_LIMITS.minDistance;
  controls.maxDistance = CONTROL_LIMITS.maxDistance;
  controls.maxPolarAngle = CONTROL_LIMITS.maxPolarAngle; // 防止相机穿到地面下
  controls.minPolarAngle = CONTROL_LIMITS.minPolarAngle;
  // 移动端触控：单指旋转、双指缩放+平移（OrbitControls 默认即支持）
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN
  };
  controls.update();

  // ---------- 三点布光 ----------
  // 1) 环境光：提供基础照度，避免暗部死黑
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);

  // 2) 主光（Key Light）：平行光，从右上方照射，负责投影
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(5, 8, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 25;
  keyLight.shadow.camera.left = -6;
  keyLight.shadow.camera.right = 6;
  keyLight.shadow.camera.top = 6;
  keyLight.shadow.camera.bottom = -6;
  keyLight.shadow.bias = -0.0004; // 减少阴影粉刺
  scene.add(keyLight);

  // 3) 补光（Fill Light）：左前方冷色弱光，提亮阴影面
  const fillLight = new THREE.DirectionalLight(0x9db8ff, 0.7);
  fillLight.position.set(-6, 4, 3);
  scene.add(fillLight);

  // 4) 轮廓光（Rim/Back Light）：背后逆光，勾勒车体边缘
  const rimLight = new THREE.DirectionalLight(0xffe0b3, 0.9);
  rimLight.position.set(-2, 5, -7);
  scene.add(rimLight);

  // ---------- 地面：接收阴影 ----------
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(18, 64),
    new THREE.MeshStandardMaterial({
      color: 0x1b2536,
      roughness: 0.92,
      metalness: 0.05
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 参考网格线，帮助感知空间尺度
  const grid = new THREE.GridHelper(18, 36, 0x3a4a63, 0x263247);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  // ---------- 响应式：窗口缩放自动适配画布 ----------
  function handleResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', handleResize);

  /** 视角重置：恢复相机与目标点到初始状态 */
  function resetView() {
    camera.position.set(...CAMERA_DEFAULT.position);
    controls.target.set(...CAMERA_DEFAULT.target);
    controls.update();
  }

  return { renderer, scene, camera, controls, resetView, handleResize };
}
