const express = require("express");
const cors = require("cors");
const path = require("path");

const connectDB = require("../db/db");
const User = require("../models/user");
const Promo = require("../models/promocode");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

connectDB();

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
// app.patch("/api/users/:telegramId/inventory", async (req, res) => {
//   try {
//     const telegramId = req.params.telegramId;
//     const { itemId, count, price } = req.body; // Добавляем price в запрос

//     if (!itemId || !count || count <= 0 || !price) {
//       return res
//         .status(400)
//         .json({ error: "Некорректные данные для обновления" });
//     }

//     const user = await User.findOne({ telegramId });
//     if (!user) {
//       return res.status(404).json({ error: "Пользователь не найден" });
//     }

//     const totalCost = price * count;

//     // Проверяем баланс
//     if (user.balance < totalCost) {
//       return res.status(400).json({ error: "Недостаточно средств" });
//     }

//     // Вычитаем баланс
//     user.balance -= totalCost;

//     // Обновляем инвентарь
//     const inventoryItem = user.inventory.find(
//       (item) => item.itemId.toString() === itemId
//     );

//     if (inventoryItem) {
//       inventoryItem.count += count;
//     } else {
//       user.inventory.push({ itemId, count });
//     }

//     await user.save();

//     res.json({
//       inventory: user.inventory,
//       newBalance: user.balance, 
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Ошибка сервера" });
//   }
// });
app.patch("/api/users/:telegramId/inventory", async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId); // Ensure it's a number
    const { itemId, count, price, isReturn = false } = req.body;

    if (!itemId || !count || count <= 0) {
      return res
        .status(400)
        .json({ error: "Некорректные данные для обновления инвентаря (itemId, count > 0)" });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    if (!isReturn) { // This is a purchase
        if (typeof price !== 'number' || price < 0) { // Price must be a non-negative number for purchase
            return res.status(400).json({ error: "Цена (price) обязательна и должна быть числом для покупки" });
        }
        const totalCost = price * count;
        if (user.balance < totalCost) {
            return res.status(400).json({ error: "Недостаточно средств" });
        }
        user.balance -= totalCost;
    } // For gift return (isReturn = true), balance is not affected here.

    const inventoryItem = user.inventory.find(
      (item) => item.itemId.toString() === itemId.toString()
    );

    if (inventoryItem) {
      inventoryItem.count += count;
    } else {
      user.inventory.push({ itemId, count });
    }

    await user.save();
    res.json({
      message: isReturn ? "Подарок возвращен в инвентарь" : "Инвентарь обновлен (покупка)",
      inventory: user.inventory,
      newBalance: user.balance.toFixed(2),
    });
  } catch (err) {
    console.error("Ошибка при обновлении инвентаря:", err);
    res.status(500).json({ error: "Ошибка сервера при обновлении инвентаря" });
  }
});
app.patch("/api/users/:telegramId/inventory/remove", async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId); // Ensure it's a number
    const { itemId, countToRemove = 1 } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: "Необходим itemId для удаления" });
    }
    if (typeof countToRemove !== 'number' || countToRemove <= 0) {
        return res.status(400).json({ error: "countToRemove должен быть положительным числом" });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const itemIndex = user.inventory.findIndex(
      (item) => item.itemId.toString() === itemId.toString()
    );

    if (itemIndex === -1 || user.inventory[itemIndex].count < countToRemove) {
      return res.status(400).json({ error: "Предмет не найден в инвентаре или недостаточное количество" });
    }

    user.inventory[itemIndex].count -= countToRemove;

    if (user.inventory[itemIndex].count === 0) {
      user.inventory.splice(itemIndex, 1); // Remove item if count is zero
    }

    await user.save();
    res.json({
      message: "Предмет успешно использован для ставки (удален из инвентаря)",
      inventory: user.inventory,
    });
  } catch (err) {
    console.error("Ошибка при удалении предмета из инвентаря:", err);
    res.status(500).json({ error: "Ошибка сервера при удалении предмета" });
  }
});

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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
