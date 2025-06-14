const express = require("express");
const cors = require("cors");
const path = require("path");
const CryptoBotAPI = require('crypto-bot-api');

const connectDB = require("../db/db");
const User = require("../models/user");
const Invoice = require("../models/invoice"); 
const Promo = require("../models/promocode");
const TonTransaction = require('../models/tonTransaction'); 

const cron = require('node-cron');

const dotenv = require('dotenv'); // Load dotenv

dotenv.config(); // Load .env file
const app = express();

const cryptoBotClient = new CryptoBotAPI(process.env.CRYPTOBOT_TOKEN);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));


const axios = require("axios");

connectDB();

// Environment variables
const TON_RECEIVER_WALLET = process.env.TON_RECEIVER_WALLET;
const TONCENTER_API_TOKEN = process.env.TONCENTER_API_TOKEN;
const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN;

// Function to verify TON transaction
async function verifyTonTransaction(txHash) {
  try {
    const response = await axios.get(`https://toncenter.com/api/v2/getTransaction?hash=${txHash}&api_key=${TONCENTER_API_TOKEN}`);
    if (response.data.ok && response.data.result) {
      return response.data.result;
    }
    return null;
  } catch (error) {
    console.error("Error verifying TON transaction:", error);
    return null;
  }
}

// Function to verify CryptoBot invoice
async function verifyCryptoBotInvoice(invoiceId) {
  try {
    const response = await axios.get(`https://pay.crypt.bot/api/getInvoice?invoice_id=${invoiceId}`, {
      headers: {
        "Crypto-Pay-API-Token": CRYPTOBOT_TOKEN
      }
    });
    if (response.data.ok && response.data.result) {
      return response.data.result;
    }
    return null;
  } catch (error) {
    console.error("Error verifying CryptoBot invoice:", error);
    return null;
  }
}
// Получить статус TON-транзакции по хешу
app.get('/api/ton/transaction/:txHash', async (req, res) => {
  try {
    const txHash = req.params.txHash;
    if (!txHash) return res.status(400).json({ ok: false, error: "txHash required" });

    const response = await axios.get(
      `https://toncenter.com/api/v2/getTransaction?hash=${txHash}&api_key=${process.env.TONCENTER_API_TOKEN}`
    );
    if (response.data.ok && response.data.result) {
      return res.json({ ok: true, result: response.data.result });
    }
    return res.status(404).json({ ok: false, error: "Transaction not found" });
  } catch (error) {
    console.error("Error verifying TON transaction:", error);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// === Сохранение TON-транзакций при пополнении ===
app.post('/api/ton/add-transaction', async (req, res) => {
  try {
    const { txHash, telegramId, amount } = req.body;
    if (!txHash || !telegramId || !amount) {
      return res.status(400).json({ error: 'Необходимы txHash, telegramId и amount' });
    }
    // Проверка на дублирование
    const exists = await TonTransaction.findOne({ txHash });
    if (exists) {
      return res.status(400).json({ error: 'Транзакция уже сохранена' });
    }
    const tx = new TonTransaction({ txHash, telegramId, amount, status: 'pending' });
    await tx.save();
    res.json({ ok: true, message: 'TON-транзакция сохранена', tx });
  } catch (err) {
    console.error('Ошибка при сохранении TON-транзакции:', err);
    res.status(500).json({ error: 'Ошибка сервера при сохранении TON-транзакции' });
  }
});
// // Добавляем в server.js
// let gameState = {
//   isRunning: false,      // Идет ли игра
//   coefficient: 1.00,    // Текущий коэффициент
//   crashAt: null,        // Множитель краша
//   players: new Map()    // Игроки и их ставки: { telegramId, bet, hasCashedOut }
// };

// function generateCrashPoint() {
//   // Ваша логика из frog-game.js (например, алгоритм умножения)
//   return Math.random() < 0.3 ? 2.5 + Math.random() * 3 : 1.5 + Math.random();
// }

// function startGame() {
//   if (gameState.isRunning) return;
  
//   gameState = {
//     isRunning: true,
//     coefficient: 1.00,
//     crashAt: generateCrashPoint(),
//     players: new Map()
//   };

//   // Рассылаем начало игры всем
//   broadcastGameState();
  
//   // Запускаем обновление коэффициента
//   const gameLoop = setInterval(() => {
//     if (!gameState.isRunning) {
//       clearInterval(gameLoop);
//       return;
//     }
    
//     // Увеличиваем коэффициент (аналогично вашему frog-game.js)
//     gameState.coefficient += 0.01 * Math.log(gameState.coefficient + 1);
    
//     // Проверяем краш
//     if (gameState.coefficient >= gameState.crashAt) {
//       endGame();
//       clearInterval(gameLoop);
//     }
    
//     broadcastGameState();
//   }, 100); // Интервал обновления (мс)
// }

// function endGame() {
//   gameState.isRunning = false;
//   broadcastGameState();
  
//   // Через 5 сек запускаем новую игру
//   setTimeout(startGame, 5000);
// }

// function broadcastGameState() {
//   wss.clients.forEach(client => {
//     if (client.readyState === WebSocket.OPEN) {
//       client.send(JSON.stringify({
//         type: 'gameUpdate',
//         ...gameState
//       }));
//     }
//   });
// }

// // Обработка ставок
// wss.on('connection', (socket) => {
//   socket.on('message', (data) => {
//     const msg = JSON.parse(data);
    
//     if (msg.type === 'placeBet' && !gameState.players.has(msg.telegramId)) {
//       gameState.players.set(msg.telegramId, { 
//         bet: msg.bet, 
//         hasCashedOut: false 
//       });
//       broadcastGameState();
//     }
    
//     if (msg.type === 'cashout' && gameState.players.has(msg.telegramId)) {
//       const player = gameState.players.get(msg.telegramId);
//       if (!player.hasCashedOut && gameState.isRunning) {
//         player.hasCashedOut = true;
//         const win = player.bet * gameState.coefficient;
        
//         // Отправляем выигрыш игроку
//         socket.send(JSON.stringify({
//           type: 'cashoutSuccess',
//           win
//         }));
        
//         broadcastGameState();
//       }
//     }
//   });
// });

// // Запускаем первую игру
// startGame();

// === Создание инвойса ===
app.post('/api/cryptobot/create-invoice', async (req, res) => {
  let { amount } = req.body;
  amount = Number(amount);
  if (!amount || isNaN(amount) || amount < 1) {
    return res.status(400).json({ ok: false, error: 'Минимальная сумма — 1 TON' });
  }

  try {
    console.log('Запрос к CryptoBot API:', {
      asset: 'TON',
      amount: amount.toString(),
      description: 'Пополнение через NFTGo',
      hidden_message: 'Спасибо за пополнение!',
      paid_btn_name: 'openBot',
      paid_btn_url: 'https://t.me/nftgo_bot'
    });

    const response = await axios.post(
      'https://pay.crypt.bot/api/createInvoice',
      {
        asset: 'TON',
        amount: amount.toString(), // CryptoBot API требует строку
        description: 'Пополнение через NFTGo',
        hidden_message: 'Спасибо за пополнение!',
        paid_btn_name: 'openBot', // исправлено на валидное значение
        paid_btn_url: 'https://t.me/nftgo_bot'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Crypto-Pay-API-Token': process.env.CRYPTOBOT_TOKEN
        }
      }
    );

    console.log('Ответ от CryptoBot API:', response.data);

    if (!response.data.ok || !response.data.result?.invoice_id) {
      return res.status(400).json({ ok: false, error: response.data.description || 'Ошибка CryptoBot' });
    }

    // Сохранение инвойса в базу данных
    const newInvoice = new Invoice({
      invoiceId: response.data.result.invoice_id, // Убедимся, что invoice_id передается
      telegramId: req.body.telegramId, // Telegram ID пользователя
      amount, // Сумма инвойса
      status: 'pending' // Статус инвойса
    });
    await newInvoice.save();

    res.json({ ok: true, result: response.data.result });
  } catch (err) {
    console.error('Ошибка при создании инвойса CryptoBot:', err?.response?.data || err);
    res.status(500).json({ ok: false, error: 'Ошибка сервера при создании инвойса' });
  }
});

// Обновление маршрута для проверки статуса инвойса с использованием библиотеки crypto-bot-api
app.get('/api/cryptobot/invoice/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    if (!invoiceId) return res.status(400).json({ ok: false, error: 'invoiceId required' });

    // Новый способ получения инвойса через getInvoices
    const invoicesData = await cryptoBotClient.getInvoices({ invoice_ids: [invoiceId] });
    const invoice = invoicesData.items?.[0];
    if (!invoice) {
      return res.status(404).json({ ok: false, error: 'Инвойс не найден' });
    }
    res.json({ ok: true, result: invoice });
  } catch (err) {
    console.error('Ошибка при проверке статуса инвойса:', err);
    res.status(500).json({ ok: false, error: 'Ошибка сервера при проверке статуса инвойса' });
  }
});

app.get('/api/cryptobot/invoice', async (req, res) => {
  try {
    const invoices = await Invoice.find(); // Получаем все инвойсы из базы данных
    res.json({ ok: true, result: invoices });
  } catch (err) {
    console.error('Ошибка при получении инвойсов:', err);
    res.status(500).json({ ok: false, error: 'Ошибка сервера при получении инвойсов' });
  }
});



// Централизованная функция обновления инвойса
async function updateInvoice(invoiceId) {
  try {
    // Проверяем наличие инвойса в базе данных
    const invoice = await Invoice.findOne({ invoiceId });
    if (!invoice) {
      return { ok: false, error: 'Инвойс не найден' };
    }

    // Новый способ получения инвойса через getInvoices
    const invoicesData = await cryptoBotClient.getInvoices({ invoice_ids: [invoiceId] });
    const invoiceData = invoicesData.items?.[0];
    if (!invoiceData) {
      return { ok: false, error: 'Инвойс не найден в CryptoBot' };
    }

    if (invoiceData.status === 'paid') {
      // Обновляем статус инвойса в базе данных
      invoice.status = 'paid';
      await invoice.save();

      // Пополняем баланс пользователя
      const user = await User.findOne({ telegramId: invoice.telegramId });
      if (user) {
        user.balance += invoice.amount;
        await user.save();
      }

      return { ok: true, message: 'Инвойс оплачен, баланс обновлён' };
    } else {
      return { ok: true, message: `Инвойс имеет статус: ${invoiceData.status}` };
    }
  } catch (err) {
    console.error('Ошибка при обновлении инвойса:', err);
    return { ok: false, error: 'Ошибка сервера' };
  }
}

// === Обновление статуса инвойса и пополнение баланса ===
app.post('/api/cryptobot/update-invoice', async (req, res) => {
  const { invoiceId } = req.body;

  if (!invoiceId) {
    return res.status(400).json({ ok: false, error: 'Не указан invoiceId' });
  }

  const result = await updateInvoice(invoiceId);
  if (!result.ok) {
    return res.status(400).json(result);
  }

  res.json(result);
});



app.post('/api/users/:telegramId/history', async (req, res) => {
  let telegramId = Number(req.params.telegramId);
  if (!telegramId || isNaN(telegramId)) {
    return res.status(400).json({ error: 'Некорректный telegramId' });
  }
  const { date, betAmount, coefficient, result } = req.body;
  if (!date || !betAmount || !coefficient || !result) {
    return res.status(400).json({ error: 'Недостаточно данных' });
  }
  try {
    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    user.gameHistory.push({ date, betAmount, coefficient, result });
    await user.save();
    res.status(200).json({ message: 'История добавлена' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/addbalance/ton', async (req, res) => {
  let telegramId = Number(req.body.telegramId);
  const amount = req.body.amount;
  if (!telegramId || isNaN(telegramId) || typeof amount !== "number" || !isFinite(amount)) {
    return res.status(400).json({ error: "Неверные данные" });
  }
  try {
    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    user.balance += amount;
    await user.save();
    res.json({ message: "Баланс пополнен", balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Новый роут: начисление баланса после оплаты CryptoBot ===

app.post('/api/addbalance/cryptobot', async (req, res) => {
  try {
    let { telegramId, invoiceId } = req.body;
    telegramId = Number(telegramId);
    if (!telegramId || isNaN(telegramId) || !invoiceId) {
      return res.status(400).json({ error: "Неверные данные (telegramId или invoiceId)" });
    }

    // Проверка: использовался ли уже этот invoiceId
    const existingInvoice = await Invoice.findOne({ invoiceId });
    if (existingInvoice) {
      return res.status(400).json({ error: "Инвойс уже использован" });
    }

    // Тестовый режим
    if (invoiceId.startsWith('test_invoice_')) {
      const user = await User.findOne({ telegramId });
      if (!user) return res.status(404).json({ error: "Пользователь не найден" });

      const amount = 10;
      user.balance += amount;
      await user.save();

      // Сохраняем тестовый инвойс
      await Invoice.create({
        invoiceId,
        telegramId,
        amount,
        status: 'paid'
      });

      return res.json({ message: "Тестовое пополнение успешно!", balance: user.balance });
    }

    // Реальная проверка через CryptoBot
    const response = await axios.get(
      `https://pay.crypt.bot/api/getInvoice?invoice_id=${invoiceId}`,
      {
        headers: {
          "Crypto-Pay-API-Token": process.env.CRYPTOBOT_TOKEN
        }
      }
    );

    if (!response.data.ok || !response.data.result) {
      return res.status(400).json({ error: "Инвойс не найден или ошибка CryptoBot" });
    }

    const invoice = response.data.result;
    if (invoice.status !== 'paid') {
      return res.status(400).json({ error: "Инвойс не оплачен" });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const amount = Number(invoice.amount);
    user.balance += amount;
    await user.save();

    // Сохраняем инвойс в БД
    await Invoice.create({
      invoiceId,
      telegramId,
      amount,
      status: invoice.status
    });

    res.json({ message: "Баланс успешно пополнен", balance: user.balance });

  } catch (err) {
    console.error("Ошибка при начислении баланса через CryptoBot:", err?.response?.data || err);
    res.status(500).json({ error: "Ошибка сервера при начислении баланса" });
  }
});


app.patch("/api/users/:telegramId", async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);
    const updateData = req.body;

    const user = await User.findOneAndUpdate({ telegramId }, updateData, {
      new: true,
    });

    if (!user) {
      return res.status(404).json({ message: "Користувача не знайдено" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.patch("/api/users/:telegramId/balance", async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);
    const { balance } = req.body;

    if (typeof balance !== "number") {
      return res.status(400).json({ error: "Баланс має бути числом" });
    }

    const user = await User.findOneAndUpdate(
      { telegramId },
      { balance },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Користувача не знайдено" });
    }

    res.json({ message: "Баланс оновлено", balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/users/:telegramId/inventory", async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    res.json(user.inventory);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});
app.patch("/api/users/:telegramId/inventory/remove", async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);
    const { itemId, countToRemove = 1 } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: "Необхідно вказати itemId" });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: "Користувача не знайдено" });
    }

    const itemIndex = user.inventory.findIndex(
      item => item.itemId === itemId
    );

    if (itemIndex === -1 || user.inventory[itemIndex].count < countToRemove) {
      return res.status(400).json({ error: "Недостатньо подарунків у інвентарі" });
    }

    user.inventory[itemIndex].count -= countToRemove;

    // Якщо кількість подарунків стала 0, видаляємо його з інвентаря
    if (user.inventory[itemIndex].count === 0) {
      user.inventory.splice(itemIndex, 1);
    }

    await user.save();

    res.json({
      message: "Подарунок успішно використано для ставки",
      inventory: user.inventory
    });
  } catch (err) {
    console.error("Помилка при видаленні подарунка:", err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.patch("/api/users/:telegramId/inventory", async (req, res) => {
  try {
    const telegramId = req.params.telegramId;
    const { itemId, count, price } = req.body; // Добавляем price в запрос

    if (!itemId || !count || count <= 0 || !price) {
      return res
        .status(400)
        .json({ error: "Некорректные данные для обновления" });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const totalCost = price * count;

    // Проверяем баланс
    if (user.balance < totalCost) {
      return res.status(400).json({ error: "Недостаточно средств" });
    }

    // Вычитаем баланс
    user.balance -= totalCost;

    // Обновляем инвентарь
    const inventoryItem = user.inventory.find(
      (item) => item.itemId.toString() === itemId
    );

    if (inventoryItem) {
      inventoryItem.count += count;
    } else {
      user.inventory.push({ itemId, count });
    }

    await user.save();

    res.json({
      inventory: user.inventory,
      newBalance: user.balance, 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});
// app.patch("/api/users/:telegramId/inventory", async (req, res) => {
//   try {
//     const telegramId = Number(req.params.telegramId); // Ensure it's a number
//     const { itemId, count, price, isReturn = false } = req.body;

//     if (!itemId || !count || count <= 0) {
//       return res
//         .status(400)
//         .json({ error: "Некорректные данные для обновления инвентаря (itemId, count > 0)" });
//     }

//     const user = await User.findOne({ telegramId });
//     if (!user) {
//       return res.status(404).json({ error: "Пользователь не найден" });
//     }

//     if (!isReturn) { // This is a purchase
//         if (typeof price !== 'number' || price < 0) { // Price must be a non-negative number for purchase
//             return res.status(400).json({ error: "Цена (price) обязательна и должна быть числом для покупки" });
//         }
//         const totalCost = price * count;
//         if (user.balance < totalCost) {
//             return res.status(400).json({ error: "Недостаточно средств" });
//         }
//         user.balance -= totalCost;
//     } // For gift return (isReturn = true), balance is not affected here.

//     const inventoryItem = user.inventory.find(
//       (item) => item.itemId.toString() === itemId.toString()
//     );

//     if (inventoryItem) {
//       inventoryItem.count += count;
//     } else {
//       user.inventory.push({ itemId, count });
//     }

//     await user.save();
//     res.json({
//       message: isReturn ? "Подарок возвращен в инвентарь" : "Инвентарь обновлен (покупка)",
//       inventory: user.inventory,
//       newBalance: user.balance.toFixed(2),
//     });
//   } catch (err) {
//     console.error("Ошибка при обновлении инвентаря:", err);
//     res.status(500).json({ error: "Ошибка сервера при обновлении инвентаря" });
//   }
// });
// app.patch("/api/users/:telegramId/inventory/remove", async (req, res) => {
//   try {
//     const telegramId = Number(req.params.telegramId); // Ensure it's a number
//     const { itemId, countToRemove = 1 } = req.body;

//     if (!itemId) {
//       return res.status(400).json({ error: "Необходим itemId для удаления" });
//     }
//     if (typeof countToRemove !== 'number' || countToRemove <= 0) {
//         return res.status(400).json({ error: "countToRemove должен быть положительным числом" });
//     }

//     const user = await User.findOne({ telegramId });
//     if (!user) {
//       return res.status(404).json({ error: "Пользователь не найден" });
//     }

//     const itemIndex = user.inventory.findIndex(
//       (item) => item.itemId.toString() === itemId.toString()
//     );

//     if (itemIndex === -1 || user.inventory[itemIndex].count < countToRemove) {
//       return res.status(400).json({ error: "Предмет не найден в инвентаре или недостаточное количество" });
//     }

//     user.inventory[itemIndex].count -= countToRemove;

//     if (user.inventory[itemIndex].count === 0) {
//       user.inventory.splice(itemIndex, 1); // Remove item if count is zero
//     }

//     await user.save();
//     res.json({
//       message: "Предмет успешно использован для ставки (удален из инвентаря)",
//       inventory: user.inventory,
//     });
//   } catch (err) {
//     console.error("Ошибка при удалении предмета из инвентаря:", err);
//     res.status(500).json({ error: "Ошибка сервера при удалении предмета" });
//   }
// });

app.delete("/api/promocode/:code", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();

    const promo = await Promo.findOneAndDelete({ code });

    if (!promo) {
      return res.status(404).json({ error: "Промокод не знайдено" });
    }

    res.json({ message: `Промокод "${code}" успішно видалено` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/users", async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/promocode/activate", async (req, res) => {
  try {
    const { telegramId, code } = req.body;
    if (!telegramId || !code) {
      return res.status(400).json({ error: "telegramId та code обов'язкові" });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: "Користувача не знайдено" });
    }

    const upperCode = code.toUpperCase();

    const alreadyUsed = user.enteredPromocodes.some(
      (entry) => entry.code === upperCode
    );
    if (alreadyUsed) {
      return res.status(400).json({ error: "Промокод уже був використаний" });
    }

    const promocode = await Promo.findOne({ code: upperCode, isActive: true });
    if (!promocode) {
      return res
        .status(404)
        .json({ error: "Промокод не знайдено або неактивний" });
    }

    if (promocode.expiresAt && promocode.expiresAt < new Date()) {
      return res.status(400).json({ error: "Промокод сплив" });
    }

    user.balance += promocode.reward;
    user.enteredPromocodes.push({ code: upperCode });

    await user.save();

    res.json({
      message: `Промокод "${upperCode}" активовано! Баланс збільшено на ${promocode.reward}`,
      balance: user.balance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/promocode", async (req, res) => {
  try {
    const promocodes = await Promo.find().sort({ createdAt: -1 });
    res.json(promocodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/promocode", async (req, res) => {
  try {
    const { code, reward, isActive } = req.body;

    if (!code || typeof reward !== "number") {
      return res.status(400).json({ error: "Потрібно передати code і reward" });
    }

    const existing = await Promo.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ error: "Такий промокод вже існує" });
    }

    const promo = new Promo({
      code: code.toUpperCase(),
      reward,
      isActive: isActive ?? true,
    });

    await promo.save();
    res.status(201).json(promo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

// === Сохранение TON-транзакций при пополнении ===
app.post('/api/ton/add-transaction', async (req, res) => {
  try {
    const { txHash, telegramId, amount } = req.body;
    if (!txHash || !telegramId || !amount) {
      return res.status(400).json({ error: 'Необходимы txHash, telegramId и amount' });
    }
    // Проверка на дублирование
    const exists = await TonTransaction.findOne({ txHash });
    if (exists) {
      return res.status(400).json({ error: 'Транзакция уже сохранена' });
    }
    const tx = new TonTransaction({ txHash, telegramId, amount, status: 'pending' });
    await tx.save();
    res.json({ ok: true, message: 'TON-транзакция сохранена', tx });
  } catch (err) {
    console.error('Ошибка при сохранении TON-транзакции:', err);
    res.status(500).json({ error: 'Ошибка сервера при сохранении TON-транзакции' });
  }
});

// === Проверка статуса TON-транзакции (для ton.js) ===
app.get('/api/ton/check-status/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    if (!txHash) return res.status(400).json({ status: 'error', error: 'txHash required' });
    const tx = await TonTransaction.findOne({ txHash });
    if (!tx) return res.status(404).json({ status: 'not_found' });
    if (tx.status === 'confirmed') {
      return res.json({ status: 'confirmed' });
    } else {
      return res.json({ status: 'pending' });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});


// === CRON: Периодическая проверка и обновление статусов инвойсов CryptoBot ===
cron.schedule('*/2 * * * *', async () => {
  try {
    const invoices = await Invoice.find({ status: 'pending' });
    for (const invoice of invoices) {
      try {
        // Получаем актуальный статус инвойса через CryptoBot API
        const invoicesData = await cryptoBotClient.getInvoices({ invoice_ids: [invoice.invoiceId] });
        const invoiceData = invoicesData.items?.[0];
        if (invoiceData && invoiceData.status === 'paid') {
          invoice.status = 'paid';
          await invoice.save();
          // Пополняем баланс пользователя
          const user = await User.findOne({ telegramId: invoice.telegramId });
          if (user) {
            user.balance += invoice.amount;
            await user.save();
            console.log(`Баланс пользователя ${invoice.telegramId} пополнен на ${invoice.amount} TON`);
          }
        }
      } catch (err) {
        console.error(`Ошибка проверки инвойса ${invoice.invoiceId}:`, err?.response?.data || err);
      }
    }
  } catch (err) {
    console.error('Ошибка периодической проверки инвойсов CryptoBot:', err);
  }
});

// === CRON: Периодическая проверка и обновление статусов TON-транзакций ===
cron.schedule('*/2 * * * *', async () => {
  try {
    const pendingTxs = await TonTransaction.find({ status: 'pending' });
    for (const tx of pendingTxs) {
      try {
        // Проверяем статус транзакции через toncenter (используем BOC как hash, если это реально hash)
        const response = await axios.get(
          `https://tonapi.io/v2/blockchain/transactions/${tx.txHash}`
        );
        // Если транзакция найдена и успешна
        if (response.data && response.data.transaction && response.data.transaction.status === 'finalized') {
          tx.status = 'confirmed';
          await tx.save();
          // Пополняем баланс пользователя
          const user = await User.findOne({ telegramId: tx.telegramId });
          if (user) {
            user.balance += tx.amount;
            await user.save();
            console.log(`TON: Баланс пользователя ${tx.telegramId} пополнен на ${tx.amount} TON`);
          }
        }
      } catch (err) {
        // Не найдено или ошибка — просто пропускаем
        // Можно логировать для отладки: console.error(`TON: Ошибка проверки транзакции ${tx.txHash}:`, err?.response?.data || err);
      }
    }
  } catch (err) {
    console.error('TON: Ошибка периодической проверки транзакций:', err);
  }
});





const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});

