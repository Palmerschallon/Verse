export interface EditorState {
  text: string;
  caret: number;
}

export type EditorSubscriber = (state: EditorState) => void;

export class FauxEditor {
  private state: EditorState = { text: "", caret: 0 };
  private readonly subscribers = new Set<EditorSubscriber>();
  private readonly display: HTMLElement;

  constructor(display: HTMLElement) {
    this.display = display;
    this.render();
  }

  subscribe(callback: EditorSubscriber): () => void {
    this.subscribers.add(callback);
    callback(this.state);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  insert(text: string): void {
    if (!text) {
      return;
    }
    const before = this.state.text.slice(0, this.state.caret);
    const after = this.state.text.slice(this.state.caret);
    const nextText = `${before}${text}${after}`;
    const nextCaret = this.state.caret + text.length;
    this.updateState({ text: nextText, caret: nextCaret });
  }

  backspace(): void {
    if (this.state.caret === 0) {
      return;
    }
    const before = this.state.text.slice(0, this.state.caret - 1);
    const after = this.state.text.slice(this.state.caret);
    const nextCaret = this.state.caret - 1;
    this.updateState({ text: `${before}${after}`, caret: nextCaret });
  }

  delete(): void {
    if (this.state.caret >= this.state.text.length) {
      return;
    }
    const before = this.state.text.slice(0, this.state.caret);
    const after = this.state.text.slice(this.state.caret + 1);
    this.updateState({ text: `${before}${after}`, caret: this.state.caret });
  }

  moveCaret(delta: number): void {
    const next = Math.max(0, Math.min(this.state.text.length, this.state.caret + delta));
    if (next !== this.state.caret) {
      this.updateState({ ...this.state, caret: next });
    }
  }

  setText(text: string): void {
    const normalized = text ?? "";
    this.updateState({ text: normalized, caret: Math.min(this.state.caret, normalized.length) });
  }

  getState(): EditorState {
    return { ...this.state };
  }

  private updateState(next: EditorState): void {
    this.state = next;
    this.render();
    this.subscribers.forEach((callback) => callback(this.getState()));
  }

  private render(): void {
    const before = this.state.text.slice(0, this.state.caret);
    const caretChar = this.state.caret < this.state.text.length ? this.state.text[this.state.caret] : "\u00A0";
    const after = this.state.text.slice(this.state.caret + 1);
    this.display.innerHTML = `${this.escape(before)}<span class="editor-caret">${this.escape(caretChar)}</span>${this.escape(after)}`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\u00A0/g, "&nbsp;")
      .replace(/\n/g, "<br>");
  }
}
