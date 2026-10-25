// This file starts the product app and leaves feature work for later.
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./styles.css";

function App(): ReactElement {
  return (
    <main className="page">
      <h1>Freight Desk</h1>
      <p>The product is ready for its first feature.</p>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("The app root is missing.");
createRoot(root).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
