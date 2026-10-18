/**
 * Toggi Toys — product card actions
 *  - Cart icon: adds a single-variant product with AJAX and opens Dawn's cart drawer / notification.
 *  - "Buy now": plain form POST with return_to=/checkout (works without JS, not intercepted here).
 *  - Quick view: [data-tg-quick-view="handle"] opens a dialog built from /products/<handle>.js
 *    with gallery, price, options, quantity, Add to cart and Buy now.
 * Strings and the money format come from window.tgTheme (printed by the section).
 */
(() => {
  if (window.tgProductCard) return;
  window.tgProductCard = true;

  const theme = () => window.tgTheme || {};
  const t = (key, fallback) => (theme().strings && theme().strings[key]) || fallback;
  const routes = () => window.routes || {};
  const rootUrl = () => (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const icon = {
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    minus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };

  /* ---------- Money (uses the shop's own money format, e.g. "Tk {{amount}}") ---------- */
  function formatMoney(cents) {
    const format = String(theme().moneyFormat || '{{amount}}').replace(/<[^>]*>/g, '');
    const value = (Number(cents) || 0) / 100;
    const fmt = (decimals, thousands = ',', point = '.') => {
      const [int, frac] = value.toFixed(decimals).split('.');
      return int.replace(/\B(?=(\d{3})+(?!\d))/g, thousands) + (frac ? point + frac : '');
    };
    const map = {
      amount: () => fmt(2),
      amount_no_decimals: () => fmt(0),
      amount_with_comma_separator: () => fmt(2, '.', ','),
      amount_no_decimals_with_comma_separator: () => fmt(0, '.', ','),
      amount_with_apostrophe_separator: () => fmt(2, "'", '.'),
      amount_with_space_separator: () => fmt(2, ' ', ','),
      amount_no_decimals_with_space_separator: () => fmt(0, ' ', ','),
    };
    return format.replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => (map[key] || map.amount)());
  }

  /* ---------- Small toast for errors / confirmations ---------- */
  let toastTimer;
  function toast(message) {
    let el = document.querySelector('.tg-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'tg-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  /* ---------- Cart ---------- */
  /**
   * Adds a variant via /cart/add and refreshes Dawn's cart drawer or notification.
   * options.redirect → go there after adding (Buy now). options.beforeRender → e.g. close the dialog.
   */
  async function addToCart(variantId, quantity = 1, trigger, options = {}) {
    const cart = options.redirect ? null : document.querySelector('cart-notification') || document.querySelector('cart-drawer');
    const body = { id: Number(variantId), quantity: Number(quantity) || 1 };
    if (cart) {
      body.sections = cart.getSectionsToRender().map((section) => section.id);
      body.sections_url = window.location.pathname;
      if (trigger && cart.setActiveElement) cart.setActiveElement(trigger);
    }

    const response = await fetch(routes().cart_add_url || `${rootUrl()}cart/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || data.status) throw new Error(data.description || data.message || t('error', 'Error'));

    if (options.redirect) {
      window.location.href = options.redirect;
      return data;
    }
    if (options.beforeRender) options.beforeRender();

    if (!cart) {
      // Cart type "page": go to the cart.
      window.location.href = routes().cart_url || `${rootUrl()}cart`;
      return data;
    }
    cart.classList.contains('is-empty') && cart.classList.remove('is-empty');
    cart.renderContents(data);
    // Let other Dawn components (cart icon bubble, etc.) know. PUB_SUB_EVENTS is a global const, not on window.
    if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'tg-product-card', productVariantId: body.id, cartData: data });
    }
    return data;
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.classList.toggle('is-loading', busy);
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    if ('disabled' in button) button.disabled = busy;
  }

  // Card cart icon (single-variant products): intercept the add form. "Buy now" (return_to) posts normally.
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest && event.target.closest('form[data-tg-cart-form]');
    if (!form) return;
    const submitter = event.submitter;
    if (submitter && submitter.name === 'return_to') return;
    event.preventDefault();

    setBusy(submitter, true);
    try {
      await addToCart(form.querySelector('[name="id"]').value, 1, submitter);
      if (submitter) {
        submitter.classList.add('is-added');
        setTimeout(() => submitter.classList.remove('is-added'), 1600);
      }
    } catch (error) {
      toast(error.message);
    } finally {
      setBusy(submitter, false);
    }
  });

  /* ---------- Quick view ---------- */
  const QuickView = {
    dialog: null,
    product: null,
    variant: null,
    selected: [],
    trigger: null,

    build() {
      const dialog = document.createElement('dialog');
      dialog.className = 'tg-qv';
      dialog.setAttribute('aria-labelledby', 'TgQuickViewTitle');
      dialog.innerHTML = `
        <div class="tg-qv__panel">
          <button type="button" class="tg-qv__close" aria-label="${esc(t('close', 'Close'))}">${icon.close}</button>
          <div class="tg-qv__body" data-body></div>
        </div>`;
      // Click on the backdrop (outside the panel) closes.
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
      dialog.querySelector('.tg-qv__close').addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => {
        document.documentElement.classList.remove('tg-qv-open');
        if (this.trigger && document.contains(this.trigger)) this.trigger.focus();
      });
      document.body.appendChild(dialog);
      this.dialog = dialog;
    },

    async open(handle, trigger) {
      if (!this.dialog) this.build();
      this.trigger = trigger;
      const body = this.dialog.querySelector('[data-body]');
      body.innerHTML = '<div class="tg-qv__loading"><span class="tg-spinner" aria-hidden="true"></span></div>';
      if (!this.dialog.open) this.dialog.showModal();
      document.documentElement.classList.add('tg-qv-open');

      try {
        const response = await fetch(`${rootUrl()}products/${encodeURIComponent(handle)}.js`);
        if (!response.ok) throw new Error(response.status);
        this.render(await response.json());
      } catch (error) {
        const url = trigger && trigger.getAttribute('href');
        body.innerHTML = `<p class="tg-qv__error">${esc(t('error', 'Something went wrong.'))}
          ${url ? `<a class="tg-link" href="${esc(url)}">${esc(t('viewDetails', 'View full details'))} &rarr;</a>` : ''}</p>`;
      }
    },

    sized(src, width) {
      if (!src) return '';
      return `${src}${src.includes('?') ? '&' : '?'}width=${width}`;
    },

    optionNames(product) {
      return (product.options || []).map((option) => (typeof option === 'string' ? option : option.name));
    },

    render(product) {
      this.product = product;
      const names = this.optionNames(product);
      const hasOptions = !(product.variants.length === 1 && names.length === 1 && names[0] === 'Title');
      this.variant = product.variants.find((v) => v.available) || product.variants[0];
      this.selected = [...(this.variant.options || [])];

      const images = (product.images || []).slice(0, 8);
      const description = (product.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const ELLIPSIS = String.fromCharCode(8230);
      const shortText = description.split(' ').slice(0, 45).join(' ') + (description.split(' ').length > 45 ? ELLIPSIS : '');
      const url = product.url || `${rootUrl()}products/${product.handle}`;

      const optionsHtml = hasOptions
        ? names
            .map((name, index) => {
              const values = [...new Set(product.variants.map((v) => v.options[index]))];
              return `
              <fieldset class="tg-qv__option" data-index="${index}">
                <legend>${esc(name)}: <span data-selected>${esc(this.selected[index])}</span></legend>
                <div class="tg-qv__values">
                  ${values
                    .map(
                      (value) =>
                        `<button type="button" class="tg-qv__value" data-value="${esc(value)}" aria-pressed="${
                          value === this.selected[index]
                        }">${esc(value)}</button>`
                    )
                    .join('')}
                </div>
              </fieldset>`;
            })
            .join('')
        : '';

      const body = this.dialog.querySelector('[data-body]');
      body.innerHTML = `
        <div class="tg-qv__grid">
          <div class="tg-qv__gallery">
            <div class="tg-qv__main">
              ${images[0] ? `<img data-main src="${esc(this.sized(images[0], 900))}" alt="${esc(product.title)}" width="900" height="900">` : ''}
              <span class="tg-qv__badge" data-badge hidden></span>
            </div>
            ${
              images.length > 1
                ? `<div class="tg-qv__thumbs">${images
                    .map(
                      (src, i) =>
                        `<button type="button" class="tg-qv__thumb" data-src="${esc(src)}" aria-label="Image ${i + 1}" aria-current="${
                          i === 0
                        }"><img src="${esc(this.sized(src, 160))}" alt="" loading="lazy" width="80" height="80"></button>`
                    )
                    .join('')}</div>`
                : ''
            }
          </div>
          <div class="tg-qv__info">
            ${product.vendor ? `<p class="tg-qv__vendor">${esc(product.vendor)}</p>` : ''}
            <h2 class="tg-qv__title" id="TgQuickViewTitle">${esc(product.title)}</h2>
            <div class="tg-qv__price" data-price></div>
            ${shortText ? `<p class="tg-qv__desc">${esc(shortText)}</p>` : ''}
            ${optionsHtml}
            <div class="tg-qv__qty">
              <span class="tg-qv__label">${esc(t('quantity', 'Quantity'))}</span>
              <div class="tg-qv__stepper">
                <button type="button" data-step="-1" aria-label="-">${icon.minus}</button>
                <input type="number" min="1" value="1" inputmode="numeric" aria-label="${esc(t('quantity', 'Quantity'))}" data-qty>
                <button type="button" data-step="1" aria-label="+">${icon.plus}</button>
              </div>
            </div>
            <div class="tg-qv__buttons">
              <button type="button" class="tg-btn tg-qv__add" data-add>${esc(t('addToCart', 'Add to cart'))}</button>
              <button type="button" class="tg-btn tg-btn--orange tg-qv__buy" data-buy>${esc(t('buyNow', 'Buy now'))}</button>
            </div>
            <p class="tg-qv__msg" role="status" data-msg></p>
            <a class="tg-link tg-qv__details" href="${esc(url)}">${esc(t('viewDetails', 'View full details'))} &rarr;</a>
          </div>
        </div>`;

      this.bind(body);
      this.update();
      body.querySelector('[data-add]').focus({ preventScroll: true });
    },

    bind(body) {
      body.querySelectorAll('.tg-qv__thumb').forEach((thumb) => {
        thumb.addEventListener('click', () => this.showImage(thumb.dataset.src));
      });
      body.querySelectorAll('.tg-qv__option').forEach((fieldset) => {
        const index = Number(fieldset.dataset.index);
        fieldset.querySelectorAll('.tg-qv__value').forEach((button) => {
          button.addEventListener('click', () => {
            this.selected[index] = button.dataset.value;
            this.update();
          });
        });
      });
      const qty = body.querySelector('[data-qty]');
      body.querySelectorAll('[data-step]').forEach((button) => {
        button.addEventListener('click', () => {
          qty.value = Math.max(1, (parseInt(qty.value, 10) || 1) + Number(button.dataset.step));
        });
      });
      body.querySelector('[data-add]').addEventListener('click', (event) => this.submit(event.currentTarget, false));
      body.querySelector('[data-buy]').addEventListener('click', (event) => this.submit(event.currentTarget, true));
    },

    showImage(src) {
      const main = this.dialog.querySelector('[data-main]');
      if (!main || !src) return;
      main.src = this.sized(src, 900);
      this.dialog.querySelectorAll('.tg-qv__thumb').forEach((thumb) => {
        thumb.setAttribute('aria-current', thumb.dataset.src === src ? 'true' : 'false');
      });
    },

    update() {
      const product = this.product;
      const variant =
        product.variants.find((v) => v.options.every((value, i) => value === this.selected[i])) || null;
      this.variant = variant;
      const body = this.dialog.querySelector('[data-body]');

      // Options: pressed state + mark values with no available variant.
      body.querySelectorAll('.tg-qv__option').forEach((fieldset) => {
        const index = Number(fieldset.dataset.index);
        fieldset.querySelector('[data-selected]').textContent = this.selected[index];
        fieldset.querySelectorAll('.tg-qv__value').forEach((button) => {
          const value = button.dataset.value;
          button.setAttribute('aria-pressed', value === this.selected[index] ? 'true' : 'false');
          const available = product.variants.some(
            (v) => v.available && v.options[index] === value && v.options.every((val, i) => i === index || val === this.selected[i])
          );
          button.classList.toggle('is-unavailable', !available);
        });
      });

      // Price + discount badge.
      const priceEl = body.querySelector('[data-price]');
      const badge = body.querySelector('[data-badge]');
      if (variant) {
        const onSale = variant.compare_at_price > variant.price;
        priceEl.innerHTML = `<span class="tg-qv__now">${esc(formatMoney(variant.price))}</span>${
          onSale ? `<s class="tg-qv__was">${esc(formatMoney(variant.compare_at_price))}</s>` : ''
        }`;
        if (badge) {
          badge.hidden = !onSale;
          if (onSale) badge.textContent = `-${Math.round(((variant.compare_at_price - variant.price) * 100) / variant.compare_at_price)}%`;
        }
        if (variant.featured_image && variant.featured_image.src) this.showImage(variant.featured_image.src);
      } else {
        priceEl.innerHTML = `<span class="tg-qv__now">${esc(t('unavailable', 'Unavailable'))}</span>`;
        if (badge) badge.hidden = true;
      }

      // Buttons.
      const add = body.querySelector('[data-add]');
      const buy = body.querySelector('[data-buy]');
      const canBuy = Boolean(variant && variant.available);
      add.disabled = !canBuy;
      buy.disabled = !canBuy;
      add.textContent = canBuy ? t('addToCart', 'Add to cart') : variant ? t('soldOut', 'Sold out') : t('unavailable', 'Unavailable');
      body.querySelector('[data-msg]').textContent = '';
    },

    async submit(button, buyNow) {
      if (!this.variant) return;
      const body = this.dialog.querySelector('[data-body]');
      const qty = Math.max(1, parseInt(body.querySelector('[data-qty]').value, 10) || 1);
      const message = body.querySelector('[data-msg]');
      setBusy(button, true);
      message.textContent = '';
      try {
        await addToCart(this.variant.id, qty, this.trigger, {
          redirect: buyNow ? theme().checkoutUrl || '/checkout' : null,
          beforeRender: () => this.dialog.close(),
        });
      } catch (error) {
        message.textContent = error.message;
      } finally {
        setBusy(button, false);
        if (this.variant && !this.variant.available) button.disabled = true;
      }
    },
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest && event.target.closest('[data-tg-quick-view]');
    if (!trigger || event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return; // allow open-in-new-tab
    if (typeof HTMLDialogElement !== 'function') return; // very old browser → follow the product link
    event.preventDefault();
    QuickView.open(trigger.dataset.tgQuickView, trigger);
  });
})();
