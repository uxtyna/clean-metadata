const fileInput   = document.getElementById('fileInput');
const dropZone    = document.getElementById('dropZone');
const procPanel   = document.getElementById('processing-panel');
const resultPanel = document.getElementById('result-panel');
const errorPanel  = document.getElementById('error-panel');
const batchPanel  = document.getElementById('batch-panel');

const MAX_FILES = 10;
let currentZipUrl = null;

function showIdle() {
  dropZone.style.display    = '';
  procPanel.style.display   = 'none';
  resultPanel.style.display = 'none';
  errorPanel.style.display  = 'none';
  batchPanel.style.display  = 'none';
  fileInput.value = '';
  if (currentZipUrl) { URL.revokeObjectURL(currentZipUrl); currentZipUrl = null; }
}

function setStage(pct, label) {
  const bar = document.getElementById('progress-bar');
  const stg = document.getElementById('proc-stage');
  if (bar) bar.style.width = pct + '%';
  if (stg) stg.textContent = label;
}

function showError(title, desc) {
  dropZone.style.display    = 'none';
  procPanel.style.display   = 'none';
  resultPanel.style.display = 'none';
  batchPanel.style.display  = 'none';
  errorPanel.style.display  = 'block';
  document.getElementById('error-title').textContent = title;
  document.getElementById('error-desc').textContent  = desc;
}

function handleFiles(files) {
  if (!files.length) return;
  if (files.length > MAX_FILES) {
    showError('Too many files', `You can clean up to ${MAX_FILES} images at once. Please select ${MAX_FILES} or fewer.`);
    return;
  }
  if (files.length === 1) {
    processFile(files[0]);
  } else {
    processBatch(files);
  }
}

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles(Array.from(e.dataTransfer.files));
});
fileInput.addEventListener('change', e => {
  handleFiles(Array.from(e.target.files));
});

document.getElementById('reset-btn').addEventListener('click', showIdle);
document.getElementById('error-reset-btn').addEventListener('click', showIdle);
document.getElementById('batch-reset-btn').addEventListener('click', showIdle);

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

function clamp(v) { return Math.max(0, Math.min(255, v)); }

function applyPixelNoise(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.random() < 0.04) {
      const delta = () => Math.floor(Math.random() * 3) - 1;
      d[i]     = clamp(d[i]     + delta());
      d[i + 1] = clamp(d[i + 1] + delta());
      d[i + 2] = clamp(d[i + 2] + delta());
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

const STRUCTURAL_KEYS = new Set([
  'ImageWidth','ImageHeight','BitDepth','ColorType','Compression',
  'Filter','Interlace','PixelXDimension','PixelYDimension',
  'XResolution','YResolution','ResolutionUnit','Orientation',
  'ExifImageWidth','ExifImageHeight','ThumbnailOffset','ThumbnailLength',
  'JPEGInterchangeFormat','JPEGInterchangeFormatLength',
]);

function filterStructural(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k.startsWith('_') || (!STRUCTURAL_KEYS.has(k) && v !== undefined && v !== null && v !== '')) out[k] = v;
  }
  return out;
}

function truncateVal(val) {
  const s = String(val);
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

function friendlyKey(key) {
  const map = {
    Make:'Camera make', Model:'Camera model', Software:'Software',
    DateTime:'Date & time', DateTimeOriginal:'Date taken', CreateDate:'Date created',
    GPSLatitude:'GPS Latitude', GPSLongitude:'GPS Longitude', GPSAltitude:'GPS Altitude',
    GPSLatitudeRef:'GPS Lat ref', GPSLongitudeRef:'GPS Lng ref',
    Artist:'Artist/Author', Copyright:'Copyright', Creator:'Creator',
    ImageDescription:'Description', UserComment:'User comment',
    Flash:'Flash', FocalLength:'Focal length', FNumber:'F-number',
    ExposureTime:'Exposure', ISOSpeedRatings:'ISO', WhiteBalance:'White balance',
    LensModel:'Lens model', LensMake:'Lens make',
    SerialNumber:'Serial number', BodySerialNumber:'Body serial',
  };
  return map[key] || key;
}

function formatExposure(val) {
  if (typeof val === 'number' && val < 1) return `1/${Math.round(1/val)}s`;
  return val ? `${val}s` : '';
}

function formatGpsCoord(val, ref) {
  if (Array.isArray(val)) {
    const [d, m, s] = val;
    return `${d}° ${m}′ ${s ? s.toFixed(1) + '″' : ''}${ref ? ' ' + ref : ''}`;
  }
  if (typeof val === 'number') return `${val.toFixed(5)}${ref ? ' ' + ref : ''}`;
  return String(val);
}

function categorizeMetadata(meta) {
  const cards = [];
  const keys  = Object.keys(meta);

  const hasGps = keys.some(k => k.toLowerCase().startsWith('gps') && !['GPSVersionID'].includes(k));
  if (hasGps) {
    const lat = meta.GPSLatitude, lng = meta.GPSLongitude, alt = meta.GPSAltitude;
    let desc = 'Exact GPS coordinates were embedded — latitude, longitude';
    if (alt !== undefined) desc += ` and altitude (${Math.round(alt)}m)`;
    desc += ' visible to anyone with the file.';
    if (lat && lng) {
      desc += ` Coordinates: ${formatGpsCoord(lat, meta.GPSLatitudeRef)}, ${formatGpsCoord(lng, meta.GPSLongitudeRef)}.`;
    }
    cards.push({ icon: '📍', title: 'Location data found', desc, sev: 'high' });
  }

  const aiKw = ['parameters','prompt','negativeprompt','seed','cfgscale','sampler','workflow','ai_tool','generator'];
  const aiFields = keys.filter(k => aiKw.some(kw => k.toLowerCase().includes(kw)));
  if (aiFields.length > 0) {
    const sample = meta[aiFields[0]];
    const preview = typeof sample === 'string' && sample.length > 0
      ? ' Preview: "' + sample.slice(0, 80) + (sample.length > 80 ? '…' : '') + '"'
      : '';
    cards.push({ icon: '🤖', title: 'AI generation data found',
      desc: 'Prompt, seed and model parameters were embedded — revealing this image was AI-generated.' + preview,
      sev: 'high' });
  }

  const hasC2pa = meta._c2pa_detected ||
    keys.some(k => /c2pa|contentcred|provenance/i.test(k));
  if (hasC2pa) {
    cards.push({ icon: '🔏', title: 'Content Credentials found',
      desc: 'A C2PA provenance signature was embedded — this triggers "Made with AI" labels on social platforms and reveals the creation tool.',
      sev: 'med' });
  }

  const hasCamera = meta.Make || meta.Model || meta.LensModel || meta.SerialNumber || meta.BodySerialNumber;
  if (hasCamera) {
    const parts = [];
    if (meta.Make && meta.Model) parts.push(`Shot on ${meta.Make} ${meta.Model}`);
    else if (meta.Model) parts.push(`Camera: ${meta.Model}`);
    if (meta.FNumber)        parts.push(`f/${meta.FNumber}`);
    if (meta.ExposureTime)   parts.push(formatExposure(meta.ExposureTime));
    if (meta.ISOSpeedRatings) parts.push(`ISO ${meta.ISOSpeedRatings}`);
    if (meta.FocalLength)    parts.push(`${meta.FocalLength}mm`);
    if (meta.DateTimeOriginal) {
      const d = new Date(meta.DateTimeOriginal);
      if (!isNaN(d)) parts.push(d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }));
    }
    if (meta.SerialNumber || meta.BodySerialNumber) parts.push('serial number present');
    cards.push({ icon: '📷', title: 'Device fingerprint found',
      desc: parts.join(' · ') || 'Camera make, model or lens data were present.',
      sev: 'med' });
  }

  const hasAuthor = meta.Artist || meta.Copyright || meta.Creator || meta['dc:creator'] || meta.Author;
  if (hasAuthor) {
    const who = meta.Artist || meta.Creator || meta.Author || meta['dc:creator'] || meta.Copyright;
    cards.push({ icon: '©', title: 'Author metadata found',
      desc: `Creator name or copyright info was embedded${who ? ': ' + truncateVal(String(who)) : ''}.`,
      sev: 'low' });
  }

  if (meta.Software && !hasCamera) {
    cards.push({ icon: '🖥️', title: 'Editing software found',
      desc: `${truncateVal(String(meta.Software))} — full editing history was present.`,
      sev: 'low' });
  } else if (meta.Software && hasCamera) {
    const camCard = cards.find(c => c.title === 'Device fingerprint found');
    if (camCard) camCard.desc += ` · Processed in ${truncateVal(String(meta.Software))}`;
  }

  if (!hasCamera && !hasAuthor && (meta.DateTime || meta.DateTimeOriginal || meta.CreateDate)) {
    const raw = meta.DateTime || meta.DateTimeOriginal || meta.CreateDate;
    cards.push({ icon: '🕐', title: 'Timestamp found',
      desc: `Creation date was embedded: ${raw}`,
      sev: 'low' });
  }

  return cards;
}

// exifr cannot read JUMBF boxes — scan raw bytes for the 'c2pa' ASCII marker instead
async function detectC2paBytes(file) {
  try {
    const chunk = await file.slice(0, Math.min(file.size, 200 * 1024)).arrayBuffer();
    const bytes = new Uint8Array(chunk);
    for (let i = 0; i < bytes.length - 4; i++) {
      if (bytes[i]===0x63 && bytes[i+1]===0x32 && bytes[i+2]===0x70 && bytes[i+3]===0x61) return true;
    }
    const text = new TextDecoder('latin1').decode(bytes);
    return text.includes('caBX') || text.includes('jumbf') || text.includes('JUMBF');
  } catch { return false; }
}

async function readMetadata(file) {
  const all = typeof exifr !== 'undefined'
    ? (await exifr.parse(file, { exif:true, gps:true, xmp:true, iptc:true, tiff:true, ifd0:true, ifd1:false }).catch(() => null) || {})
    : {};
  if (await detectC2paBytes(file)) all._c2pa_detected = true;
  return all;
}

async function toJpegBlob(file) {
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (isHeic) {
    if (typeof heic2any === 'undefined') throw new Error('heic2any not loaded');
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return Array.isArray(converted) ? converted[0] : converted;
  }
  return file;
}

async function processFile(file) {
  if (file.size > 30 * 1024 * 1024) {
    showError('File is too large', 'The maximum size is 30 MB. Please try a smaller or more compressed image.');
    return;
  }
  const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (!accepted.includes(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    showError('Format not supported', 'This file type isn\'t supported. Please use JPG, PNG, WebP, or HEIC.');
    return;
  }

  dropZone.style.display  = 'none';
  procPanel.style.display = 'block';
  resultPanel.style.display = 'none';
  errorPanel.style.display = 'none';

  document.getElementById('proc-name').textContent = file.name;
  document.getElementById('proc-size').textContent = formatBytes(file.size) + ' · original';

  const thumbUrlProc = URL.createObjectURL(file);
  document.getElementById('proc-thumb').src = thumbUrlProc;

  try {
    setStage(15, 'Reading metadata…');
    const meta = await readMetadata(file);

    setStage(35, 'Removing metadata…');
    const workBlob = await toJpegBlob(file);
    const bitmap = await createImageBitmap(workBlob);
    const canvas = document.createElement('canvas');
    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    setStage(65, 'Altering fingerprint…');
    applyPixelNoise(ctx, canvas.width, canvas.height);

    setStage(88, 'Preparing download…');
    const outputType = /png/i.test(file.type) ? 'image/png' : 'image/jpeg';
    const quality    = outputType === 'image/jpeg' ? 0.92 : undefined;

    const cleanBlob = await new Promise(resolve =>
      canvas.toBlob(resolve, outputType, quality)
    );

    const cleanUrl   = URL.createObjectURL(cleanBlob);
    const cleanName  = file.name.replace(/\.(jpe?g|png|webp|heic|heif)$/i, '') + '_clean.'
                     + (outputType === 'image/png' ? 'png' : 'jpg');

    document.getElementById('res-thumb').src  = cleanUrl;
    document.getElementById('res-name').textContent = cleanName;
    document.getElementById('res-size').textContent = formatBytes(cleanBlob.size) + ' · clean';

    const dlBtn = document.getElementById('download-btn');
    dlBtn.href     = cleanUrl;
    dlBtn.download = cleanName;

    const filtered = filterStructural(meta);
    const cards    = categorizeMetadata(filtered);
    const rawKeys  = Object.keys(filtered);

    const cardsEl    = document.getElementById('meta-cards');
    const tbody      = document.querySelector('#meta-table tbody');
    const rawDetails = document.getElementById('meta-raw-details');
    cardsEl.innerHTML = '';
    tbody.innerHTML   = '';

    if (cards.length > 0) {
      document.getElementById('meta-found-wrap').style.display = '';
      document.getElementById('clean-summary').style.display   = 'none';
      document.getElementById('meta-count-badge').textContent  = cards.length + (cards.length === 1 ? ' risk' : ' risks');
      document.getElementById('meta-count-badge').className    = 'meta-count';

      cards.forEach(({ icon, title, desc, sev }) => {
        const el = document.createElement('div');
        el.className = `meta-highlight-card${sev === 'high' ? ' sev-high' : sev === 'med' ? ' sev-med' : ''}`;
        el.innerHTML = `
          <span class="meta-card-icon" aria-hidden="true">${icon}</span>
          <div>
            <div class="meta-card-title${sev === 'high' ? ' sev-high' : sev === 'med' ? ' sev-med' : ''}">${title}</div>
            <div class="meta-card-desc">${desc}</div>
          </div>`;
        cardsEl.appendChild(el);
      });

      const displayKeys = rawKeys.filter(k => !k.startsWith('_'));
      if (displayKeys.length > 0) {
        rawDetails.style.display = '';
        displayKeys.slice(0, 30).forEach(k => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${friendlyKey(k)}</td><td>${truncateVal(filtered[k])}</td>`;
          tbody.appendChild(tr);
        });
        if (displayKeys.length > 30) {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td colspan="2" style="color:var(--ink-faint);text-align:center;padding:8px 14px;font-size:0.72rem">… and ${displayKeys.length - 30} more fields</td>`;
          tbody.appendChild(tr);
        }
      } else {
        rawDetails.style.display = 'none';
      }

    } else if (rawKeys.length > 0) {
      // Has data but none fits our categories (e.g. only XResolution type fields after structural filter)
      document.getElementById('meta-found-wrap').style.display = 'none';
      document.getElementById('clean-summary').style.display   = 'flex';
      document.getElementById('clean-summary-text').innerHTML  =
        '<strong>Already clean.</strong> No privacy-sensitive metadata detected. Fingerprint altered.';
    } else {
      document.getElementById('meta-found-wrap').style.display = 'none';
      document.getElementById('clean-summary').style.display   = 'flex';
      document.getElementById('clean-summary-text').innerHTML  =
        '<strong>Already clean.</strong> No privacy-sensitive metadata detected. Fingerprint altered.';
    }

    procPanel.style.display   = 'none';
    resultPanel.style.display = 'block';
    if (window.innerWidth < 860) {
      setTimeout(() => resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    }
    URL.revokeObjectURL(thumbUrlProc);

  } catch (err) {
    console.error(err);
    procPanel.style.display = 'none';
    const msg = err.message || '';
    if (/decode|bitmap|source image/i.test(msg)) {
      showError('File could not be read', 'This format isn\'t supported. Please try JPG, PNG, WebP, or HEIC.');
    } else if (/heic2any/i.test(msg)) {
      showError('HEIC conversion failed', 'This HEIC file couldn\'t be converted. Try saving it as JPG from your phone\'s camera app first.');
    } else {
      showError('Processing failed', 'This file couldn\'t be processed. Try a different image, or check that it isn\'t corrupted.');
    }
    URL.revokeObjectURL(thumbUrlProc);
  }
}

async function processBatch(files) {
  const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  for (const file of files) {
    if (file.size > 30 * 1024 * 1024) {
      showError('File is too large', `"${file.name}" exceeds the 30 MB limit. Please remove it and try again.`);
      return;
    }
    if (!accepted.includes(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      showError('Format not supported', `"${file.name}" isn't a supported format. Please use JPG, PNG, WebP, or HEIC.`);
      return;
    }
  }
  if (typeof JSZip === 'undefined') {
    showError('Could not start ZIP export', 'The ZIP library failed to load. Please refresh the page and try again.');
    return;
  }

  dropZone.style.display    = 'none';
  procPanel.style.display   = 'none';
  resultPanel.style.display = 'none';
  errorPanel.style.display  = 'none';
  batchPanel.style.display  = 'block';

  const listEl = document.getElementById('batch-file-list');
  listEl.innerHTML = '';
  const dlBtn    = document.getElementById('batch-download-btn');
  const resetBtn = document.getElementById('batch-reset-btn');
  dlBtn.style.display    = 'none';
  resetBtn.style.display = 'none';

  const badges = files.map(file => {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = `
      <div class="file-info">
        <div class="file-name">${file.name}</div>
        <div class="file-size">${formatBytes(file.size)}</div>
      </div>
      <span class="status-badge processing">Pending</span>`;
    listEl.appendChild(row);
    return row.querySelector('.status-badge');
  });

  function setBatchStage(pct, label) {
    document.getElementById('batch-progress-bar').style.width = pct + '%';
    document.getElementById('batch-stage').textContent = label;
  }

  const zip = new JSZip();
  const usedNames = new Set();
  let failures = 0;

  for (let i = 0; i < files.length; i++) {
    const file  = files[i];
    const badge = badges[i];
    badge.textContent = 'Cleaning…';
    setBatchStage(Math.round((i / files.length) * 90), `Cleaning ${i + 1} of ${files.length}…`);

    try {
      const workBlob = await toJpegBlob(file);
      const bitmap   = await createImageBitmap(workBlob);
      const canvas   = document.createElement('canvas');
      canvas.width   = bitmap.width;
      canvas.height  = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      applyPixelNoise(ctx, canvas.width, canvas.height);

      const outputType = /png/i.test(file.type) ? 'image/png' : 'image/jpeg';
      const quality     = outputType === 'image/jpeg' ? 0.92 : undefined;
      const cleanBlob = await new Promise(resolve => canvas.toBlob(resolve, outputType, quality));

      let cleanName = file.name.replace(/\.(jpe?g|png|webp|heic|heif)$/i, '') + '_clean.'
                    + (outputType === 'image/png' ? 'png' : 'jpg');
      if (usedNames.has(cleanName)) {
        cleanName = cleanName.replace(/(_clean\.\w+)$/, `_${i + 1}$1`);
      }
      usedNames.add(cleanName);

      zip.file(cleanName, cleanBlob);
      badge.textContent = 'Done ✓';
      badge.className   = 'status-badge done';
    } catch (err) {
      console.error(err);
      failures++;
      badge.textContent = 'Failed';
      badge.className   = 'status-badge error';
    }
  }

  setBatchStage(95, 'Building ZIP…');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  if (currentZipUrl) URL.revokeObjectURL(currentZipUrl);
  currentZipUrl = URL.createObjectURL(zipBlob);
  setBatchStage(100, failures ? `Done — ${failures} file(s) failed` : 'Done');

  dlBtn.href         = currentZipUrl;
  dlBtn.download     = 'clean-images.zip';
  dlBtn.style.display    = 'flex';
  resetBtn.style.display = 'flex';
}

document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    item.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(!isOpen));
  });
});

(function () {
  const hamburger = document.querySelector('.nav-hamburger');
  const mobileNav = document.getElementById('mobile-nav');
  if (!hamburger || !mobileNav) return;
  function closeMobileNav() {
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.classList.remove('is-open');
    mobileNav.setAttribute('aria-hidden', 'true');
  }
  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.getAttribute('aria-expanded') === 'true';
    hamburger.setAttribute('aria-expanded', String(!isOpen));
    mobileNav.classList.toggle('is-open', !isOpen);
    mobileNav.setAttribute('aria-hidden', String(isOpen));
  });
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));
}());

(function () {
  const els = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || !els.length) return;
  els.forEach(el => el.classList.add('is-hidden'));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('is-hidden');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
  els.forEach(el => obs.observe(el));
}());

// ── Tool card spotlight cursor effect ─────────
(function () {
  const card = document.querySelector('.tool-card');
  if (!card || window.matchMedia('(hover: none)').matches) return;
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
    card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
  });
  card.addEventListener('mouseleave', () => {
    card.style.setProperty('--mx', '-200px');
    card.style.setProperty('--my', '-200px');
  });
}());

// ── Nav scroll indicator ───────────────────────
(function () {
  const nav = document.querySelector('nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 8);
  }, { passive: true });
}());
