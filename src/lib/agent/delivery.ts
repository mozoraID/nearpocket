/**
 * Attach the saved delivery address when the agent queues a purchase.
 * The address is a device profile. This module does not call a marketplace.
 */

export interface SavedDeliveryRef {
  shipTo?: string;
  addressId?: string;
}

export function attachSavedAddress<T extends { notes?: string; shipTo?: string; deliveryAddressId?: string }>(
  item: T,
  delivery?: SavedDeliveryRef | null,
): { item: T; needsAddress: boolean } {
  const shipTo = delivery?.shipTo?.trim();
  if (!shipTo) return { item, needsAddress: true };
  const noteLine = `Ship to: ${shipTo}`;
  const notes = item.notes?.includes(noteLine)
    ? item.notes
    : [item.notes, noteLine].filter(Boolean).join("\n");
  return {
    needsAddress: false,
    item: {
      ...item,
      shipTo,
      deliveryAddressId: delivery?.addressId,
      notes,
    },
  };
}
