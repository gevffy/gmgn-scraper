require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const innerScihubAddress = '7BZTxgmXRwjYa3Xn29ZL1oQcXWoHuFCUxvzUt51C5TjE'
const TOKEN_PROGRAM_ID = new PublicKey('GxdTh6udNstGmLLk9ztBb6bkrms7oLbrJp5yzUaVpump');
const connection = new Connection(process.env.RPC_ENDPOINT, {
  wsEndpoint: process.env.RPC_WEBSOCKET_ENDPOINT,
  commitment: process.env.COMMITMENT_LEVEL,
});

const getTransactions = async (address) => {
  let transactionListLength = 1000
  const allTransactions = []
  const pubkey = new PublicKey(address);
  let transactionList = await connection.getSignaturesForAddress(pubkey);
  allTransactions.push(transactionList)
  while (transactionListLength >= 1000) {
    const lastSignature = transactionList[transactionList.length - 1];
    const nextSignatures = await connection.getSignaturesForAddress(pubkey, { before: lastSignature.signature });
    allTransactions.push(nextSignatures)
    transactionList = nextSignatures
    transactionListLength = nextSignatures.length;
  }
  return allTransactions.flat().filter(item => {
    return item.err === null;
  })
};

async function getAddressFromTransaction() {
  const details = JSON.parse(readFileSync(path.join(__dirname, 'data', 'details.json')));
  const addresses = details.map(item => {
    return item.meta.postTokenBalances.filter(item => item.owner !== innerScihubAddress).map(item => item.owner);
  }).flat();
  // unique addresses
  const uniqueAddresses = Array.from(new Set(addresses));
  console.log(uniqueAddresses.length)
  writeFileSync(path.join(__dirname, 'data', 'addresses.json'), JSON.stringify(uniqueAddresses, null, 2));
  for(const address of uniqueAddresses) {
    const pubkey = new PublicKey(address);
    const tokenBalances = await connection.getParsedTokenAccountsByOwner(pubkey, {
      mint: TOKEN_PROGRAM_ID
    });
    if(tokenBalances.value.length === 0) {
      // console.log('no token balance')
    } else {
      const tokenBalance = tokenBalances.value[0]?.account.data.parsed.info.tokenAmount.uiAmount;
      if(tokenBalance > 1){
        console.log('address: ', address, 'tokenAmount: ', tokenBalance);
      }
    }
  }
}
// get tx
getTransactions(innerScihubAddress).then(async (res) => {
  const signatures = res.map(item => item.signature);
  console.log('signatures', signatures.length)
  const details = await connection.getParsedTransactions(signatures, {
    maxSupportedTransactionVersion: 0,
  });
  console.log(details)
  writeFileSync(path.join(__dirname, 'data', 'details.json'), JSON.stringify(details, null, 2));
})
// get address
getAddressFromTransaction()
