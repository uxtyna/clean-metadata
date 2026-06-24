const PKG_VER  = '@contentauth/c2pa-web@0.9.0';
// esm.sh pre-bundles bare-specifier deps so browsers can import without a bundler
const ESM_URL  = `https://esm.sh/${PKG_VER}`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/${PKG_VER}/dist/resources/c2pa_bg.wasm`;

let c2paInstance = null;

async function initC2pa() {
  if (c2paInstance) return c2paInstance;
  const { createC2pa } = await import(ESM_URL);
  c2paInstance = await createC2pa({ wasmSrc: WASM_URL });
  return c2paInstance;
}

function getValidationState(validationStatus) {
  if (!validationStatus || validationStatus.length === 0) return 'trusted';
  const codes = validationStatus.map(v => v.code ?? String(v));
  if (codes.some(c => c.includes('mismatch') || c.includes('tamper') || c.includes('disallowed'))) return 'invalid';
  if (codes.some(c => c.includes('untrusted') || c.includes('revoked'))) return 'valid';
  return 'trusted';
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    });
  } catch { return isoStr; }
}

function getAiInterpretation(sourceType) {
  const map = {
    'trainedAlgorithmicMedia':                 'AI-generated content confirmed',
    'compositeWithTrainedAlgorithmicMedia':    'Composite: AI elements in real photo',
    'algorithmicMedia':                        'Algorithmically generated (non-AI)',
  };
  return map[sourceType] ?? `Source type: ${sourceType}`;
}

const dropZone       = document.getElementById('dropZone');
const fileInput      = document.getElementById('fileInput');
const processingPanel = document.getElementById('processingPanel');
const resultPanel    = document.getElementById('resultPanel');
const errorPanel     = document.getElementById('errorPanel');

function showIdle() {
  dropZone.style.display        = '';
  processingPanel.style.display = 'none';
  resultPanel.style.display     = 'none';
  errorPanel.style.display      = 'none';
  fileInput.value = '';
  const thumb = document.getElementById('resultThumb');
  if (thumb._objUrl) { URL.revokeObjectURL(thumb._objUrl); thumb._objUrl = null; }
}

function showProcessing(filename) {
  dropZone.style.display        = 'none';
  processingPanel.style.display = '';
  resultPanel.style.display     = 'none';
  errorPanel.style.display      = 'none';
  document.getElementById('procFilename').textContent = filename;
}

function showError(title, desc) {
  dropZone.style.display        = 'none';
  processingPanel.style.display = 'none';
  resultPanel.style.display     = 'none';
  errorPanel.style.display      = '';
  document.getElementById('errorTitle').textContent = title;
  document.getElementById('errorDesc').textContent  = desc ?? 'Try a different image.';
}

function showResult() {
  dropZone.style.display        = 'none';
  processingPanel.style.display = 'none';
  resultPanel.style.display     = '';
  errorPanel.style.display      = 'none';
}

function populateNoCredentials(filename) {
  document.getElementById('resultFilename').textContent = filename;
  document.getElementById('resultIcon').innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>`;
  const badge = document.getElementById('resultBadge');
  badge.textContent = 'No Credentials';
  badge.className   = 'cred-badge cred-badge--none';

  document.getElementById('noCredBody').style.display        = '';
  document.getElementById('sigCard').style.display           = 'none';
  document.getElementById('generatorCard').style.display     = 'none';
  document.getElementById('aiCard').style.display            = 'none';
  document.getElementById('ingredientsCard').style.display   = 'none';
  document.getElementById('validationCard').style.display    = 'none';
  document.getElementById('manifestCard').style.display      = 'none';
}

function populateResult({ filename, state, sigInfo, generator, ingredients, aiSourceType, validationStatus, rawManifest }) {
  document.getElementById('resultFilename').textContent = filename;

  const iconSvgs = {
    trusted: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    valid:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    invalid: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  };
  document.getElementById('resultIcon').innerHTML = iconSvgs[state] ?? iconSvgs.trusted;

  const badgeMap = {
    trusted: { cls: 'cred-badge--trusted', text: 'Trusted ✓' },
    valid:   { cls: 'cred-badge--valid',   text: 'Valid △' },
    invalid: { cls: 'cred-badge--invalid', text: 'Invalid ✗' },
  };
  const b = badgeMap[state] ?? badgeMap.trusted;
  const badge = document.getElementById('resultBadge');
  badge.textContent = b.text;
  badge.className   = `cred-badge ${b.cls}`;

  document.getElementById('noCredBody').style.display = 'none';

  const sigTbody = document.querySelector('#sigTable tbody');
  sigTbody.innerHTML = '';
  const sigFields = [
    ['ISSUER',      sigInfo.issuer            ?? '—'],
    ['COMMON NAME', sigInfo.common_name       ?? '—'],
    ['SIGNED AT',   formatDate(sigInfo.time)],
    ['ALGORITHM',   sigInfo.alg               ?? '—'],
    ['SERIAL NO.',  sigInfo.cert_serial_number ?? ''],
  ].filter(([, v]) => v && v !== '—' || v === '—')
   .filter(([, v]) => v !== '');
  sigFields.forEach(([label, val]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="cred-label">${label}</td><td class="cred-value">${val}</td>`;
    sigTbody.appendChild(tr);
  });
  document.getElementById('sigCard').style.display = sigInfo && Object.keys(sigInfo).length > 0 ? '' : 'none';

  const gen = generator ?? '';
  if (gen) {
    document.getElementById('generatorValue').textContent = gen;
    document.getElementById('generatorCard').style.display = '';
  } else {
    document.getElementById('generatorCard').style.display = 'none';
  }

  if (aiSourceType) {
    document.getElementById('aiTypeValue').textContent   = aiSourceType;
    document.getElementById('aiInterpValue').textContent = getAiInterpretation(aiSourceType);
    document.getElementById('aiCard').style.display      = '';
  } else {
    document.getElementById('aiCard').style.display = 'none';
  }

  const ingList = document.getElementById('ingredientsList');
  ingList.innerHTML = '';
  if (ingredients && ingredients.length > 0) {
    ingredients.forEach(ing => {
      const row = document.createElement('div');
      row.className = 'ingredient-row';
      const title = ing.title ?? ing.label ?? 'Untitled';
      const rel   = ing.relationship ?? ing.relation ?? '';
      row.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>${title}</span>
        ${rel ? `<span class="ingredient-rel">${rel}</span>` : ''}
      `;
      ingList.appendChild(row);
    });
    document.getElementById('ingredientsCard').style.display = '';
  } else {
    document.getElementById('ingredientsCard').style.display = 'none';
  }

  const valList = document.getElementById('validationList');
  valList.innerHTML = '';
  if (state !== 'trusted' && validationStatus && validationStatus.length > 0) {
    validationStatus.forEach(v => {
      const row = document.createElement('div');
      row.className = 'validation-error-row';
      const code = v.code ?? v;
      const msg  = v.explanation ?? v.url ?? '';
      row.innerHTML = `<span class="validation-code">${code}</span>${msg ? `<span class="validation-message">${msg}</span>` : ''}`;
      valList.appendChild(row);
    });
    document.getElementById('validationCard').style.display = '';
  } else {
    document.getElementById('validationCard').style.display = 'none';
  }

  try {
    const json = rawManifest
      ? JSON.stringify(rawManifest, null, 2)
      : '(No raw manifest data available)';
    document.getElementById('manifestJson').textContent = json;
    document.getElementById('manifestCard').style.display = '';
  } catch {
    document.getElementById('manifestCard').style.display = 'none';
  }

}

async function processFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    showError('File too large', 'Maximum file size is 10 MB. Try a smaller image.');
    return;
  }

  showProcessing(file.name);

  const thumbUrl = URL.createObjectURL(file);
  const thumb = document.getElementById('resultThumb');
  thumb.src     = thumbUrl;
  thumb.alt     = file.name;
  thumb._objUrl = thumbUrl;
  thumb.style.display = '';

  try {
    const c2pa = await initC2pa();

    // fromBlob returns null when no C2PA credentials are present (JumbfNotFound)
    const reader = await c2pa.reader.fromBlob(file.type, file);

    if (!reader) {
      populateNoCredentials(file.name);
      showResult();
      return;
    }

    // manifestStore() is the canonical API in v0.9+; json() is deprecated but
    // returns the same structure already parsed (not a JSON string).
    // We try manifestStore() first, fall back to json().
    let raw = null;
    try {
      raw = await reader.manifestStore();
    } catch (e1) {
      try {
        const j = await reader.json();
        // json() may return an object or a string depending on version
        raw = (typeof j === 'string') ? JSON.parse(j) : j;
      } catch { /* raw stays null */ }
    }

    await reader.free();

    if (!raw) {
        populateNoCredentials(file.name);
      showResult();
      return;
    }

    const activeKey      = raw.active_manifest;
    const manifests      = raw.manifests ?? {};
    const manifest       = activeKey ? (manifests[activeKey] ?? {}) : {};
    const validationStatus = raw.validation_status ?? [];
    const state          = getValidationState(validationStatus);

    const sigInfo     = manifest.signature_info ?? {};
    const generator   = manifest.claim_generator_info?.[0]?.name
                        ?? manifest.claim_generator ?? '';
    const ingredients = manifest.ingredients ?? [];
    const assertions  = manifest.assertions  ?? [];

    const cwAssertion  = assertions.find(a =>
      a.label === 'stds.schema-org.CreativeWork' ||
      a.label === 'c2pa.ai.generative'
    );
    const aiSourceType = cwAssertion?.data?.['@type']
                        ?? cwAssertion?.data?.digitalSourceType
                        ?? null;

    let rawForDisplay = raw;
    try { rawForDisplay = JSON.parse(JSON.stringify(raw)); } catch { /* use as-is */ }

    populateResult({ filename: file.name, state, sigInfo, generator, ingredients, aiSourceType, validationStatus, rawManifest: rawForDisplay });
    showResult();

  } catch (err) {
    console.error('[C2PA] Error:', err?.message, err?.name, err);
    const msg = (err?.message ?? String(err)).toLowerCase();
    if (msg.includes('unsupported') || msg.includes('format') || msg.includes('mime')) {
      showError('Unsupported format', 'This file type is not supported. Try a JPEG or PNG.');
    } else if (msg.includes('size') || msg.includes('too large')) {
      showError('File too large', 'The file exceeds the size limit.');
    } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('load') || msg.includes('import') || msg.includes('wasm')) {
      showError('Could not load C2PA library', 'Check your internet connection and try again.');
    } else {
      showError('Could not read file', `Error: ${err?.message ?? 'unknown'}. Check the browser console (F12) for details.`);
    }
  }
}

fileInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (file) processFile(file);
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files?.[0];
  if (file) processFile(file);
});

document.getElementById('resetBtn').addEventListener('click', showIdle);
document.getElementById('errorResetBtn').addEventListener('click', showIdle);


// ─── NAV HAMBURGER ───

const hamburger = document.querySelector('.nav-hamburger');
const mobileNav = document.getElementById('mobile-nav-cc');
if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    const expanded = hamburger.getAttribute('aria-expanded') === 'true';
    hamburger.setAttribute('aria-expanded', String(!expanded));
    mobileNav.setAttribute('aria-hidden', String(expanded));
    mobileNav.classList.toggle('is-open');
  });
}

// Sticky nav scroll class
const navEl = document.querySelector('nav');
window.addEventListener('scroll', () => navEl.classList.toggle('scrolled', window.scrollY > 10), { passive: true });

// ─── FAQ ACCORDION ───

document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item     = btn.closest('.faq-item');
    const isOpen   = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(el => {
      el.classList.remove('open');
      el.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// ─── SCROLL REVEALS ───

const revealEls = document.querySelectorAll('[data-reveal]');
revealEls.forEach(el => el.classList.add('is-hidden'));
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.remove('is-hidden');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });
revealEls.forEach(el => revealObserver.observe(el));

