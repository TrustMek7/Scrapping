import { useEffect, useState } from "react";
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
import {
  createEntity,
  deleteEntity,
  fetchEntities,
  updateEntity,
  type MonitoredEntityItem,
} from "../../lib/api";

interface FormState {
  name: string;
  aliasesText: string;
}

const EMPTY_FORM: FormState = { name: "", aliasesText: "" };

function parseAliases(text: string): string[] {
  return text
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

export default function Entities() {
  const [entities, setEntities] = useState<MonitoredEntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MonitoredEntityItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MonitoredEntityItem | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    fetchEntities()
      .then(setEntities)
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

  const openEdit = (entity: MonitoredEntityItem) => {
    setEditing(entity);
    setForm({ name: entity.name, aliasesText: entity.aliases.join(", ") });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setFormError(null);
    const data = { name: form.name, aliases: parseAliases(form.aliasesText) };
    try {
      if (editing) {
        await updateEntity(editing.id, data);
        toast.success(`Entidad "${form.name}" actualizada.`);
      } else {
        await createEntity(data);
        toast.success(`Entidad "${form.name}" creada.`);
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

  const requestDelete = (entity: MonitoredEntityItem) => {
    setDeleteTarget(entity);
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { name } = deleteTarget;
    try {
      await deleteEntity(deleteTarget.id);
      setDeleteTarget(null);
      toast.success(`Entidad "${name}" eliminada.`);
      load();
    } catch (err) {
      setDeleteTarget(null);
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <PageMeta title="Entidades | Alertas Nación" description="Entidades monitoreadas por el sistema" />
      <PageBreadcrumb pageTitle="Entidades" />
      <div className="space-y-6">
        <ComponentCard title="Entidades monitoreadas">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreate}>
              Nueva entidad
            </Button>
          </div>

          {loading && <p className="text-gray-500 dark:text-gray-400">Cargando...</p>}
          {error && (
            <p className="text-error-500">
              {error} — ¿está corriendo el backend (<code>pnpm dev:backend</code>)?
            </p>
          )}
          {!loading && !error && entities.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400">
              No hay entidades registradas todavía. Creá la primera con "Nueva entidad".
            </p>
          )}
          {!loading && !error && entities.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Nombre
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Alias
                      </TableCell>
                      <TableCell isHeader className="px-4 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Acciones
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {entities.map((entity) => (
                      <TableRow key={entity.id}>
                        <TableCell className="px-5 py-4 text-start font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {entity.name}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <div className="flex flex-wrap gap-1">
                            {entity.aliases.length === 0 && <span className="text-gray-400">—</span>}
                            {entity.aliases.map((alias) => (
                              <Badge key={alias} size="sm" color="light">
                                {alias}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <div className="flex gap-3">
                            <button className="text-brand-500 hover:underline" onClick={() => openEdit(entity)}>
                              Editar
                            </button>
                            <button className="text-error-500 hover:underline" onClick={() => requestDelete(entity)}>
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
          {editing ? "Editar entidad" : "Nueva entidad"}
        </h4>
        <div className="space-y-4">
          <div>
            <Label htmlFor="entity-name">Nombre</Label>
            <Input id="entity-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Partido Renovación" />
          </div>
          <div>
            <Label htmlFor="entity-aliases">Alias (separados por coma)</Label>
            <Input
              id="entity-aliases"
              value={form.aliasesText}
              onChange={(e) => setForm({ ...form, aliasesText: e.target.value })}
              placeholder="Ej. PR, Renovación"
            />
          </div>
          {formError && <p className="text-sm text-error-500">{formError}</p>}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !form.name}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar entidad"
        message={`¿Eliminar la entidad "${deleteTarget?.name}"? Esto también borra sus alertas asociadas si las hubiera.`}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
}
