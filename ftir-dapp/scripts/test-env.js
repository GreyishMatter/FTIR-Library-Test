// script to test if .env are saved correctly
require('dotenv').config();
console.log('RPC URL:', process.env.ETHEREUM_SEPOLIA_RPC_URL);
console.log('Private Key:', process.env.PRIVATE_KEY ? 'Loaded' : 'Missing');