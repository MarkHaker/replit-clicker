"""
Модуль для работы с SQLite базой данных.
Хранит данные пользователей: балансы, прогресс, рефералы.

В будущем: замените SQLite на PostgreSQL через asyncpg и
используйте FastAPI как REST-бэкенд для защиты от накруток.
"""

import aiosqlite
import time
import asyncio
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "game_data.db")

# SQL для создания таблиц
CREATE_USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    user_id       INTEGER PRIMARY KEY,
    username      TEXT,
    main_balance  REAL    DEFAULT 0,
    click_power   INTEGER DEFAULT 1,
    auto_income   REAL    DEFAULT 0,
    ref_balance   REAL    DEFAULT 0,
    invited_by    INTEGER DEFAULT NULL,
    last_save     INTEGER DEFAULT 0,
    created_at    INTEGER DEFAULT 0
);
"""

CREATE_REFERRALS_TABLE = """
CREATE TABLE IF NOT EXISTS referrals (
    referrer_id   INTEGER,
    invited_id    INTEGER PRIMARY KEY,
    total_earned  REAL DEFAULT 0
);
"""


async def init_db():
    """Инициализация базы данных при старте бота."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_USERS_TABLE)
        await db.execute(CREATE_REFERRALS_TABLE)
        await db.commit()


async def get_user(user_id: int) -> dict | None:
    """Получить данные пользователя по ID. Возвращает None если не найден."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE user_id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def create_user(user_id: int, username: str, invited_by: int | None = None):
    """Создать нового пользователя. Если уже существует — ничего не делает."""
    now = int(time.time())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR IGNORE INTO users
                (user_id, username, main_balance, click_power, auto_income,
                 ref_balance, invited_by, last_save, created_at)
            VALUES (?, ?, 0, 1, 0, 0, ?, ?, ?)
            """,
            (user_id, username, invited_by, now, now),
        )
        # Записываем реферальную связь
        if invited_by is not None:
            await db.execute(
                """
                INSERT OR IGNORE INTO referrals (referrer_id, invited_id, total_earned)
                VALUES (?, ?, 0)
                """,
                (invited_by, user_id),
            )
        await db.commit()


async def update_username(user_id: int, username: str):
    """Обновить имя пользователя."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET username = ? WHERE user_id = ?",
            (username, user_id),
        )
        await db.commit()


async def sync_progress(
    user_id: int,
    main_balance: float,
    click_power: int,
    auto_income: float,
    clicks_this_session: int,
):
    """
    Синхронизация прогресса из WebApp.
    Начисляет 35% от кликов сессии пригласителю.

    В будущем: добавить валидацию на сервере — проверять
    что clicks_this_session не превышает физически возможное
    (время_сессии × макс_кликов_в_секунду) для защиты от накруток.
    """
    now = int(time.time())
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Обновляем данные пользователя
        await db.execute(
            """
            UPDATE users
            SET main_balance = ?, click_power = ?, auto_income = ?, last_save = ?
            WHERE user_id = ?
            """,
            (main_balance, click_power, auto_income, now, user_id),
        )

        # Начисляем 35% от кликов пригласителю
        if clicks_this_session > 0:
            async with db.execute(
                "SELECT invited_by FROM users WHERE user_id = ?", (user_id,)
            ) as cursor:
                row = await cursor.fetchone()
                if row and row["invited_by"]:
                    referrer_id = row["invited_by"]
                    ref_bonus = clicks_this_session * 0.35

                    await db.execute(
                        "UPDATE users SET ref_balance = ref_balance + ? WHERE user_id = ?",
                        (ref_bonus, referrer_id),
                    )
                    await db.execute(
                        "UPDATE referrals SET total_earned = total_earned + ? WHERE referrer_id = ? AND invited_id = ?",
                        (ref_bonus, referrer_id, user_id),
                    )

        await db.commit()


async def convert_ref_balance(user_id: int) -> float:
    """
    Конвертирует реферальный баланс в основной (1:1).
    Возвращает сумму которая была переведена.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT ref_balance FROM users WHERE user_id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if not row or row["ref_balance"] <= 0:
                return 0.0

        amount = row["ref_balance"]
        await db.execute(
            """
            UPDATE users
            SET main_balance = main_balance + ref_balance,
                ref_balance = 0
            WHERE user_id = ?
            """,
            (user_id,),
        )
        await db.commit()
        return amount


async def get_referral_stats(user_id: int) -> dict:
    """Статистика реферальной программы пользователя."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Список приглашённых
        async with db.execute(
            """
            SELECT r.invited_id, u.username, r.total_earned
            FROM referrals r
            LEFT JOIN users u ON u.user_id = r.invited_id
            WHERE r.referrer_id = ?
            ORDER BY r.total_earned DESC
            LIMIT 10
            """,
            (user_id,),
        ) as cursor:
            invited = [dict(row) async for row in cursor]

        # Реферальный баланс
        async with db.execute(
            "SELECT ref_balance FROM users WHERE user_id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            ref_balance = row["ref_balance"] if row else 0

    return {
        "invited_count": len(invited),
        "invited_users": invited,
        "ref_balance": ref_balance,
    }
