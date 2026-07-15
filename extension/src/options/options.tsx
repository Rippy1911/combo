import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function OptionsApp() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Combo Settings</h1>
      <p>Settings page stub — BYOK configuration lands in Phase B.</p>
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <OptionsApp />
    </StrictMode>,
  );
}
