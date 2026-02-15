// server.js - Curio Cards Supply Data Backend Service

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (adjust in production)
app.use(cors());
app.use(express.json());

// Serve static files (your dashboard)
app.use(express.static('public'));

// Data storage
const DATA_FILE = path.join(__dirname, 'data', 'supply-data.json');
const METADATA_FILE = path.join(__dirname, 'data', 'metadata.json');

// Wrapped contract addresses for each card
const WRAPPED_CONTRACTS = {
    '1': '0x6aa2044c7a0f9e2758edae97247b03a0d7e73d6c',
    '2': '0xe9a6a26598b05db855483ff5ecc5f1d0c81140c8',
    '3': '0x3f8131B6E62472CEea9cb8Aa67d87425248a3702',
    '4': '0x4F1694be039e447B729ab11653304232Ae143C69',
    '5': '0x5a3D4A8575a688b53E8b270b5C1f26fd63065219',
    '6': '0x1Ca6AC0Ce771094F0F8a383D46BF3acC9a5BF27f',
    '7': '0x2647bd8777e0C66819D74aB3479372eA690912c3',
    '8': '0x2FCE2713a561bB019BC5A110BE0A19d10581ee9e',
    '9': '0xbf4Cc966F1e726087c5C55aac374E687000d4d45',
    '10': '0x72b34d637C0d14acE58359Ef1bF472E4b4c57125',
    '11': '0xb36c87F1f1539c5FC6f6e7b1C632e1840C9B66b4',
    '12': '0xD15af10A258432e7227367499E785C3532b50271',
    '13': '0x2d922712f5e99428c65b44f09Ea389373d185bB3',
    '14': '0x0565ac44e5119a3224b897De761a46A92aA28ae8',
    '15': '0xdb7F262237Ad8acca8922aA2c693a34D0d13e8fe',
    '16': '0x1b63532CcB1FeE0595c7fe2Cb35cFD70ddF862Cd',
    '17': '0xF59536290906F204C3c7918D40C1Cc5f99643d0B',
    '17b': '0xE0B5E6F32d657e0e18d4B3E801EBC76a5959e123',
    '18': '0xA507D9d28bbca54cBCfFad4BB770C2EA0519F4F0',
    '19': '0xf26BC97Aa8AFE176e275Cf3b08c363f09De371fA',
    '20': '0xD0ec99E99cE22f2487283A087614AEe37F6B1283',
    '21': '0xB7A5a84Ff90e8Ef91250fB56c50a7bB92a6306EE',
    '22': '0x148fF761D16632da89F3D30eF3dFE34bc50CA765',
    '23': '0xCDE7185B5C3Ed9eA68605a960F6653AA1a5b5C6C',
    '24': '0xE67dad99c44547B54367E3e60fc251fC45a145C6',
    '25': '0xC7f60C2b1DBDfd511685501EDEb05C4194D67018',
    '26': '0x1cB5BF4Be53eb141B56f7E4Bb36345a353B5488c',
    '27': '0xFb9F3fa2502d01d43167A0A6E80bE03171DF407E',
    '28': '0x59D190e8A2583C67E62eEc8dA5EA7f050d8BF27e',
    '29': '0xD3540bCD9c2819771F9D765Edc189cBD915FEAbd',
    '30': '0x7F5B230Dc580d1e67DF6eD30dEe82684dD113D1F'
};

// Curio Cards main contract that holds wrapped tokens
const CURIO_MAIN_CONTRACT = '0x73da73ef3a6982109c4d5bdb0db9dd3e3783f313';

// Special case: Card 17b uses a different holder address
const CARD_17B_HOLDER = '0x04afa589e2b933f9463c5639f412b183ec062505';

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

// Function to fetch wrapped balance from Etherscan for a specific card
async function fetchWrappedBalance(cardId) {
    try {
        const contractAddress = WRAPPED_CONTRACTS[cardId];
        if (!contractAddress) {
            console.log(`No wrapped contract found for card ${cardId}`);
            return null;
        }

        // Card 17b uses a different holder address
        const holderAddress = cardId === '17b' ? CARD_17B_HOLDER : CURIO_MAIN_CONTRACT;
        const url = `https://etherscan.io/token/${contractAddress}?a=${holderAddress}`;
        console.log(`Fetching wrapped balance for card ${cardId}...`);
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        
        // Try multiple selectors to find the balance
        let balance = null;
        
        // Method 1: Look for the Balance heading and value
        const balanceText = $('body').text();
        const balanceMatch = balanceText.match(/Balance\s*([\d,]+)\s*[A-Z]/i);
        if (balanceMatch) {
            balance = parseInt(balanceMatch[1].replace(/,/g, ''));
            console.log(`  → Found balance: ${balance}`);
        }
        
        // Method 2: If not found, try looking in specific divs
        if (balance === null) {
            $('div').each((i, elem) => {
                const text = $(elem).text();
                if (text.includes('Balance') && !text.includes('Check previous') && !text.includes('Token Balance')) {
                    const match = text.match(/([\d,]+)/);
                    if (match && balance === null) {
                        balance = parseInt(match[0].replace(/,/g, ''));
                        console.log(`  → Found balance (method 2): ${balance}`);
                    }
                }
            });
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return balance || 0;
    } catch (error) {
        console.error(`Error fetching wrapped balance for card ${cardId}:`, error.message);
        return 0;
    }
}

// Function to fetch all wrapped balances
async function fetchAllWrappedBalances() {
    const wrappedBalances = {};
    
    console.log('Fetching wrapped balances from Etherscan...');
    
    for (const cardId of Object.keys(WRAPPED_CONTRACTS)) {
        const balance = await fetchWrappedBalance(cardId);
        if (balance !== null) {
            wrappedBalances[cardId] = balance;
            console.log(`Card ${cardId}: ${balance} wrapped`);
        }
    }
    
    return wrappedBalances;
}

// Function to scrape data from ccsupply.xyz CSV
async function fetchSupplyData() {
    try {
        console.log('Fetching data from ccsupply.xyz CSV...');
        
        // They provide a CSV file at https://ccsupply.xyz/data/Card_Supply.csv
        const response = await axios.get('https://ccsupply.xyz/data/Card_Supply.csv', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const csvData = response.data;
        const lines = csvData.split('\n');
        const cards = [];

        // Skip header row, parse data rows
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',');
            if (values.length >= 7) {
                const card = {
                    cardNum: values[0] === '17b' ? '17b' : parseInt(values[0]) || 0,
                    name: values[1].trim(),
                    totalSupply: parseInt(values[2]) || 0,
                    burned: parseInt(values[3]) || 0,
                    remaining: parseInt(values[4]) || 0,
                    inactive: parseInt(values[5]) || 0,
                    active: parseInt(values[6]) || 0
                };

                // Only add valid cards
                if ((card.cardNum > 0 || card.cardNum === '17b') && card.name) {
                    cards.push(card);
                }
            }
        }

        console.log(`Successfully fetched ${cards.length} cards from CSV`);
        
        // Sort cards: 1-17, 17b, 18-30
        cards.sort((a, b) => {
            const aNum = a.cardNum === '17b' ? 17.5 : a.cardNum;
            const bNum = b.cardNum === '17b' ? 17.5 : b.cardNum;
            return aNum - bNum;
        });
        
        // Fetch wrapped balances
        const wrappedBalances = await fetchAllWrappedBalances();
        
        // Add wrapped balances to cards
        cards.forEach(card => {
            const cardKey = card.cardNum === '17b' ? '17b' : card.cardNum.toString();
            card.wrapped = wrappedBalances[cardKey] || 0;
        });
        
        return {
            cards,
            lastUpdated: new Date().toISOString(),
            fetchedAt: new Date().toISOString()
        };

    } catch (error) {
        console.error('Error fetching supply data:', error.message);
        throw error;
    }
}

// Save data to file
async function saveData(data) {
    try {
        await ensureDataDirectory();
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('Data saved successfully');
    } catch (error) {
        console.error('Error saving data:', error);
        throw error;
    }
}

// Load data from file
async function loadData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.log('No existing data file found or error reading it');
        return null;
    }
}

// Save metadata
async function saveMetadata(metadata) {
    try {
        await ensureDataDirectory();
        await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
    } catch (error) {
        console.error('Error saving metadata:', error);
    }
}

// Load metadata
async function loadMetadata() {
    try {
        const data = await fs.readFile(METADATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return { lastFetch: null, nextScheduledFetch: null };
    }
}

// Update data (fetch and save)
async function updateData() {
    try {
        const data = await fetchSupplyData();
        await saveData(data);
        
        const metadata = {
            lastFetch: new Date().toISOString(),
            nextScheduledFetch: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
        };
        await saveMetadata(metadata);
        
        return data;
    } catch (error) {
        console.error('Error updating data:', error);
        throw error;
    }
}

// Schedule weekly updates
function scheduleWeeklyUpdate() {
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    setInterval(async () => {
        console.log('Running scheduled weekly update...');
        try {
            await updateData();
            console.log('Scheduled update completed successfully');
        } catch (error) {
            console.error('Scheduled update failed:', error);
        }
    }, ONE_WEEK);
    
    console.log('Weekly update scheduler initialized');
}

// API Routes

// Get supply data
app.get('/api/supply', async (req, res) => {
    try {
        let data = await loadData();
        
        // If no data exists, fetch it now
        if (!data) {
            console.log('No cached data found, fetching fresh data...');
            data = await updateData();
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error serving supply data:', error);
        res.status(500).json({ error: 'Failed to fetch supply data' });
    }
});

// Alias for /api/supply - frontend uses this
app.get('/api/data', async (req, res) => {
    try {
        let data = await loadData();
        
        // If no data exists, fetch it now
        if (!data) {
            console.log('No cached data found, fetching fresh data...');
            data = await updateData();
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error serving supply data:', error);
        res.status(500).json({ error: 'Failed to fetch supply data' });
    }
});

// Get metadata (when was data last updated)
app.get('/api/metadata', async (req, res) => {
    try {
        const metadata = await loadMetadata();
        res.json(metadata);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
});

// Manual refresh endpoint (useful for testing)
app.post('/api/refresh', async (req, res) => {
    try {
        console.log('Manual refresh requested...');
        const data = await updateData();
        res.json({ 
            success: true, 
            message: 'Data refreshed successfully',
            cardsCount: data.cards.length,
            lastUpdated: data.lastUpdated
        });
    } catch (error) {
        console.error('Error during manual refresh:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to refresh data',
            message: error.message 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'Curio Cards Supply Backend'
    });
});

// Initialize and start server
async function startServer() {
    try {
        await ensureDataDirectory();
        
        // Try to load existing data, if none exists, fetch it
        let data = await loadData();
        if (!data) {
            console.log('No existing data found, fetching initial data...');
            await updateData();
        } else {
            console.log('Loaded existing data from cache');
        }
        
        // Schedule weekly updates
        scheduleWeeklyUpdate();
        
        app.listen(PORT, () => {
            console.log(`\n========================================`);
            console.log(`Curio Cards Supply Backend Service`);
            console.log(`========================================`);
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`API Endpoints:`);
            console.log(`  GET  /api/supply   - Get supply data`);
            console.log(`  GET  /api/metadata - Get metadata`);
            console.log(`  POST /api/refresh  - Manual refresh`);
            console.log(`  GET  /api/health   - Health check`);
            console.log(`========================================\n`);
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
