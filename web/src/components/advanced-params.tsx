"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { JobOptions } from "@/lib/jobs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Fmt = JobOptions["formats"][number];

const FORMATS: Fmt[] = ["ply", "stl", "glb", "dxf", "xyz"];

interface Props {
  options: JobOptions;
  onChange: (o: JobOptions) => void;
}

/** Tiny helper: bind a slider to a numeric field on options. */
function Num({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </Label>
        <span className="text-xs tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AdvancedParams({ options, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const update = <K extends keyof JobOptions>(k: K, v: JobOptions[K]) =>
    onChange({ ...options, [k]: v });

  const toggleFormat = (fmt: Fmt) => {
    const has = options.formats.includes(fmt);
    const next = has
      ? options.formats.filter((f) => f !== fmt)
      : [...options.formats, fmt];
    update("formats", (next.length ? next : ["ply"]) as JobOptions["formats"]);
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="flex items-center justify-between">
          <span>Advanced parameters</span>
          <Button variant="ghost" size="sm" type="button">
            {open ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Export formats</Label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <Badge
                  key={f}
                  variant={options.formats.includes(f) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => toggleFormat(f)}
                >
                  {f.toUpperCase()}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Num
              label="Crystal X (mm)"
              value={options.size_x}
              min={20}
              max={200}
              step={1}
              onChange={(v) => update("size_x", v)}
            />
            <Num
              label="Crystal Y (mm)"
              value={options.size_y}
              min={20}
              max={200}
              step={1}
              onChange={(v) => update("size_y", v)}
            />
            <Num
              label="Crystal Z (mm)"
              value={options.size_z}
              min={20}
              max={200}
              step={1}
              onChange={(v) => update("size_z", v)}
            />
            <Num
              label="Margin X"
              value={options.margin_x}
              min={0}
              max={20}
              step={0.5}
              onChange={(v) => update("margin_x", v)}
            />
            <Num
              label="Margin Y"
              value={options.margin_y}
              min={0}
              max={20}
              step={0.5}
              onChange={(v) => update("margin_y", v)}
            />
            <Num
              label="Margin Z"
              value={options.margin_z}
              min={0}
              max={20}
              step={0.5}
              onChange={(v) => update("margin_z", v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Num
              label="Base density"
              value={options.base_density}
              min={0.05}
              max={1}
              step={0.01}
              onChange={(v) => update("base_density", v)}
            />
            <Num
              label="Max pts / pixel"
              value={options.max_points_per_pixel}
              min={1}
              max={12}
              step={1}
              onChange={(v) => update("max_points_per_pixel", v)}
            />
            <Num
              label="XY jitter"
              value={options.xy_jitter}
              min={0}
              max={1.5}
              step={0.05}
              onChange={(v) => update("xy_jitter", v)}
            />
            <Num
              label="Z layers"
              value={options.z_layers}
              min={1}
              max={12}
              step={1}
              onChange={(v) => update("z_layers", v)}
            />
            <Num
              label="Vol. thickness"
              value={options.volumetric_thickness}
              min={0}
              max={0.5}
              step={0.01}
              onChange={(v) => update("volumetric_thickness", v)}
            />
            <Num
              label="Z scale"
              value={options.z_scale}
              min={0.1}
              max={1}
              step={0.01}
              onChange={(v) => update("z_scale", v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Num
              label="Brightness"
              value={options.brightness}
              min={-0.5}
              max={0.5}
              step={0.01}
              onChange={(v) => update("brightness", v)}
            />
            <Num
              label="Contrast"
              value={options.contrast}
              min={0.5}
              max={2.5}
              step={0.01}
              onChange={(v) => update("contrast", v)}
            />
            <Num
              label="Gamma"
              value={options.gamma}
              min={0.3}
              max={3}
              step={0.01}
              onChange={(v) => update("gamma", v)}
            />
            <Num
              label="Depth gamma"
              value={options.depth_gamma}
              min={0.3}
              max={3}
              step={0.01}
              onChange={(v) => update("depth_gamma", v)}
            />
            <Num
              label="Point size (mm)"
              value={options.point_size_mm}
              min={0.02}
              max={0.3}
              step={0.01}
              onChange={(v) => update("point_size_mm", v)}
            />
            <Num
              label="Face strength"
              value={options.face_strength}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update("face_strength", v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Face-aware depth</Label>
              <Switch
                checked={options.face_aware}
                onCheckedChange={(v) => update("face_aware", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Remove background</Label>
              <Switch
                checked={options.remove_bg}
                onCheckedChange={(v) => update("remove_bg", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Invert depth</Label>
              <Switch
                checked={options.invert_depth}
                onCheckedChange={(v) => update("invert_depth", v)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Seed (for reproducibility)</Label>
            <Input
              type="number"
              value={options.seed}
              onChange={(e) => update("seed", Number(e.target.value) || 0)}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
