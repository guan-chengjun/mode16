/**
 * kartBuilder.js —— 内置程序化卡丁车模型
 *
 * 当没有可用的 GLB 模型时，用 Three.js 基础几何体拼装一辆教学用卡丁车，
 * 零件分组名称与 config.PART_INFO 中的 id 完全一致，因此拾取、讲解、
 * 仿真动画对“内置模型”和“外部 GLB 模型”走同一套逻辑。
 *
 * 坐标约定：车头朝 +Z，左侧为 -X，车轮中心离地 0.33。
 */
import * as THREE from 'three';
import { PART_IDS } from './config.js';

/* ---------------- 通用建模小工具 ---------------- */

/** 标准 PBR 材质 */
function mat(color, roughness = 0.55, metalness = 0.25) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** 给网格开启阴影 */
function shadow(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 方盒网格 */
function box(w, h, d, material) {
  return shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
}

/** 圆柱网格（默认沿 Y 轴） */
function cyl(rTop, rBottom, height, material, seg = 24) {
  return shadow(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, height, seg), material));
}

/**
 * 在两点之间生成一根圆管（用于车架钢管、排气管等）
 * @param {THREE.Vector3} a 起点
 * @param {THREE.Vector3} b 终点
 * @param {number} r 管半径
 */
function tubeBetween(a, b, r, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), material));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/* ---------------- 材质表（按零件配色，便于区分） ---------------- */
const M = {
  frame: mat(0x2f6fb0, 0.35, 0.6),        // 车架：蓝色金属
  tire: mat(0x14161a, 0.9, 0.05),         // 轮胎：黑色橡胶
  hub: mat(0x9aa7b5, 0.35, 0.85),         // 轮毂：银灰金属
  steel: mat(0x8a94a0, 0.3, 0.9),         // 钢结构
  dark: mat(0x2b2f36, 0.6, 0.7),          // 深色金属
  engine: mat(0x6b7280, 0.5, 0.8),        // 发动机灰
  chain: mat(0x3d424a, 0.35, 0.9),        // 链条
  red: mat(0xc0392b, 0.45, 0.3),          // 油箱红
  seat: mat(0x1f2937, 0.85, 0.1),         // 座椅深色
  brake: mat(0xd97706, 0.45, 0.6),        // 刹车盘橙色
  pedal: mat(0xd1d5db, 0.4, 0.8)          // 踏板
};

/* 整车关键尺寸 */
const WHEEL_R = 0.33;                 // 车轮半径
const TRACK_X = 0.95;                 // 轮距半宽
const FRONT_Z = 1.15;                 // 前轴 Z
const REAR_Z = -1.15;                 // 后轴 Z
const WHEEL_Y = WHEEL_R;              // 车轮中心高度

/**
 * 构建一个车轮（轮胎 + 轮毂 + 辐条）
 * @returns {THREE.Group} 自旋组，组原点在车轮中心，绕本地 X 轴旋转
 */
function buildWheel() {
  const spin = new THREE.Group();

  // 轮胎：圆柱绕 Z 轴转 90° 后轴线沿 X
  const tire = cyl(WHEEL_R, WHEEL_R, 0.22, M.tire, 32);
  tire.rotation.z = Math.PI / 2;
  spin.add(tire);

  // 轮毂
  const hub = cyl(0.16, 0.16, 0.24, M.hub, 24);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);

  // 5 根辐条
  for (let i = 0; i < 5; i++) {
    const spoke = box(0.26, 0.045, 0.03, M.hub);
    spoke.rotation.x = (i / 5) * Math.PI * 2;
    spin.add(spoke);
  }
  return spin;
}

/**
 * 主构建函数
 * @returns {{root:THREE.Group, parts:Map<string,THREE.Object3D>, roles:object}}
 */
export function buildKart() {
  const root = new THREE.Group();
  root.name = 'kart';
  const parts = new Map();
  /** 为仿真模块预留的运动角色清单 */
  const roles = {
    spin: [],            // 绕轴自转件 { object, axis }
    steerPivots: [],     // 前轮转向节组
    steeringWheel: null, // 方向盘组
    tieRod: null,        // 转向拉杆
    pedals: { throttle: null, brake: null },
    engine: null,        // 发动机（带怠速抖动）
    engineBaseY: 0
  };

  /** 新建零件组并登记到 parts 表 */
  function newPart(id) {
    const g = new THREE.Group();
    g.name = id; // 组名 = 零件 id，拾取时按名称归类
    parts.set(id, g);
    root.add(g);
    return g;
  }

  /* ================= 1. 车架（钢管桁架 + 底板） ================= */
  const frame = newPart('frame');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // 左右主纵梁
  frame.add(tubeBetween(V(-0.55, 0.52, 1.35), V(-0.62, 0.5, -1.35), 0.045, M.frame));
  frame.add(tubeBetween(V(0.55, 0.52, 1.35), V(0.62, 0.5, -1.35), 0.045, M.frame));
  // 前/后横梁
  frame.add(tubeBetween(V(-0.55, 0.52, 1.35), V(0.55, 0.52, 1.35), 0.045, M.frame));
  frame.add(tubeBetween(V(-0.62, 0.5, -1.35), V(0.62, 0.5, -1.35), 0.045, M.frame));
  // 中部加强横梁与斜撑（三角形桁架）
  frame.add(tubeBetween(V(-0.6, 0.5, 0.1), V(0.6, 0.5, 0.1), 0.035, M.frame));
  frame.add(tubeBetween(V(-0.55, 0.52, 1.35), V(0.6, 0.5, 0.1), 0.03, M.frame));
  frame.add(tubeBetween(V(0.55, 0.52, 1.35), V(-0.6, 0.5, 0.1), 0.03, M.frame));
  // 地板
  const floorPan = box(1.15, 0.04, 2.1, M.dark);
  floorPan.position.set(0, 0.42, 0);
  frame.add(floorPan);
  // 前轴支撑、后桥轴承座
  frame.add(tubeBetween(V(-0.7, WHEEL_Y, FRONT_Z), V(0.7, WHEEL_Y, FRONT_Z), 0.035, M.steel));
  [-0.55, 0.55].forEach(x => {
    const bearing = cyl(0.08, 0.08, 0.12, M.dark);
    bearing.rotation.z = Math.PI / 2;
    bearing.position.set(x, WHEEL_Y, REAR_Z);
    frame.add(bearing);
  });

  /* ================= 2. 前轮总成（转向节 + 车轮） ================= */
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';
    // 转向节组：原点在前轴中心，仿真时绕 Y 轴摆动实现转向
    const pivot = new THREE.Group();
    pivot.name = `front_wheel_${suffix}`;
    pivot.position.set(side * TRACK_X, WHEEL_Y, FRONT_Z);
    // 左右前轮统一挂到 front_wheel 零件组下（首次使用时创建）
    let fwPart = parts.get('front_wheel');
    if (!fwPart) {
      fwPart = new THREE.Group();
      fwPart.name = 'front_wheel';
      parts.set('front_wheel', fwPart);
      root.add(fwPart);
    }
    fwPart.add(pivot);
    roles.steerPivots.push(pivot);

    // 转向节摇臂（朝车架内侧伸出，用于连接拉杆）
    const knuckleArm = box(0.32, 0.05, 0.06, M.steel);
    knuckleArm.position.set(-side * 0.16, 0, 0);
    pivot.add(knuckleArm);

    // 车轮自旋组（前轮为从动轮，按车轮转速转）
    const spin = buildWheel();
    spin.name = `front_wheel_${suffix}_spin`;
    pivot.add(spin);
    roles.spin.push({ object: spin, axis: 'x', rate: 'wheel' });
  }

  /* ================= 3. 转向拉杆 ================= */
  const tieRodPart = newPart('tie_rod');
  const tieRod = new THREE.Group();
  tieRod.name = 'tie_rod';
  const rodMesh = cyl(0.028, 0.028, TRACK_X * 2 - 0.5, M.steel);
  rodMesh.rotation.z = Math.PI / 2;
  tieRod.add(rodMesh);
  // 两端球头
  for (const side of [-1, 1]) {
    const joint = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), M.dark));
    joint.position.x = side * (TRACK_X - 0.25);
    tieRod.add(joint);
  }
  tieRod.position.set(0, WHEEL_Y, FRONT_Z - 0.12);
  tieRodPart.add(tieRod);
  roles.tieRod = tieRod;

  /* ================= 4. 方向盘 + 转向柱 ================= */
  const swPart = newPart('steering_wheel');
  const swGroup = new THREE.Group();
  swGroup.name = 'steering_wheel';
  swGroup.position.set(0, 0.55, 1.0);
  swPart.add(swGroup);
  // 转向柱（沿本地 Y 轴向上，稍后整体后仰）
  const column = cyl(0.035, 0.035, 0.55, M.steel);
  column.position.y = 0.27;
  swGroup.add(column);
  // 方向盘轮圈
  const rim = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 12, 36), M.dark));
  rim.position.y = 0.58;
  swGroup.add(rim);
  // 三辐条 + 中心毂
  for (let i = 0; i < 3; i++) {
    const sp = box(0.16, 0.025, 0.025, M.steel);
    sp.position.y = 0.58;
    sp.rotation.y = (i / 3) * Math.PI * 2;
    sp.position.x = Math.cos(sp.rotation.y) * 0.08;
    sp.position.z = Math.sin(sp.rotation.y) * 0.08;
    swGroup.add(sp);
  }
  const hub = cyl(0.05, 0.05, 0.05, M.dark);
  hub.position.y = 0.58;
  swGroup.add(hub);
  swGroup.rotation.x = -0.38; // 转向柱后仰角度
  roles.steeringWheel = swGroup;

  /* ================= 5. 后桥 + 后轮 ================= */
  const axlePart = newPart('rear_axle');
  const axle = cyl(0.045, 0.045, TRACK_X * 2 + 0.25, M.steel);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0, WHEEL_Y, REAR_Z);
  axle.name = 'rear_axle';
  axlePart.add(axle);
  roles.spin.push({ object: axle, axis: 'x', rate: 'wheel' });

  const rwPart = newPart('rear_wheel');
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';
    const spin = buildWheel();
    spin.name = `rear_wheel_${suffix}_spin`;
    spin.position.set(side * TRACK_X, WHEEL_Y, REAR_Z);
    rwPart.add(spin);
    roles.spin.push({ object: spin, axis: 'x', rate: 'wheel' });
  }

  /* ================= 6. 发动机 ================= */
  const enginePart = newPart('engine');
  enginePart.position.set(0.42, 0.55, -0.55);
  roles.engine = enginePart;
  roles.engineBaseY = enginePart.position.y;
  // 曲轴箱
  const crank = box(0.38, 0.3, 0.4, M.engine);
  enginePart.add(crank);
  // 气缸 + 散热鳍片
  const cylinder = cyl(0.11, 0.12, 0.3, M.engine);
  cylinder.position.set(0, 0.28, 0);
  enginePart.add(cylinder);
  for (let i = 0; i < 5; i++) {
    const fin = box(0.3, 0.02, 0.26, M.steel);
    fin.position.set(0, 0.17 + i * 0.055, 0);
    enginePart.add(fin);
  }
  // 排气管
  const exhaust = tubeBetween(V(0.05, 0.35, 0.15), V(0.25, 0.42, 0.55), 0.035, M.dark);
  enginePart.add(exhaust);
  const muffler = cyl(0.07, 0.07, 0.28, M.dark);
  muffler.rotation.x = Math.PI / 2;
  muffler.position.set(0.28, 0.42, 0.62);
  enginePart.add(muffler);

  /* ================= 7. 离合器（离心式鼓） ================= */
  const clutchPart = newPart('clutch');
  const clutch = cyl(0.095, 0.095, 0.1, M.brake, 28);
  clutch.rotation.z = Math.PI / 2;
  clutch.position.set(0.18, WHEEL_Y + 0.17, -0.55);
  clutch.name = 'clutch';
  clutchPart.add(clutch);
  roles.spin.push({ object: clutch, axis: 'x', rate: 'engine' });

  /* ================= 8. 链条传动（主动链轮 + 从动链轮 + 闭合链环） ================= */
  const chainPart = newPart('chain_drive');
  const SP1 = { x: 0.18, y: WHEEL_Y + 0.17, z: -0.55, r: 0.075 }; // 主动链轮（离合器侧）
  const SP2 = { x: 0.18, y: WHEEL_Y, z: REAR_Z, r: 0.16 };         // 从动链轮（后桥侧）
  for (const sp of [SP1, SP2]) {
    const wheel = cyl(sp.r, sp.r, 0.05, M.chain, 28);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sp.x, sp.y, sp.z);
    wheel.name = 'sprocket';
    chainPart.add(wheel);
    // 主动链轮(SP1)随发动机转，从动链轮(SP2)随后桥/车轮转
    const isEngineSide = sp === SP1;
    roles.spin.push({ object: wheel, axis: 'x', rate: isEngineSide ? 'engine' : 'wheel' });
  }
  // 闭合链条：在 X=常数平面内取“跑道形”点位，用闭合样条弯成圆管
  const chainPoints = [];
  const ARC_SEG = 8;
  // 从动链轮外侧半圆弧：顶 → 底（朝 -Z 方向凸出）
  for (let i = 0; i <= ARC_SEG; i++) {
    const t = (i / ARC_SEG) * Math.PI;
    chainPoints.push(new THREE.Vector3(
      SP2.x,
      SP2.y + SP2.r * Math.cos(t),
      SP2.z - SP2.r * Math.sin(t)
    ));
  }
  // 主动链轮内侧半圆弧：底 → 顶（朝 +Z 方向凸出）
  for (let i = 0; i <= ARC_SEG; i++) {
    const t = Math.PI + (i / ARC_SEG) * Math.PI;
    chainPoints.push(new THREE.Vector3(
      SP1.x,
      SP1.y + SP1.r * Math.cos(t),
      SP1.z + SP1.r * Math.sin(t)
    ));
  }
  // centripetal 曲线在尖角处不会过冲，适合这种“跑道形”闭合链环
  const chainCurve = new THREE.CatmullRomCurve3(chainPoints, true, 'centripetal');
  const chainMesh = shadow(new THREE.Mesh(
    new THREE.TubeGeometry(chainCurve, 80, 0.018, 8, true),
    M.chain
  ));
  chainMesh.name = 'chain';
  chainPart.add(chainMesh);

  /* ================= 9. 油箱 ================= */
  const tankPart = newPart('fuel_tank');
  const tank = box(0.62, 0.32, 0.55, M.red);
  tank.position.set(0, 0.98, 0.25);
  tankPart.add(tank);
  const tankCap = cyl(0.05, 0.05, 0.05, M.dark);
  tankCap.position.set(0.18, 1.17, 0.25);
  tankPart.add(tankCap);

  /* ================= 10. 座椅 ================= */
  const seatPart = newPart('seat');
  const seatBase = box(0.55, 0.1, 0.5, M.seat);
  seatBase.position.set(0, 0.72, -0.18);
  seatBase.rotation.x = -0.08;
  seatPart.add(seatBase);
  const seatBack = box(0.55, 0.55, 0.09, M.seat);
  seatBack.position.set(0, 0.98, -0.42);
  seatBack.rotation.x = -0.28;
  seatPart.add(seatBack);

  /* ================= 11. 刹车盘 + 刹车卡钳 ================= */
  const caliperPart = newPart('brake_caliper');
  const disc = cyl(0.145, 0.145, 0.025, M.brake, 32);
  disc.rotation.z = Math.PI / 2;
  disc.position.set(0.55, WHEEL_Y, REAR_Z);
  disc.name = 'brake_disc';
  caliperPart.add(disc);
  roles.spin.push({ object: disc, axis: 'x', rate: 'wheel' });
  // 卡钳本体：夹在盘上方，制动时不变形仅高亮
  const caliper = box(0.09, 0.12, 0.16, M.red);
  caliper.position.set(0.55, WHEEL_Y + 0.12, REAR_Z);
  caliper.name = 'caliper';
  caliperPart.add(caliper);

  /* ================= 12/13. 油门踏板、刹车踏板 ================= */
  /**
   * @param {string} id 零件 id
   * @param {number} x 横向位置
   */
  function buildPedal(id, x) {
    const part = newPart(id);
    const pivot = new THREE.Group();
    pivot.name = id;
    pivot.position.set(x, 0.28, 1.02);
    const arm = box(0.09, 0.22, 0.03, M.steel);
    arm.position.y = -0.09;
    pivot.add(arm);
    const pad = box(0.13, 0.05, 0.1, M.pedal);
    pad.position.set(0, -0.2, 0.03);
    pivot.add(pad);
    part.add(pivot);
    return pivot;
  }
  roles.pedals.throttle = buildPedal('throttle_pedal', -0.22);
  roles.pedals.brake = buildPedal('brake_pedal', 0.22);

  // 防御性校验：14 个零件全部登记
  const missing = PART_IDS.filter(id => !parts.has(id));
  if (missing.length) console.warn('[kartBuilder] 缺少零件分组：', missing);

  return { root, parts, roles };
}
