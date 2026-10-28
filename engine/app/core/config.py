from types import SimpleNamespace
def get_settings():
    return SimpleNamespace(duckdb_threads=1, duckdb_memory_limit="256MB")
