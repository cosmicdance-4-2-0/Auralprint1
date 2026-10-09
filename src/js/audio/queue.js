/* =============================================================================
   Queue
     Owns the ordered list of files to play and the cursor (current index).
      All track-change entry points (Load, drag-drop, Next, Prev, click-to-jump)
      call into Queue for data, then call loadAndPlay() for the actual playback.
     Queue state is runtime-only until the Playlist module replaces it.
   ========================================================================== */
const Queue = (() => {
  // Each item: { file: File, name: string }
  let _items = [];
  let _cursor = -1; // -1 = nothing loaded

  // Add a file to the end of the queue. Returns the new item index.
  function add(file) {
    _items.push({ file, name: file.name });
    return _items.length - 1;
  }

  // Remove item at index. Adjusts cursor:
  //   - If removing the current track: cursor stays at same index (now points to
  //     the next track), clamped to valid range. Returns the new current file
  //     (or null if queue is now empty) so the caller can decide whether to load it.
  //   - If removing a track before the cursor: cursor decrements to stay on same track.
  //   - If removing a track after the cursor: cursor unchanged.
  function remove(index) {
    if (index < 0 || index >= _items.length) return null;
    _items.splice(index, 1);
    if (_items.length === 0) {
      _cursor = -1;
      return null;
    }
    if (index < _cursor) {
      _cursor -= 1; // track before us removed; stay on same track
    } else if (index === _cursor) {
      _cursor = Math.min(_cursor, _items.length - 1); // removed current; point to next (or last)
    }
    // index > _cursor: cursor unchanged
    return _items[_cursor] ? _items[_cursor].file : null;
  }

  // Remove all items and reset cursor.
  function clear() {
    _items = [];
    _cursor = -1;
  }

  // Move cursor to index and return that file, or null if out of range.
  function goTo(index) {
    if (index < 0 || index >= _items.length) return null;
    _cursor = index;
    return _items[_cursor].file;
  }

  // Advance to next track. Returns file, or null if already at end (or queue empty).
  function next() {
    if (!canNext()) return null;
    _cursor += 1;
    return _items[_cursor].file;
  }

  // Move to previous track. Returns file, or null if already at start (or queue empty).
  function prev() {
    if (!canPrev()) return null;
    _cursor -= 1;
    return _items[_cursor].file;
  }

  // The file currently at the cursor, or null.
  function current() {
    if (_cursor < 0 || _cursor >= _items.length) return null;
    return _items[_cursor].file;
  }

  // Runtime-only opaque identity handles. Each add() creates a distinct entry,
  // even for the same File. Callers must not mutate or serialize these objects.
  function entryAt(index) { return _items[index] || null; }
  function currentEntry() { return entryAt(_cursor); }

  function canNext() { return _items.length > 0 && _cursor < _items.length - 1; }
  function canPrev() { return _items.length > 0 && _cursor > 0; }

  // One-time queue reorder. Preserves currently playing track/cursor item.
  function shuffle() {
    if (_items.length < 3) return false;

    const currentItem = (_cursor >= 0 && _cursor < _items.length) ? _items[_cursor] : null;

    for (let i = _items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_items[i], _items[j]] = [_items[j], _items[i]];
    }

    if (currentItem) _cursor = _items.indexOf(currentItem);
    return true;
  }

  // Read-only snapshot for UI rendering — returns plain objects, not file refs.
  function snapshot() {
    return {
      items: _items.map((it, i) => ({ index: i, name: it.name, active: i === _cursor })),
      cursor: _cursor,
      length: _items.length,
    };
  }

  return { add, remove, clear, goTo, next, prev, current, entryAt, currentEntry, canNext, canPrev, shuffle, snapshot,
    get length() { return _items.length; },
    get currentIndex() { return _cursor; },
    // Direct cursor write — used when add() triggers the first auto-play.
    setCursor(i) { if (i >= 0 && i < _items.length) _cursor = i; },
  };
})();

export { Queue };
