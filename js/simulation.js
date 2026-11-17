/**
 * simulation.js —— 卡丁车运转仿真
 *
 * 仿真内容：
 *  - 周期性转向输入：前轮绕转向节左右摆动，方向盘/转向拉杆同步联动
 *  - 周期性油门输入：车速、车轮转速、发动机转速(RPM)联动
 *  - 油门/刹车踏板随输入上下摆动
 *  - 发动机怠速抖动，离合与主动链轮按发动机转速旋转
 *  - 后轮、后桥、从动链轮、刹车盘按车轮转速旋转
 *
 * 时间均乘以“动画速度系数”，因此调速滑块直接改变仿真快慢。
 */

const WHEEL_RADIUS = 0.33;   // 名义车轮半径（与内置模型一致）
const IDLE_RPM = 1200;       // 怠速转速
const MAX_RPM = 6000;        // 最高转速
const MAX_SPEED = 6.5;       // 最高车速 m/s（约 23 km/h）
const STEER_ANGLE = 0.45;    // 前轮最大转角（弧度）
const STEER_PERIOD = 4.5;    // 一个转向周期（秒，1× 速度下）
const THROTTLE_PERIOD = 6;   // 一个油门周期（秒）

export class Simulation {
  constructor() {
    this.roles = null;
    this.running = false;
    this.speedScale = 1;      // 动画速度倍率（0.1 ~ 3）
    this.time = 0;            // 仿真累计时间
    this.vehicleSpeed = 0;    // 当前车速 m/s
    this.rpm = 0;
    this.steer = 0;           // 当前前轮转角
    this.throttle = 0;        // 油门开度 0~1
    this.brake = 0;           // 刹车量 0~1
    this.gear = 'N';
    this._dtScaled = 0;       // 已乘速度系数的帧间隔
    /** 上一次遥测数据，避免每帧重复刷新 UI */
    this._lastTelemetry = '';
    this.onTelemetry = null;  // 遥测回调（由 UI 模块注入）

    // 零件初始位姿快照（用于在初始位姿上叠加运动量）
    this._snapshot = null;
  }

  /** 切换模型后重新绑定运动角色 */
  setRoles(roles) {
    this.roles = roles;
    this.time = 0;
    this.vehicleSpeed = 0;
    this.rpm = 0;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this._snapshot = this._takeSnapshot(roles);
  }

  /** 记录拉杆、踏板、发动机的初始位姿 */
  _takeSnapshot(roles) {
    const s = { tieRod: null, engine: null, pedals: {} };
    if (roles.tieRod) s.tieRod = { x: roles.tieRod.position.x };
    if (roles.engine) {
      s.engine = {
        y: roles.engineBaseY ?? roles.engine.position.y,
        rz: roles.engine.rotation.z
      };
    }
    for (const key of ['throttle', 'brake']) {
      const p = roles.pedals[key];
      if (p) s.pedals[key] = { rx: p.rotation.x };
    }
    return s;
  }

  start() { this.running = true; }
  stop() { this.running = false; }
  toggle() { this.running = !this.running; return this.running; }
  setSpeedScale(v) { this.speedScale = v; }

  /**
   * 每帧驱动
   * @param {number} delta 真实帧间隔（秒）
   */
  update(delta) {
    if (!this.roles) return;
    const dt = Math.min(delta, 0.05) * this.speedScale;
    this._dtScaled = dt;

    if (this.running) {
      this.time += dt;
      // ---- 周期性输入曲线 ----
      // 转向：正弦往复，模拟左右打方向
      this.steer = Math.sin((this.time / STEER_PERIOD) * Math.PI * 2) * STEER_ANGLE;
      // 油门：0→1→0 的平滑周期曲线
      this.throttle = (Math.sin((this.time / THROTTLE_PERIOD) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      // 油门低谷期带一点刹车
      this.brake = this.throttle < 0.25 ? (0.25 - this.throttle) * 2.2 : 0;

      // ---- 车速随油门平滑爬升，刹车时回落 ----
      const targetSpeed = this.throttle * MAX_SPEED * (1 - this.brake);
      this.vehicleSpeed += (targetSpeed - this.vehicleSpeed) * Math.min(dt * 1.4, 1);

      // ---- 转速：怠速 + 油门开度映射，叠加轻微抖动 ----
      const targetRpm = IDLE_RPM + this.throttle * (MAX_RPM - IDLE_RPM);
      const jitter = (Math.random() - 0.5) * 60;
      this.rpm += (targetRpm + jitter - this.rpm) * Math.min(dt * 6, 1);
    } else {
      // 停机：各状态量平滑归零
      this.steer *= Math.max(0, 1 - dt * 4);
      this.throttle = 0;
      this.brake = 0;
      this.vehicleSpeed *= Math.max(0, 1 - dt * 3);
      this.rpm *= Math.max(0, 1 - dt * 3);
    }

    this.gear = this.vehicleSpeed > 0.5 ? 'D' : 'N';
    this._applyMotion();
    this._emitTelemetry();
  }

  /** 把计算结果写入各零件的变换 */
  _applyMotion() {
    const r = this.roles;
    const snap = this._snapshot;

    // 车轮角速度（弧度/秒）= 线速度 / 半径
    const wheelOmega = this.vehicleSpeed / WHEEL_RADIUS;
    // 发动机端角速度（离合、主动链轮）
    const engineOmega = (this.rpm / 60) * Math.PI * 2;

    // ---- 全部自旋件：发动机端角色按转速转，其余按车轮转速转 ----
    for (const item of r.spin) {
      const omega = item.rate === 'engine' ? engineOmega : wheelOmega;
      item.object.rotation[item.axis || 'x'] += omega * this._dtScaled;
    }

    // ---- 前轮转向节左右摆动 ----
    for (const pivot of r.steerPivots) {
      pivot.rotation.y = this.steer;
    }

    // ---- 方向盘联动（转向传动比约 6：方向盘转角 = 轮转角 × 6） ----
    if (r.steeringWheel) {
      r.steeringWheel.rotation.y = this.steer * 6;
    }

    // ---- 转向拉杆横向小幅平移 ----
    if (r.tieRod && snap.tieRod) {
      r.tieRod.position.x = snap.tieRod.x - Math.sin(this.steer) * 0.09;
    }

    // ---- 踏板摆动（绕本地 X 轴） ----
    if (r.pedals.throttle && snap.pedals.throttle) {
      r.pedals.throttle.rotation.x = snap.pedals.throttle.rx + this.throttle * 0.45;
    }
    if (r.pedals.brake && snap.pedals.brake) {
      r.pedals.brake.rotation.x = snap.pedals.brake.rx + this.brake * 0.45;
    }

    // ---- 发动机抖动：转速越高抖动越明显 ----
    if (r.engine && snap.engine) {
      const intensity = this.rpm / MAX_RPM;
      r.engine.position.y = snap.engine.y + (Math.random() - 0.5) * 0.012 * intensity;
      r.engine.rotation.z = snap.engine.rz + (Math.random() - 0.5) * 0.01 * intensity;
    }
  }

  /** 推送转速/车速/挡位遥测数据给 UI（数值不变时跳过，减少 DOM 刷新） */
  _emitTelemetry() {
    if (!this.onTelemetry) return;
    const kmh = Math.round(this.vehicleSpeed * 3.6);
    const rpm = Math.round(this.rpm);
    // 数据未变化时不刷新，减少 DOM 操作
    const sig = `${kmh}|${rpm}|${this.gear}`;
    if (sig === this._lastTelemetry) return;
    this._lastTelemetry = sig;
    this.onTelemetry({ speed: kmh, rpm, gear: this.gear });
  }
}
