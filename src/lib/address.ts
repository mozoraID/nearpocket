/**
 * Delivery profile saved on this device and reused across marketplaces.
 * Demo only: nothing here is sent to a carrier or a marketplace API.
 */

export interface DeliveryAddress {
  id: string;
  recipientName: string;
  phone: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  note?: string;
  isDefault: boolean;
}

export type AddressDraft = {
  recipientName: string;
  phone: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  note?: string;
};

export type AddressField = keyof AddressDraft;

export type AddressIssueCode = "required" | "too_short" | "too_long" | "invalid";

export interface AddressIssue {
  field: AddressField;
  code: AddressIssueCode;
}

const FIELD_ORDER: AddressField[] = [
  "recipientName",
  "phone",
  "street",
  "city",
  "province",
  "postalCode",
  "country",
  "note",
];

export function defaultAddress(
  list: DeliveryAddress[] | undefined | null,
): DeliveryAddress | null {
  if (!list?.length) return null;
  return list.find((a) => a.isDefault) || list[0];
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  const last4 = digits.slice(-4);
  return phone.trim().startsWith("+") ? `+•••• ${last4}` : `•••• ${last4}`;
}

/** One line for buy sheets, agent replies, and receipts. Phone is masked. */
export function formatShipTo(address: DeliveryAddress | AddressDraft): string {
  const phone = maskPhone(address.phone);
  const place = [address.street, address.city, address.province, address.postalCode, address.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  return [address.recipientName.trim(), phone, place].filter(Boolean).join(" · ");
}

function clean(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function validateDeliveryAddress(
  input: Partial<AddressDraft> | null | undefined,
): { ok: true; value: AddressDraft } | { ok: false; issues: AddressIssue[] } {
  const draft: AddressDraft = {
    recipientName: clean(input?.recipientName),
    phone: clean(input?.phone),
    street: clean(input?.street),
    city: clean(input?.city),
    province: clean(input?.province),
    postalCode: clean(input?.postalCode),
    country: clean(input?.country),
    note: clean(input?.note),
  };

  const issues: AddressIssue[] = [];

  if (!draft.recipientName) issues.push({ field: "recipientName", code: "required" });
  else if (draft.recipientName.length < 2) issues.push({ field: "recipientName", code: "too_short" });
  else if (draft.recipientName.length > 80) issues.push({ field: "recipientName", code: "too_long" });
  else if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(draft.recipientName)) {
    issues.push({ field: "recipientName", code: "invalid" });
  }

  if (!draft.phone) issues.push({ field: "phone", code: "required" });
  else if (!/^\+?[\d][\d\s().-]{6,22}$/.test(draft.phone) || /[A-Za-z]/.test(draft.phone)) {
    issues.push({ field: "phone", code: "invalid" });
  } else {
    const digits = draft.phone.replace(/\D/g, "");
    if (digits.length < 8) issues.push({ field: "phone", code: "too_short" });
    else if (digits.length > 15) issues.push({ field: "phone", code: "too_long" });
  }

  if (!draft.street) issues.push({ field: "street", code: "required" });
  else if (draft.street.length < 5) issues.push({ field: "street", code: "too_short" });
  else if (draft.street.length > 120) issues.push({ field: "street", code: "too_long" });

  if (!draft.city) issues.push({ field: "city", code: "required" });
  else if (draft.city.length < 2) issues.push({ field: "city", code: "too_short" });
  else if (draft.city.length > 60) issues.push({ field: "city", code: "too_long" });

  if (!draft.province) issues.push({ field: "province", code: "required" });
  else if (draft.province.length < 2) issues.push({ field: "province", code: "too_short" });
  else if (draft.province.length > 60) issues.push({ field: "province", code: "too_long" });

  if (!draft.postalCode) issues.push({ field: "postalCode", code: "required" });
  else if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(draft.postalCode) || draft.postalCode.length < 3) {
    issues.push({ field: "postalCode", code: "invalid" });
  }

  if (!draft.country) issues.push({ field: "country", code: "required" });
  else if (draft.country.length < 2) issues.push({ field: "country", code: "too_short" });
  else if (draft.country.length > 56) issues.push({ field: "country", code: "too_long" });

  if (draft.note && draft.note.length > 200) issues.push({ field: "note", code: "too_long" });

  if (issues.length) {
    issues.sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));
    return { ok: false, issues };
  }

  const value: AddressDraft = {
    recipientName: draft.recipientName,
    phone: draft.phone,
    street: draft.street,
    city: draft.city,
    province: draft.province,
    postalCode: draft.postalCode,
    country: draft.country,
  };
  if (draft.note) value.note = draft.note;
  return { ok: true, value };
}

export class AddressRequiredError extends Error {
  constructor() {
    super("ADD_ADDRESS");
    this.name = "AddressRequiredError";
  }
}
