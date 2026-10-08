// Renderer-visible chronological, read-only collection. Nodes belong to the
// retention governor and this list; unlink releases both ownership links.
class ParticleList {
  constructor() { this.head = null; this.tail = null; this.length = 0; this.birthOrderMonotonic = true; }

  append(node) {
    // Direct/standalone callers may supply older birth times. Flag once in O(1),
    // without changing insertion/render order or scanning normal trails.
    if (this.tail && node.particle.bornSec < this.tail.particle.bornSec) this.birthOrderMonotonic = false;
    node.prev = this.tail;
    node.next = null;
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.length++;
  }

  unlink(node) {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    this.length--;
    if (this.length <= 1) this.birthOrderMonotonic = true;
    node.prev = node.next = node.trail = null;
  }

  *[Symbol.iterator]() {
    for (let node = this.head; node; node = node.next) yield node.particle;
  }

  at(index) {
    if (index < 0) {
      let node = this.tail;
      for (let i = -1; node && i > index; i--) node = node.prev;
      return node?.particle;
    }
    let node = this.head;
    for (let i = 0; node && i < index; i++) node = node.next;
    return node?.particle;
  }

  slice(start = 0) {
    // Trace only needs a chronological suffix, as before the storage change.
    const count = this.length - Math.max(0, start);
    let node = this.tail;
    for (let i = 1; node && i < count; i++) node = node.prev;
    const result = [];
    if (count > 0) for (; node; node = node.next) result.push(node.particle);
    return result;
  }

  *suffix(count) {
    // Visit only the requested suffix; renderer never materializes its payloads.
    count = Math.min(this.length, Math.max(0, Math.ceil(count)));
    if (!(count > 0)) return;
    let node = this.tail;
    for (let i = 1; i < count; i++) node = node.prev;
    for (; node; node = node.next) yield node.particle;
  }
}

export { ParticleList };
