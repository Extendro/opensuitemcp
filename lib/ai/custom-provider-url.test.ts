import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertPublicHttpsUrl,
  isBlockedIpAddress,
} from "./custom-provider-url";
import { openaiCompatibleModelsUrl } from "./provider-entries";

describe("custom-provider-url", () => {
  it("rejects non-https and localhost", async () => {
    await assert.rejects(
      () => assertPublicHttpsUrl("http://example.com"),
      /HTTPS/,
    );
    await assert.rejects(
      () => assertPublicHttpsUrl("https://localhost/v1"),
      /public HTTPS/,
    );
  });

  it("blocks private and metadata IPs", () => {
    assert.equal(isBlockedIpAddress("127.0.0.1"), true);
    assert.equal(isBlockedIpAddress("10.0.0.4"), true);
    assert.equal(isBlockedIpAddress("192.168.1.8"), true);
    assert.equal(isBlockedIpAddress("169.254.169.254"), true);
    assert.equal(isBlockedIpAddress("::1"), true);
    assert.equal(isBlockedIpAddress("8.8.8.8"), false);
  });

  it("rejects DNS that resolves to a private IP", async () => {
    await assert.rejects(
      () =>
        assertPublicHttpsUrl("https://internal.example", async () => [
          "10.1.2.3",
        ]),
      /Private/,
    );
  });

  it("accepts public HTTPS after DNS resolve", async () => {
    const url = await assertPublicHttpsUrl(
      "https://llm.example.com/v1",
      async () => ["8.8.8.8"],
    );
    assert.equal(url.hostname, "llm.example.com");
  });

  it("builds /v1/models without doubling v1", () => {
    assert.equal(
      openaiCompatibleModelsUrl("https://api.example.com/v1"),
      "https://api.example.com/v1/models",
    );
    assert.equal(
      openaiCompatibleModelsUrl("https://api.example.com"),
      "https://api.example.com/v1/models",
    );
  });
});
