/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ["next/core-web-vitals", "eslint:recommended"],
  plugins: ["react-hooks"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "prefer-const": "error",
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "no-console": "off",
    "@next/next/no-img-element": "off"
  },
  ignorePatterns: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "public/**",
    "next.config.js",
    "postcss.config.js",
    "tailwind.config.js",
    "next-env.d.ts",
  ],
};
