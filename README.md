# 卡丁车 3D 结构教学演示（Three.js）

基于 **Three.js (ES Module + importmap CDN)** 的浏览器端卡丁车 3D 交互教学项目，零构建、分文件开发，支持加载网络 GLB 模型，面向课堂教学与产品结构讲解场景。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 视角交互 | OrbitControls：鼠标拖拽 360° 旋转、滚轮缩放、右键平移；移动端单指旋转、双指缩放平移；带距离/俯仰限位防止穿模 |
| 显示模式 | 实体着色 / 透视线框 / 半透明透视（半透明模式可看穿车架观察内部零件） |
| 运转仿真 | 一键启停；车轮旋转、转向机构联动、油门转速表、踏板摆动、发动机抖动、链条链轮同步；动画速度 0.1×~3× 可调 |
| 部件讲解 | 14 个核心零件点击拾取，侧边面板展示名称、功能介绍、作用原理，可关闭 |
| 渲染品质 | 三点布光、PCF 软阴影、抗锯齿、ACES 色调映射、响应式自适应 |
| 模型来源 | 默认内置程序化卡丁车（开箱即用）；也可在面板输入 URL 加载网络 GLB |

## 目录结构

```
mode16/
├─ index.html          # 页面入口（importmap 引入 Three.js CDN）
├─ style.css           # 深色主题样式，含移动端响应式
├─ main.js             # 程序入口：模块编排、模型切换、渲染循环
├─ js/
│  ├─ config.js        # 零件资料数据库（名称/关键词/功能/原理）与相机参数
│  ├─ sceneSetup.js    # 渲染器、场景、相机、OrbitControls、三点光、地面
│  ├─ kartBuilder.js   # 内置程序化卡丁车（基础几何体拼装，零件命名规范）
│  ├─ modelLoader.js   # GLB 加载、关键词归类、尺寸归一化、运动角色提取
│  ├─ displayModes.js  # 实体/线框/半透明三种显示模式
│  ├─ simulation.js    # 运转仿真动画与遥测数据
│  ├─ picker.js        # 射线拾取、点击/拖拽区分、选中与悬停高亮
│  └─ ui.js            # 控制面板、讲解面板、Canvas 转速表、Toast
└─ README.md
```

## 一、本地启动方式

> 项目使用 ES Module，**不能直接双击 `index.html`（file:// 协议）打开**，必须通过 HTTP 服务访问。

### 方式 1：Python（Windows 自带或官网安装）

```bash
# 在项目根目录执行
python -m http.server 8080
```

浏览器打开 <http://localhost:8080>

### 方式 2：Node.js

```bash
npx serve .
# 或
npx http-server -p 8080
```

### 方式 3：VS Code

安装 **Live Server** 扩展 → 右键 `index.html` → `Open with Live Server`。

启动后页面会直接显示内置卡丁车，无需任何模型文件即可体验全部功能。

## 二、GLB 模型下载渠道

推荐下载 **.glb**（单文件、自带材质贴图）格式的卡丁车 / go-kart 模型：

1. **Sketchfab**（<https://sketchfab.com>）：搜索 `go-kart`、`kart`，筛选 `Downloadable`，选择 GLB/GLTF 格式下载（部分免费、部分需 CC 署名）。
2. **CGTrader**（<https://www.cgtrader.com>）：搜索 `go kart`，筛选免费、格式选 GLB。
3. **Free3D**（<https://free3d.com>）、**TurboSquid**（<https://www.turbosquid.com>）：有免费卡丁车模型，注意格式转换。
4. **Quaternius / Kenney** 等 CC0 资源站：车辆套件可自行拼装卡丁车。
5. Blender 自建：按下方命名规范建模后 `文件 → 导出 → glTF 2.0 (.glb)`。

> 格式不是 GLB 时（FBX/OBJ/DAE），可用 Blender 导入后重新导出为 GLB。

## 三、Blender 零件重命名步骤（关键）

程序靠**网格/对象名称中的关键词**把模型归类到 14 个教学零件。重命名越规范，点击讲解识别越准。

### 3.1 标准零件名称与关键词

| 教学零件 | 推荐命名（对象/网格名） | 可识别关键词 |
| --- | --- | --- |
| 车架 | `frame` | frame、chassis、车架、底盘 |
| 方向盘 | `steering_wheel` | steering_wheel、方向盘、转向盘 |
| 转向拉杆 | `tie_rod` | tie_rod、rod、linkage、拉杆、横拉杆 |
| 前轮总成 | `front_wheel_L` / `front_wheel_R` | front_wheel、前轮 |
| 后轮 | `rear_wheel_L` / `rear_wheel_R` | rear_wheel、后轮 |
| 后桥 | `rear_axle` | axle、后桥、后轴 |
| 发动机 | `engine` | engine、motor、发动机、引擎 |
| 离合 | `clutch` | clutch、离合、离合器 |
| 链条传动 | `chain`、`sprocket_front`、`sprocket_rear` | chain、sprocket、链条、链轮 |
| 油箱 | `fuel_tank` | fuel、tank、油箱 |
| 座椅 | `seat` | seat、座椅 |
| 刹车卡钳 | `caliper`、`brake_disc` | caliper、brake、disc、卡钳、刹车盘 |
| 油门踏板 | `throttle_pedal` | throttle、accelerator、油门 |
| 刹车踏板 | `brake_pedal` | brake_pedal、刹车踏板、制动踏板 |

### 3.2 操作步骤

1. 打开模型，切换到 **物体模式**，在右上角「场景集合」大纲视图中选中零件对象。
2. 双击对象名（或按 `F2`）改为上表中的英文名，例如 `engine`、`front_wheel_L`。
3. 进入「物体属性 → 网格数据」，把**网格数据块名称**也改成一致（导出 GLB 时网格名同样参与识别）。
4. 同一零件由多个网格组成时，建议按 `Shift+G` 或手动 `M` 合并，或用 **空物体（Empty）** 作为父级并以零件关键词命名——程序会沿父级链向上匹配名称。
5. 动画命名约定（可选，用于仿真）：
   - 需要自转的轮子/链轮，名称中保留 `wheel`、`sprocket`、`clutch`、`axle`、`disc` 等词；
   - 若自转轴不是 X 轴，可加后缀 `_spinX` / `_spinY` / `_spinZ` 指定旋转轴；
   - 前轮转向节请命名为 `front_wheel_L`、`front_wheel_R`，其内部旋转网格命名为 `front_wheel_L_spin`，这样转向摆动与车轮自转互不干扰。
6. 导出：`文件 → 导出 → glTF 2.0`，格式选 **.glb**，勾选 `包含 → 网格、材质`，变换选 `+Y 向上`。

### 3.3 加载方式

- **本地模型**：把 GLB 放到项目根目录（如 `models/kart.glb`），面板输入 `http://localhost:8080/models/kart.glb` 后点「加载 GLB」。
- **网络模型**：输入完整 URL（如 `https://example.com/kart.glb`），该服务器必须允许跨域（见下节）。
- 模型加载后会自动等比缩放（最大边约 3.2 单位）、居中并落地，无需手动调整尺寸。
- 识别结果会输出到浏览器控制台（F12）：`[modelLoader] 识别到 x/14 个标准零件`，未识别的网格仍正常显示，只是不参与点击讲解。

## 四、跨域（CORS）问题解决

通过 URL 加载别的域名下的 GLB 时，浏览器要求对方响应头包含：

```
Access-Control-Allow-Origin: *
```

否则控制台报 `CORS policy` 错误、模型加载失败。解决方案：

1. **优先把 GLB 放到自己的静态服务器**（与页面同源），完全没有跨域问题。
2. 使用支持 CORS 的对象存储/图床：
   - GitHub：把文件提交到仓库，通过 **jsDelivr** 加速访问
     `https://cdn.jsdelivr.net/gh/用户名/仓库@分支/路径/kart.glb`（自带 CORS 头）；
   - Gitee、阿里云 OSS、腾讯云 COS、七牛云：在存储桶「跨域设置 / CORS 规则」中添加
     `AllowedOrigin: *`、`AllowedMethod: GET`、`AllowedHeader: *`。
3. 本地开发临时代理（仅调试用）：

   ```bash
   # 任意静态服务器加代理，例如 http-server 本身无代理时可用 Node 脚本中转
   npx local-cors-proxy --proxyUrl https://目标域名.com
   # 然后用 http://localhost:8010/proxy/kart.glb 访问
   ```

4. 检查 URL 是否能直接在浏览器新标签页打开/下载；若返回 403、404，先修权限再谈 CORS。

## 五、故障排查

| 现象 | 原因与处理 |
| --- | --- |
| 页面空白，控制台报 `Failed to resolve module specifier "three"` | 没有用 HTTP 服务打开（file:// 下 importmap 不生效）。按第一节启动本地服务器 |
| CDN 加载慢/超时（jsDelivr） | 编辑 `index.html` 的 importmap，把 `cdn.jsdelivr.net` 换成 `unpkg.com`，或换 `https://unpkg.com/three@0.160.0/...` |
| GLB 加载失败、提示检查 URL/CORS | ① URL 拼写错误或文件不存在；② 目标服务器未开启 CORS（见第四节）；③ HTTPS 页面加载 HTTP 资源被拦截，改用 HTTPS 链接 |
| 模型加载了但点零件没反应 | 零件未命中关键词。F12 查看识别数量，按第三节在 Blender 中重命名后重新导出 |
| 模型朝向/位置奇怪 | 加载器会自动居中落地，但不会自动判车头方向；可在 Blender 中把车头朝向 +Z 轴再导出 |
| 车轮不转或绕错轴转 | 给旋转网格加 `_spinX/_spinY/_spinZ` 后缀显式指定自转轴；确保名称含 `wheel` 等关键词 |
| 半透明模式下模型发糊/闪烁 | 半透明模式会关闭深度写入以实现透视，属于正常取舍；切回「实体着色」即恢复 |
| 手机上画面卡顿 | 渲染器已限制像素比 ≤2；可进一步在 `sceneSetup.js` 中把 `shadow.mapSize` 降到 1024 |
| 转速表/动画不动 | 确认已点「▶ 启动运转」；速度滑块调到 0.1× 时运动很慢属正常，调回 1× 即可 |
| 控制台报 `缺少零件分组` | 仅内置模型自检警告，正常不会出现；若出现请检查 `kartBuilder.js` 是否被误改 |

## 技术要点速记

- Three.js 版本锁定 **0.160.0**，全部示例模块（OrbitControls、GLTFLoader）经 importmap 以 `three/addons/` 路径引入。
- 内置模型与外部 GLB 输出统一的数据结构 `{ root, parts, roles }`，仿真/拾取/显示模式无需关心模型来源。
- 拾取使用 `Raycaster`，并通过按下/抬起的像素位移阈值区分「点击」与「拖拽旋转」，避免转视角时误选零件。
- 所有源码含中文注释，适合教学逐行讲解。
