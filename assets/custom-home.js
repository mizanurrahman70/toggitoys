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
