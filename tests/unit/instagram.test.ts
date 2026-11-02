import { describe, it, expect } from "vitest";
import { instagramHandle } from "@/lib/instagram";

describe("instagramHandle", () => {
  it("extrae el handle de una URL con barra final", () => {
    expect(instagramHandle("https://www.instagram.com/sevenmixtohurling/")).toBe(
      "@sevenmixtohurling",
    );
  });

  it("extrae el handle de una URL sin barra final", () => {
    expect(instagramHandle("https://instagram.com/sevenmixtohurling")).toBe(
      "@sevenmixtohurling",
    );
  });

  it("ignora query string", () => {
    expect(instagramHandle("https://www.instagram.com/sevenmixtohurling/?hl=es")).toBe(
      "@sevenmixtohurling",
    );
  });

  it("devuelve null si la URL no es de Instagram", () => {
    expect(instagramHandle("https://www.facebook.com/sevenmixtohurling")).toBeNull();
  });
});
