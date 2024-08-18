"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const src_1 = require("../src");
const anchor_1 = require("@coral-xyz/anchor");
const { RPC_URL, WALLET_PATH, KEYPAIR, PROGRAM_ID, INTERVAL, CONSUME_EVENTS_LIMIT, CLUSTER, MARKETS, // comma separated list of market pubkeys to crank
PRIORITY_QUEUE_LIMIT, // queue length at which to apply the priority fee
PRIORITY_CU_PRICE, // extra microlamports per cu for high fee markets
PRIORITY_CU_LIMIT, // compute limit
MAX_TX_INSTRUCTIONS, // max instructions per transaction
CU_PRICE, // extra microlamports per cu for any transaction
PRIORITY_MARKETS, // input to add comma seperated list of markets that force fee bump
 } = process.env;
const cluster = CLUSTER || 'mainnet';
const interval = parseInt(INTERVAL || '1000');
const consumeEventsLimit = new bn_js_1.default(CONSUME_EVENTS_LIMIT || '19');
const priorityMarkets = PRIORITY_MARKETS ? PRIORITY_MARKETS.split(',') : [];
const priorityQueueLimit = parseInt(PRIORITY_QUEUE_LIMIT || '100');
const cuPrice = parseInt(CU_PRICE || '0');
const priorityCuPrice = parseInt(PRIORITY_CU_PRICE || '100000');
const CuLimit = parseInt(PRIORITY_CU_LIMIT || '50000');
const maxTxInstructions = parseInt(MAX_TX_INSTRUCTIONS || '1');
const programId = new web3_js_1.PublicKey(PROGRAM_ID || cluster == 'mainnet'
    ? 'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb'
    : 'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb');
const walletFile = process.env.WALLET_PATH || os.homedir() + '/dev/openbook-v2/ts/client/src/wallet.json';
console.log("Loaded MARKETS:", MARKETS);
const payer = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(KEYPAIR || fs.readFileSync(walletFile, 'utf-8'))));
const wallet = new anchor_1.Wallet(payer);
const defaultRpcUrls = {
    'mainnet': 'https://api.mainnet-beta.solana.com',
    'testnet': 'https://api.testnet.solana.com',
    'devnet': 'https://api.devnet.solana.com',
};
const rpcUrl = RPC_URL ? RPC_URL : defaultRpcUrls[cluster];
console.log(payer.publicKey.toString());
const connection = new web3_js_1.Connection(rpcUrl, 'processed');
// blockhash loop
let recentBlockhash;
try {
    connection.getLatestBlockhash('finalized').then((blockhash) => {
        recentBlockhash = blockhash;
    });
}
catch (e) {
    console.error(`Couldn't get blockhash: ${e}`);
}
setInterval(async () => {
    try {
        recentBlockhash = await connection.getLatestBlockhash('finalized');
    }
    catch (e) {
        console.error(`Couldn't get blockhash: ${e}`);
    }
}, 1000);
async function run() {
    // list of markets to crank
    const provider = new anchor_1.AnchorProvider(connection, wallet, {});
    const client = new src_1.OpenBookV2Client(provider, programId, {});
    const marketPks = MARKETS ? MARKETS.split(',').map((m) => new web3_js_1.PublicKey(m)) : [];
    if (!marketPks.length) {
        console.error('No valid market pubkeys provided!');
        return;
    }
    const markets = await client.program.account.market.fetchMultiple(marketPks);
    const eventHeapPks = markets.map((m) => m.eventHeap);
    //pass a minimum Context Slot to GMA
    let minContextSlot = 0;
    while (true) {
        try {
            let crankInstructionsQueue = [];
            let instructionBumpMap = new Map();
            const eventHeapAccounts = await client.program.account.eventHeap.fetchMultipleAndContext(eventHeapPks);
            const contextSlot = eventHeapAccounts[0].context.slot;
            //increase the minContextSlot to avoid processing the same slot twice
            if (contextSlot < minContextSlot) {
                console.log(`already processed slot ${contextSlot}, skipping...`);
            }
            minContextSlot = contextSlot + 1;
            for (let i = 0; i < eventHeapAccounts.length; i++) {
                const eventHeap = eventHeapAccounts[i].data;
                const heapSize = eventHeap.header.count;
                const market = markets[i];
                const marketPk = marketPks[i];
                if (heapSize === 0)
                    continue;
                const remainingAccounts = await client.getAccountsToConsume(market, eventHeap);
                const consumeEventsIx = await client.consumeEventsIx(marketPk, market, consumeEventsLimit, remainingAccounts);
                crankInstructionsQueue.push(consumeEventsIx);
                //if the queue is large then add the priority fee
                if (heapSize > priorityQueueLimit) {
                    instructionBumpMap.set(consumeEventsIx, 1);
                }
                //bump transaction fee if market address is included in PRIORITY_MARKETS env
                if (priorityMarkets.includes(marketPk.toString())) {
                    instructionBumpMap.set(consumeEventsIx, 1);
                }
                console.log(`market ${marketPk} creating consume events for ${heapSize} events (${remainingAccounts.length} accounts)`);
            }
            //send the crank transaction if there are markets that need cranked
            if (crankInstructionsQueue.length > 0) {
                //chunk the instructions to ensure transactions are not too large
                let chunkedCrankInstructions = (0, src_1.chunk)(crankInstructionsQueue, maxTxInstructions);
                chunkedCrankInstructions.forEach((transactionInstructions) => {
                    let shouldBumpFee = false;
                    let crankTransaction = new web3_js_1.Transaction({ ...recentBlockhash });
                    crankTransaction.add(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
                        units: CuLimit * maxTxInstructions,
                    }));
                    transactionInstructions.forEach(function (crankInstruction) {
                        //check the instruction for flag to bump fee
                        instructionBumpMap.get(crankInstruction)
                            ? (shouldBumpFee = true)
                            : null;
                    });
                    if (shouldBumpFee || cuPrice) {
                        crankTransaction.add(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
                            microLamports: shouldBumpFee ? priorityCuPrice : cuPrice,
                        }));
                    }
                    crankTransaction.add(...transactionInstructions);
                    crankTransaction.sign(payer);
                    //send the transaction
                    connection
                        .sendRawTransaction(crankTransaction.serialize(), {
                        skipPreflight: true,
                        maxRetries: 2,
                    })
                        .then((txId) => console.log(`Cranked ${transactionInstructions.length} market(s): ${txId}`));
                });
            }
        }
        catch (e) {
            if (e instanceof Error) {
                switch (e.message) {
                    case 'Minimum context slot has not been reached':
                        //lightweight warning message for known "safe" errors
                        console.warn(e.message);
                        break;
                    default:
                        console.error(e);
                }
            }
        }
        await (0, src_1.sleep)(interval);
    }
}
run();
