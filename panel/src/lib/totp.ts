import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { qrcodegen } from "./qrcodegen";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TIME_STEP_SECONDS = 30;
const DIGITS = 6;
const DIGIT_MODULUS = 10 ** DIGITS; // 1,000,000

/**
 * Encodes a buffer into a standard Base32 string (RFC 4648) without padding.
 */
export function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decodes a Base32 string (RFC 4648) into a Buffer, ignoring whitespace, hyphens, and padding.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[\s-=]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically random 20-byte secret encoded as a 32-character Base32 string.
 */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Builds the otpauth:// URI for registering the TOTP secret with authenticator apps.
 */
export function getOTPAuthURL(
  username: string,
  secret: string,
  issuer: string = "CloudDeck",
): string {
  const cleanUsername = username.trim();
  const cleanIssuer = issuer.trim();
  const label = `${encodeURIComponent(cleanIssuer)}:${encodeURIComponent(cleanUsername)}`;
  const params = new URLSearchParams({
    secret: secret.trim(),
    issuer: cleanIssuer,
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Generates a 6-digit TOTP code for a given counter value according to RFC 6238 / RFC 4226.
 */
export function generateTOTP(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  const otp = binary % DIGIT_MODULUS;
  return otp.toString().padStart(DIGITS, "0");
}

/**
 * Verifies a 6-digit TOTP token against a secret with ±1 time step tolerance (RFC 6238).
 */
export function verifyTOTP(secret: string, token: string): boolean {
  if (typeof secret !== "string" || !secret.trim()) return false;
  if (typeof token !== "string") return false;

  const cleanedToken = token.trim();
  if (!/^\d{6}$/.test(cleanedToken)) return false;

  const tokenBuffer = Buffer.from(cleanedToken, "utf8");
  const currentStep = Math.floor(Date.now() / 1000 / TIME_STEP_SECONDS);

  try {
    for (let stepOffset = -1; stepOffset <= 1; stepOffset++) {
      const step = currentStep + stepOffset;
      const expectedCode = generateTOTP(secret, step);
      const expectedBuffer = Buffer.from(expectedCode, "utf8");

      if (
        expectedBuffer.length === tokenBuffer.length &&
        timingSafeEqual(expectedBuffer, tokenBuffer)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Generates an SVG string representation of a QR code for the given otpauth URL.
 */
export function generateQRCodeSVG(otpAuthUrl: string): string {
  const qr = qrcodegen.QrCode.encodeText(otpAuthUrl, qrcodegen.QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = qr.size + border * 2;
  const pathPieces: string[] = [];

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        pathPieces.push(`M${x + border},${y + border}h1v1h-1z`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" width="100%" height="100%"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${pathPieces.join("")}" fill="#000000"/></svg>`;
}
