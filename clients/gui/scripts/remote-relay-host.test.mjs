import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import tls from "node:tls";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteControl } from "../app/src/core/remote.cjs";
import { certificates, relayFixture, hostFixture, waitFor } from "./remote-relay-fixture.mjs";

async function host(t) {
  const home = await mkdtemp(join(tmpdir(), "rc12-host-"));
  const remote = new RemoteControl(
    {
      schedule() {},
      backend: {
        home,
        saved: [],
        async save(name, value) {
          await writeFile(join(home, name), JSON.stringify(value));
        },
      },
    },
    {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "fixture",
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString(),
    },
  );
  t.after(async () => {
    remote.close();
    await rm(home, { recursive: true, force: true });
  });
  await remote.init();
  return remote;
}

test("Relay enrollment requires explicit local confirmation and exact HTTPS origin", async (t) => {
  const remote = await host(t);
  assert.throws(
    () =>
      remote.control({ operation: "enable", relay: "https://relay.example", code: "x".repeat(43) }),
    /无效手机设置参数/,
  );
  for (const relay of [
    "http://127.0.0.1:3000",
    "wss://relay.example",
    "https://relay.example/",
    "https://relay.example/path",
    "https://user:pass@relay.example",
  ]) {
    await assert.rejects(
      remote.control({ operation: "enable", relay, code: "x".repeat(43), confirmed: true }),
      { code: "invalid-origin" },
    );
  }
  assert.equal(remote.state().enabled, false);
});

test("fresh desktop does not access secure storage until remote is requested", async (t) => {
  const remote = await host(t);
  let accesses = 0;
  remote.encryption = {
    isEncryptionAvailable() {
      accesses += 1;
      return false;
    },
    decryptString() {
      throw new Error("unexpected decryption");
    },
    encryptString() {
      throw new Error("unexpected encryption");
    },
  };
  await remote.init();
  assert.equal(accesses, 0);
  assert.equal(remote.state().enabled, false);
  assert.equal(remote.state().directEnabled, false);
  await assert.rejects(remote.control({ operation: "enableDirect" }), /系统安全存储不可用/);
  assert.equal(accesses, 1);
});

test("existing encrypted remote state still requires successful secure storage", async (t) => {
  const remote = await host(t);
  await writeFile(join(remote.backend.home, "remote.json"), JSON.stringify({ encrypted: "eA==" }));
  remote.encryption.decryptString = () => {
    throw new Error("fixture access denied");
  };
  await assert.rejects(remote.init(), /无法读取手机配对/);
  assert.equal(remote.state().enabled, false);
});

test("system CA trust covers enrollment, WSS and saved registration across teams", async (t) => {
  const teams = [];
  for (const name of ["A", "B"]) {
    const home = await certificates(`RC12 team ${name} test CA`);
    t.after(() => rm(home, { recursive: true, force: true }));
    teams.push({ name, home, ca: await readFile(join(home, "ca.pem"), "utf8") });
  }
  const getCertificates = tls.getCACertificates.bind(tls);
  await t.test("default CA trust survives an unrelated system CA", async (t) => {
    t.mock.method(tls, "getCACertificates", (type) =>
      type === "system" ? [teams[1].ca] : [...getCertificates(type), teams[0].ca],
    );
    const relay = await relayFixture(t, { tlsHome: teams[0].home });
    const f = await hostFixture(t);
    await f.remote.control({
      operation: "enable",
      relay: relay.origin,
      code: relay.admin("enrollment").code,
      confirmed: true,
    });
    await waitFor(() => f.remote.state().connected);
    assert.equal(f.remote.relayTransport.socket._socket.authorized, true);
  });
  for (const team of teams) {
    await t.test(`team ${team.name}`, async (t) => {
      // 只替换平台证书枚举边界；登记、持久化、真实 TLS 与 Relay WSS 均走产品实现。
      t.mock.method(tls, "getCACertificates", (type) =>
        type === "system" ? [team.ca] : getCertificates(type),
      );
      const relay = await relayFixture(t, { tlsHome: team.home });
      const f = await hostFixture(t);
      await f.remote.control({
        operation: "enable",
        relay: relay.origin,
        code: relay.admin("enrollment").code,
        confirmed: true,
      });
      await waitFor(() => f.remote.state().connected);
      assert.equal(f.remote.relayTransport.socket._socket.authorized, true);
      assert.ok(relay.acceptedTlsConnections >= 2);
      f.remote.close();
      const reopened = await f.make();
      await waitFor(() => reopened.state().connected);
      assert.equal(reopened.relayTransport.socket._socket.authorized, true);
      reopened.close();

      for (const [label, tlsHome, certificate, expected] of [
        [
          "other team",
          teams.find((other) => other !== team).home,
          "server.pem",
          /UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY/,
        ],
        ["wrong hostname", team.home, "wrong.pem", /ERR_TLS_CERT_ALTNAME_INVALID/],
        ["expired", team.home, "expired.pem", /CERT_HAS_EXPIRED/],
      ]) {
        await t.test(`reject ${label} for HTTPS and WSS`, async (t) => {
          const invalid = await relayFixture(t, { tlsHome, certificate });
          const rejected = await hostFixture(t);
          await assert.rejects(
            rejected.remote.control({
              operation: "enable",
              relay: invalid.origin,
              code: invalid.admin("enrollment").code,
              confirmed: true,
            }),
            (error) => error.code === "enrollment-failed" && expected.test(error.message),
          );
          assert.equal(rejected.remote.state().enabled, false);
          // 模拟已登记 Host 在服务端换证书后重连；验证失败必须阻止发送 capability。
          const saved = await f.persisted();
          const reconnect = await hostFixture(t, { config: { ...saved, relay: invalid.origin } });
          const [error] = await once(reconnect.remote.relayTransport.socket, "error", {
            signal: AbortSignal.timeout(5000),
          });
          assert.match(error.code, expected);
          assert.equal(reconnect.remote.state().connected, false);
          reconnect.remote.close();
          assert.equal(invalid.acceptedTlsConnections, 0);
        });
      }
    });
  }
});
