"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComputeBudgetIx = void 0;
exports.sendTransaction = sendTransaction;
const nodewallet_1 = __importDefault(require("@coral-xyz/anchor/dist/cjs/nodewallet"));
const web3_js_1 = require("@solana/web3.js");
async function sendTransaction(provider, ixs, alts, opts = {}) {
    const connection = provider.connection;
    const additionalSigners = opts?.additionalSigners || [];
    if (connection.banksClient !== undefined) {
        const tx = new web3_js_1.Transaction();
        for (const ix of ixs) {
            tx.add(ix);
        }
        tx.feePayer = provider.wallet.publicKey;
        [tx.recentBlockhash] = await connection.banksClient.getLatestBlockhash();
        for (const signer of additionalSigners) {
            tx.partialSign(signer);
        }
        await connection.banksClient.processTransaction(tx);
        return '';
    }
    const latestBlockhash = opts?.latestBlockhash ??
        (await connection.getLatestBlockhash(opts?.preflightCommitment ??
            provider.opts.preflightCommitment ??
            'finalized'));
    const payer = provider.wallet;
    if (opts?.prioritizationFee !== null && opts.prioritizationFee !== 0) {
        ixs = [(0, exports.createComputeBudgetIx)(opts.prioritizationFee), ...ixs];
    }
    const message = web3_js_1.MessageV0.compile({
        payerKey: payer.publicKey,
        instructions: ixs,
        recentBlockhash: latestBlockhash.blockhash,
        addressLookupTableAccounts: alts,
    });
    let vtx = new web3_js_1.VersionedTransaction(message);
    if (additionalSigners !== undefined && additionalSigners.length !== 0) {
        vtx.sign([...additionalSigners]);
    }
    if (typeof payer.signTransaction === 'function' &&
        !(payer instanceof nodewallet_1.default || payer.constructor.name === 'NodeWallet')) {
        vtx = (await payer.signTransaction(vtx));
    }
    else {
        // Maybe this path is only correct for NodeWallet?
        vtx.sign([payer.payer]);
    }
    const signature = await connection.sendRawTransaction(vtx.serialize(), {
        skipPreflight: true, // mergedOpts.skipPreflight,
    });
    // console.log(`sent tx base64=${Buffer.from(vtx.serialize()).toString('base64')}`);
    if (opts?.postSendTxCallback !== undefined &&
        opts?.postSendTxCallback !== null) {
        try {
            opts.postSendTxCallback({ txid: signature });
        }
        catch (e) {
            console.warn(`postSendTxCallback error`, e);
        }
    }
    const txConfirmationCommitment = opts?.txConfirmationCommitment ?? 'processed';
    let result;
    if (latestBlockhash.blockhash != null &&
        latestBlockhash.lastValidBlockHeight != null) {
        result = (await connection.confirmTransaction({
            signature: signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        }, txConfirmationCommitment)).value;
    }
    else {
        result = (await connection.confirmTransaction(signature, txConfirmationCommitment)).value;
    }
    if (result.err !== '' && result.err !== null) {
        console.warn('Tx failed result: ', result);
        throw new OpenBookError({
            txid: signature,
            message: `${JSON.stringify(result)}`,
        });
    }
    return signature;
}
const createComputeBudgetIx = (microLamports) => {
    const computeBudgetIx = web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports,
    });
    return computeBudgetIx;
};
exports.createComputeBudgetIx = createComputeBudgetIx;
class OpenBookError extends Error {
    message;
    txid;
    constructor({ txid, message }) {
        super();
        this.message = message;
        this.txid = txid;
    }
}
