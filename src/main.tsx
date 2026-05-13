import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { useLayoutStore } from "./store/layoutStore";
import { useSimulationStore } from "./store/simulationStore";
import { useUiStore } from "./store/uiStore";

declare global {
  interface Window {
    __RMFS_TEST__?: {
      layout: typeof useLayoutStore;
      ui: typeof useUiStore;
      simulation: typeof useSimulationStore;
    };
  }
}

if (import.meta.env.DEV) {
  window.__RMFS_TEST__ = {
    layout: useLayoutStore,
    ui: useUiStore,
    simulation: useSimulationStore
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
