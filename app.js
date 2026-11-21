// State Management
const state = {
  files: [], // Array of { id, file, name, originalSize, format, quality, status, convertedBlob, convertedSize, convertedUrl }
  globalFormat: 'webp',
  globalQuality: 0.9
};

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseTrigger = document.getElementById('browseTrigger');
const batchToolbar = document.getElementById('batchToolbar');
const queueCounter = document.getElementById('queueCounter');
const clearAllBtn = document.getElementById('clearAllBtn');
const globalFormatSelect = document.getElementById('globalFormat');
const globalQualityInput = document.getElementById('globalQuality');
const globalQualityVal = document.getElementById('globalQualityVal');
const globalQualityGroup = document.getElementById('globalQualityGroup');
const convertAllBtn = document.getElementById('convertAllBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const queueList = document.getElementById('queueList');

// Initialize Event Listeners
function init() {
  // Drag & drop
  browseTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleNewFiles(droppedFiles);
  });

  fileInput.addEventListener('change', (e) => {
    const selectedFiles = Array.from(e.target.files);
    handleNewFiles(selectedFiles);
    fileInput.value = ''; // Reset input to allow re-uploading same file
  });

  // Global batch controls
  globalFormatSelect.addEventListener('change', (e) => {
    state.globalFormat = e.target.value;
    toggleQualityVisibility(state.globalFormat, globalQualityGroup);
    // Propagate to unconverted items
    state.files.forEach(item => {
      if (item.status !== 'done') {
        item.format = state.globalFormat;
      }
    });
    renderQueue();
  });

  globalQualityInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    globalQualityVal.textContent = `${val}%`;
    state.globalQuality = val / 100;
    // Propagate to unconverted items
    state.files.forEach(item => {
      if (item.status !== 'done') {
        item.quality = state.globalQuality;
      }
    });
    renderQueue();
  });

  clearAllBtn.addEventListener('click', () => {
    state.files.forEach(item => {
      if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
    });
    state.files = [];
    updateUI();
  });

  convertAllBtn.addEventListener('click', convertAllFiles);
  downloadAllBtn.addEventListener('click', downloadAllAsZip);
}

// Handle Uploaded Files
function handleNewFiles(fileList) {
  const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
  
  fileList.forEach(file => {
    if (!validTypes.includes(file.type)) {
      alert(`Skipped "${file.name}": Unsupported format. Only PNG, JPG, and WEBP are supported.`);
      return;
    }

    const item = {
      id: 'img_' + Math.random().toString(36).substring(2, 9),
      file: file,
      name: file.name,
      originalSize: file.size,
      format: state.globalFormat,
      quality: state.globalQuality,
      status: 'ready', // 'ready', 'converting', 'done', 'error'
      convertedBlob: null,
      convertedSize: 0,
      convertedUrl: null,
      thumbnailUrl: URL.createObjectURL(file)
    };

    state.files.push(item);
  });

  updateUI();
}

function toggleQualityVisibility(format, container) {
  if (format === 'png') {
    container.style.opacity = '0.4';
    container.style.pointerEvents = 'none';
  } else {
    container.style.opacity = '1';
    container.style.pointerEvents = 'auto';
  }
}

// Format file size nicely
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Update UI
function updateUI() {
  if (state.files.length > 0) {
    batchToolbar.style.display = 'flex';
    queueCounter.textContent = `${state.files.length} image${state.files.length > 1 ? 's' : ''} loaded`;
    
    const hasConverted = state.files.some(f => f.status === 'done');
    downloadAllBtn.disabled = !hasConverted;
  } else {
    batchToolbar.style.display = 'none';
    downloadAllBtn.disabled = true;
  }

  renderQueue();
}

// Render Queue Items
function renderQueue() {
  queueList.innerHTML = '';

  state.files.forEach(item => {
    const el = document.createElement('div');
    el.className = 'queue-item';
    el.id = item.id;

    const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    const targetExt = item.format === 'jpeg' ? 'jpg' : item.format;
    const outputFilename = `${baseName}.${targetExt}`;

    let statusMarkup = '';
    let sizeDetails = `<span class="size-badge">${formatBytes(item.originalSize)}</span>`;

    if (item.status === 'ready') {
      statusMarkup = `<span class="status-badge status-ready">Ready</span>`;
    } else if (item.status === 'converting') {
      statusMarkup = `<span class="status-badge status-converting">⏳ Converting...</span>`;
    } else if (item.status === 'done') {
      const diff = item.convertedSize - item.originalSize;
      const percentDiff = Math.abs(Math.round((diff / item.originalSize) * 100));
      const isSmaller = diff < 0;

      const diffBadge = isSmaller 
        ? `<span class="size-diff-positive">(-${percentDiff}%)</span>` 
        : `<span class="size-diff-negative">(+${percentDiff}%)</span>`;

      sizeDetails = `
        <span class="size-badge">${formatBytes(item.originalSize)}</span>
        <span>→</span>
        <span class="size-badge" style="color: var(--accent-cyan); font-weight:700;">${formatBytes(item.convertedSize)}</span>
        ${diffBadge}
      `;
      statusMarkup = `<span class="status-badge status-done">✓ Converted</span>`;
    }

    const isQualityDisabled = item.format === 'png';

    el.innerHTML = `
      <div class="item-thumb-wrapper">
        <img class="item-thumb" src="${item.thumbnailUrl}" alt="${item.name}">
      </div>

      <div class="item-info">
        <div class="item-name" title="${item.name}">${item.name}</div>
        <div class="item-meta">
          ${sizeDetails}
        </div>
      </div>

      <div class="item-controls">
        <select class="item-select item-format" data-id="${item.id}" ${item.status === 'converting' ? 'disabled' : ''}>
          <option value="webp" ${item.format === 'webp' ? 'selected' : ''}>To WEBP</option>
          <option value="png" ${item.format === 'png' ? 'selected' : ''}>To PNG</option>
          <option value="jpeg" ${item.format === 'jpeg' ? 'selected' : ''}>To JPG</option>
        </select>

        <div class="control-group" style="${isQualityDisabled ? 'opacity: 0.3; pointer-events: none;' : ''}">
          <label style="font-size:0.75rem;">Q: ${Math.round(item.quality * 100)}%</label>
          <input type="range" class="custom-slider item-quality" data-id="${item.id}" min="10" max="100" value="${Math.round(item.quality * 100)}" ${item.status === 'converting' || isQualityDisabled ? 'disabled' : ''}>
        </div>

        ${statusMarkup}
      </div>

      <div class="item-actions">
        ${item.status === 'done' 
          ? `<a href="${item.convertedUrl}" download="${outputFilename}" class="btn btn-secondary" style="padding: 0.45rem 0.9rem; font-size: 0.8rem;">
               <span>Download</span>
             </a>`
          : `<button class="btn btn-primary single-convert-btn" data-id="${item.id}" style="padding: 0.45rem 0.9rem; font-size: 0.8rem;">
               <span>Convert</span>
             </button>`
        }
        <button class="btn-icon danger remove-btn" data-id="${item.id}" title="Remove file">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    queueList.appendChild(el);
  });

  attachItemEvents();
}

function attachItemEvents() {
  document.querySelectorAll('.item-format').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const item = state.files.find(f => f.id === id);
      if (item) {
        item.format = e.target.value;
        item.status = 'ready'; // Reset status when format changes
        renderQueue();
      }
    });
  });

  document.querySelectorAll('.item-quality').forEach(range => {
    range.addEventListener('input', (e) => {
      const id = e.target.dataset.id;
      const item = state.files.find(f => f.id === id);
      if (item) {
        item.quality = parseInt(e.target.value, 10) / 100;
        item.status = 'ready';
        renderQueue();
      }
    });
  });

  document.querySelectorAll('.single-convert-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const item = state.files.find(f => f.id === id);
      if (item) convertSingleFile(item);
    });
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const itemIndex = state.files.findIndex(f => f.id === id);
      if (itemIndex > -1) {
        const item = state.files[itemIndex];
        if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
        if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
        state.files.splice(itemIndex, 1);
        updateUI();
      }
    });
  });
}

// Image Conversion Core (Canvas)
function convertSingleFile(item) {
  return new Promise((resolve, reject) => {
    item.status = 'converting';
    renderQueue();

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');

      // If converting to JPEG, fill canvas with white background (handles transparent PNG)
      if (item.format === 'jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(img, 0, 0);

      const mimeType = `image/${item.format}`;
      const quality = item.format === 'png' ? undefined : item.quality;

      canvas.toBlob((blob) => {
        if (!blob) {
          item.status = 'error';
          renderQueue();
          reject(new Error('Conversion failed'));
          return;
        }

        if (item.convertedUrl) {
          URL.revokeObjectURL(item.convertedUrl);
        }

        item.convertedBlob = blob;
        item.convertedSize = blob.size;
        item.convertedUrl = URL.createObjectURL(blob);
        item.status = 'done';
        updateUI();
        resolve(item);
      }, mimeType, quality);
    };

    img.onerror = () => {
      item.status = 'error';
      renderQueue();
      reject(new Error('Image failed to load'));
    };

    img.src = item.thumbnailUrl;
  });
}

// Convert all items in queue
async function convertAllFiles() {
  convertAllBtn.disabled = true;
  convertAllBtn.innerHTML = '<span>⏳ Processing...</span>';

  for (const item of state.files) {
    if (item.status !== 'done') {
      try {
        await convertSingleFile(item);
      } catch (err) {
        console.error('Error converting file', item.name, err);
      }
    }
  }

  convertAllBtn.disabled = false;
  convertAllBtn.innerHTML = '<span>⚡ Convert All</span>';
  updateUI();
}

// Download All Converted Files as a ZIP
async function downloadAllAsZip() {
  const convertedItems = state.files.filter(f => f.status === 'done' && f.convertedBlob);
  if (convertedItems.length === 0) return;

  downloadAllBtn.disabled = true;
  downloadAllBtn.innerHTML = '<span>📦 Zipping...</span>';

  try {
    const zip = new JSZip();

    convertedItems.forEach(item => {
      const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
      const targetExt = item.format === 'jpeg' ? 'jpg' : item.format;
      const filename = `${baseName}.${targetExt}`;
      zip.file(filename, item.convertedBlob);
    });

    const zipContent = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipContent);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `pixelmorph_converted_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
  } catch (error) {
    console.error('Failed to create ZIP:', error);
    alert('Failed to package ZIP archive.');
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.innerHTML = '<span>📦 Download All (ZIP)</span>';
  }
}

// Start application
document.addEventListener('DOMContentLoaded', init);
