export class SuggestionStrip {
  constructor(config) {
    this.container = config.container;
    this.editor = config.editor;
    this.bind();
  }

  setSuggestions(phrases) {
    const pills = Array.from(this.container.querySelectorAll("button[data-suggestion]"));
    pills.forEach((pill, index) => {
      const suggestion = phrases[index];
      if (suggestion) {
        pill.textContent = suggestion;
        pill.dataset.suggestion = suggestion;
        pill.disabled = false;
        pill.classList.remove("is-hidden");
      } else {
        pill.textContent = "";
        pill.dataset.suggestion = "";
        pill.disabled = true;
        pill.classList.add("is-hidden");
      }
    });
  }

  bind() {
    this.container.addEventListener("click", (event) => {
      const target = event.target;
      if (!target) {
        return;
      }
      const button = target.closest("button[data-suggestion]");
      if (!button || button.disabled) {
        return;
      }
      const value = button.dataset.suggestion ?? "";
      if (value) {
        this.editor.insert(`${value} `);
      }
    });
  }
}
