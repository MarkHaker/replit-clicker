"""
Telegram-бот кликер с реферальной системой и WebApp.
Использует aiogram 3.x, SQLite, asyncio.

Запуск:
    pip install -r requirements.txt
    cp .env.example .env  # заполни BOT_TOKEN, BOT_USERNAME, WEBAPP_URL
    python bot.py
"""

import asyncio
import logging
import os
import json

from aiogram import Bot, Dispatcher, F
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    Message,
    ReplyKeyboardMarkup,
    KeyboardButton,
    WebAppInfo,
)
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

import database as db

# ─── Конфигурация ─────────────────────────────────────────────────────────────

load_dotenv()

BOT_TOKEN   = os.getenv("BOT_TOKEN",   "")
BOT_USERNAME = os.getenv("BOT_USERNAME", "YourBotUsername")
WEBAPP_URL  = os.getenv("WEBAPP_URL",  "https://yourusername.github.io/clicker-webapp/")

if not BOT_TOKEN:
    raise ValueError("❌ BOT_TOKEN не задан в .env файле!")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Инициализация ────────────────────────────────────────────────────────────

bot = Bot(
    token=BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=ParseMode.HTML),
)
dp = Dispatcher()

# ─── Клавиатура ───────────────────────────────────────────────────────────────

def main_keyboard() -> ReplyKeyboardMarkup:
    """Основная ReplyKeyboard с кнопкой WebApp."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="🎮 Играть",
                    web_app=WebAppInfo(url=WEBAPP_URL),
                ),
                KeyboardButton(text="📊 Мой прогресс"),
            ],
            [
                KeyboardButton(text="👥 Реферальная программа"),
                KeyboardButton(text="💸 Вывести реф. бонусы"),
            ],
        ],
        resize_keyboard=True,
        one_time_keyboard=False,
    )


# ─── Вспомогательные функции ──────────────────────────────────────────────────

def format_number(n: float) -> str:
    """Форматировать большие числа: 1250000 → 1.25M"""
    n = int(n)
    if n >= 1_000_000_000:
        return f"{n / 1_000_000_000:.2f}B"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n / 1_000:.2f}K"
    return str(n)


async def ensure_user(user_id: int, username: str, invited_by: int | None = None):
    """Создать пользователя в БД если не существует."""
    user = await db.get_user(user_id)
    if user is None:
        await db.create_user(user_id, username, invited_by)
    elif username and user.get("username") != username:
        await db.update_username(user_id, username)


def check_username(message: Message) -> bool:
    """True если у пользователя есть @username."""
    return bool(message.from_user and message.from_user.username)


# ─── Обработчики ──────────────────────────────────────────────────────────────

@dp.message(CommandStart())
async def cmd_start(message: Message):
    """
    /start — приветствие, создание пользователя, обработка реф. ссылки.
    Deep link формат: /start ref_123456
    """
    user = message.from_user

    # Проверяем username
    if not user.username:
        await message.answer(
            "❗ Для работы бота необходим <b>@username</b> в Telegram.\n\n"
            "Установите его в <b>Настройки → Изменить профиль → Имя пользователя</b> "
            "и снова нажмите /start.",
        )
        return

    # Парсим реф. ссылку
    invited_by: int | None = None
    args = message.text.split()[1] if len(message.text.split()) > 1 else None
    if args and args.startswith("ref_"):
        try:
            referrer_id = int(args.split("_")[1])
            if referrer_id != user.id:
                # Проверяем что пригласитель существует
                referrer = await db.get_user(referrer_id)
                if referrer:
                    invited_by = referrer_id
        except (ValueError, IndexError):
            pass

    # Создаём/обновляем пользователя
    await ensure_user(user.id, user.username, invited_by)

    ref_notice = ""
    if invited_by:
        ref_notice = "\n\n🎁 Вы перешли по реферальной ссылке — ваш прогресс поддержит пригласителя!"

    await message.answer(
        f"👋 Привет, <b>@{user.username}</b>! Это моя игра <b>Кликер</b>. 🪙\n\n"
        f"Нажимай кнопку, зарабатывай монеты, улучшай персонажа и приглашай друзей!"
        f"{ref_notice}",
        reply_markup=main_keyboard(),
    )


@dp.message(F.text == "📊 Мой прогресс")
async def my_progress(message: Message):
    """Краткая сводка прогресса без захода в игру."""
    if not check_username(message):
        await message.answer("❗ Установите @username в настройках Telegram.")
        return

    user_data = await db.get_user(message.from_user.id)
    if not user_data:
        await message.answer("Вы ещё не начали игру. Нажмите 🎮 Играть!")
        return

    await message.answer(
        f"📊 <b>Ваш прогресс</b>\n\n"
        f"🪙 Монеты:           <b>{format_number(user_data['main_balance'])}</b>\n"
        f"👆 Сила клика:       <b>+{user_data['click_power']}</b> за клик\n"
        f"⚡ Авто-доход:       <b>{format_number(user_data['auto_income'])}</b>/сек\n"
        f"💰 Реф. баланс:      <b>{format_number(user_data['ref_balance'])}</b>\n"
    )


@dp.message(F.text == "👥 Реферальная программа")
async def referral_program(message: Message):
    """Показывает реф. ссылку и статистику приглашений."""
    if not check_username(message):
        await message.answer("❗ Установите @username в настройках Telegram.")
        return

    user_id = message.from_user.id
    await ensure_user(user_id, message.from_user.username)

    stats = await db.get_referral_stats(user_id)
    ref_link = f"https://t.me/{BOT_USERNAME}?start=ref_{user_id}"

    invited_list = ""
    if stats["invited_users"]:
        lines = []
        for u in stats["invited_users"][:5]:
            name = f"@{u['username']}" if u["username"] else f"id{u['invited_id']}"
            earned = format_number(u["total_earned"])
            lines.append(f"  • {name} — принёс вам <b>{earned}</b> монет")
        invited_list = "\n" + "\n".join(lines)

    await message.answer(
        f"👥 <b>Реферальная программа</b>\n\n"
        f"За каждый клик приглашённого вы получаете <b>35%</b> дохода!\n\n"
        f"🔗 <b>Ваша ссылка:</b>\n<code>{ref_link}</code>\n\n"
        f"👤 Приглашено: <b>{stats['invited_count']}</b> чел.\n"
        f"💰 Реф. баланс: <b>{format_number(stats['ref_balance'])}</b> монет"
        f"{invited_list}\n\n"
        f"💡 Нажмите <b>💸 Вывести реф. бонусы</b> чтобы перевести их в игру.",
    )


@dp.message(F.text == "💸 Вывести реф. бонусы")
async def withdraw_ref(message: Message):
    """Конвертирует реф. баланс в основную валюту (1:1)."""
    if not check_username(message):
        await message.answer("❗ Установите @username в настройках Telegram.")
        return

    user_id = message.from_user.id
    await ensure_user(user_id, message.from_user.username)

    amount = await db.convert_ref_balance(user_id)

    if amount <= 0:
        await message.answer(
            "😔 Реферальный баланс пуст.\n\n"
            "Пригласите друзей по вашей ссылке — вы будете получать 35% от их кликов!",
        )
        return

    formatted = format_number(amount)
    await message.answer(
        f"✅ <b>Готово!</b>\n\n"
        f"💸 <b>{formatted}</b> монет переведено из реферального баланса в основной!\n\n"
        f"🎮 Заходите в игру и тратьте монеты на улучшения!",
    )


@dp.message(F.web_app_data)
async def handle_webapp_data(message: Message):
    """
    Обработка данных из WebApp (sendData).
    WebApp отправляет JSON с прогрессом игрока.

    В будущем: вместо sendData использовать REST API на FastAPI + JWT токен
    из Telegram initData для валидации на сервере. Это предотвращает накрутки.
    """
    try:
        data = json.loads(message.web_app_data.data)
    except (json.JSONDecodeError, AttributeError):
        logger.warning("Получены некорректные данные из WebApp: %s", message.web_app_data)
        return

    user_id = message.from_user.id
    username = message.from_user.username or ""

    # Ожидаемая структура:
    # { "balance": 1500, "clickPower": 2, "autoIncome": 5, "sessionClicks": 120 }
    main_balance     = float(data.get("balance", 0))
    click_power      = int(data.get("clickPower", 1))
    auto_income      = float(data.get("autoIncome", 0))
    session_clicks   = int(data.get("sessionClicks", 0))

    await ensure_user(user_id, username)
    await db.sync_progress(
        user_id=user_id,
        main_balance=main_balance,
        click_power=click_power,
        auto_income=auto_income,
        clicks_this_session=session_clicks,
    )

    logger.info(
        "Синхронизация от %s (id=%d): баланс=%s, клики=%d",
        username, user_id, format_number(main_balance), session_clicks,
    )

    # Тихое подтверждение без уведомления пользователя
    # (для периодической фоновой синхронизации)


# ─── Запуск ───────────────────────────────────────────────────────────────────

async def main():
    """Запуск бота с инициализацией БД и graceful shutdown."""
    logger.info("Инициализация базы данных...")
    await db.init_db()

    logger.info("Запуск бота @%s...", BOT_USERNAME)
    try:
        await dp.start_polling(bot, allowed_updates=["message", "web_app_data"])
    finally:
        logger.info("Бот остановлен. Закрываю соединения...")
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
