import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TransportCardPrint } from "@/components/transport-card-print";
import { cardsPerProductionBatch, type TransportCardBatch } from "@/lib/card-batches";
import { queryRows } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Print route cards", robots: { index: false, follow: false } };

export default async function PrintTransportCardBatch({ params, searchParams }: { params: Promise<{ batch: string }>; searchParams: Promise<{ trip?: string }> }) {
  const [{ batch: batchKey }, search] = await Promise.all([params, searchParams]);
  const requestedTripId = search.trip && /^-?\d+$/.test(search.trip) ? Number(search.trip) : undefined;
  const selectedTripId = requestedTripId !== undefined && requestedTripId !== 0 && Number.isSafeInteger(requestedTripId) ? requestedTripId : undefined;
  if (!/^\d+$/.test(batchKey)) notFound();
  const batchId = Number(batchKey);
  const rows = await queryRows<TransportCardBatch & { production_batch_id: number; range_start: number | string; batch_date: string }>(
    `SELECT c.id, c.production_batch_id, c.vehicle_class, c.destination, c.allocated_quantity, c.fare_ngn,
       ((b.id - 1) * ${cardsPerProductionBatch} + 1) AS range_start, b.batch_date
     FROM transport_production_categories c JOIN transport_production_batches b ON b.id = c.production_batch_id
     WHERE c.id = ? LIMIT 1`,
    [batchId],
  );
  if (!rows[0]) {
    const legacy = await queryRows<TransportCardBatch>("SELECT id, vehicle_class, destination, allocated_quantity, fare_ngn FROM transport_card_batches WHERE id = ? LIMIT 1", [batchId]);
    if (!legacy[0]) notFound();
    return <TransportCardPrint batchId={legacy[0].id} vehicleClass={legacy[0].vehicle_class} destination={legacy[0].destination} quantity={Number(legacy[0].allocated_quantity)} selectedTripId={selectedTripId} />;
  }
  return <TransportCardPrint batchId={rows[0].id} productionBatchId={Number(rows[0].production_batch_id)} rangeStart={Number(rows[0].range_start)} vehicleClass={rows[0].vehicle_class} destination={rows[0].destination} quantity={Number(rows[0].allocated_quantity)} selectedTripId={selectedTripId} />;
}
