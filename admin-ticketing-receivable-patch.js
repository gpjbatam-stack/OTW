/* PATCH admin-ticketing.js — receivable/payment control
   Replace the existing loadCurrentReceivable() with this version.
   It deliberately queries by flight_orders.id -> receivables.flight_order_id.
*/
async function loadCurrentReceivable(){
  currentReceivable = null;
  if (!currentOrder?.id) return null;

  const orderId = String(currentOrder.id).trim();

  const { data, error } = await supabase
    .from("receivables")
    .select(`
      id,
      flight_order_id,
      principal_amount,
      paid_amount,
      outstanding_amount,
      issued_at,
      arrived_batam_at,
      due_date,
      effective_due_date,
      status,
      booking_blocked
    `)
    .eq("flight_order_id", orderId)
    .limit(1);

  if (error) {
    console.error("[LetsGo Receivable] query failed", {
      order_id: orderId,
      order_code: currentOrder?.order_code,
      error
    });
    return null;
  }

  currentReceivable = Array.isArray(data) && data.length ? data[0] : null;

  console.info("[LetsGo Receivable] loaded", {
    order_id: orderId,
    order_code: currentOrder?.order_code,
    receivable: currentReceivable
  });

  return currentReceivable;
}
