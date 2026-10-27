import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { certificates, relayFixture, hostFixture, waitFor } from "./remote-relay-fixture.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = resolve(
  process.env.AREAL_MOBILE_EVIDENCE ?? join(root, ".scratch/ios-remote-v1/mobile-pairing"),
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
    const cases = ["pair", "restore", "lifecycle", "revoked", "clear", "unpaired", "unpaired-dark"];
    let pairedPeer;
    for (const name of cases) {
      const productConfig = {
        mode: name === "unpaired-dark" ? "unpaired" : name,
        ...(name === "pair" ? { link: invitation.payload } : {}),
      };
      for (const kind of ["pairing", "ready", "background", "result"])
        await rm(join(container, "Documents", `product-${kind}.json`), { force: true });
      stage = `probe-${name}`;
      if (name === "unpaired-dark") await sim("ui", simulator, "appearance", "dark");
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
        {
          env: { ...process.env, SIMCTL_CHILD_AREAL_MOBILE_PRODUCT: JSON.stringify(productConfig) },
        },
      );
      let approved = false;
      let transitioned = false;
      const result = await waitFor(async () => {
        const event = await readFile(join(container, "Documents/product-pairing.json"), "utf8")
          .then(JSON.parse)
          .catch(() => null);
        if (event && !approved) {
          await sim("io", simulator, "screenshot", join(output, `${runtime}-pair-waiting.png`));
          await host.remote.control({
            operation: "approve",
            id: event.peer,
            projects: ["project"],
            preset: "Observer",
          });
          approved = true;
        }
        const ready = await readFile(join(container, "Documents/product-ready.json"), "utf8")
          .then(JSON.parse)
          .catch(() => null);
        if (ready && !transitioned) {
          transitioned = true;
          if (name === "lifecycle") {
            await sim("launch", simulator, "com.apple.Preferences");
            await waitFor(
              () =>
                readFile(join(container, "Documents/product-background.json"), "utf8")
                  .then(JSON.parse)
                  .catch(() => null),
              10000,
            );
            await waitFor(() => host.remote.sessions.sockets.size === 0, 10000);
            await sim("launch", simulator, bundleId);
          }
          if (name === "revoked")
            await host.remote.control({ operation: "revoke", id: pairedPeer });
        }
        return readFile(join(container, "Documents/product-result.json"), "utf8")
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
      assert.equal(record.origin, "capacitor://localhost");
      assert.equal(record.status, "success", `Mobile product failed in ${name}`);
      if (["pair", "restore", "lifecycle"].includes(name)) {
        assert.equal(record.state, "connected");
        assert.equal(record.remembered, "true");
        assert.equal(record.keychainPresent, true);
        assert.equal(record.identityPresent, true);
        assert.ok(Number.isSafeInteger(record.grantRevision));
        if (name === "pair") pairedPeer = record.peer;
        else {
          assert.equal(record.peer, pairedPeer);
          assert.equal(approved, false);
        }
      } else if (name === "revoked") {
        assert.equal(record.state, "revoked");
        assert.equal(record.keychainPresent, true);
        assert.equal(record.peer, pairedPeer);
        assert.equal(host.remote.sessions.sockets.size, 0);
      } else {
        assert.equal(record.state, "unpaired");
        assert.equal(record.keychainPresent, false);
      }
      assert.equal(host.remote.state().pending.length, 0);
    }
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
