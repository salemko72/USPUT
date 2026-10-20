import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import App from "./App";
import "./styles.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="boot-screen">
          <h1>Vratimo se na pravi put.</h1>
          <p>Aplikacija se nije ispravno učitala. Probaj je osvježiti.</p>
          <button
            className="button dark"
            onClick={() => window.location.reload()}
          >
            Osvježi stranicu
          </button>
        </main>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
