import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const BUSINESS_TYPES = ["sole_proprietor", "llc", "corporation", "partnership", "other"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export type BusinessIdentity = {
  legal_name: string;
  brand_name: string;
  business_type: BusinessType;
  has_tax_id: boolean;
  tax_id_type: string;
  tax_id: string;
  business_industry: string;
  business_address_street: string;
  business_address_street2: string;
  business_address_city: string;
  business_address_region: string;
  business_address_postal_code: string;
  business_address_country: string;
  social_media_urls: string;
  business_regions_of_operation: string;
  authorized_first_name: string;
  authorized_last_name: string;
  authorized_title: string;
  authorized_job_position: string;
  authorized_phone: string;
  brand_contact_email: string;
};

function key(): Buffer {
  // The service-role key is already a server-only secret and keeps local/dev
  // setup simple. Production can later rotate to a dedicated key without
  // changing the stored format.
  return createHash("sha256").update(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "reknock-local-key").digest();
}

export function encryptTaxId(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptTaxId(value: string | null): string {
  if (!value) return "";
  try {
    const [iv, tag, encrypted] = value.split(".");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function twilioRegistrationPath(type: BusinessType, hasTaxId: boolean): "sole_proprietor" | "standard" | "needs_ein" {
  if (type === "sole_proprietor" && !hasTaxId) return "sole_proprietor";
  if (hasTaxId) return "standard";
  return "needs_ein";
}
