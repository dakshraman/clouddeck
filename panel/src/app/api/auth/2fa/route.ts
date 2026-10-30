import { NextResponse, type NextRequest } from "next/server";
import { HttpError, handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import { generateQRCodeSVG, generateSecret, getOTPAuthURL, verifyTOTP } from "@/lib/totp";
import { disableTOTP, getUser, hasTOTP, setTOTPSecret, verifyUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/2fa
 * Generates a pending secret, otpauth URL, and SVG QR code for the authenticated user.
 */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = await requireAuth();
    const secret = generateSecret();
    const otpAuthUrl = getOTPAuthURL(session.username, secret);
    const qrCodeSvg = generateQRCodeSVG(otpAuthUrl);

    return json({
      secret,
      otpAuthUrl,
      qrCodeSvg,
      enabled: hasTOTP(session.username),
    });
  });
}

/**
 * POST /api/auth/2fa
 * Accepts { code, secret }. Verifies the code against the secret.
 * If valid, saves the secret to the user profile and returns { enabled: true }.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = await requireAuth();
    const body = await parseJsonBody(req);
    const { code, secret } = body;

    if (typeof code !== "string" || typeof secret !== "string") {
      throw new HttpError(400, "Code and secret are required", "invalid_request");
    }

    const trimmedCode = code.trim();
    const trimmedSecret = secret.trim();

    if (!trimmedCode || !trimmedSecret) {
      throw new HttpError(400, "Code and secret cannot be empty", "invalid_request");
    }

    if (!verifyTOTP(trimmedSecret, trimmedCode)) {
      throw new HttpError(400, "Invalid verification code", "invalid_totp_code");
    }

    const saved = setTOTPSecret(session.username, trimmedSecret);
    if (!saved) {
      throw new HttpError(500, "Failed to save two-factor configuration", "save_failed");
    }

    return json({ enabled: true });
  });
}

/**
 * DELETE /api/auth/2fa
 * Disables 2FA (requires valid password or code in body).
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = await requireAuth();
    const body = await parseJsonBody(req);
    const password = typeof body.password === "string" ? body.password : undefined;
    const code = typeof body.code === "string" ? body.code.trim() : undefined;

    if (!password && !code) {
      throw new HttpError(
        400,
        "Current password or verification code is required to disable 2FA",
        "verification_required",
      );
    }

    let verified = false;
    if (password) {
      verified = await verifyUser(session.username, password);
    } else if (code) {
      const user = getUser(session.username);
      if (user?.totpSecret) {
        verified = verifyTOTP(user.totpSecret, code);
      }
    }

    if (!verified) {
      throw new HttpError(401, "Invalid password or verification code", "invalid_credentials");
    }

    const disabled = disableTOTP(session.username);
    if (!disabled) {
      throw new HttpError(500, "Failed to disable two-factor authentication", "disable_failed");
    }

    return json({ enabled: false, disabled: true });
  });
}
