export class VerseEngine {
  constructor(canvas) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Canvas 2D context unavailable");
    }
    this.canvas = canvas;
    this.context = context;
    this.animationFrame = null;
    this.lastTimestamp = 0;
    this.params = null;
    this.configure();
  }

  configure() {
    const { devicePixelRatio } = window;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.floor(width * devicePixelRatio);
    this.canvas.height = Math.floor(height * devicePixelRatio);
    this.context.scale(devicePixelRatio, devicePixelRatio);
  }

  setParams(params) {
    this.params = params;
  }

  start() {
    if (this.animationFrame !== null) {
      return;
    }
    this.lastTimestamp = performance.now();
    const tick = (timestamp) => {
      const delta = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;
      this.draw({ timeMs: timestamp, deltaMs: delta });
      this.animationFrame = window.requestAnimationFrame(tick);
    };
    this.animationFrame = window.requestAnimationFrame(tick);
  }

  stop() {
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  draw(frame) {
    const { context, canvas } = this;
    context.fillStyle = "rgba(8, 8, 12, 0.6)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.params) {
      return;
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const count = Math.max(1, Math.floor(this.params.count));
    const radius = Math.min(centerX, centerY) * 0.6;
    const tempo = this.params.tempoHz;
    const time = frame.timeMs / 1000;

    for (let i = 0; i < count; i += 1) {
      const angle = ((i / count) * Math.PI * 2 + time * tempo) % (Math.PI * 2);
      const jitter = this.params.tremor * Math.sin(time * 3.1 + i);
      const x = centerX + Math.cos(angle) * (radius + jitter * 40);
      const y = centerY + Math.sin(angle) * (radius + jitter * 40);
      context.fillStyle = this.params.herald && i === 0 ? "#ff5555" : "#d0d7ff";
      context.beginPath();
      context.arc(x, y, this.params.pull * 6 + 2, 0, Math.PI * 2);
      context.fill();
    }
  }
}
