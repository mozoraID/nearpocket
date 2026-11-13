/**
 * Request ids live in the contract's UnorderedMap index.
 * StorageKey::Requests is enum variant 2. The index prefix is that byte plus `i`.
 * The map key is: u32 length, then u16 account length, account bytes, id bytes.
 * Reading this index lists one wallet's requests without a new contract method.
 */
const REQUESTS_VARIANT = 2;
const INDEX_MARKER = 0x69;

export function requestIdFromIndexKey(key: Uint8Array, accountId: string): string | null {
  if (key.length < 8 || key[0] !== REQUESTS_VARIANT || key[1] !== INDEX_MARKER) return null;
  const innerLen = key[2] | (key[3] << 8) | (key[4] << 16) | (key[5] << 24);
  if (innerLen <= 2 || key.length < 6 + innerLen) return null;
  const inner = key.subarray(6, 6 + innerLen);
  const nameLen = inner[0] | (inner[1] << 8);
  if (nameLen <= 0 || inner.length <= 2 + nameLen) return null;
  const name = new TextDecoder().decode(inner.subarray(2, 2 + nameLen));
  if (name !== accountId) return null;
  const id = new TextDecoder().decode(inner.subarray(2 + nameLen));
  return id.length ? id : null;
}

export const REQUEST_INDEX_PREFIX = Uint8Array.from([REQUESTS_VARIANT, INDEX_MARKER]);
