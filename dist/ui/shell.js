import { compileSeed } from "../compiler.js";
import { FauxEditor } from "./editor.js";
import { VirtualKeyboard } from "./keyboard.js";
import { SuggestionStrip } from "./strip.js";

const DEFAULT_SUGGESTIONS = ["ring slow tide", "spiral ghost trails", "one herald"];

export function initShell() {
  const drawer = document.querySelector("[data-shell-drawer]");
  const drawerToggle = document.querySelector("[data-shell-drawer-toggle]");
  const suggestionContainer = document.querySelector("[data-suggestion-strip]");
  const keyboardRoot = document.querySelector("[data-keyboard]");
  const editorDisplay = document.querySelector("[data-editor-display]");
  const logOutput = document.querySelector("[data-compile-log]");
  const modeToggles = Array.from(document.querySelectorAll("[data-mode]"));

  if (!drawer || !drawerToggle || !suggestionContainer || !keyboardRoot || !editorDisplay || !logOutput) {
    throw new Error("Shell markup missing required elements.");
  }

  const editor = new FauxEditor(editorDisplay);
  new VirtualKeyboard({ root: keyboardRoot, editor });
  const strip = new SuggestionStrip({ container: suggestionContainer, editor });
  strip.setSuggestions(DEFAULT_SUGGESTIONS);

  let mode = "seed";

  drawerToggle.addEventListener("click", () => {
    drawer.classList.toggle("is-open");
  });

  if (modeToggles.length > 0) {
    modeToggles.forEach((toggle) => {
      toggle.addEventListener("click", () => {
        mode = toggle.dataset.mode ?? "seed";
        modeToggles.forEach((btn) => btn.classList.toggle("is-active", btn === toggle));
        runCompile(editor.getState().text);
      });
    });
  }

  editor.subscribe((state) => {
    runCompile(state.text);
  });

  function runCompile(text) {
    const trimmed = text.trim();
    const result = compileSeed(trimmed, mode);
    logOutput.textContent = JSON.stringify(result, null, 2);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initShell();
});
