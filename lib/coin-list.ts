export type CoinMetadataSeed = {
  symbol: string;
  name: string;
  coingeckoId: string;
  color: string;
  pair?: string;
  enabled?: boolean;
  logoUrl?: string;
  localLogoPath?: string;
};

type CoinRow = readonly [string, string, string, string, string?, string?];

export const coinCatalog: CoinMetadataSeed[] = ([
  ["BTC","Bitcoin","bitcoin","#f7931a"],["ETH","Ethereum","ethereum","#627eea"],["BNB","BNB","binancecoin","#f3ba2f"],["SOL","Solana","solana","#9945ff"],["SHINE","SHINE TOKEN","shine-token","#18ff8a","SHINEUSDT","/coin-logos/shine.svg"],["SUI","Sui","sui","#6fbcf0"],
  ["XRP","XRP","ripple","#2f6bff"],["ADA","Cardano","cardano","#3f8cff"],["DOGE","Dogecoin","dogecoin","#c2a633"],["SHIB","Shiba Inu","shiba-inu","#f05a28"],["PEPE","Pepe","pepe","#66bb6a"],
  ["TRX","TRON","tron","#ef0027"],["TON","Toncoin","the-open-network","#23a5e8"],["AVAX","Avalanche","avalanche-2","#e84142"],["LINK","Chainlink","chainlink","#2a5ada"],["DOT","Polkadot","polkadot","#e6007a"],
  ["MATIC","Polygon","matic-network","#8247e5"],["LTC","Litecoin","litecoin","#345d9d"],["BCH","Bitcoin Cash","bitcoin-cash","#8dc351"],["UNI","Uniswap","uniswap","#ff007a"],["ETC","Ethereum Classic","ethereum-classic","#3ab83a"],
  ["ATOM","Cosmos","cosmos","#2e3148"],["FIL","Filecoin","filecoin","#0090ff"],["NEAR","NEAR Protocol","near","#00ec97"],["APT","Aptos","aptos","#f5f5f5"],["ARB","Arbitrum","arbitrum","#28a0f0"],
  ["OP","Optimism","optimism","#ff0420"],["INJ","Injective","injective-protocol","#00f2fe"],["RNDR","Render","render-token","#ff5c00","RENDERUSDT"],["FET","Artificial Superintelligence Alliance","fetch-ai","#1f6bff"],["ICP","Internet Computer","internet-computer","#29abe2"],
  ["STX","Stacks","blockstack","#5546ff"],["AAVE","Aave","aave","#b6509e"],["MKR","Maker","maker","#1aab9b"],["WIF","dogwifhat","dogwifcoin","#d9a86c"],["FLOKI","FLOKI","floki","#f4b731"],
  ["BONK","Bonk","bonk","#f8a400"],["JUP","Jupiter","jupiter-exchange-solana","#fba43a"],["SEI","Sei","sei-network","#8b0000"],["TIA","Celestia","celestia","#7b2bf9"],["ALGO","Algorand","algorand","#ffffff"],
  ["VET","VeChain","vechain","#15bdff"],["XLM","Stellar","stellar","#14b6e7"],["HBAR","Hedera","hedera-hashgraph","#222222"],["EGLD","MultiversX","elrond-erd-2","#23f7dd"],["SAND","The Sandbox","the-sandbox","#00adef"],
  ["MANA","Decentraland","decentraland","#ff2d55"],["GALA","Gala","gala","#151515"],["AXS","Axie Infinity","axie-infinity","#0055d5"],["CHZ","Chiliz","chiliz","#cd0124"],["ENA","Ethena","ethena","#f5f5f5"],
  ["ORDI","ORDI","ordi","#f7931a"],["BOME","BOOK OF MEME","book-of-meme","#39ff14"],["NOT","Notcoin","notcoin","#f5d742"],["PYTH","Pyth Network","pyth-network","#6f36ff"],["JTO","Jito","jito-governance-token","#24d6a3"],
  ["STRK","Starknet","starknet","#29296e"],["USDT","Tether","tether","#26a17b","USDTUSDT"],["USDC","USD Coin","usd-coin","#2775ca"],["FDUSD","First Digital USD","first-digital-usd","#f5b331"],["WLD","Worldcoin","worldcoin-wld","#222222"],
  ["LDO","Lido DAO","lido-dao","#00a3ff"],["RUNE","THORChain","thorchain","#00ccff"],["QNT","Quant","quant-network","#111111"],["IMX","Immutable","immutable-x","#17b5ff"],["KAS","Kaspa","kaspa","#49eacb"],
  ["JASMY","JasmyCoin","jasmycoin","#f6c343"],["KCS","KuCoin Token","kucoin-shares","#23af91"],["GT","GateToken","gatechain-token","#2354e6"],["XMR","Monero","monero","#ff6600"],["XTZ","Tezos","tezos","#2c7df7"],
  ["EOS","EOS","eos","#ffffff"],["FLOW","Flow","flow","#00ef8b"],["MINA","Mina","mina-protocol","#ff603b"],["CFX","Conflux","conflux-token","#111111"],["FTM","Fantom","fantom","#1969ff"],
  ["KAVA","Kava","kava","#ff564f"],["DYDX","dYdX","dydx-chain","#6966ff"],["CRV","Curve DAO","curve-dao-token","#ffcc00"],["SNX","Synthetix","havven","#00d1ff"],["COMP","Compound","compound-governance-token","#00d395"],
  ["CAKE","PancakeSwap","pancakeswap-token","#d1884f"],["RAY","Raydium","raydium","#8c6cff"],["LUNC","Terra Classic","terra-luna","#f7d047"],["GRT","The Graph","the-graph","#6747ed"],["AR","Arweave","arweave","#222222"],
  ["IOTA","IOTA","iota","#ffffff"],["ZEC","Zcash","zcash","#ecb244"],["DASH","Dash","dash","#008de4"],["ROSE","Oasis","oasis-network","#0092f6"],["KSM","Kusama","kusama","#111111"],
  ["WOO","WOO","woo-network","#111111"],["1INCH","1inch","1inch","#94a3b8"],["ZIL","Zilliqa","zilliqa","#49c1bf"],["BAT","Basic Attention Token","basic-attention-token","#ff5000"],["ANKR","Ankr","ankr","#2f66f6"],
  ["HOT","Holo","holotoken","#7c3aed"],["CELO","Celo","celo","#35d07f"],["QTUM","Qtum","qtum","#2e9ad0"],["ZRX","0x Protocol","0x","#302c2c"],["KNC","Kyber Network Crystal","kyber-network-crystal","#31cb9e"],
  ["POL","Polygon Ecosystem Token","polygon-ecosystem-token","#8247e5"],["ONDO","Ondo","ondo-finance","#111111"],["HYPE","Hyperliquid","hyperliquid","#00d7b0"],["XDC","XDC Network","xdce-crowd-sale","#2f80ed"],["FLR","Flare","flare-networks","#e62058"],
  ["KAIA","Kaia","kaia","#00a870"],["NEXO","NEXO","nexo","#1a3f95"],["PENGU","Pudgy Penguins","pudgy-penguins","#8fd8ff"],["VIRTUAL","Virtuals Protocol","virtual-protocol","#f5f5f5"],["AERO","Aerodrome Finance","aerodrome-finance","#2b63ff"],
  ["THETA","Theta Network","theta-token","#2ab8e6"],["BSV","Bitcoin SV","bitcoin-cash-sv","#eab300"],["CORE","Core","coredaoorg","#ff7a00"],["XCN","Onyxcoin","chain-2","#111111"],["BRETT","Brett","based-brett","#4da2ff"],
  ["AIOZ","AIOZ Network","aioz-network","#7a5cff"],["MOVE","Movement","movement","#f5f5f5"],["MOG","Mog Coin","mog-coin","#f5d742"],["AKT","Akash Network","akash-network","#ff414c"],["BEAM","Beam","beam-2","#06f7c8"],
  ["GNO","Gnosis","gnosis","#04795b"],["LPT","Livepeer","livepeer","#00eb88"],["ENS","Ethereum Name Service","ethereum-name-service","#5298ff"],["PENDLE","Pendle","pendle","#1ed6a5"],["JOE","Trader Joe","joe","#e84142"],
  ["TWT","Trust Wallet","trust-wallet-token","#3375bb"],["SFP","SafePal","safepal","#4b8cff"],["GMT","GMT","stepn","#c7ff00"],["BLUR","Blur","blur","#ff8700"],["MASK","Mask Network","mask-network","#1c68f3"],
  ["SUPER","SuperVerse","superfarm","#ff2d55"],["IOST","IOST","iostoken","#111111"],["SKL","SKALE","skale","#00d4ff"],["SUSHI","Sushi","sushi","#fa52a0"],["YFI","yearn.finance","yearn-finance","#006ae3"],
  ["BAL","Balancer","balancer","#1e1e1e"],["CVX","Convex Finance","convex-finance","#3b82f6"],["LRC","Loopring","loopring","#1c60ff"],["ELF","aelf","aelf","#2b5cff"],["ONE","Harmony","harmony","#00aee9"],
  ["WAVES","Waves","waves","#0155ff"],["RVN","Ravencoin","ravencoin","#384182"],["SC","Siacoin","siacoin","#20ee82"],["DGB","DigiByte","digibyte","#006ad2"],["HNT","Helium","helium","#474dff"],
  ["TFUEL","Theta Fuel","theta-fuel","#ff8f00"],["OSMO","Osmosis","osmosis","#760dbb"],["WEMIX","WEMIX","wemix-token","#111111"],["PRIME","Echelon Prime","echelon-prime","#f5f5f5"],["ZETA","ZetaChain","zetachain","#005741"],
] satisfies CoinRow[]).map(([symbol,name,coingeckoId,color,pair,localLogoPath])=>({symbol,name,coingeckoId,color,pair,enabled:true,logoUrl:`https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`,localLogoPath}));

export const enabledCoinSymbols = new Set(coinCatalog.filter(coin=>coin.enabled!==false).map(coin=>coin.symbol));
export const catalogBySymbol = new Map(coinCatalog.map((coin,index)=>[coin.symbol,{...coin,displayOrder:index+1}]));
export const enabledTradingPairs = coinCatalog
  .filter(coin=>coin.enabled!==false)
  .map(coin=>coin.pair??`${coin.symbol}USDT`)
  .filter(pair=>pair!=="USDTUSDT");
