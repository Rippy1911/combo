import { describe, expect, it } from "vitest";
import { getFilesPackageVersion } from "./index.js";

describe("@combo/files", () => {
  it("exports package version", () => {
    expect(getFilesPackageVersion()).toBe("0.1.0");
  });
});
