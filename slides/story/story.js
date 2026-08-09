(() => {
  const teethGroup = document.querySelector(".teeth");
  const wheel = document.querySelector(".wheel");
  const payoff = document.querySelector("#payoff");
  if (!teethGroup || !wheel) return;

  // 35 teeth + one missing gap — the classic “trigger wheel” silhouette.
  const count = 36;
  const inner = 62;
  const outer = 78;
  const half = 3.2;
  const skip = 0; // missing tooth at angle 0

  for (let i = 0; i < count; i++) {
    if (i === skip) continue;
    const a = ((i / count) * Math.PI * 2) - Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tx = -s;
    const ty = c;
    const points = [
      `${(inner * c + half * tx).toFixed(2)},${(inner * s + half * ty).toFixed(2)}`,
      `${(outer * c + half * tx).toFixed(2)},${(outer * s + half * ty).toFixed(2)}`,
      `${(outer * c - half * tx).toFixed(2)},${(outer * s - half * ty).toFixed(2)}`,
      `${(inner * c - half * tx).toFixed(2)},${(inner * s - half * ty).toFixed(2)}`,
    ].join(" ");
    const tooth = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    tooth.setAttribute("points", points);
    tooth.setAttribute("class", "tooth");
    teethGroup.appendChild(tooth);
  }

  if (!payoff || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    wheel.classList.add("is-alive");
    return;
  }

  const io = new IntersectionObserver(
    ([entry]) => {
      wheel.classList.toggle("is-alive", entry.isIntersecting);
    },
    { threshold: 0.45 },
  );
  io.observe(payoff);
})();
