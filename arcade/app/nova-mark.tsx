export function NovaMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="novaGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7ff0e1" />
          <stop offset="1" stopColor="#b79bff" />
        </linearGradient>
      </defs>
      <path
        d="M16 1 L19.6 12.4 L31 16 L19.6 19.6 L16 31 L12.4 19.6 L1 16 L12.4 12.4 Z"
        fill="url(#novaGrad)"
      />
      <circle cx="25.5" cy="6.5" r="1.6" fill="#eafffa" />
    </svg>
  );
}
