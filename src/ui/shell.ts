import { compileSeed, CompilationMode } from "../compiler";
import { FauxEditor } from "./editor";
import { VirtualKeyboard } from "./keyboard";
import { SuggestionStrip } from "./strip";

const DEFAULT_SUGGESTIONS = ["ring slow tide", "spiral ghost trails", "one herald"];

export function initShell(): void {
  const drawer = document.querySelector<HTMLElement>("[data-shell-drawer]");
  const drawerToggle = document.querySelector<HTMLButtonElement>("[data-shell-drawer-toggle]");
  const suggestionContainer = document.querySelector<HTMLElement>("[data-suggestion-strip]");
  const keyboardRoot = document.querySelector<HTMLElement>("[data-keyboard]");
  const editorDisplay = document.querySelector<HTMLElement>("[data-editor-display]");
  const logOutput = document.querySelector<HTMLElement>("[data-compile-log]");
  const modeToggles = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode]"));

  if (!drawer || !drawerToggle || !suggestionContainer || !keyboardRoot || !editorDisplay || !logOutput) {
    throw new Error("Shell markup missing required elements.");
  }

  const editor = new FauxEditor(editorDisplay);
  new VirtualKeyboard({ root: keyboardRoot, editor });
  const strip = new SuggestionStrip({ container: suggestionContainer, editor });
  strip.setSuggestions(DEFAULT_SUGGESTIONS);

  let mode: CompilationMode = "seed";

  drawerToggle.addEventListener("click", () => {
    drawer.classList.toggle("is-open");
  });

  if (modeToggles.length > 0) {
    modeToggles.forEach((toggle) => {
      toggle.addEventListener("click", () => {
        mode = (toggle.dataset.mode as CompilationMode) ?? "seed";
        modeToggles.forEach((btn) => btn.classList.toggle("is-active", btn === toggle));
        runCompile(editor.getState().text);
      });
    });
  }

  editor.subscribe((state) => {
    runCompile(state.text);
  });

  function runCompile(text: string): void {
    const trimmed = text.trim();
    const result = compileSeed(trimmed, mode);
    logOutput.textContent = JSON.stringify(result, null, 2);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initShell();
});
