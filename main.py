import os
import time
import json
import base64
import sqlite3
import hashlib
import asyncio
import fnmatch
import concurrent.futures
from pathlib import Path
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


# <editor-fold desc="Constants">

CONFIG_DATABASE_PATH = os.path.join(os.environ["DECKY_PLUGIN_SETTINGS_DIR"], "database.sqlite")
DEFAULT_GAME_LIB_DIR = "~/MyGames"
GAME_INFO_FILENAME = ".gameinfo.json"

ARTWORK_TYPE_ICON = -1  # special traits for icon, not the steam definition
ARTWORK_TYPE_GRID = 0
ARTWORK_TYPE_HERO = 1
ARTWORK_TYPE_LOGO = 2

ARTWORK_FILENAME = {
    ARTWORK_TYPE_ICON: ".gameicon.png",
    ARTWORK_TYPE_GRID: ".gamegrid.png",
    ARTWORK_TYPE_HERO: ".gamehero.png",
    ARTWORK_TYPE_LOGO: ".gamelogo.png",
}

# </editor-fold>

# <editor-fold desc="Async ops">

Executor = concurrent.futures._base.Executor


async def _run_in_executor(executor: Optional[Executor], func: Callable[..., Any], *args) -> Any:
    if not executor:
        return func(*args)
    return await asyncio.get_event_loop().run_in_executor(executor, func, *args)


async def async_walk_dir(executor: Optional[Executor], path: str, filter: str) -> List[str]:
    """
    Recursively walk a directory asynchronously
    :param executor: Executor to run the task
    :param path: Path to the directory
    :param filter: Filter to match the file name
    """
    def filter_dir(path: Path):
        ret = []
        recursive = []
        for file in path.iterdir():
            if fnmatch.fnmatch(file.name, filter):
                ret.append(str(file.absolute()))
            if file.is_dir():
                recursive.append(file)
        return ret, recursive

    async def async_filter_dir(path: Path):
        ret, recursive = await _run_in_executor(executor, filter_dir, path)
        if executor is None:
            rets = []
            for file in recursive:
                rets.append(await async_filter_dir(file))
        else:
            tasks = []
            for file in recursive:
                tasks.append(asyncio.create_task(async_filter_dir(file)))
            rets = await asyncio.gather(*tasks)
        for r in rets:
            ret.extend(r)
        return ret

    return await async_filter_dir(Path(path))


async def async_read_json_file(executor: Optional[Executor], path: str) -> Any:
    """
    Read a JSON file asynchronously
    :param executor: Executor to run the task
    :param path: Path to the file
    """
    def impl():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return await _run_in_executor(executor, impl)


async def async_calc_md5(executor: Optional[Executor], path: str) -> str:
    """
    Calculate MD5 of a file asynchronously
    :param executor: Executor to run the task
    :param path: Path to the file
    """
    def impl():
        hash_md5 = hashlib.md5()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    return await _run_in_executor(executor, impl)


async def async_read_file(executor: Optional[Executor], path: str, offset: int, size: int) -> Optional[bytes]:
    """
    Read a file asynchronously
    :param executor: Executor to run the task
    :param path: Path to the file
    :param offset: Offset to read
    :param size: Size to read
    """
    def impl():
        with open(path, "rb") as f:
            f.seek(offset, os.SEEK_SET)
            return f.read(size)
    return await _run_in_executor(executor, impl)

# </editor-fold>

# <editor-fold desc="DB Proxy">

class DbProxy:
    """
    SQLite database operations
    """
    def __init__(self, path: str):
        self._conn = sqlite3.connect(path)
        self._dirty = False

    def _execute_sql(self, sql: str, args=()) -> list[Any]:
        decky_plugin.logger.debug(f"Execute SQL: {sql} {args}")
        return self._conn.cursor().execute(sql, args).fetchall()

    def prepare_database(self):
        """
        Prepare the database, setup tables if not exists
        """
        self._execute_sql("""CREATE TABLE IF NOT EXISTS `Games` (
            `Key` TEXT PRIMARY KEY,
            `SteamAppId` BIGINT NOT NULL,
            `Reserved` TEXT,

            UNIQUE (`SteamAppId`)
        )""")
        self._execute_sql("""CREATE TABLE IF NOT EXISTS `Config` (
            `Name` TEXT PRIMARY KEY,
            `Value` TEXT NOT NULL
        )""")
        self._dirty = True

    def get_config(self, name: str, default: Optional[str] = None) -> Optional[str]:
        """
        Get config value from database
        """
        result = self._execute_sql("SELECT `Value` FROM `Config` WHERE `Name` = ?", (name,))
        if len(result) == 0:
            return default
        return result[0][0]

    def set_config(self, name: str, value: str):
        """
        Set config value to database
        """
        self._execute_sql("INSERT INTO `Config`(`Name`, `Value`) VALUES (?, ?) "
                          "ON CONFLICT(`Name`) DO UPDATE SET `Value` = ?", (name, value, value))
        self._dirty = True

    def count_managed_games(self):
        """
        Count the number of games in database
        """
        result = self._execute_sql("SELECT COUNT(*) FROM `Games`")
        return int(result[0][0])

    def get_managed_games(self, offset: Optional[int]=None, limit: Optional[int]=None) -> Dict[str, int]:
        """
        Retrieve games from database
        """
        ret = {}
        if limit is None:
            records = self._execute_sql("SELECT `Key`, `SteamAppId` FROM `Games`")
        else:
            if offset is not None:
                records = self._execute_sql(f"SELECT `Key`, `SteamAppId` FROM `Games` LIMIT {limit} OFFSET {offset}")
            else:
                records = self._execute_sql(f"SELECT `Key`, `SteamAppId` FROM `Games` LIMIT {limit}")
        for record in records:
            ret[record[0]] = record[1]
        return ret

    def add_managed_game(self, key: str, steam_app_id: int):
        """
        Add a game definition into database
        """
        self._execute_sql("INSERT INTO `Games`(`Key`, `SteamAppId`) VALUES (?, ?) "
                          "ON CONFLICT(`Key`) DO UPDATE SET `SteamAppId` = ?", (key, steam_app_id, steam_app_id))
        self._dirty = True

    def remove_managed_game(self, key: str):
        """
        Remove a game definition from database
        """
        self._execute_sql("DELETE FROM `Games` WHERE `Key` = ?", (key,))
        self._dirty = True

    def commit(self):
        if self._dirty:
            self._dirty = False
            decky_plugin.logger.info("Saving changes")
            try:
                self._conn.commit()
            except Exception:
                decky_plugin.logger.exception("Failed to commit database")

    def close(self):
        self.commit()
        self._conn.close()

# </editor-fold>

# <editor-fold desc="Game Definitions">

class GameArtworkDesc:
    """
    Artwork definition
    """
    @staticmethod
    async def from_file(executor: Optional[Executor], artwork_type: int, path: str) -> Optional["GameArtworkDesc"]:
        """
        Create an artwork definition from a file, calculating the MD5
        :param executor: Executor to run the task
        :param artwork_type: Artwork type
        :param path: Path to the file
        """
        if not os.path.exists(path):
            return None
        md5 = await async_calc_md5(executor, path)
        return GameArtworkDesc(artwork_type, path, md5)

    def __init__(self, artwork_type: int, path: str, md5: str):
        self.artwork_type = artwork_type
        self.path = path
        self.md5 = md5

    def to_dict(self):
        return {
            "type": self.artwork_type,
            "path": self.path,
            "md5": self.md5,
        }


class GameDesc:
    """
    Game definition
    """
    @staticmethod
    async def from_file(executor: Optional[Executor], path: str) -> "GameDesc":
        """
        Load a game definition from the json file
        :param executor: Executor to run the task
        :param path: Path to the json file
        """
        desc_dir = os.path.abspath(os.path.dirname(path))

        data = await async_read_json_file(executor, path)
        if not isinstance(data, dict):
            raise RuntimeError(f"Invalid game info file: {path}")
        if "name" not in data or "executable" not in data:
            raise RuntimeError(f"Invalid game info file: {path}")

        # looking for artworks
        artworks = {}
        for artwork_type in ARTWORK_FILENAME.keys():
            artwork_path = os.path.join(desc_dir, ARTWORK_FILENAME[artwork_type])
            artwork = await GameArtworkDesc.from_file(executor, artwork_type, artwork_path)
            if artwork is not None:
                artworks[artwork_type] = artwork

        return GameDesc(
            path,
            data["name"],
            data.get("title", data["name"]),
            os.path.abspath(os.path.join(desc_dir, data["executable"])),
            os.path.abspath(os.path.join(desc_dir, data.get("directory", ""))),
            data.get("options", ""),
            data.get("compat", ""),
            data.get("hidden", False),
            artworks)

    def __init__(self, meta_path: str, name: str, title: str, executable: str, directory: str, options: str,
                 compat: str, hidden: bool, artworks: Dict[int, GameArtworkDesc]):
        self.meta_path = meta_path
        self.name = name
        self.title = title
        self.executable = executable
        self.directory = directory
        self.options = options
        self.compat = compat
        self.hidden = hidden
        self.artworks = artworks

    def make_key(self) -> str:
        """
        Generate a unique key for this game description
        """
        unique_desc = [self.meta_path, self.name, self.title, self.executable, self.directory, self.options,
                       self.compat, str(self.hidden)]
        for artwork_type in sorted(self.artworks.keys()):
            unique_desc.append(self.artworks[artwork_type].md5)
        return hashlib.sha256(":".join(unique_desc).encode("utf-8")).hexdigest()

    def to_dict(self):
        artworks = {}
        for k in self.artworks:
            v = self.artworks[k].to_dict()
            artworks[k] = v
        return {
            "name": self.name,
            "title": self.title,
            "executable": self.executable,
            "directory": self.directory,
            "options": self.options,
            "compat": self.compat,
            "hidden": self.hidden,
            "artworks": artworks,
        }

# </editor-fold>

# <editor-fold desc="Plugin implementation">

class PluginState:
    """
    Since Decky not creating an instance, using this class to store the state
    """
    def __init__(self):
        decky_plugin.logger.info("Initializing")

        # Load db
        self.db = DbProxy(CONFIG_DATABASE_PATH)

        # state
        self.running = True
        self.scanning = False
        self.games = {}  # type: Dict[str, GameDesc]

        decky_plugin.logger.info("Initializing finished")

    def close(self):
        """
        Shutdown
        """
        self.running = False
        self.db.close()


class Plugin:
    state: PluginState
    watchdog_task: asyncio.Task

    @staticmethod
    async def watchdog():
        while Plugin.state.running:
            await asyncio.sleep(1)
            try:
                Plugin.state.db.commit()
            except Exception as e:
                decky_plugin.logger.exception("Unhandled exception in watchdog")

    async def _main(self):
        Plugin.state = PluginState()
        Plugin.watchdog_task = asyncio.get_event_loop().create_task(Plugin.watchdog())

    async def _unload(self):
        Plugin.state.close()
        #Plugin.watchdog_task.cancel()

    async def _migration(self):
        # Nothing to do
        pass
    
    # <editor-fold desc="IPC Commands">

    async def get_config(self, key: str):
        """
        Get config value by key
        :param key: config key
        :return: config value
        """
        return Plugin.state.db.get_config(key)

    async def set_config(self, key: str, value: str) -> None:
        """
        Set config value by key
        :param key: config key
        :param value: config value
        """
        Plugin.state.db.set_config(key, value)

    async def is_scanning(self) -> bool:
        """
        Is scanning in progress
        """
        return Plugin.state.scanning

    async def get_managed_game_count(self) -> int:
        """
        Count of games been recorded in database
        """
        count = Plugin.state.db.count_managed_games()
        decky_plugin.logger.info(f"Managed game count: {count}")
        return count

    async def refresh_games(self) -> bool:
        """
        Refresh local games
        """
        try:
            # Waiting until current task finished
            if Plugin.state.scanning:
                while Plugin.state.scanning:
                    await asyncio.sleep(1)
                return

            Plugin.state.scanning = True
            decky_plugin.logger.info("Start scanning games")

            # Make local game library path
            config_game_lib_dir = Plugin.state.db.get_config("GameLibDir", "").strip()
            if len(config_game_lib_dir) == 0:
                config_game_lib_dir = DEFAULT_GAME_LIB_DIR
            game_lib_dir = os.path.abspath(os.path.expanduser(config_game_lib_dir))

            # Scanning local games
            # with concurrent.futures.ThreadPoolExecutor() as executor:
            #     scanned_games = {}
            #     files = await async_walk_dir(executor, game_lib_dir, GAME_INFO_FILENAME)
            #     for file in files:
            #         try:
            #             game_desc = await GameDesc.from_file(executor, file)
            #             scanned_games[game_desc.make_key()] = game_desc
            #         except Exception as ex:
            #             decky_plugin.logger.exception(f"Failed to load game desc: {file}")
            scanned_games = {}
            files = await async_walk_dir(None, game_lib_dir, GAME_INFO_FILENAME)
            for file in files:
                try:
                    game_desc = await GameDesc.from_file(None, file)
                    scanned_games[game_desc.make_key()] = game_desc
                except Exception as ex:
                    decky_plugin.logger.exception(f"Failed to load game desc: {file}")
            decky_plugin.logger.info(f"Found {len(scanned_games)} games")

            Plugin.state.games = scanned_games
        except Exception:
            decky_plugin.logger.exception("Failed to refresh games")
            return False
        finally:
            Plugin.state.scanning = False
        return True

    async def get_managed_games(self, page: int) -> Dict[str, int]:
        """
        Retrieve games from database
        Result is split into pages, returns 50 records per call.
        Returns mapping of key of managed games and its steam app id.
        :param page: page index from 0 to ceil(n/50)
        """
        return Plugin.state.db.get_managed_games(page * 50, 50)

    async def get_unmanaged_games(self, page: int) -> Dict[str, dict]:
        """
        Retrieve games that not in database
        Result is split into pages, returns 20 records per call.
        :param page: page index from 0 to ceil(n/20)
        """
        all_keys = set(Plugin.state.games.keys())
        managed_keys = set(Plugin.state.db.get_managed_games().keys())
        intersection = all_keys - managed_keys

        ret = {}
        index = 0
        offset = page * 20
        limit = 20
        for i in intersection:
            if index < offset:
                pass
            elif offset <= index < offset + limit:
                ret[i] = Plugin.state.games[i].to_dict()
            else:
                break
            index += 1
        return ret

    async def get_removed_games(self, page: int) -> Dict[str, int]:
        """
        Retrieve games that are already removed in local filesystem.
        Result is split into pages, returns 50 records per call.
        :param page: page index from 0 to ceil(n/50)
        """
        all_keys = set(Plugin.state.games.keys())
        managed_games = Plugin.state.db.get_managed_games()
        managed_keys = set(managed_games.keys())
        intersection = managed_keys - all_keys

        ret = {}
        index = 0
        offset = page * 50
        limit = 50
        for i in intersection:
            if index < offset:
                pass
            elif offset <= index < offset + limit:
                ret[i] = managed_games[i]
            else:
                break
            index += 1
        return ret

    async def add_managed_game(self, key: str, steam_app_id: int):
        """
        Append record into database
        :param key: key of game
        :param steam_app_id: id generated by steamclient
        """
        Plugin.state.db.add_managed_game(key, steam_app_id)

    async def remove_managed_game(self, key: str):
        """
        Remove record from database
        :param key: key of game
        """
        Plugin.state.db.remove_managed_game(key)

    async def read_file(self, path: str, offset: int, size: int) -> Optional[str]:
        """
        Read a file
        :param path: Path to the file
        :param offset: Offset to read
        :param size: Size to read
        """
        try:
            # with concurrent.futures.ThreadPoolExecutor() as executor:
            #     chunk = await async_read_file(executor, path, offset, size)
            #     return base64.b64encode(chunk).decode("utf-8")
            chunk = await async_read_file(None, path, offset, size)
            return base64.b64encode(chunk).decode("utf-8")
        except Exception:
            decky_plugin.logger.exception(f"Failed to read file: {path}")
            return None

    # </editor-fold>

# </editor-fold>
