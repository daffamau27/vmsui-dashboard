// Animasi buka/tutup popup Leaflet dari titik kapal (tip) di bawahnya.
// Popup Leaflet dibuat imperatif, jadi transisi Svelte tidak bisa ditempel.
// Kita patch L.Popup.prototype.onAdd/onRemove: saat dibuka, keyframes masuk
// di-restart otomatis oleh Leaflet; saat ditutup, kita tahan penghapusan DOM
// selama durasi outro agar animasi menyusut sempat dimainkan.
const POPUP_SELECTORS = ["fleet-leaflet-popup", "asset-leaflet-popup"];
const CLOSING_CLASS = "fleet-popup-closing";
const OUT_DURATION = 280;

let installed = false;
let closingToken = 0;

function isAnimatedPopup(popup) {
  const className = popup?.options?.className || "";

  return POPUP_SELECTORS.some((name) => className.includes(name));
}

export function enableFleetPopupTransition(L, { shouldSkipClosing } = {}) {
  if (installed) return;

  const originalOnAdd = L.Popup.prototype.onAdd;
  const originalOnRemove = L.Popup.prototype.onRemove;

  L.Popup.prototype.onAdd = function onAdd(map) {
    const result = originalOnAdd.call(this, map);

    if (isAnimatedPopup(this)) {
      const el = this.getElement();

      if (el) {
        // Batalkan state closing (mis. dibuka ulang cepat) & restart keyframes.
        delete el.dataset.fleetClosing;
        el.classList.remove(CLOSING_CLASS);

        const wrapper = el.querySelector(".leaflet-popup-content-wrapper");

        if (wrapper) {
          wrapper.style.animation = "none";
          // Paksa reflow agar animasi masuk dimulai dari awal.
          void wrapper.offsetWidth;
          wrapper.style.animation = "";
        }
      }
    }

    return result;
  };

  L.Popup.prototype.onRemove = function onRemove(map) {
    if (!isAnimatedPopup(this) || shouldSkipClosing?.() === true) {
      return originalOnRemove.call(this, map);
    }

    const el = this.getElement?.();

    if (!el || el.dataset.fleetClosing) {
      return originalOnRemove.call(this, map);
    }

    const token = String((closingToken += 1));

    el.dataset.fleetClosing = token;
    el.classList.add(CLOSING_CLASS);

    window.setTimeout(() => {
      // Lewati jika popup ini sudah dibuka kembali (token berubah).
      if (el.dataset.fleetClosing !== token) return;

      // Leaflet masih menahan DOM selama fade bawaannya (200 ms).
      // Pertahankan frame akhir outro agar fleetPopupIn tidak terpicu lagi.
      // State closing hanya di-reset oleh onAdd saat popup benar-benar dibuka ulang.
      originalOnRemove.call(this, map);
    }, OUT_DURATION);
  };

  installed = true;
}
