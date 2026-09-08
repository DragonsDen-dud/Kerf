"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import LengthInput from "./LengthInput";
import { Badge, Card, Chip, Field, Modal, NumberInput, SectionTitle } from "./ui";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentUrl,
  deleteAttachment,
  putAttachment,
} from "@/lib/attachments";
import {
  STALE_AFTER_DAYS,
  citation,
  costPerBar,
  currentPrice,
  daysSince,
  formatDate,
  formatMoney,
  basisSuffix,
} from "@/lib/pricing";
import {
  BASIS_LABELS,
  SOURCE_CONFIDENCE,
  SOURCE_LABELS,
  emptyMaterial,
  emptyPriceSource,
  newId,
  nowIso,
  type Material,
  type PriceBasis,
  type PriceRecord,
  type Project,
  type SourceKind,
} from "@/lib/types";
import { formatValue, unitAbbr } from "@/lib/units";

interface Props {
  project: Project;
  materials: Material[];
  /** Which materials are in use, so the Hoard can warn before deleting one. */
  usedMaterialIds: string[];
  saveMaterial: (material: Material) => void;
  removeMaterial: (id: string) => void;
  addPrice: (materialId: string, price: PriceRecord) => void;
  removePrice: (materialId: string, priceId: string) => void;
}

/**
 * THE HOARD — the material library. Every material carries the price in force
 * plus the evidence behind it, and a full price history so an old take-off can
 * still be explained months later.
 */
export default function HoardView({
  project,
  materials,
  usedMaterialIds,
  saveMaterial,
  removeMaterial,
  addPrice,
  removePrice,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Material | null>(null);
  const [search, setSearch] = useState("");

  const categories = useMemo(() => {
    const set = new Set(materials.map((m) => m.category.trim()).filter(Boolean));
    return [...set].sort();
  }, [materials]);

  const [category, setCategory] = useState<string>("");

  const visible = materials.filter((material) => {
    if (category && material.category.trim() !== category) return false;
    if (!search.trim()) return true;
    const haystack = `${material.name} ${material.category} ${material.notes}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  const openNew = () => {
    const material = emptyMaterial();
    setDraft(material);
    setEditingId(material.id);
  };

  const editing = materials.find((m) => m.id === editingId) ?? draft;

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle
          aside={<span className="text-xs text-slate-500">{materials.length} materials</span>}
        >
          The Hoard · materials &amp; prices
        </SectionTitle>
        <p className="mb-3 text-sm text-slate-400">
          Every price you save keeps its receipt — who quoted it, when, the reference number and a
          copy of the quote. Take-offs cite it automatically.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="field flex-1"
            placeholder="Search materials…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="button" className="btn-primary shrink-0" onClick={openNew}>
            + Add material
          </button>
        </div>

        {categories.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip active={category === ""} onClick={() => setCategory("")}>
              All
            </Chip>
            {categories.map((name) => (
              <Chip key={name} active={category === name} onClick={() => setCategory(name)}>
                {name}
              </Chip>
            ))}
          </div>
        ) : null}
      </Card>

      {visible.length === 0 ? (
        <Card className="text-center text-slate-400">
          <p className="text-lg font-semibold text-slate-200">
            {materials.length === 0 ? "The Hoard is empty" : "Nothing matches"}
          </p>
          <p className="mt-1 text-sm">
            {materials.length === 0
              ? "Add the stock you buy, with the price and where it came from."
              : "Try a different search or category."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              project={project}
              inUse={usedMaterialIds.includes(material.id)}
              onEdit={() => {
                setDraft(null);
                setEditingId(material.id);
              }}
            />
          ))}
        </div>
      )}

      {editing ? (
        <MaterialEditor
          material={editing}
          project={project}
          isNew={Boolean(draft && draft.id === editing.id)}
          inUse={usedMaterialIds.includes(editing.id)}
          onClose={() => {
            setEditingId(null);
            setDraft(null);
          }}
          saveMaterial={saveMaterial}
          removeMaterial={(id) => {
            removeMaterial(id);
            setEditingId(null);
            setDraft(null);
          }}
          addPrice={addPrice}
          removePrice={removePrice}
        />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- list card */

function MaterialCard({
  material,
  project,
  inUse,
  onEdit,
}: {
  material: Material;
  project: Project;
  inUse: boolean;
  onEdit: () => void;
}) {
  const price = currentPrice(material);
  const age = price ? daysSince(price.source.capturedAt) : Infinity;
  const stale = price ? age > STALE_AFTER_DAYS : false;

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-50">{material.name || "(unnamed)"}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {[material.category, `${formatValue(material.stockLength, project.unit)} ${unitAbbr(project.unit)} stock`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.1]"
          onClick={onEdit}
        >
          Edit
        </button>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        {price ? (
          <>
            <span className="text-2xl font-extrabold text-amber-300">
              {formatMoney(price.amount, project.currency)}
            </span>
            <span className="text-sm font-semibold text-amber-100/70">
              {basisSuffix(price.basis)}
            </span>
            {price.basis !== "per-bar" ? (
              <span className="text-xs text-slate-500">
                = {formatMoney(costPerBar(price, material.stockLength), project.currency)} per bar
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-lg font-bold text-rose-300">No price on record</span>
        )}
      </div>

      {price ? (
        <p className="mt-1 text-xs text-slate-400">{citation(price, SOURCE_LABELS)}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {price ? (
          <Badge tone={SOURCE_CONFIDENCE[price.source.kind] === "firm" ? "good" : "warn"}>
            {SOURCE_CONFIDENCE[price.source.kind]}
          </Badge>
        ) : (
          <Badge tone="bad">unpriced</Badge>
        )}
        {stale ? <Badge tone="warn">{Math.round(age)} days old</Badge> : null}
        {price?.source.attachmentId ? <Badge tone="good">proof attached</Badge> : null}
        {material.prices.length > 1 ? (
          <Badge>{material.prices.length} price records</Badge>
        ) : null}
        {inUse ? <Badge tone="brand">in this take-off</Badge> : null}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ editor */

function MaterialEditor({
  material,
  project,
  isNew,
  inUse,
  onClose,
  saveMaterial,
  removeMaterial,
  addPrice,
  removePrice,
}: {
  material: Material;
  project: Project;
  isNew: boolean;
  inUse: boolean;
  onClose: () => void;
  saveMaterial: (material: Material) => void;
  removeMaterial: (id: string) => void;
  addPrice: (materialId: string, price: PriceRecord) => void;
  removePrice: (materialId: string, priceId: string) => void;
}) {
  const [local, setLocal] = useState<Material>(material);
  const [adding, setAdding] = useState(isNew);

  // Keep the form live as prices are added from the child form.
  useEffect(() => setLocal(material), [material]);

  const patch = (changes: Partial<Material>) => setLocal((current) => ({ ...current, ...changes }));

  return (
    <Modal
      wide
      title={isNew ? "Add material" : local.name || "Material"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {!isNew ? (
            <button
              type="button"
              className="btn-ghost !text-rose-300"
              onClick={() => {
                const warning = inUse
                  ? "This material is used in the current take-off. Delete it anyway?"
                  : "Delete this material and its price history?";
                if (confirm(warning)) removeMaterial(local.id);
              }}
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => {
              saveMaterial(local);
              onClose();
            }}
          >
            Save material
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="mat-name">
            <input
              id="mat-name"
              className="field"
              value={local.name}
              placeholder='1" x 1" x 16ga square tube'
              onChange={(event) => patch({ name: event.target.value })}
            />
          </Field>
          <Field label="Category" htmlFor="mat-cat" hint="Steel, Aluminium, Timber…">
            <input
              id="mat-cat"
              className="field"
              value={local.category}
              placeholder="Steel"
              onChange={(event) => patch({ category: event.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <LengthInput
            id="mat-stock"
            label="Stock length"
            value={local.stockLength}
            unit={project.unit}
            onChange={(stockLength) => patch({ stockLength })}
          />
          <LengthInput
            id="mat-kerf"
            label="Default kerf"
            value={local.kerf}
            unit={project.unit}
            allowZero
            onChange={(kerf) => patch({ kerf })}
          />
          <LengthInput
            id="mat-trim"
            label="Default end trim"
            value={local.endTrim}
            unit={project.unit}
            allowZero
            onChange={(endTrim) => patch({ endTrim })}
          />
        </div>

        <Field label="Notes" htmlFor="mat-notes">
          <textarea
            id="mat-notes"
            className="field min-h-20"
            value={local.notes}
            placeholder="Finish, mill length, minimum order…"
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </Field>

        <div>
          <SectionTitle
            aside={
              <button
                type="button"
                className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200"
                onClick={() => setAdding((value) => !value)}
              >
                {adding ? "Cancel" : "+ New price"}
              </button>
            }
          >
            Pricing &amp; proof
          </SectionTitle>

          {adding ? (
            <PriceForm
              project={project}
              defaultStockLength={local.stockLength}
              onCancel={() => setAdding(false)}
              onSave={(price) => {
                // A brand-new material has to exist before a price can attach.
                if (!material.prices.length && isNew) saveMaterial(local);
                addPrice(local.id, price);
                setLocal((current) => ({ ...current, prices: [price, ...current.prices] }));
                setAdding(false);
              }}
            />
          ) : null}

          {local.prices.length === 0 && !adding ? (
            <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-slate-500">
              No price recorded yet. Add one so take-offs using this material can be costed and
              cited.
            </p>
          ) : null}

          <ul className="mt-3 space-y-3">
            {local.prices.map((price, index) => (
              <PriceRow
                key={price.id}
                price={price}
                project={project}
                stockLength={local.stockLength}
                current={index === 0}
                onRemove={() => {
                  if (!confirm("Remove this price record?")) return;
                  if (price.source.attachmentId) void deleteAttachment(price.source.attachmentId);
                  removePrice(local.id, price.id);
                  setLocal((current) => ({
                    ...current,
                    prices: current.prices.filter((p) => p.id !== price.id),
                  }));
                }}
              />
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- price row */

function PriceRow({
  price,
  project,
  stockLength,
  current,
  onRemove,
}: {
  price: PriceRecord;
  project: Project;
  stockLength: number;
  current: boolean;
  onRemove: () => void;
}) {
  const age = daysSince(price.source.capturedAt);
  const stale = age > STALE_AFTER_DAYS;

  return (
    <li
      className={`rounded-xl border p-3 ${
        current ? "border-amber-500/40 bg-amber-500/[0.06]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-slate-50">
            {formatMoney(price.amount, project.currency)}
          </span>
          <span className="text-sm text-slate-400">{BASIS_LABELS[price.basis]}</span>
          {price.basis !== "per-bar" ? (
            <span className="text-xs text-slate-500">
              = {formatMoney(costPerBar(price, stockLength), project.currency)} per bar
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {current ? <Badge tone="brand">in force</Badge> : <Badge>superseded</Badge>}
          {stale && current ? <Badge tone="warn">{Math.round(age)} days old</Badge> : null}
        </div>
      </div>

      <p className="mt-1.5 text-sm text-slate-300">{citation(price, SOURCE_LABELS)}</p>
      {price.source.note ? (
        <p className="mt-1 text-xs text-slate-500">{price.source.note}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
        {price.source.url ? (
          <a
            href={price.source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sky-300 hover:underline"
          >
            Open source link
          </a>
        ) : null}
        {price.source.attachmentId ? (
          <AttachmentLink
            id={price.source.attachmentId}
            name={price.source.attachmentName ?? "attachment"}
          />
        ) : null}
        <span className="text-slate-600">Recorded {formatDate(price.recordedAt)}</span>
        <button type="button" className="ml-auto text-rose-300" onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

function AttachmentLink({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    attachmentUrl(id).then((next) => {
      if (cancelled) {
        if (next) URL.revokeObjectURL(next);
        return;
      }
      revoked = next;
      setUrl(next);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [id]);

  if (!url) return <span className="text-slate-600">Proof saved on this device</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="text-emerald-300 hover:underline">
      View proof ({name})
    </a>
  );
}

/* -------------------------------------------------------------- price form */

function PriceForm({
  project,
  defaultStockLength,
  onSave,
  onCancel,
}: {
  project: Project;
  defaultStockLength: number;
  onSave: (price: PriceRecord) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const [basis, setBasis] = useState<PriceBasis>("per-bar");
  const [stockLength, setStockLength] = useState(defaultStockLength);
  const [source, setSource] = useState(emptyPriceSource());
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const patchSource = (changes: Partial<typeof source>) =>
    setSource((current) => ({ ...current, ...changes }));

  const save = async () => {
    if (amount <= 0) {
      setError("Enter the price.");
      return;
    }
    setSaving(true);
    setError("");

    const id = newId("prc");
    let attachmentId: string | undefined;
    let attachmentName: string | undefined;

    if (file) {
      try {
        await putAttachment(`att_${id}`, file);
        attachmentId = `att_${id}`;
        attachmentName = file.name;
      } catch (cause) {
        // The price is still worth saving without the picture.
        setError(
          cause instanceof Error
            ? `${cause.message} The price was saved without the attachment.`
            : "The attachment could not be saved.",
        );
      }
    }

    onSave({
      id,
      amount,
      basis,
      stockLength,
      recordedAt: nowIso(),
      source: { ...source, attachmentId, attachmentName },
    });
    setSaving(false);
  };

  return (
    <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Price" htmlFor="price-amount">
          <NumberInput
            id="price-amount"
            value={amount}
            onChange={setAmount}
            prefix={project.currency}
            placeholder="0.00"
          />
        </Field>
        <Field label="Priced" htmlFor="price-basis">
          <select
            id="price-basis"
            className="field"
            value={basis}
            onChange={(event) => setBasis(event.target.value as PriceBasis)}
          >
            {(Object.keys(BASIS_LABELS) as PriceBasis[]).map((key) => (
              <option key={key} value={key}>
                {BASIS_LABELS[key]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {basis === "per-bar" ? (
        <LengthInput
          label="…for a bar of this length"
          value={stockLength}
          unit={project.unit}
          onChange={setStockLength}
          hint="Lets the price stay right if you cut the job from a different length."
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Where it came from" htmlFor="price-kind">
          <select
            id="price-kind"
            className="field"
            value={source.kind}
            onChange={(event) => patchSource({ kind: event.target.value as SourceKind })}
          >
            {(Object.keys(SOURCE_LABELS) as SourceKind[]).map((key) => (
              <option key={key} value={key}>
                {SOURCE_LABELS[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supplier" htmlFor="price-supplier">
          <input
            id="price-supplier"
            className="field"
            value={source.supplier}
            placeholder="Acme Steel"
            onChange={(event) => patchSource({ supplier: event.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reference" htmlFor="price-ref" hint="Quote no., invoice no. or SKU">
          <input
            id="price-ref"
            className="field"
            value={source.reference}
            placeholder="Q-10432"
            onChange={(event) => patchSource({ reference: event.target.value })}
          />
        </Field>
        <Field label="Date of the price" htmlFor="price-date" hint="Not today — when it was quoted.">
          <input
            id="price-date"
            className="field"
            type="date"
            value={source.capturedAt}
            onChange={(event) => patchSource({ capturedAt: event.target.value })}
          />
        </Field>
      </div>

      <Field label="Link" htmlFor="price-url" hint="Product page, or a link to the quote">
        <input
          id="price-url"
          className="field"
          type="url"
          inputMode="url"
          value={source.url}
          placeholder="https://"
          onChange={(event) => patchSource({ url: event.target.value })}
        />
      </Field>

      <Field label="Note" htmlFor="price-note">
        <input
          id="price-note"
          className="field"
          value={source.note}
          placeholder="Includes delivery, valid 30 days…"
          onChange={(event) => patchSource({ note: event.target.value })}
        />
      </Field>

      <div>
        <span className="label">Proof of price</span>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fileInput.current?.click()}
          >
            {file ? "Change file" : "Attach photo or PDF"}
          </button>
          {file ? (
            <span className="text-xs text-emerald-300">
              {file.name} ({(file.size / 1024 / 1024).toFixed(1)}MB)
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              Snap the quote — up to {MAX_ATTACHMENT_BYTES / 1024 / 1024}MB, kept on this device.
            </span>
          )}
        </div>
      </div>

      {error ? <p className="text-xs text-amber-300">{error}</p> : null}

      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save price"}
        </button>
      </div>
    </div>
  );
}
