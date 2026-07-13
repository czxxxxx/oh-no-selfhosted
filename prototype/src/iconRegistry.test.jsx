// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import "./setupTests.js";
import { ServiceIcon } from "./iconRegistry.jsx";

describe("ServiceIcon", () => {
  test("renders Codex with the OpenAI logomark preset", () => {
    const { container } = render(
      <ServiceIcon service={{ color: "#10a37f", iconKey: "codex", iconKind: "preset" }} />,
    );

    expect(container.querySelector(".service-icon")).toHaveAttribute("data-icon-key", "codex");
    expect(container.querySelector("svg[data-openai-logomark='true']")).not.toBeNull();
  });

  test("uses built-in marks for legacy QNAP and Snapdrop icon URLs", () => {
    const { container, rerender } = render(
      <ServiceIcon
        service={{
          color: "#c2410c",
          iconKey: "qnap",
          iconKind: "url",
          iconUrl: "/heimdall-icons/qnap.png",
        }}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();

    rerender(
      <ServiceIcon
        service={{
          color: "#047857",
          iconKey: "snapdrop",
          iconKind: "url",
          iconUrl: "/heimdall-icons/snapdrop.png",
        }}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg[data-snapdrop-logomark='true']")).not.toBeNull();
  });

  test("falls back to the built-in mark when a custom image fails", () => {
    const { container } = render(
      <ServiceIcon
        service={{
          color: "#c2410c",
          iconKey: "qnap",
          iconKind: "url",
          iconUrl: "/api/icons/missing.png",
        }}
      />,
    );

    fireEvent.error(container.querySelector("img"));

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
