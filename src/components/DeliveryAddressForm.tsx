"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import {
  validateDeliveryAddress,
  type AddressDraft,
  type AddressField,
  type DeliveryAddress,
} from "@/lib/address";
import { useNearPocketStore } from "@/lib/store";
import { getDisplayCurrency } from "@/lib/region/display-currency";

const EMPTY: AddressDraft = {
  recipientName: "",
  phone: "",
  street: "",
  city: "",
  province: "",
  postalCode: "",
  country: "",
  note: "",
};

const ERROR_KEY: Record<AddressField, string> = {
  recipientName: "address.errName",
  phone: "address.errPhone",
  street: "address.errStreet",
  city: "address.errCity",
  province: "address.errProvince",
  postalCode: "address.errPostal",
  country: "address.errCountry",
  note: "address.errNote",
};

export function DeliveryAddressForm({
  initial,
  forceDefault,
  onSaved,
}: {
  initial?: Partial<DeliveryAddress> | null;
  forceDefault?: boolean;
  onSaved?: (address: DeliveryAddress) => void;
}) {
  const t = useT();
  const saveAddress = useNearPocketStore((s) => s.saveAddress);
  const displayCurrency = useNearPocketStore((s) => s.displayCurrency);
  const suggestedCountry = getDisplayCurrency(displayCurrency).country;
  const [draft, setDraft] = useState<AddressDraft>(() => ({
    ...EMPTY,
    recipientName: initial?.recipientName || "",
    phone: initial?.phone || "",
    street: initial?.street || "",
    city: initial?.city || "",
    province: initial?.province || "",
    postalCode: initial?.postalCode || "",
    country: initial?.country || suggestedCountry,
    note: initial?.note || "",
  }));
  const [asDefault, setAsDefault] = useState(initial?.isDefault !== false);
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({});

  function set<K extends keyof AddressDraft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    const parsed = validateDeliveryAddress(draft);
    if (!parsed.ok) {
      const next: Partial<Record<AddressField, string>> = {};
      for (const issue of parsed.issues) {
        if (!next[issue.field]) next[issue.field] = t(ERROR_KEY[issue.field]);
      }
      setErrors(next);
      return;
    }
    const saved = saveAddress({
      ...parsed.value,
      id: initial?.id,
      isDefault: forceDefault ? true : asDefault,
    });
    if (!saved.ok) return;
    setErrors({});
    onSaved?.(saved.address);
  }

  const fields: { key: keyof AddressDraft; label: string; optional?: boolean }[] = [
    { key: "recipientName", label: t("address.recipient") },
    { key: "phone", label: t("address.phone") },
    { key: "street", label: t("address.street") },
    { key: "city", label: t("address.city") },
    { key: "province", label: t("address.province") },
    { key: "postalCode", label: t("address.postal") },
    { key: "country", label: t("address.country") },
    { key: "note", label: t("address.note"), optional: true },
  ];

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {fields.map((field) => (
        <label key={field.key} className="block space-y-1.5">
          <span className="text-sm text-warm-600">{field.label}</span>
          <input
            className="input"
            value={draft[field.key] || ""}
            onChange={(e) => set(field.key, e.target.value)}
            autoComplete={field.key === "phone" ? "tel" : field.key === "postalCode" ? "postal-code" : "on"}
          />
          {errors[field.key] ? <span className="block text-xs text-[#8a2d1c]">{errors[field.key]}</span> : null}
        </label>
      ))}
      {!forceDefault && (
        <label className="flex items-center justify-between rounded-2xl bg-cream-200 px-4 py-3">
          <span className="text-sm font-medium">{t("address.makeDefault")}</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#111]"
            checked={asDefault}
            onChange={(e) => setAsDefault(e.target.checked)}
          />
        </label>
      )}
      <button type="submit" className="btn-primary w-full">
        {t("common.save")}
      </button>
    </form>
  );
}
