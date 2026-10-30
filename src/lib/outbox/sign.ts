import "server-only";
import { createHmac } from "node:crypto";

/** `X-Formchat-Signature`: "sha256=" + hex HMAC-SHA256 of "{timestamp}.{raw body}". */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}
