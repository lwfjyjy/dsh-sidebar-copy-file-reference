window.__ModuleLoader__.load({
  id: '@lwfjyjy/copy-file-reference',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'copyFileReference';

    /** Chinese dictionary doubles as the fallback when the locale service is absent. */
    const DEFAULT_LABELS = {
      copy: '复制引用',
      copied: '已复制',
      fail: '复制失败',
      insert: '插入',
      inserted: '已插入',
      insertFail: '插入失败',
      toolbarLabel: '文件引用操作',
    };
    const zh = DEFAULT_LABELS;
    const en = {
      copy: 'Copy reference',
      copied: 'Copied',
      fail: 'Copy failed',
      insert: 'Insert',
      inserted: 'Inserted',
      insertFail: 'Insert failed',
      toolbarLabel: 'File reference actions',
    };

    // The document preview exposes no API for its selection, so line numbers are
    // derived from the rendered code block. The header probe is session-scoped and
    // publishes the current file prefix plus the composer's insert action here.
    let currentDoc = null;

    /** Turn an absolute path into a workspace-relative path using the session cwd. */
    function toRelativePath(absolutePath, cwd) {
      if (typeof absolutePath !== 'string' || absolutePath === '') return '';
      const p = absolutePath.replace(/\\/g, '/');
      if (typeof cwd === 'string' && cwd !== '') {
        const root = cwd.replace(/\\/g, '/').replace(/\/+$/, '');
        if (p === root) return '';
        if (p.startsWith(root + '/')) return p.slice(root.length + 1);
      }
      return p;
    }

    /** Invisible seat in the document header that publishes the prefix and insert action. */
    function DocProbe(props) {
      const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd);
      const inputActions = props.inputActions;
      React.useEffect(() => {
        const insert =
          inputActions && typeof inputActions.insertText === 'function'
            ? (text) => {
                try {
                  return inputActions.insertText(text + ' ', inputActions.captureInsertion()) !== false;
                } catch (e) {
                  return false;
                }
              }
            : null;
        const mine = { prefix: '@' + toRelativePath(props.absolutePath, cwd), insert };
        currentDoc = mine;
        return () => {
          if (currentDoc === mine) currentDoc = null;
        };
      }, [props.absolutePath, cwd, inputActions]);
      return null;
    }

    /** All rendered source-line elements of one code block. */
    function lineElementsOf(code) {
      return Array.prototype.filter.call(
        code.children,
        (el) => el.nodeType === 1 && el.classList && el.classList.contains('line'),
      );
    }

    /** 1-based line number for one range boundary inside a code block. */
    function boundaryLine(pre, code, lines, container, offset) {
      const el = container.nodeType === 1 ? container : container.parentElement;
      const lineEl = el && el.closest ? el.closest('.line') : null;
      if (lineEl && code.contains(lineEl)) {
        const idx = lines.indexOf(lineEl);
        if (idx >= 0) return idx + 1;
      }
      // Fallback: count newlines between <pre> start and the boundary.
      const range = document.createRange();
      range.selectNodeContents(pre);
      try {
        range.setEnd(container, offset);
      } catch (e) {
        return null;
      }
      const text = range.toString();
      let line = 1;
      for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
      return line;
    }

    /** The reference text and bar geometry for the current non-collapsed selection. */
    function selectionInfo() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !currentDoc) return null;
      const range = sel.getRangeAt(0);
      const startEl = range.startContainer.nodeType === 1
        ? range.startContainer
        : range.startContainer.parentElement;
      const preview = startEl && startEl.closest ? startEl.closest('[data-code-preview]') : null;
      if (!preview) return null;
      const pre = preview.querySelector('pre');
      if (!pre || !pre.contains(range.startContainer) || !pre.contains(range.endContainer)) return null;
      const code = pre.querySelector('code') || pre;
      const lines = lineElementsOf(code);

      let start = boundaryLine(pre, code, lines, range.startContainer, range.startOffset);
      let end = boundaryLine(pre, code, lines, range.endContainer, range.endOffset);
      if (start == null || end == null) return null;
      if (end < start) [start, end] = [end, start];
      // A boundary at the very start of a later line does not really include that line.
      if (range.endOffset === 0 && end > start) {
        const endEl = range.endContainer.nodeType === 1
          ? range.endContainer
          : range.endContainer.parentElement;
        const endLineEl = endEl && endEl.closest ? endEl.closest('.line') : null;
        if (endLineEl && code.contains(endLineEl)) {
          const head = document.createRange();
          head.selectNodeContents(endLineEl);
          try {
            head.setEnd(range.endContainer, range.endOffset);
          } catch (e) {
            /* keep end */
          }
          if (head.toString().trim() === '') end -= 1;
        }
      }
      const rect = preview.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 60) return null;
      const rangeText = start === end ? '#L' + start : '#L' + start + '-L' + end;
      return { text: currentDoc.prefix + rangeText, rect };
    }

    /** The `.line` element a mouse gesture landed on, inside a code preview. */
    function lineFromEvent(event) {
      const targetEl = event.target && (event.target.nodeType === 1
        ? event.target
        : event.target.parentElement);
      let lineEl = targetEl && targetEl.closest ? targetEl.closest('.line') : null;
      if (lineEl && lineEl.closest('[data-code-preview]')) return lineEl;
      let node = null;
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(event.clientX, event.clientY);
        node = range && range.startContainer;
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
        node = pos && pos.offsetNode;
      }
      const caretEl = node && (node.nodeType === 1 ? node : node.parentElement);
      lineEl = caretEl && caretEl.closest ? caretEl.closest('.line') : null;
      return lineEl && lineEl.closest('[data-code-preview]') ? lineEl : null;
    }

    /** Visually select a whole source line. */
    function selectLine(lineEl) {
      const range = document.createRange();
      range.selectNodeContents(lineEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    /** Keys whose keyup may produce a keyboard text selection. */
    function isSelectionKey(event) {
      const k = event.key;
      return (
        k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' ||
        k === 'Home' || k === 'End' || k === 'PageUp' || k === 'PageDown' ||
        ((k === 'a' || k === 'A') && (event.metaKey || event.ctrlKey))
      );
    }

    /** Resolve one pointer/keyboard gesture into the reference text and bar rectangle. */
    function resolveGesture(event) {
      const isKey = event.type === 'keyup';
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !currentDoc) return null;

      // Single click on a line: select the whole line and reference it.
      if (sel.isCollapsed) {
        if (isKey) return null;
        const lineEl = lineFromEvent(event);
        const code = lineEl && lineEl.parentElement;
        const preview = lineEl && lineEl.closest('[data-code-preview]');
        const idx = code ? lineElementsOf(code).indexOf(lineEl) : -1;
        if (!preview || idx < 0) return null;
        const rect = preview.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 60) return null;
        selectLine(lineEl);
        return { text: currentDoc.prefix + '#L' + (idx + 1), rect };
      }

      // Drag or keyboard selection: reference the selected range.
      if (isKey && !isSelectionKey(event)) return null;
      if (!isKey) {
        const tgt = event.target;
        if (!(tgt && tgt.closest && tgt.closest('[data-code-preview]'))) return null;
      }
      return selectionInfo();
    }

    function makeBar(text, rect) {
      const width = Math.min(Math.max(rect.width - 24, 220), 720);
      return {
        text,
        left: Math.round(rect.left + (rect.width - width) / 2),
        top: Math.round(rect.bottom - 52),
        width: Math.round(width),
      };
    }

    /** Clipboard write through the async API; false when it is unavailable or rejected. */
    async function writeClipboard(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (e) {
        /* ignore */
      }
      return false;
    }

    const CSS =
      '.dshCopyRefBar{position:fixed;z-index:2147483000;pointer-events:auto;box-sizing:border-box;' +
      'display:flex;align-items:center;gap:8px;height:40px;padding:0 8px 0 12px;' +
      'background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);' +
      'border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.18);font-family:inherit;}' +
      '.dshCopyRefText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}' +
      '.dshCopyRefBtn{flex:none;display:inline-flex;align-items:center;justify-content:center;' +
      'height:28px;padding:0 12px;border-radius:6px;font-size:12px;line-height:1;white-space:nowrap;' +
      'font-family:inherit;cursor:pointer;box-sizing:border-box;}' +
      '.dshCopyRefBtn--primary{background:var(--dsw-alias-brand-primary);color:#fff;border:1px solid transparent;}' +
      '.dshCopyRefBtn--ghost{background:transparent;color:var(--dsw-alias-brand-primary);' +
      'border:1px solid var(--dsw-alias-brand-primary);}' +
      '.dshCopyRefBtn[data-state="success"]{background:var(--dsw-alias-state-success-primary);' +
      'border-color:var(--dsw-alias-state-success-primary);color:#fff;}' +
      '.dshCopyRefBtn:hover{filter:brightness(.95);}' +
      '.dshCopyRefBtn:active{transform:translateY(.5px);}' +
      '.dshCopyRefBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}';

    /** Feedback state helper: flash one of 'done' | 'fail' for a short while. */
    function useFlash(durationMs) {
      const [state, setState] = React.useState(false);
      const timer = React.useRef(0);
      React.useEffect(() => () => {
        if (timer.current) window.clearTimeout(timer.current);
      }, []);
      const flash = React.useCallback((ok) => {
        setState(ok ? 'done' : 'fail');
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState(false), durationMs);
      }, [durationMs]);
      return [state, flash];
    }

    function SelectionToolbar(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => DEFAULT_LABELS[key] || key;
      const [bar, setBar] = React.useState(null);
      const [copyState, flashCopy] = useFlash(1500);
      const [insertState, flashInsert] = useFlash(1500);

      const copy = React.useCallback((text) => {
        writeClipboard(text).then(flashCopy);
      }, [flashCopy]);

      const insert = React.useCallback((text) => {
        let ok = false;
        try {
          ok = !!(currentDoc && currentDoc.insert && currentDoc.insert(text));
        } catch (e) {
          ok = false;
        }
        flashInsert(ok);
      }, [flashInsert]);

      React.useEffect(() => {
        let raf = 0;
        const layout = () => {
          raf = 0;
          let info = null;
          try {
            info = selectionInfo();
          } catch (e) {
            info = null;
          }
          setBar(info ? makeBar(info.text, info.rect) : null);
        };
        const schedule = () => {
          if (!raf) raf = window.requestAnimationFrame(layout);
        };
        // Gestures auto-copy; layout-only updates (selection/scroll/resize) never do.
        const gesture = (event) => {
          let resolved = null;
          try {
            resolved = resolveGesture(event);
          } catch (e) {
            resolved = null;
          }
          if (!resolved) {
            schedule();
            return;
          }
          copy(resolved.text);
          setBar(makeBar(resolved.text, resolved.rect));
        };

        document.addEventListener('selectionchange', schedule);
        document.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        document.addEventListener('mouseup', gesture, true);
        document.addEventListener('keyup', gesture, true);
        schedule();
        return () => {
          if (raf) window.cancelAnimationFrame(raf);
          document.removeEventListener('selectionchange', schedule);
          document.removeEventListener('scroll', schedule, true);
          window.removeEventListener('resize', schedule);
          document.removeEventListener('mouseup', gesture, true);
          document.removeEventListener('keyup', gesture, true);
        };
      }, [copy]);

      if (!bar) return null;

      const copyLabel = copyState === 'done' ? t('copied') : copyState === 'fail' ? t('fail') : t('copy');
      const insertLabel =
        insertState === 'done' ? t('inserted') : insertState === 'fail' ? t('insertFail') : t('insert');

      return h(
        React.Fragment,
        null,
        h('style', { key: 'style' }, CSS),
        h(
          'div',
          {
            key: 'bar',
            className: 'dshCopyRefBar',
            role: 'toolbar',
            'aria-label': t('toolbarLabel'),
            style: { left: bar.left + 'px', top: bar.top + 'px', width: bar.width + 'px' },
            // Keep the code selection alive while interacting with the toolbar.
            onMouseDown: (e) => e.preventDefault(),
          },
          h('span', { className: 'dshCopyRefText', title: bar.text }, bar.text),
          h(
            'button',
            {
              key: 'copy',
              type: 'button',
              className: 'dshCopyRefBtn dshCopyRefBtn--primary',
              'data-state': copyState === 'done' ? 'success' : undefined,
              onClick: () => copy(bar.text),
            },
            copyLabel,
          ),
          h(
            'button',
            {
              key: 'insert',
              type: 'button',
              className: 'dshCopyRefBtn dshCopyRefBtn--ghost',
              'data-state': insertState === 'done' ? 'success' : undefined,
              onClick: () => insert(bar.text),
            },
            insertLabel,
          ),
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        'copy-file-reference: dictionaries',
      );
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          { name: 'shell.overlay', id: 'copy-file-reference', order: 100, locale: NS },
          SelectionToolbar,
        ),
      );
      ctx.slots.inject('sidebar.right.tab.document.actions', () =>
        ctx.slots.register(
          { name: 'sidebar.right.tab.document.actions', id: 'copy-file-reference-probe', order: 50 },
          DocProbe,
        ),
      );
    }

    return { inject: ['slots', 'locale', 'sessions'], apply };
  },
});
