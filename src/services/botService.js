const TelegramBot = require('node-telegram-bot-api');
require('../config/envConfig');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables!');
}

// Initialize the bot
const bot = new TelegramBot(token);
console.log('Telegram bot service initialized.');

// Simple /start command handler
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome to ARIX Terminal!');
});

// Set the webhook and export the bot instance
const webhookUrl = `${process.env.RAILWAY_STATIC_URL}/telegram-webhook-${token}`;
bot.setWebHook(webhookUrl)
  .then(() => {
    console.log(`Telegram bot webhook successfully set up at ${webhookUrl}`);
  })
  .catch((err) => {
    console.error('Error setting up Telegram webhook:', err);
  });

module.exports = { bot };