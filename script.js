'use strict';

/* =========================================================
   CONFIG — fill these in before going live
   ========================================================= */
const CONFIG = {
  SUPABASE_URL: 'https://qcsdzvpncatlvcudvbuh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjc2R6dnBuY2F0bHZjdWR2YnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2OTUxNzcsImV4cCI6MjEwMDI3MTE3N30.nJyR2owD8i8DXJj12FM9QgVrJuFdCCG_FO8Q-kRchA8',

  DESIGN_PRICE_TIERS: [399, 349],
  DESIGN_PRICE_FLOOR: 299,

  SHIPPING_ENDPOINT: '/api/shipping-rates',
  JNT_BASE_RATE: 120,
  LALAMOVE_BASE_RATE: 280,

  MIN_LOADER_MS: 1200,
};

/*
  Supabase tables (already created):

  create table orders (
    id uuid primary key default gen_random_uuid(),
    order_code text,
    created_at timestamptz default now(),
    shirt_size text,       -- quick-glance summary, e.g. "S Black, M White"
    shirt_color text,      -- no longer used — size+colour now live per design below
    designs jsonb,          -- each entry: { design_id, label, personalize, price, size, color }
    subtotal numeric,
    shipping_method text,
    shipping_rush boolean,
    shipping_rate numeric,
    total numeric,
    first_name text,
    last_name text,
    phone text,
    email text,
    messenger text,
    address jsonb
  );

  create table feedback (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    message text
  );

  create table email_signups (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    email text
  );
*/

/* =========================================================
   CONSTANTS
   ========================================================= */

const DESIGN_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

const DESIGN_LIBRARY = [];
for (let i = 1; i <= 20; i++) {
  DESIGN_LIBRARY.push({
    id: `W${i}`,
    mode: 'white',
    img: `WhiteCollection/W${i}.png`,
    label: `W${i}`,
  });
}
for (let i = 1; i <= 20; i++) {
  DESIGN_LIBRARY.push({
    id: `B${i}`,
    mode: 'black',
    img: `BlackCollection/B${i}.png`,
    label: `B${i}`,
  });
}

const DESIGN_BY_ID = Object.fromEntries(
  DESIGN_LIBRARY.map((d) => [d.id, d])
);

const STEP_ORDER = ['build', 'library', 'review', 'details'];
const STEP_LABELS = {
  build: 'Build your shirt',
  library: 'Pick your designs',
  review: 'Review & ship',
  details: 'Your details',
};
const BACK_MAP = {
  build: 'home',
  library: 'build',
  review: 'library',
  details: 'review',
};

/* =========================================================
   STATE
   ========================================================= */
const state = {
  pendingShirt: { size: null, color: null }, // shirt spec currently being chosen on the Build screen
  libraryMode: null,
  cart: [], // each item: { designId, personalize, included, size, color }
  reviewIndex: 0,
  shippingRates: null,
  customer: null,
  orderId: null,
  editingCartIndex: null, // set while editing an existing cart item's size/colour, else null
};

function setShirtSize(size) {
  state.pendingShirt.size = size;
}

function setShirtColor(color) {
  state.pendingShirt.color = color;
}

function setLibraryMode(mode) {
  state.libraryMode = mode;
}

function setReviewIndex(index) {
  state.reviewIndex = index;
}

function setShippingRates(rates) {
  state.shippingRates = rates;
}

function addToCartItem(designId, personalize) {
  state.cart.push({
    designId,
    personalize,
    included: true,
    size: state.pendingShirt.size,
    color: state.pendingShirt.color,
  });
}

function removeFromCartItem(designId) {
  state.cart = state.cart.filter((i) => i.designId !== designId);
}

function updateCartItemPersonalize(designId, personalize) {
  const item = state.cart.find((i) => i.designId === designId);
  if (item) {
    item.personalize = personalize;
  }
}

function updateCartItemIncluded(designId, included) {
  const item = state.cart.find((i) => i.designId === designId);
  if (item) {
    item.included = included;
  }
}

function resetState() {
  state.pendingShirt = { size: null, color: null };
  state.libraryMode = null;
  state.cart = [];
  state.reviewIndex = 0;
  state.shippingRates = null;
  state.customer = null;
  state.orderId = null;
  state.editingCartIndex = null;
}

/* =========================================================
   DOM CACHE
   ========================================================= */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const dom = {
  loader: $('#loader'),
  progress: $('#progress'),
  progressFill: $('#progressFill'),
  progressLabel: $('#progressLabel'),
  backBtn: $('#backBtn'),
  toast: $('#toast'),

  sizeChips: $('#sizeChips'),
  colorPick: $('#colorPick'),
  continueBuildBtn: $('#continueBuildBtn'),

  modeToggle: $('#modeToggle'),
  libraryGrid: $('#libraryGrid'),
  cartStrip: $('#cartStrip'),
  cartCtaLabel: $('#cartCtaLabel'),
  reviewBtn: $('#reviewBtn'),

  sheetBackdrop: $('#sheetBackdrop'),
  sheet: $('#personalizeSheet'),
  sheetTitle: $('#sheetTitle'),
  sheetSub: $('#sheetSub'),
  sheetPreview: $('#sheetPreview'),
  personalizeInput: $('#personalizeInput'),
  sheetSkip: $('#sheetSkip'),
  sheetConfirm: $('#sheetConfirm'),

  addPopup: $('#addPopup'),
  addPopupClose: $('#addPopupClose'),

  recapChip: $('#recapChip'),
  recapText: $('#recapText'),
  prevBtn: $('#prevBtn'),
  nextBtn: $('#nextBtn'),
  carouselStage: $('#carouselStage'),
  carouselDots: $('#carouselDots'),
  summaryList: $('#summaryList'),
  subtotalAmt: $('#subtotalAmt'),
  totalAmt: $('#totalAmt'),
  rushToggle: $('#rushToggle'),
  shipOptions: $('#shipOptions'),
  jntRateEl: $('#jntRate'),
  jntEtaEl: $('#jntEta'),
  lalamoveRateEl: $('#lalamoveRate'),
  lalamoveEtaEl: $('#lalamoveEta'),
  rateNote: $('#rateNote'),
  continueReviewBtn: $('#continueReviewBtn'),

  detailsForm: $('#detailsForm'),
  formError: $('#formError'),
  submitOrderBtn: $('#submitOrderBtn'),

  doneName: $('#doneName'),
  doneOrderId: $('#doneOrderId'),
  doneMessengerCopy: $('#doneMessengerCopy'),
  doneSummary: $('#doneSummary'),
  restartBtn: $('#restartBtn'),

  feedbackInput: $('#feedbackInput'),
  feedbackSubmit: $('#feedbackSubmit'),
  feedbackStatus: $('#feedbackStatus'),
  updatesEmail: $('#updatesEmail'),
  updatesSubmit: $('#updatesSubmit'),
  updatesStatus: $('#updatesStatus'),
};

/* =========================================================
   HELPERS
   ========================================================= */

function formatPHP(n) {
  return '₱' + Math.round(n).toLocaleString('en-PH');
}

function priceForPosition(index) {
  return CONFIG.DESIGN_PRICE_TIERS[index] ?? CONFIG.DESIGN_PRICE_FLOOR;
}

function bundleSubtotal(includedCount) {
  let total = 0;
  for (let i = 0; i < includedCount; i++) {
    total += priceForPosition(i);
  }
  return total;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => dom.toast.classList.remove('show'), 2600);
}

let toastTimer = null;

/* =========================================================
   DATA FUNCTIONS
   ========================================================= */

function getDesignsByMode(mode) {
  return DESIGN_LIBRARY.filter((d) => d.mode === mode);
}

function isDesignInCart(designId) {
  return state.cart.some((i) => i.designId === designId);
}

function getIncludedItems() {
  return state.cart.filter((i) => i.included);
}

function getShippingSelection() {
  const checked = $('input[name="shipping"]:checked', dom.shipOptions);
  return checked ? checked.value : 'jnt';
}

/* =========================================================
   NAVIGATION
   ========================================================= */

let currentScreen = 'home';

function goTo(name) {
  $$('.screen').forEach((s) =>
    s.classList.toggle('active', s.dataset.screen === name)
  );
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (name !== 'library') {
    closeAddedPopup();
  }

  if (name === 'home' || name === 'done' || name === 'feedback') {
    dom.progress.hidden = true;
  } else {
    dom.progress.hidden = false;
    const idx = STEP_ORDER.indexOf(name);
    dom.progressFill.style.width = `${((idx + 1) / STEP_ORDER.length) * 100}%`;
    dom.progressLabel.textContent = `Step ${idx + 1} of ${STEP_ORDER.length} · ${STEP_LABELS[name]}`;
  }

  currentScreen = name;
}

function handleBack() {
  if (currentScreen === 'build' && state.editingCartIndex !== null) {
    state.editingCartIndex = null;
    goTo('review');
    return;
  }
  goTo(BACK_MAP[currentScreen] || 'home');
}

/* =========================================================
   BUILD SCREEN
   ========================================================= */

function checkBuildReady() {
  dom.continueBuildBtn.disabled = !(state.pendingShirt.size && state.pendingShirt.color);
}

function handleSizeClick(e) {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  setShirtSize(chip.dataset.size);
  $$('.chip', dom.sizeChips).forEach((c) =>
    c.classList.toggle('active', c === chip)
  );
  checkBuildReady();
}

function handleColorClick(e) {
  const card = e.target.closest('.swatch-card--pick');
  if (!card) return;
  setShirtColor(card.dataset.color);
  $$('.swatch-card--pick', dom.colorPick).forEach((c) =>
    c.classList.toggle('is-selected', c === card)
  );
  checkBuildReady();
}

// editingIndex: pass a cart index to edit that design's shirt, or null to build a brand-new design
function enterBuildScreen(editingIndex) {
  state.editingCartIndex = editingIndex ?? null;

  const item = editingIndex != null ? state.cart[editingIndex] : null;
  state.pendingShirt.size = item ? item.size : null;
  state.pendingShirt.color = item ? item.color : null;

  $$('.chip', dom.sizeChips).forEach((c) =>
    c.classList.toggle('active', c.dataset.size === state.pendingShirt.size)
  );
  $$('.swatch-card--pick', dom.colorPick).forEach((c) =>
    c.classList.toggle('is-selected', c.dataset.color === state.pendingShirt.color)
  );
  checkBuildReady();

  dom.continueBuildBtn.textContent = state.editingCartIndex !== null
    ? 'Save changes'
    : 'Choose your designs';

  goTo('build');
}

function handleEditBuildClick() {
  if (!state.cart[state.reviewIndex]) return;
  enterBuildScreen(state.reviewIndex);
}

function handleContinueBuild() {
  if (state.editingCartIndex !== null) {
    const idx = state.editingCartIndex;
    const item = state.cart[idx];
    if (item) {
      item.size = state.pendingShirt.size;
      item.color = state.pendingShirt.color;
    }
    state.editingCartIndex = null;
    setReviewIndex(idx);
    renderCarouselSlide();
    renderDots();
    renderSummary();
    goTo('review');
    return;
  }

  setLibraryMode(state.pendingShirt.color);
  renderModeToggle();
  renderLibraryGrid();
  goTo('library');
}

/* =========================================================
   DESIGN LIBRARY
   ========================================================= */

function renderModeToggle() {
  $$('.mode-btn', dom.modeToggle).forEach((b) =>
    b.classList.toggle('active', b.dataset.mode === state.libraryMode)
  );
}

function handleModeToggleClick(e) {
  const btn = e.target.closest('.mode-btn');
  if (!btn) return;
  setLibraryMode(btn.dataset.mode);
  renderModeToggle();
  renderLibraryGrid();
}

function paintDesignNode(container, design) {
  container.innerHTML = '';

  const img = document.createElement('img');
  img.src = design.img;
  img.alt = design.label;
  img.loading = 'lazy';

  img.addEventListener('error', () => {
    img.remove();
    const placeholder = document.createElement('div');
    placeholder.className = 'design-placeholder';
    placeholder.textContent = design.label;
    container.appendChild(placeholder);
  });

  container.appendChild(img);
}

function renderLibraryGrid() {
  dom.libraryGrid.innerHTML = '';
  const items = getDesignsByMode(state.libraryMode);
  const frag = document.createDocumentFragment();

  items.forEach((design) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'design-card';
    card.dataset.designId = design.id;

    paintDesignNode(card, design);

    const add = document.createElement('span');
    add.className = 'design-card-add';
    add.textContent = '+';
    add.setAttribute('aria-label', `Add ${design.label} to picks`);
    card.appendChild(add);

    frag.appendChild(card);
  });

  dom.libraryGrid.appendChild(frag);
  refreshGridPickedStates();
}

function refreshGridPickedStates() {
  const pickedIds = new Set(state.cart.map((i) => i.designId));
  $$('.design-card', dom.libraryGrid).forEach((card) => {
    card.classList.toggle('is-picked', pickedIds.has(card.dataset.designId));
  });
}

function handleDesignCardClick(e) {
  const card = e.target.closest('.design-card');
  if (!card) return;
  const designId = card.dataset.designId;

  if (isDesignInCart(designId)) {
    showToast('Already in your picks — remove it from the tray to change it.');
    return;
  }

  const design = DESIGN_BY_ID[designId];
  openPersonalizeSheet(design, null);
}

/* =========================================================
   PERSONALIZATION
   ========================================================= */

let pendingDesign = null;
let editingDesignId = null;

function openPersonalizeSheet(design, existingText) {
  pendingDesign = design;
  editingDesignId = existingText === null ? null : design.id;

  dom.sheetTitle.textContent = editingDesignId
    ? 'Edit your text'
    : 'Make it yours';
  dom.sheetSub.textContent =
    'Add a name or word to print on this design — totally optional.';

  dom.sheetPreview.innerHTML = '';
  paintDesignNode(dom.sheetPreview, design);

  dom.personalizeInput.value = existingText || '';
  dom.sheetConfirm.textContent = editingDesignId
    ? 'Save'
    : 'Add to my picks';

  dom.sheetBackdrop.hidden = false;
  dom.sheet.hidden = false;
  dom.personalizeInput.focus({ preventScroll: true });
}

function closeSheet() {
  dom.sheetBackdrop.hidden = true;
  dom.sheet.hidden = true;
  pendingDesign = null;
  editingDesignId = null;
}

function handleSheetBackdropClick() {
  closeSheet();
}

function handleSheetSkip() {
  if (!pendingDesign) return closeSheet();
  if (editingDesignId) {
    updateCartItemPersonalize(editingDesignId, '');
    renderCartDock();
    if (currentScreen === 'review') renderCarouselSlide();
  } else {
    addToCartAndRender(pendingDesign, '');
  }
  closeSheet();
}

function handleSheetConfirm() {
  if (!pendingDesign) return closeSheet();
  const val = dom.personalizeInput.value.trim();

  if (editingDesignId) {
    updateCartItemPersonalize(editingDesignId, val);
    renderCartDock();
    if (currentScreen === 'review') renderCarouselSlide();
  } else {
    addToCartAndRender(pendingDesign, val);
  }

  closeSheet();
}

/* =========================================================
   CART
   ========================================================= */

let hasShownAddPopup = false;

function addToCartAndRender(design, personalize) {
  addToCartItem(design.id, personalize);
  renderCartDock();
  refreshGridPickedStates();

  if (!hasShownAddPopup) {
    hasShownAddPopup = true;
    dom.addPopup.hidden = false;
  }
}

function closeAddedPopup() {
  dom.addPopup.hidden = true;
}

function renderCartDock() {
  dom.cartStrip.innerHTML = '';

  state.cart.forEach((item) => {
    const design = DESIGN_BY_ID[item.designId];
    const thumb = document.createElement('div');
    thumb.className = 'cart-thumb';
    thumb.dataset.designId = item.designId;
    paintDesignNode(thumb, design);

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'cart-thumb-remove';
    rm.setAttribute('aria-label', `Remove ${design.label}`);
    rm.textContent = '×';
    thumb.appendChild(rm);

    dom.cartStrip.appendChild(thumb);
  });

  const plus = document.createElement('div');
  plus.className = 'cart-plus';
  plus.innerHTML = '<span>+</span>';
  dom.cartStrip.appendChild(plus);

  dom.reviewBtn.disabled = state.cart.length === 0;
  dom.cartCtaLabel.textContent = state.cart.length
    ? `Review ${state.cart.length} pick${state.cart.length !== 1 ? 's' : ''}`
    : 'Review your picks';
}

function handleCartStripClick(e) {
  const rm = e.target.closest('.cart-thumb-remove');
  if (rm) {
    const designId = rm.closest('.cart-thumb').dataset.designId;
    removeFromCartItem(designId);
    renderCartDock();
    refreshGridPickedStates();
    return;
  }

  if (e.target.closest('.cart-plus')) {
    enterBuildScreen(null);
  }
}

function handleReviewClick() {
  if (!state.cart.length) return;
  buildReviewScreen();
  goTo('review');
}

/* =========================================================
   REVIEW
   ========================================================= */

function updateRecapChip() {
  const item = state.cart[state.reviewIndex];
  if (!item) {
    dom.recapText.textContent = 'No design selected';
    return;
  }
  dom.recapText.textContent = `${item.size} · ${item.color === 'black' ? 'Black' : 'White'} · 240GSM`;
}

function buildReviewScreen() {
  setReviewIndex(0);
  renderCarouselSlide();
  renderDots();
  renderSummary();
  loadShippingRates();
}

function renderCarouselSlide() {
  const item = state.cart[state.reviewIndex];
  dom.carouselStage.innerHTML = '';

  updateRecapChip();

  if (!item) {
    dom.prevBtn.disabled = true;
    dom.nextBtn.disabled = true;
    return;
  }

  const design = DESIGN_BY_ID[item.designId];
  const slide = document.createElement('div');
  slide.className = 'design-slide';
  paintDesignNode(slide, design);

  const includedList = getIncludedItems();
  const posInOrder = includedList.indexOf(item);
  const priceLabel = posInOrder === -1 ? 'Not included' : formatPHP(priceForPosition(posInOrder));

  const controls = document.createElement('div');
  controls.className = 'slide-controls';
  controls.innerHTML = `
    <label class="slide-checkbox">
      <input type="checkbox" id="includeCheckbox" ${item.included ? 'checked' : ''} aria-label="Include this design in my order">
    </label>
    <span class="slide-price">${priceLabel}</span>
  `;
  slide.appendChild(controls);

  const nameRow = document.createElement('div');
  nameRow.className = 'slide-name';
  nameRow.innerHTML = `<span>${item.personalize ? `&ldquo;${escapeHtml(item.personalize)}&rdquo;` : 'No custom text &mdash; tap to add'}</span>`;
  nameRow.addEventListener('click', () => openPersonalizeSheet(design, item.personalize));
  slide.appendChild(nameRow);

  dom.carouselStage.appendChild(slide);

  const disableNav = state.cart.length <= 1;
  dom.prevBtn.disabled = disableNav;
  dom.nextBtn.disabled = disableNav;
}

function renderDots() {
  dom.carouselDots.innerHTML = '';
  state.cart.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'dot' + (i === state.reviewIndex ? ' active' : '');
    dom.carouselDots.appendChild(dot);
  });
}

function handleCarouselChange(e) {
  if (e.target.id !== 'includeCheckbox') return;
  const item = state.cart[state.reviewIndex];
  if (item) {
    updateCartItemIncluded(item.designId, e.target.checked);
  }
  renderSummary();
}

function handlePrevBtn() {
  if (!state.cart.length) return;
  setReviewIndex((state.reviewIndex - 1 + state.cart.length) % state.cart.length);
  renderCarouselSlide();
  renderDots();
}

function handleNextBtn() {
  if (!state.cart.length) return;
  setReviewIndex((state.reviewIndex + 1) % state.cart.length);
  renderCarouselSlide();
  renderDots();
}

function renderSummary() {
  dom.summaryList.innerHTML = '';
  const included = getIncludedItems();

  if (!included.length) {
    dom.summaryList.innerHTML = '<p class="field-hint" style="margin:0">No designs selected yet &mdash; check at least one to continue.</p>';
  }

  included.forEach((item, idx) => {
    const design = DESIGN_BY_ID[item.designId];
    const specLabel = `${item.size} ${item.color === 'black' ? 'Black' : 'White'}`;
    const row = document.createElement('div');
    row.className = 'summary-item';
    row.innerHTML = `
      <span class="summary-item-name">${design.label} &middot; ${specLabel}${item.personalize ? ` &middot; &ldquo;${escapeHtml(item.personalize)}&rdquo;` : ''}</span>
      <span>${formatPHP(priceForPosition(idx))}</span>
    `;
    dom.summaryList.appendChild(row);
  });

  updatePricing();
}

function updatePricing() {
  const includedCount = getIncludedItems().length;
  const subtotal = bundleSubtotal(includedCount);
  dom.subtotalAmt.textContent = formatPHP(subtotal);

  const method = getShippingSelection();
  const rates = state.shippingRates || {
    jnt: { rate: CONFIG.JNT_BASE_RATE },
    lalamove: { rate: CONFIG.LALAMOVE_BASE_RATE },
  };
  const shippingCost = rates[method] ? rates[method].rate : 0;
  dom.totalAmt.textContent = formatPHP(subtotal + shippingCost);

  dom.continueReviewBtn.disabled = includedCount === 0;
}

/* =========================================================
   SHIPPING
   ========================================================= */

function handleShippingChange() {
  updatePricing();
}

function handleRushToggle() {
  const jntCard = $('.ship-card[data-courier="jnt"]', dom.shipOptions);
  const jntRadio = $('input[value="jnt"]', dom.shipOptions);
  const lalamoveRadio = $('input[value="lalamove"]', dom.shipOptions);

  if (dom.rushToggle.checked) {
    lalamoveRadio.checked = true;
    jntRadio.disabled = true;
    if (jntCard) {
      jntCard.style.opacity = '0.45';
      jntCard.style.pointerEvents = 'none';
    }
    dom.rateNote.textContent = 'Rush picked &mdash; Lalamove only. Final rate is confirmed at your delivery address.';
  } else {
    jntRadio.disabled = false;
    if (jntCard) {
      jntCard.style.opacity = '';
      jntCard.style.pointerEvents = '';
    }
    dom.rateNote.textContent = 'Rates shown are estimates. Final rate is confirmed at your delivery address.';
  }

  updatePricing();
}

async function fetchLiveShippingRates() {
  try {
    const res = await fetch(CONFIG.SHIPPING_ENDPOINT);
    if (!res.ok) throw new Error('shipping backend not connected yet');
    const data = await res.json();
    return {
      jnt: { ...data.jnt, estimated: false },
      lalamove: { ...data.lalamove, estimated: false },
    };
  } catch (e) {
    return {
      jnt: { rate: CONFIG.JNT_BASE_RATE, eta: 'Standard · 2–3 days', estimated: true },
      lalamove: { rate: CONFIG.LALAMOVE_BASE_RATE, eta: 'Rush · same day, Metro Manila', estimated: true },
    };
  }
}

async function loadShippingRates() {
  const rates = await fetchLiveShippingRates();
  setShippingRates(rates);

  dom.jntRateEl.textContent = formatPHP(rates.jnt.rate);
  dom.jntEtaEl.textContent = rates.jnt.eta || '';
  dom.lalamoveRateEl.textContent = formatPHP(rates.lalamove.rate);
  dom.lalamoveEtaEl.textContent = rates.lalamove.eta || '';
  dom.rateNote.textContent =
    rates.jnt.estimated || rates.lalamove.estimated
      ? 'Rates shown are estimates. Final rate is confirmed at your delivery address.'
      : 'Live courier rates. Final rate is confirmed at your delivery address.';

  updatePricing();
}

function handleContinueReview() {
  goTo('details');
}

/* =========================================================
   DETAILS
   ========================================================= */

function collectFormData() {
  const f = new FormData(dom.detailsForm);
  return Object.fromEntries(f.entries());
}

function validateForm(d) {
  if (!d.firstName?.trim() || !d.lastName?.trim()) {
    return 'Add your first and last name.';
  }
  if (!/^(\+63|0)9\d{9}$/.test((d.phone || '').replace(/\s|-/g, ''))) {
    return 'Enter a valid PH mobile number, e.g. 0917 123 4567.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((d.email || '').trim())) {
    return 'Enter a valid email address.';
  }
  if (
    !d.addrStreet?.trim() ||
    !d.addrBarangay?.trim() ||
    !d.addrCity?.trim() ||
    !d.addrProvince?.trim() ||
    !d.addrZip?.trim()
  ) {
    return 'Fill in your full delivery address so your courier can find you.';
  }
  return null;
}

function handleDetailsSubmit(e) {
  e.preventDefault();
  dom.formError.textContent = '';

  const data = collectFormData();
  const err = validateForm(data);
  if (err) {
    dom.formError.textContent = err;
    return;
  }

  dom.submitOrderBtn.disabled = true;
  dom.submitOrderBtn.textContent = 'Placing your order…';

  const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();
  const includedItems = getIncludedItems();
  const method = getShippingSelection();
  const shippingRate =
    state.shippingRates?.[method]?.rate ??
    (method === 'jnt' ? CONFIG.JNT_BASE_RATE : CONFIG.LALAMOVE_BASE_RATE);
  const subtotal = bundleSubtotal(includedItems.length);

  const specSummary = [...new Set(
    includedItems.map((i) => `${i.size} ${i.color === 'black' ? 'Black' : 'White'}`)
  )].join(', ');

  const payload = {
    order_code: orderId,
    shirt_size: specSummary,
    designs: includedItems.map((i, idx) => ({
      design_id: i.designId,
      label: DESIGN_BY_ID[i.designId].label,
      personalize: i.personalize,
      price: priceForPosition(idx),
      size: i.size,
      color: i.color,
    })),
    subtotal,
    shipping_method: method,
    shipping_rush: dom.rushToggle.checked,
    shipping_rate: shippingRate,
    total: subtotal + shippingRate,
    first_name: data.firstName.trim(),
    last_name: data.lastName.trim(),
    phone: data.phone.trim(),
    email: data.email.trim(),
    messenger: (data.messenger || '').trim(),
    address: {
      street: data.addrStreet.trim(),
      barangay: data.addrBarangay.trim(),
      city: data.addrCity.trim(),
      province: data.addrProvince.trim(),
      zip: data.addrZip.trim(),
    },
  };

  submitOrder(payload)
    .then(() => {
      state.orderId = orderId;
      state.customer = data;
      populateDoneScreen(payload);
      goTo('done');
    })
    .catch((err) => {
      console.error(err);
      dom.formError.textContent =
        "We couldn't send that — check your connection and try again.";
    })
    .finally(() => {
      dom.submitOrderBtn.disabled = false;
      dom.submitOrderBtn.textContent = 'Place my order';
    });
}

/* =========================================================
   SUPABASE
   ========================================================= */

let supabaseClient = null;
try {
  if (window.supabase && CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    supabaseClient = window.supabase.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_ANON_KEY
    );
  }
} catch (e) {
  console.warn('Supabase not configured yet:', e);
}

async function submitOrder(payload) {
  if (!supabaseClient) {
    console.info('[demo mode — Supabase not configured] order payload:', payload);
    return { ok: true, demo: true };
  }
  
  // 1. Save order to Supabase
  const { data, error } = await supabaseClient.from('orders').insert([payload]);
  if (error) throw error;

async function submitOrder(payload) {
  if (!supabaseClient) {
    console.info('[demo mode — Supabase not configured] order payload:', payload);
    return { ok: true, demo: true };
  }
  const { data, error } = await supabaseClient.from('orders').insert([payload]);
  if (error) throw error;
  return { ok: true, data };
}

/* =========================================================
   CONFIRMATION
   ========================================================= */

function populateDoneScreen(payload) {
  dom.doneName.textContent = payload.first_name;
  dom.doneOrderId.textContent = `Order #${state.orderId}`;
  dom.doneMessengerCopy.textContent = payload.messenger ? ' and Messenger' : '';

  dom.doneSummary.innerHTML = `
    <span>${payload.shirt_size} &middot; ${payload.designs.length} design${payload.designs.length !== 1 ? 's' : ''}</span>
    <span>${payload.shipping_method === 'jnt' ? 'J&T Express' : 'Lalamove'}${payload.shipping_rush ? ' · Rush' : ''} to ${payload.address.city}, ${payload.address.province}</span>
    <span>Total: ${formatPHP(payload.total)}</span>
  `;
}

function handleRestart() {
  resetState();

  $$('.chip', dom.sizeChips).forEach((c) => c.classList.remove('active'));
  $$('.swatch-card--pick', dom.colorPick).forEach((c) =>
    c.classList.remove('is-selected')
  );
  checkBuildReady();
  dom.continueBuildBtn.textContent = 'Choose your designs';

  dom.detailsForm.reset();
  dom.rushToggle.checked = false;
  dom.cartStrip.innerHTML = '';
  dom.libraryGrid.innerHTML = '';

  hasShownAddPopup = false;
  closeAddedPopup();

  goTo('home');
}

/* =========================================================
   FEEDBACK
   ========================================================= */

async function handleFeedbackSubmit() {
  const text = dom.feedbackInput.value.trim();
  if (!text) {
    dom.feedbackStatus.textContent = 'Type something first — even one line helps.';
    return;
  }

  dom.feedbackSubmit.disabled = true;
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from('feedback')
        .insert([{ message: text }]);
      if (error) throw error;
    } else {
      console.info('[demo mode — Supabase not configured] feedback:', text);
    }
    dom.feedbackStatus.textContent = 'Thanks for the feedback!';
    dom.feedbackInput.value = '';
  } catch (err) {
    console.error(err);
    dom.feedbackStatus.textContent = "Couldn't send that — try again in a bit.";
  } finally {
    dom.feedbackSubmit.disabled = false;
  }
}

async function handleUpdatesSubmit() {
  const email = dom.updatesEmail.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    dom.updatesStatus.textContent = 'Enter a valid email address.';
    return;
  }

  dom.updatesSubmit.disabled = true;
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from('email_signups')
        .insert([{ email }]);
      if (error) throw error;
    } else {
      console.info('[demo mode — Supabase not configured] update signup:', email);
    }
    dom.updatesStatus.textContent = "You're on the list!";
    dom.updatesEmail.value = '';
  } catch (err) {
    console.error(err);
    dom.updatesStatus.textContent = "Couldn't send that — try again in a bit.";
  } finally {
    dom.updatesSubmit.disabled = false;
  }
}

/* =========================================================
   GLOBAL EVENT LISTENERS (registered once)
   ========================================================= */

function registerAllListeners() {
  dom.backBtn.addEventListener('click', handleBack);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'go-home') goTo('home');
    if (action === 'start') enterBuildScreen(null);
    if (action === 'edit-build') handleEditBuildClick();
    if (action === 'go-feedback') goTo('feedback');
  });

  dom.sizeChips.addEventListener('click', handleSizeClick);
  dom.colorPick.addEventListener('click', handleColorClick);
  dom.continueBuildBtn.addEventListener('click', handleContinueBuild);

  dom.modeToggle.addEventListener('click', handleModeToggleClick);
  dom.libraryGrid.addEventListener('click', handleDesignCardClick);

  dom.sheetBackdrop.addEventListener('click', handleSheetBackdropClick);
  dom.sheetSkip.addEventListener('click', handleSheetSkip);
  dom.sheetConfirm.addEventListener('click', handleSheetConfirm);

  dom.addPopupClose.addEventListener('click', closeAddedPopup);
  dom.cartStrip.addEventListener('click', handleCartStripClick);
  dom.reviewBtn.addEventListener('click', handleReviewClick);

  dom.carouselStage.addEventListener('change', handleCarouselChange);
  dom.prevBtn.addEventListener('click', handlePrevBtn);
  dom.nextBtn.addEventListener('click', handleNextBtn);

  dom.shipOptions.addEventListener('change', handleShippingChange);
  dom.rushToggle.addEventListener('change', handleRushToggle);
  dom.continueReviewBtn.addEventListener('click', handleContinueReview);

  dom.detailsForm.addEventListener('submit', handleDetailsSubmit);
  dom.restartBtn.addEventListener('click', handleRestart);

  dom.feedbackSubmit.addEventListener('click', handleFeedbackSubmit);
  dom.updatesSubmit.addEventListener('click', handleUpdatesSubmit);
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function init() {
  registerAllListeners();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.addEventListener('load', () => {
    const wait = reduceMotion ? 150 : CONFIG.MIN_LOADER_MS;
    setTimeout(() => dom.loader.classList.add('is-hidden'), wait);
  });

  goTo('home');

  window.APP_STATE = state;
}

init();
