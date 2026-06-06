// ── State ──────────────────────────────────────────────────────────────────
let inventory = [];
let pendingQty = null;   // qty staged in modify modal before saving
let pendingLimit = null; // low-stock limit staged in modify modal before saving

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadInventory);

// Mock data used when Netlify Functions are not available (local file preview)
const MOCK_INVENTORY = [
  { id: 1, item_name: 'Blue Pens',       quantity: 42,  low_stock_limit: 5,  updated_at: new Date().toISOString() },
  { id: 2, item_name: 'A4 Paper Reams',  quantity: 5,   low_stock_limit: 5,  updated_at: new Date().toISOString() },
  { id: 3, item_name: 'Stapler',         quantity: 0,   low_stock_limit: 2,  updated_at: new Date().toISOString() },
  { id: 4, item_name: 'Sticky Notes',    quantity: 18,  low_stock_limit: 10, updated_at: new Date().toISOString() },
  { id: 5, item_name: 'Whiteboard Markers', quantity: 3, low_stock_limit: 5, updated_at: new Date().toISOString() },
  { id: 6, item_name: 'Scissors',        quantity: 7,   low_stock_limit: 3,  updated_at: new Date().toISOString() },
];
const MOCK_LOG = [
  { id: 3, item_name: 'Whiteboard Markers', action: 'decrement',   quantity_before: 4,  quantity_after: 3,  quantity_change: -1, entered_by: 'Alice',   created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 2, item_name: 'A4 Paper Reams',     action: 'set_quantity', quantity_before: 10, quantity_after: 5,  quantity_change: -5, entered_by: 'Bob',     created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 1, item_name: 'Blue Pens',          action: 'add_item',     quantity_before: 0,  quantity_after: 42, quantity_change: null, entered_by: 'Alice', created_at: new Date(Date.now() - 86400000).toISOString() },
];

// True only for the static HTML preview opened directly from disk (no backend).
// Anything served over http(s) — netlify dev, deploy previews, production,
// custom domains — uses the real Netlify Functions + Neon database.
function isMockMode() {
  return location.protocol === 'file:';
}

// ── Data fetching ──────────────────────────────────────────────────────────
async function loadInventory() {
  showState('loading');
  try {
    const res = await fetch('/.netlify/functions/get-inventory');
    if (!res.ok) throw new Error();
    inventory = await res.json();
    renderInventory(inventory);
    updateStats(inventory);
  } catch {
    // Fall back to mock data only in the static file preview (no backend)
    if (isMockMode()) {
      inventory = MOCK_INVENTORY;
      renderInventory(inventory);
      updateStats(inventory);
    } else {
      showState('error');
    }
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────
function renderInventory(items) {
  const grid = document.getElementById('inventory-grid');
  grid.innerHTML = '';

  if (!items.length) {
    showState('empty');
    return;
  }
  showState('none');

  items.forEach(item => {
    const { id, item_name, quantity } = item;
    const limit = item.low_stock_limit ?? 5;
    const status = quantity === 0 ? 'out' : quantity <= limit ? 'low' : 'ok';

    const statusBadge = {
      ok:  '<span class="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 rounded-full px-2.5 py-0.5">● In Stock</span>',
      low: '<span class="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2.5 py-0.5">● Low Stock</span>',
      out: '<span class="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 rounded-full px-2.5 py-0.5">● Out of Stock</span>',
    }[status];

    const qtyColor = {
      ok:  'text-gray-900',
      low: 'text-amber-600',
      out: 'text-red-600',
    }[status];

    const card = document.createElement('div');
    card.className = 'bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-brand-300 transition group cursor-pointer';
    card.dataset.id = id;
    card.dataset.name = item_name.toLowerCase();
    card.dataset.status = status;
    card.onclick = () => openModify(id, item_name, quantity, limit);
    card.innerHTML = `
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-900 truncate" title="${escHtml(item_name)}">${escHtml(item_name)}</h3>
          <div class="mt-1">${statusBadge}</div>
        </div>
      </div>
      <div class="flex items-end justify-between">
        <div>
          <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Quantity</p>
          <p class="text-3xl font-bold ${qtyColor} mt-0.5">${quantity}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">Low limit</p>
          <p class="text-sm font-semibold text-gray-500 mt-0.5">≤ ${limit}</p>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function updateStats(items) {
  document.getElementById('stat-total').textContent = items.length;
  document.getElementById('stat-low').textContent  = items.filter(i => i.quantity > 0 && i.quantity <= (i.low_stock_limit ?? 5)).length;
  document.getElementById('stat-out').textContent  = items.filter(i => i.quantity === 0).length;
}

function showState(state) {
  ['loading', 'empty', 'error'].forEach(s => {
    const el = document.getElementById(`state-${s}`);
    el.classList.toggle('hidden', s !== state);
    el.classList.toggle('flex', s === state);
  });
}

// ── Filter / Search ────────────────────────────────────────────────────────
function filterInventory() {
  const q      = document.getElementById('search-input').value.toLowerCase();
  const status = document.getElementById('filter-status').value;
  const cards  = document.querySelectorAll('#inventory-grid [data-id]');
  let visible  = 0;

  cards.forEach(card => {
    const nameMatch   = card.dataset.name.includes(q);
    const statusMatch = !status || card.dataset.status === status;
    const show        = nameMatch && statusMatch;
    card.classList.toggle('hidden', !show);
    if (show) visible++;
  });

  document.getElementById('state-empty').classList.toggle('hidden', visible > 0 || !inventory.length);
  document.getElementById('state-empty').classList.toggle('flex', visible === 0 && inventory.length > 0);
}

// ── Add Item Modal ─────────────────────────────────────────────────────────
function openAddItem() {
  document.getElementById('form-add').reset();
  hideError('add-error');
  openModal('modal-add');
  setTimeout(() => document.getElementById('add-item-name').focus(), 100);
}

async function submitAddItem(e) {
  e.preventDefault();
  const name   = document.getElementById('add-item-name').value.trim();
  const qty    = parseInt(document.getElementById('add-item-qty').value, 10);
  const person = document.getElementById('add-item-person').value.trim();
  const limitRaw = document.getElementById('add-item-limit').value;
  const limit  = limitRaw === '' ? 5 : parseInt(limitRaw, 10);

  if (!name || isNaN(qty) || qty < 0 || !person) {
    showError('add-error', 'Please fill in all fields with valid values.');
    return;
  }
  if (isNaN(limit) || limit < 0) {
    showError('add-error', 'Low stock limit must be 0 or greater.');
    return;
  }

  setLoading('add', true);
  hideError('add-error');

  try {
    const res = await fetch('/.netlify/functions/add-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name: name, quantity: qty, low_stock_limit: limit, entered_by: person }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    closeModal('modal-add');
    showToast(`"${name}" added successfully.`);
    await loadInventory();
  } catch (err) {
    showError('add-error', err.message);
  } finally {
    setLoading('add', false);
  }
}

// ── Modify Item Modal ──────────────────────────────────────────────────────
function openModify(id, name, currentQty, currentLimit = 5) {
  pendingQty   = currentQty;
  pendingLimit = currentLimit;
  document.getElementById('modify-item-id').value            = id;
  document.getElementById('modify-item-label').textContent   = name;
  document.getElementById('modify-current-qty').textContent  = currentQty;
  document.getElementById('modify-new-qty').textContent      = currentQty;
  document.getElementById('modify-exact-qty').value          = '';
  document.getElementById('modify-person').value             = '';
  // Low-stock limit section
  document.getElementById('modify-current-limit').textContent = currentLimit;
  document.getElementById('modify-limit-input').value         = currentLimit;
  document.getElementById('modify-limit-section').classList.add('hidden');
  hideError('modify-error');
  openModal('modal-modify');
  setTimeout(() => document.getElementById('modify-person').focus(), 100);
}

// Toggle the low-stock limit editor inside the modify modal
function toggleLimitEditor() {
  const section = document.getElementById('modify-limit-section');
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) {
    document.getElementById('modify-limit-input').focus();
  }
}

function quickChange(delta) {
  pendingQty = Math.max(0, pendingQty + delta);
  showModifyPreview();
}

function applyExact() {
  const val = parseInt(document.getElementById('modify-exact-qty').value, 10);
  if (isNaN(val) || val < 0) return;
  pendingQty = val;
  showModifyPreview();
}

function showModifyPreview() {
  document.getElementById('modify-new-qty').textContent = pendingQty;
}

async function submitModify(e) {
  e.preventDefault();
  const id     = document.getElementById('modify-item-id').value;
  const person = document.getElementById('modify-person').value.trim();
  const name   = document.getElementById('modify-item-label').textContent;

  if (pendingQty === null) {
    showError('modify-error', 'Please set a new quantity first.');
    return;
  }
  if (!person) {
    showError('modify-error', 'Please enter your name.');
    return;
  }

  // Read the (possibly edited) low-stock limit
  const limitVal = parseInt(document.getElementById('modify-limit-input').value, 10);
  if (isNaN(limitVal) || limitVal < 0) {
    showError('modify-error', 'Low stock limit must be 0 or greater.');
    return;
  }

  const currentQty = parseInt(document.getElementById('modify-current-qty').textContent, 10);

  setLoading('modify', true);
  hideError('modify-error');

  try {
    const res = await fetch('/.netlify/functions/update-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        quantity_before: currentQty,
        quantity_after: pendingQty,
        low_stock_limit: limitVal,
        entered_by: person,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    closeModal('modal-modify');
    showToast(`"${name}" saved.`);
    pendingQty = null;
    pendingLimit = null;
    await loadInventory();
  } catch (err) {
    showError('modify-error', err.message);
  } finally {
    setLoading('modify', false);
  }
}

// ── Activity Log Modal ─────────────────────────────────────────────────────
async function openLog() {
  openModal('modal-log');
  document.getElementById('log-loading').classList.remove('hidden');
  document.getElementById('log-list').classList.add('hidden');
  document.getElementById('log-empty').classList.add('hidden');
  document.getElementById('log-error').classList.add('hidden');

  try {
    let logs;
    const res = await fetch('/.netlify/functions/get-log');
    if (!res.ok && isMockMode()) {
      logs = MOCK_LOG;
    } else {
      if (!res.ok) throw new Error();
      logs = await res.json();
    }

    document.getElementById('log-loading').classList.add('hidden');

    if (!logs.length) {
      document.getElementById('log-empty').classList.remove('hidden');
      return;
    }

    const list = document.getElementById('log-list');
    list.innerHTML = '';
    logs.forEach(entry => {
      const { item_name, action, quantity_before, quantity_after, quantity_change, entered_by, created_at } = entry;
      const date = new Date(created_at).toLocaleString();

      const actionLabel = {
        add_item:    { text: 'Added item',     color: 'text-green-600  bg-green-50  border-green-200'  },
        increment:   { text: '+1',             color: 'text-green-600  bg-green-50  border-green-200'  },
        decrement:   { text: '−1',             color: 'text-red-600    bg-red-50    border-red-200'    },
        set_quantity:{ text: 'Set quantity',   color: 'text-brand-600  bg-brand-50  border-brand-200'  },
        set_limit:   { text: 'Set limit',      color: 'text-purple-600 bg-purple-50 border-purple-200' },
        delete_item: { text: 'DELETED',        color: 'text-red-700    bg-red-100   border-red-300'    },
      }[action] || { text: action, color: 'text-gray-600 bg-gray-50 border-gray-200' };

      const changeText = action === 'add_item'
        ? `Initial qty: ${quantity_after}`
        : action === 'set_limit'
        ? `Low limit: ${quantity_before} → ${quantity_after}`
        : `${quantity_before} → ${quantity_after}`;

      list.insertAdjacentHTML('beforeend', `
        <div class="py-3 flex items-start gap-3">
          <span class="mt-0.5 shrink-0 text-xs font-semibold border rounded-full px-2.5 py-0.5 ${actionLabel.color}">${actionLabel.text}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">${escHtml(item_name)}</p>
            <p class="text-xs text-gray-500 mt-0.5">${changeText} · by <strong>${escHtml(entered_by)}</strong></p>
          </div>
          <p class="shrink-0 text-xs text-gray-400">${date}</p>
        </div>
      `);
    });
    list.classList.remove('hidden');
  } catch {
    document.getElementById('log-loading').classList.add('hidden');
    document.getElementById('log-error').classList.remove('hidden');
  }
}

// ── Delete Item Modal ──────────────────────────────────────────────────────
function openDeleteFromModify() {
  const id   = document.getElementById('modify-item-id').value;
  const name = document.getElementById('modify-item-label').textContent;
  closeModal('modal-modify');
  openDelete(id, name);
}

function openDelete(id, name) {
  document.getElementById('delete-item-id').value = id;
  document.getElementById('delete-item-label').textContent = name;
  document.getElementById('delete-person').value = '';
  document.getElementById('delete-confirm-text').value = '';
  document.getElementById('delete-submit').disabled = true;
  hideError('delete-error');
  openModal('modal-delete');
  setTimeout(() => document.getElementById('delete-person').focus(), 100);
}

function validateDeleteConfirm() {
  const typed = document.getElementById('delete-confirm-text').value;
  document.getElementById('delete-submit').disabled = typed !== 'DELETE';
}

async function submitDelete() {
  const id     = document.getElementById('delete-item-id').value;
  const person = document.getElementById('delete-person').value.trim();
  const name   = document.getElementById('delete-item-label').textContent;

  if (!person) { showError('delete-error', 'Please enter your name.'); return; }

  const btn     = document.getElementById('delete-submit');
  const label   = document.getElementById('delete-submit-label');
  const spinner = document.getElementById('delete-spinner');
  btn.disabled  = true;
  label.textContent = 'DELETING…';
  spinner.classList.remove('hidden');
  hideError('delete-error');

  try {
    let res;
    try {
      res = await fetch('/.netlify/functions/delete-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, entered_by: person }),
      });
    } catch {
      res = null; // network failure (e.g. local preview with no backend)
    }

    // Mock mode: no backend available in local file preview
    if (!res || (!res.ok && isMockMode())) {
      inventory = inventory.filter(i => String(i.id) !== String(id));
      closeModal('modal-delete');
      showToast(`"${name}" deleted.`);
      renderInventory(inventory);
      updateStats(inventory);
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    closeModal('modal-delete');
    showToast(`"${name}" deleted.`);
    await loadInventory();
  } catch (err) {
    showError('delete-error', err.message);
    btn.disabled = false;
    label.textContent = 'DELETE ITEM';
    spinner.classList.add('hidden');
  }
}

// ── Modal helpers ──────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById(id).classList.add('flex');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.getElementById(id).classList.remove('flex');
  document.body.style.overflow = '';
}

// close modals with Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-add', 'modal-modify', 'modal-log'].forEach(id => {
      if (!document.getElementById(id).classList.contains('hidden')) closeModal(id);
    });
  }
});

// ── UI helpers ─────────────────────────────────────────────────────────────
function setLoading(prefix, loading) {
  const btn     = document.getElementById(`${prefix}-submit`);
  const label   = document.getElementById(`${prefix}-submit-label`);
  const spinner = document.getElementById(`${prefix}-spinner`);
  btn.disabled  = loading;
  spinner.classList.toggle('hidden', !loading);
  label.textContent = loading ? 'Saving…' : (prefix === 'add' ? 'Add Item' : 'Save Changes');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(id) {
  document.getElementById(id).classList.add('hidden');
}

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
