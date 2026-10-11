/** Where the light or dark choice is saved in the browser. */
export const THEME_KEY = 'genvr-theme';

/** Runs before the page paints (in <head>), so the page never flashes the wrong mode. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
