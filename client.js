/**
 * Browser half of the Cyrene theme bundle.
 *
 * Everything visual lives here: the palette recipes, the mapping from those
 * recipes onto the Harness `--dsw-*` design tokens, an optional ambient wash,
 * and a small debug panel with live switching.
 *
 * Design rules followed on purpose:
 * - Only design tokens are overridden; no component class names are targeted,
 *   so the pack cannot fight the shell's layout.
 * - Everything is scoped under `html[data-cyrene="on"]`, so turning the pack
 *   off restores the stock look instantly and completely.
 * - The debug panel lives in a shadow root, so its styles never leak.
 */

const MODULE_ID = 'dsh-theme-cyrene'

window.__ModuleLoader__.load({
  id: MODULE_ID,
  factory(require) {
    'use strict'

    // Resolve shared modules once, while the factory runs. The module loader
    // only hands out requires during materialization; calling require() again
    // from a component render is exactly what breaks on newer runtimes.
    let React = null
    try {
      React = require('react')
    } catch {
      React = null
    }
    const h = React && typeof React.createElement === 'function'
      ? React.createElement
      : () => null

    const VERSION = '0.37.0'
    const STORAGE_KEY = 'dsh.cyrene.v1'
    const STYLE_ID = 'cy-theme-styles'
    /**
     * What the thinking row shows in place of the host's whale.
     *
     * `note` draws a ♪ in the status line itself (no DOM, no asset, one keyframe);
     * `signature` swaps in the traced "Cyrene" handwriting, which needs the SVG in
     * SIGN_MARKUP and the 86x40 block it lives in. The attribute it publishes
     * (`data-cyrene-runicon`) is what the stylesheet branches on.
     */
    const RUNNING_ICON = 'note'
    const AMBIENT_ID = 'cy-theme-ambient'
    const PANEL_ID = 'cy-theme-panel'
    const SPLASH_ID = 'cy-theme-splash'
    const SPLASH_SESSION_KEY = 'dsh.cyrene.splashSeen'
    // 问候语用「洗牌袋」轮流发牌，发到第几张存这儿（不进 state：它不是偏好）。
    const SPLASH_DECK_KEY = 'dsh.cyrene.splashDeck'
    // 一副牌里每句放几张。2 → 十张一副，每十次开屏每句正好两次。
    const SPLASH_COPIES = 2
    const SPLASH_DEFAULT_SECONDS = 2.5
    const SPLASH_MIN_SECONDS = 1
    const SPLASH_MAX_SECONDS = 5
    /** Hard cap on the "still loading" loop, so a broken boot cannot trap the UI. */
    const SPLASH_WAIT_CAP_MS = 20000
    /** Must match the `cy-splash-out` animation duration in the stylesheet. */
    const SPLASH_EXIT_MS = 560
    const SPLASH_DEFAULT_SIZE = 300
    const SPLASH_MIN_SIZE = 300
    const SPLASH_MAX_SIZE = 720
    // 偏好版本。每一项迁移都卡在自己的版本号上，新增一条不要动旧的那条，
    // 否则后来的人再加载一次就会被重置。
    //   2: 开屏默认值挪到 300px / 白底
    //   3: 水印下缘默认值挪到 200px
    //   4: 水印改成矢量后下缘默认值收到 160px
    //   5: 水印横向默认改回居中（此前贴右）
    //   6: 开屏动画跟着档位走（「轻」档默认关）
    const PREFS_REV = 6

    const PRESETS = [
      { id: 'moon', label: '月白', hint: '奶粉 + 藕荷，默认' },
      { id: 'tide', label: '潮汐', hint: '天空蓝 + 薄荷' },
      { id: 'nightfall', label: '夜阑', hint: '紫夜 + 粉光' },
    ]

    // 美化程度：设置面板里的两档开关。
    // 0.25 去掉了夹在中间的「中」——它只比「轻」多一个侧栏品牌位，
    // 为这一个差别单列一档，选择成本比收益大。
    //   tint —— 配色 + 圆角/阴影/滚动条/选区 + 空状态上色 + 官方品牌换色
    //   full —— 再加侧栏品牌位（花瓣标 + 渐变字）、氛围层、对话水印、
    //           输入框配色与「思考中」的音符
    const LEVELS = [
      { id: 'tint', zh: '轻', en: 'Light', hintZh: '配色、圆角与阴影', hintEn: 'Palette, radii and shadows' },
      { id: 'full', zh: '全', en: 'Full', hintZh: '再加品牌位、氛围层与水印', hintEn: 'Adds the brand, ambient and watermark' },
    ]

    // 水印横向对齐：设置面板里的两项开关。居中放在前面，因为它是默认。
    const ANCHORS = [
      { id: 'center', zh: '居中', en: 'Centre', hintZh: '水平居中，窗口怎么变都在中间', hintEn: 'Centred, whatever the window size' },
      { id: 'right', zh: '右下', en: 'Right', hintZh: '贴着右边走，窗口越宽越靠右', hintEn: 'Pinned to the right edge' },
    ]

    // 键盘快捷键。主题开关可以在设置里改（state.shortcut），调试面板的固定。
    // 组合存成 "ctrl+alt+x" 这种规范形式：修饰键按 ctrl → alt → shift → meta
    // 排好序，同一个组合只有一种写法，可以直接和按键事件拼出来的字符串比较。
    const DEFAULT_SHORTCUT = 'ctrl+alt+x'
    const PANEL_SHORTCUT = 'ctrl+alt+p'

    // 开屏动画的开关。状态本身是布尔（state.splash），这里只是给它两档按钮。
    const SPLASH_MODES = [
      { id: 'on', zh: '开', en: 'On', hintZh: '启动时播一次，点画面或按 Esc 可跳过', hintEn: 'Plays once at launch; click or Esc to skip' },
      { id: 'off', zh: '关', en: 'Off', hintZh: '启动时直接进界面', hintEn: 'Straight to the app at launch' },
    ]

    const DEFAULT_STATE = {
      enabled: true,
      preset: 'moon',
      intensity: 0.8,
      ambient: true,
      panel: false,
      // The Windows title strip is painted with --dsw-specific-sidebar-fill
      // (`[data-windows-titlebar] .frame:before`), so that is the colour the
      // caption buttons have to match.
      chrome: 'sidebar',
      // 0.2.2 defaulted to canvas and persisted it; a stored value only counts
      // once the user actually picked one.
      chromeExplicit: false,
      level: 'full',
      chatBg: true,
      // 水印下缘离对话区底部多远。输入框是 sticky 的，贴着底放会被吃掉。
      chatBgY: 160,
      // 只有真的拖过滑杆才算数；没动过的人在版本升级时跟着新默认值走。
      chatBgYExplicit: false,
      // 横向对齐：center 水平居中（默认），right 贴右边。
      chatBgAnchor: 'center',
      // 只有真的点过对齐开关才算数；没点过的人在版本升级时跟着新默认值走。
      chatBgAnchorExplicit: false,
      // 开场文案：把宿主的两句固定文案换成包里的说法（只在「全」档生效）。
      copy: true,
      splash: true,
      // 「轻」档默认不放开场动画；只有真的点过那个开关才算数，
      // 没点过的人跟着档位走（轻=关，中/全=开）。
      splashExplicit: false,
      splashSeconds: SPLASH_DEFAULT_SECONDS,
      splashTone: 'white',
      splashSize: SPLASH_DEFAULT_SIZE,
      // 开关主题的快捷键。字符串形式见 normalizeCombo()。
      shortcut: DEFAULT_SHORTCUT,
      // Bumped when a stored preference should adopt the new defaults once;
      // the user's own later changes keep winning.
      prefsRev: PREFS_REV,
    }

    /* ------------------------------------------------------------------ */
    /* Stylesheet                                                          */
    /* ------------------------------------------------------------------ */

    const CSS = String.raw`/* CYRENE:CSS:BEGIN */
html[data-cyrene="on"] {
  --cy-intensity: 0.8;
}

/* ---------- 月白：奶粉 + 藕荷 ---------- */
html[data-cyrene="on"][data-cyrene-preset="moon"] {
  --cy-surface-0: #fdf8fb;
  --cy-surface-1: #ffffff;
  --cy-surface-2: #fbf0f6;
  --cy-surface-3: #f6e6f0;
  --cy-sidebar: #fbf3f8;
  --cy-overlay: #f4e6ef;
  --cy-ink: #2b2134;
  --cy-ink-2: #5b4b68;
  --cy-ink-3: #826f92;
  --cy-ink-4: #9a86a9;
  --cy-ink-dim: #c7b8d2;
  --cy-line-1: #f2e0ea;
  --cy-line-2: #e8d0e0;
  --cy-line-3: #dcc0d6;
  --cy-line-4: #cbaac8;
  --cy-accent: #d45f9f;
  --cy-accent-deep: #8a4a86;
  --cy-accent-soft: #fce6f3;
  --cy-accent-soft-2: #f8d7ec;
  --cy-brand: #9e3f7a;
  --cy-brand-hover: #b04d89;
  --cy-brand-dim: #f0d3e5;
  --cy-on-brand: #ffffff;
  --cy-mint: #5cc6b6;
  --cy-gold: #e6bf86;
  --cy-hover: rgb(212 95 159 / 8%);
  --cy-active: rgb(212 95 159 / 14%);
  --cy-menu: rgb(255 250 253 / 86%);
  --cy-menu-head: rgb(253 246 251 / 94%);
  --cy-toast-bg: #4a2f4a;
  --cy-toast-ink: #fdf4fa;
  --cy-tooltip-bg: #3a2740;
  --cy-switch-thumb: #ffffff;
  --cy-code-bg: #faf2f8;
  --cy-code-banner: #f7ecf4;
  --cy-code-inline: #f8eff5;
  --cy-bubble: #f7e9f3;
  --cy-bubble-hl: #fbe0ef;
  --cy-selection: rgb(212 95 159 / 22%);
  --cy-scroll: rgb(196 150 186 / 55%);
  --cy-scroll-hover: rgb(180 124 168 / 75%);
  --cy-glow-a: rgb(242 166 212 / 20%);
  --cy-glow-b: rgb(126 196 242 / 16%);
  --cy-glow-c: rgb(178 140 232 / 18%);
}

html[data-cyrene="on"][data-cyrene-preset="moon"] body[data-ds-dark-theme] {
  --cy-surface-0: #150f1c;
  --cy-surface-1: #1c1526;
  --cy-surface-2: #241a31;
  --cy-surface-3: #2c2039;
  --cy-sidebar: #191222;
  --cy-overlay: #2a1f36;
  --cy-ink: #f7eef9;
  --cy-ink-2: #d8c6e2;
  --cy-ink-3: #b49fc2;
  --cy-ink-4: #8d7a9b;
  --cy-ink-dim: #5d4f6a;
  --cy-line-1: #2a2035;
  --cy-line-2: #332640;
  --cy-line-3: #41304f;
  --cy-line-4: #523f61;
  --cy-accent: #f09ad6;
  --cy-accent-deep: #ffc2ec;
  --cy-accent-soft: #3a2239;
  --cy-accent-soft-2: #4a2b47;
  --cy-brand: #e27fc4;
  --cy-brand-hover: #ef95d4;
  --cy-brand-dim: #3a2239;
  --cy-on-brand: #1a1020;
  --cy-mint: #7adcc9;
  --cy-gold: #efcaa0;
  --cy-hover: rgb(240 154 214 / 10%);
  --cy-active: rgb(240 154 214 / 16%);
  --cy-menu: rgb(30 21 40 / 84%);
  --cy-menu-head: rgb(28 20 38 / 92%);
  --cy-toast-bg: #3a2b46;
  --cy-toast-ink: #f7eef9;
  --cy-tooltip-bg: #3a2b46;
  --cy-switch-thumb: #e9d3ea;
  --cy-code-bg: #1d1626;
  --cy-code-banner: #221a2c;
  --cy-code-inline: #241b2f;
  --cy-bubble: #2a1d33;
  --cy-bubble-hl: #3a2440;
  --cy-selection: rgb(240 154 214 / 28%);
  --cy-scroll: rgb(150 110 160 / 45%);
  --cy-scroll-hover: rgb(180 140 190 / 65%);
  --cy-glow-a: rgb(240 154 214 / 14%);
  --cy-glow-b: rgb(120 170 230 / 12%);
  --cy-glow-c: rgb(160 120 230 / 14%);
}

/* ---------- 潮汐：天空蓝 + 薄荷 ---------- */
html[data-cyrene="on"][data-cyrene-preset="tide"] {
  --cy-surface-0: #f6fafe;
  --cy-surface-1: #ffffff;
  --cy-surface-2: #eff6fd;
  --cy-surface-3: #e6f0fb;
  --cy-sidebar: #f4f9fe;
  --cy-overlay: #e9f2fc;
  --cy-ink: #1c2836;
  --cy-ink-2: #43566b;
  --cy-ink-3: #5d7186;
  --cy-ink-4: #7f92a6;
  --cy-ink-dim: #b7c5d2;
  --cy-line-1: #e3edf6;
  --cy-line-2: #d6e4f1;
  --cy-line-3: #c3d6e8;
  --cy-line-4: #a8bfd6;
  --cy-accent: #3f88cc;
  --cy-accent-deep: #2c6fa8;
  --cy-accent-soft: #e4f1fd;
  --cy-accent-soft-2: #d6e9fb;
  --cy-brand: #2e6fa8;
  --cy-brand-hover: #3a80bc;
  --cy-brand-dim: #dcebf9;
  --cy-on-brand: #ffffff;
  --cy-mint: #48bfb0;
  --cy-gold: #e3c08d;
  --cy-hover: rgb(63 136 204 / 8%);
  --cy-active: rgb(63 136 204 / 14%);
  --cy-menu: rgb(252 254 255 / 86%);
  --cy-menu-head: rgb(248 252 255 / 94%);
  --cy-toast-bg: #22364b;
  --cy-toast-ink: #f2f8ff;
  --cy-tooltip-bg: #1c2e40;
  --cy-switch-thumb: #ffffff;
  --cy-code-bg: #f3f8fd;
  --cy-code-banner: #edf4fb;
  --cy-code-inline: #f0f6fc;
  --cy-bubble: #e9f2fc;
  --cy-bubble-hl: #dcedfd;
  --cy-selection: rgb(63 136 204 / 22%);
  --cy-scroll: rgb(140 175 205 / 55%);
  --cy-scroll-hover: rgb(110 150 185 / 75%);
  --cy-glow-a: rgb(126 196 242 / 20%);
  --cy-glow-b: rgb(120 205 200 / 16%);
  --cy-glow-c: rgb(150 180 230 / 16%);
}

html[data-cyrene="on"][data-cyrene-preset="tide"] body[data-ds-dark-theme] {
  --cy-surface-0: #0d1520;
  --cy-surface-1: #131f2c;
  --cy-surface-2: #182635;
  --cy-surface-3: #1e2f40;
  --cy-sidebar: #111c28;
  --cy-overlay: #1b2a3a;
  --cy-ink: #eaf3fb;
  --cy-ink-2: #bcd0e2;
  --cy-ink-3: #94aabf;
  --cy-ink-4: #71879c;
  --cy-ink-dim: #4c5f73;
  --cy-line-1: #1e2c3b;
  --cy-line-2: #26364a;
  --cy-line-3: #31445c;
  --cy-line-4: #3f5674;
  --cy-accent: #7fc4f2;
  --cy-accent-deep: #b7e1ff;
  --cy-accent-soft: #16324a;
  --cy-accent-soft-2: #1b3d58;
  --cy-brand: #63a7dc;
  --cy-brand-hover: #7fb9e6;
  --cy-brand-dim: #1b3a52;
  --cy-on-brand: #0b1420;
  --cy-mint: #6fd9c8;
  --cy-gold: #e8c79a;
  --cy-hover: rgb(127 196 242 / 10%);
  --cy-active: rgb(127 196 242 / 16%);
  --cy-menu: rgb(18 30 42 / 82%);
  --cy-menu-head: rgb(16 27 38 / 92%);
  --cy-toast-bg: #1e3247;
  --cy-toast-ink: #eaf3fb;
  --cy-tooltip-bg: #1a2a3a;
  --cy-switch-thumb: #b9d4e8;
  --cy-code-bg: #14212e;
  --cy-code-banner: #182836;
  --cy-code-inline: #1b2c3c;
  --cy-bubble: #17283a;
  --cy-bubble-hl: #1c3348;
  --cy-selection: rgb(127 196 242 / 28%);
  --cy-scroll: rgb(120 155 185 / 45%);
  --cy-scroll-hover: rgb(150 185 215 / 65%);
  --cy-glow-a: rgb(90 170 230 / 16%);
  --cy-glow-b: rgb(90 200 190 / 12%);
  --cy-glow-c: rgb(120 150 220 / 14%);
}

/* ---------- 夜阑：紫夜 + 粉光 ---------- */
html[data-cyrene="on"][data-cyrene-preset="nightfall"] {
  --cy-surface-0: #f8f4fd;
  --cy-surface-1: #ffffff;
  --cy-surface-2: #f2ebfb;
  --cy-surface-3: #ebe1f8;
  --cy-sidebar: #f6f0fc;
  --cy-overlay: #ede4f9;
  --cy-ink: #241a33;
  --cy-ink-2: #4e3c63;
  --cy-ink-3: #75618c;
  --cy-ink-4: #9c88b3;
  --cy-ink-dim: #c2b3d2;
  --cy-line-1: #e9dff5;
  --cy-line-2: #ddd0ee;
  --cy-line-3: #cdbce4;
  --cy-line-4: #b7a2d3;
  --cy-accent: #8b5fd0;
  --cy-accent-deep: #5b3a8e;
  --cy-accent-soft: #efe4fb;
  --cy-accent-soft-2: #e5d6f7;
  --cy-brand: #6e43a8;
  --cy-brand-hover: #7e52bb;
  --cy-brand-dim: #e7dbf6;
  --cy-on-brand: #ffffff;
  --cy-mint: #56c1b4;
  --cy-gold: #e0b87f;
  --cy-hover: rgb(139 95 208 / 8%);
  --cy-active: rgb(139 95 208 / 15%);
  --cy-menu: rgb(253 251 255 / 86%);
  --cy-menu-head: rgb(250 246 255 / 94%);
  --cy-toast-bg: #3a2a52;
  --cy-toast-ink: #f7f2ff;
  --cy-tooltip-bg: #2e2142;
  --cy-switch-thumb: #ffffff;
  --cy-code-bg: #f6f0fe;
  --cy-code-banner: #f0e8fc;
  --cy-code-inline: #f3ecfd;
  --cy-bubble: #efe6fb;
  --cy-bubble-hl: #e4d5f8;
  --cy-selection: rgb(139 95 208 / 22%);
  --cy-scroll: rgb(165 140 205 / 55%);
  --cy-scroll-hover: rgb(140 110 185 / 75%);
  --cy-glow-a: rgb(200 150 255 / 20%);
  --cy-glow-b: rgb(255 160 220 / 16%);
  --cy-glow-c: rgb(150 120 240 / 18%);
}

html[data-cyrene="on"][data-cyrene-preset="nightfall"] body[data-ds-dark-theme] {
  --cy-surface-0: #0c0714;
  --cy-surface-1: #140d20;
  --cy-surface-2: #1b1229;
  --cy-surface-3: #231733;
  --cy-sidebar: #110a1c;
  --cy-overlay: #221535;
  --cy-ink: #f4ebff;
  --cy-ink-2: #d2beea;
  --cy-ink-3: #ac97c9;
  --cy-ink-4: #8672a2;
  --cy-ink-dim: #57476b;
  --cy-line-1: #241734;
  --cy-line-2: #2e1e42;
  --cy-line-3: #3b2854;
  --cy-line-4: #4c3669;
  --cy-accent: #c79bf5;
  --cy-accent-deep: #ebcdff;
  --cy-accent-soft: #2e1d46;
  --cy-accent-soft-2: #3b2757;
  --cy-brand: #b07cf0;
  --cy-brand-hover: #c08ff7;
  --cy-brand-dim: #33204c;
  --cy-on-brand: #12081c;
  --cy-mint: #6fe0c9;
  --cy-gold: #f0cda0;
  --cy-hover: rgb(199 155 245 / 10%);
  --cy-active: rgb(199 155 245 / 17%);
  --cy-menu: rgb(20 13 32 / 84%);
  --cy-menu-head: rgb(17 11 27 / 92%);
  --cy-toast-bg: #2a1b40;
  --cy-toast-ink: #f4ebff;
  --cy-tooltip-bg: #241735;
  --cy-switch-thumb: #d8c2f0;
  --cy-code-bg: #150e22;
  --cy-code-banner: #1a1128;
  --cy-code-inline: #1d132c;
  --cy-bubble: #1f1430;
  --cy-bubble-hl: #2a1b42;
  --cy-selection: rgb(199 155 245 / 30%);
  --cy-scroll: rgb(150 110 190 / 45%);
  --cy-scroll-hover: rgb(185 140 225 / 65%);
  --cy-glow-a: rgb(200 140 255 / 18%);
  --cy-glow-b: rgb(255 140 220 / 14%);
  --cy-glow-c: rgb(140 100 240 / 18%);
}

/* ---------- 语义 token 映射 ---------- */
html[data-cyrene="on"] body {
  --dsw-alias-bg-base: var(--cy-surface-0);
  --dsw-alias-bg-layer-1: var(--cy-surface-1);
  --dsw-alias-bg-layer-2: var(--cy-surface-1);
  --dsw-alias-bg-layer-3: var(--cy-surface-2);
  --dsw-alias-bg-module-platform: var(--cy-surface-2);
  --dsw-alias-bg-multi-select: var(--cy-accent-soft);
  --dsw-alias-bg-overlay: var(--cy-overlay);
  --dsw-alias-bg-skeleton: var(--cy-hover);
  --dsw-alias-bg-document-preview: var(--cy-surface-2);
  --dsw-alias-bg-document-selection: var(--cy-selection);
  --dsw-alias-label-document-preview: var(--cy-ink-2);

  --dsw-alias-label-primary: var(--cy-ink);
  --dsw-alias-label-primary-dimmed: var(--cy-ink);
  --dsw-alias-label-primary-bluish: var(--cy-accent-deep);
  --dsw-alias-label-primary-foreground: var(--cy-on-brand);
  --dsw-alias-label-primary-inverted: var(--cy-surface-0);
  --dsw-alias-label-secondary: var(--cy-ink-2);
  --dsw-alias-label-tertiary: var(--cy-ink-3);
  --dsw-alias-label-caption: var(--cy-ink-4);
  --dsw-alias-label-dimmed: var(--cy-ink-dim);
  /* 「深度求索中」那行。宿主默认是 DeepSeek 蓝混深蓝，在粉色主题里是唯一一块冷色，
     所以跟着强调色走；shimmer 是它上面那层流动高光，取亮一档的同族色。 */
  --dsw-alias-label-deep-diving: var(--cy-brand);
  --dsw-alias-label-deep-diving-shimmer: var(--cy-brand-hover);

  --dsw-alias-border-l1: var(--cy-line-1);
  --dsw-alias-border-l2: var(--cy-line-2);
  --dsw-alias-border-l2-darkmode-thin: var(--cy-line-1);
  --dsw-alias-border-l3: var(--cy-line-3);
  --dsw-alias-border-l4: var(--cy-line-4);

  --dsw-alias-brand-primary: var(--cy-brand);
  --dsw-alias-brand-text: var(--cy-ink);
  --dsw-alias-brand-primary-invert: var(--cy-surface-0);
  --dsw-alias-button-primary-fill: var(--cy-brand);
  --dsw-alias-button-primary-hover: var(--cy-brand-hover);
  --dsw-alias-button-primary-dimmed: var(--cy-brand-dim);
  --dsw-alias-button-info-fill: var(--cy-accent);
  --dsw-alias-button-info-hover: var(--cy-accent-deep);
  --dsw-alias-state-business-primary: var(--cy-accent);
  --dsw-alias-state-business-tertiary: var(--cy-accent-soft);
  --dsw-alias-link: var(--cy-accent-deep);
  --dsw-alias-menu-icon: var(--cy-ink-2);

  --dsw-alias-interactive-bg-hover: var(--cy-hover);
  --dsw-alias-interactive-bg-hover-solid: var(--cy-surface-2);
  --dsw-alias-interactive-bg-hover-accent: var(--cy-active);
  --dsw-alias-interactive-bg-active: var(--cy-active);

  --dsw-menu-surface-fill: var(--cy-menu);
  --dsw-specific-menu: var(--cy-menu);
  --dsw-alias-menu-group-header-fill: var(--cy-menu-head);
  --dsw-alias-toast-bg: var(--cy-toast-bg);
  --dsw-alias-toast-label: var(--cy-toast-ink);
  --dsw-alias-tooltip-bg: var(--cy-tooltip-bg);
  --dsw-alias-switch-thumb: var(--cy-switch-thumb);
  --dsw-alias-settings-card-fill: var(--cy-surface-1);

  --dsw-specific-sidebar-fill: var(--cy-sidebar);
  --dsw-specific-sidebar-nav-item-active: var(--cy-accent-soft);
  --dsw-specific-sidebar-nav-item-active-accent: var(--cy-accent-soft-2);
  --dsw-specific-sidebar-nav-item-hover: var(--cy-hover);
  --dsw-specific-input-major: var(--cy-surface-1);
  --dsw-specific-selector: var(--cy-surface-2);
  --dsw-specific-tip: var(--cy-surface-2);
  --dsw-specific-bubble: var(--cy-bubble);
  --dsw-specific-bubble-highlight: var(--cy-bubble-hl);

  --dsw-alias-markdown-code-block: var(--cy-code-bg);
  --dsw-alias-markdown-code-block-banner: var(--cy-code-banner);
  --dsw-alias-markdown-inline-code: var(--cy-code-inline);
  --dsw-alias-markdown-tag: var(--cy-surface-2);
  --dsw-alias-markdown-placeholder: var(--cy-surface-2);
  --dsw-alias-markdown-citation: var(--cy-surface-2);
}

/* ---------- 质感：圆角、阴影、滚动条、选区 ----------
   原来只在「中 / 全」两档生效，0.24 下放到「轻」，0.25 去掉了「中」之后
   就是两档共用这一组，差别只剩下氛围层、对话水印、输入框和侧栏品牌位。 */
html[data-cyrene="on"] body {
  --dsh-scrollbar-thumb: var(--cy-scroll);
  --dsh-scrollbar-thumb-hover: var(--cy-scroll-hover);

  --dsw-radius-xs: 5px;
  --dsw-radius-sm: 10px;
  --dsw-radius-md: 14px;
  --dsw-radius-lg: 18px;
  --dsw-radius-xl: 22px;

  --dsw-elevation-stroke-color: var(--cy-line-3);
  --dsw-shadow-lv1: 0 2px 6px 0 rgb(96 48 92 / 6%);
  --dsw-shadow-lv1-blur: 0 6px 16px 0 rgb(96 48 92 / 5%);
  --dsw-shadow-lv2: 0 6px 18px 0 rgb(96 48 92 / 7%), 0 2px 8px 0 rgb(96 48 92 / 5%);
  --dsw-shadow-lv3: 0 0 1px 0 rgb(96 48 92 / 12%), 0 12px 36px 0 rgb(96 48 92 / 12%);
}

html[data-cyrene="on"] body[data-ds-dark-theme] {
  --dsw-elevation-stroke-color: var(--cy-line-2);
  --dsw-shadow-lv1: 0 2px 6px 0 rgb(0 0 0 / 30%);
  --dsw-shadow-lv1-blur: 0 6px 16px 0 rgb(0 0 0 / 22%);
  --dsw-shadow-lv2: 0 6px 18px 0 rgb(0 0 0 / 34%), 0 2px 8px 0 rgb(0 0 0 / 26%);
  --dsw-shadow-lv3: 0 0 1px 0 rgb(255 255 255 / 10%), 0 12px 36px 0 rgb(0 0 0 / 46%);
}

html[data-cyrene="on"] ::selection {
  background: var(--cy-selection);
  color: var(--cy-ink);
}

html[data-cyrene="on"] ::-webkit-scrollbar-thumb {
  background-color: var(--cy-scroll);
  border-radius: 999px;
}

html[data-cyrene="on"] ::-webkit-scrollbar-thumb:hover {
  background-color: var(--cy-scroll-hover);
}

/* ---------- 品牌位（侧栏左上角） ---------- */
.cy-brand-mark {
  display: block;
  flex: none;
}

/* 空状态那颗徽标：宿主给的是 34px 的鲸鱼，这里换成包里的抠图。 */
.cy-hero-mark {
  display: block;
  object-fit: contain;
  -webkit-user-drag: none;
  user-select: none;
}

/* ---------- 新对话页标题上的风与花瓣 ----------
   特效是照着 1920x1080 的舞台手 K 的，这里只把它缩成标题上方的一条窄带。
   画布压在文字下面（画布 z-index 0，标题文字和徽标抬到 1），所以飘过去的
   花瓣不会糊住字。浅底上它自带的那套加色柔光几乎看不见，靠 multiply 和
   一点饱和度找回来；深底反过来用 screen，和原片的辉光一致。
   上下左右都拿渐变蒙版收边，画布边界的硬切就被抹掉了。 */
html[data-cyrene="on"] [class*="_headline"] {
  position: relative;
}

/* 窄屏仍让图标留在首行左侧，文字在右侧换行，风始终由左向右展开。 */
html[data-cyrene="on"] [class*="_headline"]:has(.cy-hero-wind) {
  flex-wrap: nowrap;
}

html[data-cyrene="on"] [class*="_headline"]:has(.cy-hero-wind) [class*="_fishHitbox"] {
  align-self: flex-start;
}

/* 只抬真正要浮在画布上面的两样东西。
   **千万不要写成 [class*="_headline"] > ***：那会把 _fishHitbox 也变成
   position:relative，画布的包含块就缩成 34px 的图标框，max-width:100% 和
   left/top:50% 全按图标算，整条风带塌成一条竖缝（已经在真机上踩过一次）。 */
html[data-cyrene="on"] [class*="_titleGroup"],
html[data-cyrene="on"] .cy-hero-mark {
  position: relative;
  z-index: 1;
}

/* 徽标和画布都塞在这个插槽里；contents 让它们当作标题的直接子元素排版，
   一行样式都不用跟宿主对齐。 */
.cy-hero-slot {
  display: contents;
}

.cy-hero-wind {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  max-width: none;
  display: block;
  pointer-events: none;
  z-index: 0;
  opacity: 0.5;
  mix-blend-mode: multiply;
  filter: saturate(2.1) brightness(0.68) contrast(1.1);
  -webkit-mask-image:
    linear-gradient(to right, transparent 0, #000 4px, #000 calc(100% - 4px), transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 16%, #000 84%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0, #000 4px, #000 calc(100% - 4px), transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 16%, #000 84%, transparent 100%);
  mask-composite: intersect;
}

body[data-ds-dark-theme] .cy-hero-wind {
  mix-blend-mode: screen;
  filter: saturate(1.15) brightness(1.1);
}

@media (prefers-reduced-motion: reduce) {
  .cy-hero-wind {
    display: none;
  }
}

.cy-brand-name {
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  background-image: linear-gradient(
    100deg,
    var(--cy-brand, #9e3f7a),
    var(--cy-accent, #d45f9f) 58%,
    var(--cy-mint, #5cc6b6)
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* 「轻」档不换字标和图标，仍用官方那两件（鱼标 + 字标，路径全是
   currentColor），只把颜色提成主题色；「全」档才换成上面那个渐变字和花瓣标。 */
html[data-cyrene="on"] .cy-brand-fish,
html[data-cyrene="on"] .cy-brand-wordmark {
  color: var(--cy-brand);
}

/* ---------- 窗口按钮（Windows 标题栏） ----------
   桌面端 preload 用一个 span 探针读 --dsw-specific-sidebar-fill / --dsw-alias-label-primary，
   再通过 IPC 把这两个色交给 Electron 画右上角的三个按钮。
   这里把探针的**底色改成全透明**：按钮底下不是别的地方，正是页面自己画的那条标题栏
   （[data-windows-titlebar] .frame:before 铺的就是侧栏色），开屏时开屏那一层也盖在上面。
   透明之后按钮永远贴在“此刻真正显示的颜色”上——主界面、开屏、开机封面都对得上，
   既不用采样，也不用在开屏前后各重画一次。按钮符号的颜色仍由 preload 照常测量，
   而开屏的明暗本来就跟当前界面一致（浅色档亮、深色档暗），所以那一项也不用动。
   canvas 那档是旧的对照实验：显式选它时才铺一层不透明的画布色。 */
html[data-cyrene="on"] body > span[style*="--dsw-specific-sidebar-fill"] {
  background-color: transparent !important;
}

html[data-cyrene="on"][data-cyrene-chrome="canvas"] body > span[style*="--dsw-specific-sidebar-fill"] {
  background-color: var(--cy-surface-0) !important;
}

/* ---------- 设置里的「美化程度」一行 ---------- */
.cy-settings-row {
  display: flex;
  align-items: center;
  gap: 16px;
  /* Matches the shipped rows: 16px 0 padding, no divider of its own. */
  padding: 16px 0;
  color: var(--dsw-alias-label-primary);
}
.cy-settings-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cy-settings-title {
  font-size: 14px;
  line-height: 22px;
}
.cy-settings-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-caption);
}
.cy-segmented {
  display: inline-flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover);
}
.cy-segment {
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  padding: 4px 12px;
  border: 0;
  border-radius: calc(var(--dsw-radius-sm) - 2px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.cy-segment:hover {
  color: var(--dsw-alias-label-primary);
}
.cy-segment[aria-pressed="true"] {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-shadow-lv1);
}

/* ---------- 设置里的「主题快捷键」一行 ----------
   这一行在主题关掉时也要能看：--cy-* 只有在 html[data-cyrene="on"] 下才存在，
   所以颜色一律带 --dsw-* 兜底。 */
.cy-shortcut {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}
.cy-shortcut-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 92px;
  padding: 5px 10px;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}
.cy-shortcut-btn:hover {
  border-color: var(--cy-accent, var(--dsw-alias-brand-primary));
}
.cy-shortcut-btn[aria-pressed="true"] {
  color: var(--cy-accent-deep, var(--dsw-alias-brand-primary));
  border-color: var(--cy-accent, var(--dsw-alias-brand-primary));
  background: var(--cy-accent-soft, var(--dsw-alias-interactive-bg-hover));
  animation: cy-shortcut-wait 1.6s ease-in-out infinite;
}
.cy-kbd {
  font: inherit;
  font-size: 12px;
  padding: 0 5px;
  border-radius: 5px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: inherit;
}
.cy-kbd-sep {
  font-size: 12px;
  opacity: 0.55;
}
.cy-shortcut-btn[aria-pressed="true"] .cy-kbd {
  background: transparent;
  padding: 0;
}
.cy-shortcut-reset {
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  padding: 4px 8px;
  color: var(--dsw-alias-label-caption);
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}
.cy-shortcut-reset:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.cy-settings-desc.is-warn {
  color: var(--cy-accent-deep, var(--dsw-alias-brand-primary));
}
@keyframes cy-shortcut-wait {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.62; }
}
@media (prefers-reduced-motion: reduce) {
  .cy-shortcut-btn[aria-pressed="true"] { animation: none; }
}

/* ---------- 氛围层（可关闭） ---------- */
#cy-theme-ambient {
  position: fixed;
  /* 盖满整窗：标题栏那条和侧栏是同一块连续表面，割开就会在 40px 处露出一道分界。
     右上角那团冷光改到内容区里（84% 26%），使按钮所在的那一小块保持纯色——
     原生按钮取的是平的侧栏色，那里一被染色就会冒边。 */
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: calc(var(--cy-intensity, 0.8) * 0.6);
  background:
    radial-gradient(46% 38% at 6% 2%, var(--cy-glow-a), transparent 72%),
    radial-gradient(34% 28% at 84% 26%, var(--cy-glow-b), transparent 72%),
    radial-gradient(64% 44% at 52% 106%, var(--cy-glow-c), transparent 76%);
  transition: opacity 220ms ease;
  will-change: opacity;
}
/* ---------- 空状态：标题、鲸鱼、工作区与模式 ----------
   宿主的空状态（还没有对话时那屏）用 --dsw-alias-label-primary 画标题、鲸鱼图标、
   工作区 chip、模式/模型选择——那是正文墨色，铺在这个主题里看起来像"忘了上色"。
   这些从「轻」档起就上色：它们就是那一屏的全部内容，不跟着走等于这一屏没美化。
   只有输入框那块（_seat）仍然只在「全」档跟，免得「轻」档把正文也一起染了。

   选择器只能落在 class 上：宿主给 CSS Modules 的类名加了哈希前缀
   （an3WzG_composerHero、WOwLGG_headline），但局部名保留，所以用 [class*=…]
   匹配局部名，换宿主版本还能命中；万一哪天改名了，最坏结果是这几处不变色，不会破版。 */
html[data-cyrene="on"] [class*="_composerHero"] [class*="_headline"],
html[data-cyrene="on"] [class*="_composerHero"] [class*="_fish"],
html[data-cyrene="on"] [class*="_composerHero"] [class*="_heroWorkspaceRow"] * {
  color: var(--cy-accent-deep);
}

html[data-cyrene="on"][data-cyrene-level="full"] [class*="_composerHero"] [class*="_seat"] {
  color: var(--cy-accent-deep);
}

/* ---------- 思考中：一个音符 ----------
   宿主那行状态前面是个 14px 的鲸鱼，尾巴靠一张 APNG 蒙版在动。这里把它换成 ♪：
   图标位藏掉，在 _runningContent 上挂一个伪元素——它本来就是 inline-flex 的一项，
   所以自动跟文字同一行，也不用往 React 树里插任何东西。
   字号跟着状态行走（1.15em），颜色吃 --cy-brand，和右边那行字同色。 */
html[data-cyrene="on"][data-cyrene-level="full"][data-cyrene-runicon="note"] [class*="_runningIcon"] {
  display: none;
}

html[data-cyrene="on"][data-cyrene-level="full"][data-cyrene-runicon="note"] [class*="_runningContent"]::before {
  content: "\266A";
  display: inline-block;
  font-family: "Segoe UI Symbol", "Segoe UI", system-ui, sans-serif;
  font-size: 1.15em;
  line-height: 1;
  color: var(--cy-brand);
  transform-origin: 50% 85%;
  /* 两条轨道：一条管几何，一条管光。两者碰的不是同一个属性（transform / text-shadow），
     所以能同时挂在同一个伪元素上；周期 2.2 和 3.7 不成整数比，看不出循环点。 */
  animation: cy-note-sway 2.2s ease-in-out infinite,
             cy-note-glow 3.7s ease-in-out infinite;
}

/* 那句话和「用时」分两行：宿主把整句塞进一个文本节点（外加一份给扫光用的属性副本），
   没有元素能插 <br>，所以换行符写在字符串里，这里让它真的换行。 */
html[data-cyrene="on"][data-cyrene-level="full"][data-cyrene-runicon="note"] [data-chat-running] {
  white-space: pre-line;
}

/* 音符对齐第一行（那句话），不是整块的中线——两行文字时只有基线对齐才不飘。 */
html[data-cyrene="on"][data-cyrene-level="full"][data-cyrene-runicon="note"] [class*="_runningContent"] {
  align-items: baseline;
}

/* 轻轻晃，不是转圈：就是鲸鱼摇尾巴那个幅度。 */
@keyframes cy-note-sway {
  0%, 100% { transform: rotate(-7deg); }
  50% { transform: rotate(7deg); }
}

/* 慢慢地亮一下——比摇摆慢一截，所以每次亮起来都落在摆动的不同位置。 */
@keyframes cy-note-glow {
  0%, 100% { text-shadow: 0 0 0 transparent; }
  45% { text-shadow: 0 0 6px currentColor; }
}

@media (prefers-reduced-motion: reduce) {
  html[data-cyrene="on"][data-cyrene-runicon="note"] [class*="_runningContent"]::before {
    animation: none;
  }
}

/* ---------- 思考中：矢量签名（备用） ----------
   RUNNING_ICON 改成 'signature' 才启用；下面这些规则没有 .cy-sign 元素时全是空转，
   只有「藏图标」和「改成纵向排」这两条得挂到 data-cyrene-runicon 上，否则会误伤 ♪。

   为什么不是一张图在动：签名要的是"被写出来"。每条笔画是独立的 <path>，
   用 stroke-dashoffset 从 1 走到 0 露出来——注意描边虚线在每条子路径上都会
   重新开始，所以一条大 path 装下所有子路径是画不出来的，必须一画一条。
   每条的长度归一到 pathLength="1"，--d / --t 由构建脚本按弧长分配，
   于是整组看起来就是一支匀速走笔的手（缓动只能是 linear，否则每段交接处会一顿）。

   走完之后进入待机：心形轻跳、整组缓慢呼吸。 */
html[data-cyrene="on"][data-cyrene-runicon="signature"] [class*="_runningContent"]:has(> .cy-sign) [class*="_runningIcon"] {
  display: none;
}

/* 换成纵向排：签名单独占一行，状态文字落到下面一行。 */
html[data-cyrene="on"][data-cyrene-runicon="signature"] [class*="_runningContent"] {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

html[data-cyrene="on"][data-cyrene-runicon="signature"] .cy-sign {
  display: block;
  width: var(--cy-sign-w, 86px);
  height: var(--cy-sign-h, 40px);
  overflow: visible;
  color: var(--cy-brand);
  opacity: 0;
  animation: cy-sign-appear 0.35s ease-out 0.05s forwards;
}

/* 描边图：每一笔一条 path，--d 是起笔时刻，--t 是这一笔走多久。 */
.cy-sign-s {
  stroke-dasharray: 1 1;
  stroke-dashoffset: 1;
  animation: cy-sign-draw var(--t, 0.4s) linear var(--d, 0s) forwards;
}

/* 实心印章，两枚都排在笔画之后：箭头先到，小心形最后落款。
   这两个延迟跟笔画表是绑死的（笔画总长 2.2s），改 DRAW_SECONDS 要一起改。 */
.cy-sign-arrow {
  transform-box: fill-box;
  transform-origin: 0% 50%;
  opacity: 0;
  animation: cy-sign-arrow 0.4s cubic-bezier(0.2, 0.9, 0.3, 1) 2.2s forwards;
}

.cy-sign-heart {
  transform-box: fill-box;
  transform-origin: 50% 60%;
  opacity: 0;
  animation: cy-sign-heart 0.55s cubic-bezier(0.2, 1.5, 0.4, 1) 2.5s forwards,
             cy-sign-beat 2.8s ease-in-out 3.2s infinite;
}

.cy-sign-g {
  animation: cy-sign-breathe 4.4s ease-in-out 3.1s infinite;
}

@keyframes cy-sign-appear {
  to { opacity: 1; }
}

@keyframes cy-sign-draw {
  to { stroke-dashoffset: 0; }
}

@keyframes cy-sign-heart {
  0% { opacity: 0; transform: scale(0.2); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes cy-sign-beat {
  0%, 100% { transform: scale(1); }
  10% { transform: scale(1.18); }
  22% { transform: scale(1); }
  34% { transform: scale(1.1); }
  46% { transform: scale(1); }
}

@keyframes cy-sign-arrow {
  from { opacity: 0; transform: scale(0.82); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes cy-sign-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.76; }
}

/* 和宿主自己的鲸鱼一样：系统要求减少动效时直接给静止画面。 */
@media (prefers-reduced-motion: reduce) {
  .cy-sign,
  .cy-sign-g,
  .cy-sign-heart,
  .cy-sign-arrow {
    animation: none;
    opacity: 1;
    transform: none;
  }

  .cy-sign-s {
    animation: none;
    stroke-dashoffset: 0;
  }
}

/* ---------- 对话背景（线稿水印） ----------
   画在 [data-conversation-content] 上：它是消息区的常驻容器，不是滚动容器，
   所以水印钉在底部、消息从上面滚过去；挂到滚动容器上会跟着一起滚走。
   图是描出来的 SVG，轮廓是拟合的三次贝塞尔（不是沿格子走出来的折线，那样会有锯齿），
   viewBox 就是源图的像素网格，所以任何缩放都清晰；
   两张分别是浅底和深底的调色结果——矢量图也没法跟着 --cy-* 变量换色。
   四边渐隐做在图里的 SVG 蒙版上，形状本身不带矩形边。
   下缘默认让出 160px：输入框那块是 sticky 的、底下还垫了一层渐隐，
   贴着底放会被整块吃掉。--cy-chat-art-y 由面板的滑杆驱动。

   横向对齐有两种，默认居中：
     center —— 水平居中，窗口怎么变都在正中
     right  —— 贴右边，留 18px 出界，窗口越宽越靠右（0.11 及以前就是这个）
   竖向下缘始终由 --cy-chat-art-y 决定，两种模式共用。 */
html[data-cyrene="on"][data-cyrene-level="full"] [data-conversation-content] {
  background-image: var(--cy-chat-art);
  background-repeat: no-repeat;
  background-position: center bottom var(--cy-chat-art-y, 160px);
  background-size: min(72%, 1040px) auto;
}

html[data-cyrene="on"][data-cyrene-level="full"][data-cyrene-anchor="right"] [data-conversation-content] {
  background-position: right -18px bottom var(--cy-chat-art-y, 160px);
}


html[data-cyrene="on"][data-cyrene-chatbg="off"] [data-conversation-content] {
  background-image: none !important;
}

/* ---------- 开屏动画 ----------
   所有关键帧都按百分比走，时长只由 --cy-splash-dur 决定（1–5 秒），
   所以整套节奏随设定等比伸缩。 */
/* CYRENE:SPLASH:BEGIN */
#cy-theme-splash {
  position: fixed;
  inset: 0;
  z-index: 2147483600;
  /* 居中交给 .cy-splash-stage，这一层只负责底色和整体淡出 */
  overflow: hidden;
  cursor: pointer;
  /* 两个可调项：角色高度由面板滑杆写进 --cy-splash-size，
     极光/光晕的峰值也按底色分档，避免白底被极光染成同一个粉。 */
  --cy-splash-size: 460px;
  --cy-aurora-peak: 0.5;
  --cy-halo-peak: 0.95;
  background: radial-gradient(120% 92% at 50% 30%, #ffffff 0%, #fff0f7 34%, #ffdcec 68%, #ffc3dd 100%);
  animation: cy-splash-veil var(--cy-splash-dur, 2.5s) ease both;
  will-change: opacity;
}

/* 纯白底：中性白纸感，再把极光压到几乎只剩一层雾 */
#cy-theme-splash[data-tone="white"] {
  --cy-aurora-peak: 0.14;
  --cy-halo-peak: 0.3;
  background: radial-gradient(120% 92% at 50% 26%, #ffffff 0%, #ffffff 52%, #f6f2f5 100%);
}

@keyframes cy-splash-veil {
  0% { opacity: 0 }
  7% { opacity: 1 }
  100% { opacity: 1 }
}

/* ---------- 深色模式 ----------
   外壳把 data-ds-dark-theme 挂在 body 上，开屏又是 body 的直接子节点，所以
   这些规则跟着属性走：不用 JS 判断，中途切深浅也会实时跟上。
   角色图的线稿是挖空的（见 build-splash-vector.py），所以深色下不需要混合模式
   去处理白色：挖空处透出多暗的底，线条就是多暗的色。
   底色走“几乎全黑 + 一点紫”，极光换一组暗版色相——浅底那套粉蓝薄荷是为白背景
   调的，直接压在黑上会浮成一片奶白，那样就永远黑不下去。 */
body[data-ds-dark-theme] #cy-theme-splash {
  --cy-aurora-peak: 0.55;
  --cy-halo-peak: 0.62;
  background: radial-gradient(120% 92% at 50% 30%, #20101b 0%, #150b13 34%, #0c060e 68%, #050308 100%);
}

body[data-ds-dark-theme] #cy-theme-splash[data-tone="white"] {
  --cy-aurora-peak: 0.48;
  --cy-halo-peak: 0.42;
  background: radial-gradient(120% 92% at 50% 26%, #16131c 0%, #0e0c14 52%, #040307 100%);
}

/* 极光不是调淡，是换一套深色：色相还是粉 / 紫 / 蓝 / 薄荷这一组，
   只是明度压到能在暗底上当“环境光”的程度。该转照样转、该铺满照样铺满——
   峰值跟浅色档差不多给足，但它自己就是暗的，所以整屏依然黑得下去。 */
body[data-ds-dark-theme] #cy-theme-splash .cy-splash-aurora {
  background: conic-gradient(
    from 210deg,
    #6d2457 0%,
    #3a3082 20%,
    #243c72 40%,
    #205344 60%,
    #4e2680 80%,
    #6d2457 100%
  );
  filter: blur(104px) saturate(118%);
}

/* 白底那档再收一点：同一组色相，红分量少一些，看着更像“冷光” */
body[data-ds-dark-theme] #cy-theme-splash[data-tone="white"] .cy-splash-aurora {
  background: conic-gradient(
    from 210deg,
    #5c2050 0%,
    #332a70 20%,
    #20325f 40%,
    #1d463c 60%,
    #3f2166 80%,
    #5c2050 100%
  );
}

/* 光斑换成粉的：白心在暗底上会变成一块发灰的圆 */
body[data-ds-dark-theme] #cy-theme-splash .cy-splash-halo {
  background: radial-gradient(
    circle,
    rgba(255, 138, 198, 0.26),
    rgba(132, 56, 114, 0.11) 44%,
    transparent 70%
  );
}

body[data-ds-dark-theme] #cy-theme-splash .cy-splash-figure {
  mix-blend-mode: normal;
  filter: drop-shadow(0 12px 40px rgba(226, 110, 170, 0.3));
}

/* 那道白掠光在亮底上是“角色被照亮”，在暗底上就只是一道横着划过的白光，
   和整屏的暗调打架——深色下直接不放。 */
body[data-ds-dark-theme] #cy-theme-splash .cy-splash-sweep {
  display: none;
}

body[data-ds-dark-theme] #cy-theme-splash .cy-splash-caption {
  color: #f5d5e7;
  text-shadow: 0 1px 18px rgba(255, 150, 205, 0.35);
}

body[data-ds-dark-theme] #cy-theme-splash .cy-splash-ripple {
  background: radial-gradient(
    circle,
    rgba(255, 238, 247, 0.34) 0%,
    rgba(255, 206, 234, 0.22) 44%,
    rgba(255, 172, 214, 0.2) 54%,
    rgba(255, 190, 224, 0.5) 58%,
    rgba(255, 190, 224, 0.12) 64%,
    transparent 73%
  );
}

/* 流转的极光：一张旋转的锥形渐变，糊开当背景。
   浅底上只留很淡的一层，负责“颜色在流动”，不抢角色。 */
.cy-splash-aurora {
  position: absolute;
  width: 150vmax;
  height: 150vmax;
  border-radius: 50%;
  background: conic-gradient(
    from 210deg,
    #ffc6de 0%,
    #e2c9ff 20%,
    #c9dcff 40%,
    #cfefe1 60%,
    #edc9ff 80%,
    #ffc6de 100%
  );
  filter: blur(90px) saturate(104%);
  animation: cy-splash-aurora var(--cy-splash-dur, 2.5s) ease both;
  will-change: transform, opacity;
}

@keyframes cy-splash-aurora {
  0% { opacity: 0; transform: rotate(-14deg) scale(0.94) }
  30% { opacity: var(--cy-aurora-peak) }
  80% { opacity: calc(var(--cy-aurora-peak) * 0.86); transform: rotate(34deg) scale(1.02) }
  100% { opacity: calc(var(--cy-aurora-peak) * 0.7); transform: rotate(58deg) scale(1.06) }
}

.cy-splash-halo {
  position: absolute;
  width: 62vmin;
  height: 62vmin;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.95),
    rgba(255, 178, 214, 0.34) 44%,
    transparent 70%
  );
  animation: cy-splash-halo var(--cy-splash-dur, 2.5s) ease both;
}

@keyframes cy-splash-halo {
  0% { opacity: 0; transform: scale(0.72) }
  30% { opacity: var(--cy-halo-peak) ; transform: scale(1) }
  100% { opacity: 0; transform: scale(1.18) }
}

.cy-splash-figure {
  position: relative;
  /* 内联图 1160×868；高度由面板滑杆决定（--cy-splash-size），
     默认 460，等于总是把图缩小，边缘更利落。 */
  height: min(56vh, var(--cy-splash-size, 300px));
  /* 白底 + 正片叠底 = 白的地方直接透出背景，颜色像水彩印上去，
     整张图立刻“通透”，也不需要在素材里抠掉白色。 */
  mix-blend-mode: multiply;
  animation: cy-splash-rise var(--cy-splash-dur, 2.5s) cubic-bezier(0.18, 0.72, 0.22, 1) both;
  filter: drop-shadow(0 18px 46px rgba(208, 118, 168, 0.16));
}

.cy-splash-art {
  height: 100%;
  width: auto;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  /* 原图在腰部被裁断，硬边会露出直线；让下缘化进背景。 */
  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 55%, rgba(0, 0, 0, 0.6) 75%, transparent 96%);
  mask-image: linear-gradient(180deg, #000 0%, #000 55%, rgba(0, 0, 0, 0.6) 75%, transparent 96%);
}

/* 线稿动态绘制：先画线，再填充 */
.cy-splash-line {
  stroke-dasharray: 1 1;
  stroke-dashoffset: 1;
  animation: cy-splash-draw 1.2s ease-out 0.1s forwards;
}

.cy-splash-fill {
  opacity: 0;
  animation: cy-splash-fillin 0.6s ease-out 1.0s forwards;
}

@keyframes cy-splash-draw {
  to { stroke-dashoffset: 0; }
}

@keyframes cy-splash-fillin {
  to { opacity: 1; }
}

@keyframes cy-splash-rise {
  0% { opacity: 0; transform: translateY(26px) scale(1.05) }
  26% { opacity: 1; transform: translateY(0) scale(1) }
  100% { opacity: 1; transform: translateY(0) scale(1) }
}

/* 接管宿主注入的开屏封面时用：画面已经是“静止的最终态”，
   只保留结尾淡出，避免角色先闪没再升起来。 */
#cy-theme-splash[data-instant] {
  animation: none;
}

#cy-theme-splash[data-instant] .cy-splash-figure {
  animation: cy-splash-settle var(--cy-splash-dur, 2.5s) ease both;
}

@keyframes cy-splash-settle {
  0%, 100% { opacity: 1; transform: none }
}

/* 一道掠过画面的高光：只提亮角色本身，白底不受影响 */
.cy-splash-sweep {
  position: absolute;
  inset: -12% -40%;
  pointer-events: none;
  mix-blend-mode: overlay;
  background: linear-gradient(
    104deg,
    transparent 38%,
    rgba(255, 255, 255, 0.35) 46%,
    rgba(255, 255, 255, 0.8) 50%,
    rgba(255, 255, 255, 0.35) 54%,
    transparent 62%
  );
  animation: cy-splash-sweep var(--cy-splash-dur, 2.5s) ease-in-out both;
}

@keyframes cy-splash-sweep {
  0%, 26% { transform: translateX(-72%); opacity: 0 }
  34% { opacity: 1 }
  74% { opacity: 1 }
  92% { transform: translateX(72%); opacity: 0 }
  100% { transform: translateX(72%); opacity: 0 }
}

/* 舞台：所有可见内容都装在这一层里，退场时整体缩放，
   内部元素之间不存在任何相对位移，也就没有“跳一下”的可能。 */
.cy-splash-stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  transform-origin: 50% 50%;
  will-change: transform;
}

.cy-splash-caption {
  position: absolute;
  bottom: 11vh;
  font: 500 13px/1 "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  letter-spacing: 0.42em;
  color: #8a5a76;
  animation: cy-splash-caption var(--cy-splash-dur, 2.5s) ease both;
}

@keyframes cy-splash-caption {
  0% { opacity: 0; transform: translateY(8px) }
  34% { opacity: 0.85; transform: translateY(0) }
  100% { opacity: 0.85 }
}

/* ---------- 跳过时的涟漪 ----------
   点画面跳过：以点击处为圆心；按 Esc / Enter / 空格跳过：从屏幕正中起。
   圈是用径向渐变画的，不是 border —— border 会跟着 scale 一起变粗，
   渐变按比例缩放，扩成多大都正好是一圈。
   时长比退场（560ms）略短，整层淡出结束时它刚好扩完。 */
.cy-splash-ripple {
  position: absolute;
  left: var(--cy-ripple-x, 50%);
  top: var(--cy-ripple-y, 50%);
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 3;
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.4) 0%,
    rgba(255, 226, 241, 0.28) 44%,
    rgba(210, 104, 158, 0.24) 54%,
    rgba(210, 104, 158, 0.5) 58%,
    rgba(210, 104, 158, 0.14) 64%,
    transparent 73%
  );
  animation: cy-splash-ripple 520ms cubic-bezier(0.16, 0.82, 0.28, 1) forwards;
  will-change: transform, opacity;
}

@keyframes cy-splash-ripple {
  0% { transform: scale(0.18); opacity: 0 }
  10% { opacity: 1 }
  100% { transform: scale(20); opacity: 0 }
}

/* ---------- 还在加载：循环，而不是结束 ----------
   外壳没撤掉自己的 boot 画面（[data-dsh-boot]）时，开屏不结束，
   改成极光持续转、角色呼吸、高光反复掠过；加载好就淡出。 */
#cy-theme-splash[data-waiting] {
  animation: none;
}

#cy-theme-splash[data-waiting] .cy-splash-aurora {
  animation: cy-splash-aurora-loop 9s linear infinite;
}

#cy-theme-splash[data-waiting] .cy-splash-halo {
  display: none;
}

#cy-theme-splash[data-waiting] .cy-splash-figure {
  animation: cy-splash-breathe 3.4s ease-in-out infinite;
}

#cy-theme-splash[data-waiting] .cy-splash-sweep {
  animation: cy-splash-sweep-loop 3.4s ease-in-out infinite;
}

#cy-theme-splash[data-waiting] .cy-splash-caption {
  animation: none;
  opacity: 0.85;
}

@keyframes cy-splash-aurora-loop {
  0% { transform: rotate(0deg) scale(1.02); opacity: calc(var(--cy-aurora-peak) * 0.7) }
  50% { opacity: var(--cy-aurora-peak) }
  100% { transform: rotate(360deg) scale(1.02); opacity: calc(var(--cy-aurora-peak) * 0.7) }
}

@keyframes cy-splash-breathe {
  0%, 100% { transform: translateY(0) scale(1) }
  50% { transform: translateY(-3px) scale(1.004) }
}

@keyframes cy-splash-sweep-loop {
  0% { transform: translateX(-72%); opacity: 0 }
  18% { opacity: 1 }
  72% { opacity: 1 }
  100% { transform: translateX(72%); opacity: 0 }
}

/* ---------- 退场：整个舞台一起缩、一起淡 ----------
   放在最后，才能压过上面的 [data-waiting] 规则（同特异性，后者生效）。
   内部元素之间不再有任何相对运动：缩放与淡出都作用在 .cy-splash-stage 上，
   角色只额外做“虚化 + 提亮”，不碰 transform。
   这样无论走入场路径还是封面接管路径，都不可能再出现“跳一下”。 */
#cy-theme-splash[data-leaving] {
  animation: cy-splash-out 560ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  pointer-events: none;
}

#cy-theme-splash[data-leaving] .cy-splash-stage {
  animation: cy-splash-out-stage 560ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
}

#cy-theme-splash[data-leaving] .cy-splash-figure {
  animation: cy-splash-out-figure 420ms cubic-bezier(0.3, 0, 0.4, 1) forwards;
}

/* 底色淡出 */
@keyframes cy-splash-out {
  0% { opacity: 1 }
  100% { opacity: 0 }
}

/* 舞台整体后退：只有缩放，没有位移 */
@keyframes cy-splash-out-stage {
  0% { transform: scale(1) }
  100% { transform: scale(0.955) }
}

/* 角色被光吃掉：filter 不叠加，drop-shadow 必须写进关键帧。
   注意这里没有 transform —— 位移由舞台统一负责。 */
@keyframes cy-splash-out-figure {
  0% {
    filter: drop-shadow(0 18px 46px rgba(208, 118, 168, 0.16)) blur(0px) brightness(1);
  }
  55% {
    filter: drop-shadow(0 14px 38px rgba(208, 118, 168, 0.12)) blur(2px) brightness(1.04);
  }
  100% {
    filter: drop-shadow(0 8px 26px rgba(208, 118, 168, 0.06)) blur(6px) brightness(1.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  #cy-theme-splash { animation-duration: 0.3s }
  .cy-splash-aurora,
  .cy-splash-halo,
  .cy-splash-figure,
  .cy-splash-sweep,
  .cy-splash-caption {
    animation: none;
  }
  /* 系统要求减少动效时不留涟漪：它本身就是一段纯动画。 */
  .cy-splash-ripple { display: none }
}
/* CYRENE:SPLASH:END */

/* ============ 美术微调 ============ */

/* 1. 立绘呼吸感：8 秒一个周期，极缓的缩放 */
@keyframes cy-chat-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}
html[data-cyrene="on"][data-cyrene-level="full"] [data-conversation-content] {
  animation: cy-chat-breathe 8s ease-in-out infinite;
}

/* 2. 深色下立绘环境光：极淡的粉紫光晕垫在立绘后面 */
html[data-cyrene="on"] body[data-ds-dark-theme] [data-conversation-content]::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse 60% 50% at 50% 80%, rgba(232, 82, 157, 0.04), transparent 70%);
  z-index: -1;
}

/* 3. 输入框聚焦脉冲 */
@keyframes cy-composer-pulse {
  0% { box-shadow: 0 0 0 0 rgba(232, 82, 157, 0.25); }
  100% { box-shadow: 0 0 0 12px rgba(232, 82, 157, 0); }
}
html[data-cyrene="on"] [data-composer]:focus-within {
  animation: cy-composer-pulse 0.6s ease-out;
}

/* 4. 消息气泡入场滑入 */
@keyframes cy-msg-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
html[data-cyrene="on"] [data-conversation-content] > * {
  animation: cy-msg-enter 0.2s ease-out;
}

/* 5. 侧栏 hover 色块滑入 */
html[data-cyrene="on"] [class*="_sidebar"] [class*="_item"] {
  position: relative;
  overflow: hidden;
}
html[data-cyrene="on"] [class*="_sidebar"] [class*="_item"]::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 100%;
  background: var(--cy-hover);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.2s ease;
  z-index: -1;
}
html[data-cyrene="on"] [class*="_sidebar"] [class*="_item"]:hover::before {
  transform: scaleX(1);
}
/* CYRENE:CSS:END */`

    // 角色抠图：720px 宽、带 alpha 的 WebP。客户端模块没有静态资源路由，
    // 所以内联成 data URI；`node tools/inject-art.mjs` 负责填这一行。
    const SPLASH_ART = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDQ4IiBoZWlnaHQ9IjEwODMiIHZpZXdCb3g9IjAgMCAxNDQ4IDEwODMiPgogIDxkZWZzPgogICAgPG1hc2sgaWQ9ImN1dCIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeD0iMCIgeT0iMCIgd2lkdGg9IjE0NDgiIGhlaWdodD0iMTA4MyI+CiAgICAgIDxwYXRoIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0ibm9uemVybyIgZD0iTTU2OCAzOC44YzEuMyAuOSA0LjMtLjcgNi0uOCA0LjctLjMgOS42LS41IDEzLjcgMi4zIDMuMiAyLjMgNS40IDQuMiA3LjQgNy42IDEuMSAxLjggMS4zIDQuNiAzIDYgNy4yIDYuMSAxNi45IDEwLjMgMjQuOCAxNS43IDYuNyA0LjQgMTQuOCA5LjkgMjAuNiAxNS40IDQgMy45IDguNiA5LjMgMTMuNSAxMiAzLjggMS4zIDEuMS02LjcgMS04LjUtLjItNi40LS4zLTEyLjcgMC0xOSAuMS0zLjEgLjktNi44IDQuNi03LjQgNS45LS45IDExLjEgNS4zIDE0LjEgOS43IDcuNSAxMSAxOS4xIDIxLjcgMjEuNCAzNS41IDEuNSAzIDQuNi00LjYgNS45LTUuOCA0LjQtNCA5LjYtOC45IDE1LjctNC43IDQgMi44IDIuNiA4LjkgMy42IDEyLjkgMi4yIDguMyA1LjcgMTYuMyA0LjYgMjUuMi0uNSA0LjEtMi4zIDcuNy0zLjEgMTEuNyAuMSAxLjggMi42IDEuNSAzLjkgMi4yczIuNSAyLjUgMy4yIDQuM2MyLjUgNi44IDYuMSAxMy43IDcuOCAyMC43IC44IDMuNC0uNSA2LjkgMCAxMC4yIC44IDEuMSAxLjUgMS43IDIuNyAuOCAxLjMtMiAyLTQuOSAzLjgtNi42IDQuMS0zLjcgOC43LS4xIDEwLjUgMy42IDIuOCA1LjQgNS41IDExLjEgNyAxNyAuOCAzLjMgLjcgNyAxLjggMTAuMiAyLjggMi4zIDYuOSAuNSAxMC4xIC4xczUuNyAuMyA4LjMtLjdjMy43LTEuMyA2LjktNS41IDEwLjEtNy43IC45LTEuNy0yLjYtMy44LTMuOC00LjktNS4yLTQuOS0xMS40LTguNS0xNS45LTE0LjEtMTEuMy0xNC41LTIxLjUtMjguNy0yNi44LTQ2LjctNC45LTE2LjYtNy4zLTM3LjEtMy4yLTU0LjIgMS4zLTUuMiAyLjQtMTguNSAxMC44LTE1LjQgNC4zIDEuNSA0LjkgNy44IDYuNyAxMS4zIDUgMTAuMiAxMC41IDIwIDE3LjUgMjkgMTUuNCAxOS42IDM3LjcgMjguOCA1Ni43IDQzLjggNS4xIDQuMSAxMC4zIDguOSAxNC44IDEzLjcgMi45IDMuMiA1LjMgOCA5LjEgMTAuMyAzLjUgLjUgNy43LTIgMTEuMS0zIDUuNi0xLjYgMTIuMS0yLjEgMTcuOS0xLjQgOC43IDEuMSA0LjggOS4xIDkgMTMuNSAyLjYgMi43IDkgMy43IDEyLjMgNS43IDUuMyAzLjIgNy42IDguMiAxMC42IDEzLjMgMS41IDEuNiA0LjMtMS4xIDYtMS44IDMtMS4zIDYuMy0uNSA4LjkgMS41IDYuNyA1LjQgMTAuNiAxNC43IDE2LjggMjAuNyAyLjkgMi42IDYuNSA0LjUgOS4zIDcuMiA5LjYgOS40IDE5LjIgMTkgMjkgMjggMy42IDMuNCA1LjkgOCA5LjQgMTEuNiAxNS4zIDE1LjUgMjYuMyAzNC41IDM2IDU0IDcgMTMuOSAxMi44IDMyLjQgOS4xIDQ4LS45IDQuMS0uOSA4LjItMy4xIDExLjktMS42IDIuOS00LjIgNC40LTYuNCA2LjYtLjMgMi43IDMuMyA1LjYgNC43IDcuNyA0LjIgNS45IDguMiAxMiAxMS43IDE4LjMgMTIuNSAyMiAxOC45IDQ4IDE0LjggNzMuMi0xLjIgNy43LTUuOCAyMy4yLTE0LjIgMjYtMS44LS4yLTEuOC0xLjctMS42LTMuMyAuNi00LjEgMi4yLTguMSAyLjctMTIuMyAxLjMtMTEuMSAuOS0yMy4yLTIuOC0zNC0xLjQtMi45LTMuNyA3LjEtNC4xIDguNi0uNyAyLjYtMi4yIDUuMS0yLjggNy43LTEuMSA1LjYtLjIgMTIuMS0uMiAxNy44IDAgMTkuMy05IDM5LjQtMjAuNyA1NC4zLTQuMiA1LjQtMTEuNCAxNC43LTE4LjcgMTUuNC00LjQtMS40LTEuOS03LjYtMS4xLTEwLjcgMi42LTEwLjUgNC40LTIzLjkgMi4yLTM0LjctMS44LTIuMi00LjcgLjQtNi44IDEuMS02IDIuMi0xMi41IDMuNy0xOC43IDUuMy0yLjIgLjUtNS40IDAtNi44IDIuMi0xLjggMy4yLTEuMiA3LjEtMS41IDEwLjUtLjcgMTAuNCAxIDE5LjIgMy4zIDI5LjQgNS40IDIzLjUgMjUuOSA0NS44IDQ3LjEgNTYuNCA4LjYgNC4zIDE4LjMgNC41IDI3LjIgNy4zIDMuMiAyLjktMS40IDUuNS0zLjggNi43LTYuOCAzLjUtMTQuMSAyLjctMjEuMyA0LjEtMi40IDEuOCA1LjEgNC45IDYuNiA1LjcgNS45IDMuMSAxMS45IDYuOCAxOC4zIDguNyAyLjcgLjcgNS45IC40IDggMi41IDEuNiAzLjktMS41IDUuMS00LjggNS44LTYuMiAxLjQtMTMuNSAyLjgtMTkuOCAxLjMtMTUuNi0zLjYtMjkuMy03LjEtNDMuNC0xNS4xLTUuMS0yLjgtMTAuNy02LjUtMTUuMS0xMC40LTIuNy0yLjQtNS43LTUuNy04LjktNy4zLTEuNSAuMSAxIDQuOCAxLjUgNS43IDIuOSA2LjIgNS43IDEyIDkgMTggMTEuOCAyMi40IDI1LjEgNDcuMSA0MyA2NSA1IDUgOS4yIDEwLjcgMTQuNCAxNS42IDExLjcgMTAuOCAyNi44IDIxLjYgNDIuMSAyNi45IDQxLjUgMTQuMiA4Ny43LTEuNyAxMjQuNC0yMi41IDE2LTkgMzEuMS0xOS41IDQ0LjUtMzIgMTYuNS0xNS4zIDMyLjQtMzIgMzguNS01NC41IDEyLjctNDctMjguNS0xMDMuNy03OC4yLTEwMS42LTEwLjkgLjQtMjEuNyAyLjctMzEuOCA3LjEtMi41IDEuMS01LjEgMS41LTcuNCAzLjEtNyA0LjktMTMuMyAxMi43LTIxLjEgMTYuMi0zLjMtLjItNS4xLTQuNy01LjItNy41LS4xLTcuMSAzLjctMTQuMSA2LjgtMjAuMiA5LjEtMTguMyAyOS42LTI5LjkgNDguNS0zNS41IDYuNy0xLjkgMTMuMy0yLjMgMjAuMi0yLjNzMTMuMi0uMyAxOS43IDEuM2MyOC40IDcuMSA0OC41IDI4LjYgNjEuOCA1My43IDcuOCAxNC42IDEwLjQgMzAuNyAxMy4yIDQ2LjggOC40IDQ4LjUtMTEuOSAxMDEuNi00NiAxMzYuNC05LjYgOS44LTE4LjMgMjAuNy0yOS4yIDI5LjMtOS4zIDcuMy0xOC42IDE0LjQtMjguMyAyMS4yLTcuNyA1LjMtMTcuMSA4LjctMjQuNiAxNC4yLS40IDEgNS45IDIuNCA3LjIgMi44IDguNiAyLjcgMTcuMyA1LjQgMjUuNyA4LjggMjIuNCA5LjMgNDMuNiAxOS4zIDY0LjcgMzEuMyA1Ny4xIDMyLjIgMTAzLjcgODUgMTMyLjggMTQzLjIgNyAxNCAxMy4yIDI4LjMgMTguNCA0My4xIDEuNCA0IDUuMSAxMS43IDIuNyAxNS41LTIuMyAyLjEtNi4yIDEuNC05LjEgMS40LTYuNSAwLTEzIDAtMTkuNSAwLTI3IDAtNTQgMC04MSAwLTUxLjUgMC0xMDMgMC0xNTQuNSAwLTE2IDAtMzIgMC00OCAwLTYuOCAwLTE1LjYgMS41LTIyLjItLjMtOC41LTIuNS0xNi44LTguNy0yNC4zLTEzLjItMTIuNi03LjQtMjUuNi0xNC4xLTM3LjgtMjIuMi03LjktNS40LTE1LTExLjktMjMtMTcuMy0xLjctLjUgMCAyLjQgLjIgMy4xIDEuNCAzLjggMi4xIDggMy4xIDExLjkgMi4xIDguNiA0IDE3LjEgNS43IDI1LjggLjcgMy40IDIuNSA3LjYgMSAxMC45LTIuNyAyLjctMTAuMSAxLjMtMTMuNyAxLjMtMTIuNSAwLTI1IDAtMzcuNSAwLTUxIDAtMTAyIDAtMTUzIDAtMTQxIDAtMjgyIDAtNDIzIDAtMzkuNSAwLTc5IDAtMTE4LjUgMC0xMSAwLTIyIDAtMzMgMC0zLjYgMC05LjggMS4yLTEzLjEtLjQtMi4yLTEuMi0zLjQtNS43LTQuMS03LjktMi40LTcuNi0zLjgtMTUuMi01LjYtMjIuOS02LjEtMjUuMyAuMy01NS41IDEwLjUtNzkuMSAzLjUtNy45IDYuNS0xNy4yIDExLjctMjQuMSAuMy0uNiAuNS0xLjUtLjYtMS4xLTQuMiAxLjctOC4yIDYuMi0xMi4zIDguNS04LjcgNC45LTE4LjEgOS45LTI2LjMgMTUuN3MtMTguNSA5LjEtMjcuNCAxMy4xYy0xOS4xIDguNC00MC4xIDE2LjktNjAuOCAyMC4yLTcuMSAxLjEtMTMuOCAyLjgtMjEgMy0zLjQgLjEtNS42IDEuMy03LjgtMi4xLS43LTIuOSAyLjEtMy43IDQuMi01IDMuOC0yLjUgOC4xLTUuMSAxMS42LTcuOSAxNi42LTEzLjQgMzYuMy0yMy4xIDUxLjQtMzguNSAxLjMtMi4yLTMtLjEtMy42IC4zLTMuNyAxLjgtNy40IDMuNi0xMSA1LjUtOS4zIDQuNy0xOC42IDkuMi0yOC4xIDEzLjktMjIuNiAxMS40LTQ4IDE5LjYtNzIuNyAyNC44LTUuMyAxLjItMTAuOSAyLjEtMTYuMiAzLjMtNCAxLTguNyAyLjUtMTIuOCAxLjMtMi43LTIuNCA0LjgtNS45IDYuOC02LjggOS4yLTQuNyAxOS45LTkuMiAyOC40LTE1LjEgMTAuMy03LjMgMjIuMS0xMy4yIDMzLTE5LjUgMTIuOC03LjIgMjQuOS0xNi4yIDM2LjYtMjQuOSA0LjEtMyA4LjYtNS4xIDEyLjQtOC41IDEuNS0yLjItNi40LS45LTguMS0uNy05IC42LTE4LjEgMi42LTI3LjEgMi45LTE4LjIgLjYtMzYuOCAyLjktNTQuOSA1LjEtNS44IC43LTExLjcgMS4zLTE3LjUgMi00IC41LTggMS44LTExLjkgLjItMS42LTEuNyAuNC0yLjYgMS45LTMuMiAzLjQtMS4zIDYuOS0yLjIgMTAuNC0zLjEgMTUuNi00LjIgMzEuMi05LjYgNDctMTMgMTEuOC0yLjYgMjMuMy04IDM0LjgtMTEuNyAyNS41LTguMSA1MC0xOC42IDc0LjctMjguOCA4Mi40LTM0LjQgMTU3LjYtODYuOSAyMjctMTQyIDIyLjYtMTcuOSA0NC43LTM1LjggNjUuMi01Ni4zIDYuNi02LjYgMTUuNi0xMy4yIDIwLjgtMjEgLjYtMS45LTEuOC0yLjEtMy4yLTIuNS0zLjQtMS02LjYtMi4zLTkuOS0zLjYtNi4xLTIuMy0xMC42LTguMS0xNi42LTEwLjItMi4zLS45LTYuMyAuMS04LjggLjEtNi42IDAtMTMuMyAuMi0xOS43LTEuMy0yMi44LTUuNS00OC4zLTE2LjgtNjMuMy0zNS43LTQuNy01LjktNi43LTEzLTEwLjgtMTktMS44LS45LTYgMS42LTcuOSAyLjMtNy4zIDIuNi0xNC42IDQuNS0yMi4xIDYuNC0xMS4zIDIuNy0yMy4xIDMtMzQuNiA0LjQtMTYuOSAyLTMzLjggNC40LTUwLjYgNy45LTguNiAxLjktMTcuNCA0LjMtMjUuNyA3LjMtMyAxLTcuNyAyLjctMTAuNCAuMy01LjItNC4zIDQuOS0xMy41IDcuOC0xNi40IDEyLjgtMTIuNyAyOC45LTIzIDQ0LjUtMzIgMjkuNy0xNi45IDYyLjgtMjcuOSA5Ni41LTM0IDE2LjgtMyAzNC4zLTUuOSA1MS40LTcuMSA5LjMtLjcgMTktMS40IDI4LjItMy4zIDEyLjktMi43IDI1LjUtOC41IDM3LjctMTMuMiAxLjMtMS4yLTYuNC04LjMtNy41LTEwLjYtMy41LTcuNS0xLjUtMTIuNyAxLjUtMTkuNy0uNi0zLjQtMTAuOC02LjUtMTMuNy04LjEtMTMuNC03LjEtMzUuNi0yMS40LTI2LjUtMzkuNCAxLjEtMi40IDIuNC00LjMgNC41LTUuOCAxLjEtMS43LTEuOC0zLjEtMi45LTMuOS00LjMtMi43LTguOS00LjgtMTIuNy04LjMtOS04LjMtMjQuOC0xOS4yLTE4LjQtMzQgMS4yLTIuOCAyLjYtNSA0LjUtNy4yIC4yLTEuNy0xLjgtMi41LTIuOC0zLjYtMi45LTIuNi02LjQtNC41LTkuMy03LjItMTAuNC05LjgtMjguNi0yNS41LTE4LjEtNDEuNyAxLjUtMi4zIDMuNC0zLjIgNS42LTQuOCAxLjUtMS44LTEuNy0zLjktMi45LTUuMS00LjItNC4yLTkuMi04LjEtMTIuNS0xMy03LjUtMTAuOS0xNC42LTIzLjgtNi0zNi40IDEuNS0yLjIgNC4zLTIuNiA2LjEtNC40IC44LTIuMS0uMi0zLjgtLjMtNi0uNS01LjgtMS4zLTExLjctMi0xNy41LTEuOS0xNS44IC4xLTMzLjIgMi00OC44IDYuMS01MS41IDMyLjItMTAwLjMgNzguOS0xMjUuMSAxMi41LTYuNiAyNS4yLTExLjkgMzkuNC0xMy4xIDMuNS0uMiA5LjEgMCAxMi4zLTEuMiAyLjQtLjkgNC4zLTQuMSA2LjctNS4zIDYuOS0zLjQgMTMuOS0uOCAxOS43IDIuOSAyLjggLjYgMy41LTIuNCA1LjEtNC4xIDIuOS0yLjkgNi4xLTUuMSAxMC02LjUgMTIuMy00LjMgMjQuOCA0IDMxLjUgMTMuNiAxLjcgMi41IDEuOCA1LjggMy4zIDguNXpNNzA5LjkgMjQ0LjVjMi44IC40IDUuOC0zLjEgOC00LjZzNy41LTQuMSA3LjgtNy0yLjQtNi0zLjUtOC4xYy0zLjQtNi45LTEwLjQtMjItMi40LTI3LjMgLjctMS05LjItMy44LTExLTQuOC02LjItMy0xNC40LTktMTguMi0xNC44LTEuNy0yLjUtMy4zLTYtMi4yLTlzNC0zLjkgNi40LTUuNGMyLjEtMi45LTktMi41LTEwLjItMi42LTUuOC0uNC0xMi40LTIuNS0xNy42LTQuOS00LjItMi0xMi43LTUtMTMuOC0xMC4yLTEuMS01LjggNi4xLTExLjggOS44LTE1LjEgMS4yLTIuMi0yLjQtNC45LTQtNi4yLTUuNS00LjMtMTEuNC04LjctMTYuNS0xMy41LTcuNi03LjMtMTYuNy0xMy43LTI1LjQtMTkuNnMtMTcuOC0xMy44LTI4LjEtMTguNGMtMy42LTEuNi04LjggLjUtMTIuOC0uMi02LjYtMS4yLTkuNS01LjktMTQuNS05LjMtNC4zLS4zLTkuOCAzLjktMTQuMyA0LjQtMTIuNSAxLjUtMjAuOS02LjEtMjguMy0xNC44LTEuNS0uNy0zLjcgMS4yLTUuMSAxLjktMi44IDEuMy02LjggMi4zLTkuOCAxLjhzLTUuOS0yLTguMy0zLjdjLTEuMy0uOC0yLjUtMi44LTQuMi0yLjctMTAuMSAuOC0yMC41IDUuMi0yOS43IDkuMS0zNS4yIDE0LjYtNTggNDUuNy02OC41IDgxLjUtMy43IDEyLjYtNS4xIDI1LjUtNi42IDM4LjQtMS43IDE0LjQtLjQgMjguOCAuMSA0My4xIC4yIDUuNiAuMSAxNC43IDIuOCAxOS43IDEuNCAyLjYgNi4zIDIuNCA4LjkgMy4xIDMuOCAxLjIgNS43IDMuNyA4LjIgNi42IDEuMyAuNSAuMS01LjMgLjEtNi40LS4yLTQuNy0xLTkuMi0xLTE0IDAtMTMuOS0uMy0yNy42IDIuMi00MS4zIDQuNi0yNS4yIDE0LjUtNTAuOCAzMy02OSAxMS0xMC44IDI2LjQtMTcuOSA0MS4xLTIxLjkgMjcuNi03LjQgNTguMy0xLjQgODQgOS45IDQyLjMgMTguNyA3OS45IDQ4LjggMTA4LjQgODUuMSA4LjggMTEuMyAxNi40IDIzLjUgMjUgMzUgMy40IDQuNiA1LjcgMTEuNiAxMC4yIDE1LjJ6TTUzOSA0NjEuMmMzLjMgLjggNy40LTMuNSAxMC4yLTQuOSAxMC40LTUuMyAyMC40LTExLjMgMzAtMTcuOSAxMC45LTcuNiAyMS44LTE1LjMgMzIuOC0yMi43IDMuMy0yLjMgNi4yLTQuOCA5LjEtNy40IDEuNC0xLjEgMy4zLTEuNyA0LjItMy4zIDEuOC0zLjMgLjctOS4xIC43LTEyLjggMC04LjQgMS4yLTE2LjYgMi4xLTI0LjkgMi4xLTIwLjMgMTEtMzkuOSAyMC4yLTU3LjggNi42LTEzLjIgMTcuMi0yNS4yIDI3LjgtMzUuMSAzLjEtMi45IDYuNi01LjQgOS41LTguNSAxLTEuMSAzLTIuNCAyLjktNC0uMS0yLjctMi43LTUuNS0zLjktNy44LTMuOC03LjQtOC42LTE0LjMtMTMuMS0yMS4zLTE4LjQtMjguMS00MS4xLTU0LjItNjgtNzQuNS0yNy43LTIxLTU5LjEtMzcuMy05NC42LTM3LjMtMTQuNiAwLTMyLjQgMy00My43IDEzLjMtNS41IDQuOS0xMC4yIDkuNC0xNC41IDE1LjQtNS4xIDctOS41IDE1LjUtMTIuNCAyMy43LTcuNCAyMS42LTcuNCA0My41LTcuMyA2Ni4xIDAgNy4xIDIgMTQuMSAyLjkgMjEuMSAxLjkgMTUuMiA2LjEgMzAuMSAxMC44IDQ0LjcgMTMuNCA0Mi4yIDM0LjIgODAuOSA2MC45IDExNiAxMC40IDEzLjYgMjAuOCAyOC4yIDMzLjQgMzkuOXpNNDA1LjkgMjk1LjVjMy4xIDEuMyA2LjcgMS4yIDEwIDIuNyAyLjEtLjMgLjMtNC4xLS4xLTUuMy0yLTUuOC0yLjUtMTIuMi00LjQtMTcuOS0xLjUtMi43LTIuMiA1LjUtMi41IDctLjYgMy42LTQgMTAuMS0zIDEzLjV6TTQyNS4yIDM0Ny40YzEuNSAyLjUgNi4yIDEuOCA4LjYgMS4yIDEuNS0xLjYgLjMtMy4xLS40LTQuOC0xLjctNC42LTMuNC05LjQtNS43LTEzLjctMS41LS45LTEuNSAyLjYtMS42IDMuNi0uNCA0LjItMS4yIDkuNi0uOSAxMy43ek0xMDMxLjggMzg1LjdjMS40IDEgMS45LTIuMiAyLTMuMSAuNi00LS41LTguNC0uOS0xMi4zLTEuMy0xMi41LTYuOS0yNC42LTEyLTM1LjktMS4xLTEuMi0uOSAzLjQtLjggNCAuNSA0LjQgMS45IDguNyAxLjkgMTMuMSAwIDUuNi0yLjMgMTItMS40IDE3LjQgLjMgMi4xIDIuNSAzLjQgMy42IDUgMi43IDMuOSA0LjkgOCA3LjYgMTEuOHpNNDUzLjEgNDAxLjNjLjkgMS45IDYuNC0uMiA4LjMtLjUgMS45LS45LS41LTMuNC0xLjItNC43LTIuNS00LTQuOC04LjEtNy40LTEyLTEuMi0uMy0uOCAyLjctLjggMy4zIDAgNC44IC43IDkuMiAxLjEgMTMuOXpNNDgyLjQgNDMwLjhjMS40IDYgLjEgMTMuNiAzIDE5LjEgMS4zIC45IDMuMi0uNSA0LjYtLjkgMi41LS43IDQuMS0uNSA2LjctLjMgMS40LTEtMS4xLTMuNi0xLjktNC41LTMuMS0zLjQtNS42LTcuNC04LjgtMTAuNy0uNi0uNy0zLjQtNS41LTMuNi0yLjd6TTUxMi40IDQ2Ni44Yy42IDIuNiAuNCA1LjIgLjggNy44IDEuMSAxLjUgMy43LS43IDQuOC0xLjYgMS43LTIuOC01LjQtNy45LTUuNi02LjJ6Ii8+CiAgICAgIDxwYXRoIGZpbGw9IiMwMDAiIGZpbGwtcnVsZT0ibm9uemVybyIgZD0iTTU1Ny40IDMyLjdjMS43IDIuMyAyLjcgNC41IDMuMyA3LjJzLjkgNC45IC41IDcuMWMtMi44IDE3LjEtMjQuNyAxNy4zLTMzLjggNC43LTcuNS0xMC40LTIuMi0yNyAxMS4yLTI4LjYgNy45LTEgMTQuNiAzLjMgMTguOCA5LjZ6TTUwMS42IDQ4LjJjLTExLjMtNi41LTEuNy0yMy40IDkuNi0xNi45czEuOCAyMi44LTkuNiAxNi45ek00ODguOCAzNy42YzEgMS4xIC45IDIuOCAuOCA0LjItMS40IDIuMi00LjggMi42LTcuMSAzLjItNS4yIDEuMS0xMC4xIDIuNy0xNS4xIDQuMy0xNC4xIDQuNS0yOCAxMy0zOS40IDIyLjItMzAuNiAyNC43LTQ0LjEgNjUuNC00OC4xIDEwMy4zLTEuMSAxMC41LTEuOSAyMS4xLTEgMzEuNiAxIDExLjIgMSAyMS45IDMgMzMgLjcgNCAxLjUgOS4zIDMuOSAxMi41IDIgMS40IDQuMS0uMiA2LjMtLjZzNS42IC40IDcuNSAyLjRjOC40IDguOCAyLjcgMjMuNyAuNSAzMy43LS44IDMuOC0yLjMgOS45LTUuMSAxMi43LTMuOCAxLjctMTIuMy02LjMtMTUuMS04LjgtOC4xLTctMTcuNS0xNi44LTIwLjUtMjcuNS0xLjEtNC4xLTEuMi0xMS41IDIuOC0xNC4zIDIuMS0xLjUgNC42LTEuMyA3LjEtMS45IDMuMi0yLjQtLjYtMTEuNS0xLjEtMTUtMi4zLTE1LTEuOS0zMS41LTEuMi00Ni43IDIuNS01My40IDI1LjYtMTA1LjIgNzIuMi0xMzMuMiAxMC45LTYuNSAyMy4yLTExLjQgMzUuNi0xMy45IDQuMy0uOSA5LjctMi44IDE0LTEuMnpNNTcwLjkgNjIuNGMtMTEuNS0xMC40IDUuNy0yMy42IDE2LTEzLjkgMy45IDMuNyA0LjIgMTEuMSAuMSAxNC43LTQuOCA0LjItMTEuOCAzLjMtMTYuMS0uOHpNNTk2LjMgNjEuOGMyLjQtLjIgNS4yIDIuNiA3IDMuOSAzLjcgMi43IDcuOCA1LjQgMTEuNyA3LjggMTguNyAxMS4xIDM1LjIgMjUuOSA1MS43IDM5LjggNiA1LjIgMTAuMSAxNS40IDE5LjYgMTQuNSAyLjgtMS4yLS45LTMuOC0yLjEtNS00LjMtNC4zLTguOC04LjMtMTEuOS0xMy42LTcuMy0xMi4zLTYuNC0yNC41LTcuNi0zOC4yIDEtMS41IDMuMyAxLjQgNC4xIDIuMiAzLjggMy44IDcgOC4xIDkuNyAxMi44IDUuNCA4LjkgMTEuNyAxNS45IDE0LjIgMjYuMyAuNyAzLjMtLjEgNi42IC42IDkuOXMzLjIgNS4zIDMuNiA4LjRjLjggNi40IDIuNCAxMy4zIDguNCAxNi44IDEuNy0uMSAxLjQtMS40IC45LTIuNi0xLjQtMy43LTMtNy45LTMuMi0xMS44LS40LTkuOCAuMS0yNS40IDEwLjgtMzAuNSAzLjEtLjEgMyAxMC41IDMuOSAxMy4zIDIuMyA2LjQgNCAxMy43IDMuMiAyMC42LS42IDUuMi00LjYgOC41LTYuNSAxMy0xLjUgMy43IDIuNSAxMSA0LjQgMTQuMiAyLjIgMi4yIDQuNS02LjYgNS41LTguMiAxLjctMS41IDIgMS4xIDIuNCAyLjQgMS4xIDMuOCAxLjggNy44IDMuOCAxMS4yIDEuNyAyLjcgMy40IDUuMiAzLjUgOC41IC4xIDIuMy0xLjIgNS41LS42IDcuNyAxLjUgNS4xIDguNSA5LjUgMTEuNyAxMy43IDEuNiAxLjEgMS44LS41IDEuOS0xLjkgLjMtNC4xIDEuMS04LjYgMi40LTEyLjUgMi4xLTIuMyAzLjIgMy45IDMuOCA1LjMgMi40IDUuMSA2LjggMTMuNiA1LjQgMTkuMy00LjEgNi4xLTEzLjEtMi41LTE2LjctNS01LjEtMy41LTcuNi0xMS0xMy4zLTEzLjctMy40LTEuNS03LjcgLjMtMTEuMy0uNy03LjYtMi4yLTE3LjQtMTAuNy0yMS44LTE3LjEtLjgtNC4zIDkuMi0zLjUgMTEuOC0zLjggNC4xLTItMy4zLTktNS4xLTExLS45LTEtMS40LTIuNy0yLjYtMy40LTMuNC0xLjYtNyAuOC0xMC40IC40LTcuMS0xLTE0LjctMi43LTIxLjItNS44LTIuMi0xLTUtMi02LjUtMy45LTEtNi41IDEwLjYtMTAuMiAxNC43LTEyLjcgLjYtMi4yLTIuNC00LTMuNy01LjQtNC4xLTQuNi05LjgtOC40LTE0LjUtMTIuNS0xOS43LTE3LjQtNDEuNy0zMi44LTYzLjgtNDcuMS0xLjItMS42IC45LTQuNCAyLjEtNS42ek03NTMuMyA4N2MxLjMgLjQgMS41IDMuNCAxLjcgNC41IDEuMSA0LjkgMy43IDkuNCA1LjMgMTQuMiAuOSAyLjMgMi45IDQuMiA0LjEgNi4zIDQuNiA3LjYgMTEuMiAxOC41IDE5LjQgMjIuNSAyLjMgLjEgMS45LTEuNyAuOS0zLjEtMi4zLTMuMi01LjEtNi4xLTcuMS05LjQtNS43LTkuMy0xMi4zLTE4LjMtMTYuMi0yOC42IC4xLTEuNCAzIDMuMSAzLjMgMy44IDEuOSAzLjUgNC4zIDYuNyA2LjggOS44IDcuMyA5LjEgMTYgMTcgMjQuNyAyNC43IDkuMiA4LjMgMjEuNSAxMy43IDMxLjcgMjAuOCAyMC44IDE0LjYgMzMuOSAzNS4zIDQwLjYgNTkuNi0uMiAyLTguNyAzLjQtMTEuMSA0LjctNS44IDMuMi05LjEgOS45LTE0LjYgMTMuNi0yLjQgLjItMy43LTIuNy01LjItNC4zLTQuNC00LjgtOS4zLTguNy0xNC0xMy0xOC45LTE3LjMtNDQtMjktNTYuNy01Mi41LS43LTIuMSA0LjUgNC40IDUuMiA1IDQgMy45IDguNyA3LjUgMTIuNSAxMS41IDUgNS4yIDExLjUgOC42IDE3LjQgMTIuNiA3LjYgNS4yIDE1LjkgMTEuMyAyNC45IDEzLjkgMS44LS4yIDItMS4yIDEuNy0yLjktMi42LTMuNi03LjktNS43LTExLjctNy44LTQuOS0yLjgtMTAtNi4xLTE0LjctOS4zLTE4LjgtMTMtMzMuNy0yOC40LTQ0LTQ5LTQuMS04LjMtOC43LTE5LjUtOC4xLTI4LjkgLjUtMS4yIDIuNiA1LjggMy4yIDcuMSAyLjQgNS40IDQuNiAxMS4xIDguMSAxNS45IDkuNiAxMy42IDIwLjEgMjUuNCAzMi40IDM2LjYgMy45IDMuNSAxMS45IDEwLjYgMTcuNCAxMC4yIDMuNi0yLjQtMS40LTUtMy40LTYuNC03LTUtMTMuNS0xMC4yLTE5LjYtMTYuMy0xNC0xMy44LTI1LjYtMzAuNy0zMS41LTQ5LjUtMS40LTQuNC00LjktMTEuNy0zLjQtMTYuM3pNNzAzLjUgMjUwLjljLS41IDIuMi00LjcgNS4xLTYuNSA2LjQtMi4zIC40LTIuOS0yLjMtMy44LTMuOS0yLjEtMy44LTQuNi03LjQtNi42LTExLjMtNC4xLTcuOS05LjktMTUuNC0xNS4yLTIyLjQtNS45LTcuNy0xMS0xNS44LTE3LjQtMjMuMS0zMi44LTM3LjItNzEuOS02OS4zLTEyMS4yLTgxLjItOS44LTIuNC0yMS40LTIuOS0zMS4yLTEuNS0xMS43IDEuNi0yMi4yIDMuMy0zMi43IDkuMy0zMiAxOC4xLTQ1LjkgNjAuMi00NS45IDk1LjEgMCA2OC4zIDI3IDEzNi42IDY1LjQgMTkyLjUgMTAuMSAxNC43IDIyLjMgMjcuNyAzMyA0MiAzLjEgNC4xIDguMSA3IDExIDExLjMgLjQgMi44LTQuMyA1LjQtNi42IDMuOS02LjMtNC0xMS45LTEyLTE2LjgtMTcuNi0xOC42LTIxLjMtMzQuMS00NC4zLTQ4LjYtNjguNC0yMC41LTM0LTMyLjUtNzEuNC00MS44LTEwOS43LTQuOS0yMC41LTcuMi00My00LjctNjQgMi43LTIyLjYgNi00Ni42IDE5LjQtNjYgMjQuNi0zNS4zIDY4LjQtNDUuOCAxMDguOS0zNCA0OC42IDE0LjIgOTEuOSA0Ny42IDEyMy4zIDg2LjcgMTAuMyAxMi44IDIwLjIgMjUuOSAyOSAzOS45IDIuOSA0LjcgOCAxMC41IDkgMTZ6TTg4OC4zIDE3Ni43YzEuNCAyLjggLjcgNi44IC43IDkuOCAwIDcuNSAwIDE1LjEgMCAyMi42IDAgNC0uOSA5LjIgMi44IDExLjkgMi43IC42IDIuMS01LjEgMi4zLTYuNSAuNi03LjUgLjEtMTUuNSAxLjEtMjIuOSAyLjYtNC40IDEyLjEgMi42IDE0IDUuNCA2LjUgOS4yIDMgMTguNi0yLjggMjcuMi0xLjUgMi4yLTMuMSA2LjgtNS45IDcuNi03IDEuOS04LjItMy0xMi43LTYuNC0zLjMtMi40LTguNy01LjMtMTEuMS04LjUtMy00LjEtMy44LTExLjEtNS4yLTE1LjgtMS45LTYuNi01LjEtMTIuOC04LTE4LjktLjEtMi42IDMuNy0zLjIgNS44LTMuOSA1LTEuNSAxNC4zLTQuNyAxOS0xLjZ6TTgxMC43IDIwOS4xYy4zIC42IDEgMS41LS4yIDEuNi00LjUgLjUtMTEuNy0uMi0xNi4yLTEtMS40LTEuMiA1LjctNSA3LTUuMyAyLjctLjcgNy41IDIuOSA5LjQgNC43ek03MzAuOCAyMDguNWMyLjktLjMgNi44IDMuMiA5LjUgNC4yIDYgMiAxMi4xIDMuNSAxOC4zIDQuMiAyMC4yIDIuNCA0My4zLTcuMSA2Mi42IDIuNCAzLjcgMS45IDYgNC43IDkgNy41IDIuMiAyIDQuNSAzIDYuMyA1LjUgMCAyLjUtMy44IDQuNC01LjYgNS42LTUuOSAzLjgtMTIuMyA3LjEtMTguNiA5LjktOC41IDMuNy0xOCA2LjktMjcuMyA3LjItMTggLjUtNDAuNS04LjYtNTEtMjMuOC0uNi0xLjYgNC45IDMuMSA1LjUgMy44IDMuMiAyLjkgNy43IDQuNiAxMS41IDYuNSAxMS42IDUuNyAyOC4zIDguOCA0MC41IDQuMSAxLjItMS4yIDEuMy0yIDAtMy4yLTYuOC0xLjktMTUuMS0uNC0yMi4zLTEuNi0xNS0yLjYtMjkuMS05LjQtMzguNS0yMS41LTIuMS0yLjYtNC40LTQuNC01LjktNy41LS4xLS4zLS40LTEtLjEtMSAxLjItLjIgMi44IDIuMyAzLjUgMyAyLjYgMi41IDUuMiA0LjcgOC4xIDYuOSA3LjQgNS40IDE1LjUgOS45IDI0LjYgMTEuNCAyLjcgLjQgNC45IDEuMiA3LjYgLjUgMy0yLjctNS43LTQuNC03LjMtNC44LTkuMS0yLjEtMTUuOS03LjUtMjMuMy0xMi43LTEuOC0xLjItNy4yLTQuMS03LjEtNi42ek04ODQuOCAyMzAuNWMuOCAxLjItLjQgMS41LTEuMiAyLjQtLjEgMS44IDEuOCAyLjQgMyAzLjQgMy40IDIuNyA2LjYgNSA4LjcgOC45LS40IDMuMS05LjQgMi41LTExLjggMy42LTEuMyAxLjEgLjggMi4yIDEuOSAyLjggMyAxLjUgNi40IDIuMSA5IDQuNCA1LjIgNC43IDIuNyAxMC4xIDUuNCAxNS42IDEuNiAzLjMgNS4xIDQuNyAzLjggOC45LTEuMyA0LjktNS4xIDQuOS05LjEgNS44LTcuNCAxLjgtMjEuMS0uNi0yNi43LTYuMy0xLTIuNCA2LjUgMCA4IDAgNi40IC4xIDEzLjctLjYgMTguNC01LjQgLjQtMS45LTIuNy0xLjYtNC0yLTEuNi0xLjYgLjQtNC4xIC43LTYgLjctNS4zLTEuOC0xMS44LTguMi0xMC4yLTIuOSAyLjMgMiAzLjYgMi45IDUuNiAwIDEuNi0uNSAyLjctMS40IDMuOS02LjkgNC44LTkuNC0xMC42LTEwLjctMTQtMi0xLTIuOSAyLTMuOSAzLjMtMi4xIC41LTEuNi0zLjItMS42LTQuNCAwLTUuNyAyLjEtMTAuMyAzLjYtMTUuNy0uMi0xLjgtMS4xLTEuOS0yLjYtMS40LTEuOSAxLjMtMi41IDMuNC00LjIgNC44LTIuNiAyLjEtNi4xIDIuNC04IDUuNXMtMS44IDYuNy0xLjggMTAuMmMwIDkuNCAyIDE3LjcgNy4xIDI1LjYgLjMgMS44LTMuNS0uNS00LjItLjktMy42LTItNi00LjctOS03LjUtNS40LTUtMTEuOS05LjEtMTcuMi0xNC4yLTIuMy0yLjMtNS4xLTQuNC01LjUtNy44IDEuMS00LjMgMTEuMi05LjUgMTUuMS0xMS41IDIuMi0uNCAxLjcgMi40IDEuMyAzLjgtMSA0LjQtMS45IDExLjMgMi4yIDE0LjMgMi42IC43IDIuMy00LjQgMi43LTYgMS41LTYuNSAxLjItMTEuOSA0LjUtMThzMTAuNi0xMy43IDE3LjYtMTEuN2M2IDEuOCAxMC4yIDYuOSAxNS4yIDEwLjJ6TTkzNC4yIDIyOS41YzEuNSAuNyAyLjIgMS40IDIuNiAzLS42IDQuNi05IDEzLjctMTMuNyA5LjktMy00LjEgNi44LTEzLjEgMTEuMS0xMi45ek04OTcuOSAyMzguNGM0LjYtMS44IDEwLjEgMi4xIDEzLjkgNC4zIDQuOCAyLjggMTAuNSA1LjYgMTMuNiAxMC40IDMuNyA1LjUgMS45IDE2LjUgLjQgMjIuNS0xIDEuMy0zLjMgLjMtNC42LS4zLTIuNi0yLjgtMS4yLTEwLjEtMS4yLTEzLjggMC0xLjYgLjMtMy43LTEuMi00LjgtNi4xLTQuOC0xMi43LTUuNy0xNy40LTEyLjYtMS0xLjYtMy45LTMuNS0zLjUtNS43ek04NjIuMSAyNDUuOGMxLjIgLjggLjkgMi45IC45IDQuMiAwIDMgLjUgNiAxLjggOC43IDEuNyAzLjggNC4zIDIuOCA2LjggNS4yIDEuMyAxLjMgMS43IDMuMyAyLjcgNC44IDEuNyAyLjEgNC44IDMuNyA3LjIgNC43IDIuMiAyLTkuNiAxLjYtMTEuNSAxLjEtOC43LTIuNS0xMC43LTEwLjgtMTEtMTktLjEtMy4zLS4xLTcuOCAzLjEtOS43ek04MjAgMjUwLjdjMi4yIDEuMiAyLjUgNS4yIDQuMiA3LjEgNCA0LjMgMTAuMSA3LjYgMTMuMyAxMi4zIDMuOCA1LjYgNC42IDE0LjEgNy45IDIwLjMtLjIgMi4xLTMuMSAxLjYtNC43IDEuOS00LjIgMS04LjYgLjctMTIuOSAuNy0xNC4yIDAtMjguNiAuOC00Mi43LS45LTUuMi0uNi0xMS4zIC40LTE2LjMtMS43LTIuNi00LjEtMS43LTEwLjEtMS44LTE0LjdzLTEuNy0xMC0uNy0xNS4zYzEuNy0yLjQgNC4zLS44IDYuNy0uNSA1LjggLjcgMTIuMSAuMiAxNy45IC4xczEyLjctMiAxOC4zLTQuM2MzLjUtMS40IDctNC4zIDEwLjgtNXpNODk4LjcgMjUwLjdjMi4xLS40IDcuMyA0LjggOC45IDYuM3M1IDIuMSA2LjUgNCAuOSA0LjYgLjkgNi43YzAgNS44IC4yIDkuNC00LjYgMTMuMi0xLjUgLjYtMS40LTEuNS0xLjYtMi41LS42LTMuNS0yLjMtNi45LTMuMy0xMC4zcy0xLjctNy44LTMuOC0xMS4zYy0uOS0xLjYtMy40LTQuMi0zLTYuMXpNNzU5LjIgMjYyLjljMS42IDEgLjcgNS40IC45IDcgLjggNi45LS45IDE3IDIuMiAyMy4zIDIuNSA0LjkgMTUuMiA0LjIgMjAuMiA1IDEuNyAxLjItNi40IDMuMi03LjMgMy41LTQuNSAxLTEzLjMgMS40LTE3LTEuOS0yLjItMi4xLTMuMS01LjktMy4yLTguOC0uMi03LjYtMS43LTIyLjEgNC4yLTI4LjF6TTk2MS41IDI2Mi44YzEuNi0uMSAyLjMgMiAzIDMuMSAyLjMgMy44IDQuNyA3LjMgNyAxMSAxMS40IDE4LjggMTAuMiA0MS4zIDMuNiA2MS4zLTEuMSAyLjEtMS4xLTcuMi0xLjQtOC42LTEuNS02LS43LTEzLjUtLjctMTkuOCAwLTEwLjktMi0yMS41LTUuNS0zMS44LTEuMi0zLjQtMi4yLTYuNi0zLjgtOS44LS43LTEuNS0yLjQtMy43LTIuMi01LjR6TTk5MS41IDI3MC44YzEuOS0uMSAyLjkgMi43IDMuOCAzLjkgMy40IDQuMiA3LjMgNy44IDEwLjMgMTIuMyAxMC43IDE1LjcgMjEuOCAzMC40IDI3LjggNDguOCAxLjQgNC4yIDMuMyA4LjQgMy41IDEyLjktLjUgMi45LTMuNS03LjMtNC4yLTkuMi0yLjYtNi45LTcuMS0xMy4xLTEwLjQtMTkuNy01LjctMTEuNC0xMy4xLTIzLjEtMjAuNi0zMy40LTIuOC0zLjgtNS44LTcuNS04LjEtMTEuNC0uNy0xLjItMi4yLTIuOS0yLjEtNC4yek04NDUuNSAyNzYuOGMxLjctLjEgMy45IDMuMSA1LjEgNC4yIDIuNyAyLjYgNi4zIDMuOCA5LjcgNS4yIDEzLjUgNS44IDI3LjUgOC42IDQxLjYgNC41IDIgLjctMy41IDUuNC00LjMgNi4yLTMuNyAzLjktMTAgNy0xNS40IDcuMS00LjIgLjEtMTIgMi43LTE1LjcgMS41LTEuOS0uNi0zLjMtMi45LTQuNy00LjItNS40LTUuMy05LjctMTAuMi0xMy0xNy0xLTItMy42LTUuMy0zLjMtNy41ek05MDQuMiAzMDAuNmMtMS42LTEuNiAxLjYtNC4xIDIuNS01LjggMi41LTUgNS04LjEgOS4xLTEyIDEuNi0xLjUgMy4xLTMgNS41LTIgNC4zIDEuOSA1LjggMTMgMi43IDE2LjMtMy43IDMuOS0xNSA0LjgtMTkuOCAzLjV6TTY3MS42IDI5Mi44YzEuOS0uNSAzLjIgMy44IDMuOSA1LjIgMS41IDMuMSAzLjIgNi4xIDQuMiA5LjRzLjYgNy41IDQuMiA5LjJjNC41IC4zIDguNy0xMC4xIDExLjQtMTMuNCAyLjEtMS4zIDEuNyAyLjIgMS43IDMuNSAwIDQuNi0uNSA5LjItMS4xIDEzLjgtMi4yIDE1LTExLjEgMjguNi0xNS45IDQyLjgtMS41IDIuNy0yLjctMi45LTMuMS00LjEtMS45LTUuOC0zLjUtMTEuNi00LjgtMTcuNy0yLjYtMTEuOC0yLjctMjQuMS0xLjItMzYuMSAuNS0zLjktMS04LjkgLjctMTIuNnpNOTk1LjUgMjkyLjhjMS42IDAgMi42IDMuMSAzLjQgNC4zIDIuOSA0LjcgNS4zIDEwIDcuNCAxNS4xIDguNiAyMC45IDEyLjMgNDkuNCAyLjUgNzAuNi0xLjEgLjctLjYtMi4zLS41LTIuOCAuNS0yLjggLjYtNS4zIC43LTguMiAuNC03LjYgLjYtMTUuNi0uMS0yMy40LTEtMTItMy45LTI0LjUtNy4zLTM2LjEtMS41LTUuMy02LjktMTQtNi4xLTE5LjV6TTgwNS43IDI5OS4zYzEuNyAxLjUgMS40IDQgMS4yIDYuMS0uMyA1LjEtMi4xIDEwLjEtMi45IDE1LjEtMi43IDE2LjktOC40IDM1LjEtMTUuMiA1MC43LTIuMiA1LjEtMy4yIDEzLTYuOSAxNy4xLTQuOSAyLjEtMTEuNCAuNS0xNi40LS4yLTIuNS0uMy01LS4xLTcuNC0uMXMtNC0uMS01LjkgLjFjLTQuNyAuNS01LjggNC40LTMuNCA4IDQuNCA2LjQgMTEuNiAxMC42IDE2LjkgMTYuMSAxLjggMS43IDQuNyAzLjggNC44IDYuNC0xLjQgNC40LTYuMSA4LjMtOS4yIDExLjYtNy42IDcuOC0xNS43IDE1LjMtMjMuMiAyMy4yLTkuMyA5LjgtMTkuOSAyMi40LTI0LjggMzUuMi0yLjkgNy41LTMgMTQuNS00LjYgMjIuMS0xLjMgMS4yLTMuNC02LjQtMy43LTcuNS0yLjItOC45LTMuMS0xNy43LTMtMjcgLjItMTguMyA4LjItMzYuMyAxNi45LTUyLjEgMi45LTUuMiA3LjktOS4zIDEwLjMtMTQuOCAwLTEuNS02LjQgMi44LTcuNiAzLjUtNS4yIDIuOC0xMCA1LjItMTUuNyA2LjgtMTUuOCA0LjMtMzAuNS0xLjEtNDQuNi03LjgtMS0xLjMgNS44LS4zIDYuNy0uMSA0IC45IDguMS0uMiAxMi4xLS44IDEwLjQtMS40IDIxLjQtOS4xIDI5LjYtMTUuMyAxNy45LTEzLjYgMzMuNi0zMy40IDQ0LjUtNTIuOSA0LjMtNy42IDcuNy0xNi4zIDEyLjQtMjMuNSAyLTEuNSAuMSAzLjItLjEgMy44LTEuNCA0LjEtMyA4LjMtMy43IDEyLjYgMCAyLjUgMi44LS44IDMuMy0xLjUgMi42LTMuNiA1LjktNy40IDktMTAuNiA1LjMtNS42IDkuMi0xMi42IDE0LjQtMTguNSAxLjQtMS42IDMuMS00LjcgNC45LTUuNiAyLjgtMS4zIDguNC0uNyAxMS4zLS4xek05NDcuMyAzMDBjMi40IC44IDIuNSAxMC4xIDMgMTIuMiAzIDEyLjUgLjggMzAuMi01LjMgNDEuNi0yLjIgMi4xLTEtMi41LTEtMy42IC4xLTQuOCAuOC05LjQgMS0xNC4xIC40LTkuMyAuMS0xOS4xIDEuOC0yOC4zIC40LTIuNS0uMy01LjMgLjUtNy44ek00MTYuNSAzNTVjLTMuMSAyLjQtMTEuOC01LjYtMTQuNS03LjUtOC4xLTUuNy0xNi44LTEyLjktMjIuMS0yMS40LTMuMS00LjktNS4xLTEwLjMtMi44LTE2IDMtNy4yIDExLjMtMi43IDE2LjUtMi4yIDMuMSAuMiA1LjctMi4yIDguNC0zLjQgNS42LTIuMyAxMi0xLjMgMTUuNyAzLjggMi4xIDIuOSAyLjMgOS4yIDIuMyAxMi43IC4xIDEwLjUgMCAyNC0zLjUgMzR6TTg4MS4xIDMxMy44YzEuNCAuOC0uOCAzLjktMS40IDUtMi40IDQuOS01LjIgMTAuNC02LjcgMTUuNy0zLjUgMTIuMS05LjEgMjMuOS0xNC4zIDM1LjMtNC45IDEwLjgtMTAuMyAyMy42LTE4LjYgMzIuMi0xLjQgLjQtLjItMS42IC4xLTIuMSAxLjQtMi42IDIuOS01LjEgNC4yLTcuOCAzLjQtNi44IDUuNy0xNC4yIDktMjEgNi43LTEzLjcgMTEuNS0yOC4xIDE4LjQtNDEuOCAyLjEtNC4zIDUuNC0xMi42IDkuMy0xNS41ek03NTcuMiAzMjIuOWMxLjYgLjktMS40IDQuOC0xLjkgNS44LTIuOSA1LjYtNi4zIDEwLjgtOS4zIDE2LjMtNy4xIDEzLjItMTcuNCAyNC40LTI3LjcgMzUuMS03LjUgNy44LTE2LjMgMTUuOC0yNi43IDE5LjQtMS4zLS4xIDcuOC02LjYgOS4zLTcuOCA2LTUuMyAxMi42LTEwLjYgMTguMS0xNi40IDEwLjItMTAuNiAxOS4xLTIzLjQgMjcuMy0zNS42IDMuNC01LjEgNi40LTEyLjcgMTAuOS0xNi44ek05NjcuNSAzMzkuOGMxLjctLjMgMS41IDIuMSAxLjUgMy4yIC4xIDQuMy0xIDguMi0xIDEyLjUtLjEgMTEuOS01LjUgMjUuMS0xMSAzNS41LTIuMyA0LjMtNi44IDgtNy41IDEzIDEgMy42IDcuMi0uMiA5LjItMS4zIDguMS00LjEgMTYuMS0xMS42IDIxLjgtMTguNiAxLjYtMS00LjkgOC44LTUuMyAxMC40IC43IDMgNC40IDMuMyA2LjEgNS43IDYgOC43IDE0LjIgMTYuNyAyNCAyMSA0LjUgMi4xIDEwLjEgMi41IDE0LjUgNC44IDEuMSAxLjYtMS41IDQuNS0yLjMgNi0zLjQgNS42LTYuOCAxMS4xLTEwLjIgMTYuOC0xLjYgMi43LTMuOCA2LjYtMi45IDkuOXM0LjMgNi41IDQuMSAxMGMtMS44IDIuNi01LjIgNS40LTUgOSAxIDEuMyAyLjYgMi41IDMgNC4xcy0xIDMuNC0xLjcgNS0xLjIgNS0xLjYgNy40Yy0xIDUuNyAyLjEgMTQuOS0xLjEgMTkuOS0yLjcgNC4yLTEwLjQgNS0xNC44IDYuMi0xMC41IDIuOS0yMS42IDUuMi0zMi40IDYuNi02LjMgLjgtMTQuMiAuNy0xOS42IDQuNC0xNi45IDExLjktMjEuMSAzMi40LTMyLjMgNDguNS0xIC42LTEuMi02LjgtMS44LTgtMi4yLTUuNS01LjUtOC43LTkuNy0xMi44LTcuNS03LjEtMTgtMTAuOS0yNS4zLTE4LjItMi42LTIuNi0zLjQtNi44LTUtMTAtNC04LjktNS41LTE4LjctNi4zLTI4LjItLjItMy4yLTEuMS01LjktLjctOS4xIC4xLS4xIDMgNi45IDMuOCA4LjUgMi43IDUuOCA1LjggMTAuOCA5LjUgMTYgOC4zIDExLjkgMjIgMjIuMSAzNi4zIDI1LjIgNC45IDEuMSAxMy41IDIuNiAxNi4zLTIuOSAuNC0yLjUtOC4yLTYuMi0xMC4zLTcuNi04LjktNi0xNi44LTE1LjctMjAuNC0yNS45IC4xLS4zIC4xLTEgLjQtLjkgLjkgLjMgMS43IDIuMiAyLjQgMi45IDIuMiAyLjIgNS4zIDQuMSA4LjEgNS40IDguMiA0LjIgMTcuNiA2LjkgMjYuOCA3LjcgMy42IC4zIDcuOS0xLjEgMTEuNC0xLjkgMTUtMy4yIDM0LTE1LjkgMzktMzEuMiAwLTEuNi0uNy0yLjMtMi4zLTIuMy02LjYgMi4xLTEyLjIgNi4zLTE5LjYgNS40cy0xMy4xLTQuMS0xOC42LTguNGMtMTguNi0xNC41LTIwLjgtMzQuOS0xOS4xLTU3LjEgLjYtNy4zIDEuOC0xNS40IDQuNS0yMi4zIDEuNS0uOSAxLjcgMi43IDEuOSAzLjYgMS4zIDQuNCAyLjggOS4xIDQuNyAxMy4zIDUuMiAxMS4xIDEzLjMgMjguMiAyNS44IDMyLjYgMS44IDAgMi0uOSAxLjYtMi41LTktMTMuMi0xMi4yLTI3LjctMTMuMy00My43LS40LTQuOSAuNC05LjktLjItMTQuOC0uNy01LjctLjktMTEuMy0uOS0xNy4xIDAtMi4xLS41LTUuMSAuNC03LjEgMS41LTMuMiA3LjgtNSAxMC40LTcuNiA2LjUtNi41IDEwLjItMTMuMyAxNC43LTIxek03MDEgMzQxLjdjMi44IDIgLjUgOS41IC4xIDEyLjQtMS43IDExLjUtNC41IDIwLjYtMTMuMyAyOC43LTIuOSAyLjctOC4zIDIuNi0xMC41IDYtMi44IDQuMyA3LjIgMTAuMiAuNiAxNS4xLTcuNiA1LjYtMTguNy0xLjEtMjYuOCAuOC02LjEgNC4yIDUuOCAxMC41IDguOCAxMi40IDEuNiAyLjEtMy4zIDUtNC45IDYuNC01LjkgNS4zLTEyLjEgMTEuNC0xOSAxNS41LTQuMiAyLjUtOC4zIDUuOC0xMi4zIDguNy0xNS4xIDEwLjQtMzMuMiAxOS4xLTUwIDI2LjUtNi4xIDIuNy0xMi4zIDYuMS0xOC43IDguMy0zLjQgMS4yLTkuNSAzLjEtMTEuNSA2LjMtLjIgMS44IC4zIDIuNiAyIDMgMTEtMS4zIDIxLjgtOC42IDMxLjctMTMgMjMuNS0xMC40IDQ0LjgtMjMuMiA2NS45LTM3LjcgNS43LTMuOSAxMS42LTguNiAxNi43LTEzLjMgMi0xLjkgMy43LTQuNCA2LjEtNS45czUuMiAuMyA2LjYgMmMuOCAzLjEtMS4zIDcuMy0yLjIgMTAuNC0yIDYuOS00LjEgMTMuNy02LjQgMjAuNS05IDI2LjMtMTcuMiA1My4yLTI3LjYgNzguOS0zLjkgOS44LTcuMSAyMC0xMC42IDI5LjktNy4xIDIwLjItMTcgMzkuOS0yNi40IDU5LjEtMy43IDcuMy02LjcgMTUtMTEgMjJzLTcuNiAxNC41LTExLjUgMjEuNWMtMS43IDMuMS0yLjggNy4xLTUuMyA5LjctNS4xIDUuNS0xMy4yIDkuNC0xOS40IDEzLjYtMjAuNSAxNC4yLTQyLjEgMjYuOC02Mi43IDQwLjgtMTcuMSAxMS43LTM1LjYgMjEuMy01My4zIDMyLjItNDAgMjQuNi04MS40IDUwLjMtMTE2LjUgODEuNS0xNC4yIDEyLjYtMjkuNyAyNi4xLTQxLjIgNDEuMy0zLjkgNS4xLTguMSA5LjktMTIgMTUtMy4yIDQuMi01LjcgOS4zLTkuNCAxMy4xLTExLjkgMTIuMS0yOC42IDIwLjItNDIuOSAyOS4xLTIzLjUgMTQuNi00OS4xIDI2LTc1LjYgMzMuOC0xMCAzLTIwIDcuMS0zMC4zIDguNS0uMiAwLTEuNCAwLTEuNC0uNnMzLjMtMi4yIDQuMS0yLjdjMy41LTIuMiA3LjUtNC42IDEwLjUtNy40IDIuMi0yIDUuMS0yLjkgNy41LTQuNiA4LjQtNS44IDE2LjQtMTIuNiAyNC42LTE4LjggMTEuMS04LjMgMjAuOS0xOC4zIDMxLjQtMjcuMSAzLjgtMy4yIDYuNy03LjQgMTAuNy0xMC4zIDE0LjQtMTAuMiAzMC42LTE5LjMgNDIuOC0zMi4yIDMtMy4yIDYuMy01LjEgOC43LTkgLjItMS44LTQuMyAxLjQtNSAxLjgtNS40IDMtMTAuMSA3LTE1LjIgMTAuMy0xMy42IDguNy0yNy40IDE3LjctNDAuNiAyNi45LTExLjUgNy45LTI0IDE0LjItMzYuMiAyMC44LTIwLjkgMTEuNC00Mi4xIDIxLjYtNjQuMiAzMC4zLTEwLjEgNC0yMC42IDguMy0zMS4yIDEwLjgtMy4zIC44LTYuNyAyLjktMTAuMiAyLjgtMS41LS43IDEuNy0xLjkgMi40LTIuMiAzLTEuNSA2LjEtMi45IDktNC41IDcuNy00LjIgMTUtOS4xIDIyLjctMTMuMyAxNi4zLTkuMSAzMS42LTIwLjMgNDYuNi0zMS40IDUuMi0zLjggMTAuMS03LjggMTQuOS0xMi4xIDIuNC0yIDUuMi0zLjUgNy4xLTYuMiAuMy0yLjEtMS45LTEuNi0zLjMtMS40LTQuMiAuOC04LjctLjMtMTIuOSAuNi0xOC42IDMuOC0zOC40IDIuNC01Ny4yIDUuNC0yLjUtLjQgNC40LTIuNiA1LjMtMi45IDQuNS0xLjYgOS4yLTIuNyAxMy44LTQuMiAxMy42LTQuNSAyNy45LTguNyA0MS0xNC41czI2LjctMTAgMzkuNi0xNS45YzI3LjYtMTIuNSA1NC44LTI1LjUgODEuNC00MC4xIDI3LjktMTUuMyA1My44LTM0IDgwLjMtNTEuNyAxNi4xLTEwLjcgMzEuMy0yMi42IDQ3LTMzLjkgMTcuNS0xMi43IDM1LjMtMjUuNyA1MS43LTM5LjkgMTUtMTIuOSAyOS41LTI2LjQgNDQtMzkuOSA3LjktNy40IDE0LjEtMTcuNCAyMi44LTIzLjcgMy41LTIuNiA5LjEtMi4xIDEzLjEtMy40IDUuNS0xLjkgMTAuNC01LjYgMTUtOSAzLjgtMi45IDcuMi03IDEwLjUtMTAuNSA2LjktNy4yIDE0LjItMTMuOSAyMC4xLTIxLjkgMi43LTMuNiA2LjMtNi44IDkuMi0xMC4zIDExLjMtMTMuNCAyMi43LTI4LjMgMzEuMy00My43IDQuOS05IDEzLjktMjAgMTMuOS0zMC44LS41LTEuNC0xLjEtMi4zLTIuNi0xLjQtNy4xIDguOS0xMS40IDIwLjctMTcuNSAzMC40LTE1LjIgMjMuOS0zMy4xIDQ4LjMtNTMuNiA2Ny45LTEwIDkuNy0xOC40IDIwLjctMzIuNiAyNC40LTMuOSAuOS05LjEgLjYtMTMuMSAuMi00LjgtLjQtOS41LTIuMi0xMy45LTQtMi4xLTEuNSA0LjEtNC4yIDUuNi01IDUuMy0yLjggMTAtNyAxNC42LTEwLjkgMi4yLTEuOSA0LjYtMy4xIDUuNy02LS4zLTMuOS02LjggLjktOC4xIDItNC44IDQuMS0xMC45IDcuMy0xNi4zIDEwLjctMi41IDEuNS01LjcgNC04LjUgNC44LTEuNiAuNS0zLjMtMS4xLTQuNC0yLjEtLjktMS43IDEtMi41IDIuMy0zLjEgMy45LTIuMSA3LjgtNC4zIDExLjctNi40IDExLTYuMSAyMC44LTE0LjEgMzEtMjEuNCAzLjgtMi43IDktNi42IDExLjItMTAuOC0uMi0xLjQtLjktMS45LTIuMi0yLjEtNi42IDItMTIuNyA5LTE4LjIgMTIuOS05LjkgNy0yMC41IDE0LjMtMzEuMyAxOS43LTI5LjMgMTQuNy02NC43IDEuOS04OC43LTE3LjgtNy44LTYuNC0yMC4zLTE3LjgtMTkuNC0yOS4yIDItMi43IDYuOS0zLjYgOS45LTUgOS44LTQuNSAyMC4xLTguMyAzMC40LTExLjYgMjYuNy04LjYgNTMuNy0xNi40IDgwLjYtMjQuMyA2LjYtMS45IDEzLjEtMy45IDE5LjctNS44IDQuNy0xLjQgMTAuNC0yLjMgMTQuNi00LjkgMS0xLjIgLjctMi0uNC0zLjEtNi4xLTIuMS0xNS41IDMtMjEuNiA0LjMtMTguOSA0LjMtMzcuMSAxMS44LTU2IDE2LTIwLjggNC43LTQzIDExLjMtNjIuNSAyMC0xNC40IDYuNC0yOS4xIDE0LjMtNDQuMyAxOC43LTE5LjUgNS44LTQwLjMgNi4xLTYwLjQgOC42LTEzLjEgMS43LTI2LjQgMy44LTM5LjIgNy4zLTYuMSAxLjYtMTIuMyA0LjItMTguNCA1LjMtMi43LS41IDMuMy01LjUgNC40LTYuNSA2LjctNi4zIDE0LjktMTEuMSAyMi40LTE2LjYgMTkuNi0xNC4xIDQyLjYtMjQuNCA2NS4zLTMyLjEgNDIuOS0xNC41IDg4LjItMTguMSAxMzIuNi0yMy40IDE2LjMtMS45IDMyLjctMy4xIDQ5LTUgOC43LTEgMTcuOC0yLjMgMjYtNS42IDEuMi0xLjEgMS4xLTItLjEtMy4xLTQuNi0xLjMtOS41IDEuMi0xNC4xIDEuNS0xMy42IDEuMS0yNy42IDUuNy00MS4zIDUtMi41LS42IDUuNS0zLjIgNy4xLTMuOCA1LjctMi4xIDExLjItNC44IDE2LjktNyAxMC45LTQuMSAyMS4zLTkuNyAzMS43LTE0LjkgNS41LTIuNyAxMS44LTUgMTYuOS04LjUgMTMuNC05LjMgMjkuMi0xNS45IDQzLjMtMjQuMyAyMS40LTEyLjcgNDMtMjguMiA2MS4yLTQ1LjIgMTEuNi0xMC43IDI0LjUtMjAuMiAzNS4xLTMyLjIgMS4zLS41IDIuMSAxLjcgMy4xIDIuNSA0IC45IDYuMS01LjMgNy4zLTguMyAzLTcuMyA3LTIxLjggMTYuMy0yMy41ek05MjAuNSAzNDQuOGMxLjYtLjYtLjQgOC44LS41IDEwLjItLjIgNy40IDAgMTUgMCAyMi40IDAgNSAxLjcgMTAuNSAuOCAxNS4zcy00IDEwLjQtNS40IDE1LjVjLTEuNiA1LjgtMiAxMi0zLjEgMTcuOXMuNyAxMy4zLS42IDE5LjZjLTEuMSAxLjEtMi40LTcuMy0yLjYtOC41LTEuMS04LjYtLjQtMTYuMy0uMS0yNC45IC41LTEzLjkgNC4xLTI4LjEgNS45LTQyIDEtNy45IDItMTguMyA1LjYtMjUuNXpNOTg4LjIgMzUwLjljMi41IDEuNS0xLjYgMTAuOC0yLjMgMTIuOS00LjQgMTIuOC0xMy4xIDIyLTIzLjYgMzAuMS0xLjggLjgtLjItMi4yIC4yLTIuNyAyLTMuMyAzLjctNi40IDQuOS0xMCAyLjktOC43IDMuOC0xNy45IDYuNS0yNi40IDEuMy0yLjYgMS4xIDMuNiAxLjEgNC4zIDAgNC42LS41IDkuMS0uNiAxMy42IDEuMiAxLjYgMy43LTIuOCA0LjItMy43IDMuMi01LjMgNS4zLTEzLjcgOS42LTE4LjF6TTQ0NSA0MDcuOGMtMi4zIDItMTEtNS4yLTEzLjUtNi42LTkuMy01LjEtMjAuMS0xMy0yNS43LTIyLjEtMi40LTMuOC00LjQtOS44LTEuNC0xMy44IDMuOC01LjMgOS45LTEuNSAxNC43LTNzNS4zLTggMTEuNy03LjFjMTUuOCAyLjMgMTMuNSAyNi44IDE0LjIgMzguMSAuMyA0LjcgMi40IDEwIDAgMTQuNXpNNjcwLjQgMzU5LjdjNC41LS4yIC43IDYuOC0uNiA4LjEtNi44IDYuNy0xNC42IDE1LjMtMjIuNyAyMC40LTEuNi0uMSAuNi0yLjUgMS4xLTMgMi4zLTIuMyA0LjItNC44IDYuMy03LjIgNS4zLTYgMTAtMTMgMTUuOS0xOC4zek0xMDE2LjQgMzc3LjljMy44LS41IDEuOSA2LjcgMS4zIDguMy0yLjkgOC4yLTYuMSAxNC42LTExLjIgMjEuNy0zLjEgNC4zLTguMSA0LjEtMTAuOS0uMS0uMi0xLjggMS0zIDEtNC44LTEuMS0yLjMtMi44LS42LTQuNy0uNS0xLjQtLjYtMS44LTEuNC0uNS0yLjQgMy41LTEuNSA2LjMtMy4yIDguOS01LjkgMS43LTEuMS0xLjQgMTAtMS4xIDEyLjIgMS45IDMuNSA2LjMtMi45IDcuMy00LjUgNC44LTcuNiA2LjEtMTYuMSA5LjktMjR6TTEwMDEuMSAzODQuOGMxLjQgLjgtMi4zIDQtMy4xIDQuNy0zLjcgMy4zLTguNCA2LTEzLjUgNS4zLTEuMy0uOCA0LjctMyA1LjctMy42IDMuOS0xLjkgNy4zLTQuMiAxMC45LTYuNHpNODM5LjEgMzg3LjhjMS4xIC42IC4xIDIuMS0uNCAzLTEuNiAzLjMtMy43IDYuMi01LjUgOS40LTcgMTMuMy0xNi4zIDI0LjUtMjQuNiAzNi45LTEyLjcgMTguNy0yOC45IDM0LjctMzkuNiA1NC45LTguNSAxNi0xMi44IDMzLjEtMTUuMSA1MC45LS4xIC40LS4zIDEuNC0uNiAxLjFzLS41LTIuNS0uNi0zLjJjLTEuMS00LjMtMS04LjctMi0xMy0yLjctMTEuNCAuNC0yNC4xIDIuMi0zNS40IDQuMi0yNS43IDE0LjYtNTAuNSAyNC42LTc0LjQgMy41LTguNiA1LjctMTguOSAxMC41LTI2LjggMS4xLS43LTEuNCA3LjctMS45IDguOS0yLjEgNi00IDEyLjEtNS44IDE4LjItMy41IDEyLjItNi42IDI0LjYtOS42IDM2LjktMS44IDcuMS00LjcgMTQuNy00LjYgMjIuMSAxLjEgMi44IDUuNS00LjEgNi40LTUuMyA1LjMtNy42IDExLjMtMTQuNyAxNy0yMiAxMC44LTEzLjYgMjMuNS0yNS43IDM0LjItMzkuMyAzLjYtNC43IDcuNi05LjggMTAuNS0xNSAxLjQtMi4zIDIuOC02LjMgNC45LTcuOXpNNzUzLjkgMzkzLjRjNS4zLTIgMTIuMyAuMiAxNy44IC42IDIuMyAuMSA0LjctLjIgNyAuNCAxLjUgMS4zIC4zIDMuMS0uMyA0LjctMS4yIDMuOC0yLjUgOC41LTQuNiAxMS45LTIgMS4yLTMuNC0xLjItNC43LTIuNC0zLjctMy40LTctNy4xLTEwLjYtMTAuNS0xLjMtMS4yLTUtMi42LTQuNi00Ljd6TTQ3OC44IDQ1OC4xYy0uOCAyLjMtMi41IDEuNS00LjIgLjYtMy44LTEuOC03LjctMy4yLTExLjUtNS4xLTEwLjQtNS4yLTIxLjgtMTEuMy0yOC43LTIwLjktNC41LTYuMi0zLjctMTYuNyA1LjYtMTcuNiAyLjktLjIgNS4yIDEuNiA3LjcgMi41IDIuOSAwIDIuOS0zLjYgNC41LTUuNCAzLTMuMiA2LjEtNC43IDEwLjctNC4xIDUuOCAuOCA4LjkgNy40IDEwLjEgMTIuNSAyLjcgMTIuNCA0LjggMjQuOSA1LjggMzcuNXpNMTA0Mi41IDQxNi44YzEuNSAwIDIuMSAyLjMgMi44IDMuNCAxLjYgMi44IDMgNS45IDQuOCA4LjYgNi44IDEwLjQgOS44IDI0LjkgMTEgMzYuOSAuNCA0LjEgMS40IDcuOCAuNiAxMi0uNyAuNy0xLjgtNi43LTItNy43LTEtNS4yLTIuNi0xMC4zLTMuOC0xNS42LTItOS4zLTYuNy0xOC41LTkuOC0yNy42LS45LTIuNS0zLjktNy41LTMuNi0xMHpNMTA0MC4zIDQ0MGMxLjMgLjIgMS45IDIuOSAyLjIgNCAxLjUgNS4yIC43IDEwLjMgLjUgMTUuNS0uNiAxNS42LTEzLjMgMzMuMy0zMC4zIDMyLjQtMS44LS42IDUtMi4yIDYuMS0yLjYgNC40LTEuNiA4LjctNC4xIDExLjItOC4zIDUtOC43IDgtMTYuMiA5LjgtMjYuMiAuNC0yLjQgMS01LjQgMS03LjhzLTEuMy00LjUtLjUtN3pNNDg0IDQ2NmMzLTQuNSAyLjktMTEuOCAxMC41LTExLjggOC44IDAgMTEuNSAxMS43IDExLjUgMTguMyAwIDIuMiAuOCA2LjMtLjkgOC4xcy00LjIgMi4yLTYuMSAyLjljLTQuOSAyLjEtMTEuNiA3LjctMTcuMiA2LjEtNy4xLTItMTUtMTIuNC0xMC4yLTE5LjUgMy4xLTQuNyA4LjUtMS41IDEyLjQtNC4xek0xMDIyLjUgNDU1LjhjMS44LS4xIDMuMSAyLjcgMy44IDQgMi43IDUuMiAyLjkgMTEuOC0uMiAxNi45LTEgLjgtLjEtNi4yLS4yLTcuNS0uNC00LjEtNC05LjQtMy40LTEzLjR6TTgxNi4zIDQ1OWMxLjQgLjYgMS42IDQuNyAxLjcgNiAuMyA2LjIgMi43IDEyLjQgNCAxOC41IDQgMTguMSAxMyAzOC42IDI1LjMgNTIuNSAyLjcgMS4zIC43LTQuOCAuNS01LjgtMS4zLTUuOS0yLjctMTIuMS0yLjgtMTguMi0uMy0xNy44IC4yLTM1LjIgNC4yLTUyLjYgLjktMS4zIC42IDMuMiAuNSAzLjgtLjggMy4xLS4zIDYuMy0xIDkuNS0yLjEgOC45IC4zIDE3LjkgLjMgMjYuOCAuMSAxOS43IDcuNiA0MS4xIDIwLjMgNTYuMiA0LjMgNSAxMS40IDguNCAxNy4zIDExLjEgMS42IDEuNS0yLjkgMS4yLTMuNiAxLjItMy44IDAtNy4zIDAtMTEtMS0xMC4zLTIuOC0xOC40LTguOC0yNS44LTE2LjItMTcuMi0xNy4yLTI1LjQtNDIuNS0yOC4zLTY2LjItLjYtNS4yLS40LTEwLjQtMS0xNS41LS40LTMuMy0xLjctNi43LS42LTEwLjF6TTgxMC4zIDQ2NGMxLjggLjkgLjcgOS42IC43IDExLjUgLjEgMTAuNCAyLjQgMjIuMiA1LjMgMzIuMiA4LjYgMjkuMiAyNS4xIDU0LjEgNTAuNSA3MSAxMy43IDkuMiAzMSAxNS41IDQ3LjQgMTAuNyAyLjQgLjItNC40IDQuNS01LjUgNS4zLTMuMyAyLjItOC40IDMuNy0xMi4zIDQuMi02LjggLjgtMTUuMS0xLjEtMjEuMS00LjItNC42LTIuMi04LjUtNS42LTEzLjUtNy4yLTMuNiAuMyAzIDUuOCA0LjIgNi41IDQuMSAyLjQgNy44IDYuNSAxMS4yIDkuOCA0LjUgNC40IDEwLjEgNy45IDE0LjYgMTIuNCAxMS41IDExLjYgMjAuNiAyNC45IDI4IDM5LjUgNCA4LjEgNy44IDE2LjIgOS4zIDI1LjIgLjkgNS45IDMuMSAxMiAyLjggMTgtMS4xIDMuOC0zLjUtNS40LTQuMi02LjYtMy41LTUuMS03LjEtOS43LTExLjItMTQuMy0xMS42LTEzLTI2LjktMTguOC00MS41LTI3LjUtOC41LTUtMTcuOS04LjctMjUuNy0xNC44LTYuMS00LjgtMTEuNi0xMC4zLTE3LjEtMTUuOS03LjktOC4xLTEzLjItMjAuOS0xNi41LTMxLjUtNy42LTIzLjctMTAuNy00Ni45LTEwLjctNzEuOCAwLTExLjYgMS4xLTIyLjYgMS45LTM0LjEgLjUtNS43IC45LTEzLjEgMy40LTE4LjR6TTg1Ny4zIDQ2OWMxLjIgLjYgMS42IDYuMSAxLjggNy40IDEgNS45IDMuOCAxMi40IDYuNCAxNy42IDguOSAxNy44IDIwLjIgMzAuMyAzNi4yIDQxLjggMS4yIDEuNi02LjgtMS45LTcuOC0yLjQtNS42LTIuOS0xMC4zLTYuNi0xNC44LTEwLjgtMTAuNS05LjctMTYuNy0yMS42LTIwLjQtMzUuMi0xLjUtNS41LTMuMS0xMi44LTEuNC0xOC40ek05MTcuNSA0NzAuOGMxLjYgMCAyLjggMyAzLjUgNC4yIDIuMiAzLjggNS4yIDYuNyA4LjMgOS44IDkuMiA5LjUgMjMuMiAxNC40IDM2IDExIDMuNi0uNC0yLjkgNC41LTMuOCA0LjktNC4zIDIuMi05LjMgMi45LTE0LjEgMi4xLTExLTEuNy0yMC44LTEzLjMtMjUuNi0yMi41LTEuMy0yLjMtNC42LTYuOS00LjMtOS41ek02NzkuMiA0ODkuOWMxLjUgLjgtMS4xIDUuMi0xLjUgNi4zLTIuMyA2LjMtNC4zIDEyLjYtNi42IDE4LjktOS44IDI3LjMtMTcuMSA1NS44LTI1LjYgODMuNiAuNSAyLjEgMy4zLS45IDQtMS43IDMuNS00IDYuOS04IDEwLjctMTEuOCAxMC44LTEwLjggMTguNy0yNC4xIDI5LjMtMzUuMSAuOC0uNi0zLjUgNy44LTQuOCA5LjYtNC42IDYuMS05LjggMTIuNy0xMy43IDE5LjMtNSA4LjUtMTIuNiAxNS43LTE4LjcgMjMuM3MtMTMgMTQuOC0yMC4xIDIxLjljLTIuOSAyLjktNS42IDYuNS05IDguOC0xLjggLjUgLjQtMy40IC43LTQuMSAxLjUtMy45IDQtNy40IDUuMS0xMS40IDEuNy01LjggNC44LTExLjIgNy4yLTE2LjhzMy41LTEwLjUgNS4zLTE1LjdjNy44LTIyLjkgMTUuNi00NS43IDI1LTY4IDIuNi02LjQgNS4yLTEyLjYgOC4zLTE4LjcgMS4zLTIuNyAyLjQtNi4zIDQuNC04LjR6TTEwMzYuMyA0OTBjMS4xIC41IC43IDMgLjcgNCAwIDQuMy0uNiA4LjMtLjkgMTIuNS0xLjIgMTQuMS03LjYgMjctMTUuNCAzOC41LTIuNSAzLjctNSA3LjktOC40IDEwLjktMS44IC44LS42LTIuNS0uNC0zLjMgMS00LjggMi4xLTkuNSAyLjEtMTQuNCAwLTcuMSAuMS0xNC4yLTEuMy0yMS4yLS43LTMuMy0yLjYtNy0yLjQtMTAuNSAxLjQtMi44IDMuNyAzLjQgNC4zIDQuNiAzLjIgNi41IDQuMSAxMy4zIDYuOCAxOS44IDEuNyAuOSA0LjktNy41IDUuNS05LjEgMi40LTYuNiA1LTEzLjMgNi44LTIwLjIgLjktMy44IC45LTguMSAyLjYtMTEuNnpNODgwLjMgNDk0YzEuNyAuNSAyLjUgNi4yIDIuOSA3LjcgMS41IDYuNyA0LjggMTIuNyA4LjIgMTguNSAuNCAyLjctNC45LTUuMi01LjUtNi4zLTIuNi00LjctNy4zLTE0LjQtNS42LTE5Ljl6TTc5OC4zIDUyMWMxLjEgLjUgLjcgMyAuNyA0IDAgNC43IDEgOS4yIDEgMTMuOSAwIDIuOSAxIDYuNiAuNiA5LjMtLjMgMi4xLTEuOSA0LjEtMi44IDYtMi45IDYuNi02LjEgMTIuMi0xMC40IDE4LTEuNiAyLjMtMy43IDUuOC02LjMgNy0xLjcgLjctNS4zLS4yLTcuMi0uMy0yLjUtMS0uNS0zLjEgLjUtNC43IDMuMy00LjkgNi0xMCA4LjctMTUuMyA0LTguMSA4LTE2LjIgMTEtMjQuOCAxLjUtNC4zIDIuMi05IDQuMi0xMy4xek0xMjA5LjUgNTMwLjJjMS40IC45LTYuMyAyLjktNy41IDMuMy01LjEgMS43LTEwIDMuNS0xNC45IDUuOS0xNS4zIDcuNy0yNy44IDE2LjgtMzguMiAzMC40LTEuMyAuNyAxLjgtNi41IDIuMi03LjQgMS42LTQuNyA2LjMtMTAuNiAxMC0xNCAxMi40LTExLjUgMzEtMjAuNiA0OC40LTE4LjJ6TTk1Mi45IDUzMy40YzMuNi0xLjQgOCAuMSAxMS42IC44IDEuNSAxIDEuNiAyLjEgLjMgMy40LTEuOCAuNC0xMi4xLTItMTEuOS00LjJ6TTk1Ny4zIDU0MS4yYzMuMyAxLjQtNC4xIDQuMi01LjUgNC42LTcuMiAxLjgtMTQuNSAuOS0yMS44IDEuNS0yLTEuMyAyLjctNSA0LjEtNS4yIDMuMi0uNiA2LjEtMi4xIDkuMi0yLjcgNC4yLS43IDkuNyAxLjMgMTQgMS44ek05NjIuMiA1NDYuNWMxLjggLjIgMS43IDEuNSAxLjIgMi45LTEuNCAxLjYtMy43IDIuMy01IDMuOS02LjQgNy42LTExLjUgMTQuNi0yMi45IDEwLjQtMy0xLjItNC4xLTMuNS02LjItNS42LTEuMS0xLTQuNC0uOS01LjgtMS4zLTMtMS45IDIuNC00LjcgNC4yLTQuNyAzLS4xIDMuMyAxLjkgNS40IDMuNHM1LjEgMi41IDggMi41YzkuNyAuMSAxMi41LTguOCAyMS4xLTExLjV6TTEyODEuNyA1OTcuOWMtLjEgLjQgMCAxLjItLjQgMS4ycy0xLjYtMi42LTEuOS0zLjJjLTEuNC0yLjYtMy01LTQuNy03LjQtNC44LTYuOC0xMC43LTE0LjktMTcuNy0xOS44LTQuOS0zLjQtMTAtNy41LTE1LjQtOS45LTE5LjktOS00MS44LTkuNi02Mi42LTMuNC0yLjkgLjQgMS4xLTEuOCAxLjgtMi4xIDMuNi0xLjUgNy4zLTIuOSAxMS00IDEwLjMtMyAyMC41LTMuNiAzMS4yLTMuMyA0LjcgLjIgOS44IDIuMiAxNC4zIDMuNyAyMS4yIDYuNyAzOS4zIDI2LjQgNDQuNCA0OC4yek02MzAuNCA1NjcuOWMxLjgtLjIgMi40IDQuOSAyLjkgNi4zIDIuOSA4LjItLjEgMTQuNi0yLjYgMjIuNC0zIDkuMS03IDE3LjktMTAuOSAyNi42LTMuMSA3LTUuNyAxNC45LTEwLjEgMjEuMy00LjggNy0xNC41IDE0LjUtMjEuOCAxOC42LTIuNyAuOCAzLjItOS40IDQuMi0xMS4yIDMuNy02LjkgNy0xNCAxMC41LTIxIDcuNC0xNC44IDE0LjYtMjkuNyAyMC45LTQ1IDIuNC01LjggMy45LTEyLjUgNi45LTE4ek03NjYuMiA1NzQuNGMyLjEgLjItMS43IDUuNS0yLjggNi41LTIuNiAyLjUtOS4yIDMuNi0xMi43IDUuNC03LjcgMy45LTE2LjEgOS0yMi41IDE0LjktMyAyLjgtNS42IDYuNS05IDguOC0yLjUgLjctNS01LjItNi40LTYuOC0yLjktMy4xLTUuNy02LjMtOC42LTkuNHMtNC4zLTYuNy04LjMtOC4xLTEwLjggNS43LTEzLjEgOC4xYy03LjkgOC0xNC44IDE2LjMtMjAuNSAyNi0yLjYgNC41LTMuNyAxMC02LjYgMTQuMi0xLjQgLjUtMS41LTEuNS0xLjgtMi41LS44LTMuNC0yLjQtNi40LTYuMS03LjItMi44IC40LTQuNCAzLjktNS4xIDYuNC0xLjkgNi4zLTMuMiAxMi4zLTMuOCAxOC44LTEuNSAxOC44IC43IDM2LjQgMy4yIDU1IDEgNy41IDUuOCAxNS4xIDUuOSAyMi42IC4xIDkuNC00LjggMTguNi05LjkgMjYuMS0yLjkgNC4yLTUuNCA4LjUtOC41IDEyLjUtNyA5LjItMTYuOCAxNi40LTI0LjEgMjUuNC04LjkgMTAuNy0xNC42IDI0LjQtMjMuOCAzNC43LTUuMSA1LjgtOC41IDQuNC0xNS43IDUuM3MtMTMuNyAxLjEtMjAuNSAyYy0xOS40IDIuNi0zOS4xIDMuNy01OC41IDYtMTMuNiAxLjYtMjcuMSA0LTQwLjggNS44LTEwLjYgMS40LTIyIDQtMzEuNiA4LjktNiAyLjktMTEuNSA2LjktMTMuMyAxMy43LTIuMiA4LjkgMS42IDIwLjQgNS42IDI4LjMgMS40IDIuOSAzLjcgNS4yIDQuNCA4LjQtLjkgMy40LTguNCA2LjktMTEuMiA5LjEtOC43IDcuMS0xOC43IDE0LTIzLjQgMjQuNi00LjEgOS0xIDE5LjYgMy4yIDI4IDkuNiAxOS4yIDI4LjYgMzQuNCA0Ny42IDQzLjkgNi43IDMuMyAxNi44IDUuNSAyMi41IDEwLjIgLjUgMS40LTEuMSAyLjctMS45IDMuOS0yIDMuMi01LjMgNS45LTggOC40LTcuOCA3LjUtMTQuNyAxNi42LTIxLjcgMjQuOC00LjQgNS4xLTcuMSAxMS4zLTE0LjUgMTAuOC0yLjctLjkgNi4xLTkuNSA3LjQtMTEuNCA4LjgtMTEuOSAyMC40LTIxLjYgMjkuNi0zMy4yIDEtMi4yLTIuOS0zLjQtNC41LTQtNy0yLjctMTMuNC02LjQtMTkuOS0xMC4xLTE1LjYtOC43LTI5LjYtMjAuOC0zOS4yLTM1LjgtMTEuNi0xOC40LTkuOC0zOS4xIDUuOC01NC4xIDMuOC0zLjYgNy42LTcuNyAxMS45LTEwLjYgMi0xLjQgNi4yLTMuOSA2LjUtNi42IC42LTQuOC0zLjItOS45LTQuOS0xNC4xLTQuMS0xMC41LTQuOC0yMi44IDIuOC0zMS45IDguNC0xMC4xIDI1LjMtMTMgMzcuMy0xNS4zIDE5LjgtMy43IDM5LjYtNS41IDU5LjYtNy45IDExLTEuMyAyMi41LTMuNCAzMy42LTMuOSA4LjEtLjMgMTYuMS0xLjkgMjQuMS0yLjkgNi0uNyAxNC40LS44IDE5LjYtNC40IDEuOC0xLjQgMy40LTMuOSA0LjgtNS43IDguOC0xMC44IDE2LjMtMjIuNSAyNS44LTMyLjcgMTIuNy0xMy42IDMwLTI3IDM1LjQtNDUuNiA0LTEzLjYtMi44LTI1LjktNC41LTM5LjItMi4xLTE2LjEtMi41LTMxLjgtMS4yLTQ4IC42LTcuNCAyLjMtMTMuOCA0LjctMjAuOCAxLjQtMy44IDIuOC04IDYuNy05LjkgMy4yLTEuNiA1LjYgLjkgOC43IC41IDUuMi0zLjQgOS0xMi4xIDEyLjUtMTcuMiA0LjMtNi4yIDEwLjktMTEuNiAxNi41LTE2LjYgMi4yLTIgOS4xLTguNyAxMi4yLThzNi4yIDQuMiA4LjMgNi41YzUgNS41IDkuNiAxMS4yIDE0LjQgMTYuOSAxLjUgLjcgMi42LS45IDMuNi0xLjkgMi4zLTIuMSA1LjMtMy44IDcuOC01LjcgMTAuOC03LjkgMjMuOS0xNi4xIDM2LjktMTkuOXpNODAzLjIgNTc0LjVjMiAuMiAyLjMgMi4zIDIuOCA0IDEuMyA0LjUgMi43IDguOSA0LjMgMTMuNC0uMiAxLjYtNi44LTMuMS03LjgtMy45LTMuOS0zLjEtOC43LTQuMS0xMy4yLTYuMS0xLjEtMS4yIDEtMi42IDItMy4xIDMuNS0yIDgtMy4zIDExLjktNC4zek04NDkuOCA2NjVjMS42IC44IDIgMCAxLjgtMS42LTIuMi01LjctNy4zLTEwLjEtOC45LTE2LjEgMC0xIDQuOCAzLjIgNS45IDQgMy45IDMgNy41IDYuNSAxMS43IDkuM3MxMS40IDMuNCAxNCA2LjljMS40IDEuOSAyIDUuNiAyLjcgNy45IDIuMSA3LjEgMyAxNCA0LjIgMjEuMyAuNCAyLjYgMi4xIDcuMyAxLjMgOS44cy00IDMuNi01LjQgNC45Yy01LjMgNC44LTEwLjUgOS40LTE2IDE0LTE2IDEzLjMtMzQuMSAyMy42LTUyLjYgMzIuOC05LjYgNC45LTE5LjUgMTAuNS0yOS45IDEzLjQtMi4yLS4zIDEuOC0zLjYgMi41LTQuMiAzLjktMy43IDYuOS04IDEwLjgtMTEuNyA4LjYtOC4yIDE2LjctMTcuNyAyNC0yNyAyLjUtMy4xIDYuMy03LjQgNS44LTExLjYtMi00LjEtOC45LS43LTEyLjMgMC0xMyAyLjgtMjMuMiAxMC4yLTM1LjEgMTUuNC0uOS0uMiAyLjMtNi40IDIuOC03LjYgMi4zLTUuMyA0LjMtMTAuOSA1LjktMTYuNSAyLjUtOC41IDUtMTcuNyA1LTI2LjUgMC0zLjkgLjMtOC0yLjQtMTEuMXMtNy41LTEuNC0xMC44LS45Yy04LjggMS40LTE4LjUgNS4yLTI2LjIgOS42LTItLjItLjYtNC4yLS42LTUuNiAuMS01LjQtLjEtMTAuOS0xLjktMTYuMS01LjItMTUuNS0xNC42LTI3LjYtMjMuNC00MC45LS41LTIuNCAxLjQtMy4zIDIuOC00LjkgMy4yLTMuNiA3LjMtNy4xIDExLjMtOS43IDE1LjktMTAuNyAzNC41LTIyLjkgNTQuNC0xMy41IDguMSAzLjcgMTcuNCA4LjggMjMuNiAxNS40IDMuMiAzLjQgNC4xIDguOSA2LjcgMTIuNyAxLjUgMi4xIDMuNiAzLjQgNC43IDUuOHMxLjQgNS41IDIuMyA4LjJjNC4xIDExLjYgMTEuMSAyNi45IDIxLjMgMzQuMXpNNjk0LjIgNTkxLjdjMi4zIC4xIDQuNSAzLjUgNiA1LjEgNC45IDUuMiA4LjIgMTEuOCAxMyAxNyAxMC44IDExLjYgMjEuMyAyNy42IDI2LjEgNDIuOSAyIDYuMSAzLjkgMTIuOSAyLjQgMTkuNHMtNi40IDExLjMtMTAuMSAxNi45Yy0yLjEgMy4yLTEuNCA3LjMtMyAxMC41LS45IDEuNy0yLjUgMi4zLTMuMSA0LjIgLjIgMy4zIDMuNiAuNSA1LjUgLjUgNSAuMSA4LjUgMy4xIDE0LjEgMi4xIDMgLjcgMS45IDUuMyAxLjIgNy40LTIuMyA2LjYtOC40IDExLjYtOS45IDE4LjQgLjYgMy4yIDQuNiAxIDYuNiAuNCA2LjItMS44IDExLjYtNC45IDE3LjEtOC4zIDExLjItNy4xIDE1LjQtMjUuOSAxMS40LTM4LjItMi42LTIuMi03LS43LTEwLS4xLTkuOSAyLjItMTcuMiA2LjktMjYuMSAxMS4yLTIuMyAuMi0uMi00LjcgLjQtNS44IDEuNS0yLjkgNi4zLTUuNiA5LjItNy4zIDkuOC01LjggMjIuOC0xMy4zIDM0LjgtMTIuOSAyLjUgLjggMi4yIDMgMi4yIDUuMyAwIDUuMS0uNCAxMC0xLjYgMTQuOS0yLjUgOS42LTQuMyAxOS44LTguNyAyOC44cy0xMS40IDE4LTE0LjIgMjcuNWMuOCAyLjYgMy40LS4xIDQuNS0xIDQuMS0zLjggNy41LTguOCAxMi4yLTExLjggMTIuMS03LjkgMjUuNC0xMy42IDM5LjMtMTcuMyAyIC4yLTMuNCA0LjktNC4xIDUuOC0zLjEgNC4xLTYuOSA5LjYtMTEuMSAxMi43LTEuOCAuNiAwLTMuNCAuMi00LjItLjMtMy01LjUtLjMtNy4xIC41LTcgMy40LTEzLjggNi45LTIwLjIgMTEuMi0uNiAuOC0xLjEgMS42IC4xIDIuMSA0IDIgOS42IDEuMiAxMC40IDcuMi0xLjUgNS41LTkuOCAxMi4yLTE0LjMgMTUuNXMtNy4xIDguOC0xMS43IDEyLjMtMTEuNSA2LjctMTUuMyAxMS43Yy05LjQgMTIuNC01LjEgMzEuNS05LjkgNDUuNi0yLjEgNi4yLTYuNyAxMS4yLTExLjQgMTUuNS01LjUgNS4xLTExLjEgMTAuNC0xOC4xIDEzLjQtMTIuMiA1LjItMjYuNiA0LjYtMzkuNSAzLTEuOC0xIDUuNC03LjMgNi42LTguNSA3LjktNy42IDE3LTE0IDI0LjctMjEuNyAxLjctMi45LTUuNi0uNS02LjctLjEtNS44IDIuMi0xMS4zIDYuOS0xNiAxMC45LTEwIDguMy0yMy4zIDIxLTIyLjggMzUuMyAuMSA1LjEgMi41IDguNCA1IDEyLjQtLjEgMi4xLTIuOSAyLjctNC40IDMuNi00LjIgMi4xLTguMiA0LjItMTIuNyA1LjMtMjIuMyA1LjUtMzYuNS0xMS45LTU2LTE4LjMtMS0xLjIgMS44LTMuMyAyLjgtNCA0LjktMy40IDEwLjMtNi45IDE0LjYtMTAuOCA2LjQtNS43IDEzLjktMTAuMiAyMC0xNnMxMS42LTExLjQgMTcuMi0xNy4yYzEuOS0zLjItNS41IDEuMS02LjMgMS42LTUuOCA0LjEtMTEuOCA4LjMtMTcuNyAxMi4zLTE1LjUgMTAuNC0zMi41IDIwLjYtNDYuNyAzMi44LTEyLjkgMTEtMTQuNCAyNy40LTEwLjcgNDMuNCAyIDguNSA2LjYgMjIuNi01IDI1LjktMTYuNCA0LjctMzEuOS0xMS40LTQyLjUtMjEuMy0xNC0xMy4yLTIxLjgtMzAuOS0zNC4yLTQ1LjMtOS4xLTEwLjMtMjAuOC0xOC44LTM0LTIzLTQuMS0xLjMtOS4xLTIuOC0xMy40LTMuMS0xMy43LS43LTEwIDE2LTQuOSAyMy44IDEzLjIgMjAgMzQuMSA0MC43IDYwLjQgMzUuOCAxLjIgLjItLjUgMS42LS45IDItMiAxLjktNC40IDUuNi03LjMgNi4yLTYuOCAxLjQtMTYuNi0yLjMtMjIuNi01LjUtMTYuOS05LTI4LjMtMjIuNy0zNi44LTM5LjctMy41LTcuMS03LTE4LjItMi40LTI1LjQgMi43LTQuMiA2LjgtNS4yIDExLTcgMTAuNS00LjYgMjIuNS02LjggMzMuNy04LjMgMzAuOS00LjQgNjEuOC03LjUgOTIuNy0xMC44IDEwLjUtMS4xIDIxLTEuOCAzMS41LTMgNi40LS44IDEzLjYtMSAxOS4xLTQuNyAxLjQtMi4xLTcuOC0xLjEtOS4xLS45LTIuNC0uMy0uMS0zLjEgLjctNC4yIDIuNi0zLjUgNC43LTcuMiA3LjMtMTAuNyAzLjYtNSA2LjUtMTAuNSA5LjktMTUuNiA2LjUtOS40IDE1LjgtMTcuNCAyMy43LTI1LjggMi4xLTEuNC0zLjcgOC44LTQuNiAxMC42LTMuOCA3LjItOS40IDE0LjgtOS43IDIzLjMtLjEgMi45LS40IDYuNCAyLjEgOC40IDYgNSAxOC42IDIuNSAyNiAyLjUgMjIuMiAwIDUwIDMuMSA2Ny43LTEzLjMgMS43LTEuNSAzLjMtNC4xIDQuNC02IDEwLjYtMTktMTYuNi0zMS4yLTMxLjgtMzEuNy00LjQtLjEtOS0uMS0xMy40IDAtMi4yIC4xLTQuMSAxLTYuMiAuNi0yLjQtMS43LTIuMi01LjktMy40LTguNi0yLjMtNS41LTcuMS03LjYtMTIuNy04LjEtMi4yLS45IC4zLTMuNCAxLTQuOCAyLjMtNC43IDMuNS05LjYgNC42LTE0LjggMS0xLjIgMS43LS42IDIuOSAwIDMuMS0uNSAzLjgtOS4zIDMuOC0xMS44IDAtMy4yIDEuMi02LjQgLjktOS40LS41LTUtMi43LTEwLTUuNS0xNC4xLTEuNC0yLjEtMy40LTQuOS01LjQtNi41cy00LTEuOS00LjgtNC4yYy0uMS0zLjQgMi45LTIuMyA0LjUtNS4xczEuNC03LjIgMS4zLTEwLjdjLS4zLTctNC41LTExLjMtNi42LTE3LjQtMS0yLjcgLjItNS4xIC41LTcuNyAuNi00LjYgMS05LjMgMi45LTEzLjYgMS44LTIuNyAyLjIgMS41IDIuNSAyLjkgMS4xIDQuMiAxLjMgOC43IDQuMiAxMi4yIDIuMyAxLjQgMi43LTIuMiAzLjItMy43IDIuMi02IDMuOS0xMS41IDYuOC0xNy4yIDYuMy0xMi41IDE3LjgtMjYuOCAyOS43LTM0LjN6TTk3NC41IDU5MS44YzEuNyAwIDIuNiAzLjIgMy4yIDQuNCAyLjggNS4yIDYuOCA5LjIgMTAuMSAxMy45IDkuNCAxMy4zIDI1LjQgMjEuMSAzOS42IDI3LjcgMS45IDEuNS0yLjQgMS4yLTMuMiAxLjItMy4zIDAtNi4yLS42LTkuNC0xLjEtOC44LTEuNC0yMC41LTYuNi0yNi4xLTEzLjggMC0uOCAzLjUgMS40IDQuMSAxLjcgMi42IDEuMyA1LjMgMi45IDggMy44IDIuNyAuMSAuMS0yLjQtLjktMy4yLTIuNy0yLjItNS4zLTQuNS03LjktNy02LTUuNC05LjktMTIuMy0xMy44LTE5LjEtMS4yLTIuMy00LTUuNy0zLjctOC41ek04ODcuOCA2MDQuNWM2LjItLjkgMTIuOSA2LjUgMTcuMiAxMCAxNC4yIDExLjMgMjQuNiAyNi44IDI5IDQ0LjcgMS4zIDUuNCAzLjggMTEuOSAyLjcgMTcuNS0uNyAuNy0xLjItMS42LTEuNS0yLjItMS4yLTIuOC0yLjMtNS43LTMuNi04LjQtMy40LTctNi4yLTE0LjUtMTAuNC0yMS4yLTYuOS0xMS4xLTE0LjEtMjEuNS0yMy40LTMwLjctMi4yLTIuMi00LjQtNC43LTYuOC02LjctMS0uNy0zLjItMS42LTMuMi0zek03MjIuNyA2NzYuNmMxLjcgLjMgMi44IC4xIDMuOS0xLjMgMS42LTUuOS0uNC0xMi4yLTIuMy0xNy44LTQuMS0xMi4yLTEwLjItMjIuOC0xNy41LTMzLjQtMi42LTMuOS02LjEtMTEuMS0xMC45LTEyLjUtMy4yIC41LTIuMiAzLjQtMS42IDUuNiAxLjMgNC43IDIuMyAxMC40IDIuNiAxNS4zczEuMiAxMC4yIDEuMSAxNS40YzAgMi4zLTEuNSA1LjQtLjYgNy42IDEuNyAzLjkgOS42IDIuNCAxMy4xIDQuOCA1LjkgNC4xIDYuNiAxMi4zIDEyLjIgMTYuM3pNNjgzLjcgNjE0LjFjLTEuMy0zLjgtNi4zIDMtNy43IDQuNS00LjcgNS4yLTExLjQgMTMuNC0xMi43IDIwLjQtLjYgMy4zIDEuNCA4LjQgNC43IDkuNiAzLjYtLjEgNC4xLTQuOSA1LjQtNy41IDQtOCA5LjgtMTcuOSAxMC4zLTI3ek0xMjkzLjMgNjIzYzEuMSAuNSAxLjUgMy42IDEuNiA0LjYgLjYgNC43IDEuMSA5LjEgMS4xIDEzLjkgMCAxNS45LTQuNCAzMS4xLTEyLjIgNDQuOC0yLjEgMy43LTQgOC4xLTYuOSAxMS4yLTEuNyAxLjktMi43IDQuMi00LjMgNi4yLTYuMyA4LjMtMTQuMyAxNi0yMS45IDIzLjEtMjcuMSAyNS40LTYzLjggNDEuNy05OS41IDUwLjYtMTEuNyAyLjktMjUuNSA2LjctMzcuNiA1LjQtMS0uNCA4LjQtMS44IDkuOC0yLjEgNi43LTEuNiAxMy42LTIuMyAyMC4yLTMuOCAxOS40LTQuMyAzOS43LTEzLjEgNTctMjIuNyAyMi40LTEyLjQgNDIuOS0yNy40IDYwLjYtNDUuOSAxMS45LTEyLjYgMjMtMjYuNyAyOC40LTQzLjYgMi43LTguMyA0LjQtMTcgNC40LTI1LjcgMC00LjctMi4xLTExLjYtLjctMTZ6TTcwMC40IDYyMy45YzIuMy0uMyA0LjYgNi4zIDUuNyA3LjkgNiA5LjIgMTEuMyAxOS43IDE0LjQgMzAuMyAuMSAyLjQtMy45LTMtNS0zLjgtMy43LTIuNy04LjItMy43LTExLjktNi4xLTIuNS01LjUtLjYtMTQtMi4xLTIwLjItLjYtMi4zLTEuOC01LjktMS4xLTguMXpNOTY2LjUgNjI2LjhjMS40LS4xIDIuNiAxLjcgMy43IDIuNSAzLjIgMi4xIDYuMSA1IDkgNy41IDYgNS4xIDEzLjcgOC42IDIwLjcgMTIuMSA0LjEgMiA5IDQuMyAxMy42IDMuOSAxLjMtLjgtMy44LTQuNi00LjYtNS45LS44LTIuMiA3LjEgNC40IDguNiA1LjQgNiA0LjMgMTIuOSA2LjggMTkuMiAxMC42IDEgMS4xLTYuMSAuMS03LjMgMC01LS44LTEwLjYtMi40LTE1LjQtNC4xLTE0LjMtNS0yNy41LTEyLjQtMzguNi0yMi44LTIuMi0yLTkuMS01LjctOC45LTkuMnpNNjgxLjUgNjM3LjhjMi4yLS4zIDEuNSA0LjkgMS41IDYuMyAwIDYuNC0xLjEgMTMuNy01LjIgMTguOC0yLjYgMS42LTEuOC01LjQtMS44LTYuNyAuMS02LjEgMi40LTEzLjIgNS41LTE4LjR6TTg0My41IDYzOC44YzEuNy0uMSA0LjkgMy4zIDYuMyA0LjMgNS4xIDMuNiAxMC41IDYuNSAxNi4xIDkuMyAyLjUgMS4zIDYgMi4yIDYuOSA1IC4xIDEuNiAuMiAzLTEuNyAzLjEtNy45LTIuOS0xNi05LjUtMjIuMS0xNS0xLjYtMS40LTUuNi00LjQtNS41LTYuN3pNNjg1LjQgNjMwLjJjLTMuMy0zLjEtNy44IDUuOS04LjcgOC4zLTMuNyA5LjctOCAyMi4yLTIuOCAzMi4yIDMuMyAzLjIgOS01LjYgMTAuMy04IDMuOS02LjkgMy4xLTEzLjQgMi44LTIwLjctLjEtNC0uMS03LjktMS42LTExLjh6TTY2My4xIDY1OC44YzEuNSAuOCAxLjYgMy4yIDIgNC43IC44IDMuOSAxIDcuOCAxLjYgMTEuNy0uNiAyLjktMi45LTIuNS0zLjQtMy40LTEuNy0zLjUtMy45LTkuOS0uMi0xM3pNODc4LjUgNjU5LjhjMi0uMyA0LjggMS44IDYuNSAyLjdzNS44IDIuNCA3LjMgNC42YzQuMyA2LjctMy4xIDE0LjgtNS4yIDIxLjEtMS4xIDIuMS0yLjgtOC4yLTMuMi05LjgtMS4xLTUuMi02LjItMTMuNC01LjQtMTguNnpNNjQzLjQgNjYxLjljMS41LS4yIDEuNiAxLjcgMS45IDIuOCAxLjQgNCAyIDcuMyAxLjUgMTEuNi0xLjMgMy0yLjYtMS41LTIuOC0yLjgtLjgtMy41LTEuOS04LS42LTExLjZ6TTcwMy41IDY3MC41YzIuNiAyLjIgMSA1LjctMS4zIDcuNi00LjUgMy43LTEwLjYgNy41LTE2LjQgOC42LTIuOS0uNiAxLjYtNS44IDIuNS03IDMuNS01LjEgOC4xLTExLjMgMTUuMi05LjJ6TTk3Mi40IDY3MmMxLjcgLjQgMi45IDUuMiAzLjkgNi43IDQuOCA2LjggOSAxNC4xIDEzLjMgMjEuMyAxMC4zIDE3LjIgMjQuNiAzNC4xIDM5LjUgNDcuNiA0LjcgNC4zIDEwLjIgNy42IDE0LjggMTIgLjkgMS44LTgtMS44LTkuMy0yLjQtNi4yLTIuNy0xMi43LTQuOS0xOC41LTguNS0xNy4zLTEwLjYtMzUuNS0yMC40LTQ4LjQtMzYuNiAwLS42IDQgMi40IDQuNiAyLjkgMyAyLjUgNS44IDUuMiA4LjkgNy42IDguNiA2LjQgMTcuOSAxMS41IDI3LjcgMTUuNyAzLjIgLjgtMS00LjEtMS42LTUtMy4zLTQuNi03LjQtOC43LTEwLjUtMTMuNS03LjMtMTEuMS0xMy42LTIyLjYtMTkuNi0zNC41LTEuNS0zLjItNS43LTkuNy00LjgtMTMuM3pNNjY3LjIgNjgyLjRjMy42IC45IDMtNC45IDMuNS03LjQgMS4xLTUuMi0uNy0xNy45LTUuMS0yMS41LTUuMi0xLjUtNy40IDUuMy03LjYgOS41LS4zIDguMSAyLjIgMTQuNyA5LjIgMTkuNHpNNjc3LjUgNjkyLjdjLjMgNCA3LjgtLjcgOS44LTEuNCA3LjItMi40IDIxLjMtNy42IDIyLjYtMTYuNCAxLjQtMTAuMS04LjktMTEuNS0xNS45LTcuNC04LjggNS4yLTE0LjMgMTUuNS0xNi41IDI1LjJ6TTg5NS4yIDY4MS45YzEuNCAuOCAxLjYgNS45IDEuOSA3LjUgMSA2LjQgMS43IDEzIDMuMiAxOS4zIDMuOSAxNiA3LjMgMzEuOSAxMi40IDQ3LjYgMi42IDguNCA2LjQgMTkuNSAxNC4xIDI0LjcgMS44IC41LS41LTMuNC0uOC00LTItNC00LjEtOC01LjUtMTIuMiAuMS0yLjkgMy4xIDMuNSAzLjUgNC4yIDIgNCA0LjggNy4yIDcgMTEgNiAxMC4yIDE1LjkgMTcuMSAyMy45IDI1LjUgMS4yIDIuMS01LjEtLjUtNi4xLS43LTMuNS0uNCAxLjYgMy45IDIuNSA0LjUgNC44IDMuMyA5LjUgNi42IDE0LjcgOS4yIDE0LjQgNy4zIDM0LjkgMTQuOCAzNy43IDMyLjYtLjYgMi43LTQuNCAuMy02LjMgLjEtLjggLjEtMi4yIC4yLTEuOCAxLjUgLjYgMi4xIDMuNiAzLjYgNC45IDUuNCAyLjkgNC4xIDYuMSA4LjYgNy41IDEzLjUgMi44IDkuMyA1LjcgMTguNiA2IDI4LjUgLjIgNi45LTEuMiAxMy42LTIuMSAyMC40LTUuNiA0MS00Ny43IDgwLjctOTAuNiA2OC4xLTExLjUtMy4zLTIzLjUtMTAuNy0zMi4xLTE4LjktNi4xLTUuOC0xMS41LTEyLjYtMTcuNy0xOC0yLjQtLjEgMS4xIDUuNCAxLjYgNi40IDMuNCA2LjkgOS4yIDExLjcgMTMuMiAxOCAuMSAxLjgtMS44IDMuNi0yLjkgNS0zLjIgNC4yLTYuOCA4LjUtOS41IDEzLTUuNiA5LjItMTAuOCAxOS0xNy4zIDI3LjctNy4xIDkuNS0xNSAxNy45LTIxLjQgMjguMS0zLjIgNS01LjggMTIuOS0xMCAxNy0xLjYgMS43LTYuNyAxLjctOC4zIC4xcy0xLjctMy42LTIuMi01LjRjLTEuNC00LjctMi44LTkuNC0zLjgtMTQuMi0yLTkuNC00LjEtMjAuMi0yLjgtMzBzNS45LTE5LjMgOS4xLTI4LjRjNC4yLTExLjkgOC45LTI0IDExLjctMzYuM3M0LjctMjUuMSAxMC40LTM2LjJjMi4xLTQuMyA1LjUtNy40IDkuNy05LjhzOS4xLTMuMyAxMS4yLTguMmMxLjItMi42IC42LTUuNCAxLTguMSAuOS02LjggMy4xLTEzLjcgNS4yLTIwLjIgMy05IDcuOS0xNy4xIDExLjgtMjUuNyA1LjctMTIuNSAxMS40LTI1LjIgMTktMzYuNSAxLTMuNi01LjktLjMtNyAxLTQuNCA1LjUtNy40IDE0LjUtMTAuNiAyMC45LTkuMiAxOC40LTIxIDM4LjEtMjMuNSA1OS0uMyAyLjcgLjMgNS41LTEgOC0yLjMgNC40LTEwLjMgNS0xNCA4LjUtNC41IDQuMi02LjcgOS4yLTkuMiAxNC44LTYgMTMuMS03LjMgMjguOC0xMS4zIDQyLjctMy41IDExLjctOC4xIDIzLTExLjkgMzQuNi0yIDYtNC45IDEyLjEtNS42IDE4LjQtMiAxNi43IDIgMzQuMyA2LjQgNTAuMi0uMiAyLjQtMi45IDEuOS00LjcgMS43LTMuNi0xLjYtMy40LTExLjktNC0xNS41LTEuNy0xMC40LTQuMy0yMi40LTIuNi0zMyAxLjItNy42IDQtMTQuNyA2LjUtMjEuOSA2LjEtMTcuNyAxMy4xLTM1LjMgMTcuMS01My41IDIuNC0xMS4zIDMuNS0yNC4zIDguNy0zNC43IDEuOS0zLjYgNS45LTguMiA5LjUtMTAuMSAyLjctMS41IDguMS0yLjQgOS41LTUuNSAuOC0xLjYgLjQtMy42IC42LTUuNCAuNS00LjMgMS44LTkuMSAzLjQtMTMuMSA3LjItMTguMiAxNi43LTM1LjQgMjQuNy01My4zIDMuMS02LjkgNS0xOC40IDExLTIzLjUgMS45LTEuNyA1LjItMS41IDcuNS0xLjEgNi40IDEuMSAxMy4xIDQuMSAxOSA2LjUgNi44IDIuNyAxNS41IDUuNiAyMS4yIDEwLjQgMi40IDIgMy44IDYuMiA2LjMgOC43IDYuOCA2LjYgMTUuOCAxMS43IDI0IDE2LjUgNC41IDIuNiA5LjYgNiAxNS4xIDUuNSA0LjEtMS43LTUuOS02LjMtNy4zLTcuMi05LjUtNS43LTIxLjgtMTEuOS0yOS4zLTIwLS4xLTEuNSAxLjYtMS42IDIuOC0yIDIuNC0yLjItNi44LTUuMy04LjctNi4zLTUuOS0zLjEtMTIuNC04LjMtMTYuNS0xMy42LTguOS0xMS41LTE2LjQtMjIuNi0yMC0zNy0xLjgtNy4yLTEuMS0xNS0zLjMtMjItMS0yLjEtMi4xIDQtMi40IDQuOC0xLjggMS45LTIuMy0yLjMtMi42LTMuNS0xLjMtNC45LTIuMy05LjktMy4xLTE0LjktMS43LTEwLjUtMy4yLTE5LjEtLjktMjkuNiAuNi0zLjIgMi05LjIgNC4yLTExLjZ6TTkxMS41IDY4MS44YzMuNC0uMiA2LjYgNy44IDggMTAuMnMzLjYgNC41IDQuOSA3LjFjNS4yIDEwLjMgNi42IDIxLjggNS40IDMzLjItMS4zIDMtMi4xLTItMi42LTMtMS44LTQuNC0zLjItOC44LTQuNy0xMy4zLTIuNy03LjgtMy41LTE2LjEtNi4yLTIzLjgtMS4xLTIuOC01LjItNy40LTQuOC0xMC40ek02NTcuNiA2ODIuOGMxLjctLjUgMi41IDEuNiAzLjQgMi44IDIuMyAzIDMuNCA2LjggNC41IDEwLjQgLjEgMi44LTIuOC0xLjctMy40LTIuNC0yLjMtMi42LTYuMS03LjItNC41LTEwLjh6TTkzNi40IDY4NS45YzEuNS0uMSAxLjYgMS43IDEuOSAyLjggMS4zIDMuOCAyLjggNy41IDMuNSAxMS41IDEuMiA2LjYgMS4zIDEzLjEgMS4yIDE5LjgtLjEgMi44LTEuNyA2LjItLjQgOC45IDEuOCAzLjUgNi44IDcuMSA5LjYgOS45IDguNSA4LjUgMTcgMTcuMSAyNC41IDI2LjUgMy44IDQuOSA3LjIgMTEuMiAxMS41IDE1LjUgMi42IDIuNiA3LjUgMy44IDEwLjggNS43IDYuMiAzLjcgMTIuNSA4LjggMTcuOCAxMy43czkuMyAxMC42IDE0IDE2YzEuNiAxLjkgMi4zIDQuNiA0LjUgNiA0LjUgMi43IDEwLjcgMy44IDE1LjcgNS4zIDEzLjcgNCAyNy41IDUuNSA0MS41IDcuNyAxIC43LTUuOSAuOC03IC44LTQuNSAwLTkgMC0xMy41IDAtMTEuNyAwLTIzLTEuNi0zNC4zLTQuNy0yLjgtLjctOC0xLjEtMTAuMS0zLjRzLTIuNi01LjQtNC4yLTcuOGMtNC44LTcuNC0xMS40LTEzLjctMTcuNi0xOS45LTMuOS0zLjgtOS03LjYtMTMuOC0xMC4yLTMtMS42LTcuMy0yLjgtOS44LTUuMnMtNC45LTcuMi03LjUtMTAuNWMtNi42LTguMy0xMi40LTE3LjUtMTkuOS0yNS4xLTQuNS00LjYtOC41LTkuNC0xMy0xNC0xLjYtMS42LTQuMi0zLjMtNS4yLTUuM3MuMy00LjEgLjQtNS45Yy4yLTYuNyAxLTEzLjMgMS0yMCAwLTQuMi0uNy04LjMtMS4xLTEyLjQtLjEtMS45LTEuMS0zLjgtLjUtNS43ek02NjggNzI1LjhjMS40IC45IDIuNC0zLjEgMi43LTQuMSAxLjEtNC4zIC45LTguNiAuNC0xMi44LS4zLTIuOSAuMS01LjktLjItOC44LS45LTcuNC01LjMtMTQuNi05LjYtMjAuNC0xLjUtMi4xLTIuNi00LjEtNS4xLTUuMi0yLjcgLjItMy40IDkuOC0yLjggMTIuMiAuOCAzLjUgMy4xIDUuNSA1IDguNCAyLjYgMy44IDQuOSA4LjkgNi4zIDEzLjIgMS43IDUuNyAuNSAxMi4yIDMuMyAxNy41ek02NDYuNiA2OTQuOGMzLS45IDQuOSA0LjIgNS45IDYuMiAzLjMgNi42IDUuNiAxNS4xIDIuNyAyMi4yLTEuOSAzLTMuOS0zLjktNC41LTUuNC0xLjktNS4zLTMuMS0xMS43LTMuNy0xNy4zLS4zLTEuOS0xLjItMy44LS40LTUuN3pNNzE0LjkgNjk0LjFjNCAxLjItMi40IDgtNC4xIDkuNi03LjggNy45LTE4LjQgMTIuMi0yNi4xIDIwLjEtMi40IDEuNS0uMy0yLjUgLjEtMy4zIDEuNC0yLjkgMy4zLTUuNiA1LTguMyA0LjgtNy43IDE1LjMtMTguMiAyNS4xLTE4LjF6TTY3NC4yIDczNy4xYzEuMSAzLjEgMy42LS41IDQuOS0xLjcgNC4xLTMuOSA4LjQtNy41IDEzLTExIDkuMi02LjkgMTguMS0xMS45IDI1LjMtMjEuMSAyLjEtMi43IDYuNi03LjMgNi4zLTExLjJzLTQuMS0zLjgtNi45LTMuM2MtNS40IC45LTEwLjkgMi4yLTE1LjYgNS4zLTEwLjcgNy4xLTE4IDE2LjMtMjIuNSAyOC40LTEuNyA0LjUtNC43IDkuNy00LjUgMTQuNnpNNzY1LjkgNjk0LjFjMy45IDEuMyAxLjQgOC42IC45IDExLjYtMiAxMS4zLTggMjAuMi0xOS4zIDIzLjgtMi4xLS40IDIuNy03LjkgMy4zLTkuNSAuOS0yLjQgMi4xLTUuNiAyLTguMnMtMS4yLTMuNy0uMS01LjggMy41LTIuNCA0LjctNC4yYy40LTEuNSAuMi0yLjQtMS41LTIuMS0zLjMgMS40LTUuNiA0LjktOC45IDUuOS0xLjkgLjctNC40IC4xLTYuNSAuMS0yLjUtMS4yIDMuNS00LjggNC44LTUuNCA1LjQtMi44IDE0LjYtNi4zIDIwLjYtNi4yek04ODMuMSA3MTMuOGMyLjQgMS4yIDIuOCA4LjIgMi4yIDEwLjUtMi40IDguOS0xMCAyMC41LTE2LjQgMjcuMi0xNS43IDE2LjUtMzIgMzcuNi01NSA0NC03LjYgMi4xLTE2LjMgMS41LTI0LjEgMS41LTMuMyAwLTYuNSAxLjgtOS43IDEuNS0xLjQtLjgtMi42LTIuMy0zLjUtMy43LS4xLTIuMyA0LjYtMi4zIDYuNC0zIDUuNy0yLjIgMTIuNC01LjggMTUuNC0xMS4zLS4yLTIuOS05LjQgMi42LTExIDMuMi04LjcgMy4zLTE1LjcgNS42LTI0LjkgNC0yLTEuMiA0LjQtNi42IDYuMi03LjMgOC4zLTMuMyAxNy40LTUuNiAyNS44LTguNyA0LjYtMS43IDguOC00LjQgMTMuNC02LjIgMTIuMi00LjggMjQuOC0xMi41IDM1LjQtMjAuMSA2LjMtNC42IDEzLjctOC4zIDE5LjUtMTMuNiA0LjMtNC4xIDkuMy03LjcgMTMuNi0xMS44IDIuMi0yIDQuMi00LjggNi43LTYuMnpNNzM4LjUgNzE3LjNjLS43LTItMy4zLTEtNC44LS42LTQgMS03LjcgMS45LTExLjYgMy40LTEwLjYgNC4xLTE1LjggMTEuNi0yMC45IDIxLjEtMS44IDMuNS00LjkgNy4xLTUgMTEuMiAuNSAxLjEgMS4xIDEuNiAyLjQgMS4xIDQtMS41IDcuNS00LjcgMTEuNy02LjIgNS41LTEuOCAxMS44LTIuNiAxNi42LTUuOSAzLjEtMiA0LTYuNCA1LjQtOS42IDItNC45IDQuNy05LjMgNi4yLTE0LjV6TTcyOS4yIDcyMy41YzIuNSAuMS0yLjcgOS45LTMuOCAxMS41LTMgNC40LTEzLjEgNy41LTE4LjIgOC41LTIuMy0xLjIgMi4xLTYuMyAzLTcuNiA0LjItNi44IDExLjQtMTAuMiAxOS0xMi40ek04ODcuMyA3MzIuOWMxLjQgLjUgMS42IDMgMiA0LjMgMS4zIDQuMyAyLjUgOC42IDMuNSAxMyAzLjcgMTYuNiAxMS42IDMwLjIgMTkuNSA0NC44IC42IDIuMi04LjctMS43LTEwLjUtMi4zLTYuOS0yLjQtMTMuOC0yLjYtMTguNSAzLjYtNS44IDgtOC44IDE4LjktMTIuNiAyNy45LTYuMSAxNC42LTE0LjEgMjguMy0yMC4yIDQyLjgtMi4xIDUuMi0zLjggMTAuNC01LjIgMTUuOC0uNSAyLjMtLjMgNi43LTIgOC41cy02IDIuNi04LjMgMy43LTMuOSAzLjMtNi4xIDQuNGMtNi4yIDMtMTUuNyAxLjYtMjIuNCAxLjYtMTQuMiAwLTI5LjkgMS44LTQyLjggOC4yLTQuMSAyLjEtOC43IDQuMS0xMS45IDcuNS0uMyAuMi0uOSAuOC0xLjQgLjRzLTEtNC4zLTEuNC01LjZjLS44LTIuNS0zLjEtNS4zLTQuNi03LjQtMi4yLTMuNC04LjItNC41LTkuOS04LTEuMy0yLjUgLjUtNiAxLjItOC40IDEuOC02LjIgMy43LTEyLjMgNS42LTE4LjRzMy45LTE1LjIgOC0yMC41YzIuMS0yLjUgNi4xLTQuNCA4LjctNi4zIDcuOS01LjUgMTguNC0xMiAyMi42LTIwLjkgMi4yLTQuNyAxLjUtMTAuNyAxLjEtMTUuNiAyLjEtNC4zIDEwLjktNCAxNC44LTQgMTIuNCAwIDIxLjMtLjkgMzIuNS02LjUgNy45LTQgMTQuOS0xMC4xIDIxLjItMTYuMyA5LjgtOS42IDE5LTE4LjcgMjcuNS0yOS41IDMuOC00LjkgNS40LTEyLjUgOS42LTE2Ljh6TTkzNC42IDczNi44YzIuMi0uNyA0LjggMyA2LjIgNC40IDUuNSA1LjUgMTAgMTIgMTUuNCAxNy42IDYuMyA2LjQgMTEuOSAxNC40IDE3LjUgMjEuNSAxLjkgMi42IDMgNS45IDUuNCA4LjFzNC41IDIuNSA2LjYgMy45YzYuMiA0LjQgMTIuMyA4LjUgMTguMyAxMy4yIDEuNSAxLjIgMiAyLjkgMy4yIDQuMyA2LjEgNi41IDEwLjQgMTMuMiAxNS41IDIwLjUgNi40IDkuNCA3LjEgMjguMi03LjcgMjguNy0xLjkgMC0zLjcgLjEtNS41LS40LTEuNy0xLjYgMy4xLTcuNCAzLjktOS43IDIuOS03LjcgMy45LTE4LjMtLjctMjUuNS0xLjgtMS41LTEuNyAxLjItMiAyLjQtMS4yIC43LTMuNC01LTQtNi0yLjYtNC40LTUuOC04LTkuMi0xMS44LTUuOS02LjUtMTQuMy0xMC44LTIwLjMtMTcuMnMtOS42LTEzLjgtMTcuOC0xNy45Yy0xLjItLjMtLjcgLjQtLjkgMS4zLTIuNSAuMS02LjMtNy03LjUtOC45LS41LTEuMyAuOS0uMSAxLjMgLjIgMi41IDAtMi42LTYuMy0zLjUtNy4zLTMuNC0zLjYtNi41LTcuNS0xMC0xMS0xLjYtMS42LTQuNS00LjItNS4xLTYuNC0uNC0xLjIgLjMtMyAuOS00ek03OTEuMiA3NDEuNWMyLjkgLjEtMy4zIDkuMy00LjYgMTAuNi0xLjYgLjUtNC42LTMuMy01LjgtNC41LS42LTIuNyA4LjMtNS40IDEwLjQtNi4xek03NTUuNSA3NDEuMmMuMS00LTYuMy0uNS04LjIgLjEtNy40IDIuNC0xNi42IDUuMi0yMi4xIDExLTYuNSA2LjgtMi41IDE5LjkgMS4xIDI3LjIgMSAyLjIgMiA0LjkgMy45IDYuNSAyLjMgMSAzLjEtMS4zIDMuOS0zLjIgMS44LTQgMi04LjYgMy44LTEyLjcgMy4yLTYuOCA2LjEtMTMuNyAxMC4yLTE5LjkgMi4xLTMuMyA1LjgtNS41IDcuNC05ek01NDQuNiA3NDYuMmMuNyAuNS04LjMgNC44LTkuOCA1LjYtNi43IDMuMy0xMy40IDYuNi0yMCAxMC0yMC4xIDEwLTM5LjYgMjEuMi01OC44IDMyLjctMzEuNyAxOS4xLTYzLjUgNDEuOS04OS44IDY3LjctMTIuMSAxMS45LTI0LjEgMjMuOS0zNiAzNi02LjYgNi44LTEyIDE0LjktMTguNyAyMS43LTIuMiAxLjMgMy40LTYuMyA0LjItNy4yIDMuNS00LjUgNi40LTkuNCAxMC41LTEzLjUgOS41LTkuNSAxOC0xOS44IDI3LjYtMjkuNCAyLjktMi45IDUuNC03IDguNS05LjUgNS4xLTQgOS4yLTguNyAxMy45LTEzLjEgOS4zLTguNiAyMC4zLTE1LjggMjkuNi0yNC40IDcuMy02LjggMTUuOS0xMy42IDI0LjMtMTkuMiAxMS45LTguMSAyMy42LTE2LjcgMzUuOS0yNC4xIDQuNC0yLjYgOC43LTUuNCAxMy04IDIuNS0xLjQgNS40LTIuNCA3LjMtNC42IC41LTIuNS0zLjMtMS00LjctLjgtNS4xIC44LTEwLjMgMi44LTE1LjMgNC4yLTIwLjggNi4xLTQwLjIgMTMuOC02MC4zIDIyLjEtLjQgLjEtMS4xIC4zLTEuMS0uMXMyLjMtMS44IDIuOS0yYzMuNi0xLjkgNi44LTQuMiAxMC40LTYuMSA5LjgtNC44IDE5LjUtOS43IDI5LjYtMTMuOSAyMS4zLTguOSA0My4zLTE1LjQgNjYtMTkuNSA5LjUtMS43IDIxLjEtNS4zIDMwLjgtNC42ek03NDEuMiA3NDkuNGMxLjkgLjItMi4yIDYuNC0zIDcuOC0yLjcgNS4zLTQuOSAxMC40LTYuMyAxNi4yLTEuMiAyLjItMi4xLS40LTIuNy0xLjYtMS4yLTIuNy0yLjUtNi42LTItOS42IDEuMi03LjQgNy40LTEwLjggMTQtMTIuOHpNNjIxLjYgODEyLjZjLTMuMy0yLjggMS4xLTEwLjcgMi42LTEzLjggNS40LTExIDExLjMtMjEuOCAxNi44LTMyLjggMS43LTMuNCAzLjYtMTAgOC43LTguNiA3LjMgMS45IDUgMTMuNSAxMC44IDE2LjIgMy40IDEuNSA5LjQgLjQgMTMuMSAuNCAxMi40IDAgMjQuNiAuNCAzMy43IDkuOSAxLjQgMS40IDMuNSAyLjggNC4zIDQuNyAzLjcgOC44LTEwLjIgMTcuNC0xNi44IDIwLTE1LjcgNS45LTM0LjYgNC40LTUxLjEgNC40LTYuOSAwLTE1LjUgMS40LTIyLjEtLjR6TTc2My4yIDc2MS41YzIuNyAuMyAuNiAzLjEtLjIgNC41LTIgMy41LTUuNSA1LjMtOC45IDcuMi0zLjIgLjktLjEtMy4yIC41LTQuMiAyLTMuMiA1LTYuMyA4LjYtNy41ek03NjkuNyA3NTguM2MtMi41LTMuOS04LjItMS4zLTExLjMgLjUtNy4xIDQtOS40IDEwLjItMTIuOCAxNy4xLTEuMyAyLjYtMy4yIDQuOC00LjIgNy42LS40IDUuNSA5LjktMi42IDExLjUtMy43IDcuMS00LjggMTguNy0xMC44IDE2LjgtMjEuNXpNNDUzLjIgNzc5LjRjMi40IC4yLTUuNSA0LjctNi43IDUuNi01IDQuMS0xMC45IDYuOS0xNiAxMS0xNS4yIDEyLjMtMzEuOSAyMi45LTQ2LjIgMzYuMi0xMi45IDEyLTI2LjggMjMuMy0zOSAzNi0yOC4yIDI5LTU1LjUgNjIuOS03MS44IDEwMC40LTEuNiAxLjYtLjUtOC4yLS41LTkuOCAuMi02LjYgMi0xMy44IDMuOS0yMC4xIDYuMy0yMC40IDE1LjQtMzcuNiAyNi45LTU1LjYgOS45LTE1LjUgMjQuNS0yNy43IDM3LjctNDAuMiAyMi40LTIxLjIgNTAuMy0zOC41IDc4LjctNTAuMiAxMS00LjUgMjEuNi05LjkgMzMtMTMuM3pNNzY1LjYgNzk0LjJjMS4zIDEtMS40IDIuMi0yLjEgMi44LTMuMiAyLjUtNy4zIDMuNy0xMC4zIDYuMi01LjYgNC44LTcuOSAxMS40LTguMiAxOC45LS4xIDIuMy0uNyA2LjIgMSA4IDMuMyAzLjUgOS4xIC4xIDEyLjItMiA0LjEtMi44IDEwLjEtNS41IDEyLjYtMTBzMS45LTEwLjcgMi40LTE1LjVjLjktMiAyLjcgNS4xIDIuOSA2IDEgNC41IDEgOC45LTIuMSAxMi43LTYuOCA4LjQtMTcgMTQuOC0yNi4xIDIwLjUtMy43IDIuMy02LjggNS4yLTExLjEgNi43LTIuMi0uMi0xLjgtMi43LTEuMy00LjQgMS41LTUuNSAxLjktMTAuOSAzLjEtMTYuNCAyLjgtMTEuOCAxLTMyLjYgMTgtMzQuNiAzLS40IDYgLjUgOSAxLjF6TTExNzMuNCA4MzAuMWMzLjEgMS45LTYuNiA1LjktOC4yIDYuNy05LjYgNC44LTIwIDkuNS0zMC44IDExLjItMjEuMiAzLjQtNDIuNSA2LjMtNjMuOCAzLjItNy4yLTEuMS0xNS43LTEuMy0yMi40LTQuNC0uOC0xLjQgNC42IDAgNS4yIC4xIDIuOSAuNCA2IC4xIDguOSAuMSAxMC4yIDAgMjAuMyAwIDMwLjUtMS4xIDE3LjItMS44IDM0LjUtNS41IDUxLjItMTAuNCA2LjMtMS45IDEzLjItNi42IDE5LjYtNy40IDMuMy0uNCA2LjcgLjkgOS44IDJ6TTEyMTMgODQxLjRjMy44LTEgMTAuNiA0IDE0LjMgNS4zIDE1LjcgNS40IDMwLjYgMTQuMiA0NC44IDIyLjggMjkuOSAxOC4xIDU2LjggMzkuMiA4MC43IDY0LjggMTQuMyAxNS4yIDI1LjMgMzMuMSAzNi42IDUwLjUgNy44IDExLjggMTUuMSAyNSAyMC4xIDM4LjMgLjEgMi01LjMtNi45LTYuMy04LjYtMy41LTYuMy03LjctMTIuMy0xMS41LTE4LjUtOC0xMy0xNy4zLTI1LjctMjcuNC0zNy4xLTQuNi01LjMtOC40LTExLjYtMTMuNC0xNi42LTYuNi02LjUtMTIuNC0xMy42LTE5LjEtMjAtMTEuMS0xMC45LTIzLjQtMjAuNi0zNS0zMS0xMy40LTEyLjEtMzAuNC0xOS44LTQ1LjEtMzAtOC43LTYtMTkuMi0xMC4xLTI4LjctMTQuOC0xLjktMS05LjUtMy0xMC01LjF6TTEwMzMuNyA4NDcuN2M0LTEuOSA0LjcgMy40IDYgNi4xIDMuNiA3LjIgNC4zIDE0LjcgNC4zIDIyLjcgMCAyNS42LTEwLjggNDkuNC0yNi41IDY5LjUtNi41IDguMi0xMC4zIDE4LjMtMTYuOCAyNi43LTguNyAxMS4xLTIyLjggMTkuMy0zNS44IDI0LjItNi41IDIuNC0xNC41IDQuMS0yMS40IDQuMS0zLjkgMC0xMC45LTEuNC0xNC4zIC43LTEuOCAxLTIuNSAzLjgtMy41IDUuNS0yLjcgNC42LTUuMiA5LjgtOC45IDEzLjYtMTUuMyAxNS42LTMxLjEgMzMuOS01MS44IDQyLjYtMy4xIC42IDEuMS00LjIgMi4xLTQuOCA3LTQuOCAxMy42LTEwLjUgMjAuNy0xNS4zIDEyLjMtOC40IDI0LjEtMjEuNiAzMS43LTM0LjMgMi40LTQuMSAzLTguNyA1LjEtMTIuOCAxLjQtMS4yIDMuNy0uMiA1LjQtLjIgNC45IC4xIDEwLjEgLjUgMTQuOS0uMSAxNC4zLTEuNyAzMS4xLTguMSA0MS45LTE4LjEgNi4yLTUuOCAxMi0xMi4yIDE2LjktMTkuMSAzLjEtNC41IDQuNy0xMC4xIDcuOS0xNC42IDEuOS0yLjkgNC45LTUuMiA2LjgtOC4yIDkuOS0xNC41IDE4LjQtMzAuOCAyMC41LTQ4LjUgMS4xLTkuMyAwLTE4LjgtMS45LTI3LjktLjgtMy4zLTQuOC04LjYtMy4zLTExLjh6TTc0MSA4NTIuN2MxLjUgLjktLjYgMy45LTEuMSA1LjItMi4xIDUuNC00LjcgMTAuNC02LjQgMTYuMXMtNC4zIDEyLjItNS40IDE4LjUtMS4xIDEzLTMuOCAxOC4zYy0xLjUgLjktMi0zLjUtMi4zLTQuNi0xLjMtNS42LTItMTEuNS0yLTE3LjQgMC03LjMtMS4yLTE3LjEgMS40LTI0IDEuMS0yLjggNC40LTUgNi40LTcgMS0xIDEuNi0yLjYgMi44LTMuMnMyLjkgLjIgNC40IC4yYzIuMiAwIDMuOS0xLjcgNi0yLjF6TTEwMjkuMyA4NTcuOGMxLjkgLjEgMS45IDIuOCAyLjIgNC4yIDEgNC4xIDEuOSA4LjQgMi40IDEyLjZzLS42IDcuMi0uOCAxMWMtMS4xIDEzLjgtNy4yIDI4LjctMTUuMSA0MC4yLTEgLjcgMC01LjIgLjEtNi4yIC42LTUgMS45LTkuNSAxLjktMTQuNiAwLTktLjgtMTgtMy4zLTI2LjctMS4zLTQuNC0zLjktOC4yLTUuMi0xMi41IC40LTMuMSA3LTEuNiA5LjMtMiA0LS44IDUuNy0zLjUgOC41LTZ6TTMxMi4zIDg1OS41YzIuMi0uMS0zLjYgNS40LTQuNSA2LjMtMy44IDMuOC04LjEgOC4yLTExLjUgMTIuNS0xMC41IDEzLjYtMjAuOCAyNy4yLTMwLjEgNDEuOC0xMi42IDE5LjctMjEuMyA0Mi0yNi45IDY0LjYtMy4xIDEyLjUtMy43IDI1LjQtNS4yIDM4LjItMS4yIDEwLjMgMi4zIDIwLjQgMS43IDMwLjUtLjggMS43LTIuOS02LjEtMy4yLTcuMi0xLjUtNS4xLTMuMi0xMC43LTMuNi0xNi0uNS04LjUtMS43LTE3LjEtLjktMjUuOCAuNy03LjcgMi43LTE1LjMgNC0yMyAxLjctOS4yIDYuNC0xOC44IDEwLjItMjcuMiAxMC42LTIzLjUgMjUtNDYuNiA0Mi41LTY1LjQgOC44LTkuNSAxNi43LTIxLjggMjcuNS0yOS4zek03MTQuMSA4NjkuOGMxLjUgMS0uMSA2LS4xIDcuNyAwIDcuOCAuMiAxNS4yIDEuMSAyMi45czYuOSAxNi44IDQuNiAyNC4zYy0zLjUgMTAuOC0xMi41IDE3LjUtMjEuNiAyMy40LTEzLjIgOC42LTI2LjYgMTQuMS00MS44IDE4LjItOS4xIDIuNS0xOS4zIDQuOS0yOC45IDMuNS0yLjMtMS43IDMuOC00LjIgNC45LTQuNSA2LjMtMS42IDEzLjQtMSAxOS45LTIuNiAxNy40LTQuMyAzNi4yLTExLjkgNTAuNS0yMyAzLjUtMi44IDcuNy01LjcgOS43LTkuOCAzLjMtNi42IC41LTEzLjctLjMtMjAuNS0uNy02LjItMS4xLTEyLjItMS4xLTE4LjRzLTIuOC0xNy44IDMuMS0yMS4yek00MjAuNSA4NzQuNWM1LjUtMS43IDExLjcgMS41IDE2LjkgMy4yIDE5LjEgNi4xIDM0LjMgMjQuNyA0My44IDQxLjggLjkgMi44LTIuNCAyLjYtNC40IDMuMS00LjcgMS4xLTEwLjEgLjEtMTQuOC0uOS0xNS4xLTMuMy0yOS0xOC4yLTM3LjEtMzAuNS0yLjItMy40LTguMi0xMy4zLTQuNC0xNi43ek02OTYgODc4LjZjMS45IDEuMy0zLjQgNS4zLTQuNiA1LjktMS44LS4xLTIuNC0xLjctMy4zLTMuMXM2LjMtMi42IDcuOS0yLjh6TTcwNC4xIDg3OC44YzEuNSAxIC45IDQuMSAuOSA1LjcgMCA1LjgtLjYgMTIgLjEgMTcuOSAxIDguMiA0LjcgMTcuMiAxLjEgMjUuMi0yLjggNi4zLTExIDkuOS0xNi44IDEzLjItMTYuMSA5LTMzLjggMTcuMy01Mi41IDE5LTIuOS0uOCAyLjgtNiA0LTcuMSA2LjgtNi41IDEyLjMtMTQuOCAxOC43LTIxLjggNy4yLTcuOCAxNC4yLTE1LjcgMjEtMjMuOSAxLjctMi4yIDQuMy0zLjggNS45LTYuMSAzLjEtNC40IDYuOS04IDEwLjItMTIuMyAyLjEtMi44IDQuNi03LjggNy40LTkuOHpNNjU2LjUgODgwLjVjMi4yLS43IDMuOSAuMSA2LjEgLjQgMy45IC41IDguMSAuMiAxMS45IC4xIDEuOS0uMSA0LjMtMS4zIDYuMS0uNXM1LjEgNi4zIDYuNCA4LjNjLjYgMi4yLTIuNiA0LjYtNC4zIDUuNS0xLjYtLjMtMi4yLTIuMS0zLjctMi45LTUuNi0uOC0uNiA3LjktMi42IDEwLjctNiA4LjItMTMuNyAxNi42LTIxIDIzLjgtMS4zIC43LTIuMSAwLTIuOS0xLjEtMi4zLTMtNS42LTUuNS03LjYtOC43IDAtMS42IDUuMi0yIDYuNi0yLjQgNi0xLjcgMTMuMi0zIDE3LjctNy44IC42LTEuNSAuNC0yLjQtMS4zLTIuNS0zLjMgLjgtNi4zIDIuNS05LjYgMy4xLTEuNy0uNiAzLjgtNCA0LjQtNC43IDIuNC0yLjYgNS02LjcgNi40LTEwIC41LTIuMS0xLjYtMS4zLTIuNy0uNS0yLjYgMS45LTUuNCA1LjQtOC41IDYuMy02LjEtLjYtNC45LTE0LjEtMS40LTE3LjF6TTExNDcuOSA4ODEuNGMyLjgtMSA4LjEgLjYgMTAuOSAxLjMgMTAgMi40IDE5LjggNC45IDI5LjUgOCAyNS43IDguMiA1MCAxOC42IDczLjcgMzEuMyA5LjkgNS4zIDIxLjUgMTAuNCAzMCAxNy45IC41IDEuMy03LjctMy4xLTguOC0zLjctNi40LTMuMi0xMi42LTYuMy0xOS05LjUtMTQuNS03LjMtMjkuNC0xMy41LTQ1LTE4LjEtNS40LTEuNi0xMS44LTQuNi0xNy42LTQuNC0xLjUgLjYgMyAyLjggMy45IDMuNSA0LjQgMy4xIDkgNS45IDEzLjUgOSAxMS42IDcuOCAyMy4xIDE3LjIgMzIuNiAyNy40IDcuNiA4IDE1LjYgMTUuNiAyMi4xIDI0LjQgMTQuOCAyMC4yIDI2LjggNDAuOSAzNyA2My42IDMuMyA3LjUgNi4yIDE1IDguNyAyMi44IDEuMiAzLjYgMy4yIDcuNSAzLjQgMTEuMy0uNyAxLjctMS44IDEuOC0zLjMgMS0yLjctMy4yLTMuNi03LjQtNS40LTExLjEtNS4xLTEwLjEtMTAuNi0yMC40LTE2LjYtMzAtMTQuNC0yMy4xLTMwLTQ0LjEtNDguMi02NC4zLTUuOC02LjQtMTEuNS0xMy43LTE4LjMtMTkuMi04LTYuNS0xNS4yLTE0LTIzLjMtMjAuMi0xMi41LTkuNy0yNS42LTE4LjctMzguOC0yNy4zLTUuMi0zLjMtMTAuNC02LjYtMTUuNy05LjgtMS4zLS44LTUuNS0yLTUuMy0zLjl6TTY0MS4zIDk0MS4yYy0uMiAxLjgtMS44IDIuNS0yLjggMy45LTIuNCAzLjUtNS4zIDYuNi04IDkuOS0xMC4zIDEyLjgtMjAuNyAyNS40LTMxLjEgMzguMS0xMi44IDE1LjYtMjUgMzIuMS0zNy4xIDQ4LjQtNC42IDYuMy04LjggMTMuMS0xNC4yIDE4LjgtMS44IDIuMS0yLjkgNS4yLTUuMiA2LjhzLTYuOSAuOS05LjYgLjljLTcuNSAwLTE1IDAtMjIuNSAwLTIwIDAtNDAuMSAwLTYwLjEgMC0xMC4yIDAtMjEgMS0zMS4xLS4yLTEuNi0uOSAuNC0yLjQgMS4xLTMuNCAxLjktMi42IDQuNS00LjYgNi4yLTcuMyAyLjItMy42IDYtNi4xIDguOC05LjIgNi41LTcuNSAxMy40LTE0LjYgMjAtMjIgMTMuNS0xNS40IDI3LjMtMzAuOCA0MS00Ni4xIDQuMi00LjcgOC4xLTEwIDExLjktMTUuMSAxLjktMi40IDMuMi01LjcgNi4xLTcuMiAyLjcgLjEgNS44IDMuMiA4LjQgNC4zIDkuNSA0LjEgMjMuNyA5LjMgMzIuNiAxIDYuOS02LjQgNS42LTE0LjcgMy42LTIzLjEtMi4zLTEwLjEtNC45LTI2IC41LTM1LjQgNS45LTEwLjUgMTYuNy02LjYgMjUuMi0yLjMgNi45IDMuNSAxMy4xIDggMjAgMTEuNSA0LjEgMi4xIDguNyAzLjMgMTIuNyA1LjMgMi45IDEuNCA1LjIgMy45IDcuNyA1LjkgNi4yIDQuOCAxMi4yIDkuMyAxNS45IDE2LjV6TTczMi42IDkwMi44YzItLjYgMy40IDEuOCA0LjYgMyA0LjMgNC4zIDguMiA4IDcuNyAxNC42LS41IDguNC0zLjkgMTYuOS02LjggMjQuNy0zLjUgOS40LTYuOSAxOC45LTExLjEgMjcuOS0zLjUgNy41LTguMSAxNi4xLTE0LjIgMjEuOC05LjEgOC40LTIxLjEgMTQuNC0zMS44IDIwLjctMTkuMiAxMS40LTM5LjMgMjItNTkgMzIuNS04LjcgNC42LTE2LjUgMTAuNS0yNSAxNS41LTQuMSAyLjUtNi4zIDUuMS0xMS42IDQuMy0xLjMtLjkgMy44LTMuNyA0LjgtNC42IDQuOS00LjMgMTEuMy02LjcgMTYuNS0xMC41IDE0LjUtMTAuOCAzMS42LTE5LjIgNDQuOC0zMS43IDguMi04IDE4LjMtMTYgMjIuMi0yNy4zIDIuMS02LjEgMi4zLTEyLjMgMi4zLTE4LjcgMC0yLjMtLjctNi4yIDEtOCAzLjMtMy42IDExLjYtNS43IDE2LTggOS43LTUuMiAxOS44LTEyLjYgMjYuNy0yMS4zIDQuMS01LjMgNy4zLTEzIDktMTkuNSAxLjItNC44IDEuMy0xMS4yIDMuOS0xNS40ek04MjQuMyA5MDYuMmMyLjYgMS4xLS43IDUuMy0xLjMgNy4zLTIgNy4yLTMuNSAxNC41LTUgMjEuOC0uMyAuNi0yLjktOC45LTMuNy0xMS4xLTIuNi03LTguNC0xMy4zLTE1LjQtMTYuMS0yLjUtMS4zIDYuMy0yLjEgNy42LTIuMSA1LjkgMCAxMi0uNCAxNy44IC4yek00MTQuMyA5MTAuNWMyLjctLjEgMy44IDIuNyA1LjIgNC41IDIuOCAzLjQgNi41IDYuOCA5LjcgOS44IDEwLjEgOS4zIDIyLjcgMTMuMSAzNS42IDE2LjUgMSAxLjctNC41IDEuNy01LjIgMS44LTUuNiAuNC0xMC41LS4xLTE2LjEtLjEtMTQuMSAwLTI4LjMtNC41LTQyLjUtNC00LjUgLjItMTIuOSAxLjQtMTQuOSA2LjEtMy40IDguNCA3LjQgMTguOCAxMi43IDI0LjEgMTMuMyAxMy40IDI2LjkgMjUuNSA0NCAzNCA1LjIgMi42IDEwLjggNCAxNi4xIDYuMiAxLjMgMS44LTEuMiA0LjktMy4xIDUuMy0zLjMgLjgtOS41LTIuMS0xMi41LTMuNS0xMi01LjItMjUtMTIuMS0zNC41LTIxLTMuNi0zLjMtOC40LTUuNi0xMS41LTkuNS03LjktMTAuMS0yMC0yNC43LTE2LTM4LjkgMS42LTUuNSA1LjYtOS4xIDkuNS0xMyA2LjktNi45IDE1LjQtMTIuOSAyMy41LTE4LjN6TTczNy42IDk5NC44Yy0zIDEuOC0yLjgtNS45LTEuNC03LjQgMy4xLTMuNSAxMC01LjMgMTQuMy02LjcgNS41LTEuOSAxMC43LTQuMyAxNi4xLTYuNCAxMS00LjIgMjYtOS43IDI3LjMtMjMuNiAuNC0zLjcgMC03LjEtMS4zLTEwLjUtNC0xMC4yLTE4LjMtMTQtMjYuNS02LjktNS44IDUuMS03LjkgMTUuNi0uNiAyMC4yIDIuOSAuNiAuMy01LjggLjYtOCAuNi00LjMgNC4yLTguOCA4LjYtOS40IDguNi0xLjEgMTUuMiA2IDEyLjkgMTQuNi00LjEgMTUuMi0yNy41IDIyLjctMzYuMyA3LjUtMS45LTMuMy0zLjMtOC0zLjMtMTEuOCAuMS0xNy40IDE5LjQtMzYuNCAzNy0zNi40IDEwLjYgMCAxOS43IDcuMiAyNC4yIDE2LjMgMi4xIDQuMSAxLjggOC43IDEuOCAxMy4yIDAgMjMuNy0yMi43IDM5LjEtNDMuMyA0NS4xLTkuOSAyLjktMjIuMyAyLjQtMzAuMSAxMC4yek02NDYuMSA5MzYuMmMtMi4yIC4zLTMuNS0yLjktNC43LTQuMy00LjItNC44LTktOC45LTE0LjEtMTIuNy0uNy0uOSA4LjQtMi4xIDEwLjEtMS45IDIuNCAuMiA0LjcgNCA2LjEgNS43IDMuNCA0LjEgOS4zIDguNSAyLjYgMTMuMnpNMjc0LjIgOTIzLjljMS4zIC43LS4zIDMuMi0uNyA0LjItMS40IDMuNi0yLjYgNy43LTMuNSAxMS41LTIuNSAxMS4zLTQuNSAyMi40LTMuMyAzMy45LS43IDEuOS0xLjctMy43LTEuNy00LjMtLjEtMy42LTEuNS03LjEtLjctMTAuNyAyLjItOS41IDIuOS0xOC42IDYuOS0yNy43IDEtMi4zIDEuMi01IDMtNi45ek00ODYuMyA5MjkuNWMzLjEtLjEgNC4xIDMuNCA1LjkgNS4zIDUuNSA1LjYgMTEuOSAxMS40IDE3IDE3LjIgLjMgMi4zLTMuNSA1LjYtNC45IDcuMi00LjcgNS4xLTkuMiAxMS4xLTEzLjQgMTYuNi01LjkgNy45LTEyLjggMTUuMi0xOS42IDIyLjMtMiAyLjEtMy42IDYuMi02LjggNi43LTUgLjgtMTEuMS0zLjItMTUuNi01LTE3LjEtNi45LTMwLjgtMjAuMS00NC0zMi40LTMuOS0zLjctNy4zLTcuOC0xMC4zLTEyLjItMS41LTIuMS0zLjQtMy45LTMuMy02LjcgMS40LTMuMyA4LjItMy41IDExLjMtMy41IDEyLjItLjEgMjQuNSAyLjYgMzYuNiAzLjlzMjQuNyAxLjcgMzQuOC02LjRjNC42LTMuNyA3LjMtOS42IDEyLjMtMTN6TTc0Mi4zIDk1MmMxLjkgLjYgMi42IDYuOSAzLjUgOC43IDIuMiA0LjMgNy41IDguMyAxMS44IDEwLjQgMSAuOS03LjkgMy44LTkuNCA0LjQtNS45IDIuMi0xMS45IDUuMi0xNy45IDctMS4xLS4yIDMuMS04LjMgMy42LTkuNyAyLjUtNi44IDUuMi0xNC40IDguNC0yMC44ek04MTAuMSA5NjIuOGMxIC42IC4xIDIuMi0uMiAzLjEtMS4xIDIuOS0xLjkgNi0zLjEgOC44cy0xLjQgNS40LTMuMyA3LjItNi4yIDIuNS04LjggMy4xYy02LjQgMS41LTEyLjggMy4xLTE5LjEgNC42LTIuNi0uMyAyLjQtMi4xIDIuOS0yLjQgMy4yLTEuNSA3LjMtMi43IDEwLjMtNC42IDYtNCAxMC45LTguNyAxNi0xMy44IDEuOC0xLjggMy40LTQuNiA1LjMtNnpNNjY4LjQgOTY5LjNjMi44IDEuMiAxLjYgNy42IDEuNiAxMC4yLS4xIDEwLjgtNi40IDIyLTE0LjIgMjkuMi0xNi42IDE1LjQtMzYuMiAyNi43LTU0LjYgMzkuOC01LjMgMy43LTExLjEgNy0xNi4xIDEwLjktMy40IDIuNi03LjUgNi4zLTExLjQgOC4xLTIgLjktNC44IC41LTcgLjUtNC42IDAtOS44IC43LTE0LjQtLjMtMS4zLTEuMyAzLjYtNi43IDQuNy04IDYuNC04LjEgMTIuMy0xNi42IDE4LjYtMjQuOCAxMC42LTEzLjggMjEuNS0yNy40IDMyLjEtNDEuMyAzLjYtNC44IDguMS0xMy43IDEzLjItMTYuN3MxMy4xLS4zIDE4LjUtMWM3LS45IDE0LjUtMi4yIDIxLjMtNC4yIDIuNS0uOCA1LTIuMiA3LjctMi40ek04OTEuMiA5ODAuN2MxLjcgLjEgMi42IDEuNyAzLjggMi44IDIuOCAyLjUgNi44IDUuOCA4LjUgOS4yLS4xIDIuNi00IDcuOS01LjkgOS43LTMuMiAzLjEtOC45IDQuNi0xMi43IDYuOC02LjkgMy45LTEyLjYgOS43LTIwLjMgMTIuMy0yLS4xIC43LTMgMS4zLTMuOCAyLjUtMy41IDQuNC03LjYgNi44LTExLjIgNC42LTYuOSA4LjYtMTQgMTMuOC0yMC41IDEuNS0xLjkgMi42LTQgNC43LTUuM3pNNzMwIDk4NS43YzIuMyAxLjYgLjcgNy41IDEuMiAxMC4xIC44IDMuNyAzLjIgNC4xIDYgNS43IC41IDEuOS0yLjggMi44LTQuMiAzLjUtNC43IDIuNS05LjkgNi4zLTEzLjcgMTAuMi01LjkgNS45LTExLjkgMTIuNC0xNi45IDE5LjEtMy4zIDQuNC02LjUgOS41LTEwLjUgMTMuNC00LjkgNC42LTEzLjMgNy4yLTE4LjkgMTEtMy42IDIuNS02LjEgNy45LTEwLjQgOS4xLTEuNC0uMS0yLjYtLjQtMS40LTEuOSAxOS4yLTE0LjYgMjguOC0zNi45IDQzLjItNTUuNiAyLjQtMy4yIDYuMi00LjcgOS4xLTcuNHM1LjgtNS4yIDguMi04LjMgMy43LTguMSA4LjMtOC45ek04MDAuMiA5ODguNWMyLjggLjQtMS41IDEwLjctMy4xIDEyLjJzLTQuMiAxLjMtNi4zIDEuM2MtNS40IDAtMTEuNC0uNS0xNi4yLTMuMy0yLTEuOSAzLjYtMy4zIDUuMi0zLjggNi43LTIuMiAxMy42LTQuNiAyMC40LTYuNHpNMTA5Ny41IDk4OS44YzEuNi0uMSA0IDMuMSA1IDQuMiAzLjUgMy45IDcgOC4xIDEwLjcgMTEuOCAxMi43IDEyLjcgMjQgMjkuOSAzMiA0NiAyLjQgNC43IDUuOCA5LjggNy4zIDE0LjktLjggMi40LTguOCAxLjgtMTAuNSAuMy0yLjctMi40LTQuMi03LjctNS41LTExLTIuMi01LjEtNS0xMC03LjUtMTUtNi40LTEyLjctMTMuNy0yNS4xLTIxLjYtMzYuOS0yLjEtMy4yLTQuNC02LjgtNi43LTkuOC0xLjEtMS4zLTMuMy0yLjctMy4yLTQuNXpNNzQ4LjkgOTk0LjFjMi4yIC42IDEuMiAyIC4zIDMuNi0xLjUgMS41LTQuNSAuNC02LjUgLjItMy41LTEuNCA0LjktMy44IDYuMi0zLjh6TTc0Ny4zIDEwMDMuNWM0LjQgMi4zIDIuNiA1LjIgMi40IDkgLjggMS4zIDEuOCAxLjMgMy4yIC44IDQuOS00LjUgMS43LTguOSAxLjQtMTQuMiAyLjEtNS45IDktMS41IDEwLjkgMi4yIDQuNiA5LjEtMy44IDI0LjMtMTQuMSAyNS42LTUuOSAuNy0xMi45LTEuMS0xNC43LTcuNXMzLjgtMTYuMyAxMC45LTE1Ljl6TTkwOC4zIDk5Ny42YzIuNi0uMiA2LjIgMyA3LjIgNS4yLS4xIDItMi4zIDQuNi0zLjQgNi4zLTMuNyA1LjgtOC4zIDEwLjUtMTIuNiAxNS44LTEuNyAxLTIuNi0uNi00LjQtLjYtNC43IC4yLTguNiAyLjgtMTEuMiA2LjYtMS41IDMuNCA2LjctLjIgOC4yLS42IDIuOSAuNC0yLjQgMy43LTMuMyA0LjUtMy43IDMuNS04LjUgNi43LTEyLjcgOS40LTEgMCAxLjUtNS4zIDEuNy02LjYtLjctMi4xLTMuNSAuMy00LjIgMS41LTMuMyA0LjctNy41IDguNi0xMC4xIDEzLjktMiA0LTUuOCA2LjEtOS40IDguNi0zIDEuOS01LjQgNS05IDZzLTcuOSAuNS0xMS40IC4zYy0yLjMtLjkgMS01LjMgMS44LTYuOSAzLTUuOCA2LjgtMTIuNSAxMC44LTE3LjcgMy40LTQuMiA3LTkuNCAxMC45LTEzLjEgMS4zLTEuMSAzLTEuMSA0LjUtMS41IDMuNS0xLjIgNy0zIDEwLjMtNC43IDUuNS0yLjkgMTAtNyAxNS4xLTEwLjQgNC4zLTIuOSA5LjUtNC4zIDEzLjgtNy4yIDMuNC0yLjIgNC40LTYuNSA3LjQtOC44ek0xMDExLjggMTAwMS41YzIuNS0uMSA1LjMgMy42IDcuMyA1IDcuMiA0LjggMTQuNSA5LjUgMjIgMTQgMTYuOSAxMC4yIDM1LjYgMTkuOCA1NCAyNyAxMS4yIDQuNCAyNyA5LjUgMzQuOCAxOS4xIC42IDEuNi0xLjcgMS40LTIuNyAxLjQtMy40IC4xLTcgLjItMTAuNCAwcy02LjQtMi44LTkuMy00LjJjLTYuNi0zLjMtMTMuNi02LjMtMTkuNy0xMC40LTQtMi42LTguOC00LjItMTIuOS02LjYtMTUuOS05LjEtMzQtMTguMi00Ny40LTMwLjctMy45LTMuNy04LjUtNi42LTEyLjMtMTAuMy0xLTEtMy41LTIuOC0zLjQtNC4zek03NzIuNCAxMDAyLjljMS45LS40IDQuNiAyLjIgNi40IDIuOCAzLjkgMS4zIDggMS40IDEyLjEgMS45IDIgLjctNCA2LjEtNC45IDYuOS01LjYgNS0xMy40IDkuNC0yMC42IDEyLS42IDAgMy44LTYuOSA0LjYtOC41IDIuMy01IC42LTEwLjMgMi40LTE1LjF6TTk5OC40IDEwMDNjMS4yIC4zIDEuNyAyLjkgMi4xIDQgMS41IDMuNiAyLjkgNy4xIDQuMiAxMC44IDQgMTEuMSA3LjUgMjIuNSA5LjQgMzQuMSAuNyA0LjcgMi4zIDkuNiAxLjcgMTQuNC0uOSAxLjgtMi4zIDEuNy00LjEgMS41LTMuNC0xLjctMi4yLTExLjUtMy0xNS0yLjctMTEuNS00LjMtMjMuMy03LjItMzQuOC0uOS0zLjgtNC4xLTExLjMtMy4xLTE1ek03MzAuMSAxMDEyLjhjMS4zIC44LS4yIDUuNyAuMiA3LjQgMS41IDYuMSA1LjYgMTAuOCAxMiAxMS45IDIuNiAxLjItMTAgNC45LTEyLjEgNS42LTUuOSAyLjItMTEuOCAzLTE3LjkgNC42LTMuMiAuOS02LjMgMy05LjcgMy41LTIuNi0uOSA0LjctNy43IDUuNy05IDQuMi02LjEgOS4zLTExLjggMTQuNS0xNyAyLjMtMi4zIDQuNS01LjQgNy4zLTd6TTY5Mi4zIDEwMTYuNWMxLjcgMC0zLjkgNy40LTUgOC44LTQuMiA1LjgtOC4zIDExLjYtMTIuNiAxNy4zLTUuOCA3LjUtMTIuOSAxNS43LTIwLjggMjEuMi0xLjcgMS4yLTIuOCAzLjMtNSAzLjktMy4xIC45LTcgLjMtMTAuMiAuMy02LjkgMC0xMy45IC40LTIwLjgtLjEtMi43LS45IDEuNC00LjUgMi40LTUuOXMyLjUtMi43IDMuMS00LjItLjItMi4zIC44LTMuNGMxLjUtMS43IDQuNC0yLjggNi4zLTQuMSAxOS41LTEyLjkgNDEuOS0yMS40IDYxLjgtMzMuOHpNNzkyLjQgMTAxNi43YzEuNy0uMyAuNiA0LjIgLjYgNS40IDAgNS4yLS4zIDEwLjQgLjUgMTUuNi0uNiAxLjYtNC4zLTIuNi01LjUtMy40LTMuOC0yLjQtNy41LTMuNS0xMS44LTQuNi0xLjEtMS4zIDIuOC0yLjYgMy43LTMuMiA0LjUtMi44IDguNi02LjMgMTIuNS05Ljh6TTc5NS41IDEwNjdjLTIuNSAyLTcuOCAxLjItMTAuOCAuOC0yLjUtMS4yLS44LTQuMS0uNy02LjMgLjEtNC4yLS45LTguMi0zLjUtMTEuNS01LjgtNy4zLTE5LjgtNi42LTI0LjkgMS4xLTMuNCA0LjktMy4yIDEwLjUtNS4xIDE1LjktMi45IDIuMy0xMi45IDEuNi0xNi40IC42LTEtMS40IC42LTQuMyAxLjItNS44IDIuMi01LjMgNC43LTkuNyA4LjQtMTQuMSA3LjItOC41IDE5LjYtMTQgMzAuNy0xMi42IDEzLjMgMS42IDI1LjYgMTguOCAyMS4xIDMxLjl6TTc0MC4yIDEwNDAuNGMyLjMgLjItNC42IDguMi01LjcgOS42LTIuNSAzLjQtNC42IDcuNy02LjIgMTEuNy0uNyAxLjYtLjkgNC0yLjIgNS4zLTIuMiAyLjEtOC4xIDEtMTAuOSAxLTkuNyAwLTIwLjIgMS4yLTI5LjctLjItMi0xLjIgLjItMy40IDEuMi00LjggMi40LTMuNiA1LjQtNi43IDguOS05IDUuNC0zLjYgMTQuNy00LjcgMjAuOS02LjEgOC0xLjcgMTUuOC01LjIgMjMuNy03LjV6TTc1OC4zIDEwNjcuN2MtMS45LTEuNi0xLjYtNS4xLTEtNy40IDEuNS00LjkgNy44LTExLjIgMTMuNC05LjlzMTEuNCAxMi44IDQuNyAxN2MtMy4yIDIuMS0xMy40IDEuMS0xNy4xIC4zek02MTUuMSAxMDU4LjhjMS40IC44LTEuNiAzLjMtMi4zIDQtMi44IDIuOC01IDUuNi05LjQgNS0xLjQtMSAuOS0yLjUgMS44LTMuMSAzLjEtMi4xIDYuNi00LjIgOS45LTUuOXpNNjgxLjEgMTA1OS44YzIgMS4yLTQuNyA3LjMtNi4xIDcuOHMtMi43IC4xLTIuMi0xLjdjMS44LTIuNCA1LjYtNC44IDguMy02LjF6Ii8+CiAgICA8L21hc2s+CiAgPC9kZWZzPgogIDwhLS0g57q/56i/5bGC77ya5Yqo5oCB57uY5Yi2IC0tPgogIDxwYXRoIGNsYXNzPSJjeS1zcGxhc2gtbGluZSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZWM4NmJiIiBzdHJva2Utd2lkdGg9IjIiIHBhdGhMZW5ndGg9IjEiIGQ9Ik01NjggMzguOGMxLjMgLjkgNC4zLS43IDYtLjggNC43LS4zIDkuNi0uNSAxMy43IDIuMyAzLjIgMi4zIDUuNCA0LjIgNy40IDcuNiAxLjEgMS44IDEuMyA0LjYgMyA2IDcuMiA2LjEgMTYuOSAxMC4zIDI0LjggMTUuNyA2LjcgNC40IDE0LjggOS45IDIwLjYgMTUuNCA0IDMuOSA4LjYgOS4zIDEzLjUgMTIgMy44IDEuMyAxLjEtNi43IDEtOC41LS4yLTYuNC0uMy0xMi43IDAtMTkgLjEtMy4xIC45LTYuOCA0LjYtNy40IDUuOS0uOSAxMS4xIDUuMyAxNC4xIDkuNyA3LjUgMTEgMTkuMSAyMS43IDIxLjQgMzUuNSAxLjUgMyA0LjYtNC42IDUuOS01LjggNC40LTQgOS42LTguOSAxNS43LTQuNyA0IDIuOCAyLjYgOC45IDMuNiAxMi45IDIuMiA4LjMgNS43IDE2LjMgNC42IDI1LjItLjUgNC4xLTIuMyA3LjctMy4xIDExLjcgLjEgMS44IDIuNiAxLjUgMy45IDIuMnMyLjUgMi41IDMuMiA0LjNjMi41IDYuOCA2LjEgMTMuNyA3LjggMjAuNyAuOCAzLjQtLjUgNi45IDAgMTAuMiAuOCAxLjEgMS41IDEuNyAyLjcgLjggMS4zLTIgMi00LjkgMy44LTYuNiA0LjEtMy43IDguNy0uMSAxMC41IDMuNiAyLjggNS40IDUuNSAxMS4xIDcgMTcgLjggMy4zIC43IDcgMS44IDEwLjIgMi44IDIuMyA2LjkgLjUgMTAuMSAuMXM1LjcgLjMgOC4zLS43YzMuNy0xLjMgNi45LTUuNSAxMC4xLTcuNyAuOS0xLjctMi42LTMuOC0zLjgtNC45LTUuMi00LjktMTEuNC04LjUtMTUuOS0xNC4xLTExLjMtMTQuNS0yMS41LTI4LjctMjYuOC00Ni43LTQuOS0xNi42LTcuMy0zNy4xLTMuMi01NC4yIDEuMy01LjIgMi40LTE4LjUgMTAuOC0xNS40IDQuMyAxLjUgNC45IDcuOCA2LjcgMTEuMyA1IDEwLjIgMTAuNSAyMCAxNy41IDI5IDE1LjQgMTkuNiAzNy43IDI4LjggNTYuNyA0My44IDUuMSA0LjEgMTAuMyA4LjkgMTQuOCAxMy43IDIuOSAzLjIgNS4zIDggOS4xIDEwLjMgMy41IC41IDcuNy0yIDExLjEtMyA1LjYtMS42IDEyLjEtMi4xIDE3LjktMS40IDguNyAxLjEgNC44IDkuMSA5IDEzLjUgMi42IDIuNyA5IDMuNyAxMi4zIDUuNyA1LjMgMy4yIDcuNiA4LjIgMTAuNiAxMy4zIDEuNSAxLjYgNC4zLTEuMSA2LTEuOCAzLTEuMyA2LjMtLjUgOC45IDEuNSA2LjcgNS40IDEwLjYgMTQuNyAxNi44IDIwLjcgMi45IDIuNiA2LjUgNC41IDkuMyA3LjIgOS42IDkuNCAxOS4yIDE5IDI5IDI4IDMuNiAzLjQgNS45IDggOS40IDExLjYgMTUuMyAxNS41IDI2LjMgMzQuNSAzNiA1NCA3IDEzLjkgMTIuOCAzMi40IDkuMSA0OC0uOSA0LjEtLjkgOC4yLTMuMSAxMS45LTEuNiAyLjktNC4yIDQuNC02LjQgNi42LS4zIDIuNyAzLjMgNS42IDQuNyA3LjcgNC4yIDUuOSA4LjIgMTIgMTEuNyAxOC4zIDEyLjUgMjIgMTguOSA0OCAxNC44IDczLjItMS4yIDcuNy01LjggMjMuMi0xNC4yIDI2LTEuOC0uMi0xLjgtMS43LTEuNi0zLjMgLjYtNC4xIDIuMi04LjEgMi43LTEyLjMgMS4zLTExLjEgLjktMjMuMi0yLjgtMzQtMS40LTIuOS0zLjcgNy4xLTQuMSA4LjYtLjcgMi42LTIuMiA1LjEtMi44IDcuNy0xLjEgNS42LS4yIDEyLjEtLjIgMTcuOCAwIDE5LjMtOSAzOS40LTIwLjcgNTQuMy00LjIgNS40LTExLjQgMTQuNy0xOC43IDE1LjQtNC40LTEuNC0xLjktNy42LTEuMS0xMC43IDIuNi0xMC41IDQuNC0yMy45IDIuMi0zNC43LTEuOC0yLjItNC43IC40LTYuOCAxLjEtNiAyLjItMTIuNSAzLjctMTguNyA1LjMtMi4yIC41LTUuNCAwLTYuOCAyLjItMS44IDMuMi0xLjIgNy4xLTEuNSAxMC41LS43IDEwLjQgMSAxOS4yIDMuMyAyOS40IDUuNCAyMy41IDI1LjkgNDUuOCA0Ny4xIDU2LjQgOC42IDQuMyAxOC4zIDQuNSAyNy4yIDcuMyAzLjIgMi45LTEuNCA1LjUtMy44IDYuNy02LjggMy41LTE0LjEgMi43LTIxLjMgNC4xLTIuNCAxLjggNS4xIDQuOSA2LjYgNS43IDUuOSAzLjEgMTEuOSA2LjggMTguMyA4LjcgMi43IC43IDUuOSAuNCA4IDIuNSAxLjYgMy45LTEuNSA1LjEtNC44IDUuOC02LjIgMS40LTEzLjUgMi44LTE5LjggMS4zLTE1LjYtMy42LTI5LjMtNy4xLTQzLjQtMTUuMS01LjEtMi44LTEwLjctNi41LTE1LjEtMTAuNC0yLjctMi40LTUuNy01LjctOC45LTcuMy0xLjUgLjEgMSA0LjggMS41IDUuNyAyLjkgNi4yIDUuNyAxMiA5IDE4IDExLjggMjIuNCAyNS4xIDQ3LjEgNDMgNjUgNSA1IDkuMiAxMC43IDE0LjQgMTUuNiAxMS43IDEwLjggMjYuOCAyMS42IDQyLjEgMjYuOSA0MS41IDE0LjIgODcuNy0xLjcgMTI0LjQtMjIuNSAxNi05IDMxLjEtMTkuNSA0NC41LTMyIDE2LjUtMTUuMyAzMi40LTMyIDM4LjUtNTQuNSAxMi43LTQ3LTI4LjUtMTAzLjctNzguMi0xMDEuNi0xMC45IC40LTIxLjcgMi43LTMxLjggNy4xLTIuNSAxLjEtNS4xIDEuNS03LjQgMy4xLTcgNC45LTEzLjMgMTIuNy0yMS4xIDE2LjItMy4zLS4yLTUuMS00LjctNS4yLTcuNS0uMS03LjEgMy43LTE0LjEgNi44LTIwLjIgOS4xLTE4LjMgMjkuNi0yOS45IDQ4LjUtMzUuNSA2LjctMS45IDEzLjMtMi4zIDIwLjItMi4zczEzLjItLjMgMTkuNyAxLjNjMjguNCA3LjEgNDguNSAyOC42IDYxLjggNTMuNyA3LjggMTQuNiAxMC40IDMwLjcgMTMuMiA0Ni44IDguNCA0OC41LTExLjkgMTAxLjYtNDYgMTM2LjQtOS42IDkuOC0xOC4zIDIwLjctMjkuMiAyOS4zLTkuMyA3LjMtMTguNiAxNC40LTI4LjMgMjEuMi03LjcgNS4zLTE3LjEgOC43LTI0LjYgMTQuMi0uNCAxIDUuOSAyLjQgNy4yIDIuOCA4LjYgMi43IDE3LjMgNS40IDI1LjcgOC44IDIyLjQgOS4zIDQzLjYgMTkuMyA2NC43IDMxLjMgNTcuMSAzMi4yIDEwMy43IDg1IDEzMi44IDE0My4yIDcgMTQgMTMuMiAyOC4zIDE4LjQgNDMuMSAxLjQgNCA1LjEgMTEuNyAyLjcgMTUuNS0yLjMgMi4xLTYuMiAxLjQtOS4xIDEuNC02LjUgMC0xMyAwLTE5LjUgMC0yNyAwLTU0IDAtODEgMC01MS41IDAtMTAzIDAtMTU0LjUgMC0xNiAwLTMyIDAtNDggMC02LjggMC0xNS42IDEuNS0yMi4yLS4zLTguNS0yLjUtMTYuOC04LjctMjQuMy0xMy4yLTEyLjYtNy40LTI1LjYtMTQuMS0zNy44LTIyLjItNy45LTUuNC0xNS0xMS45LTIzLTE3LjMtMS43LS41IDAgMi40IC4yIDMuMSAxLjQgMy44IDIuMSA4IDMuMSAxMS45IDIuMSA4LjYgNCAxNy4xIDUuNyAyNS44IC43IDMuNCAyLjUgNy42IDEgMTAuOS0yLjcgMi43LTEwLjEgMS4zLTEzLjcgMS4zLTEyLjUgMC0yNSAwLTM3LjUgMC01MSAwLTEwMiAwLTE1MyAwLTE0MSAwLTI4MiAwLTQyMyAwLTM5LjUgMC03OSAwLTExOC41IDAtMTEgMC0yMiAwLTMzIDAtMy42IDAtOS44IDEuMi0xMy4xLS40LTIuMi0xLjItMy40LTUuNy00LjEtNy45LTIuNC03LjYtMy44LTE1LjItNS42LTIyLjktNi4xLTI1LjMgLjMtNTUuNSAxMC41LTc5LjEgMy41LTcuOSA2LjUtMTcuMiAxMS43LTI0LjEgLjMtLjYgLjUtMS41LS42LTEuMS00LjIgMS43LTguMiA2LjItMTIuMyA4LjUtOC43IDQuOS0xOC4xIDkuOS0yNi4zIDE1LjdzLTE4LjUgOS4xLTI3LjQgMTMuMWMtMTkuMSA4LjQtNDAuMSAxNi45LTYwLjggMjAuMi03LjEgMS4xLTEzLjggMi44LTIxIDMtMy40IC4xLTUuNiAxLjMtNy44LTIuMS0uNy0yLjkgMi4xLTMuNyA0LjItNSAzLjgtMi41IDguMS01LjEgMTEuNi03LjkgMTYuNi0xMy40IDM2LjMtMjMuMSA1MS40LTM4LjUgMS4zLTIuMi0zLS4xLTMuNiAuMy0zLjcgMS44LTcuNCAzLjYtMTEgNS41LTkuMyA0LjctMTguNiA5LjItMjguMSAxMy45LTIyLjYgMTEuNC00OCAxOS42LTcyLjcgMjQuOC01LjMgMS4yLTEwLjkgMi4xLTE2LjIgMy4zLTQgMS04LjcgMi41LTEyLjggMS4zLTIuNy0yLjQgNC44LTUuOSA2LjgtNi44IDkuMi00LjcgMTkuOS05LjIgMjguNC0xNS4xIDEwLjMtNy4zIDIyLjEtMTMuMiAzMy0xOS41IDEyLjgtNy4yIDI0LjktMTYuMiAzNi42LTI0LjkgNC4xLTMgOC42LTUuMSAxMi40LTguNSAxLjUtMi4yLTYuNC0uOS04LjEtLjctOSAuNi0xOC4xIDIuNi0yNy4xIDIuOS0xOC4yIC42LTM2LjggMi45LTU0LjkgNS4xLTUuOCAuNy0xMS43IDEuMy0xNy41IDItNCAuNS04IDEuOC0xMS45IC4yLTEuNi0xLjcgLjQtMi42IDEuOS0zLjIgMy40LTEuMyA2LjktMi4yIDEwLjQtMy4xIDE1LjYtNC4yIDMxLjItOS42IDQ3LTEzIDExLjgtMi42IDIzLjMtOCAzNC44LTExLjcgMjUuNS04LjEgNTAtMTguNiA3NC43LTI4LjggODIuNC0zNC40IDE1Ny42LTg2LjkgMjI3LTE0MiAyMi42LTE3LjkgNDQuNy0zNS44IDY1LjItNTYuMyA2LjYtNi42IDE1LjYtMTMuMiAyMC44LTIxIC42LTEuOS0xLjgtMi4xLTMuMi0yLjUtMy40LTEtNi42LTIuMy05LjktMy42LTYuMS0yLjMtMTAuNi04LjEtMTYuNi0xMC4yLTIuMy0uOS02LjMgLjEtOC44IC4xLTYuNiAwLTEzLjMgLjItMTkuNy0xLjMtMjIuOC01LjUtNDguMy0xNi44LTYzLjMtMzUuNy00LjctNS45LTYuNy0xMy0xMC44LTE5LTEuOC0uOS02IDEuNi03LjkgMi4zLTcuMyAyLjYtMTQuNiA0LjUtMjIuMSA2LjQtMTEuMyAyLjctMjMuMSAzLTM0LjYgNC40LTE2LjkgMi0zMy44IDQuNC01MC42IDcuOS04LjYgMS45LTE3LjQgNC4zLTI1LjcgNy4zLTMgMS03LjcgMi43LTEwLjQgLjMtNS4yLTQuMyA0LjktMTMuNSA3LjgtMTYuNCAxMi44LTEyLjcgMjguOS0yMyA0NC41LTMyIDI5LjctMTYuOSA2Mi44LTI3LjkgOTYuNS0zNCAxNi44LTMgMzQuMy01LjkgNTEuNC03LjEgOS4zLS43IDE5LTEuNCAyOC4yLTMuMyAxMi45LTIuNyAyNS41LTguNSAzNy43LTEzLjIgMS4zLTEuMi02LjQtOC4zLTcuNS0xMC42LTMuNS03LjUtMS41LTEyLjcgMS41LTE5LjctLjYtMy40LTEwLjgtNi41LTEzLjctOC4xLTEzLjQtNy4xLTM1LjYtMjEuNC0yNi41LTM5LjQgMS4xLTIuNCAyLjQtNC4zIDQuNS01LjggMS4xLTEuNy0xLjgtMy4xLTIuOS0zLjktNC4zLTIuNy04LjktNC44LTEyLjctOC4zLTktOC4zLTI0LjgtMTkuMi0xOC40LTM0IDEuMi0yLjggMi42LTUgNC41LTcuMiAuMi0xLjctMS44LTIuNS0yLjgtMy42LTIuOS0yLjYtNi40LTQuNS05LjMtNy4yLTEwLjQtOS44LTI4LjYtMjUuNS0xOC4xLTQxLjcgMS41LTIuMyAzLjQtMy4yIDUuNi00LjggMS41LTEuOC0xLjctMy45LTIuOS01LjEtNC4yLTQuMi05LjItOC4xLTEyLjUtMTMtNy41LTEwLjktMTQuNi0yMy44LTYtMzYuNCAxLjUtMi4yIDQuMy0yLjYgNi4xLTQuNCAuOC0yLjEtLjItMy44LS4zLTYtLjUtNS44LTEuMy0xMS43LTItMTcuNS0xLjktMTUuOCAuMS0zMy4yIDItNDguOCA2LjEtNTEuNSAzMi4yLTEwMC4zIDc4LjktMTI1LjEgMTIuNS02LjYgMjUuMi0xMS45IDM5LjQtMTMuMSAzLjUtLjIgOS4xIDAgMTIuMy0xLjIgMi40LS45IDQuMy00LjEgNi43LTUuMyA2LjktMy40IDEzLjktLjggMTkuNyAyLjkgMi44IC42IDMuNS0yLjQgNS4xLTQuMSAyLjktMi45IDYuMS01LjEgMTAtNi41IDEyLjMtNC4zIDI0LjggNCAzMS41IDEzLjYgMS43IDIuNSAxLjggNS44IDMuMyA4LjV6TTcwOS45IDI0NC41YzIuOCAuNCA1LjgtMy4xIDgtNC42czcuNS00LjEgNy44LTctMi40LTYtMy41LTguMWMtMy40LTYuOS0xMC40LTIyLTIuNC0yNy4zIC43LTEtOS4yLTMuOC0xMS00LjgtNi4yLTMtMTQuNC05LTE4LjItMTQuOC0xLjctMi41LTMuMy02LTIuMi05czQtMy45IDYuNC01LjRjMi4xLTIuOS05LTIuNS0xMC4yLTIuNi01LjgtLjQtMTIuNC0yLjUtMTcuNi00LjktNC4yLTItMTIuNy01LTEzLjgtMTAuMi0xLjEtNS44IDYuMS0xMS44IDkuOC0xNS4xIDEuMi0yLjItMi40LTQuOS00LTYuMi01LjUtNC4zLTExLjQtOC43LTE2LjUtMTMuNS03LjYtNy4zLTE2LjctMTMuNy0yNS40LTE5LjZzLTE3LjgtMTMuOC0yOC4xLTE4LjRjLTMuNi0xLjYtOC44IC41LTEyLjgtLjItNi42LTEuMi05LjUtNS45LTE0LjUtOS4zLTQuMy0uMy05LjggMy45LTE0LjMgNC40LTEyLjUgMS41LTIwLjktNi4xLTI4LjMtMTQuOC0xLjUtLjctMy43IDEuMi01LjEgMS45LTIuOCAxLjMtNi44IDIuMy05LjggMS44cy01LjktMi04LjMtMy43Yy0xLjMtLjgtMi41LTIuOC00LjItMi43LTEwLjEgLjgtMjAuNSA1LjItMjkuNyA5LjEtMzUuMiAxNC42LTU4IDQ1LjctNjguNSA4MS41LTMuNyAxMi42LTUuMSAyNS41LTYuNiAzOC40LTEuNyAxNC40LS40IDI4LjggLjEgNDMuMSAuMiA1LjYgLjEgMTQuNyAyLjggMTkuNyAxLjQgMi42IDYuMyAyLjQgOC45IDMuMSAzLjggMS4yIDUuNyAzLjcgOC4yIDYuNiAxLjMgLjUgLjEtNS4zIC4xLTYuNC0uMi00LjctMS05LjItMS0xNCAwLTEzLjktLjMtMjcuNiAyLjItNDEuMyA0LjYtMjUuMiAxNC41LTUwLjggMzMtNjkgMTEtMTAuOCAyNi40LTE3LjkgNDEuMS0yMS45IDI3LjYtNy40IDU4LjMtMS40IDg0IDkuOSA0Mi4zIDE4LjcgNzkuOSA0OC44IDEwOC40IDg1LjEgOC44IDExLjMgMTYuNCAyMy41IDI1IDM1IDMuNCA0LjYgNS43IDExLjYgMTAuMiAxNS4yek01MzkgNDYxLjJjMy4zIC44IDcuNC0zLjUgMTAuMi00LjkgMTAuNC01LjMgMjAuNC0xMS4zIDMwLTE3LjkgMTAuOS03LjYgMjEuOC0xNS4zIDMyLjgtMjIuNyAzLjMtMi4zIDYuMi00LjggOS4xLTcuNCAxLjQtMS4xIDMuMy0xLjcgNC4yLTMuMyAxLjgtMy4zIC43LTkuMSAuNy0xMi44IDAtOC40IDEuMi0xNi42IDIuMS0yNC45IDIuMS0yMC4zIDExLTM5LjkgMjAuMi01Ny44IDYuNi0xMy4yIDE3LjItMjUuMiAyNy44LTM1LjEgMy4xLTIuOSA2LjYtNS40IDkuNS04LjUgMS0xLjEgMy0yLjQgMi45LTQtLjEtMi43LTIuNy01LjUtMy45LTcuOC0zLjgtNy40LTguNi0xNC4zLTEzLjEtMjEuMy0xOC40LTI4LjEtNDEuMS01NC4yLTY4LTc0LjUtMjcuNy0yMS01OS4xLTM3LjMtOTQuNi0zNy4zLTE0LjYgMC0zMi40IDMtNDMuNyAxMy4zLTUuNSA0LjktMTAuMiA5LjQtMTQuNSAxNS40LTUuMSA3LTkuNSAxNS41LTEyLjQgMjMuNy03LjQgMjEuNi03LjQgNDMuNS03LjMgNjYuMSAwIDcuMSAyIDE0LjEgMi45IDIxLjEgMS45IDE1LjIgNi4xIDMwLjEgMTAuOCA0NC43IDEzLjQgNDIuMiAzNC4yIDgwLjkgNjAuOSAxMTYgMTAuNCAxMy42IDIwLjggMjguMiAzMy40IDM5Ljl6TTQwNS45IDI5NS41YzMuMSAxLjMgNi43IDEuMiAxMCAyLjcgMi4xLS4zIC4zLTQuMS0uMS01LjMtMi01LjgtMi41LTEyLjItNC40LTE3LjktMS41LTIuNy0yLjIgNS41LTIuNSA3LS42IDMuNi00IDEwLjEtMyAxMy41ek00MjUuMiAzNDcuNGMxLjUgMi41IDYuMiAxLjggOC42IDEuMiAxLjUtMS42IC4zLTMuMS0uNC00LjgtMS43LTQuNi0zLjQtOS40LTUuNy0xMy43LTEuNS0uOS0xLjUgMi42LTEuNiAzLjYtLjQgNC4yLTEuMiA5LjYtLjkgMTMuN3pNMTAzMS44IDM4NS43YzEuNCAxIDEuOS0yLjIgMi0zLjEgLjYtNC0uNS04LjQtLjktMTIuMy0xLjMtMTIuNS02LjktMjQuNi0xMi0zNS45LTEuMS0xLjItLjkgMy40LS44IDQgLjUgNC40IDEuOSA4LjcgMS45IDEzLjEgMCA1LjYtMi4zIDEyLTEuNCAxNy40IC4zIDIuMSAyLjUgMy40IDMuNiA1IDIuNyAzLjkgNC45IDggNy42IDExLjh6TTQ1My4xIDQwMS4zYy45IDEuOSA2LjQtLjIgOC4zLS41IDEuOS0uOS0uNS0zLjQtMS4yLTQuNy0yLjUtNC00LjgtOC4xLTcuNC0xMi0xLjItLjMtLjggMi43LS44IDMuMyAwIDQuOCAuNyA5LjIgMS4xIDEzLjl6TTQ4Mi40IDQzMC44YzEuNCA2IC4xIDEzLjYgMyAxOS4xIDEuMyAuOSAzLjItLjUgNC42LS45IDIuNS0uNyA0LjEtLjUgNi43LS4zIDEuNC0xLTEuMS0zLjYtMS45LTQuNS0zLjEtMy40LTUuNi03LjQtOC44LTEwLjctLjYtLjctMy40LTUuNS0zLjYtMi43ek01MTIuNCA0NjYuOGMuNiAyLjYgLjQgNS4yIC44IDcuOCAxLjEgMS41IDMuNy0uNyA0LjgtMS42IDEuNy0yLjgtNS40LTcuOS01LjYtNi4yeiIvPgogIDwhLS0g5aGr5YWF5bGC77ya5bu26L+f5reh5YWlIC0tPgogIDxwYXRoIGNsYXNzPSJjeS1zcGxhc2gtZmlsbCIgZmlsbD0iI2VjODZiYiIgZmlsbC1ydWxlPSJub256ZXJvIiBtYXNrPSJ1cmwoI2N1dCkiIGQ9Ik01NjggMzguOGMxLjMgLjkgNC4zLS43IDYtLjggNC43LS4zIDkuNi0uNSAxMy43IDIuMyAzLjIgMi4zIDUuNCA0LjIgNy40IDcuNiAxLjEgMS44IDEuMyA0LjYgMyA2IDcuMiA2LjEgMTYuOSAxMC4zIDI0LjggMTUuNyA2LjcgNC40IDE0LjggOS45IDIwLjYgMTUuNCA0IDMuOSA4LjYgOS4zIDEzLjUgMTIgMy44IDEuMyAxLjEtNi43IDEtOC41LS4yLTYuNC0uMy0xMi43IDAtMTkgLjEtMy4xIC45LTYuOCA0LjYtNy40IDUuOS0uOSAxMS4xIDUuMyAxNC4xIDkuNyA3LjUgMTEgMTkuMSAyMS43IDIxLjQgMzUuNSAxLjUgMyA0LjYtNC42IDUuOS01LjggNC40LTQgOS42LTguOSAxNS43LTQuNyA0IDIuOCAyLjYgOC45IDMuNiAxMi45IDIuMiA4LjMgNS43IDE2LjMgNC42IDI1LjItLjUgNC4xLTIuMyA3LjctMy4xIDExLjcgLjEgMS44IDIuNiAxLjUgMy45IDIuMnMyLjUgMi41IDMuMiA0LjNjMi41IDYuOCA2LjEgMTMuNyA3LjggMjAuNyAuOCAzLjQtLjUgNi45IDAgMTAuMiAuOCAxLjEgMS41IDEuNyAyLjcgLjggMS4zLTIgMi00LjkgMy44LTYuNiA0LjEtMy43IDguNy0uMSAxMC41IDMuNiAyLjggNS40IDUuNSAxMS4xIDcgMTcgLjggMy4zIC43IDcgMS44IDEwLjIgMi44IDIuMyA2LjkgLjUgMTAuMSAuMXM1LjcgLjMgOC4zLS43YzMuNy0xLjMgNi45LTUuNSAxMC4xLTcuNyAuOS0xLjctMi42LTMuOC0zLjgtNC45LTUuMi00LjktMTEuNC04LjUtMTUuOS0xNC4xLTExLjMtMTQuNS0yMS41LTI4LjctMjYuOC00Ni43LTQuOS0xNi42LTcuMy0zNy4xLTMuMi01NC4yIDEuMy01LjIgMi40LTE4LjUgMTAuOC0xNS40IDQuMyAxLjUgNC45IDcuOCA2LjcgMTEuMyA1IDEwLjIgMTAuNSAyMCAxNy41IDI5IDE1LjQgMTkuNiAzNy43IDI4LjggNTYuNyA0My44IDUuMSA0LjEgMTAuMyA4LjkgMTQuOCAxMy43IDIuOSAzLjIgNS4zIDggOS4xIDEwLjMgMy41IC41IDcuNy0yIDExLjEtMyA1LjYtMS42IDEyLjEtMi4xIDE3LjktMS40IDguNyAxLjEgNC44IDkuMSA5IDEzLjUgMi42IDIuNyA5IDMuNyAxMi4zIDUuNyA1LjMgMy4yIDcuNiA4LjIgMTAuNiAxMy4zIDEuNSAxLjYgNC4zLTEuMSA2LTEuOCAzLTEuMyA2LjMtLjUgOC45IDEuNSA2LjcgNS40IDEwLjYgMTQuNyAxNi44IDIwLjcgMi45IDIuNiA2LjUgNC41IDkuMyA3LjIgOS42IDkuNCAxOS4yIDE5IDI5IDI4IDMuNiAzLjQgNS45IDggOS40IDExLjYgMTUuMyAxNS41IDI2LjMgMzQuNSAzNiA1NCA3IDEzLjkgMTIuOCAzMi40IDkuMSA0OC0uOSA0LjEtLjkgOC4yLTMuMSAxMS45LTEuNiAyLjktNC4yIDQuNC02LjQgNi42LS4zIDIuNyAzLjMgNS42IDQuNyA3LjcgNC4yIDUuOSA4LjIgMTIgMTEuNyAxOC4zIDEyLjUgMjIgMTguOSA0OCAxNC44IDczLjItMS4yIDcuNy01LjggMjMuMi0xNC4yIDI2LTEuOC0uMi0xLjgtMS43LTEuNi0zLjMgLjYtNC4xIDIuMi04LjEgMi43LTEyLjMgMS4zLTExLjEgLjktMjMuMi0yLjgtMzQtMS40LTIuOS0zLjcgNy4xLTQuMSA4LjYtLjcgMi42LTIuMiA1LjEtMi44IDcuNy0xLjEgNS42LS4yIDEyLjEtLjIgMTcuOCAwIDE5LjMtOSAzOS40LTIwLjcgNTQuMy00LjIgNS40LTExLjQgMTQuNy0xOC43IDE1LjQtNC40LTEuNC0xLjktNy42LTEuMS0xMC43IDIuNi0xMC41IDQuNC0yMy45IDIuMi0zNC43LTEuOC0yLjItNC43IC40LTYuOCAxLjEtNiAyLjItMTIuNSAzLjctMTguNyA1LjMtMi4yIC41LTUuNCAwLTYuOCAyLjItMS44IDMuMi0xLjIgNy4xLTEuNSAxMC41LS43IDEwLjQgMSAxOS4yIDMuMyAyOS40IDUuNCAyMy41IDI1LjkgNDUuOCA0Ny4xIDU2LjQgOC42IDQuMyAxOC4zIDQuNSAyNy4yIDcuMyAzLjIgMi45LTEuNCA1LjUtMy44IDYuNy02LjggMy41LTE0LjEgMi43LTIxLjMgNC4xLTIuNCAxLjggNS4xIDQuOSA2LjYgNS43IDUuOSAzLjEgMTEuOSA2LjggMTguMyA4LjcgMi43IC43IDUuOSAuNCA4IDIuNSAxLjYgMy45LTEuNSA1LjEtNC44IDUuOC02LjIgMS40LTEzLjUgMi44LTE5LjggMS4zLTE1LjYtMy42LTI5LjMtNy4xLTQzLjQtMTUuMS01LjEtMi44LTEwLjctNi41LTE1LjEtMTAuNC0yLjctMi40LTUuNy01LjctOC45LTcuMy0xLjUgLjEgMSA0LjggMS41IDUuNyAyLjkgNi4yIDUuNyAxMiA5IDE4IDExLjggMjIuNCAyNS4xIDQ3LjEgNDMgNjUgNSA1IDkuMiAxMC43IDE0LjQgMTUuNiAxMS43IDEwLjggMjYuOCAyMS42IDQyLjEgMjYuOSA0MS41IDE0LjIgODcuNy0xLjcgMTI0LjQtMjIuNSAxNi05IDMxLjEtMTkuNSA0NC41LTMyIDE2LjUtMTUuMyAzMi40LTMyIDM4LjUtNTQuNSAxMi43LTQ3LTI4LjUtMTAzLjctNzguMi0xMDEuNi0xMC45IC40LTIxLjcgMi43LTMxLjggNy4xLTIuNSAxLjEtNS4xIDEuNS03LjQgMy4xLTcgNC45LTEzLjMgMTIuNy0yMS4xIDE2LjItMy4zLS4yLTUuMS00LjctNS4yLTcuNS0uMS03LjEgMy43LTE0LjEgNi44LTIwLjIgOS4xLTE4LjMgMjkuNi0yOS45IDQ4LjUtMzUuNSA2LjctMS45IDEzLjMtMi4zIDIwLjItMi4zczEzLjItLjMgMTkuNyAxLjNjMjguNCA3LjEgNDguNSAyOC42IDYxLjggNTMuNyA3LjggMTQuNiAxMC40IDMwLjcgMTMuMiA0Ni44IDguNCA0OC41LTExLjkgMTAxLjYtNDYgMTM2LjQtOS42IDkuOC0xOC4zIDIwLjctMjkuMiAyOS4zLTkuMyA3LjMtMTguNiAxNC40LTI4LjMgMjEuMi03LjcgNS4zLTE3LjEgOC43LTI0LjYgMTQuMi0uNCAxIDUuOSAyLjQgNy4yIDIuOCA4LjYgMi43IDE3LjMgNS40IDI1LjcgOC44IDIyLjQgOS4zIDQzLjYgMTkuMyA2NC43IDMxLjMgNTcuMSAzMi4yIDEwMy43IDg1IDEzMi44IDE0My4yIDcgMTQgMTMuMiAyOC4zIDE4LjQgNDMuMSAxLjQgNCA1LjEgMTEuNyAyLjcgMTUuNS0yLjMgMi4xLTYuMiAxLjQtOS4xIDEuNC02LjUgMC0xMyAwLTE5LjUgMC0yNyAwLTU0IDAtODEgMC01MS41IDAtMTAzIDAtMTU0LjUgMC0xNiAwLTMyIDAtNDggMC02LjggMC0xNS42IDEuNS0yMi4yLS4zLTguNS0yLjUtMTYuOC04LjctMjQuMy0xMy4yLTEyLjYtNy40LTI1LjYtMTQuMS0zNy44LTIyLjItNy45LTUuNC0xNS0xMS45LTIzLTE3LjMtMS43LS41IDAgMi40IC4yIDMuMSAxLjQgMy44IDIuMSA4IDMuMSAxMS45IDIuMSA4LjYgNCAxNy4xIDUuNyAyNS44IC43IDMuNCAyLjUgNy42IDEgMTAuOS0yLjcgMi43LTEwLjEgMS4zLTEzLjcgMS4zLTEyLjUgMC0yNSAwLTM3LjUgMC01MSAwLTEwMiAwLTE1MyAwLTE0MSAwLTI4MiAwLTQyMyAwLTM5LjUgMC03OSAwLTExOC41IDAtMTEgMC0yMiAwLTMzIDAtMy42IDAtOS44IDEuMi0xMy4xLS40LTIuMi0xLjItMy40LTUuNy00LjEtNy45LTIuNC03LjYtMy44LTE1LjItNS42LTIyLjktNi4xLTI1LjMgLjMtNTUuNSAxMC41LTc5LjEgMy41LTcuOSA2LjUtMTcuMiAxMS43LTI0LjEgLjMtLjYgLjUtMS41LS42LTEuMS00LjIgMS43LTguMiA2LjItMTIuMyA4LjUtOC43IDQuOS0xOC4xIDkuOS0yNi4zIDE1LjdzLTE4LjUgOS4xLTI3LjQgMTMuMWMtMTkuMSA4LjQtNDAuMSAxNi45LTYwLjggMjAuMi03LjEgMS4xLTEzLjggMi44LTIxIDMtMy40IC4xLTUuNiAxLjMtNy44LTIuMS0uNy0yLjkgMi4xLTMuNyA0LjItNSAzLjgtMi41IDguMS01LjEgMTEuNi03LjkgMTYuNi0xMy40IDM2LjMtMjMuMSA1MS40LTM4LjUgMS4zLTIuMi0zLS4xLTMuNiAuMy0zLjcgMS44LTcuNCAzLjYtMTEgNS41LTkuMyA0LjctMTguNiA5LjItMjguMSAxMy45LTIyLjYgMTEuNC00OCAxOS42LTcyLjcgMjQuOC01LjMgMS4yLTEwLjkgMi4xLTE2LjIgMy4zLTQgMS04LjcgMi41LTEyLjggMS4zLTIuNy0yLjQgNC44LTUuOSA2LjgtNi44IDkuMi00LjcgMTkuOS05LjIgMjguNC0xNS4xIDEwLjMtNy4zIDIyLjEtMTMuMiAzMy0xOS41IDEyLjgtNy4yIDI0LjktMTYuMiAzNi42LTI0LjkgNC4xLTMgOC42LTUuMSAxMi40LTguNSAxLjUtMi4yLTYuNC0uOS04LjEtLjctOSAuNi0xOC4xIDIuNi0yNy4xIDIuOS0xOC4yIC42LTM2LjggMi45LTU0LjkgNS4xLTUuOCAuNy0xMS43IDEuMy0xNy41IDItNCAuNS04IDEuOC0xMS45IC4yLTEuNi0xLjcgLjQtMi42IDEuOS0zLjIgMy40LTEuMyA2LjktMi4yIDEwLjQtMy4xIDE1LjYtNC4yIDMxLjItOS42IDQ3LTEzIDExLjgtMi42IDIzLjMtOCAzNC44LTExLjcgMjUuNS04LjEgNTAtMTguNiA3NC43LTI4LjggODIuNC0zNC40IDE1Ny42LTg2LjkgMjI3LTE0MiAyMi42LTE3LjkgNDQuNy0zNS44IDY1LjItNTYuMyA2LjYtNi42IDE1LjYtMTMuMiAyMC44LTIxIC42LTEuOS0xLjgtMi4xLTMuMi0yLjUtMy40LTEtNi42LTIuMy05LjktMy42LTYuMS0yLjMtMTAuNi04LjEtMTYuNi0xMC4yLTIuMy0uOS02LjMgLjEtOC44IC4xLTYuNiAwLTEzLjMgLjItMTkuNy0xLjMtMjIuOC01LjUtNDguMy0xNi44LTYzLjMtMzUuNy00LjctNS45LTYuNy0xMy0xMC44LTE5LTEuOC0uOS02IDEuNi03LjkgMi4zLTcuMyAyLjYtMTQuNiA0LjUtMjIuMSA2LjQtMTEuMyAyLjctMjMuMSAzLTM0LjYgNC40LTE2LjkgMi0zMy44IDQuNC01MC42IDcuOS04LjYgMS45LTE3LjQgNC4zLTI1LjcgNy4zLTMgMS03LjcgMi43LTEwLjQgLjMtNS4yLTQuMyA0LjktMTMuNSA3LjgtMTYuNCAxMi44LTEyLjcgMjguOS0yMyA0NC41LTMyIDI5LjctMTYuOSA2Mi44LTI3LjkgOTYuNS0zNCAxNi44LTMgMzQuMy01LjkgNTEuNC03LjEgOS4zLS43IDE5LTEuNCAyOC4yLTMuMyAxMi45LTIuNyAyNS41LTguNSAzNy43LTEzLjIgMS4zLTEuMi02LjQtOC4zLTcuNS0xMC42LTMuNS03LjUtMS41LTEyLjcgMS41LTE5LjctLjYtMy40LTEwLjgtNi41LTEzLjctOC4xLTEzLjQtNy4xLTM1LjYtMjEuNC0yNi41LTM5LjQgMS4xLTIuNCAyLjQtNC4zIDQuNS01LjggMS4xLTEuNy0xLjgtMy4xLTIuOS0zLjktNC4zLTIuNy04LjktNC44LTEyLjctOC4zLTktOC4zLTI0LjgtMTkuMi0xOC40LTM0IDEuMi0yLjggMi42LTUgNC41LTcuMiAuMi0xLjctMS44LTIuNS0yLjgtMy42LTIuOS0yLjYtNi40LTQuNS05LjMtNy4yLTEwLjQtOS44LTI4LjYtMjUuNS0xOC4xLTQxLjcgMS41LTIuMyAzLjQtMy4yIDUuNi00LjggMS41LTEuOC0xLjctMy45LTIuOS01LjEtNC4yLTQuMi05LjItOC4xLTEyLjUtMTMtNy41LTEwLjktMTQuNi0yMy44LTYtMzYuNCAxLjUtMi4yIDQuMy0yLjYgNi4xLTQuNCAuOC0yLjEtLjItMy44LS4zLTYtLjUtNS44LTEuMy0xMS43LTItMTcuNS0xLjktMTUuOCAuMS0zMy4yIDItNDguOCA2LjEtNTEuNSAzMi4yLTEwMC4zIDc4LjktMTI1LjEgMTIuNS02LjYgMjUuMi0xMS45IDM5LjQtMTMuMSAzLjUtLjIgOS4xIDAgMTIuMy0xLjIgMi40LS45IDQuMy00LjEgNi43LTUuMyA2LjktMy40IDEzLjktLjggMTkuNyAyLjkgMi44IC42IDMuNS0yLjQgNS4xLTQuMSAyLjktMi45IDYuMS01LjEgMTAtNi41IDEyLjMtNC4zIDI0LjggNCAzMS41IDEzLjYgMS43IDIuNSAxLjggNS44IDMuMyA4LjV6TTcwOS45IDI0NC41YzIuOCAuNCA1LjgtMy4xIDgtNC42czcuNS00LjEgNy44LTctMi40LTYtMy41LTguMWMtMy40LTYuOS0xMC40LTIyLTIuNC0yNy4zIC43LTEtOS4yLTMuOC0xMS00LjgtNi4yLTMtMTQuNC05LTE4LjItMTQuOC0xLjctMi41LTMuMy02LTIuMi05czQtMy45IDYuNC01LjRjMi4xLTIuOS05LTIuNS0xMC4yLTIuNi01LjgtLjQtMTIuNC0yLjUtMTcuNi00LjktNC4yLTItMTIuNy01LTEzLjgtMTAuMi0xLjEtNS44IDYuMS0xMS44IDkuOC0xNS4xIDEuMi0yLjItMi40LTQuOS00LTYuMi01LjUtNC4zLTExLjQtOC43LTE2LjUtMTMuNS03LjYtNy4zLTE2LjctMTMuNy0yNS40LTE5LjZzLTE3LjgtMTMuOC0yOC4xLTE4LjRjLTMuNi0xLjYtOC44IC41LTEyLjgtLjItNi42LTEuMi05LjUtNS45LTE0LjUtOS4zLTQuMy0uMy05LjggMy45LTE0LjMgNC40LTEyLjUgMS41LTIwLjktNi4xLTI4LjMtMTQuOC0xLjUtLjctMy43IDEuMi01LjEgMS45LTIuOCAxLjMtNi44IDIuMy05LjggMS44cy01LjktMi04LjMtMy43Yy0xLjMtLjgtMi41LTIuOC00LjItMi43LTEwLjEgLjgtMjAuNSA1LjItMjkuNyA5LjEtMzUuMiAxNC42LTU4IDQ1LjctNjguNSA4MS41LTMuNyAxMi42LTUuMSAyNS41LTYuNiAzOC40LTEuNyAxNC40LS40IDI4LjggLjEgNDMuMSAuMiA1LjYgLjEgMTQuNyAyLjggMTkuNyAxLjQgMi42IDYuMyAyLjQgOC45IDMuMSAzLjggMS4yIDUuNyAzLjcgOC4yIDYuNiAxLjMgLjUgLjEtNS4zIC4xLTYuNC0uMi00LjctMS05LjItMS0xNCAwLTEzLjktLjMtMjcuNiAyLjItNDEuMyA0LjYtMjUuMiAxNC41LTUwLjggMzMtNjkgMTEtMTAuOCAyNi40LTE3LjkgNDEuMS0yMS45IDI3LjYtNy40IDU4LjMtMS40IDg0IDkuOSA0Mi4zIDE4LjcgNzkuOSA0OC44IDEwOC40IDg1LjEgOC44IDExLjMgMTYuNCAyMy41IDI1IDM1IDMuNCA0LjYgNS43IDExLjYgMTAuMiAxNS4yek01MzkgNDYxLjJjMy4zIC44IDcuNC0zLjUgMTAuMi00LjkgMTAuNC01LjMgMjAuNC0xMS4zIDMwLTE3LjkgMTAuOS03LjYgMjEuOC0xNS4zIDMyLjgtMjIuNyAzLjMtMi4zIDYuMi00LjggOS4xLTcuNCAxLjQtMS4xIDMuMy0xLjcgNC4yLTMuMyAxLjgtMy4zIC43LTkuMSAuNy0xMi44IDAtOC40IDEuMi0xNi42IDIuMS0yNC45IDIuMS0yMC4zIDExLTM5LjkgMjAuMi01Ny44IDYuNi0xMy4yIDE3LjItMjUuMiAyNy44LTM1LjEgMy4xLTIuOSA2LjYtNS40IDkuNS04LjUgMS0xLjEgMy0yLjQgMi45LTQtLjEtMi43LTIuNy01LjUtMy45LTcuOC0zLjgtNy40LTguNi0xNC4zLTEzLjEtMjEuMy0xOC40LTI4LjEtNDEuMS01NC4yLTY4LTc0LjUtMjcuNy0yMS01OS4xLTM3LjMtOTQuNi0zNy4zLTE0LjYgMC0zMi40IDMtNDMuNyAxMy4zLTUuNSA0LjktMTAuMiA5LjQtMTQuNSAxNS40LTUuMSA3LTkuNSAxNS41LTEyLjQgMjMuNy03LjQgMjEuNi03LjQgNDMuNS03LjMgNjYuMSAwIDcuMSAyIDE0LjEgMi45IDIxLjEgMS45IDE1LjIgNi4xIDMwLjEgMTAuOCA0NC43IDEzLjQgNDIuMiAzNC4yIDgwLjkgNjAuOSAxMTYgMTAuNCAxMy42IDIwLjggMjguMiAzMy40IDM5Ljl6TTQwNS45IDI5NS41YzMuMSAxLjMgNi43IDEuMiAxMCAyLjcgMi4xLS4zIC4zLTQuMS0uMS01LjMtMi01LjgtMi41LTEyLjItNC40LTE3LjktMS41LTIuNy0yLjIgNS41LTIuNSA3LS42IDMuNi00IDEwLjEtMyAxMy41ek00MjUuMiAzNDcuNGMxLjUgMi41IDYuMiAxLjggOC42IDEuMiAxLjUtMS42IC4zLTMuMS0uNC00LjgtMS43LTQuNi0zLjQtOS40LTUuNy0xMy43LTEuNS0uOS0xLjUgMi42LTEuNiAzLjYtLjQgNC4yLTEuMiA5LjYtLjkgMTMuN3pNMTAzMS44IDM4NS43YzEuNCAxIDEuOS0yLjIgMi0zLjEgLjYtNC0uNS04LjQtLjktMTIuMy0xLjMtMTIuNS02LjktMjQuNi0xMi0zNS45LTEuMS0xLjItLjkgMy40LS44IDQgLjUgNC40IDEuOSA4LjcgMS45IDEzLjEgMCA1LjYtMi4zIDEyLTEuNCAxNy40IC4zIDIuMSAyLjUgMy40IDMuNiA1IDIuNyAzLjkgNC45IDggNy42IDExLjh6TTQ1My4xIDQwMS4zYy45IDEuOSA2LjQtLjIgOC4zLS41IDEuOS0uOS0uNS0zLjQtMS4yLTQuNy0yLjUtNC00LjgtOC4xLTcuNC0xMi0xLjItLjMtLjggMi43LS44IDMuMyAwIDQuOCAuNyA5LjIgMS4xIDEzLjl6TTQ4Mi40IDQzMC44YzEuNCA2IC4xIDEzLjYgMyAxOS4xIDEuMyAuOSAzLjItLjUgNC42LS45IDIuNS0uNyA0LjEtLjUgNi43LS4zIDEuNC0xLTEuMS0zLjYtMS45LTQuNS0zLjEtMy40LTUuNi03LjQtOC44LTEwLjctLjYtLjctMy40LTUuNS0zLjYtMi43ek01MTIuNCA0NjYuOGMuNiAyLjYgLjQgNS4yIC44IDcuOCAxLjEgMS41IDMuNy0uNyA0LjgtMS42IDEuNy0yLjgtNS40LTcuOS01LjYtNi4yeiIvPgo8L3N2Zz4='

    // 新对话页那颗徽标：192px、背景已抠成透明的 WebP，
    // `node tools/inject-hero-mark.mjs` 负责填这一行。
    const HERO_MARK = 'data:image/webp;base64,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'

    // 对话背景水印：同样的处理，`node tools/inject-chat-bg.mjs` 负责填这两行。
    // 两张是因为浅底/深底要分开调色，栅格图跟不了 --cy-* 变量。
    const CHAT_ART_LIGHT = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTM2IiBoZWlnaHQ9IjEwMjQiIHZpZXdCb3g9IjAgMCAxNTM2IDEwMjQiPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0ieGgiIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIwIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMCIvPjxzdG9wIG9mZnNldD0iMC4wMzUiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMC4xNTYiLz48c3RvcCBvZmZzZXQ9IjAuMDciIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMC41Ii8+PHN0b3Agb2Zmc2V0PSIwLjEwNSIgc3RvcC1jb2xvcj0iI2ZmZiIgc3RvcC1vcGFjaXR5PSIwLjg0NCIvPjxzdG9wIG9mZnNldD0iMC4xNCIgc3RvcC1jb2xvcj0iI2ZmZiIgc3RvcC1vcGFjaXR5PSIxIi8+PHN0b3Agb2Zmc2V0PSIwLjkyIiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9IjEiLz48c3RvcCBvZmZzZXQ9IjAuOTQiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMC44NDQiLz48c3RvcCBvZmZzZXQ9IjAuOTYiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMC41Ii8+PHN0b3Agb2Zmc2V0PSIwLjk4IiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9IjAuMTU2Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9IjAiLz48L2xpbmVhckdyYWRpZW50PjxsaW5lYXJHcmFkaWVudCBpZD0ieHYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMCIvPjxzdG9wIG9mZnNldD0iMC4wMjUiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMC4xNTYiLz48c3RvcCBvZmZzZXQ9IjAuMDUiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMC41Ii8+PHN0b3Agb2Zmc2V0PSIwLjA3NSIgc3RvcC1jb2xvcj0iI2ZmZiIgc3RvcC1vcGFjaXR5PSIwLjg0NCIvPjxzdG9wIG9mZnNldD0iMC4xIiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9IjEiLz48c3RvcCBvZmZzZXQ9IjAuOSIgc3RvcC1jb2xvcj0iI2ZmZiIgc3RvcC1vcGFjaXR5PSIxIi8+PHN0b3Agb2Zmc2V0PSIwLjkyNSIgc3RvcC1jb2xvcj0iI2ZmZiIgc3RvcC1vcGFjaXR5PSIwLjg0NCIvPjxzdG9wIG9mZnNldD0iMC45NSIgc3RvcC1jb2xvcj0iI2ZmZiIgc3RvcC1vcGFjaXR5PSIwLjUiLz48c3RvcCBvZmZzZXQ9IjAuOTc1IiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9IjAuMTU2Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9IjAiLz48L2xpbmVhckdyYWRpZW50PjxtYXNrIGlkPSJtaCIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeD0iMCIgeT0iMCIgd2lkdGg9IjE1MzYiIGhlaWdodD0iMTAyNCI+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjE1MzYiIGhlaWdodD0iMTAyNCIgZmlsbD0idXJsKCN4aCkiLz48L21hc2s+PG1hc2sgaWQ9Im12IiBtYXNrVW5pdHM9InVzZXJTcGFjZU9uVXNlIiB4PSIwIiB5PSIwIiB3aWR0aD0iMTUzNiIgaGVpZ2h0PSIxMDI0Ij48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMTUzNiIgaGVpZ2h0PSIxMDI0IiBmaWxsPSJ1cmwoI3h2KSIvPjwvbWFzaz48L2RlZnM+PGcgbWFzaz0idXJsKCNtaCkiPjxnIG1hc2s9InVybCgjbXYpIiBmaWxsLW9wYWNpdHk9IjAuNSIgZmlsbC1ydWxlPSJub256ZXJvIj48cGF0aCBmaWxsPSIjZjRkZWU2IiBkYXRhLXRvbmU9ImNyZWFtIiBkPSJNMzc4LjQgMjcuN2MuNiAuNC0uNSAxLjYtLjcgMi0xLjUgMi4xLTMgNC4xLTQuMSA2LjQtMi43IDYtMy45IDEyLjQtMy42IDE4LjkgLjkgMTguMSAxNC42IDMyLjEgMjQuNSA0NS43IDEuMyAuNyA0LjUtMi45IDUuNi0zLjYgNS0zLjYgMTAuNi01IDE2LjYtNS45IDMuNC0uNSA2LjggLjIgMTAuMSAuNyA5LjIgMS40IDE3LjggNS4xIDI2LjEgOS4yIDI3LjQgMTMuNyA1Mi43IDMxLjMgNzcuNyA0OS4xIDE2LjcgMTEuOSAzMy4zIDI0LjEgNDkuMiAzNyAyOS41IDIzLjkgNTYuOCA1MC44IDgzLjUgNzcuOCAxNS4zIDE1LjUgMjkuNSAzMi4xIDQyLjkgNDkuMyAzLjQgNC40IDYuNyA4LjggMTAgMTMuMyAxLjIgMS42IDMuNCAzLjcgMy40IDUuOC0uOCAxLjctNCAxLjUtNS42IDEuNi01LjUgLjMtMTEgMS4yLTE2LjQgMS42LTExLjMgLjctMjIuNiAuMS0zMy44LTEuNC02LjQtLjktMTIuOC0xLjYtMTkuMS0zLjQtNC43LTEuNC03LjItNi41LTEwLjItMTAuMS0xLTEuMi0zLjEtMy4xLTMuMS00LjgtLjEtMi40IDQuMy00LjQgNS45LTUuNiA0LjUtMy41IDkuMS03IDEzLjgtMTAuMiAxLjktMS40IDUuNC0yLjkgNi42LTQuOSAuMS0uOC0xLjUgMC0xLjggLjItMS44IC45LTMuNiAxLjktNS40IDIuOS01LjMgMy0xMC44IDYuMS0xNS45IDkuNi0xLjUgMS00LjQgMy44LTYuMyAzLjctMS4yIDAtMi0xLjQtMi42LTIuMy0xLjktMi42LTMuOC01LjItNS45LTcuNi00LjctNS44LTkuOC0xMS4yLTE0LjYtMTYuOS0yLjItMi41LTQuNy00LjgtNy03LjMtLjktLjktMS40LTIuMy0yLjctMi45cy40IDEuNSAuNiAxLjhjMS41IDEuNSAyLjggMy4yIDQuMyA0LjcgMy43IDQuMSA3IDguNSAxMC42IDEyLjdzNy41IDkuNCAxMS4zIDE0LjJjLjkgMS4yIDMuNiAzLjQgMy4zIDUuMXMtMS42IDEuOS0yLjUgMi41Yy0yLjQgMS45LTUgMy42LTcuNSA1LjMtMS43IDEuMS00IDMuOC02IDQuMnMtNS00LjYtNi4yLTZjLTYuMS02LjYtMTIuMS0xMy40LTE4LjQtMTkuOC0xOC4xLTE4LjgtMzYuNi0zNi45LTU1LjktNTQuNC00LjUtNC4yLTkuMy04LjItMTMuOC0xMi40LTIuOS0yLjYtNS44LTUuOS05LjEtNy44LS41LS4xLS42IDAtLjUgLjUgMS4zIDIuMyA0IDMuOCA1LjkgNS43IDUuMiA1IDEwLjYgOS45IDE1LjkgMTQuOSAxOCAxNyAzNS4xIDM0LjggNTIgNTIuOSA1LjcgNi4yIDExLjQgMTIuMSAxNi43IDE4LjYgMS43IDIuMSA0LjYgNC4yIDUuNyA2LjctLjEgMS4yLTIgLjUtMi43IC4zLTIuOS0uOC01LjctMS44LTguNi0yLjctMTEuOC0zLjctMjIuNy05LjMtMzMuNS0xNS4yLTEzLjctNy42LTI1LjItMTguOC0zNi4yLTI5LjgtMTUuOC0xNS43LTMwLjgtMzIuMi00Ny4zLTQ3LjItNi42LTYuMS0xMi42LTEyLjktMTkuNi0xOC43LTIuMS0xLjgtMy45LTQuNi02LjUtNS43LS45LS4xIDEuMiAxLjkgMS40IDIuMSAxLjQgMS40IDIuNSAzIDMuOSA0LjQgMy44IDQuMSA3LjggOC4yIDExLjcgMTIuMiA3LjYgNy45IDE0LjkgMTYuMiAyMi41IDI0IDQuNCA0LjYgOS4zIDguOSAxMy4yIDEzLjlzOC4zIDkuMyAxMi40IDEzLjhjNS41IDYgMTAuNiAxMi41IDE1LjcgMTguOCA5LjcgMTIgMTguMyAyNC44IDI2LjkgMzcuNiA0LjUgNi43IDguNSAxMy41IDEyLjQgMjAuNiAxLjUgMi42IDQuNCA2LjQgNC42IDkuNSAwIDEuMy0xIDIuMi0xLjYgMy4yLTEuNSAyLTIuOSA0LjEtNC40IDYuMS0yLjggMy42LTQuOCA3LjctNy4xIDExLjYtMS42IDIuNy00LjIgNi4xLTQuNyA5LjIgLjMgMSAxLjQgLjIgMS45LS4yIDEuNC0xLjEgMi40LTIuNiAzLjYtMy45IDQuMi00LjQgNy4yLTkuNyAxMS4yLTE0LjMgMS4yLTEuMyAyLjgtNC40IDQuOS00LjEgMS41IC44IDIuMyAzLjUgMyA1IDIuMiA0LjUgNC41IDkuNCA2LjEgMTQuMSA1LjcgMTYuMSAxMS45IDMyLjQgMTEuOSA0OS42IDAgNC45IDEgMTEuNC0xLjIgMTUuOS0uOSAuOC0uOC0zLjgtLjgtNC40IDAtMi44LS4zLTUuNi0uNS04LjQtLjYtNi40LTItMTMtMy4zLTE5LjMtLjUtMi43LS44LTYuMy0yLjMtOC42LTEtLjctLjYgMS40LS41IDEuNyAuNCAyIC42IDMuOSAuOSA1LjkgLjcgNS4yIC44IDEwLjUgMS41IDE1LjcgLjIgMS44LS4yIDMuNC0uMSA1LjIgLjkgMTIuMS0yIDIzLjYtNC42IDM1LjItLjggMy42LTEuOCA2LjgtMy41IDEwLS42IDEuMy0xLjQgMy0yLjYgMy43LTEuNyAwLTEtNC4zLTEtNS4zIC4xLTUuNi0uMy0xMS4xLTEuNC0xNi42LTIuOS0xNC44LTcuNC0yOS42LTEzLjctNDMuMy0xNi4zLTM1LjgtNDAuOC02Ni44LTY3LjQtOTUuNC03LTcuNS0xMy43LTE1LjItMjEtMjIuNS0yLjQtMi4zLTUtNi42LTgtOC4xLTEuMy0uMiAyLjEgMy45IDIuNCA0LjUgMi4yIDMgNC40IDYuMSA2LjYgOS4xIDYuNSA4LjggMTMgMTcuNyAxOC45IDI2LjkgNC45IDcuNSAxMC4yIDE0LjkgMTUgMjIuNSAxMi45IDIwLjIgMjQuMSA0Mi41IDMyLjUgNjUgNS4xIDEzLjUgOS4yIDI3IDEzLjEgNDAuOSAxLjEgNCAyIDguMSAyLjkgMTIuMSAuMyAxLjUgMS4xIDMuMiAuOCA0LjctLjYgMi42LTQuMyA1LjQtNi4xIDcuMy01LjMgNS45LTEwLjUgMTItMTYuMSAxNy42LTQuMyA0LjMtOC41IDguNS0xMi43IDEyLjgtMS4yIDEuMi0zLjQgNC4zLTUuMiA0LjFzLTIuMS0xLjMtMi44LTIuMWMtMi4yLTIuMS00LjMtNC4zLTYuNC02LjQtNi42LTYuNi0xMy4zLTEzLjItMTkuOS0xOS45LTIuNC0yLjMtNS42LTYuOS04LjktNy44LTEuMSAuMSAxLjMgMi4zIDEuNiAyLjcgMS45IDIuNCA0LjEgNC45IDYuMyA3LjEgNy4zIDcuNCAxNC45IDE0LjggMjEuOSAyMi40IDEuNSAxLjggNC42IDQuMiA1LjUgNi40IC40IDEtLjUgMi4xLTEuNSAyLjVzLTIuOC0yLjEtMy43LTNjLTMuMS0zLjItNi41LTYuOC04LjktMTAuNS0zLjctNS42LTguOS0xMC4zLTEzLjMtMTUuMy03LjktOS4yLTE1LjktMTguNS0yNC4xLTI3LjYtMTIuMi0xMy4zLTI1LTI2LTM2LjctMzkuOC0yMi43LTI2LjQtNDQuNC01Ni01Ny44LTg4LjUtOC0xOS4yLTE1LTM4LjgtMTkuNi01OS4xLTEuNi03LjEtMy4xLTE0LjItNC4xLTIxLjQtLjUtMy4yLS4zLTgtMS43LTEwLjktMS0xLS41IDIuNS0uNSAyLjkgLjEgMy4yIC44IDYuMyAxIDkuNCAuNiA4LjUgMi44IDE3IDQuOCAyNS4zIDUuNyAyNC45IDE1LjIgNDguOCAyNi42IDcxLjYgMi43IDUuNSA1LjQgMTEgOC41IDE2LjIgMi41IDQuMiA1LjUgOC4zIDcuNiAxMi43IDQuMyA5LjIgNyAxOS4yIDExLjQgMjguNCAxMi44IDI2LjcgMjguOCA1MS41IDQ4LjcgNzMuNSAxMC4xIDExIDIyIDIxLjkgMzQuNSAzMCA0LjEgMi43IDguMSA1LjYgMTIuNCA3LjggMy40IDEuOCA4LjEgMy42IDEwLjggNi4zIC42IDEuMy00LjMtLjctNC45LS45LTMuMy0xLjMtNi43LTIuMi0xMC0zLjUtOS44LTQuMS0xOS4xLTktMjguMS0xNC43LTI2LjUtMTYuNy01MS0zOS40LTY5LjItNjUtNy4zLTEwLjEtMTQuNS0yMC4yLTIwLjgtMzAuOS0yNS41LTQzLjEtNDIuNS05MS4xLTQ4LjItMTQwLjktMi0xOC0yLjItMzYuMi0xLjYtNTQuMyAuMi01LjIgLjctMTAuNCAxLjEtMTUuNSAuMS0yLjcgLjgtNS41IC4yLTguMi0uNi0xLjItMS40IDIuNC0xLjYgMi45LTEgMS4xLTEuOC0xLjUtMi0yLjItMS4xLTIuOS0yLjEtNS45LTMuMi04LjgtNC41LTEyLjItOC4yLTI0LjktMTAuMy0zNy43LTMtMTguMi0zLjUtMzguMiAzLjctNTUuNiA1LjItMTIuNCAxNC40LTIyLjUgMjQuNi0zMSA0LjktNC4xIDExLjEtOS42IDE3LjItMTEuNyAxLjcgLjEgMS43IDQgMi4yIDUuMyAxLjYgNC4zIDQuOSAxMC44IDguOCAxMy40IC45IC4zIC4xLTEuMy0uMS0xLjYtLjktMS41LTItMi45LTIuOS00LjUtMi4yLTMuNy0yLjktOC4xLTMuNS0xMi4zLTEuNS0xMCAzLjQtMjAuMSA5LjEtMjggMS41LTIuMSA0LTYuOCA2LjYtNy42ek0zNzQuNSA2MC4yYzEtLjYgMi42IC4xIDMuNyAuMyAzLjEgLjggNi4zIDEuNiA5LjMgMi44IDQgMS41IDguMyAyLjUgMTIuMyA0LjEgNyAyLjcgMTMuNiA2IDIwLjUgOC44IDE1LjcgNi40IDMxLjMgMTIuOSA0Ny45IDE2LjYgMTIuMSAyLjYgMjQuNiA0IDM2LjcgNi44IDguNCAxLjkgMTYuOSAzLjQgMjUuMyA1LjQgMi44IC43IDUuNyAxLjQgOC41IDIgMS4zIC4yIDIuNiAuOSAzLjggLjdzLTIuMy0xLjMtMi43LTEuNWMtMy41LTEuMS03LjEtMS45LTEwLjYtMi45LTYuMS0xLjctMTIuNC0zLjItMTguNy00LjUtMy0uNy02LjktLjctOS42LTIuMS0uNS0uOCAxLjktLjcgMi4zLS43IDMuMSAuMSA2LjEgLjUgOS4zIC41IDguMiAwIDE2LjUgMS4zIDI0LjcgMS41czE3LjEgMS44IDI1LjYgMi45YzE2LjkgMi4yIDMzLjcgNS40IDUwLjIgOS44IDQyLjggMTEuMyA4NS4xIDI1IDEyNS42IDQzLjEgMTAuMiA0LjYgMjAuNyA4LjYgMzAuNyAxMy42IDMuMiAxLjYgOC4zIDMgMTAuOCA1LjYgMS42IDEuNyAyLjUgNC4yIDMuNSA2LjMgMS45IDMuOCAzLjkgNy42IDUuNyAxMS42IDUuMSAxMC44IDkuMSAyMi4xIDEzLjEgMzMuMyAxLjkgNS4zIDUgMTEuOSA1LjMgMTcuNS0uMiAxLjItMSAwLTEuMy0uNS0xLjEtMS43LTIuMy0zLjEtMy41LTQuNy0zLjEtMy45LTYuNy03LjQtOS43LTExLjMtMi4zLTIuOC01LTUtNy42LTcuNC03LjgtNy4yLTE2LTEzLjUtMjQuMi0yMC4xLTYuMy01LjEtMTMuNC05LjItMjAuMy0xMy40LTIwLTEyLjMtNDEuMi0yMi02My0zMC43LTguMy0zLjQtMTYuOC02LjQtMjUuMy05LjMtMy43LTEuMi04LjEtMy40LTExLjktMy43LS44IC40IC4zIDEuNCAuNyAxLjcgMS41IDEuNyAzLjIgMy4yIDQuOCA0LjkgMy44IDMuOSA3LjUgOC4yIDEwLjggMTIuNCA5LjIgMTEuNyAxOC40IDIzLjQgMjYuNCAzNS45IDEuOSAyLjggMy43IDUuNyA1LjcgOC41IC45IDEuMyAyLjMgMi43IDIuNiA0LjMtLjIgLjctMy0xLjgtMy40LTIuMS0zLjktMi4yLTcuMy01LjItMTEtNy44LTkuNi02LjgtMTkuOC0xMy42LTMwLjItMTkuMy0xNC42LTguMS0yOS4xLTE2LjUtNDQuMS0yNC4xLTE3LjctOS4xLTM2LTE3LjItNTQuMy0yNS4yLTI1LTEwLjgtNTAuNC0yMC4xLTc2LjItMjguOC00LTEuNC04LjEtMi43LTEyLjQtMy40LTEuOC0uMy0zLjggLjktNS40IC4yLTUuOS0yLjQtMTEuNS02LjEtMTcuMS05LjItNy4zLTMuOS0xNS4zLTcuNC0yMi45LTEwLjgtMTAuNC00LjUtMjEuMS05LjItMzIuMi0xMi0yLS41LTEwLjUtMS42LTguMi01LjZ6TTExMTkuOSA4OC4zYy45LS4zIDIuNiAyLjYgMyAzLjMgMi42IDMuNiA1LjUgNy4yIDcuOCAxMC45IDcuNiAxMi4xIDE2LjkgMjMuMyAyNS4yIDM0LjkgMi4zIDMuMiA0LjggNi4yIDcuMSA5LjQgLjkgMS4yIDIuNCAyLjcgMi42IDQuMnMtMi44LTIuNS0zLjItMi45Yy0xLjEtMS4yLTIuNi01LjItNC43LTQuMS0uOCAuMy0xIDEuMi0xLjUgMS43cy0yLTEuNy0yLjUtMi40Yy0yLjEtMy4xLTQuMS02LjUtNS45LTkuOC02LjYtMTEuOC0xNC4zLTIyLjktMjEuMS0zNC40LTEuNi0yLjYtMy41LTUtNS4zLTcuNS0uNS0uOS0xLjktMi4yLTEuNS0zLjN6TTM3OS45IDEwNi4xYy4zLS44LTQuMy0uMS01LjItLjEtMy44IDAtNy42LS41LTExLjUtLjUtOC4zIDAtMTYuOCAuNC0yNSAyLTIuMyAuNS02LjQgLjUtOC4xIDIuNC0xLjEgMS4zLTEuMiAzLjYtMS42IDUuMi0uOSA0LjktMS41IDEwLTEuNSAxNSAwIDEwLjUgLjUgMjAuNSAyLjEgMzAuOSAuNyA0LjggMi40IDkuMyAzLjIgMTQuMSAuNSAzLjEtMS4xIDYuNS0uMyA5LjYgLjggLjcgMS4yLTEuOSAxLjMtMi4zIC42LTIuOSAxLjEtNS44IDEuOS04LjYgMi4xLTcuNyA0LjQtMTUuMiA3LjQtMjIuNiA1LjItMTIuNyAxMy4xLTI1LjMgMjMuMi0zNC43IDMtMi44IDYuNC01LjEgOS44LTcuNCAxLjMtMSAzLjItMS42IDQuMy0zek0zOTEuNCAxMDYuNGMtLjctMS4zLTQuNSAxLjctNS4yIDIuMi00LjYgMy45LTYuMyA5LjMtNy43IDE0LjktMi43IDEwLjgtMiAyMy4zLS42IDM0LjMgLjUgMy44IC40IDkuNSAyLjQgMTIuOSAuNyAuMiAuNy0xLjUgLjctMS44IDAtMi4zLS40LTQuNy0uNi02LjktLjQtNS42LS4yLTEwLjggLjEtMTYuMyAuNS04LjcgMi4xLTE3LjUgNS0yNS44IDEuMS0zLjIgMi41LTYuNCAzLjktOS41IC42LTEuMyAxLjktMi43IDItNHpNMTMzNS41IDE1MC4zYy45IC4zLS42IDEuMy0uOSAxLjYtMS44IDEuMy0zLjcgMi44LTUuNiA0LjEtNC42IDMuMS05IDYuNS0xMy40IDkuOC05LjIgNy4xLTE4LjMgMTQuMy0yNy40IDIxLjQtMy4zIDIuNi03LjIgNy4xLTExLjQgOC4zLS41IDAtLjMtLjctLjYtMXMtMi41LTIuNC0zLjUtMi40Yy0yLjMtLjEtNS41IDMuMS03LjggMy45LTEuMi0uMSAuOS0xLjUgMS4xLTEuNyAyLjItMS4zIDQuMy0yLjggNi41LTQuMSA1LjUtMyAxMC44LTYuNyAxNi4xLTEwLjEgMTAuNi02LjkgMjEuNy0xMy4yIDMyLjItMjAuMyAzLTIgNi4xLTMuOSA5LTYgMS42LTEuMSAzLjgtMy4xIDUuNy0zLjV6TTgzMy4zIDE1Mi40YzEuMy0uNSAzLjcgMS43IDQuNyAyLjMgNC41IDIuNyA4LjkgNS43IDEzLjUgOC4zIDE5LjEgMTAuNiAzOC4yIDIxLjMgNTguMSAzMC40IDQ0IDE5LjggOTEuMiAzNS44IDEzOS4zIDQxLjUgMTMuOCAxLjYgMjcuOSAxLjkgNDEuOCAxLjYgNC4yLS4xIDguNC0xLjMgMTIuNi0xLjIgMS40IC40LTEuMiAxLjEtMS41IDEuMi0yLjEgLjUtNC4yIC44LTYuMyAxLjMtNS42IDEuMS0xMS4yIDEuOS0xNi44IDIuNi0xNy4yIDIuMi0zNSAxLjUtNTIuMS0uNS0xOS4xLTIuMi0zOC02LjktNTYuMy0xMi43LTIyLTYuOS00My41LTE1LTY0LjMtMjUtMTAuOS01LjItMjEuMy0xMS4xLTMyLTE2LjctMTEuOC02LjEtMjEuNi0xNi0zMS4zLTI1LTIuMy0yLjEtNC44LTQuMi03LjMtNi4xLS41LS40LTIuMy0xLjItMi4xLTJ6TTg5Mi44IDIxMi4xYzIgLjEgNS4yIDMuOCA2LjcgNS4yIDQuNyA0LjIgMTAuMSA3LjkgMTUgMTEuOSAxNy45IDE0LjMgMzcuMyAyNi44IDU1LjYgNDAuNCAxMyA5LjcgMjYuMiAxOC45IDM5LjMgMjguMiAxNy40IDEyLjQgMzQuNCAyNS40IDUyLjIgMzcuMSAyOS4yIDE5LjQgNTguNiAzOC4zIDg1LjEgNjEuMiA0LjYgMy45IDguNiA4LjQgMTIuOCAxMi43IDE2LjQgMTYuMyAzMC4zIDM5LjMgMzQuNiA2Mi4yIDEgNS40IDIuNCAxMC44IDIuNCAxNi4zIDAgMS40IC40IDMuMSAwIDQuNC0uNiAuNy0xLjEtLjItMS4yLS44LS42LTEuOC0uNi0zLjktMS01LjgtMS00LjQtMi4yLTguNy0zLjQtMTMuMS0zLjctMTMtOS45LTI1LjUtMTcuMS0zNi45LTEzLjQtMjEtMzEuNS0zOC4xLTUxLjQtNTIuOC03LjktNS45LTE2LjMtMTAuNy0yNC42LTE2LTUuMy0zLjMtOC44LTkuNC0xNC4zLTEyLjMtLjgtLjEgMi4xIDIuOCAyLjQgMy4yIDEuOCAyLjEgMy41IDQgNS40IDUuOSA1LjcgNS43IDEwLjQgMTIuMSAxNS40IDE4LjMgMTIuNSAxNS40IDIyLjYgMzMuOSAyOS40IDUyLjUgMS40IDMuOSAyLjkgOCA0LjUgMTEuOSAuOCAxLjkgMi4yIDQuMiAyIDYuMy0uNSAuOC0xLjQtMS41LTEuNi0xLjgtMS4yLTIuOS0yLjgtNS42LTQuNC04LjMtNC02LjgtOC45LTEzLjEtMTMuOC0xOS4yLTEzLjktMTcuNi0zMy4yLTMyLjUtNTIuNi00My40LTEyLjUtNy0yNS4zLTEyLjctMzguOC0xNy41LTIyLjktOC4yLTQ3LjItMTUuNy02NS0zMy4zLTMuMy0zLjItNC45LTctNy0xMS0yLjUtNS01LTEwLTcuNS0xNC45LTcuMS0xNC4zLTE1LjQtMjguNy0yNC4xLTQyLTcuMi0xMS4xLTE0LjgtMjIuMS0yMi45LTMyLjYtMy4yLTQtNi40LTguMS05LjYtMTIuMi0uNC0uNS0zLjItMy4zLTIuNS0zLjh6TTEzMDAuNyAyNDJjMS40LS41IDQgLjYgNS40IC45IDQuNiAxIDkuMSAyLjQgMTMuNiAzLjYgMTUuNiA0LjMgMzAuNSA5LjcgNDUuNCAxNiAzLjYgMS42IDcuMyAzLjIgMTAuOCA0LjkgMS41IC44IDMuNCAxLjQgNC40IDIuNyAuMyAxLTIuMy0uNS0yLjYtLjYtMi42LTEuMy01LjEtMi40LTcuNy0zLjYtNi43LTMuMi0xMy42LTYtMjAuNi04LjYtMTIuMS00LjctMjQuNS04LjEtMzctMTEuOC0yLjktLjgtNi0xLjQtOC45LTIuMi0uNi0uMi0zLS40LTIuOC0xLjN6TTMyNi40IDI5Mi43YzEuMS0uNCAxLjEgMS41IDEuMiAyLjIgLjUgMi44IC43IDUuNyAxLjIgOC42IDEuNiA5LjktNi43IDE5LjQtMTEuNiAyNy41LTguOCAxNC41LTE4LjkgMjguNS0yNS43IDQ0LjEtMy44IDguNi01LjcgMTcuNS04LjcgMjYuNC0uOCAxLjEtLjMtMy43LS4yLTQuMiAuOC0yLjkgMS4xLTUuOCAxLjktOC43IDIuNC04LjQgNS45LTE2LjMgOS4zLTI0LjQgNy4xLTE3LjEgMTYuOS0zMyAyNC41LTQ5LjggMi4xLTQuNSA0LjEtOS4zIDUuNi0xNCAuNy0yLjMgMS4xLTUuOSAyLjUtNy43ek0xMjk0LjcgMzQ4LjVjLS4yIC42LTMuMy0zLjQtMy43LTQtMi4xLTMuMS00LjMtNi4xLTYuNi05LjEtNC44LTYuMi05LjctMTIuNC0xNC40LTE4LjctMS44LTIuMy00LjUtNC44LTUuNi03LjUtLjEtMSAxLjItLjEgMS43LS40czEuOS0yIDMuMi0xYzMuMSAyLjYgNC45IDguMSA3LjIgMTEuNCA0LjYgNi45IDkuMSAxNC4xIDEzLjMgMjEuMiAxLjUgMi40IDQuMyA1LjQgNC45IDguMXpNMzY1LjQgMzEwLjVjLjggNC45IDMuNCAxMC4xIDUuMiAxNC43IDMuOCA5LjcgOC4xIDE5LjEgMTIuOCAyOC40IDE2LjggMzMuNyAzOSA2NC40IDY0LjYgOTIuMSA0LjUgNC45IDEwIDkgMTQuNyAxMy44IDExLjMgMTEuMiAyNC43IDIxLjcgMzguMyAyOS45IDQuNiAyLjcgOS40IDYuOCAxNC42IDguMSAuOS0uMS0zLjMtMi43LTMuNy0zLTIuNi0xLjYtNS4yLTMuNC03LjktNC45LTcuOS00LjYtMTUuNy0xMC4zLTIyLjgtMTYuMi0yMi40LTE4LjYtNDMuMi0zOC44LTYwLjMtNjIuNi0xNS4yLTIxLTI4LjQtNDIuNS00MC02NS43LTMuOS03LjYtNy4yLTE1LjUtMTAuMy0yMy40LTEuMS0yLjgtMi4xLTUuNS0zLjEtOC4yLS4yLS40LTEuOS00LjItMi4xLTN6TTMzMC42IDMxNi4yYy44IC4xIC45IDEuMiAxLjEgMS45IC40IDEuOCAuOCAzLjcgMS4yIDUuNSAxLjggNy41IDMuOCAxNS4xIDYuMSAyMi40IDIuNiA4LjIgNS4zIDE2LjUgOC41IDI0LjUgMS43IDQuMSA0LjkgOSA1LjQgMTMuNCAuNSAzLjctLjQgOC0uOCAxMS43LS41IDQuNy0uNCA5LjgtLjYgMTQuNS0uMyAxMi4xIDEuMSAyNC4zIDIuNiAzNi4zIDQuOSAzNy43IDIzLjUgNzYuNiA1NC41IDk5LjMgNy4yIDUuMyAxNS40IDkuOCAyMy43IDEzLjEgMi41IDEgNS4xIDIgNy43IDIuOCAxLjQgLjUgMy4yIC41IDQuMyAxLjUgLjIgLjgtMSAuOC0xLjYgLjctMS42LS4xLTMuMyAwLTQuOS0uMS03LjItLjUtMTQuMi0uNC0yMS4yLTEuOS0yMi45LTQuOS00NS0xOC40LTYxLjMtMzQuOC0yOC44LTI4LjktNDEuNC02OC41LTQyLjgtMTA4LjctLjYtMTcuMiAxLjgtMzQuMiA0LjQtNTEuMSAyLTEzIDUuNS0yNS42IDkuMS0zOC4yIC45LTMgMi4xLTUuOSAzLTkgLjMtMS4xIC42LTMuMSAxLjYtMy44ek01NTQuNCAzMTYuNWMxLjItLjEgMi41IDEgMy42IDEuNSAyLjcgMS4zIDUuMyAyLjcgOC4xIDMuOSA3LjEgMy4zIDE1IDYuMiAyMi43IDggMi42IC42IDUuMiAxLjQgNy45IDEuOSAxLjMgLjIgMi45IC4xIDQgMXMtMy45IDQuNy00LjkgNS42Yy0zLjcgMy44LTcuNiA3LjQtMTEuMiAxMS4zLTIuMSAyLjItNC4xIDUuNy02LjggNy4yLTEuOSAuNC0zLTMuNy0zLjctNS4xLTIuOC01LjctNS42LTExLjMtOC42LTE2LjgtMi42LTQuNy01LjYtOS40LTguNy0xMy44LS41LS43LTMuMy00LTIuNC00Ljd6TTYyOS4xIDMxOC41YzEuNCAuNiAyLjEgMi4yIDMuMSAzLjQgMi41IDMgNC43IDYuMiA3IDkuNCA3LjYgMTAuOCAxNSAyMi4xIDIwLjkgMzMuOSAxLjYgMy4yIDMuNCA2LjIgNC43IDkuNiAuNCAxLjEgMS40IDIuNCAxLjQgMy42cy0yIDIuNS0zLjEgMy4zYy0yLjYgMS45LTUuNCAzLjYtOCA1LjYtMS4xIC44LTIuMyAyLjItMy44IDIuMi0xLjQtLjYtMS45LTIuNy0yLjUtMy45LTEuNy0zLjUtMy42LTYuOS01LjQtMTAuNC02LTExLTEzLjMtMjEtMjAuNi0zMS4yLTIuMS0yLjktNC40LTUuNi02LjYtOC40LS44LTEuMS0yLjEtMi4xLTIuMy0zLjVzMi0yLjkgMy4xLTMuOGMyLjgtMi43IDUuOC01LjIgOC45LTcuNiAxLS44IDEuOS0yLjIgMy4yLTIuMnpNNDY3LjUgMzIwLjRjLjcgMi4xIDIuMiA0LjEgMy4zIDYgMi41IDQuMyA1LjEgOC40IDcuNiAxMi43IDcuMSAxMiAxMy44IDI0LjMgMjAuMSAzNi45czExLjkgMjQuOCAxNy4xIDM3LjZjMS44IDQuNyAzLjQgOS41IDUuMiAxNC4yIC44IDEuOSAxLjIgNC4xIDIuMyA1LjggMSAuOSAuMy0xLjcgLjItMi0uNi0yLjMtMS41LTQuNS0yLjItNi44LTEuOC01LjktMy45LTExLjktNi41LTE3LjUtMy02LjgtNS42LTEzLjgtOC43LTIwLjUtNi4yLTEzLjItMTMuMi0yNi4xLTIwLjQtMzguOC0zLjctNi41LTcuNS0xMy0xMS42LTE5LjEtMS43LTIuNC0zLjEtNC45LTQuNy03LjQtLjItLjItMS42LTIuMi0xLjctMS4xek02MTQuOCAzOTIuNWMtMSAuNyAyLjkgMi4xIDMuMyAyLjQgNCAxLjcgOC4xIDMuNCAxMi4xIDUuMSAzLjIgMS40IDcuMSA0LjIgNi43IDguMS0uMyAyLjQtMS43IDUuMS0xLjQgNy42IC42IC43IDEuMy0uNyAxLjYtMS4xIDEuMS0yIDEuOC00LjQgMi40LTYuNnMtLjItNC4zIC40LTYuMiA1LjktNS4xIDcuOS02LjIgNS42IDYuMiA1LjQgOC4xLTIuMSAyLjEtMi43IDMuNGMuMSAxIDIuNC0uNiAzLS42IDQuMyAyLjQtMS44IDYuNy0yLjEgOS4xIC40IDEgMi40LS45IDMuMS0xLjFzLjkgMS40IDEgMi4yYzAgMi4zLS40IDQuNy0uNiA2LjktLjQgMi45LTEuNCA1LjYtMi4xIDguNC0xLjUgNi4xLTMuMyAxMy04LjkgMTYuMy0uNSAuNyAuNCAxLjcgMCAyLjctLjggMS45LTIuNyAzLTMuNyA0LjgtLjMgMS45IDQtMS40IDQuNS0xLjggMi4xLTEuOSA0LjQtMy42IDYuMi01LjggMS40LTEuNiAyLjctMy45IDQuNS01LjEgMS4yLS4zIC41IDEuOSAuNiAyLjZzMi4xLTIuMSAyLjQtMi41YzEuMy0yLjYgMi4zLTguMiA1LjQtOS4yIDEuNiAuMiAxLjkgMi44IDIuMiA0IDEuMSAzLjkgMi4zIDcuOCAzLjIgMTEuOCAzLjIgMTMuOSA1LjggMjkuNCAyLjUgNDMuNi0uOSAzLjgtMy43IDYuNC00LjggOS45IC4xIC42IC4zIC43IC44IC41IDQuNS0zLjkgNy44LTEwLjYgMTAuMi0xNS45IDUuOS0xMy4xIDguNy0yNy41IDktNDEuOSAuMS0zLjMtLjEtNy4yLS41LTEwLjYtLjItMS44LTEtMy45LS42LTUuN3MyLjgtNC42IDQtNi40YzEuNi0yLjQgMy42LTUuMiA0LjktNy44IC43LTEuNiAuOS0zLjQgMS44LTQuOSAuNS0uOCAxLjUtLjcgMi4xLTEuNSAuNS0xLjctLjMtMy41IC4zLTUuNCAyLjUtNi45IDgtMTIuMSAxMS44LTE4LjIgMS40LTIuMyAyLjEtNi44IDQuMS04LjUgLjYtLjIgMSAwIDEuMiAuNnMtLjcgMi4xLS42IDMuMyAxLjItLjIgMS41LS43Yy44LTEuMyAyLjEtMy4zIDIuMi00LjgtLjUtLjktMS42LTEuMS0xLjktMi4ycy44LTMuNiAxLjQtNWMxLjgtMy45IDQuMy03LjQgNi0xMS4zIC45LTIuMiAxLjktNi4zIDMuOS03LjcgMS4yLS4yIDIuNCAxLjkgMyAyLjggMi4yIDMuMyA0LjQgNi42IDYuNSAxMCA5IDE0LjUgMTcuNyAyOSAyNS40IDQ0LjMgNC44IDkuNyAxMCAyMC4yIDEyLjggMzAuNyAxLjEgNC4yIDEuNCA4LjggMS45IDEzLjFzMS4zIDguNSAxLjQgMTIuOGMuNCAyNi04LjMgNTItMjcuNiA2OS45LTUuMiA0LjgtMTEuOSA5LTE4LjQgMTEuNi0zIDEuMi02LjggMS40LTkuNiAyLjktLjggMSAuOSAxLjcgMS42IDIuMSAyLjcgMS41IDUuNiAyLjYgOC41IDMuNSAxMS40IDMuMSAyMy42IDUuMSAzNS40IDUuMSAyNC43IDAgNDktNC43IDY5LjgtMTguNyA0LjktMy4zIDkuOS03LjIgMTQuMS0xMS40IDIuMy0yLjMgNC44LTYuMyA3LjYtNy44IDEuMy0uMS0uNSAyLjUtLjcgMy0xLjcgMy0zLjcgNS44LTUuNCA4LjgtNC4yIDcuMy0xMC43IDE0LjQtMTcuNCAxOS4zLTIuOCAyLjEtNyAzLjEtOS4yIDUuNi0uNyAxLjMgMi42IDAgMy0uMiAzLjMtMS4yIDYuNC0yLjUgOS42LTQgOC40LTMuOSAxNi4zLTguMiAyNC4xLTEzLjMgMTYuNC0xMC45IDI5LjctMjUuMiAzOS45LTQxLjkgMi41LTQuMyA0LjgtOC44IDYuOS0xMy40IC45LTIuMSAxLjQtNC44IDIuOC02LjcgMS4yLS44IDEuNiAxLjIgMS45IDIgLjggMi44IDIgNS41IDIuOSA4LjMgMy44IDExLjYgNi41IDI0LjUgNi43IDM2LjggLjMgMTYuNS0yLjUgMzMtMTEgNDcuNS0zLjQgNi04IDExLjUtMTIuNyAxNi41LTIuMyAyLjUtNS4xIDUuMS03LjkgNy4xLTIuMSAxLjQtNC44IDIuNi02LjYgNC40LS43IDEuNSA0LjQgLjUgNS4xIC40IDUuMS0uOCAxMC4zLTEuOSAxNS4yLTMuNSAxMy4yLTQuNCAyNS4zLTEwIDM2LjMtMTguNSAzLjctMyA3LTYuNSAxMC40LTkuOCAxLjItMS4zIDIuNi0zLjcgNC4yLTQuNCAxLjcgLjIgMS43IDUuMSAxLjkgNi40IC43IDYuNiAxLjMgMTMuMyAxLjYgMjAuMSAxLjIgMjEuMSAxLjEgNDIuMi0yLjMgNjMuMi0uOSA1LjMtMS45IDEwLjUtMyAxNS43LS41IDItLjcgNS4xLTIuMSA2LjctMS41IC44LTIuOS0zLjItMy41LTQuMS0zLTUuMi02LjktMTAuMi0xMC43LTE0LjktMTEtMTMuOS0yMy43LTI2LjItMzYuMi0zOC43LTMuNS0zLjUtNi44LTYuNi0xMS4yLTkuMS0xLjgtMS4xLTQuMi0yLjMtNi40LTItMi45IC4zLTUuNyAyLjktNy42IDQuOS0zLjkgMy44LTcuOCA3LjctMTEuNyAxMS42LTEyIDEyLTIzLjIgMjQuNy0zNS4yIDM2LjgtNS45IDUuOS0xMy42IDEzLjctMjIuMyAxNS4xcy0xNS42LTMuNy0yMS42LTguOGMtMTEuNC05LjYtMjIuMS0xOS45LTMzLjUtMjkuNS05LTcuNS0yMS4zLTkuOS0zMS4zLTE2LTMuMy0yLTYuOC00LjEtOS44LTYuNy0zLjktMy4zLTYuOC02LjctMTEuOC04LjQtNS43LTEuOS0xMi43LTItMTguNi0yLjQtMi43LS4xLTUuNCAwLTcuOS0xLjEtMy44LTEuNi02LTcuMS04LjctMTAtNS43LTYuMy0xMS42LTEwLjQtMTkuOS0xMi40LTE2LjYtMy44LTM0LjItNS4xLTQ5LjctMTIuNS0zLjUtMS43LTYuOS0zLjQtMTAuMS01LjYtMS41LTEtMy4yLTItMy45LTMuNy0xLjYtMy40IDEuNC02LjYgMy4xLTkuNCAxLjMtMi4yIDIuNC00LjYgMy41LTYuOSA2LjMtMTIuNSA5LjgtMjYgMTEuMy0zOS44IC44LTcuNCAuNy0xNC44LS43LTIyLjEtLjgtNC4zLTIuNy05LTMtMTMuMy0uMi0yLjEgLjktNC4xIDEuMi02LjEgLjctNC43IDEuMi05LjQgMS41LTE0LjIgLjgtMTEuOS0uOC0yNC4zLTMuNy0zNS44cy02LjgtMjIuMy0xMC45LTMzLjRjLTEuMi0zLjItMi44LTYuMy00LTkuNS0uNC0xLjItMS4yLTIuNS0xLTMuOSAuMy0yLjMgMy43LTQuOSA1LjItNi42IDUtNS44IDEwLjctMTAuNyAxNi4xLTE2LjEgMS44LTEuNyA0LjYtNS42IDcuMS02LjEgMS4zLS4zIDIuMiAxLjYgMi45IDIuNCAyLjYgMi44IDUuMiA1LjkgNy41IDkgNy44IDExIDE2LjMgMjEuNiAyMi42IDMzLjYgMS41IDIuOCAzIDUuNiA0LjQgOC40IC41IC45IDEuNCAyLjMgLjkgMy40cy0yLjcgMi0zLjggMi45LTQgNC4yLTUuOCA0LjQtMy45LTEuNy01LjUtMi4zYy00LTEuMy04LjItMi4zLTEyLjMtMy40LTEuNi0uNS0zLjYtMS41LTUuMy0xLjR6TTY0Ny41IDMzNy40YzEuNy0uNiAzLjYgLjMgNS4zIC41IDUuNiAuNiAxMS4yIDEuOSAxNi43IDIuMSAxMS4yIC4zIDIyLjMgLjUgMzMuNSAwIDUuMS0uMyAxMS0yLjUgMTYuMS0yIC45IC42LTIgMy44LTIuNCA0LjUtMy4yIDUtNy4yIDkuNC0xMC43IDE0LjEtMi4zIDMuMi00LjkgNi4xLTcuNCA5LjEtMS4yIDEuNS0yLjEgMy40LTMuNSA0LjgtLjcgLjgtMS43IDEuMi0yLjUgMnMtMSAyLjQtMS43IDMuNS0xLjkgMS4yLTIgMi4yIC42IDIuMiAuOSAzLjJjLjggMi43IDIuNSA2LjggMi4yIDkuNy0uNyAxLTEuNS0yLTEuNy0yLjMtLjgtMi41LTEuNS02LjctMy4yLTguNi0xLjMtLjYtMi42IDEuNS0zLjEgMi40LTEuNSAyLjQtMyA0LjMtNC44IDYuNi0uOCAxLTEuNCAyLjQtMi43IDIuOHMtMS42LTEuNi0yLjEtMi42Yy0uOS0yLjMtMS45LTQuNi0yLjktNi45LS40LTEtMS4zLTIuMy0xLjEtMy41IC4zLTEuOSAyLjgtMy4xIDMuOC00LjYgLjMtLjgtLjctLjQtMS0uMi0xLjYgMS0zLjYgMy4yLTUuMSAuNy01LjQtOS40LTkuNi0xOS40LTE1LjgtMjguNS0xLjQtMi4xLTIuOC00LjEtNC4xLTYuNC0uNC0uNy0xLjYtMS45LS43LTIuNnpNOTY5LjggMzM4LjFjMS0uMSAyIDEgMi44IDEuNSAyLjIgMS41IDQuNiAzLjEgNi45IDQuNCA1LjEgMi44IDExLjEgNC44IDE1LjggOC4yczkuMSAxMC4xIDEyLjYgMTUuMmMxOS44IDI4LjkgMjguNCA2NS4yIDI5LjEgOTkuOCAuMSAzLjkgLjYgNy42IC41IDExLjVzLS44IDcuNC0xIDExIDAgOS4yLTEuNSAxMi43Yy0uOCAxLjEtLjktLjgtMS0xLjQtLjItMi40LS43LTQuNy0xLjItNy0xLjItNi4yLTIuNS0xMi40LTQtMTguNS0zLTEzLTgtMjUuNy0xMi45LTM4LjEtMi4xLTUuMy00LjMtMTIuNy04LjEtMTcuMS0uOC0uNSAwIDEuMyAwIDEuNiAuOCAxLjkgMS43IDMuOCAyLjYgNS43IDIuMSA1IDMuOSAxMC4yIDUuNiAxNS4zIDUuMyAxNS42IDguOSAzMS40IDExLjcgNDcuNiA1LjMgMzAgMy42IDYwLjgtLjggOTAuOC0xLjIgOC0zLjEgMTYuMi01LjIgMjQuMS0xIDMuOS0zLjYgOS4yLTMuMyAxMy4yIC41IC44IDEuMy0xLjYgMS40LTIgLjgtMi4yIDEuNS00LjUgMi4xLTYuOCAxLjgtNi40IDMuNS0xMi44IDQuOC0xOS4yIDIuNy0xMyA0LjQtMjYuMSA1LjctMzkuMyAuNi02LjYtLjQtMTMuNyAuOC0yMC4xIC42LTEuMyAuOCAxLjEgLjggMS41IC4xIDIuMiAwIDQuNSAwIDYuNyAwIDUuNyAwIDExLjUgMCAxNy4yIDAgMTEuMS0xLjMgMjIuMi0yLjkgMzMuMi0uOSA2LjUtMS44IDEzLjMtMy41IDE5LjctNS41IDIwLTEwLjcgMzkuNy0xOS4xIDU4LjktMTMuMyAzMC44LTMzLjUgNTkuNC01Ny4yIDgzLTkuMyA5LjMtMTkuNiAxNi45LTMwLjMgMjQuNS0zLjEgMi4yLTYgMi45LTkuNyAzLjgtMS40IC4zLTMuMyAxLTQuNyAuM3MtNC45LTQuMi00LTYuMSAyLjQtMi43IDMuNi0zLjhjMi44LTIuOSA2LTUuNiA4LjYtOC43IDguMi05LjcgMTUuNS0yMC4xIDIyLjItMzAuOSAxOS40LTMxLjMgMjkuOC03MC4yIDMwLjUtMTA2LjggLjMtMTUuOC0uNy0zMS41LTEuNS00Ny4yLS4yLTMuOC0uNy03LjgtMS4yLTExLjYtLjMtMi4zLTEuMS01LS42LTcuMyAuNi0zLjIgNC03LjEgNS43LTEwIDMuNi02LjUgNy4xLTEzLjMgOS43LTIwLjMgOS45LTI2LjYgMTMuOC01NiAxMi40LTg0LjMtMS40LTI3LjEtNi42LTU0LTE0LjUtODAuMS0xLjgtNi4yLTMuOC0xMi40LTYuMi0xOC40LS41LTEuMi0yLjYtNS41LTEuNS02LjR6TTEwMDkuMiAzNTguNWMuOS0uNSAyIC4xIDIuOSAuNCAyLjMgLjYgNS4xIDEgNy4xIDIuNCAuNyAxLS45IDEuMi0xLjYgMS40LTEuNyAuNy0zLjUgMS45LTMuNiAzLjgtLjMgMS0xLjItLjEtMS41LS42LS45LTEuMy00LjEtNS44LTMuMy03LjR6TTEwNTAuMSAzNzNjLjktLjMgMiAuMyAyLjggLjYgMi4zIDEuMSA0LjcgMi4zIDcgMy41IDUgMi44IDEyLjQgNS42IDE2IDEwLjIgMi4yIDIuNyAzLjMgNy4zIDQuNSAxMC42IDMgOCA0LjYgMTYuNiA1LjcgMjUgMyAyMy4zIDEuNCA0Ny44LTExIDY4LjQtMSAxLjYtMy4zIDYuOS01LjUgNi44LTEgMC0xLjgtMS4xLTIuNi0xLjYtMi4yLTEuOC00LjQtMy42LTYuNC01LjYtNC43LTQuOC0xMC4xLTguOS0xNS0xMy41LTEuNy0xLjYtNC4zLTMtNS4yLTUuMy0uNy0xLjYtLjQtMy44LS40LTUuNiAwLTE0LjUtMS44LTI4LjYtNS4zLTQyLjctMi44LTEwLjgtNi4xLTIxLjQtMTAuMi0zMS44LTIuMi02LTUuNS0xMS42LTcuNC0xNy42IDAtLjIgMy4zIDQuMSA0LjMgNC4zIDMuNiAuNyA0LjctMi44IDcuOC0zLjEgMS41IC44LTIuMSAyLjgtMi41IDMuMy0uNCAxLjIgMS4yIDEuOSAxLjcgMi44cy0uNSAxLjEtMS4xIDEuNWMtLjQgMS4xIDQuNyAuOCA1LjQgLjcgMS40LS4xIDIuMS0xLjIgMy40LTEuNXMyLjMtLjEgMy40LS40IDEuOS0xIDMtMS4yIDMuNS0uMiA1LjEtLjdjLjktLjggLjEtMS45IC42LTIuOCAuOS0xLjcgMi4zLTEuMyAzLjgtMS42cy0yLjEtMS43LTEuOS0yLjd6TTY2Ni43IDM4MWMxLjggLjEgMy4xIDQuNyAzLjcgNi4xczIuMSA0LjcgMS45IDYuOC0zLjUgMy44LTUuMSA1LjJjLS43IC42LTEuMyAxLjUtMi4yIDEuOHMtLjktMy40LTEuNC00LjUtMS41IC4yLTIgLjhjLTEuMSAxLTMuNSA0LjUtNS4yIDMuOHMtMi0zLjMtMi42LTQuNi0xLjYtMi43LTEuMy00IDIuNy0yLjUgMy45LTMuM2MzLjMtMi4zIDYuNi02LjcgMTAuMy04LjF6TTM1Ni40IDM5My4zYzEuMS0uNSAzLjEgNC44IDMuNiA1LjcgMy42IDYuNyA3LjEgMTMuNCAxMC42IDIwLjEgMi45IDUuNyA2LjEgMTEuNCA5LjYgMTYuNyAyIDMgNS40IDYuNSA2LjQgMTAgLjQgMS40LS40IDMuMi0uNyA0LjYtLjggNC4yLTEuNyA4LjMtMi41IDEyLjUtMS42IDguNi0zLjEgMTcuOS0zLjQgMjYuNi0uMSA0IDAgOCAwIDEyIDAgMS44IC4zIDMuOC0uNCA1LjUtLjggMS0xLjUtLjgtMS45LTEuNS0xLjEtMi4xLTIuMi00LjItMy4zLTYuNC00LjUtOC45LTcuOS0xNy45LTEwLjgtMjcuNS01LjYtMTktOC4xLTM4LjgtOC4xLTU4LjYgMC00LjktLjEtOS44IC40LTE0LjYgLjItMS42LS4zLTMuNyAuNS01LjF6TTE5Mi4zIDM5My41YzEuNi0uMiAxLjkgMS42IDIuMyAyLjggLjkgMi43IC40IDYuNyAyLjEgOSAyLjcgMy42IDguNiAxLjcgMTEuNyA0IC40IC41IC4zIC45IDAgMS41LTMuMyAyLTguNCAuNi0xMS40IDMuNnMtMSA4LjgtNCAxMS41Yy0xIC4yLTEuNy0xLjItMi0yLS45LTMtLjUtNi45LTIuNy05LjRzLTYtMi42LTguOC0zLjJjLTEuMy0uMy0yLjcgMC0zLjctMS4xczIuMS0xLjQgMi45LTEuNmMyLjgtLjYgNy4yLTEuMSA5LjUtMy4xIDMuMS0yLjggLjQtOS43IDQuMS0xMnpNNjg0LjEgNDA2LjZjMS41IC4yIDEuNyAzLjEgMS44IDQuMiAuNCA0LjMgLjkgOS45LS4xIDE0LjItLjYgLjgtLjktLjUtMS0xLS40LTEuNi0uNi0zLjMtLjktNS0uNy0zLjQtNC40LTEwIC4yLTEyLjR6TTY3OC42IDQxNi4xYzEuNSAuMiAxLjUgMy4yIDEuOCA0LjMgMS4yIDQuNSAyLjIgOS4xIDIuNiAxMy45IDEuMSAxNC41IC44IDI5LjgtMy44IDQzLjgtMS4xIDMuNC0yIDktNC41IDExLjYtLjcgLjItLjUtMS4yLS40LTEuNiAuMi0yLjMgLjctNC40IC43LTYuNyAwLTUuNiAuMy0xMS4xLS42LTE2LjYtMS4yLTcuOC0yLjUtMTUuNi00LjUtMjMuMi0uOC0zLjEtMy41LTgtMi42LTExLjEgMS4xLTMuOSA1LjgtNy41IDguNS0xMC4yIDEuMi0xLjEgMS40LTMuNCAyLjgtNC4yek0yMzIuNCA0NDAuOWMtNi40LTUgLjctMTMuOSA3LjEtOC45IDUuNSA0LjMtMS40IDEzLjItNy4xIDguOXpNMTA5MS4xIDQzMi41YzEuMi0uNSAzLjUgMi44IDQuMyAzLjYgNC4xIDQuMiA4LjIgOC4zIDEyLjMgMTIuNCA5LjYgOS41IDIwLjEgMTguMSAzMC43IDI2LjMgOC4zIDYuNCAxNi43IDEzIDI1LjcgMTguNiAyOS42IDE4LjYgNjEuMiAzNS4yIDk0LjYgNDYuMyAxMi43IDQuMyAyNS4zIDguNiAzOC4zIDEyIDQuMSAxLjEgOC4zIDIuMyAxMi41IDMuMiAyLjcgLjYgNi4yIDEuMSA4LjYgMi41IC45IDEtMy40IDIuNi00LjIgMy4xLTUuMSAyLjgtMTAuNSA1LTE1LjcgNy42LTIuNCAxLjMtNC45IDMtNy42IDMuNnMtNi4xIC4xLTktLjFjLTMuOS0uMy03LjctLjItMTEuNS0uNS0xMC44LS45LTIxLjgtMS42LTMyLjQtMy42LTkuOC0xLjktMTkuNi0zLTI5LjMtNS4yLTM1LTcuNy02OS4xLTE5LjUtMTAwLjYtMzYuNy05LjMtNS4xLTE3LjctMTAuOS0yNi4zLTE3LjEtMi4zLTEuNy00LjYtMy41LTYuNy01LjQtLjktLjktMi4zLTEuNS0yLjgtMi44czMuNi00LjUgNC43LTUuOWMzLjItNC4zIDUuNy05LjEgNy43LTE0IDMuNi04LjkgNi40LTE5LjEgNi42LTI4LjcgLjEtNC41IDAtOSAwLTEzLjUgMC0xLjUtLjYtNC4zIC4xLTUuN3pNMjg1LjQgNDQzLjJjLjktLjIgMS45IDIuOCAyLjIgMy41IDEuNiA0LjEgMy40IDguNCA1LjkgMTIuMSAzLjEgNC41IDYuMSA5LjUgMTAuMiAxMy4xIDEuNSAxLjMgMy45IDIuNyAyLjcgNS4xLS45IC45LTEuNy0uMS0yLjUtLjgtMS42LTEuNy0yLjktMy42LTQuMy01LjUtNC41LTYuMy04LjUtMTIuNy0xMS42LTE5LjktLjctMS43LTMuMy01LjgtMi42LTcuNnpNMzg5LjUgNDUxLjJjMS4xLS42IDEuOCAxIDIuMyAxLjcgMS42IDIuMiAzLjIgNC4zIDQuOSA2LjQgNy4yIDkuMSAxNC4zIDE4LjEgMjIuMyAyNi40czE3LjUgMTYuNyAyNy4xIDI0YzQuMiAzLjMgMTAuMiA2LjEgMTMuNiAxMC4zczUuMyAxMC45IDguMiAxNS44YzcuNSAxMi42IDE1LjIgMjUuMSAyNC4xIDM2LjcgNS43IDcuNyAxMi4yIDE0LjggMTguNiAyMS45IDEuNiAxLjYgMy4zIDMuMyA0LjkgNC44IC44IC44IDIgMS41IDIuMSAyLjctLjYgMi4yLTUuNyA0LjktNy42IDMuNnMtMy44LTMuOC01LjgtNS41Yy01LjQtNC42LTEwLjgtOS40LTE2LjktMTMuMS0zLjItMi02LjktMy40LTEwLjYtNC40cy02LjQtMS4yLTkuMi0zLjUtNi4zLTYtOC44LTkuMmMtLjktMS4xLTIuMi0yLjYtMi4zLTQgLjUtMS45IDQuMS0xLjUgNS42LTIuMSAuOS0uNy0xLjctLjctMi0uNy0yLjMgMC01LjIgLjUtNy0xLjMtNC4yLTQuMS01LjEtMTEuMi05LTE1LjUtMS0uNyAuNSAzLjEgLjcgMy42IDEuNCAzLjEgNC40IDcuMiA0LjkgMTAuNS0uNCAxLjYtMyAuMy00IC4xLTQtMS03LjctMi43LTExLjUtNC4yLTIuOC0xLjEtNi40LTItOC40LTQuNC0xLjUtMS44LTItNC45LTIuNy03LjEtMS41LTQuNi0zLjEtOS4zLTMuOS0xNC4xLS41LTMuMi0uMi03LjItMS40LTEwLjItLjctLjUtLjcgMS4zLS43IDEuNi0uMSAyIC4xIDMuOS0uMiA1LjgtLjQgMy44LS44IDcuNC0uOCAxMS4yIDAgMS45IC40IDQuNC0uNSA2LjItMS42IDEuNC01LjktMi45LTcuMy0zLjktNi43LTQuOC0xMy4zLTExLjItMTguMi0xNy44LTIuMS0yLjktNS4zLTUuOC02LjYtOS4yLTEuOS01LjMtLjgtMTEuOS0uNS0xNy40IC43LTkuMyAxLjItMTguNiAyLjktMjcuOSAuNy0zLjcgMS42LTcuNSAyLjItMTEuMiAuMy0yIC40LTUgMS41LTYuNnpNMzE0LjMgNDYxLjdjMS4xLS4xIDEuNiAzLjEgMS44IDMuOSAxLjUgNC43IDMuMiA5LjUgNC40IDE0LjMgLjUgMS42LS41IDMuMi0xLjEgNC43LTEuMSAyLjktMi41IDUuNy0zLjQgOC43LTMuNyAxMi4xLTcuOCAyNC05LjkgMzYuNS0xLjggMTAuNy0zLjMgMjEuNi0zLjYgMzIuNC0uNSAxOS4zIDIuOSAzOS42IDcuOCA1OC4yIDEuNiA2LjMgMy43IDEyLjUgNi4yIDE4LjUgMS4yIDMgMy4yIDYgMy45IDkuMS0uNCAyLjUtMy42LS40LTQuMi0xLjQtMi4zLTQuNi00LjEtOS41LTUuNy0xNC40LTQuMy0xMi44LTcuNi0yNS45LTkuNi0zOS4yLTQuOS0zMy43LTIuOS02OS42IDUuOC0xMDIuNiAxLjgtNi43IDMuMi0xMy43IDUtMjAuNCAuNi0yLjMgLjktNi41IDIuNi04LjN6TTEwNDAuMyA0ODEuMWMxLjItLjIgMi40IDEuOSAzLjIgMi42IDIuNiAyLjYgNS40IDUuMyA4LjIgNy42IDE1LjQgMTIuNSAyMS43IDMyLjcgMjcgNTEgMTAuMSAzNS42IDE3LjMgNzIuNCAyMS40IDEwOS4xIDEuMyAxMS4yIDIuNCAyMi4zIDIuNCAzMy42IDAgMy44IC45IDguOS0uMyAxMi40cy02LjUgNi4yLTkgOC4zYy03LjMgNS45LTE0LjYgMTIuNi0yMS4zIDE5LjItOS40IDkuMS0xOSAxOC0yOC44IDI2LjctMi40IDIuMi03IDguMi0xMC41IDcuNS0xLjMtLjcgLjktMi40IDEuNS0zIDIuNS0yLjUgNC42LTUuNSA2LjgtOC4yIDUuNi03LjIgMTAtMTUgMTQuOS0yMi42IDQuMS02LjQgNi44LTE0LjEgOS42LTIxLjEgNS41LTEzLjkgOS41LTI4LjMgMTEuOC00MyAuOC01LjUgMS42LTEwLjcgMS44LTE2LjIgLjEtMS44IC44LTMuOSAuMi01LjYtLjctLjUtMSAyLjMtMSAyLjgtLjQgMi43LS4zIDUuNS0uOCA4LjItMS4zIDcuNy0xLjkgMTUuNS0zLjkgMjMuMS00LjUgMTYuOS05LjcgMzMuMy0xNy44IDQ4LjktMy44IDcuMy04LjUgMTQtMTMuMSAyMC43LTMuNSA0LjktNy43IDEwLTExLjkgMTQuNC0xLjUgMS42LTMuNSAzLjYtNS45IDMtMS42LTEuMyAxLjUtNi41IDIuMS04LjEgMy4yLTcuNyA1LjItMTUuOSA3LjYtMjMuOSA1LjgtMTkuOSA3LjgtNDEuMiA5LjYtNjEuNyAuNi02LjYgLjQtMTMuMyAxLTIwIC40LTQuOSAxLjItMTAuOCAuMi0xNS43LS43LTEuMy0uOCAzLjQtLjggMy45IDAgMy4xLS41IDYuMS0uNSA5LjIgMCA5LTEuMSAxOC4zLTIuMSAyNy4yLTIuNiAyMi41LTYuMyA0NS4yLTEzLjUgNjYuNy0xLjkgNS42LTMuNSAxMS4yLTYgMTYuNS0uOSAxLjgtMS43IDQuMy0zLjIgNS43LTEuOCAuNy0xLjItNS42LTEuMi02LjUgMC03LjctLjUtMTUuMi0uNS0yMi44IDAtMTIuOS0xLjctMjUuOC0yLjYtMzguNy0uMy01LjQtMS44LTExLjEtMS4zLTE2LjUgLjMtMy43IDIuNi03LjUgNC0xMSAyLjctNi45IDUuMS0xNC4yIDcuMS0yMS4zIDguNC0yOS4zIDEzLjMtNTkuMSAxMy4zLTg5LjUgMC03LjMgLjctMTUuMS0uMS0yMi40cy0yLjEtMTQuOS0xLjktMjIuMWMuMi01LjUgMS43LTExLjQgMi42LTE2LjkgLjUtMi42IC45LTUuNCAuOS04LjEgMC0xLjEtLjItMi42IC44LTMuNHpNMzIyLjIgNDg1LjZjMSAwIDEuMyAxLjMgMS43IDIgMSAyIDIgNCAyLjkgNi4xIDMuNSA4LjIgOS4xIDE2LjcgMTQuNyAyMy41IDcuNSA5IDE1LjggMTcuNCAyNS4yIDI0LjQgMi44IDIuMiA1LjggNC4zIDguOSA2LjEgMS41IDEgMy45IDEuNyA0LjkgMy40cy41IDQuMyAuNSA2LjJjMCA0LjcgMCA5LjUgMCAxNC4zIDAgOS44IDAgMTkuOCAxLjEgMjkuNiAuNSA0LjUgLjkgOSAxLjUgMTMuNSAuNCAyLjcgMS4zIDYuMyAuOSA5LS45IDEuNS0zLjItLjktNC0xLjUtMy40LTIuNS03LjItNS4zLTExLjEtNi45cy03LjctMi45LTExLjgtMy4yYy0xLjktLjItNC44IC45LTYuNiAwcy0xLjUtMi45LTEuOC00LjJjLTMuOC0xNy41LTMuNy0zNC43LTIuMS01Mi41IC41LTYuMSAxLjktMTIgMi45LTE4IC40LTIuMiAxLjYtNSAxLTcuMS0xLTEtMS42IDIuMS0xLjcgMi42LS44IDMuNS0xLjcgNy0yLjMgMTAuNS0xLjQgOC45LTMgMTcuOS0zIDI3IDAgMTAuNSAuOCAyMC41IDIuMSAzMC45IC4zIDIuNSAxIDQuOSAxLjcgNy4zIC4zIDEuMSAxLjEgMi43IC44IDMuOXMtMi4yIDEuOS0zLjIgMi42Yy0yLjQgMS40LTQuMyAzLTYuMiA1LTQuOSA1LTcuNiAxMS43LTEwLjcgMTcuOS0xIDIuMS0yIDYuMy0zLjkgNy44LS45IC4yLTEuNC0uOS0xLjctMS42LTEuMi0yLjMtMi40LTQuOC0zLjQtNy4yLTQtOS42LTcuNS0xOS44LTkuNy0zMC0xLjktOC45LTMuOS0xNy44LTQuNy0yNi44LTIuMS0yMi40IDEuNS00Ni4xIDcuNi02Ny43IDEuOS02LjUgNC4zLTEyLjggNi4zLTE5LjMgLjUtMS44IDEuNi02LjYgMy4yLTcuNnpNNTk0LjEgNDk1LjdjMS42IC4zIC45IDYgLjkgNy4zIDAgNS40IDEuMyA5LjkgLjIgMTUuMy0uMyAxLjYtLjYgMy42LTEuNSA0LjktMS4xIC41LTEuMi0xLjQtMS4yLTItLjMtMi42LTEtNS0xLjUtNy41LS43LTMuNC0zLjgtOS4yLTIuNy0xMi41IC41LTEuMyAyLjctMS45IDMuNy0zczEuMi0yLjEgMi4xLTIuNXpNMTQ2OC45IDUxMi40YzEuMSAuMi0uNSAxLS44IDEuMi0xLjQgLjYtMyAxLjEtNC40IDEuNi00LjIgMS40LTguNSAzLTEyLjYgNC42LTEyLjQgNS4yLTI0LjkgMTAtMzcuMiAxNS40LTM2LjcgMTUuOS03MS40IDM1LjctMTA2LjQgNTQuOC0xNS41IDguNS0zMC41IDE3LjktNDUuNyAyNy4xLTI2LjkgMTYuMy01My4zIDMzLjItNzguOSA1MS41LTEyLjggOS4xLTI1IDE5LTM3LjUgMjguNi03LjggNi0xNS44IDEyLjMtMjIuOSAxOS4xLTcuOCA3LjQtMTYuMiAxNC4yLTIzLjkgMjEuOC0zIDMtNiA2LTkgOS0xLjQgMS40LTIuOCAzLjQtNC42IDQuNHMtNS43IDEuMi04LjIgMS42Yy01IC42LTEwLjEgMS4zLTE1LjEgMi4xLTQuMyAuNy04LjcgMS40LTEzIDItMS42IC4yLTMuOCAuOS01LjQgLjMtLjYtLjggMy44LTQuNCA0LjYtNS4xIDUtNSAxMC41LTkuNSAxNS41LTE0LjUgMTUuNC0xNS41IDMyLjQtMjkuOCA0OS40LTQzLjYgNi43LTUuNCAxMy4xLTExLjYgMjAuMi0xNi41IDE5LjMtMTMuNiAzNy42LTI4LjYgNTcuMS00MS45IDMyLTIxLjkgNjUuNC00MS40IDk5LjgtNTkuMyAzMS43LTE2LjUgNjQtMzEuNiA5OC00MyAxMi4zLTQuMSAyNC43LTguMiAzNy4zLTExLjQgNy0xLjggMTQuMS0yLjggMjEuMS00LjQgNC41LTEgOS0xLjggMTMuNS0zIDMtLjcgNi4xLTIgOS4xLTIuNHpNMTA3OC44IDUxMy4xYy44IDAgMS42IC45IDIuMyAxLjMgMS45IDEuMyAzLjkgMi42IDUuOSAzLjkgOC4yIDUuMSAxNi42IDEwLjggMjMuOSAxNy4zIDMuOCAzLjQgOC4xIDYuNCAxMi4xIDkuNyA4LjUgNy4yIDE2LjkgMTQuNiAyNS40IDIxLjkgOS44IDguMyAxOC4zIDE4LjIgMjguMiAyNi41IDcuMSA2IDEzLjggMTIuOSAyMC4zIDE5LjUgMS44IDEuNyAzLjUgMy41IDUuMyA1LjIgLjggLjggMS45IDEuNSAyLjMgMi42LS4xIDIuMS00LjMgMy43LTUuOSA0LjctNS45IDQuMS0xMS44IDguMi0xNy44IDEyLjMtMTggMTIuMy0zNS40IDI1LjQtNTIuNyAzOC44LTQuNyAzLjctOS40IDcuNi0xNCAxMS40LTEuOSAxLjYtNCAzLjgtNi4zIDQuOC0xLjkgLjEtMS4zLTQuNi0xLjUtNS45LTEtNi45LS4xLTE0LS45LTIwLjktMi4yLTE4LjEtNC4zLTM2LjItNi41LTU0LjMtMy4xLTI1LjMtOC42LTUwLjQtMTQtNzUuMy0xLjItNi0zLjItMTEuOC00LjgtMTcuNy0uMy0xLTIuMi01LjEtMS4zLTUuOHpNMjg2LjEgNTI0LjljLTUuNiAuMS02LjQtNy45LS44LTguMnM2LjMgNy41IC44IDguMnpNMjc0LjIgNTM1LjljLjcgNC44LTYuOCA3LjMtOCAyLjJzNi43LTcuNyA4LTIuMnpNMTEyNC4xIDUzNy41YzEuMS0uMyAyLjcgLjggMy42IDEuMyAyLjYgMS41IDUuNSAyLjUgOC4yIDMuOCA5LjYgNC42IDIwIDcuOCAzMC4xIDExLjEgMjYuNyA4LjcgNTQuNCAxNC45IDgyLjMgMTguMiA4IC45IDE2LjEgMS40IDI0LjIgMiAzLjUgLjMgNy43LS4zIDExLjIgLjYgLjkgLjktMS43IDEuOC0yLjIgMi4xLTIuOSAxLjQtNC44IDIuNC04LjEgMi40LTEyLjEgMC0yNC43LTEuOS0zNi43LTMuOC0zMC4yLTQuNy01OS45LTEyLTg3LjgtMjQuNi02LjUtMi45LTEzLTUuOS0xOS40LTkuMS0uOS0uNS01LjYtMi44LTUuNC00ek0xMTM2LjIgNTQ3LjVjMS4yLS42IDUuNCAyLjEgNi43IDIuNiA2LjIgMi45IDEyLjQgNS43IDE4LjcgOC4zIDguNCAzLjQgMTYuOSA2LjEgMjUuNSA4LjkgMy42IDEuMSA3LjYgMS43IDEwLjkgMy4zczQuOCAzLjggNy4xIDUuN2M1IDQuMSA5LjggOC4yIDE0LjggMTIuMiAzLjkgMy4xIDcuOCA2LjEgMTEuNyA5LjMgMS4zIDEuMSAzLjQgMi4xIDQuMyAzLjYgLjEgMS44LTMuMiAzLTQuNCAzLjctNC4xIDIuNC04LjIgNC44LTEyLjEgNy40LTEuNCAuOC0zLjUgMi44LTUuMSAxLjgtMi43LTEuNS01LTQuMS03LjQtNi4xLTQuMy0zLjYtOC42LTcuMy0xMy0xMS0xMy4zLTExLjItMjYuNC0yMi41LTM5LjYtMzMuOC00LjYtMy45LTkuMS03LjgtMTMuOC0xMS43LS44LS43LTQuNy0zLjEtNC4zLTQuMnpNMjU3LjYgNTQ5LjljMy41IDQtMiA5LjgtNS43IDYuMXMxLjUtMTAgNS43LTYuMXpNMzg1LjIgNTUzLjZjMi0uMiA1IDIgNi44IDIuOSA0LjggMi4yIDkuOCAzLjkgMTQuOSA1LjMgMS44IC42IDUuNSAuNyA2LjkgMi4xczEuMyA3LjMgMS4xIDkuMi0zLjIgMy00LjggNC4yYy0zIDIuMS00LjkgNC40LTYuNiA3LjctNC4zIDguNi03LjggMTcuNS0xMC42IDI2LjctMS40IDQuNC0xLjYgOS41LTMuNCAxMy43LS45IDEuMS0xLTEtMS0xLjUtLjItMi0uNC00LjEtLjYtNi4xLS43LTUuMy0xLjctMTAuNy0xLjktMTYuMS0uNS0xMi4xLTItMjQtMi0zNi4yIDAtMy0uMS02IDAtOSAuMS0xLjEgLjEtMi4zIDEuMi0yLjl6TTIzNi40IDU2NS45YzQuMi0zLjYgOS41IDIuOCA1LjMgNi4zcy05LjMtMi41LTUuMy02LjN6TTQxOCA1NjUuMWMyLjktMS43IDcuNyAxLjggNi41IDUuMS0xIDEtNC4zIDIuMS01LjYgMS44LTEuNS0xLjItMS44LTUuNC0uOS02Ljl6TTQ2MS44IDU3Ny42Yy4zIDEuMi0yIC40LTIuNSAuMi0zLjEtLjktNi4xLTEuOS05LjItMi44LTYuMS0xLjctMTIuMS0yLjktMTguMi00LjItMS44LS40LTMuMy0xLjktMy0zLjkgLjYtLjkgMS43LS45IDIuNy0uOSAyLjQgMCA0LjkgLjEgNy40IDAgMy42LS4xIDgtMS43IDExLjYtLjggMS42IC40IDIuNCAyLjEgMy4zIDMuMyAyLjQgMy4yIDUuNiA1LjkgNy45IDkuMXpNMTQwOCA1NjYuM2MxIC41LS44IDEuMi0xLjEgMS4zLTIuMSAuOC00LjQgMS4yLTYuNiAxLjctNS42IDEuNC0xMS4yIDMtMTYuOSA0LjEtMTEuOCAyLjQtMjMuNSA0LjQtMzUuNSA1LjctMy41IC40LTYuOSAuOC0xMC40IC45LTEuMyAuMS0yLjkgLjYtNC4xIC4xczIuNi0yLjQgMy4yLTIuN2MzLjgtMiA4LjQtNS40IDEyLjYtNi4yIDMuNi0uNiA3LjgtLjIgMTEuNS0uMiA2LjEgMCAxMi4yLS4xIDE4LjItLjYgNi43LS40IDEzLjQtMS41IDIwLTIuNSAyLjktLjQgNi4yLTEuNyA5LjEtMS42ek03NTQgNTY5LjJjLS4zLTEuOC00LjMtLjctNS4yIC4xLTEuNiAxLjMtMi42IDMuNS00IDUtMS45IDIuMy00LjIgNC4zLTYuMSA2LjctNS4zIDYuMi0xMi42IDEyLTE5LjMgMTYuNy0yLjQgMS43LTUuNSAyLjgtNy42IDQuOS0uNCAuNi0uMiAuOSAuNCAxLjEgMy4zIC4zIDguMy00IDEwLjktNS44IDguNC02IDE2LjEtMTIuOSAyMy40LTIwLjIgMi4zLTIuMiA2LjctNS40IDcuNS04LjV6TTUwNi43IDYyOC41Yy0uOC0xLS4yIDMgMCAzLjUgLjkgMi4zIDIuMSA0LjMgMy42IDYuMiAyLjggMy42IDYuNiA2LjEgMTAuNiA4LjIgMS44IC45IDQuMyAxLjUgNS44IDIuOCAuMyAxLjEtMi41IC43LTMgLjYtMy41LS40LTYuOS0xLjQtMTAuMy0yLjUtMTIuNS00LTIyLjQtMTIuMS0zMy40LTE5LTUuNC0zLjQtMTAuOS03LjYtMTcuMi05LjEtMTQuMi0zLjItMzAuMS0xLjYtNDMuMy04LjUtOC00LjItMTYuOC0xNC0xMi44LTIzLjcgMy41LTguMyAxNS4zLTEzLjkgMjQtMTMuNCA3LjMgLjQgMTQuNCAzLjYgMjEuNCA1LjYgMTAuMSAyLjkgMjEuOSA0LjQgMzEuMyA5LjEgNy4yIDMuNiAxMy40IDkuOSAxOS40IDE1LjJzMTAuOCA5LjYgMTYuNCAxNC4zYzIgMS44IDQuMiAzLjIgNiA1LjIgLjggLjggLjkgMiAxLjYgMi44IDUuMSA1LjkgMTMuNSAxMCAxNyAxNy40IDEuMSAyLjIgMCA0LjQtMi4zIDUuMy0zLjMgMS40LTcuMyAuOS0xMC43IDAtNy45LTIuMS0xNy45LTcuMy0yMi4yLTE0LjYtMS0xLjctMS4yLTMuNS0xLjktNS40ek02MDIuOSA1NzQuNWMxLjMtLjUgMi45IC41IDQuMyAuOCAzLjMgMSA2LjcgMiAxMC4xIDIuNyA2LjQgMS40IDEyLjkgMi42IDE5LjQgMy44IDggMS41IDE1LjQgMiAyMS44IDcuNSAzLjIgMi43IDYgNi4yIDguMiA5LjggMS44IDIuNyAzLjUgNi4zIDYuNSA3LjdzNS43IC42IDguMyAuN2M1LjIgLjMgMTAuNSAxIDE1LjYgMS43IDIuNCAuMyA0LjkgMCA2LjkgMS40czQuNyAzLjIgNS45IDUuNGMxLjcgMy4xIDEuNCA3LjYgMS42IDExLjEgLjIgMi40IC45IDUgLjIgNy40LTEgMS41LTUuNi0xLTctMS41LTcuNS0yLjctMTUuMi00LjgtMjIuNy03LjQtMTUuNi01LjMtMzIuNC04LjktNDguNi0xMS40LTUuOS0xLTExLjgtMS45LTE3LjctMi42LTIuMy0uMy01LjYtLjItNy42LTEuNHMtMi00LjctMi40LTYuN2MtMS4zLTYuNy0yLTEzLjUtMi44LTIwLjQtLjMtMi4xLTEuOS03IDAtOC42ek0yMjEuMyA1ODkuMWMtNC41LTIuOC0uOS0xMCAzLjktNy42czEuMSAxMC4yLTMuOSA3LjZ6TTE0NTQuOSA1ODkuMmMuOCAuNS0xLjYgMy4yLTIgMy43LTIuOCA0LTYuMSA3LjQtOS4xIDExLjItMTIuNSAxNi0yOCAyOS42LTQzIDQzLjMtMTAuOCA5LjktMjMuNSAxOC40LTM1LjcgMjYuNS0yNy4xIDE4LTU1LjYgMzMuNy04NS41IDQ2LjYtOC42IDMuNy0xNy4xIDcuNy0yNiAxMC43LTIuNiAuOC01IDIuNC03LjYgMi45LTUuOSAxLjEtMTIuNS0uNy0xOC41IDAtMy44IC40LTcuNyAuMS0xMS41IC41LTMuMSAuMy03IDEuMS0xMCAuNi0xLjItLjcgMS41LTEuMyAyLTEuNCAyLjktLjcgNS45LTEuNSA4LjktMi4zIDcuNC0yLjIgMTQuOC00LjUgMjIuMi03LjEgMjIuMS03LjYgNDQuNS0xNS41IDY1LjQtMjYgMzcuOC0xOSA3NC4yLTM5LjUgMTA3LjMtNjYuMSA1LjUtNC40IDEwLjYtOS40IDE1LjgtMTQuMnM5LjktOC43IDE0LjEtMTMuNmMzLjItMy44IDYuNC03LjYgOS44LTExLjMgMS0xLjEgMi0zLjQgMy40LTR6TTU0Ni40IDU5My44YzEuMSAuNiAuNSAxLjcgLjQgMi43LS40IDIuMi0uNiA0LjYtLjcgNi44LS4xIDEuNCAuNCA0LjItLjkgNS4ycy0zLjcgLjUtNS4yIC43Yy01LjEgLjctMTAuMSAuNy0xNS4yIDEuNC0yLjUgLjQtOS4zIDIuMi05LjktMiAuNi0yLjEgNC43LTMuNSA2LjQtNC41IDUuNS0zLjIgMTEuMy02IDE3LjItOC40IDIuMy0uOSA1LjQtMi40IDcuOS0xLjl6TTIwNS40IDU5OC45YzQuMi0zLjYgOS40IDIuNiA1LjIgNi4xcy05LTIuNC01LjItNi4xek05MDEuMSA3ODAuOWMtLjggMi4yLTYuMSAyLjQtOCAyLjktOCAyLjEtMTYgNC0yMy45IDYuMi0zMS4yIDguNS02MS43IDE5LjItOTEuMSAzMi43LTQwLjggMTguNi03OC41IDQyLjktMTEzLjQgNzEtMTIuNSAxMC0yMy45IDIxLjItMzUuNiAzMi0zIDIuNy01LjcgNS43LTguNiA4LjYtMS4xIDEuMS0yLjQgMi45LTQgMy4zLTIuMiAuNS01LjMtLjUtNy41LS45LTQuOC0xLTkuOC0xLjgtMTQuNy0yLjYtMTYuNC0yLjUtMzIuNy01LjItNDkuMi03LTI5LjktMy4zLTYwLjUtMS44LTkwLjMgMS05LjggLjktMTkuNSAyLjItMjkuMyAzLTI2LjMgMS45LTUyLjYgNi4yLTc4LjcgOS44LTEyLjcgMS43LTI1LjUgMy0zOCA1LjQtOS4zIDEuOC0xOC43IDMuMy0yOCA1LjEtMi4yIC40LTggMi41LTkuMyAwLS4yLTIuMSA0LjUtMy42IDYtNC41IDYuOC0zLjcgMTMuNy03LjMgMjAuNS0xMSAyOS0xNS42IDU4LjMtMzEuNCA4OC4zLTQ1LjIgMzQuNS0xNS45IDY4LjktMzEuOSAxMDQuNS00NS41IDQ1LjEtMTcuMyA5MS4zLTMxLjMgMTM4LTQzLjQgMjIuNi01LjkgNDUuNS0xMSA2OC40LTE0LjkgMTAuMi0xLjggMjEuMi01LjIgMzEuNS0yLjIgNS42IDEuNiA5LjcgNS41IDEzLjcgOS41IDUuMyA1LjIgMTAuMyAxMC44IDE0LjkgMTYuNiAxLjggMi4yIDMuNCA0LjkgNS41IDYuOSAxLjQgLjgtLjItMi4zLS40LTIuNy0xLjgtMi43LTMuNS01LjUtNS4yLTguMy0zLjQtNS41LTguMy0xMi42LTkuNS0xOS0uNi0zLjUtLjEtNy4yIDIuOS05LjQgMy45LTIuOCA5LTMuNSAxMy41LTQuNSA3LjEtMS42IDE0LjQtMi45IDIxLjYtMy45IDE1LjMtMi4zIDMwLjQtNSA0NS44LTYuOCAxMC0xLjIgMjAuNC0xLjUgMzAuMy0zLjMgMS0uNC0uMy0uNy0uOC0uNy0xLjYtLjItMy40LS4xLTUuMS0uMS00LjQgLjEtOS40IC42LTEzLjggMS4yLTEzLjMgMS45LTI2LjggMy41LTQwLjIgNC44LTExLjYgMS4yLTIzLjEgMy4zLTM0LjYgNS4xLTEwLjUgMS43LTIxLjMgMy42LTMxLTItOC43LTUtMTYuNC0xMy45LTIyLjUtMjEuNy0yLjUtMy4xLTQuOS04LTguMS0xMC4yLS42LS4xIC4xIDEuMSAuMiAxLjMgLjcgMS41IDEuNiAyLjggMi42IDQuMiAyLjMgMy40IDQuNSA3IDYuNiAxMC42IDQuMiA3LjIgMTMuMiAxOS4zIDMuNCAyNS44LTEuOSAxLjMtNC4yIDItNi4zIDIuNy0zLjggMS4yLTcuOSAxLjctMTEuOCAyLjUtOC4zIDEuOC0xNi43IDMuMi0yNS4xIDQuOS0yNC40IDQuOS00OC43IDEwLjgtNzIuOSAxNy4xLTY2LjQgMTcuNC0xMzAuNCA0Mi40LTE5MyA3MC4yLTM1LjEgMTUuNy02OC42IDM0LjQtMTAyLjkgNTEuNy05IDQuNi0xNy43IDkuOC0yNi44IDE0LjQtMi44IDEuNC03LjEgNS4yLTEwLjMgNS4xLTItLjEtMy0yLjctMy45LTQuMS0zLjEtNC40LTYtOS05LTEzLjUtMTAuMy0xNS4xLTE5LjgtMzAuOC0yOS40LTQ2LjQtMy42LTUuNy05LjItMTMuNi01LjMtMjAuNiAyLjItNCA3LTYuMyAxMC42LTguOSA4LjItNiAxNi45LTExLjggMjUuNS0xNy4yIDYuNC00IDEyLjQtOC43IDE4LjctMTIuOCAxOS4xLTEyLjMgMzcuOC0yNS4yIDU2LjUtMzggNi45LTQuNyAxMy43LTkuNCAyMC43LTEzLjggMy4zLTIuMSA4LjUtNC40IDEwLjktNy42IC40LTEuMS0zLjkgMS40LTQuNCAxLjctMi45IDEuOS02LjEgMy40LTkuMyA1LTkuNiA0LjgtMTguOSAxMC4yLTI4LjUgMTUtMjkuOCAxNC45LTU5LjEgMzAuOS04OC44IDQ2LjEtNC41IDIuMy05IDQuNS0xMy41IDYuOC0yLjcgMS4zLTUuNSAzLTguNSAzLjVzLTcgMS05LjMtMS41Yy0xLjctMS45IC44LTUuMSAxLjktNi44IDMuNS01LjcgNy4yLTExLjMgMTAuNy0xNyAxMS40LTE4LjMgMjQuOS0zNC45IDM4LjMtNTEuOCAzLjgtNC44IDgtOS41IDEyLjItMTQgMS41LTEuNyAyLjctMy45IDQuOS00LjggNC4zLTEuOCAxMS4xLS40IDE1LjYtLjEgMTIuNSAuOSAyNS4xIDIuOCAzNy0yLjEgNC44LTEuOSAxNy42LTYuNyAxMS4yLTEzLjctMi0yLjItNS43LTMuMy04LjUtNC4zLTYuMy0yLjQtMTIuOC01LjItMTkuMy02LjktMi43LS44LTcuNi0uOS05LjgtMi44LS44LTEuNyAyLjktNC40IDQuMS01LjQgNC41LTMuNiA4LjgtNy43IDEzLjQtMTEuMyAxLjUtMS4yIDMuMS0zLjYgNS4zLTMgNi4xIDEuNyAxMi4zIDQuOCAxOC4yIDcuMiA5LjMgMy43IDE4LjkgNy4yIDI3LjcgMTIgMTQuNSA4IDI4IDE3LjcgNDMuOCAyMyA1IDEuNiA5LjUgLjkgMTQuNiAxIDMuNSAuMSA3LjEgLjggMTAuNiAuMyAyLjktLjQgNi44LTIgNy44LTVzLS4zLTYuMy0yLjQtOC44Yy0zLjgtNC42LTguOS04LjEtMTMuMi0xMi4zLTQuOS00LjktMTAuNy04LjktMTYuMy0xMy05LjItNi42LTE4LjYtMTMuMS0yOC4zLTE4LjktNS41LTMuMi0xMS02LjUtMTYuNS05LjgtMi41LTEuNC01LjktMi40LTguMS00LjQtLjctMS4zIDEuNS0xLjkgMi41LTIgMS43IDAgNC4xIDIuMiA1LjYgMy4xIDguNyA1LjMgMTcuNSAxMC41IDI2LjEgMTUuOSAxMC40IDYuNSAxOS42IDE0LjIgMjguOSAyMi4xIDguNyA3LjIgMTYuNyAxNS4zIDI3LjEgMjAuMSA3LjIgMy40IDE4LjYgOC40IDI2IDMuMSAzLjItMi4zIDMuOC02LjUgMi44LTEwLTEuNy01LjgtNi4zLTExLjYtOS45LTE2LjQtOC4zLTEwLjctMTYuOC0yMS4xLTI2LjMtMzAuNy0yLjgtMi45LTUuMy02LjItOC40LTguOS01LjItNC41LTEwLTkuNC0xNS40LTEzLjgtMi0xLjYtNS45LTMuOC02LjgtNi4zIC4xLTIgNS0zLjQgNi42LTQuMSA3LTIuOSAxNC4xLTUuNCAyMS4yLThzMTMuMy00LjMgMjAuMS02LjJjMi41LS43IDYuMS0yLjMgOC44LTEuNyAxLjggLjQgMy4yIDEuNyA0LjggMi42IDQuNSAyLjUgOC44IDUuNyAxMy4xIDguNiA5LjkgNi44IDIwLjcgMTMuNiAzMi41IDE2LjMgNy4zIDEuNyAxNS45IDIuOCAyMy4yIC45IDMuMy0uOCA2LjktMi4xIDcuNS02cy0yLjEtNi40LTQuMS05Yy00LjctNS44LTEwLjItMTAuNy0xNS42LTE1LjktMS44LTEuOC01LjQtMy43LTYuMS02LjMgLjMtMS43IDQuMi0xLjEgNS41LTEuMyA2LjMtLjkgMTIuNi0uNyAxOC45LTEuNHMxMi43LS40IDE5LjEtLjRjMjEuMSAwIDQxLjYgMi40IDYyLjUgNSAyNy4xIDMuMyA1NC43IDExLjIgODAuMiAyMS4xIDUyLjIgMjAuMyAxMDMuMiA0OC44IDE0My43IDg4IDUgNC45IDEwLjYgOS41IDE1LjUgMTQuNSA3LjcgNy45IDE0LjcgMTYuMyAyMiAyNC41IDMuMiAzLjYgNi4xIDcuNCA5LjEgMTEuMSAxLjEgMS4zIDMuMSAzIDMuMSA0Ljd6TTE4OS42IDYxNS41YzMuOC0zLjYgOS43IDEuMSA2LjEgNS4zcy05LjctMS4xLTYuMS01LjN6TTEwNDQuOCA2MjQuOGMuOSAxLjQgMS4yLTEuNCAxLjItMS45IC4xLTIuMi0uMi00LjItLjQtNi40LS40LTQtLjMtOC4yLS41LTEyLjItLjItMS43IC4yLTMuNy0uNC01LjQtLjYtLjUtLjcgMS4zLS43IDEuNi0uMSAyLjIgMCA0LjUgMCA2LjcgMCAzLjggLjQgNy42IC41IDExLjMgMCAyLjEtLjMgNC40IC4zIDYuM3pNNDU5IDY5OS4xYy0uMSAxLTIuNS0uOS0yLjktMS4xLTEuNCAwIC40IDEuNCAuNyAxLjcgMiAxLjcgMy44IDMuNyA1LjcgNS41IDMuOSA0IDcuOCA4LjggMTAuMiAxMy44IDEuNCAyLjcgMS45IDUuOC0uNiA4LjEtMy43IDMuNC05LjIgMS44LTEzLjEtLjQtOS40LTUuMS0xNC42LTEzLjQtMTkuMS0yMi43LS45LTEuMS0uNSAxLjctLjQgMiAuNiAyLjQgMS41IDQuNyAzIDYuNyAyLjEgMyAzLjkgNiA2LjUgOC41czUuMSAzLjQgNi45IDUuN2MuNCAxLTQuMi0xLjMtNC45LTEuNi0zLjMtMS40LTYuOS0zLjEtOS45LTUuMi05LTYuNC0xNi40LTE0LjYtMjUuMi0yMS4zLTExLjQtOC44LTIzLTE3LjEtMzUuNC0yNC41LTEwLjUtNi4yLTIyLjQtMTIuMS0zMS4xLTIwLjctNy4zLTcuMS0xNC42LTE5LjctOC43LTI5LjYgNC40LTcuNSAxNS0xMC4yIDIyLjktNy42IDUuMyAxLjggOS43IDUuMSAxNC4zIDguMiA1LjggMy43IDExLjIgOC40IDE2LjcgMTIuNiAxNS40IDExLjggMjkuOCAyNC40IDQzLjUgMzguMiA0LjkgNC45IDkuNCAxMC4xIDEzLjkgMTUuMyAyLjIgMi41IDUuNyA1LjQgNyA4LjR6TTQxNC41IDYzNi40Yy0xLS40LS4yLTEuMyAuMi0xLjkgMS42LTEuOSAzLjItMy44IDQuNy01LjggMi4xLTIuOSA0LjEtNS45IDYuMy04LjggLjktMS4yIDItMi43IDMuOC0yLjdzNS43IC43IDYuNiAyLjIgLjQgMi43IC42IDMuOSAxIDMuNC0uMSA0LjQtNCAxLjktNS43IDIuNWMtMy43IDEuMy03LjQgMi42LTEwLjkgNC4xLTEuNyAuNy0zLjggMi4xLTUuNSAyLjF6TTQzOS42IDYyMC4xYzEuNS0xIDMuNC0uNCA1LS4yIDMuNyAuNCA3LjYgLjQgMTEuMyAxLjMgMS43IDEtMy45IDIuMi00LjYgMi40LTMuMSAxLTcuNCAzLTEwLjcgMi45LTEuNy0uNi0xLjktNS4xLTEtNi40ek0xMzc5LjkgNjUwLjVjMS43IC40LTIuNiAyLjgtMy4xIDMuMi00LjIgMi45LTguNSA1LjUtMTIuNyA4LjItOC43IDUuNS0xNy40IDEwLjktMjYuNSAxNS41LTIuNCAxLjMtNC43IDMtNy4yIDQuMXMtNC42IDAtNi44LS40Yy00LjctMS05LjMtMi41LTEzLjgtNC4zLTkuMS0zLjYtMTguMS03LjUtMjYuOC0xMi4ycy0xNi05LjktMjQtMTQuOWMtNC44LTMuMS05LjctNi45LTE0LjEtMTAuNi0xLjItMS00LjMtMi42LTQtNC41czMuMy0yLjcgNC42LTMuNGM0LjEtMi4zIDcuOS01LjEgMTItNy41IDEuNC0uOCAzLjEtMi40IDQuOS0xLjhzNC4xIDIuNyA1LjggMy45IDQuNCAyLjYgNi41IDRjNi4zIDQuMSAxMy45IDcuNyAyMC45IDEwLjYgMjIuMSA5LjEgNDQuOCAxMy4xIDY4LjggMTIuMSA1LjItLjMgMTAuMy0xLjYgMTUuNS0yek0xODAuNiA2MzcuN2MtMy45IDMuNC05LjMtMS42LTUuNy01LjZzOS4zIDEuNyA1LjcgNS42ek0xMzE1LjcgNjg3LjdjLjggMS4zLTEuMyAxLjktMi4yIDIuNC0zIDEuNS02IDIuOS05IDQuNC0xMi44IDYuNC0yNi4yIDExLjctMzkuNCAxNi45LTE5LjcgNy44LTQwIDE0LjUtNjAuNSAxOS44LTkuMSAyLjQtMTguMSA1LjMtMjcuMyA3LjItMTMuNCAyLjgtMjcuMiAzLjctNDAuOCA1LjgtOS43IDEuNS0xOS42IDIuNS0yOS4zIDQuNC0zLjUgLjctNyAxLjEtMTAuNSAxLjUtMS4yIC4xLTIuNiAuOC0zLjkgLjRzMi41LTMuNSAzLjItNC4yYzQuMi00LjMgOC43LTguMyAxMy0xMi41IDE3LjgtMTcuOCAzOC0zMy4xIDU3LjgtNDguOCAxNS41LTEyLjMgMzItMjMuNyA0OC42LTM0LjYgNC4xLTIuNiA4LjItNS4zIDEyLjItOCAxLjQtMSAzLjktMy4xIDUuNi0zLjFzNC4zIDIuNyA1LjcgMy44YzUgMy41IDkuNiA3LjQgMTQuNyAxMC44IDEzLjIgOC45IDI2LjUgMTcuMyA0MC44IDI0LjUgNC44IDIuNCA5LjcgNC4zIDE0LjcgNi4zIDIuMSAuOSA0LjkgMS41IDYuNiAzek01NC40IDY0Ny44Yy44LS4yIDEuNSAxLjYgMS45IDIuMSAxLjkgMi42IDMuNyA1LjMgNS42IDggNy41IDEwLjYgMTUuMiAyMS4yIDIzIDMxLjYgMjUuOCAzNC4xIDUwLjcgNjguOSA3NS44IDEwMy40IDYuNCA4LjkgMTIuNyAxNy44IDE5LjQgMjYuNCAyLjEgMi43IDQuMSA1LjQgNi4xIDguMSAuOCAxLjEgMi4xIDIuNCAyLjMgMy44LS4zIC42LTEuMi0uNC0xLjYtLjVzLTEuMyAxLjEtMS45IDEuN2MtMS44IDEuNy0yLjYgMy44LTQuMSA1LjYtLjYgLjctMS45IDEuMi0yIDIuMnMuNSAxLjkgLjcgMi44LTEuNS0xLjEtMS42LTEuM2MtMS4yLTEuOS0yLjItMy44LTMuNC01LjctMi45LTUtNi0xMC05LTE1LTktMTUuMi0xOC4yLTMwLjctMjguMS00NS4zLTctMTAuMy0xMy41LTIxLjEtMjAuMS0zMS42LTEzLjctMjEuOS0yNy45LTQzLjYtNDIuMy02NS01LjItNy43LTEwLjQtMTUuNS0xNS44LTIzLjItMS4zLTEuOS0yLjYtMy45LTMuOS01LjgtLjQtLjYtMS4yLTEuNi0xLTIuM3pNMTY1LjUgNjU0LjZjLTQuMSAzLjQtOS40LTIuMy01LjMtNS44czkgMi4zIDUuMyA1Ljh6TTQyMi40IDcxNC4xYy4xIC43LS45IC4yLTEuMiAwLTEuNi0uOS0zLjItMi4zLTUuMS0yLjctMS4zIC4yIC42IDEuNCAxIDEuNyAxLjkgMS4zIDMuOSAyLjYgNS45IDMuOSA1IDMuMiA5LjUgNi43IDEzLjcgMTEgMS44IDEuOCA0IDQuMSAxLjggNi43LTMuMyAzLjgtOS4yIDIuOC0xMy41IDEuOS0xMS42LTIuMi0yMS44LTkuMy0yNy4zLTE5LjctLjktLjctLjMgMi4yLS4yIDIuNSAuNyAyLjIgMi4xIDQuMyAzLjcgNiAyLjUgMi43IDUuNiA1LjIgOC44IDcgMS44IDEuMSA0LjkgMi4yIDYuMyAzLjggLjEgMS4xLTIuNCAuNC0yLjkgLjMtMy0uNS02LTEuMi04LjktMi40LTExLjYtNC44LTIxLjUtMTIuNS0zMi41LTE4LjQtMTYuNS04LjgtMzMuOS0xNS40LTUxLjItMjIuMy05LjMtMy43LTIwLjYtOC4yLTI0LjMtMTguNHMzLjQtMjAuNyAxMy4xLTIzLjFjMy45LTEgNy45LS4yIDExLjYgMS4xIDcuMSAyLjQgMTMuNyA3IDIwLjQgMTAuNCAxOC44IDkuNCAzNi44IDE5LjcgNTQuNCAzMSA3IDQuNCAxMy44IDkuMSAyMC4xIDE0LjQgMS45IDEuNiA1LjEgMy4xIDYuMyA1LjN6TTkzOSA2NjAuN2MuNi0uMSAxLjMgMS4yIDEuNiAxLjcgMS4zIDEuNiAyLjYgMy40IDMuOCA1LjIgMy44IDUuOSAxMi40IDEzLjkgNi42IDIxLjEtMSAuNi0xLjUtMS4zLTEuOC0yLTEtMy0xLjctNi4yLTIuOC05LjItMS40LTQuMS0zLjMtOC01LjItMTEuOS0uNi0xLjItMi41LTMuNi0yLjItNC45ek0xNTEuMSA2NjUuOWMzLjUgNC4xLTIuNyA5LjctNi4xIDUuN3MyLjMtOS4yIDYuMS01Ljd6TTgzMi42IDY2OGMuNyAuMS0uNiAyLjUgMS4zIDMgLjctLjEgMS4xLS42IDEuOC0uOXMuNyAxLjQgLjcgMi4xYy0uMSAyLjQtLjUgNS4xLTEuMyA3LjQtMS4xIDEuMy0uOC0yLjYtMS0zcy0xLjktMS0yLjYtMS0xLjEgMi4zLTEuNCAzLjJjLS45IDMuMSAuMiA1LjYgMCA4LjUtLjEgMS41LS43IDMuNCAwIDQuNyAxLjUgMS4yIDIuNi0xLjggMy40LTIuNiAuNi0uMi0uNCA0LjEtLjUgNC42LS4zIDIuMy0uNCA2LjUtMiA4LjQtMiAuOS00LjQtMi40LTQuMy00LjEgMC0zLjkgMS43LTggMi4yLTExLjlzLS4xLTkgLjEtMTMuNGMuMS0yLjMgMS4zLTQuMiAzLjYtNXpNODIzLjcgNjc1YzEuOSAuMSAxLjMgNC4yIDEuMyA1LjUgMCA0LjIgLjUgOC41LS42IDEyLjYtLjMgMS4xLS4zIDIuNC0xLjEgMy4zLTIgLjgtNS4yLTMuMS02LjgtNC4xLTUuMi0zLjMtMTAuMS03LTE1LjEtMTAuNC0yLjItMS41LTUuOC0yLjktNy4zLTUuMS0uMS0uOSAyLjkgLjggMy4zIDEgMi4yIDEgNC41IDEuOSA2LjkgMi4xIDUuMSAuNSAxMC0uNCAxNC43LTIuNCAxLjYtLjcgMy4xLTEuOSA0LjctMi41ek0xMzYuMiA2ODguOGMtNC4zIDMuMS05LTMuMS01LTYuNHM5LjIgMi45IDUgNi40ek0xMDA5LjEgNjg2LjFjMS4zIC40IC45IDMuNCAuOSA0LjQgLjIgNC4yIC44IDguNyAxLjQgMTIuOCAxLjIgNy43IDEuMSAxNS40IDEuNyAyMy4xIC40IDYuNyAuOSAxMy4zIC45IDIwIDAgMy41IDAgNyAwIDEwLjUgMCAxLjUgLjMgMy41LS4zIDQuOXMtMi43IDEuMi0zLjkgMS40Yy0zLjUgLjYtNi45IDEuMS0xMC40IDEuNi05LjggMS40LTE5LjYgMi43LTI5LjMgNC40LTUuMSAuOS0xMS40IDIuOS0xNi42IDIuNC0xLjItLjUtLjItMS45IC4zLTIuNyAxLjMtMi4xIDIuNi00LjQgNC02LjUgMS45LTMgMy41LTYuNSA1LjYtOS40IDQuMy01LjcgOS4yLTExLjMgMTQtMTYuNyA5LjUtMTAuNiAxNy0yMy42IDI0LTM2IDEuOS0zLjQgMy42LTYuOCA1LjQtMTAuMyAuNS0xLjEgMS0zLjMgMi4zLTMuOXpNMTIyLjYgNjk5LjRjMy40IDMuOS0yLjQgOC45LTUuOSA1LjRzMi4zLTkgNS45LTUuNHpNMzEyLjEgNzI0Yy45IDEuMS0yLjQgMS4xLTIuOSAxLjJzLjQgLjcgLjggLjdjMS45IC4yIDMuOCAwIDUuNyAuMyA0LjcgLjcgOS4xIDIuMSAxMy41IDMuOCAxLjYgLjYgNC4xIDEuOCA0IDMuOS0uMSAyLjktNC4yIDQtNi41IDQuNS00LjggMS05LjggLjYtMTQuNi0uNy0yLjItLjUtNC42LTItNi44LTIuMi0xIC41IDIuNiAyLjQgMy4xIDIuNSA0LjIgMS43IDguNSAxLjEgMTIuNiAyLjMgMSAuNy0uMSAxLjQtLjkgMS43LTEuNyAuNi0zLjUgMS01LjMgMS40LTYuNiAxLjQtMTQgMS40LTIwLjcgLjQtNy40LTEuMS0xNS4xLTEuNy0yMi42LTEuMy05LjMgLjUtMjQuMyA1LjctMjkuOC01LjItLjgtMS40LTEuMS0zLjEtMS40LTQuNi0xLjQtOS4zIDkuNC0xMi43IDE2LjMtMTMuOSAxNC4zLTIuNSAyOS45LTIuMiA0NCAxLjggMy43IDEuMSA4LjEgMS4zIDExLjUgMy40ek0xMDAuNiA3MzYuOGMtNC40IDMuMS04LjUtMy42LTQuNS02LjRzOC41IDMuMyA0LjUgNi40ek04Mi4zIDc1M2MtMi4zLTQuNCA0LjYtOC40IDcuMS00LjEgMi45IDQuOS00LjIgOC44LTcuMSA0LjF6TTk1NiA3NTkuMWMxIC4xIC4xIDEuMy0uMiAxLjctMS4yIDEuOC0yLjQgMy42LTMuNiA1LjRzLTEuOSA0LjEtMy40IDUuNi03LjkgMi40LTEwLjUgMi4zYy0uOC0uNSAuNS0xLjQgLjktMS43IDEuNy0xLjMgMy41LTIuNSA1LjItMy44IDIuMy0xLjcgNC42LTMuNCA2LjYtNS40czMtMy41IDUtNC4xek03Ny4xIDc2Ni40YzMuNyA0LTIuMiA5LjQtNiA1LjZzMi4zLTkuMSA2LTUuNnpNNjAuMyA3ODVjNC4yLTMuNSA5LjIgMi41IDUuMyA2cy05LjMtMi4yLTUuMy02ek0zMjAuOCA3ODkuNmMuNiAuNC0uOCAxLjMtMS4xIDEuNi0xLjkgMS40LTQgMi41LTYuMSAzLjctNSAzLjItMTAgNi41LTE1IDkuNy05LjYgNi4xLTE5IDEyLjYtMjguNSAxOC44LTMuNCAyLjItNi43IDQuNC0xMC4xIDYuNS0xLjMgLjctMi41IDEuOC00IDIuMi0uNy0uMSAuOC0xLjQgMS0xLjggLjEtMS4yLTEtMS4xLTEuNC0ycy4yLTEuMyAuMy0xLjktNC43IDEtNS41IDEuMiAyLjEtMS42IDIuNC0xLjdjMS44LS45IDMuNy0xLjggNS40LTIuOCA1LjUtMy4xIDExLjEtNiAxNi44LTguOCAxMS4yLTUuNiAyMi0xMi4xIDMzLjEtMTcuOSAyLjktMS42IDUuOS0zLjEgOC43LTQuOCAxLjItLjcgMi41LTIgNC0yek00OS45IDgwMy43YzQuNi0zLjIgOS42IDMuMiA1LjEgNi42cy05LjQtMy4yLTUuMS02LjZ6TTk4NC4zIDgwOC4yYzEuNSAuNi0xLjUgMS41LTIgMS42LTMuMyAuOS02LjUgMi05LjcgMy4xLTguNCAyLjgtMTYuOCA1LjctMjUuMSA4LjUtMjQuOSA4LjYtNDkuNyAxOC03NCAyOC4xLTMxLjIgMTMtNjIuMyAyNi42LTkyLjggNDEuNC0xMS4yIDUuNC0yMi41IDEwLjgtMzMuNSAxNi43LTMuOSAyLjEtNy44IDQuMi0xMS42IDYuNC0yLjQgMS4zLTQuNyAzLjEtNy4yIDRzLTUuMyAuOC03LjggMS4yYy02IDEuMi0xMiAxLjktMTggMy05LjIgMS44LTE4LjUgMy44LTI3LjcgNi4xLTIuOCAuNy01LjYgMS4zLTguNCAyLjEtMS42IC41LTMuOCAxLjQtNS42IDEuMi0xLjItLjcgMy44LTQuMiA0LjYtNC44IDUuNS00LjUgMTEuNi04LjUgMTcuNy0xMi4yIDUuMS0zLjEgOS45LTYuNiAxNS4xLTkuNyAyMC40LTEyLjIgNDItMjIuNiA2My43LTMyLjIgNTAuMS0yMi4yIDEwMy4yLTM5LjUgMTU2LjYtNTEuOSAxNC45LTMuNSAyOS45LTYuMiA0NS05IDQuMi0uOCA4LjUtMS40IDEyLjctMi4yIDIuNS0uNSA1LjQtMS42IDgtMS40ek00Ni45IDgyNi4yYy4xIDUuNS03LjUgNi4zLTguMiAuOXM3LjYtNi43IDguMi0uOXpNMzcuOSA4NDYuOGMtLjIgNS4zLTcuOCA1LjQtNy44IDBzNy42LTUuNCA3LjggMHpNMjMgODcwLjdjLTMuOC0zLjkgMS44LTEwLjEgNS43LTYuMnMtMS41IDEwLTUuNyA2LjJ6TTE3OS4yIDg2NGMyIC4xIDIuMSAyLjcgMiA0LjJzLjYgMi4xIC42IDMuM2MwIDIuNi0xLjUgNC41LTMuMiA2LjMtMi42IDIuNy02LjggNC4xLTEwIDUuOC03LjcgNC4zLTE1LjYgOC41LTIzLjUgMTIuNS0yMC42IDEwLjUtNDAuOCAyMi4yLTYxIDMzLjUtNS41IDMuMS0xMSA2LjUtMTYuNCA5LjgtMi40IDEuNS00LjggMy4zLTcuNSA0LjItMS4zIC4xIDMuMS0yLjkgMy43LTMuMiAzLjEtMS45IDYtNCA5LjEtNS45IDkuMS01LjUgMTguMS0xMS40IDI2LjktMTcuNCAxNy45LTEyLjEgMzYuNi0yMy4yIDU0LjUtMzUuNSA1LjUtMy43IDExLjItNy4yIDE2LjUtMTEuMiAyLjQtMS45IDUuNS01LjMgOC4zLTYuNHpNMjYwLjUgOTUxYy0uNyAxLjgtMy42IDIuNy01LjIgMy41LTUuNCAyLjYtMTEgNC42LTE2LjcgNi41LTIxLjggNy4zLTQzLjggMTQtNjUuNiAyMS4zLTYgMi4xLTEyIDQuMi0xOCA2LTEuOSAuNS01IDIuMS02LjggMS4yLTEuMy0xLjYgMC01LjQgLjQtNy4yIDEuMi02LjIgMi44LTEyLjIgNC4yLTE4LjMgNS4yLTIyLjIgMTMuOS00My4yIDIyLjktNjQuMSAyLjItNSA0LjUtOS45IDYuOS0xNC44IDEuMS0yLjIgMS45LTQuNSA0LjUtNS4yIDguOC0yLjYgMTIuOSAyLjggMTguNCA4LjMgMTAuNyAxMC44IDIwLjcgMjIuNCAzMC41IDM0IDYgNyAxMi4zIDEzLjcgMTguMyAyMC43IDEuNiAyIDYuMSA1LjUgNi4yIDguMXpNMTI0NyA4ODAuNGMxLjEgLjMtLjEgMS4zLS41IDEuNi0xLjYgMS4xLTMuMyAyLjItNSAzLjMtNC4yIDIuNi04IDYtMTIuMSA4LjgtMTIuNCA4LjUtMjUuMSAxNi45LTM4LjUgMjMuOC0yNS4zIDEzLjItNTAuOSAyNC44LTc4IDMzLjgtMTYuMSA1LjQtMzIuNiA4LjktNDguOSAxMy4zLTI2LjUgNy4xLTU0LjYgOS41LTgxLjcgMTIuMS0zNC40IDMuMi02OC45IDIuNy0xMDMuMyAuOS0yMy44LTEuMy00Ny40LTUtNzEtNy45LTIyLjktMi44LTQ2LTYuMy02OC42LTEwLjktMTQuMi0yLjgtMjguNS01LTQyLjgtNy40LTcuNi0xLjMtMTUuMi0zLjEtMjIuOC00LjJzLTE0LjItMi41LTIxLjMtMy41Yy0zLjMtLjUtOC4zLS40LTExLjItMi0uNy0xLjEgMS43LTEuNCAyLjMtMS42IDMuMy0xIDYuNS0yIDkuNy0zIDEzLTQuMiAyNi41LTguMyA0MC0xMC40IDE1LjEtMi4zIDMwLjEtNS41IDQ1LjQtNyA0MC44LTQgODIuMi00LjYgMTIyLjkgLjcgMTMuOCAxLjggMjcuNyAyLjcgNDEuNSA0LjMgMjYuNiAzIDUzLjMgNS45IDgwLjEgNi45IDIxLjcgLjcgNDMuMy0uNCA2NC44LTEuOSAyMC40LTEuNSA0MC45LTMuNSA2MS03LjMgMzMtNi4yIDY1LjQtMTUgOTcuMi0yNS44IDkuNS0zLjIgMTkuMS02LjggMjguMy0xMC44IDIuNi0xLjEgNS40LTIgNy45LTMuMyAxLjUtLjkgMi44LTIuMiA0LjYtMi41ek0yMi4zIDg5MS45Yy00LjEgNC05LjgtMi01LjktNnM5LjEgMi4yIDUuOSA2ek0xMTM0LjYgODkxLjNjLjggLjctLjggMS4zLTEuMyAxLjUtMi4zIC45LTQuNSAxLjktNi42IDMuMS01LjYgMy4zLTExLjUgNi40LTE3LjQgOC45LTEwLjggNC41LTIxLjMgOS4zLTMyLjIgMTMuNi02LjMgMi41LTEyLjggNS4zLTE5LjUgNi44LTExLjcgMi41LTI0LjIgMi4yLTM2LjEgMi44LTkuMiAuNS0xOC40IDEuMS0yNy42IDEtNi42LS4xLTEzLjMtLjgtMjAtMS04LjQtLjItMTYuOC0uMy0yNS4xLTEuMS05LjYtLjktMTkuMi0yLTI4LjctMi44LTE2LjQtMS40LTMyLjctMy44LTQ5LTUtNy41LS42LTE1LjUtLjQtMjIuOS0xLjgtMS40LS42IDEuOC0uOCAyLjItLjggMi43IDAgNS41LS4xIDguMiAwIDcuMSAuNSAxNC4yIC41IDIxLjMgLjUgMTUuMyAwIDMwLjcgLjUgNDYgLjUgNi40IDAgMTMuMSAuNSAxOS40LS4xIDEyLjctMS4zIDI1LjYtLjcgMzguMy0xLjQgMzAuMS0xLjkgNjAuNS01LjYgOTAuMi0xMS4yIDE0LTIuNyAyOC4xLTUuNSA0Mi05IDQuMi0xLjEgOC40LTIuMSAxMi42LTMuMSAxLjgtLjUgNC4zLTEuNyA2LjItMS40ek0xNi43IDkxNGMtNCAzLjYtOS42LTIuMS01LjktNS45czkuNiAxLjkgNS45IDUuOXpNMTA5Mi4xIDkxNi44Yy45IC44LTMuNiAzLjItNC40IDMuNi00LjYgMi42LTEwLjggNC42LTE2LjEgNC4zLTEuMS0uNCAuNC0xLjEgLjktMS4zIDEuNy0uOSAzLjctMS4yIDUuNS0xLjkgMy4yLTEuMyA2LjQtMi44IDkuNy0zLjggMS4zLS40IDMtMS4xIDQuNC0uOXoiLz48cGF0aCBmaWxsPSIjZWRlM2YyIiBkYXRhLXRvbmU9ImJsdWUiIGQ9Ik03MTMuNSA4Mi41YzItLjcgNS42IDIgNy41IDIuOCA2LjggMyAxMy4zIDYuNyAyMCA5LjkgMzAuMSAxNC40IDU3LjcgMzQuNSA4My43IDU1LjEgMzUuNSAyOCA2NyA2MS4zIDkzLjIgOTguMSAxLjUgMiAzIDQuNiA0LjggNi40czIuNyAyLjIgMy43IDMuOGM2LjMgOS40IDExLjggMTkuNSAxNy4yIDI5LjMgNiAxMC42IDEyLjIgMjEuMyAxNy4xIDMyLjQgMS42IDMuNCAyLjMgNy4xIDMuNyAxMC42IDEyLjYgMzEuOCAyMS40IDY1LjEgMjMuNiA5OS40IC40IDcuNyAuMSAxNS40IDAgMjMtLjEgNS4yIC4zIDEwLjUtLjEgMTUuNy0yLjIgMzEuOS0xMS4yIDY0LjctMzEuMiA5MC4yLTYuNSA4LjMtMTQuMSAxNS43LTIzLjEgMjEuMi0yLjQgMS41LTQuOSAzLjctNy43IDQuNi0uOS0uMSAyLjktMy41IDMuNC00IDIuNC0yLjQgNC42LTQuOSA2LjktNy40IDYuNS03LjMgMTEuMS0xNi40IDE1LjItMjUuMyA2LjgtMTQuOSAxMC41LTMyLjEgMTEuNS00OC40IC41LTcuMiAuMS0xNC41IC4xLTIxLjdzLS40LTEzLjYtMS40LTIwLjNjLS4zLTIuMi0uMS01LjEtMS4xLTctMS4yLTEtLjYgMy4yLS41IDMuNyAuMiA0LjEgLjkgOC4zIDEgMTIuNSAuMSA3LjkgLjQgMTYgMCAyMy45LS4yIDMtLjggNS45LTEgOC44LS4zIDUuOS0xLjggMTEuNi0yLjggMTcuNC00IDIyLTEzIDQzLjEtMjguMiA1OS42LTQuNyA1LjEtMTAuMSA5LjctMTYuMiAxMy4xLTIgMS4yLTQuNCAzLTYuOCAzLjItMi45LS44IDEuOS01LjMgMi43LTYgNS45LTUuOSAxMS4xLTEyLjkgMTQuNy0yMC41IDkuMS0xOS4zIDEwLjktNDAuMyA4LjUtNjEuMy0xLjQtMTItNC4zLTIzLjctNy40LTM1LjQtLjgtMy4xLTEuNy02LjItMi43LTkuMi0uNi0xLjctMS42LTMuMy0xLjctNS4xLS4zLTQuOSAxLjctMTAuNiAyLjMtMTUuNSAxLjItMTEuMyAxLjMtMjMuMSAuNS0zNC40LTIuNi00MC41LTE0LjYtODAuNi0zMy4zLTExNi42LTcuMi0xMy45LTE1LjMtMjcuNS0yNC40LTQwLjItMi40LTMuMy00LjgtNi42LTcuMy05LjktLjktMS4yLTEuOS0zLTMuMi0zLjgtLjctLjEgLjcgMS45IC44IDIuMSAxLjcgMi40IDMuMyA0LjggNC45IDcuMSA0LjIgNi4xIDguNCAxMi4yIDEyLjIgMTguNiAxMS42IDE5LjMgMjIuOCAzOS43IDI5LjQgNjEuNCAzLjIgMTAuNyA2LjQgMjEuNCA4LjggMzIuNHMzLjUgMjEuNiA0LjMgMzIuNWMyLjUgMzguNS0xLjggNzcuOC0yMi45IDExMS03LjEgMTEuMi0xNS42IDIwLjYtMjUgMjkuOC0yLjUgMi40LTUuMSA0LjktNy45IDcuMS0xIC43LTIgMS45LTMuMiAyLjEtMi41LS45IDIuMy01LjggMy4xLTYuOCA1LjItNi40IDkuNS0xNC45IDEyLjYtMjIuNiA3LjMtMTguOCAxNS40LTM3LjIgMTkuNC01Ny4xIDEtNC44IDIuMi05LjUgMi45LTE0LjMgLjItMS42IC44LTMuMiAuNy00LjhzLTEgLjctMS4xIDEuMWMtLjcgMS45LTEuMSA0LTEuNiA1LjktMS4yIDUuMy0yLjcgMTAuNi00LjUgMTUuNy01LjggMTUuNi0xMi44IDMwLjItMjIuMSA0My45LTE4LjkgMjcuNi00Ny4zIDQ4LTgwLjggNTIuOC03LjIgMS0xNC40IDItMjEuNyAxLjUtOC43LS43LTE3LjItLjYtMjUuNy0yLjgtMi40LS42LTYuNy0uNy04LjItMi45LS42LTIuMSA0LjYtMi45IDYuMS0zLjQgNy4xLTIuMyAxMy42LTYuNiAxOS40LTExLjMgMTQtMTEuNiAyMS41LTI4LjMgMjkuMy00NC4yIDYuMy0xMyAxMC40LTI3LjIgMTMuNS00MS4yIDctMzEuMyA3LjUtNjMuNCAxLjgtOTQuOS0xLjgtOS45LTQuMi0xOS40LTctMjktMS41LTUuMS0yLjktMTAuNy01LjQtMTUuNC0uNi0uNy0uNSAuNS0uNSAuOSAuMyAxLjMgLjkgMi42IDEuMyAzLjkgMS4yIDMuNCAyLjMgNi45IDMuMiAxMC4zIDIuOSAxMC42IDYuMSAyMS42IDcuMiAzMi41IDEgOS44IDIuNyAxOS41IDMgMjkuMyAuNyAyMi0xLjMgNDMuOS01LjkgNjUuNC0xLjYgNy42LTQuMiAxNS02LjkgMjIuNC0uOSAyLjQtMS40IDYuMi00IDcuNS0xLjEgMC0uMi0yLjktLjEtMy42IC42LTMuNyAxLjItNy41IDEuNC0xMS4zIC40LTEwLjIgLjgtMjAuMi0uMS0zMC40LTIuNC0yOS45LTkuOC01OC4zLTE5LjEtODYuNy02LjItMTguOS0xNC4zLTM3LjItMjIuNi01NS4zLTE3LjgtMzguNy0zOC43LTc1LjItNjMuNi0xMDkuNy04LjItMTEuNS0xNy43LTIyLjQtMjcuMy0zMi43LTItMi4xLTQuMS00LjYtNi41LTYuM3MtNC4yLTIuMi01LjYtNC41Yy0uNC0xLjMgMi41IC4xIDMgLjMgMy41IC44IDYuOSAyLjEgMTAuMyAzLjIgOC42IDMgMTcuMiA2LjMgMjUuOCA5LjUgMTEuOCA0LjQgMjMuNSA5LjggMzQuOCAxNS41IDEzLjYgNi44IDI3LjUgMTQgMzkuOCAyMy4xIDE0LjIgMTAuNSAyNy43IDIwLjggMzkuOCAzMy43IDUgNS4zIDEwLjYgMTEgMTQuMSAxNy40IDEuMSAyLjEgMS40IDQuOCAyIDcgMS4zIDQuOSAyLjIgOS45IDMuMSAxNC45IDMuOSAyMC4xIDUuMyA0MC40IDUuMSA2MC45LS4xIDEyLjEtMS45IDI0LjItMy43IDM2LjEtLjQgMy4yLTEuMyA2LjMtMS44IDkuNC0uMiAxLjMtLjkgMi42LS43IDMuOXMxLjQtMi4zIDEuNS0yLjdjMS0zLjcgMS44LTcuMyAyLjYtMTEgMi05LjMgMy41LTE5LjEgMy42LTI4LjYgLjItMTMuNiAxLjEtMjcuMy0uMS00MS0xLjItMTQuNS00LjEtMjguOC03LjEtNDMuMS0yLjYtMTIuOC02LjktMjUuMi0xMS40LTM3LjQtMTAuOS0yOS4zLTI1LjEtNTctNDMuOC04Mi4yLTUuNi03LjUtMTEuNi0xNC44LTE4LTIxLjctMy0zLjQtNi03LjEtOS42LTkuOS00LjctMy44LTguOC04LjMtMTMuNS0xMi0xLS43LTQuNS0yLjctMy00ek03NjUuMyAzODcuMWMtMS40IDEtMi4xLS41LTIuNy0xLjYtMS41LTMtMy4zLTUuNy00LjktOC42LTYuOS0xMi43LTE1LjgtMjQuMS0yNC4xLTM1LjktNy40LTEwLjUtMTUuOS0yMC4xLTIzLjktMzAuMi0xNC40LTE4LjMtMzAuMy0zNS43LTQ2LjgtNTIuMS0yMC4xLTIwLjEtNDEuMy0zOC44LTYzLjYtNTYuNS0yLjgtMi4yLTUuNi00LjQtOC41LTYuNS0xLjItLjktMi43LTEuMS0zLjktMi4xLTIuNC0yLTQuNi00LjQtNy4xLTYuNC0zLjctMy03LjgtNS42LTExLjUtOC43LTEuOC0xLjUtMy0zLjYtNC43LTUtMTMuNS0xMS4xLTI3LjYtMjEuNi00MS44LTMxLjgtMTUuMy0xMS4xLTMxLjItMjEuMy00Ni45LTMxLjgtNC4yLTIuOC04LjctNS40LTEzLjEtOC0xLjQtLjktMy44LTEuNS00LjctMy4xLS4zLTIuNSA1LjQtLjkgNi43LS42IDcuNSAxLjcgMTQuOCA0LjggMjIuMSA3LjIgMTUuNyA1IDMwLjkgMTEuMyA0Ni4xIDE3LjYgMTMuNSA1LjcgMjcuMSAxMS4xIDQwLjQgMTcuNCAzMS4zIDE0LjggNjIuMiAzMC4xIDkxLjIgNDkgNy42IDUgMTUuMiA5LjcgMjIuNCAxNS4yIDIuMiAxLjcgNSAzIDYuOSA1LjEgMi44IDMgNC44IDcuNiA2LjggMTEuMiAzLjQgNi4zIDcuMiAxMi40IDEwLjUgMTguNyAxMi40IDIzLjQgMjMuOCA0Ny4xIDMzLjIgNzEuOSA2LjkgMTguNSAxMy42IDM3LjUgMTguMyA1Ni43IDEuMSA0LjcgMi4zIDkuMyAzLjMgMTQgLjMgMS40IDEuMyAzLjYgLjMgNC45ek0zNjUuNSAzMTAuMWMuNiAwIDEgMSAxLjIgMS40IC43IDEuNiAxLjIgMy4zIDEuOSA0LjkgMi45IDcuMyA1LjUgMTQuNyA5IDIxLjcgOS42IDE5LjIgMTkgMzguMSAzMS4yIDU1LjggMTEuNCAxNi42IDIzLjcgMzIuNiAzNy4zIDQ3LjQgOS4yIDEwLjEgMTkuNiAxOSAyOS45IDI3LjkgOC4yIDcuMSAxNy4zIDEzLjQgMjYuNCAxOS4zIDMgMiA2LjEgNCA5LjEgNS45IDEuNCAuOCAzLjMgMS40IDQuMyAyLjcgLjIgLjktMS40IDAtMS42LS4xLTIuMS0xLTQuMS0xLjktNS45LTMuMi00LjYtMy4xLTkuNi01LjgtMTQuMi05LTEzLjktOS42LTI3LTIwLjQtMzguOS0zMi4zLTMwLjMtMzAuNS01NS02NS03NC4yLTEwMy41LTQuNy05LjQtOS0xOS0xMi4zLTI4LjktLjgtMi41LTEuOC00LjgtMi42LTcuMi0uMi0uOC0uOC0yLS42LTIuOHpNNjYuNyAzNTYuNWMxLjUtLjcgNS44IDIuOCA3LjEgMy43IDUuNCAzLjUgMTIuMSA3LjEgMTguNiA3LjcgOC4yIC44IDE1LjYtLjkgMjMtNC42IDIuNS0xLjIgNS4yLTIuOCA3LjQtNC41IDEuMS0uOCAyLjQtMi4zIDMuOC0yLjMgMi40IC45LTEuNCA0LjgtMi4yIDYtMy41IDYuMS02LjkgMTEuNy04LjIgMTguOC0xLjYgOS4xIDEuNiAxOCA2LjIgMjUuNyAxLjcgMi45IDUuMSA2IDYuMSA5LjMtLjEgMS4zLTEuNyAuOC0yLjUgLjMtMi4xLTEuMy00LjItMi44LTYuMy00LjEtNS43LTMuNi0xMS43LTYuMi0xOC4zLTcuMy0xMC44LTEuNy0yMS41IDMuMi0zMC4yIDkuMi0zLjEgMi02LjQgNS42LTkuNyA3LTEuMSAwIC41LTEuNiAuNy0xLjkgMi4xLTIuMiAzLjctNC43IDUuNy03LjEgNC40LTUuNCA4LjUtMTIuNCA5LjgtMTkuNCAxLjgtOS4xLS4yLTE3LjQtNC41LTI1LjUtMS40LTIuNy0zLjEtNS4zLTUtNy43LS42LS43LTItMi4zLTEuNS0zLjN6TTU3MC41IDQ0OS43Yy0uNyAxLjQtNC4xLS42LTUuMS0xLjEtMy40LTEuNS02LjYtMy40LTkuOS01LjEtMS44LS45LTMuOC0xLjYtNC43LTMuNi0zLTYuNC00LjgtMTMuNy03LjQtMjAuMy00LjItMTAuOS05LjMtMjEuNS0xNC41LTMyLTMtNi02LjItMTIuMy05LjgtMTcuOS0yLjQtMy45LTYtOC4yLTcuNC0xMi41IC4xLTEuOCAyLjMgLjEgMi44IC42IDIuMSAyLjQgNC4yIDQuNyA2LjIgNy4zIDQuOSA2LjMgOS43IDEyLjcgMTQuNSAxOS4yIDEwLjQgMTQuMyAxOS4zIDI5LjcgMjcuMiA0NS42IDIuMiA0LjQgNC4yIDguOCA2IDEzLjQgLjggMiAyIDQuMyAyLjEgNi40ek0xMDUyLjIgMzc1LjNjLjIgLjctMi4zIC41LTIuOSAuOS0xLjcgMS0uOSAyLjEtMS40IDMuNS0xLjIgMS4zLTQuMiAuOC01LjggMS4ycy0yIDEtMy4xIDEuMi0yLjMgMC0zLjMgLjRjLTIuNyAxLjEtNS4yIDIuMy04LjMgMS4yLS40LS41IC44LTEuMSAxLTEuNiAuMS0zLjktNS42LTIuNy03LjUtMy42LTEuMS0uNS0yLTIuMi0yLjctMy4yLTIuMS0yLjktNS01LjgtNC4yLTkuOCAuNi0yLjggNy00LjEgOS4xLTMuMyAzLjMgMS4yIDcgMS44IDEwLjEgMy40IDEuNSAuOCAyLjEgMi4zIDMuOSAyLjlzMi42IDEgMy45IDEuMSAxLjktLjQgMi45LS4xIDEuNyAxLjYgMi43IDIuMyAxLjMgMCAyIC4yIDIuOSAyLjUgMy42IDMuM3pNNDMwLjcgNDQ1LjVjMi0uMiAzLjcgMi45IDQuOCA0LjIgMy43IDQuMyA3LjUgOC42IDExLjUgMTIuNiAxNy41IDE3LjMgMzMuMyAzNi4yIDQ5LjkgNTQuNCA0LjYgNSA5LjIgMTAuMiAxNC4xIDE1LjEgMSAuOSAzLjMgNC41IDQuOCA0LjJzMi0xLjUgMi44LTIuMWMyLjktMi4zIDUuNy01IDguMy03LjUgOC44LTguOCAxNy40LTE3LjcgMjUuOC0yNi44IDIuNS0yLjcgNC43LTUuOCA3LjMtOC40IDEuNC0xLjMgMy4zLTIuNyAzLjQtNC44IC4xLTMuNC0xLjctNy41LTIuNS0xMC45LS4zLTEuNS0xLTMuMS0uNS00LjYgMS4yLTEuMiA1LjIgMi4zIDYuNCAzLjEgMi4xIDEuNSA0LjIgMi44IDYuNCA0LjEgMS41IC44IDMuMiAxLjIgNCAyLjggMS44IDMuMy0uMSA3LjcgMi4zIDEwLjggLjggLjMgMS4zLS43IDEuOS0xIDIuNC0uNCAuOSA0LjMgLjYgNS40LTEuNCA1LTQuNyA4LjktNy43IDEzLS41IDEuNCAyLjEtLjIgMi40LS40IDIuMS0xLjUgNS44LTUuMyA4LjUtNS4yIDEuMSAuNiAxLjIgMi4yIDEuNSAzLjQgLjYgMi41IDEuNSA1IDIuMiA3LjYgLjggMy4zIDEuMyA2LjcgMS45IDEwLjEgLjQgMi4xIDEgNC4yIC4zIDYuNC0xLjcgNS40LTQuMyAxMS03LjMgMTUuOS0xLjkgMi45LTQuOCA2LjUtNC43IDEwLjIgLjEgNi4zIDkuMSAxMC42IDE0IDEzIDEuNCAuNyAzLjMgMSA0LjUgMi4yIDIgMS45IDEuMiA2LjQgMS41IDguOSAuOCA2LjUgMS42IDEyLjggMi42IDE5LjIgLjQgMi4yIDEuNyA2LjEgMSA4LjNzLTQuMSAxLjEtNS43IC45Yy01LjgtLjYtMTEuOC0xLTE3LjYtMS4xcy0xMC41IDAtMTUuOCAwYy0yIDAtNS4yIC42LTYuOS0uNnMtMS41LTIuMi0xLjktMy4zYy0xLTIuNS0yLTUuMS0yLjktNy42LTQuNS0xMS42LTUuNy0yNC05LjEtMzUuOC0uNy0xLjQtLjcgMS43LS43IDIuMSAuMiAyLjQgLjcgNC44IDEuMSA3LjIgLjcgNC4zIDEuNyA4LjcgMi42IDEzLjEgLjQgMS43IDEuNCA0IDEuMiA1LjhzLTQuNCAyLjItNS45IDIuNmMtNC4yIDEuMi04LjUgMi44LTEyLjUgNC44LTEuOCAuOS00LjQgMy02LjUgMi45cy0zLTItNC4yLTNjLTMuMy0yLjgtNi02LTktOS0xMy0xMy40LTIyLjMtMjkuMi0zMi44LTQ0LjUtMi44LTQuMy01LTktNy42LTEzLjQtLjgtMS41LTIuNS0zLjYtMi4yLTUuNCAuOS0xLjEgMy4zIC45IDQuMyAxLjUgNCAyLjIgNy45IDQuNiAxMiA2LjcgNy4zIDMuOCAxNS40IDYuNSAyMy4yIDkuMSA0LjIgMS4zIDkuMiAzLjIgMTMuNyAzIDEuMi0uNS0xLjUtMS44LTEuOS0yLTIuNi0xLjQtNS0zLTcuNy00LjQtNi43LTMuNS0xMy4xLTcuNi0xOS4zLTEyLjEtMjEuMy0xNS4zLTQwLjQtMzMuOC01MS44LTU3LjctMi43LTUuNi01LjYtMTEuMy03LjYtMTcuMi0uNS0xLjUtMi4zLTQuOC0uNS01Ljh6TTU1My44IDQ0NS41YzIuMS0uMyA2LjIgMi45IDguMSAzLjlzNC40IDIuMiA2LjcgM2MxIC40IDIuMyAuNiAzLjEgMS40czEuMiAzLjEgMS41IDQuNWMxIDMuOSAxLjkgNy43IDIuNiAxMS43IC4yIDEuNCAuOCAzLjUgLjIgNC44LTEuNyAxLjQtNi40LTIuNC04LTMuMy0yLjctMS40LTcuNy0zLjgtOS4zLTYuNC0xLjktMy4yLTIuMS03LjYtMy4zLTExLS41LTEuNy0zLjEtNy4yLTEuNi04LjZ6TTM1MC40IDUzMC4xYzEuMS0uNCAuOCAxLjQgLjcgMi0uNCAyLjctMSA1LjQtMS42IDguMS0xLjUgNi41LTIuMyAxMy4xLTIuOSAxOS42LTEuMSAxMC45LTEuNCAyMi4yIC4xIDMzIC40IDMuNyAuOCA3LjUgMS43IDExLjEgLjYgMi42IDEuNyA1LjYgMS42IDguMi0uNSAxLjItMS40LTEuMS0xLjYtMS41LS44LTIuMS0xLjItNC4zLTEuNy02LjUtMS40LTUuNi0xLjgtMTEuNi0yLjItMTcuMy0xLjItMTQuMy0uMS0yOC40IDIuNC00Mi40IC42LTMuNCAxLjMtNi43IDItMTAgLjMtMS40IC41LTMuMiAxLjUtNC4zek0xMDQ0LjQgNTk4LjhjLjUtLjEgLjUgLjkgLjUgMS4zIC4yIDEuNyAwIDMuNCAuMiA1LjEgLjQgMy42IC4yIDcuMiAuNSAxMC44IC4yIDIuOSAxIDYuMSAuMSA4LjktLjggMS4xLTEuMS0uOC0xLjEtMS40LS4yLTIuNCAwLTQuOC0uMy03LjItLjMtNC4xLS4zLTguMi0uMy0xMi4zIDAtMS41LS40LTMuOCAuNC01LjJ6TTg1NC42IDcyMy44Yy00LjEtNC4xLTguNy04LTEzLjItMTEuNS0yLTEuNS01LjUtNC4xLTYuMi02LjZzLjItNC40IC42LTYuNWMuNy0zLjggMS41LTcuNiAyLjEtMTEuNCAxLTYuNSAxLjktMTMgMi45LTE5LjUgLjQtMi45IC4yLTYuMyAxLjUtOXMzLjUtMy43IDUuMS01LjVjNS44LTYuOCAxMi40LTEzLjEgMTguNi0xOS42czEzLjEtMTYuNCAyMy0xNi42YzUuOS0uMSAxMS4yIDQgMTUuNSA3LjYgMy42IDIuOSA3LjIgNS44IDEwLjUgOSA0LjMgNC4zIDkuNiA4LjkgMTMuMSAxMy45IDYuNCA5LjEgMTEuMyAyMC4yIDE1LjEgMzAuNyAxLjYgNC4zIDMuMSA4LjcgMy45IDEzLjMgLjMgMS40IC45IDIuOCAuNyA0LjItLjQgNC0zLjQgOC41LTUuMiAxMi01LjMgMTAuNy0xMi4xIDIwLjYtMTkuMSAzMC40LTMuMyA0LjctNyA5LjUtMTAuOCAxMy44LTIuNCAyLjctNS4yIDQuOS03LjQgNy42cy0zLjggMy43LTUuNyA1LjZjLS44IC43LTEuNyAyLTIuOSAxLjlzLTIuNi0yLjEtMy40LTMuMWMtMi40LTMtNS4xLTUuOC03LjYtOC45LTkuMi0xMS41LTIwLjctMjEuNC0zMS4xLTMxLjh6TTc4NSA2NjkuOWMtLjQgMS45LTUuOC0yLTYuOC0yLjUtNi45LTMuOC0xMy43LTcuOS0yMC44LTExLjUtOS4yLTQuNi0xOC41LTkuMy0yOC0xMy4zLTIuOC0xLjEtNS42LTIuNC04LjYtMy40LTEuNC0uNS0zLjYtMS00LjYtMi4xcy0uNy0yLjUtLjgtMy43Yy0uNC0zLjQtLjktNi43LTEuMS0xMC4xLS4yLTEuMyAuNi0yLjggMi4yLTIuMiAyLjQgMSA0LjYgMy4xIDYuOSA0LjMgNS4xIDIuNiAxMC4zIDQuNiAxNS42IDYuOSAyLjUgMS4xIDUuNCAyIDcuOCAzLjQgNSAzIDkuMSA2LjkgMTMuNCAxMC43czEwIDguNSAxNC42IDEzLjJjMi40IDIuMyA1IDQuNCA3LjQgNi44IDEgMSAyLjUgMi4xIDIuOCAzLjV6TTgzMS4yIDY3NS42YzMuMy0uNyAyLjcgMS45IDMuMSA0IC42IDMuOCAuOCAxMC40LTMuMyAxMi43LTEuOCAuMi0xLjEtMi43LTEtMy43IC4yLTMuNS0uOS02LjYgLjEtMTAgLjMtMSAuMy0yLjMgMS4xLTN6TTczNyA5MTcuMmMtMS4yLS43IDEuNC0xLjkgMS45LTIuMSAyLjgtMS40IDUuNS0zIDguMy00LjUgNy4zLTQgMTUtNy42IDIyLjQtMTEuMyAyMi4zLTExLjIgNDUuMS0yMi4yIDY4LjMtMzEuNSAxNC42LTUuOSAyOS4xLTEyLjUgNDMuNy0xOC42IDI5LjUtMTIgNTkuNS0yMy4yIDg5LjYtMzMuNCAxNy4yLTUuNyAzNC41LTExLjQgNTEuOC0xNi40IDYuMS0xLjcgMTIuMi0zLjQgMTguMi01IDMuMy0uOSA2LjgtMS4zIDkuOS0yLjcgLjctLjctNC40IC4zLTQuOSAuNC0zLjMgLjUtNi41IDEuNC05LjggMi4yLTkuNyAyLjUtMTkuMyA1LjEtMjkgNy43cy0xOS40IDIuOS0yOS4xIDQuN2MtMTkuMSAzLjUtMzguMiA3LTU3LjQgMTAuMS0xNiAyLjYtMzIuMiA0LjMtNDguMSA3LjQtNDIuMiA4LjItODMuNSAxOC43LTEyMy44IDMzLjctMTkuMSA3LjItMzguMSAxNS40LTU2LjEgMjUtNi41IDMuNC0xMi45IDctMTkuMyAxMC42LTIuOSAxLjYtNS45IDQuNS05LjEgNS40LTEgMCAuMi0xLjEgLjUtMS4zIDEuNS0xLjEgMi45LTIuMiA0LjMtMy4zIDMuNy0zIDcuNC02IDExLjItOC45IDExLjMtOC43IDIzLjItMTYuNCAzNC44LTI0LjZzMjUuOS0xNS40IDM5LTIyLjRjMjQuNS0xMy4yIDUwLjgtMjUuNCA3Ny41LTMzLjUgMzAuOC05LjQgNjEuNS0xOC43IDkzLjEtMjQuNyA0MS4xLTcuOCA4Mi42LTEyLjYgMTIzLjktMTkuNCAyNi43LTQuNCA1My41LTguNCA4MC4zLTExLjkgMTcuMy0yLjIgMzQuNC01LjQgNTEuNi03LjcgOS44LTEuNCAxOS42LTEuOSAyOS41LTIuOCAxMi4yLTEuMSAyNC42LS44IDM2LjgtLjQgMTkuNSAuNiAzOC43IDIuMiA1Ny40IDcuOCA3LjQgMi4yIDE0LjMgNS4yIDIwLjggOS4zIDIuMyAxLjUgNi4xIDMuNiA3IDYuNXMtMS45IDcuNy0zLjUgMTAuMWMtNS4xIDcuOC0xMSAxNC4yLTE3LjIgMjEuMS04LjQgOS40LTE4LjcgMTcuNS0yOC45IDI1LjEtMjEuOCAxNi4yLTQ1LjcgMjkuMS03MC4zIDQwLjctNDkuNSAyMy41LTEwMyAzNi44LTE1Ni45IDQ1LjYtMjMuMyAzLjgtNDYuNyA1LjctNzAuMSA3LjktOC44IC44LTE3LjggMS42LTI2LjYgMS45LTM0LjcgMS4xLTY5LjQgLjQtMTA0IDAtMjAuNi0uMi00MS4zLS4xLTYxLjggLjUtNCAuMS04LS4yLTExLjkgLjEtOS4yIC42LTE4LjYgLjYtMjcuNyAxLjUtNS4yIC41LTExLjIgMS44LTE2LjMgMS4xek04OTkgODIyLjNjMS4yIC41LTIuMSAxLjQtMi40IDEuNS0zLjIgLjktNi40IDEuNy05LjUgMi41LTggMi4yLTE2IDQuNS0yNCA2LjgtMjMuOCA3LjEtNDcuMSAxNS41LTcwLjQgMjQuMS0yNy4zIDEwLjEtNTMuOSAyMi4yLTc5LjMgMzYuMi0xNC4yIDcuOC0yOC4zIDE1LjgtNDEuMyAyNS40LTQuNCAzLjItOC44IDYuMi0xMyA5LjUtMi41IDEuOS00LjcgNC42LTcuNCA2LjFzLTYuOSAyLjItMTAuMSAzLjRjLTIuNSAuOS01LjEgMi4yLTcuNyAyLjhzLTguOC0uNi0xMS41LTEuOWMtMS4xLTEuMSAxLjUtMi44IDIuMi0zLjYgMy4zLTMuMiA2LjUtNi41IDkuOC05LjcgMTMuOC0xMy44IDI5LjYtMjQuMSA0Ni41LTMzLjcgMjAuNC0xMS42IDQyLjItMjAuNiA2My45LTI5LjEgMzEtMTIuMSA2Mi42LTIxLjQgOTUtMjguOCAxNC43LTMuNCAyOS40LTYuNyA0NC40LTguOSA0LjctLjcgMTAtMi44IDE0LjgtMi42ek0yNTUuNSA4MjZjMSAuMi0uMSAxLjQgMCAyLjFzMS4xIDEgMS41IDEuNmMuMSAxLjUtMi4zIDMuMi0zLjUgMy43cy0xLjQtMi0yLjMtMi43LTIuNC0uNS0zLjQtMS40Yy0uMi0uOCAxLjQtMS4xIDEuOS0xLjMgMi0uNyAzLjgtMS42IDUuOC0yek0xODYuNiA4MzAuN2MxLjEgMC0xLjQgNC44LTEuNyA1LjVzLTEuNiAyLjUtMiAzLjkgLjIgMy45LTEuOCA1LjJjLTEuMSAuMS0yLjQtNC4yLTIuMi01LjJzMS41LTEuNCAyLTIuMmMxLjktMi4zIDMtNS41IDUuNy03LjJ6Ii8+PHBhdGggZmlsbD0iI2M0M2U4MCIgZGF0YS10b25lPSJsaW5lIiBkPSJNNDA4LjUgNi40YzEgLjItLjQgMS4yLS43IDEuNC0xLjQgLjktMi45IDEuNi00LjMgMi40LTMuNyAyLjEtNyA0LjQtMTAuNCA2LjktOS4yIDYuNS0xNy4yIDE2LjQtMTkuNyAyNy41LS43IDIuOC0uNCA1LjgtLjQgOC42IDAgMS4yIDAgMi43IDEuMSAzLjUgMi40IDEuNiA2LjYgMS43IDkuNSAyLjUgNy4xIDIgMTQuNSA0LjIgMjEuNCA3LjEgMTAuMSA0LjIgMTkuOSA5LjQgMzAgMTMuNCAxMi40IDQuOSAyNS40IDguOCAzOC41IDExLjEgMjEuOSAzLjkgNDQuOCAyLjggNjcgNC4zIDIwLjEgMS4zIDQwLjEgNC45IDU5LjkgOS4xIDQ0LjQgOS4zIDg3LjMgMjUuNiAxMjkuNSA0Mi4yIDExLjIgNC41IDIyLjIgOS45IDMzLjMgMTQuNiAzLjkgMS43IDggNC43IDEyLjIgNS42IDEuMS0uMiAuNi0xLjMgLjMtMi0uOS0xLjgtMS44LTMuNy0yLjktNS40LTQuNi03LjItOC44LTE0LjYtMTMuNy0yMS42LTE1LjQtMjEuNy0zMy4zLTQwLjMtNTQuMS01Ni44LTMuMi0yLjYtNy00LjgtMTAuNi02LjctMi41LTEuMi01LjYtMi4zLTcuNy00LjEtLjYtLjkgMS4yLS4zIDEuNS0uMiAxLjUgLjUgMyAxLjEgNC40IDEuNiAzLjkgMS40IDcuOSAyLjUgMTEuOCA0IDExLjQgNC41IDIyLjkgOS4xIDMzLjggMTUgOS41IDUuMSAxOS4zIDkuOSAyOC43IDE1LjUgMjIuNCAxMy41IDQ0LjEgMjguNCA2Ni4yIDQyLjUgNy41IDQuOSAxNS42IDkgMjMuMyAxMy41IDM2LjYgMjEuOCA3NS44IDM5LjQgMTE2LjQgNTIuMyAyNC45IDcuOSA1MC44IDE0LjkgNzYuOCAxNy43IDE3LjggMS45IDM2IDMgNTMuOCAxIDUuMi0uNiAxMC42LTEuMSAxNS42LTIuNCAyLjUtLjYgNi42LTIuNSA5LjEtMi4xIC45IC43LTMuNyAyLjctNC4zIDMtNS40IDIuNS0xMS4yIDQuNS0xNyA2LjItMjEuMiA2LjQtNDQuMiA4LjMtNjYuMiA2LjUtMzcuNi0zLjItNzQuNC0xMi41LTEwOS4yLTI3LjMtMTEuMi00LjctMjIuMi05LjUtMzMuMS0xNC45LTcuNS0zLjgtMTQuOS04LjMtMjIuNy0xMS40LTEuMS0uMSAuNCAxLjYgLjYgMS45IDEuNiAxLjkgMy41IDMuNSA1IDUuNCA0LjMgNS4zIDEwLjUgOC42IDE1LjQgMTMuMSA3LjkgNy4zIDE3IDEzLjggMjUuOCAyMCA3LjUgNS4zIDE0LjYgMTEgMjIuMSAxNi4xczE0LjEgMTAuNSAyMS4xIDE1LjdjMTIuOCA5LjYgMjYuMyAxOC4yIDM5LjEgMjcuNiAxNi4xIDExLjggMzIuNCAyMy4xIDQ4LjcgMzQuNiAxMS44IDguMyAyMy40IDE2LjggMzUuNiAyNC40IDEwIDYuMyAxOS41IDEzLjUgMjkuMSAyMC40IDI0LjggMTggNDguNSAzNy45IDY0LjYgNjQuNCA3LjQgMTIuMSAxMyAyNi4zIDE1LjIgNDAuMyAuNyA0LjkgMS41IDkuNyAyIDE0LjUgLjIgMS43LS40IDQuNSAxIDUuOHMyLjkgMS4yIDQuMyAxLjdjMy45IDEuNCA4IDIuNSAxMi4xIDMuNyAxMy4yIDMuNyAyNi41IDcuMiAzOS45IDEwLjIgMzMuMiA3LjQgNjcuOSAxMS44IDEwMS45IDEyLjIgNS4zIC4xIDEwLjYtLjQgMTYtLjUgMTkuMi0uMiAzOC4zLTEuMyA1Ny4zLTQuMiAxNS43LTIuNCAzMS42LTYuMSA0Ni45LTEwIDQuOC0xLjMgOS40LTIuNiAxNC4xLTMuOSAyLjItLjYgNC43LTEuOCA2LjktMS43IDEuNSAuNi0yIDEuOC0yLjUgMS45LTQgMS40LTcuOSAzLjEtMTEuOSA0LjYtMTAgNC0yMC4xIDcuOC0zMCAxMi4xLTI0LjcgMTAuNS01MC4yIDE5LjctNzMuNyAzMi43LTQuOCAyLjYtOS42IDUtMTQuNSA3LjMtMy40IDEuNS03LjYgMy4xLTkuOSA2LjItLjMgMS4zIDMuMyAxLjQgNC4xIDEuNSA0IC4yIDguNSAuMyAxMi42LS4xIDEyLjgtMS40IDI1LjUtMi42IDM4LjItNC41IDMuOS0uNiA3LjgtMS43IDExLjctMi41IDEuNi0uNCAzLjUtMS4zIDUuMS0xLjFzLTQgMi4yLTQuNiAyLjVjLTMuNiAxLjQtNy4xIDMtMTAuOCA0LjItMTAuNiAzLjQtMjAuOSA3LTMyIDkuMnMtMjMgNC41LTM0LjggNS43Yy0zLjYgLjQtNy4zIDEtMTAuOSAxLjFzLTcuOC0uMy0xMS4xIC44Yy0yLjUgLjktNC45IDIuOC03LjMgNC4xLTkuMSA0LjctMTcuNiAxMC41LTI2LjYgMTUuNC02LjYgMy42LTEyLjkgNy41LTE5LjQgMTEuMy0xLjggMS4xLTYuMiAyLjgtNi42IDUgLjMgMS42IDIuNCAyLjYgMy43IDMuNCAzLjQgMi4xIDYuOSA0LjIgMTAuNCA2LjEgMTUgOC4xIDMxLjcgMTUuNSA0OC43IDE4IDggMS4yIDE2LjEgMi42IDI0LjIgMi45IDUuNSAuMiAxMC44LS42IDE2LjItLjkgNi0uNCAxMy4xLTEgMTguOC0zIDIuNS0uOSA0LjYtMy4xIDYuNy00LjYgNi40LTQuMyAxMi4zLTkgMTguMy0xNCAxOC44LTE1LjcgMzYuNS0zMy40IDUxLjItNTMgNi41LTguNiAxMi41LTE3LjcgMTcuOS0yNy4xIDIuNC00IDQuMi05LjkgNy41LTEzLjIgMS0uNi0uOCAzLTEgMy40LTEuMyAyLjMtMi4zIDQuOC0zLjMgNy4yLTMgNy40LTcuMiAxNC44LTExLjUgMjEuNS0xMi44IDIwLjEtMjUuOCA0MC4xLTQyLjggNTctMTAuMSAxMC4yLTIwLjEgMjAuMy0zMS4xIDI5LjYtMjIuMiAxOC45LTQ3LjkgMzQuOS03My41IDQ4LjgtMTUuNyA4LjYtMzIuMiAxNi4xLTQ4LjcgMjMuMy00LjUgMi05LjEgMy45LTEzLjcgNS44LTIuNiAxLTUuNiAxLjctNy45IDMuMS0uOSAxIDEuMSAxLjEgMS42IDEuMSAyLjIgLjEgNC4zIDAgNi40IC4zIDUuOCAuOCAxMS43IDEuMiAxNy40IDIuMSAxNSAyLjQgMzAuNCA1LjggNDMuNyAxMy40IDMuOSAyLjIgMTAuOCA2LjEgMTEuMiAxMS4xIC4yIDIuMy0uOCA1LjEtMS43IDcuMS0zLjQgNy43LTkuNSAxNC43LTE1LjEgMjAuOC05LjcgMTAuNS0yMC4yIDE5LjktMzEuNSAyOC42LTMxLjcgMjQuNC02Ny44IDQxLjUtMTA0LjcgNTYuNS0xMC43IDQuNC0yMi4yIDYuOC0zMi43IDExLjYtMy42IDEuNi02LjggNC4zLTEwLjMgNi4yLTcuNCA0LjEtMTUgOC0yMi42IDExLjktNS42IDIuOS0xMS40IDUuNS0xNy4xIDguMy0yLjEgMS4xLTQgMi43LTYuMiAzLjVzLTMuNyAuNS01LjUgMS4xYy0zLjkgMS4yLTcuNiAzLTExLjQgNC40LTEuOSAuNy00LjIgLjgtNS43IDIuMi0uNCAuOCAuOSAuNiAxLjMgLjYgMi0uMyAzLjktLjYgNS44LS45IDIuOC0uNCA1LjUtMS40IDguMy0xLjggMS44LS4zIDMuNiAuMSA1LjMtLjEgMTQuMS0xLjYgMjguMi00IDQxLjktNy42IDUuMy0xLjMgMTAuOC0yLjEgMTYtMy41IDIxLjMtNS44IDQyLjctMTEuNSA2My4zLTE5LjIgMTAuNS0zLjkgMjEuMS03LjggMzEuNS0xMiA0LjMtMS43IDguOC00LjkgMTMuNC01LjYgMS4xIC4yLTEuMiAxLjktMS41IDIuMi0yLjQgMi4xLTUuMSA0LTcuNSA2LTYuNiA1LjYtMTMuMyAxMC43LTIwLjQgMTUuNi0yMC42IDE0LjQtNDIuNiAyOC02NS44IDM3LjgtMjAuMiA4LjUtNDAuNCAxNy02MS41IDIzLjItNTEuNiAxNC45LTEwNS4yIDIyLjUtMTU4LjggMjQuMi0xOS45IC42LTM5LjgtLjUtNTkuNi0xLjktMTEtLjktMjIuMS0xLTMzLTIuMi0xMy45LTEuNi0yNy43LTMuMy00MS41LTUtMjAuMi0yLjQtNDAtNi43LTYwLTkuOC00MS43LTYuNS04My4yLTE0LjctMTI1LTIxLjMtMzEuOS01LTYzLjUtMTEuNi05NS43LTEzLjctNi40LS41LTEzLS4xLTE5LjUtLjEtMjguNyAwLTU3IDMuMS04NS42IDUuOS0xOS4yIDEuOS0zOC4zIDQuNS01Ny41IDctMTYuNyAyLjItMzMuNSAzLjktNTAuMiA2LjgtOS44IDEuNi0xOS42IDMuMS0yOS40IDUuMS0yLjggLjYtNy41IC4zLTkuOSAyLS42IC45IDAgMS44IC41IDIuNyAxLjIgMi4yIDIuNiA0LjMgNCA2LjUgNC4xIDYuNyA4LjkgMTMuMSAxMy4yIDE5LjggMS40IDIuMSA0LjMgNC44IDQuNyA3LjMtLjMgLjYtMS4xLS40LTEuMy0uNi0xLTEtMS44LTIuMi0yLjgtMy4yLTIuNi0yLjgtNS41LTUuNi03LjgtOC42LTQuNC01LjUtOS0xMS4yLTEzLjktMTYuMi0xLjUtMS41LTMuNC00LjMtNS4zLTUuMXMtNi42IC4zLTkuMSAuN2MtMTMgMi0yNiA3LjctMzguNiAxMS43LTE0LjQgNC41LTI5LjEgOC40LTQzLjIgMTMuNy03LjYgMi44LTE1LjQgNS44LTIzLjIgNy42LTIuMiAuNS02IDIuNC04LjEgMS40LTEuNi0xLjgtLjctNS42LS4zLTcuNyAxLjEtNi45IDIuNy0xMy42IDQuMy0yMC40IDQuMy0xNy44IDEwLjQtMzUuNCAxNy41LTUyLjMgMy03LjQgNi41LTE0LjYgOS41LTIxLjkgMS0yLjQgMi42LTQuNyAzLjItNy4xLS4xLTEuOC0zLjcgLjUtNC41IC44LTQuMiAyLTguNCA0LjEtMTIuNSA2LjMtMTAuNiA1LjctMjEuNCAxMS0zMS44IDE2LjktMjQuNyAxNC00OS45IDI3LTc0LjYgNDAuOS03LjEgNC0xNC41IDcuNC0yMS41IDExLjYtMi43IDEuNi03LjEgNS4zLTEwLjMgNS40LS44LS41IDIuNC0yLjUgMi44LTIuOCAzLjYtMi43IDcuNS01IDExLjEtNy43IDkuNS03LjMgMTkuOS0xMy41IDI5LjctMjAuNSAxMy41LTkuNyAyNy44LTE4LjIgNDEuNi0yNy41IDkuNS02LjQgMTkuMy0xMi43IDI4LjktMTkuMSAzLjItMi4xIDYuMy00LjggOS43LTYuOCA3LjMtNC4zIDE0LjItOS4xIDIxLjEtMTQuMSA0LjYtMy4zIDkuMi02LjIgMTAuMi0xMi4zcy01LjEtMTQuMi04LjMtMTkuM2MtNS4xLTguMi05LjctMTYuNy0xNC44LTI0LjktMy4xLTUtNi45LTkuOC05LjgtMTUtOS43LTE3LjQtMjEtMzMuOS0zMS44LTUwLjctMTUuNy0yNC4zLTMxLTQ4LjktNDYuOC03My4yLTguNC0xMy0xNy4yLTI1LjgtMjUuNC0zOS4xLTIuMy0zLjctNC43LTcuMy03LTExLTEtMS43LTIuNi0zLjUtMy4xLTUuNCAuMS0xLjEgMS40IC44IDEuNiAxLjEgMS42IDEuOSAyLjkgNC4xIDQuNSA2IDQuMiA0LjkgNy45IDEwLjEgMTEuOSAxNS4xIDExLjYgMTUuMSAyNCAyOS45IDM0LjcgNDUuNiA0LjYgNi44IDEwIDEzLjYgMTUuMiAyMCAyLjMgMyA1LjQgNiA3LjQgOS4xIDUuOCA5LjEgMTIuNiAxNy4zIDE4LjkgMjYuMSAxMy41IDE5LjEgMjcuMiAzOC4yIDQxLjQgNTYuOCA3LjQgOS43IDE0LjUgMTkuNSAyMS44IDI5LjIgMi40IDMuMSA1LjEgOC45IDguOCAxMC40IDEuNi0uMSAyLjgtMyAzLjUtNC4xIDIuNy00LjQgNS04LjkgNy44LTEzLjIgOS4xLTE0IDE4LjYtMjcuOCAyOC44LTQxIDIuOS0zLjggNi03LjQgOS4xLTExLjEgMS4yLTEuNSAzLjMtMy40IDMuNC01LjQgLjMtMy4xLTQuNi03LjQtNi40LTkuOC00LjgtNi42LTkuOC0xOS01LjQtMjYuN3MxNS42LTguOCAyMy45LTkuOWMzLjgtLjQgNy40LS44IDExLjItLjggMi40IDAgNS0uMSA3LjQgLjEgMS41IDAgMyAuNiA0LjQtLjEgMS41LTEuNyAuNC00LjkgLjMtNy0uNC01LjUtLjYtMTEuNyAwLTE3LjEgMS40LTEyLjkgMy43LTI4LjUgMTQuNi0zNy4yIDEuOC0xLjQgNC0yLjggNi4zLTMuNXM0LS42IDUuNy0xLjYtMS42LTUuOS0yLjMtNy41Yy0zLjQtNi42LTUuMy0xNC4xLTcuMi0yMS4zLTctMjcuNS0xMC42LTU2LjgtNy04NS4xIDEuNC0xMS40IDIuNC0yMyA0LjctMzQuMiAxLTQuNCAyLjYtOC42IDMuMi0xMy4yIC4yLTEuNSAuOS0zLjIgLjUtNC43LS43LTIuOS0zLjYtNS4xLTUuNC03LjMtMy40LTQuMi03LTguOC05LjYtMTMuNy05LjktMTguOC0xMy40LTQwLjQtMTAuNC02MS40czEzLjEtMzkuMiAyMi4xLTU3LjNjMy41LTYuOSA2LjctMTMuOSAxMC4xLTIwLjggNC4yLTguNCA3LjYtMTcgMTAuOC0yNS45IDEuNy00LjkgMy44LTEwLjQgMy44LTE1LjcgMC0zLjktLjktNy44LTEtMTEuOC0uMy0xMC43IDAtMjEuNSAwLTMyLjIgMC02LjIgMi4yLTEzLjcgLjctMTkuNy0uOS00LjEtMy4xLTgtNC42LTExLjktMi43LTcuMi01LjEtMTQuNi03LjMtMjItNC41LTE1LjItNy41LTMxLjktNi44LTQ3LjkgLjMtNSAxLjMtMTAuMiAyLjEtMTUuMSAzLjItMTkuMSAxNS4zLTM1LjMgMzAuMS00Ny4yIDQuMi0zLjQgOC44LTYuMiAxMy40LTkuMSAxLjgtMS4yIDQuNy0xLjkgNi4xLTMuN3MxLjMtNC45IDEuOC03LjFjMS00LjIgMi43LTguMSA0LjctMTEuOSA2LjItMTEuNyAxNy41LTIwLjEgMjguNi0yNi44IDQuNC0yLjYgOS42LTUuOSAxNC43LTYuN3pNMzc4LjYgMjcuOWMtLjItLjctMS40IC42LTEuNiAuOS0xLjIgMS4yLTIuMyAyLjctMy41IDQtMy4xIDMuNi01LjcgOC4yLTcuNiAxMi42LTQuMSA5LjItNC4yIDE4LjktLjcgMjguNCAxIDIuNyA0IDQuOSA0LjUgNy43LS40IDEuMS0zLjMtMi44LTMuNy0zLjMtMi4yLTIuNy00LjEtNi4zLTUuNC05LjYtLjYtMS42LS42LTQuMi0xLjgtNS41LTEuMS0uNC0yIC44LTIuOSAxLjMtMi4zIDEuMi00LjMgMi42LTYuNSA0LTkuNiA1LjgtMTguNyAxNC40LTI1LjEgMjMuNi0xOC44IDI2LjgtMTUuMiA2MS02LjYgOTAuOCAxLjkgNi44IDQuMiAxMy43IDYuOCAyMC4yIC45IDIuMiAxLjMgNS40IDMgNy4yIDEgLjMgMS4zLTIuNyAxLjgtMy4zcy43IDIuNiAuNyAzLjFjMCAzLjctLjggNy40LTEgMTEtLjQgOS4yLTEgMTguNC0xIDI3LjUgMCAxNy42IDEuNyAzNS40IDQuMiA1Mi44IDEuMyA5LjYgNCAxOS4xIDYgMjguNSAzLjYgMTcuNSAxMC42IDM0LjUgMTcuNCA1MC45IDIwLjYgNDkuNiA1Mi42IDk1LjkgOTUuMiAxMjkgMTMuNSAxMC41IDI4LjMgMTkuNyA0NC4yIDI2LjMgMy42IDEuNSA3LjQgMi42IDExIDQgMS42IC41IDMuNSAxLjcgNS4yIDEuNSAuOS0uNi0xLjMtMS41LTEuNy0xLjctMi40LTEuMy00LjktMi42LTcuMi00LjEtNi40LTQuMS0xMy4zLTcuNS0xOS4xLTEyLjQtNC4yLTMuNC04LjUtNi41LTEyLjUtMTAtMTQuMi0xMi4xLTI2LjQtMjYuNC0zNy40LTQxLjQtMTMuMi0xNy45LTIzLjUtMzcuOC0zMi43LTU4LTIuNy02LjItNC4yLTEzLTcuMi0xOXMtNi43LTExLTkuOC0xNi41Yy0zLjgtNi44LTcuMi0xMy45LTEwLjYtMjAuOS0xMC40LTIxLjMtMTguMy00NC40LTIzLjMtNjcuNS0yLjMtMTAuNy01LTIxLjktNC45LTMyLjkgLjUtMS42IDEuMyAzLjQgMS4zIDMuOCAuMyAyLjggLjggNS43IDEuMyA4LjQgMS42IDguMyAzLjEgMTYuNyA1LjEgMjQuOSA2IDI0LjcgMTUuMiA0OC4zIDI2LjYgNzAuOSA4LjYgMTcgMTkuMSAzMy4xIDMwLjcgNDguMSA2LjMgOC4xIDEyLjQgMTYuNSAxOS4zIDI0LjIgOC41IDkuMiAxNi45IDE4LjYgMjUuNCAyNy44IDMuOCA0LjEgOC4zIDggMTEuNyAxMi40IDEuNyAyLjIgMy45IDQgNS44IDYuMiAxMC42IDEyLjMgMjIuMSAyNC4xIDMxLjggMzcuMSAyLjMgMy4xIDUgNi4xIDcuNyA4LjkgLjkgLjkgMS44IDIuMyAyLjggM3MyLjItLjQgMi42LTEuMy0xLTIuNC0xLjgtMy4xYy0yLjItMi4zLTQuMi00LjgtNi41LTctNS42LTUuNy0xMS0xMS41LTE2LjYtMTcuMi0zLjUtMy40LTguNS03LjYtMTAuOC0xMiAwLTEuMSAzLjEgMS40IDMuNCAxLjcgMy4xIDIuOCA2IDYgOSA5IDYgNiAxMiAxMiAxOCAxOCAyIDEuOSA1IDYuNCA3LjcgNy4yIDEuMyAuNCAyLjUtMS4xIDMuMy0yIDIuMy0yLjIgNC41LTQuNSA2LjgtNi43IDcuOS04IDE2LjItMTUuOSAyMy4zLTI0LjcgMi0yLjUgNi4zLTUuNCA3LTguNyAuMi0xLjEtLjQtMi4yLS42LTMuMy0uNy0yLjctMS4zLTUuMy0xLjktNy45LTIuMy0xMC41LTUuMi0yMC44LTguOC0zMS0xMi0zMy45LTI4LTY1LjktNDguMy05NS43LTcuOC0xMS40LTE2LTIyLjUtMjMuNy0zNC0xLjgtMi44LTMuOC01LjctNS45LTguMy0xLjItMS40LTMtMy4yLTMuNS01IC4zLS44IDEuNSAuNCAxLjcgLjcgMS41IDEuNCAyLjUgMyAzLjkgNC40IDMuNyAzLjYgNyA3LjUgMTAuNiAxMS4xIDExLjEgMTEuMSAyMC45IDIzLjIgMzEuNiAzNC41IDYuNCA2LjggMTEuNyAxNC44IDE3LjQgMjIuMyAxNy40IDIyLjggMzIuNCA0OC45IDQwLjUgNzYuNSAyLjUgOC43IDUgMTcuMyA1LjkgMjYuNCAuMyAzLjYgLjkgNy42IC4yIDExLjItLjYgMS4yLS44LTEuMy0uOC0xLjctLjEtMiAuMS00LjQtMS4zLTYuMXMtNC4zLTIuNi02LjItMy42Yy0yLjktMS43LTYuMS01LjMtOS4zLTYtMiAuNC0uNSAzLjctLjMgNC44IC43IDMuMiAzLjggMTAuMiAxLjggMTMuMS0yLjggNC4xLTcgNy44LTEwLjMgMTEuNS03LjMgOC0xNC43IDE1LjctMjIuNCAyMy4zLTIuOSAyLjktNiA1LjYtOC45IDguNC0xLjMgMS40LTMuMyAzLjgtNS4yIDQuNHMtNC41LTMuOC01LjUtNC45Yy01LjgtNS43LTExLjMtMTEuOC0xNi42LTE3LjktMTUuMS0xNy43LTMxLTM1LjEtNDcuNC01MS42LTMuNy0zLjctNy4zLTcuOC0xMC43LTExLjgtMS45LTIuMi00LTUuMi02LjUtNi42LTEuNC0uMyAuMSAyLjUgLjMgMy4xIDEuMSAzLjMgMi4zIDYuNiAzLjcgOS44IDMuNCA4LjIgNy4xIDE2LjYgMTEuNyAyNC4yIDEyLjcgMjEgMzIuOCAzNy4yIDUyLjcgNTAuOCA0LjYgMy4xIDkuNCA1LjcgMTQuMyA4LjMgMi41IDEuMyA1LjggMi43IDcuOCA0LjcgLjYgMS4yLTIuNSAuMy0zIC4yLTMuNS0uNi02LjktMS4zLTEwLjMtMi40LTguMS0yLjctMTYuOC01LjQtMjQuMy05LjUtMy4zLTEuOS02LjctMy44LTEwLjEtNS43LTEuNC0uOC0zLjQtMi40LTUtMi43LTIuMSAuNiAuNyA0LjMgMS4zIDUuMiAyLjggNS4yIDUuOCAxMC4yIDguNyAxNS4zIDguNiAxNS4zIDE5LjYgMzAuNiAzMS45IDQzLjEgMyAzLjEgNS43IDYuMiA4LjkgOS4xIDEuMiAuOSAyLjIgMi41IDMuNyAyLjkgMi44IC44IDcuNi0zLjIgMTAuMi00LjJzNi41LTIuNiA5LjktMy41YzEuNS0uNCA0LS40IDUuMS0xLjZzLS43LTYuMy0xLjEtNy45Yy0xLjEtNC44LTIuMS05LjctMi43LTE0LjUtLjMtMi4zLTEuMy00LjctLjYtNi45IC41LS43IDEuNSA0LjEgMS42IDQuOCAuNSAzLjQgMS4zIDYuNyAyLjEgMTAgMi40IDEwLjIgNC45IDIwLjggOS40IDMwLjMgMS43IDMuNiA3IDIuNCAxMC40IDIuNCA4LjUgMCAxNy4xIDAgMjUuNiAuNiAyLjggLjEgOC4yIDIgMTAuNyAuNSAxLjItLjggLjctMi43IC40LTMuOS0uNy0zLjItMS4xLTYuNS0xLjUtOS43LS42LTUuMy0xLjctMTAuNy0yLTE2LS4xLTIuMiAuNC02LTEuMy03LjdzLTMuNS0xLjctNS4xLTIuNGMtNC41LTIuMy0xMi02LTEzLjMtMTEuNC0uNy0yLjUgLjQtNC44IDEuNS02LjkgMi4yLTMuOSA0LjctNy41IDYuNi0xMS41IDEuNC0zLjEgMy41LTYuOCA0LTEwLjIgLjYtNC44LTEuNi0xMS4yLTIuNy0xNS45LS42LTIuOS0xLjMtNy44LTMuMS0xMC4zLTEuMS0uNy0yLjUgLjUtMy41IDEuMi0yLjEgMS40LTQuOSA0LjMtNy41IDQuNy0xLjEtLjEgMS45LTMgMi4yLTMuNSAxLjYtMi41IDMuMy00LjkgNC40LTcuNiAuOC0xLjkgMS42LTQuNCAxLjUtNi41IDAtLjktLjUtMS43LS4zLTIuNiAuMi0yLjEgMS43LTQuNCAyLjQtNi4zIDEtMi43IDEuNC01LjUgMi40LTguMiAxLjgtNS4zIDIuNS0xMS43IDIuOS0xNy4zIC42LTguNyAxLjItMTcuMyAuMy0yNi0uNi01LjUtMi4xLTExLjQtMi4xLTE2LjkgLjQtMS42IDEuNiAyLjIgMS43IDIuNiAuOCAzLjMgMS41IDYuNiAyIDkuOSAxLjEgNi4zIDIuMiAxMi41IDIuOSAxOC45IC4zIDIuOC0uNiA2LjQgLjQgOSAuNiAuNSAuOS0uOSAxLTEuMyAuNC0xLjcgLjYtMy42IC43LTUuMyAuMy03LjQgMC0xNC44LTEuMi0yMi0yLjQtMTQuOC03LTI5LjQtMTMuMy00My0xLjUtMy4xLTIuNi02LjMtNC4xLTkuNC0uNi0xLjItMS4xLTIuOC0yLjItMy42LTIuMi0uNi00LjggMy43LTYgNS4yLTMuNiA0LjQtNi43IDkuMi0xMC42IDEzLjQtMS4zIDEuNS0yLjYgNC4xLTQuOCA0LjQtLjgtLjMgLjEtMS42IC4zLTIuMSAuOS0xLjkgMS44LTMuNyAyLjgtNS41IDIuOC01LjEgNS44LTEwIDkuMi0xNC44IDEuNC0yLjIgNC41LTUgNS03LjZzLTIuNi02LjktMy44LTljLTQuNS04LjItOS40LTE2LjEtMTQuNC0yMy45LTE5LjgtMzEuMS00NC44LTU3LjktNjkuNS04NS03LjktOC41LTE1LjgtMTcuMy0yNC0yNS41LTMuMy0zLjItNi42LTYuNC05LjYtOS45LTEuMS0xLjQtMi44LTIuNS0zLjctNCAuMS0uNiAxLjIgLjIgMS40IC4zIDEuNSAxIDIuNiAyLjQgMy45IDMuNiAzIDMgNi4yIDUuOCA5LjIgOC44IDguOSA4LjggMTguMyAxNy4yIDI3LjEgMjYuMSAxNS42IDE1LjYgMzAuNCAzMyA0Ny4zIDQ3LjIgMTAuMSA4LjQgMjEgMTUuNCAzMi42IDIxLjQgNy42IDQgMTUuOSA3LjEgMjQuMSA5LjcgMi4zIC44IDYuNCAyLjkgOC45IDIuMyAuNy0uNy0uMi0xLjUtLjctMi0xLjQtMS40LTIuNi0yLjktMy45LTQuNC01LjUtNS45LTEwLjUtMTIuNC0xNi4yLTE4LjItNi41LTYuNS0xMi40LTEzLjYtMTguOC0yMC4yLTExLjEtMTEuNS0yMi43LTIyLjQtMzQtMzMuNS01LjMtNS4zLTEwLjktMTAuMS0xNi4zLTE1LjMtMS44LTEuOC01LjEtMy41LTYuMS02IC4xLTEuMiAyLjQgMS4xIDIuOCAxLjQgMi41IDEuOSA0LjcgNC4zIDcuMSA2LjMgNi43IDUuNiAxMy4yIDExLjQgMTkuNCAxNy40IDE2LjkgMTYuNCAzNC4xIDMyLjMgNTAuMyA0OS40IDYuMSA2LjQgMTEuOSAxMy4xIDE4IDE5LjUgMS43IDEuOCAzIDQuMSA0LjkgNS42czMuMS0uNSA0LjMtMS40YzMuMy0yLjUgNi44LTQuOCAxMC4yLTcuMSAxLS44IDMtMS44IDMtMy4zLS4yLTIuNi00LjctNi40LTYuMi04LjQtNS4xLTYuNi0xMC43LTEyLjktMTUuOS0xOS40LTEuNS0yLTQuOC00LjQtNS41LTYuNyAuMy0xIDIuNiAxLjUgMi45IDEuOCAyLjYgMi42IDUuMiA1LjQgNy41IDguMyAzLjcgNC43IDguMSA4LjkgMTEuOCAxMy43IDIuMSAyLjcgNC40IDcuMyA3LjIgOS4yIDEuOSAxLjQgNi4xLTIuNyA3LjctMy43IDQuNy0zLjEgOS42LTYgMTQuNS04LjggMi40LTEuMyA1LTMuMiA3LjctMy45IDEuMy0uMS0uNSAxLjMtLjkgMS41LTIuMSAxLjQtNC4yIDIuOC02LjIgNC4zLTUuMSAzLjctMTAgNy41LTE1LjEgMTEuMS0yLjEgMS41LTQuOSAzLjMtMi45IDYgMi44IDMuNyA2LjMgOS45IDEwLjQgMTIuMXMxMS4zIDIuOSAxNi42IDMuN2MxMi43IDEuOSAyNS41IDIuOSAzOC40IDIgNS4yLS40IDEwLjQtMS4yIDE1LjctMS41IDEuOS0uMiA0LjYgLjEgNi4xLTEuMyAuNS0xLjItLjQtMi4zLTEtMy4yLTEuNC0yLjMtMy4yLTQuMy00LjgtNi41LTYuNy05LjQtMTQtMTguNC0yMS40LTI3LjMtMjAuNS0yNC4yLTQyLjgtNDYuNy02Ni02OC4zLTcuNC03LTE0LjktMTQuMS0yMi43LTIwLjctMi43LTIuMy01LjMtNC44LTguMS03LTEuOC0xLjQtNC40LTMuMi01LjYtNS4xLS4xLTEgMS44IC42IDIgLjggMS45IDEuNSA0IDMgNS45IDQuNSA1IDQgOS45IDguMiAxNC45IDEyLjEgMTUuNSAxMiAzMC4yIDI1LjUgNDQgMzkuMyAyOS40IDI5LjQgNTYuNyA2MC43IDgxLjIgOTQuMyA2LjYgOSAxMyAxOC4yIDE4LjYgMjcuOSAxLjggMyAzLjcgNS45IDUuMyA5IDEuMyAyLjQgMi40IDUuNSA0LjIgNy42IDEuMSAuOCAuNS0xLjYgLjQtMi0uNS0yLjgtMS01LjUtMS42LTguMi0xLjQtNi42LTMtMTMuMy00LjktMTkuOC01LjYtMTkuNy0xMS44LTM5LjQtMTkuNy01OC4zLTEyLjEtMjguOC0yNS41LTU2LjktNDEuNC04My45LTUuNC05LjItMTEuNS0xNy45LTE3LjMtMjYuOS02LjYtMTAuMi0xNC0yMC42LTIxLjktMjkuOC0zLTMuNS01LjktNy4yLTktMTAuNS0xLjYtMS43LTQtMy44LTUtNS45IC4xLTEuMiAyLjUgMS4zIDIuNyAxLjYgMi42IDIuNSA0LjggNS4yIDcuMyA3LjcgNi40IDYuNyAxMiAxNC4xIDE4IDIxIDUgNS45IDkuMiAxMi40IDEzLjcgMTguNiA4LjEgMTEuMyAxNS43IDIzIDIyLjkgMzQuOSAzLjUgNS44IDYuNCAxMS45IDEwLjEgMTcuNiAzLjIgNSA1LjYgMTAuNCA4LjMgMTUuNyA1LjMgMTAuNCAxMC4zIDIwLjggMTUuMSAzMS40IDE5LjcgNDMuNCAzNyA4OC41IDQxLjMgMTM2LjQgMS4xIDEyLjQgMS44IDI1IC41IDM3LjMtLjUgNC41LTEuMSA4LjgtMS45IDEzLjItLjMgMi0xLjMgNC4zLTEuMSA2LjMgLjUgLjcgMS43LTIuNiAxLjktMy4xIDEuOC0zLjggMy04IDQuNS0xMS45IDQuMi0xMC41IDYuNS0yMS42IDguNi0zMi43IDUuNy0yOS40IDQuOS02MS0uNy05MC40LTEuNi04LjUtMy41LTE3LjEtNi0yNS40LS45LTMuMS0xLjktNi4xLTIuOS05LjItLjYtMS42LTEuNi0zLjYtMS41LTUuNCAuNC0xIDEuMiAxLjYgMS4zIDEuOSAxIDIuMyAxLjggNC43IDIuNiA3LjIgMi4yIDYuNCA0LjQgMTMgNS44IDE5LjcgMi4zIDEwLjcgNC43IDIxLjQgNS45IDMyLjMgMS4xIDkuNiAxLjEgMTkuMiAxLjEgMjguOSAwIDI3LTUgNTMuNC0xNC4yIDc4LjgtMS45IDUuMi00LjUgMTAtNi44IDE1LTUuNyAxMy0xMi4zIDI1LjgtMjIuMyAzNi4yLTUuOSA2LjMtMTMuNCAxMS0yMS4yIDE0LjctMyAxLjUtOC4zIDEuNy0xMC43IDQtLjQgMS4yIDMuNyAyLjIgNC41IDIuNSA1LjYgMS40IDExLjMgMi43IDE3IDMuMiAyMi4zIDIgNDUtLjIgNjUuNi05LjUgMzIuNi0xNC44IDU1LjUtNDUuNiA2OS03OCAyLjQtNS43IDQuOC0xMS44IDYuMi0xNy44IDEuMi00LjggMS44LTEwLjggNC4xLTE1LjIgLjktLjggLjEgMy44IDAgNC4zLS41IDIuOC0uOSA1LjUtMS41IDguMy0xLjcgOC41LTMuNyAxNi45LTYuMyAyNS4xLTUuMyAxNi41LTExLjEgMzMuNi0xOS40IDQ4LjktMi40IDQuMy00LjkgOS04LjEgMTIuOS0xLjggMi4xLTUuMyA1LjEtNS45IDcuOCAuMiAuNyAxLjYtLjIgMi0uNSAxLjctLjkgMy4zLTIuMiA0LjgtMy40IDYuNy01LjQgMTMtMTEuNiAxOC43LTE4LjEgMTkuNC0yMi41IDMwLjktNDkuMyAzNS4zLTc4LjcgOC01Mi44LTQuNi0xMDcuOS0yOC43LTE1NS4xLTUuNC0xMC42LTExLjUtMjAuOS0xOC0zMC43LTQtNi4xLTkuNy0xMi0xMi42LTE4LjYtLjItMS4xIDIuOCAyLjUgMy4xIDMgMiAyLjYgMy45IDUuMiA1LjggNy44IDUuNCA3LjYgMTAuOCAxNS40IDE1LjQgMjMuNSA1LjggMTAuMSAxMS43IDIwLjEgMTYuNiAzMC43IDYuOSAxNS4xIDEyLjMgMzAuNyAxNy4zIDQ2LjUgNS4zIDE2LjYgNy41IDM0LjEgOS40IDUxLjMgLjkgNy42IDEuNiAxNS43IDEuNCAyMy4zcy0uNiAxNS41LTEuNyAyMy4xYy0uNCAzLjQtMS43IDYuOS0xLjcgMTAuMnMxLjkgNi4zIDIuNyA5LjJjMS44IDYuMyAzLjYgMTIuNiA1LjEgMTguOSA1LjQgMjMuMSA3LjYgNDcuNiAuNiA3MC42LTMuMyAxMC44LTguOCAyMS4xLTE2LjIgMjkuNi0yLjIgMi43LTQuOSA1LjEtNy40IDcuNi0xLjEgMS0yLjYgMS44LTMuMyAzLjFzMy40LS41IDQtLjdjNC0xLjEgNy44LTMuNiAxMS4zLTUuOSAxMS42LTcuNiAyMC42LTE5LjMgMjcuMS0zMS40czEwLjMtMjUuNyAxMy4yLTM5LjNjMS45LTguNSAzLjUtMTcuNSAzLjgtMjYuMnMuNS0xNi42LS4xLTI0LjdjLS4zLTQuOC0xLjctMTAtMS4xLTE0LjcgLjctMS42IDEuNCA0LjEgMS41IDQuNiAuNiAzLjYgLjkgNy4yIDEuMiAxMC44IC45IDEwLjUgLjYgMjEuMiAuNSAzMS43LS4xIDYuOC0xLjMgMTQtMi44IDIwLjUtMy45IDE3LjktOS42IDM0LjUtMjAgNDkuNy00LjIgNi4xLTkuOCAxMC41LTE0LjUgMTYuMS0uNiAxLjIgMi0uMyAyLjMtLjUgMi41LTEuNCA1LTMgNy40LTQuNiA2LjctNC4zIDEyLTEwIDE3LjUtMTUuNSA0LjEtNC4yIDcuNC05LjMgMTAuNS0xNC4yIDkuMi0xNC43IDE0LjktMzAuMSAxOS4zLTQ2LjdzNS4yLTMyLjggNS4zLTQ5LjVjLjEtNy42IC4zLTE1LjMgMC0yMy0xLTIwLjItNS4yLTQwLjctMTAuMi02MC4zLTIuNS05LjctNS40LTE5LjctOS4yLTI5LTEuNC0zLjQtMi43LTYuOC00LjEtMTAuMi0uOC0yLTItNC4yLTIuMi02LjMgLjItLjkgMy4xIDIuOSAzLjcgMy41IDIuNiAyLjYgNS41IDUuMyA4LjUgNy4zIDEwLjEgNi44IDIwLjIgMTIuNyAzMS40IDE3LjMgMTUuOCA2LjYgMzIuMyAxMS4yIDQ4IDE4IDExLjEgNC45IDIxLjMgMTEuNSAzMS4yIDE4LjMgNyA0LjggMTMuOCA5LjYgMjAgMTUuMyAxMC4xIDkuMiAxOS4zIDE5LjUgMjcgMzAuNyAyLjYgMy43IDUuMSA3LjYgNy4zIDExLjUgLjkgMS44IDEuNCA0LjMgMi45IDUuNyAuOCAuMSAuMS0xLjggMC0yLjEtLjctMi40LTEuOS00LjctMi43LTcuMS0yLTUuOS00LjItMTIuMS03LTE3LjctNi44LTEzLjctMTMuMy0yNy41LTIyLjUtMzkuOC00LjctNi4zLTkuNy0xMi45LTE1LTE4LjctMy44LTQuMi04LjUtNy45LTExLjgtMTIuNi0uNC0uOSAxLjUgLjYgMS43IC43IDEuMyAuOSAyLjQgMi4xIDMuNSAzLjIgMy4xIDMgNi40IDYuNSAxMC4xIDguNyAxMi4yIDcuMiAyMy42IDE1LjEgMzQuNiAyMy45IDIxLjkgMTcuNSA0MC44IDM5LjcgNTIuMSA2NS43IDMuMSA3LjIgNS43IDE0LjggNy41IDIyLjQgLjcgMi45IDEuNSA1LjcgMiA4LjYgLjIgMS40IC4xIDMgLjkgNC4yIDEuNSAxLjEgLjgtMi44IC44LTMuNS0uMS0zLjctLjUtNy4yLTEuMS0xMC45LTEuNS05LjgtNC43LTE5LjYtOC43LTI4LjgtMTEuOS0yNy4zLTM0LjctNTAuMS01OC4zLTY3LjYtMTAuMS03LjUtMjAuMi0xNS0zMC41LTIyLTE0LjMtOS44LTI5LjItMTguOC00My4zLTI4LjgtMzIuMy0yMi45LTY0LjMtNDYuMi05Ni41LTY5LjItMTUuMy0xMC44LTMwLjctMjEuNy00NS41LTMzLjItNC40LTMuNC04LjktNi43LTEzLTEwLjMtMS43LTEuNS00LjUtNC44LTYuNy01LjMtLjkgLjMgMS42IDIuOSAyIDMuMyAyLjQgMy4xIDUuMiA1LjggNy4zIDkuMSA0LjYgNy4xIDEwLjEgMTMuNiAxNC45IDIwLjQgMS45IDIuOSA1IDYgNiA5LjQgLjEgMS4zLTEuMy0uNi0xLjUtLjktMS41LTIuMi0zLjItNC4zLTQuNy02LjUtMy44LTUuNS04LTEwLjYtMTEuOS0xNS45LTExLjYtMTUuNi0yNS4yLTI5LjktMzguOS00My42LTMyLjItMzIuMy02OC4zLTU5LTEwNy40LTgyLjMtMTEuMS02LjYtMjIuNS0xMy4xLTM0LjMtMTguMy00LjQtMS45LTkuMi00LjktMTQtNS44LS44IC4xIDIuMSAyLjMgMi41IDIuNiAxLjkgMS44IDQuMSAzLjUgNi4yIDUuMSA2LjEgNC43IDExLjcgMTAuMyAxNy4xIDE1LjggMTYuMSAxNi4yIDI5LjIgMzUuNyA0MC45IDU1LjIgNy4zIDEyLjEgMTMuMyAyNS4xIDE4LjcgMzguMiAxNS45IDM4IDI0LjcgNzguMSAyNC43IDExOS4zIDAgMTMuOS0xLjMgMjcuMy0zLjMgNDEtLjkgNS42LTEuNyAxMi43LTQuNCAxNy45LS44IC44LS40LTEuMy0uMy0xLjYgLjUtMS44IC44LTMuNyAxLjItNS42IDEuMS00LjUgMi05LjUgMi4zLTE0LjIgLjMtNS4zIDEuNC0xMC43IDEuOS0xNiAuOS05LjggMS4yLTIwLjMgLjUtMzAuMS0xLTE1LjgtMi42LTMxLjQtNS42LTQ2LjktNS45LTI5LjktMTctNTkuNi0zMS4yLTg2LjYtMS4zLTIuNi0zLjUtMy4yLTYtNC41LTMuMS0xLjYtNi4zLTMuMi05LjUtNC43LTE1LTcuNC0zMC43LTEzLjQtNDYuMi0xOS44LTUwLjQtMjAuOS0xMDMuMi0zNy4zLTE1Ny4yLTQ1LjMtMTQuNy0yLjEtMjkuNC0zLjEtNDQuMi0zLjgtMy44LS4yLTcuNi0uMy0xMS40LS42LTItLjEtNC0uNi02LS4yLTEuMyAuNyAzLjQgMS40IDQgMS41IDMuMSAuNiA2LjIgMS4yIDkuMiAyIDkuMiAyLjMgMTkuNiAzLjYgMjguMiA3LjUgLjcgLjctLjYgLjUtMSAuNC0xLjYtLjMtMy4yLS43LTQuOC0xLjEtNC4xLS45LTguMS0xLjktMTIuMi0yLjgtMTIuMy0yLjYtMjQuNi00LjYtMzYuOS03LjNzLTI1LjUtNC42LTM3LjktOC42Yy0xNC40LTQuNy0yNy45LTExLjctNDItMTcuMi04LjEtMy4yLTE2LjEtNi40LTI0LjQtOC42LTIuNC0uNy02LjEtMi41LTguNi0yLTEuNyAxLjUgLjggMy45IDIuMiA0LjQgMy41IDEuMSA3LjMgMS42IDEwLjggMi42IDIuOCAuOSA1LjQgMi4zIDguMiAzLjEgMTQgNC40IDI4IDExLjUgNDEuMSAxOC4yIDMzLjYgMTYuOSA2NC44IDM4LjYgOTUuMSA2MC45IDcuNiA1LjYgMTUuMiAxMS4zIDIyLjYgMTcuMSAyLjkgMi4zIDcuNyA1IDkuNyA4LjEgLjMgMS4xLS45IC4zLTEuMyAwLTEuNC0xLjEtMi44LTIuMi00LjItMy4zLTMuOC0yLjktNy43LTUuOS0xMS41LTguNy0xMS4xLTguMy0yMi43LTE1LjgtMzMuNi0yNC4yLTguOC02LjgtMTguNy0xMi42LTI4LjItMTguMy0xMC42LTYuNC0yMC45LTEyLjgtMzItMTguM3MtMjIuOC0xMS4xLTM1LjEtMTAuNmMtNS43IC4zLTExLjkgMS45LTE2LjggNC45LTIuMyAxLjQtNC4yIDQtNi43IDUtMS4xLS4xLTEuNi0yLjctMi40LTMuNS0zLTMuMi01LjctNi4yLTguMy05LjctOS41LTEyLjktMTcuMi0yOC44LTEzLTQ1LjIgLjgtMy4yIDIuMy02LjYgNC05LjUgMS0xLjcgMi44LTMuMSAzLjMtNS4xek0xMDk2LjQgNTMuOGMuNy0uMiAxLjcgMS41IDIuMSAyIDEuOCAyLjIgMy4zIDQuNyA1IDYuOSA3LjggOS44IDE1LjUgMTkuNyAyMi45IDI5LjcgMjEuMiAyOC42IDQyLjkgNTcuMiA2NC4zIDg1LjcgNS43IDcuNiAxMS4xIDE1LjMgMTYuOSAyMi45IDMuMiA0LjIgNi40IDkuNiAxMS40IDExLjhzMTAtLjUgMTQuNC0yLjljOC43LTQuOCAxNi45LTEwIDI1LjItMTUuMyAxMC4yLTYuNiAyMC45LTEyLjcgMzEuNC0xOC45IDEyLjgtNy42IDI1LjItMTUuOSAzOC0yMy41IDcuOS00LjggMTUuNy05LjkgMjMuOC0xNC41IDMuMi0xLjggNi4zLTQuMSA5LjgtNS42IC44LS4xIC4yIC43LS4xIDEtMSAxLjEtMi4zIDEuNy0zLjQgMi42LTIuNiAyLjEtNS4zIDQuMS03LjkgNi4zLTcuNyA2LjYtMTUuNiAxMi45LTIzLjcgMTktMTEuMSA4LjQtMjEuNiAxNy42LTMyLjUgMjYuMS02LjYgNS4xLTEzIDEwLjYtMTkuNiAxNS42LTMuNiAyLjctNy4zIDUuMi0xMC42IDguMi00LjQgNC05LjQgNy42LTE0IDExLjUtMS41IDEuMi00LjYgMy00LjggNS4xIC41IDEuNCAyLjQgMS42IDMuNyAxLjkgNCAuOSA4LjEgMS41IDEyLjIgMi4xIDE2LjQgMiAzMi44IDUuNiA0OSA5LjUgMjcuNiA2LjcgNTUuMyAxNi40IDc5LjggMzEuMiA4IDQuOCAxNS4xIDEwLjggMjIuMyAxNi42IDIuNyAyLjIgNS4yIDUuMSA4LjEgNi45IDEuOSAxLjEgNC4xLTEuMSA2LTEuNSAyLjYtLjUgNS44IC41IDcuOSAyLjJzMy4yIDUuNyAyLjkgOC45Yy0uMSAxLjQtMSAzLjItLjQgNC42IDEuMiAyLjggNSA0LjEgNi4xIDcgMCAxLjEtMS41LS42LTEuOC0uOC0xLjQtMS40LTQtNC41LTUuOS01LjFzLTIuOSAxLjUtNC4xIDEuOWMtMi45IDEuMi02LjMgLjUtOC44LTEuM3MtNC4xLTUuMy00LTguN2MuMS0xLjggMS40LTMuOSAwLTUuNi0yLjItMi43LTUuNS00LjYtOC40LTYuNS02LjItNC4yLTEyLjctNy43LTE4LjgtMTItOC4zLTUuNy0xOC44LTkuMi0yOC0xMy4yLTI2LjctMTEuNi01NS40LTE5LjEtODMuOS0yNC45LTguOS0xLjgtMTcuOS0yLjctMjYuOS0zLjktMy42LS41LTkuNy0xLjMtMTMuMSAuNS00LjEgMi4xLTIuOCA3LjEtMS4yIDEwLjQgNC40IDguNyA5LjggMTcuMSAxNS4xIDI1LjQgNS45IDkuNSAxMSAxOS40IDE2LjkgMjguOSAxMC4xIDE2LjYgMjAuNiAzMyAzMC4zIDQ5LjkgMy44IDYuOCA4LjEgMTMuNSAxMi4yIDIwIDEuNyAyLjYgNS4xIDYuNiA1LjQgOS43LS40IC45LTIuNi0yLjMtMi45LTIuNy0yLjgtMy43LTUuOS03LjItOC43LTEwLjktNi44LTkuMS0xNC4yLTE3LjctMjEtMjYuOS0xNS0yMC4yLTMxLTQwLTQ3LjMtNTkuMi01LjItNi4xLTkuOS0xMi42LTE1LjEtMTguNy0yLjQtMi43LTQuNC02LjItNy42LTguMS03LTQuMy0xMy45LTEuMS0yMC40IDIuNC01LjUgMy0xMC45IDYuMy0xNi40IDkuMS0yMy45IDEyLjMtNDcuMiAyNS45LTcwLjkgMzguNi02LjYgMy42LTEyLjkgNy44LTE5LjYgMTEuMi0yLjEgMS00LjcgMy40LTcgMy41LS43LS40IDItMi4yIDIuNC0yLjUgMy0yLjIgNS45LTQuNyA5LTYuOCA3LjUtNSAxNC4zLTExLjMgMjEuNy0xNi41IDguNi01LjggMTYuNS0xMi41IDI0LjgtMTguNyAxMS44LTguOCAyMy42LTE3LjQgMzUuNC0yNi4xIDcuMy01LjMgMTkuMi0xMS40IDE5LjktMjEuMyAuNS02LjQtMi45LTExLjItNS45LTE2LjUtNC4zLTcuOS04LjUtMTUuOS0xMy4xLTIzLjZzLTguMy0xNS43LTEyLjgtMjMuMmMtMTMuNS0yMi42LTI2LjQtNDUuNS00MC02OC02LjUtMTAuOC0xMy4xLTIxLjUtMTkuNS0zMi4zLTEuNS0yLjQtMy4yLTQuOS00LjgtNy4yLS42LS45LTEuOC0yLjMtMS40LTMuNHpNNDI5LjIgODguMWMuNi0xLTEuOC0xLjktMi41LTIuMi0yLjgtMS40LTUuOS0yLjctOC45LTMuOS05LjctMy43LTE5LjEtOC4zLTI5LTExLjUtMy4zLTEtNy45LTMuNC0xMS40LTMuMS0yLjEgMS4yIDEuNyA2LjIgMi40IDcuNSAzIDUuMiA2LjEgMTAuMyA5LjggMTUuMSAxLjMgMS42IDIuOCA0IDQuNSA1LjIgMS4xIC44IDIuNCAuNSAzLjUtLjIgMy44LTIuNiA3LTQuNSAxMS42LTUuNiAzLjItLjkgNy4zLTEuNCAxMC42LTEuM3M2LjggMS4zIDkuNCAwek0xMTU3LjkgMTQ3LjZjLjMgLjYtLjEgMS4zIDAgMS45IC4yIDEuNiAxLjUgNCAyLjYgNS4ycy0uNy0zLjYtLjctNC4yIDQuNiAuOCA1LjUgLjljMS4xLS42LTIuNC00LjktMy01LjYtNC4xLTUuNC04LjEtMTAuOC0xMi4xLTE2LjMtNi4xLTguNC0xMi4zLTE2LjctMTguMy0yNS4yLTMuNy01LjEtNi45LTExLjUtMTEuNS0xNi0xLS41LS40IDEuMS0uMiAxLjUgMS4xIDEuOCAyLjUgMy41IDMuNyA1LjMgMy4xIDQuMyA1LjcgOC44IDguNCAxMy4zIDUuOCA5LjYgMTEuNiAxOS4zIDE3LjggMjguNyAyLjIgMy40IDQgOC45IDcuOCAxMC41ek0zNzkuOCAxMDUuNmMuOCAuNS0xLjMgMS42LTEuNyAxLjgtMi43IDEuNS01LjUgMy41LTggNS40LTUuOSA0LjQtMTAuOSAxMC40LTE1LjMgMTYuMy03LjQgOS45LTEzIDIyLTE2LjUgMzMuOC0xLjMgNC43LTIuOCA5LjQtMy45IDE0LjEtLjYgMi40LS42IDUuNS0xLjggNy42LS45IC43LS43LTEuMi0uNi0xLjYgMC0yLjIgLjQtNC42IC40LTYuOS0uMS01LjItMi43LTEwLjctMy40LTE2LTEuNi0xMi4zLTMuMi0yNS0xLjYtMzcuNCAuNS0zLjkgLjctOC4zIDIuMy0xMnM5LjEtMy40IDEyLTMuOGMxMi42LTEuNSAyNS40LTEuNCAzOC4xLTEuM3pNMzkxIDEwNmMuOCAuNCAwIDEuNC0uMyAyLTEuMSAxLjktMiA0LTIuOSA2LjEtMi4yIDUuMy0zLjkgMTAuNy01LjMgMTYuNC0yLjIgOC42LTIuNyAxOC41LTIuNSAyNy40IC4xIDMuOCAyIDguOSAuNyAxMi43LS43IC42LTEuNS0zLjctMS42LTQuMy0uNy00LjktMS40LTkuNy0yLTE0LjUtLjQtMy40LS4xLTctLjEtMTAuNCAwLTguNyAuNC0xNy44IDQtMjUuOSAxLjYtMy40IDUuOC05LjQgMTAtOS41ek0zNjkuNyAxMDguN2MtLjEtLjgtMS40LS43LTItLjctMi4yIDAtNC41IDAtNi43IDAtNi45IDAtMTMuOSAuNy0yMC43IDEuOC0yLjUgLjQtNS42IC42LTcuNyAyLjEtMy4xIDIuMy0yLjMgOC45LTIuOCAxMi4yLTEuNSAxMC40LS40IDIwLjggMS4xIDMxLjEgLjUgMy41IC43IDggMi4xIDExLjIgLjggMSAxLjItLjYgMS4zLTEuMiAuNy0yLjMgMS40LTQuNiAyLjItNi45IDEuOC01LjQgNC4yLTEwLjcgNi43LTE1LjggMy4zLTcuMSA3LjctMTQuOSAxMy4yLTIwLjYgMy0zLjIgNi4yLTYuMyA5LjMtOS40IDEuMi0xLjIgMy4zLTIuMyA0LTMuOHpNMTMzNS44IDE1MC43YzAtLjktMiAuNC0yLjMgLjYtMi4xIDEuMy00LjIgMi43LTYuMyA0LjItNS4xIDMuNy0xMC42IDYuOC0xNS45IDEwLjMtOS42IDYuMy0xOS40IDEyLjgtMjkuNCAxOC42LTQgMi40LTggNS0xMiA3LjUtMS43IDEuMS0zLjggMi01LjIgMy42LS40IC44IDQuNi0xLjQgNS41LTEuNSAyLjItLjMgNC4yIDIuMiA2LjcgMS41IDEuOS0uNSAzLjgtMi40IDUuMy0zLjUgMi44LTIuMyA1LjgtNC4zIDguNS02LjUgMTAuNi04LjggMjEuNi0xNi45IDMyLjQtMjUuNCAzLTIuMyA2LjEtNC40IDkuMi02LjYgMS4xLS44IDIuNy0xLjUgMy41LTIuOHpNODMzLjIgMTUyLjVjLjYgMS4zIDIuNiAyLjMgMy43IDMuMSAzIDIuNSA2IDUgOC45IDcuNiA2LjUgNS40IDEyLjQgMTEuNyAxOS4yIDE2LjggNC42IDMuNSAxMCA2LjEgMTUuMSA4LjkgMzEuOSAxNy40IDY1LjUgMzEuNCAxMDAuNCA0MS40IDE5LjMgNS41IDM5LjYgMTAuMSA1OS43IDEwLjcgMTYgLjUgMzEuNyAuOSA0Ny41LTEuOCAzLjYtLjYgNy4yLTEuMyAxMC43LTIgMS43LS4zIDMuNy0uNCA1LjItMS4zIC44LTEuMS0yLjctLjQtMy4xLS40LTMuNCAuNC02LjggMS0xMC4zIDEtOS42IC4xLTE5LjEtLjQtMjguNy0uNS03LjktLjEtMTUuNi0xLjktMjMuNC0yLjktMTkuMi0yLjUtMzguMy03LjQtNTYuOS0xMi44LTM1LjEtMTAuMi02OC41LTI0LjktMTAxLjEtNDEuNC0xMi4yLTYuMi0yNC4xLTEzLjItMzUuOC0yMC41LTIuNy0xLjctNS42LTMuNC04LjQtNS4xLS41LS4yLTIuMi0xLjUtMi43LS44ek05MDEuMyAxNTkuNGMuOC0uMyAyIC45IDIuNyAxLjMgMi4yIDEuMyA0LjMgMi44IDYuNCA0LjIgOC42IDUuOCAxOC4xIDEwLjMgMjYuOCAxNS45IDYgMy45IDEzIDYuNyAxOS40IDkuOCAxOS4yIDkuMiAzOS4yIDE2LjYgNTkuNSAyMyA1LjIgMS43IDEwLjcgMy4xIDE2LjEgNC4yIDMgLjcgNi41IDEuMSA5LjMgMi40IC45IC44LTMuOCAuMi00LjMgLjEtMy40LS42LTYuNy0xLjItMTAtMi05LjUtMi4xLTE4LjktNC4zLTI4LjItNy0xMi4yLTMuNS0yNC41LTcuNi0zNi0xMi44LTE0LjQtNi42LTI3LjktMTQuOS00MS4xLTIzLjQtNS41LTMuNi0xMC42LTcuOC0xNi0xMS44LS44LS42LTQuOS0yLjctNC42LTMuOXpNMTMwMC43IDI0Mi4zYzEuNSAxLjUgNS4yIDEuNSA3LjIgMiA2LjEgMS43IDEyLjEgMy40IDE4LjIgNSAxMi41IDMuMyAyNSA4LjMgMzYuOSAxMy40IDUuNSAyLjQgMTEuMyA2LjMgMTcuMSA3LjggLjktLjEtLjctMS4yLS45LTEuMy0xLjUtMS0zLjMtMS44LTQuOS0yLjYtNC4zLTItOC42LTQtMTMtNS44LTEzLjItNS41LTI2LjctMTAuNC00MC42LTE0LTUuMS0xLjMtMTAuMi0zLTE1LjQtNC4xLS41LS4yLTQuOC0xLjMtNC42LS40ek0zMjcuMSAyOTIuOGMtMS0uOC0xLjQgMS42LTEuNiAyLjMtMSAzLjQtMi4xIDYuNy0zLjQgMTAtMy41IDguNC03LjEgMTYuOC0xMS4xIDI0LjktOCAxNi4zLTE2LjggMzEuOS0yMy4yIDQ4LjktMiA1LjMtMy43IDEwLjctNC43IDE2LjMtLjQgMi0xLjMgNC0uOSA2LjEgLjYgMS4zIDEuNC0zLjEgMS42LTMuNyAuNy0yLjkgMS41LTUuOCAyLjUtOC43IDIuOC04LjUgNi4xLTE2LjkgMTAuNi0yNC43czguOC0xNS42IDEzLjctMjMuMSAxMC0xNC43IDE0LjItMjIuNmMxLjYtMy4xIDQtNi45IDQuNC0xMC40cy0uOC02LjEtMS4xLTljLS4yLTIgMC00LjQtMS02LjN6TTEyOTQuMyAzNDguN2MuNyAuMiAuMS0xIDAtMS4yLS42LTEuMy0xLjYtMi40LTIuMy0zLjYtMi0zLjMtNC02LjUtNi4yLTkuNi00LjUtNi42LTgtMTMuOS0xMi42LTIwLjUtMS4zLTEuOS0yLjYtNS43LTQuOC02LjctMS44IC4xLTEuNiAyLjEtMy44IDEuNi0xIC4zIDEuNiAzLjEgMS45IDMuNSAyLjcgMy40IDUuMyA2LjggNy45IDEwLjIgMy45IDUuMSA4IDEwLjEgMTEuOCAxNS4yIDIuNyAzLjYgNC45IDcuOSA4LjEgMTEuMXpNMTQ2MS41IDM1NC42Yy0yLjUgLjQtNC42IC4xLTctLjQtNi4yLTEuMy0xMS43LTUuNi0xNC4xLTExLjQtNC41LTExLjEgMS45LTI1LjkgMTQuNS0yNy43IDUuMi0uNyAxMS4xLS4xIDE1LjYgMi45IDEwLjEgNi43IDEyIDIzIDMuMyAzMS43LTMgMy04LjMgNC40LTEyLjMgNC45ek01NTQuMSAzMTYuOWMxIDMuMiA0LjIgNi41IDYgOS4yIDMuNyA1LjUgNy41IDExLjYgMTAuMSAxNy43IDEuMyAzIDIuOSA2IDQuNCA5IC43IDEuMyAxLjIgMy4zIDIuNCA0LjFzNC45LTMuOSA1LjktNS4xYzMuOS00LjYgOC4zLTguNyAxMi41LTEzIDEuNi0xLjYgNC40LTMuNCA1LjUtNS40IDAtMS43LTUuNC0xLjktNi43LTIuMi03LjMtMS43LTE0LjEtNC4xLTIxLjItNi41LTUtMS44LTkuNy00LjItMTQuNS02LjQtLjctLjMtNC4yLTIuNy00LjQtMS40ek00NjcuNiAzMjAuMWMxLjUtLjMgMy42IDQuNyA0LjMgNS44IDQuMiA2LjEgNy45IDEyLjYgMTEuNyAxOSAxMS45IDE5LjYgMjIgNDAuMyAzMC43IDYxLjUgMi4xIDUuMiAzLjkgMTAuNSA1LjkgMTUuOCAxLjMgMy40IDMuMSA3LjQgMy41IDExLjEtLjMgMS41LTEuOS0zLTIuMS0zLjUtMS4yLTMuMS0yLjMtNi4yLTMuNS05LjMtMy41LTkuMi03LTE4LjctMTEuNC0yNy41LTkuMi0xOC43LTE4LjktMzYuOC0yOS01NS0yLjMtNC4yLTQuOC04LjctNy41LTEyLjctLjgtMS0zLTMuOS0yLjYtNS4yek0zMjIuMSAzMzAuNGMtLjUtMS4xLTIuMiAxLjgtMi41IDIuMi0xLjkgMy41LTQuNiA2LjUtNi42IDkuOS00LjggOC42LTEwLjUgMTYuNy0xNC45IDI1LjYtOC42IDE2LjktMTUuNyAzNi4yLTE0IDU1LjYgLjggOS4zIDMuNyAxOC45IDggMjcuMiAyLjYgNS4yIDUuNyA5LjYgOS4xIDE0LjIgMS40IDEuOSAzLjYgNC44IDUuOCA1LjggMS4zIC4xIDEuNy0xLjUgMi0yLjQgMS0zLjIgMi4yLTYuNSAyLjktOS44IDEuNC02LjEgLjEtMTEuMi0uNy0xNy40LTEuMi04LjItMS44LTE2LjUtMi4yLTI0LjgtLjMtNi41IC41LTEyLjkgLjktMTkuMyAuOC0xMS41IDEuOC0yMy40IDQuNS0zNC42IDEuNi03LjEgMy0xNC4zIDQuOC0yMS40IC45LTMuMyAyLjktNy4zIDIuOS0xMC44ek02NTEuNCAzODkuNWMxLjQtLjEgMi44LTEuNSAzLjktMi4zIDIuNi0yIDUuMy0zLjYgNy45LTUuNiAxLjEtLjkgMy4yLTEuNyAzLTMuNC0uMS0xLS44LTIuMS0xLjItMy0xLjQtMy40LTMuMS02LjUtNC43LTkuNi01LjYtMTEuMi0xMi41LTIxLjQtMTkuNC0zMS43LTIuNy00LTUuNC04LTguNS0xMS44LS45LTEuMS0xLjktMy4yLTMuNC0zLjZzLTIuNSAxLjgtMy42IDIuNmMtMyAyLjMtNS44IDQuNy04LjUgNy4zLTEuMSAuOS0zLjQgMi4xLTMgMy44czEuOCAyLjggMi43IDMuOWMyLjEgMi43IDQuMiA1LjQgNi4zIDggNi40IDguMyAxMi4xIDE3LjEgMTcuNiAyNiAyLjcgNC41IDUuMyA5LjQgNy42IDE0LjEgLjggMS41IDEuNiA0LjggMy4zIDUuM3pNNjQ3LjEgMzM3LjljMSAzLjcgNC40IDcuMSA2LjUgMTAuMyAzLjggNS44IDcuMiAxMiAxMC4zIDE4LjIgMS4xIDIuMyAyLjMgNC42IDMuNSA3IC40IC45IC44IDIuMiAxLjcgMi42IDEuOCAuOCAzLjgtMS45IDUuMy0yLjVzLS4yIDEtLjQgMS4zYy0xLjEgMS4xLTMuNSAyLjYtMy42IDQuM3MuOCAyLjUgMS4yIDMuNmMxLjEgMi43IDIuMSA3IDQuMiA5LjEgMS41IC44IDIuOC0xLjcgMy41LTIuN3MyLjMtMi4zIDMuMi0zLjYgMS45LTQuNSA0LTUuNWMxLjMgMCAxLjQgMS44IDEuNyAyLjggLjcgMi41IDEuNiA2LjQgMy4zIDguNCAuOCAuNSAuNC0xLjIgLjQtMS42LS40LTEuOC0uOS0zLjYtMS40LTUuNHMtMS45LTQuNS0xLjYtNi4xIDEuNS0xLjQgMi0yLjIgLjgtMi4xIDEuNS0zIDIuNS0yIDMuNS0zLjNjNC43LTYuMyA5LjYtMTIuMyAxNC40LTE4LjUgMy4xLTQgNi42LTggOS0xMi40IC4yLTEuMi0xLjctLjYtMi4zLS41LTIuOSAuNS01LjggLjgtOC42IDEuMi02LjkgLjgtMTMuNyAxLjEtMjAuNiAxLjEtMTAuNCAwLTIwLjctLjYtMzEtMi4xLTIuNC0uNC00LjctLjYtNy4xLTEuMS0uOC0uMS0yLjMtLjQtMi42IC42ek0xNDQuMiAzMzkuNGMuNiAwIC44IC4xIC43IC43LTIuMSAzLjgtNS41IDcuMS04LjEgMTAuNC0xMC4zIDEyLjktMjIgMjguNS0xNi4yIDQ1LjkgMSAzIDIuOSA1LjUgNC41IDguMiAzLjkgNi43IDcuNyAxMi45IDEyLjcgMTguOCAyLjQgMi45IDQuOCA1LjcgNyA4LjcgLjggMSAyLjIgMi4zIDIuNiAzLjUtLjMgMS0zLTEuNS0zLjQtMS44LTMuMy0yLjctNi44LTUuMi0xMC4yLTcuOC04LjYtNi42LTE4LjMtMTQtMjguOS0xNi44LTE2LjctNC4zLTMyLjggNy00NS40IDE2LjctMy45IDMtNy42IDcuMi0xMS45IDkuNS0xLjggLjIgLjktMi44IDEuMi0zLjIgMi4zLTIuOSA0LjctNS44IDctOC43IDYuMi03LjYgMTIuOC0xNS42IDE2LjctMjQuNiA2LjgtMTUuNC0xLTI5LjctOS41LTQyLjQtMi4zLTMuNC01LjktNi43LTcuNC0xMC40LS4yLTEuNyAyLjQgLjQgMi45IC43IDIuOSAxLjkgNS41IDQgOC4zIDUuOSA3LjMgNS4yIDE1LjggMTAuNSAyNC43IDEyLjEgMTUuOCAyLjkgMzAtOCA0MS44LTE3IDMuNC0yLjYgNy02LjYgMTAuOS04LjR6TTEwMzMuOCA1MzEuMWMtLjctMS4xLS44IDEuNS0uOCAxLjgtLjEgMi4yIC4xIDQuNCAwIDYuNy0uMiA2LjItLjMgMTIuOS0xLjIgMTkuMS0yLjEgMTQuMy00LjQgMjguNC03LjYgNDIuNi0xIDQuMy0yLjEgOC43LTMuNiAxMi45LS41IDEuNS0uOCAzLjMtMS44IDQuNS0uNyAuMy0uNC0xLS4zLTEuMyAuNS0yIDEuMS0zLjkgMS42LTUuOSAxLjQtNC45IDIuNS0xMCAzLjctMTUuMSAzLjItMTQuOSA2LjItMzAuNSA2LjctNDUuNyAuOC0yNy4zLS4xLTU0LjgtNi45LTgxLjQtMi41LTEwLjEtNS4yLTIwLjMtOC44LTMwLjEtMi4zLTYuMi01LjYtMTIuMy03LjQtMTguNi0uMS0xLjEgMS44IDEuOCAxLjkgMi4xIDEgMS44IDEuOSAzLjcgMi43IDUuNiAyLjYgNiA1IDEyIDcuNCAxOC4xIDQuMiAxMC42IDggMjEuOSAxMC40IDMzLjEgMS4xIDQuOSAyLjMgOS45IDMuMSAxNC45IC40IDIuNiAuNiA1LjcgMS40IDguMSAuNiAuOCAxLS40IDEuMS0uOSAuMi0xLjYgLjItMy4yIC41LTQuOCAuNS00IDEtOC4yIDEuMS0xMi4zIC4zLTEyLjUtLjEtMjQuNi0xLjEtMzctLjctMTAuMi0zLjMtMjAuNy02LjEtMzAuNi00LTE0LjEtOS0yNy44LTE2LjUtNDAuNS00LjktOC4xLTEwLTE3LjYtMTcuNS0yMy43LTIuOC0yLjQtNy0zLjgtMTAuMy01LjVzLTcuNC00LTEwLjktNi4zYy0xLjQtLjktMy0yLjYtNC44LTIuOC0xIC42IC4yIDIuNiAuNCAzLjQgMS4yIDMuMyAyLjMgNi42IDMuNiA5LjkgNS41IDEzLjkgOSAyOSAxMS45IDQzLjYgNy45IDM5LjEgOS41IDgwLjUtMS43IDExOS4yLTIuOSA5LjktNi43IDE5LjctMTEuNyAyOC44LTEuOSAzLjQtMy43IDYuOC01LjcgMTAuMS0uOSAxLjUtMi4zIDMuMS0yLjUgNC45LS4zIDIuNCAuNSA0LjkgLjggNy4zIC40IDMuNCAuNiA2LjkgMSAxMC4zIDEgOC44IDEuMyAxOCAxLjYgMjYuOSAuOSAzMC4xLTIuNCA2MC4zLTEyLjQgODguOC04LjIgMjMuOC0yMC43IDQ3LjgtMzcuNSA2Ni44LTMuNiA0LjEtNy40IDgtMTEuMyAxMS45LTEuMSAxLjEtMy45IDMtMy45IDQuN3MxLjQgMi42IDIuMSAzLjVjMi4yIDIuNSA0LjIgMiA3LjIgMS40IDUuMS0xLjIgOC40LTMuMyAxMi44LTYgMTctMTAuMiAzMS4xLTI2IDQzLjktNDAuOCA5LjctMTEuMyAxOC4yLTIzLjkgMjUuNi0zNi43IDE5LjgtMzQuOCAzMy43LTczLjMgMzguMS0xMTMuNCAxLjMtMTIuMSAxLjktMjQuMSAxLjktMzYuMyAwLTQuOCAuOS0xMC43LS4yLTE1LjN6TTUwNS40IDM0OGMuNSAxLjYgMS45IDIuOSAyLjkgNC4yIDEuNSAyIDIuOCA0LjMgNC4xIDYuNCA0LjIgNi42IDguMiAxMy41IDExLjggMjAuNCA2LjggMTMgMTMuMyAyNi4xIDE4LjkgMzkuNyAyLjggNi44IDQuNyAxNC4xIDcuNiAyMC45IDEgMi40IDMuMiAzLjIgNS40IDQuMyAzIDEuNSA1LjkgMy4yIDguOSA0LjYgMS41IC42IDMuNSAyIDUuMSAxLjZzLS42LTMuNy0uOS00LjhjLTEuNi00LjgtMy44LTkuNi02LjEtMTQuMi05LjgtMTkuNi0yMS4zLTM4LjEtMzQuMy01NS43LTQuOC02LjUtOS45LTEzLjEtMTUuNi0xOC45LTEuOC0xLjktMy41LTQtNS4yLTYtLjMtLjQtMi41LTMuNC0yLjYtMi41ek0xNDc0LjMgMzUxLjVjMS4zLS4xIDIuMSAxLjUgMi44IDIuNCAyLjQgMi44IDQuMiA2LjIgNi45IDguOCAxLjIgMS4yIDIuMyAuNiAzLjggLjRzMy41IDAgNS4xIC43YzcuNiAzLjMgOC4zIDE1LS4xIDE3LjgtNy43IDIuNS0xMy4zLTMuOS0xMi43LTExIC4xLTIuMSAyLjYtNC40IDItNi4zLTEuMS0zLjMtNC40LTYuNS02LjMtOS4zLS41LS43LTIuNS0yLjctMS41LTMuNXpNMTMxLjQgMzUzLjNjLS4xLTEtMS44IC41LTIuMSAuNy0yIDEuNi00LjEgMi45LTYuMSA0LjUtNC43IDMuNy0xMS4xIDcuMS0xNyA4LjUtMTEuMiAyLjctMjAuOC0uMy0zMC42LTUuNi0yLjktMS42LTYuMi01LjEtOS4zLTUuOS0uOSAuMyAuNCAyLjEgLjcgMi41IDEuMyAyLjEgMi45IDQuMSA0LjMgNi4yIDMuOCA1LjYgNiAxMS44IDcgMTguNSAxLjUgMTAuMy0zLjcgMjAuOC05LjggMjguOC0yLjIgMy01LjggNi4yLTcuNCA5LjQtLjEgMS4yIDEuNS0uMyAxLjgtLjUgMi0xLjggNC4zLTMuMyA2LjUtNC44IDUuNi0zLjggMTEuNi03LjYgMTguMy05LjQgMTIuNy0zLjMgMjQuNyAxIDM1LjIgOC4yIDMgMiA1LjkgNS40IDkuMSA3IDEuMyAuMi0uNy0xLjktMS0yLjItMS43LTItMy4yLTQuMy00LjgtNi40LTQuMS01LjQtNy42LTExLjgtOS40LTE4LjQtMy4yLTEyIDEuOS0yMy42IDguNS0zMy4zIDEuNy0yLjUgNS01IDYuMS03Ljh6TTEwMDkgMzU5Yy4zIDIuOSAzLjEgNiA0LjQgOC42IDMuNCA2LjUgNi4zIDEzLjIgOS4zIDE5LjkgNy4xIDE2LjMgMTEuNiAzMy42IDE1IDUxIDEuNSA3LjYgMi4zIDE1LjQgMi4zIDIzLjIgMCAzLjEtMS4xIDguNSAuOCAxMS4yczUuNCA0LjggNy45IDcuMWM0LjYgNC4yIDkuMiA4LjkgMTQuMSAxMi44IDEuNiAxLjMgNC45IDUuNSA3IDUuMyAxLjItLjEgMS45LTEuNiAyLjUtMi40IDIuMi0yLjkgMy45LTYuMyA1LjUtOS42IDUuMS0xMC45IDguNC0yMi4xIDkuMy0zNC4xIC4yLTMuNCAuOS02LjkgLjctMTAuMy0uOC0xMy44LTIuMy0yNy40LTYuNC00MC43LTEuMy00LjMtMi44LTEwLjktNS45LTE0LjNzLTcuNy01LjMtMTEuNS03LjJjLTUuOS0yLjktMTEuNy01LjktMTcuNi04LjctOC45LTQuMy0xOC43LTcuMS0yOC4yLTEwLTIuMy0uNy00LjUtMS40LTYuOC0yLjItLjgtLjMtMi4xLS43LTIuNCAuNHpNOTU0LjQgNjc2LjNjMS43IC40IDIuMy00LjggMi42LTYgMS40LTYuNyAzLTEzLjMgMy45LTIwLjEgMi45LTIxLjUgMy42LTQ0LjEgMS4yLTY1LjctLjUtNS0uNi0xMC4xLTEuNC0xNS4xLS4yLTEuNi0uMS0zLjktMS4zLTUuMi0xLjMtLjQtMy4yIDIuOS00LjEgMy44LTQuMyA0LjMtOC41IDguNS0xMy40IDEyLjEtMTEuNSA4LjQtMjQuNSAxNC4zLTM4LjIgMTgtNC41IDEuMi0xMC45IDMuMy0xNS41IDIuNi0xLjUtLjggMS43LTIuNCAyLjQtMi44IDMuNC0yLjIgNi43LTQuNyA5LjctNy41IDcuNy03LjEgMTMuNS0xNi4xIDE4LjEtMjUuMyAxMC4xLTIwLjIgOS00NC44IDQtNjYuMS0xLjctNi45LTMuMi0xNS41LTYuOC0yMS42LTEuMy0xLjEtMS44IDEuMy0yLjIgMi4yLTEuMSAzLTIuNCA1LjktMy44IDguOC0zLjkgNy44LTguNCAxNS40LTEzLjggMjIuMy0xMi45IDE2LjYtMzAuNCAzMC4xLTQ5LjIgMzkuMi01LjYgMi44LTEyLjEgNi41LTE4LjMgNy41LS43LS4xIC4xLS45IC40LTEuMSAxLjEtLjkgMi42LTEuNSAzLjktMi4xIDMtMS41IDUuOS0zLjUgOC4zLTUuOSA1LjYtNS41IDEwLjMtMTEuMSAxNC42LTE3LjYgMi4xLTMgNC45LTYuNyA1LjktMTAuMi0uMS0xLjQtMi4zIDEuMS0yLjYgMS41LTIuNSAyLjktNSA1LjktOC4xIDguMy04LjEgNi41LTE2IDEyLjEtMjUuMyAxNi44LTIzLjQgMTEuNi01MC45IDEyLjctNzYuMyA5LTYuNS0uOS0xMy4yLTIuMy0xOS4zLTQuNy0yLjEtLjgtNC44LTEuNi02LjEtMy40LS4zLTEuNCA1LjItMiA2LjMtMi4zIDQuNS0xLjYgOC42LTMuNiAxMi42LTYuMiAxMS44LTcuNCAyMC42LTE3LjcgMjctMzAgOS4zLTE3LjkgMTEtMzkuNiA4LjUtNTkuMi0uNS00LjUtLjctOS40LTItMTMuNy01LjgtMTguNy0xNS41LTM2LjEtMjUtNTMtNC43LTguNS0xMC0xNi41LTE1LjEtMjQuNy0xLjYtMi43LTQuMi04LjQtNy05LjgtMS44IC4xLTMuMyA1LjEtMy45IDYuNS0xLjkgNC4xLTQuMiA3LjktNi4xIDExLjktLjggMS42LTIgMy43LTEuOCA1LjUgLjEgMS4yIDEuMiAxLjQgMS44IDIuMyAuMiAxLjYtMS43IDQuNy0yLjggNS45cy0uMi0zLS4yLTMuNS0uNC0uOC0xLS43Yy0yLjEgMS40LTIuNiA1LjgtMy45IDcuOS0zLjggNi04LjQgMTEuMi0xMS42IDE3LjYtMS4xIDIuMiAwIDUuMS0xIDYuOS0yLjcgMS43LTIuNSAzLjctNCA2LjRzLTQgNi4xLTUuOCA5LjJjLS45IDEuNS0yLjggMy40LTIuOSA1LjEtLjQgNS4zIDEuNSAxMSAxLjEgMTYuNC0uOCAxNC0yLjkgMjcuOC04LjggNDAuNy0yIDQuNS00LjMgOC45LTcuMyAxMi45LS45IDEuMi0yIDMuMS0zLjMgMy44LTEuMSAwLS40LTEuMy0uMS0xLjggMS0xLjYgMi4xLTMgMi45LTQuNiAxLjktMy43IDIuNC05IDIuNi0xMy4xIC45LTEyLjctMS4yLTI2LjQtNC43LTM4LjYtLjctMi42LTEuNS01LjEtMi4yLTcuNi0uMy0xLjQtLjYtMy4xLTEuNy00LjFzLTIuMSAxLjMtMi44IDIuMmMtMiAyLjctMi4xIDcuNi01IDkuNi0xLjEgLjEtLjQtMS44LS40LTIuNC0uNC0xLjQtNC4yIDMuNC00LjcgNC4xLTIuMSAyLjctNC44IDUtNy40IDYuOS0xIC44LTIuMSAxLjktMy40IDIuMS0xLS40LS4xLTEuMyAuMy0xLjcgMS45LTIgMy41LTMuNSAyLjgtNi4zIC4yLS43IDEuMi0uOCAxLjgtMS4xczItMS43IDIuNi0yLjdjMi40LTQuMSAzLjUtOC43IDQuOC0xMy4yIC45LTMuMyAxLjktNi40IDIuMS05LjkgLjEtMiAxLjItNS0uMS02LjktMS4xLS42LTIgLjgtMyAxLjFzLjktMi42IDEuMi0zYzEuNS0xLjkgMi40LTMuOCAuOS02LjEtMS0uOC0yLjEgLjUtMy4yIC43czIuMi0zIDIuMy0zLjZjLjMtMS45LTItNi45LTMuNC04LjFzLTQuMyAxLjYtNS43IDIuNS0zLjQgMS45LTQgMy4zIDAgMi41LS4xIDMuNmMtLjEgMi43LTEuNCA5LjItMy45IDEwLjctMS4xIDAgMC0zLjggLjEtNC42IC42LTMuMiAxLjItNS41LTEuMy04LjItMy40LTMuOC05LjctNS40LTE0LjMtNy4zLTEuNy0uNy00LjctMS40LTUuOS0yLjgtLjItMS4xIDItLjEgMi40IDAgMi43IC44IDUuNSAxLjYgOC4yIDIuM3M2LjMgMS40IDkuMiAyLjhjMS4xIC41IDIuNSAxLjkgMy44IDEuNXMzLjUtMi45IDQuOS00IDQuNS0yLjIgNC41LTQuMS0xLjItMy4yLTEuOS00LjVjLTEuNi0yLjktMy4xLTUuOC00LjgtOC43LTYuNC0xMC43LTEzLjYtMjAuNi0yMC45LTMwLjgtMi4yLTMuMS00LjctNi40LTcuNC05LjEtLjctLjgtMS43LTIuNi0yLjgtMi45cy0xLjggLjgtMi41IDEuM2MtMS43IDEuNS0zLjQgMy4xLTUuMSA0LjctNS41IDUuNS0xMS41IDEwLjUtMTYuNSAxNi41LTEuNSAxLjctMy44IDMuNS00LjggNS43czIuMyA4LjIgMy41IDEwLjdjMy44IDguMiA2LjkgMTcuMSA5LjQgMjUuOCA0LjMgMTQuOSA3LjIgMzAuMiA2LjcgNDUuOC0uMiA1LS44IDkuOS0xLjYgMTQuOS0uMyAyLTEuMyA0LTEuMiA2IC4xIDIuOCAxLjQgNS43IDIgOC40IDEgNC43IDEuNyA5LjUgMi4yIDE0LjNzLS4yIDkuOS0uOCAxNC43Yy0xLjQgMTMtNC45IDI1LjYtMTAuNyAzNy4zLTEuNCAyLjgtMi43IDUuNy00LjMgOC41LTEgMS42LTIuNSAzLjQtMi45IDUuM3MuMiAzLjYgMS40IDQuOWM0LjEgNC4xIDEwLjYgNi44IDE1LjkgOSAxNyA3IDM1LjcgNyA1Mi45IDEzLjEgNi42IDIuMyAxMS41IDcuOSAxNS45IDEzLjIgMS45IDIuNCAzLjUgNS45IDYuMyA3LjNzNS43IC45IDguNSAxLjJjNiAuNSAxMi44IC41IDE4LjUgMi41IDQuOSAxLjcgNy42IDQuOSAxMS40IDguMXM3IDUuMiAxMC42IDcuNGM5LjEgNS40IDE5LjYgNy43IDI4LjMgMTMuNyA2IDQuMSAxMS4yIDkuNCAxNi41IDE0LjNzMTEgOS41IDE2LjMgMTQuNGM2LjYgNiAxNC44IDEyLjcgMjQuNCAxMS40IDguNC0xLjIgMTYuMy05IDIyLTE0LjcgMTItMTIuMSAyMy4yLTI0LjggMzUuMi0zNi44IDQuNi00LjYgOS05LjYgMTQtMTMuOCAxLjktMS43IDQuNy0zLjYgNy4zLTMuMiA3LjEgMS4yIDEyLjIgNy40IDE3LjEgMTIuMSAxMy4zIDEyLjIgMjYuMiAyNS43IDM3LjEgNDAuMiAyLjUgMy40IDUuMyA2LjcgNy42IDEwLjMgMS4xIDEuOSAyLjEgNSA0IDYuM3pNMTE5MS4zIDQ5MC45YzEuNy0xLjctLjItNi44LS43LTguOS0yLTguNi00LjgtMTcuOC04LjctMjUuOC03LTE0LjItMTUuNC0yNy41LTI1LjctMzkuNi01LjctNi45LTEyLjQtMTIuNi0xOC45LTE4LjZzLTEzLjgtMTEuMi0yMS4yLTE2LjRjLTIuNi0xLjktNS4xLTQuNC04LTYtMS44LS4zIC43IDIuOSAxIDMuMyAyLjYgMy4xIDUgNi42IDcuMiAxMC4xIDUuNiA5IDEwLjkgMTguMyAxNS43IDI3LjggNS43IDExLjIgMTAuNSAyMy42IDEzLjcgMzUuOCAxLjIgNC40IDIuNCA4LjggMy4yIDEzLjMgLjQgMi42IC43IDYuMSAyLjMgOC4yczQuOSAzLjIgNy4yIDQuMWM0LjcgMiA5LjMgNC4zIDE0IDYuMnM5IDMuNiAxMy42IDUuMmMxLjUgLjYgMy43IDEuOCA1LjMgMS4zek0zMzEuMiAzMTYuNWMtLjgtLjgtMS4zIC42LTEuNSAxLjItLjcgMS45LTEuMSAzLjktMS44IDUuNy0zIDcuOS01LjEgMTYuMy03IDI0LjUtNS4yIDIxLjYtOC40IDQzLjctOC40IDY1LjkgMCAzOC40IDExLjMgNzcuOSAzNi44IDEwNy4yIDcgOCAxNS4yIDE0LjUgMjMuNiAyMC43czE3LjMgMTAuOSAyNi44IDE0LjVjNS42IDIuMSAxMSA0LjQgMTYuOSA1LjZzMTIuMyAxLjUgMTguNSAxLjdjMi44IC4xIDYgLjcgOC44IC4zIDEuNC0uNy0xLTEuNC0xLjUtMS42LTMtLjctNS43LTEuNi04LjUtMi44LTcuMi0yLjktMTQuMy02LjQtMjAuOC0xMC43LTE5LjItMTIuMy0zMy40LTMwLjgtNDMuNS01MS0xMi41LTI1LjMtMTcuMi01My44LTE4LjEtODEuNy0uMi02LjUgLjEtMTMuMiAuNi0xOS43IC4yLTQgMS4zLTguNCAuOC0xMi41LS40LTMuMS0yLjYtNi4xLTMuNy05LTIuOC03LjUtNS42LTE1LTguMi0yMi42LTMtOC44LTUtMTcuOS03LjYtMjYuOC0uOS0yLjktMS02LjMtMi4yLTguOXpNMTE0NS44IDQ3MS42YzIuMi0uOC0uNC00LjgtLjktNi4xLTIuNi02LjItNS4yLTEyLjUtOC43LTE4LjMtNS44LTkuNC0xMS44LTE4LjktMTkuNC0yNy4xLTMuNC0zLjgtNy41LTctMTEuMS0xMC42LTQuNy00LjgtOS43LTguNi0xNS0xMi43LTIuNy0yLjEtNS41LTQuOC04LjYtNi4yLTEuNC0uMi0uNSAxLjctLjMgMi4zIDEuMSAyLjUgMiA1LjEgMi44IDcuNyAyLjEgNi4zIDMuNSAxMyA0LjYgMTkuNCAuMyAyLjIgLjIgNC40IDEuMSA2LjQgMi4yIDQuNCA3LjUgOC4xIDEwLjkgMTEuNiA4LjkgOC45IDE4LjEgMTcuNiAyOC42IDI0LjUgMy40IDIuMyA3IDQuMSAxMC4zIDYuMyAxLjYgMSAzLjggMi43IDUuNyAyLjh6TTY2My4xIDM5Ni4xYzEuMyAuMyAuOCAzLjQgMS4zIDQuNXMxLjUtLjMgMi4xLS44YzEuNi0xLjUgNC41LTIuOSA1LjUtNC45IC42LTEuMyAuMS0yLjctLjMtMy45LTEuMi0zLTItNy41LTQuMy05LjgtMS4zLS42LTIuNiAxLjItMy42IDEuOS0yLjYgMi4xLTUuMSA0LjUtNy45IDYuMy0xLjEgLjgtMy4xIDEuNS0zLjUgM3MxLjkgNS41IDIuOCA3LjJjLjMgLjcgLjggMS41IDEuNyAxLjUgMi41LS4xIDMuOS00LjIgNi4yLTV6TTE1MDIgMzk0LjFjNS4xIDAgNS42IDcuNCAuNiA3LjZzLTUuNS03LjEtLjYtNy42ek02ODUuMiA0MjUuMWMuOSAuNiAuOC01LjIgLjgtNS45IC4zLTMuNCAxLTkuNi0xLjQtMTIuNC0xLjUtLjgtMi44IDMuNC0yLjkgNC41IDAgMi40IDEuNiA1IDIuMSA3LjNzLjQgNC43IDEuNCA2LjV6TTE1MDguMiA0MjEuOGMtMi45LTQuMyAzLjEtOC42IDYtNC42cy0yLjggOC40LTYgNC42ek0zNzguOCA1MDcuMmMxLjMgLjYgMS4yLTIgMS4yLTIuNyAwLTMuMyAwLTYuNSAwLTkuOCAwLTguMSAuOS0xNi42IDIuMy0yNC42IC45LTUuNCAxLjctMTAuNyAyLjgtMTYgLjUtMi4zIDEuOC01LjQgMS42LTcuOC0uMS0xLjYtMS43LTMuNC0yLjYtNC43LTItMy00LTYtNS44LTkuMS00LjctOC4yLTkuNS0xNi4yLTEzLjgtMjQuNS0yLjMtNC41LTQuMS0xMS03LjYtMTQuNy0xLS41LS45IDEuNy0uOSAyLjIgMCAyLjQtLjUgNC43LS41IDctLjEgMTAuMS0uMyAyMC41IC45IDMwLjYgMi4zIDE5LjMgNS43IDM4LjQgMTMuNCA1Ni4zIDEuOSA0LjMgMy45IDguNiA2LjEgMTIuNyAuOSAxLjcgMS42IDMuNyAyLjkgNS4xek02NzQuMyA0ODkuNWMuNSAuOSAxLjEtLjkgMS4zLTEuMyAuOC0yIDEuNi00IDIuMi02IDEuNy01IDMuNC0xMC4xIDQuMS0xNS40IDEuNi0xMi42IDIuMi0yNC45IC4zLTM3LjYtLjUtMy4yLTEuMS02LjEtMS45LTkuMy0uMy0xLjItLjMtMi43LTEuMy0zLjZzLTIuMyAzLjItMyAzLjktMS42IC45LTIuMyAxLjUtMS41IDIuMS0yLjIgMy4xYy0xLjUgMS45LTQuMyA0LjEtNC40IDYuNy0uMSAzLjcgMi4zIDguMSAzLjIgMTEuNyAyIDcuOSAzLjIgMTUuOSA0LjUgMjQgLjggNS4xIC41IDExIC4xIDE2LjItLjEgMi0xIDQuMS0uNiA2LjF6TTEwNzIgNTAwYy4yIDEuMyAxLjcgMi4xIDIuNiAyLjkgMi44IDIuNSA1LjggNC43IDguOCA3IDEyLjcgOS41IDI2LjEgMTcuMSA0MC40IDI0IDI2LjcgMTIuOSA1NS44IDIyLjQgODQuOCAyOC40IDE0LjEgMyAyOC4zIDQuNyA0Mi42IDYuOSA5LjQgMS40IDE4LjkgMi4yIDI4LjQgMi4zIDMuNSAwIDcuMSAxIDEwLjYgLjMgNS42LTEgMTEuNi01LjUgMTYuNy04IDMuNi0xLjcgOC4yLTMuMSAxMS4zLTUuNyAuMy0uOC0uNi0xLTEuMi0xLjItMS44LS42LTMuNi0uOS01LjMtMS40LTcuNy0yLjItMTUuNi0zLjYtMjMuMi02LjEtMjAuNS03LTQxLjUtMTIuOC02MS4yLTIyLTE1LjEtNy4xLTMwLjQtMTQuMi00NC44LTIyLjctMTcuOC0xMC42LTM0LjgtMjIuMy01MS4xLTM1LjItOS44LTcuNy0xOS0xNi41LTI4LjEtMjUtMy0yLjgtNS42LTYtOC40LTguOS0xLTEtMi0yLjUtMy4zLTMuMS0xLjMgMC0uNiA1LjctLjYgNi43IDAgNy41IDAgMTQuNy0xLjIgMjIuMS0xLjcgOS45LTUgMTkuNS05LjkgMjguMy0xLjUgMi41LTMuMSA0LjktNC45IDcuMS0uOSAxLTIuNyAyLTMgMy4zek0xNTE1LjQgNDM5LjRjMy44LTMuMyA4LjkgMi41IDUuMiA1LjZzLTguNi0yLjItNS4yLTUuNnpNMzA1LjQgNDc3LjNjMS45IC4yIDEuNC0yLjQgLjctMy4zLTIuMi0yLjktNS4zLTUuMi03LjYtOC4yLTIuOS0zLjgtNS45LTcuOS04LTEyLjMtMS41LTMuMi0yLjUtNy4zLTQuNi0xMC4xLTEuMS0uOCAuNiAzLjcgLjcgNC4yIDEgMi43IDIuMyA1LjMgMy41IDcuOCAyLjcgNS43IDYuMyAxMC42IDkuOSAxNS43IDEuNCAyLjEgMy4xIDUuMSA1LjQgNi4yek01NzUuNSA0NzUuMWMxLjEtLjYgLjctMS45IC42LTIuOS0uMy0yLjQtLjctNC44LTEuMi03LjEtLjYtMy4xLTEuMS04LjYtMy4xLTExLjEtMS4yLTEuNC0zLjYtMS43LTUuMi0yLjQtNC0xLjgtOC4xLTQuOC0xMi4zLTYuMS0xLjMgLjEtLjkgMS43LS42IDIuNiAuNyAyLjkgMS43IDUuOCAyLjUgOC43czEuMSA2LjQgMi43IDguNmMyIDIuOCA3IDQuOCA5LjkgNi41IDEuOSAxLjEgNC41IDMuNSA2LjcgMy4yek0xNTIyLjYgNDY5LjJjLTQuOS0xLjQtMy04LjkgMi4xLTcuNHMyLjcgOC4yLTIuMSA3LjR6TTMxNC45IDQ2MmMtMS4xLTEuMi0xLjcgMi40LTEuOCAzLTEgNC4yLTIuMyA4LjMtMy4zIDEyLjUtMi41IDEwLjctNS4zIDIxLjItNyAzMi01LjUgMzMuNC01LjYgNjYuNCAxLjIgOTkuNyAyLjEgMTAuNSA1LjQgMjEuMSA5LjQgMzEgMS4xIDIuNyAyLjcgOS41IDYuNiA4LjUgMS4yLS44LTEuNi01LjMtMi4xLTYuNC0zLjItNi42LTUuMi0xMy42LTcuMi0yMC41LTUuMS0xNy42LTctMzYtOC4yLTU0LjItLjItMy42IC40LTcuMSAuNS0xMC43IC41LTE2LjMgMy42LTMzIDguMi00OC43IDEuOC02LjEgMy44LTEyLjEgNi0xOCAxLjEtMi45IDMuMS02IDMuNS05LjEgLjItMS44LTEuMi0zLjctMS43LTUuNC0xLjItNC40LTItOS42LTQuMS0xMy43ek0xNTI0LjMgNDkxLjFjLTMuOC00LjIgMi45LTkuNCA2LjUtNS40cy0yLjYgOS02LjUgNS40ek01OTMgNTIzLjJjLjggLjUgMS0uNiAxLjItMS4xIC42LTEuOCAxLTMuNiAxLjMtNS40IC44LTQuMS0uMy03LjQtLjUtMTEuMy0uMS0zIC42LTYuNC0uMy05LjMtLjMtLjQtLjYtLjUtMS4xIDBzLTEuNSAyLjItMi43IDMuMS0yLjQgMS0yLjcgMi40IC43IDQuMiAxLjIgNmMuOSAzLjQgMS42IDYuOCAyLjQgMTAuMiAuNCAxLjcgLjQgMy45IDEuMiA1LjR6TTE1MjYuOSA1MDguOWM0LTMuNSA5LjUgMi4yIDUuNiA2cy05LjEtMi40LTUuNi02ek00MTQuNyA1NDUuNmMyLS41IDEuMy00LjMgMS4zLTUuOCAwLTQuMyAuNS04LjQgLjktMTIuNiAuMi0xLjctLjItMy43IC40LTUuMyAuNi0uNCAuOCAxLjEgLjggMS41IC40IDEuNyAuNiAzLjUgLjggNS4yIC42IDQuNSAxLjcgOS4xIDMuMiAxMy4zIDEgMyAxLjYgNy41IDMuNiA5LjlzNC44IDMuMSA3LjMgNGM0LjggMS43IDEwLjYgNS40IDE1LjkgNS4zIDEuNS0uNi0uMS0yLjgtLjYtMy42LTEuOC0zLjMtNC4yLTcuNi00LjgtMTEuMiAuMy0uOSAxLjUgMS40IDEuNiAxLjYgMSAyLjIgMi4xIDQuNCAzLjQgNi4zczIuOSA3LjMgNS45IDguNGMyLjMgMSA1LjEgLjEgNy41IC42IC44IC40LTQuNyAxLjQtNS40IDIuMi0uNCAxLjQgMS4xIDIuOSAxLjkgNCAyLjQgMy4yIDUuNSA2LjcgOC42IDkuM3M2LjIgMi44IDkuNyAzLjggNy40IDIuNCAxMC42IDQuNGM2LjEgMy43IDExLjUgOC41IDE2LjkgMTMuMSAyIDEuNyAzLjYgNC4xIDUuOCA1LjVzNy0xLjQgNy42LTMuNmMtLjEtMS4yLTEuMy0xLjktMi4xLTIuNy0xLjktMS44LTMuOS0zLjYtNS41LTUuNy03LjItOS0xNS42LTE3LTIyLjItMjYuNi03LTEwLjMtMTQuMS0yMC43LTIwLjItMzEuNS0xLjktMy40LTMuNi02LjktNS4zLTEwLjQtLjktMS44LTEuNi0zLjgtMi45LTUuNC0zLjYtMy45LTkuMS02LjctMTMuMy05LjktOS42LTcuNC0xOS4zLTE1LjQtMjcuNS0yNC4zLTYuOS03LjctMTMuNi0xNS40LTIwLTIzLjUtMS44LTIuNC0zLjctNC44LTUuNS03LjMtLjgtMS4xLTEuNy0yLjgtMi45LTMuNi0xLjYtLjEtMiA1LjUtMi4yIDYuOC0xLjEgNy41LTIuOSAxNC44LTMuOCAyMi40LS44IDUuOC0uNyAxMS42LTEuMyAxNy40LS42IDUuMS0xLjMgMTEuOCAuNSAxNi43IC45IDIuMyAyLjkgNC40IDQuMyA2LjMgMy42IDQuOCA3LjggOS4xIDEyLjEgMTMuNCAzLjMgMy40IDYuNyA2LjEgMTAuNiA4LjkgMS4yIC45IDIuNyAyLjUgNC4zIDIuN3pNMTQ2OS4yIDUxMi44Yy40LS43LS45LS4zLTEuMi0uMi0xLjUgLjQtMy4xIC45LTQuNiAxLjMtNC4xIDEtOC4xIDEuOS0xMi4yIDIuOC0xMS44IDIuNi0yMy43IDQuOC0zNS40IDguMS0zNS4yIDEwLjEtNjkuMiAyMy43LTEwMi4yIDM5LjYtNzIuMyAzNC42LTEzOC42IDc5LjUtMjAwLjggMTI5LjktMTggMTQuNi0zNS43IDI5LjktNTIuMSA0Ni4yLTQuMiA0LjItOC45IDgtMTMuMiAxMi4zLTEuMyAxLjMtMy40IDIuNi00LjMgNC4yLS4xIDEuMyAyLjggLjUgMy41IC40IDQuMi0uNSA4LjQtLjkgMTIuNS0xLjcgNS44LTEuMSAxMS44LTEuOSAxNy42LTIuNiAyLjYtLjQgNi41LS40IDguNi0xLjkgMy44LTIuNyA3LTYuOCAxMC4yLTEwLjEgNi40LTYuMyAxMi45LTEyLjcgMTkuNy0xOC42IDI0LjItMjAuOSA0OC45LTQxLjYgNzUuMy01OS42IDE1LjItMTAuNCAzMC4zLTIwLjkgNDUuOS0zMC42IDE4LjYtMTEuNSAzNy42LTIyLjUgNTYuNS0zMy42IDI3LTE2IDU0LjYtMzEuNCA4Mi43LTQ1LjUgMjEuMi0xMC41IDQyLjgtMjAgNjQuNi0yOS4yIDYuOC0yLjggMTMuOC01LjEgMjAuNi03LjggMi41LTEgNi4zLTEuNSA4LjMtMy40ek0xMDc4LjUgNTEzLjZjLjUgNC4zIDIuOCA5LjEgNCAxMy40IDIuMSA3LjEgMy42IDE0LjUgNS4zIDIxLjcgMyAxMy41IDUuMyAyNy4xIDcuNCA0MC43IDIuNyAxNy40IDUuOCAzNC43IDcuNyA1Mi4zIDEuMiAxMS4zIDMuMSAyMi45IDMuMSAzNC40IDAgNC4xIC4xIDguMiAuNCAxMi4zIC4xIDEuNC0uMiAzLjIgLjYgNC41IDEuNSAuNyA0LjgtMi43IDUuOS0zLjYgNS4xLTQuMyAxMC4yLTguOSAxNS43LTEyLjggMTgtMTMuMyAzNS40LTI3LjMgNTQtMzkuOCA1LjQtMy42IDEwLjctNy4zIDE2LTExIDEuOC0xLjIgNC45LTIuMyA1LjktNC4zIC4xLTEuNy0zLjEtMy44LTQuMi00LjktNC41LTQuNS05LjItOC43LTEzLjgtMTMuMi0xMi4zLTEyLjMtMjQuOS0yNC44LTM4LjEtMzYuMS02LjktNS45LTE0LTExLjYtMjAuNi0xNy43LTUuMS00LjctMTAuNy04LjktMTYuMS0xMy4yLTYuNy01LjMtMTMuMy0xMC44LTIwLjctMTUuMy0zLjItMi02LjMtNC4zLTkuNS02LjMtLjUtLjMtMi43LTIuNC0zLTEuMXpNMTAxOC41IDc2MC4zYzEuNSAuOCAzLjYtNC44IDQuMS02IDMuMS03LjQgNS41LTE1LjEgNy45LTIyLjggNi44LTIyLjggOS44LTQ2LjUgMTIuNC03MC4xIC41LTQuNSAxLTkuMyAxLjEtMTMuOSAuMS01LjMtLjQtMTEuMiAuNy0xNi40IC42LTEuMiAuOCA0LjEgLjggNC43IDAgMy4xIC4yIDYuNC0uMiA5LjUtLjYgNC40LS4xIDguOC0uMyAxMy4yLS4zIDUuMi0xLjIgMTAuNS0xLjUgMTUuOC0uNSA4LjYtMiAxNy4zLTMuMyAyNS45LTEuOCAxMS4xLTMuOCAyMi41LTcuMiAzMy4zLTEuOSA2LjUtMy45IDEyLjktNi4yIDE5LjMtLjcgMi0zIDUuMi0yLjQgNy4zIDEuOSAyLjMgNS44LTEuOSA2LjktMy4zIDUuNS02LjMgMTAuNy0xMi45IDE1LjUtMTkuOCAxMy4yLTE5LjEgMjItNDEuOSAyNi45LTY0LjUgMS44LTguMSAyLjktMTYuMyA0LjEtMjQuNSAuNC0yLjgtLjEtNS44IC45LTguNSAuOS0xIC40IDQuMSAuNCA0LjYtLjMgMy4zLS4zIDYuNC0uOCA5LjctMS42IDkuOS0zLjIgMTkuNy01LjkgMjkuMy01LjMgMTguNS0xMi41IDM2LTIyLjcgNTIuNC0zLjYgNS43LTcuOSAxMS4xLTEyIDE2LjQtMS41IDItNC45IDQuNC01LjYgNi43IC4zIDEgMS43IC43IDIuNCAuNCAxLjgtLjcgMy4yLTIuNCA0LjUtMy43IDYuNC02LjQgMTMuNC0xMi4xIDE5LjktMTguNCAxMC42LTEwLjQgMjIuMy0xOS43IDMzLTMwIDIuMi0yLjIgNC44LTQuMiA3LjMtNi4yIDEuNS0xLjIgMy0yLjIgMy4yLTQuMyAuOC02LjggLjMtMTQuNC0uMy0yMS4yLTEtMTAuOC0xLjctMjEuNS0zLTMyLjMtMi0xNy43LTUuMy0zNS4yLTguOS01Mi42LTQtMTguNy04LTM3LjYtMTMuOS01NS45LTMuNC0xMC42LTcuMy0yMi0xMy42LTMxLjMtMy40LTUtOC4xLTguOS0xMi40LTEzLjEtMi4xLTItNC4zLTMuOC02LjMtNS44LTEtLjktMi0yLjUtMy4yLTMuMS0yIDAtMS4zIDQuOC0xLjQgNi0uNyA2LjUtMS45IDEzLTMuMSAxOS41LS44IDQuMiAuMSA4LjEgLjYgMTIuM3MxIDkuOCAxLjEgMTQuNmMuMSAxMS42IC43IDIzLjYtLjEgMzUuMi0uNCA3LjEtMS40IDE0LjItMS45IDIxLjNzLTIuMiAxNS4xLTMuNyAyMi41Yy0yLjIgMTAuNy00LjQgMjEuNi03LjkgMzEuOS0yLjEgNi40LTQgMTIuOS02LjQgMTkuMS0xLjQgMy43LTMuNSA3LjYtNC4zIDExLjUtLjkgNSAuNiAxMS4zIDEuMiAxNi40IDEgOC44IDIgMTguMiAyLjEgMjcuMSAuMSA5LjkgMSAxOS44IDEgMjkuNyAwIDMuMi0xLjIgOS40IC41IDEyLjF6TTE1MzIuNiA1MzEuNGM0LjEgMy45LTEuMiAxMC4zLTUuNCA2LjRzMS4xLTkuNyA1LjQtNi40ek0xMTI0LjEgNTM3LjhjMS41IDIuMiA1LjMgMy43IDcuNSA0LjggNi4zIDMuMSAxMi42IDUuOSAxOSA4LjggMjkuNCAxMy4zIDYxLjcgMjAuOCA5My43IDI0LjcgNy45IDEgMTUuOCAxLjggMjMuOCAyLjUgNS4zIC40IDExLjYgLjkgMTUuNy0zLjQgLjQtMS01LjUtMS4yLTYuNC0xLjItNi44LS4yLTEzLjctLjQtMjAuNC0xLjMtMTguNi0yLjYtMzcuMi00LjYtNTUuNS05LjEtMTcuMy00LjItMzUuNC04LjYtNTEuOS0xNS41LTUuNy0yLjMtMTEuNC00LjUtMTctNy0yLjItLjktNC4zLTIuMi02LjYtMy4xLS4zLS4yLTEuOS0xLTEuOS0uMnpNMTEzNi4xIDU0Ny44YzEuMyAyLjIgNC40IDMuOCA2LjIgNS40IDQuNCAzLjYgOC42IDcuNCAxMyAxMSA1LjkgNC44IDExLjQgMTAuMSAxNy4yIDE1IDcuMiA2LjEgMTQuNSAxMS45IDIxLjYgMTguMiA1IDQuNCAxMC4xIDguOSAxNS40IDEzIDEuNiAxLjIgMy4zIDMuNyA1LjQgNC4yczMuNy0xLjggNS4xLTIuNWMzLjgtMi4yIDcuNS00LjUgMTEuMi02LjggMS41LS45IDMuNy0xLjcgNC42LTMuMnMtMi4xLTIuNy0zLjEtMy40Yy0zLjUtMi43LTcuMS01LjUtMTAuNS04LjMtNC42LTMuOC05LjQtNy42LTE0LTExLjUtMy0yLjYtNi4zLTYuMi05LjgtOC4xLTIuOC0xLjYtNi43LTIuMS05LjctMy02LjEtMS44LTEyLjMtMy43LTE4LjEtNS45LTcuOC0yLjktMTUuMy02LjEtMjIuOS05LjMtMi45LTEuMi01LjktMi42LTguNy00LjEtLjQtLjItMi44LTEuOS0yLjktLjd6TTE1MjcuMSA1NjEuOWMtNS4yLTEuMS00LjEtOC42IDEuMy03LjhzNCA4LjItMS4zIDcuOHpNMTQwOC4yIDU2Ni44Yy40LS45LTEuNi0uMy0xLjktLjMtMi4xIC41LTQuMiAuOS02LjMgMS4yLTUuNyAxLTExLjUgMS45LTE3LjMgMi4zLTYuNiAuNC0xMy4yIDEtMTkuOSAxLTQuMyAwLTkuNy0uOC0xMy44IC4zLTIuMyAuNi00LjQgMi4xLTYuNSAzLjItMyAxLjUtNi42IDIuNy05LjIgNC44LS44IDEuNCA1LjIgLjcgNS45IC43IDYuNi0uMiAxMy4yLTEuMyAxOS43LTIuMSAxMi4yLTEuNSAyNC4zLTQuMSAzNi4yLTcuMyAzLS44IDYtMS41IDktMi4zIDEuNC0uMyAzLS41IDQuMS0xLjV6TTQ2MS40IDU3OC4yYzEuMi0uNS0uOS0xLjktMS4zLTIuNC0yLTItMy43LTQuMy01LjUtNi41LTEuMS0xLjItMi0zLjMtMy41LTMuOXMtMy42LS4yLTUuMyAwYy0yLjcgLjMtNS42IC42LTguMyAuNnMtNi4zLS44LTguNCAuNWMtMS4zIDIuMyAxLjcgNC4xIDMuNSA0LjQgNi42IC45IDEyLjkgMi43IDE5LjMgNC42IDIuOSAuOSA2LjUgMi44IDkuNSAyLjd6TTc1My42IDU2OC40YzEuMSAxLS41IDIuMy0xLjEgMy4xLTIgMi43LTQuNyA0LjktNyA3LjMtNy4zIDcuMi0xNS41IDE1LjUtMjQuNSAyMC41LTIuNCAxLjMtNi4xIDUuMS05LjEgNC4zLTEuMi0xIDIuNC0yLjkgMy4xLTMuMyA1LjEtMyA5LjgtNi42IDE0LjMtMTAuNSA1LjktNSAxMS42LTEwLjYgMTYuNC0xNi42IDItMi41IDQuMS02IDcuOS00Ljh6TTQxOC41IDU3MS43YzEuMSAuOSA1LS41IDYtMS41IDEuNC0zLjYtMy4yLTUuNy02LjEtNS4zLTEuNyAxLS43IDUuMyAuMSA2Ljh6TTMyMy45IDY0NS43YzEuMiAuNSAxLjctMS4yIDItMiAxLTIuOCAyLjUtNS41IDMuOC04LjIgMy42LTcuMSA3LjItMTUuMSAxNC4yLTE5LjUgOC43LTUuNiAxOS40LTQuNiAyOC4xIC43IDIuMyAxLjQgNC43IDIuNyA2LjkgNC4zIDEuNCAxLjEgMyAyLjggNC44IDMuMiAxLjItLjIgLjktMS40IC44LTIuMy0uMy0yLjMtLjUtNC41LS44LTYuNy0xLjUtOS44LTIuNi0yMC40LTIuNy0zMC4zLS4xLTcuOCAwLTE1LjUgMC0yMy4zIDAtMyAuOC03LjMtLjMtMTAuMXMtNC42LTMuNC02LjYtNC43Yy01LjctMy45LTExLjctNy44LTE2LjYtMTIuNi05LjQtOC45LTE3LjgtMTguNC0yNC42LTI5LjQtMi4xLTMuNC00LjMtNy01LjktMTAuNi0xLjEtMi42LTIuMy02LjMtNC4yLTguNC0xLjItLjYtMS41IDEuMi0xLjggMi0uOCAyLjYtMS45IDUuMS0yLjkgNy42LTQgMTAuNS03LjIgMjEuOC05LjEgMzIuOS0yLjIgMTMuMi00LjUgMjYuMy00LjUgMzkuNyAuMSAxNi44IDMuNiAzMy40IDguMiA0OS41IDIuMSA3LjIgNC40IDE0LjggNy43IDIxLjUgMSAyLjEgMS45IDUuMSAzLjUgNi43ek0xMjA2LjcgNTczLjVjLjQgMS40IDMgMi42IDQuMSAzLjUgMy40IDIuNyA2LjUgNiAxMC4xIDguNiA0LjUgMy4xIDguNyA2LjkgMTMgMTAuMiAxLjYgMS4yIDMuNiAzLjYgNS43IDMuOCAyLjcgLjMgNi44LTMuNCA5LjEtNC43IDUuMS0zLjEgMTAuNS02IDE1LjgtOC45IDIuMS0xLjEgNC45LTIgNi43LTMuNyAxLTEuOC01LjItMS4zLTYuMS0xLjQtNi44LS44LTEzLjgtMS42LTIwLjYtMS45LTkuNS0uNC0xOS40LTIuNi0yOC44LTQuMi0yLjMtLjQtNC41LTEtNi43LTEuNS0uNy0uMS0xLjgtLjQtMi4zIC4yek0zODUgNTUzLjdjLTEuMyAxLTEgMy4yLTEgNC43IDAgNC4zIDAgOC41IDAgMTIuOCAwIDEyLjggMS42IDI1LjUgMi45IDM4LjIgLjYgNS4yIC42IDExIDEuOCAxNiAuOCAxLjIgMS4zLTEuNSAxLjQtMS45IC41LTIuNSAxLjEtNC45IDEuNi03LjQgMS41LTYuNSAzLjktMTIuOSA2LjMtMTkuMiAyLTUuNCA0LjUtMTEuOSA4LjMtMTYuNCAxLjYtMS44IDMuOC0zLjMgNS44LTQuNiAuOS0uNiAyLjEtMSAyLjUtMiAuOC0xLjcgLjQtOC4zLS43LTkuOHMtMy4xLTEuMi00LjQtMS42Yy0zLjktMS03LjgtMi0xMS41LTMuNHMtNi4zLTIuNy05LjQtNC4yYy0xLjEtLjUtMi40LTEuNi0zLjYtMS4yek0xNTIxLjUgNTc4LjNjNC4zLTMuOCA5LjUgMi41IDUuNCA2LjJzLTguOC0yLjUtNS40LTYuMnpNNzExLjEgNjM1YzEuOS0uOSAuNy01LjYgLjUtNy4yLS43LTcuNS0uOC0xNC4yLTguNS0xNy44LTIuNC0xLjEtNi4xLS44LTguNy0xLTQuMy0uNC04LjUtMS4yLTEyLjktMS41LTIuNi0uMS01LjggLjUtOC4zLS43cy00LjctNS02LjUtNy43Yy0yLjMtMy43LTUuMi03LjQtOC42LTEwLjEtNi41LTUuMi0xMy41LTUuNy0yMS4zLTcuMi02LjUtMS4yLTEzLjEtMi40LTE5LjUtMy44LTMuNC0uNy02LjgtMS43LTEwLjEtMi43LTEuMy0uMy0zLTEuMy00LjMtLjgtMS45IDEuNi0uMyA2LjUgMCA4LjYgLjggNi45IDEuNSAxMy43IDIuOCAyMC40IC40IDIgLjUgNS41IDIuNCA2LjcgMy4yIDIgOS4zIDEuNSAxMy4xIDEuOSA3LjcgLjkgMTUuMyAyLjggMjMgNCAxNS4xIDIuMyAzMC43IDYuOSA0NS4zIDExLjggNC42IDEuNiA5LjQgMi45IDE0LjEgNC43IDIuMiAuOCA1LjIgMi40IDcuNSAyLjR6TTE0NTUuMSA1ODkuN2MuMS0xLjQtMi4yIDEuOS0yLjUgMi4yLTEuNSAyLTMuMiAzLjctNC44IDUuNi00LjggNS44LTEwIDExLTE1LjMgMTYuMy0xNS40IDE1LjMtMzMuMiAyOS43LTUxLjYgNDEuNC0xNyAxMS0zNC4zIDIxLjUtNTIuMSAzMS4yLTE5LjkgMTAuOC00MC45IDE5LjctNjEuOSAyOC4xLTEyLjQgNS0yNS40IDkuNi0zOC4zIDEzLjUtNC40IDEuMy04LjggMi44LTEzLjMgMy45LTMgLjgtNi41IDEuMi05LjMgMi42LTEuMSAxIDEuNiAuNyAyLjEgLjcgMi41LS4zIDUuMS0uMyA3LjctLjYgNi42LS43IDEzLjctLjYgMjAuMy0uNiAzLjEgMCA2LjcgLjYgOS43IC4xIDEuOS0uMyAzLjYtMS40IDUuNC0yLjEgMy44LTEuNCA3LjYtMi44IDExLjQtNC4zIDExLjQtNC43IDIyLjctOS42IDMzLjktMTQuOSA0NS44LTIxLjYgODkuNy00OS4zIDEyNS42LTg1LjIgOC43LTguNiAxNi45LTE3LjYgMjQuNy0yNy4xIDIuNi0zLjIgNi44LTYuOSA4LjMtMTAuOHpNNTI2LjMgNjQ5LjhjMS4xLS41LS40LTEuMS0uOS0xLjQtMi4zLS45LTQuNC0xLjktNi41LTMuMi00LjctMi45LTguOS02LjEtMTEuMy0xMS4yLS44LTEuNi0xLjgtMy42LTEuNC01LjUgLjUtLjcgMS40IDMuMyAxLjcgNCAxLjQgMyAzLjQgNC44IDUuOCA2LjkgNS42IDUgMTIuOSA4LjYgMjAuMyA5LjcgMyAuNCA3LjIgLjYgOS40LTEuOHMtMS4yLTYuOC0zLjItOC44Yy0zLjUtMy42LTcuMi02LjgtMTAuNy0xMC4zLTEuMy0xLjMtMi4xLTIuOS0zLjMtNC4yLTIuMi0yLjQtNC44LTQuMi03LjItNi4zLTcuNy02LjYtMTUuMS0xMy40LTIyLjktMTkuOS00LjEtMy40LTguMS03LjEtMTIuOS05LjUtOS4xLTQuNS0yMC01LjgtMjkuNi04LjctMTAuNS0zLjItMjAuOS04LTMxLjktNC40LTQuMSAxLjQtOSAzLjYtMTEuOSA2LjktNy4yIDgtMy4zIDE5LjcgNC44IDI1LjUgMTEuMiA4IDI1LjMgOC41IDM4LjUgMTAuMiA0LjEgLjYgOC4yIC44IDEyLjEgMi4yIDYuOCAyLjMgMTIuNSA3IDE4LjMgMTEgOC40IDUuNyAxNy4yIDExLjYgMjYuNyAxNS4yIDQuNiAxLjcgMTEuMSA0LjUgMTYuMSAzLjZ6TTU0NyA1OTQuM2MtMS4xLTEuOS02LjQgLjYtOCAxLjItNi4zIDIuNi0xMi4yIDUuNi0xOC4xIDguOS0xLjcgLjktNS40IDIuMi02IDQuMiAuMiAxLjQgMiAyLjYgMy40IDIuNyAzLjkgLjIgOC0xLjIgMTItMS4zczYuOS0uNSAxMC4zLS45YzEuNC0uMSAzLjUgLjMgNC42LS42cy44LTIuNiAuOC0zLjdjLjEtMy40IDEuMy03LjEgMS0xMC41ek0xNTIwLjIgNjA3LjVjLTQuOSAxLTYuNC02LjQtMS44LTcuM3M2LjMgNiAxLjggNy4zek01MjEuNSA2MTUuM2MuOSAyLjQgNCA0LjIgNS45IDUuOCA1LjUgNS4xIDExLjMgMTAuNCAxNS45IDE2LjMgMS44IDIuMyA0IDQuOCA0LjEgNy45IC4xIDQuOC00LjYgNi4yLTguNCA3LjItOC43IDIuMi0xOS41IDAtMjcuOC0yLjctMTEuOS0zLjgtMjEuNy0xMS42LTMyLjItMTguMS0zLjktMi40LTguNC03LTEzLTcuOC0yLjktLjYtNi43IDEuMy05LjUgMS45LTguNyAyLTE3LjIgNS0yNS42IDguMS01LjIgMi0xMC40IDQuMS0xNS41IDYuMy0xLjcgLjctNC43IDEuNS01LjggM3MyLjcgMy44IDQgNC44YzQuNSAzLjUgOS4xIDcuNCAxMy4yIDExLjUgMTQuOCAxNC45IDMwLjIgMjkuOCA0MS44IDQ3LjQgMy43IDUuNyAxMS4zIDEzLjcgNyAyMC45LTIgMy40LTUuOCA0LjItOS40IDQuMi02LjggMC0xMi43LTIuNC0xOC44LTUuMi0xMy4zLTYtMjMuOC0xNy40LTM0LjctMjYuOC05LjEtNy44LTE5LjMtMTQuNS0yOS42LTIwLjYtNS45LTMuNi0xMi4xLTYuOS0xNy45LTEwLjYtMi40LTEuNS01LjItNC41LTcuOS0yLS43IDEuNSAzLjggMy4xIDQuOCAzLjYgNS41IDMgMTAuNyA2LjMgMTYgOS41IDE0LjMgOC42IDI4LjEgMTcuNiA0MS4zIDI3LjggMy44IDIuOSA2LjkgNi42IDEwLjcgOS41IDEuMyAxIDIuNCAyLjEgMy42IDMuMiAzLjkgMy42IDExLjkgOS4zIDcuOCAxNS42LTIuMyAzLjUtNy40IDQtMTEgNC04LjQgMC0xNi45IC42LTI0LjktMi42LTE0LjItNS43LTI2LjYtMTQuMy00MC0yMS41LTEwLjMtNS42LTIxLjUtMTAtMzIuNC0xNC4xLTQuNi0xLjctOS4zLTQuMy0xNC01LjQtMi4yLS42LTQuNiAyLjUtNi4xIDMuOC0zLjkgMy4zLTcuNyA2LjgtMTEuNyAxMC0xLjYgMS4zLTQuNCAzLjEtNC45IDUuMiAuMSAxLjIgMS4zIDEuNCAyLjMgMS42IDIuNCAuNiA0LjggMS4yIDcuMiAxLjggMy42IC44IDcuMSAyLjQgMTAuNSAzLjcgNC44IDEuNyA5LjYgMy4yIDE0LjIgNS40IDMuNiAxLjggNi40IDQuNCA0LjMgOC42LTEuOCAzLjUtNi4yIDQuNi05LjUgNi4zLTEyLjQgNi4xLTI2LjUgNC4zLTM5LjcgMy4xLTMuNi0uMy03LjItLjQtMTAuOS0uNC0xLjcgMC0zLjctLjItNS4yIC44LTMuMSAxLjktNS42IDUuOC03LjkgOC42LTMuNSA0LjItNy4zIDguMi0xMC43IDEyLjYtMTIuNCAxNi0yNC43IDMxLjgtMzUuOCA0OC44LTMuOCA1LjgtNy40IDExLjctMTEuMSAxNy41LTEuMSAxLjYtMy43IDQuOS0xLjcgNi43IDMuNSAzLjEgOSAxLjggMTIuOCAuMyAxMC4yLTQgMTkuOS05LjggMjkuNi0xNC43IDI4LjctMTQuNCA1Ni44LTI5LjggODUuMy00NC41IDgtNC4xIDE2LTguNSAyNC0xMi43IDMtMS42IDctNS4xIDEwLjQtNS41IC42IC4yLS4zIDEtLjYgMS4yLTEuNCAxLjEtMyAyLjEtNC41IDMtMy41IDIuMy02LjkgNC42LTEwLjMgNi45LTEwLjMgNi45LTIwLjMgMTQuNC0zMC45IDIwLjktOC45IDUuNC0xNy4zIDExLjctMjUuOSAxNy41LTExLjQgNy43LTIyLjkgMTUuMi0zNC4yIDIyLjktNy43IDUuMy0xNS42IDEwLjQtMjMuMyAxNS43LTMuNyAyLjUtOC4xIDUtMTEuMyA4LjItNi4yIDYuMi0xLjcgMTQuOCAyLjIgMjAuOSAxMC40IDE2LjUgMjAuMiAzMy41IDMxLjMgNDkuNiAyLjYgMy43IDUuMSA3LjUgNy41IDExLjMgMSAxLjUgMi4zIDQuMiAzLjkgNXMyLjktLjUgNC0xYzMuNS0xLjggNi45LTMuNyAxMC4zLTUuNSAxNC4yLTcuNSAyOC4xLTE1LjYgNDIuNC0yMi45IDU3LjEtMjguOCAxMTQuMi01Ny40IDE3NC41LTc5LjEgNTMtMTkgMTA3LTM1LjUgMTYyLjItNDYuOSAxNC40LTMgMjguOC01LjggNDMuMi04LjcgNS43LTEuMSAxMy43LTIuMiAxNi44LTcuOSAyLjQtNC4zIC41LTguNy0xLjUtMTIuOC0yLjctNS4zLTUuOS0xMC42LTktMTUuNy0xLjUtMi40LTMuOS00LjgtNC45LTcuNSAuMS0xLjEgMS4yIDAgMS41IC4zIDEuMSAxLjEgMS43IDIuNCAyLjYgMy41IDIuNSAzIDQuNyA2LjIgNy41IDkgOS4zIDkuNiAxNi45IDE5LjIgMzEuMSAyMC42IDEwLjEgMSAyMC43LTIuNCAzMC42LTMuOCAxOC44LTIuNiAzNy42LTUuMyA1Ni41LTcuMiAzLjktLjQgNy44LS42IDExLjctMSA0LjUtLjUgOS4zLTEuNiAxMy44LS43IDEgLjQtNS4yIDEuMS02LjIgMS4zLTQuNyAuNy05LjUgMS4yLTE0LjIgMS41LTEzLjQgLjgtMjcuMiAzLjEtNDAuNSA1LjNzLTI3LjcgNC4yLTQxLjMgNy41Yy02LjEgMS41LTEyLjQgMy43LTEyLjEgMTEuMSAuMiA0LjggMy4yIDkuMSA1LjUgMTMuMnMzLjkgNy41IDYuMiAxMS4xYzEuMyAyLjIgMy44IDQuNyA0LjMgNy4yLS4yIDEuNS0yLjQtMS43LTIuNy0yLjEtMi4zLTMuMS00LjctNi4yLTcuNC05LjEtNi45LTcuNi0xNC0xOC4zLTI0LjQtMjEuNHMtMjEuMyAwLTMxLjQgMmMtMTguMiAzLjctMzYuNCA3LjItNTQuNiAxMS40LTQ4LjQgMTEuMi05NS43IDI2LjYtMTQyLjQgNDMuNi00OSAxNy44LTk3LjQgMzkuMS0xNDMuNiA2My40LTIwLjYgMTAuOS00MS40IDIxLjUtNjIgMzIuNC01LjkgMy4yLTExLjkgNi4xLTE3LjYgOS41LTEuOCAxLTQuOCAxLjgtNS44IDMuNi0uMiAxLjIgLjggMiAyIDEuOSAzLjYtLjIgNy43LTEuMSAxMS4yLTEuOSAxNC43LTMuNSAzMC01LjggNDUtNy42IDM5LjMtNC44IDc4LjQtMTAuOCAxMTcuOC0xNC4yIDM1LjQtMyA3MS43LTYuMSAxMDcuMS0uNyAxNSAyLjMgMjkuOSA0LjcgNDQuOSA2LjkgMy45IC42IDcuNyAxLjMgMTEuNiAxLjkgMS42IC4zIDMuOSAxLjEgNS41IC42czIuOC0yLjMgMy45LTMuNWMzLTIuOSA1LjgtNi4yIDktOC45IDUuOC00LjkgMTEuMS0xMC41IDE2LjYtMTUuNyA2LjgtNi4yIDE0LjEtMTEuOSAyMS4xLTE3LjkgMTAuMS04LjcgMjEuMS0xNi43IDMyLjItMjQuMSAyNS4zLTE3IDUxLjUtMzIuNiA3OS40LTQ1LjEgMTguMi04LjIgMzYuOC0xNiA1NS44LTIyLjIgMTAuOS0zLjUgMjEuOS02LjUgMzIuOS05LjggOC4xLTIuNCAxNi4zLTQuMyAyNC41LTYuMyAyLjMtLjUgNy41LS44IDktMi45IC4zLTEuNi0xLjUtMy4yLTIuNS00LjMtMi43LTMuMy01LjUtNi41LTguMS05LjktMTEuNS0xNS4zLTI2LjEtMjgtMzkuNi00MS40LTE1LjYtMTUuMy0zMy44LTI4LjEtNTEuOC00MC41LTM3LjgtMjUuOS04MC4zLTQ1LjMtMTI0LjQtNTcuOC0xNy4yLTQuOC0zNC44LTguOS01Mi42LTExLjItMjUuNy0zLjMtNTEuMi00LjktNzcuMS0zLjYtNi4xIC4zLTEyLjEgLjYtMTguMiAxLjMtMS4yIC4yLTUuMi0uNC01LjMgMS41ek00NTYuMiA2MjJjLjYtMS4yLTMuNC0xLjItNC4xLTEuMy0yLjctLjUtNS40LS41LTguMS0uOS0xLjUtLjItMy4xLS42LTQuNCAuM3MtLjUgNSAuNiA2LjNjMS4yIC41IDMtLjQgNC4yLS44IDIuNy0uOCA1LjQtMS42IDguMS0yLjQgMS4yLS4zIDIuNy0uNCAzLjctMS4yek0xNTEwLjQgNjI4LjZjLTMuNy0zLjcgMi40LTguOCA1LjktNS40cy0yLjEgOC43LTUuOSA1LjR6TTc4OC41IDY3My4xYy45LS4yLS45LTEuNi0xLjEtMS44LTItMS42LTMuNy0zLjQtNS41LTUuMS00LjctNC44LTkuOS05LjEtMTQuNy0xMy44LTYuMS01LjgtMTIuOS0xMi40LTIwLjItMTYuNi01LjgtMy4zLTEyLjUtNC45LTE4LjUtNy44LTIuOC0xLjQtNS43LTIuNy04LjMtNC40LTEuNy0xLjEtMy4zLTIuOC01LjItMy41LTEuNSAuMS0uOSAyLjktLjcgMy44IC42IDMuMiAuNyA2LjMgMS4xIDkuNSAuMiAxLjYgMCAzLjQgMS43IDQuMyA0LjMgMi4zIDkuNCAzLjYgMTMuOSA1LjYgOS40IDQuMSAxOC44IDguNSAyNy45IDEzLjQgNi44IDMuNiAxMy42IDcuNCAyMC4zIDExLjIgMi45IDEuNiA2LjIgNC4zIDkuMyA1LjJ6TTQxNCA2MzUuNmMtLjEgMS40IDEuNCAuNiAyLjEgLjMgMi4xLTEgNC4zLTEuNyA2LjQtMi42IDMuNi0xLjUgNy40LTIuNiAxMS00IDEuMS0uNSAzLjEtMSAzLjUtMi4zcy0uMi02LjctMS4yLTcuOS0yLjYtMS4xLTMuOC0xLjQtMi43LS44LTQtLjEtMyAzLjMtNC4yIDQuOGMtMiAyLjctMy45IDUuNi02IDguMy0xLjIgMS42LTMgMy4xLTMuOCA0Ljl6TTQ1NS45IDcyNy40Yy41LS40LTEtMS40LTEuMi0xLjYtMS44LTEuNC0zLjgtMi43LTUuNC00LjMtMy41LTMuMy02LjktNy45LTguNy0xMi40LS42LTEuNS0xLjUtMy4yLTEuNC00LjlzMiAzLjEgMi4yIDMuNmMxIDIuNCAyLjYgNS4xIDQuMyA3IDUuMSA2LjQgMTYgMTguMyAyNS4yIDEzLjEgNC40LTIuNCAzLTcgLjktMTAuNS0yLjQtNC4zLTUuNi04LjQtOS4xLTExLjktMi4yLTIuMi01LjMtNC40LTcuMS02LjktLjUtMS40IDIuNiAuNyAzIC45IDEuMS0uMS0xLjItMi41LTEuNS0yLjktMi4yLTIuOS00LjctNS45LTcuMi04LjUtNi42LTYuNy0xMi43LTEzLjctMTkuNC0yMC4zLTEwLjctMTAuNy0yMi41LTIwLjItMzQuNC0yOS40LTguMi02LjUtMTYuNS0xMy41LTI1LjYtMTguN3MtMjIuNy02LjMtMjkuNiAzLjkgMS44IDI0LjcgOS44IDMxLjJjMTIuNSAxMC4yIDI3IDE3LjUgNDAuNiAyNi4xIDkuOCA2LjEgMTguOSAxMyAyNy43IDIwLjRzMTYuOCAxNiAyNy4xIDIxLjZjMi44IDEuNSA2LjUgNCA5LjggNC41ek0xMzgwLjMgNjUxLjJjLjUtMS4yLTUuMiAwLTYgLjItMy44IC43LTcuOCAxLjEtMTEuNyAxLjEtMTIuNyAwLTI1LjEtLjItMzcuNi0yLjgtMTUuNC0zLjItMjkuOC05LjEtNDMuNy0xNi4zLTQuNS0yLjQtOS00LjktMTMuMi03LjctMS44LTEuMi00LjMtMy44LTYuNC0zLjlzLTMuOCAxLjctNS4zIDIuNmMtMy42IDIuNC03LjUgNC41LTExLjEgNi45LTEuMiAuOC0zLjEgMS41LTQuMSAyLjZzLjUgMi42IDEuMyAzLjNjMi41IDIuMSA1IDQuMSA3LjYgNS45IDExLjIgOCAyMi4zIDE2LjIgMzQuNiAyMi40IDkuNiA0LjkgMTkuNCA5LjYgMjkuNyAxMyA0LjIgMS41IDkuMyAzLjQgMTMuOCAzLjQgMS45IDAgMy42LTEuMiA1LjItMi4xIDIuOS0xLjcgNS44LTMuMiA4LjctNC44IDgtNC43IDE1LjktOS43IDI0LTE0LjMgMy4zLTEuOSA2LjMtNC4xIDkuNS02LjMgMS41LTEgMy41LTEuOCA0LjctMy4yek0xNTAzLjcgNjQ1LjJjMy41LTMuOCA4LjkgMS40IDUuNiA1cy04LjUtMS4xLTUuNi01ek0xODAuNCA4NDUuMmMxLjIgLjYgMi0xLjQgMi4yLTIuMyAuOC0zLjUgMi4xLTkuNiA1LjctMTEuMyAuNi0uOS0uOS0yLjUtMS40LTMuMi0xLjgtMi42LTMuOC01LjEtNS43LTcuNy04LjItMTAuOC0xNS43LTIyLjMtMjQuMS0zMi45LTEwLjctMTMuNS0yMC4xLTI3LjktMzAuNC00MS43LTE0LjQtMTkuMi0yOC41LTM4LjUtNDIuNy01Ny44LTcuMy0xMC0xNC4zLTIwLjItMjEuOC0zMC0yLjYtMy40LTQuNS03LjMtNy40LTEwLjQtMS4xLS43IC4yIDEuNSAuMyAxLjcgMS4yIDEuOCAyLjQgMy42IDMuNiA1LjQgMy4yIDUgNi44IDkuOCAxMC4xIDE0LjcgOS42IDE0LjQgMTkuNiAyOC43IDI4LjYgNDMuNCAxOSAzMC45IDM5LjIgNjEgNTguNCA5MS43IDUuMiA4LjMgMTAuMyAxNi44IDE1LjIgMjUuMyAyLjkgNC45IDUuNiAxMC45IDkuNCAxNS4xek05MzguOSA2NjFjMS4xIDQuOCA0LjkgOS4zIDYuNiAxMy45IDEuNSA0IDIgMTAuNSA0LjcgMTMuOCAxIC42IDEuNC0uOCAxLjYtMS41IC42LTEuOSAxLjktNC4yIDEuMy02LjItMS41LTQuNy02LjItOS40LTguOC0xMy42LTEuMi0xLjgtMi40LTMuNS0zLjgtNS4yLS4yLS4yLTEuNS0yLjItMS42LTEuMnpNMTQ5NC44IDY2N2MyLjItNC4yIDguNC0xLjIgNi45IDMuMXMtOC43IDEuNC02LjktMy4xek04MzYuNiA2NjUuM2MtLjgtLjYtMS41IC40LTIuMSAuOS0xLjYgMS41LTQuMyAyLjUtNS4xIDQuNi0xLjggNC4zLS4xIDEwLjctLjUgMTUuMy0uMyA0LTIuNSA4LjUtMi4zIDEyLjUgLjEgMS45IDIgMy42IDMuOCA0IDIuMS0uNSAyLjItNi41IDIuNS04LjIgMS4yLTYuNyAyLjQtMTMuMyAzLjItMjAgLjMtMi43IDEuNi02LjUgLjUtOS4xek00MTYgNzM2LjdjLjktLjYtLjYtMS4zLTEuMS0xLjUtMS44LTEtMy42LTEuOS01LjMtMy00LjItMi42LTguMy01LjktMTAuOC0xMC4xLS45LTEuNS0yLTMuNS0xLjUtNS4yIC41LS40IDEuOSAzLjIgMi4yIDMuNyAxLjQgMi40IDMuNiA0LjUgNS44IDYuMiA3LjQgNS45IDE1LjEgOS45IDI0LjYgMTAuNiAzLjUgLjMgMTEuMS0xLjQgOS4zLTYuNC0uNS0xLjQtMS44LTIuNC0yLjgtMy4zLTIuMy0yLjQtNC43LTQuOC03LjUtNi43LTQuMS0yLjktOS44LTUuNC0xMy4xLTkuMS0uNS0xIDEuMS0uMiAxLjUtLjEgMS41IC44IDMuMiAyLjQgNC45IDIuNyAxLS40LTEuOC0yLjQtMi4xLTIuNy0yLjgtMi4yLTUuNy00LjMtOC41LTYuNS03LjYtNi4yLTE2LjEtMTEuNy0yNC41LTE2LjctMTUuMS05LjItMzAuNS0xNy44LTQ2LjMtMjUuNy02LjQtMy4zLTEyLjctNy4zLTE5LjQtOS44LTkuNi0zLjctMTkuMS0uMy0yMy45IDguOXMuNiAxOS40IDkgMjQuNWMxNC40IDguNyAzMS4zIDEzLjQgNDYuOCAxOS45IDExLjEgNC43IDIxLjIgMTEuMSAzMS43IDE3IDcuNiA0LjMgMTQuMyA5LjMgMjIuNyAxMS44IDIuNCAuNyA1LjggMiA4LjMgMS41ek03OTQuMSA2NzYuOGMxLjUgMi4yIDUuMSAzLjYgNy4zIDUuMSA0LjkgMy4zIDkuNSA3IDE0LjYgMTAuMSAyIDEuMiA0LjUgNC41IDYuOSA0LjUgMS40LS41IDEuNS0zLjMgMS44LTQuNiAuOS0zLjcgLjMtNy43IC4zLTExLjQgMC0xLjYgLjQtMy44LS42LTUuMi0xLjItLjgtMy43IDEuNS00LjkgMi0zLjkgMS43LTggMi43LTEyLjIgMi43LTMuMiAwLTUuOS0uNS04LjgtMS43LS41LS4yLTQuNS0yLjMtNC40LTEuNXpNMTQ4NS40IDY4Ny4yYzMuNS0yLjcgNy43IDIgNC41IDUuMXMtNy43LTEuOS00LjUtNS4xek0xMzE1LjkgNjg4LjZjLjQtMS4xLS45LTEuNS0xLjctMS44LTIuMy0uOS00LjYtMi03LTIuOC05LjktMy42LTE4LjktOC44LTI4LjItMTMuOC0xMS45LTYuMy0yMi45LTE0LjUtMzMuOC0yMi40LTIuOS0yLjEtNS43LTQuMy04LjYtNi41LTEtLjctMi4yLTItMy42LTEuOS0zLjEgLjItNy41IDQuMy0xMC4xIDYtOC42IDUuNy0xNy4xIDExLjQtMjUuNiAxNy4yLTI2LjMgMTguNC01Mi40IDM4LjEtNzYgNTkuOC02LjkgNi40LTE0IDEyLjUtMjAuNiAxOS4yLTIuNSAyLjUtNi4yIDUuMS04IDguMi0uMyAxLjUgNC44IC4yIDUuNyAuMiA2LS40IDEyLjEtMi4xIDE4LjEtMi45IDE2LjQtMi4xIDMyLjgtNS4yIDQ5LjMtNyAxMy4xLTEuNSAyNS43LTUuNCAzOC41LTguNyAyNS4zLTYuNyA1MC4xLTE1LjUgNzQuMy0yNS42IDkuMy0zLjggMTguNS03LjcgMjcuNS0xMi4yIDIuOS0xLjQgNy42LTIuNiA5LjgtNXpNODQ1LjIgNjU2LjFjLTUuMiA1LjItNC4zIDEzLTUuNiAxOS45LTEuMSA2LjItMS42IDEyLjYtMi45IDE4LjgtLjcgMy4yLTIuMyA3LjYtMS41IDEwLjlzNi43IDYuNyA5LjUgOS4yYzkgOC4zIDE4IDE2LjUgMjYuNiAyNS4xIDYuNSA2LjUgMTIuNiAxMy41IDE4LjUgMjAuNSAxLjUgMS44IDMuMSAzLjQgNC41IDUuMiAuNiAuOCAxLjMgMS45IDIuMyAxLjkgMS44IC4xIDQuOS0zLjUgNi4yLTQuNiAxNC4xLTEzLjEgMjUuNi0yOS45IDM1LjMtNDYuNCAzLTUuMSA2LTEwLjMgOC4xLTE1LjkgLjUtMS40IDEuNC0yLjggMS42LTQuM3MtLjQtMi44LS43LTQuM2MtLjktNC44LTIuNS05LjItNC4xLTEzLjgtMi44LTguMi02LjctMTYuMS0xMS4xLTIzLjQtMS40LTIuNC0yLjQtNS00LjEtNy4yLTQuNy02LjEtMTAuOS0xMS4yLTE2LjQtMTYuNnMtMTQuOS0xNC45LTIzLjYtMTMuNC0xNS41IDkuMi0yMSAxNS43Yy0yLjIgMi42LTQuOCA0LjctNy4xIDcuMi00LjggNS4yLTkuNSAxMC41LTE0LjUgMTUuNXpNMTQ3OS4xIDcxMi43Yy0zLjIgNC04LjYtLjctNS42LTQuN3M4IC44IDUuNiA0Ljd6TTMwOC44IDcyNS40YzEtLjYgMi4yLS40IDMuMi0uNyAxLjItLjktNC0yLjMtNC43LTIuNS01LjItMS41LTEwLjYtMi43LTE1LjktMy42LTEyLjMtMi4xLTI3LTIuNC0zOS4yIDEuMS01LjUgMS41LTExLjkgNS0xMiAxMS43LS4xIDYgNC40IDEwLjkgMTAgMTIuMyA3LjEgMS45IDE0LjgtMSAyMS45LTEuMiAxMC45LS4zIDIxLjcgMi4zIDMyLjUgMiA0LjEtLjEgOC41LS42IDEyLjYtMS43IDEuMy0uNCAzLjEtLjYgNC4xLTEuNnMtMi44LTEuMi0zLjYtMS4yYy0zLjQtLjEtMTAuNi0uOS0xMi42LTQuMiAwLS44IDEuNSAuMSAxLjkgLjMgMiAuOCA0LjIgMS41IDYuMyAxLjkgNC45IDEgOS43IDEuNCAxNC42IC4xIDEuOS0uNSA0LjYtMS41IDUuMi0zLjdzLTEuNy0zLjUtMy4zLTQuMmMtNC43LTItOS43LTMuNS0xNC43LTQuMS0xLjctLjItMy4zIDAtNS0uMi0uNCAwLTEuNCAwLTEuMy0uNXpNMTQ2NS4yIDczMi45Yy00LjkgLjItNS42LTYuOC0uOS03LjJzNS42IDYuNSAuOSA3LjJ6TTE0NDkuMSA3NDcuM2MuNy00LjQgNi45LTMuNyA2LjcgLjZzLTYuOSA0LjMtNi43LS42ek05NTYuNCA3NTkuNGMtLjMtLjgtMS40IC4yLTEuOCAuNC0xLjkgMS40LTMuMyAzLjMtNSA0LjgtMi40IDIuMi01LjQgNC4xLTggNi4xLTEuMiAuOC0yLjggMS42LTMuNSAyLjkgMCAuOSAxLjYgLjQgMi4xIC4yIDIuMy0uNCA0LjgtLjQgNy4xLTEuMSAxLjUtLjUgMi4yLTEuOCAyLjktMy4xIDEuNi0zLjEgNS43LTYuOCA2LjItMTAuMnpNMTQ0MSA3NjcuN2MtMy4zIDMuMS04LjEtMS01LjEtNC42czguMyAxIDUuMSA0LjZ6TTEwMDkuNyA2ODYuNmMtMS0xLjMtMS45IDEuMS0yLjIgMS44LTEuMyAyLjktMi43IDUuOC00LjIgOC41LTMuOCA3LjEtOCAxMy45LTEyLjQgMjAuNy05LjIgMTQuMS0yMS4yIDI2LjEtMzAuMSA0MC4yLTIuNSAzLjktNi44IDguNS03LjkgMTIuOSAuMSAxLjkgNC4yIC41IDUuNSAuNCA2LS44IDEyLjEtMS45IDE4LjEtMi45IDguOS0xLjQgMTcuOC0yLjYgMjYuNy00IDIuNC0uNCA0LjgtLjggNy4yLTEuMSAuOS0uMSAyLjItLjEgMi45LS44cy43LTMuOCAuNy01LjNjMC00LjIgMC04LjUgMC0xMi43IDAtMTQuMy0xLjMtMjguNy0yLjktNDIuOS0uNC0zLjMtLjgtNi44LTEtMTAuMS0uMi0xLjYgLjEtMy4zLS40LTQuN3pNNjY0LjIgODk4LjRjLS40IDEuMiAzLjctMS40IDQuMS0xLjcgMi42LTEuOCA1LjQtMyA4LTQuNyA3LjctNSAxNi4yLTkgMjQuNC0xMy4xIDI1LTEyLjUgNTEuMi0yMS45IDc3LjUtMzEuMyAxMS4yLTQgMjIuOC02LjkgMzQuMy05LjkgMTkuOS01LjIgMzkuOS05LjYgNjAuMS0xMy41IDE0LTIuNyAyOC4yLTQuMSA0Mi4zLTYuNCAyMi4yLTMuNyA0NC4zLTguMiA2Ni41LTExLjUgNC4zLS42IDguNi0xLjYgMTIuOS0yLjIgMi43LS4zIDUuNC0uMiA4LjEtLjggOS42LTIgMTktNS4xIDI4LjUtNy42IDQuOC0xLjIgOS42LTIuNSAxNC40LTMuNSAxLjctLjMgNC4xLTEuMyA1LjgtLjkgLjUgLjYtMi4xIDEtMi41IDEuMi0yLjggLjgtNS42IDEuNC04LjMgMi4xLTcuNSAyLTE0LjkgNC4xLTIyLjIgNi40LTEwLjEgMy0yMC4xIDYuNC0zMC4yIDkuNi0xMi4xIDMuOC0yNC42IDcuNC0zNi40IDEyLjMtMTguMSA3LjUtMzcgMTMuMy01NS4zIDIwLjUtMzMuNiAxMy4zLTY2LjggMjcuNi05OS41IDQzLTEzLjcgNi40LTI3LjIgMTMuMi00MC44IDE5LjktNC43IDIuNC05LjMgNC42LTEzLjkgNy4xLTEuNyAxLTMuOCAxLjYtNS4yIDIuOXMzLjcgLjcgNC40IC43YzQuOS0uMSA5LjgtMSAxNC43LTEgOC41IDAgMTcuMS0xIDI1LjYtMS41IDQuOS0uMiA5LjcgLjMgMTQuNi0uMyA0LjEtLjYgOC40LS4yIDEyLjYtLjIgNy43IDAgMTUuNSAwIDIzLjIgMCAyNS45IDAgNTEuNyAuNSA3Ny41IC41IDg3LjYgMCAxNzYuNS04LjYgMjU5LjUtMzguMyAyOC4zLTEwLjEgNTcuNC0yMS43IDgyLjgtMzggMjMuNy0xNS4yIDQ3LjItMzAuMyA2NS44LTUxLjkgNC43LTUuNCA5LjYtMTAuOCAxMi43LTE3LjMgMS0yLjEgMi42LTQuOSAyLjEtNy4zLS45LTMuNC02LjEtNi4xLTguOC03LjctOS44LTUuOC0yMC41LTguNi0zMS41LTExLjMtMTQuNi0zLjYtMjkuOC00LjQtNDQuNy00LjctMTEuNC0uMy0yMi45LS43LTM0LjMgLjEtMTguOSAxLjItMzcuNCA0LTU2LjIgNi43LTUxLjMgNy41LTEwMi44IDE0LjYtMTU0IDIzLTI2LjEgNC4zLTUyLjMgNy40LTc4LjMgMTIuNS01MS43IDEwLTEwMi40IDI1LjYtMTUwIDQ4LTI4LjYgMTMuNC01NS41IDI5LjUtODEuMiA0Ny44LTcuMSA1LjEtMTQuMyAxMC4xLTIxIDE1LjgtMi41IDIuMS02LjEgMy45LTguMSA2LjV6TTE0MjYuMiA3ODUuMWMtMy40IDMuMS04LjMtMS4yLTQuOC00LjVzOCAxIDQuOCA0LjV6TTMyMC45IDc5MC4xYy41LTEuMi0xLjUgMC0xLjkgLjItMi4zIDEuMS00LjUgMi41LTYuNyAzLjgtNS4zIDMuMi0xMC45IDYuMS0xNi40IDktMTAuNyA1LjktMjEuNiAxMS40LTMyLjQgMTcuMS01LjYgMi45LTEyLjIgNS41LTE3LjIgOS40LS4yIC4zIDIuNiAuNSAzLjMgLjcgMi4yIC40IDIgMS42IDMuNCAzIDEuMiAuNCAzLjUtMS4zIDQuNS0xLjkgNC4xLTIuMyA4LTUgMTItNy41IDExLjgtNy42IDIzLjMtMTUuNiAzNS4xLTIzLjMgMy44LTIuNSA3LjctNC44IDExLjYtNy4yIDEuNS0xIDMuNS0xLjggNC43LTMuM3pNMTQxMC41IDgwMi43Yy0zLjcgMi45LTcuNS0yLjUtNC4xLTUuM3M3LjMgMi4yIDQuMSA1LjN6TTk4NC41IDgwOC45YzEuMS0xLTIuNC0uNS0yLjctLjQtMy4yIC42LTYuMyAxLjItOS41IDEuOC04LjIgMS42LTE2LjQgMy4yLTI0LjYgNC42LTE3LjYgMi45LTM0LjYgNy40LTUxLjkgMTEuOS03LjMgMS45LTE0LjcgMy41LTIxLjkgNS44LTE1LjkgNS4yLTMyIDkuNi00Ny45IDE1LjEtMzkuOSAxNC03OS40IDMwLTExNi4zIDUwLjktMTIuMiA2LjktMjQuMiAxNC0zNS43IDIyLTMuMiAyLjMtNi40IDQuNi05LjUgNy0xLjMgMS0zIDItMy45IDMuNC0uMiAxLjQgNS44LS42IDYuNy0uOCA3LjMtMS44IDE0LjUtMy42IDIxLjktNS4yIDguNS0xLjggMTcuMi0zLjUgMjUuOC00LjggNC4yLS43IDktLjggMTMtMi4xczgtNC42IDEyLjEtNi42YzExLjMtNS45IDIyLjUtMTIuNCAzNC4yLTE3LjUgOS41LTQuMSAxOC41LTkuMSAyNy45LTEzLjQgMzIuOS0xNSA2Ni4xLTI5LjcgMTAwLTQyLjQgMTkuNi03LjMgMzkuMi0xNC40IDU4LjgtMjEuNCA1LjItMS45IDEwLjUtMy42IDE1LjgtNS4zIDIuNS0uOCA1LjQtMS4zIDcuNy0yLjZ6TTEzOTUuNiA4MTguNWMtMy4zIDMuMi03LjgtMS00LjctNC40czcuNiAxLjEgNC43IDQuNHpNODk5IDgyMi45YzEuMS0uOS0yLjMtLjQtMi43LS4zLTIuNSAuNC00LjkgMS4xLTcuNCAxLjYtNyAxLjMtMTQgMi40LTIxIDMuNy0yMS4zIDMuNy00Mi41IDguOC02My4yIDE0LjgtNDcuOSAxMy42LTk1IDMxLjQtMTM3LjggNTcuMi0xMi42IDcuNS0yMy45IDE2LjktMzQuMyAyNy4yLTIuNCAyLjQtNC43IDQuOC03LjEgNy4xLTEuMSAxLjEtMi44IDIuMy0zLjUgMy44IC4xIDEuNyA1LjYgMS45IDYuOSAyLjEgNy4xIDEuMSAxNC4yLTIuOCAyMS00LjkgMy40LTEuMSA1LjktNC4yIDguNi02LjQgNC45LTQgMTAuMi03LjQgMTUuMS0xMS4yIDEzLjEtMTAgMjguMy0xOC42IDQyLjktMjYuMSAzOC45LTE5LjkgNzkuMS0zNi44IDEyMC43LTUwLjMgMTEuOC0zLjggMjMuNi03LjggMzUuNi0xMC45IDYuMS0xLjUgMTIuMi0zLjMgMTguMi01IDIuNi0uOCA1LjYtMS4xIDgtMi40ek0xMzc4LjUgODM0LjRjLTMuMiAzLjEtNy4yLTEuMS00LjMtNC4zczcuNSAuNyA0LjMgNC4zek0xMzYxLjEgODUwLjJjLS44IC43LTEuNiAxLjUtMi43IDEuNS0yLjktLjEtMy42LTMuNy0xLjktNS40IDMuMy0zLjQgOC4yIC4yIDQuNiAzLjl6TTE3OS40IDg2NGMtMS4xIC4xLTEuOSAxLjMtMi43IDItMS45IDEuNi00IDIuOS02IDQuNS02LjEgNC44LTEzIDkuMy0xOS43IDEzLjMtMTkuOCAxMi0zOC41IDI1LjctNTguMSAzNy45LTcuMSA0LjQtMTQgOS4xLTIxIDEzLjYtMy44IDIuNC04LjkgNC42LTEyLjEgNy45LS41IDEuMSAzLjUtMS4xIDMuOS0xLjQgMi41LTEuNSA1LTMgNy42LTQuNCA3LjQtNC4yIDE1LjItOC4zIDIyLjQtMTIuOSAxMS4xLTcgMjMuMS0xMy4xIDM0LjgtMTkuMiAxMy43LTcuMyAyNy4xLTE1LjEgNDEtMjIgMi42LTEuNCA1LjEtMi45IDcuNy00LjQgLjgtLjQgMS45LS40IDIuNi0xIDEuNC0xIDIuMS01LjYgMi4xLTcuMnMtLjEtNS45LTIuNS02Ljd6TTEyNDcuNCA4ODEuMWMuMy0xLjEtMS4xLS40LTEuNS0uMi0xLjkgLjktMy42IDItNS40IDIuOC01IDIuMi0xMC4xIDQtMTUgNi0xNC44IDYuMS0zMCAxMS00NS4zIDE1LjUtNDYuMyAxMy44LTkzLjkgMjMuNi0xNDIuMyAyNS44LTI5LjggMS4zLTU5LjQgLjktODkuMi0xLjEtMTUuMS0xLTMwLjMtMi45LTQ1LjQtNC44LTI4LjktMy41LTU4LjEtNi4zLTg3LjItOC4xLTExLjctLjctMjMuOC0uMi0zNS41IC41LTEyLjcgLjctMjUuNCAxLTM4LjEgMi40LTI1LjYgMi44LTUxLjQgNi40LTc2LjIgMTMuNy02IDEuOC0xMiAzLjQtMTcuOSA1LjQtMi4yIC43LTUuMiAxLjEtNy4yIDIuNC0uNiAxLjIgMy45IDEuNSA0LjYgMS42IDUuNSAxLjEgMTEuMSAyIDE2LjcgMi45IDE0LjEgMi4yIDI4LjEgNC45IDQyLjMgNy4yIDI0LjUgNC4xIDQ4LjkgOSA3My41IDEyLjggMTcuNyAyLjcgMzUuNiA0LjcgNTMuNCA3LjMgMjYuNCAzLjkgNTMuMSA1LjEgNzkuNyA1LjggODIuOSAyLjQgMTY5LjYtOS44IDI0NS43LTQ0LjMgMjMuNy0xMC44IDQ2LjUtMjMuMSA2OC0zNy44IDUuMS0zLjUgMTAtNyAxNS0xMC42IDIuMi0xLjYgNS43LTMgNy4zLTUuMnpNMTMxMS4zIDg5MC40Yy00LjEgMy4yLTcuOC0xLjctNC00LjlzNy44IDEuNSA0IDQuOXpNMTEzNC43IDg5MS44Yy40LTEtMi4xLS4yLTIuNS0uMS0yLjggLjctNS42IDEuMy04LjQgMi4xLTcgMi0xNC4yIDMuNi0yMS4zIDUtMjIuNCA0LjUtNDQuNyA5LjQtNjcuNCAxMi4xLTE3IDItMzQuMSAzLjktNTEuMiA1LTI0LjQgMS43LTQ5IDEuNi03My41IDEuNi0xNC45IDAtMjkuNi0uNS00NC41LS41LTUuNyAwLTEyLjItMS42LTE3LjgtLjMtMS4xIC43IDEuNSAuOCAxLjggLjggMi44IC4yIDUuNiAuNCA4LjQgLjYgNy4xIC40IDE0LjIgMS42IDIxLjMgMS45IDkuMSAuNCAxOC4xIDIgMjcuMSAyLjkgMTEuNSAxLjEgMjIuOSAyLjMgMzQuNCAzLjIgMTcuNSAxLjQgMzUgMi43IDUyLjYgMi45IDkuNCAuMSAxOC44LS43IDI4LjMtMSAxMS43LS40IDIzLjktLjUgMzUuNC0yLjggMTIuNy0yLjQgMjUuNC04LjggMzcuMi0xMy44IDkuNi00IDE4LjgtOC42IDI4LTEzLjMgMi43LTEuMyA1LjItMi44IDcuOS00LjEgMS40LS43IDMuMS0xLjEgNC4yLTIuMnpNMTI4Ny40IDg5OC40YzMuMS0yLjcgNy4zIDEuOSA0LjYgNC43LTMuNiAzLjctOC4xLTEuMS00LjYtNC43ek0xMjY2LjQgOTEyLjljMy42LTMgNy4xIDIgMy45IDQuOXMtNy40LTEuNi0zLjktNC45ek0xMjQ4LjEgOTMwLjljLTMuOCAyLjMtNi44LTMtMy4yLTUuM3M2LjUgMi43IDMuMiA1LjN6TTEyMjUuNyA5NDMuNGMtNC45IC4yLTUuNC02LjgtLjktNy4yczUuNiA2LjQgLjkgNy4yek0xMjA1LjMgOTU0LjZjLTQuOCAxLjQtNy41LTUuNC0yLjktNy4yczcuOSA1IDIuOSA3LjJ6TTI2MC41IDk1MS4xYzAtMi0yLjYtMy45LTMuOC01LjMtMy40LTQuMy03LjUtOC0xMC45LTEyLjQtNS4zLTYuOC0xMS41LTEyLjktMTcuMS0xOS41LTctOC4yLTE0LjEtMTYuNS0yMS43LTI0LjEtNS45LTYtMTAuMi0xMi42LTE5LjgtOS45LTMgLjgtMy44IDMuNy01IDYuMi0yLjggNS41LTUuMSAxMS4zLTcuOSAxNi44LTkuNiAxOS40LTE2LjEgNDAuOC0yMS42IDYxLjYtMS41IDUuNy0yLjkgMTEuMy00IDE3LjEtLjQgMi4yLTEuNCA1LjItLjggNy41IDEuMiAxLjcgNC44LS4yIDYuNC0uNiA2LjUtMS45IDEyLjgtNC4xIDE5LjItNi4zIDIxLjYtNy40IDQzLjUtMTMuOCA2NS4xLTIxLjEgNS43LTIgMTEuMi00IDE2LjYtNi42IDEuNy0uOCA0LjUtMS42IDUuMy0zLjR6TTExODMuNCA5NjQuNWMtNC40IDEuNS03LjUtNC40LTMuMi02LjVzNy45IDQuNCAzLjIgNi41ek0xMTYyLjEgOTczLjFjLTMuOSAzLjUtOS45LTEuOS01LjktNS40czkuMyAxLjYgNS45IDUuNHpNMTEzNy44IDk4My4zYy00LjcgMi4xLTguNS00LjYtMy42LTYuOHM4IDQuNCAzLjYgNi44ek0xMTE1LjQgOTkwLjhjLTMuOSAzLjMtOS43LTEuOS01LjUtNS42czkuMiAxLjkgNS41IDUuNnpNMTA5MS43IDk5OGMtMy43IDMuMy05LjItMS42LTUuNC00LjlzOC45IDEuMSA1LjQgNC45ek0xMDY3LjEgOTk5LjRjMy42IDQtMi40IDktNS45IDUuNHMyLjEtOC44IDUuOS01LjR6TTEwMzcuNCAxMDA1LjRjMy4zLTMgOC42IC44IDUuNCA0LjVzLTguNi0uOS01LjQtNC41ek0xMDE0IDEwMDkuMWM0LjgtMS40IDcuNiA1LjIgMi45IDYuNnMtNy41LTQuOC0yLjktNi42ek05ODYuOSAxMDEzLjljMy41LTMuMiA4LjUgMS44IDUuMiA1LjFzLTguNC0xLjQtNS4yLTUuMXpNOTY0LjIgMTAxNi4xYzUuMiAuMiA0LjQgNi44LS40IDYuOHMtNC4zLTYuNiAuNC02Ljh6Ii8+PC9nPjwvZz48L3N2Zz4='

    // 思考中那行的签名：矢量描线，`node tools/inject-sign.mjs` 负责填这一行。
    // 内联而不是外链，理由和上面两张图一样——客户端模块没有静态资源路由。
    const SIGN_MARKUP = '<svg class="cy-sign" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1341 619" preserveAspectRatio="xMinYMid meet" fill="none"> <g class="cy-sign-g" transform="translate(-43.0 -21.0)"> <path class="cy-sign-s" pathLength="1" style="--d:0.00s;--t:0.28s" d="M683 565c-.1-5.3-1.4-9.7 .3-15.1s5.7-9.6 9.5-14.1c11.6-13.7 28.3-24.4 44.2-32.5 5.6-2.9 12.1-3.1 17.6-5.9 3.9-2.1 6.9-6 9.5-9.5 3.7-4.8 3.4-10.3 5.4-15.8 2.2-6.3 5.4-12.5 7.9-18.7 8.6-21.1 17.8-42.1 25.2-63.6 1.5-4.2 2.5-8.5 3-12.8 .3-3-.2-6.1 .8-9 2.3-6 6.7-12.1 9.9-17.7-3 6-6.8 15.3-12 19.6-3.9 3.2-9.2 3.6-13.1 7-9.5 8.3-17.5 18.3-26.9 26.7-5.4 4.7-17.2 11.5-23 3.7-4.2-5.8-3.6-15.6-2.2-22.1 3.7-16.8 11.8-31.7 18-47.6 .1-.6 .1-.6-.1-.1-5.3 11.6-10.2 23.2-14.3 35.3-2.1 6.4-4.6 13.1-4.6 20-.1 9.3 3.3 20.7 14.9 17.3 6.6-2 12.2-7.3 17-12.1 5.7-5.7 11.3-11.3 17-17 4.2-4.2 10.5-10.4 17.1-8.8 2.2 2.2 1.4 5.1 .9 7.9-1.2 7.4-3.9 14.2-6.6 21.2-7.4 19-15.2 37.8-22.8 56.7-3.2 7.9-9.1 16.9-7.8 25.8 2.7 3.9 12.7 .3 16.3-1.1 16.3-6.2 32.7-12.9 49.5-17.6 .5-.1-1.1 .3-1.6 .5-1.7 .5-3.5 1-5.2 1.5-5.3 1.6-10.5 3.6-15.7 5.6-9.7 3.6-19.6 7.7-29.5 10.8-5.2 1.6-11.7 1-16.4 4-4 2.5-9.3 8.7-10.9 13.1s-1.7 8.4-3.8 12.4c-8.3 16.3-19.6 33.5-32.3 46.7-8.7 9.2-22 17.8-33.2 7.2-.2-.1 .3 .4 .5 .6s1.6 1.5 2.5 2.1c1.5 1.1 3.1 1.8 5 2.1 6.6 1.1 12.4-1.7 17.5-5.6 15.7-12 26.5-29.4 36.1-46.3 3.1-5.5 8.7-13.2 6.5-19.9-2.1-1.6-5.1-.5-7.5 .1-6.4 1.7-12.5 5.7-18.2 9-11.6 6.9-22.7 14.3-32.2 23.8-5.1 5.1-9.7 10.1-11.9 17.1-1.7 5.4-.4 9.8-.3 15.1" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.28s;--t:0.05s" d="M783 384c3.2-3.2 6.3-6.7 10.3-9-3.9 1.8-7.6 5.8-10.3 9.1" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.29s;--t:0.05s" d="M782 387c-5.3 4.4-10.1 10.1-15 15-.3 .3 .6-.6 .9-.9 1.3-1.3 2.6-2.6 3.9-3.9 3.4-3.4 6.8-6.8 10.2-10.2" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.30s;--t:0.33s" d="M831 395c2.4-5.7 5.2-11.3 8.1-16.7 1.4-2.5 2.5-5.7 4.6-7.8 3.3-3.4 9-3.9 12.9-6.6 4.5-3.2 8-8.9 14.3-8.5s7.8 7.4 12.6 10.1c2.8 1.6 6.2 1.5 9.3 1.5 5.4 0 11.9 .7 17-1.1s6.1-6.7 8.4-11c1.3-2.3 3.1-4.1 4.9-6 5.4-5.5 15.7-15.7 24.4-10.7 3.3 1.9 3.2 6 2 9.2-2 5-7 9.7-11.6 12.4s-10.5 4.8-15.9 4.9c-4 .2-8.3-2.3-11.2 1.7-1.8 2.7-1.8 6.1-1.8 9.1-.1 9.6 2.5 16 13.1 16.3 16.4 .4 32.4-14.7 43.7-24.8 3-2.6 5.5-5.8 8.8-7.9 8.7-5.8 20.6-5 29.3-11.4 7.7-5.8 15.9-21 27.2-18.7 3 2.5 1.3 7.9 .5 11.3-2.5 10.8-9.1 20.5-11.1 31.5-.6 3.7-1.8 11.5 2.7 13.4 9 3.8 20.3-7.7 25.8-13.2 2.7-2.7 5.4-5.8 8.8-7.6 2.6-1.4 6-1.9 7.8-4.3 2.7-3.7 1.6-9.9 3.5-14.2 5.8-13.2 11.4-26.7 25.2-33.8 5.4-2.8 14-4.1 19.5-.7 3.3 2.1 3.3 6.4 2.7 9.8-1.1 6.7-6.7 12.7-12 16.7-6.9 5.1-14.6 7.2-23.1 7.1-2.8-.1-7.6-2.2-10.2-1.2s-2.7 3.5-3.2 5.4c-1.7 5.9-1.1 13 .7 18.9 5.4 18.4 29.1 19.4 44.4 15.7 22.5-5.4 43.6-13.7 63.9-24.8 12.4-6.7 24.2-15.5 36.8-21.5-29.7 17.7-60.3 37.4-94.6 44.9-12.7 2.7-29.5 6-41.1-1.9-3.6-2.5-6.8-6.1-8.6-10.1-1.1-2.7-1.2-5.6-2.6-8.1-3.7-2.4-10.7 2.8-13.4 5.3-6.5 6-12.4 13.8-21.1 16.8-2.6 .8-6.2 1.9-8.9 .9-5.1-1.9-3.7-11.2-2.7-15.1 1.6-7.1 4.5-14.4 7.4-21 2.5-5.6 6-12.9 4-19.2-2.1-2.2-4.8-1.1-7.3-.3-5.2 1.7-8.7 5-12.4 8.8-3.1 3.3-5.6 7.3-9.4 9.8s-9.6 3.1-12.7 7.2c-2.2 2.9-2.5 6.9-3.7 10.3-1.6 4.8-4.3 9.4-6.7 13.8-.2 .6 .7-1.1 1-1.6 .9-1.6 1.7-3.2 2.5-4.8 2.2-4.6 6.4-11.5 4.3-16.7-2.3-1.7-5.1-.7-7.7 .1-6 1.8-9.6 5.9-13.9 10.1-9.1 9-20.5 18.3-32.6 22.9-5.6 2.2-12.6 3.3-18.4 .9-10.4-4.2-2.6-16.2-7.7-23-5.8-2.6-14.2 .3-20.6-.8-7.2-1.2-9.4-10.9-16.6-11.2-6.2-.4-9.6 5.7-14.2 8.7-3.8 2.6-9.5 3-12.7 6.4-1.9 2-3 5.2-4.3 7.7-2.9 5.5-5.7 11-8.1 16.7" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.64s;--t:0.05s" d="M914 364c2.7-1.5 5.8 .8 8.9 .6 4.4-.3 8.8-1.9 12.7-3.8 5.5-2.7 11.4-7.4 13.8-13.2 3.3-8.1-3.8-11.9-11-9.7s-15.5 9.6-19.5 15.9c-2.6 4-2.9 8.2-7 11.1 .2-.7 .2-.5 .2-.8" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.66s;--t:0.05s" d="M967 367c2.5-2.6 5.2-5 7.5-7.7-2.3 1.7-4.2 4.4-6.3 6.5-.7-.1 .8-1.1 1.3-1.6 1.2-1.5 2.6-2.8 4-4.1-1.8 2.5-4.4 4.7-6.5 6.9" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.68s;--t:0.05s" d="M991 353c.1-4.9 1-9.9 1-15 0-.3 0 .5 0 .8s0 2.7 0 3.6c-.1 3.6-.7 7.1-1 10.7" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.69s;--t:0.05s" d="M1047 375c2-2.1 4.2-4.1 6.1-6.3-1.7 1.6-3.2 3.4-4.9 5-.6 .2 .8-1 1.2-1.5s1.5-1.7 2.4-2.5c.1-.1-1.5 1.8-1.8 2.1-1 1.1-2 2.1-3 3.2" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.70s;--t:0.05s" d="M1070 344c4.1-1.2 10.3 1.1 14.9 1 10.1-.4 19.9-6.4 26.6-13.7 3.8-4.2 8.2-13.7 3.6-18.8-1.9-2.2-5.6-2.7-8.3-2.9-8.7-.7-15.7 4.2-21.9 9.7-3.8 3.4-7.5 7.4-9.7 12.1s-2 9.1-5.4 12.8c.1-.1 .1-.1 .2-.2" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.73s;--t:0.05s" d="M1094 343c4.4-1.8 8.6-3.3 12.2-6.7 .2-.4-3.6 2.2-4.2 2.6-2.6 1.7-5.2 3.1-8 4.3 0-.2 0-.1 0-.2" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.74s;--t:0.05s" d="M843 368c1.7-4 1.6-9.3 2.2-13.7-.7 4.1 0 11.4-2.1 14.8 .5-.8 .5-.4-.1-1.1" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.75s;--t:0.37s" d="M537 522c1.4-2.4 .9-4.8 1.1-7.6 .4-5.7 1.1-11.4 2.2-17 3.3-16.5 9-32.3 14.6-48.1 4.8-13.3 11.9-25.9 18.6-38.3 16.3-30.2 37.8-59.8 62-84.4 16.4-16.8 36.2-34.3 60.3-38.1 3.8-.6 7.7-.6 11.6 0 3.1 .4 6.1 1 8.9 2.5 16.3 8.7 13.4 29.2 5.7 42.9-5.5 9.8-12.9 17.9-19.6 26.8-.4 .6 2.1-2.3 2.3-2.5 1.7-1.9 3.3-3.9 4.9-5.9 4.5-5.3 8.5-11 11.8-17.1 7.7-14 12.1-36-5.5-44.3-2.9-1.4-5.9-2.1-9-2.5-14.8-2-28.4 4.9-40.6 12.5-27.4 17.2-48 43.5-66.9 69.3-6.3 8.6-12.5 17.4-18.1 26.5-1.8 3-5 6.1-5.6 9.6s2.4 6.9 5.3 8.9c7.8 5.4 15.2 11.5 23 16.8 33.2 22.7 67.7 40.7 104.9 55.8-2.6-2-6.4-2.6-9.4-3.9-8.5-3.6-17-7.2-25.4-11.1-21.3-10.1-42.1-21.8-61.7-34.8-9.9-6.6-18.6-16-29.1-21.5-2.9-1.6-5.7-4.7-9-5-4 2-5.7 7.8-7.5 11.5-5 10-9.5 20.1-13.4 30.6-10.4 28.7-18.1 58.1-15.6 88.9 1.6 18.5 5.8 36.1 18.3 50.5 5.2 5.9 11 11 17.7 15.2 42.2 26.2 92.3 10.1 132.9-10.8 .4-.3-2.6 1.3-3 1.5-2.1 1.1-4.4 2.1-6.6 3.2-6 3.1-12.2 5.9-18.5 8.4-18.9 7.7-40.7 13-61.3 11.3-31.7-2.6-62.4-19.3-74-50.4-5.8-15.6-6.3-32.9-6.3-49.4" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.12s;--t:0.05s" d="M723 295c-.6-.6 1.6 2.4 2.2 3.4-.5-1.5-1.9-2.8-2.9-3.9s-.5-.5 .7 .5" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.12s;--t:0.58s" d="M1036 279c4.3-10.2 11.2-19.4 15.9-29.4 11.7-25.3 21.5-52 24.8-79.8 1.2-10.3 2.7-20.7 2.2-31.1-1.9-39.1-18.7-81.5-58.2-96.1-12.9-4.7-26.2-5.6-39.7-5.6-12.4 0-25.7 2.2-37.4 6.4-27.7 9.9-51.3 28.3-71.8 48.8-27.8 27.8-50 59.4-69 93.6-7.2 13-12.9 26.6-19.3 40-1.6 3.3-5.3 4.8-6.7 8.1s-1.2 8.7-1.5 12.7c1.7-16.6-4.4-31.9-10.9-46.9-8.3-19.3-20.2-37.1-35.9-51.1-28.7-25.4-70.6-37-108.4-32.3-41.9 5.3-81.5 31.3-102.1 68.2-11.8 21.1-17.2 44.3-18.8 68.2-.5 7 1 14.3 1.6 21.2 3.4 37.3 20.2 73.3 44.1 101.9 6.6 7.9 13.3 18.6 22.2 24.1 2.6 1.6 6.8 5.9 10 3.6-3.3 2.2-7.8-2.3-10.5-3.9-8.8-5.4-16.3-16-22.4-24.2-12.5-16.5-23.8-33.7-31.6-53-8.6-21.2-12.1-43.7-13.4-66.4-.8-13.8 2.5-30.1 6.8-43.1 11.9-35.5 37-68.6 71.7-84.5 20-9.1 41.1-12.4 62.9-12.4 18 0 37.1 3.2 53.4 11.2 30 14.8 53 36 67.9 66.2 3.8 7.6 6.7 16.1 9.3 24.2 1.3 4.2 1.9 9.5 4.5 13.1 2.6 1.1 4.9-1.3 6.4-3.2 3.8-4.7 5.1-11.4 8-16.7 12.6-23 23.6-46.5 39.2-67.8 34.9-47.3 80.5-100.6 143.4-105.8 11-.9 22.5-.4 33.3 1.5 42.8 7.3 66.5 46.1 71.3 86.4 5.4 45-8.1 91-28.5 130.9-8.5 16.5-19.3 31.2-29.7 46.6-.3 .7 1.9-2.4 2.1-2.6 1.2-1.5 2.5-2.9 3.6-4.4 3.7-5.1 7.5-10.6 10.3-16.1 1-1.1 .8-1 0 .4" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.70s;--t:0.05s" d="M783 226c.6-.5 .5-.5 .1 .3-2 2.4-4.5 3.6-6.9 5.4 .8 .5 5.9-3.1 6.5-3.6" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.71s;--t:0.05s" d="M762 195c-.2-3.3-2.4-6.3-4-9.1-.2-.1 1.1 2.9 1.2 3.2 1.3 2.5 2.6 5 4 7.5 .4-.7-.7-1.1-1.2-1.6" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.72s;--t:0.07s" d="M709 596c10.1-6.3 20.7-11.7 30.5-18.4 42.4-28.7 82.9-61.4 121.2-95.4 19-17 38.4-33.5 57.4-50.5 5.4-4.8 10.8-9.7 16-14.8 3.4-3.4 7.5-7.9 11.9-9.9" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.79s;--t:0.41s" d="M63 417c1.3-2.1 1.6-4.5 3.3-6.4 5.8-6.4 16.5-10.1 24.3-13.2 16.6-6.6 34.3-11.6 51.8-15.1 23.7-4.7 47.5-9 71.5-11.1 31.4-2.7 63.1-1.4 94.3 2 11.1 1.2 22.8 3.2 33.4 6.4 4.6 1.4 5.9 5.6 9.9 7.5 2.3 1.1 5 .9 7.5 1.1 5.9 .5 11.7 .9 17.6 .8 6.9-.2 13.3-3.6 20.1-4.6 21.4-3.1 42.8-6.3 64.2-9.7 6.9-1 13.8-2 20.7-3.1 3.7-.5 7.4-1.4 11.2-.7-10.7-.4-21.6 2.2-32.1 3.9-17 2.7-33.9 5.3-50.9 7.8-6.3 1-12.6 1.5-18.9 2.7-2.4 .5-6.2 .9-6.7 3.9-1.2 6.1 6.7 11 10.6 14 10 7.9 19.2 17.3 24.2 29.2 13.3 31.6-1.4 67.5-17.2 95.2 .1 .8 .8-1.3 1.2-1.9 .7-1.2 1.1-1.9 1.7-3.1 1.8-3.3 3.6-6.6 5.1-9.9 4.4-9.5 8.2-19.5 11-29.6 4.4-16.4 4.9-34.7-1.8-50.6-5.3-12.7-16.2-23.8-27.2-31.6-4.8-3.5-7.2-11-13.4-11.7-4.6-.6-9.3 0-13.9-.4-3.8-.3-7.7-1.2-11.5-.6-4.8 .8-8.3 4.6-13.3 5.5-15.5 2.8-31.2 5.1-46.7 7.9-49.5 9.1-99.3 15.9-149.2 21.8-19 2.3-39.7 4.1-58.8 1.9-6.6-.7-16.8 .4-21.1-5.9 .1-.7 1 1 1.5 1.4 1.4 1.2 2.8 2.1 4.6 2.6 4.3 1.3 8.8 1.4 13.3 1.8 14.4 1.2 28.8 .8 43.2-.4 57.2-4.7 113.8-14.4 170.4-23.8 13.7-2.3 27.4-4.7 41.2-7 3.9-.6 11.1-1.4 10.8-6.9-.4-7.2-10.5-8.5-15.8-9.7-17.7-3.7-35.4-5-53.3-6.6-53.5-4.9-108.8 3.7-160.5 17.2-13.1 3.5-26.2 7.7-38.3 13.8-5.4 2.7-11.8 5.2-15.5 10.2-1.2 1.5-1.5 3.4-2.5 5" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-heart" d="M446.6 103.7c1.9-1.5 2.4-4 3.3-6.1 1.4-3.4 3.5-6.7 5.4-10 4.6-8.4 12.1-17.2 20.7-21.6 10-5.1 23.9-3.7 29.5 7.2 2.7 5.2 3 11.6 2.1 17.3-3.8 23.6-19.6 43.9-33.6 62.5-4.8 6.4-11.6 17-19.8 19.1s-18-6.9-24.1-11.5c-16.6-12.5-32.5-27.7-38.8-48.2-3.5-11.1-1-24.8 10.3-30.1s25.2 3.1 33.4 10.9c2.8 2.7 7.7 10.4 11.6 10.5" fill="currentColor"/> <path class="cy-sign-arrow" d="M1310.8 238.3c-3.4-1.8-9.1 .5-12.7 .9-12.8 1.5-25.4 3.8-38.1 5.7-29.2 4.6-58.6 8.9-87.9 13.1-14.5 2.1-29.1 3.6-43.5 6.3s-30 4.8-45 7c-3.2 .4-12.2 3.3-14.5 0-3.4-4.9 5.4-9.3 8.7-10.3 13.2-3.7 27.2-6.1 40.7-8 14.5-2 28.9-5.3 43.3-7.6 28.4-4.7 56.9-8.9 85.3-13.7 11.9-2 23.8-3.6 35.7-5.3 5.8-.9 13.1-.6 18.4-3.2 1.1-2.1-1-4.1-2.3-5.6-3.4-3.9-6.9-7.9-9.8-12.1-1.4-2.2-3.3-6.8-.3-8.6 4-2.4 13.7 1.5 17.8 2.5 16.5 3.9 33.5 8 49.5 13.3 4.8 1.6 16.9 2.8 17.3 9.5 .2 5.6-7.3 8.2-11.2 10.2-13.4 6.7-26.8 13.4-40.4 19.7-3.4 1.6-11 7.2-14.9 5.6-1.9-.8-1.4-3.6-1-5.1 .8-3.8 6.2-10.7 4.9-14.3" fill="currentColor"/> </g> </svg>'

    /* ------------------------------------------------------------------ */
    /* 新对话页标题上的风与花瓣                                             */
    /* ------------------------------------------------------------------ */

    // 原舞台圆心 (495,608) 锚定徽标；原稿 x=1900 的飞行末段对齐最后一个字。
    // 文字长度只改变右侧行程，图标附近的起势、花瓣形状和圆环都保持比例。
    const WIND_UNIT = 326 / 1920 // 花瓣大小跟随字号，横向行程单独跟随文字宽度
    const WIND_FROM = 0.40      // 时间轴：0.42 才有第一帧，提前一点起表
    const WIND_TO = 2.05        // 原文件里的 duration

    // 特效本体：`node tools/inject-hero-effect.mjs` 把
    // assets/effect/procedural-effect.js 原样填进下面这一段。
    /* CYRENE:WIND:BEGIN */
    // 标题特效：assets/effect/procedural-effect.js 原样嵌入，只去掉了外面的
    // IIFE 和那两行导出。改完源文件跑 node tools/inject-hero-effect.mjs 重新填。
    function createWindEffect() {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
  const identityX = x => x;
  const identityY = (_x, y) => y;
  const mapPoints = (points, mapX, mapY) => points.map((v, i) =>
    i % 2 ? mapY(points[i-1], v) : mapX(v));

  // Keyframes are [time, ...values]. Cubic Hermite interpolation avoids the
  // visible velocity changes caused by linear segments in a slow-motion view.
  function sample(keys, t) {
    if (t <= keys[0][0]) return keys[0].slice(1);
    const last = keys.length - 1;
    if (t >= keys[last][0]) return keys[last].slice(1);
    let i = 0;
    while (keys[i + 1][0] < t) i++;
    const a = keys[i], b = keys[i + 1];
    const p = keys[Math.max(0, i - 1)], n = keys[Math.min(last, i + 2)];
    const dt = b[0] - a[0], u = (t - a[0]) / dt;
    const u2 = u * u, u3 = u2 * u;
    return a.slice(1).map((v, k) => {
      const j = k + 1;
      const m0 = (b[j] - p[j]) / (b[0] - p[0]);
      const m1 = (n[j] - a[j]) / (n[0] - a[0]);
      return (2*u3 - 3*u2 + 1)*v + (u3 - 2*u2 + u)*dt*m0
        + (-2*u3 + 3*u2)*b[j] + (u3-u2)*dt*m1;
    });
  }

  function envelope(t, start, peak, sustain, end) {
    return smooth((t - start) / (peak - start))
      * (1 - smooth((t - sustain) / (end - sustain)));
  }

  function rgba(r, g, b, a) {
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${clamp(a)})`;
  }

  // All petal trajectories were hand-measured at representative reference
  // frames. Their individual decay timings and tumble phases remain separate.
  // Position samples are [t, x, y, angleDegrees, projectedWidth].
  const petals = [
    { shape: 0, size: 106, angleOffset:16, end: 1.99, phase: .4, color: [236, 151, 250],
      keys: [[.425,160,459,-24,.85],[.50,257,461,-25,1],[.60,356,458,-27,.97],[.72,425,455,-31,.87],[.82,471,450,-36,.83],[.99,525,448,-42,.77],[1.32,590,443,-55,.67],[1.65,646,442,-66,.48],[1.99,681,450,-80,.25]] },
    { shape: 1, size: 112, angleOffset:-20, light:.25, end: 1.72, phase: 1.5, color: [243, 148, 249],
      keys: [[.425,689,518,28,.78],[.50,897,520,26,.90],[.60,1262,520,25,.98],[.72,1516,520,31,.90],[.82,1667,524,34,.91],[.99,1808,534,38,.81],[1.32,1909,548,43,.74],[1.65,1980,559,49,.70]] },
    { shape: 2, size: 113, decay:.62, end: 1.42, phase: 2.3, color: [228, 134, 248],
      keys: [[.425,375,509,-12,1],[.50,613,510,-6,1.18],[.60,844,511,0,1.08],[.72,1003,515,17,.96],[.82,1090,516,31,.73],[.99,1173,518,67,.42],[1.32,1235,519,121,.27],[1.42,1250,524,144,.14]] },
    { shape: 3, size: 122, decay:.68, angleOffset:90, light:.5, opacity:.87, end: 1.34, phase: 3.0, color: [226, 133, 246],
      keys: [[.425,510,601,-58,.78],[.50,744,606,-61,.85],[.60,1024,602,-71,.72],[.72,1226,610,-83,.75],[.82,1330,608,-94,.65],[.99,1454,612,-104,.41],[1.28,1550,617,-145,.12]] },
    { shape: 0, size: 99, end: 1.63, phase: 2.2, color: [242, 161, 250],
      keys: [[.425,261,652,-54,.68],[.50,501,666,-57,1],[.60,649,650,-72,.81],[.72,779,646,-82,.78],[.82,847,646,-70,.84],[.99,944,638,-40,.68],[1.32,1001,644,15,.73],[1.60,1016,652,44,.34]] },
    { shape: 2, size: 95, angleOffset:35, end: 1.93, phase: 2.8, color: [237, 149, 249],
      keys: [[.425,293,690,8,.92],[.50,477,695,8,.83],[.60,596,681,-2,.83],[.72,699,671,-16,1],[.82,765,671,-28,1],[.99,846,671,-42,.91],[1.32,935,676,-76,.79],[1.65,994,671,-107,.57],[1.94,1020,675,-130,.28]] },
    { shape: 0, size: 81, end: 1.48, phase: 3.5, color: [241, 162, 250],
      keys: [[.425,290,576,69,.78],[.50,426,593,67,.72],[.60,525,603,74,.81],[.72,588,595,71,.87],[.82,646,588,64,.94],[.99,718,583,62,.64],[1.32,818,579,25,.61],[1.48,858,583,4,.32]] },
    { shape: 0, size: 90, decay:.76, angleOffset:-40, end: 1.49, phase: 1.7, color: [237, 143, 250],
      keys: [[.425,356,677,45,.87],[.50,610,675,52,.88],[.60,792,682,59,.92],[.72,947,682,71,.99],[.82,1041,683,78,.94],[.99,1136,680,94,.81],[1.32,1228,676,111,.51],[1.49,1261,680,130,.3]] },
    { shape: 2, size: 110, decay:.75, light:.5, end: 1.30, phase: 4.1, color: [237, 148, 249],
      keys: [[.425,319,752,111,.83],[.50,606,766,109,.94],[.60,836,760,102,.86],[.72,997,759,94,.91],[.82,1087,750,80,.83],[.99,1187,752,64,.71],[1.28,1253,746,41,.17]] },
    { shape: 0, size: 77, end: 1.05, phase: 4.7, color: [239, 161, 250],
      keys: [[.425,91,603,1,.70],[.50,210,604,-2,1],[.60,278,608,-7,.97],[.72,339,608,-14,.87],[.82,373,608,-21,.65],[.99,409,608,-37,.28],[1.05,420,608,-44,.12]] }
  ];

  // Closed petal silhouettes. A concave folded edge is deliberately retained:
  // the reference has small, curved sheets rather than ellipses/heart icons.
  function petalPath(ctx, kind, fold) {
    ctx.beginPath();
    if (kind === 0) {
      ctx.moveTo(-.55, .04);
      ctx.bezierCurveTo(-.36,-.19, .04,-.42, .55,-.27);
      ctx.bezierCurveTo(.37,-.12,.40,.19,.09,.29);
      ctx.bezierCurveTo(-.14,.40,-.40,.21,-.55,.04);
    } else if (kind === 1) {
      ctx.moveTo(-.58,-.19);
      ctx.bezierCurveTo(-.19,-.42,.18,-.35,.38,-.11);
      ctx.bezierCurveTo(.56,.12,.24,.28,.60,.48);
      ctx.bezierCurveTo(.10,.37,.09,.10,-.12,-.02);
      ctx.bezierCurveTo(-.31,-.14,-.43,-.16,-.58,-.19);
    } else if (kind === 2) {
      ctx.moveTo(-.57,-.11);
      ctx.bezierCurveTo(-.24,-.13,-.22,-.37,.11,-.31);
      ctx.bezierCurveTo(.50,-.25,.54,-.06,.37,.13);
      ctx.bezierCurveTo(.21,.26,.11,.45,-.05,.27);
      ctx.bezierCurveTo(-.19,.05,-.23,-.03,-.57,-.11);
    } else {
      // The upright folded petal in the right half of the fan.
      ctx.moveTo(-.20,-.57);
      ctx.bezierCurveTo(.18,-.48,.57,-.05,.31,.20);
      ctx.bezierCurveTo(.17,.34,-.10,.39,-.13,.58);
      ctx.bezierCurveTo(-.35,.25,-.14,.08,-.14,-.11);
      ctx.bezierCurveTo(-.12,-.31,-.16,-.43,-.20,-.57);
    }
    ctx.closePath();
  }

  function paintPetal(ctx, p, t, strength, flutter, mapX, mapY) {
    const start = .421;
    if (t < start || t > p.end) return;
    const pose = sample(p.keys, t);
    const fade = envelope(t, start, .48, p.decay??Math.min(.98,p.end-.26), p.end);
    const white = envelope(t, .45, .54, .62, 1.02);
    const angle = (pose[2]+(p.angleOffset||0))*Math.PI/180;
    const pulse = 1 + Math.sin(t*7.3+p.phase)*.035*flutter;
    const sz = p.size*pulse;
    const projected = Math.max(.08,pose[3]);
    ctx.save();
    ctx.filter='blur(.55px)';
    ctx.translate(mapX(pose[0]),mapY(pose[0],pose[1]));
    ctx.rotate(angle);
    ctx.scale(sz*projected,sz);
    ctx.globalAlpha = clamp(fade*strength*(p.opacity??1));
    const localLight=clamp(white*white*1.3*Math.exp(-Math.pow((pose[0]-550)/650,2))*(p.light??1));
    const r = mix(p.color[0],255,localLight), g = mix(p.color[1],251,localLight), b = mix(p.color[2],255,localLight);
    const fill = ctx.createLinearGradient(-.3,-.4,.3,.4);
    fill.addColorStop(0,rgba(mix(r,255,.16),mix(g,240,.16),255,1));
    fill.addColorStop(.62,rgba(r,g,b,1));
    fill.addColorStop(1,rgba(r*.94,g*.85,b*.97,1));
    ctx.fillStyle = fill;
    petalPath(ctx,p.shape,p.phase);
    ctx.fill();
    // Soft folded highlight, clipped to the silhouette and fading with light.
    ctx.clip();
    ctx.globalAlpha *= .07 + .12*white;
    ctx.fillStyle = '#fff6ff';
    ctx.beginPath();
    ctx.moveTo(-.6,-.08);
    ctx.bezierCurveTo(-.08,.05,.15,-.06,.55,-.15);
    ctx.lineTo(.55,-.11);
    ctx.bezierCurveTo(.1,.02,-.12,.12,-.6,-.045);
    ctx.fill();
    ctx.restore();
  }

  function cubic(p, u) {
    const v=1-u, a=v*v*v, b=3*v*v*u, c=3*v*u*u, d=u*u*u;
    return [a*p[0]+b*p[2]+c*p[4]+d*p[6], a*p[1]+b*p[3]+c*p[5]+d*p[7]];
  }

  // A tapered strip is filled instead of a uniform stroke. This gives the
  // ribbon a sharp filament at either end and a broad light-bearing middle.
  function ribbon(ctx, points, width, opacity, tint, glowWidth) {
    if (opacity <= .001 || width <= 0) return;
    const steps=72, top=[], bottom=[];
    for(let i=0;i<=steps;i++) {
      const u=i/steps, pos=cubic(points,u);
      const prev=cubic(points,Math.max(0,u-.004));
      const next=cubic(points,Math.min(1,u+.004));
      const dx=next[0]-prev[0],dy=next[1]-prev[1],len=Math.hypot(dx,dy)||1;
      const half=Math.pow(Math.sin(Math.PI*u),1.15)*width*.5;
      top.push([pos[0]-dy/len*half,pos[1]+dx/len*half]);
      bottom.push([pos[0]+dy/len*half,pos[1]-dx/len*half]);
    }
    ctx.save();
    const ramp=ctx.createLinearGradient(points[0],points[1],points[6],points[7]);
    ramp.addColorStop(0,rgba(...tint,0));
    ramp.addColorStop(.17,rgba(...tint,.46*opacity));
    ramp.addColorStop(.48,rgba(251,191,255,opacity));
    ramp.addColorStop(.72,rgba(...tint,.85*opacity));
    ramp.addColorStop(1,rgba(...tint,0));
    ctx.fillStyle=ramp;
    if(glowWidth) { ctx.shadowBlur=glowWidth; ctx.shadowColor=rgba(...tint,.5*opacity); }
    ctx.beginPath();
    top.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
    for(let i=bottom.length-1;i>=0;i--)ctx.lineTo(bottom[i][0],bottom[i][1]);
    ctx.closePath();ctx.fill();ctx.restore();
  }

  const ribbonKeys=[
    // top arc: grows right, then lifts off and moves right as the gust dies
    [[.44,350,455,430,430,510,425,650,436],
     [.60,350,455,555,424,751,422,850,428],
     [.82,350,455,670,405,1000,425,1180,455],
     [1.00,380,451,880,381,1300,460,1540,534],
     [1.32,950,436,1350,462,1640,606,1970,568],
     [1.50,1320,457,1610,487,1850,628,2150,561]],
    // middle upper strand bends downward as it crosses the petal fan
    [[.44,310,548,430,520,560,530,680,566],
     [.60,330,540,625,477,876,549,1190,646],
     [.82,330,540,650,476,1030,592,1430,688],
     [1.00,340,540,720,463,1110,649,1540,700],
     [1.20,420,529,820,510,1240,715,1650,657],
     [1.40,740,560,1140,577,1500,687,1790,573]],
    // lower strand sweeps upward, producing the long X in the reference
    [[.44,330,751,460,760,590,710,720,673],
     [.60,330,758,615,775,826,645,1110,570],
     [.82,330,758,705,781,1110,503,1420,543],
     [1.00,350,758,820,793,1220,426,1550,530],
     [1.32,580,740,1050,707,1365,402,1810,495],
     [1.50,900,665,1300,560,1600,384,1940,504]]
  ];

  function paintWind(ctx,t,strength,mapX,mapY) {
    const e=envelope(t,.43,.51,.82,1.53)*strength;
    if(e<.001)return;
    const bright=envelope(t,.44,.55,.78,1.42);
    // Broad diffuse swath underneath the three narrow strands.
    const swath=mapPoints(sample([
      [.44,300,605,510,600,690,540,850,610],
      [.62,350,610,700,610,1040,480,1290,610],
      [.85,330,625,690,650,1150,423,1500,575],
      [1.12,600,650,1060,600,1350,415,1710,520],
      [1.5,1050,600,1390,498,1740,430,2050,545]],t),mapX,mapY);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.filter='blur(23px)';
    ribbon(ctx,swath,108,bright*.7*strength,[223,79,255],0);
    const leftPulse=envelope(t,.43,.54,.76,1.26)*strength;
    ribbon(ctx,mapPoints([285,607,500,648,760,591,1010,551],mapX,mapY),94,leftPulse*.76,[230,99,255],0);
    ctx.filter='blur(10px)';
    ribbon(ctx,swath,49,bright*.72*strength,[246,143,255],0);
    ctx.restore();
    ribbonKeys.forEach((keys,i)=>{
      const p=mapPoints(sample(keys,t),mapX,mapY);
      const w=[16,20,16][i]*(.75+.25*bright);
      ctx.save();ctx.filter='blur(5px)';
      ribbon(ctx,p,w*2.1,e*.20,[194,102,255],12);
      ctx.filter='blur(.8px)';
      ribbon(ctx,p,w,e,[220,133,255],9*bright);
      ribbon(ctx,p,w*.26,e*.55*bright,[255,220,255],6);
      ctx.restore();
    });
  }

  function paintRing(ctx,t,strength,mapX,mapY,ringScale) {
    if(t<.445||t>1.33)return;
    const radius=sample([[.445,155],[.50,190],[.60,252],[.80,263],[1.0,270],[1.33,279]],t)[0];
    const a=sample([[.445,0],[.50,1],[.60,1],[.80,.90],[1.0,.32],[1.2,.04],[1.33,0]],t)[0]*strength;
    const flash=envelope(t,.45,.50,.55,.77);
    ctx.save();
    // Translate the whole ring, including its gradient; never stretch its radius.
    if(mapX!==identityX||mapY!==identityY)ctx.translate(mapX(495)-495,mapY(495,608)-608);
    if(ringScale!==1) {
      ctx.translate(495,608);
      ctx.scale(ringScale,ringScale);
      ctx.translate(-495,-608);
    }
    const halo=ctx.createRadialGradient(495,608,radius-25,495,608,radius+37);
    halo.addColorStop(0,'rgba(177,94,255,0)');
    halo.addColorStop(.28,rgba(181,99,255,.025*a));
    halo.addColorStop(.42,rgba(196,111,255,.12*a));
    halo.addColorStop(.65,rgba(175,86,255,.05*a));
    halo.addColorStop(1,'rgba(167,82,255,0)');
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(495,608,radius+38,0,TAU);ctx.fill();
    ctx.strokeStyle=rgba(197,116,255,.6*a);ctx.lineWidth=21;
    ctx.filter='blur(12px)';
    ctx.shadowBlur=21;ctx.shadowColor=rgba(186,100,255,.65*a);
    ctx.beginPath();ctx.ellipse(495,608,radius*.98,radius,0,0,TAU);ctx.stroke();
    ctx.filter='blur(2px)';ctx.lineWidth=8;
    ctx.strokeStyle=rgba(218,114,255,a*.7);ctx.stroke();
    ctx.filter='blur(.5px)';
    ctx.shadowBlur=7;ctx.lineWidth=5.2;
    ctx.strokeStyle=rgba(mix(204,255,flash),mix(118,255,flash),255,a);
    ctx.stroke();
    ctx.shadowBlur=0;ctx.lineWidth=1.8;
    ctx.strokeStyle=rgba(255,237,255,a*flash);ctx.stroke();
    ctx.restore();
  }

  const api={
    width:1920,height:1080,duration:2.05,
    /** Draw the effect at a source-video timestamp in seconds. */
    render(ctx,seconds,options={}) {
      const speed=Number.isFinite(options.speed)?Math.max(.01,options.speed):1;
      const t=seconds*speed-(options.timeOffset||0);
      if(!Number.isFinite(t)||t<.42||t>2.05)return;
      const strength=clamp(options.strength??1,0,2);
      const span=options.span;
      // Span is a trajectory interval, not a clipping rectangle. Allow natural
      // trailing tips and glow; callers can clip/mask their text-sized canvas.
      let mapX=span && Number.isFinite(span.left) && Number.isFinite(span.right) && span.right>span.left
        ? x => span.left+(x-50)*(span.right-span.left)/2000
        : identityX;
      let mapY=identityY, ringScale=1;
      const sweep=options.sweep;
      if(sweep && Number.isFinite(sweep.originX) && Number.isFinite(sweep.originY)
        && Number.isFinite(sweep.endX) && sweep.endX>sweep.originX) {
        const {originX,originY,endX}=sweep;
        const endY=Number.isFinite(sweep.endY)?sweep.endY:originY;
        const leftScale=Number.isFinite(sweep.leftScale)&&sweep.leftScale>=0?sweep.leftScale:.6;
        const fanScale=Number.isFinite(sweep.fanScale)&&sweep.fanScale>0?sweep.fanScale:1;
        ringScale=Number.isFinite(sweep.ringScale)&&sweep.ringScale>0?sweep.ringScale:1;
        mapX=x=>originX+(x-495)*(x<=495?leftScale:(endX-originX)/1405);
        mapY=(x,y)=>{
          const progress=clamp((x-495)/1405);
          return mix(originY,endY,smooth(progress))+(y-608)*mix(1,fanScale,progress);
        };
      }
      ctx.save();
      if(options.width||options.height)ctx.scale((options.width||1920)/1920,(options.height||1080)/1080);
      ctx.translate(options.offsetX||0,options.offsetY||0);
      if(options.scale)ctx.scale(options.scale,options.scale);
      if(options.ring!==false)paintRing(ctx,t,strength,mapX,mapY,ringScale);
      if(options.wind!==false)paintWind(ctx,t,strength,mapX,mapY);
      if(options.petals!==false)for(const p of petals)paintPetal(ctx,p,t,strength,options.flutter??1,mapX,mapY);
      ctx.restore();
    }
  };
      return api;
    }
    /* CYRENE:WIND:END */

    // 开屏的 DOM 只有这一份，`tools/build-splash.mjs` 会把它原样抽到
    // splash.html 里做离线预览。{{ART}} 是图片占位符，{{CAPTION}} 是那句问候：
    // 五句里随机取一句，中/英各有一版，见 SPLASH_LINES 与 splashCaption()。
    const SPLASH_MARKUP = `
      <div class="cy-splash-stage">
        <div class="cy-splash-aurora"></div>
        <div class="cy-splash-halo"></div>
        <div class="cy-splash-figure">
          <img class="cy-splash-art" alt="" draggable="false" src="{{ART}}">
          <div class="cy-splash-sweep"></div>
        </div>
        <div class="cy-splash-caption">{{CAPTION}}</div>
      </div>
    `

    /* ------------------------------------------------------------------ */
    /* State                                                               */
    /* ------------------------------------------------------------------ */

    let lockedByUrl = false
    // `state` is filled in further down, once the shortcut tables are declared:
    // `loadState()` runs `sanitize()`, which normalises the stored shortcut and
    // therefore reads `MOD_ORDER`/`MOD_ALIASES`/`KEY_TOKEN`. Calling it here hit
    // their TDZ, and the try/catch inside `loadState` swallowed the ReferenceError
    // and returned the defaults — so every stored preference was silently
    // discarded on load whenever the record carried a `shortcut` key.
    let state = { ...DEFAULT_STATE }
    let mounted = false
    let disposeFns = []
    let panel = null
    let ambient = null
    let styleEl = null
    // 录键是临时的界面状态，不进 localStorage 也不进 state：关掉设置、按 Esc
    // 或者点到别处，它就该消失，下次打开设置还是显示当前组合。
    let captureState = { active: false, problem: '' }
    let captureTeardown = null
    const captureSubscribers = new Set()

    function clamp01(value) {
      const n = Number(value)
      if (!Number.isFinite(n)) return DEFAULT_STATE.intensity
      return Math.min(1, Math.max(0, n))
    }

    /* ---------- 快捷键的组合字符串 ---------- */

    const MOD_ORDER = ['ctrl', 'alt', 'shift', 'meta']
    const MOD_LABELS = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' }
    // 接受几种常见的别名，方便在控制台里手写。
    const MOD_ALIASES = {
      ctrl: 'ctrl', control: 'ctrl',
      alt: 'alt', option: 'alt', opt: 'alt',
      shift: 'shift',
      meta: 'meta', cmd: 'meta', command: 'meta', win: 'meta', super: 'meta',
    }
    // The only key tokens `comboFromEvent` can ever produce. Anything outside
    // this set could be stored and persisted, but would never fire.
    const KEY_TOKEN = /^(?:[a-z0-9]|f\d{1,2}|space|escape|enter|tab|backspace|delete|insert|plus|home|end|pageup|pagedown|arrow(?:up|down|left|right))$/
    const KEY_LABELS = {
      space: 'Space', escape: 'Esc', enter: 'Enter', tab: 'Tab',
      backspace: 'Backspace', delete: 'Delete', insert: 'Insert', plus: '+',
      home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
      arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    }
    // 只按住修饰键（或大写锁定这类锁键）不算按了一个组合，继续等下一下。
    const MODIFIER_KEYS = new Set([
      'control', 'ctrl', 'shift', 'alt', 'altgraph', 'meta', 'os', 'super',
      'hyper', 'fn', 'fnlock', 'capslock', 'numlock', 'scrolllock', 'contextmenu',
    ])

    /** A KeyboardEvent `key` → the token we store ("x", "f5", "space"). */
    function keyToken(key) {
      const raw = key === null || key === undefined ? '' : String(key)
      if (!raw) return ''
      if (raw === ' ') return 'space'
      if (raw === '+') return 'plus'
      const lower = raw.toLowerCase()
      if (MODIFIER_KEYS.has(lower)) return ''
      return lower
    }

    /** "ctrl+alt+x" as read off a live event. Empty while only modifiers are down. */
    function comboFromEvent(event) {
      if (!event) return ''
      const token = keyToken(event.key)
      if (!token) return ''
      const held = {
        ctrl: !!event.ctrlKey,
        alt: !!event.altKey,
        shift: !!event.shiftKey,
        meta: !!event.metaKey,
      }
      return [...MOD_ORDER.filter((mod) => held[mod]), token].join('+')
    }

    /** Loose input (stored string, console) → the canonical form, or ''. */
    function normalizeCombo(value) {
      const text = value === null || value === undefined ? '' : String(value)
      const mods = new Set()
      let token = ''
      for (const part of text.toLowerCase().split('+')) {
        const piece = part.trim()
        if (!piece) continue
        if (MOD_ALIASES[piece]) mods.add(MOD_ALIASES[piece])
        else if (KEY_TOKEN.test(piece)) token = piece
        // Anything else can never match a KeyboardEvent `key`, so reject the
        // whole combination instead of storing a shortcut that never fires.
        else return ''
      }
      if (!token) return ''
      return [...MOD_ORDER.filter((mod) => mods.has(mod)), token].join('+')
    }

    /**
     * Why a combination cannot be used, or '' when it is fine.
     *
     * A bare key would fire while typing in the composer, and a bare Shift+key
     * is just a capital letter — so Ctrl, Alt or Win has to be part of it.
     * The debug panel keeps its own shortcut, so that one is taken.
     */
    function comboProblem(combo) {
      const parts = String(combo || '').split('+').filter(Boolean)
      if (!parts.pop()) return 'empty'
      if (!parts.some((mod) => mod === 'ctrl' || mod === 'alt' || mod === 'meta')) return 'nomod'
      if (combo === PANEL_SHORTCUT) return 'taken'
      return ''
    }

    /** The combination as chips: "ctrl+alt+x" → ["Ctrl", "Alt", "X"]. */
    function comboParts(combo) {
      return String(combo || '')
        .split('+')
        .filter(Boolean)
        .map((part) => {
          if (MOD_LABELS[part]) return MOD_LABELS[part]
          if (KEY_LABELS[part]) return KEY_LABELS[part]
          if (/^f\d{1,2}$/.test(part)) return part.toUpperCase()
          return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)
        })
    }

    /** Stored value → a usable shortcut, falling back to the default. */
    function sanitizeShortcut(value) {
      const combo = normalizeCombo(value)
      return combo && !comboProblem(combo) ? combo : DEFAULT_SHORTCUT
    }

    /** Splash length is seconds in [1, 5], rounded to a half second. */
    function clampSplashSeconds(value) {
      const n = Number(value)
      if (!Number.isFinite(n)) return SPLASH_DEFAULT_SECONDS
      const step = Math.round(n * 2) / 2
      return Math.min(SPLASH_MAX_SECONDS, Math.max(SPLASH_MIN_SECONDS, step))
    }

    /** Splash figure height in px, [300, 720], rounded to 10. */
    function clampSplashSize(value) {
      const n = Number(value)
      if (!Number.isFinite(n)) return SPLASH_DEFAULT_SIZE
      return Math.min(SPLASH_MAX_SIZE, Math.max(SPLASH_MIN_SIZE, Math.round(n / 10) * 10))
    }

    /** Watermark clearance in px, [0, 360], rounded to 4. */
    function clampChatBgY(value) {
      const n = Number(value)
      if (!Number.isFinite(n)) return DEFAULT_STATE.chatBgY
      return Math.min(360, Math.max(0, Math.round(n / 4) * 4))
    }

    // Safe here: every table `sanitize()` can reach is now initialised.
    state = loadState()

    function sanitize(raw) {
      const next = { ...DEFAULT_STATE }
      if (!raw || typeof raw !== 'object') return next
      next.enabled = raw.enabled !== false
      next.ambient = raw.ambient !== false
      next.panel = raw.panel === true
      next.preset = PRESETS.some((p) => p.id === raw.preset) ? raw.preset : DEFAULT_STATE.preset
      next.intensity = clamp01(raw.intensity)
      // Which surface the Windows caption buttons should match: the title strip
      // is the sidebar fill (`canvas` is kept only for experiments).
      // The title strip is the sidebar fill, so that stays the default;
      // `canvas` only survives when the user picked it explicitly. A value
      // persisted by 0.2.2 (where canvas was the default) is ignored.
      next.chromeExplicit = raw.chromeExplicit === true
      next.chrome = next.chromeExplicit && raw.chrome === 'canvas' ? 'canvas' : 'sidebar'
      // An unknown level falls back to the default — which is also how a stored
      // `texture` from before 0.25 lands on `full`, the level it was closest to.
      next.level = LEVELS.some((level) => level.id === raw.level) ? raw.level : DEFAULT_STATE.level
      next.chatBg = raw.chatBg !== false
      next.chatBgY = clampChatBgY(raw.chatBgY)
      next.chatBgYExplicit = raw.chatBgYExplicit === true
      next.copy = raw.copy !== false
      next.chatBgAnchor = raw.chatBgAnchor === 'right' ? 'right' : 'center'
      next.chatBgAnchorExplicit = raw.chatBgAnchorExplicit === true
      next.splash = raw.splash !== false
      next.splashExplicit = raw.splashExplicit === true
      next.splashSeconds = clampSplashSeconds(raw.splashSeconds)
      next.splashTone = raw.splashTone === 'pink' ? 'pink' : 'white'
      next.splashSize = clampSplashSize(raw.splashSize)
      // 快捷键：不合法的组合（没有 Ctrl/Alt/Win、占用面板的键）落回默认值。
      next.shortcut = sanitizeShortcut(raw.shortcut)
      // One-time migrations, each pinned to its own revision. Stamped after the
      // first save, so later manual choices stick — and bumping the revision for
      // a new migration must not re-run an older one.
      const rev = Number(raw.prefsRev) || 0
      if (rev < 2) {
        // profiles that stored the old 460/pink pair move to 300/white
        next.splashTone = DEFAULT_STATE.splashTone
        next.splashSize = DEFAULT_STATE.splashSize
      }
      if (rev < 4 && !next.chatBgYExplicit) {
        // 3 moved the clearance to 200px, 4 brought it back to 160px once the
        // watermark became a vector. Same field, so one guard covers both:
        // anyone who never touched the slider follows the current default.
        next.chatBgY = DEFAULT_STATE.chatBgY
      }
      if (rev < 5 && !next.chatBgAnchorExplicit) {
        // 12 shipped right-anchored as the default and had no "explicit" flag,
        // so a profile that saved anything at all carries chatBgAnchor=right.
        // 13 makes centring the default; follow it unless the user picked.
        next.chatBgAnchor = DEFAULT_STATE.chatBgAnchor
      }
      if (rev < 6 && !next.splashExplicit) {
        // 23 made the opening animation follow the level: off on 「轻」.
        // Anyone sitting on 「轻」 who never touched the switch follows.
        next.splash = next.level !== 'tint'
      }
      next.prefsRev = PREFS_REV
      return next
    }

    function loadState() {
      let param = null
      try {
        param = new URL(window.location.href).searchParams.get('cyrene')
      } catch {
        param = null
      }
      if (param === 'off') {
        lockedByUrl = true
        return { ...DEFAULT_STATE, enabled: false }
      }
      if (param === 'reset') {
        lockedByUrl = true
        try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
        return { ...DEFAULT_STATE }
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { ...DEFAULT_STATE }
        return sanitize(JSON.parse(raw))
      } catch {
        return { ...DEFAULT_STATE }
      }
    }

    function persist(force) {
      if (lockedByUrl && !force) return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch { /* storage may be unavailable */ }
    }

    function setState(patch) {
      const next = { ...state, ...patch }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'chrome')) {
        next.chromeExplicit = true
      }
      // Touching the clearance marks it as chosen, so a later default change
      // will not yank it around.
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'chatBgY')) {
        next.chatBgYExplicit = true
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'chatBgAnchor')) {
        next.chatBgAnchorExplicit = true
      }
      // 开屏动画的默认值跟着档位走：「轻」不放开场，中/全放。
      // 亲手点过开关的人（splashExplicit）之后就不再被档位改写了。
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'splash')) {
        next.splashExplicit = true
      } else if (patch && Object.prototype.hasOwnProperty.call(patch, 'level') && !next.splashExplicit) {
        next.splash = next.level !== 'tint'
      }
      state = sanitize(next)
      render()
      persist()
      return snapshot()
    }

    function snapshot() {
      return { ...state, version: VERSION, lockedByUrl }
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                           */
    /* ------------------------------------------------------------------ */

    function ensureStyle() {
      if (styleEl && styleEl.isConnected) return
      styleEl = document.getElementById(STYLE_ID)
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = STYLE_ID
        // The loader attributes <style> tags by owner; untagged sheets can be
        // collected when another module fails to materialize.
        styleEl.dataset.plugin = MODULE_ID
        styleEl.textContent = CSS
        document.head.appendChild(styleEl)
      }
    }

    function ensureAmbient() {
      if (ambient && ambient.isConnected) return
      ambient = document.getElementById(AMBIENT_ID)
      if (!ambient) {
        ambient = document.createElement('div')
        ambient.id = AMBIENT_ID
        ambient.setAttribute('aria-hidden', 'true')
        document.body.appendChild(ambient)
      }
    }

    function removeAmbient() {
      if (ambient && ambient.isConnected) ambient.remove()
      ambient = null
    }

    /**
     * Publish the two watermark bakes as custom properties.
     *
     * The data URI is ~50 KB per bake, so it is pushed once per mount and the
     * stylesheet only ever references `var(--cy-chat-art)`. Keeping it out of
     * the CSS template also keeps the offline preview build small.
     */
    let chatArtReady = false
    function ensureChatArt() {
      if (chatArtReady) return
      const root = document.documentElement
      try {
        if (CHAT_ART_LIGHT) root.style.setProperty('--cy-chat-art', 'url("' + CHAT_ART_LIGHT + '")')
        chatArtReady = true
      } catch { /* ignore */ }
    }

    function dropChatArt() {
      chatArtReady = false
      const root = document.documentElement
      try {
        root.style.removeProperty('--cy-chat-art')
      } catch { /* ignore */ }
    }

    /* ------------------------------------------------------------------ */
    /* Splash                                                              */
    /* ------------------------------------------------------------------ */

    let splashTimer = 0
    let splashWaitTimer = 0
    let splashKeyHandler = null
    let splashLangObserver = null
    /** 'idle' | 'intro' | 'waiting' | 'done' — exposed for diagnostics. */
    let splashState = 'idle'
    /** Which line of SPLASH_LINES this opening is showing. */
    let splashLine = 0

    /**
     * The line under the character, in the order the deck deals them.
     *
     * One is drawn per opening — see nextSplashLine() for why the draw is a
     * deck rather than an independent roll each time.
     */
    const SPLASH_LINES = [
      { zh: '你好，世界', en: 'Hello, World' },
      { zh: '浪漫一如初见♪', en: 'As romantic as the first time♪' },
      { zh: '向着爱与明天♪', en: 'Toward love and tomorrow♪' },
      { zh: '等待，在所有的过去', en: 'Waiting, in all that has passed' },
      { zh: '愿世界，如你我所愿', en: 'May the world be as we wish' },
    ]

    /**
     * One deck: every line `SPLASH_COPIES` times, shuffled but never with the
     * same line twice in a row.
     *
     * A plain shuffle would now and then deal two copies back to back, and two
     * identical openings in a row read as a bug rather than as chance. Shuffling
     * again until the arrangement is clean is cheap at this size (ten cards) and
     * keeps the result unbiased — every valid arrangement stays equally likely.
     * `previous` is the line that just played, so the seam between two decks is
     * covered by the same rule.
     */
    function buildSplashDeck(previous) {
      const deck = []
      for (let copy = 0; copy < SPLASH_COPIES; copy += 1) {
        for (let line = 0; line < SPLASH_LINES.length; line += 1) deck.push(line)
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        for (let i = deck.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1))
          const swap = deck[i]
          deck[i] = deck[j]
          deck[j] = swap
        }
        let clean = true
        for (let i = 0; i < deck.length; i += 1) {
          const before = i === 0 ? previous : deck[i - 1]
          if (deck[i] === before) {
            clean = false
            break
          }
        }
        if (clean) break
      }
      return deck
    }

    /** The stored deck, or null when it is missing or no longer usable. */
    function readSplashDeck(total) {
      try {
        const raw = localStorage.getItem(SPLASH_DECK_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const order = parsed && parsed.order
        if (!Array.isArray(order) || order.length !== total) return null
        const counts = SPLASH_LINES.map(() => 0)
        for (const value of order) {
          if (!Number.isInteger(value) || value < 0 || value >= counts.length) return null
          counts[value] += 1
        }
        // Both copies of every line, or it is not a deck we dealt.
        if (!counts.every((count) => count === SPLASH_COPIES)) return null
        const index = Number.isInteger(parsed.index) ? parsed.index : 0
        return { order, index: Math.min(Math.max(index, 0), total) }
      } catch {
        return null
      }
    }

    /**
     * Draw the next greeting from a deck kept across launches.
     *
     * Independent random picks would let one line turn up three launches in a
     * row while another goes missing for a fortnight. A deck deals each line
     * exactly `SPLASH_COPIES` times before it is reshuffled, so ten openings
     * contain every line exactly twice — that is what "even" can mean for
     * something the user only sees once a day.
     */
    function nextSplashLine() {
      const total = SPLASH_LINES.length * SPLASH_COPIES
      let deck = readSplashDeck(total)
      if (!deck || deck.index >= total) {
        const previous = deck ? deck.order[total - 1] : -1
        deck = { order: buildSplashDeck(previous), index: 0 }
      }
      const line = deck.order[deck.index]
      try {
        localStorage.setItem(SPLASH_DECK_KEY, JSON.stringify({ order: deck.order, index: deck.index + 1 }))
      } catch { /* storage may be unavailable */ }
      return line
    }

    /** The greeting as it should read right now, in the current language. */
    function splashCaption() {
      const line = SPLASH_LINES[splashLine] || SPLASH_LINES[0]
      return isEnglish() ? line.en : line.zh
    }

    /** Repaint the greeting if the shell switched language mid-intro. */
    function syncSplashCaption() {
      try {
        const host = document.getElementById(SPLASH_ID)
        const caption = host && host.querySelector('.cy-splash-caption')
        if (!caption) return
        const next = splashCaption()
        if (caption.textContent !== next) caption.textContent = next
      } catch { /* ignore */ }
    }

    function watchSplashLang() {
      stopSplashLangWatch()
      try {
        if (typeof MutationObserver !== 'function') return
        splashLangObserver = new MutationObserver(syncSplashCaption)
        splashLangObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
      } catch { /* ignore */ }
    }

    function stopSplashLangWatch() {
      if (!splashLangObserver) return
      try { splashLangObserver.disconnect() } catch { /* ignore */ }
      splashLangObserver = null
    }

    function clearSplashTimer() {
      if (splashTimer) {
        try { window.clearTimeout(splashTimer) } catch { /* ignore */ }
        splashTimer = 0
      }
    }

    function clearSplashWait() {
      if (splashWaitTimer) {
        try { window.clearInterval(splashWaitTimer) } catch { /* ignore */ }
        splashWaitTimer = 0
      }
    }

    /** True while the shell is still showing its own "Loading plugins…" screen. */
    function shellStillLoading() {
      try {
        return !!document.querySelector('[data-dsh-boot]')
      } catch {
        return false
      }
    }

    /** Fade the splash out and drop it; safe to call more than once. */
    function finishSplash() {
      if (splashState === 'done' || splashState === 'idle') return
      splashState = 'done'
      clearSplashTimer()
      clearSplashWait()
      // Must happen before the early return below: when the panel stops the
      // splash first the host is already gone, and the observer would leak.
      stopSplashLangWatch()
      if (splashKeyHandler) {
        try { document.removeEventListener('keydown', splashKeyHandler, true) } catch { /* ignore */ }
        splashKeyHandler = null
      }
      try {
        const host = document.getElementById(SPLASH_ID)
        if (!host) return
        host.setAttribute('data-leaving', '')
        splashTimer = window.setTimeout(() => {
          try { host.remove() } catch { /* ignore */ }
          stopSplashLangWatch()
          splashTimer = 0
        }, SPLASH_EXIT_MS)
      } catch { /* ignore */ }
    }

    /** Keep the wash alive (looping) until the shell finishes booting. */
    function enterSplashWaiting() {
      const host = (() => {
        try { return document.getElementById(SPLASH_ID) } catch { return null }
      })()
      if (!host) return
      splashState = 'waiting'
      try { host.setAttribute('data-waiting', '') } catch { /* ignore */ }
      let waited = 0
      splashWaitTimer = window.setInterval(() => {
        waited += 250
        if (shellStillLoading() && waited < SPLASH_WAIT_CAP_MS) return
        clearSplashWait()
        finishSplash()
      }, 250)
    }

    function removeSplash() {
      clearSplashTimer()
      clearSplashWait()
      stopSplashLangWatch()
      splashState = 'idle'
      if (splashKeyHandler) {
        try { document.removeEventListener('keydown', splashKeyHandler, true) } catch { /* ignore */ }
        splashKeyHandler = null
      }
      try {
        const existing = document.getElementById(SPLASH_ID)
        if (existing) existing.remove()
      } catch { /* ignore */ }
    }

    function splashAllowed() {
      if (!state.enabled || !state.splash) return false
      try {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
        // Stored per version, so an update shows the splash once more.
        if (window.sessionStorage.getItem(SPLASH_SESSION_KEY) === VERSION) return false
      } catch { /* storage or matchMedia unavailable */ }
      return true
    }

    /** `?cyrene=splash` forces one play even when this session already saw it. */
    function splashRequestedByUrl() {
      try {
        return new URL(window.location.href).searchParams.get('cyrene') === 'splash'
      } catch {
        return false
      }
    }

    /**
     * The host half injects a static cover into the index HTML so the shell's
     * own "Loading plugins…" screen never shows. When it is there, the splash
     * starts already settled (no veil fade, no rise) and takes the cover's place
     * without a flash.
     *
     * The element is kept in `bootCover` — clearing only the window handle here
     * is what once left the cover stuck on top of everything.
     */
    let bootCover = null

    function takeOverBootCover(host) {
      try {
        const cover = window.__cyBootCover
        if (!cover) return false
        bootCover = cover
        cover.__cyAdopted = true
        host.setAttribute('data-instant', '')
        return true
      } catch {
        return false
      }
    }

    function dropBootCover() {
      const cover = bootCover || (typeof window !== 'undefined' ? window.__cyBootCover : null)
      bootCover = null
      try {
        if (cover) {
          cover.__cyAdopted = true
          if (cover.isConnected !== false) cover.remove()
        }
      } catch { /* ignore */ }
      try { window.__cyBootCover = null } catch { /* ignore */ }
    }

    function playSplash(seconds) {
      try {
        if (typeof document === 'undefined' || !document.body) return false
        const duration = clampSplashSeconds(seconds === undefined ? state.splashSeconds : seconds)
        removeSplash()

        const host = document.createElement('div')
        host.id = SPLASH_ID
        host.setAttribute('role', 'presentation')
        host.setAttribute('data-tone', state.splashTone)
        host.style.setProperty('--cy-splash-dur', duration + 's')
        host.style.setProperty('--cy-splash-size', state.splashSize + 'px')
        // One line per opening, dealt from the deck before the markup is built.
        splashLine = nextSplashLine()
        host.innerHTML = SPLASH_MARKUP
          .replace('{{ART}}', SPLASH_ART)
          .replace('{{CAPTION}}', () => splashCaption())
        const adopted = takeOverBootCover(host)

        // Lifecycle: one intro cycle, then either finish — or, when the shell is
        // still showing its own boot screen, keep looping until that screen is
        // gone. A fixed-length splash would otherwise end and drop the user back
        // onto "Loading plugins…" on a slow machine.
        //
        // Skipping leaves a ripple behind: centred on the pointer when the veil
        // is clicked, in the middle of the screen when a key asks for it. The
        // ring lives inside the veil, so it fades out with it and needs no
        // cleanup of its own.
        const ripple = (x, y) => {
          try {
            const ring = document.createElement('span')
            ring.className = 'cy-splash-ripple'
            ring.setAttribute('aria-hidden', 'true')
            if (typeof x === 'number' && typeof y === 'number') {
              ring.style.setProperty('--cy-ripple-x', x + 'px')
              ring.style.setProperty('--cy-ripple-y', y + 'px')
            }
            host.appendChild(ring)
          } catch { /* ignore */ }
        }

        const skip = (x, y) => {
          if (splashState !== 'intro' && splashState !== 'waiting') return
          ripple(x, y)
          finishSplash()
        }

        const onKey = (event) => {
          if (event.key !== 'Escape' && event.key !== 'Enter' && event.key !== ' ') return
          skip()
        }

        const onClick = (event) => {
          skip(
            typeof event.clientX === 'number' ? event.clientX : null,
            typeof event.clientY === 'number' ? event.clientY : null,
          )
        }

        host.addEventListener('click', onClick, { once: true })
        document.addEventListener('keydown', onKey, true)

        document.body.appendChild(host)
        // The splash is on screen now; drop the host-injected cover underneath.
        if (adopted) dropBootCover()
        // The caption is chosen at paint time, but `dsh-client-locale` may still
        // be activating — if it rewrites `<html lang>` while we are up, follow it
        // instead of leaving the wrong language on screen for the whole intro.
        watchSplashLang()
        try { window.sessionStorage.setItem(SPLASH_SESSION_KEY, VERSION) } catch { /* ignore */ }
        splashState = 'intro'
        splashKeyHandler = onKey

        splashTimer = window.setTimeout(() => {
          splashTimer = 0
          if (shellStillLoading()) enterSplashWaiting()
          else finishSplash()
        }, duration * 1000 + 60)
        return true
      } catch (error) {
        console.warn('[theme-cyrene] splash skipped', error)
        return false
      }
    }

    /* ------------------------------------------------------------------ */
    /* Copy: the two fixed lines the host speaks                           */
    /* ------------------------------------------------------------------ */

    /**
     * Text, not selectors.
     *
     * The welcome headline is rendered from the host's own locale dictionary —
     * there is no slot to occupy and no attribute to hang a `::after` on.
     * Matching the exact string is the narrowest possible hook: nothing else can
     * match it, and if the host ever rewords the line the replacement simply
     * stops applying instead of mangling a random node.
     *
     * The reasoning line is different: the host builds it as one string with the
     * clock inside — `深度求索中，用时 5秒 ···` — so it gets a formatter of its own
     * (`rewriteRunning`) rather than a table entry.
     */
    const COPY = [
      ['探索未至之境', '空白，在诗篇的起点'],
    ]
    /**
     * The reasoning line rotates through these at random.
     *
     * It has two halves: the phrase, then `用时 …` on a second line. The split
     * travels as a newline inside the string (the stylesheet turns it into a
     * break with `white-space: pre-line`), because the whole label is a single
     * text node plus one attribute copy — there is no element to put a `<br>` in.
     */
    const PHRASES = [
      '人家是不是很聪明？快夸夸我',
      '因你而在，如我所书',
      '与你一起，我们无所不能',
      '嘻，到人家表现啦',
      '收下吧，我们的答案',
    ]
    const RUNNING_HEAD = /^(?:深度求索中|Deep diving)\s*(?:[，,]|\bfor\b)\s*([\s\S]*)$/
    // Never rewrite the user's own words: editor fields and code blocks.
    const COPY_SKIP = new Set(['TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SCRIPT', 'STYLE'])
    /**
     * Attributes that carry the same copy.
     *
     * The running label is drawn twice: once as a text node, and once more by a
     * pseudo-element that reads `data-shimmer-text`
     * (`._text[data-shimmer-text]:after { content: attr(...) }`) so the sweep can
     * paint over it. Patching only the text node leaves the original showing
     * through the sweep, which reads as two sentences printed on top of each
     * other. These are the only attributes the patch touches — everything else
     * in the document is left alone.
     */
    const COPY_ATTRS = ['data-shimmer-text', 'aria-label', 'title', 'placeholder', 'alt']

    let copyObserver = null
    // Drawn once per turn, in `startsRunning`, and kept until the next one: the
    // host re-renders this line once a second, so anything periodic here strobes.
    let phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)]

    // The transcript is the user's own text (and the assistant's), so the copy
    // pass must never touch it: a message that happens to contain one of our
    // strings came back altered in the DOM, in copies and in search. The
    // reasoning row lives inside the same container but is the one line there
    // we do own, so it stays exempt.
    const CONVERSATION_SCOPE = '[data-conversation-content]'
    const COPY_KEEP = '[data-chat-running]'

    function insideConversation(node) {
      const el = node.nodeType === 1 ? node : node.parentElement
      if (!el || typeof el.closest !== 'function') return false
      try {
        if (el.closest(COPY_KEEP)) return false
        return el.closest(CONVERSATION_SCOPE) !== null
      } catch {
        return false
      }
    }

    function rewrite(text, forward) {
      let out = text
      for (const [from, to] of COPY) {
        const [a, b] = forward ? [from, to] : [to, from]
        if (out.includes(a)) out = out.split(a).join(b)
      }
      return out
    }

    /** A phrase other than the one on screen right now. */
    function rollPhrase() {
      let next = phrase
      while (next === phrase) next = PHRASES[Math.floor(Math.random() * PHRASES.length)]
      phrase = next
      return phrase
    }

    /** Does this freshly added subtree carry the running row? */
    function startsRunning(node) {
      if (!node || node.nodeType !== 1) return false
      if (typeof node.matches === 'function' && node.matches('[data-chat-running]')) return true
      return typeof node.querySelector === 'function' && node.querySelector('[data-chat-running]') !== null
    }

    /**
     * The reasoning line, in both directions.
     *
     * Returns null when the string is not that line, so the caller falls through
     * to the plain table. Already-formatted values are passed through unchanged:
     * the host re-renders this line once a second and the observer re-patches it
     * just as often.
     */
    function rewriteRunning(value, forward) {
      if (forward) {
        if (value === '深度求索中' || value === 'Deep diving') return phrase
        // Already formatted: keep the clock half, swap in whatever phrase is
        // current. Returning the value unchanged would freeze the rotation on
        // the phrase that happened to be showing when it was first patched.
        for (const candidate of PHRASES) {
          if (!value.startsWith(candidate + '\n')) continue
          return phrase + '\n' + value.slice(candidate.length + 1)
        }
        const match = value.match(RUNNING_HEAD)
        if (!match) return null
        return phrase + '\n' + match[1]
      }
      for (const candidate of PHRASES) {
        if (value === candidate) return '深度求索中'
        if (!value.startsWith(candidate + '\n')) continue
        const tail = value.slice(candidate.length + 1)
        return (tail.startsWith('用时') ? '深度求索中，' : 'Deep diving for ') + tail
      }
      return null
    }

    /** Both rewrites, reasoning line first. */
    function patchValue(value, forward) {
      const running = rewriteRunning(value, forward)
      if (running !== null) return running
      return rewrite(value, forward)
    }

    function rewriteNode(node, forward) {
      if (!node) return
      if (insideConversation(node)) return
      if (node.nodeType === 1) {
        const parent = node.parentNode
        if (parent && COPY_SKIP.has(parent.nodeName)) return
        if (node.isContentEditable) return
        for (const name of COPY_ATTRS) {
          const value = node.getAttribute ? node.getAttribute(name) : null
          if (!value || value.length > 300) continue
          const next = patchValue(value, forward)
          if (next !== value) node.setAttribute(name, next)
        }
        return
      }
      if (node.nodeType !== 3) return
      const parent = node.parentNode
      if (parent && COPY_SKIP.has(parent.nodeName)) return
      if (parent && parent.isContentEditable) return
      const value = node.nodeValue
      if (!value || value.length > 300) return
      const next = patchValue(value, forward)
      if (next !== value) node.nodeValue = next
    }

    function rewriteTree(root, forward) {
      if (!root || typeof document.createTreeWalker !== 'function') return
      try {
        // The walker starts *below* its root, and the shimmer copy lives in an
        // attribute on the root itself — React sets it before inserting the span,
        // so no attribute record ever fires for it. Patch the root by hand.
        rewriteNode(root, forward)
        // 1 = SHOW_ELEMENT (attributes), 4 = SHOW_TEXT.
        const walker = document.createTreeWalker(root, 5, null)
        let node = walker.nextNode()
        while (node) {
          rewriteNode(node, forward)
          node = walker.nextNode()
        }
      } catch { /* ignore */ }
    }

    /**
     * Cheap pre-check before walking a subtree.
     *
     * Patch-on-insert has to be synchronous to be invisible, and synchronous
     * means it runs on every node React appends — which, while a response
     * streams, is a lot. `textContent` is a single native pass, so this throws
     * away the overwhelming majority of subtrees for the price of one string
     * search. The attribute check covers the shimmer copy, whose wording can
     * live in an attribute rather than in a text node.
     */
    function mayHoldCopy(node, forward) {
      // Forward: the host's own wording (the reasoning line's head included).
      // Backward: ours, which for the reasoning line is a rotating phrase.
      const keys = forward
        ? [...COPY.map(([from]) => from), '深度求索中', 'Deep diving']
        : [...COPY.map(([, to]) => to), ...PHRASES]
      const text = node.textContent
      if (text) {
        for (const key of keys) if (text.includes(key)) return true
      }
      for (const name of COPY_ATTRS) {
        const value = node.getAttribute ? node.getAttribute(name) : null
        if (!value) continue
        for (const key of keys) if (value.includes(key)) return true
      }
      return false
    }

    function copyRecords(records) {
      for (const record of records) {
        if (record.type === 'characterData' || record.type === 'attributes') {
          rewriteNode(record.target, true)
          continue
        }
        for (const added of record.addedNodes || []) {
          if (added.nodeType !== 1) {
            rewriteNode(added, true)
            continue
          }
          // Synchronous, and that is the whole point. A MutationObserver
          // callback runs at the microtask checkpoint — after React commits the
          // DOM, before the browser paints — so the host's wording never reaches
          // the screen. Deferring the sweep by even one frame is what made the
          // old headline flash for a moment when a new conversation opened.
          // A new running row means a new turn: draw a phrase for it, and keep
          // that one until the next turn mounts its own row.
          if (startsRunning(added)) rollPhrase()
          if (!mayHoldCopy(added, true)) continue
          rewriteTree(added, true)
        }
      }
    }

    function stopCopy(restore) {
      if (copyObserver) {
        try { copyObserver.disconnect() } catch { /* ignore */ }
        copyObserver = null
      }
      // Turning the theme off should hand the host's own wording back, not leave
      // our line behind until the next navigation.
      if (restore && document.body) rewriteTree(document.body, false)
    }

    function syncCopy() {
      const wanted = state.enabled && state.copy && state.level === 'full'
      if (!wanted) {
        stopCopy(true)
        return
      }
      if (copyObserver) return
      if (typeof MutationObserver !== 'function' || !document.body) return
      try {
        copyObserver = new MutationObserver(copyRecords)
        copyObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          // React rewrites the shimmer attribute on every tick; without this the
          // pseudo-element copy would drift back to the host's wording.
          attributes: true,
          attributeFilter: COPY_ATTRS,
        })
        rewriteTree(document.body, true)
      } catch (error) {
        console.warn('[theme-cyrene] copy patch skipped', error)
        copyObserver = null
      }
    }

    /**
     * Swap the running whale for the signature.
     *
     * The host's `RunningStatus` renders `span.runningIcon` (a 14px APNG-masked
     * whale) plus the shimmer label. Both live inside React's tree, so the
     * replacement has to leave that tree alone: the icon is hidden by CSS, and
     * the signature is *appended* to `span.runningContent` — React never touches
     * nodes it did not create, and `insertAdjacentHTML` keeps its two children
     * where they are.
     *
     * The observer only matters at mount and whenever a new turn starts; the
     * running row is rebuilt then, not while the clock ticks (the tick only
     * rewrites text and attributes).
     */
    const SIGN_ROW = '[data-chat-running]'
    const SIGN_HOST = '[class*="_runningContent"]'

    let signObserver = null
    let signTimer = 0
    let signRoots = new Set()

    function placeSign(row) {
      const host = row.querySelector(SIGN_HOST)
      if (!host || host.querySelector(':scope > .cy-sign')) return
      try {
        host.insertAdjacentHTML('afterbegin', SIGN_MARKUP)
      } catch (error) {
        console.warn('[theme-cyrene] signature skipped', error)
      }
    }

    function syncSignRow(root) {
      if (!root || !root.querySelectorAll) return
      if (root.matches && root.matches(SIGN_ROW)) placeSign(root)
      for (const row of root.querySelectorAll(SIGN_ROW)) placeSign(row)
    }

    function signRecords(records) {
      for (const record of records) {
        for (const added of record.addedNodes || []) {
          if (added.nodeType === 1) signRoots.add(added)
        }
      }
      if (signRoots.size && !signTimer) {
        signTimer = setTimeout(() => {
          signTimer = 0
          const roots = signRoots
          signRoots = new Set()
          for (const root of roots) if (root.isConnected) syncSignRow(root)
        }, 16)
      }
    }

    function stopSign() {
      if (signObserver) {
        try { signObserver.disconnect() } catch { /* ignore */ }
        signObserver = null
      }
      if (signTimer) {
        clearTimeout(signTimer)
        signTimer = 0
      }
      signRoots = new Set()
      // `.cy-sign` only ever matches the injected root; the inner paths carry
      // their own `.cy-sign-*` names.
      if (document.body) {
        for (const node of document.body.querySelectorAll('.cy-sign')) {
          try { node.remove() } catch { /* ignore */ }
        }
      }
    }

    function syncSign() {
      // The ♪ needs no DOM at all, so in that mode this whole path stays off.
      const wanted = RUNNING_ICON === 'signature' && state.enabled && state.level === 'full'
      if (!wanted) {
        stopSign()
        return
      }
      if (signObserver) return
      if (typeof MutationObserver !== 'function' || !document.body) return
      try {
        signObserver = new MutationObserver(signRecords)
        signObserver.observe(document.body, { childList: true, subtree: true })
        syncSignRow(document.body)
      } catch (error) {
        console.warn('[theme-cyrene] signature skipped', error)
        signObserver = null
      }
    }

    function render() {
      const root = document.documentElement
      root.setAttribute('data-cyrene', state.enabled ? 'on' : 'off')
      root.setAttribute('data-cyrene-preset', state.preset)
      root.setAttribute('data-cyrene-chrome', state.chrome)
      root.setAttribute('data-cyrene-level', state.level)
      root.setAttribute('data-cyrene-chatbg', state.chatBg ? 'on' : 'off')
      root.setAttribute('data-cyrene-anchor', state.chatBgAnchor)
      root.setAttribute('data-cyrene-runicon', RUNNING_ICON)
      root.style.setProperty('--cy-chat-art-y', state.chatBgY + 'px')
      root.style.setProperty('--cy-intensity', String(state.intensity))

      if (state.enabled) {
        ensureStyle()
        ensureChatArt()
      }
      // The ambient wash belongs to the fullest level only.
      if (state.enabled && state.ambient && state.level === 'full') ensureAmbient()
      else removeAmbient()

      syncCopy()
      syncSign()

      // The panel is built on first use and only hidden afterwards, so the
      // shortcut can bring it up long after mount.
      if (state.panel) showPanel(true)
      else if (panel) showPanel(false)
      emitTheme()
      nudgeCaption()
    }

    /**
     * Ask the desktop preload to re-report the caption palette.
     *
     * The Windows preload measures a probe span and sends the result over IPC,
     * but its MutationObserver only watches `html[lang]`,
     * `body[data-ds-dark-theme|style]` and the `<head>` subtree — our theme
     * switches touch `<html>` attributes only, so without this poke the caption
     * buttons keep the colour measured at boot.
     */
    let captionRev = 0
    function nudgeCaption() {
      try {
        const body = document.body
        if (!body || !body.style) return
        captionRev = (captionRev + 1) % 100000
        body.style.setProperty('--cy-caption-rev', String(captionRev))
      } catch { /* ignore */ }
    }

    /* ------------------------------------------------------------------ */
    /* Debug panel                                                         */
    /* ------------------------------------------------------------------ */

    const PANEL_CSS = `
      :host { all: initial; }
      .card {
        width: 232px;
        font: 12px/1.5 "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
        color: #f7eef9;
        background: rgba(28, 20, 38, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 14px;
        box-shadow: 0 12px 34px rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(14px) saturate(140%);
        overflow: hidden;
        user-select: none;
      }
      header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        background: linear-gradient(90deg, rgba(224, 112, 176, 0.32), rgba(139, 95, 208, 0.28));
        cursor: grab;
      }
      header:active { cursor: grabbing; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #f2a6d4; box-shadow: 0 0 8px #f2a6d4; }
      .dot.off { background: #7a6b86; box-shadow: none; }
      .title { font-weight: 600; letter-spacing: 0.4px; }
      .ver { margin-left: auto; opacity: 0.6; font-size: 10px; }
      .body { padding: 10px 12px 12px; display: grid; gap: 9px; }
      .body.hidden { display: none; }
      .row { display: flex; align-items: center; gap: 8px; }
      .row > span:first-child { width: 42px; opacity: 0.72; font-size: 11px; }
      .chips { display: flex; gap: 5px; flex: 1; }
      button {
        font: inherit; color: inherit; cursor: pointer;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 9px;
        padding: 3px 9px;
        transition: background 140ms ease, border-color 140ms ease;
      }
      button:hover { background: rgba(255, 255, 255, 0.16); }
      button[aria-pressed="true"] {
        background: linear-gradient(135deg, #e070b0, #9b6ae0);
        border-color: transparent;
        color: #fff;
      }
      .chips button { flex: 1; padding: 3px 0; font-size: 11px; }
      input[type="range"] { flex: 1; accent-color: #e070b0; height: 16px; }
      input[type="text"] {
        flex: 1; min-width: 0; font: inherit; font-size: 11px; color: inherit;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px; padding: 3px 7px; outline: none;
      }
      input[type="text"]:focus { border-color: rgba(224, 112, 176, 0.7); }
      output { width: 34px; text-align: right; font-variant-numeric: tabular-nums; opacity: 0.8; }
      .actions { display: flex; gap: 6px; margin-top: 2px; }
      .actions button { flex: 1; font-size: 11px; padding: 5px 0; }
      .actions button.danger { color: #ffd0e4; border-color: rgba(255, 150, 200, 0.4); }
      .hint { margin: 2px 0 0; font-size: 10px; line-height: 1.5; opacity: 0.5; }
      kbd {
        font: inherit; font-size: 10px; padding: 0 4px; border-radius: 4px;
        background: rgba(255, 255, 255, 0.1);
      }
      code { font-size: 10px; background: rgba(255, 255, 255, 0.1); padding: 0 3px; border-radius: 3px; }
    `

    function createPanel() {
      const host = document.createElement('div')
      host.id = PANEL_ID
      host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;'
      const shadow = host.attachShadow({ mode: 'open' })
      const sheet = document.createElement('style')
      sheet.textContent = PANEL_CSS
      shadow.appendChild(sheet)

      const card = document.createElement('div')
      card.className = 'card'
      card.innerHTML = `
        <header title="拖动移动 / 点击折叠">
          <span class="dot"></span>
          <span class="title">昔涟主题</span>
          <span class="ver">v${VERSION}</span>
        </header>
        <div class="body">
          <div class="row">
            <span>启用</span>
            <button data-role="toggle" aria-pressed="true">开</button>
          </div>
          <div class="row">
            <span>配色</span>
            <div class="chips"></div>
          </div>
          <div class="row">
            <span>强度</span>
            <input data-role="intensity" type="range" min="0" max="100" step="1" />
            <output data-role="intensity-out">80%</output>
          </div>
          <div class="row">
            <span>氛围层</span>
            <button data-role="ambient" aria-pressed="true">开</button>
          </div>
          <div class="row">
            <span>对话背景</span>
            <button data-role="chatbg" aria-pressed="true" title="线稿水印，只在「全」档生效">开</button>
          </div>
          <div class="row">
            <span>水印对齐</span>
            <button data-role="chatbg-anchor" title="中：水平居中，窗口怎么变都在正中；右：贴着右边走">中</button>
          </div>
          <div class="row">
            <span>水印位置</span>
            <input data-role="chatbg-y" type="range" min="0" max="360" step="4" />
            <output data-role="chatbg-y-out">160</output>
          </div>
          <div class="row">
            <span>品牌字样</span>
            <input data-role="brand" type="text" spellcheck="false" autocomplete="off" />
          </div>
          <div class="row">
            <span>开场文案</span>
            <button data-role="copy" aria-pressed="true" title="「探索未至之境」换掉，思考中那句随机轮换；只在「全」档生效">开</button>
          </div>
          <div class="row">
            <span>按钮配色</span>
            <button data-role="chrome" aria-pressed="true" title="标题栏那条用的是侧栏色；跟随画布只用于试验">跟随侧栏</button>
          </div>
          <div class="row">
            <span>开屏</span>
            <button data-role="splash" aria-pressed="true" title="点击画面或按 Esc 可跳过">开</button>
            <button data-role="splash-play" title="立刻重播一次">▶</button>
          </div>
          <div class="row">
            <span>时长</span>
            <input data-role="splash-dur" type="range" min="1" max="5" step="0.5" />
            <output data-role="splash-dur-out">2.5s</output>
          </div>
          <div class="row">
            <span>底色</span>
            <button data-role="splash-tone" aria-pressed="true">粉</button>
          </div>
          <div class="row">
            <span>角色</span>
            <input data-role="splash-size" type="range" min="300" max="720" step="10" />
            <output data-role="splash-size-out">460</output>
          </div>
          <div class="actions">
            <button data-role="wind">重播特效</button>
            <button data-role="copy-diag">复制诊断</button>
            <button data-role="panic" class="danger">紧急恢复</button>
          </div>
          <p class="hint">
            <span data-role="hint-keys"></span> 开关主题 ·
            <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>P</kbd> 面板<br />
            地址栏加 <code>?cyrene=off</code> 可强制关闭
          </p>
        </div>
      `
      shadow.appendChild(card)

      const bodyEl = card.querySelector('.body')
      const chips = card.querySelector('.chips')
      const toggleBtn = card.querySelector('[data-role="toggle"]')
      const dot = card.querySelector('.dot')
      const ambientBtn = card.querySelector('[data-role="ambient"]')
      const chatBgBtn = card.querySelector('[data-role="chatbg"]')
      const chatBgAnchorBtn = card.querySelector('[data-role="chatbg-anchor"]')
      const chatBgRange = card.querySelector('[data-role="chatbg-y"]')
      const chatBgOut = card.querySelector('[data-role="chatbg-y-out"]')
      const range = card.querySelector('[data-role="intensity"]')
      const rangeOut = card.querySelector('[data-role="intensity-out"]')
      const brandInput = card.querySelector('[data-role="brand"]')
      const copyBtn = card.querySelector('[data-role="copy"]')
      const chromeBtn = card.querySelector('[data-role="chrome"]')
      const splashBtn = card.querySelector('[data-role="splash"]')
      const splashPlayBtn = card.querySelector('[data-role="splash-play"]')
      const splashRange = card.querySelector('[data-role="splash-dur"]')
      const splashOut = card.querySelector('[data-role="splash-dur-out"]')
      const splashToneBtn = card.querySelector('[data-role="splash-tone"]')
      const splashSizeRange = card.querySelector('[data-role="splash-size"]')
      const splashSizeOut = card.querySelector('[data-role="splash-size-out"]')
      const hintKeys = card.querySelector('[data-role="hint-keys"]')

      for (const preset of PRESETS) {
        const btn = document.createElement('button')
        btn.textContent = preset.label
        btn.title = preset.hint
        btn.dataset.preset = preset.id
        btn.addEventListener('click', () => setState({ preset: preset.id }))
        chips.appendChild(btn)
      }

      toggleBtn.addEventListener('click', () => setState({ enabled: !state.enabled }))
      ambientBtn.addEventListener('click', () => setState({ ambient: !state.ambient }))
      chatBgBtn.addEventListener('click', () => setState({ chatBg: !state.chatBg }))
      chatBgAnchorBtn.addEventListener('click', () => {
        setState({ chatBgAnchor: state.chatBgAnchor === 'center' ? 'right' : 'center' })
      })
      chatBgRange.addEventListener('input', () => setState({ chatBgY: Number(chatBgRange.value) }))
      range.addEventListener('input', () => setState({ intensity: Number(range.value) / 100 }))
      brandInput.addEventListener('change', () => api.brand(brandInput.value))
      copyBtn.addEventListener('click', () => setState({ copy: !state.copy }))
      chromeBtn.addEventListener('click', () => {
        setState({ chrome: state.chrome === 'canvas' ? 'sidebar' : 'canvas' })
      })
      splashBtn.addEventListener('click', () => setState({ splash: !state.splash }))
      splashPlayBtn.addEventListener('click', () => api.splashPlay())
      splashRange.addEventListener('input', () => {
        setState({ splashSeconds: Number(splashRange.value) })
      })
      splashToneBtn.addEventListener('click', () => {
        setState({ splashTone: state.splashTone === 'pink' ? 'white' : 'pink' })
      })
      splashSizeRange.addEventListener('input', () => {
        setState({ splashSize: Number(splashSizeRange.value) })
      })
      splashSizeRange.addEventListener('change', () => {
        // 松手后再放一次，省得多点一下 ▶
        if (state.splash) api.splashPlay()
      })

      card.querySelector('[data-role="copy-diag"]').addEventListener('click', async () => {
        const report = JSON.stringify({ ...snapshot(), tokens: readTokens() }, null, 2)
        try {
          await navigator.clipboard.writeText(report)
        } catch {
          console.info('[theme-cyrene] diagnostics\n' + report)
        }
      })

      card.querySelector('[data-role="panic"]').addEventListener('click', () => {
        api.panic()
      })

      // 标题特效是一次性的，切页面才重播；想在原地再看一遍就点这个。
      const windBtn = card.querySelector('[data-role="wind"]')
      windBtn.addEventListener('click', () => {
        const played = replayWind()
        windBtn.textContent = played ? '重播中…' : '先切到新对话页'
        clearTimeout(windBtn.cyReset)
        windBtn.cyReset = setTimeout(() => { windBtn.textContent = '重播特效' }, 1800)
      })

      const head = card.querySelector('header')
      let dragStart = null
      head.addEventListener('pointerdown', (event) => {
        dragStart = { x: event.clientX, y: event.clientY, moved: false }
        head.setPointerCapture?.(event.pointerId)
      })
      head.addEventListener('pointermove', (event) => {
        if (!dragStart) return
        const dx = event.clientX - dragStart.x
        const dy = event.clientY - dragStart.y
        if (Math.abs(dx) + Math.abs(dy) > 3) dragStart.moved = true
        if (dragStart.moved) {
          const rect = host.getBoundingClientRect()
          const left = Math.min(window.innerWidth - 40, Math.max(4, rect.left + dx))
          const top = Math.min(window.innerHeight - 40, Math.max(4, rect.top + dy))
          host.style.left = left + 'px'
          host.style.top = top + 'px'
          host.style.right = 'auto'
          host.style.bottom = 'auto'
          dragStart.x = event.clientX
          dragStart.y = event.clientY
        }
      })
      head.addEventListener('pointerup', () => {
        if (dragStart && !dragStart.moved) bodyEl.classList.toggle('hidden')
        dragStart = null
      })

      function sync(current) {
        dot.classList.toggle('off', !current.enabled)
        toggleBtn.setAttribute('aria-pressed', String(current.enabled))
        toggleBtn.textContent = current.enabled ? '开' : '关'
        ambientBtn.setAttribute('aria-pressed', String(current.ambient))
        ambientBtn.textContent = current.ambient ? '开' : '关'
        chatBgBtn.setAttribute('aria-pressed', String(current.chatBg))
        chatBgBtn.textContent = current.chatBg ? '开' : '关'
        chatBgAnchorBtn.setAttribute('aria-pressed', String(current.chatBgAnchor === 'center'))
        chatBgAnchorBtn.textContent = current.chatBgAnchor === 'center' ? '中' : '右'
        chatBgRange.value = String(current.chatBgY)
        chatBgOut.textContent = String(current.chatBgY)
        range.value = String(Math.round(current.intensity * 100))
        rangeOut.textContent = Math.round(current.intensity * 100) + '%'
        if (shadow.activeElement !== brandInput) brandInput.value = brandText
        copyBtn.setAttribute('aria-pressed', String(current.copy))
        copyBtn.textContent = current.copy ? '开' : '关'
        chromeBtn.textContent = current.chrome === 'sidebar' ? '跟随侧栏' : '跟随画布'
        chromeBtn.setAttribute('aria-pressed', String(current.chrome === 'sidebar'))
        splashBtn.textContent = current.splash ? '开' : '关'
        splashBtn.setAttribute('aria-pressed', String(current.splash))
        splashRange.value = String(current.splashSeconds)
        splashOut.textContent = current.splashSeconds.toFixed(1) + 's'
        splashToneBtn.textContent = current.splashTone === 'white' ? '白' : '粉'
        splashToneBtn.setAttribute('aria-pressed', String(current.splashTone === 'pink'))
        splashSizeRange.value = String(current.splashSize)
        splashSizeOut.textContent = String(current.splashSize)
        // The hint line follows the shortcut the user actually set.
        if (hintKeys) {
          hintKeys.textContent = ''
          comboParts(current.shortcut || DEFAULT_SHORTCUT).forEach((part, index) => {
            if (index) hintKeys.appendChild(document.createTextNode('+'))
            const kbd = document.createElement('kbd')
            kbd.textContent = part
            hintKeys.appendChild(kbd)
          })
        }
        chips.querySelectorAll('button').forEach((btn) => {
          btn.setAttribute('aria-pressed', String(btn.dataset.preset === current.preset))
        })
      }

      sync(state)
      document.body.appendChild(host)
      return { host, sync }
    }

    function showPanel(show) {
      if (show) {
        if (!panel) {
          try {
            panel = createPanel()
          } catch (error) {
            // A broken panel must never take the theme down with it.
            console.warn('[theme-cyrene] panel skipped', error)
            return
          }
        }
        panel.host.style.display = ''
        panel.sync(state)
      } else if (panel) {
        panel.host.style.display = 'none'
      }
    }

    function destroyPanel() {
      if (panel) panel.host.remove()
      panel = null
    }

    /* ------------------------------------------------------------------ */
    /* Diagnostics                                                         */
    /* ------------------------------------------------------------------ */

    const TOKEN_PROBES = [
      '--dsw-alias-bg-base',
      '--dsw-alias-bg-layer-1',
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-label-primary',
      '--dsw-alias-label-secondary',
      '--dsw-alias-border-l2',
      '--dsw-alias-brand-primary',
      '--dsw-alias-state-business-primary',
      '--dsw-specific-sidebar-fill',
      '--dsw-specific-bubble',
      '--dsw-radius-md',
      '--dsw-shadow-lv2',
    ]

    function readTokens() {
      const out = {}
      try {
        const style = getComputedStyle(document.body)
        for (const name of TOKEN_PROBES) out[name] = style.getPropertyValue(name).trim()
      } catch { /* ignore */ }
      return out
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */
    /* ------------------------------------------------------------------ */

    function onKeydown(event) {
      // While the settings row is recording, the keyboard belongs to it.
      if (captureState.active) return
      const combo = comboFromEvent(event)
      if (!combo) return
      if (combo === state.shortcut) {
        event.preventDefault()
        setState({ enabled: !state.enabled })
      } else if (combo === PANEL_SHORTCUT) {
        event.preventDefault()
        setState({ panel: !state.panel })
      }
    }

    const api = {
      version: VERSION,
      presets: PRESETS.map((p) => p.id),
      get state() { return snapshot() },
      enable() { return setState({ enabled: true }) },
      disable() { return setState({ enabled: false }) },
      toggle() { return setState({ enabled: !state.enabled }) },
      preset(name) {
        if (name === undefined) return PRESETS.map((p) => p.id)
        return setState({ preset: name })
      },
      intensity(value) {
        if (value === undefined) return state.intensity
        return setState({ intensity: value })
      },
      ambient(on) {
        if (on === undefined) return state.ambient
        return setState({ ambient: !!on })
      },
      chatBg(on) {
        if (on === undefined) return state.chatBg
        return setState({ chatBg: !!on })
      },
      chatBgY(value) {
        if (value === undefined) return state.chatBgY
        return setState({ chatBgY: value })
      },
      chatBgAnchor(value) {
        if (value === undefined) return state.chatBgAnchor
        return setState({ chatBgAnchor: value === 'right' ? 'right' : 'center' })
      },
      copy(on) {
        if (on === undefined) return state.copy
        return setState({ copy: !!on })
      },
      copyMap() {
        return {
          lines: COPY.map(([from, to]) => ({ from, to })),
          phrases: [...PHRASES],
        }
      },
      panel(show) {
        if (show === undefined) return state.panel
        return setState({ panel: !!show })
      },
      reset() {
        try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
        state = { ...DEFAULT_STATE }
        render()
        return snapshot()
      },
      panic() {
        // Emergency off has to outlive the tab: writing the closed state back
        // is what makes it stick, so a reload does not quietly switch the pack
        // on again. `force` because the URL lock is what the user is fleeing.
        state = { ...DEFAULT_STATE, enabled: false, ambient: false, chatBg: false, chatBgAnchor: 'center' }
        render()
        persist(true)
        return snapshot()
      },
      /** 重播标题上的那次风：切页面会自动播，这里是手动再来一遍。 */
      wind() {
        return replayWind()
      },
      brand(value) {
        if (value === undefined) return brandText
        const next = String(value).replace(/\s+/g, ' ').trim().slice(0, 32)
        brandText = next || BRAND_FALLBACK
        emitBrand()
        return brandText
      },
      chrome(mode) {
        if (mode === undefined) return state.chrome
        return setState({ chrome: mode })
      },
      level(value) {
        if (value === undefined) return state.level
        return setState({ level: value })
      },
      splash(on) {
        if (on === undefined) return state.splash
        return setState({ splash: !!on })
      },
      splashSeconds(value) {
        if (value === undefined) return state.splashSeconds
        return setState({ splashSeconds: value })
      },
      splashPlay(seconds) {
        return playSplash(seconds)
      },
      splashTone(tone) {
        if (tone === undefined) return state.splashTone
        return setState({ splashTone: tone === 'white' ? 'white' : 'pink' })
      },
      splashSize(value) {
        if (value === undefined) return state.splashSize
        return setState({ splashSize: value })
      },
      splashStop() {
        removeSplash()
        return true
      },
      shortcut(combo) {
        if (combo === undefined) return state.shortcut
        return setState({ shortcut: combo })
      },
      splashState() {
        return splashState
      },
      tokens: readTokens,
      help() {
        console.info(
          '[theme-cyrene] window.__cyrene：\n' +
          '  .toggle() / .enable() / .disable()\n' +
          '  .preset("moon"|"tide"|"nightfall")\n' +
          '  .intensity(0..1) / .ambient(true|false) / .panel(true|false)\n' +
          '  .chatBg(true|false) 对话背景水印（只在「全」档显示）\n' +
          '  .chatBgY(160) 水印下缘离对话区底部的距离（0–360px）\n' +
          '  .chatBgAnchor("right"|"center") 水印横向贴右 / 居中\n' +
          '  .level("tint"|"full") 美化程度，等同设置里的两档\n' +
          '  .shortcut("ctrl+alt+x") 开关主题的快捷键；.shortcut() 读当前值\n' +
          '  .splash(true|false) / .splashSeconds(1..5) / .splashPlay() 开屏动画\n' +
          '  .splashTone("pink"|"white") 开屏底色\n' +
          '  .splashSize(460) 开屏角色高度（300–720）\n' +
          '  .brand("昔涟 Harness") 改侧栏品牌字样；.brand() 读当前值\n' +
          '  .copy(true|false) 文案替换（开场那句 + 思考中随机轮换的句子）；.copyMap() 看对照表\n' +
          '  .chrome("canvas"|"sidebar") 窗口按钮跟哪块底色走\n' +
          '  .tokens() 读取当前 token；.reset() 恢复默认；.panic() 紧急关闭'
        )
      },
    }

    function mount() {
      ensureStyle()
      render()

      document.addEventListener('keydown', onKeydown, true)
      disposeFns.push(() => document.removeEventListener('keydown', onKeydown, true))

      if (state.panel) showPanel(true)

      window.__cyrene = api
      window.cyrene = api

      if (splashRequestedByUrl() || splashAllowed()) playSplash()
      else dropBootCover()

      return function dispose() {
        cancelShortcutCapture()
        for (const fn of disposeFns.splice(0)) {
          try { fn() } catch { /* ignore */ }
        }
        destroyPanel()
        removeAmbient()
        removeSplash()
        dropChatArt()
        stopCopy(true)
        stopSign()
        if (styleEl && styleEl.isConnected) styleEl.remove()
        styleEl = null
        const root = document.documentElement
        root.removeAttribute('data-cyrene')
        root.removeAttribute('data-cyrene-preset')
        root.removeAttribute('data-cyrene-chrome')
        root.removeAttribute('data-cyrene-level')
        root.removeAttribute('data-cyrene-chatbg')
        root.removeAttribute('data-cyrene-anchor')
        root.removeAttribute('data-cyrene-runicon')
        root.style.removeProperty('--cy-chat-art-y')
        root.style.removeProperty('--cy-intensity')
        if (window.__cyrene === api) delete window.__cyrene
        if (window.cyrene === api) delete window.cyrene
        mounted = false
      }
    }

    /* ------------------------------------------------------------------ */
    /* Brand slot: the sidebar's top-left mark and name                    */
    /* ------------------------------------------------------------------ */

    const BRAND_FALLBACK = 'DeepSeek Harness'
    const brandSubscribers = new Set()
    const themeSubscribers = new Set()
    let brandText = BRAND_FALLBACK

    // Four petals around a lit core, drawn in the palette's own gradient.
    const BRAND_PETALS = [
      'M16 3.2c3.3 4.4 3.3 7.9 0 12.3-3.3-4.4-3.3-7.9 0-12.3Z',
      'M28.8 16c-4.4 3.3-7.9 3.3-12.3 0 4.4-3.3 7.9-3.3 12.3 0Z',
      'M16 28.8c-3.3-4.4-3.3-7.9 0-12.3 3.3 4.4 3.3 7.9 0 12.3Z',
      'M3.2 16c4.4-3.3 7.9-3.3 12.3 0-4.4 3.3-7.9 3.3-12.3 0Z',
    ]

    // The shipped wordmark and fish are reusable: with the theme off the brand
    // slot keeps rendering exactly what the official package would render.
    let primitives = null
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    } catch {
      primitives = null
    }

    function emitBrand() {
      for (const fn of brandSubscribers) {
        try { fn() } catch { /* ignore */ }
      }
    }

    function emitTheme() {
      for (const fn of themeSubscribers) {
        try { fn() } catch { /* ignore */ }
      }
    }

    function subscribeBrand(fn) {
      brandSubscribers.add(fn)
      return () => brandSubscribers.delete(fn)
    }

    function subscribeTheme(fn) {
      themeSubscribers.add(fn)
      return () => themeSubscribers.delete(fn)
    }

    function useThemeSnapshot() {
      if (React && typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribeTheme, () => state, () => state)
      }
      return state
    }

    function useBrandText() {
      if (React && typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribeBrand, () => brandText, () => brandText)
      }
      return brandText
    }

    /** The shipped brand is used only when this pack is off, or at the lightest level. */
    function usesShippedBrand(current) {
      return !current.enabled || current.level === 'tint'
    }

    function BrandMark(props) {
      const current = useThemeSnapshot()
      const size = Math.max(12, Number(props && props.size) || 24)
      if (usesShippedBrand(current) && primitives && typeof primitives.FishLogo === 'function') {
        // Same trick as the wordmark: the shipped fish paints its path with
        // currentColor, so tagging it lets one `color` recolour the mark.
        return h(primitives.FishLogo, { size, className: 'cy-brand-fish' })
      }
      return h('svg', {
        className: 'cy-brand-mark',
        width: size,
        height: size,
        viewBox: '0 0 32 32',
        role: 'img',
        'aria-label': 'Cyrene',
      },
      h('defs', null,
        h('linearGradient', {
          id: 'cy-brand-petal',
          x1: '4', y1: '2', x2: '28', y2: '30',
          gradientUnits: 'userSpaceOnUse',
        },
        h('stop', { offset: '0', stopColor: '#ffd7ec' }),
        h('stop', { offset: '0.55', stopColor: '#f0a0cf' }),
        h('stop', { offset: '1', stopColor: '#b98be8' }))),
      h('g', { fill: 'url(#cy-brand-petal)' },
        BRAND_PETALS.map((d, index) => h('path', { key: 'petal-' + index, d }))),
      h('circle', { cx: 16, cy: 16, r: 3.2, fill: '#fff6fb', opacity: 0.92 }))
    }

    function BrandName() {
      const current = useThemeSnapshot()
      const text = useBrandText()
      if (usesShippedBrand(current) && primitives && typeof primitives.BrandWordmark === 'function') {
        // Below 「全」 the shipped logotype stays, recoloured by
        // `html[data-cyrene="on"] .cy-brand-wordmark` — its paths are all
        // currentColor, so one `color` is enough.
        return h(primitives.BrandWordmark, { includeMark: false, className: 'cy-brand-wordmark' })
      }
      return h('span', { className: 'cy-brand-name' }, text)
    }

    /* ------------------------------------------------------------------ */
    /* 标题特效的运行时                                                    */
    /* ------------------------------------------------------------------ */

    let windEffect = null

    /** 特效的 api 只在第一次用到时才建：晚一分钟也不影响首屏。 */
    function windFx() {
      if (!windEffect) windEffect = createWindEffect()
      return windEffect
    }

    function windClock() {
      try {
        if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
          return performance.now()
        }
      } catch { /* ignore */ }
      return Date.now()
    }

    function prefersStill() {
      try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      } catch {
        return false
      }
    }

    /**
     * `blur()` 和 `shadowBlur` 的单位是设备像素，不跟 ctx 的 transform 走。
     * 舞台缩到六分之一以后，原稿里 23px 的柔光会摊成一团白雾，所以按当前
     * 比例重新换算——在 context 实例上盖一层访问器就够了，绘制代码一行不
     * 用改，`assets/effect/procedural-effect.js` 也就能保持原样。
     */
    function adoptBlurScale(ctx, unit) {
      let scale = unit
      const read = (name) => {
        try {
          const proto = Object.getPrototypeOf(ctx)
          return proto ? Object.getOwnPropertyDescriptor(proto, name) : null
        } catch {
          return null
        }
      }
      const filter = read('filter')
      if (filter && filter.get && filter.set) {
        try {
          Object.defineProperty(ctx, 'filter', {
            configurable: true,
            get() { return filter.get.call(this) },
            set(value) {
              filter.set.call(this, String(value).replace(
                /blur\(\s*([\d.]+)px\s*\)/g,
                (_, size) => 'blur(' + (Number(size) * scale).toFixed(2) + 'px)',
              ))
            },
          })
        } catch { /* ignore */ }
      }
      const shadow = read('shadowBlur')
      if (shadow && shadow.get && shadow.set) {
        try {
          Object.defineProperty(ctx, 'shadowBlur', {
            configurable: true,
            get() { return shadow.get.call(this) },
            set(value) { shadow.set.call(this, Number(value) * scale) },
          })
        } catch { /* ignore */ }
      }
      return (next) => { scale = next }
    }

    // Range 量实际文字，不能拿整行 flex 容器的宽度（它通常和输入卡片一样宽）。
    // 每个文字片段按可见行合并，兼容中文、英文、徽章以及窄窗口换行。
    function measureWindTitle(canvas) {
      const headline = canvas.closest('[class*="_headline"]')
      const title = headline && headline.querySelector('[class*="_titleGroup"]')
      const mark = headline && (headline.querySelector('.cy-hero-mark') || headline.querySelector('[class*="_fishHitbox"]'))
      if (!title || !mark) return null
      const fragments = []
      const walker = document.createTreeWalker(title, 4 /* SHOW_TEXT */)
      const range = document.createRange()
      let node
      while ((node = walker.nextNode())) {
        const value = node.nodeValue || ''
        const start = value.search(/\S/)
        if (start < 0) continue
        const parentStyle = getComputedStyle(node.parentElement)
        if (parentStyle.visibility === 'hidden' || parentStyle.display === 'none') continue
        range.setStart(node, start)
        range.setEnd(node, value.trimEnd().length)
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) {
            fragments.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })
          }
        }
      }
      if (!fragments.length) return null
      fragments.sort((a, b) => a.top - b.top || a.left - b.left)
      const rows = []
      for (const rect of fragments) {
        const middle = (rect.top + rect.bottom) / 2
        const row = rows.find((r) => Math.abs((r.top + r.bottom) / 2 - middle) < Math.min(r.bottom - r.top, rect.bottom - rect.top) / 2)
        if (row) {
          row.left = Math.min(row.left, rect.left)
          row.right = Math.max(row.right, rect.right)
          row.top = Math.min(row.top, rect.top)
          row.bottom = Math.max(row.bottom, rect.bottom)
        } else rows.push({ ...rect })
      }
      const fontSize = parseFloat(getComputedStyle(title).fontSize) || 26
      const unit = Math.min(0.34, WIND_UNIT * fontSize / 26)
      const icon = mark.getBoundingClientRect()
      if (!icon.width || !icon.height) return null
      const centerX = icon.left + icon.width / 2
      const centerY = icon.top + icon.height / 2
      const textLeft = Math.min(...rows.map((r) => r.left))
      const textRight = Math.max(...rows.map((r) => r.right))
      const textTop = Math.min(...rows.map((r) => r.top))
      const textBottom = Math.max(...rows.map((r) => r.bottom))
      // 圆环直径约为徽标的 1.55 倍，不随标题长度扩大，也不被短文案裁断。
      const ringScale = icon.width / (360 * unit)
      const halo = 360 * unit * ringScale
      const fanScale = Math.max(1, (textBottom - textTop) / (320 * unit))
      const left = Math.min(centerX - 350 * unit, centerX - halo, textLeft)
      const right = Math.max(textRight, centerX + halo)
      const top = Math.min(centerY - Math.max(250 * unit, halo), textTop - 130 * unit)
      const bottom = Math.max(centerY + Math.max(250 * unit, halo), textBottom + 130 * unit)
      const origin = headline.getBoundingClientRect()
      canvas.style.left = (left - origin.left - headline.clientLeft) + 'px'
      canvas.style.top = (top - origin.top - headline.clientTop) + 'px'
      canvas.style.width = (right - left) + 'px'
      canvas.style.height = (bottom - top) + 'px'
      return {
        width: right - left, height: bottom - top,
        dpr: Math.max(1, Math.min(3, window.devicePixelRatio || 1)),
        lines: rows.map((r) => ({ left: r.left - left, top: r.top - top,
          width: r.right - r.left, height: r.bottom - r.top, unit })),
        sweep: { originX: centerX - left, originY: centerY - top,
          endX: textRight - left, endY: (textTop + textBottom) / 2 - top,
          unit, fanScale, ringScale },
      }
    }

    /** 播一遍；观察文案/布局变化。返回的 stop 释放整个挂载周期的资源。 */
    function playWind(canvas) {
      const noop = () => {}
      if (!canvas || typeof canvas.getContext !== 'function') return noop
      let ctx = null
      try { ctx = canvas.getContext('2d') } catch { return noop }
      if (!ctx) return noop
      // 先停旧实例，再安装 blur 适配器，避免重播留下监听或另一条循环。
      try { if (canvas.cyWindStop) canvas.cyWindStop() } catch { /* ignore */ }
      const frame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : null
      const cancel = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : null
      const setUnit = adoptBlurScale(ctx, 1)
      let started = windClock()
      let box = null
      let timer = 0
      let stopped = false
      let resizeObserver = null
      let mutationObserver = null
      const headline = canvas.closest ? canvas.closest('[class*="_headline"]') : null
      const titleText = () => headline?.querySelector('[class*="_titleGroup"]')?.textContent || ''
      let text = titleText()

      // 布局测量不进逐帧路径；字号管花瓣大小，文字宽度只管横向行程。
      const measure = () => {
        const next = measureWindTitle(canvas)
        if (!next) {
          canvas.style.width = '0px'
          canvas.style.height = '0px'
          return null
        }
        const backingWidth = Math.ceil(next.width * next.dpr)
        const backingHeight = Math.ceil(next.height * next.dpr)
        if (canvas.width !== backingWidth) canvas.width = backingWidth
        if (canvas.height !== backingHeight) canvas.height = backingHeight
        return next
      }

      const clear = () => {
        try {
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0)
        } catch { /* ignore */ }
      }

      const paint = (seconds) => {
        clear()
        if (!box || seconds >= WIND_TO || prefersStill()) return
        try {
          ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0)
          const { unit, originX, originY, endX, endY, fanScale, ringScale } = box.sweep
          setUnit(box.dpr * unit)
          const options = {
            width: 1920 * unit, height: 1080 * unit,
            sweep: { originX: originX / unit, originY: originY / unit,
              endX: endX / unit, endY: endY / unit, fanScale, ringScale, leftScale: 0.6 },
          }
          // 一个图标光环、一组风和花瓣；多行只展开扇面，不逐行复制动效。
          windFx().render(ctx, seconds, { ...options, wind: false, petals: false })
          ctx.save()
          try {
            ctx.beginPath()
            ctx.rect(0, 0, endX, box.height)
            ctx.clip()
            windFx().render(ctx, seconds, { ...options, ring: false })
          } finally { ctx.restore() }
        } catch (error) {
          stop()
          console.warn('[theme-cyrene] hero wind frame skipped', error)
        }
      }

      const tick = (now) => {
        timer = 0
        if (stopped) return
        const seconds = WIND_FROM + Math.max(0, now - started) / 1000
        paint(seconds)
        if (!stopped && seconds < WIND_TO && frame && !prefersStill()) timer = frame(tick)
      }

      const onResize = () => {
        if (stopped) return
        box = measure()
        paint(WIND_FROM + Math.max(0, windClock() - started) / 1000)
      }

      const onText = () => {
        if (stopped) return
        const nextText = titleText()
        if (nextText !== text) {
          text = nextText
          started = windClock()
          if (timer && cancel) cancel(timer)
          timer = 0
          box = measure()
          tick(started)
        } else onResize()
      }

      const stop = () => {
        if (stopped) return
        stopped = true
        if (timer && cancel) { try { cancel(timer) } catch { /* ignore */ } }
        timer = 0
        try { window.removeEventListener('resize', onResize) } catch { /* ignore */ }
        resizeObserver?.disconnect()
        mutationObserver?.disconnect()
        try { document.fonts?.removeEventListener('loadingdone', onResize) } catch { /* ignore */ }
        clear()
        if (canvas.cyWindStop === stop) canvas.cyWindStop = null
      }

      box = measure()
      canvas.cyWindStop = stop
      tick(started)
      try { window.addEventListener('resize', onResize) } catch { /* ignore */ }
      if (headline && typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(onResize)
        resizeObserver.observe(headline)
        const title = headline.querySelector('[class*="_titleGroup"]')
        if (title) resizeObserver.observe(title)
      }
      if (headline && typeof MutationObserver === 'function') {
        mutationObserver = new MutationObserver(onText)
        mutationObserver.observe(headline, { childList: true, subtree: true, characterData: true })
      }
      try {
        document.fonts?.ready.then(onResize)
        document.fonts?.addEventListener('loadingdone', onResize)
      } catch { /* ignore */ }

      return stop
    }

    /** 面板上的「重播」按钮：不用切页面也能再看一次。 */
    function replayWind() {
      let canvas = null
      try { canvas = document.querySelector('.cy-hero-wind') } catch { canvas = null }
      if (!canvas) return false
      try { playWind(canvas) } catch { return false }
      return true
    }

    /**
     * 标题上方那条风带。
     *
     * 宿主在标题里只留了品牌位一个插槽，所以画布跟着徽标一起挂进去，再绝对
     * 定位到标题那一行的正中间（见 .cy-hero-wind）。
     *
     * 挂载即播一次：切到新对话页时 HeroShell 是重新挂载的，也就自然重播。
     */
    function HeroWind() {
      const current = useThemeSnapshot()
      const active = current.enabled && current.level === 'full'
      const ref = React.useRef(null)
      React.useEffect(() => {
        if (!active || prefersStill()) return undefined
        const canvas = ref.current
        if (!canvas) return undefined
        playWind(canvas)
        // 面板重播可能替换实例，卸载时必须清掉当前实例。
        return () => { try { canvas.cyWindStop?.() } catch { /* ignore */ } }
      }, [active])
      if (!active) return null
      return h('canvas', {
        ref,
        className: 'cy-hero-wind',
        width: 1,
        height: 1,
        'aria-hidden': 'true',
      })
    }

    /**
     * The badge beside the empty-state headline.
     *
     * `conversation.hero.brand.mark` is a real slot whose fallback is the shipped
     * whale, so occupying it is the clean swap: no CSS to hide the host's fish,
     * and nothing to keep in sync when React re-renders the hero. The icon is a
     * 192px cut-out — its dark disc was keyed to transparency — so it sits on the
     * page instead of on a black saucer.
     */
    function HeroMark(props) {
      const current = useThemeSnapshot()
      const size = Math.max(16, Number(props && props.size) || 34)
      if (usesShippedBrand(current)) {
        if (primitives && typeof primitives.FishLogo === 'function') {
          return h(primitives.FishLogo, { size, className: 'cy-brand-fish' })
        }
        return null
      }
      if (!HERO_MARK) return h('span', { className: 'cy-hero-slot' }, h(HeroWind, null))
      // 画布和徽标挤在同一个插槽里：标题那一行只有这一个位置能挂，
      // .cy-hero-slot 用 display:contents 让它们直接参与标题的排版。
      return h('span', { className: 'cy-hero-slot' },
        h('img', {
          className: 'cy-hero-mark',
          src: HERO_MARK,
          width: size,
          height: size,
          alt: '',
          draggable: 'false',
        }),
        h(HeroWind, null))
    }

    /* ------------------------------------------------------------------ */
    /* Settings rows: 美化程度 / 水印对齐 / 开屏动画 / 主题快捷键            */
    /* ------------------------------------------------------------------ */

    /**
     * Which language the shell is speaking.
     *
     * `index.html` ships a hard-coded `lang="en"`, so reading that attribute
     * alone reports "English" on a Chinese machine until `dsh-client-locale`
     * activates and rewrites it. That plugin starts from the browser's own
     * language order, so the browser is the better first guess — and the moment
     * `<html lang>` is seen to *change*, the plugin has spoken and its value
     * wins from then on (it also honours an explicit choice in Settings).
     */
    const bootLang = (() => {
      try { return String(document.documentElement.lang || '').toLowerCase() } catch { return '' }
    })()
    let langSettled = false

    /** The first language the browser asks for that we actually ship. */
    function browserLocale() {
      try {
        const tags = []
        if (navigator.languages) for (const tag of navigator.languages) tags.push(tag)
        if (navigator.language) tags.push(navigator.language)
        for (const tag of tags) {
          const primary = String(tag || '').toLowerCase().split('-')[0]
          if (primary === 'zh' || primary === 'en') return primary
        }
      } catch { /* no navigator */ }
      return ''
    }

    function isEnglish() {
      let lang = ''
      try { lang = String(document.documentElement.lang || '').toLowerCase() } catch { /* ignore */ }
      if (lang && lang !== bootLang) langSettled = true
      if (langSettled) return !lang.startsWith('zh')
      if (lang.startsWith('zh')) return false
      return browserLocale() === 'en'
    }

    /* ------------------------------------------------------------------ */
    /* Shortcut recorder                                                   */
    /* ------------------------------------------------------------------ */

    function emitCapture() {
      for (const fn of captureSubscribers) {
        try { fn() } catch { /* ignore */ }
      }
    }

    function subscribeCapture(fn) {
      captureSubscribers.add(fn)
      return () => captureSubscribers.delete(fn)
    }

    function useCaptureState() {
      if (React && typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribeCapture, () => captureState, () => captureState)
      }
      return captureState
    }

    function setCapture(next) {
      if (captureState.active === next.active && captureState.problem === next.problem) return
      captureState = next
      emitCapture()
    }

    function cancelShortcutCapture() {
      const teardown = captureTeardown
      captureTeardown = null
      if (teardown) {
        try { teardown() } catch { /* ignore */ }
      }
      setCapture({ active: false, problem: '' })
    }

    /**
     * Wait for the next combination and store it.
     *
     * Recording beats a text box here: nobody would guess that the stored form
     * is "ctrl+alt+x". The listeners are capture-phase and swallow the event,
     * so the keys being tried out neither type into the composer nor switch the
     * theme on the way in.
     */
    function beginShortcutCapture() {
      if (captureState.active) {
        cancelShortcutCapture()
        return false
      }
      const onKey = (event) => {
        const token = keyToken(event.key)
        const bare = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
        // Esc and Tab are ways out rather than combinations: hand them back to
        // the shell untouched so the dialog keeps working.
        if (bare && (token === 'escape' || token === 'tab')) {
          cancelShortcutCapture()
          return
        }
        // Everything else is ours: no typing into the composer, no theme switch
        // on the combination being tried out.
        if (typeof event.preventDefault === 'function') event.preventDefault()
        if (typeof event.stopPropagation === 'function') event.stopPropagation()
        // Only modifiers down so far: keep waiting for the actual key.
        if (!token) return
        const combo = comboFromEvent(event)
        const problem = comboProblem(combo)
        if (problem) {
          setCapture({ active: true, problem })
          return
        }
        cancelShortcutCapture()
        setState({ shortcut: combo })
      }
      const onPointerDown = (event) => {
        const target = event && event.target
        if (target && typeof target.closest === 'function' && target.closest('[data-cy-shortcut]')) return
        cancelShortcutCapture()
      }
      document.addEventListener('keydown', onKey, true)
      document.addEventListener('pointerdown', onPointerDown, true)
      captureTeardown = () => {
        document.removeEventListener('keydown', onKey, true)
        document.removeEventListener('pointerdown', onPointerDown, true)
      }
      setCapture({ active: true, problem: '' })
      return true
    }

    /**
     * Fourth General-section row: the combination that switches the theme.
     * Clicking the chips starts recording; the next combination that passes
     * validation is stored, Esc backs out.
     */
    function ShortcutRow() {
      const current = useThemeSnapshot()
      const capture = useCaptureState()
      const en = isEnglish()
      const combo = current.shortcut || DEFAULT_SHORTCUT
      const problem = capture.active ? capture.problem : ''
      let desc = en ? 'Click the keys, then press the new combination' : '点一下右边，再按下你想用的组合'
      if (problem === 'nomod') {
        desc = en ? 'Ctrl, Alt or Win has to be in it' : '要带上 Ctrl 或 Alt，不然打字时会被误触'
      } else if (problem === 'taken') {
        desc = en ? 'That one opens the debug panel' : '这个组合是调试面板在用'
      } else if (capture.active) {
        desc = en ? 'Waiting for a key — Esc cancels' : '等着你按键，Esc 取消'
      }

      const keys = []
      comboParts(combo).forEach((part, index) => {
        if (index) keys.push(h('span', { key: 'sep' + index, className: 'cy-kbd-sep' }, '+'))
        keys.push(h('kbd', { key: part + index, className: 'cy-kbd' }, part))
      })

      const spoken = capture.active
        ? (en ? 'Press the new combination' : '请按下新的组合')
        : (en ? 'Change the theme shortcut, currently ' : '修改主题快捷键，当前 ') + comboParts(combo).join('+')

      const record = h('button', {
        key: 'record',
        type: 'button',
        className: 'cy-shortcut-btn',
        'data-cy-shortcut': 'record',
        'aria-pressed': capture.active,
        'aria-label': spoken,
        title: en ? 'Click, then press the new combination' : '点一下，然后按下新的组合',
        onClick: () => { beginShortcutCapture() },
      }, capture.active ? (en ? 'Press…' : '按下…') : keys)

      const reset = combo === DEFAULT_SHORTCUT ? null : h('button', {
        key: 'reset',
        type: 'button',
        className: 'cy-shortcut-reset',
        title: en ? 'Back to Ctrl+Alt+X' : '恢复默认的 Ctrl+Alt+X',
        onClick: () => {
          cancelShortcutCapture()
          setState({ shortcut: DEFAULT_SHORTCUT })
        },
      }, en ? 'Reset' : '恢复')

      return h('div', { className: 'cy-settings-row' },
        h('div', { className: 'cy-settings-text' },
          h('div', { className: 'cy-settings-title' }, en ? 'Theme shortcut' : '主题快捷键'),
          h('div', { className: 'cy-settings-desc' + (problem ? ' is-warn' : '') }, desc)),
        h('div', { className: 'cy-shortcut' }, record, reset))
    }

    /**
     * One General-section row: title, one-line explanation of the current
     * level, and a segmented control. It reads our own state rather
     * than the settings store, so it stays correct when the theme is switched
     * from a shortcut or the debug panel.
     */
    function BeautyLevelRow() {
      const current = useThemeSnapshot()
      const en = isEnglish()
      const active = LEVELS.find((level) => level.id === current.level) || LEVELS[LEVELS.length - 1]
      return h('div', { className: 'cy-settings-row' },
        h('div', { className: 'cy-settings-text' },
          h('div', { className: 'cy-settings-title' }, en ? 'Beautification level' : '美化程度'),
          h('div', { className: 'cy-settings-desc' }, en ? active.hintEn : active.hintZh)),
        h('div', {
          className: 'cy-segmented',
          role: 'group',
          'aria-label': en ? 'Beautification level' : '美化程度',
        },
        LEVELS.map((level) => h('button', {
          key: level.id,
          type: 'button',
          className: 'cy-segment',
          'aria-pressed': current.level === level.id,
          title: en ? level.hintEn : level.hintZh,
          onClick: () => setState({ level: level.id }),
        }, en ? level.en : level.zh))))
    }

    /**
     * Second General-section row: where the conversation watermark sits.
     * The debug panel has the same switch, but that panel needs a shortcut to
     * open — this one is where a non-technical user will actually look.
     */
    function ChatAnchorRow() {
      const current = useThemeSnapshot()
      const en = isEnglish()
      const active = ANCHORS.find((anchor) => anchor.id === current.chatBgAnchor) || ANCHORS[0]
      return h('div', { className: 'cy-settings-row' },
        h('div', { className: 'cy-settings-text' },
          h('div', { className: 'cy-settings-title' }, en ? 'Watermark alignment' : '水印对齐'),
          h('div', { className: 'cy-settings-desc' }, en ? active.hintEn : active.hintZh)),
        h('div', {
          className: 'cy-segmented',
          role: 'group',
          'aria-label': en ? 'Watermark alignment' : '水印对齐',
        },
        ANCHORS.map((anchor) => h('button', {
          key: anchor.id,
          type: 'button',
          className: 'cy-segment',
          'aria-pressed': current.chatBgAnchor === anchor.id,
          title: en ? anchor.hintEn : anchor.hintZh,
          onClick: () => setState({ chatBgAnchor: anchor.id }),
        }, en ? anchor.en : anchor.zh))))
    }

    /**
     * Third General-section row: the opening animation.
     * Same switch as the debug panel's 「开屏」 button, but reachable without
     * knowing the Ctrl+Alt+P shortcut.
     */
    function SplashRow() {
      const current = useThemeSnapshot()
      const en = isEnglish()
      const on = current.splash !== false
      const active = on ? SPLASH_MODES[0] : SPLASH_MODES[1]
      return h('div', { className: 'cy-settings-row' },
        h('div', { className: 'cy-settings-text' },
          h('div', { className: 'cy-settings-title' }, en ? 'Opening animation' : '开屏动画'),
          h('div', { className: 'cy-settings-desc' }, en ? active.hintEn : active.hintZh)),
        h('div', {
          className: 'cy-segmented',
          role: 'group',
          'aria-label': en ? 'Opening animation' : '开屏动画',
        },
        SPLASH_MODES.map((mode) => h('button', {
          key: mode.id,
          type: 'button',
          className: 'cy-segment',
          'aria-pressed': (mode.id === 'on') === on,
          title: en ? mode.hintEn : mode.hintZh,
          onClick: () => setState({ splash: mode.id === 'on' }),
        }, en ? mode.en : mode.zh))))
    }

    function registerSettingsRow(ctx) {
      let slots = null
      try {
        slots = ctx && ctx.slots
      } catch {
        slots = null
      }
      if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
        return false
      }
      try {
        slots.inject('settings.general.item', () => slots.register({
          name: 'settings.general.item',
          id: 'theme-cyrene-level',
          order: 60,
          label: '美化程度',
        }, BeautyLevelRow))
        slots.inject('settings.general.item', () => slots.register({
          name: 'settings.general.item',
          id: 'theme-cyrene-anchor',
          order: 61,
          label: '水印对齐',
        }, ChatAnchorRow))
        slots.inject('settings.general.item', () => slots.register({
          name: 'settings.general.item',
          id: 'theme-cyrene-splash',
          order: 62,
          label: '开屏动画',
        }, SplashRow))
        slots.inject('settings.general.item', () => slots.register({
          name: 'settings.general.item',
          id: 'theme-cyrene-shortcut',
          order: 63,
          label: '主题快捷键',
        }, ShortcutRow))
        return true
      } catch (error) {
        console.warn('[theme-cyrene] settings row registration failed', error)
        return false
      }
    }

    function attachSettingsRow(ctx) {
      try {
        if (registerSettingsRow(ctx)) return
        if (ctx && typeof ctx.inject === 'function') {
          ctx.inject(['slots'], (child) => {
            try {
              registerSettingsRow(child)
            } catch (error) {
              console.warn('[theme-cyrene] settings row registration failed', error)
            }
          })
        }
      } catch (error) {
        console.warn('[theme-cyrene] cannot reach the settings slots', error)
      }
    }

    function registerBrand(ctx) {
      let slots = null
      try {
        slots = ctx && ctx.slots
      } catch {
        // Cordis may throw when an unavailable service is read by property.
        slots = null
      }
      if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
        return false
      }
      const occupy = (name, component) => {
        try {
          // `single` slots render one occupant; a low order asks for the front.
          return slots.register({ name, order: -1000 }, component)
        } catch {
          return slots.register({ name }, component)
        }
      }
      try {
        slots.inject('sidebar.brand.mark', () => slots.inject('sidebar.brand.name', function* () {
          yield occupy('sidebar.brand.mark', BrandMark)
          yield occupy('sidebar.brand.name', BrandName)
        }))
        // The empty state's mark is its own slot; the shipped whale is only the
        // fallback, so filling it needs no DOM patching at all.
        slots.inject('conversation.hero.brand.mark',
          () => occupy('conversation.hero.brand.mark', HeroMark))
        return true
      } catch (error) {
        console.warn('[theme-cyrene] brand slot registration failed', error)
        return false
      }
    }

    function attachBrand(ctx) {
      try {
        if (registerBrand(ctx)) return
        if (ctx && typeof ctx.inject === 'function') {
          ctx.inject(['slots'], (child) => {
            try {
              registerBrand(child)
            } catch (error) {
              console.warn('[theme-cyrene] brand slot registration failed', error)
            }
          })
        }
      } catch (error) {
        console.warn('[theme-cyrene] cannot reach the slots service', error)
      }
    }

    return {
      apply(ctx) {
        // Nothing here may escape into the shell's boot: a client plugin that
        // throws while mounting takes the whole window down with it.
        try {
          const start = () => {
            if (mounted) return
            mounted = true

            try {
              attachBrand(ctx)
            } catch (error) {
              console.warn('[theme-cyrene] brand setup skipped', error)
            }

            try {
              attachSettingsRow(ctx)
            } catch (error) {
              console.warn('[theme-cyrene] settings row skipped', error)
            }

            let dispose = null
            try {
              dispose = mount()
            } catch (error) {
              console.error('[theme-cyrene] mount failed; falling back to the stock theme', error)
              try {
                document.documentElement.setAttribute('data-cyrene', 'off')
              } catch { /* ignore */ }
              mounted = false
              return
            }

            if (ctx && typeof ctx.effect === 'function') {
              try {
                ctx.effect(() => () => {
                  try { dispose && dispose() } catch (error) {
                    console.warn('[theme-cyrene] dispose failed', error)
                  }
                }, 'theme-cyrene: theme layer')
              } catch (error) {
                console.warn('[theme-cyrene] effect registration failed', error)
              }
            }
          }

          if (typeof document === 'undefined') return
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true })
          } else {
            start()
          }
        } catch (error) {
          console.error('[theme-cyrene] apply failed; leaving the stock UI untouched', error)
        }
      },
    }
  },
})
