import { describe, expect, it } from "vitest";

import { iniciais } from "./MenuConta";

describe("iniciais do avatar (APP-049)", () => {
  it("usa a primeira e a última palavra do nome", () => {
    expect(iniciais("Ana Souza")).toBe("AS");
    expect(iniciais("ana maria de souza")).toBe("AS");
    expect(iniciais("operador")).toBe("O");
    expect(iniciais(undefined)).toBe("?");
  });
});
