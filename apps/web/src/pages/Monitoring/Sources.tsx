import { useEffect, useRef, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Select from "../../components/form/Select";
import {
  createSource,
  deleteSource,
  fetchSources,
  importFacebookSourcesFromExcel,
  updateSource,
  type SourceItem,
} from "../../lib/api";
import type { SourceStatus, SourceType } from "@scrapping/shared";

const TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "WEBSITE", label: "Página web" },
  { value: "RSS", label: "RSS" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "OTHER", label: "Otra" },
];

const STATUS_OPTIONS: { value: SourceStatus; label: string }[] = [
  { value: "ACTIVE", label: "Activa" },
  { value: "DISABLED", label: "Deshabilitada" },
];

const STATUS_COLOR: Record<SourceStatus, "success" | "error" | "light"> = {
  ACTIVE: "success",
  ERROR: "error",
  DISABLED: "light",
};

interface FormState {
  name: string;
  type: SourceType;
  url: string;
  status: SourceStatus;
}

const EMPTY_FORM: FormState = { name: "", type: "WEBSITE", url: "", status: "ACTIVE" };

export default function Sources() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SourceItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SourceItem | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    fetchSources()
      .then(setSources)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (source: SourceItem) => {
    setEditing(source);
    setForm({ name: source.name, type: source.type, url: source.url, status: source.status });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateSource(editing.id, form);
        toast.success(`Fuente "${form.name}" actualizada.`);
      } else {
        await createSource({ name: form.name, type: form.type, url: form.url });
        toast.success(`Fuente "${form.name}" creada.`);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (source: SourceItem) => {
    setDeleteTarget(source);
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { name } = deleteTarget;
    try {
      await deleteSource(deleteTarget.id);
      setDeleteTarget(null);
      toast.success(`Fuente "${name}" eliminada.`);
      load();
    } catch (err) {
      setDeleteTarget(null);
      toast.error((err as Error).message);
    }
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await importFacebookSourcesFromExcel(file);

      if (result.errors.length > 0) {
        toast.error(`Importación parcial: ${result.errors[0]}`);
      }

      toast.success(result.message);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <>
      <PageMeta title="Fuentes | Alertas" description="Fuentes públicas configuradas para el monitor" />
      <PageBreadcrumb pageTitle="Fuentes" />
      <div className="space-y-6">
        <ComponentCard title="Fuentes registradas">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? "Importando..." : "Importar Excel"}
            </Button>
            <Button size="sm" onClick={openCreate}>
              Nueva fuente
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportExcel}
          />

          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            El Excel debe tener 2 columnas: la primera es el nombre de la fuente y la segunda el link.
            Se ignora la primera fila y se cuenta desde la fila 2. Todas las fuentes importadas serán de tipo Facebook.
          </p>

          {loading && <p className="text-gray-500 dark:text-gray-400">Cargando...</p>}
          {error && (
            <p className="text-error-500">
              {error} — ¿está corriendo el backend (<code>pnpm dev:backend</code>)?
            </p>
          )}
          {!loading && !error && sources.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400">
              No hay fuentes registradas todavía. Creá la primera con "Nueva fuente".
            </p>
          )}
          {!loading && !error && sources.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Nombre
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Tipo
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Link
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Estado
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Publicaciones
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Último error
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Acciones
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {sources.map((source) => (
                      <TableRow key={source.id}>
                        <TableCell className="px-5 py-4 text-start font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {source.name}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          {source.type}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <a href={source.url} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
                            Ver página ↗
                          </a>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <Badge size="sm" color={STATUS_COLOR[source.status]}>
                            {source.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          {source.publicationsCount}
                        </TableCell>
                        <TableCell className="px-4 py-3 max-w-xs truncate text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          {source.lastError ?? "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <div className="flex gap-3">
                            <button className="text-brand-500 hover:underline" onClick={() => openEdit(source)}>
                              Editar
                            </button>
                            <button className="text-error-500 hover:underline" onClick={() => requestDelete(source)}>
                              Eliminar
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </ComponentCard>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} className="max-w-md p-6">
        <h4 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
          {editing ? "Editar fuente" : "Nueva fuente"}
        </h4>
        <div className="space-y-4" key={editing?.id ?? "new"}>
          <div>
            <Label htmlFor="source-name">Nombre</Label>
            <Input id="source-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Diario La Voz" />
          </div>
          <div>
            <Label htmlFor="source-type">Tipo</Label>
            <Select options={TYPE_OPTIONS} defaultValue={form.type} onChange={(value) => setForm({ ...form, type: value as SourceType })} />
          </div>
          <div>
            <Label htmlFor="source-url">URL</Label>
            <Input id="source-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
          </div>
          {editing && (
            <div>
              <Label htmlFor="source-status">Estado</Label>
              <Select options={STATUS_OPTIONS} defaultValue={form.status} onChange={(value) => setForm({ ...form, status: value as SourceStatus })} />
            </div>
          )}
          {formError && <p className="text-sm text-error-500">{formError}</p>}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !form.name || !form.url}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar fuente"
        message={`¿Eliminar la fuente "${deleteTarget?.name}"? Esto también borra sus publicaciones asociadas si las hubiera.`}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
}
