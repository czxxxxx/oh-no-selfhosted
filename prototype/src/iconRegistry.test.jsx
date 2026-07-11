// @vitest-environment jsdom
import { render } from "@testing-library/react";
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
});
