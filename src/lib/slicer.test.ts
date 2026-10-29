import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parse3mf, parseDuration, parseGcode, SlicerError } from "./slicer";

describe("parseDuration", () => {
  it.each([
    ["1h 10m 5s", 70],
    ["11h 40m", 700],
    ["1d 2h 3m", 1563],
    ["35m 20s", 35],
  ])("%s", (s, min) => expect(parseDuration(s)).toBe(min));
});

describe("parseGcode", () => {
  it("PrusaSlicer / Orca multi-extruder header", () => {
    const g = [
      "G1 X0",
      "; filament used [g] = 12.34, 0.00, 5.6",
      "; estimated printing time (normal mode) = 1h 10m 5s",
      "; filament_colour = #FFFFFF;#000000;#FF0000",
      "; filament_type = PLA;PLA;PETG",
    ].join("\n");
    const r = parseGcode(g);
    expect(r.timeMin).toBe(70);
    expect(r.filaments).toEqual([
      { grams: 12.34, color: "#FFFFFF", type: "PLA" },
      { grams: 5.6, color: "#FF0000", type: "PETG" },
    ]);
  });

  it("Bambu Studio header", () => {
    const g = "; model printing time: 1h 5m 2s; total estimated time: 1h 12m 9s\n; total filament weight [g] : 16.11\n";
    const r = parseGcode(g);
    expect(r.timeMin).toBe(72);
    expect(r.filaments[0].grams).toBe(16.11);
  });

  it("rejects G-code without slicer comments", () => {
    expect(() => parseGcode("G1 X0 Y0\nG1 X1")).toThrow(SlicerError);
  });
});

describe("parse3mf", () => {
  it("reads slice_info.config", () => {
    const xml = `<config><plate><metadata key="prediction" value="4200"/>
      <filament id="1" type="PLA" color="#00AE42" used_m="3.1" used_g="9.20"/>
      <filament id="2" type="PLA" color="#111111" used_m="0" used_g="0"/></plate></config>`;
    const zip = zipSync({ "Metadata/slice_info.config": strToU8(xml), "3D/3dmodel.model": strToU8("<model/>") });
    expect(parse3mf(zip)).toEqual({ timeMin: 70, filaments: [{ grams: 9.2, color: "#00AE42", type: "PLA" }] });
  });

  it("explains how to export when the 3MF is not sliced", () => {
    const zip = zipSync({ "3D/3dmodel.model": strToU8("<model/>") });
    expect(() => parse3mf(zip)).toThrow(/Export plate sliced as 3MF/);
  });
});
