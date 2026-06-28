import { build402, verifyPayment, gateConfig, PAYTO } from "@/lib/gateway/gate";

export const runtime = "edge";

const PRICE_QUOTE = 1_000; // 0.001 tier

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
): Promise<Response> {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const { pathname } = new URL(req.url);

  const cfg = gateConfig(PRICE_QUOTE, `Real-time price for ${symbol}`);
  const outcome = await verifyPayment(
    { method: "GET", path: pathname, paymentHeader: req.headers.get("X-PAYMENT") },
    cfg,
  );

  if (!outcome.ok) {
    if (outcome.reason === "no-payment") {
      const r = build402({ requiredAmount: PRICE_QUOTE, payTo: PAYTO, description: `Real-time price for ${symbol}`, resource: pathname });
      return Response.json(r.body, { status: r.status, headers: r.headers });
    }
    return Response.json({ error: "payment-rejected", reason: outcome.reason }, { status: 402 });
  }

  const headers = {
    "X-Null402-Proof": outcome.result.proofRef,
    "X-Privacy": outcome.result.mode === "soroban" ? "zk-groth16" : "dev-scaffold",
    "X-Payment-Accepted": "true",
  };

  const cmcKey = process.env.CMC_API_KEY;
  if (!cmcKey) {
    return Response.json({
      data: {
        [symbol]: {
          quote: {
            USD: {
              price: 50_000 + Math.random() * 5_000,
              volume_24h: 1_000_000_000,
              percent_change_24h: (Math.random() - 0.5) * 10,
              last_updated: new Date().toISOString(),
            },
          },
        },
      },
      _source: "mock",
      _proof: outcome.result.proofRef,
      _privacy: outcome.result.mode,
    }, { headers });
  }

  const upstream = await fetch(
    `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbol)}`,
    { headers: { "X-CMC_PRO_API_KEY": cmcKey, Accept: "application/json" } },
  );
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
