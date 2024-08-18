"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAccountsByMints = findAccountsByMints;
exports.findAllMarkets = findAllMarkets;
exports.uiPriceToLots = uiPriceToLots;
exports.uiBaseToLots = uiBaseToLots;
exports.uiQuoteToLots = uiQuoteToLots;
exports.priceLotsToNative = priceLotsToNative;
exports.priceLotsToUi = priceLotsToUi;
exports.priceNativeToUi = priceNativeToUi;
exports.baseLotsToUi = baseLotsToUi;
exports.quoteLotsToUi = quoteLotsToUi;
exports.quantityToUiBase = quantityToUiBase;
const web3_js_1 = require("@solana/web3.js");
const client_1 = require("./client");
const anchor_1 = require("@coral-xyz/anchor");
const utils_1 = require("./utils/utils");
const big_js_1 = __importDefault(require("big.js"));
const openbook_v2_1 = require("./openbook-v2");
const BATCH_TX_SIZE = 50;
async function findAccountsByMints(connection, baseMintAddress, quoteMintAddress, programId) {
    const filters = [
        {
            memcmp: {
                offset: 792,
                bytes: baseMintAddress.toBase58(),
            },
        },
        {
            memcmp: {
                offset: 824,
                bytes: quoteMintAddress.toBase58(),
            },
        },
    ];
    return await (0, client_1.getFilteredProgramAccounts)(connection, programId, filters);
}
async function findAllMarkets(connection, programId = client_1.OPENBOOK_PROGRAM_ID, provider) {
    if (provider == null) {
        provider = (0, anchor_1.getProvider)();
    }
    const program = new anchor_1.Program(openbook_v2_1.IDL, programId, provider);
    const [eventAuthority] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], programId);
    const marketsAll = [];
    const signatures = (await connection.getSignaturesForAddress(eventAuthority)).map((x) => x.signature);
    const batchSignatures = [[]];
    for (let i = 0; i < signatures.length; i += BATCH_TX_SIZE) {
        batchSignatures.push(signatures.slice(0, BATCH_TX_SIZE));
    }
    for (const batch of batchSignatures) {
        const allTxs = await connection.getTransactions(batch, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
        });
        for (const tx of allTxs) {
            if (tx?.meta?.innerInstructions !== null &&
                tx?.meta?.innerInstructions !== undefined) {
                for (const innerIns of tx.meta.innerInstructions) {
                    const innerIx = innerIns.instructions?.[11];
                    if (innerIx?.accounts?.[0] !== undefined) {
                        // validate key and program key
                        const eventAuthorityKey = innerIx.accounts[0];
                        const programKey = innerIx.programIdIndex;
                        if (tx.transaction.message.staticAccountKeys[eventAuthorityKey].toString() !== eventAuthority.toString() ||
                            tx.transaction.message.staticAccountKeys[programKey].toString() !== programId.toString()) {
                            continue;
                        }
                        else {
                            const ixData = anchor_1.utils.bytes.bs58.decode(innerIx.data);
                            const eventData = anchor_1.utils.bytes.base64.encode(ixData.slice(8));
                            const event = program.coder.events.decode(eventData);
                            if (event != null) {
                                const market = {
                                    market: event.data.market.toString(),
                                    baseMint: event.data.baseMint.toString(),
                                    quoteMint: event.data.quoteMint.toString(),
                                    name: event.data.name,
                                    timestamp: tx.blockTime,
                                };
                                marketsAll.push(market);
                            }
                        }
                    }
                }
            }
        }
    }
    return marketsAll;
}
function priceLotsToUiConverter(market) {
    return new big_js_1.default(10)
        .pow(market.baseDecimals - market.quoteDecimals)
        .mul(new big_js_1.default(market.quoteLotSize.toString()))
        .div(new big_js_1.default(market.baseLotSize.toString()))
        .toNumber();
}
function baseLotsToUiConverter(market) {
    return new big_js_1.default(market.baseLotSize.toString())
        .div(new big_js_1.default(10).pow(market.baseDecimals))
        .toNumber();
}
function quoteLotsToUiConverter(market) {
    return new big_js_1.default(market.quoteLotSize.toString())
        .div(new big_js_1.default(10).pow(market.quoteDecimals))
        .toNumber();
}
function uiPriceToLots(market, price) {
    return (0, utils_1.toNative)(price, market.quoteDecimals)
        .mul(market.baseLotSize)
        .div(market.quoteLotSize.mul(new anchor_1.BN(Math.pow(10, market.baseDecimals))));
}
function uiBaseToLots(market, quantity) {
    return (0, utils_1.toNative)(quantity, market.baseDecimals).div(market.baseLotSize);
}
function uiQuoteToLots(market, uiQuote) {
    return (0, utils_1.toNative)(uiQuote, market.quoteDecimals).div(market.quoteLotSize);
}
function priceLotsToNative(market, price) {
    return price.mul(market.quoteLotSize).div(market.baseLotSize);
}
function priceLotsToUi(market, price) {
    return parseFloat(price.toString()) * priceLotsToUiConverter(market);
}
function priceNativeToUi(market, price) {
    return (0, utils_1.toUiDecimals)(price, market.quoteDecimals - market.baseDecimals);
}
function baseLotsToUi(market, quantity) {
    return parseFloat(quantity.toString()) * baseLotsToUiConverter(market);
}
function quoteLotsToUi(market, quantity) {
    return parseFloat(quantity.toString()) * quoteLotsToUiConverter(market);
}
function quantityToUiBase(market, quantity, decimals) {
    return (0, utils_1.toUiDecimals)(quantity.mul(market.baseLotSize).toNumber(), decimals);
}
