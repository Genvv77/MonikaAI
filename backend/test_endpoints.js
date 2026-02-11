import axios from 'axios';

async function testEndpoint(name, url) {
    try {
        console.log(`Testing ${name}...`);
        const start = Date.now();
        const res = await axios.get(url);
        const duration = Date.now() - start;
        console.log(`${name} Success (${duration}ms):`, JSON.stringify(res.data).substring(0, 100));
    } catch (e) {
        console.error(`${name} Failed:`, e.message, e.response ? e.response.status : '');
    }
}

async function run() {
    // 1. The one we are using (V3 Ticker)
    await testEndpoint('V3 Ticker', 'https://api.coinbase.com/api/v3/brokerage/market/products/BTC-USD/ticker');

    // 2. Exchange Ticker (Legacy but reliable)
    await testEndpoint('Exchange Ticker', 'https://api.exchange.coinbase.com/products/BTC-USD/ticker');

    // 3. Exchange Stats (We used this before)
    await testEndpoint('Exchange Stats', 'https://api.exchange.coinbase.com/products/BTC-USD/stats');

    // 4. V2 Prices (Consumer API)
    await testEndpoint('V2 Spot', 'https://api.coinbase.com/v2/prices/BTC-USD/spot');
}

run();
