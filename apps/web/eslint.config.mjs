import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      // Pre-existing patterns the team accepts; real bugs stay errors.
      "react/no-unescaped-entities": "off",
    },
  },
  { ignores: [".next/**", "out/**", "android/**", "node_modules/**"] },
];

export default config;
