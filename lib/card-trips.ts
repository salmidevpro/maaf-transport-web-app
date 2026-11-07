export type CardTripItem = { description: string; quantity?: number | string; unit?: string };
export type CardTripVerification = {
  step: number;
  agent_name: string;
  outcome: "verified" | "flagged";
  notes: string;
  checked_at: string | Date;
};
export type CardTrip = {
  id: number;
  source?: "production" | "assignment" | "legacy";
  code: string;
  batch_id: number;
  serial: number;
  vehicle_class: string;
  origin: string;
  destination: string;
  status: "ready" | "in_transit" | "on_hold" | "completed";
  current_step: number;
  items: CardTripItem[];
  verifications: CardTripVerification[];
};

export function cardTripCode(batchId: number, token: string) {
  return `MAAF-BCH${String(batchId).padStart(4, "0")}-${token.toUpperCase()}`;
}

export function parseCardTripCode(value: string) {
  const normalized = value.trim().toUpperCase();
  const tokenMatch = /^MAAF-BCH(\d{4,})-([A-HJ-NP-Z2-9]{8})$/.exec(normalized);
  if (tokenMatch) {
    const batchId = Number(tokenMatch[1]);
    return Number.isSafeInteger(batchId) && batchId > 0
      ? { batchId, serial: null, token: tokenMatch[2], code: cardTripCode(batchId, tokenMatch[2]) }
      : null;
  }
  // Keep previously printed cards working while the new token format rolls out.
  const legacyMatch = /^IYEWA-(\d{4,})-(\d{5})$/.exec(normalized);
  if (!legacyMatch) return null;
  const batchId = Number(legacyMatch[1]);
  const serial = Number(legacyMatch[2]);
  return Number.isSafeInteger(batchId) && batchId > 0 && Number.isSafeInteger(serial) && serial > 0
    ? { batchId, serial, token: null, code: normalized }
    : null;
}
