import { describe, expect, it } from "vitest";

import { alternarFabrica, fabricasDe } from "./fabricas";

describe("filtro de várias fábricas (27/10)", () => {
  it("tocar põe ou tira a fábrica; Todas limpa", () => {
    expect(alternarFabrica("", "AQA")).toBe("AQA");
    expect(alternarFabrica("AQA", "COL")).toBe("AQA,COL");
    expect(alternarFabrica("AQA,COL", "AQA")).toBe("COL");
    expect(alternarFabrica("AQA,COL", "")).toBe("");
    expect(fabricasDe("AQA,COL")).toEqual(["AQA", "COL"]);
    expect(fabricasDe(undefined)).toEqual([]);
  });
});
