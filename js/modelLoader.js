/**
 * modelLoader.js —— 外部 GLB 模型加载与零件智能归类
 *
 * 工作流程：
 *  1. GLTFLoader 拉取网络 GLB（带下载进度回调）；
 *  2. 遍历全部网格，用 config.PART_INFO 中的别名关键词把网格
 *     归类到 14 个标准零件分组（按“最长关键词命中”计分，避免误匹配）；
 *  3. 按命名约定提取仿真角色（自转轴、转向节、踏板等）；
 *  4. 归一化尺寸并把模型放到地面上。
 *
 * 输出结构与 kartBuilder 完全一致，main.js 无需区分模型来源。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PART_INFO, PART_IDS } from './config.js';

const loader = new GLTFLoader();

/** 自转型零件的名称线索（命中即视为旋转件） */
const SPIN_KEYWORDS = ['spin', 'wheel', 'tire', 'sprocket', 'clutch', 'disc', 'axle'];
/** 旋转轴后缀约定：blah_spinX / spinY / spinZ，缺省按 X 轴处理 */
const AXIS_SUFFIX = /_spin([xyz])$/i;

/**
 * 根据对象名称判断它属于哪个标准零件
 * @param {string} name 对象（或其祖先）名称
 * @returns {{id:string, score:number}|null}
 */
function matchPart(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  let best = null;
  for (const id of PART_IDS) {
    for (const alias of PART_INFO[id].aliases) {
      const key = alias.toLowerCase();
      if (lower.includes(key)) {
        // 命中的别名越长，说明匹配越具体，优先级越高
        const score = key.length;
        if (!best || score > best.score) best = { id, score };
      }
    }
  }
  return best;
}

/**
 * 加载 GLB 模型
 * @param {string} url GLB 文件地址（需允许跨域）
 * @param {(percent:number)=>void} [onProgress] 下载进度回调 0~100
 * @returns {Promise<{root:THREE.Group, parts:Map, roles:object}>}
 */
export async function loadGLB(url, onProgress) {
  const gltf = await loader.loadAsync(url, (evt) => {
    if (evt.total > 0 && onProgress) {
      onProgress(Math.round((evt.loaded / evt.total) * 100));
    }
  });

  const root = gltf.scene;
  root.name = 'kart_glb';
  root.updateMatrixWorld(true);

  /* ---------- 1. 网格归类到标准零件分组 ---------- */
  const parts = new Map();
  /** 取得（或创建）某个零件的包装组 */
  function getWrapper(id) {
    let g = parts.get(id);
    if (!g) {
      g = new THREE.Group();
      g.name = id;
      parts.set(id, g);
      root.add(g);
    }
    return g;
  }
  // 未识别零件统一放入该组：正常显示，但不参与点击讲解
  const otherGroup = new THREE.Group();
  otherGroup.name = '_other';
  root.add(otherGroup);

  const meshes = [];
  root.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });

  for (const mesh of meshes) {
    // 同时检查自身与全部祖先的名称（Blender 里常按集合/空物体组织零件）
    let hit = null;
    let node = mesh;
    while (node && node !== root.parent) {
      const m = matchPart(node.name);
      if (m && (!hit || m.score > hit.score)) hit = m;
      node = node.parent;
    }
    const target = hit ? getWrapper(hit.id) : otherGroup;
    // attach 保持网格的世界变换，避免重组后零件错位
    target.attach(mesh);
    // 统一开启阴影
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  /* ---------- 2. 提取仿真运动角色 ---------- */
  const roles = {
    spin: [],
    steerPivots: [],
    steeringWheel: parts.get('steering_wheel') || null,
    tieRod: parts.get('tie_rod') || null,
    pedals: {
      throttle: parts.get('throttle_pedal') || null,
      brake: parts.get('brake_pedal') || null
    },
    engine: parts.get('engine') || null,
    engineBaseY: 0
  };

  // 收集所有名称像“旋转件”的对象
  const spinCandidates = [];
  root.traverse((obj) => {
    const n = (obj.name || '').toLowerCase();
    if (SPIN_KEYWORDS.some((k) => n.includes(k))) spinCandidates.push(obj);
  });
  // 去除嵌套：若祖先也是候选，只保留最外层
  const spinSet = spinCandidates.filter((obj) => {
    return !spinCandidates.some((other) => other !== obj && other.isAncestor(obj));
  });
  for (const obj of spinSet) {
    const n = obj.name.toLowerCase();
    // 前轮转向节本身不是自旋件（它负责左右摆动）
    if (/^front_wheel_[lr](?!.*spin)/.test(n)) continue;
    const axisMatch = n.match(AXIS_SUFFIX);

    // 判断转速来源：沿祖先链找到所属标准零件
    let ownerId = null;
    let p = obj;
    while (p && p !== root) {
      if (PART_IDS.includes(p.name)) { ownerId = p.name; break; }
      p = p.parent;
    }
    // 离合、主动链轮随发动机转；其余自旋件随后桥/车轮转
    const engineSide =
      ownerId === 'clutch' ||
      (ownerId === 'chain_drive' && /front|drive|clutch|small|sp1/i.test(n) && !/rear|driven|large|sp2/i.test(n));

    roles.spin.push({
      object: obj,
      axis: axisMatch ? axisMatch[1].toLowerCase() : 'x',
      rate: engineSide ? 'engine' : 'wheel'
    });
  }

  // 前轮转向节：名称以 front_wheel_L / front_wheel_R 开头的组
  root.traverse((obj) => {
    if (/^front_wheel_[lr]/i.test(obj.name)) roles.steerPivots.push(obj);
  });

  if (roles.engine) roles.engineBaseY = roles.engine.position.y;

  /* ---------- 3. 尺寸归一化：最大边缩放到约 3.2 单位，落地居中 ---------- */
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 3.2 / maxDim;
  root.scale.multiplyScalar(scale);

  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const center = box2.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box2.min.y; // 底部贴地

  const matched = PART_IDS.filter((id) => parts.has(id));
  console.log(`[modelLoader] 识别到 ${matched.length}/14 个标准零件：`, matched);

  return { root, parts, roles };
}
