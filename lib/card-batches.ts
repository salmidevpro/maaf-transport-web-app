export const cardVehicleClasses = ["Cars", "Jeep", "Bus"] as const;
export const cardDestinations = ["Oyo", "Olorunda", "Target", "Jimba"] as const;
export const cardsPerBatch = 250;
export const cardsPerProductionBatch = 5000;

export type CardVehicleClass = string;
export type CardDestination = string;
export type TransportCardBatch = {
  id: number;
  vehicle_class: CardVehicleClass;
  destination: CardDestination;
  allocated_quantity: number;
  assigned_quantity?: number;
  fare_ngn: number | string | null;
};

export type TransportCardCategory = TransportCardBatch & {
  production_batch_id: number;
  legacy_batch_id: number | null;
};

export type TransportProductionBatch = {
  id: number;
  batch_date: string;
  created_at: string | Date;
  range_start: number;
  allocated_quantity: number;
  assigned_quantity: number;
  categories: TransportCardCategory[];
};

export function productionBatchRangeStart(batchId: number) {
  return (batchId - 1) * cardsPerProductionBatch + 1;
}

export function cardBatchKey(vehicleClass: CardVehicleClass, destination: CardDestination) {
  return `${vehicleClass.toLowerCase()}-${destination.toLowerCase()}`;
}

