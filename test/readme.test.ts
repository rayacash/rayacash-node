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
  assert.match(
    line("9. **Para emitir facturas electrónicas"),
    /no está disponible en el \[sandbox\]\(#sandbox\)\.$/,
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

/** La sección `## <title>` del README, hasta la siguiente de su nivel. */
function readmeSection(title: string): string {
  const start = README.indexOf(`\n## ${title}\n`);
  assert.ok(start > 0, `falta la sección «${title}»`);
  const end = README.indexOf("\n## ", start + 1);
  return README.slice(start, end < 0 ? undefined : end);
}

const PSP_CODES = [
  "PSP_NOT_ACTIVATED",
  "CUSTOMER_NOT_FOUND",
  "CUSTOMER_ALREADY_EXISTS",
  "CUSTOMER_STATUS_CONFLICT",
  "CUSTOMER_INSUFFICIENT_BALANCE",
  "CUSTOMER_DATA_MISMATCH",
  "TAX_ID_NOT_REGISTERED",
];

const PSP_EVENT_TYPES = [
  "psp.customer.activated",
  "psp.customer.updated",
  "psp.customer.failed",
  "psp.customer.rejected",
  "psp.customer.blocked",
  "psp.customer.unblocked",
  "psp.customer.closed",
  "psp.transfer.received",
  "psp.transfer.sent",
  "psp.transfer.failed",
  "psp.document_request.created",
  "psp.document_request.closed",
];

test("la sección Raya PSP: entre Identidad y el Facturador, en el índice y con la referencia", () => {
  assert.ok(
    README.includes(
      "\n- [Identidad](#identidad)\n- [Raya PSP](#raya-psp)\n- [Facturador](#facturador)\n",
    ),
    "falta en el índice, entre Identidad y Facturador",
  );
  const start = README.indexOf("\n## Raya PSP\n");
  assert.ok(README.indexOf("\n## Identidad\n") < start, "va después de «Identidad»");
  assert.ok(start < README.indexOf("\n## Raya Connect\n"), "va antes de «Raya Connect»");
  const section = readmeSection("Raya PSP");
  for (const text of [
    "https://raya.cash/api/psp",
    "cuentas de empresa con Raya PSP activado",
    '`code === "PSP_NOT_ACTIVATED"`',
    "`SANDBOX_NOT_SUPPORTED`",
    // Tu saldo manda: primero el tuyo y después el del cliente.
    '`code === "INSUFFICIENT_BALANCE"`',
    '`code === "CUSTOMER_INSUFFICIENT_BALANCE"`',
    "`identity_verification`",
    "`document_front_url`, `document_back_url` y `selfie_url`",
    "`202`",
    "existen desde la 1.3.0",
    "examples/operar-clientes-psp.mjs",
  ]) {
    assert.ok(section.includes(text), text);
  }
  // Los 12 métodos, en la tabla.
  for (const method of [
    "customers.create(",
    "customers.retrieve(",
    "customers.list(",
    "customers.retrieveBalance(",
    "customers.block(",
    "customers.unblock(",
    "customers.close(",
    "customers.recreate(",
    "transfers.create(",
    "transfers.retrieve(",
    "transfers.list(",
    "balance.retrieve(",
  ]) {
    assert.ok(section.includes(`| \`client.psp.${method}`), method);
  }
  for (const type of PSP_EVENT_TYPES) assert.ok(section.includes(`| \`${type}\` |`), type);
});

test("la sección Raya PSP sigue el flujo en orden", () => {
  // Crear → webhook → retrieve → transferir → lo recibido → bloquear → listar.
  const section = readmeSection("Raya PSP");
  const flow = section.slice(section.indexOf("El flujo:"));
  const positions = [
    "psp.customers.create(",
    "psp.customer.activated",
    "psp.customers.retrieve(",
    "psp.transfers.create(",
    "psp.transfer.received",
    "psp.customers.block(",
    "psp.customers.list(",
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
});

test("la sección Raya PSP: sin precios, porcentajes, términos ni promesas regulatorias", () => {
  const section = readmeSection("Raya PSP");
  assert.doesNotMatch(section, /\$\s?\d|\bARS\s?\d|\d\s?%/, "sin precios ni porcentajes");
  // Sin términos (enmienda A2): la API no tiene terms_accepted_at.
  assert.doesNotMatch(section, /terms_accepted_at|términos/);
  assert.doesNotMatch(section, /autorizad[oa]s?\b|regulad[oa]s? por/i);
  // Todo lo nuevo, en el README, va con su nombre de la 1.3.0.
  assert.doesNotMatch(README, /terms_accepted_at/);
});

test("la sección Raya PSP: las tres formas de crear un cliente, sin gender (enmienda A7)", () => {
  const section = readmeSection("Raya PSP");
  // El paso 1 crea con Raya Identity: solo identity_verification, sin los datos que salen de ahí.
  const flow = section.slice(section.indexOf("El flujo:"));
  const start = flow.indexOf("psp.customers.create(");
  const call = flow.slice(start, flow.indexOf("```", start));
  assert.match(call, /^\s+identity_verification: verification\.id,/m);
  assert.doesNotMatch(call, /tax_id|\bname:|person_type|_url/);
  assert.ok(section.includes("](#qué-mandar-para-crear-un-cliente)"), "el link del paso 1");
  assert.ok(section.includes("\n### Qué mandar para crear un cliente\n"), "la subsección");
  for (const text of [
    "Solo `identity_verification`",
    '`tax_id`, `name`, `person_type: "F"`, `document_front_url`, `document_back_url` y `selfie_url`',
    '`tax_id`, `name` (su razón social) y `person_type: "J"`, sin fotos',
    "`PspCustomerCreateWithVerificationParams`, `PspCustomerCreateWithPhotosParams` y " +
      "`PspCustomerCreateCompanyParams`",
  ]) {
    assert.ok(section.includes(text), text);
  }
  // El sexo lo leemos del frente del DNI, y CUSTOMER_DATA_MISMATCH queda para la razón social de
  // una persona jurídica.
  assert.doesNotMatch(README, /gender/);
  for (const line of README.split("\n").filter((text) => text.includes("CUSTOMER_DATA_MISMATCH"))) {
    assert.doesNotMatch(line, /`tax_id`|el apellido/, line);
  }
});

test("los 7 códigos de Raya PSP están en «Errores» y los 12 eventos en «Webhooks»", () => {
  const errors = readmeSection("Errores");
  for (const code of PSP_CODES) assert.ok(errors.includes(`\`${code}\``), code);
  const webhooks = readmeSection("Webhooks");
  for (const type of PSP_EVENT_TYPES) assert.ok(webhooks.includes(`\`${type}\``), type);
});

const FACTURADOR_CODES = ["FACTURADOR_NOT_READY", "INVOICE_NOT_FOUND"];

const INVOICE_EVENT_TYPES = ["invoice.issued", "invoice.rejected", "invoice.failed"];

// failure_reason.code y su message, con el texto de la API.
const INVOICE_FAILURES: Array<[string, string]> = [
  ["arca_rejected", "ARCA rechazó la factura: arca_messages dice por qué."],
  [
    "facturador_not_ready",
    "Tu Facturador no estaba listo para emitirla. Revisalo en Negocios › Facturador y creá la " +
      "factura de nuevo.",
  ],
  ["not_issued", "No pudimos emitirla y no quedó registrada en ARCA. Creala de nuevo."],
  [
    "numbering_conflict",
    "Otro sistema emitió comprobantes con el mismo punto de venta. Usá un punto de venta solo " +
      "para Raya y creá la factura de nuevo.",
  ],
  [
    "account_unavailable",
    "Tu cuenta no puede emitir facturas en este momento. Escribinos a soporte@raya.cash.",
  ],
];

test("la sección Facturador: entre Raya PSP y Raya Connect, en el índice y con la referencia", () => {
  assert.ok(
    README.includes(
      "\n- [Raya PSP](#raya-psp)\n- [Facturador](#facturador)\n- [Raya Connect](#raya-connect)\n",
    ),
    "falta en el índice, entre Raya PSP y Raya Connect",
  );
  const start = README.indexOf("\n## Facturador\n");
  assert.ok(README.indexOf("\n## Raya PSP\n") < start, "va después de «Raya PSP»");
  assert.ok(start < README.indexOf("\n## Raya Connect\n"), "va antes de «Raya Connect»");
  const section = readmeSection("Facturador");
  for (const text of [
    "https://raya.cash/api/invoices",
    "[Negocios › Facturador](https://raya.cash/dashboard/invoicing)",
    // Solo en tu cuenta real.
    "`SANDBOX_NOT_SUPPORTED`",
    '`code === "FACTURADOR_NOT_READY"`',
    "`error.data.reason`",
    '`code === "INVOICE_NOT_FOUND"`',
    "`202`",
    "existe desde la 1.4.0",
    "examples/emitir-facturas.mjs",
  ]) {
    assert.ok(section.includes(text), text);
  }
  // Los motivos de FACTURADOR_NOT_READY.
  for (const reason of [
    "not_configured",
    "checking",
    "action_required",
    "certificate_expired",
    "disabled",
  ]) {
    assert.ok(section.includes(`\`${reason}\``), reason);
  }
  // Los 3 métodos, los estados y los 3 eventos, en sus tablas.
  for (const method of ["create(", "retrieve(", "list("]) {
    assert.ok(section.includes(`| \`client.invoices.${method}`), method);
  }
  assert.ok(section.includes("| `client.invoices.create(params, { idempotencyKey })` |"));
  for (const status of ["pending", "issued", "rejected", "failed"]) {
    assert.ok(section.includes(`| \`${status}\` |`), status);
  }
  for (const type of INVOICE_EVENT_TYPES) assert.ok(section.includes(`| \`${type}\` |`), type);
  for (const [code, message] of INVOICE_FAILURES) {
    assert.ok(section.includes(`| \`${code}\` | ${message} |`), code);
  }
});

test("la sección Facturador sigue el flujo en orden", () => {
  // Configurar en el dashboard (punto de venta, certificado y clave privada, condición frente al
  // IVA y concepto) → crear (202 pending) → invoice.issued → retrieve → list.
  const section = readmeSection("Facturador");
  const flow = section.slice(section.indexOf("El flujo:"));
  const positions = [
    "Negocios › Facturador",
    "el punto de venta, el certificado y la clave privada de ARCA, tu condición frente al IVA y " +
      "el concepto",
    "invoices.create(",
    "invoice.issued",
    "invoices.retrieve(",
    "invoices.list(",
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
  // Crear vuelve 202 con la factura pending, lleva la idempotencyKey en las opciones y el DNI como
  // texto, con la regla de la API.
  assert.ok(flow.includes('Vuelve `202` con `status: "pending"`'), "crear: 202 pending");
  const start = flow.indexOf("invoices.create(");
  const call = flow.slice(start, flow.indexOf("```", start));
  assert.match(call, /\{ idempotencyKey: key \}/);
  const dnis = [...call.matchAll(/dni: "([^"]*)"/g)].map((match) => match[1] ?? "");
  assert.deepEqual(dnis, ["12345678"]);
  for (const dni of dnis) assert.match(dni, /^[1-9][0-9]{5,7}$/);
});

test("el Facturador en «Errores», «Webhooks», «Idempotencia» y «Sandbox»", () => {
  const errors = readmeSection("Errores");
  for (const code of FACTURADOR_CODES) assert.ok(errors.includes(`\`${code}\``), code);
  const webhooks = readmeSection("Webhooks");
  for (const type of INVOICE_EVENT_TYPES) assert.ok(webhooks.includes(`\`${type}\``), type);
  assert.ok(webhooks.includes("grupo «Facturador»"));
  const idempotency = readmeSection("Idempotencia");
  assert.ok(
    idempotency.includes(
      "**`transfers.create`, `connect.payouts.create`, `psp.transfers.create` e " +
        "`invoices.create` exigen la `idempotencyKey`.**",
    ),
  );
  const sandbox = readmeSection("Sandbox");
  assert.ok(sandbox.includes("el Facturador (`invoices.*`)"));
  // En TypeScript, invoices.create sin idempotencyKey no compila.
  assert.ok(README.includes("`psp.transfers.create` e `invoices.create` sin `idempotencyKey` no"));
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
