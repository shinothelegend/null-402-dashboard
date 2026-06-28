import * as Stellar from "@stellar/stellar-sdk";
import { fieldToBytes, g1ToBytes, g2ToBytes } from "null-402";

// @stellar/stellar-sdk needs Node APIs — not the edge runtime.
export const runtime = "nodejs";

const RPC = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const VERIFIER = process.env.VERIFIER_CONTRACT_ID ?? "CDCYYFSJ7QC7RO6L2DHWK6X6IMZ5U5J3IEAKLKTBTBDX45LWO32JQJLV";
// A funded testnet account, used read-only to simulate `verify` (never signs).
const SOURCE = process.env.STELLAR_SOURCE_ACCOUNT ?? "GCCNVKTTTRIINEBPH7LPERQ7KSJYEP7ZCDMH2A62Z7IJTDBZ4LHMPEYW";

/** Verify a browser-generated Groth16 proof ON-CHAIN (Soroban BN254 pairing). */
export async function POST(req: Request): Promise<Response> {
  try {
    const { proof, publicSignals } = await req.json();
    const { rpc, Contract, TransactionBuilder, scValToNative, Networks, BASE_FEE, xdr } = Stellar as any;

    const server = new rpc.Server(RPC);
    const source = await server.getAccount(SOURCE);
    const contract = new Contract(VERIFIER);

    const sym = (s: string) => xdr.ScVal.scvSymbol(s);
    const bytes = (u: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(u));
    const proofScVal = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: sym("a"), val: bytes(g1ToBytes(proof.pi_a)) }),
      new xdr.ScMapEntry({ key: sym("b"), val: bytes(g2ToBytes(proof.pi_b)) }),
      new xdr.ScMapEntry({ key: sym("c"), val: bytes(g1ToBytes(proof.pi_c)) }),
    ]);
    const order = [
      publicSignals.nullifier, publicSignals.merkleRoot, publicSignals.payTo,
      publicSignals.requiredAmount, publicSignals.contextHash,
    ];
    const pubScVal = xdr.ScVal.scvVec(order.map((s: string) => bytes(fieldToBytes(s))));

    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(contract.call("verify", proofScVal, pubScVal))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    const valid =
      !rpc.Api.isSimulationError(sim) && !!sim.result?.retval && scValToNative(sim.result.retval) === true;

    return Response.json({ valid, mode: "soroban", verifier: VERIFIER });
  } catch (err) {
    return Response.json({ valid: false, error: (err as Error).message }, { status: 500 });
  }
}
