/**
 * YAML sub-agent loader diagnostics.
 *
 * Collects information about what the loader found, accepted, and skipped
 * during a session startup. The diagnostics object is frozen once set and
 * remains unchanged for the life of the session — consumers (e.g.
 * `/blackbytes-status`) always read the active-session snapshot rather than
 * reloading files from disk.
 */

export interface YamlSkippedFile {
  /** Basename of the skipped file (or "<directory>" for dir-level errors). */
  file: string;
  /** Human-readable reason for the skip. */
  reason: string;
  /**
   * When the skip is due to a name conflict, identifies what already owned
   * the name.
   */
  conflictWith?:
    | { source: "builtin"; name: string }
    | { source: "yaml"; name: string; file: string };
}

export interface YamlLoadedDeclaration {
  name: string;
  file: string;
}

export interface YamlDiagnostics {
  /** Absolute directory the loader scanned. */
  directory: string;
  /** Whether the directory existed at load time. */
  directoryExists: boolean;
  /** All YAML/YML filenames discovered (sorted, basenames only). */
  scannedFiles: readonly string[];
  /** Files whose declaration was accepted (in file-sort order). */
  loadedDeclarations: readonly YamlLoadedDeclaration[];
  /** Files that were skipped, with reason and (when applicable) conflict info. */
  skippedFiles: readonly YamlSkippedFile[];
}

let sessionDiagnostics: YamlDiagnostics | undefined;

export function setYamlDiagnostics(d: YamlDiagnostics): void {
  sessionDiagnostics = Object.freeze({
    ...d,
    scannedFiles: Object.freeze([...d.scannedFiles]),
    loadedDeclarations: Object.freeze([...d.loadedDeclarations]),
    skippedFiles: Object.freeze([...d.skippedFiles]),
  });
}

export function getYamlDiagnostics(): YamlDiagnostics | undefined {
  return sessionDiagnostics;
}

export function _resetYamlDiagnostics(): void {
  sessionDiagnostics = undefined;
}
