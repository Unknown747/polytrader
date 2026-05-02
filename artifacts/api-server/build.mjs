import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [
      // Native modules that cannot be bundled
      "*.node",
      "better-sqlite3",
      "sqlite3",
      // sql.js ships with a WASM binary — keep it external so Node.js resolves
      // it from node_modules at runtime (works on both x64 and ARM/Termux).
      "sql.js",
      // Image / graphics
      "sharp",
      "canvas",
      // Crypto / auth
      "bcrypt",
      "argon2",
      // Platform-specific
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "cpu-features",
      "dtrace-provider",
      "ssh2",
      // Isolation / sandbox
      "isolated-vm",
      "lightningcss",
      // Database clients
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "mysql2",
      "classic-level",
      "leveldown",
      "rocksdb",
      "realm",
      "odbc",
      // Email / templates
      "nodemailer",
      "handlebars",
      // ORMs / query builders
      "knex",
      "typeorm",
      "sequelize",
      // gRPC / protobuf
      "protobufjs",
      "@grpc/*",
      "grpc",
      // ML / AI
      "onnxruntime-node",
      "@tensorflow/*",
      // Cloud SDKs
      "@aws-sdk/*",
      "@azure/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "aws-sdk",
      // Observability
      "@opentelemetry/*",
      "@sentry/profiling-node",
      "dd-trace",
      "newrelic",
      // ORM / Prisma
      "@prisma/client",
      "@mikro-orm/*",
      // Workers / edge
      "miniflare",
      "workerd",
      "wrangler",
      "piscina",
      "tinypool",
      // Serial / USB
      "serialport",
      "usb",
      // Other native / large
      "snappy",
      "hiredis",
      "kerberos",
      "zeromq",
      "zeromq-prebuilt",
      "ffi-napi",
      "ref-napi",
      "sass-embedded",
      "@tree-sitter/*",
      "@parcel/watcher",
      // Browser automation
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
      // SWC
      "@swc/*",
    ],
    sourcemap: "linked",
    plugins: [
      esbuildPluginPino({ transports: ["pino-pretty"] }),
    ],
    // Ensure CJS-only packages (e.g. express) work inside our ESM output
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
