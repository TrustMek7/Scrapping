import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  fetchAlerts,
  fetchEntities,
  fetchSources,
  type AlertListItem,
  type MonitoredEntityItem,
  type SourceItem,
} from "../../lib/api";

const MAX_RESULTS_PER_GROUP = 5;

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [entities, setEntities] = useState<MonitoredEntityItem[]>([]);
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSources().then(setSources).catch(() => setSources([]));
    fetchEntities().then(setEntities).catch(() => setEntities([]));
    fetchAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const matchedSources = q
    ? sources.filter((s) => s.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS_PER_GROUP)
    : [];
  const matchedEntities = q
    ? entities
        .filter((e) => e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)))
        .slice(0, MAX_RESULTS_PER_GROUP)
    : [];
  const matchedAlerts = q
    ? alerts
        .filter(
          (a) =>
            a.summary.toLowerCase().includes(q) ||
            a.entity.name.toLowerCase().includes(q) ||
            a.category.toLowerCase().includes(q),
        )
        .slice(0, MAX_RESULTS_PER_GROUP)
    : [];

  const hasResults = matchedSources.length > 0 || matchedEntities.length > 0 || matchedAlerts.length > 0;
  const closeAndReset = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative hidden lg:block" ref={containerRef}>
      <div className="relative">
        <span className="absolute -translate-y-1/2 pointer-events-none left-4 top-1/2">
          <svg
            className="fill-gray-500 dark:fill-gray-400"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
              fill=""
            />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar fuentes, entidades o alertas..."
          className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]"
        />
        <button className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          <span> ⌘ </span>
          <span> K </span>
        </button>
      </div>

      {open && q && (
        <div className="absolute z-50 mt-2 w-full xl:w-[430px] rounded-lg border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900 max-h-96 overflow-y-auto">
          {!hasResults && (
            <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Sin resultados para "{query}"</p>
          )}

          {matchedAlerts.length > 0 && (
            <div className="py-2">
              <p className="px-4 pb-1 text-xs font-medium uppercase text-gray-400">Alertas</p>
              {matchedAlerts.map((alert) => (
                <Link
                  key={alert.id}
                  to="/monitoreo/alertas"
                  onClick={closeAndReset}
                  className="block px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <span className="font-medium text-gray-800 dark:text-white/90">{alert.entity.name}</span>
                  <span className="text-gray-500 dark:text-gray-400"> — {alert.category}: {alert.summary}</span>
                </Link>
              ))}
            </div>
          )}

          {matchedSources.length > 0 && (
            <div className="py-2 border-t border-gray-100 dark:border-white/5">
              <p className="px-4 pb-1 text-xs font-medium uppercase text-gray-400">Fuentes</p>
              {matchedSources.map((source) => (
                <Link
                  key={source.id}
                  to="/monitoreo/fuentes"
                  onClick={closeAndReset}
                  className="block px-4 py-2 text-sm text-gray-800 hover:bg-gray-50 dark:text-white/90 dark:hover:bg-white/5"
                >
                  {source.name} <span className="text-gray-400">({source.type})</span>
                </Link>
              ))}
            </div>
          )}

          {matchedEntities.length > 0 && (
            <div className="py-2 border-t border-gray-100 dark:border-white/5">
              <p className="px-4 pb-1 text-xs font-medium uppercase text-gray-400">Entidades</p>
              {matchedEntities.map((entity) => (
                <Link
                  key={entity.id}
                  to="/monitoreo/entidades"
                  onClick={closeAndReset}
                  className="block px-4 py-2 text-sm text-gray-800 hover:bg-gray-50 dark:text-white/90 dark:hover:bg-white/5"
                >
                  {entity.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
