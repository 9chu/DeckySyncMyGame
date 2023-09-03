import os
import time
import json
import base64
import sqlite3
import hashlib
import asyncio
import fnmatch
from typing import Callable, Any, Optional, List, Dict, Tuple, Union

# Compatible code when running without decky
try:
    import decky_plugin
except ImportError:
    import logging

    logging.getLogger().setLevel(logging.DEBUG)
    logging.getLogger().addHandler(logging.StreamHandler())

    class DeckyPluginMock:
        def __init__(self):
            self.logger = logging.getLogger("decky_plugin")
            self.logger.setLevel(logging.DEBUG)

    decky_plugin = DeckyPluginMock()


################################################################################
# Constants
################################################################################

CONFIG_DATABASE_PATH = os.path.join(os.environ["DECKY_PLUGIN_SETTINGS_DIR"], "database.sqlite")
DEFAULT_GAME_LIB_DIR = "~/MyGames"
GAME_INFO_FILENAME = ".gameinfo.json"
GAME_ICON_FILENAME = ".gameicon.png"
GAME_HERO_FILENAME = ".gamehero.png"
GAME_LOGO_FILENAME = ".gamelogo.png"
GAME_GRID_FILENAME = ".gamegrid.png"

################################################################################
# Utils
################################################################################

async def async_run(func: Callable[[], Any]) -> Any:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, func)


async def async_walk_dir(path: str, filter: str) -> List[str]:
    def impl():
        matches = []
        for root, dirnames, filenames in os.walk(path):
            for filename in filenames:
                if fnmatch.fnmatch(filename, filter):
                    matches.append(os.path.join(root, filename))
        return matches
    return await async_run(impl)


async def async_read_json_file(path: str) -> Any:
    def impl():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return await async_run(impl)


async def async_calc_md5(path: str) -> str:
    def impl():
        hash_md5 = hashlib.md5()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    return await async_run(impl)


async def async_read_file_base64(path: str) -> str:
    def impl():
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    return await async_run(impl)

################################################################################
# Main
################################################################################

class DbProxy:
    def __init__(self, path: str):
        self._conn = sqlite3.connect(path, check_same_thread=False)

        self._async_task_future = None  # type: Optional[asyncio.Future]
        self._pending_sql = []  # type: List[Tuple[asyncio.Future, str, Tuple]]

        self._dirty = False

    def _async_task(self):
        while len(self._pending_sql) > 0:
            fut, sql, args = self._pending_sql.pop(0)
            decky_plugin.logger.debug(f"Execute SQL: {sql} {args}")
            try:
                result = self._conn.cursor().execute(sql, args).fetchall()
                fut.set_result(result)
            except Exception as ex:
                fut.set_exception(ex)
            if len(self._pending_sql) == 0:
                time.sleep(0.5)

    def _async_execute_sql(self, sql: str, args = ()) -> asyncio.Future:
        decky_plugin.logger.debug(f"Add SQL to queue: {sql} {args}")

        def start_async_task():
            if self._async_task_future is None:
                loop = asyncio.get_event_loop()
                self._async_task_future = loop.run_in_executor(None, self._async_task)
                self._async_task_future.add_done_callback(lambda _: on_async_task_finished())

        def on_async_task_finished():
            decky_plugin.logger.debug(f"Async task finished")
            self._async_task_future = None
            if len(self._pending_sql) > 0:  # Due to concorrent call, we need to check it again
                start_async_task()

        future = asyncio.Future()
        self._pending_sql.append((future, sql, args))
        start_async_task()

        return future
    
    async def prepare_database(self):
        await self._async_execute_sql("""CREATE TABLE IF NOT EXISTS `Games` (
            `Key` TEXT PRIMARY KEY,
            `SteamAppId` BIGINT NOT NULL,
            `Reserved` TEXT,

            UNIQUE (`SteamAppId`)
        )""")
        await self._async_execute_sql("""CREATE TABLE IF NOT EXISTS `Config` (
            `Name` TEXT PRIMARY KEY,
            `Value` TEXT NOT NULL
        )""")
        self._dirty = True

    async def get_config(self, name: str, default: Optional[str] = None) -> Optional[str]:
        result = await self._async_execute_sql("SELECT `Value` FROM `Config` WHERE `Name` = ?", (name,))
        if len(result) == 0:
            return default
        return result[0][0]
    
    async def set_config(self, name: str, value: str):
        await self._async_execute_sql("INSERT INTO `Config`(`Name`, `Value`) VALUES (?, ?) " +
            "ON CONFLICT(`Name`) DO UPDATE SET `Value` = ?", (name, value, value))
        self._dirty = True
        
    async def count_shortcuts(self):
        result = await self._async_execute_sql("SELECT COUNT(*) FROM `Games`")
        return result[0][0]

    async def get_all_shortcuts(self) -> Dict[str, int]:
        ret = {}
        records = await self._async_execute_sql("SELECT `Key`, `SteamAppId` FROM `Games`")
        for record in records:
            ret[record[0]] = record[1]
        return ret
    
    async def add_shortcut(self, key: str, steam_app_id: int):
        await self._async_execute_sql("INSERT INTO `Games`(`Key`, `SteamAppId`) VALUES (?, ?) " +
            "ON CONFLICT(`Key`) DO UPDATE SET `SteamAppId` = ?", (key, steam_app_id, steam_app_id))
        self._dirty = True

    async def remove_shortcut(self, key: str):
        await self._async_execute_sql("DELETE FROM `Games` WHERE `Key` = ?", (key,))
        self._dirty = True

    def commit(self):
        if self._dirty and self._async_task_future is None:
            self._dirty = False
            decky_plugin.logger.info("Saving changes")
            try:
                self._conn.commit()
            except Exception as ex:
                decky_plugin.logger.exception("Failed to commit database")
    
    async def close(self):
        if self._async_task_future is not None:
            await self._async_task_future
            self._async_task_future = None
        self.commit()
        self._conn.close()


class GameDesc:
    @staticmethod
    async def load_artwork(dir, filename):
        path = os.path.join(dir, filename)
        if os.path.exists(path):
            md5 = await async_calc_md5(path)
        else:
            md5 = ''
        return path, md5

    @staticmethod
    async def from_file(path: str) -> "GameDesc":
        desc_dir = os.path.abspath(os.path.dirname(path))

        data = await async_read_json_file(path)
        if not isinstance(data, dict):
            raise RuntimeError(f"Invalid game info file: {path}")
        if "name" not in data or "executable" not in data:
            raise RuntimeError(f"Invalid game info file: {path}")

        # looking for artworks
        icon_path, icon_md5 = await GameDesc.load_artwork(desc_dir, GAME_ICON_FILENAME)
        hero_path, hero_md5 = await GameDesc.load_artwork(desc_dir, GAME_HERO_FILENAME)
        logo_path, logo_md5 = await GameDesc.load_artwork(desc_dir, GAME_LOGO_FILENAME)
        grid_path, grid_md5 = await GameDesc.load_artwork(desc_dir, GAME_GRID_FILENAME)

        return GameDesc(
            path,
            data["name"],
            data.get("title", data["name"]),
            os.path.abspath(os.path.join(desc_dir, data["executable"])),
            os.path.abspath(os.path.join(desc_dir, data.get("directory", ""))),
            data.get("options", ""),
            data.get("compat", ""),
            data.get("hidden", False),
            icon_md5, icon_path if icon_md5 != '' else '',
            hero_md5, hero_path if hero_md5 != '' else '',
            logo_md5, logo_path if logo_md5 != '' else '',
            grid_md5, grid_path if grid_md5 != '' else '')

    def __init__(self, meta_path, name, title, executable, directory, options, compat, hidden, icon_md5, icon_path,
                 hero_md5, hero_path, logo_md5, logo_path, grid_md5, grid_path):
        self.meta_path = meta_path  # type: str
        self.name = name  # type: str
        self.title = title  # type: str
        self.executable = executable  # type: str
        self.directory = directory  # type: str
        self.options = options  # type: str
        self.compat = compat  # type: str
        self.hidden = hidden  # type: bool
        self.icon_md5 = icon_md5  # type: str
        self.icon_path = icon_path  # type: str
        self.hero_md5 = hero_md5  # type: str
        self.hero_path = hero_path  # type: str
        self.logo_md5 = logo_md5  # type: str
        self.logo_path = logo_path  # type: str
        self.grid_md5 = grid_md5  # type: str
        self.grid_path = grid_path  # type: str

    def make_key(self):
        unique_desc = [self.meta_path, self.name, self.title, self.executable, self.directory, self.options,
                       self.compat, str(self.hidden), self.icon_md5, self.hero_md5, self.logo_md5, self.grid_md5]
        return hashlib.sha256(":".join(unique_desc).encode("utf-8")).hexdigest()
    
    def to_dict(self):
        return {
            "name": self.name,
            "title": self.title,
            "executable": self.executable,
            "directory": self.directory,
            "options": self.options,
            "compat": self.compat,
            "hidden": self.hidden,
            "icon": self.icon_path,
            "hero": self.hero_path,
            "logo": self.logo_path,
            "grid": self.grid_path,
        }


class PluginImpl:
    def __init__(self):
        decky_plugin.logger.info("Initializing")
        self._db = DbProxy(CONFIG_DATABASE_PATH)

        # state
        self._games = {}  # type: dict[str, GameDesc]
        self._scanning = False
        self._shortcut_to_remove = {}  # type: Dict[str, int]
        self._shortcut_to_add = {}  # type: Dict[str, Dict]

        # request queue
        self._request_queue = []  # type: List[Tuple[asyncio.Future, Callable, Tuple]]

    def _push_request(self, func: Callable, args: Tuple) -> asyncio.Future:
        future = asyncio.Future()
        self._request_queue.append((future, func, args))
        return future
    
    async def _sync_all_games(self):
        if self._scanning:
            return
        self._scanning = True

        try:
            config_game_lib_dir = (await self._db.get_config("GameLibDir", "")).strip()
            if len(config_game_lib_dir) == 0:
                config_game_lib_dir = DEFAULT_GAME_LIB_DIR
            game_lib_dir = os.path.abspath(os.path.expanduser(config_game_lib_dir))

            db_games = await self._db.get_all_shortcuts()

            decky_plugin.logger.info("Start scanning games")
            desc = {}
            files = await async_walk_dir(game_lib_dir, GAME_INFO_FILENAME)
            for file in files:
                try:
                    game_desc = await GameDesc.from_file(file)
                    desc[game_desc.make_key()] = game_desc
                except Exception as ex:
                    decky_plugin.logger.exception(f"Failed to load game info file: {file}")
            decky_plugin.logger.info(f"Found {len(desc)} games")

            self._shortcut_to_remove = {}
            no_longer_exists = set(db_games.keys()) - set(desc.keys())
            if len(no_longer_exists) > 0:
                decky_plugin.logger.info(f"Found {len(no_longer_exists)} games that no longer exists")
                for key in no_longer_exists:
                    self._shortcut_to_remove[key] = db_games[key]
            
            self._shortcut_to_add = {}
            newer = set(desc.keys()) - set(db_games.keys())
            if len(newer) > 0:
                decky_plugin.logger.info(f"Found {len(newer)} games that are new")
                for key in newer:
                    self._shortcut_to_add[key] = desc[key].to_dict()

            self._games = desc
        except Exception as ex:
            decky_plugin.logger.exception("Failed to sync games")
        finally:
            self._scanning = False

    async def _notify_shortcut_removed(self, key: str):
        try:
            await self._db.remove_shortcut(key)
        except Exception as ex:
            decky_plugin.logger.exception(f"Failed to remove shortcut: {key}")
        
    async def _notify_shortcut_added(self, key: str, steam_app_id: int):
        try:
            await self._db.add_shortcut(key, steam_app_id)
        except Exception as ex:
            decky_plugin.logger.exception(f"Failed to add shortcut: {key}")

    async def sync_all_games(self):
        await self._push_request(self._sync_all_games, ())

    async def is_scanning(self):
        return self._scanning
    
    async def get_game_count(self):
        ret = len(self._games)
        if ret == 0:
            return await self._db.count_shortcuts()
        return ret

    async def get_all_shortcuts(self):
        return await self._db.get_all_shortcuts()

    async def get_shortcut_to_remove(self):
        return self._shortcut_to_remove
    
    async def get_shortcut_to_add(self):
        return self._shortcut_to_add
    
    async def notify_shortcut_removed(self, key: str):
        await self._push_request(self._notify_shortcut_removed, (key,))

    async def notify_shortcut_added(self, key: str, steam_app_id: int):
        await self._push_request(self._notify_shortcut_added, (key, steam_app_id))

    async def get_config(self, key: str):
        return await self._db.get_config(key)

    async def set_config(self, key: str, value: str):
        await self._db.set_config(key, value)

    async def run(self):
        decky_plugin.logger.info("Preparing database")
        try:
            await self._db.prepare_database()
        except Exception as ex:
            decky_plugin.logger.exception("Failed to initialize database")

        decky_plugin.logger.info("Entering main loop")
        while True:
            if len(self._request_queue) == 0:
                self._db.commit()
                await asyncio.sleep(1)
                continue
            future, func, args = self._request_queue.pop(0)
            try:
                if func is not None:
                    result = await func(*args)
                else:
                    result = None
                future.set_result(result)
            except Exception as ex:
                decky_plugin.logger.exception("Failed to execute request")
                future.set_exception(ex)

    async def unload(self):
        await self._push_request(None, None)
        await self._db.close()
        
    async def migration(self):
        pass


class Plugin:
    instance: PluginImpl

    async def sync_all_games(self):  # export
        return await self.instance.sync_all_games()

    async def is_scanning(self):  # export
        return await self.instance.is_scanning()
    
    async def get_game_count(self):  # export
        return await self.instance.get_game_count()
    
    async def get_all_shortcuts(self):  # export
        return await self.instance.get_all_shortcuts()

    async def get_shortcut_to_remove(self):  # export
        return await self.instance.get_shortcut_to_remove()
    
    async def get_shortcut_to_add(self):  # export
        return await self.instance.get_shortcut_to_add()
    
    async def notify_shortcut_removed(self, key: str):  # export
        return await self.instance.notify_shortcut_removed(key)

    async def notify_shortcut_added(self, key: str, steam_app_id: int):  # export
        return await self.instance.notify_shortcut_added(key, steam_app_id)

    async def get_config(self, key: str):  # export
        return await self.instance.get_config(key)

    async def set_config(self, key: str, value: str):  # export
        return await self.instance.set_config(key, value)
    
    async def read_file_base64(self, path: str):  # export
        return await async_read_file_base64(path)

    async def _main(self):
        Plugin.instance = self.instance = PluginImpl()
        await self.instance.run()

    async def _unload(self):
        await Plugin.instance.unload()
        
    async def _migration(self):
        pass


async def _dev_main():
    decky_plugin.logger.info("Running in dev mode")

    plugin = Plugin()

    f = asyncio.ensure_future(plugin.sync_all_games())
    f.add_done_callback(lambda _: decky_plugin.logger.info("Done"))

    await plugin._main()


if __name__ == "__main__":
    import asyncio
    asyncio.run(_dev_main())
