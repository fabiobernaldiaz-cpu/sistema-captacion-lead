/* ══════════════════════════════════════════════════════════════
   Configuración del sitio. Se carga en el <head> de todas las páginas
   (pesa nada y marca <html class="js"> antes de pintar, para que las
   animaciones de entrada no parpadeen).
   ══════════════════════════════════════════════════════════════ */
window.RN_CONFIG = {
  // Carpeta de la API propia (PHP + SQLite), desde la raíz del dominio
  api: "/api",

  // Si cambias las categorías de cookies, sube la versión: se vuelve a pedir
  // el consentimiento a todo el mundo.
  consentVersion: "2026-10",
  consentDays: 365,

  // Barra superior de la promoción. Pon una fecha (AAAA-MM-DD) para que se
  // oculte sola a partir de ese día; null = siempre visible.
  promoEndsAt: null,

  // Pixel de Meta (Facebook/Instagram Ads). Vacío = no se carga nada y el
  // banner no muestra la categoría "Marketing". Si lo rellenas, solo se
  // activa para quien acepte esa categoría.
  metaPixelId: ""
};
document.documentElement.className += " js";
