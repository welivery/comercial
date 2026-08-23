import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist", "node_modules", "scripts", "supabase/functions"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Lo esencial de hooks: el orden de los hooks es un error real.
      "react-hooks/rules-of-hooks": "error",
      // Dependencias de effects: útil como aviso, no bloquea el build.
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Bordes con datos externos (Supabase/CSV/HubSpot) usan any a propósito.
      "@typescript-eslint/no-explicit-any": "off",
      // Variables sin usar: aviso (y permite prefijar con _ para ignorar a propósito).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  }
)
