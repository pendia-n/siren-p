## code
const url = 'https://api.firecrawl.dev/v2/search';
const options = {
  method: 'POST',
  headers: {
    Authorization: 'Bearer the-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    "query": "latest news on [ETH,BTC,SOL,AAVE,UNI,XAUT,BNB,LINK] coin and its ecosystem in every aspect like financial or politic or law? ",
    "sources": [
        "web",
        "news"
    ],
    "categories": [],
    "limit": 100,
    "scrapeOptions": {
        "onlyMainContent": true,
        "maxAge": 172800000,
        "parsers": [
            "pdf"
        ],
        "formats": [
            "summary",
            "links",
            "images"
        ]
      }
})
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

## result

read f.json
