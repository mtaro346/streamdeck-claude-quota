// Registers the resolve hook so `--experimental-strip-types` runs can import
// TypeScript sources that reference sibling modules with a `.js` specifier.
// Usage: node --experimental-strip-types --import ./scripts/register-ts.mjs <entry>
import { register } from "node:module";

register("./resolve-ts.mjs", import.meta.url);
