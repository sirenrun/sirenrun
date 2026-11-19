import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/.next/**", "**/dist/**", "**/next-env.d.ts", "target/**", ".anchor/**"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.strict],
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    extends: [nextPlugin.configs["core-web-vitals"], reactHooks.configs.flat.recommended],
    settings: { next: { rootDir: "app/" } },
  },
]);
