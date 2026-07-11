import React from "react";
import "./widget.css";

export function HelloWidget({ config, isPreview }) {
  return (
    <section className="example-hello-widget">
      <strong>{config.message || "Hello"}</strong>
      <small>{isPreview ? "Preview mode" : "Live plugin"}</small>
    </section>
  );
}
