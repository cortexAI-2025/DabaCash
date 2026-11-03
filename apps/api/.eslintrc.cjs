module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { project: ["./tsconfig.json"], tsconfigRootDir: __dirname, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: { node: true, es2022: true },
  ignorePatterns: ["dist", "node_modules", ".eslintrc.cjs"],
  rules: {
    // An un-awaited promise is a lost write or a swallowed error: the one rule that matters most here.
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-var-requires": "off",
    "no-console": ["error", { allow: ["error", "warn"] }],
    eqeqeq: ["error", "always", { null: "ignore" }],
  },
  overrides: [
    { files: ["test/**/*.ts", "**/*.spec.ts"], rules: { "@typescript-eslint/no-explicit-any": "off", "no-console": "off", "@typescript-eslint/no-floating-promises": "off" /* describe()/it() return promises the runner owns */ } },
  ],
};
