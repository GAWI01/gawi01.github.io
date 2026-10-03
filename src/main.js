import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import './styles/base.css';
import './styles/site.css';
import './styles/arcade.css';

const root = document.documentElement;

function setMode(mode) {
  try {
    localStorage.setItem('gawi-mode', mode);
  } catch {
    // Storage can be blocked; the query string still carries the choice.
  }
  const url = new URL(location.href);
  url.searchParams.delete('mode');
  if (mode === '3d') url.searchParams.set('mode', '3d');
  location.href = url.toString();
}

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-set-mode]');
  if (toggle) setMode(toggle.dataset.setMode);
});

function sectionIdFromHash() {
  const match = location.hash.match(/^#\/?([\w-]*)/);
  return match ? match[1] : '';
}

function boot2D() {
  root.dataset.mode = '2d';
  const scrollToHash = () => {
    const id = sectionIdFromHash();
    const target = id && document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  window.addEventListener('hashchange', scrollToHash);
  scrollToHash();
}

async function boot3D() {
  try {
    const { startArcade } = await import('./arcade/app.js');
    await startArcade({ sectionIdFromHash });
  } catch (error) {
    console.error('Arcade failed to start, falling back to 2D.', error);
    boot2D();
  }
}

if (root.dataset.mode === '3d') boot3D();
else boot2D();
