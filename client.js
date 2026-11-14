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
    const SPLASH_ART = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDQ4IiBoZWlnaHQ9IjEwODMiIHZpZXdCb3g9IjAgMCAxNDQ4IDEwODMiPgogIDxkZWZzPgogICAgPG1hc2sgaWQ9ImN1dCIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeD0iMCIgeT0iMCIgd2lkdGg9IjE0NDgiIGhlaWdodD0iMTA4MyI+CiAgICAgIDxwYXRoIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0ibm9uemVybyIgZD0iTTU2OCAzOC44YzEuMyAuOSA0LjMtLjcgNi0uOCA0LjctLjMgOS42LS41IDEzLjcgMi4zIDMuMiAyLjMgNS40IDQuMiA3LjQgNy42IDEuMSAxLjggMS4zIDQuNiAzIDYgNy4yIDYuMSAxNi45IDEwLjMgMjQuOCAxNS43IDYuNyA0LjQgMTQuOCA5LjkgMjAuNiAxNS40IDQgMy45IDguNiA5LjMgMTMuNSAxMiAzLjggMS4zIDEuMS02LjcgMS04LjUtLjItNi40LS4zLTEyLjcgMC0xOSAuMS0zLjEgLjktNi44IDQuNi03LjQgNS45LS45IDExLjEgNS4zIDE0LjEgOS43IDcuNSAxMSAxOS4xIDIxLjcgMjEuNCAzNS41IDEuNSAzIDQuNi00LjYgNS45LTUuOCA0LjQtNCA5LjYtOC45IDE1LjctNC43IDQgMi44IDIuNiA4LjkgMy42IDEyLjkgMi4yIDguMyA1LjcgMTYuMyA0LjYgMjUuMi0uNSA0LjEtMi4zIDcuNy0zLjEgMTEuNyAuMSAxLjggMi42IDEuNSAzLjkgMi4yczIuNSAyLjUgMy4yIDQuM2MyLjUgNi44IDYuMSAxMy43IDcuOCAyMC43IC44IDMuNC0uNSA2LjkgMCAxMC4yIC44IDEuMSAxLjUgMS43IDIuNyAuOCAxLjMtMiAyLTQuOSAzLjgtNi42IDQuMS0zLjcgOC43LS4xIDEwLjUgMy42IDIuOCA1LjQgNS41IDExLjEgNyAxNyAuOCAzLjMgLjcgNyAxLjggMTAuMiAyLjggMi4zIDYuOSAuNSAxMC4xIC4xczUuNyAuMyA4LjMtLjdjMy43LTEuMyA2LjktNS41IDEwLjEtNy43IC45LTEuNy0yLjYtMy44LTMuOC00LjktNS4yLTQuOS0xMS40LTguNS0xNS45LTE0LjEtMTEuMy0xNC41LTIxLjUtMjguNy0yNi44LTQ2LjctNC45LTE2LjYtNy4zLTM3LjEtMy4yLTU0LjIgMS4zLTUuMiAyLjQtMTguNSAxMC44LTE1LjQgNC4zIDEuNSA0LjkgNy44IDYuNyAxMS4zIDUgMTAuMiAxMC41IDIwIDE3LjUgMjkgMTUuNCAxOS42IDM3LjcgMjguOCA1Ni43IDQzLjggNS4xIDQuMSAxMC4zIDguOSAxNC44IDEzLjcgMi45IDMuMiA1LjMgOCA5LjEgMTAuMyAzLjUgLjUgNy43LTIgMTEuMS0zIDUuNi0xLjYgMTIuMS0yLjEgMTcuOS0xLjQgOC43IDEuMSA0LjggOS4xIDkgMTMuNSAyLjYgMi43IDkgMy43IDEyLjMgNS43IDUuMyAzLjIgNy42IDguMiAxMC42IDEzLjMgMS41IDEuNiA0LjMtMS4xIDYtMS44IDMtMS4zIDYuMy0uNSA4LjkgMS41IDYuNyA1LjQgMTAuNiAxNC43IDE2LjggMjAuNyAyLjkgMi42IDYuNSA0LjUgOS4zIDcuMiA5LjYgOS40IDE5LjIgMTkgMjkgMjggMy42IDMuNCA1LjkgOCA5LjQgMTEuNiAxNS4zIDE1LjUgMjYuMyAzNC41IDM2IDU0IDcgMTMuOSAxMi44IDMyLjQgOS4xIDQ4LS45IDQuMS0uOSA4LjItMy4xIDExLjktMS42IDIuOS00LjIgNC40LTYuNCA2LjYtLjMgMi43IDMuMyA1LjYgNC43IDcuNyA0LjIgNS45IDguMiAxMiAxMS43IDE4LjMgMTIuNSAyMiAxOC45IDQ4IDE0LjggNzMuMi0xLjIgNy43LTUuOCAyMy4yLTE0LjIgMjYtMS44LS4yLTEuOC0xLjctMS42LTMuMyAuNi00LjEgMi4yLTguMSAyLjctMTIuMyAxLjMtMTEuMSAuOS0yMy4yLTIuOC0zNC0xLjQtMi45LTMuNyA3LjEtNC4xIDguNi0uNyAyLjYtMi4yIDUuMS0yLjggNy43LTEuMSA1LjYtLjIgMTIuMS0uMiAxNy44IDAgMTkuMy05IDM5LjQtMjAuNyA1NC4zLTQuMiA1LjQtMTEuNCAxNC43LTE4LjcgMTUuNC00LjQtMS40LTEuOS03LjYtMS4xLTEwLjcgMi42LTEwLjUgNC40LTIzLjkgMi4yLTM0LjctMS44LTIuMi00LjcgLjQtNi44IDEuMS02IDIuMi0xMi41IDMuNy0xOC43IDUuMy0yLjIgLjUtNS40IDAtNi44IDIuMi0xLjggMy4yLTEuMiA3LjEtMS41IDEwLjUtLjcgMTAuNCAxIDE5LjIgMy4zIDI5LjQgNS40IDIzLjUgMjUuOSA0NS44IDQ3LjEgNTYuNCA4LjYgNC4zIDE4LjMgNC41IDI3LjIgNy4zIDMuMiAyLjktMS40IDUuNS0zLjggNi43LTYuOCAzLjUtMTQuMSAyLjctMjEuMyA0LjEtMi40IDEuOCA1LjEgNC45IDYuNiA1LjcgNS45IDMuMSAxMS45IDYuOCAxOC4zIDguNyAyLjcgLjcgNS45IC40IDggMi41IDEuNiAzLjktMS41IDUuMS00LjggNS44LTYuMiAxLjQtMTMuNSAyLjgtMTkuOCAxLjMtMTUuNi0zLjYtMjkuMy03LjEtNDMuNC0xNS4xLTUuMS0yLjgtMTAuNy02LjUtMTUuMS0xMC40LTIuNy0yLjQtNS43LTUuNy04LjktNy4zLTEuNSAuMSAxIDQuOCAxLjUgNS43IDIuOSA2LjIgNS43IDEyIDkgMTggMTEuOCAyMi40IDI1LjEgNDcuMSA0MyA2NSA1IDUgOS4yIDEwLjcgMTQuNCAxNS42IDExLjcgMTAuOCAyNi44IDIxLjYgNDIuMSAyNi45IDQxLjUgMTQuMiA4Ny43LTEuNyAxMjQuNC0yMi41IDE2LTkgMzEuMS0xOS41IDQ0LjUtMzIgMTYuNS0xNS4zIDMyLjQtMzIgMzguNS01NC41IDEyLjctNDctMjguNS0xMDMuNy03OC4yLTEwMS42LTEwLjkgLjQtMjEuNyAyLjctMzEuOCA3LjEtMi41IDEuMS01LjEgMS41LTcuNCAzLjEtNyA0LjktMTMuMyAxMi43LTIxLjEgMTYuMi0zLjMtLjItNS4xLTQuNy01LjItNy41LS4xLTcuMSAzLjctMTQuMSA2LjgtMjAuMiA5LjEtMTguMyAyOS42LTI5LjkgNDguNS0zNS41IDYuNy0xLjkgMTMuMy0yLjMgMjAuMi0yLjNzMTMuMi0uMyAxOS43IDEuM2MyOC40IDcuMSA0OC41IDI4LjYgNjEuOCA1My43IDcuOCAxNC42IDEwLjQgMzAuNyAxMy4yIDQ2LjggOC40IDQ4LjUtMTEuOSAxMDEuNi00NiAxMzYuNC05LjYgOS44LTE4LjMgMjAuNy0yOS4yIDI5LjMtOS4zIDcuMy0xOC42IDE0LjQtMjguMyAyMS4yLTcuNyA1LjMtMTcuMSA4LjctMjQuNiAxNC4yLS40IDEgNS45IDIuNCA3LjIgMi44IDguNiAyLjcgMTcuMyA1LjQgMjUuNyA4LjggMjIuNCA5LjMgNDMuNiAxOS4zIDY0LjcgMzEuMyA1Ny4xIDMyLjIgMTAzLjcgODUgMTMyLjggMTQzLjIgNyAxNCAxMy4yIDI4LjMgMTguNCA0My4xIDEuNCA0IDUuMSAxMS43IDIuNyAxNS41LTIuMyAyLjEtNi4yIDEuNC05LjEgMS40LTYuNSAwLTEzIDAtMTkuNSAwLTI3IDAtNTQgMC04MSAwLTUxLjUgMC0xMDMgMC0xNTQuNSAwLTE2IDAtMzIgMC00OCAwLTYuOCAwLTE1LjYgMS41LTIyLjItLjMtOC41LTIuNS0xNi44LTguNy0yNC4zLTEzLjItMTIuNi03LjQtMjUuNi0xNC4xLTM3LjgtMjIuMi03LjktNS40LTE1LTExLjktMjMtMTcuMy0xLjctLjUgMCAyLjQgLjIgMy4xIDEuNCAzLjggMi4xIDggMy4xIDExLjkgMi4xIDguNiA0IDE3LjEgNS43IDI1LjggLjcgMy40IDIuNSA3LjYgMSAxMC45LTIuNyAyLjctMTAuMSAxLjMtMTMuNyAxLjMtMTIuNSAwLTI1IDAtMzcuNSAwLTUxIDAtMTAyIDAtMTUzIDAtMTQxIDAtMjgyIDAtNDIzIDAtMzkuNSAwLTc5IDAtMTE4LjUgMC0xMSAwLTIyIDAtMzMgMC0zLjYgMC05LjggMS4yLTEzLjEtLjQtMi4yLTEuMi0zLjQtNS43LTQuMS03LjktMi40LTcuNi0zLjgtMTUuMi01LjYtMjIuOS02LjEtMjUuMyAuMy01NS41IDEwLjUtNzkuMSAzLjUtNy45IDYuNS0xNy4yIDExLjctMjQuMSAuMy0uNiAuNS0xLjUtLjYtMS4xLTQuMiAxLjctOC4yIDYuMi0xMi4zIDguNS04LjcgNC45LTE4LjEgOS45LTI2LjMgMTUuN3MtMTguNSA5LjEtMjcuNCAxMy4xYy0xOS4xIDguNC00MC4xIDE2LjktNjAuOCAyMC4yLTcuMSAxLjEtMTMuOCAyLjgtMjEgMy0zLjQgLjEtNS42IDEuMy03LjgtMi4xLS43LTIuOSAyLjEtMy43IDQuMi01IDMuOC0yLjUgOC4xLTUuMSAxMS42LTcuOSAxNi42LTEzLjQgMzYuMy0yMy4xIDUxLjQtMzguNSAxLjMtMi4yLTMtLjEtMy42IC4zLTMuNyAxLjgtNy40IDMuNi0xMSA1LjUtOS4zIDQuNy0xOC42IDkuMi0yOC4xIDEzLjktMjIuNiAxMS40LTQ4IDE5LjYtNzIuNyAyNC44LTUuMyAxLjItMTAuOSAyLjEtMTYuMiAzLjMtNCAxLTguNyAyLjUtMTIuOCAxLjMtMi43LTIuNCA0LjgtNS45IDYuOC02LjggOS4yLTQuNyAxOS45LTkuMiAyOC40LTE1LjEgMTAuMy03LjMgMjIuMS0xMy4yIDMzLTE5LjUgMTIuOC03LjIgMjQuOS0xNi4yIDM2LjYtMjQuOSA0LjEtMyA4LjYtNS4xIDEyLjQtOC41IDEuNS0yLjItNi40LS45LTguMS0uNy05IC42LTE4LjEgMi42LTI3LjEgMi45LTE4LjIgLjYtMzYuOCAyLjktNTQuOSA1LjEtNS44IC43LTExLjcgMS4zLTE3LjUgMi00IC41LTggMS44LTExLjkgLjItMS42LTEuNyAuNC0yLjYgMS45LTMuMiAzLjQtMS4zIDYuOS0yLjIgMTAuNC0zLjEgMTUuNi00LjIgMzEuMi05LjYgNDctMTMgMTEuOC0yLjYgMjMuMy04IDM0LjgtMTEuNyAyNS41LTguMSA1MC0xOC42IDc0LjctMjguOCA4Mi40LTM0LjQgMTU3LjYtODYuOSAyMjctMTQyIDIyLjYtMTcuOSA0NC43LTM1LjggNjUuMi01Ni4zIDYuNi02LjYgMTUuNi0xMy4yIDIwLjgtMjEgLjYtMS45LTEuOC0yLjEtMy4yLTIuNS0zLjQtMS02LjYtMi4zLTkuOS0zLjYtNi4xLTIuMy0xMC42LTguMS0xNi42LTEwLjItMi4zLS45LTYuMyAuMS04LjggLjEtNi42IDAtMTMuMyAuMi0xOS43LTEuMy0yMi44LTUuNS00OC4zLTE2LjgtNjMuMy0zNS43LTQuNy01LjktNi43LTEzLTEwLjgtMTktMS44LS45LTYgMS42LTcuOSAyLjMtNy4zIDIuNi0xNC42IDQuNS0yMi4xIDYuNC0xMS4zIDIuNy0yMy4xIDMtMzQuNiA0LjQtMTYuOSAyLTMzLjggNC40LTUwLjYgNy45LTguNiAxLjktMTcuNCA0LjMtMjUuNyA3LjMtMyAxLTcuNyAyLjctMTAuNCAuMy01LjItNC4zIDQuOS0xMy41IDcuOC0xNi40IDEyLjgtMTIuNyAyOC45LTIzIDQ0LjUtMzIgMjkuNy0xNi45IDYyLjgtMjcuOSA5Ni41LTM0IDE2LjgtMyAzNC4zLTUuOSA1MS40LTcuMSA5LjMtLjcgMTktMS40IDI4LjItMy4zIDEyLjktMi43IDI1LjUtOC41IDM3LjctMTMuMiAxLjMtMS4yLTYuNC04LjMtNy41LTEwLjYtMy41LTcuNS0xLjUtMTIuNyAxLjUtMTkuNy0uNi0zLjQtMTAuOC02LjUtMTMuNy04LjEtMTMuNC03LjEtMzUuNi0yMS40LTI2LjUtMzkuNCAxLjEtMi40IDIuNC00LjMgNC41LTUuOCAxLjEtMS43LTEuOC0zLjEtMi45LTMuOS00LjMtMi43LTguOS00LjgtMTIuNy04LjMtOS04LjMtMjQuOC0xOS4yLTE4LjQtMzQgMS4yLTIuOCAyLjYtNSA0LjUtNy4yIC4yLTEuNy0xLjgtMi41LTIuOC0zLjYtMi45LTIuNi02LjQtNC41LTkuMy03LjItMTAuNC05LjgtMjguNi0yNS41LTE4LjEtNDEuNyAxLjUtMi4zIDMuNC0zLjIgNS42LTQuOCAxLjUtMS44LTEuNy0zLjktMi45LTUuMS00LjItNC4yLTkuMi04LjEtMTIuNS0xMy03LjUtMTAuOS0xNC42LTIzLjgtNi0zNi40IDEuNS0yLjIgNC4zLTIuNiA2LjEtNC40IC44LTIuMS0uMi0zLjgtLjMtNi0uNS01LjgtMS4zLTExLjctMi0xNy41LTEuOS0xNS44IC4xLTMzLjIgMi00OC44IDYuMS01MS41IDMyLjItMTAwLjMgNzguOS0xMjUuMSAxMi41LTYuNiAyNS4yLTExLjkgMzkuNC0xMy4xIDMuNS0uMiA5LjEgMCAxMi4zLTEuMiAyLjQtLjkgNC4zLTQuMSA2LjctNS4zIDYuOS0zLjQgMTMuOS0uOCAxOS43IDIuOSAyLjggLjYgMy41LTIuNCA1LjEtNC4xIDIuOS0yLjkgNi4xLTUuMSAxMC02LjUgMTIuMy00LjMgMjQuOCA0IDMxLjUgMTMuNiAxLjcgMi41IDEuOCA1LjggMy4zIDguNXpNNzA5LjkgMjQ0LjVjMi44IC40IDUuOC0zLjEgOC00LjZzNy41LTQuMSA3LjgtNy0yLjQtNi0zLjUtOC4xYy0zLjQtNi45LTEwLjQtMjItMi40LTI3LjMgLjctMS05LjItMy44LTExLTQuOC02LjItMy0xNC40LTktMTguMi0xNC44LTEuNy0yLjUtMy4zLTYtMi4yLTlzNC0zLjkgNi40LTUuNGMyLjEtMi45LTktMi41LTEwLjItMi42LTUuOC0uNC0xMi40LTIuNS0xNy42LTQuOS00LjItMi0xMi43LTUtMTMuOC0xMC4yLTEuMS01LjggNi4xLTExLjggOS44LTE1LjEgMS4yLTIuMi0yLjQtNC45LTQtNi4yLTUuNS00LjMtMTEuNC04LjctMTYuNS0xMy41LTcuNi03LjMtMTYuNy0xMy43LTI1LjQtMTkuNnMtMTcuOC0xMy44LTI4LjEtMTguNGMtMy42LTEuNi04LjggLjUtMTIuOC0uMi02LjYtMS4yLTkuNS01LjktMTQuNS05LjMtNC4zLS4zLTkuOCAzLjktMTQuMyA0LjQtMTIuNSAxLjUtMjAuOS02LjEtMjguMy0xNC44LTEuNS0uNy0zLjcgMS4yLTUuMSAxLjktMi44IDEuMy02LjggMi4zLTkuOCAxLjhzLTUuOS0yLTguMy0zLjdjLTEuMy0uOC0yLjUtMi44LTQuMi0yLjctMTAuMSAuOC0yMC41IDUuMi0yOS43IDkuMS0zNS4yIDE0LjYtNTggNDUuNy02OC41IDgxLjUtMy43IDEyLjYtNS4xIDI1LjUtNi42IDM4LjQtMS43IDE0LjQtLjQgMjguOCAuMSA0My4xIC4yIDUuNiAuMSAxNC43IDIuOCAxOS43IDEuNCAyLjYgNi4zIDIuNCA4LjkgMy4xIDMuOCAxLjIgNS43IDMuNyA4LjIgNi42IDEuMyAuNSAuMS01LjMgLjEtNi40LS4yLTQuNy0xLTkuMi0xLTE0IDAtMTMuOS0uMy0yNy42IDIuMi00MS4zIDQuNi0yNS4yIDE0LjUtNTAuOCAzMy02OSAxMS0xMC44IDI2LjQtMTcuOSA0MS4xLTIxLjkgMjcuNi03LjQgNTguMy0xLjQgODQgOS45IDQyLjMgMTguNyA3OS45IDQ4LjggMTA4LjQgODUuMSA4LjggMTEuMyAxNi40IDIzLjUgMjUgMzUgMy40IDQuNiA1LjcgMTEuNiAxMC4yIDE1LjJ6TTUzOSA0NjEuMmMzLjMgLjggNy40LTMuNSAxMC4yLTQuOSAxMC40LTUuMyAyMC40LTExLjMgMzAtMTcuOSAxMC45LTcuNiAyMS44LTE1LjMgMzIuOC0yMi43IDMuMy0yLjMgNi4yLTQuOCA5LjEtNy40IDEuNC0xLjEgMy4zLTEuNyA0LjItMy4zIDEuOC0zLjMgLjctOS4xIC43LTEyLjggMC04LjQgMS4yLTE2LjYgMi4xLTI0LjkgMi4xLTIwLjMgMTEtMzkuOSAyMC4yLTU3LjggNi42LTEzLjIgMTcuMi0yNS4yIDI3LjgtMzUuMSAzLjEtMi45IDYuNi01LjQgOS41LTguNSAxLTEuMSAzLTIuNCAyLjktNC0uMS0yLjctMi43LTUuNS0zLjktNy44LTMuOC03LjQtOC42LTE0LjMtMTMuMS0yMS4zLTE4LjQtMjguMS00MS4xLTU0LjItNjgtNzQuNS0yNy43LTIxLTU5LjEtMzcuMy05NC42LTM3LjMtMTQuNiAwLTMyLjQgMy00My43IDEzLjMtNS41IDQuOS0xMC4yIDkuNC0xNC41IDE1LjQtNS4xIDctOS41IDE1LjUtMTIuNCAyMy43LTcuNCAyMS42LTcuNCA0My41LTcuMyA2Ni4xIDAgNy4xIDIgMTQuMSAyLjkgMjEuMSAxLjkgMTUuMiA2LjEgMzAuMSAxMC44IDQ0LjcgMTMuNCA0Mi4yIDM0LjIgODAuOSA2MC45IDExNiAxMC40IDEzLjYgMjAuOCAyOC4yIDMzLjQgMzkuOXpNNDA1LjkgMjk1LjVjMy4xIDEuMyA2LjcgMS4yIDEwIDIuNyAyLjEtLjMgLjMtNC4xLS4xLTUuMy0yLTUuOC0yLjUtMTIuMi00LjQtMTcuOS0xLjUtMi43LTIuMiA1LjUtMi41IDctLjYgMy42LTQgMTAuMS0zIDEzLjV6TTQyNS4yIDM0Ny40YzEuNSAyLjUgNi4yIDEuOCA4LjYgMS4yIDEuNS0xLjYgLjMtMy4xLS40LTQuOC0xLjctNC42LTMuNC05LjQtNS43LTEzLjctMS41LS45LTEuNSAyLjYtMS42IDMuNi0uNCA0LjItMS4yIDkuNi0uOSAxMy43ek0xMDMxLjggMzg1LjdjMS40IDEgMS45LTIuMiAyLTMuMSAuNi00LS41LTguNC0uOS0xMi4zLTEuMy0xMi41LTYuOS0yNC42LTEyLTM1LjktMS4xLTEuMi0uOSAzLjQtLjggNCAuNSA0LjQgMS45IDguNyAxLjkgMTMuMSAwIDUuNi0yLjMgMTItMS40IDE3LjQgLjMgMi4xIDIuNSAzLjQgMy42IDUgMi43IDMuOSA0LjkgOCA3LjYgMTEuOHpNNDUzLjEgNDAxLjNjLjkgMS45IDYuNC0uMiA4LjMtLjUgMS45LS45LS41LTMuNC0xLjItNC43LTIuNS00LTQuOC04LjEtNy40LTEyLTEuMi0uMy0uOCAyLjctLjggMy4zIDAgNC44IC43IDkuMiAxLjEgMTMuOXpNNDgyLjQgNDMwLjhjMS40IDYgLjEgMTMuNiAzIDE5LjEgMS4zIC45IDMuMi0uNSA0LjYtLjkgMi41LS43IDQuMS0uNSA2LjctLjMgMS40LTEtMS4xLTMuNi0xLjktNC41LTMuMS0zLjQtNS42LTcuNC04LjgtMTAuNy0uNi0uNy0zLjQtNS41LTMuNi0yLjd6TTUxMi40IDQ2Ni44Yy42IDIuNiAuNCA1LjIgLjggNy44IDEuMSAxLjUgMy43LS43IDQuOC0xLjYgMS43LTIuOC01LjQtNy45LTUuNi02LjJ6Ii8+CiAgICAgIDxwYXRoIGZpbGw9IiMwMDAiIGZpbGwtcnVsZT0ibm9uemVybyIgZD0iTTU1Ny40IDMyLjdjMS43IDIuMyAyLjcgNC41IDMuMyA3LjJzLjkgNC45IC41IDcuMWMtMi44IDE3LjEtMjQuNyAxNy4zLTMzLjggNC43LTcuNS0xMC40LTIuMi0yNyAxMS4yLTI4LjYgNy45LTEgMTQuNiAzLjMgMTguOCA5LjZ6TTUwMS42IDQ4LjJjLTExLjMtNi41LTEuNy0yMy40IDkuNi0xNi45czEuOCAyMi44LTkuNiAxNi45ek00ODguOCAzNy42YzEgMS4xIC45IDIuOCAuOCA0LjItMS40IDIuMi00LjggMi42LTcuMSAzLjItNS4yIDEuMS0xMC4xIDIuNy0xNS4xIDQuMy0xNC4xIDQuNS0yOCAxMy0zOS40IDIyLjItMzAuNiAyNC43LTQ0LjEgNjUuNC00OC4xIDEwMy4zLTEuMSAxMC41LTEuOSAyMS4xLTEgMzEuNiAxIDExLjIgMSAyMS45IDMgMzMgLjcgNCAxLjUgOS4zIDMuOSAxMi41IDIgMS40IDQuMS0uMiA2LjMtLjZzNS42IC40IDcuNSAyLjRjOC40IDguOCAyLjcgMjMuNyAuNSAzMy43LS44IDMuOC0yLjMgOS45LTUuMSAxMi43LTMuOCAxLjctMTIuMy02LjMtMTUuMS04LjgtOC4xLTctMTcuNS0xNi44LTIwLjUtMjcuNS0xLjEtNC4xLTEuMi0xMS41IDIuOC0xNC4zIDIuMS0xLjUgNC42LTEuMyA3LjEtMS45IDMuMi0yLjQtLjYtMTEuNS0xLjEtMTUtMi4zLTE1LTEuOS0zMS41LTEuMi00Ni43IDIuNS01My40IDI1LjYtMTA1LjIgNzIuMi0xMzMuMiAxMC45LTYuNSAyMy4yLTExLjQgMzUuNi0xMy45IDQuMy0uOSA5LjctMi44IDE0LTEuMnpNNTcwLjkgNjIuNGMtMTEuNS0xMC40IDUuNy0yMy42IDE2LTEzLjkgMy45IDMuNyA0LjIgMTEuMSAuMSAxNC43LTQuOCA0LjItMTEuOCAzLjMtMTYuMS0uOHpNNTk2LjMgNjEuOGMyLjQtLjIgNS4yIDIuNiA3IDMuOSAzLjcgMi43IDcuOCA1LjQgMTEuNyA3LjggMTguNyAxMS4xIDM1LjIgMjUuOSA1MS43IDM5LjggNiA1LjIgMTAuMSAxNS40IDE5LjYgMTQuNSAyLjgtMS4yLS45LTMuOC0yLjEtNS00LjMtNC4zLTguOC04LjMtMTEuOS0xMy42LTcuMy0xMi4zLTYuNC0yNC41LTcuNi0zOC4yIDEtMS41IDMuMyAxLjQgNC4xIDIuMiAzLjggMy44IDcgOC4xIDkuNyAxMi44IDUuNCA4LjkgMTEuNyAxNS45IDE0LjIgMjYuMyAuNyAzLjMtLjEgNi42IC42IDkuOXMzLjIgNS4zIDMuNiA4LjRjLjggNi40IDIuNCAxMy4zIDguNCAxNi44IDEuNy0uMSAxLjQtMS40IC45LTIuNi0xLjQtMy43LTMtNy45LTMuMi0xMS44LS40LTkuOCAuMS0yNS40IDEwLjgtMzAuNSAzLjEtLjEgMyAxMC41IDMuOSAxMy4zIDIuMyA2LjQgNCAxMy43IDMuMiAyMC42LS42IDUuMi00LjYgOC41LTYuNSAxMy0xLjUgMy43IDIuNSAxMSA0LjQgMTQuMiAyLjIgMi4yIDQuNS02LjYgNS41LTguMiAxLjctMS41IDIgMS4xIDIuNCAyLjQgMS4xIDMuOCAxLjggNy44IDMuOCAxMS4yIDEuNyAyLjcgMy40IDUuMiAzLjUgOC41IC4xIDIuMy0xLjIgNS41LS42IDcuNyAxLjUgNS4xIDguNSA5LjUgMTEuNyAxMy43IDEuNiAxLjEgMS44LS41IDEuOS0xLjkgLjMtNC4xIDEuMS04LjYgMi40LTEyLjUgMi4xLTIuMyAzLjIgMy45IDMuOCA1LjMgMi40IDUuMSA2LjggMTMuNiA1LjQgMTkuMy00LjEgNi4xLTEzLjEtMi41LTE2LjctNS01LjEtMy41LTcuNi0xMS0xMy4zLTEzLjctMy40LTEuNS03LjcgLjMtMTEuMy0uNy03LjYtMi4yLTE3LjQtMTAuNy0yMS44LTE3LjEtLjgtNC4zIDkuMi0zLjUgMTEuOC0zLjggNC4xLTItMy4zLTktNS4xLTExLS45LTEtMS40LTIuNy0yLjYtMy40LTMuNC0xLjYtNyAuOC0xMC40IC40LTcuMS0xLTE0LjctMi43LTIxLjItNS44LTIuMi0xLTUtMi02LjUtMy45LTEtNi41IDEwLjYtMTAuMiAxNC43LTEyLjcgLjYtMi4yLTIuNC00LTMuNy01LjQtNC4xLTQuNi05LjgtOC40LTE0LjUtMTIuNS0xOS43LTE3LjQtNDEuNy0zMi44LTYzLjgtNDcuMS0xLjItMS42IC45LTQuNCAyLjEtNS42ek03NTMuMyA4N2MxLjMgLjQgMS41IDMuNCAxLjcgNC41IDEuMSA0LjkgMy43IDkuNCA1LjMgMTQuMiAuOSAyLjMgMi45IDQuMiA0LjEgNi4zIDQuNiA3LjYgMTEuMiAxOC41IDE5LjQgMjIuNSAyLjMgLjEgMS45LTEuNyAuOS0zLjEtMi4zLTMuMi01LjEtNi4xLTcuMS05LjQtNS43LTkuMy0xMi4zLTE4LjMtMTYuMi0yOC42IC4xLTEuNCAzIDMuMSAzLjMgMy44IDEuOSAzLjUgNC4zIDYuNyA2LjggOS44IDcuMyA5LjEgMTYgMTcgMjQuNyAyNC43IDkuMiA4LjMgMjEuNSAxMy43IDMxLjcgMjAuOCAyMC44IDE0LjYgMzMuOSAzNS4zIDQwLjYgNTkuNi0uMiAyLTguNyAzLjQtMTEuMSA0LjctNS44IDMuMi05LjEgOS45LTE0LjYgMTMuNi0yLjQgLjItMy43LTIuNy01LjItNC4zLTQuNC00LjgtOS4zLTguNy0xNC0xMy0xOC45LTE3LjMtNDQtMjktNTYuNy01Mi41LS43LTIuMSA0LjUgNC40IDUuMiA1IDQgMy45IDguNyA3LjUgMTIuNSAxMS41IDUgNS4yIDExLjUgOC42IDE3LjQgMTIuNiA3LjYgNS4yIDE1LjkgMTEuMyAyNC45IDEzLjkgMS44LS4yIDItMS4yIDEuNy0yLjktMi42LTMuNi03LjktNS43LTExLjctNy44LTQuOS0yLjgtMTAtNi4xLTE0LjctOS4zLTE4LjgtMTMtMzMuNy0yOC40LTQ0LTQ5LTQuMS04LjMtOC43LTE5LjUtOC4xLTI4LjkgLjUtMS4yIDIuNiA1LjggMy4yIDcuMSAyLjQgNS40IDQuNiAxMS4xIDguMSAxNS45IDkuNiAxMy42IDIwLjEgMjUuNCAzMi40IDM2LjYgMy45IDMuNSAxMS45IDEwLjYgMTcuNCAxMC4yIDMuNi0yLjQtMS40LTUtMy40LTYuNC03LTUtMTMuNS0xMC4yLTE5LjYtMTYuMy0xNC0xMy44LTI1LjYtMzAuNy0zMS41LTQ5LjUtMS40LTQuNC00LjktMTEuNy0zLjQtMTYuM3pNNzAzLjUgMjUwLjljLS41IDIuMi00LjcgNS4xLTYuNSA2LjQtMi4zIC40LTIuOS0yLjMtMy44LTMuOS0yLjEtMy44LTQuNi03LjQtNi42LTExLjMtNC4xLTcuOS05LjktMTUuNC0xNS4yLTIyLjQtNS45LTcuNy0xMS0xNS44LTE3LjQtMjMuMS0zMi44LTM3LjItNzEuOS02OS4zLTEyMS4yLTgxLjItOS44LTIuNC0yMS40LTIuOS0zMS4yLTEuNS0xMS43IDEuNi0yMi4yIDMuMy0zMi43IDkuMy0zMiAxOC4xLTQ1LjkgNjAuMi00NS45IDk1LjEgMCA2OC4zIDI3IDEzNi42IDY1LjQgMTkyLjUgMTAuMSAxNC43IDIyLjMgMjcuNyAzMyA0MiAzLjEgNC4xIDguMSA3IDExIDExLjMgLjQgMi44LTQuMyA1LjQtNi42IDMuOS02LjMtNC0xMS45LTEyLTE2LjgtMTcuNi0xOC42LTIxLjMtMzQuMS00NC4zLTQ4LjYtNjguNC0yMC41LTM0LTMyLjUtNzEuNC00MS44LTEwOS43LTQuOS0yMC41LTcuMi00My00LjctNjQgMi43LTIyLjYgNi00Ni42IDE5LjQtNjYgMjQuNi0zNS4zIDY4LjQtNDUuOCAxMDguOS0zNCA0OC42IDE0LjIgOTEuOSA0Ny42IDEyMy4zIDg2LjcgMTAuMyAxMi44IDIwLjIgMjUuOSAyOSAzOS45IDIuOSA0LjcgOCAxMC41IDkgMTZ6TTg4OC4zIDE3Ni43YzEuNCAyLjggLjcgNi44IC43IDkuOCAwIDcuNSAwIDE1LjEgMCAyMi42IDAgNC0uOSA5LjIgMi44IDExLjkgMi43IC42IDIuMS01LjEgMi4zLTYuNSAuNi03LjUgLjEtMTUuNSAxLjEtMjIuOSAyLjYtNC40IDEyLjEgMi42IDE0IDUuNCA2LjUgOS4yIDMgMTguNi0yLjggMjcuMi0xLjUgMi4yLTMuMSA2LjgtNS45IDcuNi03IDEuOS04LjItMy0xMi43LTYuNC0zLjMtMi40LTguNy01LjMtMTEuMS04LjUtMy00LjEtMy44LTExLjEtNS4yLTE1LjgtMS45LTYuNi01LjEtMTIuOC04LTE4LjktLjEtMi42IDMuNy0zLjIgNS44LTMuOSA1LTEuNSAxNC4zLTQuNyAxOS0xLjZ6TTgxMC43IDIwOS4xYy4zIC42IDEgMS41LS4yIDEuNi00LjUgLjUtMTEuNy0uMi0xNi4yLTEtMS40LTEuMiA1LjctNSA3LTUuMyAyLjctLjcgNy41IDIuOSA5LjQgNC43ek03MzAuOCAyMDguNWMyLjktLjMgNi44IDMuMiA5LjUgNC4yIDYgMiAxMi4xIDMuNSAxOC4zIDQuMiAyMC4yIDIuNCA0My4zLTcuMSA2Mi42IDIuNCAzLjcgMS45IDYgNC43IDkgNy41IDIuMiAyIDQuNSAzIDYuMyA1LjUgMCAyLjUtMy44IDQuNC01LjYgNS42LTUuOSAzLjgtMTIuMyA3LjEtMTguNiA5LjktOC41IDMuNy0xOCA2LjktMjcuMyA3LjItMTggLjUtNDAuNS04LjYtNTEtMjMuOC0uNi0xLjYgNC45IDMuMSA1LjUgMy44IDMuMiAyLjkgNy43IDQuNiAxMS41IDYuNSAxMS42IDUuNyAyOC4zIDguOCA0MC41IDQuMSAxLjItMS4yIDEuMy0yIDAtMy4yLTYuOC0xLjktMTUuMS0uNC0yMi4zLTEuNi0xNS0yLjYtMjkuMS05LjQtMzguNS0yMS41LTIuMS0yLjYtNC40LTQuNC01LjktNy41LS4xLS4zLS40LTEtLjEtMSAxLjItLjIgMi44IDIuMyAzLjUgMyAyLjYgMi41IDUuMiA0LjcgOC4xIDYuOSA3LjQgNS40IDE1LjUgOS45IDI0LjYgMTEuNCAyLjcgLjQgNC45IDEuMiA3LjYgLjUgMy0yLjctNS43LTQuNC03LjMtNC44LTkuMS0yLjEtMTUuOS03LjUtMjMuMy0xMi43LTEuOC0xLjItNy4yLTQuMS03LjEtNi42ek04ODQuOCAyMzAuNWMuOCAxLjItLjQgMS41LTEuMiAyLjQtLjEgMS44IDEuOCAyLjQgMyAzLjQgMy40IDIuNyA2LjYgNSA4LjcgOC45LS40IDMuMS05LjQgMi41LTExLjggMy42LTEuMyAxLjEgLjggMi4yIDEuOSAyLjggMyAxLjUgNi40IDIuMSA5IDQuNCA1LjIgNC43IDIuNyAxMC4xIDUuNCAxNS42IDEuNiAzLjMgNS4xIDQuNyAzLjggOC45LTEuMyA0LjktNS4xIDQuOS05LjEgNS44LTcuNCAxLjgtMjEuMS0uNi0yNi43LTYuMy0xLTIuNCA2LjUgMCA4IDAgNi40IC4xIDEzLjctLjYgMTguNC01LjQgLjQtMS45LTIuNy0xLjYtNC0yLTEuNi0xLjYgLjQtNC4xIC43LTYgLjctNS4zLTEuOC0xMS44LTguMi0xMC4yLTIuOSAyLjMgMiAzLjYgMi45IDUuNiAwIDEuNi0uNSAyLjctMS40IDMuOS02LjkgNC44LTkuNC0xMC42LTEwLjctMTQtMi0xLTIuOSAyLTMuOSAzLjMtMi4xIC41LTEuNi0zLjItMS42LTQuNCAwLTUuNyAyLjEtMTAuMyAzLjYtMTUuNy0uMi0xLjgtMS4xLTEuOS0yLjYtMS40LTEuOSAxLjMtMi41IDMuNC00LjIgNC44LTIuNiAyLjEtNi4xIDIuNC04IDUuNXMtMS44IDYuNy0xLjggMTAuMmMwIDkuNCAyIDE3LjcgNy4xIDI1LjYgLjMgMS44LTMuNS0uNS00LjItLjktMy42LTItNi00LjctOS03LjUtNS40LTUtMTEuOS05LjEtMTcuMi0xNC4yLTIuMy0yLjMtNS4xLTQuNC01LjUtNy44IDEuMS00LjMgMTEuMi05LjUgMTUuMS0xMS41IDIuMi0uNCAxLjcgMi40IDEuMyAzLjgtMSA0LjQtMS45IDExLjMgMi4yIDE0LjMgMi42IC43IDIuMy00LjQgMi43LTYgMS41LTYuNSAxLjItMTEuOSA0LjUtMThzMTAuNi0xMy43IDE3LjYtMTEuN2M2IDEuOCAxMC4yIDYuOSAxNS4yIDEwLjJ6TTkzNC4yIDIyOS41YzEuNSAuNyAyLjIgMS40IDIuNiAzLS42IDQuNi05IDEzLjctMTMuNyA5LjktMy00LjEgNi44LTEzLjEgMTEuMS0xMi45ek04OTcuOSAyMzguNGM0LjYtMS44IDEwLjEgMi4xIDEzLjkgNC4zIDQuOCAyLjggMTAuNSA1LjYgMTMuNiAxMC40IDMuNyA1LjUgMS45IDE2LjUgLjQgMjIuNS0xIDEuMy0zLjMgLjMtNC42LS4zLTIuNi0yLjgtMS4yLTEwLjEtMS4yLTEzLjggMC0xLjYgLjMtMy43LTEuMi00LjgtNi4xLTQuOC0xMi43LTUuNy0xNy40LTEyLjYtMS0xLjYtMy45LTMuNS0zLjUtNS43ek04NjIuMSAyNDUuOGMxLjIgLjggLjkgMi45IC45IDQuMiAwIDMgLjUgNiAxLjggOC43IDEuNyAzLjggNC4zIDIuOCA2LjggNS4yIDEuMyAxLjMgMS43IDMuMyAyLjcgNC44IDEuNyAyLjEgNC44IDMuNyA3LjIgNC43IDIuMiAyLTkuNiAxLjYtMTEuNSAxLjEtOC43LTIuNS0xMC43LTEwLjgtMTEtMTktLjEtMy4zLS4xLTcuOCAzLjEtOS43ek04MjAgMjUwLjdjMi4yIDEuMiAyLjUgNS4yIDQuMiA3LjEgNCA0LjMgMTAuMSA3LjYgMTMuMyAxMi4zIDMuOCA1LjYgNC42IDE0LjEgNy45IDIwLjMtLjIgMi4xLTMuMSAxLjYtNC43IDEuOS00LjIgMS04LjYgLjctMTIuOSAuNy0xNC4yIDAtMjguNiAuOC00Mi43LS45LTUuMi0uNi0xMS4zIC40LTE2LjMtMS43LTIuNi00LjEtMS43LTEwLjEtMS44LTE0LjdzLTEuNy0xMC0uNy0xNS4zYzEuNy0yLjQgNC4zLS44IDYuNy0uNSA1LjggLjcgMTIuMSAuMiAxNy45IC4xczEyLjctMiAxOC4zLTQuM2MzLjUtMS40IDctNC4zIDEwLjgtNXpNODk4LjcgMjUwLjdjMi4xLS40IDcuMyA0LjggOC45IDYuM3M1IDIuMSA2LjUgNCAuOSA0LjYgLjkgNi43YzAgNS44IC4yIDkuNC00LjYgMTMuMi0xLjUgLjYtMS40LTEuNS0xLjYtMi41LS42LTMuNS0yLjMtNi45LTMuMy0xMC4zcy0xLjctNy44LTMuOC0xMS4zYy0uOS0xLjYtMy40LTQuMi0zLTYuMXpNNzU5LjIgMjYyLjljMS42IDEgLjcgNS40IC45IDcgLjggNi45LS45IDE3IDIuMiAyMy4zIDIuNSA0LjkgMTUuMiA0LjIgMjAuMiA1IDEuNyAxLjItNi40IDMuMi03LjMgMy41LTQuNSAxLTEzLjMgMS40LTE3LTEuOS0yLjItMi4xLTMuMS01LjktMy4yLTguOC0uMi03LjYtMS43LTIyLjEgNC4yLTI4LjF6TTk2MS41IDI2Mi44YzEuNi0uMSAyLjMgMiAzIDMuMSAyLjMgMy44IDQuNyA3LjMgNyAxMSAxMS40IDE4LjggMTAuMiA0MS4zIDMuNiA2MS4zLTEuMSAyLjEtMS4xLTcuMi0xLjQtOC42LTEuNS02LS43LTEzLjUtLjctMTkuOCAwLTEwLjktMi0yMS41LTUuNS0zMS44LTEuMi0zLjQtMi4yLTYuNi0zLjgtOS44LS43LTEuNS0yLjQtMy43LTIuMi01LjR6TTk5MS41IDI3MC44YzEuOS0uMSAyLjkgMi43IDMuOCAzLjkgMy40IDQuMiA3LjMgNy44IDEwLjMgMTIuMyAxMC43IDE1LjcgMjEuOCAzMC40IDI3LjggNDguOCAxLjQgNC4yIDMuMyA4LjQgMy41IDEyLjktLjUgMi45LTMuNS03LjMtNC4yLTkuMi0yLjYtNi45LTcuMS0xMy4xLTEwLjQtMTkuNy01LjctMTEuNC0xMy4xLTIzLjEtMjAuNi0zMy40LTIuOC0zLjgtNS44LTcuNS04LjEtMTEuNC0uNy0xLjItMi4yLTIuOS0yLjEtNC4yek04NDUuNSAyNzYuOGMxLjctLjEgMy45IDMuMSA1LjEgNC4yIDIuNyAyLjYgNi4zIDMuOCA5LjcgNS4yIDEzLjUgNS44IDI3LjUgOC42IDQxLjYgNC41IDIgLjctMy41IDUuNC00LjMgNi4yLTMuNyAzLjktMTAgNy0xNS40IDcuMS00LjIgLjEtMTIgMi43LTE1LjcgMS41LTEuOS0uNi0zLjMtMi45LTQuNy00LjItNS40LTUuMy05LjctMTAuMi0xMy0xNy0xLTItMy42LTUuMy0zLjMtNy41ek05MDQuMiAzMDAuNmMtMS42LTEuNiAxLjYtNC4xIDIuNS01LjggMi41LTUgNS04LjEgOS4xLTEyIDEuNi0xLjUgMy4xLTMgNS41LTIgNC4zIDEuOSA1LjggMTMgMi43IDE2LjMtMy43IDMuOS0xNSA0LjgtMTkuOCAzLjV6TTY3MS42IDI5Mi44YzEuOS0uNSAzLjIgMy44IDMuOSA1LjIgMS41IDMuMSAzLjIgNi4xIDQuMiA5LjRzLjYgNy41IDQuMiA5LjJjNC41IC4zIDguNy0xMC4xIDExLjQtMTMuNCAyLjEtMS4zIDEuNyAyLjIgMS43IDMuNSAwIDQuNi0uNSA5LjItMS4xIDEzLjgtMi4yIDE1LTExLjEgMjguNi0xNS45IDQyLjgtMS41IDIuNy0yLjctMi45LTMuMS00LjEtMS45LTUuOC0zLjUtMTEuNi00LjgtMTcuNy0yLjYtMTEuOC0yLjctMjQuMS0xLjItMzYuMSAuNS0zLjktMS04LjkgLjctMTIuNnpNOTk1LjUgMjkyLjhjMS42IDAgMi42IDMuMSAzLjQgNC4zIDIuOSA0LjcgNS4zIDEwIDcuNCAxNS4xIDguNiAyMC45IDEyLjMgNDkuNCAyLjUgNzAuNi0xLjEgLjctLjYtMi4zLS41LTIuOCAuNS0yLjggLjYtNS4zIC43LTguMiAuNC03LjYgLjYtMTUuNi0uMS0yMy40LTEtMTItMy45LTI0LjUtNy4zLTM2LjEtMS41LTUuMy02LjktMTQtNi4xLTE5LjV6TTgwNS43IDI5OS4zYzEuNyAxLjUgMS40IDQgMS4yIDYuMS0uMyA1LjEtMi4xIDEwLjEtMi45IDE1LjEtMi43IDE2LjktOC40IDM1LjEtMTUuMiA1MC43LTIuMiA1LjEtMy4yIDEzLTYuOSAxNy4xLTQuOSAyLjEtMTEuNCAuNS0xNi40LS4yLTIuNS0uMy01LS4xLTcuNC0uMXMtNC0uMS01LjkgLjFjLTQuNyAuNS01LjggNC40LTMuNCA4IDQuNCA2LjQgMTEuNiAxMC42IDE2LjkgMTYuMSAxLjggMS43IDQuNyAzLjggNC44IDYuNC0xLjQgNC40LTYuMSA4LjMtOS4yIDExLjYtNy42IDcuOC0xNS43IDE1LjMtMjMuMiAyMy4yLTkuMyA5LjgtMTkuOSAyMi40LTI0LjggMzUuMi0yLjkgNy41LTMgMTQuNS00LjYgMjIuMS0xLjMgMS4yLTMuNC02LjQtMy43LTcuNS0yLjItOC45LTMuMS0xNy43LTMtMjcgLjItMTguMyA4LjItMzYuMyAxNi45LTUyLjEgMi45LTUuMiA3LjktOS4zIDEwLjMtMTQuOCAwLTEuNS02LjQgMi44LTcuNiAzLjUtNS4yIDIuOC0xMCA1LjItMTUuNyA2LjgtMTUuOCA0LjMtMzAuNS0xLjEtNDQuNi03LjgtMS0xLjMgNS44LS4zIDYuNy0uMSA0IC45IDguMS0uMiAxMi4xLS44IDEwLjQtMS40IDIxLjQtOS4xIDI5LjYtMTUuMyAxNy45LTEzLjYgMzMuNi0zMy40IDQ0LjUtNTIuOSA0LjMtNy42IDcuNy0xNi4zIDEyLjQtMjMuNSAyLTEuNSAuMSAzLjItLjEgMy44LTEuNCA0LjEtMyA4LjMtMy43IDEyLjYgMCAyLjUgMi44LS44IDMuMy0xLjUgMi42LTMuNiA1LjktNy40IDktMTAuNiA1LjMtNS42IDkuMi0xMi42IDE0LjQtMTguNSAxLjQtMS42IDMuMS00LjcgNC45LTUuNiAyLjgtMS4zIDguNC0uNyAxMS4zLS4xek05NDcuMyAzMDBjMi40IC44IDIuNSAxMC4xIDMgMTIuMiAzIDEyLjUgLjggMzAuMi01LjMgNDEuNi0yLjIgMi4xLTEtMi41LTEtMy42IC4xLTQuOCAuOC05LjQgMS0xNC4xIC40LTkuMyAuMS0xOS4xIDEuOC0yOC4zIC40LTIuNS0uMy01LjMgLjUtNy44ek00MTYuNSAzNTVjLTMuMSAyLjQtMTEuOC01LjYtMTQuNS03LjUtOC4xLTUuNy0xNi44LTEyLjktMjIuMS0yMS40LTMuMS00LjktNS4xLTEwLjMtMi44LTE2IDMtNy4yIDExLjMtMi43IDE2LjUtMi4yIDMuMSAuMiA1LjctMi4yIDguNC0zLjQgNS42LTIuMyAxMi0xLjMgMTUuNyAzLjggMi4xIDIuOSAyLjMgOS4yIDIuMyAxMi43IC4xIDEwLjUgMCAyNC0zLjUgMzR6TTg4MS4xIDMxMy44YzEuNCAuOC0uOCAzLjktMS40IDUtMi40IDQuOS01LjIgMTAuNC02LjcgMTUuNy0zLjUgMTIuMS05LjEgMjMuOS0xNC4zIDM1LjMtNC45IDEwLjgtMTAuMyAyMy42LTE4LjYgMzIuMi0xLjQgLjQtLjItMS42IC4xLTIuMSAxLjQtMi42IDIuOS01LjEgNC4yLTcuOCAzLjQtNi44IDUuNy0xNC4yIDktMjEgNi43LTEzLjcgMTEuNS0yOC4xIDE4LjQtNDEuOCAyLjEtNC4zIDUuNC0xMi42IDkuMy0xNS41ek03NTcuMiAzMjIuOWMxLjYgLjktMS40IDQuOC0xLjkgNS44LTIuOSA1LjYtNi4zIDEwLjgtOS4zIDE2LjMtNy4xIDEzLjItMTcuNCAyNC40LTI3LjcgMzUuMS03LjUgNy44LTE2LjMgMTUuOC0yNi43IDE5LjQtMS4zLS4xIDcuOC02LjYgOS4zLTcuOCA2LTUuMyAxMi42LTEwLjYgMTguMS0xNi40IDEwLjItMTAuNiAxOS4xLTIzLjQgMjcuMy0zNS42IDMuNC01LjEgNi40LTEyLjcgMTAuOS0xNi44ek05NjcuNSAzMzkuOGMxLjctLjMgMS41IDIuMSAxLjUgMy4yIC4xIDQuMy0xIDguMi0xIDEyLjUtLjEgMTEuOS01LjUgMjUuMS0xMSAzNS41LTIuMyA0LjMtNi44IDgtNy41IDEzIDEgMy42IDcuMi0uMiA5LjItMS4zIDguMS00LjEgMTYuMS0xMS42IDIxLjgtMTguNiAxLjYtMS00LjkgOC44LTUuMyAxMC40IC43IDMgNC40IDMuMyA2LjEgNS43IDYgOC43IDE0LjIgMTYuNyAyNCAyMSA0LjUgMi4xIDEwLjEgMi41IDE0LjUgNC44IDEuMSAxLjYtMS41IDQuNS0yLjMgNi0zLjQgNS42LTYuOCAxMS4xLTEwLjIgMTYuOC0xLjYgMi43LTMuOCA2LjYtMi45IDkuOXM0LjMgNi41IDQuMSAxMGMtMS44IDIuNi01LjIgNS40LTUgOSAxIDEuMyAyLjYgMi41IDMgNC4xcy0xIDMuNC0xLjcgNS0xLjIgNS0xLjYgNy40Yy0xIDUuNyAyLjEgMTQuOS0xLjEgMTkuOS0yLjcgNC4yLTEwLjQgNS0xNC44IDYuMi0xMC41IDIuOS0yMS42IDUuMi0zMi40IDYuNi02LjMgLjgtMTQuMiAuNy0xOS42IDQuNC0xNi45IDExLjktMjEuMSAzMi40LTMyLjMgNDguNS0xIC42LTEuMi02LjgtMS44LTgtMi4yLTUuNS01LjUtOC43LTkuNy0xMi44LTcuNS03LjEtMTgtMTAuOS0yNS4zLTE4LjItMi42LTIuNi0zLjQtNi44LTUtMTAtNC04LjktNS41LTE4LjctNi4zLTI4LjItLjItMy4yLTEuMS01LjktLjctOS4xIC4xLS4xIDMgNi45IDMuOCA4LjUgMi43IDUuOCA1LjggMTAuOCA5LjUgMTYgOC4zIDExLjkgMjIgMjIuMSAzNi4zIDI1LjIgNC45IDEuMSAxMy41IDIuNiAxNi4zLTIuOSAuNC0yLjUtOC4yLTYuMi0xMC4zLTcuNi04LjktNi0xNi44LTE1LjctMjAuNC0yNS45IC4xLS4zIC4xLTEgLjQtLjkgLjkgLjMgMS43IDIuMiAyLjQgMi45IDIuMiAyLjIgNS4zIDQuMSA4LjEgNS40IDguMiA0LjIgMTcuNiA2LjkgMjYuOCA3LjcgMy42IC4zIDcuOS0xLjEgMTEuNC0xLjkgMTUtMy4yIDM0LTE1LjkgMzktMzEuMiAwLTEuNi0uNy0yLjMtMi4zLTIuMy02LjYgMi4xLTEyLjIgNi4zLTE5LjYgNS40cy0xMy4xLTQuMS0xOC42LTguNGMtMTguNi0xNC41LTIwLjgtMzQuOS0xOS4xLTU3LjEgLjYtNy4zIDEuOC0xNS40IDQuNS0yMi4zIDEuNS0uOSAxLjcgMi43IDEuOSAzLjYgMS4zIDQuNCAyLjggOS4xIDQuNyAxMy4zIDUuMiAxMS4xIDEzLjMgMjguMiAyNS44IDMyLjYgMS44IDAgMi0uOSAxLjYtMi41LTktMTMuMi0xMi4yLTI3LjctMTMuMy00My43LS40LTQuOSAuNC05LjktLjItMTQuOC0uNy01LjctLjktMTEuMy0uOS0xNy4xIDAtMi4xLS41LTUuMSAuNC03LjEgMS41LTMuMiA3LjgtNSAxMC40LTcuNiA2LjUtNi41IDEwLjItMTMuMyAxNC43LTIxek03MDEgMzQxLjdjMi44IDIgLjUgOS41IC4xIDEyLjQtMS43IDExLjUtNC41IDIwLjYtMTMuMyAyOC43LTIuOSAyLjctOC4zIDIuNi0xMC41IDYtMi44IDQuMyA3LjIgMTAuMiAuNiAxNS4xLTcuNiA1LjYtMTguNy0xLjEtMjYuOCAuOC02LjEgNC4yIDUuOCAxMC41IDguOCAxMi40IDEuNiAyLjEtMy4zIDUtNC45IDYuNC01LjkgNS4zLTEyLjEgMTEuNC0xOSAxNS41LTQuMiAyLjUtOC4zIDUuOC0xMi4zIDguNy0xNS4xIDEwLjQtMzMuMiAxOS4xLTUwIDI2LjUtNi4xIDIuNy0xMi4zIDYuMS0xOC43IDguMy0zLjQgMS4yLTkuNSAzLjEtMTEuNSA2LjMtLjIgMS44IC4zIDIuNiAyIDMgMTEtMS4zIDIxLjgtOC42IDMxLjctMTMgMjMuNS0xMC40IDQ0LjgtMjMuMiA2NS45LTM3LjcgNS43LTMuOSAxMS42LTguNiAxNi43LTEzLjMgMi0xLjkgMy43LTQuNCA2LjEtNS45czUuMiAuMyA2LjYgMmMuOCAzLjEtMS4zIDcuMy0yLjIgMTAuNC0yIDYuOS00LjEgMTMuNy02LjQgMjAuNS05IDI2LjMtMTcuMiA1My4yLTI3LjYgNzguOS0zLjkgOS44LTcuMSAyMC0xMC42IDI5LjktNy4xIDIwLjItMTcgMzkuOS0yNi40IDU5LjEtMy43IDcuMy02LjcgMTUtMTEgMjJzLTcuNiAxNC41LTExLjUgMjEuNWMtMS43IDMuMS0yLjggNy4xLTUuMyA5LjctNS4xIDUuNS0xMy4yIDkuNC0xOS40IDEzLjYtMjAuNSAxNC4yLTQyLjEgMjYuOC02Mi43IDQwLjgtMTcuMSAxMS43LTM1LjYgMjEuMy01My4zIDMyLjItNDAgMjQuNi04MS40IDUwLjMtMTE2LjUgODEuNS0xNC4yIDEyLjYtMjkuNyAyNi4xLTQxLjIgNDEuMy0zLjkgNS4xLTguMSA5LjktMTIgMTUtMy4yIDQuMi01LjcgOS4zLTkuNCAxMy4xLTExLjkgMTIuMS0yOC42IDIwLjItNDIuOSAyOS4xLTIzLjUgMTQuNi00OS4xIDI2LTc1LjYgMzMuOC0xMCAzLTIwIDcuMS0zMC4zIDguNS0uMiAwLTEuNCAwLTEuNC0uNnMzLjMtMi4yIDQuMS0yLjdjMy41LTIuMiA3LjUtNC42IDEwLjUtNy40IDIuMi0yIDUuMS0yLjkgNy41LTQuNiA4LjQtNS44IDE2LjQtMTIuNiAyNC42LTE4LjggMTEuMS04LjMgMjAuOS0xOC4zIDMxLjQtMjcuMSAzLjgtMy4yIDYuNy03LjQgMTAuNy0xMC4zIDE0LjQtMTAuMiAzMC42LTE5LjMgNDIuOC0zMi4yIDMtMy4yIDYuMy01LjEgOC43LTkgLjItMS44LTQuMyAxLjQtNSAxLjgtNS40IDMtMTAuMSA3LTE1LjIgMTAuMy0xMy42IDguNy0yNy40IDE3LjctNDAuNiAyNi45LTExLjUgNy45LTI0IDE0LjItMzYuMiAyMC44LTIwLjkgMTEuNC00Mi4xIDIxLjYtNjQuMiAzMC4zLTEwLjEgNC0yMC42IDguMy0zMS4yIDEwLjgtMy4zIC44LTYuNyAyLjktMTAuMiAyLjgtMS41LS43IDEuNy0xLjkgMi40LTIuMiAzLTEuNSA2LjEtMi45IDktNC41IDcuNy00LjIgMTUtOS4xIDIyLjctMTMuMyAxNi4zLTkuMSAzMS42LTIwLjMgNDYuNi0zMS40IDUuMi0zLjggMTAuMS03LjggMTQuOS0xMi4xIDIuNC0yIDUuMi0zLjUgNy4xLTYuMiAuMy0yLjEtMS45LTEuNi0zLjMtMS40LTQuMiAuOC04LjctLjMtMTIuOSAuNi0xOC42IDMuOC0zOC40IDIuNC01Ny4yIDUuNC0yLjUtLjQgNC40LTIuNiA1LjMtMi45IDQuNS0xLjYgOS4yLTIuNyAxMy44LTQuMiAxMy42LTQuNSAyNy45LTguNyA0MS0xNC41czI2LjctMTAgMzkuNi0xNS45YzI3LjYtMTIuNSA1NC44LTI1LjUgODEuNC00MC4xIDI3LjktMTUuMyA1My44LTM0IDgwLjMtNTEuNyAxNi4xLTEwLjcgMzEuMy0yMi42IDQ3LTMzLjkgMTcuNS0xMi43IDM1LjMtMjUuNyA1MS43LTM5LjkgMTUtMTIuOSAyOS41LTI2LjQgNDQtMzkuOSA3LjktNy40IDE0LjEtMTcuNCAyMi44LTIzLjcgMy41LTIuNiA5LjEtMi4xIDEzLjEtMy40IDUuNS0xLjkgMTAuNC01LjYgMTUtOSAzLjgtMi45IDcuMi03IDEwLjUtMTAuNSA2LjktNy4yIDE0LjItMTMuOSAyMC4xLTIxLjkgMi43LTMuNiA2LjMtNi44IDkuMi0xMC4zIDExLjMtMTMuNCAyMi43LTI4LjMgMzEuMy00My43IDQuOS05IDEzLjktMjAgMTMuOS0zMC44LS41LTEuNC0xLjEtMi4zLTIuNi0xLjQtNy4xIDguOS0xMS40IDIwLjctMTcuNSAzMC40LTE1LjIgMjMuOS0zMy4xIDQ4LjMtNTMuNiA2Ny45LTEwIDkuNy0xOC40IDIwLjctMzIuNiAyNC40LTMuOSAuOS05LjEgLjYtMTMuMSAuMi00LjgtLjQtOS41LTIuMi0xMy45LTQtMi4xLTEuNSA0LjEtNC4yIDUuNi01IDUuMy0yLjggMTAtNyAxNC42LTEwLjkgMi4yLTEuOSA0LjYtMy4xIDUuNy02LS4zLTMuOS02LjggLjktOC4xIDItNC44IDQuMS0xMC45IDcuMy0xNi4zIDEwLjctMi41IDEuNS01LjcgNC04LjUgNC44LTEuNiAuNS0zLjMtMS4xLTQuNC0yLjEtLjktMS43IDEtMi41IDIuMy0zLjEgMy45LTIuMSA3LjgtNC4zIDExLjctNi40IDExLTYuMSAyMC44LTE0LjEgMzEtMjEuNCAzLjgtMi43IDktNi42IDExLjItMTAuOC0uMi0xLjQtLjktMS45LTIuMi0yLjEtNi42IDItMTIuNyA5LTE4LjIgMTIuOS05LjkgNy0yMC41IDE0LjMtMzEuMyAxOS43LTI5LjMgMTQuNy02NC43IDEuOS04OC43LTE3LjgtNy44LTYuNC0yMC4zLTE3LjgtMTkuNC0yOS4yIDItMi43IDYuOS0zLjYgOS45LTUgOS44LTQuNSAyMC4xLTguMyAzMC40LTExLjYgMjYuNy04LjYgNTMuNy0xNi40IDgwLjYtMjQuMyA2LjYtMS45IDEzLjEtMy45IDE5LjctNS44IDQuNy0xLjQgMTAuNC0yLjMgMTQuNi00LjkgMS0xLjIgLjctMi0uNC0zLjEtNi4xLTIuMS0xNS41IDMtMjEuNiA0LjMtMTguOSA0LjMtMzcuMSAxMS44LTU2IDE2LTIwLjggNC43LTQzIDExLjMtNjIuNSAyMC0xNC40IDYuNC0yOS4xIDE0LjMtNDQuMyAxOC43LTE5LjUgNS44LTQwLjMgNi4xLTYwLjQgOC42LTEzLjEgMS43LTI2LjQgMy44LTM5LjIgNy4zLTYuMSAxLjYtMTIuMyA0LjItMTguNCA1LjMtMi43LS41IDMuMy01LjUgNC40LTYuNSA2LjctNi4zIDE0LjktMTEuMSAyMi40LTE2LjYgMTkuNi0xNC4xIDQyLjYtMjQuNCA2NS4zLTMyLjEgNDIuOS0xNC41IDg4LjItMTguMSAxMzIuNi0yMy40IDE2LjMtMS45IDMyLjctMy4xIDQ5LTUgOC43LTEgMTcuOC0yLjMgMjYtNS42IDEuMi0xLjEgMS4xLTItLjEtMy4xLTQuNi0xLjMtOS41IDEuMi0xNC4xIDEuNS0xMy42IDEuMS0yNy42IDUuNy00MS4zIDUtMi41LS42IDUuNS0zLjIgNy4xLTMuOCA1LjctMi4xIDExLjItNC44IDE2LjktNyAxMC45LTQuMSAyMS4zLTkuNyAzMS43LTE0LjkgNS41LTIuNyAxMS44LTUgMTYuOS04LjUgMTMuNC05LjMgMjkuMi0xNS45IDQzLjMtMjQuMyAyMS40LTEyLjcgNDMtMjguMiA2MS4yLTQ1LjIgMTEuNi0xMC43IDI0LjUtMjAuMiAzNS4xLTMyLjIgMS4zLS41IDIuMSAxLjcgMy4xIDIuNSA0IC45IDYuMS01LjMgNy4zLTguMyAzLTcuMyA3LTIxLjggMTYuMy0yMy41ek05MjAuNSAzNDQuOGMxLjYtLjYtLjQgOC44LS41IDEwLjItLjIgNy40IDAgMTUgMCAyMi40IDAgNSAxLjcgMTAuNSAuOCAxNS4zcy00IDEwLjQtNS40IDE1LjVjLTEuNiA1LjgtMiAxMi0zLjEgMTcuOXMuNyAxMy4zLS42IDE5LjZjLTEuMSAxLjEtMi40LTcuMy0yLjYtOC41LTEuMS04LjYtLjQtMTYuMy0uMS0yNC45IC41LTEzLjkgNC4xLTI4LjEgNS45LTQyIDEtNy45IDItMTguMyA1LjYtMjUuNXpNOTg4LjIgMzUwLjljMi41IDEuNS0xLjYgMTAuOC0yLjMgMTIuOS00LjQgMTIuOC0xMy4xIDIyLTIzLjYgMzAuMS0xLjggLjgtLjItMi4yIC4yLTIuNyAyLTMuMyAzLjctNi40IDQuOS0xMCAyLjktOC43IDMuOC0xNy45IDYuNS0yNi40IDEuMy0yLjYgMS4xIDMuNiAxLjEgNC4zIDAgNC42LS41IDkuMS0uNiAxMy42IDEuMiAxLjYgMy43LTIuOCA0LjItMy43IDMuMi01LjMgNS4zLTEzLjcgOS42LTE4LjF6TTQ0NSA0MDcuOGMtMi4zIDItMTEtNS4yLTEzLjUtNi42LTkuMy01LjEtMjAuMS0xMy0yNS43LTIyLjEtMi40LTMuOC00LjQtOS44LTEuNC0xMy44IDMuOC01LjMgOS45LTEuNSAxNC43LTNzNS4zLTggMTEuNy03LjFjMTUuOCAyLjMgMTMuNSAyNi44IDE0LjIgMzguMSAuMyA0LjcgMi40IDEwIDAgMTQuNXpNNjcwLjQgMzU5LjdjNC41LS4yIC43IDYuOC0uNiA4LjEtNi44IDYuNy0xNC42IDE1LjMtMjIuNyAyMC40LTEuNi0uMSAuNi0yLjUgMS4xLTMgMi4zLTIuMyA0LjItNC44IDYuMy03LjIgNS4zLTYgMTAtMTMgMTUuOS0xOC4zek0xMDE2LjQgMzc3LjljMy44LS41IDEuOSA2LjcgMS4zIDguMy0yLjkgOC4yLTYuMSAxNC42LTExLjIgMjEuNy0zLjEgNC4zLTguMSA0LjEtMTAuOS0uMS0uMi0xLjggMS0zIDEtNC44LTEuMS0yLjMtMi44LS42LTQuNy0uNS0xLjQtLjYtMS44LTEuNC0uNS0yLjQgMy41LTEuNSA2LjMtMy4yIDguOS01LjkgMS43LTEuMS0xLjQgMTAtMS4xIDEyLjIgMS45IDMuNSA2LjMtMi45IDcuMy00LjUgNC44LTcuNiA2LjEtMTYuMSA5LjktMjR6TTEwMDEuMSAzODQuOGMxLjQgLjgtMi4zIDQtMy4xIDQuNy0zLjcgMy4zLTguNCA2LTEzLjUgNS4zLTEuMy0uOCA0LjctMyA1LjctMy42IDMuOS0xLjkgNy4zLTQuMiAxMC45LTYuNHpNODM5LjEgMzg3LjhjMS4xIC42IC4xIDIuMS0uNCAzLTEuNiAzLjMtMy43IDYuMi01LjUgOS40LTcgMTMuMy0xNi4zIDI0LjUtMjQuNiAzNi45LTEyLjcgMTguNy0yOC45IDM0LjctMzkuNiA1NC45LTguNSAxNi0xMi44IDMzLjEtMTUuMSA1MC45LS4xIC40LS4zIDEuNC0uNiAxLjFzLS41LTIuNS0uNi0zLjJjLTEuMS00LjMtMS04LjctMi0xMy0yLjctMTEuNCAuNC0yNC4xIDIuMi0zNS40IDQuMi0yNS43IDE0LjYtNTAuNSAyNC42LTc0LjQgMy41LTguNiA1LjctMTguOSAxMC41LTI2LjggMS4xLS43LTEuNCA3LjctMS45IDguOS0yLjEgNi00IDEyLjEtNS44IDE4LjItMy41IDEyLjItNi42IDI0LjYtOS42IDM2LjktMS44IDcuMS00LjcgMTQuNy00LjYgMjIuMSAxLjEgMi44IDUuNS00LjEgNi40LTUuMyA1LjMtNy42IDExLjMtMTQuNyAxNy0yMiAxMC44LTEzLjYgMjMuNS0yNS43IDM0LjItMzkuMyAzLjYtNC43IDcuNi05LjggMTAuNS0xNSAxLjQtMi4zIDIuOC02LjMgNC45LTcuOXpNNzUzLjkgMzkzLjRjNS4zLTIgMTIuMyAuMiAxNy44IC42IDIuMyAuMSA0LjctLjIgNyAuNCAxLjUgMS4zIC4zIDMuMS0uMyA0LjctMS4yIDMuOC0yLjUgOC41LTQuNiAxMS45LTIgMS4yLTMuNC0xLjItNC43LTIuNC0zLjctMy40LTctNy4xLTEwLjYtMTAuNS0xLjMtMS4yLTUtMi42LTQuNi00Ljd6TTQ3OC44IDQ1OC4xYy0uOCAyLjMtMi41IDEuNS00LjIgLjYtMy44LTEuOC03LjctMy4yLTExLjUtNS4xLTEwLjQtNS4yLTIxLjgtMTEuMy0yOC43LTIwLjktNC41LTYuMi0zLjctMTYuNyA1LjYtMTcuNiAyLjktLjIgNS4yIDEuNiA3LjcgMi41IDIuOSAwIDIuOS0zLjYgNC41LTUuNCAzLTMuMiA2LjEtNC43IDEwLjctNC4xIDUuOCAuOCA4LjkgNy40IDEwLjEgMTIuNSAyLjcgMTIuNCA0LjggMjQuOSA1LjggMzcuNXpNMTA0Mi41IDQxNi44YzEuNSAwIDIuMSAyLjMgMi44IDMuNCAxLjYgMi44IDMgNS45IDQuOCA4LjYgNi44IDEwLjQgOS44IDI0LjkgMTEgMzYuOSAuNCA0LjEgMS40IDcuOCAuNiAxMi0uNyAuNy0xLjgtNi43LTItNy43LTEtNS4yLTIuNi0xMC4zLTMuOC0xNS42LTItOS4zLTYuNy0xOC41LTkuOC0yNy42LS45LTIuNS0zLjktNy41LTMuNi0xMHpNMTA0MC4zIDQ0MGMxLjMgLjIgMS45IDIuOSAyLjIgNCAxLjUgNS4yIC43IDEwLjMgLjUgMTUuNS0uNiAxNS42LTEzLjMgMzMuMy0zMC4zIDMyLjQtMS44LS42IDUtMi4yIDYuMS0yLjYgNC40LTEuNiA4LjctNC4xIDExLjItOC4zIDUtOC43IDgtMTYuMiA5LjgtMjYuMiAuNC0yLjQgMS01LjQgMS03LjhzLTEuMy00LjUtLjUtN3pNNDg0IDQ2NmMzLTQuNSAyLjktMTEuOCAxMC41LTExLjggOC44IDAgMTEuNSAxMS43IDExLjUgMTguMyAwIDIuMiAuOCA2LjMtLjkgOC4xcy00LjIgMi4yLTYuMSAyLjljLTQuOSAyLjEtMTEuNiA3LjctMTcuMiA2LjEtNy4xLTItMTUtMTIuNC0xMC4yLTE5LjUgMy4xLTQuNyA4LjUtMS41IDEyLjQtNC4xek0xMDIyLjUgNDU1LjhjMS44LS4xIDMuMSAyLjcgMy44IDQgMi43IDUuMiAyLjkgMTEuOC0uMiAxNi45LTEgLjgtLjEtNi4yLS4yLTcuNS0uNC00LjEtNC05LjQtMy40LTEzLjR6TTgxNi4zIDQ1OWMxLjQgLjYgMS42IDQuNyAxLjcgNiAuMyA2LjIgMi43IDEyLjQgNCAxOC41IDQgMTguMSAxMyAzOC42IDI1LjMgNTIuNSAyLjcgMS4zIC43LTQuOCAuNS01LjgtMS4zLTUuOS0yLjctMTIuMS0yLjgtMTguMi0uMy0xNy44IC4yLTM1LjIgNC4yLTUyLjYgLjktMS4zIC42IDMuMiAuNSAzLjgtLjggMy4xLS4zIDYuMy0xIDkuNS0yLjEgOC45IC4zIDE3LjkgLjMgMjYuOCAuMSAxOS43IDcuNiA0MS4xIDIwLjMgNTYuMiA0LjMgNSAxMS40IDguNCAxNy4zIDExLjEgMS42IDEuNS0yLjkgMS4yLTMuNiAxLjItMy44IDAtNy4zIDAtMTEtMS0xMC4zLTIuOC0xOC40LTguOC0yNS44LTE2LjItMTcuMi0xNy4yLTI1LjQtNDIuNS0yOC4zLTY2LjItLjYtNS4yLS40LTEwLjQtMS0xNS41LS40LTMuMy0xLjctNi43LS42LTEwLjF6TTgxMC4zIDQ2NGMxLjggLjkgLjcgOS42IC43IDExLjUgLjEgMTAuNCAyLjQgMjIuMiA1LjMgMzIuMiA4LjYgMjkuMiAyNS4xIDU0LjEgNTAuNSA3MSAxMy43IDkuMiAzMSAxNS41IDQ3LjQgMTAuNyAyLjQgLjItNC40IDQuNS01LjUgNS4zLTMuMyAyLjItOC40IDMuNy0xMi4zIDQuMi02LjggLjgtMTUuMS0xLjEtMjEuMS00LjItNC42LTIuMi04LjUtNS42LTEzLjUtNy4yLTMuNiAuMyAzIDUuOCA0LjIgNi41IDQuMSAyLjQgNy44IDYuNSAxMS4yIDkuOCA0LjUgNC40IDEwLjEgNy45IDE0LjYgMTIuNCAxMS41IDExLjYgMjAuNiAyNC45IDI4IDM5LjUgNCA4LjEgNy44IDE2LjIgOS4zIDI1LjIgLjkgNS45IDMuMSAxMiAyLjggMTgtMS4xIDMuOC0zLjUtNS40LTQuMi02LjYtMy41LTUuMS03LjEtOS43LTExLjItMTQuMy0xMS42LTEzLTI2LjktMTguOC00MS41LTI3LjUtOC41LTUtMTcuOS04LjctMjUuNy0xNC44LTYuMS00LjgtMTEuNi0xMC4zLTE3LjEtMTUuOS03LjktOC4xLTEzLjItMjAuOS0xNi41LTMxLjUtNy42LTIzLjctMTAuNy00Ni45LTEwLjctNzEuOCAwLTExLjYgMS4xLTIyLjYgMS45LTM0LjEgLjUtNS43IC45LTEzLjEgMy40LTE4LjR6TTg1Ny4zIDQ2OWMxLjIgLjYgMS42IDYuMSAxLjggNy40IDEgNS45IDMuOCAxMi40IDYuNCAxNy42IDguOSAxNy44IDIwLjIgMzAuMyAzNi4yIDQxLjggMS4yIDEuNi02LjgtMS45LTcuOC0yLjQtNS42LTIuOS0xMC4zLTYuNi0xNC44LTEwLjgtMTAuNS05LjctMTYuNy0yMS42LTIwLjQtMzUuMi0xLjUtNS41LTMuMS0xMi44LTEuNC0xOC40ek05MTcuNSA0NzAuOGMxLjYgMCAyLjggMyAzLjUgNC4yIDIuMiAzLjggNS4yIDYuNyA4LjMgOS44IDkuMiA5LjUgMjMuMiAxNC40IDM2IDExIDMuNi0uNC0yLjkgNC41LTMuOCA0LjktNC4zIDIuMi05LjMgMi45LTE0LjEgMi4xLTExLTEuNy0yMC44LTEzLjMtMjUuNi0yMi41LTEuMy0yLjMtNC42LTYuOS00LjMtOS41ek02NzkuMiA0ODkuOWMxLjUgLjgtMS4xIDUuMi0xLjUgNi4zLTIuMyA2LjMtNC4zIDEyLjYtNi42IDE4LjktOS44IDI3LjMtMTcuMSA1NS44LTI1LjYgODMuNiAuNSAyLjEgMy4zLS45IDQtMS43IDMuNS00IDYuOS04IDEwLjctMTEuOCAxMC44LTEwLjggMTguNy0yNC4xIDI5LjMtMzUuMSAuOC0uNi0zLjUgNy44LTQuOCA5LjYtNC42IDYuMS05LjggMTIuNy0xMy43IDE5LjMtNSA4LjUtMTIuNiAxNS43LTE4LjcgMjMuM3MtMTMgMTQuOC0yMC4xIDIxLjljLTIuOSAyLjktNS42IDYuNS05IDguOC0xLjggLjUgLjQtMy40IC43LTQuMSAxLjUtMy45IDQtNy40IDUuMS0xMS40IDEuNy01LjggNC44LTExLjIgNy4yLTE2LjhzMy41LTEwLjUgNS4zLTE1LjdjNy44LTIyLjkgMTUuNi00NS43IDI1LTY4IDIuNi02LjQgNS4yLTEyLjYgOC4zLTE4LjcgMS4zLTIuNyAyLjQtNi4zIDQuNC04LjR6TTEwMzYuMyA0OTBjMS4xIC41IC43IDMgLjcgNCAwIDQuMy0uNiA4LjMtLjkgMTIuNS0xLjIgMTQuMS03LjYgMjctMTUuNCAzOC41LTIuNSAzLjctNSA3LjktOC40IDEwLjktMS44IC44LS42LTIuNS0uNC0zLjMgMS00LjggMi4xLTkuNSAyLjEtMTQuNCAwLTcuMSAuMS0xNC4yLTEuMy0yMS4yLS43LTMuMy0yLjYtNy0yLjQtMTAuNSAxLjQtMi44IDMuNyAzLjQgNC4zIDQuNiAzLjIgNi41IDQuMSAxMy4zIDYuOCAxOS44IDEuNyAuOSA0LjktNy41IDUuNS05LjEgMi40LTYuNiA1LTEzLjMgNi44LTIwLjIgLjktMy44IC45LTguMSAyLjYtMTEuNnpNODgwLjMgNDk0YzEuNyAuNSAyLjUgNi4yIDIuOSA3LjcgMS41IDYuNyA0LjggMTIuNyA4LjIgMTguNSAuNCAyLjctNC45LTUuMi01LjUtNi4zLTIuNi00LjctNy4zLTE0LjQtNS42LTE5Ljl6TTc5OC4zIDUyMWMxLjEgLjUgLjcgMyAuNyA0IDAgNC43IDEgOS4yIDEgMTMuOSAwIDIuOSAxIDYuNiAuNiA5LjMtLjMgMi4xLTEuOSA0LjEtMi44IDYtMi45IDYuNi02LjEgMTIuMi0xMC40IDE4LTEuNiAyLjMtMy43IDUuOC02LjMgNy0xLjcgLjctNS4zLS4yLTcuMi0uMy0yLjUtMS0uNS0zLjEgLjUtNC43IDMuMy00LjkgNi0xMCA4LjctMTUuMyA0LTguMSA4LTE2LjIgMTEtMjQuOCAxLjUtNC4zIDIuMi05IDQuMi0xMy4xek0xMjA5LjUgNTMwLjJjMS40IC45LTYuMyAyLjktNy41IDMuMy01LjEgMS43LTEwIDMuNS0xNC45IDUuOS0xNS4zIDcuNy0yNy44IDE2LjgtMzguMiAzMC40LTEuMyAuNyAxLjgtNi41IDIuMi03LjQgMS42LTQuNyA2LjMtMTAuNiAxMC0xNCAxMi40LTExLjUgMzEtMjAuNiA0OC40LTE4LjJ6TTk1Mi45IDUzMy40YzMuNi0xLjQgOCAuMSAxMS42IC44IDEuNSAxIDEuNiAyLjEgLjMgMy40LTEuOCAuNC0xMi4xLTItMTEuOS00LjJ6TTk1Ny4zIDU0MS4yYzMuMyAxLjQtNC4xIDQuMi01LjUgNC42LTcuMiAxLjgtMTQuNSAuOS0yMS44IDEuNS0yLTEuMyAyLjctNSA0LjEtNS4yIDMuMi0uNiA2LjEtMi4xIDkuMi0yLjcgNC4yLS43IDkuNyAxLjMgMTQgMS44ek05NjIuMiA1NDYuNWMxLjggLjIgMS43IDEuNSAxLjIgMi45LTEuNCAxLjYtMy43IDIuMy01IDMuOS02LjQgNy42LTExLjUgMTQuNi0yMi45IDEwLjQtMy0xLjItNC4xLTMuNS02LjItNS42LTEuMS0xLTQuNC0uOS01LjgtMS4zLTMtMS45IDIuNC00LjcgNC4yLTQuNyAzLS4xIDMuMyAxLjkgNS40IDMuNHM1LjEgMi41IDggMi41YzkuNyAuMSAxMi41LTguOCAyMS4xLTExLjV6TTEyODEuNyA1OTcuOWMtLjEgLjQgMCAxLjItLjQgMS4ycy0xLjYtMi42LTEuOS0zLjJjLTEuNC0yLjYtMy01LTQuNy03LjQtNC44LTYuOC0xMC43LTE0LjktMTcuNy0xOS44LTQuOS0zLjQtMTAtNy41LTE1LjQtOS45LTE5LjktOS00MS44LTkuNi02Mi42LTMuNC0yLjkgLjQgMS4xLTEuOCAxLjgtMi4xIDMuNi0xLjUgNy4zLTIuOSAxMS00IDEwLjMtMyAyMC41LTMuNiAzMS4yLTMuMyA0LjcgLjIgOS44IDIuMiAxNC4zIDMuNyAyMS4yIDYuNyAzOS4zIDI2LjQgNDQuNCA0OC4yek02MzAuNCA1NjcuOWMxLjgtLjIgMi40IDQuOSAyLjkgNi4zIDIuOSA4LjItLjEgMTQuNi0yLjYgMjIuNC0zIDkuMS03IDE3LjktMTAuOSAyNi42LTMuMSA3LTUuNyAxNC45LTEwLjEgMjEuMy00LjggNy0xNC41IDE0LjUtMjEuOCAxOC42LTIuNyAuOCAzLjItOS40IDQuMi0xMS4yIDMuNy02LjkgNy0xNCAxMC41LTIxIDcuNC0xNC44IDE0LjYtMjkuNyAyMC45LTQ1IDIuNC01LjggMy45LTEyLjUgNi45LTE4ek03NjYuMiA1NzQuNGMyLjEgLjItMS43IDUuNS0yLjggNi41LTIuNiAyLjUtOS4yIDMuNi0xMi43IDUuNC03LjcgMy45LTE2LjEgOS0yMi41IDE0LjktMyAyLjgtNS42IDYuNS05IDguOC0yLjUgLjctNS01LjItNi40LTYuOC0yLjktMy4xLTUuNy02LjMtOC42LTkuNHMtNC4zLTYuNy04LjMtOC4xLTEwLjggNS43LTEzLjEgOC4xYy03LjkgOC0xNC44IDE2LjMtMjAuNSAyNi0yLjYgNC41LTMuNyAxMC02LjYgMTQuMi0xLjQgLjUtMS41LTEuNS0xLjgtMi41LS44LTMuNC0yLjQtNi40LTYuMS03LjItMi44IC40LTQuNCAzLjktNS4xIDYuNC0xLjkgNi4zLTMuMiAxMi4zLTMuOCAxOC44LTEuNSAxOC44IC43IDM2LjQgMy4yIDU1IDEgNy41IDUuOCAxNS4xIDUuOSAyMi42IC4xIDkuNC00LjggMTguNi05LjkgMjYuMS0yLjkgNC4yLTUuNCA4LjUtOC41IDEyLjUtNyA5LjItMTYuOCAxNi40LTI0LjEgMjUuNC04LjkgMTAuNy0xNC42IDI0LjQtMjMuOCAzNC43LTUuMSA1LjgtOC41IDQuNC0xNS43IDUuM3MtMTMuNyAxLjEtMjAuNSAyYy0xOS40IDIuNi0zOS4xIDMuNy01OC41IDYtMTMuNiAxLjYtMjcuMSA0LTQwLjggNS44LTEwLjYgMS40LTIyIDQtMzEuNiA4LjktNiAyLjktMTEuNSA2LjktMTMuMyAxMy43LTIuMiA4LjkgMS42IDIwLjQgNS42IDI4LjMgMS40IDIuOSAzLjcgNS4yIDQuNCA4LjQtLjkgMy40LTguNCA2LjktMTEuMiA5LjEtOC43IDcuMS0xOC43IDE0LTIzLjQgMjQuNi00LjEgOS0xIDE5LjYgMy4yIDI4IDkuNiAxOS4yIDI4LjYgMzQuNCA0Ny42IDQzLjkgNi43IDMuMyAxNi44IDUuNSAyMi41IDEwLjIgLjUgMS40LTEuMSAyLjctMS45IDMuOS0yIDMuMi01LjMgNS45LTggOC40LTcuOCA3LjUtMTQuNyAxNi42LTIxLjcgMjQuOC00LjQgNS4xLTcuMSAxMS4zLTE0LjUgMTAuOC0yLjctLjkgNi4xLTkuNSA3LjQtMTEuNCA4LjgtMTEuOSAyMC40LTIxLjYgMjkuNi0zMy4yIDEtMi4yLTIuOS0zLjQtNC41LTQtNy0yLjctMTMuNC02LjQtMTkuOS0xMC4xLTE1LjYtOC43LTI5LjYtMjAuOC0zOS4yLTM1LjgtMTEuNi0xOC40LTkuOC0zOS4xIDUuOC01NC4xIDMuOC0zLjYgNy42LTcuNyAxMS45LTEwLjYgMi0xLjQgNi4yLTMuOSA2LjUtNi42IC42LTQuOC0zLjItOS45LTQuOS0xNC4xLTQuMS0xMC41LTQuOC0yMi44IDIuOC0zMS45IDguNC0xMC4xIDI1LjMtMTMgMzcuMy0xNS4zIDE5LjgtMy43IDM5LjYtNS41IDU5LjYtNy45IDExLTEuMyAyMi41LTMuNCAzMy42LTMuOSA4LjEtLjMgMTYuMS0xLjkgMjQuMS0yLjkgNi0uNyAxNC40LS44IDE5LjYtNC40IDEuOC0xLjQgMy40LTMuOSA0LjgtNS43IDguOC0xMC44IDE2LjMtMjIuNSAyNS44LTMyLjcgMTIuNy0xMy42IDMwLTI3IDM1LjQtNDUuNiA0LTEzLjYtMi44LTI1LjktNC41LTM5LjItMi4xLTE2LjEtMi41LTMxLjgtMS4yLTQ4IC42LTcuNCAyLjMtMTMuOCA0LjctMjAuOCAxLjQtMy44IDIuOC04IDYuNy05LjkgMy4yLTEuNiA1LjYgLjkgOC43IC41IDUuMi0zLjQgOS0xMi4xIDEyLjUtMTcuMiA0LjMtNi4yIDEwLjktMTEuNiAxNi41LTE2LjYgMi4yLTIgOS4xLTguNyAxMi4yLThzNi4yIDQuMiA4LjMgNi41YzUgNS41IDkuNiAxMS4yIDE0LjQgMTYuOSAxLjUgLjcgMi42LS45IDMuNi0xLjkgMi4zLTIuMSA1LjMtMy44IDcuOC01LjcgMTAuOC03LjkgMjMuOS0xNi4xIDM2LjktMTkuOXpNODAzLjIgNTc0LjVjMiAuMiAyLjMgMi4zIDIuOCA0IDEuMyA0LjUgMi43IDguOSA0LjMgMTMuNC0uMiAxLjYtNi44LTMuMS03LjgtMy45LTMuOS0zLjEtOC43LTQuMS0xMy4yLTYuMS0xLjEtMS4yIDEtMi42IDItMy4xIDMuNS0yIDgtMy4zIDExLjktNC4zek04NDkuOCA2NjVjMS42IC44IDIgMCAxLjgtMS42LTIuMi01LjctNy4zLTEwLjEtOC45LTE2LjEgMC0xIDQuOCAzLjIgNS45IDQgMy45IDMgNy41IDYuNSAxMS43IDkuM3MxMS40IDMuNCAxNCA2LjljMS40IDEuOSAyIDUuNiAyLjcgNy45IDIuMSA3LjEgMyAxNCA0LjIgMjEuMyAuNCAyLjYgMi4xIDcuMyAxLjMgOS44cy00IDMuNi01LjQgNC45Yy01LjMgNC44LTEwLjUgOS40LTE2IDE0LTE2IDEzLjMtMzQuMSAyMy42LTUyLjYgMzIuOC05LjYgNC45LTE5LjUgMTAuNS0yOS45IDEzLjQtMi4yLS4zIDEuOC0zLjYgMi41LTQuMiAzLjktMy43IDYuOS04IDEwLjgtMTEuNyA4LjYtOC4yIDE2LjctMTcuNyAyNC0yNyAyLjUtMy4xIDYuMy03LjQgNS44LTExLjYtMi00LjEtOC45LS43LTEyLjMgMC0xMyAyLjgtMjMuMiAxMC4yLTM1LjEgMTUuNC0uOS0uMiAyLjMtNi40IDIuOC03LjYgMi4zLTUuMyA0LjMtMTAuOSA1LjktMTYuNSAyLjUtOC41IDUtMTcuNyA1LTI2LjUgMC0zLjkgLjMtOC0yLjQtMTEuMXMtNy41LTEuNC0xMC44LS45Yy04LjggMS40LTE4LjUgNS4yLTI2LjIgOS42LTItLjItLjYtNC4yLS42LTUuNiAuMS01LjQtLjEtMTAuOS0xLjktMTYuMS01LjItMTUuNS0xNC42LTI3LjYtMjMuNC00MC45LS41LTIuNCAxLjQtMy4zIDIuOC00LjkgMy4yLTMuNiA3LjMtNy4xIDExLjMtOS43IDE1LjktMTAuNyAzNC41LTIyLjkgNTQuNC0xMy41IDguMSAzLjcgMTcuNCA4LjggMjMuNiAxNS40IDMuMiAzLjQgNC4xIDguOSA2LjcgMTIuNyAxLjUgMi4xIDMuNiAzLjQgNC43IDUuOHMxLjQgNS41IDIuMyA4LjJjNC4xIDExLjYgMTEuMSAyNi45IDIxLjMgMzQuMXpNNjk0LjIgNTkxLjdjMi4zIC4xIDQuNSAzLjUgNiA1LjEgNC45IDUuMiA4LjIgMTEuOCAxMyAxNyAxMC44IDExLjYgMjEuMyAyNy42IDI2LjEgNDIuOSAyIDYuMSAzLjkgMTIuOSAyLjQgMTkuNHMtNi40IDExLjMtMTAuMSAxNi45Yy0yLjEgMy4yLTEuNCA3LjMtMyAxMC41LS45IDEuNy0yLjUgMi4zLTMuMSA0LjIgLjIgMy4zIDMuNiAuNSA1LjUgLjUgNSAuMSA4LjUgMy4xIDE0LjEgMi4xIDMgLjcgMS45IDUuMyAxLjIgNy40LTIuMyA2LjYtOC40IDExLjYtOS45IDE4LjQgLjYgMy4yIDQuNiAxIDYuNiAuNCA2LjItMS44IDExLjYtNC45IDE3LjEtOC4zIDExLjItNy4xIDE1LjQtMjUuOSAxMS40LTM4LjItMi42LTIuMi03LS43LTEwLS4xLTkuOSAyLjItMTcuMiA2LjktMjYuMSAxMS4yLTIuMyAuMi0uMi00LjcgLjQtNS44IDEuNS0yLjkgNi4zLTUuNiA5LjItNy4zIDkuOC01LjggMjIuOC0xMy4zIDM0LjgtMTIuOSAyLjUgLjggMi4yIDMgMi4yIDUuMyAwIDUuMS0uNCAxMC0xLjYgMTQuOS0yLjUgOS42LTQuMyAxOS44LTguNyAyOC44cy0xMS40IDE4LTE0LjIgMjcuNWMuOCAyLjYgMy40LS4xIDQuNS0xIDQuMS0zLjggNy41LTguOCAxMi4yLTExLjggMTIuMS03LjkgMjUuNC0xMy42IDM5LjMtMTcuMyAyIC4yLTMuNCA0LjktNC4xIDUuOC0zLjEgNC4xLTYuOSA5LjYtMTEuMSAxMi43LTEuOCAuNiAwLTMuNCAuMi00LjItLjMtMy01LjUtLjMtNy4xIC41LTcgMy40LTEzLjggNi45LTIwLjIgMTEuMi0uNiAuOC0xLjEgMS42IC4xIDIuMSA0IDIgOS42IDEuMiAxMC40IDcuMi0xLjUgNS41LTkuOCAxMi4yLTE0LjMgMTUuNXMtNy4xIDguOC0xMS43IDEyLjMtMTEuNSA2LjctMTUuMyAxMS43Yy05LjQgMTIuNC01LjEgMzEuNS05LjkgNDUuNi0yLjEgNi4yLTYuNyAxMS4yLTExLjQgMTUuNS01LjUgNS4xLTExLjEgMTAuNC0xOC4xIDEzLjQtMTIuMiA1LjItMjYuNiA0LjYtMzkuNSAzLTEuOC0xIDUuNC03LjMgNi42LTguNSA3LjktNy42IDE3LTE0IDI0LjctMjEuNyAxLjctMi45LTUuNi0uNS02LjctLjEtNS44IDIuMi0xMS4zIDYuOS0xNiAxMC45LTEwIDguMy0yMy4zIDIxLTIyLjggMzUuMyAuMSA1LjEgMi41IDguNCA1IDEyLjQtLjEgMi4xLTIuOSAyLjctNC40IDMuNi00LjIgMi4xLTguMiA0LjItMTIuNyA1LjMtMjIuMyA1LjUtMzYuNS0xMS45LTU2LTE4LjMtMS0xLjIgMS44LTMuMyAyLjgtNCA0LjktMy40IDEwLjMtNi45IDE0LjYtMTAuOCA2LjQtNS43IDEzLjktMTAuMiAyMC0xNnMxMS42LTExLjQgMTcuMi0xNy4yYzEuOS0zLjItNS41IDEuMS02LjMgMS42LTUuOCA0LjEtMTEuOCA4LjMtMTcuNyAxMi4zLTE1LjUgMTAuNC0zMi41IDIwLjYtNDYuNyAzMi44LTEyLjkgMTEtMTQuNCAyNy40LTEwLjcgNDMuNCAyIDguNSA2LjYgMjIuNi01IDI1LjktMTYuNCA0LjctMzEuOS0xMS40LTQyLjUtMjEuMy0xNC0xMy4yLTIxLjgtMzAuOS0zNC4yLTQ1LjMtOS4xLTEwLjMtMjAuOC0xOC44LTM0LTIzLTQuMS0xLjMtOS4xLTIuOC0xMy40LTMuMS0xMy43LS43LTEwIDE2LTQuOSAyMy44IDEzLjIgMjAgMzQuMSA0MC43IDYwLjQgMzUuOCAxLjIgLjItLjUgMS42LS45IDItMiAxLjktNC40IDUuNi03LjMgNi4yLTYuOCAxLjQtMTYuNi0yLjMtMjIuNi01LjUtMTYuOS05LTI4LjMtMjIuNy0zNi44LTM5LjctMy41LTcuMS03LTE4LjItMi40LTI1LjQgMi43LTQuMiA2LjgtNS4yIDExLTcgMTAuNS00LjYgMjIuNS02LjggMzMuNy04LjMgMzAuOS00LjQgNjEuOC03LjUgOTIuNy0xMC44IDEwLjUtMS4xIDIxLTEuOCAzMS41LTMgNi40LS44IDEzLjYtMSAxOS4xLTQuNyAxLjQtMi4xLTcuOC0xLjEtOS4xLS45LTIuNC0uMy0uMS0zLjEgLjctNC4yIDIuNi0zLjUgNC43LTcuMiA3LjMtMTAuNyAzLjYtNSA2LjUtMTAuNSA5LjktMTUuNiA2LjUtOS40IDE1LjgtMTcuNCAyMy43LTI1LjggMi4xLTEuNC0zLjcgOC44LTQuNiAxMC42LTMuOCA3LjItOS40IDE0LjgtOS43IDIzLjMtLjEgMi45LS40IDYuNCAyLjEgOC40IDYgNSAxOC42IDIuNSAyNiAyLjUgMjIuMiAwIDUwIDMuMSA2Ny43LTEzLjMgMS43LTEuNSAzLjMtNC4xIDQuNC02IDEwLjYtMTktMTYuNi0zMS4yLTMxLjgtMzEuNy00LjQtLjEtOS0uMS0xMy40IDAtMi4yIC4xLTQuMSAxLTYuMiAuNi0yLjQtMS43LTIuMi01LjktMy40LTguNi0yLjMtNS41LTcuMS03LjYtMTIuNy04LjEtMi4yLS45IC4zLTMuNCAxLTQuOCAyLjMtNC43IDMuNS05LjYgNC42LTE0LjggMS0xLjIgMS43LS42IDIuOSAwIDMuMS0uNSAzLjgtOS4zIDMuOC0xMS44IDAtMy4yIDEuMi02LjQgLjktOS40LS41LTUtMi43LTEwLTUuNS0xNC4xLTEuNC0yLjEtMy40LTQuOS01LjQtNi41cy00LTEuOS00LjgtNC4yYy0uMS0zLjQgMi45LTIuMyA0LjUtNS4xczEuNC03LjIgMS4zLTEwLjdjLS4zLTctNC41LTExLjMtNi42LTE3LjQtMS0yLjcgLjItNS4xIC41LTcuNyAuNi00LjYgMS05LjMgMi45LTEzLjYgMS44LTIuNyAyLjIgMS41IDIuNSAyLjkgMS4xIDQuMiAxLjMgOC43IDQuMiAxMi4yIDIuMyAxLjQgMi43LTIuMiAzLjItMy43IDIuMi02IDMuOS0xMS41IDYuOC0xNy4yIDYuMy0xMi41IDE3LjgtMjYuOCAyOS43LTM0LjN6TTk3NC41IDU5MS44YzEuNyAwIDIuNiAzLjIgMy4yIDQuNCAyLjggNS4yIDYuOCA5LjIgMTAuMSAxMy45IDkuNCAxMy4zIDI1LjQgMjEuMSAzOS42IDI3LjcgMS45IDEuNS0yLjQgMS4yLTMuMiAxLjItMy4zIDAtNi4yLS42LTkuNC0xLjEtOC44LTEuNC0yMC41LTYuNi0yNi4xLTEzLjggMC0uOCAzLjUgMS40IDQuMSAxLjcgMi42IDEuMyA1LjMgMi45IDggMy44IDIuNyAuMSAuMS0yLjQtLjktMy4yLTIuNy0yLjItNS4zLTQuNS03LjktNy02LTUuNC05LjktMTIuMy0xMy44LTE5LjEtMS4yLTIuMy00LTUuNy0zLjctOC41ek04ODcuOCA2MDQuNWM2LjItLjkgMTIuOSA2LjUgMTcuMiAxMCAxNC4yIDExLjMgMjQuNiAyNi44IDI5IDQ0LjcgMS4zIDUuNCAzLjggMTEuOSAyLjcgMTcuNS0uNyAuNy0xLjItMS42LTEuNS0yLjItMS4yLTIuOC0yLjMtNS43LTMuNi04LjQtMy40LTctNi4yLTE0LjUtMTAuNC0yMS4yLTYuOS0xMS4xLTE0LjEtMjEuNS0yMy40LTMwLjctMi4yLTIuMi00LjQtNC43LTYuOC02LjctMS0uNy0zLjItMS42LTMuMi0zek03MjIuNyA2NzYuNmMxLjcgLjMgMi44IC4xIDMuOS0xLjMgMS42LTUuOS0uNC0xMi4yLTIuMy0xNy44LTQuMS0xMi4yLTEwLjItMjIuOC0xNy41LTMzLjQtMi42LTMuOS02LjEtMTEuMS0xMC45LTEyLjUtMy4yIC41LTIuMiAzLjQtMS42IDUuNiAxLjMgNC43IDIuMyAxMC40IDIuNiAxNS4zczEuMiAxMC4yIDEuMSAxNS40YzAgMi4zLTEuNSA1LjQtLjYgNy42IDEuNyAzLjkgOS42IDIuNCAxMy4xIDQuOCA1LjkgNC4xIDYuNiAxMi4zIDEyLjIgMTYuM3pNNjgzLjcgNjE0LjFjLTEuMy0zLjgtNi4zIDMtNy43IDQuNS00LjcgNS4yLTExLjQgMTMuNC0xMi43IDIwLjQtLjYgMy4zIDEuNCA4LjQgNC43IDkuNiAzLjYtLjEgNC4xLTQuOSA1LjQtNy41IDQtOCA5LjgtMTcuOSAxMC4zLTI3ek0xMjkzLjMgNjIzYzEuMSAuNSAxLjUgMy42IDEuNiA0LjYgLjYgNC43IDEuMSA5LjEgMS4xIDEzLjkgMCAxNS45LTQuNCAzMS4xLTEyLjIgNDQuOC0yLjEgMy43LTQgOC4xLTYuOSAxMS4yLTEuNyAxLjktMi43IDQuMi00LjMgNi4yLTYuMyA4LjMtMTQuMyAxNi0yMS45IDIzLjEtMjcuMSAyNS40LTYzLjggNDEuNy05OS41IDUwLjYtMTEuNyAyLjktMjUuNSA2LjctMzcuNiA1LjQtMS0uNCA4LjQtMS44IDkuOC0yLjEgNi43LTEuNiAxMy42LTIuMyAyMC4yLTMuOCAxOS40LTQuMyAzOS43LTEzLjEgNTctMjIuNyAyMi40LTEyLjQgNDIuOS0yNy40IDYwLjYtNDUuOSAxMS45LTEyLjYgMjMtMjYuNyAyOC40LTQzLjYgMi43LTguMyA0LjQtMTcgNC40LTI1LjcgMC00LjctMi4xLTExLjYtLjctMTZ6TTcwMC40IDYyMy45YzIuMy0uMyA0LjYgNi4zIDUuNyA3LjkgNiA5LjIgMTEuMyAxOS43IDE0LjQgMzAuMyAuMSAyLjQtMy45LTMtNS0zLjgtMy43LTIuNy04LjItMy43LTExLjktNi4xLTIuNS01LjUtLjYtMTQtMi4xLTIwLjItLjYtMi4zLTEuOC01LjktMS4xLTguMXpNOTY2LjUgNjI2LjhjMS40LS4xIDIuNiAxLjcgMy43IDIuNSAzLjIgMi4xIDYuMSA1IDkgNy41IDYgNS4xIDEzLjcgOC42IDIwLjcgMTIuMSA0LjEgMiA5IDQuMyAxMy42IDMuOSAxLjMtLjgtMy44LTQuNi00LjYtNS45LS44LTIuMiA3LjEgNC40IDguNiA1LjQgNiA0LjMgMTIuOSA2LjggMTkuMiAxMC42IDEgMS4xLTYuMSAuMS03LjMgMC01LS44LTEwLjYtMi40LTE1LjQtNC4xLTE0LjMtNS0yNy41LTEyLjQtMzguNi0yMi44LTIuMi0yLTkuMS01LjctOC45LTkuMnpNNjgxLjUgNjM3LjhjMi4yLS4zIDEuNSA0LjkgMS41IDYuMyAwIDYuNC0xLjEgMTMuNy01LjIgMTguOC0yLjYgMS42LTEuOC01LjQtMS44LTYuNyAuMS02LjEgMi40LTEzLjIgNS41LTE4LjR6TTg0My41IDYzOC44YzEuNy0uMSA0LjkgMy4zIDYuMyA0LjMgNS4xIDMuNiAxMC41IDYuNSAxNi4xIDkuMyAyLjUgMS4zIDYgMi4yIDYuOSA1IC4xIDEuNiAuMiAzLTEuNyAzLjEtNy45LTIuOS0xNi05LjUtMjIuMS0xNS0xLjYtMS40LTUuNi00LjQtNS41LTYuN3pNNjg1LjQgNjMwLjJjLTMuMy0zLjEtNy44IDUuOS04LjcgOC4zLTMuNyA5LjctOCAyMi4yLTIuOCAzMi4yIDMuMyAzLjIgOS01LjYgMTAuMy04IDMuOS02LjkgMy4xLTEzLjQgMi44LTIwLjctLjEtNC0uMS03LjktMS42LTExLjh6TTY2My4xIDY1OC44YzEuNSAuOCAxLjYgMy4yIDIgNC43IC44IDMuOSAxIDcuOCAxLjYgMTEuNy0uNiAyLjktMi45LTIuNS0zLjQtMy40LTEuNy0zLjUtMy45LTkuOS0uMi0xM3pNODc4LjUgNjU5LjhjMi0uMyA0LjggMS44IDYuNSAyLjdzNS44IDIuNCA3LjMgNC42YzQuMyA2LjctMy4xIDE0LjgtNS4yIDIxLjEtMS4xIDIuMS0yLjgtOC4yLTMuMi05LjgtMS4xLTUuMi02LjItMTMuNC01LjQtMTguNnpNNjQzLjQgNjYxLjljMS41LS4yIDEuNiAxLjcgMS45IDIuOCAxLjQgNCAyIDcuMyAxLjUgMTEuNi0xLjMgMy0yLjYtMS41LTIuOC0yLjgtLjgtMy41LTEuOS04LS42LTExLjZ6TTcwMy41IDY3MC41YzIuNiAyLjIgMSA1LjctMS4zIDcuNi00LjUgMy43LTEwLjYgNy41LTE2LjQgOC42LTIuOS0uNiAxLjYtNS44IDIuNS03IDMuNS01LjEgOC4xLTExLjMgMTUuMi05LjJ6TTk3Mi40IDY3MmMxLjcgLjQgMi45IDUuMiAzLjkgNi43IDQuOCA2LjggOSAxNC4xIDEzLjMgMjEuMyAxMC4zIDE3LjIgMjQuNiAzNC4xIDM5LjUgNDcuNiA0LjcgNC4zIDEwLjIgNy42IDE0LjggMTIgLjkgMS44LTgtMS44LTkuMy0yLjQtNi4yLTIuNy0xMi43LTQuOS0xOC41LTguNS0xNy4zLTEwLjYtMzUuNS0yMC40LTQ4LjQtMzYuNiAwLS42IDQgMi40IDQuNiAyLjkgMyAyLjUgNS44IDUuMiA4LjkgNy42IDguNiA2LjQgMTcuOSAxMS41IDI3LjcgMTUuNyAzLjIgLjgtMS00LjEtMS42LTUtMy4zLTQuNi03LjQtOC43LTEwLjUtMTMuNS03LjMtMTEuMS0xMy42LTIyLjYtMTkuNi0zNC41LTEuNS0zLjItNS43LTkuNy00LjgtMTMuM3pNNjY3LjIgNjgyLjRjMy42IC45IDMtNC45IDMuNS03LjQgMS4xLTUuMi0uNy0xNy45LTUuMS0yMS41LTUuMi0xLjUtNy40IDUuMy03LjYgOS41LS4zIDguMSAyLjIgMTQuNyA5LjIgMTkuNHpNNjc3LjUgNjkyLjdjLjMgNCA3LjgtLjcgOS44LTEuNCA3LjItMi40IDIxLjMtNy42IDIyLjYtMTYuNCAxLjQtMTAuMS04LjktMTEuNS0xNS45LTcuNC04LjggNS4yLTE0LjMgMTUuNS0xNi41IDI1LjJ6TTg5NS4yIDY4MS45YzEuNCAuOCAxLjYgNS45IDEuOSA3LjUgMSA2LjQgMS43IDEzIDMuMiAxOS4zIDMuOSAxNiA3LjMgMzEuOSAxMi40IDQ3LjYgMi42IDguNCA2LjQgMTkuNSAxNC4xIDI0LjcgMS44IC41LS41LTMuNC0uOC00LTItNC00LjEtOC01LjUtMTIuMiAuMS0yLjkgMy4xIDMuNSAzLjUgNC4yIDIgNCA0LjggNy4yIDcgMTEgNiAxMC4yIDE1LjkgMTcuMSAyMy45IDI1LjUgMS4yIDIuMS01LjEtLjUtNi4xLS43LTMuNS0uNCAxLjYgMy45IDIuNSA0LjUgNC44IDMuMyA5LjUgNi42IDE0LjcgOS4yIDE0LjQgNy4zIDM0LjkgMTQuOCAzNy43IDMyLjYtLjYgMi43LTQuNCAuMy02LjMgLjEtLjggLjEtMi4yIC4yLTEuOCAxLjUgLjYgMi4xIDMuNiAzLjYgNC45IDUuNCAyLjkgNC4xIDYuMSA4LjYgNy41IDEzLjUgMi44IDkuMyA1LjcgMTguNiA2IDI4LjUgLjIgNi45LTEuMiAxMy42LTIuMSAyMC40LTUuNiA0MS00Ny43IDgwLjctOTAuNiA2OC4xLTExLjUtMy4zLTIzLjUtMTAuNy0zMi4xLTE4LjktNi4xLTUuOC0xMS41LTEyLjYtMTcuNy0xOC0yLjQtLjEgMS4xIDUuNCAxLjYgNi40IDMuNCA2LjkgOS4yIDExLjcgMTMuMiAxOCAuMSAxLjgtMS44IDMuNi0yLjkgNS0zLjIgNC4yLTYuOCA4LjUtOS41IDEzLTUuNiA5LjItMTAuOCAxOS0xNy4zIDI3LjctNy4xIDkuNS0xNSAxNy45LTIxLjQgMjguMS0zLjIgNS01LjggMTIuOS0xMCAxNy0xLjYgMS43LTYuNyAxLjctOC4zIC4xcy0xLjctMy42LTIuMi01LjRjLTEuNC00LjctMi44LTkuNC0zLjgtMTQuMi0yLTkuNC00LjEtMjAuMi0yLjgtMzBzNS45LTE5LjMgOS4xLTI4LjRjNC4yLTExLjkgOC45LTI0IDExLjctMzYuM3M0LjctMjUuMSAxMC40LTM2LjJjMi4xLTQuMyA1LjUtNy40IDkuNy05LjhzOS4xLTMuMyAxMS4yLTguMmMxLjItMi42IC42LTUuNCAxLTguMSAuOS02LjggMy4xLTEzLjcgNS4yLTIwLjIgMy05IDcuOS0xNy4xIDExLjgtMjUuNyA1LjctMTIuNSAxMS40LTI1LjIgMTktMzYuNSAxLTMuNi01LjktLjMtNyAxLTQuNCA1LjUtNy40IDE0LjUtMTAuNiAyMC45LTkuMiAxOC40LTIxIDM4LjEtMjMuNSA1OS0uMyAyLjcgLjMgNS41LTEgOC0yLjMgNC40LTEwLjMgNS0xNCA4LjUtNC41IDQuMi02LjcgOS4yLTkuMiAxNC44LTYgMTMuMS03LjMgMjguOC0xMS4zIDQyLjctMy41IDExLjctOC4xIDIzLTExLjkgMzQuNi0yIDYtNC45IDEyLjEtNS42IDE4LjQtMiAxNi43IDIgMzQuMyA2LjQgNTAuMi0uMiAyLjQtMi45IDEuOS00LjcgMS43LTMuNi0xLjYtMy40LTExLjktNC0xNS41LTEuNy0xMC40LTQuMy0yMi40LTIuNi0zMyAxLjItNy42IDQtMTQuNyA2LjUtMjEuOSA2LjEtMTcuNyAxMy4xLTM1LjMgMTcuMS01My41IDIuNC0xMS4zIDMuNS0yNC4zIDguNy0zNC43IDEuOS0zLjYgNS45LTguMiA5LjUtMTAuMSAyLjctMS41IDguMS0yLjQgOS41LTUuNSAuOC0xLjYgLjQtMy42IC42LTUuNCAuNS00LjMgMS44LTkuMSAzLjQtMTMuMSA3LjItMTguMiAxNi43LTM1LjQgMjQuNy01My4zIDMuMS02LjkgNS0xOC40IDExLTIzLjUgMS45LTEuNyA1LjItMS41IDcuNS0xLjEgNi40IDEuMSAxMy4xIDQuMSAxOSA2LjUgNi44IDIuNyAxNS41IDUuNiAyMS4yIDEwLjQgMi40IDIgMy44IDYuMiA2LjMgOC43IDYuOCA2LjYgMTUuOCAxMS43IDI0IDE2LjUgNC41IDIuNiA5LjYgNiAxNS4xIDUuNSA0LjEtMS43LTUuOS02LjMtNy4zLTcuMi05LjUtNS43LTIxLjgtMTEuOS0yOS4zLTIwLS4xLTEuNSAxLjYtMS42IDIuOC0yIDIuNC0yLjItNi44LTUuMy04LjctNi4zLTUuOS0zLjEtMTIuNC04LjMtMTYuNS0xMy42LTguOS0xMS41LTE2LjQtMjIuNi0yMC0zNy0xLjgtNy4yLTEuMS0xNS0zLjMtMjItMS0yLjEtMi4xIDQtMi40IDQuOC0xLjggMS45LTIuMy0yLjMtMi42LTMuNS0xLjMtNC45LTIuMy05LjktMy4xLTE0LjktMS43LTEwLjUtMy4yLTE5LjEtLjktMjkuNiAuNi0zLjIgMi05LjIgNC4yLTExLjZ6TTkxMS41IDY4MS44YzMuNC0uMiA2LjYgNy44IDggMTAuMnMzLjYgNC41IDQuOSA3LjFjNS4yIDEwLjMgNi42IDIxLjggNS40IDMzLjItMS4zIDMtMi4xLTItMi42LTMtMS44LTQuNC0zLjItOC44LTQuNy0xMy4zLTIuNy03LjgtMy41LTE2LjEtNi4yLTIzLjgtMS4xLTIuOC01LjItNy40LTQuOC0xMC40ek02NTcuNiA2ODIuOGMxLjctLjUgMi41IDEuNiAzLjQgMi44IDIuMyAzIDMuNCA2LjggNC41IDEwLjQgLjEgMi44LTIuOC0xLjctMy40LTIuNC0yLjMtMi42LTYuMS03LjItNC41LTEwLjh6TTkzNi40IDY4NS45YzEuNS0uMSAxLjYgMS43IDEuOSAyLjggMS4zIDMuOCAyLjggNy41IDMuNSAxMS41IDEuMiA2LjYgMS4zIDEzLjEgMS4yIDE5LjgtLjEgMi44LTEuNyA2LjItLjQgOC45IDEuOCAzLjUgNi44IDcuMSA5LjYgOS45IDguNSA4LjUgMTcgMTcuMSAyNC41IDI2LjUgMy44IDQuOSA3LjIgMTEuMiAxMS41IDE1LjUgMi42IDIuNiA3LjUgMy44IDEwLjggNS43IDYuMiAzLjcgMTIuNSA4LjggMTcuOCAxMy43czkuMyAxMC42IDE0IDE2YzEuNiAxLjkgMi4zIDQuNiA0LjUgNiA0LjUgMi43IDEwLjcgMy44IDE1LjcgNS4zIDEzLjcgNCAyNy41IDUuNSA0MS41IDcuNyAxIC43LTUuOSAuOC03IC44LTQuNSAwLTkgMC0xMy41IDAtMTEuNyAwLTIzLTEuNi0zNC4zLTQuNy0yLjgtLjctOC0xLjEtMTAuMS0zLjRzLTIuNi01LjQtNC4yLTcuOGMtNC44LTcuNC0xMS40LTEzLjctMTcuNi0xOS45LTMuOS0zLjgtOS03LjYtMTMuOC0xMC4yLTMtMS42LTcuMy0yLjgtOS44LTUuMnMtNC45LTcuMi03LjUtMTAuNWMtNi42LTguMy0xMi40LTE3LjUtMTkuOS0yNS4xLTQuNS00LjYtOC41LTkuNC0xMy0xNC0xLjYtMS42LTQuMi0zLjMtNS4yLTUuM3MuMy00LjEgLjQtNS45Yy4yLTYuNyAxLTEzLjMgMS0yMCAwLTQuMi0uNy04LjMtMS4xLTEyLjQtLjEtMS45LTEuMS0zLjgtLjUtNS43ek02NjggNzI1LjhjMS40IC45IDIuNC0zLjEgMi43LTQuMSAxLjEtNC4zIC45LTguNiAuNC0xMi44LS4zLTIuOSAuMS01LjktLjItOC44LS45LTcuNC01LjMtMTQuNi05LjYtMjAuNC0xLjUtMi4xLTIuNi00LjEtNS4xLTUuMi0yLjcgLjItMy40IDkuOC0yLjggMTIuMiAuOCAzLjUgMy4xIDUuNSA1IDguNCAyLjYgMy44IDQuOSA4LjkgNi4zIDEzLjIgMS43IDUuNyAuNSAxMi4yIDMuMyAxNy41ek02NDYuNiA2OTQuOGMzLS45IDQuOSA0LjIgNS45IDYuMiAzLjMgNi42IDUuNiAxNS4xIDIuNyAyMi4yLTEuOSAzLTMuOS0zLjktNC41LTUuNC0xLjktNS4zLTMuMS0xMS43LTMuNy0xNy4zLS4zLTEuOS0xLjItMy44LS40LTUuN3pNNzE0LjkgNjk0LjFjNCAxLjItMi40IDgtNC4xIDkuNi03LjggNy45LTE4LjQgMTIuMi0yNi4xIDIwLjEtMi40IDEuNS0uMy0yLjUgLjEtMy4zIDEuNC0yLjkgMy4zLTUuNiA1LTguMyA0LjgtNy43IDE1LjMtMTguMiAyNS4xLTE4LjF6TTY3NC4yIDczNy4xYzEuMSAzLjEgMy42LS41IDQuOS0xLjcgNC4xLTMuOSA4LjQtNy41IDEzLTExIDkuMi02LjkgMTguMS0xMS45IDI1LjMtMjEuMSAyLjEtMi43IDYuNi03LjMgNi4zLTExLjJzLTQuMS0zLjgtNi45LTMuM2MtNS40IC45LTEwLjkgMi4yLTE1LjYgNS4zLTEwLjcgNy4xLTE4IDE2LjMtMjIuNSAyOC40LTEuNyA0LjUtNC43IDkuNy00LjUgMTQuNnpNNzY1LjkgNjk0LjFjMy45IDEuMyAxLjQgOC42IC45IDExLjYtMiAxMS4zLTggMjAuMi0xOS4zIDIzLjgtMi4xLS40IDIuNy03LjkgMy4zLTkuNSAuOS0yLjQgMi4xLTUuNiAyLTguMnMtMS4yLTMuNy0uMS01LjggMy41LTIuNCA0LjctNC4yYy40LTEuNSAuMi0yLjQtMS41LTIuMS0zLjMgMS40LTUuNiA0LjktOC45IDUuOS0xLjkgLjctNC40IC4xLTYuNSAuMS0yLjUtMS4yIDMuNS00LjggNC44LTUuNCA1LjQtMi44IDE0LjYtNi4zIDIwLjYtNi4yek04ODMuMSA3MTMuOGMyLjQgMS4yIDIuOCA4LjIgMi4yIDEwLjUtMi40IDguOS0xMCAyMC41LTE2LjQgMjcuMi0xNS43IDE2LjUtMzIgMzcuNi01NSA0NC03LjYgMi4xLTE2LjMgMS41LTI0LjEgMS41LTMuMyAwLTYuNSAxLjgtOS43IDEuNS0xLjQtLjgtMi42LTIuMy0zLjUtMy43LS4xLTIuMyA0LjYtMi4zIDYuNC0zIDUuNy0yLjIgMTIuNC01LjggMTUuNC0xMS4zLS4yLTIuOS05LjQgMi42LTExIDMuMi04LjcgMy4zLTE1LjcgNS42LTI0LjkgNC0yLTEuMiA0LjQtNi42IDYuMi03LjMgOC4zLTMuMyAxNy40LTUuNiAyNS44LTguNyA0LjYtMS43IDguOC00LjQgMTMuNC02LjIgMTIuMi00LjggMjQuOC0xMi41IDM1LjQtMjAuMSA2LjMtNC42IDEzLjctOC4zIDE5LjUtMTMuNiA0LjMtNC4xIDkuMy03LjcgMTMuNi0xMS44IDIuMi0yIDQuMi00LjggNi43LTYuMnpNNzM4LjUgNzE3LjNjLS43LTItMy4zLTEtNC44LS42LTQgMS03LjcgMS45LTExLjYgMy40LTEwLjYgNC4xLTE1LjggMTEuNi0yMC45IDIxLjEtMS44IDMuNS00LjkgNy4xLTUgMTEuMiAuNSAxLjEgMS4xIDEuNiAyLjQgMS4xIDQtMS41IDcuNS00LjcgMTEuNy02LjIgNS41LTEuOCAxMS44LTIuNiAxNi42LTUuOSAzLjEtMiA0LTYuNCA1LjQtOS42IDItNC45IDQuNy05LjMgNi4yLTE0LjV6TTcyOS4yIDcyMy41YzIuNSAuMS0yLjcgOS45LTMuOCAxMS41LTMgNC40LTEzLjEgNy41LTE4LjIgOC41LTIuMy0xLjIgMi4xLTYuMyAzLTcuNiA0LjItNi44IDExLjQtMTAuMiAxOS0xMi40ek04ODcuMyA3MzIuOWMxLjQgLjUgMS42IDMgMiA0LjMgMS4zIDQuMyAyLjUgOC42IDMuNSAxMyAzLjcgMTYuNiAxMS42IDMwLjIgMTkuNSA0NC44IC42IDIuMi04LjctMS43LTEwLjUtMi4zLTYuOS0yLjQtMTMuOC0yLjYtMTguNSAzLjYtNS44IDgtOC44IDE4LjktMTIuNiAyNy45LTYuMSAxNC42LTE0LjEgMjguMy0yMC4yIDQyLjgtMi4xIDUuMi0zLjggMTAuNC01LjIgMTUuOC0uNSAyLjMtLjMgNi43LTIgOC41cy02IDIuNi04LjMgMy43LTMuOSAzLjMtNi4xIDQuNGMtNi4yIDMtMTUuNyAxLjYtMjIuNCAxLjYtMTQuMiAwLTI5LjkgMS44LTQyLjggOC4yLTQuMSAyLjEtOC43IDQuMS0xMS45IDcuNS0uMyAuMi0uOSAuOC0xLjQgLjRzLTEtNC4zLTEuNC01LjZjLS44LTIuNS0zLjEtNS4zLTQuNi03LjQtMi4yLTMuNC04LjItNC41LTkuOS04LTEuMy0yLjUgLjUtNiAxLjItOC40IDEuOC02LjIgMy43LTEyLjMgNS42LTE4LjRzMy45LTE1LjIgOC0yMC41YzIuMS0yLjUgNi4xLTQuNCA4LjctNi4zIDcuOS01LjUgMTguNC0xMiAyMi42LTIwLjkgMi4yLTQuNyAxLjUtMTAuNyAxLjEtMTUuNiAyLjEtNC4zIDEwLjktNCAxNC44LTQgMTIuNCAwIDIxLjMtLjkgMzIuNS02LjUgNy45LTQgMTQuOS0xMC4xIDIxLjItMTYuMyA5LjgtOS42IDE5LTE4LjcgMjcuNS0yOS41IDMuOC00LjkgNS40LTEyLjUgOS42LTE2Ljh6TTkzNC42IDczNi44YzIuMi0uNyA0LjggMyA2LjIgNC40IDUuNSA1LjUgMTAgMTIgMTUuNCAxNy42IDYuMyA2LjQgMTEuOSAxNC40IDE3LjUgMjEuNSAxLjkgMi42IDMgNS45IDUuNCA4LjFzNC41IDIuNSA2LjYgMy45YzYuMiA0LjQgMTIuMyA4LjUgMTguMyAxMy4yIDEuNSAxLjIgMiAyLjkgMy4yIDQuMyA2LjEgNi41IDEwLjQgMTMuMiAxNS41IDIwLjUgNi40IDkuNCA3LjEgMjguMi03LjcgMjguNy0xLjkgMC0zLjcgLjEtNS41LS40LTEuNy0xLjYgMy4xLTcuNCAzLjktOS43IDIuOS03LjcgMy45LTE4LjMtLjctMjUuNS0xLjgtMS41LTEuNyAxLjItMiAyLjQtMS4yIC43LTMuNC01LTQtNi0yLjYtNC40LTUuOC04LTkuMi0xMS44LTUuOS02LjUtMTQuMy0xMC44LTIwLjMtMTcuMnMtOS42LTEzLjgtMTcuOC0xNy45Yy0xLjItLjMtLjcgLjQtLjkgMS4zLTIuNSAuMS02LjMtNy03LjUtOC45LS41LTEuMyAuOS0uMSAxLjMgLjIgMi41IDAtMi42LTYuMy0zLjUtNy4zLTMuNC0zLjYtNi41LTcuNS0xMC0xMS0xLjYtMS42LTQuNS00LjItNS4xLTYuNC0uNC0xLjIgLjMtMyAuOS00ek03OTEuMiA3NDEuNWMyLjkgLjEtMy4zIDkuMy00LjYgMTAuNi0xLjYgLjUtNC42LTMuMy01LjgtNC41LS42LTIuNyA4LjMtNS40IDEwLjQtNi4xek03NTUuNSA3NDEuMmMuMS00LTYuMy0uNS04LjIgLjEtNy40IDIuNC0xNi42IDUuMi0yMi4xIDExLTYuNSA2LjgtMi41IDE5LjkgMS4xIDI3LjIgMSAyLjIgMiA0LjkgMy45IDYuNSAyLjMgMSAzLjEtMS4zIDMuOS0zLjIgMS44LTQgMi04LjYgMy44LTEyLjcgMy4yLTYuOCA2LjEtMTMuNyAxMC4yLTE5LjkgMi4xLTMuMyA1LjgtNS41IDcuNC05ek01NDQuNiA3NDYuMmMuNyAuNS04LjMgNC44LTkuOCA1LjYtNi43IDMuMy0xMy40IDYuNi0yMCAxMC0yMC4xIDEwLTM5LjYgMjEuMi01OC44IDMyLjctMzEuNyAxOS4xLTYzLjUgNDEuOS04OS44IDY3LjctMTIuMSAxMS45LTI0LjEgMjMuOS0zNiAzNi02LjYgNi44LTEyIDE0LjktMTguNyAyMS43LTIuMiAxLjMgMy40LTYuMyA0LjItNy4yIDMuNS00LjUgNi40LTkuNCAxMC41LTEzLjUgOS41LTkuNSAxOC0xOS44IDI3LjYtMjkuNCAyLjktMi45IDUuNC03IDguNS05LjUgNS4xLTQgOS4yLTguNyAxMy45LTEzLjEgOS4zLTguNiAyMC4zLTE1LjggMjkuNi0yNC40IDcuMy02LjggMTUuOS0xMy42IDI0LjMtMTkuMiAxMS45LTguMSAyMy42LTE2LjcgMzUuOS0yNC4xIDQuNC0yLjYgOC43LTUuNCAxMy04IDIuNS0xLjQgNS40LTIuNCA3LjMtNC42IC41LTIuNS0zLjMtMS00LjctLjgtNS4xIC44LTEwLjMgMi44LTE1LjMgNC4yLTIwLjggNi4xLTQwLjIgMTMuOC02MC4zIDIyLjEtLjQgLjEtMS4xIC4zLTEuMS0uMXMyLjMtMS44IDIuOS0yYzMuNi0xLjkgNi44LTQuMiAxMC40LTYuMSA5LjgtNC44IDE5LjUtOS43IDI5LjYtMTMuOSAyMS4zLTguOSA0My4zLTE1LjQgNjYtMTkuNSA5LjUtMS43IDIxLjEtNS4zIDMwLjgtNC42ek03NDEuMiA3NDkuNGMxLjkgLjItMi4yIDYuNC0zIDcuOC0yLjcgNS4zLTQuOSAxMC40LTYuMyAxNi4yLTEuMiAyLjItMi4xLS40LTIuNy0xLjYtMS4yLTIuNy0yLjUtNi42LTItOS42IDEuMi03LjQgNy40LTEwLjggMTQtMTIuOHpNNjIxLjYgODEyLjZjLTMuMy0yLjggMS4xLTEwLjcgMi42LTEzLjggNS40LTExIDExLjMtMjEuOCAxNi44LTMyLjggMS43LTMuNCAzLjYtMTAgOC43LTguNiA3LjMgMS45IDUgMTMuNSAxMC44IDE2LjIgMy40IDEuNSA5LjQgLjQgMTMuMSAuNCAxMi40IDAgMjQuNiAuNCAzMy43IDkuOSAxLjQgMS40IDMuNSAyLjggNC4zIDQuNyAzLjcgOC44LTEwLjIgMTcuNC0xNi44IDIwLTE1LjcgNS45LTM0LjYgNC40LTUxLjEgNC40LTYuOSAwLTE1LjUgMS40LTIyLjEtLjR6TTc2My4yIDc2MS41YzIuNyAuMyAuNiAzLjEtLjIgNC41LTIgMy41LTUuNSA1LjMtOC45IDcuMi0zLjIgLjktLjEtMy4yIC41LTQuMiAyLTMuMiA1LTYuMyA4LjYtNy41ek03NjkuNyA3NTguM2MtMi41LTMuOS04LjItMS4zLTExLjMgLjUtNy4xIDQtOS40IDEwLjItMTIuOCAxNy4xLTEuMyAyLjYtMy4yIDQuOC00LjIgNy42LS40IDUuNSA5LjktMi42IDExLjUtMy43IDcuMS00LjggMTguNy0xMC44IDE2LjgtMjEuNXpNNDUzLjIgNzc5LjRjMi40IC4yLTUuNSA0LjctNi43IDUuNi01IDQuMS0xMC45IDYuOS0xNiAxMS0xNS4yIDEyLjMtMzEuOSAyMi45LTQ2LjIgMzYuMi0xMi45IDEyLTI2LjggMjMuMy0zOSAzNi0yOC4yIDI5LTU1LjUgNjIuOS03MS44IDEwMC40LTEuNiAxLjYtLjUtOC4yLS41LTkuOCAuMi02LjYgMi0xMy44IDMuOS0yMC4xIDYuMy0yMC40IDE1LjQtMzcuNiAyNi45LTU1LjYgOS45LTE1LjUgMjQuNS0yNy43IDM3LjctNDAuMiAyMi40LTIxLjIgNTAuMy0zOC41IDc4LjctNTAuMiAxMS00LjUgMjEuNi05LjkgMzMtMTMuM3pNNzY1LjYgNzk0LjJjMS4zIDEtMS40IDIuMi0yLjEgMi44LTMuMiAyLjUtNy4zIDMuNy0xMC4zIDYuMi01LjYgNC44LTcuOSAxMS40LTguMiAxOC45LS4xIDIuMy0uNyA2LjIgMSA4IDMuMyAzLjUgOS4xIC4xIDEyLjItMiA0LjEtMi44IDEwLjEtNS41IDEyLjYtMTBzMS45LTEwLjcgMi40LTE1LjVjLjktMiAyLjcgNS4xIDIuOSA2IDEgNC41IDEgOC45LTIuMSAxMi43LTYuOCA4LjQtMTcgMTQuOC0yNi4xIDIwLjUtMy43IDIuMy02LjggNS4yLTExLjEgNi43LTIuMi0uMi0xLjgtMi43LTEuMy00LjQgMS41LTUuNSAxLjktMTAuOSAzLjEtMTYuNCAyLjgtMTEuOCAxLTMyLjYgMTgtMzQuNiAzLS40IDYgLjUgOSAxLjF6TTExNzMuNCA4MzAuMWMzLjEgMS45LTYuNiA1LjktOC4yIDYuNy05LjYgNC44LTIwIDkuNS0zMC44IDExLjItMjEuMiAzLjQtNDIuNSA2LjMtNjMuOCAzLjItNy4yLTEuMS0xNS43LTEuMy0yMi40LTQuNC0uOC0xLjQgNC42IDAgNS4yIC4xIDIuOSAuNCA2IC4xIDguOSAuMSAxMC4yIDAgMjAuMyAwIDMwLjUtMS4xIDE3LjItMS44IDM0LjUtNS41IDUxLjItMTAuNCA2LjMtMS45IDEzLjItNi42IDE5LjYtNy40IDMuMy0uNCA2LjcgLjkgOS44IDJ6TTEyMTMgODQxLjRjMy44LTEgMTAuNiA0IDE0LjMgNS4zIDE1LjcgNS40IDMwLjYgMTQuMiA0NC44IDIyLjggMjkuOSAxOC4xIDU2LjggMzkuMiA4MC43IDY0LjggMTQuMyAxNS4yIDI1LjMgMzMuMSAzNi42IDUwLjUgNy44IDExLjggMTUuMSAyNSAyMC4xIDM4LjMgLjEgMi01LjMtNi45LTYuMy04LjYtMy41LTYuMy03LjctMTIuMy0xMS41LTE4LjUtOC0xMy0xNy4zLTI1LjctMjcuNC0zNy4xLTQuNi01LjMtOC40LTExLjYtMTMuNC0xNi42LTYuNi02LjUtMTIuNC0xMy42LTE5LjEtMjAtMTEuMS0xMC45LTIzLjQtMjAuNi0zNS0zMS0xMy40LTEyLjEtMzAuNC0xOS44LTQ1LjEtMzAtOC43LTYtMTkuMi0xMC4xLTI4LjctMTQuOC0xLjktMS05LjUtMy0xMC01LjF6TTEwMzMuNyA4NDcuN2M0LTEuOSA0LjcgMy40IDYgNi4xIDMuNiA3LjIgNC4zIDE0LjcgNC4zIDIyLjcgMCAyNS42LTEwLjggNDkuNC0yNi41IDY5LjUtNi41IDguMi0xMC4zIDE4LjMtMTYuOCAyNi43LTguNyAxMS4xLTIyLjggMTkuMy0zNS44IDI0LjItNi41IDIuNC0xNC41IDQuMS0yMS40IDQuMS0zLjkgMC0xMC45LTEuNC0xNC4zIC43LTEuOCAxLTIuNSAzLjgtMy41IDUuNS0yLjcgNC42LTUuMiA5LjgtOC45IDEzLjYtMTUuMyAxNS42LTMxLjEgMzMuOS01MS44IDQyLjYtMy4xIC42IDEuMS00LjIgMi4xLTQuOCA3LTQuOCAxMy42LTEwLjUgMjAuNy0xNS4zIDEyLjMtOC40IDI0LjEtMjEuNiAzMS43LTM0LjMgMi40LTQuMSAzLTguNyA1LjEtMTIuOCAxLjQtMS4yIDMuNy0uMiA1LjQtLjIgNC45IC4xIDEwLjEgLjUgMTQuOS0uMSAxNC4zLTEuNyAzMS4xLTguMSA0MS45LTE4LjEgNi4yLTUuOCAxMi0xMi4yIDE2LjktMTkuMSAzLjEtNC41IDQuNy0xMC4xIDcuOS0xNC42IDEuOS0yLjkgNC45LTUuMiA2LjgtOC4yIDkuOS0xNC41IDE4LjQtMzAuOCAyMC41LTQ4LjUgMS4xLTkuMyAwLTE4LjgtMS45LTI3LjktLjgtMy4zLTQuOC04LjYtMy4zLTExLjh6TTc0MSA4NTIuN2MxLjUgLjktLjYgMy45LTEuMSA1LjItMi4xIDUuNC00LjcgMTAuNC02LjQgMTYuMXMtNC4zIDEyLjItNS40IDE4LjUtMS4xIDEzLTMuOCAxOC4zYy0xLjUgLjktMi0zLjUtMi4zLTQuNi0xLjMtNS42LTItMTEuNS0yLTE3LjQgMC03LjMtMS4yLTE3LjEgMS40LTI0IDEuMS0yLjggNC40LTUgNi40LTcgMS0xIDEuNi0yLjYgMi44LTMuMnMyLjkgLjIgNC40IC4yYzIuMiAwIDMuOS0xLjcgNi0yLjF6TTEwMjkuMyA4NTcuOGMxLjkgLjEgMS45IDIuOCAyLjIgNC4yIDEgNC4xIDEuOSA4LjQgMi40IDEyLjZzLS42IDcuMi0uOCAxMWMtMS4xIDEzLjgtNy4yIDI4LjctMTUuMSA0MC4yLTEgLjcgMC01LjIgLjEtNi4yIC42LTUgMS45LTkuNSAxLjktMTQuNiAwLTktLjgtMTgtMy4zLTI2LjctMS4zLTQuNC0zLjktOC4yLTUuMi0xMi41IC40LTMuMSA3LTEuNiA5LjMtMiA0LS44IDUuNy0zLjUgOC41LTZ6TTMxMi4zIDg1OS41YzIuMi0uMS0zLjYgNS40LTQuNSA2LjMtMy44IDMuOC04LjEgOC4yLTExLjUgMTIuNS0xMC41IDEzLjYtMjAuOCAyNy4yLTMwLjEgNDEuOC0xMi42IDE5LjctMjEuMyA0Mi0yNi45IDY0LjYtMy4xIDEyLjUtMy43IDI1LjQtNS4yIDM4LjItMS4yIDEwLjMgMi4zIDIwLjQgMS43IDMwLjUtLjggMS43LTIuOS02LjEtMy4yLTcuMi0xLjUtNS4xLTMuMi0xMC43LTMuNi0xNi0uNS04LjUtMS43LTE3LjEtLjktMjUuOCAuNy03LjcgMi43LTE1LjMgNC0yMyAxLjctOS4yIDYuNC0xOC44IDEwLjItMjcuMiAxMC42LTIzLjUgMjUtNDYuNiA0Mi41LTY1LjQgOC44LTkuNSAxNi43LTIxLjggMjcuNS0yOS4zek03MTQuMSA4NjkuOGMxLjUgMS0uMSA2LS4xIDcuNyAwIDcuOCAuMiAxNS4yIDEuMSAyMi45czYuOSAxNi44IDQuNiAyNC4zYy0zLjUgMTAuOC0xMi41IDE3LjUtMjEuNiAyMy40LTEzLjIgOC42LTI2LjYgMTQuMS00MS44IDE4LjItOS4xIDIuNS0xOS4zIDQuOS0yOC45IDMuNS0yLjMtMS43IDMuOC00LjIgNC45LTQuNSA2LjMtMS42IDEzLjQtMSAxOS45LTIuNiAxNy40LTQuMyAzNi4yLTExLjkgNTAuNS0yMyAzLjUtMi44IDcuNy01LjcgOS43LTkuOCAzLjMtNi42IC41LTEzLjctLjMtMjAuNS0uNy02LjItMS4xLTEyLjItMS4xLTE4LjRzLTIuOC0xNy44IDMuMS0yMS4yek00MjAuNSA4NzQuNWM1LjUtMS43IDExLjcgMS41IDE2LjkgMy4yIDE5LjEgNi4xIDM0LjMgMjQuNyA0My44IDQxLjggLjkgMi44LTIuNCAyLjYtNC40IDMuMS00LjcgMS4xLTEwLjEgLjEtMTQuOC0uOS0xNS4xLTMuMy0yOS0xOC4yLTM3LjEtMzAuNS0yLjItMy40LTguMi0xMy4zLTQuNC0xNi43ek02OTYgODc4LjZjMS45IDEuMy0zLjQgNS4zLTQuNiA1LjktMS44LS4xLTIuNC0xLjctMy4zLTMuMXM2LjMtMi42IDcuOS0yLjh6TTcwNC4xIDg3OC44YzEuNSAxIC45IDQuMSAuOSA1LjcgMCA1LjgtLjYgMTIgLjEgMTcuOSAxIDguMiA0LjcgMTcuMiAxLjEgMjUuMi0yLjggNi4zLTExIDkuOS0xNi44IDEzLjItMTYuMSA5LTMzLjggMTcuMy01Mi41IDE5LTIuOS0uOCAyLjgtNiA0LTcuMSA2LjgtNi41IDEyLjMtMTQuOCAxOC43LTIxLjggNy4yLTcuOCAxNC4yLTE1LjcgMjEtMjMuOSAxLjctMi4yIDQuMy0zLjggNS45LTYuMSAzLjEtNC40IDYuOS04IDEwLjItMTIuMyAyLjEtMi44IDQuNi03LjggNy40LTkuOHpNNjU2LjUgODgwLjVjMi4yLS43IDMuOSAuMSA2LjEgLjQgMy45IC41IDguMSAuMiAxMS45IC4xIDEuOS0uMSA0LjMtMS4zIDYuMS0uNXM1LjEgNi4zIDYuNCA4LjNjLjYgMi4yLTIuNiA0LjYtNC4zIDUuNS0xLjYtLjMtMi4yLTIuMS0zLjctMi45LTUuNi0uOC0uNiA3LjktMi42IDEwLjctNiA4LjItMTMuNyAxNi42LTIxIDIzLjgtMS4zIC43LTIuMSAwLTIuOS0xLjEtMi4zLTMtNS42LTUuNS03LjYtOC43IDAtMS42IDUuMi0yIDYuNi0yLjQgNi0xLjcgMTMuMi0zIDE3LjctNy44IC42LTEuNSAuNC0yLjQtMS4zLTIuNS0zLjMgLjgtNi4zIDIuNS05LjYgMy4xLTEuNy0uNiAzLjgtNCA0LjQtNC43IDIuNC0yLjYgNS02LjcgNi40LTEwIC41LTIuMS0xLjYtMS4zLTIuNy0uNS0yLjYgMS45LTUuNCA1LjQtOC41IDYuMy02LjEtLjYtNC45LTE0LjEtMS40LTE3LjF6TTExNDcuOSA4ODEuNGMyLjgtMSA4LjEgLjYgMTAuOSAxLjMgMTAgMi40IDE5LjggNC45IDI5LjUgOCAyNS43IDguMiA1MCAxOC42IDczLjcgMzEuMyA5LjkgNS4zIDIxLjUgMTAuNCAzMCAxNy45IC41IDEuMy03LjctMy4xLTguOC0zLjctNi40LTMuMi0xMi42LTYuMy0xOS05LjUtMTQuNS03LjMtMjkuNC0xMy41LTQ1LTE4LjEtNS40LTEuNi0xMS44LTQuNi0xNy42LTQuNC0xLjUgLjYgMyAyLjggMy45IDMuNSA0LjQgMy4xIDkgNS45IDEzLjUgOSAxMS42IDcuOCAyMy4xIDE3LjIgMzIuNiAyNy40IDcuNiA4IDE1LjYgMTUuNiAyMi4xIDI0LjQgMTQuOCAyMC4yIDI2LjggNDAuOSAzNyA2My42IDMuMyA3LjUgNi4yIDE1IDguNyAyMi44IDEuMiAzLjYgMy4yIDcuNSAzLjQgMTEuMy0uNyAxLjctMS44IDEuOC0zLjMgMS0yLjctMy4yLTMuNi03LjQtNS40LTExLjEtNS4xLTEwLjEtMTAuNi0yMC40LTE2LjYtMzAtMTQuNC0yMy4xLTMwLTQ0LjEtNDguMi02NC4zLTUuOC02LjQtMTEuNS0xMy43LTE4LjMtMTkuMi04LTYuNS0xNS4yLTE0LTIzLjMtMjAuMi0xMi41LTkuNy0yNS42LTE4LjctMzguOC0yNy4zLTUuMi0zLjMtMTAuNC02LjYtMTUuNy05LjgtMS4zLS44LTUuNS0yLTUuMy0zLjl6TTY0MS4zIDk0MS4yYy0uMiAxLjgtMS44IDIuNS0yLjggMy45LTIuNCAzLjUtNS4zIDYuNi04IDkuOS0xMC4zIDEyLjgtMjAuNyAyNS40LTMxLjEgMzguMS0xMi44IDE1LjYtMjUgMzIuMS0zNy4xIDQ4LjQtNC42IDYuMy04LjggMTMuMS0xNC4yIDE4LjgtMS44IDIuMS0yLjkgNS4yLTUuMiA2LjhzLTYuOSAuOS05LjYgLjljLTcuNSAwLTE1IDAtMjIuNSAwLTIwIDAtNDAuMSAwLTYwLjEgMC0xMC4yIDAtMjEgMS0zMS4xLS4yLTEuNi0uOSAuNC0yLjQgMS4xLTMuNCAxLjktMi42IDQuNS00LjYgNi4yLTcuMyAyLjItMy42IDYtNi4xIDguOC05LjIgNi41LTcuNSAxMy40LTE0LjYgMjAtMjIgMTMuNS0xNS40IDI3LjMtMzAuOCA0MS00Ni4xIDQuMi00LjcgOC4xLTEwIDExLjktMTUuMSAxLjktMi40IDMuMi01LjcgNi4xLTcuMiAyLjcgLjEgNS44IDMuMiA4LjQgNC4zIDkuNSA0LjEgMjMuNyA5LjMgMzIuNiAxIDYuOS02LjQgNS42LTE0LjcgMy42LTIzLjEtMi4zLTEwLjEtNC45LTI2IC41LTM1LjQgNS45LTEwLjUgMTYuNy02LjYgMjUuMi0yLjMgNi45IDMuNSAxMy4xIDggMjAgMTEuNSA0LjEgMi4xIDguNyAzLjMgMTIuNyA1LjMgMi45IDEuNCA1LjIgMy45IDcuNyA1LjkgNi4yIDQuOCAxMi4yIDkuMyAxNS45IDE2LjV6TTczMi42IDkwMi44YzItLjYgMy40IDEuOCA0LjYgMyA0LjMgNC4zIDguMiA4IDcuNyAxNC42LS41IDguNC0zLjkgMTYuOS02LjggMjQuNy0zLjUgOS40LTYuOSAxOC45LTExLjEgMjcuOS0zLjUgNy41LTguMSAxNi4xLTE0LjIgMjEuOC05LjEgOC40LTIxLjEgMTQuNC0zMS44IDIwLjctMTkuMiAxMS40LTM5LjMgMjItNTkgMzIuNS04LjcgNC42LTE2LjUgMTAuNS0yNSAxNS41LTQuMSAyLjUtNi4zIDUuMS0xMS42IDQuMy0xLjMtLjkgMy44LTMuNyA0LjgtNC42IDQuOS00LjMgMTEuMy02LjcgMTYuNS0xMC41IDE0LjUtMTAuOCAzMS42LTE5LjIgNDQuOC0zMS43IDguMi04IDE4LjMtMTYgMjIuMi0yNy4zIDIuMS02LjEgMi4zLTEyLjMgMi4zLTE4LjcgMC0yLjMtLjctNi4yIDEtOCAzLjMtMy42IDExLjYtNS43IDE2LTggOS43LTUuMiAxOS44LTEyLjYgMjYuNy0yMS4zIDQuMS01LjMgNy4zLTEzIDktMTkuNSAxLjItNC44IDEuMy0xMS4yIDMuOS0xNS40ek04MjQuMyA5MDYuMmMyLjYgMS4xLS43IDUuMy0xLjMgNy4zLTIgNy4yLTMuNSAxNC41LTUgMjEuOC0uMyAuNi0yLjktOC45LTMuNy0xMS4xLTIuNi03LTguNC0xMy4zLTE1LjQtMTYuMS0yLjUtMS4zIDYuMy0yLjEgNy42LTIuMSA1LjkgMCAxMi0uNCAxNy44IC4yek00MTQuMyA5MTAuNWMyLjctLjEgMy44IDIuNyA1LjIgNC41IDIuOCAzLjQgNi41IDYuOCA5LjcgOS44IDEwLjEgOS4zIDIyLjcgMTMuMSAzNS42IDE2LjUgMSAxLjctNC41IDEuNy01LjIgMS44LTUuNiAuNC0xMC41LS4xLTE2LjEtLjEtMTQuMSAwLTI4LjMtNC41LTQyLjUtNC00LjUgLjItMTIuOSAxLjQtMTQuOSA2LjEtMy40IDguNCA3LjQgMTguOCAxMi43IDI0LjEgMTMuMyAxMy40IDI2LjkgMjUuNSA0NCAzNCA1LjIgMi42IDEwLjggNCAxNi4xIDYuMiAxLjMgMS44LTEuMiA0LjktMy4xIDUuMy0zLjMgLjgtOS41LTIuMS0xMi41LTMuNS0xMi01LjItMjUtMTIuMS0zNC41LTIxLTMuNi0zLjMtOC40LTUuNi0xMS41LTkuNS03LjktMTAuMS0yMC0yNC43LTE2LTM4LjkgMS42LTUuNSA1LjYtOS4xIDkuNS0xMyA2LjktNi45IDE1LjQtMTIuOSAyMy41LTE4LjN6TTczNy42IDk5NC44Yy0zIDEuOC0yLjgtNS45LTEuNC03LjQgMy4xLTMuNSAxMC01LjMgMTQuMy02LjcgNS41LTEuOSAxMC43LTQuMyAxNi4xLTYuNCAxMS00LjIgMjYtOS43IDI3LjMtMjMuNiAuNC0zLjcgMC03LjEtMS4zLTEwLjUtNC0xMC4yLTE4LjMtMTQtMjYuNS02LjktNS44IDUuMS03LjkgMTUuNi0uNiAyMC4yIDIuOSAuNiAuMy01LjggLjYtOCAuNi00LjMgNC4yLTguOCA4LjYtOS40IDguNi0xLjEgMTUuMiA2IDEyLjkgMTQuNi00LjEgMTUuMi0yNy41IDIyLjctMzYuMyA3LjUtMS45LTMuMy0zLjMtOC0zLjMtMTEuOCAuMS0xNy40IDE5LjQtMzYuNCAzNy0zNi40IDEwLjYgMCAxOS43IDcuMiAyNC4yIDE2LjMgMi4xIDQuMSAxLjggOC43IDEuOCAxMy4yIDAgMjMuNy0yMi43IDM5LjEtNDMuMyA0NS4xLTkuOSAyLjktMjIuMyAyLjQtMzAuMSAxMC4yek02NDYuMSA5MzYuMmMtMi4yIC4zLTMuNS0yLjktNC43LTQuMy00LjItNC44LTktOC45LTE0LjEtMTIuNy0uNy0uOSA4LjQtMi4xIDEwLjEtMS45IDIuNCAuMiA0LjcgNCA2LjEgNS43IDMuNCA0LjEgOS4zIDguNSAyLjYgMTMuMnpNMjc0LjIgOTIzLjljMS4zIC43LS4zIDMuMi0uNyA0LjItMS40IDMuNi0yLjYgNy43LTMuNSAxMS41LTIuNSAxMS4zLTQuNSAyMi40LTMuMyAzMy45LS43IDEuOS0xLjctMy43LTEuNy00LjMtLjEtMy42LTEuNS03LjEtLjctMTAuNyAyLjItOS41IDIuOS0xOC42IDYuOS0yNy43IDEtMi4zIDEuMi01IDMtNi45ek00ODYuMyA5MjkuNWMzLjEtLjEgNC4xIDMuNCA1LjkgNS4zIDUuNSA1LjYgMTEuOSAxMS40IDE3IDE3LjIgLjMgMi4zLTMuNSA1LjYtNC45IDcuMi00LjcgNS4xLTkuMiAxMS4xLTEzLjQgMTYuNi01LjkgNy45LTEyLjggMTUuMi0xOS42IDIyLjMtMiAyLjEtMy42IDYuMi02LjggNi43LTUgLjgtMTEuMS0zLjItMTUuNi01LTE3LjEtNi45LTMwLjgtMjAuMS00NC0zMi40LTMuOS0zLjctNy4zLTcuOC0xMC4zLTEyLjItMS41LTIuMS0zLjQtMy45LTMuMy02LjcgMS40LTMuMyA4LjItMy41IDExLjMtMy41IDEyLjItLjEgMjQuNSAyLjYgMzYuNiAzLjlzMjQuNyAxLjcgMzQuOC02LjRjNC42LTMuNyA3LjMtOS42IDEyLjMtMTN6TTc0Mi4zIDk1MmMxLjkgLjYgMi42IDYuOSAzLjUgOC43IDIuMiA0LjMgNy41IDguMyAxMS44IDEwLjQgMSAuOS03LjkgMy44LTkuNCA0LjQtNS45IDIuMi0xMS45IDUuMi0xNy45IDctMS4xLS4yIDMuMS04LjMgMy42LTkuNyAyLjUtNi44IDUuMi0xNC40IDguNC0yMC44ek04MTAuMSA5NjIuOGMxIC42IC4xIDIuMi0uMiAzLjEtMS4xIDIuOS0xLjkgNi0zLjEgOC44cy0xLjQgNS40LTMuMyA3LjItNi4yIDIuNS04LjggMy4xYy02LjQgMS41LTEyLjggMy4xLTE5LjEgNC42LTIuNi0uMyAyLjQtMi4xIDIuOS0yLjQgMy4yLTEuNSA3LjMtMi43IDEwLjMtNC42IDYtNCAxMC45LTguNyAxNi0xMy44IDEuOC0xLjggMy40LTQuNiA1LjMtNnpNNjY4LjQgOTY5LjNjMi44IDEuMiAxLjYgNy42IDEuNiAxMC4yLS4xIDEwLjgtNi40IDIyLTE0LjIgMjkuMi0xNi42IDE1LjQtMzYuMiAyNi43LTU0LjYgMzkuOC01LjMgMy43LTExLjEgNy0xNi4xIDEwLjktMy40IDIuNi03LjUgNi4zLTExLjQgOC4xLTIgLjktNC44IC41LTcgLjUtNC42IDAtOS44IC43LTE0LjQtLjMtMS4zLTEuMyAzLjYtNi43IDQuNy04IDYuNC04LjEgMTIuMy0xNi42IDE4LjYtMjQuOCAxMC42LTEzLjggMjEuNS0yNy40IDMyLjEtNDEuMyAzLjYtNC44IDguMS0xMy43IDEzLjItMTYuN3MxMy4xLS4zIDE4LjUtMWM3LS45IDE0LjUtMi4yIDIxLjMtNC4yIDIuNS0uOCA1LTIuMiA3LjctMi40ek04OTEuMiA5ODAuN2MxLjcgLjEgMi42IDEuNyAzLjggMi44IDIuOCAyLjUgNi44IDUuOCA4LjUgOS4yLS4xIDIuNi00IDcuOS01LjkgOS43LTMuMiAzLjEtOC45IDQuNi0xMi43IDYuOC02LjkgMy45LTEyLjYgOS43LTIwLjMgMTIuMy0yLS4xIC43LTMgMS4zLTMuOCAyLjUtMy41IDQuNC03LjYgNi44LTExLjIgNC42LTYuOSA4LjYtMTQgMTMuOC0yMC41IDEuNS0xLjkgMi42LTQgNC43LTUuM3pNNzMwIDk4NS43YzIuMyAxLjYgLjcgNy41IDEuMiAxMC4xIC44IDMuNyAzLjIgNC4xIDYgNS43IC41IDEuOS0yLjggMi44LTQuMiAzLjUtNC43IDIuNS05LjkgNi4zLTEzLjcgMTAuMi01LjkgNS45LTExLjkgMTIuNC0xNi45IDE5LjEtMy4zIDQuNC02LjUgOS41LTEwLjUgMTMuNC00LjkgNC42LTEzLjMgNy4yLTE4LjkgMTEtMy42IDIuNS02LjEgNy45LTEwLjQgOS4xLTEuNC0uMS0yLjYtLjQtMS40LTEuOSAxOS4yLTE0LjYgMjguOC0zNi45IDQzLjItNTUuNiAyLjQtMy4yIDYuMi00LjcgOS4xLTcuNHM1LjgtNS4yIDguMi04LjMgMy43LTguMSA4LjMtOC45ek04MDAuMiA5ODguNWMyLjggLjQtMS41IDEwLjctMy4xIDEyLjJzLTQuMiAxLjMtNi4zIDEuM2MtNS40IDAtMTEuNC0uNS0xNi4yLTMuMy0yLTEuOSAzLjYtMy4zIDUuMi0zLjggNi43LTIuMiAxMy42LTQuNiAyMC40LTYuNHpNMTA5Ny41IDk4OS44YzEuNi0uMSA0IDMuMSA1IDQuMiAzLjUgMy45IDcgOC4xIDEwLjcgMTEuOCAxMi43IDEyLjcgMjQgMjkuOSAzMiA0NiAyLjQgNC43IDUuOCA5LjggNy4zIDE0LjktLjggMi40LTguOCAxLjgtMTAuNSAuMy0yLjctMi40LTQuMi03LjctNS41LTExLTIuMi01LjEtNS0xMC03LjUtMTUtNi40LTEyLjctMTMuNy0yNS4xLTIxLjYtMzYuOS0yLjEtMy4yLTQuNC02LjgtNi43LTkuOC0xLjEtMS4zLTMuMy0yLjctMy4yLTQuNXpNNzQ4LjkgOTk0LjFjMi4yIC42IDEuMiAyIC4zIDMuNi0xLjUgMS41LTQuNSAuNC02LjUgLjItMy41LTEuNCA0LjktMy44IDYuMi0zLjh6TTc0Ny4zIDEwMDMuNWM0LjQgMi4zIDIuNiA1LjIgMi40IDkgLjggMS4zIDEuOCAxLjMgMy4yIC44IDQuOS00LjUgMS43LTguOSAxLjQtMTQuMiAyLjEtNS45IDktMS41IDEwLjkgMi4yIDQuNiA5LjEtMy44IDI0LjMtMTQuMSAyNS42LTUuOSAuNy0xMi45LTEuMS0xNC43LTcuNXMzLjgtMTYuMyAxMC45LTE1Ljl6TTkwOC4zIDk5Ny42YzIuNi0uMiA2LjIgMyA3LjIgNS4yLS4xIDItMi4zIDQuNi0zLjQgNi4zLTMuNyA1LjgtOC4zIDEwLjUtMTIuNiAxNS44LTEuNyAxLTIuNi0uNi00LjQtLjYtNC43IC4yLTguNiAyLjgtMTEuMiA2LjYtMS41IDMuNCA2LjctLjIgOC4yLS42IDIuOSAuNC0yLjQgMy43LTMuMyA0LjUtMy43IDMuNS04LjUgNi43LTEyLjcgOS40LTEgMCAxLjUtNS4zIDEuNy02LjYtLjctMi4xLTMuNSAuMy00LjIgMS41LTMuMyA0LjctNy41IDguNi0xMC4xIDEzLjktMiA0LTUuOCA2LjEtOS40IDguNi0zIDEuOS01LjQgNS05IDZzLTcuOSAuNS0xMS40IC4zYy0yLjMtLjkgMS01LjMgMS44LTYuOSAzLTUuOCA2LjgtMTIuNSAxMC44LTE3LjcgMy40LTQuMiA3LTkuNCAxMC45LTEzLjEgMS4zLTEuMSAzLTEuMSA0LjUtMS41IDMuNS0xLjIgNy0zIDEwLjMtNC43IDUuNS0yLjkgMTAtNyAxNS4xLTEwLjQgNC4zLTIuOSA5LjUtNC4zIDEzLjgtNy4yIDMuNC0yLjIgNC40LTYuNSA3LjQtOC44ek0xMDExLjggMTAwMS41YzIuNS0uMSA1LjMgMy42IDcuMyA1IDcuMiA0LjggMTQuNSA5LjUgMjIgMTQgMTYuOSAxMC4yIDM1LjYgMTkuOCA1NCAyNyAxMS4yIDQuNCAyNyA5LjUgMzQuOCAxOS4xIC42IDEuNi0xLjcgMS40LTIuNyAxLjQtMy40IC4xLTcgLjItMTAuNCAwcy02LjQtMi44LTkuMy00LjJjLTYuNi0zLjMtMTMuNi02LjMtMTkuNy0xMC40LTQtMi42LTguOC00LjItMTIuOS02LjYtMTUuOS05LjEtMzQtMTguMi00Ny40LTMwLjctMy45LTMuNy04LjUtNi42LTEyLjMtMTAuMy0xLTEtMy41LTIuOC0zLjQtNC4zek03NzIuNCAxMDAyLjljMS45LS40IDQuNiAyLjIgNi40IDIuOCAzLjkgMS4zIDggMS40IDEyLjEgMS45IDIgLjctNCA2LjEtNC45IDYuOS01LjYgNS0xMy40IDkuNC0yMC42IDEyLS42IDAgMy44LTYuOSA0LjYtOC41IDIuMy01IC42LTEwLjMgMi40LTE1LjF6TTk5OC40IDEwMDNjMS4yIC4zIDEuNyAyLjkgMi4xIDQgMS41IDMuNiAyLjkgNy4xIDQuMiAxMC44IDQgMTEuMSA3LjUgMjIuNSA5LjQgMzQuMSAuNyA0LjcgMi4zIDkuNiAxLjcgMTQuNC0uOSAxLjgtMi4zIDEuNy00LjEgMS41LTMuNC0xLjctMi4yLTExLjUtMy0xNS0yLjctMTEuNS00LjMtMjMuMy03LjItMzQuOC0uOS0zLjgtNC4xLTExLjMtMy4xLTE1ek03MzAuMSAxMDEyLjhjMS4zIC44LS4yIDUuNyAuMiA3LjQgMS41IDYuMSA1LjYgMTAuOCAxMiAxMS45IDIuNiAxLjItMTAgNC45LTEyLjEgNS42LTUuOSAyLjItMTEuOCAzLTE3LjkgNC42LTMuMiAuOS02LjMgMy05LjcgMy41LTIuNi0uOSA0LjctNy43IDUuNy05IDQuMi02LjEgOS4zLTExLjggMTQuNS0xNyAyLjMtMi4zIDQuNS01LjQgNy4zLTd6TTY5Mi4zIDEwMTYuNWMxLjcgMC0zLjkgNy40LTUgOC44LTQuMiA1LjgtOC4zIDExLjYtMTIuNiAxNy4zLTUuOCA3LjUtMTIuOSAxNS43LTIwLjggMjEuMi0xLjcgMS4yLTIuOCAzLjMtNSAzLjktMy4xIC45LTcgLjMtMTAuMiAuMy02LjkgMC0xMy45IC40LTIwLjgtLjEtMi43LS45IDEuNC00LjUgMi40LTUuOXMyLjUtMi43IDMuMS00LjItLjItMi4zIC44LTMuNGMxLjUtMS43IDQuNC0yLjggNi4zLTQuMSAxOS41LTEyLjkgNDEuOS0yMS40IDYxLjgtMzMuOHpNNzkyLjQgMTAxNi43YzEuNy0uMyAuNiA0LjIgLjYgNS40IDAgNS4yLS4zIDEwLjQgLjUgMTUuNi0uNiAxLjYtNC4zLTIuNi01LjUtMy40LTMuOC0yLjQtNy41LTMuNS0xMS44LTQuNi0xLjEtMS4zIDIuOC0yLjYgMy43LTMuMiA0LjUtMi44IDguNi02LjMgMTIuNS05Ljh6TTc5NS41IDEwNjdjLTIuNSAyLTcuOCAxLjItMTAuOCAuOC0yLjUtMS4yLS44LTQuMS0uNy02LjMgLjEtNC4yLS45LTguMi0zLjUtMTEuNS01LjgtNy4zLTE5LjgtNi42LTI0LjkgMS4xLTMuNCA0LjktMy4yIDEwLjUtNS4xIDE1LjktMi45IDIuMy0xMi45IDEuNi0xNi40IC42LTEtMS40IC42LTQuMyAxLjItNS44IDIuMi01LjMgNC43LTkuNyA4LjQtMTQuMSA3LjItOC41IDE5LjYtMTQgMzAuNy0xMi42IDEzLjMgMS42IDI1LjYgMTguOCAyMS4xIDMxLjl6TTc0MC4yIDEwNDAuNGMyLjMgLjItNC42IDguMi01LjcgOS42LTIuNSAzLjQtNC42IDcuNy02LjIgMTEuNy0uNyAxLjYtLjkgNC0yLjIgNS4zLTIuMiAyLjEtOC4xIDEtMTAuOSAxLTkuNyAwLTIwLjIgMS4yLTI5LjctLjItMi0xLjIgLjItMy40IDEuMi00LjggMi40LTMuNiA1LjQtNi43IDguOS05IDUuNC0zLjYgMTQuNy00LjcgMjAuOS02LjEgOC0xLjcgMTUuOC01LjIgMjMuNy03LjV6TTc1OC4zIDEwNjcuN2MtMS45LTEuNi0xLjYtNS4xLTEtNy40IDEuNS00LjkgNy44LTExLjIgMTMuNC05LjlzMTEuNCAxMi44IDQuNyAxN2MtMy4yIDIuMS0xMy40IDEuMS0xNy4xIC4zek02MTUuMSAxMDU4LjhjMS40IC44LTEuNiAzLjMtMi4zIDQtMi44IDIuOC01IDUuNi05LjQgNS0xLjQtMSAuOS0yLjUgMS44LTMuMSAzLjEtMi4xIDYuNi00LjIgOS45LTUuOXpNNjgxLjEgMTA1OS44YzIgMS4yLTQuNyA3LjMtNi4xIDcuOHMtMi43IC4xLTIuMi0xLjdjMS44LTIuNCA1LjYtNC44IDguMy02LjF6Ii8+CiAgICA8L21hc2s+CiAgPC9kZWZzPgogIDwhLS0g57q/56i/5bGC77ya5Yqo5oCB57uY5Yi2IC0tPgogIAogIDwhLS0g5aGr5YWF5bGC77ya5bu26L+f5reh5YWlIC0tPgogIDxwYXRoIGNsYXNzPSJjeS1zcGxhc2gtZmlsbCIgZmlsbD0iI2VjODZiYiIgZmlsbC1ydWxlPSJub256ZXJvIiBtYXNrPSJ1cmwoI2N1dCkiIGQ9Ik01NjggMzguOGMxLjMgLjkgNC4zLS43IDYtLjggNC43LS4zIDkuNi0uNSAxMy43IDIuMyAzLjIgMi4zIDUuNCA0LjIgNy40IDcuNiAxLjEgMS44IDEuMyA0LjYgMyA2IDcuMiA2LjEgMTYuOSAxMC4zIDI0LjggMTUuNyA2LjcgNC40IDE0LjggOS45IDIwLjYgMTUuNCA0IDMuOSA4LjYgOS4zIDEzLjUgMTIgMy44IDEuMyAxLjEtNi43IDEtOC41LS4yLTYuNC0uMy0xMi43IDAtMTkgLjEtMy4xIC45LTYuOCA0LjYtNy40IDUuOS0uOSAxMS4xIDUuMyAxNC4xIDkuNyA3LjUgMTEgMTkuMSAyMS43IDIxLjQgMzUuNSAxLjUgMyA0LjYtNC42IDUuOS01LjggNC40LTQgOS42LTguOSAxNS43LTQuNyA0IDIuOCAyLjYgOC45IDMuNiAxMi45IDIuMiA4LjMgNS43IDE2LjMgNC42IDI1LjItLjUgNC4xLTIuMyA3LjctMy4xIDExLjcgLjEgMS44IDIuNiAxLjUgMy45IDIuMnMyLjUgMi41IDMuMiA0LjNjMi41IDYuOCA2LjEgMTMuNyA3LjggMjAuNyAuOCAzLjQtLjUgNi45IDAgMTAuMiAuOCAxLjEgMS41IDEuNyAyLjcgLjggMS4zLTIgMi00LjkgMy44LTYuNiA0LjEtMy43IDguNy0uMSAxMC41IDMuNiAyLjggNS40IDUuNSAxMS4xIDcgMTcgLjggMy4zIC43IDcgMS44IDEwLjIgMi44IDIuMyA2LjkgLjUgMTAuMSAuMXM1LjcgLjMgOC4zLS43YzMuNy0xLjMgNi45LTUuNSAxMC4xLTcuNyAuOS0xLjctMi42LTMuOC0zLjgtNC45LTUuMi00LjktMTEuNC04LjUtMTUuOS0xNC4xLTExLjMtMTQuNS0yMS41LTI4LjctMjYuOC00Ni43LTQuOS0xNi42LTcuMy0zNy4xLTMuMi01NC4yIDEuMy01LjIgMi40LTE4LjUgMTAuOC0xNS40IDQuMyAxLjUgNC45IDcuOCA2LjcgMTEuMyA1IDEwLjIgMTAuNSAyMCAxNy41IDI5IDE1LjQgMTkuNiAzNy43IDI4LjggNTYuNyA0My44IDUuMSA0LjEgMTAuMyA4LjkgMTQuOCAxMy43IDIuOSAzLjIgNS4zIDggOS4xIDEwLjMgMy41IC41IDcuNy0yIDExLjEtMyA1LjYtMS42IDEyLjEtMi4xIDE3LjktMS40IDguNyAxLjEgNC44IDkuMSA5IDEzLjUgMi42IDIuNyA5IDMuNyAxMi4zIDUuNyA1LjMgMy4yIDcuNiA4LjIgMTAuNiAxMy4zIDEuNSAxLjYgNC4zLTEuMSA2LTEuOCAzLTEuMyA2LjMtLjUgOC45IDEuNSA2LjcgNS40IDEwLjYgMTQuNyAxNi44IDIwLjcgMi45IDIuNiA2LjUgNC41IDkuMyA3LjIgOS42IDkuNCAxOS4yIDE5IDI5IDI4IDMuNiAzLjQgNS45IDggOS40IDExLjYgMTUuMyAxNS41IDI2LjMgMzQuNSAzNiA1NCA3IDEzLjkgMTIuOCAzMi40IDkuMSA0OC0uOSA0LjEtLjkgOC4yLTMuMSAxMS45LTEuNiAyLjktNC4yIDQuNC02LjQgNi42LS4zIDIuNyAzLjMgNS42IDQuNyA3LjcgNC4yIDUuOSA4LjIgMTIgMTEuNyAxOC4zIDEyLjUgMjIgMTguOSA0OCAxNC44IDczLjItMS4yIDcuNy01LjggMjMuMi0xNC4yIDI2LTEuOC0uMi0xLjgtMS43LTEuNi0zLjMgLjYtNC4xIDIuMi04LjEgMi43LTEyLjMgMS4zLTExLjEgLjktMjMuMi0yLjgtMzQtMS40LTIuOS0zLjcgNy4xLTQuMSA4LjYtLjcgMi42LTIuMiA1LjEtMi44IDcuNy0xLjEgNS42LS4yIDEyLjEtLjIgMTcuOCAwIDE5LjMtOSAzOS40LTIwLjcgNTQuMy00LjIgNS40LTExLjQgMTQuNy0xOC43IDE1LjQtNC40LTEuNC0xLjktNy42LTEuMS0xMC43IDIuNi0xMC41IDQuNC0yMy45IDIuMi0zNC43LTEuOC0yLjItNC43IC40LTYuOCAxLjEtNiAyLjItMTIuNSAzLjctMTguNyA1LjMtMi4yIC41LTUuNCAwLTYuOCAyLjItMS44IDMuMi0xLjIgNy4xLTEuNSAxMC41LS43IDEwLjQgMSAxOS4yIDMuMyAyOS40IDUuNCAyMy41IDI1LjkgNDUuOCA0Ny4xIDU2LjQgOC42IDQuMyAxOC4zIDQuNSAyNy4yIDcuMyAzLjIgMi45LTEuNCA1LjUtMy44IDYuNy02LjggMy41LTE0LjEgMi43LTIxLjMgNC4xLTIuNCAxLjggNS4xIDQuOSA2LjYgNS43IDUuOSAzLjEgMTEuOSA2LjggMTguMyA4LjcgMi43IC43IDUuOSAuNCA4IDIuNSAxLjYgMy45LTEuNSA1LjEtNC44IDUuOC02LjIgMS40LTEzLjUgMi44LTE5LjggMS4zLTE1LjYtMy42LTI5LjMtNy4xLTQzLjQtMTUuMS01LjEtMi44LTEwLjctNi41LTE1LjEtMTAuNC0yLjctMi40LTUuNy01LjctOC45LTcuMy0xLjUgLjEgMSA0LjggMS41IDUuNyAyLjkgNi4yIDUuNyAxMiA5IDE4IDExLjggMjIuNCAyNS4xIDQ3LjEgNDMgNjUgNSA1IDkuMiAxMC43IDE0LjQgMTUuNiAxMS43IDEwLjggMjYuOCAyMS42IDQyLjEgMjYuOSA0MS41IDE0LjIgODcuNy0xLjcgMTI0LjQtMjIuNSAxNi05IDMxLjEtMTkuNSA0NC41LTMyIDE2LjUtMTUuMyAzMi40LTMyIDM4LjUtNTQuNSAxMi43LTQ3LTI4LjUtMTAzLjctNzguMi0xMDEuNi0xMC45IC40LTIxLjcgMi43LTMxLjggNy4xLTIuNSAxLjEtNS4xIDEuNS03LjQgMy4xLTcgNC45LTEzLjMgMTIuNy0yMS4xIDE2LjItMy4zLS4yLTUuMS00LjctNS4yLTcuNS0uMS03LjEgMy43LTE0LjEgNi44LTIwLjIgOS4xLTE4LjMgMjkuNi0yOS45IDQ4LjUtMzUuNSA2LjctMS45IDEzLjMtMi4zIDIwLjItMi4zczEzLjItLjMgMTkuNyAxLjNjMjguNCA3LjEgNDguNSAyOC42IDYxLjggNTMuNyA3LjggMTQuNiAxMC40IDMwLjcgMTMuMiA0Ni44IDguNCA0OC41LTExLjkgMTAxLjYtNDYgMTM2LjQtOS42IDkuOC0xOC4zIDIwLjctMjkuMiAyOS4zLTkuMyA3LjMtMTguNiAxNC40LTI4LjMgMjEuMi03LjcgNS4zLTE3LjEgOC43LTI0LjYgMTQuMi0uNCAxIDUuOSAyLjQgNy4yIDIuOCA4LjYgMi43IDE3LjMgNS40IDI1LjcgOC44IDIyLjQgOS4zIDQzLjYgMTkuMyA2NC43IDMxLjMgNTcuMSAzMi4yIDEwMy43IDg1IDEzMi44IDE0My4yIDcgMTQgMTMuMiAyOC4zIDE4LjQgNDMuMSAxLjQgNCA1LjEgMTEuNyAyLjcgMTUuNS0yLjMgMi4xLTYuMiAxLjQtOS4xIDEuNC02LjUgMC0xMyAwLTE5LjUgMC0yNyAwLTU0IDAtODEgMC01MS41IDAtMTAzIDAtMTU0LjUgMC0xNiAwLTMyIDAtNDggMC02LjggMC0xNS42IDEuNS0yMi4yLS4zLTguNS0yLjUtMTYuOC04LjctMjQuMy0xMy4yLTEyLjYtNy40LTI1LjYtMTQuMS0zNy44LTIyLjItNy45LTUuNC0xNS0xMS45LTIzLTE3LjMtMS43LS41IDAgMi40IC4yIDMuMSAxLjQgMy44IDIuMSA4IDMuMSAxMS45IDIuMSA4LjYgNCAxNy4xIDUuNyAyNS44IC43IDMuNCAyLjUgNy42IDEgMTAuOS0yLjcgMi43LTEwLjEgMS4zLTEzLjcgMS4zLTEyLjUgMC0yNSAwLTM3LjUgMC01MSAwLTEwMiAwLTE1MyAwLTE0MSAwLTI4MiAwLTQyMyAwLTM5LjUgMC03OSAwLTExOC41IDAtMTEgMC0yMiAwLTMzIDAtMy42IDAtOS44IDEuMi0xMy4xLS40LTIuMi0xLjItMy40LTUuNy00LjEtNy45LTIuNC03LjYtMy44LTE1LjItNS42LTIyLjktNi4xLTI1LjMgLjMtNTUuNSAxMC41LTc5LjEgMy41LTcuOSA2LjUtMTcuMiAxMS43LTI0LjEgLjMtLjYgLjUtMS41LS42LTEuMS00LjIgMS43LTguMiA2LjItMTIuMyA4LjUtOC43IDQuOS0xOC4xIDkuOS0yNi4zIDE1LjdzLTE4LjUgOS4xLTI3LjQgMTMuMWMtMTkuMSA4LjQtNDAuMSAxNi45LTYwLjggMjAuMi03LjEgMS4xLTEzLjggMi44LTIxIDMtMy40IC4xLTUuNiAxLjMtNy44LTIuMS0uNy0yLjkgMi4xLTMuNyA0LjItNSAzLjgtMi41IDguMS01LjEgMTEuNi03LjkgMTYuNi0xMy40IDM2LjMtMjMuMSA1MS40LTM4LjUgMS4zLTIuMi0zLS4xLTMuNiAuMy0zLjcgMS44LTcuNCAzLjYtMTEgNS41LTkuMyA0LjctMTguNiA5LjItMjguMSAxMy45LTIyLjYgMTEuNC00OCAxOS42LTcyLjcgMjQuOC01LjMgMS4yLTEwLjkgMi4xLTE2LjIgMy4zLTQgMS04LjcgMi41LTEyLjggMS4zLTIuNy0yLjQgNC44LTUuOSA2LjgtNi44IDkuMi00LjcgMTkuOS05LjIgMjguNC0xNS4xIDEwLjMtNy4zIDIyLjEtMTMuMiAzMy0xOS41IDEyLjgtNy4yIDI0LjktMTYuMiAzNi42LTI0LjkgNC4xLTMgOC42LTUuMSAxMi40LTguNSAxLjUtMi4yLTYuNC0uOS04LjEtLjctOSAuNi0xOC4xIDIuNi0yNy4xIDIuOS0xOC4yIC42LTM2LjggMi45LTU0LjkgNS4xLTUuOCAuNy0xMS43IDEuMy0xNy41IDItNCAuNS04IDEuOC0xMS45IC4yLTEuNi0xLjcgLjQtMi42IDEuOS0zLjIgMy40LTEuMyA2LjktMi4yIDEwLjQtMy4xIDE1LjYtNC4yIDMxLjItOS42IDQ3LTEzIDExLjgtMi42IDIzLjMtOCAzNC44LTExLjcgMjUuNS04LjEgNTAtMTguNiA3NC43LTI4LjggODIuNC0zNC40IDE1Ny42LTg2LjkgMjI3LTE0MiAyMi42LTE3LjkgNDQuNy0zNS44IDY1LjItNTYuMyA2LjYtNi42IDE1LjYtMTMuMiAyMC44LTIxIC42LTEuOS0xLjgtMi4xLTMuMi0yLjUtMy40LTEtNi42LTIuMy05LjktMy42LTYuMS0yLjMtMTAuNi04LjEtMTYuNi0xMC4yLTIuMy0uOS02LjMgLjEtOC44IC4xLTYuNiAwLTEzLjMgLjItMTkuNy0xLjMtMjIuOC01LjUtNDguMy0xNi44LTYzLjMtMzUuNy00LjctNS45LTYuNy0xMy0xMC44LTE5LTEuOC0uOS02IDEuNi03LjkgMi4zLTcuMyAyLjYtMTQuNiA0LjUtMjIuMSA2LjQtMTEuMyAyLjctMjMuMSAzLTM0LjYgNC40LTE2LjkgMi0zMy44IDQuNC01MC42IDcuOS04LjYgMS45LTE3LjQgNC4zLTI1LjcgNy4zLTMgMS03LjcgMi43LTEwLjQgLjMtNS4yLTQuMyA0LjktMTMuNSA3LjgtMTYuNCAxMi44LTEyLjcgMjguOS0yMyA0NC41LTMyIDI5LjctMTYuOSA2Mi44LTI3LjkgOTYuNS0zNCAxNi44LTMgMzQuMy01LjkgNTEuNC03LjEgOS4zLS43IDE5LTEuNCAyOC4yLTMuMyAxMi45LTIuNyAyNS41LTguNSAzNy43LTEzLjIgMS4zLTEuMi02LjQtOC4zLTcuNS0xMC42LTMuNS03LjUtMS41LTEyLjcgMS41LTE5LjctLjYtMy40LTEwLjgtNi41LTEzLjctOC4xLTEzLjQtNy4xLTM1LjYtMjEuNC0yNi41LTM5LjQgMS4xLTIuNCAyLjQtNC4zIDQuNS01LjggMS4xLTEuNy0xLjgtMy4xLTIuOS0zLjktNC4zLTIuNy04LjktNC44LTEyLjctOC4zLTktOC4zLTI0LjgtMTkuMi0xOC40LTM0IDEuMi0yLjggMi42LTUgNC41LTcuMiAuMi0xLjctMS44LTIuNS0yLjgtMy42LTIuOS0yLjYtNi40LTQuNS05LjMtNy4yLTEwLjQtOS44LTI4LjYtMjUuNS0xOC4xLTQxLjcgMS41LTIuMyAzLjQtMy4yIDUuNi00LjggMS41LTEuOC0xLjctMy45LTIuOS01LjEtNC4yLTQuMi05LjItOC4xLTEyLjUtMTMtNy41LTEwLjktMTQuNi0yMy44LTYtMzYuNCAxLjUtMi4yIDQuMy0yLjYgNi4xLTQuNCAuOC0yLjEtLjItMy44LS4zLTYtLjUtNS44LTEuMy0xMS43LTItMTcuNS0xLjktMTUuOCAuMS0zMy4yIDItNDguOCA2LjEtNTEuNSAzMi4yLTEwMC4zIDc4LjktMTI1LjEgMTIuNS02LjYgMjUuMi0xMS45IDM5LjQtMTMuMSAzLjUtLjIgOS4xIDAgMTIuMy0xLjIgMi40LS45IDQuMy00LjEgNi43LTUuMyA2LjktMy40IDEzLjktLjggMTkuNyAyLjkgMi44IC42IDMuNS0yLjQgNS4xLTQuMSAyLjktMi45IDYuMS01LjEgMTAtNi41IDEyLjMtNC4zIDI0LjggNCAzMS41IDEzLjYgMS43IDIuNSAxLjggNS44IDMuMyA4LjV6TTcwOS45IDI0NC41YzIuOCAuNCA1LjgtMy4xIDgtNC42czcuNS00LjEgNy44LTctMi40LTYtMy41LTguMWMtMy40LTYuOS0xMC40LTIyLTIuNC0yNy4zIC43LTEtOS4yLTMuOC0xMS00LjgtNi4yLTMtMTQuNC05LTE4LjItMTQuOC0xLjctMi41LTMuMy02LTIuMi05czQtMy45IDYuNC01LjRjMi4xLTIuOS05LTIuNS0xMC4yLTIuNi01LjgtLjQtMTIuNC0yLjUtMTcuNi00LjktNC4yLTItMTIuNy01LTEzLjgtMTAuMi0xLjEtNS44IDYuMS0xMS44IDkuOC0xNS4xIDEuMi0yLjItMi40LTQuOS00LTYuMi01LjUtNC4zLTExLjQtOC43LTE2LjUtMTMuNS03LjYtNy4zLTE2LjctMTMuNy0yNS40LTE5LjZzLTE3LjgtMTMuOC0yOC4xLTE4LjRjLTMuNi0xLjYtOC44IC41LTEyLjgtLjItNi42LTEuMi05LjUtNS45LTE0LjUtOS4zLTQuMy0uMy05LjggMy45LTE0LjMgNC40LTEyLjUgMS41LTIwLjktNi4xLTI4LjMtMTQuOC0xLjUtLjctMy43IDEuMi01LjEgMS45LTIuOCAxLjMtNi44IDIuMy05LjggMS44cy01LjktMi04LjMtMy43Yy0xLjMtLjgtMi41LTIuOC00LjItMi43LTEwLjEgLjgtMjAuNSA1LjItMjkuNyA5LjEtMzUuMiAxNC42LTU4IDQ1LjctNjguNSA4MS41LTMuNyAxMi42LTUuMSAyNS41LTYuNiAzOC40LTEuNyAxNC40LS40IDI4LjggLjEgNDMuMSAuMiA1LjYgLjEgMTQuNyAyLjggMTkuNyAxLjQgMi42IDYuMyAyLjQgOC45IDMuMSAzLjggMS4yIDUuNyAzLjcgOC4yIDYuNiAxLjMgLjUgLjEtNS4zIC4xLTYuNC0uMi00LjctMS05LjItMS0xNCAwLTEzLjktLjMtMjcuNiAyLjItNDEuMyA0LjYtMjUuMiAxNC41LTUwLjggMzMtNjkgMTEtMTAuOCAyNi40LTE3LjkgNDEuMS0yMS45IDI3LjYtNy40IDU4LjMtMS40IDg0IDkuOSA0Mi4zIDE4LjcgNzkuOSA0OC44IDEwOC40IDg1LjEgOC44IDExLjMgMTYuNCAyMy41IDI1IDM1IDMuNCA0LjYgNS43IDExLjYgMTAuMiAxNS4yek01MzkgNDYxLjJjMy4zIC44IDcuNC0zLjUgMTAuMi00LjkgMTAuNC01LjMgMjAuNC0xMS4zIDMwLTE3LjkgMTAuOS03LjYgMjEuOC0xNS4zIDMyLjgtMjIuNyAzLjMtMi4zIDYuMi00LjggOS4xLTcuNCAxLjQtMS4xIDMuMy0xLjcgNC4yLTMuMyAxLjgtMy4zIC43LTkuMSAuNy0xMi44IDAtOC40IDEuMi0xNi42IDIuMS0yNC45IDIuMS0yMC4zIDExLTM5LjkgMjAuMi01Ny44IDYuNi0xMy4yIDE3LjItMjUuMiAyNy44LTM1LjEgMy4xLTIuOSA2LjYtNS40IDkuNS04LjUgMS0xLjEgMy0yLjQgMi45LTQtLjEtMi43LTIuNy01LjUtMy45LTcuOC0zLjgtNy40LTguNi0xNC4zLTEzLjEtMjEuMy0xOC40LTI4LjEtNDEuMS01NC4yLTY4LTc0LjUtMjcuNy0yMS01OS4xLTM3LjMtOTQuNi0zNy4zLTE0LjYgMC0zMi40IDMtNDMuNyAxMy4zLTUuNSA0LjktMTAuMiA5LjQtMTQuNSAxNS40LTUuMSA3LTkuNSAxNS41LTEyLjQgMjMuNy03LjQgMjEuNi03LjQgNDMuNS03LjMgNjYuMSAwIDcuMSAyIDE0LjEgMi45IDIxLjEgMS45IDE1LjIgNi4xIDMwLjEgMTAuOCA0NC43IDEzLjQgNDIuMiAzNC4yIDgwLjkgNjAuOSAxMTYgMTAuNCAxMy42IDIwLjggMjguMiAzMy40IDM5Ljl6TTQwNS45IDI5NS41YzMuMSAxLjMgNi43IDEuMiAxMCAyLjcgMi4xLS4zIC4zLTQuMS0uMS01LjMtMi01LjgtMi41LTEyLjItNC40LTE3LjktMS41LTIuNy0yLjIgNS41LTIuNSA3LS42IDMuNi00IDEwLjEtMyAxMy41ek00MjUuMiAzNDcuNGMxLjUgMi41IDYuMiAxLjggOC42IDEuMiAxLjUtMS42IC4zLTMuMS0uNC00LjgtMS43LTQuNi0zLjQtOS40LTUuNy0xMy43LTEuNS0uOS0xLjUgMi42LTEuNiAzLjYtLjQgNC4yLTEuMiA5LjYtLjkgMTMuN3pNMTAzMS44IDM4NS43YzEuNCAxIDEuOS0yLjIgMi0zLjEgLjYtNC0uNS04LjQtLjktMTIuMy0xLjMtMTIuNS02LjktMjQuNi0xMi0zNS45LTEuMS0xLjItLjkgMy40LS44IDQgLjUgNC40IDEuOSA4LjcgMS45IDEzLjEgMCA1LjYtMi4zIDEyLTEuNCAxNy40IC4zIDIuMSAyLjUgMy40IDMuNiA1IDIuNyAzLjkgNC45IDggNy42IDExLjh6TTQ1My4xIDQwMS4zYy45IDEuOSA2LjQtLjIgOC4zLS41IDEuOS0uOS0uNS0zLjQtMS4yLTQuNy0yLjUtNC00LjgtOC4xLTcuNC0xMi0xLjItLjMtLjggMi43LS44IDMuMyAwIDQuOCAuNyA5LjIgMS4xIDEzLjl6TTQ4Mi40IDQzMC44YzEuNCA2IC4xIDEzLjYgMyAxOS4xIDEuMyAuOSAzLjItLjUgNC42LS45IDIuNS0uNyA0LjEtLjUgNi43LS4zIDEuNC0xLTEuMS0zLjYtMS45LTQuNS0zLjEtMy40LTUuNi03LjQtOC44LTEwLjctLjYtLjctMy40LTUuNS0zLjYtMi43ek01MTIuNCA0NjYuOGMuNiAyLjYgLjQgNS4yIC44IDcuOCAxLjEgMS41IDMuNy0uNyA0LjgtMS42IDEuNy0yLjgtNS40LTcuOS01LjYtNi4yeiIvPgo8L3N2Zz4="cy-sign" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1341 619" preserveAspectRatio="xMinYMid meet" fill="none"> <g class="cy-sign-g" transform="translate(-43.0 -21.0)"> <path class="cy-sign-s" pathLength="1" style="--d:0.00s;--t:0.28s" d="M683 565c-.1-5.3-1.4-9.7 .3-15.1s5.7-9.6 9.5-14.1c11.6-13.7 28.3-24.4 44.2-32.5 5.6-2.9 12.1-3.1 17.6-5.9 3.9-2.1 6.9-6 9.5-9.5 3.7-4.8 3.4-10.3 5.4-15.8 2.2-6.3 5.4-12.5 7.9-18.7 8.6-21.1 17.8-42.1 25.2-63.6 1.5-4.2 2.5-8.5 3-12.8 .3-3-.2-6.1 .8-9 2.3-6 6.7-12.1 9.9-17.7-3 6-6.8 15.3-12 19.6-3.9 3.2-9.2 3.6-13.1 7-9.5 8.3-17.5 18.3-26.9 26.7-5.4 4.7-17.2 11.5-23 3.7-4.2-5.8-3.6-15.6-2.2-22.1 3.7-16.8 11.8-31.7 18-47.6 .1-.6 .1-.6-.1-.1-5.3 11.6-10.2 23.2-14.3 35.3-2.1 6.4-4.6 13.1-4.6 20-.1 9.3 3.3 20.7 14.9 17.3 6.6-2 12.2-7.3 17-12.1 5.7-5.7 11.3-11.3 17-17 4.2-4.2 10.5-10.4 17.1-8.8 2.2 2.2 1.4 5.1 .9 7.9-1.2 7.4-3.9 14.2-6.6 21.2-7.4 19-15.2 37.8-22.8 56.7-3.2 7.9-9.1 16.9-7.8 25.8 2.7 3.9 12.7 .3 16.3-1.1 16.3-6.2 32.7-12.9 49.5-17.6 .5-.1-1.1 .3-1.6 .5-1.7 .5-3.5 1-5.2 1.5-5.3 1.6-10.5 3.6-15.7 5.6-9.7 3.6-19.6 7.7-29.5 10.8-5.2 1.6-11.7 1-16.4 4-4 2.5-9.3 8.7-10.9 13.1s-1.7 8.4-3.8 12.4c-8.3 16.3-19.6 33.5-32.3 46.7-8.7 9.2-22 17.8-33.2 7.2-.2-.1 .3 .4 .5 .6s1.6 1.5 2.5 2.1c1.5 1.1 3.1 1.8 5 2.1 6.6 1.1 12.4-1.7 17.5-5.6 15.7-12 26.5-29.4 36.1-46.3 3.1-5.5 8.7-13.2 6.5-19.9-2.1-1.6-5.1-.5-7.5 .1-6.4 1.7-12.5 5.7-18.2 9-11.6 6.9-22.7 14.3-32.2 23.8-5.1 5.1-9.7 10.1-11.9 17.1-1.7 5.4-.4 9.8-.3 15.1" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.28s;--t:0.05s" d="M783 384c3.2-3.2 6.3-6.7 10.3-9-3.9 1.8-7.6 5.8-10.3 9.1" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.29s;--t:0.05s" d="M782 387c-5.3 4.4-10.1 10.1-15 15-.3 .3 .6-.6 .9-.9 1.3-1.3 2.6-2.6 3.9-3.9 3.4-3.4 6.8-6.8 10.2-10.2" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.30s;--t:0.33s" d="M831 395c2.4-5.7 5.2-11.3 8.1-16.7 1.4-2.5 2.5-5.7 4.6-7.8 3.3-3.4 9-3.9 12.9-6.6 4.5-3.2 8-8.9 14.3-8.5s7.8 7.4 12.6 10.1c2.8 1.6 6.2 1.5 9.3 1.5 5.4 0 11.9 .7 17-1.1s6.1-6.7 8.4-11c1.3-2.3 3.1-4.1 4.9-6 5.4-5.5 15.7-15.7 24.4-10.7 3.3 1.9 3.2 6 2 9.2-2 5-7 9.7-11.6 12.4s-10.5 4.8-15.9 4.9c-4 .2-8.3-2.3-11.2 1.7-1.8 2.7-1.8 6.1-1.8 9.1-.1 9.6 2.5 16 13.1 16.3 16.4 .4 32.4-14.7 43.7-24.8 3-2.6 5.5-5.8 8.8-7.9 8.7-5.8 20.6-5 29.3-11.4 7.7-5.8 15.9-21 27.2-18.7 3 2.5 1.3 7.9 .5 11.3-2.5 10.8-9.1 20.5-11.1 31.5-.6 3.7-1.8 11.5 2.7 13.4 9 3.8 20.3-7.7 25.8-13.2 2.7-2.7 5.4-5.8 8.8-7.6 2.6-1.4 6-1.9 7.8-4.3 2.7-3.7 1.6-9.9 3.5-14.2 5.8-13.2 11.4-26.7 25.2-33.8 5.4-2.8 14-4.1 19.5-.7 3.3 2.1 3.3 6.4 2.7 9.8-1.1 6.7-6.7 12.7-12 16.7-6.9 5.1-14.6 7.2-23.1 7.1-2.8-.1-7.6-2.2-10.2-1.2s-2.7 3.5-3.2 5.4c-1.7 5.9-1.1 13 .7 18.9 5.4 18.4 29.1 19.4 44.4 15.7 22.5-5.4 43.6-13.7 63.9-24.8 12.4-6.7 24.2-15.5 36.8-21.5-29.7 17.7-60.3 37.4-94.6 44.9-12.7 2.7-29.5 6-41.1-1.9-3.6-2.5-6.8-6.1-8.6-10.1-1.1-2.7-1.2-5.6-2.6-8.1-3.7-2.4-10.7 2.8-13.4 5.3-6.5 6-12.4 13.8-21.1 16.8-2.6 .8-6.2 1.9-8.9 .9-5.1-1.9-3.7-11.2-2.7-15.1 1.6-7.1 4.5-14.4 7.4-21 2.5-5.6 6-12.9 4-19.2-2.1-2.2-4.8-1.1-7.3-.3-5.2 1.7-8.7 5-12.4 8.8-3.1 3.3-5.6 7.3-9.4 9.8s-9.6 3.1-12.7 7.2c-2.2 2.9-2.5 6.9-3.7 10.3-1.6 4.8-4.3 9.4-6.7 13.8-.2 .6 .7-1.1 1-1.6 .9-1.6 1.7-3.2 2.5-4.8 2.2-4.6 6.4-11.5 4.3-16.7-2.3-1.7-5.1-.7-7.7 .1-6 1.8-9.6 5.9-13.9 10.1-9.1 9-20.5 18.3-32.6 22.9-5.6 2.2-12.6 3.3-18.4 .9-10.4-4.2-2.6-16.2-7.7-23-5.8-2.6-14.2 .3-20.6-.8-7.2-1.2-9.4-10.9-16.6-11.2-6.2-.4-9.6 5.7-14.2 8.7-3.8 2.6-9.5 3-12.7 6.4-1.9 2-3 5.2-4.3 7.7-2.9 5.5-5.7 11-8.1 16.7" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.64s;--t:0.05s" d="M914 364c2.7-1.5 5.8 .8 8.9 .6 4.4-.3 8.8-1.9 12.7-3.8 5.5-2.7 11.4-7.4 13.8-13.2 3.3-8.1-3.8-11.9-11-9.7s-15.5 9.6-19.5 15.9c-2.6 4-2.9 8.2-7 11.1 .2-.7 .2-.5 .2-.8" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.66s;--t:0.05s" d="M967 367c2.5-2.6 5.2-5 7.5-7.7-2.3 1.7-4.2 4.4-6.3 6.5-.7-.1 .8-1.1 1.3-1.6 1.2-1.5 2.6-2.8 4-4.1-1.8 2.5-4.4 4.7-6.5 6.9" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.68s;--t:0.05s" d="M991 353c.1-4.9 1-9.9 1-15 0-.3 0 .5 0 .8s0 2.7 0 3.6c-.1 3.6-.7 7.1-1 10.7" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.69s;--t:0.05s" d="M1047 375c2-2.1 4.2-4.1 6.1-6.3-1.7 1.6-3.2 3.4-4.9 5-.6 .2 .8-1 1.2-1.5s1.5-1.7 2.4-2.5c.1-.1-1.5 1.8-1.8 2.1-1 1.1-2 2.1-3 3.2" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.70s;--t:0.05s" d="M1070 344c4.1-1.2 10.3 1.1 14.9 1 10.1-.4 19.9-6.4 26.6-13.7 3.8-4.2 8.2-13.7 3.6-18.8-1.9-2.2-5.6-2.7-8.3-2.9-8.7-.7-15.7 4.2-21.9 9.7-3.8 3.4-7.5 7.4-9.7 12.1s-2 9.1-5.4 12.8c.1-.1 .1-.1 .2-.2" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.73s;--t:0.05s" d="M1094 343c4.4-1.8 8.6-3.3 12.2-6.7 .2-.4-3.6 2.2-4.2 2.6-2.6 1.7-5.2 3.1-8 4.3 0-.2 0-.1 0-.2" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.74s;--t:0.05s" d="M843 368c1.7-4 1.6-9.3 2.2-13.7-.7 4.1 0 11.4-2.1 14.8 .5-.8 .5-.4-.1-1.1" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:0.75s;--t:0.37s" d="M537 522c1.4-2.4 .9-4.8 1.1-7.6 .4-5.7 1.1-11.4 2.2-17 3.3-16.5 9-32.3 14.6-48.1 4.8-13.3 11.9-25.9 18.6-38.3 16.3-30.2 37.8-59.8 62-84.4 16.4-16.8 36.2-34.3 60.3-38.1 3.8-.6 7.7-.6 11.6 0 3.1 .4 6.1 1 8.9 2.5 16.3 8.7 13.4 29.2 5.7 42.9-5.5 9.8-12.9 17.9-19.6 26.8-.4 .6 2.1-2.3 2.3-2.5 1.7-1.9 3.3-3.9 4.9-5.9 4.5-5.3 8.5-11 11.8-17.1 7.7-14 12.1-36-5.5-44.3-2.9-1.4-5.9-2.1-9-2.5-14.8-2-28.4 4.9-40.6 12.5-27.4 17.2-48 43.5-66.9 69.3-6.3 8.6-12.5 17.4-18.1 26.5-1.8 3-5 6.1-5.6 9.6s2.4 6.9 5.3 8.9c7.8 5.4 15.2 11.5 23 16.8 33.2 22.7 67.7 40.7 104.9 55.8-2.6-2-6.4-2.6-9.4-3.9-8.5-3.6-17-7.2-25.4-11.1-21.3-10.1-42.1-21.8-61.7-34.8-9.9-6.6-18.6-16-29.1-21.5-2.9-1.6-5.7-4.7-9-5-4 2-5.7 7.8-7.5 11.5-5 10-9.5 20.1-13.4 30.6-10.4 28.7-18.1 58.1-15.6 88.9 1.6 18.5 5.8 36.1 18.3 50.5 5.2 5.9 11 11 17.7 15.2 42.2 26.2 92.3 10.1 132.9-10.8 .4-.3-2.6 1.3-3 1.5-2.1 1.1-4.4 2.1-6.6 3.2-6 3.1-12.2 5.9-18.5 8.4-18.9 7.7-40.7 13-61.3 11.3-31.7-2.6-62.4-19.3-74-50.4-5.8-15.6-6.3-32.9-6.3-49.4" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.12s;--t:0.05s" d="M723 295c-.6-.6 1.6 2.4 2.2 3.4-.5-1.5-1.9-2.8-2.9-3.9s-.5-.5 .7 .5" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.12s;--t:0.58s" d="M1036 279c4.3-10.2 11.2-19.4 15.9-29.4 11.7-25.3 21.5-52 24.8-79.8 1.2-10.3 2.7-20.7 2.2-31.1-1.9-39.1-18.7-81.5-58.2-96.1-12.9-4.7-26.2-5.6-39.7-5.6-12.4 0-25.7 2.2-37.4 6.4-27.7 9.9-51.3 28.3-71.8 48.8-27.8 27.8-50 59.4-69 93.6-7.2 13-12.9 26.6-19.3 40-1.6 3.3-5.3 4.8-6.7 8.1s-1.2 8.7-1.5 12.7c1.7-16.6-4.4-31.9-10.9-46.9-8.3-19.3-20.2-37.1-35.9-51.1-28.7-25.4-70.6-37-108.4-32.3-41.9 5.3-81.5 31.3-102.1 68.2-11.8 21.1-17.2 44.3-18.8 68.2-.5 7 1 14.3 1.6 21.2 3.4 37.3 20.2 73.3 44.1 101.9 6.6 7.9 13.3 18.6 22.2 24.1 2.6 1.6 6.8 5.9 10 3.6-3.3 2.2-7.8-2.3-10.5-3.9-8.8-5.4-16.3-16-22.4-24.2-12.5-16.5-23.8-33.7-31.6-53-8.6-21.2-12.1-43.7-13.4-66.4-.8-13.8 2.5-30.1 6.8-43.1 11.9-35.5 37-68.6 71.7-84.5 20-9.1 41.1-12.4 62.9-12.4 18 0 37.1 3.2 53.4 11.2 30 14.8 53 36 67.9 66.2 3.8 7.6 6.7 16.1 9.3 24.2 1.3 4.2 1.9 9.5 4.5 13.1 2.6 1.1 4.9-1.3 6.4-3.2 3.8-4.7 5.1-11.4 8-16.7 12.6-23 23.6-46.5 39.2-67.8 34.9-47.3 80.5-100.6 143.4-105.8 11-.9 22.5-.4 33.3 1.5 42.8 7.3 66.5 46.1 71.3 86.4 5.4 45-8.1 91-28.5 130.9-8.5 16.5-19.3 31.2-29.7 46.6-.3 .7 1.9-2.4 2.1-2.6 1.2-1.5 2.5-2.9 3.6-4.4 3.7-5.1 7.5-10.6 10.3-16.1 1-1.1 .8-1 0 .4" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.70s;--t:0.05s" d="M783 226c.6-.5 .5-.5 .1 .3-2 2.4-4.5 3.6-6.9 5.4 .8 .5 5.9-3.1 6.5-3.6" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.71s;--t:0.05s" d="M762 195c-.2-3.3-2.4-6.3-4-9.1-.2-.1 1.1 2.9 1.2 3.2 1.3 2.5 2.6 5 4 7.5 .4-.7-.7-1.1-1.2-1.6" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.72s;--t:0.07s" d="M709 596c10.1-6.3 20.7-11.7 30.5-18.4 42.4-28.7 82.9-61.4 121.2-95.4 19-17 38.4-33.5 57.4-50.5 5.4-4.8 10.8-9.7 16-14.8 3.4-3.4 7.5-7.9 11.9-9.9" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-s" pathLength="1" style="--d:1.79s;--t:0.41s" d="M63 417c1.3-2.1 1.6-4.5 3.3-6.4 5.8-6.4 16.5-10.1 24.3-13.2 16.6-6.6 34.3-11.6 51.8-15.1 23.7-4.7 47.5-9 71.5-11.1 31.4-2.7 63.1-1.4 94.3 2 11.1 1.2 22.8 3.2 33.4 6.4 4.6 1.4 5.9 5.6 9.9 7.5 2.3 1.1 5 .9 7.5 1.1 5.9 .5 11.7 .9 17.6 .8 6.9-.2 13.3-3.6 20.1-4.6 21.4-3.1 42.8-6.3 64.2-9.7 6.9-1 13.8-2 20.7-3.1 3.7-.5 7.4-1.4 11.2-.7-10.7-.4-21.6 2.2-32.1 3.9-17 2.7-33.9 5.3-50.9 7.8-6.3 1-12.6 1.5-18.9 2.7-2.4 .5-6.2 .9-6.7 3.9-1.2 6.1 6.7 11 10.6 14 10 7.9 19.2 17.3 24.2 29.2 13.3 31.6-1.4 67.5-17.2 95.2 .1 .8 .8-1.3 1.2-1.9 .7-1.2 1.1-1.9 1.7-3.1 1.8-3.3 3.6-6.6 5.1-9.9 4.4-9.5 8.2-19.5 11-29.6 4.4-16.4 4.9-34.7-1.8-50.6-5.3-12.7-16.2-23.8-27.2-31.6-4.8-3.5-7.2-11-13.4-11.7-4.6-.6-9.3 0-13.9-.4-3.8-.3-7.7-1.2-11.5-.6-4.8 .8-8.3 4.6-13.3 5.5-15.5 2.8-31.2 5.1-46.7 7.9-49.5 9.1-99.3 15.9-149.2 21.8-19 2.3-39.7 4.1-58.8 1.9-6.6-.7-16.8 .4-21.1-5.9 .1-.7 1 1 1.5 1.4 1.4 1.2 2.8 2.1 4.6 2.6 4.3 1.3 8.8 1.4 13.3 1.8 14.4 1.2 28.8 .8 43.2-.4 57.2-4.7 113.8-14.4 170.4-23.8 13.7-2.3 27.4-4.7 41.2-7 3.9-.6 11.1-1.4 10.8-6.9-.4-7.2-10.5-8.5-15.8-9.7-17.7-3.7-35.4-5-53.3-6.6-53.5-4.9-108.8 3.7-160.5 17.2-13.1 3.5-26.2 7.7-38.3 13.8-5.4 2.7-11.8 5.2-15.5 10.2-1.2 1.5-1.5 3.4-2.5 5" stroke="currentColor" stroke-width="16.0" stroke-linecap="round" stroke-linejoin="round"/> <path class="cy-sign-heart" d="M446.6 103.7c1.9-1.5 2.4-4 3.3-6.1 1.4-3.4 3.5-6.7 5.4-10 4.6-8.4 12.1-17.2 20.7-21.6 10-5.1 23.9-3.7 29.5 7.2 2.7 5.2 3 11.6 2.1 17.3-3.8 23.6-19.6 43.9-33.6 62.5-4.8 6.4-11.6 17-19.8 19.1s-18-6.9-24.1-11.5c-16.6-12.5-32.5-27.7-38.8-48.2-3.5-11.1-1-24.8 10.3-30.1s25.2 3.1 33.4 10.9c2.8 2.7 7.7 10.4 11.6 10.5" fill="currentColor"/> <path class="cy-sign-arrow" d="M1310.8 238.3c-3.4-1.8-9.1 .5-12.7 .9-12.8 1.5-25.4 3.8-38.1 5.7-29.2 4.6-58.6 8.9-87.9 13.1-14.5 2.1-29.1 3.6-43.5 6.3s-30 4.8-45 7c-3.2 .4-12.2 3.3-14.5 0-3.4-4.9 5.4-9.3 8.7-10.3 13.2-3.7 27.2-6.1 40.7-8 14.5-2 28.9-5.3 43.3-7.6 28.4-4.7 56.9-8.9 85.3-13.7 11.9-2 23.8-3.6 35.7-5.3 5.8-.9 13.1-.6 18.4-3.2 1.1-2.1-1-4.1-2.3-5.6-3.4-3.9-6.9-7.9-9.8-12.1-1.4-2.2-3.3-6.8-.3-8.6 4-2.4 13.7 1.5 17.8 2.5 16.5 3.9 33.5 8 49.5 13.3 4.8 1.6 16.9 2.8 17.3 9.5 .2 5.6-7.3 8.2-11.2 10.2-13.4 6.7-26.8 13.4-40.4 19.7-3.4 1.6-11 7.2-14.9 5.6-1.9-.8-1.4-3.6-1-5.1 .8-3.8 6.2-10.7 4.9-14.3" fill="currentColor"/> </g> </svg>'

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
