export function HeroArt() {
  return (
    <svg
      className="heroArt"
      viewBox="0 0 1200 520"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1526" />
          <stop offset="0.65" stopColor="#0f2233" />
          <stop offset="1" stopColor="#123a3d" />
        </linearGradient>
        <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2dd4bf" stopOpacity="0" />
          <stop offset="1" stopColor="#2dd4bf" stopOpacity="0.35" />
        </linearGradient>
        <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>

      <rect width="1200" height="520" fill="url(#sky)" />

      {[
        [90, 60, 1.6], [210, 130, 1], [340, 40, 1.3], [460, 100, 1], [560, 55, 1.8],
        [700, 140, 1], [810, 70, 1.4], [930, 120, 1], [1050, 50, 1.7], [1150, 150, 1],
        [150, 210, 1], [420, 190, 1.2], [640, 220, 1], [880, 200, 1.3], [1110, 230, 1],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#cfe9ff" opacity={0.5 + (i % 3) * 0.2} />
      ))}

      <g filter="url(#soft)" opacity="0.5">
        <ellipse cx="220" cy="120" rx="150" ry="38" fill="#1d3a54" />
        <ellipse cx="980" cy="90" rx="180" ry="42" fill="#1d3a54" />
        <ellipse cx="620" cy="60" rx="130" ry="30" fill="#16304a" />
      </g>

      <g opacity="0.75">
        {[0, 1, 2].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={950 + col * 58}
              y={58 + row * 27}
              width={48}
              height={18}
              rx={5}
              fill={["#f87171", "#fbbf24", "#4ade80"][row]}
              opacity={0.7}
            />
          ))
        )}
        <circle cx="1052" cy="196" r="8" fill="#e8f6ff" />
        <circle cx="1034" cy="216" r="4.5" fill="#e8f6ff" opacity="0.4" />
        <circle cx="1018" cy="233" r="3" fill="#e8f6ff" opacity="0.2" />
        <rect x="1042" y="248" width="84" height="11" rx="5.5" fill="#e8f6ff" opacity="0.85" />
      </g>

      <rect y="330" width="1200" height="190" fill="url(#glow)" />
      <g stroke="#2dd4bf" strokeWidth="1" opacity="0.4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={`h${i}`} x1="0" y1={360 + i * 32} x2="1200" y2={360 + i * 32} />
        ))}
        {[-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <line key={`v${i}`} x1={600 + i * 40} y1="345" x2={600 + i * 260} y2="520" />
        ))}
      </g>
    </svg>
  );
}
