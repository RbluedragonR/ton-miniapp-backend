"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const { Telegraf, Markup } = require("telegraf");

// ⚠️ Use your regenerated token from BotFather here
const bot = new Telegraf("7716949534:AAHIB12sYKULosOx7xEa0dwH984sBWHwhik");

bot.start((ctx) => {
  ctx.reply(
    `Hello! Welcome to Oxyble Game!
You are now the member of an oxygen miners.
Pay only $10/year to plant your RWA tree and start mining with our community.
Invite your friend and get $2.5 as your reward and even more.
Connect powered NFTs and pump up your passive income.
Oxyble team will definitely appreciate your efforts once the token is listed (the dates are coming soon).
Think about your friends — bring them to the game and get even more rewards together!`,
    Markup.inlineKeyboard([
      [Markup.button.webApp("Play (Pay with Stars)", "https://oxyble.vercel.app")],
      [Markup.button.url("Subscribe (link to telegram channel)", "https://t.me/oxyble")],
      [Markup.button.callback("How to play (Open the rules)", "earn_info")],
      [Markup.button.callback("Sign up (Nick, channel subscription, welcome bonus 1000 coins)", "sign_up")],
    ])
  );
});

// ✅ Properly handle callback buttons
bot.action("earn_info", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("📜 You earn coins by tapping and completing daily missions. Invite others to earn even more!");
});

bot.action("sign_up", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("📝 Please enter your nickname to register and get 1000 free coins as a welcome bonus!");
});

bot.launch();
console.log("✅ Bot is running...");

// Export the bot instance for use in the server
module.exports = { bot };
