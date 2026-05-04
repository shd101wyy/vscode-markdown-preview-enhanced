// Lightbox: click-to-enlarge image preview for Markdown Preview Enhanced
(function () {
  'use strict';

  var overlay;
  var lightboxImg;

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'mpe-lightbox-overlay';
    lightboxImg = document.createElement('img');
    overlay.appendChild(lightboxImg);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', close);
  }

  function open(src) {
    if (!overlay) {
      createOverlay();
    }
    lightboxImg.src = src;
    // Force reflow before adding the visible class for the CSS transition
    overlay.style.display = 'flex';
    void overlay.offsetHeight;
    overlay.classList.add('mpe-lightbox-visible');
  }

  function close() {
    if (!overlay) {
      return;
    }
    overlay.classList.remove('mpe-lightbox-visible');
    // After transition, hide completely
    setTimeout(function () {
      if (!overlay.classList.contains('mpe-lightbox-visible')) {
        overlay.style.display = 'none';
        lightboxImg.src = '';
      }
    }, 200);
  }

  // Use event delegation so dynamically updated content is handled
  document.addEventListener(
    'click',
    function (e) {
      var img = e.target;
      if (
        img &&
        img.tagName === 'IMG' &&
        !img.closest('.mpe-lightbox-overlay')
      ) {
        var src = img.getAttribute('src');
        if (src) {
          e.preventDefault();
          e.stopPropagation();
          open(src);
        }
      }
    },
    true,
  );

  document.addEventListener('keydown', function (e) {
    if (
      e.key === 'Escape' &&
      overlay &&
      overlay.classList.contains('mpe-lightbox-visible')
    ) {
      e.preventDefault();
      close();
    }
  });
})();
