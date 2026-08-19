import base64
import binascii
import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(
    os.environ.get("SERMON_DB_PATH", ROOT / "data" / "sermon-register.db")
)
UPLOADS_PATH = Path(
    os.environ.get("SERMON_UPLOADS_PATH", DB_PATH.parent / "uploads")
)
SCHEMA_PATH = ROOT / "database" / "schema.sql"
APP_ORIGIN = os.environ.get("APP_ORIGIN", "http://localhost:3000")
API_HOST = os.environ.get("API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("API_PORT", "3001"))
MAX_PDF_BYTES = 25 * 1024 * 1024


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

SONGS_V2_SQL = """
CREATE TABLE songs_v2 (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL COLLATE NOCASE,
  tags TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
"""

TEXTS_V2_SQL = """
CREATE TABLE texts_v2 (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL COLLATE NOCASE,
  description TEXT,
  tags TEXT,
  scripture_reference TEXT,
  songs_for_text TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    existing_text_table = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'texts'"
    ).fetchone()
    existing_text_columns = (
        {
            row["name"]
            for row in connection.execute("PRAGMA table_info(texts)")
        }
        if existing_text_table
        else set()
    )
    bootstrap_schema = schema_sql
    if existing_text_table and "text" not in existing_text_columns:
        bootstrap_schema = bootstrap_schema.replace(
            "CREATE INDEX IF NOT EXISTS texts_text_idx ON texts(text COLLATE NOCASE);",
            "",
        )
    connection.executescript(bootstrap_schema)
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

    song_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(songs)")
    }
    if "song_number" in song_columns or "tags" not in song_columns:
        if not backup_path:
            backup_path = schema_backup(database_path, connection)
        connection.commit()
        connection.execute("PRAGMA foreign_keys = OFF")
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(SONGS_V2_SQL)
            connection.execute(
                """INSERT INTO songs_v2
                   (id, title, tags, notes, created_at, updated_at)
                   SELECT id,
                          COALESCE(NULLIF(TRIM(title), ''), song_number),
                          NULL,
                          notes,
                          created_at,
                          updated_at
                     FROM songs"""
            )
            connection.execute("DROP TABLE songs")
            connection.execute("ALTER TABLE songs_v2 RENAME TO songs")
            connection.execute("PRAGMA user_version = 4")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.execute("PRAGMA foreign_keys = ON")

    text_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(texts)")
    }
    if "title" in text_columns or "description" not in text_columns:
        if not backup_path:
            backup_path = schema_backup(database_path, connection)
        connection.commit()
        connection.execute("PRAGMA foreign_keys = OFF")
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(TEXTS_V2_SQL)
            connection.execute(
                """INSERT INTO texts_v2
                   (id, text, description, tags, scripture_reference,
                    songs_for_text, notes, created_at, updated_at)
                   SELECT id, title, text_information, NULL, scripture_reference,
                          NULL, notes, created_at, updated_at
                     FROM texts"""
            )
            connection.execute("DROP TABLE texts")
            connection.execute("ALTER TABLE texts_v2 RENAME TO texts")
            connection.execute("PRAGMA user_version = 6")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.execute("PRAGMA foreign_keys = ON")

    text_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(texts)")
    }
    if "songs_for_text" not in text_columns:
        if not backup_path:
            backup_path = schema_backup(database_path, connection)
        connection.execute("ALTER TABLE texts ADD COLUMN songs_for_text TEXT")
        connection.execute("PRAGMA user_version = 6")
        connection.commit()

    text_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(texts)")
    }
    if "tags" not in text_columns:
        if not backup_path:
            backup_path = schema_backup(database_path, connection)
        connection.execute("ALTER TABLE texts ADD COLUMN tags TEXT")
        connection.execute("PRAGMA user_version = 7")
        connection.commit()

    connection.executescript(schema_sql)
    violations = connection.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise RuntimeError(f"Schema migration created foreign key errors: {violations}")
    return backup_path


def initialize_database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    UPLOADS_PATH.mkdir(parents=True, exist_ok=True)
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


def normalize_tags(value):
    tags = []
    seen = set()
    for raw_tag in str(value or "").split(","):
        tag = raw_tag.strip()
        key = tag.casefold()
        if tag and key not in seen:
            tags.append(tag)
            seen.add(key)
    return ", ".join(tags) or None


def song_rows(con):
    sql = """
    SELECT songs.id, songs.title, songs.tags, songs.notes,
           COUNT(services.id) AS times_used,
           MAX(services.service_date) AS last_used
      FROM songs
 LEFT JOIN services ON services.song_id = songs.id
  GROUP BY songs.id, songs.title, songs.tags, songs.notes
  ORDER BY songs.title COLLATE NOCASE
    """
    return [dict(row) for row in con.execute(sql)]


def text_rows(con):
    sql = """
    SELECT texts.id, texts.text, texts.description, texts.tags,
           texts.scripture_reference, texts.songs_for_text, texts.notes,
           COUNT(DISTINCT CASE
             WHEN services.service_type = 'LEHR' THEN services.id
           END) AS times_used,
           COUNT(DISTINCT services.id) AS service_count,
           MAX(services.service_date) AS last_used,
           COUNT(DISTINCT attachments.id) AS attachment_count
      FROM texts
 LEFT JOIN services ON services.text_id = texts.id
 LEFT JOIN text_attachments attachments ON attachments.text_id = texts.id
  GROUP BY texts.id, texts.text, texts.description, texts.tags,
           texts.scripture_reference, texts.songs_for_text, texts.notes
  ORDER BY texts.text COLLATE NOCASE
    """
    return [dict(row) for row in con.execute(sql)]


def people_rows(con):
    return [
        dict(row)
        for row in con.execute(
            """SELECT id, name
                 FROM people
                WHERE active = 1
                ORDER BY name COLLATE NOCASE"""
        )
    ]


def text_attachment_rows(con, text_id):
    return [
        dict(row)
        for row in con.execute(
            """SELECT id, text_id, original_file_name, byte_size, created_at
                 FROM text_attachments
                WHERE text_id = ?
                ORDER BY created_at DESC""",
            (text_id,),
        )
    ]


def attachment_path(storage_key):
    root = UPLOADS_PATH.resolve()
    candidate = (UPLOADS_PATH / storage_key).resolve()
    if os.path.commonpath((str(root), str(candidate))) != str(root):
        raise ValueError("Invalid attachment storage path")
    return candidate


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
           COALESCE(songs.title, '') AS song,
           COALESCE(song_person.name, '') AS song_by,
           texts.text AS text_title,
           COALESCE(text_person.name, '') AS text_by,
           vorraden.title AS vorrade,
           vorrade_person.name AS vorrade_by,
           continuation.lehr_service_id AS linked_lehr_id,
           linked_lehr.service_date AS linked_lehr_date,
           linked_text.text AS linked_lehr_text,
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

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def create_song(self):
        try:
            body = self.body()
            title = str(body.get("title", "")).strip()
            if not title:
                return self.json({"error": "Song Title is required"}, 400)
            with connect() as con:
                existing = con.execute(
                    "SELECT id FROM songs WHERE title = ? COLLATE NOCASE", (title,)
                ).fetchone()
                if existing:
                    return self.json({"error": "This Song already exists"}, 409)
                song_id = str(uuid.uuid4())
                stamp = now()
                con.execute(
                    """INSERT INTO songs
                       (id, title, tags, notes, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        song_id,
                        title,
                        normalize_tags(body.get("tags")),
                        str(body.get("notes", "")).strip() or None,
                        stamp,
                        stamp,
                    ),
                )
                con.commit()
                record = next(row for row in song_rows(con) if row["id"] == song_id)
                self.json(record, 201)
        except Exception as exc:
            self.json({"error": str(exc)}, 500)

    def update_song(self):
        try:
            body = self.body()
            song_id = str(body.get("id", "")).strip()
            title = str(body.get("title", "")).strip()
            if not song_id or not title:
                return self.json({"error": "Song and Title are required"}, 400)
            with connect() as con:
                existing = con.execute(
                    "SELECT id FROM songs WHERE id = ?", (song_id,)
                ).fetchone()
                if not existing:
                    return self.json({"error": "Song not found"}, 404)
                duplicate = con.execute(
                    """SELECT id FROM songs
                        WHERE title = ? COLLATE NOCASE AND id <> ?""",
                    (title, song_id),
                ).fetchone()
                if duplicate:
                    return self.json({"error": "This Song already exists"}, 409)
                con.execute(
                    """UPDATE songs
                          SET title = ?, tags = ?, notes = ?, updated_at = ?
                        WHERE id = ?""",
                    (
                        title,
                        normalize_tags(body.get("tags")),
                        str(body.get("notes", "")).strip() or None,
                        now(),
                        song_id,
                    ),
                )
                con.commit()
                record = next(row for row in song_rows(con) if row["id"] == song_id)
                self.json(record)
        except Exception as exc:
            self.json({"error": str(exc)}, 500)

    def create_text(self):
        try:
            body = self.body()
            text = str(body.get("text", "")).strip()
            if not text:
                return self.json({"error": "Text is required"}, 400)
            with connect() as con:
                existing = con.execute(
                    "SELECT id FROM texts WHERE text = ? COLLATE NOCASE", (text,)
                ).fetchone()
                if existing:
                    return self.json({"error": "This Text already exists"}, 409)
                text_id = str(uuid.uuid4())
                stamp = now()
                con.execute(
                    """INSERT INTO texts
                       (id, text, description, tags, scripture_reference,
                        songs_for_text, notes, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        text_id,
                        text,
                        str(body.get("description") or "").strip() or None,
                        normalize_tags(body.get("tags")),
                        str(body.get("scriptureReference") or "").strip() or None,
                        str(body.get("songsForText") or "").strip() or None,
                        str(body.get("notes") or "").strip() or None,
                        stamp,
                        stamp,
                    ),
                )
                con.commit()
                record = next(row for row in text_rows(con) if row["id"] == text_id)
                self.json(record, 201)
        except Exception as exc:
            self.json({"error": str(exc)}, 500)

    def update_text(self):
        try:
            body = self.body()
            text_id = str(body.get("id", "")).strip()
            text = str(body.get("text", "")).strip()
            if not text_id or not text:
                return self.json({"error": "Text record and Text are required"}, 400)
            with connect() as con:
                existing = con.execute(
                    "SELECT id FROM texts WHERE id = ?", (text_id,)
                ).fetchone()
                if not existing:
                    return self.json({"error": "Text not found"}, 404)
                duplicate = con.execute(
                    """SELECT id FROM texts
                        WHERE text = ? COLLATE NOCASE AND id <> ?""",
                    (text, text_id),
                ).fetchone()
                if duplicate:
                    return self.json({"error": "This Text already exists"}, 409)
                con.execute(
                    """UPDATE texts
                          SET text = ?, description = ?, tags = ?,
                              scripture_reference = ?, songs_for_text = ?, notes = ?,
                              updated_at = ?
                        WHERE id = ?""",
                    (
                        text,
                        str(body.get("description") or "").strip() or None,
                        normalize_tags(body.get("tags")),
                        str(body.get("scriptureReference") or "").strip() or None,
                        str(body.get("songsForText") or "").strip() or None,
                        str(body.get("notes") or "").strip() or None,
                        now(),
                        text_id,
                    ),
                )
                con.commit()
                record = next(row for row in text_rows(con) if row["id"] == text_id)
                self.json(record)
        except Exception as exc:
            self.json({"error": str(exc)}, 500)

    def create_text_attachment(self):
        final_path = None
        try:
            body = self.body()
            text_id = str(body.get("textId", "")).strip()
            file_name = str(body.get("fileName", "")).strip()
            mime_type = str(body.get("mimeType", "")).strip().lower()
            encoded_data = str(body.get("data", "")).strip()
            if not text_id or not file_name or not encoded_data:
                return self.json({"error": "Text and PDF file are required"}, 400)
            if mime_type not in ("application/pdf", ""):
                return self.json({"error": "Only PDF files can be attached"}, 400)
            try:
                file_data = base64.b64decode(encoded_data, validate=True)
            except (binascii.Error, ValueError):
                return self.json({"error": "The PDF data is invalid"}, 400)
            if len(file_data) > MAX_PDF_BYTES:
                return self.json({"error": "PDF files must be 25 MB or smaller"}, 413)
            if not file_data.startswith(b"%PDF-"):
                return self.json({"error": "The selected file is not a valid PDF"}, 400)

            with connect() as con:
                owner = con.execute(
                    "SELECT id FROM texts WHERE id = ?", (text_id,)
                ).fetchone()
                if not owner:
                    return self.json({"error": "Text not found"}, 404)
                attachment_id = str(uuid.uuid4())
                storage_key = f"texts/{text_id}/{attachment_id}.pdf"
                final_path = attachment_path(storage_key)
                final_path.parent.mkdir(parents=True, exist_ok=True)
                temporary_path = final_path.with_suffix(".tmp")
                with temporary_path.open("xb") as file_handle:
                    file_handle.write(file_data)
                os.replace(temporary_path, final_path)
                con.execute(
                    """INSERT INTO text_attachments
                       (id, text_id, original_file_name, storage_key, mime_type,
                        byte_size, sha256, created_at)
                       VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, ?)""",
                    (
                        attachment_id,
                        text_id,
                        Path(file_name).name,
                        storage_key,
                        len(file_data),
                        hashlib.sha256(file_data).hexdigest(),
                        now(),
                    ),
                )
                con.commit()
                record = next(
                    row
                    for row in text_attachment_rows(con, text_id)
                    if row["id"] == attachment_id
                )
                self.json(record, 201)
        except Exception as exc:
            if final_path:
                final_path.unlink(missing_ok=True)
            self.json({"error": str(exc)}, 500)

    def send_text_attachment(self, attachment_id, download=False):
        with connect() as con:
            attachment = con.execute(
                """SELECT original_file_name, storage_key, byte_size
                     FROM text_attachments WHERE id = ?""",
                (attachment_id,),
            ).fetchone()
        if not attachment:
            return self.json({"error": "PDF attachment not found"}, 404)
        try:
            file_path = attachment_path(attachment["storage_key"])
            file_data = file_path.read_bytes()
        except (OSError, ValueError):
            return self.json({"error": "The PDF file could not be read"}, 404)
        safe_name = (
            attachment["original_file_name"]
            .replace('"', "")
            .replace("\r", "")
            .replace("\n", "")
        )
        disposition = "attachment" if download else "inline"
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(len(file_data)))
        self.send_header("Content-Disposition", f'{disposition}; filename="{safe_name}"')
        self.send_header("Access-Control-Allow-Origin", self.allowed_origin())
        self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(file_data)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/songs":
            with connect() as con:
                return self.json(song_rows(con))
        if path == "/texts":
            with connect() as con:
                return self.json(text_rows(con))
        if path == "/people":
            with connect() as con:
                return self.json(people_rows(con))
        if path == "/text-attachments":
            parameters = parse_qs(parsed.query)
            attachment_id = str(parameters.get("fileId", [""])[0]).strip()
            if attachment_id:
                return self.send_text_attachment(
                    attachment_id,
                    str(parameters.get("download", [""])[0]) == "1",
                )
            text_id = str(parameters.get("textId", [""])[0]).strip()
            if not text_id:
                return self.json({"error": "Text id is required"}, 400)
            with connect() as con:
                return self.json(text_attachment_rows(con, text_id))
        if path != "/services":
            return self.json({"error": "Not found"}, 404)
        with connect() as con:
            self.json(service_rows(con))

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/songs":
            return self.create_song()
        if path == "/texts":
            return self.create_text()
        if path == "/text-attachments":
            return self.create_text_attachment()
        if path != "/services":
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
                song_id = optional_master_id(con, "songs", "title", body.get("song"))
                song_by = optional_master_id(
                    con, "people", "name", body.get("songBy")
                )
                text_id = master_id(con, "texts", "text", body["text"].strip())
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
        path = urlparse(self.path).path
        if path == "/songs":
            return self.update_song()
        if path == "/texts":
            return self.update_text()
        if path != "/services":
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

                song_id = optional_master_id(con, "songs", "title", body.get("song"))
                song_by = optional_master_id(
                    con, "people", "name", body.get("songBy")
                )
                text_id = master_id(con, "texts", "text", body["text"].strip())
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
        path = urlparse(self.path).path
        if path == "/texts":
            try:
                body = self.body()
                text_id = str(body.get("id", "")).strip()
                if not text_id:
                    return self.json({"error": "Text id is required"}, 400)
                with connect() as con:
                    text_record = con.execute(
                        "SELECT id FROM texts WHERE id = ?", (text_id,)
                    ).fetchone()
                    if not text_record:
                        return self.json({"error": "Text not found"}, 404)
                    service_count = con.execute(
                        "SELECT COUNT(*) FROM services WHERE text_id = ?", (text_id,)
                    ).fetchone()[0]
                    if service_count:
                        return self.json(
                            {
                                "error": (
                                    "This Text has been used in a service and cannot "
                                    "be deleted"
                                )
                            },
                            409,
                        )
                    attachment_paths = [
                        attachment_path(row["storage_key"])
                        for row in con.execute(
                            "SELECT storage_key FROM text_attachments WHERE text_id = ?",
                            (text_id,),
                        )
                    ]
                    con.execute("DELETE FROM texts WHERE id = ?", (text_id,))
                    con.commit()
                for file_path in attachment_paths:
                    try:
                        file_path.unlink(missing_ok=True)
                    except OSError:
                        pass
                return self.json({"id": text_id})
            except Exception as exc:
                return self.json({"error": str(exc)}, 500)
        if path == "/text-attachments":
            try:
                body = self.body()
                attachment_id = str(body.get("id", "")).strip()
                if not attachment_id:
                    return self.json({"error": "PDF attachment id is required"}, 400)
                with connect() as con:
                    attachment = con.execute(
                        "SELECT storage_key FROM text_attachments WHERE id = ?",
                        (attachment_id,),
                    ).fetchone()
                    if not attachment:
                        return self.json({"error": "PDF attachment not found"}, 404)
                    con.execute(
                        "DELETE FROM text_attachments WHERE id = ?", (attachment_id,)
                    )
                    con.commit()
                attachment_path(attachment["storage_key"]).unlink(missing_ok=True)
                return self.json({"id": attachment_id})
            except Exception as exc:
                return self.json({"error": str(exc)}, 500)
        if path != "/services":
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
