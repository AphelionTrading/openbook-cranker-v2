"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_FEE_UNIT = exports.I64_MAX_BN = exports.U64_MAX_BN = exports.SelfTradeBehaviorUtils = exports.PlaceOrderTypeUtils = exports.SideUtils = void 0;
exports.bpsToDecimal = bpsToDecimal;
exports.percentageToDecimal = percentageToDecimal;
exports.toNative = toNative;
exports.toUiDecimals = toUiDecimals;
exports.getAssociatedTokenAddress = getAssociatedTokenAddress;
exports.createAssociatedTokenAccountIdempotentInstruction = createAssociatedTokenAccountIdempotentInstruction;
exports.sleep = sleep;
exports.chunk = chunk;
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const spl_token_1 = require("@solana/spl-token");
exports.SideUtils = {
    Bid: { bid: {} },
    Ask: { ask: {} },
};
exports.PlaceOrderTypeUtils = {
    Limit: { limit: {} },
    ImmediateOrCancel: { immediateOrCancel: {} },
    FillOrKill: { fillOrKill: {} },
    PostOnly: { postOnly: {} },
    Market: { market: {} },
    PostOnlySlide: { postOnlySlide: {} },
};
exports.SelfTradeBehaviorUtils = {
    DecrementTake: { decrementTake: {} },
    CancelProvide: { cancelProvide: {} },
    AbortTransaction: { abortTransaction: {} },
};
///
/// numeric helpers
///
exports.U64_MAX_BN = new bn_js_1.default('18446744073709551615');
exports.I64_MAX_BN = new bn_js_1.default('9223372036854775807').toTwos(64);
exports.ORDER_FEE_UNIT = new bn_js_1.default(1e6);
function bpsToDecimal(bps) {
    return bps / 10000;
}
function percentageToDecimal(percentage) {
    return percentage / 100;
}
function toNative(uiAmount, decimals) {
    return new bn_js_1.default((uiAmount * Math.pow(10, decimals)).toFixed(0));
}
function toUiDecimals(nativeAmount, decimals) {
    return nativeAmount / Math.pow(10, decimals);
}
///
///
/// web3js extensions
///
/**
 * Get the address of the associated token account for a given mint and owner
 *
 * @param mint                     Token mint account
 * @param owner                    Owner of the new account
 * @param allowOwnerOffCurve       Allow the owner account to be a PDA (Program Derived Address)
 * @param programId                SPL Token program account
 * @param associatedTokenProgramId SPL Associated Token program account
 *
 * @return Address of the associated token account
 */
async function getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve = true, programId = spl_token_1.TOKEN_PROGRAM_ID, associatedTokenProgramId = spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID) {
    if (!allowOwnerOffCurve && !web3_js_1.PublicKey.isOnCurve(owner.toBuffer()))
        throw new Error('TokenOwnerOffCurve!');
    const [address] = await web3_js_1.PublicKey.findProgramAddress([owner.toBuffer(), programId.toBuffer(), mint.toBuffer()], associatedTokenProgramId);
    return address;
}
async function createAssociatedTokenAccountIdempotentInstruction(payer, owner, mint) {
    const account = await getAssociatedTokenAddress(mint, owner);
    return new web3_js_1.TransactionInstruction({
        keys: [
            { pubkey: payer, isSigner: true, isWritable: true },
            { pubkey: account, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            {
                pubkey: web3_js_1.SystemProgram.programId,
                isSigner: false,
                isWritable: false,
            },
            { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.from([0x1]),
    });
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/// chunk function to ensure transactions are not too large
function chunk(array, size) {
    return Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) => array.slice(index * size, (index + 1) * size));
}
