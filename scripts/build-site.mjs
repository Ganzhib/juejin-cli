import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const metadata = JSON.parse(await readFile("package.json", "utf8"));
const output = "site-dist";
await rm(output, { recursive: true, force: true });
await cp("site", output, { recursive: true });
for (const name of ["index.html", "app.js"]) {
  const path = join(output, name);
  const content = (await readFile(path, "utf8"))
    .replaceAll("{{PACKAGE_NAME}}", metadata.name)
    .replaceAll("{{VERSION}}", metadata.version);
  await writeFile(path, content);
}
await mkdir(join(output, "examples"), { recursive: true });
await cp("examples/article.md", join(output, "examples/article.md"));
await cp("skills/juejin-cli", join(output, "skill"), { recursive: true });
await writeFile(join(output, ".nojekyll"), "");
console.log(`Built GitHub Pages for ${metadata.name}@${metadata.version}`);
