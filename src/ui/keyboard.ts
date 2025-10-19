import { FauxEditor } from "./editor";

type KeyAction =
  | "character"
  | "backspace"
  | "delete"
  | "space"
  | "return"
  | "move-left"
  | "move-right";

interface VirtualKey {
  element: HTMLElement;
  action: KeyAction;
  value: string;
  alternates: string[];
}

interface ActiveKey {
  key: VirtualKey;
  pointerId: number;
  repeatTimeout?: number;
  repeatInterval?: number;
  longPressTimeout?: number;
  scrubOrigin?: {
    x: number;
    caret: number;
  };
  scrubbed?: boolean;
  popover?: HTMLElement;
}

const REPEAT_DELAY = 350;
const REPEAT_INTERVAL = 45;
const LONG_PRESS_DELAY = 420;
const SCRUB_PIXELS_PER_STEP = 10;
const SCRUB_ACTIVATION_THRESHOLD = 6;

export interface VirtualKeyboardOptions {
  root: HTMLElement;
  editor: FauxEditor;
}

export class VirtualKeyboard {
  private readonly keys: VirtualKey[] = [];
  private readonly actives = new Map<number, ActiveKey>();
  private readonly editor: FauxEditor;

  constructor(private readonly options: VirtualKeyboardOptions) {
    this.editor = options.editor;
    this.keys = this.scanKeys(options.root);
    this.keys.forEach((key) => this.bindKey(key));
    this.attachListeners();
  }

  private scanKeys(root: HTMLElement): VirtualKey[] {
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-key]"));
    return elements.map((element) => {
      const action = (element.dataset.action ?? "character") as KeyAction;
      const value = element.dataset.key ?? "";
      const alternates = (element.dataset.alternates ?? "")
        .split("|")
        .map((entry) => entry.trim())
        .filter(Boolean);
      return { element, action, value, alternates };
    });
  }

  private bindKey(key: VirtualKey): void {
    key.element.addEventListener("pointerdown", (event) => this.onPointerDown(event, key));
    key.element.addEventListener("pointerenter", (event) => this.onPointerEnter(event, key));
    key.element.addEventListener("pointerleave", (event) => this.onPointerLeave(event, key));
    key.element.addEventListener("pointerup", (event) => this.onPointerUp(event));
    key.element.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  private onPointerDown(event: PointerEvent, key: VirtualKey): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    key.element.setPointerCapture(event.pointerId);
    key.element.classList.add("is-pressed");
    const active: ActiveKey = { key, pointerId: event.pointerId };
    this.actives.set(event.pointerId, active);

    if (key.action === "space") {
      active.scrubOrigin = { x: event.clientX, caret: this.options.editor.getState().caret };
    } else {
      this.triggerKey(active, false);
    }

    if (key.alternates.length > 0) {
      active.longPressTimeout = window.setTimeout(() => {
        this.openAlternates(active);
      }, LONG_PRESS_DELAY);
    }

    if (key.action !== "space") {
      active.repeatTimeout = window.setTimeout(() => {
        this.triggerKey(active, true);
        active.repeatInterval = window.setInterval(() => this.triggerKey(active, true), REPEAT_INTERVAL);
      }, REPEAT_DELAY);
    }
  }

  private onPointerEnter(event: PointerEvent, key: VirtualKey): void {
    if (!this.actives.has(event.pointerId)) {
      return;
    }
    key.element.classList.add("is-hover");
  }

  private onPointerLeave(event: PointerEvent, key: VirtualKey): void {
    if (!this.actives.has(event.pointerId)) {
      key.element.classList.remove("is-hover");
      return;
    }
    key.element.classList.remove("is-hover");
    key.element.classList.remove("is-pressed");
  }

  private onPointerUp(event: PointerEvent): void {
    const active = this.actives.get(event.pointerId);
    if (!active) {
      return;
    }

    if (active.key.action === "space" && !active.scrubbed) {
      this.editor.insert(" ");
    }

    this.cleanupActive(active);
  }

  private cleanupActive(active: ActiveKey): void {
    active.key.element.releasePointerCapture(active.pointerId);
    active.key.element.classList.remove("is-pressed");
    if (active.repeatTimeout) {
      window.clearTimeout(active.repeatTimeout);
    }
    if (active.repeatInterval) {
      window.clearInterval(active.repeatInterval);
    }
    if (active.longPressTimeout) {
      window.clearTimeout(active.longPressTimeout);
    }
    if (active.popover) {
      active.popover.remove();
    }
    this.actives.delete(active.pointerId);
  }

  private triggerKey(active: ActiveKey, repeating: boolean): void {
    const { key } = active;
    if (active.popover) {
      return;
    }

    switch (key.action) {
      case "character":
        if (key.value) {
          this.editor.insert(key.value);
        }
        break;
      case "backspace":
        this.editor.backspace();
        break;
      case "delete":
        this.editor.delete();
        break;
      case "space":
        if (!active.scrubbed && repeating) {
          this.editor.insert(" ");
        }
        break;
      case "return":
        this.editor.insert("\n");
        break;
      case "move-left":
        this.editor.moveCaret(-1);
        break;
      case "move-right":
        this.editor.moveCaret(1);
        break;
      default:
        break;
    }
  }

  private openAlternates(active: ActiveKey): void {
    const { key } = active;
    if (active.popover || key.alternates.length === 0) {
      return;
    }
    const popover = document.createElement("div");
    popover.className = "vk-popover";
    key.alternates.forEach((alternate) => {
      const option = document.createElement("button");
      option.type = "button";
      option.textContent = alternate;
      option.className = "vk-popover-key";
      option.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        event.preventDefault();
      });
      option.addEventListener("pointerup", (event) => {
        event.stopPropagation();
        event.preventDefault();
        this.editor.insert(alternate);
        popover.remove();
      });
      popover.append(option);
    });
    key.element.append(popover);
    active.popover = popover;
  }

  private attachListeners(): void {
    window.addEventListener("pointermove", (event) => this.onPointerMove(event));
    window.addEventListener("pointerup", (event) => this.onPointerUp(event));
  }

  private onPointerMove(event: PointerEvent): void {
    const active = this.actives.get(event.pointerId);
    if (!active) {
      return;
    }
    if (active.scrubOrigin) {
      const delta = event.clientX - active.scrubOrigin.x;
      if (!active.scrubbed && Math.abs(delta) > SCRUB_ACTIVATION_THRESHOLD) {
        active.scrubbed = true;
      }
      if (active.scrubbed) {
        const steps = Math.trunc(delta / SCRUB_PIXELS_PER_STEP);
        const target = active.scrubOrigin.caret + steps;
        const current = this.editor.getState();
        const clamped = Math.max(0, Math.min(current.text.length, target));
        if (clamped !== current.caret) {
          const diff = clamped - current.caret;
          this.editor.moveCaret(diff);
        }
      }
    }
  }
}
