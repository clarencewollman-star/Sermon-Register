"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

declare const __APP_VERSION__: string;

type Service = {
  id: string;
  dateValue: string;
  date: string;
  day: string;
  type: "Lehr" | "Gebet";
  song: string;
  songBy: string;
  text: string;
  textBy: string;
  vorrade: string;
  vorradeBy: string;
  status: string;
  linkedLehrId: string;
  linkedLehrDate: string;
  linkedLehrText: string;
  linkedLehrCurrentStatus: string;
  notes: string;
};

type ApiService = {
  id: string;
  service_date: string;
  service_type: "LEHR" | "GEBET";
  song: string | null;
  song_by: string | null;
  text_title: string;
  text_by: string | null;
  vorrade: string | null;
  vorrade_by: string | null;
  lehr_status: "IN_PROGRESS" | "FINISHED" | null;
  linked_lehr_id: string | null;
  linked_lehr_date: string | null;
  linked_lehr_text: string | null;
  linked_lehr_status: "IN_PROGRESS" | "FINISHED" | null;
  linked_lehr_current_status: "IN_PROGRESS" | "FINISHED" | null;
  notes: string | null;
};

type Song = {
  id: string;
  title: string;
  tags: string;
  notes: string;
  timesUsed: number;
  lastUsedValue: string;
  lastUsed: string;
};

type ApiSong = {
  id: string;
  title: string;
  tags: string | null;
  notes: string | null;
  times_used: number;
  last_used: string | null;
};

type TextRecord = {
  id: string;
  text: string;
  description: string;
  scriptureReference: string;
  songsForText: string;
  notes: string;
  timesUsed: number;
  lastUsedValue: string;
  lastUsed: string;
  attachmentCount: number;
};

type ApiTextRecord = {
  id: string;
  text: string;
  description: string | null;
  scripture_reference: string | null;
  songs_for_text: string | null;
  notes: string | null;
  times_used: number;
  last_used: string | null;
  attachment_count: number;
};

type TextAttachment = {
  id: string;
  text_id: string;
  original_file_name: string;
  byte_size: number;
  created_at: string;
};

type EntryType = "" | "Lehr" | "Gebet";
type SongSortField = "title" | "tags" | "timesUsed";
type TextSortField = "text" | "timesUsed" | "lastUsed";

const navItems = [
  { label: "Register", icon: "bi-table" },
  { label: "Texts", icon: "bi-journal-text" },
  { label: "Vorraden", icon: "bi-files" },
  { label: "Songs", icon: "bi-music-note-list" },
  { label: "People", icon: "bi-people" },
];

const blankDraft = () => ({
  date: "",
  type: "" as EntryType,
  song: "",
  songBy: "",
  text: "",
  textBy: "",
  vorrade: "",
  vorradeBy: "",
  status: "",
  notes: "",
});

const apiUrl = () => "/api/services";
const songsApiUrl = () => "/api/songs";
const textsApiUrl = () => "/api/texts";
const textAttachmentsApiUrl = () => "/api/text-attachments";

const fromApi = (row: ApiService): Service => {
  const date = new Date(`${row.service_date}T12:00:00`);
  const status =
    row.service_type === "LEHR" ? row.lehr_status : row.linked_lehr_status;
  return {
    id: row.id,
    dateValue: row.service_date,
    date: date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    day: date.toLocaleDateString("en-US", { weekday: "long" }),
    type: row.service_type === "LEHR" ? "Lehr" : "Gebet",
    song: row.song || "",
    songBy: row.song_by || "",
    text: row.text_title,
    textBy: row.text_by || "",
    vorrade: row.vorrade || "",
    vorradeBy: row.vorrade_by || "",
    status:
      status === "IN_PROGRESS"
        ? "In Progress"
        : status === "FINISHED"
          ? "Finished"
          : "",
    linkedLehrId: row.linked_lehr_id || "",
    linkedLehrDate: row.linked_lehr_date || "",
    linkedLehrText: row.linked_lehr_text || "",
    linkedLehrCurrentStatus:
      row.linked_lehr_current_status === "FINISHED"
        ? "Finished"
        : row.linked_lehr_current_status === "IN_PROGRESS"
          ? "In Progress"
          : "",
    notes: row.notes || "",
  };
};

const songFromApi = (row: ApiSong): Song => ({
  id: row.id,
  title: row.title,
  tags: row.tags || "",
  notes: row.notes || "",
  timesUsed: Number(row.times_used || 0),
  lastUsedValue: row.last_used || "",
  lastUsed: row.last_used
    ? new Date(`${row.last_used}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never",
});

const textFromApi = (row: ApiTextRecord): TextRecord => ({
  id: row.id,
  text: row.text,
  description: row.description || "",
  scriptureReference: row.scripture_reference || "",
  songsForText: row.songs_for_text || "",
  notes: row.notes || "",
  timesUsed: Number(row.times_used || 0),
  lastUsedValue: row.last_used || "",
  lastUsed: row.last_used
    ? new Date(`${row.last_used}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never",
  attachmentCount: Number(row.attachment_count || 0),
});

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function firstLine(value: string) {
  return value.split(/\r?\n/, 1)[0].trim();
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return window.btoa(binary);
}

export default function Home() {
  const [active, setActive] = useState("Register");
  const [items, setItems] = useState<Service[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All Services");
  const [year, setYear] = useState("All Years");
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [kind, setKind] = useState<EntryType>("");
  const [editKind, setEditKind] = useState<EntryType>("");
  const [selected, setSelected] = useState<Service | null>(null);
  const [rowVersion, setRowVersion] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [draft, setDraft] = useState(blankDraft);
  const [songs, setSongs] = useState<Song[]>([]);
  const [songQuery, setSongQuery] = useState("");
  const [songSort, setSongSort] = useState<SongSortField>("title");
  const [songSortDirection, setSongSortDirection] = useState<"asc" | "desc">("asc");
  const [songEditor, setSongEditor] = useState<Song | "new" | null>(null);
  const [songError, setSongError] = useState("");
  const [texts, setTexts] = useState<TextRecord[]>([]);
  const [textQuery, setTextQuery] = useState("");
  const [textSort, setTextSort] = useState<TextSortField>("text");
  const [textSortDirection, setTextSortDirection] = useState<"asc" | "desc">("asc");
  const [textEditor, setTextEditor] = useState<TextRecord | "new" | null>(null);
  const [textError, setTextError] = useState("");
  const [textAttachments, setTextAttachments] = useState<TextAttachment[]>([]);
  const [pdfUploading, setPdfUploading] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    fetch(textsApiUrl())
      .then((response) => {
        if (!response.ok) throw new Error("Texts unavailable");
        return response.json();
      })
      .then((rows) => setTexts((rows as ApiTextRecord[]).map(textFromApi)))
      .catch(() => setTextError("The Texts Could Not Be Loaded."));
  }, []);

  useEffect(() => {
    fetch(songsApiUrl())
      .then((response) => {
        if (!response.ok) throw new Error("Songs unavailable");
        return response.json();
      })
      .then((rows) => setSongs((rows as ApiSong[]).map(songFromApi)))
      .catch(() => setSongError("The Songs Could Not Be Loaded."));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = sessionStorage.getItem("sermon-register-service-draft");
      if (saved) {
        try {
          setDraft({ ...blankDraft(), ...JSON.parse(saved) });
          setRowVersion((version) => version + 1);
        } catch {
          sessionStorage.removeItem("sermon-register-service-draft");
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetch(apiUrl())
      .then((response) => {
        if (!response.ok) throw new Error("Database unavailable");
        return response.json();
      })
      .then((rows) => setItems((rows as ApiService[]).map(fromApi)))
      .catch(() =>
        setSaveError(
          "The SQLite Database Could Not Be Reached. Check The Container Logs.",
        ),
      );
  }, []);

  const visible = useMemo(
    () =>
      items.filter(
        (service) =>
          (filter === "All Services" || service.type === filter) &&
          (year === "All Years" || service.dateValue.startsWith(`${year}-`)) &&
          Object.values(service)
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [items, query, filter, year],
  );

  const years = useMemo(
    () =>
      Array.from(new Set(items.map((service) => service.dateValue.slice(0, 4))))
        .filter(Boolean)
        .sort((left, right) => right.localeCompare(left)),
    [items],
  );

  const visibleSongs = useMemo(
    () => {
      const filteredSongs = songs.filter((song) =>
        `${song.title} ${song.tags} ${song.notes}`
          .toLowerCase()
          .includes(songQuery.toLowerCase()),
      );
      return filteredSongs.sort((left, right) => {
        if (songSort === "tags" && (!left.tags || !right.tags)) {
          if (!left.tags && !right.tags) return 0;
          return !left.tags ? 1 : -1;
        }
        const comparison =
          songSort === "timesUsed"
            ? left.timesUsed - right.timesUsed
            : left[songSort].localeCompare(right[songSort], undefined, {
                numeric: true,
                sensitivity: "base",
              });
        return songSortDirection === "asc" ? comparison : -comparison;
      });
    },
    [songs, songQuery, songSort, songSortDirection],
  );

  const visibleTexts = useMemo(
    () => {
      const filteredTexts = texts.filter((record) =>
        `${record.text} ${record.description} ${record.scriptureReference} ${record.songsForText} ${record.notes}`
          .toLowerCase()
          .includes(textQuery.toLowerCase()),
      );
      return filteredTexts.sort((left, right) => {
        const comparison =
          textSort === "timesUsed"
            ? left.timesUsed - right.timesUsed
            : textSort === "lastUsed"
              ? left.lastUsedValue.localeCompare(right.lastUsedValue)
              : left.text.localeCompare(right.text, undefined, {
                  numeric: true,
                  sensitivity: "base",
                });
        return textSortDirection === "asc" ? comparison : -comparison;
      });
    },
    [texts, textQuery, textSort, textSortDirection],
  );

  function changeTextSort(field: TextSortField) {
    if (textSort === field) {
      setTextSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setTextSort(field);
    setTextSortDirection(field === "text" ? "asc" : "desc");
  }

  function changeSongSort(field: SongSortField) {
    if (songSort === field) {
      setSongSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSongSort(field);
    setSongSortDirection(field === "timesUsed" ? "desc" : "asc");
  }

  async function refreshSongs() {
    const response = await fetch(songsApiUrl(), { cache: "no-store" });
    if (!response.ok) throw new Error("Could Not Refresh Songs");
    const rows = (await response.json()) as ApiSong[];
    setSongs(rows.map(songFromApi));
  }

  async function refreshTexts() {
    const response = await fetch(textsApiUrl(), { cache: "no-store" });
    if (!response.ok) throw new Error("Could Not Refresh Texts");
    const rows = (await response.json()) as ApiTextRecord[];
    setTexts(rows.map(textFromApi));
  }

  async function loadTextAttachments(textId: string) {
    const response = await fetch(
      `${textAttachmentsApiUrl()}?textId=${encodeURIComponent(textId)}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as TextAttachment[] | { error?: string };
    if (!response.ok || !Array.isArray(result)) {
      throw new Error(
        (!Array.isArray(result) && result.error) || "Could Not Load PDFs",
      );
    }
    setTextAttachments(result);
  }

  async function createService(payload: Record<string, string>) {
    setSaveError("");
    const response = await fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as ApiService & { error?: string };
    if (!response.ok) throw new Error(result.error || "Could Not Save Service");
    const created = fromApi(result);
    setItems((current) => [
      created,
      ...current.map((service) =>
        created.type === "Gebet" && service.id === created.linkedLehrId
          ? { ...service, status: created.linkedLehrCurrentStatus }
          : service,
      ),
    ]);
    void refreshSongs().catch(() => setSongError("The Songs Could Not Be Refreshed."));
    void refreshTexts().catch(() => setTextError("The Texts Could Not Be Refreshed."));
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editKind) return;
    const form = new FormData(event.currentTarget);
    setSaveError("");
    try {
      const response = await fetch(apiUrl(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          date: String(form.get("editDate")),
          type: editKind.toUpperCase(),
          song: String(form.get("editSong")),
          songBy: String(form.get("editSongBy")),
          text: String(form.get("editText")),
          textBy: String(form.get("editTextBy")),
          vorrade: String(form.get("editVorrade") || ""),
          vorradeBy: String(form.get("editVorradeBy") || ""),
          status: String(form.get("editStatus") || ""),
          linkedLehrStatus: String(form.get("editStatus") || ""),
          notes: String(form.get("editNotes") || ""),
        }),
      });
      const result = (await response.json()) as ApiService & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could Not Update Service");
      const updated = fromApi(result);
      setItems((current) =>
        current.map((service) => {
          if (service.id === updated.id) return updated;
          if (updated.type === "Gebet" && service.id === updated.linkedLehrId) {
            return { ...service, status: updated.linkedLehrCurrentStatus };
          }
          return service;
        }),
      );
      setSelected(null);
      void refreshSongs().catch(() => setSongError("The Songs Could Not Be Refreshed."));
      void refreshTexts().catch(() => setTextError("The Texts Could Not Be Refreshed."));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could Not Update Service");
    }
  }

  async function deleteSelectedService() {
    if (!selected) return;
    if (!window.confirm("Delete This Service? This Cannot Be Undone.")) return;
    setSaveError("");
    try {
      const response = await fetch(apiUrl(), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could Not Delete Service");
      setItems((current) =>
        current.filter((service) => service.id !== selected.id),
      );
      setSelected(null);
      void refreshSongs().catch(() => setSongError("The Songs Could Not Be Refreshed."));
      void refreshTexts().catch(() => setTextError("The Texts Could Not Be Refreshed."));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could Not Delete Service");
    }
  }

  async function saveSong(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!songEditor) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("songTitle") || "").trim();
    if (!title) {
      setSongError("Song Title Is Required.");
      return;
    }
    setSongError("");
    try {
      const response = await fetch(songsApiUrl(), {
        method: songEditor === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: songEditor === "new" ? "" : songEditor.id,
          title,
          tags: String(form.get("songTags") || ""),
          notes: String(form.get("songNotes") || ""),
        }),
      });
      const result = (await response.json()) as ApiSong & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could Not Save Song");
      const saved = songFromApi(result);
      setSongs((current) => {
        const next =
          songEditor === "new"
            ? [...current, saved]
            : current.map((song) => (song.id === saved.id ? saved : song));
        return next.sort((left, right) => left.title.localeCompare(right.title));
      });
      setSongEditor(null);
    } catch (error) {
      setSongError(error instanceof Error ? error.message : "Could Not Save Song");
    }
  }

  function openTextEditor(record: TextRecord) {
    setTextError("");
    setTextAttachments([]);
    setTextEditor(record);
    void loadTextAttachments(record.id).catch((error) =>
      setTextError(error instanceof Error ? error.message : "Could Not Load PDFs"),
    );
  }

  async function saveText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!textEditor) return;
    const form = new FormData(event.currentTarget);
    const text = String(form.get("textText") || "").trim();
    if (!text) {
      setTextError("Text Is Required.");
      return;
    }
    setTextError("");
    try {
      const response = await fetch(textsApiUrl(), {
        method: textEditor === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: textEditor === "new" ? "" : textEditor.id,
          text,
          description: String(form.get("textDescription") || ""),
          scriptureReference: String(form.get("textScriptureReference") || ""),
          songsForText: String(form.get("textSongsForText") || ""),
          notes: String(form.get("textNotes") || ""),
        }),
      });
      const result = (await response.json()) as ApiTextRecord & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could Not Save Text");
      const saved = textFromApi(result);
      setTexts((current) => {
        const next =
          textEditor === "new"
            ? [...current, saved]
            : current.map((record) => (record.id === saved.id ? saved : record));
        return next.sort((left, right) => left.text.localeCompare(right.text));
      });
      setTextEditor(saved);
    } catch (error) {
      setTextError(error instanceof Error ? error.message : "Could Not Save Text");
    }
  }

  async function uploadTextPdfs(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (!files.length || !textEditor || textEditor === "new") return;
    setPdfUploading(true);
    setTextError("");
    try {
      for (const file of files) {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          throw new Error(`${file.name} Is Not A PDF File.`);
        }
        if (file.size > 25 * 1024 * 1024) {
          throw new Error(`${file.name} Is Larger Than 25 MB.`);
        }
        const response = await fetch(textAttachmentsApiUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            textId: textEditor.id,
            fileName: file.name,
            mimeType: file.type || "application/pdf",
            data: arrayBufferToBase64(await file.arrayBuffer()),
          }),
        });
        const result = (await response.json()) as TextAttachment & { error?: string };
        if (!response.ok) throw new Error(result.error || `Could Not Add ${file.name}`);
      }
      await loadTextAttachments(textEditor.id);
      await refreshTexts();
    } catch (error) {
      setTextError(error instanceof Error ? error.message : "Could Not Add PDFs");
    } finally {
      input.value = "";
      setPdfUploading(false);
    }
  }

  async function removeTextAttachment(attachment: TextAttachment) {
    if (!window.confirm(`Remove ${attachment.original_file_name}?`)) return;
    setTextError("");
    try {
      const response = await fetch(textAttachmentsApiUrl(), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: attachment.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could Not Remove PDF");
      setTextAttachments((current) =>
        current.filter((record) => record.id !== attachment.id),
      );
      await refreshTexts();
    } catch (error) {
      setTextError(error instanceof Error ? error.message : "Could Not Remove PDF");
    }
  }

  function openSongFromRegister(title: string) {
    const song = songs.find(
      (record) => record.title.localeCompare(title, undefined, { sensitivity: "base" }) === 0,
    );
    if (!song) return;
    setActive("Songs");
    setSongError("");
    setSongEditor(song);
  }

  function openTextFromRegister(value: string) {
    const record = texts.find(
      (candidate) =>
        candidate.text.localeCompare(value, undefined, { sensitivity: "base" }) === 0,
    );
    if (!record) return;
    setActive("Texts");
    openTextEditor(record);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    const form = new FormData(event.currentTarget);
    try {
      await createService({
        date: String(form.get("date")),
        type: kind.toUpperCase(),
        song: String(form.get("song")),
        songBy: String(form.get("songBy")),
        text: String(form.get("text")),
        textBy: String(form.get("textBy")),
        vorrade: String(form.get("vorrade") || ""),
        vorradeBy: String(form.get("vorradeBy") || ""),
        status: String(form.get("status") || ""),
        linkedLehrStatus: String(form.get("status") || ""),
        notes: String(form.get("notes") || ""),
      });
      setOpen(false);
      setKind("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could Not Save Service");
    }
  }

  function persistInlineDraft() {
    const formElement = document.getElementById(
      "inline-service-form",
    ) as HTMLFormElement | null;
    if (!formElement) return;
    const form = new FormData(formElement);
    sessionStorage.setItem(
      "sermon-register-service-draft",
      JSON.stringify({
        date: String(form.get("inlineDate") || ""),
        type: String(form.get("inlineType") || "") as EntryType,
        song: String(form.get("inlineSong") || ""),
        songBy: String(form.get("inlineSongBy") || ""),
        text: String(form.get("inlineText") || ""),
        textBy: String(form.get("inlineTextBy") || ""),
        vorrade: String(form.get("inlineVorrade") || ""),
        vorradeBy: String(form.get("inlineVorradeBy") || ""),
        status: String(form.get("inlineStatus") || ""),
        notes: String(form.get("inlineNotes") || ""),
      }),
    );
  }

  async function saveInline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("inlineDate"));
    const type = String(form.get("inlineType")) as EntryType;
    const song = String(form.get("inlineSong") || "").trim();
    const songBy = String(form.get("inlineSongBy") || "").trim();
    const text = String(form.get("inlineText") || "").trim();
    const textBy = String(form.get("inlineTextBy") || "").trim();
    const vorrade = String(form.get("inlineVorrade") || "").trim();
    const vorradeBy = String(form.get("inlineVorradeBy") || "").trim();
    const status = String(form.get("inlineStatus") || "").trim();
    const notes = String(form.get("inlineNotes") || "");
    if (!date || !type || !text) {
      setSaveError("Complete Date, Type, And Text.");
      return;
    }
    try {
      await createService({
        date,
        type: type.toUpperCase(),
        song,
        songBy,
        text,
        textBy,
        vorrade,
        vorradeBy,
        status,
        notes,
      });
      sessionStorage.removeItem("sermon-register-service-draft");
      setDraft(blankDraft());
      setRowVersion((version) => version + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could Not Save Service");
    }
  }

  function clearInline() {
    sessionStorage.removeItem("sermon-register-service-draft");
    setDraft(blankDraft());
    setRowVersion((version) => version + 1);
  }

  function changeSection(section: string) {
    setActive(section);
    setSidebarOpen(false);
  }

  function openService(service: Service) {
    setSaveError("");
    setEditKind(service.type);
    setSelected(service);
  }

  function startNew() {
    setActive("Register");
    clearInline();
    setKind("");
    if (mobile) {
      setOpen(true);
    } else {
      window.setTimeout(
        () =>
          document
            .querySelector<HTMLInputElement>('input[name="inlineDate"]')
            ?.focus(),
        0,
      );
    }
  }

  return (
    <div className="app-wrapper">
      <form id="inline-service-form" onSubmit={saveInline} />

      <header className="app-header navbar navbar-expand bg-body shadow-sm">
        <div className="container-fluid">
          <button
            className="btn btn-link d-lg-none px-2"
            type="button"
            aria-label="Open Navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <i className="bi bi-list fs-4" />
          </button>
          <span className="navbar-brand d-flex align-items-center mb-0">
            <span className="brand-mark">S</span>
            <span className="d-none d-sm-inline">Sermon Register</span>
          </span>
          <div className="ms-auto d-flex align-items-center gap-2">
            <span
              className="badge text-bg-light border app-version"
              aria-label={`Version ${__APP_VERSION__}`}
            >
              v{__APP_VERSION__}
            </span>
          </div>
        </div>
      </header>

      <aside
        className={`app-sidebar bg-body-secondary shadow ${sidebarOpen ? "sidebar-open" : ""}`}
        data-bs-theme="dark"
      >
        <div className="sidebar-brand">
          <span className="brand-mark">S</span>
          <span className="brand-text fw-semibold">Sermon Register</span>
        </div>
        <div className="sidebar-wrapper">
          <nav className="mt-2" aria-label="Main Navigation">
            <ul className="nav sidebar-menu flex-column" role="menu">
              {navItems.map((item) => (
                <li className="nav-item" role="none" key={item.label}>
                  <button
                    type="button"
                    role="menuitem"
                    className={`nav-link ${active === item.label ? "active" : ""}`}
                    aria-current={active === item.label ? "page" : undefined}
                    onClick={() => changeSection(item.label)}
                  >
                    <i className={`nav-icon bi ${item.icon}`} />
                    <p>{item.label}</p>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sidebar-status">
            <i className="bi bi-shield-lock-fill me-2" />
            Private SQLite Register
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close Navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="app-main">
        <div className="app-content-header">
          <div className="container-fluid">
            <div className="row align-items-center">
              <div className="col-sm-6">
                <h3 className="mb-0">{active === "Register" ? "Service Register" : active}</h3>
                <p className="text-body-secondary mb-0 mt-1">
                  {active === "Register"
                    ? "Weekly Lehr And Gebet History"
                    : `Reusable ${active} Records`}
                </p>
              </div>
              <div className="col-sm-6 d-none d-sm-block">
                <ol className="breadcrumb float-sm-end mb-0">
                  <li className="breadcrumb-item">Sermon Register</li>
                  <li className="breadcrumb-item active" aria-current="page">
                    {active}
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <div className="app-content">
          <div className="container-fluid">
            {active === "Register" ? (
              <div className="card card-primary card-outline shadow-sm register-card">
                <div className="card-header register-toolbar border-bottom">
                  <div className="row g-2 align-items-center">
                    <div className="col-12 col-lg">
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="bi bi-search" />
                        </span>
                        <input
                          className="form-control"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Search Texts, Songs, People, Or Notes"
                          aria-label="Search Services"
                        />
                      </div>
                    </div>
                    <div className="col-6 col-lg-auto">
                      <select
                        className="form-select"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        aria-label="Service Type"
                      >
                        <option>All Services</option>
                        <option>Lehr</option>
                        <option>Gebet</option>
                      </select>
                    </div>
                    <div className="col-6 col-lg-auto">
                      <select
                        className="form-select"
                        value={year}
                        onChange={(event) => setYear(event.target.value)}
                        aria-label="Year"
                      >
                        <option>All Years</option>
                        {years.map((availableYear) => (
                          <option key={availableYear}>{availableYear}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-auto ms-lg-auto">
                      <span className="badge text-bg-primary rounded-pill">
                        {visible.length} Services
                      </span>
                    </div>
                    <div className="col-12 d-md-none">
                      <button
                        className="btn btn-primary w-100"
                        type="button"
                        onClick={startNew}
                      >
                        <i className="bi bi-plus-lg me-1" />
                        Add Service
                      </button>
                    </div>
                  </div>
                </div>

                {saveError && (
                  <div className="alert alert-danger m-3 mb-0" role="alert">
                    <i className="bi bi-exclamation-triangle-fill me-2" />
                    {saveError}
                  </div>
                )}

                <div className="table-responsive desktop-register-table">
                  <table className="table table-hover align-middle mb-0 register-table">
                    <thead className="table-light">
                      <tr>
                        <th className="date-column">Date</th>
                        <th className="type-column">Type</th>
                        <th className="content-column song-column">Song</th>
                        <th className="person-column">Song By</th>
                        <th className="content-column text-column">Text</th>
                        <th className="person-column">Text By</th>
                        <th className="content-column vorrade-column">Vorrade</th>
                        <th className="person-column">Vorrade By</th>
                        <th className="notes-column">Notes</th>
                        <th className="status-column">Status</th>
                        <th className="actions-column">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        className="inline-entry-row"
                        key={rowVersion}
                        onInput={persistInlineDraft}
                      >
                        <td className="date-column">
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineDate"
                            type="date"
                            defaultValue={draft.date}
                            aria-label="New Service Date"
                          />
                        </td>
                        <td className="type-column">
                          <select
                            className="form-select form-select-sm"
                            form="inline-service-form"
                            name="inlineType"
                            value={draft.type}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                type: event.target.value as EntryType,
                              })
                            }
                            aria-label="New Service Type"
                          >
                            <option value="">Choose Type</option>
                            <option>Lehr</option>
                            <option>Gebet</option>
                          </select>
                        </td>
                        <td className="content-column song-column">
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineSong"
                            list="songs-list"
                            defaultValue={draft.song}
                            placeholder="Type New"
                            aria-label="New Service Song"
                          />
                        </td>
                        <td className="person-column">
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineSongBy"
                            list="people-list"
                            defaultValue={draft.songBy}
                            placeholder="Type New"
                            aria-label="New Service Song By"
                          />
                        </td>
                        <td className="content-column text-column">
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineText"
                            list="texts-list"
                            defaultValue={draft.text}
                            placeholder="Type New"
                            aria-label="New Service Text"
                          />
                        </td>
                        <td className="person-column">
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineTextBy"
                            list="people-list"
                            defaultValue={draft.textBy}
                            placeholder="Type New"
                            aria-label="New Service Text By"
                          />
                        </td>
                        <td className="content-column vorrade-column">
                          {draft.type === "Lehr" ? (
                            <input
                              className="form-control form-control-sm"
                              form="inline-service-form"
                              name="inlineVorrade"
                              list="vorraden-list"
                              defaultValue={draft.vorrade}
                              placeholder="Type New"
                              aria-label="New Service Vorrade"
                            />
                          ) : (
                            <span className="text-body-secondary">—</span>
                          )}
                        </td>
                        <td className="person-column">
                          {draft.type === "Lehr" ? (
                            <input
                              className="form-control form-control-sm"
                              form="inline-service-form"
                              name="inlineVorradeBy"
                              list="people-list"
                              defaultValue={draft.vorradeBy}
                              placeholder="Type New"
                              aria-label="New Service Vorrade By"
                            />
                          ) : (
                            <span className="text-body-secondary">—</span>
                          )}
                        </td>
                        <td className="notes-column">
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineNotes"
                            defaultValue={draft.notes}
                            placeholder="Add Notes"
                            aria-label="New Service Notes"
                          />
                        </td>
                        <td className="status-column">
                          {draft.type === "Lehr" ? (
                            <select
                              className="form-select form-select-sm"
                              form="inline-service-form"
                              name="inlineStatus"
                              defaultValue={draft.status}
                              aria-label="New Lehr Status"
                            >
                              <option value="">No Status</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="FINISHED">Finished</option>
                            </select>
                          ) : (
                            <span className="text-body-secondary">—</span>
                          )}
                        </td>
                        <td className="actions-column">
                          <span className="inline-entry-actions">
                            <button
                              form="inline-service-form"
                              type="submit"
                              className="btn btn-primary btn-sm"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={clearInline}
                            >
                              Clear
                            </button>
                          </span>
                        </td>
                      </tr>

                      {visible.map((service) => (
                        <tr
                          className="service-row"
                          key={service.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openService(service)}
                          onKeyDown={(event) =>
                            (event.key === "Enter" || event.key === " ") &&
                            openService(service)
                          }
                        >
                          <td className="service-date date-column">
                            <strong>{service.date}</strong>
                            <small>{service.day}</small>
                          </td>
                          <td className="type-column">
                            <span
                              className={`badge ${service.type === "Lehr" ? "text-bg-primary" : "text-bg-warning"}`}
                            >
                              {service.type}
                            </span>
                          </td>
                          <td className="song-column">
                            {service.song ? (
                              <button
                                className="btn btn-link register-record-link"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openSongFromRegister(service.song);
                                }}
                              >
                                {service.song}
                              </button>
                            ) : null}
                          </td>
                          <td className="person-column">{service.songBy}</td>
                          <td className="fw-semibold text-column">
                            <button
                              className="btn btn-link register-record-link fw-semibold"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openTextFromRegister(service.text);
                              }}
                            >
                              {service.text}
                            </button>
                          </td>
                          <td className="person-column">{service.textBy}</td>
                          <td className="vorrade-column">{service.vorrade}</td>
                          <td className="person-column">{service.vorradeBy}</td>
                          <td className="note-cell notes-column">{service.notes}</td>
                          <td className="status-column">
                            {service.status && (
                              <span className="badge text-bg-secondary">
                                {service.status}
                              </span>
                            )}
                          </td>
                          <td className="actions-column" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="list-group list-group-flush mobile-service-list">
                  {visible.map((service) => (
                    <div
                      className="list-group-item list-group-item-action p-3"
                      key={service.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openService(service)}
                      onKeyDown={(event) =>
                        (event.key === "Enter" || event.key === " ") &&
                        openService(service)
                      }
                    >
                      <span className="d-flex justify-content-between gap-3">
                        <strong>
                          {service.day}, {service.date}
                        </strong>
                        <span
                          className={`badge ${service.type === "Lehr" ? "text-bg-primary" : "text-bg-warning"}`}
                        >
                          {service.type}
                        </span>
                      </span>
                      <button
                        className="btn btn-link register-record-link d-block fw-semibold mt-3"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openTextFromRegister(service.text);
                        }}
                      >
                        {service.text}
                      </button>
                      {(service.song || service.textBy) && (
                        <small className="d-block text-body-secondary mt-1">
                          {service.song && (
                            <button
                              className="btn btn-link register-record-link small-link"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openSongFromRegister(service.song);
                              }}
                            >
                              {service.song}
                            </button>
                          )}
                          {service.song && service.textBy ? " · " : ""}
                          {service.textBy}
                        </small>
                      )}
                      {service.type === "Lehr" && service.vorrade && (
                        <small className="d-block text-body-secondary mt-1">
                          {[service.vorrade, service.vorradeBy]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      )}
                      {service.status && (
                        <span className="badge text-bg-secondary mt-2">
                          {service.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {!visible.length && (
                  <div className="card-body text-center text-body-secondary py-5">
                    <i className="bi bi-inbox fs-2 d-block mb-2" />
                    No Services Match Your Search.
                  </div>
                )}
              </div>
            ) : active === "Texts" ? (
              <div className="card card-primary card-outline shadow-sm texts-card">
                <div className="card-header border-bottom">
                  <div className="row g-2 align-items-center">
                    <div className="col-12 col-md">
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="bi bi-search" />
                        </span>
                        <input
                          className="form-control"
                          value={textQuery}
                          onChange={(event) => setTextQuery(event.target.value)}
                          placeholder="Search Texts, Descriptions, Scripture References, Or Notes"
                          aria-label="Search Texts"
                        />
                      </div>
                    </div>
                    <div className="col-8 d-md-none">
                      <select
                        className="form-select"
                        value={textSort}
                        onChange={(event) => {
                          const field = event.target.value as TextSortField;
                          setTextSort(field);
                          setTextSortDirection(field === "text" ? "asc" : "desc");
                        }}
                        aria-label="Sort Texts By"
                      >
                        <option value="text">Sort By Text</option>
                        <option value="timesUsed">Sort By Times Used</option>
                        <option value="lastUsed">Sort By Last Used</option>
                      </select>
                    </div>
                    <div className="col-4 d-md-none">
                      <button
                        className="btn btn-outline-secondary w-100"
                        type="button"
                        onClick={() =>
                          setTextSortDirection((current) =>
                            current === "asc" ? "desc" : "asc",
                          )
                        }
                        aria-label={
                          textSortDirection === "asc"
                            ? "Sort Descending"
                            : "Sort Ascending"
                        }
                      >
                        <i
                          className={`bi ${
                            textSortDirection === "asc"
                              ? "bi-sort-up"
                              : "bi-sort-down"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="col-auto">
                      <span className="badge text-bg-primary rounded-pill">
                        {visibleTexts.length} Texts
                      </span>
                    </div>
                    <div className="col-auto">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => {
                          setTextError("");
                          setTextAttachments([]);
                          setTextEditor("new");
                        }}
                      >
                        <i className="bi bi-plus-lg me-1" />
                        Add Text
                      </button>
                    </div>
                  </div>
                </div>

                {textError && !textEditor && (
                  <div className="alert alert-danger m-3 mb-0" role="alert">
                    <i className="bi bi-exclamation-triangle-fill me-2" />
                    {textError}
                  </div>
                )}

                <div className="table-responsive desktop-texts-table">
                  <table className="table table-hover align-middle mb-0 texts-table">
                    <thead className="table-light">
                      <tr>
                        <th
                          aria-sort={
                            textSort === "text"
                              ? textSortDirection === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            className="sort-header-button"
                            type="button"
                            onClick={() => changeTextSort("text")}
                          >
                            Text
                            {textSort === "text" && (
                              <i
                                className={`bi ${
                                  textSortDirection === "asc"
                                    ? "bi-caret-up-fill"
                                    : "bi-caret-down-fill"
                                }`}
                              />
                            )}
                          </button>
                        </th>
                        <th>Description</th>
                        <th>Scripture Reference</th>
                        <th
                          className="text-center"
                          aria-sort={
                            textSort === "timesUsed"
                              ? textSortDirection === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            className="sort-header-button justify-content-center"
                            type="button"
                            onClick={() => changeTextSort("timesUsed")}
                          >
                            Times Used
                            {textSort === "timesUsed" && (
                              <i
                                className={`bi ${
                                  textSortDirection === "asc"
                                    ? "bi-caret-up-fill"
                                    : "bi-caret-down-fill"
                                }`}
                              />
                            )}
                          </button>
                        </th>
                        <th
                          aria-sort={
                            textSort === "lastUsed"
                              ? textSortDirection === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            className="sort-header-button"
                            type="button"
                            onClick={() => changeTextSort("lastUsed")}
                          >
                            Last Used
                            {textSort === "lastUsed" && (
                              <i
                                className={`bi ${
                                  textSortDirection === "asc"
                                    ? "bi-caret-up-fill"
                                    : "bi-caret-down-fill"
                                }`}
                              />
                            )}
                          </button>
                        </th>
                        <th>Notes</th>
                        <th className="text-center">PDFs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTexts.map((record) => (
                        <tr
                          className="service-row"
                          key={record.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openTextEditor(record)}
                          onKeyDown={(event) =>
                            (event.key === "Enter" || event.key === " ") &&
                            openTextEditor(record)
                          }
                        >
                          <td className="fw-semibold text-name-cell">
                            {record.text}
                          </td>
                          <td className="text-description-cell">
                            {record.description}
                          </td>
                          <td className="scripture-reference-cell">
                            {firstLine(record.scriptureReference)}
                          </td>
                          <td className="text-center">{record.timesUsed}</td>
                          <td>{record.lastUsed}</td>
                          <td className="note-cell">{record.notes}</td>
                          <td className="text-center">
                            {record.attachmentCount ? (
                              <span className="badge text-bg-light border">
                                <i className="bi bi-file-earmark-pdf me-1" />
                                {record.attachmentCount}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="list-group list-group-flush mobile-text-list">
                  {visibleTexts.map((record) => (
                    <button
                      type="button"
                      className="list-group-item list-group-item-action p-3 text-start"
                      key={record.id}
                      onClick={() => openTextEditor(record)}
                    >
                      <strong className="d-block">{record.text}</strong>
                      {record.description && (
                        <span className="d-block text-body-secondary mt-1">
                          {record.description}
                        </span>
                      )}
                      {record.scriptureReference && (
                        <span className="badge text-bg-light border mt-2">
                          {firstLine(record.scriptureReference)}
                        </span>
                      )}
                      <small className="d-block text-body-secondary mt-2">
                        {record.timesUsed} Times Used · Last Used {record.lastUsed}
                        {record.attachmentCount
                          ? ` · ${record.attachmentCount} PDFs`
                          : ""}
                      </small>
                    </button>
                  ))}
                </div>

                {!visibleTexts.length && (
                  <div className="card-body text-center text-body-secondary py-5">
                    <i className="bi bi-journal-text fs-2 d-block mb-2" />
                    No Texts Match Your Search.
                  </div>
                )}
              </div>
            ) : active === "Songs" ? (
              <div className="card card-primary card-outline shadow-sm songs-card">
                <div className="card-header border-bottom">
                  <div className="row g-2 align-items-center">
                    <div className="col-12 col-md">
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="bi bi-search" />
                        </span>
                        <input
                          className="form-control"
                          value={songQuery}
                          onChange={(event) => setSongQuery(event.target.value)}
                          placeholder="Search Titles, Tags, Or Notes"
                          aria-label="Search Songs"
                        />
                      </div>
                    </div>
                    <div className="col-8 d-md-none">
                      <select
                        className="form-select"
                        value={songSort}
                        onChange={(event) => {
                          const field = event.target.value as SongSortField;
                          setSongSort(field);
                          setSongSortDirection(field === "timesUsed" ? "desc" : "asc");
                        }}
                        aria-label="Sort Songs By"
                      >
                        <option value="title">Sort By Title</option>
                        <option value="tags">Sort By Tags</option>
                        <option value="timesUsed">Sort By Times Used</option>
                      </select>
                    </div>
                    <div className="col-4 d-md-none">
                      <button
                        className="btn btn-outline-secondary w-100"
                        type="button"
                        onClick={() =>
                          setSongSortDirection((current) =>
                            current === "asc" ? "desc" : "asc",
                          )
                        }
                        aria-label={
                          songSortDirection === "asc"
                            ? "Sort Descending"
                            : "Sort Ascending"
                        }
                      >
                        <i
                          className={`bi ${
                            songSortDirection === "asc"
                              ? "bi-sort-up"
                              : "bi-sort-down"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="col-auto">
                      <span className="badge text-bg-primary rounded-pill">
                        {visibleSongs.length} Songs
                      </span>
                    </div>
                    <div className="col-auto">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => {
                          setSongError("");
                          setSongEditor("new");
                        }}
                      >
                        <i className="bi bi-plus-lg me-1" />
                        Add Song
                      </button>
                    </div>
                  </div>
                </div>

                {songError && (
                  <div className="alert alert-danger m-3 mb-0" role="alert">
                    <i className="bi bi-exclamation-triangle-fill me-2" />
                    {songError}
                  </div>
                )}

                <div className="table-responsive desktop-songs-table">
                  <table className="table table-hover align-middle mb-0 songs-table">
                    <thead className="table-light">
                      <tr>
                        <th
                          aria-sort={
                            songSort === "title"
                              ? songSortDirection === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            className="sort-header-button"
                            type="button"
                            onClick={() => changeSongSort("title")}
                          >
                            Title
                            {songSort === "title" && (
                              <i
                                className={`bi ${
                                  songSortDirection === "asc"
                                    ? "bi-caret-up-fill"
                                    : "bi-caret-down-fill"
                                }`}
                              />
                            )}
                          </button>
                        </th>
                        <th
                          aria-sort={
                            songSort === "tags"
                              ? songSortDirection === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            className="sort-header-button"
                            type="button"
                            onClick={() => changeSongSort("tags")}
                          >
                            Tags
                            {songSort === "tags" && (
                              <i
                                className={`bi ${
                                  songSortDirection === "asc"
                                    ? "bi-caret-up-fill"
                                    : "bi-caret-down-fill"
                                }`}
                              />
                            )}
                          </button>
                        </th>
                        <th
                          className="text-center"
                          aria-sort={
                            songSort === "timesUsed"
                              ? songSortDirection === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            className="sort-header-button justify-content-center"
                            type="button"
                            onClick={() => changeSongSort("timesUsed")}
                          >
                            Times Used
                            {songSort === "timesUsed" && (
                              <i
                                className={`bi ${
                                  songSortDirection === "asc"
                                    ? "bi-caret-up-fill"
                                    : "bi-caret-down-fill"
                                }`}
                              />
                            )}
                          </button>
                        </th>
                        <th>Last Used</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSongs.map((song) => (
                        <tr
                          className="service-row"
                          key={song.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSongError("");
                            setSongEditor(song);
                          }}
                          onKeyDown={(event) =>
                            (event.key === "Enter" || event.key === " ") &&
                            setSongEditor(song)
                          }
                        >
                          <td className="fw-semibold">{song.title}</td>
                          <td>
                            <span className="d-flex flex-wrap gap-1">
                              {song.tags
                                .split(",")
                                .map((tag) => tag.trim())
                                .filter(Boolean)
                                .map((tag) => (
                                  <span className="badge text-bg-light border" key={tag}>
                                    {tag}
                                  </span>
                                ))}
                            </span>
                          </td>
                          <td className="text-center">{song.timesUsed}</td>
                          <td>{song.lastUsed}</td>
                          <td className="note-cell">{song.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="list-group list-group-flush mobile-song-list">
                  {visibleSongs.map((song) => (
                    <button
                      type="button"
                      className="list-group-item list-group-item-action p-3 text-start"
                      key={song.id}
                      onClick={() => {
                        setSongError("");
                        setSongEditor(song);
                      }}
                    >
                      <strong className="d-block">{song.title}</strong>
                      {song.tags && (
                        <span className="d-flex flex-wrap gap-1 mt-2">
                          {song.tags
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean)
                            .map((tag) => (
                              <span className="badge text-bg-light border" key={tag}>
                                {tag}
                              </span>
                            ))}
                        </span>
                      )}
                      <small className="d-block text-body-secondary mt-2">
                        {song.timesUsed} Times Used · Last Used {song.lastUsed}
                      </small>
                      {song.notes && (
                        <span className="d-block text-body-secondary mt-2">
                          {song.notes}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {!visibleSongs.length && (
                  <div className="card-body text-center text-body-secondary py-5">
                    <i className="bi bi-music-note-list fs-2 d-block mb-2" />
                    No Songs Match Your Search.
                  </div>
                )}
              </div>
            ) : (
              <div className="card card-outline card-primary shadow-sm">
                <div className="card-body empty-state">
                  <div className="empty-state-icon">
                    <i className={`bi ${navItems.find((item) => item.label === active)?.icon}`} />
                  </div>
                  <h4>{active}</h4>
                  <p className="text-body-secondary mb-0">
                    This Reusable-Record View Is Ready For The Next Development Stage.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <span className="float-end d-none d-sm-inline app-version">
          Version {__APP_VERSION__}
        </span>
          <strong>Sermon Register</strong> · Private SQLite Storage
      </footer>

      <nav className="mobile-tabbar nav nav-pills nav-fill border-top shadow-lg">
        {navItems.slice(0, 4).map((item) => (
          <button
            type="button"
            key={item.label}
            className={`nav-link ${active === item.label ? "active" : ""}`}
            onClick={() => changeSection(item.label)}
          >
            <i className={`bi ${item.icon}`} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {open && (
        <div
          className="modal fade show d-block service-form-modal"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-service-title"
        >
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <div>
                  <small className="text-uppercase text-body-secondary">
                    Register Entry
                  </small>
                  <h5 className="modal-title" id="new-service-title">
                    New Service
                  </h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                />
              </div>
              <form onSubmit={save}>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="service-date">
                        Date
                      </label>
                      <input
                        className="form-control"
                        id="service-date"
                        name="date"
                        type="date"
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="service-type">
                        Service Type
                      </label>
                      <select
                        className="form-select"
                        id="service-type"
                        value={kind}
                        onChange={(event) =>
                          setKind(event.target.value as EntryType)
                        }
                        required
                      >
                        <option value="">Choose Type</option>
                        <option>Lehr</option>
                        <option>Gebet</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="service-song">
                        Song
                      </label>
                      <input
                        className="form-control"
                        id="service-song"
                        name="song"
                        list="songs-list"
                        placeholder="Type A New Song"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="service-song-by">
                        Song By
                      </label>
                      <input
                        className="form-control"
                        id="service-song-by"
                        name="songBy"
                        list="people-list"
                        placeholder="Type A New Person"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="service-text">
                        Text
                      </label>
                      <input
                        className="form-control"
                        id="service-text"
                        name="text"
                        list="texts-list"
                        placeholder="Type A New Text"
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="service-text-by">
                        Text By
                      </label>
                      <input
                        className="form-control"
                        id="service-text-by"
                        name="textBy"
                        list="people-list"
                        placeholder="Type A New Person"
                      />
                    </div>
                    {kind === "Lehr" && (
                      <>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="service-vorrade">
                            Vorrade
                          </label>
                          <input
                            className="form-control"
                            id="service-vorrade"
                            name="vorrade"
                            list="vorraden-list"
                            placeholder="Type A New Vorrade"
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="service-vorrade-by">
                            Vorrade By
                          </label>
                          <input
                            className="form-control"
                            id="service-vorrade-by"
                            name="vorradeBy"
                            list="people-list"
                            placeholder="Type A New Person"
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="service-status">
                            Lehr Status
                          </label>
                          <select
                            className="form-select"
                            id="service-status"
                            name="status"
                            defaultValue=""
                          >
                            <option value="">No Status</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="FINISHED">Finished</option>
                          </select>
                        </div>
                      </>
                    )}
                    {kind === "Gebet" && (
                      <>
                        <div className="col-12">
                          <div className="alert alert-info mb-0">
                            <i className="bi bi-link-45deg me-2" />
                            The Most Recent Earlier Lehr With The Same Text From
                            The Previous Year Will Be Linked Automatically.
                          </div>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="service-linked-status">
                            Lehr Status
                          </label>
                          <select
                            className="form-select"
                            id="service-linked-status"
                            name="status"
                            defaultValue="IN_PROGRESS"
                          >
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="FINISHED">Finished</option>
                          </select>
                          <div className="form-text">
                            Choose Finished On The Gebet That Completes The Lehr.
                          </div>
                        </div>
                      </>
                    )}
                    <div className="col-12">
                      <label className="form-label" htmlFor="service-notes">
                        Notes
                      </label>
                      <textarea
                        className="form-control"
                        id="service-notes"
                        name="notes"
                        rows={3}
                        placeholder="Notes For This Service"
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" type="submit">
                    <i className="bi bi-check-lg me-1" />
                    Save Service
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="modal fade show d-block service-edit-modal"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-service-title"
        >
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content card card-primary card-outline mb-0">
              <div className="modal-header">
                <div>
                  <small className="text-uppercase text-body-secondary">
                    Existing Register Entry
                  </small>
                  <h5 className="modal-title" id="edit-service-title">
                    Edit Service
                  </h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close Editor"
                  onClick={() => setSelected(null)}
                />
              </div>
              <form key={selected.id} onSubmit={saveEdit}>
                <div className="modal-body">
                  {saveError && (
                    <div className="alert alert-danger" role="alert">
                      <i className="bi bi-exclamation-triangle-fill me-2" />
                      {saveError}
                    </div>
                  )}
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="edit-service-date">
                        Date
                      </label>
                      <input
                        className="form-control"
                        id="edit-service-date"
                        name="editDate"
                        type="date"
                        defaultValue={selected.dateValue}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="edit-service-type">
                        Service Type
                      </label>
                      <select
                        className="form-select"
                        id="edit-service-type"
                        name="editType"
                        value={editKind}
                        onChange={(event) =>
                          setEditKind(event.target.value as EntryType)
                        }
                        required
                      >
                        <option>Lehr</option>
                        <option>Gebet</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="edit-service-song">
                        Song
                      </label>
                      <input
                        className="form-control"
                        id="edit-service-song"
                        name="editSong"
                        list="songs-list"
                        defaultValue={selected.song}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="edit-service-song-by">
                        Song By
                      </label>
                      <input
                        className="form-control"
                        id="edit-service-song-by"
                        name="editSongBy"
                        list="people-list"
                        defaultValue={selected.songBy}
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="edit-service-text">
                        Text
                      </label>
                      <input
                        className="form-control"
                        id="edit-service-text"
                        name="editText"
                        list="texts-list"
                        defaultValue={selected.text}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="edit-service-text-by">
                        Text By
                      </label>
                      <input
                        className="form-control"
                        id="edit-service-text-by"
                        name="editTextBy"
                        list="people-list"
                        defaultValue={selected.textBy}
                      />
                    </div>
                    {editKind === "Lehr" && (
                      <>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="edit-service-vorrade">
                            Vorrade
                          </label>
                          <input
                            className="form-control"
                            id="edit-service-vorrade"
                            name="editVorrade"
                            list="vorraden-list"
                            defaultValue={selected.vorrade === "—" ? "" : selected.vorrade}
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="edit-service-status">
                            Lehr Status
                          </label>
                          <select
                            className="form-select"
                            id="edit-service-status"
                            name="editStatus"
                            defaultValue={
                              selected.status === "Finished"
                                ? "FINISHED"
                                : selected.status === "In Progress"
                                  ? "IN_PROGRESS"
                                  : ""
                            }
                          >
                            <option value="">No Status</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="FINISHED">Finished</option>
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="edit-service-vorrade-by">
                            Vorrade By
                          </label>
                          <input
                            className="form-control"
                            id="edit-service-vorrade-by"
                            name="editVorradeBy"
                            list="people-list"
                            defaultValue={
                              selected.vorradeBy === "—" ? "" : selected.vorradeBy
                            }
                          />
                        </div>
                      </>
                    )}
                    {editKind === "Gebet" && (
                      <>
                        <div className="col-12">
                          <div className="form-label">Automatically Linked Lehr</div>
                          {selected.linkedLehrId ? (
                            <div className="card bg-body-tertiary border-0 mb-0">
                              <div className="card-body py-2 px-3">
                                <strong>{selected.linkedLehrText}</strong>
                                <span className="text-body-secondary ms-2">
                                  {selected.linkedLehrDate}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="alert alert-warning mb-0">
                              No Earlier Lehr With The Same Text Was Found Within
                              The Previous Year.
                            </div>
                          )}
                          <div className="form-text">
                            The Match Is Updated Automatically When You Save.
                          </div>
                        </div>
                        <div className="col-md-6">
                          <label
                            className="form-label"
                            htmlFor="edit-service-linked-status"
                          >
                            Lehr Status
                          </label>
                          <select
                            className="form-select"
                            id="edit-service-linked-status"
                            name="editStatus"
                            defaultValue={
                              selected.status === "Finished"
                                ? "FINISHED"
                                : "IN_PROGRESS"
                            }
                          >
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="FINISHED">Finished</option>
                          </select>
                          <div className="form-text">
                            Choose Finished When This Gebet Completes The Linked Lehr.
                          </div>
                        </div>
                      </>
                    )}
                    <div className={editKind === "Lehr" ? "col-md-6" : "col-12"}>
                      <label className="form-label" htmlFor="edit-service-notes">
                        Notes
                      </label>
                      <textarea
                        className="form-control"
                        id="edit-service-notes"
                        name="editNotes"
                        rows={3}
                        defaultValue={selected.notes}
                      />
                    </div>
                  </div>

                  <div className="card bg-body-tertiary border-0 mt-4 mb-0">
                    <div className="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
                      <div>
                        <h6 className="mb-1">
                          <i className="bi bi-file-earmark-pdf me-2" />
                          PDF Attachments
                        </h6>
                        <small className="text-body-secondary">
                          Documents For This Service Stay Private.
                        </small>
                      </div>
                      <button className="btn btn-outline-primary btn-sm" type="button">
                        <i className="bi bi-plus-lg me-1" />
                        Add PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="modal-footer justify-content-between">
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={deleteSelectedService}
                  >
                    <i className="bi bi-trash3 me-1" />
                    Delete Service
                  </button>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setSelected(null)}
                    >
                      Cancel
                    </button>
                    <button className="btn btn-primary" type="submit">
                      <i className="bi bi-check-lg me-1" />
                      Save Changes
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {songEditor && (
        <div
          className="modal fade show d-block service-edit-modal"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="song-editor-title"
        >
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content card card-primary card-outline mb-0">
              <div className="modal-header">
                <div>
                  <small className="text-uppercase text-body-secondary">
                    Reusable Song Record
                  </small>
                  <h5 className="modal-title" id="song-editor-title">
                    {songEditor === "new" ? "Add Song" : "Edit Song"}
                  </h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close Song Editor"
                  onClick={() => setSongEditor(null)}
                />
              </div>
              <form key={songEditor === "new" ? "new" : songEditor.id} onSubmit={saveSong}>
                <div className="modal-body">
                  {songError && (
                    <div className="alert alert-danger" role="alert">
                      <i className="bi bi-exclamation-triangle-fill me-2" />
                      {songError}
                    </div>
                  )}
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" htmlFor="song-title">
                        Title
                      </label>
                      <input
                        className="form-control"
                        id="song-title"
                        name="songTitle"
                        defaultValue={songEditor === "new" ? "" : songEditor.title}
                        placeholder="Include The Song Number In The Title"
                        required
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="song-tags">
                        Tags
                      </label>
                      <input
                        className="form-control"
                        id="song-tags"
                        name="songTags"
                        defaultValue={songEditor === "new" ? "" : songEditor.tags}
                        placeholder="Christmas, Faith, Easter"
                      />
                      <div className="form-text">
                        Separate Multiple Tags With Commas.
                      </div>
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="song-notes">
                        Notes
                      </label>
                      <textarea
                        className="form-control"
                        id="song-notes"
                        name="songNotes"
                        rows={4}
                        defaultValue={songEditor === "new" ? "" : songEditor.notes}
                        placeholder="Notes About This Song"
                      />
                    </div>
                    {songEditor !== "new" && (
                      <div className="col-12">
                        <div className="card bg-body-tertiary border-0 mb-0">
                          <div className="card-body d-flex flex-wrap gap-4 py-3">
                            <span>
                              <strong>{songEditor.timesUsed}</strong>
                              <span className="text-body-secondary ms-2">Times Used</span>
                            </span>
                            <span>
                              <strong>{songEditor.lastUsed}</strong>
                              <span className="text-body-secondary ms-2">Last Used</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setSongEditor(null)}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" type="submit">
                    <i className="bi bi-check-lg me-1" />
                    Save Song
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {textEditor && (
        <div
          className="modal fade show d-block service-edit-modal"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="text-editor-title"
        >
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content card card-primary card-outline mb-0">
              <div className="modal-header">
                <div>
                  <small className="text-uppercase text-body-secondary">
                    Reusable Text Record
                  </small>
                  <h5 className="modal-title" id="text-editor-title">
                    {textEditor === "new" ? "Add Text" : "Edit Text"}
                  </h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close Text Editor"
                  onClick={() => setTextEditor(null)}
                />
              </div>
              <form
                key={textEditor === "new" ? "new" : textEditor.id}
                onSubmit={saveText}
              >
                <div className="modal-body">
                  {textError && (
                    <div className="alert alert-danger" role="alert">
                      <i className="bi bi-exclamation-triangle-fill me-2" />
                      {textError}
                    </div>
                  )}
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" htmlFor="text-text">
                        Text
                      </label>
                      <input
                        className="form-control"
                        id="text-text"
                        name="textText"
                        defaultValue={textEditor === "new" ? "" : textEditor.text}
                        placeholder="Text Name"
                        required
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="text-description">
                        Description
                      </label>
                      <input
                        className="form-control"
                        id="text-description"
                        name="textDescription"
                        defaultValue={
                          textEditor === "new" ? "" : textEditor.description
                        }
                        placeholder="Description Of This Text"
                      />
                    </div>
                    <div className="col-12">
                      <label
                        className="form-label"
                        htmlFor="text-scripture-reference"
                      >
                        Scripture Reference
                      </label>
                      <textarea
                        className="form-control"
                        id="text-scripture-reference"
                        name="textScriptureReference"
                        rows={3}
                        defaultValue={
                          textEditor === "new"
                            ? ""
                            : textEditor.scriptureReference
                        }
                        placeholder="For Example, John 3:16"
                      />
                    </div>
                    <div className="col-12">
                      <label
                        className="form-label"
                        htmlFor="text-songs-for-text"
                      >
                        Songs For This Sermon
                      </label>
                      <textarea
                        className="form-control"
                        id="text-songs-for-text"
                        name="textSongsForText"
                        rows={3}
                        defaultValue={
                          textEditor === "new" ? "" : textEditor.songsForText
                        }
                        placeholder="Songs For This Sermon"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="text-notes">
                        Notes
                      </label>
                      <textarea
                        className="form-control"
                        id="text-notes"
                        name="textNotes"
                        rows={3}
                        defaultValue={textEditor === "new" ? "" : textEditor.notes}
                        placeholder="Notes About This Text"
                      />
                    </div>
                    {textEditor !== "new" && (
                      <div className="col-12">
                        <div className="card bg-body-tertiary border-0 mb-0">
                          <div className="card-body d-flex flex-wrap gap-4 py-3">
                            <span>
                              <strong>{textEditor.timesUsed}</strong>
                              <span className="text-body-secondary ms-2">
                                Times Used
                              </span>
                            </span>
                            <span>
                              <strong>{textEditor.lastUsed}</strong>
                              <span className="text-body-secondary ms-2">
                                Last Used
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="col-12">
                      <div className="card border mb-0">
                        <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                          <div>
                            <h6 className="mb-0">
                              <i className="bi bi-file-earmark-pdf me-2" />
                              Private PDF Attachments
                            </h6>
                            <small className="text-body-secondary">
                              Add More Than One PDF To This Text.
                            </small>
                          </div>
                          {textEditor !== "new" && (
                            <label
                              className={`btn btn-outline-primary btn-sm mb-0 ${
                                pdfUploading ? "disabled" : ""
                              }`}
                            >
                              <i className="bi bi-plus-lg me-1" />
                              {pdfUploading ? "Adding PDFs..." : "Add PDFs"}
                              <input
                                className="visually-hidden"
                                type="file"
                                accept="application/pdf,.pdf"
                                multiple
                                disabled={pdfUploading}
                                onChange={uploadTextPdfs}
                              />
                            </label>
                          )}
                        </div>
                        <div className="list-group list-group-flush">
                          {textEditor === "new" ? (
                            <div className="list-group-item text-body-secondary py-3">
                              Save The Text Before Adding PDFs.
                            </div>
                          ) : textAttachments.length ? (
                            textAttachments.map((attachment) => (
                              <div
                                className="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2"
                                key={attachment.id}
                              >
                                <div className="min-width-0">
                                  <strong className="d-block text-truncate">
                                    {attachment.original_file_name}
                                  </strong>
                                  <small className="text-body-secondary">
                                    {formatFileSize(attachment.byte_size)}
                                  </small>
                                </div>
                                <div className="btn-group btn-group-sm" role="group">
                                  <a
                                    className="btn btn-outline-primary"
                                    href={`${textAttachmentsApiUrl()}?fileId=${encodeURIComponent(attachment.id)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open
                                  </a>
                                  <a
                                    className="btn btn-outline-secondary"
                                    href={`${textAttachmentsApiUrl()}?fileId=${encodeURIComponent(attachment.id)}&download=1`}
                                  >
                                    Download
                                  </a>
                                  <button
                                    className="btn btn-outline-danger"
                                    type="button"
                                    onClick={() => removeTextAttachment(attachment)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="list-group-item text-body-secondary py-3">
                              No PDFs Attached Yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setTextEditor(null)}
                  >
                    Close
                  </button>
                  <button className="btn btn-primary" type="submit">
                    <i className="bi bi-check-lg me-1" />
                    Save Text
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <datalist id="songs-list">
        {songs.map((song) => (
          <option key={song.id} value={song.title}>
            {song.tags}
          </option>
        ))}
      </datalist>
      <datalist id="people-list" />
      <datalist id="texts-list">
        {texts.map((record) => (
          <option key={record.id} value={record.text}>
            {record.description}
          </option>
        ))}
      </datalist>
      <datalist id="vorraden-list" />
    </div>
  );
}
