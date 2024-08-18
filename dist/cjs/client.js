"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenBookV2Client = exports.OPENBOOK_PROGRAM_ID = void 0;
exports.nameToString = nameToString;
exports.getFilteredProgramAccounts = getFilteredProgramAccounts;
const anchor_1 = require("@coral-xyz/anchor");
const bytes_1 = require("@coral-xyz/anchor/dist/cjs/utils/bytes");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const openbook_v2_1 = require("./openbook-v2");
const rpc_1 = require("./utils/rpc");
function nameToString(name) {
    return bytes_1.utf8.decode(new Uint8Array(name)).split('\x00')[0];
}
const BooksideSpace = 90944 + 8;
const EventHeapSpace = 91280 + 8;
exports.OPENBOOK_PROGRAM_ID = new web3_js_1.PublicKey('opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb');
class OpenBookV2Client {
    provider;
    programId;
    opts;
    program;
    referrerWallet;
    idsSource;
    postSendTxCallback;
    prioritizationFee;
    txConfirmationCommitment;
    constructor(provider, programId = exports.OPENBOOK_PROGRAM_ID, opts = {}) {
        this.provider = provider;
        this.programId = programId;
        this.opts = opts;
        this.program = new anchor_1.Program(openbook_v2_1.IDL, programId, provider);
        this.idsSource = opts.idsSource ?? 'get-program-accounts';
        this.prioritizationFee = opts?.prioritizationFee ?? 0;
        this.postSendTxCallback = opts?.postSendTxCallback;
        this.txConfirmationCommitment =
            opts?.txConfirmationCommitment ??
                (this.program.provider.opts !== undefined
                    ? this.program.provider.opts.commitment
                    : undefined) ??
                'processed';
        this.referrerWallet = opts.referrerWallet;
        // TODO: evil side effect, but limited backtraces are a nightmare
        Error.stackTraceLimit = 1000;
    }
    /// Convenience accessors
    get connection() {
        return this.program.provider.connection;
    }
    get walletPk() {
        return this.program.provider.wallet.publicKey;
    }
    setProvider(provider) {
        this.program = new anchor_1.Program(openbook_v2_1.IDL, this.programId, provider);
    }
    /// Transactions
    async sendAndConfirmTransaction(ixs, opts = {}) {
        return await (0, rpc_1.sendTransaction)(this.program.provider, ixs, opts.alts ?? [], {
            postSendTxCallback: this.postSendTxCallback,
            prioritizationFee: this.prioritizationFee,
            txConfirmationCommitment: this.txConfirmationCommitment,
            ...opts,
        });
    }
    async createProgramAccount(authority, size) {
        const lamports = await this.connection.getMinimumBalanceForRentExemption(size);
        const address = web3_js_1.Keypair.generate();
        const tx = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.createAccount({
            fromPubkey: authority.publicKey,
            newAccountPubkey: address.publicKey,
            lamports,
            space: size,
            programId: this.programId,
        })).instructions;
        await this.sendAndConfirmTransaction(tx, {
            additionalSigners: [authority, address],
        });
        return address.publicKey;
    }
    async createProgramAccountIx(authority, size) {
        const lamports = await this.connection.getMinimumBalanceForRentExemption(size);
        const address = web3_js_1.Keypair.generate();
        const ix = web3_js_1.SystemProgram.createAccount({
            fromPubkey: authority,
            newAccountPubkey: address.publicKey,
            lamports,
            space: size,
            programId: this.programId,
        });
        return [ix, address];
    }
    async deserializeOpenOrderAccount(publicKey) {
        try {
            return await this.program.account.openOrdersAccount.fetch(publicKey);
        }
        catch {
            return null;
        }
    }
    async deserializeOpenOrdersIndexerAccount(publicKey) {
        try {
            return await this.program.account.openOrdersIndexer.fetch(publicKey);
        }
        catch {
            return null;
        }
    }
    async deserializeEventHeapAccount(publicKey) {
        try {
            return await this.program.account.eventHeap.fetch(publicKey);
        }
        catch {
            return null;
        }
    }
    async createMarketIx(payer, name, quoteMint, baseMint, quoteLotSize, baseLotSize, makerFee, takerFee, timeExpiry, oracleA, oracleB, openOrdersAdmin, consumeEventsAdmin, closeMarketAdmin, oracleConfigParams = {
        confFilter: 0.1,
        maxStalenessSlots: 100,
    }, market = web3_js_1.Keypair.generate(), collectFeeAdmin) {
        const [bidIx, bidsKeypair] = await this.createProgramAccountIx(payer, BooksideSpace);
        const [askIx, askKeypair] = await this.createProgramAccountIx(payer, BooksideSpace);
        const [eventHeapIx, eventHeapKeypair] = await this.createProgramAccountIx(payer, EventHeapSpace);
        const [marketAuthority] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('Market'), market.publicKey.toBuffer()], this.program.programId);
        const baseVault = (0, spl_token_1.getAssociatedTokenAddressSync)(baseMint, marketAuthority, true);
        const quoteVault = (0, spl_token_1.getAssociatedTokenAddressSync)(quoteMint, marketAuthority, true);
        const [eventAuthority] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], this.program.programId);
        const ix = await this.program.methods
            .createMarket(name, oracleConfigParams, quoteLotSize, baseLotSize, makerFee, takerFee, timeExpiry)
            .accounts({
            market: market.publicKey,
            marketAuthority,
            bids: bidsKeypair.publicKey,
            asks: askKeypair.publicKey,
            eventHeap: eventHeapKeypair.publicKey,
            payer,
            marketBaseVault: baseVault,
            marketQuoteVault: quoteVault,
            baseMint,
            quoteMint,
            systemProgram: web3_js_1.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
            oracleA,
            oracleB,
            collectFeeAdmin: collectFeeAdmin != null ? collectFeeAdmin : payer,
            openOrdersAdmin,
            consumeEventsAdmin,
            closeMarketAdmin,
            eventAuthority,
            program: this.programId,
        })
            .instruction();
        return [
            [bidIx, askIx, eventHeapIx, ix],
            [market, bidsKeypair, askKeypair, eventHeapKeypair],
        ];
    }
    // Book and EventHeap must be empty before closing a market.
    // Make sure to call consumeEvents and pruneOrders before closing the market.
    async closeMarketIx(marketPublicKey, market, solDestination, closeMarketAdmin = null) {
        const ix = await this.program.methods
            .closeMarket()
            .accounts({
            closeMarketAdmin: market.closeMarketAdmin.key,
            market: marketPublicKey,
            asks: market.asks,
            bids: market.bids,
            eventHeap: market.eventHeap,
            solDestination: solDestination,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .instruction();
        const signers = [];
        if (this.walletPk !== market.closeMarketAdmin.key &&
            closeMarketAdmin !== null) {
            signers.push(closeMarketAdmin);
        }
        return [ix, signers];
    }
    // Each owner has one open order indexer
    findOpenOrdersIndexer(owner = this.walletPk) {
        const [openOrdersIndexer] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('OpenOrdersIndexer'), owner.toBuffer()], this.programId);
        return openOrdersIndexer;
    }
    async createOpenOrdersIndexer(openOrdersIndexer) {
        const ix = await this.program.methods
            .createOpenOrdersIndexer()
            .accounts({
            openOrdersIndexer,
            owner: this.walletPk,
            payer: this.walletPk,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .instruction();
        return await this.sendAndConfirmTransaction([ix]);
    }
    async createOpenOrdersIndexerIx(openOrdersIndexer, owner = this.walletPk) {
        return await this.program.methods
            .createOpenOrdersIndexer()
            .accounts({
            openOrdersIndexer,
            owner,
            payer: this.walletPk,
        })
            .instruction();
    }
    async findAllOpenOrders(owner = this.walletPk) {
        const indexer = this.findOpenOrdersIndexer(owner);
        const indexerAccount = await this.deserializeOpenOrdersIndexerAccount(indexer);
        return indexerAccount?.addresses ?? [];
    }
    findOpenOrderAtIndex(owner = this.walletPk, accountIndex) {
        const [openOrders] = web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from('OpenOrders'),
            owner.toBuffer(),
            accountIndex.toArrayLike(Buffer, 'le', 4),
        ], this.programId);
        return openOrders;
    }
    async findOpenOrdersForMarket(owner = this.walletPk, market) {
        const openOrdersForMarket = [];
        const allOpenOrders = await this.findAllOpenOrders(owner);
        for await (const openOrders of allOpenOrders) {
            const openOrdersAccount = await this.deserializeOpenOrderAccount(openOrders);
            if (openOrdersAccount?.market.toString() === market.toString()) {
                openOrdersForMarket.push(openOrders);
            }
        }
        return openOrdersForMarket;
    }
    // If the owner doesn't have an open order indexer, this ix will also add the creation of it.
    // An open order indexer is needed before creating an open orders account.
    async createOpenOrdersIx(market, name, owner = this.walletPk, delegateAccount, openOrdersIndexer) {
        const ixs = [];
        let accountIndex = new anchor_1.BN(1);
        if (openOrdersIndexer == null)
            openOrdersIndexer = this.findOpenOrdersIndexer(owner);
        try {
            const storedIndexer = await this.deserializeOpenOrdersIndexerAccount(openOrdersIndexer);
            if (storedIndexer == null) {
                ixs.push(await this.createOpenOrdersIndexerIx(openOrdersIndexer, owner));
            }
            else {
                accountIndex = new anchor_1.BN(storedIndexer.createdCounter + 1);
            }
        }
        catch {
            ixs.push(await this.createOpenOrdersIndexerIx(openOrdersIndexer, owner));
        }
        const openOrdersAccount = this.findOpenOrderAtIndex(owner, accountIndex);
        ixs.push(await this.program.methods
            .createOpenOrdersAccount(name)
            .accounts({
            openOrdersIndexer,
            openOrdersAccount,
            market,
            owner,
            delegateAccount,
            payer: this.walletPk,
            // systemProgram: SystemProgram.programId,
        })
            .instruction());
        return [ixs, openOrdersAccount];
    }
    async createOpenOrders(payer, market, name, owner = payer, delegateAccount = null) {
        const [ixs, openOrdersAccount] = await this.createOpenOrdersIx(market, name, owner.publicKey, delegateAccount);
        const additionalSigners = [payer];
        if (owner !== payer) {
            additionalSigners.push(owner);
        }
        await this.sendAndConfirmTransaction(ixs, {
            additionalSigners,
        });
        return openOrdersAccount;
    }
    async depositIx(openOrdersPublicKey, openOrdersAccount, market, userBaseAccount, userQuoteAccount, baseAmount, quoteAmount) {
        const ix = await this.program.methods
            .deposit(baseAmount, quoteAmount)
            .accounts({
            owner: openOrdersAccount.owner,
            market: openOrdersAccount.market,
            openOrdersAccount: openOrdersPublicKey,
            userBaseAccount,
            userQuoteAccount,
            marketBaseVault: market.marketBaseVault,
            marketQuoteVault: market.marketQuoteVault,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .instruction();
        return ix;
    }
    async depositNativeIx(openOrdersPublicKey, openOrdersAccount, market, userBaseAccount, userQuoteAccount, baseAmount, quoteAmount) {
        const wrappedSolAccount = new web3_js_1.Keypair();
        let preInstructions = [];
        let postInstructions = [];
        const additionalSigners = [];
        const lamports = baseAmount.add(new anchor_1.BN(1e7));
        preInstructions = [
            web3_js_1.SystemProgram.createAccount({
                fromPubkey: openOrdersAccount.owner,
                newAccountPubkey: wrappedSolAccount.publicKey,
                lamports: lamports.toNumber(),
                space: 165,
                programId: spl_token_1.TOKEN_PROGRAM_ID,
            }),
            (0, spl_token_1.createInitializeAccount3Instruction)(wrappedSolAccount.publicKey, spl_token_1.NATIVE_MINT, openOrdersAccount.owner),
        ];
        postInstructions = [
            (0, spl_token_1.createCloseAccountInstruction)(wrappedSolAccount.publicKey, openOrdersAccount.owner, openOrdersAccount.owner),
        ];
        additionalSigners.push(wrappedSolAccount);
        const ix = await this.program.methods
            .deposit(baseAmount, quoteAmount)
            .accounts({
            owner: openOrdersAccount.owner,
            market: openOrdersAccount.market,
            openOrdersAccount: openOrdersPublicKey,
            userBaseAccount,
            userQuoteAccount,
            marketBaseVault: market.marketBaseVault,
            marketQuoteVault: market.marketQuoteVault,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .instruction();
        return [[...preInstructions, ix, ...postInstructions], additionalSigners];
    }
    decodeMarket(data) {
        return this.program.coder.accounts.decode('market', data);
    }
    async placeOrderIx(openOrdersPublicKey, marketPublicKey, market, userTokenAccount, args, remainingAccounts, openOrdersDelegate) {
        const marketVault = args.side.bid
            ? market.marketQuoteVault
            : market.marketBaseVault;
        const accountsMeta = remainingAccounts.map((remaining) => ({
            pubkey: remaining,
            isSigner: false,
            isWritable: true,
        }));
        const openOrdersAdmin = market.openOrdersAdmin.key.equals(web3_js_1.PublicKey.default)
            ? null
            : market.openOrdersAdmin.key;
        const ix = await this.program.methods
            .placeOrder(args)
            .accounts({
            signer: openOrdersDelegate?.publicKey ?? this.walletPk,
            asks: market.asks,
            bids: market.bids,
            marketVault,
            eventHeap: market.eventHeap,
            market: marketPublicKey,
            openOrdersAccount: openOrdersPublicKey,
            oracleA: market.oracleA.key,
            oracleB: market.oracleB.key,
            userTokenAccount,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            openOrdersAdmin,
        })
            .remainingAccounts(accountsMeta)
            .instruction();
        const signers = [];
        if (openOrdersDelegate != null) {
            signers.push(openOrdersDelegate);
        }
        return [ix, signers];
    }
    async placeOrderPeggedIx(openOrdersPublicKey, marketPublicKey, market, userTokenAccount, openOrdersAdmin, args, remainingAccounts, openOrdersDelegate) {
        const marketVault = args.side.bid
            ? market.marketQuoteVault
            : market.marketBaseVault;
        const accountsMeta = remainingAccounts.map((remaining) => ({
            pubkey: remaining,
            isSigner: false,
            isWritable: true,
        }));
        const ix = await this.program.methods
            .placeOrderPegged(args)
            .accounts({
            signer: openOrdersDelegate != null
                ? openOrdersDelegate.publicKey
                : this.walletPk,
            asks: market.asks,
            bids: market.bids,
            marketVault,
            eventHeap: market.eventHeap,
            market: marketPublicKey,
            openOrdersAccount: openOrdersPublicKey,
            oracleA: market.oracleA.key,
            oracleB: market.oracleB.key,
            userTokenAccount,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            openOrdersAdmin,
        })
            .remainingAccounts(accountsMeta)
            .instruction();
        const signers = [];
        if (openOrdersDelegate != null) {
            signers.push(openOrdersDelegate);
        }
        return [ix, signers];
    }
    async placeTakeOrderIx(marketPublicKey, market, userBaseAccount, userQuoteAccount, openOrdersAdmin, args, remainingAccounts, openOrdersDelegate) {
        const accountsMeta = remainingAccounts.map((remaining) => ({
            pubkey: remaining,
            isSigner: false,
            isWritable: true,
        }));
        const ix = await this.program.methods
            .placeTakeOrder(args)
            .accounts({
            signer: openOrdersDelegate != null
                ? openOrdersDelegate.publicKey
                : this.walletPk,
            penaltyPayer: this.walletPk,
            asks: market.asks,
            bids: market.bids,
            eventHeap: market.eventHeap,
            market: marketPublicKey,
            oracleA: market.oracleA.key,
            oracleB: market.oracleB.key,
            userBaseAccount,
            userQuoteAccount,
            marketBaseVault: market.marketBaseVault,
            marketQuoteVault: market.marketQuoteVault,
            marketAuthority: market.marketAuthority,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            openOrdersAdmin,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .remainingAccounts(accountsMeta)
            .instruction();
        const signers = [];
        if (openOrdersDelegate != null) {
            signers.push(openOrdersDelegate);
        }
        return [ix, signers];
    }
    // Use OrderType from './utils/utils' for orderType
    async cancelAllAndPlaceOrdersIx(openOrdersPublicKey, marketPublicKey, market, userBaseAccount, userQuoteAccount, openOrdersAdmin, orderType, bids, asks, limit = 12, openOrdersDelegate) {
        const ix = await this.program.methods
            .cancelAllAndPlaceOrders(orderType, bids, asks, limit)
            .accounts({
            signer: openOrdersDelegate != null
                ? openOrdersDelegate.publicKey
                : this.walletPk,
            asks: market.asks,
            bids: market.bids,
            marketQuoteVault: market.marketQuoteVault,
            marketBaseVault: market.marketBaseVault,
            eventHeap: market.eventHeap,
            market: marketPublicKey,
            openOrdersAccount: openOrdersPublicKey,
            oracleA: market.oracleA.key,
            oracleB: market.oracleB.key,
            userBaseAccount,
            userQuoteAccount,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            openOrdersAdmin,
        })
            .instruction();
        const signers = [];
        if (openOrdersDelegate != null) {
            signers.push(openOrdersDelegate);
        }
        return [ix, signers];
    }
    // Use OrderType from './utils/utils' for orderType
    async placeOrdersIx(openOrdersPublicKey, marketPublicKey, market, userBaseAccount, userQuoteAccount, openOrdersAdmin, orderType, bids, asks, limit = 12, openOrdersDelegate) {
        const ix = await this.program.methods
            .placeOrders(orderType, bids, asks, limit)
            .accounts({
            signer: openOrdersDelegate != null
                ? openOrdersDelegate.publicKey
                : this.walletPk,
            asks: market.asks,
            bids: market.bids,
            marketQuoteVault: market.marketQuoteVault,
            marketBaseVault: market.marketBaseVault,
            eventHeap: market.eventHeap,
            market: marketPublicKey,
            openOrdersAccount: openOrdersPublicKey,
            oracleA: market.oracleA.key,
            oracleB: market.oracleB.key,
            userBaseAccount,
            userQuoteAccount,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            openOrdersAdmin,
        })
            .instruction();
        const signers = [];
        if (openOrdersDelegate != null) {
            signers.push(openOrdersDelegate);
        }
        return [ix, signers];
    }
    async cancelOrderByIdIx(openOrdersPublicKey, openOrdersAccount, market, orderId, openOrdersDelegate) {
        const ix = await this.program.methods
            .cancelOrder(orderId)
            .accounts({
            signer: openOrdersAccount.owner,
            asks: market.asks,
            bids: market.bids,
            market: openOrdersAccount.market,
            openOrdersAccount: openOrdersPublicKey,
        })
            .instruction();
        const signers = [];
        if (openOrdersDelegate != null) {
            signers.push(openOrdersDelegate);
        }
        return [ix, signers];
    }
    async cancelOrderByClientIdIx(openOrdersPublicKey, openOrdersAccount, market, clientOrderId, openOrdersDelegate) {
        const ix = await this.program.methods
            .cancelOrderByClientOrderId(clientOrderId)
            .accounts({
            signer: openOrdersAccount.owner,
            asks: market.asks,
            bids: market.bids,
            market: openOrdersAccount.market,
            openOrdersAccount: openOrdersPublicKey,
        })
            .instruction();
        const signers = [];
        if (openOrdersDelegate != null) {
            signers.push(openOrdersDelegate);
        }
        return [ix, signers];
    }
    async cancelAllOrdersIx(openOrdersPublicKey, openOrdersAccount, market, limit, side, openOrdersDelegate) {
        const ix = await this.program.methods
            .cancelAllOrders(side, limit)
            .accounts({
            signer: openOrdersAccount.owner,
            asks: market.asks,
            bids: market.bids,
            market: openOrdersAccount.market,
            openOrdersAccount: openOrdersPublicKey,
        })
            .instruction();
        const signers = [];
        if (openOrdersDelegate != null) {
            signers.push(openOrdersDelegate);
        }
        return [ix, signers];
    }
    async closeOpenOrdersIndexerIx(owner, market, openOrdersIndexer) {
        if (openOrdersIndexer == null) {
            openOrdersIndexer = this.findOpenOrdersIndexer(owner.publicKey);
        }
        if (openOrdersIndexer !== null) {
            const ix = await this.program.methods
                .closeOpenOrdersIndexer()
                .accounts({
                owner: owner.publicKey,
                openOrdersIndexer: market.asks,
                solDestination: market.bids,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            })
                .instruction();
            const additionalSigners = [];
            if (owner.publicKey !== this.walletPk) {
                additionalSigners.push(owner);
            }
            return [ix, additionalSigners];
        }
        throw new Error('No open order indexer for the specified owner');
    }
    async settleFundsIx(openOrdersPublicKey, openOrdersAccount, marketPublicKey, market, userBaseAccount, userQuoteAccount, referrerAccount, penaltyPayer, openOrdersDelegate) {
        const ix = await this.program.methods
            .settleFunds()
            .accounts({
            owner: openOrdersDelegate?.publicKey ?? openOrdersAccount.owner,
            market: marketPublicKey,
            openOrdersAccount: openOrdersPublicKey,
            marketAuthority: market.marketAuthority,
            marketBaseVault: market.marketBaseVault,
            marketQuoteVault: market.marketQuoteVault,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
            userBaseAccount: userBaseAccount,
            userQuoteAccount: userQuoteAccount,
            referrerAccount: referrerAccount,
            penaltyPayer: penaltyPayer,
        })
            .instruction();
        const signers = [];
        if (openOrdersDelegate != null) {
            signers.push(openOrdersDelegate);
        }
        return [ix, signers];
    }
    async closeOpenOrdersAccountIx(owner, openOrdersPublicKey, solDestination = this.walletPk, openOrdersIndexer) {
        if (openOrdersIndexer == null) {
            openOrdersIndexer = this.findOpenOrdersIndexer(owner.publicKey);
        }
        if (openOrdersIndexer !== null) {
            const ix = await this.program.methods
                .closeOpenOrdersAccount()
                .accounts({
                owner: owner.publicKey,
                openOrdersIndexer,
                openOrdersAccount: openOrdersPublicKey,
                solDestination,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .instruction();
            const additionalSigners = [];
            if (owner.publicKey !== this.walletPk) {
                additionalSigners.push(owner);
            }
            return [ix, additionalSigners];
        }
        throw new Error('No open order indexer for the specified owner');
    }
    // Use getAccountsToConsume as a helper
    async consumeEventsIx(marketPublicKey, market, limit, remainingAccounts) {
        const accountsMeta = remainingAccounts.map((remaining) => ({
            pubkey: remaining,
            isSigner: false,
            isWritable: true,
        }));
        const eventAdminBs58 = market.consumeEventsAdmin.key.toBase58();
        const consumeEventsAdmin = eventAdminBs58 === web3_js_1.PublicKey.default.toBase58()
            ? null
            : market.consumeEventsAdmin.key;
        const ix = await this.program.methods
            .consumeEvents(limit)
            .accounts({
            eventHeap: market.eventHeap,
            market: marketPublicKey,
            consumeEventsAdmin,
        })
            .remainingAccounts(accountsMeta)
            .instruction();
        return ix;
    }
    // Consume events for one specific account. Add other extra accounts as it's "free".
    async consumeEventsForAccountIx(marketPublicKey, market, openOrdersAccount) {
        const slots = await this.getSlotsToConsume(openOrdersAccount, market);
        // Deserialize the event heap account
        const eventHeapData = await this.deserializeEventHeapAccount(market.eventHeap);
        if (!eventHeapData) {
            throw new Error('Failed to deserialize event heap account');
        }
        const allAccounts = await this.getAccountsToConsume(market, eventHeapData);
        // Create a set to remove duplicates
        const uniqueAccounts = new Set([openOrdersAccount, ...allAccounts]);
        // Limit extra accounts to 10 due to tx limit and add openOrdersAccount
        const remainingAccounts = [...uniqueAccounts].slice(0, 10);
        const accountsMeta = remainingAccounts.map((remaining) => ({
            pubkey: remaining,
            isSigner: false,
            isWritable: true,
        }));
        const ix = await this.program.methods
            .consumeGivenEvents(slots)
            .accounts({
            eventHeap: market.eventHeap,
            market: marketPublicKey,
            consumeEventsAdmin: market.consumeEventsAdmin.key,
        })
            .remainingAccounts(accountsMeta)
            .instruction();
        return ix;
    }
    async pruneOrdersIx(marketPublicKey, market, openOrdersPublicKey, limit, closeMarketAdmin = null) {
        const ix = await this.program.methods
            .pruneOrders(limit)
            .accounts({
            closeMarketAdmin: market.closeMarketAdmin.key,
            openOrdersAccount: openOrdersPublicKey,
            market: marketPublicKey,
            bids: market.bids,
            asks: market.asks,
        })
            .instruction();
        const signers = [];
        if (this.walletPk !== market.closeMarketAdmin.key &&
            closeMarketAdmin !== null) {
            signers.push(closeMarketAdmin);
        }
        return [ix, signers];
    }
    async getAccountsToConsume(market, eventHeapData) {
        let accounts = new Array();
        // Ensure that the `eventHeapData` passed as a parameter is used instead of redeclaring
        if (eventHeapData != null) {
            for (const node of eventHeapData.nodes) {
                if (node.event.eventType === 0) {
                    const fillEvent = this.program.coder.types.decode('FillEvent', Buffer.from([0, ...node.event.padding]));
                    accounts = accounts
                        .filter((a) => a !== fillEvent.maker)
                        .concat([fillEvent.maker]);
                }
                else {
                    const outEvent = this.program.coder.types.decode('OutEvent', Buffer.from([0, ...node.event.padding]));
                    accounts = accounts
                        .filter((a) => a !== outEvent.owner)
                        .concat([outEvent.owner]);
                }
                // Limit the number of accounts to prevent exceeding transaction size limits
                if (accounts.length > 20)
                    return accounts;
            }
        }
        return accounts;
    }
    async getSlotsToConsume(key, market) {
        const slots = new Array();
        const eventHeap = await this.deserializeEventHeapAccount(market.eventHeap);
        if (eventHeap != null) {
            for (const [i, node] of eventHeap.nodes.entries()) {
                if (node.event.eventType === 0) {
                    const fillEvent = this.program.coder.types.decode('FillEvent', Buffer.from([0, ...node.event.padding]));
                    if (key === fillEvent.maker)
                        slots.push(new anchor_1.BN(i));
                }
                else {
                    const outEvent = this.program.coder.types.decode('OutEvent', Buffer.from([0, ...node.event.padding]));
                    if (key === outEvent.owner)
                        slots.push(new anchor_1.BN(i));
                }
            }
        }
        return slots;
    }
}
exports.OpenBookV2Client = OpenBookV2Client;
async function getFilteredProgramAccounts(connection, programId, filters) {
    // @ts-expect-error not need check
    const resp = await connection._rpcRequest('getProgramAccounts', [
        programId.toBase58(),
        {
            commitment: connection.commitment,
            filters,
            encoding: 'base64',
        },
    ]);
    if (resp.error !== null) {
        throw new Error(resp.error.message);
    }
    return resp.result.map(({ pubkey, account: { data, executable, owner, lamports } }) => ({
        publicKey: new web3_js_1.PublicKey(pubkey),
        accountInfo: {
            data: Buffer.from(data[0], 'base64'),
            executable,
            owner: new web3_js_1.PublicKey(owner),
            lamports,
        },
    }));
}
