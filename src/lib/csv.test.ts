import { describe, expect, it } from "vitest";
import { num, parseCsv, toCsv } from "./csv";

describe("csv", () => {
  it("round-trips quotes, commas, newlines, JSON and accents", () => {
    const materials = JSON.stringify([{ name: "PLA, \"Preto\"", grams: 12.5 }]);
    const text = toCsv(["name", "note", "materials"], [["Café", "line 1\nline 2", materials], ["Plain", "", "[]"]]);
    expect(parseCsv(text)).toEqual([
      { name: "Café", note: "line 1\nline 2", materials },
      { name: "Plain", note: "", materials: "[]" },
    ]);
  });

  it("reads semicolon files with decimal commas (Excel, PT locale)", () => {
    const rows = parseCsv("name;unitCost\r\nKeyring;0,35\r\n");
    expect(rows).toEqual([{ name: "Keyring", unitCost: "0,35" }]);
    expect(num(rows[0].unitCost)).toBe(0.35);
  });
});
