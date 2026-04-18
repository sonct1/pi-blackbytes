import { bootstrap } from "./bootstrap.js";
import type { ExtensionAPI } from "./types/pi.js";

console.log("pi-blackbytes v0.1.0 loaded");

export default function (pi: ExtensionAPI): void {
  bootstrap(pi);
}
