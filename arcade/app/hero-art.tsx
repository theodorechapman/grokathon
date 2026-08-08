const STARS: [number, number, number, number][] = [
  [60, 80, 1.6, 0], [180, 190, 1, 1.2], [290, 60, 1.3, 2.1], [400, 250, 1, 0.4],
  [520, 110, 1.8, 1.7], [640, 320, 1, 2.6], [730, 70, 1.2, 0.9], [850, 210, 1, 1.4],
  [960, 100, 1.5, 2.3], [1080, 260, 1, 0.2], [1150, 60, 1.4, 1.9], [120, 330, 1, 2.8],
  [340, 400, 1.2, 0.7], [580, 430, 1, 1.5], [820, 410, 1.3, 2.4], [1040, 380, 1, 0.5],
  [220, 480, 1, 1.1], [470, 30, 1, 2.9], [910, 30, 1, 0.8], [700, 180, 2, 0.3],
];

export function HeroArt() {
  return (
    <div className="cosmos" aria-hidden="true">
      <div className="nebula nebulaA" />
      <div className="nebula nebulaB" />
      <div className="vortex" />
      <div className="core" />
      <svg
        viewBox="0 0 1200 520"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        {STARS.map(([x, y, r, d], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill="#dff3ff"
            className="tw"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </svg>
    </div>
  );
}
