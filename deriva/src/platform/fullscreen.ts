/** Pantalla completa (si el navegador lo permite). */
export function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  } catch {
    // el navegador puede no permitirlo
  }
}
