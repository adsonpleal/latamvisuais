// App bootstrap — mounts React into #app. The static DBs are loaded inside
// <App/> (see useLoadDb), which renders the loading message until they arrive.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
