/**
 * ui.js —— 界面交互控制
 *
 * 统一管理控制面板上的所有按钮/滑块、零件讲解面板、
 * Canvas 转速表绘制、加载遮罩与 Toast 提示。
 * 本模块只负责 DOM 交互，具体 3D 行为通过回调交给 main.js。
 */
import { PART_INFO } from './config.js';

export class UIController {
  /**
   * @param {object} handlers 回调集合
   * @param {(url:string)=>void} handlers.onLoadGLB
   * @param {()=>void} handlers.onUseBuiltin
   * @param {()=>void} handlers.onResetView
   * @param {(mode:string)=>void} handlers.onDisplayMode
   * @param {()=>void} handlers.onToggleRun
   * @param {(v:number)=>void} handlers.onSpeedChange
   * @param {()=>void} handlers.onClearSelect
   */
  constructor(handlers) {
    this.h = handlers;
    this.$ = (sel) => document.querySelector(sel);
    this.toastTimer = null;
    this._bindStaticEvents();
    this._initRpmCanvas();
  }

  /* ---------------- 静态按钮事件 ---------------- */
  _bindStaticEvents() {
    // 面板折叠（移动端友好）
    this.$('#panel-toggle').addEventListener('click', () => {
      this.$('#control-panel').classList.toggle('collapsed');
    });

    // 模型加载
    this.$('#btn-load-glb').addEventListener('click', () => {
      const url = this.$('#glb-url').value.trim();
      if (!url) return this.showToast('请先输入 GLB 模型的 URL');
      this.h.onLoadGLB(url);
    });
    this.$('#btn-use-builtin').addEventListener('click', () => this.h.onUseBuiltin());

    // 视角
    this.$('#btn-reset-view').addEventListener('click', () => this.h.onResetView());

    // 显示模式
    this.$('#display-mode-group').addEventListener('click', (e) => {
      const btn = e.target.closest('.mode-btn');
      if (!btn) return;
      this.$('.mode-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      this.h.onDisplayMode(btn.dataset.mode);
    });

    // 运转开关
    this.$('#btn-run-toggle').addEventListener('click', () => this.h.onToggleRun());

    // 动画调速
    const slider = this.$('#speed-slider');
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      this.$('#speed-value').textContent = `${v.toFixed(1)}×`;
      this.h.onSpeedChange(v);
    });

    // 重置选中
    this.$('#btn-clear-select').addEventListener('click', () => this.h.onClearSelect());

    // 关闭讲解面板
    this.$('#info-close').addEventListener('click', () => this.h.onClearSelect());
  }

  /* ---------------- 零件讲解面板 ---------------- */

  /** 显示/隐藏零件讲解面板 */
  showPartInfo(id) {
    const panel = this.$('#info-panel');
    if (!id) {
      panel.classList.add('hidden');
      return;
    }
    const info = PART_INFO[id];
    if (!info) return;
    this.$('#info-title').textContent = info.name;
    this.$('#info-function').textContent = info.func;
    this.$('#info-principle').textContent = info.principle;
    this.$('#info-keywords').textContent = info.aliases.join('、');
    panel.classList.remove('hidden');
  }

  /* ---------------- 运转按钮状态 ---------------- */
  setRunState(running) {
    const btn = this.$('#btn-run-toggle');
    btn.textContent = running ? '■ 停止运转' : '▶ 启动运转';
    btn.classList.toggle('btn-stop', running);
    btn.classList.toggle('btn-primary', !running);
  }

  /* ---------------- 加载遮罩 ---------------- */
  showLoading(text = '正在加载模型…') {
    this.$('#loading-text').textContent = text;
    this.$('#progress-fill').style.width = '0%';
    this.$('#loading-overlay').classList.remove('hidden');
  }
  updateProgress(percent) {
    this.$('#progress-fill').style.width = `${percent}%`;
    this.$('#loading-text').textContent = `正在下载模型… ${percent}%`;
  }
  hideLoading() {
    this.$('#loading-overlay').classList.add('hidden');
  }

  /* ---------------- Toast ---------------- */
  showToast(message, duration = 2600) {
    const el = this.$('#toast');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
  }

  /* ---------------- Canvas 转速表 ---------------- */
  _initRpmCanvas() {
    this.rpmCanvas = this.$('#rpm-canvas');
    this.rpmCtx = this.rpmCanvas.getContext('2d');
    this.drawTachometer(0);
  }

  /**
   * 绘制半圆转速表
   * @param {number} rpm 当前转速
   */
  drawTachometer(rpm) {
    const ctx = this.rpmCtx;
    const W = this.rpmCanvas.width;
    const H = this.rpmCanvas.height;
    const cx = W / 2;
    const cy = H - 14;
    const R = 70;
    const MAX_RPM = 6000;

    ctx.clearRect(0, 0, W, H);

    // 刻度弧背景（180° → 0° 的半圆）
    const startAngle = Math.PI;
    const endAngle = 0;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAngle, endAngle);
    ctx.stroke();

    // 数值弧：低转速蓝色，超过 4800 转进入红色警示区
    const ratio = Math.min(rpm / MAX_RPM, 1);
    const valueAngle = startAngle + (endAngle - startAngle) * ratio;
    ctx.strokeStyle = ratio > 0.8 ? '#ef4444' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAngle, valueAngle, true);
    ctx.stroke();

    // 刻度线与数字
    ctx.fillStyle = '#8b98a8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 6; i++) {
      const a = startAngle + (endAngle - startAngle) * (i / 6);
      const x1 = cx + Math.cos(a) * (R - 12);
      const y1 = cy + Math.sin(a) * (R - 12);
      const x2 = cx + Math.cos(a) * (R - 20);
      const y2 = cy + Math.sin(a) * (R - 20);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const tx = cx + Math.cos(a) * (R - 32);
      const ty = cy + Math.sin(a) * (R - 32) + 3;
      ctx.fillText(String(i), tx, ty);
    }

    // 指针
    ctx.strokeStyle = '#e6edf3';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(valueAngle) * (R - 16), cy + Math.sin(valueAngle) * (R - 16));
    ctx.stroke();
    ctx.fillStyle = '#e6edf3';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // 中心数字读数
    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(`${Math.round(rpm)}`, cx, cy - 22);
    ctx.fillStyle = '#8b98a8';
    ctx.font = '10px sans-serif';
    ctx.fillText('RPM ×1000', cx, cy - 8);
  }

  /** 更新车速/挡位数字 */
  updateTelemetry({ speed, rpm, gear }) {
    this.$('#telemetry-speed').textContent = speed;
    this.$('#telemetry-gear').textContent = gear;
    this.drawTachometer(rpm);
  }
}
