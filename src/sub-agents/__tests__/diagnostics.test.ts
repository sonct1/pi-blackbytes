import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { _resetYamlDiagnostics, getYamlDiagnostics, setYamlDiagnostics } from "../diagnostics.js";

describe("YamlDiagnostics module", () => {
  it("getYamlDiagnostics returns undefined before set", () => {
    _resetYamlDiagnostics();
    assert.equal(getYamlDiagnostics(), undefined);
  });

  it("setYamlDiagnostics stores and getYamlDiagnostics returns it", () => {
    _resetYamlDiagnostics();
    setYamlDiagnostics({
      directory: "/tmp/sub-agents",
      directoryExists: true,
      scannedFiles: ["a.yaml", "b.yaml"],
      loadedDeclarations: [{ name: "agent-a", file: "a.yaml" }],
      skippedFiles: [{ file: "b.yaml", reason: "YAML syntax error: unexpected end" }],
    });
    const d = getYamlDiagnostics();
    assert.ok(d !== undefined);
    assert.equal(d.directory, "/tmp/sub-agents");
    assert.equal(d.directoryExists, true);
    assert.deepEqual([...d.scannedFiles], ["a.yaml", "b.yaml"]);
    assert.deepEqual([...d.loadedDeclarations], [{ name: "agent-a", file: "a.yaml" }]);
    assert.equal(d.skippedFiles.length, 1);
    assert.equal(d.skippedFiles[0].file, "b.yaml");
  });

  it("_resetYamlDiagnostics clears the stored value", () => {
    setYamlDiagnostics({
      directory: "/tmp",
      directoryExists: false,
      scannedFiles: [],
      loadedDeclarations: [],
      skippedFiles: [],
    });
    _resetYamlDiagnostics();
    assert.equal(getYamlDiagnostics(), undefined);
  });

  it("stored diagnostics are frozen (immutable)", () => {
    _resetYamlDiagnostics();
    const files = ["a.yaml"];
    setYamlDiagnostics({
      directory: "/tmp",
      directoryExists: true,
      scannedFiles: files,
      loadedDeclarations: [],
      skippedFiles: [],
    });
    const d = getYamlDiagnostics()!;
    // Mutating the original array should not affect the stored copy
    files.push("b.yaml");
    assert.equal(d.scannedFiles.length, 1);
    // The frozen arrays should not be directly mutable
    assert.throws(() => {
      (d.scannedFiles as string[]).push("c.yaml");
    });
  });
});
