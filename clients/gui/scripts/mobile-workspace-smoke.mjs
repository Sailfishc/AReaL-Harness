process.env.AREAL_MOBILE_SCENARIO = "workspace";
process.env.AREAL_MOBILE_EVIDENCE ??= new URL(
  "../../../.scratch/ios-remote-v1/mobile-workspace",
  import.meta.url,
).pathname;
if (!process.env.AREAL_CORE_BIN)
  throw new Error("AREAL_CORE_BIN must point to the locked verification slot");
await import("./mobile-pairing-smoke.mjs");
