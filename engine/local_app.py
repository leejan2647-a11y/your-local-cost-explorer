"""Loopback-only, file-upload application. No hosted application dependencies."""
import argparse
import hashlib
import json
import multiprocessing
import os
import re
import secrets
import shutil
import socket
import sqlite3
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from uuid import uuid4

MAX_UPLOAD = 2_000_000_000
RESERVE = 8 * 1024**3
WEB = Path(__file__).resolve().parents[1] / 'web'


def deny_outbound():
    def refused(*args, **kwargs):
        raise OSError('Outbound connections are disabled in the local edition')
    socket.socket.connect = refused
    socket.socket.connect_ex = refused
    socket.create_connection = refused
    socket.getaddrinfo = refused


def database(root):
    con = sqlite3.connect(root / 'local.sqlite3', timeout=5)
    con.execute('PRAGMA foreign_keys=ON')
    con.execute('PRAGMA journal_mode=WAL')
    return con


def data_lease(root):
    """One app process owns a private data directory for its entire lifetime."""
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.is_symlink() or (root / '.app-lease').is_symlink():
        raise OSError('Unsafe data directory')
    handle = (root / '.app-lease').open('a+b')
    if handle.tell() == 0:
        handle.write(b'0'); handle.flush()
    handle.seek(0)
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        raise OSError('Another local app already owns this data directory') from None
    return handle


def initialise(root):
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.is_symlink():
        raise ValueError('Data directory cannot be a symbolic link')
    if os.name != 'nt':
        root.chmod(0o700)
    (root / 'uploads').mkdir(exist_ok=True, mode=0o700)
    with database(root) as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, status TEXT NOT NULL, result TEXT, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS mappings (account TEXT PRIMARY KEY, team TEXT NOT NULL);
        ''')
        con.execute("UPDATE runs SET status='interrupted' WHERE status='running'")
    for part in (root / 'uploads').glob('*.part'):
        part.unlink()


def job(root, run_id, request, files, mappings):
    deny_outbound()
    try:
        from local_analysis import analyse
        result = json.dumps(analyse(request, files, mappings), ensure_ascii=True, allow_nan=False)
        status = 'completed'
    except BaseException as error:
        # Engine diagnostic text may contain a local storage path. Keep failure private.
        result = json.dumps({'error': 'Analysis could not complete. Check CUR format, dates, input columns and available disk/memory.', 'type': type(error).__name__})
        status = 'failed'
    with database(root) as con:
        con.execute("UPDATE runs SET status=?, result=? WHERE id=? AND status='running'", (status, result, run_id))


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, port, root):
        super().__init__(('127.0.0.1', port), Handler)
        self.root = root
        self.token = secrets.token_urlsafe(32)
        self.operation_lock = threading.Lock()
        self.upload_lock = threading.Lock()
        self.connections = threading.BoundedSemaphore(16)
        self.active = None

    def process_request(self, request, address):
        if not self.connections.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.connections.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.connections.release()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, *args):
        pass  # URLs and local billing identifiers never enter HTTP logs.

    def respond(self, status, value, content_type='application/json'):
        body = json.dumps(value, ensure_ascii=True, allow_nan=False).encode() if content_type == 'application/json' else value
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)

    def guard(self, authenticated=True):
        port = self.server.server_port
        host = self.headers.get('Host')
        origin = self.headers.get('Origin')
        expected = f'127.0.0.1:{port}'
        if host != expected or (origin and origin != f'http://{expected}'):
            self.respond(403, {'error': 'Only the local application origin is allowed'})
            return False
        supplied = self.headers.get('X-Local-Token', '')
        if authenticated and not secrets.compare_digest(supplied, self.server.token):
            self.respond(403, {'error': 'Open the launch URL containing your local access token'})
            return False
        return True

    def body(self, limit=65536):
        if self.headers.get('Transfer-Encoding'):
            raise ValueError('Chunked transfer is unsupported')
        values = self.headers.get_all('Content-Length', [])
        if len(values) != 1 or not re.fullmatch(r'[0-9]+', values[0]):
            raise ValueError('A single exact content length is required')
        size = int(values[0])
        if size > limit:
            raise ValueError('Request exceeds the size limit')
        return size

    def read_json(self):
        size = self.body()
        raw = self.rfile.read(size)
        if len(raw) != size:
            raise ValueError('Incomplete request')
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError('Expected an object')
        return value

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path in ('/', '/app.js', '/style.css'):
            if not self.guard(False):
                return
            name, kind = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'application/javascript'), '/style.css': ('style.css', 'text/css')}[parsed.path]
            self.respond(200, (WEB / name).read_bytes(), kind)
            return
        if not self.guard():
            return
        with database(self.server.root) as con:
            if parsed.path == '/api/state':
                active = self.server.active
                if active and not active[1].is_alive():
                    con.execute("UPDATE runs SET status='interrupted' WHERE id=? AND status='running'", (active[0],))
                uploads = [{key: item[key] for key in ('id', 'name', 'bytes', 'role', 'sha256')} for (raw,) in con.execute('SELECT data FROM uploads') for item in [json.loads(raw)]]
                runs = [{'id': row[0], 'status': row[1], 'created': row[2]} for row in con.execute('SELECT id,status,created FROM runs ORDER BY created DESC LIMIT 100')]
                self.respond(200, {'files': uploads, 'runs': runs, 'mappings': dict(con.execute('SELECT account,team FROM mappings'))})
            elif parsed.path.startswith('/api/runs/'):
                run_id = parsed.path.removeprefix('/api/runs/')
                row = con.execute('SELECT status,result FROM runs WHERE id=?', (run_id,)).fetchone()
                if not row:
                    self.respond(404, {'error': 'Run unavailable'})
                else:
                    self.respond(200, {'status': row[0], 'result': json.loads(row[1]) if row[1] else None})
            else:
                self.respond(404, {'error': 'Unknown route'})

    def do_PUT(self):
        if not self.guard():
            return
        parsed = urlsplit(self.path)
        if parsed.path != '/api/upload':
            self.respond(404, {'error': 'Unknown route'})
            return
        if not self.server.upload_lock.acquire(blocking=False):
            self.respond(409, {'error': 'Another upload is in progress'})
            return
        path = None
        try:
            size = self.body(MAX_UPLOAD)
            query = parse_qs(parsed.query)
            name = query.get('name', [''])[0]
            role = query.get('role', ['primary'])[0]
            if role not in ('primary', 'comparison') or not name or len(name) > 512 or '/' in name or '\\' in name or not name.lower().endswith(('.csv', '.csv.gz', '.parquet')):
                raise ValueError('Choose a local CSV, CSV.gz or Parquet file and a valid role')
            if shutil.disk_usage(self.server.root).free < RESERVE + size:
                raise ValueError('Insufficient disk: preserve 8 GiB free working space')
            identifier = str(uuid4())
            suffix = '.parquet' if name.lower().endswith('.parquet') else '.csv.gz' if name.lower().endswith('.gz') else '.csv'
            path = self.server.root / 'uploads' / (identifier + suffix + '.part')
            digest = hashlib.sha256()
            with path.open('xb') as stream:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError('Upload interrupted')
                    stream.write(chunk)
                    digest.update(chunk)
                    remaining -= len(chunk)
            final = path.with_suffix('')
            path.rename(final)
            path = final
            item = {'id': identifier, 'name': name, 'bytes': size, 'role': role, 'sha256': digest.hexdigest(), 'path': str(final)}
            with database(self.server.root) as con:
                con.execute('INSERT INTO uploads VALUES (?,?)', (identifier, json.dumps(item)))
            path = None
            self.respond(201, {'id': identifier})
        except (ValueError, OSError) as error:
            self.respond(400, {'error': str(error) if isinstance(error, ValueError) else 'Upload storage unavailable'})
        finally:
            if path:
                path.unlink(missing_ok=True)
            self.server.upload_lock.release()

    def do_POST(self):
        if not self.guard():
            return
        try:
            value = self.read_json()
            with self.server.operation_lock:
                active = self.server.active
                running = active is not None and active[1].is_alive()
                if self.path == '/api/cancel':
                    if running:
                        active[1].terminate()
                        active[1].join(timeout=5)
                        if active[1].is_alive():
                            active[1].kill()
                            active[1].join()
                        with database(self.server.root) as con:
                            con.execute("UPDATE runs SET status='cancelled',result=NULL WHERE id=? AND status='running'", (active[0],))
                            outcome = con.execute('SELECT status FROM runs WHERE id=?', (active[0],)).fetchone()[0]
                    self.respond(200, {'status': outcome if running else 'idle'})
                    return
                if self.path == '/api/mappings':
                    mappings = value.get('mappings')
                    if not isinstance(mappings, dict) or len(mappings) > 10000 or any(not re.fullmatch(r'\d{12}', account) or not isinstance(team, str) or not team.strip() or len(team) > 255 for account, team in mappings.items()):
                        raise ValueError('Mappings need a 12-digit account and a team name')
                    with database(self.server.root) as con:
                        con.execute('DELETE FROM mappings')
                        con.executemany('INSERT INTO mappings VALUES (?,?)', mappings.items())
                    self.respond(200, {'saved': True})
                    return
                if self.path != '/api/analyse':
                    self.respond(404, {'error': 'Unknown route'})
                    return
                if running:
                    self.respond(409, {'error': 'An analysis is already running'})
                    return
                from datetime import date
                from app.pipeline.types import DataWindow
                DataWindow(**{key: date.fromisoformat(value[key]) for key in ('start', 'end', 'baseline_start', 'baseline_end')})
                with database(self.server.root) as con:
                    files = {identifier: json.loads(raw) for identifier, raw in con.execute('SELECT id,data FROM uploads')}
                    mappings = dict(con.execute('SELECT account,team FROM mappings'))
                selected = value.get('files')
                if not isinstance(selected, list) or not selected or any(not isinstance(item, str) or item not in files for item in selected) or len(set(selected)) != len(selected):
                    raise ValueError('Select distinct uploaded file identifiers')
                if sum(files[item]['bytes'] for item in selected) > MAX_UPLOAD:
                    raise ValueError('This device-safe edition permits 2 GB combined input per check')
                for identifier in selected:
                    item = files[identifier]
                    path = Path(item['path'])
                    if path.is_symlink() or path.resolve().parent != (self.server.root / 'uploads').resolve() or path.stat().st_size != item['bytes']:
                        raise ValueError('Stored source identity changed; upload again')
                    # Streaming verification protects local retained identity without retaining file bytes.
                    with path.open('rb') as stream:
                        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
                    if digest != item['sha256']:
                        raise ValueError('Stored source identity changed; upload again')
                run_id = str(uuid4())
                with database(self.server.root) as con:
                    con.execute('INSERT INTO runs VALUES (?,?,NULL,?)', (run_id, 'running', datetime.now(timezone.utc).isoformat()))
                process = multiprocessing.get_context('spawn').Process(target=job, args=(self.server.root, run_id, value, files, mappings), daemon=True)
                process.start()
                self.server.active = (run_id, process)
                self.respond(202, {'id': run_id})
        except (ValueError, KeyError, TypeError, OSError, sqlite3.Error):
            self.respond(400, {'error': 'Invalid request or unavailable local storage; check the selected files, dates and mappings'})


def main():
    parser = argparse.ArgumentParser(description='Offline local AWS billing analysis')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--data', type=Path, default=Path.home() / '.commitops-local')
    args = parser.parse_args()
    if args.data.is_symlink():
        parser.error('Data directory cannot be a symbolic link')
    root = args.data.resolve()
    try:
        lease = data_lease(root)
    except OSError as error:
        parser.error(str(error))
    initialise(root)
    deny_outbound()
    server = Server(args.port, root)
    print(f'Open http://127.0.0.1:{server.server_port}/#token={server.token}', flush=True)
    print('Local files only. Press Ctrl+C to stop. Keep the launch URL private.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if server.active and server.active[1].is_alive():
            server.active[1].terminate()
            server.active[1].join(timeout=5)
        server.server_close()
        lease.close()


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
