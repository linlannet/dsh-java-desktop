export function install_keyboard_inset(): () => void {
  const viewport = typeof window !== "undefined" ? window.visualViewport : null;
  if (!viewport) return () => undefined;

  const update = () => {
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
  };

  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  update();

  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
  };
}