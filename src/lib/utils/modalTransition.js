import { cubicOut } from "svelte/easing";

// Modal transition: masuk/keluar lewat ujung kanan sambil membesar/mengecil.
// Saat keluar, opacity dipertahankan penuh sampai hampir tiba di ujung kanan
// (baru memudar di 30% terakhir) agar tidak menghilang di tengah jalan.
// `axis`/`sign` memungkinkan arah vertikal (mis. pergantian vessel: atas/bawah).
export function slideScale(
  node,
  { intro, axis = "x", sign = 1, distance = 480, start = 0.6, fadeAt = 0.3, duration = 280 } = {}
) {
  return {
    duration,
    easing: cubicOut,
    css: (t) => {
      const progress = t;

      const offset = distance * sign * (1 - progress);
      const scaleValue = start + (1 - start) * progress;

      let opacity = 1;

      if (intro) {
        opacity = progress;
      } else if (progress < fadeAt) {
        opacity = progress / fadeAt;
      }

      const transform =
        axis === "y"
          ? `translateY(${offset}px) scale(${scaleValue})`
          : `translateX(${offset}px) scale(${scaleValue})`;

      return `transform: ${transform}; opacity: ${opacity};`;
    }
  };
}

// Panel masuk dari titik kapal (koordinat client `from`) menuju posisi dock-nya.
// Jika `from` tidak tersedia, jatuh ke perilaku masuk dari kanan.
export function panelEnter(
  node,
  { from = null, fallbackDistance = 200, start = 0.85, duration = 220 } = {}
) {
  // Ukur rect SEKALI saat init (elemen sudah di posisi akhir/dock, belum
  // ter-transform). Mengukur di dalam css(t) akan membaca posisi yang sedang
  // bergerak sehingga offset menyusut sendiri tiap frame.
  let dx0 = fallbackDistance;
  let dy0 = 0;

  if (from) {
    const rect = node.getBoundingClientRect();

    dx0 = from.x - (rect.left + rect.width / 2);
    dy0 = from.y - (rect.top + rect.height / 2);
  }

  return {
    duration,
    easing: cubicOut,
    css: (t) => {
      const scaleValue = start + (1 - start) * t;
      const opacity = t;

      const dx = dx0 * (1 - t);
      const dy = dy0 * (1 - t);

      return `transform: translate(${dx}px, ${dy}px) scale(${scaleValue}); opacity: ${opacity};`;
    }
  };
}
