# OpenBook crank script

OpenBook needs to be cranked to process orderbook events.
The initial code was taken from the same crank script for openbook in 
mango-client, so most credit goes to Mango team.

#### Install deps first:

```
yarn install
```

#### Run:

To run the script set the RPC_URL and WALLET_PATH or KEYPAIR environment variables first.

Make sure to create a JSON file containing the keypair formatted as a byte array e.g. [1,3,4...] or run with KEYPAIR directly.


```
yarn build
```

```
ts-node ./src/crank.ts
```

#### Run with Docker:

Make sure you are in the project's root folder

```
sudo docker build -t obv2-crank-v2 .
```

Run the container with environment variables (.env file format below)

```
sudo docker run --name obv2-crank-v2 --env-file ./variables.env -v /path/to/your/wallet.json:/path/to/your/wallet.json obv2-crank-v2
```



#### Environment Variables:

```
  RPC_URL              // Enter the url to your rpc node [mandatory]
  WALLET_PATH          // Path to your wallet.json (private keys of your Solana wallet) [mandatory]
  KEYPAIR              // alternatively to WALLET_PATH [only mandatory, if wallet_path is not set]
  CLUSTER              // Cluster to use. 'mainnet' or 'devnet'. Default is 
                       // mainnet.
  CONSUME_EVENTS_LIMIT // Max number of events to consume in each TX. Default is
                       // 19 events.
  CU_PRICE             // Minimum additional micro lamports for all 
                       // transactions. Default is 0. Raise this above 0 if
                       // you want all transactions to pay a priority fee for 
                       // every market.
  INTERVAL             // Sleep interval, in ms, between each loop. Default is 
                       // 1000 ms
  MARKETS              // Specify markets, comma separated 
  MAX_TX_INSTRUCTIONS  // Max number of instructions for each transaction. 
                       // Default is 1.
  MAX_UNIQUE_ACCOUNTS  // Max number of unique accounts to process in each
                       // transaction. Default is 10.
  POLL_MARKETS         // If true, ignore the local markets.json file and crank
                       // the top markets, by volume, on openserum.com above a
                       // minimum threshold of 1000 (hard-coded). Default is 
                       // undefined (false).
  PRIORITY_CU_LIMIT    // Compute unit limit per instruction. Default is 50000.
  PRIORITY_CU_PRICE    // Additional micro lamports for PRIORITY_MARKETS & 
                       // PRIORITY_QUEUE_LIMIT. Default is 100.
  PRIORITY_MARKETS     // Input to a comma separated list of market IDs that 
                       // receive fee bump. Transactions for the markets on this 
                       // list will include higher priority fees.
                       // e.g. PRIORITY_MARKETS=ID-1,ID-2,ID-3.
  PRIORITY_QUEUE_LIMIT // Force PRIORITY_CU_PRICE for transactions when the size 
                       // of the event queue exceeds this value. Default is 100. 
  PROGRAM_ID           // OpenBook v2 program to use. Default for mainnet is
                       // opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb.
```

#### Format for .env

```
RPC_URL=
WALLET_PATH=/your/path/to/wallet.json
KEYPAIR= # leave empty if you gonna use WALLET_PATH
PROGRAM_ID=opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb
INTERVAL=500
CONSUME_EVENTS_LIMIT=19
CLUSTER=mainnet
MARKETS=market_ID,market_ID,market_ID,market_ID,market_ID,market_ID
PRIORITY_MARKETS=market_ID,market_ID,market_ID
PRIORITY_QUEUE_LIMIT=100
PRIORITY_CU_PRICE=
PRIORITY_CU_LIMIT=50000
MAX_TX_INSTRUCTIONS=1
CU_PRICE=0
```

#### TODO:

- Dynamic priority fee using getRecentPrioritizationFees
- Dynamic frequency based on queue length
