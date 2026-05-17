"""
База данных для Telegram Clicker Bot.
SQLite через aiosqlite. Таблицы: users, referrals.
"""

import aiosqlite
import time
import os
import json
import aiohttp
import base64

DB_PATH = os.path.join(os.path.dirname(__file__), "game_data.db")

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO  = os.getenv("GITHUB_REPO",  "MarkHaker/replit-clicker")

CREATE_USERS = """
CREATE TABLE IF NOT EXISTS users (
    user_id       INTEGER PRIMARY KEY,
    username      TEXT,
    main_balance  REAL    DEFAULT 0,
    click_power   REAL    DEFAULT 1,
    auto_income   REAL    DEFAULT 0,
    ref_balance   REAL    DEFAULT 0,
    achievements  INTEGER DEFAULT 0,
    total_clicks  INTEGER DEFAULT 0,
    level         INTEGER DEFAULT 1,
    invited_by    INTEGER DEFAULT NULL,
    last_save     INTEGER DEFAULT 0,
    created_at    INTEGER DEFAULT 0
);
"""

CREATE_REFERRALS = """
CREATE TABLE IF NOT EXISTS referrals (
    referrer_id   INTEGER,
    invited_id    INTEGER PRIMARY KEY,
    total_earned  REAL DEFAULT 0
);
"""


def calc_level(total_clicks: int) -> int:
    """Уровень 1 = 0–499 кликов, Уровень 2 = 500–999, и т.д. (каждые 500)."""
    return total_clicks // 500 + 1


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_USERS)
        await db.execute(CREATE_REFERRALS)
        # Миграции — добавляем столбцы если их нет
        for col, default in [
            ("achievements", "INTEGER DEFAULT 0"),
            ("total_clicks", "INTEGER DEFAULT 0"),
            ("level",        "INTEGER DEFAULT 1"),
        ]:
            try:
                await db.execute(f"ALTER TABLE users ADD COLUMN {col} {default}")
            except Exception:
                pass
        await db.commit()


async def get_user(user_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE user_id=?", (user_id,)) as c:
            row = await c.fetchone()
            return dict(row) if row else None


async def create_user(user_id: int, username: str, invited_by: int | None = None):
    now = int(time.time())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO users (user_id,username,invited_by,last_save,created_at) VALUES(?,?,?,?,?)",
            (user_id, username, invited_by, now, now),
        )
        if invited_by:
            await db.execute(
                "INSERT OR IGNORE INTO referrals(referrer_id,invited_id) VALUES(?,?)",
                (invited_by, user_id),
            )
        await db.commit()


async def update_username(user_id: int, username: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE users SET username=? WHERE user_id=?", (username, user_id))
        await db.commit()


async def sync_progress(user_id: int, main_balance: float, click_power: float,
                        auto_income: float, clicks_this_session: int,
                        total_clicks: int = 0, achievements: int = 0, level: int = 1):
    """Синхронизирует прогресс игрока из WebApp. Начисляет 35% рефералу."""
    now = int(time.time())
    computed_level = calc_level(total_clicks) if total_clicks > 0 else level
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # total_clicks никогда не уменьшается — берём MAX(текущее, новое)
        await db.execute(
            """UPDATE users SET
               main_balance=?, click_power=?, auto_income=?,
               achievements=?, total_clicks=MAX(total_clicks, ?), level=?, last_save=?
               WHERE user_id=?""",
            (main_balance, click_power, auto_income,
             achievements, total_clicks, computed_level, now, user_id),
        )
        if clicks_this_session > 0:
            async with db.execute("SELECT invited_by FROM users WHERE user_id=?", (user_id,)) as c:
                row = await c.fetchone()
            if row and row["invited_by"]:
                ref_id = row["invited_by"]
                bonus  = clicks_this_session * 0.35
                await db.execute(
                    "UPDATE users SET ref_balance=ref_balance+? WHERE user_id=?",
                    (bonus, ref_id),
                )
                await db.execute(
                    "UPDATE referrals SET total_earned=total_earned+? WHERE referrer_id=? AND invited_id=?",
                    (bonus, ref_id, user_id),
                )
        await db.commit()


async def convert_ref_balance(user_id: int) -> float:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT ref_balance FROM users WHERE user_id=?", (user_id,)) as c:
            row = await c.fetchone()
        if not row or row["ref_balance"] <= 0:
            return 0.0
        amount = row["ref_balance"]
        await db.execute(
            "UPDATE users SET main_balance=main_balance+ref_balance, ref_balance=0 WHERE user_id=?",
            (user_id,),
        )
        await db.commit()
        return amount


async def get_referral_stats(user_id: int) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT r.invited_id,u.username,r.total_earned FROM referrals r "
            "LEFT JOIN users u ON u.user_id=r.invited_id WHERE r.referrer_id=? "
            "ORDER BY r.total_earned DESC LIMIT 10",
            (user_id,),
        ) as c:
            invited = [dict(r) async for r in c]
        async with db.execute("SELECT ref_balance FROM users WHERE user_id=?", (user_id,)) as c:
            row = await c.fetchone()
        return {
            "invited_count": len(invited),
            "invited_users": invited,
            "ref_balance": row["ref_balance"] if row else 0,
        }


async def get_leaderboard() -> dict:
    """Возвращает топ-10 по 6 категориям для записи в leaderboard.json."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        async def top(order_col: str, val_col: str):
            async with db.execute(
                f"SELECT username, {val_col} as value FROM users "
                f"WHERE username IS NOT NULL ORDER BY {order_col} DESC LIMIT 10"
            ) as c:
                return [{"username": r["username"], "value": round(r["value"], 2)} async for r in c]

        # Топ по рефералам (количество приглашённых)
        async with db.execute(
            "SELECT u.username, COUNT(r.invited_id) as value "
            "FROM users u LEFT JOIN referrals r ON r.referrer_id=u.user_id "
            "WHERE u.username IS NOT NULL GROUP BY u.user_id ORDER BY value DESC LIMIT 10"
        ) as c:
            ref_top = [{"username": r["username"], "value": r["value"]} async for r in c]

        return {
            "updated":      int(time.time()),
            "balance":      await top("main_balance", "main_balance"),
            "clicks":       await top("total_clicks",  "total_clicks"),
            "auto":         await top("auto_income",   "auto_income"),
            "achievements": await top("achievements",  "achievements"),
            "levels":       await top("level",         "level"),
            "referrals":    ref_top,
        }


async def push_leaderboard_to_github(data: dict) -> bool:
    """
    Публикует leaderboard.json в репозиторий на GitHub через Contents API.
    Вызывается из бота при команде /leaderboard.
    """
    if not GITHUB_TOKEN:
        return False

    content_b64 = base64.b64encode(
        json.dumps(data, ensure_ascii=False, indent=2).encode()
    ).decode()

    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/leaderboard.json"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept":        "application/vnd.github.v3+json",
    }

    async with aiohttp.ClientSession() as session:
        sha = None
        async with session.get(url, headers=headers) as r:
            if r.status == 200:
                sha = (await r.json()).get("sha")

        body: dict = {"message": "update leaderboard", "content": content_b64}
        if sha:
            body["sha"] = sha

        async with session.put(url, headers=headers, json=body) as r:
            return r.status in (200, 201)
