// A bounded DOM harness for generated controls, delegated bubbling and focus.
// Native DOM/dialog behavior is verified separately by optional Chromium checks.
export function installUiDocument() {
  const previous = globalThis.document;
  const doc = { activeElement: null };
  function element(tag = "div") {
    const listeners = new Map();
    const node = {
      tagName: tag.toUpperCase(), children: [], parentNode: null, dataset: {}, attributes: {},
      value: "", className: "", open: false, checked: false, hidden: false, replacements: 0,
      _text: "",
      get textContent() { return this._text + this.children.map(child => child.textContent).join(""); },
      set textContent(value) { this._text = String(value); this.children = []; },
      set innerHTML(_value) { throw Error("Use safe textContent"); },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name]; },
      append(...nodes) { for (const child of nodes) this.appendChild(child); },
      appendChild(child) {
        if (child.isFragment) { for (const entry of [...child.children]) this.appendChild(entry); return child; }
        child.remove(); child.parentNode = this; this.children.push(child); return child;
      },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; },
      replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes); this.replacements++; },
      contains(target) { return this === target || this.children.some(child => child.contains(target)); },
      matches(selector) {
        if (selector === "button[data-action]") return this.tagName === "BUTTON" && !!this.dataset.action;
        const match = /^\[data-action="([a-z-]+)"\]$/.exec(selector);
        if (!match) throw Error(`Unsupported harness selector: ${selector}`);
        return this.dataset.action === match[1];
      },
      closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector); },
      querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
      addEventListener(type, fn) { const entries = listeners.get(type) || []; entries.push(fn); listeners.set(type, entries); },
      listenerCount(type) { return (listeners.get(type) || []).length; },
      dispatchEvent(event) {
        if (!event.target) event.target = this;
        for (const fn of listeners.get(event.type) || []) fn(event);
        if (event.bubbles) this.parentNode?.dispatchEvent(event);
        return true;
      },
      click() { this.dispatchEvent({ type: "click", bubbles: true }); },
      focus() { doc.activeElement = this; },
    };
    return node;
  }
  doc.createElement = element;
  doc.createDocumentFragment = () => Object.assign(element(), { isFragment: true });
  globalThis.document = doc;
  return { document: doc, element, restore() { globalThis.document = previous; } };
}
