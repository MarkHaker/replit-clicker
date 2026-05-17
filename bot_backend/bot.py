"""
Telegram Clicker Bot v3 — лидерборд с уровнями, достижениями, рефералами.

Запуск:
    pip install -r requirements.txt
    cp .env.example .env   # заполни все переменные
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
    Message, ReplyKeyboardMarkup, KeyboardButton, WebAppInfo,
)
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

import database as db

# ── Конфиг ───────────────────────────────────────────────────────
load_dotenv()

BOT_TOKEN    = os.getenv("BOT_TOKEN", "")
BOT_USERNAME = os.getenv("BOT_USERNAME", "YourBotUsername")
WEBAPP_URL   = os.getenv("WEBAPP_URL", "https://markhaker.github.io/replit-clicker/")

if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не задан в .env!")

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp  = Dispatcher()


# ── Клавиатура ───────────────────────────────────────────────────
def main_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(keyboard=[
        [
            KeyboardButton(text="🎮 Играть", web_app=WebAppInfo(url=WEBAPP_URL)),
            KeyboardButton(text="📊 Мой прогресс"),
        ],
        [
            KeyboardButton(text="👥 Реферальная программа"),
            KeyboardButton(text="💸 Вывести реф. бонусы"),
        ],
        [KeyboardButton(text="🏆 Лидерборд")],
    ], resize_keyboard=True)


# ── Форматирование чисел ─────────────────────────────────────────
def fmt(n: float) -> str:
    n = int(n)
    if n >= 1_000_000_000: return f"{n/1e9:.2f}B"
    if n >= 1_000_000:     return f"{n/1e6:.2f}M"
    if n >= 1_000:         return f"{n/1e3:.2f}K"
    return str(n)


# ── Утилиты ──────────────────────────────────────────────────────
async def ensure_user(uid: int, uname: str, invited_by: int | None = None):
    user = await db.get_user(uid)
    if user is None:
        await db.create_user(uid, uname, invited_by)
    elif uname and user.get("username") != uname:
        await db.update_username(uid, uname)


def need_username(message: Message) -> bool:
    return bool(message.from_user and message.from_user.username)


# ── /start ────────────────────────────────────────────────────────
@dp.message(CommandStart())
async def cmd_start(message: Message):
    user = message.from_user
    if not user.username:
        await message.answer(
            "❗ Для работы бота нужен <b>@username</b>.\n"
            "Установи его: <b>Настройки → Изменить профиль → Имя пользователя</b>, "
            "затем снова /start."
        )
        return

    invited_by: int | None = None
    parts = message.text.split()
    if len(parts) > 1 and parts[1].startswith("ref_"):
        try:
            rid = int(parts[1].split("_")[1])
            if rid != user.id and await db.get_user(rid):
                invited_by = rid
        except (ValueError, IndexError):
            pass

    await ensure_user(user.id, user.username, invited_by)

    ref_note = "\n\n🎁 Вы перешли по реферальной ссылке!" if invited_by else ""
    await message.answer(
        f"👋 Привет, <b>@{user.username}</b>!\n\n"
        f"Это <b>Кликер</b> — нажимай, улучшай, зарабатывай!\n"
        f"42 достижения, система уровней, лидерборд 🏆{ref_note}",
        reply_markup=main_kb(),
    )


# ── Мой прогресс ─────────────────────────────────────────────────
@dp.message(F.text == "📊 Мой прогресс")
async def my_progress(message: Message):
    if not need_username(message):
        await message.answer("❗ Установите @username для синхронизации."); return
    data = await db.get_user(message.from_user.id)
    if not data:
        await message.answer("Вы ещё не начали игру. Нажмите 🎮 Играть!"); return

    lv = data.get("level", 1)
    tc = data.get("total_clicks", 0)

    await message.answer(
        f"📊 <b>Прогресс @{message.from_user.username}</b>\n\n"
        f"🪙 Монеты:       <b>{fmt(data['main_balance'])}</b>\n"
        f"👆 Сила клика:   <b>+{fmt(data['click_power'])}</b>/клик\n"
        f"⚡ Авто-доход:   <b>{fmt(data['auto_income'])}</b>/сек\n"
        f"🖱 Всего кликов: <b>{fmt(tc)}</b>\n"
        f"📈 Уровень:      <b>{lv}</b>\n"
        f"🏅 Достижений:   <b>{data.get('achievements', 0)}</b>\n"
        f"💰 Реф. баланс:  <b>{fmt(data['ref_balance'])}</b>\n"
    )


# ── Реферальная программа ─────────────────────────────────────────
@dp.message(F.text == "👥 Реферальная программа")
async def referral(message: Message):
    if not need_username(message):
        await message.answer("❗ Установите @username."); return
    uid = message.from_user.id
    await ensure_user(uid, message.from_user.username)
    stats = await db.get_referral_stats(uid)
    link  = f"https://t.me/{BOT_USERNAME}?start=ref_{uid}"

    lines = ""
    for u in stats["invited_users"][:5]:
        name   = f"@{u['username']}" if u["username"] else f"id{u['invited_id']}"
        earned = fmt(u["total_earned"])
        lines += f"\n  • {name} — принёс <b>{earned}</b> монет"

    await message.answer(
        f"👥 <b>Реферальная программа</b>\n\n"
        f"За каждый клик приглашённого вы получаете <b>35%</b>!\n\n"
        f"🔗 Ваша ссылка:\n<code>{link}</code>\n\n"
        f"👤 Приглашено: <b>{stats['invited_count']}</b>\n"
        f"💰 Реф. баланс: <b>{fmt(stats['ref_balance'])}</b>"
        f"{lines}\n\n"
        f"💡 Нажмите <b>💸 Вывести реф. бонусы</b> для перевода."
    )


# ── Вывод реф. баланса ────────────────────────────────────────────
@dp.message(F.text == "💸 Вывести реф. бонусы")
async def withdraw_ref(message: Message):
    if not need_username(message):
        await message.answer("❗ Установите @username."); return
    await ensure_user(message.from_user.id, message.from_user.username)
    amount = await db.convert_ref_balance(message.from_user.id)
    if amount <= 0:
        await message.answer("😔 Реф. баланс пуст. Пригласите друзей!"); return
    await message.answer(
        f"✅ <b>{fmt(amount)}</b> монет переведено из реф. баланса в основной!\n\n"
        f"🎮 Заходите в игру и тратьте на улучшения!"
    )


# ── Лидерборд ─────────────────────────────────────────────────────
@dp.message(F.text == "🏆 Лидерборд")
@dp.message(Command("leaderboard"))
async def leaderboard_cmd(message: Message):
    if not need_username(message):
        await message.answer("❗ Установите @username."); return

    await message.answer("⏳ Собираю рейтинг...")

    data = await db.get_leaderboard()
    ok   = await db.push_leaderboard_to_github(data)

    def top_block(title: str, entries: list, suffix: str = "") -> str:
        if not entries:
            return f"\n<b>{title}</b>\n  — нет данных\n"
        medals = ["🥇", "🥈", "🥉"]
        lines  = []
        for i, e in enumerate(entries[:10]):
            m = medals[i] if i < 3 else f"  {i+1}."
            lines.append(f"{m} @{e.get('username','?')} — <b>{fmt(e['value'])}{suffix}</b>")
        return f"\n<b>{title}</b>\n" + "\n".join(lines) + "\n"

    text = (
        "🏆 <b>Лидерборд</b>\n"
        + top_block("💰 Топ по балансу",         data.get("balance", []))
        + top_block("🖱 Топ по кликам",           data.get("clicks",  []))
        + top_block("📈 Топ по уровню",           data.get("levels",  []),  " ур.")
        + top_block("⚡ Топ по авто/сек",         data.get("auto",    []),  "/сек")
        + top_block("🏅 Топ по достижениям",      data.get("achievements",[])," очив")
        + top_block("👥 Топ по рефералам",        data.get("referrals",[]),  " реф")
    )

    if ok:
        text += "\n✅ Рейтинг обновлён на сайте"
    else:
        text += "\n⚠️ Не удалось обновить сайт (проверь GITHUB_TOKEN)"

    await message.answer(text)


# ── Синхронизация WebApp → бот ────────────────────────────────────
@dp.message(F.web_app_data)
async def webapp_data(message: Message):
    """
    Принимает данные из WebApp (sendData) и сохраняет прогресс.
    Поля: balance, clickPower, autoIncome, sessionClicks,
          totalClicks, achievements, level, username.
    """
    try:
        data = json.loads(message.web_app_data.data)
    except (json.JSONDecodeError, AttributeError):
        return

    uid   = message.from_user.id
    uname = message.from_user.username or ""
    await ensure_user(uid, uname)
    await db.sync_progress(
        user_id=uid,
        main_balance=float(data.get("balance", 0)),
        click_power=float(data.get("clickPower", 1)),
        auto_income=float(data.get("autoIncome", 0)),
        clicks_this_session=int(data.get("sessionClicks", 0)),
        total_clicks=int(data.get("totalClicks", 0)),
        achievements=int(data.get("achievements", 0)),
        level=int(data.get("level", 1)),
    )
    logger.info("Sync @%s: balance=%s level=%d achiev=%d",
                uname, fmt(data.get("balance", 0)),
                data.get("level", 1), data.get("achievements", 0))


# ── Запуск ───────────────────────────────────────────────────────
async def main():
    logger.info("Инициализация БД...")
    await db.init_db()
    logger.info("Запуск бота @%s", BOT_USERNAME)
    try:
        await dp.start_polling(bot, allowed_updates=["message", "web_app_data"])
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
