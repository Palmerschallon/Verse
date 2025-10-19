export class FauxEditor {
  constructor(display) {
    this.state = { text: "", caret: 0 };
    this.subscribers = new Set();
    this.display = display;
    this.render();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.state);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  insert(text) {
    if (!text) {
      return;
    }
    const before = this.state.text.slice(0, this.state.caret);
    const after = this.state.text.slice(this.state.caret);
    const nextText = `${before}${text}${after}`;
    const nextCaret = this.state.caret + text.length;
    this.updateState({ text: nextText, caret: nextCaret });
  }

  backspace() {
    if (this.state.caret === 0) {
      return;
    }
    const before = this.state.text.slice(0, this.state.caret - 1);
    const after = this.state.text.slice(this.state.caret);
    const nextCaret = this.state.caret - 1;
    this.updateState({ text: `${before}${after}`, caret: nextCaret });
  }

  delete() {
    if (this.state.caret >= this.state.text.length) {
      return;
    }
    const before = this.state.text.slice(0, this.state.caret);
    const after = this.state.text.slice(this.state.caret + 1);
    this.updateState({ text: `${before}${after}`, caret: this.state.caret });
  }

  moveCaret(delta) {
    const next = Math.max(0, Math.min(this.state.text.length, this.state.caret + delta));
    if (next !== this.state.caret) {
      this.updateState({ ...this.state, caret: next });
    }
  }

  setText(text) {
    const normalized = text ?? "";
    this.updateState({ text: normalized, caret: Math.min(this.state.caret, normalized.length) });
  }

  getState() {
    return { ...this.state };
  }

  updateState(next) {
    this.state = next;
    this.render();
    this.subscribers.forEach((callback) => callback(this.getState()));
  }

  render() {
    const before = this.state.text.slice(0, this.state.caret);
    const caretChar = this.state.caret < this.state.text.length ? this.state.text[this.state.caret] : "\u00A0";
    const after = this.state.text.slice(this.state.caret + 1);
    this.display.innerHTML = `${this.escape(before)}<span class="editor-caret">${this.escape(caretChar)}</span>${this.escape(after)}`;
  }

  escape(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\u00A0/g, "&nbsp;")
      .replace(/\n/g, "<br>");
  }
}
