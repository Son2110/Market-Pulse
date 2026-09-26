import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "_site/**"] },
  ...tseslint.configs.recommended,
);
