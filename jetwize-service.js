// OTW Jetwize Adapter
// IMPORTANT: Keep Jetwize secret credentials server-side.
// Replace the placeholder config ONLY after receiving Jetwize's official API documentation.

const JETWIZE = {
  configured: false,
  endpoint: "",
};

function requireConfig() {
  if (!JETWIZE.configured || !JETWIZE.endpoint) {
    throw new Error("JETWIZE_NOT_CONFIGURED");
  }
}

export async function searchFlights(params) {
  requireConfig();

  // DO NOT put private API keys in this frontend file.
  // Recommended production flow:
  // browser -> Supabase Edge Function -> Jetwize API
  const response = await fetch(JETWIZE.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Jetwize search failed (${response.status})`);
  }

  const raw = await response.json();
  return normalizeJetwizeResponse(raw);
}

export function normalizeJetwizeResponse(raw) {
  // Map Jetwize's actual response here after documentation/sample response is provided.
  // Expected normalized shape for OTW:
  // [{ id, airlineCode, airlineName, airlineLogo, flightNumber,
  //    departureTime, arrivalTime, durationMinutes, stops, baggage,
  //    cabin, supplierPrice, currency, raw }]
  if (Array.isArray(raw?.flights)) return raw.flights;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw)) return raw;
  return [];
}
