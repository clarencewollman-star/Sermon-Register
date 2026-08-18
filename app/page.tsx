"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

type EntryType = "" | "Lehr" | "Gebet";

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

export default function Home() {
  const [active, setActive] = useState("Register");
  const [items, setItems] = useState<Service[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All Services");
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [kind, setKind] = useState<EntryType>("");
  const [editKind, setEditKind] = useState<EntryType>("");
  const [selected, setSelected] = useState<Service | null>(null);
  const [rowVersion, setRowVersion] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [draft, setDraft] = useState(blankDraft);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
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
          Object.values(service)
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [items, query, filter],
  );

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
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could Not Delete Service");
    }
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
            <button className="btn btn-primary" type="button" onClick={startNew}>
              <i className="bi bi-plus-lg me-1" />
              <span className="d-none d-sm-inline">New Service</span>
              <span className="d-sm-none">New</span>
            </button>
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
                      <select className="form-select" aria-label="Year">
                        <option>2026</option>
                        <option>2025</option>
                      </select>
                    </div>
                    <div className="col-auto ms-lg-auto">
                      <span className="badge text-bg-primary rounded-pill">
                        {items.length} Services
                      </span>
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
                          <td className="song-column">{service.song}</td>
                          <td className="person-column">{service.songBy}</td>
                          <td className="fw-semibold text-column">{service.text}</td>
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
                    <button
                      type="button"
                      className="list-group-item list-group-item-action p-3"
                      key={service.id}
                      onClick={() => openService(service)}
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
                      <span className="d-block fw-semibold mt-3">{service.text}</span>
                      {(service.song || service.textBy) && (
                        <small className="d-block text-body-secondary mt-1">
                          {[service.song, service.textBy].filter(Boolean).join(" · ")}
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
                    </button>
                  ))}
                </div>

                {!visible.length && (
                  <div className="card-body text-center text-body-secondary py-5">
                    <i className="bi bi-inbox fs-2 d-block mb-2" />
                    No Services Match Your Search.
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

      <datalist id="songs-list" />
      <datalist id="people-list" />
      <datalist id="texts-list" />
      <datalist id="vorraden-list" />
    </div>
  );
}
