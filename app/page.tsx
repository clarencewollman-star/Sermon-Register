"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

declare const __APP_VERSION__: string;

type Service = {
  id: string;
  date: string;
  day: string;
  type: "Lehr" | "Gebet";
  song: string;
  songBy: string;
  text: string;
  textBy: string;
  vorrade: string;
  status: string;
  notes: string;
};

type ApiService = {
  id: string;
  service_date: string;
  service_type: "LEHR" | "GEBET";
  song: string;
  song_by: string;
  text_title: string;
  text_by: string;
  vorrade: string | null;
  lehr_status: "IN_PROGRESS" | "FINISHED" | null;
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
  notes: "",
});

const apiUrl = () => "/api/services";

const fromApi = (row: ApiService): Service => {
  const date = new Date(`${row.service_date}T12:00:00`);
  return {
    id: row.id,
    date: date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    day: date.toLocaleDateString("en-US", { weekday: "long" }),
    type: row.service_type === "LEHR" ? "Lehr" : "Gebet",
    song: row.song,
    songBy: row.song_by,
    text: row.text_title,
    textBy: row.text_by,
    vorrade: row.vorrade || "—",
    status:
      row.lehr_status === "IN_PROGRESS"
        ? "In progress"
        : row.lehr_status === "FINISHED"
          ? "Finished"
          : "—",
    notes: row.notes || "",
  };
};

export default function Home() {
  const [active, setActive] = useState("Register");
  const [items, setItems] = useState<Service[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All services");
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [kind, setKind] = useState<EntryType>("");
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
          "The SQLite database could not be reached. Check the container logs.",
        ),
      );
  }, []);

  const visible = useMemo(
    () =>
      items.filter(
        (service) =>
          (filter === "All services" || service.type === filter) &&
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
    if (!response.ok) throw new Error(result.error || "Could not save service");
    setItems((current) => [fromApi(result), ...current]);
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
        notes: String(form.get("notes") || ""),
      });
      setOpen(false);
      setKind("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save service");
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
    const notes = String(form.get("inlineNotes") || "");
    if (!date || !type || !song || !songBy || !text || !textBy) {
      setSaveError(
        "Complete Date, Type, Song, Song By, Text, and Text By.",
      );
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
        notes,
      });
      sessionStorage.removeItem("sermon-register-service-draft");
      setDraft(blankDraft());
      setRowVersion((version) => version + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save service");
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
            aria-label="Open navigation"
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
              <span className="d-none d-sm-inline">New service</span>
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
          <nav className="mt-2" aria-label="Main navigation">
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
            Private SQLite register
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="app-main">
        <div className="app-content-header">
          <div className="container-fluid">
            <div className="row align-items-center">
              <div className="col-sm-6">
                <h3 className="mb-0">{active === "Register" ? "Service register" : active}</h3>
                <p className="text-body-secondary mb-0 mt-1">
                  {active === "Register"
                    ? "Weekly Lehr and Gebet history"
                    : `Reusable ${active.toLowerCase()} records`}
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
                          placeholder="Search texts, songs, people, or notes"
                          aria-label="Search services"
                        />
                      </div>
                    </div>
                    <div className="col-6 col-lg-auto">
                      <select
                        className="form-select"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        aria-label="Service type"
                      >
                        <option>All services</option>
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
                        {items.length} services
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
                        <th>Date</th>
                        <th>Type</th>
                        <th>Song</th>
                        <th>Song by</th>
                        <th>Text</th>
                        <th>Text by</th>
                        <th>Vorrade</th>
                        <th>Status</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        className="inline-entry-row"
                        key={rowVersion}
                        onInput={persistInlineDraft}
                      >
                        <td>
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineDate"
                            type="date"
                            defaultValue={draft.date}
                            aria-label="New service date"
                          />
                        </td>
                        <td>
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
                            aria-label="New service type"
                          >
                            <option value="">Choose type</option>
                            <option>Lehr</option>
                            <option>Gebet</option>
                          </select>
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineSong"
                            list="songs-list"
                            defaultValue={draft.song}
                            placeholder="Type new"
                            aria-label="New service song"
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineSongBy"
                            list="people-list"
                            defaultValue={draft.songBy}
                            placeholder="Type new"
                            aria-label="New service song by"
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineText"
                            list="texts-list"
                            defaultValue={draft.text}
                            placeholder="Type new"
                            aria-label="New service text"
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineTextBy"
                            list="people-list"
                            defaultValue={draft.textBy}
                            placeholder="Type new"
                            aria-label="New service text by"
                          />
                        </td>
                        <td>
                          {draft.type === "Lehr" ? (
                            <input
                              className="form-control form-control-sm"
                              form="inline-service-form"
                              name="inlineVorrade"
                              list="vorraden-list"
                              defaultValue={draft.vorrade}
                              placeholder="Type new"
                              aria-label="New service Vorrade"
                            />
                          ) : (
                            <span className="text-body-secondary">—</span>
                          )}
                        </td>
                        <td>
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
                        <td>
                          <input
                            className="form-control form-control-sm"
                            form="inline-service-form"
                            name="inlineNotes"
                            defaultValue={draft.notes}
                            placeholder="Add notes"
                            aria-label="New service notes"
                          />
                        </td>
                      </tr>

                      {visible.map((service) => (
                        <tr
                          className="service-row"
                          key={service.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelected(service)}
                          onKeyDown={(event) =>
                            (event.key === "Enter" || event.key === " ") &&
                            setSelected(service)
                          }
                        >
                          <td className="service-date">
                            <strong>{service.date}</strong>
                            <small>{service.day}</small>
                          </td>
                          <td>
                            <span
                              className={`badge ${service.type === "Lehr" ? "text-bg-primary" : "text-bg-warning"}`}
                            >
                              {service.type}
                            </span>
                          </td>
                          <td>{service.song}</td>
                          <td>{service.songBy}</td>
                          <td className="fw-semibold">{service.text}</td>
                          <td>{service.textBy}</td>
                          <td>{service.vorrade}</td>
                          <td>
                            <span className="badge text-bg-secondary">
                              {service.status}
                            </span>
                          </td>
                          <td className="note-cell">{service.notes}</td>
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
                      onClick={() => setSelected(service)}
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
                      <small className="d-block text-body-secondary mt-1">
                        {service.song} · {service.textBy}
                      </small>
                      <span className="badge text-bg-secondary mt-2">
                        {service.status}
                      </span>
                    </button>
                  ))}
                </div>

                {!visible.length && (
                  <div className="card-body text-center text-body-secondary py-5">
                    <i className="bi bi-inbox fs-2 d-block mb-2" />
                    No services match your search.
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
                    This reusable-record view is ready for the next development stage.
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
        <strong>Sermon Register</strong> · Private SQLite storage
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
            {item.label}
          </button>
        ))}
      </nav>

      {open && (
        <div
          className="modal fade show d-block"
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
                    Register entry
                  </small>
                  <h5 className="modal-title" id="new-service-title">
                    New service
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
                        Service type
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
                        <option value="">Choose type</option>
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
                        placeholder="Type a new song"
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="service-song-by">
                        Song by
                      </label>
                      <input
                        className="form-control"
                        id="service-song-by"
                        name="songBy"
                        list="people-list"
                        placeholder="Type a new person"
                        required
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
                        placeholder="Type a new text"
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="service-text-by">
                        Text by
                      </label>
                      <input
                        className="form-control"
                        id="service-text-by"
                        name="textBy"
                        list="people-list"
                        placeholder="Type a new person"
                        required
                      />
                    </div>
                    {kind === "Lehr" && (
                      <div className="col-md-6">
                        <label className="form-label" htmlFor="service-vorrade">
                          Vorrade
                        </label>
                        <input
                          className="form-control"
                          id="service-vorrade"
                          name="vorrade"
                          list="vorraden-list"
                          placeholder="Type a new Vorrade"
                        />
                      </div>
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
                        placeholder="Notes for this service"
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
                    Save service
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <>
          <aside
            className="offcanvas offcanvas-end show service-detail"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-detail-title"
          >
            <div className="offcanvas-header border-bottom">
              <div>
                <span
                  className={`badge ${selected.type === "Lehr" ? "text-bg-primary" : "text-bg-warning"}`}
                >
                  {selected.type}
                </span>
                <h5 className="offcanvas-title mt-2" id="service-detail-title">
                  {selected.text}
                </h5>
                <small className="text-body-secondary">
                  {selected.day}, {selected.date}
                </small>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Close details"
                onClick={() => setSelected(null)}
              />
            </div>
            <div className="offcanvas-body">
              <dl className="detail-list">
                {[
                  ["Song", selected.song],
                  ["Song by", selected.songBy],
                  ["Text by", selected.textBy],
                  ["Vorrade", selected.vorrade],
                  ["Status", selected.status],
                  ["Notes", selected.notes],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              <div className="card bg-body-tertiary border-0 mt-4">
                <div className="card-body">
                  <h6 className="card-title">
                    <i className="bi bi-file-earmark-pdf me-2" />
                    PDF attachments
                  </h6>
                  <p className="card-text small text-body-secondary">
                    Documents for this service stay private.
                  </p>
                  <button className="btn btn-primary btn-sm" type="button">
                    <i className="bi bi-plus-lg me-1" />
                    Add PDF
                  </button>
                </div>
              </div>
            </div>
          </aside>
          <button
            type="button"
            className="offcanvas-backdrop fade show detail-backdrop"
            aria-label="Close service details"
            onClick={() => setSelected(null)}
          />
        </>
      )}

      <datalist id="songs-list" />
      <datalist id="people-list" />
      <datalist id="texts-list" />
      <datalist id="vorraden-list" />
    </div>
  );
}
