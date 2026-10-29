import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { certificates, relayFixture, hostFixture, waitFor } from "./remote-relay-fixture.mjs";
import { createIdentity, identityId } from "../packages/remote/src/channel.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = resolve(
  process.env.AREAL_MOBILE_EVIDENCE ?? join(root, ".scratch/ios-remote-v1/mobile-gate"),
);
const runtime = process.env.AREAL_IOS_RUNTIME ?? "17.5";
const bundleId = process.env.AREAL_MOBILE_BUNDLE_ID ?? "com.example.arealharness";
const run = async (command, args, options = {}) =>
  (await exec(command, args, { cwd: root, maxBuffer: 32 * 1024 * 1024, ...options })).stdout.trim();
await mkdir(output, { recursive: true });

if (!process.env.AREAL_IOS_TLS_HOME) {
  const tlsHome = await certificates();
  try {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        AREAL_IOS_TLS_HOME: tlsHome,
        NODE_EXTRA_CA_CERTS: join(tlsHome, "ca.pem"),
      },
    });
    process.exitCode = await new Promise((resolve) =>
      child.once("exit", (code) => resolve(code ?? 1)),
    );
  } finally {
    await rm(tlsHome, { recursive: true, force: true });
  }
} else {
  const cleanup = [];
  const fixture = { after: (fn) => cleanup.push(fn) };
  let simulator;
  let stage = "sync";
  const records = [];
  const sim = (...args) => run("xcrun", ["simctl", ...args]);
  try {
    await run("pnpm", ["--dir", "clients/gui", "mobile:sync"]);
    stage = "simulator";
    simulator = await sim(
      "create",
      `AReaL mobile gate ${runtime} ${Date.now()}`,
      "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro",
      `com.apple.CoreSimulator.SimRuntime.iOS-${runtime.replaceAll(".", "-")}`,
    );
    await sim("boot", simulator);
    await sim("bootstatus", simulator, "-b");
    await sim(
      "keychain",
      simulator,
      "add-root-cert",
      join(process.env.AREAL_IOS_TLS_HOME, "ca.pem"),
    );
    stage = "build";
    const derived = join(output, `derived-${runtime}`);
    try {
      const build = await run("xcodebuild", [
        "-project",
        "clients/mobile/ios/App/App.xcodeproj",
        "-scheme",
        "App",
        "-configuration",
        "Debug",
        "-sdk",
        "iphonesimulator",
        "-destination",
        `id=${simulator}`,
        "-derivedDataPath",
        derived,
        "CODE_SIGNING_ALLOWED=YES",
        "CODE_SIGN_IDENTITY=-",
        `AREAL_MOBILE_BUNDLE_ID=${bundleId}`,
        "build",
      ]);
      await writeFile(join(output, `build-${runtime}.log`), build);
    } catch (error) {
      await writeFile(
        join(output, `build-${runtime}.log`),
        `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      );
      throw new Error("SimulatorBuildFailed");
    }
    await sim("install", simulator, join(derived, "Build/Products/Debug-iphonesimulator/App.app"));
    const container = await sim("get_app_container", simulator, bundleId, "data");
    stage = "fixtures";
    const relay = await relayFixture(fixture, {
      tlsHome: process.env.AREAL_IOS_TLS_HOME,
      relayOptions: { allowedAppOrigins: ["capacitor://localhost"] },
    });
    const host = await hostFixture(fixture);
    await host.remote.control({
      operation: "enable",
      relay: relay.origin,
      code: relay.admin("enrollment").code,
      confirmed: true,
    });
    await waitFor(() => host.remote.state().connected);
    const invitation = await host.remote.control({ operation: "pair", transport: "relay" });
    const fragment = new URLSearchParams(new URL(invitation.payload).hash.slice(1));
    const config = {
      relay: relay.origin,
      host: fragment.get("host"),
      room: fragment.get("room"),
      invite: fragment.get("invite"),
      mode: "handshake",
    };
    const cases = process.env.AREAL_MOBILE_CASES?.split(",") ?? [
      "handshake",
      "pin-mismatch",
      "tls-wrong-name",
      "tls-untrusted",
    ];
    const failures = [];
    for (const name of cases) {
      const probeConfig = { ...config };
      if (name === "pin-mismatch") {
        probeConfig.host = identityId(await createIdentity());
        probeConfig.mode = "pin-mismatch";
      }
      if (name.startsWith("tls-")) {
        let tlsHome = process.env.AREAL_IOS_TLS_HOME;
        if (name === "tls-untrusted") {
          tlsHome = await certificates();
          cleanup.push(() => rm(tlsHome, { recursive: true, force: true }));
        }
        const badRelay = await relayFixture(fixture, {
          tlsHome,
          certificate: name === "tls-wrong-name" ? "wrong.pem" : "server.pem",
          relayOptions: { allowedAppOrigins: ["capacitor://localhost"] },
        });
        probeConfig.relay = badRelay.origin;
        probeConfig.mode = "tls-reject";
      }
      for (const kind of ["pairing", "result"])
        await rm(join(container, "Documents", `probe-${kind}.json`), { force: true });
      stage = `probe-${name}`;
      await run(
        "xcrun",
        [
          "simctl",
          "launch",
          "--terminate-running-process",
          `--stdout=${join(output, `${runtime}-${name}-stdout.log`)}`,
          `--stderr=${join(output, `${runtime}-${name}-stderr.log`)}`,
          simulator,
          bundleId,
        ],
        { env: { ...process.env, SIMCTL_CHILD_AREAL_MOBILE_PROBE: JSON.stringify(probeConfig) } },
      );
      let approved = false;
      const result = await waitFor(async () => {
        const event = await readFile(join(container, "Documents/probe-pairing.json"), "utf8")
          .then(JSON.parse)
          .catch(() => null);
        if (event && !approved) {
          await host.remote.control({
            operation: "approve",
            id: event.peer,
            projects: ["project"],
            preset: "Observer",
          });
          approved = true;
        }
        return readFile(join(container, "Documents/probe-result.json"), "utf8")
          .then(JSON.parse)
          .catch(() => null);
      }, 40000);
      const record = { runtime, case: name, ...result.result };
      records.push(record);
      await writeFile(
        join(output, `result-${runtime}.json`),
        JSON.stringify(records, null, 2) + "\n",
      );
      await sim("io", simulator, "screenshot", join(output, `${runtime}-${name}.png`));
      console.log(JSON.stringify(record));
      try {
        assert.equal(record.origin, "capacitor://localhost");
        if (name === "handshake") {
          assert.equal(record.webSocketOpened, true);
          assert.equal(record.status, "success", `WKWebView handshake failed at ${record.phase}`);
          assert.deepEqual(record.verified, {
            hostPin: true,
            apiVersion: "areal.remote.v2",
            ready: true,
            projectIds: ["project"],
          });
          assert.ok(
            Object.values(record.capabilities).every(Boolean),
            "WKWebView runtime lacks a required crypto or dependency capability",
          );
        } else {
          assert.equal(record.status, "failure");
          assert.equal(record.phase, name === "pin-mismatch" ? "noise" : "relay");
          assert.equal(approved, false);
          assert.equal(record.webSocketOpened, name === "pin-mismatch");
        }
        assert.equal(host.remote.state().pending.length, 0);
      } catch (error) {
        failures.push(`${name}: ${error.message}`);
      }
    }
    if (failures.length) throw new Error(failures.join("; "));
  } catch (error) {
    console.error(`${stage}: ${error.message}`);
    if (simulator)
      await sim("io", simulator, "screenshot", join(output, `${runtime}-failure.png`)).catch(
        () => {},
      );
    process.exitCode = 1;
  } finally {
    for (const fn of cleanup.reverse()) await fn();
    if (simulator) {
      await sim("terminate", simulator, bundleId).catch(() => {});
      await sim("shutdown", simulator).catch(() => {});
      await sim("delete", simulator);
    }
    await writeFile(
      join(output, `environment-${runtime}.json`),
      JSON.stringify(
        {
          revision: await run("git", ["rev-parse", "HEAD"]),
          runtime,
          dirty: (await run("git", ["status", "--porcelain"])).length > 0,
          dirtyPaths: (await run("git", ["status", "--porcelain"])).split("\n").filter(Boolean),
          stage,
          xcode: await run("xcodebuild", ["-version"]),
          node: process.version,
          relayNode: {
            path: process.env.AREAL_RELAY_NODE ?? process.execPath,
            version: await run(process.env.AREAL_RELAY_NODE ?? process.execPath, ["--version"]),
          },
          records: records.length,
          processExitCode: process.exitCode ?? 0,
        },
        null,
        2,
      ) + "\n",
    );
  }
}
