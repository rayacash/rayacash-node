// Los ejemplos del README, de examples/ y de scripts/ tienen que compilar (y uno, correr).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isolate } from "./helpers.ts";

isolate();

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const README = readFileSync(path.join(ROOT, "README.md"), "utf8");
const BLOCKS = [...README.matchAll(/```js\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
const TMP = mkdtempSync(path.join(tmpdir(), "rayacash-readme-"));

after(() => rmSync(TMP, { recursive: true, force: true }));

/** `node --check` sobre un archivo .mjs: solo la sintaxis, sin resolver imports. */
function checkSyntax(file: string): void {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("el README tiene ejemplos de JavaScript", () => {
  assert.ok(BLOCKS.length >= 10, `solo hay ${BLOCKS.length} bloques`);
});

BLOCKS.forEach((block, index) => {
  test(`el bloque ${index} del README compila`, () => {
    const file = path.join(TMP, `bloque-${index}.mjs`);
    writeFileSync(file, block);
    checkSyntax(file);
  });
});

/** Los imports del principio de un ejemplo (hasta la primera línea de código), con sus blancos. */
function importHeader(block: string): string[] {
  const lines = block.split("\n");
  const first = lines.findIndex((line) => /^import\b/.test(line));
  if (first === -1) return [];
  const header: string[] = [];
  let open = false; // adentro de un import de varias líneas
  for (const line of lines.slice(first)) {
    if (open || /^import\b/.test(line)) {
      header.push(line);
      open = !line.trimEnd().endsWith(";");
    } else if (line.trim() === "") {
      header.push(line);
    } else {
      break;
    }
  }
  while (header.length > 0 && header[header.length - 1]?.trim() === "") header.pop();
  return header;
}

test("los imports de cada ejemplo van juntos, sin líneas en blanco entre ellos", () => {
  // Como en la doc web (/api): un solo bloque de imports, aunque mezcle node: y rayacash.
  BLOCKS.forEach((block, index) => {
    const header = importHeader(block);
    assert.ok(
      header.every((line) => line.trim() !== ""),
      `el bloque ${index} separa sus imports:\n${header.join("\n")}`,
    );
  });
});

test("el ejemplo de tests sin red corre de verdad", async () => {
  const blocks = BLOCKS.filter((block) => block.includes("fetch: fakeFetch"));
  assert.equal(blocks.length, 1);
  const sdk = pathToFileURL(path.join(ROOT, "src", "index.ts")).href;
  const file = path.join(TMP, "offline.mjs");
  writeFileSync(file, (blocks[0] ?? "").replace('from "rayacash"', `from "${sdk}"`));
  await import(pathToFileURL(file).href); // no sale a la red: usa un fetch falso
});

test("el README y los ejemplos usan los nombres de Raya Connect, no los deprecados", () => {
  // Los de la 1.1.0 (client.checkout, Checkout…) solo aparecen en la oración para quien viene de
  // la 1.1.0, al final de «Raya Connect». Las guías para IA salen de este README.
  const legacy =
    /\bcheckout\.orders\b|\bclient\.checkout\b|\bCheckout(?:Status|\w*Params|\w*Service)?\b/;
  BLOCKS.forEach((block, index) => {
    assert.doesNotMatch(block, legacy, `bloque ${index}`);
  });
  for (const name of readdirSync(path.join(ROOT, "examples"))) {
    assert.doesNotMatch(readFileSync(path.join(ROOT, "examples", name), "utf8"), legacy, name);
  }
  const lines = README.split("\n").filter((line) => legacy.test(line));
  assert.equal(lines.length, 1, lines.join("\n"));
  assert.ok(
    lines[0]?.endsWith(
      "Si venís de la 1.1.0: `client.checkout.orders` y `Checkout` siguen andando como alias " +
        "deprecados hasta la 2.0.0; en código nuevo usá los nombres de arriba.",
    ),
  );
  const connect = README.slice(
    README.indexOf("\n## Raya Connect\n"),
    README.indexOf("\n## Errores\n"),
  );
  assert.ok(connect.trimEnd().endsWith(lines[0] ?? "-"), "va al final de «Raya Connect»");
});

// El nombre del competidor, armado para que el grep del paquete siga limpio.
const COMPETITOR = new RegExp(["str", "ipe"].join(""), "i");

// Identity.js con un <script>: el CDN de Raya, v1 (la última 1.x) o una versión fija. El
// origen solo, en la CSP.
const IDENTITY_JS_SCRIPT = '<script src="https://cdn.raya.cash/identity/v1/identity.js"></script>';
const IDENTITY_JS_URL =
  /^https:\/\/js\.raya\.cash(?:\/identity\/v(?:1|\d+\.\d+\.\d+)\/identity\.js)?$/;

test("la sección Identidad: el flujo en orden, la referencia e Identity.js por npm o el CDN", () => {
  assert.ok(README.includes("\n- [Identidad](#identidad)\n"), "falta en el índice");
  const start = README.indexOf("\n## Identidad\n");
  assert.ok(start > 0, "falta la sección");
  const section = README.slice(start, README.indexOf("\n## ", start + 1));
  assert.ok(section.includes("https://raya.cash/api/identity"));
  assert.ok(section.includes("npm install rayacash-identity"));
  assert.ok(section.includes('import { RayaIdentity } from "rayacash-identity";'));
  // Las dos formas de cargar Identity.js, npm primero, y la CSP de cada una.
  const npm = section.indexOf("npm install rayacash-identity");
  assert.ok(section.indexOf(IDENTITY_JS_SCRIPT) > npm, "el <script> del CDN, después de npm");
  assert.ok(section.includes("`frame-src https://raya.cash`"));
  assert.ok(section.includes("`https://cdn.raya.cash` a `script-src`"));
  // Crear → url o Identity.js → webhook → retrieve con person → files → cancel → list.
  const flow = section.slice(section.indexOf("El flujo:"));
  const positions = [
    "identity.verifications.create(",
    "identity.verification.verified",
    "identity.verifications.retrieve(",
    "identity.verifications.files(",
    "identity.verifications.cancel(",
    "identity.verifications.list(",
  ].map((step) => flow.indexOf(step));
  assert.ok(
    positions.every((position) => position >= 0),
    String(positions),
  );
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    "el flujo está desordenado",
  );
  assert.doesNotMatch(section, /\$\s?\d|\bARS\s?\d/, "sin precios: las tarifas están en tu cuenta");
});

test("el sandbox: condicionado a que la cuenta lo tenga y con lo que hace falta saber", () => {
  // El README termina en las guías para IA: toda mención del sandbox fuera de su sección va con
  // la condición (o manda a la sección, que la lleva).
  const line = (start: string): string =>
    README.split("\n").find((text) => text.startsWith(start)) ?? `(falta «${start}»)`;
  assert.match(line("2. **Tu clave secreta**"), /Si tu cuenta tiene \[sandbox\]\(#sandbox\)/);
  assert.match(
    line("7. **Para verificar identidades"),
    /disponible en el \[sandbox\]\(#sandbox\):/,
  );
  assert.match(line("**Probar en un sandbox.**"), /Si tu cuenta tiene \[sandbox\]\(#sandbox\)/);
  assert.match(line("El `fetch` falso prueba tu código sin red"), /si tu cuenta lo tiene\.$/);
  const sandbox = README.slice(
    README.indexOf("\n## Sandbox\n"),
    README.indexOf("\n## Tests de tu integración\n"),
  );
  for (const text of [
    "Si en el menú de tu perfil del dashboard aparece «Crear sandbox» o «Sandboxes»",
    "Si no aparece, tu cuenta todavía no lo tiene.",
    // Un evento sale solo hacia los destinos que ya existían cuando ocurrió.
    "antes de simular",
    "después de crearlo",
    // Al pasar a la cuenta real cambian la clave y el secreto del destino.
    "`RAYA_WEBHOOK_SECRET`",
    // Una orden simulada vuelve ligada al cliente de la clave secreta: se consulta y se
    // reembolsa con el del access_token.
    "connected.connect.orders.retrieve",
    '`code === "ACCESS_TOKEN_INVALID"`',
  ]) {
    assert.ok(sandbox.includes(text), text);
  }
});

test("el README y los ejemplos: sin CDNs de terceros, el SDK de servidor viejo ni competidores", () => {
  const files = readdirSync(path.join(ROOT, "examples")).map((name) => path.join("examples", name));
  for (const file of ["README.md", ...files]) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    // Identity.js va por npm o por el CDN de Raya, solo con sus URLs; nunca por un CDN de
    // terceros ni copiado a los estáticos del sitio.
    for (const [url] of text.matchAll(/https?:\/\/js\.raya\.cash[^\s"'`)<>]*/g)) {
      assert.match(url, IDENTITY_JS_URL, `${file}: URL del CDN inesperada`);
    }
    assert.doesNotMatch(text, /unpkg|jsdelivr|esm\.sh|skypack|cdnjs/i, file);
    assert.doesNotMatch(
      text,
      /archivos estáticos|tus estáticos|node_modules\/rayacash-identity\/dist/i,
      file,
    );
    assert.doesNotMatch(text, /RayaIdentityClient/, file);
    assert.doesNotMatch(text, COMPETITOR, file);
  }
});

test("el código y los scripts no nombran competidores (los comentarios llegan a dist/)", () => {
  for (const folder of ["src", "scripts"]) {
    for (const name of readdirSync(path.join(ROOT, folder))) {
      const text = readFileSync(path.join(ROOT, folder, name), "utf8");
      assert.doesNotMatch(text, COMPETITOR, `${folder}/${name}`);
    }
  }
});

for (const folder of ["examples", "scripts"]) {
  for (const name of readdirSync(path.join(ROOT, folder)).filter((file) => file.endsWith(".mjs"))) {
    test(`${folder}/${name} compila`, () => {
      checkSyntax(path.join(ROOT, folder, name));
    });
  }
}
