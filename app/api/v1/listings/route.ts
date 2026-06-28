import { build402, verifyPayment, gateConfig, PAYTO } from "@/lib/gateway/gate";

export const runtime = "edge";

const PRICE_LISTINGS = 2_000; // 0.002 tier
const MOCK_SYMBOLS = ["BTC","ETH","XLM","USDC","BNB","ADA","XRP","DOGE","AVAX","LINK"] as const;

export async function GET(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  const cfg = gateConfig(PRICE_LISTINGS, "Top 10 cryptocurrency listings");
  const outcome = await verifyPayment(
    { method: "GET", path: pathname, paymentHeader: req.headers.get("X-PAYMENT") },
    cfg,
  );

  if (!outcome.ok) {
    if (outcome.reason === "no-payment") {
      const r = build402({ requiredAmount: PRICE_LISTINGS, payTo: PAYTO, description: "Top 10 cryptocurrency listings", resource: pathname });
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
      data: Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1,
        symbol: MOCK_SYMBOLS[i],
        price: 1_000 + Math.random() * 50_000,
      })),
      _source: "mock",
      _proof: outcome.result.proofRef,
      _privacy: outcome.result.mode,
    }, { headers });
  }

  const upstream = await fetch(
    "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=10",
    { headers: { "X-CMC_PRO_API_KEY": cmcKey, Accept: "application/json" } },
  );
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
