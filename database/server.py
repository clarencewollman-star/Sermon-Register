import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(
    os.environ.get("SERMON_DB_PATH", ROOT / "data" / "sermon-register.db")
)
SCHEMA_PATH = ROOT / "database" / "schema.sql"
APP_ORIGIN = os.environ.get("APP_ORIGIN", "http://localhost:3000")
API_HOST = os.environ.get("API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("API_PORT", "3001"))


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def connect():
    con = sqlite3.connect(DB_PATH, timeout=5)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def initialize_database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as con:
        con.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def master_id(con, table, value_column, value, extra=None):
    row = con.execute(
        f"SELECT id FROM {table} WHERE {value_column} = ? COLLATE NOCASE LIMIT 1",
        (value,),
    ).fetchone()
    if row:
        return row["id"]
    record_id = str(uuid.uuid4())
    stamp = now()
    columns = ["id", value_column, "created_at", "updated_at"]
    values = [record_id, value, stamp, stamp]
    if extra:
        for key, val in extra.items():
            columns.append(key)
            values.append(val)
    marks = ", ".join("?" for _ in values)
    con.execute(
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({marks})", values
    )
    return record_id


def service_rows(con):
    sql = """
    SELECT s.id, s.service_date, s.service_type, s.notes, s.lehr_status,
           songs.song_number AS song,
           song_person.name AS song_by,
           texts.title AS text_title,
           text_person.name AS text_by,
           vorraden.title AS vorrade,
           vorrade_person.name AS vorrade_by
      FROM services s
      JOIN songs ON songs.id = s.song_id
      JOIN people song_person ON song_person.id = s.song_by_person_id
      JOIN texts ON texts.id = s.text_id
      JOIN people text_person ON text_person.id = s.text_by_person_id
 LEFT JOIN vorraden ON vorraden.id = s.vorrade_id
 LEFT JOIN people vorrade_person ON vorrade_person.id = s.vorrade_by_person_id
  ORDER BY s.service_date DESC, s.created_at DESC
    """
    return [dict(row) for row in con.execute(sql)]


class Handler(BaseHTTPRequestHandler):
    def allowed_origin(self):
        origin = self.headers.get("Origin")
        if not origin or origin == APP_ORIGIN:
            return origin or APP_ORIGIN

        origin_host = urlparse(origin).hostname
        request_host = urlparse(f"//{self.headers.get('Host', '')}").hostname
        if origin_host and origin_host == request_host:
            return origin
        return APP_ORIGIN

    def send_json_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", self.allowed_origin())
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def json(self, payload, status=200):
        self.send_json_headers(status)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_json_headers(204)

    def do_GET(self):
        if self.path != "/services":
            return self.json({"error": "Not found"}, 404)
        with connect() as con:
            self.json(service_rows(con))

    def do_POST(self):
        if self.path != "/services":
            return self.json({"error": "Not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            required = ["date", "type", "song", "songBy", "text", "textBy"]
            if any(not str(body.get(key, "")).strip() for key in required):
                return self.json({"error": "Required fields are missing"}, 400)
            if body["type"] not in ("LEHR", "GEBET"):
                return self.json({"error": "Invalid service type"}, 400)

            with connect() as con:
                song_id = master_id(con, "songs", "song_number", body["song"].strip())
                song_by = master_id(con, "people", "name", body["songBy"].strip())
                text_id = master_id(con, "texts", "title", body["text"].strip())
                text_by = master_id(con, "people", "name", body["textBy"].strip())
                vorrade_id = None
                vorrade_by = None
                if body["type"] == "LEHR" and str(body.get("vorrade", "")).strip():
                    vorrade_id = master_id(
                        con, "vorraden", "title", body["vorrade"].strip()
                    )
                    if str(body.get("vorradeBy", "")).strip():
                        vorrade_by = master_id(
                            con, "people", "name", body["vorradeBy"].strip()
                        )
                service_id = str(uuid.uuid4())
                stamp = now()
                con.execute(
                    """INSERT INTO services
                    (id, service_date, service_type, song_id, song_by_person_id,
                     text_id, text_by_person_id, vorrade_id, vorrade_by_person_id,
                     lehr_status, notes,
                     created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        service_id, body["date"], body["type"], song_id, song_by,
                        text_id, text_by, vorrade_id, vorrade_by,
                        "IN_PROGRESS" if body["type"] == "LEHR" else None,
                        str(body.get("notes", "")).strip() or None, stamp, stamp,
                    ),
                )
                con.commit()
                record = next(row for row in service_rows(con) if row["id"] == service_id)
                self.json(record, 201)
        except Exception as exc:
            self.json({"error": str(exc)}, 500)

    def do_PUT(self):
        if self.path != "/services":
            return self.json({"error": "Not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            required = ["id", "date", "type", "song", "songBy", "text", "textBy"]
            if any(not str(body.get(key, "")).strip() for key in required):
                return self.json({"error": "Required fields are missing"}, 400)
            if body["type"] not in ("LEHR", "GEBET"):
                return self.json({"error": "Invalid service type"}, 400)

            with connect() as con:
                existing = con.execute(
                    "SELECT id FROM services WHERE id = ?", (body["id"],)
                ).fetchone()
                if not existing:
                    return self.json({"error": "Service not found"}, 404)

                song_id = master_id(con, "songs", "song_number", body["song"].strip())
                song_by = master_id(con, "people", "name", body["songBy"].strip())
                text_id = master_id(con, "texts", "title", body["text"].strip())
                text_by = master_id(con, "people", "name", body["textBy"].strip())
                vorrade_id = None
                vorrade_by = None
                lehr_status = None
                if body["type"] == "LEHR":
                    if str(body.get("vorrade", "")).strip():
                        vorrade_id = master_id(
                            con, "vorraden", "title", body["vorrade"].strip()
                        )
                        if str(body.get("vorradeBy", "")).strip():
                            vorrade_by = master_id(
                                con, "people", "name", body["vorradeBy"].strip()
                            )
                    lehr_status = body.get("status", "IN_PROGRESS")
                    if lehr_status not in ("IN_PROGRESS", "FINISHED"):
                        return self.json({"error": "Invalid Lehr status"}, 400)

                con.execute(
                    """UPDATE services
                       SET service_date = ?, service_type = ?, song_id = ?,
                           song_by_person_id = ?, text_id = ?, text_by_person_id = ?,
                           vorrade_id = ?, vorrade_by_person_id = ?,
                           lehr_status = ?, notes = ?, updated_at = ?
                     WHERE id = ?""",
                    (
                        body["date"], body["type"], song_id, song_by, text_id,
                        text_by, vorrade_id, vorrade_by, lehr_status,
                        str(body.get("notes", "")).strip() or None,
                        now(), body["id"],
                    ),
                )
                con.commit()
                record = next(row for row in service_rows(con) if row["id"] == body["id"])
                self.json(record)
        except Exception as exc:
            self.json({"error": str(exc)}, 500)

    def do_DELETE(self):
        if self.path != "/services":
            return self.json({"error": "Not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            service_id = str(body.get("id", "")).strip()
            if not service_id:
                return self.json({"error": "Service id is required"}, 400)
            with connect() as con:
                deleted = con.execute(
                    "DELETE FROM services WHERE id = ?", (service_id,)
                )
                if not deleted.rowcount:
                    return self.json({"error": "Service not found"}, 404)
                con.commit()
                self.json({"id": service_id})
        except Exception as exc:
            self.json({"error": str(exc)}, 500)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    initialize_database()
    print(f"[database] SQLite ready at {DB_PATH}", flush=True)
    print(f"[database] API listening on {API_HOST}:{API_PORT}", flush=True)
    ThreadingHTTPServer((API_HOST, API_PORT), Handler).serve_forever()
