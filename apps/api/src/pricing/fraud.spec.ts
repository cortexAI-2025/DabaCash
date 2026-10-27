import { strict as assert } from "assert";
import { test } from "node:test";
import { Condition, DeviceType } from "@dabacash/database";
import { FLAG_THRESHOLD, isValidImei, scoreFraud, FraudSignals } from "./fraud";

const VALID_IMEI = "490154203237518";
const clean: FraudSignals = {
  condition: Condition.B,
  deviceType: DeviceType.PHONE,
  ageYears: 2,
  imei: VALID_IMEI,
  imeiSeenElsewhere: false,
  requestsLast24h: 1,
  accountAgeHours: 500,
  estimatedPrice: 3000,
};

test("Luhn: accepts a valid IMEI, rejects a bad check digit, wrong length and non-digits", () => {
  assert.equal(isValidImei(VALID_IMEI), true);
  assert.equal(isValidImei("490154203237519"), false);
  assert.equal(isValidImei("49015420323751"), false);
  assert.equal(isValidImei("49015420323751A"), false);
});

test("a normal request scores 0 and is not flagged", () => {
  const r = scoreFraud(clean);
  assert.equal(r.score, 0);
  assert.deepEqual(r.reasons, []);
});

test("a duplicate IMEI alone is enough to flag", () => {
  const r = scoreFraud({ ...clean, imeiSeenElsewhere: true });
  assert.ok(r.score >= FLAG_THRESHOLD);
  assert.match(r.reasons[0], /IMEI déjà présent/);
});

test("an invalid IMEI is suspicious but not flagged on its own", () => {
  const r = scoreFraud({ ...clean, imei: "490154203237519" });
  assert.ok(r.score > 0 && r.score < FLAG_THRESHOLD);
});

test("signals add up: old device claimed as new, from a brand-new account, in a burst", () => {
  const r = scoreFraud({ ...clean, condition: Condition.A, ageYears: 6, requestsLast24h: 3, accountAgeHours: 0.2, estimatedPrice: 9000 });
  assert.ok(r.score >= FLAG_THRESHOLD, `score ${r.score}`);
  assert.equal(r.reasons.length, 3);
});

test("missing IMEI only matters for phones; unknown model age is ignored", () => {
  assert.equal(scoreFraud({ ...clean, imei: null }).score, 0.1);
  assert.equal(scoreFraud({ ...clean, imei: null, deviceType: DeviceType.TV }).score, 0);
  assert.equal(scoreFraud({ ...clean, condition: Condition.A, ageYears: null }).score, 0);
});

test("the score never exceeds 1", () => {
  const r = scoreFraud({ ...clean, imei: "1", imeiSeenElsewhere: true, ageYears: 99, requestsLast24h: 9, accountAgeHours: 0, estimatedPrice: 20000 });
  assert.equal(r.score, 1);
});
