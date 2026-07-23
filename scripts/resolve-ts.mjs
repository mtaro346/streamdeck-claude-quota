// Maps relative `./foo.js` specifiers to `./foo.ts` when only the TS file
// exists on disk, so Node's type-stripping can load TS-internal imports that
// follow the NodeNext `.js` convention.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
	if (/^\.\.?\//.test(specifier) && specifier.endsWith(".js")) {
		const tsSpecifier = specifier.replace(/\.js$/, ".ts");
		const tsUrl = new URL(tsSpecifier, context.parentURL);
		if (existsSync(fileURLToPath(tsUrl))) {
			return next(tsSpecifier, context);
		}
	}
	return next(specifier, context);
}
