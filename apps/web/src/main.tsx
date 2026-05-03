if (import.meta.env.DEV) {
  import("react-grab");
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/600.css";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
