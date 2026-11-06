window.__ModuleLoader__.load({
  id: '@lwfjyjy/dsh-sidebar-copy-file-reference',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // 个别渲染环境没有 useLayoutEffect，退回 useEffect（避免告警且行为一致）。
    const useIsomorphicLayoutEffect = React.useLayoutEffect || React.useEffect;

    const NS = 'sidebarCopyFileReference';

    /** 中文词典同时作为 locale 服务缺席时的兜底文案。 */
    const DEFAULT_LABELS = {
      copy: '复制引用',
      copied: '已复制',
      fail: '复制失败',
      insert: '插入',
      inserted: '已插入',
      insertFail: '插入失败',
      fileCopy: '复制文件引用',
      fileInsert: '插入文件引用',
      toolbarLabel: '文件引用操作',
      close: '关闭',
    };
    const zh = DEFAULT_LABELS;
    const en = {
      copy: 'Copy reference',
      copied: 'Copied',
      fail: 'Copy failed',
      insert: 'Insert',
      inserted: 'Inserted',
      insertFail: 'Insert failed',
      fileCopy: 'Copy file reference',
      fileInsert: 'Insert file reference',
      toolbarLabel: 'File reference actions',
      close: 'Close',
    };

    /**
     * 手绘四枚 24×24 线性图标，数据格式与 morphicons 的 IconNode 一致：
     * 每个图标是 [[标签, 属性], …]，标签支持 path/rect/line/circle 等。
     */
    const MORPH_ICONS = {
      // 拷贝：两张叠在一起的圆角纸片
      copy: [
        ['rect', { x: 8, y: 8, width: 14, height: 14, rx: 2 }],
        ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
      ],
      // 文件插入：左边一页文档（右上折角）+ 右边指向它的插入箭头，合为一个图标
      fileInsert: [
        ['path', { d: 'M5 3h5l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' }],
        ['path', { d: 'M10 3v3h3' }],
        ['path', { d: 'M22 12h-8' }],
        ['path', { d: 'M17 9l-3 3 3 3' }],
      ],
      // 行插入：左边行号竖线 + 两条代码行，右边箭头指向行间（在行间插入）
      lineInsert: [
        ['path', { d: 'M3 6v12' }],
        ['path', { d: 'M7 9h7' }],
        ['path', { d: 'M7 15h7' }],
        ['path', { d: 'M22 12h-8' }],
        ['path', { d: 'M17 9l-3 3 3 3' }],
      ],
      // 钩子：成功反馈
      check: [['path', { d: 'M20 6L9 17l-5-5' }]],
    };
    /** 关闭按钮的 × 还是普通小图标，不参与形变。 */
    const ICON_CLOSE = h('svg', {
      width: 9, height: 9, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
      strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': 'true', focusable: 'false',
    }, h('path', { key: 'x', d: 'M4 4l8 8M12 4l-8 8' }));

    // 文档预览没有暴露选区 API，所以行号只能从已渲染的代码块反推。
    // 头部探针（会话级）把当前文件前缀和输入框的插入动作发布到这里。
    let currentDoc = null;

    // 文档切换（打开/关闭文件）时通知常驻的文件级工具条重新定位。
    const docSubscribers = new Set();
    function publishDoc() {
      docSubscribers.forEach((fn) => {
        try { fn(); } catch (e) { /* 忽略单个订阅者异常 */ }
      });
    }

    /** 把绝对路径转成相对会话工作目录的路径。 */
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

    /** 文本节点取其父元素，元素节点原样返回。 */
    function elementOf(node) {
      return node && (node.nodeType === 1 ? node : node.parentElement);
    }

    /** 从节点向上找最近的匹配元素。 */
    function closestFrom(node, selector) {
      const el = elementOf(node);
      return el && el.closest ? el.closest(selector) : null;
    }

    /** 代码预览区的有效矩形；尺寸过小（未真正展示）时返回 null。 */
    function previewRect(preview) {
      if (!preview) return null;
      const rect = preview.getBoundingClientRect();
      return rect.width < 80 || rect.height < 60 ? null : rect;
    }

    // 页面里可能同时存在多个代码预览（如聊天记录里的代码块），
    // 取最靠右且可见的那个，基本就是右侧栏当前打开的文档。
    function activePreview() {
      let best = null;
      document.querySelectorAll('[data-code-preview]').forEach((el) => {
        const rect = previewRect(el);
        if (rect && (!best || rect.left > best.left)) best = rect;
      });
      return best;
    }

    /** 清掉并复位一个定时器 ref。 */
    function clearTimer(ref) {
      if (ref.current) {
        window.clearTimeout(ref.current);
        ref.current = 0;
      }
    }

    /** 藏在文档头部的隐形探针：发布当前文件前缀和插入动作。 */
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
        publishDoc();
        return () => {
          if (currentDoc === mine) currentDoc = null;
          publishDoc();
        };
      }, [props.absolutePath, cwd, inputActions]);
      return null;
    }

    /** 返回一个代码块里所有已渲染的源码行元素。 */
    function lineElementsOf(code) {
      return Array.from(code.children).filter((el) => el.classList && el.classList.contains('line'));
    }

    /** 计算代码块内某个边界所在的行号（从 1 开始）。 */
    function boundaryLine(pre, lines, container, offset) {
      const lineEl = closestFrom(container, '.line');
      if (lineEl && pre.contains(lineEl)) {
        const idx = lines.indexOf(lineEl);
        if (idx >= 0) return idx + 1;
      }
      // 兜底：统计 <pre> 开头到边界之间的换行数。
      const range = document.createRange();
      range.selectNodeContents(pre);
      try {
        range.setEnd(container, offset);
      } catch (e) {
        return null;
      }
      return range.toString().split('\n').length;
    }

    /** 当前非折叠选区对应的引用文本与浮层位置。 */
    function selectionInfo() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !currentDoc) return null;
      const range = sel.getRangeAt(0);
      const preview = closestFrom(range.startContainer, '[data-code-preview]');
      if (!preview) return null;
      const pre = preview.querySelector('pre');
      if (!pre || !pre.contains(range.startContainer) || !pre.contains(range.endContainer)) return null;
      const lines = lineElementsOf(pre.querySelector('code') || pre);

      let start = boundaryLine(pre, lines, range.startContainer, range.startOffset);
      let end = boundaryLine(pre, lines, range.endContainer, range.endOffset);
      if (start == null || end == null) return null;
      if (end < start) [start, end] = [end, start];
      // 边界落在后一行的开头时，其实不算包含那一行。
      if (range.endOffset === 0 && end > start) {
        const endLineEl = closestFrom(range.endContainer, '.line');
        if (endLineEl && pre.contains(endLineEl)) {
          const head = document.createRange();
          head.selectNodeContents(endLineEl);
          try {
            head.setEnd(range.endContainer, range.endOffset);
          } catch (e) {
            /* 保留原行号 */
          }
          if (head.toString().trim() === '') end -= 1;
        }
      }
      const rect = previewRect(preview);
      if (!rect) return null;
      const rangeText = start === end ? '#L' + start : '#L' + start + '-L' + end;
      return { text: currentDoc.prefix + rangeText, rect };
    }

    /** 鼠标手势落在代码预览里的那一行。 */
    function lineFromEvent(event) {
      let lineEl = closestFrom(event.target, '.line');
      if (lineEl && lineEl.closest('[data-code-preview]')) return lineEl;
      let node = null;
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(event.clientX, event.clientY);
        node = range && range.startContainer;
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
        node = pos && pos.offsetNode;
      }
      lineEl = closestFrom(node, '.line');
      return lineEl && lineEl.closest('[data-code-preview]') ? lineEl : null;
    }

    /** 整行选中一个源码行。 */
    function selectLine(lineEl) {
      const range = document.createRange();
      range.selectNodeContents(lineEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    /** 可能产生键盘选区的按键。 */
    function isSelectionKey(event) {
      const k = event.key;
      return (
        k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' ||
        k === 'Home' || k === 'End' || k === 'PageUp' || k === 'PageDown' ||
        ((k === 'a' || k === 'A') && (event.metaKey || event.ctrlKey))
      );
    }

    /** 把一次鼠标/键盘手势解析成引用文本与浮层矩形。 */
    function resolveGesture(event) {
      const isKey = event.type === 'keyup';
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !currentDoc) return null;

      // 单击某一行：整行选中并引用。
      if (sel.isCollapsed) {
        if (isKey) return null;
        const lineEl = lineFromEvent(event);
        const code = lineEl && lineEl.parentElement;
        const idx = code ? lineElementsOf(code).indexOf(lineEl) : -1;
        const preview = lineEl && lineEl.closest('[data-code-preview]');
        const rect = previewRect(preview);
        if (idx < 0 || !rect) return null;
        selectLine(lineEl);
        return { text: currentDoc.prefix + '#L' + (idx + 1), rect };
      }

      // 拖动或键盘选择：引用选中的范围。
      if (isKey && !isSelectionKey(event)) return null;
      if (!isKey) {
        const tgt = event.target;
        if (!(tgt && tgt.closest && tgt.closest('[data-code-preview]'))) return null;
      }
      return selectionInfo();
    }

    // 原生代码块顶部有一条「语言 + 复制/换行」横幅（约 36~42px），
    // 两组悬浮工具条都要落在它下方，避免遮挡原生复制按钮。
    const BANNER_CLEAR = 48;   // 文件组距代码区顶部：越过原生横幅再留安全间距
    const BAR_HEIGHT = 36;     // 单条工具条高度：30px 按钮 + 上下各 3px 内边距
    const BAR_GAP = 6;         // 两条工具条之间的间距
    const RIGHT_GAP = 12;      // 右侧留白，容纳行组右上角的关闭按钮

    /** 计算浮层在代码预览区右上角的锚点，top 由调用方按需叠加。 */
    function barPosition(rect, topOffset) {
      return {
        top: Math.round(rect.top + topOffset),
        right: Math.round(Math.max(8, window.innerWidth - rect.right + RIGHT_GAP)),
      };
    }

    /** 行引用工具条：锚定在文件组正下方。 */
    function makeBar(text, rect) {
      return { text, ...barPosition(rect, BANNER_CLEAR + BAR_HEIGHT + BAR_GAP) };
    }

    /** 通过异步剪贴板接口写入；不可用或被拒绝时返回 false。 */
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

    /** 复制引用到剪贴板，并以 flash 反馈成功/失败。 */
    function copyReference(text, flash) {
      writeClipboard(text).then(flash);
    }

    /** 把引用插入输入框，并以 flash 反馈结果。 */
    function insertReference(text, flash) {
      let ok = false;
      try {
        ok = !!(currentDoc && currentDoc.insert && currentDoc.insert(text));
      } catch (e) {
        ok = false;
      }
      flash(ok);
    }

    const CSS =
      /* 浮层：DSH 菜单同款毛玻璃质感——半透明底 + 背景模糊 + 统一投影 */
      '.dshCopyRefBar{position:fixed;z-index:2147483000;pointer-events:auto;box-sizing:border-box;' +
      'display:inline-flex;align-items:center;gap:2px;padding:3px;' +
      'font-family:var(--dsw-font-family,inherit);color:var(--dsw-alias-label-primary);' +
      'background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-layer-2));' +
      '-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(30px) saturate(160%));' +
      'backdrop-filter:var(--dsw-menu-backdrop-filter,blur(30px) saturate(160%));' +
      'border-radius:var(--dsw-radius-lg);' +
      '--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);' +
      'box-shadow:var(--dsw-elevation-prominent);' +
      /* 停止态：向右平移“自身一半宽+距右边缘距离”，只露左半 + 半透明 */
      'transform:translateX(var(--dshPeekX,50%));opacity:.5;' +
      'transition:transform .24s cubic-bezier(.2,.8,.3,1),opacity .24s ease;' +
      /* 进场：从屏幕右侧滑出、落到“半透明只露一半”的停止态（新增/切换统一用这一套） */
      'animation:dshCopyRefIn .3s cubic-bezier(.2,.8,.3,1);}' +
      '@keyframes dshCopyRefIn{from{opacity:0;transform:translateX(calc(100% + 40px));}' +
      'to{opacity:.5;transform:translateX(var(--dshPeekX,50%));}}' +
      /* 鼠标悬停/键盘聚焦：继续向左滑出、变清晰 */
      '.dshCopyRefBar:hover,.dshCopyRefBar:focus-within{transform:translateX(0);opacity:1;}' +
      /* 退场：滑回右侧并淡出（关闭时触发），且不再播放进场 */
      '.dshCopyRefBar[data-leaving="true"]{transform:translateX(var(--dshPeekX,50%));opacity:0;pointer-events:none;animation:none;transition:transform .15s ease,opacity .15s ease;}' +
      '@media (prefers-reduced-motion:reduce){.dshCopyRefBar{transition:none;animation:none;}}' +
      /* 按钮：纯图标方形按钮，主操作品牌蓝填充，次操作透明悬浮 */
      '.dshCopyRefBtn{display:inline-flex;align-items:center;justify-content:center;' +
      'width:30px;height:30px;padding:0;border:none;border-radius:var(--dsw-radius-md);' +
      'font-family:inherit;color:inherit;background:transparent;cursor:pointer;box-sizing:border-box;' +
      'transition:background .12s ease,color .12s ease;}' +
      '.dshCopyRefBtn svg{width:18px;height:18px;flex:none;display:block;}' +
      '.dshCopyRefBtn--primary{background:var(--dsw-alias-state-business-primary);' +
      'color:var(--dsw-alias-label-primary-foreground);}' +
      '.dshCopyRefBtn--primary:hover{filter:brightness(1.08);}' +
      '.dshCopyRefBtn--ghost{color:var(--dsw-alias-label-primary);}' +
      '.dshCopyRefBtn--ghost:hover{background:var(--dsw-alias-interactive-bg-hover);}' +
      '.dshCopyRefBtn:active{transform:translateY(.5px);}' +
      '.dshCopyRefBtn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;}' +
      '.dshCopyRefBtn[data-state="success"]{background:var(--dsw-alias-state-success-primary);' +
      'color:var(--dsw-alias-label-primary-foreground);}' +
      /* 关闭按钮：小巧浮在右上角，与浮层同材质 */
      '.dshCopyRefClose{position:absolute;top:-7px;right:-7px;display:inline-flex;align-items:center;' +
      'justify-content:center;width:18px;height:18px;padding:0;border:none;border-radius:50%;' +
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;' +
      'box-shadow:var(--dsw-elevation-soft);font-family:inherit;' +
      'transition:background .12s ease,color .12s ease;}' +
      '.dshCopyRefClose svg{width:9px;height:9px;display:block;}' +
      '.dshCopyRefClose:hover{background:var(--dsw-alias-interactive-bg-hover);' +
      'color:var(--dsw-alias-label-primary);}' +
      '.dshCopyRefClose:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}';

    // 成功/失败反馈在按钮上停留的时长（毫秒）。
    const FLASH_MS = 1500;

    /** 反馈态：短暂显示 'done' | 'fail'。 */
    function useFlash(durationMs) {
      const [state, setState] = React.useState(false);
      const timer = React.useRef(0);
      React.useEffect(() => () => clearTimer(timer), []);
      const flash = React.useCallback((ok) => {
        setState(ok ? 'done' : 'fail');
        clearTimer(timer);
        timer.current = window.setTimeout(() => setState(false), durationMs);
      }, [durationMs]);
      return [state, flash];
    }

    /** 反馈态对应按钮的提示文字。 */
    function flashLabel(t, state, idle, done, fail) {
      return t(state === 'done' ? done : state === 'fail' ? fail : idle);
    }

    /** 渲染一个纯图标按钮；成功态自动切换成对勾并高亮。 */
    function renderIconButton(key, variant, state, label, onClick, idleIcon) {
      return h(
        'button',
        {
          key,
          type: 'button',
          className: 'dshCopyRefBtn dshCopyRefBtn--' + variant,
          'data-state': state === 'done' ? 'success' : undefined,
          title: label,
          'aria-label': label,
          onClick,
        },
        h(MorphIcon, {
          size: 18,
          strokeWidth: 1.5,
          color: 'currentColor',
          icon: state === 'done' ? MORPH_ICONS.check : idleIcon,
        }),
      );
    }

    /** 渲染一条悬浮工具条外壳（文件组与行组共用同一套外观与交互）。 */
    function renderBar({ key, label, top, right, innerRef, leaving, children }) {
      return h(
        'div',
        {
          key,
          className: 'dshCopyRefBar',
          role: 'toolbar',
          'aria-label': label,
          'data-leaving': leaving ? 'true' : undefined,
          ref: innerRef,
          style: { top: top + 'px', right: right + 'px' },
          // 阻止默认行为，避免点击工具条时丢失代码选区。
          onMouseDown: (e) => e.preventDefault(),
        },
        children,
      );
    }

    function SelectionToolbar(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => DEFAULT_LABELS[key] || key;
      const [bar, setBar] = React.useState(null);
      const [copyState, flashCopy] = useFlash(FLASH_MS);
      const [insertState, flashInsert] = useFlash(FLASH_MS);
      // 文件级常驻工具条：只要打开代码文件就显示，不随选区出现/消失。
      const [fileBar, setFileBar] = React.useState(null);
      const [fileCopyState, flashFileCopy] = useFlash(FLASH_MS);
      const [fileInsertState, flashFileInsert] = useFlash(FLASH_MS);
      // 点 × 关闭后，下一次选中/点击代码才重新出现。
      const dismissed = React.useRef(false);
      // 退场、隐藏各用一个定时器；barRef 同步记录当前浮层。
      const leaveTimer = React.useRef(0);
      const hideTimer = React.useRef(0);
      const barRef = React.useRef(null);
      // 两个浮层的 DOM 引用：用来量宽度，算“只露一半”的横向位移量。
      const fileBarDom = React.useRef(null);
      const lineBarDom = React.useRef(null);
      React.useEffect(() => () => {
        clearTimer(leaveTimer);
        clearTimer(hideTimer);
      }, []);

      // “默认只露一半”：把浮层向右平移「自身一半宽 + 距视口右边缘距离」，
      // 让右半滑出屏幕、只在右边露出一半；量到宽度后在绘制前写回 CSS 变量。
      useIsomorphicLayoutEffect(() => {
        [fileBarDom.current, lineBarDom.current].forEach((el) => {
          if (!el) return;
          const gap = parseFloat(el.style.right) || 0;
          el.style.setProperty('--dshPeekX', Math.round(el.offsetWidth / 2 + gap) + 'px');
        });
      }, [fileBar, bar]);

      // 行级 / 文件级按钮复用同一套复制、插入逻辑，只是绑定各自的反馈态。
      const copy = React.useCallback((text) => copyReference(text, flashCopy), [flashCopy]);
      const insert = React.useCallback((text) => insertReference(text, flashInsert), [flashInsert]);
      const copyFile = React.useCallback((text) => copyReference(text, flashFileCopy), [flashFileCopy]);
      const insertFile = React.useCallback((text) => insertReference(text, flashFileInsert), [flashFileInsert]);

      // 选中新行时：若工具条已存在就直接复用，只更新文字与位置，不重播进场动画。
      const buildBar = React.useCallback((text, rect) => {
        const next = makeBar(text, rect);
        barRef.current = next;
        return next;
      }, []);

      // 统一退场：滑回右侧并淡出，动画结束再卸载。
      const removeWithAnim = React.useCallback(() => {
        if (leaveTimer.current || !barRef.current) return;
        clearTimer(hideTimer);
        const current = barRef.current;
        const leaving = { ...current, leaving: true };
        barRef.current = leaving;
        setBar(leaving);
        leaveTimer.current = window.setTimeout(() => {
          leaveTimer.current = 0;
          barRef.current = null;
          setBar(null);
        }, 160);
      }, []);

      // 选区短暂为空时先等 200ms，期间重新选中就不退场。
      const scheduleHide = React.useCallback(() => {
        if (!barRef.current || hideTimer.current || leaveTimer.current) return;
        hideTimer.current = window.setTimeout(() => {
          hideTimer.current = 0;
          removeWithAnim();
        }, 200);
      }, [removeWithAnim]);

      // 有新选中时取消待退场和正在进行的退场，避免和进场动画打架。
      const cancelExit = React.useCallback(() => {
        clearTimer(hideTimer);
        clearTimer(leaveTimer);
      }, []);

      const close = React.useCallback(() => {
        dismissed.current = true;
        removeWithAnim();
      }, [removeWithAnim]);

      // 计算文件级工具条的锚点：取当前文档前缀 + 代码预览矩形；无预览则隐藏。
      // 值未变化时不触发重渲染，避免滚动时无谓刷新。
      const syncFileBar = React.useCallback(() => {
        let next = null;
        try {
          const rect = activePreview();
          if (currentDoc && rect) next = { text: currentDoc.prefix, ...barPosition(rect, BANNER_CLEAR) };
        } catch (e) {
          next = null;
        }
        setFileBar((prev) => (
          prev && next && prev.text === next.text && prev.top === next.top && prev.right === next.right
            ? prev
            : next
        ));
      }, []);

      React.useEffect(() => {
        let raf = 0;
        const layout = () => {
          raf = 0;
          // 文件组常驻：每次布局都先把它定位好，再处理行选区。
          syncFileBar();
          if (dismissed.current) {
            removeWithAnim();
            return;
          }
          let info = null;
          try {
            info = selectionInfo();
          } catch (e) {
            info = null;
          }
          if (!info) {
            scheduleHide();
            return;
          }
          cancelExit();
          setBar(buildBar(info.text, info.rect));
        };
        const schedule = () => {
          if (!raf) raf = window.requestAnimationFrame(layout);
        };
        // 只有手势才自动复制；selectionchange/滚动/缩放只更新位置。
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
          dismissed.current = false;
          cancelExit();
          copy(resolved.text);
          setBar(buildBar(resolved.text, resolved.rect));
        };

        document.addEventListener('selectionchange', schedule);
        document.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        document.addEventListener('mouseup', gesture, true);
        document.addEventListener('keyup', gesture, true);
        // 文档打开/关闭时也重新定位文件组。
        docSubscribers.add(schedule);
        schedule();
        return () => {
          if (raf) window.cancelAnimationFrame(raf);
          docSubscribers.delete(schedule);
          document.removeEventListener('selectionchange', schedule);
          document.removeEventListener('scroll', schedule, true);
          window.removeEventListener('resize', schedule);
          document.removeEventListener('mouseup', gesture, true);
          document.removeEventListener('keyup', gesture, true);
        };
      }, [copy, removeWithAnim, scheduleHide, cancelExit, buildBar, syncFileBar]);

      if (!fileBar && !bar) return null;

      const copyLabel = flashLabel(t, copyState, 'copy', 'copied', 'fail');
      const insertLabel = flashLabel(t, insertState, 'insert', 'inserted', 'insertFail');
      const fileCopyLabel = flashLabel(t, fileCopyState, 'fileCopy', 'copied', 'fail');
      const fileInsertLabel = flashLabel(t, fileInsertState, 'fileInsert', 'inserted', 'insertFail');

      const toolbarLabel = t('toolbarLabel');

      // 文件级工具条：常驻、无关闭按钮，作用于整个文件（@路径，不带行号）。
      const fileBarEl = fileBar && renderBar({
        key: 'filebar-' + fileBar.text,
        label: toolbarLabel,
        top: fileBar.top,
        right: fileBar.right,
        innerRef: fileBarDom,
        children: [
          renderIconButton('file-copy', 'primary', fileCopyState, fileCopyLabel, () => copyFile(fileBar.text), MORPH_ICONS.copy),
          renderIconButton('file-insert', 'ghost', fileInsertState, fileInsertLabel, () => insertFile(fileBar.text), MORPH_ICONS.fileInsert),
        ],
      });

      // 行级工具条：随选区出现，带关闭按钮，作用于选中的行。
      const lineBarEl = bar && renderBar({
        key: 'bar',
        label: toolbarLabel,
        top: bar.top,
        right: bar.right,
        innerRef: lineBarDom,
        leaving: bar.leaving,
        children: [
          h(
            'button',
            {
              key: 'close',
              type: 'button',
              className: 'dshCopyRefClose',
              title: t('close'),
              'aria-label': t('close'),
              onClick: close,
            },
            ICON_CLOSE,
          ),
          renderIconButton('copy', 'primary', copyState, copyLabel, () => copy(bar.text), MORPH_ICONS.copy),
          renderIconButton('insert', 'ghost', insertState, insertLabel, () => insert(bar.text), MORPH_ICONS.lineInsert),
        ],
      });

      return h(
        React.Fragment,
        null,
        h('style', { key: 'style' }, CSS),
        fileBarEl,
        lineBarEl,
      );
    }

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        'sidebar-copy-file-reference: dictionaries',
      );
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          { name: 'shell.overlay', id: 'sidebar-copy-file-reference', order: 100, locale: NS },
          SelectionToolbar,
        ),
      );
      ctx.slots.inject('sidebar.right.tab.document.actions', () =>
        ctx.slots.register(
          { name: 'sidebar.right.tab.document.actions', id: 'sidebar-copy-file-reference-probe', order: 50 },
          DocProbe,
        ),
      );
    }

    /* ------------------------------------------------------------------
     * 内置 morphicons@2.0.2（MIT，https://morphicons.com）：负责图标形变动画。
     * 下面是官方 React 绑定的打包产物（esbuild 压缩），仅保留这个文件即可离线运行。
     * 请勿手改；升级时用 esbuild 重新打包 morphicons/react 覆盖本段。
     * ------------------------------------------------------------------ */
    const { MorphIcon } = (function () {
      const module = { exports: {} };
      (function (require, module, exports) {
var me=Object.create;var ut=Object.defineProperty;var de=Object.getOwnPropertyDescriptor;var pe=Object.getOwnPropertyNames;var ge=Object.getPrototypeOf,Me=Object.prototype.hasOwnProperty;var be=(t,s,n)=>s in t?ut(t,s,{enumerable:!0,configurable:!0,writable:!0,value:n}):t[s]=n;var Nt=(t,s)=>()=>(t&&(s=t(t=0)),s);var ye=(t,s)=>()=>(s||t((s={exports:{}}).exports,s),s.exports),bn=(t,s)=>{for(var n in s)ut(t,n,{get:s[n],enumerable:!0})},yn=(t,s,n,o)=>{if(s&&typeof s=="object"||typeof s=="function")for(let e of pe(s))!Me.call(t,e)&&e!==n&&ut(t,e,{get:()=>s[e],enumerable:!(o=de(s,e))||o.enumerable});return t};var xe=(t,s,n)=>(n=t!=null?me(ge(t)):{},yn(s||!t||!t.__esModule?ut(n,"default",{value:t,enumerable:!0}):n,t)),we=t=>yn(ut({},"__esModule",{value:!0}),t);var ht=(t,s,n)=>be(t,typeof s!="symbol"?s+"":s,n);function wn(t){let s=[],n=t.length,o=0,e=0,c=0,r=0,l=0,i=null,a="",h=0,f=0,m="",u=!1,d=I=>{throw new Error(`morphicons: ${I} at d[${o}]`)},g=I=>I>=48&&I<=57,M=()=>{for(;o<n;){let I=t.charCodeAt(o);if(I===32||I===9||I===10||I===13||I===12||I===44)o++;else break}},y=()=>{M();let I=o;o<n&&(t[o]==="+"||t[o]==="-")&&o++;let v=!1;for(;o<n&&g(t.charCodeAt(o));)o++,v=!0;if(o<n&&t[o]===".")for(o++;o<n&&g(t.charCodeAt(o));)o++,v=!0;if(v||d("expected number"),o<n&&(t[o]==="e"||t[o]==="E")){let S=o;o++,o<n&&(t[o]==="+"||t[o]==="-")&&o++;let N=!1;for(;o<n&&g(t.charCodeAt(o));)o++,N=!0;N||(o=S)}return Number(t.slice(I,o))},w=()=>{M();let I=t[o];return I==="0"||I==="1"?(o++,I==="1"?1:0):d("expected arc flag (0|1)")},p=()=>(u||d("path must start with M/m"),i||(i={x0:e,y0:c,segs:[],closed:!1},s.push(i)),i),b=!1,k=()=>y()+(b?e:0),A=()=>y()+(b?c:0);for(;M(),!(o>=n);){let I=t[o];switch(ke.includes(I)?(a=I,o++):a===""?d("path must start with M/m"):a==="M"?a="L":a==="m"?a="l":(a==="Z"||a==="z")&&d("stray data after Z"),b=a>="a",b?a.toUpperCase():a){case"M":{u=!0;let v=k(),S=A();e=v,c=S,r=v,l=S,i={x0:v,y0:S,segs:[],closed:!1},s.push(i),m="";break}case"L":{let v=k(),S=A();p().segs.push(["L",v,S]),e=v,c=S,m="";break}case"H":{let v=k();p().segs.push(["L",v,c]),e=v,m="";break}case"V":{let v=A();p().segs.push(["L",e,v]),c=v,m="";break}case"C":case"S":{let v,S;a==="C"||a==="c"?(v=k(),S=A()):(v=m==="C"?2*e-h:e,S=m==="C"?2*c-f:c);let N=k(),P=A(),L=k(),C=A();p().segs.push(["C",v,S,N,P,L,C]),h=N,f=P,e=L,c=C,m="C";break}case"Q":case"T":{let v,S;a==="Q"||a==="q"?(v=k(),S=A()):(v=m==="Q"?2*e-h:e,S=m==="Q"?2*c-f:c);let N=k(),P=A();p().segs.push(["Q",v,S,N,P]),h=v,f=S,e=N,c=P,m="Q";break}case"A":{let v=y(),S=y(),N=y(),P=w(),L=w(),C=k(),R=A();p().segs.push(["A",v,S,N,P,L,C,R]),e=C,c=R,m="";break}case"Z":i&&(i.closed=!0,i=null),e=r,c=l,m="";break;default:d(`unsupported command "${a}"`)}}return s.filter(I=>I.segs.length>0)}function Tt(t){return String(Math.round(t*100)/100)}function dt(t,s){let n="";for(let o=0;o<t.length;o++){let e=t[o],c=e.length/2;n+=`M${Tt(e[0])} ${Tt(e[1])}`;for(let r=1;r<c;r++)n+=`L${Tt(e[2*r])} ${Tt(e[2*r+1])}`;s!=null&&s[o]&&(n+="Z")}return n}function X(t){return String(Math.round(t*1e4)/1e4)}function Sn(t){let s="";for(let{pts:n,closed:o}of t){s+=`M${X(n[0])} ${X(n[1])}`;for(let e=2;e<n.length;e+=6)s+=`C${X(n[e])} ${X(n[e+1])} ${X(n[e+2])} ${X(n[e+3])} ${X(n[e+4])} ${X(n[e+5])}`;o&&(s+="Z")}return s}function pt(t,s){let n=[t,s],o=t,e=s,c=(h,f,m,u,d,g)=>{n.push(h,f,m,u,d,g),o=d,e=g},r=(h,f)=>{Math.abs(h-o)<1e-12&&Math.abs(f-e)<1e-12||c(o+(h-o)/3,e+(f-e)/3,o+2*(h-o)/3,e+2*(f-e)/3,h,f)};return[c,r,(h,f,m,u)=>{c(o+2/3*(h-o),e+2/3*(f-e),m+2/3*(h-m),u+2/3*(f-u),m,u)},(h,f,m,u,d,g,M)=>{let y=o,w=e;if(Math.abs(g-y)<1e-12&&Math.abs(M-w)<1e-12)return;let p=Math.abs(h),b=Math.abs(f);if(p<1e-12||b<1e-12){r(g,M);return}let k=m*Math.PI/180,A=Math.cos(k),I=Math.sin(k),v=(y-g)/2,S=(w-M)/2,N=A*v+I*S,P=-I*v+A*S,L=N*N/(p*p)+P*P/(b*b);if(L>1){let $=Math.sqrt(L);p*=$,b*=$}let C=p*p,R=b*b,Z=N*N,U=P*P,E=(C*R-C*U-R*Z)/(C*U+R*Z);E<0&&(E=0);let O=(u===d?-1:1)*Math.sqrt(E),_=O*p*P/b,H=-O*b*N/p,it=A*_-I*H+(y+g)/2,St=I*_+A*H+(w+M)/2,et=Math.atan2((P-H)/b,(N-_)/p),x=Math.atan2((-P-H)/b,(-N-_)/p)-et;d===0&&x>0?x-=kn:d===1&&x<0&&(x+=kn);let T=Math.max(1,Math.ceil(Math.abs(x)/(Math.PI/2)-1e-9)),F=x/T,q=4/3*Math.tan(F/4),V=$=>it+p*Math.cos($)*A-b*Math.sin($)*I,W=$=>St+p*Math.cos($)*I+b*Math.sin($)*A,at=$=>-p*Math.sin($)*A-b*Math.cos($)*I,pn=$=>-p*Math.sin($)*I+b*Math.cos($)*A,Gt=et,gn=y,Mn=w;for(let $=1;$<=T;$++){let ft=et+F*$,Vt=$===T?g:V(ft),Yt=$===T?M:W(ft);c(gn+q*at(Gt),Mn+q*pn(Gt),Vt-q*at(ft),Yt-q*pn(ft),Vt,Yt),Gt=ft,gn=Vt,Mn=Yt}},h=>(h&&r(n[0],n[1]),n.length<8?null:{pts:Float64Array.from(n),closed:h})]}function In(t){let[s,n,o,e,c]=pt(t.x0,t.y0);for(let r of t.segs)switch(r[0]){case"L":n(r[1],r[2]);break;case"C":s(r[1],r[2],r[3],r[4],r[5],r[6]);break;case"Q":o(r[1],r[2],r[3],r[4]);break;case"A":e(r[1],r[2],r[3],r[4],r[5],r[6],r[7])}return c(t.closed)}function D(t,s,n=0){let o=t[s];if(o===void 0)return n;let e=typeof o=="number"?o:Number(o);return Number.isFinite(e)?e:n}function vn(t){let s=String(t!=null?t:"").trim();if(!s)return[];let n=s.split(/[\s,]+/).map(Number);if(n.some(o=>!Number.isFinite(o)))throw new Error(`morphicons: invalid points: "${s}"`);return n}function Wt(t,s){if(t.length<4)return null;let[,n,,,o]=pt(t[0],t[1]);for(let e=2;e+1<t.length;e+=2)n(t[e],t[e+1]);return o(s)}function An(t,s,n,o){if(n<1e-12||o<1e-12)return null;let e=Et*n,c=Et*o,r=t+n,l=t-n,i=s+o,a=s-o,[h,,,,f]=pt(r,s);return h(r,s+c,t+e,i,t,i),h(t-e,i,l,s+c,l,s),h(l,s-c,t-e,a,t,a),h(t+e,a,r,s-c,r,s),f(!0)}function Ie(t){let s=D(t,"x"),n=D(t,"y"),o=D(t,"width"),e=D(t,"height");if(o<1e-12||e<1e-12)return null;let c=D(t,"rx",NaN),r=D(t,"ry",NaN);if(Number.isNaN(c)&&(c=Number.isNaN(r)?0:r),Number.isNaN(r)&&(r=c),c=Math.min(Math.max(c,0),o/2),r=Math.min(Math.max(r,0),e/2),c<1e-12||r<1e-12)return Wt([s,n,s+o,n,s+o,n+e,s,n+e],!0);let l=s+c,i=s+o-c,a=s+o,h=n+r,f=n+e-r,m=n+e,u=Et*c,d=Et*r,[g,M,,,y]=pt(l,n);return M(i,n),g(i+u,n,a,h-d,a,h),M(a,f),g(a,f+d,i+u,m,i,m),M(l,m),g(l-u,m,s,f+d,s,f),M(s,h),g(s,h-d,l-u,n,l,n),y(!0)}function B(t){var o;let s=[],n=e=>{e&&s.push(e)};if(typeof t=="string"){for(let e of wn(t))n(In(e));return s}for(let[e,c]of t)switch(e){case"path":for(let r of wn(String((o=c.d)!=null?o:"")))n(In(r));break;case"line":{let[,r,,,l]=pt(D(c,"x1"),D(c,"y1"));r(D(c,"x2"),D(c,"y2")),n(l(!1));break}case"circle":{let r=D(c,"r");n(An(D(c,"cx"),D(c,"cy"),r,r));break}case"ellipse":n(An(D(c,"cx"),D(c,"cy"),D(c,"rx"),D(c,"ry")));break;case"rect":n(Ie(c));break;case"polyline":n(Wt(vn(c.points),!1));break;case"polygon":n(Wt(vn(c.points),!0));break;default:throw new Error(`morphicons: unsupported tag <${e}>`)}return s}var ke,Et,kn,gt=Nt(()=>{ke="MmLlHhVvCcSsQqTtAaZz";Et=4/3*Math.tan(Math.PI/8),kn=2*Math.PI});function G(t){let s=t.length/2,n=0,o=0;for(let e=0;e<s;e++)n+=t[2*e],o+=t[2*e+1];return[n/s,o/s]}function Nn(t){let s=t.length/2,n=0;for(let o=1;o<s;o++)n+=Math.hypot(t[2*o]-t[2*o-2],t[2*o+1]-t[2*o-1]);return n}function bt(t){let s=t.length/2,n=new Float64Array(2*s);for(let o=0;o<s;o++)n[2*o]=t[2*(s-1-o)],n[2*o+1]=t[2*(s-1-o)+1];return n}function st(t,s){let n=t.length/2,o=new Float64Array(2*n);for(let e=0;e<n;e++){let c=(e+s)%n;o[2*e]=t[2*c],o[2*e+1]=t[2*c+1]}return o}function Mt(t,s,n,o){let e=t.length/2,c=0,r=0,l=0,i=0,a=0,h=0;for(let M=0;M<e;M++){let y=t[2*M]-n[0],w=t[2*M+1]-n[1],p=s[2*M]-o[0],b=s[2*M+1]-o[1];c+=y*p,i+=w*b,r+=y*b,l+=w*p,a+=y*y+w*w,h+=p*p+b*b}let f=Math.atan2(r-l,c+i),m=Math.cos(f)*(c+i)+Math.sin(f)*(r-l),u=a>1e-12?m/a:1;u>1e-6||(u=1e-6);let d=Math.max(0,u*u*a-2*u*m+h),g=h>1e-12?Math.sqrt(d/h):0;return{theta:f,sigma:u,res:g}}function Pe(t,s,n=!1,o=!1,e=!0,c=Ae){let r=G(t),l=G(s),i=n&&!o,a=i?t:s,h=n||o?a.length/2:1,f=Number.POSITIVE_INFINITY,m=a,u={theta:0,sigma:1,res:0};for(let d=0;d<(e?2:1);d++){let g=d?bt(a):a;for(let M=0;M<h;M++){let y=M?st(g,M):g,w=i?Mt(y,s,r,l):Mt(t,y,r,l),p=w.res+c*Math.abs(w.theta)/Math.PI;p<f&&(f=p,m=y,u=w)}}return i?{ca:r,cb:l,a:m,b:s,...u}:{ca:r,cb:l,a:t,b:m,...u}}function K(t,s){let n=s.map(G),o=s.map(Nn);return t.map(e=>{let c=G(e),r=Nn(e);return n.map((l,i)=>Math.hypot(c[0]-l[0],c[1]-l[1])+ve*Math.abs(r-o[i]))})}function Te(t){let s=t.length;if(s>Ne){let r=[];for(let a=0;a<s;a++)for(let h=0;h<s;h++)r.push([t[a][h],a,h]);r.sort((a,h)=>a[0]-h[0]);let l=new Array(s).fill(-1),i=new Array(s).fill(!1);for(let[,a,h]of r)l[a]<0&&!i[h]&&(l[a]=h,i[h]=!0);return l}let n=Array.from({length:s},(r,l)=>l),o=n.slice(),e=Number.POSITIVE_INFINITY,c=(r,l,i)=>{if(!(i>=e)){if(l===s){e=i,o=r.slice();return}for(let a=l;a<s;a++)[r[l],r[a]]=[r[a],r[l]],c(r,l+1,i+t[l][r[l]]),[r[l],r[a]]=[r[a],r[l]]}};return c(n,0,0),o}function Pn(t){let s=t.length,n=t[0].length;if(n**s>1e5){let i=t.map(h=>{let f=0;for(let m=1;m<h.length;m++)h[m]<h[f]&&(f=m);return f}),a=new Array(n).fill(0);for(let h of i)a[h]++;for(let h=0;h<n;h++){if(a[h]>0)continue;let f=-1,m=Number.POSITIVE_INFINITY;for(let u=0;u<s;u++){if(a[i[u]]<2)continue;let d=t[u][h]-t[u][i[u]];d<m&&(m=d,f=u)}a[i[f]]--,i[f]=h,a[h]++}return i}let o=null,e=Number.POSITIVE_INFINITY,c=new Array(s),r=new Array(n).fill(0),l=(i,a,h)=>{if(!(a>=e||n-h>s-i)){if(i===s){e=a,o=c.slice();return}for(let f=0;f<n;f++)c[i]=f,r[f]++,l(i+1,a+t[i][f],h+(r[f]===1?1:0)),r[f]--}};if(l(0,0,0),!o)throw new Error("morphicons: no valid surjection (B < S)");return o}function Qt(t,s){let n=t.length*s,o=new Float64Array(2*n),e=new Float64Array(2*n);t.forEach((f,m)=>{o.set(f.a,2*s*m),e.set(f.bO,2*s*m)});let c=G(o),r=Mt(o,e,c,G(e));if(r.res>=Se)return;let l=Math.cos(-r.theta),i=Math.sin(-r.theta),a=Math.cos(r.theta),h=Math.sin(r.theta);for(let f of t){let m=0,u=0;for(let k=0;k<s;k++){let A=f.bO[2*k]-f.cb[0],I=f.bO[2*k+1]-f.cb[1];f.bT[2*k]=(A*l-I*i)/r.sigma,f.bT[2*k+1]=(A*i+I*l)/r.sigma;let v=r.sigma*(a*f.aC[2*k]-h*f.aC[2*k+1])-A,S=r.sigma*(h*f.aC[2*k]+a*f.aC[2*k+1])-I;m+=v*v+S*S,u+=A*A+I*I}f.theta=r.theta,f.lnSigma=Math.log(r.sigma),f.res=u>1e-12?Math.sqrt(m/u):0;let d=Math.exp(f.lnSigma),g=Math.cos(f.theta)*d,M=Math.sin(f.theta)*d,y=f.ca[0]-c[0],w=f.ca[1]-c[1],p=y*g-w*M-y,b=y*M+w*g-w;f.block={off:[y,w],drift:[f.cb[0]-f.ca[0]-p,f.cb[1]-f.ca[1]-b]}}}function Ut(t,s){let n=t.length,o=s.length,e=[];if(n===o){let c=Te(K(t,s));for(let r=0;r<n;r++)e.push([r,c[r]])}else if(n<o){let c=Pn(K(s,t));for(let r=0;r<o;r++)e.push([c[r],r])}else{let c=Pn(K(t,s));for(let r=0;r<n;r++)e.push([r,c[r]])}return e}function Xt(t,s,n,o,e,c){let r=t.length/2,l=Pe(t,s,n,o,e,c),i=l.a,a=new Float64Array(2*r),h=new Float64Array(2*r),f=new Float64Array(2*r),m=Math.cos(-l.theta),u=Math.sin(-l.theta);for(let d=0;d<r;d++){a[2*d]=i[2*d]-l.ca[0],a[2*d+1]=i[2*d+1]-l.ca[1];let g=l.b[2*d]-l.cb[0],M=l.b[2*d+1]-l.cb[1];h[2*d]=(g*m-M*u)/l.sigma,h[2*d+1]=(g*u+M*m)/l.sigma,f[2*d]=l.b[2*d],f[2*d+1]=l.b[2*d+1]}return{a:i,aC:a,bT:h,bO:f,ca:l.ca,cb:l.cb,theta:l.theta,lnSigma:Math.log(l.sigma),res:l.res,closed:n&&o,block:null}}function ot(t,s){let n=t.length,o=s.length;if(n===0||o===0)throw new Error("morphicons: icon has no subpaths");let e=t.map(l=>l.pts),c=s.map(l=>l.pts),r=Ut(e,c).map(([l,i])=>Xt(e[l],c[i],t[l].closed,s[i].closed,!0));return r.length>1&&Qt(r,e[0].length/2),{items:r,n:e[0].length/2}}function Bt(t,s,n){let o=6*s,e=1-n,c=3*e*e,r=6*e*n,l=3*n*n,i=c*(t[o+2]-t[o])+r*(t[o+4]-t[o+2])+l*(t[o+6]-t[o+4]),a=c*(t[o+3]-t[o+1])+r*(t[o+5]-t[o+3])+l*(t[o+7]-t[o+5]);return Math.hypot(i,a)}function Zt(t,s,n=1){let o=n/2,e=0;for(let c=0;c<4;c++)e+=Ee[c]*(Bt(t,s,o+o*Tn[c])+Bt(t,s,o-o*Tn[c]));return e*o}function Oe(t,s,n,o,e){let c=6*s,r=1-n,l=r*r*r,i=3*r*r*n,a=3*r*n*n,h=n*n*n;o[e]=l*t[c]+i*t[c+2]+a*t[c+4]+h*t[c+6],o[e+1]=l*t[c+1]+i*t[c+3]+a*t[c+5]+h*t[c+7]}function En(t,s,n){let o=6*s,e=n?o+6:o,c=n?-1:1;for(let r of n?[4,2,0]:[2,4,6]){let l=c*(t[o+r]-t[e]),i=c*(t[o+r+1]-t[e+1]);if(l*l+i*i>1e-18)return[l,i]}return null}function Fe(t,s=On){let n=t.pts,o=(n.length/2-1)/3,e=[];for(let l=0;l<o;l++)Zt(n,l)>1e-9&&e.push(l);if(e.length===0)return[];let c=new Set,r=(l,i)=>{let a=En(n,l,!0),h=En(n,i,!1);!a||!h||Math.abs(Math.atan2(a[0]*h[1]-a[1]*h[0],a[0]*h[0]+a[1]*h[1]))>s&&c.add(i)};for(let l=0;l+1<e.length;l++)r(e[l],e[l+1]);return t.closed&&e.length>1&&r(e[e.length-1],e[0]),[...c].sort((l,i)=>l-i)}function je(t,s,n,o){if(n<=0)return 0;if(n>=o)return 1;let e=0,c=1,r=n/o;for(let l=0;l<12;l++){let i=Zt(t,s,r)-n;if(Math.abs(i)<1e-10*o+1e-14)break;i>0?c=r:e=r;let a=Bt(t,s,r),h=a>1e-12?r-i/a:(e+c)/2;h>e&&h<c||(h=(e+c)/2),r=h}return r}function yt(t,s=64,n=On){let o=t.pts,e=(o.length/2-1)/3,c=new Float64Array(2*s),r=()=>{for(let p=0;p<s;p++)c[2*p]=o[0],c[2*p+1]=o[1];return c};if(e<1)return r();let l=new Array(e),i=0;for(let p=0;p<e;p++)l[p]=Zt(o,p),i+=l[p];if(i<1e-12)return r();let a=Fe(t,n),h=t.closed?a.length>0?a:[0]:[...new Set([0,...a,e])].sort((p,b)=>p-b),f=[];if(t.closed)for(let p=0;p<h.length;p++){let b=h[p],k=p+1<h.length?h[p+1]:h[0]+e;f.push([b,k])}else for(let p=0;p+1<h.length;p++)f.push([h[p],h[p+1]]);let m=f.map(([p,b])=>{let k=0;for(let A=p;A<b;A++)k+=l[A%e];return k}),u=t.closed?s:s-1;if(f.length>u)throw new Error(`morphicons: N=${s} too small (${f.length} runs)`);let d=m.reduce((p,b)=>p+b,0)||1,g=m.map(p=>u*p/d),M=g.map(p=>Math.max(1,Math.floor(p))),y=u-M.reduce((p,b)=>p+b,0);if(y>0){let p=g.map((b,k)=>[Math.round((b-Math.floor(b))*1e9),k]).sort((b,k)=>k[0]-b[0]||b[1]-k[1]);for(let b=0;b<y;b++)M[p[b%M.length][1]]++}for(;y<0;){let p=0;for(let b=1;b<M.length;b++)M[b]>M[p]&&(p=b);if(M[p]<=1)break;M[p]--,y++}let w=0;for(let p=0;p<f.length;p++){let[b,k]=f[p],A=M[p],I=m[p],v=6*(b%e);c[2*w]=o[v],c[2*w+1]=o[v+1],w++;let S=b,N=0;for(let P=1;P<A;P++){let L=I*P/A;for(;S<k-1&&N+l[S%e]<L;)N+=l[S%e],S++;let C=S%e,R=l[C];Oe(o,C,R>1e-12?je(o,C,L-N,R):0,c,2*w),w++}}if(!t.closed){let p=6*e;c[2*w]=o[p],c[2*w+1]=o[p+1]}return c}function xt(t,s=64){return B(t).map(n=>({pts:yt(n,s),closed:n.closed}))}var ve,Ae,Se,Ne,On,Tn,Ee,Ot=Nt(()=>{gt();ve=.35,Ae=.05,Se=.005,Ne=8;On=Math.PI/8,Tn=[.18343464249564978,.525532409916329,.7966664774136267,.9602898564975363],Ee=[.362683783378362,.31370664587788727,.22238103445337448,.10122853629037626]});function z(t){if(typeof t=="string")return"stroke";for(let[,s]of t)if(Ft(s.fill))return"fill";return"stroke"}function Jt(t){return typeof t=="string"||z(t)==="stroke"?t:t.filter(([,s])=>!Kt(s))}function jt(t){return typeof t!="string"&&t.length===1&&"data-region"in t[0][1]}function J(t,s,n){let o=n.length/2,e=!1;for(let c=0,r=o-1;c<o;r=c++){let l=n[2*c+1],i=n[2*r+1];l>s!=i>s&&t<(n[2*r]-n[2*c])*(s-l)/(i-l)+n[2*c]&&(e=!e)}return e}function wt(t,s,n,o,e,c){let r=e-n,l=c-o,i=r*r+l*l,a=i>0?((t-n)*r+(s-o)*l)/i:0;a=a<0?0:a>1?1:a;let h=t-n-a*r,f=s-o-a*l;return Math.sqrt(h*h+f*f)}function Q(t){let s=t.length/2,n=0;for(let o=0,e=s-1;o<s;e=o++)n+=t[2*e]*t[2*o+1]-t[2*o]*t[2*e+1];return n/2}var Fn,Ft,Kt,Ct=Nt(()=>{Fn="data-region",Ft=t=>t!==void 0&&String(t).trim().toLowerCase()!=="none";Kt=t=>Number.parseFloat(String(t.opacity))<.5||Number.parseFloat(String(t["fill-opacity"]))<.5});var Xn={};bn(Xn,{buildRegionPlan:()=>rn,isRegion:()=>jt,paintOf:()=>z,regionContours:()=>Wn,regionOf:()=>ct,regionPlan:()=>Qn,regionPlanFrom:()=>Un,resampleRegion:()=>sn,toRegion:()=>Bn});function Re(t,s){let n=s.length/2,o=0;for(let e=0;e<t.length;e+=6)for(let c=0;;c++){if(c===n)return!0;let r=(o+c)%n,l=(r+1)%n;if(wt(t[e],t[e+1],s[2*r],s[2*r+1],s[2*l],s[2*l+1])<=Le){o=r;break}}return!1}function sn(t,s){let n=B(t),o=c=>n.map(r=>{let l;for(let a of Ce)try{l=yt({pts:r.pts,closed:!0},c,a);break}catch{}let i=l;return{pts:i,closed:!0,hole:Q(i)<0}}),e=o(s!=null?s:64);return s||!n.some((c,r)=>Re(c.pts,e[r].pts))?e:o(128)}function qe(t,s){let n=t.length,o=new Float64Array(n);for(let e=0;e<n;e++)o[e]=(t[e]+s[e])/2;for(let e=0;e<n;e+=2){let c=o[e],r=o[e+1],l=o[(e+2)%n]-c,i=o[(e+3)%n]-r;for(let a=e+4;a<n-(e?0:2);a+=2){let h=o[a],f=o[a+1],m=o[(a+2)%n]-h,u=o[(a+3)%n]-f;if(!((l*(f-r)-i*(h-c))*(l*(f+u-r)-i*(h+m-c))>=0)&&(m*(r-f)-u*(c-h))*(m*(r+i-f)-u*(c+l-h))<0)return!0}}return!1}function De(t,s){let n=t.length/2,o=n>64?2:1,e=(f,m)=>o>1?f.filter((u,d)=>(d>>1)%2===m):f,c=e(t,0),r=G(c),l=[e(s,0),e(s,1)],i=l.map(G),a=[];for(let f=0;f<n;f++){let m=f%o,u=Mt(c,st(l[m],(f-m)/o),r,i[m]);a.push([f,u.res+jn*Math.abs(u.theta)/Math.PI])}a.sort((f,m)=>f[1]-m[1]);let h;for(let[f,m]of a.slice(0,_e)){if(m>a[0][1]+$e)break;let u=Xt(t,st(s,f),!1,!1,!1,jn);if(u.closed=!0,h!=null||(h=u),!qe(e(u.aC,0),e(u.bT,0)))return u}return h}function ze(t,s){let n=t.length/2,o=-1,e=1/0;return s.forEach((c,r)=>{if(c.hole)return;let l=0;for(let a of[0,Math.floor(n/3),Math.floor(2*n/3)])J(t[2*a],t[2*a+1],c.pts)&&l++;if(l<2)return;let i=Math.abs(Q(c.pts));i<e&&(e=i,o=r)}),o}function Cn(t,s,n,o){let e=t.length,c=n.length,r=new Array(e).fill(-1),l=new Array(c).fill(0);if((c+1)**e>1e5){let f=[];for(let m=0;m<e;m++)for(let u=0;u<c;u++)t[m][u]<1/0&&f.push([t[m][u],m,u]);f.sort((m,u)=>m[0]-u[0]);for(let[,m,u]of f)r[m]<0&&!l[u]&&(r[m]=u,l[u]=1);for(let m=0;m<e;m++)if(!(r[m]>=0))for(let u=0;u<c;u++)!n[u]&&(r[m]<0||t[m][u]<t[m][r[m]])&&(r[m]=u);return r}let i=r.slice(),a=1/0,h=(f,m,u)=>{if(!(m>=a||o&&c-u>e-f)){if(f===e){a=m,i=r.slice();return}for(let d=0;d<c;d++)n[d]&&l[d]||!(t[f][d]<1/0)||(r[f]=d,l[d]++,h(f+1,m+t[f][d],u+(l[d]===1?1:0)),l[d]--);r[f]=-1,h(f+1,m+s[f],u)}};return h(0,0,0),i}function _t(t,s,n,o,e,c){let r=Math.cos(e)*c,l=Math.sin(e)*c,i=t-n[0],a=s-n[1];return[o[0]+i*r-a*l,o[1]+i*l+a*r]}function on(t,s){let n=new Float64Array(2*s);for(let o=0;o<2*s;o+=2)n[o]=t[0],n[o+1]=t[1];return n}function kt(t,s,n,o,e){let c=t.length/2,r=Math.exp(n.lnSigma),l=new Float64Array(2*c),i=new Float64Array(2*c),a=0;for(let m=0;m<2*c;m+=2)l[m]=t[m]-n.ca[0],l[m+1]=t[m+1]-n.ca[1],[i[m],i[m+1]]=_t(s[m],s[m+1],n.cb,[0,0],-n.theta,1/r),a+=(s[m]-n.cb[0])**2+(s[m+1]-n.cb[1])**2;let h=0,f=1/0;for(let m=0;m<c&&f>0;m++){let u=0;for(let d=0;d<c&&u<f;d++){let g=(d+m)%c;u+=(l[2*d]-i[2*g])**2+(l[2*d+1]-i[2*g+1])**2}u<f&&(f=u,h=m)}return{a:t,aC:l,bT:st(i,h),bO:st(s,h),ca:n.ca,cb:n.cb,theta:n.theta,lnSigma:n.lnSigma,res:a>1e-12?Math.sqrt(r*r*f/a):0,closed:!0,hole:o,half:e,block:n.block}}function Lt(t,s,n){let o=Math.exp(s.lnSigma),[e,c]=G(t),{aC:r,bT:l}=s,i=n?s.bO:s.a,a=0,h=0,f=0;for(let u=0;u<r.length;u+=2){let d=1/((i[u]-e)**2+(i[u+1]-c)**2+1e-9);a+=d,h+=d*(l[u]-r[u]),f+=d*(l[u+1]-r[u+1])}a=(n?-.5:.5)/a,n&&([e,c]=_t(e,c,s.cb,s.ca,-s.theta,1/o)),e+=a*h,c+=a*f;let m=on(n?[e,c]:_t(e,c,s.ca,s.cb,s.theta,o),t.length/2);return n?kt(m,t,s,!0,1):kt(t,m,s,!0,0)}function tn(t,s,n){let o=0;for(let e of[.25,.5,.75]){if(!(Rn(t,e)%1))continue;let[c,r,...l]=[t,s,...n.filter(i=>i!==t)].map(i=>i.aC.map((a,h)=>a+Rn(i,e)*(i.bT[h]-a)));for(let i=0;i<c.length;i+=2)(!J(c[i],c[i+1],r)||l.some(a=>J(c[i],c[i+1],a)))&&o++}return o}function $n(t,s,n){let o=G(t),e={ca:o,cb:o,theta:0,lnSigma:0,block:null},c=on(o,t.length/2);return[t,...s].map((r,l)=>n?kt(c,r,e,l>0):kt(r,c,e,l>0))}function _n(t){let s=[t[0],t[1],t[0],t[1]];for(let n=2;n<t.length;n+=2)s[0]=Math.min(s[0],t[n]),s[1]=Math.min(s[1],t[n+1]),s[2]=Math.max(s[2],t[n]),s[3]=Math.max(s[3],t[n+1]);return s}function Ye(t,s,n){let o=Math.exp(n.lnSigma),e=K(t,s),c=s.map(r=>{let l=new Float64Array(r.length);for(let i=0;i<r.length;i+=2)[l[i],l[i+1]]=_t(r[i],r[i+1],n.cb,n.ca,-n.theta,1/o);return _n(l)});return t.forEach((r,l)=>{let i=_n(r);c.forEach((a,h)=>{let f=Math.min(i[2],a[2])-Math.max(i[0],a[0]),m=Math.min(i[3],a[3])-Math.max(i[1],a[1]),u=f>0&&m>0?f*m:0,d=(i[2]-i[0])*(i[3]-i[1])+(a[2]-a[0])*(a[3]-a[1])-u;u>=Ve*d||(e[l][h]=1/0)})}),e}function qn(t){let s=[];t.forEach((o,e)=>{o.hole||s.push(e)});let n=s.map(()=>[]);return t.forEach(o=>{if(!o.hole)return;let e=s.indexOf(ze(o.pts,t));if(e<0){let[c,r]=G(o.pts),l=1/0;s.forEach((i,a)=>{let[h,f]=G(t[i].pts),m=Math.hypot(h-c,f-r);m<l&&(l=m,e=a)})}n[e].push(o.pts)}),{outers:s.map(o=>t[o].pts),holes:n}}function He(t){let s=t.length,n=new Float64Array(2*s);for(let o=0;o<s;o+=2){let e=(o+2)%s;n[2*o]=t[o],n[2*o+1]=t[o+1],n[2*o+2]=(t[o]+t[e])/2,n[2*o+3]=(t[o+1]+t[e+1])/2}return n}function rn(t,s){let n=Math.max(t[0].pts.length,s[0].pts.length)/2,o=u=>u[0].pts.length/2<n?u.map(d=>({...d,pts:He(d.pts)})):u,e=qn(o(t)),c=qn(o(s));if(e.outers.length===0||c.outers.length===0)throw new Error("morphicons: region has no outer contour");let r,l=e.outers.length,i=c.outers.length,[a,h]=l<i?[c,e]:[e,c];l===i||h.holes.every(u=>u.length===0)?r=Ut(e.outers,c.outers):r=Cn(K(a.outers,h.outers),a.outers.map(u=>Ln+Ge(u)),h.holes.map(u=>u.length>0),!0).map((u,d)=>l<i?[u,d]:[d,u]);let f=[],m=!1;for(let[u,d]of r){if(u<0||d<0){m=!0,f.push(...u<0?$n(c.outers[d],c.holes[d],!0):$n(e.outers[u],e.holes[u],!1));continue}let g=De(e.outers[u],c.outers[d]);g.hole=!1,f.push(g);let M=e.holes[u],y=c.holes[d],w=Cn(Ye(M,y,g),M.map(()=>Ln),y.map(()=>!0),!1),p=M.map((b,k)=>w[k]<0?Lt(b,g,!1):kt(b,y[w[k]],g,!0));y.forEach((b,k)=>{w.includes(k)||p.push(Lt(b,g,!0))});for(let b=0;b<p.length;b++){let k=p[b];if(k.half!==void 0){m=!0;continue}let A=tn(k,g,p);A&&(p.splice(b,1,Lt(k.a,g,!1),Lt(k.bO,g,!0)),tn(p[b],g,p)+tn(p[b+1],g,p)>=A&&p.splice(b,2,k))}f.push(...p)}return f.length>1&&!m&&Qt(f,n),{items:f,n}}function zn(t,s){let n=[],o=[];for(let{pts:e,closed:c}of B(t)){let r=[e[0],e[1]];for(let l=0;l+7<e.length;l+=6){let i=e[l],a=e[l+1],h=e[l+2],f=e[l+3],m=e[l+4],u=e[l+5],d=e[l+6],g=e[l+7],M=Math.max(Math.hypot(i-2*h+m,a-2*f+u),Math.hypot(h-2*m+d,f-2*u+g)),y=Math.min(128,Math.max(1,Math.ceil(Math.sqrt(6*M/(8*s)))));for(let w=1;w<=y;w++){let p=w/y,b=1-p;r.push(b*b*b*i+3*b*b*p*h+3*b*p*p*m+p*p*p*d,b*b*b*a+3*b*b*p*f+3*b*p*p*u+p*p*p*g)}}n.push(Float64Array.from(r)),o.push(c)}return{lines:n,closed:o}}function Be(t,s,n){var c;if(typeof t=="string")return[{...zn(t,n),half:s/2,fill:0}];let o=z(t)==="fill",e=[];for(let r of t){let l=r[1];if(Kt(l))continue;let i=o?$t(l.stroke):l.stroke===void 0||$t(l.stroke),a=o&&($t(l.fill)||l.fill===void 0&&!i);!i&&!a||e.push({...zn([r],n),half:i?We(l["stroke-width"],s)/2:0,fill:a?String((c=l["fill-rule"])!=null?c:"").trim()==="evenodd"?2:1:0})}return e}function Gn(t,s,n,o,e,c,r){let l=Math.max(0,Math.floor((Math.min(s,o)-c-t.x0)/t.h)),i=Math.min(t.nx-1,Math.ceil((Math.max(s,o)+c-t.x0)/t.h)),a=Math.max(0,Math.floor((Math.min(n,e)-c-t.y0)/t.h)),h=Math.min(t.ny-1,Math.ceil((Math.max(n,e)+c-t.y0)/t.h));for(let f=a;f<=h;f++){let m=t.y0+f*t.h;for(let u=l;u<=i;u++)r(f*t.nx+u,t.x0+u*t.h,m)}}function nn(t,s,n){let o=t.length/2;o===1&&n(t[0],t[1],t[0],t[1]);for(let e=0;e+1<o;e++)n(t[2*e],t[2*e+1],t[2*e+2],t[2*e+3]);s&&o>2&&n(t[2*o-2],t[2*o-1],t[0],t[1])}function Qe(t,s){let n=new Float32Array(s.nx*s.ny).fill(Dn),o=2*s.h,e=null;for(let c of t){if(c.half>0){let r=c.half+o;c.lines.forEach((l,i)=>{nn(l,c.closed[i],(a,h,f,m)=>Gn(s,a,h,f,m,r,(u,d,g)=>{let M=wt(d,g,a,h,f,m)-c.half;M<n[u]&&(n[u]=M)}))})}if(c.fill){e!=null||(e=new Float32Array(s.nx*s.ny));let r=e;r.fill(Dn);for(let a of c.lines)nn(a,!0,(h,f,m,u)=>Gn(s,h,f,m,u,o,(d,g,M)=>{let y=wt(g,M,h,f,m,u);y<r[d]&&(r[d]=y)}));let l=[],i=[];for(let a=0;a<s.ny;a++){let h=s.y0+a*s.h,f=[];for(let d of c.lines)nn(d,!0,(g,M,y,w)=>{M<=h!=w<=h&&f.push([g+(h-M)*(y-g)/(w-M),w>M?1:-1])});f.sort((d,g)=>d[0]-g[0]),l.length=0,i.length=0;for(let[d,g]of f)l.push(d),i.push(g);let m=0,u=0;for(let d=0;d<s.nx;d++){let g=s.x0+d*s.h;for(;m<l.length&&l[m]<g;)u+=i[m++];let M=c.fill===1?u!==0:(u&1)===1,y=a*s.nx+d,w=M?-r[y]:r[y];w<n[y]&&(n[y]=w)}}}}return n}function Ue(t,s){let{nx:n,ny:o,h:e,x0:c,y0:r}=s,l=new Map,i=u=>{if(l.has(u))return u;let d=u>>1,g=d%n,M=(d-g)/n,y=u&1?d+n:d+1,w=t[d],p=Math.min(Math.max(w/(w-t[y]),1e-5),.99999);return l.set(u,u&1?[c+g*e,r+(M+p)*e]:[c+(g+p)*e,r+M*e]),u},a=new Map,h=(u,d)=>{let g=i(u),M=i(d),y=a.get(g);y?y.push(M):a.set(g,[M]);let w=a.get(M);w?w.push(g):a.set(M,[g])};for(let u=0;u+1<o;u++)for(let d=0;d+1<n;d++){let g=u*n+d,M=g+1,y=g+n+1,w=g+n,p=t[g]<0,b=t[M]<0,k=t[y]<0,A=t[w]<0,I=2*g,v=2*M+1,S=2*w,N=2*g+1,P=[];p!==b&&P.push(I),b!==k&&P.push(v),A!==k&&P.push(S),p!==A&&P.push(N),P.length===2?h(P[0],P[1]):P.length===4&&((t[g]+t[M]+t[y]+t[w])/4<0===p?(h(I,v),h(S,N)):(h(N,I),h(v,S)))}let f=[],m=new Set;for(let u of a.keys()){if(m.has(u))continue;let d=[],g=-1,M=u;for(;!m.has(M);){m.add(M);let y=l.get(M);d.push(y[0],y[1]);let w=a.get(M),p=w[0]!==g?w[0]:w[1];g=M,M=p}d.length>=6&&f.push(Float64Array.from(d))}return f}function qt(t,s,n,o,e){let c=t.length/2,r=t[2*(s%c)],l=t[2*(s%c)+1],i=t[2*(n%c)],a=t[2*(n%c)+1],h=-1,f=o;for(let m=s+1;m<n;m++){let u=wt(t[2*(m%c)],t[2*(m%c)+1],r,l,i,a);u>f&&(f=u,h=m)}h<0||(e[h%c]=1,qt(t,s,h,o,e),qt(t,h,n,o,e))}function Xe(t,s){let n=t.length/2;if(n<4)return t;let o=0,e=-1;for(let l=1;l<n;l++){let i=Math.hypot(t[2*l]-t[0],t[2*l+1]-t[1]);i>e&&(e=i,o=l)}let c=new Uint8Array(n);c[0]=1,c[o]=1,qt(t,0,o,s,c),qt(t,o,n,s,c);let r=[];for(let l=0;l<n;l++)c[l]&&r.push(t[2*l],t[2*l+1]);return Float64Array.from(r)}function Ze(t,s){let n=t.length/2;if(n<4)return t;let o=i=>{let a=i%n,h=(i+1)%n;return Math.hypot(t[2*h]-t[2*a],t[2*h+1]-t[2*a+1])},e=[];for(let i=0;i<n;i++)o(i)>=2.5*s&&e.push(i);if(e.length<2)return t;let c=new Uint8Array(n),r=new Map;for(let i=0;i<e.length;i++){let a=e[i],h=e[(i+1)%e.length],f=(h-a-1+n)%n;if(f<1||f>3)continue;let m=0;for(let N=1;N<=f;N++)m+=o(a+N);if(m>3*s)continue;let u=a%n,d=(a+1)%n,g=h%n,M=(h+1)%n,y=t[2*d]-t[2*u],w=t[2*d+1]-t[2*u+1],p=t[2*M]-t[2*g],b=t[2*M+1]-t[2*g+1],k=y*b-w*p;if(Math.abs(Math.atan2(k,y*p+w*b))<Math.PI/12)continue;let A=((t[2*g]-t[2*u])*b-(t[2*g+1]-t[2*u+1])*p)/k,I=[t[2*u]+A*y,t[2*u+1]+A*w],v=(t[2*d]+t[2*g])/2,S=(t[2*d+1]+t[2*g+1])/2;if(!(Math.hypot(I[0]-v,I[1]-S)>2*s)){r.set(d,I);for(let N=2;N<=f+1;N++)c[(a+N)%n]=1}}if(r.size===0)return t;let l=[];for(let i=0;i<n;i++){if(c[i])continue;let a=r.get(i);a?l.push(a[0],a[1]):l.push(t[2*i],t[2*i+1])}return Float64Array.from(l)}function Wn(t,s){var f,m;let n=(f=s==null?void 0:s.cell)!=null?f:.125,o=Be(t,(m=s==null?void 0:s.strokeWidth)!=null?m:2,.004),e=Number.POSITIVE_INFINITY,c=Number.POSITIVE_INFINITY,r=Number.NEGATIVE_INFINITY,l=Number.NEGATIVE_INFINITY,i=0;for(let u of o){i=Math.max(i,u.half);for(let d of u.lines)for(let g=0;g<d.length;g+=2)e=Math.min(e,d[g]),r=Math.max(r,d[g]),c=Math.min(c,d[g+1]),l=Math.max(l,d[g+1])}if(!(r>=e))return[];i+=3*n;let a={x0:e-i,y0:c-i,h:n,nx:Math.ceil((r-e+2*i)/n)+1,ny:Math.ceil((l-c+2*i)/n)+1},h=Ue(Qe(o,a),a).filter(u=>Math.abs(Q(u))>.01);return h.map(u=>{let d=0;for(let M of h)M!==u&&J(u[0],u[1],M)&&d++;let g=d%2===1;return Ze(Xe(Q(u)>0==!g?u:bt(u),n*.08),n)})}function Bn(t,s){if(jt(t))return t;let n="";for(let o of Wn(t,s)){n+=`M${Rt(o[0])} ${Rt(o[1])}`;for(let e=2;e<o.length;e+=2)n+=`L${Rt(o[e])} ${Rt(o[e+1])}`;n+="Z"}if(!n)throw new Error("morphicons: icon has no visible surface");return[["path",{d:n,fill:"currentColor",stroke:"none","fill-rule":"nonzero",[Fn]:"1"}]]}function ct(t,s){if(jt(t))return t;let n=z(t)==="fill"&&!t.some(([,r])=>$t(r.stroke)&&r["stroke-width"]===void 0)?0:s,o=typeof t=="string"?void 0:Vn.get(t),e=o==null?void 0:o.get(n);if(e)return e;let c=`${n}|${typeof t=="string"?t:JSON.stringify(t)}`;return e=rt.get(c),e?rt.delete(c):e=Bn(t,{strokeWidth:s}),rt.set(c,e),rt.size>64&&rt.delete(rt.keys().next().value),typeof t!="string"&&(o||(o=new Map,Vn.set(t,o)),o.set(n,e)),e}function en(t){let s=Yn.get(t);return s||(s=sn(t),Yn.set(t,s)),s}function Qn(t,s,n){let o=ct(t,n),e=ct(s,n),c=Hn.get(o);c||(c=new WeakMap,Hn.set(o,c));let r=c.get(e);return r||(r=rn(en(o),en(e)),c.set(e,r)),r}function Un(t,s,n){return rn(typeof t=="string"?sn(ct(t,n)):t,en(ct(s,n)))}var Ce,Le,jn,$e,_e,Ln,Rn,Ge,Ve,Dn,$t,We,Rt,Vn,rt,Yn,Hn,Zn=Nt(()=>{gt();Ot();Ct();Ce=[Math.PI/4,Math.PI/3,Math.PI/2,Math.PI],Le=.3;jn=.3,$e=.1,_e=16;Ln=1e6;Rn=(t,s)=>{var n;return Math.min(1,Math.max(0,2*s-((n=t.half)!=null?n:s)))};Ge=t=>K([t],[on(G(t),t.length/2)])[0][0];Ve=.25;Dn=1e9,$t=t=>t!==void 0&&String(t).trim().toLowerCase()!=="none",We=(t,s)=>{let n=typeof t=="number"?t:Number.parseFloat(String(t!=null?t:""));return Number.isFinite(n)?n:s};Rt=t=>String(Math.round(t*1e3)/1e3);Vn=new WeakMap,rt=new Map,Yn=new WeakMap,Hn=new WeakMap;globalThis[Symbol.for("morphicons.region")]={regionOf:ct,regionPlan:Qn,regionPlanFrom:Un}});var ue=ye((Ns,fe)=>{var ae=require("react");function dn(t,s,n){let o={};if(s)for(let c in s)c!=="key"&&(o[c]=s[c]);let e=s&&s.key!=null?s.key:n;return e!=null&&(o.key=e),ae.createElement(t,o)}fe.exports={jsx:dn,jsxs:dn,jsxDEV:dn,Fragment:ae.Fragment}});var is={};bn(is,{MorphIcon:()=>he});module.exports=we(is);function Pt(t){return t.items.map(()=>new Float64Array(2*t.n))}function mt(t,s,n){for(let o=0;o<t.items.length;o++){let e=t.items[o],c=n[o],r=t.n,l=Math.exp(e.lnSigma*s),i=e.theta*s,a=Math.cos(i)*l,h=Math.sin(i)*l,f,m;if(e.block){let[d,g]=e.block.off,[M,y]=e.block.drift;f=e.ca[0]+M*s+(d*a-g*h-d),m=e.ca[1]+y*s+(d*h+g*a-g)}else f=e.ca[0]+(e.cb[0]-e.ca[0])*s,m=e.ca[1]+(e.cb[1]-e.ca[1])*s;let u=e.half===void 0?s:Math.min(1,Math.max(0,2*s-e.half));for(let d=0;d<r;d++){let g=e.aC[2*d]+(e.bT[2*d]-e.aC[2*d])*u,M=e.aC[2*d+1]+(e.bT[2*d+1]-e.aC[2*d+1])*u;c[2*d]=f+g*a-M*h,c[2*d+1]=m+g*h+M*a}}}var xn=class{constructor(){ht(this,"x",1);ht(this,"v",0);ht(this,"k",250);ht(this,"c",24)}config(t,s){this.k=t,this.c=s}start(){this.x=0,this.v>14&&(this.v=14),this.v<-14&&(this.v=-14)}step(t){let s=Math.max(1,Math.min(16,Math.ceil(t/.004166666666666667))),n=t/s;for(let o=0;o<s;o++){let e=this.k*(1-this.x)-this.c*this.v;this.v+=e*n,this.x+=this.v*n}return Math.abs(1-this.x)<.001&&Math.abs(this.v)<.02}},Ht={smooth:{k:170,c:26},snappy:{k:420,c:30},bouncy:{k:300,c:14}};gt();Ot();gt();Ot();Ct();var vt=new Set,nt=0,lt=-1;function oe(t){let s=lt<0?0:Math.min(Math.max((t-lt)/1e3,0),.1);lt=t;for(let n of[...vt])n(s);vt.size>0?nt=requestAnimationFrame(oe):(nt=0,lt=-1)}function Ke(t){vt.add(t),nt===0&&(lt=-1,nt=requestAnimationFrame(oe))}function Je(t){vt.delete(t),vt.size===0&&nt!==0&&(cancelAnimationFrame(nt),nt=0,lt=-1)}var Kn=new WeakMap,Jn=new WeakMap,te=new WeakMap;function re(t){return typeof t=="string"||z(t)==="stroke"?B(t):Jt(t).flatMap(s=>{let n=B([s]),o=String(s[1]["fill-rule"]).trim()==="evenodd",e=0;for(let c of n)e+=Q(c.pts);for(let c of n){let r=e<0;if(o){let l=!0;for(let i of n)i!==c&&J(c.pts[0],c.pts[1],i.pts)&&(l=!l);r=Q(c.pts)>0!==l}r&&(c.pts=bt(c.pts))}return n})}function tt(t){if(typeof t=="string")return xt(t);let s=Kn.get(t);return s||(s=re(t).map(n=>({pts:yt(n,64),closed:n.closed})),Kn.set(t,s)),s}function zt(t){if(typeof t=="string")return t;let s=Jn.get(t);return s||(s=Sn(re(t)),Jn.set(t,s)),s}function ts(t,s){if(typeof t=="string"||typeof s=="string")return ot(tt(t),tt(s));let n=te.get(t);n||(n=new WeakMap,te.set(t,n));let o=n.get(s);return o||(o=ot(tt(t),tt(s)),n.set(s,o)),o}var Y=null,It=null,ln=0,un=!1,Dt,cn=0,ce=()=>Promise.resolve().then(()=>(Zn(),Xn));var ns=t=>new Promise((s,n)=>{let o=document.createElement("script");o.type="module",o.onload=o.onerror=()=>{o.remove();let e=globalThis[Symbol.for("morphicons.region")];e?s(e):n(new Error(t))},o.src=`${t}#${Date.now()}`,document.head.append(o)}),es=()=>{var n,o;let t=(n=/import\(\s*["'`]([^"'`]+)/.exec(String(ce)))==null?void 0:n[1],s=(o=/\w+:\/\/[^\s)]+?(?=:\d+:\d+)/.exec(String(new Error().stack)))==null?void 0:o[0];try{return t&&new URL(t,s).href}catch{}};function an(){if(Y)return Promise.resolve(Y);if(!It){ln=Date.now();let t=Dt,s=cn;It=ce().catch(n=>t?ns(t):Promise.reject(n)).then(n=>(s===cn&&(Y=n),n),n=>{var o,e;throw s!==cn||(It=null,un=!0,Dt!=null||(Dt=(e=(o=/dynamically imported module:?\s*(\S+)/i.exec(String(n==null?void 0:n.message)))==null?void 0:o[1])!=null?e:es())),n})}return It}var ss=()=>new Promise((t,s)=>{var o;if(typeof navigator!="undefined"&&(o=navigator.connection)!=null&&o.saveData)return;let n=()=>{un?s():an().then(t,s)};typeof requestIdleCallback=="function"?requestIdleCallback(n,{timeout:2e3}):setTimeout(n,200)}),ne=100,le=t=>t==="stroke"?{fill:"none",stroke:"inherit"}:{fill:"currentColor",stroke:t==="fill"?"none":"inherit","fill-rule":"nonzero"},ee=new WeakMap,se=new WeakSet;function fn(t){if(typeof t=="string"||z(t)==="stroke")return"stroke";let s=ee.get(t);if(s)return s;let n=0,o=-1;s="fill";for(let e of Jt(t)){let c=Ft(e[1].stroke),r=Ft(e[1].fill)||e[1].fill===void 0&&!c;c&&(s="both");let l=0;for(let i of B([e]))l+=Math.abs(Q(i.pts));r?n+=l:c&&(o=Math.max(o,0)+l)}return o>1.5*n&&(s="stroke"),ee.set(t,s),s}function ie(t){if(!(t===void 0||z(t)==="stroke"))return le(fn(t))}function os(t,s){let o=({pts:e,closed:c},r)=>{e.length>128&&(e=e.filter((h,f)=>f%4<2));let l=G(e),i=e.map((h,f)=>h-l[f&1]),a=new Float64Array(128);return{aC:r?a:i,bT:r?i:a,ca:l,cb:l,theta:0,lnSigma:0,closed:c,half:r,block:null}};return{n:64,items:[...t.map(e=>o(e,0)),...s.map(e=>o(e,1))]}}function rs(t){var n,o;if(typeof t=="string")return Ht[t];let s=Ht.snappy;return{k:(n=t==null?void 0:t.stiffness)!=null?n:s.k,c:(o=t==null?void 0:t.damping)!=null?o:s.c}}function hn(t,s,n){var St,et;let o=new xn,e=(St=n==null?void 0:n.reducedMotion)!=null?St:"never",c=(et=n==null?void 0:n.strokeWidth)!=null?et:2,r=s,l=!0,i=null,a=null,h=null,f=1,m=!1,u=!1,d=!1,g=!1,M=null,y="stroke",w=!se.has(t),p=0,b="stroke",k=null,A=x=>{if(!(x===y&&w)){for(let[T,F]of Object.entries(le(x)))t.setAttribute(T,F);y=x,w=!0,se.add(t)}},I=x=>{let T=Y&&z(x)==="fill"?Y.regionOf(x,c):x;t.setAttribute("d",zt(T)),A(fn(T))},v=x=>{let T=r;x.then(()=>{!u&&l&&r===T&&M===null&&I(T)},()=>{})};I(s),z(s)==="fill"&&!Y&&v(ss());let S=x=>{var T,F;return p?x<.5?[0,p]:[p,(F=i==null?void 0:i.items.length)!=null?F:0]:[0,(T=i==null?void 0:i.items.length)!=null?T:0]},N=x=>{let T=i,F=a,q=h;if(!T||!F||!q)return;f=x,mt(T,x,F),g=!0;let[V,W]=S(x);p&&A(x<.5?b:fn(r)),t.setAttribute("d",dt(F.slice(V,W),q.slice(V,W)))},P=()=>{m&&(m=!1,Je(L))},L=x=>{let T=o.step(x);N(o.x),T&&(P(),C())},C=()=>{l=!0,i=null,a=null,h=null,f=1,o.x=1,o.v=0,d=!1,p=0,I(r),z(r)==="fill"&&!Y&&(It||!un)&&v(an())},R=()=>{let x=i,T=a;if(l||!x||!T)return tt(r);let[F,q]=S(f);return T.slice(F,q).map((V,W)=>({pts:Float64Array.from(V),closed:x.items[F+W].closed,hole:x.items[F+W].hole}))},Z=x=>!l&&d||z(x)==="fill"||z(r)==="fill",U=(x,T)=>{if(!l&&i&&a&&!g&&(f=0,mt(i,0,a)),T||!l&&p){let F=R();k=l?r:null,b=y,i=os(F,tt(x)),p=F.length,d=!1}else if(Z(x)){let F=Y;i=l||!a?F.regionPlan(r,x,c):F.regionPlanFrom(d?R():dt(a,h!=null?h:void 0),x,c),d=!0,p=0,A("fill")}else i=l?ts(r,x):ot(R(),tt(x)),d=!1;a=Pt(i),g=!1,h=i.items.map(F=>F.closed),r=x,l=!1},E=(x,T,F)=>{if(Y||!l&&p||!Z(x))return!1;let q={};M=q;let V=()=>{u||M!==q||(M=null,F())},W=an();if(Date.now()-ln>ne)return V(),!0;let at=setTimeout(V,ne-(Date.now()-ln));return W.then(()=>{clearTimeout(at),!(u||M!==q)&&(M=null,T())},()=>{clearTimeout(at),V()}),!0},O=x=>{P(),M=null,r=x,C()},_=()=>{var x;return e==="always"?!0:e!=="user"||typeof matchMedia=="undefined"?!1:(x=matchMedia==null?void 0:matchMedia("(prefers-reduced-motion: reduce)").matches)!=null?x:!1},H=(x,T,F=!1)=>{if(u||!F&&E(x,()=>H(x,T),()=>H(x,T,!0)))return;M=null;let q=!l&&i!==null&&x===r;q&&p&&Y&&k!==null&&(r=k,l=!0,q=!1),P(),o.v=0,q||U(x,F),N(T)},it=(x,T,F)=>{if(u)return;if(x===r&&(l||m)){M=null;return}if(_()){O(x);return}if(!F&&E(x,()=>it(x,T,!1),()=>it(x,T,!0)))return;M=null;let{k:q,c:V}=rs(T);o.config(q,V),U(x,F),o.start(),m||(m=!0,Ke(L))};return{morphTo:(x,T)=>it(x,T,!1),set(x){u||O(x)},seek:H,get progress(){return l?1:f},set progress(x){u||H(r,x)},get reducedMotion(){return e},set reducedMotion(x){e=x},get strokeWidth(){return c},set strokeWidth(x){c=x},destroy(){P(),u=!0,M=null,i=null,a=null,h=null}}}Ct();function mn(t,s,n){return n>=1?s:n<=0||z(t)==="fill"||z(s)==="fill"?t:null}var j=require("react"),At=xe(ue(),1),cs=typeof document=="undefined"?j.useEffect:j.useLayoutEffect;function ls(t,s,n){let o=mn(t,s,n);if(o!==null)return zt(o);let e=ot(xt(t),xt(s)),c=Pt(e);return mt(e,n,c),dt(c,e.items.map(r=>r.closed))}var he=(0,j.forwardRef)(function(s,n){var U;let{icon:o,from:e,to:c,progress:r,spring:l,reducedMotion:i,size:a=24,color:h="currentColor",strokeWidth:f=2,absoluteStrokeWidth:m,label:u,...d}=s,g=e!==void 0&&c!==void 0,M=(U=o!=null?o:e)!=null?U:c,[y]=(0,j.useState)(()=>g?ls(e,c,r!=null?r:0):M!==void 0?zt(M):""),[w]=(0,j.useState)(()=>{var O;let E=ie(g?(O=mn(e,c,r!=null?r:0))!=null?O:(r!=null?r:0)<.5?e:c:M);return E&&{fill:E.fill,stroke:E.stroke,fillRule:E["fill-rule"]}}),p=(0,j.useRef)(null),b=(0,j.useRef)(null),k=(0,j.useRef)(l);k.current=l;let A=(0,j.useRef)(i);A.current=i;let I=Number(m?Number(f)*24/Number(a):f),v=(0,j.useRef)(I);v.current=I;let S=(0,j.useRef)(o),N=(0,j.useRef)(g),P=(0,j.useRef)(!1),L=(0,j.useRef)(!1),C=(0,j.useRef)(null),R=(0,j.useCallback)(E=>{if(b.current)return b.current;let O=p.current;return P.current||!O?null:(b.current=hn(O,E,{reducedMotion:A.current,strokeWidth:v.current}),b.current)},[]);cs(()=>{P.current=!1;let E=p.current;if(E&&M!==void 0){let O=hn(E,g?e:M,{reducedMotion:A.current,strokeWidth:v.current});if(b.current=O,g){C.current=[e,c];let _=r!=null?r:0;_<=0?O.set(e):_>=1?O.set(c):(O.seek(c,_),L.current=!0)}}return()=>{var O;P.current=!0,(O=b.current)==null||O.destroy(),b.current=null,L.current=!1,C.current=null}},[]),(0,j.useEffect)(()=>{let E=b.current;E&&(E.reducedMotion=i!=null?i:"never")},[i]),(0,j.useEffect)(()=>{let E=b.current;E&&(E.strokeWidth=I)},[I]),(0,j.useEffect)(()=>{let E=N.current&&!g;N.current=g;let O=o!==S.current;if(S.current=o,g||o===void 0||!O&&!E)return;C.current=null,L.current=!1;let _=b.current;_?_.morphTo(o,k.current):R(o)},[o,g,R]),(0,j.useEffect)(()=>{var _;if(!g)return;let E=(_=b.current)!=null?_:R(e);if(!E)return;let O=r!=null?r:0;(!C.current||C.current[0]!==e||C.current[1]!==c)&&(C.current=[e,c],L.current=!1),O<=0?(E.set(e),L.current=!1):O>=1?(E.set(c),L.current=!1):(L.current||(E.set(e),L.current=!0),E.seek(c,O))},[g,e,c,r,R]),(0,j.useImperativeHandle)(n,()=>({morphTo:(E,O)=>{C.current=null,L.current=!1;let _=b.current;_?_.morphTo(E,O!=null?O:k.current):R(E)},set:E=>{C.current=null,L.current=!1;let O=b.current;O?O.set(E):R(E)}}),[R]);let Z=m?Number(f)*24/Number(a):f;return(0,At.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",width:a,height:a,viewBox:"0 0 24 24",fill:"none",stroke:h,color:h,strokeWidth:Z,strokeLinecap:"round",strokeLinejoin:"round",role:u?"img":void 0,"aria-hidden":u?void 0:!0,...d,children:[u?(0,At.jsx)("title",{children:u}):null,(0,At.jsx)("path",{ref:p,d:y,...w})]})});
      })(require, module, module.exports);
      return module.exports;
    })();

    return { inject: ['slots', 'locale', 'sessions'], apply };
  },
});
