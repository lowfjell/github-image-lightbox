import { describe, expect, test } from "bun:test";
import { isSelfImageLink } from "../../src/links";

const page = "https://github.com/octo/app";

describe("isSelfImageLink", () => {
  test("camo image linked to itself", () => {
    const camo = "https://camo.githubusercontent.com/431d2b/68747470733a2f2f";
    expect(isSelfImageLink(camo, camo, page)).toBe(true);
  });

  test("user attachment linked to itself", () => {
    const asset = "https://github.com/user-attachments/assets/0f1e2d3c-aaaa-bbbb-cccc-123456789abc";
    expect(isSelfImageLink(asset, asset, page)).toBe(true);
  });

  test("relative readme image: blob link around raw src", () => {
    expect(isSelfImageLink("/octo/app/blob/main/docs/shot.png", "/octo/app/raw/main/docs/shot.png", page)).toBe(true);
  });

  test("blob link with ?raw=true", () => {
    expect(
      isSelfImageLink(
        "https://github.com/octo/app/blob/main/shot.png?raw=true",
        "https://github.com/octo/app/raw/main/shot.png",
        page,
      ),
    ).toBe(true);
  });

  test("badge that links to a CI page is not a self link", () => {
    expect(
      isSelfImageLink("https://github.com/octo/app/actions", "https://github.com/octo/app/workflows/CI/badge.svg", page),
    ).toBe(false);
  });

  test("image linking to a different image is not a self link", () => {
    expect(isSelfImageLink("/octo/app/raw/main/big.png", "/octo/app/raw/main/thumb.png", page)).toBe(false);
  });

  test("blob/raw mapping only applies on github.com", () => {
    expect(
      isSelfImageLink("https://example.com/a/b/blob/x.png", "https://example.com/a/b/raw/x.png", page),
    ).toBe(false);
  });

  test("javascript: links are never self links", () => {
    expect(isSelfImageLink("javascript:alert(1)", "javascript:alert(1)", page)).toBe(false);
  });

  test("hash differences are ignored", () => {
    expect(isSelfImageLink("/octo/app/raw/main/a.png#light", "/octo/app/raw/main/a.png", page)).toBe(true);
  });
});
