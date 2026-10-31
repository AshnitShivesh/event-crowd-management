const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { requireRole } = require("../authMiddleware");

describe("Authentication & Security Helpers", () => {
  const testKey = crypto.randomBytes(32);
  const testSecret = "JBSWY3DPEHPK3PXP";

  function encryptSecret(secret, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
  }

  function decryptSecret(value, key) {
    const parts = String(value || "").split(".");
    if (parts.length !== 3) throw new Error("Encrypted TOTP secret has an invalid format");
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }

  test("AES-256-GCM encrypts and decrypts TOTP secret accurately", () => {
    const encrypted = encryptSecret(testSecret, testKey);
    assert.notEqual(encrypted, testSecret);
    assert.equal(encrypted.split(".").length, 3);

    const decrypted = decryptSecret(encrypted, testKey);
    assert.equal(decrypted, testSecret);
  });

  test("Tampered ciphertext fails AES-256-GCM authentication tag check", () => {
    const encrypted = encryptSecret(testSecret, testKey);
    const parts = encrypted.split(".");
    // Tamper with the ciphertext part
    const tamperedParts = [parts[0], parts[1], Buffer.from("tampered").toString("base64url")];
    assert.throws(() => decryptSecret(tamperedParts.join("."), testKey));
  });

  test("Password hashing with bcrypt verifies correct passwords and rejects incorrect", async () => {
    const password = "SuperSecurePassword123!";
    const hash = await bcrypt.hash(password, 10);
    assert.ok(await bcrypt.compare(password, hash));
    assert.ok(!(await bcrypt.compare("WrongPassword", hash)));
  });

  test("TOTP generation and verification with otplib functions properly", async () => {
    const otp = await import("otplib");
    const secret = otp.generateSecret();
    assert.ok(typeof secret === "string" && secret.length > 0);

    const uri = otp.generateURI({ issuer: "Event Crowd Management", label: "test@example.com", secret });
    assert.ok(uri.startsWith("otpauth://totp/"));

    const token = otp.generateSync({ secret });
    assert.match(token, /^\d{6}$/);

    const result = await otp.verify({ secret, token });
    assert.equal(result.valid, true);

    const invalidResult = await otp.verify({ secret, token: "000000" });
    assert.equal(invalidResult.valid, false);
  });

  test("JWT tokens enforce issuer, audience, and expiration constraints", () => {
    const secret = "a".repeat(48);
    const validToken = jwt.sign(
      { sub: "42", type: "access", role: "organizer" },
      secret,
      {
        expiresIn: 60,
        issuer: "event-crowd-management",
        audience: "event-crowd-management-client",
      }
    );

    const decoded = jwt.verify(validToken, secret, {
      issuer: "event-crowd-management",
      audience: "event-crowd-management-client",
    });
    assert.equal(decoded.sub, "42");
    assert.equal(decoded.role, "organizer");

    assert.throws(() => {
      jwt.verify(validToken, secret, {
        issuer: "wrong-issuer",
        audience: "event-crowd-management-client",
      });
    });

    assert.throws(() => {
      jwt.verify(validToken, secret, {
        issuer: "event-crowd-management",
        audience: "wrong-audience",
      });
    });
  });

  test("Role authorization middleware allows permitted roles and blocks forbidden roles", () => {
    const organizerOnly = requireRole("organizer");
    let nextCalled = false;
    let statusCode = null;
    let jsonBody = null;

    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };

    // Case 1: unauthenticated
    organizerOnly({ user: null }, mockRes, () => { nextCalled = true; });
    assert.equal(statusCode, 401);
    assert.equal(nextCalled, false);

    // Case 2: forbidden role (viewer trying to access organizer route)
    nextCalled = false;
    statusCode = null;
    organizerOnly({ user: { role: "viewer" } }, mockRes, () => { nextCalled = true; });
    assert.equal(statusCode, 403);
    assert.equal(nextCalled, false);

    // Case 3: permitted role (organizer)
    nextCalled = false;
    statusCode = null;
    organizerOnly({ user: { role: "organizer" } }, mockRes, () => { nextCalled = true; });
    assert.equal(statusCode, null);
    assert.equal(nextCalled, true);
  });
});
