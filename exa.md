import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

const result = await exa.search(
  "Latest news on BTC ETH LINK SOL AAVE XAUT UNI BNB",
  {
    numResults: 30,
    outputSchema: {
      type: "text"
    },
    type: "deep",
    contents: {
      text: true,
      highlights: true,
      maxAgeHours: 0,
      extras: {
        links: 1
      }
    }
  }
);

query be "LAtest news on btc eth link sol aave uni xaut bnb"

result:
As of Tuesday, October 6, 2026:

• BTC — Bitcoin is range-bound near $85.6K after a third rejection around $87K. A break below roughly $84K could expose $80K; U.S. spot BTC ETFs saw about $89.8M of net outflows on October 5, while traders await Wednesday’s Fed minutes. [BTC, ETH, SOL price news: Bitcoin hits $87,000 wall for third time as stocks near records](https://www.coindesk.com/markets/2026/10/06/bitcoin-keeps-getting-rejected-at-usd87-000-as-stocks-hover-near-records "www.coindesk.com/markets/2026/10/06/bitcoin-keeps-getting-rejected-at-usd87-000-as-stocks-hover-near-records")[Smaller altcoins shine as bitcoin stills trades around $85000](https://www.coindesk.com/markets/2026/10/06/smaller-altcoins-shine-as-bitcoin-stills-trades-around-usd85-000 "www.coindesk.com/markets/2026/10/06/smaller-altcoins-shine-as-bitcoin-stills-trades-around-usd85-000")[Bitcoin Price Today: BTC Holds $85,500 as $172M Liquidations & ETF Outflows Hit Before Fed Minutes](https://www.cryptotimes.io/2026/10/06/bitcoin-price-today-btc-holds-85500-as-172m-liquidations-etf-outflows-hit-before-fed-minutes/ "www.cryptotimes.io/2026/10/06/bitcoin-price-today-btc-holds-85500-as-172m-liquidations-etf-outflows-hit-before-fed-minutes")
• ETH — Ether is near $2.7K, but sentiment is weaker: U.S. spot ETH ETFs recorded five consecutive outflow sessions totaling about $205.9M, and aggressive Binance taker selling has intensified. [Ethereum bears keep selling but ETH stays near $2,700 as US spot ETFs record $206 million in outflows](https://cryptoslate.com/ethereum-trades-near-2700-as-us-spot-etfs-record-206-million-in-outflows/ "cryptoslate.com/ethereum-trades-near-2700-as-us-spot-etfs-record-206-million-in-outflows")
• LINK — Chainlink is consolidating around $14, down roughly 1.2% in the latest market report; broader market data put it near $13.95. [Smaller altcoins shine as bitcoin stills trades around $85000](https://www.coindesk.com/markets/2026/10/06/smaller-altcoins-shine-as-bitcoin-stills-trades-around-usd85-000 "www.coindesk.com/markets/2026/10/06/smaller-altcoins-shine-as-bitcoin-stills-trades-around-usd85-000")[CoinMarketCap: Cryptocurrency Prices, Charts And Market ...](https://coinmarketcap.com/ "coinmarketcap.com")
• SOL — Solana is trading around $121 and was among the major coins slipping 1–2% in the latest session. [BTC, ETH, SOL price news: Bitcoin hits $87,000 wall for third time as stocks near records](https://www.coindesk.com/markets/2026/10/06/bitcoin-keeps-getting-rejected-at-usd87-000-as-stocks-hover-near-records "www.coindesk.com/markets/2026/10/06/bitcoin-keeps-getting-rejected-at-usd87-000-as-stocks-hover-near-records")[Cryptocurrency Prices , Market Cap & Live Crypto Charts - Kraken](https://www.kraken.com/prices "www.kraken.com/prices")
• AAVE — Aave is the main beneficiary of growing tokenized-gold activity: it holds roughly 74.2% of the $94.6M in XAUT DeFi deposits. Separately, about $67.4M of PT-AUSD collateral on Aave’s Monad market matures October 8, creating a major rollover test. [Tether's tokenized gold piles into DeFi as Aave takes the lion's share](https://cryptobriefing.com/tether-gold-xaut-defi-deposits-aave/ "cryptobriefing.com/tether-gold-xaut-defi-deposits-aave")[Aave and Pendle may have found a way to keep yield capital from ever leaving DeFi](https://cryptoslate.com/aave-and-pendle-may-have-found-a-way-to-keep-yield-capital-from-ever-leaving-defi/ "cryptoslate.com/aave-and-pendle-may-have-found-a-way-to-keep-yield-capital-from-ever-leaving-defi")
• XAUT — Tether Gold is around $4,166–$4,168. Tether reportedly minted approximately 119,670 additional XAUT, worth about $495M, in late September; around $94.6M of XAUT is now deposited across DeFi. [Tether's tokenized gold piles into DeFi as Aave takes the lion's share](https://cryptobriefing.com/tether-gold-xaut-defi-deposits-aave/ "cryptobriefing.com/tether-gold-xaut-defi-deposits-aave")[XAUT | Currently at $4,165.60 (+0.57%) | Oct 6, 2026](https://exa.ai/library/markets/crypto/XAUT "exa.ai/library/markets/crypto/XAUT")[CoinMarketCap: Cryptocurrency Prices, Charts And Market ...](https://coinmarketcap.com/ "coinmarketcap.com")
• UNI — Uniswap is around $8.6–$8.9 and has been relatively range-bound; its V3 pools held about $16.5M in XAUT liquidity, making Uniswap the principal decentralized exchange venue for trading the token. [Smaller altcoins shine as bitcoin stills trades around $85000](https://www.coindesk.com/markets/2026/10/06/smaller-altcoins-shine-as-bitcoin-stills-trades-around-usd85-000 "www.coindesk.com/markets/2026/10/06/smaller-altcoins-shine-as-bitcoin-stills-trades-around-usd85-000")[Tether's tokenized gold piles into DeFi as Aave takes the lion's share](https://cryptobriefing.com/tether-gold-xaut-defi-deposits-aave/ "cryptobriefing.com/tether-gold-xaut-defi-deposits-aave")[Cryptocurrency Prices , Market Cap & Live Crypto Charts - Kraken](https://www.kraken.com/prices "www.kraken.com/prices")
• BNB — BNB was the weakest major in the CoinDesk snapshot, down about 2.5%, near $782 in market-data feeds. [BTC, ETH, SOL price news: Bitcoin hits $87,000 wall for third time as stocks near records](https://www.coindesk.com/markets/2026/10/06/bitcoin-keeps-getting-rejected-at-usd87-000-as-stocks-hover-near-records "www.coindesk.com/markets/2026/10/06/bitcoin-keeps-getting-rejected-at-usd87-000-as-stocks-hover-near-records")[CoinMarketCap: Cryptocurrency Prices, Charts And Market ...](https://coinmarketcap.com/ "coinmarketcap.com")

Overall, the day’s main themes are BTC’s resistance at $87K, persistent ETH ETF outflows, and increasing integration of XAUT into DeFi—especially through Aave—while LINK, SOL, UNI, and BNB remain chiefly driven by broad market consolidation. Prices are intraday snapshots and can change quickly.
