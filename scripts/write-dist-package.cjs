const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(
  path.join(distDir, "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);
