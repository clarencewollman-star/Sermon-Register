import argparse
import csv
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from server import SCHEMA_PATH, master_id, now


MEANINGFUL_COLUMNS = (
    "By",
    "Column 1",
    "Date Acual",
    "Notes",
    "Song By",
    "Songs",
    "Text",
    "Vorrade",
    "Vorrade By",
)


def clean(value):
    return str(value or "").strip()


def service_date(value):
    raw = clean(value)
    for date_format in ("%d-%b-%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, date_format).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Unsupported date: {raw}")


def canonical_record(row):
    kind = clean(row.get("Column 1")).upper()
    if kind not in ("LEHR", "GEBET"):
        raise ValueError(f"Unsupported service type: {row.get('Column 1')}")

    notes = clean(row.get("Notes"))
    vorrade = clean(row.get("Vorrade"))
    if kind == "GEBET" and vorrade:
        reference = f"Vorrade: {vorrade}"
        notes = f"{notes}\n{reference}".strip() if reference not in notes else notes
        vorrade = ""

    return {
        "date": service_date(row.get("Date Acual")),
        "type": kind,
        "song": clean(row.get("Songs")) or "Not recorded",
        "song_by": clean(row.get("Song By")) or "Not recorded",
        "text": clean(row.get("Text")) or "Not recorded",
        "text_by": clean(row.get("By")) or "Not recorded",
        "vorrade": vorrade,
        "vorrade_by": clean(row.get("Vorrade By")) if vorrade else "",
        "notes": notes,
    }


def source_identity(record):
    content = json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return f"ccw-notion:{digest}", digest


def backup_database(database_path, connection):
    backup_dir = database_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    backup_path = backup_dir / f"sermon-register-before-import-{stamp}.db"
    with sqlite3.connect(backup_path) as backup:
        connection.backup(backup)
    return backup_path


def import_csv(csv_path, database_path):
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    backup_path = backup_database(database_path, connection)

    inserted = 0
    skipped = 0
    blank = 0
    source_name = csv_path.name
    with csv_path.open("r", encoding="utf-8-sig", newline="") as source:
        for row_number, row in enumerate(csv.DictReader(source), start=2):
            if not any(clean(row.get(column)) for column in MEANINGFUL_COLUMNS):
                blank += 1
                continue

            record = canonical_record(row)
            source_key, digest = source_identity(record)
            if connection.execute(
                "SELECT 1 FROM service_imports WHERE source_key = ?", (source_key,)
            ).fetchone():
                skipped += 1
                continue

            song_id = master_id(connection, "songs", "song_number", record["song"])
            song_by_id = master_id(connection, "people", "name", record["song_by"])
            text_id = master_id(connection, "texts", "title", record["text"])
            text_by_id = master_id(connection, "people", "name", record["text_by"])
            vorrade_id = None
            vorrade_by_id = None
            if record["type"] == "LEHR" and record["vorrade"]:
                vorrade_id = master_id(
                    connection, "vorraden", "title", record["vorrade"]
                )
                if record["vorrade_by"]:
                    vorrade_by_id = master_id(
                        connection, "people", "name", record["vorrade_by"]
                    )

            existing = connection.execute(
                """SELECT id FROM services
                    WHERE service_date = ? AND service_type = ? AND song_id = ?
                      AND song_by_person_id = ? AND text_id = ?
                      AND text_by_person_id = ? AND vorrade_id IS ?
                      AND vorrade_by_person_id IS ? AND COALESCE(notes, '') = ?
                    LIMIT 1""",
                (
                    record["date"], record["type"], song_id, song_by_id, text_id,
                    text_by_id, vorrade_id, vorrade_by_id, record["notes"],
                ),
            ).fetchone()
            service_id = existing["id"] if existing else str(uuid.uuid4())
            stamp = now()
            if not existing:
                connection.execute(
                    """INSERT INTO services
                    (id, service_date, service_type, song_id, song_by_person_id,
                     text_id, text_by_person_id, vorrade_id, vorrade_by_person_id,
                     lehr_status, notes, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        service_id, record["date"], record["type"], song_id,
                        song_by_id, text_id, text_by_id, vorrade_id, vorrade_by_id,
                        "IN_PROGRESS" if record["type"] == "LEHR" else None,
                        record["notes"] or None, stamp, stamp,
                    ),
                )
                inserted += 1
            else:
                skipped += 1

            connection.execute(
                """INSERT INTO service_imports
                (source_key, service_id, source_file_name, source_row_number,
                 content_sha256, created_at)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (source_key, service_id, source_name, row_number, digest, stamp),
            )

    connection.commit()
    counts = {
        table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in ("services", "songs", "texts", "vorraden", "people")
    }
    connection.close()
    return {
        "inserted": inserted,
        "skipped": skipped,
        "blank_rows": blank,
        "backup": str(backup_path),
        "counts": counts,
    }


def main():
    parser = argparse.ArgumentParser(description="Import a private Sermon Register CSV")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument(
        "--database",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "data" / "sermon-register.db",
    )
    args = parser.parse_args()
    print(json.dumps(import_csv(args.csv_path.resolve(), args.database.resolve()), indent=2))


if __name__ == "__main__":
    main()
