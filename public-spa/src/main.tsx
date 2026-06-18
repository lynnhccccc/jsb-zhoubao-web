import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../app/globals.css";
import FlagshipReport from "../../app/flagship-report";
import Home from "../../app/page";

function App() {
  const pathname = window.location.pathname;
  if (pathname.includes("/flagship")) return <FlagshipReport />;
  return <Home />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
