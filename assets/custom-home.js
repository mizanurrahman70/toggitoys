/**
 * Toggi Toys — lightweight hero slider (<tg-slider>).
 * Native CSS scroll-snap does the sliding, so swiping works even before this
 * script loads. This only adds dots, arrows, autoplay and theme-editor support.
 */
if (!customElements.get('tg-slider')) {
  class TgSlider extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-track]');
      this.slides = Array.from(this.querySelectorAll('[data-slide]'));
      this.dots = Array.from(this.querySelectorAll('[data-dot]'));
      if (!this.track || this.slides.length < 2) return;

      this.index = 0;
      this.speed = (parseInt(this.dataset.speed, 10) || 5) * 1000;
      this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.dots.forEach((dot, i) => dot.addEventListener('click', () => this.goTo(i)));
      this.querySelector('[data-prev]')?.addEventListener('click', () => this.goTo(this.index - 1));
      this.querySelector('[data-next]')?.addEventListener('click', () => this.goTo(this.index + 1));

      // Keep the active dot in sync with manual swipes.
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) this.setActive(this.slides.indexOf(entry.target));
          });
        },
        { root: this.track, threshold: 0.6 }
      );
      this.slides.forEach((slide) => this.observer.observe(slide));

      // Pause autoplay while the shopper interacts.
      ['mouseenter', 'focusin', 'touchstart'].forEach((evt) =>
        this.addEventListener(evt, () => this.stop(), { passive: true })
      );
      ['mouseleave', 'focusout'].forEach((evt) => this.addEventListener(evt, () => this.play()));

      // Theme editor: jump to the selected slide and hold it there.
      this.onBlockSelect = (event) => {
        const i = this.slides.findIndex((s) => s.dataset.blockId === event.detail.blockId);
        if (i < 0) return;
        this.stop();
        this.editorHold = true;
        this.goTo(i);
      };
      this.onBlockDeselect = () => {
        this.editorHold = false;
        this.play();
      };
      document.addEventListener('shopify:block:select', this.onBlockSelect);
      document.addEventListener('shopify:block:deselect', this.onBlockDeselect);

      this.play();
    }

    disconnectedCallback() {
      this.stop();
      this.observer?.disconnect();
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      document.removeEventListener('shopify:block:deselect', this.onBlockDeselect);
    }

    goTo(i) {
      const count = this.slides.length;
      const next = (i + count) % count;
      this.track.scrollTo({ left: this.slides[next].offsetLeft, behavior: this.reduceMotion ? 'auto' : 'smooth' });
      this.setActive(next);
    }

    setActive(i) {
      this.index = i;
      this.dots.forEach((dot, d) => dot.setAttribute('aria-current', d === i ? 'true' : 'false'));
      this.slides.forEach((slide, s) => slide.setAttribute('aria-hidden', s === i ? 'false' : 'true'));
    }

    play() {
      if (this.dataset.autoplay !== 'true' || this.reduceMotion || this.editorHold) return;
      this.stop();
      this.timer = setInterval(() => this.goTo(this.index + 1), this.speed);
    }

    stop() {
      clearInterval(this.timer);
    }
  }

  customElements.define('tg-slider', TgSlider);
}

/**
 * <tg-tabs> — switches product panels and keeps the "View all" link in sync.
 * Accessible tabs: click, Arrow keys, Home / End. Theme editor block select opens the tab.
 */
if (!customElements.get('tg-tabs')) {
  class TgTabs extends HTMLElement {
    connectedCallback() {
      this.tabs = Array.from(this.querySelectorAll('[role="tab"]'));
      this.panels = Array.from(this.querySelectorAll('[role="tabpanel"]'));
      this.viewAll = this.querySelector('[data-view-all-link]');

      this.resizeObserver = new ResizeObserver(() => this.updateThumb());
      this.resizeObserver.observe(this);

      // Scrolling tab row: thin indicator line shows scroll position.
      this.barWrap = this.querySelector('.tg-tabs__bar-wrap');
      this.track = this.querySelector('.tg-tabs__track');
      if (this.track && this.barWrap) {
        this.thumb = this.track.querySelector('.tg-tabs__thumb');
        this.barWrap.addEventListener('scroll', () => this.updateThumb(), { passive: true });
        this.track.addEventListener('pointerdown', (event) => this.startDrag(event));
        this.updateThumb();
      }

      if (this.tabs.length < 2) return;

      this.tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => this.select(i));
        tab.addEventListener('keydown', (event) => this.onKey(event, i));
      });

      this.onBlockSelect = (event) => {
        const i = this.tabs.findIndex((t) => t.dataset.blockId === event.detail.blockId);
        if (i > -1) this.select(i);
      };
      document.addEventListener('shopify:block:select', this.onBlockSelect);
    }

    disconnectedCallback() {
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      this.resizeObserver?.disconnect();
    }

    updateThumb() {
      if (!this.thumb) return;
      const { scrollWidth, clientWidth, scrollLeft } = this.barWrap;
      const overflow = scrollWidth > clientWidth + 2;
      this.track.hidden = !overflow;
      if (!overflow) return;
      const ratio = clientWidth / scrollWidth;
      this.thumb.style.width = `${ratio * 100}%`;
      this.thumb.style.transform = `translateX(${(scrollLeft / clientWidth) * 100}%)`;
    }

    /**
     * Drag the thumb (or press anywhere on the line) to scroll the tab row,
     * like a scrollbar. Works with mouse, touch and pen.
     */
    startDrag(event) {
      if (event.button > 0) return;
      event.preventDefault();
      const bar = this.barWrap;
      const trackWidth = this.track.clientWidth;
      const scale = bar.scrollWidth / trackWidth; // px of tab row per px of line

      // Pressing the line (not the thumb) first jumps so the thumb centres on the pointer.
      if (event.target !== this.thumb) {
        const x = event.clientX - this.track.getBoundingClientRect().left;
        bar.scrollLeft = x * scale - bar.clientWidth / 2;
      }

      const startX = event.clientX;
      const startScroll = bar.scrollLeft;
      this.track.classList.add('is-dragging');
      try {
        this.track.setPointerCapture(event.pointerId);
      } catch (e) {
        // Capture is optional; dragging still works while the pointer stays on the line.
      }

      const onMove = (e) => {
        bar.scrollLeft = startScroll + (e.clientX - startX) * scale;
      };
      const onUp = (e) => {
        this.track.classList.remove('is-dragging');
        if (this.track.hasPointerCapture?.(e.pointerId)) this.track.releasePointerCapture(e.pointerId);
        this.track.removeEventListener('pointermove', onMove);
        this.track.removeEventListener('pointerup', onUp);
        this.track.removeEventListener('pointercancel', onUp);
      };
      this.track.addEventListener('pointermove', onMove);
      this.track.addEventListener('pointerup', onUp);
      this.track.addEventListener('pointercancel', onUp);
    }

    onKey(event, i) {
      const last = this.tabs.length - 1;
      const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: last };
      if (!(event.key in keys)) return;
      event.preventDefault();
      const next = (keys[event.key] + this.tabs.length) % this.tabs.length;
      this.select(next);
      this.tabs[next].focus();
    }

    select(index) {
      this.tabs.forEach((tab, i) => {
        const active = i === index;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
        this.panels[i].hidden = !active;
      });
      // Scroll only the tab row (not the page) so the active tab is visible.
      const bar = this.barWrap || this.querySelector('.tg-tabs__bar-wrap');
      const tab = this.tabs[index];
      if (bar && bar.scrollWidth > bar.clientWidth) {
        bar.scrollTo({ left: tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' });
      }
      if (this.viewAll && this.panels[index].dataset.viewAll) {
        this.viewAll.href = this.panels[index].dataset.viewAll;
      }
    }
  }

  customElements.define('tg-tabs', TgTabs);
}

/**
 * <tg-carousel> — product row that scrolls sideways.
 * Contains: [data-prev] / [data-next] arrows, a [data-carousel] list and a [data-dots] container.
 * Native scroll-snap does the work (touch swipe on phones); this adds page dots,
 * arrows, and mouse drag on desktop. Rebuilds itself when resized or when its tab is shown.
 */
if (!customElements.get('tg-carousel')) {
  class TgCarousel extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-carousel]');
      if (!this.track) return;
      this.items = Array.from(this.track.children);
      this.dots = this.querySelector('[data-dots]');
      this.prevBtn = this.querySelector('[data-prev]');
      this.nextBtn = this.querySelector('[data-next]');
      this.page = 0;
      this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.track.addEventListener('scroll', () => this.update(), { passive: true });
      this.prevBtn?.addEventListener('click', () => this.goTo(this.page - 1));
      this.nextBtn?.addEventListener('click', () => this.goTo(this.page + 1));

      // Mouse drag (touch devices keep native swiping).
      this.track.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      this.track.addEventListener('dragstart', (event) => event.preventDefault());
      // A drag must not open the product under the cursor.
      this.track.addEventListener(
        'click',
        (event) => {
          if (!this.dragged) return;
          event.preventDefault();
          event.stopPropagation();
          this.dragged = false;
        },
        true
      );

      // Fires on resize and when a hidden tab panel becomes visible (width 0 -> n).
      this.resizeObserver = new ResizeObserver(() => this.build());
      this.resizeObserver.observe(this.track);
    }

    disconnectedCallback() {
      this.resizeObserver?.disconnect();
    }

    build() {
      if (!this.track.clientWidth || !this.items.length) return;
      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      const step = this.items[0].getBoundingClientRect().width + gap; // one card + gap
      const perPage = Math.max(1, Math.round((this.track.clientWidth + gap) / step));
      const pages = Math.max(1, Math.ceil(this.items.length / perPage));
      this.metrics = { step, perPage, pages };

      if (this.dots && this.dots.childElementCount !== pages) {
        this.dots.innerHTML = '';
        for (let i = 0; i < pages; i++) {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'tg-dots__dot';
          dot.setAttribute('aria-label', `Page ${i + 1} of ${pages}`);
          dot.addEventListener('click', () => this.goTo(i));
          this.dots.appendChild(dot);
        }
      }
      this.classList.toggle('is-static', pages < 2);
      if (this.dots) this.dots.hidden = pages < 2;
      this.update();
    }

    goTo(page) {
      if (!this.metrics) return;
      const { step, perPage, pages } = this.metrics;
      const target = Math.max(0, Math.min(page, pages - 1));
      this.track.scrollTo({ left: target * perPage * step, behavior: this.reduceMotion ? 'auto' : 'smooth' });
    }

    update() {
      if (!this.metrics) return;
      const { step, perPage, pages } = this.metrics;
      const { scrollLeft, scrollWidth, clientWidth } = this.track;
      const atStart = scrollLeft <= 4;
      const atEnd = scrollLeft >= scrollWidth - clientWidth - 4;
      this.page = atEnd ? pages - 1 : Math.min(pages - 1, Math.round(scrollLeft / (perPage * step)));
      this.dots?.querySelectorAll('.tg-dots__dot').forEach((dot, i) => {
        dot.setAttribute('aria-current', i === this.page ? 'true' : 'false');
      });
      if (this.prevBtn) this.prevBtn.disabled = atStart;
      if (this.nextBtn) this.nextBtn.disabled = atEnd;
    }

    onPointerDown(event) {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      const startX = event.clientX;
      const startScroll = this.track.scrollLeft;
      this.dragged = false;

      const onMove = (e) => {
        const dx = e.clientX - startX;
        if (!this.dragged && Math.abs(dx) > 6) {
          this.dragged = true;
          this.track.classList.add('is-dragging');
          try {
            this.track.setPointerCapture(e.pointerId);
          } catch (err) {
            // Capture is optional.
          }
        }
        if (this.dragged) this.track.scrollLeft = startScroll - dx;
      };
      const onUp = () => {
        this.track.removeEventListener('pointermove', onMove);
        if (!this.dragged) return;
        this.track.classList.remove('is-dragging');
        // Settle on the nearest card.
        const step = this.metrics?.step || 1;
        this.track.scrollTo({ left: Math.round(this.track.scrollLeft / step) * step, behavior: 'smooth' });
      };
      this.track.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    }
  }

  customElements.define('tg-carousel', TgCarousel);
}
