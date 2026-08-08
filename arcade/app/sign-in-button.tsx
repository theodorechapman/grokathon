"use client";

export function SignInButton({ variant = "nav" }: { variant?: "nav" | "big" }) {
  function openPopup(e: React.MouseEvent) {
    if (window.matchMedia("(pointer: coarse), (max-width: 600px)").matches) return;
    e.preventDefault();
    const w = 500;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      "/api/auth/login",
      "nova-x-auth",
      `width=${w},height=${h},left=${left},top=${top}`
    );
    if (!popup) {
      window.location.href = "/api/auth/login";
      return;
    }
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        window.location.reload();
      }
    }, 500);
  }

  return (
    <a
      href="/api/auth/login"
      onClick={openPopup}
      className={variant === "nav" ? "navSegment" : "bigSignIn"}
    >
      Sign in with 𝕏
    </a>
  );
}
