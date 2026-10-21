import { strict as assert } from "assert";
import { createHmac } from "crypto";
import { test } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { AslanClient } from "./aslan.client";

const SECRET = "whsec_test";
const config = { get: (k: string) => (k === "ASLAN_WEBHOOK_SECRET" ? SECRET : undefined) } as any;
const client = new AslanClient(config);

const sign = (body: string, t = Math.floor(Date.now() / 1000), secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

const body = JSON.stringify({ event: "payment.succeeded", metadata: { orderId: "o1" } });

test("accepts a correctly signed webhook", () => {
  const evt = client.verifyWebhook(Buffer.from(body), sign(body));
  assert.equal(evt.event, "payment.succeeded");
});

test("rejects a tampered body", () => {
  const header = sign(body);
  assert.throws(() => client.verifyWebhook(Buffer.from(body.replace("o1", "o2")), header), UnauthorizedException);
});

test("rejects a signature made with another secret", () => {
  assert.throws(() => client.verifyWebhook(Buffer.from(body), sign(body, undefined, "other")), UnauthorizedException);
});

test("rejects a timestamp older than 5 minutes (replay)", () => {
  const old = Math.floor(Date.now() / 1000) - 301;
  assert.throws(() => client.verifyWebhook(Buffer.from(body), sign(body, old)), UnauthorizedException);
});

test("rejects missing / malformed / wrong-length signatures", () => {
  assert.throws(() => client.verifyWebhook(Buffer.from(body), undefined), UnauthorizedException);
  assert.throws(() => client.verifyWebhook(undefined, sign(body)), UnauthorizedException);
  assert.throws(() => client.verifyWebhook(Buffer.from(body), "garbage"), UnauthorizedException);
  assert.throws(() => client.verifyWebhook(Buffer.from(body), `t=${Math.floor(Date.now() / 1000)},v1=abcd`), UnauthorizedException);
});
