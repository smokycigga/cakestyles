import crypto from "crypto";
import { describe, expect, it } from "vitest";

import {
  getRazorpayConfig,
  hashCheckoutToken,
  isValidRazorpaySignature,
  timingSafeHexEqual,
} from "../controllers/paymentController.js";

describe("guest storefront payment security", () => {
  it("stores checkout tokens as deterministic SHA-256 digests", () => {
    const token = crypto.randomBytes(32).toString("hex");
    const digest = hashCheckoutToken(token);

    expect(digest).toHaveLength(64);
    expect(digest).not.toBe(token);
    expect(timingSafeHexEqual(digest, hashCheckoutToken(token))).toBe(true);
    expect(timingSafeHexEqual(digest, hashCheckoutToken(`${token}x`))).toBe(false);
  });

  it("verifies Razorpay signatures and rejects malformed comparisons", () => {
    const secret = "a-secure-razorpay-secret";
    const orderId = "order_123";
    const paymentId = "pay_456";
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    expect(isValidRazorpaySignature({ orderId, paymentId, signature, secret })).toBe(true);
    expect(isValidRazorpaySignature({ orderId, paymentId, signature: `${signature}00`, secret })).toBe(false);
    expect(isValidRazorpaySignature({ orderId, paymentId, signature: "not-hex", secret })).toBe(false);
  });

  it("accepts complete Razorpay configuration", () => {
    expect(getRazorpayConfig({
      RAZORPAY_KEY_ID: "rzp_test_Abc123456",
      RAZORPAY_KEY_SECRET: "valid-test-secret-12345",
    })).toEqual({
      keyId: "rzp_test_Abc123456",
      keySecret: "valid-test-secret-12345",
    });
  });

  it("rejects missing, malformed, and placeholder Razorpay configuration", () => {
    expect(getRazorpayConfig({})).toBeNull();
    expect(getRazorpayConfig({
      RAZORPAY_KEY_ID: "invalid-key",
      RAZORPAY_KEY_SECRET: "valid-test-secret-12345",
    })).toBeNull();
    expect(getRazorpayConfig({
      RAZORPAY_KEY_ID: "rzp_test_Abc123456",
      RAZORPAY_KEY_SECRET: "change_me_secret_value",
    })).toBeNull();
  });
});

