import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./app";
import { AuthProvider } from "./auth/auth";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("The app root is missing.");

const product = (<App />) satisfies ReactElement;

createRoot(root).render(
  <BrowserRouter>
    <AuthProvider>{product}</AuthProvider>
  </BrowserRouter>,
);
