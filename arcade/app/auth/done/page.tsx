"use client";

import { useEffect } from "react";

export default function AuthDonePage() {
  useEffect(() => {
    if (window.opener) {
      window.close();
    } else {
      window.location.replace("/arcade");
    }
  }, []);
  return (
    <main style={{ textAlign: "center", paddingTop: 120 }}>
      <p>Signed in. You can close this window.</p>
    </main>
  );
}
