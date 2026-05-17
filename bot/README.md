# 🐍 Telegram Clicker Bot

Бот на Python (aiogram 3.x) для игры-кликера с WebApp.

## Быстрый старт

```bash
pip install -r requirements.txt
cp .env.example .env
# Заполните BOT_TOKEN, BOT_USERNAME, WEBAPP_URL в .env
python bot.py
```

## Структура файлов

```
bot/
├── bot.py          — основной файл бота (хэндлеры, запуск)
├── database.py     — работа с SQLite (создание БД, CRUD)
├── requirements.txt
├── .env.example    — шаблон переменных окружения
└── game_data.db    — создаётся автоматически при первом запуске
```

## Переменные окружения (.env)

| Переменная    | Описание                                      |
|---------------|-----------------------------------------------|
| `BOT_TOKEN`   | Токен от @BotFather                           |
| `BOT_USERNAME`| Username бота без @ (для реф. ссылок)         |
| `WEBAPP_URL`  | URL вашего GitHub Pages с WebApp              |

## База данных (SQLite)

`game_data.db` создаётся автоматически. Таблицы:

- **users** — баланс, сила клика, авто-доход, реф. баланс, кто пригласил
- **referrals** — связи пригласитель → приглашённый + суммарный заработок

## Реферальная механика

- Ссылка: `https://t.me/BOT_USERNAME?start=ref_USER_ID`
- 35% от кликов приглашённого → `ref_balance` пригласителя
- `ref_balance` конвертируется в `main_balance` кнопкой "💸 Вывести реф. бонусы"
