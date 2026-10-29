process.env.AREAL_MOBILE_SCENARIO = "commands";
process.env.AREAL_MOBILE_EVIDENCE ??= new URL(
  `../../../.scratch/ios-remote-v1/mobile-commands/attempt-${Date.now()}`,
  import.meta.url,
).pathname;
process.env.AREAL_MOBILE_DERIVED ??= new URL(
  "../../../.scratch/ios-remote-v1/mobile-workspace/derived-17.5",
  import.meta.url,
).pathname;
if (!process.env.AREAL_CORE_BIN)
  throw new Error("AREAL_CORE_BIN must point to the locked verification slot");
await import("./mobile-pairing-smoke.mjs");
