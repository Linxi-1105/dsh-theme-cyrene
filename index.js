/**
 * Host half of the Cyrene theme bundle.
 *
 * Two jobs, both about the first second of the app's life:
 *
 * 1. Mount as a regular Cordis plugin so the bundle's `./client` entry is served.
 * 2. Inject a boot cover into the index HTML. The shell's own "HARNESS /
 *    Loading plugins…" screen is drawn while client modules are still loading —
 *    our browser half does not exist yet at that point, so only markup injected
 *    here can cover it. The cover reads the same localStorage preferences the
 *    browser half uses, and the browser half adopts (removes) it when the real
 *    splash starts. It paints the figure only: the caption belongs to the
 *    browser half's entrance animation, and painting it here as well made it
 *    flash up, vanish and fade back in — the same line shown twice.
 *
 * Nothing here touches the agent, the model, or persisted user data.
 */

import { readFileSync } from 'node:fs'

export const name = 'theme-cyrene'

const BOOT_ID = 'cy-boot-cover'
/**
 * The splash *defaults* were moved by revision 2 of the browser half's
 * migrations (460/pink -> 300/white). This constant tracks that one migration,
 * not PREFS_REV: bumping it to the current revision would overwrite a tone the
 * user picked deliberately.
 */
const SPLASH_REV = 2
const DEFAULT_SIZE = 300

let cachedScript = null

function artDataUri() {
  try {
    return 'data:image/svg+xml;base64,' + readFileSync(new URL('./splash-art.svg', import.meta.url)).toString('base64')
  } catch {
    return ''
  }
}

const BOOT_CSS = `
#cy-boot-cover{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;overflow:hidden;background:radial-gradient(120% 92% at 50% 26%,#fff 0%,#fff 52%,#f6f2f5 100%)}
#cy-boot-cover[data-tone="pink"]{background:radial-gradient(120% 92% at 50% 30%,#fff 0%,#fff0f7 34%,#ffdcec 68%,#ffc3dd 100%)}
#cy-boot-cover img{display:block;width:auto;mix-blend-mode:multiply;filter:drop-shadow(0 18px 46px rgba(208,118,168,.16));-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 66%,rgba(0,0,0,.72) 80%,transparent 94%);mask-image:linear-gradient(180deg,#000 0%,#000 66%,rgba(0,0,0,.72) 80%,transparent 94%)}
/* 深色：外壳把 data-ds-dark-theme 挂到 body 上，这条封面是 body 的子节点，
   所以属性一出现就跟着换色——和浏览器端那份开屏用的是同一套配色。 */
body[data-ds-dark-theme] #cy-boot-cover{background:radial-gradient(120% 92% at 50% 26%,#16131c 0%,#0e0c14 52%,#040307 100%)}
body[data-ds-dark-theme] #cy-boot-cover[data-tone="pink"]{background:radial-gradient(120% 92% at 50% 30%,#20101b 0%,#150b13 34%,#0c060e 68%,#050308 100%)}
body[data-ds-dark-theme] #cy-boot-cover img{mix-blend-mode:normal;filter:drop-shadow(0 12px 40px rgba(226,110,170,.3))}
`

/**
 * Body script that paints the cover before any client module runs.
 * It reads the same localStorage document the browser half writes, applies the
 * same one-time preference migration, and bails out when the splash is off.
 */
function bootScript() {
  if (cachedScript !== null) return cachedScript
  const art = artDataUri()
  if (art === '') {
    cachedScript = ''
    return cachedScript
  }
  cachedScript = `(function(){
  try{
    if (/([?&])cyrene=off(&|$)/.test(location.search)) return;
    var raw = localStorage.getItem('dsh.cyrene.v1');
    var s = raw ? JSON.parse(raw) : {};
    if (s.enabled === false || s.splash === false) return;
    var migrated = (Number(s.prefsRev) || 0) < ${SPLASH_REV};
    var tone = migrated ? 'white' : (s.splashTone === 'pink' ? 'pink' : 'white');
    var size = migrated ? ${DEFAULT_SIZE} : (Number(s.splashSize) || ${DEFAULT_SIZE});
    var el = document.createElement('div');
    el.id = '${BOOT_ID}';
    el.setAttribute('data-tone', tone);
    var img = document.createElement('img');
    img.alt = '';
    img.src = '${art}';
    img.style.height = size + 'px';
    el.appendChild(img);
    // No caption here on purpose. The cover is the splash's *final frame*, and
    // the browser half animates its own caption in when it takes over — painting
    // the same line here first would show it, drop it, and play it again.
    (document.body || document.documentElement).appendChild(el);
    window.__cyBootCover = el;
    // Manual escape hatch: a stuck cover must never lock the app away.
    el.style.cursor = 'pointer';
    el.addEventListener('click', function(){ try { el.remove() } catch(e){} }, { once: true });
    // Two nets, independent of the browser half's own adoption logic: once the
    // plugin is up the cover goes away 600ms later, and it always goes away
    // after 9s even if the client never mounts.
    var guard = setInterval(function(){
      if (!window.__cyrene) return;
      clearInterval(guard);
      setTimeout(function(){ try { el.remove() } catch(e){} }, 600);
    }, 250);
    setTimeout(function(){ clearInterval(guard); try { el.remove() } catch(e){} }, 9000);
  }catch(e){}
})()`
  return cachedScript
}

export function apply(ctx) {
  try {
    ctx.on('webserver/index-inject', (table) => {
      const script = bootScript()
      if (script === '') return
      table.push({ kind: 'style', text: BOOT_CSS }, { kind: 'script', placement: 'body', text: script })
    }, { prepend: true })
  } catch (error) {
    // A host without the web carrier (tui/headless) simply has no boot screen.
    ctx.logger?.debug?.('[theme-cyrene] no web index to decorate:', error?.message ?? error)
  }
  ctx.logger?.debug?.('[theme-cyrene] mounted; the theme itself lives in the browser')
}
