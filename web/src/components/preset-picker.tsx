"use client";

import type { JobOptions } from "@/lib/jobs";
import {
  CONTENT_PRESETS,
  LASER_PRESETS,
  type ContentPresetKey,
  type LaserPresetKey,
} from "@/lib/presets";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  options: JobOptions;
  onChange: (o: JobOptions) => void;
}

export function PresetPicker({ options, onChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Presets</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Subject</Label>
          <Select
            value={options.content_preset ?? ""}
            onValueChange={(v) =>
              onChange({
                ...options,
                content_preset: (v || undefined) as ContentPresetKey | undefined,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="(Custom)" />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_PRESETS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {options.content_preset && (
            <p className="text-xs text-muted-foreground">
              {
                CONTENT_PRESETS.find((p) => p.key === options.content_preset)
                  ?.description
              }
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Laser</Label>
          <Select
            value={options.laser_preset ?? ""}
            onValueChange={(v) => {
              const key = (v || undefined) as LaserPresetKey | undefined;
              const laser = LASER_PRESETS.find((p) => p.key === key);
              if (!laser) {
                onChange({ ...options, laser_preset: undefined });
                return;
              }
              const [sx, sy, sz] = laser.crystalSizeMm;
              onChange({
                ...options,
                laser_preset: key,
                size_x: sx,
                size_y: sy,
                size_z: sz,
                formats: Array.from(new Set([...options.formats, laser.defaultFormat])),
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="(Generic)" />
            </SelectTrigger>
            <SelectContent>
              {LASER_PRESETS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {options.laser_preset && (
            <p className="text-xs text-muted-foreground">
              {
                LASER_PRESETS.find((p) => p.key === options.laser_preset)
                  ?.notes
              }
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
