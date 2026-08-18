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


SERVICES_V2_SQL = """
CREATE TABLE services_v2 (
  id TEXT PRIMARY KEY,
  service_date TEXT NOT NULL CHECK (
    length(service_date) = 10 AND
    service_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  service_type TEXT NOT NULL CHECK (service_type IN ('LEHR', 'GEBET')),
  song_id TEXT REFERENCES songs(id) ON DELETE RESTRICT,
  song_by_person_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
  text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE RESTRICT,
  text_by_person_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
  vorrade_id TEXT REFERENCES vorraden(id) ON DELETE RESTRICT,
  vorrade_by_person_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
  lehr_status TEXT CHECK (lehr_status IN ('IN_PROGRESS', 'FINISHED')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (service_type = 'GEBET' AND vorrade_id IS NULL AND
      vorrade_by_person_id IS NULL AND lehr_status IS NULL)
    OR
    (service_type = 'LEHR' AND
      ((vorrade_id IS NULL AND vorrade_by_person_id IS NULL) OR
       (vorrade_id IS NOT NULL)))
  )
)
"""


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def connect():
    con = sqlite3.connect(DB_PATH, timeout=5)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def schema_backup(database_path, connection):
    backup_dir = database_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    backup_path = backup_dir / f"sermon-register-before-schema-change-{stamp}.db"
    with sqlite3.connect(backup_path) as backup:
        connection.backup(backup)
    return backup_path


def ensure_schema(connection, database_path=DB_PATH):
    connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    columns = {
        row["name"]: row for row in connection.execute("PRAGMA table_info(services)")
    }
    table_sql_row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'services'"
    ).fetchone()
    table_sql = table_sql_row["sql"] if table_sql_row else ""
    needs_migration = (
        (columns.get("song_id") and columns["song_id"]["notnull"])
        or (columns.get("song_by_person_id") and columns["song_by_person_id"]["notnull"])
        or (columns.get("text_by_person_id") and columns["text_by_person_id"]["notnull"])
        or "lehr_status IS NOT NULL" in table_sql
    )
    backup_path = None
    if needs_migration:
        backup_path = schema_backup(database_path, connection)
        connection.commit()
        connection.execute("PRAGMA foreign_keys = OFF")
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(SERVICES_V2_SQL)
            connection.execute(
                """INSERT INTO services_v2
                   (id, service_date, service_type, song_id, song_by_person_id,
                    text_id, text_by_person_id, vorrade_id, vorrade_by_person_id,
                    lehr_status, notes, created_at, updated_at)
                   SELECT id, service_date, service_type, song_id, song_by_person_id,
                          text_id, text_by_person_id, vorrade_id, vorrade_by_person_id,
                          lehr_status, notes, created_at, updated_at
                     FROM services"""
            )
            connection.execute("DROP TRIGGER IF EXISTS validate_lehr_gebet_link_insert")
            connection.execute("DROP TRIGGER IF EXISTS validate_lehr_gebet_link_update")
            connection.execute("DROP TABLE services")
            connection.execute("ALTER TABLE services_v2 RENAME TO services")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.execute("PRAGMA foreign_keys = ON")

    link_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(lehr_gebet_links)")
    }
    if "lehr_status_after" not in link_columns:
        if not backup_path:
            backup_path = schema_backup(database_path, connection)
        connection.execute(
            """ALTER TABLE lehr_gebet_links
               ADD COLUMN lehr_status_after TEXT
               CHECK (lehr_status_after IN ('IN_PROGRESS', 'FINISHED'))"""
        )
        connection.execute("PRAGMA user_version = 3")
        connection.commit()

    connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    violations = connection.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise RuntimeError(f"Schema migration created foreign key errors: {violations}")
    return backup_path


def initialize_database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as con:
        ensure_schema(con, DB_PATH)
        backfill_gebet_links(con)
        con.commit()


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


def optional_master_id(con, table, value_column, value, extra=None):
    value = str(value or "").strip()
    return master_id(con, table, value_column, value, extra) if value else None


def matching_lehr_id(con, gebet_date, text_id, gebet_id=None):
    row = con.execute(
        """SELECT id
             FROM services
            WHERE service_type = 'LEHR'
              AND text_id = ?
              AND service_date <= ?
              AND service_date >= date(?, '-1 year')
              AND id <> COALESCE(?, '')
            ORDER BY service_date DESC, created_at DESC
            LIMIT 1""",
        (text_id, gebet_date, gebet_date, gebet_id),
    ).fetchone()
    return row["id"] if row else None


def backfill_gebet_links(con):
    gebets = con.execute(
        """SELECT s.id, s.service_date, s.text_id
             FROM services s
            WHERE s.service_type = 'GEBET'
              AND NOT EXISTS (
                    SELECT 1
                      FROM lehr_gebet_links link
                     WHERE link.gebet_service_id = s.id
              )
            ORDER BY s.service_date, s.created_at"""
    ).fetchall()
    stamp = now()
    for gebet in gebets:
        lehr_id = matching_lehr_id(
            con, gebet["service_date"], gebet["text_id"], gebet["id"]
        )
        if not lehr_id:
            continue
        sequence_number = con.execute(
            """SELECT COALESCE(MAX(sequence_number), 0) + 1
                 FROM lehr_gebet_links
                WHERE lehr_service_id = ?""",
            (lehr_id,),
        ).fetchone()[0]
        con.execute(
            """INSERT INTO lehr_gebet_links
               (id, lehr_service_id, gebet_service_id, sequence_number,
                lehr_status_after, created_at)
               VALUES (?, ?, ?, ?, NULL, ?)""",
            (str(uuid.uuid4()), lehr_id, gebet["id"], sequence_number, stamp),
        )


def sync_lehr_status_from_links(con, lehr_id, stamp):
    statuses = con.execute(
        """SELECT
               SUM(CASE WHEN lehr_status_after = 'FINISHED' THEN 1 ELSE 0 END),
               SUM(CASE WHEN lehr_status_after = 'IN_PROGRESS' THEN 1 ELSE 0 END)
             FROM lehr_gebet_links
            WHERE lehr_service_id = ?""",
        (lehr_id,),
    ).fetchone()
    status = "FINISHED" if statuses[0] else "IN_PROGRESS"
    con.execute(
        "UPDATE services SET lehr_status = ?, updated_at = ? WHERE id = ?",
        (status, stamp, lehr_id),
    )


def set_gebet_lehr_link(con, gebet_id, lehr_id, lehr_status, stamp):
    lehr_id = str(lehr_id or "").strip() or None
    lehr_status = str(lehr_status or "").strip() or None
    if lehr_status not in (None, "IN_PROGRESS", "FINISHED"):
        raise ValueError("Invalid Lehr status")

    existing = con.execute(
        """SELECT lehr_service_id, lehr_status_after
             FROM lehr_gebet_links
            WHERE gebet_service_id = ?""",
        (gebet_id,),
    ).fetchone()

    if not lehr_id:
        if existing:
            con.execute(
                "DELETE FROM lehr_gebet_links WHERE gebet_service_id = ?",
                (gebet_id,),
            )
            sync_lehr_status_from_links(con, existing["lehr_service_id"], stamp)
        return

    lehr = con.execute(
        "SELECT id FROM services WHERE id = ? AND service_type = 'LEHR'",
        (lehr_id,),
    ).fetchone()
    if not lehr:
        raise ValueError("The selected Lehr could not be found")

    if not existing or existing["lehr_service_id"] != lehr_id:
        if existing:
            con.execute(
                "DELETE FROM lehr_gebet_links WHERE gebet_service_id = ?",
                (gebet_id,),
            )
            sync_lehr_status_from_links(con, existing["lehr_service_id"], stamp)
        sequence_number = con.execute(
            """SELECT COALESCE(MAX(sequence_number), 0) + 1
                 FROM lehr_gebet_links
                WHERE lehr_service_id = ?""",
            (lehr_id,),
        ).fetchone()[0]
        con.execute(
            """INSERT INTO lehr_gebet_links
               (id, lehr_service_id, gebet_service_id, sequence_number,
                lehr_status_after, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()), lehr_id, gebet_id, sequence_number,
                lehr_status, stamp,
            ),
        )
    elif lehr_status:
        con.execute(
            """UPDATE lehr_gebet_links
                  SET lehr_status_after = ?
                WHERE gebet_service_id = ?""",
            (lehr_status, gebet_id),
        )

    if lehr_status:
        sync_lehr_status_from_links(con, lehr_id, stamp)


def service_rows(con):
    sql = """
    SELECT s.id, s.service_date, s.service_type, s.notes, s.lehr_status,
           COALESCE(songs.song_number, '') AS song,
           COALESCE(song_person.name, '') AS song_by,
           texts.title AS text_title,
           COALESCE(text_person.name, '') AS text_by,
           vorraden.title AS vorrade,
           vorrade_person.name AS vorrade_by,
           continuation.lehr_service_id AS linked_lehr_id,
           linked_lehr.service_date AS linked_lehr_date,
           linked_text.title AS linked_lehr_text,
           continuation.lehr_status_after AS linked_lehr_status,
           linked_lehr.lehr_status AS linked_lehr_current_status
      FROM services s
 LEFT JOIN songs ON songs.id = s.song_id
 LEFT JOIN people song_person ON song_person.id = s.song_by_person_id
      JOIN texts ON texts.id = s.text_id
 LEFT JOIN people text_person ON text_person.id = s.text_by_person_id
 LEFT JOIN vorraden ON vorraden.id = s.vorrade_id
 LEFT JOIN people vorrade_person ON vorrade_person.id = s.vorrade_by_person_id
 LEFT JOIN lehr_gebet_links continuation ON continuation.gebet_service_id = s.id
 LEFT JOIN services linked_lehr ON linked_lehr.id = continuation.lehr_service_id
 LEFT JOIN texts linked_text ON linked_text.id = linked_lehr.text_id
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
            required = ["date", "type", "text"]
            if any(not str(body.get(key, "")).strip() for key in required):
                return self.json({"error": "Required fields are missing"}, 400)
            if body["type"] not in ("LEHR", "GEBET"):
                return self.json({"error": "Invalid service type"}, 400)

            with connect() as con:
                song_id = optional_master_id(
                    con, "songs", "song_number", body.get("song")
                )
                song_by = optional_master_id(
                    con, "people", "name", body.get("songBy")
                )
                text_id = master_id(con, "texts", "title", body["text"].strip())
                text_by = optional_master_id(
                    con, "people", "name", body.get("textBy")
                )
                vorrade_id = None
                vorrade_by = None
                lehr_status = None
                if body["type"] == "LEHR" and str(body.get("vorrade", "")).strip():
                    vorrade_id = master_id(
                        con, "vorraden", "title", body["vorrade"].strip()
                    )
                    if str(body.get("vorradeBy", "")).strip():
                        vorrade_by = master_id(
                            con, "people", "name", body["vorradeBy"].strip()
                        )
                if body["type"] == "LEHR":
                    lehr_status = str(body.get("status", "")).strip() or None
                    if lehr_status not in (None, "IN_PROGRESS", "FINISHED"):
                        return self.json({"error": "Invalid Lehr status"}, 400)
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
                        lehr_status,
                        str(body.get("notes", "")).strip() or None, stamp, stamp,
                    ),
                )
                if body["type"] == "GEBET":
                    linked_lehr_id = matching_lehr_id(
                        con, body["date"], text_id, service_id
                    )
                    set_gebet_lehr_link(
                        con,
                        service_id,
                        linked_lehr_id,
                        body.get("linkedLehrStatus"),
                        stamp,
                    )
                con.commit()
                record = next(row for row in service_rows(con) if row["id"] == service_id)
                self.json(record, 201)
        except ValueError as exc:
            self.json({"error": str(exc)}, 400)
        except Exception as exc:
            self.json({"error": str(exc)}, 500)

    def do_PUT(self):
        if self.path != "/services":
            return self.json({"error": "Not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            required = ["id", "date", "type", "text"]
            if any(not str(body.get(key, "")).strip() for key in required):
                return self.json({"error": "Required fields are missing"}, 400)
            if body["type"] not in ("LEHR", "GEBET"):
                return self.json({"error": "Invalid service type"}, 400)

            with connect() as con:
                existing = con.execute(
                    "SELECT id, service_type FROM services WHERE id = ?", (body["id"],)
                ).fetchone()
                if not existing:
                    return self.json({"error": "Service not found"}, 404)

                song_id = optional_master_id(
                    con, "songs", "song_number", body.get("song")
                )
                song_by = optional_master_id(
                    con, "people", "name", body.get("songBy")
                )
                text_id = master_id(con, "texts", "title", body["text"].strip())
                text_by = optional_master_id(
                    con, "people", "name", body.get("textBy")
                )
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
                    lehr_status = str(body.get("status", "")).strip() or None
                    if lehr_status not in (None, "IN_PROGRESS", "FINISHED"):
                        return self.json({"error": "Invalid Lehr status"}, 400)

                if existing["service_type"] == "LEHR" and body["type"] == "GEBET":
                    continuation_count = con.execute(
                        "SELECT COUNT(*) FROM lehr_gebet_links WHERE lehr_service_id = ?",
                        (body["id"],),
                    ).fetchone()[0]
                    if continuation_count:
                        return self.json(
                            {
                                "error": (
                                    "This Lehr has linked Gebets and cannot be changed "
                                    "to a Gebet"
                                )
                            },
                            400,
                        )
                if body["type"] == "LEHR":
                    previous_link = con.execute(
                        """SELECT lehr_service_id
                             FROM lehr_gebet_links
                            WHERE gebet_service_id = ?""",
                        (body["id"],),
                    ).fetchone()
                    con.execute(
                        "DELETE FROM lehr_gebet_links WHERE gebet_service_id = ?",
                        (body["id"],),
                    )
                    if previous_link:
                        sync_lehr_status_from_links(
                            con, previous_link["lehr_service_id"], now()
                        )

                stamp = now()
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
                        stamp, body["id"],
                    ),
                )
                if body["type"] == "GEBET":
                    linked_lehr_id = matching_lehr_id(
                        con, body["date"], text_id, body["id"]
                    )
                    set_gebet_lehr_link(
                        con,
                        body["id"],
                        linked_lehr_id,
                        body.get("linkedLehrStatus"),
                        stamp,
                    )
                con.commit()
                record = next(row for row in service_rows(con) if row["id"] == body["id"])
                self.json(record)
        except ValueError as exc:
            self.json({"error": str(exc)}, 400)
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
                service = con.execute(
                    "SELECT service_type FROM services WHERE id = ?", (service_id,)
                ).fetchone()
                if service and service["service_type"] == "GEBET":
                    link = con.execute(
                        """SELECT lehr_service_id
                             FROM lehr_gebet_links
                            WHERE gebet_service_id = ?""",
                        (service_id,),
                    ).fetchone()
                    con.execute(
                        "DELETE FROM lehr_gebet_links WHERE gebet_service_id = ?",
                        (service_id,),
                    )
                    if link:
                        sync_lehr_status_from_links(con, link["lehr_service_id"], now())
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
